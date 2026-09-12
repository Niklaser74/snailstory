// Snail Story: the page around the simulation. Loads the snail, catches it up to
// now, draws it, and wires the five things you can do. All rules live in
// life.js; all sentences live in i18n.js and diary.js.
import { Life, FOODS, LIFE_DAYS, DAY_MS, TICK_MS, BADGES, EGG_MS } from './life.js';
import { entryFor, diaryFor } from './diary.js';
import { View } from './view.js';
import * as fmt from './fmt.js';
import { t, setLang, getLang, detectLang, NAMES } from './i18n.js';
import { setMuted, isMuted, unlockAudio, sfx } from './game/audio.js';
import { APP_VERSION } from './config.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('snailstory.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('snailstory.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('snailstory.' + k); } catch { /* ignore */ } },
};

setLang(detectLang());
let life = null;
let view = null;
let lastSave = 0;
const FOOD_ICON = { lettuce: '🥬', cucumber: '🥒', carrot: '🥕', dandelion: '🌿', apple: '🍎', oats: '🌾' };

// ---------- loading ----------
function load() {
  const saved = store.get('life', null);
  if (!saved) { showStart(); return; }
  try { life = Life.fromJSON(saved); } catch { showStart(); return; }
  const before = snapshot(life);
  const awayFor = Date.now() - (store.get('savedAt', Date.now()) || Date.now());
  life.advanceTo(Date.now());
  begin();
  life.takeEvents();                         // the away panel says it better than toasts
  if (awayFor > 30 * 60 * 1000) showAway(before, awayFor);
  if (life.dead) showDeath();
  else if (!life.hatched(Date.now())) $('egg').hidden = false;
  save();
}
function snapshot(l) {
  return { size: l.size, distance: l.distance, asleep: l.asleep, day: l.dayIndex(Date.now()) };
}
function begin() {
  $('bar').hidden = false;
  $('stage').hidden = false;
  $('start').hidden = true;
  if (!view) view = new View($('box'));
  refreshAll();
}
function save() {
  if (!life) return;
  store.set('life', life.toJSON());
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
  const name = ($('name-input').value || '').trim().slice(0, 16) || t('start.placeholder');
  life = new Life({ seed: (Date.now() ^ (Math.random() * 0xffffffff)) | 0, name, born: Date.now() });
  life.checkBadges(Date.now());
  life.takeEvents();
  begin();
  $('egg').hidden = false;
  sfx.crate();
  save();
});
$('egg').addEventListener('click', () => { $('egg').hidden = true; });

// ---------- the five things you can do ----------
function act(fn, message) {
  if (!life || life.dead) { toast(t('act.dead', { name: name() })); return; }
  const now = Date.now();
  const wasAsleep = life.asleep;
  fn(now);
  handleEvents();
  if (message) toast(message());
  if (wasAsleep && !life.asleep) toast(t('act.woke', { name: name() }));
  refreshAll();
  save();
}
$('a-mist').addEventListener('click', () => act((now) => { life.mist(now); view.mistBurst(); sfx.splash(); }, () => t('act.misted')));
$('a-chalk').addEventListener('click', () => act((now) => { life.chalk(now); sfx.crate(); }, () => t('act.chalked')));
$('a-clean').addEventListener('click', () => act((now) => { life.clean(now); sfx.shove(); }, () => t('act.cleaned')));
$('a-pet').addEventListener('click', () => act((now) => { life.pet(now); sfx.turn(); }, () => t('act.petted')));
$('a-feed').addEventListener('click', () => {
  if (!life || life.dead) { toast(t('act.dead', { name: name() })); return; }
  $('feed-list').innerHTML = FOODS.map((f) =>
    `<button class="food" data-food="${f}"><span class="ico">${FOOD_ICON[f]}</span><span>${t('food.' + f)}</span></button>`).join('');
  $('feed-list').querySelectorAll('[data-food]').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.food;
    $('feed').hidden = true;
    act((now) => { life.feed(now, f); sfx.tick(); view.sparkle('#6cc25a', 10); }, () => t('act.fed', { food: t('food.' + f) }));
  }));
  $('feed').hidden = false;
});
$('feed-close').addEventListener('click', () => { $('feed').hidden = true; });

