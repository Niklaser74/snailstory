// Snail Story: the page around the simulation. Loads the snail, catches it up to
// now, draws it, and wires the five things you can do. All rules live in
// life.js; all sentences live in i18n.js and diary.js.
import { Box, FOODS, LIFE_DAYS, DAY_MS, TICK_MS, BADGES, EGG_MS, SNAIL_MAX, heirName } from './life.js';
import { entryFor, diaryFor } from './diary.js';
import { View } from './view.js';
import * as fmt from './fmt.js';
import { t, setLang, getLang, detectLang, NAMES } from './i18n.js';
import { push } from './push.js';
import { setMuted, isMuted, unlockAudio, sfx } from './game/audio.js';
import { APP_VERSION } from './config.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('snailstory.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('snailstory.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('snailstory.' + k); } catch { /* ignore */ } },
};

setLang(detectLang());
let box = null;      // the terrarium: the four needs, the clock, the snails
let sel = null;      // the snail the bar, the diary and the pet button are about
let view = null;
let lastSave = 0;
const FOOD_ICON = { lettuce: '🥬', cucumber: '🥒', carrot: '🥕', dandelion: '🌿', apple: '🍎', oats: '🌾' };

// ---------- loading ----------
function load() {
  const saved = store.get('box', null);
  const legacy = saved ? null : store.get('life', null);   // a save from before the box
  if (!saved && !legacy) { showStart(); return; }
  try { box = saved ? Box.fromJSON(saved) : Box.fromLegacy(legacy); } catch { showStart(); return; }
  if (!box.snails.length) { showStart(); return; }
  sel = box.snails[0];
  const before = snapshot(box);
  const awayFor = Date.now() - (store.get('savedAt', Date.now()) || Date.now());
  box.advanceTo(Date.now());
  begin();
  const away = box.takeEvents();             // the away panel says it better than toasts
  if (awayFor > 30 * 60 * 1000) showAway(before, awayFor);
  for (const e of away) {
    if (e.type === 'died') queueDeath(e.snail);
    if (e.type === 'hatchling') queueWelcome(e);
  }
  showNextDeath();
  showNextWelcome();
  save();
  if (legacy) store.del('life');             // it lives in the box now
  startReminders();
}

// Reminders survive reloads on their own, but the subscription can be dropped by
// the browser and the forecast is stale the moment the snail was looked after.
async function startReminders() {
  try {
    remindersOn = await push.active();
    if (!remindersOn) { await push.resubscribe(box, getLang()); remindersOn = await push.active(); }
    if (remindersOn) await push.sync(box, getLang());
  } catch { /* the game does not need any of this */ }
}
// Enough of the terrarium to say what changed while you were away.
function snapshot(b) {
  return {
    size: b.best((s2) => s2.size),
    distance: b.snails.reduce((a, s2) => a + s2.distance, 0),
    asleep: b.snails.length > 0 && b.snails.every((s2) => s2.asleep),
  };
}
function begin() {
  $('bar').hidden = false;
  $('stage').hidden = false;
  $('start').hidden = true;
  if (!view) view = new View($('terrarium'));
  refreshAll();
}
function save() {
  if (!box) return;
  store.set('box', box.toJSON());
  store.set('savedAt', Date.now());
  lastSave = Date.now();
}

// ---------- first run ----------
function showStart() {
  $('start').hidden = false;
  $('bar').hidden = true;
  $('stage').hidden = true;
  const prev = store.get('previous', []);
  $('prev-wrap').hidden = !prev.length;
  $('prev-list').innerHTML = prev.slice(-5).reverse().map((p) =>
    `<li>${t('prev.line', { name: escape(p.name), age: fmt.age(p.age, getLang()), dist: fmt.distance(p.distance, getLang()) })}</li>`).join('');
}
$('btn-dice').addEventListener('click', () => { $('name-input').value = NAMES[Math.floor(Math.random() * NAMES.length)]; });
$('btn-lay').addEventListener('click', () => {
  const now = Date.now();
  box = new Box({ born: now });
  layEgg(pickedName(), now);
  begin();
  syncReminders(200);
});
$('egg-close').addEventListener('click', () => { $('egg').hidden = true; });

