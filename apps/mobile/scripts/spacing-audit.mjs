import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd(), 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const violations = [];
const warnings = [];

const directNumericLayoutRule = /\b(margin(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|padding(?:Top|Bottom|Left|Right|Horizontal|Vertical)?|gap|rowGap|columnGap|top|bottom|left|right|borderRadius(?:TopLeft|TopRight|BottomLeft|BottomRight)?):\s*(-?\d+(?:\.\d+)?)\b/g;
const tokenArithmeticRule = /theme\.(spacing|radius)\.[A-Za-z]+\s*\+\s*\d+/g;
const inlineLayoutRule = /\b(?:style|contentContainerStyle|columnWrapperStyle|ListHeaderComponentStyle)\s*=\s*(?:\{\{|\[[^\]]*\{)[\s\S]{0,240}?\b(?:margin|padding|gap|rowGap|columnGap|borderRadius|top|bottom|left|right)[A-Za-z]*\s*:/g;
const transformOffsetRule = /translate[XY]\s*:\s*(?![A-Za-z_])/g;

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

function pushMatches(filePath, label, regex, source) {
    for (const match of source.matchAll(regex)) {
        const index = match.index ?? 0;
        const line = source.slice(0, index).split('\n').length;
        violations.push({
            filePath,
            line,
            label,
            snippet: match[0].trim()
        });
    }
}

function pushWarnings(filePath, label, regex, source) {
    for (const match of source.matchAll(regex)) {
        const index = match.index ?? 0;
        const line = source.slice(0, index).split('\n').length;
        warnings.push({
            filePath,
            line,
            label,
            snippet: match[0].trim()
        });
    }
}

function isAllowedDirectLayoutValue(rawValue) {
    const numericValue = Number(rawValue);

    return numericValue === 0
        || numericValue === 1
        || numericValue === 4
        || (Number.isInteger(numericValue) && numericValue % 8 === 0);
}

function pushDirectNumericLayoutViolations(filePath, source) {
    for (const match of source.matchAll(directNumericLayoutRule)) {
        if (isAllowedDirectLayoutValue(match[2])) {
            continue;
        }

        const index = match.index ?? 0;
        const line = source.slice(0, index).split('\n').length;
        violations.push({
            filePath,
            line,
            label: 'invalid-raw-layout-value',
            snippet: match[0].trim()
        });
    }
}

for (const filePath of collectFiles(ROOT_DIR)) {
    const source = fs.readFileSync(filePath, 'utf8');

    pushDirectNumericLayoutViolations(filePath, source);
    pushMatches(filePath, 'token-arithmetic', tokenArithmeticRule, source);
    pushMatches(filePath, 'inline-layout-style', inlineLayoutRule, source);
    pushWarnings(filePath, 'transform-offset-review', transformOffsetRule, source);
}

if (violations.length > 0) {
    console.error('Spacing audit failed.\n');

    for (const violation of violations) {
        const relativePath = path.relative(process.cwd(), violation.filePath);
        console.error(`${relativePath}:${violation.line} [${violation.label}] ${violation.snippet}`);
    }

    process.exit(1);
}

if (warnings.length > 0) {
    console.warn('Spacing audit warnings.\n');

    for (const warning of warnings) {
        const relativePath = path.relative(process.cwd(), warning.filePath);
        console.warn(`${relativePath}:${warning.line} [${warning.label}] ${warning.snippet}`);
    }

    console.warn('');
}

console.log('Spacing audit passed.');
