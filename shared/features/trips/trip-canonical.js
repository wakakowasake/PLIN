import {
    createMemoryEntries,
    getTripStatus
} from '../memories/memory-helpers.js';
import { isTimelineMemoItem } from '../timeline/timeline-item-helpers.js';
import { buildTripInfoSavePlan } from '../trip-info/trip-info-helpers.js';
import { getTripTitleTooLongMessage } from './trip-title.js';
import {
    formatDuration,
    parseTimeStr
} from '../../core/utils/time-value-helpers.js';
import { resolveAirport } from '../transit/airports-data.js';
import {
    getTransitTypeMeta,
    parseTransitDurationValue
} from '../transit/transit-item-helpers.js';
import {
    buildGoogleRouteTiming,
    getAdjustedNextItemTime
} from '../transit/transit-route-data-helpers.js';

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function coerceList(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (isPlainObject(value)) {
        return Object.values(value);
    }

    return [];
}

function readString(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return typeof trimmed.normalize === 'function' ? trimmed.normalize('NFC') : trimmed;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return '';
}

function decodeHtmlEntities(value) {
    return value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}

function stripHtmlToText(value) {
    return decodeHtmlEntities(value)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
}

function readDisplayString(value) {
    return stripHtmlToText(readString(value));
}

function readNullableString(value) {
    const text = readString(value);
    return text || null;
}

function readNullableNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const cleaned = value.replace(/[^\d.-]/g, '').trim();
        if (!cleaned) {
            return null;
        }

        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function readPositiveInteger(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return null;
    }

    return Math.floor(numeric);
}

function readBoolean(value) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
            return true;
        }

        if (normalized === 'false' || normalized === '0' || normalized === 'no') {
            return false;
        }
    }

    if (typeof value === 'number') {
        return value === 1;
    }

    return false;
}

function normalizeDateOnly(value) {
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().split('T')[0];
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
    }

    if (value && typeof value === 'object') {
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        }

        if (typeof value.seconds === 'number' && Number.isFinite(value.seconds)) {
            const date = new Date(value.seconds * 1000);
            return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        }
    }

    return '';
}

function normalizeDateTimeString(value) {
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    }

    if (value && typeof value === 'object') {
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return Number.isNaN(date.getTime()) ? '' : date.toISOString();
        }

        if (typeof value.seconds === 'number' && Number.isFinite(value.seconds)) {
            const date = new Date(value.seconds * 1000);
            return Number.isNaN(date.getTime()) ? '' : date.toISOString();
        }
    }

    return '';
}

function normalizeDuration(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const text = readDisplayString(value);
    return text || undefined;
}

function isIsoDateInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function is24HourTimeInput(value) {
    if (!/^\d{1,2}:\d{2}$/.test(value)) {
        return false;
    }

    const [hourText, minuteText] = value.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);

    return Number.isInteger(hour)
        && Number.isInteger(minute)
        && hour >= 0
        && hour <= 23
        && minute >= 0
        && minute <= 59;
}

function normalize24HourTimeInput(value) {
    const [hourText, minuteText] = value.split(':');
    return `${String(Number(hourText)).padStart(2, '0')}:${minuteText}`;
}

