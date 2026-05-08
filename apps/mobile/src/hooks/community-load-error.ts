import { isNetworkLikeError, isSessionLikeError } from '@/utils/network-error';

export type CommunityLoadErrorKind = 'session' | 'network' | 'unknown';

export function normalizeCommunityLoadError(error: unknown, scope: 'list' | 'detail') {
    if (isSessionLikeError(error)) {
        return {
            kind: 'session' as const,
            message: '세션이 만료됐거나 접근 권한이 바뀌었어요. 세션을 다시 확인해 주세요.'
        };
    }

    if (isNetworkLikeError(error)) {
        return {
            kind: 'network' as const,
            message: scope === 'list'
                ? '인터넷 연결이 불안정해 커뮤니티 글을 가져오지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
                : '인터넷 연결이 불안정해 커뮤니티 상세를 가져오지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
        };
    }

    return {
        kind: 'unknown' as const,
        message: scope === 'list'
            ? '커뮤니티 글을 불러오지 못했어요.'
            : '커뮤니티 상세를 불러오지 못했어요.'
    };
}
