import { logImageBoundary } from '@/dev/image-diagnostics';
import type {
    CanonicalTripDocument,
    CanonicalTripMemberRole,
    MobileTripCollaboratorSummary,
    MobileTripSummary
} from '@/types/trip';
import { getTripSubInfoPrefix } from '@shared/features/trip-info/trip-info-helpers.js';

function readTripContentVersion(sourceData?: Record<string, unknown> | null) {
    const parsed = Number(sourceData?.contentVersion);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return 1;
    }

    return Math.floor(parsed);
}

function buildFallbackDayCount(daysLength: number) {
    if (!daysLength) {
        return '일정 미정';
    }

    if (daysLength === 1) {
        return '당일치기';
    }

    return `${daysLength - 1}박 ${daysLength}일`;
}

function normalizePlanPurpose(value: unknown) {
    return value === 'date' ? 'date' : 'trip';
}

function findCoverImage(trip: CanonicalTripDocument) {
    if (typeof trip?.meta?.coverImage === 'string' && trip.meta.coverImage.trim()) {
        return trip.meta.coverImage;
    }

    if (typeof trip?.meta?.mapImage === 'string' && trip.meta.mapImage.trim()) {
        return trip.meta.mapImage;
    }

    for (const day of trip?.days || []) {
        for (const item of day.items || []) {
            if (typeof item.image === 'string' && item.image.trim()) {
                return item.image;
            }
        }
    }

    return null;
}

function parseDateOnly(value: string) {
    const safeValue = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
        return null;
    }

    const parsed = new Date(`${safeValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

function normalizeDateTimeString(value: unknown) {
    const safeValue = typeof value === 'string' ? value.trim() : '';
    if (!safeValue) {
        return '';
    }

    const parsed = new Date(safeValue);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function formatDisplayDate(value: string) {
    const parsed = parseDateOnly(value);
    if (!parsed) {
        return String(value || '').trim();
    }

    return `${parsed.getFullYear()}년 ${parsed.getMonth() + 1}월 ${parsed.getDate()}일`;
}

function buildDisplaySubInfo(trip: CanonicalTripDocument, startDate: string, endDate: string) {
    const rawSubInfo = String(trip?.meta?.subInfo || '').trim();
    const location = String(trip?.meta?.location || getTripSubInfoPrefix(rawSubInfo) || '').trim();
    const formattedStartDate = formatDisplayDate(startDate);
    const formattedEndDate = formatDisplayDate(endDate);

    if (location && formattedStartDate && formattedEndDate) {
        return `${location} • ${formattedStartDate} - ${formattedEndDate}`;
    }

    if (formattedStartDate && formattedEndDate) {
        return `${formattedStartDate} - ${formattedEndDate}`;
    }

    if (location && formattedStartDate) {
        return `${location} • ${formattedStartDate}`;
    }

    return rawSubInfo || '일정 정보 준비 중';
}

function resolveDisplayTripStatus(endDate: string, currentStatus?: string | null) {
    const parsed = parseDateOnly(endDate);
    if (!parsed) {
        return currentStatus === 'completed' ? 'completed' : 'planning';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return today > parsed ? 'completed' : 'planning';
}

function buildTripPermissions(trip: CanonicalTripDocument, userId?: string | null) {
    const safeUserId = String(userId || '').trim();
    const role: CanonicalTripMemberRole | '' = safeUserId
        ? (trip.membership.membersByUid[safeUserId] || '')
        : '';

    return {
        role,
        canEditContent: role === 'owner' || role === 'editor',
        canManageShare: role === 'owner' || role === 'editor',
        canSendAnnouncement: role === 'owner',
        canDeleteTrip: role === 'owner',
        canPublishCommunity: role === 'owner' || role === 'editor',
        canDuplicateTrip: Boolean(role)
    };
}

function normalizeTripCollaboratorRole(value: unknown): CanonicalTripMemberRole {
    return value === 'owner' || value === 'editor' || value === 'member' || value === 'viewer'
        ? value
        : 'viewer';
}

function buildTripCollaborators(
    sourceData?: Record<string, unknown> | null,
    userId?: string | null
): MobileTripCollaboratorSummary[] {
    const currentUid = String(userId || '').trim();
    const entries = Array.isArray(sourceData?.listMembers)
        ? sourceData.listMembers
        : [];

    return entries.reduce<MobileTripCollaboratorSummary[]>((accumulator, entry) => {
        if (!entry || typeof entry !== 'object') {
            return accumulator;
        }

        const safeEntry = entry as Record<string, unknown>;

        const uid = typeof safeEntry.uid === 'string' ? safeEntry.uid.trim() : '';
        if (!uid || uid === currentUid) {
            return accumulator;
        }

        const role = normalizeTripCollaboratorRole(safeEntry.role);
        if (role === 'viewer') {
            return accumulator;
        }

        accumulator.push({
            uid,
            displayName:
                (typeof safeEntry.displayName === 'string' && safeEntry.displayName.trim())
                || '멤버',
            photoURL:
                typeof safeEntry.photoURL === 'string' && safeEntry.photoURL.trim()
                    ? safeEntry.photoURL.trim()
                    : null,
            role,
            isSelf: safeEntry.isSelf === true
        });
        return accumulator;
    }, []);
}

export function mapTripSummary(
    trip: CanonicalTripDocument,
    userId?: string | null,
    sourceData?: Record<string, unknown> | null
): MobileTripSummary {
    const title = String(trip?.meta?.title || '제목 없는 일정');
    const dayCount = String(trip?.meta?.dayCount || buildFallbackDayCount(trip?.days?.length || 0));
    const startDate = String(trip?.meta?.startDate || trip?.days?.[0]?.date || '');
    const endDate = String(trip?.meta?.endDate || trip?.days?.[trip.days.length - 1]?.date || '');
    const subInfo = buildDisplaySubInfo(trip, startDate, endDate);

    const summary: MobileTripSummary = {
        id: trip.id,
        title,
        subInfo,
        dayCount,
        purpose: normalizePlanPurpose(trip?.meta?.purpose),
        startDate,
        endDate,
        createdAt: normalizeDateTimeString(sourceData?.createdAt) || undefined,
        updatedAt: normalizeDateTimeString(sourceData?.updatedAt) || undefined,
        contentVersion: readTripContentVersion(sourceData),
        coverImage: findCoverImage(trip),
        status: resolveDisplayTripStatus(endDate, trip?.meta?.status),
        deletedAt: normalizeDateTimeString(sourceData?.deletedAt) || null,
        deletedBy: typeof sourceData?.deletedBy === 'string' ? sourceData.deletedBy : null,
        deletionReason: typeof sourceData?.deletionReason === 'string' ? sourceData.deletionReason : null,
        purgeAfter: normalizeDateTimeString(sourceData?.purgeAfter) || null,
        permissions: buildTripPermissions(trip, userId),
        collaborators: buildTripCollaborators(sourceData, userId)
    };

    logImageBoundary('trip:mapper:summary', 'trip.meta.coverImage', summary.coverImage, {
        tripId: trip.id
    });

    return summary;
}
