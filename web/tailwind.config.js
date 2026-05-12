/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6ff',
          500: '#3b6ef5',
          600: '#2d56d4',
          700: '#2547ab',
        },
      },
    },
  },
  plugins: [],
};
