import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type AppTheme, useAppTheme } from '@/theme';

type Props = {
    title: string;
    description?: string;
    supportText?: string;
    actionLabel?: string;
    onAction?: () => void;
    actionDisabled?: boolean;
    tone?: 'default' | 'warning';
};

function getToneLabel(tone: 'default' | 'warning') {
    return tone === 'warning' ? '연결 확인' : '상태 안내';
}

export function EmptyState({
    title,
    description,
    supportText,
    actionLabel,
    onAction,
    actionDisabled = false,
    tone = 'default'
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <View
            style={[
                styles.container,
                tone === 'warning' ? styles.containerWarning : null
            ]}
        >
            {tone === 'warning' ? (
                <View style={styles.topRow}>
                    <View style={[styles.eyebrowPill, styles.eyebrowPillWarning]}>
                        <Text style={[styles.eyebrowPillText, styles.eyebrowPillTextWarning]}>
                            {getToneLabel(tone)}
                        </Text>
                    </View>
                </View>
            ) : null}

            <Text style={[styles.title, tone === 'warning' ? styles.titleWithPill : null]}>{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
            {supportText ? (
                <View style={[
                    styles.supportCard,
                    tone === 'warning' ? styles.supportCardWarning : null
                ]}>
                    <Text style={styles.supportText}>{supportText}</Text>
                </View>
            ) : null}
            {actionLabel && onAction ? (
                <Pressable
                    accessibilityRole="button"
                    disabled={actionDisabled}
                    onPress={onAction}
                    style={({ pressed }) => [
                        styles.actionButton,
                        tone === 'warning' ? styles.actionButtonWarning : null,
                        actionDisabled ? styles.actionButtonDisabled : null,
                        pressed && !actionDisabled ? styles.actionButtonPressed : null
                    ]}
                >
                    <Text style={styles.actionLabel}>{actionLabel}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2
    },
    containerWarning: {
        borderColor: theme.mode === 'dark' ? '#6b4a3d' : '#e3b7a2',
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'flex-start'
    },
    eyebrowPill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 4,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    eyebrowPillWarning: {
        backgroundColor: theme.colors.warningSoft
    },
    eyebrowPillText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    eyebrowPillTextWarning: {
        color: theme.colors.warning
    },
    title: {
        fontSize: 20,
        lineHeight: 26,
        fontFamily: theme.fonts.bold,
        color: theme.colors.textPrimary
    },
    titleWithPill: {
        marginTop: theme.spacing.sm
    },
    description: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 21,
        fontFamily: theme.fonts.body
    },
    supportCard: {
        marginTop: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    supportCardWarning: {
        backgroundColor: theme.mode === 'dark' ? '#3a2a23' : '#f8e5db'
    },
    supportText: {
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    actionButton: {
        marginTop: theme.spacing.sm,
        alignSelf: 'flex-start',
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.accent
    },
    actionButtonWarning: {
        backgroundColor: theme.colors.warning
    },
    actionButtonPressed: {
        opacity: 0.88
    },
    actionButtonDisabled: {
        opacity: 0.45
    },
    actionLabel: {
        color: '#ffffff',
        fontFamily: theme.fonts.semibold
    }
});
