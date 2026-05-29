import React from 'react';
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import type { TripRevisionEntry } from '@/types/trip';

type Props = {
    visible: boolean;
    tripTitle: string;
    items: TripRevisionEntry[];
    loading: boolean;
    error: string | null;
    busyRevisionId?: string | null;
    actionDisabled?: boolean;
    canRestore?: boolean;
    onClose(): void;
    onRefresh?(): void;
    onRestore?(revisionId: string): void;
    onLoadMore?(): void;
    hasMore?: boolean;
};

function formatRevisionTimestamp(value: string) {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
        return '시간 정보 없음';
    }

    return new Intl.DateTimeFormat('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(parsed);
}

function operationLabel(operation: TripRevisionEntry['operation']) {
    if (operation === 'restore') {
        return '복구';
    }

    if (operation === 'meta_update') {
        return '정보 수정';
    }

    return '일정 수정';
}

function operationTone(operation: TripRevisionEntry['operation'], theme: AppTheme) {
    if (operation === 'restore') {
        return {
            backgroundColor: theme.mode === 'dark' ? 'rgba(87, 194, 122, 0.18)' : '#e9f9ef',
            color: theme.mode === 'dark' ? '#9ff0b7' : '#1c8f47'
        };
    }

    if (operation === 'meta_update') {
        return {
            backgroundColor: theme.mode === 'dark' ? 'rgba(252, 191, 73, 0.18)' : '#fff5de',
            color: theme.mode === 'dark' ? '#ffd98a' : '#9a6700'
        };
    }

    return {
        backgroundColor: theme.mode === 'dark' ? 'rgba(107, 171, 255, 0.18)' : '#eaf3ff',
        color: theme.mode === 'dark' ? '#9ec7ff' : '#2d6cdf'
    };
}

