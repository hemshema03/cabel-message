import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bulkPayment,paymentFilter} from '../lib/payments';
const id='11111111-1111-4111-8111-111111111111';
test('bulk payment requires explicit confirmation, valid month and a nonempty selection',()=>{
 const input={ids:[id],bill_month:'2026-11',confirmed:true};
 assert.equal(bulkPayment.safeParse(input).success,true);
 for(const bad of [{...input,ids:[]},{...input,ids:['not-a-bill']},{...input,confirmed:false},{...input,bill_month:'2026-13'},{...input,bill_month:undefined}])assert.equal(bulkPayment.safeParse(bad).success,false);
});
test('bulk payment deduplicates IDs and limits selection to one page',()=>{
 assert.deepEqual(bulkPayment.parse({ids:[id,id],bill_month:'2026-11',confirmed:true}).ids,[id]);
 assert.equal(bulkPayment.safeParse({ids:Array(51).fill(id),bill_month:'2026-11',confirmed:true}).success,false);
});
test('payment views are explicitly restricted to unpaid, paid or all',()=>{
 for(const value of ['unpaid','paid','all'])assert.equal(paymentFilter.parse(value),value);
 assert.equal(paymentFilter.safeParse('unknown').success,false);
});
