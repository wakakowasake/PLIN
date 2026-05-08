import React from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const SCROLL_IDLE_DELAY_MS = 140;

const listeners = new Set<() => void>();

let isPrimaryScrollActive = false;
let scrollIdleTimeout: ReturnType<typeof setTimeout> | null = null;

function emitChange() {
    listeners.forEach((listener) => {
        listener();
    });
}

function setPrimaryScrollActive(nextValue: boolean) {
    if (isPrimaryScrollActive === nextValue) {
        return;
    }

    isPrimaryScrollActive = nextValue;
    emitChange();
}

function clearScrollIdleTimeout() {
    if (!scrollIdleTimeout) {
        return;
    }

    clearTimeout(scrollIdleTimeout);
    scrollIdleTimeout = null;
}

function subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function getSnapshot() {
    return isPrimaryScrollActive;
}

export function reportPrimaryScrollActivity() {
    clearScrollIdleTimeout();
    setPrimaryScrollActive(true);

    scrollIdleTimeout = setTimeout(() => {
        scrollIdleTimeout = null;
        setPrimaryScrollActive(false);
    }, SCROLL_IDLE_DELAY_MS);
}

export function resetPrimaryScrollActivity() {
    clearScrollIdleTimeout();
    setPrimaryScrollActive(false);
}

export function usePrimaryScrollActivity() {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function usePrimaryScrollActivityReporter() {
    React.useEffect(() => {
        return () => {
            resetPrimaryScrollActivity();
        };
    }, []);

    const notifyPrimaryScrollActivity = React.useCallback((
        _event?: NativeSyntheticEvent<NativeScrollEvent>
    ) => {
        reportPrimaryScrollActivity();
    }, []);

    return React.useMemo(() => ({
        notifyPrimaryScrollActivity,
        scrollEventThrottle: 16
    }), [notifyPrimaryScrollActivity]);
}
