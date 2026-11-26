import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {blankForm,entry} from '../lib/customer-profiles';

test('import, monthly accrual, settlement and edits preserve the customer balance',async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select null::uuid$$;");
    for(const file of ['0001_initial','0004_customer_cin','0005_customer_accounts']){
      const sql=readFileSync('supabase/migrations/'+file+'.sql','utf8');
      await db.exec(sql.replace('create extension if not exists pgcrypto;','').split('create extension if not exists pg_cron;')[0]);
    }
    await db.exec("insert into customer_master(kind,name,amount) values ('channel','Sports',25)");
    const input=entry({...blankForm(),customer_code:'A',name:'Sample',monthly_rent:'200',balance:'-10',channels:['Sports'],agent:'Collector',plan:'Basic'});
    const insert=()=>db.query('select save_customer_profiles($1::jsonb)',[JSON.stringify([input])]);
    await insert();await insert();
    await db.exec("update customers set next_charge=(date_trunc('month',now() at time zone 'Asia/Kolkata')-interval '1 month')::date");
    await db.exec('select accrue_customer_bills();select accrue_customer_bills()');
    const account=(await db.query<{id:string;balance:string}>('select id,balance from customers')).rows[0];
    assert.equal(Number(account.balance),440);
    await db.query('select settle_customer_balance($1,440)',[account.id]);
    await db.query('select save_customer_profiles($1::jsonb,$2)',[JSON.stringify([{...input,monthly_rent:300}]),account.id]);
    const paid=(await db.query<{balance:string;monthly_rent:string}>('select balance,monthly_rent from customers')).rows[0];
    assert.equal(Number(paid.balance),0);assert.equal(Number(paid.monthly_rent),300);
    assert.equal((await db.query('select * from customer_master')).rows.length,3);
    await db.query('select remove_customer_account($1)',[account.id]);
    assert.equal((await db.query('select * from customers')).rows.length,0);
  }finally{await db.close();}
});
