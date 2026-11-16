import { useState } from 'react';
import type { Tactic } from '../api/tactics';
import { shareUrl, updateTactic } from '../api/tactics';
import { styleById } from '../data/styles';
import { exportShareCard } from '../logic/shareCard';
import LineupPitch from './LineupPitch';
import { Button, Notice } from './ui';

/**
 * 保存した戦術1件の表示。マイ戦術の詳細と、共有リンクの閲覧画面で共通に使う。
 */
export function TacticView({ tactic, footer }: { tactic: Tactic; footer?: React.ReactNode }) {
  const [phase, setPhase] = useState<'attack' | 'defense'>('attack');
  const p = tactic.payload;
  const f = phase === 'attack' ? p.attack : p.defense;
  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[12px] text-slate-500">
            {tactic.authorName || 'MY CLUB'} の戦術 ・ {new Date(tactic.createdAt).toLocaleDateString('ja-JP')}
          </div>
          <h2 className="mt-1 text-[22px] font-black leading-tight text-slate-50 [text-wrap:balance]">
            {tactic.title}
          </h2>
          <div className="mt-1 text-[12px] text-slate-400">
            {styleById(p.homeStyle).label} ／ 相手 {p.opponent.label}（{styleById(p.opponentStyle).label}）
          </div>
        </div>
        <div className="flex items-end gap-6">
          <Big label="攻撃時" value={p.attack.familyLabel} outline />
          <Big label="守備時" value={p.defense.familyLabel} />
        </div>
      </header>

      <div className="flex gap-1" role="tablist" aria-label="局面">
        {(['attack', 'defense'] as const).map((k) => (
          <Button key={k} tone={phase === k ? 'primary' : undefined} onClick={() => setPhase(k)}>
            {k === 'attack' ? '攻撃時' : '守備時'}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <LineupPitch
          home={f.lineup}
          away={p.opponent.players}
          homeLabel={`${phase === 'attack' ? '攻撃時' : '守備時'} ${f.familyLabel}（${f.typeLabel}）`}
          awayLabel={`相手 ${p.opponent.label}`}
        />
        <div className="min-w-0 space-y-3">
          <ul className="divide-y divide-edge overflow-hidden rounded-xl border border-edge bg-panel">
            {f.assignments.map((a) => (
              <li key={a.number} className="grid grid-cols-[3.2em_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 text-[13px]">
                <span className="font-mono font-bold text-team">{a.slot}</span>
                <span className="truncate text-slate-100">{a.name}</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {a.main}
                  {a.aptitude === 'sub' ? '・適性' : a.aptitude === 'off' ? '・兼任' : ''}
                </span>
              </li>
            ))}
          </ul>
          {p.moves.length > 0 && (
            <p className="text-[12px] leading-relaxed text-slate-400">
              攻守の切り替えで動く選手：
              {p.moves.map((m) => `${m.name}（${m.attack}→${m.defense}）`).join('、')}
            </p>
          )}
        </div>
      </div>
      {footer}
    </article>
  );
}

function Big({ label, value, outline }: { label: string; value: string; outline?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-bold tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`${outline ? 'numeral' : 'numeral-solid text-slate-100'} text-[56px]`}>{value}</div>
    </div>
  );
}

/**
 * 共有の操作。公開にするとリンクを知っている人が見られるようになる。
 * 画像は誰に送っても見られる（公開設定とは関係ない）。
 */
export function SharePanel({ tactic, onChange }: { tactic: Tactic; onChange: (t: Tactic) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = shareUrl(tactic.shareId);
  const text = `${tactic.title}｜攻撃時 ${tactic.attackLabel} / 守備時 ${tactic.defenseLabel}（対 ${tactic.opponentLabel.split('（')[0]}） #eFootball #MYXI`;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** 公開にしてから link を使う。非公開のまま送るとリンク先で見られないため */
  const ensurePublic = async () => {
    if (tactic.isPublic) return tactic;
    const t = await updateTactic(tactic.id, { isPublic: true });
    onChange(t);
    return t;
  };

  const copy = () =>
    run(async () => {
      await ensurePublic();
      try {
        await navigator.clipboard.writeText(url);
        setMsg('リンクをコピーしました');
      } catch {
        setMsg(`リンク: ${url}`);
      }
    });

  const openIntent = (href: string) => {
    // ポップアップブロックを避けるため、クリックの時点で窓だけ先に開けておく
    const w = window.open('', '_blank');
    if (w) w.opener = null;
    return run(async () => {
      await ensurePublic();
      if (w) w.location.href = href;
      else window.location.href = href;
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-edge bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-bold text-slate-100">共有</div>
          <div className="text-[11px] text-slate-500">
            {tactic.isPublic
              ? 'リンクを知っている人なら、ログインなしで見られます'
              : '非公開です。リンクで送るときに公開に切り替わります'}
          </div>
        </div>
        <Button
          onClick={() => run(async () => onChange(await updateTactic(tactic.id, { isPublic: !tactic.isPublic })))}
          disabled={busy}
        >
          {tactic.isPublic ? '非公開に戻す' : '公開する'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button tone="primary" disabled={busy} onClick={() => run(async () => {
          const r = await exportShareCard(tactic, tactic.isPublic ? url : undefined);
          setMsg(r === 'shared' ? '共有しました' : '画像を保存しました');
        })}>
          画像を保存
        </Button>
        <Button disabled={busy} onClick={copy}>
          リンクをコピー
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            openIntent(
              `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
            )
          }
        >
          X に投稿
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            openIntent(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`)
          }
        >
          LINE で送る
        </Button>
      </div>
      {msg && <p className="break-all text-[12px] text-team">{msg}</p>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
