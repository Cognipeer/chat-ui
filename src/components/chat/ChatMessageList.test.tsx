import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
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

describe("ChatMessageList: the turn being streamed", () => {
  it("is drawn once, below the stored messages, which keep what was stored", () => {
    const stored = [msg("u1", { role: "user", content: "go" }), msg("m1", { content: "The stored answer" })];
    rtlRender(wrap(<ChatMessageList messages={stored} isStreaming streamingText="Live words" />));
    expect(screen.getAllByText("Live words")).toHaveLength(1);
    expect(screen.getByText("The stored answer")).toBeTruthy();
    // the live turn comes after the last stored message
    const all = Array.from(document.querySelectorAll("p")).map((p) => p.textContent);
    expect(all).toEqual(["go", "The stored answer", "Live words"]);
  });
});

describe("ChatMessageList: older messages", () => {
  const history = [msg("u9", { role: "user", content: "newer question" }), msg("m9", { content: "newer answer" })];

  it("offers to fetch them above the first message, and says so while it does", () => {
    const onLoadEarlier = vi.fn();
    const view = rtlRender(wrap(<ChatMessageList messages={history} hasEarlier onLoadEarlier={onLoadEarlier} />));
    fireEvent.click(screen.getByRole("button", { name: "Show earlier messages" }));
    expect(onLoadEarlier).toHaveBeenCalledTimes(1);

    view.rerender(wrap(<ChatMessageList messages={history} hasEarlier isLoadingEarlier onLoadEarlier={onLoadEarlier} />));
    const busy = screen.getByRole("button", { name: "Loading earlier messages..." }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
  });

  it("shows no button when nothing older exists or nobody can fetch it", () => {
    const view = rtlRender(wrap(<ChatMessageList messages={history} onLoadEarlier={() => {}} />));
    expect(screen.queryByRole("button", { name: /earlier messages/i })).toBeNull();
    view.rerender(wrap(<ChatMessageList messages={history} hasEarlier />));
    expect(screen.queryByRole("button", { name: /earlier messages/i })).toBeNull();
  });

  it("keeps the reader where they were when older messages arrive, and does not jump to the end", () => {
    const scrollIntoView = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const view = rtlRender(wrap(<ChatMessageList messages={history} hasEarlier onLoadEarlier={() => {}} />));
    const log = screen.getByRole("log") as HTMLElement;
    const scrollTo = vi.fn();
    log.scrollTo = scrollTo as unknown as typeof log.scrollTo;
    let height = 1000;
    Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => height });
    log.scrollTop = 40;

    fireEvent.click(screen.getByRole("button", { name: "Show earlier messages" }));
    scrollIntoView.mockClear();
    height = 1900; // the older page made the list 900px taller
    view.rerender(wrap(<ChatMessageList messages={[msg("u1", { role: "user", content: "old" }), msg("m1", { content: "older" }), ...history]} hasEarlier onLoadEarlier={() => {}} />));
    expect(log.scrollTop).toBe(940);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();

    // a new message at the end scrolls down as before
    view.rerender(wrap(<ChatMessageList messages={[msg("u1", { role: "user", content: "old" }), msg("m1", { content: "older" }), ...history, msg("m10", { content: "latest" })]} onLoadEarlier={() => {}} />));
    expect(scrollTo).toHaveBeenCalledWith({ top: 1900, behavior: "smooth" });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("ChatMessageList: following the newest message", () => {
  const first = [msg("u1", { role: "user", content: "hi" })];
  const withAnswer = [...first, msg("m1", { content: "an answer" })];
  const tall = (log: HTMLElement, height: number) => Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => height });

  it("scrolls the message list to its end when an answer arrives", () => {
    const view = rtlRender(wrap(<ChatMessageList messages={first} />));
    const log = screen.getByRole("log") as HTMLElement;
    const scrollTo = vi.fn();
    log.scrollTo = scrollTo as unknown as typeof log.scrollTo;
    tall(log, 1200);

    view.rerender(wrap(<ChatMessageList messages={withAnswer} />));
    expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: "smooth" });
  });

  it("sets scrollTop directly where the element cannot scrollTo", () => {
    const view = rtlRender(wrap(<ChatMessageList messages={first} />));
    const log = screen.getByRole("log") as HTMLElement;
    expect(typeof (log as { scrollTo?: unknown }).scrollTo).not.toBe("function");
    tall(log, 800);

    view.rerender(wrap(<ChatMessageList messages={withAnswer} />));
    expect(log.scrollTop).toBe(800);
  });

  it("never scrolls the page or any ancestor of the list, only the list", () => {
    const scrollIntoView = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const windowScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const windowScrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    scrollIntoView.mockClear();

    // a host page that is itself scrollable, with the list inside it
    const page = document.createElement("div");
    page.style.overflowY = "auto";
    document.body.appendChild(page);
    const view = rtlRender(wrap(<ChatMessageList messages={first} />), { container: page });
    const log = screen.getByRole("log") as HTMLElement;
    log.scrollTo = vi.fn() as unknown as typeof log.scrollTo;
    tall(log, 1500);
    page.scrollTop = 0;

    view.rerender(wrap(<ChatMessageList messages={withAnswer} />));
    view.rerender(wrap(<ChatMessageList messages={withAnswer} isStreaming streamingText="Typing" />));
    view.rerender(wrap(<ChatMessageList messages={withAnswer} isStreaming streamingText="Typing more words" />));
    view.rerender(wrap(<ChatMessageList messages={[...withAnswer, msg("m2", { content: "next" })]} />));

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(windowScroll).not.toHaveBeenCalled();
    expect(windowScrollBy).not.toHaveBeenCalled();
    expect(page.scrollTop).toBe(0);
    expect(document.scrollingElement?.scrollTop ?? 0).toBe(0);

    windowScroll.mockRestore();
    windowScrollBy.mockRestore();
    page.remove();
  });

  it("stays put when autoScroll is off", () => {
    const view = rtlRender(wrap(<ChatMessageList messages={first} autoScroll={false} />));
    const log = screen.getByRole("log") as HTMLElement;
    const scrollTo = vi.fn();
    log.scrollTo = scrollTo as unknown as typeof log.scrollTo;
    tall(log, 1200);
    log.scrollTop = 10;

    view.rerender(wrap(<ChatMessageList messages={withAnswer} autoScroll={false} />));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(log.scrollTop).toBe(10);
  });
});

