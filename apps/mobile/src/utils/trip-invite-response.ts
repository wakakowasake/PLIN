type AcceptedInviteTripPayload = {
    id?: unknown;
} | null | undefined;

type AcceptedInviteResponse = {
    trip?: AcceptedInviteTripPayload;
} | null | undefined;

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export function readAcceptedInviteTripId(response: AcceptedInviteResponse) {
    const tripId = readString(response?.trip?.id);

    if (!tripId) {
        throw new Error('초대받은 여행 정보를 확인하지 못했어요.');
    }

    return tripId;
}
