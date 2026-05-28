import { normalizeTripDocument } from '@shared/features/trips/trip-canonical.js';

import { mapTripDetail } from '@/mappers/trip-detail-mapper';
import { mapTripSummary } from '@/mappers/trip-summary-mapper';
import type {
    MobileCommunityMarketplaceInfo,
    MobileCommunityMarketplacePurchaseState,
    MobileCommunityComment,
    MobileCommunityPostDetail,
    MobileCommunityPostSummary,
    RawCommunityComment,
    RawCommunityPost
} from '@/types/community';
import type { CanonicalTripDocument, RawTrip, RawTripDay, RawTripMeta } from '@/types/trip';

const DEFAULT_AUTHOR_NAME = '익명 사용자';
type NormalizedCommunityMarketplace = {
    productId: string | null;
    priceLabel: string | null;
    currencyCode: string | null;
    salesStatus?: MobileCommunityMarketplaceInfo['salesStatus'];
    purchaseState?: MobileCommunityMarketplacePurchaseState;
};

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

function readMarketplacePurchaseState(value: unknown): MobileCommunityMarketplacePurchaseState | null {
    const state = readString(value).toLowerCase();
    if (state === 'free' || state === 'locked' || state === 'owned' || state === 'unavailable') {
        return state;
    }

    return null;
}

function readMarketplaceSalesStatus(value: unknown): MobileCommunityMarketplaceInfo['salesStatus'] | null {
    const status = readString(value).toLowerCase();
    if (status === 'free' || status === 'paid' || status === 'unavailable') {
        return status;
    }

    return null;
}

function normalizeCommunityMarketplace(value: unknown): NormalizedCommunityMarketplace {
    const data = isPlainObject(value) ? value : {};
    const productId = readNullableString(data.productId)
        || readNullableString(data.storeProductId);
    const priceLabel = readNullableString(data.priceLabel)
        || readNullableString(data.displayPrice)
        || readNullableString(data.price);
    const currencyCode = readNullableString(data.currencyCode)
        || readNullableString(data.currency);
    const salesStatus = readMarketplaceSalesStatus(data.salesStatus)
        || readMarketplaceSalesStatus(data.status);
    const purchaseState = readMarketplacePurchaseState(data.purchaseState);

    return {
        productId,
        priceLabel,
        currencyCode,
        salesStatus: salesStatus || undefined,
        purchaseState: purchaseState || undefined
    };
}

function buildMarketplaceInfo(post: RawCommunityPost): MobileCommunityMarketplaceInfo {
    const marketplace = normalizeCommunityMarketplace(post.marketplace);
    const productId = marketplace.productId || null;
    const salesStatus = marketplace.salesStatus === 'unavailable'
        ? 'unavailable'
        : productId
            ? 'paid'
            : 'free';
    const fallbackState: MobileCommunityMarketplacePurchaseState = salesStatus === 'unavailable'
        ? 'unavailable'
        : productId
            ? 'locked'
            : 'free';

    return {
        productId,
        priceLabel: marketplace.priceLabel || (productId ? 'PLIN Plus' : ''),
        currencyCode: marketplace.currencyCode || null,
        salesStatus,
        purchaseState: marketplace.purchaseState || fallbackState
    };
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
        publishedAt: safeData.publishedAt,
        marketplace: normalizeCommunityMarketplace(safeData.marketplace)
    };
}

export function mapCommunityPostSummary(post: RawCommunityPost): MobileCommunityPostSummary {
    return {
        ...mapTripSummary(normalizeTripDocument(post.id, post) as CanonicalTripDocument),
        ...buildBaseCommunityFields(post),
        isLiked: false,
        marketplace: buildMarketplaceInfo(post)
    };
}

export function mapCommunityPostDetail(post: RawCommunityPost): MobileCommunityPostDetail {
    return {
        id: post.id,
        trip: mapTripDetail(normalizeTripDocument(post.id, post) as CanonicalTripDocument),
        ...buildBaseCommunityFields(post),
        isLiked: false,
        marketplace: buildMarketplaceInfo(post)
    };
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
    return {
        id: comment.id,
        text: readString(comment.text) || '',
        authorUid: readString(comment.authorUid) || '',
        authorName: readString(comment.authorName) || DEFAULT_AUTHOR_NAME,
        authorPhotoURL: readNullableString(comment.authorPhoto),
        createdLabel: formatCommentCreatedLabel(comment.createdAt)
    };
}
