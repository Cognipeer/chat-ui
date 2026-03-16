# Chat UI Docs Theme Alignment Design

## Summary

Move the `chat-ui` documentation shell to the same VitePress presentation model used by `agent-sdk` while preserving the existing `chat-ui` docs content tree and page URLs.

The visual target is:

- the same docs chrome and placements as `agent-sdk`
- the same turquoise palette used by `agent-sdk`
- `chat-ui` branding in place of `agent-sdk` branding
- the existing `chat-ui` guide, API, component, and example content preserved

## Goals

- Keep the current documentation information architecture intact.
- Match `agent-sdk` navbar, hero, feature-card, sidebar, pager, footer, and typography behavior.
- Reuse the existing `ChatUI.svg` asset as the visible `chat-ui` brand logo.
- Keep the docs build on VitePress.

## Non-Goals

- Rewriting the technical content across the markdown pages.
- Changing the docs URL structure.
- Introducing a shared cross-repo docs theme package.
- Changing the library code or runtime behavior of `@cognipeer/chat-ui`.

## Current State

`chat-ui` already ships docs through VitePress via `docs/.vitepress/config.mts`, but the current presentation is closer to the default VitePress theme with project-specific nav/sidebar config and a simpler home page.

`agent-sdk` also uses VitePress, but it adds a custom theme layer through:

- a theme entry file that extends `vitepress/theme-without-fonts`
- a custom stylesheet that defines the turquoise design tokens and layout polish
- a more product-led home page layout and copy structure

The visible gap between the two docs sites is therefore mostly in the VitePress theme layer, not in the markdown content itself.

## Design

### 1. Theme Shell Migration

Copy the `agent-sdk` VitePress theme structure into `chat-ui` and adapt it to `chat-ui` paths and branding:

- add `docs/.vitepress/theme/index.ts`
- add `docs/.vitepress/theme/custom.css`
- update `docs/.vitepress/config.mts` to use the same core theme settings as `agent-sdk`

The `chat-ui` docs will adopt:

- `appearance: false`
- the same Lexend Deca font loading
- the same turquoise color token system
- the same navbar, hero, feature card, code block, table, sidebar, pager, and footer styling rules

This preserves the VitePress stack already used in the repo and avoids a higher-risk migration to another docs engine.

### 2. Branding Adaptation

The docs shell will follow `agent-sdk` placement rules, but the brand surface will remain `chat-ui`.

Branding rules:

- nav logo uses `ChatUI.svg`
- home hero image also uses `ChatUI.svg`
- site title and Open Graph labels use `Chat UI`
- footer copy references `Chat UI` instead of `Agent SDK`

The turquoise palette remains intentionally identical to `agent-sdk`, even though the `ChatUI.svg` artwork is visually different. This is an explicit product direction, not a visual accident.

### 3. Navigation And Content Preservation

The existing `chat-ui` content structure stays intact:

- `guide`
- `components`
- `api`
- `examples`

Existing markdown files remain the source of truth. The sidebar map in `docs/.vitepress/config.mts` stays aligned to the current `chat-ui` information architecture rather than adopting the `agent-sdk` section names.

The top nav will be normalized to the `agent-sdk` layout style, but the link destinations stay `chat-ui`-specific.

### 4. Home Page Realignment

`docs/index.md` will be rewritten to use the `agent-sdk` home-page composition:

- stronger product-style hero copy
- two primary CTAs in the same placement style
- feature cards with more serious titles and descriptions
- concise "Start Here" and "Quick Start" sections

The content will still describe `chat-ui`, not `agent-sdk`.

## Files Expected To Change

- `docs/.vitepress/config.mts`
- `docs/.vitepress/theme/index.ts`
- `docs/.vitepress/theme/custom.css`
- `docs/.vitepress/public/ChatUI.svg`
- `docs/.vitepress/public/logo.svg`
- `docs/.vitepress/public/favicon.svg`
- `docs/index.md`
- `docs/contributing.md`

## Risks

### Asset mismatch

`ChatUI.svg` is currently untracked in the workspace and must be copied into the docs public assets so VitePress can serve it reliably.

### Visual mismatch between logo and palette

The `chat-ui` logo is not turquoise-led, so the final result will be a mixed-brand treatment: `chat-ui` logo with `agent-sdk` shell colors. This is expected per the approved direction.

### Path regressions

Logo and favicon references must respect the `/chat-ui/` VitePress base path during build output.

## Verification

- Run `npm run docs:build`
- Confirm the build succeeds without missing asset or theme import errors
- Verify the generated docs use the custom theme shell, especially:
  - navbar title/logo placement
  - hero layout
  - feature-card appearance
  - sidebar active-state styling
  - footer tone and copy

## Implementation Boundary

This work is limited to the docs presentation layer and docs branding assets. It should not alter package exports, component logic, or runtime code in `src/`.
