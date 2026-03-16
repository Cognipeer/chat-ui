# Theming

Customize the appearance of your chat UI without forking the interaction model or rewriting the components.

## Choose The Right Theming Level

| Tool | Best for | Scope |
| --- | --- | --- |
| `theme` prop | Simple dark/light switching | One `Chat` or `ChatMinimal` instance |
| `themeColors` prop | Quick brand alignment on the top-level chat surface | One `Chat` or `ChatMinimal` instance |
| `ChatThemeProvider` | Shared theme state across multiple chat-related components | A composed React subtree |
| CSS variables | Product-wide design system integration and host-app styling | Any container where the CSS variables are applied |

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

Override a focused set of top-level colors using `themeColors`:

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

Use `themeColors` when you want a faster brand pass but do not need a full custom theme management model.

### `themeColors` Keys

| Property | Description | Default (Dark) |
|----------|-------------|----------------|
| `bgPrimary` | Main background | `#212121` |
| `bgSecondary` | Secondary background | `#171717` |
| `bgTertiary` | Tertiary background | `#2f2f2f` |
| `textPrimary` | Primary text | `#ececec` |
| `textSecondary` | Secondary text | `#b4b4b4` |
| `accentPrimary` | Primary accent (buttons) | `#10a37f` |

If you need to override the full token set, use `ChatThemeProvider` or CSS variables instead of `themeColors`.

## CSS Variables

The library uses CSS variables internally. This is the best entry point when your host app already has its own theming system or when multiple chat-related components need to inherit the same tokens.

Override them in your CSS:

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
}
```

### Light Theme Variables

```css
.chat-theme-light {
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
}
```

These CSS variables support the full token surface, including hover, border, and secondary accent colors.

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
      theme={{
        colors: {
          accentPrimary: "#e94560",
        },
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

Use the provider when you have more than one chat component in the same React subtree or when theme state needs to be controlled from custom UI outside the built-in `Chat` shell.

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
    bgTertiary: "#dbeafe",
  }}
/>

// Purple theme
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  themeColors={{
    accentPrimary: "#8b5cf6",
    bgTertiary: "#ede9fe",
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
  }}
/>
```

## Recommended Override Order

1. Start with `theme="light"` or `theme="dark"` to choose the base mode.
2. Add `themeColors` if you only need a small set of brand color changes.
3. Move to `ChatThemeProvider` when multiple components need shared theme state.
4. Use CSS variables when the chat surface must inherit from a broader application theme system.

Following this order keeps your styling resilient and avoids unnecessary component-level CSS overrides.

## Brand Adaptation Workflow

For most teams, the cleanest approach is:

1. Pick the base mode that matches the product surface.
2. Set `accentPrimary` and the background tokens to align with brand color.
3. Check message contrast, input affordances, and hover states before adding any custom selectors.
4. Only add custom CSS once the token-based result is clearly insufficient.

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

Use component-level CSS for layout polish or host-page fit, not as the first tool for recoloring the interface.

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

## Common Mistakes

- Overriding deep internal selectors before trying `themeColors` or CSS variables.
- Mixing hard-coded brand colors with token-based backgrounds, resulting in low contrast.
- Applying custom container backgrounds without adjusting border and hover tokens.
- Managing shared theme state manually when `ChatThemeProvider` already fits the job.

## Next Steps

- [Streaming](/guide/streaming)
- [File Uploads](/guide/file-uploads)
- [Components](/components/chat)
