# Embedding the Chat

`EmbedChat` is `Chat` for a page that is shown inside another page (an `iframe`) and signed in with an identity token **the host page's server signs**. It is how an intranet, an ERP or a SaaS product puts an assistant in its own page without a second login.

```
host page (https://app.example.com)                 iframe (https://console.example.com/p/support/embed)
  server mints a short-lived signed token                 loads, posts   { type: "cp:ready" }       ───►
  ◄─── { type: "cp:token_request" } / cp:ready
  ───► { type: "cp:auth", token }                          POST /api/portal/support/embed/session { token }
                                                           ◄── { sessionToken, expiresAt, user }
                                                           chat requests carry  Authorization: Bearer cp_es_...
```

## Why a bearer token and not cookies

Browsers increasingly block or partition cookies for pages inside a frame of another site (Safari does by default). The exchange therefore never uses cookies: the iframe keeps the opaque session token **in memory only** and sends it as `Authorization: Bearer`. Every request is made with `credentials: "omit"`. The host's token is never put in a URL.

## Using it

```tsx
import { EmbedChat } from "@cognipeer/chat-ui";
import "@cognipeer/chat-ui/styles.css";

// the page served at https://console.example.com/p/support/embed?origin=https%3A%2F%2Fapp.example.com
<EmbedChat
  baseUrl="/api/portal/support"                  // the portal's chat API (same origin as the iframe)
  allowedOrigins={["https://app.example.com"]}   // exactly what the portal admin configured
  clientTools={[{ name: "open_ticket", inputSchema: { type: "object", required: ["id"], properties: { id: { type: "number" } } }, timeoutSeconds: 30 }]}
  eventContent="none"                            // "text" also puts message text in the events
  showHistory={false}
  theme="dark"
  wrapChat={(chat, session) => <TermsGate ...>{chat}</TermsGate>}
/>
```

All other `Chat` props (theme, locale, starters, feedback, ...) work as usual. `sessionUrl` defaults to `<baseUrl>/embed/session`; `hostOrigin` defaults to the `origin` query parameter of the page.

## The messages

Every message is `{ type: "cp:...", v: 1, ... }` posted with `window.postMessage`. Both sides ignore anything that is not exactly this shape and version.

| Direction | Type | Fields | Meaning |
| --- | --- | --- | --- |
| iframe → host | `cp:ready` | | The chat loaded and wants a token. Repeated every 500 ms (up to 60 times) until the host answers with `cp:auth` |
| iframe → host | `cp:token_request` | `reason`: `expiring` \| `expired` \| `rejected` | The chat needs a fresh token |
| iframe → host | `cp:event` | `event`, `data` | Something happened (see below) |
| iframe → host | `cp:tool_call` | `callId`, `name`, `args` | The agent calls a tool of the host page |
| host → iframe | `cp:auth` | `token` | A signed identity token (at most 8 KB). Answers `cp:ready` and `cp:token_request`; sending one unasked (`setToken`) is fine |
| host → iframe | `cp:tool_result` | `callId`, `ok`, `output` or `error` | The answer to `cp:tool_call` |
| host → iframe | `cp:prefill` | `text`, `send?` | Put text in the composer; `send: true` sends it |
| host → iframe | `cp:context` | `context` (object ≤ 8 KB, or `null`) | Unsigned UI context, sent as `metadata.uiContext` with `uiContextUntrusted: true` on every message. **Never trust it for authorization** |
| host → iframe | `cp:logout` | | Forget the session and ask the server to revoke it (`DELETE <sessionUrl>` with the bearer token) |

### Origin checks

- The iframe talks to `window.parent` only, with the **declared host origin as the target** (never `*`).
- It starts only if that origin is **exactly** one of `allowedOrigins` (no wildcards, no subdomain matching, scheme and port included), and the page is framed. Where the browser reports `location.ancestorOrigins` (Chromium, Safari), the embedding page must be the declared origin too. Otherwise it shows "This chat can't be shown here" and posts nothing.
- It accepts a message only if `event.source === window.parent` **and** `event.origin` is the declared origin.
- The host side must do the same in the other direction: accept messages only from the iframe's `contentWindow` and the console's origin.

### Events

`cp:event.event` is one of `ready`, `auth:required`, `auth:error`, `conversation:started`, `message:sent`, `message:completed`, `action:required`, `action:resolved`, `limit:reached`, `error` (a widget script adds `open` and `close`). `data` carries ids and sizes; with `eventContent="text"` messages also carry `text` (up to 4000 characters). Examples:

