import type { PositionId, SkillDef, SkillPhase, VectorCoeff } from '../types';
import { ZERO_COEFF } from '../types';

/**
 * 選手特性（eFootball 準拠）
 *
 * 係数はゲーム内の説明文をベクトルに翻訳したもの。単位はメートル。
 *   forward   : 攻撃方向（自チームが攻める向き）
 *   width     : 中央線 y=34 から外側（タッチライン方向）／負値で内側に絞る
 *   ballward  : ボール方向／負値でボールから離れる
 *   goalward  : 自陣ゴール方向（撤退）
 *   goalmouth : 相手ゴール中央 (105, 34) 方向
 *
 * 数値を書き換えれば、そのまま仮説のチューニングになる。
 */

const c = (v: Partial<VectorCoeff>): VectorCoeff => ({ ...ZERO_COEFF, ...v });

/* ================================================================== *
 * 攻撃時に発動する特性
 * ================================================================== */

const ATTACK_SKILLS: SkillDef[] = [
  {
    id: 'att_advancedGK',
    label: 'アドバンスドGK',
    phase: 'attack',
    positions: ['GK'],
    desc: '攻撃中は高い位置にポジショニングし、カウンターを受けた時にディフェンスラインの裏のスペースをカバーします',
    coeff: c({ forward: 8.0 }),
  },
  {
    id: 'att_buildUp',
    label: 'ビルドアップ',
    phase: 'attack',
    positions: ['CB'],
    desc: '後方から攻撃の組み立てに参加します',
    coeff: c({ forward: 3.0, ballward: 2.5, width: 1.5 }),
  },
  {
    id: 'att_overlap',
    label: 'オーバーラップ',
    phase: 'attack',
    positions: ['CB'],
    desc: '前線での攻撃参加を好むディフェンダーです',
    coeff: c({ forward: 8.0 }),
  },
  {
    id: 'att_attackingFullback',
    label: '攻撃的サイドバック',
    phase: 'attack',
    positions: ['RSB', 'LSB'],
    desc: '常に高めのポジションを取り、積極的に攻撃に参加します',
    coeff: c({ forward: 9.0, width: 3.0 }),
  },
  {
    id: 'att_defensiveFullback',
    label: '守備的サイドバック',
    phase: 'attack',
    positions: ['RSB', 'LSB'],
    desc: '常に低めのポジションを取り、守備を重視して行動します',
    coeff: c({ goalward: 2.0, width: 1.0 }),
  },
  {
    id: 'att_innerLapFullback',
    label: 'インナーラップサイドバック',
    phase: 'attack',
    positions: ['RSB', 'LSB'],
    desc: '高めのポジションを取り、相手ゴール近くでは中に入って攻撃に参加します',
    coeff: c({ forward: 8.0, width: -3.5 }),
  },
  {
    id: 'att_anchor',
    label: 'アンカー',
    phase: 'attack',
    positions: ['DMF'],
    desc: '中盤の底に位置して守備を安定させます',
    coeff: c({ goalward: 1.5, ballward: 1.5 }),
  },
  {
    id: 'att_playmaker',
    label: 'プレーメイカー',
    phase: 'attack',
    positions: ['CMF', 'DMF'],
    desc: '攻撃時は低めのポジションから攻撃の起点となります',
    coeff: c({ goalward: 2.0, ballward: 4.0 }),
  },
  {
    id: 'att_boxToBox',
    label: 'ボックストゥボックス',
    phase: 'attack',
    positions: ['CMF', 'DMF', 'LMF', 'RMF'],
    desc: 'フィールドの隅から隅まで動きまわり、攻守に貢献します',
    coeff: c({ forward: 6.0, ballward: 2.5 }),
  },
  {
    id: 'att_secondLineRun',
    label: '2列目からの飛び出し',
    phase: 'attack',
    positions: ['OMF', 'ST', 'RMF', 'LMF', 'CMF'],
    desc: '攻撃時には常にゴール前に出ることを意識します',
    coeff: c({ goalmouth: 8.0, forward: 4.0 }),
  },
  {
    id: 'att_crosser',
    label: 'クロサー',
    phase: 'attack',
    positions: ['RMF', 'LMF', 'RWG', 'LWG'],
    desc: 'タッチライン際にポジションを取り、クロスを狙います',
    coeff: c({ width: 6.5, forward: 4.0 }),
  },
  {
    id: 'att_insideReceiver',
    label: 'インサイドレシーバー',
    phase: 'attack',
    positions: ['RWG', 'LWG', 'RMF', 'LMF'],
    desc: 'サイドから中に入ってパスをもらう動きをします',
    coeff: c({ width: -6.0, forward: 3.0 }),
  },
  {
    id: 'att_chanceMaker',
    label: 'チャンスメイカー',
    phase: 'attack',
    positions: ['OMF', 'ST', 'RWG', 'LWG', 'RMF', 'LMF'],
    desc: 'どこにでも顔を出して攻撃の組み立てやラストパスを担います',
    coeff: c({ ballward: 5.0, forward: 1.5 }),
  },
  {
    id: 'att_wingStriker',
    label: 'ウイングストライカー',
    phase: 'attack',
    positions: ['RWG', 'LWG'],
    desc: 'タッチライン際でパスを待ち、中へのドリブルを狙います',
    coeff: c({ width: 5.0, forward: 3.0 }),
  },
  {
    id: 'att_numberTen',
    label: 'ナンバー10',
    phase: 'attack',
    positions: ['OMF', 'ST'],
    desc: '高い位置でポジショニングし攻撃の起点になります。チャンスでは相手ゴール付近へ動き、得点を狙います',
    coeff: c({ forward: 5.0, goalmouth: 3.0 }),
  },
  {
    id: 'att_decoyRun',
    label: 'デコイラン',
    phase: 'attack',
    positions: ['CF', 'ST', 'OMF'],
    desc: '囮となる動きを行い、味方が攻めやすくなるようにします',
    coeff: c({ forward: 6.0, ballward: -4.0, width: 2.5 }),
  },
  {
    id: 'att_linkForward',
    label: 'リンクフォワード',
    phase: 'attack',
    positions: ['CF', 'ST'],
    desc: '前線からボールをもらいに下がってきて、チャンスを作ります',
    coeff: c({ goalward: 6.0, ballward: 4.0 }),
  },
  {
    id: 'att_lineBreaker',
    label: 'ラインブレイカー',
    phase: 'attack',
    positions: ['CF'],
    desc: '裏へ抜ける動きをします',
    coeff: c({ forward: 13.0 }),
  },
  {
    id: 'att_boxStriker',
    label: 'ボックスストライカー',
    phase: 'attack',
    positions: ['CF'],
    desc: '動き回らずに中央でボールが来るのを待ちます',
    coeff: c({ width: -2.0, goalmouth: 1.0 }),
  },
  {
    id: 'att_targetMan',
    label: 'ターゲットマン',
    phase: 'attack',
    positions: ['CF'],
    desc: '空中戦に強く、前線の深い位置で体を張ってポストプレーをします',
    coeff: c({ forward: 2.0, ballward: 2.5 }),
  },
];

