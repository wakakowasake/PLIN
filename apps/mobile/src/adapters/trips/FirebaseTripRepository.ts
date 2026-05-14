import {
    doc,
    getDoc,
} from 'firebase/firestore';
import {
    buildCopiedTimelineItemWritePayload,
    buildTimelineItemCopyPatch,
    buildTimelineItemCreatePatch,
    buildTimelineMemoryAppendPatch,
    buildTimelineMemoCreatePatch,
    buildTimelineManualTransitCreatePatch,
    buildTimelineQuickRouteCreatePatch,
    buildTimelineItemWritePatch,
    normalizeTripDocument
} from '@shared/features/trips/trip-canonical.js';
import { getTripTitleTooLongMessage } from '@shared/features/trips/trip-title.js';
import {
    insertWritableTripTimelineItemCanonical,
    moveWritableTripTimelineItemCanonical,
    moveWritableTripTimelineItemToIndexCanonical,
    recalculateWritableTripTimelineItemsCanonical,
    reorderWritableTripTimelineDaysCanonical,
    removeWritableTripTimelineItemCanonical,
    sortWritableTripTimelineItemsByTimeCanonical,
    updateWritableTripTimelineItemTimeCanonical
} from '@shared/features/trips/trip-write-scaffold.js';
import { calculateExpenseTotal } from '@shared/features/expenses/expense-helpers.js';

import {
    assertMobileFirebaseConfigReady,
    getMobileFirestore,
    hasMobileFirebaseConfig
} from '@/adapters/firebase/mobile-firebase';
import { assertTripCreationEnabled } from '@/features/trip-creation';
import {
    getCachedTripDetail as getCachedTripDetailFromStorage,
    getCachedTripList as getCachedTripListFromStorage,
    persistCachedTripDetailAndSummary,
    removeCachedTrip,
    setCachedTripList
} from '@/adapters/trips/trip-local-cache';
import { mapTripDetail } from '@/mappers/trip-detail-mapper';
import { mapTripSummary } from '@/mappers/trip-summary-mapper';
import { BackendRequestError, fetchBackendJson } from '@/services/backend-client';
import {
    buildOffsetPageFromQueryItems,
    DEFAULT_OFFSET_PAGE_LIMIT,
    MAX_OFFSET_PAGE_LIMIT,
    normalizeOffsetCursor,
    normalizeOffsetPageLimit
} from '@/utils/pagination';
import { isNetworkLikeError, isSessionLikeError } from '@/utils/network-error';
import type {
    CanonicalTripDocument,
    ExpenseEntry,
    FlightInfo,
    MemoryEntry,
    MobileTripExpenseCreateInput,
    MobileTripListItemCreateInput,
    MobileTripListType,
    MobileQuickRouteOption,
    MobileTimelineItemCreateInput,
    MobileTimelineMemoryCreateInput,
    MobileTimelineMemoCreateInput,
    MobileTimelineTransitCreateInput,
    MobileTripCreateInput,
    MobileTimelineItemEditInput,
    MobileTripDetail,
    MobileTripInfoInput,
    MobileTripSummary,
    TripRestoreResponse,
    TripRevisionEntry,
    TripRevisionListResponse,
    RawAttachmentEntry,
    RawTripDay,
    RawTripListItem,
    RawTimelineItem,
    RawTrip
} from '@/types/trip';
import type {
    OffsetPageRequest,
    TripListPage,
    TripRepository
} from './TripRepository';

type TripDetailResponse = {
    trip?: Record<string, unknown> | null;
};

type TripListResponse = {
    trips?: Array<Record<string, unknown> | null> | null;
};

type TripRevisionListBackendResponse = {
    items?: Array<Record<string, unknown> | null> | null;
    nextCursor?: unknown;
    hasMore?: unknown;
};

const TRIP_WRITE_CONFLICT_MESSAGE = '다른 기기에서 먼저 수정했어요. 최신 내용을 다시 불러온 뒤 변경사항을 다시 적용해 주세요.';
const TRIP_TITLE_TOO_LONG_MESSAGE = getTripTitleTooLongMessage();

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function coerceList(value: unknown): unknown[] {
    if (Array.isArray(value)) {
        return value;
    }

    if (isPlainObject(value)) {
        return Object.values(value);
    }

    return [];
}

function readString(value: unknown): string {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return typeof trimmed.normalize === 'function' ? trimmed.normalize('NFC') : trimmed;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return '';
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

function stripHtmlToText(value: string): string {
    return decodeHtmlEntities(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
}

function readDisplayString(value: unknown): string {
    return stripHtmlToText(readString(value));
}

function readNullableString(value: unknown): string | null {
    const text = readString(value);
    return text || null;
}

function readNullableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const cleaned = value.replace(/[^\d.-]/g, '').trim();
        if (!cleaned) {
            return null;
        }

        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function readBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
    }

    if (typeof value === 'number') {
        return value === 1;
    }

    return false;
}

function normalizeDateOnly(value: unknown): string {
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().split('T')[0];
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
    }

    if (value && typeof value === 'object') {
        const maybeDate = value as { seconds?: unknown; toDate?: () => Date };

        if (typeof maybeDate.toDate === 'function') {
            const date = maybeDate.toDate();
            return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        }

        if (typeof maybeDate.seconds === 'number' && Number.isFinite(maybeDate.seconds)) {
            const date = new Date(maybeDate.seconds * 1000);
            return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        }
    }

    return '';
}

function isIsoDateInput(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeDateTimeString(value: unknown): string {
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    }

    if (value && typeof value === 'object') {
        const maybeDate = value as { seconds?: unknown; toDate?: () => Date };

        if (typeof maybeDate.toDate === 'function') {
            const date = maybeDate.toDate();
            return Number.isNaN(date.getTime()) ? '' : date.toISOString();
        }

        if (typeof maybeDate.seconds === 'number' && Number.isFinite(maybeDate.seconds)) {
            const date = new Date(maybeDate.seconds * 1000);
            return Number.isNaN(date.getTime()) ? '' : date.toISOString();
        }
    }

    return '';
}

function pickFirstCollection(...values: unknown[]): unknown[] {
    for (const value of values) {
        const list = coerceList(value);
        if (list.length > 0) {
            return list;
        }
    }

    return [];
}

function normalizeDuration(value: unknown): string | number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const text = readDisplayString(value);
    return text || undefined;
}

function inferTransitType(item: Record<string, unknown>): string {
    const explicitType = readDisplayString(item.transitType).toLowerCase();
    if (explicitType) {
        return explicitType;
    }

    const tag = readDisplayString(item.tag).toLowerCase();
    const icon = readDisplayString(item.icon).toLowerCase();
    const title = readDisplayString(item.title).toLowerCase();
    const combined = `${tag} ${icon} ${title}`;

    if (combined.includes('flight') || combined.includes('비행')) {
        return 'airplane';
    }

    if (combined.includes('subway') || combined.includes('전철') || combined.includes('지하철')) {
        return 'subway';
    }

    if (combined.includes('train') || combined.includes('기차')) {
        return 'train';
    }

    if (combined.includes('bus') || combined.includes('버스')) {
        return 'bus';
    }

    if (combined.includes('taxi') || combined.includes('택시')) {
        return 'taxi';
    }

    if (combined.includes('bike') || combined.includes('bicycle') || combined.includes('자전거')) {
        return 'bike';
    }

    if (combined.includes('boat') || combined.includes('ferry') || combined.includes('ship') || combined.includes('배')) {
        return 'boat';
    }

    if (combined.includes('car') || combined.includes('차량') || combined.includes('택시')) {
        return 'car';
    }

    if (combined.includes('walk') || combined.includes('도보')) {
        return 'walk';
    }

    return '';
}

