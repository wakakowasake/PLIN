import { formatDuration, formatTimeStr, parseTimeStr } from '@shared/core/utils/time-value-helpers.js';
import { createMemoryEntries } from '@shared/features/memories/memory-helpers.js';
import {
    formatAirportSelectionValue,
    getAirportSuggestions,
    resolveAirport
} from '@shared/features/transit/airports-data.js';
import {
    calculateFlightDurationDetails,
    formatTimeZoneOffsetLabel
} from '@shared/features/transit/flight-time-helpers.js';
import React from 'react';
import {
    ActivityIndicator,
    Animated,
    Image,
    KeyboardAvoidingView,
    Linking,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { CommonActions, usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdapters } from '@/adapters/useAdapters';
import {
    BudgetExpenseComposerModal,
    DEFAULT_EXPENSE_CURRENCY,
    normalizeExpenseCurrency
} from '@/components/BudgetExpenseComposerModal';
import { DebugInfoCard } from '@/components/DebugInfoCard';
import { Alert } from '@/feedback';
import { DurationPickerModal } from '@/components/DurationPickerModal';
import { TimelineItemComposerModal } from '@/components/TimelineItemComposerModal';
import { TimelineMemoryComposerModal } from '@/components/TimelineMemoryComposerModal';
import { TimePickerModal } from '@/components/TimePickerModal';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import {
    buildTimelineReminderSchedule,
    cancelTimelineReminder,
    getTimelineReminderRecord,
    scheduleTimelineReminder,
    syncTripRemindersForDetail,
    type TripReminderRecord
} from '@/services/trip-reminders';
import {
    MAX_TRIP_ATTACHMENT_BYTES,
    MAX_TRIP_ATTACHMENT_COUNT,
    MAX_TRIP_ATTACHMENT_SIZE_LABEL,
    pickTripAttachmentAssets,
    uploadTripAttachmentAssets,
    type PickedTripAttachmentAsset
} from '@/services/trip-attachment-upload';
import { uploadTripMemoryAssets, type PickedTripMemoryAsset } from '@/services/trip-memory-upload';
import { publishTripDetailUpdated } from '@/state/trip-write-sync';
import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import type {
    ExpenseEntry,
    MemoryEntry,
    MobileTimelineItemCategory,
    MobileTimelineItemCreateInput,
    MobileTimelineItemEditInput,
    MobileTimelineDisplayItem,
    MobileTripCreatePlace,
    MobileTripDaySection,
    RawAttachmentEntry
} from '@/types/trip';
import {
    canUseMobileWebSessionStorage,
    readMobileWebSessionJson,
    removeMobileWebSessionValue,
    writeMobileWebSessionJson
} from '@/utils/mobile-web-session';

type Props = NativeStackScreenProps<RootStackParamList, 'TimelineItemEdit'>;
type PendingMemoryDraft = {
    id: string;
    createdAt: string;
    previewUrl: string | null;
    asset?: PickedTripMemoryAsset | null;
};
type AttachmentDraft = {
    id: string;
    name: string;
    url?: string | null;
    previewUrl?: string | null;
    mimeType: string;
    size?: number | null;
    asset?: PickedTripAttachmentAsset | null;
};
type ExpenseDraft = {
    id: string;
    description: string;
    amountInput: string;
    currency: string;
};
type AirportFieldKey = 'departure' | 'arrival';
type TimelineItemEditDraftSnapshot = {
    titleInput: string;
    note: string;
    time: string;
    airplaneEndTime?: string;
    airplaneDeparture?: string;
    airplaneArrival?: string;
    airplaneFlightNumber?: string;
    airplaneBookingRef?: string;
    airplaneTerminal?: string;
    airplaneGate?: string;
    attachments?: RawAttachmentEntry[];
    locationQuery: string;
    durationMinutes: number;
    category: MobileTimelineItemCategory;
    selectedPlace: MobileTripCreatePlace | null;
    expenseDrafts: ExpenseDraft[];
    reminderEnabledDraft: boolean;
};

const TRIP_WRITE_CONFLICT_MESSAGE = '다른 기기에서 먼저 수정했어요. 최신 내용을 다시 불러온 뒤 변경사항을 다시 적용해 주세요.';
const EDIT_SHEET_DISMISS_DISTANCE = 112;
const EDIT_SHEET_DISMISS_VELOCITY = 1.05;
const AIRPORT_SUGGESTION_LIMIT = 6;
const TIMELINE_CATEGORY_LABELS: Record<MobileTimelineItemCategory, string> = {
    meal: '식사',
    culture: '문화',
    sightseeing: '관광',
    shopping: '쇼핑',
    accommodation: '숙소',
    custom: '기타'
};

function buildTimelineItemEditDraftStorageKey(route: Props['route']) {
    return `plin.mobileWeb.timelineItemEditDraft:${route.params.tripId}:${route.params.dayId}:${route.params.itemId}`;
}

function normalizeText(value: string) {
    return String(value || '').trim();
}

function normalizeTime(value: string) {
    const parsed = parseTimeStr(String(value || '').trim());
    if (parsed === null) {
        return '';
    }

    return formatTimeStr(parsed);
}

function normalizeDurationMinutes(value: number | null | undefined) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 30;
    }

    return Math.floor(parsed);
}

function formatDurationDisplayLabel(value: number) {
    const minutes = normalizeDurationMinutes(value);
    return formatDuration(minutes);
}

function formatAirportInitialValue(code: string | null | undefined, value: string | null | undefined) {
    const airport = resolveAirport(code || value || '');
    if (airport) {
        return formatAirportSelectionValue(airport.code, airport.name);
    }

    return normalizeText(value || code || '');
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

function normalizeTimelineItemCategory(value: string | null | undefined): MobileTimelineItemCategory {
    switch (String(value || '').trim()) {
    case 'meal':
    case 'culture':
    case 'sightseeing':
    case 'shopping':
    case 'accommodation':
    case 'custom':
        return value as MobileTimelineItemCategory;
    default:
        return 'custom';
    }
}

function buildPlaceKey(place: MobileTripCreatePlace | null | undefined) {
    if (!place?.placeId) {
        return '';
    }

    return [
        place.placeId,
        String(place.latitude),
        String(place.longitude),
        String(place.countryCode || '').trim().toUpperCase()
    ].join(':');
}

function parseDayIndexFromLabel(dayLabel: string) {
    const match = String(dayLabel || '').match(/(\d+)/);
    if (!match) {
        return 0;
    }

    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 0;
    }

    return parsed - 1;
}

function formatWon(amount: number) {
    return `₩${Math.round(amount || 0).toLocaleString()}`;
}

function sanitizeAmountInput(value: string) {
    return String(value || '').replace(/[^\d]/g, '');
}

