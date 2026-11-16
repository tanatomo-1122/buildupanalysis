/**
 * SNS 用の共有カード（1200×630 の PNG）を canvas で描く。
 *
 * X や LINE に画像を貼るとそのまま戦術が伝わるように、
 * 左に「攻撃時の形・守備時の形・相手」、右に縦向きのピッチと11人を置く。
 */
import type { Tactic } from '../api/tactics';
import { AWAY_HEX, teamColorById } from '../theme';
import type { Player } from '../types';

export const CARD_W = 1200;
export const CARD_H = 630;

const BG = '#141218';
const SURFACE = '#1e1b25';
const INK = '#f6f2ff';
const DIM = '#9b94ad';

const ensureFonts = async () => {
  try {
    await Promise.all([
      document.fonts.load('700 200px Teko'),
      document.fonts.load('700 28px "Noto Sans JP"'),
      document.fonts.load('700 24px "JetBrains Mono"'),
    ]);
  } catch {
    /* フォントが取れなくても代替フォントで描く */
  }
};

/** 縦向きピッチ。自チームは下から上へ攻める */
const drawPitch = (
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  h: number,
  home: Player[],
  away: Player[],
  homeHex: string,
  homeInk: string,
) => {
  const w = (h * 68) / 105;
  const sx = (p: Player) => x0 + ((68 - p.pos.y) / 68) * w;
  const sy = (p: Player) => y0 + ((105 - p.pos.x) / 105) * h;

  ctx.fillStyle = '#16221c';
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = 'rgba(246,242,255,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, w, h);
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h / 2);
  ctx.lineTo(x0 + w, y0 + h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x0 + w / 2, y0 + h / 2, (9.15 / 68) * w, 0, Math.PI * 2);
  ctx.stroke();
  const boxW = (40.32 / 68) * w;
  const boxH = (16.5 / 105) * h;
  ctx.strokeRect(x0 + (w - boxW) / 2, y0, boxW, boxH);
  ctx.strokeRect(x0 + (w - boxW) / 2, y0 + h - boxH, boxW, boxH);

  const r = w * 0.042;
  // 相手は自チームと向きが逆。実座標をそのまま使えば向きは揃う
  for (const p of away) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = AWAY_HEX;
    ctx.beginPath();
    ctx.arc(sx(p), sy(p), r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const p of home) {
    ctx.fillStyle = homeHex;
    ctx.beginPath();
    ctx.arc(sx(p), sy(p), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = homeInk;
    ctx.font = `700 ${Math.round(r * 0.9)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.position, sx(p), sy(p) + 1);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
};

export const renderShareCard = async (t: Tactic): Promise<HTMLCanvasElement> => {
  await ensureFonts();
  const color = teamColorById(t.teamColor);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 右側のピッチ帯
  const panelX = 740;
  ctx.fillStyle = SURFACE;
  ctx.fillRect(panelX, 0, CARD_W - panelX, CARD_H);
  drawPitch(
    ctx,
    panelX + (CARD_W - panelX - (560 * 68) / 105) / 2,
    35,
    560,
    t.payload.attack.lineup,
    t.payload.opponent.players,
    color.hex,
    color.ink,
  );

  // 左の文字組み
  const L = 64;
  ctx.fillStyle = DIM;
  ctx.font = '500 26px "JetBrains Mono", monospace';
  ctx.fillText(`${t.authorName || 'MY CLUB'} の戦術`, L, 86);

  // Teko は輪郭が重なっているので、太い線を引いてから地の色で塗って内側の線を隠す
  ctx.font = '700 230px Teko, sans-serif';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = color.hex;
  ctx.strokeText(t.payload.attack.familyLabel, L - 6, 320);
  ctx.fillStyle = BG;
  ctx.fillText(t.payload.attack.familyLabel, L - 6, 320);

  ctx.fillStyle = INK;
  ctx.font = '700 30px "Noto Sans JP", sans-serif';
  const title = t.title.length > 22 ? `${t.title.slice(0, 21)}…` : t.title;
  ctx.fillText(title, L, 380);

  const cols: [string, string][] = [
    ['攻撃時', t.payload.attack.familyLabel],
    ['守備時', t.payload.defense.familyLabel],
    ['相手', t.payload.opponent.label.split('（')[0]],
  ];
  cols.forEach(([k, v], i) => {
    const x = L + i * 210;
    ctx.fillStyle = DIM;
    ctx.font = '500 22px "Noto Sans JP", sans-serif';
    ctx.fillText(k, x, 448);
    ctx.fillStyle = i === 2 ? AWAY_HEX : INK;
    ctx.font = '700 64px Teko, sans-serif';
    ctx.fillText(v, x, 508);
  });

  // フッター
  ctx.fillStyle = color.hex;
  ctx.fillRect(L, 552, 40, 6);
  ctx.fillStyle = INK;
  ctx.font = '700 40px Teko, sans-serif';
  ctx.fillText('MY XI', L + 56, 572);
  ctx.fillStyle = DIM;
  ctx.font = '500 22px "JetBrains Mono", monospace';
  ctx.fillText(`#${t.shareId.slice(0, 6).toUpperCase()}`, 560, 572);

  return canvas;
};

const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), 'image/png'),
  );

/**
 * 画像を保存する。スマホで共有シートが使えるならそちらを開き（そのまま X や LINE に送れる）、
 * 使えなければ PNG をダウンロードする。
 */
export const exportShareCard = async (t: Tactic, url?: string): Promise<'shared' | 'downloaded'> => {
  const blob = await toBlob(await renderShareCard(t));
  const file = new File([blob], `myxi-${t.shareId}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title: t.title, text: url ? `${t.title}\n${url}` : t.title });
      return 'shared';
    } catch {
      /* キャンセルされたらダウンロードに回す */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
};