function buildGeneratedTimelineItemId() {
    return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLooseObject(value) {
    return isPlainObject(value) ? { ...value } : null;
}

const TIMELINE_CATEGORY_WRITE_META = {
    meal: {
        tag: '식사',
        icon: 'restaurant'
    },
    culture: {
        tag: '문화',
        icon: 'museum'
    },
    sightseeing: {
        tag: '관광',
        icon: 'photo_camera'
    },
    shopping: {
        tag: '쇼핑',
        icon: 'shopping_bag'
    },
    accommodation: {
        tag: '숙소',
        icon: 'hotel'
    },
    custom: {
        tag: '기타',
        icon: 'star'
    }
};

function recordLegacyFallback(legacyFallbacks, code) {
    if (!code) {
        return;
    }

    legacyFallbacks.push(code);
}

function buildFallbackDayCount(daysLength) {
    if (!daysLength) {
        return '일정 미정';
    }

    if (daysLength === 1) {
        return '당일치기';
    }

    return `${daysLength - 1}박 ${daysLength}일`;
}

function buildFallbackSubInfo(dayDates) {
    if (dayDates.length === 0) {
        return '여행 정보 준비 중';
    }

    if (dayDates.length === 1) {
        return dayDates[0];
    }

    return `${dayDates[0]} - ${dayDates[dayDates.length - 1]}`;
}

function deriveLocationFromSubInfo(subInfo) {
    const text = readDisplayString(subInfo);
    if (!text) {
        return '';
    }

    return text
        .split('•')[0]
        .replace(/\d{4}-\d{2}-\d{2}.*/g, '')
        .trim();
}

function inferAttachmentMimeType(url, explicitType) {
    const normalizedType = String(explicitType || '').trim().toLowerCase();
    if (normalizedType) {
        return normalizedType;
    }

    const normalizedUrl = String(url || '').trim().toLowerCase();
    if (
        normalizedUrl.endsWith('.jpg')
        || normalizedUrl.endsWith('.jpeg')
        || normalizedUrl.endsWith('.png')
        || normalizedUrl.endsWith('.gif')
        || normalizedUrl.endsWith('.webp')
        || normalizedUrl.endsWith('.heic')
        || normalizedUrl.endsWith('.heif')
    ) {
        return 'image/*';
    }

    if (normalizedUrl.endsWith('.pdf')) {
        return 'application/pdf';
    }

    return '';
}

function normalizeMemoryEntry(value) {
    if (typeof value === 'string') {
        const photoUrl = readNullableString(value);
        return photoUrl ? { photoUrl } : null;
    }

    if (!isPlainObject(value)) {
        return null;
    }

    const photoUrl = readNullableString(value.photoUrl ?? value.url ?? value.image);
    const createdAt = normalizeDateTimeString(value.createdAt);

    if (!photoUrl) {
        return null;
    }

    return {
        ...value,
        photoUrl,
        comment: '',
        note: '',
        memo: '',
        createdAt
    };
}

function normalizeExpenseEntry(value) {
    if (!isPlainObject(value)) {
        return null;
    }

    const amount = readNullableNumber(value.amount ?? value.cost);
    const description = readDisplayString(value.description ?? value.desc ?? value.note ?? value.memo);
    const currency = readNullableString(value.currency ?? value.currencyCode ?? value.unit);

    if (amount === null && !description && !currency) {
        return null;
    }

    return {
        ...value,
        amount,
        description,
        currency
    };
}

function normalizeAttachmentEntry(value) {
    if (typeof value === 'string') {
        const url = readNullableString(value);
        if (!url) {
            return null;
        }

        const mimeType = inferAttachmentMimeType(url, '');

        return {
            name: '',
            type: mimeType || null,
            url,
            previewUrl: mimeType.startsWith('image/') ? url : null
        };
    }

    if (!isPlainObject(value)) {
        return null;
    }

    const url = readNullableString(
        value.url
        ?? value.fileUrl
        ?? value.downloadURL
        ?? value.downloadUrl
        ?? value.href
        ?? value.link
        ?? value.uri
        ?? value.ticketUrl
        ?? value.reservationUrl
        ?? value.pdfUrl
        ?? value.pdf
    );
    const previewUrl = readNullableString(value.previewUrl ?? value.thumbnailUrl ?? value.image ?? value.photoUrl);
    const fallbackUrl = url || previewUrl;

    if (!fallbackUrl) {
        return null;
    }

    const type = inferAttachmentMimeType(
        fallbackUrl,
        readString(value.type ?? value.mimeType ?? value.contentType)
    );
    const name = readDisplayString(value.name ?? value.fileName ?? value.filename ?? value.title ?? value.label);

    return {
        ...value,
        name,
        type: type || null,
        url: fallbackUrl,
        previewUrl: previewUrl || (type.startsWith('image/') ? fallbackUrl : null)
    };
}

function collectAttachmentCandidates(item, legacyFallbacks) {
    const candidates = [
        ...coerceList(item.attachments),
        ...coerceList(item.files),
        ...coerceList(item.images),
        ...coerceList(item.tickets),
        ...coerceList(item.reservations)
    ];

    if (candidates.length > 0 && !Array.isArray(item.attachments)) {
        recordLegacyFallback(legacyFallbacks, 'attachments.alias');
    }

    [item.ticket, item.reservation, item.pdf, item.pdfFile].forEach((value) => {
        if (value !== undefined && value !== null) {
            candidates.push(value);
            recordLegacyFallback(legacyFallbacks, 'attachments.singleton');
        }
    });

    [item.ticketUrl, item.reservationUrl, item.pdfUrl].forEach((value) => {
        const text = readString(value);
        if (text) {
            candidates.push({ url: text });
            recordLegacyFallback(legacyFallbacks, 'attachments.urlAlias');
        }
    });

    return candidates;
}

function inferTransitType(item) {
    const explicitType = readDisplayString(item.transitType).toLowerCase();
    if (explicitType) {
        return explicitType;
    }

    const tag = readDisplayString(item.tag).toLowerCase();
    const icon = readDisplayString(item.icon).toLowerCase();
    const title = readDisplayString(item.title).toLowerCase();
    const combined = `${tag} ${icon} ${title}`;

    if (combined.includes('flight') || combined.includes('비행')) {
        return 'airplane';
    }

    if (combined.includes('subway') || combined.includes('전철') || combined.includes('지하철')) {
        return 'subway';
    }

    if (combined.includes('train') || combined.includes('기차')) {
        return 'train';
    }

    if (combined.includes('bus') || combined.includes('버스')) {
        return 'bus';
    }

    if (combined.includes('taxi') || combined.includes('택시')) {
        return 'taxi';
    }

    if (combined.includes('bike') || combined.includes('bicycle') || combined.includes('자전거')) {
        return 'bike';
    }

    if (combined.includes('boat') || combined.includes('ferry') || combined.includes('ship') || combined.includes('배')) {
        return 'boat';
    }

    if (combined.includes('car') || combined.includes('차량') || combined.includes('택시')) {
        return 'car';
    }

    if (combined.includes('walk') || combined.includes('도보')) {
        return 'walk';
    }

    return '';
}

function normalizeTransitInfo(value) {
    if (!isPlainObject(value)) {
        return null;
    }

    const start = readDisplayString(value.start ?? value.depTime);
    const end = readDisplayString(value.end ?? value.arrTime);
    const depTime = readDisplayString(value.depTime ?? value.start);
    const arrTime = readDisplayString(value.arrTime ?? value.end);

    if (!start && !end && !depTime && !arrTime) {
        return null;
    }

    return {
        ...value,
        start,
        end,
        depTime,
        arrTime
    };
}

function normalizeFlightInfo(value) {
    if (!isPlainObject(value)) {
        return null;
    }

    const normalized = {
        ...value,
        departure: readDisplayString(value.departure),
        arrival: readDisplayString(value.arrival),
        departureTime: readDisplayString(value.departureTime),
        arrivalTime: readDisplayString(value.arrivalTime),
        duration: readDisplayString(value.duration),
        flightNumber: readDisplayString(value.flightNumber),
        bookingRef: readDisplayString(value.bookingRef),
        terminal: readDisplayString(value.terminal),
        gate: readDisplayString(value.gate)
    };

    const hasAnyValue = Object.values(normalized).some((entry) => Boolean(entry));
    return hasAnyValue ? normalized : null;
}

function inferTimelineItemType({ isTransit, tag, title, location, note, memories }) {
    if (isTransit) {
        return 'transit';
    }

    if (isTimelineMemoItem({ tag })) {
        return 'memo';
    }

    if (!title && !location && note) {
        return 'memo';
    }

    if (memories.length > 0 || title || location) {
        return 'place';
    }

    return 'generic';
}

function normalizeTimelineItem(value, index, legacyFallbacks) {
    const item = isPlainObject(value) ? value : {};
    const transitInfo = normalizeTransitInfo(item.transitInfo);
    const flightInfo = normalizeFlightInfo(item.flightInfo);
    const transitType = inferTransitType(item) || (flightInfo ? 'airplane' : '');

    const rawMemories = Array.isArray(item.memories)
        ? item.memories
        : Array.isArray(item.memoryEntries)
            ? (recordLegacyFallback(legacyFallbacks, 'memories.memoryEntries'), item.memoryEntries)
            : Array.isArray(item.photos)
                ? (recordLegacyFallback(legacyFallbacks, 'memories.photos'), item.photos)
                : [];

    const memories = rawMemories
        .map((entry) => normalizeMemoryEntry(entry))
        .filter(Boolean);

    const expenses = coerceList(item.expenses)
        .map((entry) => normalizeExpenseEntry(entry))
        .filter(Boolean);

    const attachments = collectAttachmentCandidates(item, legacyFallbacks)
        .map((entry) => normalizeAttachmentEntry(entry))
        .filter(Boolean)
        .filter((entry, itemIndex, entries) => (
            entries.findIndex((candidate) => candidate.url === entry.url) === itemIndex
        ));

    const timeLabel = readDisplayString(item.time ?? item.timeLabel);
    const title = readDisplayString(item.title);
    const location = readDisplayString(item.location ?? item.place ?? item.address);
    const note = readDisplayString(item.note ?? item.memo ?? item.comment);
    const isTransit = Boolean(item.isTransit || transitInfo || flightInfo || transitType);
    const type = inferTimelineItemType({
        isTransit,
        tag: readDisplayString(item.tag),
        title,
        location,
        note,
        memories
    });
    const start = readDisplayString(transitInfo?.start ?? transitInfo?.depTime ?? flightInfo?.departureTime);
    const end = readDisplayString(transitInfo?.end ?? transitInfo?.arrTime ?? flightInfo?.arrivalTime);

    return {
        ...item,
        id: readString(item.id) || `item-${index}`,
        type,
        timeLabel,
        duration: normalizeDuration(item.duration),
        title,
        location,
        icon: readDisplayString(item.icon),
        tag: readDisplayString(item.tag) || (type === 'memo' ? '메모' : ''),
        image: readNullableString(item.image ?? item.photoUrl),
        note,
        isTransit,
        transitType,
        transitInfo,
        flightInfo,
        transit: isTransit ? {
            type: transitType,
            start,
            end,
            depTime: readDisplayString(transitInfo?.depTime ?? start),
            arrTime: readDisplayString(transitInfo?.arrTime ?? end),
            windowLabel: start && end ? `${start} - ${end}` : start || end,
            durationLabel: typeof item.duration === 'number'
                ? String(item.duration)
                : readDisplayString(item.duration ?? flightInfo?.duration),
            flight: flightInfo
        } : null,
        memories,
        attachments,
        expenses,
        budget: readNullableNumber(item.budget ?? item.cost ?? item.amount)
    };
}

function findCoverImageFromDays(days) {
    for (const day of days) {
        for (const item of day.items || []) {
            if (typeof item.image === 'string' && item.image.trim()) {
                return item.image.trim();
            }
        }
    }

    return null;
}

function normalizeTripMeta(data, days, legacyFallbacks) {
    const meta = isPlainObject(data.meta) ? data.meta : {};
    const dayDates = (days || []).map((day) => day.date).filter(Boolean);
    let startDate = normalizeDateOnly(meta.startDate ?? data.startDate);
    let endDate = normalizeDateOnly(meta.endDate ?? data.endDate);

    if (!startDate && dayDates.length > 0) {
        startDate = dayDates[0];
        recordLegacyFallback(legacyFallbacks, 'meta.startDateFromDays');
    }

    if (!endDate && dayDates.length > 0) {
        endDate = dayDates[dayDates.length - 1];
        recordLegacyFallback(legacyFallbacks, 'meta.endDateFromDays');
    }

    let subInfo = readDisplayString(meta.subInfo ?? data.dates);
    if (!subInfo) {
        subInfo = buildFallbackSubInfo(dayDates);
        recordLegacyFallback(legacyFallbacks, 'meta.subInfoFromDays');
    }

    let location = readDisplayString(meta.location ?? data.location);
    if (!location && subInfo) {
        location = deriveLocationFromSubInfo(subInfo);
        if (location) {
            recordLegacyFallback(legacyFallbacks, 'meta.locationFromSubInfo');
        }
    }

    let dayCount = readDisplayString(meta.dayCount);
    if (!dayCount) {
        dayCount = buildFallbackDayCount(days.length);
        recordLegacyFallback(legacyFallbacks, 'meta.dayCountFromDays');
    }

    let coverImage = readNullableString(meta.coverImage ?? meta.mapImage ?? data.coverImage ?? data.mapImage);
    if (!coverImage) {
        coverImage = findCoverImageFromDays(days);
        if (coverImage) {
            recordLegacyFallback(legacyFallbacks, 'meta.coverImageFromContent');
        }
    }

    const status = meta.status === 'completed' || meta.status === 'planning'
        ? meta.status
        : getTripStatus({
            days: days.map((day) => ({ date: day.date }))
        });

    return {
        title: readDisplayString(meta.title ?? data.title) || '제목 없는 여행',
        subInfo,
        dayCount,
        location,
        startDate,
        endDate,
        budget: readNullableNumber(meta.budget ?? data.budget),
        coverImage,
        mapImage: readNullableString(meta.mapImage ?? data.mapImage ?? coverImage),
        status
    };
}

function normalizeMembership(data, legacyFallbacks) {
    const membersByUid = {};
    let ownerUid = '';
    const members = data.members;

    if (isPlainObject(members)) {
        Object.entries(members).forEach(([uid, value]) => {
            const rawRole = typeof value === 'string' && value.trim()
                ? value.trim().toLowerCase()
                : isPlainObject(value) && typeof value.role === 'string'
                    ? value.role.trim().toLowerCase()
                    : 'member';
            const role = rawRole === 'owner' || rawRole === 'editor' || rawRole === 'viewer'
                ? rawRole
                : 'member';

            membersByUid[uid] = role;
            if (!ownerUid && role === 'owner') {
                ownerUid = uid;
            }
        });
    } else if (Array.isArray(members)) {
        recordLegacyFallback(legacyFallbacks, 'membership.membersArray');
        members.forEach((entry) => {
            const uid = readString(entry);
            if (uid) {
                membersByUid[uid] = 'member';
            }
        });
    }

    if (!ownerUid) {
        const createdBy = readString(data.createdBy);
        if (createdBy) {
            ownerUid = createdBy;
            membersByUid[createdBy] = membersByUid[createdBy] || 'owner';
            recordLegacyFallback(legacyFallbacks, 'membership.createdBy');
        }
    }

    if (!ownerUid) {
        const legacyUserId = readString(data.userId);
        if (legacyUserId) {
            ownerUid = legacyUserId;
            membersByUid[legacyUserId] = membersByUid[legacyUserId] || 'owner';
            recordLegacyFallback(legacyFallbacks, 'membership.userId');
        }
    }

    if (!ownerUid) {
        ownerUid = Object.keys(membersByUid)[0] || '';
    }

    if (ownerUid && !membersByUid[ownerUid]) {
        membersByUid[ownerUid] = 'owner';
    }

    return {
        ownerUid,
        membersByUid
    };
}

function normalizeShare(data, legacyFallbacks) {
    const share = isPlainObject(data.share) ? data.share : {};
    const directMode = readString(share.mode).toLowerCase() === 'link'
        ? 'link'
        : 'private';
    const directRole = readString(share.role ?? share.roleOnAccept).toLowerCase() === 'viewer'
        ? 'viewer'
        : 'editor';
    const directTokenId = readString(share.tokenId ?? share.id);

    if (directMode === 'link' && directTokenId) {
        return {
            mode: 'link',
            role: directRole,
            tokenId: directTokenId
        };
    }

    const collaboratorLink = isPlainObject(share.collaboratorLink) ? share.collaboratorLink : {};
    const generalAccess = isPlainObject(share.generalAccess) ? share.generalAccess : {};
    const collaboratorTokenId = readString(
        collaboratorLink.tokenId
        ?? share.collaboratorTokenId
        ?? share.inviteTokenId
        ?? share.shareId
        ?? share.id
        ?? data.shareId
        ?? data.inviteId
    );
    const collaboratorDefaultRole = readString(
        collaboratorLink.defaultRole
        ?? collaboratorLink.roleOnAccept
        ?? share.roleOnAccept
    ).toLowerCase() === 'viewer'
        ? 'viewer'
        : 'editor';
    const publicReadable = readBoolean(
        generalAccess.publicReadable
        ?? share.publicReadable
        ?? share.isPublic
        ?? data.publicReadable
        ?? data.isPublic
        ?? data.public
        ?? (generalAccess.mode === 'link_view')
    );
    const publicTokenId = readString(
        generalAccess.tokenId
        ?? share.publicTokenId
    );
    const mode = publicReadable || collaboratorTokenId ? 'link' : 'private';
    const role = publicReadable ? 'viewer' : collaboratorDefaultRole;
    const tokenId = publicReadable ? publicTokenId : collaboratorTokenId;

    if (!isPlainObject(data.share) && (data.shareId || data.inviteId || data.isPublic || data.public)) {
        recordLegacyFallback(legacyFallbacks, 'share.rootFields');
    }

    return {
        mode,
        role,
        tokenId
    };
}

function ensureUniqueCollectionIds(entries, buildFallbackId, legacyFallbacks, fallbackCode) {
    const seenIds = new Set();

    return coerceList(entries).map((entry, index) => {
        const safeEntry = isPlainObject(entry) ? entry : {};
        const baseId = readString(safeEntry.id) || buildFallbackId(index);
        let nextId = baseId;

        if (seenIds.has(nextId)) {
            recordLegacyFallback(legacyFallbacks, fallbackCode);

            let duplicateIndex = 1;
            do {
                nextId = `${baseId}__dup${duplicateIndex}`;
                duplicateIndex += 1;
            } while (seenIds.has(nextId));
        }

        seenIds.add(nextId);

        return {
            ...safeEntry,
            id: nextId
        };
    });
}

function normalizeTripDay(id, value, dayIndex, legacyFallbacks) {
    const safeDay = isPlainObject(value) ? value : {};
    const hasTimeline = Array.isArray(safeDay.timeline) || isPlainObject(safeDay.timeline);
    const hasItems = Array.isArray(safeDay.items) || isPlainObject(safeDay.items);
    const timelineItems = hasTimeline ? coerceList(safeDay.timeline) : [];
    const directItems = hasItems ? coerceList(safeDay.items) : [];
    const shouldPreferTimeline = hasTimeline
        && (
            !hasItems
            || (directItems.length === 0 && timelineItems.length > 0)
        );

    if (shouldPreferTimeline) {
        recordLegacyFallback(legacyFallbacks, 'days.timeline');
    }

    const itemsSource = shouldPreferTimeline ? timelineItems : directItems;
    const items = ensureUniqueCollectionIds(
        coerceList(itemsSource).map((item, itemIndex) => normalizeTimelineItem(item, itemIndex, legacyFallbacks)),
        (itemIndex) => `item-${itemIndex}`,
        legacyFallbacks,
        'days.items.duplicateId'
    );

    return {
        ...safeDay,
        id: readString(safeDay.id) || `${id}-day-${dayIndex}`,
        date: normalizeDateOnly(safeDay.date),
        items
    };
}

export function normalizeTripDocument(id, data) {
    const legacyFallbacks = [];
    const safeData = isPlainObject(data) ? data : {};
    const days = ensureUniqueCollectionIds(
        coerceList(safeData.days).map((day, dayIndex) => normalizeTripDay(id, day, dayIndex, legacyFallbacks)),
        (dayIndex) => `${id}-day-${dayIndex}`,
        legacyFallbacks,
        'days.duplicateId'
    );

    return {
        id,
        meta: normalizeTripMeta(safeData, days, legacyFallbacks),
        membership: normalizeMembership(safeData, legacyFallbacks),
        share: normalizeShare(safeData, legacyFallbacks),
        days,
        legacyFallbacks: Array.from(new Set(legacyFallbacks))
    };
}

function resolveTripStatusFromEndDate(endDate, currentStatus = 'planning') {
    if (!endDate) {
        return currentStatus === 'completed' ? 'completed' : 'planning';
    }

    const target = new Date(endDate);
    if (Number.isNaN(target.getTime())) {
        return currentStatus === 'completed' ? 'completed' : 'planning';
    }

    target.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return today > target ? 'completed' : 'planning';
}

export function buildTripInfoWritePatch(input, currentTrip) {
    const title = readDisplayString(input?.title ?? currentTrip?.meta?.title);
    const location = readDisplayString(input?.location ?? currentTrip?.meta?.location);
    const startDate = readString(input?.startDate ?? currentTrip?.meta?.startDate);
    const endDate = readString(input?.endDate ?? currentTrip?.meta?.endDate);
    const hasCoverImageInput = Boolean(input) && Object.prototype.hasOwnProperty.call(input, 'coverImage');
    const coverImage = hasCoverImageInput
        ? readNullableString(input?.coverImage)
        : undefined;

    if ((startDate && !isIsoDateInput(startDate)) || (endDate && !isIsoDateInput(endDate))) {
        throw new Error('날짜는 YYYY-MM-DD 형식으로 입력해 주세요.');
    }

    const savePlan = buildTripInfoSavePlan({
        title,
        location,
        startStr: startDate,
        endStr: endDate,
        currentDayIndex: 0
    });

    if (savePlan.status === 'missing_title') {
        throw new Error('여행 제목을 입력해 주세요.');
    }

    if (savePlan.status === 'title_too_long') {
        throw new Error(getTripTitleTooLongMessage());
    }

    if (savePlan.status === 'missing_dates') {
        throw new Error('시작일과 종료일을 모두 입력해 주세요.');
    }

    if (savePlan.status === 'invalid_range' || !savePlan.metaUpdates || !savePlan.syncRange) {
        throw new Error('종료일은 시작일보다 같거나 뒤여야 해요.');
    }

    return {
        metaPatch: {
            ...savePlan.metaUpdates,
            title,
            location,
            startDate,
            endDate,
            ...(hasCoverImageInput ? { coverImage } : {}),
            status: resolveTripStatusFromEndDate(endDate, currentTrip?.meta?.status)
        },
        syncRange: savePlan.syncRange
    };
}

export function buildTimelineItemWritePatch(input, currentTrip, target) {
    const dayId = readString(target?.dayId);
    const itemId = readString(target?.itemId);
    const itemIndexInput = typeof target?.itemIndex === 'number' && Number.isInteger(target.itemIndex)
        ? target.itemIndex
        : -1;

    if (!dayId || !itemId || !currentTrip) {
        throw new Error('수정할 일정을 찾을 수 없어요.');
    }

    const dayIndex = (currentTrip.days || []).findIndex((day) => day.id === dayId);
    if (dayIndex < 0) {
        throw new Error('수정할 일정을 찾을 수 없어요.');
    }

    const targetDay = currentTrip.days[dayIndex];
    const itemIndex = itemIndexInput >= 0 && targetDay.items?.[itemIndexInput]
        ? itemIndexInput
        : (targetDay.items || []).findIndex((item) => item.id === itemId);
    if (itemIndex < 0) {
        throw new Error('수정할 일정을 찾을 수 없어요.');
    }

    const targetItem = targetDay.items[itemIndex];
    const hasTitleInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'title');
    const title = readDisplayString(input?.title);
    const note = readDisplayString(input?.note);
    const hasTimeInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'time');
    const hasLocationInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'location');
    const hasDurationInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'durationMinutes');
    const hasCategoryInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'category');
    const hasMemoriesInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'memories');
    const hasExpensesInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'expenses');
    const hasAttachmentsInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'attachments');
    const hasTransitTypeInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'transitType');
    const hasStartTimeInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'startTime');
    const hasEndTimeInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'endTime');
    const hasDepartureInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'departure');
    const hasArrivalInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'arrival');
    const hasDepartureAirportCodeInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'departureAirportCode');
    const hasArrivalAirportCodeInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'arrivalAirportCode');
    const hasDepartureTimeZoneInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'departureTimeZone');
    const hasArrivalTimeZoneInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'arrivalTimeZone');
    const hasArrivalDayOffsetInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'arrivalDayOffset');
    const hasFlightNumberInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'flightNumber');
    const hasBookingRefInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'bookingRef');
    const hasTerminalInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'terminal');
    const hasGateInput = isPlainObject(input) && Object.prototype.hasOwnProperty.call(input, 'gate');
    const time = readString(input?.time);
    const location = readDisplayString(input?.location);
    const durationMinutes = Number(input?.durationMinutes);
    const categoryCode = readString(input?.category) || 'custom';
    const selectedPlace = normalizeLooseObject(input?.place);
    const clearPlace = readBoolean(input?.clearPlace);
    const memories = hasMemoriesInput
        ? coerceList(input?.memories)
            .map((entry) => normalizeMemoryEntry(entry))
            .filter(Boolean)
        : null;
    const expenses = hasExpensesInput
        ? coerceList(input?.expenses)
            .map((entry) => normalizeExpenseEntry(entry))
            .filter(Boolean)
        : null;
    const attachments = hasAttachmentsInput
        ? coerceList(input?.attachments)
            .map((entry) => normalizeAttachmentEntry(entry))
            .filter(Boolean)
        : null;

    if (targetItem?.type === 'memo' && !note) {
        throw new Error('메모를 입력해 주세요.');
    }

    if (hasTitleInput && targetItem?.type !== 'memo' && !title) {
        throw new Error('일정 이름을 입력해 주세요.');
    }

    if (hasTimeInput) {
        if (!time || !is24HourTimeInput(time)) {
            throw new Error('시간은 HH:MM 형식으로 입력해 주세요.');
        }
    }

    if (hasDurationInput && targetItem?.type !== 'memo' && targetItem?.type !== 'transit') {
        if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
            throw new Error('머무는 시간은 1분 이상으로 입력해 주세요.');
        }
    }

    const itemPatch = {
        note,
        ...(targetItem?.type === 'memo'
            ? { title: note }
            : hasTitleInput
                ? { title }
                : {})
    };

    if (hasTimeInput && targetItem?.type !== 'transit') {
        itemPatch.time = normalize24HourTimeInput(time);
    }

    if (hasDurationInput && targetItem?.type !== 'memo' && targetItem?.type !== 'transit') {
        itemPatch.duration = Math.max(1, Math.floor(durationMinutes));
    }

    if (hasCategoryInput && targetItem?.type !== 'memo' && targetItem?.type !== 'transit') {
        const categoryMeta = TIMELINE_CATEGORY_WRITE_META[categoryCode] || TIMELINE_CATEGORY_WRITE_META.custom;
        itemPatch.icon = categoryMeta.icon;
        itemPatch.tag = categoryMeta.tag;
    }

    if (hasLocationInput && targetItem?.type !== 'memo' && targetItem?.type !== 'transit') {
        itemPatch.location = location;

        if (selectedPlace) {
            itemPatch.placeId = readString(selectedPlace?.placeId);
            itemPatch.lat = readNullableNumber(selectedPlace?.latitude);
            itemPatch.lng = readNullableNumber(selectedPlace?.longitude);
            itemPatch.countryCode = readString(selectedPlace?.countryCode);
        } else if (clearPlace) {
            itemPatch.placeId = '';
            itemPatch.lat = null;
            itemPatch.lng = null;
            itemPatch.countryCode = '';
        }
    }

    if (hasMemoriesInput && targetItem?.type !== 'memo') {
        itemPatch.memories = memories;
    }

    if (hasExpensesInput && targetItem?.type !== 'memo') {
        const totalBudget = (expenses || []).reduce((sum, expense) => (
            sum + (Number(expense?.amount) || 0)
        ), 0);

        itemPatch.expenses = expenses;
        itemPatch.budget = totalBudget > 0 ? totalBudget : null;
    }

    if (hasAttachmentsInput) {
        itemPatch.attachments = attachments;
    }

    const isTransitItem = targetItem?.type === 'transit' || targetItem?.isTransit;
    const targetTransitType = readString(targetItem?.transitType || targetItem?.transit?.type);
    const transitType = hasTransitTypeInput
        ? readString(input?.transitType) || targetTransitType
        : targetTransitType;
    const hasAirplaneFieldInput = hasTransitTypeInput
        || hasStartTimeInput
        || hasEndTimeInput
        || hasDurationInput
        || hasDepartureInput
        || hasArrivalInput
        || hasDepartureAirportCodeInput
        || hasArrivalAirportCodeInput
        || hasDepartureTimeZoneInput
        || hasArrivalTimeZoneInput
        || hasArrivalDayOffsetInput
        || hasFlightNumberInput
        || hasBookingRefInput
        || hasTerminalInput
        || hasGateInput;

    if (isTransitItem && transitType === 'airplane' && hasAirplaneFieldInput) {
        const currentFlightInfo = normalizeLooseObject(targetItem?.flightInfo);
        const currentTransitInfo = normalizeLooseObject(targetItem?.transitInfo);
        const startTime = hasStartTimeInput
            ? readString(input?.startTime)
            : readString(currentTransitInfo?.start || currentTransitInfo?.depTime || currentFlightInfo?.departureTime);
        const endTime = hasEndTimeInput
            ? readString(input?.endTime)
            : readString(currentTransitInfo?.end || currentTransitInfo?.arrTime || currentFlightInfo?.arrivalTime);

        if (!is24HourTimeInput(startTime) || !is24HourTimeInput(endTime)) {
            throw new Error('출발 시간과 도착 시간을 모두 HH:MM 형식으로 선택해 주세요.');
        }

        const normalizedStartTime = normalize24HourTimeInput(startTime);
        const normalizedEndTime = normalize24HourTimeInput(endTime);
        const derivedDurationMinutes = getTransitDurationMinutes(normalizedStartTime, normalizedEndTime);
        const currentDurationMinutes = parseTransitDurationValue(
            readDisplayString(targetItem?.duration || currentFlightInfo?.duration || targetItem?.transit?.durationLabel)
        );
        const nextDurationMinutes = Number.isFinite(durationMinutes) && durationMinutes > 0
            ? Math.max(1, Math.floor(durationMinutes))
            : derivedDurationMinutes || currentDurationMinutes;

        if (!Number.isFinite(nextDurationMinutes) || nextDurationMinutes < 1) {
            throw new Error('소요 시간을 계산할 수 없어요. 시간을 다시 확인해 주세요.');
        }

        const departure = hasDepartureInput
            ? readDisplayString(input?.departure)
            : readDisplayString(currentFlightInfo?.departure);
        const arrival = hasArrivalInput
            ? readDisplayString(input?.arrival)
            : readDisplayString(currentFlightInfo?.arrival);
        const departureAirport = resolveAirport(input?.departureAirportCode || departure);
        const arrivalAirport = resolveAirport(input?.arrivalAirportCode || arrival);
        const departureShortLabel = departureAirport?.code || departure;
        const arrivalShortLabel = arrivalAirport?.code || arrival;
        const departureLabel = departureAirport?.name || readDisplayString(currentFlightInfo?.departureLabel) || departure;
        const arrivalLabel = arrivalAirport?.name || readDisplayString(currentFlightInfo?.arrivalLabel) || arrival;

        itemPatch.time = formatDuration(nextDurationMinutes);
        itemPatch.duration = nextDurationMinutes;
        itemPatch.location = departureLabel && arrivalLabel
            ? `${departureLabel} - ${arrivalLabel}`
            : readDisplayString(targetItem?.location);
        itemPatch.transitType = 'airplane';
        itemPatch.fixedDuration = true;
        itemPatch.transitInfo = {
            ...currentTransitInfo,
            start: normalizedStartTime,
            end: normalizedEndTime
        };
        itemPatch.flightInfo = {
            ...currentFlightInfo,
            departure: departureShortLabel,
            arrival: arrivalShortLabel,
            departureLabel,
            arrivalLabel,
            departureTime: normalizedStartTime,
            arrivalTime: normalizedEndTime,
            duration: formatDuration(nextDurationMinutes),
            departureAirportCode: hasDepartureAirportCodeInput
                ? readDisplayString(input?.departureAirportCode) || departureAirport?.code
                : readDisplayString(currentFlightInfo?.departureAirportCode) || departureAirport?.code,
            arrivalAirportCode: hasArrivalAirportCodeInput
                ? readDisplayString(input?.arrivalAirportCode) || arrivalAirport?.code
                : readDisplayString(currentFlightInfo?.arrivalAirportCode) || arrivalAirport?.code,
            departureTimeZone: hasDepartureTimeZoneInput
                ? readDisplayString(input?.departureTimeZone) || departureAirport?.timeZone
                : readDisplayString(currentFlightInfo?.departureTimeZone) || departureAirport?.timeZone,
            arrivalTimeZone: hasArrivalTimeZoneInput
                ? readDisplayString(input?.arrivalTimeZone) || arrivalAirport?.timeZone
                : readDisplayString(currentFlightInfo?.arrivalTimeZone) || arrivalAirport?.timeZone,
            arrivalDayOffset: hasArrivalDayOffsetInput
                ? readPositiveInteger(input?.arrivalDayOffset)
                : readPositiveInteger(currentFlightInfo?.arrivalDayOffset),
            flightNumber: hasFlightNumberInput ? readDisplayString(input?.flightNumber) : readDisplayString(currentFlightInfo?.flightNumber),
            bookingRef: hasBookingRefInput ? readDisplayString(input?.bookingRef) : readDisplayString(currentFlightInfo?.bookingRef),
            terminal: hasTerminalInput ? readDisplayString(input?.terminal) : readDisplayString(currentFlightInfo?.terminal),
            gate: hasGateInput ? readDisplayString(input?.gate) : readDisplayString(currentFlightInfo?.gate)
        };
    }

    return {
        dayIndex,
        itemIndex,
        itemPatch
    };
}

