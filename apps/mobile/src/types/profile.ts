export type MobileAccountStatus = 'active' | 'pending_deletion';
export type MobileProfileRole = 'user' | 'admin';

export type MobileProfileSummary = {
    uid: string;
    displayName: string;
    email: string;
    photoURL: string | null;
    role: MobileProfileRole;
    emailVerificationExempt: boolean;
    agreedToTerms: boolean | null;
    agreedToPrivacy: boolean | null;
    agreedAt: string | null;
    accountStatus: MobileAccountStatus;
    deletionRequestedAt: string | null;
    purgeAfter: string | null;
    blockedUserIds: string[];
    source: 'auth' | 'profile';
};
