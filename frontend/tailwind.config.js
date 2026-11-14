/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        tablet: '768px',
        desktop: '1200px',
      },
      colors: {
        surface: {
          DEFAULT: 'var(--bg-surface)',
          subtle: 'var(--bg-subtle)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
        },
        border: {
          DEFAULT: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        primary: {
          DEFAULT: '#1A73E8',
          hover: '#1557B0',
          light: '#E8F0FE',
          dark: '#8AB4F8',
        },
        school: {
          DEFAULT: '#2563EB',
          light: '#DBEAFE',
          border: '#1D4ED8',
          dark: '#93C5FD',
          darkBg: 'rgba(37, 99, 235, 0.22)',
        },
        tutoring: {
          DEFAULT: '#EA580C',
          light: '#FFEDD5',
          border: '#C2410C',
          dark: '#FDBA74',
          darkBg: 'rgba(234, 88, 12, 0.22)',
        },
        extra: {
          DEFAULT: '#7C3AED',
          light: '#EDE9FE',
          border: '#6D28D9',
          dark: '#C4B5FD',
          darkBg: 'rgba(124, 58, 237, 0.22)',
        },
        duty: {
          DEFAULT: '#475569',
          light: '#F1F5F9',
          border: '#334155',
          dark: '#CBD5E1',
          darkBg: 'rgba(71, 85, 105, 0.28)',
        },
        warning: {
          DEFAULT: '#DC2626',
          light: '#FEE2E2',
          border: '#B91C1C',
          dark: '#FCA5A5',
        },
        confirm: {
          DEFAULT: '#D97706',
          light: '#FEF3C7',
          border: '#B45309',
          dark: '#FDE68A',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', '"Nunito Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'token-sm': 'var(--radius-sm)',
        'token-md': 'var(--radius-md)',
        'token-lg': 'var(--radius-lg)',
        'token-xl': 'var(--radius-xl)',
      },
      boxShadow: {
        'token-sm': 'var(--shadow-sm)',
        'token-md': 'var(--shadow-md)',
        'token-lg': 'var(--shadow-lg)',
        'gcal': '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
        'gcal-lg': '0 4px 8px 3px rgba(60,64,67,0.15), 0 1px 3px 0 rgba(60,64,67,0.3)',
      },
      transitionDuration: {
        DEFAULT: '180ms',
      },
    },
  },
  plugins: [],
}
