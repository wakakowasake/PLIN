import React from 'react';
import {
    ActivityIndicator,
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
import type { MobileQuickRouteOption } from '@/types/trip';
import { SheetBackButton } from './SheetBackButton';

type Props = {
    visible: boolean;
    dayLabel: string;
    dayDate: string;
    originLabel: string;
    destinationLabel: string;
    loading: boolean;
    isSaving: boolean;
    routeOptions: MobileQuickRouteOption[];
    errorMessage?: string | null;
    onClose(): void;
    onSelect(option: MobileQuickRouteOption): void;
};

const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 0.85;

const QUICK_ROUTE_CHIP_FALLBACK_COLORS = {
    bus: '#17864F',
    subway: '#2563EB',
    train: '#7C3AED',
    walk: '#FF6600'
} as const;

function normalizeRouteChipColor(value: string | null | undefined) {
    const color = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) {
        return color;
    }

    if (/^[0-9a-f]{6}$/i.test(color)) {
        return `#${color}`;
    }

    return '';
}

function resolveRouteChipBaseColor(chip: MobileQuickRouteOption['chips'][number]) {
    const explicitColor = normalizeRouteChipColor(chip.color);
    if (explicitColor) {
        return explicitColor;
    }

    const normalizedIcon = String(chip.icon || '').trim().toLowerCase();
    const normalizedLabel = String(chip.label || '').trim().toLowerCase();
    const combined = `${normalizedIcon} ${normalizedLabel}`;

    if (combined.includes('subway') || combined.includes('metro') || combined.includes('전철') || combined.includes('지하철')) {
        return QUICK_ROUTE_CHIP_FALLBACK_COLORS.subway;
    }

    if (combined.includes('train') || combined.includes('rail') || combined.includes('기차')) {
        return QUICK_ROUTE_CHIP_FALLBACK_COLORS.train;
    }

    if (combined.includes('walk') || combined.includes('도보')) {
        return QUICK_ROUTE_CHIP_FALLBACK_COLORS.walk;
    }

    return QUICK_ROUTE_CHIP_FALLBACK_COLORS.bus;
}

function resolveRouteChipTextColor(backgroundColor: string) {
    const hex = backgroundColor.replace('#', '').padStart(6, '0').slice(0, 6);
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const brightness = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
    return brightness > 160 ? '#1A1C20' : '#FFFFFF';
}

function getRouteChipTone(chip: MobileQuickRouteOption['chips'][number]) {
    const backgroundColor = resolveRouteChipBaseColor(chip);
    const color = resolveRouteChipTextColor(backgroundColor);

    return {
        container: {
            backgroundColor,
            borderColor: backgroundColor
        },
        text: {
            color
        }
    };
}

function formatRouteChipIconLabel(icon: string) {
    if (icon === 'subway') {
        return '지하철';
    }

    if (icon === 'train') {
        return '기차';
    }

    if (icon === 'directions_walk') {
        return '도보';
    }

    return '버스';
}

