// Genau die Konfiguration, die vorher als tailwind.config im <head> stand.
// Wird gebraucht, um das eingebettete CSS neu zu bauen -- siehe README.md.
module.exports = Object.assign({ content: ['../index.html'], plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')] }, {
        darkMode: "class",
        theme: {
            extend: {
                colors: {
                    "primary": "#00251e",
                    "primary-container": "#003d33",
                    "on-primary": "#ffffff",
                    "secondary": "#735c00",
                    "secondary-container": "#fed65b",
                    "on-secondary-container": "#745c00",
                    "surface": "#f8f9fa",
                    "surface-dim": "#d9dadb",
                    "surface-bright": "#f8f9fa",
                    "surface-container-lowest": "#ffffff",
                    "surface-container-low": "#f3f4f5",
                    "surface-container": "#edeeef",
                    "surface-container-high": "#e7e8e9",
                    "surface-container-highest": "#e1e3e4",
                    "on-surface": "#191c1d",
                    "on-surface-variant": "#404946",
                    "outline": "#707976",
                    "outline-variant": "#c0c8c4",
                    "primary-fixed": "#b8eddf",
                    "primary-fixed-dim": "#9cd1c3",
                    "on-primary-container": "#75a89b",
                    "on-primary-fixed": "#00201a",
                    "error": "#ba1a1a",
                    "error-container": "#ffdad6",
                    "on-error": "#ffffff",
                    "inverse-surface": "#2e3132",
                    "inverse-on-surface": "#f0f1f2",
                    "inverse-primary": "#9cd1c3",
                    "nordic-gold": "#FFD54F",
                    "nordic-green": "#003D33"
                },
                fontFamily: {
                    "headline": ["Epilogue", "sans-serif"],
                    "body": ["Inter", "-apple-system", "sans-serif"],
                    "label": ["Inter", "sans-serif"]
                },
                borderRadius: {
                    "DEFAULT": "1rem",
                    "lg": "2rem",
                    "xl": "3rem",
                    "full": "9999px"
                },
            },
        },
    });