function normalizeTransitInfo(value: unknown) {
    if (!isPlainObject(value)) {
        return null;
    }

    const start = readDisplayString(value.start ?? value.depTime);
    const end = readDisplayString(value.end ?? value.arrTime);
    const depTime = readDisplayString(value.depTime ?? value.start);
    const arrTime = readDisplayString(value.arrTime ?? value.end);

    if (!start && !end && !depTime && !arrTime) {
        return null;
    }

    return {
        ...value,
        start,
        end,
        depTime,
        arrTime
    };
}

function normalizeFlightInfo(value: unknown): FlightInfo | null {
    if (!isPlainObject(value)) {
        return null;
    }

    const normalized: FlightInfo = {
        ...value,
        departure: readDisplayString(value.departure),
        arrival: readDisplayString(value.arrival),
        departureTime: readDisplayString(value.departureTime),
        arrivalTime: readDisplayString(value.arrivalTime),
        duration: readDisplayString(value.duration),
        flightNumber: readDisplayString(value.flightNumber),
        bookingRef: readDisplayString(value.bookingRef),
        terminal: readDisplayString(value.terminal),
        gate: readDisplayString(value.gate)
    };

    const hasAnyValue = Object.values(normalized).some((entry) => Boolean(entry));
    return hasAnyValue ? normalized : null;
}

function normalizeMemoryEntry(value: unknown): MemoryEntry | null {
    if (typeof value === 'string') {
        const photoUrl = readNullableString(value);
        return photoUrl ? { photoUrl } : null;
    }

    if (!isPlainObject(value)) {
        return null;
    }

    const thumbnailUrl = readNullableString(value.thumbnailUrl ?? value.previewUrl ?? value.thumbUrl);
    const previewUrl = readNullableString(value.previewUrl ?? value.thumbnailUrl ?? value.thumbUrl);
    const photoUrl = readNullableString(value.photoUrl ?? value.url ?? value.image) || thumbnailUrl;
    const comment = readDisplayString(value.comment ?? value.note ?? value.memo);
    const createdAt = normalizeDateTimeString(value.createdAt);

    if (!photoUrl && !comment && !createdAt) {
        return null;
    }

    return {
        ...value,
        photoUrl,
        previewUrl,
        thumbnailUrl,
        comment,
        createdAt
    };
}

function normalizeExpenseEntry(value: unknown): ExpenseEntry | null {
    if (!isPlainObject(value)) {
        return null;
    }

    const amount = readNullableNumber(value.amount ?? value.cost);
    const description = readDisplayString(value.description ?? value.desc ?? value.note ?? value.memo);
    const currency = readNullableString(value.currency ?? value.currencyCode ?? value.unit);

    if (amount === null && !description && !currency) {
        return null;
    }

    return {
        ...value,
        amount,
        description,
        currency
    };
}

function inferAttachmentMimeType(url: string, explicitType: string) {
    const normalizedType = explicitType.trim().toLowerCase();
    if (normalizedType) {
        return normalizedType;
    }

    const normalizedUrl = url.trim().toLowerCase();
    if (
        normalizedUrl.endsWith('.jpg')
        || normalizedUrl.endsWith('.jpeg')
        || normalizedUrl.endsWith('.png')
        || normalizedUrl.endsWith('.gif')
        || normalizedUrl.endsWith('.webp')
        || normalizedUrl.endsWith('.heic')
        || normalizedUrl.endsWith('.heif')
    ) {
        return 'image/*';
    }

    if (normalizedUrl.endsWith('.pdf')) {
        return 'application/pdf';
    }

    return '';
}

function normalizeAttachmentEntry(value: unknown): RawAttachmentEntry | null {
    if (typeof value === 'string') {
        const url = readNullableString(value);
        if (!url) {
            return null;
        }

        const mimeType = inferAttachmentMimeType(url, '');

        return {
            name: '',
            type: mimeType || null,
            url,
            previewUrl: mimeType.startsWith('image/') ? url : null
        };
    }

    if (!isPlainObject(value)) {
        return null;
    }

    const url = readNullableString(
        value.url
        ?? value.fileUrl
        ?? value.downloadURL
        ?? value.downloadUrl
        ?? value.href
        ?? value.link
        ?? value.uri
        ?? value.ticketUrl
        ?? value.reservationUrl
        ?? value.pdfUrl
        ?? value.pdf
    );
    const previewUrl = readNullableString(value.previewUrl ?? value.thumbnailUrl ?? value.image ?? value.photoUrl);
    const fallbackUrl = url || previewUrl;

    if (!fallbackUrl) {
        return null;
    }

    const type = inferAttachmentMimeType(
        fallbackUrl,
        readString(value.type ?? value.mimeType ?? value.contentType)
    );
    const name = readDisplayString(value.name ?? value.fileName ?? value.filename ?? value.title ?? value.label);

    return {
        ...value,
        name,
        type: type || null,
        url: fallbackUrl,
        previewUrl: previewUrl || (type.startsWith('image/') ? fallbackUrl : null)
    };
}

function collectAttachmentCandidates(item: Record<string, unknown>) {
    const candidates: unknown[] = [
        ...coerceList(item.attachments),
        ...coerceList(item.files),
        ...coerceList(item.images),
        ...coerceList(item.tickets),
        ...coerceList(item.reservations)
    ];

    [item.ticket, item.reservation, item.pdf, item.pdfFile].forEach((value) => {
        if (value !== undefined && value !== null) {
            candidates.push(value);
        }
    });

    [item.ticketUrl, item.reservationUrl, item.pdfUrl].forEach((value) => {
        const text = readString(value);
        if (text) {
            candidates.push({
                url: text
            });
        }
    });

    return candidates;
}

function normalizeTimelineItem(value: unknown): RawTimelineItem {
    const item = isPlainObject(value) ? value : {};
    const transitInfo = normalizeTransitInfo(item.transitInfo);
    const flightInfo = normalizeFlightInfo(item.flightInfo);
    const transitType = inferTransitType(item) || (flightInfo ? 'airplane' : '');
    const memories = pickFirstCollection(item.memories, item.memoryEntries, item.photos)
        .map((entry) => normalizeMemoryEntry(entry))
        .filter((entry): entry is MemoryEntry => Boolean(entry));
    const expenses = pickFirstCollection(item.expenses)
        .map((entry) => normalizeExpenseEntry(entry))
        .filter((entry): entry is ExpenseEntry => Boolean(entry));
    const attachments = collectAttachmentCandidates(item)
        .map((entry) => normalizeAttachmentEntry(entry))
        .filter((entry): entry is RawAttachmentEntry => Boolean(entry))
        .filter((entry, index, entries) => {
            return entries.findIndex((candidate) => candidate.url === entry.url) === index;
        });

    return {
        ...item,
        time: readDisplayString(item.time),
        duration: normalizeDuration(item.duration),
        title: readDisplayString(item.title),
        location: readDisplayString(item.location ?? item.place ?? item.address),
        icon: readDisplayString(item.icon),
        tag: readDisplayString(item.tag),
        image: readNullableString(item.image ?? item.photoUrl),
        note: readDisplayString(item.note ?? item.memo ?? item.comment),
        isTransit: Boolean(item.isTransit || transitInfo || flightInfo || transitType),
        transitType,
        transitInfo,
        flightInfo,
        memories,
        attachments,
        expenses,
        budget: readNullableNumber(item.budget ?? item.cost ?? item.amount)
    };
}

