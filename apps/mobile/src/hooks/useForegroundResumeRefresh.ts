import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type Options = {
    enabled: boolean;
    onRefresh: () => Promise<void> | void;
    throttleMs?: number;
};

export function useForegroundResumeRefresh({
    enabled,
    onRefresh,
    throttleMs = 15000
}: Options) {
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);
    const inFlightRef = useRef(false);
    const lastRefreshAtRef = useRef(0);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const subscription = AppState.addEventListener('change', (nextState) => {
            const previousState = appStateRef.current;
            appStateRef.current = nextState;

            const resumed =
                (previousState === 'background' || previousState === 'inactive')
                && nextState === 'active';

            if (!resumed) {
                return;
            }

            const now = Date.now();
            if (inFlightRef.current || now - lastRefreshAtRef.current < throttleMs) {
                return;
            }

            lastRefreshAtRef.current = now;
            inFlightRef.current = true;

            Promise.resolve(onRefresh())
                .catch(() => {})
                .finally(() => {
                    inFlightRef.current = false;
                });
        });

        return () => {
            subscription.remove();
        };
    }, [enabled, onRefresh, throttleMs]);
}
