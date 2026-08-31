import { POSITION_GROUP } from '../constants';
import { FORMATIONS } from '../data/formations';
import { isSkillValidFor, skillById, skillOptions } from '../data/skills';
import { SCENES, STYLE_PHASE_LABEL, TEAM_STYLES, styleById, stylePhaseKey } from '../data/styles';
import type {
  HolderMode,
  Params,
  PcMode,
  Player,
  PositionId,
  SceneId,
  TeamId,
  ViewOptions,
} from '../types';
import { POSITION_ORDER } from '../types';
import PassWeightCurve from './PassWeightCurve';
import { Button, Section, Select, Slider, Toggle } from './ui';

interface Props {
  params: Params;
  view: ViewOptions;
  selected: Player | null;
  homeFormation: string;
  awayFormation: string;
  homeLine: number;
  awayLine: number;
  onParams: (patch: Partial<Params>) => void;
  onView: (patch: Partial<ViewOptions>) => void;
  onPlayer: (playerId: string, patch: Partial<Player>) => void;
  onPos: (playerId: string, x: number, y: number) => void;
  onFormation: (team: TeamId, formationId: string, line: number) => void;
  onResetSkills: (team: TeamId) => void;
  onSnapBall: () => void;
  /** ボールが保持側の近くに無い（局面として不自然）かどうか */
  ballMismatch: boolean;
  /** 盤面上の各選手のパス距離（曲線プレビュー用） */
  passDistances: { number: number; d: number }[];
  /** 起点平均に使われている起点の数 */
  holderCount: number;
  onReset: () => void;
  onExport: () => void;
  onImport: () => void;
}

const TEAM_LABEL: Record<TeamId, string> = { home: '自チーム', away: '相手チーム' };
const TEAM_COLOR: Record<TeamId, string> = { home: '#0ea5e9', away: '#f43f5e' };

function TeamDot({ team }: { team: TeamId }) {
  return (
    <span
      className="mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: TEAM_COLOR[team] }}
    />
  );
}

/** そのチームに今どの列が適用されているかを示す小さなバッジ */
function PhaseBadge({ params, team }: { params: Params; team: TeamId }) {
  const key = stylePhaseKey(params.scene, team, params.possessionTeam);
  const attacking = team === params.possessionTeam;
  return (
    <span
      className={`ml-1.5 rounded px-1.5 py-0.5 align-middle text-[10px] ${
        attacking ? 'bg-emerald-500/20 text-emerald-300' : 'bg-edge text-slate-300'
      }`}
    >
      {STYLE_PHASE_LABEL[key]}
    </span>
  );
}

