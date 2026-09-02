import type { Config } from 'tailwindcss';

/**
 * Colours are exposed as `rgb(var(--token))` so that every theme switch is a
 * token override in globals.css rather than a per-component variant. A colour
 * whose only definition sits inside a theme block is the classic
 * unreadable-in-one-theme bug.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-sunk': 'rgb(var(--surface-sunk) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        'text-subtle': 'rgb(var(--text-subtle) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          hover: 'rgb(var(--primary-hover) / <alpha-value>)',
          subtle: 'rgb(var(--primary-subtle) / <alpha-value>)',
          text: 'rgb(var(--primary-text) / <alpha-value>)',
        },
        // Status tones. Fixed meanings — see docs/06-frontend.md K.4.
        neutral: { DEFAULT: 'rgb(var(--neutral) / <alpha-value>)', bg: 'rgb(var(--neutral-bg) / <alpha-value>)' },
        info: { DEFAULT: 'rgb(var(--info) / <alpha-value>)', bg: 'rgb(var(--info-bg) / <alpha-value>)' },
        success: { DEFAULT: 'rgb(var(--success) / <alpha-value>)', bg: 'rgb(var(--success-bg) / <alpha-value>)' },
        warning: { DEFAULT: 'rgb(var(--warning) / <alpha-value>)', bg: 'rgb(var(--warning-bg) / <alpha-value>)' },
        danger: { DEFAULT: 'rgb(var(--danger) / <alpha-value>)', bg: 'rgb(var(--danger-bg) / <alpha-value>)' },
        purple: { DEFAULT: 'rgb(var(--purple) / <alpha-value>)', bg: 'rgb(var(--purple-bg) / <alpha-value>)' },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: '9999px',
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgb(0 0 0 / 0.03)',
        card: '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.03)',
        'card-hover': '0 8px 16px -2px rgb(0 0 0 / 0.06), 0 4px 6px -2px rgb(0 0 0 / 0.03)',
        elevated: '0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // The scale from K.3 with modern line heights
        caption: ['12px', { lineHeight: '1.4' }],
        small: ['13px', { lineHeight: '1.5' }],
        body: ['14px', { lineHeight: '1.55' }],
        h2: ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        h1: ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        display: ['24px', { lineHeight: '1.2', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};

export default config;
