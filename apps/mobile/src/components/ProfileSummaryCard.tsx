import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AvatarImage } from '@/components/AvatarImage';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileProfileSummary } from '@/types/profile';

type Props = {
    summary: MobileProfileSummary;
    isLoading?: boolean;
    travelStat?: {
        label: string;
        value: string;
    } | null;
    showTopLabels?: boolean;
};

function getPrimaryLabel(summary: MobileProfileSummary) {
    const displayName = summary.displayName.trim();
    if (displayName) {
        return displayName;
    }

    const email = summary.email.trim();
    if (email.includes('@')) {
        return email.split('@')[0];
    }

    if (email) {
        return email;
    }

    return 'PLIN 사용자';
}

function getSupportLabel(summary: MobileProfileSummary, isLoading: boolean) {
    if (isLoading) {
        return '프로필을 확인하고 있어요.';
    }

    if (!summary.photoURL) {
        return '프로필 사진은 아직 없어요.';
    }

    return '';
}

function getSourceLabel(summary: MobileProfileSummary, isLoading: boolean) {
    if (isLoading) {
        return '동기화 중';
    }

    return summary.source === 'profile' ? '프로필 연동' : '기본 정보';
}

export function ProfileSummaryCard({
    summary,
    isLoading = false,
    travelStat = null,
    showTopLabels = true
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const primaryLabel = getPrimaryLabel(summary);
    const supportLabel = getSupportLabel(summary, isLoading);

    return (
        <View style={styles.container}>
            {showTopLabels ? (
                <View style={styles.topRow}>
                    <View style={styles.eyebrowPill}>
                        <Text style={styles.eyebrowPillText}>프로필 요약</Text>
                    </View>
                    <View style={[styles.statusPill, isLoading ? styles.statusPillLoading : null]}>
                        <Text style={[styles.statusPillText, isLoading ? styles.statusPillTextLoading : null]}>
                            {getSourceLabel(summary, isLoading)}
                        </Text>
                    </View>
                </View>
            ) : null}

            <View style={[styles.mainRow, !showTopLabels ? styles.mainRowCompact : null]}>
                <View style={styles.avatarFrame}>
                    <AvatarImage
                        uri={summary.photoURL}
                        label={getPrimaryLabel(summary)}
                        size={52}
                        textSize={18}
                        tone="accent"
                    />
                </View>

                <View style={styles.copy}>
                    <Text style={styles.name}>{primaryLabel}</Text>
                </View>

                {travelStat ? (
                    <View style={styles.travelStatCard}>
                        <Text style={styles.travelStatValue}>{travelStat.value}</Text>
                        <Text style={styles.travelStatLabel}>{travelStat.label}</Text>
                    </View>
                ) : null}
            </View>

            {summary.source === 'auth' && !travelStat ? (
                <View style={styles.inlineMetaPill}>
                    <Text style={styles.inlineMetaPillText}>기본 계정 정보</Text>
                </View>
            ) : null}

            {supportLabel ? (
                <View style={styles.supportCard}>
                    <Text style={styles.support}>{supportLabel}</Text>
                </View>
            ) : null}
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    eyebrowPill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 4,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    eyebrowPillText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    statusPill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    statusPillLoading: {
        backgroundColor: theme.colors.accentSoft
    },
    statusPillText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    statusPillTextLoading: {
        color: theme.colors.accent
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: theme.spacing.sm
    },
    mainRowCompact: {
        marginTop: 0
    },
    avatarFrame: {
        padding: 4,
        borderRadius: theme.radius.full,
        backgroundColor: theme.mode === 'dark' ? '#2b241e' : '#f4ecdf'
    },
    copy: {
        flex: 1,
        marginLeft: theme.spacing.sm
    },
    name: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        minHeight: 24,
        fontFamily: theme.fonts.bold
    },
    travelStatCard: {
        minWidth: 86,
        marginLeft: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        alignItems: 'center'
    },
    travelStatValue: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    travelStatLabel: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    inlineMetaPill: {
        alignSelf: 'flex-start',
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    inlineMetaPillText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    supportCard: {
        marginTop: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    support: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    }
});
