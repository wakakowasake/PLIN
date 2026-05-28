export const isTripCreationEnabled = true;

export const TRIP_CREATION_DISABLED_TITLE = '새 일정 만들기 준비 중';
export const TRIP_CREATION_DISABLED_MESSAGE = '지금은 새 일정을 만들 수 없어요. 다시 열어둘 때까지 잠시만 기다려 주세요.';

export function assertTripCreationEnabled() {
    if (!isTripCreationEnabled) {
        throw new Error(TRIP_CREATION_DISABLED_MESSAGE);
    }
}
