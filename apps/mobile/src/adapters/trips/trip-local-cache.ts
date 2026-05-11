import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MobileTripDetail, MobileTripPermissions, MobileTripSummary } from '@/types/trip';

const TRIP_LIST_CACHE_PREFIX = 'plin:trip-cache:list';
const TRIP_DETAIL_CACHE_PREFIX = 'plin:trip-cache:detail';

type CachedTripListPayload = {
    updatedAt: string;
    items: MobileTripSummary[];
};

type CachedTripDetailPayload = {
    updatedAt: string;
    item: MobileTripDetail;
};

function buildTripListCacheKey(userId: string) {
    return `${TRIP_LIST_CACHE_PREFIX}:${userId}`;
}

function buildTripDetailCacheKey(userId: string, tripId: string) {
    return `${TRIP_DETAIL_CACHE_PREFIX}:${userId}:${tripId}`;
}

function buildTripDetailCacheKeyPrefix(userId: string) {
    return `${TRIP_DETAIL_CACHE_PREFIX}:${userId}:`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTripPermissions(value: unknown): MobileTripPermissions {
    const safeValue = isPlainObject(value) ? value : {};
    const role = safeValue.role === 'owner'
        || safeValue.role === 'editor'
        || safeValue.role === 'viewer'
        || safeValue.role === 'member'
        ? safeValue.role
        : '';

    return {
        role,
        canEditContent: safeValue.canEditContent === true,
        canManageShare: safeValue.canManageShare === true,
        canSendAnnouncement: safeValue.canSendAnnouncement === true,
        canDeleteTrip: safeValue.canDeleteTrip === true,
        canPublishCommunity: safeValue.canPublishCommunity === true,
        canDuplicateTrip: safeValue.canDuplicateTrip === true
    };
}

function normalizeTripContentVersion(value: unknown) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return 1;
    }

    return Math.floor(parsed);
}

