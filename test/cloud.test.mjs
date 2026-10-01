// The client and the database have to agree on what exists. In September a
// migration dropped an RPC signature the deployed clients were still calling;
// the call 404'd, the error was swallowed because everything out there is best
// effort, and nothing said a word. This is the test that would have said it.
//   node test/cloud.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sqlDir = join(root, 'supabase', 'migrations');
const sql = readdirSync(sqlDir).sort().map((f) => readFileSync(join(sqlDir, f), 'utf8')).join('\n');

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

const clientFile = (f) => readFileSync(join(root, 'js', f), 'utf8');
const calls = (src) => [...src.matchAll(/online\.rpc\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);

test('every RPC the client calls exists in a migration', () => {
  const named = new Set([...calls(clientFile('cloud.js')), ...calls(clientFile('push.js'))]);
  assert.ok(named.size >= 6, `found only ${named.size} RPC calls — did the matching break?`);
  for (const name of named) {
    assert.match(sql, new RegExp(`function\\s+public\\.${name}\\s*\\(`),
      `the client calls ${name}(), and no migration creates it`);
  }
});

test('every argument the client sends is one the function takes', () => {
  // Checked by name, because PostgREST picks the overload by argument names and
  // a renamed parameter is as breaking as a dropped function.
  const src = clientFile('cloud.js') + clientFile('push.js');
  for (const m of src.matchAll(/online\.rpc\(\s*'([a-z0-9_]+)'\s*,\s*\{([^}]*)\}/g)) {
    const [, name, body] = m;
    const args = [...body.matchAll(/\b(p_[a-z_]+)\s*:/g)].map((a) => a[1]);
    // The LAST declaration across the migrations in order, because that is the
    // signature the database actually has — and never the `drop function x()`
    // line above it, which has empty parentheses and would fail every call.
    const all = [...sql.matchAll(new RegExp(`create or replace function\\s+public\\.${name}\\s*\\(([^)]*)\\)`, 'gs'))];
    const decl = all[all.length - 1];
    assert.ok(decl, `no declaration found for ${name}`);
    for (const arg of args) {
      assert.match(decl[1], new RegExp(`\\b${arg}\\b`),
        `${name}() is called with ${arg}, which it does not take`);
    }
  }
});

test('the saves table keeps one row per browser, not one per account', () => {
  // Two boxes on one account fought over the reminder schedule in September
  // because the key was the account alone. The same mistake with a whole
  // terrarium would overwrite somebody's snail.
  const saves = readFileSync(join(sqlDir, '20261001100000_snailstory_saves.sql'), 'utf8');
  assert.match(saves, /primary key \(user_id, device\)/, 'the copy is keyed by account alone');
});

test('nothing in the cloud client can throw into the game', () => {
  // Every entry point is awaited by the page inside its own try, so what matters
  // here is that the module never reaches for the DOM or for localStorage: it is
  // handed what it needs, which keeps it testable and keeps the page in charge.
  // Comments stripped first — this file talks about localStorage a great deal.
  const src = clientFile('cloud.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  for (const forbidden of ['document.', 'localStorage', 'window.']) {
    assert.ok(!src.includes(forbidden), `cloud.js reaches for ${forbidden}`);
  }
});

console.log(failed ? `\n${failed} failing` : '\nall good');
process.exit(failed ? 1 : 0);
