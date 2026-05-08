/**
 * UtilityRenderers - 유틸리티 렌더링 함수들
 * 
 * Phase 3 렌더링 리팩토링 - 컴포넌트 분할
 * renderers.js에서 분리된 쇼핑리스트, 체크리스트, 첨부파일, 날씨 렌더링
 */

import { travelData, isReadOnlyMode } from '../state.js';
import { escapeHtml, sanitizeFileUrl, sanitizeImageUrl } from '../ui-utils.js';

/**
 * 쇼핑 리스트와 체크리스트 렌더링
 * 최근 활용 위치 강조, 최대 3개 아이템 표시
 */
export function renderLists() {
    const shoppingContainer = document.getElementById('shopping-list-container');
    const checkContainer = document.getElementById('checklist-container');
    const scrollPosition = window.scrollY || document.documentElement.scrollTop;
    const renderItem = (item, index, type, shouldSparkle = false) => `
        <div class="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 flex items-center gap-2 group hover:shadow-sm transition-shadow ${shouldSparkle ? 'sparkle-item' : ''}">
            <button data-action="toggle-check" data-type="${type}" data-index="${index}" class="flex-shrink-0 text-gray-400 hover:text-primary transition-colors ${isReadOnlyMode ? 'cursor-default pointer-events-none' : ''}">
                <span class="material-symbols-outlined text-xl">${item.checked ? 'check_box' : 'check_box_outline_blank'}</span>
            </button>
            <div class="flex-1 min-w-0">
                <span class="text-sm block ${item.checked ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}">${escapeHtml(item.text)}</span>
                ${item.location ? `<span class="text-xs text-gray-500 block truncate"><span class="material-symbols-outlined text-xs align-middle">location_on</span> ${escapeHtml(item.location)}</span>` : ''}
            </div>
            ${!isReadOnlyMode ? `<button data-action="delete-item" data-type="${type}" data-index="${index}" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>` : ''}
        </div>`;

    if (shoppingContainer) {
        if (travelData.shoppingList && travelData.shoppingList.length > 0) {
            const lastLocation = window.lastExpenseLocation;
            let listToRender = [...travelData.shoppingList];

            if (lastLocation) {
                listToRender.sort((a, b) => {
                    const aMatches = a.location === lastLocation;
                    const bMatches = b.location === lastLocation;
                    if (aMatches && !bMatches) return -1;
                    if (!aMatches && bMatches) return 1;
                    return 0;
                });
            }

            const totalCount = listToRender.length;
            const limitedList = listToRender.slice(0, 3);

            let listHtml = limitedList.map((item, i) => {
                const originalIndex = travelData.shoppingList.indexOf(item);
                const shouldSparkle = lastLocation && item.location === lastLocation;
                return renderItem(item, originalIndex, 'shopping', shouldSparkle);
            }).join('');

            if (totalCount > 3) {
                listHtml += `
                    <div data-action="open-shopping-list" class="text-center py-1 mt-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        <p class="text-[11px] font-bold text-primary flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-xs">more_horiz</span>
                            외 ${totalCount - 3}개 더 보기
                        </p>
                    </div>
                `;
            }

            shoppingContainer.innerHTML = listHtml;
            if (lastLocation) setTimeout(() => { window.lastExpenseLocation = null; }, 3000);
        } else {
            shoppingContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">리스트가 비어있습니다.</p>';
        }
    }

    if (checkContainer) {
        if (travelData.checklist && travelData.checklist.length > 0) {
            const totalCount = travelData.checklist.length;
            const limitedList = travelData.checklist.slice(0, 3);

            let listHtml = limitedList.map((item, i) => renderItem(item, i, 'check')).join('');

            if (totalCount > 3) {
                listHtml += `
                    <div data-action="open-checklist" class="text-center py-1 mt-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        <p class="text-[11px] font-bold text-primary flex items-center justify-center gap-1">
                            <span class="material-symbols-outlined text-xs">more_horiz</span>
                            외 ${totalCount - 3}개 더 보기
                        </p>
                    </div>
                `;
            }

            checkContainer.innerHTML = listHtml;
        } else {
            checkContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">리스트가 비어있습니다.</p>';
        }
    }

    requestAnimationFrame(() => { window.scrollTo(0, scrollPosition); });
}

/**
 * 타임라인 아이템 첨부파일 렌더링
 * 가로 스크롤 레이아웃, 이미지/파일 지원
 */
