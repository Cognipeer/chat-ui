const postcss = require("postcss");

// A declaration's property is a CSS identifier: a custom property (`--x`), a vendor-prefixed one
// (`-webkit-x`) or a plain name. Anything else (`-`, `1px`, ...) makes a minifier warn with a css-syntax error.
const VALID_PROPERTY = /^(--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/;

/**
 * The declarations of a stylesheet that no CSS parser downstream will accept, with the rule they sit in.
 * (Tailwind reads a regex character class such as `[-:T]` in the sources as an arbitrary-property class and
 * writes it out as the rule `.\[-\:T\]{-:T}`.)
 */
function invalidDeclarations(css) {
  const bad = [];
  postcss.parse(css).walkDecls((decl) => {
    if (!VALID_PROPERTY.test(decl.prop)) {
      bad.push({ selector: decl.parent && decl.parent.selector, prop: decl.prop, value: decl.value });
    }
  });
  return bad;
}

module.exports = { invalidDeclarations };
