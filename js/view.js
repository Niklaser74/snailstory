// The terrarium on canvas, from the side, because the series' snail renderer is
// a side view. A glass box on a table with a window behind it: the sky in that
// window is the real sky, so you can tell at a glance whether the snail is in
// its active hours.
//
// The snail's place in the box is a pure function of how far it has crawled.
// The interior is a rounded rectangle about a metre around, so every metre on
// the odometer is one lap of the glass — no separate position to keep, save or
// get out of step with the simulation.
import { drawSnail } from './game/snails.js';
import { gardenHour, isNight } from './life.js';

// interior of the box, in millimetres: a realistic 30 × 24 cm keeper's box
export const BOX_W = 300;
export const BOX_H = 240;
const CORNER = 25;                 // the snail rounds the corners
const SOIL = 34;                   // depth of soil, mm
const INK = '#3a2210';
// the scene is 1,45 box heights tall: wall above, box, table below
const SCENE = 1.25;   // the least room the scene needs: wall, box, table

// the rounded-rectangle path, walked by arc length
const STRAIGHT_X = BOX_W - 2 * CORNER;
const STRAIGHT_Y = BOX_H - 2 * CORNER;
const ARC = (Math.PI / 2) * CORNER;
export const PERIMETER = 2 * STRAIGHT_X + 2 * STRAIGHT_Y + 4 * ARC;

