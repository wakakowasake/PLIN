import { auth } from '../../firebase.js';
import { BACKEND_URL } from './config-service.js';

const AUTH_READY_TIMEOUT_MS = 12000;

function normalizePath(path) {
    const safePath = String(path || '').trim();
    if (!safePath) {
        return BACKEND_URL;
    }

    if (/^https?:\/\//i.test(safePath)) {
        return safePath;
    }

    return `${BACKEND_URL}${safePath.startsWith('/') ? safePath : `/${safePath}`}`;
}

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            reject(new Error('auth-ready-timeout'));
        }, ms);

        promise.then(
            (value) => {
                window.clearTimeout(timeoutId);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
}

async function ensureAuthReady() {
    if (auth.currentUser) {
        return auth.currentUser;
    }

    if (typeof auth.authStateReady === 'function') {
        try {
            await withTimeout(auth.authStateReady(), AUTH_READY_TIMEOUT_MS);
        } catch (error) {
            if (auth.currentUser) {
                return auth.currentUser;
            }

            if (error instanceof Error && error.message === 'auth-ready-timeout') {
                return null;
            }

            throw error;
        }
    }

    return auth.currentUser;
}

async function readIdToken(requireAuth = true) {
    const user = await ensureAuthReady();

    if (!user) {
        if (requireAuth) {
            throw new Error('로그인이 필요합니다.');
        }

        return '';
    }

    return user.getIdToken();
}

async function parseBackendResponse(response) {
    let payload = null;

    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const message = payload?.message || payload?.error || `요청에 실패했습니다. (${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
}

export async function fetchBackendJson(path, options = {}) {
    const {
        method = 'GET',
        body,
        headers = {},
        requireAuth = true,
        signal,
        cache = 'no-store'
    } = options;

    const requestHeaders = new Headers(headers);
    const payloadBody = body instanceof FormData
        ? body
        : body === undefined
            ? undefined
            : JSON.stringify(body);

    if (!(body instanceof FormData) && body !== undefined && !requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json');
    }

    if (!requestHeaders.has('Cache-Control')) {
        requestHeaders.set('Cache-Control', 'no-store');
    }

    if (!requestHeaders.has('Pragma')) {
        requestHeaders.set('Pragma', 'no-cache');
    }

    const idToken = await readIdToken(requireAuth);
    if (idToken) {
        requestHeaders.set('Authorization', `Bearer ${idToken}`);
    }

    const response = await fetch(normalizePath(path), {
        method,
        headers: requestHeaders,
        body: payloadBody,
        signal,
        cache
    });

    return parseBackendResponse(response);
}
