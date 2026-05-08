import React from 'react';
import {
    Image,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdapters } from '@/adapters/useAdapters';
import { requiresEmailVerification } from '@/auth/email-verification';
import {
    hasAcceptedMandatoryTerms,
    isMandatoryAgreementStateResolved,
    shouldRetryMandatoryAgreementResolution
} from '@/auth/mandatory-agreement';
import { DebugInfoCard } from '@/components/DebugInfoCard';
import { EmptyState } from '@/components/EmptyState';
import { useAuthSession } from '@/hooks/useAuthSession';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { hasFirebaseAuthSessionConfig } from '@/adapters/auth/FirebaseAuthSessionAdapter';
import {
    fetchAuthProviderAvailability,
    type AuthProviderAvailability
} from '@/services/public-config';
import { type AppTheme, useAppTheme } from '@/theme';
import { type AuthProvider } from '@/types/auth';

const TERMS_URL = 'https://plin.ink/terms.html';
const PRIVACY_URL = 'https://plin.ink/privacy.html';
const LOCATION_TERMS_URL = 'https://plin.ink/location-terms.html';
const OPERATION_POLICY_URL = 'https://plin.ink/operation-policy.html';
const YOUTH_PROTECTION_POLICY_URL = 'https://plin.ink/youth-protection-policy.html';
const KAKAO_SUPPORT_CHAT_URL = 'http://pf.kakao.com/_duxdTX/chat';
const GOOGLE_CI_TRANSPARENT = require('../../assets/images/auth/google-ci-transparent.png');
const KAKAO_CI_TRANSPARENT = require('../../assets/images/auth/kakao-ci-transparent.png');
const NAVER_CI_TRANSPARENT = require('../../assets/images/auth/naver-ci-transparent.png');

type Props = NativeStackScreenProps<RootStackParamList, 'AuthGate'>;

type AgreementItem = {
    id: 'age' | 'terms' | 'privacy';
    label: string;
    required: boolean;
    url?: string;
};

const AGREEMENT_ITEMS: readonly AgreementItem[] = [
    {
        id: 'age',
        label: '만 14세 이상입니다',
        required: true
    },
    {
        id: 'terms',
        label: '서비스 이용약관',
        required: true,
        url: TERMS_URL
    },
    {
        id: 'privacy',
        label: '개인정보 수집 및 이용동의',
        required: true,
        url: PRIVACY_URL
    }
] as const;

type AgreementItemId = (typeof AGREEMENT_ITEMS)[number]['id'];

const REQUIRED_AGREEMENT_IDS = AGREEMENT_ITEMS
    .filter((item) => item.required)
    .map((item) => item.id);

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
        label: '이용약관',
        url: TERMS_URL,
        icon: 'document-text-outline'
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

function getProviderButtonLabel(provider: AuthProvider) {
    switch (provider) {
        case 'kakao':
            return '카카오 계정으로 시작하기';
        case 'naver':
            return '네이버 계정으로 시작하기';
        case 'apple':
            return '애플 계정으로 시작하기';
        case 'google':
        default:
            return '구글 계정으로 시작하기';
    }
}

function SocialProviderIcon({
    provider,
    styles
}: {
    provider: AuthProvider;
    styles: ReturnType<typeof createStyles>;
}) {
    if (provider === 'google') {
        return (
            <Image
                source={GOOGLE_CI_TRANSPARENT}
                style={styles.googleCiImage}
                resizeMode="contain"
            />
        );
    }

    if (provider === 'kakao') {
        return (
            <Image
                source={KAKAO_CI_TRANSPARENT}
                style={styles.kakaoCiImage}
                resizeMode="contain"
            />
        );
    }

    if (provider === 'naver') {
        return (
            <Image
                source={NAVER_CI_TRANSPARENT}
                style={styles.naverCiImage}
                resizeMode="contain"
            />
        );
    }

    if (provider === 'apple') {
        return <Ionicons color="#FFFFFF" name="logo-apple" size={24} />;
    }

    return null;
}

function isNetworkLikeMessage(message: string | null) {
    if (!message) {
        return false;
    }

    return message.includes('네트워크') || message.includes('연결');
}

function isConfigLikeMessage(message: string | null) {
    if (!message) {
        return false;
    }

    return message.includes('환경 변수')
        || message.includes('OAuth')
        || message.includes('client ID')
        || message.includes('redirect')
        || message.includes('설정');
}

function isCancelledMessage(message: string | null) {
    if (!message) {
        return false;
    }

    return message.includes('취소');
}

function isPendingDeletionMessage(message: string | null) {
    if (!message) {
        return false;
    }

    return message.includes('계정 삭제');
}

