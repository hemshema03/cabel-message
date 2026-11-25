import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import type {SupabaseClient} from '@supabase/supabase-js';
import {processQueue} from '../lib/queue';
import {WahaError,waha} from '../lib/waha';
import {createHmac} from 'node:crypto';
import {validWebhook} from '../lib/queue-security';
import {POST as processPost} from '../app/api/queue/process/route';
import {POST as webhookPost} from '../app/api/waha/webhook/route';

test('processor bounds batches, saves IDs, holds uncertain sends, and releases lease',async()=>{
 for(const mode of ['success','timeout','rejected','missing-id','save-failure','busy','stopped']){
  const calls:{name:string;args:Record<string,unknown>}[]=[];let claims=0,sends=0;
  const db={async rpc(name:string,args:Record<string,unknown>){calls.push({name,args});
   if(name==='acquire_queue')return {data:mode!=='busy'};
   if(name==='claim_queue')return {data:claims++<7?[{id:'delivery',campaign_id:'campaign',recipient_phone:'19999999999',rendered_message:'mock'}]:[]};
   if(name==='begin_queue_send')return {data:mode!=='stopped'};
   if(name==='finish_queue'&&mode==='save-failure')return {error:{code:'MOCK_FAILURE'}};
   return {data:null};
  },from:()=>({select:()=>({eq:()=>({single:async()=>({data:{target_filter:{}}})})})})} as unknown as SupabaseClient;
  const send=async(path:string)=>{if(path.startsWith('/api/sessions/'))return {status:'WORKING'};sends++;
   if(mode==='timeout')throw new Error('Mock timeout');if(mode==='rejected')throw new WahaError(400,'Mock rejection');
   return mode==='missing-id'?{}:{id:'mock-message-id'};
  };
  const run=processQueue(db,{send,pause:async()=>{}});
  if(mode==='save-failure')await assert.rejects(run);else await run;
  assert.ok(sends<=5);if(mode==='stopped'||mode==='busy')assert.equal(sends,0);
  if(mode!=='busy')assert.equal(calls.at(-1)?.name,'release_queue');
  const finish=calls.find(c=>c.name==='finish_queue');
  if(mode==='success')assert.equal(finish?.args.message_id,'mock-message-id');
  if(mode==='timeout'||mode==='missing-id')assert.equal(finish?.args.outcome,'UNKNOWN');
  if(mode==='rejected')assert.equal(finish?.args.outcome,'FAILED');
 }
});

test('API rejects invalid queue credentials and unauthenticated or tampered webhooks',async()=>{
 process.env.QUEUE_PROCESS_SECRET='test-only';process.env.WAHA_WEBHOOK_SECRET='test-hmac';
 assert.equal((await processPost(new Request('http://localhost/api/queue/process',{method:'POST',headers:{authorization:'Bearer wrong'},body:'{}'}))).status,401);
 assert.equal((await processPost(new Request('http://localhost/api/queue/process',{method:'POST',headers:{authorization:'Bearer test-only'},body:'{"campaignId":"bad"}'}))).status,400);
 assert.equal((await webhookPost(new Request('http://localhost/api/waha/webhook',{method:'POST',body:'{}'}))).status,401);
 const raw=JSON.stringify({event:'message.ack',session:'wrong-session',payload:{id:'mock',ack:2}});
 const signature=createHmac('sha512','test-hmac').update(raw).digest('hex');
 assert.ok(validWebhook(raw,signature,'test-hmac'));assert.ok(!validWebhook(raw+' ',signature,'test-hmac'));
 assert.equal((await webhookPost(new Request('http://localhost/api/waha/webhook',{method:'POST',headers:{'x-webhook-hmac':signature},body:raw}))).status,200);
});

test('WAHA transport stores upstream error with key and recipient redacted (mock fetch)',async()=>{
 const original=globalThis.fetch;const oldUrl=process.env.WAHA_BASE_URL,oldKey=process.env.WAHA_API_KEY;
 process.env.WAHA_BASE_URL='http://mock.invalid';process.env.WAHA_API_KEY='test-secret';
 globalThis.fetch=async()=>Response.json({message:'Rejected test-secret 919999999999'},{status:400});
 try{await assert.rejects(waha('/api/sendText',{}),error=>error instanceof WahaError&&error.message.includes('Rejected')&&!error.message.includes('test-secret')&&!error.message.includes('919999999999'));}
 finally{globalThis.fetch=original;process.env.WAHA_BASE_URL=oldUrl;process.env.WAHA_API_KEY=oldKey;}
});

