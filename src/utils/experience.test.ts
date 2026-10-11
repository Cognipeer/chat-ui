import { afterEach, describe, expect, it } from "vitest";
import {
  activeAnnouncements,
  isAnnouncementDismissed,
  isPinned,
  legalLinkEntries,
  makeInfoUrlTransform,
  normalizeFeedback,
  normalizeStarters,
  pinnedFirst,
  readFeedback,
  rememberAnnouncementDismissed,
  resolveExperience,
  safeLegalHref,
  safeMarkdownImageSrc,
} from "./experience";
import type { AgentInfo, Message } from "../types";

afterEach(() => localStorage.clear());

describe("normalizeStarters", () => {
  it("keeps well-formed starters, accepts plain strings, and stops at six", () => {
    const list = normalizeStarters([
      { text: "  Summarise my week ", label: "Weekly summary", autoSend: true },
      "Plain text",
      { text: "" },
      { label: "no text" },
      42,
      null,
      { prompt: "older key", auto_send: true },
      ...Array.from({ length: 10 }, (_, i) => ({ text: `more ${i}` })),
    ]);
    expect(list).toHaveLength(6);
    expect(list[0]).toEqual({ text: "Summarise my week", label: "Weekly summary", autoSend: true });
    expect(list[1]).toEqual({ text: "Plain text" });
    expect(list[2]).toEqual({ text: "older key", autoSend: true });
  });

  it("is empty for anything that is not a list", () => {
    expect(normalizeStarters(undefined)).toEqual([]);
    expect(normalizeStarters({ text: "x" })).toEqual([]);
  });
});

describe("feedback", () => {
  it("reads up / down and the older positive / negative, with reasons and comment", () => {
    expect(normalizeFeedback({ rating: "down", reasons: ["too_long", 7, ""], comment: "rambling" })).toEqual({
      rating: "down",
      reasons: ["too_long"],
      comment: "rambling",
    });
    expect(normalizeFeedback({ type: "positive" })).toEqual({ rating: "up" });
    expect(normalizeFeedback({ rating: "meh" })).toBeUndefined();
    expect(normalizeFeedback(null)).toBeUndefined();
  });

  it("finds a message's rating on the message or in its metadata", () => {
    const base = { id: "m", conversationId: "c", role: "assistant", content: "", createdAt: new Date(), updatedAt: new Date() } as Message;
    expect(readFeedback({ ...base, feedback: { rating: "up" } })).toEqual({ rating: "up" });
    expect(readFeedback({ ...base, metadata: { feedback: { rating: "down", reasons: ["unsafe"] } } })).toEqual({ rating: "down", reasons: ["unsafe"] });
    expect(readFeedback(base)).toBeUndefined();
  });
});

describe("announcements", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  const a = (over: Record<string, unknown>) => ({ id: "x", text: "hi", ...over });

  it("shows only what is due, most severe first, at most five, one per id", () => {
    const list = activeAnnouncements(
      [
        a({ id: "future", startsAt: "2026-10-12T00:00:00Z" }),
        a({ id: "over", endsAt: "2026-10-11T11:00:00Z" }),
        a({ id: "info", severity: "info" }),
        a({ id: "crit", severity: "critical", endsAt: "2026-10-11T13:00:00Z" }),
        a({ id: "warn", severity: "warning" }),
        a({ id: "warn", severity: "warning", text: "dup" }),
        a({ id: "", text: "no id" }),
        a({ id: "empty", text: "" }),
        a({ id: "weird", severity: "loud" }),
        a({ id: "n1" }),
        a({ id: "n2" }),
        a({ id: "n3" }),
      ],
      now
    );
    expect(list.map((x) => x.id)).toEqual(["crit", "warn", "info", "weird", "n1"]);
    expect(list.find((x) => x.id === "weird")?.severity).toBe("info");
    expect(list.every((x) => x.dismissible === true)).toBe(true);
  });

  it("respects dismissible: false and remembers a dismissal on the device", () => {
    expect(activeAnnouncements([a({ dismissible: false })], now)[0].dismissible).toBe(false);
    expect(isAnnouncementDismissed("x")).toBe(false);
    rememberAnnouncementDismissed("x");
    expect(isAnnouncementDismissed("x")).toBe(true);
  });
});

