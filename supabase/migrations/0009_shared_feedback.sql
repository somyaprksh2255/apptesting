-- Squado shared feedback: additive, non-destructive migration.
-- Apply only after reviewing the existing migration history.

alter table public.feedback
  add column if not exists kind text not null default 'meetup',
  add column if not exists tags text[] not null default '{}';

-- Existing rows remain meetup feedback; keep them, but enforce valid new records.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_kind_chk') then
    alter table public.feedback add constraint feedback_kind_chk check (kind in ('meetup','person'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_rating_chk') then
    alter table public.feedback add constraint feedback_rating_chk check (rating is null or rating between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'feedback_no_self_review_chk') then
    alter table public.feedback add constraint feedback_no_self_review_chk check (to_uid is null or to_uid <> by);
  end if;
end $$;

create unique index if not exists feedback_meetup_once_idx
  on public.feedback(plan_id, by) where kind = 'meetup' and to_uid is null;
create unique index if not exists feedback_person_once_idx
  on public.feedback(plan_id, by, to_uid) where kind = 'person' and to_uid is not null;
create index if not exists feedback_target_kind_idx on public.feedback(to_uid, kind);

-- Individual feedback is private to its author. Public UI must use the aggregate RPCs below.
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select using (by = auth.uid());
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert with check (by = auth.uid());
drop policy if exists feedback_update on public.feedback;
create policy feedback_update on public.feedback for update using (false) with check (false);
drop policy if exists feedback_delete on public.feedback;
create policy feedback_delete on public.feedback for delete using (false);

create or replace function public.submit_squado_feedback(
  p_plan_id text, p_kind text, p_rating integer, p_tags text[] default '{}',
  p_notes text default null, p_to_uid uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); plan_row public.plans%rowtype;
begin
  if uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_kind not in ('meetup','person') or p_rating < 1 or p_rating > 5 then raise exception 'invalid_feedback'; end if;
  select * into plan_row from public.plans where id = p_plan_id;
  if not found then raise exception 'plan_not_found'; end if;
  if plan_row.completion is null or coalesce(jsonb_array_length(coalesce(plan_row.completion->'disputes','[]'::jsonb)),0) > 0 then
    raise exception 'feedback_not_open';
  end if;
  if not exists (select 1 from public.attendance a where a.plan_id = p_plan_id and a.uid = uid and a.status = 'present' and a.dispute is null) then
    raise exception 'verified_attendance_required';
  end if;
  if p_kind = 'person' then
    if p_to_uid is null or p_to_uid = uid then raise exception 'invalid_review_target'; end if;
    if not exists (select 1 from public.attendance a where a.plan_id = p_plan_id and a.uid = p_to_uid and a.status = 'present' and a.dispute is null) then
      raise exception 'review_target_not_eligible';
    end if;
  elsif p_to_uid is not null then raise exception 'invalid_review_target'; end if;
  insert into public.feedback(plan_id, by, to_uid, rating, notes, kind, tags)
    values (p_plan_id, uid, p_to_uid, p_rating, left(coalesce(p_notes,''),500), p_kind,
      (select coalesce(array_agg(t), '{}') from (select distinct t from unnest(coalesce(p_tags,'{}')) t limit 12) q));
  return jsonb_build_object('ok',true);
exception when unique_violation then raise exception 'duplicate_feedback';
end $$;
revoke all on function public.submit_squado_feedback(text,text,integer,text[],text,uuid) from public;
grant execute on function public.submit_squado_feedback(text,text,integer,text[],text,uuid) to authenticated;

create or replace function public.squado_plan_feedback_summary(p_plan_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with r as (select rating, tags from public.feedback where plan_id=p_plan_id and kind='meetup' and to_uid is null),
  n as (select count(*)::integer n, round(avg(rating)::numeric,1) avg from r),
  t as (select tag, count(*)::integer count from r cross join lateral unnest(tags) tag group by tag order by count(*) desc limit 3)
  select case when n.n < 3 then null else jsonb_build_object('n',n.n,'avg',n.avg,'tags',coalesce((select jsonb_agg(jsonb_build_array(tag,count)) from t),'[]'::jsonb)) end from n;
$$;
revoke all on function public.squado_plan_feedback_summary(text) from public;
grant execute on function public.squado_plan_feedback_summary(text) to authenticated;

create or replace function public.squado_user_trust_summary(p_user uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with r as (select rating, tags from public.feedback where kind='person' and to_uid=p_user),
  n as (select count(rating)::integer n, round(avg(rating)::numeric,1) avg from r),
  t as (select tag, count(*)::integer count from r cross join lateral unnest(tags) tag group by tag order by count(*) desc limit 8)
  select jsonb_build_object('n',n.n,'avg',case when n.n < 3 then null else n.avg end,
    'tags',case when n.n < 3 then '{}'::jsonb else coalesce((select jsonb_object_agg(tag,count) from t),'{}'::jsonb) end) from n;
$$;
revoke all on function public.squado_user_trust_summary(uuid) from public;
grant execute on function public.squado_user_trust_summary(uuid) to authenticated;
