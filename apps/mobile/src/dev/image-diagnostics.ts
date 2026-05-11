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
