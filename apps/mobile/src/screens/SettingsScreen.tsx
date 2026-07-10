import React from 'react';
import {
    Animated,
    Easing,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarImage } from '@/components/AvatarImage';
import { BottomNavBar } from '@/components/BottomNavBar';
import { EmptyState } from '@/components/EmptyState';
import { useAdapters } from '@/adapters/useAdapters';
import { Alert } from '@/feedback';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import {
    type PickedProfilePhotoAsset,
    pickProfilePhotoAsset,
    uploadProfilePhotoAsset
} from '@/services/profile-photo-upload';
import {
    getActivePlanMarketplaceSubscriptionProductId,
    isPlanMarketplacePurchaseConfigured,
    isPurchaseCancelledError,
    presentPlanMarketplaceCustomerCenter,
    purchasePlanMarketplacePackage,
    refreshActivePlanMarketplaceSubscription,
    restorePlanMarketplacePostPurchase
} from '@/services/plan-marketplace-purchases';
import { usePrimaryScrollActivityReporter } from '@/state/primary-scroll-activity';
import { publishTripCreated, publishTripDeleted } from '@/state/trip-write-sync';
import { type AppTheme, type FontPreset, useAppTheme, useThemePreference } from '@/theme';
import type { MobileTripSummary } from '@/types/trip';
import { getNativeStoreLabel } from '@/utils/native-store-copy';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type SubscriptionPackage = 'monthly' | 'yearly';
type SubscriptionSheetMode = 'idle' | 'active';

const TERMS_URL = 'https://plin.ink/terms';
const SUBSCRIPTION_TERMS_URL = 'https://plin.ink/subscription-terms';
const PRIVACY_URL = 'https://plin.ink/privacy';
const COMPANY_URL = 'https://plin.ink/company';
const LOCATION_TERMS_URL = 'https://plin.ink/location-terms';
const OPERATION_POLICY_URL = 'https://plin.ink/operation-policy';
const YOUTH_PROTECTION_POLICY_URL = 'https://plin.ink/youth-protection-policy';
const KAKAO_SUPPORT_CHAT_URL = 'http://pf.kakao.com/_duxdTX/chat';
const PROFILE_NAME_MAX_LENGTH = 24;
const FONT_PRESET_OPTIONS: Array<{ value: FontPreset; title: string; description: string }> = [
    {
        value: 'pretendard',
        title: '기본',
        description: 'Pretendard'
    },
    {
        value: 'memoment',
        title: '손글씨',
        description: 'Memoment 꾹꾹체'
    }
];
const SUBSCRIPTION_PLAN_OPTIONS: ReadonlyArray<{
    value: SubscriptionPackage;
    title: string;
    price: string;
    description: string;
    badge?: string;
}> = [
    {
        value: 'monthly',
        title: '월간 구독',
        price: '월 3,900원',
        description: '필요한 달에 가볍게 이용해요.',
        badge: '첫 달 무료'
    },
    {
        value: 'yearly',
        title: '연간 구독',
        price: '연 41,900원',
        description: '계속 쓸 계획이라면 더 알뜰해요.',
        badge: '약 10% 절약'
    }
];

function resolveSubscriptionPackageFromProductId(productId: string | null | undefined): SubscriptionPackage | null {
    const normalizedProductId = String(productId || '').trim().toLowerCase();
    if (!normalizedProductId) {
        return null;
    }

    if (normalizedProductId.includes('year') || normalizedProductId.includes('annual')) {
        return 'yearly';
    }

    if (normalizedProductId.includes('month')) {
        return 'monthly';
    }

    return null;
}
const SUPPORT_POLICY_LINKS: ReadonlyArray<{
    label: string;
    url: string;
    icon: keyof typeof Ionicons.glyphMap;
}> = [
    {
        label: '카카오톡 문의',
        url: KAKAO_SUPPORT_CHAT_URL,
        icon: 'chatbubble-ellipses-outline'
    },
    {
        label: '회사/사업자 정보',
        url: COMPANY_URL,
        icon: 'business-outline'
    },
    {
        label: '이용약관',
        url: TERMS_URL,
        icon: 'document-text-outline'
    },
    {
        label: '유료서비스 약관',
        url: SUBSCRIPTION_TERMS_URL,
        icon: 'card-outline'
    },
    {
        label: '위치기반서비스 약관',
        url: LOCATION_TERMS_URL,
        icon: 'location-outline'
    },
    {
        label: '운영정책',
        url: OPERATION_POLICY_URL,
        icon: 'shield-checkmark-outline'
    },
    {
        label: '청소년보호정책',
        url: YOUTH_PROTECTION_POLICY_URL,
        icon: 'heart-outline'
    },
    {
        label: '개인정보처리방침',
        url: PRIVACY_URL,
        icon: 'lock-closed-outline'
    }
];
const SUBSCRIPTION_LEGAL_LINKS: ReadonlyArray<{
    label: string;
    title: string;
    url: string;
}> = [
    {
        label: '유료서비스 약관',
        title: '유료서비스 약관',
        url: SUBSCRIPTION_TERMS_URL
    },
    {
        label: '개인정보처리방침',
        title: '개인정보처리방침',
        url: PRIVACY_URL
    },
    {
        label: '서비스 이용약관',
        title: '서비스 이용약관',
        url: TERMS_URL
    }
];

function buildFallbackSummary(user: ReturnType<typeof useAuthSession>['user']) {
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

    return email || 'PLIN 사용자';
}

function getEditableProfileName(summary: { displayName: string | null; email: string | null }) {
    const displayName = summary.displayName?.trim() || '';
    if (displayName) {
        return displayName;
    }

    return getProfilePrimaryLabel(summary);
}

