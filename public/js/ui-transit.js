// d:\SoongSil Univ\piln\public\js\ui-transit.js

import {
    travelData, targetDayIndex, setTargetDayIndex, setViewingItemIndex, viewingItemIndex, currentDayIndex,
    insertingItemIndex, setInsertingItemIndex, isEditingFromDetail, setIsEditingFromDetail, setTravelData
} from './state.js';
import { parseTimeStr, formatTimeStr, calculateStraightDistance, minutesTo24Hour, parseDurationStr } from './ui-utils.js';
import { airports, searchAirports, getAirportByCode, formatAirport } from './airports.js';
import logger from './logger.js';
import { translateStation, translateLine } from './station-translations.js';
import { openUserProfile } from './ui/profile.js';

// Break circular dependency by using window functions
const renderItinerary = (...args) => window.renderItinerary && window.renderItinerary(...args);
const reorderTimeline = (...args) => window.reorderTimeline && window.reorderTimeline(...args);
const closeAddModal = (...args) => window.closeAddModal && window.closeAddModal(...args);
const viewTimelineItem = (...args) => window.viewTimelineItem && window.viewTimelineItem(...args);
const editTimelineItem = (...args) => window.editTimelineItem && window.editTimelineItem(...args);
const renderAttachments = (...args) => window.renderAttachments && window.renderAttachments(...args);
const getMapsApiKey = (...args) => window.getMapsApiKey && window.getMapsApiKey(...args);
const autoSave = (...args) => window.autoSave && window.autoSave(...args);
const updateTotalBudget = (...args) => window.updateTotalBudget && window.updateTotalBudget(...args);

// 현재 보고 있는 경로 아이템 인덱스
let currentRouteItemIndex = null;

// [Transit Input Modal Logic]
let transitInputIndex = null;
let transitInputType = null;
let isTransitEditing = false;

export function addTransitItem(index, type, dayIndex = currentDayIndex) {
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    const day = travelData.days[dayIndex];
    const tagMap = {
        'airplane': '비행기',
        'train': '기차',
        'bus': '버스',
        'car': '자동차',
        'walk': '도보'
    };

    const iconMap = {
        'airplane': 'flight',
        'train': 'train',
        'bus': 'directions_bus',
        'car': 'directions_car',
        'walk': 'directions_walk'
    };

    // 빈 이동수단 아이템 생성
    // 이전 장소의 종료 시간을 기반으로 시작 시간 계산
    let startTime = '';
    let endTime = '';

    if (index >= 0) {
        const prevItem = day.timeline[index];
        if (prevItem) {
            // 이전 아이템이 이동수단이면 transitInfo.end 사용
            if (prevItem.isTransit && prevItem.transitInfo && prevItem.transitInfo.end) {
                startTime = prevItem.transitInfo.end;
            } else if (prevItem.time) {
                // 일반 장소면 time + duration으로 종료 시간 계산
                const prevTimeMinutes = parseTimeStr(prevItem.time);
                if (prevTimeMinutes !== null) {
                    const prevDuration = prevItem.duration || 30;
                    const endMinutes = prevTimeMinutes + prevDuration;
                    startTime = minutesTo24Hour(endMinutes);
                }
            }

            // 종료 시간 계산 (기본 30분 duration)
            if (startTime) {
                const startMinutes = parseTimeStr(startTime);
                if (startMinutes !== null) {
                    const endMinutes = startMinutes + 30;
                    endTime = minutesTo24Hour(endMinutes);
                }
            }
        }
    }

    const newItem = {
        time: startTime ? "30분" : "",
        title: "",
        location: "",
        icon: iconMap[type] || 'directions_walk',
        tag: tagMap[type] || '도보',
        tagColor: "green",
        isTransit: true,
        transitType: type, // 이동수단 타입 저장
        duration: "30분", // 기본 소요시간
        transitInfo: startTime ? { start: startTime, end: endTime } : null,
        detailedSteps: [],
        // 비행기 전용 필드
        flightInfo: type === 'airplane' ? {
            departure: "",
            arrival: "",
            flightNumber: "",
            bookingRef: "",
            terminal: "",
            gate: ""
        } : null
    };

    // 타임라인에 추가 (플러스 버튼은 현재 아이템 아래에 있으므로 index + 1 위치에 삽입)
    day.timeline.splice(index + 1, 0, newItem);
    autoSave();
    renderItinerary();

    // 바로 상세 모달을 edit 모드로 열기 (새로 추가된 위치는 index + 1)
    setTimeout(() => {
        viewRouteDetail(index + 1, dayIndex, true);
    }, 100);
}

export function openTransitInputModal(index, type = null) {
    transitInputIndex = index;
    transitInputType = type;
    isTransitEditing = type === null;

    const modal = document.getElementById('transit-input-modal');
    const titleEl = document.getElementById('transit-modal-title');
    const startEl = document.getElementById('transit-start-time');
    const endEl = document.getElementById('transit-end-time');
    const noteEl = document.getElementById('transit-note');
    const warningEl = document.getElementById('transit-warning');
    const fetchBtn = document.getElementById('btn-fetch-transit-time');

    startEl.value = "";
    endEl.value = "";
    noteEl.value = "";
    document.getElementById('transit-duration-display').innerText = "--";
    if (warningEl) {
        warningEl.classList.add('hidden');
        warningEl.innerText = "";
    }

    if (isTransitEditing) {
        const item = travelData.days[targetDayIndex].timeline[index];
        titleEl.innerText = "이동 정보 수정";
        noteEl.value = item.note || "";

        if (item.transitInfo) {
            startEl.value = item.transitInfo.start;
            endEl.value = item.transitInfo.end;
            calculateTransitDuration();
        }

        if (fetchBtn) fetchBtn.classList.add('hidden');
    } else {
        titleEl.innerText = "이동 수단 추가";

        const timeline = travelData.days[targetDayIndex].timeline;
        if (index >= 0 && timeline[index]) {
            const prevItem = timeline[index];
            const prevTimeMinutes = parseTimeStr(prevItem.time);
            if (prevTimeMinutes !== null) {
                const h = Math.floor(prevTimeMinutes / 60);
                const m = prevTimeMinutes % 60;
                startEl.value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
        }

        if (fetchBtn) fetchBtn.classList.remove('hidden');
    }

    modal.classList.remove('hidden');
}

export function closeTransitInputModal() {
    document.getElementById('transit-input-modal').classList.add('hidden');
    transitInputIndex = null;
    transitInputType = null;
}

export function calculateTransitDuration() {
    const start = document.getElementById('transit-start-time').value;
    const end = document.getElementById('transit-end-time').value;
    const display = document.getElementById('transit-duration-display');
    const warningEl = document.getElementById('transit-warning');

    if (warningEl) {
        warningEl.classList.add('hidden');
        warningEl.innerText = "";
    }
    display.innerText = "--";

    if (start && end) {
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        const startMins = h1 * 60 + m1;
        const endMins = h2 * 60 + m2;

        let diff = endMins - startMins;
        let warningMsg = "";

        if (diff < 0) {
            diff += 24 * 60;
            warningMsg = "도착 시간이 출발 시간보다 빠릅니다. (다음날 도착)";
        }

        let prevIndex = isTransitEditing ? transitInputIndex - 1 : transitInputIndex;

        if (prevIndex >= 0) {
            const timeline = travelData.days[targetDayIndex].timeline;
            if (timeline && timeline[prevIndex]) {
                const prevItem = timeline[prevIndex];
                let prevEndMins = null;

                if (prevItem.transitInfo && prevItem.transitInfo.end) {
                    const [ph, pm] = prevItem.transitInfo.end.split(':').map(Number);
                    prevEndMins = ph * 60 + pm;
                } else if (prevItem.time) {
                    prevEndMins = parseTimeStr(prevItem.time);
                }

                if (prevEndMins !== null && startMins < prevEndMins) {
                    if (warningMsg) warningMsg += "\n";
                    warningMsg += "출발 시간이 이전 일정보다 빠릅니다.";
                }
            }
        }

        if (warningMsg && warningEl) {
            warningEl.innerText = warningMsg;
            warningEl.classList.remove('hidden');
        }

        const h = Math.floor(diff / 60);
        const m = diff % 60;

        let str = "";
        if (h > 0) str += `${h}시간 `;
        str += `${m}분`;
        display.innerText = str;
        return str;
    } else {
        return null;
    }
}

export function fetchTransitTime() {
    if (!window.google || !window.google.maps) {
        alert("Google Maps API가 로드되지 않았습니다.");
        return;
    }

    if (targetDayIndex === null || targetDayIndex === -1 || !travelData.days[targetDayIndex]) {
        alert("날짜 정보를 찾을 수 없습니다. (전체 보기에서는 사용할 수 없습니다)");
        return;
    }

    const timeline = travelData.days[targetDayIndex].timeline;

    const findLocationItem = (startIndex, direction) => {
        let i = startIndex;
        if (direction === -1 && i >= timeline.length) {
            i = timeline.length - 1;
        }

        while (i >= 0 && i < timeline.length) {
            const item = timeline[i];
            const hasCoords = item.lat && item.lng;
            const isNotTransitOrMemo = !item.isTransit && item.tag !== '메모';

            if (hasCoords || isNotTransitOrMemo) {
                return item;
            }
            i += direction;
        }
        return null;
    };

    let prevItem, nextItem;
    const idx = Number(transitInputIndex);

    if (isTransitEditing) {
        prevItem = findLocationItem(idx - 1, -1);
        nextItem = findLocationItem(idx + 1, 1);
    } else {
        prevItem = findLocationItem(idx, -1);
        nextItem = findLocationItem(idx + 1, 1);
    }

    if (!prevItem || !nextItem) {
        alert("출발지 또는 도착지 정보를 찾을 수 없어 경로를 검색할 수 없습니다.\n(앞뒤에 위치 정보가 있는 일정이 있어야 합니다. 마지막에 추가하는 경우 도착지가 없어 계산할 수 없습니다.)");
        return;
    }

    const getLoc = (item) => {
        if (item.geometry && item.geometry.location) {
            const loc = item.geometry.location;
            const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
            const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
            return { lat, lng };
        }

        if (item.lat !== undefined && item.lng !== undefined) {
            const lat = typeof item.lat === 'function' ? item.lat() : Number(item.lat);
            const lng = typeof item.lng === 'function' ? item.lng() : Number(item.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                return { lat, lng };
            }
        }

        const locStr = (item.location && item.location !== '위치') ? item.location : '';
        if (locStr) return locStr;
        if (item.title) return item.title;

        return '';
    };

    const origin = getLoc(prevItem);
    const destination = getLoc(nextItem);

    if (!origin || !destination) {
        alert("출발지 또는 도착지의 위치 정보가 부족합니다.");
        return;
    }

    const startTimeInput = document.getElementById('transit-start-time');
    if (!startTimeInput.value) {
        alert("정확한 검색을 위해 출발 시간을 먼저 입력해주세요.");
        startTimeInput.focus();
        return;
    }

    let mode = 'transit';
    if (isTransitEditing) {
        const item = travelData.days[targetDayIndex].timeline[transitInputIndex];
        if (item.tag === '도보') mode = 'walking';
        else if (item.tag === '차량') mode = 'driving';
    } else if (transitInputType) {
        if (transitInputType === 'walk') mode = 'walking';
        else if (transitInputType === 'car') mode = 'driving';
    }

    const [h, m] = startTimeInput.value.split(':').map(Number);

    // [Fix] Use Trip Date instead of OS Date
    const dayData = travelData.days[targetDayIndex];
    let baseDate = new Date();
    if (dayData && dayData.date) {
        baseDate = new Date(dayData.date);
    }

    let departureTime = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), h, m);

    // [Fix] If past, use Today/Tomorrow with same time (User Request)
    if (departureTime < new Date()) {
        const now = new Date();
        departureTime.setFullYear(now.getFullYear());
        departureTime.setMonth(now.getMonth());
        departureTime.setDate(now.getDate());
        // If the time has already passed today, use tomorrow
        if (departureTime < new Date()) {
            departureTime.setDate(departureTime.getDate() + 1);
        }
    }

    const directionsService = new google.maps.DirectionsService();

    const request = {
        origin: origin,
        destination: destination,
        travelMode: mode.toUpperCase(),
        transitOptions: mode === 'transit' ? { departureTime: departureTime } : undefined
    };

    directionsService.route(request, (result, status) => {
        if (status === 'OK') {
            const route = result.routes[0];
            const leg = route.legs[0];

            const durationSec = leg.duration.value;
            const durationText = leg.duration.text;

            const startMins = h * 60 + m;
            const durationMins = Math.ceil(durationSec / 60);
            const endMins = startMins + durationMins;

            const eh = Math.floor(endMins / 60) % 24;
            const em = endMins % 60;

            document.getElementById('transit-end-time').value = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

            const noteInput = document.getElementById('transit-note');
            if (!noteInput.value) {
                noteInput.value = `구글맵 경로: ${durationText}`;
            }

            calculateTransitDuration();
            alert(`경로를 찾았습니다!\n소요시간: ${durationText}`);
        } else {
            console.error('Directions request failed:', status);
            alert("경로를 찾을 수 없습니다. (Status: " + status + ")");
        }
    });
}

export function saveTransitItem() {
    const start = document.getElementById('transit-start-time').value;
    let end = document.getElementById('transit-end-time').value;
    const note = document.getElementById('transit-note').value;

    if (!start) {
        alert("출발 시간을 입력해주세요.");
        return;
    }

    if (!end) {
        const timeline = travelData.days[targetDayIndex].timeline;
        const nextIndex = transitInputIndex + 1;
        const nextItem = timeline[nextIndex];

        let targetMins = null;

        if (nextItem) {
            if (nextItem.isTransit && nextItem.transitInfo && nextItem.transitInfo.start) {
                const [h, m] = nextItem.transitInfo.start.split(':').map(Number);
                targetMins = h * 60 + m;
            } else if (!nextItem.isTransit) {
                targetMins = parseTimeStr(nextItem.time);
            }
        }

        if (targetMins === null) {
            const [h, m] = start.split(':').map(Number);
            targetMins = h * 60 + m + 60;
        }

        const eh = Math.floor(targetMins / 60) % 24;
        const em = targetMins % 60;
        end = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
        document.getElementById('transit-end-time').value = end;
    }

    const durationStr = calculateTransitDuration();

    let modifiedItem = null;

    if (isTransitEditing) {
        const item = travelData.days[targetDayIndex].timeline[transitInputIndex];
        item.time = durationStr;
        item.note = note;
        item.transitInfo = { ...item.transitInfo, start, end };
        modifiedItem = item;
        setTravelData(travelData);
    } else {
        const icons = {
            train: 'train',
            subway: 'subway',
            bus: 'directions_bus',
            walk: 'directions_walk',
            car: 'directions_car'
        };
        const titles = {
            train: '기차로 이동',
            subway: '전철로 이동',
            bus: '버스로 이동',
            walk: '도보로 이동',
            car: '차량으로 이동'
        };
        const tags = {
            train: '기차',
            subway: '전철',
            bus: '버스',
            walk: '도보',
            car: '차량'
        };

        if (!transitInputType || !titles[transitInputType]) {
            console.error("Invalid transit type:", transitInputType);
            return;
        }

        const newItem = {
            time: durationStr,
            title: titles[transitInputType],
            location: "",
            icon: icons[transitInputType],
            tag: tags[transitInputType],
            isTransit: true,
            image: null,
            note: note,
            transitInfo: { start, end }
        };

        travelData.days[targetDayIndex].timeline.splice(transitInputIndex + 1, 0, newItem);
    }

    reorderTimeline(targetDayIndex);
    closeTransitInputModal();

    if (isTransitEditing && isEditingFromDetail && modifiedItem) {
        const newIndex = travelData.days[targetDayIndex].timeline.indexOf(modifiedItem);
        if (newIndex !== -1) {
            viewTimelineItem(newIndex, targetDayIndex);
        }
    }
    setIsEditingFromDetail(false);
}

