// Minimal Supabase client: anonymous auth and RPC calls, no library. Trimmed
// from Snäckmageddon's copy — Snail Story has no matches, no e-mail linking and
// no Google, only an invisible account to hang a push subscription on.
//
// The session key is deliberately NOT prefixed per game. Everything on
// snails.se shares one origin and one Supabase project, so a session is not a
// collision — it is the thing that should be shared. A player who already has
// an account from Snäckmageddon or Snäckschack keeps it here. This is the one
// documented exception to the per-game localStorage prefix rule.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const LS_SESSION = 'snackmageddon.session';
let session = null;
let pendingToken = null;

function loadSession() {
  if (session) return session;
  try { session = JSON.parse(localStorage.getItem(LS_SESSION) || 'null'); } catch { session = null; }
  return session;
}
function saveSession(s) {
  session = s;
  try { if (s) localStorage.setItem(LS_SESSION, JSON.stringify(s)); else localStorage.removeItem(LS_SESSION); } catch { /* private mode */ }
}
function jwtSub(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || null; } catch { return null; }
}
async function authRequest(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.msg || data.error_description || data.error || `auth ${res.status}`);
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000, user_id: data.user?.id || jwtSub(data.access_token) };
}

export const online = {
  available() { return !!(SUPABASE_URL && SUPABASE_KEY); },
  userId() { return loadSession()?.user_id || null; },
  signedIn() { return !!loadSession()?.access_token; },

  // A valid access token, signing in anonymously the first time and refreshing
  // when needed. Several callers at start-up share one sign-in rather than
  // making an account each.
  async token() {
    const s = loadSession();
    if (s && s.expires_at - Date.now() > 60000) return s.access_token;
    return this.refreshOnce();
  },
  refreshOnce() {
    if (!pendingToken) pendingToken = this.freshToken().finally(() => { pendingToken = null; });
    return pendingToken;
  },
  async freshToken() {
    let s = loadSession();
    if (s?.refresh_token) {
      try { s = await authRequest('token?grant_type=refresh_token', { refresh_token: s.refresh_token }); saveSession(s); return s.access_token; }
      catch { saveSession(null); }
    }
    s = await authRequest('signup', {});   // anonymous sign-in, enabled in the project
    if (!s.user_id) throw new Error('anonymous sign-in is disabled');
    saveSession(s);
    return s.access_token;
  },
  // A 401 means the stored token is no longer accepted (expired early, or
  // issued by another project): refresh once and try again.
  async authed(run) {
    let res = await run(await this.token());
    if (res.status === 401 && loadSession()?.refresh_token) res = await run(await this.refreshOnce());
    return res;
  },

  // `keepalive` lets a call survive the page being closed, which is exactly
  // when the schedule is worth sending.
  async rpc(name, args = {}, { keepalive = false } = {}) {
    const res = await this.authed((token) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      keepalive,
    }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new Error((data && (data.message || data.hint || data.error)) || `rpc ${name} ${res.status}`);
    return data;
  },
};
