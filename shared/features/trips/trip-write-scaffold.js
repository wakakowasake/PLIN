import {
    formatDuration,
    formatTimeStr,
    minutesTo24Hour,
    parseDurationStr,
    parseTimeStr
} from '../../core/utils/time-value-helpers.js';
import { recalculateTimelineItems } from '../timeline/timeline-item-helpers.js';

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function coerceList(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (isPlainObject(value)) {
        return Object.values(value);
    }

    return [];
}

function toValidDate(value) {
    const date = value instanceof Date
        ? new Date(value)
        : new Date(String(value || ''));

    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date) {
    return date.toISOString().split('T')[0];
}

function normalizeWritableDay(day) {
    const safeDay = isPlainObject(day) ? day : {};
    const itemsSource = Array.isArray(safeDay.items) || isPlainObject(safeDay.items)
        ? safeDay.items
        : safeDay.timeline;
    const { timeline, ...rest } = safeDay;

    return {
        ...rest,
        items: coerceList(itemsSource)
    };
}

function normalizeWritableItem(item) {
    if (!isPlainObject(item)) {
        return {};
    }

    const nextItem = { ...item };

    if (isPlainObject(nextItem.transitInfo)) {
        nextItem.transitInfo = { ...nextItem.transitInfo };
    }

    if (isPlainObject(nextItem.flightInfo)) {
        nextItem.flightInfo = { ...nextItem.flightInfo };
    }

    if (Array.isArray(nextItem.memories)) {
        nextItem.memories = [...nextItem.memories];
    }

    if (Array.isArray(nextItem.attachments)) {
        nextItem.attachments = [...nextItem.attachments];
    }

    if (Array.isArray(nextItem.expenses)) {
        nextItem.expenses = [...nextItem.expenses];
    }

    return nextItem;
}

function resolveSortableTime(item) {
    if (item?.isTransit && isPlainObject(item.transitInfo) && typeof item.transitInfo.start === 'string') {
        return parseTimeStr(item.transitInfo.start);
    }

    return parseTimeStr(item?.time);
}

export function syncWritableTripDaysWithRangeCanonical(travelData, startDate, totalDays) {
    if (!travelData || !Array.isArray(travelData.days)) {
        return;
    }

    const baseDate = toValidDate(startDate);
    if (!baseDate) {
        return;
    }

    const safeTotalDays = Number.isFinite(totalDays)
        ? Math.max(0, Math.floor(totalDays))
        : 0;
    const existingDays = travelData.days.map((day) => normalizeWritableDay(day));
    const nextDays = [];

    for (let index = 0; index < safeTotalDays; index += 1) {
        const nextDate = new Date(baseDate);
        nextDate.setDate(baseDate.getDate() + index);
        const currentDay = normalizeWritableDay(existingDays[index] || { items: [] });

        nextDays.push({
            ...currentDay,
            date: formatDateOnly(nextDate),
            items: Array.isArray(currentDay.items) ? currentDay.items : []
        });
    }

    travelData.days.splice(0, travelData.days.length, ...nextDays);
}

export function insertWritableTripTimelineItemCanonical(travelData, dayIndex, insertIndex, item) {
    if (!travelData || !Array.isArray(travelData.days)) {
        return false;
    }

    const targetDay = travelData.days[dayIndex];
    if (!targetDay) {
        return false;
    }

    const normalizedDay = normalizeWritableDay(targetDay);
    const nextItems = coerceList(normalizedDay.items).map((entry) => normalizeWritableItem(entry));
    const safeInsertIndex = Number.isFinite(insertIndex)
        ? Math.min(Math.max(Math.floor(insertIndex), 0), nextItems.length)
        : nextItems.length;

    nextItems.splice(safeInsertIndex, 0, normalizeWritableItem(item));
    travelData.days[dayIndex] = {
        ...normalizedDay,
        items: nextItems
    };

    return true;
}

