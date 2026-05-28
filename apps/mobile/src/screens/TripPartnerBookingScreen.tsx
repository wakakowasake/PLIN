import React from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNavBar } from '@/components/BottomNavBar';
import { Alert } from '@/feedback';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import {
    buildManualFlightCard,
    lookupFlightStatus,
    readSavedFlightCards,
    removeSavedFlightCard,
    saveFlightCard,
    type FlightLookupDirection,
    type FlightLookupInput,
    type FlightStatusItem,
    type FlightStatusLookupResponse,
    type SavedFlightCard
} from '@/services/flight-status';
import { type AppTheme, useAppTheme } from '@/theme';

type BookingRouteName = 'FlightBooking' | 'StayBooking' | 'ActivityBooking';
type Props = NativeStackScreenProps<RootStackParamList, BookingRouteName>;
type BookingScreenKind = 'flight' | 'stay' | 'activity';

const DIRECTION_OPTIONS: Array<{
    label: string;
    value: FlightLookupDirection;
}> = [
    { label: '전체', value: 'any' },
    { label: '출발', value: 'departure' },
    { label: '도착', value: 'arrival' }
];

const BOOKING_SCREEN_CONFIG: Record<BookingRouteName, {
    accentColor: string;
    description: string;
    eyebrow: string;
    icon: keyof typeof Ionicons.glyphMap;
    kind: BookingScreenKind;
    title: string;
}> = {
    FlightBooking: {
        accentColor: '#E8A321',
        description: '항공편 번호를 등록해 두고, 연결된 공항/운항 데이터로 출발 시간과 상태를 확인해요.',
        eyebrow: 'FLIGHT CARD',
        icon: 'airplane-outline',
        kind: 'flight',
        title: '항공편 등록'
    },
    StayBooking: {
        accentColor: '#E75B64',
        description: '숙소 API가 연결되면 외부 페이지로 나가지 않고 앱 안에서 후보를 살펴볼 수 있게 할게요.',
        eyebrow: 'STAY',
        icon: 'bed-outline',
        kind: 'stay',
        title: '숙소 예약'
    },
    ActivityBooking: {
        accentColor: '#38A96B',
        description: '액티비티 API가 연결되면 투어와 입장권 후보를 PLIN 안에서 바로 보여줄게요.',
        eyebrow: 'ACTIVITY',
        icon: 'ticket-outline',
        kind: 'activity',
        title: '액티비티 예약'
    }
};

function getTodayDateInput() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function normalizeFlightNumberInput(value: string) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function normalizeAirportCodeInput(value: string) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

function buildRouteLabel(card: FlightStatusItem) {
    const origin = card.originName || card.originCode || '출발지';
    const destination = card.destinationName || card.destinationCode || '도착지';

    return `${origin} → ${destination}`;
}

function buildMetaLabels(card: FlightStatusItem) {
    return [
        card.terminalLabel,
        card.gateLabel ? `게이트 ${card.gateLabel}` : '',
        card.baggageClaimLabel ? `수하물 ${card.baggageClaimLabel}` : '',
        card.checkInCounterLabel ? `카운터 ${card.checkInCounterLabel}` : ''
    ].filter(Boolean);
}