function normalizeTripMeta(data: Record<string, unknown>) {
    const meta = isPlainObject(data.meta) ? data.meta : {};

    return {
        ...meta,
        title: readDisplayString(meta.title ?? data.title),
        subInfo: readDisplayString(meta.subInfo ?? data.dates),
        dayCount: readDisplayString(meta.dayCount),
        location: readDisplayString(meta.location ?? data.location),
        budget: readNullableNumber(meta.budget ?? data.budget),
        coverImage: readNullableString(
            meta.coverImage ?? meta.mapImage ?? data.coverImage ?? data.mapImage
        )
    };
}

function cloneTripMetaForWrite(data: Record<string, unknown>) {
    const meta = isPlainObject(data.meta) ? data.meta : {};
    return {
        ...meta
    };
}

function cloneWritableCollection(value: unknown) {
    if (Array.isArray(value)) {
        return [...value];
    }

    if (isPlainObject(value)) {
        return { ...value };
    }

    return [];
}

function cloneTripDaysForWrite(data: Record<string, unknown>) {
    return coerceList(data.days).map((day) => {
        const safeDay = isPlainObject(day) ? day : {};
        const nextDay: Record<string, unknown> = {
            ...safeDay
        };

        if (Object.prototype.hasOwnProperty.call(safeDay, 'timeline')) {
            nextDay.timeline = cloneWritableCollection(safeDay.timeline);
        }

        if (Object.prototype.hasOwnProperty.call(safeDay, 'items')) {
            nextDay.items = cloneWritableCollection(safeDay.items);
        }

        return nextDay;
    });
}

function updateTimelineItemInCollection(
    collectionValue: unknown,
    itemIndex: number,
    itemPatch: Record<string, unknown>
) {
    if (Array.isArray(collectionValue)) {
        const currentItem = isPlainObject(collectionValue[itemIndex]) ? collectionValue[itemIndex] : {};
        collectionValue[itemIndex] = {
            ...currentItem,
            ...itemPatch
        };
        return true;
    }

    if (isPlainObject(collectionValue)) {
        const keys = Object.keys(collectionValue);
        const targetKey = keys[itemIndex];

        if (!targetKey) {
            return false;
        }

        const currentItem = isPlainObject(collectionValue[targetKey]) ? collectionValue[targetKey] : {};
        collectionValue[targetKey] = {
            ...currentItem,
            ...itemPatch
        };
        return true;
    }

    return false;
}

function applyTimelineItemWritePatch(
    days: Array<Record<string, unknown>>,
    dayIndex: number,
    itemIndex: number,
    itemPatch: Record<string, unknown>
) {
    const targetDay = days[dayIndex];
    if (!targetDay) {
        return false;
    }

    if (updateTimelineItemInCollection(targetDay.items, itemIndex, itemPatch)) {
        return true;
    }

    if (updateTimelineItemInCollection(targetDay.timeline, itemIndex, itemPatch)) {
        return true;
    }

    if (!Array.isArray(targetDay.items)) {
        targetDay.items = [];
    }

    return updateTimelineItemInCollection(targetDay.items, itemIndex, itemPatch);
}

function appendTimelineItemMemoriesInCollection(
    collectionValue: unknown,
    itemIndex: number,
    memoryEntries: MemoryEntry[]
) {
    if (Array.isArray(collectionValue)) {
        const currentItem = isPlainObject(collectionValue[itemIndex]) ? collectionValue[itemIndex] : null;
        if (!currentItem) {
            return false;
        }

        const currentMemories = coerceList(currentItem.memories);
        collectionValue[itemIndex] = {
            ...currentItem,
            memories: [...currentMemories, ...memoryEntries]
        };
        return true;
    }

    if (isPlainObject(collectionValue)) {
        const keys = Object.keys(collectionValue);
        const targetKey = keys[itemIndex];
        if (!targetKey) {
            return false;
        }

        const currentItem = isPlainObject(collectionValue[targetKey]) ? collectionValue[targetKey] : null;
        if (!currentItem) {
            return false;
        }

        const currentMemories = coerceList(currentItem.memories);
        collectionValue[targetKey] = {
            ...currentItem,
            memories: [...currentMemories, ...memoryEntries]
        };
        return true;
    }

    return false;
}

function appendTimelineItemMemoriesWritePatch(
    days: Array<Record<string, unknown>>,
    dayIndex: number,
    itemIndex: number,
    memoryEntries: MemoryEntry[]
) {
    const targetDay = days[dayIndex];
    if (!targetDay) {
        return false;
    }

    if (appendTimelineItemMemoriesInCollection(targetDay.items, itemIndex, memoryEntries)) {
        return true;
    }

    if (appendTimelineItemMemoriesInCollection(targetDay.timeline, itemIndex, memoryEntries)) {
        return true;
    }

    if (!Array.isArray(targetDay.items)) {
        targetDay.items = [];
    }

    return appendTimelineItemMemoriesInCollection(targetDay.items, itemIndex, memoryEntries);
}

function appendTimelineItemExpenseInCollection(
    collectionValue: unknown,
    itemIndex: number,
    expenseEntry: ExpenseEntry
) {
    if (Array.isArray(collectionValue)) {
        const currentItem = isPlainObject(collectionValue[itemIndex]) ? collectionValue[itemIndex] : null;
        if (!currentItem) {
            return false;
        }

        const currentExpenses = coerceList(currentItem.expenses);
        const nextExpenses = [...currentExpenses, expenseEntry];
        collectionValue[itemIndex] = {
            ...currentItem,
            expenses: nextExpenses,
            budget: calculateExpenseTotal(nextExpenses as ExpenseEntry[])
        };
        return true;
    }

    if (isPlainObject(collectionValue)) {
        const keys = Object.keys(collectionValue);
        const targetKey = keys[itemIndex];
        if (!targetKey) {
            return false;
        }

        const currentItem = isPlainObject(collectionValue[targetKey]) ? collectionValue[targetKey] : null;
        if (!currentItem) {
            return false;
        }

        const currentExpenses = coerceList(currentItem.expenses);
        const nextExpenses = [...currentExpenses, expenseEntry];
        collectionValue[targetKey] = {
            ...currentItem,
            expenses: nextExpenses,
            budget: calculateExpenseTotal(nextExpenses as ExpenseEntry[])
        };
        return true;
    }

    return false;
}

function appendTimelineItemExpenseWritePatch(
    days: Array<Record<string, unknown>>,
    dayIndex: number,
    itemIndex: number,
    expenseEntry: ExpenseEntry
) {
    const targetDay = days[dayIndex];
    if (!targetDay) {
        return false;
    }

    if (appendTimelineItemExpenseInCollection(targetDay.items, itemIndex, expenseEntry)) {
        return true;
    }

    if (appendTimelineItemExpenseInCollection(targetDay.timeline, itemIndex, expenseEntry)) {
        return true;
    }

    if (!Array.isArray(targetDay.items)) {
        targetDay.items = [];
    }

    return appendTimelineItemExpenseInCollection(targetDay.items, itemIndex, expenseEntry);
}

function cloneWritableListItems(value: unknown) {
    return coerceList(value).map((entry) => {
        if (isPlainObject(entry)) {
            return { ...entry };
        }

        return entry;
    });
}

function resolveWritableListKey(listType: MobileTripListType) {
    return listType === 'shopping' ? 'shoppingList' : 'checklist';
}

