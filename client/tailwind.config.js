/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        theme: {
          bg: 'var(--color-bg)',
          card: 'var(--color-card)',
          border: 'var(--color-border)',
          muted: 'var(--color-muted)',
          text: 'var(--color-text)',
          subtext: 'var(--color-subtext)',
          inverse: 'var(--color-inverse)',
        }
      },
      fontFamily: {
        sans: ['Gilroy', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      animation: {
        /* Entrances */
        'fade-in':       'fadeIn 220ms cubic-bezier(0.22,1,0.36,1) forwards',
        'slide-up':      'slideUp 340ms cubic-bezier(0.22,1,0.36,1) forwards',
        'slide-down':    'slideDown 300ms cubic-bezier(0.22,1,0.36,1) forwards',
        'scale-in':      'scaleIn 260ms cubic-bezier(0.22,1,0.36,1) forwards',
        'pop-in':        'popIn 320ms cubic-bezier(0.34,1.56,0.64,1) forwards',
        /* Continuous */
        'pulse-subtle':  'pulseSubtle 3s infinite ease-in-out',
        'pulse-glow':    'pulseGlow 2.4s infinite ease-in-out',
        'float':         'float 3s infinite ease-in-out',
        'spin-slow':     'spin 3s linear infinite',
        /* Dynamic Island */
        'island-expand': 'islandExpand 380ms cubic-bezier(0.16,1,0.3,1) forwards',
        /* Toast */
        'toast-in':      'toastIn 360ms cubic-bezier(0.34,1.56,0.64,1) forwards',
        'toast-out':     'toastOut 220ms cubic-bezier(0.22,1,0.36,1) forwards',
        /* Shake for error */
        'shake':         'shake 400ms cubic-bezier(0.36,0.07,0.19,0.97)',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        popIn: {
          '0%':   { opacity: '0', transform: 'scale(0.82)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.55' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(59,130,246,0)' },
          '50%':      { boxShadow: '0 0 18px 4px rgba(59,130,246,0.25)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-5px)' },
        },
        islandExpand: {
          '0%':   { opacity: '0', transform: 'translateX(-50%) scaleX(0.5) scaleY(0.4)' },
          '100%': { opacity: '1', transform: 'translateX(-50%) scaleX(1) scaleY(1)' },
        },
        toastIn: {
          '0%':   { opacity: '0', transform: 'translateX(-50%) translateY(16px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translateX(-50%) translateY(0) scale(1)' },
        },
        toastOut: {
          '0%':   { opacity: '1', transform: 'translateX(-50%) translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateX(-50%) translateY(10px) scale(0.95)' },
        },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%':     { transform: 'translateX(-6px)' },
          '40%':     { transform: 'translateX(6px)' },
          '60%':     { transform: 'translateX(-4px)' },
          '80%':     { transform: 'translateX(4px)' },
        },
      },
      transitionTimingFunction: {
        'spring':  'cubic-bezier(0.34,1.56,0.64,1)',
        'smooth':  'cubic-bezier(0.22,1,0.36,1)',
        'expo-in': 'cubic-bezier(0.95,0.05,0.795,0.035)',
        'expo-out':'cubic-bezier(0.19,1,0.22,1)',
      },
      transitionDuration: {
        '80':  '80ms',
        '220': '220ms',
        '350': '350ms',
        '400': '400ms',
        '500': '500ms',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'premium':       '0 2px 8px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)',
        'premium-dark':  '0 2px 12px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.3)',
        'glow-blue':     '0 0 20px rgba(59,130,246,0.35)',
        'glow-blue-sm':  '0 0 10px rgba(59,130,246,0.2)',
        'card':          '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)',
        'card-dark':     '0 1px 4px rgba(0,0,0,0.3), 0 6px 20px rgba(0,0,0,0.2)',
        'float':         '0 8px 30px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.12)',
        'float-blue':    '0 8px 30px rgba(59,130,246,0.3), 0 2px 8px rgba(59,130,246,0.15)',
        'inner-glow':    'inset 0 1px 0 rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [],
}
