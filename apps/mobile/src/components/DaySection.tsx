import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
    Pressable,
    StyleSheet,
    Text,
    View
} from 'react-native';

import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTimelineDisplayItem, MobileTripDaySection } from '@/types/trip';
import { TimelineItemRow } from './TimelineItemRow';

type Props = {
    day: MobileTripDaySection;
    onSelectItem?: (day: MobileTripDaySection, item: MobileTimelineDisplayItem, itemIndex: number) => void;
    isTimelineEditMode?: boolean;
    canAddEmptyDayItem?: boolean;
    onAddItem?: (day: MobileTripDaySection, insertAfterIndex: number) => void;
    onOpenSortMenu?: (day: MobileTripDaySection) => void;
    onDeleteItem?: (day: MobileTripDaySection, item: MobileTimelineDisplayItem, itemIndex: number) => void;
    onToggleReminder?: (day: MobileTripDaySection, item: MobileTimelineDisplayItem, itemIndex: number) => void;
    hasReminder?: (dayId: string, itemId: string) => boolean;
    onMoveItem?: (
        day: MobileTripDaySection,
        item: MobileTimelineDisplayItem,
        itemIndex: number,
        direction: 'up' | 'down'
    ) => void;
    isDeletingItem?: boolean;
    isMovingItem?: boolean;
};

function CloseGlyph({ color }: { color: string }) {
    const glyphStyles = useGlyphStyles();

    return (
        <View style={glyphStyles.iconBox}>
            <View style={[glyphStyles.closeStroke, glyphStyles.closeStrokeLeft, { backgroundColor: color }]} />
            <View style={[glyphStyles.closeStroke, glyphStyles.closeStrokeRight, { backgroundColor: color }]} />
        </View>
    );
}

function useGlyphStyles() {
    const theme = useAppTheme();

    return React.useMemo(() => createGlyphStyles(theme), [theme]);
}

