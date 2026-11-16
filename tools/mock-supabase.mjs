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
 *   VITE_SUPABASE_ANNON_KEY=mock
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 54321);

/** @type {{profiles: any[], squad_players: any[], tactics: any[]}} */
const db = { profiles: [], squad_players: [], tactics: [] };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'apikey,authorization,content-type,prefer,x-mock-admin',
};

const send = (res, status, body) => {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
  res.end(text);
};

/**
 * 本番の RLS を真似る。Bearer が JWT ならその sub を「ログイン中の本人」とみなす
 * （署名は見ない。テスト用）。anon キーなら未ログイン。
 */
const uidOf = (req) => {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/, '');
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')).sub ?? null;
  } catch {
    return null;
  }
};

const ownProfileIds = (uid) => new Set(db.profiles.filter((p) => p.owner === uid).map((p) => p.id));

/** そのユーザーから見える行（select ポリシー相当） */
const visible = (table, uid) => {
  if (table === 'profiles') return uid ? db.profiles.filter((r) => r.owner === uid) : [];
  if (table === 'squad_players') {
    if (!uid) return [];
    const mine = ownProfileIds(uid);
    return db.squad_players.filter((r) => mine.has(r.profile_id));
  }
  if (table === 'tactics') return db.tactics.filter((r) => r.is_public || (uid && r.owner === uid));
  return [];
};

/** 書き込める行（for all ポリシー相当） */
const writable = (table, uid) => {
  if (!uid) return [];
  if (table === 'tactics') return db.tactics.filter((r) => r.owner === uid);
  return visible(table, uid);
};

/** `col=eq.value` / `col=is.true` 形式のフィルタを適用する */
const applyFilters = (rows, params) => {
  let out = rows;
  for (const [key, value] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
    const [op, ...rest] = String(value).split('.');
    const v = rest.join('.');
    if (op === 'eq') out = out.filter((r) => String(r[key]) === v);
    if (op === 'is') out = out.filter((r) => (v === 'null' ? r[key] == null : String(r[key]) === v));
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

/** 新しい行の既定値（DB の default 相当） */
const defaults = (table, uid) => {
  const base = { id: randomUUID(), created_at: new Date().toISOString() };
  if (table === 'profiles') return { ...base, owner: uid, team_color: 'blaze', efootball_id: null };
  if (table === 'tactics')
    return { ...base, owner: uid, is_public: false, share_id: randomUUID().replace(/-/g, '').slice(0, 12) };
  return base;
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const uid = uidOf(req);

  // ── 以前のデータの引き継ぎ（claim_profile 相当） ──
  if (url.pathname === '/rest/v1/rpc/claim_profile' && req.method === 'POST') {
    if (!uid) return send(res, 401, { message: 'ログインが必要です' });
    const { p_efootball_id } = await readBody(req);
    const target = db.profiles.find((p) => p.efootball_id === p_efootball_id && !p.owner);
    if (!target) return send(res, 400, { message: '引き継げるデータが見つかりません' });
    const mine = db.profiles.find((p) => p.owner === uid);
    if (mine) {
      if (db.squad_players.some((r) => r.profile_id === mine.id))
        return send(res, 400, { message: 'すでに選手が登録されています' });
      target.user_name = mine.user_name || target.user_name;
      target.team_color = mine.team_color;
      db.profiles = db.profiles.filter((p) => p !== mine);
    }
    target.owner = uid;
    return send(res, 200, target);
  }

  const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
  if (!m) return send(res, 404, { message: 'not found' });

  const table = m[1];
  if (!(table in db)) return send(res, 404, { message: `unknown table ${table}` });
  const params = url.searchParams;

  if (req.method === 'GET') {
    return send(res, 200, applyFilters(visible(table, uid), params));
  }

  if (req.method === 'POST') {
    // E2E の初期データ投入用：X-Mock-Admin を付けると RLS を通さずに入れられる
    const admin = req.headers['x-mock-admin'] === '1';
    if (!uid && !admin) return send(res, 401, { message: 'permission denied' });
    const body = await readBody(req);
    const rows = Array.isArray(body) ? body : [body];
    const onConflict = params.get('on_conflict');
    const keys = onConflict ? onConflict.split(',') : null;
    const saved = [];
    for (const row of rows) {
      if (!admin && table === 'squad_players' && !ownProfileIds(uid).has(row.profile_id))
        return send(res, 403, { message: 'new row violates row-level security policy' });
      let existing = null;
      if (keys) {
        existing = db[table].find((r) => keys.every((k) => String(r[k]) === String(row[k])));
      }
      if (existing) {
        Object.assign(existing, row);
        saved.push(existing);
      } else {
        const created = { ...defaults(table, uid), ...row };
        db[table].push(created);
        saved.push(created);
      }
    }
    return send(res, 201, saved);
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const target = applyFilters(writable(table, uid), params);
    for (const r of target) Object.assign(r, body);
    return send(res, 200, target);
  }

  if (req.method === 'DELETE') {
    const target = applyFilters(writable(table, uid), params);
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
