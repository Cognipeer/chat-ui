const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'dist/index.js',
  'dist/index.mjs',
  'dist/index.d.ts',
  'dist/styles.css',
];

const missing = requiredFiles.filter((relativePath) => {
  const absolutePath = path.join(__dirname, '..', relativePath);
  return !fs.existsSync(absolutePath);
});

if (missing.length > 0) {
  console.error('[verify-dist] Missing required build artifacts:');
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

// The stylesheet is shipped as is: a rule a consumer's minifier cannot parse shows up as a css-syntax warning in every build
const { invalidDeclarations } = require('./css-check');
const invalid = invalidDeclarations(fs.readFileSync(path.join(__dirname, '..', 'dist/styles.css'), 'utf8'));
if (invalid.length > 0) {
  console.error('[verify-dist] dist/styles.css has declarations that are not valid CSS:');
  for (const d of invalid) console.error(`- ${d.selector} { ${d.prop}: ${d.value} }`);
  process.exit(1);
}

console.log('[verify-dist] Build artifacts are complete.');