test('authenticated API and signed acknowledgement use only mocked database HTTP',async()=>{
 const original=globalThis.fetch;
 const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://mock.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='mock-service-key';
 process.env.QUEUE_PROCESS_SECRET='test-only';process.env.WAHA_WEBHOOK_SECRET='test-hmac';process.env.WAHA_SESSION='default';
 const requests:string[]=[];
 globalThis.fetch=async(input)=>{
  const url=String(input);requests.push(url);
  if(url.endsWith('/rpc/acquire_queue'))return Response.json(false);
  if(url.endsWith('/rpc/record_delivery_ack'))return Response.json(null);
  throw new Error('Unexpected mocked request');
 };
 try{
  const result=await processPost(new Request('http://localhost/api/queue/process',{method:'POST',headers:{authorization:'Bearer test-only'},body:'{}'}));
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{busy:true,processed:0});
  const raw=JSON.stringify({event:'message.ack',session:'default',payload:{id:'mock-id',ack:2}});
  const signature=createHmac('sha512','test-hmac').update(raw).digest('hex');
  const ack=await webhookPost(new Request('http://localhost/api/waha/webhook',{method:'POST',headers:{'x-webhook-hmac':signature},body:raw}));
  assert.equal(ack.status,200);assert.equal(requests.length,2);
 }finally{globalThis.fetch=original;process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;}
});

test('real PostgreSQL migration: claims, interrupted recovery, stop, acknowledgements, permissions',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
  await db.exec(readFileSync('supabase/migrations/0001_initial.sql','utf8').replace('create extension if not exists pgcrypto;',''));
  await db.exec(readFileSync('supabase/migrations/0002_serverless_queue.sql','utf8'));
  const q=async(sql:string)=>(await db.query<Record<string,unknown>>(sql)).rows;
  await db.exec("insert into customers(id,customer_code,name,phone) values('00000000-0000-0000-0000-000000000001','mock','Mock','19999999999');insert into campaigns(id,title,type,template,status) values('00000000-0000-0000-0000-000000000002','Mock','CUSTOM','Mock','QUEUED');insert into message_deliveries(id,customer_id,campaign_id) values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');");
  const owner="'00000000-0000-0000-0000-000000000004'",delivery="'00000000-0000-0000-0000-000000000003'";
  assert.equal((await q(`select acquire_queue(${owner}) as ok`))[0].ok,true);
  assert.equal((await q("select acquire_queue('00000000-0000-0000-0000-000000000005') as ok"))[0].ok,false);
  assert.equal((await q(`select * from claim_queue(${owner})`)).length,1);
  assert.equal((await q(`select * from claim_queue(${owner})`)).length,0);
  await db.exec("update message_deliveries set claimed_at=now()-interval '2 minutes';select recover_queue();");
  assert.equal((await q('select status from message_deliveries'))[0].status,'QUEUED');
  await q(`select * from claim_queue(${owner})`);
  assert.equal((await q(`select begin_queue_send(${owner},${delivery}) as ok`))[0].ok,true);
  await db.exec("update message_deliveries set claimed_at=now()-interval '2 minutes';select recover_queue();");
  assert.equal((await q('select status from message_deliveries'))[0].status,'UNKNOWN');
  assert.equal((await q(`select * from claim_queue(${owner})`)).length,0);
  await db.exec('select settle_queue();');
  assert.equal((await q('select status from campaigns'))[0].status,'NEEDS_REVIEW');
  // Fixture reset only: simulate a successful in-flight send with an early webhook.
  await db.exec(`update message_deliveries set status='PROCESSING',claim_token=${owner};select record_delivery_ack('default','mock-id',3);select finish_queue(${owner},${delivery},'SENT','mock-id');select record_delivery_ack('default','mock-id',1);select record_delivery_ack('default','mock-id',2);`);
  const row=(await q('select * from message_deliveries'))[0];assert.equal(row.status,'READ');assert.ok(row.sent_at);assert.ok(row.delivered_at);assert.ok(row.read_at);
  await db.exec(`update message_deliveries set status='PROCESSING',claim_token=${owner};update campaigns set status='CANCELLED';`);
  assert.equal((await q(`select begin_queue_send(${owner},${delivery}) as ok`))[0].ok,false);
  assert.equal((await q('select status from message_deliveries'))[0].status,'SKIPPED');
  assert.equal((await q("select has_function_privilege('authenticated','claim_queue(uuid,uuid)','execute') as ok"))[0].ok,false);
  await assert.rejects(db.query('select * from claim_delivery()'));
 }finally{await db.close();}
});