function buildExpenseEntryForWrite(input: MobileTripExpenseCreateInput): ExpenseEntry {
    const amount = Number(input.amount);
    const description = readDisplayString(input.description);
    const currency = readDisplayString(input.currency).toUpperCase() || 'KRW';

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('금액은 1원 이상 입력해 주세요.');
    }

    if (!description && input.allowEmptyDescription !== true) {
        throw new Error('지출 내역을 입력해 주세요.');
    }

    return {
        description,
        amount,
        currency
    };
}

function normalizeTripRecord(id: string, data: unknown): RawTrip {
    const safeData = isPlainObject(data) ? data : {};
    const days = coerceList(safeData.days).map((day, dayIndex) => {
        const safeDay = isPlainObject(day) ? day : {};
        const timeline = pickFirstCollection(safeDay.timeline, safeDay.items)
            .map((item) => normalizeTimelineItem(item));

        return {
            ...safeDay,
            date: normalizeDateOnly(safeDay.date),
            timeline,
            id: readString(safeDay.id) || `${id}-day-${dayIndex}`
        };
    });

    return {
        id,
        meta: normalizeTripMeta(safeData),
        days
    };
}

function hasMemberKey(data: unknown, userId: string) {
    if (!userId) {
        return false;
    }

    if (isPlainObject(data)) {
        return Object.prototype.hasOwnProperty.call(data, userId);
    }

    if (Array.isArray(data)) {
        return data.some((entry) => readString(entry) === userId);
    }

    return false;
}

function isTripMember(data: unknown, userId: string) {
    if (!isPlainObject(data) || !userId) {
        return false;
    }

    if (readString(data.createdBy) === userId) {
        return true;
    }

    if (readString(data.userId) === userId) {
        return true;
    }

    return hasMemberKey(data.members, userId);
}

function getTripSortKey(trip: RawTrip) {
    if (Array.isArray(trip.days) && trip.days[0]?.date) {
        return trip.days[0].date;
    }

    return '';
}

function readTripContentVersion(value: unknown) {
    if (!isPlainObject(value)) {
        return 1;
    }

    const parsed = Number(value.contentVersion);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 1;
    }

    return Math.floor(parsed);
}

function normalizeTripContentVersion(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return 1;
    }

    return Math.floor(parsed);
}

function isTripWriteConflictError(error: unknown) {
    return (error instanceof BackendRequestError && error.status === 409)
        || (error instanceof Error && error.message === TRIP_WRITE_CONFLICT_MESSAGE);
}

function mergeTripSummaries(
    existingItems: MobileTripSummary[],
    nextItems: MobileTripSummary[]
) {
    const mergedById = new Map<string, MobileTripSummary>();

    existingItems.forEach((item) => {
        mergedById.set(item.id, item);
    });
    nextItems.forEach((item) => {
        mergedById.set(item.id, item);
    });

    return Array.from(mergedById.values()).sort((left, right) => {
        const leftDate = String(left.startDate || '').trim();
        const rightDate = String(right.startDate || '').trim();

        if (leftDate !== rightDate) {
            return rightDate.localeCompare(leftDate);
        }

        return left.title.localeCompare(right.title, 'ko');
    });
}