```json
{ "type": "cp:event", "v": 1, "event": "message:completed", "data": { "conversationId": "c1", "messageId": "m2", "length": 412 } }
{ "type": "cp:event", "v": 1, "event": "auth:error", "data": { "code": "identity_not_found", "status": 403, "reference": "ref-42" } }
{ "type": "cp:event", "v": 1, "event": "action:required", "data": { "conversationId": "c1", "actionId": "ap1", "kind": "tool_approval", "tool": "send_email" } }
```

`limit:reached` covers the conversation's usage limit and the codes `rate_limited`, `quota_exceeded`, `too_many_conversations`, `message_too_long`.

## Keeping the session alive

The session lasts as long as the portal's `session.ttlMinutes`. A fifth of its life before it ends (between 5 and 60 seconds) the iframe posts `cp:token_request { reason: "expiring" }`; the host answers with `cp:auth` and the iframe exchanges it again **without remounting the chat**. If no answer comes, it asks again. If the session ends anyway the chat shows "Session expired" with a Reconnect button, posts `reason: "expired"`, and recovers by itself when a token arrives. A `401` from the chat API triggers one renewal (`reason: "rejected"`) and one retry of the request.

## Tools of the host page

An administrator declares the tools the agent may call on the host page (`clientTools`). When the agent calls one, the turn pauses as a `client_tool` action. The iframe draws **no card**: it validates the arguments against the declared schema and posts `cp:tool_call`. The host replies with `cp:tool_result`; the iframe answers the action with `{ type: "client_tool", output }` (JSON, at most 64 KB) and the turn continues. A tool that is not declared, arguments that do not fit the schema, a host that does not answer within `timeoutSeconds` (default 60, at most 600), or an answer that is not JSON / too large, all end as an error result for the agent (`{ type: "client_tool", error, output: { error } }`) instead of hanging the turn.

## A minimal host

```html
<iframe id="cp" src="https://console.example.com/p/support/embed?origin=https%3A%2F%2Fapp.example.com" allow="clipboard-write"></iframe>
<script>
  const CONSOLE = "https://console.example.com";
  const frame = document.getElementById("cp");
  async function getToken() { return (await fetch("/api/cognipeer-token", { credentials: "include" })).text(); } // your server signs it
  const tools = { open_ticket: async ({ id }) => { location.hash = `#/tickets/${id}`; return { opened: id }; } };

  window.addEventListener("message", async (event) => {
    if (event.origin !== CONSOLE || event.source !== frame.contentWindow) return;
    const m = event.data;
    if (!m || m.v !== 1) return;
    const reply = (msg) => frame.contentWindow.postMessage({ v: 1, ...msg }, CONSOLE);
    if (m.type === "cp:ready" || m.type === "cp:token_request") reply({ type: "cp:auth", token: await getToken() });
    if (m.type === "cp:tool_call") {
      try { reply({ type: "cp:tool_result", callId: m.callId, ok: true, output: await tools[m.name](m.args) }); }
      catch (e) { reply({ type: "cp:tool_result", callId: m.callId, ok: false, error: String(e.message || e) }); }
    }
    if (m.type === "cp:event") console.log(m.event, m.data);
  });
</script>
```

The portal's script (`CognipeerPortal.mount`) does all of this, and adds a floating bubble, an inline mode and `open()` / `close()` / `prefill()` / `logout()`; see the portal's own embedding guide for minting the token on your server.

## The session endpoints Chat UI expects

| Request | Answer |
| --- | --- |
| `POST <sessionUrl> { token }` (no cookies) | `200 { sessionToken, expiresAt, user?: { name, email } }`; `expiresAt` as an ISO date or epoch seconds / milliseconds. A refusal is `4xx { error: { code, message, reference } }`; the code and reference are shown to the person |
| `DELETE <sessionUrl>` with `Authorization: Bearer` | Revokes the session (best effort; failure is ignored) |
| Any chat API request with `Authorization: Bearer <sessionToken>` | As for a signed-in person; `401` asks for a renewal |

## Safety notes

- The host's token goes from `postMessage` to one `POST`; it is never stored and never in a URL.
- A malicious page that frames the chat cannot read the session: the iframe refuses to talk unless its declared origin is allowed *and* is the embedding page, and the server must send `frame-ancestors` for the allowed origins only.
- The arguments of `cp:tool_call` were written by the model. Treat them like any untrusted input in your tool handlers (check types and ranges, never build code or queries from them), and let a tool that changes things ask the person first (the portal can mark a tool as needing approval).
- `cp:context` is the host page's claim about itself; the signed claim in the token (`ctx`) is the one the server can trust.