function resolveTimelineInsertTarget(currentTrip, target, missingDayMessage) {
    const dayId = readString(target?.dayId);
    const insertAfterItemId = readString(target?.insertAfterItemId);
    const insertAfterItemIndexInput = typeof target?.insertAfterItemIndex === 'number'
        && Number.isInteger(target.insertAfterItemIndex)
        ? target.insertAfterItemIndex
        : null;

    if (!dayId || !currentTrip) {
        throw new Error(missingDayMessage);
    }

    const dayIndex = (currentTrip.days || []).findIndex((day) => day.id === dayId);
    if (dayIndex < 0) {
        throw new Error(missingDayMessage);
    }

    const targetDay = currentTrip.days[dayIndex];
    const targetItems = Array.isArray(targetDay?.items) ? targetDay.items : [];
    const anchoredItemIndex = insertAfterItemId
        ? targetItems.findIndex((item) => item.id === insertAfterItemId)
        : -1;
    const insertIndex = anchoredItemIndex >= 0
        ? anchoredItemIndex + 1
        : insertAfterItemIndexInput === null
            ? targetItems.length
            : Math.min(Math.max(insertAfterItemIndexInput + 1, 0), targetItems.length);

    return {
        dayIndex,
        targetItems,
        insertIndex
    };
}

