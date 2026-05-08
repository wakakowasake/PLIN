import type {
    MobileCommunityComment,
    MobileCommunityCommentCreateInput,
    MobileCommunityLikeResult,
    MobileCommunityPostDetail,
    MobileCommunityPostSummary,
    MobileCommunityTripDuplicateInput
} from '@/types/community';
import type { MobileTripDetail } from '@/types/trip';

export type OffsetPageRequest = {
    cursor?: number | null;
    limit?: number | null;
};

export type CommunityPostListPage = {
    items: MobileCommunityPostSummary[];
    nextCursor: number | null;
    hasMore: boolean;
};

export interface CommunityRepository {
    listPostsPage(userId: string, options?: OffsetPageRequest): Promise<CommunityPostListPage>;
    listPosts(userId: string): Promise<MobileCommunityPostSummary[]>;
    getPostDetail(userId: string, postId: string): Promise<MobileCommunityPostDetail | null>;
    publishTrip(userId: string, trip: MobileTripDetail): Promise<void>;
    listComments(userId: string, postId: string): Promise<MobileCommunityComment[]>;
    addComment(postId: string, input: MobileCommunityCommentCreateInput): Promise<void>;
    toggleLike(userId: string, postId: string, currentlyLiked: boolean): Promise<MobileCommunityLikeResult>;
    reportPost(postId: string, reason?: string): Promise<void>;
    reportComment(postId: string, commentId: string, reason?: string): Promise<void>;
    blockUser(userId: string, targetUserId: string): Promise<void>;
    unblockUser(userId: string, targetUserId: string): Promise<void>;
    deletePost(userId: string, postId: string): Promise<void>;
    duplicatePostToTrip(
        userId: string,
        postId: string,
        input?: MobileCommunityTripDuplicateInput
    ): Promise<MobileTripDetail | null>;
}
