import { fetchBackendJson } from '@/services/backend-client';
import { readAcceptedInviteTripId } from '@/utils/trip-invite-response';

type AcceptTripInviteResponse = {
    trip?: {
        id?: unknown;
    } | null;
};

export async function acceptTripInvite(token: string) {
    const safeToken = String(token || '').trim();
    if (!safeToken) {
        throw new Error('초대 링크가 올바르지 않아요.');
    }

    const response = await fetchBackendJson<AcceptTripInviteResponse>(
        `/invites/${encodeURIComponent(safeToken)}/accept`,
        {
            method: 'POST'
        }
    );

    return {
        tripId: readAcceptedInviteTripId(response)
    };
}
