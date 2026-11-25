import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {waha,WahaError,WahaTransportError} from '../lib/waha';
import {extractWahaMessageId,responseShape} from '../lib/waha-response';
import {messageRequest,validateImage} from '../lib/message-image';
import {processQueue} from '../lib/queue';
import {canClaimBefore,sendTimeoutBefore,QUEUE_BUDGET_MS,WAHA_SEND_TIMEOUT_MS,FINALIZE_RESERVE_MS} from '../lib/queue-timing';

// Synthetic fields mirror the supplied PowerShell NOWEB response; no real contacts/keys.
const noweb={key:{remoteJid:'19999999999@s.whatsapp.net',fromMe:true,id:'MOCK_MESSAGE_ID'},message:{extendedTextMessage:{text:'private mock message'}}};
const canonical='true_19999999999@c.us_MOCK_MESSAGE_ID';

test('NOWEB message key becomes an ack-compatible ID; WEBJS IDs retain compatibility',()=>{
 assert.equal(extractWahaMessageId(noweb),canonical);
 assert.equal(extractWahaMessageId({key:{id:'RAW_ID'}}),'RAW_ID');
 assert.equal(extractWahaMessageId({id:'serialized-id',...noweb}),'serialized-id');
 assert.equal(extractWahaMessageId({id:{_serialized:'webjs-id'}}),'webjs-id');
 for(const value of [null,{},[],{id:''},{id:{}},{key:{id:123}},{message:{key:{id:'quoted-message-must-not-count'}}}])assert.equal(extractWahaMessageId(value),null);
});

test('text request matches PowerShell JSON and uses a 30s timeout; logs contain structure only',async t=>{
 const oldUrl=process.env.WAHA_BASE_URL,oldKey=process.env.WAHA_API_KEY;
 process.env.WAHA_BASE_URL='http://mock.invalid:3010/';process.env.WAHA_API_KEY='private-mock-key';
 const logs:string[]=[];const timeouts:number[]=[];let now=1000;
 t.mock.method(console,'info',(line:string)=>logs.push(line));
 t.mock.method(Date,'now',()=>now);
 t.mock.method(AbortSignal,'timeout',(ms:number)=>{timeouts.push(ms);return new AbortController().signal;});
 t.mock.method(globalThis,'fetch',async(input:unknown,init:RequestInit)=>{
  assert.equal(input,'http://mock.invalid:3010/api/sendText');assert.equal(init.method,'POST');
  assert.deepEqual(init.headers,{'Content-Type':'application/json','X-Api-Key':'private-mock-key'});
  assert.deepEqual(JSON.parse(String(init.body)),{session:'default',chatId:'19999999999@c.us',text:'private mock message'});
  now+=20_000;return Response.json(noweb,{status:201});
 });
 try{
  const request=messageRequest('default','19999999999','private mock message');
  assert.equal(extractWahaMessageId(await waha(request.path,request.body)),canonical);
  assert.deepEqual(timeouts,[30_000]);
  const log=JSON.parse(logs[0]);assert.equal(log.http_status,201);assert.equal(log.duration_ms,20_000);
  assert.deepEqual(log.response_fields,['key','message']);assert.deepEqual(log.key_fields,['fromMe','id','remoteJid']);
  for(const value of ['private-mock-key','19999999999','private mock message','MOCK_MESSAGE_ID'])assert.ok(!logs.join('').includes(value));
  assert.deepEqual(responseShape({'private-mock-key':true,'19999999999':'secret',key:{id:'hidden'}}).response_fields,['key']);
 }finally{
  if(oldUrl===undefined)delete process.env.WAHA_BASE_URL;else process.env.WAHA_BASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.WAHA_API_KEY;else process.env.WAHA_API_KEY=oldKey;
 }
});

