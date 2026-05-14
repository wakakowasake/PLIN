import React from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAdapters } from '@/adapters/useAdapters';
import { EmptyState } from '@/components/EmptyState';
import { Alert } from '@/feedback';
import { useAuthSession } from '@/hooks/useAuthSession';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { type AppTheme, useAppTheme } from '@/theme';
import type { AuthCurrentSignInMethod, AuthProvider } from '@/types/auth';

type Props = NativeStackScreenProps<RootStackParamList, 'SettingsAccount'>;

type SessionEvent = ReturnType<typeof useAuthSession>['lastSessionEvent'];

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

function formatSessionEventLabel(event: SessionEvent) {
    switch (event) {
        case 'bootstrap':
        case 'observe':
        case 'refresh':
        case 'refreshProviders':
            return '로그인 상태를 확인했어요';
        case 'updateProfilePhoto':
            return '프로필 사진을 저장했어요';
        case 'updateProfileDisplayName':
            return '프로필 이름을 저장했어요';
        case 'signIn':
            return '이 기기에서 로그인했어요';
        case 'sendEmailVerification':
            return '인증 메일을 보냈어요';
        case 'linkProvider':
            return '로그인 연결을 추가했어요';
        case 'unlinkProvider':
            return '로그인 연결을 해제했어요';
        case 'acceptTerms':
            return '약관 동의를 저장했어요';
        case 'requestDeletion':
            return '계정 삭제를 요청했어요';
        case 'signOut':
            return '이 기기에서 로그아웃했어요';
        default:
            return '아직 확인 기록이 없어요';
    }
}