// [Transit Detail Modal Logic]
export function openTransitDetailModal(item, index, dayIndex) {

    setViewingItemIndex(index);
    setTargetDayIndex(dayIndex);
    const modal = document.getElementById('transit-detail-modal');

    document.getElementById('transit-detail-icon').innerText = item.icon;
    document.getElementById('transit-detail-title').innerHTML = item.title;
    document.getElementById('transit-detail-time').innerText = item.time;

    const tInfo = item.transitInfo || {};
    document.getElementById('transit-detail-start-val').value = tInfo.start || '';
    document.getElementById('transit-detail-end-val').value = tInfo.end || '';

    let publicInfoEl = document.getElementById('transit-detail-public-info');
    if (!publicInfoEl) {
        publicInfoEl = document.createElement('div');
        publicInfoEl.id = 'transit-detail-public-info';
        publicInfoEl.className = "w-full mb-6 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 hidden";
        const timeEl = document.getElementById('transit-detail-time').parentElement;
        timeEl.after(publicInfoEl);
    }

    if (['버스', '전철', '기차', '지하철'].some(t => item.tag && item.tag.includes(t)) && (tInfo.depStop || tInfo.arrStop)) {
        publicInfoEl.classList.remove('hidden');

        let statusHtml = '';
        if (tInfo.start) {
            const dayDate = travelData.days[dayIndex].date;
            if (dayDate) {
                const [h, m] = tInfo.start.split(':').map(Number);
                const target = new Date(dayDate);
                target.setHours(h, m, 0, 0);
                const now = new Date();

                if (target.toDateString() === now.toDateString()) {
                    const diff = Math.floor((target - now) / 60000);
                    if (diff > 0) statusHtml = `<span class="text-red-500 font-bold animate-pulse">${diff}분 후 도착</span>`;
                    else if (diff > -10) statusHtml = `<span class="text-gray-500 font-bold">도착/출발함</span>`;
                }
            }
        }

        publicInfoEl.innerHTML = `
            <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-center mb-3">
                <div class="flex flex-col items-center min-w-0">
                    <span class="text-[10px] text-gray-400 uppercase font-bold mb-1">출발</span>
                    <span class="font-bold text-sm text-gray-800 dark:text-white leading-tight truncate w-full">${tInfo.depStop || '출발지'}</span>
                    <span class="text-xs text-primary font-bold mt-1">${tInfo.start || '--:--'}</span>
                </div>
                <div class="text-gray-300"><span class="material-symbols-outlined">arrow_forward</span></div>
                <div class="flex flex-col items-center min-w-0">
                    <span class="text-[10px] text-gray-400 uppercase font-bold mb-1">도착</span>
                    <span class="font-bold text-sm text-gray-800 dark:text-white leading-tight truncate w-full">${tInfo.arrStop || '도착지'}</span>
                    <span class="text-xs text-gray-500 mt-1">${tInfo.end || '--:--'}</span>
                </div>
            </div>
            ${tInfo.headsign ? `
            <div class="flex justify-between items-center border-t border-gray-200 dark:border-gray-600 pt-3">
                <span class="text-xs text-gray-500">방향</span>
                <span class="text-sm font-bold text-gray-800 dark:text-white truncate ml-2">${tInfo.headsign}</span>
            </div>` : ''}
            ${statusHtml ? `
            <div class="flex justify-between items-center mt-2">
                <span class="text-xs text-gray-500">실시간 현황</span>
                ${statusHtml}
            </div>` : ''}
        `;
    } else {
        publicInfoEl.classList.add('hidden');
    }

    const flightInfoEl = document.getElementById('transit-detail-flight-info');
    const searchBtnEl = document.getElementById('transit-detail-search-btn');

    if (item.tag === '비행기') {
        const info = item.transitInfo || {};

        document.getElementById('transit-detail-pnr').innerText = info.pnr ? info.pnr.toUpperCase() : '미정';
        document.getElementById('transit-detail-terminal').innerText = info.terminal ? info.terminal.toUpperCase() : '미정';
        document.getElementById('transit-detail-gate').innerText = info.gate ? info.gate.toUpperCase() : '미정';

        flightInfoEl.classList.remove('hidden');

        let flightNum = info.flightNum || (item.title.match(/\(([^)]+)\)/) ? item.title.match(/\(([^)]+)\)/)[1] : '');
        flightNum = flightNum.toUpperCase();

        if (flightNum) {
            searchBtnEl.classList.remove('hidden');
            searchBtnEl.innerHTML = `<span class="material-symbols-outlined text-base">search</span> 항공편 검색`;
            searchBtnEl.onclick = () => window.open(`https://www.google.com/search?q=${encodeURIComponent(flightNum + " 항공편")}`, '_blank');
        } else {
            searchBtnEl.classList.add('hidden');
        }
    } else {
        if (flightInfoEl) flightInfoEl.classList.add('hidden');

        if (searchBtnEl) {
            const timeline = travelData.days[dayIndex].timeline;

            const findLocItem = (start, dir) => {
                let i = start;
                while (i >= 0 && i < timeline.length) {
                    const it = timeline[i];
                    if ((it.lat && it.lng) || (!it.isTransit && it.tag !== '메모' && it.location && it.location !== '위치')) {
                        return it;
                    }
                    i += dir;
                }
                return null;
            };

            const originItem = findLocItem(index - 1, -1);
            const destItem = findLocItem(index + 1, 1);

            if (originItem && destItem) {
                searchBtnEl.classList.remove('hidden');
                searchBtnEl.innerHTML = `<span class="material-symbols-outlined text-base">map</span> 경로 보기`;
                searchBtnEl.onclick = () => {
                    const getLocStr = (it) => {
                        if (it.location && it.location !== '위치') {
                            return it.location;
                        }
                        if (it.title) {
                            return it.title;
                        }
                        if (it.lat && it.lng) {
                            return `${it.lat},${it.lng}`;
                        }
                        return '';
                    };
                    const origin = encodeURIComponent(getLocStr(originItem));
                    const destination = encodeURIComponent(getLocStr(destItem));

                    let mode = 'transit';
                    if (item.tag === '도보') mode = 'walking';
                    else if (item.tag === '차량') mode = 'driving';

                    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`, '_blank');
                };
            } else {
                searchBtnEl.classList.add('hidden');
            }
        }
    }

    const timeline = travelData.days[dayIndex].timeline;
    const prevItem = index > 0 ? timeline[index - 1] : null;
    const nextItem = index < timeline.length - 1 ? timeline[index + 1] : null;
    const prevLoc = prevItem ? (prevItem.title || "출발지") : "출발지";
    const nextLoc = nextItem ? (nextItem.title || "도착지") : "도착지";

    let routeText = `${prevLoc} ➡️ ${nextLoc}`;

    // 비행기인 경우 공항 정보 우선 표시
    if (item.tag === '비행기' && item.location && item.location.includes('✈️')) {
        routeText = item.location;
    }
    // 대중교통인 경우 환승지 정보가 있으면 표시
    else if (tInfo.depStop && tInfo.arrStop && ['버스', '전철', '기차', '지하철'].some(t => item.tag && item.tag.includes(t))) {
        routeText = `${tInfo.depStop} ➡️ ${tInfo.arrStop}`;
    }

    document.getElementById('transit-detail-route').innerText = routeText;

    document.getElementById('transit-detail-note').innerText = item.note || "메모가 없습니다.";

    // Detailed Steps (Ekispert 등 다단계 경로)
    const stepsContainer = document.getElementById('transit-detail-steps');
    const stepsList = document.getElementById('transit-detail-steps-list');

    if (item.detailedSteps && item.detailedSteps.length > 0) {
        stepsContainer.classList.remove('hidden');
        stepsList.innerHTML = '';

        item.detailedSteps.forEach((step, idx) => {
            const stepCard = document.createElement('div');
            stepCard.className = 'bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3';

            // 태그 색상 처리 (노선명/번호)
            let tagHtml = '';
            if (step.color && (step.color.startsWith('rgb') || step.color.startsWith('#'))) {
                // RGB 색상값(Ekispert) 또는 Hex 색상값(Google Maps) 사용
                const bgColor = step.color;
                const txtColor = step.textColor || 'white';
                tagHtml = `<span style="background-color: ${bgColor}; color: ${txtColor};" class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">${step.tag}</span>`;
            } else if (step.tagColor && step.tagColor.startsWith('rgb')) {
                // 하위 호환성
                tagHtml = `<span style="background-color: ${step.tagColor}; color: white;" class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">${step.tag}</span>`;
            } else {
                // Tailwind 클래스 사용
                const colorMap = {
                    'blue': 'bg-blue-500 text-white',
                    'green': 'bg-green-500 text-white',
                    'red': 'bg-red-500 text-white',
                    'orange': 'bg-orange-500 text-white',
                    'purple': 'bg-purple-500 text-white',
                    'gray': 'bg-gray-500 text-white'
                };
                const tagClass = colorMap[step.tagColor] || 'bg-blue-500 text-white';
                tagHtml = `<span class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${tagClass}">${step.tag}</span>`;
            }

            // 이동수단 타입 태그 생성 (오른쪽)
            let typeTagHtml = '';
            if (step.type) {
                const typeMap = {
                    'walk': { label: '도보', class: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
                    'bus': { label: '버스', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
                    'subway': { label: '전철', class: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
                    'train': { label: '기차', class: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
                    'airplane': { label: '비행기', class: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' },
                    'ship': { label: '배', class: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300' },
                    'car': { label: '차량', class: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' }
                };
                const typeInfo = typeMap[step.type] || { label: step.type, class: 'bg-gray-100 text-gray-700' };
                typeTagHtml = `<span class="px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${typeInfo.class}">${typeInfo.label}</span>`;
            }

            // 오른쪽에 항상 타입 태그가 붙도록 렌더링
            stepCard.innerHTML = `
                <span class="material-symbols-outlined text-gray-600 dark:text-gray-300">${step.icon}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        ${tagHtml}
                        <span class="text-xs text-gray-500 dark:text-gray-400">${step.time}</span>
                    </div>
                    <p class="text-sm font-bold text-gray-800 dark:text-white truncate">${step.title}</p>
                    ${step.transitInfo?.depStop && step.transitInfo?.arrStop ? `
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ${step.transitInfo.depStop} → ${step.transitInfo.arrStop}
                        ${step.transitInfo.stopCount ? ` (${step.transitInfo.stopCount}정거장)` : ''}
                    </p>
                    ` : ''}
                </div>
                <div class="flex-shrink-0">${typeTagHtml}</div>
            `;
            stepsList.appendChild(stepCard);
        });
    } else {
        stepsContainer.classList.add('hidden');
    }

    renderAttachments(item, 'transit-attachment-list');

    modal.classList.remove('hidden');
}

export function closeTransitDetailModal(fromHistory = false) {
    document.getElementById('transit-detail-modal').classList.add('hidden');
    setViewingItemIndex(null);
}

export function editCurrentTransitItem() {
    if (viewingItemIndex !== null) {
        const idx = viewingItemIndex;

        const savedStart = document.getElementById('transit-detail-start-val').value;
        const savedEnd = document.getElementById('transit-detail-end-val').value;

        setIsEditingFromDetail(true);
        closeTransitDetailModal();
        setTimeout(() => {
            editTimelineItem(idx, targetDayIndex);
            if (savedStart) document.getElementById('transit-start-time').value = savedStart;
            if (savedEnd) document.getElementById('transit-end-time').value = savedEnd;
            calculateTransitDuration();
        }, 50);
    }
}

export function deleteCurrentTransitItem() {
    const itemIndex = viewingItemIndex !== null ? viewingItemIndex : currentRouteItemIndex;
    // 모든 모달 닫기 (z-index 높은 모달 포함)
    document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden'));
    if (itemIndex !== null && targetDayIndex !== null) {
        const modal = document.getElementById('delete-transit-modal');
        if (modal) {
            modal.style.zIndex = 99999;
            modal.classList.remove('hidden');
        }
    }
}

export function closeDeleteTransitModal() {
    document.getElementById('delete-transit-modal').classList.add('hidden');
}

export function confirmDeleteTransit() {
    const itemIndex = viewingItemIndex !== null ? viewingItemIndex : currentRouteItemIndex;

    if (itemIndex !== null && targetDayIndex !== null) {
        travelData.days[targetDayIndex].timeline.splice(itemIndex, 1);
        reorderTimeline(targetDayIndex);
        closeDeleteTransitModal();
        closeTransitDetailModal();
        closeRouteDetailModal();
    }
}

// [Flight Input Modal Logic]
let flightInputIndex = null;
let isFlightEditing = false;

const majorAirports = [
    { code: "ICN", name: "인천국제공항" },
    { code: "GMP", name: "김포국제공항" },
    { code: "CJU", name: "제주국제공항" },
    { code: "PUS", name: "김해국제공항" },
    { code: "NRT", name: "나리타 국제공항" },
    { code: "HND", name: "하네다 공항" },
    { code: "KIX", name: "간사이 국제공항" },
    { code: "FUK", name: "후쿠오카 공항" },
    { code: "CTS", name: "신치토세 공항" },
    { code: "OKA", name: "나하 공항" },
    { code: "TPE", name: "타오위안 국제공항" },
    { code: "TSA", name: "송산 공항" },
    { code: "DAD", name: "다낭 국제공항" },
    { code: "HAN", name: "노이바이 국제공항" },
    { code: "SGN", name: "탄손누트 국제공항" },
    { code: "BKK", name: "수완나품 공항" },
    { code: "DMK", name: "돈므앙 국제공항" },
    { code: "HKG", name: "홍콩 국제공항" },
    { code: "SIN", name: "창이 공항" },
    { code: "MNL", name: "니노이 아키노 국제공항" },
    { code: "CEB", name: "막탄 세부 국제공항" },
    { code: "JFK", name: "존 F. 케네디 국제공항" },
    { code: "LAX", name: "로스앤젤레스 국제공항" },
    { code: "SFO", name: "샌프란시스코 국제공항" },
    { code: "LHR", name: "히드로 공항" },
    { code: "CDG", name: "샤를 드 골 공항" },
    { code: "FRA", name: "프랑크푸르트 공항" },
    { code: "FCO", name: "레오나르도 다 빈치 국제공항" },
    { code: "DXB", name: "두바이 국제공항" },
];

export function openFlightInputModal(index, isEdit = false) {
    flightInputIndex = index;
    isFlightEditing = isEdit;

    const flightNumInput = document.getElementById('flight-number');
    const pnrInput = document.getElementById('flight-pnr');
    const depInput = document.getElementById('flight-dep-airport');
    const arrInput = document.getElementById('flight-arr-airport');
    const depTimeInput = document.getElementById('flight-dep-time');
    const arrTimeInput = document.getElementById('flight-arr-time');
    const terminalInput = document.getElementById('flight-terminal');
    const gateInput = document.getElementById('flight-gate');
    const noteInput = document.getElementById('flight-note');
    const modalTitle = document.querySelector('#flight-input-modal h3');
    const saveBtn = document.querySelector('#flight-input-modal button[onclick="saveFlightItem()"]');

    flightNumInput.value = "";
    pnrInput.value = "";
    depInput.value = "";
    arrInput.value = "";
    depTimeInput.value = "";
    arrTimeInput.value = "";
    terminalInput.value = "";
    gateInput.value = "";
    noteInput.value = "";

    const datalist = document.getElementById('airport-list');
    if (datalist && datalist.children.length === 0) {
        majorAirports.forEach(ap => {
            const opt = document.createElement('option');
            opt.value = `${ap.code} (${ap.name})`;
            datalist.appendChild(opt);
        });
    }

    if (isEdit) {
        modalTitle.innerText = "항공편 정보 수정";
        saveBtn.innerText = "수정 완료";

        const item = travelData.days[targetDayIndex].timeline[index];
        const info = item.transitInfo || {};

        if (info.flightNum) flightNumInput.value = info.flightNum;
        else if (item.title) {
            const match = item.title.match(/\(([^)]+)\)/);
            if (match) flightNumInput.value = match[1];
        }

        if (info.pnr) pnrInput.value = info.pnr;
        else if (item.note) {
            const match = item.note.match(/예약번호:\s*([^\n]+)/);
            if (match) pnrInput.value = match[1].trim();
        }

        if (info.depAirport) depInput.value = info.depAirport;
        else if (item.location) {
            const parts = item.location.split('✈️');
            if (parts.length === 2) depInput.value = parts[0].trim();
        }

        if (info.arrAirport) arrInput.value = info.arrAirport;
        else if (item.location) {
            const parts = item.location.split('✈️');
            if (parts.length === 2) arrInput.value = parts[1].trim();
        }

        if (info.depTime) depTimeInput.value = info.depTime;
        if (info.arrTime) arrTimeInput.value = info.arrTime;
        if (info.terminal) terminalInput.value = info.terminal;
        if (info.gate) gateInput.value = info.gate;
        if (info.userNote) noteInput.value = info.userNote;
    } else {
        modalTitle.innerText = "항공편 정보 입력";
        saveBtn.innerText = "추가";
    }

    flightNumInput.onkeydown = function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchFlightNumber();
        }
    };

    const handleAirportEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = e.target.value.trim();
            if (!val) return;

            const match = majorAirports.find(ap =>
                ap.name.includes(val) ||
                ap.code.includes(val.toUpperCase())
            );

            if (match) {
                e.target.value = `${match.code} (${match.name})`;
                if (e.target.id === 'flight-dep-airport') {
                    arrInput.focus();
                }
            }
        }
    };

    depInput.onkeydown = handleAirportEnter;
    arrInput.onkeydown = handleAirportEnter;

    document.getElementById('flight-input-modal').classList.remove('hidden');
    setTimeout(() => flightNumInput.focus(), 100);
}

export function closeFlightInputModal() {
    document.getElementById('flight-input-modal').classList.add('hidden');
    flightInputIndex = null;
}

export function searchFlightNumber() {
    const flightNum = document.getElementById('flight-number').value.trim();
    if (!flightNum) {
        alert("항공편명을 입력해주세요 (예: KE123)");
        return;
    }
    window.open(`https://www.google.com/search?q=${encodeURIComponent(flightNum + " 항공편")}`, '_blank');
}

export function saveFlightItem() {
    const flightNum = document.getElementById('flight-number').value;
    const pnr = document.getElementById('flight-pnr').value;
    const depAirport = document.getElementById('flight-dep-airport').value;
    const arrAirport = document.getElementById('flight-arr-airport').value;
    const depTime = document.getElementById('flight-dep-time').value;
    const arrTime = document.getElementById('flight-arr-time').value;
    const terminal = document.getElementById('flight-terminal').value;
    const gate = document.getElementById('flight-gate').value;
    const userNote = document.getElementById('flight-note').value;

    let durationStr = "2시간";
    if (depTime && arrTime) {
        const [h1, m1] = depTime.split(':').map(Number);
        const [h2, m2] = arrTime.split(':').map(Number);
        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60;

        const h = Math.floor(diff / 60);
        const m = diff % 60;
        durationStr = (h > 0 ? `${h}시간 ` : "") + `${m}분`;
    }

    let sysNote = "";
    if (pnr) sysNote += `예약번호: ${pnr}`;
    if (terminal) sysNote += (sysNote ? "\n" : "") + `터미널: ${terminal}`;
    if (gate) sysNote += (sysNote ? " / " : "") + `게이트: ${gate}`;

    let noteStr = userNote;
    if (sysNote) {
        noteStr = noteStr ? `${noteStr}\n\n${sysNote}` : sysNote;
    }

    const newItem = {
        time: durationStr,
        title: flightNum ? `비행기로 이동 (${flightNum.toUpperCase()})` : "비행기로 이동",
        location: (depAirport && arrAirport) ? `${depAirport.toUpperCase()} ✈️ ${arrAirport.toUpperCase()}` : "공항 이동",
        icon: "flight",
        tag: "비행기",
        isTransit: true,
        image: null,
        note: noteStr,
        transitInfo: {
            terminal: terminal.toUpperCase(),
            gate: gate.toUpperCase(),
            flightNum: flightNum.toUpperCase(),
            pnr: pnr.toUpperCase(),
            depAirport: depAirport.toUpperCase(),
            arrAirport: arrAirport.toUpperCase(),
            depTime,
            arrTime,
            userNote
        }
    };

    if (isFlightEditing) {
        travelData.days[targetDayIndex].timeline[flightInputIndex] = newItem;
    } else {
        travelData.days[targetDayIndex].timeline.splice(flightInputIndex + 1, 0, newItem);
    }

    reorderTimeline(targetDayIndex);
    closeFlightInputModal();

    if (isFlightEditing && isEditingFromDetail) {
        const newIndex = travelData.days[targetDayIndex].timeline.indexOf(newItem);
        if (newIndex !== -1) {
            openTransitDetailModal(newItem, newIndex, targetDayIndex);
        }
    }
    setIsEditingFromDetail(false);
}

export function openGoogleMapsRouteFromPrev() {
    const timeline = travelData.days[targetDayIndex].timeline;
    let prevItem = null;

    let searchIdx = -1;
    if (viewingItemIndex !== null) {
        searchIdx = viewingItemIndex - 1;
    } else {
        if (insertingItemIndex !== null && typeof insertingItemIndex === 'number') {
            searchIdx = insertingItemIndex;
        } else {
            searchIdx = timeline.length - 1;
        }
    }

    while (searchIdx >= 0) {
        const item = timeline[searchIdx];
        if ((item.lat && item.lng) || (!item.isTransit && item.tag !== '메모' && item.location && item.location !== '위치')) {
            prevItem = item;
            break;
        }
        searchIdx--;
    }

    if (!prevItem) {
        alert("이전 장소 정보를 찾을 수 없어 경로를 검색할 수 없습니다.");
        return;
    }

    let origin = "";
    if (prevItem.lat && prevItem.lng) {
        const lat = typeof prevItem.lat === 'function' ? prevItem.lat() : prevItem.lat;
        const lng = typeof prevItem.lng === 'function' ? prevItem.lng() : prevItem.lng;
        origin = `${lat},${lng}`;
    } else {
        origin = encodeURIComponent(prevItem.location || prevItem.title);
    }

    let destination = "";
    const currentLocVal = document.getElementById('item-location').value;

    if (currentLocVal) {
        destination = encodeURIComponent(currentLocVal);
    } else {
        alert("도착지(현재 장소)를 입력하거나 검색해주세요.");
        return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=transit`;
    window.open(url, '_blank');
}

export async function addFastestTransitItem() {
    // Google Maps API 로딩 확인
    if (typeof google === 'undefined' || !google.maps) {
        alert("Google Maps API가 로딩되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return;
    }

    if (targetDayIndex === null || targetDayIndex === -1 || !travelData.days[targetDayIndex]) {
        alert("날짜 정보를 찾을 수 없습니다.");
        return;
    }

    const timeline = travelData.days[targetDayIndex].timeline;
    const insertIdx = (insertingItemIndex !== null) ? Number(insertingItemIndex) : -1;

    let prevItem = null;
    let nextItem = null;

    // prevItem 찾기: 좌표가 있는 항목만 선택
    for (let i = (insertIdx >= 0 ? Math.min(insertIdx, timeline.length - 1) : timeline.length - 1); i >= 0; i--) {
        const item = timeline[i];
        if (item.lat && item.lng && !item.isTransit && item.tag !== '메모') {
            prevItem = item;
            break;
        }
    }

    // nextItem 찾기: 좌표가 있는 항목만 선택
    if (insertIdx >= 0) {
        for (let i = insertIdx + 1; i < timeline.length; i++) {
            const item = timeline[i];
            if (item.lat && item.lng && !item.isTransit && item.tag !== '메모') {
                nextItem = item;
                break;
            }
        }
    }

    // 좌표가 없는 경우 안내 팝업 표시
    if (!prevItem || !nextItem) {
        if (!prevItem && timeline.some(item => item.title === "집에서 출발" && (!item.lat || !item.lng))) {
            showHomeAddressRequiredModal(insertingItemIndex, targetDayIndex);
            return;
        }
        alert("경로를 계산할 출발지 또는 도착지 정보가 부족합니다.\n(일정 사이에 추가할 때 사용해주세요)");
        return;
    }

    const btn = document.querySelector('#add-selection-modal button[onclick="addFastestTransitItem()"]');
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="flex items-center justify-center gap-2"><span class="material-symbols-outlined animate-spin">refresh</span> 경로 탐색 중...</div>`;
    }

    try {
        const getPoint = (item) => {
            if (item.geometry && item.geometry.location) {
                const loc = item.geometry.location;
                return {
                    lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
                    lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng
                };
            }

            if (item.lat !== undefined && item.lng !== undefined) {
                return {
                    lat: typeof item.lat === 'function' ? item.lat() : Number(item.lat),
                    lng: typeof item.lng === 'function' ? item.lng() : Number(item.lng)
                };
            }

            return item.location || item.title;
        };

        const origin = getPoint(prevItem);
        const destination = getPoint(nextItem);

        // [Custom Logic] 일본/인도 지역 직선거리 기반 자동 처리
        // 국가 코드 추출 헬퍼 함수
        const getCountryCode = async (item) => {
            // 이미 국가 정보가 있으면 반환
            if (item.countryCode) return item.countryCode;

            // address_components가 있으면 추출
            if (item.address_components) {
                const country = item.address_components.find(c => c.types.includes('country'));
                if (country) return country.short_name;
            }

            // Geocoding으로 국가 정보 추출 (좌표가 있는 경우)
            if (item.lat && item.lng) {
                try {
                    const geocoder = new google.maps.Geocoder();
                    const result = await new Promise((resolve, reject) => {
                        geocoder.geocode({
                            location: {
                                lat: typeof item.lat === 'function' ? item.lat() : Number(item.lat),
                                lng: typeof item.lng === 'function' ? item.lng() : Number(item.lng)
                            }
                        }, (results, status) => {
                            if (status === 'OK' && results[0]) {
                                resolve(results[0]);
                            } else {
                                resolve(null);
                            }
                        });
                    });

                    if (result && result.address_components) {
                        const country = result.address_components.find(c => c.types.includes('country'));
                        if (country) {
                            // 캐싱
                            item.countryCode = country.short_name;
                            return country.short_name;
                        }
                    }
                } catch (e) {
                    console.warn('Geocoding failed:', e);
                }
            }

            return null;
        };

        // 앞뒤 장소의 국가 확인
        const prevCountry = await getCountryCode(prevItem);
        const nextCountry = await getCountryCode(nextItem);

        // 일본(JP)인 경우 Ekispert API 시도
        if (prevCountry === 'JP' && nextCountry === 'JP') {
            try {
                const ekispertResult = await getEkispertRoute(prevItem, nextItem);
                if (ekispertResult) {
                    // Ekispert API로 성공적으로 경로를 가져온 경우
                    const day = travelData.days[targetDayIndex];
                    ekispertResult.forEach((routeItem, i) => {
                        day.timeline.splice(insertIdx + 1 + i, 0, routeItem);
                    });
                    reorderTimeline(targetDayIndex);
                    closeAddModal();
                    return; // 성공했으면 여기서 종료
                }
            } catch (error) {
                console.warn('Ekispert API failed, falling back to straight distance:', error);
                // 실패하면 아래 직선거리 계산으로 fallback
            }
        }

        // 양쪽 모두 일본(JP) 또는 인도(IN)인 경우만 직선거리 계산
        const isTargetRegion = (prevCountry === 'JP' && nextCountry === 'JP') ||
            (prevCountry === 'IN' && nextCountry === 'IN');

        if (isTargetRegion && typeof origin === 'object' && typeof destination === 'object') {
            const dist = calculateStraightDistance(origin, destination);
            if (dist !== null) {
                let title, icon, tag, durationMins;

                if (dist <= 1000) {
                    title = "도보로 이동";
                    icon = "directions_walk";
                    tag = "도보";
                    durationMins = Math.max(1, Math.ceil(dist / 80));
                } else {
                    title = "대중교통으로 이동";
                    icon = "directions_bus";
                    tag = "대중교통";

                    if (dist <= 5000) {
                        durationMins = Math.ceil(dist / 120);
                    } else if (dist <= 15000) {
                        durationMins = Math.ceil(dist / (9000 / 60));
                    } else if (dist <= 40000) {
                        durationMins = Math.ceil(dist / (13000 / 60));
                    } else {
                        durationMins = Math.ceil(dist / (50000 / 60));
                    }
                    durationMins = Math.max(5, durationMins);
                }

                const h = Math.floor(durationMins / 60);
                const m = durationMins % 60;
                const durationStr = (h > 0 ? `${h}시간 ` : "") + `${m}분`;

                // 이전 장소의 종료 시간에서 시작 시간 계산
                let startTime = '';
                let endTime = '';

                if (insertIdx >= 0) {
                    const prevItem = timeline[insertIdx];
                    if (prevItem) {
                        if (prevItem.isTransit && prevItem.transitInfo && prevItem.transitInfo.end) {
                            startTime = prevItem.transitInfo.end;
                        } else if (prevItem.time) {
                            const prevTimeMinutes = parseTimeStr(prevItem.time);
                            if (prevTimeMinutes !== null) {
                                const prevDuration = prevItem.duration || 30;
                                const endMinutes = prevTimeMinutes + prevDuration;
                                startTime = minutesTo24Hour(endMinutes);
                            }
                        }

                        if (startTime) {
                            const startMinutes = parseTimeStr(startTime);
                            if (startMinutes !== null) {
                                const endMinutes = startMinutes + durationMins;
                                endTime = minutesTo24Hour(endMinutes);
                            }
                        }
                    }
                }

                const newItem = {
                    time: durationStr,
                    title: title,
                    location: "",
                    icon: icon,
                    tag: tag,
                    isTransit: true,
                    image: null,
                    note: `직선거리: ${Math.round(dist)}m (자동 계산됨)`,
                    fixedDuration: true,
                    transitInfo: startTime ? { start: startTime, end: endTime } : { start: "", end: "" }
                };

                timeline.splice(insertIdx + 1, 0, newItem);
                reorderTimeline(targetDayIndex);
                closeAddModal();
                return;
            }
        }

        let departureTime = new Date();
        const tripDateStr = travelData.days[targetDayIndex].date;
        if (tripDateStr) {
            const [y, m, d] = tripDateStr.split('-').map(Number);
            departureTime.setFullYear(y);
            departureTime.setMonth(m - 1);
            departureTime.setDate(d);

            let timeRefItem = null;
            let searchIdx = (insertIdx >= 0) ? Math.min(insertIdx, timeline.length - 1) : timeline.length - 1;
            if (searchIdx >= 0) timeRefItem = timeline[searchIdx];

            const refItem = timeRefItem || prevItem;
            if (refItem) {
                let mins = null;
                if (refItem.isTransit && refItem.transitInfo?.end) {
                    const [h, m] = refItem.transitInfo.end.split(':').map(Number);
                    mins = h * 60 + m;
                } else {
                    mins = parseTimeStr(refItem.time);
                }

                if (mins !== null) {
                    departureTime.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
                } else {
                    departureTime.setHours(9, 0, 0, 0);
                }
            }
        }

        // [Fix] If past, use Today/Tomorrow with same time (User Request)
        if (departureTime < new Date()) {
            const now = new Date();
            departureTime.setFullYear(now.getFullYear());
            departureTime.setMonth(now.getMonth());
            departureTime.setDate(now.getDate());
            // If the time has already passed today, use tomorrow
            if (departureTime < now) {
                departureTime.setDate(departureTime.getDate() + 1);
            }
        }

        const fetchRoute = async (params) => {
            return new Promise((resolve) => {
                const directionsService = new google.maps.DirectionsService();
                const request = {
                    origin: params.origin,
                    destination: params.destination,
                    travelMode: params.travelMode.toUpperCase(),
                    provideRouteAlternatives: params.provideRouteAlternatives
                };
                if (params.transitOptions) {
                    request.transitOptions = params.transitOptions;
                }

                directionsService.route(request, (result, status) => {
                    if (status === 'OK') {
                        resolve(result);
                    } else {
                        console.warn("Directions request failed: " + status);
                        resolve(null);
                    }
                });
            });
        };

        let result = null;
        let searchMode = null;

        if (!result) {
            result = await fetchRoute({
                origin, destination,
                travelMode: 'transit',
                transitOptions: { departureTime },
                provideRouteAlternatives: true
            });
            if (result) searchMode = 'transit';
        }

        if (!result) {
            logger.log("🕒 지정 시간 실패, 현재 시간으로 재시도");
            result = await fetchRoute({
                origin, destination,
                travelMode: 'transit',
                transitOptions: { departureTime: new Date() },
                provideRouteAlternatives: true
            });
            if (result) searchMode = 'transit';
        }

        if (!result) {
            logger.log("🚶 대중교통 실패, 도보 경로 탐색 시도");
            result = await fetchRoute({
                origin, destination,
                travelMode: 'walking',
                provideRouteAlternatives: true
            });
            if (result) searchMode = 'walking';
        }

        if (result) {
            closeAddModal();
            setTimeout(() => openRouteSelectionModal(result.routes, insertIdx, searchMode), 50);
        } else {
            let msg = "경로를 찾을 수 없습니다.";
            msg += "\n\n[가능한 원인]";
            msg += "\n1. 대중교통 운행 정보가 없는 지역";
            msg += "\n2. 너무 먼 미래의 날짜 (시간표 미확정)";
            msg += "\n3. 바다 건너기 등 육로 이동 불가";
            alert(msg);
        }

    } catch (error) {
        console.error(error);
        alert("오류 발생: " + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

let pendingRouteInsertIndex = null;

export function openRouteSelectionModal(routes, insertIdx, searchMode = null) {
    pendingRouteInsertIndex = insertIdx;

    let modal = document.getElementById('route-selection-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'route-selection-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[99999] hidden flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh] animate-fade-in-up">
                <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <h3 class="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">alt_route</span> 경로 선택
                    </h3>
                    <button onclick="closeRouteSelectionModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="p-2 bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-600 dark:text-blue-300 text-center">
                    가장 적합한 경로를 선택해주세요.
                </div>
                <div id="route-selection-list" class="overflow-y-auto p-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/50">
                    <!-- Routes injected here -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.className = 'fixed inset-0 bg-black/50 z-[99999] hidden flex items-center justify-center p-4';
    }

    const list = document.getElementById('route-selection-list');
    list.innerHTML = '';

    const formatDuration = (valObj) => {
        return valObj ? valObj.text : "";
    };

    const formatDistance = (valObj) => {
        return valObj ? valObj.text : "";
    };

    routes.forEach((route, idx) => {
        const leg = route.legs[0];

        if (searchMode === 'walking') {
            let distVal = 0;
            if (typeof leg.distance === 'number') distVal = leg.distance;
            else if (leg.distance?.value) distVal = leg.distance.value;

            if (distVal > 0) {
                const walkMins = Math.ceil(distVal / 67);
                const h = Math.floor(walkMins / 60);
                const m = walkMins % 60;
                const newText = h > 0 ? `${h}시간 ${m}분` : `${m}분`;

                leg.duration = { text: newText, value: walkMins * 60 };
            }
        }

        const duration = formatDuration(leg.duration);
        const distance = formatDistance(leg.distance);

        let iconsHtml = '';
        const transitSteps = leg.steps.filter(s => s.travel_mode === 'TRANSIT');

        if (transitSteps.length > 0) {
            transitSteps.forEach(step => {
                const vehicle = step.transit?.line?.vehicle || { type: 'BUS' };
                let icon = 'directions_bus';
                let colorClass = 'text-gray-600 dark:text-gray-300';

                if (vehicle.type === 'SUBWAY' || vehicle.type === 'METRO') {
                    icon = 'subway';
                    colorClass = 'text-orange-500';
                } else if (vehicle.type === 'HEAVY_RAIL' || vehicle.type === 'TRAIN') {
                    icon = 'train';
                    colorClass = 'text-blue-500';
                }

                const lineName = step.transit?.line?.short_name || step.transit?.line?.name || '';
                const lineColor = step.transit?.line?.color ? `style="color: ${step.transit.line.color}"` : '';

                iconsHtml += `
                    <div class="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded-md text-xs shadow-sm">
                        <span class="material-symbols-outlined text-[16px] ${!lineColor ? colorClass : ''}" ${lineColor}>${icon}</span>
                        <span class="font-bold text-gray-700 dark:text-gray-200">${lineName}</span>
                    </div>`;
            });
        } else {
            iconsHtml += `
                <div class="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded-md text-xs shadow-sm">
                    <span class="material-symbols-outlined text-[16px] text-green-600">directions_walk</span>
                    <span class="font-bold text-gray-700 dark:text-gray-200">도보</span>
                </div>`;
        }

        const btn = document.createElement('button');
        btn.className = "w-full text-left p-4 rounded-xl bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 hover:border-primary hover:ring-1 hover:ring-primary hover:shadow-md transition-all group relative overflow-hidden";

        const badge = idx === 0 ? `<div class="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">추천</div>` : '';

        const formatAddr = (addr) => {
            if (!addr) return "";
            const parts = addr.split(' ');
            return parts.length > 1 ? parts.slice(1).join(' ') : addr;
        };
        const startAddr = formatAddr(leg.start_address) || '출발지';
        const endAddr = formatAddr(leg.end_address) || '도착지';

        btn.innerHTML = `
            ${badge}
            <div class="flex justify-between items-end mb-3">
                <span class="font-bold text-2xl text-gray-800 dark:text-white tracking-tight">${duration}</span>
                <span class="text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">${distance}</span>
            </div>
            <div class="flex flex-wrap gap-2 mb-3">
                ${iconsHtml}
            </div>
            <div class="flex items-center gap-1 text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
                <span class="truncate flex-1">${startAddr} → ${endAddr}</span>
            </div>
        `;

        btn.onclick = () => {
            processSelectedRoute(route, pendingRouteInsertIndex);
            closeRouteSelectionModal();
        };
        list.appendChild(btn);
    });

    modal.classList.remove('hidden');
}

export function closeRouteSelectionModal() {
    const modal = document.getElementById('route-selection-modal');
    if (modal) modal.classList.add('hidden');
    pendingRouteInsertIndex = null;
}

function processSelectedRoute(route, insertIdx) {
    const leg = route.legs[0];
    const steps = leg.steps;

    const safe = (val) => (val === undefined || val === null) ? "" : val;

    const formatDuration = (valObj) => {
        return valObj ? valObj.text : "";
    };

    const formatDistance = (valObj) => {
        return valObj ? valObj.text : "";
    };

    const detailedSteps = [];

    const hasTransit = steps.some(step => step.travel_mode === 'TRANSIT');

    const totalDuration = formatDuration(leg.duration);
    const totalDistance = formatDistance(leg.distance);

    // 상세 경로 정보 생성 (펼쳐질 내용)
    if (!hasTransit) {
        detailedSteps.push({
            time: totalDuration || "시간 미정",
            title: "도보로 이동",
            location: "",
            icon: "directions_walk",
            tag: "도보",
            type: "walk",
            isTransit: true,
            image: null,
            note: "경로 상세 정보 없음",
            fixedDuration: true,
            transitInfo: { start: "", end: "" }
        });
    } else {
        for (const step of steps) {
            if (step.travel_mode === 'TRANSIT' && step.transit) {
                const line = step.transit.line || {};
                const vehicle = line.vehicle || { type: 'BUS' };

                // 노선명 추출 (short_name 우선, 없으면 name)
                const lineName = safe(line.short_name) || safe(line.name) || "대중교통";

                let icon = "directions_bus";
                let titleBase = "버스로 이동";

                const vType = vehicle.type || 'BUS';
                if (vType === 'SUBWAY' || vType === 'METRO') {
                    icon = "subway"; titleBase = "전철로 이동";
                } else if (vType === 'HEAVY_RAIL' || vType === 'TRAIN') {
                    icon = "train"; titleBase = "기차로 이동";
                }

                const title = `${titleBase} (${lineName})`;

                // Google Maps 색상 처리
                let lineColor = null;
                let textColor = '#ffffff';
                // Google Maps API는 'color', Ekispert 등은 'Color'일 수 있음
                const rawColor = line.color || line.Color;

                if (rawColor) {
                    // Google Maps는 #RRGGBB 형태로 제공
                    lineColor = rawColor.startsWith('#') ? rawColor : `#${rawColor}`;

                    // 밝기 계산하여 텍스트 색상 결정
                    const hex = lineColor.replace('#', '');
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    textColor = brightness > 128 ? '#000000' : '#ffffff';
                }

                if (line.text_color) {
                    textColor = line.text_color.startsWith('#') ? line.text_color : `#${line.text_color}`;
                }

                // 이동수단 타입 결정
                let transitType = 'bus';
                if (vType === 'SUBWAY' || vType === 'METRO') {
                    transitType = 'subway';
                } else if (vType === 'HEAVY_RAIL' || vType === 'TRAIN') {
                    transitType = 'train';
                }

                const stepDuration = formatDuration(step.duration);

                detailedSteps.push({
                    time: stepDuration,
                    title: safe(title),
                    location: "",
                    icon: icon,
                    tag: lineName,  // ★ 노선명을 tag에 넣기 (예: "7호선", "6019")
                    type: transitType,  // ★ 이동수단 타입 (bus, subway, train)
                    tagColor: lineColor || 'blue',
                    color: lineColor,  // ★ UI에서 인식하는 필드
                    textColor: textColor,  // ★ 텍스트 색상
                    transitInfo: {
                        depStop: safe(step.transit.departure_stop?.name),
                        arrStop: safe(step.transit.arrival_stop?.name),
                        start: safe(step.transit.departure_time?.text),
                        end: safe(step.transit.arrival_time?.text),
                        headsign: safe(step.transit.headsign),
                        numStops: step.transit.num_stops || 0
                    }
                });
            } else if (step.travel_mode === 'WALKING') {
                const stepDuration = formatDuration(step.duration);
                let instructions = safe(step.instructions) || "도보로 이동";
                const div = document.createElement("div");
                div.innerHTML = instructions;
                instructions = div.textContent || div.innerText || "도보로 이동";

                detailedSteps.push({
                    time: stepDuration,
                    title: "도보로 이동",
                    location: "",
                    icon: "directions_walk",
                    tag: "도보",
                    type: "walk",
                    isTransit: true,
                    image: null,
                    note: instructions,
                    fixedDuration: true,
                    transitInfo: { start: "", end: "" }
                });
            }
        }
    }

    if (detailedSteps.length === 0) {
        detailedSteps.push({
            time: totalDuration || "이동",
            title: "이동",
            location: "",
            icon: "commute",
            tag: "이동",
            isTransit: true,
            image: null,
            note: "경로 상세 정보 없음",
            fixedDuration: true,
            transitInfo: { start: "", end: "" }
        });
    }

    // 대표 경로 아이템 생성 (요약본)
    const transitSteps = steps.filter(s => s.travel_mode === 'TRANSIT');
    let summaryTitle = "";
    let summaryIcon = "commute";
    let summaryTag = "이동";

    if (!hasTransit) {
        summaryTitle = "도보로 이동";
        summaryIcon = "directions_walk";
        summaryTag = "도보";
    } else {
        // 도보를 제외한 대중교통 노선명 추출 (HTML 태그로 변환)
        const transitTags = [];
        transitSteps.forEach(step => {
            const line = step.transit?.line || {};
            const vehicle = line.vehicle || {};
            const lineName = line.short_name || line.name || vehicle.name || '';

            if (lineName) {
                let bgColor = '#3b82f6'; // 기본 파란색
                let txtColor = '#ffffff';

                if (line.color) {
                    bgColor = line.color.startsWith('#') ? line.color : `#${line.color}`;
                    // 밝기 계산하여 텍스트 색상 자동 결정
                    const hex = bgColor.replace('#', '');
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    if (brightness > 128) txtColor = '#000000';
                }
                if (line.text_color) {
                    txtColor = line.text_color.startsWith('#') ? line.text_color : `#${line.text_color}`;
                }

                transitTags.push(`<span style="background-color:${bgColor};color:${txtColor};padding:2px 6px;border-radius:4px;font-size:0.9em;display:inline-block;vertical-align:middle;font-weight:bold;">${lineName}</span>`);
            }
        });

        // 노선명이 있으면 화살표로 연결, 없으면 기본 표시
        if (transitTags.length > 0) {
            summaryTitle = transitTags.join(' <span style="color:#9ca3af;font-size:0.8em;">➜</span> ');

            // 아이콘과 태그는 첫 번째 대중교통 타입으로 설정
            const firstVehicle = transitSteps[0]?.transit?.line?.vehicle?.type || 'BUS';
            if (firstVehicle === 'SUBWAY' || firstVehicle === 'METRO') {
                summaryIcon = "subway";
                summaryTag = "전철";
            } else if (firstVehicle === 'HEAVY_RAIL' || firstVehicle === 'TRAIN') {
                summaryIcon = "train";
                summaryTag = "기차";
            } else {
                summaryIcon = "directions_bus";
                summaryTag = "버스";
            }
        } else {
            // 노선명이 없는 경우 기본 표시
            const vehicleTypes = {};
            transitSteps.forEach(step => {
                const vType = step.transit?.line?.vehicle?.type || 'BUS';
                vehicleTypes[vType] = (vehicleTypes[vType] || 0) + 1;
            });

            if (Object.keys(vehicleTypes).length > 0) {
                const mainType = Object.keys(vehicleTypes).reduce((a, b) =>
                    vehicleTypes[a] > vehicleTypes[b] ? a : b
                );

                if (mainType === 'SUBWAY' || mainType === 'METRO') {
                    summaryIcon = "subway";
                    summaryTag = "전철";
                    summaryTitle = "전철로 이동";
                } else if (mainType === 'HEAVY_RAIL' || mainType === 'TRAIN') {
                    summaryIcon = "train";
                    summaryTag = "기차";
                    summaryTitle = "기차로 이동";
                } else {
                    summaryIcon = "directions_bus";
                    summaryTag = "버스";
                    summaryTitle = "버스로 이동";
                }
            } else {
                summaryTitle = "대중교통으로 이동";
                summaryIcon = "commute";
                summaryTag = "대중교통";
            }
        }
    }

    // 타임라인 배열 가져오기
    const timelineArr = travelData.days[targetDayIndex].timeline;

    // 이전 장소의 종료 시간에서 시작 시간 계산
    let routeStartTime = '';
    let routeEndTime = '';

    // totalDuration을 분 단위로 변환
    const totalMinutes = totalDuration ? parseDurationStr(totalDuration) : 0;

    if (insertIdx >= 0) {
        const prevItem = timelineArr[insertIdx];
        if (prevItem) {
            if (prevItem.isTransit && prevItem.transitInfo && prevItem.transitInfo.end) {
                routeStartTime = prevItem.transitInfo.end;
            } else if (prevItem.time) {
                const prevTimeMinutes = parseTimeStr(prevItem.time);
                if (prevTimeMinutes !== null) {
                    const prevDuration = prevItem.duration || 30;
                    const endMinutes = prevTimeMinutes + prevDuration;
                    routeStartTime = minutesTo24Hour(endMinutes);
                }
            }

            if (routeStartTime && totalMinutes) {
                const startMinutes = parseTimeStr(routeStartTime);
                if (startMinutes !== null) {
                    const endMinutes = startMinutes + totalMinutes;
                    routeEndTime = minutesTo24Hour(endMinutes);
                }
            }
        }
    }

    const summaryItem = {
        time: totalDuration || "시간 미정",
        title: summaryTitle,
        location: "",
        icon: summaryIcon,
        tag: summaryTag,
        isTransit: true,
        image: null,
        note: "",
        fixedDuration: true,
        transitInfo: {
            start: routeStartTime || "",
            end: routeEndTime || "",
            summary: detailedSteps.length > 1 ? `총 거리: ${totalDistance}` : `총 거리: ${totalDistance}`
        },
        isCollapsed: detailedSteps.length > 0,
        detailedSteps: detailedSteps.length > 0 ? detailedSteps : null,
        // 메모, 지출, 첨부파일을 위한 빈 필드들
        expenses: [],
        attachments: []
    };

    if (insertIdx >= 0 && insertIdx < timelineArr.length) {
        const prevItem = timelineArr[insertIdx];
        const nextItem = (insertIdx + 1 < timelineArr.length) ? timelineArr[insertIdx + 1] : null;

        if (prevItem && nextItem && !prevItem.isTransit && !nextItem.isTransit) {
            const prevTimeMins = parseTimeStr(prevItem.time);
            const nextTimeMins = parseTimeStr(nextItem.time);

            if (prevTimeMins !== null) {
                let durVal = 0;
                if (typeof leg.duration === 'number') durVal = leg.duration;
                else if (leg.duration?.value) durVal = leg.duration.value;

                const durationMins = Math.ceil(durVal / 60);
                const arrivalTimeMins = prevTimeMins + durationMins;

                let effectiveNextTime = nextTimeMins;
                if (effectiveNextTime !== null && effectiveNextTime < prevTimeMins) {
                    effectiveNextTime += 24 * 60;
                }

                if (effectiveNextTime === null || arrivalTimeMins > effectiveNextTime) {
                    let newTime = arrivalTimeMins >= 24 * 60 ? arrivalTimeMins - 24 * 60 : arrivalTimeMins;
                    nextItem.time = formatTimeStr(newTime);
                }
            }
        }
    }

    timelineArr.splice(insertIdx + 1, 0, summaryItem);

    reorderTimeline(targetDayIndex);
    closeAddModal();
}

// [Route View Logic]
let routeMap = null;
let routePolyline = null;
let routeMarkers = [];

export async function openRouteModal() {
    const modal = document.getElementById('route-modal');
    modal.classList.remove('hidden');

    // Google Maps API 로드 대기
    if (!window.google || !window.google.maps) {
        console.warn("Google Maps API가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return;
    }

    const container = document.getElementById('route-map-container');

    // Google Maps로 지도 초기화
    if (!routeMap) {
        routeMap = new google.maps.Map(container, {
            center: { lat: 37.5665, lng: 126.9780 },
            zoom: 10,
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false
        });
    }

    if (!routeMap) {
        console.error("Google Maps가 로드되지 않았습니다.");
        return;
    }

    const timeline = travelData.days[currentDayIndex].timeline;
    const bounds = new google.maps.LatLngBounds();
    const path = [];
    const geocoder = new google.maps.Geocoder();
    let lastPlacePos = null;
    let transitBuffer = [];

    // 기존 마커와 폴리라인 제거
    routeMarkers.forEach(m => m.setMap(null));
    routeMarkers = [];
    if (routePolyline) {
        routePolyline.setMap(null);
        routePolyline = null;
    }

    // 하나의 InfoWindow 인스턴스 생성 (재사용)
    const sharedInfoWindow = new google.maps.InfoWindow();

    const getPoint = async (item) => {
        if (item.lat && item.lng) {
            return { lat: Number(item.lat), lng: Number(item.lng) };
        }
        if (item.location && item.location.length > 1 && !item.isTransit && item.location !== "위치") {
            return new Promise((resolve) => {
                geocoder.geocode({ address: item.location }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        resolve(results[0].geometry.location.toJSON());
                    } else {
                        resolve(null);
                    }
                });
            });
        }
        return null;
    };

    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];

        if (item.isTransit) {
            transitBuffer.push(item);
            continue;
        }

        try {
            const pos = await getPoint(item);
            if (pos) {
                path.push(pos);
                bounds.extend(pos);

                // 장소 마커 생성
                const marker = new google.maps.Marker({
                    position: pos,
                    map: routeMap,
                    label: {
                        text: path.length.toString(),
                        color: 'white',
                        fontWeight: 'bold'
                    },
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: '#774b00',
                        fillOpacity: 1,
                        strokeColor: 'white',
                        strokeWeight: 2,
                        scale: 15
                    }
                });

                marker.addListener('click', () => {
                    sharedInfoWindow.setContent(`
                        <div style="padding: 8px; min-width: 150px;">
                            <h4 style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${item.title}</h4>
                            <p style="font-size: 12px; color: #666; margin-bottom: 8px;">${item.location}</p>
                            <span style="display: inline-block; background: #f3e8ff; color: #7c3aed; border: 1px solid #e9d5ff; font-size: 12px; font-weight: bold; padding: 2px 8px; border-radius: 4px;">${item.time}</span>
                        </div>
                    `);
                    sharedInfoWindow.open(routeMap, marker);
                });

                routeMarkers.push(marker);

                // 이동 수단 마커 추가
                if (lastPlacePos && transitBuffer.length > 0) {
                    const count = transitBuffer.length;
                    for (let j = 0; j < count; j++) {
                        const tItem = transitBuffer[j];
                        const fraction = (j + 1) / (count + 1);

                        const transitPos = {
                            lat: lastPlacePos.lat + (pos.lat - lastPlacePos.lat) * fraction,
                            lng: lastPlacePos.lng + (pos.lng - lastPlacePos.lng) * fraction
                        };

                        const tMarker = new google.maps.Marker({
                            position: transitPos,
                            map: routeMap,
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                fillColor: 'white',
                                fillOpacity: 1,
                                strokeColor: '#774b00',
                                strokeWeight: 2,
                                scale: 10
                            }
                        });

                        tMarker.addListener('click', () => {
                            sharedInfoWindow.setContent(`
                                <div style="padding: 8px; min-width: 150px;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                        <span class="material-symbols-outlined" style="color: #774b00;">${tItem.icon}</span>
                                        <h4 style="font-weight: bold; font-size: 14px;">${tItem.title}</h4>
                                    </div>
                                    ${tItem.time ? `<span style="display: inline-block; background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; font-size: 12px; font-weight: bold; padding: 2px 8px; border-radius: 4px; margin-top: 4px;">${tItem.time}</span>` : ''}
                                    ${tItem.note ? `<p style="font-size: 12px; color: #666; margin-top: 4px;">📝 ${tItem.note}</p>` : ''}
                                </div>
                            `);
                            sharedInfoWindow.open(routeMap, tMarker);
                        });

                        routeMarkers.push(tMarker);
                    }
                }

                lastPlacePos = pos;
                transitBuffer = [];
            }
        } catch (e) {
            console.error("Route processing error:", e);
        }
    }

    // 경로 폴리라인 그리기
    if (path.length > 0) {
        routePolyline = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#774b00',
            strokeOpacity: 0.8,
            strokeWeight: 5,
            map: routeMap
        });

        routeMap.fitBounds(bounds);
    } else if (travelData.meta.lat && travelData.meta.lng) {
        routeMap.setCenter({ lat: Number(travelData.meta.lat), lng: Number(travelData.meta.lng) });
        routeMap.setZoom(12);
    }

    // 지도 크기 재조정
    setTimeout(() => {
        google.maps.event.trigger(routeMap, 'resize');
        if (path.length > 0) {
            routeMap.fitBounds(bounds);
        }
    }, 100);
}

