import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0e14',
          panel: '#11161d',
          elevated: '#1a2129',
          hover: '#1f2730',
        },
        border: {
          DEFAULT: '#2a3340',
          strong: '#3d4a5c',
        },
        text: {
          primary: '#e6edf3',
          secondary: '#b0bac9',
          muted: '#838d9c',
        },
        // Colores tacticos NATO APP-6
        threat: {
          hostile: '#ff3838',
          'hostile-bg': 'rgba(255, 56, 56, 0.15)',
          friend: '#4a9eff',
          'friend-bg': 'rgba(74, 158, 255, 0.15)',
          neutral: '#2ecc71',
          'neutral-bg': 'rgba(46, 204, 113, 0.15)',
          unknown: '#ffc107',
          'unknown-bg': 'rgba(255, 193, 7, 0.15)',
          pending: '#a78bfa',
        },
        // Acentos del sistema
        accent: {
          cyan: '#00d4ff',
          'cyan-dim': '#0099cc',
          amber: '#ffb84d',
          critical: '#ff3838',
        },
        defcon: {
          1: '#ff3838',
          2: '#ff8800',
          3: '#ffc107',
          4: '#2ecc71',
          5: '#4a9eff',
        },
        // Variables shadcn
        background: '#0a0e14',
        foreground: '#e6edf3',
        primary: {
          DEFAULT: '#00d4ff',
          foreground: '#0a0e14',
        },
        secondary: {
          DEFAULT: '#11161d',
          foreground: '#e6edf3',
        },
        destructive: {
          DEFAULT: '#ff3838',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#11161d',
          foreground: '#b0bac9',
        },
        card: {
          DEFAULT: '#11161d',
          foreground: '#e6edf3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Space Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Densidad militar: legible pero compacto
        'tactical-xs': ['0.6875rem', { lineHeight: '1rem' }],
        'tactical-sm': ['0.8125rem', { lineHeight: '1.125rem' }],
        'tactical-base': ['0.9375rem', { lineHeight: '1.375rem' }],
      },
      animation: {
        'pulse-threat': 'pulse-threat 1.2s ease-in-out infinite',
        'blink-critical': 'blink-critical 0.8s steps(2, jump-none) infinite',
        'scan-line': 'scan-line 4s linear infinite',
      },
      keyframes: {
        'pulse-threat': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(255, 56, 56, 0.7)' },
          '50%': { opacity: '0.85', boxShadow: '0 0 0 8px rgba(255, 56, 56, 0)' },
        },
        'blink-critical': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
      boxShadow: {
        tactical: '0 0 0 1px rgba(0, 212, 255, 0.15), 0 4px 12px rgba(0, 0, 0, 0.6)',
        'tactical-strong': '0 0 0 1px rgba(0, 212, 255, 0.35), 0 8px 24px rgba(0, 0, 0, 0.8)',
        threat: '0 0 12px rgba(255, 56, 56, 0.45)',
      },
    },
  },
  plugins: [],
};

export default config;