describe("links and images", () => {
  it("lets through web addresses and paths, mailto only for support, and nothing script-like", () => {
    expect(safeLegalHref("https://example.com/privacy")).toBe("https://example.com/privacy");
    expect(safeLegalHref("/privacy")).toBe("/privacy");
    expect(safeLegalHref("mailto:help@example.com")).toBe("mailto:help@example.com");
    expect(safeLegalHref("mailto:help@example.com", { allowMailto: false })).toBeUndefined();
    for (const bad of ["javascript:alert(1)", "java\nscript:alert(1)", " javascript:alert(1)", "data:text/html,x", "//evil.example", "ftp://x", "", undefined, 3]) {
      expect(safeLegalHref(bad), String(bad)).toBeUndefined();
    }
    expect(
      legalLinkEntries({ privacy: "https://a.example/p", terms: "javascript:x", support: "mailto:s@a.example", aboutAi: "/about" })
    ).toEqual([
      ["privacy", "https://a.example/p"],
      ["support", "mailto:s@a.example"],
      ["aboutAi", "/about"],
    ]);
  });

  it("allows welcome images from https (optionally allowlisted hosts), the page's own paths and raster data URLs", () => {
    expect(safeMarkdownImageSrc("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
    expect(safeMarkdownImageSrc("https://cdn.example/a.png", ["cdn.example"])).toBe("https://cdn.example/a.png");
    expect(safeMarkdownImageSrc("https://other.example/a.png", ["cdn.example"])).toBeUndefined();
    expect(safeMarkdownImageSrc("http://cdn.example/a.png")).toBeUndefined();
    expect(safeMarkdownImageSrc("/assets/logo.png")).toBe("/assets/logo.png");
    expect(safeMarkdownImageSrc("//evil.example/a.png")).toBeUndefined();
    expect(safeMarkdownImageSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(safeMarkdownImageSrc("data:image/svg+xml;base64,AAAA")).toBeUndefined();
    expect(safeMarkdownImageSrc("javascript:alert(1)")).toBeUndefined();
  });

  it("keeps the default protection on links and cuts images down", () => {
    const transform = makeInfoUrlTransform(["cdn.example"]);
    expect(transform("https://example.com", "href")).toBe("https://example.com");
    expect(transform("javascript:alert(1)", "href")).toBe("");
    expect(transform("https://cdn.example/a.png", "src")).toBe("https://cdn.example/a.png");
    expect(transform("https://other.example/a.png", "src")).toBe("");
  });
});

describe("pinning", () => {
  const item = (id: string, pinned?: boolean, meta?: boolean) => ({
    id,
    pinned,
    metadata: meta ? { pinned: true } : undefined,
  });

  it("lists pinned conversations first and keeps the order inside each group", () => {
    const list = [item("a"), item("b", true), item("c"), item("d", undefined, true)];
    expect(list.map(isPinned)).toEqual([false, true, false, true]);
    expect(pinnedFirst(list).map((x) => x.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("returns the same list when nothing is pinned", () => {
    const list = [item("a"), item("b")];
    expect(pinnedFirst(list)).toBe(list);
  });
});

describe("resolveExperience", () => {
  const agent = (metadata: Record<string, unknown>): AgentInfo => ({ id: "a", name: "A", metadata });

  it("is all off for a chat nobody configured", () => {
    const x = resolveExperience(undefined, {});
    expect(x.messageActions).toEqual({ copy: false, regenerate: false, edit: false });
    expect(x.feedback.enabled).toBe(false);
    expect(x.historyActions).toEqual({ rename: false, pin: false, bulkDelete: false });
    expect(x.exportMenu.enabled).toBe(false);
    expect(x.notifications).toEqual({ tabBadge: false, sound: false, desktop: "off" });
    expect(x.disclosure.aiLabel).toBe(false);
    expect(x.starters).toEqual([]);
    expect(x.welcome).toBeUndefined();
  });

  it("takes the host's props", () => {
    const x = resolveExperience(undefined, {
      messageActions: { copy: true, edit: true },
      feedback: true,
      historyActions: { pin: true },
      exportMenu: { enabled: true, formats: ["md", "bogus" as never], includeTools: true },
      notifications: { tabBadge: true, desktop: "opt_in" },
      disclosure: { aiLabel: true, labelText: "Made by AI", links: { privacy: "https://x.example" } },
      starters: [{ text: "Hi" }],
      welcome: "# Hello",
    });
    expect(x.messageActions).toEqual({ copy: true, regenerate: false, edit: true });
    expect(x.feedback).toMatchObject({ enabled: true, comments: true });
    expect(x.feedback.reasons).toHaveLength(6);
    expect(x.historyActions.pin).toBe(true);
    expect(x.exportMenu).toEqual({ enabled: true, formats: ["md"], includeTools: true });
    expect(x.notifications).toEqual({ tabBadge: true, sound: false, desktop: "opt_in" });
    expect(x.disclosure).toMatchObject({ aiLabel: true, labelText: "Made by AI" });
    expect(x.starters).toEqual([{ text: "Hi" }]);
    expect(x.welcome).toBe("# Hello");
  });

  it("lets the selected agent narrow what the host switched on, never switch anything on", () => {
    const x = resolveExperience(
      agent({
        starters: [{ text: "From the agent" }],
        welcome: "Agent welcome",
        experience: {
          messageActions: { copy: false, regenerate: true },
          feedback: { enabled: true, comments: false, reasons: ["unsafe", "other"] },
        },
      }),
      {
        messageActions: { copy: true, regenerate: true },
        feedback: { enabled: true, reasons: ["other", "custom"] },
        starters: [{ text: "From the host" }],
        welcome: "Host welcome",
      }
    );
    // copy: the host said yes, the agent took it away; edit: nobody switched it on; regenerate: both
    expect(x.messageActions).toEqual({ copy: false, regenerate: true, edit: false });
    // the comment box is taken away; the reasons are the host's list cut down to what the agent accepts
    expect(x.feedback).toEqual({ enabled: true, comments: false, reasons: ["other"] });
    // content is the agent's when it has some
    expect(x.starters).toEqual([{ text: "From the agent" }]);
    expect(x.welcome).toBe("Agent welcome");
  });

  it("offers the agent's reasons when the host narrows to none of them or names none", () => {
    const say = { experience: { feedback: { enabled: true, reasons: ["unsafe", "other"] } } };
    expect(resolveExperience(agent(say), { feedback: { enabled: true, reasons: ["custom"] } }).feedback.reasons).toEqual(["unsafe", "other"]);
    expect(resolveExperience(agent(say), { feedback: true }).feedback.reasons).toEqual(["unsafe", "other"]);
  });

  describe("against what agent-server 0.3.0 publishes (every switch on)", () => {
    // GET /agents -> agents[0].metadata of agent-server-feat-hitl with a default configuration
    const published = agent({
      experience: {
        messageActions: { copy: true, regenerate: true, edit: true },
        history: { rename: true, pin: true, bulkDelete: true },
        feedback: { enabled: true, comments: true, reasons: ["inaccurate", "incomplete", "off_topic", "too_long", "unsafe", "other"], maxCommentLength: 1000 },
        export: { enabled: true, includeTools: false, formats: ["md", "json", "html"] },
        titles: false,
      },
    });

    it("switches nothing on for a host that set nothing", () => {
      const x = resolveExperience(published, {});
      expect(x.messageActions).toEqual({ copy: false, regenerate: false, edit: false });
      expect(x.feedback.enabled).toBe(false);
      expect(x.historyActions).toEqual({ rename: false, pin: false, bulkDelete: false });
      expect(x.exportMenu.enabled).toBe(false);
      expect(x.notifications).toEqual({ tabBadge: false, sound: false, desktop: "off" });
      expect(x.disclosure.aiLabel).toBe(false);
    });

    it("keeps what the host switched off, off", () => {
      const x = resolveExperience(published, { feedback: false, messageActions: { copy: false, regenerate: true }, historyActions: { pin: false }, exportMenu: false });
      expect(x.feedback.enabled).toBe(false);
      expect(x.messageActions).toEqual({ copy: false, regenerate: true, edit: false });
      expect(x.historyActions.pin).toBe(false);
      expect(x.exportMenu.enabled).toBe(false);
    });

    it("is what the host asked for, no more, when the host switches things on", () => {
      const x = resolveExperience(published, {
        messageActions: { copy: true },
        feedback: { enabled: true },
        historyActions: { rename: true, pin: true },
        exportMenu: { enabled: true },
      });
      expect(x.messageActions).toEqual({ copy: true, regenerate: false, edit: false });
      expect(x.feedback).toMatchObject({ enabled: true, comments: true });
      expect(x.historyActions).toEqual({ rename: true, pin: true, bulkDelete: false });
      expect(x.exportMenu.enabled).toBe(true);
    });

    it("offers the print view as the PDF item (the server's `html` entry)", () => {
      const x = resolveExperience(published, { exportMenu: { enabled: true } });
      expect(x.exportMenu.formats).toEqual(["md", "json", "pdf"]);
      expect(resolveExperience(published, { exportMenu: { enabled: true, formats: ["md", "pdf"] } }).exportMenu.formats).toEqual(["md", "pdf"]);
    });

    it("does not add a format the server does not publish, and keeps `pdf` once when both are", () => {
      const only = agent({ experience: { export: { enabled: true, formats: ["md", "json"] } } });
      expect(resolveExperience(only, { exportMenu: { enabled: true } }).exportMenu.formats).toEqual(["md", "json"]);
      const both = agent({ experience: { export: { enabled: true, formats: ["md", "html", "pdf"] } } });
      expect(resolveExperience(both, { exportMenu: { enabled: true } }).exportMenu.formats).toEqual(["md", "pdf"]);
    });

    it("lets the agent switch a feature off for a host that turned it on", () => {
      const off = agent({
        experience: {
          messageActions: { edit: false },
          history: { bulkDelete: false },
          feedback: { enabled: false },
          export: { enabled: false },
          notifications: { desktop: "off" },
          disclosure: { aiLabel: false },
        },
      });
      const x = resolveExperience(off, {
        messageActions: { copy: true, edit: true },
        historyActions: { pin: true, bulkDelete: true },
        feedback: true,
        exportMenu: { enabled: true, includeTools: true },
        notifications: { tabBadge: true, desktop: "opt_in" },
        disclosure: { aiLabel: true },
      });
      expect(x.messageActions).toEqual({ copy: true, regenerate: false, edit: false });
      expect(x.historyActions).toEqual({ rename: false, pin: true, bulkDelete: false });
      expect(x.feedback.enabled).toBe(false);
      expect(x.exportMenu).toEqual({ enabled: false, formats: ["md", "json", "pdf"], includeTools: false });
      expect(x.notifications).toEqual({ tabBadge: true, sound: false, desktop: "off" });
      expect(x.disclosure.aiLabel).toBe(false);
    });

    it("keeps tool calls out of the export unless the agent allows them too", () => {
      const host = { exportMenu: { enabled: true, includeTools: true } };
      // (agent-server's default is includeTools: false)
      expect(resolveExperience(published, host).exportMenu.includeTools).toBe(false);
      const allow = agent({ experience: { export: { enabled: true, includeTools: true } } });
      expect(resolveExperience(allow, host).exportMenu.includeTools).toBe(true);
      expect(resolveExperience(allow, { exportMenu: { enabled: true } }).exportMenu.includeTools).toBe(false);
    });

    it("treats a whole group set to false as every key withdrawn", () => {
      const x = resolveExperience(agent({ experience: { messageActions: false, feedback: false, history: false, export: false } }), {
        messageActions: { copy: true },
        feedback: true,
        historyActions: { pin: true },
        exportMenu: true,
      });
      expect(x.messageActions.copy).toBe(false);
      expect(x.feedback.enabled).toBe(false);
      expect(x.historyActions.pin).toBe(false);
      expect(x.exportMenu.enabled).toBe(false);
    });
  });
});
