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

export const FREE_TRIP_MEMORY_PHOTO_LIMIT = 50;

export function getTripMemoryPhotoLimitMessage(limit = FREE_TRIP_MEMORY_PHOTO_LIMIT) {
    return `무료 일정은 추억 사진을 ${limit}장까지 저장할 수 있어요. PLIN Plus로 더 많은 사진을 남겨보세요.`;
}

function readMemoryUrl(value) {
    return String(value || '').trim();
}

function normalizeUploadedMemoryEntry(entry, createdAt) {
    if (typeof entry === 'string') {
        const photoUrl = readMemoryUrl(entry);
        return photoUrl
            ? {
                photoUrl,
                createdAt
            }
            : null;
    }

    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const photoUrl = readMemoryUrl(entry.photoUrl || entry.url || entry.image);
    const thumbnailUrl = readMemoryUrl(entry.thumbnailUrl || entry.previewUrl || entry.thumbUrl);
    const previewUrl = readMemoryUrl(entry.previewUrl || entry.thumbnailUrl || entry.thumbUrl);

    if (!photoUrl) {
        return null;
    }

    return {
        photoUrl,
        ...(previewUrl ? { previewUrl } : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        createdAt: readMemoryUrl(entry.createdAt) || createdAt
    };
}

export function createMemoryEntries(uploadedEntries, comment, createdAt = new Date().toISOString()) {
    if (!Array.isArray(uploadedEntries) || uploadedEntries.length === 0) {
        return [];
    }

    return uploadedEntries
        .map((entry) => normalizeUploadedMemoryEntry(entry, createdAt))
        .filter(Boolean);
}

export function appendMemoriesToItem(item, uploadedUrls, comment, createdAt) {
    if (!Array.isArray(item.memories)) {
        item.memories = [];
    }

    const entries = createMemoryEntries(uploadedUrls, comment, createdAt);
    item.memories.push(...entries);
    return entries;
}
