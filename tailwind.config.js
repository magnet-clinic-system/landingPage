/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['Cairo', 'sans-serif'],
      },
      keyframes: {
        waveScroll: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        }
      },
      animation: {
        'wave-slow': 'waveScroll 18s linear infinite',
        'wave-fast': 'waveScroll 12s linear infinite',
        'marquee-slow': 'marquee 40s linear infinite',
      }
    },
  },
  plugins: [],
}
