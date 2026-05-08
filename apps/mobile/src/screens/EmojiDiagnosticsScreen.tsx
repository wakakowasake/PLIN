import React from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAdapters } from '@/adapters/useAdapters';
import { BottomNavBar } from '@/components/BottomNavBar';
import { EmojiText, emojiSafeFontFamily } from '@/components/EmojiText';
import { EmptyState } from '@/components/EmptyState';
import { LoadingView } from '@/components/LoadingView';
import { isPrivilegedDebugUser } from '@/dev/debug-access';
import {
    formatUnicodeInspection,
    inspectUnicode,
    logUnicodeBoundary
} from '@/dev/unicode-diagnostics';
import { useAuthSession } from '@/hooks/useAuthSession';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { usePrimaryScrollActivityReporter } from '@/state/primary-scroll-activity';
import { type AppTheme, useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'EmojiDiagnostics'>;

type EmojiDiagnosticSample = {
    key: string;
    label: string;
    value: string;
    source: 'fixed' | 'live';
};

type LiveEmojiSamples = {
    tripTitle: string;
    tripSubInfo: string;
    communityCommentText: string;
    communityAuthorName: string;
};

const FIXED_SAMPLES: EmojiDiagnosticSample[] = [
    { key: 'fixed-trip', label: '고정 샘플 1', value: '여행😊', source: 'fixed' },
    { key: 'fixed-heart', label: '고정 샘플 2', value: '서울❤️부산', source: 'fixed' },
    { key: 'fixed-family', label: '고정 샘플 3', value: '👨‍👩‍👧‍👦 가족여행', source: 'fixed' },
    { key: 'fixed-flags', label: '고정 샘플 4', value: '🇰🇷✈️🇯🇵', source: 'fixed' }
];

function DiagnosticVariant({
    label,
    value,
    mode,
    theme
}: {
    label: string;
    value: string;
    mode: 'plain' | 'app' | 'system' | 'custom' | 'emojiText';
    theme: AppTheme;
}) {
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    let content: React.ReactNode = null;

    if (mode === 'plain') {
        content = <Text style={styles.variantPlain}>{value}</Text>;
    } else if (mode === 'app') {
        content = <Text style={styles.variantApp}>{value}</Text>;
    } else if (mode === 'system') {
        content = <Text style={styles.variantSystem}>{value}</Text>;
    } else if (mode === 'custom') {
        content = <Text style={styles.variantCustom}>{value}</Text>;
    } else {
        content = <EmojiText style={styles.variantCustom}>{value}</EmojiText>;
    }

    return (
        <View style={styles.variantRow}>
            <Text style={styles.variantLabel}>{label}</Text>
            <View style={styles.variantValueBox}>
                {content}
            </View>
        </View>
    );
}

function SampleCard({ sample, theme }: { sample: EmojiDiagnosticSample; theme: AppTheme }) {
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const inspection = React.useMemo(() => inspectUnicode(sample.value), [sample.value]);

    return (
        <View style={styles.sampleCard}>
            <View style={styles.sampleHeader}>
                <Text style={styles.sampleTitle}>{sample.label}</Text>
                <View style={styles.sampleSourcePill}>
                    <Text style={styles.sampleSourceText}>
                        {sample.source === 'fixed' ? '고정값' : '실데이터'}
                    </Text>
                </View>
            </View>

            <DiagnosticVariant label="기본 Text" value={sample.value} mode="plain" theme={theme} />
            <DiagnosticVariant label="현재 앱 스타일" value={sample.value} mode="app" theme={theme} />
            <DiagnosticVariant label="시스템 폰트" value={sample.value} mode="system" theme={theme} />
            <DiagnosticVariant label="커스텀 폰트" value={sample.value} mode="custom" theme={theme} />
            <DiagnosticVariant label="EmojiText" value={sample.value} mode="emojiText" theme={theme} />

            <View style={styles.sampleMetaBox}>
                <Text style={styles.sampleMetaText}>{formatUnicodeInspection(inspection)}</Text>
            </View>
        </View>
    );
}

export function EmojiDiagnosticsScreen({}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { user, profileSummary } = useAuthSession();
    const {
        authMode,
        communityRepositoryMode,
        tripRepository,
        communityRepository
    } = useAdapters();
    const { notifyPrimaryScrollActivity, scrollEventThrottle } = usePrimaryScrollActivityReporter();
    const [isLoading, setIsLoading] = React.useState(true);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [reloadKey, setReloadKey] = React.useState(0);
    const [liveSamples, setLiveSamples] = React.useState<LiveEmojiSamples>({
        tripTitle: '',
        tripSubInfo: '',
        communityCommentText: '',
        communityAuthorName: ''
    });
    const interfaceIdiom = React.useMemo(() => {
        const constants = Platform.constants as { interfaceIdiom?: string } | undefined;
        return constants?.interfaceIdiom || 'unknown';
    }, []);
    const canAccessDiagnostics = isPrivilegedDebugUser(profileSummary, user);

    if (!canAccessDiagnostics) {
        return (
            <View style={styles.shell}>
                <View style={styles.screenBody}>
                    <EmptyState
                        title="접근 권한이 없어요."
                        description="이 진단 화면은 관리자 계정에서만 열 수 있어요."
                    />
                </View>
                <BottomNavBar activeTab="Settings" />
            </View>
        );
    }

    React.useEffect(() => {
        let isMounted = true;

        async function loadLiveSamples() {
            if (!user?.uid) {
                if (isMounted) {
                    setLiveSamples({
                        tripTitle: '',
                        tripSubInfo: '',
                        communityCommentText: '',
                        communityAuthorName: ''
                    });
                    setLoadError('로그인한 계정이 없어 실데이터 샘플을 불러올 수 없어요.');
                    setIsLoading(false);
                }
                return;
            }

            setIsLoading(true);
            setLoadError(null);

            try {
                const trips = await tripRepository.listTrips(user.uid);
                const firstTrip = trips[0] || null;
                const posts = await communityRepository.listPosts(user.uid);
                const firstPost = posts[0] || null;
                const comments = firstPost
                    ? await communityRepository.listComments(user.uid, firstPost.id)
                    : [];
                const firstComment = comments[0] || null;

                if (!isMounted) {
                    return;
                }

                setLiveSamples({
                    tripTitle: firstTrip?.title || '',
                    tripSubInfo: firstTrip?.subInfo || '',
                    communityCommentText: firstComment?.text || '',
                    communityAuthorName: firstComment?.authorName || firstPost?.authorName || ''
                });
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                setLoadError(
                    error instanceof Error && error.message
                        ? error.message
                        : '실데이터 샘플을 불러오지 못했어요.'
                );
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        void loadLiveSamples();

        return () => {
            isMounted = false;
        };
    }, [communityRepository, reloadKey, tripRepository, user?.uid]);

    const liveDiagnosticSamples = React.useMemo<EmojiDiagnosticSample[]>(() => ([
        {
            key: 'live-trip-title',
            label: '실제 Trip 제목',
            value: liveSamples.tripTitle || '실데이터 여행 제목 없음',
            source: 'live'
        },
        {
            key: 'live-trip-subinfo',
            label: '실제 Trip subInfo',
            value: liveSamples.tripSubInfo || '실데이터 subInfo 없음',
            source: 'live'
        },
        {
            key: 'live-comment-text',
            label: '실제 커뮤니티 댓글',
            value: liveSamples.communityCommentText || '실데이터 댓글 없음',
            source: 'live'
        },
        {
            key: 'live-author-name',
            label: '실제 커뮤니티 작성자명',
            value: liveSamples.communityAuthorName || '실데이터 작성자명 없음',
            source: 'live'
        }
    ]), [liveSamples]);

    React.useEffect(() => {
        FIXED_SAMPLES.forEach((sample) => {
            logUnicodeBoundary('render:emoji-diagnostics', sample.key, sample.value, {
                source: sample.source
            });
        });
    }, []);

    React.useEffect(() => {
        liveDiagnosticSamples.forEach((sample) => {
            logUnicodeBoundary('render:emoji-diagnostics', sample.key, sample.value, {
                source: sample.source
            });
        });
    }, [liveDiagnosticSamples]);

    return (
        <View style={styles.shell}>
            <View style={styles.screenBody}>
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={styles.content}
                    onScroll={notifyPrimaryScrollActivity}
                    showsVerticalScrollIndicator={false}
                    scrollEventThrottle={scrollEventThrottle}
                >
                    <View style={styles.heroCard}>
                        <View style={styles.heroBadge}>
                            <Text style={styles.heroBadgeText}>DEV ONLY</Text>
                        </View>
                        <Text style={styles.title}>Emoji Diagnostics</Text>
                        <Text style={styles.subtitle}>
                            같은 문자열이 raw, canonical, mapper, render 경계에서 언제 깨지는지
                            확인하는 진단 화면입니다.
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTitle}>현재 환경</Text>
                            <View style={styles.cardPill}>
                                <Text style={styles.cardPillText}>자동 수집</Text>
                            </View>
                        </View>
                        <Text style={styles.infoLine}>platform: {Platform.OS}</Text>
                        <Text style={styles.infoLine}>platformVersion: {String(Platform.Version)}</Text>
                        <Text style={styles.infoLine}>interfaceIdiom: {interfaceIdiom}</Text>
                        <Text style={styles.infoLine}>dev: {__DEV__ ? 'true' : 'false'}</Text>
                        <Text style={styles.infoLine}>authMode: {authMode}</Text>
                        <Text style={styles.infoLine}>communityRepositoryMode: {communityRepositoryMode}</Text>
                        <Text style={styles.infoLine}>emojiSafeFont: {emojiSafeFontFamily || 'none'}</Text>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTitle}>수동 환경 체크</Text>
                            <View style={styles.cardPill}>
                                <Text style={styles.cardPillText}>비교 매트릭스</Text>
                            </View>
                        </View>
                        <Text style={styles.checklistLine}>1. 현재 iOS 시뮬레이터에서 재현 여부 확인</Text>
                        <Text style={styles.checklistLine}>2. 새 시뮬레이터 디바이스 1개 생성 후 같은 샘플 재확인</Text>
                        <Text style={styles.checklistLine}>3. Erase Content and Settings 후 동일 샘플 재확인</Text>
                        <Text style={styles.checklistLine}>4. 실제 아이폰 dev build에서 같은 샘플 확인</Text>
                        <Text style={styles.checklistLine}>5. Xcode 버전 / iOS runtime / Expo dev build 여부 기록</Text>
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTitle}>고정 샘플</Text>
                            <View style={styles.cardPill}>
                                <Text style={styles.cardPillText}>하드코딩</Text>
                            </View>
                        </View>
                        {FIXED_SAMPLES.map((sample) => (
                            <SampleCard key={sample.key} sample={sample} theme={theme} />
                        ))}
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTitle}>실데이터 샘플</Text>
                            <View style={styles.cardPill}>
                                <Text style={styles.cardPillText}>repository 경유</Text>
                            </View>
                        </View>

                        {isLoading ? (
                            <LoadingView
                                title="실데이터 샘플 준비 중"
                                message="첫 trip 제목과 첫 댓글을 읽어와서 같은 문자열을 여러 방식으로 비교하고 있어요."
                                fullscreen={false}
                            />
                        ) : loadError ? (
                            <EmptyState
                                title="실데이터 샘플을 준비하지 못했어요."
                                description={loadError}
                                actionLabel="다시 시도"
                                onAction={() => {
                                    setReloadKey((currentValue) => currentValue + 1);
                                }}
                            />
                        ) : (
                            liveDiagnosticSamples.map((sample) => (
                                <SampleCard key={sample.key} sample={sample} theme={theme} />
                            ))
                        )}
                    </View>

                    <View style={styles.card}>
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTitle}>판정 기준</Text>
                            <View style={styles.cardPill}>
                                <Text style={styles.cardPillText}>A / B / C / D</Text>
                            </View>
                        </View>
                        <Text style={styles.checklistLine}>A. raw / normalize 로그에 이미 U+FFFD 또는 깨진 문자열이 있으면 데이터 파이프라인 문제</Text>
                        <Text style={styles.checklistLine}>B. raw 문자열은 정상인데 앱 스타일에서만 깨지면 앱 폰트 렌더링 문제</Text>
                        <Text style={styles.checklistLine}>C. 시스템 Text도 시뮬레이터만 깨지고 실기기는 정상이라면 iOS simulator runtime 문제</Text>
                        <Text style={styles.checklistLine}>D. 시스템 Text도 시뮬레이터와 실기기 모두 깨지면 RN / Expo 엔진 조합 문제</Text>
                    </View>
                </ScrollView>
            </View>
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
        flex: 1
    },
    content: {
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.lg
    },
    heroCard: {
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.sm
    },
    heroBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted,
        marginBottom: theme.spacing.xs
    },
    heroBadgeText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    title: {
        color: theme.colors.textPrimary,
        fontSize: 28,
        fontFamily: theme.fonts.display
    },
    subtitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 21,
        fontFamily: theme.fonts.body
    },
    card: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.xs
    },
    cardTitle: {
        color: theme.colors.textPrimary,
        fontSize: 17,
        fontFamily: theme.fonts.bold
    },
    cardPill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    cardPillText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    infoLine: {
        marginTop: 4,
        color: theme.colors.textPrimary,
        fontSize: 13,
        lineHeight: 19,
        fontFamily: theme.fonts.body
    },
    checklistLine: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 13,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    sampleCard: {
        marginTop: theme.spacing.xs,
        padding: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    sampleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.xs
    },
    sampleTitle: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
    sampleSourcePill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 4,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface
    },
    sampleSourceText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    variantRow: {
        marginTop: theme.spacing.xs
    },
    variantLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold,
        marginBottom: 4
    },
    variantValueBox: {
        minHeight: 42,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface
    },
    variantPlain: {
        color: theme.colors.textPrimary,
        fontSize: 17
    },
    variantApp: {
        color: theme.colors.textPrimary,
        fontSize: 17,
        fontFamily: theme.fonts.bold
    },
    variantSystem: {
        color: theme.colors.textPrimary,
        fontSize: 17,
        fontFamily: Platform.select({
            ios: 'System',
            android: 'sans-serif',
            default: 'System'
        })
    },
    variantCustom: {
        color: theme.colors.textPrimary,
        fontSize: 17,
        fontFamily: theme.fonts.bold
    },
    sampleMetaBox: {
        marginTop: theme.spacing.xs,
        padding: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface
    },
    sampleMetaText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        lineHeight: 17,
        fontFamily: theme.fonts.body
    }
});
