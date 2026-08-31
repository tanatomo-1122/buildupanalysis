/**
 * パスコース評価（ボトルネック ＆ 擬似3D弾道）
 *
 * 到達地点だけを見ると「受け手は空いているが、そこへ至る途中に敵がいる」パスを
 * 拾えない。そこで ボール → 到達地点 の線分上で PC をサンプリングし、
 * 最も低い値（ボトルネック）をそのパスの成功確率として採用する。
 *
 * ただしそのままだと、頭上を越えるロングボールの中間地点にいる敵まで
 * 障害物として数えてしまう。これを避けるため、守備側の影響力に
 * インターセプト可能性係数 I を掛ける。
 */

/** サンプリング間隔 [m]。細かくするほど正確だが計算量が増える */
export const SAMPLE_STEP_M = 3;
/** 1本のパスあたりのサンプリング区間数の下限・上限 */
export const MIN_SEGMENTS = 3;
export const MAX_SEGMENTS = 12;

/** 0→1 に滑らかに立ち上がる補間（エルミート） */
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * インターセプト可能性係数 I(x, L)
 *
 *   U(t) = 4 (t - 0.5)²        t = x / L   … 両端で 1、中間で 0 の U 字
 *   loft(L)                    … パス距離 L から決まる「浮き具合」0〜1
 *   I = 1 - loft(L) × (1 - U(t)^p)
 *
 * p は U 字の「底の広さ」。p = 1 が素の 4(t-0.5)²。
 * p を上げると I が 0 に近い区間が広がり、中盤の敵をより広く無視する。
 *
 * p = 1 のままだと、ロングボールの中間付近で問題が出る。あのあたりは
 * 両チームとも影響力がほぼ 0 なので、I で割り引かれた守備側の僅かな影響でも
 * 比 h/(h+aI) を大きく動かしてしまい、「中間の敵は無視される」はずが
 * 実際には減点されてしまう。p を上げるとこれが解消する（既定 p = 2）。
 *
 * - L ≤ shortMax（グラウンダー）: loft = 0 → 全区間 I = 1。
 *   コース上の敵は全員そのまま障害物になる
 * - L ≥ longMin（完全なフライ）: loft = 1 → I = U(t)。
 *   中間地点で I = 0 となり、中盤の敵は頭上を越えて無視される
 * - その間は smoothstep で連続に補間する
 *
 * キック直後（x=0）と落下地点（x=L）では距離によらず I = 1 なので、
 * 蹴り出しを塞がれている／落下点に敵がいる場合はきちんと減点される。
 *
 * @param x ボールからサンプリング地点までの距離 [m]
 * @param L パスの総距離 [m]
 * @param shortMax この距離までは完全にグラウンダー扱い [m]
 * @param longMin この距離以上で完全なフライ扱い [m]
 * @param sharpness U 字の底の広さ p（1 で素の 4(t-0.5)²）
 */
export const interceptFactor = (
  x: number,
  L: number,
  shortMax: number,
  longMin: number,
  sharpness = 2,
): number => {
  if (L <= 1e-6) return 1;
  const loft = smoothstep(shortMax, Math.max(shortMax + 0.01, longMin), L);
  if (loft <= 0) return 1;
  const t = Math.min(1, Math.max(0, x / L));
  const u = 4 * (t - 0.5) * (t - 0.5);
  const shaped = sharpness === 1 ? u : Math.pow(u, sharpness);
  return 1 - loft * (1 - shaped);
};

/** そのパス距離での「浮き具合」0〜1（UI 表示用） */
export const loftAmount = (L: number, shortMax: number, longMin: number): number =>
  smoothstep(shortMax, Math.max(shortMax + 0.01, longMin), L);

/** パス距離から、線分を何区間に分割するかを決める */
export const segmentsFor = (L: number): number =>
  Math.min(MAX_SEGMENTS, Math.max(MIN_SEGMENTS, Math.round(L / SAMPLE_STEP_M)));
