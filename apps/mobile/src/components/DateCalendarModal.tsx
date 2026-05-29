import React from 'react';
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View
} from 'react-native';

import { type AppTheme, useAppTheme } from '@/theme';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

type CalendarCell = {
    key: string;
    isoDate: string;
    dayNumber: number;
    isCurrentMonth: boolean;
};

type CalendarNotice = {
    tone: 'info' | 'warning';
    text: string;
};

type CalendarBaseProps = {
    title?: string;
    startDate: string;
    endDate: string;
    helperNotice?: CalendarNotice | null;
    selectionMode?: 'range' | 'single';
    onSelectRange(startDate: string, endDate: string): void;
    onDraftRangeChange?(startDate: string, endDate: string): void;
};

type ModalProps = CalendarBaseProps & {
    visible: boolean;
    title: string;
    onClose(): void;
};

type InlineProps = CalendarBaseProps;

function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

export function parseIsoDateInput(value: string) {
    const safeValue = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
        return null;
    }

    const [yearText, monthText, dayText] = safeValue.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(year, month - 1, day);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return formatDateInput(date) === safeValue ? date : null;
}

export function formatCalendarDisplayDate(value: string) {
    const date = parseIsoDateInput(value);
    if (!date) {
        return '날짜 선택';
    }

    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatCalendarMonthLabel(date: Date) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function addMonths(date: Date, offset: number) {
    return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function startOfWeek(date: Date) {
    const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    nextDate.setDate(nextDate.getDate() - nextDate.getDay());
    return nextDate;
}

function buildCalendarCells(monthDate: Date): CalendarCell[] {
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const cursor = startOfWeek(monthStart);
    const cells: CalendarCell[] = [];

    for (let index = 0; index < 42; index += 1) {
        const currentDate = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + index);
        cells.push({
            key: formatDateInput(currentDate),
            isoDate: formatDateInput(currentDate),
            dayNumber: currentDate.getDate(),
            isCurrentMonth: currentDate.getMonth() === monthDate.getMonth()
        });
    }

    return cells;
}

type CalendarPanelProps = CalendarBaseProps & {
    isActive: boolean;
    onClose?: (() => void) | undefined;
    showCloseButton: boolean;
    showConfirmButton: boolean;
    variant: 'modal' | 'inline';
};

function DateCalendarPanel({
    title,
    startDate,
    endDate,
    helperNotice,
    onSelectRange,
    onDraftRangeChange,
    selectionMode = 'range',
    isActive,
    onClose,
    showCloseButton,
    showConfirmButton,
    variant
}: CalendarPanelProps) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const todayIso = React.useMemo(() => formatDateInput(new Date()), []);
    const hasInitializedInlineMonthRef = React.useRef(false);
    const [draftStartDate, setDraftStartDate] = React.useState(startDate);
    const [draftEndDate, setDraftEndDate] = React.useState(endDate);
    const [visibleMonth, setVisibleMonth] = React.useState(() => (
        parseIsoDateInput(startDate) || parseIsoDateInput(endDate) || new Date()
    ));

    React.useEffect(() => {
        if (!isActive) {
            return;
        }

        setDraftStartDate(startDate);
        setDraftEndDate(endDate);

        if (variant === 'inline') {
            if (!hasInitializedInlineMonthRef.current) {
                hasInitializedInlineMonthRef.current = true;
                setVisibleMonth(
                    parseIsoDateInput(startDate)
                    || parseIsoDateInput(endDate)
                    || new Date()
                );
            }

            return;
        }

        setVisibleMonth(
            parseIsoDateInput(startDate)
            || parseIsoDateInput(endDate)
            || new Date()
        );
    }, [endDate, isActive, startDate, variant]);

    const cells = React.useMemo(() => buildCalendarCells(visibleMonth), [visibleMonth]);
    const isSingleDateMode = selectionMode === 'single';
    const hasCompleteRange = Boolean(draftStartDate && draftEndDate);
    const subtitle = hasCompleteRange
        ? isSingleDateMode
            ? '다시 누르면 날짜를 바꿀 수 있어요.'
            : '다시 누르면 새로운 시작일부터 다시 고를 수 있어요.'
        : draftStartDate
            ? isSingleDateMode
                ? '선택한 날짜로 일정이 만들어져요.'
                : '돌아오는 날을 선택하면 기간이 완성돼요.'
            : isSingleDateMode
                ? '진행할 날짜를 선택해 주세요.'
                : '출발일과 돌아오는 날을 차례로 선택해 주세요.';
    const showSubtitle = variant !== 'inline';
    const showHeader = Boolean(title) || showSubtitle || (showCloseButton && onClose);

    const handleSelectDay = React.useCallback((isoDate: string) => {
        if (isSingleDateMode) {
            onDraftRangeChange?.(isoDate, isoDate);
            setDraftStartDate(isoDate);
            setDraftEndDate(isoDate);
            return;
        }

        if (!draftStartDate || draftEndDate) {
            onDraftRangeChange?.(isoDate, '');
            setDraftStartDate(isoDate);
            setDraftEndDate('');
            return;
        }

        if (isoDate < draftStartDate) {
            onDraftRangeChange?.(isoDate, '');
            setDraftStartDate(isoDate);
            setDraftEndDate('');
            return;
        }

        onDraftRangeChange?.(draftStartDate, isoDate);
        setDraftEndDate(isoDate);
    }, [draftEndDate, draftStartDate, isSingleDateMode, onDraftRangeChange]);

    return (
        <View style={[styles.card, variant === 'inline' ? styles.cardInline : null]}>
            {showHeader ? (
                <View
                    style={[
                        styles.header,
                        !showCloseButton ? styles.headerInline : null,
                        variant === 'inline' ? styles.headerInlinePanel : null
                    ]}
                >
                    <View style={styles.headerContent}>
                        {title ? <Text style={styles.title}>{title}</Text> : null}
                        {showSubtitle ? (
                            <Text style={[styles.subtitle, !title ? styles.subtitleStandalone : null]}>
                                {subtitle}
                            </Text>
                        ) : null}
                    </View>
                    {showCloseButton && onClose ? (
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
                    ) : null}
                </View>
            ) : null}

            <View style={[styles.selectionSummary, variant === 'inline' ? styles.selectionSummaryInline : null]}>
                <View style={[
                    styles.selectionSummaryCard,
                    variant === 'inline' ? styles.selectionSummaryCardInline : null
                ]}>
                    <Text style={styles.selectionSummaryLabel}>
                        {isSingleDateMode ? '날짜' : '시작일'}
                    </Text>
                    <Text style={styles.selectionSummaryValue}>
                        {formatCalendarDisplayDate(draftStartDate)}
                    </Text>
                </View>
                {!isSingleDateMode ? (
                    <View style={[
                        styles.selectionSummaryCard,
                        variant === 'inline' ? styles.selectionSummaryCardInline : null
                    ]}>
                        <Text style={styles.selectionSummaryLabel}>종료일</Text>
                        <Text style={styles.selectionSummaryValue}>
                            {formatCalendarDisplayDate(draftEndDate)}
                        </Text>
                    </View>
                ) : null}
            </View>

            <View style={[styles.monthRow, variant === 'inline' ? styles.monthRowInline : null]}>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                        setVisibleMonth((current) => addMonths(current, -1));
                    }}
                    style={({ pressed }) => [
                        styles.monthAction,
                        pressed ? styles.buttonPressed : null
                    ]}
                >
                    <Text style={styles.monthActionText}>이전</Text>
                </Pressable>
                <Text style={styles.monthLabel}>{formatCalendarMonthLabel(visibleMonth)}</Text>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                        setVisibleMonth((current) => addMonths(current, 1));
                    }}
                    style={({ pressed }) => [
                        styles.monthAction,
                        pressed ? styles.buttonPressed : null
                    ]}
                >
                    <Text style={styles.monthActionText}>다음</Text>
                </Pressable>
            </View>

            <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((label) => (
                    <Text key={label} style={styles.weekdayLabel}>{label}</Text>
                ))}
            </View>

            <View style={styles.grid}>
                {cells.map((cell) => {
                    const isRangeStart = cell.isoDate === draftStartDate;
                    const isRangeEnd = cell.isoDate === draftEndDate;
                    const isSelected = isRangeStart || isRangeEnd;
                    const isInRange = Boolean(
                        draftStartDate
                        && draftEndDate
                        && cell.isoDate > draftStartDate
                        && cell.isoDate < draftEndDate
                    );
                    const isToday = cell.isoDate === todayIso;

                    return (
                        <Pressable
                            key={cell.key}
                            accessibilityRole="button"
                            onPress={() => {
                                handleSelectDay(cell.isoDate);
                            }}
                            style={({ pressed }) => [
                                styles.dayCell,
                                !cell.isCurrentMonth ? styles.dayCellOutsideMonth : null,
                                isInRange ? styles.dayCellInRange : null,
                                isSelected ? styles.dayCellSelected : null,
                                pressed ? styles.buttonPressed : null
                            ]}
                        >
                            <Text
                                style={[
                                    styles.dayLabel,
                                    !cell.isCurrentMonth ? styles.dayLabelOutsideMonth : null,
                                    isInRange ? styles.dayLabelInRange : null,
                                    isSelected ? styles.dayLabelSelected : null,
                                    isToday && !isSelected ? styles.dayLabelToday : null
                                ]}
                            >
                                {cell.dayNumber}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {helperNotice ? (
                <View
                    style={[
                        styles.noticeCard,
                        helperNotice.tone === 'warning' ? styles.noticeCardWarning : styles.noticeCardInfo
                    ]}
                >
                    <Text
                        style={[
                            styles.noticeText,
                            helperNotice.tone === 'warning' ? styles.noticeTextWarning : null
                        ]}
                    >
                        {helperNotice.text}
                    </Text>
                </View>
            ) : null}

            <Text style={[styles.helperText, variant === 'inline' ? styles.helperTextInline : null]}>
                {isSingleDateMode
                    ? '데이트 일정은 선택한 날짜 하루로 만들어져요.'
                    : '하루 일정은 종료일을 시작일과 같은 날로 고르면 돼요.'}
            </Text>

            {showConfirmButton ? (
                <Pressable
                    accessibilityRole="button"
                    disabled={!hasCompleteRange}
                    onPress={() => {
                        if (!draftStartDate || !draftEndDate) {
                            return;
                        }

                        onSelectRange(draftStartDate, draftEndDate);
                    }}
                    style={({ pressed }) => [
                        styles.confirmButton,
                        !hasCompleteRange ? styles.confirmButtonDisabled : null,
                        pressed && hasCompleteRange ? styles.buttonPressed : null
                    ]}
                >
                    <Text style={styles.confirmButtonText}>기간 선택 완료</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

export function DateCalendarInline(props: InlineProps) {
    return (
        <DateCalendarPanel
            {...props}
            isActive
            showCloseButton={false}
            showConfirmButton={false}
            variant="inline"
        />
    );
}

export function DateCalendarModal({
    visible,
    onClose,
    ...props
}: ModalProps) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <Modal
            animationType="fade"
            transparent
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.backdrop}>
                <Pressable
                    accessibilityRole="button"
                    onPress={onClose}
                    style={StyleSheet.absoluteFill}
                />
                <DateCalendarPanel
                    {...props}
                    isActive={visible}
                    onClose={onClose}
                    showCloseButton
                    showConfirmButton
                    variant="modal"
                />
            </View>
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        padding: theme.spacing.sm,
        backgroundColor: theme.mode === 'dark'
            ? 'rgba(0, 0, 0, 0.52)'
            : 'rgba(27, 20, 14, 0.34)'
    },
    card: {
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md
    },
    cardInline: {
        borderRadius: 0,
        borderWidth: 0,
        backgroundColor: 'transparent',
        paddingHorizontal: 0,
        paddingTop: 0,
        paddingBottom: 0
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: theme.spacing.sm
    },
    headerInline: {
        justifyContent: 'flex-start'
    },
    headerInlinePanel: {
        paddingHorizontal: theme.spacing.sm
    },
    headerContent: {
        flex: 1,
        minWidth: 0
    },
    title: {
        color: theme.colors.textPrimary,
        fontSize: 20,
        fontFamily: theme.fonts.bold
    },
    subtitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    subtitleStandalone: {
        marginTop: 0
    },
    selectionSummary: {
        marginTop: theme.spacing.sm,
        flexDirection: 'row',
        gap: theme.spacing.sm
    },
    selectionSummaryInline: {
        paddingHorizontal: theme.spacing.sm
    },
    selectionSummaryCard: {
        flex: 1,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    selectionSummaryCardInline: {
        paddingHorizontal: 0,
        borderRadius: 0,
        borderWidth: 0,
        backgroundColor: 'transparent'
    },
    selectionSummaryLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    selectionSummaryValue: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.bold
    },
    closeButton: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 8,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    closeButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    monthRow: {
        marginTop: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    monthRowInline: {
        paddingHorizontal: theme.spacing.sm
    },
    monthAction: {
        minWidth: 62,
        paddingVertical: 8,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft,
        alignItems: 'center'
    },
    monthActionText: {
        color: theme.colors.accent,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    monthLabel: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontFamily: theme.fonts.bold
    },
    weekdayRow: {
        flexDirection: 'row',
        marginBottom: theme.spacing.micro
    },
    weekdayLabel: {
        width: '14.285%',
        textAlign: 'center',
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap'
    },
    dayCell: {
        width: '14.285%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm
    },
    dayCellOutsideMonth: {
        opacity: 0.8
    },
    dayCellInRange: {
        backgroundColor: theme.colors.accentSoft
    },
    dayCellSelected: {
        backgroundColor: theme.colors.accent
    },
    dayLabel: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    dayLabelOutsideMonth: {
        color: theme.colors.textSecondary
    },
    dayLabelInRange: {
        color: theme.colors.textPrimary
    },
    dayLabelSelected: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#fffdf8'
    },
    dayLabelToday: {
        color: theme.colors.accent
    },
    helperText: {
        marginTop: theme.spacing.sm,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    helperTextInline: {
        paddingHorizontal: theme.spacing.sm
    },
    noticeCard: {
        marginTop: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: 1
    },
    noticeCardInfo: {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    noticeCardWarning: {
        borderColor: theme.mode === 'dark' ? '#6b4a3d' : '#e3b7a2',
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    noticeText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    noticeTextWarning: {
        color: theme.colors.warning
    },
    confirmButton: {
        marginTop: theme.spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    confirmButtonDisabled: {
        opacity: 0.42
    },
    confirmButtonText: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#fffdf8',
        fontSize: 15,
        fontFamily: theme.fonts.bold
    },
    buttonPressed: {
        opacity: 0.86
    }
});
