import { fetchBackendJson } from '@/services/backend-client';
import {
    normalizeAuthProviderAvailability,
    type AuthProviderAvailability
} from './public-config-shared';

type PublicConfigResponse = {
    authProviderAvailability?: Partial<Record<keyof AuthProviderAvailability, unknown>> | null;
};
export { normalizeAuthProviderAvailability, type AuthProviderAvailability };

export async function fetchAuthProviderAvailability() {
    const payload = await fetchBackendJson<PublicConfigResponse>('/config', {
        requireAuth: false
    });

    return normalizeAuthProviderAvailability(payload?.authProviderAvailability);
}
