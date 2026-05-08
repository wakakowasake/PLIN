import React from 'react';
import {
    Animated,
    Modal,
    PanResponder,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import type { MobileTripDaySection } from '@/types/trip';

type Props = {
    visible: boolean;
    days: MobileTripDaySection[];
    isSaving: boolean;
    errorMessage?: string | null;
    onClose(): void;
    onSelect(dayId: string, itemId: string, itemIndex: number): void;
};

const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 0.85;

export function TimelineExistingItemPickerModal({
    visible,
    days,
    isSaving,
    errorMessage,
    onClose,
    onSelect
}: Props) {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const sheetTranslateY = React.useRef(new Animated.Value(0)).current;
    const sheetInsetStyle = React.useMemo(() => ({
        paddingTop: insets.top
    }), [insets.top]);
    const contentInsetStyle = React.useMemo(() => ({
        paddingBottom: insets.bottom + theme.spacing.xxl
    }), [insets.bottom, theme.spacing.xxl]);
    const copyableDays = React.useMemo(() => (
        days
            .map((day) => ({
                ...day,
                items: day.items
                    .map((item, itemIndex) => ({
                        item,
                        itemIndex
                    }))
                    .filter(({ item }) => !item.isTransit && item.badgeLabel !== '메모')
            }))
            .filter((day) => day.items.length > 0)
    ), [days]);
    const resetSheetPosition = React.useCallback(() => {
        Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 180
        }).start();
    }, [sheetTranslateY]);
    const dismissSheetFromHandle = React.useCallback(() => {
        Animated.timing(sheetTranslateY, {
            toValue: windowHeight,
            duration: 180,
            useNativeDriver: true
        }).start(({ finished }) => {
            if (finished) {
                onClose();
            }
        });
    }, [onClose, sheetTranslateY, windowHeight]);
    const sheetHandlePanResponder = React.useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => !isSaving,
        onStartShouldSetPanResponderCapture: () => !isSaving,
        onMoveShouldSetPanResponder: (_event, gestureState) => (
            !isSaving
            && gestureState.dy > 2
            && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        ),
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => (
            !isSaving
            && gestureState.dy > 2
            && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        ),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_event, gestureState) => {
            sheetTranslateY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_event, gestureState) => {
            if (
                gestureState.dy > SHEET_DISMISS_DRAG_DISTANCE
                || gestureState.vy > SHEET_DISMISS_VELOCITY
            ) {
                dismissSheetFromHandle();
                return;
            }

            resetSheetPosition();
        },
        onPanResponderTerminate: resetSheetPosition
    }), [dismissSheetFromHandle, isSaving, resetSheetPosition, sheetTranslateY]);

    React.useEffect(() => {
        if (visible) {
            sheetTranslateY.setValue(0);
        }
    }, [sheetTranslateY, visible]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable style={StyleSheet.absoluteFill} />
                <Animated.View
                    style={[
                        styles.sheet,
                        sheetInsetStyle,
                        {
                            transform: [{ translateY: sheetTranslateY }]
                        }
                    ]}
                >
                    <View
                        {...sheetHandlePanResponder.panHandlers}
                        collapsable={false}
                        style={styles.handleTouch}
                    >
                        <View style={styles.handle} />
                    </View>
                    <View style={styles.header}>
                        <View style={styles.headerCopy}>
                            <Text style={styles.headerLabel}>기존 일정 추가</Text>
                            <Text style={styles.headerTitle}>어떤 일정을 가져올까요?</Text>
                            <Text style={styles.headerMeta}>
                                가져온 카드는 현재 위치에 새 일정으로 추가돼요.
                            </Text>
                        </View>
                    </View>

                    {errorMessage ? (
                        <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                            <Text style={[styles.noticeText, styles.noticeTextWarning]}>{errorMessage}</Text>
                        </View>
                    ) : null}

                    <ScrollView
                        style={styles.scroll}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[styles.content, contentInsetStyle]}
                    >
                        {copyableDays.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyTitle}>가져올 수 있는 일정이 아직 없어요.</Text>
                                <Text style={styles.emptyBody}>
                                    먼저 일반 장소 카드를 하나 만든 뒤 다시 시도해 보세요.
                                </Text>
                            </View>
                        ) : (
                            copyableDays.map((day) => (
                                <View key={day.id} style={styles.daySection}>
                                    <Text style={styles.dayLabel}>{day.label}</Text>
                                    <Text style={styles.dayMeta}>{day.date}</Text>
                                    <View style={styles.itemList}>
                                        {day.items.map(({ item, itemIndex }) => (
                                            <Pressable
                                                key={`${day.id}-${item.id}`}
                                                accessibilityRole="button"
                                                disabled={isSaving}
                                                onPress={() => {
                                                    onSelect(day.id, item.id, itemIndex);
                                                }}
                                                style={({ pressed }) => [
                                                    styles.itemButton,
                                                    pressed && !isSaving ? styles.buttonPressed : null
                                                ]}
                                            >
                                                <Text style={styles.itemTitle}>{item.title}</Text>
                                                <Text style={styles.itemMeta}>
                                                    {item.timeLabel || '시간 미정'}
                                                    {item.location ? ` · ${item.location}` : ''}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                </View>
                            ))
                        )}
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.28)'
    },
    sheet: {
        height: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        backgroundColor: theme.colors.surface
    },
    handleTouch: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 36,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    handle: {
        width: 48,
        height: 5,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.xs
    },
    headerCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    headerLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    headerTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 24,
        lineHeight: 30,
        fontFamily: theme.fonts.display
    },
    headerMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    noticeCard: {
        marginHorizontal: theme.spacing.sm,
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border
    },
    noticeCardWarning: {
        borderColor: theme.mode === 'dark' ? '#84693a' : '#edd49a',
        backgroundColor: theme.mode === 'dark' ? '#342a16' : '#fff6cf'
    },
    noticeText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    noticeTextWarning: {
        color: theme.colors.warning
    },
    content: {
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.lg
    },
    scroll: {
        flex: 1
    },
    emptyCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    emptyTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold
    },
    emptyBody: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    daySection: {
        marginBottom: theme.spacing.sm
    },
    dayLabel: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontFamily: theme.fonts.bold
    },
    dayMeta: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    itemList: {
        marginTop: theme.spacing.xs
    },
    itemButton: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        marginBottom: theme.spacing.micro
    },
    itemTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    itemMeta: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    buttonPressed: {
        opacity: 0.88
    }
});