function mapTripInfoWriteError(error: unknown) {
    if (isTripWriteConflictError(error)) {
        return new Error(TRIP_WRITE_CONFLICT_MESSAGE);
    }

    if (error instanceof Error) {
        if (
            error.message === '여행 제목을 입력해 주세요.'
            || error.message === TRIP_TITLE_TOO_LONG_MESSAGE
            || error.message === '시작일과 종료일을 모두 입력해 주세요.'
            || error.message === '날짜는 YYYY-MM-DD 형식으로 입력해 주세요.'
            || error.message === '종료일은 시작일보다 같거나 뒤여야 해요.'
            || error.message === '메모를 입력해 주세요.'
            || error.message === '수정할 일정을 찾을 수 없어요.'
            || error.message.includes('모바일 Firebase 환경 변수')
        ) {
            return error;
        }
    }

    if (isSessionLikeError(error)) {
        return new Error(
            '세션이 만료됐거나 권한이 바뀌어 저장할 수 없어요. 다시 로그인한 뒤 시도해 주세요.'
        );
    }

    if (isNetworkLikeError(error)) {
        return new Error(
            '인터넷 연결이 불안정해 저장하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
        );
    }

    return new Error('여행 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
}

function mapTimelineItemWriteError(error: unknown) {
    if (isTripWriteConflictError(error)) {
        return new Error(TRIP_WRITE_CONFLICT_MESSAGE);
    }

    if (error instanceof Error) {
        if (
            error.message === '메모를 입력해 주세요.'
            || error.message === '수정할 일정을 찾을 수 없어요.'
            || error.message === '저장할 여행을 찾지 못했어요.'
            || error.message === '일정을 추가할 날짜를 찾을 수 없어요.'
            || error.message === '가져올 기존 일정을 찾을 수 없어요.'
            || error.message === '일정 이름을 입력해 주세요.'
            || error.message === '시간은 HH:MM 형식으로 입력해 주세요.'
            || error.message === '머무는 시간은 1분 이상으로 입력해 주세요.'
            || error.message === '금액은 1원 이상 입력해 주세요.'
            || error.message === '지출 내역을 입력해 주세요.'
            || error.message === '항목 이름을 입력해 주세요.'
            || error.message.includes('모바일 Firebase 환경 변수')
        ) {
            return error;
        }
    }

    if (isSessionLikeError(error)) {
        return new Error(
            '세션이 만료됐거나 권한이 바뀌어 일정을 저장할 수 없어요. 다시 로그인한 뒤 시도해 주세요.'
        );
    }

    if (isNetworkLikeError(error)) {
        return new Error(
            '인터넷 연결이 불안정해 일정을 저장하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
        );
    }

    return new Error('일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
}

function mapTripCreateError(error: unknown) {
    if (error instanceof Error) {
        if (
            error.message === '여행 제목을 입력해 주세요.'
            || error.message === TRIP_TITLE_TOO_LONG_MESSAGE
            || error.message === '시작일과 종료일을 모두 입력해 주세요.'
            || error.message === '날짜는 YYYY-MM-DD 형식으로 입력해 주세요.'
            || error.message === '종료일은 시작일보다 같거나 뒤여야 해요.'
            || error.message.includes('모바일 Firebase 환경 변수')
        ) {
            return error;
        }
    }

    if (isSessionLikeError(error)) {
        return new Error(
            '세션이 만료됐거나 권한이 바뀌어 새 여행을 만들 수 없어요. 다시 로그인한 뒤 시도해 주세요.'
        );
    }

    if (isNetworkLikeError(error)) {
        return new Error(
            '인터넷 연결이 불안정해 새 여행을 만들지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
        );
    }

    return new Error('새 여행을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
}

function mapTripDeleteError(error: unknown) {
    if (error instanceof Error) {
        if (
            error.message === '여행을 삭제할 권한이 없어요.'
            || error.message === '삭제할 여행에 접근할 수 없어요.'
            || error.message.includes('모바일 Firebase 환경 변수')
        ) {
            return error;
        }
    }

    if (isSessionLikeError(error)) {
        return new Error(
            '세션이 만료됐거나 권한이 바뀌어 여행을 삭제할 수 없어요. 다시 로그인한 뒤 시도해 주세요.'
        );
    }

    if (isNetworkLikeError(error)) {
        return new Error(
            '인터넷 연결이 불안정해 여행을 삭제하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
        );
    }

    return new Error('여행을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
}

function mapTripDuplicateError(error: unknown) {
    if (error instanceof Error) {
        if (
            error.message === '사본을 만들 여행에 접근할 수 없어요.'
            || error.message.includes('모바일 Firebase 환경 변수')
        ) {
            return error;
        }
    }

    if (isSessionLikeError(error)) {
        return new Error(
            '세션이 만료됐거나 권한이 바뀌어 여행 사본을 만들 수 없어요. 다시 로그인한 뒤 시도해 주세요.'
        );
    }

    if (isNetworkLikeError(error)) {
        return new Error(
            '인터넷 연결이 불안정해 여행 사본을 만들지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
        );
    }

    return new Error('여행 사본을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
}

export function hasFirebaseTripRepositoryConfig() {
    return hasMobileFirebaseConfig();
}

const reportedLegacyFallbackKeys = new Set<string>();

function isCanonicalTripMember(trip: CanonicalTripDocument, userId: string) {
    if (!userId) {
        return false;
    }

    return trip.membership.ownerUid === userId || Boolean(trip.membership.membersByUid[userId]);
}

function getCanonicalTripSortKey(trip: CanonicalTripDocument) {
    return trip.meta.startDate || trip.days[0]?.date || '';
}

function reportLegacyFallbacks(context: string, trip: CanonicalTripDocument) {
    if (!__DEV__ || trip.legacyFallbacks.length === 0) {
        return;
    }

    const reportKey = `${context}:${trip.id}:${trip.legacyFallbacks.join('|')}`;
    if (reportedLegacyFallbackKeys.has(reportKey)) {
        return;
    }

    reportedLegacyFallbackKeys.add(reportKey);
    console.info('[mobile-trip] legacy fallbacks', {
        context,
        tripId: trip.id,
        fallbacks: trip.legacyFallbacks
    });
}

function readTripDetailFromResponse(
    userId: string,
    response: TripDetailResponse | null | undefined
): MobileTripDetail | null {
    const trip = response?.trip;
    if (!isPlainObject(trip)) {
        return null;
    }

    const tripId = readString(trip.id);
    if (!tripId) {
        return null;
    }

    return mapTripDetail(
        normalizeTripDocument(tripId, trip) as CanonicalTripDocument,
        userId,
        trip
    );
}

function readTripSummariesFromResponse(
    userId: string,
    response: TripListResponse | null | undefined
) {
    const trips = Array.isArray(response?.trips) ? response.trips : [];

    return trips.reduce<MobileTripSummary[]>((entries, trip) => {
        if (!isPlainObject(trip)) {
            return entries;
        }

        const tripId = readString(trip.id);
        if (!tripId) {
            return entries;
        }

        const canonicalTrip = normalizeTripDocument(tripId, trip) as CanonicalTripDocument;

        if (!isCanonicalTripMember(canonicalTrip, userId)) {
            return entries;
        }

        reportLegacyFallbacks('list', canonicalTrip);
        entries.push(mapTripSummary(canonicalTrip, userId, trip));
        return entries;
    }, []);
}

function normalizeTripRevisionOperation(value: unknown): TripRevisionEntry['operation'] {
    if (value === 'meta_update' || value === 'restore') {
        return value;
    }

    return 'content_update';
}

function normalizeTripRevisionSourceClient(value: unknown): TripRevisionEntry['sourceClient'] {
    if (value === 'mobile' || value === 'web' || value === 'server') {
        return value;
    }

    return 'unknown';
}

function normalizeTripRevisionActor(value: unknown): TripRevisionEntry['actor'] {
    const safeValue = isPlainObject(value) ? value : {};

    return {
        uid: readString(safeValue.uid),
        displayName: readString(safeValue.displayName) || readString(safeValue.uid) || '멤버',
        email: readString(safeValue.email),
        photoURL: readNullableString(safeValue.photoURL)
    };
}

function normalizeTripRevisionSnapshot(value: unknown): TripRevisionEntry['snapshot'] {
    const safeValue = isPlainObject(value) ? value : {};
    const meta = isPlainObject(safeValue.meta) ? safeValue.meta : {};
    const days = Array.isArray(safeValue.days)
        ? safeValue.days as RawTripDay[]
        : [];
    const shoppingList = Array.isArray(safeValue.shoppingList)
        ? safeValue.shoppingList as RawTripListItem[]
        : [];
    const checklist = Array.isArray(safeValue.checklist)
        ? safeValue.checklist as RawTripListItem[]
        : [];

    return {
        meta,
        days,
        shoppingList,
        checklist,
        contentVersion: normalizeTripContentVersion(safeValue.contentVersion)
    };
}

function normalizeTripRevisionEntry(value: unknown): TripRevisionEntry | null {
    if (!isPlainObject(value)) {
        return null;
    }

    const id = readString(value.id);
    if (!id) {
        return null;
    }

    const summaryValue = isPlainObject(value.summary) ? value.summary : {};

    return {
        id,
        createdAt: readString(value.createdAt),
        actor: normalizeTripRevisionActor(value.actor),
        operation: normalizeTripRevisionOperation(value.operation),
        sourceClient: normalizeTripRevisionSourceClient(value.sourceClient),
        contentVersionBefore: normalizeTripContentVersion(value.contentVersionBefore),
        contentVersionAfter: normalizeTripContentVersion(value.contentVersionAfter),
        summary: {
            text: readDisplayString(summaryValue.text) || '여행 내용 수정'
        },
        snapshot: normalizeTripRevisionSnapshot(value.snapshot),
        restoredFromRevisionId: readString(value.restoredFromRevisionId)
    };
}

function normalizeTripRevisionListResponse(
    response: TripRevisionListBackendResponse | null | undefined
): TripRevisionListResponse {
    const items = Array.isArray(response?.items)
        ? response.items
            .map((entry) => normalizeTripRevisionEntry(entry))
            .filter((entry): entry is TripRevisionEntry => Boolean(entry))
        : [];

    return {
        items,
        nextCursor: readNullableString(response?.nextCursor),
        hasMore: readBoolean(response?.hasMore)
    };
}

function isTripDetailMissingMessage(message: string) {
    return message === '여행을 찾을 수 없어요.'
        || message === '이 여행을 볼 권한이 없어요.';
}

export class FirebaseTripRepository implements TripRepository {
    async getCachedTripList(userId: string): Promise<MobileTripSummary[]> {
        return getCachedTripListFromStorage(userId);
    }

    async getCachedTripDetail(userId: string, tripId: string): Promise<MobileTripDetail | null> {
        return getCachedTripDetailFromStorage(userId, tripId);
    }

    private async persistListCache(userId: string, items: MobileTripSummary[]) {
        await setCachedTripList(userId, items);
        return items;
    }

    private async persistDetailCache(userId: string, detail: MobileTripDetail | null) {
        if (userId && detail) {
            await persistCachedTripDetailAndSummary(userId, detail);
        }

        return detail;
    }

    private async readExpectedTripContentVersion(userId: string, tripId: string) {
        const cachedDetail = await getCachedTripDetailFromStorage(userId, tripId);

        if (cachedDetail?.id === tripId) {
            return cachedDetail.contentVersion;
        }

        const cachedList = await getCachedTripListFromStorage(userId);
        const cachedSummary = cachedList.find((entry) => entry.id === tripId) || null;

        return cachedSummary?.contentVersion ?? null;
    }

    private async persistTripContentWrite(
        userId: string,
        tripId: string,
        trip: Record<string, unknown>
    ) {
        try {
            const expectedContentVersion = await this.readExpectedTripContentVersion(userId, tripId);
            const response = await fetchBackendJson<TripDetailResponse>(
                `/plans/${encodeURIComponent(tripId)}/content`,
                {
                    method: 'PUT',
                    body: {
                        trip,
                        expectedContentVersion: expectedContentVersion ?? undefined,
                        sourceClient: 'mobile'
                    }
                }
            );
            const tripDetail = readTripDetailFromResponse(userId, response);
            return tripDetail ? this.persistDetailCache(userId, tripDetail) : null;
        } catch (error) {
            if (error instanceof Error && error.message === '저장할 여행을 찾지 못했어요.') {
                await removeCachedTrip(userId, tripId);
            }
            throw error;
        }
    }

    async listTripsPage(userId: string, options?: OffsetPageRequest): Promise<TripListPage> {
        if (!userId) {
            return {
                items: [],
                nextCursor: null,
                hasMore: false
            };
        }

        assertMobileFirebaseConfigReady();
        const cursor = normalizeOffsetCursor(options?.cursor);
        const limit = normalizeOffsetPageLimit(
            options?.limit,
            DEFAULT_OFFSET_PAGE_LIMIT,
            MAX_OFFSET_PAGE_LIMIT
        );
        const response = await fetchBackendJson<TripListResponse>(
            `/plans?offset=${encodeURIComponent(String(cursor))}&limit=${encodeURIComponent(String(limit + 1))}`
        );
        const summaries = readTripSummariesFromResponse(userId, response);
        const page = buildOffsetPageFromQueryItems(summaries, {
            cursor,
            limit,
            fallbackLimit: DEFAULT_OFFSET_PAGE_LIMIT,
            maxLimit: MAX_OFFSET_PAGE_LIMIT
        });
        const currentCache = cursor > 0
            ? await getCachedTripListFromStorage(userId)
            : [];
        const nextCacheItems = cursor > 0
            ? mergeTripSummaries(currentCache, page.items)
            : page.items;

        await this.persistListCache(userId, nextCacheItems);

        return page;
    }

    async listTrips(userId: string): Promise<MobileTripSummary[]> {
        const items: MobileTripSummary[] = [];
        let cursor: number | null = 0;

        while (cursor !== null) {
            const result = await this.listTripsPage(userId, {
                cursor,
                limit: MAX_OFFSET_PAGE_LIMIT
            });
            items.push(...result.items);
            cursor = result.nextCursor;
        }

        return items;
    }

    async getTripDetail(userId: string, tripId: string): Promise<MobileTripDetail | null> {
        if (!userId || !tripId) {
            return null;
        }

        assertMobileFirebaseConfigReady();

        try {
            const response = await fetchBackendJson<TripDetailResponse>(
                `/plans/${encodeURIComponent(tripId)}`
            );
            const tripDetail = readTripDetailFromResponse(userId, response);

            if (!tripDetail) {
                await removeCachedTrip(userId, tripId);
                return null;
            }

            return this.persistDetailCache(userId, tripDetail);
        } catch (error) {
            if (error instanceof Error && isTripDetailMissingMessage(error.message)) {
                await removeCachedTrip(userId, tripId);
                return null;
            }

            throw error;
        }
    }

    async listTripRevisions(
        userId: string,
        tripId: string,
        options?: {
            cursor?: string | null;
            limit?: number | null;
        }
    ): Promise<TripRevisionListResponse> {
        if (!userId || !tripId) {
            return {
                items: [],
                nextCursor: null,
                hasMore: false
            };
        }

        assertMobileFirebaseConfigReady();
        const params = new URLSearchParams();
        const cursor = readString(options?.cursor);
        const limit = Number(options?.limit);

        if (cursor) {
            params.set('cursor', cursor);
        }

        if (Number.isFinite(limit) && limit > 0) {
            params.set('limit', String(Math.floor(limit)));
        }

        const query = params.toString();
        const response = await fetchBackendJson<TripRevisionListBackendResponse>(
            `/plans/${encodeURIComponent(tripId)}/revisions${query ? `?${query}` : ''}`
        );

        return normalizeTripRevisionListResponse(response);
    }

    async restoreTripRevision(
        userId: string,
        tripId: string,
        revisionId: string
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !revisionId) {
            return null;
        }

        assertMobileFirebaseConfigReady();

        try {
            const expectedContentVersion = await this.readExpectedTripContentVersion(userId, tripId);
            const response = await fetchBackendJson<TripRestoreResponse>(
                `/plans/${encodeURIComponent(tripId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
                {
                    method: 'POST',
                    body: {
                        expectedContentVersion: expectedContentVersion ?? undefined,
                        sourceClient: 'mobile'
                    }
                }
            );
            const tripDetail = readTripDetailFromResponse(userId, response);
            return tripDetail ? this.persistDetailCache(userId, tripDetail) : null;
        } catch (error) {
            throw mapTripInfoWriteError(error);
        }
    }

    async createTrip(userId: string, input: MobileTripCreateInput): Promise<MobileTripDetail | null> {
        if (!userId) {
            return null;
        }

        assertTripCreationEnabled();

        try {
            assertMobileFirebaseConfigReady();
            const response = await fetchBackendJson<TripDetailResponse>('/plans', {
                method: 'POST',
                body: input
            });
            const tripDetail = readTripDetailFromResponse(userId, response);
            return tripDetail ? this.persistDetailCache(userId, tripDetail) : null;
        } catch (error) {
            throw mapTripCreateError(error);
        }
    }

    async duplicateTrip(userId: string, tripId: string): Promise<MobileTripDetail | null> {
        if (!userId || !tripId) {
            return null;
        }

        assertTripCreationEnabled();

        try {
            assertMobileFirebaseConfigReady();
            const response = await fetchBackendJson<TripDetailResponse>(
                `/plans/${encodeURIComponent(tripId)}/duplicate`,
                {
                    method: 'POST'
                }
            );
            const tripDetail = readTripDetailFromResponse(userId, response);
            return tripDetail ? this.persistDetailCache(userId, tripDetail) : null;
        } catch (error) {
            throw mapTripDuplicateError(error);
        }
    }

    async deleteTrip(
        userId: string,
        tripId: string,
        options?: { transferOwnerUid?: string | null }
    ): Promise<void> {
        if (!userId || !tripId) {
            return;
        }

        try {
            assertMobileFirebaseConfigReady();
            await fetchBackendJson<void>(`/plans/${encodeURIComponent(tripId)}`, {
                method: 'DELETE',
                body: options?.transferOwnerUid
                    ? { transferOwnerUid: options.transferOwnerUid }
                    : undefined
            });
            await removeCachedTrip(userId, tripId);
        } catch (error) {
            throw mapTripDeleteError(error);
        }
    }

    async updateTripInfo(
        userId: string,
        tripId: string,
        input: MobileTripInfoInput
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const expectedContentVersion = await this.readExpectedTripContentVersion(userId, tripId);
            const response = await fetchBackendJson<TripDetailResponse>(
                `/plans/${encodeURIComponent(tripId)}/meta`,
                {
                    method: 'PATCH',
                    body: {
                        ...input,
                        expectedContentVersion: expectedContentVersion ?? undefined,
                        sourceClient: 'mobile'
                    }
                }
            );
            const tripDetail = readTripDetailFromResponse(userId, response);
            return tripDetail ? this.persistDetailCache(userId, tripDetail) : null;
        } catch (error) {
            throw mapTripInfoWriteError(error);
        }
    }

    async appendExpenseToTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        input: MobileTripExpenseCreateInput
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId || !itemId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const dayIndex = canonicalTrip.days.findIndex((day) => day.id === dayId);
            if (dayIndex < 0) {
                throw new Error('저장할 여행을 찾지 못했어요.');
            }

            const targetItems = Array.isArray(canonicalTrip.days[dayIndex]?.items)
                ? canonicalTrip.days[dayIndex].items
                : [];
            const resolvedItemIndex = targetItems[itemIndex]?.id === itemId
                ? itemIndex
                : targetItems.findIndex((item) => String(item.id || '') === itemId);

            if (resolvedItemIndex < 0) {
                throw new Error('저장할 여행을 찾지 못했어요.');
            }

            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const expenseEntry = buildExpenseEntryForWrite(input);
            const didAppendExpense = appendTimelineItemExpenseWritePatch(
                nextDays,
                dayIndex,
                resolvedItemIndex,
                expenseEntry
            );

            if (!didAppendExpense) {
                throw new Error('저장할 여행을 찾지 못했어요.');
            }

            const nextTrip: Record<string, unknown> = {
                ...safeData,
                meta: nextMeta,
                days: nextDays
            };

            if (
                typeof input.linkedShoppingItemIndex === 'number'
                && Number.isInteger(input.linkedShoppingItemIndex)
                && input.linkedShoppingItemIndex >= 0
            ) {
                const nextShoppingList = cloneWritableListItems(safeData.shoppingList);
                const shoppingItem = isPlainObject(nextShoppingList[input.linkedShoppingItemIndex])
                    ? nextShoppingList[input.linkedShoppingItemIndex] as Record<string, unknown>
                    : null;
                const selectedItem = targetItems[resolvedItemIndex];

                if (shoppingItem) {
                    shoppingItem.checked = true;

                    if (!readString(shoppingItem.location) && selectedItem) {
                        shoppingItem.location = readString(selectedItem.title);
                        shoppingItem.locationDetail = readString(selectedItem.location);
                    }

                    nextTrip.shoppingList = nextShoppingList;
                }
            }

            return this.persistTripContentWrite(userId, tripId, nextTrip);
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async addTripListItem(
        userId: string,
        tripId: string,
        listType: MobileTripListType,
        input: MobileTripListItemCreateInput
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            const text = readDisplayString(input.text);
            if (!text) {
                throw new Error('항목 이름을 입력해 주세요.');
            }

            const safeData = isPlainObject(rawData) ? rawData : {};
            const listKey = resolveWritableListKey(listType);
            const nextList = cloneWritableListItems(safeData[listKey]);
            nextList.push({
                text,
                checked: false,
                location: readDisplayString(input.location),
                locationDetail: readDisplayString(input.locationDetail)
            });

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                [listKey]: nextList
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async toggleTripListItem(
        userId: string,
        tripId: string,
        listType: MobileTripListType,
        itemIndex: number
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || itemIndex < 0) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            const safeData = isPlainObject(rawData) ? rawData : {};
            const listKey = resolveWritableListKey(listType);
            const nextList = cloneWritableListItems(safeData[listKey]);
            const targetItem = isPlainObject(nextList[itemIndex]) ? nextList[itemIndex] : null;

            if (!targetItem) {
                return null;
            }

            targetItem.checked = targetItem.checked !== true;

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                [listKey]: nextList
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async insertTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        input: MobileTimelineItemCreateInput
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const mutableTrip = {
                meta: nextMeta,
                days: nextDays
            };
            const writePatch = buildTimelineItemCreatePatch(input, canonicalTrip, {
                dayId,
                insertAfterItemId,
                insertAfterItemIndex
            });
            const didInsert = insertWritableTripTimelineItemCanonical(
                mutableTrip,
                writePatch.dayIndex,
                writePatch.insertIndex,
                writePatch.item
            );

            if (!didInsert) {
                throw new Error('일정을 추가할 날짜를 찾을 수 없어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: mutableTrip.meta,
                days: mutableTrip.days
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async insertTimelineMemoItem(
        userId: string,
        tripId: string,
        dayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        input: MobileTimelineMemoCreateInput
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const mutableTrip = {
                meta: nextMeta,
                days: nextDays
            };
            const writePatch = buildTimelineMemoCreatePatch(input, canonicalTrip, {
                dayId,
                insertAfterItemId,
                insertAfterItemIndex
            });
            const didInsert = insertWritableTripTimelineItemCanonical(
                mutableTrip,
                writePatch.dayIndex,
                writePatch.insertIndex,
                writePatch.item
            );

            if (!didInsert) {
                throw new Error('메모를 추가할 날짜를 찾을 수 없어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: mutableTrip.meta,
                days: mutableTrip.days
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async insertManualTransitItem(
        userId: string,
        tripId: string,
        dayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        input: MobileTimelineTransitCreateInput
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const mutableTrip = {
                meta: nextMeta,
                days: nextDays
            };
            const writePatch = buildTimelineManualTransitCreatePatch(input, canonicalTrip, {
                dayId,
                insertAfterItemId,
                insertAfterItemIndex
            });

            if (writePatch.adjustedNextItemIndex >= 0 && writePatch.adjustedNextItemTime) {
                updateWritableTripTimelineItemTimeCanonical(
                    mutableTrip,
                    writePatch.dayIndex,
                    writePatch.adjustedNextItemIndex,
                    writePatch.adjustedNextItemTime
                );
            }

            const didInsert = insertWritableTripTimelineItemCanonical(
                mutableTrip,
                writePatch.dayIndex,
                writePatch.insertIndex,
                writePatch.item
            );

            if (!didInsert) {
                throw new Error('이동 카드를 추가할 날짜를 찾을 수 없어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: mutableTrip.meta,
                days: mutableTrip.days
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async appendTimelineItemMemories(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        input: MobileTimelineMemoryCreateInput
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId || !itemId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const writePatch = buildTimelineMemoryAppendPatch(input, canonicalTrip, {
                dayId,
                itemId,
                itemIndex
            });
            const rawMemoryEntries = writePatch.memoryEntries;
            const memoryEntries = rawMemoryEntries.filter(
                (entry): entry is Exclude<(typeof rawMemoryEntries)[number], null> => Boolean(entry)
            );
            const didAppend = appendTimelineItemMemoriesWritePatch(
                nextDays,
                writePatch.dayIndex,
                writePatch.itemIndex,
                memoryEntries
            );

            if (!didAppend) {
                throw new Error('추억을 추가할 일정을 찾을 수 없어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: nextMeta,
                days: nextDays
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async insertQuickRouteItem(
        userId: string,
        tripId: string,
        dayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        routeOption: MobileQuickRouteOption
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const mutableTrip = {
                meta: nextMeta,
                days: nextDays
            };
            const writePatch = buildTimelineQuickRouteCreatePatch(routeOption, canonicalTrip, {
                dayId,
                insertAfterItemId,
                insertAfterItemIndex
            });

            if (writePatch.adjustedNextItemIndex >= 0 && writePatch.adjustedNextItemTime) {
                updateWritableTripTimelineItemTimeCanonical(
                    mutableTrip,
                    writePatch.dayIndex,
                    writePatch.adjustedNextItemIndex,
                    writePatch.adjustedNextItemTime
                );
            }

            const didInsert = insertWritableTripTimelineItemCanonical(
                mutableTrip,
                writePatch.dayIndex,
                writePatch.insertIndex,
                writePatch.item
            );

            if (!didInsert) {
                throw new Error('이동 카드를 추가할 날짜를 찾을 수 없어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: mutableTrip.meta,
                days: mutableTrip.days
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async copyTimelineItem(
        userId: string,
        tripId: string,
        targetDayId: string,
        insertAfterItemId: string | null,
        insertAfterItemIndex: number,
        sourceDayId: string,
        sourceItemId: string,
        sourceItemIndex: number
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !targetDayId || !sourceDayId || !sourceItemId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const mutableTrip = {
                meta: nextMeta,
                days: nextDays
            };
            const copyPatch = buildTimelineItemCopyPatch(canonicalTrip, {
                dayId: targetDayId,
                insertAfterItemId,
                insertAfterItemIndex
            }, {
                dayId: sourceDayId,
                itemId: sourceItemId,
                itemIndex: sourceItemIndex
            });
            const copiedItem = buildCopiedTimelineItemWritePayload(copyPatch.sourceItem);
            const didInsert = insertWritableTripTimelineItemCanonical(
                mutableTrip,
                copyPatch.dayIndex,
                copyPatch.insertIndex,
                copiedItem
            );

            if (!didInsert) {
                throw new Error('일정을 추가할 날짜를 찾을 수 없어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: mutableTrip.meta,
                days: mutableTrip.days
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async updateTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        input: MobileTimelineItemEditInput
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId || !itemId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const writePatch = buildTimelineItemWritePatch(input, canonicalTrip, {
                dayId,
                itemId,
                itemIndex
            });
            const didUpdate = applyTimelineItemWritePatch(
                nextDays,
                writePatch.dayIndex,
                writePatch.itemIndex,
                writePatch.itemPatch
            );

            if (!didUpdate) {
                throw new Error('수정할 메모를 찾을 수 없어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: nextMeta,
                days: nextDays
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async moveTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        direction: 'up' | 'down'
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId || !itemId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const dayIndex = canonicalTrip.days.findIndex((day) => day.id === dayId);
            if (dayIndex < 0) {
                throw new Error('순서를 바꿀 일정을 찾을 수 없어요.');
            }

            const targetItems = Array.isArray(canonicalTrip.days[dayIndex]?.items)
                ? canonicalTrip.days[dayIndex].items
                : [];
            const resolvedItemIndex = targetItems[itemIndex]?.id === itemId
                ? itemIndex
                : targetItems.findIndex((item) => String(item.id || '') === itemId);

            if (resolvedItemIndex < 0) {
                throw new Error('순서를 바꿀 일정을 찾을 수 없어요.');
            }

            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const didMove = moveWritableTripTimelineItemCanonical(
                { meta: nextMeta, days: nextDays },
                dayIndex,
                resolvedItemIndex,
                direction
            );

            if (!didMove) {
                throw new Error(direction === 'up'
                    ? '더 위로 이동할 수 없어요.'
                    : '더 아래로 이동할 수 없어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: nextMeta,
                days: nextDays
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async moveTimelineItemToIndex(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number,
        targetIndex: number
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId || !itemId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const dayIndex = canonicalTrip.days.findIndex((day) => day.id === dayId);
            if (dayIndex < 0) {
                throw new Error('순서를 바꿀 일정을 찾을 수 없어요.');
            }

            const targetItems = Array.isArray(canonicalTrip.days[dayIndex]?.items)
                ? canonicalTrip.days[dayIndex].items
                : [];
            const resolvedItemIndex = targetItems[itemIndex]?.id === itemId
                ? itemIndex
                : targetItems.findIndex((item) => String(item.id || '') === itemId);

            if (resolvedItemIndex < 0) {
                throw new Error('순서를 바꿀 일정을 찾을 수 없어요.');
            }

            const safeTargetIndex = Math.max(0, Math.min(Math.floor(targetIndex), targetItems.length - 1));
            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const didMove = moveWritableTripTimelineItemToIndexCanonical(
                { meta: nextMeta, days: nextDays },
                dayIndex,
                resolvedItemIndex,
                safeTargetIndex
            );

            if (!didMove) {
                throw new Error('순서를 바꾸지 못했어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: nextMeta,
                days: nextDays
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async reorderTimelineDays(
        userId: string,
        tripId: string,
        dayOrders: Array<{
            dayId: string;
            orderedItemIds: string[];
        }>
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !Array.isArray(dayOrders) || dayOrders.length === 0) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const didReorder = reorderWritableTripTimelineDaysCanonical(
                { meta: nextMeta, days: nextDays },
                dayOrders
            );

            if (!didReorder) {
                return mapTripDetail(canonicalTrip, userId, rawData);
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: nextMeta,
                days: nextDays
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async reorganizeTimelineDay(
        userId: string,
        tripId: string,
        dayId: string,
        mode: 'time' | 'recalc'
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const dayIndex = canonicalTrip.days.findIndex((day) => day.id === dayId);
            if (dayIndex < 0) {
                throw new Error('재정렬할 일차를 찾을 수 없어요.');
            }

            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const didReorganize = mode === 'time'
                ? sortWritableTripTimelineItemsByTimeCanonical({ meta: nextMeta, days: nextDays }, dayIndex)
                : recalculateWritableTripTimelineItemsCanonical({ meta: nextMeta, days: nextDays }, dayIndex);

            if (!didReorganize) {
                throw new Error('일정을 재정렬하지 못했어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: nextMeta,
                days: nextDays
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }

    async deleteTimelineItem(
        userId: string,
        tripId: string,
        dayId: string,
        itemId: string,
        itemIndex: number
    ): Promise<MobileTripDetail | null> {
        if (!userId || !tripId || !dayId || !itemId) {
            return null;
        }

        try {
            assertMobileFirebaseConfigReady();
            const db = getMobileFirestore();
            const docRef = doc(db, 'plans', tripId);
            const docSnapshot = await getDoc(docRef);

            if (!docSnapshot.exists()) {
                return null;
            }

            const rawData = docSnapshot.data();
            const canonicalTrip = normalizeTripDocument(docSnapshot.id, rawData) as CanonicalTripDocument;

            if (!isCanonicalTripMember(canonicalTrip, userId)) {
                return null;
            }

            reportLegacyFallbacks('write', canonicalTrip);
            const dayIndex = canonicalTrip.days.findIndex((day) => day.id === dayId);
            if (dayIndex < 0) {
                throw new Error('삭제할 일정을 찾을 수 없어요.');
            }

            const targetItems = Array.isArray(canonicalTrip.days[dayIndex]?.items)
                ? canonicalTrip.days[dayIndex].items
                : [];
            const resolvedItemIndex = targetItems[itemIndex]?.id === itemId
                ? itemIndex
                : targetItems.findIndex((item) => String(item.id || '') === itemId);

            if (resolvedItemIndex < 0) {
                throw new Error('삭제할 일정을 찾을 수 없어요.');
            }

            const safeData = isPlainObject(rawData) ? rawData : {};
            const nextMeta = cloneTripMetaForWrite(safeData);
            const nextDays = cloneTripDaysForWrite(safeData);
            const didRemove = removeWritableTripTimelineItemCanonical(
                { meta: nextMeta, days: nextDays },
                dayIndex,
                resolvedItemIndex
            );

            if (!didRemove) {
                throw new Error('삭제할 일정을 찾을 수 없어요.');
            }

            return this.persistTripContentWrite(userId, tripId, {
                ...safeData,
                meta: nextMeta,
                days: nextDays
            });
        } catch (error) {
            throw mapTimelineItemWriteError(error);
        }
    }
}
