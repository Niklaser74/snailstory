-- Three snails to a terrarium, so a reminder has to say which one it is about.
--
-- The key was (user_id, kind, years). With one snail that was enough; with
-- three, two snails' first birthdays are two different days that would silently
-- overwrite each other — the insert would just drop one and nobody would ever
-- see an error. `snail` is a short stable handle the client derives from the
-- snail's seed, and it joins the key.
--
-- The name moves from an argument to a per-row field for the same reason: one
-- schedule now carries several snails, each with its own name to put in the
-- notification.

alter table public.snailstory_reminders
  add column if not exists snail text not null default '';

alter table public.snailstory_reminders
  drop constraint if exists snailstory_reminder_snail_len;
alter table public.snailstory_reminders
  add constraint snailstory_reminder_snail_len check (length(snail) <= 16);

alter table public.snailstory_reminders
  drop constraint if exists snailstory_reminders_pkey;
alter table public.snailstory_reminders
  add primary key (user_id, kind, years, snail);

-- The old three-argument form has to go, or PostgREST sees two overloads and
-- refuses to choose.
drop function if exists public.snailstory_set_reminders(jsonb, text, text);

create or replace function public.snailstory_set_reminders(p_rows jsonb, p_lang text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array'; end if;
  if jsonb_array_length(p_rows) > 16 then raise exception 'too many reminders'; end if;
  delete from public.snailstory_reminders where user_id = auth.uid();
  insert into public.snailstory_reminders (user_id, kind, years, snail, due_at, lang, snail_name)
  select auth.uid(),
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
  on conflict (user_id, kind, years, snail) do update
     set due_at = excluded.due_at, lang = excluded.lang, snail_name = excluded.snail_name;
  get diagnostics n = row_count;
  return n;
end $$;

-- The sender needs the handle too: two snails' notifications must not replace
-- each other in the phone's tray, and the tag is what decides that.
create or replace function public.snailstory_take_due(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  with taken as (
    delete from public.snailstory_reminders r
     where (r.user_id, r.kind, r.years, r.snail) in (
       select user_id, kind, years, snail from public.snailstory_reminders
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

grant execute on function public.snailstory_set_reminders(jsonb, text) to authenticated;
revoke execute on function public.snailstory_set_reminders(jsonb, text) from anon, public;
revoke execute on function public.snailstory_take_due(int) from public, anon, authenticated;
grant execute on function public.snailstory_take_due(int) to service_role;
