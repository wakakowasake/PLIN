import { buildUserProfileSeed } from '@shared/services/firebase/profile-data-helpers.js';

import type { AuthSessionUser } from '@/types/auth';
import type { MobileProfileSummary } from '@/types/profile';
import type { ProfileSummaryAdapter } from './ProfileSummaryAdapter';

function normalizeAuthSummary(user: AuthSessionUser): MobileProfileSummary {
    const seed = buildUserProfileSeed(user);

    return {
        uid: user.uid,
        displayName: String(seed.displayName || user.email || 'PLIN User'),
        email: String(seed.email || ''),
        photoURL: typeof seed.photoURL === 'string' && seed.photoURL.trim()
            ? seed.photoURL
            : null,
        role: 'user',
        emailVerificationExempt: false,
        agreedToTerms: true,
        agreedToPrivacy: true,
        agreedAt: null,
        accountStatus: 'active',
        deletionRequestedAt: null,
        purgeAfter: null,
        blockedUserIds: [],
        source: 'auth'
    };
}

export class MockProfileSummaryAdapter implements ProfileSummaryAdapter {
    async getProfileSummary(user: AuthSessionUser): Promise<MobileProfileSummary> {
        return normalizeAuthSummary(user);
    }

    async acceptMandatoryTerms(): Promise<void> {}

    async updateProfilePhoto(): Promise<void> {}

    async updateProfileDisplayName(): Promise<void> {}
}