function getTransitDurationMinutes(startTime, endTime) {
    const parsedStart = parseTimeStr(startTime);
    const parsedEnd = parseTimeStr(endTime);

    if (parsedStart === null || parsedEnd === null) {
        return null;
    }

    if (parsedStart === parsedEnd) {
        return 0;
    }

    return parsedEnd > parsedStart
        ? parsedEnd - parsedStart
        : (24 * 60) - parsedStart + parsedEnd;
}

function resolveTimelineItemTarget(currentTrip, target, missingItemMessage) {
    const dayId = readString(target?.dayId);
    const itemId = readString(target?.itemId);
    const itemIndexInput = typeof target?.itemIndex === 'number' && Number.isInteger(target.itemIndex)
        ? target.itemIndex
        : -1;

    if (!dayId || !itemId || !currentTrip) {
        throw new Error(missingItemMessage);
    }

    const dayIndex = (currentTrip.days || []).findIndex((day) => day.id === dayId);
    if (dayIndex < 0) {
        throw new Error(missingItemMessage);
    }

    const targetDay = currentTrip.days[dayIndex];
    const itemIndex = itemIndexInput >= 0 && targetDay.items?.[itemIndexInput]
        ? itemIndexInput
        : (targetDay.items || []).findIndex((item) => item.id === itemId);

    if (itemIndex < 0) {
        throw new Error(missingItemMessage);
    }

    return {
        dayIndex,
        itemIndex,
        targetItem: targetDay.items[itemIndex]
    };
}

