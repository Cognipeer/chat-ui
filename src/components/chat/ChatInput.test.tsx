import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ChatInput, type ChatInputProps } from "./ChatInput";

afterEach(cleanup);

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);

const box = () => screen.getByPlaceholderText("Type a message...") as HTMLTextAreaElement;

async function typeAndSend(text: string) {
  fireEvent.change(box(), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByTitle("Send message"));
  });
}

function setup(onSend: ChatInputProps["onSend"]) {
  render(<ChatInput onSend={onSend} />);
}

describe("ChatInput keeps the text of a refused message", () => {
  it("clears at once and stays empty when the message is taken", async () => {
    const onSend = vi.fn(async () => true);
    setup(onSend);
    await typeAndSend("hello");
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(box().value).toBe("");
  });

  it("stays empty for a handler that returns nothing (the old contract)", async () => {
    setup(() => {});
    await typeAndSend("hello");
    expect(box().value).toBe("");
  });

  it("puts the text back when the send resolves to false", async () => {
    let finish!: (taken: boolean) => void;
    setup(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await typeAndSend("second batch");
    expect(box().value).toBe("");
    await act(async () => finish(false));
    expect(box().value).toBe("second batch");
  });

  it("puts the text back when the handler returns false or rejects", async () => {
    setup(() => false);
    await typeAndSend("sync refusal");
    expect(box().value).toBe("sync refusal");
    cleanup();

    setup(async () => {
      throw new Error("boom");
    });
    await typeAndSend("async failure");
    expect(box().value).toBe("async failure");
  });

  it("does not overwrite what was typed while the send was in flight", async () => {
    let finish!: (taken: boolean) => void;
    setup(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await typeAndSend("first");
    fireEvent.change(box(), { target: { value: "next thought" } });
    await act(async () => finish(false));
    expect(box().value).toBe("next thought");
  });
});
