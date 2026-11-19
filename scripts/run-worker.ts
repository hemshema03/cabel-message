import {canSendCampaign} from '../lib/message-history';
import { createClient } from '@supabase/supabase-js';
import {messageRequest,validateImage,type MessageImage} from '../lib/message-image';
import { waha,session } from '../lib/waha';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
const delay=Number(process.env.SEND_DELAY_MS??5000);
async function main(){
for(;;){try{const state=await waha('/api/sessions/'+encodeURIComponent(session()));if(state.status!=='WORKING')throw new Error('Session not ready');const {data,error}=await db.rpc('claim_delivery');if(error)throw error;const d=data?.[0];if(d){const {data:c}=await db.from('customers').select('*').eq('id',d.customer_id).single();const {data:b}=d.monthly_bill_id?await db.from('monthly_bills').select('*').eq('id',d.monthly_bill_id).single():{data:null};let outcome:Record<string,unknown>;if(!c?.is_active||c.opted_out||(b&&(b.payment_status==='PAID'||Number(b.unpaid_amount)===0)))outcome={status:'SKIPPED'};else{try{let image:MessageImage|undefined;const campaign=await db.from('campaigns').select('target_filter,status').eq('id',d.campaign_id).single();if(campaign.error)throw campaign.error;if(!canSendCampaign(campaign.data.status)){outcome={status:'SKIPPED',last_error:'Stopped by operator'};}else{if(campaign.data.target_filter?.image)image=validateImage(campaign.data.target_filter.image);const request=messageRequest(session(),d.recipient_phone,d.rendered_message,image);const response=await waha(request.path,request.body);outcome={status:'ACCEPTED',waha_message_id:response.id??null,sent_at:new Date().toISOString()};}}catch(e){outcome={status:'UNKNOWN',last_error:String(e)};}}const saved=await db.from('message_deliveries').update(outcome).eq('id',d.id);if(saved.error)throw saved.error;
const {count}=await db.from('message_deliveries').select('id',{count:'exact',head:true}).eq('campaign_id',d.campaign_id).in('status',['QUEUED','SENDING']);if(count===0)await db.from('campaigns').update({status:'COMPLETED'}).eq('id',d.campaign_id).in('status',['QUEUED','RUNNING']);}
}catch(e){console.error(String(e));}await new Promise(r=>setTimeout(r,delay));}
}
main().catch(error=>{console.error(String(error));process.exitCode=1;});
