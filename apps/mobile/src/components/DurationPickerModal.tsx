import React from 'react';
import {
    Modal,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';

import { type AppTheme, useAppTheme } from '@/theme';

type Props = {
    visible: boolean;
    value: string;
    onClose(): void;
    onConfirm(value: string): void;
};

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PICKER_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);
const LOOP_REPEAT_COUNT = 7;
const LOOP_CENTER_CYCLE_INDEX = Math.floor(LOOP_REPEAT_COUNT / 2);
const HOUR_VALUES = Array.from({ length: 13 }, (_, index) => String(index));
const MINUTE_VALUES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const MAX_DURATION_MINUTES = 12 * 60 + 59;

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function normalizeLoopIndex(index: number, itemCount: number) {
    if (itemCount <= 0) {
        return 0;
    }

    const nextIndex = index % itemCount;
    return nextIndex >= 0 ? nextIndex : nextIndex + itemCount;
}

function resolveCenteredLoopIndex(values: string[], selectedValue: string) {
    const selectedIndex = Math.max(values.findIndex((entry) => entry === selectedValue), 0);
    return LOOP_CENTER_CYCLE_INDEX * values.length + selectedIndex;
}

function parseDurationValue(value: string) {
    const parsed = Number(String(value || '').trim());
    const safeMinutes = Number.isFinite(parsed) && parsed >= 0
        ? clamp(Math.floor(parsed), 0, MAX_DURATION_MINUTES)
        : 30;

    return {
        hour: String(Math.floor(safeMinutes / 60)),
        minute: String(safeMinutes % 60).padStart(2, '0')
    };
}

function resolveTotalMinutes(hour: string, minute: string) {
    const parsedHour = Number(hour);
    const parsedMinute = Number(minute);

    if (!Number.isFinite(parsedHour) || !Number.isFinite(parsedMinute)) {
        return 0;
    }

    return clamp(Math.floor(parsedHour) * 60 + Math.floor(parsedMinute), 0, MAX_DURATION_MINUTES);
}

function formatDurationLabel(hour: string, minute: string) {
    const totalMinutes = resolveTotalMinutes(hour, minute);
    if (totalMinutes === 0) {
        return '0분';
    }

    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    if (hours > 0 && remainingMinutes > 0) {
        return `${hours}시간 ${remainingMinutes}분`;
    }

    if (hours > 0) {
        return `${hours}시간`;
    }

    return `${remainingMinutes}분`;
}

type PickerColumnProps = {
    label: string;
    values: string[];
    selectedValue: string;
    scrollRef: React.RefObject<ScrollView | null>;
    onSelect(value: string): void;
};

