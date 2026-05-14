import type { AuthSessionUser } from '@/types/auth';
import type { MobileProfileSummary } from '@/types/profile';

const PLIN_ADMIN_EMAILS = new Set([
    'contact@plin.ink'
]);

function normalizeEmail(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

export function isPlinAdminProfile(
    profile: MobileProfileSummary | null | undefined,
    user?: AuthSessionUser | null
) {
    return profile?.role === 'admin'
        || user?.isAdmin === true
        || (
            user?.emailVerified === true
            && PLIN_ADMIN_EMAILS.has(normalizeEmail(user.email))
        );
}