// A name from the input if there is one, otherwise one of the suggestions, so
// nobody ends up with three snails all called the same thing.
function pickedName() {
  const typed = ($('name-input').value || '').trim().slice(0, 16);
  return typed || freeName();
}

function layEgg(name, now = Date.now()) {
  if (!box || !box.hasRoom()) return null;
  const s2 = box.add({ name, seed: (Date.now() ^ (Math.random() * 0xffffffff)) | 0, now });
  sel = s2;
  box.checkBadges(now);
  box.takeEvents();
  $('name-input').value = '';
  $('egg-name').textContent = name;
  $('egg').hidden = false;
  sfx.crate();
  refreshAll();
  save();
  syncReminders(200);
  return s2;
}

// Another egg, from the snail row or the menu. The box holds three.
function addSnail() {
  if (!box) return;
  if (!box.hasRoom()) { toast(t('add.full', { max: String(SNAIL_MAX) })); return; }
  $('add-name').value = '';
  $('add').hidden = false;
  setTimeout(() => $('add-name').focus(), 50);
}
$('add-dice').addEventListener('click', () => { $('add-name').value = freeName(); });
$('add-cancel').addEventListener('click', () => { $('add').hidden = true; });
$('add-lay').addEventListener('click', () => {
  const typed = ($('add-name').value || '').trim().slice(0, 16);
  $('add').hidden = true;
  layEgg(typed || freeName());
  toast(t('add.laid'));
});

// ---------- the five things you can do ----------
// Water, food, chalk and a wipe are the box's; only petting is done to one
// snail. So the first four wake whoever is sealed in, and the toast says how
// many came out rather than naming one of three.
function act(fn, message) {
  if (!box || !box.snails.length) return;
  const now = Date.now();
  const sleeping = box.snails.filter((s2) => s2.asleep).length;
  fn(now);
  handleEvents();
  if (message) toast(message());
  const woke = sleeping - box.snails.filter((s2) => s2.asleep).length;
  if (woke === 1) toast(t('act.woke', { name: wokeName() }));
  else if (woke > 1) toast(t('act.wokeMany', { n: String(woke) }));
  refreshAll();
  save();
  syncReminders();
}
function wokeName() {
  const s2 = box.snails.slice().sort((a, b) => b.wokeAt - a.wokeAt)[0];
  return s2 ? s2.name : t('start.placeholder');
}
$('a-mist').addEventListener('click', () => act((now) => { box.mist(now); view.mistBurst(); sfx.splash(); }, () => t('act.misted')));
$('a-chalk').addEventListener('click', () => act((now) => { box.chalk(now); sfx.crate(); }, () => t('act.chalked')));
$('a-clean').addEventListener('click', () => act((now) => { box.clean(now); sfx.shove(); }, () => t('act.cleaned')));
$('a-pet').addEventListener('click', () => {
  if (!sel || sel.dead) return;
  act((now) => { box.advanceTo(now); sel.pet(now); sfx.turn(); }, () => t('act.petted', { name: sel.name }));
});
$('a-feed').addEventListener('click', () => {
  if (!box || !box.snails.length) return;
  $('feed-list').innerHTML = FOODS.map((f) =>
    `<button class="food" data-food="${f}"><span class="ico">${FOOD_ICON[f]}</span><span>${t('food.' + f)}</span></button>`).join('');
  $('feed-list').querySelectorAll('[data-food]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.food;
    $('feed').hidden = true;
    act((now) => { box.feed(now, f); sfx.tick(); view.sparkle('#6cc25a', 10); }, () => t('act.fed', { food: t('food.' + f) }));
  }));
  $('feed').hidden = false;
});
$('feed-close').addEventListener('click', () => { $('feed').hidden = true; });

