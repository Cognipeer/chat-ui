import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ChatI18nProvider } from "../providers";
import { useChat } from "./useChat";
import { ResponsesTransport } from "../api/adapters/responses";

const wrapper = ({ children }: { children: ReactNode }) => <ChatI18nProvider locale="en">{children}</ChatI18nProvider>;

describe("useChat.stop with a Responses transport", () => {
  it("posts the cancel of the running response, on the first turn", async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    const sse = (e: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      if (url.endsWith("/cancel")) return new Response(JSON.stringify({ cancelled: true }), { status: 200, headers: { "content-type": "application/json" } });
      init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    });
    const transport = new ResponsesTransport({ baseUrl: "https://api.example.com/v1", fetch: fetchMock as unknown as typeof fetch, defaultAgentId: "a" });
    const { result } = renderHook(() => useChat({ transport, agentId: "a" }), { wrapper });

    let sending!: Promise<boolean>;
    act(() => {
      sending = result.current.sendMessage("go");
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    sse({ type: "response.created", response: { id: "resp_first" } });
    sse({ type: "response.output_text.delta", delta: "Part" });
    await waitFor(() => expect(result.current.streamingText).toBe("Part"));

    act(() => result.current.stop());
    await act(async () => {
      await sending;
    });
    await waitFor(() => expect(urls).toContain("https://api.example.com/v1/responses/resp_first/cancel"));
    expect(result.current.isStreaming).toBe(false);
  });
});