export function closeRouteModal() {
    document.getElementById('route-modal').classList.add('hidden');
}

// 집 주소 필요 모달 표시
export function showHomeAddressRequiredModal(index, dayIndex) {
    setInsertingItemIndex(index);
    setTargetDayIndex(dayIndex);
    document.getElementById('add-selection-modal')?.classList.add('hidden');
    document.getElementById('home-address-required-modal')?.classList.remove('hidden');
}

export function closeHomeAddressRequiredModal() {
    document.getElementById('home-address-required-modal')?.classList.add('hidden');
}

export function goToProfileSettings() {
    closeHomeAddressRequiredModal();
    closeAddModal();
    openUserProfile();
}

// 경로 상세 정보 모달
export function viewRouteDetail(index, dayIndex = currentDayIndex, isEditMode = false) {
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    // 현재 경로 아이템 인덱스 저장 및 window에 노출
    currentRouteItemIndex = index;
    setViewingItemIndex(index);
    window.currentRouteItemIndex = index;
    window.isRouteEditMode = isEditMode;

    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline[index];

    // 이동 수단이 아니면 리턴
    if (!item.isTransit) return;

    // detailedSteps가 없으면 단일 이동 수단으로 처리 (빈 배열로 초기화)
    if (!item.detailedSteps) {
        item.detailedSteps = [];
    }
    if (!item.expenses) {
        item.expenses = [];
    }
    if (!item.attachments) {
        item.attachments = [];
    }

    // 출발지와 목적지 찾기
    const prevItem = index > 0 ? timeline[index - 1] : null;
    const nextItem = index < timeline.length - 1 ? timeline[index + 1] : null;
    const departurePlace = prevItem && !prevItem.isTransit ? prevItem.title : "출발지";
    const arrivalPlace = nextItem && !nextItem.isTransit ? nextItem.title : "도착지";
    const departureLocation = prevItem && !prevItem.isTransit ? prevItem.location : "";
    const arrivalLocation = nextItem && !nextItem.isTransit ? nextItem.location : "";

    // 모달 생성
    let modal = document.getElementById('route-detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'route-detail-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[99999] hidden flex items-center justify-center p-4';
        modal.onclick = (e) => {
            if (e.target === modal) closeRouteDetailModal();
        };
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-fade-in-up" onclick="event.stopPropagation()">
                <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800">
                    <h3 class="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">route</span> 
                        <span id="route-detail-title">경로 상세</span>
                    </h3>
                    <div id="route-detail-buttons" class="flex items-center gap-2">
                        <!-- Buttons injected here -->
                    </div>
                </div>
                <div id="route-detail-content" class="overflow-y-auto flex-1 bg-gray-50/50 dark:bg-gray-900/50">
                    <!-- Content injected here -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // 제목 설정 (출발지 → 도착지)
    document.getElementById('route-detail-title').textContent = `${departurePlace} → ${arrivalPlace}`;

    // 최적 경로 여부 확인 (detailedSteps가 있으면 최적 경로)
    const hasDetailedSteps = item.detailedSteps && item.detailedSteps.length > 0;

    // 버튼 설정
    const buttonsContainer = document.getElementById('route-detail-buttons');
    if (isEditMode) {
        buttonsContainer.innerHTML = `
            <button onclick="saveRouteItem()" class="bg-primary hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-1 font-bold">
                <span class="material-symbols-outlined text-sm">save</span>
                <span>저장</span>
            </button>
            <button onclick="closeRouteDetailModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;
    } else {
        // 최적 경로는 수정 버튼 없이 삭제 버튼만, 수동 입력은 수정 버튼 포함
        if (hasDetailedSteps) {
            buttonsContainer.innerHTML = `
                <button onclick="deleteCurrentTransitItem()" class="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors flex items-center gap-1">
                    <span class="material-symbols-outlined">delete</span>
                    <span class="text-sm font-bold">삭제</span>
                </button>
                <button onclick="closeRouteDetailModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            `;
        } else {
            buttonsContainer.innerHTML = `
                <button onclick="viewRouteDetail(${index}, ${targetDayIndex}, true)" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-1 font-bold">
                    <span class="material-symbols-outlined text-sm">edit</span>
                    <span>수정</span>
                </button>
                <button onclick="deleteCurrentTransitItem()" class="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors flex items-center gap-1">
                    <span class="material-symbols-outlined">delete</span>
                    <span class="text-sm font-bold">삭제</span>
                </button>
                <button onclick="closeRouteDetailModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            `;
        }
    }

    // 내용 생성
    const content = document.getElementById('route-detail-content');

    const isAirplane = item.transitType === 'airplane';

    // 환승 정보 표시
    let stepsHTML = '';

    if (isEditMode) {
        // 편집 모드 - 입력 필드
        if (isAirplane) {
            stepsHTML = `
                <div class="bg-white dark:bg-card-dark rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h4 class="font-bold text-lg mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-2xl">flight</span>
                        비행기 정보 입력
                    </h4>
                    
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-3">
                            <div class="relative">
                                <label class="text-xs font-bold text-gray-500 mb-1 block">출발 공항</label>
                                <input type="text" id="route-edit-departure" value="${item.flightInfo?.departure || ''}" placeholder="ICN" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm" autocomplete="off" oninput="filterAirports('departure', this.value)" onfocus="showAirportSuggestions('departure')" onkeydown="handleAirportKeydown(event, 'departure')">
                                <div id="airport-suggestions-departure" class="hidden absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>
                            </div>
                            <div class="relative">
                                <label class="text-xs font-bold text-gray-500 mb-1 block">도착 공항</label>
                                <input type="text" id="route-edit-arrival" value="${item.flightInfo?.arrival || ''}" placeholder="NRT" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm" autocomplete="off" oninput="filterAirports('arrival', this.value)" onfocus="showAirportSuggestions('arrival')" onkeydown="handleAirportKeydown(event, 'arrival')">
                                <div id="airport-suggestions-arrival" class="hidden absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="text-xs font-bold text-gray-500 mb-1 block">출발 시간</label>
                                <input type="time" id="route-edit-departure-time" value="${item.flightInfo?.departureTime || item.time || ''}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm" onchange="calculateArrivalTime()">
                            </div>
                            <div>
                                <label class="text-xs font-bold text-gray-500 mb-1 block">도착 시간</label>
                                <input type="time" id="route-edit-arrival-time" value="${item.flightInfo?.arrivalTime || ''}" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm" onchange="calculateFlightDuration()">
                            </div>
                        </div>
                        
                        <div>
                            <label class="text-xs font-bold text-gray-500 mb-1 block">소요 시간 (자동 계산)</label>
                            <input type="text" id="route-edit-duration" value="${item.duration || ''}" placeholder="자동 계산됨" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50" readonly>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="text-xs font-bold text-gray-500 mb-1 block">항공편</label>
                                <input type="text" id="route-edit-flight-number" value="${item.flightInfo?.flightNumber || ''}" placeholder="KE123" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                            </div>
                            <div>
                                <label class="text-xs font-bold text-gray-500 mb-1 block">예약번호</label>
                                <input type="text" id="route-edit-booking-ref" value="${item.flightInfo?.bookingRef || ''}" placeholder="ABC123" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="text-xs font-bold text-gray-500 mb-1 block">터미널</label>
                                <input type="text" id="route-edit-terminal" value="${item.flightInfo?.terminal || ''}" placeholder="1" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                            </div>
                            <div>
                                <label class="text-xs font-bold text-gray-500 mb-1 block">게이트</label>
                                <input type="text" id="route-edit-gate" value="${item.flightInfo?.gate || ''}" placeholder="A12" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            stepsHTML = `
                <div class="bg-white dark:bg-card-dark rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
                    <h4 class="font-bold text-lg mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary text-2xl">${item.icon}</span>
                        ${item.tag} 정보 입력
                    </h4>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="text-xs font-bold text-gray-500 mb-1 block">이동 경로</label>
                            <input type="text" id="route-edit-title" value="${item.title || ''}" placeholder="강남역 → 홍대입구역" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                        </div>
                        
                        <div>
                            <label class="text-xs font-bold text-gray-500 mb-1 block">소요 시간</label>
                            <div class="flex gap-2 mb-2">
                                <button type="button" onclick="setTransitDuration('10분')" class="flex-1 px-3 py-2 bg-gray-100 hover:bg-primary/10 dark:bg-gray-700 dark:hover:bg-primary/20 rounded-lg text-sm font-bold transition-colors">10분</button>
                                <button type="button" onclick="setTransitDuration('30분')" class="flex-1 px-3 py-2 bg-gray-100 hover:bg-primary/10 dark:bg-gray-700 dark:hover:bg-primary/20 rounded-lg text-sm font-bold transition-colors">30분</button>
                                <button type="button" onclick="setTransitDuration('1시간')" class="flex-1 px-3 py-2 bg-gray-100 hover:bg-primary/10 dark:bg-gray-700 dark:hover:bg-primary/20 rounded-lg text-sm font-bold transition-colors">1시간</button>
                                <button type="button" onclick="setTransitDuration('2시간')" class="flex-1 px-3 py-2 bg-gray-100 hover:bg-primary/10 dark:bg-gray-700 dark:hover:bg-primary/20 rounded-lg text-sm font-bold transition-colors">2시간</button>
                            </div>
                            <input type="text" id="route-edit-duration" value="${item.duration || '30분'}" placeholder="30분" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm" oninput="updateTransitArrivalTime()">
                        </div>
                    </div>
                </div>
            `;
        }
    } else if (item.detailedSteps && item.detailedSteps.length > 0) {
        stepsHTML = item.detailedSteps.map((step, idx) => {
            const isTransit = step.tag !== '도보';
            const transitInfo = step.transitInfo || {};

            return `
                <div class="bg-white dark:bg-card-dark rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="p-4">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-12 h-12 rounded-full ${isTransit ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-green-50 dark:bg-green-900/20'} flex items-center justify-center flex-shrink-0">
                                <span class="material-symbols-outlined ${isTransit ? 'text-primary' : 'text-green-600'} text-2xl">${step.icon}</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 class="font-bold text-text-main dark:text-white text-base">${step.title}</h4>
                                    ${step.tag ? (step.color ?
                    `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap flex-shrink-0" style="background-color: ${step.color}; color: ${step.textColor || '#ffffff'}">${step.tag}</span>` :
                    `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 whitespace-nowrap flex-shrink-0">${step.tag}</span>`) : ''}
                                </div>
                                <div class="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                    <span class="material-symbols-outlined text-base">schedule</span>
                                    <span class="font-bold">${step.time}</span>
                                    ${step.note ? `<span class="text-gray-400 mx-1">·</span><span class="truncate">${step.note}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        ${isTransit && (transitInfo.depStop || transitInfo.arrStop) ? `
                        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2 text-sm">
                            ${transitInfo.depStop ? `
                            <div class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-green-600 text-lg mt-0.5 flex-shrink-0">trip_origin</span>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-gray-900 dark:text-gray-100 break-words">${transitInfo.depStop}</div>
                                    ${transitInfo.start ? `<div class="text-gray-500 dark:text-gray-400 text-xs mt-0.5">${transitInfo.start} 출발</div>` : ''}
                                </div>
                            </div>` : ''}
                            ${transitInfo.arrStop ? `
                            <div class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-red-600 text-lg mt-0.5 flex-shrink-0">location_on</span>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-gray-900 dark:text-gray-100 break-words">${transitInfo.arrStop}</div>
                                    ${transitInfo.end ? `<div class="text-gray-500 dark:text-gray-400 text-xs mt-0.5">${transitInfo.end} 도착</div>` : ''}
                                </div>
                            </div>` : ''}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } else {
        // detailedSteps가 없는 경우 단일 이동 수단 정보 표시
        if (isAirplane && item.flightInfo) {
            // 비행기 정보 표시
            stepsHTML = `
                <div class="bg-white dark:bg-card-dark rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="p-4">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                                <span class="material-symbols-outlined text-primary text-2xl">flight</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 class="font-bold text-text-main dark:text-white text-base">${item.flightInfo.departure || '출발'} ✈️ ${item.flightInfo.arrival || '도착'}</h4>
                                </div>
                                <div class="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                    <span class="material-symbols-outlined text-base">schedule</span>
                                    <span class="font-bold">${item.flightInfo.departureTime || item.time || '--:--'} → ${item.flightInfo.arrivalTime || '--:--'}</span>
                                    ${item.flightInfo.duration ? `<span class="ml-2">(${item.flightInfo.duration})</span>` : ''}
                                </div>
                            </div>
                        </div>
                        
                        ${item.flightInfo.flightNumber || item.flightInfo.bookingRef || item.flightInfo.terminal || item.flightInfo.gate ? `
                        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2 text-sm">
                            ${item.flightInfo.flightNumber ? `
                            <div class="flex items-center gap-2">
                                <span class="text-gray-500 dark:text-gray-400 w-20">항공편</span>
                                <span class="font-bold text-gray-900 dark:text-gray-100">${item.flightInfo.flightNumber}</span>
                            </div>` : ''}
                            ${item.flightInfo.bookingRef ? `
                            <div class="flex items-center gap-2">
                                <span class="text-gray-500 dark:text-gray-400 w-20">예약번호</span>
                                <span class="font-bold text-gray-900 dark:text-gray-100">${item.flightInfo.bookingRef}</span>
                            </div>` : ''}
                            ${item.flightInfo.terminal ? `
                            <div class="flex items-center gap-2">
                                <span class="text-gray-500 dark:text-gray-400 w-20">터미널</span>
                                <span class="font-bold text-gray-900 dark:text-gray-100">${item.flightInfo.terminal}</span>
                            </div>` : ''}
                            ${item.flightInfo.gate ? `
                            <div class="flex items-center gap-2">
                                <span class="text-gray-500 dark:text-gray-400 w-20">게이트</span>
                                <span class="font-bold text-gray-900 dark:text-gray-100">${item.flightInfo.gate}</span>
                            </div>` : ''}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        } else {
            // 일반 이동 수단 정보 표시
            stepsHTML = `
                <div class="bg-white dark:bg-card-dark rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700">
                    <div class="p-4">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                                <span class="material-symbols-outlined text-primary text-2xl">${item.icon || 'directions_transit'}</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2 mb-1 flex-wrap">
                                    <h4 class="font-bold text-text-main dark:text-white text-base">${item.title}</h4>
                                    ${item.tag ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 whitespace-nowrap flex-shrink-0">${item.tag}</span>` : ''}
                                </div>
                                <div class="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                    <span class="material-symbols-outlined text-base">schedule</span>
                                    <span class="font-bold">${item.duration || item.time || '30분'}</span>
                                </div>
                            </div>
                        </div>
                        
                        ${item.transitInfo && (item.transitInfo.depStop || item.transitInfo.arrStop) ? `
                        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2 text-sm">
                            ${item.transitInfo.depStop ? `
                            <div class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-green-600 text-lg mt-0.5 flex-shrink-0">trip_origin</span>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-gray-900 dark:text-gray-100 break-words">${item.transitInfo.depStop}</div>
                                    ${item.transitInfo.start ? `<div class="text-gray-500 dark:text-gray-400 text-xs mt-0.5">${item.transitInfo.start} 출발</div>` : ''}
                                </div>
                            </div>` : ''}
                            ${item.transitInfo.arrStop ? `
                            <div class="flex items-start gap-2">
                                <span class="material-symbols-outlined text-red-600 text-lg mt-0.5 flex-shrink-0">location_on</span>
                                <div class="flex-1 min-w-0">
                                    <div class="font-bold text-gray-900 dark:text-gray-100 break-words">${item.transitInfo.arrStop}</div>
                                    ${item.transitInfo.end ? `<div class="text-gray-500 dark:text-gray-400 text-xs mt-0.5">${item.transitInfo.end} 도착</div>` : ''}
                                </div>
                            </div>` : ''}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
    }

    // 메모/지출/파일첨부 섹션 (장소 상세 모달에서 가져옴)
    const detailSectionsHTML = `
        <div class="flex-1 bg-white dark:bg-card-dark overflow-y-auto p-6 flex flex-col gap-6">
            <!-- 메모 섹션 -->
            <div class="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
                <h4 class="text-xs font-bold text-gray-500 uppercase mb-2">메모 / 설명</h4>
                <textarea id="route-detail-note" class="w-full bg-transparent border-none p-0 text-sm text-gray-700 dark:text-gray-300 resize-none focus:ring-0 leading-relaxed" rows="4" placeholder="메모를 입력하세요..." onchange="updateRouteItemNote(this.value)">${item.note || ''}</textarea>
            </div>

            <!-- 지출 섹션 -->
            <div>
                <div class="flex justify-between items-center mb-3">
                    <h4 class="text-xs font-bold text-gray-500 uppercase">지출 내역</h4>
                    <button type="button" onclick="openRouteExpenseModal()" class="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">add</span> 추가
                    </button>
                </div>
                
                <div id="route-expense-list" class="flex flex-col gap-2 mb-3 max-h-40 overflow-y-auto">
                    ${(item.expenses || []).map((exp, expIdx) => `
                        <div class="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                            <span class="text-sm text-gray-700 dark:text-gray-300 font-medium">${exp.description}</span>
                            <div class="flex items-center gap-2">
                                <span class="text-sm font-bold text-primary">₩${exp.amount.toLocaleString()}</span>
                                <button type="button" onclick="deleteRouteExpense(${expIdx})" class="text-red-400 hover:text-red-600 p-1"><span class="material-symbols-outlined text-sm">delete</span></button>
                            </div>
                        </div>
                    `).join('') || '<p class="text-sm text-gray-400 text-center py-4">지출 내역이 없습니다</p>'}
                </div>

                <div class="flex justify-between items-center border-t border-gray-100 dark:border-gray-700 pt-3">
                    <span class="font-bold text-sm text-gray-600 dark:text-gray-400">총 지출</span>
                    <div class="relative w-40">
                        <span class="absolute left-3 top-2 text-gray-500 font-bold">₩</span>
                        <input id="route-total-budget" type="number" class="w-full pl-8 pr-2 py-1.5 bg-gray-50 dark:bg-gray-900 border-none rounded-lg text-right font-bold text-xl text-primary outline-none cursor-default" readonly value="${(item.expenses || []).reduce((sum, exp) => sum + exp.amount, 0)}">
                    </div>
                </div>
            </div>

            <!-- 첨부 파일 섹션 -->
            <div class="border-t border-gray-100 dark:border-gray-700 pt-4">
                <div class="flex justify-between items-center mb-3">
                    <h4 class="text-xs font-bold text-gray-500 uppercase">첨부 파일 (티켓/PDF)</h4>
                    <button type="button" onclick="document.getElementById('route-attachment-upload').click()" class="text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">upload_file</span> 추가
                    </button>
                    <input type="file" id="route-attachment-upload" class="hidden" accept="image/*,application/pdf" onchange="handleRouteAttachmentUpload(this)">
                </div>
                <div id="route-attachment-list" class="grid grid-cols-2 md:grid-cols-3 gap-3">
                    ${(item.attachments || []).map((att, attIdx) => {
        const isPDF = att.url.toLowerCase().endsWith('.pdf') || att.type === 'application/pdf';
        return `
                            <div class="relative group">
                                ${isPDF ? `
                                <a href="${att.url}" target="_blank" class="block aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg flex flex-col items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                    <span class="material-symbols-outlined text-4xl text-red-500 mb-2">picture_as_pdf</span>
                                    <span class="text-xs text-gray-600 dark:text-gray-400 px-2 text-center truncate w-full">${att.name || 'PDF'}</span>
                                </a>
                                ` : `
                                <img src="${att.url}" alt="${att.name || 'Attachment'}" class="w-full aspect-square object-cover rounded-lg cursor-pointer" onclick="window.open('${att.url}', '_blank')">
                                `}
                                <button type="button" onclick="deleteRouteAttachment(${attIdx})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span class="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                        `;
    }).join('') || '<p class="col-span-full text-sm text-gray-400 text-center py-4">첨부 파일이 없습니다</p>'}
                </div>
            </div>
        </div>
    `;

    // 2단 레이아웃: 모바일(세로), PC(가로)
    // stepsHTML이 있을 때만 2단 레이아웃, 없으면 메모/지출만 표시
    if (stepsHTML) {
        content.innerHTML = `
            <!-- 구글맵 길찾기 버튼 -->
            <div class="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <button type="button" id="route-maps-btn-top" class="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-md">
                    <span class="material-symbols-outlined">map</span>
                    <span>구글맵으로 길찾기</span>
                </button>
            </div>
            
            <div class="flex flex-col md:flex-row min-h-full">
                <!-- 환승 정보 (왼쪽/위) -->
                <div class="flex-1 p-4 space-y-3 overflow-y-auto bg-gray-50/50 dark:bg-gray-900/50">
                    ${stepsHTML}
                </div>
                
                <!-- 메모/지출/첨부파일 (오른쪽/아래) -->
                ${detailSectionsHTML}
            </div>
        `;
    } else {
        // 수동 입력 이동수단 - 메모/지출만 표시
        content.innerHTML = detailSectionsHTML;
    }

    // 구글맵 버튼 이벤트 설정 (stepsHTML이 있을 때만)
    if (stepsHTML) {
        const mapsTopBtn = document.getElementById('route-maps-btn-top');
        if (mapsTopBtn) {
            mapsTopBtn.onclick = () => {
                let origin = departurePlace;
                let destination = arrivalPlace;

                if (departureLocation) origin = departureLocation;
                if (arrivalLocation) destination = arrivalLocation;

                const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=transit`;
                window.open(url, '_blank');
            };
        }
    }

    modal.classList.remove('hidden');
}

export function closeRouteDetailModal() {
    const modal = document.getElementById('route-detail-modal');
    if (modal) modal.classList.add('hidden');
    currentRouteItemIndex = null;
    window.currentRouteItemIndex = null;
}

// 경로 아이템 메모 업데이트
window.updateRouteItemNote = function (value) {
    if (targetDayIndex === null) return;
    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline.find(i => i.isTransit && i.isCollapsed);
    if (item) {
        item.note = value;
        autoSave();
    }
};

// 경로 지출 관련 함수들
window.openRouteExpenseModal = function () {
    // [Fix] Use centralized function for z-index/dropdown logic
    // Pass fromDetail=false so dropdown is hidden (transit item implies location)
    if (window.openExpenseModal) {
        window.openExpenseModal(targetDayIndex, false);
    } else {
        // Fallback
        if (window.ensureExpenseModal) window.ensureExpenseModal();
        const modal = document.getElementById('expense-modal');
        modal.classList.remove('hidden');
        modal.style.zIndex = '2147483647';
        document.body.appendChild(modal);
        if (window.hasOwnProperty('isAddingFromDetail')) window.isAddingFromDetail = false;
    }

    // [Fix] Override Save Button for Transit Expense
    const saveBtn = document.getElementById('expense-save-btn');
    if (saveBtn) {
        // [Fix] Directly assign window function
        saveBtn.onclick = window.saveRouteExpense;
        saveBtn.removeAttribute('onclick');
    }

    // Reset fields
    const desc = document.getElementById('expense-desc');
    const cost = document.getElementById('expense-cost');
    if (desc) desc.value = "";
    if (cost) cost.value = "";

    setTimeout(() => {
        if (desc) desc.focus();
    }, 100);
};

window.saveRouteExpense = function () {
    const desc = document.getElementById('expense-desc').value;
    const cost = document.getElementById('expense-cost').value;

    if (!desc || !cost) {
        alert("내역과 금액을 입력해주세요.");
        return;
    }

    if (targetDayIndex === null || currentRouteItemIndex === null) return;

    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline[currentRouteItemIndex];

    if (!item.expenses) item.expenses = [];
    item.expenses.push({
        description: desc,
        amount: Number(cost)
    });

    // 쇼핑 리스트에서 선택한 항목이 있으면 체크 처리 및 장소 정보 추가
    if (window.selectedShoppingItemIndex !== null && travelData.shoppingList && travelData.shoppingList[window.selectedShoppingItemIndex]) {
        const shoppingItem = travelData.shoppingList[window.selectedShoppingItemIndex];
        shoppingItem.checked = true;

        // 장소 정보가 없으면 현재 이동수단 정보 추가
        if (!shoppingItem.location && item.title) {
            // 이동수단의 경우 출발지->도착지 형식으로 저장
            const prevItem = currentRouteItemIndex > 0 ? timeline[currentRouteItemIndex - 1] : null;
            const nextItem = currentRouteItemIndex < timeline.length - 1 ? timeline[currentRouteItemIndex + 1] : null;
            const from = prevItem && !prevItem.isTransit ? prevItem.title : '출발지';
            const to = nextItem && !nextItem.isTransit ? nextItem.title : '도착지';

            shoppingItem.location = `${from}→${to}`;
            shoppingItem.locationDetail = item.title; // 이동수단 종류
        }

        // 현재 장소를 저장하여 하이라이트 효과에 사용
        if (item.title) {
            const prevItem = currentRouteItemIndex > 0 ? timeline[currentRouteItemIndex - 1] : null;
            const nextItem = currentRouteItemIndex < timeline.length - 1 ? timeline[currentRouteItemIndex + 1] : null;
            const from = prevItem && !prevItem.isTransit ? prevItem.title : '출발지';
            const to = nextItem && !nextItem.isTransit ? nextItem.title : '도착지';
            window.lastExpenseLocation = `${from}→${to}`;
        }

        window.selectedShoppingItemIndex = null; // 초기화
        if (typeof renderLists === 'function') {
            renderLists(); // 쇼핑 리스트 UI 업데이트
        }
    }

    document.getElementById('expense-modal').classList.add('hidden');
    updateTotalBudget();

    // 예산 카드 업데이트
    const budgetEl = document.getElementById('budget-amount');
    if (budgetEl) {
        budgetEl.textContent = travelData.meta.budget || '₩0';
    }

    renderItinerary();
    autoSave();

    // 모달 재렌더링
    viewRouteDetail(currentRouteItemIndex, targetDayIndex);
};

window.deleteRouteExpense = function (expIdx) {
    if (targetDayIndex === null || currentRouteItemIndex === null) return;
    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline[currentRouteItemIndex];
    if (item && item.expenses) {
        item.expenses.splice(expIdx, 1);
        updateTotalBudget();
        renderItinerary();
        autoSave();
        // 모달 재렌더링
        viewRouteDetail(currentRouteItemIndex, targetDayIndex);
    }
};

// 경로 첨부파일 관련 함수들
window.handleRouteAttachmentUpload = async function (input) {
    if (!input.files || !input.files[0]) return;
    if (targetDayIndex === null) return;

    const file = input.files[0];
    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline.find(i => i.isTransit && i.isCollapsed);

    if (!item) return;

    try {
        const url = await uploadFile(file, `attachments/${currentUser.uid}/${Date.now()}_${file.name}`);
        if (!item.attachments) item.attachments = [];
        item.attachments.push({
            name: file.name,
            url: url,
            type: file.type
        });
        autoSave();

        // 모달 재렌더링
        const index = timeline.indexOf(item);
        viewRouteDetail(index, targetDayIndex);
    } catch (error) {
        console.error('Error uploading attachment:', error);
        alert('파일 업로드 중 오류가 발생했습니다.');
    }

    input.value = '';
};

window.deleteRouteAttachment = function (attIdx) {
    if (targetDayIndex === null) return;
    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline.find(i => i.isTransit && i.isCollapsed);
    if (item && item.attachments) {
        item.attachments.splice(attIdx, 1);
        autoSave();
        // 모달 재렌더링
        const index = timeline.indexOf(item);
        viewRouteDetail(index, targetDayIndex);
    }
};

// 경로 아이템 저장 함수
window.saveRouteItem = function () {
    if (currentRouteItemIndex === null || targetDayIndex === null) return;

    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline[currentRouteItemIndex];

    if (!item || !item.isTransit) return;

    const isAirplane = item.transitType === 'airplane';

    if (isAirplane) {
        // 비행기 정보 저장
        const departure = document.getElementById('route-edit-departure')?.value || '';
        const arrival = document.getElementById('route-edit-arrival')?.value || '';
        const departureTime = document.getElementById('route-edit-departure-time')?.value || '';
        const arrivalTime = document.getElementById('route-edit-arrival-time')?.value || '';
        const duration = document.getElementById('route-edit-duration')?.value || '30분';
        const flightNumber = document.getElementById('route-edit-flight-number')?.value || '';
        const bookingRef = document.getElementById('route-edit-booking-ref')?.value || '';
        const terminal = document.getElementById('route-edit-terminal')?.value || '';
        const gate = document.getElementById('route-edit-gate')?.value || '';

        item.title = `${departure} → ${arrival}`;
        item.time = departureTime;
        item.duration = duration;
        item.flightInfo = {
            departure,
            arrival,
            departureTime,
            arrivalTime,
            duration,
            flightNumber,
            bookingRef,
            terminal,
            gate
        };
    } else {
        // 일반 이동수단 정보 저장
        const title = document.getElementById('route-edit-title')?.value || '';
        const duration = document.getElementById('route-edit-duration')?.value || '30분';

        item.title = title;
        item.duration = duration;
        item.time = duration; // 타임라인 카드에 소요시간 표시
    }

    // 편집 모드 해제하고 view 모드로 다시 열기
    window.isRouteEditMode = false;
    autoSave();
    renderItinerary();
    viewRouteDetail(currentRouteItemIndex, targetDayIndex, false);
};

// 소요시간 설정 함수
window.setTransitDuration = function (duration) {
    const durationInput = document.getElementById('route-edit-duration');
    if (durationInput) {
        durationInput.value = duration;
    }
};

// 공항 자동완성을 위한 전역 상태
window.airportSuggestionState = {
    departure: { results: [], selectedIndex: 0 },
    arrival: { results: [], selectedIndex: 0 }
};

// 공항 자동완성 필터링
window.filterAirports = function (type, query) {
    const results = searchAirports(query);
    const suggestionsDiv = document.getElementById(`airport-suggestions-${type}`);

    if (!suggestionsDiv) return;

    if (results.length === 0 || !query) {
        suggestionsDiv.classList.add('hidden');
        window.airportSuggestionState[type].results = [];
        window.airportSuggestionState[type].selectedIndex = 0;
        return;
    }

    // 결과 저장
    window.airportSuggestionState[type].results = results.slice(0, 10);
    window.airportSuggestionState[type].selectedIndex = 0;

    renderAirportSuggestions(type);
    suggestionsDiv.classList.remove('hidden');
};

// 공항 자동완성 렌더링
function renderAirportSuggestions(type) {
    const suggestionsDiv = document.getElementById(`airport-suggestions-${type}`);
    const state = window.airportSuggestionState[type];

    if (!suggestionsDiv || !state.results.length) return;

    suggestionsDiv.innerHTML = state.results.map((airport, idx) => {
        const isSelected = idx === state.selectedIndex;
        return `
            <div class="px-3 py-2 cursor-pointer text-sm ${isSelected ? 'bg-primary/20 dark:bg-primary/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}" 
                onclick="event.stopPropagation(); selectAirport('${type}', '${airport.code}', '${airport.name}')">
                <span class="font-bold">${airport.code}</span> | ${airport.name}
                <span class="text-xs text-gray-500 ml-2">${airport.city}</span>
            </div>
        `;
    }).join('');
}

// 공항 자동완성 표시
window.showAirportSuggestions = function (type) {
    const input = document.getElementById(`route-edit-${type}`);
    if (input && input.value) {
        filterAirports(type, input.value);
    }
};

// 공항 입력 키보드 이벤트 처리
window.handleAirportKeydown = function (event, type) {
    const suggestionsDiv = document.getElementById(`airport-suggestions-${type}`);
    const state = window.airportSuggestionState[type];

    if (!suggestionsDiv || suggestionsDiv.classList.contains('hidden') || !state.results.length) {
        return;
    }

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            state.selectedIndex = Math.min(state.selectedIndex + 1, state.results.length - 1);
            renderAirportSuggestions(type);
            break;

        case 'ArrowUp':
            event.preventDefault();
            state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
            renderAirportSuggestions(type);
            break;

        case 'Enter':
            event.preventDefault();
            const selected = state.results[state.selectedIndex];
            if (selected) {
                selectAirport(type, selected.code, selected.name);
            }
            break;

        case 'Escape':
            suggestionsDiv.classList.add('hidden');
            break;
    }
};

