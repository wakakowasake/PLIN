import React from 'react';
import {
    FlatList,
    KeyboardAvoidingView,
    StyleSheet,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Share,
    Text,
    TextInput,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdapters } from '@/adapters/useAdapters';
import { BottomNavBar } from '@/components/BottomNavBar';
import { CommunityPostCard } from '@/components/CommunityPostCard';
import {
    DateCalendarModal,
    formatCalendarDisplayDate,
    parseIsoDateInput
} from '@/components/DateCalendarModal';
import { EmptyState } from '@/components/EmptyState';
import { Alert } from '@/feedback';
import {
    isTripCreationEnabled,
    TRIP_CREATION_DISABLED_MESSAGE,
    TRIP_CREATION_DISABLED_TITLE
} from '@/features/trip-creation';
import { LoadingView } from '@/components/LoadingView';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useCommunityFeed } from '@/hooks/useCommunityFeed';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { readCommunityViewMode, writeCommunityViewMode } from '@/services/list-view-preferences';
import {
    isPurchaseCancelledError,
    purchasePlanMarketplacePost,
    restorePlanMarketplacePostPurchase
} from '@/services/plan-marketplace-purchases';
import { usePrimaryScrollActivityReporter } from '@/state/primary-scroll-activity';
import { publishTripCreated } from '@/state/trip-write-sync';
import { type AppTheme, useAppTheme } from '@/theme';
import { isPlinAdminProfile } from '@/utils/admin-access';
import { getNativeStoreLabel } from '@/utils/native-store-copy';
import type {
    MobileCommunityPostSummary,
    MobileCommunityTripDuplicateInput
} from '@/types/community';
import type { MobileTripSummary, PlanPurpose } from '@/types/trip';
import {
    getTripTitleTooLongMessage,
    truncateTripTitle,
    validateTripTitle
} from '@shared/features/trips/trip-title.js';

type Props = NativeStackScreenProps<RootStackParamList, 'Community'>;
type CommunitySortKey = 'recent' | 'likes' | 'clones';
type CommunitySortDirection = 'asc' | 'desc';
type CommunityViewMode = 'card' | 'feed';
type PlanPurposeFilter = 'all' | PlanPurpose;
type DuplicateDraftState = {
    post: MobileCommunityPostSummary;
    title: string;
    startDate: string;
    endDate: string;
    error: string | null;
};
type DuplicateRangeNotice = {
    tone: 'info' | 'warning';
    text: string;
};
type LoadingCommunityRow = {
    kind: 'loading';
    id: string;
};
const VIEW_MODE_SWITCH_BLANK_MS = 200;

const SORT_OPTIONS: Array<{
    key: CommunitySortKey;
    label: string;
    defaultDirection: CommunitySortDirection;
}> = [
    { key: 'recent', label: '최근 공개', defaultDirection: 'desc' },
    { key: 'likes', label: '좋아요', defaultDirection: 'desc' },
    { key: 'clones', label: '복사', defaultDirection: 'desc' }
];

const VIEW_OPTIONS: Array<{ key: CommunityViewMode; label: string; hint: string }> = [
    { key: 'card', label: '카드형', hint: '사진과 분위기를 크게 살펴봐요.' },
    { key: 'feed', label: '피드형', hint: '썸네일과 핵심 정보를 세로로 빠르게 훑어봐요.' }
];
const VIEW_MODE_ICONS: Record<CommunityViewMode, keyof typeof Ionicons.glyphMap> = {
    card: 'grid-outline',
    feed: 'newspaper-outline'
};

const PLAN_PURPOSE_FILTER_OPTIONS: ReadonlyArray<{
    key: PlanPurposeFilter;
    label: string;
}> = [
    { key: 'all', label: '전체' },
    { key: 'trip', label: '여행' },
    { key: 'date', label: '데이트' }
];

const COMMUNITY_LOADING_PLACEHOLDERS = [0, 1, 2];

const COMMUNITY_SHARE_BASE_URL = 'https://plin.ink';

