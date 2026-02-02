# Installation

Detailed installation instructions for `@cognipeer/chat-ui`.

## Package Installation

::: code-group

```bash [npm]
npm install @cognipeer/chat-ui
```

```bash [yarn]
yarn add @cognipeer/chat-ui
```

```bash [pnpm]
pnpm add @cognipeer/chat-ui
```

:::

## Peer Dependencies

The package requires React 18+:

```json
{
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  }
}
```

## Styles

Import the CSS file in your app:

```tsx
// In your main App.tsx or _app.tsx
import "@cognipeer/chat-ui/styles.css";
```

Or in CSS:

```css
/* In your global CSS */
@import "@cognipeer/chat-ui/styles.css";
```

## With Tailwind CSS

If you're using Tailwind CSS, add the package to your content config:

```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@cognipeer/chat-ui/**/*.{js,mjs}",
  ],
  // ...
};
```

## TypeScript

The package includes TypeScript definitions. No additional `@types` package needed.

```tsx
import { Chat, ChatProps, Message, Conversation } from "@cognipeer/chat-ui";

const props: ChatProps = {
  baseUrl: "/api/agents",
  agentId: "assistant",
};
```

## Framework-Specific Setup

### Next.js

```tsx
// app/chat/page.tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

export default function ChatPage() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
      />
    </div>
  );
}
```

### Vite

```tsx
// src/App.tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function App() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="http://localhost:3000/api/agents"
        agentId="assistant"
      />
    </div>
  );
}

export default App;
```

### Create React App

```tsx
// src/App.tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function App() {
  return (
    <div style={{ height: '100vh' }}>
      <Chat
        baseUrl="http://localhost:3000/api/agents"
        agentId="assistant"
      />
    </div>
  );
}

export default App;
```

## ESM/CommonJS

The package supports both ESM and CommonJS:

```javascript
// ESM
import { Chat } from "@cognipeer/chat-ui";

// CommonJS
const { Chat } = require("@cognipeer/chat-ui");
```

## CDN Usage

For quick prototyping, you can use a CDN (not recommended for production):

```html
<!-- React -->
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<!-- Chat UI -->
<script src="https://unpkg.com/@cognipeer/chat-ui/dist/index.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@cognipeer/chat-ui/dist/styles.css">
```

## Troubleshooting

### Styles not loading

Make sure you import the CSS file:

```tsx
import "@cognipeer/chat-ui/styles.css";
```

### TypeScript errors

Ensure you're using TypeScript 4.7+ with proper JSX configuration:

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "bundler"
  }
}
```

### Module not found

If using Next.js with the app directory, ensure the component is marked as a client component:

```tsx
"use client";

import { Chat } from "@cognipeer/chat-ui";
```

## Next Steps

- [Getting Started](/guide/getting-started)
- [Theming](/guide/theming)
- [Components](/components/chat)
