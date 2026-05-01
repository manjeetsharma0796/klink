import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./_hooks/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(240 5.9% 90%)",
        input: "hsl(240 5.9% 90%)",
        ring: "hsl(160 84% 39%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(240 10% 3.9%)",
        primary: { DEFAULT: "hsl(160 84% 39%)", foreground: "hsl(0 0% 98%)" },
        secondary: { DEFAULT: "hsl(240 4.8% 95.9%)", foreground: "hsl(240 5.9% 10%)" },
        destructive: { DEFAULT: "hsl(0 84.2% 60.2%)", foreground: "hsl(0 0% 98%)" },
        muted: { DEFAULT: "hsl(240 4.8% 95.9%)", foreground: "hsl(240 3.8% 46.1%)" },
        accent: { DEFAULT: "hsl(240 4.8% 95.9%)", foreground: "hsl(240 5.9% 10%)" },
        card: { DEFAULT: "hsl(0 0% 100%)", foreground: "hsl(240 10% 3.9%)" },
      },
      borderRadius: { lg: "0.75rem", md: "0.5rem", sm: "0.375rem" },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
