const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const relativePaths = process.argv.slice(2);

if (!relativePaths.length) {
  console.error("Usage: node scripts/rm-paths.cjs <path> [more paths...]");
  process.exit(1);
}

for (const relativePath of relativePaths) {
  const targetPath = path.resolve(rootDir, relativePath);
  fs.rmSync(targetPath, { recursive: true, force: true });
  console.log(`Removed ${relativePath}`);
}