function formatSessionEventTime(timestamp: number | null) {
    if (!timestamp) {
        return '앱을 열면 자동으로 다시 확인해요';
    }

    const value = new Date(timestamp);
    const now = new Date();
    const isSameDay = value.toDateString() === now.toDateString();
    const formatter = new Intl.DateTimeFormat('ko-KR', isSameDay
        ? { hour: 'numeric', minute: '2-digit' }
        : { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    return isSameDay ? `오늘 ${formatter.format(value)}` : formatter.format(value);
}

function formatSessionStatus(status: ReturnType<typeof useAuthSession>['status']) {
    switch (status) {
        case 'signedIn':
            return '로그인됨';
        case 'booting':
            return '확인 중';
        default:
            return '로그아웃됨';
    }
}

function getProviderDisplayName(provider: AuthCurrentSignInMethod) {
    switch (provider) {
        case 'apple':
            return 'Apple';
        case 'kakao':
            return 'Kakao';
        case 'naver':
            return 'Naver';
        case 'email':
            return '이메일';
        case null:
            return '확인되지 않음';
        default:
            return 'Google';
    }
}

export function SettingsAccountScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const {
        authModeNotice,
        communityRepositoryModeNotice
    } = useAdapters();
    const {
        user,
        status,
        authProviders,
        profileSummary,
        isAuthProvidersLoading,
        refreshSession,
        refreshLinkedProviders,
        linkProvider,
        unlinkProvider,
        signOut,
        requestAccountDeletion,
        isAuthActionLoading,
        authActionError,
        lastSessionEvent,
        lastSessionEventAt
    } = useAuthSession();

    const summary = profileSummary || buildFallbackSummary(user);
    const sessionStatusLabel = formatSessionStatus(status);
    const sessionEventLabel = formatSessionEventLabel(lastSessionEvent);
    const sessionEventTimeLabel = formatSessionEventTime(lastSessionEventAt);
    const isPendingDeletion = summary?.accountStatus === 'pending_deletion';
    const providerEntries = authProviders?.providers || [];
    const currentSignInMethod = authProviders?.currentSignInMethod ?? user?.provider ?? null;
    const currentSignInMethodLabel = currentSignInMethod
        ? getProviderDisplayName(currentSignInMethod)
        : '확인되지 않음';
    const connectedProviderEntries = React.useMemo(
        () => providerEntries.filter((entry) => entry.linked),
        [providerEntries]
    );
    const hiddenProviderEntries = React.useMemo(
        () => providerEntries.filter((entry) => !entry.linked),
        [providerEntries]
    );
    const connectedProviderCount = connectedProviderEntries.length;
    const hiddenProviderCount = hiddenProviderEntries.length;
    const [areOtherProvidersVisible, setOtherProvidersVisible] = React.useState(false);
    const handleRefresh = React.useCallback(async () => {
        await refreshSession();
        await refreshLinkedProviders();
    }, [refreshLinkedProviders, refreshSession]);

    const handleOpenExternalLink = React.useCallback((url: string, title?: string) => {
        navigation.navigate('InAppBrowser', { url, title });
    }, [navigation]);

    const handleOpenDeletionGuide = React.useCallback(async () => {
        handleOpenExternalLink('https://plin.ink/account-delete', '계정 삭제 안내');
    }, [handleOpenExternalLink]);

    const handleRequestAccountDeletion = React.useCallback(() => {
        Alert.alert(
            '계정 삭제를 요청할까요?',
            '요청이 완료되면 계정, 프로필, 커뮤니티 활동, 업로드 파일과 개인 데이터가 삭제되고 복구하기 어려워요.\n\n내가 소유한 공유 여행은 남은 멤버에게 자동으로 소유권이 넘어가고, 멤버가 없는 여행은 함께 삭제돼요.',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '삭제 요청',
                    style: 'destructive',
                    onPress: () => {
                        void requestAccountDeletion().catch(() => {});
                    }
                }
            ]
        );
    }, [requestAccountDeletion]);

    const handleLinkProvider = React.useCallback((provider: AuthProvider) => {
        void linkProvider(provider).catch(() => {});
    }, [linkProvider]);

    const handleUnlinkProvider = React.useCallback((provider: AuthProvider) => {
        const providerLabel = getProviderDisplayName(provider);

        Alert.alert(
            `${providerLabel} 연결 해제`,
            `현재 PLIN 계정에서 ${providerLabel} 로그인을 해제할까요?`,
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '연결 해제',
                    style: 'destructive',
                    onPress: () => {
                        void unlinkProvider(provider).catch(() => {});
                    }
                }
            ]
        );
    }, [unlinkProvider]);

    if (!user || !summary) {
        return (
            <SafeAreaView edges={['bottom']} style={styles.screenBody}>
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
        );
    }

    return (
        <SafeAreaView edges={['bottom']} style={styles.screenBody}>
            <ScrollView style={styles.container} contentContainerStyle={styles.content}>
                {authActionError ? (
                    <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                        <Text style={[styles.noticeText, styles.warningText]}>{authActionError}</Text>
                    </View>
                ) : null}

                {isPendingDeletion ? (
                    <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                        <Text style={styles.noticeTitle}>계정 삭제 진행 중</Text>
                        <Text style={[styles.noticeText, styles.warningText]}>
                            계정과 업로드한 데이터 삭제를 처리하고 있어요.
                        </Text>
                    </View>
                ) : null}

                {authModeNotice || communityRepositoryModeNotice ? (
                    <View style={[styles.noticeCard, styles.noticeCardInfo]}>
                        <Text style={styles.noticeTitle}>현재 연결 상태</Text>
                        {authModeNotice ? <Text style={styles.noticeText}>{authModeNotice}</Text> : null}
                        {communityRepositoryModeNotice ? <Text style={styles.noticeText}>{communityRepositoryModeNotice}</Text> : null}
                    </View>
                ) : null}

                <View style={styles.card}>
                    <View style={styles.cardTopRow}>
                        <Text style={styles.cardTitle}>계정 정보</Text>
                        <View style={styles.cardPill}>
                            <Text style={styles.cardPillText}>{sessionStatusLabel}</Text>
                        </View>
                    </View>
                    <View style={styles.detailList}>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>현재 로그인 방식</Text>
                            <Text style={styles.detailValue}>{currentSignInMethodLabel}</Text>
                        </View>
                        <View style={[styles.detailRow, styles.detailRowDivider]}>
                            <Text style={styles.detailLabel}>계정 상태</Text>
                            <Text style={styles.detailValue}>{isPendingDeletion ? '삭제 처리 중' : '정상'}</Text>
                        </View>
                        <View style={[styles.detailRow, styles.detailRowDivider, styles.detailRowTopAligned]}>
                            <Text style={styles.detailLabel}>최근 확인</Text>
                            <View style={styles.detailValueBlock}>
                                <Text style={styles.detailValue}>{sessionEventLabel}</Text>
                                <Text style={styles.detailHint}>{sessionEventTimeLabel}</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.actionRow}>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                                void handleRefresh();
                            }}
                            style={({ pressed }) => [
                                styles.secondaryAction,
                                pressed ? styles.actionPressed : null
                            ]}
                        >
                            <Text style={styles.secondaryActionText}>상태 새로고침</Text>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            disabled={isAuthActionLoading}
                            onPress={() => {
                                void signOut().catch(() => {});
                            }}
                            style={({ pressed }) => [
                                styles.primaryAction,
                                isAuthActionLoading ? styles.actionDisabled : null,
                                pressed && !isAuthActionLoading ? styles.actionPressed : null
                            ]}
                        >
                            <Text style={styles.primaryActionText}>
                                {isAuthActionLoading ? '처리 중...' : '로그아웃'}
                            </Text>
                        </Pressable>
                    </View>
                </View>

                <View style={styles.card}>
                    <View style={styles.cardTopRow}>
                        <Text style={styles.cardTitle}>로그인 수단 관리</Text>
                        <View style={styles.cardPill}>
                            <Text style={styles.cardPillText}>
                                {isAuthProvidersLoading ? '확인 중' : `${connectedProviderCount}개 연결됨`}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.cardDescription}>
                        현재 연결된 로그인 수단만 먼저 보여드려요. 필요한 경우 다른 소셜 로그인도 펼쳐서 연결할 수 있어요.
                    </Text>
                    <View style={styles.providerList}>
                        {connectedProviderEntries.length > 0 ? connectedProviderEntries.map((entry) => {
                            const providerLabel = getProviderDisplayName(entry.provider);
                            const statusLabel = entry.isCurrentSignInMethod
                                ? '현재 로그인 방식'
                                : entry.linked
                                    ? '연결됨'
                                    : entry.available
                                        ? '연결 가능'
                                        : '준비 중';
                            const detailLabel = entry.emailHint
                                || (entry.linkedAt
                                    ? `${new Date(entry.linkedAt).toLocaleDateString('ko-KR')} 연결`
                                    : entry.linked
                                        ? '계정에 연결되어 있어요.'
                                        : entry.available
                                            ? '로그인 후 현재 계정에 추가할 수 있어요.'
                                            : '이 로그인 방식은 현재 빌드에서 시작할 수 없어요.');
                            const canAct = entry.canLink || entry.canUnlink;

                            return (
                                <View key={entry.provider} style={styles.providerRow}>
                                    <View style={styles.providerCopy}>
                                        <View style={styles.providerTitleRow}>
                                            <Text style={styles.providerTitle}>{providerLabel}</Text>
                                            <View style={styles.providerBadge}>
                                                <Text style={styles.providerBadgeText}>{statusLabel}</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.providerDescription}>{detailLabel}</Text>
                                    </View>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={!canAct || isAuthActionLoading || isAuthProvidersLoading}
                                        onPress={() => {
                                            if (entry.canLink) {
                                                handleLinkProvider(entry.provider);
                                                return;
                                            }

                                            if (entry.canUnlink) {
                                                handleUnlinkProvider(entry.provider);
                                            }
                                        }}
                                        style={({ pressed }) => [
                                            styles.providerAction,
                                            (!canAct || isAuthActionLoading || isAuthProvidersLoading)
                                                ? styles.actionDisabled
                                                : null,
                                            pressed && canAct && !isAuthActionLoading && !isAuthProvidersLoading
                                                ? styles.actionPressed
                                                : null
                                        ]}
                                    >
                                        <Text style={styles.providerActionText}>
                                            {entry.canLink ? '연결' : entry.canUnlink ? '해제' : entry.available ? '사용 중' : '대기'}
                                        </Text>
                                    </Pressable>
                                </View>
                            );
                        }) : (
                            <View style={styles.providerEmptyCard}>
                                <Text style={styles.providerEmptyTitle}>연결된 소셜 로그인이 없어요.</Text>
                                <Text style={styles.providerEmptyText}>
                                    지금은 {currentSignInMethodLabel}로 로그인 중이에요.
                                </Text>
                            </View>
                        )}
                    </View>
                    {hiddenProviderCount > 0 ? (
                        <>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ expanded: areOtherProvidersVisible }}
                                onPress={() => {
                                    setOtherProvidersVisible((current) => !current);
                                }}
                                style={({ pressed }) => [
                                    styles.providerToggle,
                                    pressed ? styles.actionPressed : null
                                ]}
                            >
                                <View style={styles.providerToggleCopy}>
                                    <Text style={styles.providerToggleText}>
                                        {areOtherProvidersVisible ? '다른 로그인 수단 숨기기' : `다른 로그인 수단 ${hiddenProviderCount}개 보기`}
                                    </Text>
                                    <Text style={styles.providerToggleHint}>
                                        연결되지 않은 로그인 수단은 여기 접어뒀어요.
                                    </Text>
                                </View>
                                <Ionicons
                                    name={areOtherProvidersVisible ? 'chevron-up' : 'chevron-down'}
                                    size={18}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                            {areOtherProvidersVisible ? (
                                <View style={styles.providerList}>
                                    {hiddenProviderEntries.map((entry) => {
                                        const providerLabel = getProviderDisplayName(entry.provider);
                                        const statusLabel = entry.available ? '연결 가능' : '준비 중';
                                        const detailLabel = entry.emailHint
                                            || (entry.available
                                                ? '로그인 후 현재 계정에 추가할 수 있어요.'
                                                : '이 로그인 방식은 현재 빌드에서 시작할 수 없어요.');
                                        const canAct = entry.canLink || entry.canUnlink;

                                        return (
                                            <View key={entry.provider} style={styles.providerRow}>
                                                <View style={styles.providerCopy}>
                                                    <View style={styles.providerTitleRow}>
                                                        <Text style={styles.providerTitle}>{providerLabel}</Text>
                                                        <View style={styles.providerBadge}>
                                                            <Text style={styles.providerBadgeText}>{statusLabel}</Text>
                                                        </View>
                                                    </View>
                                                    <Text style={styles.providerDescription}>{detailLabel}</Text>
                                                </View>
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={!canAct || isAuthActionLoading || isAuthProvidersLoading}
                                                    onPress={() => {
                                                        if (entry.canLink) {
                                                            handleLinkProvider(entry.provider);
                                                            return;
                                                        }

                                                        if (entry.canUnlink) {
                                                            handleUnlinkProvider(entry.provider);
                                                        }
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.providerAction,
                                                        (!canAct || isAuthActionLoading || isAuthProvidersLoading)
                                                            ? styles.actionDisabled
                                                            : null,
                                                        pressed && canAct && !isAuthActionLoading && !isAuthProvidersLoading
                                                            ? styles.actionPressed
                                                            : null
                                                    ]}
                                                >
                                                    <Text style={styles.providerActionText}>
                                                        {entry.canLink ? '연결' : entry.canUnlink ? '해제' : entry.available ? '사용 중' : '대기'}
                                                    </Text>
                                                </Pressable>
                                            </View>
                                        );
                                    })}
                                </View>
                            ) : null}
                        </>
                    ) : null}
                    <View style={styles.actionRowSingle}>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                                void refreshLinkedProviders();
                            }}
                            style={({ pressed }) => [
                                styles.secondaryAction,
                                pressed ? styles.actionPressed : null
                            ]}
                        >
                            <Text style={styles.secondaryActionText}>연결 상태 새로고침</Text>
                        </Pressable>
                    </View>
                </View>

                <View style={styles.card}>
                    <View style={styles.cardTopRow}>
                        <Text style={styles.cardTitle}>계정 삭제</Text>
                        <View style={[styles.cardPill, styles.warningPill]}>
                            <Text style={[styles.cardPillText, styles.warningText]}>즉시 삭제</Text>
                        </View>
                    </View>
                    <Text style={styles.cardDescription}>
                        요청이 완료되면 즉시 로그아웃되고, 계정과 커뮤니티 활동, 업로드 파일, 개인 데이터가 삭제돼요. 공유 여행은 남은 멤버에게 소유권이 넘어갈 수 있어요.
                    </Text>
                    <View style={styles.actionRow}>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                                void handleOpenDeletionGuide();
                            }}
                            style={({ pressed }) => [
                                styles.secondaryAction,
                                pressed ? styles.actionPressed : null
                            ]}
                        >
                            <Text style={styles.secondaryActionText}>삭제 안내 보기</Text>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            disabled={isAuthActionLoading || isPendingDeletion}
                            onPress={handleRequestAccountDeletion}
                            style={({ pressed }) => [
                                styles.destructiveAction,
                                isAuthActionLoading || isPendingDeletion ? styles.actionDisabled : null,
                                pressed && !isAuthActionLoading && !isPendingDeletion ? styles.actionPressed : null
                            ]}
                        >
                            <Text style={styles.destructiveActionText}>
                                {isPendingDeletion ? '삭제 진행 중' : '계정 삭제 요청'}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
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
        paddingBottom: theme.spacing.xl
    },
    stateContent: {
        flex: 1,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.md
    },
    noticeCard: {
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md
    },
    noticeCardInfo: {
        backgroundColor: theme.colors.surfaceMuted
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
    card: {
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
    },
    cardTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontFamily: theme.fonts.bold
    },
    cardPill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    cardPillText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    warningPill: {
        backgroundColor: theme.mode === 'dark' ? '#40231e' : '#fff0e8'
    },
    warningText: {
        color: theme.colors.warning
    },
    cardDescription: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 19,
        fontFamily: theme.fonts.body
    },
    detailList: {
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        overflow: 'hidden'
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm
    },
    detailRowDivider: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    detailRowTopAligned: {
        alignItems: 'flex-start'
    },
    detailLabel: {
        width: 88,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    detailValueBlock: {
        flex: 1,
        alignItems: 'flex-end'
    },
    detailValue: {
        flex: 1,
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.body,
        textAlign: 'right'
    },
    detailHint: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body,
        textAlign: 'right'
    },
    providerList: {
        marginTop: theme.spacing.sm,
        gap: theme.spacing.sm
    },
    providerEmptyCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    providerEmptyTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    providerEmptyText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    providerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    providerCopy: {
        flex: 1,
        gap: theme.spacing.micro
    },
    providerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        flexWrap: 'wrap'
    },
    providerTitle: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    providerBadge: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface
    },
    providerBadgeText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    providerDescription: {
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    providerToggle: {
        marginTop: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    providerToggleCopy: {
        flex: 1
    },
    providerToggleText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    providerToggleHint: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 17,
        fontFamily: theme.fonts.body
    },
    providerAction: {
        minWidth: 72,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surface
    },
    providerActionText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    actionRow: {
        marginTop: theme.spacing.sm,
        flexDirection: 'row',
        gap: theme.spacing.xs
    },
    actionRowSingle: {
        marginTop: theme.spacing.sm
    },
    secondaryAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    secondaryActionText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    primaryAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.accent
    },
    primaryActionText: {
        color: '#ffffff',
        fontFamily: theme.fonts.semibold
    },
    destructiveAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.warning
    },
    destructiveActionText: {
        color: '#ffffff',
        fontFamily: theme.fonts.semibold
    },
    actionPressed: {
        opacity: 0.88
    },
    actionDisabled: {
        opacity: 0.5
    }
});