export function buildTimelineItemCreatePatch(input, currentTrip, target) {
    const { dayIndex, insertIndex } = resolveTimelineInsertTarget(
        currentTrip,
        target,
        '일정을 추가할 날짜를 찾을 수 없어요.'
    );

    const selectedPlace = isPlainObject(input?.place) ? input.place : null;
    const placeName = readDisplayString(selectedPlace?.name);
    const placeAddress = readDisplayString(selectedPlace?.address);
    const resolvedLocation = readDisplayString(input?.location) || placeAddress || placeName;
    const title = readDisplayString(input?.title) || placeName || readDisplayString(input?.location);
    if (!title) {
        throw new Error('일정 이름을 입력해 주세요.');
    }

    const time = readString(input?.time);
    if (!is24HourTimeInput(time)) {
        throw new Error('시간은 HH:MM 형식으로 입력해 주세요.');
    }

    const durationMinutes = Number(input?.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
        throw new Error('머무는 시간은 1분 이상으로 입력해 주세요.');
    }

    const categoryCode = readString(input?.category) || 'custom';
    const categoryMeta = TIMELINE_CATEGORY_WRITE_META[categoryCode] || TIMELINE_CATEGORY_WRITE_META.custom;

    return {
        dayIndex,
        insertIndex,
        item: {
            id: buildGeneratedTimelineItemId(),
            time: normalize24HourTimeInput(time),
            title,
            location: resolvedLocation,
            icon: categoryMeta.icon,
            tag: categoryMeta.tag,
            image: null,
            note: readDisplayString(input?.note),
            isTransit: false,
            duration: Math.max(1, Math.floor(durationMinutes)),
            placeId: readString(selectedPlace?.placeId),
            lat: readNullableNumber(selectedPlace?.latitude),
            lng: readNullableNumber(selectedPlace?.longitude),
            memories: [],
            attachments: [],
            expenses: [],
            budget: null
        }
    };
}

