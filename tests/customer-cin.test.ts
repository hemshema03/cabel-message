import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('CIN migration backfills only matching accounts and does not clear identifiers',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table customers(customer_code text primary key,name text,cin_unused text,phone text,opted_out boolean);
   insert into customers values ('A','Original',null,'919999999999',true),('B','Other',null,'918888888888',false);`);
  await db.exec(readFileSync('supabase/migrations/0004_customer_cin.sql','utf8'));
  const updates=[{customer_code:' A ',cin:' 000123 '},{customer_code:'A',cin:'SECOND'},{customer_code:'B',cin:''},{customer_code:'MISSING',cin:'OTHER'}];
  const result=await db.query<{count:number}>('select update_customer_cins($1::jsonb) as count',[JSON.stringify(updates)]);
  assert.equal(result.rows[0].count,1);
  await db.query('select update_customer_cins($1::jsonb)',[JSON.stringify([{customer_code:'A',cin:' ' }])]);
  const customers=await db.query<{customer_code:string;cin:string;name:string;phone:string;opted_out:boolean}>('select * from customers order by customer_code');
  assert.equal(customers.rows.length,2);assert.equal(customers.rows[0].cin,'000123');
  assert.equal(customers.rows[0].name,'Original');assert.equal(customers.rows[0].phone,'919999999999');
  assert.equal(customers.rows[0].opted_out,true);assert.equal(customers.rows[1].cin,'');
  const again=await db.query<{count:number}>('select update_customer_cins($1::jsonb) as count',[JSON.stringify(updates)]);
  assert.equal(again.rows[0].count,0);
 }finally{await db.close();}
});
