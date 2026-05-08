import {
    formatDuration,
    minutesTo24Hour,
    parseDurationStr,
    parseTimeStr
} from '../../core/utils/time-value-helpers.js';
import { resolveAirport } from './airports-data.js';

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_HOUR = 60;
const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const timeZoneFormatterCache = new Map();

function parseDateOnlyParts(value) {
    const normalized = String(value || '').trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    return { year, month, day };
}

function formatDateOnlyFromUtcMs(utcMs) {
    const date = new Date(utcMs);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function addDaysToDateOnly(dateOnly, daysToAdd) {
    const parsed = parseDateOnlyParts(dateOnly);
    if (!parsed) {
        return '';
    }

    const utcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day) + (daysToAdd * MILLISECONDS_PER_DAY);
    return formatDateOnlyFromUtcMs(utcMs);
}

function getTimeZoneFormatter(timeZone) {
    if (!timeZoneFormatterCache.has(timeZone)) {
        timeZoneFormatterCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
            timeZone,
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }));
    }

    return timeZoneFormatterCache.get(timeZone);
}

function getTimeZoneOffsetMinutesAtUtcMs(utcMs, timeZone) {
    if (!timeZone) {
        return 0;
    }

    try {
        const formatter = getTimeZoneFormatter(timeZone);
        const parts = formatter.formatToParts(new Date(utcMs));
        const values = {};

        for (const part of parts) {
            if (part.type !== 'literal') {
                values[part.type] = part.value;
            }
        }

        const zonedUtcMs = Date.UTC(
            Number(values.year),
            Number(values.month) - 1,
            Number(values.day),
            Number(values.hour),
            Number(values.minute),
            Number(values.second)
        );

        return Math.round((zonedUtcMs - utcMs) / MILLISECONDS_PER_MINUTE);
    } catch (_error) {
        return 0;
    }
}

function getOffsetLabelFromMinutes(offsetMinutes) {
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absoluteMinutes = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absoluteMinutes / MINUTES_PER_HOUR)).padStart(2, '0');
    const minutes = String(absoluteMinutes % MINUTES_PER_HOUR).padStart(2, '0');

    return `UTC${sign}${hours}:${minutes}`;
}

function zonedLocalDateTimeToUtcMs(dateOnly, timeValue, timeZone) {
    const parsedDate = parseDateOnlyParts(dateOnly);
    const parsedMinutes = parseTimeStr(timeValue);

    if (!parsedDate || parsedMinutes === null || !timeZone) {
        return null;
    }

    const hours = Math.floor(parsedMinutes / MINUTES_PER_HOUR);
    const minutes = parsedMinutes % MINUTES_PER_HOUR;
    const utcGuess = Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day, hours, minutes);
    let offsetMinutes = getTimeZoneOffsetMinutesAtUtcMs(utcGuess, timeZone);
    let resolvedUtcMs = utcGuess - (offsetMinutes * MILLISECONDS_PER_MINUTE);

    const refinedOffsetMinutes = getTimeZoneOffsetMinutesAtUtcMs(resolvedUtcMs, timeZone);
    if (refinedOffsetMinutes !== offsetMinutes) {
        offsetMinutes = refinedOffsetMinutes;
        resolvedUtcMs = utcGuess - (offsetMinutes * MILLISECONDS_PER_MINUTE);
    }

    return resolvedUtcMs;
}

function calculateSimpleDurationMinutes(departureTime, arrivalTime) {
    const departureTotalMinutes = parseTimeStr(departureTime);
    let arrivalTotalMinutes = parseTimeStr(arrivalTime);

    if (departureTotalMinutes === null || arrivalTotalMinutes === null) {
        return null;
    }

    if (arrivalTotalMinutes < departureTotalMinutes) {
        arrivalTotalMinutes += MINUTES_PER_DAY;
    }

    return arrivalTotalMinutes - departureTotalMinutes;
}

export function calculateArrivalTimeValue(departureTime, durationText) {
    if (!departureTime || !durationText) return '';

    const departureTotalMinutes = parseTimeStr(departureTime);
    if (departureTotalMinutes === null) return '';

    const totalMinutes = parseDurationStr(durationText);
    return minutesTo24Hour(departureTotalMinutes + totalMinutes);
}

