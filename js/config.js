// Bumped when the shipped files change, so the menu can show what is running.
// Keep it in step with the sw.js cache version.
export const APP_VERSION = 'v2';

// Reminders only. The game itself needs no server and no account: this is used
// the moment the player turns notifications on, and never before. The
// publishable key is meant to be public — row level security and the
// security-definer functions decide what it may do. Blank the URL to turn
// reminders off everywhere.
export const SUPABASE_URL = 'https://lygpfumngyebxoqqncet.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Nmes72jfyETXQZsiYjsokw_tMusjKI-';
// Web Push (VAPID) public key, shared with the rest of the series; the private
// half lives in Supabase Vault and only the edge function can read it.
export const VAPID_PUBLIC_KEY = 'BG_p9tfa6FCNA-aqH4D0fiVfn0tnvLcwVYGtoAOA6NpDi-Mv6SojFcltzXZutx6GgAenDLeEe07dXve6iUS21mI';
