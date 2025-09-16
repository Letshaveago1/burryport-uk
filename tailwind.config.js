/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sand: '#F3E5AB',
        charcoal: '#36454F',
        teal: '#008080',
        coral: '#FF7F50',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}