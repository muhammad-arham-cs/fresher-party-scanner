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
        // Professional scanner animations
        "scan-line": {
          "0%": { top: "6%", opacity: "0.4" },
          "15%": { opacity: "1" },
          "50%": { top: "92%", opacity: "1" },
          "65%": { opacity: "1" },
          "95%": { top: "6%", opacity: "1" },
          "100%": { top: "6%", opacity: "0.4" },
        },
        "corner-pulse": {
          "0%, 100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.05)" },
        },
        "success-burst": {
          "0%": { transform: "scale(0.3) rotate(-10deg)", opacity: "0" },
          "50%": { transform: "scale(1.15) rotate(2deg)", opacity: "1" },
          "70%": { transform: "scale(0.95) rotate(-1deg)" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0) translateY(40px)", opacity: "0" },
          "60%": { transform: "scale(1.1) translateY(-5px)", opacity: "1" },
          "80%": { transform: "scale(0.95) translateY(2px)" },
          "100%": { transform: "scale(1) translateY(0)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "ring-expand": {
          "0%": { transform: "scale(0.8)", opacity: "0.8", borderWidth: "4px" },
          "100%": { transform: "scale(2.5)", opacity: "0", borderWidth: "0px" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 15px 0 rgba(16,185,129,0.3)" },
          "50%": { boxShadow: "0 0 40px 10px rgba(16,185,129,0.5)" },
        },
        "shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "count-up": {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.3s ease-out",
        "scale-in": "scale-in 0.25s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s infinite",
        "spin-slow": "spin 3s linear infinite",
        "scan-line": "scan-line 2.5s ease-in-out infinite",
        "corner-pulse": "corner-pulse 2s ease-in-out infinite",
        "success-burst": "success-burst 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "bounce-in": "bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        "shimmer": "shimmer 2s linear infinite",
        "ring-expand": "ring-expand 1.2s ease-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "shake": "shake 0.5s ease-in-out",
        "slide-down": "slide-down 0.3s ease-out",
        "count-up": "count-up 0.4s ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
