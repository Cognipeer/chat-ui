import { describe, expect, it, vi } from "vitest";
import { A2ATransport } from "./a2a";
import { ChatCompletionsTransport } from "./chatCompletions";
import { ResponsesTransport } from "./responses";
import { consoleDownloadAddress } from "./outputFiles";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const as = (f: unknown) => f as unknown as typeof fetch;

const BASE = "https://console.example.com/api/client/v1";
const file = {
  id: "f1",
  name: "report.pdf",
  mime_type: "application/pdf",
  size: 1234,
  download_url: "/client/v1/agents/sessions/c1/files/f1/content",
};
const ADDRESS = `${BASE}/agents/sessions/c1/files/f1/content`;

async function send(t: { createConversation: any; sendMessage: any }) {
  const c = await t.createConversation({ agentId: "a" });
  const res = await t.sendMessage(c.id, { message: "hi" });
  return res.response.files;
}

describe("agent output files", () => {
  it("maps the download route under the API root", () => {
    expect(consoleDownloadAddress(BASE, file.download_url)).toBe(ADDRESS);
    expect(consoleDownloadAddress(BASE, "nonsense")).toBeUndefined();
  });

  it("Responses: output_files become attachments fetched with the credentials", async () => {
    const body = {
      id: "resp_c1", object: "response", status: "completed",
      output: [{ id: "m", type: "message", role: "assistant", content: [{ type: "output_text", text: "done", annotations: [{ type: "file_path", file_id: "f1", filename: "report.pdf" }] }] }],
      output_files: [file],
    };
    const calls: Array<{ url: string; headers: any }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers });
      return url.includes("/content") ? new Response("PDFBYTES", { status: 200 }) : json(body);
    });
    (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:x");
    const t = new ResponsesTransport({ baseUrl: BASE, authorization: "Bearer k", fetch: as(fetchMock) });
    const files = await send(t);
    expect(files).toEqual([{ id: "f1", name: "report.pdf", mimeType: "application/pdf", size: 1234, storageKey: ADDRESS }]);
    expect(await t.getFileUrl(files[0], { disposition: "attachment" })).toBe("blob:x");
    const fetched = calls.find((c) => c.url.includes("/content"))!;
    expect(fetched.url).toBe(`${ADDRESS}?disposition=attachment`);
    expect(fetched.headers.Authorization).toBe("Bearer k");
  });

  it("Responses: file_path annotations alone still yield a file; none yields no files", async () => {
    const annotated = {
      id: "resp_c1", status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "x", annotations: [{ type: "file_path", file_id: "f9", filename: "a.csv" }] }] }],
    };
    const t = new ResponsesTransport({ baseUrl: BASE, fetch: as(vi.fn(async () => json(annotated))) });
    expect(await send(t)).toEqual([
      { id: "f9", name: "a.csv", mimeType: "application/octet-stream", size: 0, storageKey: `${BASE}/agents/sessions/c1/files/f9/content` },
    ]);
    const plain = { id: "resp_c1", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "x" }] }] };
    const t2 = new ResponsesTransport({ baseUrl: BASE, fetch: as(vi.fn(async () => json(plain))) });
    expect(await send(t2)).toBeUndefined();
  });

  it("Chat completions: output_files on the body", async () => {
    const body = { choices: [{ message: { role: "assistant", content: "ok" } }], output_files: [file] };
    const t = new ChatCompletionsTransport({ baseUrl: BASE, authorization: "Bearer k", fetch: as(vi.fn(async () => json(body))) });
    const files = await send(t);
    expect(files?.[0]).toMatchObject({ id: "f1", storageKey: ADDRESS });
  });

  it("A2A: file artifacts on the server's origin are fetched with credentials; others stay links", async () => {
    const uri = "https://console.example.com/api/client/v1/agents/sessions/c1/files/f1/content";
    const task = {
      jsonrpc: "2.0", id: 1,
      result: {
        kind: "task", id: "task_c1_1", contextId: "c1", status: { state: "completed" },
        artifacts: [
          { artifactId: "a", name: "response", parts: [{ kind: "text", text: "done" }] },
          { artifactId: "a_f", name: "report.pdf", parts: [{ kind: "file", file: { name: "report.pdf", mimeType: "application/pdf", uri } }], metadata: { fileId: "f1", size: 1234 } },
          { artifactId: "b_f", name: "x.txt", parts: [{ kind: "file", file: { name: "x.txt", mimeType: "text/plain", uri: "https://cdn.other.com/x.txt" } }] },
        ],
      },
    };
    const card = { name: "a", url: "https://console.example.com/api/client/v1/a2a/a", capabilities: {} };
    const fetchMock = vi.fn(async (url: string) => (url.includes("agent-card") ? json(card) : json(task)));
    const t = new A2ATransport({ baseUrl: "https://console.example.com/api/client/v1/a2a/a", authorization: "Bearer k", fetch: as(fetchMock) });
    const files = await send(t);
    expect(files[0]).toEqual({ id: "f1", name: "report.pdf", mimeType: "application/pdf", size: 1234, storageKey: uri });
    expect(files[1]).toMatchObject({ name: "x.txt", url: "https://cdn.other.com/x.txt" });
    expect(files[1].storageKey).toBeUndefined();
  });
});
