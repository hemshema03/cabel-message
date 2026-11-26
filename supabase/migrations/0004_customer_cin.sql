alter table public.customers add column cin text not null default '';

-- Update only the identifier supplied by Excel; never overwrite consent or contact details.
create function public.update_customer_cins(rows jsonb) returns integer
language plpgsql security invoker set search_path=public as $$
declare updated integer;
begin
  with supplied as (
    select distinct on (btrim(item->>'customer_code'))
      btrim(item->>'customer_code') as customer_code, btrim(item->>'cin') as cin
    from jsonb_array_elements(rows) with ordinality as source(item, position)
    where coalesce(btrim(item->>'customer_code'),'')<>'' and coalesce(btrim(item->>'cin'),'')<>''
    order by btrim(item->>'customer_code'), position
  )
  update customers c set cin=s.cin from supplied s
  where c.customer_code=s.customer_code and c.cin is distinct from s.cin;
  get diagnostics updated = row_count;
  return updated;
end $$;
revoke all on function public.update_customer_cins(jsonb) from public,anon;
grant execute on function public.update_customer_cins(jsonb) to authenticated,service_role;

create or replace function public.commit_import(rows jsonb,kind text,file_name text) returns void
language plpgsql security invoker as $$ declare r jsonb; cid uuid;begin
for r in select * from jsonb_array_elements(rows) loop
insert into customers(customer_code,cin,name,phone,address,area,notes,is_active,opted_out)
values(r->>'customer_code',coalesce(btrim(r->>'cin'),''),r->>'name',r->>'phone',r->>'address',r->>'area',r->>'notes',coalesce((r->>'is_active')::boolean,true),coalesce((r->>'opted_out')::boolean,false))
on conflict(customer_code) do update set cin=coalesce(nullif(excluded.cin,''),customers.cin),name=excluded.name,phone=excluded.phone,address=excluded.address,area=excluded.area,notes=excluded.notes returning id into cid;
if kind='UNPAID' then insert into monthly_bills(customer_id,bill_month,unpaid_amount,due_date,payment_status) values(cid,r->>'bill_month',(r->>'unpaid_amount')::numeric,(r->>'due_date')::date,r->>'payment_status') on conflict(customer_id,bill_month) do update set unpaid_amount=excluded.unpaid_amount,due_date=excluded.due_date,payment_status=excluded.payment_status;end if;
end loop;
insert into import_batches(kind,file_name,row_count) values(kind,file_name,jsonb_array_length(rows));insert into audit_logs(action,payload) values('IMPORT',jsonb_build_object('count',jsonb_array_length(rows)));end $$;
