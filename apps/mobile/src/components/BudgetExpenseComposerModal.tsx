import React from 'react';
import {
    Animated,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import { SheetBackButton } from './SheetBackButton';

export type BudgetExpenseComposerOption = {
    itemId: string;
    itemIndex: number;
    title: string;
    location?: string;
    countryCode?: string;
};

export type BudgetExpenseShoppingOption = {
    id: string;
    index: number;
    text: string;
};

type Props = {
    visible: boolean;
    title?: string;
    itemOptions: BudgetExpenseComposerOption[];
    selectedItemId: string;
    description: string;
    amount: string;
    currency?: string;
    selectedShoppingIndex?: number | null;
    shoppingOptions?: BudgetExpenseShoppingOption[];
    isItemSelectionLocked?: boolean;
    isSaving?: boolean;
    onClose(): void;
    onSelectedItemIdChange?(itemId: string): void;
    onDescriptionChange(value: string): void;
    onAmountChange(value: string): void;
    onCurrencyChange?(currency: string): void;
    onShoppingIndexChange?(index: number | null): void;
    onSubmit(): void;
};

type ExpenseCurrencyOption = {
    code: string;
    label: string;
    symbol: string;
};

export const DEFAULT_EXPENSE_CURRENCY = 'KRW';

export const EXPENSE_CURRENCY_OPTIONS: ExpenseCurrencyOption[] = [
    { code: 'KRW', label: '대한민국 원', symbol: '₩' },
    { code: 'USD', label: '미국 달러', symbol: '$' },
    { code: 'EUR', label: '유로', symbol: '€' },
    { code: 'JPY', label: '일본 엔', symbol: '¥' },
    { code: 'CNY', label: '중국 위안', symbol: '¥' },
    { code: 'HKD', label: '홍콩 달러', symbol: 'HK$' },
    { code: 'TWD', label: '대만 달러', symbol: 'NT$' },
    { code: 'GBP', label: '영국 파운드', symbol: '£' },
    { code: 'CAD', label: '캐나다 달러', symbol: 'CA$' },
    { code: 'AUD', label: '호주 달러', symbol: 'A$' },
    { code: 'NZD', label: '뉴질랜드 달러', symbol: 'NZ$' },
    { code: 'SGD', label: '싱가포르 달러', symbol: 'S$' },
    { code: 'THB', label: '태국 바트', symbol: '฿' },
    { code: 'VND', label: '베트남 동', symbol: '₫' },
    { code: 'PHP', label: '필리핀 페소', symbol: '₱' },
    { code: 'IDR', label: '인도네시아 루피아', symbol: 'Rp' },
    { code: 'MYR', label: '말레이시아 링깃', symbol: 'RM' },
    { code: 'INR', label: '인도 루피', symbol: '₹' },
    { code: 'CHF', label: '스위스 프랑', symbol: 'CHF' },
    { code: 'AED', label: 'UAE 디르함', symbol: 'AED' },
    { code: 'SAR', label: '사우디 리얄', symbol: 'SAR' },
    { code: 'TRY', label: '튀르키예 리라', symbol: '₺' },
    { code: 'MXN', label: '멕시코 페소', symbol: 'MX$' },
    { code: 'BRL', label: '브라질 헤알', symbol: 'R$' }
];

const SUPPORTED_EXPENSE_CURRENCY_CODES = new Set(EXPENSE_CURRENCY_OPTIONS.map((option) => option.code));
const EXPENSE_CURRENCY_BY_COUNTRY_CODE: Record<string, string> = {
    AD: 'EUR',
    AE: 'AED',
    AS: 'USD',
    AT: 'EUR',
    AU: 'AUD',
    BE: 'EUR',
    BR: 'BRL',
    CA: 'CAD',
    CH: 'CHF',
    CN: 'CNY',
    CY: 'EUR',
    DE: 'EUR',
    EE: 'EUR',
    ES: 'EUR',
    FI: 'EUR',
    FR: 'EUR',
    GB: 'GBP',
    GR: 'EUR',
    GU: 'USD',
    HK: 'HKD',
    HR: 'EUR',
    ID: 'IDR',
    IE: 'EUR',
    IN: 'INR',
    IT: 'EUR',
    JP: 'JPY',
    KR: 'KRW',
    LI: 'CHF',
    LT: 'EUR',
    LU: 'EUR',
    LV: 'EUR',
    MC: 'EUR',
    ME: 'EUR',
    MT: 'EUR',
    MX: 'MXN',
    MY: 'MYR',
    NL: 'EUR',
    NZ: 'NZD',
    PH: 'PHP',
    PR: 'USD',
    PT: 'EUR',
    SA: 'SAR',
    SG: 'SGD',
    SI: 'EUR',
    SK: 'EUR',
    SM: 'EUR',
    TH: 'THB',
    TR: 'TRY',
    TW: 'TWD',
    US: 'USD',
    VA: 'EUR',
    VI: 'USD',
    VN: 'VND',
    XK: 'EUR'
};
const EXPENSE_CURRENCY_TEXT_MATCHERS: Array<{ currency: string; pattern: RegExp }> = [
    { currency: 'JPY', pattern: /일본|도쿄|오사카|교토|후쿠오카|삿포로|오키나와|요코하마|하코네|고베|나라|유후인|벳푸|japan|tokyo|osaka|kyoto|fukuoka|sapporo|okinawa|yokohama|hakone|kobe|nara|yufuin|beppu/ },
    { currency: 'USD', pattern: /미국|괌|사이판|하와이|뉴욕|로스앤젤레스|샌프란시스코|라스베이거스|올랜도|unitedstates|guam|saipan|hawaii|newyork|losangeles|sanfrancisco|lasvegas|orlando/ },
    { currency: 'EUR', pattern: /유럽|프랑스|파리|이탈리아|로마|밀라노|베네치아|스페인|바르셀로나|마드리드|독일|베를린|프랑크푸르트|네덜란드|암스테르담|포르투갈|리스본|그리스|아테네|오스트리아|비엔나|빈|핀란드|헬싱키|아일랜드|더블린|벨기에|브뤼셀|크로아티아|europe|france|paris|italy|rome|milan|venice|spain|barcelona|madrid|germany|berlin|frankfurt|netherlands|amsterdam|portugal|lisbon|greece|athens|austria|vienna|finland|helsinki|ireland|dublin|belgium|brussels|croatia/ },
    { currency: 'GBP', pattern: /영국|런던|잉글랜드|unitedkingdom|greatbritain|britain|england|london/ },
    { currency: 'CNY', pattern: /중국|베이징|상하이|광저우|칭다오|충칭|청두|china|beijing|shanghai|guangzhou|qingdao|chongqing|chengdu/ },
    { currency: 'HKD', pattern: /홍콩|마카오|hongkong|macau|macao/ },
    { currency: 'TWD', pattern: /대만|타이베이|타이중|가오슝|taiwan|taipei|taichung|kaohsiung/ },
    { currency: 'CAD', pattern: /캐나다|밴쿠버|토론토|몬트리올|퀘벡|canada|vancouver|toronto|montreal|quebec/ },
    { currency: 'AUD', pattern: /호주|시드니|멜버른|브리즈번|케언즈|퍼스|australia|sydney|melbourne|brisbane|cairns|perth/ },
    { currency: 'NZD', pattern: /뉴질랜드|오클랜드|퀸스타운|newzealand|auckland|queenstown/ },
    { currency: 'SGD', pattern: /싱가포르|singapore/ },
    { currency: 'THB', pattern: /태국|방콕|치앙마이|푸켓|끄라비|파타야|thailand|bangkok|chiangmai|phuket|krabi|pattaya/ },
    { currency: 'VND', pattern: /베트남|다낭|하노이|호치민|나트랑|푸꾸옥|vietnam|danang|hanoi|hochiminh|nhatrang|phuquoc/ },
    { currency: 'PHP', pattern: /필리핀|세부|보라카이|마닐라|보홀|philippines|cebu|boracay|manila|bohol/ },
    { currency: 'IDR', pattern: /인도네시아|발리|자카르타|indonesia|bali|jakarta/ },
    { currency: 'MYR', pattern: /말레이시아|쿠알라룸푸르|코타키나발루|malaysia|kualalumpur|kotakinabalu/ },
    { currency: 'INR', pattern: /인도|델리|뭄바이|방갈로르|india|delhi|mumbai|bengaluru|bangalore/ },
    { currency: 'CHF', pattern: /스위스|취리히|제네바|switzerland|zurich|geneva/ },
    { currency: 'AED', pattern: /두바이|아부다비|아랍에미리트|uae|unitedarabemirates|dubai|abudhabi/ },
    { currency: 'SAR', pattern: /사우디|리야드|saudi|riyadh/ },
    { currency: 'TRY', pattern: /튀르키예|터키|이스탄불|turkey|turkiye|istanbul/ },
    { currency: 'MXN', pattern: /멕시코|칸쿤|mexico|cancun/ },
    { currency: 'BRL', pattern: /브라질|상파울루|리우|brazil|saopaulo|riodejaneiro/ }
];

function normalizeSupportedExpenseCurrency(value: string | null | undefined) {
    const normalized = String(value || '').trim().toUpperCase();
    return SUPPORTED_EXPENSE_CURRENCY_CODES.has(normalized) ? normalized : null;
}

export function normalizeExpenseCurrency(value: string | null | undefined) {
    return normalizeSupportedExpenseCurrency(value) || DEFAULT_EXPENSE_CURRENCY;
}

export function resolveExpenseCurrencyForCountryCode(countryCode: string | null | undefined) {
    const normalizedCountryCode = String(countryCode || '').trim().toUpperCase();
    if (!normalizedCountryCode) {
        return null;
    }

    return normalizeSupportedExpenseCurrency(EXPENSE_CURRENCY_BY_COUNTRY_CODE[normalizedCountryCode]);
}

function resolveExpenseCurrencyFromCountryCodes(countryCodes: Array<string | null | undefined> = []) {
    const currencyStats = new Map<string, { count: number; firstIndex: number }>();

    countryCodes.forEach((countryCode, index) => {
        const currency = resolveExpenseCurrencyForCountryCode(countryCode);
        if (!currency) {
            return;
        }

        const current = currencyStats.get(currency);
        if (current) {
            current.count += 1;
            return;
        }

        currencyStats.set(currency, {
            count: 1,
            firstIndex: index
        });
    });

    const rankedCurrencies = Array.from(currencyStats.entries())
        .sort((left, right) => {
            if (right[1].count !== left[1].count) {
                return right[1].count - left[1].count;
            }

            return left[1].firstIndex - right[1].firstIndex;
        })
        .map(([currency]) => currency);

    return rankedCurrencies.find((currency) => currency !== DEFAULT_EXPENSE_CURRENCY)
        || rankedCurrencies[0]
        || null;
}

function normalizeDestinationCurrencyText(value: string | null | undefined) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s._-]+/g, '');
}

