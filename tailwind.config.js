/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary': 'var(--color-primary)',
        'background-light': 'var(--color-background-light)',
        'background-dark': 'var(--color-bg-dark)',
        'card-light': 'var(--color-card-light)',
        'card-dark': 'var(--color-card-dark)',
        'text-main': 'var(--color-text-main)',
        'text-muted': 'var(--color-text-muted)',
      },
      fontFamily: {
        'sans': ['"Pretendard"', '"Inter"', '"Noto Sans KR"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'display': ['"Pretendard"', '"Inter"', '"Noto Sans KR"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'body': ['"Pretendard"', '"Inter"', '"Noto Sans KR"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        'hand': ['"Pretendard"', '"Inter"', '"Noto Sans KR"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
