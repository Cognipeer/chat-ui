/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        chat: {
          bg: {
            primary: "var(--chat-bg-primary)",
            secondary: "var(--chat-bg-secondary)",
            tertiary: "var(--chat-bg-tertiary)",
            hover: "var(--chat-bg-hover)",
          },
          text: {
            primary: "var(--chat-text-primary)",
            secondary: "var(--chat-text-secondary)",
            tertiary: "var(--chat-text-tertiary)",
            inverse: "var(--chat-text-inverse)",
          },
          border: {
            primary: "var(--chat-border-primary)",
            secondary: "var(--chat-border-secondary)",
          },
          accent: {
            primary: "var(--chat-accent-primary)",
            secondary: "var(--chat-accent-secondary)",
          },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-dot": "pulseDot 1.4s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.5" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
