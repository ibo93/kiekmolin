/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0e13',
        s1: '#15171f',
        s2: '#1d2029',
        s3: '#272b37',
        line: '#2c3040',
        ink: '#eceef5',
        mute: '#9097ab',
        // Eigene Akzentfarbe: Arena-Violett
        acc: { DEFAULT: '#7c6cff', hi: '#9b8fff', lo: '#2a2552' },
        boost: '#ff5c8a',
        up: '#2fd27a',
        down: '#ff5468',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      keyframes: {
        flashUp: { '0%,60%': { backgroundColor: 'rgba(47,210,122,.35)' }, '100%': {} },
        flashDown: { '0%,60%': { backgroundColor: 'rgba(255,84,104,.35)' }, '100%': {} },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pulseDot: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
        sheetIn: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
      },
      animation: {
        flashUp: 'flashUp 1.4s ease-out',
        flashDown: 'flashDown 1.4s ease-out',
        shimmer: 'shimmer 1.4s infinite',
        pulseDot: 'pulseDot 1.2s infinite',
        sheetIn: 'sheetIn .25s ease-out',
      },
    },
  },
  plugins: [],
};
