import {after} from 'next/server';
import {queueDatabase} from '@/lib/queue-db';
import {processQueue,queueLog} from '@/lib/queue';
// Cache Components requires the default Node.js runtime; explicit runtime exports are rejected.
export const maxDuration=60;
import { authorized, database } from '@/lib/db';
import { customer,bill,month,safeCell } from '@/lib/domain';
import { waha,session } from '@/lib/waha';
import { z } from 'zod';
import {readDefaultImage,saveDefaultImage} from '@/lib/default-image-store';
import {messageImage,validateImage} from '@/lib/message-image';
import ExcelJS from 'exceljs';
import {queueResult} from '@/lib/queue-result';
import {previewUnpaid,unpaidRecipient} from '@/lib/unpaid-upload';
import {stopCampaign} from '@/lib/stop-campaign';
import {queueUpload} from '@/lib/queue-upload';
import {bulkPayment,paymentFilter} from '@/lib/payments';
import {areaAudience,readAllPages} from '@/lib/area-messaging';

async function handle(req:Request,{params}:{params:Promise<{path:string[]}>}){try{
const deadline=Date.now()+45000;
const kickQueue=(campaignId:string)=>after(async()=>{try{if(Date.now()<deadline-37000)await processQueue(queueDatabase(),{campaignId,deadline});}catch{queueLog('kickoff_failed',{campaign:campaignId,code:'PROCESS_FAILED'});}});
const {path}=await params;const route=path.join('/');const url=new URL(req.url);
if(route==='login'&&req.method==='POST'){const data=z.object({email:z.string().email(),password:z.string().min(1)}).parse(await req.json());const db=await database();const result=await db.auth.signInWithPassword(data);if(result.error)throw result.error;return Response.json({ok:true});}
const db=await authorized();
const body=req.method==='GET'?null:req.headers.get('content-type')?.includes('application/json')?await req.json():null;
const result=async(q:PromiseLike<{data:unknown,error:unknown}>)=>{const r=await q;if(r.error)throw r.error;return Response.json(r.data);};
if(route==='settings/default-image'&&req.method==='GET')return Response.json({image:await readDefaultImage()},{headers:{'Cache-Control':'no-store'}});
if(route==='settings/default-image'&&req.method==='POST'){const input=z.object({image:messageImage.nullable()}).parse(body);const image=input.image?validateImage(input.image):null;await saveDefaultImage(image);return Response.json({image},{headers:{'Cache-Control':'no-store'}});}
if(route==='logout'){await db.auth.signOut();return Response.json({ok:true});}
if(route==='waha/status')return Response.json(await waha('/api/sessions/'+encodeURIComponent(session())));
if(route==='areas'&&req.method==='GET'){
const rows=await readAllPages(async offset=>{const r=await db.from('customers').select('area').order('id').range(offset,offset+99);if(r.error)throw r.error;return r.data??[];},100000);
return Response.json([...new Set(rows.map(r=>r.area as string).filter(a=>a&&a.trim()))].sort((a,b)=>a.localeCompare(b)));
}
if(route==='area-recipients'&&req.method==='GET'){
const input=areaAudience.parse(Object.fromEntries(url.searchParams));
const rows=await readAllPages(async offset=>{
 if(input.kind==='unpaid'){const r=await db.from('monthly_bills').select('unpaid_amount,payment_status,bill_month,customers!inner(id,name,phone,area,is_active,opted_out)').eq('bill_month',input.month!).eq('customers.area',input.area).eq('customers.is_active',true).eq('customers.opted_out',false).neq('payment_status','PAID').gt('unpaid_amount',0).order('id').range(offset,offset+99);if(r.error)throw r.error;return (r.data??[]).map(({customers,...b})=>({...b,...(Array.isArray(customers)?customers[0]:customers)}));}
 const r=await db.from('customers').select('id,name,phone,area,is_active,opted_out').eq('area',input.area).eq('is_active',true).eq('opted_out',false).order('id').range(offset,offset+99);if(r.error)throw r.error;return r.data??[];
});return Response.json(rows.filter(r=>/^[1-9]\d{10,14}$/.test(r.phone)));
}
if(route==='imports/preview'){const form=await req.formData();const file=form.get('file');if(!(file instanceof File)||file.size>5000000)throw new Error('Choose an .xlsx file under 5 MB');const book=new ExcelJS.Workbook();await book.xlsx.load(await file.arrayBuffer());const sheet=book.worksheets[0];if(!sheet||sheet.rowCount>10001)throw new Error('Maximum 10,000 rows');const headers=(sheet.getRow(1).values as unknown[]).slice(1).map(String);const rows:Record<string,string>[]=[];sheet.eachRow((r,n)=>{if(n>1){const row:Record<string,string>={};headers.forEach((h,i)=>row[h]=r.getCell(i+1).text);rows.push(row);}});if(form.get('kind')==='UNPAID')return Response.json({rows:previewUnpaid(headers,rows)});const existing=await readAllPages(async offset=>{const r=await db.from('customers').select('customer_code').order('id').range(offset,offset+99);if(r.error)throw r.error;return r.data??[];},100000);return Response.json({headers,rows,existingCodes:existing.map(c=>c.customer_code)});}
if(route==='unpaid/campaigns'&&req.method==='POST'){
 const input=z.object({id:z.string().uuid(),file_name:z.string().min(1).max(255),template:z.string().trim().min(1).max(4000),image:messageImage.nullish(),rows:z.array(unpaidRecipient).min(1).max(10000)}).parse(body);
 if(new Set(input.rows.map(row=>row.customer_code)).size!==input.rows.length)throw new Error('Select each STB / User ID only once.');
 if(input.image)validateImage(input.image);
 const saved=await db.from('campaigns').upsert({id:input.id,title:'Unpaid Excel - '+input.file_name,type:'PAYMENT_REMINDER',template:input.template,target_filter:{source:'UNPAID_UPLOAD',file_name:input.file_name,rows:input.rows,...(input.image?{image:input.image}:{})}},{onConflict:'id',ignoreDuplicates:true});
 if(saved.error)throw saved.error;
 return Response.json({id:input.id});
}
if(route==='imports/commit'){const input=z.object({kind:z.enum(['CUSTOMERS','UNPAID']),file_name:z.string(),rows:z.array(z.record(z.string(),z.unknown())).max(10000)}).parse(body);if(input.kind==='CUSTOMERS'){const unique=new Map<string,ReturnType<typeof customer.parse>>();for(const row of input.rows){const code=String(row.customer_code??'').trim();if(!unique.has(code))unique.set(code,customer.parse(row));}const candidates=[...unique.values()];const recipients=[];for(let offset=0;offset<candidates.length;offset+=100){const saved=await db.from('customers').upsert(candidates.slice(offset,offset+100),{onConflict:'customer_code',ignoreDuplicates:true}).select('*');if(saved.error)throw saved.error;recipients.push(...(saved.data??[]));}if(recipients.length){const logged=await db.from('import_batches').insert({kind:input.kind,file_name:input.file_name,row_count:recipients.length});if(logged.error)throw logged.error;}return Response.json({recipients,added:recipients.length,skipped:input.rows.length-recipients.length});}const seen=new Set();const rows=input.rows.map(r=>{const c=customer.parse(r);if(seen.has(c.customer_code))throw new Error('Duplicate customer code '+c.customer_code);seen.add(c.customer_code);return input.kind==='UNPAID'?{...c,...bill.parse(r)}:c;});const imported=await db.rpc('commit_import',{...input,rows});if(imported.error)throw imported.error;const recipients=[];for(let offset=0;offset<rows.length;offset+=100){const batch=rows.slice(offset,offset+100);const lookup=await db.from('customers').select('*').in('customer_code',batch.map(r=>r.customer_code));if(lookup.error)throw lookup.error;for(const c of lookup.data??[]){const r=batch.find(r=>r.customer_code===c.customer_code);recipients.push({...r,...c});}}return Response.json({recipients});}
if(route==='customers'&&req.method==='POST'){const saved=await db.from('customers').insert(customer.parse(body)).select().single();if(saved.error?.code==='23505')return Response.json({error:'This STB / User ID is already in All customers.'},{status:409});if(saved.error)throw saved.error;return Response.json(saved.data);}
if(path[0]==='customers'&&path[1]&&req.method==='PATCH')return result(db.from('customers').update(customer.partial().parse(body)).eq('id',z.string().uuid().parse(path[1])).select());
if(route==='bills/mark-paid'&&req.method==='POST'){const input=bulkPayment.parse(body);return result(db.from('monthly_bills').update({payment_status:'PAID',unpaid_amount:0}).in('id',input.ids).eq('bill_month',input.bill_month).neq('payment_status','PAID').select('id,customer_id'));}
if(path[0]==='bills'&&path[1]&&req.method==='PATCH')return result(db.from('monthly_bills').update(bill.partial().parse(body)).eq('id',z.string().uuid().parse(path[1])).select());
if(route==='campaigns'&&req.method==='POST'){const data=z.object({title:z.string().min(1),type:z.enum(['PAYMENT_REMINDER','BREAKDOWN','MAINTENANCE','RESTORED','CUSTOM']),template:z.string().min(1).max(4000),bill_month:month.optional(),target_filter:z.object({image:messageImage.optional(),area:z.string().optional(),ids:z.array(z.string().uuid()).min(1).max(10000)})}).parse(body);if(data.target_filter.image)validateImage(data.target_filter.image);return result(db.from('campaigns').insert(data).select().single());}
if(path[0]==='campaigns'&&path[2]==='send'&&req.method==='POST'){const input=z.object({confirmed:z.literal(true),allow_resend:z.boolean().default(false)}).parse(body);const status=await waha('/api/sessions/'+encodeURIComponent(session()));if(status.status!=='WORKING')throw new Error('WAHA session is not WORKING');const uploaded=await db.from('campaigns').select('target_filter').eq('id',path[1]).single();if(uploaded.error)throw uploaded.error;if(uploaded.data.target_filter?.source==='UNPAID_UPLOAD'){const queued=await queueUpload(db,path[1]);kickQueue(path[1]);return Response.json(queued);}const queued=await db.rpc('queue_campaign',{campaign:path[1],allow_resend:input.allow_resend});if(queued.error)throw queued.error;const [campaign,deliveries]=await Promise.all([db.from('campaigns').select('target_filter').eq('id',path[1]).single(),db.from('message_deliveries').select('id',{count:'exact',head:true}).eq('campaign_id',path[1])]);if(campaign.error)throw campaign.error;if(deliveries.error)throw deliveries.error;const count=deliveries.count??0;if(count===0){const cancelled=await db.from('campaigns').update({status:'CANCELLED'}).eq('id',path[1]).eq('status','QUEUED');if(cancelled.error)throw cancelled.error;}kickQueue(path[1]);return Response.json(queueResult(campaign.data.target_filter?.ids?.length??0,count));}
if(path[0]==='campaigns'&&['cancel','delete'].includes(path[2])&&req.method==='POST'){
 z.object({confirmed:z.literal(true)}).parse(body);const id=z.string().uuid().parse(path[1]);
 await stopCampaign(db,id,path[2]==='delete');
 return Response.json({ok:true});
}
if(path[0]==='campaigns'&&path[2]==='results'&&req.method==='GET'){
 const id=z.string().uuid().parse(path[1]);const found=await db.from('campaigns').select('id,title,status,created_at,target_filter').eq('id',id).neq('status','DELETED').maybeSingle();
 if(found.error)throw found.error;if(!found.data)return Response.json({error:'This message history was deleted or could not be found.'},{status:404});
 const rows=await readAllPages(async offset=>{const r=await db.from('message_deliveries').select('id,status,recipient_phone,rendered_message,last_error,sent_at,waha_message_id,delivered_at,read_at,created_at,customers(name,customer_code,area)').eq('campaign_id',id).order('created_at').order('id').range(offset,offset+99);if(r.error)throw r.error;return r.data??[];},100000);
 const {target_filter,...campaign}=found.data;
 const snapshot=new Map<string,{name:string;customer_code:string;area:string}>((target_filter?.rows??[]).map((r:{name:string;customer_code:string;area:string})=>[r.customer_code,{name:r.name,customer_code:r.customer_code,area:r.area}]));
 return Response.json({campaign,rows:rows.map(row=>{const contact=Array.isArray(row.customers)?row.customers[0]:row.customers;return {...row,customers:snapshot.get(contact?.customer_code)??contact};})});
}
if(route==='export'){const table=url.searchParams.get('kind')==='customers'?'customers':'monthly_bills';let q=db.from(table).select(table==='customers'?'*':'*,customers(*)');if(table==='monthly_bills')q=q.eq('bill_month',month.parse(url.searchParams.get('month')));const {data,error}=await q;if(error)throw error;const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Results');const rows=(data??[]).map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,safeCell(typeof v==='object'?JSON.stringify(v):v)])));if(rows.length){sheet.columns=Object.keys(rows[0]).map(key=>({header:key,key,width:24}));sheet.addRows(rows);}return new Response(await book.xlsx.writeBuffer(),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename=results.xlsx'}});}
if(route==='dashboard'){const [customers,queued,accepted,imports]=await Promise.all([db.from('customers').select('id',{count:'exact',head:true}),db.from('message_deliveries').select('id',{count:'exact',head:true}).in('status',['QUEUED','PROCESSING','SENDING']),db.from('message_deliveries').select('id',{count:'exact',head:true}).in('status',['ACCEPTED','SENT','DELIVERED','READ']),db.from('import_batches').select('*').order('created_at',{ascending:false}).limit(5)]);for(const r of [customers,queued,accepted,imports])if(r.error)throw r.error;return Response.json({total:customers.count,queued:queued.count,accepted:accepted.count,imports:imports.data});}
if(['customers','bills','campaigns'].includes(route)){const page=Math.max(0,Number(url.searchParams.get('page'))||0);let q=db.from(route==='bills'?'monthly_bills':route).select(route==='bills'?'*,customers(*)':route==='campaigns'?'id,title,type,status,bill_month,created_at,updated_at':'*').order('created_at',{ascending:false}).order('id').range(page*50,page*50+49);if(route==='campaigns')q=q.neq('status','DELETED');if(route==='bills'){q=q.eq('bill_month',month.parse(url.searchParams.get('month')));const state=paymentFilter.parse(url.searchParams.get('payment')??'unpaid');if(state==='unpaid')q=q.neq('payment_status','PAID');if(state==='paid')q=q.eq('payment_status','PAID');}return result(q);}
return Response.json({error:'Not found'},{status:404});
}catch(e){const message=e instanceof Error?e.message:'Database request failed';return Response.json({error:message},{status:message==='Unauthorized'?401:message==='Forbidden'?403:400});}}
export {handle as GET,handle as POST,handle as PATCH};
