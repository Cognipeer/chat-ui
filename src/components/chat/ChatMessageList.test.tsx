import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatMessageList } from "./ChatMessageList";
import type { ChatActionsConfig } from "./ActionCards";
import type { Message, PendingAction } from "../../types";

afterEach(cleanup);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const wrap = (ui: ReactElement) => <ChatI18nProvider locale="en">{ui}</ChatI18nProvider>;
const now = new Date();
const msg = (id: string, partial: Partial<Message> = {}): Message => ({
  id,
  conversationId: "c",
  role: "assistant",
  content: "",
  createdAt: now,
  updatedAt: now,
  ...partial,
});

const approval = (id: string, tool = "sandbox_exec"): PendingAction => ({ id, type: "tool_approval", toolName: tool, args: { a: 1 } });
const question: PendingAction = { id: "q1", type: "user_question", questions: [{ question: "Which env?" }] };
const actions: ChatActionsConfig = { onResolve: () => {} };
const withCard = (id: string, action: PendingAction) => msg(id, { status: "requires_action", pendingActions: [action] });

const announcer = () => document.querySelector('[aria-live="assertive"]') as HTMLElement;
const render = (messages: Message[]) => rtlRender(wrap(<ChatMessageList messages={messages} actions={actions} />));

describe("ChatMessageList: cards that appear while it is on screen", () => {
  it("focuses and announces a card added to a conversation in progress", () => {
    const user = msg("u1", { role: "user", content: "go" });
    const view = render([user]);
    expect(announcer().textContent).toBe("");

    view.rerender(wrap(<ChatMessageList messages={[user, withCard("m1", approval("a1"))]} actions={actions} />));
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Allow sandbox_exec?" }));
    expect(announcer().textContent).toBe("The assistant needs your approval: sandbox_exec");
  });

  it("focuses a question's first control and announces the question", () => {
    const view = render([msg("u1", { role: "user", content: "go" })]);
    view.rerender(wrap(<ChatMessageList messages={[msg("u1", { role: "user", content: "go" }), withCard("m1", question)]} actions={actions} />));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Which env?" }));
    expect(announcer().textContent).toBe("The assistant has a question");
  });

  it("is quiet for cards that were there when it first showed", () => {
    render([msg("u1", { role: "user", content: "go" }), withCard("m1", approval("a1"))]);
    expect(document.activeElement).toBe(document.body);
    expect(announcer().textContent).toBe("");
  });

  it("is quiet when another conversation replaces the messages, cards and all", () => {
    const view = render([msg("u1", { role: "user", content: "go" }), msg("m1", { content: "hi" })]);
    view.rerender(wrap(<ChatMessageList messages={[msg("u2", { role: "user", content: "other" }), withCard("m2", approval("a9"))]} actions={actions} />));
    expect(document.activeElement).toBe(document.body);
    expect(announcer().textContent).toBe("");
  });

  it("does not repeat itself for a card it has already seen", () => {
    const first = [msg("u1", { role: "user", content: "go" }), withCard("m1", approval("a1"))];
    const view = render([first[0]]);
    view.rerender(wrap(<ChatMessageList messages={first} actions={actions} />));
    expect(announcer().textContent).toContain("sandbox_exec");

    // focus moved elsewhere on purpose; a later message must not pull it back
    (document.activeElement as HTMLElement).blur();
    view.rerender(wrap(<ChatMessageList messages={[...first, msg("m2", { content: "more" })]} actions={actions} />));
    expect(document.activeElement).toBe(document.body);
  });

  it("does not take the keyboard from someone typing", () => {
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    const user = msg("u1", { role: "user", content: "go" });
    const view = render([user]);
    field.focus();
    view.rerender(wrap(<ChatMessageList messages={[user, withCard("m1", approval("a1"))]} actions={actions} />));
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it("only the first of several new cards takes focus", () => {
    const user = msg("u1", { role: "user", content: "go" });
    const view = render([user]);
    view.rerender(
      wrap(
        <ChatMessageList
          messages={[user, msg("m1", { status: "requires_action", pendingActions: [approval("a1", "first_tool"), approval("a2", "second_tool")] })]}
          actions={actions}
        />
      )
    );
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Allow first_tool?" }));
  });
});

describe("ChatMessageList accessibility", () => {
  it("is a labelled log, busy while a reply streams", () => {
    const { rerender } = rtlRender(wrap(<ChatMessageList messages={[msg("m1", { content: "hi" })]} />));
    const log = screen.getByRole("log", { name: "Conversation" });
    expect(log.getAttribute("aria-busy")).toBe("false");
    rerender(wrap(<ChatMessageList messages={[msg("m1", { content: "hi" })]} isStreaming streamingText="Hel" />));
    expect(screen.getByRole("log", { name: "Conversation" }).getAttribute("aria-busy")).toBe("true");
  });
});

describe("ChatMessageList announcements", () => {
  it("reads the same sentence again for a second card of the same tool", () => {
    const user = msg("u1", { role: "user", content: "go" });
    const view = render([user]);
    const first = [user, withCard("m1", approval("a1"))];
    view.rerender(wrap(<ChatMessageList messages={first} actions={actions} />));
    const one = announcer().textContent;
    view.rerender(wrap(<ChatMessageList messages={[...first, withCard("m2", approval("a2"))]} actions={actions} />));
    const two = announcer().textContent;
    expect(one).toBe("The assistant needs your approval: sandbox_exec");
    expect(two).not.toBe(one);
    expect(two?.replace("​", "")).toBe(one);
  });
});
