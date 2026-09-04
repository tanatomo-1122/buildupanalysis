import { DEFAULT_PARAMS, PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import { FORMATIONS, buildLineup, slotPosition } from '../data/formations';
import type { FormationSlot } from '../data/formations';
import { positionFit } from '../data/positions';
import { isSkillValidFor } from '../data/skills';
import type { Params, Player, PositionId, SceneId, SquadPlayer, TeamId, Vec2 } from '../types';
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
  { id: 'balance', label: 'バランス', desc: '自分の前進 − 相手に許す前進。総合的に強い形。' },
  { id: 'attack', label: '攻撃重視', desc: '自分がボールを持ったときに最も前進できる形。' },
  { id: 'defense', label: '守備重視', desc: '相手に最も前進を許さない形。' },
];

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
}

export interface RecommendResult {
  rows: FormationRecommendation[];
  best: FormationRecommendation;
  /** 相手配置の密度解析 */
  density: DensityReport;
  /** 探索に使った盤面評価の回数（性能の目安） */
  evaluations: number;
  elapsedMs: number;
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
 * 本職から外れた起用に対する減点。
 *
 * 盤面評価は「その位置でどう振る舞うか」しか見ないので、これが無いと
 * 「本職CBがベンチにいるのにサイドバックをCBに置く」ような、戦術スコアだけは
 * 少し高いが現実には筋の悪い布陣に流れる。1人あたり最大 FIT_PENALTY 点、11人ぶんを合算して引く。
 * 本職（適性100）だけで組めば減点は 0。「兼任可」の 62 を1枚入れると約 3.0 点の減点になり、
 * それを上回る戦術的な利得がなければ採用されない。
 */
const FIT_PENALTY = 8;
/** 探索でそのスロットの候補にできる最低適性（これ未満は専門外として除外） */
const MIN_CANDIDATE_FIT = 50;

const fitPenaltyOf = (slots: FormationSlot[], picks: SquadPlayer[]): number =>
  slots.reduce(
    (sum, slot, i) =>
      sum + (FIT_PENALTY * (100 - Math.min(100, positionFit(picks[i].position, slot.position)))) / 100,
    0,
  );

/**
 * 密度解析の加点。
 *
 * PC は連続的な密度をすでに見ているので、ここは強くしすぎない。
 * 「戦術スコアがほぼ互角のとき、相手が空けているゾーンを突けている形を採る」
 * ためのタイブレーカーとして働く重みにしてある。
 */
const DENSITY_WEIGHT = 3;

const objective = (
  attack: number,
  defense: number,
  mode: RankMode,
  penalty: number,
  space: number,
): number => tacticalValue(attack, defense, mode) - penalty + DENSITY_WEIGHT * space;

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
};

/* ------------------------------------------------------------------ *
 * 本体
 * ------------------------------------------------------------------ */

export const recommendFormations = (input: RecommendInput): RecommendResult => {
  const started = Date.now();
  let evaluations = 0;
  const squad = input.squad;
  if (squad.length < 11) {
    throw new Error('起用できる選手が11人に足りません');
  }

  const away = input.opponentPlayers;
  const density = analyzeDensity(away);

  const raw = FORMATIONS.map((formation) => {
    const slots = formation.slots;

    // 1. 適性だけで最適割当を解く
    const matrix = slots.map((slot) => squad.map((p) => fitScore(slot.position, p)));
    const assigned = assignByScore(matrix);
    let picks = assigned.map((idx) => squad[idx]);

    // 2. 実際に評価する（探索中は起点を間引く）
    const initialLineup = toLineup(slots, picks, input.homeLine);
    const scored = scoreBoard([...initialLineup, ...away], input, SEARCH.quickHolders);
    evaluations += 2;
    let best = objective(
      scored.attack,
      scored.defense,
      input.rankMode,
      fitPenaltyOf(slots, picks),
      spaceExploitation(initialLineup, density),
    );

    // 3. ベンチとの入れ替えで改善を試す（first-improvement の山登り）
    const benchOf = (current: SquadPlayer[]) =>
      squad.filter((p) => !current.some((c) => c.id === p.id));

    for (let round = 0; round < SEARCH.maxRounds; round++) {
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
            fitPenaltyOf(slots, trial),
            spaceExploitation(trialLineup, density),
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

    // 4. 最終スコアは全起点で取り直す
    const lineup = toLineup(slots, picks, input.homeLine);
    const final = scoreBoard([...lineup, ...away], input);
    evaluations += 2;
    const spaceScore = spaceExploitation(lineup, density);
    const fitPenalty = fitPenaltyOf(slots, picks);

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
      attack: final.attack,
      defense: final.defense,
      balance: final.attack - final.defense,
      fitAverage: assignments.reduce((a, b) => a + Math.min(100, b.positionFit), 0) / assignments.length,
      fitPenalty,
      spaceScore,
      /** 最終的な採用判断に使う値。戦術スコア − 適性減点 + 密度加点 */
      score: objective(final.attack, final.defense, input.rankMode, fitPenalty, spaceScore),
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
    evaluations,
    elapsedMs: Date.now() - started,
  };
};

/** 相手チームの布陣（提案結果を盤面で見るときに使う） */
export const opponentLineup = (formationId: string, line: number): Player[] =>
  buildLineup('away', formationId, line);