export function buildTimelineMemoCreatePatch(input, currentTrip, target) {
    const { dayIndex, insertIndex } = resolveTimelineInsertTarget(
        currentTrip,
        target,
        '메모를 추가할 날짜를 찾을 수 없어요.'
    );

    const content = readDisplayString(input?.content ?? input?.title ?? input?.note);
    if (!content) {
        throw new Error('메모를 입력해 주세요.');
    }

    const time = readString(input?.time);
    if (!is24HourTimeInput(time)) {
        throw new Error('시간은 HH:MM 형식으로 입력해 주세요.');
    }

    return {
        dayIndex,
        insertIndex,
        item: {
            id: buildGeneratedTimelineItemId(),
            time: normalize24HourTimeInput(time),
            title: content,
            location: '',
            icon: 'sticky_note_2',
            tag: '메모',
            image: null,
            note: '',
            isTransit: false,
            memories: [],
            attachments: [],
            expenses: [],
            budget: null
        }
    };
}

export function buildTimelineMemoryAppendPatch(input, currentTrip, target) {
    const { dayIndex, itemIndex } = resolveTimelineItemTarget(
        currentTrip,
        target,
        '추억을 추가할 일정을 찾을 수 없어요.'
    );

    const uploadedPhotoUrls = Array.isArray(input?.uploadedPhotoUrls)
        ? input.uploadedPhotoUrls
            .map((entry) => readString(entry))
            .filter(Boolean)
        : [];
    const createdAt = readString(input?.createdAt) || new Date().toISOString();
    const memoryEntries = createMemoryEntries(uploadedPhotoUrls, '', createdAt);

    if (memoryEntries.length === 0) {
        throw new Error('사진을 한 장 이상 선택해 주세요.');
    }

    return {
        dayIndex,
        itemIndex,
        memoryEntries
    };
}

