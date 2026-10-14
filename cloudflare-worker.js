// China trip sync API — Cloudflare Worker + D1
// Bind a D1 database to this Worker with the variable name: DB
// The app calls POST /rest/v1/rpc/<function> (same as the Supabase version).

const TRIP_CODE = 'CHANGE-ME';               // secret trip code — share only inside the group
const MEMBERS = ['james', 'link', 'peach', 'new', 'june'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const done = () => new Response(null, { status: 204, headers: CORS });
const fail = (message, status = 400) => json({ message }, status);

let ready = false;
async function ensureSchema(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS locations (
      member TEXT PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL, acc REAL, updated_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL,
      payer TEXT NOT NULL, split TEXT NOT NULL, category TEXT, spent_at TEXT NOT NULL,
      created_by TEXT, deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS plan (
      id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`),
  ]);
  ready = true;
}

const isMember = (m) => MEMBERS.includes(m);
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const m = new URL(req.url).pathname.match(/\/rpc\/([a-z_]+)$/);
    if (req.method !== 'POST' || !m) return fail('Not found', 404);
    if (!env.DB) return fail('D1 database is not bound as DB', 500);

    let a;
    try { a = await req.json(); } catch { return fail('invalid JSON'); }
    if (!a || a.p_code !== TRIP_CODE) return fail('invalid trip code');

    const db = env.DB;
    await ensureSchema(db);
    const now = new Date().toISOString();

    switch (m[1]) {
      case 'trip_state': {
        const [locs, exps, plan] = await db.batch([
          db.prepare('SELECT member, lat, lon, acc, updated_at FROM locations'),
          db.prepare('SELECT * FROM expenses WHERE deleted = 0 ORDER BY spent_at DESC'),
          db.prepare('SELECT id, data, updated_at FROM plan'),
        ]);
        return json({
          now,
          locations: locs.results.map((r) => ({ member: r.member, lat: r.lat, lon: r.lon, acc: r.acc, at: r.updated_at })),
          expenses: exps.results.map((r) => ({
            id: r.id, title: r.title, amount: r.amount, currency: r.currency, payer: r.payer,
            split: JSON.parse(r.split), category: r.category, at: r.spent_at, by: r.created_by,
          })),
          plan: plan.results.map((r) => ({ id: r.id, data: JSON.parse(r.data), at: r.updated_at })),
        });
      }
      case 'trip_ping': {
        if (!isMember(a.p_member)) return fail('invalid member');
        if (!isNum(a.p_lat) || !isNum(a.p_lon) || Math.abs(a.p_lat) > 90 || Math.abs(a.p_lon) > 180) return fail('invalid position');
        await db.prepare(`INSERT INTO locations (member, lat, lon, acc, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
          ON CONFLICT(member) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, acc = excluded.acc, updated_at = excluded.updated_at`)
          .bind(a.p_member, a.p_lat, a.p_lon, isNum(a.p_acc) ? a.p_acc : null, now).run();
        return done();
      }
      case 'trip_unping': {
        if (!isMember(a.p_member)) return fail('invalid member');
        await db.prepare('DELETE FROM locations WHERE member = ?1').bind(a.p_member).run();
        return done();
      }
      case 'trip_add_expense': {
        const title = String(a.p_title || '').trim().slice(0, 120);
        const split = Array.isArray(a.p_split) ? [...new Set(a.p_split)] : [];
        if (!isUuid(a.p_id)) return fail('invalid id');
        if (!title) return fail('missing title');
        if (!isNum(a.p_amount) || a.p_amount <= 0 || a.p_amount > 1e7) return fail('invalid amount');
        if (!['CNY', 'THB'].includes(a.p_currency)) return fail('invalid currency');
        if (!isMember(a.p_payer) || !split.length || !split.every(isMember)) return fail('invalid member');
        const spent = typeof a.p_spent_at === 'string' && !isNaN(Date.parse(a.p_spent_at)) ? new Date(a.p_spent_at).toISOString() : now;
        await db.prepare(`INSERT OR IGNORE INTO expenses (id, title, amount, currency, payer, split, category, spent_at, created_by, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
          .bind(a.p_id.toLowerCase(), title, Math.round(a.p_amount * 100) / 100, a.p_currency, a.p_payer,
            JSON.stringify(split), a.p_category ? String(a.p_category).slice(0, 20) : null, spent,
            isMember(a.p_by) ? a.p_by : null, now).run();
        return done();
      }
      case 'trip_del_expense': {
        if (!isUuid(a.p_id)) return fail('invalid id');
        await db.prepare('UPDATE expenses SET deleted = 1 WHERE id = ?1').bind(a.p_id.toLowerCase()).run();
        return done();
      }
      case 'trip_plan_put': {
        if (typeof a.p_id !== 'string' || !/^[\w-]{1,80}$/.test(a.p_id)) return fail('invalid id');
        const d = a.p_data;
        if (!d || typeof d !== 'object' || Array.isArray(d) || !['add', 'edit'].includes(d.type)) return fail('invalid plan data');
        const text = JSON.stringify(d);
        if (text.length > 4000) return fail('plan data too large');
        await db.prepare(`INSERT INTO plan (id, data, updated_at) VALUES (?1, ?2, ?3)
          ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
          .bind(a.p_id, text, now).run();
        return done();
      }
      case 'trip_plan_del': {
        if (typeof a.p_id !== 'string' || !/^[\w-]{1,80}$/.test(a.p_id)) return fail('invalid id');
        await db.prepare('DELETE FROM plan WHERE id = ?1').bind(a.p_id).run();
        return done();
      }
      default:
        return fail('Could not find the function', 404);
    }
  },
};
