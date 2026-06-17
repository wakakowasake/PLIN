import { translateLine, translateStation } from '@shared/features/transit/station-translations.js';
import { fetchBackendJson } from '@/services/backend-client';
import type { MobileQuickRouteChip, MobileQuickRouteOption, MobileTimelineDisplayItem } from '@/types/trip';

const QUICK_ROUTE_ERROR_MESSAGE = '자동 추천 경로를 찾지 못했어요. 앞뒤 장소 정보를 확인한 뒤 다시 시도해 주세요.';
const QUICK_ROUTE_CROSS_COUNTRY_ERROR_MESSAGE = '나라가 다른 장소 사이에는 자동 경로를 찾기 어려워요. 비행기 이동이나 직접 이동 일정을 추가해 주세요.';
const QUICK_ROUTE_SERVICE_ERROR_MESSAGE = '자동 추천 경로 서비스를 잠시 사용할 수 없어요. 잠시 후 다시 시도해 주세요.';

type QuickRouteSearchParams = {
    origin: MobileTimelineDisplayItem;
    destination: MobileTimelineDisplayItem;
    dayDate: string;
    departureTime: string;
};

type GoogleDurationValue = {
    text?: string;
    value?: number;
};

type GoogleTransitLine = {
    short_name?: string;
    name?: string;
    color?: string;
    text_color?: string;
    vehicle?: {
        type?: string;
        name?: string;
    };
};

type GoogleTransitStep = {
    line?: GoogleTransitLine;
    departure_stop?: {
        name?: string;
    };
    arrival_stop?: {
        name?: string;
    };
    departure_time?: {
        text?: string;
    };
    arrival_time?: {
        text?: string;
    };
    headsign?: string;
    num_stops?: number;
};

type GoogleDirectionStep = {
    travel_mode?: string;
    duration?: GoogleDurationValue;
    instructions?: string;
    transit?: GoogleTransitStep;
};

type GoogleDirectionLeg = {
    duration?: GoogleDurationValue;
    distance?: GoogleDurationValue;
    steps?: GoogleDirectionStep[];
};

type GoogleDirectionRoute = {
    legs?: GoogleDirectionLeg[];
};

type QuickRouteResponse = {
    routes?: GoogleDirectionRoute[];
    message?: string;
};

function normalizeText(value: string | null | undefined) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasKoreanText(value: string) {
    return /[가-힣]/.test(value);
}

function readBackendErrorStatus(error: unknown) {
    if (!error || typeof error !== 'object') {
        return '';
    }

    const errorRecord = error as {
        status?: unknown;
        payload?: {
            status?: unknown;
        } | null;
    };
    const payloadStatus = errorRecord.payload && typeof errorRecord.payload === 'object'
        ? errorRecord.payload.status
        : null;
    return normalizeText(String(payloadStatus || errorRecord.status || '')).toUpperCase();
}

function hasDifferentRouteCountries(origin: MobileTimelineDisplayItem, destination: MobileTimelineDisplayItem) {
    const originCountryCode = normalizeText(origin.countryCode).toUpperCase();
    const destinationCountryCode = normalizeText(destination.countryCode).toUpperCase();
    return Boolean(originCountryCode && destinationCountryCode && originCountryCode !== destinationCountryCode);
}

function resolveQuickRouteErrorMessage(
    error: unknown,
    origin: MobileTimelineDisplayItem,
    destination: MobileTimelineDisplayItem
) {
    const status = readBackendErrorStatus(error);
    const message = error instanceof Error
        ? normalizeText(error.message)
        : normalizeText(String(error || ''));
    const combined = `${status} ${message}`;
    const normalizedCombined = combined.toUpperCase();

    if (hasDifferentRouteCountries(origin, destination)) {
        return QUICK_ROUTE_CROSS_COUNTRY_ERROR_MESSAGE;
    }

    if (/나라가 다른 장소|비행기 이동|직접 이동 일정/.test(message)) {
        return QUICK_ROUTE_CROSS_COUNTRY_ERROR_MESSAGE;
    }

    if (
        /COUNTRY|CROSS[-_\s]?BORDER|INTERNATIONAL/.test(normalizedCombined)
        || /DIFFERENT COUNTR/.test(normalizedCombined)
    ) {
        return QUICK_ROUTE_CROSS_COUNTRY_ERROR_MESSAGE;
    }

    if (
        /ZERO_RESULTS|NO_ROUTE|NOT_FOUND|MAX_ROUTE_LENGTH_EXCEEDED|ROUTE_NOT_FOUND/.test(normalizedCombined)
        || /NO ROUTE|ROUTE.*NOT FOUND|CANNOT COMPUTE|DIRECTIONS REQUEST FAILED|TRANSIT DIRECTIONS.*NOT AVAILABLE/i.test(combined)
    ) {
        return '자동 추천 경로를 찾지 못했어요. 앞뒤 장소 정보를 확인하거나 직접 이동 일정을 추가해 주세요.';
    }

    if (
        /REQUEST_DENIED|API KEY|NOT AUTHORIZED|PERMISSION|BILLING|OVER_QUERY_LIMIT|OVER_DAILY_LIMIT|RESOURCE_EXHAUSTED|QUOTA|UNAUTHENTICATED/.test(normalizedCombined)
    ) {
        return QUICK_ROUTE_SERVICE_ERROR_MESSAGE;
    }

    if (message && hasKoreanText(message)) {
        return message;
    }

    return QUICK_ROUTE_ERROR_MESSAGE;
}