// ---------- events ----------
function handleEvents() {
  let sealed = 0;
  for (const e of box.takeEvents()) {
    switch (e.type) {
      case 'sealed': sealed++; break;          // said once below, however many sealed
      case 'woke': break;                      // act() already says it
      case 'adult': sfx.win(); break;
      case 'badge': {
        toast(t('badge.new', { name: t('badge.' + e.id) }));
        sfx.crate();
        break;
      }
      case 'died': queueDeath(e.snail); break;
      case 'mated':
        toast(t('mated.toast', { a: e.snail.name, b: e.other.name }));
        sfx.win();
        break;
      case 'clutch':
        toast(t('clutch.toast', { name: e.snail.name, eggs: String(e.count) }));
        sfx.crate();
        break;
      case 'hatchling': queueWelcome(e); break;
      case 'garden':
        toast(t('garden.toast', { count: String(e.count) }));
        break;
      default: break;
    }
  }
  if (sealed === 1) toast(t('act.sealed', { name: lastSealedName() }));
  else if (sealed > 1) toast(t('act.sealedMany', { n: String(sealed) }));
  if (sealed) { sfx.tickLow(); syncReminders(); }
  showNextDeath();
  showNextWelcome();
}
function lastSealedName() {
  const s2 = box.snails.find((x) => x.asleep);
  return s2 ? s2.name : t('start.placeholder');
}

// ---------- the screen ----------
function name() { return sel && sel.name ? sel.name : t('start.placeholder'); }

function refreshAll() {
  if (!box || !box.snails.length) return;
  if (!sel || !box.snails.includes(sel)) sel = box.snails[0];
  for (const s2 of box.snails) if (!s2.name) s2.name = box.claimName(nameFor(s2));
  const now = Date.now();
  const lang = getLang();
  refreshRow(now);
  $('bar-name').textContent = name();
  $('bar-stage').textContent = t('stage.' + sel.stage(now));
  const waiting = t('egg.wait', { time: fmt.span(Math.max(0, sel.hatchAt - now), lang) });
  $('mood').textContent = sel.hatched(now) ? t('mood.' + sel.mood(now)) : waiting;
  $('egg-wait').textContent = waiting;
  $('f-age').textContent = fmt.age(sel.ageMs(now), lang);
  $('f-size').textContent = sel.hatched(now) ? fmt.size(sel.size, lang) : t('stats.none');
  $('f-dist').textContent = fmt.distance(sel.distanceAt(now), lang);
  // the bars are the box's condition, shared by everyone in it
  const vals = { moisture: box.moisture, food: box.food, calcium: box.calcium, clean: 1 - box.grime };
  for (const el of document.querySelectorAll('.need')) {
    const v = vals[el.dataset.need];
    el.querySelector('i').style.width = Math.round(v * 100) + '%';
    el.classList.toggle('low', v < 0.25);
  }
  $('a-pet').disabled = !sel || sel.dead;
}

// One portrait per snail, plus a slot for another egg while there is room.
// Tapping one picks whose name, age and diary the rest of the screen is about.
function refreshRow(now) {
  const row = $('snail-row');
  const key = box.snails.map((s2) => s2.seed).join(',') + '|' + box.room;
  if (row.dataset.key !== key) {
    row.dataset.key = key;
    row.replaceChildren();
    for (const s2 of box.snails) {
      const b = document.createElement('button');
      b.className = 'snail-tab';
      b.dataset.seed = String(s2.seed);
      const c = document.createElement('canvas');
      c.width = 56; c.height = 42; c.setAttribute('aria-hidden', 'true');
      b.append(c, document.createElement('span'));
      b.addEventListener('click', () => { sel = s2; refreshAll(); });
      row.append(b);
    }
    if (box.hasRoom()) {
      const a = document.createElement('button');
      a.className = 'snail-tab add';
      a.textContent = '+';
      a.setAttribute('aria-label', t('add.aria'));
      a.addEventListener('click', addSnail);
      row.append(a);
    }
  }
  for (const b of row.querySelectorAll('[data-seed]')) {
    const s2 = box.snails.find((x) => String(x.seed) === b.dataset.seed);
    if (!s2) continue;
    b.classList.toggle('on', s2 === sel);
    b.setAttribute('aria-pressed', String(s2 === sel));
    b.querySelector('span').textContent = s2.name;
    if (s2.hatched(now)) View.drawPortrait(b.querySelector('canvas'), s2);
    else View.drawEggPortrait(b.querySelector('canvas'));
  }
}

