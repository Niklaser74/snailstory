# Supabase

Snail Story använder Supabase till **en enda sak: påminnelser**. Spelet i övrigt
är helt lokalt — ingen inloggning, ingen leaderboard, inget som lämnar
telefonen. Slår spelaren aldrig på notiser görs inte ett enda anrop.

Projektet är seriens gemensamma **`snails`** (`lygpfumngyebxoqqncet`,
eu-north-1 Stockholm, Knackpot AB). Tabellprefixet är `snailstory_`.

## Varför det ser ut som det gör

Snäckmageddon skickar push när *något händer*: en spelare gör ett drag och
klienten ber servern säga till. Snail Story har ingen sådan händelse — det som
ska notifieras händer medan appen är stängd, och det finns ingen motspelare som
råkar vara inloggad och kan trycka på knappen.

Alternativet hade varit att spegla hela snigeln på servern och låta ett jobb
titta till den. Det behövs inte: **snigelns framtid är deterministisk** så länge
skötaren inte gör något. Klienten kan därför räkna ut exakt när varje intressant
ögonblick inträffar och lämna en lista med tider. Servern behöver aldrig veta
vad en snigel är.

```
klienten                          servern
--------                          -------
life.schedule()  ── set_reminders ─►  snailstory_reminders
   kläckning, dvala,                    (en rad per sak att säga)
   födelsedagar, slutet
                                   pg_cron var 5:e minut
                                        │
                                        ▼  take_due (hämtar och raderar i ett svep)
                                   snailstory-notify  ──► push service ──► sw.js
```

Prognosen för dvalan (`life.js` `forecastSeal`) kör den **riktiga**
simuleringen framåt på en slängkopia i stället för att lösa avklingningen för
hand, så den kan inte glida ifrån vad som faktiskt händer.
`test/life.test.mjs` spolar fram till prognosens tidpunkt och kontrollerar att
snigeln bommar igen exakt då.

Listan **ersätts** vid varje synkning, aldrig utökas. Det finns alltså aldrig
en kö av gamla prognoser att resonera om: det som ligger där är senaste ordet.
Klienten synkar när påminnelser slås på, några sekunder efter varje skötsel,
och när sidan göms eller stängs (`keepalive`).

## Delat med resten av serien

- **VAPID-nyckelparet.** Ett programserverpar för hela snails.se; den privata
  halvan ligger i Vault som `snails_vapid_private` (skapad av Snäckmageddons
  `20260904170000_push.sql`), den publika i `js/config.js`. Byts nyckeln måste
  alla prenumerationer i alla spel göras om.
- **Kontot.** `js/account.js` är seriens delade klient (ägd av hubben,
  vendorad med `npm run sync:account`; `js/supa.js` re-exporterar den) och
  använder sessionsnyckeln `snails.session` — samma origin, samma projekt,
  samma konto. Det är det enda undantaget från regeln att `localStorage`-nycklar
  prefixas per spel. Har spelaren ett konto från något annat spel på snails.se
  används det; koppling och profil sköts på https://snails.se/account/.
- **`webpush.js`** är en kopia från snailmageddon. Ändra där, kopiera hit.

**Inte** delat: prenumerationerna. Varje spel har sin egen service worker med
sitt eget scope, och en Snail Story-notis får aldrig hamna hos Snäckmageddons
`sw.js`. Därför `snailstory_push_subscriptions`.

## Sätta upp från noll

1. **Migration.** `supabase/migrations/20260912190000_snailstory_reminders.sql`
   via `supabase db push` eller MCP:ns `apply_migration`. Den slår på `pg_net`,
   skapar tabellerna och funktionerna och schemalägger cron-jobbet.
2. **Vault: cron-nyckeln.** Ett slumpat värde som edge-funktionen känner igen
   cron-jobbet på. Det finns **inte** i repot. Nytt värde:
   ```sql
   select vault.create_secret('<32 slumpade bytes som hex>', 'snailstory_cron_key');
   ```
   Byts det måste inget annat ändras — både jobbet och funktionen läser det ur
   Vault vid varje körning.
3. **Edge-funktion.** `supabase functions deploy snailstory-notify --no-verify-jwt
   --project-ref lygpfumngyebxoqqncet` (eller MCP:ns `deploy_edge_function` med
   `verify_jwt: false`). **JWT-kontrollen måste vara av** — anropet kommer från
   cron-jobbet och har ingen användare bakom sig. Den delade hemligheten är
   dörren i stället.