function formatLocalDateInput(value: Date) {
    const year = String(value.getFullYear()).padStart(4, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function resolveQuickRouteDepartureSchedule(dayDate: string, departureTime: string) {
    const normalizedDate = normalizeText(dayDate);
    const normalizedTime = normalizeText(departureTime);
    const dateMatch = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = normalizedTime.match(/^(\d{2}):(\d{2})$/);

    if (!dateMatch || !timeMatch) {
        return {
            dayDate: normalizedDate,
            departureTime: normalizedTime
        };
    }

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]) - 1;
    const day = Number(dateMatch[3]);
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (hours > 23 || minutes > 59) {
        return {
            dayDate: normalizedDate,
            departureTime: normalizedTime
        };
    }

    const requestedDate = new Date(year, month, day, hours, minutes, 0, 0);

    if (Number.isNaN(requestedDate.getTime())) {
        return {
            dayDate: normalizedDate,
            departureTime: normalizedTime
        };
    }

    const now = new Date();
    if (requestedDate >= now) {
        return {
            dayDate: normalizedDate,
            departureTime: normalizedTime
        };
    }

    const adjustedDate = new Date(now);
    adjustedDate.setHours(hours, minutes, 0, 0);

    if (adjustedDate < now) {
        adjustedDate.setDate(adjustedDate.getDate() + 1);
    }

    return {
        dayDate: formatLocalDateInput(adjustedDate),
        departureTime: normalizedTime
    };
}

