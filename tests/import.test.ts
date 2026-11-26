import {test} from 'node:test';
import assert from 'node:assert/strict';
import {suggestMapping} from '../lib/import-mapping';
import {eligible} from '../components/import-recipients';
import {reviewCustomers} from '../lib/customer-import';
import {customer} from '../lib/domain';

const templateHeaders=['User Name','STB No / User ID','CAN / CAF ID','MSO / ISP','PP User ID','CIN','Mobile Number','Address','Area','Balance Amount','Discount Amount','Created Date/Time','Status'];
const templateMapping=suggestMapping(templateHeaders,['customer_code','name','phone','address','area']);
const templateRow=(id:number)=>({'User Name':`Customer ${id}`,'STB No / User ID':`STB-${id}`,'Mobile Number':'9876543210',Address:'Example address',Area:'North'});
test('provided customer template maps User Name and STB instead of CIN',()=>{
 assert.equal(templateMapping.name,'User Name');assert.equal(templateMapping.customer_code,'STB No / User ID');
 const review=reviewCustomers([templateRow(1)],templateMapping,[]);
 assert.equal(review.pending[0].error,'');assert.equal(review.pending[0].data.phone,'919876543210');
});
test('CIN maps separately from STB and preserves leading zeroes',()=>{
 const mapping=suggestMapping(templateHeaders,['customer_code','cin','name','phone']);
 assert.equal(mapping.cin,'CIN');assert.equal(mapping.customer_code,'STB No / User ID');
 const review=reviewCustomers([{...templateRow(1),CIN:' 000123 '}],mapping,[]);
 assert.equal(review.pending[0].data.cin,'000123');
 assert.equal(review.pending[0].data.customer_code,'STB-1');
 assert.equal(suggestMapping(['CIN'],['customer_code','cin']).customer_code,'');
 assert.equal(customer.parse({customer_code:'A',name:'Example',phone:'9876543210'}).cin,'');
});
test('reupload stages only nonempty CIN updates for existing customers',()=>{
 const mapping=suggestMapping(templateHeaders,['customer_code','cin','name','phone']);
 const review=reviewCustomers([
  {...templateRow(1),CIN:' 000123 ','Mobile Number':'invalid'},
  {...templateRow(1),CIN:'OTHER'},
  {...templateRow(2),CIN:' '},
 ],mapping,['STB-1','STB-2']);
 assert.equal(review.pending.length,0);
 assert.deepEqual(review.cinUpdates,[{customer_code:'STB-1',cin:'000123'}]);
});
test('reuploading a full directory shows only the five extra customers',()=>{
 const rows=Array.from({length:1019},(_,i)=>templateRow(i));
 const existing=rows.slice(0,1014).map(row=>row['STB No / User ID']);
 const review=reviewCustomers(rows,templateMapping,existing);
 assert.equal(review.existingCount,1014);assert.equal(review.pending.length,5);
 assert.deepEqual(review.pending.map(row=>row.data.customer_code),['STB-1014','STB-1015','STB-1016','STB-1017','STB-1018']);
 assert.equal(review.pending[0].rowNumber,1016);
 assert.equal(reviewCustomers(rows,templateMapping,rows.map(row=>row['STB No / User ID'])).pending.length,0);
});
test('skips repeated IDs and existing invalid rows but keeps separate accounts sharing a phone',()=>{
 const review=reviewCustomers([{...templateRow(0),'Mobile Number':''},templateRow(1),{...templateRow(1),'STB No / User ID':' STB-1 '},templateRow(2)],templateMapping,['STB-0']);
 assert.equal(review.existingCount,1);assert.equal(review.duplicateCount,1);assert.equal(review.pending.length,2);assert.ok(review.pending.every(row=>!row.error));
});
test('invalid new customers remain visible for correction; manual identity fields reject whitespace',()=>{
 const review=reviewCustomers([{...templateRow(1),'Mobile Number':'bad'}],templateMapping,[]);
 assert.ok(review.pending[0].error);
 assert.throws(()=>customer.parse({customer_code:' ',name:'Example',phone:'9876543210'}));
});
test('matches operator export without confusing plan and balance amounts',()=>{const mapping=suggestMapping(['Customer Name','STB No / User ID','CAN / CAF ID','Mobile Number','Area','Plan Amount','Balance Amount','Expiry Date'],['customer_code','name','phone','area','unpaid_amount','due_date','bill_month']);assert.equal(mapping.customer_code,'STB No / User ID');assert.equal(mapping.unpaid_amount,'Balance Amount');assert.equal(mapping.phone,'Mobile Number');assert.equal(mapping.due_date,'');assert.equal(mapping.bill_month,'');});
test('recipient eligibility excludes inactive, opted out, paid and zero balance',()=>{const r={id:'one',name:'Example',phone:'919876543210',area:'North',is_active:true,opted_out:false,unpaid_amount:450,payment_status:'UNPAID'};assert.equal(eligible(r,true),true);assert.equal(eligible({...r,opted_out:true},true),false);assert.equal(eligible({...r,is_active:false},true),false);assert.equal(eligible({...r,payment_status:'PAID'},true),false);assert.equal(eligible({...r,unpaid_amount:0},true),false);});
