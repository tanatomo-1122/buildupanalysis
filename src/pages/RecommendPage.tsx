import { useMemo, useState } from 'react';
import { usablePlayers } from '../api/squad';
import LineupPitch from '../components/LineupPitch';
import { Button, Card, Notice, Select } from '../components/ui';
import { FORMATIONS } from '../data/formations';
import { fitLabel } from '../data/positions';
import { skillById } from '../data/skills';
import { SCENES, TEAM_STYLES, styleById } from '../data/styles';
import { RANK_MODES, opponentLineup, recommendFormations } from '../logic/recommend';
import type { FormationRecommendation, RankMode, RecommendResult } from '../logic/recommend';
import type { SceneId, SquadPlayer } from '../types';

const ATTACK_COLOR = '#0284c7';
const DEFENSE_COLOR = '#e11d48';

const fmt = (n: number, d = 1) => (n >= 0 ? '+' : '') + n.toFixed(d);

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
  opponentFormation: string;
  scene: SceneId;
  awayLine: number;
}

const HOME_LINE = 0;
const AWAY_LINE = 8;

export default function RecommendPage({ squad, onOpenBoard }: Props) {
  const roster = useMemo(() => usablePlayers(squad), [squad]);

  const [homeStyle, setHomeStyle] = useState('possession');
  const [opponentStyle, setOpponentStyle] = useState('shortCounter');
  const [opponentFormation, setOpponentFormation] = useState('4-2-3-1');
  const [scene, setScene] = useState<SceneId>('possession');
  const [rankMode, setRankMode] = useState<RankMode>('balance');

  const [result, setResult] = useState<RecommendResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx: BoardContext = { homeStyle, opponentStyle, opponentFormation, scene, awayLine: AWAY_LINE };

  const run = () => {
    setRunning(true);
    setError(null);
    // 計算は数百 ms かかるので、スピナーを描いてから次フレームで走らせる
    setTimeout(() => {
      try {
        setResult(
          recommendFormations({
            squad: roster,
            homeStyle,
            opponentFormation,
            opponentStyle,
            scene,
            homeLine: HOME_LINE,
            awayLine: AWAY_LINE,
            rankMode,
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

  const away = useMemo(
    () => opponentLineup(opponentFormation, AWAY_LINE),
    [opponentFormation],
  );

  if (roster.length < 11) {
    return (
      <Notice tone="warn">
        起用できる選手が {roster.length} 名です。「選手登録」タブで 11 名以上の名前を入力してください。
      </Notice>
    );
  }

  const rows = result?.rows ?? [];
  const attackFloor = rows.length ? Math.min(...rows.map((r) => r.attack)) : 0;
  const defenseFloor = rows.length ? Math.max(...rows.map((r) => r.defense)) : 0;
  const attackSpan = rows.length ? Math.max(...rows.map((r) => r.attack - attackFloor)) : 1;
  const defenseSpan = rows.length ? Math.max(...rows.map((r) => defenseFloor - r.defense)) : 1;

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
            value={opponentFormation}
            options={FORMATIONS.map((f) => ({ value: f.id, label: f.label }))}
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
          <Select<RankMode>
            label="何を基準に選ぶか"
            value={rankMode}
            options={RANK_MODES.map((m) => ({ value: m.id, label: m.label }))}
            hint={RANK_MODES.find((m) => m.id === rankMode)?.desc}
            onChange={setRankMode}
          />
        </div>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}

      {result && (
        <>
          <BestCard rec={result.best} away={away} ctx={ctx} onOpenBoard={onOpenBoard} />

          <Card
            title="フォーメーション別の評価"
            subtitle={`17形すべてで最適な11人を組んでから比較しています（盤面評価 ${result.evaluations} 回 / ${result.elapsedMs}ms）。自チームの前進は大きいほど、相手に許す前進は小さいほど良い。棒は最下位との差なので、長いほど良い選択です。`}
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
                      自チームの前進
                    </th>
                    <th className="w-[20%] px-2 py-1.5"></th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      <span
                        className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: DEFENSE_COLOR }}
                      />
                      相手に許す前進
                    </th>
                    <th className="w-[20%] px-2 py-1.5"></th>
                    <th className="px-2 py-1.5 text-right font-medium">バランス</th>
                    <th className="px-2 py-1.5 text-right font-medium">平均適性</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const best = r.formationId === result.best.formationId;
                    return (
                      <tr
                        key={r.formationId}
                        title={r.desc}
                        className={`border-t border-edge/60 ${best ? 'bg-sky-500/10' : ''}`}
                      >
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <span className="font-mono font-semibold text-slate-200">{r.label}</span>
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
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-slate-500">
                          {r.fitAverage.toFixed(0)}
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

function BestCard({
  rec,
  away,
  ctx,
  onOpenBoard,
}: {
  rec: FormationRecommendation;
  away: ReturnType<typeof opponentLineup>;
  ctx: BoardContext;
  onOpenBoard: (rec: FormationRecommendation, ctx: BoardContext) => void;
}) {
  return (
    <Card
      title={`推奨フォーメーション　${rec.label}`}
      subtitle={rec.desc}
      actions={<Button tone="primary" onClick={() => onOpenBoard(rec, ctx)}>盤面で見る</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <LineupPitch
            home={rec.lineup}
            away={away}
            homeLabel={`自チーム ${rec.label}`}
            awayLabel={`相手 ${ctx.opponentFormation}`}
          />
          <div className="grid grid-cols-3 gap-2">
            <Stat label="自チームの前進" value={fmt(rec.attack)} color={ATTACK_COLOR} note={`${rec.attackRank}位 / 17`} />
            <Stat label="相手に許す前進" value={fmt(rec.defense)} color={DEFENSE_COLOR} note={`${rec.defenseRank}位 / 17`} />
            <Stat label="バランス" value={fmt(rec.balance)} color="#94a3b8" note={`${rec.balanceRank}位 / 17`} />
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