function stripHtml(value: string | null | undefined) {
    return normalizeText(
        String(value || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
    );
}

function getContrastColor(lineColor: string | null | undefined, fallbackTextColor: string | null | undefined) {
    let textColor = fallbackTextColor ? normalizeText(fallbackTextColor) : '#ffffff';
    let normalizedColor = '';

    if (lineColor) {
        normalizedColor = lineColor.startsWith('#') ? lineColor : `#${lineColor}`;
        const hex = normalizedColor.replace('#', '').padStart(6, '0').slice(0, 6);
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        textColor = brightness > 128 ? '#000000' : '#ffffff';
    }

    if (fallbackTextColor) {
        textColor = fallbackTextColor.startsWith('#') ? fallbackTextColor : `#${fallbackTextColor}`;
    }

    return {
        lineColor: normalizedColor || null,
        textColor: textColor || null
    };
}

function getGoogleStepVehicleMeta(vehicleType: string | null | undefined) {
    if (vehicleType === 'SUBWAY' || vehicleType === 'METRO') {
        return { icon: 'subway', titleBase: '전철로 이동', transitType: 'subway', tag: '전철' };
    }

    if (vehicleType === 'HEAVY_RAIL' || vehicleType === 'TRAIN') {
        return { icon: 'train', titleBase: '기차로 이동', transitType: 'train', tag: '기차' };
    }

    return { icon: 'directions_bus', titleBase: '버스로 이동', transitType: 'bus', tag: '버스' };
}

function translateTransitLineLabel(label: string | null | undefined) {
    const normalizedLabel = normalizeText(label);
    if (!normalizedLabel) {
        return '';
    }

    return normalizeText(translateLine(normalizedLabel)) || normalizedLabel;
}

function translateTransitStationLabel(label: string | null | undefined) {
    const normalizedLabel = normalizeText(label);
    if (!normalizedLabel) {
        return '';
    }

    return normalizeText(translateStation(normalizedLabel)) || normalizedLabel;
}

function resolveTransitLineLabel(line: GoogleTransitLine, vehicleType: string | null | undefined) {
    const shortName = normalizeText(line.short_name);
    const name = normalizeText(line.name);
    const normalizedVehicleType = normalizeText(vehicleType).toUpperCase();
    const isRail =
        normalizedVehicleType === 'SUBWAY' ||
        normalizedVehicleType === 'METRO' ||
        normalizedVehicleType === 'HEAVY_RAIL' ||
        normalizedVehicleType === 'TRAIN';

    if (isRail) {
        const railShortNameLooksSpecific = /[0-9０-９]|호선|[가-힣]/.test(shortName);
        return translateTransitLineLabel(railShortNameLooksSpecific ? shortName : (name || shortName)) || '대중교통';
    }

    return translateTransitLineLabel(shortName || name) || '대중교통';
}

function buildGoogleWalkingDetailedStep(durationText: string, instructionsText: string) {
    return {
        time: normalizeText(durationText),
        title: '도보로 이동',
        location: '',
        icon: 'directions_walk',
        tag: '도보',
        type: 'walk',
        isTransit: true,
        image: null,
        note: normalizeText(instructionsText) || '도보로 이동',
        fixedDuration: true,
        transitInfo: { start: '', end: '' }
    };
}

function buildGoogleTransitDetailedStep(step: GoogleDirectionStep) {
    const line = step.transit?.line || {};
    const vehicleType = normalizeText(line.vehicle?.type) || 'BUS';
    const lineName = resolveTransitLineLabel(line, vehicleType);
    const lineSymbol = translateTransitLineLabel(line.short_name) || lineName;
    const meta = getGoogleStepVehicleMeta(vehicleType);
    const { lineColor, textColor } = getContrastColor(line.color, line.text_color);

    return {
        time: normalizeText(step.duration?.text),
        title: `${meta.titleBase} (${lineName})`,
        location: '',
        icon: meta.icon,
        tag: lineName,
        type: meta.transitType,
        tagColor: lineColor || 'blue',
        color: lineColor,
        textColor,
        transitInfo: {
            depStop: translateTransitStationLabel(step.transit?.departure_stop?.name),
            arrStop: translateTransitStationLabel(step.transit?.arrival_stop?.name),
            start: normalizeText(step.transit?.departure_time?.text),
            end: normalizeText(step.transit?.arrival_time?.text),
            headsign: translateTransitStationLabel(step.transit?.headsign),
            lineName,
            lineSymbol,
            lineCode: normalizeText(line.short_name),
            numStops: step.transit?.num_stops || 0
        }
    };
}

function buildRouteChips(steps: GoogleDirectionStep[]) {
    const transitSteps = steps.filter((step) => step.travel_mode === 'TRANSIT' && step.transit);
    if (transitSteps.length === 0) {
        return [{
            icon: 'directions_walk',
            label: '도보',
            color: '#FF6600'
        }];
    }

    return transitSteps.map((step) => {
        const line = step.transit?.line || {};
        const vehicleType = normalizeText(line.vehicle?.type) || 'BUS';
        const meta = getGoogleStepVehicleMeta(vehicleType);
        const label = resolveTransitLineLabel(line, vehicleType) || meta.tag;

        return {
            icon: meta.icon,
            label,
            color: getContrastColor(line.color, line.text_color).lineColor
        };
    });
}

function buildGoogleRouteSummaryMeta(steps: GoogleDirectionStep[], leg: GoogleDirectionLeg) {
    const transitSteps = steps.filter((step) => step.travel_mode === 'TRANSIT' && step.transit);
    const totalDuration = normalizeText(leg.duration?.text);
    const totalDistance = normalizeText(leg.distance?.text);
    const totalMinutes = typeof leg.duration?.value === 'number'
        ? Math.ceil(leg.duration.value / 60)
        : 0;
    const chips = buildRouteChips(steps);

    if (transitSteps.length === 0) {
        return {
            durationText: totalDuration || `${Math.max(totalMinutes, 1)}분`,
            distanceText: totalDistance,
            durationMinutes: Math.max(totalMinutes, 1),
            summaryTitle: '도보로 이동',
            summaryIcon: 'directions_walk',
            summaryTag: '도보',
            transitType: 'walk',
            chips
        };
    }

    const firstVehicleType = normalizeText(transitSteps[0]?.transit?.line?.vehicle?.type) || 'BUS';
    const primaryMeta = getGoogleStepVehicleMeta(firstVehicleType);
    const lineNames = chips
        .map((chip) => normalizeText(chip.label))
        .filter(Boolean);

    return {
        durationText: totalDuration || `${Math.max(totalMinutes, 1)}분`,
        distanceText: totalDistance,
        durationMinutes: Math.max(totalMinutes, 1),
        summaryTitle: lineNames.length > 0 ? lineNames.join(' → ') : primaryMeta.titleBase,
        summaryIcon: primaryMeta.icon,
        summaryTag: primaryMeta.tag,
        transitType: primaryMeta.transitType,
        chips
    };
}

function buildAnchorQuery(item: MobileTimelineDisplayItem) {
    return [item.title, item.location]
        .map((value) => normalizeText(value))
        .filter(Boolean)
        .join(', ');
}

function resolveDepartureUtcOffsetMinutes(dayDate: string, departureTime: string) {
    const normalizedDate = normalizeText(dayDate);
    const normalizedTime = normalizeText(departureTime);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || !/^\d{2}:\d{2}$/.test(normalizedTime)) {
        return null;
    }

    const localDate = new Date(`${normalizedDate}T${normalizedTime}:00`);
    if (Number.isNaN(localDate.getTime())) {
        return null;
    }

    return -localDate.getTimezoneOffset();
}

