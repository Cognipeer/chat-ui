# Custom Theme

Customize the appearance of your chat UI.

## Light Theme

```tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function LightChat() {
  return (
    <div className="h-screen bg-white">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
        theme="light"
      />
    </div>
  );
}
```

## Custom Colors

```tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function BrandedChat() {
  return (
    <div className="h-screen">
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
          accentSecondary: "#c73e54",
        }}
      />
    </div>
  );
}
```

## Blue Theme

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  themeColors={{
    accentPrimary: "#3b82f6",
    accentSecondary: "#2563eb",
  }}
/>
```

## Purple Theme

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  themeColors={{
    accentPrimary: "#8b5cf6",
    accentSecondary: "#7c3aed",
  }}
/>
```

## CSS Variables

Override CSS variables for more control:

```css
/* styles/chat-theme.css */
:root {
  --chat-bg-primary: #1a1a2e;
  --chat-bg-secondary: #16213e;
  --chat-bg-tertiary: #0f3460;
  --chat-bg-hover: #1f3a5f;
  
  --chat-text-primary: #eaeaea;
  --chat-text-secondary: #a0a0a0;
  --chat-text-tertiary: #707070;
  
  --chat-accent-primary: #e94560;
  --chat-accent-secondary: #c73e54;
  
  --chat-border-primary: #2f2f4f;
  --chat-border-secondary: #1f1f3f;
}
```

```tsx
import "@cognipeer/chat-ui/styles.css";
import "./chat-theme.css";

<Chat
  baseUrl="/api/agents"
  agentId="assistant"
/>
```

## Dynamic Theme Toggle

```tsx
import { useState } from "react";
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div className={`h-screen ${theme === "dark" ? "bg-gray-900" : "bg-white"}`}>
      <header className="p-4 flex justify-end">
        <button
          onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
          className={`px-3 py-1 rounded ${
            theme === "dark" 
              ? "bg-white text-black" 
              : "bg-black text-white"
          }`}
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>
      </header>
      
      <div className="h-[calc(100vh-64px)]">
        <Chat
          baseUrl="/api/agents"
          agentId="assistant"
          theme={theme}
        />
      </div>
    </div>
  );
}
```

## Available Colors

| Property | Description |
|----------|-------------|
| `bgPrimary` | Main background |
| `bgSecondary` | Secondary/sidebar background |
| `bgTertiary` | Tertiary elements (inputs) |
| `bgHover` | Hover state |
| `textPrimary` | Primary text |
| `textSecondary` | Secondary text |
| `textTertiary` | Muted text |
| `textInverse` | Text on accent backgrounds |
| `borderPrimary` | Primary borders |
| `borderSecondary` | Subtle borders |
| `accentPrimary` | Buttons, links |
| `accentSecondary` | Hover state for accent |

## Related

- [Theming Guide](/guide/theming)
- [Basic Usage](/examples/basic)
- [With Feedback](/examples/with-feedback)