// 공항 선택
window.selectAirport = function (type, code, name) {
    const input = document.getElementById(`route-edit-${type}`);
    const suggestionsDiv = document.getElementById(`airport-suggestions-${type}`);

    if (input) {
        input.value = `${code} | ${name}`;
    }
    if (suggestionsDiv) {
        suggestionsDiv.classList.add('hidden');
    }
};

// 공항 자동완성 닫기
window.closeAirportSuggestions = function () {
    const departureSuggestions = document.getElementById('airport-suggestions-departure');
    const arrivalSuggestions = document.getElementById('airport-suggestions-arrival');

    if (departureSuggestions) departureSuggestions.classList.add('hidden');
    if (arrivalSuggestions) arrivalSuggestions.classList.add('hidden');
};

// 문서 클릭 시 자동완성 닫기
document.addEventListener('click', (e) => {
    const departureSuggestions = document.getElementById('airport-suggestions-departure');
    const arrivalSuggestions = document.getElementById('airport-suggestions-arrival');
    const departureInput = document.getElementById('route-edit-departure');
    const arrivalInput = document.getElementById('route-edit-arrival');

    if (departureSuggestions && !departureSuggestions.contains(e.target) && e.target !== departureInput) {
        departureSuggestions.classList.add('hidden');
    }
    if (arrivalSuggestions && !arrivalSuggestions.contains(e.target) && e.target !== arrivalInput) {
        arrivalSuggestions.classList.add('hidden');
    }
});