function formatTrashDate(value: string | null | undefined) {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function buildTrashTripCaption(trip: MobileTripSummary) {
    const deletedAtLabel = formatTrashDate(trip.deletedAt);
    const purgeAfterLabel = formatTrashDate(trip.purgeAfter);

    if (deletedAtLabel && purgeAfterLabel) {
        return `${deletedAtLabel} 삭제 · ${purgeAfterLabel}까지 보관`;
    }

    if (purgeAfterLabel) {
        return `${purgeAfterLabel}까지 보관`;
    }

    return '삭제한 일정';
}

function buildTrashTripMeta(trip: MobileTripSummary) {
    return trip.subInfo || trip.dayCount || '일정 정보 없음';
}

export function SettingsScreen({ navigation, route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const {
        scrollRef: profileEditorScrollRef,
        createFocusHandler: createProfileEditorFocusHandler,
        keyboardAwareContentInsetStyle: profileEditorKeyboardInsetStyle,
        scrollViewProps: profileEditorScrollViewProps
    } = useKeyboardAwareInputScroll(112);
    const {
        user,
        profileSummary,
        refreshSession,
        authActionError,
        isAuthActionLoading,
        updateProfilePhoto,
        updateProfileDisplayName
    } = useAuthSession();
    const { tripRepository } = useAdapters();
    const {
        isDarkModeEnabled,
        fontPreset,
        isThemePreferenceLoading,
        setDarkModeEnabled,
        setFontPreset
    } = useThemePreference();
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isProfileEditorVisible, setIsProfileEditorVisible] = React.useState(false);
    const [draftDisplayName, setDraftDisplayName] = React.useState('');
    const [draftPhotoPreviewUri, setDraftPhotoPreviewUri] = React.useState<string | null>(null);
    const [pendingPhotoAsset, setPendingPhotoAsset] = React.useState<PickedProfilePhotoAsset | null>(null);
    const [hasDraftPhotoChange, setHasDraftPhotoChange] = React.useState(false);
    const [isProfileEditorSaving, setIsProfileEditorSaving] = React.useState(false);
    const [isFontPresetModalVisible, setIsFontPresetModalVisible] = React.useState(false);
    const [isSubscriptionSheetVisible, setIsSubscriptionSheetVisible] = React.useState(false);
    const [isSubscriptionActionLoading, setIsSubscriptionActionLoading] = React.useState(false);
    const [subscriptionSheetMode, setSubscriptionSheetMode] = React.useState<SubscriptionSheetMode>('idle');
    const [activeSubscriptionProductId, setActiveSubscriptionProductId] = React.useState<string | null>(null);
    const [selectedSubscriptionPackage, setSelectedSubscriptionPackage] = React.useState<SubscriptionPackage>('monthly');
    const [isSupportPolicyOpen, setIsSupportPolicyOpen] = React.useState(false);
    const [isTrashSheetVisible, setIsTrashSheetVisible] = React.useState(false);
    const [deletedTrips, setDeletedTrips] = React.useState<MobileTripSummary[]>([]);
    const [isTrashLoading, setIsTrashLoading] = React.useState(false);
    const [trashError, setTrashError] = React.useState<string | null>(null);
    const [trashBusyTripId, setTrashBusyTripId] = React.useState<string | null>(null);
    const subscriptionIconScales = React.useRef([
        new Animated.Value(1.16),
        new Animated.Value(0.82),
        new Animated.Value(0.82)
    ]).current;
    const { notifyPrimaryScrollActivity, scrollEventThrottle } = usePrimaryScrollActivityReporter();

    const summary = profileSummary || buildFallbackSummary(user);
    const isPendingDeletion = summary?.accountStatus === 'pending_deletion';
    const profilePrimaryLabel = getProfilePrimaryLabel(summary ?? { displayName: null, email: null });
    const editableProfileName = getEditableProfileName(summary ?? { displayName: null, email: null });
    const trimmedDraftDisplayName = draftDisplayName.trim();
    const hasDraftDisplayName = trimmedDraftDisplayName.length > 0;
    const hasProfileChanges = hasDraftPhotoChange
        || trimmedDraftDisplayName !== editableProfileName;
    const isProfileEditorBusy = isProfileEditorSaving || isAuthActionLoading;
    const activeFontPresetOption = React.useMemo(
        () => FONT_PRESET_OPTIONS.find((option) => option.value === fontPreset) || FONT_PRESET_OPTIONS[0],
        [fontPreset]
    );
    const selectedSubscriptionPlan = React.useMemo(
        () => SUBSCRIPTION_PLAN_OPTIONS.find((option) => option.value === selectedSubscriptionPackage)
            || SUBSCRIPTION_PLAN_OPTIONS[0],
        [selectedSubscriptionPackage]
    );
    const activeSubscriptionPlan = React.useMemo(() => {
        const activePackage = resolveSubscriptionPackageFromProductId(activeSubscriptionProductId);
        return SUBSCRIPTION_PLAN_OPTIONS.find((option) => option.value === activePackage) || null;
    }, [activeSubscriptionProductId]);
    const nativeStoreLabel = getNativeStoreLabel();
    const subscriptionIconAnimatedStyles = React.useMemo(
        () => subscriptionIconScales.map((scale) => ({
            transform: [{ scale }],
            opacity: scale.interpolate({
                inputRange: [0.82, 1.16],
                outputRange: [0.72, 1],
                extrapolate: 'clamp'
            })
        })),
        [subscriptionIconScales]
    );

    React.useEffect(() => {
        const setIconScales = (values: [number, number, number]) => {
            values.forEach((value, index) => {
                subscriptionIconScales[index].setValue(value);
            });
        };

        if (!isSubscriptionSheetVisible) {
            subscriptionIconScales.forEach((scale) => {
                scale.stopAnimation();
            });
            setIconScales([1.16, 0.82, 0.82]);
            return undefined;
        }

        const transitionTo = (values: [number, number, number]) => Animated.parallel(
            values.map((value, index) => Animated.timing(subscriptionIconScales[index], {
                toValue: value,
                duration: 840,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true
            }))
        );

        setIconScales([1.16, 0.82, 0.82]);
        const animation = Animated.loop(
            Animated.sequence([
                Animated.delay(520),
                transitionTo([0.82, 1.16, 0.82]),
                Animated.delay(520),
                transitionTo([0.82, 0.82, 1.16]),
                Animated.delay(520),
                transitionTo([1.16, 0.82, 0.82])
            ])
        );
        animation.start();

        return () => {
            animation.stop();
        };
    }, [isSubscriptionSheetVisible, subscriptionIconScales]);

    const handleRefresh = React.useCallback(async () => {
        setIsRefreshing(true);
        try {
            await refreshSession();
        } finally {
            setIsRefreshing(false);
        }
    }, [refreshSession]);

    const handleToggleDarkMode = React.useCallback(async (nextValue: boolean) => {
        await setDarkModeEnabled(nextValue);
    }, [setDarkModeEnabled]);

    const handleSelectFontPreset = React.useCallback(async (nextValue: FontPreset) => {
        setIsFontPresetModalVisible(false);
        await setFontPreset(nextValue);
    }, [setFontPreset]);

    const openFontPresetModal = React.useCallback(() => {
        setIsFontPresetModalVisible(true);
    }, []);

    const closeFontPresetModal = React.useCallback(() => {
        setIsFontPresetModalVisible(false);
    }, []);

    const loadDeletedTrips = React.useCallback(async () => {
        if (!user?.uid) {
            setDeletedTrips([]);
            return;
        }

        setIsTrashLoading(true);
        setTrashError(null);
        try {
            const nextDeletedTrips = await tripRepository.listDeletedTrips(user.uid);
            setDeletedTrips(nextDeletedTrips);
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : '삭제한 일정을 불러오지 못했어요.';
            setTrashError(message);
        } finally {
            setIsTrashLoading(false);
        }
    }, [tripRepository, user?.uid]);

    const openTrashSheet = React.useCallback(() => {
        setIsTrashSheetVisible(true);
        void loadDeletedTrips();
    }, [loadDeletedTrips]);

    const closeTrashSheet = React.useCallback(() => {
        if (trashBusyTripId) {
            return;
        }

        setIsTrashSheetVisible(false);
    }, [trashBusyTripId]);

    const handleRestoreDeletedTrip = React.useCallback((trip: MobileTripSummary) => {
        if (!user?.uid || trashBusyTripId) {
            return;
        }

        Alert.alert(
            '일정을 복구할까요?',
            `"${trip.title}" 일정이 다시 목록에 나타나요.`,
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '복구',
                    onPress: () => {
                        void (async () => {
                            setTrashBusyTripId(trip.id);
                            setTrashError(null);
                            try {
                                const restoredTrip = await tripRepository.restoreDeletedTrip(user.uid, trip.id);
                                setDeletedTrips((currentTrips) => currentTrips.filter((entry) => entry.id !== trip.id));
                                if (restoredTrip) {
                                    publishTripCreated(restoredTrip);
                                }
                                Alert.alert('복구했어요', '일정 목록에서 다시 확인해요.');
                            } catch (error) {
                                const message = error instanceof Error && error.message
                                    ? error.message
                                    : '일정을 복구하지 못했어요.';
                                setTrashError(message);
                                Alert.alert('복구 실패', message);
                            } finally {
                                setTrashBusyTripId(null);
                            }
                        })();
                    }
                }
            ]
        );
    }, [trashBusyTripId, tripRepository, user?.uid]);

    const handlePermanentlyDeleteTrip = React.useCallback((trip: MobileTripSummary) => {
        if (!user?.uid || trashBusyTripId) {
            return;
        }

        Alert.alert(
            '영구 삭제할까요?',
            `"${trip.title}" 일정과 사진, 첨부 파일을 완전히 삭제해요. 이 작업은 되돌릴 수 없어요.`,
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '영구 삭제',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            setTrashBusyTripId(trip.id);
                            setTrashError(null);
                            try {
                                await tripRepository.permanentlyDeleteTrip(user.uid, trip.id);
                                setDeletedTrips((currentTrips) => currentTrips.filter((entry) => entry.id !== trip.id));
                                publishTripDeleted(trip.id);
                            } catch (error) {
                                const message = error instanceof Error && error.message
                                    ? error.message
                                    : '일정을 영구 삭제하지 못했어요.';
                                setTrashError(message);
                                Alert.alert('영구 삭제 실패', message);
                            } finally {
                                setTrashBusyTripId(null);
                            }
                        })();
                    }
                }
            ]
        );
    }, [trashBusyTripId, tripRepository, user?.uid]);

    const handleOpenExternalLink = React.useCallback((url: string, title?: string) => {
        navigation.navigate('InAppBrowser', { url, title });
    }, [navigation]);

    const handleOpenSubscriptionCenter = React.useCallback(async () => {
        if (!user?.uid) {
            Alert.alert('로그인이 필요해요.', '구독 관리는 로그인 후 이용해요.');
            return;
        }

        if (!isPlanMarketplacePurchaseConfigured()) {
            Alert.alert('구독 화면을 열 수 없어요', '잠시 후 다시 시도해 주세요.');
            return;
        }

        try {
            const refreshedSubscriptionProductId = await refreshActivePlanMarketplaceSubscription({ userId: user.uid })
                .then((response) => response.subscription?.productId || null)
                .catch(() => null);
            const activeSubscriptionProductId = refreshedSubscriptionProductId
                || await getActivePlanMarketplaceSubscriptionProductId();
            setActiveSubscriptionProductId(activeSubscriptionProductId);
            const activePackage = resolveSubscriptionPackageFromProductId(activeSubscriptionProductId);
            if (activePackage) {
                setSelectedSubscriptionPackage(activePackage);
            }
            setSubscriptionSheetMode(activeSubscriptionProductId ? 'active' : 'idle');
            setIsSubscriptionSheetVisible(true);
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : '구독 관리 화면을 열지 못했어요.';
            Alert.alert('구독 관리를 열지 못했어요', message);
        }
    }, [user?.uid]);

    React.useEffect(() => {
        if (!route.params?.openSubscription) {
            return;
        }

        navigation.setParams({ openSubscription: false });
        void handleOpenSubscriptionCenter();
    }, [handleOpenSubscriptionCenter, navigation, route.params?.openSubscription]);

    const closeSubscriptionSheet = React.useCallback(() => {
        if (isSubscriptionActionLoading) {
            return;
        }

        setIsSubscriptionSheetVisible(false);
    }, [isSubscriptionActionLoading]);

    const handleManageActiveSubscription = React.useCallback(async () => {
        if (!user?.uid) {
            Alert.alert('로그인이 필요해요.', '구독 관리는 로그인 후 이용해요.');
            return;
        }

        setIsSubscriptionActionLoading(true);
        try {
            await presentPlanMarketplaceCustomerCenter({ userId: user.uid });
            await refreshSession();
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : '구독 관리 화면을 열지 못했어요.';
            Alert.alert('구독 관리를 열지 못했어요', message, undefined, { presentation: 'native' });
        } finally {
            setIsSubscriptionActionLoading(false);
        }
    }, [refreshSession, user?.uid]);

    const handleStartSubscription = React.useCallback(async (packageIdentifier: 'monthly' | 'yearly') => {
        if (!user?.uid) {
            Alert.alert('로그인이 필요해요.', '구독은 로그인 후 이용해요.');
            return;
        }

        setIsSubscriptionActionLoading(true);
        try {
            const purchaseResult = await purchasePlanMarketplacePackage({
                userId: user.uid,
                postId: 'plin-plus',
                productId: '',
                packageIdentifier
            });
            setIsSubscriptionSheetVisible(false);
            setSubscriptionSheetMode('active');
            setActiveSubscriptionProductId(purchaseResult.subscription?.productId || packageIdentifier);
            await refreshSession();
            Alert.alert('PLIN Plus 활성화', 'PLIN Plus를 바로 이용해요.');
        } catch (error) {
            if (isPurchaseCancelledError(error)) {
                return;
            }

            const message = error instanceof Error && error.message
                ? error.message
                : '구독을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.';
            Alert.alert('구독을 시작하지 못했어요', message, undefined, { presentation: 'native' });
        } finally {
            setIsSubscriptionActionLoading(false);
        }
    }, [refreshSession, user?.uid]);

    const handleRestoreSubscription = React.useCallback(async () => {
        if (!user?.uid) {
            Alert.alert('로그인이 필요해요.', '구독 복원은 로그인 후 이용해요.');
            return;
        }

        setIsSubscriptionActionLoading(true);
        try {
            await restorePlanMarketplacePostPurchase({
                userId: user.uid,
                postId: 'plin-plus',
                productId: ''
            });
            setIsSubscriptionSheetVisible(false);
            const nextActiveSubscriptionProductId = await getActivePlanMarketplaceSubscriptionProductId().catch(() => null);
            setActiveSubscriptionProductId(nextActiveSubscriptionProductId);
            setSubscriptionSheetMode(nextActiveSubscriptionProductId ? 'active' : 'idle');
            await refreshSession();
            Alert.alert('구독을 복원했어요.', 'PLIN Plus를 바로 이용해요.');
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : '복원할 구독 내역을 찾지 못했어요.';
            Alert.alert('구독을 복원하지 못했어요', message, undefined, { presentation: 'native' });
        } finally {
            setIsSubscriptionActionLoading(false);
        }
    }, [refreshSession, user?.uid]);

    const openProfileEditor = React.useCallback(() => {
        setDraftDisplayName(editableProfileName);
        setDraftPhotoPreviewUri(summary?.photoURL || null);
        setPendingPhotoAsset(null);
        setHasDraftPhotoChange(false);
        setIsProfileEditorVisible(true);
    }, [editableProfileName, summary?.photoURL]);

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
            setHasDraftPhotoChange(true);
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
            if (hasDraftPhotoChange) {
                if (!pendingPhotoAsset) {
                    throw new Error('선택한 프로필 사진을 다시 확인해 주세요.');
                }

                const uploadedUrl = await uploadProfilePhotoAsset({
                    uid: user.uid,
                    asset: pendingPhotoAsset
                });
                await updateProfilePhoto(uploadedUrl);
                setPendingPhotoAsset(null);
                setDraftPhotoPreviewUri(uploadedUrl);
                setHasDraftPhotoChange(false);
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
        hasDraftPhotoChange,
        hasDraftDisplayName,
        hasProfileChanges,
        pendingPhotoAsset,
        trimmedDraftDisplayName,
        updateProfileDisplayName,
        updateProfilePhoto,
        user
    ]);

    if (!user || !summary) {
        return (
            <View style={styles.shell}>
                <SafeAreaView edges={['top']} style={styles.screenBody}>
                    <View style={styles.stateContent}>
                        <EmptyState
                            title="세션을 다시 확인해 주세요."
                            description="설정 화면을 열기 전에 로그인 상태를 다시 확인해야 해요."
                            actionLabel="세션 다시 확인"
                            onAction={() => {
                                void handleRefresh();
                            }}
                        />
                    </View>
                </SafeAreaView>
                <BottomNavBar activeTab="Settings" />
            </View>
        );
    }

    return (
        <View style={styles.shell}>
            <SafeAreaView edges={['top']} style={styles.screenBody}>
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={styles.content}
                    onScroll={notifyPrimaryScrollActivity}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={() => {
                                void handleRefresh();
                            }}
                            tintColor={theme.colors.accent}
                            colors={[theme.colors.accent]}
                        />
                    }
                    scrollEventThrottle={scrollEventThrottle}
                >
                    <Pressable
                        accessibilityRole="button"
                        onPress={openProfileEditor}
                        style={({ pressed }) => [
                            styles.profileCard,
                            pressed ? styles.actionPressed : null
                        ]}
                    >
                        <View style={styles.profileIdentityRow}>
                            <View style={styles.profileAvatarFrame}>
                                <AvatarImage
                                    uri={summary.photoURL}
                                    label={profilePrimaryLabel}
                                    size={56}
                                    textSize={22}
                                    tone={isPendingDeletion ? 'warning' : 'accent'}
                                />
                            </View>
                            <View style={styles.profileCopy}>
                                <Text style={styles.profileName}>{profilePrimaryLabel}</Text>
                                <Text style={styles.profileDescription}>
                                    프로필 사진과 이름을 바꿀 수 있어요.
                                </Text>
                            </View>
                            <View style={styles.rowTrailing}>
                                {isPendingDeletion ? (
                                    <View style={styles.warningBadge}>
                                        <Text style={styles.warningBadgeText}>삭제 처리 중</Text>
                                    </View>
                                ) : null}
                                <Ionicons
                                    name="chevron-forward"
                                    size={20}
                                    color={theme.colors.textSecondary}
                                />
                            </View>
                        </View>
                    </Pressable>

                    {authActionError ? (
                        <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                            <Text style={[styles.noticeText, styles.noticeTextWarning]}>
                                {authActionError}
                            </Text>
                        </View>
                    ) : null}

                    {isPendingDeletion ? (
                        <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                            <Text style={styles.noticeTitle}>계정 삭제 진행 중</Text>
                            <Text style={[styles.noticeText, styles.noticeTextWarning]}>
                                계정과 업로드한 데이터 삭제를 처리하고 있어요.
                            </Text>
                        </View>
                    ) : null}

                    <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>설정</Text>
                        <View style={styles.groupCard}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => navigation.navigate('SettingsAccount')}
                                style={({ pressed }) => [
                                    styles.menuRow,
                                    pressed ? styles.actionPressed : null
                                ]}
                            >
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>설정</Text>
                                    <Text style={styles.rowDescription}>
                                        로그인 수단, 로그아웃, 계정 삭제를 관리해요.
                                    </Text>
                                </View>
                                <Ionicons
                                    name="chevron-forward"
                                    size={20}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                    void handleOpenSubscriptionCenter();
                                }}
                                style={({ pressed }) => [
                                    styles.menuRow,
                                    styles.menuRowDivider,
                                    pressed ? styles.actionPressed : null
                                ]}
                            >
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>PLIN Plus</Text>
                                    <Text style={styles.rowDescription}>
                                        구독을 시작하거나 결제 관리를 열어요.
                                    </Text>
                                </View>
                                <Ionicons
                                    name="chevron-forward"
                                    size={20}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                onPress={openTrashSheet}
                                style={({ pressed }) => [
                                    styles.menuRow,
                                    styles.menuRowDivider,
                                    pressed ? styles.actionPressed : null
                                ]}
                            >
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>삭제한 일정</Text>
                                    <Text style={styles.rowDescription}>
                                        30일 동안 보관된 일정을 복구하거나 완전히 비워요.
                                    </Text>
                                </View>
                                <Ionicons
                                    name="chevron-forward"
                                    size={20}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                        </View>
                    </View>

                    <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>개인 설정</Text>
                        <View style={styles.groupCard}>
                            <View style={styles.settingRow}>
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>다크 모드</Text>
                                    <Text style={styles.rowDescription}>
                                        이 앱에서 사용할 테마를 저장해 둬요.
                                    </Text>
                                </View>
                                <Switch
                                    value={isDarkModeEnabled}
                                    disabled={isThemePreferenceLoading}
                                    onValueChange={(nextValue) => {
                                        void handleToggleDarkMode(nextValue);
                                    }}
                                    trackColor={{
                                        false: theme.mode === 'dark' ? '#4b3f34' : '#d8c9b3',
                                        true: theme.colors.accent
                                    }}
                                    thumbColor={theme.mode === 'dark' ? '#f5ede2' : '#fffdf9'}
                                    ios_backgroundColor={theme.mode === 'dark' ? '#4b3f34' : '#d8c9b3'}
                                />
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isThemePreferenceLoading}
                                onPress={openFontPresetModal}
                                style={({ pressed }) => [
                                    styles.menuRow,
                                    styles.menuRowDivider,
                                    isThemePreferenceLoading ? styles.actionDisabled : null,
                                    pressed && !isThemePreferenceLoading ? styles.actionPressed : null
                                ]}
                            >
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>폰트 스타일</Text>
                                    <Text style={styles.rowDescription}>
                                        이 앱에서 사용할 글꼴 분위기를 저장해 둬요.
                                    </Text>
                                </View>
                                <View style={styles.rowTrailing}>
                                    <Text style={styles.rowValue}>{activeFontPresetOption.title}</Text>
                                    <Ionicons
                                        name="chevron-forward"
                                        size={20}
                                        color={theme.colors.textSecondary}
                                    />
                                </View>
                            </Pressable>
                        </View>
                    </View>

                    <View style={styles.sectionBlock}>
                        <Text style={styles.sectionLabel}>지원</Text>
                        <View style={styles.groupCard}>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ expanded: isSupportPolicyOpen }}
                                onPress={() => {
                                    setIsSupportPolicyOpen((currentValue) => !currentValue);
                                }}
                                style={({ pressed }) => [
                                    styles.menuRow,
                                    pressed ? styles.actionPressed : null
                                ]}
                            >
                                <View style={styles.rowCopy}>
                                    <Text style={styles.rowTitle}>문의/운영정책</Text>
                                    <Text style={styles.rowDescription}>
                                        문의와 약관을 한곳에서 확인해요.
                                    </Text>
                                </View>
                                <Ionicons
                                    name={isSupportPolicyOpen ? 'chevron-up' : 'chevron-down'}
                                    size={20}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                            {isSupportPolicyOpen ? (
                                <View style={styles.supportPolicyPanel}>
                                    {SUPPORT_POLICY_LINKS.map((item) => {
                                        const isSupportLink = item.url === KAKAO_SUPPORT_CHAT_URL;

                                        return (
                                            <Pressable
                                                key={item.label}
                                                accessibilityRole="link"
                                                onPress={() => {
                                                    handleOpenExternalLink(item.url, item.label);
                                                }}
                                                style={({ pressed }) => [
                                                    styles.supportPolicyLink,
                                                    pressed ? styles.actionPressed : null
                                                ]}
                                            >
                                                <Ionicons
                                                    name={item.icon}
                                                    size={18}
                                                    color={isSupportLink
                                                        ? theme.colors.accent
                                                        : theme.colors.textSecondary}
                                                />
                                                <Text style={[
                                                    styles.supportPolicyLinkText,
                                                    isSupportLink ? styles.supportPolicyLinkTextPrimary : null
                                                ]}>
                                                    {item.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ) : null}
                        </View>
                    </View>
                </ScrollView>
            </SafeAreaView>
            <Modal
                animationType="slide"
                transparent
                visible={isProfileEditorVisible}
                onRequestClose={closeProfileEditor}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                        <Text style={styles.profileSheetTitle}>프로필 설정</Text>
                        <Text style={styles.profileSheetDescription}>
                            프로필 사진과 이름을 바꿔요.
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
                                        isProfileEditorBusy ? styles.actionDisabled : null,
                                        pressed && !isProfileEditorBusy ? styles.actionPressed : null
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
                                    일정 공유와 기록에 보일 이름이에요.
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
                                    pressed && !isProfileEditorBusy ? styles.actionPressed : null
                                ]}
                            >
                                <Text style={styles.profileSecondaryButtonText}>닫기</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isProfileEditorBusy || !hasDraftDisplayName}
                                onPress={() => {
                                    void handleSaveProfile();
                                }}
                                style={({ pressed }) => [
                                    styles.profilePrimaryButton,
                                    isProfileEditorBusy || !hasDraftDisplayName
                                        ? styles.actionDisabled
                                        : null,
                                    pressed && !isProfileEditorBusy && hasDraftDisplayName
                                        ? styles.actionPressed
                                        : null
                                ]}
                            >
                                <Text style={styles.profilePrimaryButtonText}>
                                    {isProfileEditorBusy ? '저장 중' : '저장'}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            <Modal
                animationType="slide"
                transparent
                visible={isFontPresetModalVisible}
                onRequestClose={closeFontPresetModal}
            >
                <View style={styles.profileSheetBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={closeFontPresetModal}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.profileSheet, { paddingBottom: insets.bottom + theme.spacing.md }]}>
                        <View style={styles.profileSheetHandle} />
                        <Text style={styles.profileSheetEyebrow}>개인 설정</Text>
                        <Text style={styles.profileSheetTitle}>폰트 스타일</Text>
                        <Text style={styles.profileSheetDescription}>
                            이 앱에서 사용할 글꼴 분위기를 저장해 둬요.
                        </Text>

                        <View style={styles.fontPresetModalOptionList}>
                            {FONT_PRESET_OPTIONS.map((option) => {
                                const isSelected = fontPreset === option.value;
                                return (
                                    <Pressable
                                        key={option.value}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${option.title} 폰트 사용`}
                                        disabled={isThemePreferenceLoading}
                                        onPress={() => {
                                            void handleSelectFontPreset(option.value);
                                        }}
                                        style={({ pressed }) => [
                                            styles.fontPresetModalOption,
                                            isSelected ? styles.fontPresetModalOptionSelected : null,
                                            isThemePreferenceLoading ? styles.actionDisabled : null,
                                            pressed && !isThemePreferenceLoading ? styles.actionPressed : null
                                        ]}
                                    >
                                        <View style={styles.rowCopy}>
                                            <Text style={styles.fontPresetModalOptionTitle}>{option.title}</Text>
                                            <Text style={styles.fontPresetModalOptionDescription}>{option.description}</Text>
                                        </View>
                                        <Ionicons
                                            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                                            size={20}
                                            color={isSelected ? theme.colors.accent : theme.colors.textSecondary}
                                        />
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View style={styles.profileSheetFooter}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={closeFontPresetModal}
                                style={({ pressed }) => [
                                    styles.profileSecondaryButton,
                                    pressed ? styles.actionPressed : null
                                ]}
                            >
                                <Text style={styles.profileSecondaryButtonText}>닫기</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
            <Modal
                animationType="slide"
                transparent
                visible={isTrashSheetVisible}
                onRequestClose={closeTrashSheet}
            >
                <View style={styles.profileSheetBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        disabled={Boolean(trashBusyTripId)}
                        onPress={closeTrashSheet}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.profileSheet, styles.trashSheet, { paddingBottom: insets.bottom + theme.spacing.md }]}>
                        <View style={styles.profileSheetHandle} />
                        <Text style={styles.profileSheetEyebrow}>휴지통</Text>
                        <Text style={styles.profileSheetTitle}>삭제한 일정</Text>
                        <Text style={styles.profileSheetDescription}>
                            삭제한 일정은 30일 동안 보관돼요. 복구하거나 바로 완전히 비울 수 있어요.
                        </Text>

                        <View style={styles.trashToolbar}>
                            <Text style={styles.trashCountText}>{deletedTrips.length}개 보관 중</Text>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isTrashLoading || Boolean(trashBusyTripId)}
                                onPress={() => {
                                    void loadDeletedTrips();
                                }}
                                style={({ pressed }) => [
                                    styles.trashRefreshButton,
                                    isTrashLoading || trashBusyTripId ? styles.actionDisabled : null,
                                    pressed && !isTrashLoading && !trashBusyTripId ? styles.actionPressed : null
                                ]}
                            >
                                <Ionicons name="refresh" size={16} color={theme.colors.accent} />
                                <Text style={styles.trashRefreshButtonText}>새로고침</Text>
                            </Pressable>
                        </View>

                        {trashError ? (
                            <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                                <Text style={[styles.noticeText, styles.noticeTextWarning]}>{trashError}</Text>
                            </View>
                        ) : null}

                        <ScrollView
                            contentContainerStyle={styles.trashListContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {isTrashLoading && !deletedTrips.length ? (
                                <View style={styles.trashStateBox}>
                                    <Ionicons name="hourglass-outline" size={28} color={theme.colors.textSecondary} />
                                    <Text style={styles.trashStateTitle}>삭제한 일정을 불러오고 있어요</Text>
                                </View>
                            ) : null}

                            {!isTrashLoading && !deletedTrips.length ? (
                                <View style={styles.trashStateBox}>
                                    <Ionicons name="archive-outline" size={30} color={theme.colors.textSecondary} />
                                    <Text style={styles.trashStateTitle}>삭제한 일정이 없어요</Text>
                                    <Text style={styles.trashStateDescription}>
                                        일정을 삭제하면 이곳에서 다시 복구해요.
                                    </Text>
                                </View>
                            ) : null}

                            {deletedTrips.map((trip) => {
                                const isBusy = trashBusyTripId === trip.id;

                                return (
                                    <View key={trip.id} style={styles.trashTripCard}>
                                        <View style={styles.trashTripHeader}>
                                            <View style={styles.rowCopy}>
                                                <Text style={styles.trashTripTitle} numberOfLines={2}>{trip.title}</Text>
                                                <Text style={styles.trashTripMeta} numberOfLines={2}>
                                                    {buildTrashTripMeta(trip)}
                                                </Text>
                                                <Text style={styles.trashTripRetention}>{buildTrashTripCaption(trip)}</Text>
                                            </View>
                                        </View>
                                        <View style={styles.trashTripActions}>
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={Boolean(trashBusyTripId)}
                                                onPress={() => handleRestoreDeletedTrip(trip)}
                                                style={({ pressed }) => [
                                                    styles.trashRestoreButton,
                                                    trashBusyTripId ? styles.actionDisabled : null,
                                                    pressed && !trashBusyTripId ? styles.actionPressed : null
                                                ]}
                                            >
                                                <Text style={styles.trashRestoreButtonText}>
                                                    {isBusy ? '처리 중' : '복구'}
                                                </Text>
                                            </Pressable>
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={Boolean(trashBusyTripId)}
                                                onPress={() => handlePermanentlyDeleteTrip(trip)}
                                                style={({ pressed }) => [
                                                    styles.trashDeleteButton,
                                                    trashBusyTripId ? styles.actionDisabled : null,
                                                    pressed && !trashBusyTripId ? styles.actionPressed : null
                                                ]}
                                            >
                                                <Text style={styles.trashDeleteButtonText}>
                                                    {isBusy ? '처리 중' : '영구 삭제'}
                                                </Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                );
                            })}
                        </ScrollView>

                        <View style={styles.profileSheetFooter}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={Boolean(trashBusyTripId)}
                                onPress={closeTrashSheet}
                                style={({ pressed }) => [
                                    styles.profileSecondaryButton,
                                    pressed && !trashBusyTripId ? styles.actionPressed : null
                                ]}
                            >
                                <Text style={styles.profileSecondaryButtonText}>닫기</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
            <Modal
                animationType="slide"
                transparent
                visible={isSubscriptionSheetVisible}
                onRequestClose={closeSubscriptionSheet}
            >
                <View style={styles.profileSheetBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        disabled={isSubscriptionActionLoading}
                        onPress={closeSubscriptionSheet}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.subscriptionSheet, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
                        <View style={styles.subscriptionSheetHandle} />
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="구독 화면 닫기"
                            disabled={isSubscriptionActionLoading}
                            onPress={closeSubscriptionSheet}
                            style={({ pressed }) => [
                                styles.subscriptionCloseButton,
                                pressed && !isSubscriptionActionLoading ? styles.actionPressed : null
                            ]}
                        >
                            <Ionicons name="close" size={28} color={theme.colors.textPrimary} />
                        </Pressable>

                        <ScrollView
                            contentContainerStyle={styles.subscriptionScrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.subscriptionIntroBlock}>
                                <View style={styles.subscriptionIntroIconRow}>
                                    <Animated.View style={[styles.subscriptionIntroIcon, subscriptionIconAnimatedStyles[0]]}>
                                        <Ionicons name="compass" size={24} color={theme.colors.accent} />
                                    </Animated.View>
                                    <Animated.View style={[styles.subscriptionIntroIcon, subscriptionIconAnimatedStyles[1]]}>
                                        <Ionicons name="map" size={22} color={theme.colors.accent} />
                                    </Animated.View>
                                    <Animated.View style={[styles.subscriptionIntroIcon, subscriptionIconAnimatedStyles[2]]}>
                                        <Ionicons name="airplane" size={22} color={theme.colors.accent} />
                                    </Animated.View>
                                </View>
                                <Text style={styles.subscriptionHeroLabel}>PLIN Plus</Text>
                                <Text style={styles.subscriptionIntroTitle}>
                                    {subscriptionSheetMode === 'active' ? 'PLIN Plus 이용 중' : 'PLIN Plus 무료 체험'}
                                </Text>
                                <Text style={styles.subscriptionIntroDescription}>
                                    {subscriptionSheetMode === 'active'
                                        ? `결제와 해지는 ${nativeStoreLabel}에서 관리돼요. PLIN에서는 이용 상태만 확인해요.`
                                        : `첫 달은 무료예요. ${nativeStoreLabel} 계정으로 시작하고, 마음에 드는 플랜을 내 일정으로 가져와요.`}
                                </Text>
                            </View>

                            {subscriptionSheetMode === 'active' ? (
                                <View style={styles.subscriptionActiveCard}>
                                    <View style={styles.subscriptionActiveIconWrap}>
                                        <Ionicons name="checkmark" size={22} color={theme.colors.accent} />
                                    </View>
                                    <View style={styles.subscriptionPlanCopy}>
                                        <Text style={styles.subscriptionPlanTitle}>PLIN Plus 활성화됨</Text>
                                        <Text style={styles.subscriptionPlanPrice}>
                                            {activeSubscriptionPlan?.price || '구독 중'}
                                        </Text>
                                        <Text style={styles.subscriptionPlanDescription}>
                                            결제 상태, 갱신일, 해지는 {nativeStoreLabel} 구독 관리에서 확인해요.
                                        </Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.subscriptionActionList}>
                                    {SUBSCRIPTION_PLAN_OPTIONS.map((option) => {
                                        const isSelected = selectedSubscriptionPackage === option.value;

                                        return (
                                            <Pressable
                                                key={option.value}
                                                accessibilityRole="radio"
                                                accessibilityState={{ checked: isSelected, disabled: isSubscriptionActionLoading }}
                                                disabled={isSubscriptionActionLoading}
                                                onPress={() => {
                                                    setSelectedSubscriptionPackage(option.value);
                                                }}
                                                style={({ pressed }) => [
                                                    styles.subscriptionPlanCard,
                                                    isSelected ? styles.subscriptionPlanCardSelected : null,
                                                    isSubscriptionActionLoading ? styles.actionDisabled : null,
                                                    pressed && !isSubscriptionActionLoading ? styles.actionPressed : null
                                                ]}
                                            >
                                                <Ionicons
                                                    name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                                                    size={24}
                                                    color={isSelected ? theme.colors.accent : theme.colors.textSecondary}
                                                />
                                                <View style={styles.subscriptionPlanCopy}>
                                                    <View style={styles.subscriptionPlanTitleRow}>
                                                        <Text style={styles.subscriptionPlanTitle}>{option.title}</Text>
                                                        {option.badge ? (
                                                            <View style={[
                                                                styles.subscriptionPlanBadge,
                                                                isSelected ? styles.subscriptionPlanBadgeSelected : null
                                                            ]}>
                                                                <Text style={[
                                                                    styles.subscriptionPlanBadgeText,
                                                                    isSelected ? styles.subscriptionPlanBadgeTextSelected : null
                                                                ]}>
                                                                    {option.badge}
                                                                </Text>
                                                            </View>
                                                        ) : null}
                                                    </View>
                                                    <Text style={styles.subscriptionPlanPrice}>{option.price}</Text>
                                                    <Text style={styles.subscriptionPlanDescription}>{option.description}</Text>
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            )}

                            <View style={styles.subscriptionBenefitList}>
                                <Text style={styles.subscriptionBenefitHeading}>PLIN Plus에 포함된 것</Text>
                                <View style={styles.subscriptionBenefitRow}>
                                    <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
                                    <Text style={styles.subscriptionBenefitText}>PLIN Plus 플랜 열람</Text>
                                </View>
                                <View style={styles.subscriptionBenefitRow}>
                                    <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
                                    <Text style={styles.subscriptionBenefitText}>마음에 드는 플랜을 내 일정으로 가져오기</Text>
                                </View>
                                <View style={styles.subscriptionBenefitRow}>
                                    <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
                                    <Text style={styles.subscriptionBenefitText}>일정 전 바로 쓸 수 있는 구성</Text>
                                </View>
                                <View style={styles.subscriptionBenefitRow}>
                                    <Ionicons name="checkmark" size={20} color={theme.colors.accent} />
                                    <Text style={styles.subscriptionBenefitText}>새 플랜 계속 이용</Text>
                                </View>
                            </View>

                            {subscriptionSheetMode === 'active' ? null : (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isSubscriptionActionLoading}
                                    onPress={() => {
                                        void handleRestoreSubscription();
                                    }}
                                    style={({ pressed }) => [
                                        styles.subscriptionGhostButton,
                                        isSubscriptionActionLoading ? styles.actionDisabled : null,
                                        pressed && !isSubscriptionActionLoading ? styles.actionPressed : null
                                    ]}
                                >
                                    <Text style={styles.subscriptionGhostButtonText}>이미 구독했다면 복원</Text>
                                </Pressable>
                            )}
                        </ScrollView>

                        <View style={styles.subscriptionStickyFooter}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSubscriptionActionLoading}
                                onPress={() => {
                                    if (subscriptionSheetMode === 'active') {
                                        void handleManageActiveSubscription();
                                        return;
                                    }

                                    void handleStartSubscription(selectedSubscriptionPackage);
                                }}
                                style={({ pressed }) => [
                                    styles.subscriptionPrimaryButton,
                                    isSubscriptionActionLoading ? styles.actionDisabled : null,
                                    pressed && !isSubscriptionActionLoading ? styles.actionPressed : null
                                ]}
                            >
                                <Ionicons name="sparkles" size={18} color={theme.mode === 'dark' ? '#16120f' : '#fffaf2'} />
                                <Text style={styles.subscriptionPrimaryButtonText}>
                                    {isSubscriptionActionLoading
                                        ? '처리 중'
                                        : subscriptionSheetMode === 'active'
                                            ? `${nativeStoreLabel}에서 구독 관리`
                                            : `1개월 무료로 시작하기 · ${selectedSubscriptionPlan.price}`}
                                </Text>
                            </Pressable>
                            <Text style={styles.subscriptionFootnote}>
                                {subscriptionSheetMode === 'active'
                                    ? `갱신, 해지, 결제 수단 변경은 ${nativeStoreLabel} 구독 관리에서 진행해요.`
                                    : `첫 달 무료 후 ${selectedSubscriptionPlan.price}로 자동 갱신돼요. 해지는 ${nativeStoreLabel} 구독 관리에서 할 수 있고, 최종 금액과 기간은 ${nativeStoreLabel} 결제 화면에서 확인해요.`}
                            </Text>
                            <View style={styles.subscriptionLegalLinks}>
                                {SUBSCRIPTION_LEGAL_LINKS.map((item) => (
                                    <Pressable
                                        key={item.url}
                                        accessibilityRole="link"
                                        onPress={() => {
                                            handleOpenExternalLink(item.url, item.title);
                                        }}
                                        style={({ pressed }) => [
                                            styles.subscriptionTermsLink,
                                            pressed ? styles.actionPressed : null
                                        ]}
                                    >
                                        <Text style={styles.subscriptionTermsLinkText}>{item.label}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
            <BottomNavBar activeTab="Settings" />
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
    content: {
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.md
    },
    stateContent: {
        flex: 1,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.md
    },
    profileCard: {
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    profileIdentityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm
    },
    profileAvatarFrame: {
        padding: theme.spacing.micro,
        borderRadius: theme.radius.full,
        backgroundColor: theme.mode === 'dark' ? '#2b241e' : '#f4ecdf'
    },
    profileCopy: {
        flex: 1
    },
    profileName: {
        color: theme.colors.textPrimary,
        fontSize: 22,
        lineHeight: 26,
        fontFamily: theme.fonts.bold
    },
    profileDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    noticeCard: {
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md
    },
    noticeCardWarning: {
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    noticeTitle: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
    noticeText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    noticeTextWarning: {
        color: theme.colors.warning
    },
    sectionBlock: {
        marginBottom: theme.spacing.sm
    },
    sectionLabel: {
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    groupCard: {
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden'
    },
    menuRow: {
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm
    },
    menuRowDivider: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    settingRow: {
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm
    },
    rowCopy: {
        flex: 1
    },
    rowTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    rowDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    rowValue: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    rowTrailing: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    supportPolicyPanel: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    supportPolicyLink: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs
    },
    supportPolicyLinkText: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        lineHeight: 18,
        fontFamily: theme.fonts.semibold
    },
    supportPolicyLinkTextPrimary: {
        color: theme.colors.accent
    },
    fontPresetModalOptionList: {
        marginTop: theme.spacing.md,
        gap: theme.spacing.xs
    },
    fontPresetModalOption: {
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    fontPresetModalOptionSelected: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    fontPresetModalOptionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    fontPresetModalOptionDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    subscriptionSheet: {
        height: '92%',
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        backgroundColor: theme.colors.background,
        overflow: 'hidden'
    },
    subscriptionSheetHandle: {
        position: 'absolute',
        top: theme.spacing.xs,
        alignSelf: 'center',
        zIndex: 3,
        width: 54,
        height: 5,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    subscriptionCloseButton: {
        position: 'absolute',
        top: theme.spacing.md,
        right: theme.spacing.md,
        zIndex: 2,
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    subscriptionScrollContent: {
        paddingTop: theme.spacing.xxl,
        paddingBottom: theme.spacing.md
    },
    subscriptionHeroLabel: {
        marginTop: theme.spacing.sm,
        color: theme.colors.accent,
        fontSize: 15,
        lineHeight: 20,
        fontFamily: theme.fonts.bold
    },
    subscriptionIntroBlock: {
        paddingHorizontal: theme.spacing.md,
        paddingRight: theme.spacing.xxxl
    },
    subscriptionIntroIconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    subscriptionIntroIcon: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    subscriptionIntroIconSmall: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    subscriptionIntroTitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontSize: 24,
        lineHeight: 30,
        fontFamily: theme.fonts.display
    },
    subscriptionIntroDescription: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 15,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    subscriptionActionList: {
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.md,
        gap: theme.spacing.xs
    },
    subscriptionPlanCard: {
        minHeight: 92,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    subscriptionPlanCardSelected: {
        borderWidth: 2,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    subscriptionActiveCard: {
        minHeight: 112,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        marginHorizontal: theme.spacing.md,
        marginTop: theme.spacing.md,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    subscriptionActiveIconWrap: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.background
    },
    subscriptionPlanCopy: {
        flex: 1
    },
    subscriptionPlanTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    subscriptionPlanTitle: {
        color: theme.colors.textPrimary,
        fontSize: 17,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    subscriptionPlanBadge: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    subscriptionPlanBadgeSelected: {
        backgroundColor: theme.colors.accent
    },
    subscriptionPlanBadgeText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    subscriptionPlanBadgeTextSelected: {
        color: theme.mode === 'dark' ? '#16120f' : '#fffaf2'
    },
    subscriptionPlanDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 17,
        fontFamily: theme.fonts.body
    },
    subscriptionPlanPrice: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 20,
        fontFamily: theme.fonts.bold
    },
    subscriptionBenefitList: {
        marginTop: theme.spacing.md,
        marginHorizontal: theme.spacing.md,
        gap: theme.spacing.sm
    },
    subscriptionBenefitHeading: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    subscriptionBenefitRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.xs
    },
    subscriptionBenefitText: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontSize: 15,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    subscriptionGhostButton: {
        minHeight: 44,
        marginHorizontal: theme.spacing.md,
        marginTop: theme.spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md
    },
    subscriptionGhostButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    subscriptionStickyFooter: {
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    subscriptionPrimaryButton: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    subscriptionPrimaryButtonText: {
        color: theme.mode === 'dark' ? '#16120f' : '#fffaf2',
        fontSize: 15,
        fontFamily: theme.fonts.bold
    },
    subscriptionFootnote: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    subscriptionTermsLink: {
        alignSelf: 'center',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro
    },
    subscriptionLegalLinks: {
        marginTop: theme.spacing.xs,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: theme.spacing.xs,
        rowGap: theme.spacing.micro
    },
    subscriptionTermsLinkText: {
        color: theme.colors.accent,
        textAlign: 'center',
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.semibold
    },
    warningBadge: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.mode === 'dark' ? '#40231e' : '#fff0e8'
    },
    warningBadgeText: {
        color: theme.colors.warning,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
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
    trashSheet: {
        height: '86%'
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
    trashToolbar: {
        minHeight: 44,
        marginTop: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm
    },
    trashCountText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.medium
    },
    trashRefreshButton: {
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    trashRefreshButtonText: {
        color: theme.colors.accent,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    trashListContent: {
        paddingTop: theme.spacing.sm,
        gap: theme.spacing.xs
    },
    trashStateBox: {
        minHeight: 180,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        padding: theme.spacing.md
    },
    trashStateTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        textAlign: 'center',
        fontFamily: theme.fonts.semibold
    },
    trashStateDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
        fontFamily: theme.fonts.body
    },
    trashTripCard: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background
    },
    trashTripHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.sm
    },
    trashTripTitle: {
        color: theme.colors.textPrimary,
        fontSize: 17,
        lineHeight: 23,
        fontFamily: theme.fonts.bold
    },
    trashTripMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    trashTripRetention: {
        marginTop: theme.spacing.xs,
        color: theme.colors.warning,
        fontSize: 12,
        lineHeight: 17,
        fontFamily: theme.fonts.semibold
    },
    trashTripActions: {
        marginTop: theme.spacing.sm,
        flexDirection: 'row',
        gap: theme.spacing.xs
    },
    trashRestoreButton: {
        flex: 1,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    trashRestoreButtonText: {
        color: theme.mode === 'dark' ? '#16120f' : '#fffaf2',
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    trashDeleteButton: {
        flex: 1,
        minHeight: 42,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    trashDeleteButtonText: {
        color: theme.colors.warning,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
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
    actionPressed: {
        opacity: 0.88
    },
    actionDisabled: {
        opacity: 0.5
    }
});
