import { getMobileEnv } from '@/config/mobile-runtime-config';
import { getMobileAuth, hasMobileFirebaseConfig } from '@/adapters/firebase/mobile-firebase';

const DEFAULT_BACKEND_URL = 'https://asia-northeast3-plin-db93d.cloudfunctions.net/api';
const BACKEND_URL = getMobileEnv('backendUrl', DEFAULT_BACKEND_URL);

export class BackendRequestError<T = unknown> extends Error {
    status: number;
    payload: T | null;

    constructor(message: string, status: number, payload: T | null) {
        super(message);
        this.name = 'BackendRequestError';
        this.status = status;
        this.payload = payload;
    }
}

function normalizePath(path: string) {
    const safePath = String(path || '').trim();
    if (!safePath) {
        return BACKEND_URL;
    }

    if (/^https?:\/\//i.test(safePath)) {
        return safePath;
    }

    return `${BACKEND_URL}${safePath.startsWith('/') ? safePath : `/${safePath}`}`;
}

async function readIdToken(requireAuth = true) {
    if (requireAuth === false) {
        if (!hasMobileFirebaseConfig()) {
            return '';
        }

        try {
            const user = getMobileAuth().currentUser;

            if (!user) {
                return '';
            }

            return await user.getIdToken();
        } catch {
            return '';
        }
    }

    const auth = getMobileAuth();
    let user = auth.currentUser;

    if (!user && requireAuth) {
        try {
            await auth.authStateReady();
        } catch {
            // Fall through to the standard auth-required error below.
        }

        user = auth.currentUser;
    }

    if (!user) {
        if (requireAuth) {
            throw new Error('로그인이 필요합니다.');
        }

        return '';
    }

    return user.getIdToken();
}

async function parseBackendResponse<T>(response: Response): Promise<T> {
    let payload: unknown = null;

    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const message = typeof payload === 'object' && payload && 'message' in payload
            ? String((payload as { message?: string }).message || '')
            : '';
        const fallback = typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error?: string }).error || '')
            : '';
        throw new BackendRequestError(
            message || fallback || `요청에 실패했습니다. (${response.status})`,
            response.status,
            payload
        );
    }

    return payload as T;
}

export async function fetchBackendJson<T>(
    path: string,
    options?: {
        method?: string;
        body?: unknown;
        headers?: Record<string, string>;
        requireAuth?: boolean;
        signal?: AbortSignal;
    }
): Promise<T> {
    const {
        method = 'GET',
        body,
        headers = {},
        requireAuth = true,
        signal
    } = options || {};
    const requestHeaders = new Headers(headers);
    const payloadBody = body instanceof FormData
        ? body
        : body === undefined
            ? undefined
            : JSON.stringify(body);

    if (!(body instanceof FormData) && body !== undefined && !requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
    }

    const idToken = await readIdToken(requireAuth);
    if (idToken) {
        requestHeaders.set('Authorization', `Bearer ${idToken}`);
    }

    const response = await fetch(normalizePath(path), {
        method,
        headers: requestHeaders,
        body: payloadBody,
        signal
    });

    return parseBackendResponse<T>(response);
}

export function readBackendUrl() {
    return BACKEND_URL;
}
