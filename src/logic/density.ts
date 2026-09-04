import { PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import { ZONES, zoneAt } from '../data/zones';
import type { Zone, ZoneId } from '../data/zones';
import type { Player } from '../types';

/**
 * 密度解析
 *
 * 相手の配置を 11 ゾーンに落として人数を数え、「どこに人を割いていて、どこが空いているか」
 * を出す。プリセットのフォーメーション名では表せない変則配置（極端な片攻め、3CF など）でも、
 * 実際に置かれた座標だけを見るのでそのまま扱える。
 *
 * 判定はすべて**自チーム基準の座標系**で行う。つまり x が小さいほど自陣、
 * y が小さいほど自チームから見て右。「空いているゾーン」＝自分が突けるスペース。
 */

export interface ZoneDensity {
  zone: Zone;
  /** そのゾーンにいる相手の人数（GK を除く） */
  count: number;
  /** 全体に対する割合 */
  share: number;
  /** 均等配置（10人 / 11ゾーン）との差。プラスで密集、マイナスで手薄 */
  delta: number;
}

export interface DensityReport {
  zones: ZoneDensity[];
  byZone: Record<ZoneId, ZoneDensity>;
  /** 人数が多い順の上位3ゾーン */
  crowded: ZoneDensity[];
  /** 自陣側を除いた、手薄なゾーン（自分が突けるところ）上位3つ */
  sparse: ZoneDensity[];
  /**
   * 左右の偏り。自チームから見て +1 で相手が左サイド（y 大）に寄っている、
   * -1 で右サイド（y 小）に寄っている。
   */
  lateralBias: number;
  /** 前掛かり度。0 で相手が自陣に引いている、1 で自陣ゴール前まで来ている */
  advance: number;
  /** 何人がどちらのサイドにいるか（中央を除く） */
  rightCount: number;
  leftCount: number;
  centerCount: number;
  summary: string[];
}

/** 均等に散らばったときの1ゾーンあたり人数 */
const EVEN = 10 / ZONES.length;

/** そのゾーンが自チームにとってどれだけ前進価値が高いか 0〜1 */
export const zoneAdvanceValue = (zone: Zone): number =>
  (zone.x0 + zone.x1) / 2 / PITCH_LENGTH;

export const analyzeDensity = (opponents: Player[]): DensityReport => {
  const outfield = opponents.filter((p) => p.position !== 'GK');
  const counts = new Map<ZoneId, number>(ZONES.map((z) => [z.id, 0]));

  for (const p of outfield) {
    // 相手の実座標をそのまま自チーム基準で見る（＝自分から見てどこにいるか）
    const z = zoneAt(p.pos, 'home');
    counts.set(z.id, (counts.get(z.id) ?? 0) + 1);
  }

  const total = Math.max(1, outfield.length);
  const zones: ZoneDensity[] = ZONES.map((zone) => {
    const count = counts.get(zone.id) ?? 0;
    return { zone, count, share: count / total, delta: count - EVEN };
  });

  const byZone = Object.fromEntries(zones.map((z) => [z.zone.id, z])) as Record<
    ZoneId,
    ZoneDensity
  >;

  const crowded = [...zones].sort((a, b) => b.count - a.count).slice(0, 3);
  // 自陣の最終ライン付近が空いていても攻め手にはならないので、中盤より前だけを見る
  const sparse = [...zones]
    .filter((z) => zoneAdvanceValue(z.zone) > 0.3)
    .sort((a, b) => a.count - b.count || zoneAdvanceValue(b.zone) - zoneAdvanceValue(a.zone))
    .slice(0, 3);

  const meanY = outfield.reduce((s, p) => s + p.pos.y, 0) / total;
  const meanX = outfield.reduce((s, p) => s + p.pos.x, 0) / total;
  const lateralBias = (meanY - PITCH_WIDTH / 2) / (PITCH_WIDTH / 2);
  const advance = 1 - meanX / PITCH_LENGTH;

  const rightCount = zones
    .filter((z) => z.zone.id.startsWith('R_'))
    .reduce((s, z) => s + z.count, 0);
  const leftCount = zones
    .filter((z) => z.zone.id.startsWith('L_'))
    .reduce((s, z) => s + z.count, 0);
  const centerCount = total - rightCount - leftCount;

  const summary: string[] = [];
  if (Math.abs(lateralBias) > 0.12) {
    const side = lateralBias > 0 ? '左' : '右';
    const open = lateralBias > 0 ? '右' : '左';
    summary.push(
      `相手は自分から見て${side}サイドに寄っています（${side}${lateralBias > 0 ? leftCount : rightCount}人 / ${open}${lateralBias > 0 ? rightCount : leftCount}人）。${open}サイドが空きます。`,
    );
  }
  if (advance > 0.58) {
    summary.push('全体が前掛かりで、相手の背後（最終ラインの裏）が広く空いています。');
  } else if (advance < 0.42) {
    summary.push('相手は自陣に引いており、前方のスペースは少なめです。');
  }
  if (centerCount >= 6) {
    summary.push(`中央に${centerCount}人を集めています。外を使う形が刺さります。`);
  } else if (centerCount <= 3) {
    summary.push(`中央が${centerCount}人と手薄です。内側から差し込めます。`);
  }
  const emptyForward = zones.filter(
    (z) => z.count === 0 && zoneAdvanceValue(z.zone) > 0.45,
  );
  if (emptyForward.length) {
    summary.push(`無人のゾーン: ${emptyForward.map((z) => z.zone.label).join('、')}`);
  }
  if (summary.length === 0) summary.push('目立った偏りはありません。標準的な配置です。');

  return {
    zones,
    byZone,
    crowded,
    sparse,
    lateralBias,
    advance,
    rightCount,
    leftCount,
    centerCount,
    summary,
  };
};

/**
 * 自チームの布陣が「相手の空いているところ」をどれだけ突けているかを 0〜1 で返す。
 *
 *   freeness(z) : そのゾーンに相手が何人いるか（2人以上で 0）
 *   value(z)    : そのゾーンの前進価値（前にあるほど高い）
 *
 * PC は連続的な密度をすでに見ているので、この項はあくまで
 * 「ゾーン単位で見たときの空きの突き方」を評価する補助的な指標として使う。
 */
export const spaceExploitation = (lineup: Player[], report: DensityReport): number => {
  const outfield = lineup.filter((p) => p.position !== 'GK');
  if (outfield.length === 0) return 0;
  let sum = 0;
  for (const p of outfield) {
    const zone = zoneAt(p.pos, 'home');
    const d = report.byZone[zone.id];
    const freeness = Math.max(0, 1 - (d?.count ?? 0) / 2);
    sum += zoneAdvanceValue(zone) * freeness;
  }
  return sum / outfield.length;
};
