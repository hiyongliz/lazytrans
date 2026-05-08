/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        // sky-blue scale tuned to the liquid-glass logo
        sky: {
          50: '#F4F9FF',
          100: '#E6F1FE',
          200: '#CCE3FD',
          300: '#9CCBFB',
          400: '#5FAEF7',
          500: '#1F8FFF', // logo blue
          600: '#1573D9',
          700: '#0F58A8',
          800: '#0B3F78',
          900: '#0A2540',
          950: '#061528'
        },
        ice: {
          DEFAULT: '#F4F8FF',
          deep: '#E6EFFB',
          edge: '#DEE7F5'
        },
        navy: {
          DEFAULT: '#0A2540',
          soft: '#1A365D',
          mute: '#4A6989',
          mist: '#8FA4BF'
        },
        // shadcn aliases mapped to the new system
        border: '#DEE7F5',
        input: '#DEE7F5',
        ring: '#1F8FFF',
        background: '#F4F8FF',
        foreground: '#0A2540',
        primary: { DEFAULT: '#1F8FFF', foreground: '#FFFFFF' },
        secondary: { DEFAULT: '#E6F1FE', foreground: '#0A2540' },
        destructive: { DEFAULT: '#E15050', foreground: '#FFFFFF' },
        muted: { DEFAULT: '#E6F1FE', foreground: '#4A6989' },
        accent: { DEFAULT: '#E6F1FE', foreground: '#0A2540' },
        popover: { DEFAULT: '#FFFFFF', foreground: '#0A2540' },
        card: { DEFAULT: '#FFFFFF', foreground: '#0A2540' }
      },
      fontFamily: {
        display: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans"',
          '"Microsoft YaHei"',
          'sans-serif'
        ],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans"',
          '"Microsoft YaHei"',
          'sans-serif'
        ],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      letterSpacing: {
        tight: '-0.02em',
        wide: '0.06em',
        ultra: '0.18em'
      },
      borderRadius: {
        glass: '18px',
        tile: '14px',
        pill: '999px'
      },
      boxShadow: {
        glass:
          '0 1px 0 rgba(255,255,255,0.9) inset, 0 1px 2px rgba(10,37,64,0.04), 0 12px 30px -14px rgba(31,143,255,0.28), 0 28px 60px -22px rgba(10,37,64,0.18)',
        'glass-blue':
          '0 1px 0 rgba(255,255,255,0.5) inset, 0 0 0 1px rgba(31,143,255,0.18) inset, 0 12px 30px -10px rgba(31,143,255,0.45)',
        tile: '0 1px 0 rgba(255,255,255,0.7) inset, 0 0 0 1px #DEE7F5 inset, 0 1px 2px rgba(10,37,64,0.04)',
        focus: '0 0 0 4px rgba(31,143,255,0.16)'
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        bubble: {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-220% 0' },
          '100%': { backgroundPosition: '220% 0' }
        },
        breathe: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(0.78)' }
        }
      },
      animation: {
        rise: 'rise 460ms cubic-bezier(0.22, 1, 0.36, 1) both',
        bubble: 'bubble 380ms cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 2.4s ease-in-out infinite',
        breathe: 'breathe 1.6s ease-in-out infinite'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
