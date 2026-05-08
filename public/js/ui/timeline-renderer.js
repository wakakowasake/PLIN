/**
 * TimelineRenderer - 타임라인 아이템 렌더링
 * 
 * Phase 3 렌더링 리팩토링 - 컴포넌트 분할
 * renderers.js에서 분리된 플래너 타임라인 렌더링 로직
 */

import { travelData, currentDayIndex, isEditing, isReadOnlyMode } from '../state.js';
import { Z_INDEX } from './constants.js';
import { calculateEndTime, formatTime } from './time-helpers.js';
import { buildImageCard, buildMemoCard, buildTransitCard, buildDefaultCard } from './card-renderer.js';
import { normalizeGooglePhotoUrl } from '../ui-utils.js';

/**
 * 추억(사진) 렌더링 HTML 생성 (카드 외부용, 테이프 & 회전 효과)
 */
function renderMemoriesHtml(item, dayIndex, itemIndex) {
    if (!item.memories || item.memories.length === 0) return '';

    const memoriesHtml = item.memories.map((mem, memIdx) => {
        const memoryImage = mem.photoUrl ? normalizeGooglePhotoUrl(mem.photoUrl, 800) : '';
        const content = memoryImage
            ? `<img src="${memoryImage}" class="timeline-memory-preview-img memory-img" loading="eager" decoding="async" fetchpriority="auto" data-mem-idx="${memIdx}" onerror="this.onerror=null;this.closest('.timeline-memory-preview')?.remove();">`
            : `<div class="timeline-memory-preview-empty"><span class="material-symbols-outlined">chat</span></div>`;

        return `
            <div class="timeline-memory-preview" 
                 data-action="open-lightbox" data-day="${dayIndex}" data-item="${itemIndex}" data-mem="${memIdx}"
                 oncontextmenu="event.stopPropagation(); window.openContextMenu(event, 'memory', ${itemIndex}, ${dayIndex}, ${memIdx})">
                ${content}
            </div>
        `;
    }).join('');

    return `<div class="timeline-memory-preview-row no-scrollbar" style="touch-action: pan-x;">${memoriesHtml}</div>`;
}

/**
 * 플래너 모드 타임라인 아이템 렌더링
 * 왼쪽에 시간 레이블, 오른쪽에 카드 내용
 */
export function renderTimelineItemHtmlPlanner(item, index, dayIndex, isLast, isFirst, attachedMemos = []) {
    // [Modified] Use global edit mode instead of memory lock
    const isMemoryLocked = !window.isGlobalEditMode; // Edit Mode ON -> Not Locked
    const editClass = isEditing ? "edit-mode-active ring-2 ring-primary/50 ring-offset-2" : "cursor-pointer hover:shadow-md transform transition-all hover:-translate-y-0.5";
    const clickHandler = isEditing ? `data-action="edit-item" data-index="${index}" data-day="${dayIndex}"` : `data-action="view-item" data-index="${index}" data-day="${dayIndex}"`;
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
    const isMemoItem = item.tag === '메모';

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
            class="timeline-entry ${isMemoItem ? 'timeline-entry-memo' : ''} relative grid grid-cols-[auto_1fr] gap-x-3 md:gap-x-6 group/timeline-item timeline-item-transition rounded-xl ${marginClass}" ${contextHandlerAttr}>
            <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-50 shadow-sm pointer-events-none"></div>
            
            <!-- 시간 카드 (기존 아이콘 위치) -->
            ${isMemoItem ? '' : `
                <div class="timeline-time-column relative flex flex-col" data-timeline-icon="true">
                    <div class="timeline-time-card ${item.isTransit ? 'timeline-time-card-transit' : item.image || (item.memories && item.memories.length > 0) ? 'timeline-time-card-memory' : 'timeline-time-card-default'} relative z-10 h-full flex flex-col items-center justify-between bg-white dark:bg-card-dark rounded-sm px-2 py-2 shadow-sm w-[60px] shrink-0 border border-gray-100 dark:border-gray-700" style="width: 60px; min-width: 60px;">
                        <div class="timeline-time-start font-bold font-hand text-base text-gray-900 dark:text-white leading-tight tabular-nums" style="font-variant-numeric: tabular-nums;">${startTime}</div>
                        <div class="timeline-time-divider text-xs text-gray-300">-</div>
                        <div class="timeline-time-end font-bold font-hand text-base text-gray-900 dark:text-white leading-tight tabular-nums" style="font-variant-numeric: tabular-nums;">${endTime}</div>
                    </div>
                </div>
            `}
            
            <!-- 카드 내용 -->
            <div class="timeline-entry-content flex flex-col justify-center min-w-0">
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
            // ✅ Phase 5.6 Step 3-Final: onclick 제거, class + data-* 속성 사용
            const memoClickHandler = `class="memo-timeline-item" data-memo-index="${memoData.index}" data-day-index="${dayIndex}" data-click-mode="${isEditing ? 'edit' : 'view'}"`;
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
    // ✅ [Fix] 항상 아이템의 index를 사용: "이 아이템(index) 뒤에 삽입"을 의미하므로 메모 인덱스는 사용 금지
    if (!isMemoryLocked && !isReadOnlyMode) {
        html += `
            <button type="button" data-action="add-item" data-index="${index}" data-day="${dayIndex}" 
                class="timeline-insert-button relative flex items-center gap-3 h-8 my-2 w-full text-gray-400 hover:text-primary transition-colors cursor-pointer group" 
                title="일정 추가">
                <div class="timeline-insert-divider flex-1 h-px bg-gray-200 dark:bg-gray-700 group-hover:bg-primary/30 transition-colors"></div>
                <div class="timeline-insert-icon w-8 h-8 flex items-center justify-center transform group-hover:scale-110 transition-transform">
                    <span class="material-symbols-outlined text-lg">add</span>
                </div>
                <div class="timeline-insert-divider flex-1 h-px bg-gray-200 dark:bg-gray-700 group-hover:bg-primary/30 transition-colors"></div>
            </button>
        `;
    }

    return html;
}