describe("ChatMessageList: reading earlier text while an answer streams", () => {
  const first = [msg("u1", { role: "user", content: "hi" })];
  const geometry = (log: HTMLElement, state: { height: number }) => {
    Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => state.height });
    Object.defineProperty(log, "clientHeight", { configurable: true, get: () => 400 });
  };

  it("stops following once the reader scrolls up, and follows again at the end or after they send a message", () => {
    const view = rtlRender(wrap(<ChatMessageList messages={first} isStreaming streamingText="a" />));
    const log = screen.getByRole("log") as HTMLElement;
    const scrollTo = vi.fn();
    log.scrollTo = scrollTo as unknown as typeof log.scrollTo;
    const state = { height: 1000 };
    geometry(log, state);

    // the reader wheels up, far from the end
    fireEvent.wheel(log, { deltaY: -120 });
    log.scrollTop = 200;
    fireEvent.scroll(log);
    scrollTo.mockClear();
    state.height = 1200;
    view.rerender(wrap(<ChatMessageList messages={first} isStreaming streamingText="a b" />));
    expect(scrollTo).not.toHaveBeenCalled();

    // back at the end: following resumes
    log.scrollTop = state.height - 400;
    fireEvent.scroll(log);
    state.height = 1400;
    view.rerender(wrap(<ChatMessageList messages={first} isStreaming streamingText="a b c" />));
    expect(scrollTo).toHaveBeenCalledWith({ top: 1400, behavior: "smooth" });

    // scrolled up again, then a new message of their own brings the end back
    fireEvent.wheel(log, { deltaY: -120 });
    log.scrollTop = 100;
    fireEvent.scroll(log);
    scrollTo.mockClear();
    const sent = [...first, msg("m1", { content: "answer" }), msg("u2", { role: "user", content: "more" })];
    view.rerender(wrap(<ChatMessageList messages={sent} pinSentMessage={false} />));
    expect(scrollTo).toHaveBeenCalledWith({ top: 1400, behavior: "smooth" });
  });

  it("with the default, a message of their own is pinned to the top instead of following the end", () => {
    const view = rtlRender(wrap(<ChatMessageList messages={first} isStreaming streamingText="a" />));
    const log = screen.getByRole("log") as HTMLElement;
    const scrollTo = vi.fn();
    log.scrollTo = scrollTo as unknown as typeof log.scrollTo;
    geometry(log, { height: 1000 });
    fireEvent.wheel(log, { deltaY: -120 });
    log.scrollTop = 100;
    fireEvent.scroll(log);
    scrollTo.mockClear();
    view.rerender(wrap(<ChatMessageList messages={[...first, msg("m1", { content: "answer" }), msg("u2", { role: "user", content: "more" })]} />));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0][0].top).not.toBe(1000);
  });
});

