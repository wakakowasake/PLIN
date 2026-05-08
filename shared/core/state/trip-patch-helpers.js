import { selectTimelineItem } from './trip-target-helpers.js';

function containsUnsafePathSegment(value) {
    return value.includes('__proto__') || value.includes('constructor') || value.includes('prototype');
}

export function buildTripMetaPatch(key, value) {
    if (containsUnsafePathSegment(key)) {
        return null;
    }

    return {
        path: `travelData.meta.${key}`,
        value
    };
}

export function buildTimelineItemPatch(travelData, dayIndex, itemIndex, key, value) {
    if (containsUnsafePathSegment(key)) {
        return null;
    }

    if (!selectTimelineItem(travelData, dayIndex, itemIndex)) {
        return null;
    }

    return {
        path: `travelData.days.${dayIndex}.timeline.${itemIndex}.${key}`,
        value
    };
}
