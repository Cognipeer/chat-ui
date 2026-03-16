# Chat UI Docs Depth Refresh Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the decorative docs home hero image and deepen the key documentation entry pages without bloating the docs set.

**Architecture:** Keep the current VitePress site structure and URLs intact while rewriting selected markdown entry pages into stronger navigation and decision-support surfaces. The implementation is content-first: change frontmatter and markdown structure in place, then verify with the docs build and targeted content review.

**Tech Stack:** VitePress, Markdown, existing `docs/` content tree, npm docs build

---

## Chunk 1: Home Page And API Entry Refresh

### Task 1: Rewrite the docs landing page

**Files:**
- Modify: `docs/index.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Remove the home hero image from frontmatter**

Delete the `hero.image` block from `docs/index.md` and keep the existing hero title and actions.

- [ ] **Step 2: Expand the landing page below the hero**

Add concise sections for:
- start-here reading order
- integration path selection (`Chat`, `ChatMinimal`, hooks)
- docs map or what-you-can-build guidance
- production readiness checklist

- [ ] **Step 3: Review the page for scanability**

Keep sections short, remove repeated phrasing, and make sure the page still reads like a technical product manual rather than marketing copy.

### Task 2: Turn the API overview into a real entry page

**Files:**
- Modify: `docs/api/README.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Add reader-orientation content**

Add a short introduction that explains when to start with the API reference instead of the guide.

- [ ] **Step 2: Add task-based navigation**

Introduce a compact map for component-first consumers, hook-first consumers, and type/client readers.

- [ ] **Step 3: Keep the page concise**

Make sure the API overview stays an index page, not a duplicate of the lower-level API docs.

## Chunk 2: Strengthen The Guide Entry Pages

### Task 3: Expand getting started into a stronger integration guide

**Files:**
- Modify: `docs/guide/getting-started.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Add orientation and prerequisites**

Explain when to read the page, clarify backend expectations, and keep installation as the fast path.

- [ ] **Step 2: Add product decisions**

Add a short comparison for `Chat` versus `ChatMinimal` and a recommended first-integration sequence.

- [ ] **Step 3: Add startup troubleshooting**

Cover container sizing and initial integration pitfalls without turning the page into a long FAQ.

### Task 4: Replace the core concepts stub with real conceptual guidance

**Files:**
- Modify: `docs/guide/core-concepts.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Add core mental models**

Document messages, conversations, sessions, streaming, and integration boundaries at a high level.

- [ ] **Step 2: Add navigation to deeper docs**

Link to the most relevant detailed docs so the page becomes a useful conceptual hub.

- [ ] **Step 3: Remove dead-end stub behavior**

Make sure the page stands on its own and no longer feels like a redirect placeholder.

### Task 5: Replace the architecture stub with a practical architecture guide

**Files:**
- Modify: `docs/guide/architecture.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Add system-layer overview**

Describe components, hooks, providers, the client layer, and theming primitives.

- [ ] **Step 2: Add runtime data flow**

Explain the path from user input to agent response rendering and where customization fits.

- [ ] **Step 3: Add extension-boundary guidance**

Clarify which parts are best customized through props, composition, hooks, or CSS/theme primitives.

## Chunk 3: Deepen Feature Guides And Verify The Site

### Task 6: Expand theming guidance

**Files:**
- Modify: `docs/guide/theming.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Add theming decision guidance**

Explain when to use `theme`, `themeColors`, provider-based theming, and CSS variables.

- [ ] **Step 2: Add practical override strategy**

Document a recommended override order and a short branding workflow.

- [ ] **Step 3: Add common mistakes**

Call out brittle selectors, inconsistent token overrides, and over-customization risks.

### Task 7: Expand tool-calls guidance

**Files:**
- Modify: `docs/guide/tool-calls.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Add lifecycle explanation**

Describe how tool calls move from pending to resolved UI and how the built-in renderer behaves.

- [ ] **Step 2: Add renderer decision guidance**

Explain when the default renderer is enough and when a custom renderer is justified.

- [ ] **Step 3: Add safer rendering notes**

Cover argument/result inspection patterns, JSON parsing risks, and operator-facing use cases.

### Task 8: Expand history guidance

**Files:**
- Modify: `docs/guide/history.md`
- Verify: `npm run docs:build`

- [ ] **Step 1: Add integration decision guidance**

Explain when built-in history is enough and when teams should build a custom sidebar or layout.

- [ ] **Step 2: Add operational flow guidance**

Document conversation selection, creation, deletion, URL sync, and pagination expectations.

- [ ] **Step 3: Keep examples scoped**

Keep the existing examples useful while reducing the chance that the page turns into a kitchen-sink reference.

### Task 9: Run full verification and content review

**Files:**
- Verify: `npm run docs:build`
- Review: `docs/index.md`
- Review: `docs/api/README.md`
- Review: `docs/guide/getting-started.md`
- Review: `docs/guide/core-concepts.md`
- Review: `docs/guide/architecture.md`
- Review: `docs/guide/theming.md`
- Review: `docs/guide/tool-calls.md`
- Review: `docs/guide/history.md`

- [ ] **Step 1: Build the docs site**

Run: `npm run docs:build`
Expected: build completes without markdown, theme, or link-resolution errors.

- [ ] **Step 2: Review touched pages for duplication and tone**

Check that each page has a clear job, limited repetition, and direct next-step links.

- [ ] **Step 3: Review the home page result**

Confirm the hero image is gone and the page still feels balanced and easy to scan.
