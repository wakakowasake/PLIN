import { formatDuration } from '@shared/core/utils/time-value-helpers.js';
import { buildExpenseDetailState } from '@shared/features/expenses/expense-detail-flow.js';
import {
    calculateExpenseTotal,
    getExpenseAmount,
    getExpenseDescription,
    getExpenseDisplayTitle
} from '@shared/features/expenses/expense-helpers.js';
import { getTimelineItemCategoryCode } from '@shared/features/timeline/timeline-item-helpers.js';
import {
    getTripSubInfoPrefix
} from '@shared/features/trip-info/trip-info-helpers.js';
import {
    getTransitTypeMeta,
    parseTransitDurationValue
} from '@shared/features/transit/transit-item-helpers.js';
import { calculateFlightDurationValue } from '@shared/features/transit/flight-time-helpers.js';

import { logImageBoundary } from '@/dev/image-diagnostics';
import type {
    CanonicalTripDay,
    CanonicalTripDocument,
    CanonicalTripItem,
    CanonicalTripMemberRole,
    MobileAttachmentDisplayEntry,
    MobileBudgetSummary,
    MobileExpenseDisplayEntry,
    MobileMemoryDisplayEntry,
    MobileTransitDetailedStep,
    MobileTimelineDisplayItem,
    MobileTripListItem,
    MobileTransitRouteChip,
    MobileTripDaySection,
    MobileTripDetail,
    MobileTripInfoInput,
    RawAttachmentEntry,
    RawTripListItem
} from '@/types/trip';

const CATEGORY_LABELS: Record<string, string> = {
    meal: '식사',
    culture: '문화',
    sightseeing: '관광',
    shopping: '쇼핑',
    accommodation: '숙소',
    custom: '기타'
};

const EXPENSE_CURRENCY_SYMBOLS: Record<string, string> = {
    KRW: '₩',
    USD: '$',
    EUR: '€',
    JPY: '¥',
    CNY: '¥',
    HKD: 'HK$',
    TWD: 'NT$',
    GBP: '£',
    CAD: 'CA$',
    AUD: 'A$',
    NZD: 'NZ$',
    SGD: 'S$',
    THB: '฿',
    VND: '₫',
    PHP: '₱',
    IDR: 'Rp',
    MYR: 'RM',
    INR: '₹',
    CHF: 'CHF',
    AED: 'AED',
    SAR: 'SAR',
    TRY: '₺',
    MXN: 'MX$',
    BRL: 'R$'
};

function readTripContentVersion(sourceData?: Record<string, unknown> | null) {
    const parsed = Number(sourceData?.contentVersion);

    if (!Number.isFinite(parsed) || parsed < 1) {
        return 1;
    }

    return Math.floor(parsed);
}

type SharedExpenseState = {
    totalExpense?: number;
    expensesByDay?: Array<{
        dayIdx?: number;
        total?: number;
        expenses?: unknown[];
    }>;
};

function buildFallbackDayCount(daysLength: number) {
    if (!daysLength) {
        return '일정 미정';
    }

    if (daysLength === 1) {
        return '당일치기';
    }

    return `${daysLength - 1}박 ${daysLength}일`;
}

function buildFallbackSubInfo(trip: CanonicalTripDocument) {
    const dayDates = (trip.days || [])
        .map((day) => String(day?.date || '').trim())
        .filter(Boolean);

    if (dayDates.length === 0) {
        return '여행 정보 준비 중';
    }

    if (dayDates.length === 1) {
        return dayDates[0];
    }

    return `${dayDates[0]} - ${dayDates[dayDates.length - 1]}`;
}