export function TimelineQuickRoutePickerModal({
    visible,
    dayLabel,
    dayDate,
    originLabel,
    destinationLabel,
    loading,
    isSaving,
    routeOptions,
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
                        <SheetBackButton disabled={isSaving} onPress={onClose} />
                        <View style={styles.headerCopy}>
                            <Text style={styles.headerLabel}>자동 추천 경로 추가</Text>
                            <Text style={styles.headerTitle}>이동 카드를 골라서 넣을까요?</Text>
                            <Text style={styles.headerMeta}>
                                {dayLabel} · {dayDate}
                            </Text>
                            <Text style={styles.headerRoute}>
                                {originLabel || '출발지'} → {destinationLabel || '도착지'}
                            </Text>
                        </View>
                    </View>

                    {loading ? (
                        <View style={styles.loadingCard}>
                            <ActivityIndicator size="small" color={theme.colors.accent} />
                            <Text style={styles.loadingTitle}>자동 추천 경로를 찾는 중이에요.</Text>
                            <Text style={styles.loadingBody}>후보를 고른 뒤 이동 카드를 일정 사이에 바로 넣을 수 있어요.</Text>
                        </View>
                    ) : errorMessage ? (
                        <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                            <Text style={[styles.noticeText, styles.noticeTextWarning]}>{errorMessage}</Text>
                        </View>
                    ) : null}

                    {!loading ? (
                        <ScrollView
                            style={styles.scroll}
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={[styles.content, contentInsetStyle]}
                        >
                            {routeOptions.map((option, index) => (
                                <Pressable
                                    key={option.id}
                                    accessibilityRole="button"
                                    disabled={isSaving}
                                    onPress={() => {
                                        onSelect(option);
                                    }}
                                    style={({ pressed }) => [
                                        styles.routeCard,
                                        index === 0 ? styles.routeCardRecommended : null,
                                        pressed && !isSaving ? styles.buttonPressed : null
                                    ]}
                                >
                                    <View style={styles.routeTopRow}>
                                        <Text style={styles.routeDuration}>{option.durationText}</Text>
                                        <View style={styles.routeTopMetaRow}>
                                            {option.distanceText ? (
                                                <View style={styles.distancePill}>
                                                    <Text style={styles.distancePillText}>{option.distanceText}</Text>
                                                </View>
                                            ) : null}
                                            {index === 0 ? (
                                                <View style={styles.recommendedBadge}>
                                                    <Text style={styles.recommendedBadgeText}>추천</Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    </View>
                                    <View style={styles.chipRow}>
                                        {option.chips.map((chip, chipIndex) => {
                                            const chipTone = getRouteChipTone(chip);

                                            return (
                                                <View
                                                    key={`${option.id}-chip-${chipIndex}`}
                                                    style={[
                                                        styles.routeChip,
                                                        chipTone.container
                                                    ]}
                                                >
                                                    <Text style={[styles.routeChipIcon, chipTone.text]}>
                                                        {formatRouteChipIconLabel(chip.icon)}
                                                    </Text>
                                                    <Text style={[styles.routeChipLabel, chipTone.text]}>
                                                        {chip.label}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                    <Text style={styles.routeTitle}>{option.summaryTitle}</Text>
                                </Pressable>
                            ))}

                            {!errorMessage && routeOptions.length === 0 ? (
                                <View style={styles.emptyCard}>
                                    <Text style={styles.emptyTitle}>선택할 수 있는 경로가 아직 없어요.</Text>
                                    <Text style={styles.emptyBody}>앞뒤 장소 정보가 충분한지 다시 확인해 주세요.</Text>
                                </View>
                            ) : null}
                        </ScrollView>
                    ) : null}
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
        gap: theme.spacing.xs,
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
    headerRoute: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    loadingCard: {
        marginHorizontal: theme.spacing.sm,
        marginBottom: theme.spacing.xs,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        alignItems: 'center'
    },
    loadingTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold
    },
    loadingBody: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    noticeCard: {
        marginHorizontal: theme.spacing.sm,
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md
    },
    noticeCardWarning: {
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
    routeCard: {
        marginBottom: theme.spacing.xs,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    routeCardRecommended: {
        backgroundColor: theme.colors.accentSoft
    },
    recommendedBadge: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 4,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accent
    },
    recommendedBadgeText: {
        color: '#ffffff',
        fontSize: 11,
        fontFamily: theme.fonts.bold
    },
    routeTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
    },
    routeTopMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexShrink: 0,
        gap: theme.spacing.micro
    },
    routeDuration: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontSize: 28,
        fontFamily: theme.fonts.display
    },
    distancePill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    distancePillText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.micro,
        marginTop: theme.spacing.xs
    },
    routeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface
    },
    routeChipIcon: {
        marginRight: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.bold
    },
    routeChipLabel: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    routeTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold
    },
    emptyCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
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
    buttonPressed: {
        opacity: 0.88
    }
});
