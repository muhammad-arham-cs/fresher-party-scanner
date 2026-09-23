import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surface / Background palette (slate-based dark theme)
        surface: {
          950: "#020617",
          900: "#0f172a",
          850: "#131f35",
          800: "#1e293b",
          700: "#334155",
          600: "#475569",
          500: "#64748b",
          400: "#94a3b8",
          300: "#cbd5e1",
          200: "#e2e8f0",
        },
        // Primary (blue)
        primary: {
          600: "#2563eb",
          500: "#3b82f6",
          400: "#60a5fa",
          300: "#93c5fd",
          200: "#bfdbfe",
        },
        // Accent (violet)
        accent: {
          600: "#7c3aed",
          500: "#8b5cf6",
          400: "#a78bfa",
        },
        // Success (green)
        success: {
          600: "#16a34a",
          500: "#22c55e",
          400: "#4ade80",
          300: "#86efac",
        },
        // Danger (red)
        danger: {
          600: "#dc2626",
          500: "#ef4444",
          400: "#f87171",
          300: "#fca5a5",
        },
        // Warning (amber)
        warning: {
          600: "#d97706",
          500: "#f59e0b",
          400: "#fbbf24",
          300: "#fcd34d",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      keyframes: {
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(37,99,235,0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(37,99,235,0)" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.3s ease-out",
        "scale-in": "scale-in 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s infinite",
        "spin-slow": "spin 3s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
