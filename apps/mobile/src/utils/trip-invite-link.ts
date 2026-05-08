function normalizeToken(value: string | null | undefined) {
    const safeValue = String(value || '').trim();
    if (!safeValue) {
        return null;
    }

    try {
        return decodeURIComponent(safeValue);
    } catch {
        return safeValue;
    }
}

function parseInviteUrl(url: string) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl) {
        return null;
    }

    try {
        return new URL(safeUrl);
    } catch {
        try {
            return new URL(safeUrl, 'https://plin.ink');
        } catch {
            return null;
        }
    }
}

function readTokenFromPathSegments(pathSegments: string[]) {
    const [firstSegment, secondSegment] = pathSegments.map((segment) => segment.toLowerCase());

    if (firstSegment === 'v' && secondSegment === 'invite') {
        return normalizeToken(pathSegments[2]);
    }

    if (firstSegment === 'invite' || firstSegment === 'invites') {
        return normalizeToken(pathSegments[1]);
    }

    if (firstSegment === 'join' && secondSegment === 'invite') {
        return normalizeToken(pathSegments[2]);
    }

    return null;
}

function readPublicTokenFromPathSegments(pathSegments: string[]) {
    const [firstSegment] = pathSegments.map((segment) => segment.toLowerCase());

    if (firstSegment === 'p') {
        return normalizeToken(pathSegments[1]);
    }

    if (firstSegment === 'public-trip' || firstSegment === 'public-trips') {
        return normalizeToken(pathSegments[1]);
    }

    return null;
}

export function readTripInviteTokenFromUrl(url: string) {
    const parsedUrl = parseInviteUrl(url);
    if (!parsedUrl) {
        return null;
    }

    const inviteQueryToken = normalizeToken(parsedUrl.searchParams.get('invite'));
    if (inviteQueryToken) {
        return inviteQueryToken;
    }

    const tokenQueryToken = normalizeToken(parsedUrl.searchParams.get('token'));
    if (tokenQueryToken) {
        return tokenQueryToken;
    }

    const pathSegments = parsedUrl.pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
    const pathToken = readTokenFromPathSegments(pathSegments);
    if (pathToken) {
        return pathToken;
    }

    if (parsedUrl.protocol === 'plinmobile:' && parsedUrl.hostname.toLowerCase() === 'invite') {
        return normalizeToken(pathSegments[0]);
    }

    return null;
}

export function readPublicTripTokenFromUrl(url: string) {
    const parsedUrl = parseInviteUrl(url);
    if (!parsedUrl) {
        return null;
    }

    const publicTripQueryToken = normalizeToken(parsedUrl.searchParams.get('publicTrip'));
    if (publicTripQueryToken) {
        return publicTripQueryToken;
    }

    const publicQueryToken = normalizeToken(parsedUrl.searchParams.get('public'));
    if (publicQueryToken) {
        return publicQueryToken;
    }

    const pathSegments = parsedUrl.pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
    const pathToken = readPublicTokenFromPathSegments(pathSegments);
    if (pathToken) {
        return pathToken;
    }

    const host = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.protocol === 'plinmobile:' && (host === 'p' || host === 'public-trip')) {
        return normalizeToken(pathSegments[0] || parsedUrl.searchParams.get('token'));
    }

    return null;
}