/* ================================================================== *
 * 守備時に発動する特性
 * ================================================================== */

const DEFENSE_SKILLS: SkillDef[] = [
  {
    id: 'def_sweeperKeeper',
    label: 'スイーパーGK',
    phase: 'defense',
    positions: ['GK'],
    desc: '高い位置にポジショニングし、積極的に飛び出してディフェンスラインの裏のスペースを広くカバーします',
    coeff: c({ forward: 9.0 }),
  },
  {
    id: 'def_attackingGK',
    label: '攻撃的GK',
    phase: 'defense',
    positions: ['GK'],
    desc: 'シュートコースを限定し、ディフェンスラインの裏のスペースに出されたボールに対応するなど、積極的に前に出てプレーします',
    coeff: c({ forward: 5.0 }),
  },
  {
    id: 'def_defensiveGK',
    label: '守備的GK',
    phase: 'defense',
    positions: ['GK'],
    desc: '積極的には飛び出さず、自陣のゴール付近でポジショニングします',
    coeff: c({ goalward: 2.0 }),
  },
  {
    id: 'def_covering',
    label: 'カバーリング',
    phase: 'defense',
    positions: ['CB', 'CMF', 'DMF', 'LSB', 'RSB'],
    desc: 'マッチアップしている味方を積極的にカバーします',
    coeff: c({ goalward: 3.0, width: -3.0, ballward: 1.5 }),
  },
  {
    id: 'def_lineController',
    label: 'ラインコントローラー',
    phase: 'defense',
    positions: ['CB', 'LSB', 'RSB'],
    desc: 'ディフェンスラインの維持を優先し、崩さないように守備をします',
    coeff: c({ ballward: 0.5 }),
  },
  {
    id: 'def_hardPress',
    label: 'ハードプレス',
    phase: 'defense',
    positions: ['CMF', 'DMF', 'LSB', 'RSB', 'CB'],
    desc: 'ボールを保持している相手が近くにいる時、積極的にプレッシャーをかけます',
    coeff: c({ ballward: 8.0, forward: 1.0 }),
  },
  {
    id: 'def_anchor',
    label: 'アンカー',
    phase: 'defense',
    positions: ['DMF'],
    desc: '中盤の底に位置して守備を安定させます',
    coeff: c({ goalward: 2.5, width: -2.0, ballward: 1.0 }),
  },
  {
    id: 'def_boxToBox',
    label: 'ボックストゥボックス',
    phase: 'defense',
    positions: ['CMF', 'DMF', 'RMF', 'LMF'],
    desc: 'フィールドの隅から隅まで動きまわり、攻守に貢献します',
    coeff: c({ goalward: 5.0, ballward: 3.0 }),
  },
  {
    id: 'def_hardWorker',
    label: 'ハードワーカー',
    phase: 'defense',
    positions: ['CMF', 'DMF', 'LMF', 'RMF', 'OMF'],
    desc: '守備時に積極的に戻り、相手の攻撃に対応します',
    coeff: c({ goalward: 6.0, ballward: 2.0 }),
  },
  {
    id: 'def_laneBlocker',
    label: 'レーンブロッカー',
    phase: 'defense',
    positions: ['CMF', 'DMF', 'LMF', 'RMF', 'OMF'],
    desc: '積極的に相手のパスコースを消しに行く守備をします',
    coeff: c({ ballward: 4.0, width: -3.5, forward: 1.0 }),
  },
  {
    id: 'def_firstDefender',
    label: 'ファーストディフェンダー',
    phase: 'defense',
    positions: ['CF', 'ST', 'RWG', 'LWG'],
    desc: '最終ラインで相手のGKやDFに積極的にプレスをかけます',
    coeff: c({ ballward: 9.0, forward: 3.0 }),
  },
  {
    id: 'def_coverShadow',
    label: 'カバーシャドウ',
    phase: 'defense',
    positions: ['CF', 'ST', 'RWG', 'LWG'],
    desc: '相手のパスコースを意識してポジショニングしやすくなります',
    coeff: c({ ballward: 3.5, width: -2.0, forward: 1.5 }),
  },
  {
    id: 'def_outletPlayer',
    label: 'アウトレットプレイヤー',
    phase: 'defense',
    positions: ['CF', 'ST', 'RWG', 'LWG', 'OMF'],
    desc: '状況に応じて守備を控えて体力を温存し、攻撃に備えて前線に残りやすくなります',
    coeff: c({ forward: 3.0, ballward: -1.0 }),
  },
];

