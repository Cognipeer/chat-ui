---
title: Theming
---

# Theming

`@cognipeer/chat-ui` includes built-in dark/light presets and token-based overrides.

## Theme modes

- `theme="dark"` (default-rich workspace feel)
- `theme="light"` (clean content-first feel)

## Token overrides

Use `themeColors` to align with your brand:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
  theme="dark"
  themeColors={{
    bgPrimary: '#0f172a',
    bgSecondary: '#1e293b',
    accentPrimary: '#22c55e',
  }}
/>
```

## Guidance

- Start from presets, then override only necessary tokens.
- Keep text/background contrast high for readability.
- Test both desktop and narrow viewports after changes.

## Related docs

- [Guide: Theming](/guide/theming)
- [Examples: Custom Theme](/examples/custom-theme)
