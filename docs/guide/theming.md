# Theming

Customize the appearance of your chat UI with themes and colors.

## Theme Modes

Chat UI supports dark and light themes:

```tsx
// Dark theme (default)
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  theme="dark"
/>

// Light theme
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  theme="light"
/>
```

## Custom Colors

Override specific colors using `themeColors`:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  theme="dark"
  themeColors={{
    bgPrimary: "#1a1a2e",
    bgSecondary: "#16213e",
    bgTertiary: "#0f3460",
    textPrimary: "#eaeaea",
    textSecondary: "#a0a0a0",
    accentPrimary: "#e94560",
  }}
/>
```

### Available Color Properties

| Property | Description | Default (Dark) |
|----------|-------------|----------------|
| `bgPrimary` | Main background | `#212121` |
| `bgSecondary` | Secondary background | `#171717` |
| `bgTertiary` | Tertiary background | `#2f2f2f` |
| `bgHover` | Hover state background | `#3f3f3f` |
| `textPrimary` | Primary text | `#ececec` |
| `textSecondary` | Secondary text | `#b4b4b4` |
| `textTertiary` | Tertiary text | `#8e8e8e` |
| `textInverse` | Inverse text | `#171717` |
| `borderPrimary` | Primary border | `#3f3f3f` |
| `borderSecondary` | Secondary border | `#2f2f2f` |
| `accentPrimary` | Primary accent (buttons) | `#10a37f` |
| `accentSecondary` | Secondary accent | `#1a7f64` |
| `success`, `successBg` | Approved / answered outcomes: icon colour and tinted background | `#34d399`, `rgba(16, 185, 129, 0.12)` |
| `danger`, `dangerBg` | Error banner, denied outcomes, invalid input | `#f87171`, `rgba(239, 68, 68, 0.12)` |
| `warning`, `warningBg` | Expired outcomes, deadline close to running out, image warning | `#fbbf24`, `rgba(245, 158, 11, 0.14)` |
| `info`, `infoBg` | Informational notices | `#60a5fa`, `rgba(59, 130, 246, 0.12)` |

`themeColors` takes every one of these keys (it is `ChatTheme["colors"]`). The light theme ships darker status colours so they stay readable on white (`success #047857`, `danger #b91c1c`, `warning #92400e`, `info #1d4ed8`).

## CSS Variables

The library uses CSS variables for theming. Override them in your CSS:

```css
:root {
  --chat-bg-primary: #212121;
  --chat-bg-secondary: #171717;
  --chat-bg-tertiary: #2f2f2f;
  --chat-bg-hover: #3f3f3f;
  --chat-text-primary: #ececec;
  --chat-text-secondary: #b4b4b4;
  --chat-text-tertiary: #8e8e8e;
  --chat-text-inverse: #171717;
  --chat-border-primary: #3f3f3f;
  --chat-border-secondary: #2f2f2f;
  --chat-accent-primary: #10a37f;
  --chat-accent-secondary: #1a7f64;

  /* Status colours: the colour and a tinted background for each */
  --chat-success: #34d399;
  --chat-success-bg: rgba(16, 185, 129, 0.12);
  --chat-danger: #f87171;
  --chat-danger-bg: rgba(239, 68, 68, 0.12);
  --chat-warning: #fbbf24;
  --chat-warning-bg: rgba(245, 158, 11, 0.14);
  --chat-info: #60a5fa;
  --chat-info-bg: rgba(59, 130, 246, 0.12);
}
```

### Light Theme Variables

```css
.light {
  --chat-bg-primary: #ffffff;
  --chat-bg-secondary: #f7f7f8;
  --chat-bg-tertiary: #ececec;
  --chat-bg-hover: #e5e5e5;
  --chat-text-primary: #171717;
  --chat-text-secondary: #6b6b6b;
  --chat-text-tertiary: #8e8e8e;
  --chat-text-inverse: #ffffff;
  --chat-border-primary: #e5e5e5;
  --chat-border-secondary: #ececec;
  --chat-accent-primary: #10a37f;
  --chat-accent-secondary: #1a7f64;
  --chat-success: #047857;
  --chat-success-bg: rgba(16, 185, 129, 0.12);
  --chat-danger: #b91c1c;
  --chat-danger-bg: rgba(239, 68, 68, 0.1);
  --chat-warning: #92400e;
  --chat-warning-bg: rgba(245, 158, 11, 0.16);
  --chat-info: #1d4ed8;
  --chat-info-bg: rgba(59, 130, 246, 0.1);
}
```

## Theme Provider

For more control, use the `ChatThemeProvider`:

```tsx
import { ChatThemeProvider, useChatTheme, ChatMinimal } from "@cognipeer/chat-ui";

function ThemeToggle() {
  const { theme, setTheme } = useChatTheme();

  return (
    <button onClick={() => setTheme({ 
      mode: theme.mode === "dark" ? "light" : "dark" 
    })}>
      Toggle Theme
    </button>
  );
}

function App() {
  return (
    <ChatThemeProvider
      defaultMode="dark"
      colors={{
        accentPrimary: "#e94560",
      }}
    >
      <ThemeToggle />
      <ChatMinimal
        baseUrl="/api/agents"
        agentId="assistant"
      />
    </ChatThemeProvider>
  );
}
```

## Dynamic Theme Switching

```tsx
import { useState } from "react";
import { Chat } from "@cognipeer/chat-ui";

function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div>
      <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
        Toggle Theme
      </button>
      
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        theme={theme}
      />
    </div>
  );
}
```

## Brand Colors

Example with brand colors:

```tsx
// Blue theme
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  themeColors={{
    accentPrimary: "#3b82f6",
    accentSecondary: "#2563eb",
  }}
/>

// Purple theme
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  themeColors={{
    accentPrimary: "#8b5cf6",
    accentSecondary: "#7c3aed",
  }}
/>

// Rose theme
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  themeColors={{
    bgPrimary: "#1a1a2e",
    bgSecondary: "#16213e",
    accentPrimary: "#e94560",
    accentSecondary: "#c73e54",
  }}
/>
```

## Component-Level Styling

Override styles for specific components:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  className="my-chat-container"
/>
```

```css
.my-chat-container {
  border-radius: 16px;
  overflow: hidden;
}

.my-chat-container .chat-input {
  border-radius: 24px;
}
```

## Tailwind CSS Integration

If using Tailwind, you can extend the theme:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        chat: {
          bg: {
            primary: '#212121',
            secondary: '#171717',
          },
          accent: {
            primary: '#10a37f',
          },
        },
      },
    },
  },
};
```

## Next Steps

- [Streaming](/guide/streaming)
- [File Uploads](/guide/file-uploads)
- [Components](/components/chat)
