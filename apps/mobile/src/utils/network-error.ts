const NETWORK_ERROR_CODES = new Set([
    'cancelled',
    'deadline-exceeded',
    'network-request-failed',
    'resource-exhausted',
    'unavailable'
]);

const SESSION_ERROR_CODES = new Set([
    'permission-denied',
    'unauthenticated'
]);

const NETWORK_MESSAGE_PATTERNS = [
    'connection',
    'fetch',
    'internet',
    'network',
    'offline',
    'socket',
    'timeout',
    'timed out',
    '연결',
    '네트워크',
    '오프라인'
];

export function readErrorCode(error: unknown) {
    if (!error || typeof error !== 'object') {
        return '';
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
}

export function readErrorMessage(error: unknown) {
    if (error instanceof Error && typeof error.message === 'string') {
        return error.message;
    }

    if (!error || typeof error !== 'object') {
        return '';
    }

    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
}

export function isSessionLikeError(error: unknown) {
    return SESSION_ERROR_CODES.has(readErrorCode(error));
}

export function isNetworkLikeError(error: unknown) {
    const code = readErrorCode(error);
    if (NETWORK_ERROR_CODES.has(code)) {
        return true;
    }

    const message = readErrorMessage(error).toLowerCase();
    return NETWORK_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
}
