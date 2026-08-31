/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#151a21',
        panel2: '#1c232c',
        edge: '#2b3540',
        home: '#38bdf8',
        away: '#fb7185',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Hiragino Sans', 'Noto Sans JP', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
