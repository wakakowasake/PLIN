import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
} from 'firebase/firestore';

import {
    assertMobileFirebaseConfigReady,
    getMobileFirestore
} from '@/adapters/firebase/mobile-firebase';
import { assertTripCreationEnabled } from '@/features/trip-creation';
import {
    mapCommunityComment,
    mapCommunityPostDetail,
    mapCommunityPostSummary,
    normalizeCommunityComment,
    normalizeCommunityPost
} from '@/mappers/community-mapper';
import { mapTripDetail } from '@/mappers/trip-detail-mapper';
import type {
    MobileCommunityComment,
    MobileCommunityCommentCreateInput,
    MobileCommunityLikeResult,
    MobileCommunityPostDetail,
    MobileCommunityPostSummary,
    MobileCommunityTripDuplicateInput
} from '@/types/community';
import type { CanonicalTripDocument, MobileTripDetail } from '@/types/trip';
import { fetchBackendJson } from '@/services/backend-client';
import {
    DEFAULT_OFFSET_PAGE_LIMIT,
    MAX_OFFSET_PAGE_LIMIT,
    buildFetchWindowLimit,
    paginateOffsetItems
} from '@/utils/pagination';
import { normalizeTripDocument } from '@shared/features/trips/trip-canonical.js';
import type {
    CommunityPostListPage,
    CommunityRepository,
    OffsetPageRequest
} from './CommunityRepository';

type ResolvedAuthorProfile = {
    displayName: string | null;
    photoURL: string | null;
};

type CommunityCommentResponse = {
    comment?: Record<string, unknown> & { id?: string };
};

type CommunityLikeToggleResponse = {
    isLiked?: boolean;
    likesCount?: number;
};

type CommunityBlockMutationResponse = {
    blockedUserIds?: string[];
};

type TripDetailResponse = {
    trip?: Record<string, unknown> & { id?: string };
};

export class FirebaseCommunityRepository implements CommunityRepository {
    private authorProfileCache = new Map<string, Promise<ResolvedAuthorProfile | null>>();

    private readString(value: unknown) {
        return typeof value === 'string' ? value.trim() : '';
    }

    private readNullableString(value: unknown) {
        const text = this.readString(value);
        return text || null;
    }

