import {stoppedCampaign} from './message-history';
import type {SupabaseClient} from '@supabase/supabase-js';
import {unpaidRecipient,uploadDelivery} from './unpaid-upload';

// Draft deliveries cannot be claimed by the worker. Publish only after every batch
// is saved; the unique campaign/customer key makes retries safe after an interruption.
export async function queueUpload(db:SupabaseClient,id:string){
 const result=await db.from('campaigns').select('*').eq('id',id).single();
 if(result.error)throw result.error;
 const campaign=result.data;
 if(campaign.target_filter?.source!=='UNPAID_UPLOAD')throw new Error('Not an uploaded reminder campaign.');
 if(stoppedCampaign(campaign.status))throw new Error('This campaign was cancelled. Upload a new file to send again.');
 const rows=unpaidRecipient.array().min(1).max(10000).parse(campaign.target_filter.rows);
 if(campaign.status==='DRAFT'){
  for(let offset=0;offset<rows.length;offset+=100){
   const batch=rows.slice(offset,offset+100);
   const contacts=batch.map(({unpaid_amount,...contact})=>{void unpaid_amount;return contact;});
   const inserted=await db.from('customers').upsert(contacts,{onConflict:'customer_code',ignoreDuplicates:true});
   if(inserted.error)throw inserted.error;
   const lookup=await db.from('customers').select('id,customer_code,is_active,opted_out').in('customer_code',batch.map(row=>row.customer_code));
   if(lookup.error)throw lookup.error;
   const deliveries=batch.flatMap(row=>{
    const contact=lookup.data?.find(c=>c.customer_code===row.customer_code);
    if(!contact)throw new Error('Unable to find an uploaded customer. Try sending again.');
    const delivery=uploadDelivery(id,row,contact,campaign.template);return delivery?[delivery]:[];
   });
   if(deliveries.length){const saved=await db.from('message_deliveries').upsert(deliveries,{onConflict:'campaign_id,customer_id',ignoreDuplicates:true});if(saved.error)throw saved.error;}
  }
  const published=await db.from('campaigns').update({status:'QUEUED'}).eq('id',id).eq('status','DRAFT');
  if(published.error)throw published.error;
  const latest=await db.from('campaigns').select('status').eq('id',id).single();if(latest.error)throw latest.error;
  if(stoppedCampaign(latest.data.status)){const skipped=await db.from('message_deliveries').update({status:'SKIPPED',last_error:'Stopped by operator'}).eq('campaign_id',id).eq('status','QUEUED');if(skipped.error)throw skipped.error;throw new Error('This campaign was stopped. No further queued messages will be sent.');}
 }
 const count=await db.from('message_deliveries').select('id',{head:true,count:'exact'}).eq('campaign_id',id);
 if(count.error)throw count.error;
 if(!count.count){const finished=await db.from('campaigns').update({status:'COMPLETED'}).eq('id',id).eq('status','QUEUED');if(finished.error)throw finished.error;}
 return {recipient_count:count.count??0,skipped_count:rows.length-(count.count??0)};
}
