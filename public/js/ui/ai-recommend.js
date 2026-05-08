import { currentUser, insertingItemIndex, setInsertingItemIndex, setTravelData, targetDayIndex, travelData } from '../state.js';
import { closeAddModal, lockBodyScroll, unlockBodyScroll } from './modals.js';
import { fetchBackendJson } from '../services/backend/api-client.js';

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * AI 추천 모달 열기
 */
export function openAiRecommendModal() {
    // 일정 추가 모달 닫기 (인덱스 유지)
    closeAddModal(false);

    const modal = document.getElementById('ai-recommend-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    // 이전에 입력한 내용 및 결과 초기화 (필요시)
    const input = document.getElementById('ai-recommend-input');
    input.value = "";
    document.getElementById('ai-recommend-results').innerHTML = `
        <div class="flex flex-col items-center justify-center h-48 text-gray-400 text-center px-8">
            <span class="material-symbols-outlined text-5xl mb-3 opacity-20">explore</span>
            <p class="text-sm font-medium">원하는 장소의 특징이나 메뉴를 입력하면<br>AI가 최적의 장소를 찾아줍니다 ✨</p>
        </div>
    `;

    setTimeout(() => input.focus(), 100);
    lockBodyScroll();
    if (window.pushModalState) window.pushModalState();
}

/**
 * AI 추천 모달 닫기
 */
export function closeAiRecommendModal() {
    const modal = document.getElementById('ai-recommend-modal');
    if (modal) modal.classList.add('hidden');
    unlockBodyScroll();
}

/**
 * AI 에게 추천 요청
 */
export async function searchAiRecommend() {
    const input = document.getElementById('ai-recommend-input');
    const query = input.value.trim();
    if (!query) return;

    const loading = document.getElementById('ai-recommend-loading');
    const resultsArea = document.getElementById('ai-recommend-results');

    loading.classList.remove('hidden');
    resultsArea.innerHTML = '';

    try {
        // 현재 날짜의 장소들을 맥락으로 제공 (주변 검색 유도)
        const context = (travelData.days[targetDayIndex]?.timeline || [])
            .filter(item => !item.isTransit)
            .map(item => ({ title: item.title, location: item.location }));
        const tripLocation = travelData?.meta?.location || '';
        const tripSubInfo = travelData?.meta?.subInfo || '';

        const recommendations = await fetchBackendJson('/ai-recommend', {
            method: 'POST',
            body: { query, context, tripLocation, tripSubInfo }
        });
        renderAiResults(recommendations);
    } catch (err) {
        console.error("[AI Recommend] Error:", err);
        const serverMessage = err?.payload?.message || err.message || '';
        const isUsageExceeded = serverMessage.includes('초과') || err.message?.includes('403');
        const isQuotaError = serverMessage.includes('할당량') || err.message?.includes('429');
        const safeMessage = escapeHtml(isUsageExceeded ? '일일 사용량 도달' : (isQuotaError ? '잠시만 기다려주세요' : (err.message || '추천을 불러오지 못했습니다')));
        const safeServerMessage = escapeHtml(serverMessage || '요청 처리 중 오류가 발생했습니다.');

        resultsArea.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-[240px] text-center px-8">
                <div class="size-16 rounded-full ${isUsageExceeded ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500' : 'bg-red-50 dark:bg-red-900/20 text-red-500'} flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined text-4xl">${isUsageExceeded ? 'lock' : (isQuotaError ? 'hourglass_empty' : 'error')}</span>
                </div>
                <p class="text-base font-bold text-text-main dark:text-white mb-2">
                    ${safeMessage}
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    ${safeServerMessage}
                </p>
                <button onclick="searchAiRecommend()" class="mt-6 px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:brightness-110 shadow-lg shadow-primary/20 transition-all">
                    다시 시도하기
                </button>
            </div>
        `;
    } finally {
        loading.classList.add('hidden');
    }
}

/**
 * 추천 결과 렌더링
 */
function renderAiResults(list) {
    const resultsArea = document.getElementById('ai-recommend-results');
    if (!list || list.length === 0) {
        resultsArea.innerHTML = `<p class="text-gray-500 text-center py-8">결과가 없습니다.</p>`;
        return;
    }

    resultsArea.innerHTML = '';

    list.forEach((item, idx) => {
        const searchQuery = String(item?.search_query || '');
        const originalName = String(item?.name || '');
        const reason = String(item?.reason || '');

        const button = document.createElement('button');
        button.className = 'w-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 rounded-2xl hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/10 transition-all text-left flex gap-4 group animate-fade-in';
        button.style.animationDelay = `${idx * 0.1}s`;
        button.addEventListener('click', () => selectRecommendedPlace(searchQuery, originalName));

        const badge = document.createElement('div');
        badge.className = 'size-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform';
        badge.innerHTML = `<span class="font-bold text-lg">${idx + 1}</span>`;

        const textWrap = document.createElement('div');
        textWrap.className = 'flex-1 min-w-0';

        const titleEl = document.createElement('h4');
        titleEl.className = 'font-bold text-text-main dark:text-white group-hover:text-emerald-600 transition-colors truncate';
        titleEl.textContent = originalName || '추천 장소';

        const reasonEl = document.createElement('p');
        reasonEl.className = 'text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-relaxed';
        reasonEl.textContent = reason;

        const iconWrap = document.createElement('div');
        iconWrap.className = 'shrink-0 self-center';
        iconWrap.innerHTML = '<span class="material-symbols-outlined text-gray-300 group-hover:text-emerald-500 transition-colors">add_circle</span>';

        textWrap.appendChild(titleEl);
        textWrap.appendChild(reasonEl);
        button.appendChild(badge);
        button.appendChild(textWrap);
        button.appendChild(iconWrap);
        resultsArea.appendChild(button);
    });
}

/**
 * 추천된 장소 선택 시 실제 Google Place 데이터를 가져와 타임라인에 추가
 */
export async function selectRecommendedPlace(searchQuery, originalName) {
    const loading = document.getElementById('ai-recommend-loading');
    loading.classList.remove('hidden');

    try {
        // console.log(`[AI Recommend] Searching Google Maps for: ${searchQuery}`);
        const place = await findPlaceByQuery(searchQuery);

        if (!place) {
            throw new Error('Google Maps에서 해당 장소를 찾을 수 없습니다.');
        }

        // 새 일정 아이템 객체 생성
        const newItem = {
            id: 'item_' + Date.now(),
            title: place.name || originalName,
            location: place.formatted_address || place.vicinity || '',
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            place_id: place.place_id,
            time: "12:00", // 24시간제 기본값
            duration: 30, // 파란색 태그(잔류 시간)가 표시되도록 설정
            tag: '기타',
            icon: 'place',
            isTransit: false,
            note: ""
        };

        // 타임라인에 삽입
        const timeline = travelData.days[targetDayIndex].timeline;
        if (insertingItemIndex !== null && typeof insertingItemIndex === 'number') {
            timeline.splice(insertingItemIndex + 1, 0, newItem);
        } else {
            timeline.push(newItem);
        }

        // 상태 업데이트 및 UI 반영
        setTravelData(travelData);
        setInsertingItemIndex(null); // 추가 위치 인덱스 초기화

        closeAiRecommendModal();

        if (window.renderItinerary) window.renderItinerary();
        if (window.autoSave) window.autoSave();
        if (window.showToast) window.showToast(`'${newItem.title}' 장소가 일정에 추가되었습니다.`, 'success');

    } catch (err) {
        console.error("[AI Recommend] Place Fetch Error:", err);
        const errorMsg = err.message || '장소 정보를 가져오는데 실패했습니다.';
        if (window.showToast) window.showToast(errorMsg, 'error');
    } finally {
        loading.classList.add('hidden');
    }
}

/**
 * Google Maps Places Service를 이용해 검색어로 장소 상세 정보 획득
 * findPlaceFromQuery 대신 textSearch를 사용하여 더 정확한 검색 결과 유도
 */
function findPlaceByQuery(query) {
    return new Promise((resolve) => {
        const service = new google.maps.places.PlacesService(document.createElement('div'));

        // 1순위: findPlaceFromQuery (가장 정확한 상호명 검색)
        service.findPlaceFromQuery({
            query: query,
            fields: ['name', 'geometry', 'formatted_address', 'place_id']
        }, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results && results[0]) {
                resolve(results[0]);
            } else {
                // 2순위: textSearch (조금 더 넓은 범위 검색)
                service.textSearch({ query: query }, (textResults, textStatus) => {
                    if (textStatus === google.maps.places.PlacesServiceStatus.OK && textResults && textResults[0]) {
                        resolve(textResults[0]);
                    } else {
                        resolve(null);
                    }
                });
            }
        });
    });
}

// Global scope에 함수 노출 (HTML onclick 대응)
window.openAiRecommendModal = openAiRecommendModal;
window.closeAiRecommendModal = closeAiRecommendModal;
window.searchAiRecommend = searchAiRecommend;
window.selectRecommendedPlace = selectRecommendedPlace;

// Enter 키로 검색 지원
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'ai-recommend-input') {
        searchAiRecommend();
    }
});
