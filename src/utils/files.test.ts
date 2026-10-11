import { describe, expect, it } from "vitest";
import { applyFileList, countMessageFiles, fileFromRecord, isFileExpired, isFileTypeAllowed, uploadMimeType } from "./files";
import type { FileAttachment, Message } from "../types";

const now = new Date();
const user = (files: FileAttachment[] | undefined, id = "u1"): Message => ({
  id, conversationId: "c", role: "user", content: "x", files, createdAt: now, updatedAt: now,
});
const f = (id: string, extra: Partial<FileAttachment> = {}): FileAttachment => ({ id, name: `${id}.txt`, mimeType: "text/plain", size: 1, ...extra });

describe("fileFromRecord", () => {
  it("keeps what the chat shows and drops the rest of a server record", () => {
    expect(
      fileFromRecord({
        id: "f1", name: "a.pdf", mimeType: "application/pdf", size: 12, storageKey: "k", conversationId: "c", userId: "u",
        expiresAt: new Date("2026-11-10T00:00:00Z"), conversion: { status: "failed" }, metadata: {},
      })
    ).toEqual({ id: "f1", name: "a.pdf", mimeType: "application/pdf", size: 12, storageKey: "k", expiresAt: "2026-11-10T00:00:00.000Z", conversionStatus: "failed" });
  });
  it("fills the gaps of a thin record", () => {
    expect(fileFromRecord({ id: "f1" })).toEqual({ id: "f1", name: "file", mimeType: "application/octet-stream", size: 0 });
    expect(fileFromRecord(undefined).id).toBe("");
    expect(fileFromRecord({ id: "f1", expiresAt: "garbage", conversionStatus: "weird" })).toEqual({ id: "f1", name: "file", mimeType: "application/octet-stream", size: 0 });
  });
});

describe("isFileExpired", () => {
  it("is true once the deadline has passed or the file is marked gone", () => {
    expect(isFileExpired({ expiresAt: "2026-01-01T00:00:00Z" }, Date.parse("2026-01-02T00:00:00Z"))).toBe(true);
    expect(isFileExpired({ expiresAt: "2026-01-03T00:00:00Z" }, Date.parse("2026-01-02T00:00:00Z"))).toBe(false);
    expect(isFileExpired({ expired: true })).toBe(true);
    expect(isFileExpired({})).toBe(false);
    expect(isFileExpired({ expiresAt: "nonsense" })).toBe(false);
  });
});

describe("applyFileList", () => {
  it("attaches deadlines and conversion status, and marks the files a complete list no longer holds", () => {
    const messages = [user([f("kept"), f("gone")]), { ...user(undefined, "u2") }];
    const out = applyFileList(messages, [f("kept", { expiresAt: "2030-01-01T00:00:00.000Z", conversionStatus: "skipped", url: "/x" })], true);
    expect(out[0].files![0]).toMatchObject({ id: "kept", expiresAt: "2030-01-01T00:00:00.000Z", conversionStatus: "skipped", url: "/x" });
    expect(out[0].files![1]).toMatchObject({ id: "gone", expired: true });
    expect(out[1]).toBe(messages[1]);
  });
  it("does not call a file gone when the list is partial, and leaves untouched messages as they were", () => {
    const messages = [user([f("a")])];
    const out = applyFileList(messages, [], false);
    expect(out[0]).toBe(messages[0]);
  });
  it("keeps what a file already says over the list", () => {
    const out = applyFileList([user([f("a", { expiresAt: "2029-01-01T00:00:00.000Z" })])], [f("a", { expiresAt: "2031-01-01T00:00:00.000Z" })], true);
    expect(out[0].files![0].expiresAt).toBe("2029-01-01T00:00:00.000Z");
  });
});

describe("countMessageFiles", () => {
  it("counts the distinct files the user attached, not the gone ones", () => {
    const messages = [user([f("a"), f("b", { expired: true })], "u1"), user([f("a"), f("c")], "u2"), { ...user([f("z")], "m"), role: "assistant" as const }];
    expect(countMessageFiles(messages)).toBe(2 + 1 - 1); // a, c (b is gone, z is the assistant's)
  });
});

describe("isFileTypeAllowed", () => {
  const file = (name: string, type: string) => ({ name, type });
  it("allows anything without a list", () => {
    expect(isFileTypeAllowed(file("a", "x/y"), undefined)).toBe(true);
    expect(isFileTypeAllowed(file("a", "x/y"), [])).toBe(true);
  });
  it("matches media types, wildcards and extensions", () => {
    expect(isFileTypeAllowed(file("a.png", "image/png"), ["image/*"])).toBe(true);
    expect(isFileTypeAllowed(file("a.pdf", "application/pdf"), ["application/pdf"])).toBe(true);
    expect(isFileTypeAllowed(file("a.txt", "text/plain"), ["application/pdf"])).toBe(false);
    expect(isFileTypeAllowed(file("a.PDF".toLowerCase(), "application/octet-stream"), [".pdf"])).toBe(true);
    expect(isFileTypeAllowed(file("a.docx", "application/x"), [".pdf"])).toBe(false);
  });
  it("lets a file without a type through when the list names media types (the server decides), but judges it by name against extensions", () => {
    expect(isFileTypeAllowed(file("report", ""), ["application/pdf"])).toBe(true);
    expect(isFileTypeAllowed(file("report", ""), [".pdf"])).toBe(false);
    expect(isFileTypeAllowed(file("report.pdf", ""), [".pdf"])).toBe(true);
    expect(isFileTypeAllowed(file("report", ""), [".pdf", "image/*"])).toBe(true);
  });
});

describe("uploadMimeType", () => {
  it("is the file's own type, else the neutral one", () => {
    expect(uploadMimeType({ type: "image/png" })).toBe("image/png");
    expect(uploadMimeType({ type: "" })).toBe("application/octet-stream");
  });
});