export function updateWritableTripTimelineItemTimeCanonical(travelData, dayIndex, itemIndex, time) {
    if (!travelData || !Array.isArray(travelData.days)) {
        return false;
    }

    const targetDay = travelData.days[dayIndex];
    if (!targetDay) {
        return false;
    }

    const normalizedDay = normalizeWritableDay(targetDay);
    const nextItems = coerceList(normalizedDay.items).map((entry) => normalizeWritableItem(entry));
    const safeItemIndex = Number.isFinite(itemIndex)
        ? Math.max(0, Math.floor(itemIndex))
        : -1;
    const targetItem = nextItems[safeItemIndex];

    if (!targetItem || typeof time !== 'string' || !time.trim()) {
        return false;
    }

    nextItems[safeItemIndex] = {
        ...targetItem,
        time: time.trim()
    };
    travelData.days[dayIndex] = {
        ...normalizedDay,
        items: nextItems
    };

    return true;
}

export function moveWritableTripTimelineItemCanonical(travelData, dayIndex, itemIndex, direction) {
    if (!travelData || !Array.isArray(travelData.days)) {
        return false;
    }

    const targetDay = travelData.days[dayIndex];
    if (!targetDay) {
        return false;
    }

    const normalizedDay = normalizeWritableDay(targetDay);
    const nextItems = coerceList(normalizedDay.items).map((entry) => normalizeWritableItem(entry));
    const safeItemIndex = Number.isFinite(itemIndex)
        ? Math.max(0, Math.floor(itemIndex))
        : -1;

    if (!nextItems[safeItemIndex]) {
        return false;
    }

    const targetIndex = direction === 'up'
        ? safeItemIndex - 1
        : direction === 'down'
            ? safeItemIndex + 1
            : -1;

    if (targetIndex < 0 || targetIndex >= nextItems.length) {
        return false;
    }

    const [movedItem] = nextItems.splice(safeItemIndex, 1);
    nextItems.splice(targetIndex, 0, movedItem);

    travelData.days[dayIndex] = {
        ...normalizedDay,
        items: nextItems
    };

    return true;
}

export function moveWritableTripTimelineItemToIndexCanonical(travelData, dayIndex, itemIndex, targetIndex) {
    if (!travelData || !Array.isArray(travelData.days)) {
        return false;
    }

    const targetDay = travelData.days[dayIndex];
    if (!targetDay) {
        return false;
    }

    const normalizedDay = normalizeWritableDay(targetDay);
    const nextItems = coerceList(normalizedDay.items).map((entry) => normalizeWritableItem(entry));
    const safeItemIndex = Number.isFinite(itemIndex)
        ? Math.max(0, Math.floor(itemIndex))
        : -1;
    const safeTargetIndex = Number.isFinite(targetIndex)
        ? Math.max(0, Math.min(Math.floor(targetIndex), nextItems.length - 1))
        : -1;

    if (!nextItems[safeItemIndex] || safeTargetIndex < 0) {
        return false;
    }

    if (safeItemIndex === safeTargetIndex) {
        return true;
    }

    const [movedItem] = nextItems.splice(safeItemIndex, 1);
    nextItems.splice(safeTargetIndex, 0, movedItem);

    travelData.days[dayIndex] = {
        ...normalizedDay,
        items: nextItems
    };

    return true;
}

