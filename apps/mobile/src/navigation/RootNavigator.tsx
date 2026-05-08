import React from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { DefaultTheme, NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdapters } from '@/adapters/useAdapters';
import { requiresEmailVerification } from '@/auth/email-verification';
import {
    hasAcceptedMandatoryTerms,
    isMandatoryAgreementStateResolved
} from '@/auth/mandatory-agreement';
import { Alert } from '@/feedback';
import { useAuthSession } from '@/hooks/useAuthSession';
import { AuthGateScreen } from '@/screens/AuthGateScreen';
import { CommunityPostDetailScreen } from '@/screens/CommunityPostDetailScreen';
import { CommunityScreen } from '@/screens/CommunityScreen';
import { EmailAuthScreen } from '@/screens/EmailAuthScreen';
import { EmojiDiagnosticsScreen } from '@/screens/EmojiDiagnosticsScreen';
import { InAppBrowserScreen } from '@/screens/InAppBrowserScreen';
import { SettingsAccountScreen } from '@/screens/SettingsAccountScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { acceptTripInvite } from '@/services/trip-invites';
import { configureTripReminderNotifications } from '@/services/trip-reminders';
import { PublicTripViewScreen } from '@/screens/PublicTripViewScreen';
import { TripCreateScreen } from '@/screens/TripCreateScreen';
import { TripDetailScreen } from '@/screens/TripDetailScreen';
import { TripInfoEditScreen } from '@/screens/TripInfoEditScreen';
import { TripListScreen } from '@/screens/TripListScreen';
import { TripPartnerBookingScreen } from '@/screens/TripPartnerBookingScreen';
import { TimelineItemEditScreen } from '@/screens/TimelineItemEditScreen';
import { useConnectivityStatus } from '@/state/connectivity-store';
import { publishTripCreated } from '@/state/trip-write-sync';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTimelineItemEditInput, MobileTripInfoInput } from '@/types/trip';
import {
    clearMobileWebAuthInProgressProvider,
    clearPendingInviteToken,
    getDefaultMobileWebRelativeUrl,
    isMobileWebAuthCallbackPath,
    readPendingInviteToken,
    replaceCurrentMobileWebUrl,
    storePendingInviteToken,
    takePendingAuthReturnTo
} from '@/utils/mobile-web-session';
import {
    readPublicTripTokenFromUrl,
    readTripInviteTokenFromUrl
} from '@/utils/trip-invite-link';

export type RootTabKey = 'Home' | 'TripList' | 'Community' | 'Settings';

export type RootStackParamList = {
    HomeBoot: undefined;
    AuthGate: undefined;
    EmailAuth: undefined;
    Home: undefined;
    TripList: undefined;
    Community: undefined;
    Settings: undefined;
    SettingsAccount: undefined;
    InAppBrowser: { url: string; title?: string };
    EmojiDiagnostics: undefined;
    TripCreate: undefined;
    FlightBooking: undefined;
    StayBooking: undefined;
    ActivityBooking: undefined;
    TripDetail: {
        tripId: string;
        startInTimelineEditMode?: boolean;
        startInCommunityPublishFlow?: boolean;
    };
    CommunityPostDetail: { postId: string };
    PublicTripView: { token: string };
    TripInfoEdit: {
        tripId: string;
        initialInput: MobileTripInfoInput;
        initialPreviewImage?: string | null;
        photoGalleryUrls?: string[];
    };
    TimelineItemEdit: {
        tripId: string;
        tripTitle: string;
        dayId: string;
        itemId: string;
        itemIndex: number;
        itemTitle: string;
        dayLabel: string;
        dayDate: string;
        isMemo: boolean;
        isTransit: boolean;
        initialInput: MobileTimelineItemEditInput;
        existingTripAttachmentCount?: number;
    };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function buildRootTabScreenOptions(title: string) {
    return {
        title,
        animation: 'none'
    } as const;
}

function getInviteErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
        if (/Cannot read propert|Cannot read properties|startDate|editInfo/i.test(error.message)) {
            return '초대받은 여행 데이터를 불러오는 중 문제가 생겼어요. 앱을 다시 열고 다시 시도해 주세요.';
        }

        return error.message;
    }

    return '초대 링크를 처리하지 못했어요.';
}

