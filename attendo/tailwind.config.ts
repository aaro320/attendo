import type { Config } from 'tailwindcss'

/**
 * BulSU CpE palette.
 * Contrast note: the brief's emerald (#10B981) and red (#EF4444) fail WCAG AA as
 * text/white-on-fill, so each has a `strong` shade used for text and solid buttons
 * (#047857 = 5.5:1 on white, #B91C1C = 6.5:1). The brief colours stay as DEFAULT
 * for icons, dots, borders and tinted backgrounds.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './hooks/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0B3B60', hover: '#082F4D', active: '#06243B', soft: '#E6EEF5' },
        brand: { DEFAULT: '#1E40AF', hover: '#1E3A8A', active: '#172554', soft: '#DBEAFE' },
        surface: '#F8FAFC',
        success: { DEFAULT: '#10B981', strong: '#047857', hover: '#065F46', active: '#064E3B', soft: '#D1FAE5' },
        danger: { DEFAULT: '#EF4444', strong: '#B91C1C', hover: '#991B1B', active: '#7F1D1D', soft: '#FEE2E2' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.06)',
      },
      keyframes: {
        popIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px) scale(0.98)', backgroundColor: '#D1FAE5' },
          '60%': { opacity: '1', transform: 'translateY(0) scale(1)', backgroundColor: '#D1FAE5' },
          '100%': { backgroundColor: 'transparent' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pop-in': 'popIn 2.4s ease-out both',
        'fade-up': 'fadeUp 0.25s ease-out both',
      },
    },
  },
  plugins: [],
}

export default config
