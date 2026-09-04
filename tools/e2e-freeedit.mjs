/**
 * ブラウザ E2E: フリーエディットのドラッグ / 自動是正 / トグル
 *   node tools/e2e-freeedit.mjs
 * 事前に `node tools/mock-supabase.mjs` と `npx vite preview --port 4173` を起動しておくこと。
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4173/';
const ok = (label, cond, extra = '') =>
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? `  ${extra}` : ''}`);
let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) failures++;
  ok(label, cond, extra);
};

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// favicon 等の 404 は本体と無関係なので除く
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (t.includes('Failed to load resource') && t.includes('404')) return;
  errors.push(t);
});

/* ── 事前に投入したプロフィールを選択済みにして開く ───────── */
const profile = JSON.parse(process.env.E2E_PROFILE);
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate((p) => localStorage.setItem('buildup-board:profile', JSON.stringify(p)), profile);
await page.reload({ waitUntil: 'networkidle' });

// 選手登録タブを一度開いて 23 名を読み込ませる
await page.getByRole('button', { name: '選手登録' }).click();
await page.waitForTimeout(1200);

/* ── 戦術提案タブ → フリーエディット ─────────────────── */
await page.getByRole('button', { name: '戦術提案' }).click();
await page.waitForTimeout(600);

const warn = await page.getByText(/起用できる選手が/).count();
check('23名が登録され、提案タブが使える', warn === 0);

const svg = page.locator('svg').filter({ has: page.locator('circle') }).last();
const box = await svg.boundingBox();
check('編集できるピッチが出る', !!box);

/** ピッチ座標 → 画面座標 */
const toScreen = (x, y) => ({
  x: box.x + (x / 105) * box.width,
  y: box.y + ((68 - y) / 68) * box.height,
});

/** 現在のトークン一覧（ピッチ座標とポジション）を DOM から読む */
const readTokens = () =>
  page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg')];
    const target = svgs[svgs.length - 1];
    return [...target.querySelectorAll('g')]
      .map((g) => {
        const c = g.querySelector('circle[r="2.2"]');
        const texts = [...g.querySelectorAll('text')];
        if (!c || texts.length < 2) return null;
        return {
          number: texts[0].textContent.trim(),
          position: texts[1].textContent.trim(),
          x: +c.getAttribute('cx'),
          y: 68 - +c.getAttribute('cy'),
        };
      })
      .filter(Boolean);
  });

const before = await readTokens();
check('11人のトークンが描かれている', before.length === 11, `${before.length}人`);

/* 相手は away なので、実座標は鏡映。自チーム基準では (105-x, 68-y) */
const own = (t) => ({ x: 105 - t.x, y: 68 - t.y });

/* ── 1. ドラッグ＋自動是正: CB を自チーム基準の右サイド守備へ運ぶ ── */
const cb = before.find((t) => t.position === 'CB');
check('CB がいる', !!cb);
// 自チーム基準 (20, 8) = 右サイド守備 → 相手の実座標は (85, 60)
const from = toScreen(cb.x, cb.y);
const to = toScreen(85, 60);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(to.x, to.y, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(250);

const afterDrag = await readTokens();
const moved = afterDrag.find((t) => t.number === cb.number);
const movedOwn = own(moved);
check(
  'ドラッグで任意座標へ動く',
  Math.abs(moved.x - 85) < 3 && Math.abs(moved.y - 60) < 3,
  `→ (${moved.x.toFixed(1)}, ${moved.y.toFixed(1)})`,
);
check(
  '自動是正: 右サイド守備に落とした CB が RSB になる',
  moved.position === 'RSB',
  `${cb.position} → ${moved.position}  自チーム基準(${movedOwn.x.toFixed(0)}, ${movedOwn.y.toFixed(0)})`,
);

/* ── 2. トグル: 中央アンカー帯に置いてクリックすると DMF ⇄ CMF ── */
// 自チーム基準 (42, 34) → 相手実座標 (63, 34)
const anchorTo = toScreen(63, 34);
const cur = toScreen(moved.x, moved.y);
await page.mouse.move(cur.x, cur.y);
await page.mouse.down();
await page.mouse.move(anchorTo.x, anchorTo.y, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(250);

let t = (await readTokens()).find((x) => x.number === cb.number);
check('中央アンカー帯へ動かすと DMF になる', t.position === 'DMF', `→ ${t.position}`);

const clickAt = toScreen(t.x, t.y);
await page.mouse.click(clickAt.x, clickAt.y);
await page.waitForTimeout(200);
t = (await readTokens()).find((x) => x.number === cb.number);
check('クリックでトグル DMF → CMF', t.position === 'CMF', `→ ${t.position}`);

await page.mouse.click(clickAt.x, clickAt.y);
await page.waitForTimeout(200);
t = (await readTokens()).find((x) => x.number === cb.number);
check('もう一度クリックで CMF → DMF', t.position === 'DMF', `→ ${t.position}`);

/* ── 3. 編集済みの配置で提案が走る ────────────────────── */
await page.getByRole('button', { name: /最適フォーメーションを提案/ }).click();
await page.waitForTimeout(4000);

const hasDensity = await page.getByText('相手配置の密度解析').count();
check('密度解析カードが出る', hasDensity > 0);
const hasBest = await page.getByText(/推奨フォーメーション/).count();
check('推奨フォーメーションが出る', hasBest > 0);
const hasSpace = await page.getByText('空きの活用').count();
check('「空きの活用」列がある', hasSpace > 0);

await page.screenshot({ path: '/tmp/freeedit.png', fullPage: true });

check('コンソールエラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures === 0 ? '\n✅ E2E 全通過' : `\n❌ ${failures} 件失敗`);
process.exit(failures === 0 ? 0 : 1);
