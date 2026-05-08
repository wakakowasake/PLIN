import { normalizeTripDocument } from '@shared/features/trips/trip-canonical.js';

import { logUnicodeBoundary } from '@/dev/unicode-diagnostics';
import { mapTripDetail } from '@/mappers/trip-detail-mapper';
import { mapTripSummary } from '@/mappers/trip-summary-mapper';
import type {
    MobileCommunityComment,
    MobileCommunityPostDetail,
    MobileCommunityPostSummary,
    RawCommunityComment,
    RawCommunityPost
} from '@/types/community';
import type { CanonicalTripDocument, RawTrip, RawTripDay, RawTripMeta } from '@/types/trip';

const DEFAULT_AUTHOR_NAME = '익명의 여행자';

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

function normalizeRemoteImageUrl(value: unknown) {
    const text = readNullableString(value);
    if (!text) {
        return null;
    }

    return /^https?:\/\//i.test(text) ? text : null;
}

function readNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readDateValue(value: unknown): Date | null {
    if (!value) {
        return null;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (isPlainObject(value) && typeof value.seconds === 'number') {
        const parsed = new Date(value.seconds * 1000);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (
        isPlainObject(value)
        && 'toDate' in value
        && typeof value.toDate === 'function'
    ) {
        try {
            const parsed = value.toDate();
            return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
        } catch {
            return null;
        }
    }

    return null;
}

function formatPublishedLabel(value: unknown) {
    const date = readDateValue(value);
    if (!date) {
        return '게시일 미상';
    }

    return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}. 게시`;
}

function formatPublishedValue(value: unknown) {
    const date = readDateValue(value);
    return date ? date.toISOString() : '';
}

function normalizeRawTrip(postId: string, data: unknown): RawTrip {
    const safeData = isPlainObject(data) ? data : {};
    const rawMeta = isPlainObject(safeData.meta) ? safeData.meta : {};
    const rawDays = Array.isArray(safeData.days) ? safeData.days : [];

    return {
        id: postId,
        meta: rawMeta as RawTripMeta,
        days: rawDays as RawTripDay[]
    };
}

function buildBaseCommunityFields(post: RawCommunityPost) {
    return {
        authorUid: readString(post.authorUid),
        authorName: readString(post.authorName) || DEFAULT_AUTHOR_NAME,
        authorPhotoURL: readNullableString(post.authorPhoto),
        likesCount: readNumber(post.likesCount),
        clonesCount: readNumber(post.clonesCount),
        publishedAt: formatPublishedValue(post.publishedAt),
        publishedLabel: formatPublishedLabel(post.publishedAt)
    };
}

export function normalizeCommunityPost(postId: string, data: unknown): RawCommunityPost {
    const safeData = isPlainObject(data) ? data : {};
    const trip = normalizeRawTrip(postId, safeData);

    return {
        ...trip,
        authorUid: readString(safeData.authorUid) || undefined,
        authorName: readString(safeData.authorName) || undefined,
        authorPhoto: normalizeRemoteImageUrl(safeData.authorPhoto),
        likesCount: readNumber(safeData.likesCount),
        clonesCount: readNumber(safeData.clonesCount),
        publishedAt: safeData.publishedAt
    };
}

export function mapCommunityPostSummary(post: RawCommunityPost): MobileCommunityPostSummary {
    const summary = {
        ...mapTripSummary(normalizeTripDocument(post.id, post) as CanonicalTripDocument),
        ...buildBaseCommunityFields(post),
        isLiked: false
    };

    logUnicodeBoundary('community:mapper:post-summary', 'community.authorName', summary.authorName, {
        postId: post.id
    });

    return summary;
}

export function mapCommunityPostDetail(post: RawCommunityPost): MobileCommunityPostDetail {
    const detail = {
        id: post.id,
        trip: mapTripDetail(normalizeTripDocument(post.id, post) as CanonicalTripDocument),
        ...buildBaseCommunityFields(post),
        isLiked: false
    };

    logUnicodeBoundary('community:mapper:post-detail', 'community.authorName', detail.authorName, {
        postId: post.id
    });

    return detail;
}

function formatCommentCreatedLabel(value: unknown) {
    const date = readDateValue(value);

    if (!date) {
        return '방금 전';
    }

    return date.toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function normalizeCommunityComment(commentId: string, data: unknown): RawCommunityComment {
    const safeData = isPlainObject(data) ? data : {};

    return {
        id: commentId,
        text: readString(safeData.text) || undefined,
        authorUid: readString(safeData.authorUid) || undefined,
        authorName: readString(safeData.authorName) || undefined,
        authorPhoto: normalizeRemoteImageUrl(safeData.authorPhoto),
        createdAt: safeData.createdAt
    };
}

export function mapCommunityComment(comment: RawCommunityComment): MobileCommunityComment {
    const mappedComment = {
        id: comment.id,
        text: readString(comment.text) || '',
        authorUid: readString(comment.authorUid) || '',
        authorName: readString(comment.authorName) || DEFAULT_AUTHOR_NAME,
        authorPhotoURL: readNullableString(comment.authorPhoto),
        createdLabel: formatCommentCreatedLabel(comment.createdAt)
    };

    logUnicodeBoundary('community:mapper:comment', 'community.comment.text', mappedComment.text, {
        commentId: comment.id
    });
    logUnicodeBoundary('community:mapper:comment', 'community.authorName', mappedComment.authorName, {
        commentId: comment.id
    });

    return mappedComment;
}