export function DaySection({
    day,
    onSelectItem,
    isTimelineEditMode = false,
    canAddEmptyDayItem = false,
    onAddItem,
    onOpenSortMenu,
    onDeleteItem,
    onToggleReminder,
    hasReminder,
    onMoveItem,
    isDeletingItem = false,
    isMovingItem = false
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const canAddItem = isTimelineEditMode && Boolean(onAddItem);
    const canAddToEmptyDay = Boolean(onAddItem) && (isTimelineEditMode || canAddEmptyDayItem);
    const canDeleteItem = isTimelineEditMode && Boolean(onDeleteItem);
    const canToggleReminder = isTimelineEditMode && Boolean(onToggleReminder);
    const canMoveItem = isTimelineEditMode && Boolean(onMoveItem);
    const canReorganizeDay = isTimelineEditMode && Boolean(onOpenSortMenu) && day.items.length > 1;
    const isItemActionBusy = isDeletingItem || isMovingItem;

    const renderInsertButton = React.useCallback((insertAfterIndex: number) => {
        if (!canAddItem || !onAddItem) {
            return null;
        }

        return (
            <View
                key={`${day.id}-insert-${insertAfterIndex}`}
                style={styles.insertButtonSlot}
            >
                <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                        onAddItem(day, insertAfterIndex);
                    }}
                    style={({ pressed }) => [
                        styles.insertButton,
                        pressed ? styles.insertButtonPressed : null
                    ]}
                >
                    <View style={styles.emptyAddButtonIconWrap}>
                        <MaterialCommunityIcons color={theme.colors.accent} name="plus" size={18} />
                    </View>
                    <Text style={styles.emptyAddButtonText}>새 일정 추가</Text>
                </Pressable>
            </View>
        );
    }, [
        canAddItem,
        day,
        onAddItem,
        theme.colors.accent,
        styles.insertButton,
        styles.insertButtonPressed,
        styles.insertButtonSlot,
        styles.emptyAddButtonIconWrap,
        styles.emptyAddButtonText
    ]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerLabelRow}>
                    <Text style={styles.label}>{day.label}</Text>
                    {canReorganizeDay ? (
                        <View pointerEvents="box-none" style={styles.headerActionWrap}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                    onOpenSortMenu?.(day);
                                }}
                                style={({ pressed }) => [
                                    styles.headerSortButton,
                                    pressed ? styles.headerSortButtonPressed : null
                                ]}
                            >
                                <Text style={styles.headerSortButtonText}>재정렬</Text>
                            </Pressable>
                        </View>
                    ) : null}
                </View>
                <View style={styles.headerMetaRow}>
                    <View style={styles.headerMetaPills}>
                        <View style={styles.datePill}>
                            <Text style={styles.datePillText}>{day.date}</Text>
                        </View>
                        {day.expenseTotalLabel ? (
                            <View style={[styles.metaPill, styles.expensePill]}>
                                <Text style={[styles.metaPillText, styles.expensePillText]}>
                                    {day.expenseTotalLabel}
                                </Text>
                            </View>
                        ) : null}
                        {day.expenseItemCount ? (
                            <View style={[styles.metaPill, styles.expensePill]}>
                                <Text style={[styles.metaPillText, styles.expensePillText]}>기록 {day.expenseItemCount}건</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </View>
            <View style={styles.timelineGroup}>
                {day.items.length === 0 ? (
                    canAddToEmptyDay ? (
                        <View style={styles.emptyEditBlock}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                    onAddItem?.(day, -1);
                                }}
                                style={({ pressed }) => [
                                    styles.emptyAddButton,
                                    pressed ? styles.emptyAddButtonPressed : null
                                ]}
                            >
                                <View style={styles.emptyAddButtonIconWrap}>
                                    <MaterialCommunityIcons color={theme.colors.accent} name="plus" size={18} />
                                </View>
                                <Text style={styles.emptyAddButtonText}>새 일정 추가</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <Text style={styles.emptyText}>등록된 일정이 아직 없어요.</Text>
                    )
                ) : (
                    <>
                        {renderInsertButton(-1)}
                        {day.items.map((item, index) => {
                            const itemHasReminder = hasReminder?.(day.id, item.id) ?? false;

                            return (
                                <React.Fragment key={`${day.id}-${item.id}`}>
                                    <View>
                                        <TimelineItemRow
                                            item={item}
                                            isFirst={!canAddItem && index === 0}
                                            hideDivider={canAddItem}
                                            hasReminderIndicator={!isTimelineEditMode && itemHasReminder}
                                            onPress={onSelectItem ? () => onSelectItem(day, item, index) : undefined}
                                            moveControls={canMoveItem ? {
                                                canMoveUp: index > 0,
                                                canMoveDown: index < day.items.length - 1,
                                                disabled: isItemActionBusy,
                                                onMoveUp: () => onMoveItem?.(day, item, index, 'up'),
                                                onMoveDown: () => onMoveItem?.(day, item, index, 'down')
                                            } : undefined}
                                            editAction={canDeleteItem || canToggleReminder ? (
                                                <View style={styles.itemActionRow}>
                                                    {canToggleReminder && item.badgeLabel !== '메모' ? (
                                                        <Pressable
                                                            accessibilityRole="button"
                                                            accessibilityLabel={`${item.title || item.badgeLabel || '일정'} 알림 ${itemHasReminder ? '끄기' : '켜기'}`}
                                                            disabled={isItemActionBusy}
                                                            onPress={(event) => {
                                                                event.stopPropagation?.();
                                                                onToggleReminder?.(day, item, index);
                                                            }}
                                                            style={({ pressed }) => [
                                                                styles.reminderButton,
                                                                itemHasReminder ? styles.reminderButtonActive : null,
                                                                pressed && !isItemActionBusy ? styles.reminderButtonPressed : null,
                                                                isItemActionBusy ? styles.deleteButtonDisabled : null
                                                            ]}
                                                        >
                                                            <MaterialCommunityIcons
                                                                name={itemHasReminder ? 'bell-ring' : 'bell-plus-outline'}
                                                                size={16}
                                                                color={itemHasReminder ? '#ffffff' : theme.colors.accent}
                                                            />
                                                        </Pressable>
                                                    ) : null}
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`${item.title || item.badgeLabel || '일정'} 삭제`}
                                                        disabled={isItemActionBusy}
                                                        onPress={(event) => {
                                                            event.stopPropagation?.();
                                                            onDeleteItem?.(day, item, index);
                                                        }}
                                                        style={({ pressed }) => [
                                                            styles.deleteButton,
                                                            canToggleReminder && item.badgeLabel !== '메모' ? styles.deleteButtonSpaced : null,
                                                            pressed && !isItemActionBusy ? styles.deleteButtonPressed : null,
                                                            isItemActionBusy ? styles.deleteButtonDisabled : null
                                                        ]}
                                                    >
                                                        <CloseGlyph color={theme.colors.warning} />
                                                    </Pressable>
                                                </View>
                                            ) : undefined}
                                        />
                                    </View>
                                    {renderInsertButton(index)}
                                </React.Fragment>
                            );
                        })}
                    </>
                )}
            </View>
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        marginBottom: theme.spacing.lg
    },
    header: {
        paddingHorizontal: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    headerLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    headerActionWrap: {
        marginLeft: theme.spacing.sm,
        alignItems: 'flex-end',
        justifyContent: 'center'
    },
    headerMetaRow: {
        marginTop: theme.spacing.xs
    },
    headerMetaPills: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginTop: 0
    },
    label: {
        fontSize: 20,
        fontFamily: theme.fonts.bold,
        color: theme.colors.textPrimary,
        flexShrink: 1
    },
    headerSortButton: {
        minHeight: 34,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center'
    },
    headerSortButtonPressed: {
        opacity: 0.84
    },
    headerSortButtonText: {
        color: theme.colors.accent,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    datePill: {
        marginRight: theme.spacing.micro,
        marginBottom: theme.spacing.micro,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    datePillText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    metaPill: {
        marginRight: theme.spacing.micro,
        marginBottom: theme.spacing.micro,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    metaPillText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    expensePill: {
        backgroundColor: theme.colors.accentSoft
    },
    expensePillText: {
        color: theme.colors.accent
    },
    timelineGroup: {
        marginTop: theme.spacing.sm,
        position: 'relative'
    },
    emptyEditBlock: {
        paddingTop: theme.spacing.sm
    },
    emptyAddButton: {
        minHeight: 48,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyAddButtonPressed: {
        opacity: 0.84
    },
    emptyAddButtonIconWrap: {
        width: 24,
        height: 24,
        borderRadius: theme.radius.xs,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.xs
    },
    emptyAddButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    emptyText: {
        paddingBottom: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    insertButton: {
        minHeight: 48,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    insertButtonSlot: {
        paddingVertical: theme.spacing.xs
    },
    insertButtonPressed: {
        opacity: 0.88
    },
    itemActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        gap: theme.spacing.micro
    },
    reminderButton: {
        width: 28,
        height: 28,
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center'
    },
    reminderButtonActive: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent
    },
    reminderButtonPressed: {
        opacity: 0.82
    },
    deleteButton: {
        width: 28,
        height: 28,
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.warningSoft,
        alignItems: 'center',
        justifyContent: 'center'
    },
    deleteButtonSpaced: {
        marginLeft: 0
    },
    deleteButtonPressed: {
        opacity: 0.82
    },
    deleteButtonDisabled: {
        opacity: 0.55
    }
});

const createGlyphStyles = (theme: AppTheme) => StyleSheet.create({
    iconBox: {
        width: 14,
        height: 14,
        alignItems: 'center',
        justifyContent: 'center'
    },
    closeStroke: {
        position: 'absolute',
        alignSelf: 'center',
        width: 11,
        height: 1.8,
        borderRadius: theme.radius.full
    },
    closeStrokeLeft: {
        transform: [{ rotate: '45deg' }]
    },
    closeStrokeRight: {
        transform: [{ rotate: '-45deg' }]
    }
});