// ---------- events ----------
function handleEvents() {
  for (const e of life.takeEvents()) {
    switch (e.type) {
      case 'sealed': toast(t('act.sealed', { name: name() })); notify(t('notify.sealed', { name: name() })); sfx.tickLow(); break;
      case 'woke': break;                      // act() already says it
      case 'adult': sfx.win(); break;
      case 'badge': {
        const b = t('badge.' + e.id);
        toast(t('badge.new', { name: b }));
        sfx.crate();
        if (e.id === 'hatched') notify(t('egg.hatched', { name: name() }));
        break;
      }
      case 'day': {
        const d = e.day.d;
        if (d > 0 && d % 365 === 0) notify(t('notify.birthday', { name: name(), years: String(Math.floor(d / 365)) }));
        break;
      }
      case 'died': showDeath(); break;
      default: break;
    }
  }
}

// ---------- the screen ----------
function name() { return life && life.name ? life.name : t('start.placeholder'); }

function refreshAll() {
  if (!life) return;
  const now = Date.now();
  const lang = getLang();
  $('bar-name').textContent = name();
  $('bar-stage').textContent = t('stage.' + life.stage(now));
  View.drawPortrait($('portrait'), life);
  const waiting = t('egg.wait', { time: fmt.span(Math.max(0, life.hatchAt - now), lang) });
  $('mood').textContent = life.hatched(now) ? t('mood.' + life.mood(now)) : waiting;
  $('egg-wait').textContent = waiting;
  $('f-age').textContent = fmt.age(life.ageMs(now), lang);
  $('f-size').textContent = life.hatched(now) ? fmt.size(life.size, lang) : t('stats.none');
  $('f-dist').textContent = fmt.distance(life.distanceAt(now), lang);
  const vals = { moisture: life.moisture, food: life.food, calcium: life.calcium, clean: 1 - life.grime };
  for (const el of document.querySelectorAll('.need')) {
    const v = vals[el.dataset.need];
    el.querySelector('i').style.width = Math.round(v * 100) + '%';
    el.classList.toggle('low', v < 0.25);
  }
  const done = life.dead;
  for (const id of ['a-mist', 'a-feed', 'a-chalk', 'a-clean', 'a-pet']) $(id).disabled = done;
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
  const entries = diaryFor(life, lang);
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
  const body = diaryFor(life, lang).slice().reverse()
    .map((e) => `${t('diary.day', { day: String(e.day) })}. ${e.lines.map((l) => line(l)).join(' ')}`).join('\n');
  return `${head}\n\n${body}\n`;
}

$('o-badges').addEventListener('click', () => { renderBadges(); $('badges').hidden = false; });
$('badges-close').addEventListener('click', () => { $('badges').hidden = true; });
function renderBadges() {
  $('badges-count').textContent = t('badges.count', { have: String(life.badges.length), all: String(BADGES.length) });
  $('badges-list').innerHTML = BADGES.map((b) => {
    const has = life.badges.includes(b.id);
    return `<li class="${has ? 'have' : 'locked'}"><b>${t('badge.' + b.id)}</b><small>${t('badge.' + b.id + '.how')}</small></li>`;
  }).join('');
}

