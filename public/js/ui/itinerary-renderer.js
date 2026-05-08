/**
 * ItineraryRenderer - 여행 일정 렌더링
 * 
 * Phase 3 렌더링 리팩토링 - 컴포넌트 분할
 * renderers.js에서 분리된 일정 보기 렌더링 로직
 */

import morphdom from 'morphdom';
import { travelData, currentDayIndex, isReadOnlyMode, isGuestMode } from '../state.js';
import { Z_INDEX } from './constants.js';
import { renderTimelineItemHtmlPlanner } from './timeline-renderer.js';
import {
    ensureDayPlanBranchState,
    getDayActivePlan,
    getDayPlanCodes,
    getDayTimeline,
    hasDayAlternativePlans
} from './plan-branches.js';

const DEFAULT_HERO_IMAGE = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop";
const backgroundProbeCache = new Map();
const loggedBackgroundFallbackKeys = new Set();

function escapeCssUrl(url = '') {
    return String(url).replace(/"/g, '\\"');
}

function probeBackgroundUrl(url = '') {
    const key = String(url || '').trim();
    if (!key || backgroundProbeCache.has(key)) return;

    backgroundProbeCache.set(key, 'pending');
    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = 'high';
    img.onload = () => backgroundProbeCache.set(key, 'ok');
    img.onerror = () => {
        backgroundProbeCache.set(key, 'fail');
        console.warn("[ItineraryRenderer] Background image failed to load:", key);
    };
    img.src = key;
}

function applyBackgroundWithFallback(element, primaryUrl) {
    if (!element) return;

    const candidate = String(primaryUrl || '').trim();
    const fallback = escapeCssUrl(DEFAULT_HERO_IMAGE);
    const cachedResult = candidate ? backgroundProbeCache.get(candidate) : 'fail';
    const logKey = candidate || '(empty)';

    if (!candidate || cachedResult === 'fail') {
        element.style.backgroundImage = `url("${fallback}")`;
        if (!loggedBackgroundFallbackKeys.has(logKey)) {
            loggedBackgroundFallbackKeys.add(logKey);
            console.info("[TripImage] 배경 fallback 적용", { candidate: candidate || null, reason: cachedResult === 'fail' ? 'probe-failed' : 'empty' });
        }
        return;
    }

    const escapedCandidate = escapeCssUrl(candidate);
    element.style.backgroundImage = `url("${escapedCandidate}"), url("${fallback}")`;
    if (!cachedResult) probeBackgroundUrl(candidate);
}

/**
 * 메모 항목 그룹화 헬퍼 함수
 * 타임라인 항목들을 메모 기준으로 그룹화
 */
function groupTimelineByMemo(timeline) {
    const groupedItems = [];
    let currentItem = null;

    timeline.forEach((item, index) => {
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

    return groupedItems;
}

/**
 * 하나의 일차 렌더링 헬퍼 함수
 */
function renderDaySection(day, dayIdx, isSingleDay, forcedPlanCode = null) {
    ensureDayPlanBranchState(day);
    const activePlan = forcedPlanCode || getDayActivePlan(day);
    const timeline = getDayTimeline(day, activePlan);
    if (forcedPlanCode) {
        day.timeline = timeline;
    }
    const dayPlanSuffix = hasDayAlternativePlans(day) ? ` 플랜${activePlan}` : '';
    const dayBadge = isSingleDay ? '' : `<div class="timeline-day-badge bg-primary/10 text-primary min-w-[78px] px-2 py-1 rounded-lg font-bold text-sm flex items-center justify-center shrink-0">${dayIdx + 1}일차${dayPlanSuffix}</div>`;
    const showSortButton = !isReadOnlyMode && Boolean(window.isGlobalEditMode);
    const showPlanManagerButton = showSortButton;
    let dayHtml = `
        <div class="timeline-day-section mb-8">
            ${showSortButton ? `<div class="timeline-day-actions grid grid-cols-2 gap-2 mb-2 w-full">
                <button type="button" class="timeline-day-action-btn open-sort-method-btn h-9 w-full rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-1" title="일정 정렬" data-day-idx="${dayIdx}">
                    <span class="material-symbols-outlined text-base">sort</span>
                    <span class="text-xs font-bold">정렬</span>
                </button>
                ${showPlanManagerButton ? `<button type="button" class="timeline-day-action-btn open-day-plan-manager-btn h-9 w-full rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition-colors shadow-sm flex items-center justify-center gap-1" title="일차 플랜 관리" data-day-idx="${dayIdx}">
                    <span class="material-symbols-outlined text-base">library_add</span>
                    <span class="text-xs font-bold">플랜</span>
                </button>` : ''}
            </div>` : ''}
            <div class="timeline-day-header flex items-center gap-4 mb-4">
                ${dayBadge}
                <div class="timeline-day-divider h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                <div class="timeline-day-date text-xs text-gray-400">${day.date}</div>
            </div>
            <div class="timeline-day-list flex flex-col">`;

    if (timeline && timeline.length > 0) {
        const groupedItems = groupTimelineByMemo(timeline);
        const itemsHtml = groupedItems.map((group, gIdx) => {
            const isLast = gIdx === groupedItems.length - 1;
            const isFirst = gIdx === 0;
            return renderTimelineItemHtmlPlanner(group.item, group.index, dayIdx, isLast, isFirst, group.attachedMemos);
        }).join('');
        dayHtml += itemsHtml;
    } else {
        dayHtml += `
        <div class="timeline-empty-state flex flex-col items-center justify-center py-10 text-gray-400">
            <span class="material-symbols-outlined text-4xl mb-2">edit_calendar</span>
            <p class="text-sm">아직 일정이 없습니다.${!isReadOnlyMode ? ' 첫 일정을 추가해보세요!' : ''}</p>
            ${!isReadOnlyMode ? `<button type="button" class="timeline-empty-cta open-add-modal-btn mt-4 flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-bold shadow-lg hover:bg-orange-500 transition-colors transform hover:scale-105" data-day-idx="${dayIdx}">
                <span class="material-symbols-outlined">add</span> 일정 시작하기
            </button>` : ''}
        </div>`;
    }
    dayHtml += `</div></div>`;

    return dayHtml;
}

/**
 * 플래너 모드에서 여행 일정 렌더링 (탭, 타임라인, 메타정보)
 * 
 * 렌더링 단계:
 * 1. 메타 정보 (제목, 날짜, 날씨) 업데이트
 * 2. 일차 탭 생성
 * 3. 타임라인 렌더링 (전체 또는 선택된 날짜)
 * 4. morphdom을 사용한 부드러운 DOM 업데이트
 */
export function renderItinerary() {
    // [Guest Mode] UI 처리
    const guestSaveBtn = document.getElementById('guest-save-btn');
    const shareBtn = document.getElementById('share-btn');

    if (isGuestMode) {
        guestSaveBtn?.classList.remove('hidden');
        shareBtn?.classList.add('hidden'); // 게스트는 공유 불가
    } else {
        guestSaveBtn?.classList.add('hidden');
    }

    if (!travelData.days) travelData.days = [];
    travelData.days.forEach(ensureDayPlanBranchState);

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

    const bgImg = travelData.meta?.mapImage || DEFAULT_HERO_IMAGE;
    const mapBg = document.getElementById('map-bg');
    applyBackgroundWithFallback(mapBg, bgImg);
    const heroEl = document.getElementById('trip-hero');
    applyBackgroundWithFallback(heroEl, bgImg);

    // 여행 제목과 날짜 정보 업데이트
    const titleEl = document.getElementById('trip-title');
    if (titleEl) titleEl.innerText = travelData.meta?.title || "제목 없음";

    const dateInfoEl = document.getElementById('trip-date-info');
    if (dateInfoEl) dateInfoEl.innerText = travelData.meta?.subInfo || "";

    // [Fix] 여행 기간(몇박 몇일) 정보 업데이트
    const dayCountEl = document.getElementById('trip-day-count');
    if (dayCountEl) dayCountEl.innerText = travelData.meta?.dayCount || "일정 미정";

    // [Added] 날씨 위젯 실시간 업데이트
    const weather = travelData.meta?.weather;
    const tempEl = document.getElementById('weather-temp');
    const rangeEl = document.getElementById('weather-range');
    const descEl = document.getElementById('weather-desc');

    if (weather) {
        if (tempEl) tempEl.innerText = weather.temp || "--";
        if (rangeEl) rangeEl.innerText = `${weather.minTemp || "--"} / ${weather.maxTemp || "--"}`;
        if (descEl) descEl.innerText = weather.desc || "상세 보기 클릭";
    }

    // Tabs and timeline
    const tabsEl = document.getElementById('day-tabs'); if (!tabsEl) return;
    let tabsHtml = '';
    const isSingleDay = travelData.days.length === 1;
    const hasAnyAlternativePlan = travelData.days.some(hasDayAlternativePlans);
    const showSingleDayAsAll = isSingleDay && !hasAnyAlternativePlan;
    const isAllActive = currentDayIndex === -1 || showSingleDayAsAll;
    const allActiveClass = isAllActive ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
    tabsHtml += `
        <button type="button" class="select-day-btn flex flex-col items-center justify-center px-6 py-3 rounded-t-lg transition-colors ${allActiveClass}" data-day-index="-1">
            <span class="text-base font-semibold uppercase">전체</span>
        </button>`;

    if (!showSingleDayAsAll) {
        const dayTabsHtml = travelData.days.map((day, index) => {
            ensureDayPlanBranchState(day);
            const planCodes = getDayPlanCodes(day);
            if (planCodes.length > 1) {
                return planCodes.map((planCode) => {
                    const isActive = index === currentDayIndex && getDayActivePlan(day) === planCode;
                    const activeClass = isActive ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
                    return `
                        <button type="button" class="select-day-btn flex flex-col items-center justify-center px-4 py-3 rounded-t-lg transition-colors ${activeClass}" data-day-index="${index}" data-day-plan="${planCode}">
                            <span class="text-sm font-semibold uppercase">${index + 1}일차 플랜${planCode}</span>
                        </button>`;
                }).join('');
            }

            const isActive = index === currentDayIndex;
            const activeClass = isActive ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
            return `
            <button type="button" class="select-day-btn flex flex-col items-center justify-center px-6 py-3 rounded-t-lg transition-colors ${activeClass}" data-day-index="${index}" data-day-plan="A">
                <span class="text-base font-semibold uppercase">${index + 1}일차</span>
            </button>`;
        }).join('');
        tabsHtml += dayTabsHtml;
    }
    tabsEl.innerHTML = tabsHtml;

    // ✅ Phase 5.6 Step 3-Final: addEventListener 바인딩
    tabsEl.querySelectorAll('.select-day-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dayIndex = parseInt(btn.dataset.dayIndex);
            const dayPlan = btn.dataset.dayPlan || null;
            if (typeof window.selectDay === 'function') window.selectDay(dayIndex, dayPlan);
        });
    });

    const listEl = document.getElementById('timeline-list'); if (!listEl) return;
    let html = '';
    const showSortButton = !isReadOnlyMode && Boolean(window.isGlobalEditMode);
    if (currentDayIndex === -1 || showSingleDayAsAll) {
        const daysHtml = travelData.days.map((day, dayIdx) => {
            return renderDaySection(day, dayIdx, isSingleDay, 'A');
        }).join('');
        html += daysHtml;
    } else {
        const currentTimeline = travelData.days[currentDayIndex]?.timeline || [];
        const day = travelData.days[currentDayIndex];
        const activePlan = getDayActivePlan(day);
        const dayPlanSuffix = hasDayAlternativePlans(day) ? ` 플랜${activePlan}` : '';
        const showPlanManagerButton = showSortButton;
        if (currentTimeline.length > 0 && day) {
            html += `
                <div class="timeline-day-section mb-8">
                    ${showSortButton ? `<div class="timeline-day-actions grid grid-cols-2 gap-2 mb-2 w-full">
                        <button type="button" class="timeline-day-action-btn open-sort-method-btn h-9 w-full rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-1" title="일정 정렬" data-day-idx="${currentDayIndex}">
                            <span class="material-symbols-outlined text-base">sort</span>
                            <span class="text-xs font-bold">정렬</span>
                        </button>
                        ${showPlanManagerButton ? `<button type="button" class="timeline-day-action-btn open-day-plan-manager-btn h-9 w-full rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition-colors shadow-sm flex items-center justify-center gap-1" title="일차 플랜 관리" data-day-idx="${currentDayIndex}">
                            <span class="material-symbols-outlined text-base">library_add</span>
                            <span class="text-xs font-bold">플랜</span>
                        </button>` : ''}
                    </div>` : ''}
                    <div class="timeline-day-header flex items-center gap-4 mb-4">
                        <div class="timeline-day-badge bg-primary/10 text-primary min-w-[78px] px-2 py-1 rounded-lg font-bold text-sm flex items-center justify-center shrink-0">${currentDayIndex + 1}일차${dayPlanSuffix}</div>
                        <div class="timeline-day-divider h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                        <div class="timeline-day-date text-xs text-gray-400">${day.date}</div>
                    </div>
                    <div class="timeline-day-list flex flex-col">`;
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

        const itemsHtml = groupedItems.map((group, gIdx) => {
            const isLast = gIdx === groupedItems.length - 1;
            const isFirst = gIdx === 0;
            return renderFunc(group.item, group.index, currentDayIndex, isLast, isFirst, group.attachedMemos);
        }).join('');
        html += itemsHtml;
        if (currentTimeline.length > 0) {
            html += `
                <div ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="timelineContainerDrop(event, ${currentDayIndex})" class="timeline-drop-zone h-8 relative mx-6" style="z-index: 1;">
                    <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-[${Z_INDEX.MODAL_INNER}] shadow-sm pointer-events-none"></div>
                </div>`;
        }
        if (currentTimeline.length === 0) {
            html += `
            <div class="timeline-empty-state col-span-2 flex flex-col items-center justify-center py-10 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">edit_calendar</span>
                <p class="text-sm">아직 일정이 없습니다.${!isReadOnlyMode ? ' 첫 일정을 추가해보세요!' : ''}</p>
                ${!isReadOnlyMode ? `<button type="button" onclick="openAddModal(-1, ${currentDayIndex})" class="timeline-empty-cta mt-4 flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-bold shadow-lg hover:bg-orange-500 transition-colors transform hover:scale-105">
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

    // ✅ 정렬 버튼 바인딩 (렌더 후): 기존 정렬 선택 모달 오픈
    document.querySelectorAll('.open-sort-method-btn').forEach(btn => {
        btn.onclick = () => {
            const dayIdx = parseInt(btn.dataset.dayIdx, 10);
            if (Number.isNaN(dayIdx)) return;
            if (typeof window.openSortMethodModal === 'function') window.openSortMethodModal(dayIdx);
        };
    });

    document.querySelectorAll('.open-day-plan-manager-btn').forEach(btn => {
        btn.onclick = () => {
            const dayIdx = parseInt(btn.dataset.dayIdx, 10);
            if (Number.isNaN(dayIdx)) return;
            if (typeof window.openDayPlanManagerModal === 'function') window.openDayPlanManagerModal(dayIdx);
        };
    });

    document.querySelectorAll('.open-add-modal-btn').forEach(btn => {
        btn.onclick = () => {
            const dayIdx = parseInt(btn.dataset.dayIdx);
            if (typeof window.openAddModal === 'function') window.openAddModal(-1, dayIdx);
        };
    });

    // ✅ Phase 5.6 Step 3-Final: Memo timeline item 클릭 (editTimelineItem/viewTimelineItem)
    document.querySelectorAll('.memo-timeline-item').forEach(btn => {
        btn.onclick = () => {
            const memoIndex = parseInt(btn.dataset.memoIndex);
            const dayIndex = parseInt(btn.dataset.dayIndex);
            const mode = btn.dataset.clickMode;
            
            if (mode === 'edit' && typeof window.editTimelineItem === 'function') {
                window.editTimelineItem(memoIndex, dayIndex);
            } else if (mode === 'view' && typeof window.viewTimelineItem === 'function') {
                window.viewTimelineItem(memoIndex, dayIndex);
            }
        };
    });

    // [Memory Lock Button] Legacy logic removed. 
    // Button state is now managed by ui.js toggleGlobalEditMode() and is persistently visible.
}
