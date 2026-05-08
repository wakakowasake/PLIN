import { validateTripTitle } from '../trips/trip-title.js';

function formatDateLabel(date) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function buildTripDateRangeDetails(startStr, endStr) {
    if (!startStr || !endStr) {
        return { valid: false, reason: 'missing' };
    }

    const start = new Date(startStr);
    const end = new Date(endStr);

    if (end < start) {
        return { valid: false, reason: 'invalid_order', start, end };
    }

    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const totalDays = diffDays + 1;
    const durationText = diffDays === 0 ? '당일치기' : `${diffDays}박 ${diffDays + 1}일`;

    let dateStr = formatDateLabel(start);
    if (durationText !== '당일치기') {
        dateStr += ` - ${end.getMonth() + 1}월 ${end.getDate()}일`;
    }

    return {
        valid: true,
        start,
        end,
        diffDays,
        totalDays,
        durationText,
        dateStr
    };
}

export function syncTravelDaysWithRange(travelData, startDate, totalDays) {
    if (!travelData || !Array.isArray(travelData.days)) return;

    const currentTotalDays = travelData.days.length;
    if (totalDays > currentTotalDays) {
        for (let index = currentTotalDays; index < totalDays; index += 1) {
            travelData.days.push({ date: '', timeline: [] });
        }
    } else if (totalDays < currentTotalDays) {
        travelData.days.splice(totalDays);
    }

    travelData.days.forEach((day, index) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + index);
        day.date = date.toISOString().split('T')[0];
    });
}

export function getTripSubInfoText(location, dateStr) {
    return location ? `${location} • ${dateStr}` : dateStr;
}

export function getTripSubInfoPrefix(subInfo = '') {
    if (!subInfo || !subInfo.includes('•')) return '';
    return subInfo.split('•')[0].trim();
}

export function buildTripInfoSavePlan({
    title,
    location,
    startStr,
    endStr,
    currentDayIndex
}) {
    const titleValidation = validateTripTitle(title);
    if (titleValidation.code === 'missing') {
        return {
            status: 'missing_title',
            metaUpdates: null,
            syncRange: null,
            nextSelectedDayIndex: null
        };
    }

    if (titleValidation.code === 'too_long') {
        return {
            status: 'title_too_long',
            metaUpdates: null,
            syncRange: null,
            nextSelectedDayIndex: null
        };
    }

    if (!startStr || !endStr) {
        return {
            status: 'missing_dates',
            metaUpdates: null,
            syncRange: null,
            nextSelectedDayIndex: null
        };
    }

    const dateRange = buildTripDateRangeDetails(startStr, endStr);
    if (!dateRange.valid) {
        return {
            status: 'invalid_range',
            metaUpdates: null,
            syncRange: null,
            nextSelectedDayIndex: null
        };
    }

    return {
        status: 'ready',
        metaUpdates: {
            title: titleValidation.normalizedValue,
            dayCount: dateRange.durationText,
            subInfo: getTripSubInfoText(location, dateRange.dateStr)
        },
        syncRange: {
            startDate: dateRange.start,
            totalDays: dateRange.totalDays
        },
        nextSelectedDayIndex: currentDayIndex >= dateRange.totalDays ? dateRange.totalDays - 1 : null
    };
}

export function buildTripDateRangeUpdatePlan({
    startStr,
    endStr,
    currentSubInfo,
    currentTotalDays
}) {
    if (!startStr || !endStr) {
        return {
            status: 'noop_missing',
            metaUpdates: null,
            syncRange: null,
            requiresShrinkConfirmation: false
        };
    }

    const dateRange = buildTripDateRangeDetails(startStr, endStr);
    if (!dateRange.valid) {
        return {
            status: 'invalid_range',
            metaUpdates: null,
            syncRange: null,
            requiresShrinkConfirmation: false
        };
    }

    const prefix = getTripSubInfoPrefix(currentSubInfo);

    return {
        status: 'ready',
        metaUpdates: {
            dayCount: dateRange.durationText,
            subInfo: prefix ? `${prefix} • ${dateRange.dateStr}` : dateRange.dateStr
        },
        syncRange: {
            startDate: dateRange.start,
            totalDays: dateRange.totalDays
        },
        requiresShrinkConfirmation: dateRange.totalDays < (currentTotalDays || 0)
    };
}
