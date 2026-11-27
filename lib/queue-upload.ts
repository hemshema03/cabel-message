import {render} from './domain';
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
   const cinRows=contacts.filter(contact=>contact.cin).map(({customer_code,cin})=>({customer_code,cin}));
   if(cinRows.length){const synced=await db.rpc('update_customer_cins',{rows:cinRows});if(synced.error)throw synced.error;}
   const lookup=await db.from('customers').select('id,customer_code,is_active,opted_out').in('customer_code',batch.map(row=>row.customer_code));
   if(lookup.error)throw lookup.error;
   const deliveries=batch.flatMap(row=>{
    const contact=lookup.data?.find(c=>c.customer_code===row.customer_code);
    if(!contact)throw new Error('Unable to find an uploaded customer. Try sending again.');
    const delivery=uploadDelivery(id,row,contact,campaign.template);return delivery?[delivery]:[];
   });
   if(deliveries.length){const saved=await db.from('message_deliveries').upsert(deliveries,{onConflict:'campaign_id,customer_id',ignoreDuplicates:true});if(saved.error)throw saved.error;}
  }
  await publishReminder(db,id);
 }
 return reminderCounts(db,id,rows.length);
}

async function publishReminder(db:SupabaseClient,id:string){
  const published=await db.from('campaigns').update({status:'QUEUED'}).eq('id',id).eq('status','DRAFT');
  if(published.error)throw published.error;
  const latest=await db.from('campaigns').select('status').eq('id',id).single();if(latest.error)throw latest.error;
  if(stoppedCampaign(latest.data.status)){const skipped=await db.from('message_deliveries').update({status:'SKIPPED',last_error:'Stopped by operator'}).eq('campaign_id',id).eq('status','QUEUED');if(skipped.error)throw skipped.error;throw new Error('This campaign was stopped. No further queued messages will be sent.');}
}

async function reminderCounts(db:SupabaseClient,id:string,selected:number){
 const count=await db.from('message_deliveries').select('id',{head:true,count:'exact'}).eq('campaign_id',id);
 if(count.error)throw count.error;
 if(!count.count){const finished=await db.from('campaigns').update({status:'COMPLETED'}).eq('id',id).eq('status','QUEUED');if(finished.error)throw finished.error;}
 return {recipient_count:count.count??0,skipped_count:selected-(count.count??0)};
}

export async function queueBalanceReminders(db:SupabaseClient,id:string){
 const {data:campaign,error}=await db.from('campaigns').select('template,status,target_filter').eq('id',id).single();
 if(error)throw error;
 if(campaign.target_filter?.source!=='ACCOUNT_BALANCE'||stoppedCampaign(campaign.status))
  throw new Error('This reminder campaign is unavailable.');
 const ids:string[]=campaign.target_filter.ids;
 if(campaign.status==='DRAFT'){
  const accrued=await db.rpc('accrue_customer_bills');
  if(accrued.error)throw accrued.error;
  const deliveries=[];
  for(let offset=0;offset<ids.length;offset+=100){
   const {data,error}=await db.from('customers').select('id,name,area,balance,phone,is_active,opted_out').in('id',ids.slice(offset,offset+100));
   if(error)throw error;
   for(const row of data??[]){
    if(Number(row.balance)<=0||!row.is_active||row.opted_out||!/^[1-9]\d{10,14}$/.test(row.phone))continue;
    deliveries.push({campaign_id:id,customer_id:row.id,recipient_phone:row.phone,
     rendered_message:render(campaign.template,{name:row.name,area:row.area||'your area',amount:String(row.balance)}),status:'QUEUED'});
   }
  }
  if(deliveries.length){
   const saved=await db.from('message_deliveries').upsert(deliveries,{onConflict:'campaign_id,customer_id',ignoreDuplicates:true});
   if(saved.error)throw saved.error;
  }
  await publishReminder(db,id);
 }
 const counts=await reminderCounts(db,id,ids.length);
 return {...counts,message:counts.recipient_count
  ?counts.recipient_count+' reminder(s) queued. '+counts.skipped_count+' skipped.'
  :'No reminders queued. The selected customers are now paid or ineligible.'};
}
