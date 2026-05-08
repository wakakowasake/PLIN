import { formatDuration, formatTimeStr, parseTimeStr } from '@shared/core/utils/time-value-helpers.js';
import {
    formatAirportSelectionValue,
    getAirportSuggestions,
    resolveAirport
} from '@shared/features/transit/airports-data.js';
import {
    calculateFlightDurationDetails,
    formatTimeZoneOffsetLabel
} from '@shared/features/transit/flight-time-helpers.js';
import { getTransitTypeMeta } from '@shared/features/transit/transit-item-helpers.js';
import React from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import type {
    MobileTimelineManualTransitType,
    MobileTimelineTransitCreateInput
} from '@/types/trip';
import { DurationPickerModal } from './DurationPickerModal';
import { TimePickerModal } from './TimePickerModal';

type Props = {
    visible: boolean;
    dayLabel: string;
    dayDate: string;
    transitType: MobileTimelineManualTransitType;
    defaultStartTime: string;
    defaultEndTime: string;
    isSaving: boolean;
    errorMessage?: string | null;
    onClose(): void;
    onSubmit(input: MobileTimelineTransitCreateInput): void;
};

const AIRPORT_SUGGESTION_LIMIT = 6;

type AirportFieldKey = 'departure' | 'arrival';

function normalizeTextInput(value: string) {
    return String(value || '').trim();
}

function normalizeTimeInput(value: string) {
    const parsed = parseTimeStr(String(value || '').trim());
    if (parsed === null) {
        return '';
    }

    return formatTimeStr(parsed);
}

function parseDurationMinutesInput(value: string) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return null;
    }

    return Math.max(1, Math.floor(parsed));
}

function getDurationMinutes(startTime: string, endTime: string) {
    const parsedStart = parseTimeStr(startTime);
    const parsedEnd = parseTimeStr(endTime);

    if (parsedStart === null || parsedEnd === null) {
        return null;
    }

    if (parsedStart === parsedEnd) {
        return 0;
    }

    return parsedEnd > parsedStart
        ? parsedEnd - parsedStart
        : (24 * 60) - parsedStart + parsedEnd;
}

function addMinutesToTime(startTime: string, durationMinutes: number | null) {
    const parsedStart = parseTimeStr(startTime);
    if (parsedStart === null || !Number.isFinite(durationMinutes) || !durationMinutes || durationMinutes < 1) {
        return '';
    }

    return formatTimeStr(parsedStart + durationMinutes);
}

function formatDurationPickerLabel(value: string) {
    const minutes = parseDurationMinutesInput(value);
    if (minutes === null) {
        return '소요 시간 선택';
    }

    return formatDuration(minutes);
}

function formatAirportMatchMeta(airport: { city?: string; timeZone?: string } | null, dayDate: string) {
    if (!airport) {
        return '';
    }

    const pieces = [];
    if (airport.city) {
        pieces.push(airport.city);
    }

    const offsetLabel = airport.timeZone
        ? formatTimeZoneOffsetLabel(airport.timeZone, dayDate)
        : '';
    if (offsetLabel) {
        pieces.push(offsetLabel);
    }

    return pieces.join(' · ');
}

