
-- Add shared discovery/location fields without deleting existing plans.
alter table public.plans
  add column if not exists city text,
  add column if not exists loc_lat double precision,
  add column if not exists loc_lng double precision,
  add column if not exists loc_source text,
  add column if not exists loc_place text,
  add column if not exists day text,
  add column if not exists event_id text;

create index if not exists plans_city_status_idx
  on public.plans (city, status);

create index if not exists plans_created_at_idx
  on public.plans (created_at desc);
