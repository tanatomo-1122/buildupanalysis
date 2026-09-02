/**
 * 開発・動作確認用の PostgREST 互換モックサーバー（インメモリ）。
 *
 * Supabase のプロジェクトを用意する前に画面を通しで触りたいときに使います。
 * 本番では使いません。データはプロセスを止めると消えます。
 *
 *   node tools/mock-supabase.mjs          # http://localhost:54321 で起動
 *
 * `.env.local` に次を書いて `npm run dev` すると、このモックに繋がります。
 *   VITE_SUPABASE_URL=http://localhost:54321
 *   VITE_SUPABASE_ANON_KEY=mock
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 54321);

/** @type {{profiles: any[], squad_players: any[]}} */
const db = { profiles: [], squad_players: [] };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'apikey,authorization,content-type,prefer',
};

const send = (res, status, body) => {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
  res.end(text);
};

/** `col=eq.value` 形式のフィルタを適用する */
const applyFilters = (rows, params) => {
  let out = rows;
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
    const [op, ...rest] = String(value).split('.');
    const v = rest.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[key]) === v);
  }
  const order = params.get('order');
  if (order) {
    const [col, dir] = order.split('.');
    out = [...out].sort((a, b) =>
      a[col] < b[col] ? (dir === 'desc' ? 1 : -1) : a[col] > b[col] ? (dir === 'desc' ? -1 : 1) : 0,
    );
  }
  const limit = params.get('limit');
  if (limit) out = out.slice(0, Number(limit));
  return out;
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw ? JSON.parse(raw) : undefined));
  });

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (!m) return send(res, 404, { message: 'not found' });

  const table = m[1];
  if (!(table in db)) return send(res, 404, { message: `unknown table ${table}` });
  const params = url.searchParams;

  if (req.method === 'GET') {
    return send(res, 200, applyFilters(db[table], params));
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const rows = Array.isArray(body) ? body : [body];
    const onConflict = params.get('on_conflict');
    const keys = onConflict ? onConflict.split(',') : null;
    const saved = [];
    for (const row of rows) {
      let existing = null;
      if (keys) {
        existing = db[table].find((r) => keys.every((k) => String(r[k]) === String(row[k])));
      }
      if (existing) {
        Object.assign(existing, row);
        saved.push(existing);
      } else {
        const created = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
        db[table].push(created);
        saved.push(created);
      }
    }
    return send(res, 201, saved);
  }

  if (req.method === 'DELETE') {
    const target = applyFilters(db[table], params);
    db[table] = db[table].filter((r) => !target.includes(r));
    if (table === 'profiles') {
      const ids = new Set(target.map((r) => r.id));
      db.squad_players = db.squad_players.filter((r) => !ids.has(r.profile_id));
    }
    return send(res, 204, undefined);
  }

  return send(res, 405, { message: 'method not allowed' });
}).listen(PORT, () => {
  console.log(`mock supabase listening on http://localhost:${PORT}`);
});
