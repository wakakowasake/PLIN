import { travelData, currentDayIndex, isEditing } from '../state.js';
import { calculateEndTime, formatTime } from './time-helpers.js';

function safeGet(id) { return document.getElementById(id); }

// [Helper] 여행 완료 여부 확인
function isTripCompleted() {
    if (!travelData || !travelData.days || travelData.days.length === 0) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastDayStr = travelData.days[travelData.days.length - 1].date;
    if (!lastDayStr) return false;
    const lastDay = new Date(lastDayStr);
    lastDay.setHours(0, 0, 0, 0);
    return today > lastDay;
}

// [Helper] 추억(사진) 렌더링 HTML 생성
function renderMemoriesHtml(item, dayIndex, itemIndex) {
    if (!item.memories || item.memories.length === 0) return '';

    let html = '<div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-2 overflow-x-auto pb-1 no-scrollbar">';
    item.memories.forEach((mem, memIdx) => {
        // [Fix] 사진이 있는 경우와 없는 경우(코멘트만) 구분
        const content = mem.photoUrl
            ? `<img src="${mem.photoUrl}" class="w-full h-full object-cover transition-transform group-hover:scale-110" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=\\'material-symbols-outlined text-red-400\\'>broken_image</span>'">`
            : `<div class="w-full h-full flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/20"><span class="material-symbols-outlined text-yellow-600 dark:text-yellow-400">chat</span></div>`;

        html += `
            <div class="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden cursor-pointer group border border-gray-200 dark:border-gray-700" onclick="event.stopPropagation(); window.openLightbox(${dayIndex}, ${itemIndex}, ${memIdx})">
                ${content}
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// Helper builders for timeline item variants to improve readability
function buildImageCard(item, editClass, clickHandler, index, dayIndex) {
    const isCompleted = isTripCompleted();
    const isMemoryLocked = travelData.meta?.memoryLocked || false;
    const showMemoryBtn = isCompleted && !isMemoryLocked && !isEditing;

    return `
            <div class="bg-card-light dark:bg-card-dark rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 ${editClass}" ${clickHandler}>
                <div class="h-32 w-full bg-cover bg-center relative" style="background-image: url('${item.image}');">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <div class="absolute bottom-3 left-4 right-4 text-white">
                        <h3 class="text-lg font-bold truncate">${item.title}</h3>
                        <div class="flex items-center gap-1 text-xs opacity-90">
                            <span class="material-symbols-outlined text-[14px] flex-shrink-0">location_on</span>
                            <span class="truncate flex-1">${item.location}</span>
                        </div>
                    </div>
                    ${showMemoryBtn ? `<button type="button" onclick="event.stopPropagation(); addMemoryItem(${index}, ${dayIndex})" class="absolute top-2 right-2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full backdrop-blur-sm transition-colors z-10">
                        <span class="material-symbols-outlined text-2xl">photo_camera</span>
                    </button>` : ''}
                </div>
                <div class="p-3 md:p-4">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded text-sm font-medium text-text-main dark:text-gray-300">
                            <span class="material-symbols-outlined text-[18px]">schedule</span>
                            ${item.time}
                        </div>
                    </div>
                    ${renderMemoriesHtml(item, dayIndex, index)}
                </div>
            </div>`;
}

function buildMemoCard(item, index, dayIndex, editClass) {
    const isCompleted = isTripCompleted();
    const isMemoryLocked = travelData.meta?.memoryLocked || false;
    const showMemoryBtn = isCompleted && !isMemoryLocked && !isEditing;

    return `
            <div class="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/30 rounded-lg p-3 ${editClass}" onclick="viewTimelineItem(${index}, ${dayIndex})">
                <div class="flex items-center gap-3 justify-between">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-800 dark:text-gray-200 break-words whitespace-pre-wrap leading-relaxed font-body">${item.title}</p>
                    </div>
                    <div class="flex items-center gap-1">
                        ${showMemoryBtn ? `<button type="button" onclick="event.stopPropagation(); addMemoryItem(${index}, ${dayIndex})" class="text-yellow-600/70 hover:text-yellow-800 dark:text-yellow-500 dark:hover:text-yellow-300 p-2 rounded-full flex-shrink-0"><span class="material-symbols-outlined text-2xl">photo_camera</span></button>` : ''}
                        ${isEditing ? `<button type="button" onclick="event.stopPropagation(); deleteTimelineItem(${index}, ${dayIndex})" class="text-red-500 hover:bg-red-50 p-2 rounded-full flex-shrink-0"><span class="material-symbols-outlined text-lg">delete</span></button>` : ''}
                    </div>
                </div>
                ${renderMemoriesHtml(item, dayIndex, index)}
            </div>`;
}

function buildTransitCard(item, index, dayIndex, editClass) {
    const isCompleted = isTripCompleted();
    const isMemoryLocked = travelData.meta?.memoryLocked || false;
    const showMemoryBtn = isCompleted && !isMemoryLocked && !isEditing;

    let contentHtml;

    // Google Maps 경로 등: item.title에 이미 완성된 HTML 태그가 포함된 경우
    if (item.title && item.title.includes('<span')) {
        contentHtml = item.title;
    } else {
        // Ekispert 또는 수동 추가 경로: 태그를 생성하고 제목을 텍스트로 추가
        let tagsHtml = '';
        let hasDetailedTransit = false;
        if (item.detailedSteps && item.detailedSteps.length > 0) {
            const transitSteps = item.detailedSteps.filter(s => s.type !== 'walk' && s.tag);
            if (transitSteps.length > 0) {
                hasDetailedTransit = true;
                tagsHtml = transitSteps.map(s => {
                    const style = s.color ? `style="background-color: ${s.color}; color: ${s.textColor || '#ffffff'};"` : '';
                    const cls = s.color ? 'border border-transparent' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
                    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold shadow-sm whitespace-nowrap ${cls}" ${style}>${s.tag}</span>`;
                }).join('<span class="material-symbols-outlined text-gray-400 text-sm mx-1">arrow_forward</span>');
            }
        } else if (item.tag) { // 상세 경로는 없지만 태그는 있는 경우
            tagsHtml = `<div class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold shadow-sm bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                            <span class="material-symbols-outlined text-sm">${item.icon}</span>
                            <span>${item.tag}</span>
                        </div>`;
        }

        // 상세 경로가 있는 경우(태그가 여러 개일 수 있음)에는 제목(역 정보/중복 노선명)을 숨기고 태그만 표시
        const showTitle = !hasDetailedTransit;
        const titleText = (showTitle && item.title) ? `<p class="text-sm font-bold text-text-main dark:text-white truncate ml-2">${item.title}</p>` : '';
        contentHtml = `${tagsHtml} ${titleText}`;
    }

    return `
            <div class="bg-blue-50/50 dark:bg-card-dark/40 border border-blue-100 dark:border-gray-800 rounded-lg p-3 flex flex-col gap-2 ${editClass}" onclick="viewRouteDetail(${index}, ${dayIndex})">
                <div class="flex items-center gap-2 md:gap-4 justify-between">
                    <div class="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                        <div class="flex flex-col items-center justify-center bg-white dark:bg-card-dark rounded px-2 md:px-3 py-1 shadow-sm text-xs font-bold text-gray-900 dark:text-white min-w-[60px] md:min-w-[70px] flex-shrink-0 whitespace-nowrap">
                            <span>${item.duration || item.time || '30분'}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                            ${contentHtml}
                        </div>
                    </div>
                    ${showMemoryBtn ? `<button type="button" onclick="event.stopPropagation(); addMemoryItem(${index}, ${dayIndex})" class="text-gray-400 hover:text-primary p-2 rounded-full flex-shrink-0"><span class="material-symbols-outlined text-2xl">photo_camera</span></button>` : ''}
                </div>
                ${item.transitInfo?.summary ? `<p class="text-xs text-text-muted dark:text-gray-400 pl-[76px] md:pl-[86px]">${item.transitInfo.summary}</p>` : ''}
                ${renderMemoriesHtml(item, dayIndex, index)}
            </div>`;
}

