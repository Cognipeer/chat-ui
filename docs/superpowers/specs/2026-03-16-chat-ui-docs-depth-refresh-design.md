# Chat UI Docs Depth Refresh Design

Date: 2026-03-16
Status: Approved for planning

## Summary

Refresh the documentation site so it reads as a stronger product manual instead of a thin reference shell. Remove the home hero illustration, strengthen the docs landing page, and deepen the highest-traffic guide pages with practical decision support, integration guidance, and scoped examples.

The target outcome is broader coverage without turning the docs into a bloated knowledge base. Readers should get more context, clearer next steps, and fewer dead-end stub pages while the current information architecture stays mostly intact.

## Goals

- Remove the visual image from the docs home hero.
- Make the docs home page more content-led and more useful as an entry point.
- Expand core guide pages so they help users choose the right integration path faster.
- Replace thin redirect-style pages with concise but real documentation content.
- Keep the navigation structure recognizable and avoid over-growing the site.

## Non-Goals

- No full rewrite of the VitePress theme or navigation model.
- No large-scale addition of brand-new guide sections.
- No exhaustive API duplication across guide pages and reference pages.
- No visual redesign beyond the changes needed after removing the hero image.

## Audience

- Engineers integrating `@cognipeer/chat-ui` for the first time.
- Teams deciding between full `Chat`, `ChatMinimal`, and lower-level hooks.
- Engineers customizing theming, history, and tool-call behavior for production apps.

## Problems in the Current Docs

1. The home page still spends valuable space on a decorative hero image instead of content.
2. Several guide pages are too thin and push readers into other sections before giving enough orientation.
3. The docs do not consistently explain when to use one surface or API over another.
4. The current flow is serviceable for someone already familiar with the library, but weak for a new integrator trying to make product decisions quickly.

## Proposed Approach

Use a balanced documentation refresh focused on the existing entry points people are most likely to visit first. Add depth where it unlocks faster understanding and better implementation decisions, but avoid repeating reference content or creating sprawling long-form guides.

## Scope

### 1. Home Page Refresh

File:
- `docs/index.md`

Changes:
- Remove the `hero.image` block entirely.
- Keep the hero headline, CTA structure, and product framing.
- Expand the page below the hero with clearer entry content.

New or expanded sections:
- A stronger "Start Here" flow that tells users what to read first.
- An "Integration Paths" section describing when to use `Chat`, `ChatMinimal`, or hook-based composition.
- A short "What You Can Build" or "Docs Map" section that routes readers to key topics.
- A concise production readiness checklist that links out to theming, history, tool calls, and uploads.

Constraints:
- Avoid marketing-heavy language.
- Keep the page easy to scan.
- Do not replace the removed image with another decorative asset.

### 2. Guide Page Depth Expansion

Files:
- `docs/guide/getting-started.md`
- `docs/guide/core-concepts.md`
- `docs/guide/architecture.md`
- `docs/guide/theming.md`
- `docs/guide/tool-calls.md`
- `docs/guide/history.md`

Principle:
- Each page should answer "what is this", "when should I care", and "what should I do next" before diving into examples.

#### Getting Started

Add:
- A short "When to read this page" section.
- A clearer backend expectation note for compatible agent-server behavior.
- A decision point between `Chat` and `ChatMinimal`.
- A recommended sequence for first integration steps after installation.
- A short troubleshooting section for container sizing and initial setup issues.

#### Core Concepts

Current issue:
- The page is effectively a redirect stub.

Add:
- Message model overview.
- Conversation and session mental model.
- Streaming lifecycle summary.
- Controlled versus built-in behavior boundaries.
- A short map to related deeper docs.

#### Architecture

Current issue:
- The page is also a thin redirect.

Add:
- A concise system-layer overview covering components, hooks, providers, client, and theme primitives.
- A typical runtime data flow from user input to rendered agent response.
- A section on customization boundaries and extension points.
- A short "how to reason about the library" framing for integrators.

#### Theming

Keep:
- Existing mode and color examples.

Add:
- Guidance on when to use `theme`, `themeColors`, provider-based theming, or CSS variables.
- A recommended override order to avoid brittle styling.
- A short branding strategy section for adapting the UI to an existing product.
- A small "common mistakes" section covering over-scoped selectors and inconsistent token overrides.

#### Tool Calls

Keep:
- Existing examples and callback usage.

Add:
- Tool call lifecycle explanation.
- Guidance on when the default renderer is enough and when to build a custom renderer.
- Safer argument/result rendering guidance, especially around JSON parsing and inspection.
- Practical product use cases such as analytics, observability, and operator-facing workflows.

#### History

Keep:
- Existing sidebar and hook examples.

Add:
- Guidance on when built-in history is sufficient versus when to use custom history UI.
- Notes on URL synchronization and conversation identity.
- Pagination/load-more expectations for longer histories.
- A short operational section on delete/create/select flows and their UX implications.

### 3. API Reference Entry Page Improvement

File:
- `docs/api/README.md`

Changes:
- Turn the page from a flat link list into a real entry page.
- Add a "start here" recommendation for component-first consumers versus hook-first consumers.
- Add a quick map of which API docs to read for common tasks.
- Keep it concise so it does not become duplicate API reference prose.

## Content Strategy Rules

- Favor short explanatory sections over long prose walls.
- Prefer decision support and integration guidance over exhaustive repetition.
- Avoid repeating detailed component prop tables that already belong in reference pages.
- Link outward aggressively when a topic already has a dedicated page.
- Make examples realistic but compact.

## Information Architecture Impact

- Keep the current VitePress nav and sidebar structure unchanged unless a small wording adjustment becomes clearly necessary.
- Do not add new top-level categories.
- Preserve existing URLs so internal links and published docs paths remain stable.

## Risks

1. Guide pages could become repetitive if conceptual content is copied from reference docs.
2. The home page could become too dense if too many sections are added under the hero.
3. Thin pages might be improved unevenly if the added depth is not guided by reader tasks.

## Mitigations

- Treat each touched page as having a single job.
- Keep home page additions short and route deeper reading into the guide.
- Add sections only when they answer a concrete reader question.

## Validation Plan

- Run the docs build or equivalent verification command after edits.
- Check for broken links, markdown issues, and malformed code fences.
- Review the home page output to confirm the hero image is gone and the layout still reads cleanly.
- Spot-check touched guide pages for repeated content and dead-end sections.

## Implementation Notes

- This is a documentation/content task, so the main risk is clarity rather than runtime behavior.
- Content depth should increase through structure and guidance, not by padding paragraphs.
- Existing user changes in the repo should be left untouched unless directly required by this work.
