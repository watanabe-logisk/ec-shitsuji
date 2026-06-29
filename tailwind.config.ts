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
          DEFAULT: '#C9A96E',
          light: '#F0E6D3',
          dark: '#A88550',
        },
        sage: {
          DEFAULT: '#3D6B51',
          light: '#EFF5F1',
        },
        ink: '#2C2C3E',
        stone: '#9090A8',
        warm: {
          50: '#FFFEF9',
          100: '#F8F5F0',
          200: '#F2EAE0',
          300: '#E0D5C8',
          400: '#C8B8A5',
        },
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Hiragino Mincho ProN', 'Yu Mincho', 'serif'],
      },
    },
  },
  plugins: [],
}
export default config
