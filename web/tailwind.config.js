/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        // Borda de superfície (card, diálogo): quase invisível no claro, onde
        // quem separa é a sombra; no escuro é ela que dá o contorno.
        "border-surface": "hsl(var(--border-surface))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // Rampa derivada do âmbar do tema (#FFC72C = 500).
          50: "#FFF9E8",
          100: "#FFF1C6",
          200: "#FFE38C",
          300: "#FFD65C",
          400: "#FFCE44",
          500: "#FFC72C",
          600: "#E0A800",
          700: "#B38400",
          800: "#8A6600",
          900: "#5C4400",
          950: "#3A2003",
        },
        // Faixa âmbar do topo no mobile. Token próprio porque no escuro ela
        // fecha (#5C4400) enquanto `primary` segue no #FFC72C dos botões.
        banner: {
          DEFAULT: "hsl(var(--banner))",
          foreground: "hsl(var(--banner-foreground))",
          surface: "hsl(var(--banner-surface))",
          border: "hsl(var(--banner-border))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Raio das SUPERFÍCIES (card, diálogo, gaveta). Maior que o dos
        // controles de propósito: é o que dá o ar arredondado e sóbrio sem
        // deformar botão e campo, que continuam em `--radius`.
        surface: "var(--radius-surface)",
      },
      fontFamily: {
        sans: ["Poppins", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // A SOMBRA É O SEPARADOR — não a borda.
        // Difusa e de opacidade baixa: o card se destaca do fundo sem desenhar
        // uma linha em volta. Duas camadas porque uma só ou fica dura (curta) ou
        // suja o fundo (longa): a curta assenta o card, a longa dá a elevação.
        panel:
          "0 1px 2px -1px hsl(30 20% 12% / 0.06), 0 4px 16px -4px hsl(30 20% 12% / 0.08)",
        "panel-lg":
          "0 2px 4px -2px hsl(30 20% 12% / 0.06), 0 12px 32px -8px hsl(30 20% 12% / 0.12)",
        signal: "0 0 0 1px hsl(var(--signal) / 0.35), 0 8px 24px -8px hsl(var(--signal) / 0.35)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-down": {
          from: { transform: "translateY(-100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "scale-in": {
          from: { transform: "scale(0.95)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "code-in": {
          from: { opacity: "0", filter: "blur(6px)", transform: "translateY(4px)" },
          to: { opacity: "1", filter: "blur(0)", transform: "translateY(0)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "40%": { opacity: "1" },
          "100%": { transform: "translateY(220%)", opacity: "0" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "slide-down": "slide-down 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "code-in": "code-in 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
        scan: "scan 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
