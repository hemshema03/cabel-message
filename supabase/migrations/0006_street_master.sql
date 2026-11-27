create table public.street_master (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 1000),
  area text not null check (length(btrim(area)) between 1 and 1000),
  city text not null check (length(btrim(city)) between 1 and 1000)
);
create unique index street_master_location on public.street_master
  (lower(btrim(name)), lower(btrim(area)), lower(btrim(city)));
alter table public.street_master enable row level security;
create policy operator_access on public.street_master for all to authenticated
  using (exists(select 1 from public.operators where id=auth.uid()))
  with check (exists(select 1 from public.operators where id=auth.uid()));
grant select, insert on public.street_master to authenticated;
