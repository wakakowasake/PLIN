import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapters } from '@/adapters/useAdapters';
import type { MobileCommunityPostDetail } from '@/types/community';
import {
    normalizeCommunityLoadError,
    type CommunityLoadErrorKind
} from './community-load-error';

export function useCommunityPostDetail(userId: string | null, postId: string) {
    const { communityRepository } = useAdapters();
    const [detail, setDetail] = useState<MobileCommunityPostDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorKind, setErrorKind] = useState<CommunityLoadErrorKind | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);
    const requestIdRef = useRef(0);
    const detailRef = useRef<MobileCommunityPostDetail | null>(null);

    useEffect(() => {
        detailRef.current = detail;
    }, [detail]);

    const load = useCallback(async (options?: { refresh?: boolean }) => {
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const isRefresh = options?.refresh === true;

        if (!userId || !postId) {
            detailRef.current = null;
            setDetail(null);
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
            const result = await communityRepository.getPostDetail(userId, postId);
            if (requestIdRef.current !== requestId) {
                return;
            }

            detailRef.current = result;
            setDetail(result);
            setError(null);
            setErrorKind(null);
            setRefreshError(null);
        } catch (loadError) {
            if (requestIdRef.current !== requestId) {
                return;
            }

            const nextError = normalizeCommunityLoadError(loadError, 'detail');
            const hasExistingDetail = Boolean(detailRef.current);

            if (isRefresh && hasExistingDetail && nextError.kind === 'network') {
                setRefreshError(
                    '연결이 잠시 불안정해 최신 플랜 상세를 다시 확인하지 못했어요. 현재는 마지막으로 불러온 내용을 계속 보여주고 있어요.'
                );
            } else {
                detailRef.current = null;
                setDetail(null);
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
    }, [communityRepository, postId, userId]);

    useEffect(() => {
        requestIdRef.current += 1;
        detailRef.current = null;
        setDetail(null);
        setError(null);
        setErrorKind(null);
        setRefreshError(null);
        setHasLoaded(false);
        setLoading(Boolean(userId && postId));
        setRefreshing(false);

        if (!userId || !postId) {
            setLoading(false);
            setHasLoaded(true);
            return () => {
                requestIdRef.current += 1;
            };
        }

        void load();

        return () => {
            requestIdRef.current += 1;
        };
    }, [load, postId, userId]);

    const refresh = useCallback(async () => {
        if (!userId || !postId || loading || refreshing) {
            return;
        }

        await load({ refresh: true });
    }, [load, loading, postId, refreshing, userId]);

    const retry = useCallback(async () => {
        if (!userId || !postId || loading || refreshing) {
            return;
        }

        await load();
    }, [load, loading, postId, refreshing, userId]);

    return {
        detail,
        loading,
        refreshing,
        error,
        errorKind,
        refreshError,
        hasLoaded,
        isNotFound: hasLoaded && !loading && !error && !detail && Boolean(userId && postId),
        refresh,
        retry
    };
}
