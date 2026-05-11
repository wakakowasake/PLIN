import { doc, getDoc, setDoc } from 'firebase/firestore';
import { buildUserProfileSeed } from '@shared/services/firebase/profile-data-helpers.js';

import {
    assertMobileFirebaseConfigReady,
    getMobileFirestore
} from '@/adapters/firebase/mobile-firebase';
import type { AuthSessionUser } from '@/types/auth';
import type { MobileProfileSummary } from '@/types/profile';
import type { ProfileSummaryAdapter } from './ProfileSummaryAdapter';

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown): string | null {
    const text = readString(value);
    return text || null;
}

function buildFallbackSummary(user: AuthSessionUser): MobileProfileSummary {
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
        agreedToTerms: null,
        agreedToPrivacy: null,
        agreedAt: null,
        accountStatus: 'active',
        deletionRequestedAt: null,
        purgeAfter: null,
        blockedUserIds: [],
        source: 'auth'
    };
}

export class FirebaseProfileSummaryAdapter implements ProfileSummaryAdapter {
    async getProfileSummary(user: AuthSessionUser): Promise<MobileProfileSummary> {
        const fallback = buildFallbackSummary(user);

        assertMobileFirebaseConfigReady();
        const db = getMobileFirestore();
        const profileSnapshot = await getDoc(doc(db, 'users', user.uid));

        if (!profileSnapshot.exists()) {
            return {
                ...fallback,
                agreedToTerms: false,
                agreedToPrivacy: false,
                source: 'profile'
            };
        }

        const data = profileSnapshot.data();
        const safeData = isPlainObject(data) ? data : {};
        const displayName = readString(safeData.displayName ?? safeData.name) || fallback.displayName;
        const email = readString(safeData.email) || fallback.email;
        const photoURL = readNullableString(safeData.customPhotoURL)
            || readNullableString(safeData.photoURL)
            || fallback.photoURL;
        const agreedToTerms = typeof safeData.agreedToTerms === 'boolean'
            ? safeData.agreedToTerms
            : false;
        const agreedToPrivacy = typeof safeData.agreedToPrivacy === 'boolean'
            ? safeData.agreedToPrivacy
            : (agreedToTerms ? true : false);
        const agreedAt = readNullableString(safeData.agreedAt);
        const accountStatus = readString(safeData.accountStatus) === 'pending_deletion'
            ? 'pending_deletion'
            : 'active';
        const role = readString(safeData.role).toLowerCase() === 'admin'
            ? 'admin'
            : 'user';
        const emailVerificationExempt = safeData.emailVerificationExempt === true;
        const deletionRequestedAt = readNullableString(safeData.deletionRequestedAt);
        const purgeAfter = readNullableString(safeData.purgeAfter);
        const blockedUserIds = Array.isArray(safeData.blockedUserIds)
            ? safeData.blockedUserIds
                .map((entry) => readString(entry))
                .filter(Boolean)
            : [];

        return {
            uid: user.uid,
            displayName,
            email,
            photoURL,
            role,
            emailVerificationExempt,
            agreedToTerms,
            agreedToPrivacy,
            agreedAt,
            accountStatus,
            deletionRequestedAt,
            purgeAfter,
            blockedUserIds,
            source: 'profile'
        };
    }

    async acceptMandatoryTerms(user: AuthSessionUser): Promise<void> {
        assertMobileFirebaseConfigReady();
        const db = getMobileFirestore();

        await setDoc(
            doc(db, 'users', user.uid),
            buildUserProfileSeed(user, {
                agreedToTerms: true,
                agreedToPrivacy: true,
                agreedAt: new Date().toISOString()
            }),
            { merge: true }
        );
    }

    async updateProfilePhoto(user: AuthSessionUser, photoURL: string): Promise<void> {
        const nextPhotoURL = readString(photoURL);
        if (!nextPhotoURL) {
            throw new Error('프로필 사진 URL을 저장하지 못했어요.');
        }

        assertMobileFirebaseConfigReady();
        const db = getMobileFirestore();

        await setDoc(
            doc(db, 'users', user.uid),
            buildUserProfileSeed(user, {
                customPhotoURL: nextPhotoURL
            }),
            { merge: true }
        );
    }

    async updateProfileDisplayName(user: AuthSessionUser, displayName: string): Promise<void> {
        const nextDisplayName = readString(displayName);
        if (!nextDisplayName) {
            throw new Error('프로필 이름을 비워 둘 수 없어요.');
        }

        assertMobileFirebaseConfigReady();
        const db = getMobileFirestore();

        await setDoc(
            doc(db, 'users', user.uid),
            buildUserProfileSeed(user, {
                displayName: nextDisplayName
            }),
            { merge: true }
        );
    }
}
