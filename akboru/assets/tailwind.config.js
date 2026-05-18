/* Shared Tailwind CDN config — Industrial Luxury */
window.__akboruTailwindConfig = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface": "#121414",
        "surface-dim": "#121414",
        "surface-bright": "#37393a",
        "surface-container-lowest": "#0c0f0f",
        "surface-container-low": "#1a1c1c",
        "surface-container": "#1e2020",
        "surface-container-high": "#282a2b",
        "surface-container-highest": "#333535",
        "surface-variant": "#333535",
        "on-surface": "#e2e2e2",
        "on-surface-variant": "#c7c6ca",
        "inverse-surface": "#e2e2e2",
        "inverse-on-surface": "#2f3131",
        "outline": "#919094",
        "outline-variant": "#46464a",
        "surface-tint": "#c8c6c7",
        "primary": "#c8c6c7",
        "on-primary": "#313031",
        "primary-container": "#0a0a0b",
        "on-primary-container": "#7a797a",
        "inverse-primary": "#5f5e5f",
        "secondary": "#c8c6ca",
        "on-secondary": "#303033",
        "secondary-container": "#47464a",
        "on-secondary-container": "#b6b4b8",
        "tertiary": "#cac6c2",
        "on-tertiary": "#32302d",
        "tertiary-container": "#0b0a08",
        "on-tertiary-container": "#7c7975",
        "error": "#ffb4ab",
        "on-error": "#690005",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",
        "background": "#121414",
        "on-background": "#e2e2e2",
        "ice": "#E8F4FF"
      },
      borderRadius: {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "2xl": "1rem",
        "3xl": "2rem",
        "full": "9999px"
      },
      spacing: {
        "margin-desktop": "80px",
        "container-max": "1440px",
        "margin-mobile": "20px",
        "unit": "8px",
        "gutter": "24px",
        "section-py": "120px"
      },
      fontFamily: {
        "body-lg": ["Inter"],
        "body-md": ["Inter"],
        "headline-md": ["Inter"],
        "headline-md-mobile": ["Inter"],
        "display-lg": ["Inter"],
        "display-xl": ["Inter"],
        "spec-mono": ["JetBrains Mono"],
        "label-xs": ["JetBrains Mono"]
      },
      fontSize: {
        "body-lg": ["18px", { lineHeight: "160%", letterSpacing: "0em", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "160%", letterSpacing: "0em", fontWeight: "400" }],
        "spec-mono": ["14px", { lineHeight: "140%", letterSpacing: "0.05em", fontWeight: "500" }],
        "label-xs": ["11px", { lineHeight: "100%", letterSpacing: "0.1em", fontWeight: "700" }],
        "headline-md-mobile": ["24px", { lineHeight: "110%", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-md": ["32px", { lineHeight: "110%", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-lg": ["64px", { lineHeight: "95%", letterSpacing: "-0.03em", fontWeight: "800" }],
        "display-xl": ["84px", { lineHeight: "90%", letterSpacing: "-0.04em", fontWeight: "800" }]
      }
    }
  }
};
if (typeof tailwind !== "undefined") { tailwind.config = window.__akboruTailwindConfig; }
