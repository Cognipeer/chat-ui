import type { ChatTheme } from "../types";

/**
 * Pre-built theme presets for quick theme selection.
 * Each preset includes a unique id, display name, preview colors, and full ChatTheme config.
 */

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  preview: {
    bg: string;
    accent: string;
    text: string;
  };
  theme: ChatTheme;
}

// ─── Dark Themes ────────────────────────────────────────────────────────────

export const midnightTheme: ThemePreset = {
  id: "midnight",
  name: "Midnight",
  description: "Classic dark theme with green accent",
  preview: { bg: "#212121", accent: "#10a37f", text: "#ececec" },
  theme: {
    mode: "dark",
    colors: {
      bgPrimary: "#212121",
      bgSecondary: "#171717",
      bgTertiary: "#2f2f2f",
      bgHover: "#3f3f3f",
      textPrimary: "#ececec",
      textSecondary: "#b4b4b4",
      textTertiary: "#8e8e8e",
      textInverse: "#171717",
      borderPrimary: "#3f3f3f",
      borderSecondary: "#2f2f2f",
      accentPrimary: "#10a37f",
      accentSecondary: "#1a7f64",
    },
  },
};

export const oceanTheme: ThemePreset = {
  id: "ocean",
  name: "Ocean",
  description: "Deep blue tones with cyan accents",
  preview: { bg: "#0f172a", accent: "#06b6d4", text: "#e2e8f0" },
  theme: {
    mode: "dark",
    colors: {
      bgPrimary: "#0f172a",
      bgSecondary: "#0b1120",
      bgTertiary: "#1e293b",
      bgHover: "#334155",
      textPrimary: "#e2e8f0",
      textSecondary: "#94a3b8",
      textTertiary: "#64748b",
      textInverse: "#0f172a",
      borderPrimary: "#334155",
      borderSecondary: "#1e293b",
      accentPrimary: "#06b6d4",
      accentSecondary: "#0891b2",
    },
  },
};

export const purpleHazeTheme: ThemePreset = {
  id: "purple-haze",
  name: "Purple Haze",
  description: "Rich purple tones with violet accents",
  preview: { bg: "#1a1025", accent: "#a855f7", text: "#e8dff5" },
  theme: {
    mode: "dark",
    colors: {
      bgPrimary: "#1a1025",
      bgSecondary: "#13091c",
      bgTertiary: "#271838",
      bgHover: "#362050",
      textPrimary: "#e8dff5",
      textSecondary: "#b09cc9",
      textTertiary: "#7c6a96",
      textInverse: "#1a1025",
      borderPrimary: "#362050",
      borderSecondary: "#271838",
      accentPrimary: "#a855f7",
      accentSecondary: "#9333ea",
    },
  },
};

export const sunsetTheme: ThemePreset = {
  id: "sunset",
  name: "Sunset",
  description: "Warm dark theme with orange-red accents",
  preview: { bg: "#1c1210", accent: "#f97316", text: "#fde8d8" },
  theme: {
    mode: "dark",
    colors: {
      bgPrimary: "#1c1210",
      bgSecondary: "#150d0b",
      bgTertiary: "#2a1c18",
      bgHover: "#3d2820",
      textPrimary: "#fde8d8",
      textSecondary: "#c9a28e",
      textTertiary: "#8f6d5a",
      textInverse: "#1c1210",
      borderPrimary: "#3d2820",
      borderSecondary: "#2a1c18",
      accentPrimary: "#f97316",
      accentSecondary: "#ea580c",
    },
  },
};

export const emeraldTheme: ThemePreset = {
  id: "emerald",
  name: "Emerald Night",
  description: "Dark theme with emerald green palette",
  preview: { bg: "#0a1f1a", accent: "#34d399", text: "#d1fae5" },
  theme: {
    mode: "dark",
    colors: {
      bgPrimary: "#0a1f1a",
      bgSecondary: "#071613",
      bgTertiary: "#132e26",
      bgHover: "#1d4038",
      textPrimary: "#d1fae5",
      textSecondary: "#86d9b8",
      textTertiary: "#5ca88a",
      textInverse: "#0a1f1a",
      borderPrimary: "#1d4038",
      borderSecondary: "#132e26",
      accentPrimary: "#34d399",
      accentSecondary: "#10b981",
    },
  },
};

// ─── Light Themes ───────────────────────────────────────────────────────────

export const snowTheme: ThemePreset = {
  id: "snow",
  name: "Snow",
  description: "Clean white theme with teal accent",
  preview: { bg: "#ffffff", accent: "#10a37f", text: "#171717" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f7f7f8",
      bgTertiary: "#ececec",
      bgHover: "#e3e3e3",
      textPrimary: "#171717",
      textSecondary: "#6b6b6b",
      textTertiary: "#8e8e8e",
      textInverse: "#ffffff",
      borderPrimary: "#e3e3e3",
      borderSecondary: "#ececec",
      accentPrimary: "#10a37f",
      accentSecondary: "#1a7f64",
    },
  },
};

