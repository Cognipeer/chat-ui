import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatMessageList } from "./ChatMessageList";
import { ChatMessage } from "./ChatMessage";
import { PlanCard } from "./PlanCard";
import { ChatAppearanceProvider, type ChatAppearance } from "./appearance";
import { activityItems, buildTurnBlocks } from "./TurnActivity";
import type { ActivityEntry, Message, PlanSnapshot } from "../../types";

afterEach(cleanup);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key);
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 15, 12, 0, seconds));
const msg = (id: string, partial: Partial<Message> = {}): Message => ({
  id,
  conversationId: "c",
  role: "assistant",
  content: "",
  createdAt: at(0),
  updatedAt: at(0),
  ...partial,
});
const withAppearance = (appearance: ChatAppearance, ui: ReactElement) => (
  <ChatI18nProvider locale="en">
    <ChatAppearanceProvider value={appearance}>{ui}</ChatAppearanceProvider>
  </ChatI18nProvider>
);

const plan = (...statuses: PlanSnapshot["steps"][number]["status"][]): PlanSnapshot => ({
  steps: statuses.map((status, i) => ({ id: i + 1, title: `Step ${i + 1}`, status })),
});

const activity: ActivityEntry[] = [
  { kind: "tool", id: "c1", name: "lookup_customer", label: "Look up customer", status: "ok" },
  { kind: "plan", version: 1, done: 0, total: 5, created: true },
  { kind: "tool", id: "c2", name: "web_search", status: "ok" },
  { kind: "plan", version: 2, done: 2, total: 5 },
  { kind: "compaction", id: "k1" },
  { kind: "tool", id: "c3", name: "issue_refund", status: "error" },
  { kind: "plan", version: 3, done: 5, total: 5 },
];