// 도착 시간 자동 계산 (출발시간 입력 시)
window.calculateArrivalTime = function () {
    const departureTime = document.getElementById('route-edit-departure-time')?.value;
    const duration = document.getElementById('route-edit-duration')?.value;
    const arrivalTimeInput = document.getElementById('route-edit-arrival-time');

    if (!departureTime || !duration || !arrivalTimeInput) return;

    // 소요시간 파싱 (예: "2시간 30분", "1시간", "30분")
    const hourMatch = duration.match(/(\d+)\s*시간/);
    const minuteMatch = duration.match(/(\d+)\s*분/);

    const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
    const minutes = minuteMatch ? parseInt(minuteMatch[1]) : 0;
    const totalMinutes = hours * 60 + minutes;

    // 출발시간 파싱
    const [depHour, depMin] = departureTime.split(':').map(Number);
    const depTotalMinutes = depHour * 60 + depMin;

    // 도착시간 계산
    const arrTotalMinutes = depTotalMinutes + totalMinutes;
    const arrHour = Math.floor(arrTotalMinutes / 60) % 24;
    const arrMin = arrTotalMinutes % 60;

    arrivalTimeInput.value = `${String(arrHour).padStart(2, '0')}:${String(arrMin).padStart(2, '0')}`;
};

// 소요시간 자동 계산 (도착시간 입력 시)
window.calculateFlightDuration = function () {
    const departureTime = document.getElementById('route-edit-departure-time')?.value;
    const arrivalTime = document.getElementById('route-edit-arrival-time')?.value;
    const durationInput = document.getElementById('route-edit-duration');

    if (!departureTime || !arrivalTime || !durationInput) return;

    const [depHour, depMin] = departureTime.split(':').map(Number);
    const [arrHour, arrMin] = arrivalTime.split(':').map(Number);

    let depTotalMinutes = depHour * 60 + depMin;
    let arrTotalMinutes = arrHour * 60 + arrMin;

    // 자정 넘는 경우 처리
    if (arrTotalMinutes < depTotalMinutes) {
        arrTotalMinutes += 24 * 60;
    }

    const durationMinutes = arrTotalMinutes - depTotalMinutes;
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    if (hours > 0 && minutes > 0) {
        durationInput.value = `${hours}시간 ${minutes}분`;
    } else if (hours > 0) {
        durationInput.value = `${hours}시간`;
    } else {
        durationInput.value = `${minutes}분`;
    }
};