export function renderAttachments(item, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!item?.attachments || item.attachments.length === 0) {
        container.className = "text-xs text-gray-400 text-center py-2";
        container.innerHTML = '첨부된 파일이 없습니다.';
        return;
    }

    // [Layout] Match Memories: Horizontal Scroll
    const isScrollable = item.attachments.length > 0;
    container.className = isScrollable
        ? 'grid grid-rows-1 grid-flow-col gap-3 overflow-x-auto py-2 auto-cols-[9rem] scrollbar-hide'
        : 'flex flex-col gap-2';

    let html = '';
    item.attachments.forEach((att, index) => {
        const safeType = String(att?.type || '').trim().toLowerCase();
        const isImage = safeType.startsWith('image/');
        const bgClass = isImage ? '' : 'bg-gray-100 dark:bg-gray-700';
        const fileData = isImage
            ? sanitizeImageUrl(att?.url || att?.data, '')
            : sanitizeFileUrl(att?.url || att?.data, '');

        if (!fileData) {
            return;
        }

        const escapedFileData = escapeHtml(fileData);
        const content = isImage
            ? `<img src="${escapedFileData}" alt="${escapeHtml(att?.name || '첨부 이미지')}" class="w-full h-full object-cover transition-transform group-hover:scale-110" loading="eager" decoding="async" fetchpriority="auto" onerror="this.remove();">`
            : `<div class="w-full h-full flex flex-col items-center justify-center text-gray-500"><span class="material-symbols-outlined text-3xl mb-1">picture_as_pdf</span><span class="text-[10px] px-2 truncate w-full text-center">${escapeHtml(att?.name || '')}</span></div>`;

        html += `
            <div class="relative group aspect-square w-36 h-36 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 isolate shrink-0 ${bgClass}">
                ${content}
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10 rounded-xl">
                    <button data-action="open-attachment" data-url="${escapedFileData}" data-type="${escapeHtml(safeType)}" class="text-white hover:text-primary p-2 bg-black/20 rounded-full backdrop-blur-sm transition-colors" title="열기">
                        <span class="material-symbols-outlined text-xl">visibility</span>
                    </button>
                    ${!isReadOnlyMode ? `<button data-action="delete-attachment" data-index="${index}" data-container="${containerId}" class="text-white hover:text-red-500 p-2 bg-black/20 rounded-full backdrop-blur-sm transition-colors" title="삭제">
                        <span class="material-symbols-outlined text-xl">delete</span>
                    </button>` : ''}
                </div>
            </div>
        `;
    });
    container.innerHTML = html || '첨부된 파일이 없습니다.';
}

/**
 * 주간 날씨 렌더링
 * 여행 기간 강조, 좌우 네비게이션
 */
export function renderWeeklyWeather(weeklyWeatherData, currentWeatherWeekStart, selectedWeatherDate) {
    const container = document.getElementById('weekly-weather-container');
    if (!container || !weeklyWeatherData) return;
    const weekStartDate = new Date(currentWeatherWeekStart);
    const yearMonth = `${weekStartDate.getFullYear()}년 ${weekStartDate.getMonth() + 1}월`;
    let html = `
        <div class="weather-weekly-header flex items-center justify-between mb-6">
            <button data-action="prev-weather" class="weather-week-nav p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <h3 class="weather-weekly-title text-lg font-bold text-text-main dark:text-white">${yearMonth}</h3>
            <button data-action="next-weather" class="weather-week-nav p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <span class="material-symbols-outlined">chevron_right</span>
            </button>
        </div>
        <div class="weather-week-grid grid grid-cols-7 gap-2">
    `;
    const tripDates = new Set(); if (travelData.days) travelData.days.forEach(day => tripDates.add(day.date));
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeatherWeekStart); date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = dayNames[date.getDay()];
        const dayData = weeklyWeatherData.find(d => d.date === dateStr);
        const isTripDay = tripDates.has(dateStr);
        const isSelected = dateStr === selectedWeatherDate;
        const isAvailable = dayData && dayData.available;
        const cardClass = isSelected ? 'bg-primary text-white' : (isTripDay ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-primary' : 'bg-card-light dark:bg-card-dark border border-gray-200 dark:border-gray-700');
        const textClass = isSelected ? 'text-white' : (isAvailable ? 'text-text-main dark:text-white' : 'text-gray-400');
        const weatherStateClass = [
            'weather-day-card',
            isSelected ? 'weather-day-card-selected' : '',
            isTripDay ? 'weather-day-card-trip' : '',
            !isAvailable ? 'weather-day-card-disabled' : ''
        ].filter(Boolean).join(' ');
        html += `
            <button data-action="select-weather" data-date="${dateStr}" class="${weatherStateClass} ${cardClass} p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all ${!isAvailable ? 'opacity-50' : ''}">
                <p class="weather-day-name text-xs ${textClass} mb-1">${dayName}</p>
                <p class="weather-day-date text-sm font-bold ${textClass} mb-2">${date.getDate()}</p>
                ${isAvailable && dayData ? `
                    <span class="weather-day-icon material-symbols-outlined text-xl ${isSelected ? 'text-white' : 'text-primary'}">${dayData.icon}</span>
                    <p class="weather-day-temp weather-day-temp-max text-xs ${textClass} mt-1">${dayData.maxTemp}°</p>
                    <p class="weather-day-temp weather-day-temp-min text-xs ${textClass}">${dayData.minTemp}°</p>
                ` : `
                    <span class="weather-day-icon material-symbols-outlined text-xl text-gray-400">help</span>
                    <p class="weather-day-temp text-xs text-gray-400 mt-1">--</p>
                `}
            </button>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
}

export default { renderLists, renderAttachments, renderWeeklyWeather };
