/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 60 % Schwarz · 30 % Anthrazit · 10 % Neon-Grün
        bg: '#050608',
        s1: '#101217',
        s2: '#16181F',
        s3: '#22252E',
        line: '#1C1F27',
        ink: '#F2F3F7',
        mute: '#9AA1B5',
        acc: { DEFAULT: '#00FF88', hi: '#7DFFBE', lo: '#00331B' },
        boost: '#FF6B8A',
        up: '#3DF29A',
        down: '#FF5E6C',
        // Karten (Anthrazit)
        card: '#15171E',
        card2: '#1B1E26',
        chip: '#262A34',
        lock: '#1D2028',
        cink: '#F2F3F7',
        cmute: '#9AA1B5',
        mint: '#0E2A20',
        rose: '#2D1218',
        lav: '#00FF88',
        lav2: '#00CC6D',
        warn: '#2A2410',
      },
      boxShadow: {
        neon: '0 0 0 1px rgba(0,255,136,.55), 0 0 22px rgba(0,255,136,.45)',
        neonlg: '0 0 0 1px rgba(0,255,136,.6), 0 0 40px rgba(0,255,136,.55)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], num: ['Archivo', 'Inter', 'sans-serif'] },
      keyframes: {
        flashUp: { '0%,60%': { backgroundColor: '#0F3526' }, '100%': {} },
        flashDown: { '0%,60%': { backgroundColor: '#3A141B' }, '100%': {} },
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