// 경로 아이템 삭제 함수
window.closeHomeAddressRequiredModal = closeHomeAddressRequiredModal;
window.goToProfileSettings = goToProfileSettings;
window.viewRouteDetail = viewRouteDetail;
window.closeRouteDetailModal = closeRouteDetailModal;

// 좌표로 일본어 주소 가져오기
async function getJapaneseAddress(lat, lng) {
    try {
        const key = await getMapsApiKey();
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ja&key=${key}`);
        const data = await response.json();

        if (data.results && data.results[0]) {
            return data.results[0].formatted_address;
        }
        return null;
    } catch (error) {
        console.warn('Failed to fetch Japanese address:', error);
        return null;
    }
}

// Ekispert API를 사용한 일본 철도 경로 검색
async function getEkispertRoute(fromItem, toItem) {
    try {
        // 좌표 가져오기
        const fromLat = typeof fromItem.lat === 'function' ? fromItem.lat() : Number(fromItem.lat);
        const fromLng = typeof fromItem.lng === 'function' ? fromItem.lng() : Number(fromItem.lng);
        const toLat = typeof toItem.lat === 'function' ? toItem.lat() : Number(toItem.lat);
        const toLng = typeof toItem.lng === 'function' ? toItem.lng() : Number(toItem.lng);

        // 일본어 주소 가져오기 (없으면 실시간으로 Geocoding API 호출)
        let fromName = fromItem.locationJa;
        let toName = toItem.locationJa;

        // 일본어 주소가 없으면 좌표로 일본어 주소 가져오기
        if (!fromName && fromLat && fromLng) {
            fromName = await getJapaneseAddress(fromLat, fromLng);
            // 캐싱
            if (fromName) fromItem.locationJa = fromName;
        }

        if (!toName && toLat && toLng) {
            toName = await getJapaneseAddress(toLat, toLng);
            // 캐싱
            if (toName) toItem.locationJa = toName;
        }

        // 좌표 우선, 없으면 이름 사용
        let url;
        if (fromLat && fromLng && toLat && toLng) {
            url = `https://api-hkrwkegcrq-uc.a.run.app/ekispert-proxy?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}`;
        } else if (fromName && toName) {
            url = `https://api-hkrwkegcrq-uc.a.run.app/ekispert-proxy?fromName=${encodeURIComponent(fromName)}&toName=${encodeURIComponent(toName)}`;
        } else {
            console.warn('Missing both coordinates and names for Ekispert API');
            return null;
        }

        // Firebase Functions 프록시를 통해 Ekispert API 호출 (CORS 우회)
        const response = await fetch(url);
        if (!response.ok) {
            console.warn('Ekispert API request failed:', response.status);
            return null;
        }

        const data = await response.json();

        // API 응답 구조 확인
        if (!data.ResultSet || !data.ResultSet.Course || data.ResultSet.Course.length === 0) {
            console.warn('No route found from Ekispert API');
            return null;
        }

        // 첫 번째 경로 선택 (가장 빠른 경로)
        const course = data.ResultSet.Course[0];
        const route = course.Route;

        if (!route || !route.Line || !route.Point) {
            console.warn('Invalid route structure from Ekispert');
            return null;
        }

        // 경로를 한 장의 카드로 통합
        const lines = Array.isArray(route.Line) ? route.Line : [route.Line];
        const points = Array.isArray(route.Point) ? route.Point : [route.Point];

        // 경로 상세 정보 구성 (상세 모달용)
        const detailedSteps = [];
        const routeSteps = [];
        let currentPointIndex = 0;

        lines.forEach((line, idx) => {
            const lineType = line.Type;
            const lineName = line.Name || '';
            const timeOnBoard = parseInt(line.timeOnBoard) || 0;

            // 출발역 (일본어 → 한국어 번역)
            const fromStationJa = points[currentPointIndex]?.Station?.Name || '';
            const fromStation = translateStation(fromStationJa);

            if (lineType === 'walk') {
                // 도보
                const toStationJa = points[currentPointIndex + 1]?.Station?.Name || '';
                const toStation = translateStation(toStationJa);

                routeSteps.push(`🚶 도보 ${timeOnBoard}분`);
                detailedSteps.push({
                    title: `도보 이동`,
                    time: `${timeOnBoard}분`,
                    icon: 'directions_walk',
                    tag: '도보',
                    type: 'walk',
                    tagColor: 'green',
                    color: null,  // 도보는 색상 없음
                    textColor: null,
                    transitInfo: {
                        depStop: fromStation,
                        arrStop: toStation,
                        lineName: '도보',
                        duration: timeOnBoard
                    }
                });
            } else {
                // 전철/지하철/버스
                currentPointIndex++;
                const toStationJa = points[currentPointIndex]?.Station?.Name || '';
                const toStation = translateStation(toStationJa);
                const emoji = lineType === 'train' ? '🚇' : '🚌';

                // 노선 색상 정보 파싱
                let lineColor = null;
                let textColor = '#ffffff';
                if (line.Color) {
                    // Color 형식: "247000016" -> RGB
                    const colorStr = String(line.Color).padStart(9, '0');
                    const r = parseInt(colorStr.substring(0, 3));
                    const g = parseInt(colorStr.substring(3, 6));
                    const b = parseInt(colorStr.substring(6, 9));
                    lineColor = `rgb(${r}, ${g}, ${b})`;

                    // 밝기 계산하여 텍스트 색상 결정
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    textColor = brightness > 128 ? '#000000' : '#ffffff';
                } else if (line.text_color) {
                    textColor = line.text_color.startsWith('#') ? line.text_color : `#${line.text_color}`;
                }

                // 노선 기호와 이름 번역
                const lineSymbolJa = line.LineSymbol?.Name || '';
                const lineCode = line.LineSymbol?.code || '';
                const translatedLineName = translateLine(lineName);


                // 태그: 노선명 + 노선 기호 (예: "미도스지선 M")
                // code가 숫자면 Name 사용, 아니면 code 사용
                let tagText = translatedLineName;
                if (lineCode && /^[A-Z]+$/i.test(lineCode)) {
                    tagText += ` ${lineCode}`;
                } else if (lineSymbolJa && /^[A-Z]+$/i.test(lineSymbolJa)) {
                    // code가 숫자면 Name 사용 (예: code=226, Name=M)
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
                    color: lineColor,  // UI에서 인식하는 필드
                    textColor: textColor,  // 텍스트 색상
                    transitInfo: {
                        depStop: fromStation,
                        arrStop: toStation,
                        lineName: translatedLineName,
                        lineSymbol: lineSymbolJa,
                        lineCode: lineCode,
                        lineColor: lineColor,
                        duration: timeOnBoard,
                        stopCount: parseInt(line.stopStationCount) || 0
                    }
                });
            }
        });

        // 총 소요시간 (모든 구간의 timeOnBoard 합산 - 도보 포함)
        let totalMinutes = 0;
        lines.forEach((line) => {
            totalMinutes += parseInt(line.timeOnBoard) || 0;
        });
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const durationStr = hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;

        // 환승 횟수
        const transferCount = parseInt(route.transferCount) || 0;

        // 출발역과 도착역 (일본어 → 한국어 번역)
        const startStationJa = points[0]?.Station?.Name || fromItem.location || fromItem.title;
        const endStationJa = points[points.length - 1]?.Station?.Name || toItem.location || toItem.title;
        const startStation = translateStation(startStationJa);
        const endStation = translateStation(endStationJa);

        // 통합 카드 생성
        return [{
            time: durationStr,
            title: `${startStation} → ${endStation}`,
            location: '',
            icon: 'train',
            tag: '전철',
            tagColor: 'blue',
            isTransit: true,
            isCollapsed: true,  // ★ 상세 경로 펼침 가능하도록 설정
            image: null,
            note: `환승 ${transferCount}회\n\n${routeSteps.join('\n')}`,
            fixedDuration: true,
            transitInfo: {
                start: startStation,
                end: endStation,
                steps: routeSteps,
                transferCount: transferCount
            },
            detailedSteps: detailedSteps, // 상세 모달용
            expenses: [],  // 지출 내역
            attachments: []  // 첨부파일
        }];
    } catch (error) {
        console.error('[Ekispert] Error:', error);
        return null;
    }
}

