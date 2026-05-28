import {
    mapCommunityComment,
    mapCommunityPostDetail,
    mapCommunityPostSummary
} from '@/mappers/community-mapper';
import { assertTripCreationEnabled } from '@/features/trip-creation';
import { mapTripDetail } from '@/mappers/trip-detail-mapper';
import { MAX_OFFSET_PAGE_LIMIT, paginateOffsetItems } from '@/utils/pagination';
import type {
    MobileCommunityComment,
    MobileCommunityCommentCreateInput,
    MobileCommunityLikeResult,
    MobileCommunityPostDetail,
    MobileCommunityPostSummary,
    MobileCommunityTripDuplicateInput,
    RawCommunityComment,
    RawCommunityPost
} from '@/types/community';
import type { CanonicalTripDocument, MobileTripDetail } from '@/types/trip';
import { buildDuplicatedTripPayload } from '@/adapters/trips/trip-duplicate-payload';
import { normalizeTripDocument } from '@shared/features/trips/trip-canonical.js';
import type {
    CommunityPublishOptions,
    CommunityPostListPage,
    CommunityRepository,
    OffsetPageRequest
} from './CommunityRepository';

const MOCK_COMMUNITY_POSTS: RawCommunityPost[] = [
    {
        id: 'community-jeju-spring',
        authorUid: 'mock-author-1',
        authorName: 'PLIN 사용자',
        authorPhoto: null,
        likesCount: 14,
        clonesCount: 6,
        publishedAt: '2026-03-18T09:30:00.000Z',
        meta: {
            title: '제주 봄 바람 여행',
            subInfo: '제주 • 2026년 3월 21일 - 3월 23일',
            dayCount: '2박 3일',
            mapImage: null
        },
        days: [
            {
                date: '2026-03-21',
                timeline: [
                    {
                        time: '10:00',
                        title: '협재 해변 산책',
                        location: '협재 해수욕장',
                        tag: '관광',
                        note: '바람이 많이 불면 외투 필수',
                        memories: [
                            {
                                photoUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
                                comment: '맑은 바다 색이 인상적이었어요.',
                                createdAt: '2026-03-21'
                            }
                        ]
                    }
                ]
            }
        ]
    },
    {
        id: 'community-osaka-food',
        authorUid: 'mock-author-2',
        authorName: 'PLIN 사용자',
        authorPhoto: null,
        likesCount: 22,
        clonesCount: 11,
        publishedAt: '2026-03-10T18:00:00.000Z',
        meta: {
            title: '오사카 먹방 루트',
            subInfo: '오사카 • 2026년 2월 10일 - 2월 12일',
            dayCount: '2박 3일',
            mapImage: null
        },
        days: [
            {
                date: '2026-02-10',
                timeline: [
                    {
                        time: '12:30',
                        title: '도톤보리 점심',
                        location: '도톤보리',
                        tag: '식사',
                        expenses: [
                            {
                                description: '오코노미야키',
                                amount: 18000,
                                currency: 'KRW'
                            }
                        ]
                    }
                ]
            }
        ]
    }
];

const MOCK_COMMUNITY_COMMENTS: Record<string, RawCommunityComment[]> = {
    'community-jeju-spring': [
        {
            id: 'comment-jeju-1',
            text: '바다 색감이 정말 예뻐 보여요.',
            authorUid: 'mock-commenter-1',
            authorName: 'PLIN 사용자',
            authorPhoto: null,
            createdAt: '2026-03-20T08:20:00.000Z'
        }
    ],
    'community-osaka-food': [
        {
            id: 'comment-osaka-1',
            text: '오코노미야키 루트 저장해두고 싶네요.',
            authorUid: 'mock-commenter-2',
            authorName: '야식 메모러',
            authorPhoto: null,
            createdAt: '2026-03-11T12:00:00.000Z'
        }
    ]
};

const mockLikedPostsByUser = new Map<string, Set<string>>();
const mockBlockedUsersByUser = new Map<string, Set<string>>();

