import { useState } from 'react';
import { Button, Notice, TextField } from './ui';

/**
 * 戦術をマイ戦術に残すカード。戦術提案と戦術ボードの両方で使う。
 * onOverwrite を渡すと、開いている戦術への上書き保存も出す。
 */
export default function SaveCard({
  defaultTitle,
  onSave,
  onOverwrite,
  overwriteTitle,
}: {
  defaultTitle: string;
  onSave: (title: string) => Promise<void>;
  /** マイ戦術から開いた戦術に上書きする */
  onOverwrite?: () => Promise<void>;
  overwriteTitle?: string;
}) {
  // 自分で書き換えるまでは、形を変えるたびに既定の名前も追従させる
  const [custom, setTitle] = useState<string | null>(null);
  const title = custom ?? defaultTitle;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>, message?: string) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await fn();
      if (message) setDone(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (title.trim()) void run(() => onSave(title.trim()));
  };

  return (
    <section className="rounded-2xl border border-team/50 bg-team/[0.06] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <TextField label="この戦術に名前をつけて保存" value={title} onChange={setTitle} onEnter={save} />
        </div>
        <Button tone="primary" size="md" disabled={busy || !title.trim()} onClick={save}>
          {busy ? '保存中…' : 'この戦術を保存'}
        </Button>
      </div>
      {onOverwrite && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-team/20 pt-3">
          <Button disabled={busy} onClick={() => void run(onOverwrite, '上書き保存しました')}>
            上書き保存
          </Button>
          <span className="min-w-0 truncate text-[12px] text-slate-400">「{overwriteTitle}」を今の内容に更新します</span>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        保存した戦術は「マイ戦術」からいつでも開けて、リンクや画像で共有できます。共有するまで他の人には見えません。
      </p>
      {done && <p className="mt-2 text-[12px] text-team">{done}</p>}
      {error && (
        <div className="mt-2">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </section>
  );
}
