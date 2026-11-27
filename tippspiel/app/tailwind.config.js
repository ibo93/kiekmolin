/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dunkle Fläche (Look „Flutlicht“)
        bg: '#050608',
        s1: '#111318',
        s2: '#16181F',
        s3: '#2A2E37',
        line: '#1F222B',
        ink: '#F2F3F7',
        mute: '#9AA1B5',
        acc: { DEFAULT: '#6A58F5', hi: '#A99FFF', lo: '#221D4A' },
        boost: '#FF6B8A',
        up: '#4BE3A6',
        down: '#FF5E6C',
        // Helle Karten
        card: '#DFE4EE',
        card2: '#ECEFF5',
        chip: '#F4F6FA',
        lock: '#DDE2EC',
        cink: '#0B0D12',
        cmute: '#5C6375',
        mint: '#CDEBD9',
        rose: '#F2D3D8',
        lav: '#D9D3FF',
        lav2: '#C5BCFF',
        warn: '#FCEFD2',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], num: ['Archivo', 'Inter', 'sans-serif'] },
      keyframes: {
        flashUp: { '0%,60%': { backgroundColor: '#C8F0DA' }, '100%': {} },
        flashDown: { '0%,60%': { backgroundColor: '#F8D6DC' }, '100%': {} },
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