    private readModerationStatus(value: unknown) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return 'visible';
        }

        const rawStatus = this.readString((value as { status?: unknown }).status).toLowerCase();
        return rawStatus === 'hidden' || rawStatus === 'removed' ? rawStatus : 'visible';
    }

    private isVisibleModeration(value: unknown) {
        return this.readModerationStatus(value) === 'visible';
    }

    private async readBlockedUserIds(userId: string) {
        const safeUserId = this.readString(userId);

        if (!safeUserId) {
            return [];
        }

        const db = getMobileFirestore();
        const profileSnapshot = await getDoc(doc(db, 'users', safeUserId));
        if (!profileSnapshot.exists()) {
            return [];
        }

        const data = profileSnapshot.data() || {};
        const rawBlockedUserIds = (data as { blockedUserIds?: unknown }).blockedUserIds;

        return Array.isArray(rawBlockedUserIds)
            ? rawBlockedUserIds
                .map((entry) => this.readString(entry))
                .filter(Boolean)
            : [];
    }

    private readAuthorProfile(userId: string) {
        const safeUserId = this.readString(userId);

        if (!safeUserId) {
            return Promise.resolve(null);
        }

        const cached = this.authorProfileCache.get(safeUserId);
        if (cached) {
            return cached;
        }

        const request = (async () => {
            const db = getMobileFirestore();
            const profileSnapshot = await getDoc(doc(db, 'users', safeUserId));

            if (!profileSnapshot.exists()) {
                return null;
            }

            const data = profileSnapshot.data() || {};

            return {
                displayName: this.readNullableString((data as Record<string, unknown>).displayName)
                    || this.readNullableString((data as Record<string, unknown>).name),
                photoURL: this.readNullableString((data as Record<string, unknown>).customPhotoURL)
                    || this.readNullableString((data as Record<string, unknown>).photoURL)
            };
        })().catch(() => null);

        this.authorProfileCache.set(safeUserId, request);
        return request;
    }

    private async resolvePostAuthor(post: ReturnType<typeof normalizeCommunityPost>) {
        const profile = await this.readAuthorProfile(post.authorUid || '');

        if (!profile) {
            return post;
        }

        return {
            ...post,
            authorName: profile.displayName || post.authorName,
            authorPhoto: profile.photoURL ?? post.authorPhoto ?? null
        };
    }

    private async resolveCommentAuthor(comment: ReturnType<typeof normalizeCommunityComment>) {
        const profile = await this.readAuthorProfile(comment.authorUid || '');

        if (!profile) {
            return comment;
        }

        return {
            ...comment,
            authorName: profile.displayName || comment.authorName,
            authorPhoto: profile.photoURL ?? comment.authorPhoto ?? null
        };
    }

    private async readLikeState(userId: string, postId: string) {
        if (!userId || !postId) {
            return false;
        }

        const db = getMobileFirestore();
        const likeSnapshot = await getDoc(doc(db, 'community_posts', postId, 'likes', userId));
        return likeSnapshot.exists();
    }

    async listPostsPage(userId: string, options?: OffsetPageRequest): Promise<CommunityPostListPage> {
        if (!userId) {
            return {
                items: [],
                nextCursor: null,
                hasMore: false
            };
        }

        assertMobileFirebaseConfigReady();
        const db = getMobileFirestore();
        const postsCollection = collection(db, 'community_posts');
        const fetchLimit = buildFetchWindowLimit(options?.cursor, options?.limit, {
            minimum: DEFAULT_OFFSET_PAGE_LIMIT * 3,
            padding: DEFAULT_OFFSET_PAGE_LIMIT,
            maxLimit: MAX_OFFSET_PAGE_LIMIT
        });

        let snapshots;

        try {
            snapshots = await getDocs(query(postsCollection, orderBy('publishedAt', 'desc'), limit(fetchLimit)));
        } catch {
            snapshots = await getDocs(query(postsCollection, limit(fetchLimit)));
        }

        const blockedUserIds = await this.readBlockedUserIds(userId);
        const blockedUserIdSet = new Set(blockedUserIds);

        const visibleSnapshots = snapshots.docs.filter((postSnapshot) => {
            const rawData = postSnapshot.data();
            const authorUid = this.readString((rawData as { authorUid?: unknown })?.authorUid);
            const isBlockedAuthor = authorUid ? blockedUserIdSet.has(authorUid) : false;
            return this.isVisibleModeration((rawData as { moderation?: unknown })?.moderation) && !isBlockedAuthor;
        });

        const summaries = await Promise.all(visibleSnapshots.map(async (postSnapshot) => {
            const rawData = postSnapshot.data();
            const normalized = normalizeCommunityPost(postSnapshot.id, rawData);
            const resolved = await this.resolvePostAuthor(normalized);
            const summary = mapCommunityPostSummary(resolved);
            const isLiked = await this.readLikeState(userId, postSnapshot.id);

            return {
                ...summary,
                isLiked
            };
        }));

        summaries.sort((left, right) => String(right.publishedAt || '').localeCompare(String(left.publishedAt || '')));

        return paginateOffsetItems(summaries, {
            cursor: options?.cursor,
            limit: options?.limit,
            fallbackLimit: DEFAULT_OFFSET_PAGE_LIMIT,
            maxLimit: MAX_OFFSET_PAGE_LIMIT,
            hasUnknownTail: snapshots.docs.length >= fetchLimit
        });
    }

    async listPosts(userId: string): Promise<MobileCommunityPostSummary[]> {
        const result = await this.listPostsPage(userId, {
            cursor: 0,
            limit: MAX_OFFSET_PAGE_LIMIT
        });

        return result.items;
    }

    async getPostDetail(userId: string, postId: string): Promise<MobileCommunityPostDetail | null> {
        if (!userId || !postId) {
            return null;
        }

        assertMobileFirebaseConfigReady();
        const db = getMobileFirestore();
        const postSnapshot = await getDoc(doc(db, 'community_posts', postId));

        if (!postSnapshot.exists()) {
            return null;
        }

        const rawData = postSnapshot.data();
        const blockedUserIds = await this.readBlockedUserIds(userId);
        const authorUid = this.readString((rawData as { authorUid?: unknown })?.authorUid);
        if (
            !this.isVisibleModeration((rawData as { moderation?: unknown })?.moderation)
            || (authorUid && blockedUserIds.includes(authorUid))
        ) {
            return null;
        }

        const normalized = normalizeCommunityPost(postSnapshot.id, rawData);
        const resolved = await this.resolvePostAuthor(normalized);
        const detail = mapCommunityPostDetail(resolved);

        return {
            ...detail,
            isLiked: await this.readLikeState(userId, postId)
        };
    }

    async publishTrip(userId: string, trip: MobileTripDetail): Promise<void> {
        if (!userId) {
            throw new Error('로그인이 필요합니다.');
        }

        if (!trip?.id) {
            throw new Error('게시할 여행을 찾을 수 없어요.');
        }

        await fetchBackendJson('/community/posts', {
            method: 'POST',
            body: {
                tripId: trip.id
            }
        });
    }

    async listComments(userId: string, postId: string): Promise<MobileCommunityComment[]> {
        if (!userId || !postId) {
            return [];
        }

        assertMobileFirebaseConfigReady();
        const db = getMobileFirestore();
        const commentsCollection = collection(db, 'community_posts', postId, 'comments');

        let snapshots;

        try {
            snapshots = await getDocs(query(commentsCollection, orderBy('createdAt', 'desc'), limit(100)));
        } catch {
            snapshots = await getDocs(query(commentsCollection, limit(100)));
        }

        const blockedUserIds = await this.readBlockedUserIds(userId);
        const blockedUserIdSet = new Set(blockedUserIds);
        const visibleSnapshots = snapshots.docs.filter((commentSnapshot) => {
            const rawData = commentSnapshot.data();
            const authorUid = this.readString((rawData as { authorUid?: unknown })?.authorUid);
            const isBlockedAuthor = authorUid ? blockedUserIdSet.has(authorUid) : false;
            return this.isVisibleModeration((rawData as { moderation?: unknown })?.moderation) && !isBlockedAuthor;
        });

        return Promise.all(visibleSnapshots.map(async (commentSnapshot) => {
            const rawData = commentSnapshot.data();
            const normalized = normalizeCommunityComment(commentSnapshot.id, rawData);
            const resolved = await this.resolveCommentAuthor(normalized);
            return mapCommunityComment(resolved);
        }));
    }

    async addComment(postId: string, input: MobileCommunityCommentCreateInput): Promise<void> {
        const text = input.text.trim();

        if (!postId || !text) {
            throw new Error('댓글을 입력해 주세요.');
        }

        await fetchBackendJson<CommunityCommentResponse>(`/community/posts/${encodeURIComponent(postId)}/comments`, {
            method: 'POST',
            body: { text }
        });
    }

    async toggleLike(
        userId: string,
        postId: string,
        currentlyLiked: boolean
    ): Promise<MobileCommunityLikeResult> {
        if (!userId || !postId) {
            throw new Error('좋아요를 처리할 수 없어요.');
        }

        const result = await fetchBackendJson<CommunityLikeToggleResponse>(
            `/community/posts/${encodeURIComponent(postId)}/like-toggle`,
            { method: 'POST' }
        );

        return {
            isLiked: Boolean(result?.isLiked),
            likesCount: typeof result?.likesCount === 'number' ? result.likesCount : undefined
        };
    }

    async reportPost(postId: string, reason = 'other'): Promise<void> {
        if (!postId) {
            throw new Error('신고할 공개 일정을 찾을 수 없어요.');
        }

        await fetchBackendJson(`/community/posts/${encodeURIComponent(postId)}/report`, {
            method: 'POST',
            body: {
                reason
            }
        });
    }

    async reportComment(postId: string, commentId: string, reason = 'other'): Promise<void> {
        if (!postId || !commentId) {
            throw new Error('신고할 댓글을 찾을 수 없어요.');
        }

        await fetchBackendJson(
            `/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/report`,
            {
                method: 'POST',
                body: {
                    reason
                }
            }
        );
    }

    async blockUser(userId: string, targetUserId: string): Promise<void> {
        if (!userId || !targetUserId) {
            throw new Error('차단할 사용자를 찾을 수 없어요.');
        }

        await fetchBackendJson<CommunityBlockMutationResponse>(
            `/community/users/${encodeURIComponent(targetUserId)}/block`,
            {
                method: 'POST'
            }
        );
    }

    async unblockUser(userId: string, targetUserId: string): Promise<void> {
        if (!userId || !targetUserId) {
            throw new Error('차단 해제할 사용자를 찾을 수 없어요.');
        }

        await fetchBackendJson<CommunityBlockMutationResponse>(
            `/community/users/${encodeURIComponent(targetUserId)}/block`,
            {
                method: 'DELETE'
            }
        );
    }

    async deletePost(userId: string, postId: string): Promise<void> {
        if (!userId || !postId) {
            throw new Error('삭제할 공개 일정을 찾을 수 없어요.');
        }

        await fetchBackendJson(`/community/posts/${encodeURIComponent(postId)}`, {
            method: 'DELETE'
        });
    }

    async duplicatePostToTrip(
        userId: string,
        postId: string,
        input?: MobileCommunityTripDuplicateInput
    ): Promise<MobileTripDetail | null> {
        if (!userId || !postId) {
            return null;
        }

        assertTripCreationEnabled();

        const payload = await fetchBackendJson<TripDetailResponse>(
            `/community/posts/${encodeURIComponent(postId)}/duplicate-to-trip`,
            {
                method: 'POST',
                body: input
                    ? {
                        title: input.title,
                        startDate: input.startDate,
                        endDate: input.endDate
                    }
                    : {}
            }
        );

        if (!payload?.trip?.id) {
            throw new Error('가져온 여행 정보를 불러오지 못했어요.');
        }

        return mapTripDetail(
            normalizeTripDocument(payload.trip.id, payload.trip) as CanonicalTripDocument,
            userId
        );
    }
}
