import { isNetworkLikeError, isSessionLikeError } from '@/utils/network-error';

export type TripLoadErrorKind = 'session' | 'network' | 'unknown';

export type TripLoadErrorState = {
    kind: TripLoadErrorKind;
    message: string;
};

export function normalizeTripLoadError(
    error: unknown,
    scope: 'list' | 'detail'
): TripLoadErrorState {
    if (isSessionLikeError(error)) {
        return {
            kind: 'session',
            message: '로그인 상태나 볼 수 있는 범위가 바뀌었어요. 세션을 다시 확인해 주세요.'
        };
    }

    if (isNetworkLikeError(error)) {
        return {
            kind: 'network',
            message: scope === 'list'
                ? '인터넷 연결이 불안정해 일정 목록을 가져오지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
                : '인터넷 연결이 불안정해 일정 상세를 가져오지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
        };
    }

    return {
        kind: 'unknown',
        message: scope === 'list'
            ? '일정 목록을 불러오지 못했어요.'
            : '일정 상세를 불러오지 못했어요.'
    };
}
