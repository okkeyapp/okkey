import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx,html}",
    "../../packages/ui/src/**/*.{ts,tsx,js,jsx}",
    // ItemActivitySection / filter / KeyFormEditor live here — without this scan,
    // timeline footer + filter chip utility classes are missing from the popup CSS.
    "../../packages/vault-ui/src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          primary: "hsl(var(--sidebar-primary) / <alpha-value>)",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          accent: "hsl(var(--sidebar-accent) / <alpha-value>)",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
        },
        /**
         * Primary vs. secondary ink for prose (not accent `primary`).
         * Named `copy` — avoid `content` here: it breaks Tailwind `@apply` / utility generation.
         */
        copy: {
          primary: "hsl(var(--foreground) / <alpha-value>)",
          secondary: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "8px",
        sm: "6px",
      },
      /**
       * Stacking scale — keep in sync with `packages/ui/src/lib/z-index.ts`
       * and CSS vars in `apps/extension/src/assets/extension.css`.
       */
      zIndex: {
        sticky: "40",
        "sidebar-overlay": "50",
        sidebar: "60",
        popup: "70",
        "popup-nested": "80",
        "popup-nested-high": "90",
        floating: "100",
        tooltip: "110",
        lightbox: "120",
      },
    },
  },
  plugins: [],
};

export default config;
