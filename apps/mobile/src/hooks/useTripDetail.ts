import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapters } from '@/adapters/useAdapters';
import { useConnectivityStatus } from '@/state/connectivity-store';
import { useTripWriteSync } from '@/state/trip-write-sync';
import type { MobileTripDetail } from '@/types/trip';
import { normalizeTripLoadError, type TripLoadErrorKind } from './trip-load-error';

export function useTripDetail(userId: string | null, tripId: string) {
    const { tripRepository } = useAdapters();
    const { isOfflineMode } = useConnectivityStatus();
    const { tripVersion, writtenDetail } = useTripWriteSync(tripId);
    const [detail, setDetail] = useState<MobileTripDetail | null>(null);
    const [detailSource, setDetailSource] = useState<'none' | 'cache' | 'remote'>('none');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorKind, setErrorKind] = useState<TripLoadErrorKind | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);
    const requestIdRef = useRef(0);
    const detailRef = useRef<MobileTripDetail | null>(null);
    const writeVersionRef = useRef(tripVersion);
    const writtenDetailRef = useRef<MobileTripDetail | null>(writtenDetail);
    const isOfflineModeRef = useRef(isOfflineMode);
    const lastHandledWriteVersionRef = useRef(0);
    const pendingOfflineRefreshRef = useRef(false);

    useEffect(() => {
        detailRef.current = detail;
    }, [detail]);

    useEffect(() => {
        writeVersionRef.current = tripVersion;
    }, [tripVersion]);

    useEffect(() => {
        writtenDetailRef.current = writtenDetail;
    }, [writtenDetail]);

    useEffect(() => {
        isOfflineModeRef.current = isOfflineMode;
    }, [isOfflineMode]);

    const load = useCallback(async (options?: { refresh?: boolean }) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const isRefresh = options?.refresh === true;
        const startedWriteVersion = writeVersionRef.current;

        if (!userId || !tripId) {
            detailRef.current = null;
            setDetail(null);
            setDetailSource('none');
            setError(null);
            setErrorKind(null);
            setRefreshError(null);
            setLoading(false);
            setRefreshing(false);
            setHasLoaded(true);
            return;
        }

        if (isRefresh) {
            setRefreshing(true);
            setRefreshError(null);
        } else {
            setLoading(true);
            setError(null);
            setErrorKind(null);
            setRefreshError(null);
        }

        try {
            const result = await tripRepository.getTripDetail(userId, tripId);
            if (requestIdRef.current !== requestId) {
                return;
            }
            if (writeVersionRef.current !== startedWriteVersion) {
                return;
            }
            detailRef.current = result;
            setDetail(result);
            setDetailSource('remote');
            setError(null);
            setErrorKind(null);
            setRefreshError(null);
        } catch (loadError) {
            if (requestIdRef.current !== requestId) {
                return;
            }
            if (writeVersionRef.current !== startedWriteVersion) {
                return;
            }

            const nextError = normalizeTripLoadError(loadError, 'detail');
            const hasExistingDetail = Boolean(detailRef.current);

            if (hasExistingDetail && nextError.kind === 'network') {
                setDetailSource('cache');
                setRefreshError(
                    isOfflineModeRef.current
                        ? null
                        : '연결이 잠시 불안정해 최신 일정 상세를 다시 확인하지 못했어요. 마지막으로 불러온 내용을 보여드릴게요.'
                );
            } else {
                detailRef.current = null;
                setDetail(null);
                setDetailSource('none');
                setRefreshError(null);
                setErrorKind(nextError.kind);
                setError(nextError.message);
            }
        } finally {
            if (requestIdRef.current === requestId) {
                if (isRefresh) {
                    setRefreshing(false);
                } else {
                    setLoading(false);
                }
                setHasLoaded(true);
            }
        }
    }, [tripId, tripRepository, userId]);

    useEffect(() => {
        requestIdRef.current += 1;
        detailRef.current = null;
        setDetail(null);
        setDetailSource('none');
        setError(null);
        setErrorKind(null);
        setRefreshError(null);
        setHasLoaded(false);
        setLoading(Boolean(userId && tripId));
        setRefreshing(false);

        if (!userId || !tripId) {
            setLoading(false);
            setHasLoaded(true);
            return () => {
                requestIdRef.current += 1;
            };
        }

        let isMounted = true;
        const seededWrittenDetail = writeVersionRef.current > 0
            && writtenDetailRef.current?.id === tripId
            ? writtenDetailRef.current
            : null;

        void (async () => {
            if (seededWrittenDetail) {
                detailRef.current = seededWrittenDetail;
                setDetail(seededWrittenDetail);
                setDetailSource('remote');
                setError(null);
                setErrorKind(null);
                setRefreshError(null);
                setLoading(false);
                setRefreshing(false);
                setHasLoaded(true);
                pendingOfflineRefreshRef.current = isOfflineModeRef.current;

                if (!isOfflineModeRef.current) {
                    await load({ refresh: true });
                }
                return;
            }

            const cachedDetail = await tripRepository.getCachedTripDetail(userId, tripId);
            if (isMounted && cachedDetail) {
                detailRef.current = cachedDetail;
                setDetail(cachedDetail);
                setDetailSource('cache');
                setError(null);
                setErrorKind(null);
                setRefreshError(null);
                setLoading(false);
                setHasLoaded(true);
                pendingOfflineRefreshRef.current = isOfflineModeRef.current;

                if (!isOfflineModeRef.current) {
                    await load({ refresh: true });
                }
                return;
            }

            if (isMounted) {
                await load();
            }
        })();

        return () => {
            isMounted = false;
            requestIdRef.current += 1;
        };
    }, [load]);

    useEffect(() => {
        if (!userId || !tripId || isOfflineMode || !pendingOfflineRefreshRef.current) {
            return;
        }

        pendingOfflineRefreshRef.current = false;

        if (!detailRef.current) {
            return;
        }

        void load({ refresh: true });
    }, [isOfflineMode, load, tripId, userId]);

    useEffect(() => {
        if (!userId || !tripId || !writtenDetail || tripVersion === 0) {
            return;
        }

        detailRef.current = writtenDetail;
        setDetail(writtenDetail);
        setDetailSource('remote');
        setError(null);
        setErrorKind(null);
        setRefreshError(null);
        setLoading(false);
        setRefreshing(false);
        setHasLoaded(true);

        if (lastHandledWriteVersionRef.current === tripVersion) {
            return;
        }

        lastHandledWriteVersionRef.current = tripVersion;
        void load({ refresh: true });
    }, [load, tripId, tripVersion, userId, writtenDetail]);

    const refresh = useCallback(async () => {
        if (!userId || !tripId || loading || refreshing) {
            return;
        }

        await load({ refresh: true });
    }, [load, loading, refreshing, tripId, userId]);

    const retry = useCallback(async () => {
        if (!userId || !tripId || loading || refreshing) {
            return;
        }

        await load();
    }, [load, loading, refreshing, tripId, userId]);

    return {
        detail,
        isRemoteReady: detailSource === 'remote',
        isUsingCachedDetail: detailSource === 'cache',
        loading,
        refreshing,
        error,
        errorKind,
        refreshError,
        hasLoaded,
        isNotFound: hasLoaded && !loading && !error && !detail && Boolean(userId && tripId),
        retry,
        refresh
    };
}
