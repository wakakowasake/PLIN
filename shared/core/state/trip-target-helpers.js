function isValidIndex(index) {
    return Number.isInteger(index) && index >= 0;
}

export function selectTripDay(travelData, dayIndex) {
    if (!travelData || !Array.isArray(travelData.days) || !isValidIndex(dayIndex)) {
        return null;
    }

    return travelData.days[dayIndex] || null;
}

export function selectTimelineItem(travelData, dayIndex, itemIndex) {
    const day = selectTripDay(travelData, dayIndex);
    if (!day || !Array.isArray(day.timeline) || !isValidIndex(itemIndex)) {
        return null;
    }

    return day.timeline[itemIndex] || null;
}
