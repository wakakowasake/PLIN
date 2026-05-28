import { syncWritableTripDaysWithRangeCanonical } from '@shared/features/trips/trip-write-scaffold.js';
import { buildTripInfoWritePatch } from '@shared/features/trips/trip-canonical.js';

import type { CanonicalTripDocument } from '@/types/trip';

const DEFAULT_DUPLICATED_SHARE = {
    mode: 'private',
    role: 'viewer',
    tokenId: ''
} as const;

export type TripDuplicateOverrides = {
    title?: string;
    startDate?: string;
    endDate?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function clonePlainValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((entry) => clonePlainValue(entry)) as T;
    }

    if (isPlainObject(value)) {
        return Object.entries(value).reduce<Record<string, unknown>>((nextValue, [key, entry]) => {
            nextValue[key] = clonePlainValue(entry);
            return nextValue;
        }, {}) as T;
    }

    return value;
}

function coerceList(value: unknown) {
    if (Array.isArray(value)) {
        return value.map((entry) => clonePlainValue(entry));
    }

    if (isPlainObject(value)) {
        return Object.values(value).map((entry) => clonePlainValue(entry));
    }

    return [];
}

function buildDuplicatedTripTitle(value: unknown) {
    const baseTitle = typeof value === 'string' && value.trim()
        ? value.trim()
        : '제목 없는 일정';

    if (baseTitle.endsWith(' 사본')) {
        return baseTitle;
    }

    return `${baseTitle} 사본`;
}

export function buildDuplicatedTripPayload(
    userId: string,
    sourceData: unknown,
    canonicalTrip: CanonicalTripDocument,
    overrides?: TripDuplicateOverrides
) {
    const safeSource = isPlainObject(sourceData)
        ? clonePlainValue(sourceData)
        : {};
    const safeMeta = isPlainObject(safeSource.meta)
        ? safeSource.meta
        : {};
    const requestedTitle = typeof overrides?.title === 'string'
        ? overrides.title.trim()
        : '';
    const duplicatedTitle = requestedTitle
        || buildDuplicatedTripTitle(canonicalTrip.meta.title || safeMeta.title);
    const location = typeof canonicalTrip.meta.location === 'string' && canonicalTrip.meta.location.trim()
        ? canonicalTrip.meta.location.trim()
        : (typeof safeMeta.location === 'string' ? safeMeta.location.trim() : '');
    const startDate = typeof overrides?.startDate === 'string' && overrides.startDate.trim()
        ? overrides.startDate.trim()
        : (canonicalTrip.meta.startDate || String(safeMeta.startDate || '') || canonicalTrip.days[0]?.date || '');
    const endDate = typeof overrides?.endDate === 'string' && overrides.endDate.trim()
        ? overrides.endDate.trim()
        : (
            canonicalTrip.meta.endDate
            || String(safeMeta.endDate || '')
            || canonicalTrip.days[canonicalTrip.days.length - 1]?.date
            || startDate
        );
    const writePatch = buildTripInfoWritePatch({
        title: duplicatedTitle,
        location,
        startDate,
        endDate
    }, canonicalTrip);
    const nextPayload: Record<string, unknown> & { days: unknown[] } = {
        ...safeSource,
        meta: {
            ...safeMeta,
            ...writePatch.metaPatch
        },
        days: coerceList(safeSource.days),
        contentVersion: 1,
        members: {
            [userId]: 'owner'
        },
        createdAt: new Date().toISOString(),
        createdBy: userId,
        share: {
            ...DEFAULT_DUPLICATED_SHARE
        }
    };

    delete nextPayload.id;
    delete nextPayload.userId;
    delete nextPayload.shareId;
    delete nextPayload.inviteId;
    delete nextPayload.isPublic;
    delete nextPayload.public;
    delete nextPayload.publicReadable;
    delete nextPayload.inviteEnabled;

    if (isPlainObject(nextPayload.meta)) {
        delete nextPayload.meta.docId;
    }

    syncWritableTripDaysWithRangeCanonical(
        nextPayload,
        writePatch.syncRange.startDate,
        writePatch.syncRange.totalDays
    );

    return nextPayload;
}