let toastT = 0;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { $('toast').hidden = true; }, 2600);
}

// ---------- panels ----------
$('o-diary').addEventListener('click', () => { renderDiary(); $('diary').hidden = false; });
$('diary-close').addEventListener('click', () => { $('diary').hidden = true; });
$('diary-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(diaryText()); toast(t('diary.copied')); } catch { /* no clipboard */ }
});
function renderDiary() {
  const lang = getLang();
  const entries = diaryFor(sel, lang);
  $('diary-title').textContent = t('diary.title.of', { name: name() });
  if (!entries.length) { $('diary-list').innerHTML = `<p class="why">${t('diary.empty')}</p>`; return; }
  $('diary-list').innerHTML = entries.map((e) => {
    const birthday = e.lines.some((l) => l.key === 'd.birthday');
    return `<div class="entry${birthday ? ' birthday' : ''}"><span class="d">${t('diary.day', { day: String(e.day) })}</span>` +
      e.lines.map((l) => `<p>${line(l)}</p>`).join('') + '</div>';
  }).join('');
}
// the diary's food parameter is a key, so it follows the language too
function line(l) {
  const p = { ...l.params };
  if (p.food && String(p.food).startsWith('food.')) p.food = t(p.food);
  return t(l.key, p);
}
function diaryText() {
  const lang = getLang();
  const head = `${name()} — ${t('app.name')} (snails.se/snailstory/)`;
  const body = diaryFor(sel, lang).slice().reverse()
    .map((e) => `${t('diary.day', { day: String(e.day) })}. ${e.lines.map((l) => line(l)).join(' ')}`).join('\n');
  return `${head}\n\n${body}\n`;
}

$('o-badges').addEventListener('click', () => { renderBadges(); $('badges').hidden = false; });
$('badges-close').addEventListener('click', () => { $('badges').hidden = true; });
function renderBadges() {
  $('badges-count').textContent = t('badges.count', { have: String(box.badges.length), all: String(BADGES.length) });
  $('badges-list').innerHTML = BADGES.map((b) => {
    const has = box.badges.includes(b.id);
    return `<li class="${has ? 'have' : 'locked'}"><b>${t('badge.' + b.id)}</b><small>${t('badge.' + b.id + '.how')}</small></li>`;
  }).join('');
}

