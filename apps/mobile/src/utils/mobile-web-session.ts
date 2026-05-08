import { Platform } from 'react-native';

import { getMobileWebBasePath } from '@/config/mobile-runtime-config';

import {
    buildDefaultMobileWebRelativeUrl,
    isMobileWebAuthCallbackPathname,
    sanitizeMobileWebReturnTo
} from './mobile-web-session-paths';

const AUTH_RETURN_TO_KEY = 'plin.mobileWeb.authReturnTo';
const AUTH_IN_PROGRESS_PROVIDER_KEY = 'plin.mobileWeb.authInProgressProvider';
const PENDING_INVITE_TOKEN_KEY = 'plin.mobileWeb.pendingInviteToken';

function canUseMobileWebSessionWindow() {
    return Platform.OS === 'web' && typeof window !== 'undefined';
}

function getSessionStorage() {
    if (!canUseMobileWebSessionWindow()) {
        return null;
    }

    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function readSessionValue(key: string) {
    const sessionStorage = getSessionStorage();
    if (!sessionStorage) {
        return null;
    }

    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeSessionValue(key: string, value: string) {
    const sessionStorage = getSessionStorage();
    if (!sessionStorage) {
        return;
    }

    try {
        sessionStorage.setItem(key, value);
    } catch {}
}

export function canUseMobileWebSessionStorage() {
    return Boolean(getSessionStorage());
}

export function readMobileWebSessionJson<T>(key: string): T | null {
    const rawValue = readSessionValue(key);
    if (!rawValue) {
        return null;
    }

    try {
        return JSON.parse(rawValue) as T;
    } catch {
        return null;
    }
}

export function writeMobileWebSessionJson(key: string, value: unknown) {
    try {
        writeSessionValue(key, JSON.stringify(value));
    } catch {}
}

export function removeMobileWebSessionValue(key: string) {
    const sessionStorage = getSessionStorage();
    if (!sessionStorage) {
        return;
    }

    try {
        sessionStorage.removeItem(key);
    } catch {}
}

export function getDefaultMobileWebRelativeUrl() {
    return buildDefaultMobileWebRelativeUrl(getMobileWebBasePath());
}

export function isMobileWebAuthCallbackPath(pathname: string) {
    return isMobileWebAuthCallbackPathname(pathname, getMobileWebBasePath());
}

export function buildCurrentMobileWebReturnTo() {
    if (!canUseMobileWebSessionWindow()) {
        return getDefaultMobileWebRelativeUrl();
    }

    return sanitizeMobileWebReturnTo(window.location.href, {
        basePath: getMobileWebBasePath(),
        origin: window.location.origin
    });
}

export function replaceCurrentMobileWebUrl(nextRelativeUrl: string) {
    if (!canUseMobileWebSessionWindow()) {
        return;
    }

    const nextUrl = sanitizeMobileWebReturnTo(nextRelativeUrl, {
        basePath: getMobileWebBasePath(),
        origin: window.location.origin
    });
    const currentRelativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (currentRelativeUrl === nextUrl) {
        return;
    }

    window.history.replaceState(window.history.state, '', nextUrl);
}

export function storePendingAuthReturnTo(url?: string) {
    const nextValue = sanitizeMobileWebReturnTo(url || buildCurrentMobileWebReturnTo(), {
        basePath: getMobileWebBasePath(),
        origin: canUseMobileWebSessionWindow() ? window.location.origin : 'https://plin.ink'
    });

    writeSessionValue(AUTH_RETURN_TO_KEY, nextValue);
}

export function peekPendingAuthReturnTo() {
    const rawValue = readSessionValue(AUTH_RETURN_TO_KEY);
    if (!rawValue) {
        return null;
    }

    return sanitizeMobileWebReturnTo(rawValue, {
        basePath: getMobileWebBasePath(),
        origin: canUseMobileWebSessionWindow() ? window.location.origin : 'https://plin.ink'
    });
}

export function takePendingAuthReturnTo() {
    const nextValue = peekPendingAuthReturnTo();
    removeMobileWebSessionValue(AUTH_RETURN_TO_KEY);
    return nextValue;
}

export function clearPendingAuthReturnTo() {
    removeMobileWebSessionValue(AUTH_RETURN_TO_KEY);
}

export function storeMobileWebAuthInProgressProvider(provider: string) {
    const safeProvider = String(provider || '').trim();
    if (!safeProvider) {
        removeMobileWebSessionValue(AUTH_IN_PROGRESS_PROVIDER_KEY);
        return;
    }

    writeSessionValue(AUTH_IN_PROGRESS_PROVIDER_KEY, safeProvider);
}

export function clearMobileWebAuthInProgressProvider() {
    removeMobileWebSessionValue(AUTH_IN_PROGRESS_PROVIDER_KEY);
}

export function readMobileWebAuthInProgressProvider() {
    const rawValue = readSessionValue(AUTH_IN_PROGRESS_PROVIDER_KEY);
    const safeValue = String(rawValue || '').trim();
    return safeValue || null;
}

export function storePendingInviteToken(token: string) {
    const safeToken = String(token || '').trim();
    if (!safeToken) {
        removeMobileWebSessionValue(PENDING_INVITE_TOKEN_KEY);
        return;
    }

    writeSessionValue(PENDING_INVITE_TOKEN_KEY, safeToken);
}

export function readPendingInviteToken() {
    const safeToken = String(readSessionValue(PENDING_INVITE_TOKEN_KEY) || '').trim();
    return safeToken || null;
}

export function clearPendingInviteToken(expectedToken?: string | null) {
    const safeExpectedToken = String(expectedToken || '').trim();

    if (!safeExpectedToken) {
        removeMobileWebSessionValue(PENDING_INVITE_TOKEN_KEY);
        return;
    }

    const currentToken = readPendingInviteToken();
    if (!currentToken || currentToken === safeExpectedToken) {
        removeMobileWebSessionValue(PENDING_INVITE_TOKEN_KEY);
    }
}
