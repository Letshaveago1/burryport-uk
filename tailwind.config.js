/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sand: '#f5f5dc',
        charcoal: '#36454f',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}