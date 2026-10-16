-- Squado: safe display snapshots for the current user's private block list.
-- Does not relax RLS or grant access to blocked users' full profile rows.
alter table public.blocks add column if not exists blocked_name text;
alter table public.blocks add column if not exists blocked_username text;
alter table public.blocks add column if not exists blocked_photo_url text;
alter table public.blocks add column if not exists blocked_city text;

comment on column public.blocks.blocked_name is 'Non-sensitive display-name snapshot shown only to the blocker';
comment on column public.blocks.blocked_username is 'Non-sensitive username snapshot shown only to the blocker';
comment on column public.blocks.blocked_photo_url is 'Avatar URL snapshot shown only to the blocker';
comment on column public.blocks.blocked_city is 'City snapshot shown only to the blocker';
