import {
    formatTimeStr,
    minutesTo24Hour,
    parseTimeStr
} from '../../core/utils/time-value-helpers.js';
import { parseTransitDurationValue } from './transit-item-helpers.js';

const DEFAULT_TRANSIT_DURATION = 30;
const MINUTES_PER_DAY = 24 * 60;

export function buildGoogleRouteTiming(timeline, insertIndex, totalMinutes) {
    if (!Array.isArray(timeline) || insertIndex < 0 || insertIndex >= timeline.length) {
        return { routeStartTime: '', routeEndTime: '' };
    }

    const prevItem = timeline[insertIndex];
    if (!prevItem) {
        return { routeStartTime: '', routeEndTime: '' };
    }

    let routeStartTime = '';
    let routeEndTime = '';

    if (prevItem.isTransit && prevItem.transitInfo?.end) {
        routeStartTime = prevItem.transitInfo.end;
    } else if (prevItem.time) {
        const prevTimeMinutes = parseTimeStr(prevItem.time);
        if (prevTimeMinutes !== null) {
            const prevDuration = parseTransitDurationValue(prevItem.duration) || DEFAULT_TRANSIT_DURATION;
            routeStartTime = minutesTo24Hour(prevTimeMinutes + prevDuration);
        }
    }

    if (routeStartTime && totalMinutes) {
        const startMinutes = parseTimeStr(routeStartTime);
        if (startMinutes !== null) {
            routeEndTime = minutesTo24Hour(startMinutes + totalMinutes);
        }
    }

    return { routeStartTime, routeEndTime };
}

export function getAdjustedNextItemTime(prevItem, nextItem, durationValue) {
    if (!prevItem || !nextItem || prevItem.isTransit || nextItem.isTransit) {
        return null;
    }

    const prevTimeMinutes = parseTimeStr(prevItem.time);
    const nextTimeMinutes = parseTimeStr(nextItem.time);
    if (prevTimeMinutes === null) {
        return null;
    }

    const durationMinutes = Math.ceil((typeof durationValue === 'number' ? durationValue : 0) / 60);
    const arrivalTimeMinutes = prevTimeMinutes + durationMinutes;
    let effectiveNextTime = nextTimeMinutes;

    if (effectiveNextTime !== null && effectiveNextTime < prevTimeMinutes) {
        effectiveNextTime += MINUTES_PER_DAY;
    }

    if (effectiveNextTime === null || arrivalTimeMinutes > effectiveNextTime) {
        const nextTime = arrivalTimeMinutes >= MINUTES_PER_DAY
            ? arrivalTimeMinutes - MINUTES_PER_DAY
            : arrivalTimeMinutes;
        return formatTimeStr(nextTime);
    }

    return null;
}
