/**
 * チームカラー。ユーザーが選んだ1色を画面全体のアクセントにする。
 *
 * 暗い地の上で文字としても読める明るさの色だけを用意している（自由入力にしないのはそのため）。
 * ink はその色を背景にしたときの文字色。
 */
export interface TeamColor {
  id: string;
  label: string;
  hex: string;
  ink: string;
}

export const TEAM_COLORS: TeamColor[] = [
  { id: 'blaze', label: 'ブレイズ', hex: '#ff5a1f', ink: '#1a0a03' },
  { id: 'azure', label: 'アズール', hex: '#4d8dff', ink: '#06122a' },
  { id: 'emerald', label: 'エメラルド', hex: '#1fc47a', ink: '#03160d' },
  { id: 'gold', label: 'ゴールド', hex: '#f5c400', ink: '#171200' },
  { id: 'violet', label: 'バイオレット', hex: '#b46cff', ink: '#14062a' },
  { id: 'crimson', label: 'クリムゾン', hex: '#ff3b5c', ink: '#1f0309' },
  { id: 'aqua', label: 'アクア', hex: '#22c8e5', ink: '#031418' },
  { id: 'snow', label: 'スノー', hex: '#f2eefa', ink: '#141218' },
];

export const teamColorById = (id: string | null | undefined): TeamColor =>
  TEAM_COLORS.find((c) => c.id === id) ?? TEAM_COLORS[0];

/** 相手チームの色。チームカラーと被らないよう無彩色寄りにしている */
export const AWAY_HEX = '#d9d3e6';
export const AWAY_INK = '#141218';

let current: TeamColor = TEAM_COLORS[0];

const rgbTriplet = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const STORE_KEY = 'buildup-board:team-color';

/** CSS 変数（--team / --team-hex / --team-ink）を差し替える */
export const applyTeamColor = (id: string | null | undefined, root: HTMLElement = document.documentElement) => {
  current = teamColorById(id);
  // 次に開いたとき、クラブの読み込みを待たずにこの色で描くため
  try {
    if (id) localStorage.setItem(STORE_KEY, current.id);
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* 保存できなくても色は変わる */
  }
  root.style.setProperty('--team', rgbTriplet(current.hex));
  root.style.setProperty('--team-hex', current.hex);
  root.style.setProperty('--team-ink', current.ink);
  // スノーは白地なので、相手色と見分けがつくよう相手側を少し沈める
  root.style.setProperty('--away-hex', current.id === 'snow' ? '#8b84a0' : AWAY_HEX);
  return current;
};

/** SVG に直接書くとき用。描画時点のチームカラー */
export const teamHex = () => current.hex;
export const teamInk = () => current.ink;
export const awayHex = () => (current.id === 'snow' ? '#8b84a0' : AWAY_HEX);
export const awayInk = () => (current.id === 'snow' ? '#ffffff' : AWAY_INK);

/** 起動時：前回の色をすぐ当てる（ちらつき防止） */
export const restoreTeamColor = () => {
  try {
    const id = localStorage.getItem(STORE_KEY);
    if (id) applyTeamColor(id);
  } catch {
    /* 無ければ既定色のまま */
  }
};
