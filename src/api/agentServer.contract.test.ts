// @vitest-environment node
/**
 * The client against a real agent-server: its Node handler on a local port with in-memory storage, no mocks of
 * what the server answers. These are the answers that unit tests of invented bodies got wrong (bulk delete,
 * pinning, the export formats), so they are checked once against the code that gives them.
 *
 * agent-server is found, in this order, at `$AGENT_SERVER_ENTRY` (a path to its `dist/index.js`), in a sibling
 * checkout (`../agent-server-feat-hitl`, `../agent-server`) or in `node_modules/@cognipeer/agent-server`. It has to be
 * 0.3.0 or newer (the history, feedback and export routes); without one the suite is skipped, as in a checkout of
 * this repository alone. (It uses Node modules, so `tsconfig.json` leaves `*.contract.test.ts` out of `npm run typecheck`.)
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentServerClient } from "./client";
import { resolveExperience } from "../utils/experience";

type Module = {
  createAgentServer: (config: Record<string, unknown>) => HostServer;
  createNodeHandler: (server: HostServer) => (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean>;
  createInMemoryProvider: () => { connect(): Promise<void> };
};
interface HostServer {
  registerHostAgent(definition: Record<string, unknown>): void;
}

const atLeast = (version: string, major: number, minor: number) => {
  const [a = 0, b = 0] = version.split(".").map((part) => parseInt(part, 10) || 0);
  return a > major || (a === major && b >= minor);
};

function locate(): string | undefined {
  const root = process.cwd();
  const candidates = [
    process.env.AGENT_SERVER_ENTRY,
    path.resolve(root, "../agent-server-feat-hitl/dist/index.js"),
    path.resolve(root, "../agent-server/dist/index.js"),
    path.resolve(root, "node_modules/@cognipeer/agent-server/dist/index.js"),
  ];
  for (const entry of candidates) {
    if (!entry || !fs.existsSync(entry)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(entry), "..", "package.json"), "utf8")) as { version?: string };
      if (pkg.version && atLeast(pkg.version, 0, 3)) return entry;
    } catch {
      // not a package we can read: try the next one
    }
  }
  return undefined;
}

const entry = locate();
// (the built server brings its own dependencies, so it is imported by its file URL and left as it is)
const load = (href: string): Promise<Module> => import(/* @vite-ignore */ href);

interface Booted {
  client: AgentServerClient;
  url: string;
  close: () => Promise<void>;
}

