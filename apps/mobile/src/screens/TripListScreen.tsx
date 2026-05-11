import React from 'react';
import {
    Animated,
    Easing,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdapters } from '@/adapters/useAdapters';
import { AvatarImage } from '@/components/AvatarImage';
import { BottomNavBar } from '@/components/BottomNavBar';
import { EmptyState } from '@/components/EmptyState';
import { Alert } from '@/feedback';
import {
    isTripCreationEnabled,
    TRIP_CREATION_DISABLED_MESSAGE,
    TRIP_CREATION_DISABLED_TITLE
} from '@/features/trip-creation';
import { LoadingView } from '@/components/LoadingView';
import { TripCard } from '@/components/TripCard';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import { useTripList } from '@/hooks/useTripList';
import type { RootStackParamList, RootTabKey } from '@/navigation/RootNavigator';
import {
    type PickedProfilePhotoAsset,
    pickProfilePhotoAsset,
    uploadProfilePhotoAsset
} from '@/services/profile-photo-upload';
import { cancelTripReminders } from '@/services/trip-reminders';
import { readTripListViewMode, writeTripListViewMode } from '@/services/list-view-preferences';
import { fetchTripListBanner, type MobileTripListBanner } from '@/services/trip-list-banner';
import {
    type TripShareLinkRole,
    type TripShareMember,
    type TripShareMode,
    type TripShareResponse
} from '@/services/trip-share';
import { useConnectivityStatus } from '@/state/connectivity-store';
import { usePrimaryScrollActivityReporter } from '@/state/primary-scroll-activity';
import { publishTripCreated, publishTripDeleted } from '@/state/trip-write-sync';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTripSummary } from '@/types/trip';

type Props = NativeStackScreenProps<RootStackParamList, 'Home' | 'TripList'>;
type TripSortKey = 'updatedAt' | 'createdAt' | 'startDate' | 'title';
type TripSortDirection = 'asc' | 'desc';
type TripViewMode = 'card' | 'feed';
type LoadingTripRow = {
    kind: 'loading';
    id: string;
};
type OwnerTransferDeleteState = {
    trip: MobileTripSummary;
    candidates: TripShareMember[];
    selectedUid: string;
    error: string | null;
    submitting: boolean;
};

const OFFLINE_SHARE_DISABLED_MESSAGE = '오프라인에서는 공유와 멤버 관리를 할 수 없어요.';
const OFFLINE_ANNOUNCEMENT_DISABLED_MESSAGE = '오프라인에서는 참가자 공지를 보낼 수 없어요.';
const VIEW_MODE_SWITCH_BLANK_MS = 200;
const PROFILE_NAME_MAX_LENGTH = 24;
const SHOW_EMPTY_HOME_QUICK_ACTIONS = false;
const NOTICES_URL = 'https://plin.ink/?tab=notices&desktop=1';
const EMPTY_HOME_HERO_IMAGE_URL = 'https://plin-db93d.web.app/images/trip-destinations/hyeopjae.jpg?v=2026-04-20';
const EMPTY_HOME_POSTCARD_IMAGE_URLS = [
    'https://plin-db93d.web.app/images/trip-destinations/paris.jpg?v=2026-04-20',
    'https://plin-db93d.web.app/images/trip-destinations/okinawa.jpg?v=2026-04-20',
    'https://plin-db93d.web.app/images/trip-destinations/barcelona.jpg?v=2026-04-20'
];
const EMPTY_HOME_TRANSPORT_ICONS: Array<{
    icon: keyof typeof Ionicons.glyphMap;
}> = [
    { icon: 'airplane' },
    { icon: 'car' },
    { icon: 'train' },
    { icon: 'footsteps' }
];

function getTripShareService() {
    return require('../services/trip-share') as typeof import('../services/trip-share');
}

function getTripAnnouncementService() {
    return require('../services/trip-announcements') as typeof import('../services/trip-announcements');
}

function getTripShareSheetComponent() {
    return require('../components/TripShareSheet').TripShareSheet as typeof import('../components/TripShareSheet').TripShareSheet;
}

function getTripAnnouncementSheetComponent() {
    return require('../components/TripAnnouncementSheet').TripAnnouncementSheet as typeof import('../components/TripAnnouncementSheet').TripAnnouncementSheet;
}

