create table public.customer_master (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('plan','channel','agent')),
  name text not null check(trim(name)<>''),
  amount numeric(12,2) not null default 0 check(amount>=0),
  unique(kind,name)
);
alter table customer_master enable row level security;
create policy operator_access on customer_master for all to authenticated
using(exists(select 1 from operators where id=auth.uid()))
with check(exists(select 1 from operators where id=auth.uid()));

alter table customers
  add column profile jsonb not null default '{}',
  add column monthly_rent numeric(12,2) not null default 0 check(monthly_rent>=0),
  add column channel_fee numeric(12,2) not null default 0 check(channel_fee>=0),
  add column balance numeric(14,2) not null default 0,
  add column next_charge date not null default ((date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month')::date);

create function public.accrue_customer_bills() returns void language sql security invoker as $$
  update public.customers set
    balance=balance+case when is_active then (monthly_rent+channel_fee) *
      ((extract(year from local_month)-extract(year from next_charge))*12+
       extract(month from local_month)-extract(month from next_charge)+1) else 0 end,
    next_charge=(local_month + interval '1 month')::date
  from (select date_trunc('month', now() at time zone 'Asia/Kolkata')::date local_month) calendar
  where next_charge<=local_month;
$$;
revoke all on function accrue_customer_bills() from public,anon;
grant execute on function accrue_customer_bills() to authenticated,service_role;

create function public.save_customer_profiles(entries jsonb, editing uuid default null) returns integer
language plpgsql security invoker set search_path=public as $$
declare r jsonb; changed integer; total integer:=0; fee numeric; p jsonb;
begin
  perform accrue_customer_bills();
  for r in select value from jsonb_array_elements(entries) loop
    p:=r->'profile';
    insert into customer_master(kind,name,amount)
      select 'agent',p->>'agent',0 where coalesce(p->>'agent','')<>''
      on conflict(kind,name) do nothing;
    insert into customer_master(kind,name,amount)
      select 'plan',p->>'plan',(r->>'monthly_rent')::numeric where coalesce(p->>'plan','')<>''
      on conflict(kind,name) do nothing;
    select coalesce(sum(amount),0) into fee from customer_master
      where kind='channel' and (p->'channels') ? name;
    if editing is null then
      insert into customers(customer_code,name,phone,area,cin,profile,is_active,monthly_rent,channel_fee,balance)
      values(r->>'customer_code',r->>'name',r->>'phone',r->>'area',r->>'cin',p,(r->>'is_active')::boolean,
        (r->>'monthly_rent')::numeric,fee,(r->>'balance')::numeric)
      on conflict(customer_code) do nothing;
    else
      update customers set customer_code=r->>'customer_code',name=r->>'name',phone=r->>'phone',area=r->>'area',
        cin=r->>'cin',profile=p,is_active=(r->>'is_active')::boolean,monthly_rent=(r->>'monthly_rent')::numeric,channel_fee=fee
        where id=editing;
    end if;
    get diagnostics changed=row_count;
    total:=total+changed;
  end loop;
  return total;
end $$;

create function public.settle_customer_balance(account uuid, expected numeric) returns void
language plpgsql security invoker set search_path=public as $$
begin
  perform accrue_customer_bills();
  update customers set balance=0 where id=account and balance=expected and balance>0;
  if not found then raise exception 'Balance changed. Refresh before recording payment.'; end if;
end $$;

create function public.remove_customer_account(account uuid) returns void
language plpgsql security invoker set search_path=public as $$
begin
  if exists(select 1 from message_deliveries where customer_id=account and status in ('QUEUED','PROCESSING','SENDING')) then
    raise exception 'Finish or cancel pending messages before deleting this customer.';
  end if;
  update message_deliveries set monthly_bill_id=null where monthly_bill_id in(select id from monthly_bills where customer_id=account);
  update message_deliveries set customer_id=null where customer_id=account;
  delete from monthly_bills where customer_id=account;
  delete from customers where id=account;
end $$;
alter table message_deliveries alter column customer_id drop not null;
revoke all on function save_customer_profiles(jsonb,uuid), settle_customer_balance(uuid,numeric), remove_customer_account(uuid) from public,anon;
grant execute on function save_customer_profiles(jsonb,uuid), settle_customer_balance(uuid,numeric), remove_customer_account(uuid) to authenticated;

create extension if not exists pg_cron;
select cron.schedule('customer-monthly-rent','30 18 * * *','select public.accrue_customer_bills()');