// Expose functions to window
window.addTransitItem = addTransitItem;
window.openTransitInputModal = openTransitInputModal;
window.closeTransitInputModal = closeTransitInputModal;
window.saveTransitItem = saveTransitItem;
window.calculateTransitDuration = calculateTransitDuration;
window.fetchTransitTime = fetchTransitTime;
window.openTransitDetailModal = openTransitDetailModal;
window.closeTransitDetailModal = closeTransitDetailModal;
window.editCurrentTransitItem = editCurrentTransitItem;
window.deleteCurrentTransitItem = deleteCurrentTransitItem;
window.closeDeleteTransitModal = closeDeleteTransitModal;
window.confirmDeleteTransit = confirmDeleteTransit;
window.openFlightInputModal = openFlightInputModal;
window.closeFlightInputModal = closeFlightInputModal;
window.searchFlightNumber = searchFlightNumber;
window.saveFlightItem = saveFlightItem;
window.openGoogleMapsRouteFromPrev = openGoogleMapsRouteFromPrev;
window.addFastestTransitItem = addFastestTransitItem;
window.openRouteSelectionModal = openRouteSelectionModal;
window.closeRouteSelectionModal = closeRouteSelectionModal;
window.openRouteModal = openRouteModal;
window.closeRouteModal = closeRouteModal;
window.updateTransitArrivalTime = updateTransitArrivalTime;

// [Duplicate Removed] saveRouteExpense used to be here but was incomplete.
// Using the definition around line 2525 instread.
export function updateTransitArrivalTime() {
    const durationInput = document.getElementById('route-edit-duration');
    if (!durationInput) return;

    const durationStr = durationInput.value;
    const durationMins = parseDurationStr(durationStr);

    if (!durationMins || durationMins === 0) return;

    // 현재 편집 중인 아이템 가져오기
    const item = travelData.days[targetDayIndex].timeline[currentRouteItemIndex];
    if (!item || !item.transitInfo || !item.transitInfo.start) return;

    const startTime = item.transitInfo.start;
    const startMinutes = parseTimeStr(startTime);

    if (startMinutes === null) return;

    const endMinutes = startMinutes + durationMins;
    const endTime = minutesTo24Hour(endMinutes);

    // 도착 시간 표시 업데이트 (모달에 표시되는 부분이 있다면)
    const arrivalTimeDisplay = document.getElementById('route-arrival-time-display');
    if (arrivalTimeDisplay) {
        arrivalTimeDisplay.textContent = endTime;
    }
}