function appendAnchorParams(
    searchParams: URLSearchParams,
    prefix: 'origin' | 'destination',
    item: MobileTimelineDisplayItem
) {
    if (typeof item.latitude === 'number' && Number.isFinite(item.latitude)) {
        searchParams.set(`${prefix}Lat`, String(item.latitude));
    }

    if (typeof item.longitude === 'number' && Number.isFinite(item.longitude)) {
        searchParams.set(`${prefix}Lng`, String(item.longitude));
    }

    const query = buildAnchorQuery(item);
    if (query) {
        searchParams.set(`${prefix}Query`, query);
    }

    const countryCode = normalizeText(item.countryCode).toUpperCase();
    if (countryCode) {
        searchParams.set(`${prefix}CountryCode`, countryCode);
    }
}

function normalizeRouteOption(route: GoogleDirectionRoute, index: number): MobileQuickRouteOption | null {
    const leg = route.legs?.[0];
    const steps = Array.isArray(leg?.steps) ? leg.steps : [];

    if (!leg) {
        return null;
    }

    const summaryMeta = buildGoogleRouteSummaryMeta(steps, leg);
    const detailedSteps = steps.length === 0
        ? [buildGoogleWalkingDetailedStep(summaryMeta.durationText || '시간 미정', '경로 상세 정보 없음')]
        : steps.map((step) => {
            if (step.travel_mode === 'TRANSIT' && step.transit) {
                return buildGoogleTransitDetailedStep(step);
            }

            return buildGoogleWalkingDetailedStep(
                normalizeText(step.duration?.text),
                stripHtml(step.instructions) || '도보로 이동'
            );
        });

    return {
        id: `quick-route-${index}`,
        durationText: summaryMeta.durationText,
        distanceText: summaryMeta.distanceText,
        durationMinutes: summaryMeta.durationMinutes,
        summaryTitle: summaryMeta.summaryTitle,
        summaryIcon: summaryMeta.summaryIcon,
        summaryTag: summaryMeta.summaryTag,
        transitType: summaryMeta.transitType,
        chips: summaryMeta.chips as MobileQuickRouteChip[],
        detailedSteps
    };
}

export async function searchTripQuickRouteOptions({
    origin,
    destination,
    dayDate,
    departureTime
}: QuickRouteSearchParams) {
    const departureSchedule = resolveQuickRouteDepartureSchedule(dayDate, departureTime);
    const searchParams = new URLSearchParams();
    appendAnchorParams(searchParams, 'origin', origin);
    appendAnchorParams(searchParams, 'destination', destination);
    searchParams.set('dayDate', departureSchedule.dayDate);
    searchParams.set('departureTime', departureSchedule.departureTime);
    searchParams.set('mode', 'transit');
    const departureUtcOffsetMinutes = resolveDepartureUtcOffsetMinutes(
        departureSchedule.dayDate,
        departureSchedule.departureTime
    );
    if (typeof departureUtcOffsetMinutes === 'number' && Number.isFinite(departureUtcOffsetMinutes)) {
        searchParams.set('utcOffsetMinutes', String(departureUtcOffsetMinutes));
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 15000);

    try {
        const payload = await fetchBackendJson<QuickRouteResponse>(
            `/routes/quick-transit?${searchParams.toString()}`,
            { signal: controller.signal }
        );
        const routeOptions = Array.isArray(payload.routes)
            ? payload.routes
                .map((route, index) => normalizeRouteOption(route, index))
                .filter((route): route is MobileQuickRouteOption => Boolean(route))
            : [];

        if (routeOptions.length === 0) {
            throw new Error(QUICK_ROUTE_ERROR_MESSAGE);
        }

        return routeOptions;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('자동 추천 경로를 찾는 데 시간이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.');
        }

        throw new Error(resolveQuickRouteErrorMessage(error, origin, destination));
    } finally {
        clearTimeout(timeoutId);
    }
}
