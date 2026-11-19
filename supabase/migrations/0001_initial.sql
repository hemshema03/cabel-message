create extension if not exists pgcrypto;
create table operators(id uuid primary key references auth.users(id));
create table customers(id uuid primary key default gen_random_uuid(),customer_code text unique not null,name text not null,phone text not null,address text,area text,notes text,is_active boolean default true,opted_out boolean default false,created_at timestamptz default now(),updated_at timestamptz default now());
create table monthly_bills(id uuid primary key default gen_random_uuid(),customer_id uuid references customers not null,bill_month text not null check(bill_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),unpaid_amount numeric(12,2) not null check(unpaid_amount>=0),due_date date,payment_status text default 'UNPAID' check(payment_status in ('UNPAID','PAID','PARTIAL')),created_at timestamptz default now(),updated_at timestamptz default now(),unique(customer_id,bill_month));
create table import_batches(id uuid primary key default gen_random_uuid(),kind text,file_name text,row_count int,created_at timestamptz default now(),updated_at timestamptz default now());
create table campaigns(id uuid primary key default gen_random_uuid(),title text not null,type text not null,template text not null,bill_month text,target_filter jsonb default '{}',status text default 'DRAFT',created_at timestamptz default now(),updated_at timestamptz default now());
create table message_deliveries(id uuid primary key default gen_random_uuid(),campaign_id uuid references campaigns not null,customer_id uuid references customers not null,monthly_bill_id uuid references monthly_bills,recipient_phone text,rendered_message text,waha_message_id text,status text default 'QUEUED',attempt_count int default 0,last_error text,sent_at timestamptz,delivered_at timestamptz,read_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),unique(campaign_id,customer_id));
create table webhook_events(id uuid primary key default gen_random_uuid(),event_id text unique,payload jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
create table audit_logs(id uuid primary key default gen_random_uuid(),operator_id uuid default auth.uid(),action text,payload jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
alter table operators enable row level security;
create policy own_operator on operators for select to authenticated using(id=auth.uid());
do $$ declare t text; begin foreach t in array array['customers','monthly_bills','import_batches','campaigns','message_deliveries','webhook_events','audit_logs'] loop execute format('alter table %I enable row level security',t);execute format('create policy operator_access on %I for all to authenticated using (exists(select 1 from operators where id=auth.uid())) with check (exists(select 1 from operators where id=auth.uid()))',t);end loop;end $$;
create index on monthly_bills(bill_month,payment_status);
create index on customers(area);
create index on message_deliveries(status,created_at);
create index on message_deliveries(waha_message_id);
create function touch_updated() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
do $$ declare t text;begin foreach t in array array['customers','monthly_bills','campaigns','message_deliveries'] loop execute format('create trigger touch before update on %I for each row execute function touch_updated()',t);end loop;end $$;
create function commit_import(rows jsonb,kind text,file_name text) returns void language plpgsql security invoker as $$ declare r jsonb; cid uuid;begin
for r in select * from jsonb_array_elements(rows) loop
insert into customers(customer_code,name,phone,address,area,notes,is_active,opted_out) values(r->>'customer_code',r->>'name',r->>'phone',r->>'address',r->>'area',r->>'notes',coalesce((r->>'is_active')::boolean,true),coalesce((r->>'opted_out')::boolean,false)) on conflict(customer_code) do update set name=excluded.name,phone=excluded.phone,address=excluded.address,area=excluded.area,notes=excluded.notes returning id into cid;
if kind='UNPAID' then insert into monthly_bills(customer_id,bill_month,unpaid_amount,due_date,payment_status) values(cid,r->>'bill_month',(r->>'unpaid_amount')::numeric,(r->>'due_date')::date,r->>'payment_status') on conflict(customer_id,bill_month) do update set unpaid_amount=excluded.unpaid_amount,due_date=excluded.due_date,payment_status=excluded.payment_status;end if;
end loop;
insert into import_batches(kind,file_name,row_count) values(kind,file_name,jsonb_array_length(rows));insert into audit_logs(action,payload) values('IMPORT',jsonb_build_object('count',jsonb_array_length(rows)));end $$;
create function queue_campaign(campaign uuid,allow_resend boolean default false) returns void language plpgsql security invoker as $$ declare c campaigns;begin
select * into c from campaigns where id=campaign for update;if c.status<>'DRAFT' then return;end if;
insert into message_deliveries(campaign_id,customer_id,monthly_bill_id,recipient_phone,rendered_message)
select c.id,u.id,b.id,u.phone,replace(replace(replace(replace(c.template,'{{name}}',u.name),'{{area}}',coalesce(u.area,'')),'{{amount}}',coalesce(b.unpaid_amount::text,'')),'{{month}}',coalesce(to_char(to_date(b.bill_month,'YYYY-MM'),'FMMonth YYYY'),''))
from customers u left join monthly_bills b on b.customer_id=u.id and b.bill_month=c.bill_month and c.type='PAYMENT_REMINDER'
where u.is_active and not u.opted_out and u.phone ~ '^[1-9][0-9]{10,14}$' and (c.type<>'PAYMENT_REMINDER' or (b.id is not null and b.payment_status<>'PAID' and b.unpaid_amount>0))
and (coalesce(c.target_filter->>'area','')='' or u.area=c.target_filter->>'area')
and (jsonb_array_length(coalesce(c.target_filter->'ids','[]'))=0 or c.target_filter->'ids' ? u.id::text)
and (allow_resend or c.type<>'PAYMENT_REMINDER' or not exists(select 1 from message_deliveries d where d.monthly_bill_id=b.id and d.status not in ('FAILED','SKIPPED')));
update campaigns set status='QUEUED' where id=c.id;end $$;
create function claim_delivery() returns setof message_deliveries language plpgsql security definer set search_path=public as $$ begin
update message_deliveries set status='UNKNOWN',last_error='Worker interrupted; reconcile before retry' where status='SENDING' and updated_at<now()-interval '5 minutes';
return query update message_deliveries set status='SENDING',attempt_count=attempt_count+1 where id=(select d.id from message_deliveries d join campaigns c on c.id=d.campaign_id where d.status='QUEUED' and c.status in ('QUEUED','RUNNING') order by d.created_at for update of d skip locked limit 1) returning *;end $$;
revoke all on function claim_delivery() from public,anon,authenticated;
grant execute on function claim_delivery() to service_role;
revoke all on function commit_import(jsonb,text,text) from public,anon;
revoke all on function queue_campaign(uuid,boolean) from public,anon;
grant execute on function commit_import(jsonb,text,text) to authenticated;
grant execute on function queue_campaign(uuid,boolean) to authenticated;
