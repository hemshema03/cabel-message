import type {SupabaseClient} from '@supabase/supabase-js';

export async function stopCampaign(db:SupabaseClient,id:string,remove:boolean){
 // A tombstone prevents stale upload retries from recreating deleted history.
 const stopping=await db.from('campaigns').update({status:remove?'DELETED':'CANCELLED'}).eq('id',id).neq('status','DELETED');
 if(stopping.error)throw stopping.error;
 const skipped=await db.from('message_deliveries').update({status:'SKIPPED',last_error:'Stopped by operator'}).eq('campaign_id',id).eq('status','QUEUED');
 if(skipped.error)throw skipped.error;
}