test('transport failures expose safe codes and HTTP status, never raw network details',async t=>{
 const oldUrl=process.env.WAHA_BASE_URL,oldKey=process.env.WAHA_API_KEY;
 process.env.WAHA_BASE_URL='http://mock.invalid';process.env.WAHA_API_KEY='private-key';
 const logs:string[]=[];t.mock.method(console,'info',(line:string)=>logs.push(line));
 const fake=t.mock.method(globalThis,'fetch',async()=>{throw new DOMException('private-key 19999999999 secret-message','TimeoutError');});
 try{
  await assert.rejects(waha('/api/sendText',{}),e=>e instanceof WahaTransportError&&e.code==='TIMEOUT'&&e.message.includes('30000ms'));
  fake.mock.mockImplementation(async()=>new Response('not-json secret-message',{status:200}));
  await assert.rejects(waha('/api/sendImage',{}),e=>e instanceof WahaTransportError&&e.code==='INVALID_JSON');
  fake.mock.mockImplementation(async()=>Response.json({message:'upstream rejection'},{status:422}));
  await assert.rejects(waha('/api/sendText',{}),e=>e instanceof WahaError&&e.status===422);
  for(const value of ['private-key','19999999999','secret-message'])assert.ok(!logs.join('').includes(value));
  assert.equal(JSON.parse(logs[1]).http_status,200);
 }finally{
  if(oldUrl===undefined)delete process.env.WAHA_BASE_URL;else process.env.WAHA_BASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.WAHA_API_KEY;else process.env.WAHA_API_KEY=oldKey;
 }
});

test('queue persists NOWEB text/image success and holds all ambiguous outcomes without resending',async t=>{
 t.mock.method(console,'info',()=>{});
 const image=validateImage({mimetype:'image/png',filename:'mock.png',data:Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64')});
 for(const mode of ['text','image','timeout','server-error','invalid-json','no-id','rejected']){
  const calls:{name:string;args:Record<string,unknown>}[]=[];let status='QUEUED',attempts=0,savedId:unknown;
  const db={async rpc(name:string,args:Record<string,unknown>){calls.push({name,args});
   if(name==='acquire_queue')return {data:true};
   if(name==='claim_queue'){if(status!=='QUEUED')return {data:[]};status='PROCESSING';return {data:[{id:'mock-delivery',campaign_id:'mock-campaign',recipient_phone:'19999999999',rendered_message:'private mock message'}]};}
   if(name==='begin_queue_send')return {data:true};
   if(name==='finish_queue'){status=String(args.outcome);savedId=args.message_id;}
   return {data:null};
  },from:()=>({select:()=>({eq:()=>({single:async()=>({data:{target_filter:mode==='image'?{image}:{}}})})})})} as unknown as SupabaseClient;
  const send:typeof waha=async(path,body,options)=>{
   if(path.startsWith('/api/sessions/'))return {status:'WORKING'};
   attempts++;assert.equal(path,mode==='image'?'/api/sendImage':'/api/sendText');
   assert.ok(options!.timeoutMs!>=15_000&&options!.timeoutMs!<=30_000);
   if(mode==='image')assert.equal((body as {caption:string}).caption,'private mock message');
   if(mode==='timeout')throw new WahaTransportError('TIMEOUT','Mock timeout');
   if(mode==='server-error')throw new WahaError(500,'Mock server error');
   if(mode==='invalid-json')throw new WahaTransportError('INVALID_JSON','Mock malformed response');
   if(mode==='rejected')throw new WahaError(400,'Mock validation error');
   return mode==='no-id'?{}:noweb;
  };
  await processQueue(db,{send,pause:async()=>{}});
  const expected=mode==='text'||mode==='image'?'SENT':mode==='rejected'?'FAILED':'UNKNOWN';
  assert.equal(status,expected);assert.equal(savedId,expected==='SENT'?canonical:null);
  await processQueue(db,{send,pause:async()=>{}});
  assert.equal(attempts,1);assert.equal(calls.filter(c=>c.name==='finish_queue').length,1);
 }
});

test('queue budgets cap slow sends and leave final writes inside the 60s function and 90s lease',async t=>{
 const started=1000,deadline=started+QUEUE_BUDGET_MS;
 assert.ok(QUEUE_BUDGET_MS<60_000&&QUEUE_BUDGET_MS<90_000);
 assert.equal(sendTimeoutBefore(deadline,started),WAHA_SEND_TIMEOUT_MS);
 assert.equal(sendTimeoutBefore(deadline,deadline-35_000),20_000);
 assert.ok(canClaimBefore(deadline,deadline-45_000));assert.ok(!canClaimBefore(deadline,deadline-44_999));
 assert.equal(deadline-35_000+sendTimeoutBefore(deadline,deadline-35_000)+FINALIZE_RESERVE_MS,deadline);
 t.mock.method(console,'info',()=>{});
 const db={rpc:()=>{throw new Error('Must not claim when deadline is exhausted');}} as unknown as SupabaseClient;
 assert.deepEqual(await processQueue(db,{deadline:Date.now()+10_000}),{busy:false,processed:0});
});