function FlightCard({
    actionLabel,
    card,
    onAction,
    onRemove,
    styles
}: {
    actionLabel?: string;
    card: FlightStatusItem | SavedFlightCard;
    onAction?: () => void;
    onRemove?: () => void;
    styles: ReturnType<typeof createStyles>;
}) {
    const metaLabels = buildMetaLabels(card);
    const sourceLabel = card.sourceLabel || card.providerLabel;
    const savedAt = 'savedAt' in card ? card.savedAt : '';

    return (
        <View style={styles.flightCard}>
            <View style={styles.flightCardTopRow}>
                <View style={styles.flightNumberPill}>
                    <Ionicons name="airplane" size={14} color="#FFFFFF" />
                    <Text style={styles.flightNumberText}>{card.flightNumber}</Text>
                </View>
                {card.statusLabel ? (
                    <Text numberOfLines={1} style={styles.flightStatusText}>
                        {card.statusLabel}
                    </Text>
                ) : null}
            </View>

            <Text numberOfLines={1} style={styles.flightRouteText}>
                {buildRouteLabel(card)}
            </Text>

            <View style={styles.flightTimeGrid}>
                <View style={styles.flightTimeBlock}>
                    <Text style={styles.flightTimeLabel}>예정</Text>
                    <Text numberOfLines={1} style={styles.flightTimeValue}>
                        {card.scheduledTimeLabel || '확인 중'}
                    </Text>
                </View>
                <View style={styles.flightTimeBlock}>
                    <Text style={styles.flightTimeLabel}>변경</Text>
                    <Text numberOfLines={1} style={styles.flightTimeValue}>
                        {card.estimatedTimeLabel || '변경 없음'}
                    </Text>
                </View>
            </View>

            {metaLabels.length > 0 ? (
                <View style={styles.metaChipRow}>
                    {metaLabels.map((label) => (
                        <View key={label} style={styles.metaChip}>
                            <Text numberOfLines={1} style={styles.metaChipText}>{label}</Text>
                        </View>
                    ))}
                </View>
            ) : null}

            <View style={styles.flightCardFooter}>
                <Text numberOfLines={1} style={styles.flightSourceText}>
                    {sourceLabel}
                </Text>
                {savedAt ? (
                    <Text numberOfLines={1} style={styles.flightSavedText}>
                        저장됨
                    </Text>
                ) : null}
            </View>

            {actionLabel || onRemove ? (
                <View style={styles.flightActionRow}>
                    {actionLabel && onAction ? (
                        <Pressable
                            accessibilityRole="button"
                            onPress={onAction}
                            style={({ pressed }) => [
                                styles.secondaryButton,
                                pressed ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
                        </Pressable>
                    ) : null}
                    {onRemove ? (
                        <Pressable
                            accessibilityRole="button"
                            onPress={onRemove}
                            style={({ pressed }) => [
                                styles.removeButton,
                                pressed ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.removeButtonText}>삭제</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}
        </View>
    );
}

export function TripPartnerBookingScreen({ route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        scrollViewProps
    } = useKeyboardAwareInputScroll(120);
    const config = BOOKING_SCREEN_CONFIG[route.name];
    const [flightNumber, setFlightNumber] = React.useState('');
    const [flightDate, setFlightDate] = React.useState(getTodayDateInput);
    const [airportCode, setAirportCode] = React.useState('ICN');
    const [direction, setDirection] = React.useState<FlightLookupDirection>('any');
    const [lookupResult, setLookupResult] = React.useState<FlightStatusLookupResponse | null>(null);
    const [isLookupLoading, setIsLookupLoading] = React.useState(false);
    const [savedFlightCards, setSavedFlightCards] = React.useState<SavedFlightCard[]>([]);
    const lookupRequestIdRef = React.useRef(0);

    React.useEffect(() => {
        let isMounted = true;

        void readSavedFlightCards().then((cards) => {
            if (isMounted) {
                setSavedFlightCards(cards);
            }
        });

        return () => {
            isMounted = false;
        };
    }, []);

    const lookupInput = React.useMemo<FlightLookupInput>(() => ({
        airportCode,
        direction,
        flightDate,
        flightNumber
    }), [airportCode, direction, flightDate, flightNumber]);

    const handleLookupFlight = React.useCallback(async () => {
        const safeFlightNumber = normalizeFlightNumberInput(flightNumber);
        if (!safeFlightNumber) {
            Alert.alert('항공편 번호를 입력해 주세요.', '예: KE123, OZ541처럼 항공사 코드와 번호를 함께 입력해 주세요.');
            return;
        }

        const requestId = lookupRequestIdRef.current + 1;
        lookupRequestIdRef.current = requestId;
        setIsLookupLoading(true);

        try {
            const result = await lookupFlightStatus({
                ...lookupInput,
                flightNumber: safeFlightNumber
            });
            if (lookupRequestIdRef.current === requestId) {
                setLookupResult(result);
            }
        } catch (error) {
            if (lookupRequestIdRef.current !== requestId) {
                return;
            }

            setLookupResult({
                flights: [],
                isConfigured: false,
                message: error instanceof Error
                    ? error.message
                    : '항공편 정보를 조회하지 못했어요.',
                sourceLabels: []
            });
        } finally {
            if (lookupRequestIdRef.current === requestId) {
                setIsLookupLoading(false);
            }
        }
    }, [flightNumber, lookupInput]);

    const handleSaveFlightCard = React.useCallback(async (card: FlightStatusItem) => {
        try {
            const nextCards = await saveFlightCard(card);
            setSavedFlightCards(nextCards);
            Alert.alert('항공편을 담았어요.', '이 화면에서 다시 확인할 수 있어요.');
        } catch {
            Alert.alert('저장하지 못했어요.', '잠시 후 다시 시도해 주세요.');
        }
    }, []);

    const handleSaveManualFlightCard = React.useCallback(async () => {
        const safeFlightNumber = normalizeFlightNumberInput(flightNumber);
        if (!safeFlightNumber) {
            Alert.alert('항공편 번호를 입력해 주세요.', '조회 결과가 없어도 항공편을 직접 추가할 수 있어요.');
            return;
        }

        await handleSaveFlightCard(buildManualFlightCard({
            ...lookupInput,
            flightNumber: safeFlightNumber
        }));
    }, [flightNumber, handleSaveFlightCard, lookupInput]);

    const handleRemoveFlightCard = React.useCallback(async (cardId: string) => {
        try {
            const nextCards = await removeSavedFlightCard(cardId);
            setSavedFlightCards(nextCards);
        } catch {
            Alert.alert('삭제하지 못했어요.', '잠시 후 다시 시도해 주세요.');
        }
    }, []);

    return (
        <View style={styles.shell}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.screenBody}
            >
                <SafeAreaView edges={['bottom']} style={styles.screenBody}>
                    <ScrollView
                        ref={scrollRef}
                        style={styles.screenBody}
                        contentContainerStyle={[
                            styles.content,
                            keyboardAwareContentInsetStyle
                        ]}
                        {...scrollViewProps}
                        showsVerticalScrollIndicator={false}
                    >
                    <View style={styles.heroCard}>
                        <View
                            style={[
                                styles.iconWrap,
                                { backgroundColor: `${config.accentColor}18` }
                            ]}
                        >
                            <Ionicons
                                name={config.icon}
                                size={28}
                                color={config.accentColor}
                            />
                        </View>
                        <Text style={[styles.eyebrow, { color: config.accentColor }]}>
                            {config.eyebrow}
                        </Text>
                        <Text style={styles.title}>{config.title}</Text>
                        <Text style={styles.description}>{config.description}</Text>
                    </View>

                    {config.kind === 'flight' ? (
                        <>
                            <View style={styles.noticeCard}>
                                <Ionicons
                                    name="shield-checkmark-outline"
                                    size={20}
                                    color={theme.colors.accent}
                                />
                                <Text style={styles.noticeText}>
                                    이 카드는 실제 탑승권 바코드가 아니라 공개 운항 정보 확인용이에요. 탑승은 항공사 앱이나 공항에서 발급된 탑승권을 사용해야 해요.
                                </Text>
                            </View>

                            <View style={styles.formCard}>
                                <Text style={styles.sectionTitle}>항공편 조회</Text>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>항공편 번호</Text>
                                    <TextInput
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        onChangeText={(value) => {
                                            setFlightNumber(normalizeFlightNumberInput(value));
                                            setLookupResult(null);
                                        }}
                                        placeholder="예: KE123"
                                        placeholderTextColor={theme.colors.textSecondary}
                                        returnKeyType="search"
                                        onFocus={createFocusHandler()}
                                        onSubmitEditing={handleLookupFlight}
                                        style={styles.input}
                                        value={flightNumber}
                                    />
                                </View>

                                <View style={styles.formGrid}>
                                    <View style={styles.formGridItem}>
                                        <Text style={styles.inputLabel}>날짜</Text>
                                        <TextInput
                                            autoCorrect={false}
                                            keyboardType="numbers-and-punctuation"
                                            onFocus={createFocusHandler()}
                                            onChangeText={(value) => {
                                                setFlightDate(value);
                                                setLookupResult(null);
                                            }}
                                            placeholder="YYYY-MM-DD"
                                            placeholderTextColor={theme.colors.textSecondary}
                                            style={styles.input}
                                            value={flightDate}
                                        />
                                    </View>
                                    <View style={styles.formGridItem}>
                                        <Text style={styles.inputLabel}>공항 코드</Text>
                                        <TextInput
                                            autoCapitalize="characters"
                                            autoCorrect={false}
                                            onFocus={createFocusHandler()}
                                            onChangeText={(value) => {
                                                setAirportCode(normalizeAirportCodeInput(value));
                                                setLookupResult(null);
                                            }}
                                            placeholder="ICN"
                                            placeholderTextColor={theme.colors.textSecondary}
                                            style={styles.input}
                                            value={airportCode}
                                        />
                                    </View>
                                </View>

                                <View style={styles.segmentedControl}>
                                    {DIRECTION_OPTIONS.map((option) => {
                                        const isSelected = direction === option.value;
                                        return (
                                            <Pressable
                                                key={option.value}
                                                accessibilityRole="button"
                                                onPress={() => {
                                                    setDirection(option.value);
                                                    setLookupResult(null);
                                                }}
                                                style={[
                                                    styles.segmentButton,
                                                    isSelected ? styles.segmentButtonSelected : null
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.segmentButtonText,
                                                        isSelected ? styles.segmentButtonTextSelected : null
                                                    ]}
                                                >
                                                    {option.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isLookupLoading}
                                    onPress={handleLookupFlight}
                                    style={({ pressed }) => [
                                        styles.primaryButton,
                                        pressed || isLookupLoading ? styles.buttonPressed : null
                                    ]}
                                >
                                    {isLookupLoading ? (
                                        <ActivityIndicator color="#FFFFFF" />
                                    ) : (
                                        <>
                                            <Text style={styles.primaryButtonText}>공개 운항 정보 조회</Text>
                                            <Ionicons name="search" size={18} color="#FFFFFF" />
                                        </>
                                    )}
                                </Pressable>

                                <Pressable
                                    accessibilityRole="button"
                                    onPress={handleSaveManualFlightCard}
                                    style={({ pressed }) => [
                                        styles.textButton,
                                        pressed ? styles.buttonPressed : null
                                    ]}
                                >
                                    <Text style={styles.textButtonText}>조회 없이 항공편 카드 만들기</Text>
                                </Pressable>
                            </View>

                            {lookupResult ? (
                                <View style={styles.sectionBlock}>
                                    <Text style={styles.sectionTitle}>조회 결과</Text>
                                    {lookupResult.sourceLabels.length > 0 ? (
                                        <Text style={styles.sectionCaption}>
                                            연결 데이터: {lookupResult.sourceLabels.join(', ')}
                                        </Text>
                                    ) : null}
                                    {lookupResult.flights.length > 0 ? (
                                        <View style={styles.cardList}>
                                            {lookupResult.flights.map((card) => (
                                                <FlightCard
                                                    key={card.id}
                                                    actionLabel="내 항공편에 담기"
                                                    card={card}
                                                    onAction={() => {
                                                        void handleSaveFlightCard(card);
                                                    }}
                                                    styles={styles}
                                                />
                                            ))}
                                        </View>
                                    ) : (
                                        <View style={styles.emptyPanel}>
                                            <Ionicons name="cloud-offline-outline" size={24} color={theme.colors.textSecondary} />
                                            <Text style={styles.emptyPanelTitle}>아직 조회 결과가 없어요</Text>
                                            <Text style={styles.emptyPanelText}>
                                                {lookupResult.message || '항공편 번호와 날짜를 확인해 주세요.'}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            ) : null}

                            <View style={styles.sectionBlock}>
                                <Text style={styles.sectionTitle}>내 항공편</Text>
                                {savedFlightCards.length > 0 ? (
                                    <View style={styles.cardList}>
                                        {savedFlightCards.map((card) => (
                                            <FlightCard
                                                key={card.id}
                                                card={card}
                                                onRemove={() => {
                                                    void handleRemoveFlightCard(card.id);
                                                }}
                                                styles={styles}
                                            />
                                        ))}
                                    </View>
                                ) : (
                                    <View style={styles.emptyPanel}>
                                        <Ionicons name="wallet-outline" size={24} color={theme.colors.textSecondary} />
                                        <Text style={styles.emptyPanelTitle}>담아둔 항공편이 없어요</Text>
                                        <Text style={styles.emptyPanelText}>
                                            항공편 번호를 조회하거나 직접 카드로 만들어두면 여기서 다시 볼 수 있어요.
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </>
                    ) : (
                        <View style={styles.placeholderCard}>
                            <Ionicons
                                name="construct-outline"
                                size={24}
                                color={config.accentColor}
                            />
                            <Text style={styles.placeholderTitle}>앱 내 목록 연결 준비 중</Text>
                            <Text style={styles.placeholderText}>
                                외부 페이지로 보내지 않고, 제휴 API 응답을 PLIN 카드 목록으로 보여주는 구조만 남겨뒀어요.
                            </Text>
                        </View>
                    )}
                    </ScrollView>
                </SafeAreaView>
            </KeyboardAvoidingView>
            <BottomNavBar activeTab="Home" />
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    shell: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    screenBody: {
        flex: 1
    },
    content: {
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.xl,
        gap: theme.spacing.md
    },
    heroCard: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 240,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    iconWrap: {
        width: 64,
        height: 64,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.full
    },
    eyebrow: {
        marginTop: theme.spacing.sm,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.semibold
    },
    title: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 28,
        lineHeight: 36,
        fontFamily: theme.fonts.display,
        textAlign: 'center'
    },
    description: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 22,
        fontFamily: theme.fonts.body,
        textAlign: 'center'
    },
    noticeCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.xs,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    noticeText: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontSize: 14,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    formCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.sm
    },
    sectionBlock: {
        gap: theme.spacing.sm
    },
    sectionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 20,
        lineHeight: 28,
        fontFamily: theme.fonts.bold
    },
    sectionCaption: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    inputGroup: {
        gap: theme.spacing.xs
    },
    inputLabel: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.medium
    },
    input: {
        minHeight: 48,
        paddingHorizontal: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    formGrid: {
        flexDirection: 'row',
        gap: theme.spacing.sm
    },
    formGridItem: {
        flex: 1,
        gap: theme.spacing.xs
    },
    segmentedControl: {
        minHeight: 48,
        flexDirection: 'row',
        padding: theme.spacing.micro,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        gap: theme.spacing.micro
    },
    segmentButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.sm
    },
    segmentButtonSelected: {
        backgroundColor: theme.colors.accentSoft
    },
    segmentButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.medium
    },
    segmentButtonTextSelected: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold
    },
    primaryButton: {
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    textButton: {
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.sm
    },
    textButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    buttonPressed: {
        opacity: 0.82
    },
    cardList: {
        gap: theme.spacing.sm
    },
    flightCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.sm
    },
    flightCardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
    },
    flightNumberPill: {
        minHeight: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.micro,
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.accent
    },
    flightNumberText: {
        color: '#FFFFFF',
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.bold
    },
    flightStatusText: {
        flexShrink: 1,
        color: theme.colors.accentStrong,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.semibold
    },
    flightRouteText: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 26,
        fontFamily: theme.fonts.bold
    },
    flightTimeGrid: {
        flexDirection: 'row',
        gap: theme.spacing.sm
    },
    flightTimeBlock: {
        flex: 1,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        gap: theme.spacing.micro
    },
    flightTimeLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.medium
    },
    flightTimeValue: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        lineHeight: 22,
        fontFamily: theme.fonts.semibold
    },
    metaChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.xs
    },
    metaChip: {
        minHeight: 32,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.background
    },
    metaChipText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.medium
    },
    flightCardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
    },
    flightSourceText: {
        flex: 1,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.body
    },
    flightSavedText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.medium
    },
    flightActionRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs
    },
    secondaryButton: {
        flex: 1,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    secondaryButtonText: {
        color: theme.colors.accent,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    removeButton: {
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    removeButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    emptyPanel: {
        alignItems: 'center',
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.xs
    },
    emptyPanelTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 24,
        fontFamily: theme.fonts.bold,
        textAlign: 'center'
    },
    emptyPanelText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 22,
        fontFamily: theme.fonts.body,
        textAlign: 'center'
    },
    placeholderCard: {
        alignItems: 'center',
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.xs
    },
    placeholderTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 26,
        fontFamily: theme.fonts.bold,
        textAlign: 'center'
    },
    placeholderText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 22,
        fontFamily: theme.fonts.body,
        textAlign: 'center'
    }
});
