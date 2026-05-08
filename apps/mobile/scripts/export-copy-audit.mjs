import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const SRC_ROOT = path.join(APP_ROOT, 'src');
const OUTPUT_PATH = path.join(APP_ROOT, 'reports', 'mobile-copy-audit.csv');

const COPY_NAME_PATTERN = /(?:title|label|text|message|description|support|placeholder|header|caption|subtitle|meta|button|action|cta|hint|error|warning|empty|copy|prompt|summary|notice|body|helper|status|question|sheet|dialog|toast|banner)$/i;
const USER_FACING_CALL_PATTERN = /(?:alert|toast|confirm|prompt|notify|snackbar|banner|error|set[A-Z].*(?:Title|Label|Text|Message|Description|Support|Placeholder|Header|Caption|Subtitle|Meta|Button|Action|Cta|Hint|Error|Warning|Empty|Copy|Summary|Notice|Body|Helper|Status))$/i;
const TECHNICAL_LITERAL_PATTERN = /^(?:#[0-9a-f]{3,8}|https?:\/\/|\/|\.{1,2}\/|[A-Za-z0-9_.-]+\.(?:png|jpe?g|gif|svg|webp|heic|heif|json|js|ts|tsx|mjs|cjs)|[A-Z0-9_]+|[a-z-]+(?:\/[a-z-]+)*)$/;
const TEMPLATE_PLACEHOLDER_PATTERN = /\$\{([^}]+)\}/g;