$('o-stats').addEventListener('click', () => { renderStats(); $('stats').hidden = false; });
$('stats-close').addEventListener('click', () => { $('stats').hidden = true; });
function renderStats() {
  const now = Date.now();
  const lang = getLang();
  const meals = box.totalMeals();
  const fav = box.favouriteFood();
  const left = Math.max(0, sel.dieAt - now);
  const rows = [
    ['stats.born', new Date(sel.laidAt).toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-GB')],
    ['stats.age', fmt.age(sel.ageMs(now), lang)],
    ['stats.stage', t('stage.' + sel.stage(now))],
    ['stats.size', fmt.size(sel.size, lang)],
    ['stats.whorls', fmt.number(sel.whorls(now), 0, lang)],
    ['stats.distance', fmt.distance(sel.distance, lang)],
    ['stats.meals', fmt.number(meals, 0, lang)],
    ['stats.favourite', fav ? t('food.' + fav) : t('stats.none')],
    ['stats.sleep', sel.sealedTicks ? fmt.span(sel.sealedTicks * TICK_MS, lang) : t('stats.none')],
    ['stats.pets', fmt.number(sel.pets, 0, lang)],
    ['stats.lifeLeft', sel.dead ? t('stats.none') : fmt.age(left, lang)],
  ];
  $('stats-title').textContent = t('stats.title', { name: name() });
  $('stats-list').innerHTML = rows.map(([k, v]) => `<dt>${t(k)}</dt><dd>${v}</dd>`).join('');
}

function showAway(before, awayFor) {
  const lang = getLang();
  const after = snapshot(box);
  const grew = after.size - before.size > 0.3;
  const crawled = after.distance - before.distance;
  const bits = [`<p>${t('away.span', { span: fmt.span(awayFor, lang) })}</p>`];
  if (grew) bits.push(`<p>${t('away.grew', { size: fmt.size(after.size, lang) })}</p>`);
  if (crawled > 20) bits.push(`<p>${t('away.crawled', { dist: fmt.distance(crawled, lang) })}</p>`);
  if (after.asleep) bits.push(`<p class="why">${t(before.asleep ? 'away.stillSealed' : 'away.sealed')}</p>`);
  if (bits.length === 1) bits.push(`<p class="why">${t('away.nothing')}</p>`);
  $('away-body').innerHTML = bits.join('');
  $('away').hidden = false;
}
$('away-close').addEventListener('click', () => { $('away').hidden = true; });

// One snail reaching the end no longer ends the game: it leaves the box, its
// numbers go on the shelf of past snails, and whoever is left carries on.
const deaths = [];
function queueDeath(snail) { if (snail && !deaths.includes(snail)) deaths.push(snail); }
function showNextDeath() {
  if (!deaths.length || !$('death').hidden) return;
  const lang = getLang();
  const s2 = deaths[0];
  $('death-body').textContent = t('death.body', {
    name: s2.name, age: fmt.age(s2.dieAt - s2.laidAt, lang),
    dist: fmt.distance(s2.distance, lang), size: fmt.size(s2.size, lang),
  });
  $('death').hidden = false;
  sfx.sudden();
}
// Saying goodbye is what actually takes the snail out of the box, so the panel
// cannot be dismissed into a state where a dead shell is still crawling.
function closeDeath() {
  const s2 = deaths.shift();
  if (s2) {
    remember(s2);
    box.remove(s2);
    if (sel === s2) sel = box.snails[0] || null;
  }
  $('death').hidden = true;
  save();
  syncReminders(200);
  if (!box.snails.length) { startOver({ keepPrevious: true }); return; }
  refreshAll();
  showNextDeath();
  showNextWelcome();
}
// A snail born in the box arrives nameless: the keeper names it. If the app was
// closed when it hatched the panel waits until it is opened again, and anything
// still nameless by then gets a name of its own accord — nobody should ever see
// a blank in the row.
const welcomes = [];
function queueWelcome(e) { welcomes.push(e); }
function showNextWelcome() {
  if (!welcomes.length || !$('welcome').hidden || !$('death').hidden) return;
  const e = welcomes[0];
  if (!box.snails.includes(e.snail)) { welcomes.shift(); return showNextWelcome(); }
  sel = e.snail;
  $('welcome-body').textContent = t('mate.body', {
    mother: e.parents[0] || t('start.placeholder'),
    father: e.parents[1] || t('start.placeholder'),
    rest: String(Math.max(0, e.count - 1)),
  });
  // The panel may open before the screen has refreshed, so it names the snail
  // itself rather than relying on the guard having run. Offering the name means
  // pressing Välkommen keeps it.
  if (!e.snail.name) e.snail.name = nameFor(e.snail);
  $('welcome-name').value = e.snail.name;
  $('welcome').hidden = false;
  sfx.win();
  refreshAll();
}
$('welcome-dice').addEventListener('click', () => { $('welcome-name').value = freeName(); });
$('welcome-ok').addEventListener('click', () => {
  const e = welcomes.shift();
  if (e && box.snails.includes(e.snail)) {
    e.snail.name = box.claimName(($('welcome-name').value || '').trim().slice(0, 16)) || nameFor(e.snail);
    sel = e.snail;
  }
  $('welcome').hidden = true;
  save();
  syncReminders(200);
  refreshAll();
  showNextWelcome();
});

// A name nobody in the box has already.
function freeName() {
  const taken = new Set(spokenFor());
  const free = NAMES.filter((n) => !taken.has(n));
  return (free.length ? free : NAMES)[Math.floor(Math.random() * (free.length || NAMES.length))];
}
// Every name this terrarium has spoken for, the departed included — the box
// keeps the list, so a line of heirs goes on counting after one of them is
// gone. Deliberately not the shelf of past snails: start a new terrarium and
// you may call a snail Majken again.
function spokenFor() {
  if (!box) return [];
  return box.usedNames.concat(box.snails.map((s2) => s2.name)).filter(Boolean);
}
// What to call a snail that turned up with no name of its own. One born here
// takes a parent's name and the next numeral; an egg the keeper laid has nobody
// to take after. The box normally names its own young — this is the fallback,
// and what the dice button falls back to.
function nameFor(s2) {
  return (s2.parents && heirName(s2.parents, s2.seed, spokenFor())) || freeName();
}

function remember(s2) {
  const prev = store.get('previous', []);
  prev.push({ name: s2.name, age: s2.ageMs(Date.now()), distance: s2.distance, size: s2.size, days: s2.days.length });
  store.set('previous', prev.slice(-10));
}
$('death-close').addEventListener('click', closeDeath);
$('death-new').addEventListener('click', () => { closeDeath(); if (box) addSnail(); });
$('m-reset').addEventListener('click', () => {
  if (!box) return;
  $('reset-body').textContent = box.snails.length > 1
    ? t('reset.bodyMany', { n: String(box.snails.length) })
    : t('reset.body', { name: name() });
  $('reset').hidden = false;
});
$('reset-no').addEventListener('click', () => { $('reset').hidden = true; });
$('reset-yes').addEventListener('click', () => { $('reset').hidden = true; startOver(); });
function startOver({ keepPrevious = false } = {}) {
  if (box && !keepPrevious) for (const s2 of box.snails) remember(s2);
  push.clearSchedule().catch(() => {});
  store.del('box');
  store.del('life');
  store.del('savedAt');
  box = null;
  sel = null;
  deaths.length = 0;
  welcomes.length = 0;
  for (const id of ['death', 'menu', 'away', 'diary', 'badges', 'stats', 'egg', 'add', 'welcome']) $(id).hidden = true;
  $('name-input').value = '';
  showStart();
}

// ---------- menu ----------
$('btn-menu').addEventListener('click', () => {
  $('menu-version').textContent = APP_VERSION;
  refreshNotifyButton();
  $('menu').hidden = false;
});
$('m-close').addEventListener('click', () => { $('menu').hidden = true; });
$('m-help').addEventListener('click', () => { $('help').hidden = false; });
$('help-close').addEventListener('click', () => { $('help').hidden = true; });
$('btn-mute').addEventListener('click', () => { setMuted(!isMuted()); store.set('muted', isMuted()); refreshMute(); });
function refreshMute() {
  const m = isMuted();
  $('btn-mute').textContent = m ? '🔇' : '🔊';
  $('btn-mute').setAttribute('aria-label', t(m ? 'aria.unmute' : 'aria.mute'));
}
setMuted(!!store.get('muted', false));
refreshMute();
addEventListener('pointerdown', unlockAudio, { once: true });

document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
  setLang(b.dataset.lang);
  refreshMute();
  refreshNotifyButton();
  if (box) refreshAll(); else showStart();
  if (!$('diary').hidden) renderDiary();
  if (!$('badges').hidden) renderBadges();
  if (!$('stats').hidden) renderStats();
}));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const id of ['help', 'reset', 'feed', 'add', 'welcome', 'diary', 'badges', 'stats', 'away', 'egg', 'menu']) {
    if (!$(id).hidden) { $(id).hidden = true; return; }
  }
});