4. **Kontroll:**
   ```sql
   select jobname, schedule from cron.job where jobname = 'snailstory_reminders';
   select id, status_code, content from net._http_response order by id desc limit 3;
   ```
   En körning utan något att göra svarar `{"due":0,"sent":0}`.

## Tabeller

| Tabell | Vad |
| --- | --- |
| `snailstory_push_subscriptions` | endpoint och nycklar per webbläsare, max tio per konto (äldsta faller bort) |
| `snailstory_reminders` | en rad per sak att säga: `(user_id, device, kind, years, snail)` som nyckel, `due_at`, språk och snigelns namn |

`kind` är `hatch`, `sealed`, `birthday` eller `death`. `years` är 0 utom för
födelsedagarna, som annars hade krockat med varandra i nyckeln. `snail` är ett
kort handtag klienten räknar fram ur snigelns seed — det behövs sedan lådan tog
tre sniglar, för två sniglars första födelsedag är två olika dagar och hade
annars skrivit över varandra utan att något fel syntes.

**Kläckning, födelsedag och slut är per snigel; dvalan är lådans.** Behoven
delas, så alla vakna sniglar bommar igen samma tick — en påminnelse, inte tre.

**`device` finns för att lådan inte syncar men kontot gör det.** Terrariet bor i
`localStorage`, alltså ett per webbläsare; kontot är seriens och delas över
enheter så snart det kopplats till Google. Utan enheten i nyckeln hade de två
lådorna delat på en enda kalender, och eftersom en synk *ersätter* allt hade den
enhet som öppnade appen sist tyst raderat den andras påminnelser. Handtaget är
ett slumptal per webbläsare och säger ingenting om den.

**Leveransen delas medvetet inte på samma sätt.** `take_due` hämtar
prenumerationerna per konto, inte per enhet, så en påminnelse från datorns låda
når också telefonen. Notisen namnger snigeln, så det framgår vilken låda den
kommer ifrån.

Båda tabellerna har RLS på och alla rättigheter borttagna för `anon` och
`authenticated` — allt går via security definer-funktioner som filtrerar på
`auth.uid()`.

## Funktioner

| Funktion | Vem | Vad |
| --- | --- | --- |
| `snailstory_save_push(endpoint, p256dh, auth, lang)` | authenticated | sparar den här webbläsarens prenumeration |
| `snailstory_remove_push(endpoint)` | authenticated | tar bort den |
| `snailstory_set_reminders(rows, lang, device)` | authenticated | ersätter **den här enhetens** schema, max sexton rader, bara tider i framtiden. Varje rad bär sin egen snigel och sitt eget namn |
| `snailstory_clear_reminders(device)` | authenticated | tömmer den enhetens schema; utan enhet hela kontots |
| `snailstory_take_due(limit)` | service_role | hämtar och **raderar** allt som förfallit, med prenumerationerna i samma svar |
| `snailstory_cron_key()` | service_role | den delade hemligheten ur Vault |

`take_due` raderar i samma sats som den läser. En långsam eller överlappande
körning kan därmed inte skicka samma påminnelse två gånger; kraschar en körning
går den satsen förlorad. För snigelpåminnelser är *högst en gång* rätt val.

## Att tänka på

- **Texterna i notiserna** bor i `supabase/functions/snailstory-notify/texts.js`,
  inte i spelets `js/i18n.js`. En notis skrivs av servern. Filen är vanlig JS
  utan importer så att både Deno och `test/push.test.mjs` läser samma källa.
- **Byt aldrig en RPC-signatur utan skal.** Klienten är en PWA med cache-first service
  worker, så första öppningen efter en deploy kör gammal kod. `snailstory_set_reminders`
  finns därför i både två- och treargumentsform; den gamla vidarebefordrar med tom enhet,
  och den nya raderar rader utan enhet så att de två inte ger dubbla notiser. PostgREST
  väljer rätt överlagring på argumentnamnen — provat i drift.
- **Radering.** Stänger spelaren av påminnelser raderas både prenumerationen och
  schemat. Lägger hen ett nytt ägg töms schemat och fylls på nytt.
- **Cron-loggen städar sig själv.** `net._http_response` har `pg_net.ttl` 6 timmar,
  så de 288 raderna per dygn försvinner av sig själva. Det är också där man ser om
  jobbet går: `select id, status_code, content from net._http_response order by id desc limit 5`.
- **Ingen städning behövs** för gamla rader: `take_due` konsumerar dem, och en
  spelare som slutar har som mest fyra rader liggande fram till sin snigels slut.
