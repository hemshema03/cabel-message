import type {SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {messageRequest,validateImage} from './message-image';
import {waha,session,WahaError} from './waha';

export function queueLog(event:string,fields:Record<string,unknown>={}){
 // Only call with identifiers, counters and codes, never request bodies or raw exceptions.
 console.info(JSON.stringify({scope:'whatsapp_queue',event,...fields}));
}
export async function processQueue(db:SupabaseClient,options:{campaignId?:string;deadline?:number;send?:typeof waha;pause?:(ms:number)=>Promise<void>}={}){
 const token=randomUUID(),deadline=options.deadline??Date.now()+45000,send=options.send??waha;
 const rpc=async(name:string,args:Record<string,unknown>={})=>{const r=await db.rpc(name,args);if(r.error)throw new Error(`Queue database operation failed: ${name} (${r.error.code})`);return r.data;};
 if(!await rpc('acquire_queue',{owner:token}))return {busy:true,processed:0};
 let processed=0,preflightDone=false;
 queueLog('batch_started',{batch:token,campaign:options.campaignId??null});
 try{
  await rpc('recover_queue');
  const state=await send('/api/sessions/'+encodeURIComponent(session()));
  if(state.status!=='WORKING')throw new Error('WAHA session is not WORKING; queue retained');
  preflightDone=true;
  while(processed<5&&Date.now()<deadline-37000){
   const rows=await rpc('claim_queue',{owner:token,campaign:options.campaignId??null});
   const d=rows?.[0];if(!d)break;processed++;
   queueLog('claimed',{batch:token,delivery:d.id,campaign:d.campaign_id,attempt:d.attempt_count});
   let outcome:{status:string;message_id?:string;error?:string};
   let dispatched=false;
   try{
    const c=await db.from('campaigns').select('target_filter').eq('id',d.campaign_id).single();
    if(c.error)throw new Error('Cannot load campaign');
    const image=c.data.target_filter?.image?validateImage(c.data.target_filter.image):undefined;
    const request=messageRequest(session(),d.recipient_phone,d.rendered_message,image);
    // This transaction rechecks eligibility and records intent BEFORE any network send.
    if(!await rpc('begin_queue_send',{owner:token,delivery:d.id}))continue;
    dispatched=true;
    const response=await send(request.path,request.body);
    const id=typeof response.id==='string'?response.id:response.id?._serialized;
    outcome=id?{status:'SENT',message_id:id}:{status:'UNKNOWN',error:'WAHA returned success without a message ID; reconcile before retry'};
   }catch(error){
    outcome={status:dispatched?'UNKNOWN':'FAILED',error:error instanceof Error?error.message:'Unknown processing error'};
    // Only explicit rejection before acceptance is treated as a definite failure.
    if(error instanceof WahaError&&[400,401,403,404,422].includes(error.status))outcome.status='FAILED';
   }
   await rpc('finish_queue',{owner:token,delivery:d.id,outcome:outcome.status,message_id:outcome.message_id??null,failure:outcome.error??null,session_name:session()});
   queueLog('delivery_finished',{batch:token,delivery:d.id,status:outcome.status});
   // A bounded, awaited delay; the database also enforces spacing across invocations.
   if(Date.now()+5000<deadline)await (options.pause??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(5000);
  }
  await rpc('settle_queue');
  queueLog('batch_finished',{batch:token,processed});
  return {busy:false,processed};
 }catch(error){
  if(!preflightDone){
   const failure=error instanceof Error?error.message:'Queue preflight failed';
   const saved=await db.rpc('record_queue_problem',{campaign:options.campaignId??null,failure});
   if(saved.error)queueLog('diagnostic_save_failed',{batch:token,code:saved.error.code});
  }
  queueLog('batch_failed',{batch:token,code:error instanceof WahaError?`WAHA_HTTP_${error.status}`:error instanceof Error&&error.message.startsWith('Queue database operation failed:')?error.message:'PREFLIGHT_OR_NETWORK_ERROR'});
  throw error;
 }finally{await rpc('release_queue',{owner:token});}
}
