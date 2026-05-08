import type { MobileTripDetail, MobileTripSummary, RawTrip } from '@/types/trip';

export type RawCommunityPost = RawTrip & {
    authorUid?: string;
    authorName?: string;
    authorPhoto?: string | null;
    likesCount?: number;
    clonesCount?: number;
    publishedAt?: unknown;
    moderation?: {
        status?: string;
    };
};

export type RawCommunityComment = {
    id: string;
    text?: string;
    authorUid?: string;
    authorName?: string;
    authorPhoto?: string | null;
    createdAt?: unknown;
    moderation?: {
        status?: string;
    };
};

export type MobileCommunityComment = {
    id: string;
    text: string;
    authorUid: string;
    authorName: string;
    authorPhotoURL: string | null;
    createdLabel: string;
};

export type MobileCommunityCommentCreateInput = {
    text: string;
    authorUid: string;
    authorName: string;
    authorPhotoURL: string | null;
};

export type MobileCommunityLikeResult = {
    isLiked: boolean;
    likesCount?: number;
};

export type MobileCommunityTripDuplicateInput = {
    title: string;
    startDate: string;
    endDate: string;
};

export type MobileCommunityPostSummary = MobileTripSummary & {
    authorUid: string;
    authorName: string;
    authorPhotoURL: string | null;
    likesCount: number;
    clonesCount: number;
    publishedAt: string;
    publishedLabel: string;
    isLiked: boolean;
};

export type MobileCommunityPostDetail = {
    id: string;
    trip: MobileTripDetail;
    authorUid: string;
    authorName: string;
    authorPhotoURL: string | null;
    likesCount: number;
    clonesCount: number;
    publishedLabel: string;
    isLiked: boolean;
};
