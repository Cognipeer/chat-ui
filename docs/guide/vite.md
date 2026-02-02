# Vite Integration

Integrate Chat UI with Vite applications.

## Setup

### 1. Create Vite Project

```bash
npm create vite@latest my-chat-app -- --template react-ts
cd my-chat-app
```

### 2. Install Dependencies

```bash
npm install @cognipeer/chat-ui
```

### 3. Add Chat Component

```tsx
// src/App.tsx
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function App() {
  return (
    <div style={{ height: "100vh" }}>
      <Chat
        baseUrl="http://localhost:3000/api/agents"
        agentId="assistant"
        theme="dark"
      />
    </div>
  );
}

export default App;
```

## With Tailwind CSS

### 1. Install Tailwind

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 2. Configure Tailwind

```javascript
// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@cognipeer/chat-ui/**/*.{js,mjs}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### 3. Import Styles

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "@cognipeer/chat-ui/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

## Full Example

```tsx
// src/App.tsx
import { useState } from "react";
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div className={`h-screen ${theme === "dark" ? "bg-gray-900" : "bg-white"}`}>
      <header className="p-4 flex justify-between items-center border-b">
        <h1 className={theme === "dark" ? "text-white" : "text-black"}>
          My Chat App
        </h1>
        <button
          onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
          className="px-3 py-1 rounded bg-blue-500 text-white"
        >
          Toggle Theme
        </button>
      </header>
      
      <main className="h-[calc(100vh-64px)]">
        <Chat
          baseUrl={import.meta.env.VITE_API_URL || "http://localhost:3000/api/agents"}
          agentId="assistant"
          theme={theme}
        />
      </main>
    </div>
  );
}

export default App;
```

## Environment Variables

```env
# .env
VITE_API_URL=http://localhost:3000/api/agents
```

```tsx
<Chat
  baseUrl={import.meta.env.VITE_API_URL}
  agentId="assistant"
/>
```

## API Proxy

For development, proxy API requests:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
```

Then use relative URLs:

```tsx
<Chat
  baseUrl="/api/agents"
  agentId="assistant"
/>
```

## React Router

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Chat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

function ChatPage() {
  return (
    <div className="h-screen">
      <Chat
        baseUrl="/api/agents"
        agentId="assistant"
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:conversationId" element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

## TypeScript Path Aliases

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Build for Production

```bash
npm run build
npm run preview
```

## Next Steps

- [Agent Server Integration](/guide/agent-server)
- [Theming](/guide/theming)
- [Examples](/examples/)
