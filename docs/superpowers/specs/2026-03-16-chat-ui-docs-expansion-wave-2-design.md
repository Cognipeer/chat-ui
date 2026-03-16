# Chat UI Docs Expansion Wave 2 Design

Date: 2026-03-16
Status: Approved for planning

## Summary

Expand the `chat-ui` documentation from a solid getting-started surface into a more complete integration manual for real product teams. This wave adds targeted guide pages for authentication, router synchronization, custom layout composition, runtime profiles, guardrails, structured output, MCP integration, limits, and debugging/tracing, while also deepening the existing integration pages so the new material fits naturally into the docs tree.

The goal is broader practical coverage without turning `chat-ui` docs into a generic agent-platform manual. New topics must stay UI- and integration-oriented.

## Goals

- Add high-value guide pages for common production integration concerns.
- Reorganize the guide sidebar so the docs feel more intentional and discoverable.
- Deepen the existing integration pages so they route naturally into the new guides.
- Adapt selected headings from the other docs set only where they make sense for `chat-ui`.
- Keep the focus on frontend integration, UI behavior, and backend contract expectations.

## Non-Goals

- Do not document agent orchestration concepts that belong to backend or platform docs.
- Do not add autonomous-agent planning guidance.
- Do not add backend-first tool authoring documentation.
- Do not turn the docs into an exhaustive architecture handbook for the whole Cognipeer stack.

## Why This Wave Is Needed

The first refresh improved the top-level guide quality, but the docs still have major gaps for teams doing real integration work:

1. Authentication and custom headers are present in scattered examples, but not explained as a first-class integration topic.
2. Route-driven conversations and URL synchronization appear in fragments, but not as a coherent pattern.
3. Teams wanting a custom product shell still have to infer the right hook/component composition model.
4. Topics like runtime profile choice, structured output handling, guardrails, and operational debugging are missing as standalone concepts.
5. The guide sidebar still reflects a narrower documentation set than the product now warrants.

## Scope

### 1. Sidebar and Information Architecture Update

File:
- `docs/.vitepress/config.mts`

Update the `/guide/` sidebar to a richer structure inspired by the approved external docs taxonomy, but adapted to `chat-ui`.

Target structure:

#### Introduction
- `Getting Started`
- `Installation`
- `Core Concepts`
- `Architecture`

#### Features
- `Runtime Profiles`
- `State Management`
- `Theming`
- `Streaming`
- `File Uploads`
- `Tool Calls`
- `Structured Output`
- `Guardrails`
- `History Sidebar`
- `MCP Integration`
- `Custom Actions`

#### Integration
- `Auth & Headers`
- `Router Sync`
- `Custom Layout Composition`
- `Next.js`
- `Vite`
- `Agent Server`

#### Advanced
- `Limits & Tokens`
- `Debugging & Tracing`
- `FAQ`

Constraints:
- Keep URL style consistent with current docs.
- Preserve existing pages and paths where possible.
- Only add new pages that have a clear `chat-ui` job.

### 2. New Guide Pages

Create the following new pages.

#### `docs/guide/runtime-profiles.md`

Purpose:
- Help readers choose between `Chat`, `ChatMinimal`, hook-driven composition, and provider-based composition.

Content:
- Decision matrix
- Typical product scenarios
- Trade-offs around speed, control, and maintenance
- Links to state management and custom layout docs

#### `docs/guide/structured-output.md`

Purpose:
- Explain how structured or schema-shaped agent output should be surfaced in a `chat-ui` product.

Content:
- When plain message rendering is enough
- When to render dedicated UI blocks beside or below assistant messages
- Guidance for JSON-like result summaries
- Relationship to tool-call traces and custom composition

Constraint:
- Keep the focus on presentation patterns, not LLM schema design.

#### `docs/guide/guardrails.md`

Purpose:
- Describe frontend trust and safety patterns for actions and assistant workflows.

Content:
- Confirmation flows for risky actions
- Visibility of tool steps and system behavior
- Designing user trust with operator-facing traces
- When to expose versus hide internal detail

Constraint:
- Guardrails here mean UI and product interaction guardrails, not model policy internals.

#### `docs/guide/mcp-integration.md`

Purpose:
- Explain how MCP-style tools and external tool ecosystems map into `chat-ui` rendering patterns.

Content:
- MCP integration as a backend concern with frontend display implications
- Rendering expectations for tool calls, long-running tools, and results
- When built-in tool rendering is enough
- When to move to custom panels or workflows

Constraint:
- Do not describe how to build an MCP server. Focus on how MCP-backed tool activity should appear in the UI.

