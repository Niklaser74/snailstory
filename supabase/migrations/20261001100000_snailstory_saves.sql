-- A copy of the terrarium on the account, so a new phone is not a dead snail.
--
-- The box lives in localStorage and still does: the game works with no account,
-- no network and no permission, and that stays true. But the game promises three
-- years, and nobody keeps the same phone for three years. A player who loses
-- their device loses the animal, and the file they can save themselves only
-- helps the ones who thought to save it.
--
-- This is a copy, NOT a sync. The client uploads its save about once a day; a
-- new device *fetches* it on purpose, with a question first, through the same
-- restore path as a file. Nothing merges, nothing is written back automatically,
-- and two boxes on one account never race each other — which is exactly the bug
-- the reminder calendar had in September, and it would be far worse with a whole
-- terrarium at stake.
--
-- One row per browser (the same `device` handle the reminders use), so the phone
-- and the laptop keep their own copies and both are there to choose from.
--
-- The honest limit, which the panel says out loud: an anonymous account lives in
-- localStorage too. If the device is wiped the account goes with it and this
-- copy is unreachable. It only saves anybody who has linked the account to
-- Google or e-mail — and the file the player holds is still the backstop that
-- survives even this project going away.

create table if not exists public.snailstory_saves (
  user_id    uuid not null references auth.users (id) on delete cascade,
  device     text not null default '',
  save       text not null,              -- the backup file, verbatim, as the client wrote it
  label      text not null default '',   -- who is in it, for choosing between devices
  days       int  not null default 0,    -- longest diary in the box, same purpose
  saved_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device),
  constraint snailstory_save_device_len check (length(device) <= 24),
  constraint snailstory_save_label_len check (length(label) <= 120),
  -- a three-year box with three snails is about 400 kB; this is room to spare
  -- and still a wall against somebody parking something else here
  constraint snailstory_save_size check (length(save) <= 4000000)
);

alter table public.snailstory_saves enable row level security;

create index if not exists snailstory_saves_owner on public.snailstory_saves (user_id);

-- Upload. Replaces this browser's copy and nobody else's.
create or replace function public.snailstory_put_save(
  p_save text, p_device text, p_label text default '', p_days int default 0, p_saved_at timestamptz default now())
returns timestamptz language plpgsql security definer set search_path = public as $$
declare dev text; stamp timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_save is null or length(p_save) < 2 then raise exception 'empty save'; end if;
  if length(p_save) > 4000000 then raise exception 'save too large'; end if;
  dev := left(coalesce(p_device, ''), 24);
  stamp := least(coalesce(p_saved_at, now()), now() + interval '1 day');
  insert into public.snailstory_saves (user_id, device, save, label, days, saved_at, updated_at)
  values (auth.uid(), dev, p_save, left(coalesce(p_label, ''), 120), greatest(0, coalesce(p_days, 0)), stamp, now())
  on conflict (user_id, device) do update
     set save = excluded.save, label = excluded.label, days = excluded.days,
         saved_at = excluded.saved_at, updated_at = now();
  return stamp;
end $$;

-- What is on the account, without the blobs: enough to choose between a phone
-- and a laptop, cheap enough to ask for on every visit to the panel.
create or replace function public.snailstory_list_saves()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'device', device, 'label', label, 'days', days,
           'savedAt', saved_at, 'bytes', length(save)) order by saved_at desc), '[]'::jsonb)
    from public.snailstory_saves
   where user_id = auth.uid();
$$;

-- One copy back. A null device means "the newest one", which is what a player
-- on a brand new phone means.
create or replace function public.snailstory_get_save(p_device text default null)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('device', device, 'label', label, 'days', days,
                            'savedAt', saved_at, 'save', save)
    from public.snailstory_saves
   where user_id = auth.uid()
     and (p_device is null or device = left(p_device, 24))
   order by saved_at desc
   limit 1;
$$;

-- Switching the copy off removes it. A null device clears the whole account,
-- which is what a player asking to be forgotten means.
create or replace function public.snailstory_drop_save(p_device text default null)
returns void language sql security definer set search_path = public as $$
  delete from public.snailstory_saves
   where user_id = auth.uid()
     and (p_device is null or device = left(p_device, 24));
$$;

grant execute on function public.snailstory_put_save(text, text, text, int, timestamptz) to authenticated;
grant execute on function public.snailstory_list_saves() to authenticated;
grant execute on function public.snailstory_get_save(text) to authenticated;
grant execute on function public.snailstory_drop_save(text) to authenticated;
revoke execute on function public.snailstory_put_save(text, text, text, int, timestamptz) from anon, public;
revoke execute on function public.snailstory_list_saves() from anon, public;
revoke execute on function public.snailstory_get_save(text) from anon, public;
revoke execute on function public.snailstory_drop_save(text) from anon, public;
