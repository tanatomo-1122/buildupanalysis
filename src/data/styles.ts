import type { SceneId, StyleDef, StylePhaseKey, TeamId, VectorCoeff } from '../types';
import { ZERO_COEFF } from '../types';

/**
 * チームスタイル（eFootball 準拠）
 *
 * 4局面ぶんの係数を持つ。局面（SceneId）と味方／相手の別で、どの列を使うかが決まる。
 *   possession : 自チーム=attack        / 相手=defense
 *   transition : 自チーム=transitionWin / 相手=transitionLose
 *
 * 係数はゲーム内の説明文をベクトルに翻訳したもの。単位はメートル。
 */

const c = (v: Partial<VectorCoeff>): VectorCoeff => ({ ...ZERO_COEFF, ...v });

export const TEAM_STYLES: StyleDef[] = [
  {
    id: 'possession',
    label: 'ポゼッション',
    phases: {
      attack: {
        desc: 'ボールに近づく動きをします',
        coeff: c({ ballward: 4.5, forward: 1.5 }),
      },
      defense: {
        desc: 'ディフェンスラインを高く保ち、前線から積極的にプレスをかけます',
        coeff: c({ forward: 5.0, ballward: 4.0 }),
      },
      transitionWin: {
        desc: '味方はボール付近にポジショニングし、ボール保持を優先します',
        coeff: c({ ballward: 5.5, forward: 0.5 }),
      },
      transitionLose: {
        desc: 'ボール周辺の選手がすばやくプレスをかけます',
        coeff: c({ ballward: 5.5, forward: 1.0 }),
      },
    },
  },
  {
    id: 'shortCounter',
    label: 'ショートカウンター',
    phases: {
      attack: {
        desc: '選手は積極的に前に飛び出し、縦に素早い攻撃を仕掛けます',
        coeff: c({ forward: 8.0, ballward: -0.5 }),
      },
      defense: {
        desc: 'ディフェンスラインを高く保ち、チーム全体で積極的にプレスをかけます',
        coeff: c({ forward: 5.0, ballward: 4.0 }),
      },
      transitionWin: {
        desc: '高い位置でボールを奪った際、選手は積極的に前に走り、ゴールにダイレクトに向かうカウンター攻撃を仕掛けます',
        coeff: c({ forward: 11.0, goalmouth: 3.0, ballward: -1.0 }),
      },
      transitionLose: {
        desc: 'ボール周辺の選手が素早く激しいプレスをかけます',
        coeff: c({ ballward: 7.5, forward: 1.5 }),
      },
    },
  },
  {
    id: 'longCounter',
    label: 'ロングカウンター',
    phases: {
      attack: {
        desc: '選手間の距離を長く保ち、長い距離のパスを活用して攻撃します。ボールから遠い味方も積極的に裏に飛び出します',
        coeff: c({ forward: 9.0, width: 3.5, ballward: -3.0 }),
      },
      defense: {
        desc: 'ディフェンスブロックを自陣付近に構え、守備を行います',
        coeff: c({ goalward: 6.0, ballward: 0.5 }),
      },
      transitionWin: {
        desc: '自陣深くでボールを奪った際、選手は積極的に前に走り、前線の広いスペースを活用した素早いカウンター攻撃を仕掛けます',
        coeff: c({ forward: 14.0, width: 3.0, ballward: -2.5 }),
      },
      transitionLose: {
        desc: '自陣に素早く戻り、ディフェンスブロックを形成することを優先します',
        coeff: c({ goalward: 8.0 }),
      },
    },
  },
  {
    id: 'sideAttack',
    label: 'サイドアタック',
    phases: {
      attack: {
        desc: 'サイドエリアから攻め込み、クロスを主体に得点を狙います。センタリングエリアにボールがある場合、複数人が積極的にゴール前に入っていきます',
        coeff: c({ width: 5.5, forward: 3.0, goalmouth: 2.0 }),
      },
      defense: {
        desc: '中盤にディフェンスブロックを構え、守備を行います',
        coeff: c({ goalward: 2.0, ballward: 1.5 }),
      },
      transitionWin: {
        desc: '味方はサイドに広がることを優先します。中央の選手はボールサイドに寄ったポジショニングを行います',
        coeff: c({ width: 5.0, ballward: 2.0, forward: 2.0 }),
      },
      transitionLose: {
        desc: '中盤にディフェンスブロックを作ることを優先します',
        coeff: c({ goalward: 3.0, ballward: 1.0 }),
      },
    },
  },
  {
    id: 'longBall',
    label: 'ロングボール',
    phases: {
      attack: {
        desc: '中盤を省略し、前線の選手めがけてロングボールを入れる攻撃を仕掛けます。味方はセカンドボールを拾えるようにサポートを行います',
        coeff: c({ forward: 5.0, ballward: 2.5, width: -1.0 }),
      },
      defense: {
        desc: 'ディフェンスブロックを低い位置に構え、守備を行います',
        coeff: c({ goalward: 7.0 }),
      },
      transitionWin: {
        desc: '後方の味方はセーフティな低い位置でサポートを行い、前線の味方が前に上がるのを待ちます',
        coeff: c({ goalward: 2.5, ballward: 2.5 }),
      },
      transitionLose: {
        desc: '低い位置にディフェンスブロックを形成することを優先します',
        coeff: c({ goalward: 8.5 }),
      },
    },
  },
  {
    id: 'overload',
    label: 'オーバーロード',
    phases: {
      attack: {
        desc: 'ボール周辺に人を集めて狭いエリアで数的優位を作り、ショートパスで相手の守備を崩します',
        coeff: c({ ballward: 6.5, forward: 1.0, width: -1.5 }),
      },
      defense: {
        desc: 'チーム全体でボールサイドに寄せてディフェンスブロックをコンパクトにして守備をします。また、高い位置にボールがある際にチーム全体で積極的にプレスをかけます',
        coeff: c({ ballward: 6.0, forward: 2.0, width: -2.0 }),
      },
      transitionWin: {
        desc: '近くの味方がサポートしてボール保持を優先します。高い位置で奪ったり、奪ってすぐ前線へパスを出した場合は、カウンター攻撃を仕掛けます',
        coeff: c({ ballward: 5.5, forward: 2.5 }),
      },
      transitionLose: {
        desc: 'ボールを奪われた際、ボール周辺の選手が複数人で素早く激しいプレスをかけます',
        coeff: c({ ballward: 8.0, forward: 1.0 }),
      },
    },
  },
];

