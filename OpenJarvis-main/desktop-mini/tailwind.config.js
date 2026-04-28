/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        colorsred: "var(--colorsred)",
        controlsidle: "var(--controlsidle)",
        labelsprimary: "var(--labelsprimary)",
        labelssecondary: "var(--labelssecondary)",
      },
      fontFamily: {
        callout: "var(--callout-font-family)",
        headline: "var(--headline-font-family)",
      },
    },
  },
  plugins: [],
};
