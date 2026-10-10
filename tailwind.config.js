/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    fontSize: {
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["14px", { lineHeight: "20px" }],
      base: ["16px", { lineHeight: "24px" }],
      lg: ["20px", { lineHeight: "28px" }],
      xl: ["28px", { lineHeight: "36px" }],
      "2xl": ["40px", { lineHeight: "44px" }],
    },
    extend: {
      colors: {
        pizarra: "#1B2A33",
        niebla: "#56656D",
        papel: "#F3F5F4",
        superficie: "#FFFFFF",
        linea: "#D3DAD8",
        petroleo: { DEFAULT: "#155E75", hover: "#0F4A5C", suave: "#E1EEF2" },
        cargar: { DEFAULT: "#17603D", suave: "#E3F1E9" },
        advertencia: { DEFAULT: "#8A4B08", suave: "#FBEEDC" },
        bloqueado: { DEFAULT: "#A3231A", suave: "#FBE5E2" },
      },
      fontFamily: {
        display: ['"Archivo"', "sans-serif"],
        sans: ['"IBM Plex Sans"', "sans-serif"],
      },
      keyframes: {
        timbrado: {
          "0%": { opacity: "0", transform: "scale(1.03)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        timbrado: "timbrado 180ms ease-out",
      },
    },
  },
  plugins: [],
};
