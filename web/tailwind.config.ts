import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 24px 60px rgba(20, 184, 166, 0.18)",
      },
      colors: {
        ink: "#132238",
        mist: "#f4f7fb",
        teal: { 500: "#0d9488", 600: "#0f766e" },
      },
    },
  },
  plugins: [],
};

export default config;
