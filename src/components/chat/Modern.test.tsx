import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatMessageList } from "./ChatMessageList";
import { ChatHistory } from "./ChatHistory";
import { ChatEmptyState } from "./ChatEmptyState";
import { ChatAppearanceProvider, type ChatAppearance } from "./appearance";
import { buildTurnBlocks, formatDuration } from "./TurnActivity";
import type { ChatActionsConfig } from "./ActionCards";
import type { AgentInfo, ConversationListItem, Message, PendingAction } from "../../types";

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
const approval = (id: string, tool = "web_search"): PendingAction => ({ id, type: "tool_approval", toolName: tool, args: { query: "cognipeer" } });
const approved = { status: "resolved" as const, resolution: { type: "tool_approval" as const, decision: "allow" as const } };
const call = (id: string) => ({ id, name: "web_search", args: { query: `q-${id}` }, result: "ok" });

/** A turn as agent-server stores it: two paused steps (each approved), then the answer */
const turn = (): Message[] => [
  msg("u1", { role: "user", content: "research cognipeer", createdAt: at(0), updatedAt: at(0) }),
  msg("a1", { reasoning: "plan", pendingActions: [approval("p1")], actionStates: { p1: approved }, createdAt: at(2), updatedAt: at(3) }),
  msg("a2", {
    metadata: { toolCallDetails: [call("c1")] },
    pendingActions: [approval("p2")],
    actionStates: { p2: approved },
    createdAt: at(5),
    updatedAt: at(8),
  }),
  msg("a3", { content: "Cognipeer is an AI platform.", metadata: { toolCallDetails: [call("c2")] }, createdAt: at(10), updatedAt: at(24) }),
];

const withAppearance = (appearance: ChatAppearance, ui: ReactElement) => (
  <ChatI18nProvider locale="en">
    <ChatAppearanceProvider value={appearance}>{ui}</ChatAppearanceProvider>
  </ChatI18nProvider>
);
const actions: ChatActionsConfig = { onResolve: () => {} };

describe("buildTurnBlocks", () => {
  it("folds a turn's steps into one activity before the answer", () => {
    const blocks = buildTurnBlocks(turn(), t);
    expect(blocks.map((b) => b.kind)).toEqual(["message", "activity", "message"]);
    const activity = blocks[1];
    if (activity.kind !== "activity") throw new Error("expected an activity");
    // the calls, the reasoning and the two answered approvals, in order
    expect(activity.items.map((i) => i.kind)).toEqual(["thinking", "action", "tool", "action", "tool"]);
    // from the person's message to the answer
    expect(activity.durationMs).toBe(24_000);
  });

  it("ends on the open card a turn waits for", () => {
    const messages = [
      msg("u1", { role: "user", content: "go" }),
      msg("a1", { metadata: { toolCallDetails: [call("c1")] }, status: "requires_action", pendingActions: [approval("p1")] }),
    ];
    expect(buildTurnBlocks(messages, t).map((b) => b.kind)).toEqual(["message", "activity", "cards"]);
  });

  it("leaves out reasoning when it is hidden", () => {
    const blocks = buildTurnBlocks([msg("a1", { content: "hi", reasoning: "secret" })], t, { reasoning: false });
    expect(blocks.map((b) => b.kind)).toEqual(["message"]);
  });

  it("formats durations", () => {
    expect(formatDuration(24_000, t)).toBe('chat.activity.seconds {"s":24}');
    expect(formatDuration(125_000, t)).toBe('chat.activity.minutes {"m":2,"s":5}');
  });
});

describe("ChatMessageList appearance", () => {
  it("classic keeps every step as its own message with its cards", () => {
    render(withAppearance("classic", <ChatMessageList messages={turn()} actions={actions} />));
    expect(document.querySelector("[data-chat-activity]")).toBeNull();
    expect(screen.getAllByText("Approved")).toHaveLength(2);
    expect(document.querySelector("[data-chat-bubble]")).toBeNull();
  });

  it("modern shows one 'worked for' line, the answer and a bubble for the person", () => {
    render(withAppearance("modern", <ChatMessageList messages={turn()} actions={actions} />));
    const activity = document.querySelectorAll("[data-chat-activity]");
    expect(activity).toHaveLength(1);
    expect(activity[0].textContent).toContain("Worked for 24s");
    expect(activity[0].textContent).toContain("Web Search ×2");
    // answered approvals are lines of the timeline, not cards
    expect(screen.queryByText("Approved")).toBeNull();
    expect(screen.getAllByText("Approved: Web Search")).toHaveLength(2);
    expect(screen.getByText("Cognipeer is an AI platform.")).toBeTruthy();
    expect(document.querySelector("[data-chat-bubble]")?.textContent).toContain("research cognipeer");
  });

  it("modern opens the timeline on click", () => {
    render(withAppearance("modern", <ChatMessageList messages={turn()} actions={actions} />));
    const toggle = screen.getByRole("button", { name: /Worked for 24s/ });
    const list = document.querySelector("[data-chat-activity] ol") as HTMLElement;
    expect(list.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(list.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("modern still shows an open approval as a card", () => {
    const messages = [
      msg("u1", { role: "user", content: "go" }),
      msg("a1", { status: "requires_action", pendingActions: [approval("p1")] }),
    ];
    render(withAppearance("modern", <ChatMessageList messages={messages} actions={actions} />));
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });
});

describe("ChatHistory modern", () => {
  const today = new Date();
  const old = new Date(today.getTime() - 40 * 86_400_000);
  const conversations: ConversationListItem[] = [
    { id: "c1", title: "Fresh chat", agentId: "a", createdAt: today, updatedAt: today } as ConversationListItem,
    { id: "c2", title: "Old chat", agentId: "a", createdAt: old, updatedAt: old } as ConversationListItem,
  ];
  const agents: AgentInfo[] = [
    { id: "a", name: "Research" },
    { id: "b", name: "HR" },
  ];

  it("groups by date and offers the agents, the brand and the account", () => {
    const onAgentPick = vi.fn();
    const onSignOut = vi.fn();
    render(
      withAppearance(
        "modern",
        <ChatHistory
          conversations={conversations}
          onSelect={() => {}}
          onNewChat={() => {}}
          brand={{ title: "Test portal" }}
          account={{ name: "Local Admin", detail: "admin@demo.local", onSignOut }}
          agents={agents}
          onAgentPick={onAgentPick}
        />
      )
    );
    expect(screen.getByText("Test portal")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Older" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "HR" }));
    expect(onAgentPick).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByRole("button", { name: /Account menu: Local Admin/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("classic ignores the modern-only parts", () => {
    render(
      withAppearance(
        "classic",
        <ChatHistory conversations={conversations} onSelect={() => {}} brand={{ title: "Test portal" }} agents={agents} onAgentPick={() => {}} />
      )
    );
    expect(screen.queryByText("Test portal")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
  });
});

describe("ChatEmptyState modern", () => {
  it("shows the agents as cards and picks one", () => {
    const onAgentChange = vi.fn();
    render(
      withAppearance(
        "modern",
        <ChatEmptyState
          agents={[
            { id: "a", name: "Research", description: "Searches the web" },
            { id: "b", name: "HR" },
          ]}
          selectedAgentId="a"
          onAgentChange={onAgentChange}
        />
      )
    );
    expect(screen.getByRole("heading", { name: "Who do you want to work with?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Research/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /HR/ }));
    expect(onAgentChange).toHaveBeenCalledWith("b");
  });
});
