import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {previewUnpaid,unpaidRecipient,uploadDelivery} from '../lib/unpaid-upload';
import {queueUpload} from '../lib/queue-upload';

const headers=['Customer Name','STB No / User ID','Mobile Number','Balance Amount'];
const raw=(code:string,amount='450')=>({'Customer Name':'Example','STB No / User ID':code,'Mobile Number':'9876543210','Balance Amount':amount});
const person=(code:string)=>unpaidRecipient.parse({customer_code:code,name:'New name',phone:'9876543210',unpaid_amount:450});
test('unpaid template needs no month or stored payment status',()=>{
 const rows=previewUnpaid(headers,[raw('A'),raw('B','0'),raw('A'),raw('C',''),{...raw('D'),'Mobile Number':'invalid'}]);
 assert.equal(rows.length,5);assert.equal(rows[0].error,'');assert.equal(rows[1].error,'');
 assert.ok(rows[2].error);assert.ok(rows[3].error);assert.ok(rows[4].error);
 assert.throws(()=>previewUnpaid(['Customer Name'],[raw('A')]));
});
test('delivery snapshots use uploaded contact and amount without a monthly bill link',()=>{
 const delivery=uploadDelivery('campaign',person('A'),{id:'customer',is_active:true,opted_out:false},'Hi {{name}}, pay {{amount}}');
 assert.equal(delivery?.monthly_bill_id,null);assert.equal(delivery?.rendered_message,'Hi New name, pay 450');assert.equal(delivery?.recipient_phone,'919876543210');
 assert.equal(uploadDelivery('campaign',person('A'),{id:'customer',is_active:true,opted_out:true},'Hi'),null);
});

type RecordRow=Record<string,unknown>;
function fakeDatabase(){
 const tables:Record<string,RecordRow[]>={campaigns:[],customers:[],message_deliveries:[]};let failDelivery=false;
 const db={from(table:string){
  assert.ok(tables[table],`Unexpected table: ${table}`);
  let operation='select',payload:RecordRow[]=[];let single=false,count=false;let conflict='id';const filters:[string,unknown][]=[];let inFilter:[string,unknown[]]|undefined;
  const query={
   select(_columns?:string,options?:{count?:string}){count=!!options?.count;return query;},
   eq(key:string,value:unknown){filters.push([key,value]);return query;},
   in(key:string,value:unknown[]){inFilter=[key,value];return query;},
   single(){single=true;return query;},
   update(value:RecordRow){operation='update';payload=[value];return query;},
   upsert(value:RecordRow|RecordRow[],options:{onConflict:string;ignoreDuplicates:boolean}){assert.equal(options.ignoreDuplicates,true);operation='upsert';payload=Array.isArray(value)?value:[value];conflict=options.onConflict;return query;},
   then(resolve:(value:unknown)=>unknown){
    const matched=()=>tables[table].filter(row=>filters.every(([k,v])=>row[k]===v)&&(!inFilter||inFilter[1].includes(row[inFilter[0]])));
    if(operation==='upsert'){
     if(table==='message_deliveries'&&failDelivery){failDelivery=false;return Promise.resolve({error:new Error('Interrupted')}).then(resolve);}
     for(const row of payload)if(!tables[table].some(existing=>conflict.split(',').every(key=>existing[key]===row[key])))tables[table].push({id:`${table}-${tables[table].length}`,...row});
    }
    if(operation==='update')matched().forEach(row=>Object.assign(row,payload[0]));
    return Promise.resolve({data:single?structuredClone(matched()[0]):structuredClone(matched()),count:count?matched().length:null,error:null}).then(resolve);
   },
  };return query;
 }};
 return {db:db as unknown as SupabaseClient,tables,interrupt(){failDelivery=true;}};
}
test('only selected upload rows queue; retry is idempotent and a fresh upload sends again',async()=>{
 const {db,tables,interrupt}=fakeDatabase();
 tables.customers.push({id:'a',customer_code:'A',name:'Old name',phone:'919999999999',is_active:true,opted_out:false},{id:'b',customer_code:'B',is_active:true,opted_out:false});
 const campaign={id:'first',status:'DRAFT',template:'Hi {{name}}, {{amount}}',target_filter:{source:'UNPAID_UPLOAD',rows:[person('A')]}};
 tables.campaigns.push(campaign);
 interrupt();await assert.rejects(queueUpload(db,'first'),/Interrupted/);assert.equal(campaign.status,'DRAFT');
 assert.equal((await queueUpload(db,'first')).recipient_count,1);
 assert.equal((await queueUpload(db,'first')).recipient_count,1);assert.equal(tables.message_deliveries.length,1);
 assert.equal(tables.message_deliveries[0].customer_id,'a');assert.equal(tables.message_deliveries[0].recipient_phone,'919876543210');
 assert.equal(tables.customers[0].name,'Old name');
 tables.campaigns.push({...campaign,id:'second',status:'DRAFT'});
 await queueUpload(db,'second');assert.equal(tables.message_deliveries.length,2);
});
test('opted-out customers are skipped and an empty campaign completes',async()=>{
 const {db,tables}=fakeDatabase();tables.customers.push({id:'a',customer_code:'A',is_active:true,opted_out:true});
 tables.campaigns.push({id:'first',status:'DRAFT',template:'Hi',target_filter:{source:'UNPAID_UPLOAD',rows:[person('A')]}});
 assert.deepEqual(await queueUpload(db,'first'),{recipient_count:0,skipped_count:1});assert.equal(tables.campaigns[0].status,'COMPLETED');
});
