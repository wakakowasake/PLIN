import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
    Image,
    type ImageStyle,
    InteractionManager,
    Platform,
    Pressable,
    StyleSheet,
    type StyleProp,
    Text,
    type TextStyle,
    View,
    type ViewStyle
} from 'react-native';
import { formatTimeStr, parseDurationStr, parseTimeStr } from '@shared/core/utils/time-value-helpers.js';

import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTimelineDisplayItem } from '@/types/trip';
import { buildCachedImageSource } from '@/utils/image-cache';

type Props = {
    item: MobileTimelineDisplayItem;
    onPress?: () => void;
    isFirst?: boolean;
    hideDivider?: boolean;
    hasReminderIndicator?: boolean;
    editAction?: React.ReactNode;
    photoPreviewLoadIndex?: number;
    moveControls?: {
        canMoveUp: boolean;
        canMoveDown: boolean;
        disabled?: boolean;
        onMoveUp?: () => void;
        onMoveDown?: () => void;
    };
};

type TimelinePhotoPreviewProps = {
    url: string;
    imageStyle: StyleProp<ImageStyle>;
    fallbackStyle: StyleProp<ViewStyle>;
    fallbackTextStyle: StyleProp<TextStyle>;
    loadDelayMs: number;
};

const TIMELINE_ROW_PHOTO_PREVIEW_LIMIT = 1;

function TimelinePhotoPreview({
    url,
    imageStyle,
    fallbackStyle,
    fallbackTextStyle,
    loadDelayMs
}: TimelinePhotoPreviewProps) {
    const [didFail, setDidFail] = React.useState(false);
    const [shouldLoad, setShouldLoad] = React.useState(false);

    React.useEffect(() => {
        setDidFail(false);
        setShouldLoad(false);

        if (!url) {
            return undefined;
        }

        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let didCancel = false;
        const task = InteractionManager.runAfterInteractions(() => {
            timeoutId = setTimeout(() => {
                if (!didCancel) {
                    setShouldLoad(true);
                }
            }, loadDelayMs);
        });

        return () => {
            didCancel = true;
            task.cancel();
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [loadDelayMs, url]);

    if (!url || didFail || !shouldLoad) {
        return (
            <View style={fallbackStyle}>
                <Text style={fallbackTextStyle}>사진</Text>
            </View>
        );
    }

    return (
        <Image
            source={buildCachedImageSource(url)}
            style={imageStyle}
            resizeMode="cover"
            onError={() => {
                setDidFail(true);
            }}
        />
    );
}

function splitTransitTimeLabel(label: string) {
    const normalized = String(label || '').trim();
    if (!normalized) {
        return null;
    }

    const parts = normalized.split(/\s*-\s*/).map((part) => part.trim()).filter(Boolean);
    if (parts.length !== 2) {
        return null;
    }

    return {
        start: parts[0],
        end: parts[1]
    };
}

function buildDisplayTimeRange(item: MobileTimelineDisplayItem) {
    const explicitRange = splitTransitTimeLabel(item.transitWindowLabel || item.timeLabel);
    if (explicitRange) {
        return explicitRange;
    }

    const startTime = String(item.timeLabel || '').trim();
    const parsedStartTime = parseTimeStr(startTime);
    if (parsedStartTime === null) {
        return null;
    }

    const durationMinutes = parseDurationStr(String(item.durationLabel || '').replace(/\n/g, ' '));
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        return null;
    }

    return {
        start: formatTimeStr(parsedStartTime),
        end: formatTimeStr(parsedStartTime + durationMinutes)
    };
}

function formatDurationLabel(label: string) {
    const normalized = String(label || '').trim();
    if (!normalized) {
        return '';
    }

    if (normalized === '0분' || normalized === '0시간 0분') {
        return '';
    }

    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return parts.join('\n');
    }

    return normalized;
}