function parseAmountInput(value: string) {
    const normalized = sanitizeAmountInput(value);
    if (!normalized) {
        return 0;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmountInput(value: string) {
    const normalized = sanitizeAmountInput(value);
    if (!normalized) {
        return '';
    }

    return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function buildExpenseDraftId() {
    return `expense-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPendingMemoryId() {
    return `memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildPendingAttachmentId() {
    return `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildExpenseDrafts(expenses: ExpenseEntry[] | undefined) {
    return (expenses || []).reduce<ExpenseDraft[]>((entries, expense) => {
        const amount = Number(expense?.amount) || 0;
        const description = normalizeText(String(expense?.description || ''));

        if (!description && amount <= 0) {
            return entries;
        }

        entries.push({
            id: buildExpenseDraftId(),
            description,
            amountInput: amount > 0 ? String(Math.round(amount)) : '',
            currency: normalizeExpenseCurrency(String(expense?.currency || ''))
        });

        return entries;
    }, []);
}

function buildExpenseEntries(expenseDrafts: ExpenseDraft[]) {
    return expenseDrafts.reduce<ExpenseEntry[]>((entries, draft) => {
        const description = normalizeText(draft.description);
        const amount = parseAmountInput(draft.amountInput);

        if (!description && amount <= 0) {
            return entries;
        }

        if (amount <= 0) {
            return entries;
        }

        entries.push({
            description,
            amount,
            currency: normalizeExpenseCurrency(draft.currency)
        });

        return entries;
    }, []);
}

function serializeExpenseEntries(expenses: ExpenseEntry[]) {
    return JSON.stringify(
        expenses.map((expense) => ({
            description: normalizeText(String(expense.description || '')),
            amount: Number(expense.amount) || 0,
            currency: normalizeExpenseCurrency(String(expense.currency || ''))
        }))
    );
}

function inferAttachmentMimeType(entry: RawAttachmentEntry) {
    const explicitType = normalizeText(String(entry.type || ''));
    if (explicitType) {
        return explicitType.toLowerCase();
    }

    const source = `${String(entry.url || '')} ${String(entry.name || '')}`.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|heic|heif)(\?|#|$)/.test(source)) {
        return 'image/*';
    }

    if (/\.pdf(\?|#|$)/.test(source)) {
        return 'application/pdf';
    }

    return '';
}

function getAttachmentTypeLabel(mimeType: string) {
    const normalizedMimeType = String(mimeType || '').toLowerCase();
    if (normalizedMimeType.startsWith('image/')) {
        return '이미지';
    }

    if (normalizedMimeType === 'application/pdf') {
        return 'PDF';
    }

    return '파일';
}

function isImageAttachment(mimeType: string) {
    return String(mimeType || '').toLowerCase().startsWith('image/');
}

function buildAttachmentDrafts(attachments: RawAttachmentEntry[] | undefined) {
    return (attachments || []).reduce<AttachmentDraft[]>((entries, attachment, index) => {
        const url = normalizeText(String(attachment.url || ''));
        const previewUrl = normalizeText(String(attachment.previewUrl || ''));
        const fallbackUrl = url || previewUrl;

        if (!fallbackUrl) {
            return entries;
        }

        const mimeType = inferAttachmentMimeType(attachment);
        const name = normalizeText(String(attachment.name || '')) || `첨부 파일 ${index + 1}`;

        entries.push({
            id: `existing-attachment-${index}-${fallbackUrl}`,
            name,
            url: fallbackUrl,
            previewUrl: previewUrl || (isImageAttachment(mimeType) ? fallbackUrl : null),
            mimeType,
            size: typeof attachment.size === 'number' && Number.isFinite(attachment.size)
                ? attachment.size
                : null
        });

        return entries;
    }, []);
}

function buildAttachmentEntries(attachmentDrafts: AttachmentDraft[]) {
    return attachmentDrafts.reduce<RawAttachmentEntry[]>((entries, attachment) => {
        const url = normalizeText(String(attachment.url || ''));
        if (!url) {
            return entries;
        }

        entries.push({
            name: normalizeText(attachment.name) || '첨부 파일',
            type: normalizeText(attachment.mimeType) || null,
            url,
            previewUrl: normalizeText(String(attachment.previewUrl || '')) || null,
            size: typeof attachment.size === 'number' && Number.isFinite(attachment.size)
                ? attachment.size
                : null
        });

        return entries;
    }, []);
}

function buildPendingAttachmentDrafts(assets: PickedTripAttachmentAsset[]) {
    return assets.map((asset) => ({
        id: buildPendingAttachmentId(),
        name: asset.name,
        url: asset.uri,
        previewUrl: isImageAttachment(asset.mimeType) ? asset.uri : null,
        mimeType: asset.mimeType,
        size: asset.size ?? null,
        asset
    }));
}

function formatFileSize(bytes: number | null | undefined) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
        return '';
    }

    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(bytes >= MAX_TRIP_ATTACHMENT_BYTES ? 0 : 1)}MB`;
    }

    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function serializeAttachmentEntries(attachments: RawAttachmentEntry[]) {
    return JSON.stringify(
        attachments.map((attachment) => ({
            name: normalizeText(String(attachment.name || '')),
            type: normalizeText(String(attachment.type || '')),
            url: normalizeText(String(attachment.url || '')),
            previewUrl: normalizeText(String(attachment.previewUrl || '')),
            size: typeof attachment.size === 'number' && Number.isFinite(attachment.size)
                ? attachment.size
                : null
        }))
    );
}

function buildPendingMemoryDrafts(input: { assets: PickedTripMemoryAsset[] }) {
    const createdAt = new Date().toISOString();
    const entries = createMemoryEntries(
        input.assets.map((asset) => asset.uri),
        '',
        createdAt
    );

    return entries.map((entry, index) => ({
        id: buildPendingMemoryId(),
        createdAt: String(entry.createdAt || createdAt).trim(),
        previewUrl: typeof entry.photoUrl === 'string' && entry.photoUrl.trim()
            ? entry.photoUrl.trim()
            : null,
        asset: input.assets[index] || null
    }));
}

function buildDraftReminderDay(route: Props['route']): MobileTripDaySection {
    return {
        id: route.params.dayId,
        label: route.params.dayLabel,
        date: route.params.dayDate,
        items: []
    };
}

function buildDraftReminderItem(params: {
    route: Props['route'];
    title: string;
    time: string;
    note: string;
}): MobileTimelineDisplayItem {
    return {
        id: params.route.params.itemId,
        timeLabel: params.time,
        title: params.title || params.route.params.itemTitle || '일정',
        location: String(params.route.params.initialInput.location || '').trim(),
        badgeLabel: params.route.params.isMemo ? '메모' : params.route.params.isTransit ? '이동' : '일정',
        transitType: params.route.params.isTransit
            ? String(params.route.params.initialInput.transitType || 'walk').trim()
            : '',
        durationLabel: '',
        transitWindowLabel: '',
        note: params.note,
        isTransit: params.route.params.isTransit,
        memoriesCount: 0,
        photoPreviewUrls: [],
        memoryEntries: [],
        attachments: [],
        expenseSummaryLabel: '',
        expenseTotalAmount: 0,
        expenseItems: [],
        latitude: null,
        longitude: null,
        placeId: '',
        countryCode: '',
        flightInfo: null,
        transitRouteChips: [],
        transitDetailedSteps: []
    };
}

function isNetworkLikeMessage(message: string | null) {
    if (!message) {
        return false;
    }

    return message.includes('네트워크') || message.includes('연결');
}

function isSessionLikeMessage(message: string | null) {
    if (!message) {
        return false;
    }

    return message.includes('세션')
        || message.includes('로그인 상태')
        || message.includes('권한');
}

export function TimelineItemEditScreen({ navigation, route }: Props) {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { tripRepository } = useAdapters();
    const { user, refreshSession, isAuthActionLoading } = useAuthSession();
    const {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        scrollViewProps
    } = useKeyboardAwareInputScroll(120);
    const pendingNavigationActionRef = React.useRef<unknown>(null);
    const sheetDragTranslateY = React.useRef(new Animated.Value(0)).current;
    const editSheetInsetStyle = React.useMemo(() => ({
        paddingTop: insets.top
    }), [insets.top]);

    const canEditTitle = !route.params.isMemo;
    const canEditTime = !route.params.isTransit && !route.params.isMemo;
    const canEditLocation = !route.params.isMemo && !route.params.isTransit;
    const canManageExtras = !route.params.isMemo;
    const isAirplaneTransit = route.params.isTransit
        && String(route.params.initialInput.transitType || '').trim() === 'airplane';

    const [titleInput, setTitleInput] = React.useState(
        route.params.initialInput.title || route.params.itemTitle || ''
    );
    const [note, setNote] = React.useState(route.params.initialInput.note);
    const [time, setTime] = React.useState(route.params.initialInput.time || '');
    const [airplaneEndTime, setAirplaneEndTime] = React.useState(route.params.initialInput.endTime || '');
    const [airplaneDeparture, setAirplaneDeparture] = React.useState(() => formatAirportInitialValue(
        route.params.initialInput.departureAirportCode,
        route.params.initialInput.departure
    ));
    const [airplaneArrival, setAirplaneArrival] = React.useState(() => formatAirportInitialValue(
        route.params.initialInput.arrivalAirportCode,
        route.params.initialInput.arrival
    ));
    const [airplaneFlightNumber, setAirplaneFlightNumber] = React.useState(route.params.initialInput.flightNumber || '');
    const [airplaneBookingRef, setAirplaneBookingRef] = React.useState(route.params.initialInput.bookingRef || '');
    const [airplaneTerminal, setAirplaneTerminal] = React.useState(route.params.initialInput.terminal || '');
    const [airplaneGate, setAirplaneGate] = React.useState(route.params.initialInput.gate || '');
    const [locationQuery, setLocationQuery] = React.useState(route.params.initialInput.location || '');
    const [durationMinutes, setDurationMinutes] = React.useState(
        normalizeDurationMinutes(route.params.initialInput.durationMinutes)
    );
    const [category, setCategory] = React.useState<MobileTimelineItemCategory>(
        normalizeTimelineItemCategory(route.params.initialInput.category)
    );
    const [selectedPlace, setSelectedPlace] = React.useState<MobileTripCreatePlace | null>(
        route.params.initialInput.place ?? null
    );
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const [isSaving, setIsSaving] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [existingReminder, setExistingReminder] = React.useState<TripReminderRecord | null>(null);
    const [isReminderLoading, setReminderLoading] = React.useState(false);
    const [isReminderSaving, setReminderSaving] = React.useState(false);
    const [reminderEnabledDraft, setReminderEnabledDraft] = React.useState(false);
    const [didAttemptSave, setDidAttemptSave] = React.useState(false);
    const [allowNextRemove, setAllowNextRemove] = React.useState(false);
    const [isTimePickerVisible, setIsTimePickerVisible] = React.useState(false);
    const [isDurationPickerVisible, setDurationPickerVisible] = React.useState(false);
    const [activeAirplaneTimePicker, setActiveAirplaneTimePicker] = React.useState<'start' | 'end' | null>(null);
    const [activeAirportField, setActiveAirportField] = React.useState<AirportFieldKey | null>(null);
    const [isPlaceComposerVisible, setPlaceComposerVisible] = React.useState(false);
    const [expenseDrafts, setExpenseDrafts] = React.useState<ExpenseDraft[]>(
        () => buildExpenseDrafts(route.params.initialInput.expenses)
    );
    const [isExpenseComposerVisible, setExpenseComposerVisible] = React.useState(false);
    const [expenseComposerDescription, setExpenseComposerDescription] = React.useState('');
    const [expenseComposerAmount, setExpenseComposerAmount] = React.useState('');
    const [expenseComposerCurrency, setExpenseComposerCurrency] = React.useState(DEFAULT_EXPENSE_CURRENCY);
    const [recentExpenseDraftId, setRecentExpenseDraftId] = React.useState<string | null>(null);
    const [existingAttachmentDrafts, setExistingAttachmentDrafts] = React.useState<AttachmentDraft[]>(
        () => buildAttachmentDrafts(route.params.initialInput.attachments)
    );
    const [pendingAttachmentDrafts, setPendingAttachmentDrafts] = React.useState<AttachmentDraft[]>([]);
    const [isPickingAttachment, setPickingAttachment] = React.useState(false);
    const [pendingMemoryDrafts, setPendingMemoryDrafts] = React.useState<PendingMemoryDraft[]>([]);
    const [isMemoryComposerVisible, setMemoryComposerVisible] = React.useState(false);
    const hasRestoredDraftRef = React.useRef(false);
    const hasRestoredReminderDraftRef = React.useRef(false);
    const draftStorageKey = React.useMemo(
        () => buildTimelineItemEditDraftStorageKey(route),
        [route]
    );

    const initialNote = React.useMemo(
        () => normalizeText(route.params.initialInput.note),
        [route.params.initialInput.note]
    );
    const initialTitle = React.useMemo(
        () => normalizeText(route.params.initialInput.title || route.params.itemTitle || ''),
        [route.params.initialInput.title, route.params.itemTitle]
    );
    const initialTime = React.useMemo(
        () => normalizeTime(route.params.initialInput.time || ''),
        [route.params.initialInput.time]
    );
    const initialAirplaneEndTime = React.useMemo(
        () => normalizeTime(route.params.initialInput.endTime || ''),
        [route.params.initialInput.endTime]
    );
    const initialAirplaneDeparture = React.useMemo(
        () => formatAirportInitialValue(
            route.params.initialInput.departureAirportCode,
            route.params.initialInput.departure
        ),
        [route.params.initialInput.departure, route.params.initialInput.departureAirportCode]
    );
    const initialAirplaneArrival = React.useMemo(
        () => formatAirportInitialValue(
            route.params.initialInput.arrivalAirportCode,
            route.params.initialInput.arrival
        ),
        [route.params.initialInput.arrival, route.params.initialInput.arrivalAirportCode]
    );
    const initialAirplaneFlightNumber = React.useMemo(
        () => normalizeText(route.params.initialInput.flightNumber || '').toUpperCase(),
        [route.params.initialInput.flightNumber]
    );
    const initialAirplaneBookingRef = React.useMemo(
        () => normalizeText(route.params.initialInput.bookingRef || '').toUpperCase(),
        [route.params.initialInput.bookingRef]
    );
    const initialAirplaneTerminal = React.useMemo(
        () => normalizeText(route.params.initialInput.terminal || '').toUpperCase(),
        [route.params.initialInput.terminal]
    );
    const initialAirplaneGate = React.useMemo(
        () => normalizeText(route.params.initialInput.gate || '').toUpperCase(),
        [route.params.initialInput.gate]
    );
    const initialLocation = React.useMemo(
        () => normalizeText(route.params.initialInput.location || ''),
        [route.params.initialInput.location]
    );
    const initialDurationMinutes = React.useMemo(
        () => normalizeDurationMinutes(route.params.initialInput.durationMinutes),
        [route.params.initialInput.durationMinutes]
    );
    const initialCategory = React.useMemo(
        () => normalizeTimelineItemCategory(route.params.initialInput.category),
        [route.params.initialInput.category]
    );
    const initialPlace = React.useMemo(
        () => route.params.initialInput.place ?? null,
        [route.params.initialInput.place]
    );
    const initialPlaceKey = React.useMemo(() => buildPlaceKey(initialPlace), [initialPlace]);
    const initialMemories = React.useMemo(
        () => (route.params.initialInput.memories || []).reduce<MemoryEntry[]>((entries, memory) => {
            const photoUrl = typeof memory?.photoUrl === 'string' && memory.photoUrl.trim()
                ? memory.photoUrl.trim()
                : null;
            const createdAt = String(memory?.createdAt || '').trim();

            if (!photoUrl) {
                return entries;
            }

            entries.push({
                photoUrl,
                createdAt
            });

            return entries;
        }, []),
        [route.params.initialInput.memories]
    );
    const initialExpenseEntries = React.useMemo(
        () => buildExpenseEntries(buildExpenseDrafts(route.params.initialInput.expenses)),
        [route.params.initialInput.expenses]
    );
    const initialExpenseSnapshot = React.useMemo(
        () => serializeExpenseEntries(initialExpenseEntries),
        [initialExpenseEntries]
    );
    const initialAttachmentEntries = React.useMemo(
        () => buildAttachmentEntries(buildAttachmentDrafts(route.params.initialInput.attachments)),
        [route.params.initialInput.attachments]
    );
    const initialAttachmentSnapshot = React.useMemo(
        () => serializeAttachmentEntries(initialAttachmentEntries),
        [initialAttachmentEntries]
    );

    const normalizedTitle = React.useMemo(() => normalizeText(titleInput), [titleInput]);
    const normalizedNote = React.useMemo(() => normalizeText(note), [note]);
    const normalizedTime = React.useMemo(() => normalizeTime(time), [time]);
    const normalizedAirplaneStartTime = normalizedTime;
    const normalizedAirplaneEndTime = React.useMemo(() => normalizeTime(airplaneEndTime), [airplaneEndTime]);
    const normalizedAirplaneDeparture = React.useMemo(() => normalizeText(airplaneDeparture), [airplaneDeparture]);
    const normalizedAirplaneArrival = React.useMemo(() => normalizeText(airplaneArrival), [airplaneArrival]);
    const normalizedAirplaneFlightNumber = React.useMemo(
        () => normalizeText(airplaneFlightNumber).toUpperCase(),
        [airplaneFlightNumber]
    );
    const normalizedAirplaneBookingRef = React.useMemo(
        () => normalizeText(airplaneBookingRef).toUpperCase(),
        [airplaneBookingRef]
    );
    const normalizedAirplaneTerminal = React.useMemo(
        () => normalizeText(airplaneTerminal).toUpperCase(),
        [airplaneTerminal]
    );
    const normalizedAirplaneGate = React.useMemo(
        () => normalizeText(airplaneGate).toUpperCase(),
        [airplaneGate]
    );
    const departureAirport = React.useMemo(
        () => resolveAirport(normalizedAirplaneDeparture),
        [normalizedAirplaneDeparture]
    );
    const arrivalAirport = React.useMemo(
        () => resolveAirport(normalizedAirplaneArrival),
        [normalizedAirplaneArrival]
    );
    const departureAirportSuggestions = React.useMemo(
        () => activeAirportField === 'departure'
            ? getAirportSuggestions(normalizedAirplaneDeparture, AIRPORT_SUGGESTION_LIMIT)
            : [],
        [activeAirportField, normalizedAirplaneDeparture]
    );
    const arrivalAirportSuggestions = React.useMemo(
        () => activeAirportField === 'arrival'
            ? getAirportSuggestions(normalizedAirplaneArrival, AIRPORT_SUGGESTION_LIMIT)
            : [],
        [activeAirportField, normalizedAirplaneArrival]
    );
    const departureAirportMeta = React.useMemo(
        () => formatAirportMatchMeta(departureAirport, route.params.dayDate),
        [departureAirport, route.params.dayDate]
    );
    const arrivalAirportMeta = React.useMemo(
        () => formatAirportMatchMeta(arrivalAirport, route.params.dayDate),
        [arrivalAirport, route.params.dayDate]
    );
    const airplaneDurationInfo = React.useMemo(
        () => calculateFlightDurationDetails({
            dayDate: route.params.dayDate,
            departureTime: normalizedAirplaneStartTime,
            arrivalTime: normalizedAirplaneEndTime,
            departureAirport: normalizedAirplaneDeparture,
            arrivalAirport: normalizedAirplaneArrival
        }),
        [
            normalizedAirplaneArrival,
            normalizedAirplaneDeparture,
            normalizedAirplaneEndTime,
            normalizedAirplaneStartTime,
            route.params.dayDate
        ]
    );
    const autoAirplaneDurationMinutes = airplaneDurationInfo.durationMinutes;
    const normalizedLocationQuery = React.useMemo(() => normalizeText(locationQuery), [locationQuery]);
    const normalizedLocation = React.useMemo(() => {
        if (!canEditLocation) {
            return '';
        }

        const selectedName = normalizeText(selectedPlace?.name || '');
        const selectedAddress = normalizeText(selectedPlace?.address || '');
        if (
            selectedPlace
            && (
                normalizedLocationQuery === selectedName
                || normalizedLocationQuery === selectedAddress
            )
        ) {
            return selectedAddress || selectedName;
        }

        return normalizedLocationQuery;
    }, [canEditLocation, normalizedLocationQuery, selectedPlace]);
    const expenseComposerOptions = React.useMemo(() => ([
        {
            itemId: route.params.itemId,
            itemIndex: route.params.itemIndex,
            title: normalizedTitle || route.params.itemTitle || route.params.dayLabel,
            location: normalizedLocation
        }
    ]), [
        normalizedLocation,
        normalizedTitle,
        route.params.dayLabel,
        route.params.itemId,
        route.params.itemIndex,
        route.params.itemTitle
    ]);

    const effectivePlace = React.useMemo(() => {
        if (!canEditLocation) {
            return null;
        }

        if (normalizedLocation === initialLocation) {
            return initialPlace;
        }

        return selectedPlace;
    }, [canEditLocation, initialLocation, initialPlace, normalizedLocation, selectedPlace]);
    const locationDisplayValue = React.useMemo(
        () => normalizeText(effectivePlace?.address || normalizedLocation || ''),
        [effectivePlace?.address, normalizedLocation]
    );
    const placeComposerMapCenter = React.useMemo(() => (
        effectivePlace
            ? {
                latitude: effectivePlace.latitude,
                longitude: effectivePlace.longitude
            }
            : null
    ), [effectivePlace]);
    const placeComposerMapQuery = React.useMemo(
        () => normalizeText(
            effectivePlace?.name
            || effectivePlace?.address
            || normalizedLocation
            || route.params.initialInput.location
            || ''
        ),
        [
            effectivePlace?.address,
            effectivePlace?.name,
            normalizedLocation,
            route.params.initialInput.location
        ]
    );
    const placeComposerInitialDraft = React.useMemo(() => ({
        searchQuery: placeComposerMapQuery,
        selectedPlace: effectivePlace,
        time: normalizedTime || time || '09:00',
        note,
        durationMinutes,
        category
    }), [category, durationMinutes, effectivePlace, note, normalizedTime, placeComposerMapQuery, time]);
    const placeComposerMetaSummary = React.useMemo(
        () => `${TIMELINE_CATEGORY_LABELS[category]} · ${durationMinutes}분 체류`,
        [category, durationMinutes]
    );

    const draftReminderDay = React.useMemo(
        () => buildDraftReminderDay(route),
        [route]
    );
    const draftReminderItem = React.useMemo(() => buildDraftReminderItem({
        route,
        title: normalizedTitle || route.params.itemTitle || '',
        time: normalizedTime || String(route.params.initialInput.time || '').trim(),
        note: normalizedNote
    }), [
        normalizedNote,
        normalizedTime,
        normalizedTitle,
        route
    ]);

    const effectivePlaceKey = React.useMemo(() => buildPlaceKey(effectivePlace), [effectivePlace]);
    const normalizedExpenseEntries = React.useMemo(
        () => buildExpenseEntries(expenseDrafts),
        [expenseDrafts]
    );
    const expenseTotal = React.useMemo(
        () => normalizedExpenseEntries.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
        [normalizedExpenseEntries]
    );
    const expenseSnapshot = React.useMemo(
        () => serializeExpenseEntries(normalizedExpenseEntries),
        [normalizedExpenseEntries]
    );
    const hasRecentExpenseDraft = React.useMemo(
        () => Boolean(recentExpenseDraftId && expenseDrafts.some((draft) => draft.id === recentExpenseDraftId)),
        [expenseDrafts, recentExpenseDraftId]
    );
    const existingAttachmentEntries = React.useMemo(
        () => buildAttachmentEntries(existingAttachmentDrafts),
        [existingAttachmentDrafts]
    );
    const pendingAttachmentAssets = React.useMemo(
        () => pendingAttachmentDrafts
            .map((draft) => draft.asset || null)
            .filter((asset): asset is PickedTripAttachmentAsset => Boolean(asset)),
        [pendingAttachmentDrafts]
    );
    const attachmentSnapshot = React.useMemo(
        () => serializeAttachmentEntries(existingAttachmentEntries),
        [existingAttachmentEntries]
    );
    const attachmentDrafts = React.useMemo(
        () => [...existingAttachmentDrafts, ...pendingAttachmentDrafts],
        [existingAttachmentDrafts, pendingAttachmentDrafts]
    );
    const currentTripAttachmentCount = Math.max(
        0,
        (route.params.existingTripAttachmentCount ?? initialAttachmentEntries.length)
            - initialAttachmentEntries.length
            + attachmentDrafts.length
    );
    const remainingTripAttachmentCount = Math.max(0, MAX_TRIP_ATTACHMENT_COUNT - currentTripAttachmentCount);
    const expenseValidationError = React.useMemo(() => {
        if (!canManageExtras) {
            return null;
        }

        const hasInvalidExpense = expenseDrafts.some((draft) => {
            const hasAnyInput = normalizeText(draft.description) || sanitizeAmountInput(draft.amountInput);
            if (!hasAnyInput) {
                return false;
            }

            return parseAmountInput(draft.amountInput) <= 0;
        });

        return hasInvalidExpense ? '지출 내역에는 금액을 함께 입력해 주세요.' : null;
    }, [canManageExtras, expenseDrafts]);
    const memoryPreviewEntries = React.useMemo(() => {
        const existingEntries = initialMemories.map((memory, index) => ({
            id: `existing-memory-${index}`,
            createdAt: String(memory.createdAt || '').trim(),
            previewUrl: typeof memory.photoUrl === 'string' && memory.photoUrl.trim()
                ? memory.photoUrl.trim()
                : null,
            isPending: false
        }));
        const pendingEntries = pendingMemoryDrafts.map((memory) => ({
            id: memory.id,
            createdAt: memory.createdAt,
            previewUrl: memory.previewUrl,
            isPending: true
        }));

        return [...existingEntries, ...pendingEntries];
    }, [initialMemories, pendingMemoryDrafts]);

    const isMemo = route.params.isMemo;
    const hasTitleChanges = canEditTitle && normalizedTitle !== initialTitle;
    const hasNoteChanges = normalizedNote !== initialNote;
    const hasTimeChanges = canEditTime && normalizedTime !== initialTime;
    const hasAirplaneTransitChanges = isAirplaneTransit && (
        normalizedAirplaneStartTime !== initialTime
        || normalizedAirplaneEndTime !== initialAirplaneEndTime
        || normalizedAirplaneDeparture !== initialAirplaneDeparture
        || normalizedAirplaneArrival !== initialAirplaneArrival
        || normalizedAirplaneFlightNumber !== initialAirplaneFlightNumber
        || normalizedAirplaneBookingRef !== initialAirplaneBookingRef
        || normalizedAirplaneTerminal !== initialAirplaneTerminal
        || normalizedAirplaneGate !== initialAirplaneGate
    );
    const hasLocationChanges = canEditLocation && (
        normalizedLocation !== initialLocation
        || effectivePlaceKey !== initialPlaceKey
    );
    const hasDurationChanges = canEditLocation && durationMinutes !== initialDurationMinutes;
    const hasCategoryChanges = canEditLocation && category !== initialCategory;
    const hasReminderChanges = reminderEnabledDraft !== Boolean(existingReminder);
    const hasExpenseChanges = canManageExtras && expenseSnapshot !== initialExpenseSnapshot;
    const hasMemoryChanges = canManageExtras && pendingMemoryDrafts.some((draft) => Boolean(draft.asset));
    const hasAttachmentChanges = attachmentSnapshot !== initialAttachmentSnapshot
        || pendingAttachmentDrafts.some((draft) => Boolean(draft.asset));
    const hasChanges = hasTitleChanges
        || hasNoteChanges
        || hasTimeChanges
        || hasAirplaneTransitChanges
        || hasLocationChanges
        || hasDurationChanges
        || hasCategoryChanges
        || hasExpenseChanges
        || hasAttachmentChanges
        || hasMemoryChanges;
    const hasUnsavedChanges = hasChanges || hasReminderChanges;
    const clearPersistedDraft = React.useCallback(() => {
        removeMobileWebSessionValue(draftStorageKey);
    }, [draftStorageKey]);

    React.useEffect(() => {
        if (!canUseMobileWebSessionStorage() || hasRestoredDraftRef.current) {
            return;
        }

        hasRestoredDraftRef.current = true;
        const storedDraft = readMobileWebSessionJson<TimelineItemEditDraftSnapshot>(draftStorageKey);
        if (!storedDraft) {
            return;
        }

        if (typeof storedDraft.titleInput === 'string') {
            setTitleInput(storedDraft.titleInput);
        }

        if (typeof storedDraft.note === 'string') {
            setNote(storedDraft.note);
        }

        if (typeof storedDraft.time === 'string') {
            setTime(storedDraft.time);
        }

        if (typeof storedDraft.airplaneEndTime === 'string') {
            setAirplaneEndTime(storedDraft.airplaneEndTime);
        }

        if (typeof storedDraft.airplaneDeparture === 'string') {
            setAirplaneDeparture(storedDraft.airplaneDeparture);
        }

        if (typeof storedDraft.airplaneArrival === 'string') {
            setAirplaneArrival(storedDraft.airplaneArrival);
        }

        if (typeof storedDraft.airplaneFlightNumber === 'string') {
            setAirplaneFlightNumber(storedDraft.airplaneFlightNumber);
        }

        if (typeof storedDraft.airplaneBookingRef === 'string') {
            setAirplaneBookingRef(storedDraft.airplaneBookingRef);
        }

        if (typeof storedDraft.airplaneTerminal === 'string') {
            setAirplaneTerminal(storedDraft.airplaneTerminal);
        }

        if (typeof storedDraft.airplaneGate === 'string') {
            setAirplaneGate(storedDraft.airplaneGate);
        }

        if (typeof storedDraft.locationQuery === 'string') {
            setLocationQuery(storedDraft.locationQuery);
        }

        if (typeof storedDraft.durationMinutes === 'number') {
            setDurationMinutes(normalizeDurationMinutes(storedDraft.durationMinutes));
        }

        if (typeof storedDraft.category === 'string') {
            setCategory(normalizeTimelineItemCategory(storedDraft.category));
        }

        if (storedDraft.selectedPlace) {
            setSelectedPlace(storedDraft.selectedPlace);
        }

        if (Array.isArray(storedDraft.expenseDrafts)) {
            setExpenseDrafts(storedDraft.expenseDrafts);
        }

        if (Array.isArray(storedDraft.attachments)) {
            setExistingAttachmentDrafts(buildAttachmentDrafts(storedDraft.attachments));
        }

        if (typeof storedDraft.reminderEnabledDraft === 'boolean') {
            hasRestoredReminderDraftRef.current = true;
            setReminderEnabledDraft(storedDraft.reminderEnabledDraft);
        }
    }, [draftStorageKey]);

    React.useEffect(() => {
        if (!canUseMobileWebSessionStorage() || !hasRestoredDraftRef.current) {
            return;
        }

        if (!hasUnsavedChanges) {
            clearPersistedDraft();
            return;
        }

        writeMobileWebSessionJson(draftStorageKey, {
            titleInput,
            note,
            time,
            airplaneEndTime,
            airplaneDeparture,
            airplaneArrival,
            airplaneFlightNumber,
            airplaneBookingRef,
            airplaneTerminal,
            airplaneGate,
            locationQuery,
            durationMinutes,
            category,
            selectedPlace,
            expenseDrafts,
            attachments: existingAttachmentEntries,
            reminderEnabledDraft
        } satisfies TimelineItemEditDraftSnapshot);
    }, [
        airplaneArrival,
        airplaneBookingRef,
        airplaneDeparture,
        airplaneEndTime,
        airplaneFlightNumber,
        airplaneGate,
        airplaneTerminal,
        clearPersistedDraft,
        category,
        draftStorageKey,
        durationMinutes,
        expenseDrafts,
        existingAttachmentEntries,
        hasUnsavedChanges,
        locationQuery,
        note,
        pendingMemoryDrafts,
        reminderEnabledDraft,
        selectedPlace,
        time,
        titleInput
    ]);

    const titleError = canEditTitle && !normalizedTitle ? '일정 이름을 입력해 주세요.' : null;
    const noteError = isMemo && !normalizedNote ? '메모를 입력해 주세요.' : null;
    const timeError = canEditTime && !normalizedTime ? '시간은 HH:MM 형식으로 입력해 주세요.' : null;
    const shouldValidateAirplaneTransit = isAirplaneTransit && hasAirplaneTransitChanges;
    const airplaneStartTimeError = shouldValidateAirplaneTransit && !normalizedAirplaneStartTime
        ? '출발 시간을 선택해 주세요.'
        : null;
    const airplaneEndTimeError = shouldValidateAirplaneTransit && !normalizedAirplaneEndTime
        ? '도착 시간을 선택해 주세요.'
        : null;
    const airplaneDepartureError = shouldValidateAirplaneTransit && !normalizedAirplaneDeparture
        ? '출발 공항을 입력해 주세요.'
        : null;
    const airplaneArrivalError = shouldValidateAirplaneTransit && !normalizedAirplaneArrival
        ? '도착 공항을 입력해 주세요.'
        : null;
    const airplaneDurationError = shouldValidateAirplaneTransit && (!autoAirplaneDurationMinutes || autoAirplaneDurationMinutes < 1)
        ? '소요 시간을 계산할 수 없어요. 시간을 다시 확인해 주세요.'
        : null;
    const visibleTitleError = didAttemptSave ? titleError : null;
    const visibleNoteError = didAttemptSave ? noteError : null;
    const visibleTimeError = didAttemptSave ? timeError : null;
    const visibleAirplaneStartTimeError = didAttemptSave ? airplaneStartTimeError : null;
    const visibleAirplaneEndTimeError = didAttemptSave ? airplaneEndTimeError : null;
    const visibleAirplaneDepartureError = didAttemptSave ? airplaneDepartureError : null;
    const visibleAirplaneArrivalError = didAttemptSave ? airplaneArrivalError : null;
    const visibleAirplaneDurationError = didAttemptSave ? airplaneDurationError : null;
    const visibleExpenseError = didAttemptSave ? expenseValidationError : null;
    const reminderSchedule = React.useMemo(() => (
        isMemo ? null : buildTimelineReminderSchedule(draftReminderDay, draftReminderItem)
    ), [draftReminderDay, draftReminderItem, isMemo]);
    const saveDisabled = isSaving
        || isDeleting
        || isPickingAttachment
        || isReminderSaving
        || !hasUnsavedChanges
        || Boolean(
            titleError
            || noteError
            || timeError
            || airplaneStartTimeError
            || airplaneEndTimeError
            || airplaneDepartureError
            || airplaneArrivalError
            || airplaneDurationError
            || expenseValidationError
        );
    const screenTitle = isMemo ? '메모 수정' : route.params.isTransit ? '이동 수정' : '일정 수정';
    const noteLabel = isMemo ? '메모' : '메모 / 설명';
    const notePlaceholder = isMemo
        ? '메모를 입력해 주세요.'
        : '이 일정에 남길 메모나 설명을 적어 주세요.';

    const handleDiscard = React.useCallback((onConfirm: () => void) => {
        if (isSaving || isDeleting) {
            return;
        }

        if (!hasUnsavedChanges) {
            clearPersistedDraft();
            onConfirm();
            return;
        }

        Alert.alert(
            '변경을 취소할까요?',
            '아직 저장하지 않은 일정 정보가 있어요.',
            [
                {
                    text: '계속 편집',
                    style: 'cancel'
                },
                {
                    text: '버리기',
                    style: 'destructive',
                    onPress: () => {
                        clearPersistedDraft();
                        onConfirm();
                    }
                }
            ]
        );
    }, [clearPersistedDraft, hasUnsavedChanges, isDeleting, isSaving]);

    const requestClose = React.useCallback(() => {
        handleDiscard(() => {
            pendingNavigationActionRef.current = CommonActions.goBack();
            setAllowNextRemove(true);
        });
    }, [handleDiscard]);

    usePreventRemove(hasUnsavedChanges && !isSaving && !allowNextRemove, ({ data }) => {
        handleDiscard(() => {
            pendingNavigationActionRef.current = data.action as never;
            setAllowNextRemove(true);
        });
    });

    React.useEffect(() => {
        if (!allowNextRemove || !pendingNavigationActionRef.current) {
            return;
        }

        const action = pendingNavigationActionRef.current as never;
        pendingNavigationActionRef.current = null;
        navigation.dispatch(action);
    }, [allowNextRemove, navigation]);

    React.useEffect(() => {
        let isMounted = true;

        if (isMemo) {
            setExistingReminder(null);
            setReminderEnabledDraft(false);
            setReminderLoading(false);
            return () => {
                isMounted = false;
            };
        }

        setReminderLoading(true);
        void getTimelineReminderRecord(route.params.tripId, route.params.dayId, route.params.itemId)
            .then((record) => {
                if (!isMounted) {
                    return;
                }

                setExistingReminder(record);
                if (!hasRestoredReminderDraftRef.current) {
                    setReminderEnabledDraft(Boolean(record));
                }
            })
            .finally(() => {
                if (isMounted) {
                    setReminderLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [isMemo, route.params.dayId, route.params.itemId, route.params.tripId]);

    const handleOpenPlaceComposer = React.useCallback(() => {
        if (!canEditLocation) {
            return;
        }

        if (isSaving || isDeleting) {
            return;
        }

        if (saveError) {
            setSaveError(null);
        }
        setPlaceComposerVisible(true);
    }, [canEditLocation, isDeleting, isSaving, saveError]);

    const handleClosePlaceComposer = React.useCallback(() => {
        if (isSaving || isDeleting) {
            return;
        }

        setPlaceComposerVisible(false);
    }, [isDeleting, isSaving]);

    const handleSubmitPlaceComposer = React.useCallback((input: MobileTimelineItemCreateInput) => {
        setLocationQuery(normalizeText(input.place?.name || input.location || ''));
        setSelectedPlace(input.place ?? null);
        setTime(input.time);
        setNote(input.note);
        setDurationMinutes(normalizeDurationMinutes(input.durationMinutes));
        setCategory(normalizeTimelineItemCategory(input.category));
        setPlaceComposerVisible(false);
        if (saveError) {
            setSaveError(null);
        }
    }, [saveError]);

    const handleAddExpenseDraft = React.useCallback(() => {
        if (isSaving || isDeleting) {
            return;
        }

        setExpenseComposerDescription('');
        setExpenseComposerAmount('');
        setExpenseComposerCurrency(DEFAULT_EXPENSE_CURRENCY);
        setRecentExpenseDraftId(null);
        setExpenseComposerVisible(true);
        if (saveError) {
            setSaveError(null);
        }
    }, [isDeleting, isSaving, saveError]);

    const handleCloseExpenseComposer = React.useCallback(() => {
        if (isSaving || isDeleting) {
            return;
        }

        setExpenseComposerVisible(false);
    }, [isDeleting, isSaving]);

    const handleSubmitExpenseComposer = React.useCallback(() => {
        const description = normalizeText(expenseComposerDescription);
        const amount = parseAmountInput(expenseComposerAmount);

        if (amount <= 0) {
            Alert.alert('금액 확인', '금액은 1원 이상 입력해 주세요.');
            return;
        }

        const nextDraftId = buildExpenseDraftId();
        setExpenseDrafts((currentDrafts) => ([
            ...currentDrafts,
            {
                id: nextDraftId,
                description,
                amountInput: String(amount),
                currency: normalizeExpenseCurrency(expenseComposerCurrency)
            }
        ]));
        setRecentExpenseDraftId(nextDraftId);
        setExpenseComposerVisible(false);
        setExpenseComposerDescription('');
        setExpenseComposerAmount('');
        setExpenseComposerCurrency(DEFAULT_EXPENSE_CURRENCY);
        if (saveError) {
            setSaveError(null);
        }
    }, [expenseComposerAmount, expenseComposerCurrency, expenseComposerDescription, saveError]);

    const handleChangeExpenseDraft = React.useCallback((
        draftId: string,
        field: 'description' | 'amountInput',
        value: string
    ) => {
        setExpenseDrafts((currentDrafts) => currentDrafts.map((draft) => {
            if (draft.id !== draftId) {
                return draft;
            }

            return {
                ...draft,
                [field]: field === 'amountInput'
                    ? sanitizeAmountInput(value)
                    : value
            };
        }));
        if (saveError) {
            setSaveError(null);
        }
    }, [saveError]);

    const handleRemoveExpenseDraft = React.useCallback((draftId: string) => {
        setExpenseDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== draftId));
        if (saveError) {
            setSaveError(null);
        }
    }, [saveError]);

    const handleSubmitMemoryDraft = React.useCallback((input: { assets: PickedTripMemoryAsset[] }) => {
        const nextDrafts = buildPendingMemoryDrafts(input);
        if (nextDrafts.length === 0) {
            return;
        }

        setPendingMemoryDrafts((currentDrafts) => [...currentDrafts, ...nextDrafts]);
        setMemoryComposerVisible(false);
        if (saveError) {
            setSaveError(null);
        }
    }, [saveError]);

    const handleRemovePendingMemory = React.useCallback((draftId: string) => {
        setPendingMemoryDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== draftId));
        if (saveError) {
            setSaveError(null);
        }
    }, [saveError]);

    const handleAddAttachmentDrafts = React.useCallback(() => {
        if (isSaving || isDeleting || isPickingAttachment) {
            return;
        }

        if (remainingTripAttachmentCount < 1) {
            Alert.alert(
                '첨부파일 제한',
                `첨부파일은 여행 계획당 최대 ${MAX_TRIP_ATTACHMENT_COUNT}개까지 추가할 수 있어요.`
            );
            return;
        }

        setPickingAttachment(true);
        void pickTripAttachmentAssets(remainingTripAttachmentCount)
            .then((assets) => {
                const nextDrafts = buildPendingAttachmentDrafts(assets);
                if (nextDrafts.length === 0) {
                    return;
                }

                setPendingAttachmentDrafts((currentDrafts) => [...currentDrafts, ...nextDrafts]);
                if (saveError) {
                    setSaveError(null);
                }
            })
            .catch((error) => {
                const message = error instanceof Error ? error.message : '첨부파일을 고르지 못했어요.';
                Alert.alert('첨부파일', message);
            })
            .finally(() => {
                setPickingAttachment(false);
            });
    }, [
        isDeleting,
        isPickingAttachment,
        isSaving,
        remainingTripAttachmentCount,
        saveError
    ]);

    const handleRemoveAttachmentDraft = React.useCallback((draftId: string) => {
        setExistingAttachmentDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== draftId));
        setPendingAttachmentDrafts((currentDrafts) => currentDrafts.filter((draft) => draft.id !== draftId));
        if (saveError) {
            setSaveError(null);
        }
    }, [saveError]);

    const handleOpenAttachmentDraft = React.useCallback((attachment: AttachmentDraft) => {
        const url = normalizeText(String(attachment.url || ''));
        if (!url) {
            return;
        }

        void Linking.openURL(url).catch(() => {
            Alert.alert('첨부파일', '이 첨부파일을 열 수 없어요.');
        });
    }, []);

    const handleSave = React.useCallback(async () => {
        if (!user?.uid || isSaving || isDeleting || isReminderSaving) {
            return;
        }

        setDidAttemptSave(true);
        setSaveError(null);

        if (
            titleError ||
            noteError ||
            timeError ||
            airplaneStartTimeError ||
            airplaneEndTimeError ||
            airplaneDepartureError ||
            airplaneArrivalError ||
            airplaneDurationError ||
            expenseValidationError
        ) {
            return;
        }

        try {
            setIsSaving(true);
            let updatedTrip = null;

            if (hasChanges) {
                let nextMemories: MemoryEntry[] | undefined;
                let nextAttachments: RawAttachmentEntry[] | undefined;

                if (hasMemoryChanges) {
                    const pendingAssets = pendingMemoryDrafts
                        .map((draft) => draft.asset || null)
                        .filter((asset): asset is PickedTripMemoryAsset => Boolean(asset));
                    const uploadedPhotoUrls = pendingAssets.length > 0
                        ? await uploadTripMemoryAssets({
                            tripId: route.params.tripId,
                            dayIndex: parseDayIndexFromLabel(route.params.dayLabel),
                            itemIndex: route.params.itemIndex,
                            assets: pendingAssets
                        })
                        : [];
                    let uploadedPhotoCursor = 0;

                    nextMemories = [
                        ...initialMemories,
                        ...pendingMemoryDrafts
                            .filter((draft) => Boolean(draft.asset))
                            .map((draft) => {
                                const uploadedPhotoUrl = uploadedPhotoUrls[uploadedPhotoCursor] || null;
                                uploadedPhotoCursor += 1;

                                return {
                                    photoUrl: uploadedPhotoUrl,
                                    createdAt: draft.createdAt
                                };
                            })
                    ];
                }

                if (hasAttachmentChanges) {
                    const uploadedAttachments = pendingAttachmentAssets.length > 0
                        ? await uploadTripAttachmentAssets({
                            tripId: route.params.tripId,
                            dayIndex: parseDayIndexFromLabel(route.params.dayLabel),
                            itemIndex: route.params.itemIndex,
                            assets: pendingAttachmentAssets
                        })
                        : [];

                    nextAttachments = [
                        ...existingAttachmentEntries,
                        ...uploadedAttachments
                    ];
                }

                const editInput: MobileTimelineItemEditInput = {
                    note: normalizedNote
                };

                if (canEditTitle && hasTitleChanges) {
                    editInput.title = normalizedTitle;
                }

                if (canEditTime && hasTimeChanges) {
                    editInput.time = normalizedTime;
                }

                if (canEditLocation && hasLocationChanges) {
                    editInput.location = normalizedLocation;
                    editInput.place = effectivePlace;
                    editInput.clearPlace = Boolean(normalizedLocation !== initialLocation && !effectivePlace);
                }

                if (canEditLocation && hasDurationChanges) {
                    editInput.durationMinutes = durationMinutes;
                }

                if (canEditLocation && hasCategoryChanges) {
                    editInput.category = category;
                }

                if (canManageExtras && hasExpenseChanges) {
                    editInput.expenses = normalizedExpenseEntries;
                }

                if (canManageExtras && hasMemoryChanges) {
                    editInput.memories = nextMemories;
                }

                if (hasAttachmentChanges) {
                    editInput.attachments = nextAttachments;
                }

                if (hasAirplaneTransitChanges) {
                    editInput.transitType = 'airplane';
                    editInput.startTime = normalizedAirplaneStartTime;
                    editInput.endTime = normalizedAirplaneEndTime;
                    editInput.durationMinutes = autoAirplaneDurationMinutes || undefined;
                    editInput.departure = normalizedAirplaneDeparture;
                    editInput.arrival = normalizedAirplaneArrival;
                    editInput.departureAirportCode = departureAirport?.code;
                    editInput.arrivalAirportCode = arrivalAirport?.code;
                    editInput.departureTimeZone = departureAirport?.timeZone;
                    editInput.arrivalTimeZone = arrivalAirport?.timeZone;
                    editInput.arrivalDayOffset = airplaneDurationInfo.arrivalDayOffset;
                    editInput.flightNumber = normalizedAirplaneFlightNumber;
                    editInput.bookingRef = normalizedAirplaneBookingRef;
                    editInput.terminal = normalizedAirplaneTerminal;
                    editInput.gate = normalizedAirplaneGate;
                }

                updatedTrip = await tripRepository.updateTimelineItem(
                    user.uid,
                    route.params.tripId,
                    route.params.dayId,
                    route.params.itemId,
                    route.params.itemIndex,
                    editInput
                );

                if (!updatedTrip) {
                    throw new Error('일정을 저장하지 못했어요.');
                }

                publishTripDetailUpdated(updatedTrip);
                try {
                    await syncTripRemindersForDetail(updatedTrip);
                } catch (syncError) {
                    console.warn('Failed to sync trip reminders after timeline item update', syncError);
                }
            }

            if (!isMemo && hasReminderChanges) {
                setReminderSaving(true);
                try {
                    if (reminderEnabledDraft) {
                        const updatedReminderDay = updatedTrip?.days.find((day) => day.id === route.params.dayId);
                        const reminderDay = updatedReminderDay || draftReminderDay;
                        const reminderItem = updatedReminderDay?.items.find((item) => item.id === route.params.itemId)
                            || draftReminderItem;
                        const result = await scheduleTimelineReminder({
                            tripId: route.params.tripId,
                            tripTitle: updatedTrip?.title || route.params.tripTitle || '여행 일정',
                            day: reminderDay,
                            item: reminderItem
                        });

                        if (!result.ok || !result.record) {
                            if (result.reason === 'permission-denied') {
                                throw new Error('여행 일정을 알려드리려면 알림 권한을 허용해 주세요.');
                            }

                            if (result.reason === 'past') {
                                throw new Error('이미 시작이 가까운 일정은 새 알림을 추가할 수 없어요.');
                            }

                            throw new Error('시간이 설정된 일정만 알림을 추가할 수 있어요.');
                        }

                        setExistingReminder(result.record);
                        setReminderEnabledDraft(true);
                    } else if (existingReminder) {
                        await cancelTimelineReminder(route.params.tripId, route.params.dayId, route.params.itemId);
                        setExistingReminder(null);
                        setReminderEnabledDraft(false);
                    }
                } finally {
                    setReminderSaving(false);
                }
            }

            pendingNavigationActionRef.current = CommonActions.goBack();
            clearPersistedDraft();
            setAllowNextRemove(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : '일정을 저장하지 못했어요.';

            if (message === TRIP_WRITE_CONFLICT_MESSAGE && user?.uid) {
                try {
                    const latestTrip = await tripRepository.getTripDetail(user.uid, route.params.tripId);

                    if (latestTrip) {
                        publishTripDetailUpdated(latestTrip);
                    }
                } catch (refreshError) {
                    console.warn('Failed to refresh latest trip detail after conflict', refreshError);
                }
            }

            setSaveError(message);
        } finally {
            setIsSaving(false);
        }
    }, [
        airplaneArrivalError,
        airplaneDepartureError,
        airplaneDurationError,
        airplaneDurationInfo.arrivalDayOffset,
        airplaneEndTimeError,
        airplaneStartTimeError,
        arrivalAirport?.code,
        arrivalAirport?.timeZone,
        autoAirplaneDurationMinutes,
        canManageExtras,
        canEditTitle,
        canEditLocation,
        canEditTime,
        category,
        departureAirport?.code,
        departureAirport?.timeZone,
        draftReminderDay,
        draftReminderItem,
        durationMinutes,
        existingReminder,
        existingAttachmentEntries,
        effectivePlace,
        hasAttachmentChanges,
        hasAirplaneTransitChanges,
        hasChanges,
        hasCategoryChanges,
        hasDurationChanges,
        hasExpenseChanges,
        hasLocationChanges,
        hasMemoryChanges,
        hasReminderChanges,
        hasTimeChanges,
        hasTitleChanges,
        initialMemories,
        initialLocation,
        isDeleting,
        isAirplaneTransit,
        isMemo,
        isReminderSaving,
        isSaving,
        normalizedAirplaneArrival,
        normalizedAirplaneBookingRef,
        normalizedAirplaneDeparture,
        normalizedAirplaneEndTime,
        normalizedAirplaneFlightNumber,
        normalizedAirplaneGate,
        normalizedAirplaneStartTime,
        normalizedAirplaneTerminal,
        normalizedLocation,
        normalizedTitle,
        normalizedNote,
        normalizedTime,
        pendingAttachmentAssets,
        pendingMemoryDrafts,
        reminderEnabledDraft,
        titleError,
        noteError,
        expenseValidationError,
        route.params.dayId,
        route.params.dayLabel,
        route.params.itemId,
        route.params.itemIndex,
        route.params.tripTitle,
        route.params.tripId,
        timeError,
        tripRepository,
        normalizedExpenseEntries,
        user?.uid,
        clearPersistedDraft
    ]);

    const handleDelete = React.useCallback(() => {
        if (!user?.uid || isSaving || isDeleting) {
            return;
        }

        Alert.alert(
            '일정을 삭제할까요?',
            `"${route.params.itemTitle || '이 일정'}" 항목이 여행 일정에서 삭제돼요.`,
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            try {
                                setSaveError(null);
                                setIsDeleting(true);
                                const updatedTrip = await tripRepository.deleteTimelineItem(
                                    user.uid,
                                    route.params.tripId,
                                    route.params.dayId,
                                    route.params.itemId,
                                    route.params.itemIndex
                                );

                                if (!updatedTrip) {
                                    throw new Error('일정을 삭제하지 못했어요.');
                                }

                                try {
                                    await cancelTimelineReminder(route.params.tripId, route.params.dayId, route.params.itemId);
                                } catch {}
                                publishTripDetailUpdated(updatedTrip);
                                clearPersistedDraft();
                                pendingNavigationActionRef.current = CommonActions.goBack();
                                setAllowNextRemove(true);
                            } catch (error) {
                                const message = error instanceof Error ? error.message : '일정을 삭제하지 못했어요.';

                                if (message === TRIP_WRITE_CONFLICT_MESSAGE && user?.uid) {
                                    try {
                                        const latestTrip = await tripRepository.getTripDetail(user.uid, route.params.tripId);

                                        if (latestTrip) {
                                            publishTripDetailUpdated(latestTrip);
                                        }
                                    } catch (refreshError) {
                                        console.warn('Failed to refresh latest trip detail after delete conflict', refreshError);
                                    }
                                }

                                setSaveError(message);
                            } finally {
                                setIsDeleting(false);
                            }
                        })();
                    }
                }
            ]
        );
    }, [
        isDeleting,
        isSaving,
        route.params.dayId,
        route.params.itemId,
        route.params.itemIndex,
        route.params.itemTitle,
        route.params.tripId,
        tripRepository,
        user?.uid,
        clearPersistedDraft
    ]);

    const resetSheetDrag = React.useCallback(() => {
        Animated.spring(sheetDragTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 220,
            mass: 0.8
        }).start();
    }, [sheetDragTranslateY]);

    const editSheetHandlePanResponder = React.useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => !isSaving && !isDeleting,
        onStartShouldSetPanResponderCapture: () => !isSaving && !isDeleting,
        onMoveShouldSetPanResponder: (_event, gestureState) => (
            !isSaving
            && !isDeleting
            && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
            && Math.abs(gestureState.dy) > 2
        ),
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => (
            !isSaving
            && !isDeleting
            && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
            && Math.abs(gestureState.dy) > 2
        ),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
            sheetDragTranslateY.stopAnimation();
        },
        onPanResponderMove: (_event, gestureState) => {
            sheetDragTranslateY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_event, gestureState) => {
            const shouldDismiss = (
                gestureState.dy > EDIT_SHEET_DISMISS_DISTANCE
                || gestureState.vy > EDIT_SHEET_DISMISS_VELOCITY
            );

            if (shouldDismiss) {
                requestClose();
            }

            resetSheetDrag();
        },
        onPanResponderTerminate: resetSheetDrag
    }), [
        isDeleting,
        isSaving,
        requestClose,
        resetSheetDrag,
        sheetDragTranslateY
    ]);

    const saveSupportText = isSessionLikeMessage(saveError)
        ? '로그인 상태를 다시 확인한 뒤 저장을 다시 시도해 주세요.'
        : isNetworkLikeMessage(saveError)
            ? '연결이 돌아오면 같은 내용으로 다시 저장할 수 있어요.'
            : null;
    const canRetrySession = Boolean(saveError && isSessionLikeMessage(saveError) && !isSaving && !isAuthActionLoading);
    const reminderUi = React.useMemo(() => {
        if (isMemo) {
            return {
                visible: false,
                body: '',
                support: '',
                buttonLabel: ''
            };
        }

        if (isReminderLoading) {
            return {
                visible: true,
                body: '알림 상태를 확인하고 있어요.',
                support: '',
                buttonLabel: ''
            };
        }

        if (!reminderSchedule) {
            return {
                visible: true,
                body: '시간이 있는 일정만 알림을 설정할 수 있어요.',
                support: '시작 시간이 있으면 10분 전에 알려드려요.',
                buttonLabel: ''
            };
        }

        if (reminderSchedule.reminderAt.getTime() <= Date.now()) {
            return {
                visible: true,
                body: '이미 시작이 가까운 일정은 새 알림을 추가할 수 없어요.',
                support: `${reminderSchedule.startTimeLabel} 시작 일정이에요.`,
                buttonLabel: ''
            };
        }

        if (reminderEnabledDraft) {
            return {
                visible: true,
                body: `${reminderSchedule.reminderTimeLabel}에 10분 전 알림이 가도록 저장할게요.`,
                support: hasReminderChanges ? '저장하면 이 일정의 알림이 켜져요.' : '현재 이 일정의 알림이 켜져 있어요.',
                buttonLabel: '알림 끄기'
            };
        }

        return {
            visible: true,
            body: `${reminderSchedule.reminderTimeLabel}에 10분 전 알림을 설정할 수 있어요.`,
            support: hasReminderChanges ? '저장하면 이 일정의 알림이 꺼져요.' : '원하면 이 일정의 10분 전 알림을 켤 수 있어요.',
            buttonLabel: '알림 켜기'
        };
    }, [hasReminderChanges, isMemo, isReminderLoading, reminderEnabledDraft, reminderSchedule]);

    return (
        <View style={styles.screenOverlay}>
            <View pointerEvents="none" style={styles.modalBackdrop} />
            <KeyboardAvoidingView
                style={styles.keyboardArea}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <Animated.View
                    style={[
                        styles.editSheet,
                        editSheetInsetStyle,
                        {
                            transform: [{ translateY: sheetDragTranslateY }]
                        }
                    ]}
                >
                    <View
                        {...editSheetHandlePanResponder.panHandlers}
                        collapsable={false}
                        style={styles.editSheetHandleTouch}
                    >
                        <View style={styles.editSheetHandle} />
                    </View>
                    <View style={styles.actionRow}>
                        <Pressable
                            accessibilityRole="button"
                            disabled={isSaving || isDeleting}
                            onPress={requestClose}
                            style={({ pressed }) => [
                                styles.secondaryAction,
                                (isSaving || isDeleting) ? styles.secondaryActionDisabled : null,
                                pressed && !isSaving && !isDeleting ? styles.secondaryActionPressed : null
                            ]}
                        >
                            <Text numberOfLines={1} style={styles.secondaryActionText}>취소</Text>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            disabled={saveDisabled}
                            onPress={() => {
                                void handleSave();
                            }}
                            style={({ pressed }) => [
                                styles.primaryAction,
                                saveDisabled ? styles.primaryActionDisabled : null,
                                pressed && !saveDisabled ? styles.primaryActionPressed : null
                            ]}
                        >
                            <Text numberOfLines={1} style={styles.primaryActionText}>
                                {isSaving ? '저장 중...' : '저장'}
                            </Text>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            disabled={isSaving || isDeleting}
                            onPress={handleDelete}
                            style={({ pressed }) => [
                                styles.deleteAction,
                                pressed && !isSaving && !isDeleting ? styles.deleteActionPressed : null,
                                (isSaving || isDeleting) ? styles.deleteActionDisabled : null
                            ]}
                        >
                            <Text numberOfLines={1} style={styles.deleteActionText}>
                                {isDeleting ? '삭제 중...' : '삭제'}
                            </Text>
                        </Pressable>
                    </View>
                    <ScrollView
                        ref={scrollRef}
                        contentContainerStyle={[styles.content, keyboardAwareContentInsetStyle]}
                        {...scrollViewProps}
                    >
                <View style={styles.heroCard}>
                    <Text style={styles.heroLabel}>{screenTitle}</Text>
                    <Text style={styles.heroTitle} numberOfLines={2}>
                        {canEditTitle
                            ? (normalizedTitle || route.params.itemTitle || route.params.dayLabel)
                            : (route.params.itemTitle || route.params.dayLabel)}
                    </Text>
                    <Text style={styles.heroMeta}>
                        {route.params.dayLabel} · {route.params.dayDate}
                    </Text>
                </View>

                <View style={styles.formCard}>
                    {canEditTitle ? (
                        <View style={styles.fieldBlock}>
                            <Text style={styles.fieldLabel}>{route.params.isTransit ? '이동 이름' : '일정 이름'}</Text>
                            <TextInput
                                value={titleInput}
                                onChangeText={(value) => {
                                    setTitleInput(value);
                                    if (saveError) {
                                        setSaveError(null);
                                    }
                                }}
                                onFocus={createFocusHandler()}
                                editable={!isSaving}
                                placeholder={route.params.isTransit ? '이동 이름을 입력해 주세요' : '일정 이름을 입력해 주세요'}
                                placeholderTextColor={theme.colors.textSecondary}
                                style={[
                                    styles.textInput,
                                    visibleTitleError ? styles.textInputError : null
                                ]}
                            />
                            {visibleTitleError ? (
                                <Text style={styles.fieldError}>{visibleTitleError}</Text>
                            ) : null}
                        </View>
                    ) : null}

                    {canEditTime ? (
                        <View style={styles.fieldRow}>
                            <View style={styles.fieldColumn}>
                                <Text style={styles.fieldLabel}>시간</Text>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isSaving}
                                    onPress={() => {
                                        setIsTimePickerVisible(true);
                                    }}
                                    style={({ pressed }) => [
                                        styles.timePickerButton,
                                        visibleTimeError ? styles.textInputError : null,
                                        pressed && !isSaving ? styles.buttonPressed : null
                                    ]}
                                >
                                    <Text style={styles.timePickerButtonText}>{normalizedTime || '시간 선택'}</Text>
                                </Pressable>
                                {visibleTimeError ? (
                                    <Text style={styles.fieldError}>{visibleTimeError}</Text>
                                ) : null}
                            </View>
                            <View style={styles.fieldColumn}>
                                <Text style={styles.fieldLabel}>머무는 시간</Text>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isSaving}
                                    onPress={() => {
                                        setDurationPickerVisible(true);
                                    }}
                                    style={({ pressed }) => [
                                        styles.timePickerButton,
                                        pressed && !isSaving ? styles.buttonPressed : null
                                    ]}
                                >
                                    <Text style={styles.timePickerButtonText}>
                                        {formatDurationDisplayLabel(durationMinutes)}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    ) : null}

                    {canEditLocation ? (
                        <View style={styles.fieldBlock}>
                            <Text style={styles.fieldLabel}>장소</Text>
                            <View style={styles.locationSearchRow}>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isSaving || isDeleting}
                                    onPress={handleOpenPlaceComposer}
                                    style={({ pressed }) => [
                                        styles.textInput,
                                        styles.locationSearchInput,
                                        styles.locationDisplayButton,
                                        pressed && !isSaving && !isDeleting ? styles.buttonPressed : null
                                    ]}
                                >
                                    <Text
                                        numberOfLines={1}
                                        style={[
                                            styles.locationDisplayText,
                                            !locationDisplayValue ? styles.locationDisplayPlaceholder : null
                                        ]}
                                    >
                                        {locationDisplayValue || '도시나 장소를 선택해 보세요'}
                                    </Text>
                                </Pressable>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isSaving || isDeleting}
                                    onPress={handleOpenPlaceComposer}
                                    style={({ pressed }) => [
                                        styles.locationSearchButton,
                                        pressed && !isSaving && !isDeleting
                                            ? styles.buttonPressed
                                            : null
                                    ]}
                                >
                                    <Text style={styles.locationSearchButtonText}>수정</Text>
                                </Pressable>
                            </View>

                            {effectivePlace ? (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isSaving || isDeleting}
                                    onPress={handleOpenPlaceComposer}
                                    style={({ pressed }) => [
                                        styles.placePreviewCard,
                                        pressed && !isSaving && !isDeleting ? styles.buttonPressed : null
                                    ]}
                                >
                                    <Text style={styles.placePreviewTitle}>{effectivePlace.name || route.params.itemTitle}</Text>
                                    <Text
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                        style={styles.placePreviewAddress}
                                    >
                                        {effectivePlace.address}
                                    </Text>
                                </Pressable>
                            ) : null}

                            <Text style={styles.locationMetaText}>{placeComposerMetaSummary}</Text>
                        </View>
                    ) : null}

                    {isAirplaneTransit ? (
                        <View style={styles.airplaneFormBlock}>
                            <View style={[styles.fieldRow, styles.airportFieldRow]}>
                                <View style={[styles.fieldColumn, styles.airportFieldColumn]}>
                                    <Text style={styles.fieldLabel}>출발 공항</Text>
                                    <View style={styles.airportInputWrap}>
                                        <TextInput
                                            value={airplaneDeparture}
                                            onChangeText={(value) => {
                                                setAirplaneDeparture(value);
                                                setActiveAirportField('departure');
                                                if (saveError) {
                                                    setSaveError(null);
                                                }
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
                                                visibleAirplaneDepartureError ? styles.textInputError : null
                                            ]}
                                        />
                                        {departureAirportSuggestions.length > 0 ? (
                                            <View style={styles.airportSuggestionList}>
                                                {departureAirportSuggestions.map((airport) => (
                                                    <Pressable
                                                        key={`departure-${airport.code}`}
                                                        accessibilityRole="button"
                                                        disabled={isSaving || isDeleting}
                                                        onPress={() => {
                                                            setAirplaneDeparture(formatAirportSelectionValue(airport.code, airport.name));
                                                            setActiveAirportField(null);
                                                            if (saveError) {
                                                                setSaveError(null);
                                                            }
                                                        }}
                                                        style={({ pressed }) => [
                                                            styles.airportSuggestionItem,
                                                            pressed && !isSaving && !isDeleting ? styles.buttonPressed : null
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
                                    ) : normalizedAirplaneDeparture ? (
                                        <Text style={[styles.airportFieldMeta, styles.airportFieldMetaWarning]}>
                                            등록된 공항을 찾지 못했어요.
                                        </Text>
                                    ) : null}
                                    {visibleAirplaneDepartureError ? (
                                        <Text style={styles.fieldError}>{visibleAirplaneDepartureError}</Text>
                                    ) : null}
                                </View>
                                <View style={[styles.fieldColumn, styles.airportFieldColumn]}>
                                    <Text style={styles.fieldLabel}>도착 공항</Text>
                                    <View style={styles.airportInputWrap}>
                                        <TextInput
                                            value={airplaneArrival}
                                            onChangeText={(value) => {
                                                setAirplaneArrival(value);
                                                setActiveAirportField('arrival');
                                                if (saveError) {
                                                    setSaveError(null);
                                                }
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
                                                visibleAirplaneArrivalError ? styles.textInputError : null
                                            ]}
                                        />
                                        {arrivalAirportSuggestions.length > 0 ? (
                                            <View style={styles.airportSuggestionList}>
                                                {arrivalAirportSuggestions.map((airport) => (
                                                    <Pressable
                                                        key={`arrival-${airport.code}`}
                                                        accessibilityRole="button"
                                                        disabled={isSaving || isDeleting}
                                                        onPress={() => {
                                                            setAirplaneArrival(formatAirportSelectionValue(airport.code, airport.name));
                                                            setActiveAirportField(null);
                                                            if (saveError) {
                                                                setSaveError(null);
                                                            }
                                                        }}
                                                        style={({ pressed }) => [
                                                            styles.airportSuggestionItem,
                                                            pressed && !isSaving && !isDeleting ? styles.buttonPressed : null
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
                                    ) : normalizedAirplaneArrival ? (
                                        <Text style={[styles.airportFieldMeta, styles.airportFieldMetaWarning]}>
                                            등록된 공항을 찾지 못했어요.
                                        </Text>
                                    ) : null}
                                    {visibleAirplaneArrivalError ? (
                                        <Text style={styles.fieldError}>{visibleAirplaneArrivalError}</Text>
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
                                            setActiveAirplaneTimePicker('start');
                                        }}
                                        style={({ pressed }) => [
                                            styles.timePickerButton,
                                            visibleAirplaneStartTimeError ? styles.textInputError : null,
                                            pressed && !isSaving ? styles.buttonPressed : null
                                        ]}
                                    >
                                        <Text style={styles.timePickerButtonText}>
                                            {normalizedAirplaneStartTime || '시간 선택'}
                                        </Text>
                                    </Pressable>
                                    {visibleAirplaneStartTimeError ? (
                                        <Text style={styles.fieldError}>{visibleAirplaneStartTimeError}</Text>
                                    ) : null}
                                </View>
                                <View style={styles.fieldColumn}>
                                    <Text style={styles.fieldLabel}>도착 시간</Text>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={isSaving}
                                        onPress={() => {
                                            setActiveAirportField(null);
                                            setActiveAirplaneTimePicker('end');
                                        }}
                                        style={({ pressed }) => [
                                            styles.timePickerButton,
                                            visibleAirplaneEndTimeError || visibleAirplaneDurationError ? styles.textInputError : null,
                                            pressed && !isSaving ? styles.buttonPressed : null
                                        ]}
                                    >
                                        <Text style={styles.timePickerButtonText}>
                                            {normalizedAirplaneEndTime || '시간 선택'}
                                        </Text>
                                    </Pressable>
                                    {visibleAirplaneEndTimeError ? (
                                        <Text style={styles.fieldError}>{visibleAirplaneEndTimeError}</Text>
                                    ) : null}
                                </View>
                            </View>

                            <View style={styles.summaryCard}>
                                <View style={styles.summaryHeaderRow}>
                                    <Text style={styles.summaryLabel}>
                                        {airplaneDurationInfo.usedTimeZones ? '시차 포함 자동 계산' : '입력 시간 기준 계산'}
                                    </Text>
                                    {airplaneDurationInfo.arrivalDayOffset > 0 ? (
                                        <View style={styles.summaryMetaBadge}>
                                            <Text style={styles.summaryMetaBadgeText}>
                                                +{airplaneDurationInfo.arrivalDayOffset}일 도착
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                                <Text style={styles.summaryValue}>
                                    {autoAirplaneDurationMinutes && autoAirplaneDurationMinutes > 0
                                        ? formatDuration(autoAirplaneDurationMinutes)
                                        : '--'}
                                </Text>
                                {(departureAirport || arrivalAirport) ? (
                                    <View style={styles.summaryMetaRow}>
                                        {departureAirport ? (
                                            <View style={styles.summaryMetaChip}>
                                                <Text style={styles.summaryMetaChipText}>
                                                    {departureAirport.code} · {formatTimeZoneOffsetLabel(departureAirport.timeZone, route.params.dayDate)}
                                                </Text>
                                            </View>
                                        ) : null}
                                        {arrivalAirport ? (
                                            <View style={styles.summaryMetaChip}>
                                                <Text style={styles.summaryMetaChipText}>
                                                    {arrivalAirport.code} · {formatTimeZoneOffsetLabel(arrivalAirport.timeZone, route.params.dayDate)}
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>
                                ) : null}
                                {visibleAirplaneDurationError ? (
                                    <Text style={styles.fieldError}>{visibleAirplaneDurationError}</Text>
                                ) : null}
                            </View>

                            <View style={styles.fieldRow}>
                                <View style={styles.fieldColumn}>
                                    <Text style={styles.fieldLabel}>항공편</Text>
                                    <TextInput
                                        value={airplaneFlightNumber}
                                        onChangeText={(value) => {
                                            setAirplaneFlightNumber(value);
                                            if (saveError) {
                                                setSaveError(null);
                                            }
                                        }}
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
                                        value={airplaneBookingRef}
                                        onChangeText={(value) => {
                                            setAirplaneBookingRef(value);
                                            if (saveError) {
                                                setSaveError(null);
                                            }
                                        }}
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
                                        value={airplaneTerminal}
                                        onChangeText={(value) => {
                                            setAirplaneTerminal(value);
                                            if (saveError) {
                                                setSaveError(null);
                                            }
                                        }}
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
                                        value={airplaneGate}
                                        onChangeText={(value) => {
                                            setAirplaneGate(value);
                                            if (saveError) {
                                                setSaveError(null);
                                            }
                                        }}
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
                        </View>
                    ) : null}

                    <View style={styles.fieldBlock}>
                        <Text style={styles.fieldLabel}>{noteLabel}</Text>
                        <TextInput
                            value={note}
                            onChangeText={(value) => {
                                setNote(value);
                                if (saveError) {
                                    setSaveError(null);
                                }
                            }}
                            onFocus={createFocusHandler()}
                            placeholder={notePlaceholder}
                            placeholderTextColor={theme.colors.textSecondary}
                            multiline
                            textAlignVertical="top"
                            editable={!isSaving}
                            style={[
                                styles.textArea,
                                visibleNoteError ? styles.textAreaError : null
                            ]}
                        />
                        {visibleNoteError ? (
                            <Text style={styles.fieldError}>{visibleNoteError}</Text>
                        ) : null}
                    </View>
                </View>

                <View style={styles.formCard}>
                    <View style={styles.sectionHeaderRow}>
                        <View style={styles.sectionHeaderCopy}>
                            <Text style={styles.fieldLabel}>첨부파일</Text>
                            <Text style={styles.sectionHelpText}>
                                여행 계획당 최대 {MAX_TRIP_ATTACHMENT_COUNT}개, 파일당 {MAX_TRIP_ATTACHMENT_SIZE_LABEL}까지 가능해요.
                            </Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            disabled={isSaving || isDeleting || isPickingAttachment || remainingTripAttachmentCount < 1}
                            onPress={handleAddAttachmentDrafts}
                            style={({ pressed }) => [
                                styles.inlineActionButton,
                                (isPickingAttachment || remainingTripAttachmentCount < 1) ? styles.inlineActionButtonDisabled : null,
                                pressed && !isSaving && !isDeleting && !isPickingAttachment ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.inlineActionButtonText}>
                                {isPickingAttachment ? '선택 중...' : '첨부 추가'}
                            </Text>
                        </Pressable>
                    </View>

                    {attachmentDrafts.length > 0 ? (
                        <View style={styles.attachmentList}>
                            {attachmentDrafts.map((attachment) => {
                                const typeLabel = getAttachmentTypeLabel(attachment.mimeType);
                                const sizeLabel = formatFileSize(attachment.size);

                                return (
                                    <View key={attachment.id} style={styles.attachmentDraftCard}>
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => {
                                                handleOpenAttachmentDraft(attachment);
                                            }}
                                            style={({ pressed }) => [
                                                styles.attachmentDraftOpenArea,
                                                pressed ? styles.buttonPressed : null
                                            ]}
                                        >
                                            {attachment.previewUrl ? (
                                                <Image
                                                    source={{ uri: attachment.previewUrl }}
                                                    style={styles.attachmentPreviewImage}
                                                />
                                            ) : (
                                                <View style={styles.attachmentPreviewFallback}>
                                                    <Text style={styles.attachmentPreviewFallbackText}>{typeLabel}</Text>
                                                </View>
                                            )}
                                            <View style={styles.attachmentDraftCopy}>
                                                <Text numberOfLines={2} style={styles.attachmentDraftName}>
                                                    {attachment.name}
                                                </Text>
                                                <Text style={styles.attachmentDraftMeta}>
                                                    {[typeLabel, sizeLabel, attachment.asset ? '저장 예정' : '저장됨']
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </Text>
                                            </View>
                                        </Pressable>
                                        <Pressable
                                            accessibilityRole="button"
                                            disabled={isSaving || isDeleting}
                                            onPress={() => {
                                                handleRemoveAttachmentDraft(attachment.id);
                                            }}
                                            style={({ pressed }) => [
                                                styles.attachmentRemoveButton,
                                                pressed && !isSaving && !isDeleting ? styles.buttonPressed : null
                                            ]}
                                        >
                                            <Text style={styles.attachmentRemoveButtonText}>삭제</Text>
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <View style={styles.emptyStateCard}>
                            <Text style={styles.emptyStateTitle}>첨부파일이 없어요.</Text>
                        </View>
                    )}
                </View>

                {canManageExtras ? (
                    <View style={styles.formCard}>
                        <View style={styles.sectionHeaderRow}>
                            <View style={styles.sectionHeaderCopy}>
                                <Text style={styles.fieldLabel}>추억</Text>
                                <Text style={styles.sectionHelpText}>
                                    사진 추억을 남겨 둘 수 있어요.
                                </Text>
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving || isDeleting}
                                onPress={() => {
                                    setMemoryComposerVisible(true);
                                }}
                                style={({ pressed }) => [
                                    styles.inlineActionButton,
                                    pressed && !isSaving && !isDeleting ? styles.buttonPressed : null
                                ]}
                            >
                                <Text style={styles.inlineActionButtonText}>추억 추가</Text>
                            </Pressable>
                        </View>

                        {memoryPreviewEntries.length > 0 ? (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.memoryPreviewRow}
                            >
                                {memoryPreviewEntries.map((memory, index) => (
                                    <View
                                        key={memory.id}
                                        style={[
                                            styles.memoryPreviewCard,
                                            index < memoryPreviewEntries.length - 1 ? styles.memoryPreviewCardSpaced : null
                                        ]}
                                    >
                                        {memory.previewUrl ? (
                                            <Image source={{ uri: memory.previewUrl }} style={styles.memoryPreviewImage} />
                                        ) : (
                                            <View style={styles.memoryPreviewFallback}>
                                                <Text style={styles.memoryPreviewFallbackText}>사진</Text>
                                            </View>
                                        )}
                                        <Text style={styles.memoryPreviewPlaceholder}>사진 추억</Text>
                                        <View style={styles.memoryPreviewFooter}>
                                            <Text style={styles.memoryPreviewMeta}>
                                                {memory.isPending ? '저장 예정' : '기존 추억'}
                                            </Text>
                                            {memory.isPending ? (
                                                <Pressable
                                                    accessibilityRole="button"
                                                    disabled={isSaving}
                                                    onPress={() => {
                                                        handleRemovePendingMemory(memory.id);
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.memoryRemoveButton,
                                                        pressed && !isSaving ? styles.buttonPressed : null
                                                    ]}
                                                >
                                                    <Text style={styles.memoryRemoveButtonText}>제거</Text>
                                                </Pressable>
                                            ) : null}
                                        </View>
                                    </View>
                                ))}
                            </ScrollView>
                        ) : null}
                    </View>
                ) : null}

                {canManageExtras ? (
                    <View style={styles.formCard}>
                        <View style={styles.sectionHeaderRow}>
                            <View style={styles.sectionHeaderCopy}>
                                <Text style={styles.fieldLabel}>예산 / 지출</Text>
                                <Text style={styles.sectionHelpText}>
                                    {hasRecentExpenseDraft
                                        ? '방금 추가한 지출이 아래 내역과 총액에 반영됐어요.'
                                        : '항목별로 기록해 두면 총액이 함께 계산돼요.'}
                                </Text>
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving || isDeleting}
                                onPress={handleAddExpenseDraft}
                                style={({ pressed }) => [
                                    styles.inlineActionButton,
                                    pressed && !isSaving && !isDeleting ? styles.buttonPressed : null
                                ]}
                            >
                                <Text style={styles.inlineActionButtonText}>내역 추가</Text>
                            </Pressable>
                        </View>

                        {expenseDrafts.length > 0 ? (
                            <View style={styles.expenseDraftList}>
                                {expenseDrafts.map((draft) => (
                                    <View
                                        key={draft.id}
                                        style={[
                                            styles.expenseDraftCard,
                                            draft.id === recentExpenseDraftId ? styles.expenseDraftCardRecent : null
                                        ]}
                                    >
                                        {draft.id === recentExpenseDraftId ? (
                                            <View style={styles.expenseDraftRecentBadge}>
                                                <Text style={styles.expenseDraftRecentBadgeText}>방금 추가됨</Text>
                                            </View>
                                        ) : null}
                                        <TextInput
                                            value={draft.description}
                                            onChangeText={(value) => {
                                                handleChangeExpenseDraft(draft.id, 'description', value);
                                            }}
                                            onFocus={createFocusHandler()}
                                            editable={!isSaving}
                                            placeholder="예: 입장권, 식사, 교통"
                                            placeholderTextColor={theme.colors.textSecondary}
                                            style={styles.textInput}
                                        />
                                        <View style={styles.expenseDraftFooter}>
                                            <View style={styles.expenseAmountField}>
                                                <Text style={styles.expenseAmountPrefix}>
                                                    {normalizeExpenseCurrency(draft.currency)}
                                                </Text>
                                                <TextInput
                                                    value={formatAmountInput(draft.amountInput)}
                                                    onChangeText={(value) => {
                                                        handleChangeExpenseDraft(draft.id, 'amountInput', value);
                                                    }}
                                                    onFocus={createFocusHandler()}
                                                    editable={!isSaving}
                                                    keyboardType="number-pad"
                                                    placeholder="0"
                                                    placeholderTextColor={theme.colors.textSecondary}
                                                    style={styles.expenseAmountInput}
                                                />
                                            </View>
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={isSaving}
                                                onPress={() => {
                                                    handleRemoveExpenseDraft(draft.id);
                                                }}
                                                style={({ pressed }) => [
                                                    styles.expenseRemoveButton,
                                                    pressed && !isSaving ? styles.buttonPressed : null
                                                ]}
                                            >
                                                <Text style={styles.expenseRemoveButtonText}>삭제</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : null}

                        {visibleExpenseError ? (
                            <Text style={styles.fieldError}>{visibleExpenseError}</Text>
                        ) : null}

                        <View style={styles.expenseSummaryRow}>
                            <Text style={styles.expenseSummaryLabel}>총 지출</Text>
                            <Text style={styles.expenseSummaryValue}>{formatWon(expenseTotal)}</Text>
                        </View>
                    </View>
                ) : null}

                {saveError ? (
                    <View style={[styles.statusCard, styles.statusCardWarning]}>
                        <Text style={styles.statusText}>{saveError}</Text>
                        {saveSupportText ? (
                            <Text style={styles.statusSupportText}>{saveSupportText}</Text>
                        ) : null}
                        {canRetrySession ? (
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => {
                                    void refreshSession();
                                }}
                                style={({ pressed }) => [
                                    styles.secondaryButton,
                                    pressed ? styles.secondaryButtonPressed : null
                                ]}
                            >
                                <Text style={styles.secondaryButtonText}>세션 다시 확인</Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}

                {reminderUi.visible ? (
                    <View style={styles.statusCard}>
                        <Text style={styles.statusText}>알림</Text>
                        <Text style={styles.statusSupportText}>{reminderUi.body}</Text>
                        {reminderUi.support ? (
                            <Text style={styles.statusSupportText}>{reminderUi.support}</Text>
                        ) : null}
                        {reminderUi.buttonLabel ? (
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving || isDeleting || isReminderSaving}
                                onPress={() => {
                                    setReminderEnabledDraft((current) => !current);
                                }}
                                style={({ pressed }) => [
                                    reminderEnabledDraft ? styles.secondaryActionButtonDanger : styles.secondaryButton,
                                    pressed && !isSaving && !isDeleting && !isReminderSaving
                                        ? styles.secondaryButtonPressed
                                        : null
                                ]}
                            >
                                <Text
                                    style={reminderEnabledDraft
                                        ? styles.secondaryActionButtonDangerText
                                        : styles.secondaryButtonText}
                                >
                                    {isReminderSaving ? '알림 처리 중...' : reminderUi.buttonLabel}
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}

                <DebugInfoCard
                    screen="TimelineItemEdit"
                    dataState={isSaving || isDeleting ? 'saving' : saveError ? 'save-error' : hasChanges ? 'editing' : 'ready'}
                    lastDataError={saveError}
                />
                    </ScrollView>
                </Animated.View>
            </KeyboardAvoidingView>

            <TimePickerModal
                visible={isTimePickerVisible}
                value={normalizedTime || time || '09:00'}
                onClose={() => {
                    setIsTimePickerVisible(false);
                }}
                onConfirm={(nextValue) => {
                    setTime(nextValue);
                    setIsTimePickerVisible(false);
                    if (saveError) {
                        setSaveError(null);
                    }
                }}
            />
            <DurationPickerModal
                visible={isDurationPickerVisible}
                value={String(durationMinutes)}
                onClose={() => {
                    setDurationPickerVisible(false);
                }}
                onConfirm={(nextValue) => {
                    setDurationMinutes(normalizeDurationMinutes(Number(nextValue)));
                    setDurationPickerVisible(false);
                    if (saveError) {
                        setSaveError(null);
                    }
                }}
            />
            <TimePickerModal
                visible={Boolean(activeAirplaneTimePicker)}
                value={
                    activeAirplaneTimePicker === 'end'
                        ? (normalizedAirplaneEndTime || airplaneEndTime || route.params.initialInput.endTime || '09:30')
                        : (normalizedAirplaneStartTime || time || route.params.initialInput.time || '09:00')
                }
                onClose={() => {
                    setActiveAirplaneTimePicker(null);
                }}
                onConfirm={(nextValue) => {
                    if (activeAirplaneTimePicker === 'end') {
                        setAirplaneEndTime(nextValue);
                    } else {
                        setTime(nextValue);
                    }
                    setActiveAirplaneTimePicker(null);
                    if (saveError) {
                        setSaveError(null);
                    }
                }}
            />

            <TimelineItemComposerModal
                visible={isPlaceComposerVisible}
                mode="edit"
                dayLabel={route.params.dayLabel}
                dayDate={route.params.dayDate}
                defaultTime={normalizedTime || time || '09:00'}
                initialMapCenter={placeComposerMapCenter}
                initialMapQuery={placeComposerMapQuery}
                initialDraft={placeComposerInitialDraft}
                isSaving={isSaving || isDeleting}
                onClose={handleClosePlaceComposer}
                onSubmit={handleSubmitPlaceComposer}
            />

            <BudgetExpenseComposerModal
                visible={isExpenseComposerVisible}
                dayLabel={route.params.dayLabel}
                dayDate={route.params.dayDate}
                itemOptions={expenseComposerOptions}
                selectedItemId={route.params.itemId}
                description={expenseComposerDescription}
                amount={expenseComposerAmount}
                currency={expenseComposerCurrency}
                isItemSelectionLocked
                isSaving={isSaving || isDeleting}
                onClose={handleCloseExpenseComposer}
                onDescriptionChange={setExpenseComposerDescription}
                onAmountChange={setExpenseComposerAmount}
                onCurrencyChange={setExpenseComposerCurrency}
                onSubmit={handleSubmitExpenseComposer}
            />

            <TimelineMemoryComposerModal
                visible={isMemoryComposerVisible}
                dayLabel={route.params.dayLabel}
                dayDate={route.params.dayDate}
                targetTitle={normalizedTitle || route.params.itemTitle || route.params.dayLabel}
                isSaving={isSaving}
                errorMessage={saveError}
                onClose={() => {
                    setMemoryComposerVisible(false);
                }}
                onSubmit={handleSubmitMemoryDraft}
            />
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    screenOverlay: {
        flex: 1,
        backgroundColor: 'transparent'
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.28)'
    },
    keyboardArea: {
        flex: 1,
        justifyContent: 'flex-end'
    },
    editSheet: {
        width: '100%',
        height: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        backgroundColor: theme.colors.background,
        overflow: 'hidden'
    },
    editSheetHandleTouch: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 34,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    editSheetHandle: {
        width: 56,
        height: 6,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    content: {
        padding: theme.spacing.md,
        paddingBottom: theme.spacing.lg * 2
    },
    heroCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.sm
    },
    heroLabel: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.bold
    },
    heroTitle: {
        marginTop: theme.spacing.xs,
        fontSize: 22,
        lineHeight: 30,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold
    },
    heroMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary
    },
    formCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.sm
    },
    fieldBlock: {
        marginBottom: theme.spacing.sm
    },
    airplaneFormBlock: {
        marginBottom: theme.spacing.sm
    },
    fieldRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.sm
    },
    fieldColumn: {
        flex: 1
    },
    airportFieldRow: {
        zIndex: 20
    },
    airportFieldColumn: {
        zIndex: 20
    },
    locationSearchRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        marginTop: theme.spacing.xs,
        gap: theme.spacing.xs
    },
    fieldLabel: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.bold
    },
    textInput: {
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted,
        color: theme.colors.textPrimary
    },
    locationSearchInput: {
        flex: 1,
        marginTop: 0
    },
    locationDisplayButton: {
        minHeight: 48,
        justifyContent: 'center'
    },
    locationDisplayText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    locationDisplayPlaceholder: {
        color: theme.colors.textSecondary
    },
    locationSearchButton: {
        minWidth: 64,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    locationSearchButtonText: {
        color: '#fff',
        fontFamily: theme.fonts.bold
    },
    timePickerButton: {
        marginTop: theme.spacing.xs,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    timePickerButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    textArea: {
        minHeight: 180,
        marginTop: theme.spacing.xs,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted,
        color: theme.colors.textPrimary,
        lineHeight: 22
    },
    textAreaError: {
        borderColor: theme.mode === 'dark' ? '#d17b7b' : '#d25a5a'
    },
    textInputError: {
        borderColor: theme.mode === 'dark' ? '#d17b7b' : '#d25a5a'
    },
    fieldError: {
        marginTop: theme.spacing.micro,
        color: theme.mode === 'dark' ? '#f0b0b0' : '#c44848'
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
    summaryCard: {
        marginBottom: theme.spacing.sm,
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
    searchStateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: theme.spacing.xs
    },
    searchStateText: {
        marginLeft: theme.spacing.micro,
        color: theme.colors.textSecondary
    },
    suggestionList: {
        marginTop: theme.spacing.xs,
        borderRadius: theme.radius.md,
        overflow: 'hidden'
    },
    suggestionItem: {
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    suggestionTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    suggestionSubtitle: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18
    },
    placePreviewCard: {
        marginTop: theme.spacing.xs,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    placePreviewTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    placePreviewAddress: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    locationMetaText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.sm
    },
    sectionHeaderCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    sectionHelpText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    inlineActionButton: {
        alignSelf: 'flex-start',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    inlineActionButtonDisabled: {
        opacity: 0.45
    },
    inlineActionButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    attachmentList: {
        gap: theme.spacing.xs
    },
    attachmentDraftCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    attachmentDraftOpenArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    attachmentPreviewImage: {
        width: 56,
        height: 56,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.border
    },
    attachmentPreviewFallback: {
        width: 56,
        height: 56,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background
    },
    attachmentPreviewFallbackText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    attachmentDraftCopy: {
        flex: 1
    },
    attachmentDraftName: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold,
        lineHeight: 20
    },
    attachmentDraftMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16
    },
    attachmentRemoveButton: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.warningSoft
    },
    attachmentRemoveButtonText: {
        color: theme.colors.warning,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    memoryPreviewRow: {
        paddingRight: theme.spacing.xs
    },
    memoryPreviewCard: {
        width: 176,
        padding: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    memoryPreviewCardSpaced: {
        marginRight: theme.spacing.xs
    },
    memoryPreviewImage: {
        width: '100%',
        height: 132,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.border
    },
    memoryPreviewFallback: {
        width: '100%',
        height: 132,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background
    },
    memoryPreviewFallbackText: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold
    },
    memoryPreviewComment: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        lineHeight: 20
    },
    memoryPreviewPlaceholder: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary
    },
    memoryPreviewFooter: {
        marginTop: theme.spacing.xs,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    memoryPreviewMeta: {
        color: theme.colors.textSecondary,
        fontSize: 12
    },
    memoryRemoveButton: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.warningSoft
    },
    memoryRemoveButtonText: {
        color: theme.colors.warning,
        fontFamily: theme.fonts.semibold,
        fontSize: 12
    },
    emptyStateCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    emptyStateTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    emptyStateSupport: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    expenseDraftList: {
        marginTop: theme.spacing.xs
    },
    expenseDraftCard: {
        padding: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        marginBottom: theme.spacing.xs
    },
    expenseDraftCardRecent: {
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    expenseDraftRecentBadge: {
        alignSelf: 'flex-start',
        minHeight: 24,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accent
    },
    expenseDraftRecentBadgeText: {
        color: '#ffffff',
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.bold
    },
    expenseDraftFooter: {
        marginTop: theme.spacing.xs,
        flexDirection: 'row',
        alignItems: 'center'
    },
    expenseAmountField: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.sm
    },
    expenseAmountPrefix: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold,
        marginRight: theme.spacing.micro
    },
    expenseAmountInput: {
        flex: 1,
        paddingVertical: theme.spacing.xs,
        color: theme.colors.textPrimary,
        textAlign: 'right'
    },
    expenseRemoveButton: {
        marginLeft: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.warningSoft
    },
    expenseRemoveButtonText: {
        color: theme.colors.warning,
        fontFamily: theme.fonts.semibold
    },
    expenseSummaryRow: {
        marginTop: theme.spacing.xs,
        paddingTop: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    expenseSummaryLabel: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold
    },
    expenseSummaryValue: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.bold,
        fontSize: 20
    },
    buttonPressed: {
        opacity: 0.88
    },
    statusCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        marginBottom: theme.spacing.sm
    },
    statusCardWarning: {
        backgroundColor: theme.mode === 'dark' ? '#342a16' : '#fff6cf'
    },
    statusText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    statusSupportText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    secondaryButton: {
        alignSelf: 'flex-start',
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    secondaryButtonPressed: {
        opacity: 0.88
    },
    secondaryButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    secondaryActionButtonDanger: {
        alignSelf: 'flex-start',
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.warningSoft
    },
    secondaryActionButtonDangerText: {
        color: theme.colors.warning,
        fontFamily: theme.fonts.semibold
    },
    actionRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.micro,
        paddingBottom: theme.spacing.xs,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    secondaryAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 36,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    secondaryActionDisabled: {
        opacity: 0.55
    },
    secondaryActionPressed: {
        opacity: 0.88
    },
    secondaryActionText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    primaryAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 36,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accent
    },
    primaryActionDisabled: {
        opacity: 0.4
    },
    primaryActionPressed: {
        opacity: 0.88
    },
    primaryActionText: {
        color: '#ffffff',
        fontSize: 13,
        fontFamily: theme.fonts.bold
    },
    deleteAction: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 36,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.warningSoft
    },
    deleteActionPressed: {
        opacity: 0.88
    },
    deleteActionDisabled: {
        opacity: 0.55
    },
    deleteActionText: {
        color: theme.colors.warning,
        fontSize: 13,
        fontFamily: theme.fonts.bold
    }
});