export const styleById = (id: string): StyleDef =>
  TEAM_STYLES.find((s) => s.id === id) ?? TEAM_STYLES[0];

/**
 * 局面とチームの別から、適用されるスタイル列のキーを決める。
 * @param possessionTeam ボールを保持しているチーム
 */
export const stylePhaseKey = (
  scene: SceneId,
  team: TeamId,
  possessionTeam: TeamId,
): StylePhaseKey => {
  const attacking = team === possessionTeam;
  if (scene === 'possession') return attacking ? 'attack' : 'defense';
  return attacking ? 'transitionWin' : 'transitionLose';
};

export const STYLE_PHASE_LABEL: Record<StylePhaseKey, string> = {
  attack: '攻撃時',
  defense: '守備時',
  transitionWin: 'ボールを奪った時',
  transitionLose: 'ボールを奪われた時',
};

export const SCENES: { id: SceneId; label: string; desc: string }[] = [
  {
    id: 'possession',
    label: '保持（ビルドアップ）',
    desc: '保持側＝「攻撃時」／非保持側＝「守備時」の列を適用します。',
  },
  {
    id: 'transition',
    label: 'トランジション（奪った直後）',
    desc: '保持側＝「ボールを奪った時」／非保持側＝「ボールを奪われた時」の列を適用します。',
  },
];
