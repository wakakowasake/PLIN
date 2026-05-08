const MEMO_TAGS = new Set(['메모', '硫붾え']);

export function isPlanBAttachableTimelineItem(item) {
    return Boolean(item) && !item.isTransit && !MEMO_TAGS.has(String(item.tag || ''));
}

export function resolveTimelineDayIndex(dayIndex, currentDayIndex) {
    if (Number.isInteger(dayIndex) && dayIndex >= 0) return dayIndex;
    if (Number.isInteger(currentDayIndex) && currentDayIndex >= 0) return currentDayIndex;
    return 0;
}

export function resolvePlanBAnchorIndex(timeline, preferredIndex) {
    if (!Array.isArray(timeline) || timeline.length === 0) return null;

    if (typeof preferredIndex === 'number' && preferredIndex >= 0 && preferredIndex < timeline.length) {
        if (isPlanBAttachableTimelineItem(timeline[preferredIndex])) return preferredIndex;

        for (let i = preferredIndex; i >= 0; i -= 1) {
            if (isPlanBAttachableTimelineItem(timeline[i])) return i;
        }
        for (let i = preferredIndex + 1; i < timeline.length; i += 1) {
            if (isPlanBAttachableTimelineItem(timeline[i])) return i;
        }
    }

    for (let i = timeline.length - 1; i >= 0; i -= 1) {
        if (isPlanBAttachableTimelineItem(timeline[i])) return i;
    }

    return null;
}

export function normalizePlanBForForm(planB) {
    if (!planB) return { title: '', location: '', note: '' };
    if (typeof planB === 'string') return { title: planB, location: '', note: '' };
    if (typeof planB === 'object') {
        return {
            title: planB.title || '',
            location: planB.location || '',
            note: planB.note || ''
        };
    }
    return { title: '', location: '', note: '' };
}

export function buildPlanBPayload(title, location, note) {
    return {
        title: title || location || 'Plan B',
        location,
        note,
        updatedAt: new Date().toISOString()
    };
}
