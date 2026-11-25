begin;
-- Additive migration: never recreates deliveries or resets previously attempted sends.
alter table public.message_deliveries add column claim_token uuid;
alter table public.message_deliveries add column claimed_at timestamptz;
alter table public.message_deliveries add column dispatch_started_at timestamptz;
alter table public.message_deliveries add column waha_session text default 'default';
create table public.queue_lease(id boolean primary key default true check(id),owner uuid,expires_at timestamptz,next_send_at timestamptz);
insert into public.queue_lease(id) values(true);
alter table public.queue_lease enable row level security;
create table public.delivery_acks(session text not null,message_id text not null,ack int not null,received_at timestamptz not null default now(),primary key(session,message_id));
alter table public.delivery_acks enable row level security;
-- Disable the old consumer even if someone accidentally restarts its service.
create or replace function public.claim_delivery() returns setof public.message_deliveries language plpgsql as $$ begin raise exception 'Legacy worker disabled; use /api/queue/process'; end $$;

create function public.acquire_queue(owner uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update queue_lease q set owner=$1,expires_at=now()+interval '90 seconds' where id and (q.expires_at is null or q.expires_at<now());
 return found;
end $$;
create function public.release_queue(owner uuid) returns void language sql security definer set search_path=public as $$
 update queue_lease q set owner=null,expires_at=null where q.owner=$1;
$$;
create function public.recover_queue() returns void language plpgsql security definer set search_path=public as $$
begin
 update message_deliveries set status=case when dispatch_started_at is null then 'QUEUED' else 'UNKNOWN' end,
 last_error=case when dispatch_started_at is null then 'Recovered interrupted preparation' else 'Send interrupted; reconcile with WAHA before retry' end,claim_token=null
 where status='PROCESSING' and claimed_at<now()-interval '90 seconds';
 update message_deliveries set status='UNKNOWN',last_error='Legacy send interrupted; reconcile with WAHA before retry' where status='SENDING' and updated_at<now()-interval '5 minutes';
end $$;
create function public.claim_queue(owner uuid,campaign uuid default null) returns setof public.message_deliveries language plpgsql security definer set search_path=public as $$
begin
 perform 1 from queue_lease q where q.owner=$1 and expires_at>now() and (next_send_at is null or next_send_at<=now()) for update;
 if not found then return; end if;
 return query update message_deliveries set status='PROCESSING',claim_token=$1,claimed_at=now(),dispatch_started_at=null,attempt_count=attempt_count+1,last_error=null
 where id=(select d.id from message_deliveries d join campaigns c on c.id=d.campaign_id where d.status='QUEUED' and c.status in ('QUEUED','RUNNING') and ($2 is null or c.id=$2) order by d.created_at,d.id for update of d skip locked limit 1) returning *;
end $$;
create function public.begin_queue_send(owner uuid,delivery uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare d message_deliveries;c campaigns;u customers;b monthly_bills;
begin
 perform 1 from queue_lease q where q.owner=$1 and expires_at>now() for update;
 if not found then return false;end if;
 select * into d from message_deliveries where id=$2 and claim_token=$1 and status='PROCESSING' for update;
 if not found then return false;end if;
 select * into c from campaigns where id=d.campaign_id for update;
 select * into u from customers where id=d.customer_id;
 if d.monthly_bill_id is not null then select * into b from monthly_bills where id=d.monthly_bill_id;end if;
 if c.status not in ('QUEUED','RUNNING') or not coalesce(u.is_active,false) or coalesce(u.opted_out,true) or (d.monthly_bill_id is not null and (b.id is null or b.payment_status='PAID' or b.unpaid_amount<=0)) then
  update message_deliveries set status='SKIPPED',last_error='Campaign stopped or recipient no longer eligible',claim_token=null where id=d.id;return false;
 end if;
 update campaigns set status='RUNNING' where id=c.id;
 update message_deliveries set dispatch_started_at=now() where id=d.id;
 update queue_lease set next_send_at=now()+interval '5 seconds' where id;
 return true;
end $$;

-- Monotonic acknowledgement projection. Keep unmatched events for the send-response race.
create function public.apply_delivery_ack(delivery uuid) returns void language plpgsql security definer set search_path=public as $$
declare a delivery_acks;d message_deliveries;
begin
 select * into d from message_deliveries where id=$1 for update;
 select * into a from delivery_acks where session=d.waha_session and message_id=d.waha_message_id;
 if not found then return;end if;
 update message_deliveries set
 status=case when a.ack>=3 then 'READ' when a.ack=2 and d.status<>'READ' then 'DELIVERED' when a.ack=1 and d.status not in ('DELIVERED','READ') then 'SENT' when a.ack=-1 and d.status not in ('DELIVERED','READ') then 'FAILED' else d.status end,
 sent_at=case when a.ack>=1 then coalesce(sent_at,a.received_at) else sent_at end,
 delivered_at=case when a.ack>=2 then coalesce(delivered_at,a.received_at) else delivered_at end,
 read_at=case when a.ack>=3 then coalesce(read_at,a.received_at) else read_at end,
 last_error=case when a.ack=-1 then 'WAHA message.ack ERROR' else last_error end where id=$1;
end $$;
create function public.record_delivery_ack(session_name text,message_id text,ack_value int) returns void language plpgsql security definer set search_path=public as $$
declare d record;
begin
 perform pg_advisory_xact_lock(hashtextextended($1||':'||$2,0));
 if ack_value not between -1 and 4 then raise exception 'Invalid acknowledgement';end if;
 insert into delivery_acks(session,message_id,ack) values($1,$2,$3) on conflict on constraint delivery_acks_pkey do update set ack=case when excluded.ack=-1 and delivery_acks.ack<2 then -1 else greatest(delivery_acks.ack,excluded.ack) end;
 for d in select id from message_deliveries where waha_session=$1 and waha_message_id=$2 loop perform apply_delivery_ack(d.id);end loop;
end $$;
create function public.finish_queue(owner uuid,delivery uuid,outcome text,message_id text default null,failure text default null,session_name text default 'default') returns void language plpgsql security definer set search_path=public as $$
begin
 if $4 is not null then perform pg_advisory_xact_lock(hashtextextended($6||':'||$4,0));end if;
 if outcome not in ('SENT','FAILED','UNKNOWN') then raise exception 'Invalid outcome';end if;
 update message_deliveries set status=$3,waha_message_id=$4,waha_session=$6,last_error=$5,sent_at=case when $3='SENT' then now() else sent_at end,claim_token=null
 where id=$2 and claim_token=$1 and status='PROCESSING';
 if not found then raise exception 'Claim no longer owned';end if;
 perform apply_delivery_ack($2);
end $$;
create function public.settle_queue() returns void language sql security definer set search_path=public as $$
 update campaigns c set status=case when exists(select 1 from message_deliveries d where d.campaign_id=c.id and d.status='UNKNOWN') then 'NEEDS_REVIEW' else 'COMPLETED' end
 where c.status in ('QUEUED','RUNNING') and not exists(select 1 from message_deliveries d where d.campaign_id=c.id and d.status in ('QUEUED','PROCESSING','SENDING'));
$$;
create function public.record_queue_problem(campaign uuid,failure text) returns void language sql security definer set search_path=public as $$
 update message_deliveries d set last_error=left($2,1000) from campaigns c
 where c.id=d.campaign_id and c.status in ('QUEUED','RUNNING') and d.status='QUEUED' and ($1 is null or c.id=$1);
$$;
do $$ declare f text;begin
 foreach f in array array['acquire_queue(uuid)','release_queue(uuid)','recover_queue()','claim_queue(uuid,uuid)','begin_queue_send(uuid,uuid)','apply_delivery_ack(uuid)','record_delivery_ack(text,text,integer)','finish_queue(uuid,uuid,text,text,text,text)','settle_queue()','record_queue_problem(uuid,text)'] loop
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';
 execute 'grant execute on function public.'||f||' to service_role';
 end loop;
end $$;
commit;
