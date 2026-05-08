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
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function parseTimeValue(value: string) {
    const normalized = String(value || '').trim();
    const [hourText = '09', minuteText = '00'] = normalized.split(':');
    const safeHour = HOURS.includes(hourText.padStart(2, '0')) ? hourText.padStart(2, '0') : '09';
    const safeMinute = MINUTES.includes(minuteText.padStart(2, '0')) ? minuteText.padStart(2, '0') : '00';

    return {
        hour: safeHour,
        minute: safeMinute
    };
}

function normalizeLoopIndex(index: number, itemCount: number) {
    if (itemCount <= 0) {
        return 0;
    }

    const nextIndex = index % itemCount;
    return nextIndex >= 0 ? nextIndex : nextIndex + itemCount;
}

function resolveCenteredLoopIndex(values: string[], selectedValue: string) {
    const itemIndex = Math.max(values.findIndex((entry) => entry === selectedValue), 0);
    return LOOP_CENTER_CYCLE_INDEX * values.length + itemIndex;
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

export function TimePickerModal({ visible, value, onClose, onConfirm }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const initialValue = React.useMemo(() => parseTimeValue(value), [value]);
    const hourScrollRef = React.useRef<ScrollView | null>(null);
    const minuteScrollRef = React.useRef<ScrollView | null>(null);
    const [hour, setHour] = React.useState(initialValue.hour);
    const [minute, setMinute] = React.useState(initialValue.minute);

    React.useEffect(() => {
        if (!visible) {
            return;
        }

        const nextValue = parseTimeValue(value);
        setHour(nextValue.hour);
        setMinute(nextValue.minute);

        const hourIndex = resolveCenteredLoopIndex(HOURS, nextValue.hour);
        const minuteIndex = resolveCenteredLoopIndex(MINUTES, nextValue.minute);

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
                            <Text style={styles.label}>시간 선택</Text>
                            <Text style={styles.value}>{hour}:{minute}</Text>
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
                            label="시"
                            values={HOURS}
                            selectedValue={hour}
                            scrollRef={hourScrollRef}
                            onSelect={setHour}
                        />
                        <PickerColumn
                            label="분"
                            values={MINUTES}
                            selectedValue={minute}
                            scrollRef={minuteScrollRef}
                            onSelect={setMinute}
                        />
                    </View>

                    <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                            onConfirm(`${hour}:${minute}`);
                        }}
                        style={({ pressed }) => [
                            styles.confirmButton,
                            pressed ? styles.buttonPressed : null
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
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.sm
    },
    label: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    value: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 28,
        fontFamily: theme.fonts.display
    },
    closeButton: {
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    closeButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    columns: {
        flexDirection: 'row',
        gap: theme.spacing.xs
    },
    column: {
        flex: 1
    },
    columnLabel: {
        marginBottom: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    wheelFrame: {
        height: PICKER_HEIGHT,
        overflow: 'hidden',
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    wheelScroll: {
        flex: 1
    },
    wheelHighlight: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: PICKER_PADDING,
        height: ITEM_HEIGHT,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    wheelContent: {
        paddingVertical: PICKER_PADDING
    },
    wheelItem: {
        height: ITEM_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center'
    },
    wheelItemText: {
        color: theme.colors.textSecondary,
        fontSize: 20,
        fontFamily: theme.fonts.semibold
    },
    wheelItemTextSelected: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.display
    },
    confirmButton: {
        marginTop: theme.spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    confirmButtonText: {
        color: '#ffffff',
        fontFamily: theme.fonts.bold
    },
    buttonPressed: {
        opacity: 0.88
    }
});