function normalizeWhitespace(value) {
    return String(value || '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function normalizeJsxText(value) {
    return String(value || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();
}

function displayText(value) {
    return String(value || '').replace(/\n/g, '\\n');
}

function containsHangul(value) {
    return /[가-힣]/.test(String(value || ''));
}

function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function getNodeNameText(nameNode) {
    if (!nameNode) {
        return '';
    }

    if (ts.isIdentifier(nameNode) || ts.isPrivateIdentifier(nameNode) || ts.isStringLiteral(nameNode)) {
        return nameNode.text;
    }

    if (ts.isComputedPropertyName(nameNode)) {
        return nameNode.expression.getText();
    }

    return nameNode.getText();
}

function getJsxTagNameText(tagName) {
    if (!tagName) {
        return '';
    }

    if (ts.isIdentifier(tagName)) {
        return tagName.text;
    }

    if (ts.isPropertyAccessExpression(tagName)) {
        return tagName.name.text;
    }

    return tagName.getText();
}

function getCallName(node) {
    if (!node) {
        return '';
    }

    if (ts.isIdentifier(node)) {
        return node.text;
    }

    if (ts.isPropertyAccessExpression(node)) {
        return node.name.text;
    }

    return node.getText();
}

function isLikelyCopyName(name) {
    const normalized = String(name || '').trim();
    if (!normalized) {
        return false;
    }

    if (/^on[A-Z]/.test(normalized)) {
        return false;
    }

    return COPY_NAME_PATTERN.test(normalized);
}

function isTechnicalLiteral(text) {
    return TECHNICAL_LITERAL_PATTERN.test(String(text || '').trim());
}

function looksLikeEmbeddedCode(text) {
    const normalized = String(text || '');
    return (
        /<!doctype html|<html|<\/script>|window\.|google\.maps|ReactNativeWebView|function\s+\w+\(|const\s+\w+\s*=/.test(normalized)
        || normalized.split('\n').length > 40
    );
}

function normalizeExpression(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildFallbackPlaceholderLabel(expression) {
    const normalized = normalizeExpression(expression);
    const lower = normalized.toLowerCase();

    if (/query|search/.test(lower)) {
        return '검색어';
    }

    if (/title/.test(lower)) {
        return '제목';
    }

    if (/author/.test(lower)) {
        return '작성자';
    }

    if (/provider/.test(lower)) {
        return '로그인 수단';
    }

    if (/date/.test(lower)) {
        return '날짜';
    }

    if (/time/.test(lower)) {
        return '시간';
    }

    if (/count|length/.test(lower)) {
        return '개수';
    }

    if (/location|place/.test(lower)) {
        return '장소';
    }

    if (/amount|total|price|cost|won|expense/.test(lower)) {
        return '금액';
    }

    if (/day/.test(lower)) {
        return '일수';
    }

    return '값';
}

function buildFallbackPlaceholderSample(label) {
    switch (label) {
        case '검색어':
            return '부산';
        case '제목':
            return '도쿄 여행';
        case '작성자':
            return '홍길동';
        case '로그인 수단':
            return 'Google';
        case '날짜':
            return '2026년 4월 24일';
        case '시간':
            return '오전 9:00';
        case '개수':
            return '3';
        case '장소':
            return '도쿄역';
        case '금액':
            return '12,000원';
        case '일수':
            return '3';
        default:
            return '예시';
    }
}

function inferPlaceholderInfo(expression) {
    const normalized = normalizeExpression(expression);
    const lower = normalized.toLowerCase();

    if (/getproviderlabel\(provider\)|providerlabel|providerlabel/.test(lower) || /^provider$/.test(lower)) {
        return { label: '로그인 수단', sample: 'Google' };
    }

    if (/authorname/.test(lower)) {
        return { label: '작성자', sample: '홍길동' };
    }

    if (/community_share_base_url/.test(lower)) {
        return { label: '공유 링크', sample: 'https://plin.ink/community/sample' };
    }

    if (/safetitle|basetitle|post\.title|trip\.title|duplicatedtrip\.title|route\.params\.itemtitle|option\.title/.test(lower)) {
        return { label: '제목', sample: '도쿄 여행' };
    }

    if (/trimmedsearchquery|query/.test(lower)) {
        return { label: '검색어', sample: '부산' };
    }

    if (/item\.title|item\.badgelabel/.test(lower)) {
        return { label: '일정명', sample: '오전 산책' };
    }

    if (/itemhasreminder/.test(lower)) {
        return { label: '알림 동작', sample: '켜기' };
    }

    if (/memoriescount/.test(lower)) {
        return { label: '추억 수', sample: '3' };
    }

    if (/photopreviewurls\.length/.test(lower)) {
        return { label: '사진 수', sample: '4' };
    }

    if (/hours/.test(lower)) {
        return { label: '시간', sample: '2' };
    }

    if (/remainingminutes|minutes/.test(lower)) {
        return { label: '분', sample: '30' };
    }

    if (/date\.getfullyear|parsed\.getfullyear/.test(lower)) {
        return { label: '연도', sample: '2026' };
    }

    if (/date\.getmonth\(\) \+ 1|parsed\.getmonth\(\) \+ 1/.test(lower)) {
        return { label: '월', sample: '4' };
    }

    if (/date\.getdate\(\)|parsed\.getdate\(\)/.test(lower)) {
        return { label: '일', sample: '24' };
    }

    if (/dayslength - 1|totaldays - 1/.test(lower)) {
        return { label: '박 수', sample: '2' };
    }

    if (/dayslength|totaldays/.test(lower)) {
        return { label: '일 수', sample: '3' };
    }

    if (/item\.location/.test(lower)) {
        return { label: '장소', sample: '도쿄역' };
    }

    if (/airplanedurationinfo\.arrivaldayoffset/.test(lower)) {
        return { label: '도착 차수', sample: '1' };
    }

    if (/meta\.tag/.test(lower)) {
        return { label: '교통 수단', sample: '항공' };
    }

    if (/genericdurationlabel/.test(lower)) {
        return { label: '이동 시간', sample: '2시간 10분' };
    }

    if (/subject/.test(lower)) {
        return { label: '설정 항목', sample: '앱 설정' };
    }

    if (/formatmissingenvkeys|missingkeys/.test(lower)) {
        return { label: '누락 항목', sample: 'GOOGLE_CLIENT_ID' };
    }

    if (/suffix/.test(lower)) {
        return { label: '추가 안내', sample: ' 누락: GOOGLE_CLIENT_ID' };
    }

    if (/fallbacklabel/.test(lower)) {
        return { label: '대체 모드', sample: '데모 데이터 표시' };
    }

    if (/formatwon|expensetotal|amount|price|cost|expense/.test(lower)) {
        return { label: '금액', sample: '12,000원' };
    }

    if (/attachmentindex/.test(lower)) {
        return { label: '첨부 번호', sample: '1' };
    }

    if (/connectedprovidercount/.test(lower)) {
        return { label: '연결 수', sample: '2' };
    }

    if (/linkedat/.test(lower)) {
        return { label: '연결 날짜', sample: '2026. 4. 24.' };
    }

    if (/pendingdeletionlabel/.test(lower)) {
        return { label: '삭제 예정일', sample: '2026년 5월 1일' };
    }

    if (/starttimelabel/.test(lower)) {
        return { label: '시작 시간', sample: '오전 9:00' };
    }

    if (/remindertimelabel/.test(lower)) {
        return { label: '알림 시간', sample: '오전 8:50' };
    }

    const fallbackLabel = buildFallbackPlaceholderLabel(normalized);
    return {
        label: fallbackLabel,
        sample: buildFallbackPlaceholderSample(fallbackLabel)
    };
}

function buildReviewText(text) {
    return String(text || '').replace(TEMPLATE_PLACEHOLDER_PATTERN, (_match, expression) => {
        const info = inferPlaceholderInfo(expression);
        return `{${info.label}}`;
    });
}

function buildExampleText(text) {
    return String(text || '').replace(TEMPLATE_PLACEHOLDER_PATTERN, (_match, expression) => {
        const info = inferPlaceholderInfo(expression);
        return info.sample;
    });
}

function renderTemplateExpression(node) {
    let result = node.head.text;
    node.templateSpans.forEach((span) => {
        result += `\${${span.expression.getText().replace(/\s+/g, ' ').trim()}}${span.literal.text}`;
    });
    return result;
}

function findNearestOwner(node) {
    let current = node.parent;

    while (current) {
        if (ts.isFunctionDeclaration(current) && current.name) {
            return current.name.text;
        }

        if ((ts.isMethodDeclaration(current) || ts.isMethodSignature(current)) && current.name) {
            return getNodeNameText(current.name);
        }

        if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && current.parent && ts.isVariableDeclaration(current.parent)) {
            return getNodeNameText(current.parent.name);
        }

        if (ts.isClassDeclaration(current) && current.name) {
            return current.name.text;
        }

        current = current.parent;
    }

    return '';
}

function findContext(node) {
    let current = node;

    while (current) {
        if (ts.isJsxAttribute(current)) {
            const propName = getNodeNameText(current.name);
            return {
                kind: 'jsx_prop',
                context: propName,
                userFacing: isLikelyCopyName(propName)
            };
        }

        if (ts.isJsxElement(current)) {
            const tagName = getJsxTagNameText(current.openingElement.tagName);
            return {
                kind: 'jsx_child',
                context: tagName,
                userFacing: tagName === 'Text'
            };
        }

        if (ts.isJsxSelfClosingElement(current)) {
            const tagName = getJsxTagNameText(current.tagName);
            return {
                kind: 'jsx_self_closing',
                context: tagName,
                userFacing: false
            };
        }

        if (ts.isVariableDeclaration(current)) {
            const variableName = getNodeNameText(current.name);
            return {
                kind: 'variable',
                context: variableName,
                userFacing: isLikelyCopyName(variableName)
            };
        }

        if (ts.isPropertyAssignment(current)) {
            const propertyName = getNodeNameText(current.name);
            return {
                kind: 'property',
                context: propertyName,
                userFacing: isLikelyCopyName(propertyName)
            };
        }

        if (ts.isCallExpression(current)) {
            const callName = getCallName(current.expression);
            return {
                kind: 'call',
                context: callName,
                userFacing: USER_FACING_CALL_PATTERN.test(callName)
            };
        }

        if (ts.isNewExpression(current)) {
            const callName = getCallName(current.expression);
            return {
                kind: 'new',
                context: callName,
                userFacing: USER_FACING_CALL_PATTERN.test(callName)
            };
        }

        if (
            ts.isImportDeclaration(current)
            || ts.isExportDeclaration(current)
            || ts.isImportSpecifier(current)
            || ts.isExportSpecifier(current)
            || ts.isExternalModuleReference(current)
        ) {
            return {
                kind: 'import',
                context: 'module',
                userFacing: false
            };
        }

        current = current.parent;
    }

    return {
        kind: 'literal',
        context: '',
        userFacing: false
    };
}

function shouldIncludeEntry(text, contextInfo) {
    const normalized = String(text || '').trim();
    if (!normalized) {
        return false;
    }

    if (contextInfo.kind === 'import') {
        return false;
    }

    if (looksLikeEmbeddedCode(normalized)) {
        return false;
    }

    if (containsHangul(normalized)) {
        if ((contextInfo.kind === 'call' || contextInfo.kind === 'new') && !contextInfo.userFacing) {
            return false;
        }

        return true;
    }

    if (contextInfo.userFacing) {
        if (contextInfo.kind === 'property' || contextInfo.kind === 'variable') {
            return false;
        }

        return !isTechnicalLiteral(normalized);
    }

    return false;
}

async function collectSourceFiles(dirPath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const nextPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...await collectSourceFiles(nextPath));
            continue;
        }

        if (!/\.(ts|tsx)$/.test(entry.name)) {
            continue;
        }

        if (/\.d\.ts$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name) || /\.spec\.(ts|tsx)$/.test(entry.name)) {
            continue;
        }

        files.push(nextPath);
    }

    return files;
}