function buildDefaultCard(item, index, dayIndex, editClass, clickHandler) {
    const isCompleted = isTripCompleted();
    const isMemoryLocked = travelData.meta?.memoryLocked || false;
    const showMemoryBtn = isCompleted && !isMemoryLocked && !isEditing;

    return `
            <div class="bg-card-light dark:bg-card-dark rounded-xl p-3 md:p-5 shadow-sm border border-gray-100 dark:border-gray-800 ${editClass}" ${clickHandler}>
                <div class="flex justify-between items-start mb-2 gap-2">
                    <div class="flex-1 min-w-0">
                        <h3 class="text-lg font-bold text-text-main dark:text-white break-words">${item.title}</h3>
                        <p class="text-sm text-text-muted dark:text-gray-400 flex items-center gap-1 mt-1 min-w-0">
                            <span class="material-symbols-outlined text-[16px] flex-shrink-0">location_on</span>
                            <span class="truncate flex-1">${item.location || ''}</span>
                        </p>
                    </div>
                    ${item.tag ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 flex-shrink-0 whitespace-nowrap">${item.tag}</span>` : ''}
                    ${showMemoryBtn ? `<button type="button" onclick="event.stopPropagation(); addMemoryItem(${index}, ${dayIndex})" class="text-gray-400 hover:text-primary p-2 rounded-full flex-shrink-0"><span class="material-symbols-outlined text-2xl">photo_camera</span></button>` : ''}
                    ${isEditing ? `<button type="button" onclick="event.stopPropagation(); deleteTimelineItem(${index}, ${dayIndex})" class="text-red-500 hover:bg-red-50 p-1 rounded flex-shrink-0"><span class="material-symbols-outlined text-lg">delete</span></button>` : ''}
                </div>
                <div class="flex items-center gap-2 text-sm font-medium text-text-main dark:text-gray-300 flex-wrap">
                    <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded flex-shrink-0">
                        <span class="material-symbols-outlined text-[18px]">schedule</span>
                        ${item.time || ''}
                    </div>
                    ${item.duration !== undefined && item.duration !== null ? `
                    <div class="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded text-xs font-bold flex-shrink-0">
                        <span class="material-symbols-outlined text-[14px]">timer</span>
                        ${item.duration}분
                    </div>` : ''}
                    ${item.note ? `
                    <div class="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                        <span class="material-symbols-outlined text-[14px] flex-shrink-0">info</span>
                        <span class="truncate">${item.note}</span>
                    </div>` : ''}
                </div>
                ${renderMemoriesHtml(item, dayIndex, index)}
            </div>`;
}
export function renderTimelineItemHtml(item, index, dayIndex, isLast, isFirst) {
    // Simplified extraction of the original HTML generation from ui.js
    const lineStyle = isLast ? `bg-gradient-to-b from-gray-200 to-transparent dark:from-gray-700` : `bg-gray-200 dark:bg-gray-700`;
    const linePosition = isFirst ? 'top-6 -bottom-8' : 'top-0 -bottom-8';
    let iconBg = 'bg-white dark:bg-card-dark'; // 장소와 교통 수단 아이콘 배경색 통일
    let iconColor = 'text-primary'; // 모든 아이콘 색상 통일
    let iconStyle = '';
    if (item.tag === '메모') {
        iconBg = 'bg-yellow-50 dark:bg-yellow-900/20';
        iconColor = 'text-yellow-600 dark:text-yellow-400';
    } else if (item.color) {
        iconBg = '';
        iconColor = '';
        const fgColor = item.textColor || '#ffffff';
        iconStyle = `background-color: ${item.color}; color: ${fgColor}; border-color: ${item.color};`;
    }

    const editClass = isEditing ? "edit-mode-active ring-2 ring-primary/50 ring-offset-2" : "cursor-pointer hover:shadow-lg transform transition-all hover:-translate-y-1";
    const clickHandler = isEditing ? `onclick="editTimelineItem(${index}, ${dayIndex})"` : `onclick="viewTimelineItem(${index}, ${dayIndex})"`;
    const contextHandler = `oncontextmenu="openContextMenu(event, 'item', ${index}, ${dayIndex})"`;
    const isMemoryLocked = travelData.meta?.memoryLocked || false;
    const draggableAttr = isMemoryLocked ? 'draggable="false"' : `draggable="true" ondragstart="dragStart(event, ${index}, ${dayIndex})" ondragend="dragEnd(event)" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="drop(event, ${index})" data-drop-index="${index}"`;
    const zIndex = 100 - index;

    let html = `
        <div ${draggableAttr} ontouchstart="touchStart(event, ${index}, 'item')" ontouchmove="touchMove(event)" ontouchend="touchEnd(event)" data-index="${index}" style="z-index: ${zIndex};" class="relative grid grid-cols-[auto_1fr] gap-x-3 md:gap-x-6 group/timeline-item pb-8 timeline-item-transition rounded-xl" ${contextHandler}>
        <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-50 shadow-sm pointer-events-none"></div>

        <div class="relative flex flex-col items-center" data-timeline-icon="true">
            <div class="absolute ${linePosition} w-0.5 ${lineStyle} timeline-vertical-line"></div>
            <div class="w-10 h-10 rounded-full ${iconBg} border-2 border-primary/30 flex items-center justify-center z-10 shadow-sm relative shrink-0 mt-1" style="${iconStyle}">
                <span class="material-symbols-outlined ${iconColor} text-xl" style="${item.color ? 'color: inherit' : ''}">${item.icon}</span>
            </div>
            ${!isMemoryLocked ? `<div class="absolute -bottom-8 left-1/2 -translate-x-1/2 z-20 add-item-btn-container transition-opacity duration-200">
                <button type="button" onclick="openAddModal(${index}, ${dayIndex})" class="w-8 h-8 rounded-full bg-white dark:bg-card-dark border border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary transition-colors shadow-sm cursor-pointer transform hover:scale-110" title="일정 추가">
                    <span class="material-symbols-outlined text-lg">add</span>
                </button>
            </div>` : ''}
        </div>
        <div class="pb-2 pt-1 flex flex-col justify-center min-w-0">
    `;

    // Content variants (delegated to builder helpers)
    if (item.image) {
        html += buildImageCard(item, editClass, clickHandler, index, dayIndex);
    } else if (item.tag === '메모') {
        html += buildMemoCard(item, index, dayIndex, editClass);
    } else if (item.isTransit) {
        html += buildTransitCard(item, index, dayIndex, editClass);
    } else {
        html += buildDefaultCard(item, index, dayIndex, editClass, clickHandler);
    }

    html += `</div></div>`;
    return html;
}

/**
 * 플래너 모드 타임라인 아이템 렌더링
 * 왼쪽에 시간 레이블, 오른쪽에 카드 내용
 */
export function renderTimelineItemHtmlPlanner(item, index, dayIndex, isLast, isFirst) {
    const isMemoryLocked = travelData.meta?.memoryLocked || false;
    const editClass = isEditing ? "edit-mode-active ring-2 ring-primary/50 ring-offset-2" : "cursor-pointer hover:shadow-md transform transition-all hover:-translate-y-0.5";
    const clickHandler = isEditing ? `onclick="editTimelineItem(${index}, ${dayIndex})"` : `onclick="viewTimelineItem(${index}, ${dayIndex})"`;
    const contextHandler = `oncontextmenu="openContextMenu(event, 'item', ${index}, ${dayIndex})"`;
    const draggableAttr = isMemoryLocked ? 'draggable="false"' : `draggable="true" ondragstart="dragStart(event, ${index}, ${dayIndex})" ondragend="dragEnd(event)" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="drop(event, ${index})" data-drop-index="${index}"`;

    // 시간 정보 파싱
    let startTime = '--:--';
    let endTime = '--:--';

    if (item.time) {
        // "오전 09:00", "09:00 - 10:30", "09:00" 등 다양한 형식 처리
        const timeStr = item.time.replace(/오전|오후|AM|PM/gi, '').trim();
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);

        if (timeMatch) {
            startTime = formatTime(`${timeMatch[1]}:${timeMatch[2]}`);

            // duration이 있으면 종료 시간 계산
            if (item.duration) {
                endTime = calculateEndTime(startTime, item.duration);
            } else {
                // duration이 없으면 기본 30분
                endTime = calculateEndTime(startTime, 30);
            }
        }
    }

    // 세로선 스타일 (간단 모드와 동일)
    const lineStyle = isLast ? `bg-gradient-to-b from-gray-200 to-transparent dark:from-gray-700` : `bg-gray-200 dark:bg-gray-700`;
    const linePosition = isFirst ? 'top-6 -bottom-8' : 'top-0 -bottom-8';
    const zIndex = 100 - index;

    let html = `
        <div ${draggableAttr} ontouchstart="touchStart(event, ${index}, 'item')" ontouchmove="touchMove(event)" ontouchend="touchEnd(event)" data-index="${index}" style="z-index: ${zIndex};" 
            class="relative grid grid-cols-[auto_1fr] gap-x-3 md:gap-x-6 group/timeline-item timeline-item-transition rounded-xl" ${contextHandler}>
            <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-50 shadow-sm pointer-events-none"></div>
            
            <!-- 시간 카드 (기존 아이콘 위치) -->
            <div class="relative flex flex-col" data-timeline-icon="true">
                <div class="relative z-10 h-full flex flex-col items-center justify-between bg-white dark:bg-card-dark border-2 border-primary/30 rounded-xl px-3 py-3 shadow-sm min-w-[70px] mt-1">
                    <div class="font-bold text-primary text-sm planner-time-label leading-tight">${startTime}</div>
                    <div class="text-xs text-primary/50">↓</div>
                    <div class="font-bold text-primary text-sm planner-time-label leading-tight">${endTime}</div>
                </div>
            </div>
            
            <!-- 카드 내용 -->
            <div class="pb-2 pt-1 flex flex-col justify-center min-w-0">
    `;

    // Content variants (Same as simple mode but without icon)
    if (item.image) {
        html += buildImageCard(item, editClass, clickHandler, index, dayIndex);
    } else if (item.tag === '메모') {
        html += buildMemoCard(item, index, dayIndex, editClass);
    } else if (item.isTransit) {
        html += buildTransitCard(item, index, dayIndex, editClass);
    } else {
        html += buildDefaultCard(item, index, dayIndex, editClass, clickHandler);
    }

    html += `
            </div>
        </div>
    `;


    // 플래너 모드에서 마지막 아이템이 아니면 플러스 버튼과 함께 구분선 추가
    if (!isLast && !isMemoryLocked) {
        html += `
            <div class="relative flex items-center gap-3 my-4">
                <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                <button type="button" onclick="openAddModal(${index}, ${dayIndex})" 
                    class="w-8 h-8 rounded-full bg-white dark:bg-card-dark border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:text-primary hover:border-primary transition-colors shadow-sm cursor-pointer transform hover:scale-110 z-10" 
                    title="일정 추가">
                    <span class="material-symbols-outlined text-lg">add</span>
                </button>
                <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
            </div>
        `;
    }

    return html;
}


export function renderItinerary() {
    // Reuse the big implementation from ui.js but keep external calls via window
    let dailyTotal = 0;
    const calcTimeline = (currentDayIndex === -1) ? [] : (travelData.days[currentDayIndex] ? travelData.days[currentDayIndex].timeline : []);
    if (currentDayIndex !== -1) {
        calcTimeline.forEach(item => { if (item.budget) dailyTotal += Number(item.budget); });
    }

    const cachedPhoto = localStorage.getItem('cachedUserPhotoURL');
    const userImg = cachedPhoto || travelData.meta?.userImage || "/images/basic-profile.png";
    const userAvatarEl = document.getElementById('user-avatar');
    if (userAvatarEl) userAvatarEl.style.backgroundImage = `url("${userImg}")`;

    const bgImg = travelData.meta?.mapImage || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop";
    const mapBg = document.getElementById('map-bg'); if (mapBg) mapBg.style.backgroundImage = `url("${bgImg}")`;
    const heroEl = document.getElementById('trip-hero'); if (heroEl) heroEl.style.backgroundImage = `url("${bgImg}")`;

    // 여행 제목과 날짜 정보 업데이트
    const titleEl = document.getElementById('trip-title');
    if (titleEl) titleEl.innerText = travelData.meta?.title || "제목 없음";

    const dateInfoEl = document.getElementById('trip-date-info');
    if (dateInfoEl) dateInfoEl.innerText = travelData.meta?.subInfo || "";

    // [Fix] 여행 기간(몇박 몇일) 정보 업데이트
    const dayCountEl = document.getElementById('trip-day-count');
    if (dayCountEl) dayCountEl.innerText = travelData.meta?.dayCount || "일정 미정";

    // Tabs and timeline
    const tabsEl = document.getElementById('day-tabs'); if (!tabsEl) return;
    let tabsHtml = '';
    if (!travelData.days) travelData.days = [];
    const isSingleDay = travelData.days.length === 1;
    const isAllActive = currentDayIndex === -1 || isSingleDay;
    const allActiveClass = isAllActive ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
    tabsHtml += `
        <button type="button" onclick="selectDay(-1)" class="flex flex-col items-center justify-center px-6 py-3 rounded-t-lg transition-colors ${allActiveClass}">
            <span class="text-xs font-semibold uppercase">전체</span>
        </button>`;

    if (!isSingleDay) {
        travelData.days.forEach((day, index) => {
            const isActive = index === currentDayIndex;
            const activeClass = isActive ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
            tabsHtml += `
            <button type="button" onclick="selectDay(${index})" class="flex flex-col items-center justify-center px-6 py-3 rounded-t-lg transition-colors ${activeClass}">
                <span class="text-xs font-semibold uppercase">${index + 1}일차</span>
            </button>`;
        });
    }
    tabsEl.innerHTML = tabsHtml;

    const listEl = document.getElementById('timeline-list'); if (!listEl) return;
    let html = '';
    if (currentDayIndex === -1 || isSingleDay) {
        travelData.days.forEach((day, dayIdx) => {
            const dayBadge = isSingleDay ? '' : `<div class="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-sm">${dayIdx + 1}일차</div>`;
            html += `
                <div class="mb-8">
                    <div class="flex items-center gap-4 mb-4 pl-2">
                        ${dayBadge}
                        <div class="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                        <button type="button" onclick="reorderTimeline(${dayIdx}, true)" class="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors flex items-center gap-1" title="시간순 재정렬">
                            <span class="material-symbols-outlined text-sm">sort</span>
                            <span class="hidden sm:inline">시간순 정렬</span>
                        </button>
                        <div class="text-xs text-gray-400">${day.date}</div>
                    </div>
                    <div class="flex flex-col">`;
            if (day.timeline && day.timeline.length > 0) {
                const isPlannerMode = travelData.meta?.viewMode === 'planner';
                const renderFunc = isPlannerMode ? renderTimelineItemHtmlPlanner : renderTimelineItemHtml;

                day.timeline.forEach((item, index) => {
                    const isLast = index === day.timeline.length - 1;
                    const isFirst = index === 0;
                    html += renderFunc(item, index, dayIdx, isLast, isFirst);
                });
            } else {
                html += `<div class="text-center py-4 text-gray-400 text-sm">일정이 없습니다.</div>`;
            }
            const isMemoryLocked = travelData.meta?.memoryLocked || false;
            if (!isMemoryLocked) {
                html += `
                    <div class="flex justify-center mt-2">
                        <button type="button" onclick="openAddModal(${day.timeline.length}, ${dayIdx})" class="text-xs text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">add</span> 일정 추가
                        </button>
                    </div>`;
            }
            html += `</div></div>`;
        });
    } else {
        const currentTimeline = travelData.days[currentDayIndex]?.timeline || [];
        const day = travelData.days[currentDayIndex];
        if (currentTimeline.length > 0 && day) {
            html += `
                <div class="mb-8">
                    <div class="flex items-center gap-4 mb-4 pl-2">
                        <div class="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-sm">${currentDayIndex + 1}일차</div>
                        <div class="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                        <button type="button" onclick="reorderTimeline(${currentDayIndex}, true)" class="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors flex items-center gap-1" title="시간순 재정렬">
                            <span class="material-symbols-outlined text-sm">sort</span>
                            <span class="hidden sm:inline">시간순 정렬</span>
                        </button>
                        <div class="text-xs text-gray-400">${day.date}</div>
                    </div>
                    <div class="flex flex-col">`;
        }
        const isPlannerMode = travelData.meta?.viewMode === 'planner';
        const renderFunc = isPlannerMode ? renderTimelineItemHtmlPlanner : renderTimelineItemHtml;

        currentTimeline.forEach((item, index) => {
            const isLast = index === currentTimeline.length - 1;
            const isFirst = index === 0;
            html += renderFunc(item, index, currentDayIndex, isLast, isFirst);
        });
        if (currentTimeline.length > 0) {
            html += `
                <div ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="timelineContainerDrop(event, ${currentDayIndex})" class="h-8 relative mx-6" style="z-index: 1;">
                    <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-50 shadow-sm pointer-events-none"></div>
                </div>`;
        }
        if (currentTimeline.length === 0) {
            html += `
            <div class="col-span-2 flex flex-col items-center justify-center py-10 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">edit_calendar</span>
                <p class="text-sm">아직 일정이 없습니다. 첫 일정을 추가해보세요!</p>
                <button type="button" onclick="openAddModal(-1, ${currentDayIndex})" class="mt-4 flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-bold shadow-lg hover:bg-orange-500 transition-colors transform hover:scale-105">
                    <span class="material-symbols-outlined">add</span> 일정 시작하기
                </button>
            </div>`;
        }
    }

    listEl.innerHTML = html;
    window.renderLists && window.renderLists();
    window.updateLocalTimeWidget && window.updateLocalTimeWidget();
}

export function renderLists() {
    const shoppingContainer = document.getElementById('shopping-list-container');
    const checkContainer = document.getElementById('checklist-container');
    const scrollPosition = window.scrollY || document.documentElement.scrollTop;
    const renderItem = (item, index, type, shouldSparkle = false) => `
        <div class="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 flex items-center gap-2 group hover:shadow-sm transition-shadow ${shouldSparkle ? 'sparkle-item' : ''}">
            <button onclick="toggleListCheck('${type}', ${index})" class="flex-shrink-0 text-gray-400 hover:text-primary transition-colors">
                <span class="material-symbols-outlined text-xl">${item.checked ? 'check_box' : 'check_box_outline_blank'}</span>
            </button>
            <div class="flex-1 min-w-0">
                <span class="text-sm block ${item.checked ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}">${item.text}</span>
                ${item.location ? `<span class="text-xs text-gray-500 block truncate"><span class="material-symbols-outlined text-xs align-middle">location_on</span> ${item.location}</span>` : ''}
            </div>
            <button onclick="deleteListItem('${type}', ${index})" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <span class="material-symbols-outlined text-lg">close</span>
            </button>
        </div>`;

    if (shoppingContainer) {
        if (travelData.shoppingList && travelData.shoppingList.length > 0) {
            const lastLocation = window.lastExpenseLocation;
            const sorted = [...travelData.shoppingList];
            if (lastLocation) {
                sorted.sort((a, b) => {
                    const aMatches = a.location === lastLocation;
                    const bMatches = b.location === lastLocation;
                    if (aMatches && !bMatches) return -1;
                    if (!aMatches && bMatches) return 1;
                    return 0;
                });
            }
            shoppingContainer.innerHTML = sorted.map((item, i) => {
                const originalIndex = travelData.shoppingList.indexOf(item);
                const shouldSparkle = lastLocation && item.location === lastLocation;
                return renderItem(item, originalIndex, 'shopping', shouldSparkle);
            }).join('');
            if (lastLocation) setTimeout(() => { window.lastExpenseLocation = null; }, 3000);
        } else {
            shoppingContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">리스트가 비어있습니다.</p>';
        }
    }

    if (checkContainer) {
        if (travelData.checklist && travelData.checklist.length > 0) checkContainer.innerHTML = travelData.checklist.map((item, i) => renderItem(item, i, 'check')).join('');
        else checkContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">리스트가 비어있습니다.</p>';
    }

    requestAnimationFrame(() => { window.scrollTo(0, scrollPosition); });
}

export function renderAttachments(item, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!item?.attachments || item.attachments.length === 0) {
        container.innerHTML = '<p class="col-span-full text-xs text-gray-400 text-center py-2">첨부된 파일이 없습니다.</p>';
        return;
    }
    let html = '';
    item.attachments.forEach((att, index) => {
        const isImage = att.type.startsWith('image/');
        const bgClass = isImage ? '' : 'bg-gray-100 dark:bg-gray-700';
        const fileData = att.url || att.data;
        const content = isImage ? `<div class="w-full h-full bg-cover bg-center" style="background-image: url('${fileData}')"></div>` : `<div class="w-full h-full flex flex-col items-center justify-center text-gray-500"><span class="material-symbols-outlined text-2xl mb-1">picture_as_pdf</span><span class="text-[10px] px-2 truncate w-full text-center">${att.name}</span></div>`;
        html += `
            <div class="relative group aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 ${bgClass}">
                ${content}
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button onclick="openAttachment('${fileData}', '${att.type}')" class="text-white hover:text-primary p-1" title="열기">
                        <span class="material-symbols-outlined">visibility</span>
                    </button>
                    <button onclick="deleteAttachment(${index}, '${containerId}')" class="text-white hover:text-red-500 p-1" title="삭제">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

