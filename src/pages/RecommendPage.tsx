import { useEffect, useMemo, useState } from 'react';
import { usablePlayers } from '../api/squad';
import FreeEditPitch from '../components/FreeEditPitch';
import LineupPitch from '../components/LineupPitch';
import { Button, Card, Notice, Select } from '../components/ui';
import { FORMATIONS, FORMATION_FAMILIES, formationById } from '../data/formations';
import { fitLabel } from '../data/positions';
import { skillById } from '../data/skills';
import { SCENES, TEAM_STYLES, styleById } from '../data/styles';
import type { DensityReport } from '../logic/density';
import { VALUE_MODELS, opponentLineup, recommendPhasePlan, scoreUnit } from '../logic/recommend';
import type { FormationRecommendation, PhasePlan } from '../logic/recommend';
import type { Player, SceneId, SquadPlayer, ValueModel } from '../types';

const ATTACK_COLOR = '#0284c7';
const DEFENSE_COLOR = '#e11d48';

const fmt = (n: number, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

/** 評価モデルによってスコアの意味が変わるので、見出しも合わせる */
const labelsFor = (model: ValueModel) =>
  model === 'passOptions'
    ? {
        attack: '自チームのパスコース',
        defense: '相手のパスコース',
        unit: scoreUnit(model),
        note: '通るパスの本数（GK以外の10起点の平均）',
      }
    : {
        attack: '自チームの前進',
        defense: '相手に許す前進',
        unit: scoreUnit(model),
        note: '期待前進値（GK以外の10起点の平均）',
      };

/** 棒は「最下位との差」。長いほど良い選択と読める向きに揃えている */
function Bar({ amount, max, color }: { amount: number; max: number; color: string }) {
  const width = max <= 0 ? 0 : (amount / max) * 100;
  return (
    <div className="relative h-2 w-full rounded-full bg-edge/70">
      <div
        className="absolute left-0 top-0 h-2"
        style={{
          width: `${Math.max(width, 0.8)}%`,
          background: color,
          borderRadius: '1px 4px 4px 1px',
        }}
      />
    </div>
  );
}

interface Props {
  squad: SquadPlayer[];
  onOpenBoard: (rec: FormationRecommendation, ctx: BoardContext) => void;
}

export interface BoardContext {
  homeStyle: string;
  opponentStyle: string;
  /** 元になったプリセットの ID */
  opponentFormation: string;
  /** 表示用のラベル。フリーエディット後は「（編集済）」が付く */
  opponentLabel: string;
  /** 実際に評価に使った相手11人。フリーエディットの結果をそのまま盤面へ持っていく */
  opponentPlayers: Player[];
  scene: SceneId;
  awayLine: number;
  /** 提案に使った評価モデル。盤面でも同じ物差しで見られるように持っていく */
  valueModel: ValueModel;
}

const HOME_LINE = 0;
const AWAY_LINE = 8;

/** 一覧の既定の表示件数 */
const TOP_N = 10;

type ListMode = 'top' | 'family' | 'all';

const LIST_MODES: { id: ListMode; label: string }[] = [
  { id: 'top', label: `上位${TOP_N}` },
  { id: 'family', label: '基本形ごと' },
  { id: 'all', label: 'すべて' },
];

export default function RecommendPage({ squad, onOpenBoard }: Props) {
  const roster = useMemo(() => usablePlayers(squad), [squad]);

  const [homeStyle, setHomeStyle] = useState('possession');
  const [opponentStyle, setOpponentStyle] = useState('shortCounter');
  /** 相手の形は「数値（名前）」→「ポジションパターン」の2段で選ぶ */
  const [opponentName, setOpponentName] = useState('4-2-3-1');
  const [opponentFormation, setOpponentFormation] = useState(
    () => FORMATIONS.find((f) => f.family === '4-2-3-1')!.id,
  );
  const [scene, setScene] = useState<SceneId>('possession');
  /** 一覧でどちらの局面を見るか */
  const [phase, setPhase] = useState<'attack' | 'defense'>('attack');
  const [valueModel, setValueModel] = useState<ValueModel>('progress');

  const [result, setResult] = useState<PhasePlan | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 相手の11人。プリセットを起点に、フリーエディットで任意の座標へ動かせる。
   * 提案はこの実座標を密度解析にかけるので、極端な片攻めや3CFもそのまま扱える。
   */
  const [away, setAway] = useState<Player[]>(() => opponentLineup('4-2-3-1', AWAY_LINE));
  const [edited, setEdited] = useState(false);
  const [showZones, setShowZones] = useState(true);
  /** 一覧の表示件数。102形あるので既定では上位だけ出す */
  const [listMode, setListMode] = useState<ListMode>('top');

  // フォーメーションを選び直したら、その形へ戻す（編集内容は破棄）
  useEffect(() => {
    setAway(opponentLineup(opponentFormation, AWAY_LINE));
    setEdited(false);
  }, [opponentFormation]);

  const opponentBase = formationById(opponentFormation);
  const opponentLabel = `${opponentBase.familyLabel}（${opponentBase.typeLabel}）${
    edited ? ' ・編集済' : ''
  }`;

  const ctx: BoardContext = {
    homeStyle,
    opponentStyle,
    opponentFormation,
    opponentLabel,
    opponentPlayers: away,
    scene,
    awayLine: AWAY_LINE,
    valueModel,
  };

  const run = () => {
    setRunning(true);
    setError(null);
    // 計算は数百 ms かかるので、スピナーを描いてから次フレームで走らせる
    setTimeout(() => {
      try {
        setResult(
          recommendPhasePlan({
            squad: roster,
            homeStyle,
            opponentPlayers: away,
            opponentStyle,
            scene,
            homeLine: HOME_LINE,
            valueModel,
          }),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setResult(null);
      } finally {
        setRunning(false);
      }
    }, 30);
  };

  if (roster.length < 11) {
    return (
      <Notice tone="warn">
        起用できる選手が {roster.length} 名です。「選手登録」タブで 11 名以上の名前を入力してください。
      </Notice>
    );
  }

  const allRows = (phase === 'attack' ? result?.attackRows : result?.defenseRows) ?? [];
  // 左右反転しただけの形は同じ扱いにして、良い方だけ残す
  // （相手が左右対称だと同点で並ぶため。相手が偏っていればスコアが割れるので良い方が勝つ）
  const deduped = allRows.filter(
    (r, _i, arr) => arr.find((x) => x.symmetryKey === r.symmetryKey) === r,
  );
  // 一覧は既定で上位のみ。「基本形ごと」は各基本形のいちばん良いタイプだけを1行にまとめる
  const rows =
    listMode === 'all'
      ? deduped
      : listMode === 'family'
        ? deduped.filter((r, _i, arr) => arr.find((x) => x.family === r.family) === r)
        : deduped.slice(0, TOP_N);
  const L = labelsFor(result?.valueModel ?? valueModel);
  // 棒の目盛りは常にカタログ全体を基準にする（表示件数を変えても長さがぶれないように）
  const attackFloor = deduped.length ? Math.min(...deduped.map((r) => r.attack)) : 0;
  const defenseFloor = deduped.length ? Math.max(...deduped.map((r) => r.defense)) : 0;
  const attackSpan = deduped.length ? Math.max(...deduped.map((r) => r.attack - attackFloor)) : 1;
  const defenseSpan = deduped.length ? Math.max(...deduped.map((r) => defenseFloor - r.defense)) : 1;

  return (
    <div className="space-y-4">
      <Card
        title="条件"
        subtitle={`登録選手 ${roster.length} 名から、指定したチームスタイルの中で相手の布陣に最も噛み合う形を探します。`}
        actions={
          <Button tone="primary" size="md" onClick={run} disabled={running}>
            {running ? '計算中…' : '最適フォーメーションを提案'}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="自チームのチームスタイル"
            value={homeStyle}
            options={TEAM_STYLES.map((s) => ({ value: s.id, label: s.label }))}
            hint={styleById(homeStyle).phases.attack.desc}
            onChange={setHomeStyle}
          />
          <Select
            label="相手のフォーメーション"
            value={opponentName}
            options={FORMATION_FAMILIES.map((f) => ({ value: f.family, label: f.familyLabel }))}
            hint="まず数値を選びます"
            onChange={(name) => {
              setOpponentName(name);
              const first = FORMATIONS.find((f) => f.family === name);
              if (first) setOpponentFormation(first.id);
            }}
          />
          <Select
            label="相手のポジションパターン"
            value={opponentFormation}
            options={FORMATIONS.filter(
              (f, _i, arr) =>
                f.family === opponentName &&
                arr.find((x) => x.symmetryKey === f.symmetryKey) === f,
            ).map((f) => ({ value: f.id, label: f.typeLabel }))}
            hint="同じ数値でも中身で別の形になります"
            onChange={setOpponentFormation}
          />
          <Select
            label="相手のチームスタイル"
            value={opponentStyle}
            options={TEAM_STYLES.map((s) => ({ value: s.id, label: s.label }))}
            hint={styleById(opponentStyle).phases.defense.desc}
            onChange={setOpponentStyle}
          />
          <Select<SceneId>
            label="局面"
            value={scene}
            options={SCENES.map((s) => ({ value: s.id, label: s.label }))}
            onChange={setScene}
          />
          <Select<ValueModel>
            label="評価モデル（試験）"
            value={valueModel}
            options={VALUE_MODELS.map((m) => ({ value: m.id, label: m.label }))}
            hint={VALUE_MODELS.find((m) => m.id === valueModel)?.desc}
            onChange={setValueModel}
          />
        </div>
      </Card>

      <Card
        title={`相手の配置　${opponentLabel}`}
        subtitle="トークンはドラッグで自由に動かせます。エリアごとに置けるポジションが決まっていて、はみ出したら自動で是正されます。極端な片攻めや3CFのような変則配置もそのまま解析できます。"
        actions={
          <div className="flex gap-2">
            {edited && (
              <Button
                onClick={() => {
                  setAway(opponentLineup(opponentFormation, AWAY_LINE));
                  setEdited(false);
                }}
              >
                プリセットに戻す
              </Button>
            )}
            <Button tone={showZones ? 'primary' : undefined} onClick={() => setShowZones((v) => !v)}>
              {showZones ? 'エリアを隠す' : 'エリアを表示'}
            </Button>
          </div>
        }
      >
        <FreeEditPitch
          players={away}
          team="away"
          showZones={showZones}
          onChange={(next) => {
            setAway(next);
            setEdited(true);
          }}
        />
      </Card>

      {error && <Notice tone="error">{error}</Notice>}

      {result && (
        <>
          <DensityCard density={result.density} />

          <PhaseCard plan={result} />

          <BestCard
            rec={phase === 'attack' ? result.attack : result.defense}
            away={away}
            ctx={ctx}
            valueModel={result.valueModel}
            phase={phase}
            onOpenBoard={onOpenBoard}
          />

          <Card
            title="フォーメーション別の評価"
            subtitle={`基本形 ${FORMATION_FAMILIES.length} × 前線・二列目のポジション構成 = ${allRows.length} 通りから探しています（左右反転しただけの形はまとめて ${deduped.length} 種として表示）。上位候補は守備ラインの上下（±7m）も試しています（盤面評価 ${result.evaluations} 回 / ${result.elapsedMs}ms）。${L.attack}は大きいほど、${L.defense}は小さいほど良い（${L.note}）。棒は全体の最下位との差なので、長いほど良い選択です。並びは「空きの活用」と適性の減点まで含めた総合順です。`}
            actions={
              <div className="flex gap-1">
                <Button
                  tone={phase === 'attack' ? 'primary' : undefined}
                  onClick={() => setPhase('attack')}
                >
                  攻撃時
                </Button>
                <Button
                  tone={phase === 'defense' ? 'primary' : undefined}
                  onClick={() => setPhase('defense')}
                >
                  守備時
                </Button>
                <span className="mx-1 w-px bg-edge" />
                {LIST_MODES.map((m) => (
                  <Button
                    key={m.id}
                    tone={listMode === m.id ? 'primary' : undefined}
                    onClick={() => setListMode(m.id)}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[12px]">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">フォーメーション</th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      <span
                        className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: ATTACK_COLOR }}
                      />
                      {L.attack}
                    </th>
                    <th className="w-[20%] px-2 py-1.5"></th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      <span
                        className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: DEFENSE_COLOR }}
                      />
                      {L.defense}
                    </th>
                    <th className="w-[20%] px-2 py-1.5"></th>
                    <th className="px-2 py-1.5 text-right font-medium">バランス</th>
                    <th className="px-2 py-1.5 text-right font-medium">空きの活用</th>
                    <th className="px-2 py-1.5 text-right font-medium">平均適性</th>
                    <th className="px-2 py-1.5 text-right font-medium">総合</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const best = r.formationId === (phase === 'attack' ? result.attack : result.defense).formationId;
                    return (
                      <tr
                        key={r.formationId}
                        title={r.desc}
                        className={`border-t border-edge/60 ${best ? 'bg-sky-500/10' : ''}`}
                      >
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <span className="font-mono font-semibold text-slate-200">
                            {r.familyLabel}
                          </span>
                          <span className="ml-1.5 rounded bg-edge px-1.5 py-0.5 text-[10px] text-slate-300">
                            {r.typeLabel}
                          </span>
                          {r.lineShift !== 0 && (
                            <span
                              className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200"
                              title="守備ラインの上下。GK を除く10人を前後させています"
                            >
                              ライン{r.lineShift > 0 ? '+' : ''}
                              {r.lineShift}m
                            </span>
                          )}
                          {best && (
                            <span className="ml-1.5 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-200">
                              推奨
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-slate-300">
                          <span className="mr-1.5 text-[10px] text-slate-600">{r.attackRank}位</span>
                          {fmt(r.attack)}
                        </td>
                        <td className="px-2 py-1.5">
                          <Bar amount={r.attack - attackFloor} max={attackSpan} color={ATTACK_COLOR} />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-slate-300">
                          <span className="mr-1.5 text-[10px] text-slate-600">{r.defenseRank}位</span>
                          {fmt(r.defense)}
                        </td>
                        <td className="px-2 py-1.5">
                          <Bar
                            amount={defenseFloor - r.defense}
                            max={defenseSpan}
                            color={DEFENSE_COLOR}
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-slate-300">
                          {fmt(r.balance)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-slate-400">
                          {(r.spaceScore * 100).toFixed(0)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-slate-500">
                          {r.fitAverage.toFixed(0)}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-1.5 text-right font-mono font-semibold tabular-nums text-slate-200"
                          title="バランス + 空きの活用 × 3 − 適性の減点。この列の降順で並んでいます。"
                        >
                          {fmt(r.score)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Button onClick={() => onOpenBoard(r, ctx)}>盤面で見る</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 相手配置の密度解析。
 * 11ゾーンの人数を自チーム基準で並べ、密集（赤）と空き（青）を色で出す。
 * ゾーンの並びは画面のピッチと同じ向き（左が自陣、上が自チームから見た左サイド）。
 */
function DensityCard({ density }: { density: DensityReport }) {
  const cell = (id: string) => density.byZone[id as keyof typeof density.byZone];
  /*
   * 画面のピッチと同じ向きに並べる。左が自陣、右が相手ゴール、上が自チームから見た左サイド。
   * X の境界は 0 / 34 / 51 / 68 / 86 / 105 の 5 列。サイドは中盤段と前線段が
   * 中央より広いので、その分だけ列をまたがせて幅を合わせる。
   */
  const grid: { label: string; cells: { id: string; span: number }[] }[] = [
    {
      label: '左',
      cells: [
        { id: 'L_DEF', span: 1 },
        { id: 'L_MID', span: 2 },
        { id: 'L_ATT', span: 2 },
      ],
    },
    {
      label: '中央',
      cells: [
        { id: 'C1', span: 1 },
        { id: 'C2', span: 1 },
        { id: 'C3', span: 1 },
        { id: 'C4', span: 1 },
        { id: 'C5', span: 1 },
      ],
    },
    {
      label: '右',
      cells: [
        { id: 'R_DEF', span: 1 },
        { id: 'R_MID', span: 2 },
        { id: 'R_ATT', span: 2 },
      ],
    },
  ];

  const tone = (count: number) => {
    if (count === 0) return { bg: 'rgba(2,132,199,0.28)', fg: '#bae6fd' };
    if (count === 1) return { bg: 'rgba(2,132,199,0.12)', fg: '#cbd5e1' };
    if (count === 2) return { bg: 'rgba(148,163,184,0.14)', fg: '#cbd5e1' };
    return { bg: 'rgba(225,29,72,0.28)', fg: '#fecdd3' };
  };

  return (
    <Card
      title="相手配置の密度解析"
      subtitle="相手の11人を11ゾーンに落として人数を数えています。青いほど空いていて、自分が突けるところです。左が自陣、右が相手ゴール。"
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-10 text-[10px] uppercase tracking-wider text-slate-600">
            <span>← 自陣</span>
            <span>相手ゴール →</span>
          </div>
          {grid.map((row) => (
            <div key={row.label} className="flex items-stretch gap-1.5">
              <div className="flex w-9 shrink-0 items-center text-[11px] text-slate-500">
                {row.label}
              </div>
              <div className="grid flex-1 grid-cols-5 gap-1.5">
                {row.cells.map(({ id, span }) => {
                  const d = cell(id);
                  const t = tone(d.count);
                  return (
                    <div
                      key={id}
                      className={`rounded-md border border-edge px-2 py-1.5 ${
                        span === 2 ? 'col-span-2' : ''
                      }`}
                      style={{ background: t.bg }}
                      title={d.zone.label}
                    >
                      <div
                        className="font-mono text-[15px] font-bold tabular-nums"
                        style={{ color: t.fg }}
                      >
                        {d.count}
                      </div>
                      <div className="truncate text-[10px] text-slate-400">
                        {d.zone.allowed.join('/')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <ul className="space-y-1 text-[12px] leading-relaxed text-slate-300">
          {density.summary.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="text-slate-600">・</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="左右の偏り"
            value={
              Math.abs(density.lateralBias) < 0.06
                ? '均等'
                : `${density.lateralBias > 0 ? '左' : '右'}へ ${Math.abs(density.lateralBias * 100).toFixed(0)}%`
            }
            color="#94a3b8"
            note={`右${density.rightCount} / 中${density.centerCount} / 左${density.leftCount}`}
          />
          <Stat
            label="前掛かり度"
            value={`${(density.advance * 100).toFixed(0)}%`}
            color={ATTACK_COLOR}
            note={density.advance > 0.5 ? '前重心。背後が空く' : '自陣寄り。前は窮屈'}
          />
          <Stat
            label="最も密集"
            value={density.crowded[0]?.count.toString() ?? '0'}
            color={DEFENSE_COLOR}
            note={density.crowded[0]?.zone.label ?? '—'}
          />
        </div>
      </div>
    </Card>
  );
}

/** 攻撃時 / 守備時の2形と、11人がどこへ動くかを並べて出す */
function PhaseCard({ plan }: { plan: PhasePlan }) {
  const moved = plan.moves.filter((m) => m.attack.position !== m.defense.position);
  return (
    <Card
      title="攻撃時 / 守備時フォーメーション"
      subtitle={`同じ11人のまま形だけを切り替えます（${plan.evaluations} 回評価 / ${plan.elapsedMs}ms）。eFootball のエディットで そのまま設定できる形です。`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          { key: 'attack', label: '攻撃時', rec: plan.attack, color: ATTACK_COLOR },
          { key: 'defense', label: '守備時', rec: plan.defense, color: DEFENSE_COLOR },
        ] as const).map((p) => (
          <div key={p.key} className="rounded-md border border-edge bg-panel/50 p-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
              <span className="text-[10px] uppercase tracking-wider text-slate-500">{p.label}</span>
            </div>
            <div className="mt-1 font-mono text-[20px] font-bold text-slate-100">
              {p.rec.familyLabel}
            </div>
            <div className="text-[12px] text-slate-300">{p.rec.typeLabel}</div>
            {p.rec.lineShift !== 0 && (
              <div className="mt-1 text-[11px] text-amber-200">
                守備ライン {p.rec.lineShift > 0 ? '+' : ''}
                {p.rec.lineShift}m
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-slate-300">
        {moved.length === 0
          ? '攻守で配置を変えない形が最良でした。同じ形のまま戦えます。'
          : `攻守の切り替えで ${moved.length} 人がポジションを変えます。`}
      </p>
      {moved.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">選手</th>
                <th className="px-2 py-1.5 text-left font-medium">本職</th>
                <th className="px-2 py-1.5 text-left font-medium">攻撃時</th>
                <th className="px-2 py-1.5 text-left font-medium">守備時</th>
                <th className="px-2 py-1.5 text-right font-medium">下がる距離</th>
              </tr>
            </thead>
            <tbody>
              {moved.map((m) => (
                <tr key={m.player.id} className="border-t border-edge/60">
                  <td className="px-2 py-1.5 text-slate-200">{m.player.name}</td>
                  <td className="px-2 py-1.5 font-mono text-slate-500">{m.player.position}</td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-sky-200">
                    {m.attack.position}
                  </td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-rose-200">
                    {m.defense.position}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-400">
                    {m.dropBack > 0 ? '↓' : '↑'}
                    {Math.abs(m.dropBack).toFixed(0)}m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function BestCard({
  rec,
  away,
  ctx,
  valueModel,
  phase,
  onOpenBoard,
}: {
  rec: FormationRecommendation;
  away: ReturnType<typeof opponentLineup>;
  ctx: BoardContext;
  valueModel: ValueModel;
  phase: 'attack' | 'defense';
  onOpenBoard: (rec: FormationRecommendation, ctx: BoardContext) => void;
}) {
  const labels = labelsFor(valueModel);
  return (
    <Card
      title={`${phase === 'attack' ? '攻撃時' : '守備時'}の詳細　${rec.familyLabel}（${rec.typeLabel}）${
        rec.lineShift === 0 ? '' : `　ライン${rec.lineShift > 0 ? '+' : ''}${rec.lineShift}m`
      }`}
      subtitle={rec.desc}
      actions={<Button tone="primary" onClick={() => onOpenBoard(rec, ctx)}>盤面で見る</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <LineupPitch
            home={rec.lineup}
            away={away}
            homeLabel={`自チーム ${rec.label}`}
            awayLabel={`相手 ${ctx.opponentLabel}`}
          />
          <div className="grid grid-cols-3 gap-2">
            <Stat label={labels.attack} value={fmt(rec.attack)} color={ATTACK_COLOR} note={`${rec.attackRank}位 / ${FORMATIONS.length}`} />
            <Stat label={labels.defense} value={fmt(rec.defense)} color={DEFENSE_COLOR} note={`${rec.defenseRank}位 / ${FORMATIONS.length}`} />
            <Stat label="バランス" value={fmt(rec.balance)} color="#94a3b8" note={`${rec.balanceRank}位 / ${FORMATIONS.length}`} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">#</th>
                  <th className="px-2 py-1.5 text-left font-medium">起用</th>
                  <th className="px-2 py-1.5 text-left font-medium">選手</th>
                  <th className="px-2 py-1.5 text-left font-medium">本職</th>
                  <th className="px-2 py-1.5 text-left font-medium">攻撃時のスタイル</th>
                </tr>
              </thead>
              <tbody>
                {rec.assignments.map((a) => {
                  const fl = fitLabel(a.positionFit);
                  return (
                    <tr key={a.slot.number} className="border-t border-edge/60">
                      <td className="px-2 py-1.5 font-mono text-slate-500">{a.slot.number}</td>
                      <td className="px-2 py-1.5 font-mono font-semibold text-slate-200">
                        {a.slot.position}
                      </td>
                      <td className="px-2 py-1.5 text-slate-200">{a.player.name}</td>
                      <td className="px-2 py-1.5">
                        <span className="font-mono text-slate-400">{a.player.position}</span>
                        <span
                          className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] ${
                            fl.tone === 'good'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : fl.tone === 'ok'
                                ? 'bg-edge text-slate-300'
                                : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {fl.label}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-400">
                        {skillById(a.player.attackSkill).label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rec.bench.length > 0 && (
            <p className="text-[11px] leading-relaxed text-slate-500">
              控え（{rec.bench.length}名）：
              {rec.bench.map((b) => `${b.name}(${b.position})`).join('、')}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  color,
  note,
}: {
  label: string;
  value: string;
  color: string;
  note: string;
}) {
  return (
    <div className="rounded-md border border-edge bg-panel/50 p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="mt-1 font-mono text-[16px] font-bold tabular-nums text-slate-100">{value}</div>
      <div className="text-[10px] text-slate-500">{note}</div>
    </div>
  );
}
