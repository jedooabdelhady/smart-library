/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1a1a4e',
          light: '#2d2d7a',
          dark: '#0f0f33',
        },
        gold: {
          DEFAULT: '#c9a84c',
          light: '#e8d48b',
          dark: '#a07e2e',
        },
        beige: {
          DEFAULT: '#f5f0e8',
          dark: '#e8dcc8',
        },
        cream: '#faf8f3',
      },
      fontFamily: {
        cairo: ['Cairo', 'sans-serif'],
        amiri: ['Amiri', 'serif'],
        tajawal: ['Tajawal', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