export function reorderWritableTripTimelineDaysCanonical(travelData, dayOrders) {
    if (!travelData || !Array.isArray(travelData.days) || !Array.isArray(dayOrders)) {
        return false;
    }

    let didChange = false;

    dayOrders.forEach((entry) => {
        const dayId = typeof entry?.dayId === 'string' ? entry.dayId.trim() : '';
        const orderedItemIds = Array.isArray(entry?.orderedItemIds)
            ? entry.orderedItemIds
                .map((itemId) => (typeof itemId === 'string' ? itemId.trim() : ''))
                .filter(Boolean)
            : [];

        if (!dayId || orderedItemIds.length === 0) {
            return;
        }

        const dayIndex = travelData.days.findIndex((day) => String(day?.id || '').trim() === dayId);
        if (dayIndex < 0) {
            return;
        }

        const targetDay = travelData.days[dayIndex];
        if (!targetDay) {
            return;
        }

        const normalizedDay = normalizeWritableDay(targetDay);
        const currentItems = coerceList(normalizedDay.items).map((item) => normalizeWritableItem(item));
        if (currentItems.length === 0) {
            return;
        }

        const itemMap = new Map();
        currentItems.forEach((item) => {
            const itemId = String(item?.id || '').trim();
            if (!itemId || itemMap.has(itemId)) {
                return;
            }
            itemMap.set(itemId, item);
        });

        const consumedIds = new Set();
        const nextItems = [];

        orderedItemIds.forEach((itemId) => {
            const targetItem = itemMap.get(itemId);
            if (!targetItem || consumedIds.has(itemId)) {
                return;
            }

            consumedIds.add(itemId);
            nextItems.push(targetItem);
        });

        currentItems.forEach((item) => {
            const itemId = String(item?.id || '').trim();
            if (itemId && consumedIds.has(itemId)) {
                return;
            }

            nextItems.push(item);
        });

        if (nextItems.length !== currentItems.length) {
            return;
        }

        const orderChanged = nextItems.some((item, index) => {
            return String(item?.id || '').trim() !== String(currentItems[index]?.id || '').trim();
        });

        if (!orderChanged) {
            return;
        }

        travelData.days[dayIndex] = {
            ...normalizedDay,
            items: nextItems
        };
        didChange = true;
    });

    return didChange;
}

export function sortWritableTripTimelineItemsByTimeCanonical(travelData, dayIndex) {
    if (!travelData || !Array.isArray(travelData.days)) {
        return false;
    }

    const targetDay = travelData.days[dayIndex];
    if (!targetDay) {
        return false;
    }

    const normalizedDay = normalizeWritableDay(targetDay);
    const nextItems = coerceList(normalizedDay.items).map((entry) => normalizeWritableItem(entry));

    nextItems.sort((left, right) => {
        const leftTime = resolveSortableTime(left);
        const rightTime = resolveSortableTime(right);

        if (leftTime === null && rightTime === null) {
            return 0;
        }

        if (leftTime === null) {
            return 1;
        }

        if (rightTime === null) {
            return -1;
        }

        return leftTime - rightTime;
    });

    travelData.days[dayIndex] = {
        ...normalizedDay,
        items: nextItems
    };

    return true;
}

export function recalculateWritableTripTimelineItemsCanonical(travelData, dayIndex) {
    if (!travelData || !Array.isArray(travelData.days)) {
        return false;
    }

    const targetDay = travelData.days[dayIndex];
    if (!targetDay) {
        return false;
    }

    const normalizedDay = normalizeWritableDay(targetDay);
    const nextItems = coerceList(normalizedDay.items).map((entry) => normalizeWritableItem(entry));

    if (nextItems.length === 0) {
        travelData.days[dayIndex] = {
            ...normalizedDay,
            items: nextItems
        };
        return true;
    }

    recalculateTimelineItems(nextItems, {
        parseTimeStr,
        parseDurationStr,
        formatDuration,
        formatTimeStr,
        minutesTo24Hour
    });

    travelData.days[dayIndex] = {
        ...normalizedDay,
        items: nextItems
    };

    return true;
}

export function removeWritableTripTimelineItemCanonical(travelData, dayIndex, itemIndex) {
    if (!travelData || !Array.isArray(travelData.days)) {
        return false;
    }

    const targetDay = travelData.days[dayIndex];
    if (!targetDay) {
        return false;
    }

    const normalizedDay = normalizeWritableDay(targetDay);
    const nextItems = coerceList(normalizedDay.items).map((entry) => normalizeWritableItem(entry));
    const safeItemIndex = Number.isFinite(itemIndex)
        ? Math.max(0, Math.floor(itemIndex))
        : -1;

    if (!nextItems[safeItemIndex]) {
        return false;
    }

    nextItems.splice(safeItemIndex, 1);
    travelData.days[dayIndex] = {
        ...normalizedDay,
        items: nextItems
    };

    return true;
}
