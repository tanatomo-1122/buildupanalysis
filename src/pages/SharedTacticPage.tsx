import { useEffect, useState } from 'react';
import type { Tactic } from '../api/tactics';
import { loadSharedTactic } from '../api/tactics';
import { TacticView } from '../components/TacticView';
import { Button, Notice } from '../components/ui';
import { applyTeamColor } from '../theme';

/**
 * 共有リンク（?t=<share_id>）で開いたときの画面。ログイン不要。
 * 作った人のチームカラーで表示する。
 */
export default function SharedTacticPage({
  shareId,
  ownColor,
  onLeave,
}: {
  shareId: string;
  /** 閉じたときに戻す色（閲覧者自身のチームカラー） */
  ownColor: string | null;
  onLeave: () => void;
}) {
  const [tactic, setTactic] = useState<Tactic | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSharedTactic(shareId)
      .then((t) => {
        setTactic(t);
        if (t) applyTeamColor(t.teamColor);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      applyTeamColor(ownColor);
    };
  }, [shareId, ownColor]);

  return (
    <div className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      {tactic === undefined && !error && <Notice>読み込んでいます…</Notice>}
      {tactic === null && (
        <Notice tone="warn">この戦術は見つかりませんでした。非公開に戻されたか、削除された可能性があります。</Notice>
      )}
      {tactic && (
        <div className="rounded-2xl border border-edge bg-panel p-4 sm:p-6">
          <TacticView tactic={tactic} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge bg-panel px-4 py-4">
        <p className="text-[13px] text-slate-300">自分の23人で、自分にしかない戦術を作ってみませんか。</p>
        <Button tone="primary" size="md" onClick={onLeave}>
          MY XI をはじめる
        </Button>
      </div>
    </div>
  );
}
