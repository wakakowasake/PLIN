const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join(rootDir, "dist", "openview.html");
const targetPath = path.join(rootDir, "functions", "openview.html");

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing build output: ${sourcePath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.copyFileSync(sourcePath, targetPath);

console.log("Synced dist/openview.html -> functions/openview.html");
