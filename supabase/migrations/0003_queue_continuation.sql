begin;
-- Upgrade existing installations without resetting deliveries.
drop function public.begin_queue_send(uuid,uuid);
create function public.begin_queue_send(owner uuid,delivery uuid,delay_ms integer default 5000) returns boolean language plpgsql security definer set search_path=public as $$
declare d message_deliveries;c campaigns;u customers;b monthly_bills;
begin
 if delay_ms is null or delay_ms<0 or delay_ms>60000 then raise exception 'Invalid send delay';end if;
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
 update queue_lease set next_send_at=now()+delay_ms*interval '1 millisecond' where id;
 return true;
end $$;

revoke all on function public.begin_queue_send(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.begin_queue_send(uuid,uuid,integer) to service_role;
create function public.queue_pending() returns boolean language sql security definer set search_path=public as $$
 select exists(select 1 from message_deliveries d join campaigns c on c.id=d.campaign_id
 where (c.status in ('QUEUED','RUNNING') and d.status='QUEUED') or d.status in ('PROCESSING','SENDING'));
$$;
revoke all on function public.queue_pending() from public,anon,authenticated;
grant execute on function public.queue_pending() to service_role;
commit;
