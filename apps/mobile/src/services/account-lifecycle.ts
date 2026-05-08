import { fetchBackendJson } from '@/services/backend-client';

export type AccountDeletionResponse = {
    accountStatus?: 'pending_deletion' | 'deleted';
    deletionRequestedAt?: string | null;
    purgeAfter?: string | null;
    deletedAt?: string | null;
};

export async function requestAccountDeletion(reason = 'user_requested') {
    return fetchBackendJson<AccountDeletionResponse>('/account/deletion-request', {
        method: 'POST',
        body: {
            reason
        }
    });
}
