-- Reminders for Snail Story.
--
-- The snail's future is deterministic apart from what its keeper does, so the
-- server does not need a copy of the snail: the client works out when the
-- interesting moments are and leaves a short list of "tell me at this time"
-- rows. A cron job every five minutes hands whatever has come due to the
-- snailstory-notify edge function, which is where the Web Push crypto lives.
--
-- The VAPID key pair is the series' own (vault secret `snails_vapid_private`,
-- created by Snäckmageddon's push migration) — one application server, one key.
-- The subscriptions are separate: each game has its own service worker scope
-- and its own payloads, so a Snail Story reminder must never reach
-- Snäckmageddon's worker.

create extension if not exists pg_net;

-- ---------------------------------------------------------------- subscriptions
create table if not exists public.snailstory_push_subscriptions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  lang       text,
  created_at timestamptz not null default now(),
  constraint snailstory_push_endpoint_len check (length(endpoint) < 2000),
  constraint snailstory_push_keys_len check (length(p256dh) < 200 and length(auth) < 100)
);
create index if not exists snailstory_push_user on public.snailstory_push_subscriptions (user_id);
alter table public.snailstory_push_subscriptions enable row level security;
revoke all on public.snailstory_push_subscriptions from anon, authenticated;

create or replace function public.snailstory_save_push(p_endpoint text, p_p256dh text, p_auth text, p_lang text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- one person, a handful of browsers; drop the oldest rather than grow forever
  if (select count(*) from public.snailstory_push_subscriptions where user_id = auth.uid()) >= 10 then
    delete from public.snailstory_push_subscriptions where id in (
      select id from public.snailstory_push_subscriptions where user_id = auth.uid() order by created_at limit 1);
  end if;
  insert into public.snailstory_push_subscriptions (user_id, endpoint, p256dh, auth, lang)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_lang, 'sv'), 8))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang;
end $$;

create or replace function public.snailstory_remove_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.snailstory_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- ------------------------------------------------------------------- the queue
-- One row per thing to say. `years` is part of the key so the first and second
-- birthday can both be queued; everything else uses 0.
create table if not exists public.snailstory_reminders (
  user_id    uuid not null,
  kind       text not null,
  years      int  not null default 0,
  due_at     timestamptz not null,
  lang       text,
  snail_name text,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, years),
  constraint snailstory_reminder_kind check (kind in ('hatch', 'sealed', 'birthday', 'death')),
  constraint snailstory_reminder_years check (years between 0 and 3),
  constraint snailstory_reminder_name_len check (snail_name is null or length(snail_name) <= 24)
);
create index if not exists snailstory_reminders_due on public.snailstory_reminders (due_at);
alter table public.snailstory_reminders enable row level security;
revoke all on public.snailstory_reminders from anon, authenticated;

-- The client sends its whole schedule every time, so this replaces rather than
-- appends: there is never a queue of stale forecasts to reason about.
create or replace function public.snailstory_set_reminders(p_rows jsonb, p_lang text, p_name text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 10 then raise exception 'too many reminders'; end if;
  delete from public.snailstory_reminders where user_id = auth.uid();
  insert into public.snailstory_reminders (user_id, kind, years, due_at, lang, snail_name)
  select auth.uid(),
         r->>'kind',
         coalesce((r->>'years')::int, 0),
         (r->>'at')::timestamptz,
         left(coalesce(p_lang, 'sv'), 8),
         left(coalesce(p_name, ''), 24)
    from jsonb_array_elements(p_rows) r
   where r->>'kind' in ('hatch', 'sealed', 'birthday', 'death')
     and (r->>'at')::timestamptz > now()
     and (r->>'at')::timestamptz < now() + interval '4 years'
  on conflict (user_id, kind, years) do update
     set due_at = excluded.due_at, lang = excluded.lang, snail_name = excluded.snail_name;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.snailstory_clear_reminders()
returns void language sql security definer set search_path = public as $$
  delete from public.snailstory_reminders where user_id = auth.uid();
$$;

-- ------------------------------------------------------------------ the sender
-- Takes what is due and removes it in the same statement, so a slow or repeated
-- run cannot send the same reminder twice. A crashed run loses that batch;
-- these are snail reminders, and at-most-once is the right trade.
create or replace function public.snailstory_take_due(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  with taken as (
    delete from public.snailstory_reminders r
     where (r.user_id, r.kind, r.years) in (
       select user_id, kind, years from public.snailstory_reminders
        where due_at <= now()
        order by due_at
        limit greatest(1, least(coalesce(p_limit, 200), 1000))
        for update skip locked)
    returning r.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', t.kind,
           'years', t.years,
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

-- The shared secret the cron job proves itself with. The value is created once
-- with vault.create_secret and never lives in this repository.
create or replace function public.snailstory_cron_key()
returns text language sql security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'snailstory_cron_key' limit 1;
$$;

-- ------------------------------------------------------------------- privileges
grant execute on function public.snailstory_save_push(text, text, text, text) to authenticated;
grant execute on function public.snailstory_remove_push(text) to authenticated;
grant execute on function public.snailstory_set_reminders(jsonb, text, text) to authenticated;
grant execute on function public.snailstory_clear_reminders() to authenticated;
revoke execute on function public.snailstory_save_push(text, text, text, text) from anon, public;
revoke execute on function public.snailstory_remove_push(text) from anon, public;
revoke execute on function public.snailstory_set_reminders(jsonb, text, text) from anon, public;
revoke execute on function public.snailstory_clear_reminders() from anon, public;
revoke execute on function public.snailstory_take_due(int) from public, anon, authenticated;
revoke execute on function public.snailstory_cron_key() from public, anon, authenticated;
grant execute on function public.snailstory_take_due(int) to service_role;
grant execute on function public.snailstory_cron_key() to service_role;

-- ------------------------------------------------------------------- the clock
-- Five minutes is the same grid the simulation runs on, so a reminder is never
-- more than one tick late.
select cron.unschedule('snailstory_reminders') where exists (select 1 from cron.job where jobname = 'snailstory_reminders');
select cron.schedule('snailstory_reminders', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://lygpfumngyebxoqqncet.supabase.co/functions/v1/snailstory-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select decrypted_secret from vault.decrypted_secrets where name = 'snailstory_cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000);
$cron$);
