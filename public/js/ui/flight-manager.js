import { formatDuration, parseTimeStr, minutesTo24Hour } from '../ui-utils.js';


// Module state
let flightInputIndex = null;
let isFlightEditing = false;

// Major airports data (for autocomplete)
export const majorAirports = [
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

/**
 * Open flight input modal
 * @param {number} index - Index to insert the flight item
 * @param {boolean} isEdit - Whether editing existing item
 * @param {Object} travelData - Travel data object
 * @param {number} targetDayIndex - Target day index
 */
export function openFlightInputModal(index, isEdit, travelData, targetDayIndex) {
    flightInputIndex = index;
    isFlightEditing = isEdit;

    // Get DOM elements
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

    // Reset form
    flightNumInput.value = "";
    pnrInput.value = "";
    depInput.value = "";
    arrInput.value = "";
    depTimeInput.value = "";
    arrTimeInput.value = "";
    terminalInput.value = "";
    gateInput.value = "";
    noteInput.value = "";

    // Populate airport autocomplete list (first time only)
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

        if (info.depTime) {
            const min = parseTimeStr(info.depTime);
            depTimeInput.value = min !== null ? minutesTo24Hour(min) : info.depTime;
        }
        if (info.arrTime) {
            const min = parseTimeStr(info.arrTime);
            arrTimeInput.value = min !== null ? minutesTo24Hour(min) : info.arrTime;
        }

        if (info.terminal) terminalInput.value = info.terminal;
        if (info.gate) gateInput.value = info.gate;
        if (info.userNote) noteInput.value = info.userNote;
    } else {
        modalTitle.innerText = "항공편 정보 입력";
        saveBtn.innerText = "추가";
    }

    // Enable Enter key to search
    flightNumInput.onkeydown = function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchFlightNumber();
        }
    };

    // Handle airport field autocomplete on Enter
    const handleAirportEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = e.target.value.trim();
            if (!val) return;

            // Find matching airport (by code or name)
            const match = majorAirports.find(ap =>
                ap.name.includes(val) ||
                ap.code.includes(val.toUpperCase())
            );

            if (match) {
                e.target.value = `${match.code} (${match.name})`;
                // Move focus to next field
                if (e.target.id === 'flight-dep-airport') {
                    arrInput.focus();
                }
            }
        }
    };

    depInput.onkeydown = handleAirportEnter;
    arrInput.onkeydown = handleAirportEnter;

    const modal = document.getElementById('flight-input-modal');
    if (modal) {
        modal.classList.remove('hidden');
        if (window.pushModalState) window.pushModalState();
    }
    setTimeout(() => flightNumInput.focus(), 100);
}

/**
 * Close flight input modal
 */
export function closeFlightInputModal() {
    document.getElementById('flight-input-modal').classList.add('hidden');
    flightInputIndex = null;
}

/**
 * Search flight number online
 */
import { showToast } from './modals.js';

/**
 * Search flight number online
 */
export function searchFlightNumber() {
    const flightNum = document.getElementById('flight-number').value.trim();
    if (!flightNum) {
        showToast("항공편명을 먼저 입력해주세요! (예: KE123) ✈️", 'warning');
        return;
    }
    window.open(`https://www.google.com/search?q=${encodeURIComponent(flightNum + " 항공편")}`, '_blank');
}

/**
 * Save flight item to timeline
 * @param {Object} travelData - Travel data object
 * @param {number} targetDayIndex - Target day index
 * @param {Function} reorderTimeline - Timeline reorder callback
 * @param {Function} openTransitDetailModal - Transit detail modal callback
 * @param {boolean} isEditingFromDetail - Whether editing from detail modal
 */
export function saveFlightItem(travelData, targetDayIndex, reorderTimeline, openTransitDetailModal, isEditingFromDetail) {
    const flightNum = document.getElementById('flight-number').value;
    const pnr = document.getElementById('flight-pnr').value;
    const depAirport = document.getElementById('flight-dep-airport').value;
    const arrAirport = document.getElementById('flight-arr-airport').value;
    const depTime = document.getElementById('flight-dep-time').value;
    const arrTime = document.getElementById('flight-arr-time').value;
    const terminal = document.getElementById('flight-terminal').value;
    const gate = document.getElementById('flight-gate').value;
    const userNote = document.getElementById('flight-note').value;

    // Calculate duration
    let durationStr = "2시간"; // default
    let diff = 120; // default 2 hours (minutes)
    if (depTime && arrTime) {
        const [h1, m1] = depTime.split(':').map(Number);
        const [h2, m2] = arrTime.split(':').map(Number);
        diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60; // assume next day arrival

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
        duration: diff, // 저장된 소요 시간 (분 단위)
        transitInfo: {
            terminal: terminal.toUpperCase(),
            gate: gate.toUpperCase(),
            flightNum: flightNum.toUpperCase(),
            pnr: pnr.toUpperCase(),
            depAirport: depAirport.toUpperCase(),
            arrAirport: arrAirport.toUpperCase(),
            start: depTime,
            end: arrTime,
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
}
