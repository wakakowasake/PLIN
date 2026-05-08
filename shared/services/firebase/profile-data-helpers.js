function normalizeProfilePhotoUrl(value = '') {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';

    try {
        const parsed = new URL(raw);
        if (parsed.protocol === 'http:' && /(^|\.)kakaocdn\.net$/i.test(parsed.hostname)) {
            parsed.protocol = 'https:';
            return parsed.toString();
        }
        return parsed.toString();
    } catch (error) {
        return raw;
    }
}

export function buildUserProfileSeed(user, overrides = {}) {
    return {
        email: user?.email || '',
        displayName: user?.displayName || '',
        photoURL: normalizeProfilePhotoUrl(user?.photoURL || ''),
        ...overrides
    };
}
