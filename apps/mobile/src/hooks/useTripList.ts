import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapters } from '@/adapters/useAdapters';
import type { TripListPage } from '@/adapters/trips/TripRepository';
import { useConnectivityStatus } from '@/state/connectivity-store';
import { useTripWriteSync } from '@/state/trip-write-sync';
import type { MobileTripSummary } from '@/types/trip';
import {
    DEFAULT_OFFSET_PAGE_LIMIT,
    buildHydrationRevalidateLimit,
    buildInitialOffsetPageState,
    mergeOffsetPageItemsById
} from '@/utils/pagination';
import { normalizeTripLoadError, type TripLoadErrorKind } from './trip-load-error';

type TripListMemorySnapshot = {
    items: MobileTripSummary[];
    nextCursor: number | null;
    hasMore: boolean;
};

const tripListMemoryCache = new Map<string, TripListMemorySnapshot>();

export function clearTripListMemoryCache(userId?: string | null) {
    const safeUserId = String(userId || '').trim();
    if (safeUserId) {
        tripListMemoryCache.delete(safeUserId);
        return;
    }

    tripListMemoryCache.clear();
}

function resolveTripRecencyTimestamp(summary: Pick<MobileTripSummary, 'updatedAt' | 'createdAt' | 'startDate'>) {
    const rawTimestamp = summary.updatedAt || summary.createdAt || summary.startDate;
    const parsed = Date.parse(String(rawTimestamp || '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
}

function compareTripSummaries(left: MobileTripSummary, right: MobileTripSummary) {
    const leftDate = resolveTripRecencyTimestamp(left);
    const rightDate = resolveTripRecencyTimestamp(right);

    if (leftDate !== rightDate) {
        return rightDate - leftDate;
    }

    return left.title.localeCompare(right.title, 'ko');
}

export function useTripList(userId: string | null) {
    const { tripRepository } = useAdapters();
    const { isOfflineMode } = useConnectivityStatus();
    const { listVersion, writtenSummariesByTripId, deletedTripIds } = useTripWriteSync();
    const [items, setItems] = useState<MobileTripSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorKind, setErrorKind] = useState<TripLoadErrorKind | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);
    const requestIdRef = useRef(0);
    const itemsRef = useRef<MobileTripSummary[]>([]);
    const listVersionRef = useRef(listVersion);
    const nextCursorRef = useRef<number | null>(null);
    const hasMoreRef = useRef(false);
    const isOfflineModeRef = useRef(isOfflineMode);
    const lastHandledListVersionRef = useRef(0);
    const pendingOfflineRevalidateRef = useRef(false);

    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    useEffect(() => {
        listVersionRef.current = listVersion;
    }, [listVersion]);

    useEffect(() => {
        nextCursorRef.current = nextCursor;
    }, [nextCursor]);

    useEffect(() => {
        hasMoreRef.current = hasMore;
    }, [hasMore]);

    useEffect(() => {
        isOfflineModeRef.current = isOfflineMode;
    }, [isOfflineMode]);

    const setPageState = useCallback((pageState: Pick<TripListPage, 'nextCursor' | 'hasMore'>) => {
        nextCursorRef.current = pageState.nextCursor;
        hasMoreRef.current = pageState.hasMore;
        setNextCursor(pageState.nextCursor);
        setHasMore(pageState.hasMore);
    }, []);

    const applyPageResult = useCallback((result: TripListPage, mode: 'replace' | 'append') => {
        const nextItems = mode === 'append'
            ? mergeOffsetPageItemsById(itemsRef.current, result.items)
            : result.items;

        itemsRef.current = nextItems;
        setItems(nextItems);
        setPageState({
            nextCursor: result.nextCursor,
            hasMore: result.hasMore
        });

        if (userId) {
            tripListMemoryCache.set(userId, {
                items: nextItems,
                nextCursor: result.nextCursor,
                hasMore: result.hasMore
            });
        }
    }, [setPageState, userId]);

    const clearListState = useCallback(() => {
        itemsRef.current = [];
        setItems([]);
        setError(null);
        setErrorKind(null);
        setRefreshError(null);
        setPageState({
            nextCursor: null,
            hasMore: false
        });
    }, [setPageState]);

    const load = useCallback(async (options?: {
        refresh?: boolean;
        silent?: boolean;
        mode?: 'replace' | 'append';
        cursor?: number | null;
        limit?: number | null;
    }) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const isRefresh = options?.refresh === true;
        const isSilent = options?.silent === true;
        const mode = options?.mode || 'replace';
        const isAppending = mode === 'append';
        const startedListVersion = listVersionRef.current;

        if (!userId) {
            clearListState();
            setLoading(false);
            setRefreshing(false);
            setLoadingMore(false);
            setHasLoaded(true);
            return;
        }

        if (isAppending) {
            setLoadingMore(true);
            setRefreshError(null);
        } else if (isRefresh && !isSilent) {
            setRefreshing(true);
            setRefreshError(null);
        } else if (!isSilent) {
            setLoading(true);
            setError(null);
            setErrorKind(null);
            setRefreshError(null);
        }

        const requestedLimit = options?.limit ?? (
            isAppending
                ? DEFAULT_OFFSET_PAGE_LIMIT
                : buildHydrationRevalidateLimit(itemsRef.current.length)
        );
        const requestedCursor = isAppending
            ? options?.cursor ?? nextCursorRef.current ?? 0
            : 0;

        try {
            const result = await tripRepository.listTripsPage(userId, {
                cursor: requestedCursor,
                limit: requestedLimit
            });
            if (requestIdRef.current !== requestId) {
                return;
            }
            if (listVersionRef.current !== startedListVersion) {
                return;
            }

            applyPageResult(result, mode);
            setError(null);
            setErrorKind(null);
            setRefreshError(null);
        } catch (loadError) {
            if (requestIdRef.current !== requestId) {
                return;
            }
            if (listVersionRef.current !== startedListVersion) {
                return;
            }

            const nextError = normalizeTripLoadError(loadError, 'list');
            const hasExistingItems = itemsRef.current.length > 0;

            if (isSilent && hasExistingItems) {
                return;
            }

            if (hasExistingItems) {
                if (isAppending) {
                    setRefreshError(
                        nextError.kind === 'network'
                            ? '연결이 잠시 불안정해 일정을 더 불러오지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
                            : nextError.message
                    );
                } else if (nextError.kind === 'network') {
                    setRefreshError(
                        '연결이 잠시 불안정해 최신 일정 목록을 다시 확인하지 못했어요. 마지막으로 불러온 목록을 보여드릴게요.'
                    );
                } else {
                    setRefreshError(nextError.message);
                }
                return;
            }

            clearListState();
            setErrorKind(nextError.kind);
            setError(nextError.message);
        } finally {
            if (requestIdRef.current === requestId) {
                if (isAppending) {
                    setLoadingMore(false);
                } else if (isRefresh && !isSilent) {
                    setRefreshing(false);
                } else if (!isSilent) {
                    setLoading(false);
                }
                setHasLoaded(true);
            }
        }
    }, [applyPageResult, clearListState, tripRepository, userId]);

    useEffect(() => {
        requestIdRef.current += 1;
        clearListState();
        setHasLoaded(false);
        setLoading(Boolean(userId));
        setRefreshing(false);
        setLoadingMore(false);

        if (!userId) {
            setLoading(false);
            setHasLoaded(true);
            return () => {
                requestIdRef.current += 1;
            };
        }

        const memorySnapshot = tripListMemoryCache.get(userId);
        if (memorySnapshot && memorySnapshot.items.length > 0) {
            itemsRef.current = memorySnapshot.items;
            setItems(memorySnapshot.items);
            setPageState({
                nextCursor: memorySnapshot.nextCursor,
                hasMore: memorySnapshot.hasMore
            });
            setError(null);
            setErrorKind(null);
            setRefreshError(null);
            setLoading(false);
            setHasLoaded(true);
            pendingOfflineRevalidateRef.current = isOfflineModeRef.current;

            if (!isOfflineModeRef.current) {
                void load({
                    refresh: true,
                    silent: true,
                    limit: buildHydrationRevalidateLimit(memorySnapshot.items.length)
                });
            }

            return () => {
                requestIdRef.current += 1;
            };
        }

        let isMounted = true;

        void (async () => {
            const cachedItems = await tripRepository.getCachedTripList(userId);
            if (
                isMounted
                && Array.isArray(cachedItems)
                && cachedItems.length > 0
            ) {
                const pageState = buildInitialOffsetPageState(cachedItems.length);
                itemsRef.current = cachedItems;
                tripListMemoryCache.set(userId, {
                    items: cachedItems,
                    nextCursor: pageState.nextCursor,
                    hasMore: pageState.hasMore
                });
                setItems(cachedItems);
                setPageState(pageState);
                setError(null);
                setErrorKind(null);
                setRefreshError(null);
                setLoading(false);
                setHasLoaded(true);
                pendingOfflineRevalidateRef.current = isOfflineModeRef.current;

                if (!isOfflineModeRef.current) {
                    void load({
                        refresh: true,
                        silent: true,
                        limit: buildHydrationRevalidateLimit(cachedItems.length)
                    });
                }
                return;
            }

            if (isMounted) {
                await load({ limit: DEFAULT_OFFSET_PAGE_LIMIT });
            }
        })();

        return () => {
            isMounted = false;
            requestIdRef.current += 1;
        };
    }, [clearListState, load, setPageState, tripRepository, userId]);

    useEffect(() => {
        if (!userId || isOfflineMode || !pendingOfflineRevalidateRef.current) {
            return;
        }

        pendingOfflineRevalidateRef.current = false;

        if (itemsRef.current.length === 0) {
            return;
        }

        void load({
            refresh: true,
            silent: true,
            limit: buildHydrationRevalidateLimit(itemsRef.current.length)
        });
    }, [isOfflineMode, load, userId]);

    useEffect(() => {
        if (!userId || listVersion === 0) {
            return;
        }

        if (lastHandledListVersionRef.current === listVersion) {
            return;
        }

        lastHandledListVersionRef.current = listVersion;

        const nextItemsById = new Map<string, MobileTripSummary>();

        itemsRef.current.forEach((item) => {
            if (deletedTripIds[item.id]) {
                return;
            }

            nextItemsById.set(item.id, writtenSummariesByTripId[item.id] || item);
        });

        Object.entries(writtenSummariesByTripId).forEach(([tripId, summary]) => {
            if (deletedTripIds[tripId]) {
                return;
            }

            if (!nextItemsById.has(tripId)) {
                nextItemsById.set(tripId, summary);
            }
        });

        const nextItems = Array.from(nextItemsById.values()).sort(compareTripSummaries);
        const hasPatchedItem = nextItems.length !== itemsRef.current.length
            || nextItems.some((item, index) => {
                const currentItem = itemsRef.current[index];

                if (!currentItem) {
                    return true;
                }

                return item !== currentItem || item.id !== currentItem.id;
            });

        if (!hasPatchedItem) {
            return;
        }

        itemsRef.current = nextItems;
        if (userId) {
            tripListMemoryCache.set(userId, {
                items: nextItems,
                nextCursor: nextCursorRef.current,
                hasMore: hasMoreRef.current
            });
        }
        setItems(nextItems);
        setError(null);
        setErrorKind(null);
        setRefreshError(null);
        setLoading(false);
        setHasLoaded(true);
    }, [deletedTripIds, hasMore, listVersion, userId, writtenSummariesByTripId]);

    const refresh = useCallback(async () => {
        if (!userId || loading || refreshing || loadingMore) {
            return;
        }

        await load({
            refresh: true,
            limit: buildHydrationRevalidateLimit(itemsRef.current.length)
        });
    }, [load, loading, loadingMore, refreshing, userId]);

    const retry = useCallback(async () => {
        if (!userId || loading || refreshing || loadingMore) {
            return;
        }

        await load({
            limit: buildHydrationRevalidateLimit(itemsRef.current.length)
        });
    }, [load, loading, loadingMore, refreshing, userId]);

    const loadMore = useCallback(async () => {
        if (
            !userId
            || loading
            || refreshing
            || loadingMore
            || !hasMoreRef.current
            || nextCursorRef.current === null
        ) {
            return;
        }

        await load({
            mode: 'append',
            cursor: nextCursorRef.current,
            limit: DEFAULT_OFFSET_PAGE_LIMIT
        });
    }, [load, loading, loadingMore, refreshing, userId]);

    return {
        items,
        loading,
        refreshing,
        loadingMore,
        hasMore,
        error,
        errorKind,
        refreshError,
        hasLoaded,
        isEmpty: hasLoaded && !loading && !error && items.length === 0,
        retry,
        refresh,
        loadMore
    };
}