$('o-stats').addEventListener('click', () => { renderStats(); $('stats').hidden = false; });
$('stats-close').addEventListener('click', () => { $('stats').hidden = true; });
function renderStats() {
  const now = Date.now();
  const lang = getLang();
  const meals = Object.values(life.meals).reduce((a, b) => a + b, 0);
  const fav = life.favouriteFood();
  const left = Math.max(0, life.dieAt - now);
  const rows = [
    ['stats.born', new Date(life.born).toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-GB')],
    ['stats.age', fmt.age(life.ageMs(now), lang)],
    ['stats.stage', t('stage.' + life.stage(now))],
    ['stats.size', fmt.size(life.size, lang)],
    ['stats.whorls', fmt.number(life.whorls(now), 0, lang)],
    ['stats.distance', fmt.distance(life.distance, lang)],
    ['stats.meals', fmt.number(meals, 0, lang)],
    ['stats.favourite', fav ? t('food.' + fav) : t('stats.none')],
    ['stats.sleep', life.sealedTicks ? fmt.span(life.sealedTicks * TICK_MS, lang) : t('stats.none')],
    ['stats.pets', fmt.number(life.pets, 0, lang)],
    ['stats.lifeLeft', life.dead ? t('stats.none') : fmt.age(left, lang)],
  ];
  $('stats-title').textContent = t('stats.title', { name: name() });
  $('stats-list').innerHTML = rows.map(([k, v]) => `<dt>${t(k)}</dt><dd>${v}</dd>`).join('');
}

function showAway(before, awayFor) {
  const lang = getLang();
  const grew = life.size - before.size > 0.3;
  const crawled = life.distance - before.distance;
  const bits = [`<p>${t('away.span', { span: fmt.span(awayFor, lang) })}</p>`];
  if (grew) bits.push(`<p>${t('away.grew', { size: fmt.size(life.size, lang) })}</p>`);
  if (crawled > 20) bits.push(`<p>${t('away.crawled', { dist: fmt.distance(crawled, lang) })}</p>`);
  if (life.asleep) bits.push(`<p class="why">${t(before.asleep ? 'away.stillSealed' : 'away.sealed')}</p>`);
  if (bits.length === 1) bits.push(`<p class="why">${t('away.nothing')}</p>`);
  $('away-body').innerHTML = bits.join('');
  $('away').hidden = false;
}
$('away-close').addEventListener('click', () => { $('away').hidden = true; });

function showDeath() {
  const lang = getLang();
  $('death-body').textContent = t('death.body', {
    name: name(), age: fmt.age(life.dieAt - life.born, lang),
    dist: fmt.distance(life.distance, lang), size: fmt.size(life.size, lang),
  });
  $('death').hidden = false;
  sfx.sudden();
}
$('death-close').addEventListener('click', () => { $('death').hidden = true; });
$('death-new').addEventListener('click', () => startOver());
$('m-reset').addEventListener('click', () => {
  $('reset-body').textContent = t('reset.body', { name: name() });
  $('reset').hidden = false;
});
$('reset-no').addEventListener('click', () => { $('reset').hidden = true; });
$('reset-yes').addEventListener('click', () => { $('reset').hidden = true; startOver(); });
function startOver() {
  if (life) {
    const prev = store.get('previous', []);
    prev.push({ name: name(), age: life.ageMs(Date.now()), distance: life.distance, size: life.size, days: life.days.length });
    store.set('previous', prev.slice(-10));
  }
  store.del('life');
  store.del('savedAt');
  life = null;
  for (const id of ['death', 'menu', 'away', 'diary', 'badges', 'stats', 'egg']) $(id).hidden = true;
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
  if (life) refreshAll(); else showStart();
  if (!$('diary').hidden) renderDiary();
  if (!$('badges').hidden) renderBadges();
  if (!$('stats').hidden) renderStats();
}));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const id of ['help', 'reset', 'feed', 'diary', 'badges', 'stats', 'away', 'egg', 'menu']) {
    if (!$(id).hidden) { $(id).hidden = true; return; }
  }
});

// ---------- reminders ----------
// Local notifications only: they fire while the page is alive, which covers the
// tab you left open. Scheduled push needs a server, and that is a later step.
function refreshNotifyButton() {
  const b = $('m-notify');
  if (!('Notification' in window)) { b.hidden = true; $('notify-hint').hidden = true; return; }
  if (Notification.permission === 'granted') { b.textContent = t('menu.notifyOn'); b.disabled = true; }
  else if (Notification.permission === 'denied') { b.textContent = t('menu.notifyBlocked'); b.disabled = true; }
  else { b.textContent = t('menu.notify'); b.disabled = false; }
}
$('m-notify').addEventListener('click', async () => {
  if (!('Notification' in window)) return;
  try { await Notification.requestPermission(); } catch { /* ignore */ }
  refreshNotifyButton();
});
function notify(text) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden) return;                       // no need to tell you what you can see
  try { new Notification(t('app.name'), { body: text, icon: 'icons/icon-192.png', tag: 'snailstory' }); } catch { /* ignore */ }
}

// ---------- the loop ----------
let lastDay = -1;
function frame() {
  if (life) {
    const now = Date.now();
    const hatched = life.hatched(now);
    life.advanceTo(now);
    handleEvents();
    if (hatched && !$('egg').hidden) $('egg').hidden = true;
    view.draw(life, now, life.tz);
    const day = life.dayIndex(now);
    if (day !== lastDay) { lastDay = day; refreshAll(); }
    else if (now - lastRefresh > 1000) refreshScreen(now);
    if (now - lastSave > 30000) save();
  }
  requestAnimationFrame(frame);
}
let lastRefresh = 0;
function refreshScreen(now) { lastRefresh = now; refreshAll(); }
requestAnimationFrame(frame);
addEventListener('visibilitychange', () => { if (document.hidden) save(); else if (life) { life.advanceTo(Date.now()); handleEvents(); refreshAll(); } });
addEventListener('pagehide', save);

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
  get life() { return life; },
  get view() { return view; },
  // Nudge the whole life forward, for looking at an old snail without waiting.
  skip(days) { life.born -= days * DAY_MS; life.advanceTo(Date.now()); handleEvents(); refreshAll(); save(); },
  entryFor, LIFE_DAYS, EGG_MS,
};

load();