export function calculateFlightDurationDetails({
    dayDate,
    departureTime,
    arrivalTime,
    departureAirport,
    arrivalAirport
}) {
    const simpleDurationMinutes = calculateSimpleDurationMinutes(departureTime, arrivalTime);
    const departureAirportMeta = resolveAirport(departureAirport);
    const arrivalAirportMeta = resolveAirport(arrivalAirport);
    const fallbackArrivalDayOffset = (() => {
        const parsedStart = parseTimeStr(departureTime);
        const parsedEnd = parseTimeStr(arrivalTime);
        return parsedStart !== null && parsedEnd !== null && parsedEnd < parsedStart ? 1 : 0;
    })();

    if (
        !dayDate
        || !departureAirportMeta?.timeZone
        || !arrivalAirportMeta?.timeZone
    ) {
        return {
            durationMinutes: simpleDurationMinutes,
            arrivalDayOffset: fallbackArrivalDayOffset,
            usedTimeZones: false,
            departureAirport: departureAirportMeta,
            arrivalAirport: arrivalAirportMeta
        };
    }

    const departureUtcMs = zonedLocalDateTimeToUtcMs(dayDate, departureTime, departureAirportMeta.timeZone);
    if (departureUtcMs === null) {
        return {
            durationMinutes: simpleDurationMinutes,
            arrivalDayOffset: fallbackArrivalDayOffset,
            usedTimeZones: false,
            departureAirport: departureAirportMeta,
            arrivalAirport: arrivalAirportMeta
        };
    }

    let bestMatch = null;

    for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
        const arrivalDate = addDaysToDateOnly(dayDate, dayOffset);
        const arrivalUtcMs = zonedLocalDateTimeToUtcMs(arrivalDate, arrivalTime, arrivalAirportMeta.timeZone);
        if (arrivalUtcMs === null) {
            continue;
        }

        const candidateMinutes = Math.round((arrivalUtcMs - departureUtcMs) / MILLISECONDS_PER_MINUTE);
        if (candidateMinutes <= 0) {
            continue;
        }

        if (!bestMatch || candidateMinutes < bestMatch.durationMinutes) {
            bestMatch = {
                durationMinutes: candidateMinutes,
                arrivalDayOffset: dayOffset
            };
        }
    }

    if (!bestMatch) {
        return {
            durationMinutes: simpleDurationMinutes,
            arrivalDayOffset: fallbackArrivalDayOffset,
            usedTimeZones: false,
            departureAirport: departureAirportMeta,
            arrivalAirport: arrivalAirportMeta
        };
    }

    return {
        durationMinutes: bestMatch.durationMinutes,
        arrivalDayOffset: bestMatch.arrivalDayOffset,
        usedTimeZones: true,
        departureAirport: departureAirportMeta,
        arrivalAirport: arrivalAirportMeta
    };
}

export function formatTimeZoneOffsetLabel(timeZone, dayDate) {
    if (!timeZone) {
        return '';
    }

    const parsedDate = parseDateOnlyParts(dayDate);
    const utcMs = parsedDate
        ? Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day, 12, 0, 0)
        : Date.now();

    return getOffsetLabelFromMinutes(getTimeZoneOffsetMinutesAtUtcMs(utcMs, timeZone));
}

export function calculateFlightDurationValue(departureTime, arrivalTime, options = null) {
    if (!departureTime || !arrivalTime) return '';

    const durationInfo = options && typeof options === 'object'
        ? calculateFlightDurationDetails({
            dayDate: options.dayDate,
            departureTime,
            arrivalTime,
            departureAirport: options.departureAirport,
            arrivalAirport: options.arrivalAirport
        })
        : { durationMinutes: calculateSimpleDurationMinutes(departureTime, arrivalTime) };

    return durationInfo.durationMinutes && durationInfo.durationMinutes > 0
        ? formatDuration(durationInfo.durationMinutes)
        : '';
}
