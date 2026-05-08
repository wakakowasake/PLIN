import React from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { readBackendUrl } from '@/services/backend-client';

type ConnectivityContextValue = {
    isInternetReachable: boolean | null;
    isOfflineMode: boolean;
    isChecking: boolean;
    lastCheckedAt: number | null;
    lastReachableAt: number | null;
    refreshConnectivity(): Promise<boolean>;
};

const CONNECTIVITY_POLL_INTERVAL_MS = 30000;
const CONNECTIVITY_TIMEOUT_MS = 4500;

const ConnectivityContext = React.createContext<ConnectivityContextValue | null>(null);

function buildReachabilityUrl() {
    const baseUrl = String(readBackendUrl() || '').replace(/\/+$/, '');
    return `${baseUrl}/config?_=${Date.now()}`;
}

function canReadBrowserOnlineState() {
    return Platform.OS === 'web'
        && typeof navigator !== 'undefined'
        && typeof navigator.onLine === 'boolean';
}

function readBrowserOnlineState() {
    if (!canReadBrowserOnlineState()) {
        return null;
    }

    return navigator.onLine;
}

async function probeInternetReachability(signal: AbortSignal) {
    const response = await fetch(buildReachabilityUrl(), {
        method: 'GET',
        signal
    });

    return Boolean(response);
}

export function ConnectivityProvider({ children }: { children: React.ReactNode }) {
    const [isInternetReachable, setIsInternetReachable] = React.useState<boolean | null>(() => {
        const browserOnlineState = readBrowserOnlineState();
        return browserOnlineState === false ? false : null;
    });
    const [isChecking, setIsChecking] = React.useState(false);
    const [lastCheckedAt, setLastCheckedAt] = React.useState<number | null>(null);
    const [lastReachableAt, setLastReachableAt] = React.useState<number | null>(null);
    const requestIdRef = React.useRef(0);
    const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);

    const applyConnectivityResult = React.useCallback((isReachable: boolean) => {
        const now = Date.now();
        setIsInternetReachable(isReachable);
        setLastCheckedAt(now);

        if (isReachable) {
            setLastReachableAt(now);
        }
    }, []);

    const refreshConnectivity = React.useCallback(async () => {
        const browserOnlineState = readBrowserOnlineState();
        if (browserOnlineState === false) {
            requestIdRef.current += 1;
            setIsChecking(false);
            applyConnectivityResult(false);
            return false;
        }

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        setIsChecking(true);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, CONNECTIVITY_TIMEOUT_MS);

        try {
            await probeInternetReachability(controller.signal);

            if (requestIdRef.current !== requestId) {
                return false;
            }

            applyConnectivityResult(true);
            return true;
        } catch {
            if (requestIdRef.current !== requestId) {
                return false;
            }

            applyConnectivityResult(false);
            return false;
        } finally {
            clearTimeout(timeoutId);

            if (requestIdRef.current === requestId) {
                setIsChecking(false);
            }
        }
    }, [applyConnectivityResult]);

    React.useEffect(() => {
        void refreshConnectivity();

        const appStateSubscription = AppState.addEventListener('change', (nextState) => {
            const previousState = appStateRef.current;
            appStateRef.current = nextState;

            if (nextState === 'active' && previousState !== 'active') {
                void refreshConnectivity();
            }
        });

        const intervalId = setInterval(() => {
            if (appStateRef.current === 'active') {
                void refreshConnectivity();
            }
        }, CONNECTIVITY_POLL_INTERVAL_MS);

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const handleOnline = () => {
                void refreshConnectivity();
            };
            const handleOffline = () => {
                requestIdRef.current += 1;
                setIsChecking(false);
                applyConnectivityResult(false);
            };

            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);

            return () => {
                clearInterval(intervalId);
                appStateSubscription.remove();
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            };
        }

        return () => {
            clearInterval(intervalId);
            appStateSubscription.remove();
        };
    }, [applyConnectivityResult, refreshConnectivity]);

    const value = React.useMemo<ConnectivityContextValue>(() => ({
        isInternetReachable,
        isOfflineMode: isInternetReachable === false,
        isChecking,
        lastCheckedAt,
        lastReachableAt,
        refreshConnectivity
    }), [
        isChecking,
        isInternetReachable,
        lastCheckedAt,
        lastReachableAt,
        refreshConnectivity
    ]);

    return (
        <ConnectivityContext.Provider value={value}>
            {children}
        </ConnectivityContext.Provider>
    );
}

export function useConnectivityStatus() {
    const value = React.useContext(ConnectivityContext);

    if (!value) {
        throw new Error('ConnectivityProvider가 필요합니다.');
    }

    return value;
}
