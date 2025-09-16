/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'], // Example of setting a custom font
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}