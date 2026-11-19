import {test} from 'node:test';
import assert from 'node:assert/strict';
import {areaAudience,readAllPages} from '../lib/area-messaging';
test('area audiences require an explicit area and reminder month',()=>{
 assert.equal(areaAudience.safeParse({area:'North',kind:'customers'}).success,true);
 assert.equal(areaAudience.safeParse({area:'North',kind:'unpaid',month:'2026-11'}).success,true);
 for(const input of [{area:'',kind:'customers'},{area:'   ',kind:'customers'},{area:'North',kind:'unpaid'},{area:'North',kind:'unpaid',month:'2026-13'}])assert.equal(areaAudience.safeParse(input).success,false);
});
test('loads all audience pages beyond both UI and database page boundaries',async()=>{
 const source=Array.from({length:1250},(_,id)=>({id}));const offsets:number[]=[];
 const rows=await readAllPages(async offset=>{offsets.push(offset);return source.slice(offset,offset+100);});
 assert.equal(rows.length,1250);assert.deepEqual(rows,source);assert.equal(offsets.at(-1),1200);
});
test('never silently truncates an oversized audience or returns partial results after a failure',async()=>{
 await assert.rejects(readAllPages(async()=>Array(100).fill('customer'),150),/too large/);
 await assert.rejects(readAllPages(async offset=>{if(offset)throw new Error('Database unavailable');return Array(100).fill('customer');}),/Database unavailable/);
 assert.deepEqual(await readAllPages(async()=>[]),[]);
});