// ---------- reminders ----------
// The snail's future is known in advance, so the server is handed a list of
// times rather than a copy of the snail. The list is refreshed whenever the app
// is open and whenever the keeper does something that moves it.
let remindersOn = false;
async function refreshNotifyButton() {
  const b = $('m-notify');
  if (!push.supported()) {
    b.hidden = true;
    $('notify-hint').textContent = t('menu.notifyUnsupported');
    return;
  }
  b.hidden = false;
  b.disabled = false;
  if (push.needsInstall()) {
    b.textContent = t('menu.notify');
    b.disabled = true;
    $('notify-hint').textContent = t('menu.notifyInstall');
    return;
  }
  if (push.permission() === 'denied') {
    b.textContent = t('menu.notifyBlocked');
    b.disabled = true;
    $('notify-hint').textContent = t('menu.notifyNote');
    return;
  }
  remindersOn = await push.active();
  b.textContent = t(remindersOn ? 'menu.notifyOff' : 'menu.notify');
  $('notify-hint').textContent = t(remindersOn ? 'menu.notifyOn' : 'menu.notifyNote');
}
$('m-notify').addEventListener('click', async () => {
  const b = $('m-notify');
  b.disabled = true;
  try {
    if (remindersOn) {
      await push.disable();
      toast(t('notify.off'));
    } else {
      const r = await push.enable(box, getLang());
      toast(t(r === 'on' ? 'notify.on' : r === 'blocked' ? 'notify.denied' : r === 'install' ? 'menu.notifyInstall' : 'notify.failed'));
    }
  } catch {
    toast(t('notify.failed'));
  }
  await refreshNotifyButton();
});