function createEntry({ sourceFile, node, text, kindOverride }) {
    const normalized = kindOverride === 'jsx_text' ? normalizeJsxText(text) : normalizeWhitespace(text);
    if (!normalized) {
        return null;
    }

    const contextInfo = findContext(node);
    if (!shouldIncludeEntry(normalized, contextInfo)) {
        return null;
    }

    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const reviewText = buildReviewText(normalized);
    const exampleText = buildExampleText(normalized);
    return {
        file: path.relative(APP_ROOT, sourceFile.fileName),
        line: position.line + 1,
        column: position.character + 1,
        kind: kindOverride || contextInfo.kind,
        context: contextInfo.context,
        owner: findNearestOwner(node),
        raw_text: displayText(normalized),
        review_text: displayText(reviewText),
        example_text: displayText(exampleText),
        review_status: '',
        notes: ''
    };
}

function extractEntriesFromSourceFile(sourceFile) {
    const entries = [];
    const seen = new Set();

    function pushEntry(entry) {
        if (!entry) {
            return;
        }

        const key = [
            entry.file,
            entry.line,
            entry.column,
            entry.kind,
            entry.context,
            entry.raw_text
        ].join('::');

        if (seen.has(key)) {
            return;
        }

        seen.add(key);
        entries.push(entry);
    }

    function visit(node) {
        if (ts.isJsxText(node)) {
            pushEntry(createEntry({
                sourceFile,
                node,
                text: node.getText(sourceFile),
                kindOverride: 'jsx_text'
            }));
            return;
        }

        if (ts.isTemplateExpression(node)) {
            pushEntry(createEntry({
                sourceFile,
                node,
                text: renderTemplateExpression(node),
                kindOverride: 'template'
            }));
        } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            pushEntry(createEntry({
                sourceFile,
                node,
                text: node.text
            }));
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return entries;
}

async function main() {
    const sourceFiles = await collectSourceFiles(SRC_ROOT);
    const entries = [];

    for (const filePath of sourceFiles.sort()) {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const sourceFile = ts.createSourceFile(
            filePath,
            fileContent,
            ts.ScriptTarget.Latest,
            true,
            filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        );

        entries.push(...extractEntriesFromSourceFile(sourceFile));
    }

    entries.sort((left, right) => {
        if (left.file !== right.file) {
            return left.file.localeCompare(right.file);
        }

        if (left.line !== right.line) {
            return left.line - right.line;
        }

        return left.column - right.column;
    });

    const header = ['file', 'line', 'column', 'kind', 'context', 'owner', 'raw_text', 'review_text', 'example_text', 'review_status', 'notes'];
    const rows = [
        header.map(csvCell).join(','),
        ...entries.map((entry) => ([
            entry.file,
            entry.line,
            entry.column,
            entry.kind,
            entry.context,
            entry.owner,
            entry.raw_text,
            entry.review_text,
            entry.example_text,
            entry.review_status,
            entry.notes
        ].map(csvCell).join(',')))
    ];

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, `${rows.join('\n')}\n`, 'utf8');

    console.log(`Exported ${entries.length} copy rows to ${path.relative(APP_ROOT, OUTPUT_PATH)}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
