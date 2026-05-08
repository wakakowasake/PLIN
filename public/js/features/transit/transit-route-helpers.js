import { minutesTo24Hour, parseTimeStr } from '../../ui-utils.js';
import { translateLine, translateStation } from '../../station-translations.js';
import { parseTransitDurationValue } from './transit-item-helpers.js';
export {
    buildGoogleRouteTiming,
    getAdjustedNextItemTime
} from '../../../../shared/features/transit/transit-route-data-helpers.js';

function safeValue(value) {
    return value === undefined || value === null ? '' : String(value);
}

function translateTransitLineLabel(value) {
    const rawValue = safeValue(value);
    return rawValue ? safeValue(translateLine(rawValue)) || rawValue : '';
}

function translateTransitStationLabel(value) {
    const rawValue = safeValue(value);
    return rawValue ? safeValue(translateStation(rawValue)) || rawValue : '';
}

function getContrastColor(lineColor, fallbackTextColor) {
    let textColor = fallbackTextColor || '#ffffff';
    let normalizedColor = null;

    if (lineColor) {
        normalizedColor = lineColor.startsWith('#') ? lineColor : `#${lineColor}`;
        const hex = normalizedColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        textColor = brightness > 128 ? '#000000' : '#ffffff';
    }

    if (fallbackTextColor) {
        textColor = fallbackTextColor.startsWith('#') ? fallbackTextColor : `#${fallbackTextColor}`;
    }

    return { lineColor: normalizedColor, textColor };
}

function getGoogleStepVehicleMeta(vehicleType) {
    if (vehicleType === 'SUBWAY' || vehicleType === 'METRO') {
        return { icon: 'subway', titleBase: '전철로 이동', transitType: 'subway' };
    }

    if (vehicleType === 'HEAVY_RAIL' || vehicleType === 'TRAIN') {
        return { icon: 'train', titleBase: '기차로 이동', transitType: 'train' };
    }

    return { icon: 'directions_bus', titleBase: '버스로 이동', transitType: 'bus' };
}

function getGoogleSummaryMetaFromVehicle(vehicleType) {
    if (vehicleType === 'SUBWAY' || vehicleType === 'METRO') {
        return { icon: 'subway', tag: '전철', title: '전철로 이동' };
    }

    if (vehicleType === 'HEAVY_RAIL' || vehicleType === 'TRAIN') {
        return { icon: 'train', tag: '기차', title: '기차로 이동' };
    }

    return { icon: 'directions_bus', tag: '버스', title: '버스로 이동' };
}

function getGoogleDurationText(valueObject) {
    return valueObject?.text || '';
}

function getGoogleDistanceText(valueObject) {
    return valueObject?.text || '';
}

export function buildGoogleTransitDetailedStep(step) {
    const line = step.transit?.line || {};
    const vehicle = line.vehicle || { type: 'BUS' };
    const vehicleType = vehicle.type || 'BUS';
    const lineName = translateTransitLineLabel(line.short_name) || translateTransitLineLabel(line.name) || '대중교통';
    const { icon, titleBase, transitType } = getGoogleStepVehicleMeta(vehicleType);
    const { lineColor, textColor } = getContrastColor(line.color || line.Color, line.text_color);

    return {
        time: getGoogleDurationText(step.duration),
        title: `${titleBase} (${lineName})`,
        location: '',
        icon,
        tag: lineName,
        type: transitType,
        tagColor: lineColor || 'blue',
        color: lineColor,
        textColor,
        transitInfo: {
            depStop: translateTransitStationLabel(step.transit?.departure_stop?.name),
            arrStop: translateTransitStationLabel(step.transit?.arrival_stop?.name),
            start: safeValue(step.transit?.departure_time?.text),
            end: safeValue(step.transit?.arrival_time?.text),
            headsign: translateTransitStationLabel(step.transit?.headsign),
            numStops: step.transit?.num_stops || 0
        }
    };
}

export function buildGoogleWalkingDetailedStep(durationText, instructionsText) {
    return {
        time: durationText,
        title: '도보로 이동',
        location: '',
        icon: 'directions_walk',
        tag: '도보',
        type: 'walk',
        isTransit: true,
        image: null,
        note: instructionsText || '도보로 이동',
        fixedDuration: true,
        transitInfo: { start: '', end: '' }
    };
}

