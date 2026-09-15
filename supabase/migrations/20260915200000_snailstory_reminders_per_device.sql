-- One account, several terrariums.
--
-- The box lives in the browser: a phone and a laptop hold two different boxes
-- with different snails. The reminder schedule, on the other hand, was keyed to
-- the account — and an account is shared across devices as soon as it is linked
-- to Google, which the series' account is. So the two boxes had one slot
-- between them, and `set_reminders` replaces everything for the account: the
-- last device to open the app quietly wiped the other one's reminders.
--
-- `device` is a random handle the client keeps in localStorage, one per
-- browser. It joins the key, and a sync now replaces only that device's rows.
--
-- Delivery is deliberately NOT split the same way. A reminder still goes to
-- every push subscription on the account, so the snail on the laptop can tell
-- you about itself on your phone. That is the whole point of having the account
-- shared, and the notification names the snail so it is never a mystery which
-- box it came from.

alter table public.snailstory_reminders
  add column if not exists device text not null default '';

alter table public.snailstory_reminders
  drop constraint if exists snailstory_reminder_device_len;
alter table public.snailstory_reminders
  add constraint snailstory_reminder_device_len check (length(device) <= 24);

alter table public.snailstory_reminders
  drop constraint if exists snailstory_reminders_pkey;
alter table public.snailstory_reminders
  add primary key (user_id, device, kind, years, snail);

create index if not exists snailstory_reminders_owner on public.snailstory_reminders (user_id, device);

-- The two-argument form has to go, or PostgREST sees two overloads.
drop function if exists public.snailstory_set_reminders(jsonb, text);

create or replace function public.snailstory_set_reminders(p_rows jsonb, p_lang text, p_device text)
returns int language plpgsql security definer set search_path = public as $$
declare n int; dev text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 16 then raise exception 'too many reminders'; end if;
  dev := left(coalesce(p_device, ''), 24);
  -- only this browser's own schedule is replaced; the other devices keep theirs
  delete from public.snailstory_reminders where user_id = auth.uid() and device = dev;
  insert into public.snailstory_reminders (user_id, device, kind, years, snail, due_at, lang, snail_name)
  select auth.uid(),
         dev,
         r->>'kind',
         coalesce((r->>'years')::int, 0),
         left(coalesce(r->>'snail', ''), 16),
         (r->>'at')::timestamptz,
         left(coalesce(p_lang, 'sv'), 8),
         left(coalesce(r->>'name', ''), 24)
    from jsonb_array_elements(p_rows) r
   where r->>'kind' in ('hatch', 'sealed', 'birthday', 'death')
     and (r->>'at')::timestamptz > now()
     and (r->>'at')::timestamptz < now() + interval '4 years'
  on conflict (user_id, device, kind, years, snail) do update
     set due_at = excluded.due_at, lang = excluded.lang, snail_name = excluded.snail_name;
  get diagnostics n = row_count;
  return n;
end $$;

-- Turning reminders off, or starting a new box, clears that browser's rows.
-- A null device clears the whole account, which is what a player asking to be
-- forgotten means.
drop function if exists public.snailstory_clear_reminders();

create or replace function public.snailstory_clear_reminders(p_device text default null)
returns void language sql security definer set search_path = public as $$
  delete from public.snailstory_reminders
   where user_id = auth.uid()
     and (p_device is null or device = left(p_device, 24));
$$;

-- Unchanged in spirit: everything due is taken and deleted in one statement,
-- and every subscription on the account is told, whichever device scheduled it.
create or replace function public.snailstory_take_due(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  with taken as (
    delete from public.snailstory_reminders r
     where (r.user_id, r.device, r.kind, r.years, r.snail) in (
       select user_id, device, kind, years, snail from public.snailstory_reminders
        where due_at <= now()
        order by due_at
        limit greatest(1, least(coalesce(p_limit, 200), 1000))
        for update skip locked)
    returning r.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', t.kind,
           'years', t.years,
           'snail', t.snail,
           'lang', t.lang,
           'name', t.snail_name,
           'subs', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                               from public.snailstory_push_subscriptions s
                              where s.user_id = t.user_id), '[]'::jsonb)
         )), '[]'::jsonb)
    into out
    from taken t;
  return out;
end $$;

grant execute on function public.snailstory_set_reminders(jsonb, text, text) to authenticated;
grant execute on function public.snailstory_clear_reminders(text) to authenticated;
revoke execute on function public.snailstory_set_reminders(jsonb, text, text) from anon, public;
revoke execute on function public.snailstory_clear_reminders(text) from anon, public;
revoke execute on function public.snailstory_take_due(int) from public, anon, authenticated;
grant execute on function public.snailstory_take_due(int) to service_role;
