import type { AuthSessionUser } from '@/types/auth';
import type { MobileProfileSummary } from '@/types/profile';

export const EMAIL_VERIFICATION_REQUIRED = true;

export function requiresEmailVerification(
    user: AuthSessionUser | null | undefined,
    profileSummary?: MobileProfileSummary | null
) {
    if (!EMAIL_VERIFICATION_REQUIRED) {
        return false;
    }

    if (profileSummary?.emailVerificationExempt === true) {
        return false;
    }

    return Boolean(user && user.provider === 'email' && user.emailVerified !== true);
}
