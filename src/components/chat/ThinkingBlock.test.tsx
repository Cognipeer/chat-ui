import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ThinkingBlock } from "./ThinkingBlock";
import { ChatMessageList } from "./ChatMessageList";
import { reasoningOf } from "../../utils";
import type { Message } from "../../types";

afterEach(cleanup);
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
const render = (ui: ReactElement, locale: "en" | "tr" = "en") => rtlRender(<ChatI18nProvider locale={locale}>{ui}</ChatI18nProvider>);
const now = new Date();
const answer = (partial: Partial<Message> = {}): Message => ({ id: "a1", conversationId: "c", role: "assistant", content: "The answer", createdAt: now, updatedAt: now, ...partial });

describe("ThinkingBlock", () => {
  it("renders nothing without reasoning", () => {
    const view = render(<ThinkingBlock reasoning="" />);
    expect(view.container.querySelector("button")).toBeNull();
  });

  it("is collapsed for a finished answer and toggles accessibly", () => {
    render(<ThinkingBlock reasoning="step one" />);
    const btn = screen.getByRole("button", { name: "Show reasoning" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Thinking")).toBeTruthy();
    const region = document.getElementById(btn.getAttribute("aria-controls")!)!;
    expect(region.hidden).toBe(true);
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(region.hidden).toBe(false);
    expect(region.textContent).toBe("step one");
  });

  it("is open while reasoning streams and folds once the answer starts, unless chosen", () => {
    const view = render(<ThinkingBlock reasoning="hmm" streaming />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Thinking…")).toBeTruthy();
    view.rerender(<ChatI18nProvider locale="en"><ThinkingBlock reasoning="hmm" streaming answering /></ChatI18nProvider>);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it("uses Turkish strings", () => {
    render(<ThinkingBlock reasoning="x" />, "tr");
    expect(screen.getByText("Düşünce süreci")).toBeTruthy();
  });

  it("renders reasoning as text, not HTML", () => {
    render(<ThinkingBlock reasoning="<b>bold</b>" />);
    expect(document.querySelector("b")).toBeNull();
  });
});

describe("reasoning in the message list", () => {
  it("shows a block above the answer from message.reasoning or metadata", () => {
    render(<ChatMessageList messages={[answer({ reasoning: "own" }), answer({ id: "a2", metadata: { thinking: "meta" } })]} />);
    expect(screen.getAllByTestId("thinking-block")).toHaveLength(2);
  });

  it("hides it with showReasoning=false", () => {
    render(<ChatMessageList messages={[answer({ reasoning: "own" })]} showReasoning={false} streamingReasoning="live" isStreaming />);
    expect(screen.queryByTestId("thinking-block")).toBeNull();
  });

  it("shows streaming reasoning before any answer text, apart from it", () => {
    render(<ChatMessageList messages={[]} isStreaming streamingText="" streamingReasoning="pondering" />);
    expect(screen.getByTestId("thinking-block").textContent).toContain("pondering");
  });

  it("reasoningOf ignores blanks and non-strings", () => {
    expect(reasoningOf({ reasoning: "  ", metadata: { reasoning: 3, thinking: "t" } })).toBe("t");
    expect(reasoningOf({})).toBe("");
  });
});
