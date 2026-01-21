// d:\SoongSil Univ\piln\public\js\ui\trips.js

import { db } from '../firebase.js';
import { collection, query, where, getDocs, addDoc, getDoc, doc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { currentUser, newTripDataTemp, defaultTravelData, setNewTripDataTemp } from '../state.js';
import { showLoading, hideLoading, showToast } from './modals.js';
import logger from '../logger.js';

// [Helper] 여행 목록 컨테이너가 없으면 생성
function ensureTripListContainer() {
    let listEl = document.getElementById('trip-list');
    if (!listEl || !document.body.contains(listEl)) {
        const mainView = document.getElementById('main-view');
        if (mainView) {
            // 메인 뷰 내부에 리스트 컨테이너 생성
            const container = document.createElement('div');
            container.id = "trip-list";
            container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20 animate-fade-in";

            // 제목 뒤나 적절한 위치에 삽입
            const title = document.getElementById('main-view-title');
            // [Fix] UI 깨짐 방지를 위해 mainView의 마지막에 추가하거나 명시적인 위치 사용
            mainView.appendChild(container);
            listEl = container;
            logger.debug("[Auto-Fix] Missing #trip-list element was created.");
        }
    }
    return listEl;
}

// [Helper] 새 여행 모달이 없으면 생성
function ensureNewTripModal() {
    let modal = document.getElementById('new-trip-modal');
    // 모달이 없거나 내용이 비어있으면 새로 생성
    if (!modal || modal.innerHTML.trim() === "") {
        if (modal) modal.remove(); // 기존 껍데기가 있다면 제거

        modal = document.createElement('div');
        modal.id = 'new-trip-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[9999] hidden flex items-center justify-center p-4 backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl transform transition-all">
                <div class="p-6">
                    <h3 class="text-2xl font-bold mb-6 text-gray-800 dark:text-white">새로운 여행 떠나기</h3>
                    
                    <!-- Step 1: 기본 정보 -->
                    <div id="wizard-step-1" class="space-y-4">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">여행 제목</label>
                            <input type="text" id="new-trip-title" onkeypress="if(event.key==='Enter'){event.preventDefault();nextWizardStep(2);}" class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all" placeholder="예: 도쿄 벚꽃 여행">
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">시작일</label>
                                <input type="date" id="new-trip-start" class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all">
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">종료일</label>
                                <input type="date" id="new-trip-end" class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all">
                            </div>
                        </div>
                        <div class="pt-4 flex justify-end">
                            <button onclick="nextWizardStep(2)" class="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 dark:shadow-none">다음 단계</button>
                        </div>
                    </div>

                    <!-- Step 2: 장소 설정 -->
                    <div id="wizard-step-2" class="hidden space-y-4">
                        <div>
                            <div class="flex justify-between items-center mb-1">
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300">어디로 떠나시나요?</label>
                                <button onclick="useManualInput('new-trip')" class="text-xs text-primary hover:text-orange-600 underline font-medium">직접 입력하기</button>
                            </div>
                            <div class="relative">
                                <span class="absolute left-4 top-3.5 text-gray-400 material-symbols-outlined">search</span>
                                <input type="text" id="new-trip-location" onkeypress="if(event.key==='Enter'){event.preventDefault();finishNewTripWizard();}" class="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all" placeholder="도시나 장소를 검색하세요">
                            </div>
                        </div>
                        <div class="pt-4 flex justify-between">
                            <button onclick="nextWizardStep(1)" class="px-6 py-3 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-bold transition-colors">이전</button>
                            <button onclick="finishNewTripWizard()" class="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 dark:shadow-none">여행 생성 완료!</button>
                        </div>
                    </div>
                </div>
                <button onclick="closeNewTripModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        logger.debug("[Auto-Fix] Missing #new-trip-modal was created.");
    }
    return modal;
}

export async function loadTripList(uid) {
    if (!uid) return;

    const listEl = ensureTripListContainer();
    if (!listEl) {
        console.error("Critical: Could not find or create #trip-list element.");
        return;
    }

    // [Fix] 기존에 정적으로 존재하는 '새 여행 만들기' 버튼이 있다면 숨김 처리 (중복 방지)
    const staticCreateBtn = document.querySelector('button[onclick="createNewTrip()"]:not(#trip-list *)');
    if (staticCreateBtn) staticCreateBtn.style.display = 'none';

    listEl.innerHTML = '<div class="col-span-full text-center py-12"><div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-primary"></div><p class="mt-4 text-gray-400 text-sm">여행 계획을 불러오는 중...</p></div>';

    try {
        const q = query(collection(db, "plans"), where(`members.${uid}`, ">", ""));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            listEl.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <span class="material-symbols-outlined text-6xl mb-4 text-gray-300">travel_explore</span>
                    <p class="text-xl font-bold text-gray-600 dark:text-gray-300 mb-2">아직 여행 계획이 없습니다</p>
                    <p class="text-sm mb-8">새로운 여행을 만들어보세요!</p>
                    <button onclick="createNewTrip()" class="px-6 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg hover:bg-orange-600 transition-all transform hover:scale-105 flex items-center gap-2">
                        <span class="material-symbols-outlined">add_circle</span> 새 여행 만들기
                    </button>
                </div>
            `;
            return;
        }

        let html = '';
        querySnapshot.forEach((doc) => {
            const plan = doc.data();
            const id = doc.id;
            const title = plan.meta?.title || '제목 없음';

            let dateDisplay = '날짜 미정';
            if (plan.days && plan.days.length > 0) {
                const start = plan.days[0].date;
                const end = plan.days[plan.days.length - 1].date;
                if (start && end) {
                    dateDisplay = `${start} ~ ${end}`;
                } else if (start) {
                    dateDisplay = start;
                }
            } else if (plan.meta?.subInfo) {
                dateDisplay = plan.meta.subInfo;
            }

            const image = plan.meta?.mapImage || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop';
            const memberCount = Object.keys(plan.members || {}).length;

            html += `
                <div class="group bg-white dark:bg-gray-800 rounded-sm overflow-hidden paper-shadow border border-gray-200 dark:border-gray-700 relative cursor-pointer transform transition-transform hover:-rotate-1 hover:-translate-y-1" onclick="openTrip('${id}')" oncontextmenu="event.preventDefault(); event.stopPropagation(); toggleTripMenu('${id}'); return false;">
                    <!-- Tape effect -->
                    <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-white/30 backdrop-blur-sm border border-white/40 shadow-sm rotate-[-2deg] z-20 pointer-events-none"></div>

                    <div class="h-48 bg-gray-200 relative overflow-hidden">
                        <div class="absolute inset-0 bg-cover bg-center transform group-hover:scale-110 transition-transform duration-700" style="background-image: url('${image}');"></div>
                        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                        <div class="absolute top-3 right-3 bg-black/30 backdrop-blur-md text-white text-xs px-2 py-1 rounded-sm flex items-center gap-1 border border-white/10 font-hand text-lg">
                            <span class="material-symbols-outlined text-[14px]">group</span> ${memberCount}
                        </div>
                        <button onclick="event.stopPropagation(); toggleTripMenu('${id}')" class="absolute top-3 left-3 text-white/80 hover:text-white p-1.5 rounded-full hover:bg-black/30 transition-colors backdrop-blur-sm z-30">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                        <div class="absolute bottom-4 left-4 right-4">
                            <h3 class="font-bold text-2xl font-hand text-white mb-1 truncate leading-tight shadow-black drop-shadow-md tracking-wide">${title}</h3>
                            <p class="text-sm font-hand text-white/90 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[16px]">calendar_today</span> ${dateDisplay}
                            </p>
                        </div>
                    </div>
                    
                    <div id="trip-menu-${id}" class="hidden absolute top-12 left-3 bg-white dark:bg-gray-800 rounded-sm shadow-xl border border-gray-100 dark:border-gray-700 py-2 w-36 z-30 animate-fade-in">
                        <button onclick="event.stopPropagation(); openShareModal('${id}')" class="w-full text-left px-4 py-2.5 text-lg font-hand text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                            <span class="material-symbols-outlined text-base text-primary">share</span> 공유
                        </button>
                        <button onclick="event.stopPropagation(); duplicateTrip('${id}')" class="w-full text-left px-4 py-2.5 text-lg font-hand text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                            <span class="material-symbols-outlined text-base text-blue-500">content_copy</span> 복제
                        </button>
                        <button onclick="event.stopPropagation(); deleteTrip('${id}')" class="w-full text-left px-4 py-2.5 text-lg font-hand text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors">
                            <span class="material-symbols-outlined text-base">delete</span> 삭제
                        </button>
                    </div>
                </div>
            `;
        });

        // 새 여행 만들기 카드 추가 (리스트 맨 앞이나 뒤에)
        html = `
            <div onclick="createNewTrip()" class="group bg-white dark:bg-gray-800 rounded-sm overflow-hidden paper-shadow border border-gray-200 dark:border-gray-700 relative cursor-pointer transform transition-transform hover:-rotate-1 hover:-translate-y-1 flex flex-col items-center justify-center min-h-[200px]">
                <!-- Tape effect -->
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-white/30 backdrop-blur-sm border border-white/40 shadow-sm rotate-[-2deg] z-20 pointer-events-none"></div>

                <div class="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-700 shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform border border-gray-100 dark:border-gray-600">
                    <span class="material-symbols-outlined text-3xl text-primary font-hand">add</span>
                </div>
                <span class="font-bold text-xl font-hand text-gray-600 dark:text-gray-300 group-hover:text-primary transition-colors tracking-wide">새 여행 만들기</span>
            </div>
        ` + html;

        listEl.innerHTML = html;

    } catch (e) {
        console.error("Error loading trips:", e);
        listEl.innerHTML = '<div class="col-span-full text-center text-red-500 py-8 bg-red-50 rounded-xl">여행 목록을 불러오는데 실패했습니다.<br><span class="text-xs text-gray-500">' + e.message + '</span></div>';
    }
}

export function createNewTrip() {
    setNewTripDataTemp({});
    ensureNewTripModal(); // 모달이 없으면 생성

    const modal = document.getElementById('new-trip-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.querySelectorAll('[id^="wizard-step-"]').forEach(el => el.classList.add('hidden'));
        const step1 = document.getElementById('wizard-step-1');
        if (step1) step1.classList.remove('hidden');

        // 입력 필드 초기화
        const inputs = modal.querySelectorAll('input');
        inputs.forEach(input => input.value = '');

        // 기본 날짜를 일주일 뒤로 설정
        const startInput = document.getElementById('new-trip-start');
        const endInput = document.getElementById('new-trip-end');
        if (startInput && endInput) {
            const weekLater = new Date();
            weekLater.setDate(weekLater.getDate() + 7);
            const weekLaterPlus2 = new Date(weekLater);
            weekLaterPlus2.setDate(weekLaterPlus2.getDate() + 2);

            startInput.value = weekLater.toISOString().split('T')[0];
            endInput.value = weekLaterPlus2.toISOString().split('T')[0];
        }

        // 제목 입력란에 자동 포커스
        setTimeout(() => {
            const titleInput = document.getElementById('new-trip-title');
            if (titleInput) titleInput.focus();
        }, 100);
    }
}

export function closeNewTripModal() {
    const modal = document.getElementById('new-trip-modal');
    if (modal) modal.classList.add('hidden');
}

export function nextWizardStep(step) {
    document.querySelectorAll('[id^="wizard-step-"]').forEach(el => el.classList.add('hidden'));
    const nextStep = document.getElementById(`wizard - step - ${step} `);
    if (nextStep) nextStep.classList.remove('hidden');

    if (step === 2) {
        // 장소 입력란에 자동 포커스
        setTimeout(() => {
            const locationInput = document.getElementById('new-trip-location');
            if (locationInput) locationInput.focus();
        }, 100);

        // map.js의 setupWizardAutocomplete 호출 (동적 import)
        import('../map.js').then(module => {
            if (module.setupWizardAutocomplete) module.setupWizardAutocomplete();
        });
    }
}

export async function finishNewTripWizard() {
    if (!currentUser) {
        showToast("여행을 저장하려면 로그인이 필요해요! 🔒", 'warning');
        return;
    }

    const titleInput = document.getElementById('new-trip-title');
    const startInput = document.getElementById('new-trip-start');
    const endInput = document.getElementById('new-trip-end');
    const locationInput = document.getElementById('new-trip-location');

    if (!titleInput || !startInput || !endInput) {
        console.error("New trip wizard inputs not found. Re-initializing modal.");
        ensureNewTripModal(); // 복구 시도
        showToast("입력 폼 오류가 발생했어요. 다시 시도해주세요 😢", 'error');
        return;
    }

    let title = titleInput.value.trim();
    const startDate = startInput.value;
    const endDate = endInput.value;
    const location = newTripDataTemp.locationName || (locationInput ? locationInput.value.trim() : "");

    if (!startDate || !endDate) {
        showToast("여행 날짜를 입력해주세요! ✨", 'warning');
        return;
    }

    // 제목이 비어있으면 "여행지명 + 여행"으로 자동 생성
    if (!title && location) {
        title = `${location} 여행`;
    } else if (!title) {
        showToast("여행 제목을 입력해주세요! ✨", 'warning');
        return;
    }

    showLoading();

    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const dayCountText = (diffDays === 0) ? "당일치기" : `${diffDays}박 ${diffDays + 1} 일`;

        const days = [];
        for (let i = 0; i <= diffDays; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            days.push({
                date: d.toISOString().split('T')[0],
                timeline: []
            });
        }

        const newTrip = {
            ...defaultTravelData,
            meta: {
                ...defaultTravelData.meta,
                title: title,
                dayCount: dayCountText,
                subInfo: `${location} • ${startDate} - ${endDate} `,
                mapImage: newTripDataTemp.mapImage || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop",
                lat: newTripDataTemp.lat || null,
                lng: newTripDataTemp.lng || null,
                location: location
            },
            days: days,
            members: {
                [currentUser.uid]: 'owner'
            },
            createdAt: new Date().toISOString(),
            createdBy: currentUser.uid
        };

        const docRef = await addDoc(collection(db, "plans"), newTrip);

        closeNewTripModal();

        // 생성된 여행 열기
        if (window.openTrip) window.openTrip(docRef.id);

    } catch (e) {
        console.error("Error creating trip:", e);
        alert("여행 생성 중 오류가 발생했습니다: " + e.message);
    } finally {
        hideLoading();
    }
}

export function deleteTrip(tripId) {
    window.openConfirmationModal(
        "여행 계획 삭제",
        "정말 이 여행 계획을 보내주시겠습니까? 🗑️\n삭제된 여행은 복구할 수 없습니다.",
        async () => {
            try {
                showLoading();
                await deleteDoc(doc(db, "plans", tripId));
                if (currentUser) loadTripList(currentUser.uid);
            } catch (e) {
                console.error("Error deleting trip:", e);
                alert("삭제 실패: " + e.message);
            } finally {
                hideLoading();
            }
        }
    );
}

// [Duplicate Trip Logic]

let pendingDuplicateTripId = null;
let pendingDuplicateData = null;

function ensureCopyOptionsModal() {
    let modal = document.getElementById('copy-options-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'copy-options-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[9999] hidden flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transform transition-all scale-100">
                    <div class="p-6">
                        <h3 class="text-xl font-bold mb-2 text-gray-800 dark:text-white">여행 복제하기</h3>
                        <p class="text-sm text-gray-500 mb-6">복제할 항목을 선택해주세요.</p>

                        <div class="space-y-3 mb-8">
                            <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-region" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">지역 및 날짜</span>
                                        <span class="text-xs text-gray-400">여행지 정보와 기간 설정</span>
                                    </div>
                            </label>
                            <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-places" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">일정 (장소)</span>
                                        <span class="text-xs text-gray-400">방문할 장소와 이동 수단</span>
                                    </div>
                            </label>
                            <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-memos" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">메모</span>
                                        <span class="text-xs text-gray-400">작성한 메모 사항</span>
                                    </div>
                            </label>
                            <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-budget" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">예산 및 지출</span>
                                        <span class="text-xs text-gray-400">가계부 내역 및 예산 설정</span>
                                    </div>
                            </label>
                            <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-shopping" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">쇼핑리스트</span>
                                        <span class="text-xs text-gray-400">구매할 물품 목록</span>
                                    </div>
                            </label>
                            <label class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <input type="checkbox" id="copy-opt-supplies" checked class="w-5 h-5 text-primary rounded focus:ring-primary border-gray-300">
                                    <div>
                                        <span class="block font-bold text-gray-700 dark:text-gray-200">준비물</span>
                                        <span class="text-xs text-gray-400">체크리스트</span>
                                    </div>
                            </label>
                        </div>

                        <div class="flex justify-end gap-3">
                            <button onclick="closeCopyOptionsModal()" class="px-5 py-2.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-bold transition-colors">취소</button>
                            <button onclick="executeDuplicate()" class="px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-200 dark:shadow-none flex items-center gap-2">
                                <span class="material-symbols-outlined text-sm">content_copy</span> 복제 완료
                            </button>
                        </div>
                    </div>
            </div >
                `;
        document.body.appendChild(modal);
    }
    return modal;
}

export function closeCopyOptionsModal() {
    const modal = document.getElementById('copy-options-modal');
    if (modal) {
        modal.classList.add('hidden');
        // Reset selections to default
        setTimeout(() => {
            modal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        }, 300);
    }
    pendingDuplicateTripId = null;
    pendingDuplicateData = null;
}
window.closeCopyOptionsModal = closeCopyOptionsModal;

export async function duplicateTrip(tripId) {
    try {
        showLoading();
        const docRef = doc(db, "plans", tripId);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            throw new Error("여행 계획을 찾을 수 없습니다.");
        }

        pendingDuplicateData = snapshot.data();
        pendingDuplicateTripId = tripId;

        ensureCopyOptionsModal().classList.remove('hidden');
    } catch (e) {
        console.error(e);
        alert("데이터 로드 실패: " + e.message);
    } finally {
        hideLoading();
    }
}
window.duplicateTrip = duplicateTrip;

