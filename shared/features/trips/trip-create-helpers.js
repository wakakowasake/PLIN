import { validateTripTitle } from './trip-title.js';

export function buildTripCreatePayload({
    title,
    startDate,
    endDate,
    location,
    defaultTravelData,
    newTripDataTemp,
    currentUid,
    normalizeGooglePhotoUrl
}) {
    const titleValidation = validateTripTitle(title);
    if (titleValidation.code === 'missing') {
        throw new Error('일정 제목을 입력해 주세요.');
    }

    if (titleValidation.code === 'too_long') {
        throw new Error(titleValidation.message);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end - start;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const dayCountText = diffDays === 0 ? '당일치기' : `${diffDays}박 ${diffDays + 1} 일`;

    const days = [];
    for (let index = 0; index <= diffDays; index += 1) {
        const date = new Date(start);
        date.setDate(date.getDate() + index);
        days.push({
            date: date.toISOString().split('T')[0],
            timeline: []
        });
    }

    const resolvedMapImage = (
        normalizeGooglePhotoUrl(newTripDataTemp.mapImage, 1600)
        || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop'
    );

    return {
        ...defaultTravelData,
        meta: {
            ...defaultTravelData.meta,
            title: titleValidation.normalizedValue,
            dayCount: dayCountText,
            subInfo: `${location} • ${startDate} - ${endDate} `,
            mapImage: resolvedMapImage,
            coverImage: resolvedMapImage,
            lat: newTripDataTemp.lat || null,
            lng: newTripDataTemp.lng || null,
            location
        },
        days,
        members: {
            [currentUid]: 'owner'
        },
        createdAt: new Date().toISOString(),
        createdBy: currentUid
    };
}