function TeamStyleBlock({
  team,
  params,
  onParams,
}: {
  team: TeamId;
  params: Params;
  onParams: (patch: Partial<Params>) => void;
}) {
  const styleId = team === 'home' ? params.homeStyle : params.awayStyle;
  const intensity = team === 'home' ? params.homeStyleIntensity : params.awayStyleIntensity;
  const style = styleById(styleId);
  const key = stylePhaseKey(params.scene, team, params.possessionTeam);

  return (
    <div className="rounded-md border border-edge/70 bg-panel/50 p-2.5">
      <div className="mb-1.5 flex items-center text-[12px] font-medium">
        <TeamDot team={team} />
        {TEAM_LABEL[team]}
        <PhaseBadge params={params} team={team} />
      </div>
      <select
        className="w-full"
        value={styleId}
        onChange={(e) =>
          onParams(team === 'home' ? { homeStyle: e.target.value } : { awayStyle: e.target.value })
        }
      >
        {TEAM_STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{style.phases[key].desc}</p>
      <div className="mt-2">
        <Slider
          label="強度"
          value={intensity}
          min={0}
          max={2}
          step={0.05}
          onChange={(v) =>
            onParams(team === 'home' ? { homeStyleIntensity: v } : { awayStyleIntensity: v })
          }
        />
      </div>
    </div>
  );
}

function FormationBlock({
  team,
  formationId,
  line,
  onFormation,
  onResetSkills,
}: {
  team: TeamId;
  formationId: string;
  line: number;
  onFormation: (team: TeamId, formationId: string, line: number) => void;
  onResetSkills: (team: TeamId) => void;
}) {
  return (
    <div className="rounded-md border border-edge/70 bg-panel/50 p-2.5">
      <div className="mb-1.5 flex items-center text-[12px] font-medium">
        <TeamDot team={team} />
        {TEAM_LABEL[team]}
      </div>
      <select
        className="w-full"
        value={formationId}
        onChange={(e) => onFormation(team, e.target.value, line)}
      >
        {FORMATIONS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <div className="mt-2">
        <Slider
          label="ライン高さ"
          value={line}
          min={-15}
          max={35}
          step={1}
          unit=" m"
          onChange={(v) => onFormation(team, formationId, v)}
        />
      </div>
      <div className="mt-2 flex justify-end">
        <Button onClick={() => onResetSkills(team)}>特性をポジション既定に戻す</Button>
      </div>
    </div>
  );
}

export default function ControlPanel({
  params,
  view,
  selected,
  homeFormation,
  awayFormation,
  homeLine,
  awayLine,
  onParams,
  onView,
  onPlayer,
  onPos,
  onFormation,
  onResetSkills,
  onSnapBall,
  ballMismatch,
  passDistances,
  holderCount,
  onReset,
  onExport,
  onImport,
}: Props) {
  const scene = SCENES.find((s) => s.id === params.scene) ?? SCENES[0];
  const defending: TeamId = params.possessionTeam === 'home' ? 'away' : 'home';

  return (
    <div className="space-y-3">
      <Section title="局面">
        <div>
          <span className="mb-1 block text-[13px] text-slate-200">ボール保持（攻撃／守備）</span>
          <div className="grid grid-cols-2 gap-1.5">
            {(['home', 'away'] as TeamId[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onParams({ possessionTeam: t })}
                className={`flex items-center justify-center rounded-md border px-2 py-1.5 text-[12px] transition-colors ${
                  params.possessionTeam === t
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                    : 'border-edge bg-panel2 text-slate-400 hover:bg-[#243040]'
                }`}
              >
                <TeamDot team={t} />
                {t === 'home' ? '自チームが攻撃' : '自チームが守備'}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            保持側は<b className="text-slate-300">攻撃時特性</b>、非保持側は
            <b className="text-slate-300">守備時特性</b>が発動します。期待前進値は
            {TEAM_LABEL[params.possessionTeam]}（保持側）の攻撃方向で算出されます。
            {params.possessionTeam === 'away' &&
              '「自チームが守備」ではスコアは “相手にどれだけ前進を許すか” を表します。'}
          </p>
        </div>

        {ballMismatch && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
            <p className="text-[11px] leading-snug text-amber-200">
              ボールが{TEAM_LABEL[params.possessionTeam]}の選手から離れています。
              このままだと ΔX がほぼ全員マイナスになり、局面として不自然です。
            </p>
            <div className="mt-1.5 flex justify-end">
              <Button tone="primary" onClick={onSnapBall}>
                ボールを保持側の最寄り選手へ
              </Button>
            </div>
          </div>
        )}

        <Select<SceneId>
          label="シーン"
          value={params.scene}
          options={SCENES.map((s) => ({ value: s.id, label: s.label }))}
          onChange={(v) => onParams({ scene: v })}
        />
        <p className="text-[11px] leading-snug text-slate-500">{scene.desc}</p>
      </Section>

      <Section title="評価の起点">
        <Select<HolderMode>
          label="スコアの取り方"
          value={params.holderMode}
          options={[
            { value: 'averageOutfield', label: `GK以外 ${holderCount} 人の起点の平均` },
            { value: 'current', label: '現在のボール位置だけ' },
          ]}
          onChange={(v) => onParams({ holderMode: v })}
        />
        {params.holderMode === 'averageOutfield' ? (
          <p className="text-[11px] leading-snug text-slate-500">
            保持側の GK 以外の各選手を順にボールホルダーに置いて期待前進値を計算し、その平均を取ります。
            ボールをどこに置いたかに左右されない「配置そのものの前進しやすさ」になり、
            フォーメーション比較もボール位置に依存しなくなります。
            <b className="text-slate-300">ピッチの矢印・支配領域は現在のボール位置のまま</b>
            描かれます（起点ごとに変わるため）。
          </p>
        ) : (
          <p className="text-[11px] leading-snug text-slate-500">
            いま盤面に置いてあるボールの位置だけで評価します。
            特定の局面を作り込んで検証したいときはこちら。
          </p>
        )}
      </Section>

      <Section title="チームスタイル">
        <TeamStyleBlock team="home" params={params} onParams={onParams} />
        <TeamStyleBlock team="away" params={params} onParams={onParams} />
        <Slider
          label="選手特性の効き"
          value={params.skillIntensity}
          min={0}
          max={2}
          step={0.05}
          hint="個々の特性係数の倍率。0 にするとチームスタイルだけの影響を見られる。"
          onChange={(v) => onParams({ skillIntensity: v })}
        />
      </Section>

      <Section title="フォーメーション">
        <FormationBlock
          team="home"
          formationId={homeFormation}
          line={homeLine}
          onFormation={onFormation}
          onResetSkills={onResetSkills}
        />
        <FormationBlock
          team="away"
          formationId={awayFormation}
          line={awayLine}
          onFormation={onFormation}
          onResetSkills={onResetSkills}
        />
        <p className="text-[11px] leading-snug text-slate-500">
          変更しても攻撃時・守備時の特性は引き継がれます。差し替わるのは座標とポジション表記だけです。
        </p>
      </Section>

      <Section title="選択中の選手">
        {!selected ? (
          <p className="text-[12px] text-slate-500">
            ピッチ上の選手をクリックすると、ポジションと攻守の特性を編集できます。
          </p>
        ) : (
          <SelectedPlayerEditor
            selected={selected}
            attacking={selected.team === params.possessionTeam}
            onPlayer={onPlayer}
            onPos={onPos}
          />
        )}
      </Section>

      <Section title="Pitch Control">
        <Slider
          label="減衰率 λ"
          value={params.lambda}
          min={2}
          max={25}
          step={0.5}
          unit=" m"
          hint="影響力 w = exp(-d/λ)。小さいほど「その場にいる選手だけ」が効く。"
          onChange={(v) => onParams({ lambda: v })}
        />
        <Select<PcMode>
          label="算出方式"
          value={params.pcMode}
          options={[
            { value: 'team', label: 'チーム合算（味方の援護を含む）' },
            { value: 'individual', label: '個人 vs 守備側全員（受け切れるか）' },
          ]}
          onChange={(v) => onParams({ pcMode: v })}
        />
        <Toggle
          label={`守備側（${TEAM_LABEL[defending]}）も到達領域で評価`}
          checked={params.opponentUsesVector}
          hint="OFF にすると守備側は現在地のまま。プレスの前後で比較できる。"
          onChange={(v) => onParams({ opponentUsesVector: v })}
        />
        <Toggle
          label="ΔX のマイナスを切り捨て"
          checked={params.clipNegativeProgress}
          hint="下がる動きの負の寄与を 0 にする。前進のみを評価したいとき。"
          onChange={(v) => onParams({ clipNegativeProgress: v })}
        />
      </Section>

      <Section title="パス距離の重み">
        <Toggle
          label="距離の重み w を掛ける"
          checked={params.passWeightEnabled}
          hint="OFF にすると w = 1 になり、距離を問わない従来の式に戻る。ON/OFF で比較できる。"
          onChange={(v) => onParams({ passWeightEnabled: v })}
        />
        <p className="rounded border border-edge/70 bg-panel/50 p-2 font-mono text-[11px] leading-relaxed text-slate-400">
          w = exp( −(d − μ)² / 2σ² )
          <span className="mt-1 block font-sans text-[10px] text-slate-500">
            d はボール現在地から到達地点までの直線距離（＝パスの飛距離）。ΔX とは別の量。
          </span>
        </p>
        <Slider
          label="最適パス距離 μ"
          value={params.passMu}
          min={2}
          max={60}
          step={1}
          unit=" m"
          hint="この距離のパスに最大の重み 1.0 を与える。"
          onChange={(v) => onParams({ passMu: v })}
        />
        <Slider
          label="許容幅 σ"
          value={params.passSigma}
          min={1}
          max={40}
          step={0.5}
          unit=" m"
          hint="大きいほど距離にこだわらない。小さいほど μ 付近のパスだけを評価する。"
          onChange={(v) => onParams({ passSigma: v })}
        />
        <PassWeightCurve
          mu={params.passMu}
          sigma={params.passSigma}
          distances={passDistances}
          enabled={params.passWeightEnabled}
        />
      </Section>

      <Section title="表示">
        <Toggle label="支配領域ヒートマップ" checked={view.heatmap} onChange={(v) => onView({ heatmap: v })} />
        <Toggle label="ベクトル矢印" checked={view.arrows} onChange={(v) => onView({ arrows: v })} />
        <Toggle label="到達領域マーカー" checked={view.targets} onChange={(v) => onView({ targets: v })} />
        <Toggle label="寄与値ラベル" checked={view.contribution} onChange={(v) => onView({ contribution: v })} />
        <Toggle label="ポジション表記" checked={view.positions} onChange={(v) => onView({ positions: v })} />
        <Toggle label="PC 値ラベル" checked={view.pcLabels} onChange={(v) => onView({ pcLabels: v })} />
      </Section>

      <Section title="局面データ">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExport}>JSON書き出し</Button>
          <Button onClick={onImport}>JSON読み込み</Button>
          <Button onClick={onReset}>初期化</Button>
        </div>
        <p className="text-[11px] leading-snug text-slate-500">
          配置とパラメータはブラウザに自動保存されます。
        </p>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SelectedPlayerEditor({
  selected,
  attacking,
  onPlayer,
  onPos,
}: {
  selected: Player;
  attacking: boolean;
  onPlayer: (playerId: string, patch: Partial<Player>) => void;
  onPos: (playerId: string, x: number, y: number) => void;
}) {
  const activeId = attacking ? selected.attackSkill : selected.defenseSkill;

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white"
          style={{ background: TEAM_COLOR[selected.team] }}
        >
          {selected.number}
        </span>
        <span className="text-[12px] text-slate-400">
          {TEAM_LABEL[selected.team]} ／ {POSITION_GROUP[selected.position]}
        </span>
      </div>

      <Select<PositionId>
        label="ポジション"
        value={selected.position}
        options={POSITION_ORDER.map((p) => ({ value: p, label: p }))}
        onChange={(v) => onPlayer(selected.id, { position: v })}
      />

      <SkillField
        label="攻撃時の特性"
        active={attacking}
        position={selected.position}
        phase="attack"
        value={selected.attackSkill}
        onChange={(v) => onPlayer(selected.id, { attackSkill: v })}
      />
      <SkillField
        label="守備時の特性"
        active={!attacking}
        position={selected.position}
        phase="defense"
        value={selected.defenseSkill}
        onChange={(v) => onPlayer(selected.id, { defenseSkill: v })}
      />
      <p className="rounded border border-edge/70 bg-panel/50 p-2 text-[11px] leading-snug text-slate-400">
        {skillById(activeId).desc}
      </p>

      <div className="flex gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-[12px] text-slate-400">X</span>
          <input
            type="number"
            className="w-full"
            step={0.5}
            value={Number(selected.pos.x.toFixed(1))}
            onChange={(e) => onPos(selected.id, Number(e.target.value), selected.pos.y)}
          />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-[12px] text-slate-400">Y</span>
          <input
            type="number"
            className="w-full"
            step={0.5}
            value={Number(selected.pos.y.toFixed(1))}
            onChange={(e) => onPos(selected.id, selected.pos.x, Number(e.target.value))}
          />
        </label>
      </div>
    </>
  );
}

function SkillField({
  label,
  active,
  position,
  phase,
  value,
  onChange,
}: {
  label: string;
  active: boolean;
  position: PositionId;
  phase: 'attack' | 'defense';
  value: string;
  onChange: (v: string) => void;
}) {
  const options = skillOptions(position, phase, value);
  const outOfPosition = !isSkillValidFor(position, phase, value);

  return (
    <label className="block">
      <span className="mb-1 flex flex-wrap items-center gap-1.5 text-[13px] text-slate-200">
        {label}
        {active ? (
          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
            この局面で発動中
          </span>
        ) : (
          <span className="text-[10px] text-slate-600">（この局面では未発動）</span>
        )}
        {outOfPosition && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            {position} 本来の選択肢外
          </span>
        )}
      </span>
      <select
        className={`w-full ${active ? '' : 'opacity-60'}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
