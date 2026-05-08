import type { AuthSessionUser } from '@/types/auth';
import type { MobileProfileSummary } from '@/types/profile';

export interface ProfileSummaryAdapter {
    getProfileSummary(user: AuthSessionUser): Promise<MobileProfileSummary>;
    acceptMandatoryTerms(user: AuthSessionUser): Promise<void>;
    updateProfilePhoto(user: AuthSessionUser, photoURL: string): Promise<void>;
    updateProfileDisplayName(user: AuthSessionUser, displayName: string): Promise<void>;
}
