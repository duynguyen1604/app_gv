/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        school: {
          DEFAULT: '#3B82F6',
          light: '#DBEAFE',
          dark: '#1D4ED8',
        },
        tutoring: {
          DEFAULT: '#F97316',
          light: '#FED7AA',
          dark: '#C2410C',
        },
        extra: {
          DEFAULT: '#8B5CF6',
          light: '#EDE9FE',
          dark: '#6D28D9',
        },
        warning: {
          DEFAULT: '#EF4444',
          light: '#FEE2E2',
        },
        confirm: {
          DEFAULT: '#EAB308',
          light: '#FEF9C3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