function parseDateOnly(value: string) {
    const safeValue = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
        return null;
    }

    const parsed = new Date(`${safeValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

function compareByTitle(left: string, right: string) {
    return left.localeCompare(right, 'ko');
}

function compareByDateAscending(left: string, right: string) {
    const leftDate = parseDateOnly(left);
    const rightDate = parseDateOnly(right);

    if (!leftDate && !rightDate) {
        return 0;
    }

    if (!leftDate) {
        return 1;
    }

    if (!rightDate) {
        return -1;
    }

    return leftDate.getTime() - rightDate.getTime();
}

function compareByDateDescending(left: string, right: string) {
    return compareByDateAscending(right, left);
}

function compareByDateTimeAscending(left: string | undefined, right: string | undefined) {
    const leftTime = Date.parse(String(left || '').trim());
    const rightTime = Date.parse(String(right || '').trim());
    const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;

    return safeLeftTime - safeRightTime;
}

function resolveTripTimestamp(
    trip: Pick<MobileTripSummary, 'updatedAt' | 'createdAt' | 'startDate'>,
    key: 'updatedAt' | 'createdAt'
) {
    return key === 'updatedAt'
        ? trip.updatedAt || trip.createdAt || trip.startDate
        : trip.createdAt || trip.updatedAt || trip.startDate;
}

const SORT_OPTIONS: Array<{ key: TripSortKey; label: string; defaultDirection: TripSortDirection }> = [
    { key: 'updatedAt', label: '최근 수정', defaultDirection: 'desc' },
    { key: 'createdAt', label: '생성일', defaultDirection: 'desc' },
    { key: 'startDate', label: '출발일', defaultDirection: 'asc' },
    { key: 'title', label: '이름', defaultDirection: 'asc' }
];

const VIEW_OPTIONS: Array<{ key: TripViewMode; label: string; hint: string }> = [
    { key: 'card', label: '카드형', hint: '사진과 분위기를 함께 살펴봐요.' },
    { key: 'feed', label: '피드형', hint: '썸네일과 핵심 정보를 세로로 빠르게 훑어봐요.' }
];

const VIEW_MODE_ICONS: Record<TripViewMode, keyof typeof Ionicons.glyphMap> = {
    card: 'grid-outline',
    feed: 'newspaper-outline'
};

const TRIP_LOADING_PLACEHOLDERS = [0, 1, 2];

async function readTripListBannerSafely() {
    try {
        return await fetchTripListBanner();
    } catch (error) {
        console.warn('Failed to load trip list banner config', error);
        return null;
    }
}

function sortTrips(
    items: ReturnType<typeof useTripList>['items'],
    sortKey: TripSortKey,
    sortDirection: TripSortDirection
) {
    const nextItems = [...items];
    const resolveDirection = (value: number) => (
        sortDirection === 'asc' ? value : value * -1
    );

    switch (sortKey) {
    case 'updatedAt':
        nextItems.sort((left, right) => {
            const dateDiff = compareByDateTimeAscending(
                resolveTripTimestamp(left, 'updatedAt'),
                resolveTripTimestamp(right, 'updatedAt')
            );
            if (dateDiff !== 0) {
                return resolveDirection(dateDiff);
            }

            return resolveDirection(compareByTitle(left.title, right.title));
        });
        return nextItems;
    case 'createdAt':
        nextItems.sort((left, right) => {
            const dateDiff = compareByDateTimeAscending(
                resolveTripTimestamp(left, 'createdAt'),
                resolveTripTimestamp(right, 'createdAt')
            );
            if (dateDiff !== 0) {
                return resolveDirection(dateDiff);
            }

            return resolveDirection(compareByTitle(left.title, right.title));
        });
        return nextItems;
    case 'startDate':
        nextItems.sort((left, right) => {
            const dateDiff = compareByDateAscending(left.startDate, right.startDate);
            if (dateDiff !== 0) {
                return resolveDirection(dateDiff);
            }

            return resolveDirection(compareByTitle(left.title, right.title));
        });
        return nextItems;
    case 'title':
        nextItems.sort((left, right) => resolveDirection(compareByTitle(left.title, right.title)));
        return nextItems;
    default:
        return nextItems;
    }
}

function matchesTripSearch(trip: MobileTripSummary, query: string) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) {
        return true;
    }

    return [
        trip.title,
        trip.subInfo,
        trip.dayCount,
        trip.startDate,
        trip.endDate
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
}

function getDateOnlyTime(value = new Date()) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

function resolveTripDateRange(trip: Pick<MobileTripSummary, 'startDate' | 'endDate'>) {
    const start = parseDateOnly(trip.startDate);
    if (!start) {
        return null;
    }

    const parsedEnd = parseDateOnly(trip.endDate);
    const end = parsedEnd && parsedEnd.getTime() >= start.getTime()
        ? parsedEnd
        : start;

    return { start, end };
}

function isTripInProgressToday(trip: MobileTripSummary) {
    if (trip.status === 'completed') {
        return false;
    }

    const range = resolveTripDateRange(trip);
    if (!range) {
        return false;
    }

    const today = getDateOnlyTime();
    return range.start.getTime() <= today && today <= range.end.getTime();
}

function compareInProgressTrips(left: MobileTripSummary, right: MobileTripSummary) {
    const leftRange = resolveTripDateRange(left);
    const rightRange = resolveTripDateRange(right);
    const leftStart = leftRange?.start.getTime() ?? 0;
    const rightStart = rightRange?.start.getTime() ?? 0;

    if (leftStart !== rightStart) {
        return rightStart - leftStart;
    }

    const leftEnd = leftRange?.end.getTime() ?? 0;
    const rightEnd = rightRange?.end.getTime() ?? 0;
    if (leftEnd !== rightEnd) {
        return leftEnd - rightEnd;
    }

    return compareByTitle(left.title, right.title);
}

function findInProgressTrip(items: MobileTripSummary[]) {
    return items
        .filter(isTripInProgressToday)
        .sort(compareInProgressTrips)[0] || null;
}

function buildFallbackProfileSummary(user: ReturnType<typeof useAuthSession>['user']) {
    if (!user) {
        return null;
    }

    return {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL || null,
        role: 'user' as const,
        emailVerificationExempt: false,
        agreedToTerms: null,
        agreedToPrivacy: null,
        agreedAt: null,
        accountStatus: 'active' as const,
        deletionRequestedAt: null,
        purgeAfter: null,
        blockedUserIds: [],
        source: 'auth' as const
    };
}

function getProfilePrimaryLabel(summary: { displayName: string | null; email: string | null }) {
    const displayName = summary.displayName?.trim() || '';
    if (displayName) {
        return displayName;
    }

    const email = summary.email?.trim() || '';
    if (email.includes('@')) {
        return email.split('@')[0];
    }

    return email || 'PLIN 여행자';
}

function getEditableProfileName(summary: { displayName: string | null; email: string | null }) {
    const displayName = summary.displayName?.trim() || '';
    if (displayName) {
        return displayName;
    }

    return getProfilePrimaryLabel(summary);
}

export function TripListScreen({ navigation, route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const {
        scrollRef: profileEditorScrollRef,
        createFocusHandler: createProfileEditorFocusHandler,
        keyboardAwareContentInsetStyle: profileEditorKeyboardInsetStyle,
        scrollViewProps: profileEditorScrollViewProps
    } = useKeyboardAwareInputScroll(112);
    const { tripRepository } = useAdapters();
    const { isOfflineMode } = useConnectivityStatus();
    const {
        user,
        profileSummary,
        retryBootstrap,
        refreshSession,
        isAuthActionLoading,
        updateProfilePhoto,
        updateProfileDisplayName,
        authActionError
    } = useAuthSession();
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
    } =
        useTripList(user?.uid ?? null);
    const [sortKey, setSortKey] = React.useState<TripSortKey>('updatedAt');
    const [sortDirection, setSortDirection] = React.useState<TripSortDirection>('desc');
    const [viewMode, setViewMode] = React.useState<TripViewMode>('feed');
    const [isViewModeTransitioning, setIsViewModeTransitioning] = React.useState(false);
    const [isViewModeHydrated, setIsViewModeHydrated] = React.useState(false);
    const [isSortModalVisible, setIsSortModalVisible] = React.useState(false);
    const [isProfileEditorVisible, setIsProfileEditorVisible] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [actionError, setActionError] = React.useState<string | null>(null);
    const [tripListBanner, setTripListBanner] = React.useState<MobileTripListBanner | null>(null);
    const [draftDisplayName, setDraftDisplayName] = React.useState('');
    const [draftPhotoPreviewUri, setDraftPhotoPreviewUri] = React.useState<string | null>(null);
    const [pendingPhotoAsset, setPendingPhotoAsset] = React.useState<PickedProfilePhotoAsset | null>(null);
    const [isProfileEditorSaving, setIsProfileEditorSaving] = React.useState(false);
    const { notifyPrimaryScrollActivity, scrollEventThrottle } = usePrimaryScrollActivityReporter();
    const openedProfileEditorRef = React.useRef(false);

    const summary = profileSummary || buildFallbackProfileSummary(user);
    const sortedItems = React.useMemo(
        () => sortTrips(items, sortKey, sortDirection),
        [items, sortDirection, sortKey]
    );
    const currentHomeTrip = React.useMemo(() => findInProgressTrip(sortedItems), [sortedItems]);
    const currentHomeTripDescription = React.useMemo(() => {
        if (!currentHomeTrip) {
            return '';
        }

        return [
            currentHomeTrip.subInfo,
            currentHomeTrip.dayCount
        ]
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .join('\n') || '지금 진행 중인 여행이에요.';
    }, [currentHomeTrip]);
    const currentHomeTripCoverImage = React.useMemo(() => (
        String(currentHomeTrip?.coverImage || '').trim()
    ), [currentHomeTrip?.coverImage]);
    const emptyHomeHeroImageUrl = currentHomeTripCoverImage || EMPTY_HOME_HERO_IMAGE_URL;
    const emptyHomeHeroTitle = currentHomeTrip
        ? '지금 여행 중이시네요!'
        : '여행은 계획하는\n순간부터 설레요';
    const emptyHomeHeroDescription = currentHomeTrip
        ? '오늘의 일정과 남기고 싶은 순간을\n바로 이어가세요.'
        : '나만의 여행을 계획하고,\n특별한 추억을 만들어보세요.';
    const trimmedSearchQuery = React.useMemo(() => searchQuery.trim(), [searchQuery]);
    const filteredItems = React.useMemo(() => (
        sortedItems.filter((trip) => matchesTripSearch(trip, trimmedSearchQuery))
    ), [sortedItems, trimmedSearchQuery]);
    const isInitialLoading = loading && sortedItems.length === 0;
    const profilePrimaryLabel = React.useMemo(() => (
        getProfilePrimaryLabel(summary ?? { displayName: null, email: null })
    ), [summary]);
    const editableProfileName = React.useMemo(() => (
        getEditableProfileName(summary ?? { displayName: null, email: null })
    ), [summary]);
    const isPendingDeletion = summary?.accountStatus === 'pending_deletion';
    const trimmedDraftDisplayName = draftDisplayName.trim();
    const hasDraftDisplayName = trimmedDraftDisplayName.length > 0;
    const hasProfileChanges = Boolean(pendingPhotoAsset)
        || trimmedDraftDisplayName !== editableProfileName;
    const isProfileEditorBusy = isProfileEditorSaving || isAuthActionLoading;
    const activeSortOption = React.useMemo(() => (
        SORT_OPTIONS.find((option) => option.key === sortKey) || SORT_OPTIONS[0]
    ), [sortKey]);
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
    const [activeMenuTrip, setActiveMenuTrip] = React.useState<MobileTripSummary | null>(null);
    const [processingTripId, setProcessingTripId] = React.useState<string | null>(null);
    const [processingActionLabel, setProcessingActionLabel] = React.useState<string | null>(null);
    const [shareSheetTrip, setShareSheetTrip] = React.useState<MobileTripSummary | null>(null);
    const [shareSheetInfo, setShareSheetInfo] = React.useState<TripShareResponse | null>(null);
    const [shareSheetRoleOverride, setShareSheetRoleOverride] = React.useState<TripShareLinkRole | null>(null);
    const [isShareSheetLoading, setShareSheetLoading] = React.useState(false);
    const [shareSheetError, setShareSheetError] = React.useState<string | null>(null);
    const [shareSheetBusyAction, setShareSheetBusyAction] = React.useState<string | null>(null);
    const pendingShareSheetRoleRef = React.useRef<TripShareLinkRole | null>(null);
    const [ownerTransferDeleteState, setOwnerTransferDeleteState] = React.useState<OwnerTransferDeleteState | null>(null);
    const [announcementSheetTrip, setAnnouncementSheetTrip] = React.useState<MobileTripSummary | null>(null);
    const [announcementSheetError, setAnnouncementSheetError] = React.useState<string | null>(null);
    const [isAnnouncementSheetSending, setAnnouncementSheetSending] = React.useState(false);
    const [activeHomePlanIconIndex, setActiveHomePlanIconIndex] = React.useState(0);
    const viewModeTransitionTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const emptyHomePlanIconSlide = React.useRef(new Animated.Value(1)).current;
    const TripShareSheetComponent = shareSheetTrip ? getTripShareSheetComponent() : null;
    const TripAnnouncementSheetComponent = announcementSheetTrip ? getTripAnnouncementSheetComponent() : null;
    const hasPendingTripAction = Boolean(processingTripId);
    const isHomeRoute = route.name === 'Home';
    const activeRootTab: RootTabKey = isHomeRoute ? 'Home' : 'TripList';
    const activeHomePlanIcon = EMPTY_HOME_TRANSPORT_ICONS[activeHomePlanIconIndex];
    const emptyHomePlanIconTranslateX = React.useMemo(() => (
        emptyHomePlanIconSlide.interpolate({
            inputRange: [0, 1],
            outputRange: [16, 0]
        })
    ), [emptyHomePlanIconSlide]);
    const emptyHomePlanIconMotionStyle = React.useMemo(() => {
        const translateX = emptyHomePlanIconTranslateX;

        return {
            opacity: emptyHomePlanIconSlide,
            transform: [{ translateX }]
        };
    }, [emptyHomePlanIconSlide, emptyHomePlanIconTranslateX]);
    const emptyHomeHeroEdgeStyle = React.useMemo(() => ({
        height: 320 + insets.top
    }), [insets.top]);
    const emptyHomeHeroCopyEdgeStyle = React.useMemo(() => ({
        top: 72 + insets.top
    }), [insets.top]);
    const tripRenderItems = React.useMemo<Array<MobileTripSummary | LoadingTripRow>>(
        () => (
            isInitialLoading
                ? TRIP_LOADING_PLACEHOLDERS.map((placeholder) => ({
                    kind: 'loading',
                    id: `trip-loading-${placeholder}`
                }))
                : filteredItems
        ),
        [filteredItems, isInitialLoading]
    );
    const visibleTripRenderItems = React.useMemo<Array<MobileTripSummary | LoadingTripRow>>(
        () => (isViewModeTransitioning ? [] : tripRenderItems),
        [isViewModeTransitioning, tripRenderItems]
    );
    const resolvedShareSheetInfo = React.useMemo<TripShareResponse | null>(() => {
        if (!shareSheetRoleOverride) {
            return shareSheetInfo;
        }

        if (!shareSheetInfo) {
            return {
                permissions: {
                    role: shareSheetTrip?.permissions.role || '',
                    canManageShare: shareSheetTrip?.permissions.canManageShare === true,
                    canManageMembers: shareSheetTrip?.permissions.role === 'owner',
                    canSendAnnouncement: shareSheetTrip?.permissions.canSendAnnouncement === true
                },
                members: [],
                shareLink: {
                    mode: 'link',
                    role: shareSheetRoleOverride,
                    url: '',
                    active: true
                }
            };
        }

        return {
            ...shareSheetInfo,
            shareLink: {
                ...shareSheetInfo.shareLink,
                mode: 'link',
                role: shareSheetRoleOverride,
                active: true
            }
        };
    }, [
        shareSheetInfo,
        shareSheetRoleOverride,
        shareSheetTrip?.permissions.canManageShare,
        shareSheetTrip?.permissions.canSendAnnouncement,
        shareSheetTrip?.permissions.role
    ]);

    React.useEffect(() => {
        let isMounted = true;

        void readTripListViewMode()
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
        let isActive = true;

        void readTripListBannerSafely()
            .then((nextBanner) => {
                if (isActive) {
                    setTripListBanner(nextBanner);
                }
            });

        return () => {
            isActive = false;
        };
    }, []);

    React.useEffect(() => {
        if (!isViewModeHydrated) {
            return;
        }

        void writeTripListViewMode(viewMode);
    }, [isViewModeHydrated, viewMode]);

    React.useEffect(() => {
        if (isProfileEditorVisible && !openedProfileEditorRef.current) {
            setDraftDisplayName(editableProfileName);
            setDraftPhotoPreviewUri(summary?.photoURL || null);
            setPendingPhotoAsset(null);
        }

        openedProfileEditorRef.current = isProfileEditorVisible;
    }, [editableProfileName, isProfileEditorVisible, summary?.photoURL]);

    React.useEffect(() => {
        if (!isHomeRoute || currentHomeTrip) {
            return;
        }

        const timer = setInterval(() => {
            emptyHomePlanIconSlide.setValue(0);
            setActiveHomePlanIconIndex((currentIndex) => (
                (currentIndex + 1) % EMPTY_HOME_TRANSPORT_ICONS.length
            ));
            Animated.timing(emptyHomePlanIconSlide, {
                toValue: 1,
                duration: 420,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true
            }).start();
        }, 1800);

        return () => {
            clearInterval(timer);
            emptyHomePlanIconSlide.stopAnimation();
        };
    }, [currentHomeTrip, emptyHomePlanIconSlide, isHomeRoute]);

    const openProfileEditor = React.useCallback(() => {
        setIsProfileEditorVisible(true);
    }, []);

    const closeProfileEditor = React.useCallback(() => {
        if (isProfileEditorBusy) {
            return;
        }

        setIsProfileEditorVisible(false);
    }, [isProfileEditorBusy]);

    const handlePickProfilePhoto = React.useCallback(async () => {
        try {
            const asset = await pickProfilePhotoAsset();
            if (!asset) {
                return;
            }

            setPendingPhotoAsset(asset);
            setDraftPhotoPreviewUri(asset.uri);
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : '프로필 사진을 고르지 못했어요.';
            Alert.alert('프로필 사진 선택 실패', message);
        }
    }, []);

    const handleSaveProfile = React.useCallback(async () => {
        if (!user) {
            return;
        }
        if (!hasDraftDisplayName) {
            Alert.alert('이름을 확인해 주세요.', '프로필 이름은 비워 둘 수 없어요.');
            return;
        }
        if (!hasProfileChanges) {
            setIsProfileEditorVisible(false);
            return;
        }

        setIsProfileEditorSaving(true);
        try {
            if (pendingPhotoAsset) {
                const uploadedUrl = await uploadProfilePhotoAsset({
                    uid: user.uid,
                    asset: pendingPhotoAsset
                });
                await updateProfilePhoto(uploadedUrl);
                setPendingPhotoAsset(null);
                setDraftPhotoPreviewUri(uploadedUrl);
            }

            if (trimmedDraftDisplayName !== editableProfileName) {
                await updateProfileDisplayName(trimmedDraftDisplayName);
            }

            setIsProfileEditorVisible(false);
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : '프로필 정보를 저장하지 못했어요.';
            Alert.alert('프로필 저장 실패', message);
        } finally {
            setIsProfileEditorSaving(false);
        }
    }, [
        editableProfileName,
        hasDraftDisplayName,
        hasProfileChanges,
        pendingPhotoAsset,
        trimmedDraftDisplayName,
        updateProfileDisplayName,
        updateProfilePhoto,
        user
    ]);

    const handleCreateTrip = React.useCallback(() => {
        if (hasPendingTripAction) {
            return;
        }

        if (!isTripCreationEnabled) {
            Alert.alert(TRIP_CREATION_DISABLED_TITLE, TRIP_CREATION_DISABLED_MESSAGE);
            return;
        }

        setIsSortModalVisible(false);
        navigation.navigate('TripCreate');
    }, [hasPendingTripAction, navigation]);

    const handleOpenCurrentHomeTrip = React.useCallback(() => {
        if (!currentHomeTrip) {
            return;
        }

        navigation.navigate('TripDetail', { tripId: currentHomeTrip.id });
    }, [currentHomeTrip, navigation]);

    const handleOpenHomeQuickAction = React.useCallback((
        action: 'community' | 'flight' | 'stay' | 'activity'
    ) => {
        setIsSortModalVisible(false);

        switch (action) {
        case 'community':
            navigation.navigate('Community');
            break;
        case 'flight':
            navigation.navigate('FlightBooking');
            break;
        case 'stay':
            navigation.navigate('StayBooking');
            break;
        case 'activity':
            navigation.navigate('ActivityBooking');
            break;
        default:
            break;
        }
    }, [navigation]);

    const closeActionMenu = React.useCallback(() => {
        if (hasPendingTripAction) {
            return;
        }

        setActiveMenuTrip(null);
    }, [hasPendingTripAction]);

    const closeSortModal = React.useCallback(() => {
        if (hasPendingTripAction) {
            return;
        }

        setIsSortModalVisible(false);
    }, [hasPendingTripAction]);

    const openActionMenu = React.useCallback((trip: MobileTripSummary) => {
        if (hasPendingTripAction) {
            return;
        }

        setIsSortModalVisible(false);
        setActiveMenuTrip(trip);
    }, [hasPendingTripAction]);

    const handleOpenSortModal = React.useCallback(() => {
        if (hasPendingTripAction || isInitialLoading) {
            return;
        }

        setIsSortModalVisible(true);
    }, [hasPendingTripAction, isInitialLoading]);

    const handleSelectSortOption = React.useCallback((nextSortKey: TripSortKey) => {
        if (hasPendingTripAction) {
            return;
        }

        if (nextSortKey === sortKey) {
            setSortDirection((currentDirection) => (
                currentDirection === 'asc' ? 'desc' : 'asc'
            ));
        } else {
            const nextOption = SORT_OPTIONS.find((option) => option.key === nextSortKey);
            setSortKey(nextSortKey);
            setSortDirection(nextOption?.defaultDirection || 'asc');
        }

        setIsSortModalVisible(false);
    }, [hasPendingTripAction, sortKey]);

    const commitViewModeChange = React.useCallback((nextMode: TripViewMode) => {
        if (nextMode === viewMode || isViewModeTransitioning) {
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
    }, [isViewModeTransitioning, viewMode]);

    const handleCycleViewMode = React.useCallback(() => {
        if (hasPendingTripAction || isInitialLoading || isViewModeTransitioning) {
            return;
        }

        const currentIndex = VIEW_OPTIONS.findIndex((option) => option.key === viewMode);
        const nextMode = currentIndex < 0
            ? VIEW_OPTIONS[0].key
            : VIEW_OPTIONS[(currentIndex + 1) % VIEW_OPTIONS.length].key;

        commitViewModeChange(nextMode);
    }, [commitViewModeChange, hasPendingTripAction, isInitialLoading, isViewModeTransitioning, viewMode]);

    const closeOwnerTransferDeleteModal = React.useCallback(() => {
        setOwnerTransferDeleteState((current) => (
            current?.submitting ? current : null
        ));
    }, []);

    const executeTripDelete = React.useCallback(async (
        trip: MobileTripSummary,
        transferOwnerUid?: string | null
    ) => {
        if (!user?.uid || hasPendingTripAction) {
            return;
        }

        setActionError(null);
        setProcessingTripId(trip.id);
        setProcessingActionLabel(transferOwnerUid ? '소유권 넘기는 중...' : '삭제 중...');
        setOwnerTransferDeleteState((current) => (
            current?.trip.id === trip.id
                ? { ...current, submitting: true, error: null }
                : current
        ));

        try {
            await tripRepository.deleteTrip(user.uid, trip.id, { transferOwnerUid });
            try {
                await cancelTripReminders(trip.id);
            } catch (reminderError) {
                console.warn('Failed to cancel trip reminders after trip delete', reminderError);
            }
            publishTripDeleted(trip.id);
            setOwnerTransferDeleteState(null);
            if (transferOwnerUid) {
                Alert.alert('소유권을 넘겼어요', '이 여행은 선택한 멤버가 이어서 관리하고, 내 여행 목록에서는 제거돼요.');
            }
        } catch (deleteError) {
            const message = deleteError instanceof Error
                ? deleteError.message
                : '여행을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.';
            setActionError(message);
            setOwnerTransferDeleteState((current) => (
                current?.trip.id === trip.id
                    ? { ...current, submitting: false, error: message }
                    : current
            ));
        } finally {
            setProcessingTripId(null);
            setProcessingActionLabel(null);
        }
    }, [hasPendingTripAction, tripRepository, user?.uid]);

    const handleDeleteTrip = React.useCallback((trip: MobileTripSummary) => {
        if (!user?.uid || hasPendingTripAction) {
            return;
        }

        setActiveMenuTrip(null);

        void (async () => {
            try {
                const { fetchTripShareInfo } = getTripShareService();
                const shareInfo = await fetchTripShareInfo(trip.id);
                const candidates = shareInfo.members.filter((member) => (
                    !member.isSelf && member.role !== 'owner'
                ));

                if (candidates.length > 0) {
                    setOwnerTransferDeleteState({
                        trip,
                        candidates,
                        selectedUid: candidates[0].uid,
                        error: null,
                        submitting: false
                    });
                    return;
                }

                Alert.alert(
                    '여행을 삭제할까요?',
                    `"${trip.title}" 여행을 삭제하면 되돌릴 수 없어요.`,
                    [
                        {
                            text: '취소',
                            style: 'cancel'
                        },
                        {
                            text: '삭제',
                            style: 'destructive',
                            onPress: () => {
                                void executeTripDelete(trip);
                            }
                        }
                    ]
                );
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : '멤버 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
                setActionError(message);
                Alert.alert('삭제 준비 실패', message);
            }
        })();
    }, [executeTripDelete, hasPendingTripAction, user?.uid]);

    const handleConfirmOwnerTransferDelete = React.useCallback(() => {
        const currentState = ownerTransferDeleteState;
        if (!currentState || currentState.submitting) {
            return;
        }

        void executeTripDelete(currentState.trip, currentState.selectedUid);
    }, [executeTripDelete, ownerTransferDeleteState]);

    const handleDuplicateTrip = React.useCallback((trip: MobileTripSummary) => {
        if (!user?.uid || hasPendingTripAction) {
            return;
        }

        if (!isTripCreationEnabled) {
            setActiveMenuTrip(null);
            Alert.alert(TRIP_CREATION_DISABLED_TITLE, TRIP_CREATION_DISABLED_MESSAGE);
            return;
        }

        setActiveMenuTrip(null);

        void (async () => {
            setActionError(null);
            setProcessingTripId(trip.id);
            setProcessingActionLabel('사본 만드는 중...');

            try {
                const duplicatedTrip = await tripRepository.duplicateTrip(user.uid, trip.id);
                if (!duplicatedTrip) {
                    throw new Error('여행 사본을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
                }

                publishTripCreated(duplicatedTrip);
            } catch (duplicateError) {
                setActionError(
                    duplicateError instanceof Error
                        ? duplicateError.message
                        : '여행 사본을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
                );
            } finally {
                setProcessingTripId(null);
                setProcessingActionLabel(null);
            }
        })();
    }, [hasPendingTripAction, tripRepository, user?.uid]);

    const closeShareSheet = React.useCallback(() => {
        if (isShareSheetLoading || shareSheetBusyAction) {
            return;
        }

        setShareSheetTrip(null);
        setShareSheetInfo(null);
        setShareSheetRoleOverride(null);
        setShareSheetLoading(false);
        setShareSheetError(null);
        setShareSheetBusyAction(null);
    }, [isShareSheetLoading, shareSheetBusyAction]);

    const closeAnnouncementSheet = React.useCallback(() => {
        if (isAnnouncementSheetSending) {
            return;
        }

        setAnnouncementSheetTrip(null);
        setAnnouncementSheetError(null);
    }, [isAnnouncementSheetSending]);

    const performShareSheetLink = React.useCallback(async (
        trip: MobileTripSummary,
        role: TripShareLinkRole,
        shareLink: string
    ) => {
        try {
            const { buildTripShareMessage } = getTripShareService();
            const result = await Share.share({
                title: trip.title,
                message: buildTripShareMessage(trip.title, shareLink, role)
            });

            if (result.action === Share.dismissedAction) {
                Alert.alert(
                    '공유 창을 닫았어요',
                    '일부 공유 옵션은 기기나 환경에 따라 다르게 보일 수 있어요.'
                );
            }
        } catch (shareError) {
            const message = shareError instanceof Error
                ? shareError.message
                : '공유 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.';
            Alert.alert('공유 실패', message);
        }
    }, []);

    const runShareSheetMutation = React.useCallback(async (
        busyAction: string,
        task: () => Promise<TripShareResponse>,
        optimisticUpdate?: (current: TripShareResponse | null) => TripShareResponse | null
    ) => {
        const previousInfo = shareSheetInfo;

        setShareSheetBusyAction(busyAction);
        setShareSheetError(null);
        if (optimisticUpdate) {
            setShareSheetInfo((current) => optimisticUpdate(current));
        }

        try {
            const nextInfo = await task();
            setShareSheetInfo(nextInfo);
        } catch (error) {
            setShareSheetInfo(previousInfo);
            const message = error instanceof Error
                ? error.message
                : '공유 설정을 변경하지 못했어요. 잠시 후 다시 시도해 주세요.';
            setShareSheetError(message);
            Alert.alert('공유 설정 실패', message);
        } finally {
            setShareSheetBusyAction(null);
        }
    }, [shareSheetInfo]);

    const handleShareTrip = React.useCallback((trip: MobileTripSummary) => {
        if (!user?.uid || hasPendingTripAction || !trip.permissions.canManageShare || isOfflineMode) {
            return;
        }

        setActiveMenuTrip(null);
        setShareSheetTrip(trip);
        setShareSheetInfo(null);
        setShareSheetRoleOverride(null);
        setShareSheetError(null);
        setShareSheetLoading(true);

        void (async () => {
            try {
                const { fetchTripShareInfo } = getTripShareService();
                setShareSheetInfo(await fetchTripShareInfo(trip.id));
            } catch (shareError) {
                setShareSheetError(
                    shareError instanceof Error
                        ? shareError.message
                        : '공유 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
                );
            } finally {
                setShareSheetLoading(false);
            }
        })();
    }, [hasPendingTripAction, isOfflineMode, user?.uid]);

    const handleOpenTripAnnouncement = React.useCallback((trip: MobileTripSummary) => {
        if (!user?.uid || hasPendingTripAction || !trip.permissions.canSendAnnouncement || isOfflineMode) {
            return;
        }

        setActiveMenuTrip(null);
        setAnnouncementSheetTrip(trip);
        setAnnouncementSheetError(null);
    }, [hasPendingTripAction, isOfflineMode, user?.uid]);

    const handleSubmitTripAnnouncement = React.useCallback(async (input: { title: string; body: string }) => {
        if (!announcementSheetTrip || isAnnouncementSheetSending) {
            return;
        }

        setAnnouncementSheetSending(true);
        setAnnouncementSheetError(null);

        try {
            const { buildTripAnnouncementResultMessage, sendTripAnnouncement } = getTripAnnouncementService();
            const result = await sendTripAnnouncement(announcementSheetTrip.id, input);
            setAnnouncementSheetTrip(null);
            Alert.alert('잘 전송했어요', buildTripAnnouncementResultMessage(result));
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : '참가자 공지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.';
            setAnnouncementSheetError(message);
            Alert.alert('공지 발송 실패', message);
        } finally {
            setAnnouncementSheetSending(false);
        }
    }, [announcementSheetTrip, isAnnouncementSheetSending]);

    const handleShareSheetLink = React.useCallback(() => {
        if (!shareSheetTrip || !resolvedShareSheetInfo) {
            return;
        }

        const shareLink = resolvedShareSheetInfo.shareLink.url;
        const role = resolvedShareSheetInfo.shareLink.role;

        if (!shareLink) {
            const message = '아직 공유 링크가 준비되지 않았어요.';
            setShareSheetError(message);
            Alert.alert('공유 링크 없음', message);
            return;
        }

        void performShareSheetLink(shareSheetTrip, role, shareLink);
    }, [performShareSheetLink, resolvedShareSheetInfo, shareSheetTrip]);

    const handleSetShareRole = React.useCallback((role: TripShareLinkRole) => {
        if (!shareSheetTrip || shareSheetBusyAction) {
            return;
        }

        setShareSheetRoleOverride(role);
        pendingShareSheetRoleRef.current = role;

        void (async () => {
            setShareSheetBusyAction('share-role');
            setShareSheetError(null);
            setShareSheetInfo((current) => current ? {
                ...current,
                shareLink: {
                    ...current.shareLink,
                    mode: 'link',
                    role,
                    active: true
                }
            } : current);

            try {
                const { fetchTripShareInfo, updateTripShareInfo } = getTripShareService();
                await updateTripShareInfo(shareSheetTrip.id, {
                    shareLink: {
                        mode: 'link',
                        role
                    }
                });

                const nextInfo = await fetchTripShareInfo(shareSheetTrip.id);
                setShareSheetInfo(nextInfo);
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : '공유 설정을 변경하지 못했어요. 잠시 후 다시 시도해 주세요.';
                setShareSheetError(message);
                setShareSheetRoleOverride(null);
                Alert.alert('공유 설정 실패', message);
            } finally {
                pendingShareSheetRoleRef.current = null;
                setShareSheetBusyAction(null);
            }
        })();
    }, [runShareSheetMutation, shareSheetBusyAction, shareSheetTrip]);

    React.useEffect(() => {
        if (!shareSheetRoleOverride) {
            return;
        }

        if (shareSheetError) {
            setShareSheetRoleOverride(null);
            return;
        }

        if (shareSheetInfo?.shareLink.role === shareSheetRoleOverride) {
            setShareSheetRoleOverride(null);
        }
    }, [shareSheetError, shareSheetInfo?.shareLink.role, shareSheetRoleOverride]);

    const handleSetShareMode = React.useCallback((mode: TripShareMode) => {
        if (!shareSheetTrip || shareSheetBusyAction) {
            return;
        }

        void runShareSheetMutation('share-mode', () => (
            getTripShareService().updateTripShareInfo(shareSheetTrip.id, {
                shareLink: {
                    mode
                }
            })
        ));
    }, [runShareSheetMutation, shareSheetBusyAction, shareSheetTrip]);

    const handleChangeShareMemberRole = React.useCallback((
        memberUid: string,
        role: 'editor' | 'member'
    ) => {
        if (!shareSheetTrip || shareSheetBusyAction) {
            return;
        }

        void runShareSheetMutation('member-role', () => (
            getTripShareService().updateTripMemberRole(shareSheetTrip.id, memberUid, role)
        ));
    }, [runShareSheetMutation, shareSheetBusyAction, shareSheetTrip]);

    const handleRemoveShareMember = React.useCallback((memberUid: string) => {
        if (!shareSheetTrip || shareSheetBusyAction) {
            return;
        }

        const member = shareSheetInfo?.members.find((entry) => entry.uid === memberUid);
        const memberLabel = member?.displayName || member?.email || '이 멤버';

        Alert.alert(
            '멤버를 제거할까요?',
            `${memberLabel} 님의 여행 접근 권한을 제거할까요?`,
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '제거',
                    style: 'destructive',
                    onPress: () => {
                        void runShareSheetMutation('member-remove', () => (
                            getTripShareService().removeTripMember(shareSheetTrip.id, memberUid)
                        ));
                    }
                }
            ]
        );
    }, [runShareSheetMutation, shareSheetBusyAction, shareSheetInfo, shareSheetTrip]);

    const handleTransferShareOwnership = React.useCallback((memberUid: string) => {
        if (!shareSheetTrip || shareSheetBusyAction) {
            return;
        }

        const member = shareSheetInfo?.members.find((entry) => entry.uid === memberUid);
        const memberLabel = member?.displayName || member?.email || '이 멤버';

        Alert.alert(
            '소유권을 넘길까요?',
            `${memberLabel} 님에게 이 여행의 소유권을 넘겨요. 넘긴 뒤에도 편집 멤버로 계속 참여할 수 있어요.`,
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '넘기기',
                    onPress: () => {
                        void runShareSheetMutation('owner-transfer', () => (
                            getTripShareService().transferTripOwnership(shareSheetTrip.id, memberUid)
                        ));
                    }
                }
            ]
        );
    }, [runShareSheetMutation, shareSheetBusyAction, shareSheetInfo, shareSheetTrip]);

    const handleRefresh = React.useCallback(async () => {
        if (loading || refreshing || isAuthActionLoading || hasPendingTripAction) {
            return;
        }

        const nextUser = await refreshSession();

        if (!nextUser || (user?.uid && nextUser.uid !== user.uid)) {
            return;
        }

        const [, nextBanner] = await Promise.all([
            refresh(),
            readTripListBannerSafely()
        ]);
        setTripListBanner(nextBanner);
    }, [hasPendingTripAction, isAuthActionLoading, loading, refresh, refreshSession, refreshing, user?.uid]);

    const handleLoadMore = React.useCallback(async () => {
        if (hasPendingTripAction) {
            return;
        }

        await loadMore();
    }, [hasPendingTripAction, loadMore]);

    const handleTripListBannerPress = React.useCallback(async () => {
        const targetUrl = String(tripListBanner?.targetUrl || '').trim();
        if (!targetUrl) {
            return;
        }

        try {
            const supported = await Linking.canOpenURL(targetUrl);
            if (!supported) {
                throw new Error('지원되지 않는 링크예요.');
            }

            await Linking.openURL(targetUrl);
        } catch (error) {
            Alert.alert(
                '배너 열기 실패',
                error instanceof Error
                    ? error.message
                    : '배너 링크를 열지 못했어요. 잠시 후 다시 시도해 주세요.'
            );
        }
    }, [tripListBanner?.targetUrl]);
    const handleOpenNotices = React.useCallback(() => {
        navigation.navigate('InAppBrowser', {
            url: NOTICES_URL,
            title: '공지사항'
        });
    }, [navigation]);

    const noticeStack = (
        <>
            {actionError ? (
                <View style={[styles.bannerCard, styles.bannerCardWarning]}>
                    <Text style={[styles.bannerText, styles.bannerTextWarning]}>{actionError}</Text>
                </View>
            ) : null}
            {authActionError ? (
                <View style={[styles.bannerCard, styles.bannerCardWarning]}>
                    <Text style={[styles.bannerText, styles.bannerTextWarning]}>{authActionError}</Text>
                </View>
            ) : null}
            {refreshError ? (
                <View style={[styles.bannerCard, styles.bannerCardWarning]}>
                    <Text style={[styles.bannerText, styles.bannerTextWarning]}>{refreshError}</Text>
                </View>
            ) : null}
        </>
    );
    const tripListTopBar = (
        <View style={styles.topBar}>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="프로필 수정"
                hitSlop={8}
                onPress={openProfileEditor}
                style={({ pressed }) => [
                    styles.topBarAvatarButton,
                    pressed ? styles.topBarAvatarButtonPressed : null
                ]}
            >
                <AvatarImage
                    uri={summary?.photoURL || null}
                    label={profilePrimaryLabel}
                    size={48}
                    textSize={16}
                    tone={isPendingDeletion ? 'warning' : 'accent'}
                />
            </Pressable>
            <View style={styles.searchField}>
                <Ionicons
                    name="search"
                    size={18}
                    color={theme.colors.textSecondary}
                    style={styles.searchFieldIcon}
                />
                <TextInput
                    accessibilityLabel="여행 검색"
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    onChangeText={setSearchQuery}
                    placeholder="여행 검색"
                    placeholderTextColor={theme.colors.textSecondary}
                    returnKeyType="search"
                    style={styles.searchInput}
                    value={searchQuery}
                />
            </View>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="새 여행 만들기"
                disabled={hasPendingTripAction || isInitialLoading}
                hitSlop={8}
                onPress={() => {
                    handleCreateTrip();
                }}
                style={({ pressed }) => [
                    styles.topBarAddButton,
                    hasPendingTripAction || isInitialLoading ? styles.actionButtonDisabled : null,
                    pressed && !hasPendingTripAction && !isInitialLoading ? styles.topBarAddButtonPressed : null
                ]}
            >
                <Ionicons
                    name="add"
                    size={20}
                    color={theme.mode === 'dark' ? '#2b1c12' : '#fffdf9'}
                />
            </Pressable>
        </View>
    );
    const activeSortDirectionIcon: keyof typeof Ionicons.glyphMap =
        sortDirection === 'asc' ? 'arrow-up' : 'arrow-down';
    const activeViewModeIcon = VIEW_MODE_ICONS[viewMode];

    if (error) {
        return (
            <View style={styles.shell}>
                <SafeAreaView edges={['top']} style={styles.screenBody}>
                    <View style={styles.stateContent}>
                        {tripListTopBar}
                        {noticeStack}
                        <EmptyState
                            title={
                                errorKind === 'session'
                                    ? '세션을 다시 확인해 주세요.'
                                    : errorKind === 'network'
                                        ? '연결이 잠시 불안정해요.'
                                        : '여행 목록을 불러오지 못했어요.'
                            }
                            description={error}
                            supportText={
                                errorKind === 'network'
                                    ? '인터넷 연결이 돌아오면 새로고침으로 목록을 다시 불러올 수 있어요.'
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
                                    void handleRefresh();
                                    return;
                                }

                                void retry();
                            }}
                        />
                    </View>
                </SafeAreaView>
                <BottomNavBar activeTab={activeRootTab} />
            </View>
        );
    }

    if (isHomeRoute && isInitialLoading) {
        return (
            <View style={styles.shell}>
                <StatusBar
                    style={theme.mode === 'dark' ? 'light' : 'dark'}
                    translucent
                    backgroundColor="transparent"
                />
                <View style={styles.screenBody}>
                    <ScrollView
                        style={styles.emptyHomeScroll}
                        contentContainerStyle={styles.emptyHomeContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={[styles.emptyHomeHero, styles.emptyHomeLoadingHero, emptyHomeHeroEdgeStyle]}>
                            <View style={[styles.emptyHomeLoadingHeroCopy, emptyHomeHeroCopyEdgeStyle]}>
                                <View style={styles.emptyHomeLoadingTitleBar} />
                                <View style={styles.emptyHomeLoadingTitleBarShort} />
                                <View style={styles.emptyHomeLoadingDescriptionBar} />
                                <View style={styles.emptyHomeLoadingDescriptionBarShort} />
                            </View>
                        </View>

                        <View style={styles.emptyHomePlanCard}>
                            <View style={styles.emptyHomeLoadingIconCircle} />
                            <View style={styles.emptyHomeLoadingPlanTitleBar} />
                            <View style={styles.emptyHomeLoadingPlanDescriptionBar} />
                            <View style={styles.emptyHomeLoadingPlanButtonBar} />
                        </View>

                        {SHOW_EMPTY_HOME_QUICK_ACTIONS ? (
                            <>
                                <View style={styles.emptyHomeLoadingSectionRow}>
                                    <View style={styles.emptyHomeLoadingSectionTitleBar} />
                                    <View style={styles.emptyHomeLoadingSectionLinkBar} />
                                </View>
                                <View style={styles.emptyHomeQuickGrid}>
                                    {[0, 1, 2, 3].map((item) => (
                                        <View key={item} style={styles.emptyHomeLoadingQuickCard}>
                                            <View style={styles.emptyHomeLoadingQuickIcon} />
                                            <View style={styles.emptyHomeLoadingQuickLabel} />
                                        </View>
                                    ))}
                                </View>
                            </>
                        ) : null}

                        <View style={styles.emptyHomeRecommendCard}>
                            <View style={styles.emptyHomeRecommendCopy}>
                                <View style={styles.emptyHomeLoadingRecommendTitleBar} />
                                <View style={styles.emptyHomeLoadingRecommendDescriptionBar} />
                                <View style={styles.emptyHomeLoadingRecommendButtonBar} />
                            </View>
                            <View style={styles.emptyHomeLoadingPostcardStack}>
                                <View style={[styles.emptyHomeLoadingPostcard, styles.emptyHomePostcardFirst]} />
                                <View style={[styles.emptyHomeLoadingPostcard, styles.emptyHomePostcardSecond]} />
                                <View style={[styles.emptyHomeLoadingPostcard, styles.emptyHomePostcardThird]} />
                            </View>
                        </View>
                    </ScrollView>
                </View>
                <BottomNavBar activeTab={activeRootTab} />
            </View>
        );
    }

    if (isHomeRoute || isEmpty) {
        if (!isHomeRoute) {
            return (
                <View style={styles.shell}>
                    <SafeAreaView edges={['top']} style={styles.screenBody}>
                        <View style={[styles.stateContent, styles.emptyStateContent]}>
                            {tripListTopBar}
                            {noticeStack}
                            <EmptyState
                                title="아직 만든 여행이 없어요."
                                description="홈에서 새 여행을 시작하면 이곳에 내 여행 목록이 쌓여요."
                                actionLabel={isTripCreationEnabled ? '새 여행 만들기' : undefined}
                                onAction={isTripCreationEnabled ? handleCreateTrip : undefined}
                            />
                            {!isTripCreationEnabled ? (
                                <Text style={styles.tripCreationDisabledNotice}>
                                    새 여행 만들기는 잠시 닫아둘게요.
                                </Text>
                            ) : null}
                        </View>
                    </SafeAreaView>
                    <BottomNavBar activeTab={activeRootTab} />
                </View>
            );
        }

        return (
            <View style={styles.shell}>
                <StatusBar
                    style={theme.mode === 'dark' ? 'light' : 'dark'}
                    translucent
                    backgroundColor="transparent"
                />
                <View style={styles.screenBody}>
                    <ScrollView
                        style={styles.emptyHomeScroll}
                        contentContainerStyle={styles.emptyHomeContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={[styles.emptyHomeHero, emptyHomeHeroEdgeStyle]}>
                            <Image
                                source={{ uri: emptyHomeHeroImageUrl }}
                                style={styles.emptyHomeHeroImage}
                                resizeMode="cover"
                            />
                            <View style={[
                                styles.emptyHomeHeroOverlay,
                                currentHomeTrip ? styles.emptyHomeHeroOverlayCurrentTrip : null
                            ]} />
                            <View style={[styles.emptyHomeHeroCopy, emptyHomeHeroCopyEdgeStyle]}>
                                <Text
                                    numberOfLines={2}
                                    style={[
                                        styles.emptyHomeHeroTitle,
                                        currentHomeTrip ? styles.emptyHomeHeroTitleCurrentTrip : null
                                    ]}
                                >
                                    {emptyHomeHeroTitle}
                                </Text>
                                <Text
                                    numberOfLines={2}
                                    style={[
                                        styles.emptyHomeHeroDescription,
                                        currentHomeTrip ? styles.emptyHomeHeroDescriptionCurrentTrip : null
                                    ]}
                                >
                                    {emptyHomeHeroDescription}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.emptyHomePlanCard}>
                            {currentHomeTrip ? (
                                <>
                                    <View style={[styles.emptyHomePlanIconWrap, styles.emptyHomeCurrentTripIconWrap]}>
                                        <Ionicons name="navigate" size={32} color="#FFFFFF" />
                                    </View>
                                    <Text style={styles.emptyHomePlanEyebrow}>여행 중</Text>
                                    <Text numberOfLines={2} style={styles.emptyHomePlanTitle}>
                                        {currentHomeTrip.title}
                                    </Text>
                                    <Text numberOfLines={3} style={styles.emptyHomePlanDescription}>
                                        {currentHomeTripDescription}
                                    </Text>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`${currentHomeTrip.title} 바로 가기`}
                                        onPress={handleOpenCurrentHomeTrip}
                                        style={({ pressed }) => [
                                            styles.emptyHomePlanButton,
                                            pressed ? styles.emptyTripPrimaryButtonPressed : null
                                        ]}
                                    >
                                        <Text style={styles.emptyHomePlanButtonText}>여행 바로 가기</Text>
                                        <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                                    </Pressable>
                                </>
                            ) : (
                                <>
                                    <View style={styles.emptyHomePlanIconWrap}>
                                        <View
                                            accessibilityElementsHidden
                                            importantForAccessibility="no-hide-descendants"
                                            style={styles.emptyHomePlanIconViewport}
                                        >
                                            <Animated.View style={[styles.emptyHomePlanIconSlider, emptyHomePlanIconMotionStyle]}>
                                                <Ionicons
                                                    name={activeHomePlanIcon.icon}
                                                    size={34}
                                                    color={theme.colors.accent}
                                                />
                                            </Animated.View>
                                        </View>
                                    </View>
                                    <Text style={styles.emptyHomePlanTitle}>새 여행 계획 짜기</Text>
                                    <Text style={styles.emptyHomePlanDescription}>
                                        어디로 떠날지 고민 중이신가요?{'\n'}새로운 여행을 계획해보세요.
                                    </Text>
                                    {isTripCreationEnabled ? (
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={handleCreateTrip}
                                            style={({ pressed }) => [
                                                styles.emptyHomePlanButton,
                                                pressed ? styles.emptyTripPrimaryButtonPressed : null
                                            ]}
                                        >
                                            <Text style={styles.emptyHomePlanButtonText}>여행 계획 시작하기</Text>
                                            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
                                        </Pressable>
                                    ) : (
                                        <Text style={styles.tripCreationDisabledNotice}>
                                            새 여행 만들기는 잠시 닫아둘게요.
                                        </Text>
                                    )}
                                </>
                            )}
                        </View>

                        {SHOW_EMPTY_HOME_QUICK_ACTIONS ? (
                            <>
                                <View style={styles.emptyHomeSectionHeader}>
                                    <Text style={styles.emptyHomeSectionTitle}>여행 계획, 더 쉽게</Text>
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={() => {
                                            handleOpenHomeQuickAction('community');
                                        }}
                                        style={({ pressed }) => [
                                            styles.emptyHomeSectionLink,
                                            pressed ? styles.emptyTripPrimaryButtonPressed : null
                                        ]}
                                    >
                                        <Text style={styles.emptyHomeSectionLinkText}>둘러보기</Text>
                                        <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
                                    </Pressable>
                                </View>

                                <View style={styles.emptyHomeQuickGrid}>
                                    {[
                                        { action: 'community' as const, icon: 'clipboard-outline' as const, label: '일정 템플릿', tone: 'purple' },
                                        { action: 'flight' as const, icon: 'airplane-outline' as const, label: '항공편 등록', tone: 'yellow' },
                                        { action: 'stay' as const, icon: 'business-outline' as const, label: '숙소 예약', tone: 'red' },
                                        { action: 'activity' as const, icon: 'ticket-outline' as const, label: '액티비티 예약', tone: 'green' }
                                    ].map((item) => (
                                        <Pressable
                                            key={item.label}
                                            accessibilityRole="button"
                                            onPress={() => {
                                                handleOpenHomeQuickAction(item.action);
                                            }}
                                            style={({ pressed }) => [
                                                styles.emptyHomeQuickCard,
                                                item.tone === 'green' ? styles.emptyHomeQuickCardGreen : null,
                                                item.tone === 'purple' ? styles.emptyHomeQuickCardPurple : null,
                                                item.tone === 'yellow' ? styles.emptyHomeQuickCardYellow : null,
                                                item.tone === 'red' ? styles.emptyHomeQuickCardRed : null,
                                                pressed ? styles.emptyTripPrimaryButtonPressed : null
                                            ]}
                                        >
                                            <Ionicons
                                                name={item.icon}
                                                size={24}
                                                color={
                                                    item.tone === 'green'
                                                        ? '#38A96B'
                                                        : item.tone === 'purple'
                                                            ? '#8C64D8'
                                                            : item.tone === 'yellow'
                                                                ? '#E8A321'
                                                                : '#E75B64'
                                                }
                                            />
                                            <Text style={styles.emptyHomeQuickLabel}>{item.label}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </>
                        ) : null}

                        <View style={styles.emptyHomeRecommendCard}>
                            <View style={styles.emptyHomeRecommendCopy}>
                                <Text numberOfLines={1} style={styles.emptyHomeRecommendTitle}>
                                    어디로 갈지 고민된다면?
                                </Text>
                                <Text style={styles.emptyHomeRecommendDescription}>
                                    추천 여행지를 확인하고{'\n'}영감을 얻어보세요.
                                </Text>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={handleCreateTrip}
                                    style={({ pressed }) => [
                                        styles.emptyHomeRecommendButton,
                                        pressed ? styles.emptyTripPrimaryButtonPressed : null
                                    ]}
                                >
                                    <Text style={styles.emptyHomeRecommendButtonText}>추천 여행지 보기</Text>
                                    <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
                                </Pressable>
                            </View>
                            <View style={styles.emptyHomePostcardStack}>
                                {EMPTY_HOME_POSTCARD_IMAGE_URLS.map((imageUrl, index) => (
                                    <Image
                                        key={imageUrl}
                                        source={{ uri: imageUrl }}
                                        style={[
                                            styles.emptyHomePostcard,
                                            index === 0 ? styles.emptyHomePostcardFirst : null,
                                            index === 1 ? styles.emptyHomePostcardSecond : null,
                                            index === 2 ? styles.emptyHomePostcardThird : null
                                        ]}
                                        resizeMode="cover"
                                    />
                                ))}
                            </View>
                        </View>

                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="공지사항 보기"
                            onPress={handleOpenNotices}
                            style={({ pressed }) => [
                                styles.emptyHomeNoticeLink,
                                pressed ? styles.emptyHomeNoticeLinkPressed : null
                            ]}
                        >
                            <View style={styles.emptyHomeNoticeIconWrap}>
                                <Ionicons name="megaphone-outline" size={18} color={theme.colors.accent} />
                            </View>
                            <View style={styles.emptyHomeNoticeCopy}>
                                <Text numberOfLines={1} style={styles.emptyHomeNoticeTitle}>공지사항</Text>
                                <Text numberOfLines={1} style={styles.emptyHomeNoticeDescription}>
                                    서비스 안내와 업데이트를 확인해요.
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                        </Pressable>
                    </ScrollView>
                </View>
                <BottomNavBar activeTab={activeRootTab} />
            </View>
        );
    }

    return (
        <View style={styles.shell}>
            <SafeAreaView edges={['top']} style={styles.screenBody}>
                <FlatList
                    key={`trip-list-${viewMode}`}
                    style={styles.list}
                    data={visibleTripRenderItems}
                    extraData={{
                        viewMode,
                        processingTripId,
                        processingActionLabel,
                        hasPendingTripAction,
                        isViewModeTransitioning
                    }}
                    keyExtractor={(item) => item.id}
                    onScroll={notifyPrimaryScrollActivity}
                    scrollEventThrottle={scrollEventThrottle}
                    ListHeaderComponent={(
                        <View style={styles.listHeader}>
                            {tripListTopBar}
                            {tripListBanner ? (
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => {
                                        void handleTripListBannerPress();
                                    }}
                                    style={({ pressed }) => [
                                        styles.tripListBannerCard,
                                        pressed ? styles.tripListBannerCardPressed : null
                                    ]}
                                >
                                    <View style={styles.tripListBannerRow}>
                                        <View style={styles.tripListBannerCopy}>
                                            <View style={styles.tripListBannerEyebrowPill}>
                                                <Text style={styles.tripListBannerEyebrowText}>
                                                    {tripListBanner.eyebrow}
                                                </Text>
                                            </View>
                                            {tripListBanner.title ? (
                                                <Text numberOfLines={1} style={styles.tripListBannerTitle}>
                                                    {tripListBanner.title}
                                                </Text>
                                            ) : null}
                                            {tripListBanner.body ? (
                                                <Text numberOfLines={2} style={styles.tripListBannerBody}>
                                                    {tripListBanner.body}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <View style={styles.tripListBannerCtaCard}>
                                            <Ionicons
                                                name="open-outline"
                                                size={16}
                                                color={theme.colors.accent}
                                            />
                                            <Text numberOfLines={1} style={styles.tripListBannerCtaText}>
                                                {tripListBanner.ctaLabel}
                                            </Text>
                                        </View>
                                    </View>
                                </Pressable>
                            ) : null}
                            {noticeStack}
                            <View style={styles.sectionHeader}>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`정렬 기준. 현재 ${activeSortOption.label}, ${
                                        sortDirection === 'asc' ? '오름차순' : '내림차순'
                                    }`}
                                    disabled={hasPendingTripAction || isInitialLoading}
                                    onPress={handleOpenSortModal}
                                    style={({ pressed }) => [
                                        styles.sortTriggerButton,
                                        hasPendingTripAction || isInitialLoading
                                            ? styles.actionButtonDisabled
                                            : null,
                                        pressed && !hasPendingTripAction && !isInitialLoading
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
                                <View style={styles.sectionActions}>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={hasPendingTripAction || isInitialLoading || isViewModeTransitioning}
                                        accessibilityLabel={`표시 방식 변경. 현재 ${activeViewOption.label}, 다음 ${nextViewOption.label}`}
                                        onPress={handleCycleViewMode}
                                        style={({ pressed }) => [
                                            styles.viewModeToggleButton,
                                            hasPendingTripAction || isInitialLoading || isViewModeTransitioning
                                                ? styles.actionButtonDisabled
                                                : null,
                                            pressed && !hasPendingTripAction && !isInitialLoading && !isViewModeTransitioning
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
                    ListEmptyComponent={isInitialLoading || isViewModeTransitioning ? null : (
                        trimmedSearchQuery ? (
                            <View style={styles.searchEmptyState}>
                                <EmptyState
                                    title="검색 결과가 없어요."
                                    description={`"${trimmedSearchQuery}"와 일치하는 여행을 찾지 못했어요.`}
                                />
                            </View>
                        ) : undefined
                    )}
                    ListFooterComponent={isViewModeTransitioning ? null : (
                        <View style={styles.listFooter}>
                            {isInitialLoading || loadingMore ? (
                                <View style={styles.loadingSpinnerWrap}>
                                    <LoadingView
                                        title={loadingMore ? '여행 더 불러오는 중' : '여행 목록 불러오는 중'}
                                        fullscreen={false}
                                    />
                                </View>
                            ) : null}
                            {!isInitialLoading && hasMore ? (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={hasPendingTripAction || loadingMore}
                                    onPress={() => {
                                        void handleLoadMore();
                                    }}
                                    style={({ pressed }) => [
                                        styles.loadMoreButton,
                                        hasPendingTripAction || loadingMore ? styles.actionButtonDisabled : null,
                                        pressed && !hasPendingTripAction && !loadingMore
                                            ? styles.loadMoreButtonPressed
                                            : null
                                    ]}
                                >
                                    <Text style={styles.loadMoreButtonText}>여행 더 보기</Text>
                                </Pressable>
                            ) : null}
                        </View>
                    )}
                    renderItem={({ item }) => (
                        'kind' in item ? (
                            <View
                                style={viewMode === 'card' ? styles.loadingTripCard : styles.loadingTripFeedRow}
                            >
                                {viewMode === 'card' ? (
                                    <>
                                        <View style={styles.loadingTripCardImage} />
                                        <View style={styles.loadingTripCardOverlay} />
                                        <View style={styles.loadingTripCardContent}>
                                            <View style={styles.loadingChipRow}>
                                                <View style={styles.loadingSmallChip} />
                                                <View style={styles.loadingSmallChipMuted} />
                                            </View>
                                            <View style={styles.loadingTripTitleBar} />
                                            <View style={styles.loadingTripMetaBar} />
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <View style={styles.loadingFeedThumb} />
                                        <View style={styles.loadingFeedCopy}>
                                            <View style={styles.loadingFeedTitleBar} />
                                            <View style={styles.loadingFeedMetaBar} />
                                            <View style={styles.loadingFeedValueBar} />
                                        </View>
                                    </>
                                )}
                            </View>
                        ) : (
                            <TripCard
                                trip={item}
                                actionStatusLabel={processingTripId === item.id ? processingActionLabel : null}
                                disabled={hasPendingTripAction}
                                onOpenActions={() => {
                                    openActionMenu(item);
                                }}
                                variant={viewMode}
                                onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}
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
                animationType="slide"
                transparent
                visible={isProfileEditorVisible}
                onRequestClose={closeProfileEditor}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.profileSheetBackdrop}
                >
                    <Pressable
                        accessibilityRole="button"
                        disabled={isProfileEditorBusy}
                        onPress={closeProfileEditor}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.profileSheet, { paddingBottom: insets.bottom + theme.spacing.md }]}>
                        <View style={styles.profileSheetHandle} />
                        <Text style={styles.profileSheetEyebrow}>프로필</Text>
                        <Text style={styles.profileSheetTitle}>프로필 수정</Text>
                        <Text style={styles.profileSheetDescription}>
                            프로필 사진과 이름을 이 화면에서 바로 바꿀 수 있어요.
                        </Text>

                        <ScrollView
                            ref={profileEditorScrollRef}
                            contentContainerStyle={[styles.profileSheetContent, profileEditorKeyboardInsetStyle]}
                            showsVerticalScrollIndicator={false}
                            {...profileEditorScrollViewProps}
                        >
                            <View style={styles.profileSheetAvatarBlock}>
                                <View style={styles.profileSheetAvatarWrap}>
                                    <AvatarImage
                                        uri={draftPhotoPreviewUri}
                                        label={trimmedDraftDisplayName || profilePrimaryLabel}
                                        size={88}
                                        textSize={30}
                                        tone={isPendingDeletion ? 'warning' : 'accent'}
                                    />
                                </View>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isProfileEditorBusy}
                                    onPress={() => {
                                        void handlePickProfilePhoto();
                                    }}
                                    style={({ pressed }) => [
                                        styles.profilePhotoButton,
                                        isProfileEditorBusy ? styles.actionButtonDisabled : null,
                                        pressed && !isProfileEditorBusy ? styles.sortTriggerButtonPressed : null
                                    ]}
                                >
                                    <Ionicons name="image-outline" size={16} color={theme.colors.accent} />
                                    <Text style={styles.profilePhotoButtonText}>사진 바꾸기</Text>
                                </Pressable>
                            </View>

                            <View style={styles.profileFieldBlock}>
                                <View style={styles.profileFieldHeader}>
                                    <Text style={styles.profileFieldLabel}>이름</Text>
                                    <Text style={styles.profileFieldCounter}>
                                        {draftDisplayName.length}/{PROFILE_NAME_MAX_LENGTH}
                                    </Text>
                                </View>
                                <TextInput
                                    editable={!isProfileEditorBusy}
                                    maxLength={PROFILE_NAME_MAX_LENGTH}
                                    onChangeText={setDraftDisplayName}
                                    onFocus={createProfileEditorFocusHandler()}
                                    placeholder="프로필 이름을 입력해 주세요"
                                    placeholderTextColor={theme.colors.textSecondary}
                                    style={styles.profileNameInput}
                                    value={draftDisplayName}
                                />
                                <Text style={styles.profileFieldHint}>
                                    여행 공유와 기록에 보일 이름이에요.
                                </Text>
                            </View>
                        </ScrollView>

                        <View style={styles.profileSheetFooter}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isProfileEditorBusy}
                                onPress={closeProfileEditor}
                                style={({ pressed }) => [
                                    styles.profileSecondaryButton,
                                    pressed && !isProfileEditorBusy ? styles.sortTriggerButtonPressed : null
                                ]}
                            >
                                <Text style={styles.profileSecondaryButtonText}>닫기</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isProfileEditorBusy || !hasDraftDisplayName || !hasProfileChanges}
                                onPress={() => {
                                    void handleSaveProfile();
                                }}
                                style={({ pressed }) => [
                                    styles.profilePrimaryButton,
                                    isProfileEditorBusy || !hasDraftDisplayName || !hasProfileChanges
                                        ? styles.actionButtonDisabled
                                        : null,
                                    pressed && !isProfileEditorBusy && hasDraftDisplayName && hasProfileChanges
                                        ? styles.topBarAddButtonPressed
                                        : null
                                ]}
                            >
                                <Text style={styles.profilePrimaryButtonText}>
                                    {isProfileEditorBusy ? '저장 중...' : '저장'}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            <Modal
                animationType="fade"
                transparent
                visible={Boolean(activeMenuTrip)}
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
                            <Text style={styles.actionModalEyebrow}>여행 메뉴</Text>
                            <Text style={styles.actionModalTitle} numberOfLines={2}>
                                {activeMenuTrip?.title || '여행'}
                            </Text>
                            <Text style={styles.actionModalSubtitle} numberOfLines={2}>
                                {activeMenuTrip?.subInfo || '이 여행에서 할 작업을 선택해 주세요.'}
                            </Text>
                        </View>

                        {activeMenuTrip?.permissions.canManageShare ? (
                            <Pressable
                                accessibilityRole="button"
                                disabled={hasPendingTripAction || !activeMenuTrip || isOfflineMode}
                                onPress={() => {
                                    if (activeMenuTrip) {
                                        handleShareTrip(activeMenuTrip);
                                    }
                                }}
                                style={({ pressed }) => [
                                    styles.actionMenuButton,
                                    (hasPendingTripAction || !activeMenuTrip || isOfflineMode)
                                        ? styles.actionMenuButtonDisabled
                                        : null,
                                    pressed && !hasPendingTripAction && !isOfflineMode ? styles.actionMenuButtonPressed : null
                                ]}
                            >
                                <View style={styles.actionMenuCopy}>
                                    <Text style={styles.actionMenuLabel}>공유</Text>
                                    <Text style={styles.actionMenuHint}>초대 링크와 권한을 바로 관리할 수 있어요.</Text>
                                </View>
                                <Text style={styles.actionMenuArrow}>›</Text>
                            </Pressable>
                        ) : null}

                        {activeMenuTrip?.permissions.canSendAnnouncement ? (
                            <Pressable
                                accessibilityRole="button"
                                disabled={hasPendingTripAction || !activeMenuTrip || isOfflineMode}
                                onPress={() => {
                                    if (activeMenuTrip) {
                                        handleOpenTripAnnouncement(activeMenuTrip);
                                    }
                                }}
                                style={({ pressed }) => [
                                    styles.actionMenuButton,
                                    (hasPendingTripAction || !activeMenuTrip || isOfflineMode)
                                        ? styles.actionMenuButtonDisabled
                                        : null,
                                    pressed && !hasPendingTripAction && !isOfflineMode ? styles.actionMenuButtonPressed : null
                                ]}
                            >
                                <View style={styles.actionMenuCopy}>
                                    <Text style={styles.actionMenuLabel}>참가자 공지</Text>
                                    <Text style={styles.actionMenuHint}>참가자에게 바로 공지를 보낼 수 있어요.</Text>
                                </View>
                                <Text style={styles.actionMenuArrow}>›</Text>
                            </Pressable>
                        ) : null}

                        {isTripCreationEnabled ? (
                            <Pressable
                                accessibilityRole="button"
                                disabled={hasPendingTripAction || !activeMenuTrip}
                                onPress={() => {
                                    if (activeMenuTrip) {
                                        handleDuplicateTrip(activeMenuTrip);
                                    }
                                }}
                                style={({ pressed }) => [
                                    styles.actionMenuButton,
                                    pressed && !hasPendingTripAction ? styles.actionMenuButtonPressed : null
                                ]}
                            >
                                <View style={styles.actionMenuCopy}>
                                    <Text style={styles.actionMenuLabel}>사본 만들기</Text>
                                    <Text style={styles.actionMenuHint}>현재 여행을 그대로 복사해 새 여행을 만들어요.</Text>
                                </View>
                                <Text style={styles.actionMenuArrow}>›</Text>
                            </Pressable>
                        ) : null}

                        {activeMenuTrip?.permissions.canDeleteTrip ? (
                            <Pressable
                                accessibilityRole="button"
                                disabled={hasPendingTripAction || !activeMenuTrip}
                                onPress={() => {
                                    if (activeMenuTrip) {
                                        handleDeleteTrip(activeMenuTrip);
                                    }
                                }}
                                style={({ pressed }) => [
                                    styles.actionMenuButton,
                                    styles.actionMenuButtonDanger,
                                    pressed && !hasPendingTripAction ? styles.actionMenuButtonPressed : null
                                ]}
                            >
                                <View style={styles.actionMenuCopy}>
                                    <Text style={[styles.actionMenuLabel, styles.actionMenuLabelDanger]}>삭제</Text>
                                    <Text style={[styles.actionMenuHint, styles.actionMenuHintDanger]}>
                                        삭제된 여행은 복구할 수 없어요.
                                    </Text>
                                </View>
                                <Text style={[styles.actionMenuArrow, styles.actionMenuArrowDanger]}>›</Text>
                            </Pressable>
                        ) : null}

                        <Pressable
                            accessibilityRole="button"
                            disabled={hasPendingTripAction}
                            onPress={closeActionMenu}
                            style={({ pressed }) => [
                                styles.actionModalCancelButton,
                                pressed && !hasPendingTripAction ? styles.actionMenuButtonPressed : null
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
                visible={Boolean(ownerTransferDeleteState)}
                onRequestClose={closeOwnerTransferDeleteModal}
            >
                <View style={styles.actionModalBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        disabled={ownerTransferDeleteState?.submitting === true}
                        onPress={closeOwnerTransferDeleteModal}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.actionModalCard}>
                        <View style={styles.actionModalHeader}>
                            <Text style={styles.actionModalEyebrow}>소유권 이전</Text>
                            <Text style={styles.actionModalTitle} numberOfLines={2}>
                                {ownerTransferDeleteState?.trip.title || '여행'}
                            </Text>
                            <Text style={styles.actionModalSubtitle}>
                                함께하는 멤버가 있어요. 삭제 대신 소유권을 넘기고 내 여행 목록에서 제거할 멤버를 선택해 주세요.
                            </Text>
                        </View>

                        <ScrollView
                            style={styles.ownerTransferList}
                            contentContainerStyle={styles.ownerTransferListContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {(ownerTransferDeleteState?.candidates || []).map((member) => {
                                const selected = ownerTransferDeleteState?.selectedUid === member.uid;
                                const memberLabel = member.displayName || member.email || '멤버';

                                return (
                                    <Pressable
                                        key={member.uid}
                                        accessibilityRole="button"
                                        disabled={ownerTransferDeleteState?.submitting === true}
                                        onPress={() => {
                                            setOwnerTransferDeleteState((current) => current ? {
                                                ...current,
                                                selectedUid: member.uid,
                                                error: null
                                            } : current);
                                        }}
                                        style={({ pressed }) => [
                                            styles.ownerTransferOption,
                                            selected ? styles.ownerTransferOptionSelected : null,
                                            pressed && ownerTransferDeleteState?.submitting !== true
                                                ? styles.actionMenuButtonPressed
                                                : null
                                        ]}
                                    >
                                        <View style={styles.ownerTransferAvatar}>
                                            <Text style={styles.ownerTransferAvatarText}>
                                                {memberLabel.trim().slice(0, 1).toUpperCase() || 'M'}
                                            </Text>
                                        </View>
                                        <View style={styles.ownerTransferCopy}>
                                            <Text style={styles.ownerTransferName} numberOfLines={1}>
                                                {memberLabel}
                                            </Text>
                                            <Text style={styles.ownerTransferHint} numberOfLines={1}>
                                                {member.email || '이 멤버가 새 소유자가 돼요.'}
                                            </Text>
                                        </View>
                                        <Ionicons
                                            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                            size={22}
                                            color={selected ? theme.colors.accent : theme.colors.textSecondary}
                                        />
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        {ownerTransferDeleteState?.error ? (
                            <Text style={styles.ownerTransferError}>
                                {ownerTransferDeleteState.error}
                            </Text>
                        ) : null}

                        <View style={styles.ownerTransferActions}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={ownerTransferDeleteState?.submitting === true}
                                onPress={closeOwnerTransferDeleteModal}
                                style={({ pressed }) => [
                                    styles.ownerTransferSecondaryButton,
                                    pressed && ownerTransferDeleteState?.submitting !== true
                                        ? styles.actionMenuButtonPressed
                                        : null
                                ]}
                            >
                                <Text style={styles.ownerTransferSecondaryText}>취소</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                disabled={ownerTransferDeleteState?.submitting === true}
                                onPress={handleConfirmOwnerTransferDelete}
                                style={({ pressed }) => [
                                    styles.ownerTransferPrimaryButton,
                                    ownerTransferDeleteState?.submitting === true ? styles.actionMenuButtonDisabled : null,
                                    pressed && ownerTransferDeleteState?.submitting !== true
                                        ? styles.actionMenuButtonPressed
                                        : null
                                ]}
                            >
                                <Text style={styles.ownerTransferPrimaryText}>
                                    {ownerTransferDeleteState?.submitting ? '넘기는 중...' : '소유권 넘기고 삭제'}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
            {TripShareSheetComponent ? (
                <TripShareSheetComponent
                    visible={Boolean(shareSheetTrip)}
                    tripTitle={shareSheetTrip?.title || '여행'}
                    shareInfo={resolvedShareSheetInfo}
                    loading={isShareSheetLoading}
                    error={isOfflineMode ? OFFLINE_SHARE_DISABLED_MESSAGE : shareSheetError}
                    busyAction={shareSheetBusyAction}
                    actionDisabled={isOfflineMode}
                    onClose={closeShareSheet}
                    onShareLink={handleShareSheetLink}
                    onSetMode={handleSetShareMode}
                    onSetRole={handleSetShareRole}
                    onChangeMemberRole={handleChangeShareMemberRole}
                    onRemoveMember={handleRemoveShareMember}
                    onTransferOwnership={handleTransferShareOwnership}
                />
            ) : null}
            {TripAnnouncementSheetComponent ? (
                <TripAnnouncementSheetComponent
                    visible={Boolean(announcementSheetTrip)}
                    tripTitle={announcementSheetTrip?.title || '여행'}
                    error={isOfflineMode ? OFFLINE_ANNOUNCEMENT_DISABLED_MESSAGE : announcementSheetError}
                    busy={isAnnouncementSheetSending}
                    actionDisabled={isOfflineMode}
                    onClose={closeAnnouncementSheet}
                    onSubmit={handleSubmitTripAnnouncement}
                />
            ) : null}
            <BottomNavBar activeTab={activeRootTab} />
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
    container: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    list: {
        flex: 1
    },
    listHeader: {
        paddingTop: theme.spacing.md
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.sm,
        paddingHorizontal: 0
    },
    topBarAvatarButton: {
        borderRadius: theme.radius.full
    },
    topBarAvatarButtonPressed: {
        opacity: 0.88
    },
    searchField: {
        flex: 1,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    searchFieldIcon: {
        marginRight: theme.spacing.xs
    },
    searchInput: {
        flex: 1,
        height: '100%',
        paddingVertical: 0,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    topBarAddButton: {
        width: 48,
        height: 48,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent
    },
    topBarAddButtonPressed: {
        opacity: 0.9
    },
    listContent: {
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.lg
    },
    bannerCard: {
        marginBottom: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md
    },
    bannerCardWarning: {
        backgroundColor: theme.colors.warningSoft
    },
    bannerCardInfo: {
        backgroundColor: theme.colors.accentSoft
    },
    bannerText: {
        color: theme.colors.textPrimary,
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
        marginTop: 0,
        marginBottom: theme.spacing.sm
    },
    sortTriggerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.xs
    },
    sortTriggerButtonPressed: {
        opacity: 0.82
    },
    sortTriggerText: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontFamily: theme.fonts.bold
    },
    sectionActions: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    searchEmptyState: {
        paddingTop: theme.spacing.xl
    },
    actionButtonDisabled: {
        opacity: 0.55
    },
    viewModeToggleButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent'
    },
    viewModeToggleButtonPressed: {
        opacity: 0.88
    },
    listFooter: {
        paddingTop: theme.spacing.md
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
    loadingContent: {
        paddingTop: theme.spacing.md
    },
    tripListBannerCard: {
        minHeight: 104,
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    tripListBannerCardPressed: {
        opacity: 0.94
    },
    tripListBannerRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'stretch'
    },
    tripListBannerCopy: {
        flex: 1,
        justifyContent: 'center',
        paddingRight: theme.spacing.sm
    },
    tripListBannerEyebrowPill: {
        alignSelf: 'flex-start',
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 4,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    tripListBannerEyebrowText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    tripListBannerTitle: {
        color: theme.colors.textPrimary,
        fontSize: 17,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    tripListBannerBody: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    tripListBannerCtaCard: {
        width: 92,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xs
    },
    tripListBannerCtaText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.accent,
        fontSize: 12,
        textAlign: 'center',
        fontFamily: theme.fonts.semibold
    },
    loadingHeroCard: {
        height: 108,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surfaceMuted,
        marginBottom: theme.spacing.xs
    },
    loadingSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginTop: theme.spacing.md,
        marginBottom: theme.spacing.sm
    },
    loadingSectionCopy: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    loadingTitleBar: {
        width: 88,
        height: 18,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingSubtitleBar: {
        width: 112,
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
        width: 44,
        height: 30,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingTripCard: {
        height: 180,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.sm
    },
    loadingTripCardImage: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingTripCardOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.mode === 'dark' ? 'rgba(10, 10, 10, 0.34)' : 'rgba(18, 18, 18, 0.2)'
    },
    loadingTripCardContent: {
        flex: 1,
        justifyContent: 'flex-end',
        padding: theme.spacing.sm
    },
    loadingChipRow: {
        flexDirection: 'row',
        marginBottom: theme.spacing.xs
    },
    loadingSmallChip: {
        width: 58,
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
    loadingTripTitleBar: {
        width: '72%',
        height: 24,
        borderRadius: theme.radius.full,
        backgroundColor: 'rgba(255,255,255,0.88)'
    },
    loadingTripMetaBar: {
        width: '56%',
        height: 14,
        borderRadius: theme.radius.full,
        backgroundColor: 'rgba(255,255,255,0.62)',
        marginTop: theme.spacing.xs
    },
    loadingTripListRow: {
        minHeight: 104,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center'
    },
    loadingTripFeedRow: {
        minHeight: 144,
        marginBottom: theme.spacing.xs,
        paddingTop: 0,
        paddingBottom: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'stretch',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border
    },
    loadingFeedThumb: {
        width: 88,
        height: 120,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingFeedCopy: {
        flex: 1,
        justifyContent: 'space-between',
        marginLeft: theme.spacing.sm,
        paddingVertical: theme.spacing.micro
    },
    loadingFeedTitleBar: {
        width: '82%',
        height: 22,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingFeedMetaBar: {
        width: '62%',
        height: 14,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingFeedValueBar: {
        width: '34%',
        height: 24,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingListThumb: {
        width: 88,
        height: 88,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingListCopy: {
        flex: 1,
        marginLeft: theme.spacing.sm,
        marginRight: theme.spacing.xs
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
    loadingListActionDot: {
        width: 22,
        height: 22,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    loadingSpinnerWrap: {
        paddingTop: theme.spacing.xs
    },
    stateContent: {
        paddingTop: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.lg
    },
    emptyStateContent: {
        flex: 1
    },
    emptyHomeScroll: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    emptyHomeContent: {
        paddingBottom: theme.spacing.xl
    },
    emptyHomeHero: {
        height: 296,
        overflow: 'hidden',
        borderBottomLeftRadius: theme.radius.lg,
        borderBottomRightRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    emptyHomeHeroImage: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%'
    },
    emptyHomeHeroOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.mode === 'dark'
            ? 'rgba(18,18,18,0.28)'
            : 'rgba(255,255,255,0.34)'
    },
    emptyHomeHeroOverlayCurrentTrip: {
        backgroundColor: theme.mode === 'dark'
            ? 'rgba(0,0,0,0.46)'
            : 'rgba(0,0,0,0.38)'
    },
    emptyHomeHeroCopy: {
        position: 'absolute',
        left: theme.spacing.md,
        right: theme.spacing.md,
        top: 64
    },
    emptyHomeHeroTitle: {
        color: theme.colors.textPrimary,
        fontSize: 26,
        lineHeight: 34,
        fontFamily: theme.fonts.display
    },
    emptyHomeHeroTitleCurrentTrip: {
        color: '#FFFFFF'
    },
    emptyHomeHeroDescription: {
        marginTop: theme.spacing.sm,
        color: theme.colors.textPrimary,
        fontSize: 15,
        lineHeight: 22,
        fontFamily: theme.fonts.medium
    },
    emptyHomeHeroDescriptionCurrentTrip: {
        color: 'rgba(255,255,255,0.92)'
    },
    emptyHomePlanCard: {
        marginTop: -56,
        marginHorizontal: theme.spacing.sm,
        padding: theme.spacing.sm + theme.spacing.micro,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        shadowColor: '#1A1C20',
        shadowOpacity: theme.mode === 'dark' ? 0.22 : 0.12,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: 8
    },
    emptyHomePlanIconWrap: {
        width: 72,
        height: 72,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accentSoft
    },
    emptyHomePlanIconViewport: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
    },
    emptyHomePlanIconSlider: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center'
    },
    emptyHomeCurrentTripIconWrap: {
        backgroundColor: theme.colors.accent
    },
    emptyHomePlanEyebrow: {
        marginTop: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.full,
        overflow: 'hidden',
        color: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.bold,
        textAlign: 'center'
    },
    emptyHomePlanTitle: {
        marginTop: theme.spacing.sm,
        color: theme.colors.textPrimary,
        fontSize: 19,
        lineHeight: 26,
        fontFamily: theme.fonts.bold,
        textAlign: 'center'
    },
    emptyHomePlanDescription: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 21,
        fontFamily: theme.fonts.body,
        textAlign: 'center'
    },
    emptyHomePlanButton: {
        marginTop: theme.spacing.sm,
        minHeight: 48,
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    emptyHomePlanButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        lineHeight: 21,
        fontFamily: theme.fonts.bold
    },
    emptyHomeSectionHeader: {
        marginTop: theme.spacing.sm + theme.spacing.micro,
        marginHorizontal: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    emptyHomeSectionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 19,
        lineHeight: 25,
        fontFamily: theme.fonts.bold
    },
    emptyHomeSectionLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.micro,
        paddingVertical: theme.spacing.xs
    },
    emptyHomeSectionLinkText: {
        color: theme.colors.accent,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    emptyHomeQuickGrid: {
        marginTop: theme.spacing.xs,
        marginHorizontal: theme.spacing.sm,
        flexDirection: 'row',
        gap: theme.spacing.xs
    },
    emptyHomeQuickCard: {
        flex: 1,
        minHeight: 84,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.micro,
        backgroundColor: theme.colors.surface
    },
    emptyHomeQuickCardGreen: {
        backgroundColor: theme.mode === 'dark' ? '#1B2A22' : '#EDF8F2'
    },
    emptyHomeQuickCardPurple: {
        backgroundColor: theme.mode === 'dark' ? '#251F31' : '#F4F0FF'
    },
    emptyHomeQuickCardYellow: {
        backgroundColor: theme.mode === 'dark' ? '#302818' : '#FFF7E6'
    },
    emptyHomeQuickCardRed: {
        backgroundColor: theme.mode === 'dark' ? '#332021' : '#FFF0F2'
    },
    emptyHomeQuickLabel: {
        color: theme.colors.textPrimary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.semibold,
        textAlign: 'center'
    },
    emptyHomeRecommendCard: {
        minHeight: 152,
        marginTop: theme.spacing.sm + theme.spacing.micro,
        marginHorizontal: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden'
    },
    emptyHomeRecommendCopy: {
        width: '72%',
        zIndex: 2
    },
    emptyHomeRecommendTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    emptyHomeRecommendDescription: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 21,
        fontFamily: theme.fonts.body
    },
    emptyHomeRecommendButton: {
        marginTop: theme.spacing.sm,
        minHeight: 38,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.micro,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    emptyHomeRecommendButtonText: {
        color: theme.colors.accent,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.bold
    },
    emptyHomePostcardStack: {
        position: 'absolute',
        right: theme.spacing.sm,
        bottom: theme.spacing.sm,
        width: 152,
        height: 112
    },
    emptyHomePostcard: {
        position: 'absolute',
        width: 72,
        height: 96,
        borderRadius: theme.radius.sm,
        borderWidth: 4,
        borderColor: theme.colors.background,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomePostcardFirst: {
        left: 0,
        bottom: 0,
        transform: [{ rotate: '-5deg' }]
    },
    emptyHomePostcardSecond: {
        left: 40,
        bottom: 0,
        transform: [{ rotate: '8deg' }]
    },
    emptyHomePostcardThird: {
        left: 80,
        bottom: 8,
        transform: [{ rotate: '10deg' }]
    },
    emptyHomeNoticeLink: {
        minHeight: 64,
        marginTop: theme.spacing.sm,
        marginHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    emptyHomeNoticeLinkPressed: {
        opacity: 0.72
    },
    emptyHomeNoticeIconWrap: {
        width: 36,
        height: 36,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accentSoft
    },
    emptyHomeNoticeCopy: {
        flex: 1,
        minWidth: 0
    },
    emptyHomeNoticeTitle: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    emptyHomeNoticeDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 17,
        fontFamily: theme.fonts.body
    },
    emptyHomeLoadingHero: {
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingHeroCopy: {
        position: 'absolute',
        left: theme.spacing.md,
        right: theme.spacing.md,
        top: 72
    },
    emptyHomeLoadingTitleBar: {
        width: 176,
        height: 32,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    emptyHomeLoadingTitleBarShort: {
        width: 128,
        height: 32,
        marginTop: theme.spacing.xs,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    emptyHomeLoadingDescriptionBar: {
        width: 192,
        height: 16,
        marginTop: theme.spacing.md,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    emptyHomeLoadingDescriptionBarShort: {
        width: 152,
        height: 16,
        marginTop: theme.spacing.xs,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    emptyHomeLoadingIconCircle: {
        width: 80,
        height: 80,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingPlanTitleBar: {
        width: 160,
        height: 24,
        marginTop: theme.spacing.md,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingPlanDescriptionBar: {
        width: 208,
        height: 16,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingPlanButtonBar: {
        alignSelf: 'stretch',
        height: 56,
        marginTop: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingSectionRow: {
        marginTop: theme.spacing.md,
        marginHorizontal: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    emptyHomeLoadingSectionTitleBar: {
        width: 144,
        height: 24,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingSectionLinkBar: {
        width: 64,
        height: 16,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingQuickCard: {
        flex: 1,
        minHeight: 96,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        backgroundColor: theme.colors.surface
    },
    emptyHomeLoadingQuickIcon: {
        width: 32,
        height: 32,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingQuickLabel: {
        width: 48,
        height: 12,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingRecommendTitleBar: {
        width: 168,
        height: 24,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingRecommendDescriptionBar: {
        width: 144,
        height: 16,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyHomeLoadingRecommendButtonBar: {
        width: 136,
        height: 40,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    emptyHomeLoadingPostcardStack: {
        position: 'absolute',
        right: theme.spacing.sm,
        bottom: theme.spacing.sm,
        width: 152,
        height: 112
    },
    emptyHomeLoadingPostcard: {
        position: 'absolute',
        width: 72,
        height: 96,
        borderRadius: theme.radius.sm,
        borderWidth: 4,
        borderColor: theme.colors.background,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyTripPrimaryButtonPressed: {
        opacity: 0.9
    },
    tripCreationDisabledNotice: {
        marginTop: theme.spacing.md,
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.medium,
        textAlign: 'center'
    },
    profileSheetBackdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(24, 18, 12, 0.32)'
    },
    profileSheet: {
        maxHeight: '84%',
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm
    },
    profileSheetHandle: {
        alignSelf: 'center',
        width: 48,
        height: 4,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border,
        marginBottom: theme.spacing.sm
    },
    profileSheetEyebrow: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    profileSheetTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 26,
        fontFamily: theme.fonts.display
    },
    profileSheetDescription: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    profileSheetContent: {
        paddingTop: theme.spacing.md,
        gap: theme.spacing.md
    },
    profileSheetAvatarBlock: {
        alignItems: 'center',
        gap: theme.spacing.sm
    },
    profileSheetAvatarWrap: {
        padding: theme.spacing.micro,
        borderRadius: theme.radius.full,
        backgroundColor: theme.mode === 'dark' ? '#2b241e' : '#f4ecdf'
    },
    profilePhotoButton: {
        minHeight: 40,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    profilePhotoButtonText: {
        color: theme.colors.accent,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    profileFieldBlock: {
        gap: theme.spacing.xs
    },
    profileFieldHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm
    },
    profileFieldLabel: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    profileFieldCounter: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    profileNameInput: {
        minHeight: 48,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    profileFieldHint: {
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    profileSheetFooter: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
        paddingTop: theme.spacing.md
    },
    profileSecondaryButton: {
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    profileSecondaryButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    profilePrimaryButton: {
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    profilePrimaryButtonText: {
        color: theme.mode === 'dark' ? '#16120f' : '#fffaf2',
        fontSize: 15,
        fontFamily: theme.fonts.semibold
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
    actionMenuButtonDanger: {
        backgroundColor: theme.mode === 'dark' ? 'rgba(122, 81, 70, 0.18)' : '#fff3ee'
    },
    actionMenuButtonPressed: {
        opacity: 0.88
    },
    actionMenuButtonDisabled: {
        opacity: 0.55
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
    actionMenuLabelDanger: {
        color: theme.colors.warning
    },
    actionMenuHint: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        lineHeight: 19,
        fontFamily: theme.fonts.body
    },
    actionMenuHintDanger: {
        color: theme.mode === 'dark' ? '#d9c0b6' : '#8b5a49'
    },
    actionMenuArrow: {
        color: theme.colors.textSecondary,
        fontSize: 24,
        lineHeight: 24,
        fontFamily: theme.fonts.body
    },
    actionMenuArrowDanger: {
        color: theme.colors.warning
    },
    ownerTransferList: {
        maxHeight: 280
    },
    ownerTransferListContent: {
        gap: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    ownerTransferOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    ownerTransferOptionSelected: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    ownerTransferAvatar: {
        width: 38,
        height: 38,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface
    },
    ownerTransferAvatarText: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
    ownerTransferCopy: {
        flex: 1,
        minWidth: 0
    },
    ownerTransferName: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    ownerTransferHint: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    ownerTransferError: {
        marginTop: theme.spacing.xs,
        color: theme.colors.warning,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.medium
    },
    ownerTransferActions: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.sm
    },
    ownerTransferSecondaryButton: {
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    ownerTransferSecondaryText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    ownerTransferPrimaryButton: {
        flex: 1.4,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    ownerTransferPrimaryText: {
        color: '#ffffff',
        fontSize: 14,
        fontFamily: theme.fonts.bold
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
    }
});
