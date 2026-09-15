-- Byta signatur på en RPC bryter varje klient som redan är utrullad.
--
-- Migrationen innan den här bytte `snailstory_set_reminders(jsonb, text)` mot
-- en variant med enhet och *tog bort* den gamla. Spelet är en PWA med en
-- cache-first service worker: första gången appen öppnas efter en deploy kör
-- den fortfarande den gamla koden, som anropar tvåargumentsformen. PostgREST
-- hittar den inte, anropet ger 404, och `push.sync` sväljer felet — påminnelser
-- är best effort. Följden blev ett tomt schema tills appen öppnats en andra
-- gång, utan ett ljud om varför.
--
-- Två saker åtgärdas här.
--
-- 1. Tvåargumentsformen finns igen, med sitt gamla beteende: den ersätter hela
--    kontots schema och skriver utan enhet. En utrullad klient fungerar alltså
--    tills den hunnit uppdatera sig.
--
-- 2. Enhetsformen sopar undan rader utan enhet för samma konto. Annars hade en
--    gammal och en ny klient lagt varsin uppsättning bredvid varandra, och
--    spelaren fått varje notis i dubbel upplaga.
--
-- Skalet kan tas bort när ingen klient äldre än v12 rimligen är i omlopp.
-- Regeln framåt: lägg till en ny signatur, ta aldrig bort den gamla i samma
-- steg som klienten byter.

create or replace function public.snailstory_set_reminders(p_rows jsonb, p_lang text)
returns int language plpgsql security definer set search_path = public as $$
begin
  -- gammal klient: hela kontot var dess, och raderna hamnar utan enhet
  delete from public.snailstory_reminders where user_id = auth.uid();
  return public.snailstory_set_reminders(p_rows, p_lang, '');
end $$;

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
  -- and anything an older client left behind without an owner, so the two
  -- cannot end up side by side and notify twice
  if dev <> '' then
    delete from public.snailstory_reminders where user_id = auth.uid() and device = '';
  end if;
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

grant execute on function public.snailstory_set_reminders(jsonb, text) to authenticated;
grant execute on function public.snailstory_set_reminders(jsonb, text, text) to authenticated;
revoke execute on function public.snailstory_set_reminders(jsonb, text) from anon, public;
revoke execute on function public.snailstory_set_reminders(jsonb, text, text) from anon, public;
