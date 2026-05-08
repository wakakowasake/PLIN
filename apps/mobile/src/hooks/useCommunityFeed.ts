import { useCallback, useEffect, useRef, useState } from 'react';

import type { CommunityPostListPage } from '@/adapters/community/CommunityRepository';
import { useAdapters } from '@/adapters/useAdapters';
import type { MobileCommunityPostSummary } from '@/types/community';
import {
    DEFAULT_OFFSET_PAGE_LIMIT,
    buildHydrationRevalidateLimit,
    buildInitialOffsetPageState
} from '@/utils/pagination';
import {
    normalizeCommunityLoadError,
    type CommunityLoadErrorKind
} from './community-load-error';

type CommunityFeedMemorySnapshot = {
    items: MobileCommunityPostSummary[];
    nextCursor: number | null;
    hasMore: boolean;
};

const communityFeedMemoryCache = new Map<string, CommunityFeedMemorySnapshot>();

function mergeCommunityPages(
    existingItems: MobileCommunityPostSummary[],
    nextItems: MobileCommunityPostSummary[]
) {
    if (existingItems.length === 0) {
        return nextItems;
    }

    const seenPostIds = new Set(existingItems.map((item) => item.id));
    const mergedItems = [...existingItems];

    nextItems.forEach((item) => {
        if (seenPostIds.has(item.id)) {
            return;
        }

        seenPostIds.add(item.id);
        mergedItems.push(item);
    });

    return mergedItems;
}

export function useCommunityFeed(userId: string | null) {
    const { communityRepository } = useAdapters();
    const [items, setItems] = useState<MobileCommunityPostSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorKind, setErrorKind] = useState<CommunityLoadErrorKind | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);
    const requestIdRef = useRef(0);
    const itemsRef = useRef<MobileCommunityPostSummary[]>([]);
    const nextCursorRef = useRef<number | null>(null);
    const hasMoreRef = useRef(false);

    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    useEffect(() => {
        nextCursorRef.current = nextCursor;
    }, [nextCursor]);

    useEffect(() => {
        hasMoreRef.current = hasMore;
    }, [hasMore]);

    const setPageState = useCallback((pageState: Pick<CommunityPostListPage, 'nextCursor' | 'hasMore'>) => {
        nextCursorRef.current = pageState.nextCursor;
        hasMoreRef.current = pageState.hasMore;
        setNextCursor(pageState.nextCursor);
        setHasMore(pageState.hasMore);
    }, []);

    const clearFeedState = useCallback(() => {
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

    const applyPageResult = useCallback((result: CommunityPostListPage, mode: 'replace' | 'append') => {
        const nextItems = mode === 'append'
            ? mergeCommunityPages(itemsRef.current, result.items)
            : result.items;

        itemsRef.current = nextItems;
        setItems(nextItems);
        setPageState({
            nextCursor: result.nextCursor,
            hasMore: result.hasMore
        });

        if (userId) {
            communityFeedMemoryCache.set(userId, {
                items: nextItems,
                nextCursor: result.nextCursor,
                hasMore: result.hasMore
            });
        }
    }, [setPageState, userId]);

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

        if (!userId) {
            clearFeedState();
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
            const result = await communityRepository.listPostsPage(userId, {
                cursor: requestedCursor,
                limit: requestedLimit
            });
            if (requestIdRef.current !== requestId) {
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

            const nextError = normalizeCommunityLoadError(loadError, 'list');
            const hasExistingItems = itemsRef.current.length > 0;

            if (isSilent && hasExistingItems) {
                return;
            }

            if (hasExistingItems) {
                if (isAppending) {
                    setRefreshError(
                        nextError.kind === 'network'
                            ? '연결이 잠시 불안정해 글을 더 불러오지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
                            : nextError.message
                    );
                } else if (nextError.kind === 'network') {
                    setRefreshError(
                        '연결이 잠시 불안정해 최신 커뮤니티 글을 다시 확인하지 못했어요. 현재는 마지막으로 불러온 목록을 보여주고 있어요.'
                    );
                } else {
                    setRefreshError(nextError.message);
                }
                return;
            }

            clearFeedState();
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
    }, [applyPageResult, clearFeedState, communityRepository, userId]);

    useEffect(() => {
        requestIdRef.current += 1;
        clearFeedState();
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

        const memorySnapshot = communityFeedMemoryCache.get(userId);
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
            void load({
                refresh: true,
                silent: true,
                limit: buildHydrationRevalidateLimit(memorySnapshot.items.length)
            });

            return () => {
                requestIdRef.current += 1;
            };
        }

        void load({ limit: DEFAULT_OFFSET_PAGE_LIMIT });

        return () => {
            requestIdRef.current += 1;
        };
    }, [clearFeedState, load, setPageState, userId]);

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
        refresh,
        retry,
        loadMore
    };
}