/* ================================================================== */

export const NO_SKILL_ID = 'none';

const NONE_ATTACK: SkillDef = {
  id: NO_SKILL_ID,
  label: '特性なし',
  phase: 'attack',
  positions: [],
  desc: '特性による補正をかけません（チームスタイルの影響のみ）。',
  coeff: ZERO_COEFF,
};

const NONE_DEFENSE: SkillDef = { ...NONE_ATTACK, phase: 'defense' };

export const ALL_SKILLS: SkillDef[] = [...ATTACK_SKILLS, ...DEFENSE_SKILLS];

const SKILL_MAP = new Map<string, SkillDef>(
  [...ALL_SKILLS, NONE_ATTACK].map((s) => [s.id, s]),
);

export const skillById = (id: string): SkillDef =>
  SKILL_MAP.get(id) ?? NONE_ATTACK;

/** そのポジション・フェーズで選択できる特性一覧（先頭は「特性なし」） */
export const skillsFor = (position: PositionId, phase: SkillPhase): SkillDef[] => {
  const none = phase === 'attack' ? NONE_ATTACK : NONE_DEFENSE;
  const list = (phase === 'attack' ? ATTACK_SKILLS : DEFENSE_SKILLS).filter((s) =>
    s.positions.includes(position),
  );
  return [none, ...list];
};

/**
 * プルダウン用の選択肢。
 * 設定済みの特性がそのポジションの選択肢に無い場合（フォーメーション変更で
 * ポジションだけ変わった等）も、選択を失わないよう末尾に残して印を付ける。
 */
export const skillOptions = (
  position: PositionId,
  phase: SkillPhase,
  current: string,
): { id: string; label: string; outOfPosition: boolean }[] => {
  const list = skillsFor(position, phase).map((s) => ({
    id: s.id,
    label: s.label,
    outOfPosition: false,
  }));
  if (!list.some((o) => o.id === current)) {
    list.push({ id: current, label: `${skillById(current).label}（${position}外）`, outOfPosition: true });
  }
  return list;
};

/** その特性がそのポジションで本来選べるものかどうか */
export const isSkillValidFor = (position: PositionId, phase: SkillPhase, id: string): boolean =>
  skillsFor(position, phase).some((s) => s.id === id);

/** ポジションごとの既定特性（フォーメーション適用時に使う） */
export const DEFAULT_SKILLS: Record<PositionId, { attack: string; defense: string }> = {
  GK: { attack: NO_SKILL_ID, defense: 'def_defensiveGK' },
  CB: { attack: 'att_buildUp', defense: 'def_lineController' },
  RSB: { attack: 'att_attackingFullback', defense: 'def_lineController' },
  LSB: { attack: 'att_attackingFullback', defense: 'def_lineController' },
  DMF: { attack: 'att_anchor', defense: 'def_anchor' },
  CMF: { attack: 'att_boxToBox', defense: 'def_hardWorker' },
  RMF: { attack: 'att_crosser', defense: 'def_hardWorker' },
  LMF: { attack: 'att_crosser', defense: 'def_hardWorker' },
  OMF: { attack: 'att_numberTen', defense: 'def_hardWorker' },
  RWG: { attack: 'att_wingStriker', defense: 'def_coverShadow' },
  LWG: { attack: 'att_wingStriker', defense: 'def_coverShadow' },
  ST: { attack: 'att_secondLineRun', defense: 'def_firstDefender' },
  CF: { attack: 'att_lineBreaker', defense: 'def_firstDefender' },
};
