/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366f1',
          dark: '#4f46e5',
          light: '#818cf8',
        },
        dark: {
          bg: '#0f0f14',
          card: '#1a1a22',
          cardHover: '#24243a',
          border: '#2d2d3f',
          textMuted: '#9ca3af',
        }
      },
    },
  },
  plugins: [],
};
