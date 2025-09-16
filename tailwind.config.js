/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': '#0D2B45',    // Deep Sea Blue
        'secondary': '#1D4E89',  // Ocean Blue
        'accent': '#F79256',     // Sunset Orange
        'neutral': '#E0E0E0',    // Light Grey (for text)
        'base': '#F9F9F9',       // Off-White (for backgrounds)
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