// The forecast moves every time the snail is watered or fed, so the server's
// copy is refreshed on a lazy timer and always when the page goes away.
let syncT = 0;
function syncReminders(soon = 3000) {
  if (!remindersOn) return;
  clearTimeout(syncT);
  syncT = setTimeout(() => { push.sync(box, getLang()).catch(() => {}); }, soon);
}
function syncRemindersNow() {
  if (!remindersOn) return;
  clearTimeout(syncT);
  push.sync(box, getLang(), { keepalive: true }).catch(() => {});
}

// ---------- the loop ----------
let lastDay = -1;
function frame() {
  if (box && box.snails.length) {
    const now = Date.now();
    box.advanceTo(now);
    handleEvents();
    if (!$('egg').hidden && box.snails.every((s2) => s2.hatched(now))) $('egg').hidden = true;
    view.draw(box, now);
    const day = sel ? sel.dayIndex(now) : 0;
    if (day !== lastDay) { lastDay = day; refreshAll(); }
    // the portraits are redrawn on refresh, so they need a faster beat while
    // anyone has their eyes pulled in — otherwise the row contradicts the box
    else if (now - lastRefresh > (box.snails.some((s2) => s2.shy(now)) ? 120 : 1000)) refreshScreen(now);
    if (now - lastSave > 30000) save();
  }
  requestAnimationFrame(frame);
}
let lastRefresh = 0;
function refreshScreen(now) { lastRefresh = now; refreshAll(); }
requestAnimationFrame(frame);
addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); syncRemindersNow(); }
  else if (box) { box.advanceTo(Date.now()); handleEvents(); refreshAll(); }
});
addEventListener('pagehide', () => { save(); syncRemindersNow(); });

// ---------- PWA ----------
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('m-install').hidden = false; });
$('m-install').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('m-install').hidden = true;
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => { $('offline-hint').textContent = t('menu.offline'); }).catch(() => {});
  });
}

function escape(s) { return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

// for browser tests and debugging
window.snailstory = {
  get box() { return box; },
  get life() { return sel; },
  get sel() { return sel; },
  get view() { return view; },
  // Nudge the whole terrarium forward, for looking at old snails without
  // waiting. Everything moves together, so the snails keep their ages apart.
  skip(days) {
    const d = days * DAY_MS;
    box.born -= d;
    for (const s2 of box.snails) s2.laidAt -= d;
    box.advanceTo(Date.now());
    handleEvents();
    refreshAll();
    save();
  },
  add(name) { return layEgg(name || 'Testsnigel'); },
  // Rewind the terrarium and replay it as if it had been looked after twice a
  // day the whole time — the only way to see a grown, breeding box without
  // waiting a year for it.
  raise(days) {
    const now = Date.now();
    const d = days * DAY_MS;
    box.born -= d;
    for (const s2 of box.snails) { s2.laidAt -= d; s2.bornTick = 0; }
    for (let t = box.born + 6 * 3600000; t < now; t += 12 * 3600000) {
      box.mist(t); box.feed(t, 'dandelion'); box.chalk(t); box.clean(t);
    }
    box.advanceTo(now);
    handleEvents();
    refreshAll();
    save();
  },
  entryFor, LIFE_DAYS, EGG_MS, SNAIL_MAX,
};

load();
