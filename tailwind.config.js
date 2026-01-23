/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary': 'var(--color-primary)',
        'background-light': '#f6f7f8',
        'background-dark': 'var(--color-bg-dark)',
        'card-light': '#ffffff',
        'card-dark': 'var(--color-card-dark)',
        'text-main': '#111518',
        'text-muted': 'var(--color-text-muted)',
      },
      fontFamily: {
        'sans': ['"MemomentKkukkukk"', 'sans-serif'],
        'display': ['"MemomentKkukkukk"', 'sans-serif'],
        'body': ['"MemomentKkukkukk"', 'sans-serif'],
        'hand': ['"MemomentKkukkukk"', 'cursive'],
      },
    },
  },
  plugins: [],
};
