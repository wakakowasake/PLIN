import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd(), 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const FULL_RADIUS_SNIPPET = 'borderRadius: theme.radius.full';

function collectFiles(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    return entries.flatMap((entry) => {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            return collectFiles(entryPath);
        }

        return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
    });
}

function categorizeKey(styleKey) {
    const normalizedKey = styleKey.toLowerCase();

    if (/(avatar|handle|dot|indicator|stroke|clapper|cap|marker|ring|orb|spinner|divider|frame)/.test(normalizedKey)) {
        return 'circular_or_handle';
    }

    if (/(loading|placeholder|skeleton|bar)/.test(normalizedKey)) {
        return 'loading_or_placeholder';
    }

    if (/(chip|pill|badge|tag|label)/.test(normalizedKey)) {
        return 'chip_badge_pill';
    }

    if (/(button|action|toggle|close)/.test(normalizedKey)) {
        return 'button_or_control';
    }

    if (/(image|photo|thumb|visual|cover)/.test(normalizedKey)) {
        return 'media_or_preview';
    }

    return 'other';
}

const hits = [];

for (const filePath of collectFiles(ROOT_DIR)) {
    const source = fs.readFileSync(filePath, 'utf8');
    const lines = source.split('\n');
    let currentStyleKey = 'unknown';

    for (let index = 0; index < lines.length; index += 1) {
        const styleKeyMatch = lines[index].match(/^\s*([A-Za-z0-9_]+):\s*\{$/);

        if (styleKeyMatch) {
            currentStyleKey = styleKeyMatch[1];
        }

        if (lines[index].includes(FULL_RADIUS_SNIPPET)) {
            hits.push({
                filePath,
                line: index + 1,
                styleKey: currentStyleKey,
                category: categorizeKey(currentStyleKey)
            });
        }
    }
}

const categoryOrder = [
    'circular_or_handle',
    'loading_or_placeholder',
    'chip_badge_pill',
    'button_or_control',
    'media_or_preview',
    'other'
];

const categoryCounts = Object.fromEntries(
    categoryOrder.map((category) => [category, hits.filter((hit) => hit.category === category).length])
);

const perFileCounts = hits.reduce((accumulator, hit) => {
    const relativePath = path.relative(process.cwd(), hit.filePath);
    accumulator.set(relativePath, (accumulator.get(relativePath) ?? 0) + 1);
    return accumulator;
}, new Map());

const reviewTargets = hits.filter((hit) => hit.category === 'chip_badge_pill' || hit.category === 'button_or_control' || hit.category === 'other');

console.log('Radius.full usage report\n');
console.log(`Total occurrences: ${hits.length}\n`);
console.log('Category counts:');

for (const category of categoryOrder) {
    console.log(`- ${category}: ${categoryCounts[category]}`);
}

console.log('\nTop files:');

for (const [relativePath, count] of [...perFileCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10)) {
    console.log(`- ${relativePath}: ${count}`);
}

console.log(`\nReview-target occurrences: ${reviewTargets.length}`);

for (const hit of reviewTargets.slice(0, 25)) {
    const relativePath = path.relative(process.cwd(), hit.filePath);
    console.log(`- ${relativePath}:${hit.line} ${hit.styleKey} [${hit.category}]`);
}
