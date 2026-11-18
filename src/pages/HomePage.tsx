import { useMemo } from 'react';
import { signInWithGoogle } from '../api/auth';
import { supabaseConfigured } from '../api/supabase';
import LineupPitch from '../components/LineupPitch';
import { Notice } from '../components/ui';
import { initialState } from '../presets';

/**
 * ホーム。MY XI が何をする場所なのかを伝えて、2つの道具（提案とボード）へ送り出す。
 * ログインしていなくても戦術ボードは触れるので、まず試してもらう導線を残している。
 */
interface Props {
  loggedIn: boolean;
  clubName: string | null;
  /** 名前が入っている登録選手の人数 */
  squadCount: number;
  authError: string | null;
  onRecommend: () => void;
  onBoard: () => void;
  onSquad: () => void;
}

export default function HomePage({
  loggedIn,
  clubName,
  squadCount,
  authError,
  onRecommend,
  onBoard,
  onSquad,
}: Props) {
  const demo = useMemo(() => initialState().players, []);
  const ready = squadCount >= 11;

  return (
    <div className="space-y-6" data-testid="home">
      {/* ── 1. 何をするところか ── */}
      <section className="relative overflow-hidden rounded-3xl border border-edge bg-panel">
        <div className="grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <div className="min-w-0 space-y-6">
            <div className="text-[12px] font-bold tracking-[0.2em] text-team">EFOOTBALL TACTICS LAB</div>
            <h1 className="numeral text-[96px] sm:text-[136px]">MY XI</h1>
            <p className="text-[22px] font-black leading-snug text-slate-50 [text-wrap:balance] sm:text-[26px]">
              相手の戦術に、
              <br className="hidden sm:inline" />
              自分の23人でどう挑むか。
            </p>
            <p className="max-w-[54ch] text-[14px] leading-relaxed text-slate-400">
              MY XI は、eFootball で「この相手には、手持ちの選手でどう戦えばいいか」を試行錯誤するための場所です。
              選手を登録して相手の形を入れると、攻撃のときと守備のときのフォーメーションを考えられます。
              正解はひとつではありません。自分だけの戦術を見つけてください。
            </p>

            <div className="flex flex-wrap items-center gap-3">
              {loggedIn ? (
                <>
                  <PrimaryButton onClick={ready ? onRecommend : onSquad}>
                    {ready ? '戦術提案をはじめる' : '選手を登録する'}
                  </PrimaryButton>
                  <SecondaryButton onClick={onBoard}>戦術ボードで試す</SecondaryButton>
                </>
              ) : (
                <>
                  {supabaseConfigured && (
                    <PrimaryButton onClick={signInWithGoogle}>Google でログインして始める</PrimaryButton>
                  )}
                  <SecondaryButton onClick={onBoard}>ログインせずにボードを触る</SecondaryButton>
                </>
              )}
            </div>
            {loggedIn && clubName && (
              <p className="text-[12px] text-slate-500">
                {clubName} ・ 登録選手 {squadCount} 名
                {!ready && '（戦術提案には11名以上が必要です）'}
              </p>
            )}
            {authError && <Notice tone="error">ログインできませんでした：{authError}</Notice>}
          </div>

          <figure className="min-w-0 space-y-2" aria-label="戦術ボードの例">
            <LineupPitch
              home={demo.filter((p) => p.team === 'home')}
              away={demo.filter((p) => p.team === 'away')}
              homeLabel="自分 4-3-3"
              awayLabel="相手 4-2-3-1"
            />
            <figcaption className="text-right text-[11px] text-slate-500">
              選手をドラッグすると、ビルドアップ期待値がすぐに変わります
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── 2. 2つの道具 ── */}
      <section className="grid gap-4 md:grid-cols-2" aria-label="2つの道具">
        <ToolCard
          kicker="答えを出す"
          title="戦術提案"
          body="相手の形とチームスタイルを入れると、登録した選手から攻撃時・守備時のフォーメーションとスタメン11人を出します。19,268通りの形から探すので、思いつかなかった並びに出会えます。"
          action={loggedIn ? (ready ? '戦術提案へ' : '先に選手を登録する') : 'ログインして使う'}
          onClick={loggedIn ? (ready ? onRecommend : onSquad) : signInWithGoogle}
          disabled={!loggedIn && !supabaseConfigured}
        />
        <ToolCard
          kicker="自分で探る"
          title="戦術ボード"
          body="ピッチの上で選手を自由に動かして、自分の形を探ります。動かすたびに数字がひとつ返ってくるだけ。提案から微調整するときも、1から考えるときもここで。"
          action="戦術ボードへ"
          onClick={onBoard}
        />
      </section>

      {/* ── 3. 遊び方（順番に意味があるので番号を付ける） ── */}
      <section className="rounded-3xl border border-edge bg-panel px-6 py-8 sm:px-10">
        <h2 className="text-[18px] font-black text-slate-50">遊び方</h2>
        <ol className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['選手を登録', '自分の23人を、メインと適性ポジション、プレースタイルつきで登録します。'],
            ['相手の形を入れる', 'よくある形はボタンひとつ。それ以外はポジションごとの人数で入れます。'],
            ['提案を見る・動かす', '提案された形をボードに持っていって、数字を見ながら自分好みに直します。'],
            ['保存して共有', 'マイ戦術に残して、リンクや画像で友だちに見せられます。'],
          ].map(([title, body], i) => (
            <li key={title} className="space-y-2">
              <div className="numeral text-[56px] [--numeral-fill:#1a1720]">{i + 1}</div>
              <div className="text-[15px] font-bold text-slate-100">{title}</div>
              <p className="text-[13px] leading-relaxed text-slate-400">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 4. 数字の意味 ── */}
      <section className="grid gap-6 rounded-3xl border border-edge bg-panel px-6 py-8 sm:px-10 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
        <div className="numeral text-[96px]">+1.42</div>
        <div className="space-y-2">
          <h2 className="text-[18px] font-black text-slate-50">ビルドアップ期待値ってなに？</h2>
          <p className="max-w-[62ch] text-[14px] leading-relaxed text-slate-400">
            ボールを持った選手から、味方へのパスがどれだけ前に通りそうかを点数にしたものです。
            GK 以外の10人それぞれがボールを持った場合を計算して平均しています。
            大きいほど前にボールを運びやすい配置、相手側の数字は小さいほど守れている配置です。
            チームスタイルやプレースタイルによる選手の動きも計算に入っています。
          </p>
        </div>
      </section>
    </div>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl bg-team px-6 py-3.5 text-[15px] font-bold text-team-ink transition-[filter] hover:brightness-110"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-edge px-5 py-3.5 text-[14px] font-bold text-slate-200 transition-colors hover:border-team/70"
    >
      {children}
    </button>
  );
}

function ToolCard({
  kicker,
  title,
  body,
  action,
  onClick,
  disabled,
}: {
  kicker: string;
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-edge bg-panel px-6 py-7">
      <div className="text-[12px] font-bold tracking-[0.14em] text-team">{kicker}</div>
      <h2 className="text-[26px] font-black text-slate-50">{title}</h2>
      <p className="flex-1 text-[14px] leading-relaxed text-slate-400">{body}</p>
      <div>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="rounded-lg border border-team px-4 py-2.5 text-[13px] font-bold text-team transition-colors hover:bg-team hover:text-team-ink disabled:opacity-40"
        >
          {action} →
        </button>
      </div>
    </article>
  );
}
