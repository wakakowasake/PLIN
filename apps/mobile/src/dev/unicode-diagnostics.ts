const seenUnicodeLogKeys = new Set<string>();
const seenImageLogKeys = new Set<string>();

function normalizeToString(value: unknown) {
    if (typeof value === 'string') {
        return value;
    }

    if (value == null) {
        return '';
    }

    return String(value);
}

function getGraphemeSegments(value: string) {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        return Array.from(
            new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
            (entry) => entry.segment
        );
    }

    return Array.from(value);
}

export type UnicodeInspection = {
    raw: string;
    json: string;
    codePoints: string[];
    length: number;
    graphemeCount: number;
    containsReplacementCharacter: boolean;
};

export function inspectUnicode(value: unknown): UnicodeInspection {
    const raw = normalizeToString(value);
    const codePoints = Array.from(raw).map((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint == null
            ? 'U+UNKNOWN'
            : `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
    });

    return {
        raw,
        json: JSON.stringify(raw),
        codePoints,
        length: raw.length,
        graphemeCount: getGraphemeSegments(raw).length,
        containsReplacementCharacter: raw.includes('\uFFFD')
    };
}

export function formatUnicodeInspection(inspection: UnicodeInspection) {
    return [
        `raw: ${inspection.raw || '(empty)'}`,
        `json: ${inspection.json}`,
        `code points: ${inspection.codePoints.join(' ') || '(none)'}`,
        `length: ${inspection.length}`,
        `graphemes: ${inspection.graphemeCount}`,
        `replacement: ${inspection.containsReplacementCharacter ? 'yes' : 'no'}`
    ].join('\n');
}

export function logUnicodeBoundary(
    boundary: string,
    field: string,
    value: unknown,
    extra?: Record<string, unknown>
) {
    if (!__DEV__) {
        return;
    }

    const inspection = inspectUnicode(value);
    const logKey = `${boundary}|${field}|${inspection.json}`;

    if (seenUnicodeLogKeys.has(logKey)) {
        return;
    }

    seenUnicodeLogKeys.add(logKey);

    console.info('[emoji-diagnostics]', {
        boundary,
        field,
        raw: inspection.raw,
        json: inspection.json,
        codePoints: inspection.codePoints,
        length: inspection.length,
        graphemeCount: inspection.graphemeCount,
        containsReplacementCharacter: inspection.containsReplacementCharacter,
        ...extra
    });
}

function classifyImageSource(raw: string) {
    const normalized = raw.trim().toLowerCase();

    if (!normalized) {
        return 'none';
    }

    if (normalized.includes('images.unsplash.com') || normalized.includes('api.unsplash.com')) {
        return 'unsplash';
    }

    if (
        normalized.includes('maps.googleapis.com/maps/api/place/photo')
        || normalized.includes('googleusercontent.com')
        || normalized.includes('gstatic.com')
        || normalized.includes('ggpht.com')
        || normalized.includes('maps.googleapis.com')
    ) {
        return 'google';
    }

    if (normalized.includes('storage.googleapis.com')) {
        return 'storage';
    }

    return 'other';
}

export function logImageBoundary(
    boundary: string,
    field: string,
    value: unknown,
    extra?: Record<string, unknown>
) {
    if (!__DEV__) {
        return;
    }

    const raw = normalizeToString(value).trim();
    const logKey = `${boundary}|${field}|${raw}`;

    if (seenImageLogKeys.has(logKey)) {
        return;
    }

    seenImageLogKeys.add(logKey);

    console.info('[image-diagnostics]', {
        boundary,
        field,
        raw,
        source: classifyImageSource(raw),
        ...extra
    });
}