async function boot(config: Record<string, unknown> = {}): Promise<Booted> {
  const mod = await load(pathToFileURL(entry!).href);
  const storage = mod.createInMemoryProvider();
  await storage.connect();
  const server = mod.createAgentServer({
    basePath: "/api",
    storage,
    resolveContext: () => ({ user: { id: "u1" }, data: {} }),
    runs: { sweepIntervalMs: 0, recoverOnStart: false },
    ...config,
  });
  server.registerHostAgent({ info: { id: "host", name: "Host" }, invoke: async () => ({ content: "an answer" }) });
  const handle = mod.createNodeHandler(server);
  const app = http.createServer(async (req, res) => {
    if (!(await handle(req, res))) {
      res.statusCode = 418;
      res.end();
    }
  });
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api`;
  return {
    client: new AgentServerClient({ baseUrl: url }),
    url,
    close: () =>
      new Promise<void>((resolve) => {
        app.closeAllConnections?.();
        app.close(() => resolve());
      }),
  };
}

const conversation = async (client: AgentServerClient, title?: string) => (await client.createConversation({ agentId: "host", ...(title ? { title } : {}) })).id;

describe.skipIf(!entry)("AgentServerClient against a real agent-server", () => {
  let live: Booted;
  beforeAll(async () => {
    live = await boot();
  });
  afterAll(async () => {
    await live?.close();
  });

  describe("bulk delete", () => {
    it("deletes the ones that are the person's and reports the others by status", async () => {
      const { client } = live;
      const [a, b] = [await conversation(client), await conversation(client)];
      const result = await client.deleteConversations([a, "no-such-conversation", b]);
      expect(result.deleted.sort()).toEqual([a, b].sort());
      expect(result.failed).toEqual([{ id: "no-such-conversation", code: "not_found" }]);
      const left = (await client.getConversations()).conversations.map((c) => c.id);
      expect(left).not.toContain(a);
      expect(left).not.toContain(b);
    });

    it("never reports a deleted conversation as failed (the numeric `deleted` of the answer is a count)", async () => {
      const { client } = live;
      const ids = [await conversation(client), await conversation(client), await conversation(client)];
      const raw = await fetch(`${live.url}/conversations/bulk-delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [await conversation(client)] }),
      });
      const body = (await raw.json()) as { deleted: unknown; results: unknown[] };
      // the premise: this is what the server answers
      expect(typeof body.deleted).toBe("number");
      expect(Array.isArray(body.results)).toBe(true);
      expect(await client.deleteConversations(ids)).toEqual({ deleted: ids, failed: [] });
    });

    it("reports a refusal of the agent's own settings as an error with the server's message", async () => {
      const closed = await boot({ experience: { history: { bulkDelete: false } } });
      try {
        const id = await conversation(closed.client);
        const result = await closed.client.deleteConversations([id]);
        expect(result.deleted).toEqual([]);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0]).toMatchObject({ id, code: "error" });
        expect(result.failed[0]!.message).toBeTruthy();
        expect((await closed.client.getConversations()).conversations.map((c) => c.id)).toContain(id);
      } finally {
        await closed.close();
      }
    });
  });

  describe("pinning", () => {
    it("pins and unpins for real, and lists the pinned conversation first", async () => {
      const { client } = live;
      const first = await conversation(client, "first");
      const second = await conversation(client, "second");
      expect(await client.pinConversation(first, true)).toBe(true);
      const pinned = (await client.getConversations()).conversations;
      expect(pinned.find((c) => c.id === first)?.pinned).toBe(true);
      expect(pinned[0]!.id).toBe(first);
      expect(pinned.find((c) => c.id === second)?.pinned).toBeFalsy();
      expect(await client.pinConversation(first, false)).toBe(false);
      expect((await client.getConversations()).conversations.find((c) => c.id === first)?.pinned).toBeFalsy();
    });

    it("is why the pin travels at the top level: the server drops `metadata.pinned`", async () => {
      const id = await conversation(live.client);
      const answer = await fetch(`${live.url}/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metadata: { pinned: true } }),
      });
      expect(answer.status).toBe(200);
      expect(((await answer.json()) as { pinned?: boolean }).pinned).toBeUndefined();
    });

    it("is refused, and the refusal reaches the caller, when the agent does not allow pinning", async () => {
      const closed = await boot({ experience: { history: { pin: false } } });
      try {
        const id = await conversation(closed.client);
        await expect(closed.client.pinConversation(id, true)).rejects.toMatchObject({ status: 403 });
      } finally {
        await closed.close();
      }
    });
  });

  describe("experience and export", () => {
    it("offers the print view as the PDF item of the export menu", async () => {
      const agent = (await live.client.getAgents()).find((a) => a.id === "host")!;
      const published = (agent.metadata?.experience as { export?: { formats?: string[] } } | undefined)?.export?.formats;
      // the premise: the server says `html`, never `pdf` (it has no renderer here)
      expect(published).toEqual(["md", "json", "html"]);
      expect(resolveExperience(agent, { exportMenu: { enabled: true } }).exportMenu.formats).toEqual(["md", "json", "pdf"]);
    });

    it("switches nothing on for a host that did not ask, whatever the server publishes", async () => {
      const agent = (await live.client.getAgents()).find((a) => a.id === "host")!;
      const x = resolveExperience(agent, { feedback: false, messageActions: { copy: false } });
      expect(x.feedback.enabled).toBe(false);
      expect(x.messageActions).toEqual({ copy: false, regenerate: false, edit: false });
      expect(x.historyActions).toEqual({ rename: false, pin: false, bulkDelete: false });
      expect(x.exportMenu.enabled).toBe(false);
    });

    it("lets a server that took a feature away win over the host that wants it", async () => {
      const closed = await boot({ experience: { feedback: { enabled: false }, history: { pin: false }, export: { enabled: false } } });
      try {
        const agent = (await closed.client.getAgents()).find((a) => a.id === "host")!;
        const x = resolveExperience(agent, { feedback: true, historyActions: { pin: true, rename: true }, exportMenu: { enabled: true } });
        expect(x.feedback.enabled).toBe(false);
        expect(x.historyActions).toEqual({ rename: true, pin: false, bulkDelete: false });
        expect(x.exportMenu.enabled).toBe(false);
      } finally {
        await closed.close();
      }
    });

    it("asks for the print view when a PDF is requested and the server has no renderer", async () => {
      const id = await conversation(live.client, "to print");
      await live.client.sendMessage(id, { message: "hello" } as never);
      const result = await live.client.exportConversation(id, { format: "pdf" });
      expect(result.contentType).toBe("text/html");
      expect(result.blob.size).toBeGreaterThan(0);
      const md = await live.client.exportConversation(id, { format: "md" });
      expect(md.contentType).toBe("text/markdown");
    });

    it("passes a rendered PDF through when the server has a renderer", async () => {
      const withPdf = await boot({ export: { renderPdf: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]) } });
      try {
        const id = await conversation(withPdf.client);
        await withPdf.client.sendMessage(id, { message: "hello" } as never);
        const result = await withPdf.client.exportConversation(id, { format: "pdf" });
        expect(result.contentType).toBe("application/pdf");
        const agent = (await withPdf.client.getAgents()).find((a) => a.id === "host")!;
        expect(resolveExperience(agent, { exportMenu: { enabled: true } }).exportMenu.formats).toEqual(["md", "json", "pdf"]);
      } finally {
        await withPdf.close();
      }
    });
  });
});
