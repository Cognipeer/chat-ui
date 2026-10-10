/**
 * A small JSON Schema checker for the arguments of a tool call an approver edits.
 *
 * It covers what tool schemas use in practice: `type` (incl. unions), `enum`, `const`,
 * `properties` / `required` / `additionalProperties: false`, `items`, `minimum` /
 * `maximum`, `minLength` / `maxLength` / `pattern`, `minItems` / `maxItems`, `anyOf` /
 * `oneOf` / `allOf`. Keywords it does not know (`$ref`, `format`, ...) are ignored,
 * so a schema it cannot fully check never blocks a valid edit; the server validates again.
 */

export type SchemaIssueCode =
  | "type"
  | "required"
  | "enum"
  | "const"
  | "additional"
  | "min"
  | "max"
  | "exclusiveMin"
  | "exclusiveMax"
  | "minLength"
  | "maxLength"
  | "minItems"
  | "maxItems"
  | "pattern"
  | "anyOf";

export interface SchemaIssue {
  /** Where, as `a.b[0]`; empty for the root */
  path: string;
  code: SchemaIssueCode;
  /** The expected type(s), allowed values, or the limit, as text */
  expected?: string;
}

type Schema = Record<string, unknown>;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return typeOf(value) === "object";
    default:
      return typeOf(value) === type;
  }
}

/** Structural equality for JSON values (key order does not matter). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  }
  if (typeOf(a) === "object") {
    const x = a as Record<string, unknown>;
    const y = b as Record<string, unknown>;
    const keys = Object.keys(x);
    return keys.length === Object.keys(y).length && keys.every((k) => k in y && jsonEqual(x[k], y[k]));
  }
  return false;
}

function check(value: unknown, schema: unknown, path: string, out: SchemaIssue[]): void {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const s = schema as Schema;
  const here = (code: SchemaIssueCode, expected?: string) => out.push({ path, code, expected });

  const types = Array.isArray(s.type) ? (s.type as string[]) : typeof s.type === "string" ? [s.type] : undefined;
  if (types && !types.some((t) => matchesType(value, t))) {
    here("type", types.join(" | "));
    return; // the keywords below assume the right type
  }

  if (Array.isArray(s.enum) && !s.enum.some((option) => jsonEqual(option, value))) {
    here("enum", s.enum.map((option) => JSON.stringify(option)).join(", "));
  }
  if ("const" in s && !jsonEqual(s.const, value)) here("const", JSON.stringify(s.const));

  if (Array.isArray(s.allOf)) for (const sub of s.allOf) check(value, sub, path, out);
  for (const key of ["anyOf", "oneOf"] as const) {
    const options = s[key];
    if (Array.isArray(options) && options.length > 0) {
      const matches = options.some((option) => {
        const inner: SchemaIssue[] = [];
        check(value, option, path, inner);
        return inner.length === 0;
      });
      if (!matches) here("anyOf");
    }
  }

  if (typeof value === "number") {
    if (typeof s.minimum === "number" && value < s.minimum) here("min", String(s.minimum));
    if (typeof s.maximum === "number" && value > s.maximum) here("max", String(s.maximum));
    if (typeof s.exclusiveMinimum === "number" && value <= s.exclusiveMinimum) here("exclusiveMin", String(s.exclusiveMinimum));
    if (typeof s.exclusiveMaximum === "number" && value >= s.exclusiveMaximum) here("exclusiveMax", String(s.exclusiveMaximum));
  }

  if (typeof value === "string") {
    if (typeof s.minLength === "number" && value.length < s.minLength) here("minLength", String(s.minLength));
    if (typeof s.maxLength === "number" && value.length > s.maxLength) here("maxLength", String(s.maxLength));
    if (typeof s.pattern === "string") {
      try {
        if (!new RegExp(s.pattern).test(value)) here("pattern");
      } catch {
        // a pattern this engine cannot read is not the person's problem
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof s.minItems === "number" && value.length < s.minItems) here("minItems", String(s.minItems));
    if (typeof s.maxItems === "number" && value.length > s.maxItems) here("maxItems", String(s.maxItems));
    if (s.items && typeof s.items === "object" && !Array.isArray(s.items)) {
      value.forEach((item, i) => check(item, s.items, `${path}[${i}]`, out));
    }
  }

  if (typeOf(value) === "object") {
    const obj = value as Record<string, unknown>;
    const props = (s.properties && typeof s.properties === "object" ? s.properties : {}) as Record<string, unknown>;
    if (Array.isArray(s.required)) {
      for (const key of s.required) {
        if (typeof key === "string" && !(key in obj)) {
          out.push({ path: path ? `${path}.${key}` : key, code: "required" });
        }
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) check(obj[key], sub, path ? `${path}.${key}` : key, out);
    }
    if (s.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) out.push({ path: path ? `${path}.${key}` : key, code: "additional" });
      }
    } else if (s.additionalProperties && typeof s.additionalProperties === "object") {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) check(obj[key], s.additionalProperties, path ? `${path}.${key}` : key, out);
      }
    }
  }
}

/** What is wrong with `value` against `schema`; empty when it fits (or there is no schema). */
export function validateAgainstSchema(value: unknown, schema: unknown): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  check(value, schema, "", issues);
  return issues;
}

export type ArgsParse =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: "syntax" | "not_object" };

/** Parses the text of an arguments editor: it has to be a JSON object. */
export function parseArgsText(text: string): ArgsParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "syntax" };
  }
  if (typeOf(parsed) !== "object") return { ok: false, reason: "not_object" };
  return { ok: true, value: parsed as Record<string, unknown> };
}