function normalizeDateTimeString(value: unknown) {
    const safeValue = typeof value === 'string' ? value.trim() : '';
    if (!safeValue) {
        return '';
    }

    const parsed = new Date(safeValue);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function resolveTripRecencyTimestamp(summary: Pick<MobileTripSummary, 'updatedAt' | 'createdAt' | 'startDate'>) {
    const rawTimestamp = summary.updatedAt || summary.createdAt || summary.startDate;
    const parsed = Date.parse(String(rawTimestamp || '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTripSummary(value: unknown): MobileTripSummary | null {
    if (!isPlainObject(value)) {
        return null;
    }

    const id = typeof value.id === 'string' ? value.id : '';
    const title = typeof value.title === 'string' ? value.title : '';
    const subInfo = typeof value.subInfo === 'string' ? value.subInfo : '';
    const dayCount = typeof value.dayCount === 'string' ? value.dayCount : '';
    const startDate = typeof value.startDate === 'string' ? value.startDate : '';
    const endDate = typeof value.endDate === 'string' ? value.endDate : '';
    const createdAt = normalizeDateTimeString(value.createdAt) || undefined;
    const updatedAt = normalizeDateTimeString(value.updatedAt) || undefined;
    const coverImage = typeof value.coverImage === 'string' ? value.coverImage : null;
    const status = value.status === 'completed' ? 'completed' : 'planning';

    if (!id) {
        return null;
    }

    return {
        id,
        title,
        subInfo,
        dayCount,
        startDate,
        endDate,
        createdAt,
        updatedAt,
        contentVersion: normalizeTripContentVersion(value.contentVersion),
        coverImage,
        status,
        permissions: normalizeTripPermissions(value.permissions)
    };
}

function normalizeTripDetail(value: unknown): MobileTripDetail | null {
    if (!isPlainObject(value)) {
        return null;
    }

    const id = typeof value.id === 'string' ? value.id : '';
    const title = typeof value.title === 'string' ? value.title : '';
    const subInfo = typeof value.subInfo === 'string' ? value.subInfo : '';
    const locationLabel = typeof value.locationLabel === 'string' ? value.locationLabel : '';
    const dayCount = typeof value.dayCount === 'string' ? value.dayCount : '';
    const createdAt = normalizeDateTimeString(value.createdAt) || undefined;
    const updatedAt = normalizeDateTimeString(value.updatedAt) || undefined;
    const coverImage = typeof value.coverImage === 'string' ? value.coverImage : null;
    const status = value.status === 'completed' ? 'completed' : 'planning';
    const photoPreviewUrls = Array.isArray(value.photoPreviewUrls) ? value.photoPreviewUrls.filter((entry): entry is string => typeof entry === 'string') : [];
    const photoGalleryUrls = Array.isArray(value.photoGalleryUrls) ? value.photoGalleryUrls.filter((entry): entry is string => typeof entry === 'string') : [];
    const photoCount = typeof value.photoCount === 'number' ? value.photoCount : 0;
    const budgetSummary = (isPlainObject(value.budgetSummary) || value.budgetSummary === null)
        ? value.budgetSummary as MobileTripDetail['budgetSummary']
        : null;
    const days = Array.isArray(value.days) ? value.days as MobileTripDetail['days'] : [];
    const shoppingList = Array.isArray(value.shoppingList)
        ? value.shoppingList as MobileTripDetail['shoppingList']
        : [];
    const checklist = Array.isArray(value.checklist)
        ? value.checklist as MobileTripDetail['checklist']
        : [];
    const editInfo = isPlainObject(value.editInfo)
        ? value.editInfo as MobileTripDetail['editInfo']
        : {
            title,
            location: '',
            startDate: days[0]?.date || '',
            endDate: days[days.length - 1]?.date || ''
        };

    if (!id) {
        return null;
    }

    return {
        id,
        title,
        subInfo,
        locationLabel,
        dayCount,
        createdAt,
        updatedAt,
        contentVersion: normalizeTripContentVersion(value.contentVersion),
        coverImage,
        status,
        photoPreviewUrls,
        photoGalleryUrls,
        photoCount,
        budgetSummary,
        days,
        shoppingList,
        checklist,
        editInfo,
        permissions: normalizeTripPermissions(value.permissions)
    };
}

export function buildTripSummaryFromDetail(detail: MobileTripDetail): MobileTripSummary {
    const firstDate = detail.days[0]?.date || detail.editInfo.startDate || '';
    const lastDate = detail.days[detail.days.length - 1]?.date || detail.editInfo.endDate || firstDate;

    return {
        id: detail.id,
        title: detail.title,
        subInfo: detail.subInfo,
        dayCount: detail.dayCount,
        startDate: firstDate,
        endDate: lastDate,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
        contentVersion: detail.contentVersion,
        coverImage: detail.coverImage || null,
        status: detail.status,
        permissions: detail.permissions
    };
}

function compareTripSummaries(left: MobileTripSummary, right: MobileTripSummary) {
    const leftDate = resolveTripRecencyTimestamp(left);
    const rightDate = resolveTripRecencyTimestamp(right);

    if (leftDate !== rightDate) {
        return rightDate - leftDate;
    }

    return left.title.localeCompare(right.title, 'ko');
}

export async function getCachedTripList(userId: string) {
    if (!userId) {
        return [];
    }

    try {
        const raw = await AsyncStorage.getItem(buildTripListCacheKey(userId));
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!isPlainObject(parsed) || !Array.isArray(parsed.items)) {
            return [];
        }

        return parsed.items
            .map((entry) => normalizeTripSummary(entry))
            .filter((entry): entry is MobileTripSummary => Boolean(entry))
            .sort(compareTripSummaries);
    } catch {
        return [];
    }
}

export async function setCachedTripList(userId: string, items: MobileTripSummary[]) {
    if (!userId) {
        return;
    }

    const payload: CachedTripListPayload = {
        updatedAt: new Date().toISOString(),
        items
    };

    await AsyncStorage.setItem(buildTripListCacheKey(userId), JSON.stringify(payload));
}

export async function clearCachedTripsForUser(userId: string) {
    if (!userId) {
        return;
    }

    const listKey = buildTripListCacheKey(userId);
    const detailKeyPrefix = buildTripDetailCacheKeyPrefix(userId);
    const keys = await AsyncStorage.getAllKeys();
    const targetKeys = keys.filter((key) => key === listKey || key.startsWith(detailKeyPrefix));

    if (targetKeys.length === 0) {
        return;
    }

    await AsyncStorage.multiRemove(targetKeys);
}

export async function getCachedTripDetail(userId: string, tripId: string) {
    if (!userId || !tripId) {
        return null;
    }

    try {
        const raw = await AsyncStorage.getItem(buildTripDetailCacheKey(userId, tripId));
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!isPlainObject(parsed)) {
            return null;
        }

        return normalizeTripDetail(parsed.item);
    } catch {
        return null;
    }
}

export async function setCachedTripDetail(userId: string, detail: MobileTripDetail) {
    if (!userId || !detail?.id) {
        return;
    }

    const payload: CachedTripDetailPayload = {
        updatedAt: new Date().toISOString(),
        item: detail
    };

    await AsyncStorage.setItem(buildTripDetailCacheKey(userId, detail.id), JSON.stringify(payload));
}

export async function upsertCachedTripSummary(userId: string, summary: MobileTripSummary) {
    if (!userId || !summary?.id) {
        return;
    }

    const current = await getCachedTripList(userId);
    const nextById = new Map<string, MobileTripSummary>();

    current.forEach((item) => {
        nextById.set(item.id, item);
    });
    nextById.set(summary.id, summary);

    await setCachedTripList(userId, Array.from(nextById.values()).sort(compareTripSummaries));
}

export async function removeCachedTrip(userId: string, tripId: string) {
    if (!userId || !tripId) {
        return;
    }

    const current = await getCachedTripList(userId);
    const next = current.filter((item) => item.id !== tripId);
    await setCachedTripList(userId, next);
    await AsyncStorage.removeItem(buildTripDetailCacheKey(userId, tripId));
}

export async function persistCachedTripDetailAndSummary(userId: string, detail: MobileTripDetail) {
    await Promise.all([
        setCachedTripDetail(userId, detail),
        upsertCachedTripSummary(userId, buildTripSummaryFromDetail(detail))
    ]);
}
