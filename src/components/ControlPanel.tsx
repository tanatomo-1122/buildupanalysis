import { POSITION_GROUP } from '../constants';
import { FORMATIONS } from '../data/formations';
import { isSkillValidFor, skillById, skillOptions } from '../data/skills';
import { SCENES, STYLE_PHASE_LABEL, TEAM_STYLES, styleById, stylePhaseKey } from '../data/styles';
import type { Params, Player, PositionId, SceneId, TeamId, ViewOptions } from '../types';
import { POSITION_ORDER } from '../types';
import { Button, Section, Select, Slider, Toggle } from './ui';

/**
 * 戦術ボードの操作パネル。
 *
 * モデルの定数（λ・μ・σ・弾道の閾値など）はコード側で固定してあり、ここには出さない。
 * 触れるのは「戦術上の選択」だけ：ボール保持、局面、チームスタイル、フォーメーション、
 * 個々の選手の配置と特性、そして表示のオン／オフ。
 */

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
  onReset: () => void;
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
  const style = styleById(styleId);
  const key = stylePhaseKey(params.scene, team, params.possessionTeam);
  const attacking = team === params.possessionTeam;

  return (
    <div className="rounded-md border border-edge/70 bg-panel/50 p-2.5">
      <div className="mb-1.5 flex items-center text-[12px] font-medium">
        <TeamDot team={team} />
        {TEAM_LABEL[team]}
        <span
          className={`ml-1.5 rounded px-1.5 py-0.5 align-middle text-[10px] ${
            attacking ? 'bg-emerald-500/20 text-emerald-300' : 'bg-edge text-slate-300'
          }`}
        >
          {STYLE_PHASE_LABEL[key]}
        </span>
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
    </div>
  );
}

function FormationBlock({
  team,
  formationId,
  line,
  onFormation,
}: {
  team: TeamId;
  formationId: string;
  line: number;
  onFormation: (team: TeamId, formationId: string, line: number) => void;
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
  onReset,
}: Props) {
  const scene = SCENES.find((s) => s.id === params.scene) ?? SCENES[0];

  return (
    <div className="space-y-3">
      <Section title="局面">
        <div>
          <span className="mb-1 block text-[13px] text-slate-200">ボール保持</span>
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
            保持側は攻撃時のプレースタイル、非保持側は守備時のプレースタイルが発動します。
          </p>
        </div>

        <Select<SceneId>
          label="シーン"
          value={params.scene}
          options={SCENES.map((s) => ({ value: s.id, label: s.label }))}
          hint={scene.desc}
          onChange={(v) => onParams({ scene: v })}
        />
      </Section>

      <Section title="チームスタイル">
        <TeamStyleBlock team="home" params={params} onParams={onParams} />
        <TeamStyleBlock team="away" params={params} onParams={onParams} />
      </Section>

      <Section title="フォーメーション">
        <FormationBlock
          team="home"
          formationId={homeFormation}
          line={homeLine}
          onFormation={onFormation}
        />
        <FormationBlock
          team="away"
          formationId={awayFormation}
          line={awayLine}
          onFormation={onFormation}
        />
        <p className="text-[11px] leading-snug text-slate-500">
          変更しても各選手のプレースタイルは引き継がれます。差し替わるのは座標とポジション表記だけです。
        </p>
      </Section>

      <Section title="選択中の選手">
        {!selected ? (
          <p className="text-[12px] text-slate-500">
            ピッチ上の選手をクリックすると、ポジションとプレースタイルを編集できます。
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

      <Section title="表示">
        <Toggle label="支配領域ヒートマップ" checked={view.heatmap} onChange={(v) => onView({ heatmap: v })} />
        <Toggle label="ベクトル矢印" checked={view.arrows} onChange={(v) => onView({ arrows: v })} />
        <Toggle
          label="パスコースとボトルネック"
          checked={view.lanes}
          onChange={(v) => onView({ lanes: v })}
        />
        <Toggle label="到達領域マーカー" checked={view.targets} onChange={(v) => onView({ targets: v })} />
        <Toggle label="寄与値ラベル" checked={view.contribution} onChange={(v) => onView({ contribution: v })} />
        <Toggle label="ポジション表記" checked={view.positions} onChange={(v) => onView({ positions: v })} />
        <Toggle label="PC 値ラベル" checked={view.pcLabels} onChange={(v) => onView({ pcLabels: v })} />
      </Section>

      <div className="flex justify-end">
        <Button onClick={onReset}>盤面を初期化</Button>
      </div>
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
        <span className="text-[12px] text-slate-300">
          {selected.name || TEAM_LABEL[selected.team]}
          <span className="ml-1.5 text-slate-500">{POSITION_GROUP[selected.position]}</span>
        </span>
      </div>

      <Select<PositionId>
        label="ポジション"
        value={selected.position}
        options={POSITION_ORDER.map((p) => ({ value: p, label: p }))}
        onChange={(v) => onPlayer(selected.id, { position: v })}
      />

      <SkillField
        label="攻撃時のプレースタイル"
        active={attacking}
        position={selected.position}
        phase="attack"
        value={selected.attackSkill}
        onChange={(v) => onPlayer(selected.id, { attackSkill: v })}
      />
      <SkillField
        label="守備時のプレースタイル"
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
            発動中
          </span>
        ) : (
          <span className="text-[10px] text-slate-600">（未発動）</span>
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