function PickerColumn({ label, values, selectedValue, scrollRef, onSelect }: PickerColumnProps) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const loopedValues = React.useMemo(() => (
        Array.from({ length: LOOP_REPEAT_COUNT }, (_, repeatIndex) => (
            values.map((entry, valueIndex) => ({
                id: `${label}-${repeatIndex}-${entry}-${valueIndex}`,
                value: entry,
                absoluteIndex: repeatIndex * values.length + valueIndex
            }))
        )).flat()
    ), [label, values]);

    const handleScrollEnd = React.useCallback((offsetY: number) => {
        const absoluteIndex = clamp(
            Math.round(offsetY / ITEM_HEIGHT),
            0,
            loopedValues.length - 1
        );
        const normalizedIndex = normalizeLoopIndex(absoluteIndex, values.length);
        const nextValue = values[normalizedIndex];
        const centeredIndex = LOOP_CENTER_CYCLE_INDEX * values.length + normalizedIndex;
        onSelect(nextValue);

        if (absoluteIndex !== centeredIndex) {
            scrollRef.current?.scrollTo({
                y: centeredIndex * ITEM_HEIGHT,
                animated: false
            });
        }
    }, [loopedValues.length, onSelect, scrollRef, values]);
    const handleScrollEndDrag = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const velocityY = Math.abs(event.nativeEvent.velocity?.y ?? 0);
        if (velocityY < 0.05) {
            handleScrollEnd(event.nativeEvent.contentOffset.y);
        }
    }, [handleScrollEnd]);

    return (
        <View style={styles.column}>
            <Text style={styles.columnLabel}>{label}</Text>
            <View style={styles.wheelFrame}>
                <View pointerEvents="none" style={styles.wheelHighlight} />
                <ScrollView
                    ref={scrollRef}
                    style={styles.wheelScroll}
                    showsVerticalScrollIndicator={false}
                    snapToInterval={ITEM_HEIGHT}
                    decelerationRate="normal"
                    directionalLockEnabled
                    scrollEventThrottle={16}
                    alwaysBounceVertical={false}
                    bounces={false}
                    overScrollMode="never"
                    contentContainerStyle={styles.wheelContent}
                    onMomentumScrollEnd={(event) => {
                        handleScrollEnd(event.nativeEvent.contentOffset.y);
                    }}
                    onScrollEndDrag={handleScrollEndDrag}
                >
                    {loopedValues.map((entry) => {
                        const selected = entry.value === selectedValue;

                        return (
                            <Pressable
                                key={entry.id}
                                accessibilityRole="button"
                                onPress={() => {
                                    onSelect(entry.value);
                                    const centeredIndex = resolveCenteredLoopIndex(values, entry.value);
                                    scrollRef.current?.scrollTo({
                                        y: centeredIndex * ITEM_HEIGHT,
                                        animated: true
                                    });
                                }}
                                style={styles.wheelItem}
                            >
                                <Text style={[styles.wheelItemText, selected ? styles.wheelItemTextSelected : null]}>
                                    {entry.value}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );
}

export function DurationPickerModal({ visible, value, onClose, onConfirm }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const initialValue = React.useMemo(() => parseDurationValue(value), [value]);
    const hourScrollRef = React.useRef<ScrollView | null>(null);
    const minuteScrollRef = React.useRef<ScrollView | null>(null);
    const [hour, setHour] = React.useState(initialValue.hour);
    const [minute, setMinute] = React.useState(initialValue.minute);
    const selectedTotalMinutes = React.useMemo(() => resolveTotalMinutes(hour, minute), [hour, minute]);
    const selectedDurationLabel = React.useMemo(() => formatDurationLabel(hour, minute), [hour, minute]);

    React.useEffect(() => {
        if (!visible) {
            return;
        }

        const nextValue = parseDurationValue(value);
        setHour(nextValue.hour);
        setMinute(nextValue.minute);

        const hourIndex = resolveCenteredLoopIndex(HOUR_VALUES, nextValue.hour);
        const minuteIndex = resolveCenteredLoopIndex(MINUTE_VALUES, nextValue.minute);
        const frame = requestAnimationFrame(() => {
            hourScrollRef.current?.scrollTo({
                y: Math.max(hourIndex, 0) * ITEM_HEIGHT,
                animated: false
            });
            minuteScrollRef.current?.scrollTo({
                y: Math.max(minuteIndex, 0) * ITEM_HEIGHT,
                animated: false
            });
        });

        return () => {
            cancelAnimationFrame(frame);
        };
    }, [value, visible]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable
                    accessibilityRole="button"
                    onPress={onClose}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.card}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.label}>머무는 시간 선택</Text>
                            <Text style={styles.value}>{selectedDurationLabel}</Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            onPress={onClose}
                            style={({ pressed }) => [
                                styles.closeButton,
                                pressed ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.closeButtonText}>닫기</Text>
                        </Pressable>
                    </View>

                    <View style={styles.columns}>
                        <PickerColumn
                            label="시간"
                            values={HOUR_VALUES}
                            selectedValue={hour}
                            scrollRef={hourScrollRef}
                            onSelect={setHour}
                        />
                        <PickerColumn
                            label="분"
                            values={MINUTE_VALUES}
                            selectedValue={minute}
                            scrollRef={minuteScrollRef}
                            onSelect={setMinute}
                        />
                    </View>

                    <Pressable
                        accessibilityRole="button"
                        disabled={selectedTotalMinutes < 0}
                        onPress={() => {
                            if (selectedTotalMinutes >= 0) {
                                onConfirm(String(selectedTotalMinutes));
                            }
                        }}
                        style={({ pressed }) => [
                            styles.confirmButton,
                            selectedTotalMinutes < 0 ? styles.confirmButtonDisabled : null,
                            pressed && selectedTotalMinutes >= 0 ? styles.buttonPressed : null
                        ]}
                    >
                        <Text style={styles.confirmButtonText}>이 시간으로 선택</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    overlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.28)',
        padding: theme.spacing.sm
    },
    card: {
        width: '100%',
        maxWidth: 420,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.surface
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.md
    },
    label: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold
    },
    value: {
        marginTop: theme.spacing.micro,
        fontSize: 22,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold
    },
    closeButton: {
        minHeight: 36,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background
    },
    closeButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    columns: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.md
    },
    column: {
        flex: 1
    },
    columnLabel: {
        marginBottom: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    wheelFrame: {
        height: PICKER_HEIGHT,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: theme.colors.background
    },
    wheelScroll: {
        flex: 1
    },
    wheelHighlight: {
        position: 'absolute',
        top: PICKER_PADDING,
        left: theme.spacing.xs,
        right: theme.spacing.xs,
        height: ITEM_HEIGHT,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    wheelContent: {
        paddingVertical: PICKER_PADDING
    },
    wheelItem: {
        height: ITEM_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm
    },
    wheelItemText: {
        color: theme.colors.textSecondary,
        fontSize: 15,
        fontFamily: theme.fonts.body
    },
    wheelItemTextSelected: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold
    },
    confirmButton: {
        minHeight: 48,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent
    },
    confirmButtonDisabled: {
        opacity: 0.42
    },
    confirmButtonText: {
        color: '#ffffff',
        fontSize: 15,
        fontFamily: theme.fonts.bold
    },
    buttonPressed: {
        opacity: 0.72
    }
});
