import type { Config } from "tailwindcss";

// Per the technical plan (3.5): keep shared.css tokens as the source of truth,
// and expose them to Tailwind as named utilities so `bg-rust`, `text-sage`,
// etc. exist for new layout work. Tokens are defined as CSS variables in
// globals.css; here we just reference them so there is a single source of truth.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        rust: "var(--rust)",
        "rust-deep": "var(--rust-deep)",
        sage: "var(--sage)",
        "sage-deep": "var(--sage-deep)",
        cream: "var(--cream)",
        paper: "var(--paper)",
        ink: "var(--ink)",
        "brown-50": "var(--brown-50)",
        "brown-100": "var(--brown-100)",
        "brown-200": "var(--brown-200)",
        "brown-300": "var(--brown-300)",
        "brown-400": "var(--brown-400)",
        "brown-500": "var(--brown-500)",
        "brown-600": "var(--brown-600)",
        "brown-700": "var(--brown-700)",
        "brown-800": "var(--brown-800)",
        "brown-900": "var(--brown-900)",
        dem: "var(--party-dem)",
        rep: "var(--party-rep)",
        ind: "var(--party-ind)",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
      },
      borderRadius: {
        card: "var(--radius-card)",
      },
    },
  },
  plugins: [],
};

export default config;
