import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1A1B35',
        champagne: {
          // 明るいゴールド。ネイビー上の文字・枠線・装飾用（淡色背景の文字には使わない）
          DEFAULT: '#C9A96E',
          light: '#F0E6D3',
          // 淡色背景に乗せる文字用。warm-50 で 5.59:1、champagne-light で 4.56:1
          dark: '#7D633B',
        },
        sage: {
          DEFAULT: '#3D6B51',
          light: '#EFF5F1',
          // ネイビー上の文字・枠線用。navy で 4.56:1
          bright: '#53926F',
        },
        ink: '#2C2C3E',
        // 淡色背景の副次テキスト用。warm-50 で 5.40:1、warm-200 で 4.58:1
        stone: '#676784',
        warm: {
          50: '#FFFEF9',
          100: '#F8F5F0',
          200: '#F2EAE0',
          300: '#E0D5C8',
          // ネイビー上の副次テキスト用（8.67:1）。stone は暗すぎて使えない
          400: '#C8B8A5',
        },
      },
      fontFamily: {
        // 見出し・ロゴ。欧文は Cormorant Garamond、和文は Noto Serif JP が受け持つ
        display: ['var(--font-cormorant)', 'var(--font-noto-serif-jp)', 'serif'],
        // 本文・UI。和欧混植を Noto Sans JP で統一する
        sans: ['var(--font-noto-sans-jp)', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
