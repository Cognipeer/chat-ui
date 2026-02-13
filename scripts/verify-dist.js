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

console.log('[verify-dist] Build artifacts are complete.');