export function buildGoogleRouteSummaryMeta(steps, leg) {
    const transitSteps = steps.filter((step) => step.travel_mode === 'TRANSIT');
    const hasTransit = transitSteps.length > 0;
    const totalDuration = getGoogleDurationText(leg?.duration);
    const totalDistance = getGoogleDistanceText(leg?.distance);
    const legDurationValue = typeof leg?.duration === 'number'
        ? leg.duration
        : (typeof leg?.duration?.value === 'number' ? leg.duration.value : 0);
    const totalMinutes = legDurationValue ? Math.ceil(legDurationValue / 60) : 0;

    if (!hasTransit) {
        return {
            hasTransit,
            totalDuration,
            totalDistance,
            totalMinutes,
            summaryTitle: '도보로 이동',
            summaryIcon: 'directions_walk',
            summaryTag: '도보'
        };
    }

    const transitTags = [];
    transitSteps.forEach((step) => {
        const line = step.transit?.line || {};
        const vehicle = line.vehicle || {};
        const lineName =
            translateTransitLineLabel(line.short_name)
            || translateTransitLineLabel(line.name)
            || safeValue(vehicle.name)
            || '';

        if (!lineName) return;

        const { lineColor, textColor } = getContrastColor(line.color, line.text_color);
        const bgColor = lineColor || '#3b82f6';
        const txtColor = textColor || '#ffffff';
        transitTags.push(
            `<span style="background-color:${bgColor};color:${txtColor};padding:2px 6px;border-radius:4px;font-size:0.9em;display:inline-block;vertical-align:middle;font-weight:bold;">${lineName}</span>`
        );
    });

    if (transitTags.length > 0) {
        const firstVehicle = transitSteps[0]?.transit?.line?.vehicle?.type || 'BUS';
        const meta = getGoogleSummaryMetaFromVehicle(firstVehicle);

        return {
            hasTransit,
            totalDuration,
            totalDistance,
            totalMinutes,
            summaryTitle: transitTags.join(' <span style="color:#9ca3af;font-size:0.8em;">➜</span> '),
            summaryIcon: meta.icon,
            summaryTag: meta.tag
        };
    }

    const vehicleTypes = {};
    transitSteps.forEach((step) => {
        const vehicleType = step.transit?.line?.vehicle?.type || 'BUS';
        vehicleTypes[vehicleType] = (vehicleTypes[vehicleType] || 0) + 1;
    });

    const mainType = Object.keys(vehicleTypes).reduce(
        (winner, candidate) => (vehicleTypes[winner] > vehicleTypes[candidate] ? winner : candidate),
        Object.keys(vehicleTypes)[0] || 'BUS'
    );
    const meta = getGoogleSummaryMetaFromVehicle(mainType);

    return {
        hasTransit,
        totalDuration,
        totalDistance,
        totalMinutes,
        summaryTitle: meta.title || '대중교통으로 이동',
        summaryIcon: meta.icon || 'commute',
        summaryTag: meta.tag || '대중교통'
    };
}

export function buildGoogleRouteSummaryItem({
    summaryTitle,
    summaryIcon,
    summaryTag,
    totalDuration,
    totalDistance,
    totalMinutes,
    detailedSteps,
    routeGroupId,
    routeStartTime,
    routeEndTime
}) {
    return {
        time: totalDuration || '시간 미정',
        duration: totalMinutes,
        title: summaryTitle,
        location: '',
        icon: summaryIcon,
        tag: summaryTag,
        isTransit: true,
        image: null,
        note: '',
        fixedDuration: true,
        transitInfo: {
            start: routeStartTime || '',
            end: routeEndTime || '',
            summary: `총 거리: ${totalDistance}`
        },
        isCollapsed: detailedSteps.length > 0,
        detailedSteps: detailedSteps.length > 0 ? detailedSteps : null,
        expenses: [],
        attachments: [],
        routeGroupId
    };
}

function getEkispertLineColor(rawColor, rawTextColor) {
    let lineColor = null;
    let textColor = '#ffffff';

    if (rawColor) {
        const colorString = String(rawColor).padStart(9, '0');
        const red = parseInt(colorString.substring(0, 3), 10);
        const green = parseInt(colorString.substring(3, 6), 10);
        const blue = parseInt(colorString.substring(6, 9), 10);
        lineColor = `rgb(${red}, ${green}, ${blue})`;

        const brightness = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
        textColor = brightness > 128 ? '#000000' : '#ffffff';
    } else if (rawTextColor) {
        textColor = rawTextColor.startsWith('#') ? rawTextColor : `#${rawTextColor}`;
    }

    return { lineColor, textColor };
}