export function AuthGateScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const contentInsetStyle = React.useMemo(() => ({
        paddingTop: insets.top + theme.spacing.md,
        paddingBottom: insets.bottom + theme.spacing.sm
    }), [insets.bottom, insets.top, theme.spacing.md, theme.spacing.sm]);
    const { authMode, authModeNotice } = useAdapters();
    const {
        user,
        profileSummary,
        signIn,
        sendEmailVerification,
        acceptMandatoryTerms,
        refreshSession,
        retryBootstrap,
        signOut,
        bootstrapError,
        authActionError,
        isAuthActionLoading
    } = useAuthSession();
    const [checkedAgreementIds, setCheckedAgreementIds] = React.useState<Record<AgreementItemId, boolean>>({
        age: false,
        terms: false,
        privacy: false
    });
    const [isSupportPolicyOpen, setIsSupportPolicyOpen] = React.useState(false);
    const [serverProviderAvailability, setServerProviderAvailability] = React.useState<AuthProviderAvailability | null>(null);
    const [isProviderAvailabilityLoading, setIsProviderAvailabilityLoading] = React.useState(false);
    const [emailVerificationNotice, setEmailVerificationNotice] = React.useState<string | null>(null);
    const hasRequestedInitialEmailVerificationRef = React.useRef(false);
    const openLegalPage = React.useCallback((url: string, title?: string) => {
        navigation.navigate('InAppBrowser', { url, title });
    }, [navigation]);

    const isBootstrapNetworkIssue = isNetworkLikeMessage(bootstrapError);
    const isBootstrapPendingDeletionIssue = isPendingDeletionMessage(bootstrapError);
    const isAuthActionNetworkIssue = isNetworkLikeMessage(authActionError);
    const isAuthActionConfigIssue = isConfigLikeMessage(authActionError);
    const isAuthActionCancelled = isCancelledMessage(authActionError);
    const isPendingDeletionIssue = isPendingDeletionMessage(authActionError) || isPendingDeletionMessage(bootstrapError);
    const needsEmailVerification = requiresEmailVerification(user);
    const needsMandatoryAgreement = Boolean(user)
        && !needsEmailVerification
        && !hasAcceptedMandatoryTerms(profileSummary);
    const isAgreementStateResolved = isMandatoryAgreementStateResolved(user, profileSummary);
    const shouldRetryAgreementState = shouldRetryMandatoryAgreementResolution(user, profileSummary);
    const loadProviderAvailability = React.useCallback(async () => {
        if (authMode === 'mock' || needsEmailVerification || needsMandatoryAgreement) {
            setServerProviderAvailability(null);
            setIsProviderAvailabilityLoading(false);
            return;
        }

        setIsProviderAvailabilityLoading(true);

        try {
            const nextAvailability = await fetchAuthProviderAvailability();
            setServerProviderAvailability(nextAvailability);
        } catch {
            setServerProviderAvailability({
                google: false,
                apple: false,
                kakao: false,
                naver: false
            });
        } finally {
            setIsProviderAvailabilityLoading(false);
        }
    }, [authMode, needsEmailVerification, needsMandatoryAgreement]);
    const canUseGoogle = authMode !== 'mock'
        && serverProviderAvailability?.google === true
        && hasFirebaseAuthSessionConfig('google');
    const canUseApple = authMode !== 'mock'
        && (Platform.OS === 'ios' || Platform.OS === 'android')
        && serverProviderAvailability?.apple === true
        && hasFirebaseAuthSessionConfig('apple');
    const canUseKakao = authMode !== 'mock'
        && serverProviderAvailability?.kakao === true
        && hasFirebaseAuthSessionConfig('kakao');
    const canUseNaver = authMode !== 'mock'
        && serverProviderAvailability?.naver === true
        && hasFirebaseAuthSessionConfig('naver');
    const isCheckingProviderAvailability = authMode !== 'mock'
        && !needsEmailVerification
        && !needsMandatoryAgreement
        && (isProviderAvailabilityLoading || serverProviderAvailability === null);
    const shouldShowProviderAvailabilityRetry = authMode !== 'mock'
        && !needsEmailVerification
        && !needsMandatoryAgreement
        && !isCheckingProviderAvailability
        && !canUseGoogle
        && !canUseApple
        && !canUseKakao
        && !canUseNaver;
    const isAllRequiredAgreementsChecked = REQUIRED_AGREEMENT_IDS.every((id) => checkedAgreementIds[id]);
    const isAllAgreementsChecked = AGREEMENT_ITEMS.every((item) => checkedAgreementIds[item.id]);
    const authActionInlineNotice = React.useMemo(() => {
        if (!authActionError || needsEmailVerification || needsMandatoryAgreement) {
            return null;
        }

        if (isPendingDeletionIssue) {
            return {
                title: '계정 이용을 확인해 주세요.',
                description: '현재 계정 처리가 진행 중이에요.\n도움이 필요하면 고객 지원으로 문의해 주세요.'
            };
        }

        if (isAuthActionCancelled) {
            return {
                title: '로그인을 취소했어요.',
                description: '원하는 로그인 방식을 선택하면\n언제든 다시 이어갈 수 있어요.'
            };
        }

        if (isAuthActionNetworkIssue) {
            return {
                title: '연결을 확인해 주세요.',
                description: '네트워크가 안정되면\n같은 로그인 방식으로 다시 시도해 주세요.'
            };
        }

        if (isAuthActionConfigIssue) {
            return {
                title: '로그인을 잠시 이용할 수 없어요.',
                description: '서비스 연결을 확인하고 있어요.\n잠시 후 다시 시도해 주세요.'
            };
        }

        return {
            title: '로그인을 완료하지 못했어요.',
            description: '잠시 후 다시 시도하거나\n다른 로그인 방식을 선택해 주세요.'
        };
    }, [
        authActionError,
        isAuthActionCancelled,
        isAuthActionConfigIssue,
        isAuthActionNetworkIssue,
        isPendingDeletionIssue,
        needsEmailVerification,
        needsMandatoryAgreement
    ]);

    React.useEffect(() => {
        if (!needsMandatoryAgreement) {
            setCheckedAgreementIds({
                age: false,
                terms: false,
                privacy: false
            });
        }
    }, [needsMandatoryAgreement]);

    React.useEffect(() => {
        void loadProviderAvailability();
    }, [loadProviderAvailability]);

    React.useEffect(() => {
        if (!needsEmailVerification) {
            hasRequestedInitialEmailVerificationRef.current = false;
            setEmailVerificationNotice(null);
        }
    }, [needsEmailVerification]);

    React.useEffect(() => {
        if (!needsEmailVerification || hasRequestedInitialEmailVerificationRef.current) {
            return;
        }

        let isCancelled = false;
        hasRequestedInitialEmailVerificationRef.current = true;
        setEmailVerificationNotice('인증 메일을 보내는 중이에요.');

        void (async () => {
            try {
                await sendEmailVerification();
                if (!isCancelled) {
                    setEmailVerificationNotice('인증 메일을 보냈어요. 받은 편지함과 스팸함을 함께 확인해 주세요.');
                }
            } catch (error) {
                if (!isCancelled) {
                    setEmailVerificationNotice(error instanceof Error
                        ? error.message
                        : '인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
                }
            }
        })();

        return () => {
            isCancelled = true;
        };
    }, [needsEmailVerification, sendEmailVerification]);

    async function handlePrimaryAction() {
        if (needsEmailVerification) {
            const refreshedUser = await refreshSession();
            if (requiresEmailVerification(refreshedUser)) {
                setEmailVerificationNotice('아직 이메일 인증이 확인되지 않았어요.');
            }
            return;
        }

        if (needsMandatoryAgreement) {
            if (shouldRetryAgreementState) {
                await retryBootstrap();
                return;
            }

            if (!isAllRequiredAgreementsChecked) {
                return;
            }

            try {
                await acceptMandatoryTerms();
            } catch {}
            return;
        }

        try {
            if (canUseGoogle) {
                await signIn('google');
            } else if (canUseKakao) {
                await signIn('kakao');
            } else if (canUseNaver) {
                await signIn('naver');
            }
        } catch {}
    }

    async function handleAppleSignIn() {
        try {
            await signIn('apple');
        } catch {}
    }

    async function handleGoogleSignIn() {
        try {
            await signIn('google');
        } catch {}
    }

    async function handleKakaoSignIn() {
        try {
            await signIn('kakao');
        } catch {}
    }

    async function handleNaverSignIn() {
        try {
            await signIn('naver');
        } catch {}
    }

    async function handleAgreementBack() {
        try {
            await signOut();
        } catch {}
    }

    function toggleAgreementItem(id: AgreementItemId) {
        setCheckedAgreementIds((current) => ({
            ...current,
            [id]: !current[id]
        }));
    }

    function toggleAllAgreements() {
        const nextValue = !isAllAgreementsChecked;
        setCheckedAgreementIds({
            age: nextValue,
            terms: nextValue,
            privacy: nextValue
        });
    }

    async function handleResendEmailVerification() {
        try {
            await sendEmailVerification();
            setEmailVerificationNotice('인증 메일을 다시 보냈어요.');
        } catch {}
    }

    async function handleRefreshEmailVerification() {
        const refreshedUser = await refreshSession();
        if (requiresEmailVerification(refreshedUser)) {
            setEmailVerificationNotice('아직 이메일 인증이 확인되지 않았어요.');
        }
    }

    const socialButtons = React.useMemo(() => {
        if (needsEmailVerification || needsMandatoryAgreement || authMode === 'mock') {
            return [];
        }

        const items: Array<{
            provider: AuthProvider;
            label: string;
            onPress: () => Promise<void>;
        }> = [];

        if (canUseGoogle) {
            items.push({
                provider: 'google',
                label: getProviderButtonLabel('google'),
                onPress: handleGoogleSignIn
            });
        }

        if (canUseKakao) {
            items.push({
                provider: 'kakao',
                label: getProviderButtonLabel('kakao'),
                onPress: handleKakaoSignIn
            });
        }

        if (canUseNaver) {
            items.push({
                provider: 'naver',
                label: getProviderButtonLabel('naver'),
                onPress: handleNaverSignIn
            });
        }

        if (canUseApple) {
            items.push({
                provider: 'apple',
                label: getProviderButtonLabel('apple'),
                onPress: handleAppleSignIn
            });
        }

        return items;
    }, [
        authMode,
        canUseApple,
        canUseGoogle,
        canUseKakao,
        canUseNaver,
        needsEmailVerification,
        needsMandatoryAgreement
    ]);

    if (needsMandatoryAgreement && isAgreementStateResolved) {
        return (
            <View style={styles.agreementScreen}>
                <View style={[
                    styles.agreementTopBar,
                    { paddingTop: insets.top + theme.spacing.xs }
                ]}>
                    <Pressable
                        accessibilityLabel="이전 화면으로 돌아가기"
                        accessibilityRole="button"
                        disabled={isAuthActionLoading}
                        onPress={() => {
                            void handleAgreementBack();
                        }}
                        hitSlop={12}
                        style={({ pressed }) => [
                            styles.agreementBackButton,
                            pressed && !isAuthActionLoading ? styles.linkPressed : null
                        ]}
                    >
                        <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
                    </Pressable>
                </View>

                <View style={styles.agreementIntro}>
                    <Text style={styles.agreementIntroTitle}>환영합니다.</Text>
                    <Text style={styles.agreementIntroDescription}>
                        원활한 서비스 이용을 위해 동의해 주세요.
                    </Text>
                </View>

                <View style={styles.agreementDivider} />

                <View style={styles.agreementBody}>
                    <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isAllAgreementsChecked }}
                        disabled={isAuthActionLoading}
                        onPress={toggleAllAgreements}
                        style={({ pressed }) => [
                            styles.agreementAllButton,
                            pressed && !isAuthActionLoading ? styles.primaryButtonPressed : null
                        ]}
                    >
                        <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                        <Text style={styles.agreementAllButtonText}>모두 동의하기</Text>
                    </Pressable>

                    <View style={styles.agreementList}>
                        {AGREEMENT_ITEMS.map((item) => {
                            const checked = checkedAgreementIds[item.id];
                            const itemUrl = item.url;
                            return (
                                <View key={item.id} style={styles.agreementItemRow}>
                                    <Pressable
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked }}
                                        disabled={isAuthActionLoading}
                                        onPress={() => {
                                            toggleAgreementItem(item.id);
                                        }}
                                        hitSlop={8}
                                        style={({ pressed }) => [
                                            styles.agreementCheckboxButton,
                                            pressed && !isAuthActionLoading ? styles.linkPressed : null
                                        ]}
                                    >
                                        <View style={[
                                            styles.agreementSquare,
                                            checked ? styles.agreementSquareChecked : null
                                        ]}>
                                            {checked ? (
                                                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                                            ) : null}
                                        </View>
                                    </Pressable>

                                    <Pressable
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked }}
                                        disabled={isAuthActionLoading}
                                        onPress={() => {
                                            toggleAgreementItem(item.id);
                                        }}
                                        style={({ pressed }) => [
                                            styles.agreementItemCopy,
                                            pressed && !isAuthActionLoading ? styles.linkPressed : null
                                        ]}
                                    >
                                        <Text style={styles.agreementItemText}>
                                            {item.label} ({item.required ? '필수' : '선택'})
                                        </Text>
                                    </Pressable>

                                    {itemUrl ? (
                                        <Pressable
                                            accessibilityRole="link"
                                            onPress={() => {
                                                openLegalPage(itemUrl, item.label);
                                            }}
                                            hitSlop={8}
                                            style={({ pressed }) => [
                                                styles.agreementViewLink,
                                                pressed ? styles.linkPressed : null
                                            ]}
                                        >
                                            <Text style={styles.agreementViewLinkText}>보기</Text>
                                        </Pressable>
                                    ) : (
                                        <View style={styles.agreementViewLinkPlaceholder} />
                                    )}
                                </View>
                            );
                        })}
                    </View>
                </View>

                {authActionError ? (
                    <Text style={styles.agreementErrorText}>{authActionError}</Text>
                ) : null}

                <View style={[
                    styles.agreementBottomBar,
                    { paddingBottom: insets.bottom }
                ]}>
                    <Pressable
                        accessibilityRole="button"
                        disabled={isAuthActionLoading || !isAllRequiredAgreementsChecked}
                        onPress={handlePrimaryAction}
                        style={({ pressed }) => [
                            styles.agreementStartButton,
                            !isAllRequiredAgreementsChecked ? styles.agreementStartButtonDisabled : null,
                            pressed && !isAuthActionLoading && isAllRequiredAgreementsChecked ? styles.primaryButtonPressed : null
                        ]}
                    >
                        <Text style={[
                            styles.agreementStartButtonText,
                            !isAllRequiredAgreementsChecked ? styles.agreementStartButtonTextDisabled : null
                        ]}>
                            {isAuthActionLoading ? '처리 중...' : '시작하기'}
                        </Text>
                    </Pressable>
                </View>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={[
                styles.content,
                contentInsetStyle
            ]}
            keyboardShouldPersistTaps="handled"
        >
            <View style={styles.heroBlock}>
                <Image
                    source={require('../../assets/images/auth-logo-white.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                />
                <Text style={styles.brand}>PLIN</Text>
            </View>

            <View style={styles.welcomeCard}>
                <View style={styles.welcomeCopyBlock}>
                    <Text numberOfLines={1} style={styles.welcomeTitle}>
                        {needsEmailVerification
                            ? '이메일을 확인해 주세요.'
                            : needsMandatoryAgreement
                                ? '가입을 마무리할게요.'
                                : authActionInlineNotice?.title || '반가워요!'}
                    </Text>
                    <Text numberOfLines={2} style={styles.welcomeDescription}>
                        {needsEmailVerification
                            ? '보낸 인증 메일의 링크를 열어야 PLIN 가입을 완료할 수 있어요.'
                            : needsMandatoryAgreement
                                ? '서비스를 시작하기 전에 약관과 개인정보 처리 안내를 확인해 주세요.'
                                : authActionInlineNotice?.description || '여행의 설레는 계획부터 소중한 추억까지\nPLIN과 함께 한 권의 여행책처럼 기록해 보세요.'}
                    </Text>
                </View>

                {needsEmailVerification || needsMandatoryAgreement ? (
                    <View style={styles.accountCard}>
                        <Text style={styles.accountLabel}>현재 계정</Text>
                        <Text style={styles.accountValue}>
                            {profileSummary?.email || user?.email || '로그인된 계정'}
                        </Text>
                    </View>
                ) : null}

                {needsEmailVerification ? (
                    <View style={styles.emailVerificationCard}>
                        <Text style={styles.emailVerificationTitle}>메일 인증이 필요해요.</Text>
                        <Text style={styles.emailVerificationDescription}>
                            PLIN 인증 링크를 열어야 가입을 완료할 수 있어요. 메일이 보이지 않으면 스팸함도 함께 확인해 주세요.
                        </Text>
                        {emailVerificationNotice ? (
                            <Text style={styles.emailVerificationNotice}>{emailVerificationNotice}</Text>
                        ) : null}
                        <Pressable
                            accessibilityRole="button"
                            disabled={isAuthActionLoading}
                            onPress={handleRefreshEmailVerification}
                            style={({ pressed }) => [
                                styles.emailVerificationPrimaryButton,
                                isAuthActionLoading ? styles.primaryButtonDisabled : null,
                                pressed && !isAuthActionLoading ? styles.primaryButtonPressed : null
                            ]}
                        >
                            <Text style={styles.emailVerificationPrimaryText}>
                                {isAuthActionLoading ? '확인 중...' : '인증 완료 확인'}
                            </Text>
                        </Pressable>
                        <View style={styles.emailVerificationActionRow}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isAuthActionLoading}
                                onPress={handleResendEmailVerification}
                                style={({ pressed }) => [
                                    styles.emailVerificationSecondaryButton,
                                    pressed && !isAuthActionLoading ? styles.linkPressed : null
                                ]}
                            >
                                <Text style={styles.emailVerificationSecondaryText}>메일 다시 보내기</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isAuthActionLoading}
                                onPress={() => {
                                    void signOut();
                                }}
                                style={({ pressed }) => [
                                    styles.emailVerificationSecondaryButton,
                                    pressed && !isAuthActionLoading ? styles.linkPressed : null
                                ]}
                            >
                                <Text style={styles.emailVerificationSecondaryText}>다른 계정 사용</Text>
                            </Pressable>
                        </View>
                    </View>
                ) : null}

                {!needsEmailVerification ? (
                    <View style={styles.providerButtonStack}>
                    {isCheckingProviderAvailability ? (
                        <View style={styles.accountCard}>
                            <Text style={styles.accountLabel}>로그인 준비</Text>
                            <Text style={styles.accountValue}>로그인 방식을 확인하고 있어요.</Text>
                        </View>
                    ) : socialButtons.length > 0 ? (
                        socialButtons.map(({ provider, label, onPress }) => (
                            <Pressable
                                key={provider}
                                disabled={isAuthActionLoading}
                                onPress={() => {
                                    void onPress();
                                }}
                                style={({ pressed }) => [
                                    styles.socialProviderButton,
                                    provider === 'kakao' ? styles.socialProviderButtonKakao : null,
                                    provider === 'google' ? styles.socialProviderButtonGoogle : null,
                                    provider === 'naver' ? styles.socialProviderButtonNaver : null,
                                    provider === 'apple' ? styles.socialProviderButtonApple : null,
                                    isAuthActionLoading ? styles.primaryButtonDisabled : null,
                                    pressed && !isAuthActionLoading ? styles.socialProviderButtonPressed : null
                                ]}
                            >
                                <View style={styles.socialProviderButtonContent}>
                                    <View
                                        style={[
                                            styles.socialProviderIconSlot,
                                            provider === 'kakao' ? styles.socialProviderIconSlotKakao : null,
                                            provider === 'naver' ? styles.socialProviderIconSlotNaver : null
                                        ]}
                                    >
                                        <SocialProviderIcon provider={provider} styles={styles} />
                                    </View>
                                    <Text
                                        numberOfLines={1}
                                        style={[
                                            styles.socialProviderButtonText,
                                            provider === 'kakao' ? styles.socialProviderButtonTextDark : null,
                                            provider === 'google' ? styles.socialProviderButtonTextDark : null,
                                            provider === 'naver' ? styles.socialProviderButtonTextLight : null,
                                            provider === 'apple' ? styles.socialProviderButtonTextLight : null
                                        ]}
                                    >
                                        {label}
                                    </Text>
                                    <View style={styles.socialProviderIconSlot} />
                                </View>
                            </Pressable>
                        ))
                    ) : shouldShowProviderAvailabilityRetry ? (
                        <Pressable
                            disabled={isProviderAvailabilityLoading}
                            onPress={() => {
                                void loadProviderAvailability();
                            }}
                            style={({ pressed }) => [
                                styles.primaryButton,
                                isProviderAvailabilityLoading ? styles.primaryButtonDisabled : null,
                                pressed && !isProviderAvailabilityLoading ? styles.primaryButtonPressed : null
                            ]}
                        >
                            <Text style={styles.primaryButtonText}>
                                {isProviderAvailabilityLoading ? '확인 중...' : '로그인 방식 다시 확인'}
                            </Text>
                        </Pressable>
                    ) : (
                        <Pressable
                            disabled={
                                isAuthActionLoading
                                || (needsMandatoryAgreement && isAgreementStateResolved && !isAllRequiredAgreementsChecked)
                            }
                            onPress={handlePrimaryAction}
                            style={({ pressed }) => [
                                styles.primaryButton,
                                needsMandatoryAgreement && isAgreementStateResolved && !isAllRequiredAgreementsChecked
                                    ? styles.primaryButtonBlocked
                                    : null,
                                isAuthActionLoading ? styles.primaryButtonDisabled : null,
                                pressed && !isAuthActionLoading ? styles.primaryButtonPressed : null
                            ]}
                        >
                            <Text style={styles.primaryButtonText}>
                                {isAuthActionLoading
                                    ? '처리 중...'
                                    : needsMandatoryAgreement
                                        ? shouldRetryAgreementState
                                            ? '약관 상태 다시 확인'
                                            : '동의하고 시작하기'
                                        : '데모 로그인으로 계속'}
                            </Text>
                        </Pressable>
                    )}
                    </View>
                ) : null}

                {!needsEmailVerification && !needsMandatoryAgreement && authMode !== 'mock' ? (
                    <View style={styles.emailLoginBlock}>
                        <Pressable
                            accessibilityRole="button"
                            disabled={isAuthActionLoading}
                            onPress={() => {
                                navigation.navigate('EmailAuth');
                            }}
                            style={({ pressed }) => [
                                styles.emailLoginToggleButton,
                                pressed && !isAuthActionLoading ? styles.linkPressed : null
                            ]}
                        >
                            <Text style={styles.emailLoginToggleText}>이메일로 로그인/가입</Text>
                        </Pressable>
                    </View>
                ) : null}

                {!needsMandatoryAgreement && authMode === 'mock' ? (
                    <View style={styles.secondaryInfoButton}>
                        <Text style={styles.secondaryInfoButtonText}>게스트 모드로 먼저 둘러볼 수도 있어요.</Text>
                    </View>
                ) : null}
            </View>

            {needsMandatoryAgreement && shouldRetryAgreementState ? (
                <View style={styles.bannerCard}>
                    <Text style={styles.bannerText}>
                        약관 동의 상태를 아직 확인하지 못했어요. 상태를 다시 확인한 뒤에만 앱에 들어갈 수 있어요.
                    </Text>
                </View>
            ) : null}

            <View style={styles.footerLinkBlock}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isSupportPolicyOpen }}
                    onPress={() => {
                        setIsSupportPolicyOpen((currentValue) => !currentValue);
                    }}
                    style={({ pressed }) => [
                        styles.footerPolicyButton,
                        pressed ? styles.linkPressed : null
                    ]}
                >
                    <View style={styles.footerPolicyButtonCopy}>
                        <Text style={styles.footerPolicyButtonTitle}>문의/운영정책</Text>
                        <Text style={styles.footerPolicyButtonDescription}>
                            문의와 약관은 여기서 확인할 수 있어요.
                        </Text>
                    </View>
                    <Ionicons
                        name={isSupportPolicyOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={theme.colors.textSecondary}
                    />
                </Pressable>

                {isSupportPolicyOpen ? (
                    <View style={styles.footerPolicyPanel}>
                        {SUPPORT_POLICY_LINKS.map((item) => (
                            <Pressable
                                key={item.label}
                                accessibilityRole="link"
                                onPress={() => {
                                    openLegalPage(item.url, item.label);
                                }}
                                style={({ pressed }) => [
                                    styles.footerPolicyLink,
                                    pressed ? styles.linkPressed : null
                                ]}
                            >
                                <Ionicons
                                    name={item.icon}
                                    size={17}
                                    color={item.url === KAKAO_SUPPORT_CHAT_URL
                                        ? theme.colors.accent
                                        : theme.colors.textSecondary}
                                />
                                <Text style={[
                                    styles.footerPolicyLinkText,
                                    item.url === KAKAO_SUPPORT_CHAT_URL
                                        ? styles.footerPolicyLinkTextPrimary
                                        : null
                                ]}>
                                    {item.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                ) : null}
            </View>

            {authModeNotice ? (
                <View style={[styles.bannerCard, styles.bannerCardInfo]}>
                    <Text style={styles.bannerText}>{authModeNotice}</Text>
                </View>
            ) : null}
            {bootstrapError ? (
                <View style={styles.stateBlock}>
                    <EmptyState
                        title={
                            isBootstrapPendingDeletionIssue
                                ? '계정 삭제가 진행 중이에요.'
                                : isBootstrapNetworkIssue
                                    ? '연결을 확인해 주세요.'
                                    : '세션을 다시 확인해 주세요.'
                        }
                        description={bootstrapError}
                        supportText={
                            isBootstrapPendingDeletionIssue
                                ? '삭제 요청을 취소하는 기능은 제공하지 않아요. 웹 안내 페이지에서 동일한 내용을 확인할 수 있어요.'
                                : isBootstrapNetworkIssue
                                ? '연결이 돌아오면 현재 계정 상태를 다시 확인하고 로그인할 수 있어요.'
                                : undefined
                        }
                        actionLabel={isBootstrapPendingDeletionIssue ? undefined : isBootstrapNetworkIssue ? '다시 연결 시도' : '다시 확인'}
                        tone={isBootstrapPendingDeletionIssue || isBootstrapNetworkIssue ? 'warning' : 'default'}
                        onAction={() => {
                            void retryBootstrap();
                        }}
                        actionDisabled={isAuthActionLoading}
                    />
                </View>
            ) : null}
            {authActionError && needsMandatoryAgreement ? (
                <View style={styles.stateBlock}>
                    <EmptyState
                        title="동의 상태를 저장하지 못했어요."
                        description={authActionError}
                        tone="warning"
                        actionDisabled={isAuthActionLoading}
                    />
                </View>
            ) : null}

            <View style={styles.debugBlock}>
                <DebugInfoCard
                    screen="AuthGate"
                            dataState={
                        isAuthActionLoading
                            ? needsMandatoryAgreement
                                ? shouldRetryAgreementState
                                    ? 'retrying-agreement-check'
                                    : 'saving-agreement'
                                : 'signing-in'
                            : needsMandatoryAgreement
                                ? shouldRetryAgreementState
                                    ? 'awaiting-agreement-check'
                                    : 'awaiting-agreement'
                                : 'awaiting-auth'
                    }
                    lastDataError={authActionError || bootstrapError}
                />
            </View>
        </ScrollView>
    );
}

const createStyles = (theme: AppTheme) => {
    const isDarkMode = theme.mode === 'dark';
    const authColors = {
        background: theme.colors.background,
        textPrimary: theme.colors.textPrimary,
        textSecondary: theme.colors.textSecondary,
        cardSurface: theme.colors.surface,
        cardBorder: theme.colors.border,
        cardShadow: '#1A1C20',
        cardShadowOpacity: isDarkMode ? 0.22 : 0.08,
        softSurface: theme.colors.surfaceMuted,
        softBrandSurface: theme.colors.accentSoft,
        primaryButton: theme.colors.accent,
        primaryButtonBlocked: theme.colors.border,
        primaryButtonText: '#FFFFFF',
        pillText: theme.colors.accent,
        mutedLine: theme.colors.border,
        checkboxFill: theme.colors.accent,
        checkboxText: '#FFFFFF',
        bannerInfoBorder: isDarkMode ? 'rgba(255, 102, 0, 0.22)' : 'rgba(255, 102, 0, 0.18)',
        bannerInfoBackground: theme.colors.accentSoft
    } as const;

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: authColors.background
        },
        agreementScreen: {
            flex: 1,
            backgroundColor: authColors.background
        },
        agreementTopBar: {
            minHeight: 56,
            paddingHorizontal: theme.spacing.sm,
            justifyContent: 'center'
        },
        agreementBackButton: {
            width: 40,
            height: 40,
            alignItems: 'flex-start',
            justifyContent: 'center'
        },
        agreementIntro: {
            minHeight: 208,
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingHorizontal: theme.spacing.md,
            paddingBottom: theme.spacing.md
        },
        agreementIntroTitle: {
            color: authColors.textPrimary,
            fontSize: 24,
            lineHeight: 30,
            fontFamily: theme.fonts.bold,
            textAlign: 'center'
        },
        agreementIntroDescription: {
            marginTop: theme.spacing.sm,
            color: authColors.textSecondary,
            fontSize: 15,
            lineHeight: 22,
            fontFamily: theme.fonts.body,
            textAlign: 'center'
        },
        agreementDivider: {
            height: 1,
            marginHorizontal: theme.spacing.lg,
            backgroundColor: theme.colors.border
        },
        agreementBody: {
            paddingTop: theme.spacing.sm,
            paddingHorizontal: theme.spacing.sm
        },
        agreementAllButton: {
            minHeight: 52,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs
        },
        agreementAllButtonText: {
            color: '#FFFFFF',
            fontSize: 15,
            lineHeight: 21,
            fontFamily: theme.fonts.bold
        },
        agreementList: {
            marginTop: theme.spacing.sm,
            gap: theme.spacing.sm
        },
        agreementItemRow: {
            minHeight: 40,
            flexDirection: 'row',
            alignItems: 'center'
        },
        agreementCheckboxButton: {
            width: 36,
            height: 36,
            alignItems: 'flex-start',
            justifyContent: 'center'
        },
        agreementSquare: {
            width: 22,
            height: 22,
            borderWidth: 2,
            borderColor: theme.colors.textSecondary,
            backgroundColor: 'transparent',
            alignItems: 'center',
            justifyContent: 'center'
        },
        agreementSquareChecked: {
            borderColor: theme.colors.accent,
            backgroundColor: theme.colors.accent
        },
        agreementItemCopy: {
            flex: 1,
            minHeight: 36,
            justifyContent: 'center'
        },
        agreementItemText: {
            color: authColors.textPrimary,
            fontSize: 15,
            lineHeight: 22,
            fontFamily: theme.fonts.body
        },
        agreementViewLink: {
            minWidth: 44,
            minHeight: 36,
            alignItems: 'flex-end',
            justifyContent: 'center'
        },
        agreementViewLinkPlaceholder: {
            minWidth: 44
        },
        agreementViewLinkText: {
            color: authColors.textSecondary,
            fontSize: 14,
            lineHeight: 20,
            fontFamily: theme.fonts.body,
            textDecorationLine: 'underline'
        },
        agreementErrorText: {
            marginTop: theme.spacing.md,
            paddingHorizontal: theme.spacing.sm,
            color: theme.colors.warning,
            fontSize: 13,
            lineHeight: 19,
            fontFamily: theme.fonts.body,
            textAlign: 'center'
        },
        agreementBottomBar: {
            marginTop: 'auto',
            paddingHorizontal: theme.spacing.sm,
            paddingTop: theme.spacing.xs,
            backgroundColor: authColors.background
        },
        agreementStartButton: {
            minHeight: 52,
            borderRadius: theme.radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent
        },
        agreementStartButtonDisabled: {
            backgroundColor: theme.colors.border
        },
        agreementStartButtonText: {
            color: '#FFFFFF',
            fontSize: 15,
            lineHeight: 21,
            fontFamily: theme.fonts.bold
        },
        agreementStartButtonTextDisabled: {
            color: theme.colors.surface
        },
        content: {
            flexGrow: 1,
            position: 'relative',
            paddingHorizontal: theme.spacing.md
        },
        heroBlock: {
            alignItems: 'center'
        },
        logoImage: {
            width: 44,
            height: 44,
            tintColor: theme.colors.accent
        },
        brand: {
            marginTop: theme.spacing.sm,
            fontFamily: theme.fonts.display,
            fontSize: 42,
            lineHeight: 44,
            color: authColors.textPrimary
        },
        welcomeCard: {
            marginTop: theme.spacing.xl
        },
        welcomeCopyBlock: {
            height: 80,
            alignItems: 'center',
            justifyContent: 'center'
        },
        welcomeTitle: {
            textAlign: 'center',
            color: authColors.textPrimary,
            fontSize: 24,
            fontFamily: theme.fonts.bold
        },
        welcomeDescription: {
            marginTop: theme.spacing.sm,
            textAlign: 'center',
            color: authColors.textSecondary,
            fontSize: 14,
            lineHeight: 21,
            fontFamily: theme.fonts.medium
        },
    accountCard: {
        marginTop: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: authColors.cardBorder
    },
    accountLabel: {
        color: authColors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    accountValue: {
        marginTop: 4,
        color: authColors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
    primaryButton: {
        minHeight: 50,
        borderRadius: theme.radius.md,
        backgroundColor: authColors.primaryButton,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.md
    },
    primaryButtonBlocked: {
        backgroundColor: authColors.primaryButtonBlocked
    },
    primaryButtonDisabled: {
        opacity: 0.6
    },
    primaryButtonPressed: {
        transform: [{ scale: 0.99 }]
    },
    primaryButtonText: {
        color: authColors.primaryButtonText,
        fontSize: 16,
        fontFamily: theme.fonts.bold
    },
    providerButtonStack: {
        marginTop: theme.spacing.lg,
        paddingHorizontal: theme.spacing.xs,
        gap: theme.spacing.sm
    },
    emailVerificationCard: {
        marginTop: theme.spacing.md,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: authColors.cardBorder,
        backgroundColor: authColors.softSurface,
        gap: theme.spacing.sm
    },
    emailVerificationTitle: {
        color: authColors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    emailVerificationDescription: {
        color: authColors.textSecondary,
        fontSize: 14,
        lineHeight: 21,
        fontFamily: theme.fonts.body
    },
    emailVerificationNotice: {
        color: authColors.textPrimary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.semibold
    },
    emailVerificationPrimaryButton: {
        minHeight: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: authColors.primaryButton
    },
    emailVerificationPrimaryText: {
        color: authColors.primaryButtonText,
        fontSize: 15,
        fontFamily: theme.fonts.bold
    },
    emailVerificationActionRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs
    },
    emailVerificationSecondaryButton: {
        flex: 1,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.sm,
        backgroundColor: authColors.softSurface
    },
    emailVerificationSecondaryText: {
        color: authColors.textPrimary,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    emailLoginBlock: {
        marginTop: theme.spacing.sm
    },
    emailLoginToggleButton: {
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.sm,
        backgroundColor: authColors.softSurface
    },
    emailLoginToggleText: {
        color: authColors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    socialProviderButton: {
        minHeight: 54,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        paddingHorizontal: theme.spacing.sm,
        justifyContent: 'center'
    },
    socialProviderButtonPressed: {
        transform: [{ scale: 0.992 }]
    },
    socialProviderButtonKakao: {
        backgroundColor: '#FEE500',
        borderColor: '#F0D900'
    },
    socialProviderButtonGoogle: {
        backgroundColor: '#FFFFFF',
        borderColor: '#D9DEE7',
        shadowColor: authColors.cardShadow,
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2
    },
    socialProviderButtonNaver: {
        backgroundColor: '#03A94D',
        borderColor: '#03A94D'
    },
    socialProviderButtonApple: {
        backgroundColor: '#111111',
        borderColor: '#111111'
    },
    socialProviderButtonContent: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    socialProviderIconSlot: {
        width: 34,
        alignItems: 'center',
        justifyContent: 'center'
    },
    socialProviderIconSlotKakao: {
        width: 32
    },
    socialProviderIconSlotNaver: {
        width: 32
    },
    socialProviderButtonText: {
        flex: 1,
        textAlign: 'center',
        fontSize: 16,
        fontFamily: theme.fonts.bold
    },
    socialProviderButtonTextDark: {
        color: '#191919'
    },
    socialProviderButtonTextLight: {
        color: '#FFFFFF'
    },
    kakaoCiImage: {
        width: 17,
        height: 17
    },
    googleCiImage: {
        width: 22,
        height: 22
    },
    naverCiImage: {
        width: 16,
        height: 16
    },
    secondaryInfoButton: {
        marginTop: theme.spacing.md,
        minHeight: 0,
        borderRadius: 0,
        borderWidth: 0,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 0,
        paddingVertical: 0
    },
    secondaryInfoButtonText: {
        color: authColors.textSecondary,
        fontSize: 13,
        fontFamily: theme.fonts.medium
    },
    footerLinkBlock: {
        marginTop: theme.spacing.xl,
        gap: theme.spacing.xs
    },
    footerPolicyButton: {
        minHeight: 56,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: authColors.cardBorder,
        backgroundColor: authColors.softSurface,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    footerPolicyButtonCopy: {
        flex: 1
    },
    footerPolicyButtonTitle: {
        color: authColors.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    footerPolicyButtonDescription: {
        marginTop: theme.spacing.micro,
        color: authColors.textSecondary,
        fontSize: 12,
        lineHeight: 17,
        fontFamily: theme.fonts.body
    },
    footerPolicyPanel: {
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: authColors.cardBorder,
        backgroundColor: authColors.background,
        paddingVertical: theme.spacing.xs
    },
    footerPolicyLink: {
        minHeight: 40,
        paddingHorizontal: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    footerPolicyLinkText: {
        flex: 1,
        color: authColors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.medium
    },
    footerPolicyLinkTextPrimary: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold
    },
    linkPressed: {
        opacity: 0.82
    },
    bannerCard: {
        marginTop: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.lg,
        borderWidth: 1
    },
    bannerCardInfo: {
        borderColor: authColors.bannerInfoBorder,
        backgroundColor: authColors.bannerInfoBackground
    },
    bannerText: {
        color: authColors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    stateBlock: {
        marginTop: theme.spacing.md
    },
    debugBlock: {
        marginTop: theme.spacing.md
    }
    });
};
