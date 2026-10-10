import { describe, expect, it } from "vitest";
import { jsonEqual, parseArgsText, validateAgainstSchema } from "./jsonSchema";

const schema = {
  type: "object",
  required: ["command"],
  additionalProperties: false,
  properties: {
    command: { type: "string", minLength: 1, maxLength: 20 },
    timeout: { type: "integer", minimum: 1, maximum: 60 },
    mode: { enum: ["fast", "safe"] },
    tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 },
    path: { type: "string", pattern: "^/" },
    nested: { type: "object", properties: { depth: { type: "number", exclusiveMinimum: 0 } } },
    either: { anyOf: [{ type: "string" }, { type: "number" }] },
  },
};

const codes = (value: unknown, s: unknown = schema) => validateAgainstSchema(value, s).map((i) => `${i.path}:${i.code}`);

describe("validateAgainstSchema", () => {
  it("accepts a call that fits", () => {
    expect(codes({ command: "ls", timeout: 5, mode: "safe", tags: ["a"], path: "/tmp", nested: { depth: 1 }, either: 3 })).toEqual([]);
  });

  it("accepts anything without a schema, and ignores keywords it does not know", () => {
    expect(validateAgainstSchema({ any: "thing" }, undefined)).toEqual([]);
    expect(validateAgainstSchema({ a: 1 }, { type: "object", properties: { a: { $ref: "#/defs/x", format: "date" } } })).toEqual([]);
  });

  it("reports each kind of mismatch with where it is", () => {
    expect(codes({})).toEqual(["command:required"]);
    expect(codes({ command: 5 })).toEqual(["command:type"]);
    expect(codes({ command: "" })).toEqual(["command:minLength"]);
    expect(codes({ command: "x".repeat(21) })).toEqual(["command:maxLength"]);
    expect(codes({ command: "ls", timeout: 1.5 })).toEqual(["timeout:type"]);
    expect(codes({ command: "ls", timeout: 0 })).toEqual(["timeout:min"]);
    expect(codes({ command: "ls", timeout: 61 })).toEqual(["timeout:max"]);
    expect(codes({ command: "ls", mode: "wild" })).toEqual(["mode:enum"]);
    expect(codes({ command: "ls", tags: [] })).toEqual(["tags:minItems"]);
    expect(codes({ command: "ls", tags: ["a", "b", "c"] })).toEqual(["tags:maxItems"]);
    expect(codes({ command: "ls", tags: ["a", 2] })).toEqual(["tags[1]:type"]);
    expect(codes({ command: "ls", path: "tmp" })).toEqual(["path:pattern"]);
    expect(codes({ command: "ls", nested: { depth: 0 } })).toEqual(["nested.depth:exclusiveMin"]);
    expect(codes({ command: "ls", either: true })).toEqual(["either:anyOf"]);
    expect(codes({ command: "ls", extra: 1 })).toEqual(["extra:additional"]);
  });

  it("states what was expected", () => {
    expect(validateAgainstSchema({ command: 5 }, schema)[0]).toMatchObject({ code: "type", expected: "string" });
    expect(validateAgainstSchema({ command: "ls", mode: "wild" }, schema)[0]).toMatchObject({ code: "enum", expected: '"fast", "safe"' });
    expect(validateAgainstSchema({ command: "ls", timeout: 99 }, schema)[0]).toMatchObject({ code: "max", expected: "60" });
  });

  it("supports union types and const", () => {
    expect(codes("a", { type: ["string", "null"] })).toEqual([]);
    expect(codes(null, { type: ["string", "null"] })).toEqual([]);
    expect(codes(1, { type: ["string", "null"] })).toEqual([":type"]);
    expect(codes("x", { const: "y" })).toEqual([":const"]);
  });
});

describe("parseArgsText", () => {
  it("returns the object, or says why not", () => {
    expect(parseArgsText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseArgsText("{oops")).toEqual({ ok: false, reason: "syntax" });
    expect(parseArgsText("[1,2]")).toEqual({ ok: false, reason: "not_object" });
    expect(parseArgsText("42")).toEqual({ ok: false, reason: "not_object" });
    expect(parseArgsText("null")).toEqual({ ok: false, reason: "not_object" });
  });
});

describe("jsonEqual", () => {
  it("ignores key order but not values", () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
  });
});
