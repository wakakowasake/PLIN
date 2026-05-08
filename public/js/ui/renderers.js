/**
 * Renderers - 렌더링 함수 리팩토링
 * 
 * Phase 3 렌더링 리팩토링 - 컴포넌트 분할 후 통합 export 포인트
 * 실제 구현은 다음 파일들에서:
 * - card-renderer.js: 카드 렌더링 (buildImageCard, buildMemoCard 등)
 * - timeline-renderer.js: 타임라인 아이템 렌더링
 * - itinerary-renderer.js: 여행 일정 전체 렌더링
 * - utility-renderers.js: 리스트/첨부파일/날씨 렌더링
 */

import { travelData } from '../state.js';
import { Z_INDEX } from './constants.js';
import { normalizeGooglePhotoUrl } from '../ui-utils.js';

// 분산된 렌더링 함수들 import
import { renderTimelineItemHtmlPlanner as timelineRender } from './timeline-renderer.js';
import { renderItinerary as itineraryRender } from './itinerary-renderer.js';
import { renderLists as listsRender, renderAttachments as attachmentsRender, renderWeeklyWeather as weatherRender } from './utility-renderers.js';

function safeGet(id) { return document.getElementById(id); }

/**
 * 추억(사진) 렌더링 HTML 생성 (카드 외부용, 테이프 & 회전 효과)
 * Timeline 내부에서만 사용되는 헬퍼 함수
 */
export function renderMemoriesHtml(item, dayIndex, itemIndex) {
    if (!item.memories || item.memories.length === 0) return '';

    const memoriesHtml = item.memories.map((mem, memIdx) => {
        // 비뚤비뚤한 효과를 위한 회전값 (인덱스에 따라 교차)
        const rotation = (memIdx % 2 === 0) ? 'rotate-1' : '-rotate-1';
        const tapeRotation = (memIdx % 2 === 0) ? '-rotate-2' : 'rotate-2';

        const memoryImage = mem.photoUrl ? normalizeGooglePhotoUrl(mem.photoUrl, 800) : '';
        const content = memoryImage
            ? `<img src="${memoryImage}" class="w-full h-full object-cover transition-transform group-hover:scale-105 memory-img" loading="eager" decoding="async" fetchpriority="auto" data-mem-idx="${memIdx}" onerror="this.onerror=null;this.style.display='none';this.parentElement.innerHTML='<div class=&quot;w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800&quot;><span class=&quot;material-symbols-outlined text-red-400&quot;>broken_image</span></div>';">`
            : `<div class="w-full h-full flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/10"><span class="material-symbols-outlined text-yellow-600/70 dark:text-yellow-400">chat</span></div>`;

        return `
            <div class="memory-card relative flex-shrink-0 w-24 h-24 bg-white dark:bg-card-dark p-1 shadow-lg border border-gray-100 dark:border-gray-800 ${rotation} cursor-pointer group transition-all hover:scale-105 hover:z-30 hover:-translate-y-1" 
                 data-action="memory-click"
                 data-day-index="${dayIndex}"
                 data-item-index="${itemIndex}"
                 data-mem-idx="${memIdx}">
                <!-- 테이프 효과 -->
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-5 bg-white/40 backdrop-blur-[2px] border border-white/30 shadow-sm ${tapeRotation} z-[${Z_INDEX.MODAL_INNER}] pointer-events-none"></div>
                <div class="w-full h-full overflow-hidden rounded-sm">
                    ${content}
                </div>
            </div>
        `;
    }).join('');

    return `<div class="mt-4 flex gap-6 overflow-x-auto pb-4 no-scrollbar px-2" style="touch-action: pan-x;">${memoriesHtml}</div>`;
}

/**
 * 🔄 [DI Pattern] Memory 카드 이벤트 핸들러 주입
 * @param {Object} handlers - { openLightbox, openContextMenu }
 */
export function injectMemoryHandlers(handlers) {
    if (typeof document === 'undefined') return;

    document.addEventListener('click', (e) => {
        const card = e.target.closest('[data-action="memory-click"]');
        if (!card) return;
        
        e.stopPropagation();
        const dayIndex = parseInt(card.dataset.dayIndex);
        const itemIndex = parseInt(card.dataset.itemIndex);
        const memIdx = parseInt(card.dataset.memIdx);
        
        if (handlers.openLightbox && typeof handlers.openLightbox === 'function') {
            handlers.openLightbox(dayIndex, itemIndex, memIdx);
        }
    }, { passive: false });

    document.addEventListener('contextmenu', (e) => {
        const card = e.target.closest('[data-action="memory-click"]');
        if (!card) return;
        
        e.stopPropagation();
        e.preventDefault();
        const dayIndex = parseInt(card.dataset.dayIndex);
        const itemIndex = parseInt(card.dataset.itemIndex);
        const memIdx = parseInt(card.dataset.memIdx);
        
        if (handlers.openContextMenu && typeof handlers.openContextMenu === 'function') {
            handlers.openContextMenu(e, 'memory', itemIndex, dayIndex, memIdx);
        }
    }, { passive: false });
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// Phase 3 리팩토링: 다음 함수들은 각 모듈로 분할되었습니다
// ═════════════════════════════════════════════════════════════════════════════════════════

/**
 * 플래너 모드 타임라인 아이템 렌더링
 * @see timeline-renderer.js
 */
export function renderTimelineItemHtmlPlanner(item, index, dayIndex, isLast, isFirst, attachedMemos = []) {
    return timelineRender(item, index, dayIndex, isLast, isFirst, attachedMemos);
}

/**
 * 여행 일정 전체 렌더링 (탭, 타임라인, 메타정보)
 * @see itinerary-renderer.js
 */
export function renderItinerary() {
    return itineraryRender();
}

/**
 * 쇼핑 리스트 & 체크리스트 렌더링
 * @see utility-renderers.js
 */
export function renderLists() {
    return listsRender();
}

/**
 * 첨부파일 렌더링
 * @see utility-renderers.js
 */
export function renderAttachments(item, containerId) {
    return attachmentsRender(item, containerId);
}

/**
 * 주간 날씨 렌더링
 * @see utility-renderers.js
 */
export function renderWeeklyWeather(weeklyWeatherData, currentWeatherWeekStart, selectedWeatherDate) {
    return weatherRender(weeklyWeatherData, currentWeatherWeekStart, selectedWeatherDate);
}

export default { renderItinerary, renderLists, renderAttachments, renderWeeklyWeather };