describe("ChatMessageList: the sent message is pinned to the top", () => {
  const old = [msg("u1", { role: "user", content: "hi" }), msg("m1", { content: "an answer" })];
  const sentList = [...old, msg("u2", { role: "user", content: "next" })];
  // jsdom has no layout: the list is 400px high, the sent message starts 1000px into the content, which ends 60px below it
  const state = { client: 400, rowTop: 1000, endTop: 1060 };
  const rect = (top: number) => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) });
  const realRect = Element.prototype.getBoundingClientRect;
  const realClient = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
  beforeEach(() => {
    Object.assign(state, { client: 400, rowTop: 1000, endTop: 1060 });
    const log = () => document.querySelector('[role="log"]') as HTMLElement;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.getAttribute("role") === "log") return rect(0);
      if (this.getAttribute("data-chat-message-id") === "u2") return rect(state.rowTop - log().scrollTop);
      if (this.hasAttribute("data-chat-pin-end")) return rect(state.endTop - log().scrollTop);
      return rect(0);
    };
    Object.defineProperty(Element.prototype, "clientHeight", {
      configurable: true,
      get(this: Element) {
        return this.getAttribute("role") === "log" ? state.client : 0;
      },
    });
  });
  afterEach(() => {
    Element.prototype.getBoundingClientRect = realRect;
    if (realClient) Object.defineProperty(Element.prototype, "clientHeight", realClient);
    else delete (Element.prototype as unknown as Record<string, unknown>).clientHeight;
  });
  const start = (props: Partial<ComponentProps<typeof ChatMessageList>> = {}) => {
    const view = rtlRender(wrap(<ChatMessageList messages={old} {...props} />));
    const log = screen.getByRole("log") as HTMLElement;
    const scrollTo = vi.fn();
    log.scrollTo = scrollTo as unknown as typeof log.scrollTo;
    const send = (messages: Message[] = sentList, extra: Partial<ComponentProps<typeof ChatMessageList>> = {}) =>
      view.rerender(wrap(<ChatMessageList messages={messages} {...props} {...extra} />));
    return { view, log, scrollTo, send };
  };
  const spacer = (log: HTMLElement) => log.querySelector("[data-chat-pin-space]") as HTMLElement | null;

  it("scrolls the list to the message minus 16px and reserves the room below it", () => {
    const { log, scrollTo, send } = start();
    const windowScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    send();
    expect(scrollTo).toHaveBeenCalledWith({ top: 984, behavior: "smooth" });
    // 400 - 16 - (1060 - 1000)
    expect(spacer(log)?.style.height).toBe("324px");
    expect(windowScroll).not.toHaveBeenCalled();
    windowScroll.mockRestore();
  });

  it("does not scroll while the answer streams", () => {
    const { log, scrollTo, send } = start();
    send();
    scrollTo.mockClear();
    log.scrollTop = 984;
    state.endTop = 1300;
    send(sentList, { isStreaming: true, streamingText: "Hello" });
    send(sentList, { isStreaming: true, streamingText: "Hello there, a longer answer" });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(log.scrollTop).toBe(984);
    // the content grew by 240px, so the room shrank by as much
    expect(spacer(log)?.style.height).toBe("84px");
  });

  it("grows the room for a taller list afterwards and never shrinks it for a shorter one", () => {
    const { log, send } = start();
    send();
    expect(spacer(log)?.style.height).toBe("324px");
    state.client = 250; // the keyboard opens
    send(sentList, { isStreaming: true, streamingText: "a" });
    expect(spacer(log)?.style.height).toBe("324px");
    state.client = 600; // closed, and larger than before
    send(sentList, { isStreaming: true, streamingText: "ab" });
    expect(spacer(log)?.style.height).toBe("524px");
  });

  it("follows the answer again once the reader scrolls to its end after it outgrew the room", () => {
    const { log, scrollTo, send } = start();
    send();
    scrollTo.mockClear();
    log.scrollTop = 984;
    state.endTop = 1600; // the answer is taller than the list now: no room is left under it
    send(sentList, { isStreaming: true, streamingText: "a long answer" });
    expect(spacer(log)?.style.height).toBe("0px");
    expect(scrollTo).not.toHaveBeenCalled();
    // the reader scrolls down to the end with the wheel
    Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => 1600 });
    fireEvent.wheel(log);
    log.scrollTop = 1200;
    fireEvent.scroll(log);
    expect(spacer(log)).toBeNull();
    send(sentList, { isStreaming: true, streamingText: "a long answer that goes on" });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1600, behavior: "smooth" });
  });

  it("stays pinned when the reader reaches the end while the answer still fits the room", () => {
    const { log, scrollTo, send } = start();
    send();
    scrollTo.mockClear();
    Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => 1384 });
    fireEvent.wheel(log);
    log.scrollTop = 984;
    fireEvent.scroll(log);
    expect(spacer(log)?.style.height).toBe("324px");
    send(sentList, { isStreaming: true, streamingText: "Hello" });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("is unpinned by another conversation, which opens at its end", () => {
    const { view, log, scrollTo, send } = start();
    send();
    expect(spacer(log)).not.toBeNull();
    Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => 2000 });
    scrollTo.mockClear();
    view.rerender(wrap(<ChatMessageList messages={[msg("x1", { role: "user", content: "other" }), msg("x2", { content: "reply" })]} />));
    expect(spacer(log)).toBeNull();
    expect(scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: "smooth" });
  });

  it("is unpinned by older messages arriving in front, which keep the reader where they were", () => {
    const { view, log, scrollTo, send } = start({ hasEarlier: true, onLoadEarlier: () => {} });
    send();
    expect(spacer(log)).not.toBeNull();
    let height = 1000;
    Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => height });
    log.scrollTop = 40;
    fireEvent.click(screen.getByRole("button", { name: "Show earlier messages" }));
    scrollTo.mockClear();
    height = 1900;
    view.rerender(wrap(<ChatMessageList messages={[msg("o1", { role: "user", content: "older" }), ...sentList]} hasEarlier onLoadEarlier={() => {}} />));
    expect(spacer(log)).toBeNull();
    expect(log.scrollTop).toBe(940);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("draws no spacer and keeps following the end with pinSentMessage={false} or autoScroll={false}", () => {
    for (const off of [{ pinSentMessage: false }, { autoScroll: false }]) {
      const { log, scrollTo, send } = start(off);
      Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => 1200 });
      send();
      expect(spacer(log)).toBeNull();
      if ("pinSentMessage" in off) expect(scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: "smooth" });
      else expect(scrollTo).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("scrolls without animation when the person prefers reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query })) as unknown as typeof window.matchMedia;
    try {
      const { scrollTo, send } = start();
      send();
      expect(scrollTo).toHaveBeenCalledWith({ top: 984, behavior: "auto" });
    } finally {
      window.matchMedia = original;
    }
  });
});