export function buildTimelineManualTransitCreatePatch(input, currentTrip, target) {
    const { dayIndex, targetItems, insertIndex } = resolveTimelineInsertTarget(
        currentTrip,
        target,
        '이동 카드를 추가할 날짜를 찾을 수 없어요.'
    );

    const transitType = readString(input?.transitType) || 'walk';
    const meta = getTransitTypeMeta(transitType);
    const startTime = readString(input?.startTime);
    const endTime = readString(input?.endTime);

    if (!is24HourTimeInput(startTime) || !is24HourTimeInput(endTime)) {
        throw new Error('출발 시간과 도착 시간을 모두 HH:MM 형식으로 선택해 주세요.');
    }

    const explicitDurationMinutes = Number(input?.durationMinutes);
    const derivedDurationMinutes = getTransitDurationMinutes(startTime, endTime);
    const durationMinutes = Number.isFinite(explicitDurationMinutes) && explicitDurationMinutes > 0
        ? Math.max(1, Math.floor(explicitDurationMinutes))
        : derivedDurationMinutes;
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
        throw new Error('도착 시간은 출발 시간보다 뒤로 선택해 주세요.');
    }

    const normalizedStartTime = normalize24HourTimeInput(startTime);
    const normalizedEndTime = normalize24HourTimeInput(endTime);
    const nextItem = insertIndex < targetItems.length ? targetItems[insertIndex] || null : null;
    const parsedEndTime = parseTimeStr(normalizedEndTime);
    const parsedNextTime = parseTimeStr(String(nextItem?.time || ''));
    const adjustedNextItemTime = nextItem
        && !nextItem.isTransit
        && parsedEndTime !== null
        && parsedNextTime !== null
        && parsedEndTime > parsedNextTime
            ? normalizedEndTime
            : null;
    const title = readDisplayString(input?.title);
    const note = readDisplayString(input?.note);
    const departure = readDisplayString(input?.departure);
    const arrival = readDisplayString(input?.arrival);
    const departureAirport = resolveAirport(input?.departureAirportCode || departure);
    const arrivalAirport = resolveAirport(input?.arrivalAirportCode || arrival);
    const isAirplane = transitType === 'airplane';
    const departureShortLabel = departureAirport?.code || departure;
    const arrivalShortLabel = arrivalAirport?.code || arrival;
    const resolvedTitle = isAirplane
        ? title || [departureShortLabel, arrivalShortLabel].filter(Boolean).join(' → ') || meta.title
        : title || meta.title;

    return {
        dayIndex,
        insertIndex,
        adjustedNextItemTime,
        adjustedNextItemIndex: adjustedNextItemTime ? insertIndex : -1,
        item: {
            id: buildGeneratedTimelineItemId(),
            time: formatDuration(durationMinutes),
            duration: durationMinutes,
            title: resolvedTitle,
            location: isAirplane && (departureAirport || arrivalAirport)
                ? [
                    departureAirport?.name || departure,
                    arrivalAirport?.name || arrival
                ].filter(Boolean).join(' - ')
                : (isAirplane && departure && arrival ? `${departure} - ${arrival}` : ''),
            icon: meta.icon,
            tag: meta.tag,
            isTransit: true,
            image: null,
            note,
            transitType,
            fixedDuration: true,
            transitInfo: {
                start: normalizedStartTime,
                end: normalizedEndTime
            },
            detailedSteps: [],
            flightInfo: isAirplane && meta.flightInfoDefaults
                ? {
                    ...meta.flightInfoDefaults,
                    departure: departureShortLabel,
                    arrival: arrivalShortLabel,
                    departureLabel: departureAirport?.name || departure,
                    arrivalLabel: arrivalAirport?.name || arrival,
                    departureTime: normalizedStartTime,
                    arrivalTime: normalizedEndTime,
                    duration: formatDuration(durationMinutes),
                    departureAirportCode: readDisplayString(input?.departureAirportCode) || departureAirport?.code,
                    arrivalAirportCode: readDisplayString(input?.arrivalAirportCode) || arrivalAirport?.code,
                    departureTimeZone: readDisplayString(input?.departureTimeZone) || departureAirport?.timeZone,
                    arrivalTimeZone: readDisplayString(input?.arrivalTimeZone) || arrivalAirport?.timeZone,
                    arrivalDayOffset: readPositiveInteger(input?.arrivalDayOffset),
                    flightNumber: readDisplayString(input?.flightNumber),
                    bookingRef: readDisplayString(input?.bookingRef),
                    terminal: readDisplayString(input?.terminal),
                    gate: readDisplayString(input?.gate)
                }
                : null,
            expenses: [],
            attachments: []
        }
    };
}

