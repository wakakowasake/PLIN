export function getTripStatus(data) {
    if (!data || !data.days || data.days.length === 0) {
        return 'planning';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDayStr = data.days[data.days.length - 1].date;
    if (!lastDayStr) {
        return 'planning';
    }

    const lastDay = new Date(lastDayStr);
    lastDay.setHours(0, 0, 0, 0);

    return today > lastDay ? 'completed' : 'planning';
}

export function hasMemoryContent(files, comment) {
    return Boolean(files && files.length > 0);
}

export function readMemoryComment(entry) {
    return '';
}

export function buildMemoryFileName({ dayIndex, itemIndex, timestamp, fileIndex }) {
    return `memory_${dayIndex}_${itemIndex}_${timestamp}_${fileIndex}.jpg`;
}

export function createMemoryEntries(uploadedUrls, comment, createdAt = new Date().toISOString()) {
    if (!Array.isArray(uploadedUrls) || uploadedUrls.length === 0) {
        return [];
    }

    return uploadedUrls
        .map((url) => String(url || '').trim())
        .filter(Boolean)
        .map((url) => ({
            photoUrl: url,
            createdAt
        }));
}

export function appendMemoriesToItem(item, uploadedUrls, comment, createdAt) {
    if (!Array.isArray(item.memories)) {
        item.memories = [];
    }

    const entries = createMemoryEntries(uploadedUrls, comment, createdAt);
    item.memories.push(...entries);
    return entries;
}
