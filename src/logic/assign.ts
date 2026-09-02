/**
 * ハンガリアン法（Jonker-Volgenant 版）による最適割当。
 *
 * 行 = フォーメーションのスロット（11）、列 = 登録選手（最大23）の
 * 長方形コスト行列に対して、行ごとに列を1つずつ、総コストが最小になるよう割り当てる。
 * 貪欲だと「一番良い選手を先に取られた枠が総崩れになる」ので、全体最適を解く。
 *
 * 計算量は O(n² m)。11 × 23 なら一瞬で終わる。
 */
export const hungarian = (cost: number[][]): number[] => {
  const n = cost.length;
  if (n === 0) return [];
  const m = cost[0].length;
  if (m < n) throw new Error('列数は行数以上である必要があります');

  const INF = Number.POSITIVE_INFINITY;
  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1); // p[j] = 列 j に割り当てられた行（1-indexed、0 は未割当）
  const way = new Int32Array(m + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(INF);
    const used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] > 0) result[p[j] - 1] = j - 1;
  return result;
};

/** 適性（大きいほど良い）の行列から、総適性が最大になる割当を求める */
export const assignByScore = (score: number[][]): number[] =>
  hungarian(score.map((row) => row.map((s) => -s)));
