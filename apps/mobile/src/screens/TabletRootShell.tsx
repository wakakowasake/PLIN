import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StackActions } from '@react-navigation/native';
import {
    createNativeStackNavigator,
    type NativeStackScreenProps
} from '@react-navigation/native-stack';
import {
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { useAuthSession } from '@/hooks/useAuthSession';
import type { RootStackParamList, RootTabKey } from '@/navigation/RootNavigator';
import { CommunityPostDetailScreen } from '@/screens/CommunityPostDetailScreen';
import { CommunityScreen } from '@/screens/CommunityScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { TripDetailScreen } from '@/screens/TripDetailScreen';
import { TripListScreen } from '@/screens/TripListScreen';
import { type AppTheme, useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, RootTabKey>;
type TabletSection = 'home' | 'trips' | 'tripDetail' | 'create' | 'community' | 'settings';
type SettingsPane = 'profile' | 'account' | 'appearance' | 'policies';

const TabletRightStack = createNativeStackNavigator<RootStackParamList>();
const PLIN_PLACEHOLDER_ICON = require('../../assets/images/splash-icon.png');

const SETTINGS_ITEMS: Array<{
    key: SettingsPane;
    label: string;
    description: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}> = [
    { key: 'profile', label: '프로필', description: '이름과 사진, 여행자 정보를 확인해요.', icon: 'account-circle-outline' },
    { key: 'account', label: '계정 관리', description: '로그인 방식과 계정 상태를 관리해요.', icon: 'shield-account-outline' },
    { key: 'appearance', label: '화면 설정', description: '다크 모드와 글꼴 설정을 이어서 사용해요.', icon: 'palette-outline' },
    { key: 'policies', label: '약관 및 정책', description: '서비스 정책과 개인정보 안내를 열어봐요.', icon: 'file-document-outline' }
];

function getInitialSection(routeName: RootTabKey): TabletSection {
    if (routeName === 'Home') return 'home';
    if (routeName === 'Community') return 'community';
    if (routeName === 'Settings') return 'settings';
    return 'trips';
}

function getProfileLabel(displayName?: string | null, email?: string | null) {
    const name = String(displayName || '').trim();
    if (name) return name;
    const safeEmail = String(email || '').trim();
    if (safeEmail.includes('@')) return safeEmail.split('@')[0] || 'PLIN 여행자';
    return safeEmail || 'PLIN 여행자';
}

export function TabletRootShell({ navigation, route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const layout = useAdaptiveLayout();
    const { user, profileSummary } = useAuthSession();
    const [activeSection, setActiveSection] = React.useState<TabletSection>(() => getInitialSection(route.name));
    const [selectedTripId, setSelectedTripId] = React.useState('');
    const [selectedPostId, setSelectedPostId] = React.useState('');
    const [selectedSettingsPane, setSelectedSettingsPane] = React.useState<SettingsPane>('profile');

    React.useEffect(() => {
        setActiveSection(getInitialSection(route.name));
    }, [route.name]);

    const profileLabel = getProfileLabel(profileSummary?.displayName, user?.email);

    const setRootSection = React.useCallback((section: TabletSection, rootRoute?: RootTabKey) => {
        setActiveSection(section);
        if (rootRoute && route.name !== rootRoute) {
            navigation.dispatch(StackActions.replace(rootRoute));
        }
    }, [navigation, route.name]);

    const navigateFromLeftPane = React.useCallback((screenOrOptions: unknown, params?: unknown) => {
        const screenName = typeof screenOrOptions === 'string'
            ? screenOrOptions
            : screenOrOptions && typeof screenOrOptions === 'object' && 'name' in screenOrOptions
                ? String((screenOrOptions as { name: string }).name)
                : '';
        const screenParams = typeof screenOrOptions === 'string'
            ? params
            : screenOrOptions && typeof screenOrOptions === 'object' && 'params' in screenOrOptions
                ? (screenOrOptions as { params?: unknown }).params
                : params;

        if (screenName === 'Home' || screenName === 'TripList' || screenName === 'Community' || screenName === 'Settings') {
            const nextRootRoute = screenName as RootTabKey;
            setActiveSection(getInitialSection(nextRootRoute));
            if (route.name !== nextRootRoute) {
                navigation.dispatch(StackActions.replace(nextRootRoute));
            }
            return;
        }

        if (screenName === 'TripDetail') {
            const tripId = String((screenParams as { tripId?: string } | undefined)?.tripId || '');
            if (tripId) {
                setSelectedTripId(tripId);
                setActiveSection('trips');
                return;
            }
        }

        if (screenName === 'CommunityPostDetail') {
            const postId = String((screenParams as { postId?: string } | undefined)?.postId || '');
            if (postId) {
                setSelectedPostId(postId);
                setActiveSection('community');
                return;
            }
        }

        if (screenName === 'TripCreate') {
            setActiveSection('create');
            return;
        }

        (navigation.navigate as (...args: unknown[]) => void)(screenName, screenParams);
    }, [navigation, route.name]);

    const leftPaneNavigation = React.useMemo(() => new Proxy(navigation, {
        get(target, property, receiver) {
            if (property === 'navigate') {
                return navigateFromLeftPane;
            }

            const value = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    }), [navigateFromLeftPane, navigation]);

    const createLeftRoute = React.useCallback(<RouteName extends RootTabKey>(name: RouteName) => ({
        key: `tablet-left-${name}`,
        name,
        params: undefined
    }), []);

    const renderActionButton = React.useCallback((
        label: string,
        onPress: () => void,
        tone: 'primary' | 'secondary' = 'secondary',
        icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name']
    ) => (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.actionButton,
                tone === 'primary' ? styles.actionButtonPrimary : styles.actionButtonSecondary,
                pressed ? styles.pressed : null
            ]}
        >
            {icon ? (
                <MaterialCommunityIcons
                    name={icon}
                    color={tone === 'primary' ? '#FFFFFF' : theme.colors.textPrimary}
                    size={18}
                />
            ) : null}
            <Text style={[
                styles.actionButtonText,
                tone === 'primary' ? styles.actionButtonPrimaryText : null
            ]}>
                {label}
            </Text>
        </Pressable>
    ), [
        styles.actionButton,
        styles.actionButtonPrimary,
        styles.actionButtonPrimaryText,
        styles.actionButtonSecondary,
        styles.actionButtonText,
        styles.pressed,
        theme.colors.textPrimary
    ]);

    const renderLeftPane = () => {
        if (route.name === 'Community') {
            return (
                <CommunityScreen
                    navigation={leftPaneNavigation as NativeStackScreenProps<RootStackParamList, 'Community'>['navigation']}
                    route={createLeftRoute('Community')}
                />
            );
        }

        if (route.name === 'Settings') {
            return (
                <SettingsScreen
                    navigation={leftPaneNavigation as NativeStackScreenProps<RootStackParamList, 'Settings'>['navigation']}
                    route={createLeftRoute('Settings')}
                />
            );
        }

        const tripRouteName = route.name === 'Home' ? 'Home' : 'TripList';
        return (
            <TripListScreen
                navigation={leftPaneNavigation as NativeStackScreenProps<RootStackParamList, 'Home' | 'TripList'>['navigation']}
                route={createLeftRoute(tripRouteName)}
            />
        );
    };

    const renderTripOverview = () => {
        if (!selectedTripId) {
            return (
                <View style={styles.blankPane}>
                    <Image
                        source={PLIN_PLACEHOLDER_ICON}
                        style={styles.blankPaneIcon}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                    />
                </View>
            );
        }

        return (
            <View style={styles.rightStackHost}>
                <TabletRightStack.Navigator
                    key={selectedTripId}
                    initialRouteName="TripDetail"
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
                    <TabletRightStack.Screen
                        name="TripDetail"
                        component={TripDetailScreen}
                        initialParams={{ tripId: selectedTripId }}
                        options={{ title: '여행 상세' }}
                    />
                </TabletRightStack.Navigator>
            </View>
        );
    };

    const renderCreateDetail = () => (
        <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
            <View style={styles.summaryCard}>
                <Text style={styles.eyebrow}>Create</Text>
                <Text style={styles.detailTitle}>패드에서도 같은 새 여행 플로우를 사용해요</Text>
                <Text style={styles.detailDescription}>1차 전환에서는 기존 새 여행 화면의 검증과 저장 로직을 그대로 사용하고, 이후 단계별 편집을 오른쪽 pane으로 옮겨갈 수 있게入口를 분리해 둡니다.</Text>
            </View>
            <View style={styles.actionRow}>
                {renderActionButton('새 여행 만들기', () => {
                    navigation.navigate('TripCreate');
                }, 'primary', 'plus')}
                {renderActionButton('내 여행으로', () => setRootSection('trips', 'TripList'), 'secondary', 'bag-suitcase-outline')}
            </View>
        </ScrollView>
    );

    const renderCommunityOverview = () => {
        if (!selectedPostId) {
            return (
                <View style={styles.blankPane}>
                    <Image
                        source={PLIN_PLACEHOLDER_ICON}
                        style={styles.blankPaneIcon}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                    />
                </View>
            );
        }

        return (
            <View style={styles.rightStackHost}>
                <TabletRightStack.Navigator
                    key={selectedPostId}
                    initialRouteName="CommunityPostDetail"
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
                    <TabletRightStack.Screen
                        name="CommunityPostDetail"
                        component={CommunityPostDetailScreen}
                        initialParams={{ postId: selectedPostId }}
                        options={{ title: '커뮤니티 상세' }}
                    />
                </TabletRightStack.Navigator>
            </View>
        );
    };

    const renderSettingsDetail = () => {
        const details: Record<SettingsPane, {
            title: string;
            description: string;
            actionLabel: string;
            action: () => void;
            icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
        }> = {
            profile: {
                title: `${profileLabel}님의 프로필`,
                description: '현재 앱의 프로필 편집, 여행자 정보, 홈 카드 설정을 같은 화면에서 이어서 관리합니다.',
                actionLabel: '설정 전체 열기',
                action: () => navigation.navigate('Settings'),
                icon: 'account-circle-outline'
            },
            account: {
                title: '계정 관리',
                description: '로그인 방식, 이메일 인증, 탈퇴 안내와 같은 민감한 계정 작업은 기존 계정 관리 화면에서 처리합니다.',
                actionLabel: '계정 관리 열기',
                action: () => navigation.navigate('SettingsAccount'),
                icon: 'shield-account-outline'
            },
            appearance: {
                title: '화면 설정',
                description: '다크 모드와 글꼴 설정은 기존 설정 화면의 토큰을 그대로 사용합니다.',
                actionLabel: '화면 설정 열기',
                action: () => navigation.navigate('Settings'),
                icon: 'palette-outline'
            },
            policies: {
                title: '약관 및 정책',
                description: '회사 소개, 이용약관, 위치기반서비스 약관, 운영정책, 청소년보호정책, 개인정보처리방침을 확인합니다.',
                actionLabel: '정책 열기',
                action: () => navigation.navigate('InAppBrowser', {
                    url: 'https://plin.ink/terms.html',
                    title: '이용약관'
                }),
                icon: 'file-document-outline'
            }
        };
        const detail = details[selectedSettingsPane];

        return (
            <View style={styles.detailContent}>
                <View style={styles.heroIconCard}>
                    <MaterialCommunityIcons name={detail.icon} color={theme.colors.accent} size={42} />
                    <Text style={styles.detailTitle}>{detail.title}</Text>
                    <Text style={styles.detailDescription}>{detail.description}</Text>
                </View>
                <View style={styles.actionRow}>
                    {renderActionButton(detail.actionLabel, detail.action, 'primary', 'arrow-right')}
                </View>
            </View>
        );
    };

    const renderRightPane = () => {
        if (activeSection === 'home' || activeSection === 'trips' || activeSection === 'tripDetail') {
            return renderTripOverview();
        }

        if (activeSection === 'create') {
            return renderCreateDetail();
        }

        if (activeSection === 'community') {
            return renderCommunityOverview();
        }

        if (activeSection === 'settings') {
            return renderSettingsDetail();
        }

        return renderTripOverview();
    };

    return (
        <View style={styles.safeArea}>
            <View style={styles.shell}>
                <View style={[styles.leftPane, { minWidth: layout.paneMinWidth }]}>
                    {renderLeftPane()}
                </View>
                <View style={styles.splitDivider} />
                <View style={[styles.rightPane, { minWidth: layout.paneMinWidth }]}>
                    {renderRightPane()}
                </View>
            </View>
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    shell: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: theme.colors.background
    },
    leftPane: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    rightPane: {
        flex: 1,
        backgroundColor: theme.colors.surface
    },
    blankPane: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface
    },
    blankPaneIcon: {
        width: 112,
        height: 112,
        opacity: theme.mode === 'dark' ? 0.24 : 0.2,
        tintColor: theme.colors.textSecondary
    },
    rightStackHost: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    splitDivider: {
        width: 1,
        backgroundColor: theme.colors.border
    },
    brandHeader: {
        minHeight: 74,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border
    },
    brandTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.display,
        fontSize: 24,
        lineHeight: 29
    },
    brandSubtitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.medium,
        fontSize: 12
    },
    profileLabel: {
        maxWidth: 160,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold,
        fontSize: 12
    },
    navRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border
    },
    navButton: {
        minHeight: 38,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.micro,
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: 'transparent'
    },
    navButtonActive: {
        backgroundColor: theme.colors.accentSoft
    },
    navButtonText: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold,
        fontSize: 12
    },
    navButtonTextActive: {
        color: theme.colors.accent
    },
    paneBody: {
        flex: 1
    },
    paneHeader: {
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.sm
    },
    eyebrow: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold,
        fontSize: 12,
        lineHeight: 16
    },
    paneTitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.display,
        fontSize: 28,
        lineHeight: 34
    },
    paneDescription: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 14,
        lineHeight: 20
    },
    headerActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.sm
    },
    listContent: {
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.xl,
        gap: theme.spacing.sm
    },
    listCardSlot: {
        borderWidth: 1,
        borderColor: 'transparent',
        borderRadius: theme.radius.lg
    },
    selectedListCardSlot: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    actionButton: {
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.micro,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md
    },
    actionButtonPrimary: {
        backgroundColor: theme.colors.accent
    },
    actionButtonSecondary: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    actionButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold,
        fontSize: 14
    },
    actionButtonPrimaryText: {
        color: '#FFFFFF'
    },
    actionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.sm
    },
    pressed: {
        opacity: 0.78
    },
    stateCard: {
        alignItems: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    detailState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.md
    },
    stateTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold,
        fontSize: 16,
        lineHeight: 22,
        textAlign: 'center'
    },
    stateDescription: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center'
    },
    detailContent: {
        padding: theme.spacing.md,
        paddingBottom: theme.spacing.xl,
        gap: theme.spacing.md
    },
    summaryCard: {
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border
    },
    heroIconCard: {
        alignItems: 'flex-start',
        gap: theme.spacing.sm,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border
    },
    detailTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.display,
        fontSize: 26,
        lineHeight: 32
    },
    detailDescription: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 15,
        lineHeight: 22
    },
    detailMeta: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold,
        fontSize: 13,
        lineHeight: 18
    },
    inlineError: {
        color: theme.colors.warning,
        fontFamily: theme.fonts.medium,
        fontSize: 13,
        lineHeight: 19
    },
    summaryGrid: {
        flexDirection: 'row',
        gap: theme.spacing.xs
    },
    summaryMetric: {
        flex: 1,
        minHeight: 78,
        justifyContent: 'center',
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border
    },
    summaryMetricLabel: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold,
        fontSize: 12
    },
    summaryMetricValue: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.display,
        fontSize: 18
    },
    noteText: {
        marginTop: theme.spacing.sm,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body,
        fontSize: 15,
        lineHeight: 23
    },
    sectionTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold,
        fontSize: 17,
        lineHeight: 23
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingTop: theme.spacing.sm
    },
    detailRowTitle: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.medium,
        fontSize: 14
    },
    detailRowValue: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.bold,
        fontSize: 14
    },
    settingsList: {
        paddingHorizontal: theme.spacing.md,
        gap: theme.spacing.xs
    },
    settingsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface
    },
    settingsRowActive: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    settingsIconWrap: {
        width: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    settingsCopy: {
        flex: 1
    },
    settingsLabel: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold,
        fontSize: 15
    },
    settingsDescription: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 12,
        lineHeight: 17
    },
    stepList: {
        paddingHorizontal: theme.spacing.md,
        gap: theme.spacing.sm
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    stepNumber: {
        width: 30,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    stepNumberText: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.bold,
        fontSize: 13
    },
    stepLabel: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold,
        fontSize: 15
    }
});