function delay(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

function buildMockCommunityPostFromTrip(
    userId: string,
    trip: MobileTripDetail,
    options?: CommunityPublishOptions
): RawCommunityPost {
    return {
        id: `community-published-${trip.id}-${Date.now()}`,
        authorUid: userId,
        authorName: 'PLIN 사용자',
        authorPhoto: null,
        likesCount: 0,
        clonesCount: 0,
        publishedAt: new Date().toISOString(),
        meta: {
            title: trip.title,
            subInfo: trip.subInfo,
            dayCount: trip.dayCount,
            location: trip.locationLabel,
            startDate: trip.editInfo.startDate,
            endDate: trip.editInfo.endDate,
            coverImage: trip.coverImage || null,
            mapImage: trip.coverImage || null,
            status: trip.status
        },
        days: trip.days.map((day) => ({
            id: day.id,
            date: day.date,
            timeline: day.items.map((item) => ({
                time: item.timeLabel,
                duration: item.durationLabel,
                title: item.title,
                location: item.location,
                tag: item.badgeLabel,
                isTransit: item.isTransit,
                transitType: item.transitType || '',
                latitude: item.latitude ?? null,
                longitude: item.longitude ?? null,
                placeId: item.placeId || ''
            }))
        })),
        marketplace: options?.marketplace?.productId ? {
            productId: options.marketplace.productId,
            priceLabel: options.marketplace.priceLabel || 'PLIN Plus',
            currencyCode: options.marketplace.currencyCode || 'KRW',
            salesStatus: 'paid'
        } : undefined,
        shoppingList: [],
        checklist: []
    };
}

export class MockCommunityRepository implements CommunityRepository {
    async listPostsPage(userId: string, options?: OffsetPageRequest): Promise<CommunityPostListPage> {
        await delay(180);
        if (!userId) {
            return {
                items: [],
                nextCursor: null,
                hasMore: false
            };
        }

        const likedSet = mockLikedPostsByUser.get(userId) || new Set<string>();
        const blockedSet = mockBlockedUsersByUser.get(userId) || new Set<string>();
        const items = MOCK_COMMUNITY_POSTS.map((post) => ({
            ...mapCommunityPostSummary(post),
            isLiked: likedSet.has(post.id)
        })).filter((post) => !blockedSet.has(post.authorUid));

        return paginateOffsetItems(items, {
            cursor: options?.cursor,
            limit: options?.limit,
            maxLimit: MAX_OFFSET_PAGE_LIMIT
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
        await delay(180);
        if (!userId) {
            return null;
        }

        const post = MOCK_COMMUNITY_POSTS.find((item) => item.id === postId);
        if (!post || (mockBlockedUsersByUser.get(userId) || new Set<string>()).has(post.authorUid || '')) {
            return null;
        }

        return post
            ? {
                ...mapCommunityPostDetail(post),
                isLiked: (mockLikedPostsByUser.get(userId) || new Set<string>()).has(postId)
            }
            : null;
    }

    async publishTrip(userId: string, trip: MobileTripDetail, options?: CommunityPublishOptions): Promise<void> {
        await delay(160);

        if (!userId) {
            throw new Error('로그인이 필요해요.');
        }

        if (!trip?.id) {
            throw new Error('공개할 일정을 찾을 수 없어요.');
        }

        MOCK_COMMUNITY_POSTS.unshift(buildMockCommunityPostFromTrip(userId, trip, options));
    }

    async listComments(userId: string, postId: string): Promise<MobileCommunityComment[]> {
        await delay(120);
        const blockedSet = mockBlockedUsersByUser.get(userId) || new Set<string>();
        return (MOCK_COMMUNITY_COMMENTS[postId] || [])
            .filter((comment) => !blockedSet.has(comment.authorUid || ''))
            .map((comment) => mapCommunityComment(comment));
    }

    async addComment(postId: string, input: MobileCommunityCommentCreateInput): Promise<void> {
        await delay(120);

        const text = input.text.trim();

        if (!postId || !text) {
            throw new Error('댓글을 입력해 주세요.');
        }

        const nextComment: RawCommunityComment = {
            id: `mock-comment-${Date.now()}`,
            text,
            authorUid: input.authorUid,
            authorName: input.authorName || '익명',
            authorPhoto: input.authorPhotoURL,
            createdAt: new Date().toISOString()
        };

        const nextComments = MOCK_COMMUNITY_COMMENTS[postId] || [];
        MOCK_COMMUNITY_COMMENTS[postId] = [nextComment, ...nextComments];
    }

    async toggleLike(
        userId: string,
        postId: string,
        currentlyLiked: boolean
    ): Promise<MobileCommunityLikeResult> {
        await delay(120);

        const post = MOCK_COMMUNITY_POSTS.find((item) => item.id === postId);

        if (!post) {
            throw new Error('플랜을 찾을 수 없어요.');
        }

        const likedSet = mockLikedPostsByUser.get(userId) || new Set<string>();

        if (currentlyLiked) {
            likedSet.delete(postId);
            post.likesCount = Math.max(0, (post.likesCount || 0) - 1);
        } else {
            likedSet.add(postId);
            post.likesCount = (post.likesCount || 0) + 1;
        }

        mockLikedPostsByUser.set(userId, likedSet);

        return {
            isLiked: !currentlyLiked
        };
    }

    async reportPost(postId: string, reason = 'other'): Promise<void> {
        await delay(80);

        if (!postId || !reason) {
            throw new Error('신고할 플랜을 찾을 수 없어요.');
        }
    }

    async reportComment(postId: string, commentId: string, reason = 'other'): Promise<void> {
        await delay(80);

        if (!postId || !commentId || !reason) {
            throw new Error('신고할 댓글을 찾을 수 없어요.');
        }
    }

    async blockUser(userId: string, targetUserId: string): Promise<void> {
        await delay(100);

        if (!userId || !targetUserId) {
            throw new Error('차단할 사용자를 찾을 수 없어요.');
        }

        const blockedSet = mockBlockedUsersByUser.get(userId) || new Set<string>();
        blockedSet.add(targetUserId);
        mockBlockedUsersByUser.set(userId, blockedSet);
    }

    async unblockUser(userId: string, targetUserId: string): Promise<void> {
        await delay(100);

        if (!userId || !targetUserId) {
            throw new Error('차단 해제할 사용자를 찾을 수 없어요.');
        }

        const blockedSet = mockBlockedUsersByUser.get(userId) || new Set<string>();
        blockedSet.delete(targetUserId);
        mockBlockedUsersByUser.set(userId, blockedSet);
    }

    async deletePost(userId: string, postId: string): Promise<void> {
        await delay(140);

        if (!userId || !postId) {
            throw new Error('삭제할 플랜을 찾을 수 없어요.');
        }

        const postIndex = MOCK_COMMUNITY_POSTS.findIndex((item) => item.id === postId);
        if (postIndex < 0) {
            throw new Error('삭제할 플랜을 찾을 수 없어요.');
        }

        const post = MOCK_COMMUNITY_POSTS[postIndex];
        if ((post.authorUid || '') !== userId) {
            throw new Error('작성한 플랜만 삭제할 수 있어요.');
        }

        MOCK_COMMUNITY_POSTS.splice(postIndex, 1);
        delete MOCK_COMMUNITY_COMMENTS[postId];

        mockLikedPostsByUser.forEach((likedSet) => {
            likedSet.delete(postId);
        });
    }

    async duplicatePostToTrip(
        userId: string,
        postId: string,
        input?: MobileCommunityTripDuplicateInput
    ): Promise<MobileTripDetail | null> {
        await delay(160);

        if (!userId || !postId) {
            return null;
        }

        assertTripCreationEnabled();

        const post = MOCK_COMMUNITY_POSTS.find((item) => item.id === postId);
        if (!post) {
            throw new Error('가져올 플랜을 찾을 수 없어요.');
        }

        const canonicalTrip = normalizeTripDocument(post.id, post) as CanonicalTripDocument;
        const payload = buildDuplicatedTripPayload(userId, post, canonicalTrip, input);
        post.clonesCount = (post.clonesCount || 0) + 1;

        return mapTripDetail(
            normalizeTripDocument(`mock-trip-${Date.now()}`, payload) as CanonicalTripDocument
        );
    }
}