export function TimelineTransitComposerModal({
    visible,
    dayLabel,
    dayDate,
    transitType,
    defaultStartTime,
    defaultEndTime,
    isSaving,
    errorMessage,
    onClose,
    onSubmit
}: Props) {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const [isIosKeyboardVisible, setIsIosKeyboardVisible] = React.useState(false);
    const sheetInsetStyle = React.useMemo(() => ({
        paddingTop: insets.top
    }), [insets.top]);
    const actionInsetStyle = React.useMemo(() => ({
        paddingBottom: Platform.OS === 'ios' && isIosKeyboardVisible
            ? 0
            : insets.bottom + theme.spacing.md
    }), [insets.bottom, isIosKeyboardVisible, theme.spacing.md]);
    const {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        scrollViewProps
    } = useKeyboardAwareInputScroll(136);
    const meta = React.useMemo(() => getTransitTypeMeta(transitType), [transitType]);
    const isAirplane = transitType === 'airplane';
    const [title, setTitle] = React.useState(meta.title);
    const [startTime, setStartTime] = React.useState(defaultStartTime || '09:00');
    const [endTime, setEndTime] = React.useState(defaultEndTime || '09:30');
    const [durationMinutesText, setDurationMinutesText] = React.useState('30');
    const [note, setNote] = React.useState('');
    const [departure, setDeparture] = React.useState('');
    const [arrival, setArrival] = React.useState('');
    const [flightNumber, setFlightNumber] = React.useState('');
    const [bookingRef, setBookingRef] = React.useState('');
    const [terminal, setTerminal] = React.useState('');
    const [gate, setGate] = React.useState('');
    const [didAttemptSubmit, setDidAttemptSubmit] = React.useState(false);
    const [activePicker, setActivePicker] = React.useState<'start' | 'end' | null>(null);
    const [isDurationPickerVisible, setDurationPickerVisible] = React.useState(false);
    const [activeAirportField, setActiveAirportField] = React.useState<AirportFieldKey | null>(null);

    React.useEffect(() => {
        if (Platform.OS !== 'ios') {
            return undefined;
        }

        const showSubscription = Keyboard.addListener('keyboardWillShow', () => {
            setIsIosKeyboardVisible(true);
        });
        const hideSubscription = Keyboard.addListener('keyboardWillHide', () => {
            setIsIosKeyboardVisible(false);
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    React.useEffect(() => {
        if (!visible) {
            setIsIosKeyboardVisible(false);
            setActivePicker(null);
            setDurationPickerVisible(false);
            setActiveAirportField(null);
            return;
        }

        const defaultDuration = getDurationMinutes(defaultStartTime || '09:00', defaultEndTime || '09:30');

        setTitle(meta.title);
        setStartTime(defaultStartTime || '09:00');
        setEndTime(defaultEndTime || '09:30');
        setDurationMinutesText(String(defaultDuration && defaultDuration > 0 ? defaultDuration : 30));
        setNote('');
        setDeparture('');
        setArrival('');
        setFlightNumber('');
        setBookingRef('');
        setTerminal('');
        setGate('');
        setDidAttemptSubmit(false);
        setActivePicker(null);
        setDurationPickerVisible(false);
        setActiveAirportField(null);
    }, [defaultEndTime, defaultStartTime, meta.title, visible]);

    const normalizedTitle = React.useMemo(() => normalizeTextInput(title), [title]);
    const normalizedStartTime = React.useMemo(() => normalizeTimeInput(startTime), [startTime]);
    const normalizedEndTime = React.useMemo(() => normalizeTimeInput(endTime), [endTime]);
    const normalizedDurationMinutes = React.useMemo(
        () => parseDurationMinutesInput(durationMinutesText),
        [durationMinutesText]
    );
    const normalizedNote = React.useMemo(() => normalizeTextInput(note), [note]);
    const normalizedDeparture = React.useMemo(() => normalizeTextInput(departure), [departure]);
    const normalizedArrival = React.useMemo(() => normalizeTextInput(arrival), [arrival]);
    const normalizedFlightNumber = React.useMemo(() => normalizeTextInput(flightNumber).toUpperCase(), [flightNumber]);
    const normalizedBookingRef = React.useMemo(() => normalizeTextInput(bookingRef).toUpperCase(), [bookingRef]);
    const normalizedTerminal = React.useMemo(() => normalizeTextInput(terminal).toUpperCase(), [terminal]);
    const normalizedGate = React.useMemo(() => normalizeTextInput(gate).toUpperCase(), [gate]);
    const departureAirport = React.useMemo(
        () => resolveAirport(normalizedDeparture),
        [normalizedDeparture]
    );
    const arrivalAirport = React.useMemo(
        () => resolveAirport(normalizedArrival),
        [normalizedArrival]
    );
    const departureAirportSuggestions = React.useMemo(
        () => activeAirportField === 'departure'
            ? getAirportSuggestions(normalizedDeparture, AIRPORT_SUGGESTION_LIMIT)
            : [],
        [activeAirportField, normalizedDeparture]
    );
    const arrivalAirportSuggestions = React.useMemo(
        () => activeAirportField === 'arrival'
            ? getAirportSuggestions(normalizedArrival, AIRPORT_SUGGESTION_LIMIT)
            : [],
        [activeAirportField, normalizedArrival]
    );
    const departureAirportMeta = React.useMemo(
        () => formatAirportMatchMeta(departureAirport, dayDate),
        [dayDate, departureAirport]
    );
    const arrivalAirportMeta = React.useMemo(
        () => formatAirportMatchMeta(arrivalAirport, dayDate),
        [dayDate, arrivalAirport]
    );
    const airplaneDurationInfo = React.useMemo(
        () => calculateFlightDurationDetails({
            dayDate,
            departureTime: normalizedStartTime,
            arrivalTime: normalizedEndTime,
            departureAirport: normalizedDeparture,
            arrivalAirport: normalizedArrival
        }),
        [dayDate, normalizedArrival, normalizedDeparture, normalizedEndTime, normalizedStartTime]
    );
    const autoAirplaneDurationMinutes = airplaneDurationInfo.durationMinutes;
    const genericComputedEndTime = React.useMemo(
        () => addMinutesToTime(normalizedStartTime, normalizedDurationMinutes),
        [normalizedDurationMinutes, normalizedStartTime]
    );

    const startTimeError = !normalizedStartTime ? '출발 시간을 선택해 주세요.' : null;
    const endTimeError = isAirplane && !normalizedEndTime ? '도착 시간을 선택해 주세요.' : null;
    const durationError = isAirplane
        ? !autoAirplaneDurationMinutes || autoAirplaneDurationMinutes < 1
            ? '소요 시간을 계산할 수 없어요. 시간을 다시 확인해 주세요.'
            : null
        : normalizedDurationMinutes === null
            ? '소요 시간을 분 단위로 입력해 주세요.'
            : null;
    const titleError = !isAirplane && !normalizedTitle ? '이동 경로를 입력해 주세요.' : null;
    const departureError = isAirplane && !normalizedDeparture ? '출발 공항을 입력해 주세요.' : null;
    const arrivalError = isAirplane && !normalizedArrival ? '도착 공항을 입력해 주세요.' : null;
    const canSubmit = !isSaving;

    const handleSubmit = React.useCallback(() => {
        setDidAttemptSubmit(true);

        if (isAirplane) {
            if (
                startTimeError ||
                endTimeError ||
                durationError ||
                departureError ||
                arrivalError ||
                !autoAirplaneDurationMinutes ||
                autoAirplaneDurationMinutes < 1
            ) {
                return;
            }

            onSubmit({
                transitType,
                startTime: normalizedStartTime,
                endTime: normalizedEndTime,
                durationMinutes: autoAirplaneDurationMinutes,
                note: normalizedNote,
                departure: normalizedDeparture,
                arrival: normalizedArrival,
                departureAirportCode: departureAirport?.code,
                arrivalAirportCode: arrivalAirport?.code,
                departureTimeZone: departureAirport?.timeZone,
                arrivalTimeZone: arrivalAirport?.timeZone,
                arrivalDayOffset: airplaneDurationInfo.arrivalDayOffset,
                flightNumber: normalizedFlightNumber,
                bookingRef: normalizedBookingRef,
                terminal: normalizedTerminal,
                gate: normalizedGate
            });
            return;
        }

        if (titleError || startTimeError || durationError || !genericComputedEndTime) {
            return;
        }

        onSubmit({
            transitType,
            title: normalizedTitle,
            startTime: normalizedStartTime,
            endTime: genericComputedEndTime,
            durationMinutes: normalizedDurationMinutes || undefined,
            note: normalizedNote
        });
    }, [
        airplaneDurationInfo.arrivalDayOffset,
        arrivalError,
        arrivalAirport?.code,
        arrivalAirport?.timeZone,
        canSubmit,
        departureError,
        departureAirport?.code,
        departureAirport?.timeZone,
        durationError,
        endTimeError,
        genericComputedEndTime,
        isAirplane,
        autoAirplaneDurationMinutes,
        normalizedArrival,
        normalizedBookingRef,
        normalizedDeparture,
        normalizedEndTime,
        normalizedFlightNumber,
        normalizedGate,
        normalizedNote,
        normalizedStartTime,
        normalizedTerminal,
        normalizedTitle,
        normalizedDurationMinutes,
        onSubmit,
        startTimeError,
        titleError,
        transitType
    ]);

    const airplaneAutoDurationLabel = autoAirplaneDurationMinutes && autoAirplaneDurationMinutes > 0
        ? formatDuration(autoAirplaneDurationMinutes)
        : '--';
    const genericDurationLabel = normalizedDurationMinutes && normalizedDurationMinutes > 0
        ? formatDuration(normalizedDurationMinutes)
        : '--';
    const airplaneArrivalDayLabel = airplaneDurationInfo.arrivalDayOffset > 0
        ? `+${airplaneDurationInfo.arrivalDayOffset}일 도착`
        : '';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={onClose}
                    style={StyleSheet.absoluteFill}
                />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardArea}
                >
                    <View style={[styles.sheet, sheetInsetStyle]}>
                        <View style={styles.handle} />
                        <View style={styles.header}>
                            <View style={styles.headerCopy}>
                                <Text style={styles.headerLabel}>이동 카드 추가</Text>
                                <Text style={styles.headerTitle}>{isAirplane ? '비행기 추가' : `${meta.tag} 추가`}</Text>
                                <Text style={styles.headerMeta}>
                                    {dayLabel} · {dayDate}
                                </Text>
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving}
                                onPress={onClose}
                                style={({ pressed }) => [
                                    styles.closeButton,
                                    pressed && !isSaving ? styles.buttonPressed : null
                                ]}
                            >
                                <Text style={styles.closeButtonText}>닫기</Text>
                            </Pressable>
                        </View>

                        <ScrollView
                            ref={scrollRef}
                            contentContainerStyle={[styles.content, keyboardAwareContentInsetStyle]}
                            {...scrollViewProps}
                        >
                            <View style={styles.formCard}>
                                {!isAirplane ? (
                                    <Text style={styles.sectionLabel}>
                                        {`${meta.tag} 정보`}
                                    </Text>
                                ) : null}

                                {isAirplane ? (
                                    <>
                                        <View style={[styles.fieldRow, styles.airportFieldRow]}>
                                            <View style={[styles.fieldColumn, styles.airportFieldColumn]}>
                                                <Text style={[styles.fieldLabel, styles.airportFieldLabel]}>출발 공항</Text>
                                                <View style={styles.airportInputWrap}>
                                                    <TextInput
                                                        value={departure}
                                                        onChangeText={(nextValue) => {
                                                            setDeparture(nextValue);
                                                            setActiveAirportField('departure');
                                                        }}
                                                        onFocus={createFocusHandler(() => {
                                                            setActiveAirportField('departure');
                                                        })}
                                                        editable={!isSaving}
                                                        autoCapitalize="characters"
                                                        autoCorrect={false}
                                                        placeholder="ICN 또는 인천국제공항"
                                                        placeholderTextColor={theme.colors.textSecondary}
                                                        style={[
                                                            styles.textInput,
                                                            didAttemptSubmit && departureError ? styles.textInputError : null
                                                        ]}
                                                    />
                                                    {departureAirportSuggestions.length > 0 ? (
                                                        <View style={styles.airportSuggestionList}>
                                                            {departureAirportSuggestions.map((airport) => (
                                                                <Pressable
                                                                    key={`departure-${airport.code}`}
                                                                    accessibilityRole="button"
                                                                    disabled={isSaving}
                                                                    onPress={() => {
                                                                        setDeparture(formatAirportSelectionValue(airport.code, airport.name));
                                                                        setActiveAirportField(null);
                                                                    }}
                                                                    style={({ pressed }) => [
                                                                        styles.airportSuggestionItem,
                                                                        pressed && !isSaving ? styles.buttonPressed : null
                                                                    ]}
                                                                >
                                                                    <Text style={styles.airportSuggestionTitle}>
                                                                        {airport.code} · {airport.name}
                                                                    </Text>
                                                                    <Text style={styles.airportSuggestionMeta}>
                                                                        {airport.city}
                                                                    </Text>
                                                                </Pressable>
                                                            ))}
                                                        </View>
                                                    ) : null}
                                                </View>
                                                {departureAirportMeta ? (
                                                    <Text style={styles.airportFieldMeta}>{departureAirportMeta}</Text>
                                                ) : normalizedDeparture ? (
                                                    <Text style={[styles.airportFieldMeta, styles.airportFieldMetaWarning]}>
                                                        등록된 공항을 찾지 못했어요.
                                                    </Text>
                                                ) : null}
                                                {didAttemptSubmit && departureError ? (
                                                    <Text style={styles.fieldError}>{departureError}</Text>
                                                ) : null}
                                            </View>
                                            <View style={[styles.fieldColumn, styles.airportFieldColumn]}>
                                                <Text style={[styles.fieldLabel, styles.airportFieldLabel]}>도착 공항</Text>
                                                <View style={styles.airportInputWrap}>
                                                    <TextInput
                                                        value={arrival}
                                                        onChangeText={(nextValue) => {
                                                            setArrival(nextValue);
                                                            setActiveAirportField('arrival');
                                                        }}
                                                        onFocus={createFocusHandler(() => {
                                                            setActiveAirportField('arrival');
                                                        })}
                                                        editable={!isSaving}
                                                        autoCapitalize="characters"
                                                        autoCorrect={false}
                                                        placeholder="NRT 또는 나리타국제공항"
                                                        placeholderTextColor={theme.colors.textSecondary}
                                                        style={[
                                                            styles.textInput,
                                                            didAttemptSubmit && arrivalError ? styles.textInputError : null
                                                        ]}
                                                    />
                                                    {arrivalAirportSuggestions.length > 0 ? (
                                                        <View style={styles.airportSuggestionList}>
                                                            {arrivalAirportSuggestions.map((airport) => (
                                                                <Pressable
                                                                    key={`arrival-${airport.code}`}
                                                                    accessibilityRole="button"
                                                                    disabled={isSaving}
                                                                    onPress={() => {
                                                                        setArrival(formatAirportSelectionValue(airport.code, airport.name));
                                                                        setActiveAirportField(null);
                                                                    }}
                                                                    style={({ pressed }) => [
                                                                        styles.airportSuggestionItem,
                                                                        pressed && !isSaving ? styles.buttonPressed : null
                                                                    ]}
                                                                >
                                                                    <Text style={styles.airportSuggestionTitle}>
                                                                        {airport.code} · {airport.name}
                                                                    </Text>
                                                                    <Text style={styles.airportSuggestionMeta}>
                                                                        {airport.city}
                                                                    </Text>
                                                                </Pressable>
                                                            ))}
                                                        </View>
                                                    ) : null}
                                                </View>
                                                {arrivalAirportMeta ? (
                                                    <Text style={styles.airportFieldMeta}>{arrivalAirportMeta}</Text>
                                                ) : normalizedArrival ? (
                                                    <Text style={[styles.airportFieldMeta, styles.airportFieldMetaWarning]}>
                                                        등록된 공항을 찾지 못했어요.
                                                    </Text>
                                                ) : null}
                                                {didAttemptSubmit && arrivalError ? (
                                                    <Text style={styles.fieldError}>{arrivalError}</Text>
                                                ) : null}
                                            </View>
                                        </View>

                                        <View style={styles.fieldRow}>
                                            <View style={styles.fieldColumn}>
                                                <Text style={styles.fieldLabel}>출발 시간</Text>
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={isSaving}
                                                    onPress={() => {
                                                        setActiveAirportField(null);
                                                        setActivePicker('start');
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.timePickerButton,
                                                        didAttemptSubmit && startTimeError ? styles.textInputError : null,
                                                        pressed && !isSaving ? styles.buttonPressed : null
                                                    ]}
                                                >
                                                    <Text style={styles.timePickerButtonText}>
                                                        {normalizedStartTime || '시간 선택'}
                                                    </Text>
                                                </Pressable>
                                                {didAttemptSubmit && startTimeError ? (
                                                    <Text style={styles.fieldError}>{startTimeError}</Text>
                                                ) : null}
                                            </View>
                                            <View style={styles.fieldColumn}>
                                                <Text style={styles.fieldLabel}>도착 시간</Text>
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={isSaving}
                                                    onPress={() => {
                                                        setActiveAirportField(null);
                                                        setActivePicker('end');
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.timePickerButton,
                                                        didAttemptSubmit && (endTimeError || durationError) ? styles.textInputError : null,
                                                        pressed && !isSaving ? styles.buttonPressed : null
                                                    ]}
                                                >
                                                    <Text style={styles.timePickerButtonText}>
                                                        {normalizedEndTime || '시간 선택'}
                                                    </Text>
                                                </Pressable>
                                                {didAttemptSubmit && endTimeError ? (
                                                    <Text style={styles.fieldError}>{endTimeError}</Text>
                                                ) : null}
                                            </View>
                                        </View>

                                        <View style={styles.summaryCard}>
                                            <View style={styles.summaryHeaderRow}>
                                                <Text style={styles.summaryLabel}>
                                                    {airplaneDurationInfo.usedTimeZones ? '시차 포함 자동 계산' : '입력 시간 기준 계산'}
                                                </Text>
                                                {airplaneArrivalDayLabel ? (
                                                    <View style={styles.summaryMetaBadge}>
                                                        <Text style={styles.summaryMetaBadgeText}>{airplaneArrivalDayLabel}</Text>
                                                    </View>
                                                ) : null}
                                            </View>
                                            <Text style={styles.summaryValue}>{airplaneAutoDurationLabel}</Text>
                                            {(departureAirport || arrivalAirport) ? (
                                                <View style={styles.summaryMetaRow}>
                                                    {departureAirport ? (
                                                        <View style={styles.summaryMetaChip}>
                                                            <Text style={styles.summaryMetaChipText}>
                                                                {departureAirport.code} · {formatTimeZoneOffsetLabel(departureAirport.timeZone, dayDate)}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                    {arrivalAirport ? (
                                                        <View style={styles.summaryMetaChip}>
                                                            <Text style={styles.summaryMetaChipText}>
                                                                {arrivalAirport.code} · {formatTimeZoneOffsetLabel(arrivalAirport.timeZone, dayDate)}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                            ) : null}
                                            {didAttemptSubmit && durationError ? (
                                                <Text style={styles.fieldError}>{durationError}</Text>
                                            ) : null}
                                        </View>

                                        <View style={styles.fieldRow}>
                                            <View style={styles.fieldColumn}>
                                                <Text style={styles.fieldLabel}>항공편</Text>
                                                <TextInput
                                                    value={flightNumber}
                                                    onChangeText={setFlightNumber}
                                                    onFocus={createFocusHandler(() => {
                                                        setActiveAirportField(null);
                                                    })}
                                                    editable={!isSaving}
                                                    autoCapitalize="characters"
                                                    autoCorrect={false}
                                                    placeholder="KE123"
                                                    placeholderTextColor={theme.colors.textSecondary}
                                                    style={styles.textInput}
                                                />
                                            </View>
                                            <View style={styles.fieldColumn}>
                                                <Text style={styles.fieldLabel}>예약번호</Text>
                                                <TextInput
                                                    value={bookingRef}
                                                    onChangeText={setBookingRef}
                                                    onFocus={createFocusHandler(() => {
                                                        setActiveAirportField(null);
                                                    })}
                                                    editable={!isSaving}
                                                    autoCapitalize="characters"
                                                    autoCorrect={false}
                                                    placeholder="ABC123"
                                                    placeholderTextColor={theme.colors.textSecondary}
                                                    style={styles.textInput}
                                                />
                                            </View>
                                        </View>

                                        <View style={styles.fieldRow}>
                                            <View style={styles.fieldColumn}>
                                                <Text style={styles.fieldLabel}>터미널</Text>
                                                <TextInput
                                                    value={terminal}
                                                    onChangeText={setTerminal}
                                                    onFocus={createFocusHandler(() => {
                                                        setActiveAirportField(null);
                                                    })}
                                                    editable={!isSaving}
                                                    autoCapitalize="characters"
                                                    autoCorrect={false}
                                                    placeholder="1"
                                                    placeholderTextColor={theme.colors.textSecondary}
                                                    style={styles.textInput}
                                                />
                                            </View>
                                            <View style={styles.fieldColumn}>
                                                <Text style={styles.fieldLabel}>게이트</Text>
                                                <TextInput
                                                    value={gate}
                                                    onChangeText={setGate}
                                                    onFocus={createFocusHandler(() => {
                                                        setActiveAirportField(null);
                                                    })}
                                                    editable={!isSaving}
                                                    autoCapitalize="characters"
                                                    autoCorrect={false}
                                                    placeholder="A12"
                                                    placeholderTextColor={theme.colors.textSecondary}
                                                    style={styles.textInput}
                                                />
                                            </View>
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.fieldLabel}>이동 경로</Text>
                                        <TextInput
                                            value={title}
                                            onChangeText={setTitle}
                                            onFocus={createFocusHandler(() => {
                                                setActiveAirportField(null);
                                            })}
                                            editable={!isSaving}
                                            placeholder={`${meta.tag} 이동`}
                                            placeholderTextColor={theme.colors.textSecondary}
                                            style={[
                                                styles.textInput,
                                                didAttemptSubmit && titleError ? styles.textInputError : null
                                            ]}
                                        />
                                        {didAttemptSubmit && titleError ? (
                                            <Text style={styles.fieldError}>{titleError}</Text>
                                        ) : null}

                                        <View style={styles.fieldRow}>
                                            <View style={styles.fieldColumn}>
                                                <Text style={styles.fieldLabel}>출발 시간</Text>
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={isSaving}
                                                    onPress={() => {
                                                        setActiveAirportField(null);
                                                        setActivePicker('start');
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.timePickerButton,
                                                        didAttemptSubmit && startTimeError ? styles.textInputError : null,
                                                        pressed && !isSaving ? styles.buttonPressed : null
                                                    ]}
                                                >
                                                    <Text style={styles.timePickerButtonText}>
                                                        {normalizedStartTime || '시간 선택'}
                                                    </Text>
                                                </Pressable>
                                                {didAttemptSubmit && startTimeError ? (
                                                    <Text style={styles.fieldError}>{startTimeError}</Text>
                                                ) : null}
                                            </View>
                                            <View style={styles.fieldColumn}>
                                                <Text style={styles.fieldLabel}>소요 시간</Text>
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={isSaving}
                                                    onPress={() => {
                                                        setActiveAirportField(null);
                                                        setDurationPickerVisible(true);
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.timePickerButton,
                                                        didAttemptSubmit && durationError ? styles.textInputError : null,
                                                        pressed && !isSaving ? styles.buttonPressed : null
                                                    ]}
                                                >
                                                    <Text style={styles.timePickerButtonText}>
                                                        {formatDurationPickerLabel(durationMinutesText)}
                                                    </Text>
                                                </Pressable>
                                                {didAttemptSubmit && durationError ? (
                                                    <Text style={styles.fieldError}>{durationError}</Text>
                                                ) : null}
                                            </View>
                                        </View>

                                        <View style={styles.summaryCard}>
                                            <Text style={styles.summaryLabel}>예상 도착</Text>
                                            <Text style={styles.summaryValue}>{genericComputedEndTime || '--:--'}</Text>
                                            <Text style={styles.summarySupport}>
                                                {genericDurationLabel !== '--'
                                                    ? `${genericDurationLabel} 이동 카드로 저장돼요.`
                                                    : '출발 시간과 소요 시간을 고르면 도착 시간이 자동으로 계산돼요.'}
                                            </Text>
                                        </View>
                                    </>
                                )}

                                <Text style={styles.fieldLabel}>메모</Text>
                                <TextInput
                                    value={note}
                                    onChangeText={setNote}
                                    onFocus={createFocusHandler(() => {
                                        setActiveAirportField(null);
                                    })}
                                    editable={!isSaving}
                                    multiline
                                    textAlignVertical="top"
                                    placeholder={isAirplane ? '메모를 남겨 보세요' : '메모를 남겨 보세요'}
                                    placeholderTextColor={theme.colors.textSecondary}
                                    style={styles.textArea}
                                />
                            </View>

                            {errorMessage ? (
                                <View style={[styles.statusCard, styles.statusCardWarning]}>
                                    <Text style={styles.statusText}>{errorMessage}</Text>
                                </View>
                            ) : null}
                        </ScrollView>

                        <View style={[styles.actionRow, actionInsetStyle]}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving}
                                onPress={onClose}
                                style={({ pressed }) => [
                                    styles.secondaryAction,
                                    pressed && !isSaving ? styles.buttonPressed : null
                                ]}
                            >
                                <Text style={styles.secondaryActionText}>취소</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                disabled={!canSubmit}
                                onPress={handleSubmit}
                                style={({ pressed }) => [
                                    styles.primaryAction,
                                    !canSubmit ? styles.primaryActionDisabled : null,
                                    pressed && canSubmit ? styles.buttonPressed : null
                                ]}
                            >
                                <Text style={styles.primaryActionText}>
                                    {isSaving ? '추가 중...' : '이동 카드 추가'}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </View>
            <TimePickerModal
                visible={Boolean(activePicker)}
                value={
                    activePicker === 'end'
                        ? (normalizedEndTime || endTime || defaultEndTime || '09:30')
                        : (normalizedStartTime || startTime || defaultStartTime || '09:00')
                }
                onClose={() => {
                    setActivePicker(null);
                }}
                onConfirm={(nextValue) => {
                    if (activePicker === 'end') {
                        setEndTime(nextValue);
                    } else {
                        setStartTime(nextValue);
                        if (!isAirplane && normalizedDurationMinutes !== null) {
                            setEndTime(addMinutesToTime(nextValue, normalizedDurationMinutes));
                        }
                    }
                    setActivePicker(null);
                }}
            />
            <DurationPickerModal
                visible={!isAirplane && isDurationPickerVisible}
                value={durationMinutesText}
                onClose={() => {
                    setDurationPickerVisible(false);
                }}
                onConfirm={(nextValue) => {
                    const nextDurationMinutes = parseDurationMinutesInput(nextValue);
                    setDurationMinutesText(nextValue);
                    if (nextDurationMinutes !== null) {
                        setEndTime(addMinutesToTime(
                            normalizedStartTime || startTime || defaultStartTime || '09:00',
                            nextDurationMinutes
                        ));
                    }
                    setDurationPickerVisible(false);
                }}
            />
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.28)'
    },
    keyboardArea: {
        width: '100%',
        height: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        justifyContent: 'flex-end'
    },
    sheet: {
        height: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        backgroundColor: theme.colors.surface
    },
    handle: {
        alignSelf: 'center',
        width: 48,
        height: 5,
        borderRadius: theme.radius.full,
        marginTop: theme.spacing.xs,
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
        fontSize: 22,
        lineHeight: 28,
        fontFamily: theme.fonts.display
    },
    headerMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
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
    content: {
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.md
    },
    formCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    sectionLabel: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontFamily: theme.fonts.bold
    },
    sectionSupport: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    typeBadge: {
        alignSelf: 'flex-start',
        marginTop: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    typeBadgeText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    fieldRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.sm
    },
    fieldColumn: {
        flex: 1
    },
    airportFieldRow: {
        marginTop: 0,
        zIndex: 20
    },
    airportFieldColumn: {
        zIndex: 20
    },
    airportFieldLabel: {
        marginTop: 0
    },
    fieldLabel: {
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    textInput: {
        minHeight: 48,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    textArea: {
        minHeight: 112,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    timePickerButton: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface
    },
    timePickerButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    textInputError: {
        borderColor: theme.colors.warning
    },
    fieldError: {
        marginTop: theme.spacing.micro,
        color: theme.colors.warning,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    summaryCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    summaryHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
    },
    summaryLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    summaryValue: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 26,
        lineHeight: 32,
        fontFamily: theme.fonts.display
    },
    summaryMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.micro,
        marginTop: theme.spacing.xs
    },
    summaryMetaBadge: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface
    },
    summaryMetaBadgeText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.bold
    },
    summaryMetaChip: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface
    },
    summaryMetaChipText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    summarySupport: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    airportInputWrap: {
        position: 'relative',
        zIndex: 30
    },
    airportSuggestionList: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 40,
        elevation: 8,
        marginTop: theme.spacing.micro,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: {
            width: 0,
            height: 6
        }
    },
    airportSuggestionItem: {
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border
    },
    airportSuggestionTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    airportSuggestionMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    airportFieldMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    airportFieldMetaWarning: {
        color: theme.colors.warning
    },
    statusCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    statusCardWarning: {
        backgroundColor: theme.mode === 'dark' ? '#4f2a22' : '#fff1e5'
    },
    statusText: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    actionRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.md,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    secondaryAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    secondaryActionText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    primaryAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    primaryActionDisabled: {
        opacity: 0.5
    },
    primaryActionText: {
        color: theme.colors.surface,
        fontFamily: theme.fonts.bold
    },
    buttonPressed: {
        opacity: 0.88
    }
});
