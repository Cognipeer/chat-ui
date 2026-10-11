import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatMessage } from "./ChatMessage";
import { MessageStopNotice } from "./StopNotice";
import type { Message } from "../../types";

afterEach(cleanup);

const render = (ui: ReactElement, locale: "en" | "tr" = "en") => rtlRender(<ChatI18nProvider locale={locale}>{ui}</ChatI18nProvider>);
const now = new Date();
const message = (partial: Partial<Message>): Message => ({
  id: "m", conversationId: "c", role: "assistant", content: "Part of the answer", createdAt: now, updatedAt: now, ...partial,
});

describe("MessageStopNotice", () => {
  it.each([
    ["cancelled", "Stopped before it finished."],
    ["limit", "The assistant reached a limit and stopped."],
    ["max_turns", "The assistant used up its allowed steps and stopped."],
    ["budget_reached", "This conversation reached its usage limit."],
    ["error", "Something went wrong and the assistant stopped."],
  ] as const)("says why an answer stopped on %s, as a status", (stopReason, text) => {
    render(<MessageStopNotice message={message({ stopReason })} hasText />);
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain(text);
    expect(notice.getAttribute("data-chat-stop")).toBe(stopReason);
  });

  it("tells a partial answer from a final one, and says when nothing was written", () => {
    render(<MessageStopNotice message={message({ stopReason: "cancelled" })} hasText />);
    expect(screen.getByRole("status").textContent).toContain("The text above is how far it got, not a final answer.");
    cleanup();
    render(<MessageStopNotice message={message({ stopReason: "cancelled", content: "" })} hasText={false} />);
    expect(screen.getByRole("status").textContent).toContain("Nothing was written before it stopped.");
  });

  it("does not repeat itself for the usage limit, which has a banner of its own", () => {
    render(<MessageStopNotice message={message({ stopReason: "budget_reached" })} hasText />);
    expect(screen.getByRole("status").textContent).not.toContain("how far it got");
  });

  it("an answer cut short with no reason still says it may be incomplete", () => {
    render(<MessageStopNotice message={message({ status: "incomplete" })} hasText />);
    expect(screen.getByRole("status").textContent).toContain("This answer may be incomplete.");
  });

  it("reads the reason from the metadata, and speaks Turkish", () => {
    render(<MessageStopNotice message={message({ metadata: { stopReason: "limit" } })} hasText />, "tr");
    expect(screen.getByRole("status").textContent).toContain("Asistan bir sınıra ulaştı ve durdu.");
  });

  it("says nothing for a plain answer, a pause, or the end of the turn", () => {
    for (const m of [message({}), message({ stopReason: "end_turn" }), message({ stopReason: "requires_action", status: "requires_action" })]) {
      const { container } = render(<MessageStopNotice message={m} hasText />);
      expect(container.querySelector("[role=status]")).toBeNull();
      cleanup();
    }
  });

  it("is replaced by the host's own, which also gets the runtime's wording", () => {
    render(
      <MessageStopNotice
        message={message({ stopReason: "limit", stopDetail: "maxToolCalls" })}
        hasText
        render={({ stopReason, detail, hasText }) => <p>{`custom ${stopReason} ${detail} ${hasText}`}</p>}
      />
    );
    expect(screen.getByText("custom limit maxToolCalls true")).toBeTruthy();
  });
});

describe("a stopped answer in ChatMessage", () => {
  it("shows the notice under the text of an assistant answer, not under a user message or while it streams", () => {
    render(<ChatMessage message={message({ stopReason: "cancelled", status: "cancelled" })} />);
    expect(screen.getByText("Part of the answer")).toBeTruthy();
    expect(screen.getByText("Stopped before it finished.")).toBeTruthy();
    cleanup();

    render(<ChatMessage message={message({ role: "user", stopReason: "cancelled" })} />);
    expect(screen.queryByText("Stopped before it finished.")).toBeNull();
    cleanup();

    render(<ChatMessage message={message({ stopReason: "cancelled" })} isStreaming streamingText="more" />);
    expect(screen.queryByText("Stopped before it finished.")).toBeNull();
  });

  it("lists what the turn warned about, in the language of the page, falling back to the server's words", () => {
    render(
      <ChatMessage
        message={message({
          metadata: { warnings: [{ code: "file_truncated", message: "x" }, { code: "images_not_supported" }, { code: "something_new", message: "A new kind of note" }, { code: "bare_code" }] },
        })}
      />
    );
    const list = screen.getByRole("list", { name: "Notes about this answer" });
    expect(list.textContent).toContain("the assistant saw only the start of them");
    expect(list.textContent).toContain("This assistant cannot look at images");
    expect(list.textContent).toContain("A new kind of note");
    expect(list.textContent).toContain("bare_code");
  });

  it("no warnings, no list", () => {
    render(<ChatMessage message={message({})} />);
    expect(screen.queryByRole("list", { name: "Notes about this answer" })).toBeNull();
  });

  it("a custom stop notice replaces the default one in the message too", () => {
    render(<ChatMessage message={message({ stopReason: "error" })} renderStopNotice={() => <p>mine</p>} />);
    expect(screen.getByText("mine")).toBeTruthy();
    expect(screen.queryByText("Something went wrong and the assistant stopped.")).toBeNull();
  });
});