export async function executeDuplicate() {
    if (!pendingDuplicateData) return;

    const optRegion = document.getElementById('copy-opt-region').checked;
    const optPlaces = document.getElementById('copy-opt-places').checked;
    const optMemos = document.getElementById('copy-opt-memos').checked;
    const optBudget = document.getElementById('copy-opt-budget').checked;
    const optShopping = document.getElementById('copy-opt-shopping').checked;
    const optSupplies = document.getElementById('copy-opt-supplies').checked;

    try {
        showLoading();
        const data = pendingDuplicateData;

        // 1. Meta Logic
        const newMeta = { ...data.meta };
        newMeta.title = `[복제] ${newMeta.title} `;
        if (newMeta.docId) delete newMeta.docId;

        // 지역 체크 해제 시: 위치 정보만 제거 (제목, 날짜는 유지)
        if (!optRegion) {
            newMeta.location = "";
            newMeta.subInfo = newMeta.subInfo.split('•')[1] ? `위치 미정 • ${newMeta.subInfo.split('•')[1]} ` : newMeta.subInfo;
            newMeta.lat = null;
            newMeta.lng = null;
            newMeta.mapImage = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop";
        }

        if (!optBudget) {
            newMeta.budget = 0;
        }

        // 2. Days & Timeline Logic
        const newDays = data.days.map(day => {
            const newDay = { ...day };
            if (newDay.timeline) {
                newDay.timeline = newDay.timeline.filter(item => {
                    const isMemo = item.tag === '메모';
                    if (isMemo) return optMemos;
                    return optPlaces; // 장소 (메모 아님)
                }).map(item => {
                    // Deep copy item
                    const newItem = JSON.parse(JSON.stringify(item));

                    // Budget strip
                    if (!optBudget) {
                        delete newItem.budget;
                        delete newItem.expenses;
                    }
                    return newItem;
                });
            }
            return newDay;
        });

        // 3. Construct New Trip
        const newTrip = {
            ...data,
            meta: newMeta,
            days: newDays,
            members: { [currentUser.uid]: 'owner' },
            createdAt: new Date().toISOString(),
            createdBy: currentUser.uid,
            isPublic: false
        };

        // 4. Shopping List & Checklist
        if (!optShopping) newTrip.shoppingList = [];
        if (!optSupplies) newTrip.checklist = [];

        await addDoc(collection(db, "plans"), newTrip);

        closeCopyOptionsModal();
        if (currentUser) loadTripList(currentUser.uid);

        showToast("여행이 성공적으로 복제되었습니다! 📋");

    } catch (e) {
        console.error(e);
        alert("복제 생성 실패: " + e.message);
    } finally {
        hideLoading();
    }
}
window.executeDuplicate = executeDuplicate;