export function buildTimelineQuickRouteCreatePatch(routeOption, currentTrip, target) {
    const { dayIndex, targetItems, insertIndex } = resolveTimelineInsertTarget(
        currentTrip,
        target,
        '이동 카드를 추가할 날짜를 찾을 수 없어요.'
    );

    const durationMinutes = Number(routeOption?.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
        throw new Error('빠른 경로 정보를 불러오지 못했어요.');
    }

    const transitType = readString(routeOption?.transitType) || 'walk';
    const summaryIcon = readDisplayString(routeOption?.summaryIcon) || 'commute';
    const summaryTag = readDisplayString(routeOption?.summaryTag) || '이동';
    const summaryTitle = readDisplayString(routeOption?.summaryTitle) || '이동';
    const durationText = readDisplayString(routeOption?.durationText) || `${Math.max(1, Math.floor(durationMinutes))}분`;
    const distanceText = readDisplayString(routeOption?.distanceText);
    const detailedSteps = Array.isArray(routeOption?.detailedSteps)
        ? routeOption.detailedSteps
            .filter((entry) => isPlainObject(entry))
            .map((entry) => ({ ...entry }))
        : [];
    const routeGroupId = `mobile_route_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const insertAfterIndex = insertIndex - 1;
    const { routeStartTime, routeEndTime } = buildGoogleRouteTiming(
        targetItems,
        insertAfterIndex,
        Math.max(1, Math.floor(durationMinutes))
    );
    const previousItem = insertAfterIndex >= 0 ? targetItems[insertAfterIndex] || null : null;
    const nextItem = insertIndex < targetItems.length ? targetItems[insertIndex] || null : null;
    const adjustedNextItemTime = getAdjustedNextItemTime(
        previousItem,
        nextItem,
        Math.max(1, Math.floor(durationMinutes)) * 60
    );

    return {
        dayIndex,
        insertIndex,
        adjustedNextItemTime,
        adjustedNextItemIndex: adjustedNextItemTime ? insertIndex : -1,
        item: {
            id: buildGeneratedTimelineItemId(),
            time: durationText,
            duration: Math.max(1, Math.floor(durationMinutes)),
            title: summaryTitle,
            location: '',
            icon: summaryIcon,
            tag: summaryTag,
            isTransit: true,
            image: null,
            note: '',
            transitType,
            fixedDuration: true,
            transitInfo: {
                start: routeStartTime || '',
                end: routeEndTime || '',
                summary: distanceText ? `총 거리: ${distanceText}` : ''
            },
            detailedSteps: detailedSteps.length > 0 ? detailedSteps : [],
            routeGroupId,
            expenses: [],
            attachments: []
        }
    };
}

export function buildTimelineItemCopyPatch(currentTrip, target, source) {
    const targetDayId = readString(target?.dayId);
    const insertAfterItemId = readString(target?.insertAfterItemId);
    const insertAfterItemIndexInput = typeof target?.insertAfterItemIndex === 'number'
        && Number.isInteger(target.insertAfterItemIndex)
        ? target.insertAfterItemIndex
        : null;
    const sourceDayId = readString(source?.dayId);
    const sourceItemId = readString(source?.itemId);
    const sourceItemIndexInput = typeof source?.itemIndex === 'number'
        && Number.isInteger(source.itemIndex)
        ? source.itemIndex
        : -1;

    if (!currentTrip || !targetDayId || !sourceDayId || !sourceItemId) {
        throw new Error('가져올 기존 일정을 찾을 수 없어요.');
    }

    const targetDayIndex = (currentTrip.days || []).findIndex((day) => day.id === targetDayId);
    if (targetDayIndex < 0) {
        throw new Error('일정을 추가할 날짜를 찾을 수 없어요.');
    }

    const targetDay = currentTrip.days[targetDayIndex];
    const targetItems = Array.isArray(targetDay?.items) ? targetDay.items : [];
    const anchoredItemIndex = insertAfterItemId
        ? targetItems.findIndex((item) => item.id === insertAfterItemId)
        : -1;
    const insertIndex = anchoredItemIndex >= 0
        ? anchoredItemIndex + 1
        : insertAfterItemIndexInput === null
            ? targetItems.length
            : Math.min(Math.max(insertAfterItemIndexInput + 1, 0), targetItems.length);

    const sourceDayIndex = (currentTrip.days || []).findIndex((day) => day.id === sourceDayId);
    if (sourceDayIndex < 0) {
        throw new Error('가져올 기존 일정을 찾을 수 없어요.');
    }

    const sourceDay = currentTrip.days[sourceDayIndex];
    const sourceItems = Array.isArray(sourceDay?.items) ? sourceDay.items : [];
    const sourceItemIndex = sourceItemIndexInput >= 0 && sourceItems?.[sourceItemIndexInput]
        ? sourceItemIndexInput
        : sourceItems.findIndex((item) => item.id === sourceItemId);

    if (sourceItemIndex < 0) {
        throw new Error('가져올 기존 일정을 찾을 수 없어요.');
    }

    const sourceItem = sourceItems[sourceItemIndex];
    if (!sourceItem || sourceItem.type === 'memo') {
        throw new Error('가져올 기존 일정을 찾을 수 없어요.');
    }

    return {
        dayIndex: targetDayIndex,
        insertIndex,
        sourceItem
    };
}

export function buildCopiedTimelineItemWritePayload(sourceItem) {
    if (!sourceItem) {
        throw new Error('가져올 기존 일정을 찾을 수 없어요.');
    }

    return {
        id: buildGeneratedTimelineItemId(),
        time: readDisplayString(sourceItem.time ?? sourceItem.timeLabel),
        title: readDisplayString(sourceItem.title),
        location: readDisplayString(sourceItem.location),
        icon: readDisplayString(sourceItem.icon),
        tag: readDisplayString(sourceItem.tag),
        image: readNullableString(sourceItem.image),
        note: readDisplayString(sourceItem.note),
        isTransit: Boolean(sourceItem.isTransit),
        transitType: readDisplayString(sourceItem.transitType),
        transitInfo: normalizeLooseObject(sourceItem.transitInfo),
        flightInfo: normalizeLooseObject(sourceItem.flightInfo),
        duration: sourceItem.duration ?? undefined,
        placeId: readString(sourceItem.placeId),
        lat: readNullableNumber(sourceItem.lat),
        lng: readNullableNumber(sourceItem.lng),
        photoReference: readNullableString(sourceItem.photoReference),
        geometry: normalizeLooseObject(sourceItem.geometry),
        address_components: Array.isArray(sourceItem.address_components)
            ? sourceItem.address_components.map((entry) => normalizeLooseObject(entry) || entry)
            : undefined,
        countryCode: readString(sourceItem.countryCode),
        memories: [],
        attachments: [],
        expenses: [],
        budget: null
    };
}
