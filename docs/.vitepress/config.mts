import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Chat UI',
  description: 'A production-grade React chat surface for AI agents with streaming, tool-call rendering, uploads, and theming.',
  base: '/chat-ui/',
  ignoreDeadLinks: true,
  appearance: false,
  themeConfig: {
    logo: '/ChatUI.svg',
    siteTitle: 'Chat UI',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Architecture', link: '/guide/architecture' },
      { text: 'API Reference', link: '/api/' },
      { text: 'Examples', link: '/examples/' },
      {
        text: 'v0.1.3',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'Contributing', link: '/contributing' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Core Concepts', link: '/guide/core-concepts' },
            { text: 'Architecture', link: '/guide/architecture' },
          ],
        },
        {
          text: 'Features',
          items: [
            { text: 'State Management', link: '/guide/state-management' },
            { text: 'Theming', link: '/guide/theming' },
            { text: 'Streaming', link: '/guide/streaming' },
            { text: 'File Uploads', link: '/guide/file-uploads' },
            { text: 'Tool Calls', link: '/guide/tool-calls' },
            { text: 'History Sidebar', link: '/guide/history' },
            { text: 'Custom Actions', link: '/guide/custom-actions' },
          ],
        },
        {
          text: 'Integration',
          items: [
            { text: 'Next.js', link: '/guide/nextjs' },
            { text: 'Vite', link: '/guide/vite' },
            { text: 'Agent Server', link: '/guide/agent-server' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Debugging', link: '/guide/debugging' },
            { text: 'FAQ', link: '/guide/faq' },
          ],
        },
      ],
      '/components/': [
        {
          text: 'Components',
          items: [
            { text: 'Overview', link: '/components/' },
            { text: 'Chat', link: '/components/chat' },
            { text: 'ChatMinimal', link: '/components/chat-minimal' },
            { text: 'ChatMessage', link: '/components/chat-message' },
            { text: 'ChatMessageList', link: '/components/chat-message-list' },
            { text: 'ChatInput', link: '/components/chat-input' },
            { text: 'ChatHistory', link: '/components/chat-history' },
            { text: 'ToolCall', link: '/components/tool-call' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'Hooks', link: '/api/hooks' },
            { text: 'useChat', link: '/api/use-chat' },
            { text: 'useChatHistory', link: '/api/use-chat-history' },
            { text: 'Client', link: '/api/client' },
            { text: 'Types', link: '/api/types' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Basic Usage', link: '/examples/basic' },
            { text: 'Custom Theme', link: '/examples/custom-theme' },
            { text: 'With Feedback', link: '/examples/with-feedback' },
            { text: 'Custom Hooks', link: '/examples/custom-hooks' },
            { text: 'Minimal', link: '/examples/minimal' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/Cognipeer/chat-ui' },
    ],
    footer: {
      message: 'Chat UI is part of the Cognipeer platform.',
      copyright: 'Copyright © 2026 Cognipeer',
    },
    search: {
      provider: 'local',
    },
  },
  head: [
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@400;500;600;700;800&display=swap' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/chat-ui/ChatUI.svg' }],
    ['meta', { name: 'theme-color', content: '#00b5a5' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'en' }],
    ['meta', { name: 'og:site_name', content: 'Chat UI Documentation' }],
  ],
});
