import { useEffect, useMemo, useState } from 'react';
import { SQUAD_SIZE, blankSquad, loadSquad, saveSquad, usablePlayers } from '../api/squad';
import { DEFAULT_SKILLS, skillOptions } from '../data/skills';
import { Button, Card, Notice } from '../components/ui';
import type { PositionId, SquadPlayer, UserProfile } from '../types';
import { POSITION_ORDER } from '../types';

interface Props {
  profile: UserProfile;
  squad: SquadPlayer[];
  onSquadChange: (squad: SquadPlayer[]) => void;
}

export default function SquadPage({ profile, squad, onSquadChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadSquad(profile.id)
      .then((s) => {
        if (!cancelled) onSquadChange(s);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          onSquadChange(blankSquad());
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const filled = useMemo(() => usablePlayers(squad).length, [squad]);

  const patch = (index: number, next: Partial<SquadPlayer>) => {
    onSquadChange(
      squad.map((p, i) => {
        if (i !== index) return p;
        const merged = { ...p, ...next };
        // ポジションを変えたときは、そのポジションで選べない特性を既定に落とす
        if (next.position && next.position !== p.position) {
          const options = (phase: 'attack' | 'defense') =>
            skillOptions(merged.position, phase, phase === 'attack' ? merged.attackSkill : merged.defenseSkill);
          if (!options('attack').some((o) => !o.outOfPosition && o.id === merged.attackSkill)) {
            merged.attackSkill = DEFAULT_SKILLS[merged.position].attack;
          }
          if (!options('defense').some((o) => !o.outOfPosition && o.id === merged.defenseSkill)) {
            merged.defenseSkill = DEFAULT_SKILLS[merged.position].defense;
          }
        }
        return merged;
      }),
    );
    setSaved(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const stored = await saveSquad(profile.id, squad);
      onSquadChange(stored);
      setSaved(`${new Date().toLocaleTimeString('ja-JP')} に保存しました`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}

      <Card
        title="選手登録"
        subtitle={`${profile.userName} / ${SQUAD_SIZE}名まで登録できます。名前が入っている選手だけが起用対象になります。`}
        actions={
          <div className="flex items-center gap-3">
            <span className={`text-[12px] ${filled >= 11 ? 'text-slate-400' : 'text-amber-300'}`}>
              入力済み {filled} / {SQUAD_SIZE}
              {filled < 11 && '（提案には11名以上が必要）'}
            </span>
            <Button tone="primary" size="md" onClick={save} disabled={busy || loading}>
              {busy ? '保存中…' : '保存'}
            </Button>
          </div>
        }
      >
        {saved && <p className="mb-3 text-[11px] text-emerald-300">{saved}</p>}
        {loading ? (
          <p className="text-[12px] text-slate-500">読み込み中…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12px]">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">#</th>
                  <th className="px-2 py-1.5 text-left font-medium">選手名</th>
                  <th className="px-2 py-1.5 text-left font-medium">メインポジション</th>
                  <th className="px-2 py-1.5 text-left font-medium">プレースタイル（攻撃時）</th>
                  <th className="px-2 py-1.5 text-left font-medium">プレースタイル（守備時）</th>
                </tr>
              </thead>
              <tbody>
                {squad.map((p, i) => {
                  const attack = skillOptions(p.position, 'attack', p.attackSkill);
                  const defense = skillOptions(p.position, 'defense', p.defenseSkill);
                  const empty = p.name.trim().length === 0;
                  return (
                    <tr key={p.slotIndex} className={`border-t border-edge/60 ${empty ? 'opacity-60' : ''}`}>
                      <td className="px-2 py-1.5 font-mono text-slate-500">{i + 1}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          className="w-full rounded border border-edge bg-panel2 px-2 py-1 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500/60"
                          value={p.name}
                          placeholder="未登録"
                          onChange={(e) => patch(i, { name: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className="w-full"
                          value={p.position}
                          onChange={(e) => patch(i, { position: e.target.value as PositionId })}
                        >
                          {POSITION_ORDER.map((pos) => (
                            <option key={pos} value={pos}>
                              {pos}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className="w-full"
                          value={p.attackSkill}
                          onChange={(e) => patch(i, { attackSkill: e.target.value })}
                        >
                          {attack.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className="w-full"
                          value={p.defenseSkill}
                          onChange={(e) => patch(i, { defenseSkill: e.target.value })}
                        >
                          {defense.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
