import type { AuthSessionUser } from '@/types/auth';
import type { MobileProfileSummary } from '@/types/profile';

export function isPrivilegedDebugUser(
    profile: MobileProfileSummary | null | undefined,
    user?: AuthSessionUser | null
) {
    return profile?.role === 'admin' || user?.isAdmin === true;
}
