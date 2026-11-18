import { useEffect, useState } from 'react';
import type { Tactic } from '../api/tactics';
import { deleteTactic, listMyTactics, updateTactic } from '../api/tactics';
import { SharePanel, TacticView } from '../components/TacticView';
import { Button, Notice, TextField } from '../components/ui';

interface Props {
  /** 保存直後はその戦術を開いた状態で来る */
  focusId: string | null;
  onOpenBoard: (t: Tactic, phase: 'attack' | 'defense') => void;
  onGoRecommend: () => void;
}

/** 保存した戦術の一覧。同じアカウントならどの端末からでも開ける */
export default function MyTacticsPage({ focusId, onOpenBoard, onGoRecommend }: Props) {
  const [items, setItems] = useState<Tactic[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(focusId);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    listMyTactics()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => setOpenId(focusId), [focusId]);
  useEffect(() => setConfirmDelete(false), [openId]);

  const replace = (t: Tactic) => setItems((xs) => (xs ?? []).map((x) => (x.id === t.id ? t : x)));
  const open = items?.find((t) => t.id === openId) ?? null;

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!items) return <Notice>読み込んでいます…</Notice>;

  if (items.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-edge px-6 py-12 text-center [--numeral-fill:#141218]">
        <div className="numeral text-[96px]">0</div>
        <p className="mt-2 text-[15px] font-bold text-slate-100">まだ保存した戦術がありません</p>
        <p className="mt-1 text-[13px] text-slate-400">戦術提案で形を出したら「この戦術を保存」で、ここに残せます。</p>
        <div className="mt-5">
          <Button tone="primary" size="md" onClick={onGoRecommend}>
            戦術提案へ
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <ul className="space-y-2" aria-label="保存した戦術">
        {items.map((t) => {
          const on = t.id === openId;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                aria-current={on}
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? 'border-team bg-team/10' : 'border-edge bg-panel hover:border-team/50'
                }`}
              >
                <span className={`numeral-solid min-w-[3.6em] text-[34px] ${on ? 'text-team' : 'text-slate-200'}`}>
                  {t.attackLabel}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-slate-100">{t.title}</span>
                  <span className="block truncate font-mono text-[11px] text-slate-500">
                    守備 {t.defenseLabel} ・ 対 {t.opponentLabel.split('（')[0]}
                    {t.isPublic && <span className="ml-1.5 text-team">公開中</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="min-w-0 space-y-4">
        {!open ? (
          <Notice>左の一覧から戦術を選んでください。</Notice>
        ) : (
          <>
            <div className="rounded-2xl border border-edge bg-panel p-4 sm:p-5">
              <TacticView tactic={open} />
            </div>
            <SharePanel tactic={open} onChange={replace} />
            <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-edge bg-panel p-4">
              {renaming === open.id ? (
                <RenameForm
                  initial={open.title}
                  onCancel={() => setRenaming(null)}
                  onSave={async (title) => {
                    replace(await updateTactic(open.id, { title }));
                    setRenaming(null);
                  }}
                />
              ) : (
                <>
                  <Button tone="primary" onClick={() => onOpenBoard(open, 'attack')}>
                    戦術ボードで編集
                  </Button>
                  <Button onClick={() => setRenaming(open.id)}>名前を変える</Button>
                  <span className="flex-1" />
                  {confirmDelete ? (
                    <>
                      <span className="text-[12px] text-slate-300">本当に削除しますか？</span>
                      <Button onClick={() => setConfirmDelete(false)}>やめる</Button>
                      <Button
                        tone="danger"
                        onClick={async () => {
                          try {
                            await deleteTactic(open.id);
                            setItems((xs) => (xs ?? []).filter((x) => x.id !== open.id));
                            setOpenId(null);
                          } catch (e) {
                            setError(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        削除する
                      </Button>
                    </>
                  ) : (
                    <Button tone="danger" onClick={() => setConfirmDelete(true)}>
                      削除
                    </Button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RenameForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <>
      <div className="min-w-[220px] flex-1">
        <TextField label="戦術の名前" value={v} onChange={setV} onEnter={() => v.trim() && onSave(v.trim())} />
      </div>
      <Button onClick={onCancel}>やめる</Button>
      <Button tone="primary" disabled={!v.trim()} onClick={() => onSave(v.trim())}>
        保存
      </Button>
    </>
  );
}
