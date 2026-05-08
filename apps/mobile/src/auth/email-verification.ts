import type { AuthSessionUser } from '@/types/auth';

export function requiresEmailVerification(user: AuthSessionUser | null | undefined) {
    return Boolean(user && user.provider === 'email' && user.emailVerified !== true);
}
