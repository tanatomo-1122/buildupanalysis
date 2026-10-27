import { DEFAULT_PARAMS, PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import { FORMATIONS, buildLineup, slotPosition, withLineShift } from '../data/formations';
import type { FormationSlot } from '../data/formations';
import { positionFit } from '../data/positions';
import { isSkillValidFor } from '../data/skills';
import { POSITION_ORDER } from '../types';
import type {
  Params,
  Player,
  PositionId,
  SceneId,
  SquadPlayer,
  TeamId,
  ValueModel,
  Vec2,
} from '../types';
import { assignByScore } from './assign';
import { analyzeDensity, spaceExploitation } from './density';
import type { DensityReport } from './density';
import { averageOverHolders } from './holderAverage';

/**
 * 戦術提案エンジン
 *
 * 「登録した選手・指定したチームスタイル・相手のフォーメーション」を入力に、
 * 17 フォーメーションそれぞれについて
 *   1. 各スロットに誰を置くのが最適かをハンガリアン法で解き（適性ベース）
 *   2. その布陣を実際に盤面評価し
 *   3. 局所探索でベンチとの入れ替えを試して改善する
 * という手順でスコアを出し、ランキングして返す。
 *
 * 1 の適性だけでは「ポジションは合っているが戦術的には噛み合わない」布陣になるため、
 * 3 の実評価による改善を挟んでいる。
 *
 * 相手は「フォーメーション名」ではなく **実際に置かれた11人の座標** を受け取る。
 * これにより、極端な片攻めや3CFのような変則配置もそのまま解析できる。
 * 配置は密度解析（logic/density.ts）にかけ、空いているゾーンを突けている布陣を加点する。
 */

/** 何を基準に「最適」とするか */
export type RankMode = 'balance' | 'attack' | 'defense';

export const RANK_MODES: { id: RankMode; label: string; desc: string }[] = [
  { id: 'balance', label: 'バランス', desc: '自分のスコア − 相手に許すスコア。総合的に強い形。' },
  { id: 'attack', label: '攻撃重視', desc: '自分がボールを持ったときのスコアが最も高い形。' },
  { id: 'defense', label: '守備重視', desc: '相手にスコアを与えない形。' },
];

/**
 * 評価モデル。ランキング基準（RankMode）とは独立した軸で、
 * 「パス1本の価値をどう測るか」を選ぶ。同じ基準のまま2つのモデルを見比べられる。
 */
export const VALUE_MODELS: { id: ValueModel; label: string; desc: string }[] = [
  {
    id: 'progress',
    label: '前進量重視',
    desc: 'w × PC × ΔX。どれだけ前に運べるかを直接測る。縦に速い形が上位に来る。',
  },
  {
    id: 'passOptions',
    label: 'パスコース重視',
    desc: 'PC が閾値を超えたコースを1本と数える。横パス・バックパスも逃げ道として評価され、保持が安定する形が上位に来る。',
  },
];

/** そのモデルでのスコアの単位（画面の表示に使う） */
export const scoreUnit = (model: ValueModel): string =>
  model === 'passOptions' ? '本' : 'm';

export interface SlotAssignment {
  slot: FormationSlot;
  player: SquadPlayer;
  /** 適性スコア（ポジション適性＋プレースタイルの噛み合い） */
  fit: number;
  /** ポジション適性だけの値 */
  positionFit: number;
}

export interface FormationRecommendation {
  formationId: string;
  label: string;
  desc: string;
  /** 元になった基本形（例 '4-4-2'） */
  family: string;
  familyLabel: string;
  /** タイプ（可変スロットのポジション構成） */
  typeId: string;
  typeLabel: string;
  /** 左右反転しても同じ形なら一致するキー */
  symmetryKey: string;
  /** 守備ラインの上下 [m]。+ で前がかり、− で低く構える（GK は動かない） */
  lineShift: number;
  /** 山登りまでかけたか（下位は初期割当のまま） */
  refined: boolean;
  /** 自チームがボールを持ったときの期待前進値（大きいほど良い） */
  attack: number;
  /** 相手がボールを持ったときの相手の期待前進値（小さいほど良い） */
  defense: number;
  /** attack − defense */
  balance: number;
  attackRank: number;
  defenseRank: number;
  balanceRank: number;
  /** 起用した11人の平均適性 */
  fitAverage: number;
  /** 本職から外れた起用に対する減点（探索の目的関数で引かれた分） */
  fitPenalty: number;
  /** 相手の空いているゾーンをどれだけ突けているか 0〜1 */
  spaceScore: number;
  /** 採用判断に使う総合値（戦術スコア − 適性減点 + 密度加点） */
  score: number;
  assignments: SlotAssignment[];
  /** 盤面にそのまま渡せる自チーム11人 */
  lineup: Player[];
  bench: SquadPlayer[];
}

export interface RecommendInput {
  /** 名前が入っている登録選手（11人以上必要） */
  squad: SquadPlayer[];
  homeStyle: string;
  /** 相手の11人。プリセットでもフリーエディットの結果でもよい */
  opponentPlayers: Player[];
  opponentStyle: string;
  scene: SceneId;
  homeLine: number;
  rankMode: RankMode;
  /** パス1本の価値をどう測るか。省略時は従来の前進量モデル */
  valueModel?: ValueModel;
  /**
   * 適性減点の倍率。既定 1。
   *
   * 攻撃時／守備時の2形を出すときの**守備形**では 1 より小さくする。
   * 11人はすでに決まっていて入れ替えないので、「本職から外れた起用」の減点を
   * そのまま掛けると形を変える動機が消えてしまう（攻撃時と同じ形しか出なくなる）。
   * 局面ごとの配置換えは選考ミスではないので、ここは軽く見る。
   */
  fitPenaltyScale?: number;
  /**
   * 密度加点の倍率。既定 1。
   *
   * 「相手が空けているゾーンを突けているか」は攻撃の発想なので、
   * **守備形を探すときは 0 にする**。入れたままだと守備の良し悪しより
   * 空きの突き方で順位が決まってしまう。
   */
  densityScale?: number;
  /**
   * この名前（例 '4-2-3-1'）の中だけを探す。
   * 省略すると全名前を横断して探し、各名前の最良だけを返す。
   */
  family?: string;
}

export interface RecommendResult {
  rows: FormationRecommendation[];
  best: FormationRecommendation;
  /** 相手配置の密度解析 */
  density: DensityReport;
  /** 実際に使った評価モデル */
  valueModel: ValueModel;
  /** 探索に使った盤面評価の回数（性能の目安） */
  evaluations: number;
  elapsedMs: number;
  /** 候補に入れた形の総数 */
  candidates: number;
}

/* ------------------------------------------------------------------ *
 * 適性
 * ------------------------------------------------------------------ */

/** プレースタイルがそのポジションで本来選べるものなら加点する */
const skillBonus = (slotPos: PositionId, p: SquadPlayer): number =>
  (isSkillValidFor(slotPos, 'attack', p.attackSkill) ? 12 : 0) +
  (isSkillValidFor(slotPos, 'defense', p.defenseSkill) ? 8 : 0);

export const fitScore = (slotPos: PositionId, p: SquadPlayer): number => {
  const base = positionFit(p.position, slotPos);
  return base < 0 ? base : base + skillBonus(slotPos, p);
};

/* ------------------------------------------------------------------ *
 * 評価
 * ------------------------------------------------------------------ */

const CENTER: Vec2 = { x: PITCH_LENGTH / 2, y: PITCH_WIDTH / 2 };

/** 固定パラメータ（UI からは触らせない） */
export const FIXED_PARAMS = DEFAULT_PARAMS;

const paramsFor = (
  input: RecommendInput,
  possessionTeam: TeamId,
): Params => ({
  ...FIXED_PARAMS,
  possessionTeam,
  scene: input.scene,
  homeStyle: input.homeStyle,
  awayStyle: input.opponentStyle,
  holderMode: 'averageOutfield',
  valueModel: input.valueModel ?? FIXED_PARAMS.valueModel,
});

/**
 * 盤面のスコア。maxHolders を渡すと起点を間引いて速く見積もる（探索用）。
 * 起点平均なのでボール位置には依存しない。
 */
const scoreBoard = (
  players: Player[],
  input: RecommendInput,
  maxHolders?: number,
): { attack: number; defense: number } => ({
  attack: averageOverHolders(players, CENTER, paramsFor(input, 'home'), 'home', maxHolders).mean,
  defense: averageOverHolders(players, CENTER, paramsFor(input, 'away'), 'away', maxHolders).mean,
});

const tacticalValue = (attack: number, defense: number, mode: RankMode): number => {
  if (mode === 'attack') return attack;
  if (mode === 'defense') return -defense;
  return attack - defense;
};

/**
 * 目的関数の重み。**戦術スコアのスケールが評価モデルで大きく違う**ので、
 * モデルごとに持つ。
 *
 *   progress    … 期待前進値。1形あたり概ね −3 〜 +4（起点平均後）
 *   passOptions … 通るパスの本数。1形あたり概ね 3 〜 9
 *
 * `fitPenalty` は本職から外れた起用への減点。盤面評価は「その位置でどう振る舞うか」
 * しか見ないので、これが無いと「本職CBがベンチにいるのにサイドバックをCBに置く」ような、
 * 戦術スコアだけは少し高いが現実には筋の悪い布陣に流れる。1人あたり最大この値、
 * 11人ぶんを合算して引く。「兼任可」の適性62 を1枚入れると重みの約38%の減点になる。
 *
 * `density` は相手の空きゾーンを突けていることへの加点。PC が連続的な密度をすでに
 * 見ているので、戦術スコアがほぼ互角のときのタイブレーカーとして働く強さに留める。
 */
const WEIGHTS: Record<ValueModel, { fitPenalty: number; density: number }> = {
  progress: { fitPenalty: 8, density: 3 },
  // 本数スケールでは「兼任可1枚 = 0.19本ぶん」「空きの活用 満点 = 0.5本ぶん」。
  // 戦術的な差（1本）の方が常に大きく、適性と密度はあくまで同点の捌き方になる。
  passOptions: { fitPenalty: 0.5, density: 0.5 },
};

const weightsFor = (input: RecommendInput) => {
  const w = WEIGHTS[input.valueModel ?? FIXED_PARAMS.valueModel];
  return {
    fitPenalty: w.fitPenalty * (input.fitPenaltyScale ?? 1),
    density: w.density * (input.densityScale ?? 1),
  };
};

/** 探索でそのスロットの候補にできる最低適性（これ未満は専門外として除外） */
const MIN_CANDIDATE_FIT = 50;

const fitPenaltyOf = (
  slots: FormationSlot[],
  picks: SquadPlayer[],
  weight: number,
): number =>
  slots.reduce(
    (sum, slot, i) =>
      sum + (weight * (100 - Math.min(100, positionFit(picks[i].position, slot.position)))) / 100,
    0,
  );

const objective = (
  attack: number,
  defense: number,
  mode: RankMode,
  penalty: number,
  space: number,
  densityWeight: number,
): number => tacticalValue(attack, defense, mode) - penalty + densityWeight * space;

/* ------------------------------------------------------------------ *
 * 安い適性スクリーニング
 *
 * カタログは2万形近くある。全部を盤面評価すると十数秒かかるので、
 * **盤面を見ずに「その構成をこのスカッドで組めるか」だけ**を先に見る。
 *
 * ポジションごとに適性の高い順に並べておけば、
 * 「CB が3枚必要なら上位3人ぶんの適性を足す」で上限が概算できる。
 * 同じ選手を重複して数えるので厳密な割当より甘いが、
 * 「専門外しか居ないポジションを3枚要求する構成」をふるい落とすには十分。
 * ------------------------------------------------------------------ */

const fitLadders = (squad: SquadPlayer[]): Map<PositionId, number[]> => {
  const map = new Map<PositionId, number[]>();
  for (const pos of POSITION_ORDER) {
    map.set(
      pos,
      squad
        .map((p) => positionFit(p.position, pos))
        .sort((a, b) => b - a),
    );
  }
  return map;
};

/** その構成をスカッドで組んだときの適性の概算（高いほど無理がない） */
const roughFit = (slots: FormationSlot[], ladders: Map<PositionId, number[]>): number => {
  const need = new Map<PositionId, number>();
  for (const sl of slots) need.set(sl.position, (need.get(sl.position) ?? 0) + 1);
  let sum = 0;
  for (const [pos, n] of need) {
    const ladder = ladders.get(pos) ?? [];
    for (let i = 0; i < n; i++) sum += Math.max(0, Math.min(100, ladder[i] ?? 0));
  }
  return sum / slots.length;
};

/* ------------------------------------------------------------------ *
 * 布陣の組み立て
 * ------------------------------------------------------------------ */

const toLineup = (
  slots: FormationSlot[],
  picks: SquadPlayer[],
  line: number,
): Player[] =>
  slots.map((slot, i) => {
    const sp = picks[i];
    return {
      id: `home-${slot.number}`,
      team: 'home' as TeamId,
      number: slot.number,
      name: sp.name,
      position: slot.position,
      attackSkill: sp.attackSkill,
      defenseSkill: sp.defenseSkill,
      pos: slotPosition(slot, 'home', line),
    };
  });

/** 探索の設定。実測に合わせて絞ってある */
const SEARCH = {
  /** 1スロットあたり何人のベンチ候補を試すか */
  candidatesPerSlot: 3,
  /** 改善が続く限り回すラウンド数の上限 */
  maxRounds: 2,
  /** 探索中の起点サンプル数（本番評価は全10起点） */
  quickHolders: 4,
  /**
   * 山登りをかける上位形の数。
   *
   * カタログは 基本形17 × 変種6 = 102 形ある。全部に山登りをかけると2秒強かかるが、
   * 下位の形は誰を入れ替えても上位には届かない。初期割当（適性だけの11人）のスコアで
   * 一度ふるいにかけ、上位だけを本気で探索する。表示するのも上位だけなので実害がない。
   */
  refineTop: 24,
  /**
   * 上位候補について試すライン高さ [m]。
   *
   * ポジション構成（タイプ）を振っても相手との「相性」はほとんど増えない（実測 1.7%）。
   * 相性を生むのは**ラインの高さ**の方だった（同 14.6%）。ただしカタログに掛け合わせると
   * 形の数が3倍になるので、上位候補だけ3段階を試して良い方を採る。
   */
  lineOptions: [-7, 0, 7],
  /**
   * 全起点で評価し直す上位の数。
   *
   * カタログは1700形を超えるので全部を全起点評価すると数秒かかる。
   * 下位は粗い評価で足切りできるし、一覧にも出さないので、ここだけ丁寧に見る。
   * 各名前の最良形は件数に関わらず必ず含める（「名前ごと」の一覧を埋めるため）。
   */
  fullEvalTop: 80,
  /** ラインの高さを振ってみる上位の数 */
  lineSearchTop: 200,
  /**
   * 名前ごとに盤面評価へ送る形の数（適性の概算で上位から選ぶ）。
   * 名前を横断して探すときだけ効く。名前を指定したときはその名前の全形を見る。
   */
  perFamily: 8,
};

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

/** その名前の形がもう入っているか */
const hasFamily = (
  map: Map<string, { formation: { family: string } }>,
  family: string,
): boolean => {
  for (const v of map.values()) if (v.formation.family === family) return true;
  return false;
};

export const recommendFormations = (input: RecommendInput): RecommendResult => {
  const started = Date.now();
  let evaluations = 0;
  const squad = input.squad;
  if (squad.length < 11) {
    throw new Error('起用できる選手が11人に足りません');
  }

  const away = input.opponentPlayers;
  const density = analyzeDensity(away);
  const weights = weightsFor(input);

  const benchOf = (current: SquadPlayer[]) =>
    squad.filter((p) => !current.some((c) => c.id === p.id));

  /**
   * 1段目：適性だけで11人を組み、粗く評価する。
   * 同じ基本形の変種はスロットのポジションが同一なので、割当行列も同じになる。
   * 家族ごとに1度だけ解いて使い回す。
   */
  /*
   * 候補の絞り込み。
   *
   * カタログは2万形近くあるので全部を盤面評価はできない。
   *   - family 指定あり … その名前の形だけ（UI の2段目。だいたい数百形なので全部見る）
   *   - 指定なし        … 各名前につき、スカッドで無理なく組める上位 perFamily 形だけ
   *
   * 「このスカッドでは専門外しか置けない構成」は盤面を見るまでもなく推奨されないので、
   * 盤面評価の前に適性の概算で落とす。
   */
  const ladders = fitLadders(squad);
  const pool = input.family
    ? FORMATIONS.filter((f) => f.family === input.family)
    : (() => {
        const byFamily = new Map<string, { f: (typeof FORMATIONS)[number]; fit: number }[]>();
        for (const f of FORMATIONS) {
          const entry = { f, fit: roughFit(f.slots, ladders) };
          const list = byFamily.get(f.family);
          if (list) list.push(entry);
          else byFamily.set(f.family, [entry]);
        }
        return [...byFamily.values()].flatMap((list) =>
          list.sort((a, b) => b.fit - a.fit).slice(0, SEARCH.perFamily).map((e) => e.f),
        );
      })();

  const assignCache = new Map<string, SquadPlayer[]>();
  const seeded = pool.map((formation) => {
    const cached = assignCache.get(formation.family);
    const picks =
      cached ??
      assignByScore(
        formation.slots.map((slot) => squad.map((p) => fitScore(slot.position, p))),
      ).map((idx) => squad[idx]);
    if (!cached) assignCache.set(formation.family, picks);

    const penalty = fitPenaltyOf(formation.slots, picks, weights.fitPenalty);

    /*
     * ラインの高さもここで一緒に振る。
     *
     * 山登りのあとに振ると「line 0 用に最適化した11人」で比べることになり、
     * 必ず line 0 が勝つ（実測で一度も ±7m が選ばれなかった）。
     * 同じ初期11人で横並びに比べるこの段階なら公平。
     */
    let seed = -Infinity;
    let lineShift = 0;
    for (const dl of [0]) {
      const lineup = toLineup(withLineShift(formation.slots, dl), picks, input.homeLine);
      const scored = scoreBoard([...lineup, ...away], input, SEARCH.quickHolders);
      evaluations += 2;
      const v = objective(
        scored.attack,
        scored.defense,
        input.rankMode,
        penalty,
        spaceExploitation(lineup, density),
        weights.density,
      );
      if (v > seed) {
        seed = v;
        lineShift = dl;
      }
    }
    return { formation, picks, seed, lineShift };
  });

  /*
   * 1.5段目：上位だけラインの高さを振る。
   * 全形に3段階かけると 1700形×3 で数秒かかるが、下位は振っても上位に届かない。
   */
  for (const cand of [...seeded].sort((a, b) => b.seed - a.seed).slice(0, SEARCH.lineSearchTop)) {
    const penalty = fitPenaltyOf(cand.formation.slots, cand.picks, weights.fitPenalty);
    for (const dl of SEARCH.lineOptions) {
      if (dl === 0) continue;
      const lineup = toLineup(withLineShift(cand.formation.slots, dl), cand.picks, input.homeLine);
      const scored = scoreBoard([...lineup, ...away], input, SEARCH.quickHolders);
      evaluations += 2;
      const v = objective(
        scored.attack,
        scored.defense,
        input.rankMode,
        penalty,
        spaceExploitation(lineup, density),
        weights.density,
      );
      if (v > cand.seed) {
        cand.seed = v;
        cand.lineShift = dl;
      }
    }
  }

  // 2段目：見込みのある上位だけ山登りをかける
  const bySeed = [...seeded].sort((a, b) => b.seed - a.seed);
  const refineIds = new Set(bySeed.slice(0, SEARCH.refineTop).map((x) => x.formation.id));

  // 全起点で評価し直す対象（上位 + 名前ごとの最良）
  const fullSet = new Map(bySeed.slice(0, SEARCH.fullEvalTop).map((x) => [x.formation.id, x]));
  for (const x of bySeed) if (!hasFamily(fullSet, x.formation.family)) fullSet.set(x.formation.id, x);

  const raw = [...fullSet.values()].map(({ formation, picks: seedPicks, seed, lineShift }) => {
    // 1段目で決めたラインの上で11人を詰める
    const slots = withLineShift(formation.slots, lineShift);
    let picks = seedPicks;
    let best = seed;

    for (let round = 0; refineIds.has(formation.id) && round < SEARCH.maxRounds; round++) {
      let improved = false;
      for (let i = 0; i < slots.length; i++) {
        const bench = benchOf(picks);
        // そのスロットに合いそうなベンチだけを候補にする
        const candidates = bench
          .map((p) => ({ p, f: fitScore(slots[i].position, p) }))
          .filter((c) => positionFit(c.p.position, slots[i].position) >= MIN_CANDIDATE_FIT)
          .sort((a, b) => b.f - a.f)
          .slice(0, SEARCH.candidatesPerSlot);

        for (const c of candidates) {
          const trial = picks.slice();
          trial[i] = c.p;
          const trialLineup = toLineup(slots, trial, input.homeLine);
          const s = scoreBoard([...trialLineup, ...away], input, SEARCH.quickHolders);
          evaluations += 2;
          const v = objective(
            s.attack,
            s.defense,
            input.rankMode,
            fitPenaltyOf(slots, trial, weights.fitPenalty),
            spaceExploitation(trialLineup, density),
            weights.density,
          );
          if (v > best + 1e-9) {
            picks = trial;
            best = v;
            improved = true;
            break;
          }
        }
      }
      if (!improved) break;
    }

    // 3段目：最終スコアは全形について全起点で取り直す（表の数字を揃えるため）
    const lineup = toLineup(slots, picks, input.homeLine);
    const final = scoreBoard([...lineup, ...away], input);
    evaluations += 2;
    const spaceScore = spaceExploitation(lineup, density);
    const fitPenalty = fitPenaltyOf(slots, picks, weights.fitPenalty);

    const assignments: SlotAssignment[] = slots.map((slot, i) => ({
      slot,
      player: picks[i],
      fit: fitScore(slot.position, picks[i]),
      positionFit: positionFit(picks[i].position, slot.position),
    }));

    return {
      formationId: formation.id,
      label: formation.label,
      desc: formation.desc,
      family: formation.family,
      familyLabel: formation.familyLabel,
      typeId: formation.typeId,
      typeLabel: formation.typeLabel,
      symmetryKey: formation.symmetryKey,
      lineShift,
      refined: refineIds.has(formation.id),
      attack: final.attack,
      defense: final.defense,
      balance: final.attack - final.defense,
      fitAverage: assignments.reduce((a, b) => a + Math.min(100, b.positionFit), 0) / assignments.length,
      fitPenalty,
      spaceScore,
      /** 最終的な採用判断に使う値。戦術スコア − 適性減点 + 密度加点 */
      score: objective(
        final.attack,
        final.defense,
        input.rankMode,
        fitPenalty,
        spaceScore,
        weights.density,
      ),
      assignments,
      lineup,
      bench: benchOf(picks),
    };
  });

  const byAttack = [...raw].sort((a, b) => b.attack - a.attack).map((r) => r.formationId);
  const byDefense = [...raw].sort((a, b) => a.defense - b.defense).map((r) => r.formationId);
  const byBalance = [...raw].sort((a, b) => b.balance - a.balance).map((r) => r.formationId);

  const rows: FormationRecommendation[] = raw.map((r) => ({
    ...r,
    attackRank: byAttack.indexOf(r.formationId) + 1,
    defenseRank: byDefense.indexOf(r.formationId) + 1,
    balanceRank: byBalance.indexOf(r.formationId) + 1,
  }));

  // 並びは総合値。相手の空きゾーンを突けているか（密度加点）と
  // 本職起用かどうか（適性減点）を含めた、実際に採るべき順。
  const sorted = [...rows].sort((a, b) => b.score - a.score);

  return {
    rows: sorted,
    best: sorted[0],
    density,
    valueModel: input.valueModel ?? FIXED_PARAMS.valueModel,
    evaluations,
    elapsedMs: Date.now() - started,
    candidates: pool.length,
  };
};

/** 相手チームの布陣（提案結果を盤面で見るときに使う） */
export const opponentLineup = (formationId: string, line: number): Player[] =>
  buildLineup('away', formationId, line);

/* ------------------------------------------------------------------ *
 * 攻撃時 / 守備時フォーメーション
 *
 * eFootball のアップデートで、攻撃時と守備時で別のフォーメーションを
 * 設定できるようになった。**選手は入れ替えられない**ので、同じ11人のまま
 * 形だけを変えることになる。これが制約。
 *
 * 手順:
 *   1. 攻撃時に最も良い形と11人を決める（rankMode='attack'）
 *   2. その11人を固定して、守備時に最も良い形を探す（rankMode='defense'）
 *   3. 選手がどこへ動くかを並べて返す
 *
 * 2 で選手を固定するため、守備形の候補は「その11人で組めるもの」に限られる。
 * 割当はハンガリアン法で解き直すので、同じ11人が別のポジションに就く
 * （例: 攻撃時 LWG だった選手が守備時 LMF に下がる）。
 * ------------------------------------------------------------------ */

/** 守備形を探すときの適性減点の倍率 */
const PHASE_FIT_SCALE = 0.25;

export interface PhaseMove {
  player: SquadPlayer;
  /** 攻撃時のポジションと座標 */
  attack: { position: PositionId; pos: Vec2 };
  /** 守備時のポジションと座標 */
  defense: { position: PositionId; pos: Vec2 };
  /** 攻→守で下がる距離 [m]（マイナスなら前に出る） */
  dropBack: number;
}

export interface PhasePlan {
  /** 攻撃時に使う形 */
  attack: FormationRecommendation;
  /** 守備時に使う形（攻撃時と同じ11人） */
  defense: FormationRecommendation;
  /** 攻撃時の候補一覧（上位） */
  attackRows: FormationRecommendation[];
  /** 守備時の候補一覧（11人固定での上位） */
  defenseRows: FormationRecommendation[];
  /** 11人がどこへ動くか */
  moves: PhaseMove[];
  density: DensityReport;
  /** 実際に使った評価モデル */
  valueModel: ValueModel;
  evaluations: number;
  elapsedMs: number;
}

/**
 * 攻撃時・守備時の2つの形を提案する。
 * `squad` から11人を選び、その11人のまま形だけを変える。
 */
export const recommendPhasePlan = (
  input: Omit<RecommendInput, 'rankMode'>,
): PhasePlan => {
  const started = Date.now();

  // 1. 攻撃時に最も良い形と11人
  const atk = recommendFormations({ ...input, rankMode: 'attack' });

  // 2. その11人だけを使って守備時の形を探す
  const eleven = atk.best.assignments.map((a) => a.player);
  const def = recommendFormations({
    ...input,
    squad: eleven,
    rankMode: 'defense',
    fitPenaltyScale: PHASE_FIT_SCALE,
    densityScale: 0,
  });

  // 3. 選手ごとの移動
  const defBy = new Map(def.best.assignments.map((a) => [a.player.id, a]));
  const moves: PhaseMove[] = atk.best.assignments.map((a) => {
    const d = defBy.get(a.player.id);
    const attack = { position: a.slot.position, pos: slotPosition(a.slot, 'home', input.homeLine) };
    const defense = d
      ? { position: d.slot.position, pos: slotPosition(d.slot, 'home', input.homeLine) }
      : attack;
    return { player: a.player, attack, defense, dropBack: attack.pos.x - defense.pos.x };
  });

  return {
    attack: atk.best,
    defense: def.best,
    attackRows: atk.rows,
    defenseRows: def.rows,
    moves,
    density: atk.density,
    valueModel: atk.valueModel,
    evaluations: atk.evaluations + def.evaluations,
    elapsedMs: Date.now() - started,
  };
};
