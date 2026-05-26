import type { Config } from 'tailwindcss'

// Design tokens transcribed from the spec's ui_design_direction.
// Tailwind only scans the popup + options surfaces; the content script never
// uses Tailwind (it ships scoped CSS inside a Shadow DOM instead).
export default {
  content: ['./src/popup/**/*.{ts,tsx,html}', './src/options/**/*.{ts,tsx,html}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#FAFAF7',
          dark: '#0E0E0C',
        },
        ink: {
          DEFAULT: '#1B1B18',
          dark: '#ECECE6',
        },
        muted: {
          DEFAULT: '#6F6F68',
          dark: '#8E8E84',
        },
        line: {
          DEFAULT: '#E5E5DE',
          dark: '#2A2A26',
        },
        accent: {
          DEFAULT: '#2563EB',
          hover: '#1D4FD7',
        },
        danger: {
          DEFAULT: '#DC2626',
        },
      },
      fontFamily: {
        sans: [
          'Inter Tight',
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '20px'],
        lg: ['16px', '24px'],
        xl: ['20px', '28px'],
      },
      borderRadius: {
        DEFAULT: '8px',
        card: '12px',
        pill: '999px',
      },
      spacing: {
        // 4px base unit is the default Tailwind scale; nothing to override.
      },
    },
  },
  plugins: [],
} satisfies Config
