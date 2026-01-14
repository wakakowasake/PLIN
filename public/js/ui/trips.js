// d:\SoongSil Univ\piln\public\js\ui\trips.js

import { db } from '../firebase.js';
import { collection, query, where, getDocs, addDoc, doc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { currentUser, newTripDataTemp, defaultTravelData, setNewTripDataTemp } from '../state.js';
import { showLoading, hideLoading } from './modals.js';

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
            console.log("[Auto-Fix] Missing #trip-list element was created.");
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
                            <input type="text" id="new-trip-title" class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all" placeholder="예: 도쿄 벚꽃 여행">
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
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">어디로 떠나시나요?</label>
                            <div class="relative">
                                <span class="absolute left-4 top-3.5 text-gray-400 material-symbols-outlined">search</span>
                                <input type="text" id="new-trip-location" class="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-primary outline-none transition-all" placeholder="도시나 장소를 검색하세요">
                            </div>
                            <div class="mt-2 flex justify-end">
                                <button onclick="useManualInput('new-trip')" class="text-xs text-gray-500 hover:text-primary underline">직접 입력하기</button>
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
        console.log("[Auto-Fix] Missing #new-trip-modal was created.");
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
                    <button onclick="createNewTrip()" class="px-8 py-4 bg-primary text-white rounded-2xl font-bold shadow-xl hover:bg-orange-600 transition-all transform hover:scale-105 flex items-center gap-2">
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

            const image = plan.meta?.mapImage || 'https://placehold.co/600x400';
            const memberCount = Object.keys(plan.members || {}).length;
            
            html += `
                <div class="group bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-gray-700 relative cursor-pointer transform hover:-translate-y-1" onclick="openTrip('${id}')">
                    <div class="h-48 bg-gray-200 relative overflow-hidden">
                        <div class="absolute inset-0 bg-cover bg-center transform group-hover:scale-110 transition-transform duration-700" style="background-image: url('${image}');"></div>
                        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                        <div class="absolute top-3 right-3 bg-black/30 backdrop-blur-md text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1 border border-white/10">
                            <span class="material-symbols-outlined text-[14px]">group</span> ${memberCount}
                        </div>
                        <button onclick="event.stopPropagation(); toggleTripMenu('${id}')" class="absolute top-3 left-3 text-white/80 hover:text-white p-1.5 rounded-full hover:bg-black/30 transition-colors backdrop-blur-sm">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                        <div class="absolute bottom-4 left-4 right-4">
                            <h3 class="font-bold text-xl text-white mb-1 truncate leading-tight shadow-black drop-shadow-md">${title}</h3>
                            <p class="text-xs text-white/80 flex items-center gap-1">
                                <span class="material-symbols-outlined text-[14px]">calendar_today</span> ${dateDisplay}
                            </p>
                        </div>
                    </div>
                    
                    <div id="trip-menu-${id}" class="hidden absolute top-12 left-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-2 w-36 z-20 animate-fade-in">
                        <button onclick="event.stopPropagation(); openShareModal('${id}')" class="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors">
                            <span class="material-symbols-outlined text-base text-primary">share</span> 공유
                        </button>
                        <button onclick="event.stopPropagation(); deleteTrip('${id}')" class="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors">
                            <span class="material-symbols-outlined text-base">delete</span> 삭제
                        </button>
                    </div>
                </div>
            `;
        });

        // 새 여행 만들기 카드 추가 (리스트 맨 앞이나 뒤에)
        html = `
            <div onclick="createNewTrip()" class="group bg-gray-50 dark:bg-gray-800/50 rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 dark:border-gray-700 relative cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all flex flex-col items-center justify-center min-h-[200px]">
                <div class="w-16 h-16 rounded-full bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <span class="material-symbols-outlined text-3xl text-primary">add</span>
                </div>
                <span class="font-bold text-gray-600 dark:text-gray-300 group-hover:text-primary transition-colors">새 여행 만들기</span>
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
        if(step1) step1.classList.remove('hidden');
        
        // 입력 필드 초기화
        const inputs = modal.querySelectorAll('input');
        inputs.forEach(input => input.value = '');
    }
}

export function closeNewTripModal() {
    const modal = document.getElementById('new-trip-modal');
    if (modal) modal.classList.add('hidden');
}

export function nextWizardStep(step) {
    document.querySelectorAll('[id^="wizard-step-"]').forEach(el => el.classList.add('hidden'));
    const nextStep = document.getElementById(`wizard-step-${step}`);
    if (nextStep) nextStep.classList.remove('hidden');
    
    if (step === 2) {
        // map.js의 setupWizardAutocomplete 호출 (동적 import)
        import('../map.js').then(module => {
            if(module.setupWizardAutocomplete) module.setupWizardAutocomplete();
        });
    }
}

export async function finishNewTripWizard() {
    if (!currentUser) {
        alert("로그인이 필요합니다.");
        return;
    }

    const titleInput = document.getElementById('new-trip-title');
    const startInput = document.getElementById('new-trip-start');
    const endInput = document.getElementById('new-trip-end');
    const locationInput = document.getElementById('new-trip-location');

    if (!titleInput || !startInput || !endInput) {
        console.error("New trip wizard inputs not found. Re-initializing modal.");
        ensureNewTripModal(); // 복구 시도
        alert("입력 폼 오류가 발생했습니다. 다시 시도해주세요.");
        return;
    }

    const title = titleInput.value;
    const startDate = startInput.value;
    const endDate = endInput.value;
    const location = newTripDataTemp.locationName || (locationInput ? locationInput.value : "알 수 없는 여행지");
    
    if (!title || !startDate || !endDate) {
        alert("여행 제목과 날짜를 모두 입력해주세요.");
        return;
    }

    showLoading();

    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        const dayCountText = (diffDays === 0) ? "당일치기" : `${diffDays}박 ${diffDays + 1}일`;
        
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
                subInfo: `${location} • ${startDate} - ${endDate}`,
                mapImage: newTripDataTemp.mapImage || "https://placehold.co/600x400",
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

export async function deleteTrip(tripId) {
    if (!confirm("정말 이 여행 계획을 삭제하시겠습니까? 복구할 수 없습니다.")) return;
    
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