export function TimelineItemRow({
    item,
    onPress,
    isFirst = false,
    hideDivider = false,
    hasReminderIndicator = false,
    editAction,
    photoPreviewLoadIndex = 0,
    moveControls
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const visiblePhotoPreviewUrls = React.useMemo(
        () => item.photoPreviewUrls.slice(0, TIMELINE_ROW_PHOTO_PREVIEW_LIMIT),
        [item.photoPreviewUrls]
    );
    const hasPhotos = visiblePhotoPreviewUrls.length > 0;
    const photoPreviewLoadDelayMs = Math.min(900, Math.max(0, photoPreviewLoadIndex) * 120);
    const hasMemories = item.memoriesCount > 0;
    const hasExpense = Boolean(item.expenseSummaryLabel);
    const isMemoRow = !item.isTransit && item.badgeLabel === '메모';
    const hasHeaderAccessories = hasReminderIndicator || Boolean(editAction) || Boolean(moveControls);
    const shouldShowTimeColumn = !isMemoRow;
    const rowVariant = item.isTransit
        ? 'transit'
        : isMemoRow
            ? 'memo'
            : hasPhotos || hasMemories
                ? 'memory'
                : 'default';
    const displayTimeRange = !isMemoRow ? buildDisplayTimeRange(item) : null;
    const formattedDurationLabel = formatDurationLabel(item.durationLabel);
    const memoryLabel = hasMemories
        ? `추억 ${item.memoriesCount}개`
        : hasPhotos
            ? `사진 ${visiblePhotoPreviewUrls.length}장`
            : '';
    const hasTransitRouteChips = item.isTransit && item.transitRouteChips.length > 0;
    const showTransitChipTitle = rowVariant === 'transit' && hasTransitRouteChips;
    const shouldUseTimeColumnPress = Boolean(onPress);
    const timeBlockStyle = [
        styles.timeBlock,
        rowVariant === 'transit'
            ? styles.timeBlockTransit
            : rowVariant === 'memo'
                ? styles.timeBlockMemo
                : rowVariant === 'memory'
                    ? styles.timeBlockMemory
                    : null
    ];
    const timeBlockContent = (
        <>
            <View
                style={[
                    styles.timeContent
                ]}
            >
                {displayTimeRange ? (
                    <View style={styles.transitTimeStack}>
                        <Text
                            style={[
                                styles.time,
                                item.isTransit ? styles.timeTransit : null
                            ]}
                        >
                            {displayTimeRange.start}
                        </Text>
                        <Text
                            style={[
                                styles.timeDash,
                                item.isTransit ? styles.timeTransit : null
                            ]}
                        >
                            -
                        </Text>
                        <Text
                            style={[
                                styles.time,
                                item.isTransit ? styles.timeTransit : null
                            ]}
                        >
                            {displayTimeRange.end}
                        </Text>
                    </View>
                ) : (
                    <Text
                        style={[
                            styles.time,
                            rowVariant === 'transit' ? styles.timeTransit : null,
                            rowVariant === 'memo' ? styles.timeMemo : null
                        ]}
                    >
                        {isMemoRow ? item.badgeLabel || '메모' : item.timeLabel || '--:--'}
                    </Text>
                )}
                {formattedDurationLabel && !isMemoRow ? (
                    <Text
                        style={[
                            styles.duration,
                            rowVariant === 'transit' ? styles.durationTransit : null
                        ]}
                    >
                        {formattedDurationLabel}
                    </Text>
                ) : null}
            </View>
        </>
    );

    return (
        <View
            style={[
                styles.row,
                !isFirst && !hideDivider ? styles.rowWithDivider : null
            ]}
        >
            {shouldShowTimeColumn ? (
                <View style={styles.timeColumn}>
                    {shouldUseTimeColumnPress ? (
                        <Pressable
                            accessibilityRole="button"
                            onPress={onPress}
                            style={({ pressed }) => [
                                timeBlockStyle,
                                pressed ? styles.rowPressed : null
                            ]}
                        >
                            {timeBlockContent}
                        </Pressable>
                    ) : (
                        <View style={timeBlockStyle}>
                            {timeBlockContent}
                        </View>
                    )}
                </View>
            ) : null}
            <Pressable
                accessibilityRole={onPress ? 'button' : undefined}
                disabled={!onPress}
                onPress={onPress}
                style={({ pressed }) => [
                    styles.contentCard,
                    rowVariant === 'transit'
                        ? styles.contentCardTransit
                        : rowVariant === 'memo'
                            ? styles.contentCardMemo
                            : rowVariant === 'memory'
                                ? styles.contentCardMemory
                                : null,
                    pressed && onPress ? styles.rowPressed : null
                ]}
            >
                <View
                    style={[
                        styles.headerRow
                    ]}
                >
                    <View style={styles.headerCopy}>
                        <View style={styles.topRow}>
                            <View
                                style={[
                                    styles.tag,
                                    rowVariant === 'transit'
                                        ? styles.tagTransit
                                        : rowVariant === 'memo'
                                            ? styles.tagMemo
                                            : rowVariant === 'memory'
                                                ? styles.tagMemory
                                                : null
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.tagText,
                                        rowVariant === 'transit'
                                            ? styles.tagTextTransit
                                            : rowVariant === 'memo'
                                                ? styles.tagTextMemo
                                                : rowVariant === 'memory'
                                                    ? styles.tagTextMemory
                                                    : null
                                    ]}
                                >
                                    {item.badgeLabel}
                                </Text>
                            </View>
                            {memoryLabel ? (
                                <View style={[styles.tag, styles.tagMemorySoft]}>
                                    <Text
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                        style={[styles.tagText, styles.tagTextMemorySoft]}
                                    >
                                        {memoryLabel}
                                    </Text>
                                </View>
                            ) : null}
                            {hasExpense ? (
                                <View style={[styles.tag, styles.tagExpenseSoft]}>
                                    <Text
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                        style={[styles.tagText, styles.tagTextExpenseSoft]}
                                    >
                                        {item.expenseSummaryLabel}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    </View>
                    {hasReminderIndicator || editAction ? (
                        <View style={styles.headerAccessoryRow}>
                            {hasReminderIndicator ? (
                                <View
                                    accessible={false}
                                    pointerEvents="none"
                                    style={styles.reminderIndicator}
                                >
                                    <MaterialCommunityIcons
                                        name="bell-ring"
                                        size={15}
                                        color={theme.colors.accent}
                                    />
                                </View>
                            ) : null}
                            {moveControls ? (
                                <View style={styles.moveControlGroup}>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`${item.title || item.badgeLabel || '일정'} 위로 이동`}
                                        disabled={moveControls.disabled || !moveControls.canMoveUp}
                                        onPress={(event) => {
                                            event.stopPropagation?.();
                                            moveControls.onMoveUp?.();
                                        }}
                                        style={({ pressed }) => [
                                            styles.moveControlButton,
                                            styles.moveControlButtonLeading,
                                            pressed && moveControls.canMoveUp && !moveControls.disabled
                                                ? styles.moveControlButtonPressed
                                                : null,
                                            moveControls.disabled || !moveControls.canMoveUp
                                                ? styles.moveControlButtonDisabled
                                                : null
                                        ]}
                                    >
                                        <MaterialCommunityIcons
                                            name="chevron-up"
                                            size={16}
                                            color={theme.colors.textSecondary}
                                        />
                                    </Pressable>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`${item.title || item.badgeLabel || '일정'} 아래로 이동`}
                                        disabled={moveControls.disabled || !moveControls.canMoveDown}
                                        onPress={(event) => {
                                            event.stopPropagation?.();
                                            moveControls.onMoveDown?.();
                                        }}
                                        style={({ pressed }) => [
                                            styles.moveControlButton,
                                            pressed && moveControls.canMoveDown && !moveControls.disabled
                                                ? styles.moveControlButtonPressed
                                                : null,
                                            moveControls.disabled || !moveControls.canMoveDown
                                                ? styles.moveControlButtonDisabled
                                                : null
                                        ]}
                                    >
                                        <MaterialCommunityIcons
                                            name="chevron-down"
                                            size={16}
                                            color={theme.colors.textSecondary}
                                        />
                                    </Pressable>
                                </View>
                            ) : null}
                            {editAction ? (
                                <View style={styles.editActionWrap}>
                                    {editAction}
                                </View>
                            ) : null}
                        </View>
                    ) : null}
                </View>
                {showTransitChipTitle ? (
                    <View style={styles.transitChipRow}>
                        {item.transitRouteChips.map((chip, index) => {
                            const isWalkingChip = chip.type === 'walk' || chip.icon === 'directions_walk';
                            return (
                                <View
                                    key={`${item.id}-transit-chip-${index}`}
                                    style={[
                                        styles.transitChip,
                                        chip.color
                                            ? {
                                                backgroundColor: chip.color,
                                                borderColor: chip.color
                                            }
                                            : isWalkingChip
                                                ? styles.transitChipWalking
                                                : null
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.transitChipText,
                                            styles.transitChipTextPrimary,
                                            chip.color
                                                ? {
                                                    color: chip.textColor || '#ffffff'
                                                }
                                                : isWalkingChip
                                                    ? styles.transitChipTextWalking
                                                    : null
                                        ]}
                                    >
                                        {chip.label}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <Text style={styles.title}>{item.title}</Text>
                )}
                {hasTransitRouteChips && !showTransitChipTitle ? (
                    <View style={styles.transitChipRow}>
                        {item.transitRouteChips.map((chip, index) => {
                            const isWalkingChip = chip.type === 'walk' || chip.icon === 'directions_walk';
                            return (
                                <View
                                    key={`${item.id}-transit-chip-secondary-${index}`}
                                    style={[
                                        styles.transitChip,
                                        chip.color
                                            ? {
                                                backgroundColor: chip.color,
                                                borderColor: chip.color
                                            }
                                            : isWalkingChip
                                                ? styles.transitChipWalking
                                                : null
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.transitChipText,
                                            chip.color
                                                ? {
                                                    color: chip.textColor || '#ffffff'
                                                }
                                                : isWalkingChip
                                                    ? styles.transitChipTextWalking
                                                    : null
                                        ]}
                                    >
                                        {chip.label}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                ) : null}
                {item.location ? (
                    <Text style={styles.location} numberOfLines={1} ellipsizeMode="tail">
                        {item.location}
                    </Text>
                ) : null}
                {item.note ? (
                    <View style={styles.noteBox}>
                        <Text style={styles.note} numberOfLines={3}>
                            {item.note}
                        </Text>
                    </View>
                ) : null}
                {hasPhotos ? (
                    <View style={styles.photoSection}>
                        {visiblePhotoPreviewUrls.map((url, index) => (
                            <TimelinePhotoPreview
                                key={`${item.id}-photo-${index}`}
                                url={url}
                                imageStyle={[
                                    styles.photoPreview,
                                    index < visiblePhotoPreviewUrls.length - 1 ? styles.photoPreviewSpaced : null
                                ]}
                                fallbackStyle={[
                                    styles.photoPreview,
                                    styles.photoPreviewFallback,
                                    index < visiblePhotoPreviewUrls.length - 1 ? styles.photoPreviewSpaced : null
                                ]}
                                fallbackTextStyle={styles.photoPreviewFallbackText}
                                loadDelayMs={photoPreviewLoadDelayMs}
                            />
                        ))}
                    </View>
                ) : null}
            </Pressable>
        </View>
    );
}

const createStyles = (theme: AppTheme) => {
    const transitChipTextFont = Platform.select({
        ios: {
            fontWeight: '700' as const
        },
        default: {
            fontFamily: theme.fonts.contentSemibold
        }
    }) || {
        fontFamily: theme.fonts.contentSemibold
    };

    return StyleSheet.create({
    row: {
        flexDirection: 'row',
        paddingVertical: theme.spacing.micro
    },
    rowWithDivider: {
    },
    rowPressed: {
        opacity: 0.88
    },
    timeColumn: {
        width: 68,
        paddingRight: theme.spacing.xs,
        alignSelf: 'stretch',
        alignItems: 'center'
    },
    timeBlock: {
        width: '100%',
        flex: 1,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        overflow: 'hidden'
    },
    timeBlockTransit: {
        backgroundColor: theme.mode === 'dark' ? '#1f2b3b' : '#eef5ff'
    },
    timeBlockMemo: {
        backgroundColor: theme.mode === 'dark' ? '#342a16' : '#fff6cf'
    },
    timeBlockMemory: {
        backgroundColor: theme.colors.surface
    },
    timeContent: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 4,
        paddingVertical: 8
    },
    time: {
        fontSize: 14,
        fontFamily: theme.fonts.semibold,
        color: theme.colors.textPrimary,
        textAlign: 'center'
    },
    timeMemo: {
        color: theme.mode === 'dark' ? '#f0c97f' : '#8b5b22',
        fontSize: 12
    },
    timeTransit: {
        color: theme.mode === 'dark' ? '#8db7ff' : '#2f5ea8'
    },
    transitTimeStack: {
        alignItems: 'center'
    },
    timeDash: {
        marginVertical: 1,
        fontSize: 12,
        fontFamily: theme.fonts.bold,
        textAlign: 'center'
    },
    duration: {
        marginTop: 4,
        fontSize: 11,
        lineHeight: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        fontFamily: theme.fonts.body
    },
    durationTransit: {
        color: theme.mode === 'dark' ? '#9fb9e1' : '#4c6ea8'
    },
    contentCard: {
        flex: 1,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    contentCardTransit: {
        backgroundColor: theme.mode === 'dark' ? '#1b2430' : '#f4f8ff'
    },
    contentCardMemo: {
        backgroundColor: theme.mode === 'dark' ? '#342a16' : '#fff6cf'
    },
    contentCardMemory: {
        backgroundColor: theme.colors.surface
    },
    topRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: theme.spacing.micro,
        minWidth: 0
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        minWidth: 0
    },
    headerCopy: {
        flex: 1,
        minWidth: 0
    },
    headerAccessoryRow: {
        marginLeft: theme.spacing.micro,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.micro,
        flexShrink: 0,
        alignSelf: 'flex-start'
    },
    editActionWrap: {
        alignSelf: 'flex-start',
        flexShrink: 0
    },
    moveControlGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted,
        overflow: 'hidden'
    },
    moveControlButton: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center'
    },
    moveControlButtonLeading: {
        borderRightWidth: 1,
        borderRightColor: theme.colors.border
    },
    moveControlButtonPressed: {
        backgroundColor: theme.colors.accentSoft
    },
    moveControlButtonDisabled: {
        opacity: 0.35
    },
    reminderIndicator: {
        width: 28,
        height: 28,
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center'
    },
    tag: {
        alignSelf: 'flex-start',
        minHeight: 24,
        justifyContent: 'center',
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        backgroundColor: theme.colors.surfaceMuted,
        flexShrink: 0
    },
    tagTransit: {
        backgroundColor: theme.mode === 'dark' ? '#243548' : '#dbe9ff'
    },
    tagMemo: {
        backgroundColor: theme.mode === 'dark' ? '#4a3920' : '#f8e7aa'
    },
    tagMemory: {
        backgroundColor: theme.colors.accentSoft
    },
    tagText: {
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        fontFamily: theme.fonts.contentSemibold,
        color: theme.colors.textSecondary,
        flexShrink: 0
    },
    tagTextTransit: {
        color: theme.mode === 'dark' ? '#8db7ff' : '#2f5ea8'
    },
    tagTextMemo: {
        color: theme.mode === 'dark' ? '#f0c97f' : '#8b5b22'
    },
    tagTextMemory: {
        color: theme.colors.accent
    },
    title: {
        marginTop: theme.spacing.xs,
        fontSize: 17,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold
    },
    transitChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: theme.spacing.micro,
        marginTop: theme.spacing.xs
    },
    transitChip: {
        minHeight: 24,
        minWidth: 24,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.xs,
        borderWidth: 1,
        borderColor: theme.mode === 'dark' ? '#44618f' : '#b8cff6',
        backgroundColor: theme.mode === 'dark' ? '#243548' : '#dbe9ff',
        alignItems: 'center',
        justifyContent: 'center'
    },
    transitChipWalking: {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    transitChipText: {
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        ...transitChipTextFont,
        color: theme.mode === 'dark' ? '#d9e8ff' : '#2f5ea8',
        textAlign: 'center'
    },
    transitChipTextPrimary: {
        fontSize: 13,
        lineHeight: 18
    },
    transitChipTextWalking: {
        color: theme.colors.textSecondary
    },
    location: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    note: {
        color: theme.mode === 'dark' ? '#f0c97f' : '#8b5b22',
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    noteBox: {
        marginTop: theme.spacing.xs
    },
    tagMemorySoft: {
        backgroundColor: theme.colors.accentSoft
    },
    tagTextMemorySoft: {
        color: theme.colors.accent
    },
    tagExpenseSoft: {
        backgroundColor: theme.colors.accentSoft
    },
    tagTextExpenseSoft: {
        color: theme.colors.accent
    },
    photoSection: {
        marginTop: theme.spacing.xs,
        marginBottom: theme.spacing.micro,
        padding: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.48)'
    },
    photoRow: {
        paddingRight: theme.spacing.micro
    },
    photoPreview: {
        width: 76,
        height: 76,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    photoPreviewFallback: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    photoPreviewFallbackText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        lineHeight: 14,
        fontFamily: theme.fonts.bold
    },
    photoPreviewSpaced: {
        marginRight: theme.spacing.micro
    },
    });
};
