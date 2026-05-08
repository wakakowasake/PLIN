const MEMO_TAGS = new Set(['메모', '硫붾え']);

const TAG_TO_CATEGORY = {
    식사: 'meal',
    문화: 'culture',
    관광: 'sightseeing',
    쇼핑: 'shopping',
    숙소: 'accommodation',
    기타: 'custom'
};

export function getTimelineItemDurationMinutes(item, parseDurationStr) {
    if (!item) return 30;

    if (typeof item.duration === 'number') {
        return item.duration;
    }

    if (item.duration) {
        const parsed = parseDurationStr(item.duration);
        if (parsed) return parsed;
    }

    return 30;
}

export function getDefaultTimelineStartTime(timeline, preferredIndex, {
    parseTimeStr,
    parseDurationStr,
    formatTimeStr
}) {
    if (!Array.isArray(timeline) || timeline.length === 0) {
        return '오후 12:00';
    }

    const referenceIndex = typeof preferredIndex === 'number' && preferredIndex >= 0
        ? preferredIndex
        : timeline.length - 1;
    const referenceItem = timeline[referenceIndex];

    if (!referenceItem) {
        return '오후 12:00';
    }

    const refStart = parseTimeStr(referenceItem.time);
    if (refStart === null) {
        return '오후 12:00';
    }

    const refDuration = getTimelineItemDurationMinutes(referenceItem, parseDurationStr);
    return formatTimeStr(refStart + refDuration);
}

export function getTimelineItemCategoryCode(item) {
    const tag = String(item?.tag || '').trim();
    if (!tag) return 'custom';

    return TAG_TO_CATEGORY[tag] || tag.toLowerCase();
}

export function recalculateTimelineItems(timeline, {
    parseTimeStr,
    parseDurationStr,
    formatDuration,
    formatTimeStr,
    minutesTo24Hour
}) {
    if (!Array.isArray(timeline) || timeline.length === 0) {
        return timeline;
    }

    let currentTime = null;

    for (let i = 0; i < timeline.length; i += 1) {
        const item = timeline[i];
        if (item.isTransit && item.transitInfo?.start) {
            currentTime = parseTimeStr(item.transitInfo.start);
            break;
        }
        if (item.time) {
            currentTime = parseTimeStr(item.time);
            break;
        }
    }

    if (currentTime === null) currentTime = 9 * 60;

    for (let i = 0; i < timeline.length; i += 1) {
        const item = timeline[i];

        if (item.isTransit) {
            const duration = getTimelineItemDurationMinutes(item, parseDurationStr);
            const startTimeStr = minutesTo24Hour(currentTime);
            const endTime = currentTime + duration;
            const endTimeStr = minutesTo24Hour(endTime);

            if (!item.transitInfo) item.transitInfo = {};
            if (item.transitInfo.depTime) delete item.transitInfo.depTime;
            if (item.transitInfo.arrTime) delete item.transitInfo.arrTime;

            item.transitInfo.start = startTimeStr;
            item.transitInfo.end = endTimeStr;
            item.time = formatDuration(duration);
            currentTime = endTime;
            continue;
        }

        item.time = formatTimeStr(currentTime);

        let duration = 30;
        if (item.duration !== undefined && item.duration !== null && item.duration !== '') {
            const parsed = Number(item.duration);
            if (!Number.isNaN(parsed)) {
                duration = parsed;
            }
        }

        currentTime += duration;
    }

    return timeline;
}

export function buildNoteTimelineItem(title, time) {
    return {
        time,
        title,
        location: '',
        icon: 'sticky_note_2',
        tag: '메모',
        image: null,
        isTransit: false,
        note: ''
    };
}

export function isTimelineMemoItem(item) {
    return MEMO_TAGS.has(String(item?.tag || ''));
}
