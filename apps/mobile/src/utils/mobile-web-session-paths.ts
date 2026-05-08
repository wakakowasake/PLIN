function normalizeBasePath(basePath: string) {
    const normalized = String(basePath || '').trim();

    if (!normalized || normalized === '/') {
        return '';
    }

    return `/${normalized.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function normalizePathname(pathname: string) {
    const normalized = String(pathname || '').trim();
    if (!normalized || normalized === '/') {
        return '/';
    }

    return `/${normalized.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function buildMobileWebPath(relativePath: string, basePath: string) {
    const normalizedBasePath = normalizeBasePath(basePath);
    const normalizedRelativePath = String(relativePath || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');

    if (!normalizedRelativePath) {
        return normalizedBasePath || '/';
    }

    return `${normalizedBasePath || ''}/${normalizedRelativePath}`;
}

function tryParseUrl(value: string, origin: string) {
    try {
        return new URL(value, origin);
    } catch {
        return null;
    }
}

function deleteSearchParams(url: URL, keys: string[]) {
    keys.forEach((key) => {
        url.searchParams.delete(key);
    });
}

export function buildDefaultMobileWebRelativeUrl(basePath = '') {
    return normalizeBasePath(basePath) || '/';
}

export function isMobileWebAuthCallbackPathname(pathname: string, basePath = '') {
    const normalizedPathname = normalizePathname(pathname);

    return normalizedPathname === normalizePathname(buildMobileWebPath('oauthredirect', basePath))
        || normalizedPathname === normalizePathname(buildMobileWebPath('auth/social-complete', basePath));
}

export function sanitizeMobileWebReturnTo(
    value: string | null | undefined,
    options?: {
        basePath?: string;
        origin?: string;
    }
) {
    const basePath = options?.basePath ?? '';
    const origin = String(options?.origin || 'https://plin.ink').trim() || 'https://plin.ink';
    const fallback = buildDefaultMobileWebRelativeUrl(basePath);
    const parsed = tryParseUrl(String(value || '').trim(), origin);

    if (!parsed || parsed.origin !== origin) {
        return fallback;
    }

    const isCallbackPath = isMobileWebAuthCallbackPathname(parsed.pathname, basePath);
    if (isCallbackPath) {
        parsed.pathname = fallback;
    }

    deleteSearchParams(parsed, ['invite', 'token']);

    if (isCallbackPath) {
        deleteSearchParams(parsed, [
            'provider',
            'ticket',
            'error',
            'code',
            'state',
            'scope',
            'authuser',
            'prompt'
        ]);
    }

    const normalizedPathname = normalizePathname(parsed.pathname);
    const nextRelativeUrl = `${normalizedPathname}${parsed.search}${parsed.hash}`;

    return nextRelativeUrl || fallback;
}