#### `docs/guide/auth-and-headers.md`

Purpose:
- Make authentication and request header patterns a first-class integration topic.

Content:
- `authorization` prop usage
- `headers` prop usage
- bearer tokens, tenant headers, and session forwarding
- server-to-client token passing patterns in Next.js and similar stacks
- practical caution points around token lifetime and browser exposure

#### `docs/guide/router-sync.md`

Purpose:
- Document URL synchronization for conversation-driven apps.

Content:
- route param driven `conversationId`
- syncing selection to the URL
- deep links and browser history
- when to use built-in `Chat` versus custom composition for router-heavy apps

#### `docs/guide/custom-layout-composition.md`

Purpose:
- Show how to assemble a custom product shell from hooks and lower-level components.

Content:
- `useChat`
- `useChatHistory`
- `ChatHistory`
- `ChatMessageList`
- `ChatInput`
- optional provider usage
- recommended layout patterns

Constraint:
- Use real exported APIs only.

#### `docs/guide/limits-and-tokens.md`

Purpose:
- Explain practical rendering and integration limits that matter in UI work.

Content:
- long messages
- long histories
- large tool payloads
- large file attachments
- user-facing implications of token and response length limits

Constraint:
- Explain operational behavior and UI design implications, not model internals.

#### `docs/guide/debugging-tracing.md`

Purpose:
- Replace the current thin debugging stub with actionable integration diagnostics.

Content:
- network failures
- auth failures
- missing height/layout issues
- stream interruption symptoms
- history desynchronization
- tool-call rendering diagnostics
- tracing what the host app should log

### 3. Existing Page Expansion

Deepen the current pages so the new content feels connected rather than bolted on.

#### `docs/guide/nextjs.md`

Add:
- stronger guidance for App Router usage
- token forwarding patterns
- route-based conversation sync
- server/client boundary notes
- links to auth and router-sync guides

#### `docs/guide/vite.md`

Add:
- proxy patterns
- environment variable strategy
- auth/header wiring
- React Router conversation routing notes
- links to auth and router-sync guides

#### `docs/guide/agent-server.md`

Add:
- clearer explanation of frontend/backend responsibility boundaries
- routing into auth, MCP integration, tool rendering, and history expectations
- guidance for multi-agent and custom header setups

#### `docs/guide/state-management.md`

Add:
- explicit ties to runtime profiles
- stronger guidance on when to use `ChatProvider`
- links to custom layout composition and router sync

#### `docs/guide/tool-calls.md`

Add:
- links to structured output, guardrails, and MCP integration
- clearer separation between built-in inline rendering and operator-facing custom layouts

#### `docs/guide/faq.md`

Either deepen the guide page itself or ensure it routes more cleanly into the fuller FAQ section.

### 4. Topic Mapping From The Other Docs Set

Approved mappings:

- `Runtime Profiles` → yes, directly adapted for `chat-ui`
- `Guardrails` → yes, adapted as UI/product guardrails
- `Structured Output` → yes, adapted as rendering/presentation guidance
- `MCP Integration` → yes, adapted as frontend display and integration-boundary guidance
- `Limits & Tokens` → yes, adapted as UI and operational guidance
- `Debugging & Tracing` → yes, adapted as frontend integration diagnostics

Rejected mappings:

- `Planning for Autonomous Agents`
- `Summarization & Context`
- `Tool Development`
- `Tool Approvals`

Reason:
- These topics are either too backend/platform-specific or become artificial when forced into a UI-library documentation set.

## Content Strategy

- Prefer practical integration scenarios over abstract theory.
- Keep each page tightly scoped to one reader problem.
- Link between pages instead of duplicating long explanations.
- Use short, realistic code samples grounded in actual exported APIs.
- Preserve the docs tone established in the first refresh: technical, product-aware, but not bloated.

## Risks

1. The guide section could become noisy if too many adjacent pages overlap.
2. Imported headings from another docs set could feel forced if not properly adapted.
3. New pages could accidentally drift into backend or agent-platform documentation.

## Mitigations

- Give each new page a strict `chat-ui` responsibility.
- Cross-link rather than re-explaining the same topic.
- Reject any section that cannot be justified from a frontend integration point of view.

## Validation Plan

- Run `npm run docs:build` after the changes.
- Review the guide sidebar in the built site to confirm the new grouping feels coherent.
- Spot-check all new pages for API accuracy and topic boundaries.
- Verify that links between old and new pages work cleanly.

## Implementation Boundary

This wave is documentation-only. It may update the VitePress sidebar config and markdown pages, but it must not change library runtime code or exported TypeScript APIs.
