import { useEffect, useRef } from 'react';
import { PITCH_LENGTH, PITCH_WIDTH } from '../constants';
import type { Vec2 } from '../types';

/** 1m あたりのピクセル数。低解像度で描いて CSS 拡大＝滑らかなグラデーションになる */
const RES = 2;

interface Props {
  homePoints: Vec2[];
  awayPoints: Vec2[];
  lambda: number;
  visible: boolean;
}

/**
 * Pitch Control の連続場をキャンバスに描く。
 * home 優勢 = シアン、away 優勢 = ローズ、拮抗 = 透明。
 *
 * ドラッグ中も毎フレーム再計算するため、内側ループは手書きで最適化している
 * （pitchControl.ts と同じ式：w = exp(-d/λ)）。
 */
export default function Heatmap({ homePoints, awayPoints, lambda, visible }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = Math.round(PITCH_LENGTH * RES);
    const h = Math.round(PITCH_WIDTH * RES);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    if (!visible) {
      ctx.clearRect(0, 0, w, h);
      return;
    }

    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const inv = 1 / Math.max(0.5, lambda);
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const hx = homePoints.map((p) => p.x);
      const hy = homePoints.map((p) => p.y);
      const ax = awayPoints.map((p) => p.x);
      const ay = awayPoints.map((p) => p.y);

      for (let py = 0; py < h; py++) {
        // キャンバスは上端が y=0、ピッチは上端が y=68
        const y = PITCH_WIDTH - (py + 0.5) / RES;
        for (let px = 0; px < w; px++) {
          const x = (px + 0.5) / RES;

          let hSum = 0;
          for (let i = 0; i < hx.length; i++) {
            const dx = hx[i] - x;
            const dy = hy[i] - y;
            hSum += Math.exp(-Math.sqrt(dx * dx + dy * dy) * inv);
          }
          let aSum = 0;
          for (let i = 0; i < ax.length; i++) {
            const dx = ax[i] - x;
            const dy = ay[i] - y;
            aSum += Math.exp(-Math.sqrt(dx * dx + dy * dy) * inv);
          }

          const denom = hSum + aSum;
          const t = denom < 1e-12 ? 0 : hSum / denom - 0.5;
          const idx = (py * w + px) * 4;
          if (t >= 0) {
            data[idx] = 56;
            data[idx + 1] = 189;
            data[idx + 2] = 248;
          } else {
            data[idx] = 251;
            data[idx + 1] = 113;
            data[idx + 2] = 133;
          }
          const a = Math.min(1, Math.abs(t) * 2);
          data[idx + 3] = (a * a * 0.55 + a * 0.45) * 170;
        }
      }
      ctx.putImageData(img, 0, 0);
      raf.current = null;
    });

    return () => {
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
    };
  }, [homePoints, awayPoints, lambda, visible]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
