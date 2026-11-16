/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#141218',
        panel: '#1a1720',
        panel2: '#221e2a',
        edge: '#332e3d',
        // チームカラー。src/theme.ts が CSS 変数を差し替える
        team: 'rgb(var(--team) / <alpha-value>)',
        'team-ink': 'var(--team-ink)',
        home: 'var(--team-hex)',
        away: 'var(--away-hex)',
        // 灰色は紫寄りに寄せて、地の色と揃える
        slate: {
          50: '#faf8fd',
          100: '#f3f0fa',
          200: '#e4dff0',
          300: '#c9c2d8',
          400: '#a49cb6',
          500: '#7f7792',
          600: '#5d566e',
          700: '#433d52',
          800: '#2c2737',
          900: '#1d1a24',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', 'ui-sans-serif', 'system-ui', 'Hiragino Sans', 'sans-serif'],
        display: ['Teko', '"Noto Sans JP"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
