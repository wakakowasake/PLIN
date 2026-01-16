/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary': '#774b00',
        'background-light': '#f6f7f8',
        'background-dark': '#101a22',
        'card-light': '#ffffff',
        'card-dark': '#1a2632',
        'text-main': '#111518',
        'text-muted': '#617989',
      },
      fontFamily: {
        'display': ['Plus Jakarta Sans', 'sans-serif'],
        'body': ['Noto Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
