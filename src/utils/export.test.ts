import { afterEach, describe, expect, it } from "vitest";
import {
  conversationToJson,
  conversationToMarkdown,
  conversationToPrintHtml,
  exportFilename,
  filenameFromDisposition,
  printHtml,
} from "./export";
import type { Message } from "../types";

const labels = { user: "You", assistant: "Assistant", system: "System", tool: "Tool", input: "Input", output: "Output", exportedOn: "Exported", untitled: "Untitled" };
const now = new Date("2026-10-11T12:00:00Z");
const msg = (over: Partial<Message>): Message => ({
  id: "m",
  conversationId: "c",
  role: "user",
  content: "hi",
  createdAt: new Date("2026-10-11T11:00:00Z"),
  updatedAt: new Date("2026-10-11T11:00:00Z"),
  ...over,
});
const messages: Message[] = [
  msg({ id: "1", role: "user", content: "What is `x`?" }),
  msg({
    id: "2",
    role: "assistant",
    content: "It is <b>bold</b> & more.",
    metadata: { toolCallDetails: [{ id: "t", name: "lookup", args: { q: "x" }, result: "```tricky```" }] },
  }),
  msg({ id: "3", role: "system", content: "hidden" }),
];
const conversation = { id: "c1", title: "My chat", agentId: "agent", createdAt: new Date("2026-10-11T10:00:00Z") };

describe("conversationToMarkdown", () => {
  it("writes a heading and a section per message, skipping system messages and tools by default", () => {
    const md = conversationToMarkdown(conversation, messages, { includeTools: false, labels, now });
    expect(md).toContain("# My chat");
    expect(md).toContain("## You");
    expect(md).toContain("What is `x`?");
    expect(md).toContain("## Assistant");
    expect(md).not.toContain("hidden");
    expect(md).not.toContain("lookup");
  });

  it("adds the tool calls when asked, with a fence longer than any backticks in the data", () => {
    const md = conversationToMarkdown(conversation, messages, { includeTools: true, labels, now });
    expect(md).toContain("**Tool: lookup**");
    expect(md).toContain("````\n```tricky```\n````");
  });

  it("falls back to the untitled label", () => {
    expect(conversationToMarkdown(null, [], { includeTools: false, labels, now })).toContain("# Untitled");
  });
});

describe("conversationToJson", () => {
  it("is a versioned document without system messages", () => {
    const doc = JSON.parse(conversationToJson(conversation, messages, { includeTools: false, now }));
    expect(doc.schemaVersion).toBe(1);
    expect(doc.conversation.title).toBe("My chat");
    expect(doc.messages.map((m: { id: string }) => m.id)).toEqual(["1", "2"]);
    expect(doc.messages[1].toolCalls).toBeUndefined();
    const withTools = JSON.parse(conversationToJson(conversation, messages, { includeTools: true, now }));
    expect(withTools.messages[1].toolCalls[0].name).toBe("lookup");
  });
});

describe("conversationToPrintHtml", () => {
  it("escapes everything it prints", () => {
    const html = conversationToPrintHtml({ title: "<script>alert(1)</script>" }, messages, { includeTools: true, labels, now });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("It is &lt;b&gt;bold&lt;/b&gt; &amp; more.");
  });
});

describe("file names", () => {
  it("makes a safe name from a title", () => {
    expect(exportFilename("My chat: Q3 / plan?", "md")).toBe("My-chat-Q3-plan.md");
    expect(exportFilename("Çalışma notları", "json")).toBe("Calısma-notları.json");
    expect(exportFilename("../../etc/passwd", "md")).toBe("etc-passwd.md");
    expect(exportFilename("", "pdf")).toBe("conversation.pdf");
    expect(exportFilename("x".repeat(200), "md").length).toBeLessThanOrEqual(63);
  });

  it("reads the server's proposal from Content-Disposition", () => {
    expect(filenameFromDisposition('attachment; filename="chat.md"')).toBe("chat.md");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''k%C3%BC%C3%A7%C3%BCk.md")).toBe("küçük.md");
    expect(filenameFromDisposition('attachment; filename="../x.md"')).toBe(".._x.md");
    expect(filenameFromDisposition(null)).toBeUndefined();
  });
});

describe("printHtml", () => {
  afterEach(() => document.querySelectorAll("iframe").forEach((f) => f.remove()));

  it("prints in a hidden frame that cannot run script, and does not leave the page", () => {
    printHtml("<html><body><script>window.top.__ran = true</script>text</body></html>");
    const frame = document.querySelector("iframe")!;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute("sandbox")).toBe("allow-same-origin allow-modals");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.srcdoc).toContain("text");
  });
});