describe("PlanCard", () => {
  it("live: open, with progress, a bar, the step in progress marked and every status named", () => {
    render(
      <ChatI18nProvider locale="en">
        <PlanCard plan={plan("completed", "in-progress", "blocked", "not-started")} live />
      </ChatI18nProvider>
    );
    expect(screen.getByText("Plan")).toBeTruthy();
    expect(screen.getByText("1 of 4")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("4");
    const items = within(screen.getByRole("list", { name: "Plan steps" })).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[1]!.getAttribute("aria-current")).toBe("step");
    expect(items[1]!.textContent).toContain("In progress");
    expect(items[0]!.textContent).toContain("Completed");
    expect(items[2]!.textContent).toContain("Blocked");
    expect(items[3]!.textContent).toContain("Not started");
    expect(screen.getByText("Step 2").className).toContain("font-semibold");
    expect(screen.getByRole("button", { name: "Collapse plan" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("folds away and opens again with the chevron", () => {
    render(
      <ChatI18nProvider locale="en">
        <PlanCard plan={plan("in-progress")} live />
      </ChatI18nProvider>
    );
    const list = document.querySelector("[data-chat-plan] ol") as HTMLElement;
    expect(list.hidden).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Collapse plan" }));
    expect(list.hidden).toBe(true);
    const expand = screen.getByRole("button", { name: "Expand plan" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expand);
    expect(list.hidden).toBe(false);
  });

  it("finished and complete: folded, with its verdict instead of a bar", () => {
    render(
      <ChatI18nProvider locale="en">
        <PlanCard plan={plan("completed", "completed", "completed")} />
      </ChatI18nProvider>
    );
    expect(screen.getByText("3 of 3 done")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect((document.querySelector("[data-chat-plan] ol") as HTMLElement).hidden).toBe(true);
    expect(screen.getByRole("button", { name: "Expand plan" })).toBeTruthy();
  });

  it("finished but not complete: open", () => {
    render(
      <ChatI18nProvider locale="en">
        <PlanCard plan={plan("completed", "blocked")} />
      </ChatI18nProvider>
    );
    expect((document.querySelector("[data-chat-plan] ol") as HTMLElement).hidden).toBe(false);
    expect(screen.getByText("1 of 2")).toBeTruthy();
  });
});

describe("activityItems with a recorded order", () => {
  it("lists calls, plan changes and condensing passes as they happened", () => {
    const message = msg("a1", {
      content: "Done",
      metadata: {
        activity,
        toolCallDetails: [
          { id: "c1", name: "lookup_customer", args: { query: "Ayse" } },
          { id: "c2", name: "web_search", args: { query: "refund policy" } },
          { id: "c3", name: "issue_refund", args: {} },
        ],
      },
    });
    const items = activityItems([message], t);
    expect(items.map((i) => i.kind)).toEqual(["tool", "plan", "tool", "plan", "compaction", "tool", "plan"]);
    expect(items[0]).toMatchObject({ label: "Look up customer", detail: "“Ayse”" });
    expect(items[1]).toMatchObject({ label: "chat.activity.planCreated", detail: 'chat.activity.steps {"count":5}' });
    expect(items[2]).toMatchObject({ label: "Web Search", detail: "“refund policy”" });
    expect(items[3]).toMatchObject({ label: "chat.activity.planUpdated", detail: 'chat.plan.progress {"done":2,"total":5}' });
    expect(items[4]).toMatchObject({ kind: "compaction", label: "chat.activity.condensed" });
    expect(items[6]).toMatchObject({ kind: "plan", label: "chat.activity.planUpdated" });
  });

  it("a recorded call with no stored details stands alone, and stored calls the record lacks follow it", () => {
    const message = msg("a1", {
      metadata: {
        activity: [{ kind: "tool", id: "x", name: "billing_check" }],
        toolCallDetails: [{ id: "other", name: "web_search", args: {} }],
      },
    });
    const items = activityItems([message], t);
    expect(items.map((i) => (i.kind === "tool" ? i.label : i.kind))).toEqual(["Billing Check", "Web Search"]);
  });

  it("falls back to the fixed order (calls, then thinking) when nothing was recorded", () => {
    const message = msg("a1", { reasoning: "hmm", metadata: { toolCallDetails: [{ id: "c1", name: "web_search", args: {} }] } });
    expect(activityItems([message], t).map((i) => i.kind)).toEqual(["tool", "thinking"]);
    const unreadable = msg("a2", { reasoning: "hmm", metadata: { activity: [{ kind: "nope" }], toolCallDetails: [{ id: "c1", name: "web_search", args: {} }] } });
    expect(activityItems([unreadable], t).map((i) => i.kind)).toEqual(["tool", "thinking"]);
  });

  it("answered approvals still follow the ordered entries", () => {
    const message = msg("a1", {
      metadata: { activity: [{ kind: "tool", id: "c1", name: "deploy" }] },
      pendingActions: [{ id: "p1", type: "tool_approval", toolName: "deploy", args: {} }],
      actionStates: { p1: { status: "resolved", resolution: { type: "tool_approval", decision: "allow" } } },
    });
    expect(activityItems([message], t).map((i) => i.kind)).toEqual(["tool", "action"]);
  });
});

describe("buildTurnBlocks with a plan", () => {
  it("carries the newest plan of the turn on its activity block", () => {
    const blocks = buildTurnBlocks(
      [
        msg("u1", { role: "user", content: "go" }),
        msg("a1", { metadata: { plan: plan("in-progress", "not-started"), activity: [{ kind: "plan", done: 0, total: 2, created: true }] }, pendingActions: [], createdAt: at(2) }),
        msg("a2", { content: "Done", metadata: { plan: plan("completed", "completed"), activity: [{ kind: "plan", done: 2, total: 2 }] }, createdAt: at(9), updatedAt: at(9) }),
      ],
      t
    );
    const block = blocks.find((b) => b.kind === "activity");
    if (!block || block.kind !== "activity") throw new Error("expected an activity block");
    expect(block.plan?.steps.map((s) => s.status)).toEqual(["completed", "completed"]);
    expect(block.items.map((i) => i.kind)).toEqual(["plan", "plan"]);
  });

  it("a turn without a plan has none on its block", () => {
    const blocks = buildTurnBlocks([msg("u1", { role: "user", content: "go" }), msg("a1", { content: "Hi", metadata: { toolCallDetails: [{ id: "c", name: "web_search", args: {} }] } })], t);
    const block = blocks.find((b) => b.kind === "activity");
    if (!block || block.kind !== "activity") throw new Error("expected an activity block");
    expect(block.plan).toBeUndefined();
  });

  it("a plan alone (no activity) still gets its card", () => {
    const blocks = buildTurnBlocks([msg("u1", { role: "user", content: "go" }), msg("a1", { content: "Hi", metadata: { plan: plan("completed") } })], t);
    expect(blocks.map((b) => b.kind)).toEqual(["message", "activity", "message"]);
  });
});

describe("ChatMessageList with a plan", () => {
  const finished = (): Message[] => [
    msg("u1", { role: "user", content: "refund me", createdAt: at(0), updatedAt: at(0) }),
    msg("a1", {
      content: "I refunded 49.00.",
      createdAt: at(2),
      updatedAt: at(41),
      metadata: {
        activity,
        plan: plan("completed", "completed", "completed", "completed", "completed"),
        toolCallDetails: [
          { id: "c1", name: "lookup_customer", args: {} },
          { id: "c2", name: "web_search", args: {} },
          { id: "c3", name: "issue_refund", args: {} },
        ],
      },
    }),
  ];

  it("modern: the timeline shows the markers in order, and a folded plan card sits above the answer", () => {
    render(withAppearance("modern", <ChatMessageList messages={finished()} />));
    const timeline = document.querySelector("[data-chat-activity] ol") as HTMLElement;
    const rows = Array.from(timeline.children).map((li) => li.textContent);
    expect(rows).toEqual([
      "Look up customer",
      "Plan created · 5 steps",
      "Web Search",
      "Plan updated · 2 of 5",
      "Earlier context condensed",
      "Issue Refund",
      "Plan updated · 5 of 5",
    ]);
    expect(within(timeline).getAllByRole("separator", { hidden: true })).toHaveLength(1);
    const card = document.querySelector("[data-chat-plan]") as HTMLElement;
    expect(card.textContent).toContain("5 of 5 done");
    expect((card.querySelector("ol") as HTMLElement).hidden).toBe(true);
    // the card comes after the timeline and before the answer
    const answer = screen.getByText("I refunded 49.00.");
    expect(timeline.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("modern: an unfinished plan is open above the answer", () => {
    const messages = finished();
    messages[1]!.metadata = { plan: plan("completed", "in-progress"), activity: [{ kind: "plan", done: 1, total: 2, created: true }] };
    render(withAppearance("modern", <ChatMessageList messages={messages} />));
    const card = document.querySelector("[data-chat-plan]") as HTMLElement;
    expect((card.querySelector("ol") as HTMLElement).hidden).toBe(false);
  });

  it("classic: the plan card only, no markers", () => {
    render(withAppearance("classic", <ChatMessageList messages={finished()} />));
    expect(document.querySelector("[data-chat-plan]")).toBeTruthy();
    expect(screen.queryByText("Earlier context condensed")).toBeNull();
    expect(screen.queryByText("Plan created")).toBeNull();
    expect(document.querySelectorAll("[data-chat-plan]")).toHaveLength(1);
  });

  it("a message without a plan or activity looks as it did", () => {
    render(withAppearance("modern", <ChatMessageList messages={[msg("u1", { role: "user", content: "hi" }), msg("a1", { content: "Hello" })]} />));
    expect(document.querySelector("[data-chat-plan]")).toBeNull();
    expect(document.querySelector("[data-chat-activity]")).toBeNull();
  });

  it("live: the plan card is above the live line, with the condensing note", () => {
    const messages = [msg("u1", { role: "user", content: "go" })];
    render(withAppearance("modern", <ChatMessageList messages={messages} isStreaming plan={plan("completed", "in-progress", "not-started")} condensing />));
    const card = document.querySelector("[data-chat-plan]") as HTMLElement;
    expect(card.textContent).toContain("1 of 3");
    const note = document.querySelector("[data-chat-condensing]") as HTMLElement;
    expect(note.textContent).toContain("Condensing earlier context…");
    const live = screen.getByText("Working…");
    expect(card.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("live: nothing extra without a plan, and the plan goes away when the turn is not streaming", () => {
    const messages = [msg("u1", { role: "user", content: "go" })];
    const { rerender } = render(withAppearance("modern", <ChatMessageList messages={messages} isStreaming />));
    expect(document.querySelector("[data-chat-plan]")).toBeNull();
    expect(document.querySelector("[data-chat-condensing]")).toBeNull();
    rerender(withAppearance("modern", <ChatMessageList messages={messages} isStreaming={false} plan={plan("in-progress")} condensing />));
    expect(document.querySelector("[data-chat-plan]")).toBeNull();
    expect(document.querySelector("[data-chat-condensing]")).toBeNull();
  });

  it("classic live: the plan card shows too", () => {
    render(withAppearance("classic", <ChatMessageList messages={[msg("u1", { role: "user", content: "go" })]} isStreaming plan={plan("in-progress")} />));
    expect(document.querySelector("[data-chat-plan]")).toBeTruthy();
  });
});

describe("ChatMessage with a stored plan", () => {
  it("draws the plan card above the text in the classic look, and not when the list draws it (hideActivity)", () => {
    const message = msg("a1", { content: "All set", metadata: { plan: plan("completed", "in-progress") } });
    const { unmount } = render(withAppearance("classic", <ChatMessage message={message} />));
    expect(document.querySelector("[data-chat-plan]")).toBeTruthy();
    unmount();
    render(withAppearance("classic", <ChatMessage message={message} hideActivity />));
    expect(document.querySelector("[data-chat-plan]")).toBeNull();
  });

  it("a person's own message never shows one", () => {
    render(withAppearance("classic", <ChatMessage message={msg("u1", { role: "user", content: "hi", metadata: { plan: plan("completed") } })} />));
    expect(document.querySelector("[data-chat-plan]")).toBeNull();
  });
});
