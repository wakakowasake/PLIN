import {
    formatDuration,
    minutesTo24Hour,
    parseDurationStr,
    parseTimeStr
} from '../../core/utils/time-value-helpers.js';

const TRANSIT_TYPE_META = {
    airplane: {
        tag: '비행기',
        icon: 'flight',
        title: '비행기로 이동',
        flightInfoDefaults: {
            departure: '',
            arrival: '',
            flightNumber: '',
            bookingRef: '',
            terminal: '',
            gate: ''
        }
    },
    train: { tag: '기차', icon: 'train', title: '기차로 이동' },
    subway: { tag: '전철', icon: 'subway', title: '전철로 이동' },
    bus: { tag: '버스', icon: 'directions_bus', title: '버스로 이동' },
    taxi: { tag: '택시', icon: 'local_taxi', title: '택시로 이동' },
    bike: { tag: '자전거', icon: 'directions_bike', title: '자전거로 이동' },
    boat: { tag: '배', icon: 'directions_boat', title: '배로 이동' },
    car: { tag: '차량', icon: 'directions_car', title: '차량으로 이동' },
    walk: { tag: '도보', icon: 'directions_walk', title: '도보로 이동' }
};

const DEFAULT_TRANSIT_DURATION = 30;

export function getTransitTypeMeta(type) {
    const meta = TRANSIT_TYPE_META[type] || TRANSIT_TYPE_META.walk;
    return {
        ...meta,
        flightInfoDefaults: meta.flightInfoDefaults ? { ...meta.flightInfoDefaults } : null
    };
}

export function parseTransitDurationValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (value === undefined || value === null || value === '') {
        return 0;
    }

    const text = String(value).trim();
    const parsed = parseDurationStr(text);
    if (parsed > 0) {
        return parsed;
    }

    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : 0;
}

export function getTransitDefaultTimes(timeline, index) {
    if (!Array.isArray(timeline) || index < 0) {
        return { startTime: '', endTime: '' };
    }

    const prevItem = timeline[index];
    if (!prevItem) {
        return { startTime: '', endTime: '' };
    }

    let startTime = '';
    let endTime = '';

    if (prevItem.isTransit && prevItem.transitInfo?.end) {
        startTime = prevItem.transitInfo.end;
    } else if (prevItem.time) {
        const prevTimeMinutes = parseTimeStr(prevItem.time);
        if (prevTimeMinutes !== null) {
            const prevDuration = parseTransitDurationValue(prevItem.duration) || DEFAULT_TRANSIT_DURATION;
            startTime = minutesTo24Hour(prevTimeMinutes + prevDuration);
        }
    }

    if (startTime) {
        const startMinutes = parseTimeStr(startTime);
        if (startMinutes !== null) {
            endTime = minutesTo24Hour(startMinutes + DEFAULT_TRANSIT_DURATION);
        }
    }

    return { startTime, endTime };
}

export function buildInsertedTransitItem(type, timeline, index) {
    const meta = getTransitTypeMeta(type);
    const { startTime, endTime } = getTransitDefaultTimes(timeline, index);

    return {
        time: startTime ? `${DEFAULT_TRANSIT_DURATION}분` : '',
        title: '',
        location: '',
        icon: meta.icon,
        tag: meta.tag,
        tagColor: 'green',
        isTransit: true,
        transitType: type,
        duration: `${DEFAULT_TRANSIT_DURATION}분`,
        transitInfo: startTime ? { start: startTime, end: endTime } : null,
        detailedSteps: [],
        flightInfo: type === 'airplane' ? { ...meta.flightInfoDefaults } : null
    };
}

export function resolveTransitEndTime(start, nextItem) {
    if (!start) return '';

    let targetMinutes = null;

    if (nextItem) {
        if (nextItem.isTransit && nextItem.transitInfo?.start) {
            const [hours, minutes] = nextItem.transitInfo.start.split(':').map(Number);
            targetMinutes = (hours * 60) + minutes;
        } else if (!nextItem.isTransit) {
            targetMinutes = parseTimeStr(nextItem.time);
        }
    }

    if (targetMinutes === null) {
        const [hours, minutes] = start.split(':').map(Number);
        targetMinutes = (hours * 60) + minutes + 60;
    }

    return minutesTo24Hour(targetMinutes);
}

export function buildSavedTransitItem(type, { start, end, durationText, durationMinutes, note }) {
    const meta = getTransitTypeMeta(type);

    return {
        time: durationText,
        duration: durationMinutes,
        title: meta.title,
        location: '',
        icon: meta.icon,
        tag: meta.tag,
        isTransit: true,
        image: null,
        note,
        transitInfo: { start, end }
    };
}

export function buildAirplaneRouteUpdate(fields) {
    const departure = fields.departure || '';
    const arrival = fields.arrival || '';
    const departureTime = fields.departureTime || '';
    const arrivalTime = fields.arrivalTime || '';
    const duration = fields.duration || '30분';
    const flightNumber = fields.flightNumber || '';
    const bookingRef = fields.bookingRef || '';
    const terminal = fields.terminal || '';
    const gate = fields.gate || '';

    return {
        title: `${departure} → ${arrival}`,
        time: departureTime,
        duration,
        flightInfo: {
            departure,
            arrival,
            departureTime,
            arrivalTime,
            duration,
            flightNumber,
            bookingRef,
            terminal,
            gate
        }
    };
}

export function buildGenericTransitRouteUpdate(fields) {
    const safeDuration = parseTransitDurationValue(fields.durationMinutes) || DEFAULT_TRANSIT_DURATION;
    const update = {
        title: fields.title || '',
        duration: safeDuration,
        time: formatDuration(safeDuration),
        note: fields.note
    };

    if (fields.transitStart) {
        const startMinutes = parseTimeStr(fields.transitStart);
        if (startMinutes !== null) {
            update.transitEnd = minutesTo24Hour(startMinutes + safeDuration);
        }
    }

    return update;
}