function resolveExpenseCurrencyFromDestinationText(value: string | null | undefined) {
    const normalizedText = normalizeDestinationCurrencyText(value);
    if (!normalizedText) {
        return null;
    }

    return EXPENSE_CURRENCY_TEXT_MATCHERS.find((matcher) => matcher.pattern.test(normalizedText))?.currency || null;
}

export function resolveDefaultExpenseCurrencyForTrip(input: {
    countryCodes?: Array<string | null | undefined>;
    destinationText?: string | null;
    fallbackCurrency?: string | null;
} = {}) {
    return resolveExpenseCurrencyFromCountryCodes(input.countryCodes)
        || resolveExpenseCurrencyFromDestinationText(input.destinationText)
        || normalizeExpenseCurrency(input.fallbackCurrency);
}

function sanitizeAmountInput(value: string) {
    return String(value || '').replace(/[^\d]/g, '');
}

function formatAmountInput(value: string) {
    const normalized = sanitizeAmountInput(value);
    if (!normalized) {
        return '';
    }

    return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const currencySymbolTextStyle = Platform.select({
    android: {
        fontFamily: 'sans-serif-medium'
    },
    default: {
        fontWeight: '700' as const
    }
});
const SHEET_DISMISS_DRAG_DISTANCE = 96;
const SHEET_DISMISS_VELOCITY = 0.85;

export function BudgetExpenseComposerModal({
    visible,
    title = '지출 추가',
    itemOptions,
    selectedItemId,
    description,
    amount,
    currency = DEFAULT_EXPENSE_CURRENCY,
    selectedShoppingIndex = null,
    shoppingOptions = [],
    isItemSelectionLocked = false,
    isSaving = false,
    onClose,
    onSelectedItemIdChange,
    onDescriptionChange,
    onAmountChange,
    onCurrencyChange,
    onShoppingIndexChange,
    onSubmit
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
    const {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        scrollViewProps
    } = useKeyboardAwareInputScroll(112);
    const canLinkShopping = shoppingOptions.length > 0 && onShoppingIndexChange;
    const selectedItem = React.useMemo(() => {
        return itemOptions.find((option) => option.itemId === selectedItemId) || itemOptions[0] || null;
    }, [itemOptions, selectedItemId]);
    const selectedCurrencyCode = normalizeExpenseCurrency(currency);
    const selectedCurrency = EXPENSE_CURRENCY_OPTIONS.find((option) => (
        option.code === selectedCurrencyCode
    )) || EXPENSE_CURRENCY_OPTIONS[0];
    const [isCurrencyPickerVisible, setCurrencyPickerVisible] = React.useState(false);

    const handleAmountChange = React.useCallback((nextValue: string) => {
        onAmountChange(sanitizeAmountInput(nextValue));
    }, [onAmountChange]);

    const handleCloseCurrencyPicker = React.useCallback(() => {
        setCurrencyPickerVisible(false);
    }, []);
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
        <>
            <Modal
                visible={visible}
                transparent
                animationType="slide"
                onRequestClose={onClose}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} />
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardArea}
                    >
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
                                style={styles.sheetHandleTouch}
                            >
                                <View style={styles.sheetHandle} />
                            </View>
                            <View style={styles.sheetHeader}>
                                <SheetBackButton disabled={isSaving} onPress={onClose} />
                                <View style={styles.sheetHeaderCopy}>
                                    <Text numberOfLines={1} style={styles.sheetTitle}>{title}</Text>
                                </View>
                                <View style={styles.sheetHeaderActions}>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={isSaving}
                                        onPress={onSubmit}
                                        style={({ pressed }) => [
                                            styles.sheetSaveButton,
                                            pressed && !isSaving ? styles.sheetSaveButtonPressed : null,
                                            isSaving ? styles.sheetSaveButtonDisabled : null
                                        ]}
                                    >
                                        <Text style={styles.sheetSaveButtonText}>
                                            {isSaving ? '저장 중...' : '저장'}
                                        </Text>
                                    </Pressable>
                                </View>
                            </View>
                            <ScrollView
                                ref={scrollRef}
                                style={styles.sheetScroll}
                                contentContainerStyle={[styles.sheetContent, contentInsetStyle, keyboardAwareContentInsetStyle]}
                                showsVerticalScrollIndicator={false}
                                {...scrollViewProps}
                            >
                                {isItemSelectionLocked ? (
                                    <View style={styles.targetCard}>
                                        <Text style={styles.targetLabel}>지출이 붙을 일정</Text>
                                        <Text style={styles.targetTitle}>{selectedItem?.title || '선택된 일정'}</Text>
                                    </View>
                                ) : (
                                    <View style={styles.sheetSection}>
                                        <Text style={styles.sectionLabel}>연결 일정</Text>
                                        <View style={styles.optionChipRow}>
                                            {itemOptions.map((option) => (
                                                <Pressable
                                                    key={`${option.itemId}-expense-option`}
                                                    accessibilityRole="button"
                                                    disabled={isSaving || !onSelectedItemIdChange}
                                                    onPress={() => {
                                                        onSelectedItemIdChange?.(option.itemId);
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.optionChip,
                                                        selectedItemId === option.itemId ? styles.optionChipActive : null,
                                                        pressed && !isSaving ? styles.optionChipPressed : null
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.optionChipText,
                                                            selectedItemId === option.itemId ? styles.optionChipTextActive : null
                                                        ]}
                                                    >
                                                        {option.title}
                                                    </Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                    </View>
                                )}
                                <View style={styles.sheetSection}>
                                    <Text style={styles.sectionLabel}>
                                        {isItemSelectionLocked ? '지출 내역 (선택)' : '지출 내역'}
                                    </Text>
                                    <TextInput
                                        accessibilityLabel="지출 내역 입력"
                                        editable={!isSaving}
                                        onChangeText={onDescriptionChange}
                                        onFocus={createFocusHandler()}
                                        placeholder={isItemSelectionLocked ? '비워두어도 저장돼요.' : '예: 기념품, 식사, 입장권'}
                                        placeholderTextColor={theme.colors.textSecondary}
                                        style={styles.formInput}
                                        value={description}
                                    />
                                    <Text style={[styles.sectionLabel, styles.formFieldLabel]}>금액</Text>
                                    <View style={styles.amountInputRow}>
                                        <TextInput
                                            accessibilityLabel="지출 금액 입력"
                                            editable={!isSaving}
                                            keyboardType="number-pad"
                                            onChangeText={handleAmountChange}
                                            onFocus={createFocusHandler()}
                                            placeholder="예: 18,000"
                                            placeholderTextColor={theme.colors.textSecondary}
                                            style={[styles.formInput, styles.amountInput]}
                                            value={formatAmountInput(amount)}
                                        />
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="화폐 선택"
                                            disabled={isSaving}
                                            onPress={() => {
                                                setCurrencyPickerVisible(true);
                                            }}
                                            style={({ pressed }) => [
                                                styles.currencyButton,
                                                pressed && !isSaving ? styles.optionChipPressed : null,
                                                isSaving ? styles.primaryActionButtonDisabled : null
                                            ]}
                                        >
                                            <Text style={styles.currencyButtonText}>{selectedCurrency.code}</Text>
                                            <Text style={styles.currencyButtonSymbol}>{selectedCurrency.symbol}</Text>
                                        </Pressable>
                                    </View>
                                </View>
                                {canLinkShopping ? (
                                    <View style={styles.sheetSection}>
                                        <Text style={styles.sectionLabel}>쇼핑 리스트 연결</Text>
                                        <Text style={styles.sectionSupport}>선택하면 저장 후 바로 구매 완료로 체크돼요.</Text>
                                        <View style={styles.optionChipRow}>
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={isSaving}
                                                onPress={() => {
                                                    onShoppingIndexChange(null);
                                                }}
                                                style={({ pressed }) => [
                                                    styles.optionChip,
                                                    selectedShoppingIndex === null ? styles.optionChipActive : null,
                                                    pressed && !isSaving ? styles.optionChipPressed : null
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.optionChipText,
                                                        selectedShoppingIndex === null ? styles.optionChipTextActive : null
                                                    ]}
                                                >
                                                    연결 안 함
                                                </Text>
                                            </Pressable>
                                            {shoppingOptions.map((item) => (
                                                <Pressable
                                                    key={`${item.id}-expense-link`}
                                                    accessibilityRole="button"
                                                    disabled={isSaving}
                                                    onPress={() => {
                                                        onShoppingIndexChange(item.index);
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.optionChip,
                                                        selectedShoppingIndex === item.index ? styles.optionChipActive : null,
                                                        pressed && !isSaving ? styles.optionChipPressed : null
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.optionChipText,
                                                            selectedShoppingIndex === item.index ? styles.optionChipTextActive : null
                                                        ]}
                                                    >
                                                        {item.text}
                                                    </Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                    </View>
                                ) : null}
                            </ScrollView>
                        </Animated.View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
            <Modal
                visible={visible && isCurrencyPickerVisible}
                transparent
                animationType="fade"
                onRequestClose={handleCloseCurrencyPicker}
            >
                <View style={styles.currencyPickerOverlay}>
                    <Pressable style={styles.currencyPickerBackdrop} onPress={handleCloseCurrencyPicker} />
                    <View style={[styles.currencyPickerSheet, { paddingBottom: insets.bottom + theme.spacing.sm }]}>
                        <View style={styles.currencyPickerHeader}>
                            <Text style={styles.currencyPickerTitle}>화폐 선택</Text>
                            <Pressable
                                accessibilityRole="button"
                                onPress={handleCloseCurrencyPicker}
                                style={({ pressed }) => [
                                    styles.currencyPickerCloseButton,
                                    pressed ? styles.sheetCloseButtonPressed : null
                                ]}
                            >
                                <Text style={styles.sheetCloseButtonText}>닫기</Text>
                            </Pressable>
                        </View>
                        <ScrollView style={styles.currencyOptionScroll} showsVerticalScrollIndicator={false}>
                            {EXPENSE_CURRENCY_OPTIONS.map((option) => {
                                const selected = option.code === selectedCurrencyCode;
                                return (
                                    <Pressable
                                        key={option.code}
                                        accessibilityRole="button"
                                        onPress={() => {
                                            onCurrencyChange?.(option.code);
                                            setCurrencyPickerVisible(false);
                                        }}
                                        style={({ pressed }) => [
                                            styles.currencyOptionRow,
                                            selected ? styles.currencyOptionRowActive : null,
                                            pressed ? styles.optionChipPressed : null
                                        ]}
                                    >
                                        <View style={styles.currencyOptionCodeWrap}>
                                            <Text
                                                style={[
                                                    styles.currencyOptionCode,
                                                    selected ? styles.currencyOptionCodeActive : null
                                                ]}
                                            >
                                                {option.code}
                                            </Text>
                                            <Text style={styles.currencyOptionSymbol}>{option.symbol}</Text>
                                        </View>
                                        <Text
                                            style={[
                                                styles.currencyOptionLabel,
                                                selected ? styles.currencyOptionLabelActive : null
                                            ]}
                                        >
                                            {option.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: theme.colors.surface
    },
    keyboardArea: {
        width: '100%',
        flex: 1,
        justifyContent: 'flex-end'
    },
    sheet: {
        width: '100%',
        height: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        backgroundColor: theme.colors.surface
    },
    sheetHandleTouch: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 36,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    sheetHandle: {
        width: 48,
        height: 5,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    sheetHeaderCopy: {
        flex: 1,
        justifyContent: 'center',
        minHeight: theme.spacing.xl,
        paddingRight: theme.spacing.sm
    },
    sheetHeaderActions: {
        alignItems: 'flex-end'
    },
    sheetTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    sheetSaveButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.accent
    },
    sheetSaveButtonPressed: {
        opacity: 0.88
    },
    sheetSaveButtonDisabled: {
        opacity: 0.55
    },
    sheetSaveButtonText: {
        color: '#FFFFFF',
        fontFamily: theme.fonts.bold
    },
    sheetCloseButtonPressed: {
        opacity: 0.88
    },
    sheetCloseButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    sheetScroll: {
        flex: 1
    },
    sheetContent: {
        padding: theme.spacing.sm,
        paddingBottom: theme.spacing.lg
    },
    sheetSection: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        marginBottom: theme.spacing.sm
    },
    targetCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        marginBottom: theme.spacing.sm
    },
    targetLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.bold
    },
    targetTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 17,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    sectionLabel: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
    sectionSupport: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    optionChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: theme.spacing.sm,
        gap: theme.spacing.xs
    },
    optionChip: {
        minHeight: 32,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    optionChipActive: {
        backgroundColor: theme.colors.accentSoft
    },
    optionChipPressed: {
        opacity: 0.88
    },
    optionChipText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.semibold
    },
    optionChipTextActive: {
        color: theme.colors.accent
    },
    formFieldLabel: {
        marginTop: theme.spacing.sm
    },
    formInput: {
        marginTop: theme.spacing.xs,
        minHeight: 48,
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        color: theme.colors.textPrimary,
        backgroundColor: theme.colors.surfaceMuted,
        fontFamily: theme.fonts.body
    },
    amountInputRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: theme.spacing.xs
    },
    amountInput: {
        flex: 1,
        minWidth: 0
    },
    currencyButton: {
        width: 84,
        minHeight: 48,
        marginTop: theme.spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    currencyButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        lineHeight: 17,
        fontFamily: theme.fonts.bold
    },
    currencyButtonSymbol: {
        marginTop: 1,
        color: theme.colors.textSecondary,
        fontSize: 11,
        lineHeight: 14,
        ...(currencySymbolTextStyle || {})
    },
    primaryActionButtonDisabled: {
        opacity: 0.55
    },
    currencyPickerOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.28)'
    },
    currencyPickerBackdrop: {
        flex: 1
    },
    currencyPickerSheet: {
        maxHeight: '68%',
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface
    },
    currencyPickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.xs
    },
    currencyPickerTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    currencyPickerCloseButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    currencyOptionScroll: {
        flexGrow: 0
    },
    currencyOptionRow: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md
    },
    currencyOptionRowActive: {
        backgroundColor: theme.colors.accentSoft
    },
    currencyOptionCodeWrap: {
        width: 64
    },
    currencyOptionCode: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        lineHeight: 18,
        fontFamily: theme.fonts.bold
    },
    currencyOptionCodeActive: {
        color: theme.colors.accent
    },
    currencyOptionSymbol: {
        marginTop: 1,
        color: theme.colors.textSecondary,
        fontSize: 11,
        lineHeight: 14,
        ...(currencySymbolTextStyle || {})
    },
    currencyOptionLabel: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    currencyOptionLabelActive: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold
    }
});
