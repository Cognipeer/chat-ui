# Chat UI Docs Expansion Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the `chat-ui` docs with new integration-focused guide pages and a richer guide sidebar while keeping the docs grounded in real UI-library usage.

**Architecture:** Extend the existing VitePress guide taxonomy in place, add tightly scoped markdown guides for the new topics, and deepen the current integration pages so the new material is discoverable and cross-linked. All changes stay inside `docs/` and `docs/.vitepress/config.mts`, with verification through a full docs build.

**Tech Stack:** VitePress, Markdown, existing `docs/` structure, npm docs build

---

## Chunk 1: Sidebar And New Feature Guides

### Task 1: Expand the guide sidebar taxonomy

**Files:**
- Modify: `docs/.vitepress/config.mts`
- Verify: `npm run docs:build`

- [ ] **Step 1: Update the `/guide/` sidebar groups**

Add the new Introduction, Features, Integration, and Advanced items described in the approved spec.

- [ ] **Step 2: Preserve existing pages and links**

Keep current guide routes intact while inserting the new pages into the right section.

- [ ] **Step 3: Review ordering**

Make sure the sequence reads from onboarding to advanced operational topics.

### Task 2: Add the runtime and rendering feature guides

**Files:**
- Create: `docs/guide/runtime-profiles.md`
- Create: `docs/guide/structured-output.md`
- Create: `docs/guide/guardrails.md`
- Create: `docs/guide/mcp-integration.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Write `runtime-profiles.md`**

Document when to choose `Chat`, `ChatMinimal`, hooks, and provider-based composition.

- [ ] **Step 2: Write `structured-output.md`**

Explain how schema-shaped or JSON-like agent output should be presented in a `chat-ui` surface.

- [ ] **Step 3: Write `guardrails.md`**

Document UI/product guardrail patterns such as confirmations, visible tool traces, and risky action handling.

- [ ] **Step 4: Write `mcp-integration.md`**

Explain MCP-backed tool activity from the frontend-display point of view rather than backend server implementation.

## Chunk 2: New Integration And Advanced Guides

### Task 3: Add the integration guides

**Files:**
- Create: `docs/guide/auth-and-headers.md`
- Create: `docs/guide/router-sync.md`
- Create: `docs/guide/custom-layout-composition.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Write `auth-and-headers.md`**

Cover `authorization`, `headers`, bearer token patterns, tenant headers, and token-forwarding cautions.

- [ ] **Step 2: Write `router-sync.md`**

Document route-param conversation IDs, URL synchronization, deep linking, and browser-history behavior.

- [ ] **Step 3: Write `custom-layout-composition.md`**

Show how to compose `useChat`, `useChatHistory`, `ChatHistory`, `ChatMessageList`, and `ChatInput` into a custom shell using real exports only.

### Task 4: Add the operational guides

**Files:**
- Create: `docs/guide/limits-and-tokens.md`
- Create: `docs/guide/debugging-tracing.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Write `limits-and-tokens.md`**

Cover long messages, long histories, large tool payloads, files, and the UI implications of response/token limits.

- [ ] **Step 2: Write `debugging-tracing.md`**

Replace the thin debugging guide with actionable diagnostics for layout, auth, streaming, history, and tool-call issues.

## Chunk 3: Deepen Existing Integration Pages And Verify

### Task 5: Expand the existing integration pages

**Files:**
- Modify: `docs/guide/nextjs.md`
- Modify: `docs/guide/vite.md`
- Modify: `docs/guide/agent-server.md`
- Modify: `docs/guide/state-management.md`
- Modify: `docs/guide/tool-calls.md`
- Modify: `docs/guide/faq.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Expand `nextjs.md`**

Add App Router guidance, route-based conversations, token forwarding patterns, and links into auth/router docs.

- [ ] **Step 2: Expand `vite.md`**

Add proxy guidance, environment strategy, auth/header wiring, and React Router conversation notes.

- [ ] **Step 3: Expand `agent-server.md`**

Strengthen the frontend/backend boundary explanation and route into MCP, auth, history, and tool-rendering expectations.

- [ ] **Step 4: Expand `state-management.md`**

Tie the page more explicitly to runtime profiles and custom composition.

- [ ] **Step 5: Expand `tool-calls.md` and `faq.md`**

Cross-link the new pages and tighten the guide surface so the new topics are discoverable.

### Task 6: Run final verification and editorial review

**Files:**
- Verify: `npm run docs:build`
- Review: `docs/.vitepress/config.mts`
- Review: `docs/guide/runtime-profiles.md`
- Review: `docs/guide/structured-output.md`
- Review: `docs/guide/guardrails.md`
- Review: `docs/guide/mcp-integration.md`
- Review: `docs/guide/auth-and-headers.md`
- Review: `docs/guide/router-sync.md`
- Review: `docs/guide/custom-layout-composition.md`
- Review: `docs/guide/limits-and-tokens.md`
- Review: `docs/guide/debugging-tracing.md`
- Review: `docs/guide/nextjs.md`
- Review: `docs/guide/vite.md`
- Review: `docs/guide/agent-server.md`
- Review: `docs/guide/state-management.md`
- Review: `docs/guide/tool-calls.md`
- Review: `docs/guide/faq.md`

- [ ] **Step 1: Build the docs**

Run: `npm run docs:build`
Expected: build completes without broken links or markdown parsing errors.

- [ ] **Step 2: Review topic boundaries**

Check that the new guides stay `chat-ui`-focused and do not drift into backend-platform documentation.

- [ ] **Step 3: Review navigation coherence**

Make sure the sidebar sequence and cross-links feel intentional rather than repetitive.
