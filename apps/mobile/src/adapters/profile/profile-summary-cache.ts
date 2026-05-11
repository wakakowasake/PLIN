import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MobileProfileSummary } from '@/types/profile';

const PROFILE_SUMMARY_CACHE_PREFIX = 'plin:profile-summary';

function buildProfileSummaryCacheKey(uid: string) {
    return `${PROFILE_SUMMARY_CACHE_PREFIX}:${uid}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);
    return text || null;
}

function readBooleanOrNull(value: unknown) {
    if (typeof value === 'boolean') {
        return value;
    }

    return null;
}

function normalizeBlockedUserIds(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((entry) => readString(entry))
        .filter(Boolean);
}

function normalizeProfileSummary(uid: string, value: unknown): MobileProfileSummary | null {
    if (!isPlainObject(value)) {
        return null;
    }

    const summaryUid = readString(value.uid);
    const displayName = readString(value.displayName);

    if (!summaryUid || summaryUid !== uid || !displayName) {
        return null;
    }

    return {
        uid: summaryUid,
        displayName,
        email: readString(value.email),
        photoURL: readNullableString(value.photoURL),
        role: readString(value.role).toLowerCase() === 'admin' ? 'admin' : 'user',
        emailVerificationExempt: value.emailVerificationExempt === true,
        agreedToTerms: readBooleanOrNull(value.agreedToTerms),
        agreedToPrivacy: readBooleanOrNull(value.agreedToPrivacy),
        agreedAt: readNullableString(value.agreedAt),
        accountStatus: readString(value.accountStatus) === 'pending_deletion'
            ? 'pending_deletion'
            : 'active',
        deletionRequestedAt: readNullableString(value.deletionRequestedAt),
        purgeAfter: readNullableString(value.purgeAfter),
        blockedUserIds: normalizeBlockedUserIds(value.blockedUserIds),
        source: value.source === 'profile' ? 'profile' : 'auth'
    };
}

export async function getCachedProfileSummary(uid: string) {
    if (!uid) {
        return null;
    }

    try {
        const raw = await AsyncStorage.getItem(buildProfileSummaryCacheKey(uid));
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as unknown;
        return normalizeProfileSummary(uid, parsed);
    } catch {
        return null;
    }
}

export async function setCachedProfileSummary(summary: MobileProfileSummary) {
    if (!summary?.uid || summary.source !== 'profile') {
        return;
    }

    await AsyncStorage.setItem(
        buildProfileSummaryCacheKey(summary.uid),
        JSON.stringify(summary)
    );
}
