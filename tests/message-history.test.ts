import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {canSendCampaign,filterDeliveries,type DeliveryResult} from '../lib/message-history';
import {stopCampaign} from '../lib/stop-campaign';

test('recipient search and filters combine across the whole campaign',()=>{
 const rows:DeliveryResult[]=Array.from({length:1100},(_,i)=>({id:String(i),status:i===1099?'FAILED':'ACCEPTED',recipient_phone:`91987654${i}`,rendered_message:'Reminder',last_error:null,sent_at:null,created_at:'2026-11-19',customers:{name:`Customer ${i}`,customer_code:`STB-${i}`,area:i===1099?'North':'South'}}));
 assert.equal(filterDeliveries(rows,'stb-1099','FAILED','North')[0].id,'1099');
 assert.equal(filterDeliveries(rows,'stb-1099','ACCEPTED','North').length,0);
 assert.equal(filterDeliveries(rows,'919876541099','','')[0].id,'1099');
 assert.equal(filterDeliveries(rows,'','','').length,1100);
});
test('worker sends only active queues, never stopped or deleted campaigns',()=>{
 assert.equal(canSendCampaign('QUEUED'),true);assert.equal(canSendCampaign('RUNNING'),true);
 for(const status of ['CANCELLED','DELETED','DRAFT','COMPLETED'])assert.equal(canSendCampaign(status),false);
});
test('stopping skips only waiting deliveries; deleting cannot be undone by a later stop',async()=>{
 const campaign={id:'one',status:'QUEUED'};const deliveries=[{campaign_id:'one',status:'QUEUED'},{campaign_id:'one',status:'SENDING'},{campaign_id:'one',status:'ACCEPTED'},{campaign_id:'other',status:'QUEUED'}];
 const db={from(table:string){let changes={};const conditions:((row:Record<string,unknown>)=>boolean)[]=[];const query={update(values:object){changes=values;return query;},eq(key:string,value:unknown){conditions.push(row=>row[key]===value);return query;},neq(key:string,value:unknown){conditions.push(row=>row[key]!==value);return query;},then(resolve:(value:unknown)=>unknown){for(const row of table==='campaigns'?[campaign]:deliveries)if(conditions.every(condition=>condition(row)))Object.assign(row,changes);return Promise.resolve({error:null}).then(resolve);}};return query;}} as unknown as SupabaseClient;
 await stopCampaign(db,'one',false);assert.equal(campaign.status,'CANCELLED');assert.deepEqual(deliveries.map(row=>row.status),['SKIPPED','SENDING','ACCEPTED','QUEUED']);
 await stopCampaign(db,'one',true);await stopCampaign(db,'one',false);assert.equal(campaign.status,'DELETED');
});