export function buildEkispertRouteItems({
    route,
    lines,
    points,
    fromItem,
    toItem,
    translateStation,
    translateLine
}) {
    const detailedSteps = [];
    const routeSteps = [];
    let currentPointIndex = 0;

    lines.forEach((line) => {
        const lineType = line.Type;
        const lineName = line.Name || '';
        const timeOnBoard = parseInt(line.timeOnBoard, 10) || 0;
        const fromStationJa = points[currentPointIndex]?.Station?.Name || '';
        const fromStation = translateStation(fromStationJa);

        if (lineType === 'walk') {
            const toStationJa = points[currentPointIndex + 1]?.Station?.Name || '';
            const toStation = translateStation(toStationJa);

            routeSteps.push(`🚶 도보 ${timeOnBoard}분`);
            detailedSteps.push({
                title: '도보 이동',
                time: `${timeOnBoard}분`,
                icon: 'directions_walk',
                tag: '도보',
                type: 'walk',
                tagColor: 'green',
                color: null,
                textColor: null,
                transitInfo: {
                    depStop: fromStation,
                    arrStop: toStation,
                    lineName: '도보',
                    duration: timeOnBoard
                }
            });
            return;
        }

        currentPointIndex += 1;
        const toStationJa = points[currentPointIndex]?.Station?.Name || '';
        const toStation = translateStation(toStationJa);
        const emoji = lineType === 'train' ? '🚇' : '🚌';
        const { lineColor, textColor } = getEkispertLineColor(line.Color, line.text_color);
        const lineSymbolJa = line.LineSymbol?.Name || '';
        const lineCode = line.LineSymbol?.code || '';
        const translatedLineName = translateLine(lineName);

        let tagText = translatedLineName;
        if (lineCode && /^[A-Z]+$/i.test(lineCode)) {
            tagText += ` ${lineCode}`;
        } else if (lineSymbolJa && /^[A-Z]+$/i.test(lineSymbolJa)) {
            tagText += ` ${lineSymbolJa}`;
        }

        routeSteps.push(`${emoji} ${translatedLineName}: ${fromStation} → ${toStation} (${timeOnBoard}분)`);
        detailedSteps.push({
            title: translatedLineName,
            time: `${timeOnBoard}분`,
            icon: lineType === 'train' ? 'train' : 'directions_bus',
            tag: tagText,
            type: lineType === 'train' ? 'subway' : 'bus',
            tagColor: lineColor || 'blue',
            color: lineColor,
            textColor,
            transitInfo: {
                depStop: fromStation,
                arrStop: toStation,
                lineName: translatedLineName,
                lineSymbol: lineSymbolJa,
                lineCode,
                lineColor,
                duration: timeOnBoard,
                stopCount: parseInt(line.stopStationCount, 10) || 0
            }
        });
    });

    let totalMinutes = 0;
    lines.forEach((line) => {
        totalMinutes += parseInt(line.timeOnBoard, 10) || 0;
    });

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const durationText = hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
    const transferCount = parseInt(route.transferCount, 10) || 0;

    const startStationJa = points[0]?.Station?.Name || fromItem.location || fromItem.title;
    const endStationJa = points[points.length - 1]?.Station?.Name || toItem.location || toItem.title;
    const startStation = translateStation(startStationJa);
    const endStation = translateStation(endStationJa);

    let startTime = '';
    let endTime = '';

    if (fromItem) {
        if (fromItem.isTransit && fromItem.transitInfo?.end) {
            startTime = fromItem.transitInfo.end;
        } else if (fromItem.time) {
            const time = parseTimeStr(fromItem.time);
            if (time !== null) {
                const duration = parseTransitDurationValue(fromItem.duration) || 30;
                startTime = minutesTo24Hour(time + duration);
            }
        }
    }

    if (startTime) {
        const parsedStart = parseTimeStr(startTime);
        if (parsedStart !== null) {
            endTime = minutesTo24Hour(parsedStart + totalMinutes);
        }
    }

    return [{
        time: durationText,
        duration: totalMinutes,
        title: `${startStation} → ${endStation}`,
        location: '',
        icon: 'train',
        tag: '전철',
        tagColor: 'blue',
        isTransit: true,
        isCollapsed: true,
        image: null,
        note: `환승 ${transferCount}회\n\n${routeSteps.join('\n')}`,
        fixedDuration: true,
        transitInfo: {
            start: startTime,
            end: endTime,
            depStation: startStation,
            arrStation: endStation,
            steps: routeSteps,
            transferCount
        },
        detailedSteps,
        expenses: [],
        attachments: []
    }];
}
