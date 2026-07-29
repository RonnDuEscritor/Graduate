/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html','./src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:'#FBF1F3', 100:'#F5DEE3', 200:'#E9BAC5', 300:'#CB8698',
          400:'#A8546A', 500:'#7D1A31', 600:'#5A0F24', 700:'#450A1B',
          800:'#300712', 900:'#20040D', 950:'#120209',
        },
        gold: '#D4A72C',
        'gold-light': '#F0D584',
        'gold-dark': '#8A6A16',
      },
      fontFamily: {
        sans:  ['Inter','system-ui','sans-serif'],
        serif: ['Playfair Display','Georgia','serif'],
      },
    },
  },
  plugins: [],
}