export const skyTheme: ThemePreset = {
  id: "sky",
  name: "Sky",
  description: "Light blue theme inspired by clear skies",
  preview: { bg: "#f0f9ff", accent: "#0284c7", text: "#0c4a6e" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#f0f9ff",
      bgSecondary: "#e0f2fe",
      bgTertiary: "#bae6fd",
      bgHover: "#7dd3fc",
      textPrimary: "#0c4a6e",
      textSecondary: "#0369a1",
      textTertiary: "#0284c7",
      textInverse: "#f0f9ff",
      borderPrimary: "#bae6fd",
      borderSecondary: "#e0f2fe",
      accentPrimary: "#0284c7",
      accentSecondary: "#0369a1",
    },
  },
};

export const roseGardenTheme: ThemePreset = {
  id: "rose-garden",
  name: "Rose Garden",
  description: "Soft pink tones with rose accents",
  preview: { bg: "#fff1f2", accent: "#e11d48", text: "#4c0519" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#fff1f2",
      bgSecondary: "#ffe4e6",
      bgTertiary: "#fecdd3",
      bgHover: "#fda4af",
      textPrimary: "#4c0519",
      textSecondary: "#881337",
      textTertiary: "#be123c",
      textInverse: "#fff1f2",
      borderPrimary: "#fecdd3",
      borderSecondary: "#ffe4e6",
      accentPrimary: "#e11d48",
      accentSecondary: "#be123c",
    },
  },
};

export const mintTheme: ThemePreset = {
  id: "mint",
  name: "Mint",
  description: "Fresh mint green light theme",
  preview: { bg: "#f0fdf4", accent: "#16a34a", text: "#14532d" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#f0fdf4",
      bgSecondary: "#dcfce7",
      bgTertiary: "#bbf7d0",
      bgHover: "#86efac",
      textPrimary: "#14532d",
      textSecondary: "#166534",
      textTertiary: "#15803d",
      textInverse: "#f0fdf4",
      borderPrimary: "#bbf7d0",
      borderSecondary: "#dcfce7",
      accentPrimary: "#16a34a",
      accentSecondary: "#15803d",
    },
  },
};

export const lavenderTheme: ThemePreset = {
  id: "lavender",
  name: "Lavender",
  description: "Soft purple light theme with violet accents",
  preview: { bg: "#faf5ff", accent: "#9333ea", text: "#3b0764" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#faf5ff",
      bgSecondary: "#f3e8ff",
      bgTertiary: "#e9d5ff",
      bgHover: "#d8b4fe",
      textPrimary: "#3b0764",
      textSecondary: "#581c87",
      textTertiary: "#7e22ce",
      textInverse: "#faf5ff",
      borderPrimary: "#e9d5ff",
      borderSecondary: "#f3e8ff",
      accentPrimary: "#9333ea",
      accentSecondary: "#7e22ce",
    },
  },
};

// ─── Additional Modern Light Themes ─────────────────────────────────────────

export const chatgptLightTheme: ThemePreset = {
  id: "chatgpt-light",
  name: "ChatGPT Light",
  description: "Clean white theme inspired by ChatGPT",
  preview: { bg: "#ffffff", accent: "#10a37f", text: "#0d0d0d" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f9f9f9",
      bgTertiary: "#f0f0f0",
      bgHover: "#e8e8e8",
      textPrimary: "#0d0d0d",
      textSecondary: "#5d5d5d",
      textTertiary: "#9a9a9a",
      textInverse: "#ffffff",
      borderPrimary: "#e5e5e5",
      borderSecondary: "#f0f0f0",
      accentPrimary: "#10a37f",
      accentSecondary: "#0d8a6a",
    },
  },
};

export const pearlTheme: ThemePreset = {
  id: "pearl",
  name: "Pearl",
  description: "Warm neutral light theme with soft tones",
  preview: { bg: "#fafaf9", accent: "#78716c", text: "#1c1917" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#fafaf9",
      bgSecondary: "#f5f5f4",
      bgTertiary: "#e7e5e4",
      bgHover: "#d6d3d1",
      textPrimary: "#1c1917",
      textSecondary: "#57534e",
      textTertiary: "#a8a29e",
      textInverse: "#fafaf9",
      borderPrimary: "#e7e5e4",
      borderSecondary: "#f5f5f4",
      accentPrimary: "#78716c",
      accentSecondary: "#57534e",
    },
  },
};

