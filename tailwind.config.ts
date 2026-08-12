import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        /* `font-sans` is the default everywhere; `font-display` is opt-in for
           the hero, the wordmark and section headings. Both keep the stack's
           system fallbacks behind them so text is shaped correctly before the
           webfont arrives. */
        sans: ["var(--font-body)", ...defaultTheme.fontFamily.sans],
        display: ["var(--font-display)", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        /* Marketing surfaces only - the application ground is white. A white
           card on the wash separates at 1.05:1, so cards on it need borders. */
        wash: "hsl(var(--wash))",
        /* Named `brand-amber` rather than `amber` so Tailwind's own amber-*
           scale stays reachable. Legal at large-text sizes only; the Wordmark
           component owns that rule. */
        "brand-amber": "hsl(var(--amber))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        /* One bg/fg pair per consultation status. Cancelled is deliberately
           the quietest of the three. */
        status: {
          scheduled: {
            DEFAULT: "hsl(var(--status-scheduled-bg))",
            foreground: "hsl(var(--status-scheduled-fg))",
          },
          completed: {
            DEFAULT: "hsl(var(--status-completed-bg))",
            foreground: "hsl(var(--status-completed-fg))",
          },
          cancelled: {
            DEFAULT: "hsl(var(--status-cancelled-bg))",
            foreground: "hsl(var(--status-cancelled-fg))",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