// Where on the glass a snail that has crawled `mm` is, in box millimetres with
// (0,0) at the top left of the interior, plus the outward surface normal.
export function placeOnPath(mm) {
  let s = ((mm % PERIMETER) + PERIMETER) % PERIMETER;
  // 1. the floor, left to right
  if (s < STRAIGHT_X) return { x: CORNER + s, y: BOX_H, nx: 0, ny: -1 };
  s -= STRAIGHT_X;
  if (s < ARC) return corner(BOX_W - CORNER, BOX_H - CORNER, Math.PI / 2, -s / CORNER);
  s -= ARC;
  // 3. up the right wall
  if (s < STRAIGHT_Y) return { x: BOX_W, y: BOX_H - CORNER - s, nx: -1, ny: 0 };
  s -= STRAIGHT_Y;
  if (s < ARC) return corner(BOX_W - CORNER, CORNER, 0, -s / CORNER);
  s -= ARC;
  // 5. along the lid, right to left, upside down
  if (s < STRAIGHT_X) return { x: BOX_W - CORNER - s, y: 0, nx: 0, ny: 1 };
  s -= STRAIGHT_X;
  if (s < ARC) return corner(CORNER, CORNER, -Math.PI / 2, -s / CORNER);
  s -= ARC;
  // 7. down the left wall
  if (s < STRAIGHT_Y) return { x: 0, y: CORNER + s, nx: 1, ny: 0 };
  s -= STRAIGHT_Y;
  return corner(CORNER, BOX_H - CORNER, Math.PI, -s / CORNER);
}
function corner(cx, cy, a0, da) {
  const a = a0 + da;
  // the normal points out of the corner, the position sits on it
  const nx = -Math.cos(a), ny = -Math.sin(a);
  return { x: cx - nx * CORNER, y: cy - ny * CORNER, nx, ny };
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.trails = new Map();      // snail seed -> { mm, until }: slime dries a minute after it stops
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(canvas);
    this.layout();
  }

  layout() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.cw = Math.max(1, rect.width);
    this.ch = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cw * dpr);
    this.canvas.height = Math.round(this.ch * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The scene is the box plus a band of wall above it and a strip of table
    // below, and it is centred in whatever canvas it is given. Anything outside
    // it is left clear so the page's own dark room shows through.
    this.k = Math.min((this.cw * 0.94) / BOX_W, this.ch / (BOX_H * SCENE));
    this.bw = BOX_W * this.k;
    this.bh = BOX_H * this.k;
    this.bx = (this.cw - this.bw) / 2;
    this.sceneTop = 0;
    this.sceneBottom = this.ch;
    // whatever height is left over becomes more wall above and more table below
    this.by = (this.ch - this.bh) * 0.52;
  }

  // box millimetres -> canvas pixels
  px(x) { return this.bx + x * this.k; }
  py(y) { return this.by + y * this.k; }

  // The box, then everyone in it. Snails are drawn back to front by how far
  // round the glass they are, so one crawling past another overlaps sensibly.
  draw(box, now) {
    const ctx = this.ctx;
    const hour = gardenHour(now, box.tz) + (new Date(now).getMinutes()) / 60;
    const night = isNight(now, box.tz);
    ctx.clearRect(0, 0, this.cw, this.ch);
    this.room(hour, night);
    this.glassBack(box);
    this.soil(box);
    this.furniture(box, now);
    for (const s of box.snails) {
      if (!s.hatched(now)) this.egg(now, s);
      else this.snail(s, now);
    }
    this.glassFront(box, night);
    this.drawParticles(1 / 60);
  }

  // ---------- the room behind the glass ----------
  room(hour, night) {
    const ctx = this.ctx;
    // wall
    const top = this.sceneTop;
    const wall = ctx.createLinearGradient(0, top, 0, this.sceneBottom);
    if (night) { wall.addColorStop(0, '#26313d'); wall.addColorStop(1, '#1b242d'); }
    else { wall.addColorStop(0, '#f0e3cb'); wall.addColorStop(1, '#dccbad'); }
    ctx.fillStyle = wall;
    ctx.fillRect(0, top, this.cw, this.sceneBottom - top);

    // a window with the real sky in it, above and behind the box
    const ww = Math.min(this.cw * 0.34, 220);
    const wh = ww * 0.8;
    const wx = this.cw - ww - this.cw * 0.05;
    const wy = Math.max(this.sceneTop + 4, this.by - wh - this.ch * 0.03);
    const sky = ctx.createLinearGradient(0, wy, 0, wy + wh);
    const [a, b] = skyColors(hour);
    sky.addColorStop(0, a); sky.addColorStop(1, b);
    ctx.fillStyle = sky;
    ctx.fillRect(wx, wy, ww, wh);
    if (night) {
      // a moon and a few stars, always in the same places
      ctx.fillStyle = 'rgba(255,250,220,0.92)';
      ctx.beginPath(); ctx.arc(wx + ww * 0.7, wy + wh * 0.3, ww * 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const [sxp, syp] of [[0.2, 0.2], [0.35, 0.45], [0.55, 0.16], [0.8, 0.6], [0.12, 0.6]]) {
        ctx.beginPath(); ctx.arc(wx + ww * sxp, wy + wh * syp, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(wx + ww * 0.22, wy + wh * 0.33, ww * 0.16, wh * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(wx + ww * 0.42, wy + wh * 0.28, ww * 0.12, wh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    }
    // frame and bars
    ctx.strokeStyle = night ? '#3b4957' : '#8a6a44';
    ctx.lineWidth = Math.max(3, ww * 0.035);
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.lineWidth = Math.max(1.5, ww * 0.016);
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
    ctx.stroke();

    // the table the box stands on
    const ty = this.by + this.bh;
    const tb = ctx.createLinearGradient(0, ty, 0, this.sceneBottom);
    if (night) { tb.addColorStop(0, '#4a3a2c'); tb.addColorStop(1, '#2e241b'); }
    else { tb.addColorStop(0, '#a5763f'); tb.addColorStop(1, '#7a5530'); }
    ctx.fillStyle = tb;
    ctx.fillRect(0, ty, this.cw, this.sceneBottom - ty);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, ty, this.cw, Math.max(2, this.k * 1.2));
  }

  // ---------- the box ----------
  glassBack(b) {
    const ctx = this.ctx;
    const inside = ctx.createLinearGradient(0, this.py(0), 0, this.py(BOX_H));
    inside.addColorStop(0, 'rgba(86,116,100,0.55)');
    inside.addColorStop(1, 'rgba(52,74,62,0.40)');
    ctx.fillStyle = inside;
    ctx.fillRect(this.px(0), this.py(0), this.bw, this.bh);
    // the mesh lid
    const lidH = Math.max(5, this.k * 7);
    ctx.fillStyle = '#6b533a';
    ctx.fillRect(this.px(0) - this.k * 4, this.py(0) - lidH, this.bw + this.k * 8, lidH);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    for (let x = 0; x < this.bw; x += Math.max(4, this.k * 4)) {
      ctx.beginPath(); ctx.moveTo(this.px(0) + x, this.py(0) - lidH); ctx.lineTo(this.px(0) + x, this.py(0)); ctx.stroke();
    }
  }

  soil(b) {
    const ctx = this.ctx;
    const top = this.py(BOX_H - SOIL);
    const g = ctx.createLinearGradient(0, top, 0, this.py(BOX_H));
    g.addColorStop(0, '#6e4324'); g.addColorStop(1, '#4a2c16');
    ctx.fillStyle = g;
    ctx.fillRect(this.px(0), top, this.bw, SOIL * this.k);
    // speckle, same every frame
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 90; i++) {
      const r = ((i * 2654435761) % 1000) / 1000;
      const r2 = ((i * 40503) % 997) / 997;
      ctx.beginPath(); ctx.arc(this.px(r * BOX_W), top + r2 * SOIL * this.k, Math.max(0.7, this.k * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    // moss along the back
    ctx.fillStyle = '#4c9a3f';
    for (let i = 0; i < 7; i++) {
      const x = 20 + i * 40 + (i % 3) * 6;
      ctx.beginPath(); ctx.ellipse(this.px(x), top + this.k * 2, this.k * 9, this.k * 3.2, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // the leaf, the cuttlefish bone and the water bowl, all readable as meters
  furniture(b, now) {
    const ctx = this.ctx;
    const k = this.k;
    const ground = this.py(BOX_H - SOIL);

    // the lettuce leaf shrinks as the food runs out
    const f = b.food;
    if (f > 0.02) {
      const x = this.px(70), y = ground + k * 1.5;
      const w = k * 26 * (0.35 + 0.65 * f), h = k * 13 * (0.4 + 0.6 * f);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.12);
      ctx.fillStyle = '#6cc25a';
      ctx.strokeStyle = '#3f8f3b';
      ctx.lineWidth = Math.max(1, k * 0.5);
      ctx.beginPath(); ctx.ellipse(0, -h * 0.5, w, h, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.moveTo(-w * 0.8, -h * 0.5); ctx.lineTo(w * 0.8, -h * 0.55); ctx.stroke();
      // bites out of the edge once it is half eaten
      if (f < 0.7) {
        ctx.fillStyle = '#6e4324';
        for (let i = 0; i < 3; i++) {
          const a = -0.6 + i * 0.7;
          ctx.beginPath(); ctx.arc(Math.cos(a) * w * 0.9, -h * 0.5 + Math.sin(a) * h * 0.9, k * 3 * (1 - f), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // the cuttlefish bone: a pale oval half in the soil
    const c = b.calcium;
    if (c > 0.02) {
      const x = this.px(225), y = ground + k * 3;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.2);
      ctx.fillStyle = '#f4efe2';
      ctx.strokeStyle = '#cdc3ad';
      ctx.lineWidth = Math.max(1, k * 0.4);
      ctx.beginPath(); ctx.ellipse(0, 0, k * 16 * (0.4 + 0.6 * c), k * 5 * (0.5 + 0.5 * c), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * k * 5, -k * 3); ctx.lineTo(i * k * 5, k * 3); ctx.stroke(); }
      ctx.restore();
    }

    // a shallow water dish, fuller when the box is damp
    const x = this.px(160), y = ground + k * 2;
    ctx.fillStyle = '#c9b89c';
    ctx.beginPath(); ctx.ellipse(x, y, k * 14, k * 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(90,160,210,${(0.25 + 0.55 * b.moisture).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(x, y - k * 0.6, k * 11 * (0.5 + 0.5 * b.moisture), k * 3 * (0.5 + 0.5 * b.moisture), 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- the animal ----------
  egg(now, life) {
    const ctx = this.ctx;
    const k = this.k;
    const x = this.px(70 + life.offset * 160), y = this.py(BOX_H - SOIL) + k * 4;
    const r = k * 7;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.5, r * 1.1, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.3);
    g.addColorStop(0, '#fffdf5'); g.addColorStop(1, '#e4dcc6');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#cfc5aa';
    ctx.lineWidth = Math.max(1, k * 0.4);
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.4, r * 0.82, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // The box is drawn to scale; the snail is not. A 3,5 mm hatchling would be
  // four pixels of nothing, so the drawn size has a floor and grows about
  // threefold across the life instead of tenfold.
  visualSize(life) { return 9 + life.size * 0.8; }

  snail(life, now) {
    const ctx = this.ctx;
    const k = this.k;
    const vs = this.visualSize(life);
    const mm = life.distanceAt(now);
    // the trail is this snail's own, so two crawling at once do not blink
    const seen = this.trails.get(life.seed);
    if (!seen || mm !== seen.mm) this.trails.set(life.seed, { mm, until: now + 60000 });
    const trailUntil = this.trails.get(life.seed).until;
    // Where on the lap it is. The offset keeps three eggs laid the same evening
    // from sitting in exactly one spot; an empty shell ends up on the soil.
    const along = (mm + life.offset * PERIMETER) % PERIMETER;
    const p = life.dead ? placeOnPath(PERIMETER * 0.12) : placeOnPath(along);
    const x = this.px(p.x), y = this.py(p.y);
    const angle = Math.atan2(p.nx, -p.ny);

    // the slime behind it, drying
    const fade = Math.max(0, Math.min(1, (trailUntil - now) / 60000));
    if (fade > 0 && mm > 2 && !life.dead) {
      ctx.save();
      ctx.strokeStyle = `rgba(190,255,150,${(0.5 * fade).toFixed(3)})`;
      ctx.lineWidth = Math.max(2, k * vs * 0.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const len = Math.min(mm, 150);
      for (let i = 0; i <= 14; i++) {
        const q = placeOnPath(along - (len * i) / 14);
        const qx = this.px(q.x), qy = this.py(q.y);
        if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
      }
      ctx.stroke();
      ctx.restore();
    }

    const sealed = life.asleep;
    const scale = (vs / 27) * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (life.dead) {
      drawSnail(ctx, 'cartoon', { x: 0, y: 0, facing: 1, color: life.color, scale, t: now / 1000, dead: true });
    } else if (sealed) {
      this.sealedShell(life, scale);
    } else {
      // Touched, or just out of dormancy: either way the eye stalks are in and
      // on their way out, and it does not move until they are.
      const pulled = life.stalkRetraction(now);
      drawSnail(ctx, 'cartoon', {
        x: 0, y: 0, facing: 1, color: life.color, scale,
        t: now / 1000,
        walking: !this.reduced && life.movingAt(now) && !life.shy(now),
        // reduced motion gets the same envelope, snapped rather than eased
        retract: this.reduced ? (pulled > 0.5 ? 1 : 0) : pulled,
        look: { shell: life.pattern, hat: 'none' },
      });
    }
    ctx.restore();
  }

  // A sealed snail is just the shell with a dry white membrane across the mouth.
  sealedShell(life, scale) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.fillStyle = life.color;
    ctx.beginPath(); ctx.arc(0, -13, 13.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#fff3d6';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -13, 9, 0.4, 4.6);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -13, 4.5, 1.2, 5.2); ctx.stroke();
    // the membrane: a chalky disc against the ground
    ctx.fillStyle = '#f6f1e4';
    ctx.strokeStyle = '#d8cfba';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(2, -4, 8, 4.5, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------- the glass in front ----------
  glassFront(b, night) {
    const ctx = this.ctx;
    const k = this.k;
    const x = this.px(0), y = this.py(0);
    // condensation when it is damp
    if (b.moisture > 0.45) {
      ctx.fillStyle = `rgba(255,255,255,${(0.10 * (b.moisture - 0.45) / 0.55 + 0.05).toFixed(3)})`;
      for (let i = 0; i < 26; i++) {
        const a = ((i * 2654435761) % 1000) / 1000;
        const b = ((i * 48271) % 991) / 991;
        ctx.beginPath(); ctx.arc(x + a * this.bw, y + b * this.bh * 0.8, k * (0.6 + b * 1.2), 0, Math.PI * 2); ctx.fill();
      }
    }
    // algae and smears when it has not been cleaned
    if (b.grime > 0.25) {
      const g = (b.grime - 0.25) / 0.75;
      ctx.fillStyle = `rgba(90,130,60,${(0.3 * g).toFixed(3)})`;
      for (let i = 0; i < 18; i++) {
        const a = ((i * 1103515245) % 1000) / 1000;
        const b = ((i * 12345) % 977) / 977;
        ctx.beginPath(); ctx.ellipse(x + a * this.bw, y + (0.2 + b * 0.8) * this.bh, k * (2 + b * 5) * g, k * (1.2 + a * 3) * g, a * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // the glass itself: a highlight and a frame
    const gl = ctx.createLinearGradient(x, y, x + this.bw, y + this.bh);
    gl.addColorStop(0, 'rgba(255,255,255,0.16)');
    gl.addColorStop(0.35, 'rgba(255,255,255,0.03)');
    gl.addColorStop(1, 'rgba(255,255,255,0.10)');
    ctx.fillStyle = gl;
    ctx.fillRect(x, y, this.bw, this.bh);
    ctx.strokeStyle = night ? 'rgba(190,215,230,0.55)' : 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(2, k * 1.6);
    ctx.strokeRect(x, y, this.bw, this.bh);
    if (night) { ctx.fillStyle = 'rgba(20,30,45,0.22)'; ctx.fillRect(x, y, this.bw, this.bh); }
  }

  // ---------- effects ----------
  // a spray of water, in box millimetres
  mistBurst() {
    if (this.reduced) return;
    for (let i = 0; i < 26; i++) {
      this.particles.push({
        x: Math.random() * BOX_W, y: Math.random() * BOX_H * 0.5,
        vx: (Math.random() - 0.5) * 20, vy: 40 + Math.random() * 60,
        life: 0.5 + Math.random() * 0.6, color: 'rgba(180,220,245,0.9)', size: 1 + Math.random() * 1.6,
      });
    }
  }
  sparkle(color = '#fff', n = 14) {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: BOX_W / 2 + Math.cos(a) * 30, y: BOX_H * 0.45 + Math.sin(a) * 20,
        vx: Math.cos(a) * 30, vy: Math.sin(a) * 30,
        life: 0.4 + Math.random() * 0.5, color, size: 1.2 + Math.random() * 1.6,
      });
    }
  }
  drawParticles(h) {
    const ctx = this.ctx;
    const alive = [];
    for (const p of this.particles) {
      p.life -= h;
      if (p.life <= 0) continue;
      p.x += p.vx * h; p.y += p.vy * h;
      p.vy += 60 * h;
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(this.px(p.x), this.py(p.y), p.size * this.k * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      alive.push(p);
    }
    this.particles = alive;
  }

  // The little snail next to the name in the top bar, and the shell in panels.
  static drawPortrait(canvas, life) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth || 48;
    const h = canvas.clientHeight || 36;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const scale = Math.min(w / 52, h / 44);
    drawSnail(ctx, 'cartoon', {
      x: w / 2, y: h - 2, facing: 1, color: life.color, scale,
      t: 0, walking: false, retract: life.stalkRetraction(Date.now()),
      look: { shell: life.pattern, hat: 'none' },
    });
  }

  // A snail that has not hatched yet has no portrait, so its tab shows the egg.
  static drawEggPortrait(canvas) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = canvas.clientWidth || 48;
    const h = canvas.clientHeight || 36;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const r = Math.min(w, h) * 0.32;
    const x = w / 2, y = h * 0.56;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, r * 0.9, r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.3);
    g.addColorStop(0, '#fffdf5'); g.addColorStop(1, '#e4dcc6');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#cfc5aa';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

// Dawn, day, dusk, night — two stops for a gradient in the window.
function skyColors(hour) {
  const table = [
    [0, ['#0b1733', '#132344']],
    [5, ['#1d2b4d', '#5a4a63']],
    [6.5, ['#e98b5a', '#f3c98b']],
    [8, ['#7cc0ef', '#cfe8ff']],
    [14, ['#5fb0ea', '#bfe3ff']],
    [19, ['#73b4e6', '#f0d2a0']],
    [20.5, ['#c9713f', '#f0b276']],
    [21.5, ['#3b3a63', '#6d5a72']],
    [23, ['#0f1c3a', '#17264a']],
    [24, ['#0b1733', '#132344']],
  ];
  for (let i = 1; i < table.length; i++) {
    if (hour <= table[i][0]) {
      const [h0, c0] = table[i - 1], [h1, c1] = table[i];
      const f = (hour - h0) / (h1 - h0 || 1);
      return [mix(c0[0], c1[0], f), mix(c0[1], c1[1], f)];
    }
  }
  return table[0][1];
}
function mix(a, b, f) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round((((pa >> sh) & 255) * (1 - f) + ((pb >> sh) & 255) * f));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
