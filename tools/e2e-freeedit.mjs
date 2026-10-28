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
await page.waitForTimeout(1500);

/* ── 適性ポジションの登録 ─────────────────────────────── */
const subHeader = await page.getByText(/適性ポジション/).count();
check('適性ポジションの列が出る', subHeader > 0);

// 先頭のフィールドプレーヤー（GK 以外）の行で2つ選ぶ
const chips = page.locator('tbody tr').nth(3).locator('button');
const chipCount = await chips.count();
check('適性ポジションの選択肢が出る', chipCount > 0, `${chipCount}個`);
await chips.nth(0).click();
await chips.nth(1).click();
await page.waitForTimeout(200);
const selected = await page
  .locator('tbody tr')
  .nth(3)
  .locator('button.border-sky-500\\/60')
  .count();
check('適性ポジションが2つ選択される', selected === 2, `${selected}個`);

// 上限4つまで選び、5つ目は押せなくなること
await chips.nth(2).click();
await chips.nth(3).click();
await page.waitForTimeout(200);
const capped = await page
  .locator('tbody tr')
  .nth(3)
  .locator('button.border-sky-500\\/60')
  .count();
check('適性ポジションを4つ選べる', capped === 4, `${capped}個`);
check('5つ目は押せない（上限4）', await chips.nth(4).isDisabled());

// 1つ外せばまた選べる
await chips.nth(0).click();
await page.waitForTimeout(200);
check('外すと上限が空く', !(await chips.nth(4).isDisabled()));

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
const hasBest = await page.getByText(/攻撃時の詳細/).count();
check('推奨フォーメーションの詳細が出る', hasBest > 0);
const hasSpace = await page.getByText('空きの活用').count();
check('「空きの活用」列がある', hasSpace > 0);

await page.screenshot({ path: '/tmp/freeedit.png', fullPage: true });

/* ── 4. 評価モデルを切り替えると結果が変わる ──────────────── */
/** 推奨フォーメーション名 + ランキング表の並び */
const bestOf = () =>
  page.evaluate(() => {
    const title = [...document.querySelectorAll('*')]
      .map((el) => el.textContent ?? '')
      .find((t) => t.startsWith('推奨フォーメーション')) ?? '';
    // ランキング表は最後の table
    const tables = [...document.querySelectorAll('table')];
    const order = tables.length
      ? [...tables[tables.length - 1].querySelectorAll('tbody tr td:first-child')]
          .map((td) => td.textContent.trim().replace('推奨', ''))
          .join(',')
      : '';
    return `${title.slice(0, 40)}|${order}`;
  });
const beforeSwitch = await bestOf();

// 「評価モデル（試験）」の select を パスコース重視 に変える
const selects = page.locator('select');
const modelSelect = selects.nth((await selects.count()) - 1);
await modelSelect.selectOption({ label: 'パスコース重視' });
await page.waitForTimeout(200);
await page.getByRole('button', { name: /最適フォーメーションを提案/ }).click();
await page.waitForTimeout(6000);

const afterSwitch = await bestOf();
check('評価モデルを切り替えると提案が変わる', beforeSwitch !== afterSwitch);
const passHeader = await page.getByText('自チームのパスコース').count();
check('見出しが「パスコース」表記に変わる', passHeader > 0);

await page.screenshot({ path: '/tmp/passoptions.png', fullPage: true });

/* ── 5. 一覧の表示件数の切り替え ───────────────────────── */
const rowCount = () =>
  page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')];
    return tables.length ? tables[tables.length - 1].querySelectorAll('tbody tr').length : 0;
  });

const topN = await rowCount();
check('既定では一覧が上位だけに絞られている', topN > 0 && topN <= 10, `${topN}行`);

await page.getByRole('button', { name: '基本形ごと' }).click();
await page.waitForTimeout(300);
const famN = await rowCount();
check('「名前ごと」で1行ずつになる', famN >= 30 && famN <= 70, `${famN}行`);

await page.getByRole('button', { name: 'すべて' }).click();
await page.waitForTimeout(500);
const allN = await rowCount();
check('「すべて」で全行が出る', allN > 50, `${allN}行`);

await page.getByRole('button', { name: /^上位/ }).click();
await page.waitForTimeout(300);
check('「上位」に戻せる', (await rowCount()) === topN);

// タイプのバッジが出ているか（「4CB／…」のような構成名）
const badge = await page.getByText(/／/).count();
check('タイプ名が一覧に出ている', badge > 0);

// 攻撃時 / 守備時
check('攻撃時・守備時カードが出る', (await page.getByText('攻撃時 / 守備時フォーメーション').count()) > 0);
await page.getByRole('button', { name: '守備時' }).click();
await page.waitForTimeout(400);
check('守備時の一覧に切り替わる', (await page.getByText(/守備時の詳細/).count()) > 0);
await page.getByRole('button', { name: '攻撃時' }).click();
await page.waitForTimeout(400);
check('攻撃時に戻せる', (await page.getByText(/攻撃時の詳細/).count()) > 0);

await page.screenshot({ path: '/tmp/variants.png', fullPage: true });

check('コンソールエラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures === 0 ? '\n✅ E2E 全通過' : `\n❌ ${failures} 件失敗`);
process.exit(failures === 0 ? 0 : 1);