function parseDateOnly(value: string) {
    const safeValue = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
        return null;
    }

    const parsed = new Date(`${safeValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

function getTripDateRange(trip: CanonicalTripDocument) {
    const dates = (trip.days || [])
        .map((day) => String(day?.date || '').trim())
        .filter(Boolean);

    return {
        startDate: dates[0] || '',
        endDate: dates[dates.length - 1] || ''
    };
}

function resolveDisplayTripStatus(trip: CanonicalTripDocument) {
    const range = getTripDateRange(trip);
    const endDate = String(trip?.meta?.endDate || range.endDate || '').trim();
    const parsed = parseDateOnly(endDate);

    if (!parsed) {
        return trip?.meta?.status === 'completed' ? 'completed' : 'planning';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return today > parsed ? 'completed' : 'planning';
}

function buildTripEditInfo(trip: CanonicalTripDocument, subInfo: string): MobileTripInfoInput {
    const range = {
        startDate: String(trip?.meta?.startDate || getTripDateRange(trip).startDate || '').trim(),
        endDate: String(trip?.meta?.endDate || getTripDateRange(trip).endDate || '').trim()
    };
    const location = String(trip?.meta?.location || getTripSubInfoPrefix(subInfo) || '').trim();

    return {
        title: String(trip?.meta?.title || '').trim(),
        location,
        startDate: range.startDate,
        endDate: range.endDate,
        coverImage: typeof trip?.meta?.coverImage === 'string' && trip.meta.coverImage.trim()
            ? trip.meta.coverImage.trim()
            : null
    };
}

function findCoverImage(trip: CanonicalTripDocument) {
    if (typeof trip?.meta?.coverImage === 'string' && trip.meta.coverImage.trim()) {
        return trip.meta.coverImage;
    }

    if (typeof trip?.meta?.mapImage === 'string' && trip.meta.mapImage.trim()) {
        return trip.meta.mapImage;
    }

    for (const day of trip?.days || []) {
        for (const item of day.items || []) {
            if (typeof item.image === 'string' && item.image.trim()) {
                return item.image;
            }
        }
    }

    return null;
}

function getTimelinePhotoPreviewUrls(item: CanonicalTripItem) {
    const uniqueUrls = new Set<string>();

    if (typeof item.image === 'string' && item.image.trim()) {
        uniqueUrls.add(item.image.trim());
    }

    for (const memory of item.memories || []) {
        if (typeof memory.photoUrl === 'string' && memory.photoUrl.trim()) {
            uniqueUrls.add(memory.photoUrl.trim());
        }
    }

    return Array.from(uniqueUrls).slice(0, 12);
}

function getTripPhotoPreviewData(trip: CanonicalTripDocument) {
    const uniqueUrls = new Set<string>();

    for (const day of trip.days || []) {
        for (const item of day.items || []) {
            for (const url of getTimelinePhotoPreviewUrls(item)) {
                uniqueUrls.add(url);
            }
        }
    }

    const urls = Array.from(uniqueUrls);

    return {
        photoPreviewUrls: urls.slice(0, 3),
        photoGalleryUrls: urls,
        photoCount: urls.length
    };
}

function formatWon(amount: number) {
    return `₩${Math.round(amount).toLocaleString()}`;
}

function normalizeExpenseCurrency(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized || 'KRW';
}

function formatExpenseAmount(amount: number, currencyValue: unknown) {
    const currency = normalizeExpenseCurrency(currencyValue);
    if (currency === 'KRW') {
        return formatWon(amount);
    }

    const symbol = EXPENSE_CURRENCY_SYMBOLS[currency] || currency;
    const amountText = Math.round(amount).toLocaleString();
    return symbol === currency
        ? `${currency} ${amountText}`
        : `${currency} ${symbol}${amountText}`;
}

function resolveItemExpenseAmount(item: CanonicalTripItem) {
    if (Array.isArray(item.expenses) && item.expenses.length > 0) {
        return calculateExpenseTotal(item.expenses);
    }

    if (typeof item.budget === 'number' && Number.isFinite(item.budget) && item.budget > 0) {
        return item.budget;
    }

    return 0;
}

function resolveItemExpenseSummaryLabel(item: CanonicalTripItem) {
    const total = resolveItemExpenseAmount(item);
    if (total <= 0) {
        return '';
    }

    return `비용 ${formatWon(total)}`;
}

function mapMemoryEntries(item: CanonicalTripItem, itemIndex: number): MobileMemoryDisplayEntry[] {
    return (item.memories || []).reduce<MobileMemoryDisplayEntry[]>((entries, memory, memoryIndex) => {
            const photoUrl = typeof memory.photoUrl === 'string' && memory.photoUrl.trim()
                ? memory.photoUrl.trim()
                : null;
            const createdAt = String(memory.createdAt || '').trim();

            if (!photoUrl) {
                return entries;
            }

            entries.push({
                id: `memory-${itemIndex}-${memoryIndex}`,
                photoUrl,
                comment: '',
                createdAt
            });

            return entries;
        }, []);
}

function mapExpenseItems(
    item: CanonicalTripItem,
    timeline: CanonicalTripItem[],
    itemIndex: number
): MobileExpenseDisplayEntry[] {
    const mappedExpenses = (item.expenses || [])
        .map((expense, expenseIndex): MobileExpenseDisplayEntry | null => {
            const amount = getExpenseAmount(expense);
            if (amount <= 0) {
                return null;
            }

            const currency = normalizeExpenseCurrency(expense.currency);

            return {
                id: `expense-${itemIndex}-${expenseIndex}`,
                title: String(getExpenseDisplayTitle(item, timeline, itemIndex, expense) || item.title || '').trim(),
                description: String(getExpenseDescription(expense) || '내역 없음').trim(),
                amount,
                currency,
                amountLabel: formatExpenseAmount(amount, currency)
            };
        })
        .filter((entry): entry is MobileExpenseDisplayEntry => Boolean(entry));

    if (mappedExpenses.length > 0) {
        return mappedExpenses;
    }

    if (typeof item.budget === 'number' && Number.isFinite(item.budget) && item.budget > 0) {
        return [{
            id: `expense-${itemIndex}-budget`,
            title: String(item.title || '').trim(),
            description: '예산',
            amount: item.budget,
            amountLabel: formatWon(item.budget)
        }];
    }

    return [];
}

function inferAttachmentKind(attachment: RawAttachmentEntry) {
    const mimeType = String(attachment.type || '').trim().toLowerCase();
    const source = `${mimeType} ${String(attachment.url || '')} ${String(attachment.name || '')}`.toLowerCase();

    if (mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif)(\?|#|$)/.test(source)) {
        return 'image' as const;
    }

    if (mimeType === 'application/pdf' || /\.pdf(\?|#|$)/.test(source)) {
        return 'pdf' as const;
    }

    return 'file' as const;
}

function buildAttachmentName(attachment: RawAttachmentEntry, attachmentIndex: number) {
    const explicitName = String(attachment.name || '').trim();
    if (explicitName) {
        return explicitName;
    }

    const url = String(attachment.url || '').trim();
    if (url) {
        const lastSegment = url.split('/').pop() || '';
        let decoded = lastSegment.split('?')[0] || '';

        try {
            decoded = decodeURIComponent(decoded);
        } catch {}

        decoded = decoded.trim();
        if (decoded) {
            return decoded;
        }
    }

    return `첨부 파일 ${attachmentIndex + 1}`;
}

function mapAttachmentEntries(item: CanonicalTripItem, itemIndex: number): MobileAttachmentDisplayEntry[] {
    return (item.attachments || []).reduce<MobileAttachmentDisplayEntry[]>((entries, attachment, attachmentIndex) => {
        const url = String(attachment.url || '').trim();
        if (!url) {
            return entries;
        }

        const kind = inferAttachmentKind(attachment);
        const mimeType = String(attachment.type || '').trim().toLowerCase();

        entries.push({
            id: `attachment-${itemIndex}-${attachmentIndex}`,
            name: buildAttachmentName(attachment, attachmentIndex),
            url,
            previewUrl: kind === 'image'
                ? String(attachment.previewUrl || attachment.url || '').trim() || null
                : null,
            mimeType,
            kind,
            typeLabel: kind === 'image' ? '이미지' : kind === 'pdf' ? 'PDF' : '파일'
        });

        return entries;
    }, []);
}

function buildBudgetSummary(trip: CanonicalTripDocument, expenseState: SharedExpenseState): MobileBudgetSummary | null {
    const totalExpense = Number(expenseState.totalExpense || 0);
    const entryCount = (expenseState.expensesByDay || []).reduce((sum, day) => {
        return sum + (Array.isArray(day.expenses) ? day.expenses.length : 0);
    }, 0);
    const daysWithExpenseCount = (expenseState.expensesByDay || []).filter((day) => {
        return Number(day.total || 0) > 0;
    }).length;

    if (totalExpense > 0) {
        return {
            totalAmount: totalExpense,
            totalLabel: formatWon(totalExpense),
            caption: '일정에 기록된 비용 합계',
            entryCount,
            daysWithExpenseCount
        };
    }

    if (typeof trip.meta?.budget === 'number' && Number.isFinite(trip.meta.budget) && trip.meta.budget > 0) {
        return {
            totalAmount: trip.meta.budget,
            totalLabel: formatWon(trip.meta.budget),
            caption: '여행 예산 정보 기준',
            entryCount,
            daysWithExpenseCount
        };
    }

    return null;
}

function mapTripListItems(source: unknown, prefix: string): MobileTripListItem[] {
    if (!Array.isArray(source)) {
        return [];
    }

    return source.reduce<MobileTripListItem[]>((entries, item, index) => {
        const safeItem = (item && typeof item === 'object' ? item : {}) as RawTripListItem;
        const text = String(safeItem.text || '').trim();

        if (!text) {
            return entries;
        }

        const location = String(safeItem.location || '').trim();
        const locationDetail = String(safeItem.locationDetail || '').trim();

        entries.push({
            id: `${prefix}-${index}`,
            text,
            checked: safeItem.checked === true,
            location: location || undefined,
            locationDetail: locationDetail || undefined
        });

        return entries;
    }, []);
}

function resolveDurationLabel(item: CanonicalTripItem) {
    if (typeof item.duration === 'number') {
        return formatDuration(item.duration);
    }

    if (typeof item.duration === 'string' && item.duration.trim()) {
        const parsed = parseTransitDurationValue(item.duration);
        return parsed > 0 ? formatDuration(parsed) : item.duration;
    }

    if (item.transit?.durationLabel) {
        const parsed = parseTransitDurationValue(item.transit.durationLabel);
        return parsed > 0 ? formatDuration(parsed) : item.transit.durationLabel;
    }

    if (item.isTransit && item.transitType === 'airplane') {
        const duration = calculateFlightDurationValue(
            String(item.flightInfo?.departureTime || item.transitInfo?.start || ''),
            String(item.flightInfo?.arrivalTime || item.transitInfo?.end || '')
        );

        if (duration) {
            return duration;
        }
    }

    return '';
}

function resolveBadgeLabel(item: CanonicalTripItem) {
    const explicitTag = String(item.tag || '').trim();
    if (explicitTag) {
        return explicitTag;
    }

    const categoryCode = String(getTimelineItemCategoryCode(item) || 'custom');
    return CATEGORY_LABELS[categoryCode] || '기타';
}

function resolveTransitWindowLabel(item: CanonicalTripItem) {
    const start = String(item.transit?.start || item.transitInfo?.start || item.transitInfo?.depTime || '').trim();
    const end = String(item.transit?.end || item.transitInfo?.end || item.transitInfo?.arrTime || '').trim();

    if (start && end) {
        return `${start} - ${end}`;
    }

    return start || end;
}

function mapTransitRouteChips(item: CanonicalTripItem): MobileTransitRouteChip[] {
    const rawItem = item as CanonicalTripItem & {
        detailedSteps?: unknown[];
    };
    const detailedSteps = Array.isArray(rawItem.detailedSteps) ? rawItem.detailedSteps : [];
    const chips: Array<MobileTransitRouteChip & { isWalk: boolean }> = [];
    const seen = new Set<string>();

    for (const entry of detailedSteps) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const step = entry as Record<string, unknown>;
        const label = String(step.tag || '').trim();
        if (!label) {
            continue;
        }

        const type = String(step.type || '').trim();
        const key = `${type}:${label}`;
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        chips.push({
            label,
            color: typeof step.color === 'string' ? step.color : null,
            textColor: typeof step.textColor === 'string' ? step.textColor : null,
            icon: typeof step.icon === 'string' ? step.icon : '',
            type,
            isWalk: type === 'walk' || String(step.icon || '').trim() === 'directions_walk'
        });
    }

    const nonWalkingChips = chips.filter((chip) => !chip.isWalk);
    const visibleChips = nonWalkingChips.length > 0 ? nonWalkingChips : chips;

    return visibleChips.slice(0, 5).map(({ isWalk: _isWalk, ...chip }) => chip);
}

function mapTransitDetailedSteps(item: CanonicalTripItem): MobileTransitDetailedStep[] {
    const rawItem = item as CanonicalTripItem & {
        detailedSteps?: unknown[];
    };
    const detailedSteps = Array.isArray(rawItem.detailedSteps) ? rawItem.detailedSteps : [];

    return detailedSteps.reduce<MobileTransitDetailedStep[]>((steps, entry) => {
        if (!entry || typeof entry !== 'object') {
            return steps;
        }

        const step = entry as Record<string, unknown>;
        const transitInfoValue = step.transitInfo;
        const transitInfo = transitInfoValue && typeof transitInfoValue === 'object'
            ? transitInfoValue as Record<string, unknown>
            : null;

        steps.push({
            title: String(step.title || '').trim(),
            time: String(step.time || '').trim(),
            note: String(step.note || '').trim(),
            icon: String(step.icon || '').trim(),
            tag: String(step.tag || '').trim(),
            type: String(step.type || '').trim(),
            color: typeof step.color === 'string' ? step.color : null,
            textColor: typeof step.textColor === 'string' ? step.textColor : null,
            transitInfo: transitInfo ? {
                depStop: String(transitInfo.depStop || '').trim(),
                arrStop: String(transitInfo.arrStop || '').trim(),
                start: String(transitInfo.start || '').trim(),
                end: String(transitInfo.end || '').trim(),
                headsign: String(transitInfo.headsign || '').trim(),
                lineName: String(transitInfo.lineName || '').trim(),
                lineSymbol: String(transitInfo.lineSymbol || '').trim(),
                lineCode: String(transitInfo.lineCode || '').trim(),
                numStops: typeof transitInfo.numStops === 'number' && Number.isFinite(transitInfo.numStops)
                    ? transitInfo.numStops
                    : typeof transitInfo.stopCount === 'number' && Number.isFinite(transitInfo.stopCount)
                        ? transitInfo.stopCount
                        : 0
            } : undefined
        });

        return steps;
    }, []);
}

function resolveCountryCode(rawItem: Record<string, unknown>) {
    const explicitCountryCode = String(rawItem.countryCode || '').trim().toUpperCase();
    if (explicitCountryCode) {
        return explicitCountryCode;
    }

    const addressComponents = Array.isArray(rawItem.address_components)
        ? rawItem.address_components
        : [];

    for (const entry of addressComponents) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const component = entry as { short_name?: unknown; types?: unknown };
        const types = Array.isArray(component.types) ? component.types : [];
        if (!types.includes('country')) {
            continue;
        }

        const shortName = String(component.short_name || '').trim().toUpperCase();
        if (shortName) {
            return shortName;
        }
    }

    return '';
}

function resolveTimelineTitle(item: CanonicalTripItem, fallbackTitle: string) {
    const title = String(item.title || '').trim();
    if (title) {
        return title;
    }

    const location = String(item.location || '').trim();
    if (location) {
        return location;
    }

    if (item.flightInfo?.departure && item.flightInfo?.arrival) {
        return `${item.flightInfo.departure} → ${item.flightInfo.arrival}`;
    }

    return fallbackTitle;
}

function mapTimelineItem(
    item: CanonicalTripItem,
    itemIndex: number,
    timeline: CanonicalTripItem[]
): MobileTimelineDisplayItem {
    const rawItem = item as CanonicalTripItem & {
        lat?: unknown;
        lng?: unknown;
        placeId?: unknown;
        countryCode?: unknown;
        address_components?: unknown;
    };
    const memoriesCount = Array.isArray(item.memories) ? item.memories.length : 0;
    const photoPreviewUrls = getTimelinePhotoPreviewUrls(item);
    const memoryEntries = mapMemoryEntries(item, itemIndex);
    const attachments = mapAttachmentEntries(item, itemIndex);
    const expenseSummaryLabel = resolveItemExpenseSummaryLabel(item);
    const expenseItems = mapExpenseItems(item, timeline, itemIndex);
    const expenseTotalAmount = expenseItems.reduce((sum, expense) => sum + expense.amount, 0);

    if (item.isTransit) {
        const meta = getTransitTypeMeta(String(item.transitType || 'walk'));
        const transitWindowLabel = resolveTransitWindowLabel(item);
        const transitRouteChips = mapTransitRouteChips(item);
        const transitDetailedSteps = mapTransitDetailedSteps(item);

        return {
            id: String(item.id || `item-${itemIndex}`),
            timeLabel: transitWindowLabel || String(item.timeLabel || ''),
            title: resolveTimelineTitle(item, String(meta.title || '이동')),
            location: String(item.location || ''),
            badgeLabel: meta.tag,
            transitType: String(item.transitType || 'walk'),
            durationLabel: resolveDurationLabel(item),
            transitWindowLabel,
            note: String(item.note || ''),
            isTransit: true,
            memoriesCount,
            photoPreviewUrls,
            memoryEntries,
            attachments,
            expenseSummaryLabel,
            expenseTotalAmount,
            expenseItems,
            latitude: typeof rawItem.lat === 'number' && Number.isFinite(rawItem.lat) ? rawItem.lat : null,
            longitude: typeof rawItem.lng === 'number' && Number.isFinite(rawItem.lng) ? rawItem.lng : null,
            placeId: typeof rawItem.placeId === 'string' ? rawItem.placeId : '',
            countryCode: resolveCountryCode(rawItem),
            flightInfo: item.flightInfo || null,
            transitRouteChips,
            transitDetailedSteps
        };
    }

    return {
        id: String(item.id || `item-${itemIndex}`),
        timeLabel: String(item.timeLabel || ''),
        title: resolveTimelineTitle(item, '제목 없는 일정'),
        location: String(item.location || ''),
        badgeLabel: resolveBadgeLabel(item),
        transitType: '',
        durationLabel: resolveDurationLabel(item),
        transitWindowLabel: '',
        note: String(item.note || ''),
        isTransit: false,
        memoriesCount,
        photoPreviewUrls,
        memoryEntries,
        attachments,
        expenseSummaryLabel,
        expenseTotalAmount,
        expenseItems,
        latitude: typeof rawItem.lat === 'number' && Number.isFinite(rawItem.lat) ? rawItem.lat : null,
        longitude: typeof rawItem.lng === 'number' && Number.isFinite(rawItem.lng) ? rawItem.lng : null,
        placeId: typeof rawItem.placeId === 'string' ? rawItem.placeId : '',
        countryCode: resolveCountryCode(rawItem),
        flightInfo: null,
        transitRouteChips: [],
        transitDetailedSteps: []
    };
}

function buildExpenseSourceTrip(trip: CanonicalTripDocument) {
    return {
        meta: {
            budget: trip.meta?.budget ?? null
        },
        days: (trip.days || []).map((day) => ({
            date: day.date,
            timeline: (day.items || []).map((item) => ({
                title: item.title,
                isTransit: item.isTransit,
                budget: item.budget,
                expenses: item.expenses
            }))
        }))
    };
}

function mapDay(
    trip: CanonicalTripDocument,
    day: CanonicalTripDay,
    dayIndex: number,
    dayExpenseTotalByIndex: Map<number, number>,
    dayExpenseCountByIndex: Map<number, number>
): MobileTripDaySection {
    const expenseTotal = dayExpenseTotalByIndex.get(dayIndex) || 0;
    const expenseItemCount = dayExpenseCountByIndex.get(dayIndex) || 0;

    return {
        id: day.id || `${trip.id}-day-${dayIndex}`,
        label: `Day ${dayIndex + 1}`,
        date: String(day.date || '날짜 미정'),
        expenseTotalLabel: expenseTotal > 0 ? `비용 합계 ${formatWon(expenseTotal)}` : undefined,
        expenseItemCount: expenseItemCount > 0 ? expenseItemCount : undefined,
        items: Array.isArray(day.items)
            ? day.items.map((item, itemIndex) => (
                mapTimelineItem(item, itemIndex, day.items || [])
            ))
            : []
    };
}

function buildTripPermissions(trip: CanonicalTripDocument, userId?: string | null) {
    const safeUserId = String(userId || '').trim();
    const role: CanonicalTripMemberRole | '' = safeUserId
        ? (trip.membership.membersByUid[safeUserId] || '')
        : '';

    return {
        role,
        canEditContent: role === 'owner' || role === 'editor',
        canManageShare: role === 'owner' || role === 'editor',
        canSendAnnouncement: role === 'owner',
        canDeleteTrip: role === 'owner',
        canPublishCommunity: role === 'owner' || role === 'editor',
        canDuplicateTrip: Boolean(role)
    };
}

function normalizeDateTimeString(value: unknown) {
    const safeValue = typeof value === 'string' ? value.trim() : '';
    if (!safeValue) {
        return '';
    }

    const parsed = new Date(safeValue);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export function mapTripDetail(
    trip: CanonicalTripDocument,
    userId?: string | null,
    sourceData?: Record<string, unknown> | null
): MobileTripDetail {
    const expenseState = buildExpenseDetailState(buildExpenseSourceTrip(trip)) as SharedExpenseState;
    const dayExpenseTotalByIndex = new Map<number, number>();
    const dayExpenseCountByIndex = new Map<number, number>();

    for (const dayExpense of expenseState.expensesByDay || []) {
        const dayIndex = Number(dayExpense.dayIdx);
        const total = Number(dayExpense.total || 0);
        const count = Array.isArray(dayExpense.expenses) ? dayExpense.expenses.length : 0;

        if (Number.isFinite(dayIndex) && dayIndex >= 0 && total > 0) {
            dayExpenseTotalByIndex.set(dayIndex, total);
        }

        if (Number.isFinite(dayIndex) && dayIndex >= 0 && count > 0) {
            dayExpenseCountByIndex.set(dayIndex, count);
        }
    }

    const days = (trip?.days || [])
        .map((day, index) => mapDay(trip, day, index, dayExpenseTotalByIndex, dayExpenseCountByIndex));
    const subInfo = String(trip?.meta?.subInfo || buildFallbackSubInfo(trip));
    const locationLabel = String(trip?.meta?.location || getTripSubInfoPrefix(subInfo) || '').trim();
    const photoPreviewData = getTripPhotoPreviewData(trip);
    const shoppingList = mapTripListItems(sourceData?.shoppingList, 'shopping');
    const checklist = mapTripListItems(sourceData?.checklist, 'checklist');

    const detail: MobileTripDetail = {
        id: trip.id,
        title: String(trip?.meta?.title || '제목 없는 여행'),
        subInfo,
        locationLabel,
        dayCount: String(trip?.meta?.dayCount || buildFallbackDayCount(days.length)),
        createdAt: normalizeDateTimeString(sourceData?.createdAt) || undefined,
        updatedAt: normalizeDateTimeString(sourceData?.updatedAt) || undefined,
        contentVersion: readTripContentVersion(sourceData),
        coverImage: findCoverImage(trip),
        status: resolveDisplayTripStatus(trip),
        photoPreviewUrls: photoPreviewData.photoPreviewUrls,
        photoGalleryUrls: photoPreviewData.photoGalleryUrls,
        photoCount: photoPreviewData.photoCount,
        budgetSummary: buildBudgetSummary(trip, expenseState),
        days,
        shoppingList,
        checklist,
        editInfo: buildTripEditInfo(trip, subInfo),
        permissions: buildTripPermissions(trip, userId)
    };

    logImageBoundary('trip:mapper:detail', 'trip.meta.coverImage', detail.coverImage, {
        tripId: trip.id
    });

    return detail;
}
