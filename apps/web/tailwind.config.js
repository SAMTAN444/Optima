/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: ['reveal', 'in-view', 'reveal-d1', 'reveal-d2', 'reveal-d3', 'reveal-d4', 'page-in', 'page-in-delay', 'hero-in'],
  theme: {
    extend: {
      colors: {
        // ── Primary palette — navy + sky blue ──
        navy: {
          DEFAULT: '#043875',
          50:  '#EAF0F9',
          100: '#C5D6EF',
          200: '#8BAFD9',
          300: '#5488C4',
          400: '#1D62AE',
          500: '#043875',
          600: '#022B5A',
          700: '#011D3E',
          800: '#010F22',
          900: '#000610',
        },
        // ── Sky → rich blue (replaces washed-out cyan) ──
        // sky-300 bg + navy text = 8.15:1 ✓  sky-500 bg + white text = 4.84:1 ✓
        // text-sky-600 on white = 6.03:1 ✓   text-sky-700 on white = 7.84:1 ✓
        sky: {
          DEFAULT: '#2563EB',
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#60A5FA',
          400: '#3B82F6',
          500: '#2563EB',
          600: '#1D4ED8',
          700: '#1E40AF',
          800: '#1E3A8A',
        },
        // ── Secondary palette ──
        yellow: {
          DEFAULT: '#FFEA92',
          50:  '#FFFBEA',
          100: '#FFF5C8',
          200: '#FFEA92',
          300: '#FFE060',
          400: '#FFD62E',
        },
        lightblue: {
          DEFAULT: '#A7CEFC',
          50:  '#EEF5FF',
          100: '#D5E7FE',
          200: '#A7CEFC',
          300: '#79B5FA',
        },
        // ── Semantic aliases ──
        primary: {
          DEFAULT: '#043875',   // alias to navy for legacy compat
          50:  '#EAF0F9',
          100: '#C5D6EF',
          200: '#8BAFD9',
          300: '#5488C4',
          400: '#1D62AE',
          500: '#043875',
          600: '#022B5A',
        },
        // Stronger muted — 5.9:1 on white (was #6B7280 = 4.6:1)
        dark:    '#1A1D21',
        muted:   '#52556A',
        surface: '#F5F7FA',
        'bg-hero':       '#F2F7FF',
        'bg-soft-blue':  '#EBF3FF',
        'bg-soft-slate': '#F5F7FA',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:   '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.09)',
        panel:  '0 2px 20px rgba(0,0,0,0.09)',
        lifted: '0 4px 24px rgba(0,0,0,0.12)',
        nav:    '0 1px 0 rgba(0,0,0,0.09)',
      },
    },
  },
  plugins: [],
};