export function renderWeeklyWeather(weeklyWeatherData, currentWeatherWeekStart, selectedWeatherDate) {
    const container = document.getElementById('weekly-weather-container');
    if (!container || !weeklyWeatherData) return;
    const weekStartDate = new Date(currentWeatherWeekStart);
    const yearMonth = `${weekStartDate.getFullYear()}년 ${weekStartDate.getMonth() + 1}월`;
    let html = `
        <div class="flex items-center justify-between mb-6">
            <button onclick="navigateWeatherWeek(-1)" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <h3 class="text-lg font-bold text-text-main dark:text-white">${yearMonth}</h3>
            <button onclick="navigateWeatherWeek(1)" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <span class="material-symbols-outlined">chevron_right</span>
            </button>
        </div>
        <div class="grid grid-cols-7 gap-2">
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
        html += `
            <button onclick="selectWeatherDate('${dateStr}')" class="${cardClass} p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all ${!isAvailable ? 'opacity-50' : ''}">
                <p class="text-xs ${textClass} mb-1">${dayName}</p>
                <p class="text-sm font-bold ${textClass} mb-2">${date.getDate()}</p>
                ${isAvailable && dayData ? `
                    <span class="material-symbols-outlined text-xl ${isSelected ? 'text-white' : 'text-primary'}">${dayData.icon}</span>
                    <p class="text-xs ${textClass} mt-1">${dayData.maxTemp}°</p>
                    <p class="text-xs ${textClass}">${dayData.minTemp}°</p>
                ` : `
                    <span class="material-symbols-outlined text-xl text-gray-400">help</span>
                    <p class="text-xs text-gray-400 mt-1">--</p>
                `}
            </button>
        `;
    }
    html += '</div>';
    container.innerHTML = html;
}

export default { renderItinerary, renderTimelineItemHtml, renderLists, renderAttachments, renderWeeklyWeather };