function buildCommunityShareMessage(title: string) {
    const safeTitle = String(title || '').trim() || '플랜';
    return `PLIN에서 "${safeTitle}" 플랜을 확인해 보세요.\n${COMMUNITY_SHARE_BASE_URL}`;
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

function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatCompactDateLabel(value: string) {
    const date = parseDateOnly(value);
    if (!date) {
        return '날짜 미정';
    }

    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
    const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
}

function buildDuplicateTitleDefault(title: string) {
    const safeTitle = String(title || '').trim() || '제목 없는 일정';
    const nextTitle = safeTitle.endsWith(' 사본') ? safeTitle : `${safeTitle} 사본`;
    return truncateTripTitle(nextTitle);
}

function buildDuplicateDraft(post: MobileCommunityPostSummary): DuplicateDraftState {
    const sourceStartDate = parseDateOnly(post.startDate);
    const sourceEndDate = parseDateOnly(post.endDate);
    const durationDays = sourceStartDate && sourceEndDate
        ? Math.max(
            1,
            Math.round((sourceEndDate.getTime() - sourceStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
        )
        : 3;
    const defaultStartDate = addDays(startOfToday(), 7);
    const defaultEndDate = addDays(defaultStartDate, durationDays - 1);

    return {
        post,
        title: buildDuplicateTitleDefault(post.title),
        startDate: formatDateInput(defaultStartDate),
        endDate: formatDateInput(defaultEndDate),
        error: null
    };
}

function buildDuplicateValidationMessage(input: MobileCommunityTripDuplicateInput) {
    const titleValidation = validateTripTitle(input.title);
    if (titleValidation.code === 'missing') {
        return '새 일정 이름을 입력해 주세요.';
    }

    if (titleValidation.code === 'too_long') {
        return getTripTitleTooLongMessage();
    }

    if (!parseIsoDateInput(input.startDate) || !parseIsoDateInput(input.endDate)) {
        return '날짜를 다시 선택해 주세요.';
    }

    if (input.endDate < input.startDate) {
        return '종료일은 시작일보다 같거나 뒤여야 해요.';
    }

    return null;
}

function buildTripDurationLabel(totalDays: number) {
    if (totalDays <= 1) {
        return '당일치기';
    }

    return `${totalDays - 1}박 ${totalDays}일`;
}

function buildTripRangeSummary(startDate: string, endDate: string) {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);

    if (!start || !end || end.getTime() < start.getTime()) {
        return null;
    }

    const totalDays = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );

    return {
        totalDays,
        durationLabel: buildTripDurationLabel(totalDays)
    };
}

function buildDuplicateRangeNotice(draft: DuplicateDraftState | null): DuplicateRangeNotice | null {
    if (!draft) {
        return null;
    }

    const sourceRange = buildTripRangeSummary(draft.post.startDate, draft.post.endDate);
    const targetRange = buildTripRangeSummary(draft.startDate, draft.endDate);

    if (!sourceRange || !targetRange) {
        return null;
    }

    if (targetRange.totalDays < sourceRange.totalDays) {
        const removedDays = sourceRange.totalDays - targetRange.totalDays;

        return {
            tone: 'warning',
            text: removedDays === 1
                ? `원본 일정은 ${sourceRange.durationLabel}이에요. ${targetRange.durationLabel}로 가져오면 ${targetRange.totalDays + 1}일째 일정부터 빠져요.`
                : `원본 일정은 ${sourceRange.durationLabel}이에요. ${targetRange.durationLabel}로 가져오면 ${targetRange.totalDays + 1}일째부터 ${removedDays}일치 일정이 빠져요.`
        };
    }

    if (targetRange.totalDays > sourceRange.totalDays) {
        const addedDays = targetRange.totalDays - sourceRange.totalDays;

        return {
            tone: 'info',
            text: `원본 일정은 ${sourceRange.durationLabel}이에요. ${targetRange.durationLabel}로 가져오면 마지막 ${addedDays}일은 빈 일정으로 추가돼요.`
        };
    }

    return {
        tone: 'info',
        text: `원본과 같은 ${sourceRange.durationLabel} 일정으로 가져와요.`
    };
}

function buildPublishableTripMeta(trip: MobileTripSummary) {
    const startLabel = formatCompactDateLabel(trip.startDate);
    const endLabel = formatCompactDateLabel(trip.endDate);

    if (startLabel === endLabel) {
        return `${trip.dayCount} · ${startLabel}`;
    }

    return `${trip.dayCount} · ${startLabel} - ${endLabel}`;
}

function comparePublishedAtDescending(left: string, right: string) {
    return right.localeCompare(left);
}

function comparePublishedAtAscending(left: string, right: string) {
    return left.localeCompare(right);
}

function normalizeSearchText(value: string) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function matchesCommunitySearch(post: MobileCommunityPostSummary, query: string) {
    const safeQuery = normalizeSearchText(query);
    if (!safeQuery) {
        return true;
    }

    const haystack = normalizeSearchText([
        post.title,
        post.subInfo,
        post.authorName,
        post.dayCount,
        post.startDate,
        post.endDate,
        post.publishedLabel
    ].join(' '));

    return haystack.includes(safeQuery);
}

function sortPosts(
    items: MobileCommunityPostSummary[],
    sortKey: CommunitySortKey,
    sortDirection: CommunitySortDirection
) {
    const nextItems = [...items];
    const resolveDirection = (value: number) => (
        sortDirection === 'asc' ? value : value * -1
    );

    switch (sortKey) {
    case 'likes':
        nextItems.sort((left, right) => {
            if (left.likesCount !== right.likesCount) {
                return resolveDirection(left.likesCount - right.likesCount);
            }

            return resolveDirection(comparePublishedAtAscending(left.publishedAt, right.publishedAt));
        });
        return nextItems;
    case 'clones':
        nextItems.sort((left, right) => {
            if (left.clonesCount !== right.clonesCount) {
                return resolveDirection(left.clonesCount - right.clonesCount);
            }

            return resolveDirection(comparePublishedAtAscending(left.publishedAt, right.publishedAt));
        });
        return nextItems;
    case 'recent':
    default:
        nextItems.sort((left, right) => (
            resolveDirection(comparePublishedAtAscending(left.publishedAt, right.publishedAt))
        ));
        return nextItems;
    }
}

export function CommunityScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const {
        scrollRef: duplicateScrollRef,
        createFocusHandler: createDuplicateFocusHandler,
        keyboardAwareContentInsetStyle: duplicateKeyboardAwareContentInsetStyle,
        scrollViewProps: duplicateScrollViewProps
    } = useKeyboardAwareInputScroll(96);
    const { user, profileSummary, retryBootstrap, refreshSession } = useAuthSession();
    const { communityRepository, communityRepositoryModeNotice, tripRepository } = useAdapters();
    const {
        items,
        loading,
        refreshing,
        loadingMore,
        hasMore,
        error,
        errorKind,
        refreshError,
        isEmpty,
        refresh,
        retry,
        loadMore
    } = useCommunityFeed(user?.uid ?? null);
    const [sortKey, setSortKey] = React.useState<CommunitySortKey>('recent');
    const [sortDirection, setSortDirection] = React.useState<CommunitySortDirection>('desc');
    const [viewMode, setViewMode] = React.useState<CommunityViewMode>('feed');
    const [purposeFilter, setPurposeFilter] = React.useState<PlanPurposeFilter>('all');
    const [isViewModeTransitioning, setIsViewModeTransitioning] = React.useState(false);
    const [isViewModeHydrated, setIsViewModeHydrated] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [isSortModalVisible, setIsSortModalVisible] = React.useState(false);
    const [isPurposeFilterModalVisible, setIsPurposeFilterModalVisible] = React.useState(false);
    const [isPublishHubVisible, setPublishHubVisible] = React.useState(false);
    const [publishableTrips, setPublishableTrips] = React.useState<MobileTripSummary[]>([]);
    const [isPublishHubLoading, setPublishHubLoading] = React.useState(false);
    const [publishHubError, setPublishHubError] = React.useState<string | null>(null);
    const [hasAnyTrips, setHasAnyTrips] = React.useState(false);
    const [activeMenuPost, setActiveMenuPost] = React.useState<MobileCommunityPostSummary | null>(null);
    const [duplicateDraft, setDuplicateDraft] = React.useState<DuplicateDraftState | null>(null);
    const [isDuplicateDatePickerVisible, setIsDuplicateDatePickerVisible] = React.useState(false);
    const [actionError, setActionError] = React.useState<string | null>(null);
    const [processingPostId, setProcessingPostId] = React.useState<string | null>(null);
    const [purchaseBusyPostId, setPurchaseBusyPostId] = React.useState<string | null>(null);
    const [pendingSharePost, setPendingSharePost] = React.useState<MobileCommunityPostSummary | null>(null);
    const viewModeTransitionTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const { notifyPrimaryScrollActivity, scrollEventThrottle } = usePrimaryScrollActivityReporter();
    const nativeStoreLabel = getNativeStoreLabel();
    const sortedItems = React.useMemo(
        () => sortPosts(items, sortKey, sortDirection),
        [items, sortDirection, sortKey]
    );
    const trimmedSearchQuery = React.useMemo(() => searchQuery.trim(), [searchQuery]);
    const filteredItems = React.useMemo(() => (
        sortedItems.filter((item) => (
            (purposeFilter === 'all' || item.purpose === purposeFilter)
            && matchesCommunitySearch(item, trimmedSearchQuery)
        ))
    ), [purposeFilter, sortedItems, trimmedSearchQuery]);
    const isInitialLoading = loading && sortedItems.length === 0;
    const activeSortOption = React.useMemo(() => (
        SORT_OPTIONS.find((option) => option.key === sortKey) || SORT_OPTIONS[0]
    ), [sortKey]);
    const activePurposeFilterOption = React.useMemo(() => (
        PLAN_PURPOSE_FILTER_OPTIONS.find((option) => option.key === purposeFilter)
        || PLAN_PURPOSE_FILTER_OPTIONS[0]
    ), [purposeFilter]);
    const activeViewOption = React.useMemo(() => (
        VIEW_OPTIONS.find((option) => option.key === viewMode) || VIEW_OPTIONS[0]
    ), [viewMode]);
    const nextViewOption = React.useMemo(() => {
        const currentIndex = VIEW_OPTIONS.findIndex((option) => option.key === viewMode);
        if (currentIndex < 0) {
            return VIEW_OPTIONS[0];
        }

        return VIEW_OPTIONS[(currentIndex + 1) % VIEW_OPTIONS.length];
    }, [viewMode]);
    const duplicateRangeNotice = React.useMemo(
        () => buildDuplicateRangeNotice(duplicateDraft),
        [duplicateDraft]
    );
    const isCommunityAdmin = isPlinAdminProfile(profileSummary, user);
    const canDeleteActivePost = Boolean(
        activeMenuPost
        && user?.uid
        && (activeMenuPost.authorUid === user.uid || isCommunityAdmin)
    );
    const isActivePostBlocked = Boolean(
        activeMenuPost
        && activeMenuPost.authorUid
        && profileSummary?.blockedUserIds.includes(activeMenuPost.authorUid)
    );
    const fabInsetStyle = React.useMemo(() => ({
        bottom: insets.bottom + theme.spacing.xxxl + theme.spacing.lg,
        right: theme.spacing.sm
    }), [insets.bottom, theme.spacing.lg, theme.spacing.sm, theme.spacing.xxxl]);
    const publishSheetInsetStyle = React.useMemo(() => ({
        paddingBottom: insets.bottom + theme.spacing.md
    }), [insets.bottom, theme.spacing.md]);
    const hasPendingAction = Boolean(processingPostId || purchaseBusyPostId);
    const activeMenuIsLockedPlan = activeMenuPost?.marketplace.purchaseState === 'locked';
    const communityRenderItems = React.useMemo<Array<MobileCommunityPostSummary | LoadingCommunityRow>>(
        () => (
            isInitialLoading
                ? COMMUNITY_LOADING_PLACEHOLDERS.map((placeholder) => ({
                    kind: 'loading',
                    id: `community-loading-${placeholder}`
                }))
                : filteredItems
        ),
        [filteredItems, isInitialLoading]
    );
    const visibleCommunityRenderItems = React.useMemo<Array<MobileCommunityPostSummary | LoadingCommunityRow>>(
        () => (isViewModeTransitioning ? [] : communityRenderItems),
        [communityRenderItems, isViewModeTransitioning]
    );
    const isEmptyFeedState = isEmpty && !trimmedSearchQuery && purposeFilter === 'all';
    const activeSortDirectionIcon: keyof typeof Ionicons.glyphMap =
        sortDirection === 'asc' ? 'arrow-up' : 'arrow-down';
    const activeViewModeIcon: keyof typeof Ionicons.glyphMap = VIEW_MODE_ICONS[viewMode];

    React.useEffect(() => {
        let isMounted = true;

        void readCommunityViewMode()
            .then((storedViewMode) => {
                if (!isMounted || !storedViewMode) {
                    return;
                }

                setViewMode(storedViewMode);
            })
            .finally(() => {
                if (isMounted) {
                    setIsViewModeHydrated(true);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    React.useEffect(() => () => {
        if (viewModeTransitionTimeoutRef.current) {
            clearTimeout(viewModeTransitionTimeoutRef.current);
        }
    }, []);

    React.useEffect(() => {
        if (!isViewModeHydrated) {
            return;
        }

        void writeCommunityViewMode(viewMode);
    }, [isViewModeHydrated, viewMode]);

    React.useEffect(() => {
        let isMounted = true;

        if (!user?.uid) {
            setHasAnyTrips(false);
            return () => {
                isMounted = false;
            };
        }

        void tripRepository.listTripsPage(user.uid, {
            cursor: 0,
            limit: 1
        }).then((page) => {
            if (!isMounted) {
                return;
            }

            setHasAnyTrips(page.items.length > 0);
        }).catch(() => {
            if (!isMounted) {
                return;
            }

            setHasAnyTrips(false);
        });

        return () => {
            isMounted = false;
        };
    }, [tripRepository, user?.uid]);

    const handleRefresh = React.useCallback(async () => {
        if (loading || refreshing) {
            return;
        }

        const nextUser = await refreshSession();

        if (!nextUser || (user?.uid && nextUser.uid !== user.uid)) {
            return;
        }

        await refresh();
    }, [loading, refresh, refreshSession, refreshing, user?.uid]);

    const handleLoadMore = React.useCallback(async () => {
        if (hasPendingAction) {
            return;
        }

        await loadMore();
    }, [hasPendingAction, loadMore]);

    const loadPublishableTrips = React.useCallback(async () => {
        if (!user?.uid) {
            setPublishableTrips([]);
            setPublishHubError('로그인 후 공개 가능한 일정을 확인할 수 있어요.');
            return;
        }

        setPublishHubLoading(true);
        setPublishHubError(null);

        try {
            const nextTrips = await tripRepository.listTrips(user.uid);
            setPublishableTrips(
                nextTrips.filter((trip) => trip.permissions.canPublishCommunity)
            );
        } catch (loadError) {
            setPublishHubError(
                loadError instanceof Error
                    ? loadError.message
                    : '공개 가능한 일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
            );
            setPublishableTrips([]);
        } finally {
            setPublishHubLoading(false);
        }
    }, [tripRepository, user?.uid]);

    const closePublishHub = React.useCallback(() => {
        if (isPublishHubLoading) {
            return;
        }

        setPublishHubVisible(false);
    }, [isPublishHubLoading]);

    const handleOpenPublishHub = React.useCallback(() => {
        setPublishHubVisible(true);
        void loadPublishableTrips();
    }, [loadPublishableTrips]);

    const handleSelectPublishTrip = React.useCallback((trip: MobileTripSummary) => {
        setPublishHubVisible(false);
        navigation.navigate('TripDetail', {
            tripId: trip.id,
            startInCommunityPublishFlow: true
        });
    }, [navigation]);

    const closeActionMenu = React.useCallback(() => {
        if (hasPendingAction) {
            return;
        }

        setActiveMenuPost(null);
    }, [hasPendingAction]);

    const openActionMenu = React.useCallback((post: MobileCommunityPostSummary) => {
        if (hasPendingAction) {
            return;
        }

        setIsSortModalVisible(false);
        setIsPurposeFilterModalVisible(false);
        setActiveMenuPost(post);
    }, [hasPendingAction]);

    const closeSortModal = React.useCallback(() => {
        setIsSortModalVisible(false);
    }, []);

    const closePurposeFilterModal = React.useCallback(() => {
        setIsPurposeFilterModalVisible(false);
    }, []);

    const handleOpenSortModal = React.useCallback(() => {
        if (hasPendingAction || isInitialLoading) {
            return;
        }

        setIsSortModalVisible(true);
    }, [hasPendingAction, isInitialLoading]);

    const handleOpenPurposeFilterModal = React.useCallback(() => {
        if (hasPendingAction || isInitialLoading) {
            return;
        }

        setIsPurposeFilterModalVisible(true);
    }, [hasPendingAction, isInitialLoading]);

    const handleSelectPurposeFilter = React.useCallback((nextPurposeFilter: PlanPurposeFilter) => {
        if (hasPendingAction) {
            return;
        }

        setPurposeFilter(nextPurposeFilter);
        setIsPurposeFilterModalVisible(false);
    }, [hasPendingAction]);

    const handleSelectSortOption = React.useCallback((nextSortKey: CommunitySortKey) => {
        if (hasPendingAction) {
            return;
        }

        if (nextSortKey === sortKey) {
            setSortDirection((currentDirection) => (
                currentDirection === 'asc' ? 'desc' : 'asc'
            ));
        } else {
            const nextOption = SORT_OPTIONS.find((option) => option.key === nextSortKey);
            setSortKey(nextSortKey);
            setSortDirection(nextOption?.defaultDirection || 'desc');
        }

        setIsSortModalVisible(false);
    }, [hasPendingAction, sortKey]);

    const commitViewModeChange = React.useCallback((nextMode: CommunityViewMode) => {
        if (hasPendingAction || isInitialLoading || isViewModeTransitioning || nextMode === viewMode) {
            return;
        }

        if (viewModeTransitionTimeoutRef.current) {
            clearTimeout(viewModeTransitionTimeoutRef.current);
        }

        setIsViewModeTransitioning(true);
        viewModeTransitionTimeoutRef.current = setTimeout(() => {
            setViewMode(nextMode);
            setIsViewModeTransitioning(false);
            viewModeTransitionTimeoutRef.current = null;
        }, VIEW_MODE_SWITCH_BLANK_MS);
    }, [hasPendingAction, isInitialLoading, isViewModeTransitioning, viewMode]);

    const handleCycleViewMode = React.useCallback(() => {
        if (hasPendingAction || isInitialLoading || isViewModeTransitioning) {
            return;
        }

        const currentIndex = VIEW_OPTIONS.findIndex((option) => option.key === viewMode);
        const nextMode = currentIndex < 0
            ? VIEW_OPTIONS[0].key
            : VIEW_OPTIONS[(currentIndex + 1) % VIEW_OPTIONS.length].key;

        commitViewModeChange(nextMode);
    }, [commitViewModeChange, hasPendingAction, isInitialLoading, isViewModeTransitioning, viewMode]);

    const handleSharePost = React.useCallback((post: MobileCommunityPostSummary) => {
        if (hasPendingAction) {
            return;
        }

        setActionError(null);
        setPendingSharePost(post);
        setActiveMenuPost(null);
    }, [hasPendingAction]);

    const handleDeletePost = React.useCallback((post: MobileCommunityPostSummary) => {
        if (!user?.uid || hasPendingAction || (post.authorUid !== user.uid && !isCommunityAdmin)) {
            return;
        }

        Alert.alert(
            '플랜을 삭제할까요?',
            `"${post.title}" 플랜이 내려가요.`,
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: () => {
                        setActiveMenuPost(null);

                        void (async () => {
                            setActionError(null);
                            setProcessingPostId(post.id);

                            try {
                                await communityRepository.deletePost(user.uid, post.id);
                                await refresh();
                            } catch (deleteError) {
                                setActionError(
                                    deleteError instanceof Error
                                        ? deleteError.message
                                        : '플랜을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.'
                                );
                            } finally {
                                setProcessingPostId(null);
                            }
                        })();
                    }
                }
            ]
        );
    }, [communityRepository, hasPendingAction, isCommunityAdmin, refresh, user?.uid]);

    const handleReportPost = React.useCallback((post: MobileCommunityPostSummary) => {
        if (hasPendingAction) {
            return;
        }

        Alert.alert(
            '이 글을 신고할까요?',
            `"${post.title}" 글을 검토 대상으로 접수할게요.`,
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '신고',
                    style: 'destructive',
                    onPress: () => {
                        setActiveMenuPost(null);

                        void (async () => {
                            setActionError(null);
                            setProcessingPostId(post.id);

                            try {
                                await communityRepository.reportPost(post.id, 'safety_review');
                                setActionError('신고를 접수했어요. 운영 검토 후 필요한 조치를 진행할게요.');
                            } catch (reportError) {
                                setActionError(
                                    reportError instanceof Error
                                        ? reportError.message
                                        : '신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.'
                                );
                            } finally {
                                setProcessingPostId(null);
                            }
                        })();
                    }
                }
            ]
        );
    }, [communityRepository, hasPendingAction]);

    const handleToggleBlockAuthor = React.useCallback((post: MobileCommunityPostSummary) => {
        if (!user?.uid || hasPendingAction || post.authorUid === user.uid) {
            return;
        }

        const isBlocked = profileSummary?.blockedUserIds.includes(post.authorUid) === true;

        Alert.alert(
            isBlocked ? '사용자 차단을 해제할까요?' : '이 사용자를 차단할까요?',
            isBlocked
                ? `${post.authorName}님의 플랜을 다시 표시할게요.`
                : `${post.authorName}님의 플랜과 댓글을 숨길게요.`,
            [
                { text: '취소', style: 'cancel' },
                {
                    text: isBlocked ? '차단 해제' : '차단',
                    style: isBlocked ? 'default' : 'destructive',
                    onPress: () => {
                        setActiveMenuPost(null);

                        void (async () => {
                            setActionError(null);
                            setProcessingPostId(post.id);

                            try {
                                if (isBlocked) {
                                    await communityRepository.unblockUser(user.uid, post.authorUid);
                                } else {
                                    await communityRepository.blockUser(user.uid, post.authorUid);
                                }

                                await refreshSession();
                                await refresh();
                            } catch (blockError) {
                                setActionError(
                                    blockError instanceof Error
                                        ? blockError.message
                                        : isBlocked
                                            ? '차단을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.'
                                            : '사용자를 차단하지 못했어요. 잠시 후 다시 시도해 주세요.'
                                );
                            } finally {
                                setProcessingPostId(null);
                            }
                        })();
                    }
                }
            ]
        );
    }, [communityRepository, hasPendingAction, profileSummary?.blockedUserIds, refresh, refreshSession, user?.uid]);

    const closeDuplicateModal = React.useCallback(() => {
        if (hasPendingAction) {
            return;
        }

        setDuplicateDraft(null);
        setIsDuplicateDatePickerVisible(false);
    }, [hasPendingAction]);

    const openDuplicateModal = React.useCallback((post: MobileCommunityPostSummary) => {
        if (hasPendingAction) {
            return;
        }

        if (post.marketplace.purchaseState === 'locked') {
            setActionError('PLIN Plus가 필요한 플랜이에요.');
            return;
        }

        if (!isTripCreationEnabled) {
            setActiveMenuPost(null);
            Alert.alert(TRIP_CREATION_DISABLED_TITLE, TRIP_CREATION_DISABLED_MESSAGE);
            return;
        }

        setActionError(null);
        setActiveMenuPost(null);
        setDuplicateDraft(buildDuplicateDraft(post));
    }, [hasPendingAction]);

    const handlePurchasePost = React.useCallback(async (post: MobileCommunityPostSummary) => {
        if (!user?.uid || hasPendingAction) {
            return;
        }

        const productId = post.marketplace.productId;
        if (!productId) {
            setActionError('구독이 필요한 플랜 정보를 찾지 못했어요.');
            return;
        }

        setActionError(null);
        setPurchaseBusyPostId(post.id);

        try {
            await purchasePlanMarketplacePost({
                userId: user.uid,
                postId: post.id,
                productId
            });
            await refresh();
            setActiveMenuPost(null);
            Alert.alert('PLIN Plus 활성화', '이제 내 일정으로 가져올 수 있어요.');
        } catch (purchaseError) {
            if (isPurchaseCancelledError(purchaseError)) {
                return;
            }

            const message = purchaseError instanceof Error
                ? purchaseError.message
                : '구독을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.';
            setActionError(message);
            Alert.alert('구독을 시작하지 못했어요', message, undefined, { presentation: 'native' });
        } finally {
            setPurchaseBusyPostId(null);
        }
    }, [hasPendingAction, refresh, user?.uid]);

    const handleRestorePostPurchase = React.useCallback(async (post: MobileCommunityPostSummary) => {
        if (!user?.uid || hasPendingAction) {
            return;
        }

        const productId = post.marketplace.productId;
        if (!productId) {
            setActionError('복원할 플랜 정보를 찾지 못했어요.');
            return;
        }

        setActionError(null);
        setPurchaseBusyPostId(post.id);

        try {
            await restorePlanMarketplacePostPurchase({
                userId: user.uid,
                postId: post.id,
                productId
            });
            await refresh();
            setActiveMenuPost(null);
            Alert.alert('구독을 복원했어요', '이제 내 일정으로 가져올 수 있어요.');
        } catch (restoreError) {
            const message = restoreError instanceof Error
                ? restoreError.message
                : '구독 내역을 복원하지 못했어요.';
            setActionError(message);
            Alert.alert('구독을 복원하지 못했어요', message);
        } finally {
            setPurchaseBusyPostId(null);
        }
    }, [hasPendingAction, refresh, user?.uid]);

    const handleOpenDuplicateDatePicker = React.useCallback(() => {
        if (!duplicateDraft || hasPendingAction) {
            return;
        }

        setIsDuplicateDatePickerVisible(true);
    }, [duplicateDraft, hasPendingAction]);

    const handleCloseDuplicateDatePicker = React.useCallback(() => {
        setIsDuplicateDatePickerVisible(false);
    }, []);

    const handleSelectDuplicateDateRange = React.useCallback((startDate: string, endDate: string) => {
        setDuplicateDraft((currentDraft) => currentDraft ? {
            ...currentDraft,
            startDate,
            endDate,
            error: null
        } : null);
        setIsDuplicateDatePickerVisible(false);
    }, []);

    const handleDuplicateDraftRangeChange = React.useCallback((startDate: string, endDate: string) => {
        setDuplicateDraft((currentDraft) => {
            if (!currentDraft) {
                return currentDraft;
            }

            if (currentDraft.startDate === startDate && currentDraft.endDate === endDate) {
                return currentDraft;
            }

            return {
                ...currentDraft,
                startDate,
                endDate,
                error: null
            };
        });
    }, []);

    const handleDuplicatePost = React.useCallback(() => {
        if (!user?.uid || !duplicateDraft || hasPendingAction) {
            return;
        }

        if (!isTripCreationEnabled) {
            setDuplicateDraft((currentDraft) => currentDraft ? {
                ...currentDraft,
                error: TRIP_CREATION_DISABLED_MESSAGE
            } : currentDraft);
            return;
        }

        const nextInput: MobileCommunityTripDuplicateInput = {
            title: duplicateDraft.title.trim(),
            startDate: duplicateDraft.startDate,
            endDate: duplicateDraft.endDate
        };
        const validationMessage = buildDuplicateValidationMessage(nextInput);

        if (validationMessage) {
            setDuplicateDraft((currentDraft) => currentDraft ? {
                ...currentDraft,
                error: validationMessage
            } : null);
            return;
        }

        const targetPost = duplicateDraft.post;

        void (async () => {
            setActionError(null);
            setProcessingPostId(targetPost.id);

            try {
                const duplicatedTrip = await communityRepository.duplicatePostToTrip(
                    user.uid,
                    targetPost.id,
                    nextInput
                );
                if (!duplicatedTrip) {
                    throw new Error('내 일정으로 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
                }

                setDuplicateDraft(null);
                setIsDuplicateDatePickerVisible(false);
                publishTripCreated(duplicatedTrip);
                setHasAnyTrips(true);
                Alert.alert(
                    '내 일정에 담았어요',
                    `"${duplicatedTrip.title}" 일정을 내 일정 목록에 추가했어요.`,
                    [
                        { text: '닫기', style: 'cancel' },
                        {
                            text: '내 일정 보기',
                            onPress: () => {
                                navigation.navigate('TripList');
                            }
                        }
                    ]
                );
            } catch (duplicateError) {
                const nextMessage = duplicateError instanceof Error
                    ? duplicateError.message
                    : '내 일정으로 가져오지 못했어요. 잠시 후 다시 시도해 주세요.';

                setDuplicateDraft((currentDraft) => currentDraft ? {
                    ...currentDraft,
                    error: nextMessage
                } : currentDraft);
            } finally {
                setProcessingPostId(null);
            }
        })();
    }, [communityRepository, duplicateDraft, hasPendingAction, navigation, user?.uid]);

    React.useEffect(() => {
        if (!pendingSharePost || activeMenuPost) {
            return;
        }

        const timeoutId = setTimeout(() => {
            void Share.share({
                title: pendingSharePost.title,
                message: buildCommunityShareMessage(pendingSharePost.title)
            }).catch(() => {
                setActionError('공유 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
            }).finally(() => {
                setPendingSharePost(null);
            });
        }, 180);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [activeMenuPost, pendingSharePost]);

    const noticeStack = (
        <>
            {actionError ? (
                <View style={[styles.bannerCard, styles.bannerCardWarning]}>
                    <Text style={[styles.bannerText, styles.bannerTextWarning]}>{actionError}</Text>
                </View>
            ) : null}
            {refreshError ? (
                <View style={[styles.bannerCard, styles.bannerCardWarning]}>
                    <Text style={[styles.bannerText, styles.bannerTextWarning]}>{refreshError}</Text>
                </View>
            ) : null}
            {communityRepositoryModeNotice ? (
                <View style={[styles.bannerCard, styles.bannerCardInfo]}>
                    <Text style={styles.bannerText}>{communityRepositoryModeNotice}</Text>
                </View>
            ) : null}
        </>
    );

    if (error) {
        return (
            <View style={styles.shell}>
                <SafeAreaView edges={['top']} style={styles.screenBody}>
                    <View style={styles.stateContent}>
                        {noticeStack}
                        {error ? (
                            <EmptyState
                                title={
                                    errorKind === 'session'
                                        ? '세션을 다시 확인해 주세요.'
                                        : errorKind === 'network'
                                            ? '연결이 잠시 불안정해요.'
                                            : '플랜을 불러오지 못했어요.'
                                }
                                description={error}
                                supportText={
                                    errorKind === 'network'
                                        ? '인터넷 연결이 돌아오면 새로고침으로 플랜 목록을 다시 확인할 수 있어요.'
                                        : undefined
                                }
                                actionLabel={
                                    errorKind === 'session'
                                        ? '세션 다시 확인'
                                        : errorKind === 'network'
                                            ? '다시 연결 시도'
                                            : '다시 시도'
                                }
                                tone={errorKind === 'network' ? 'warning' : 'default'}
                                onAction={() => {
                                    if (errorKind === 'session') {
                                        void retryBootstrap();
                                        return;
                                    }

                                    void retry();
                                }}
                            />
                        ) : null}
                    </View>
                </SafeAreaView>
                <BottomNavBar activeTab="Community" />
            </View>
        );
    }

    return (
        <View style={styles.shell}>
            <SafeAreaView edges={['top']} style={styles.screenBody}>
                <FlatList
                    key={`community-list-${viewMode}`}
                    style={styles.list}
                    data={visibleCommunityRenderItems}
                    extraData={{ viewMode, sortKey, sortDirection, isViewModeTransitioning, hasPendingAction }}
                    keyExtractor={(item) => item.id}
                    onScroll={notifyPrimaryScrollActivity}
                    scrollEventThrottle={scrollEventThrottle}
                    ListHeaderComponent={(
                        <View style={styles.listHeader}>
                            {noticeStack}
                            <View style={styles.searchRow}>
                                <View style={styles.searchBar}>
                                    <Text style={styles.searchIcon}>⌕</Text>
                                    <TextInput
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                        placeholder="제목, 설명, 작성자 검색"
                                        placeholderTextColor={theme.colors.textSecondary}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        returnKeyType="search"
                                        style={styles.searchInput}
                                    />
                                    {trimmedSearchQuery ? (
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="검색어 지우기"
                                            onPress={() => {
                                                setSearchQuery('');
                                            }}
                                            style={({ pressed }) => [
                                                styles.searchClearButton,
                                                pressed ? styles.searchClearButtonPressed : null
                                            ]}
                                        >
                                            <Text style={styles.searchClearButtonText}>지우기</Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            </View>
                            <View style={styles.sectionHeader}>
                                <View style={styles.sectionFilterControls}>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`정렬 기준. 현재 ${activeSortOption.label}, ${
                                            sortDirection === 'asc' ? '오름차순' : '내림차순'
                                        }`}
                                        disabled={hasPendingAction || isInitialLoading}
                                        onPress={handleOpenSortModal}
                                        style={({ pressed }) => [
                                            styles.sortTriggerButton,
                                            hasPendingAction || isInitialLoading
                                                ? styles.actionButtonDisabled
                                                : null,
                                            pressed && !hasPendingAction && !isInitialLoading
                                                ? styles.sortTriggerButtonPressed
                                                : null
                                        ]}
                                    >
                                        <Text style={styles.sortTriggerText}>
                                            {activeSortOption.label}
                                        </Text>
                                        <Ionicons
                                            name={activeSortDirectionIcon}
                                            size={18}
                                            color={theme.colors.textPrimary}
                                        />
                                    </Pressable>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`플랜 유형. 현재 ${activePurposeFilterOption.label}`}
                                        disabled={hasPendingAction || isInitialLoading}
                                        onPress={handleOpenPurposeFilterModal}
                                        style={({ pressed }) => [
                                            styles.purposeFilterTriggerButton,
                                            purposeFilter !== 'all' ? styles.purposeFilterTriggerButtonActive : null,
                                            hasPendingAction || isInitialLoading ? styles.actionButtonDisabled : null,
                                            pressed && !hasPendingAction && !isInitialLoading ? styles.sortTriggerButtonPressed : null
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.purposeFilterTriggerText,
                                                purposeFilter !== 'all' ? styles.purposeFilterTriggerTextActive : null
                                            ]}
                                        >
                                            {activePurposeFilterOption.label}
                                        </Text>
                                        <Ionicons
                                            name="chevron-down"
                                            size={15}
                                            color={purposeFilter !== 'all' ? theme.colors.accent : theme.colors.textSecondary}
                                        />
                                    </Pressable>
                                </View>
                                <View style={styles.sectionActions}>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={hasPendingAction || isInitialLoading || isViewModeTransitioning}
                                        accessibilityLabel={`표시 방식 변경. 현재 ${activeViewOption.label}, 다음 ${nextViewOption.label}`}
                                        onPress={handleCycleViewMode}
                                        style={({ pressed }) => [
                                            styles.viewModeToggleButton,
                                            hasPendingAction || isInitialLoading || isViewModeTransitioning
                                                ? styles.actionButtonDisabled
                                                : null,
                                            pressed && !hasPendingAction && !isInitialLoading && !isViewModeTransitioning
                                                ? styles.viewModeToggleButtonPressed
                                                : null
                                        ]}
                                    >
                                        <Ionicons
                                            name={activeViewModeIcon}
                                            size={20}
                                            color={theme.colors.textPrimary}
                                        />
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    )}
                    ListEmptyComponent={(
                        isInitialLoading || isViewModeTransitioning ? null : (
                            <View style={styles.filteredEmptyState}>
                                {trimmedSearchQuery ? (
                                    <EmptyState
                                        title="검색 결과가 없어요."
                                        description={`"${trimmedSearchQuery}"와 일치하는 플랜을 찾지 못했어요.`}
                                        actionLabel="검색 지우기"
                                        onAction={() => {
                                            setSearchQuery('');
                                        }}
                                    />
                                ) : isEmptyFeedState ? (
                                    <EmptyState
                                        title="아직 올라온 플랜이 없어요."
                                        description="새 플랜이 올라오면 여기에 보여드릴게요."
                                        actionLabel="내 일정 보기"
                                        onAction={() => {
                                            navigation.navigate('TripList');
                                        }}
                                    />
                                ) : purposeFilter !== 'all' ? (
                                    <EmptyState
                                        title={`${purposeFilter === 'date' ? '데이트' : '여행'} 플랜이 없어요.`}
                                        description="필터를 바꾸면 다른 플랜을 볼 수 있어요."
                                        actionLabel="전체 보기"
                                        onAction={() => {
                                            setPurposeFilter('all');
                                        }}
                                    />
                                ) : (
                                    <EmptyState
                                        title="검색 결과가 없어요."
                                        description={`"${trimmedSearchQuery}"와 일치하는 플랜을 찾지 못했어요.`}
                                        actionLabel="검색 지우기"
                                        onAction={() => {
                                            setSearchQuery('');
                                        }}
                                    />
                                )}
                            </View>
                        )
                    )}
                    ListFooterComponent={isViewModeTransitioning ? null : (
                        <View style={styles.listFooter}>
                            {isInitialLoading || loadingMore ? (
                                <View style={styles.loadingSpinnerWrap}>
                                    <LoadingView
                                        title={loadingMore ? '플랜 더 불러오는 중' : '플랜 불러오는 중'}
                                        fullscreen={false}
                                    />
                                </View>
                            ) : null}
                            {!isInitialLoading && hasMore ? (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={hasPendingAction || loadingMore}
                                    onPress={() => {
                                        void handleLoadMore();
                                    }}
                                    style={({ pressed }) => [
                                        styles.loadMoreButton,
                                        hasPendingAction || loadingMore ? styles.actionButtonDisabled : null,
                                        pressed && !hasPendingAction && !loadingMore
                                            ? styles.loadMoreButtonPressed
                                            : null
                                    ]}
                                >
                                    <Text style={styles.loadMoreButtonText}>글 더 보기</Text>
                                </Pressable>
                            ) : null}
                        </View>
                    )}
                    renderItem={({ item }) => (
                        'kind' in item ? (
                            <View
                                style={viewMode === 'card' ? styles.loadingCommunityCard : styles.loadingCommunityListRow}
                            >
                                {viewMode === 'card' ? (
                                    <>
                                        <View style={styles.loadingCommunityHero} />
                                        <View style={styles.loadingCommunityOverlay} />
                                        <View style={styles.loadingCommunityCardContent}>
                                            <View style={styles.loadingChipRow}>
                                                <View style={styles.loadingSmallChip} />
                                                <View style={styles.loadingSmallChipMuted} />
                                            </View>
                                            <View style={styles.loadingCommunityTitleBar} />
                                            <View style={styles.loadingCommunityMetaBar} />
                                            <View style={styles.loadingCommunityBodyBar} />
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <View style={styles.loadingCommunityThumb} />
                                        <View style={styles.loadingCommunityListCopy}>
                                            <View style={styles.loadingListTitleBar} />
                                            <View style={styles.loadingListMetaBar} />
                                            <View style={styles.loadingListMetaBarShort} />
                                        </View>
                                    </>
                                )}
                            </View>
                        ) : (
                            <CommunityPostCard
                                post={item}
                                variant={viewMode}
                                disabled={hasPendingAction}
                                onOpenActions={() => {
                                    openActionMenu(item);
                                }}
                                onPress={() => navigation.navigate('CommunityPostDetail', { postId: item.id })}
                            />
                        )
                    )}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => {
                                void handleRefresh();
                            }}
                            tintColor={theme.colors.accent}
                            colors={[theme.colors.accent]}
                        />
                    }
                />
            </SafeAreaView>
            <Modal
                animationType="fade"
                transparent
                visible={Boolean(activeMenuPost)}
                onRequestClose={closeActionMenu}
            >
                <View style={styles.actionModalBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={closeActionMenu}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.actionModalCard}>
                        <View style={styles.actionModalHeader}>
                            <Text style={styles.actionModalEyebrow}>플랜 메뉴</Text>
                            <Text style={styles.actionModalTitle} numberOfLines={2}>
                                {activeMenuPost?.title || '플랜'}
                            </Text>
                            <Text style={styles.actionModalSubtitle} numberOfLines={2}>
                                {activeMenuPost?.subInfo || '이 플랜에서 할 작업을 선택해 주세요.'}
                            </Text>
                        </View>

                        <Pressable
                            accessibilityRole="button"
                            disabled={hasPendingAction || !activeMenuPost}
                            onPress={() => {
                                if (activeMenuPost) {
                                    handleSharePost(activeMenuPost);
                                }
                            }}
                            style={({ pressed }) => [
                                styles.actionMenuButton,
                                pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                            ]}
                        >
                            <View style={styles.actionMenuCopy}>
                                <Text style={styles.actionMenuLabel}>공유</Text>
                                <Text style={styles.actionMenuHint}>이 일정을 링크로 바로 공유할 수 있어요.</Text>
                            </View>
                            <Text style={styles.actionMenuArrow}>›</Text>
                        </Pressable>

                        {isTripCreationEnabled ? (
                            activeMenuIsLockedPlan ? (
                                <>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={hasPendingAction || !activeMenuPost}
                                        onPress={() => {
                                            if (activeMenuPost) {
                                                void handlePurchasePost(activeMenuPost);
                                            }
                                        }}
                                        style={({ pressed }) => [
                                            styles.actionMenuButton,
                                            styles.actionMenuPrimaryButton,
                                            pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                        ]}
                                    >
                                        <View style={styles.actionMenuCopy}>
                                            <Text style={[styles.actionMenuLabel, styles.actionMenuPrimaryLabel]}>
                                                1개월 무료 체험 시작
                                            </Text>
                                            <Text style={styles.actionMenuHint}>
                                                {nativeStoreLabel} 계정으로 시작하고, 플랜을 내 일정으로 가져올 수 있어요.
                                            </Text>
                                        </View>
                                        <Text style={[styles.actionMenuArrow, styles.actionMenuPrimaryLabel]}>›</Text>
                                    </Pressable>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={hasPendingAction || !activeMenuPost}
                                        onPress={() => {
                                            if (activeMenuPost) {
                                                void handleRestorePostPurchase(activeMenuPost);
                                            }
                                        }}
                                        style={({ pressed }) => [
                                            styles.actionMenuButton,
                                            pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                        ]}
                                    >
                                        <View style={styles.actionMenuCopy}>
                                            <Text style={styles.actionMenuLabel}>구독 복원</Text>
                                            <Text style={styles.actionMenuHint}>이미 구독 중이라면 {nativeStoreLabel} 구독 내역을 다시 확인해요.</Text>
                                        </View>
                                        <Text style={styles.actionMenuArrow}>›</Text>
                                    </Pressable>
                                </>
                            ) : (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={hasPendingAction || !activeMenuPost}
                                    onPress={() => {
                                        if (activeMenuPost) {
                                            openDuplicateModal(activeMenuPost);
                                        }
                                    }}
                                    style={({ pressed }) => [
                                        styles.actionMenuButton,
                                        pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                    ]}
                                >
                                    <View style={styles.actionMenuCopy}>
                                        <Text style={styles.actionMenuLabel}>내 일정으로 가져오기</Text>
                                        <Text style={styles.actionMenuHint}>이름과 날짜를 정해 내 일정으로 가져와요.</Text>
                                    </View>
                                    <Text style={styles.actionMenuArrow}>›</Text>
                                </Pressable>
                            )
                        ) : null}

                        {!canDeleteActivePost ? (
                            <>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={hasPendingAction || !activeMenuPost}
                                    onPress={() => {
                                        if (activeMenuPost) {
                                            handleReportPost(activeMenuPost);
                                        }
                                    }}
                                    style={({ pressed }) => [
                                        styles.actionMenuButton,
                                        styles.actionMenuWarnButton,
                                        pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                    ]}
                                >
                                    <View style={styles.actionMenuCopy}>
                                        <Text style={[styles.actionMenuLabel, styles.actionMenuWarnLabel]}>신고</Text>
                                        <Text style={styles.actionMenuHint}>운영 검토가 필요하다고 판단되면 바로 접수해요.</Text>
                                    </View>
                                    <Text style={[styles.actionMenuArrow, styles.actionMenuWarnLabel]}>›</Text>
                                </Pressable>

                                <Pressable
                                    accessibilityRole="button"
                                    disabled={hasPendingAction || !activeMenuPost}
                                    onPress={() => {
                                        if (activeMenuPost) {
                                            handleToggleBlockAuthor(activeMenuPost);
                                        }
                                    }}
                                    style={({ pressed }) => [
                                        styles.actionMenuButton,
                                        styles.actionMenuWarnButton,
                                        pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                    ]}
                                >
                                    <View style={styles.actionMenuCopy}>
                                        <Text style={[styles.actionMenuLabel, styles.actionMenuWarnLabel]}>
                                            {isActivePostBlocked ? '차단 해제' : '작성자 차단'}
                                        </Text>
                                        <Text style={styles.actionMenuHint}>
                                            {isActivePostBlocked
                                                ? '이 작성자의 글과 댓글을 다시 표시해요.'
                                                : '이 작성자의 플랜과 댓글을 숨겨요.'}
                                        </Text>
                                    </View>
                                    <Text style={[styles.actionMenuArrow, styles.actionMenuWarnLabel]}>›</Text>
                                </Pressable>
                            </>
                        ) : null}

                        {canDeleteActivePost ? (
                            <Pressable
                                accessibilityRole="button"
                                disabled={hasPendingAction || !activeMenuPost}
                                onPress={() => {
                                    if (activeMenuPost) {
                                        handleDeletePost(activeMenuPost);
                                    }
                                }}
                                style={({ pressed }) => [
                                    styles.actionMenuButton,
                                    styles.actionMenuDeleteButton,
                                    pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                ]}
                            >
                                    <View style={styles.actionMenuCopy}>
                                        <Text style={[styles.actionMenuLabel, styles.actionMenuDeleteLabel]}>삭제</Text>
                                        <Text style={styles.actionMenuHint}>작성한 플랜만 삭제할 수 있어요.</Text>
                                    </View>
                                <Text style={[styles.actionMenuArrow, styles.actionMenuDeleteLabel]}>›</Text>
                            </Pressable>
                        ) : null}

                        <Pressable
                            accessibilityRole="button"
                            disabled={hasPendingAction}
                            onPress={closeActionMenu}
                            style={({ pressed }) => [
                                styles.actionModalCancelButton,
                                pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                            ]}
                        >
                            <Text style={styles.actionModalCancelText}>닫기</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
            <Modal
                animationType="fade"
                transparent
                visible={isPurposeFilterModalVisible}
                onRequestClose={closePurposeFilterModal}
            >
                <View style={styles.sortSheetBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={closePurposeFilterModal}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.sortSheetCard}>
                        <View style={styles.sortSheetHandle} />
                        <View style={styles.sortSheetHeader}>
                            <Text style={styles.sortSheetTitle}>플랜 유형</Text>
                            <Text style={styles.sortSheetSubtitle}>
                                여행과 데이트 플랜을 필요한 흐름에 맞춰 골라보세요.
                            </Text>
                        </View>
                        {PLAN_PURPOSE_FILTER_OPTIONS.map((option) => {
                            const isActive = option.key === purposeFilter;

                            return (
                                <Pressable
                                    key={option.key}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isActive }}
                                    onPress={() => {
                                        handleSelectPurposeFilter(option.key);
                                    }}
                                    style={({ pressed }) => [
                                        styles.sortSheetOptionButton,
                                        isActive ? styles.sortSheetOptionButtonActive : null,
                                        pressed ? styles.actionMenuButtonPressed : null
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.sortSheetOptionLabel,
                                            isActive ? styles.sortSheetOptionLabelActive : null
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                    {isActive ? (
                                        <View style={styles.sortSheetOptionState}>
                                            <Ionicons
                                                name="checkmark"
                                                size={16}
                                                color={theme.colors.accent}
                                            />
                                            <Text style={styles.sortSheetOptionStateText}>
                                                선택됨
                                            </Text>
                                        </View>
                                    ) : null}
                                </Pressable>
                            );
                        })}

                        <Pressable
                            accessibilityRole="button"
                            onPress={closePurposeFilterModal}
                            style={({ pressed }) => [
                                styles.sortSheetCloseButton,
                                pressed ? styles.actionMenuButtonPressed : null
                            ]}
                        >
                            <Text style={styles.sortSheetCloseText}>닫기</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
            <Modal
                animationType="fade"
                transparent
                visible={isSortModalVisible}
                onRequestClose={closeSortModal}
            >
                <View style={styles.sortSheetBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={closeSortModal}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.sortSheetCard}>
                        <View style={styles.sortSheetHandle} />
                        <View style={styles.sortSheetHeader}>
                            <Text style={styles.sortSheetTitle}>정렬 기준</Text>
                            <Text style={styles.sortSheetSubtitle}>
                                같은 기준을 다시 누르면 오름차순과 내림차순이 바뀌어요.
                            </Text>
                        </View>
                        {SORT_OPTIONS.map((option) => {
                            const isActive = option.key === sortKey;
                            const directionLabel = sortDirection === 'asc' ? '오름차순' : '내림차순';
                            const directionIcon: keyof typeof Ionicons.glyphMap =
                                sortDirection === 'asc' ? 'arrow-up' : 'arrow-down';

                            return (
                                <Pressable
                                    key={option.key}
                                    accessibilityRole="button"
                                    onPress={() => {
                                        handleSelectSortOption(option.key);
                                    }}
                                    style={({ pressed }) => [
                                        styles.sortSheetOptionButton,
                                        isActive ? styles.sortSheetOptionButtonActive : null,
                                        pressed ? styles.actionMenuButtonPressed : null
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.sortSheetOptionLabel,
                                            isActive ? styles.sortSheetOptionLabelActive : null
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                    {isActive ? (
                                        <View style={styles.sortSheetOptionState}>
                                            <Ionicons
                                                name={directionIcon}
                                                size={16}
                                                color={theme.colors.accent}
                                            />
                                            <Text style={styles.sortSheetOptionStateText}>
                                                {directionLabel}
                                            </Text>
                                        </View>
                                    ) : null}
                                </Pressable>
                            );
                        })}

                        <Pressable
                            accessibilityRole="button"
                            onPress={closeSortModal}
                            style={({ pressed }) => [
                                styles.sortSheetCloseButton,
                                pressed ? styles.actionMenuButtonPressed : null
                            ]}
                        >
                            <Text style={styles.sortSheetCloseText}>닫기</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
            <Modal
                animationType="fade"
                transparent
                visible={Boolean(duplicateDraft)}
                onRequestClose={closeDuplicateModal}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.actionModalBackdrop}
                >
                    <Pressable
                        accessibilityRole="button"
                        onPress={closeDuplicateModal}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.actionModalCard, styles.duplicateModalCard]}>
                        <ScrollView
                            ref={duplicateScrollRef}
                            style={styles.duplicateModalScroll}
                            contentContainerStyle={[
                                styles.duplicateModalScrollContent,
                                duplicateKeyboardAwareContentInsetStyle
                            ]}
                            {...duplicateScrollViewProps}
                            showsVerticalScrollIndicator={false}
                        >
                        <View style={styles.actionModalHeader}>
                            <Text style={styles.actionModalEyebrow}>가져오기 설정</Text>
                            <Text style={styles.actionModalTitle} numberOfLines={2}>
                                {duplicateDraft?.post.title || '플랜'}
                            </Text>
                            <Text style={styles.actionModalSubtitle}>
                                일정 이름과 날짜를 정한 뒤 내 일정으로 가져올 수 있어요.
                            </Text>
                        </View>

                        <View style={styles.duplicateFieldGroup}>
                            <Text style={styles.duplicateFieldLabel}>일정 이름</Text>
                            <TextInput
                                value={duplicateDraft?.title || ''}
                                onChangeText={(nextTitle) => {
                                    setDuplicateDraft((currentDraft) => currentDraft ? {
                                        ...currentDraft,
                                        title: truncateTripTitle(nextTitle),
                                        error: null
                                    } : currentDraft);
                                }}
                                editable={!hasPendingAction}
                                placeholder="새 일정 이름"
                                placeholderTextColor={theme.colors.textSecondary}
                                onFocus={createDuplicateFocusHandler()}
                                style={styles.duplicateTextInput}
                            />
                        </View>

                        <View style={styles.duplicateFieldGroup}>
                            <View style={styles.duplicateFieldHeaderRow}>
                                <Text style={styles.duplicateFieldLabel}>일정 날짜</Text>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={hasPendingAction}
                                    onPress={handleOpenDuplicateDatePicker}
                                    style={({ pressed }) => [
                                        styles.duplicateDateAction,
                                        pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                    ]}
                                >
                                    <Text style={styles.duplicateDateActionText}>날짜 다시 고르기</Text>
                                </Pressable>
                            </View>
                            <View style={styles.duplicateDateRow}>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={hasPendingAction}
                                    onPress={handleOpenDuplicateDatePicker}
                                    style={({ pressed }) => [
                                        styles.duplicateDateCard,
                                        pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                    ]}
                                >
                                    <Text style={styles.duplicateDateLabel}>시작일</Text>
                                    <Text style={styles.duplicateDateValue}>
                                        {formatCalendarDisplayDate(duplicateDraft?.startDate || '')}
                                    </Text>
                                </Pressable>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={hasPendingAction}
                                    onPress={handleOpenDuplicateDatePicker}
                                    style={({ pressed }) => [
                                        styles.duplicateDateCard,
                                        pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                    ]}
                                >
                                    <Text style={styles.duplicateDateLabel}>종료일</Text>
                                    <Text style={styles.duplicateDateValue}>
                                        {formatCalendarDisplayDate(duplicateDraft?.endDate || '')}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>

                        {duplicateRangeNotice ? (
                            <View
                                style={[
                                    styles.duplicateRangeNotice,
                                    duplicateRangeNotice.tone === 'warning'
                                        ? styles.duplicateRangeNoticeWarning
                                        : styles.duplicateRangeNoticeInfo
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.duplicateRangeNoticeText,
                                        duplicateRangeNotice.tone === 'warning'
                                            ? styles.duplicateRangeNoticeTextWarning
                                            : null
                                    ]}
                                >
                                    {duplicateRangeNotice.text}
                                </Text>
                            </View>
                        ) : null}

                        {duplicateDraft?.error ? (
                            <View style={styles.duplicateErrorBanner}>
                                <Text style={styles.duplicateErrorText}>{duplicateDraft.error}</Text>
                            </View>
                        ) : null}

                        <View style={styles.duplicateFooterActions}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={hasPendingAction}
                                onPress={closeDuplicateModal}
                                style={({ pressed }) => [
                                    styles.duplicateSecondaryButton,
                                    pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null
                                ]}
                            >
                                <Text style={styles.duplicateSecondaryButtonText}>취소</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                disabled={hasPendingAction}
                                onPress={handleDuplicatePost}
                                style={({ pressed }) => [
                                    styles.duplicatePrimaryButton,
                                    pressed && !hasPendingAction ? styles.actionMenuButtonPressed : null,
                                    hasPendingAction ? styles.duplicatePrimaryButtonDisabled : null
                                ]}
                            >
                                <Text style={styles.duplicatePrimaryButtonText}>
                                    {hasPendingAction ? '가져오는 중...' : '내 일정에 담기'}
                                </Text>
                            </Pressable>
                        </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            <DateCalendarModal
                visible={Boolean(duplicateDraft) && isDuplicateDatePickerVisible}
                title="가져올 날짜 선택"
                startDate={duplicateDraft?.startDate || ''}
                endDate={duplicateDraft?.endDate || ''}
                helperNotice={duplicateRangeNotice}
                onClose={handleCloseDuplicateDatePicker}
                onDraftRangeChange={handleDuplicateDraftRangeChange}
                onSelectRange={handleSelectDuplicateDateRange}
            />
            <Modal
                animationType="slide"
                transparent
                visible={isPublishHubVisible}
                onRequestClose={closePublishHub}
            >
                <View style={styles.publishSheetOverlay}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={closePublishHub}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.publishSheet, publishSheetInsetStyle]}>
                        <View style={styles.publishSheetHandle} />
                        <View style={styles.publishSheetHeader}>
                            <Text style={styles.publishSheetEyebrow}>플랜 공개</Text>
                            <Text style={styles.publishSheetTitle}>등록할 일정 선택</Text>
                            <Text style={styles.publishSheetSubtitle}>
                                공개할 일정을 선택해 주세요. 상세 메모, 지출, 사진 같은 개인 정보는 제외돼요.
                            </Text>
                        </View>

                        {isPublishHubLoading ? (
                            <View style={styles.publishSheetLoadingWrap}>
                                <LoadingView title="공개 가능한 일정 불러오는 중" fullscreen={false} />
                            </View>
                        ) : publishHubError ? (
                            <View style={styles.publishSheetStateBlock}>
                                <View style={[styles.bannerCard, styles.bannerCardWarning]}>
                                    <Text style={[styles.bannerText, styles.bannerTextWarning]}>{publishHubError}</Text>
                                </View>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => {
                                        void loadPublishableTrips();
                                    }}
                                    style={({ pressed }) => [
                                        styles.publishSheetPrimaryButton,
                                        pressed ? styles.actionMenuButtonPressed : null
                                    ]}
                                >
                                    <Text style={styles.publishSheetPrimaryButtonText}>다시 불러오기</Text>
                                </Pressable>
                            </View>
                        ) : publishableTrips.length === 0 ? (
                            <View style={styles.publishSheetStateBlock}>
                                <EmptyState
                                    title="공개할 일정이 아직 없어요."
                                    description="공개할 수 있는 일정을 먼저 준비해 주세요."
                                    actionLabel="내 일정 보기"
                                    onAction={() => {
                                        setPublishHubVisible(false);
                                        navigation.navigate('TripList');
                                    }}
                                />
                            </View>
                        ) : (
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={styles.publishTripList}
                            >
                                {publishableTrips.map((trip) => (
                                    <Pressable
                                        key={trip.id}
                                        accessibilityRole="button"
                                        onPress={() => {
                                            handleSelectPublishTrip(trip);
                                        }}
                                        style={({ pressed }) => [
                                            styles.publishTripRow,
                                            pressed ? styles.actionMenuButtonPressed : null
                                        ]}
                                    >
                                        <View style={styles.publishTripBadge}>
                                            <Text style={styles.publishTripBadgeText}>{trip.dayCount}</Text>
                                        </View>
                                        <View style={styles.publishTripCopy}>
                                            <Text style={styles.publishTripTitleText} numberOfLines={1}>
                                                {trip.title}
                                            </Text>
                                            <Text style={styles.publishTripMetaText} numberOfLines={1}>
                                                {buildPublishableTripMeta(trip)}
                                            </Text>
                                            <Text style={styles.publishTripSubInfoText} numberOfLines={1}>
                                                {trip.subInfo || '일정 정보를 확인해 공개할 수 있어요.'}
                                            </Text>
                                        </View>
                                        <Text style={styles.publishTripActionText}>등록</Text>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        )}

                        <Pressable
                            accessibilityRole="button"
                            disabled={isPublishHubLoading}
                            onPress={closePublishHub}
                            style={({ pressed }) => [
                                styles.publishSheetSecondaryButton,
                                pressed && !isPublishHubLoading ? styles.actionMenuButtonPressed : null
                            ]}
                        >
                            <Text style={styles.publishSheetSecondaryButtonText}>닫기</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
            {hasAnyTrips ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="플랜 공개"
                    disabled={isPublishHubLoading}
                    onPress={handleOpenPublishHub}
                    style={({ pressed }) => [
                        styles.composeFab,
                        fabInsetStyle,
                        isPublishHubLoading ? styles.composeFabDisabled : null,
                        pressed && !isPublishHubLoading ? styles.composeFabPressed : null
                    ]}
                >
                    <Text style={styles.composeFabText}>공개</Text>
                </Pressable>
            ) : null}
            <BottomNavBar activeTab="Community" />
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    shell: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    screenBody: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    list: {
        flex: 1
    },
    container: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    listContent: {
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.lg
    },
    loadingContent: {
        flex: 1
    },
    loadingSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: theme.spacing.xs
    },
    loadingSectionCopy: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    loadingTitleBar: {
        width: 92,
        height: 18,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingSubtitleBar: {
        width: 118,
        height: 12,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted,
        marginTop: theme.spacing.micro
    },
    loadingSectionActions: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    loadingActionPill: {
        width: 56,
        height: 30,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted,
        marginRight: theme.spacing.micro
    },
    loadingCountPill: {
        width: 50,
        height: 30,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingSearchBar: {
        height: 48,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        marginBottom: theme.spacing.md
    },
    loadingCommunityCard: {
        height: 208,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.sm
    },
    loadingCommunityHero: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingCommunityOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.mode === 'dark' ? 'rgba(10, 10, 10, 0.34)' : 'rgba(18, 18, 18, 0.2)'
    },
    loadingCommunityCardContent: {
        flex: 1,
        justifyContent: 'flex-end',
        padding: theme.spacing.sm
    },
    loadingChipRow: {
        flexDirection: 'row',
        marginBottom: theme.spacing.xs
    },
    loadingSmallChip: {
        width: 62,
        height: 24,
        borderRadius: theme.radius.full,
        backgroundColor: 'rgba(255,255,255,0.72)',
        marginRight: theme.spacing.micro
    },
    loadingSmallChipMuted: {
        width: 72,
        height: 24,
        borderRadius: theme.radius.full,
        backgroundColor: 'rgba(255,255,255,0.42)'
    },
    loadingCommunityTitleBar: {
        width: '70%',
        height: 24,
        borderRadius: theme.radius.full,
        backgroundColor: 'rgba(255,255,255,0.88)'
    },
    loadingCommunityMetaBar: {
        width: '52%',
        height: 14,
        borderRadius: theme.radius.full,
        backgroundColor: 'rgba(255,255,255,0.62)',
        marginTop: theme.spacing.xs
    },
    loadingCommunityBodyBar: {
        width: '78%',
        height: 14,
        borderRadius: theme.radius.full,
        backgroundColor: 'rgba(255,255,255,0.52)',
        marginTop: theme.spacing.micro
    },
    loadingCommunityListRow: {
        minHeight: 120,
        paddingVertical: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'stretch',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border
    },
    loadingCommunityThumb: {
        width: 88,
        height: 88,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingCommunityListCopy: {
        flex: 1,
        justifyContent: 'space-between',
        marginLeft: theme.spacing.sm,
        paddingVertical: theme.spacing.micro
    },
    loadingListTitleBar: {
        width: '74%',
        height: 18,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingListMetaBar: {
        width: '58%',
        height: 12,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted,
        marginTop: theme.spacing.xs
    },
    loadingListMetaBarShort: {
        width: '38%',
        height: 12,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted,
        marginTop: theme.spacing.micro
    },
    loadingSpinnerWrap: {
        paddingTop: theme.spacing.xs
    },
    listHeader: {
        paddingTop: theme.spacing.md
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: theme.spacing.sm,
        gap: theme.spacing.xs
    },
    searchBar: {
        minHeight: 48,
        flex: 1,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    searchIcon: {
        color: theme.colors.textSecondary,
        fontSize: 16,
        fontFamily: theme.fonts.semibold
    },
    searchInput: {
        flex: 1,
        minWidth: 0,
        paddingVertical: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.body
    },
    searchClearButton: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    searchClearButtonPressed: {
        opacity: 0.82
    },
    searchClearButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    bannerCard: {
        marginBottom: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md
    },
    bannerCardInfo: {
        backgroundColor: theme.colors.surfaceMuted
    },
    bannerCardWarning: {
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    bannerText: {
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    bannerTextWarning: {
        color: theme.colors.warning
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.sm
    },
    sectionFilterControls: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: theme.spacing.xs
    },
    sectionHeaderCopy: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    sectionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontFamily: theme.fonts.bold
    },
    sectionSubtitle: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    sectionActions: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    sortTriggerButton: {
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    sortTriggerButtonPressed: {
        opacity: 0.82
    },
    sortTriggerText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.semibold
    },
    purposeFilterTriggerButton: {
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.micro,
        paddingHorizontal: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    purposeFilterTriggerButtonActive: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    purposeFilterTriggerText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.semibold
    },
    purposeFilterTriggerTextActive: {
        color: theme.colors.accent
    },
    actionButtonDisabled: {
        opacity: 0.55
    },
    viewModeToggleButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    viewModeToggleButtonPressed: {
        opacity: 0.88
    },
    sectionCountPill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    sectionCountText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    stateContent: {
        flex: 1,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.md
    },
    listFooter: {
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.sm
    },
    loadMoreButton: {
        marginBottom: theme.spacing.sm,
        alignSelf: 'center',
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadMoreButtonPressed: {
        opacity: 0.88
    },
    loadMoreButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    filteredEmptyState: {
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.lg
    },
    publishSheetOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(15, 17, 18, 0.38)'
    },
    publishSheet: {
        borderTopLeftRadius: theme.radius.lg,
        borderTopRightRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm
    },
    publishSheetHandle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: theme.radius.xs,
        backgroundColor: theme.colors.border,
        marginBottom: theme.spacing.sm
    },
    publishSheetHeader: {
        marginBottom: theme.spacing.sm
    },
    publishSheetEyebrow: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    publishSheetTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 24,
        lineHeight: 30,
        fontFamily: theme.fonts.bold
    },
    publishSheetSubtitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    publishSheetLoadingWrap: {
        paddingVertical: theme.spacing.md
    },
    publishSheetStateBlock: {
        paddingVertical: theme.spacing.sm
    },
    publishTripList: {
        paddingBottom: theme.spacing.sm
    },
    publishTripRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border
    },
    publishTripBadge: {
        minWidth: 56,
        minHeight: 56,
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    publishTripBadgeText: {
        color: theme.colors.textPrimary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    publishTripCopy: {
        flex: 1,
        minWidth: 0,
        paddingHorizontal: theme.spacing.sm
    },
    publishTripTitleText: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    publishTripMetaText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    publishTripSubInfoText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    publishTripActionText: {
        color: theme.colors.accent,
        fontSize: 13,
        fontFamily: theme.fonts.bold
    },
    publishSheetPrimaryButton: {
        minHeight: 48,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent
    },
    publishSheetPrimaryButtonText: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#ffffff',
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
    publishSheetSecondaryButton: {
        minHeight: 48,
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.xs,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    publishSheetSecondaryButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    composeFab: {
        position: 'absolute',
        minHeight: 56,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent,
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 5
    },
    composeFabDisabled: {
        opacity: 0.72
    },
    composeFabPressed: {
        opacity: 0.9
    },
    composeFabText: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#ffffff',
        fontSize: 16,
        fontFamily: theme.fonts.bold
    },
    sortSheetBackdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(15, 17, 18, 0.28)'
    },
    sortSheetCard: {
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.md
    },
    sortSheetHandle: {
        alignSelf: 'center',
        width: 48,
        height: 4,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    sortSheetHeader: {
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.sm
    },
    sortSheetTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontFamily: theme.fonts.bold
    },
    sortSheetSubtitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    sortSheetOptionButton: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        marginBottom: theme.spacing.xs
    },
    sortSheetOptionButtonActive: {
        backgroundColor: theme.colors.accentSoft
    },
    sortSheetOptionLabel: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontFamily: theme.fonts.semibold
    },
    sortSheetOptionLabelActive: {
        color: theme.colors.accent
    },
    sortSheetOptionState: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    sortSheetOptionStateText: {
        color: theme.colors.accent,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    sortSheetCloseButton: {
        marginTop: theme.spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md
    },
    sortSheetCloseText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    actionModalBackdrop: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.md,
        backgroundColor: 'rgba(15, 17, 18, 0.38)'
    },
    actionModalCard: {
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.sm,
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 5
    },
    duplicateModalCard: {
        maxHeight: '86%'
    },
    duplicateModalScroll: {
        maxHeight: '100%'
    },
    duplicateModalScrollContent: {
        flexGrow: 1
    },
    actionModalHeader: {
        marginBottom: theme.spacing.sm
    },
    actionModalEyebrow: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    actionModalTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 20,
        lineHeight: 26,
        fontFamily: theme.fonts.bold
    },
    actionModalSubtitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    preferenceSection: {
        marginBottom: theme.spacing.sm
    },
    preferenceSectionTitle: {
        marginBottom: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    preferenceChipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap'
    },
    preferenceChip: {
        marginRight: theme.spacing.micro,
        marginBottom: theme.spacing.micro,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    preferenceChipActive: {
        backgroundColor: theme.colors.accentSoft
    },
    preferenceChipText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    preferenceChipTextActive: {
        color: theme.colors.accent
    },
    viewModeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        marginBottom: theme.spacing.xs
    },
    viewModeButtonActive: {
        backgroundColor: theme.colors.accentSoft
    },
    viewModeCopy: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    viewModeLabel: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    viewModeLabelActive: {
        color: theme.colors.accent
    },
    viewModeHint: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        lineHeight: 19,
        fontFamily: theme.fonts.body
    },
    viewModeHintActive: {
        color: theme.colors.accent
    },
    viewModeState: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    viewModeStateActive: {
        color: theme.colors.accent
    },
    actionMenuButtonPressed: {
        opacity: 0.88
    },
    actionModalCancelButton: {
        marginTop: theme.spacing.micro,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md
    },
    actionModalCancelText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    actionMenuButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        marginBottom: theme.spacing.xs
    },
    actionMenuPrimaryButton: {
        backgroundColor: theme.colors.accentSoft
    },
    actionMenuDeleteButton: {
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    actionMenuWarnButton: {
        backgroundColor: theme.mode === 'dark' ? '#2b251d' : '#fff8ef'
    },
    actionMenuCopy: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    actionMenuLabel: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    actionMenuHint: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        lineHeight: 19,
        fontFamily: theme.fonts.body
    },
    actionMenuDeleteLabel: {
        color: theme.colors.warning
    },
    actionMenuWarnLabel: {
        color: theme.colors.warning
    },
    actionMenuPrimaryLabel: {
        color: theme.colors.accent
    },
    actionMenuArrow: {
        color: theme.colors.textSecondary,
        fontSize: 24,
        lineHeight: 24,
        fontFamily: theme.fonts.body
    },
    duplicateFieldGroup: {
        marginBottom: theme.spacing.sm
    },
    duplicateFieldHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.xs
    },
    duplicateFieldLabel: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold,
        marginBottom: theme.spacing.xs
    },
    duplicateTextInput: {
        minHeight: 50,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    duplicateDateAction: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    duplicateDateActionText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    duplicateDateRow: {
        flexDirection: 'row',
        marginHorizontal: -theme.spacing.xs
    },
    duplicateDateCard: {
        flex: 1,
        marginHorizontal: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    duplicateDateLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    duplicateDateValue: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    duplicateRangeNotice: {
        marginBottom: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md
    },
    duplicateRangeNoticeInfo: {
        backgroundColor: theme.colors.surfaceMuted
    },
    duplicateRangeNoticeWarning: {
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    duplicateRangeNoticeText: {
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    duplicateRangeNoticeTextWarning: {
        color: theme.colors.warning
    },
    duplicateErrorBanner: {
        marginBottom: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    duplicateErrorText: {
        color: theme.colors.warning,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    duplicateFooterActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: -theme.spacing.xs
    },
    duplicateSecondaryButton: {
        flex: 1,
        marginHorizontal: theme.spacing.xs,
        minHeight: 48,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    duplicateSecondaryButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    duplicatePrimaryButton: {
        flex: 1,
        marginHorizontal: theme.spacing.xs,
        minHeight: 48,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent
    },
    duplicatePrimaryButtonDisabled: {
        opacity: 0.64
    },
    duplicatePrimaryButtonText: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#ffffff',
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
});
