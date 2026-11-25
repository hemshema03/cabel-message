import type {SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {messageRequest,validateImage} from './message-image';
import {waha,session,WahaError} from './waha';
import {sendDelayMs} from './queue-config';
import {extractWahaMessageId} from './waha-response';
import {canClaimBefore,QUEUE_BUDGET_MS,sendTimeoutBefore,MIN_SEND_TIMEOUT_MS} from './queue-timing';

export function queueLog(event:string,fields:Record<string,unknown>={}){
 // Only call with identifiers, counters and codes, never request bodies or raw exceptions.
 console.info(JSON.stringify({scope:'whatsapp_queue',event,...fields}));
}
export async function processQueue(db:SupabaseClient,options:{campaignId?:string;deadline?:number;send?:typeof waha;pause?:(ms:number)=>Promise<void>}={}){
 const token=randomUUID(),deadline=options.deadline??Date.now()+QUEUE_BUDGET_MS,send=options.send??waha;
 const delay=sendDelayMs();
 if(!canClaimBefore(deadline)){queueLog('batch_deferred',{batch:token,reason:'INSUFFICIENT_TIME'});return {busy:false,processed:0};}
 const rpc=async(name:string,args:Record<string,unknown>={})=>{const r=await db.rpc(name,args);if(r.error)throw new Error(`Queue database operation failed: ${name} (${r.error.code})`);return r.data;};
 if(!await rpc('acquire_queue',{owner:token}))return {busy:true,processed:0};
 let processed=0,preflightDone=false;
 queueLog('batch_started',{batch:token,campaign:options.campaignId??null});
 try{
  await rpc('recover_queue');
  const state=await send('/api/sessions/'+encodeURIComponent(session()));
  if(state.status!=='WORKING')throw new Error('WAHA session is not WORKING; queue retained');
  preflightDone=true;
  while(processed<5&&canClaimBefore(deadline)){
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
    if(!await rpc('begin_queue_send',{owner:token,delivery:d.id,delay_ms:delay}))continue;
    const timeoutMs=sendTimeoutBefore(deadline);
    // A local budget exhaustion is definitely before dispatch; never send a
    // request that cannot leave time to persist the outcome and release leases.
    if(timeoutMs<MIN_SEND_TIMEOUT_MS)throw new Error('Queue deadline exhausted before WAHA dispatch; no send attempted');
    dispatched=true;
    const response=await send(request.path,request.body,{timeoutMs});
    const id=extractWahaMessageId(response);
    outcome=id?{status:'SENT',message_id:id}:{status:'UNKNOWN',error:'WAHA returned success without a message ID; reconcile before retry'};
   }catch(error){
    outcome={status:dispatched?'UNKNOWN':'FAILED',error:error instanceof Error?error.message:'Unknown processing error'};
    // Only explicit rejection before acceptance is treated as a definite failure.
    if(error instanceof WahaError&&[400,401,403,404,422].includes(error.status))outcome.status='FAILED';
   }
   await rpc('finish_queue',{owner:token,delivery:d.id,outcome:outcome.status,message_id:outcome.message_id??null,failure:outcome.error??null,session_name:session()});
   queueLog('delivery_finished',{batch:token,delivery:d.id,status:outcome.status});
   // A bounded, awaited delay; the database also enforces spacing across invocations.
   if(canClaimBefore(deadline,Date.now()+delay))await (options.pause??(ms=>new Promise(resolve=>setTimeout(resolve,ms))))(delay);
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