export function TripRevisionHistorySheet({
    visible,
    tripTitle,
    items,
    loading,
    error,
    busyRevisionId = null,
    actionDisabled = false,
    canRestore = false,
    onClose,
    onRefresh,
    onRestore,
    onLoadMore,
    hasMore = false
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <View style={styles.headerCopy}>
                            <Text style={styles.headerEyebrow}>수정 기록</Text>
                            <Text numberOfLines={1} style={styles.headerTitle}>
                                {tripTitle || '일정'}
                            </Text>
                            <Text style={styles.headerDescription}>
                                누가 언제 무엇을 바꿨는지 보고, 필요한 시점으로 전체 일정을 복구해요.
                            </Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="수정 기록 닫기"
                            onPress={onClose}
                            style={({ pressed }) => [
                                styles.iconButton,
                                pressed ? styles.iconButtonPressed : null
                            ]}
                        >
                            <MaterialCommunityIcons name="close" size={22} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>

                    <View style={styles.actionRow}>
                        <Pressable
                            accessibilityRole="button"
                            disabled={loading}
                            onPress={onRefresh}
                            style={({ pressed }) => [
                                styles.secondaryButton,
                                loading ? styles.secondaryButtonDisabled : null,
                                pressed && !loading ? styles.secondaryButtonPressed : null
                            ]}
                        >
                            <MaterialCommunityIcons name="refresh" size={16} color={theme.colors.textPrimary} />
                            <Text style={styles.secondaryButtonLabel}>새로고침</Text>
                        </Pressable>
                        <View style={styles.retentionBadge}>
                            <Text style={styles.retentionBadgeText}>최근 20개 / 30일 보관</Text>
                        </View>
                    </View>

                    <ScrollView
                        style={styles.scroll}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {loading ? (
                            <View style={styles.loadingState}>
                                <ActivityIndicator color={theme.colors.accent} />
                                <Text style={styles.loadingText}>수정 기록을 불러오고 있어요.</Text>
                            </View>
                        ) : null}

                        {!loading && error ? (
                            <View style={styles.messageCard}>
                                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.colors.warning} />
                                <Text style={styles.messageText}>{error}</Text>
                            </View>
                        ) : null}

                        {!loading && !error && items.length === 0 ? (
                            <View style={styles.emptyState}>
                                <MaterialCommunityIcons name="history" size={28} color={theme.colors.textSecondary} />
                                <Text style={styles.emptyStateTitle}>아직 저장된 수정 기록이 없어요.</Text>
                                <Text style={styles.emptyStateBody}>일정을 수정하고 저장하면 여기에서 기록을 확인해요.</Text>
                            </View>
                        ) : null}

                        {!loading && !error ? items.map((entry) => {
                            const tone = operationTone(entry.operation, theme);
                            const isBusy = busyRevisionId === entry.id;
                            const actorPhotoUrl = String(entry.actor.photoURL || '').trim();

                            return (
                                <View key={entry.id} style={styles.card}>
                                    <View style={styles.cardTopRow}>
                                        <View style={styles.actorRow}>
                                            {actorPhotoUrl ? (
                                                <Image source={{ uri: actorPhotoUrl }} style={styles.actorAvatar} />
                                            ) : (
                                                <View style={styles.actorAvatarFallback}>
                                                    <MaterialCommunityIcons
                                                        name="account-outline"
                                                        size={18}
                                                        color={theme.colors.textSecondary}
                                                    />
                                                </View>
                                            )}
                                            <View style={styles.actorCopy}>
                                                <Text numberOfLines={1} style={styles.actorName}>
                                                    {entry.actor.displayName || entry.actor.uid || '멤버'}
                                                </Text>
                                                <Text style={styles.actorMeta}>
                                                    {formatRevisionTimestamp(entry.createdAt)}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={[styles.operationBadge, { backgroundColor: tone.backgroundColor }]}>
                                            <Text style={[styles.operationBadgeText, { color: tone.color }]}>
                                                {operationLabel(entry.operation)}
                                            </Text>
                                        </View>
                                    </View>

                                    <Text style={styles.summaryText}>
                                        {entry.summary.text || '일정 내용 수정'}
                                    </Text>

                                    <View style={styles.versionRow}>
                                        <Text style={styles.versionText}>
                                            버전 {entry.contentVersionBefore} → {entry.contentVersionAfter}
                                        </Text>
                                        <Text style={styles.versionText}>
                                            {entry.sourceClient === 'mobile'
                                                ? '모바일'
                                                : entry.sourceClient === 'web'
                                                    ? '브라우저'
                                                    : entry.sourceClient === 'server'
                                                        ? '자동 반영'
                                                        : '기타'}
                                        </Text>
                                    </View>

                                    {canRestore ? (
                                        <Pressable
                                            accessibilityRole="button"
                                            disabled={actionDisabled || isBusy}
                                            onPress={() => onRestore?.(entry.id)}
                                            style={({ pressed }) => [
                                                styles.restoreButton,
                                                (actionDisabled || isBusy) ? styles.restoreButtonDisabled : null,
                                                pressed && !actionDisabled && !isBusy ? styles.restoreButtonPressed : null
                                            ]}
                                        >
                                            {isBusy ? (
                                                <ActivityIndicator size="small" color="#ffffff" />
                                            ) : (
                                                <MaterialCommunityIcons name="restore" size={16} color="#ffffff" />
                                            )}
                                            <Text style={styles.restoreButtonLabel}>
                                                {isBusy ? '복구 중' : '이 시점으로 복구'}
                                            </Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            );
                        }) : null}

                        {!loading && !error && hasMore && onLoadMore ? (
                            <Pressable
                                accessibilityRole="button"
                                onPress={onLoadMore}
                                style={({ pressed }) => [
                                    styles.loadMoreButton,
                                    pressed ? styles.loadMoreButtonPressed : null
                                ]}
                            >
                                <Text style={styles.loadMoreButtonLabel}>이전 기록 더 보기</Text>
                            </Pressable>
                        ) : null}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.44)',
        justifyContent: 'flex-end'
    },
    sheet: {
        maxHeight: `${MOBILE_BOTTOM_SHEET_HEIGHTS.detailExpandedPercent}%`,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        backgroundColor: theme.colors.surface,
        paddingTop: theme.spacing.lg
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.md
    },
    headerCopy: {
        flex: 1,
        gap: theme.spacing.xs
    },
    headerEyebrow: {
        fontFamily: theme.fonts.semibold,
        fontSize: 12,
        color: theme.colors.accent
    },
    headerTitle: {
        fontFamily: theme.fonts.display,
        fontSize: 22,
        color: theme.colors.textPrimary
    },
    headerDescription: {
        fontFamily: theme.fonts.body,
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.textSecondary
    },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    iconButtonPressed: {
        opacity: 0.8
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.md
    },
    secondaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    secondaryButtonDisabled: {
        opacity: 0.5
    },
    secondaryButtonPressed: {
        opacity: 0.85
    },
    secondaryButtonLabel: {
        fontFamily: theme.fonts.semibold,
        fontSize: 13,
        color: theme.colors.textPrimary
    },
    retentionBadge: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    retentionBadgeText: {
        fontFamily: theme.fonts.medium,
        fontSize: 12,
        color: theme.colors.textSecondary
    },
    scroll: {
        flex: 1
    },
    scrollContent: {
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.xl,
        gap: theme.spacing.md
    },
    loadingState: {
        paddingVertical: theme.spacing.xl,
        alignItems: 'center',
        gap: theme.spacing.sm
    },
    loadingText: {
        fontFamily: theme.fonts.body,
        fontSize: 14,
        color: theme.colors.textSecondary
    },
    messageCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        backgroundColor: theme.colors.warningSoft
    },
    messageText: {
        flex: 1,
        fontFamily: theme.fonts.body,
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textPrimary
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.xl,
        gap: theme.spacing.sm
    },
    emptyStateTitle: {
        fontFamily: theme.fonts.semibold,
        fontSize: 16,
        color: theme.colors.textPrimary
    },
    emptyStateBody: {
        textAlign: 'center',
        fontFamily: theme.fonts.body,
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.textSecondary
    },
    card: {
        borderRadius: theme.radius.xl,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.surfaceMuted,
        gap: theme.spacing.sm
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md
    },
    actorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        flex: 1
    },
    actorAvatar: {
        width: 40,
        height: 40,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    actorAvatarFallback: {
        width: 40,
        height: 40,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface
    },
    actorCopy: {
        flex: 1,
        gap: theme.spacing.micro
    },
    actorName: {
        fontFamily: theme.fonts.semibold,
        fontSize: 14,
        color: theme.colors.textPrimary
    },
    actorMeta: {
        fontFamily: theme.fonts.body,
        fontSize: 12,
        color: theme.colors.textSecondary
    },
    operationBadge: {
        borderRadius: theme.radius.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs
    },
    operationBadgeText: {
        fontFamily: theme.fonts.semibold,
        fontSize: 11
    },
    summaryText: {
        fontFamily: theme.fonts.body,
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textPrimary
    },
    versionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm
    },
    versionText: {
        fontFamily: theme.fonts.medium,
        fontSize: 12,
        color: theme.colors.textSecondary
    },
    restoreButton: {
        marginTop: theme.spacing.xs,
        borderRadius: theme.radius.lg,
        paddingVertical: theme.spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        backgroundColor: theme.colors.accent
    },
    restoreButtonDisabled: {
        opacity: 0.55
    },
    restoreButtonPressed: {
        opacity: 0.86
    },
    restoreButtonLabel: {
        fontFamily: theme.fonts.semibold,
        fontSize: 14,
        color: '#ffffff'
    },
    loadMoreButton: {
        borderRadius: theme.radius.lg,
        paddingVertical: theme.spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    loadMoreButtonPressed: {
        opacity: 0.86
    },
    loadMoreButtonLabel: {
        fontFamily: theme.fonts.semibold,
        fontSize: 13,
        color: theme.colors.textPrimary
    }
});