function HomeBootSkeletonScreen() {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createHomeBootSkeletonStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const heroEdgeStyle = React.useMemo(() => ({
        height: 320 + insets.top
    }), [insets.top]);
    const heroCopyStyle = React.useMemo(() => ({
        top: 72 + insets.top
    }), [insets.top]);
    const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 24) : insets.bottom;
    const bottomNavInsetStyle = React.useMemo(() => ({
        paddingBottom: bottomInset + theme.spacing.micro
    }), [bottomInset, theme.spacing.micro]);

    return (
        <View style={styles.shell}>
            <View style={styles.screenBody}>
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.hero, heroEdgeStyle]}>
                        <View style={[styles.heroCopy, heroCopyStyle]}>
                            <View style={styles.titleBar} />
                            <View style={styles.titleBarShort} />
                            <View style={styles.descriptionBar} />
                            <View style={styles.descriptionBarShort} />
                        </View>
                    </View>

                    <View style={styles.planCard}>
                        <View style={styles.iconCircle} />
                        <View style={styles.planTitleBar} />
                        <View style={styles.planDescriptionBar} />
                        <View style={styles.planButtonBar} />
                    </View>

                    <View style={styles.recommendCard}>
                        <View style={styles.recommendCopy}>
                            <View style={styles.recommendTitleBar} />
                            <View style={styles.recommendDescriptionBar} />
                            <View style={styles.recommendButtonBar} />
                        </View>
                        <View style={styles.postcardStack}>
                            <View style={[styles.postcard, styles.postcardFirst]} />
                            <View style={[styles.postcard, styles.postcardSecond]} />
                            <View style={[styles.postcard, styles.postcardThird]} />
                        </View>
                    </View>
                </ScrollView>
            </View>
            <View style={[styles.bottomNavWrap, bottomNavInsetStyle]}>
                <View style={styles.bottomNavBar}>
                    {[0, 1, 2, 3].map((item) => (
                        <View key={item} style={styles.bottomNavItem}>
                            <View style={[
                                styles.bottomNavIcon,
                                item === 0 ? styles.bottomNavIconActive : null
                            ]} />
                            <View style={[
                                styles.bottomNavLabel,
                                item === 0 ? styles.bottomNavLabelActive : null
                            ]} />
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

export function RootNavigator() {
    const theme = useAppTheme();
    const {
        status,
        user,
        profileSummary,
        isSessionHydrating,
        isProfileSummaryLoading
    } = useAuthSession();
    const { isOfflineMode } = useConnectivityStatus();
    const { tripRepository } = useAdapters();
    const navigationRef = useNavigationContainerRef<RootStackParamList>();
    const isWaitingForProfileGate = isSessionHydrating
        || (Boolean(user) && isProfileSummaryLoading && !profileSummary);
    const shouldDeferMandatoryAgreementGate = Boolean(user)
        && isOfflineMode
        && !isMandatoryAgreementStateResolved(user, profileSummary);
    const needsMandatoryAgreement = Boolean(user)
        && !requiresEmailVerification(user)
        && !hasAcceptedMandatoryTerms(profileSummary)
        && !shouldDeferMandatoryAgreementGate;
    const needsEmailVerification = requiresEmailVerification(user);
    const isRootBooting = status === 'booting' || isWaitingForProfileGate;
    const [isNavigationReady, setIsNavigationReady] = React.useState(false);
    const [pendingInviteToken, setPendingInviteToken] = React.useState<string | null>(null);
    const [pendingPublicTripToken, setPendingPublicTripToken] = React.useState<string | null>(null);
    const processingInviteTokenRef = React.useRef<string | null>(null);
    const hasCleanedMobileWebUrlRef = React.useRef(false);

    React.useEffect(() => {
        void configureTripReminderNotifications();
    }, []);

    React.useEffect(() => {
        void SplashScreen.hideAsync().catch(() => {});
    }, []);

    const queueInviteToken = React.useCallback((url: string | null | undefined) => {
        const inviteToken = readTripInviteTokenFromUrl(url || '');
        if (!inviteToken) {
            return;
        }

        if (Platform.OS === 'web') {
            storePendingInviteToken(inviteToken);
        }

        setPendingInviteToken((currentToken) => (
            currentToken === inviteToken ? currentToken : inviteToken
        ));
    }, []);

    const queuePublicTripToken = React.useCallback((url: string | null | undefined) => {
        const publicTripToken = readPublicTripTokenFromUrl(url || '');
        if (!publicTripToken) {
            return;
        }

        setPendingPublicTripToken((currentToken) => (
            currentToken === publicTripToken ? currentToken : publicTripToken
        ));
    }, []);

    const queueDeepLink = React.useCallback((url: string | null | undefined) => {
        queueInviteToken(url);
        queuePublicTripToken(url);
    }, [queueInviteToken, queuePublicTripToken]);

    React.useEffect(() => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') {
            return;
        }

        const persistedInviteToken = readPendingInviteToken();
        if (persistedInviteToken) {
            setPendingInviteToken((currentToken) => currentToken || persistedInviteToken);
        }

        if (hasCleanedMobileWebUrlRef.current) {
            return;
        }

        const currentUrl = window.location.href;
        const hasDeepLinkTokenInUrl = Boolean(
            readTripInviteTokenFromUrl(currentUrl)
            || readPublicTripTokenFromUrl(currentUrl)
        );
        const isAuthCallbackUrl = isMobileWebAuthCallbackPath(window.location.pathname);

        if (!hasDeepLinkTokenInUrl && !isAuthCallbackUrl) {
            return;
        }

        hasCleanedMobileWebUrlRef.current = true;
        queueDeepLink(currentUrl);

        if (isAuthCallbackUrl) {
            replaceCurrentMobileWebUrl(takePendingAuthReturnTo() || getDefaultMobileWebRelativeUrl());
            clearMobileWebAuthInProgressProvider();
            return;
        }

        replaceCurrentMobileWebUrl(getDefaultMobileWebRelativeUrl());
    }, [queueDeepLink]);

    React.useEffect(() => {
        void Linking.getInitialURL()
            .then((url) => {
                queueDeepLink(url);
            })
            .catch(() => {});

        const subscription = Linking.addEventListener('url', (event) => {
            queueDeepLink(event.url);
        });

        return () => {
            subscription.remove();
        };
    }, [queueDeepLink]);

    const navigationTheme = React.useMemo(() => ({
        ...DefaultTheme,
        colors: {
            ...DefaultTheme.colors,
            background: theme.colors.background,
            card: theme.colors.surface,
            text: theme.colors.textPrimary,
            primary: theme.colors.accent,
            border: theme.colors.border
        }
    }), [theme]);

    const canProcessInviteToken = (
        Boolean(user)
        && !isWaitingForProfileGate
        && !needsEmailVerification
        && !needsMandatoryAgreement
        && status !== 'booting'
        && isNavigationReady
    );
    const canProcessPublicTripToken = (
        !isWaitingForProfileGate
        && status !== 'booting'
        && isNavigationReady
    );

    React.useEffect(() => {
        if (!pendingPublicTripToken || !canProcessPublicTripToken || !navigationRef.isReady()) {
            return;
        }

        const publicTripToken = pendingPublicTripToken;
        setPendingPublicTripToken((currentToken) => (
            currentToken === publicTripToken ? null : currentToken
        ));

        const currentRoute = navigationRef.getCurrentRoute();
        const currentToken = currentRoute?.name === 'PublicTripView'
            ? String((currentRoute.params as RootStackParamList['PublicTripView'] | undefined)?.token || '')
            : '';

        if (currentRoute?.name !== 'PublicTripView' || currentToken !== publicTripToken) {
            navigationRef.navigate('PublicTripView', {
                token: publicTripToken
            });
        }
    }, [canProcessPublicTripToken, navigationRef, pendingPublicTripToken]);

    React.useEffect(() => {
        if (!pendingInviteToken || !canProcessInviteToken) {
            return;
        }

        if (processingInviteTokenRef.current === pendingInviteToken) {
            return;
        }

        const inviteToken = pendingInviteToken;
        let isCancelled = false;
        processingInviteTokenRef.current = inviteToken;

        void acceptTripInvite(inviteToken)
            .then(({ tripId }) => {
                if (isCancelled) {
                    return;
                }

                setPendingInviteToken((currentToken) => (
                    currentToken === inviteToken ? null : currentToken
                ));
                clearPendingInviteToken(inviteToken);

                if (!navigationRef.isReady()) {
                    return;
                }

                const currentRoute = navigationRef.getCurrentRoute();
                const currentTripId = currentRoute?.name === 'TripDetail'
                    ? String((currentRoute.params as RootStackParamList['TripDetail'] | undefined)?.tripId || '')
                    : '';

                if (currentRoute?.name !== 'TripDetail' || currentTripId !== tripId) {
                    navigationRef.navigate('TripDetail', {
                        tripId
                    });
                }

                const currentUserId = String(user?.uid || '').trim();
                if (!currentUserId) {
                    return;
                }

                void tripRepository.getTripDetail(currentUserId, tripId)
                    .then((detail) => {
                        if (isCancelled || !detail) {
                            return;
                        }

                        publishTripCreated(detail);
                    })
                    .catch((error) => {
                        console.warn('[invite] trip hydration after accept failed', error);
                    });
            })
            .catch((error) => {
                if (isCancelled) {
                    return;
                }

                setPendingInviteToken((currentToken) => (
                    currentToken === inviteToken ? null : currentToken
                ));
                clearPendingInviteToken(inviteToken);
                Alert.alert('초대 링크 처리 실패', getInviteErrorMessage(error));
            })
            .finally(() => {
                if (processingInviteTokenRef.current === inviteToken) {
                    processingInviteTokenRef.current = null;
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [canProcessInviteToken, navigationRef, pendingInviteToken, tripRepository, user?.uid]);

    return (
        <NavigationContainer
            ref={navigationRef}
            theme={navigationTheme}
            onReady={() => {
                setIsNavigationReady(true);
            }}
        >
            <Stack.Navigator
                screenOptions={{
                    headerShadowVisible: false,
                    headerTintColor: theme.colors.textPrimary,
                    headerTitleAlign: 'center',
                    headerBackButtonDisplayMode: 'minimal',
                    headerTitleStyle: {
                        color: theme.colors.textPrimary,
                        fontSize: 18,
                        fontFamily: theme.fonts.semibold
                    },
                    headerStyle: {
                        backgroundColor: theme.colors.background
                    },
                    contentStyle: {
                        backgroundColor: theme.colors.background
                    }
                }}
            >
                {isRootBooting ? (
                    <Stack.Screen
                        name="HomeBoot"
                        component={HomeBootSkeletonScreen}
                        options={{
                            title: '홈',
                            animation: 'none',
                            headerShown: false
                        }}
                    />
                ) : null}

                {!isRootBooting && (!user || needsEmailVerification || needsMandatoryAgreement) ? (
                    <>
                        <Stack.Screen
                            name="AuthGate"
                            component={AuthGateScreen}
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="EmailAuth"
                            component={EmailAuthScreen}
                            options={{ headerShown: false }}
                        />
                    </>
                ) : null}

                {!isRootBooting && user && !needsEmailVerification && !needsMandatoryAgreement ? (
                    <>
                        <Stack.Screen
                            name="Home"
                            component={TripListScreen}
                            options={{
                                ...buildRootTabScreenOptions('홈'),
                                headerShown: false
                            }}
                        />
                        <Stack.Screen
                            name="TripList"
                            component={TripListScreen}
                            options={{
                                ...buildRootTabScreenOptions('여행'),
                                headerShown: false
                            }}
                        />
                        <Stack.Screen
                            name="Community"
                            component={CommunityScreen}
                            options={{
                                ...buildRootTabScreenOptions('커뮤니티'),
                                headerShown: false
                            }}
                        />
                        <Stack.Screen
                            name="Settings"
                            component={SettingsScreen}
                            options={{
                                ...buildRootTabScreenOptions('설정'),
                                headerShown: false
                            }}
                        />
                        <Stack.Screen
                            name="SettingsAccount"
                            component={SettingsAccountScreen}
                            options={{ title: '설정' }}
                        />
                        {__DEV__ ? (
                            <Stack.Screen
                                name="EmojiDiagnostics"
                                component={EmojiDiagnosticsScreen}
                                options={{ title: 'Emoji Diagnostics' }}
                            />
                        ) : null}
                        <Stack.Screen
                            name="TripDetail"
                            component={TripDetailScreen}
                            options={{ title: '여행 상세' }}
                        />
                        <Stack.Screen
                            name="TripCreate"
                            component={TripCreateScreen}
                            options={{ title: '새 여행 만들기' }}
                        />
                        <Stack.Screen
                            name="FlightBooking"
                            component={TripPartnerBookingScreen}
                            options={{ title: '항공편 등록' }}
                        />
                        <Stack.Screen
                            name="StayBooking"
                            component={TripPartnerBookingScreen}
                            options={{ title: '숙소 예약' }}
                        />
                        <Stack.Screen
                            name="ActivityBooking"
                            component={TripPartnerBookingScreen}
                            options={{ title: '액티비티 예약' }}
                        />
                        <Stack.Screen
                            name="CommunityPostDetail"
                            component={CommunityPostDetailScreen}
                            options={{ title: '커뮤니티 상세' }}
                        />
                        <Stack.Screen
                            name="TripInfoEdit"
                            component={TripInfoEditScreen}
                            options={{
                                title: '여행 정보',
                                headerBackButtonMenuEnabled: false
                            }}
                        />
                        <Stack.Screen
                            name="TimelineItemEdit"
                            component={TimelineItemEditScreen}
                            options={({ route }) => ({
                                title: route.params.isMemo
                                    ? '메모 수정'
                                    : route.params.isTransit
                                        ? '이동 수정'
                                        : '일정 수정',
                                headerShown: false,
                                gestureEnabled: false,
                                presentation: 'transparentModal',
                                animation: 'fade',
                                contentStyle: {
                                    backgroundColor: 'transparent'
                                }
                            })}
                        />
                    </>
                ) : null}
                <Stack.Screen
                    name="InAppBrowser"
                    component={InAppBrowserScreen}
                    options={{
                        headerShown: false,
                        presentation: 'modal'
                    }}
                />
                <Stack.Screen
                    name="PublicTripView"
                    component={PublicTripViewScreen}
                    options={{ title: '공유 여행' }}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}

const createHomeBootSkeletonStyles = (theme: AppTheme) => StyleSheet.create({
    shell: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    screenBody: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    scroll: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    content: {
        paddingBottom: theme.spacing.lg
    },
    hero: {
        position: 'relative',
        overflow: 'hidden',
        borderBottomLeftRadius: theme.radius.xl,
        borderBottomRightRadius: theme.radius.xl,
        backgroundColor: theme.colors.surfaceMuted
    },
    heroCopy: {
        position: 'absolute',
        left: theme.spacing.md,
        right: theme.spacing.md
    },
    titleBar: {
        width: 176,
        height: 32,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    titleBarShort: {
        width: 128,
        height: 32,
        marginTop: theme.spacing.xs,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    descriptionBar: {
        width: 192,
        height: 16,
        marginTop: theme.spacing.md,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    descriptionBarShort: {
        width: 152,
        height: 16,
        marginTop: theme.spacing.xs,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface
    },
    planCard: {
        marginHorizontal: theme.spacing.sm,
        marginTop: -theme.spacing.xl,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.xxl,
        paddingBottom: theme.spacing.md,
        alignItems: 'center',
        borderRadius: theme.radius.xl,
        backgroundColor: theme.mode === 'dark' ? '#151516' : '#FFFFFF',
        shadowColor: '#000000',
        shadowOpacity: theme.mode === 'dark' ? 0.28 : 0.08,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: 5
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    planTitleBar: {
        width: 160,
        height: 24,
        marginTop: theme.spacing.md,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    planDescriptionBar: {
        width: 208,
        height: 16,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    planButtonBar: {
        alignSelf: 'stretch',
        height: 56,
        marginTop: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    recommendCard: {
        position: 'relative',
        minHeight: 160,
        marginHorizontal: theme.spacing.sm,
        marginTop: theme.spacing.md,
        padding: theme.spacing.md,
        overflow: 'hidden',
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    recommendCopy: {
        width: '56%'
    },
    recommendTitleBar: {
        width: 168,
        height: 24,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    recommendDescriptionBar: {
        width: 144,
        height: 16,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    recommendButtonBar: {
        width: 136,
        height: 40,
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    postcardStack: {
        position: 'absolute',
        right: theme.spacing.sm,
        bottom: theme.spacing.sm,
        width: 152,
        height: 112
    },
    postcard: {
        position: 'absolute',
        width: 72,
        height: 96,
        borderWidth: 4,
        borderRadius: theme.radius.sm,
        borderColor: theme.colors.background,
        backgroundColor: theme.colors.surfaceMuted
    },
    postcardFirst: {
        left: 0,
        bottom: 0,
        transform: [{ rotate: '-5deg' }]
    },
    postcardSecond: {
        left: 40,
        bottom: 0,
        transform: [{ rotate: '8deg' }]
    },
    postcardThird: {
        left: 80,
        bottom: 8,
        transform: [{ rotate: '10deg' }]
    },
    bottomNavWrap: {
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.micro,
        backgroundColor: theme.colors.background,
        borderTopWidth: 1,
        borderTopColor: theme.mode === 'dark' ? 'rgba(62, 65, 69, 0.5)' : 'rgba(220, 222, 227, 0.55)'
    },
    bottomNavBar: {
        minHeight: 40,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    bottomNavItem: {
        flex: 1,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.micro
    },
    bottomNavIcon: {
        width: 20,
        height: 20,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    bottomNavIconActive: {
        backgroundColor: theme.colors.accentSoft
    },
    bottomNavLabel: {
        width: 32,
        height: 8,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    bottomNavLabelActive: {
        backgroundColor: theme.colors.accentSoft
    }
});
