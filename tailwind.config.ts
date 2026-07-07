import type { Config } from "tailwindcss";

/**
 * Colors mirror the mockup design tokens (see /mockups). They are exposed both
 * as CSS variables (in globals.css) and as Tailwind color utilities so we can
 * use `bg-surface`, `text-good`, etc. Dark theme is the default and only theme
 * shipped in v1.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  // Game-color dot classes are applied dynamically (`g-${slug}`), so the content
  // scanner can't see them — keep their CSS from being purged.
  safelist: ["g-mtg", "g-riftbound", "g-yugioh", "g-pokemon", "g-lorcana"],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        muted: "var(--muted)",
        grid: "var(--grid)",
        baseline: "var(--baseline)",
        line: "var(--border)",
        accent: "var(--accent)",
        good: "var(--good)",
        bad: "var(--bad)",
        warn: "var(--warn)",
        "g-mtg": "var(--g-mtg)",
        "g-rift": "var(--g-rift)",
        "g-ygo": "var(--g-ygo)",
        "g-pkm": "var(--g-pkm)",
        "g-lor": "var(--g-lor)",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
