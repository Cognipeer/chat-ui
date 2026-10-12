import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { ModelPicker } from "./ModelPicker";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { modelOfMessage } from "../../utils";
import { AgentServerClient } from "../../api/client";
import type { AgentModelOption, Message } from "../../types";

afterEach(cleanup);
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const render = (ui: ReactElement) => rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);
const models: AgentModelOption[] = [
  { key: "main", label: "Main", description: "Best quality", default: true },
  { key: "fast", label: "Fast", description: "Cheaper", default: false },
  { key: "tiny", label: "Tiny", default: false },
];

describe("ModelPicker", () => {
  it("draws nothing with fewer than two models", () => {
    const view = render(<ModelPicker models={[models[0]!]} onChange={() => {}} />);
    expect(view.container.querySelector("button")).toBeNull();
  });

  it("shows the default as the pill and lists label, description and a check on the picked one", () => {
    render(<ModelPicker models={models} onChange={() => {}} />);
    const pill = screen.getByRole("button", { name: "Model: Main" });
    expect(pill.getAttribute("aria-haspopup")).toBe("listbox");
    fireEvent.click(pill);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    expect(options[0]!.textContent).toContain("Best quality");
    expect(options[1]!.getAttribute("aria-selected")).toBe("false");
  });

  it("moves with the arrow keys, picks with Enter and gives focus back", () => {
    const onChange = vi.fn();
    render(<ModelPicker models={models} onChange={onChange} />);
    const pill = screen.getByRole("button", { name: "Model: Main" });
    fireEvent.keyDown(pill, { key: "ArrowDown" });
    const list = screen.getByRole("listbox");
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(list.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1]!.id);
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("fast");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(pill);
  });

  it("closes on Escape without picking and wraps around with ArrowUp", () => {
    const onChange = vi.fn();
    render(<ModelPicker models={models} value="main" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Model: Main" }));
    const list = screen.getByRole("listbox");
    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(list.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[2]!.id);
    fireEvent.keyDown(list, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("picks with a click and is inert while disabled", () => {
    const onChange = vi.fn();
    const view = render(<ModelPicker models={models} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Model: Main" }));
    fireEvent.click(screen.getByRole("option", { name: /Tiny/ }));
    expect(onChange).toHaveBeenCalledWith("tiny");
    view.rerender(
      <ChatI18nProvider locale="en">
        <ModelPicker models={models} onChange={onChange} disabled />
      </ChatI18nProvider>
    );
    expect((screen.getByRole("button", { name: "Model: Main" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ChatInput modelPicker slot", () => {
  it("renders the picker next to the send button", () => {
    render(<ChatInput onSend={() => {}} modelPicker={<span data-testid="slot" />} />);
    expect(screen.getByTestId("slot")).toBeTruthy();
  });
});

describe("answers and models", () => {
  const now = new Date();
  const msg = (id: string, role: Message["role"], model?: string): Message => ({
    id,
    conversationId: "c",
    role,
    content: role === "user" ? "q" : "a",
    metadata: model ? { model } : undefined,
    createdAt: now,
    updatedAt: now,
  });
  const thread = [msg("u1", "user"), msg("a1", "assistant", "main"), msg("u2", "user"), msg("a2", "assistant", "fast")];

  it("reads the model from the places a server reports it", () => {
    expect(modelOfMessage({ role: "assistant", metadata: { model: "x" } })).toBe("x");
    expect(modelOfMessage({ role: "assistant", metadata: { cognipeer: { agent_model: "y" } } })).toBe("y");
    expect(modelOfMessage({ role: "user", metadata: { model: "x" } })).toBeUndefined();
  });

  it("says which model answered and marks the change of model", () => {
    render(<ChatMessageList messages={thread} models={models} />);
    expect(screen.getByText("Answered with Main")).toBeTruthy();
    expect(screen.getByText("Answered with Fast")).toBeTruthy();
    expect(screen.getAllByRole("separator")).toHaveLength(1);
    expect(screen.getByText("Switched to Fast")).toBeTruthy();
  });

  it("hides the footer with showAnsweredWith=false and shows nothing without models", () => {
    const view = render(<ChatMessageList messages={thread} models={models} showAnsweredWith={false} />);
    expect(screen.queryByText("Answered with Main")).toBeNull();
    expect(screen.getAllByRole("separator")).toHaveLength(1);
    view.rerender(
      <ChatI18nProvider locale="en">
        <ChatMessageList messages={thread} />
      </ChatI18nProvider>
    );
    expect(screen.queryByRole("separator")).toBeNull();
  });
});

describe("AgentServerClient sends model", () => {
  const ok = () => new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  it("puts model in the message, regenerate and edit bodies", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return ok();
    });
    const client = new AgentServerClient({ baseUrl: "http://x/api", agentId: "a", fetch: fetchMock as unknown as typeof fetch });
    await client.sendMessage("c1", { message: "hi", model: "fast" });
    await client.regenerateMessage("c1", "m1", { model: "fast" });
    await client.editMessage("c1", "m1", { content: "yo", model: "tiny" });
    expect(calls.map((c) => c.body.model)).toEqual(["fast", "fast", "tiny"]);
  });
});
