import { fetchBackendJson } from './api-client.js';

function readString(value = '') {
    if (typeof value === 'string') {
        return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return '';
}

function readNumber(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return fallback;
}

function readBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }

    if (typeof value === 'number') {
        return value === 1;
    }

    return false;
}

function normalizeTripRevisionOperation(value) {
    const normalized = readString(value);
    if (normalized === 'restore' || normalized === 'meta_update') {
        return normalized;
    }

    return 'content_update';
}

function normalizeTripRevisionSourceClient(value) {
    const normalized = readString(value).toLowerCase();
    if (normalized === 'mobile' || normalized === 'web' || normalized === 'server') {
        return normalized;
    }

    return 'unknown';
}

function normalizeTripRevisionActor(value = {}) {
    return {
        uid: readString(value?.uid),
        displayName: readString(value?.displayName),
        email: readString(value?.email),
        photoURL: readString(value?.photoURL)
    };
}

function normalizeTripRevisionSnapshot(value = {}) {
    const days = Array.isArray(value?.days) ? value.days : [];
    const shoppingList = Array.isArray(value?.shoppingList) ? value.shoppingList : [];
    const checklist = Array.isArray(value?.checklist) ? value.checklist : [];

    return {
        meta: value?.meta && typeof value.meta === 'object' ? value.meta : {},
        days,
        shoppingList,
        checklist,
        contentVersion: readNumber(value?.contentVersion, 0)
    };
}

function normalizeTripRevisionEntry(value = {}) {
    return {
        id: readString(value?.id),
        createdAt: readString(value?.createdAt),
        actor: normalizeTripRevisionActor(value?.actor),
        operation: normalizeTripRevisionOperation(value?.operation),
        sourceClient: normalizeTripRevisionSourceClient(value?.sourceClient),
        contentVersionBefore: readNumber(value?.contentVersionBefore, 0),
        contentVersionAfter: readNumber(value?.contentVersionAfter, 0),
        summary: {
            text: readString(value?.summary?.text)
        },
        snapshot: normalizeTripRevisionSnapshot(value?.snapshot),
        restoredFromRevisionId: readString(value?.restoredFromRevisionId)
    };
}

export function normalizeTripRevisionListResponse(value = {}) {
    return {
        items: Array.isArray(value?.items)
            ? value.items.map((item) => normalizeTripRevisionEntry(item)).filter((item) => item.id)
            : [],
        nextCursor: readString(value?.nextCursor) || null,
        hasMore: readBoolean(value?.hasMore)
    };
}

export async function fetchTripRevisions(tripId, options = {}) {
    const safeTripId = readString(tripId);
    if (!safeTripId) {
        throw new Error('여행 ID가 필요합니다.');
    }

    const searchParams = new URLSearchParams();
    const cursor = readString(options?.cursor);
    const limit = readNumber(options?.limit, 20);

    if (cursor) {
        searchParams.set('cursor', cursor);
    }

    if (limit > 0) {
        searchParams.set('limit', String(limit));
    }

    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
    const result = await fetchBackendJson(`/plans/${encodeURIComponent(safeTripId)}/revisions${suffix}`);
    return normalizeTripRevisionListResponse(result);
}

export async function restoreTripRevision(tripId, revisionId, expectedContentVersion = null) {
    const safeTripId = readString(tripId);
    const safeRevisionId = readString(revisionId);

    if (!safeTripId || !safeRevisionId) {
        throw new Error('복구할 수정 기록 정보를 확인하지 못했어요.');
    }

    const body = {
        sourceClient: 'web'
    };

    if (Number.isFinite(expectedContentVersion)) {
        body.expectedContentVersion = expectedContentVersion;
    }

    const result = await fetchBackendJson(
        `/plans/${encodeURIComponent(safeTripId)}/revisions/${encodeURIComponent(safeRevisionId)}/restore`,
        {
            method: 'POST',
            body
        }
    );

    return result?.trip || null;
}
