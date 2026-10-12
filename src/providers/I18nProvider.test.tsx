import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "./I18nProvider";
import { useI18n } from "../hooks";
import { Chat } from "../components/chat/Chat";
import type { ChatTransport } from "../api";

afterEach(cleanup);

// jsdom has no layout, so the message list's scroll-to-bottom has nothing to call
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const now = new Date();
const transport: ChatTransport = {
  getAgents: async () => [],
  getConversations: async () => ({ conversations: [], total: 0, limit: 20, offset: 0, hasMore: false }),
  createConversation: async (p) => ({ id: "c", agentId: p.agentId, createdAt: now, updatedAt: now }),
  getConversation: async () => {
    throw new Error("unused");
  },
  deleteConversation: async () => {},
  sendMessage: async () => {
    throw new Error("unused");
  },
  sendMessageStream: async () => {},
};

const composer = () => screen.getByRole("textbox") as HTMLTextAreaElement;
let counter = 0;
const chat = (props: Record<string, unknown> = {}) => {
  counter += 1;
  return <Chat baseUrl={`http://i18n-${counter}`} transport={transport} showHistory={false} enableFileUpload={false} {...props} />;
};

describe("<Chat> and the locale", () => {
  it("works with no provider around it, in English", () => {
    render(chat());
    expect(composer().placeholder).toBe("Type a message...");
  });

  it("applies customMessages given to <Chat>", () => {
    render(chat({ customMessages: { en: { "chat.input.placeholder": "Ask away" } } }));
    expect(composer().placeholder).toBe("Ask away");
  });

  it("applies the custom messages of an enclosing ChatI18nProvider", () => {
    render(
      <ChatI18nProvider locale="en" customMessages={{ en: { "chat.input.placeholder": "CUSTOM_PLACEHOLDER" } }}>
        {chat()}
      </ChatI18nProvider>
    );
    expect(composer().placeholder).toBe("CUSTOM_PLACEHOLDER");
  });

  it("follows the locale of an enclosing provider", () => {
    render(<ChatI18nProvider locale="tr">{chat()}</ChatI18nProvider>);
    expect(composer().placeholder).toBe("Bir mesaj yazın...");
  });

  it("lets its own locale prop win over the enclosing provider, and keeps the provider's custom messages", () => {
    render(
      <ChatI18nProvider locale="tr" customMessages={{ en: { "chat.input.placeholder": "Outer english" } }}>
        {chat({ locale: "en" })}
      </ChatI18nProvider>
    );
    expect(composer().placeholder).toBe("Outer english");
  });

  it("merges its own customMessages over the provider's", () => {
    render(
      <ChatI18nProvider locale="en" customMessages={{ en: { "chat.input.placeholder": "Outer", "chat.input.label": "Outer label" } }}>
        {chat({ customMessages: { en: { "chat.input.placeholder": "Inner" } } })}
      </ChatI18nProvider>
    );
    expect(composer().placeholder).toBe("Inner");
    expect(composer().getAttribute("aria-label")).toBe("Outer label");
  });

  it("uses a third locale from customMessages and falls back to English per key", () => {
    render(chat({ locale: "de", customMessages: { de: { "chat.input.placeholder": "Nachricht eingeben..." } } }));
    expect(composer().placeholder).toBe("Nachricht eingeben...");
    // not translated: English
    expect(screen.getByTitle("Send message")).toBeTruthy();
  });

  it("follows the outer locale when it changes", () => {
    const view = render(<ChatI18nProvider locale="en">{chat()}</ChatI18nProvider>);
    expect(composer().placeholder).toBe("Type a message...");
    view.rerender(<ChatI18nProvider locale="tr">{chat()}</ChatI18nProvider>);
    expect(composer().placeholder).toBe("Bir mesaj yazın...");
  });
});

describe("useI18n", () => {
  it("answers in English outside any provider", () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.t("chat.input.send")).toBe("Send message");
    expect(result.current.has("chat.input.send")).toBe(true);
    expect(result.current.has("chat.nope")).toBe(false);
  });

  it("setLocale on an inheriting provider asks the outer one", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChatI18nProvider defaultLocale="en">
        <ChatI18nProvider>{children}</ChatI18nProvider>
      </ChatI18nProvider>
    );
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("en");
    act(() => result.current.setLocale("tr"));
    expect(result.current.locale).toBe("tr");
    expect(result.current.t("chat.input.send")).toBe("Mesaj gönder");
    window.history.replaceState({}, "", "/");
  });

  it("formats with a locale code Intl does not know without throwing", () => {
    const wrapper = ({ children }: { children: ReactNode }) => <ChatI18nProvider locale="xx-not-a-locale-1234567890">{children}</ChatI18nProvider>;
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("chat.input.send")).toBe("Send message");
    expect(result.current.formatNumber(1234.5)).toBeTruthy();
  });
});
