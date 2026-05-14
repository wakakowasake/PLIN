import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarImage } from '@/components/AvatarImage';
import { EmojiText } from '@/components/EmojiText';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTripSummary } from '@/types/trip';
import { buildCachedImageSource } from '@/utils/image-cache';

function parseDateOnly(value: string) {
    const safeValue = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
        return null;
    }

    const parsed = new Date(`${safeValue}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCompactDateRange(startDate: string, endDate: string) {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);

    if (!start || !end) {
        return '';
    }

    const startLabel = `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()}`;
    const endLabel = `${end.getFullYear()}.${end.getMonth() + 1}.${end.getDate()}`;

    return `${startLabel}-${endLabel}`;
}

type Props = {
    trip: MobileTripSummary;
    onPress(): void;
    onOpenActions?(): void;
    actionStatusLabel?: string | null;
    disabled?: boolean;
    variant?: 'card' | 'feed';
};

export function TripCard({
    trip,
    onPress,
    onOpenActions,
    actionStatusLabel = null,
    disabled = false,
    variant = 'card'
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const isCompleted = trip.status === 'completed';
    const hasCoverImage = Boolean(trip.coverImage);
    const compactDateRange = React.useMemo(
        () => formatCompactDateRange(trip.startDate, trip.endDate),
        [trip.endDate, trip.startDate]
    );
    const visibleCollaborators = React.useMemo(
        () => Array.isArray(trip.collaborators) ? trip.collaborators.slice(0, 3) : [],
        [trip.collaborators]
    );
    const hiddenCollaboratorCount = React.useMemo(
        () => Math.max(0, Array.isArray(trip.collaborators) ? trip.collaborators.length - visibleCollaborators.length : 0),
        [trip.collaborators, visibleCollaborators.length]
    );
    const [feedLocationLabel, feedScheduleFallbackLabel] = React.useMemo(() => {
        const parts = String(trip.subInfo || '')
            .split(/\s*[•·]\s*/)
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length === 0) {
            return ['', ''];
        }

        if (parts.length === 1) {
            return [parts[0], ''];
        }

        return [parts[0], parts.slice(1).join(' • ')];
    }, [trip.subInfo]);
    const feedScheduleLabel = compactDateRange || feedScheduleFallbackLabel;
    const cardMetaLines = React.useMemo(() => {
        if (feedLocationLabel && feedScheduleLabel) {
            return [feedLocationLabel, feedScheduleLabel];
        }

        if (feedLocationLabel) {
            return [feedLocationLabel];
        }

        if (feedScheduleLabel) {
            return [feedScheduleLabel];
        }

        if (trip.subInfo) {
            return [trip.subInfo];
        }

        return [];
    }, [feedLocationLabel, feedScheduleLabel, trip.subInfo]);

    const renderMenuButton = React.useCallback((isOnImage = false) => {
        if (!onOpenActions) {
            return null;
        }

        return (
            <Pressable
                accessibilityLabel={`${trip.title} 메뉴 열기`}
                accessibilityRole="button"
                disabled={disabled}
                hitSlop={10}
                onPress={(event) => {
                    event.stopPropagation?.();
                    onOpenActions();
                }}
                style={({ pressed }) => [
                    styles.menuButton,
                    isOnImage ? styles.menuButtonOnImage : null,
                    pressed && !disabled ? styles.menuButtonPressed : null
                ]}
            >
                <View style={styles.menuDotsRow}>
                    <View style={[styles.menuDot, isOnImage ? styles.menuDotOnImage : null]} />
                    <View style={[styles.menuDot, isOnImage ? styles.menuDotOnImage : null]} />
                    <View style={[styles.menuDot, isOnImage ? styles.menuDotOnImage : null]} />
                </View>
            </Pressable>
        );
    }, [disabled, onOpenActions, styles, trip.title]);

    if (variant === 'feed') {
        return (
            <View style={[styles.feedRowFrame, disabled ? styles.cardDisabled : null]}>
                <Pressable
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={onPress}
                    style={({ pressed }) => [
                        styles.feedRow,
                        pressed && !disabled ? styles.feedRowPressed : null
                    ]}
                >
                    <View style={styles.feedVisual}>
                        {hasCoverImage ? (
                            <View style={styles.feedVisualImageFrame}>
                                <Image
                                    source={buildCachedImageSource(trip.coverImage)}
                                    resizeMode="cover"
                                    style={styles.feedVisualImage}
                                />
                            </View>
                        ) : (
                            <View style={[
                                styles.feedVisualFallback,
                                isCompleted ? styles.feedVisualFallbackCompleted : null
                            ]}>
                                <View style={[
                                    styles.feedVisualAccent,
                                    isCompleted ? styles.feedVisualAccentCompleted : null
                                ]} />
                                <Text style={styles.feedVisualFallbackText}>
                                    {isCompleted ? '기록' : '계획'}
                                </Text>
                            </View>
                        )}
                    </View>

                        <View style={styles.feedBody}>
                            <View style={styles.feedTopRow}>
                                <View style={styles.feedTextWrap}>
                                    <EmojiText style={styles.feedTitle} numberOfLines={1}>
                                        {trip.title}
                                    </EmojiText>
                                    {feedLocationLabel ? (
                                        <EmojiText style={styles.feedMetaLine} numberOfLines={1}>
                                            {feedLocationLabel}
                                        </EmojiText>
                                    ) : null}
                                    {feedScheduleLabel ? (
                                        <EmojiText style={[styles.feedMetaLine, styles.feedMetaLineSecondary]} numberOfLines={1}>
                                            {feedScheduleLabel}
                                        </EmojiText>
                                    ) : null}
                                </View>
                                {renderMenuButton(false)}
                            </View>

                            <View style={styles.feedBottomRow}>
                                <View style={styles.feedMetaChip}>
                                    <Text style={styles.feedMetaChipText}>{trip.dayCount}</Text>
                                </View>
                                <View style={[
                                    styles.feedStatusChip,
                                    isCompleted ? styles.feedStatusChipCompleted : null,
                                    actionStatusLabel ? styles.feedStatusChipActive : null
                                ]}>
                                    <Text style={[
                                        styles.feedStatusText,
                                        isCompleted ? styles.feedStatusTextCompleted : null
                                    ]}>
                                        {actionStatusLabel || (isCompleted ? '기록' : '계획')}
                                    </Text>
                                </View>
                                {visibleCollaborators.length ? (
                                    <View style={styles.feedCollaboratorStack}>
                                        {visibleCollaborators.map((member, index) => (
                                            <View
                                                key={`${trip.id}-collaborator-${member.uid}`}
                                                style={[
                                                    styles.feedCollaboratorAvatarWrap,
                                                    index > 0 ? styles.feedCollaboratorAvatarWrapOverlap : null
                                                ]}
                                            >
                                                <AvatarImage
                                                    uri={member.photoURL}
                                                    label={member.displayName}
                                                    size={22}
                                                    textSize={10}
                                                    tone={isCompleted ? 'warning' : 'accent'}
                                                />
                                            </View>
                                        ))}
                                        {hiddenCollaboratorCount > 0 ? (
                                            <View style={[
                                                styles.feedCollaboratorCount,
                                                isCompleted ? styles.feedCollaboratorCountCompleted : null
                                            ]}>
                                                <Text style={[
                                                    styles.feedCollaboratorCountText,
                                                    isCompleted ? styles.feedCollaboratorCountTextCompleted : null
                                                ]}>
                                                    +{hiddenCollaboratorCount}
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>
                                ) : null}
                            </View>
                        </View>
                </Pressable>
                <View style={styles.feedDivider} />
            </View>
        );
    }

    return (
        <View style={[styles.cardFrame, disabled ? styles.cardDisabled : null]}>
            <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={onPress}
                style={({ pressed }) => [
                    styles.cardContent,
                    isCompleted ? styles.cardContentCompleted : null,
                    pressed && !disabled ? styles.cardPressed : null
                ]}
            >
                <View style={[
                    styles.headerShell,
                    isCompleted ? styles.headerShellCompleted : null
                ]}>
                    {trip.coverImage ? (
                        <>
                            <Image source={buildCachedImageSource(trip.coverImage)} style={styles.headerImage} />
                            <View style={styles.headerImageOverlay} />
                        </>
                    ) : (
                        <View style={[
                            styles.headerFallback,
                            isCompleted ? styles.headerFallbackCompleted : null
                        ]}>
                            <View style={[
                                styles.headerFallbackAccent,
                                isCompleted ? styles.headerFallbackAccentCompleted : null
                            ]} />
                        </View>
                    )}
                    <View style={styles.headerShellContent}>
                        <View style={styles.headerTopRow}>
                            <View style={[
                                styles.badge,
                                isCompleted ? styles.badgeCompleted : null,
                                hasCoverImage ? styles.badgeOnImage : null
                            ]}>
                                <Text style={[
                                    styles.badgeText,
                                    isCompleted ? styles.badgeTextCompleted : null,
                                    hasCoverImage ? styles.badgeTextOnImage : null
                                ]}>
                                    {isCompleted ? '기록' : '계획'}
                                </Text>
                            </View>
                            {renderMenuButton(hasCoverImage)}
                        </View>

                        <View style={styles.headerBottom}>
                            {actionStatusLabel ? (
                                <View style={styles.cardMetaRow}>
                                    <View style={[
                                        styles.actionStatusChip,
                                        styles.cardActionStatusChip,
                                        hasCoverImage ? styles.actionStatusChipOnImage : null
                                    ]}>
                                        <Text style={[
                                            styles.actionStatusText,
                                            hasCoverImage ? styles.actionStatusTextOnImage : null
                                        ]}>
                                            {actionStatusLabel}
                                        </Text>
                                    </View>
                                </View>
                            ) : null}
                            <EmojiText
                                style={[styles.title, hasCoverImage ? styles.titleOnImage : null]}
                                numberOfLines={2}
                            >
                                {trip.title}
                            </EmojiText>
                            {cardMetaLines.map((line, index) => (
                                <EmojiText
                                    key={`${trip.id}-meta-${index}`}
                                    style={[
                                        styles.subInfo,
                                        index > 0 ? styles.subInfoSecondary : null,
                                        hasCoverImage ? styles.subInfoOnImage : null
                                    ]}
                                    numberOfLines={1}
                                >
                                    {line}
                                </EmojiText>
                            ))}
                        </View>
                    </View>
                </View>
            </Pressable>
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    cardFrame: {
        marginBottom: theme.spacing.sm
    },
    cardSurface: {
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    cardCompleted: {
        backgroundColor: theme.mode === 'dark' ? '#2b211b' : '#fff8f1'
    },
    listCard: {
        overflow: 'hidden'
    },
    feedRowFrame: {
        paddingBottom: theme.spacing.sm
    },
    feedRow: {
        flexDirection: 'row',
        alignItems: 'stretch'
    },
    feedRowPressed: {
        opacity: 0.84
    },
    feedDivider: {
        marginTop: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border
    },
    cardDisabled: {
        opacity: 0.7
    },
    cardContent: {
        minHeight: 192,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface
    },
    cardContentCompleted: {
        backgroundColor: theme.mode === 'dark' ? '#2b211b' : '#fff8f1'
    },
    listCardContent: {
        flexDirection: 'row',
        alignItems: 'stretch',
        padding: theme.spacing.sm
    },
    cardPressed: {
        opacity: 0.9
    },
    feedVisual: {
        width: 88,
        height: 120,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#f3ecdf'
    },
    feedVisualImageFrame: {
        flex: 1,
        borderRadius: theme.radius.md,
        overflow: 'hidden'
    },
    feedVisualImage: {
        width: '100%',
        height: '100%'
    },
    feedVisualFallback: {
        flex: 1,
        justifyContent: 'space-between',
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#f3ecdf',
        padding: theme.spacing.sm
    },
    feedVisualFallbackCompleted: {
        backgroundColor: theme.mode === 'dark' ? '#2b211b' : '#f7ede4'
    },
    feedVisualAccent: {
        width: 32,
        height: 6,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.accent
    },
    feedVisualAccentCompleted: {
        backgroundColor: theme.colors.accent
    },
    feedVisualFallbackText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    feedBody: {
        flex: 1,
        minHeight: 120,
        marginLeft: theme.spacing.sm,
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.micro
    },
    feedTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start'
    },
    feedTextWrap: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    feedTitle: {
        color: theme.colors.textPrimary,
        fontSize: 19,
        lineHeight: 26,
        fontFamily: theme.fonts.bold
    },
    feedMetaLine: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    feedMetaLineSecondary: {
        marginTop: theme.spacing.micro
    },
    feedBottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    feedCollaboratorStack: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: theme.spacing.xs
    },
    feedCollaboratorAvatarWrap: {
        borderRadius: theme.radius.full
    },
    feedCollaboratorAvatarWrapOverlap: {
        marginLeft: -theme.spacing.xs
    },
    feedCollaboratorCount: {
        minWidth: 24,
        height: 24,
        marginLeft: -theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    feedCollaboratorCountCompleted: {
        backgroundColor: theme.colors.accentSoft
    },
    feedCollaboratorCountText: {
        color: theme.colors.textSecondary,
        fontSize: 10,
        fontFamily: theme.fonts.semibold
    },
    feedCollaboratorCountTextCompleted: {
        color: theme.colors.accent
    },
    feedMetaChip: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    feedMetaChipText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    feedStatusChip: {
        alignSelf: 'flex-end',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    feedStatusChipCompleted: {
        backgroundColor: theme.colors.accentSoft
    },
    feedStatusChipActive: {
        backgroundColor: theme.colors.accentSoft
    },
    feedStatusText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    feedStatusTextCompleted: {
        color: theme.colors.accent
    },
    listVisual: {
        position: 'relative',
        width: 88,
        height: 88,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#f3ecdf'
    },
    listVisualImageFrame: {
        flex: 1,
        borderRadius: theme.radius.md,
        overflow: 'hidden'
    },
    listVisualImage: {
        width: '100%',
        height: '100%'
    },
    listVisualFallback: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#f3ecdf',
        padding: theme.spacing.xs
    },
    listVisualFallbackCompleted: {
        backgroundColor: theme.mode === 'dark' ? '#2b211b' : '#f7ede4'
    },
    listVisualAccent: {
        width: 28,
        height: 5,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.accent
    },
    listVisualAccentCompleted: {
        backgroundColor: theme.colors.accent
    },
    listBody: {
        flex: 1,
        minHeight: 88,
        marginLeft: theme.spacing.sm,
        justifyContent: 'space-between'
    },
    listTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start'
    },
    listTextWrap: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    listTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    listSubInfo: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    listMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginTop: theme.spacing.xs,
        gap: theme.spacing.micro
    },
    headerShell: {
        minHeight: 192,
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#f3ecdf'
    },
    headerShellCompleted: {
        backgroundColor: theme.mode === 'dark' ? '#2b211b' : '#f7ede4'
    },
    headerFallback: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#efe4d3'
    },
    headerFallbackCompleted: {
        backgroundColor: theme.mode === 'dark' ? '#2b211b' : '#f3e3d5'
    },
    headerFallbackAccent: {
        position: 'absolute',
        top: theme.spacing.sm,
        right: theme.spacing.sm,
        width: 72,
        height: 72,
        borderRadius: theme.radius.md,
        backgroundColor: 'rgba(255, 102, 0, 0.14)'
    },
    headerFallbackAccentCompleted: {
        backgroundColor: theme.mode === 'dark' ? 'rgba(255, 102, 0, 0.18)' : 'rgba(255, 102, 0, 0.12)'
    },
    headerImage: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%'
    },
    headerImageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.mode === 'dark'
            ? 'rgba(12, 14, 18, 0.54)'
            : 'rgba(26, 28, 32, 0.38)'
    },
    headerShellContent: {
        flex: 1,
        justifyContent: 'space-between',
        padding: theme.spacing.sm
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    headerBottom: {
        marginTop: theme.spacing.md
    },
    cardMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.xs
    },
    menuButton: {
        width: 36,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center'
    },
    menuButtonOnImage: {
        backgroundColor: 'transparent'
    },
    menuButtonPressed: {
        opacity: 0.82
    },
    menuDotsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.micro
    },
    menuDot: {
        width: 4,
        height: 4,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.textPrimary
    },
    menuDotOnImage: {
        backgroundColor: '#ffffff'
    },
    badge: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    badgeCompleted: {
        backgroundColor: theme.colors.accentSoft
    },
    badgeText: {
        fontSize: 12,
        fontFamily: theme.fonts.semibold,
        color: theme.colors.accent
    },
    badgeOnImage: {
        backgroundColor: 'rgba(18, 24, 32, 0.34)'
    },
    badgeTextCompleted: {
        color: theme.colors.accent
    },
    badgeTextOnImage: {
        color: '#ffffff'
    },
    metaChip: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    metaChipText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold
    },
    dateChip: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    dateChipOnImage: {
        backgroundColor: 'rgba(18, 24, 32, 0.34)'
    },
    dateChipText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold
    },
    dateChipTextOnImage: {
        color: '#ffffff'
    },
    title: {
        fontSize: 21,
        lineHeight: 27,
        fontFamily: theme.fonts.bold,
        color: theme.colors.textPrimary
    },
    titleOnImage: {
        color: '#ffffff'
    },
    subInfo: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    subInfoSecondary: {
        marginTop: theme.spacing.micro
    },
    subInfoOnImage: {
        color: 'rgba(255, 255, 255, 0.92)'
    },
    actionStatusChip: {
        alignSelf: 'flex-start',
        marginTop: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.mode === 'dark' ? 'rgba(217, 169, 130, 0.16)' : '#fff3ee'
    },
    cardActionStatusChip: {
        marginTop: 0
    },
    actionStatusChipOnImage: {
        backgroundColor: 'rgba(255, 255, 255, 0.18)'
    },
    listActionStatusChip: {
        marginTop: 0
    },
    actionStatusText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    actionStatusTextOnImage: {
        color: '#ffffff'
    }
});
