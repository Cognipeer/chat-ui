import { describe, expect, it } from "vitest";
import en from "./en.json";
import tr from "./tr.json";

const placeholders = (text: string) => Array.from(text.matchAll(/\{(\w+)/g), (m) => m[1]).sort();

describe("locales", () => {
  it("en and tr have the same keys", () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });

  it("every string uses the same placeholders in both languages", () => {
    const a = en as Record<string, string>;
    const b = tr as Record<string, string>;
    for (const key of Object.keys(a)) {
      expect(placeholders(b[key]), key).toEqual(placeholders(a[key]));
    }
  });

  it("no string is empty", () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(tr)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });
});