export const cloudTheme: ThemePreset = {
  id: "cloud",
  name: "Cloud",
  description: "Airy light theme with blue-grey tones",
  preview: { bg: "#f8fafc", accent: "#6366f1", text: "#1e293b" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#f8fafc",
      bgSecondary: "#f1f5f9",
      bgTertiary: "#e2e8f0",
      bgHover: "#cbd5e1",
      textPrimary: "#1e293b",
      textSecondary: "#475569",
      textTertiary: "#94a3b8",
      textInverse: "#f8fafc",
      borderPrimary: "#e2e8f0",
      borderSecondary: "#f1f5f9",
      accentPrimary: "#6366f1",
      accentSecondary: "#4f46e5",
    },
  },
};

export const sandstoneTheme: ThemePreset = {
  id: "sandstone",
  name: "Sandstone",
  description: "Warm earthy light theme with amber accent",
  preview: { bg: "#fffbeb", accent: "#d97706", text: "#451a03" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#fffbeb",
      bgSecondary: "#fef3c7",
      bgTertiary: "#fde68a",
      bgHover: "#fcd34d",
      textPrimary: "#451a03",
      textSecondary: "#78350f",
      textTertiary: "#b45309",
      textInverse: "#fffbeb",
      borderPrimary: "#fde68a",
      borderSecondary: "#fef3c7",
      accentPrimary: "#d97706",
      accentSecondary: "#b45309",
    },
  },
};

export const arcticTheme: ThemePreset = {
  id: "arctic",
  name: "Arctic",
  description: "Ultra-clean white with subtle blue highlights",
  preview: { bg: "#ffffff", accent: "#2563eb", text: "#111827" },
  theme: {
    mode: "light",
    colors: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f9fafb",
      bgTertiary: "#f3f4f6",
      bgHover: "#e5e7eb",
      textPrimary: "#111827",
      textSecondary: "#4b5563",
      textTertiary: "#9ca3af",
      textInverse: "#ffffff",
      borderPrimary: "#e5e7eb",
      borderSecondary: "#f3f4f6",
      accentPrimary: "#2563eb",
      accentSecondary: "#1d4ed8",
    },
  },
};

// ─── Additional Dark Themes ─────────────────────────────────────────────────

export const onyxTheme: ThemePreset = {
  id: "onyx",
  name: "Onyx",
  description: "Pure dark theme with minimal contrast",
  preview: { bg: "#18181b", accent: "#a1a1aa", text: "#fafafa" },
  theme: {
    mode: "dark",
    colors: {
      bgPrimary: "#18181b",
      bgSecondary: "#0f0f11",
      bgTertiary: "#27272a",
      bgHover: "#3f3f46",
      textPrimary: "#fafafa",
      textSecondary: "#a1a1aa",
      textTertiary: "#71717a",
      textInverse: "#18181b",
      borderPrimary: "#3f3f46",
      borderSecondary: "#27272a",
      accentPrimary: "#a1a1aa",
      accentSecondary: "#71717a",
    },
  },
};

export const nordTheme: ThemePreset = {
  id: "nord",
  name: "Nord",
  description: "Arctic-inspired dark theme with frost accent",
  preview: { bg: "#2e3440", accent: "#88c0d0", text: "#eceff4" },
  theme: {
    mode: "dark",
    colors: {
      bgPrimary: "#2e3440",
      bgSecondary: "#242933",
      bgTertiary: "#3b4252",
      bgHover: "#434c5e",
      textPrimary: "#eceff4",
      textSecondary: "#d8dee9",
      textTertiary: "#81a1c1",
      textInverse: "#2e3440",
      borderPrimary: "#434c5e",
      borderSecondary: "#3b4252",
      accentPrimary: "#88c0d0",
      accentSecondary: "#5e81ac",
    },
  },
};

// ─── All Presets ────────────────────────────────────────────────────────────

export const themePresets: ThemePreset[] = [
  // Dark themes
  midnightTheme,
  oceanTheme,
  purpleHazeTheme,
  sunsetTheme,
  emeraldTheme,
  onyxTheme,
  nordTheme,
  // Light themes
  chatgptLightTheme,
  snowTheme,
  arcticTheme,
  cloudTheme,
  pearlTheme,
  skyTheme,
  sandstoneTheme,
  roseGardenTheme,
  mintTheme,
  lavenderTheme,
];

export const darkPresets = themePresets.filter((p) => p.theme.mode === "dark");
export const lightPresets = themePresets.filter((p) => p.theme.mode === "light");

/**
 * Get a theme preset by ID
 */
export function getThemePreset(id: string): ThemePreset | undefined {
  return themePresets.find((p) => p.id === id);
}
