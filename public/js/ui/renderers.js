import morphdom from 'morphdom'; // [New] for optimized DOM updates
import { travelData, currentDayIndex, isEditing, isReadOnlyMode } from '../state.js';
import { Z_INDEX } from './constants.js';
import { calculateEndTime, formatTime } from './time-helpers.js';
import { formatDuration, escapeHtml } from '../ui-utils.js';

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

// [Helper] 추억(사진) 렌더링 HTML 생성 (카드 외부용, 테이프 & 회전 효과)
function renderMemoriesHtml(item, dayIndex, itemIndex) {
    if (!item.memories || item.memories.length === 0) return '';

    let html = '<div class="mt-4 flex gap-6 overflow-x-auto pb-4 no-scrollbar px-2" style="touch-action: pan-x;">';
    item.memories.forEach((mem, memIdx) => {
        // 비뚤비뚤한 효과를 위한 회전값 (인덱스에 따라 교차)
        const rotation = (memIdx % 2 === 0) ? 'rotate-1' : '-rotate-1';
        const tapeRotation = (memIdx % 2 === 0) ? '-rotate-2' : 'rotate-2';

        const content = mem.photoUrl
            ? `<img src="${mem.photoUrl}" class="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=\\'material-symbols-outlined text-red-400\\'>broken_image</span>'">`
            : `<div class="w-full h-full flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/10"><span class="material-symbols-outlined text-yellow-600/70 dark:text-yellow-400">chat</span></div>`;

        html += `
            <div class="relative flex-shrink-0 w-24 h-24 bg-white dark:bg-card-dark p-1 shadow-lg border border-gray-100 dark:border-gray-800 ${rotation} cursor-pointer group transition-all hover:scale-105 hover:z-30 hover:-translate-y-1" 
                 onclick="event.stopPropagation(); window.openLightbox(${dayIndex}, ${itemIndex}, ${memIdx})"
                 oncontextmenu="event.stopPropagation(); window.openContextMenu(event, 'memory', ${itemIndex}, ${dayIndex}, ${memIdx})">
                <!-- 테이프 효과 -->
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-5 bg-white/40 backdrop-blur-[2px] border border-white/30 shadow-sm ${tapeRotation} z-[${Z_INDEX.MODAL_INNER}] pointer-events-none"></div>
                <div class="w-full h-full overflow-hidden rounded-sm">
                    ${content}
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// Helper builders for timeline item variants to improve readability
function buildImageCard(item, editClass, clickHandler, index, dayIndex) {
    const isCompleted = isTripCompleted();
    // [Modified] Use global edit mode instead of memory lock
    const isMemoryLocked = !window.isGlobalEditMode; // Edit Mode ON -> Not Locked
    const showMemoryBtn = isCompleted && !isMemoryLocked && !isEditing && !isReadOnlyMode;

    return `
            <div class="bg-card-light dark:bg-card-dark rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 ${editClass}" ${clickHandler}>
                <div class="h-32 w-full bg-cover bg-center relative" style="background-image: url('${item.image}');">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <div class="absolute bottom-3 left-4 right-4 text-white">
                        <h3 class="text-xl md:text-2xl font-hand truncate tracking-wide">${escapeHtml(item.title)}</h3>
                        <div class="flex items-center gap-1 text-sm md:text-base font-hand opacity-90 overflow-hidden">
                            <span class="material-symbols-outlined text-sm md:text-[16px] flex-shrink-0">location_on</span>
                            <span class="truncate flex-1">${escapeHtml(item.location)}</span>
                        </div>
                    </div>
                    ${showMemoryBtn ? `<button type="button" onclick="event.stopPropagation(); addMemoryItem(${index}, ${dayIndex})" class="absolute top-2 right-2 bg-black/30 hover:bg-black/50 text-white p-2 rounded-full backdrop-blur-sm transition-colors z-[${Z_INDEX.UI_BASE}]">
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
                </div>
            </div>`;
}

function buildMemoCard(item, index, dayIndex, editClass, clickHandler) {
    const isCompleted = isTripCompleted();
    // [Modified] Use global edit mode instead of memory lock
    const isMemoryLocked = !window.isGlobalEditMode; // Edit Mode ON -> Not Locked

    // 비뚤비뚤한 효과 (인덱스에 따라)
    const rotation = (index % 2 === 0) ? 'rotate-1' : '-rotate-1';
    const tapeRotation = (index % 2 === 0) ? '-rotate-3' : 'rotate-3';

    // [New] 메모 카드 전용 컨텍스트 메뉴 핸들러 (부모 장소로 이벤트 버블링 방지)
    const contextHandler = `oncontextmenu="event.stopPropagation(); openContextMenu(event, 'item', ${index}, ${dayIndex})"`;

    return `
            <div class="relative bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/30 rounded-lg p-3 ${editClass} ${rotation} shadow-sm hover:shadow-md transition-shadow" 
                onclick="event.stopPropagation(); ${clickHandler ? clickHandler.replace('onclick="', '').replace('"', '') : `viewTimelineItem(${index}, ${dayIndex})`}" ${contextHandler}>
                <!-- 테이프 효과 -->
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-6 bg-yellow-200/40 backdrop-blur-[2px] border border-yellow-300/30 shadow-sm ${tapeRotation} z-[${Z_INDEX.MODAL_INNER}] pointer-events-none"></div>
                
                <div class="flex items-center gap-3 justify-between">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm md:text-base font-medium text-yellow-900 dark:text-yellow-100 break-words whitespace-pre-wrap leading-relaxed font-body">${escapeHtml(item.title)}</p>
                    </div>
                    <div class="flex items-center gap-1">
                        ${isEditing ? `<button type="button" onclick="event.stopPropagation(); deleteTimelineItem(${index}, ${dayIndex})" class="text-red-500 hover:bg-red-50 p-2 rounded-full flex-shrink-0"><span class="material-symbols-outlined text-lg">delete</span></button>` : ''}
                    </div>
                </div>
            </div>`;
}

function buildTransitCard(item, index, dayIndex, editClass) {
    const isCompleted = isTripCompleted();
    // [Modified] Use global edit mode instead of memory lock
    const isMemoryLocked = !window.isGlobalEditMode; // Edit Mode ON -> Not Locked
    const showMemoryBtn = isCompleted && !isMemoryLocked && !isEditing && !isReadOnlyMode;

    let contentHtml;

    // Google Maps 경로 등: item.title에 이미 완성된 HTML 태그가 포함된 경우
    if (item.title && item.title.includes('<span')) {
        // [Security] XSS 방지: 문자열에 위험한 패턴이 포함되어 있는지 검사
        const dangerPatterns = [/on\w+\s*=/i, /javascript:/i, /<script/i, /alert\(/i, /prompt\(/i, /confirm\(/i];
        const isDangerous = dangerPatterns.some(pattern => pattern.test(item.title));

        if (isDangerous) {
            contentHtml = `<span class="text-red-500 font-bold">[보안 차단됨]</span> ${escapeHtml(item.title)}`;
        } else {
            contentHtml = item.title;
        }
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
        const titleText = (showTitle && item.title) ? `<p class="text-xl font-hand text-text-main dark:text-white truncate ml-2 tracking-wide">${escapeHtml(item.title)}</p>` : '';
        contentHtml = `${tagsHtml} ${titleText}`;
    }

    return `
            <div class="bg-white dark:bg-card-dark rounded-sm p-3 border border-gray-200 dark:border-gray-700 paper-shadow flex flex-col gap-2 ${editClass} relative transform transition-transform hover:-rotate-1" onclick="viewRouteDetail(${index}, ${dayIndex})">
                <!-- Tape effect (visual only) -->
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-white/30 backdrop-blur-sm border border-white/40 shadow-sm rotate-[-2deg] z-[${Z_INDEX.UI_BASE}] pointer-events-none"></div>

                <div class="flex items-center gap-2 md:gap-4 justify-between">
                    <div class="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                        <div class="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-sm px-2 md:px-3 py-1 border border-gray-200 dark:border-gray-700 text-xs md:text-sm font-bold text-gray-900 dark:text-white min-w-[60px] md:min-w-[70px] flex-shrink-0 whitespace-nowrap">
                            <span class="font-hand text-sm md:text-base">${typeof item.duration === 'number' ? formatDuration(item.duration) : (item.duration || item.time || '30분')}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-1 min-w-0 flex-wrap text-sm md:text-base">
                            ${contentHtml}
                        </div>
                    </div>
                    ${showMemoryBtn ? `<button type="button" onclick="event.stopPropagation(); addMemoryItem(${index}, ${dayIndex})" class="text-gray-400 hover:text-primary p-2 rounded-full flex-shrink-0"><span class="material-symbols-outlined text-2xl">photo_camera</span></button>` : ''}
                </div>
            </div>`;
}


function buildDefaultCard(item, index, dayIndex, editClass, clickHandler) {
    const isCompleted = isTripCompleted();
    // [Modified] Use global edit mode instead of memory lock
    const isMemoryLocked = !window.isGlobalEditMode; // Edit Mode ON -> Not Locked
    const showMemoryBtn = isCompleted && !isMemoryLocked && !isEditing && !isReadOnlyMode;

    return `
            <div class="bg-white dark:bg-card-dark rounded-sm p-3 md:p-5 paper-shadow border border-gray-200 dark:border-gray-700 ${editClass} relative transform transition-transform hover:-rotate-1" ${clickHandler}>
                <!-- Tape effect (visual only) -->
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-white/30 backdrop-blur-sm border border-white/40 shadow-sm rotate-[-2deg] z-[${Z_INDEX.UI_BASE}] pointer-events-none"></div>

                <div class="flex justify-between items-start mb-2 gap-2">
                    <div class="flex-1 min-w-0">
                        <h3 class="text-xl md:text-2xl font-hand text-text-main dark:text-white break-words tracking-wide leading-tight">${escapeHtml(item.title)}</h3>
                        <p class="text-sm md:text-base font-hand text-text-muted dark:text-gray-400 flex items-center gap-1 mt-1 min-w-0">
                            <span class="material-symbols-outlined text-sm md:text-[16px] flex-shrink-0">location_on</span>
                            <span class="truncate flex-1">${escapeHtml(item.location || '')}</span>
                        </p>
                    </div>
                    ${item.tag ? `<span class="inline-flex items-center px-2 py-0.5 rounded-sm text-sm md:text-base font-hand font-bold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 flex-shrink-0 whitespace-nowrap transform rotate-2 shadow-sm">${escapeHtml(item.tag)}</span>` : ''}
                    ${showMemoryBtn ? `<button type="button" onclick="event.stopPropagation(); addMemoryItem(${index}, ${dayIndex})" class="text-gray-400 hover:text-primary p-2 rounded-full flex-shrink-0"><span class="material-symbols-outlined text-xl md:text-2xl">photo_camera</span></button>` : ''}
                    ${isEditing ? `<button type="button" onclick="event.stopPropagation(); deleteTimelineItem(${index}, ${dayIndex})" class="text-red-500 hover:bg-red-50 p-1 rounded flex-shrink-0"><span class="material-symbols-outlined text-base md:text-lg">delete</span></button>` : ''}
                </div>
                <div class="flex items-center gap-2 text-xs md:text-sm font-medium text-text-main dark:text-gray-300 flex-wrap">
                    <div class="flex items-center gap-1 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-sm border border-gray-100 dark:border-gray-600 flex-shrink-0">
                        <span class="material-symbols-outlined text-sm md:text-[16px]">schedule</span>
                        <span class="font-hand text-sm md:text-base">${item.time || ''}</span>
                    </div>
                    ${item.duration !== undefined && item.duration !== null ? `
                    <div class="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-sm border border-blue-100 dark:border-blue-800 text-xs flex-shrink-0">
                        <span class="material-symbols-outlined text-xs md:text-[14px]">timer</span>
                        <span class="font-hand text-sm md:text-base">${formatDuration(item.duration)}</span>
                    </div>` : ''}
                    ${item.note ? `
                    <div class="text-xs text-gray-500 flex items-center gap-1 min-w-0 bg-yellow-50 dark:bg-yellow-900/10 px-2 py-1 rounded-sm border border-yellow-100 dark:border-yellow-800">
                        <span class="material-symbols-outlined text-xs md:text-[14px] flex-shrink-0 text-yellow-600">edit_note</span>
                        <span class="truncate font-hand text-sm md:text-base text-gray-700 dark:text-gray-300">${escapeHtml(item.note)}</span>
                    </div>` : ''}
                </div>
            </div>`;
}

/**
 * 플래너 모드 타임라인 아이템 렌더링
 * 왼쪽에 시간 레이블, 오른쪽에 카드 내용
 */
export function renderTimelineItemHtmlPlanner(item, index, dayIndex, isLast, isFirst, attachedMemos = []) {
    // [Modified] Use global edit mode instead of memory lock
    const isMemoryLocked = !window.isGlobalEditMode; // Edit Mode ON -> Not Locked
    const editClass = isEditing ? "edit-mode-active ring-2 ring-primary/50 ring-offset-2" : "cursor-pointer hover:shadow-md transform transition-all hover:-translate-y-0.5";
    const clickHandler = isEditing ? `onclick="editTimelineItem(${index}, ${dayIndex})"` : `onclick="viewTimelineItem(${index}, ${dayIndex})"`;
    const contextHandler = `oncontextmenu="openContextMenu(event, 'item', ${index}, ${dayIndex})"`;
    const draggableAttr = (isMemoryLocked || isReadOnlyMode) ? 'draggable="false"' : `draggable="true" ondragstart="dragStart(event, ${index}, ${dayIndex})" ondragend="dragEnd(event)" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="drop(event, ${index})" data-drop-index="${index}"`;

    // [Fix] 편집 모드(플러스 버튼 있음)에서는 균일한 간격을 위해 마진 제거, 뷰 모드(플러스 버튼 없음)에서는 마진 유지
    const showAddBtn = !isMemoryLocked && !isReadOnlyMode;
    const marginClass = showAddBtn ? "" : "mb-6";

    // 시간 정보 파싱
    let startTime = '--:--';
    let endTime = '--:--';

    // 이동수단 시간 파싱: 비행기는 flightInfo, 일반 이동수단은 transitInfo 사용
    if (item.isTransit && item.transitType === 'airplane' && item.flightInfo) {
        // 비행기: flightInfo의 출발/도착 시간 사용
        startTime = item.flightInfo.departureTime || '--:--';
        endTime = item.flightInfo.arrivalTime || '--:--';
    } else if (item.isTransit && item.transitInfo) {
        // 일반 이동수단: transitInfo 사용
        // [Fix] 시간 형식이 아닌 텍스트("천만교" 등)가 들어있는 경우 무시하여 UI 깨짐 방지
        const isValidTime = (t) => /^\d{1,2}:\d{2}$/.test(t);

        if (isValidTime(item.transitInfo.start)) {
            startTime = item.transitInfo.start;
            endTime = item.transitInfo.end || '--:--';
        } else {
            // 오염된 데이터(텍스트) 감지 시 초기화
            startTime = '--:--';
            endTime = '--:--';
        }
    } else if (item.time) {

        // "오전 09:00", "09:00 - 10:30", "09:00" 등 다양한 형식 처리
        const timeStr = item.time.replace(/오전|오후|AM|PM/gi, '').trim();
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);

        if (timeMatch) {
            startTime = formatTime(`${timeMatch[1]}:${timeMatch[2]}`);

            // duration이 있으면 종료 시간 계산 (0도 포함)
            if (item.duration !== undefined && item.duration !== null) {
                endTime = calculateEndTime(startTime, item.duration);
            } else {
                // duration이 없으면 기본 30분
                endTime = calculateEndTime(startTime, 30);
            }
        }
    }

    // 세로선 스타일 (간단 모드와 동일) - 점선으로 변경
    const lineStyle = isLast && attachedMemos.length === 0 ? `bg-gradient-to-b from-gray-300 to-transparent dark:from-gray-600 border-l-2 border-dashed border-gray-300 dark:border-gray-600 bg-transparent w-0` : `border-l-2 border-dashed border-gray-300 dark:border-gray-600 h-full absolute left-0 top-0 w-0`;
    const linePosition = isFirst ? 'top-6 -bottom-8' : 'top-0 -bottom-8';
    const zIndex = 100 - index;

    // [Fix] 읽기 전용 모드에서는 터치 스크롤 허용
    const isViewer = isReadOnlyMode || document.body.classList.contains('viewer-mode');

    // [Modified] 모바일에서 롱프레스 드래그와 우클릭 메뉴(contextmenu) 충돌 방지
    // 수정 모드일 때만 터치 핸들러를 붙이고, 우클릭 메뉴는 모바일에서 차단
    const touchAttrs = isViewer ? '' : `ontouchstart="touchStart(event, ${index}, 'item')" ontouchmove="touchMove(event)" ontouchend="touchEnd(event)"`;

    // [Enhanced] 윈도우 너비나 터치 지원 여부가 아닌 '실제 터치 행위'를 기준으로 차단
    // 최근 500ms 이내에 터치 이벤트가 있었다면 롱프레스로 간주하고 컨텍스트 메뉴 차단
    // 그렇지 않다면(마우스 우클릭) 허용
    const contextHandlerAttr = `oncontextmenu="if(window.lastTouchTime && Date.now() - window.lastTouchTime < 500) { event.preventDefault(); event.stopPropagation(); return false; } else { ${contextHandler.replace('oncontextmenu=', '').replace(/"/g, '')} }"`;

    const touchStyle = isViewer ? '' : 'touch-action: pan-y;';

    let html = `
        <div ${draggableAttr} ${touchAttrs} data-index="${index}" style="z-index: ${zIndex}; ${touchStyle}" 
            class="relative grid grid-cols-[auto_1fr] gap-x-3 md:gap-x-6 group/timeline-item timeline-item-transition rounded-xl ${marginClass}" ${contextHandlerAttr}>
            <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-50 shadow-sm pointer-events-none"></div>
            
            <!-- 시간 카드 (기존 아이콘 위치) -->
            <div class="relative flex flex-col" data-timeline-icon="true">
                ${item.tag === '메모' ? `
                    <div class="w-[60px] shrink-0"></div>
                ` : `
                    <div class="relative z-10 h-full flex flex-col items-center justify-between bg-white dark:bg-card-dark rounded-sm px-2 py-2 shadow-sm w-[60px] shrink-0 border border-gray-100 dark:border-gray-700" style="width: 60px; min-width: 60px;">
                        <div class="font-bold font-hand text-base text-gray-900 dark:text-white leading-tight tabular-nums" style="font-variant-numeric: tabular-nums;">${startTime}</div>
                        <div class="text-xs text-gray-300">↓</div>
                        <div class="font-bold font-hand text-base text-gray-900 dark:text-white leading-tight tabular-nums" style="font-variant-numeric: tabular-nums;">${endTime}</div>
                    </div>
                `}
            </div>
            
            <!-- 카드 내용 -->
            <div class="flex flex-col justify-center min-w-0">
    `;

    // Content variants (Same as simple mode but without icon)
    if (item.image) {
        html += buildImageCard(item, editClass, clickHandler, index, dayIndex);
    } else if (item.tag === '메모') {
        html += buildMemoCard(item, index, dayIndex, editClass, clickHandler);
    } else if (item.isTransit) {
        html += buildTransitCard(item, index, dayIndex, editClass);
    } else {
        html += buildDefaultCard(item, index, dayIndex, editClass, clickHandler);
    }

    // [New] 카드 외부에 추억 렌더링
    html += renderMemoriesHtml(item, dayIndex, index);

    // [New] 부착된 메모들 렌더링
    if (attachedMemos && attachedMemos.length > 0) {
        html += `<div class="flex flex-col gap-4 mt-4">`;
        attachedMemos.forEach((memoData) => {
            const memoClickHandler = isEditing ? `onclick="editTimelineItem(${memoData.index}, ${dayIndex})"` : `onclick="viewTimelineItem(${memoData.index}, ${dayIndex})"`;
            html += buildMemoCard(memoData.item, memoData.index, dayIndex, editClass, memoClickHandler);
        });
        html += `</div>`;
    }


    html += `
            </div>
        </div>
    `;


    // 플래너 모드에서 플러스 버튼과 함께 구분선 추가 (마지막 아이템 포함) (메모는 제외하고 렌더링 루프에서 마지막에만 추가할 수 있음)
    // 하지만 item이 parent인 경우, 마지막 메모 뒤에 플러스 버튼이 있어야 함.
    if (!isMemoryLocked && !isReadOnlyMode) {
        const lastIndex = attachedMemos.length > 0 ? attachedMemos[attachedMemos.length - 1].index : index;
        html += `
            <button type="button" onclick="openAddModal(${lastIndex}, ${dayIndex})" 
                class="relative flex items-center gap-3 h-8 my-2 w-full text-gray-400 hover:text-primary transition-colors cursor-pointer group" 
                title="일정 추가">
                <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700 group-hover:bg-primary/30 transition-colors"></div>
                <div class="w-8 h-8 flex items-center justify-center transform group-hover:scale-110 transition-transform">
                    <span class="material-symbols-outlined text-lg">add</span>
                </div>
                <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700 group-hover:bg-primary/30 transition-colors"></div>
            </button>
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
            <span class="text-base font-semibold uppercase">전체</span>
        </button>`;

    if (!isSingleDay) {
        travelData.days.forEach((day, index) => {
            const isActive = index === currentDayIndex;
            const activeClass = isActive ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
            tabsHtml += `
            <button type="button" onclick="selectDay(${index})" class="flex flex-col items-center justify-center px-6 py-3 rounded-t-lg transition-colors ${activeClass}">
                <span class="text-base font-semibold uppercase">${index + 1}일차</span>
            </button>`;
        });
    }
    tabsEl.innerHTML = tabsHtml;

    const listEl = document.getElementById('timeline-list'); if (!listEl) return;
    let html = '';
    if (currentDayIndex === -1 || isSingleDay) {
        travelData.days.forEach((day, dayIdx) => {
            const dayBadge = isSingleDay ? '' : `<div class="bg-primary/10 text-primary w-[60px] py-1 rounded-lg font-bold text-sm flex items-center justify-center shrink-0">${dayIdx + 1}일차</div>`;
            html += `
                <div class="mb-8">
                    <div class="flex items-center gap-4 mb-4">
                        ${dayBadge}
                        <div class="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                        ${!isReadOnlyMode ? `<button type="button" onclick="openSortMethodModal(${dayIdx})" class="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors flex items-center gap-1" title="정렬">
                            <span class="material-symbols-outlined text-sm">sort</span>
                            <span class="hidden sm:inline">정렬</span>
                        </button>` : ''}
                        <div class="text-xs text-gray-400">${day.date}</div>
                    </div>
                    <div class="flex flex-col">`;
            if (day.timeline && day.timeline.length > 0) {
                const renderFunc = renderTimelineItemHtmlPlanner; // 🔒 항상 플래너 모드

                // [New] 메모 항목 그룹화를 위한 개선된 루프
                const groupedItems = [];
                let currentItem = null;

                day.timeline.forEach((item, index) => {
                    if (item.tag === '메모') {
                        if (currentItem) {
                            currentItem.attachedMemos.push({ item, index });
                        } else {
                            // 첫 항목이 메모인 경우 독립적으로 추가
                            groupedItems.push({ item, index, attachedMemos: [] });
                        }
                    } else {
                        currentItem = { item, index, attachedMemos: [] };
                        groupedItems.push(currentItem);
                    }
                });

                groupedItems.forEach((group, gIdx) => {
                    const isLast = gIdx === groupedItems.length - 1;
                    const isFirst = gIdx === 0;
                    html += renderFunc(group.item, group.index, dayIdx, isLast, isFirst, group.attachedMemos);
                });
            } else {
                html += `
                <div class="flex flex-col items-center justify-center py-10 text-gray-400">
                    <span class="material-symbols-outlined text-4xl mb-2">edit_calendar</span>
                    <p class="text-sm">아직 일정이 없습니다.${!isReadOnlyMode ? ' 첫 일정을 추가해보세요!' : ''}</p>
                    ${!isReadOnlyMode ? `<button type="button" onclick="openAddModal(-1, ${dayIdx})" class="mt-4 flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-bold shadow-lg hover:bg-orange-500 transition-colors transform hover:scale-105">
                        <span class="material-symbols-outlined">add</span> 일정 시작하기
                    </button>` : ''}
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
                    <div class="flex items-center gap-4 mb-4">
                        <div class="bg-primary/10 text-primary w-[60px] py-1 rounded-lg font-bold text-sm flex items-center justify-center shrink-0">${currentDayIndex + 1}일차</div>
                        <div class="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                        ${!isReadOnlyMode ? `<button type="button" onclick="openSortMethodModal(${currentDayIndex})" class="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors flex items-center gap-1" title="정렬">
                            <span class="material-symbols-outlined text-sm">sort</span>
                            <span class="hidden sm:inline">정렬</span>
                        </button>` : ''}
                        <div class="text-xs text-gray-400">${day.date}</div>
                    </div>
                    <div class="flex flex-col">`;
        }
        const renderFunc = renderTimelineItemHtmlPlanner; // 🔒 항상 플래너 모드

        // [New] 메모 항목 그룹화를 위한 개선된 루프
        const groupedItems = [];
        let currentItem = null;

        currentTimeline.forEach((item, index) => {
            if (item.tag === '메모') {
                if (currentItem) {
                    currentItem.attachedMemos.push({ item, index });
                } else {
                    groupedItems.push({ item, index, attachedMemos: [] });
                }
            } else {
                currentItem = { item, index, attachedMemos: [] };
                groupedItems.push(currentItem);
            }
        });

        groupedItems.forEach((group, gIdx) => {
            const isLast = gIdx === groupedItems.length - 1;
            const isFirst = gIdx === 0;
            html += renderFunc(group.item, group.index, currentDayIndex, isLast, isFirst, group.attachedMemos);
        });
        if (currentTimeline.length > 0) {
            html += `
                <div ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="timelineContainerDrop(event, ${currentDayIndex})" class="h-8 relative mx-6" style="z-index: 1;">
                    <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-[${Z_INDEX.MODAL_INNER}] shadow-sm pointer-events-none"></div>
                </div>`;
        }
        if (currentTimeline.length === 0) {
            html += `
            <div class="col-span-2 flex flex-col items-center justify-center py-10 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">edit_calendar</span>
                <p class="text-sm">아직 일정이 없습니다.${!isReadOnlyMode ? ' 첫 일정을 추가해보세요!' : ''}</p>
                ${!isReadOnlyMode ? `<button type="button" onclick="openAddModal(-1, ${currentDayIndex})" class="mt-4 flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-bold shadow-lg hover:bg-orange-500 transition-colors transform hover:scale-105">
                    <span class="material-symbols-outlined">add</span> 일정 시작하기
                </button>` : ''}
            </div>`;
        }
    }

    // [Optimize] Use morphdom for smooth updates (no blinking)
    // Wrap content in a temp div to match listEl structure if needed, or use childrenOnly
    // listEl.innerHTML = html; // Old way

    // morphdom needs a root element to compare. 
    // We want to update children of listEl.
    const tempContainer = document.createElement('div');
    tempContainer.id = 'timeline-list';
    tempContainer.innerHTML = html;

    // [Fix] Check if morphdom is available (in case import failed or not installed yet)
    if (typeof morphdom !== 'undefined' || typeof window.morphdom !== 'undefined' || (typeof morphdom === 'function')) {
        morphdom(listEl, tempContainer, {
            childrenOnly: true,
            onBeforeElUpdated: function (fromEl, toEl) {
                return true;
            }
        });
    } else {
        // Fallback if morphdom is missing
        listEl.innerHTML = html;
        console.warn('morphdom not loaded, falling back to innerHTML');
    }
    window.renderLists && window.renderLists();
    window.updateLocalTimeWidget && window.updateLocalTimeWidget();

    // [Memory Lock Button] Legacy logic removed. 
    // Button state is now managed by ui.js toggleGlobalEditMode() and is persistently visible.
}

export function renderLists() {
    const shoppingContainer = document.getElementById('shopping-list-container');
    const checkContainer = document.getElementById('checklist-container');
    const scrollPosition = window.scrollY || document.documentElement.scrollTop;
    const renderItem = (item, index, type, shouldSparkle = false) => `
        <div class="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 flex items-center gap-2 group hover:shadow-sm transition-shadow ${shouldSparkle ? 'sparkle-item' : ''}">
            <button onclick="toggleListCheck('${type}', ${index})" class="flex-shrink-0 text-gray-400 hover:text-primary transition-colors ${isReadOnlyMode ? 'cursor-default pointer-events-none' : ''}">
                <span class="material-symbols-outlined text-xl">${item.checked ? 'check_box' : 'check_box_outline_blank'}</span>
            </button>
            <div class="flex-1 min-w-0">
                <span class="text-sm block ${item.checked ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}">${escapeHtml(item.text)}</span>
                ${item.location ? `<span class="text-xs text-gray-500 block truncate"><span class="material-symbols-outlined text-xs align-middle">location_on</span> ${escapeHtml(item.location)}</span>` : ''}
            </div>
            ${!isReadOnlyMode ? `<button onclick="deleteListItem('${type}', ${index})" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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
                    <div onclick="openShoppingListModal()" class="text-center py-1 mt-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
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
                    <div onclick="openChecklistModal()" class="text-center py-1 mt-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
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
        const isImage = att.type.startsWith('image/');
        const bgClass = isImage ? '' : 'bg-gray-100 dark:bg-gray-700';
        const fileData = att.url || att.data;
        const content = isImage ? `<div class="w-full h-full bg-cover bg-center transition-transform group-hover:scale-110" style="background-image: url('${fileData}')"></div>` : `<div class="w-full h-full flex flex-col items-center justify-center text-gray-500"><span class="material-symbols-outlined text-3xl mb-1">picture_as_pdf</span><span class="text-[10px] px-2 truncate w-full text-center">${att.name}</span></div>`;

        html += `
            <div class="relative group aspect-square w-36 h-36 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 isolate shrink-0 ${bgClass}">
                ${content}
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10 rounded-xl">
                    <button onclick="openAttachment('${fileData}', '${att.type}')" class="text-white hover:text-primary p-2 bg-black/20 rounded-full backdrop-blur-sm transition-colors" title="열기">
                        <span class="material-symbols-outlined text-xl">visibility</span>
                    </button>
                    ${!isReadOnlyMode ? `<button onclick="deleteAttachment(${index}, '${containerId}')" class="text-white hover:text-red-500 p-2 bg-black/20 rounded-full backdrop-blur-sm transition-colors" title="삭제">
                        <span class="material-symbols-outlined text-xl">delete</span>
                    </button>` : ''}
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

export default { renderItinerary, renderLists, renderAttachments, renderWeeklyWeather };
