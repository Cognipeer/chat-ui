// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { invalidDeclarations } = require("./css-check.js");

describe("the stylesheet the package ships", () => {
  it("finds a declaration that is not valid CSS", () => {
    expect(invalidDeclarations(".a{color:red;--x:1;-webkit-foo:2}")).toEqual([]);
    expect(invalidDeclarations(".\\[-\\:T\\]{-:T}")).toEqual([{ selector: ".\\[-\\:T\\]", prop: "-", value: "T" }]);
  });

  it("is built from the sources without any rule a minifier would warn about", async () => {
    const fs = require("node:fs");
    const postcss = require("postcss");
    const tailwind = require("tailwindcss");
    const config = require("../tailwind.config.js");
    const source = fs.readFileSync(new URL("../src/styles/globals.css", import.meta.url), "utf8");
    const out = await postcss([tailwind(config)]).process(source, { from: new URL("../src/styles/globals.css", import.meta.url).pathname });
    expect(invalidDeclarations(out.css)).toEqual([]);
    // sanity: the build did scan the sources
    expect(out.css).toContain(".chat-container");
  }, 60_000);

  it("keeps the character class that the scanner used to turn into a rule out of the sources", () => {
    const fs = require("node:fs");
    const input = fs.readFileSync(new URL("../src/components/chat/ChatInput.tsx", import.meta.url), "utf8");
    // digits only: no bracketed class with a colon in it
    expect(input).not.toMatch(/\[-:T\]/);
  });
});
