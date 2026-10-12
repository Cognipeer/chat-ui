// @vitest-environment node
/**
 * Every code agent-server answers with has a message in both languages. The codes are read from the server's own
 * source, so a code added there without a string here fails this suite.
 *
 * The source is found at `$AGENT_SERVER_SRC`, or in a sibling checkout (`../agent-server-feat-hitl/src`,
 * `../agent-server/src`); without one the suite is skipped, as in a checkout of this repository alone. (It uses Node
 * modules, so `tsconfig.json` leaves `*.contract.test.ts` out of `npm run typecheck`.)
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import tr from "../locales/tr.json";

function locateServerSource(): string | undefined {
  const root = process.cwd();
  const candidates = [
    process.env.AGENT_SERVER_SRC,
    path.resolve(root, "../agent-server-feat-hitl/src"),
    path.resolve(root, "../agent-server/src"),
  ];
  return candidates.find((dir): dir is string => Boolean(dir) && fs.existsSync(path.join(dir as string, "swagger.ts")));
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name) ? [full] : [];
  });
}

const serverSource = locateServerSource();

describe.skipIf(!serverSource)("every code the agent server answers with", () => {
  const codes = new Set<string>();
  if (serverSource) {
    for (const file of sourceFiles(serverSource)) {
      for (const match of fs.readFileSync(file, "utf8").matchAll(/\bcode:\s*["']([A-Za-z][A-Za-z_]*)["']/g)) {
        codes.add(match[1]!.toLowerCase());
      }
    }
  }

  it("is found in the source (the pattern still matches how the server writes a code)", () => {
    expect(codes.size).toBeGreaterThan(30);
    for (const code of ["conversation_busy", "invalid_message_target", "invalid_feedback", "export_format_unsupported", "action_disabled", "rate_limited"]) {
      expect(codes.has(code), code).toBe(true);
    }
  });

  it.each(Object.entries({ en, tr }))("%s has a message for each of them", (_locale, messages) => {
    const table = messages as Record<string, string>;
    // (a turn's warnings - `file_truncated` ... - are notes under the answer, with their own `chat.warning.*` strings)
    const missing = [...codes].filter((code) => !table[`chat.error.code.${code}`] && !table[`chat.warning.${code}`]);
    expect(missing).toEqual([]);
  });
});
