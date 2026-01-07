import { db, auth, provider, firebaseReady } from './firebase.js';
import {
    travelData, currentDayIndex, currentTripId, newTripDataTemp, pendingTransitCallback,
    editingItemIndex, viewingItemIndex, currentTripUnsubscribe, isEditing, currentUser,
    setTravelData, setCurrentDayIndex, setCurrentTripId, setNewTripDataTemp, targetDayIndex, setTargetDayIndex,
    setPendingTransitCallback, setEditingItemIndex, setViewingItemIndex,
    setCurrentTripUnsubscribe, setIsEditing, setCurrentUser,
    insertingItemIndex, isEditingFromDetail, setInsertingItemIndex, setIsEditingFromDetail
} from './state.js';
export {
    travelData, currentDayIndex, currentTripId, newTripDataTemp, pendingTransitCallback,
    editingItemIndex, viewingItemIndex, currentTripUnsubscribe, isEditing, currentUser,
    setTravelData, setCurrentDayIndex, setCurrentTripId, setNewTripDataTemp, targetDayIndex, setTargetDayIndex,
    setPendingTransitCallback, setEditingItemIndex, setViewingItemIndex,
    setCurrentTripUnsubscribe, setIsEditing, setCurrentUser,
    insertingItemIndex, isEditingFromDetail, setInsertingItemIndex, setIsEditingFromDetail
};
import { setupWizardAutocomplete, fetchWeather, map as googleMap, mapMarker, setSearchMode, searchMode } from './map.js';
import {
    collection, doc, getDoc, setDoc, addDoc, getDocs, deleteDoc, updateDoc,
    query, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signInWithPopup, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { parseTimeStr, formatTimeStr, parseDurationStr, formatDuration, minutesTo24Hour, calculateStraightDistance } from './ui-utils.js';
import * as Transit from './ui-transit.js';

// [Configuration] Google Maps API Key 및 백엔드 URL
const BACKEND_URL = "https://us-central1-plin-db93d.cloudfunctions.net/api";

// API 키를 서버에서 로드
let GOOGLE_MAPS_API_KEY = null;
let googleMapsLoaded = null; // Promise for Google Maps loading

async function loadApiKeys() {
    try {
        const response = await fetch(`${BACKEND_URL}/config`);
        const config = await response.json();
        GOOGLE_MAPS_API_KEY = config.googleMapsApiKey;
        
        // Google Maps API가 이미 로드되었는지 확인
        const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
        
        if (window.google && window.google.maps) {
            // 이미 완전히 로드됨
            googleMapsLoaded = Promise.resolve();
        } else if (existingScript) {
            // 스크립트는 있지만 아직 로드 중
            googleMapsLoaded = new Promise((resolve) => {
                existingScript.addEventListener('load', resolve);
            });
        } else if (GOOGLE_MAPS_API_KEY) {
            // 스크립트 추가 필요
            googleMapsLoaded = new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`;
                script.async = true;
                script.defer = true;
                script.onload = () => resolve();
                document.head.appendChild(script);
            });
        }
    } catch (error) {
        console.error("Failed to load API keys:", error);
    }
}

// 페이지 로드 시 API 키 로드
await loadApiKeys();

export { GOOGLE_MAPS_API_KEY, googleMapsLoaded };

// [Loading Overlay Functions]
export function showLoading() {
    document.getElementById('loading-overlay')?.classList.remove('hidden');
}

export function hideLoading() {
    document.getElementById('loading-overlay')?.classList.add('hidden');
}

window.showLoading = showLoading;
window.hideLoading = hideLoading;

// [Add Selection Modal Logic]
let draggingIndex = null;

export function openAddModal(index, dayIndex = null) {
    setInsertingItemIndex(Number(index)); // [Fix] 숫자로 명시적 변환
    // dayIndex가 전달되면 해당 날짜를 타겟으로, 아니면 현재 보고 있는 날짜(또는 타겟 날짜) 사용
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }
    document.getElementById('add-selection-modal').classList.remove('hidden');
}

export function closeAddModal() {
    document.getElementById('add-selection-modal').classList.add('hidden');
    setInsertingItemIndex(null);
}

export function selectAddType(type, subType) {
    if (type === 'activity') {
        addTimelineItem(insertingItemIndex, targetDayIndex);
    } else if (type === 'copy') {
        openCopyItemModal();
        return; // 모달 교체이므로 여기서 리턴
    } else if (type === 'transit') {
        Transit.addTransitItem(insertingItemIndex, subType, targetDayIndex);
    } else if (type === 'note') {
        addNoteItem(insertingItemIndex);
    }
    // 모달 닫기는 각 함수 내부나 여기서 처리. 
    // addTimelineItem은 모달을 교체하므로 여기서 닫아줌.
    document.getElementById('add-selection-modal').classList.add('hidden');
}

// [Copy Item Modal Logic]
export function openCopyItemModal() {
    document.getElementById('add-selection-modal').classList.add('hidden');
    const modal = document.getElementById('copy-item-modal');
    const list = document.getElementById('copy-item-list');
    list.innerHTML = "";

    let hasItems = false;

    travelData.days.forEach((day, dIdx) => {
        if (!day.timeline || day.timeline.length === 0) return;
        hasItems = true;

        const header = document.createElement('div');
        header.className = "sticky top-0 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-xs font-bold text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700 z-10";
        header.innerText = `${dIdx + 1}일차 • ${day.date}`;
        list.appendChild(header);

        day.timeline.forEach((item, iIdx) => {
            const btn = document.createElement('button');
            btn.className = "w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 flex items-center gap-3 transition-colors group";
            btn.onclick = () => copyItemToCurrent(dIdx, iIdx);
            
            let iconColor = "text-gray-400";
            if (item.isTransit) iconColor = "text-blue-400";
            else if (item.tag === '메모') iconColor = "text-yellow-400";
            else iconColor = "text-primary";

            btn.innerHTML = `
                <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-lg ${iconColor}">${item.icon}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-text-main dark:text-white truncate">${item.title}</p>
                    <p class="text-xs text-gray-400 truncate">${item.location || item.time}</p>
                </div>
                <span class="material-symbols-outlined text-gray-300 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all">add_circle</span>
            `;
            list.appendChild(btn);
        });
    });

    if (!hasItems) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">content_paste_off</span>
                <p class="text-sm">복사할 일정이 없습니다.</p>
            </div>
        `;
    }

    modal.classList.remove('hidden');
}

export function closeCopyItemModal() {
    document.getElementById('copy-item-modal').classList.add('hidden');
}

export function copyItemToCurrent(dIdx, iIdx) {
    const sourceItem = travelData.days[dIdx].timeline[iIdx];
    // Deep copy
    const newItem = JSON.parse(JSON.stringify(sourceItem));
    
    // 타임라인에 추가
    const timeline = travelData.days[targetDayIndex].timeline;
    if (typeof insertingItemIndex === 'number' && insertingItemIndex !== null) {
        timeline.splice(insertingItemIndex + 1, 0, newItem);
    } else {
        timeline.push(newItem);
    }

    reorderTimeline(targetDayIndex);
    closeCopyItemModal();
    autoSave();
}

// [Main View] 여행 목록 불러오기
export async function loadTripList(uid) {
    const listContainer = document.getElementById('trip-list-container');
    listContainer.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500">로딩 중...</div>';

    try {
        const q = query(collection(db, "plans"), where(`members.${uid}`, "in", ["owner", "editor"]));
        const querySnapshot = await getDocs(q);
        
        listContainer.innerHTML = '';

        if (querySnapshot.empty) {
            listContainer.innerHTML = `
                <div class="col-span-full text-center py-20 bg-white dark:bg-card-dark rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                    <span class="material-symbols-outlined text-6xl text-gray-300 mb-4">flight_off</span>
                    <p class="text-xl font-bold text-gray-500">아직 등록된 여행이 없습니다.</p>
                    <p class="text-gray-400 mb-6">새로운 여행 계획을 만들어 보세요!</p>
                    <button onclick="createNewTrip()" class="text-primary font-bold hover:underline">새 여행 만들기</button>
                </div>
            `;
            return;
        }

        const trips = [];
        querySnapshot.forEach((doc) => {
            trips.push({ id: doc.id, ...doc.data() });
        });

        // 여행 시작일 기준 내림차순 정렬 (최신 날짜가 먼저)
        trips.sort((a, b) => {
            const dateA = (a.days && a.days[0]) ? a.days[0].date : "";
            const dateB = (b.days && b.days[0]) ? b.days[0].date : "";
            if (dateA < dateB) return 1;
            if (dateA > dateB) return -1;
            return 0;
        });

        trips.forEach((data) => {
            const div = document.createElement('div');
            // overflow-hidden 제거 (드롭다운 메뉴 표시를 위해)
            div.className = "bg-white dark:bg-card-dark rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-all cursor-pointer group relative";
            div.onclick = () => openTrip(data.id);
            
            // [Fix] Replace broken placeholder URLs from legacy data
            let mapImg = data.meta.mapImage || 'https://placehold.co/600x400';
            if (mapImg.includes('via.placeholder.com')) mapImg = 'https://placehold.co/600x400';

            // 여행 상태 판단
            const status = getTripStatus(data);
            const statusBadges = {
                'upcoming': { text: '여행 전', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
                'ongoing': { text: '여행 중', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
                'completed': { text: '여행 후', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' }
            };
            const badge = statusBadges[status];

            div.innerHTML = `
                <div class="h-40 bg-cover bg-center relative rounded-t-xl overflow-hidden" style="background-image: url('${mapImg}');">
                    <div class="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors"></div>
                    <div class="absolute top-2 left-2">
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${badge.color}">${badge.text}</span>
                    </div>
                </div>
                <div class="absolute top-2 right-2 z-20">
                    <button type="button" onclick="event.stopPropagation(); toggleTripMenu(event, '${data.id}')" class="bg-white/80 hover:bg-white text-gray-600 p-1.5 rounded-full backdrop-blur-sm transition-colors shadow-sm">
                        <span class="material-symbols-outlined text-lg">more_vert</span>
                    </button>
                    <div id="trip-menu-${data.id}" class="hidden absolute right-0 top-full mt-1 w-32 bg-white dark:bg-card-dark rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-30 overflow-hidden">
                        <button onclick="event.stopPropagation(); openShareModal('${data.id}')" class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2">
                            <span class="material-symbols-outlined text-base">group_add</span> 공유
                        </button>
                        <button onclick="event.stopPropagation(); deleteTrip('${data.id}')" class="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                            <span class="material-symbols-outlined text-base">delete</span> 삭제
                        </button>
                    </div>
                </div>
                <div class="p-5">
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-bold text-lg text-text-main dark:text-white line-clamp-1">${data.meta.title}</h3>
                    </div>
                    <p class="text-sm text-text-muted dark:text-gray-400 mb-4 line-clamp-1">${data.meta.subInfo}</p>
                    <div class="flex items-center justify-between text-xs font-medium text-gray-500">
                        <span class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">${data.meta.dayCount}</span>
                        <span>${data.meta.budget}</span>
                    </div>
                </div>
            `;
            listContainer.appendChild(div);
        });
    } catch (error) {
        console.error("Error loading list:", error);
        if (error.code === 'permission-denied') {
            listContainer.innerHTML = '<div class="col-span-full text-center text-red-500 py-10">데이터 접근 권한이 없습니다.<br>Firebase Console > Firestore > 규칙(Rules)을 설정해주세요.</div>';
        } else {
            listContainer.innerHTML = '<div class="col-span-full text-center text-red-500">목록을 불러오는데 실패했습니다.</div>';
        }
    }
}

// 여행 상태 판단 (여행 전/중/후)
function getTripStatus(tripData) {
    if (!tripData.days || tripData.days.length === 0) return 'upcoming';
    
    const firstDay = tripData.days[0].date;
    const lastDay = tripData.days[tripData.days.length - 1].date;
    const today = new Date().toISOString().split('T')[0];
    
    if (today < firstDay) return 'upcoming'; // 여행 전
    if (today > lastDay) return 'completed'; // 여행 후
    return 'ongoing'; // 여행 중
}

// 여행 카드 메뉴 토글
export function toggleTripMenu(e, tripId) {
    // 다른 열린 메뉴들 닫기
    document.querySelectorAll('[id^="trip-menu-"]').forEach(el => {
        if (el.id !== `trip-menu-${tripId}`) el.classList.add('hidden');
    });
    
    const menu = document.getElementById(`trip-menu-${tripId}`);
    if (menu) menu.classList.toggle('hidden');
}

// [Detail View] 특정 여행 데이터 불러오기
export async function openTrip(tripId) {
    if (!currentUser) return;
    setCurrentTripId(tripId);

    // 다른 여행을 열 때 이전 리스너 구독 해제
    if (currentTripUnsubscribe) {
        currentTripUnsubscribe();
    }

    try {
        const docRef = doc(db, "plans", tripId);
        
        // 실시간 리스너 연결
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setTravelData(docSnap.data());
                
                // 데이터 마이그레이션 (안전장치)
                if (travelData.timeline && !travelData.days) {
                    travelData.days = [{
                        date: "Day 1",
                        timeline: travelData.timeline
                    }];
                    delete travelData.timeline;
                }

                if (!travelData.shoppingList) travelData.shoppingList = [];
                if (!travelData.checklist) travelData.checklist = [];

                if (travelData.meta.lat && travelData.meta.lng) {
                    const firstDate = travelData.days && travelData.days[0] ? travelData.days[0].date : null;
                    fetchWeather(travelData.meta.lat, travelData.meta.lng, firstDate);
                }
                setTargetDayIndex(currentDayIndex === -1 ? 0 : currentDayIndex);
                renderItinerary();
                
                // 여행 상태와 관계없이 항상 detail-view 표시
                const mainView = document.getElementById('main-view');
                const detailView = document.getElementById('detail-view');
                
                mainView.classList.add('hidden');
                detailView.classList.remove('hidden');
                document.getElementById('back-btn').classList.remove('hidden');
                document.getElementById('share-btn').classList.remove('hidden');
                
                window.scrollTo(0, 0);
            } else {
                alert("여행 정보를 찾을 수 없거나 삭제되었습니다.");
                backToMain();
            }
        });
        setCurrentTripUnsubscribe(unsubscribe);

    } catch (error) {
        console.error("Error opening trip:", error);
    }
}

// [Main View] 새 여행 만들기 (Wizard)
export function createNewTrip() {
    if (!currentUser) {
        alert("로그인이 필요합니다.");
        login();
        return;
    }
    
    // Reset Wizard
    document.getElementById('new-trip-location').value = "";
    document.getElementById('new-trip-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('new-trip-end').value = new Date().toISOString().split('T')[0];
    
    setNewTripDataTemp({
        locationName: "",
        lat: null,
        lng: null,
        address: "",
        mapImage: null
    });

    // Show Step 1
    document.getElementById('new-trip-modal').classList.remove('hidden');
    document.getElementById('wizard-step-1').classList.remove('hidden');
    document.getElementById('wizard-step-2').classList.add('hidden');
    
    // Setup Autocomplete for Wizard (Google Maps 로드 대기)
    if (googleMapsLoaded) {
        googleMapsLoaded.then(() => setupWizardAutocomplete());
    }
    
    // 엔터 키 네비게이션 설정
    const locInput = document.getElementById('new-trip-location');
    locInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            // 구글 맵 자동완성 선택 처리를 위해 잠시 대기 후 이동
            setTimeout(() => nextWizardStep(2), 150);
        }
    };

    const startInput = document.getElementById('new-trip-start');
    const endInput = document.getElementById('new-trip-end');
    const handleDateEnter = (e) => {
        if (e.key === 'Enter') finishNewTripWizard();
    };
    startInput.onkeydown = handleDateEnter;
    endInput.onkeydown = handleDateEnter;

    setTimeout(() => document.getElementById('new-trip-location').focus(), 100);
}

export function closeNewTripModal() {
    document.getElementById('new-trip-modal').classList.add('hidden');
}

export function nextWizardStep(step) {
    if (step === 2) {
        const input = document.getElementById('new-trip-location');
        // Validate Step 1
        if (!newTripDataTemp.locationName && !input.value) {
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 300);
            input.focus();
            return;
        }
        // If user typed but didn't select from dropdown, just use the text
        if (!newTripDataTemp.locationName) {
            newTripDataTemp.locationName = input.value;
        }
        
        document.getElementById('wizard-step-1').classList.add('hidden');
        document.getElementById('wizard-step-2').classList.remove('hidden');
        setTimeout(() => document.getElementById('new-trip-start').focus(), 100);
    } else if (step === 1) {
        document.getElementById('wizard-step-2').classList.add('hidden');
        document.getElementById('wizard-step-1').classList.remove('hidden');
    }
}

export async function finishNewTripWizard() {
    const startDateStr = document.getElementById('new-trip-start').value;
    const endDateStr = document.getElementById('new-trip-end').value;
    
    if (!startDateStr || !endDateStr) {
        alert("날짜를 선택해주세요.");
        return;
    }
    
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    
    if (end < start) {
        alert("종료일은 시작일보다 빠를 수 없습니다.");
        return;
    }
    
    // Calculate Duration
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    let durationText = "";
    if (diffDays === 0) {
        durationText = "당일치기";
    } else {
        durationText = `${diffDays}박 ${diffDays + 1}일`;
    }
    
    // Format Date for SubInfo
    const dateFormatted = `${start.getFullYear()}년 ${start.getMonth()+1}월 ${start.getDate()}일`;

    // Create Data
    const newTripData = JSON.parse(JSON.stringify(travelData)); // Use current structure as template
    // Reset to defaults manually or import defaultTravelData if needed. 
    // For now, let's assume travelData structure is correct.
    newTripData.meta.title = `${newTripDataTemp.locationName} 여행`;
    newTripData.meta.subInfo = `${newTripDataTemp.locationName} • ${dateFormatted}`;
    newTripData.meta.dayCount = durationText;
    newTripData.meta.budget = "₩0";
    newTripData.meta.note = "첫 일정을 계획해보세요!";
    
    // [Fix] 새 여행 생성 시 쇼핑/준비물 리스트 초기화 (이전 데이터 복사 방지)
    newTripData.shoppingList = [];
    newTripData.checklist = [];
    
    newTripData.members = {
        [currentUser.uid]: 'owner'
    };
    
    if (newTripDataTemp.mapImage) {
        newTripData.meta.mapImage = newTripDataTemp.mapImage;
        newTripData.meta.defaultMapImage = newTripDataTemp.mapImage;
    }

    if (newTripDataTemp.lat && newTripDataTemp.lng) {
        newTripData.meta.lat = newTripDataTemp.lat;
        newTripData.meta.lng = newTripDataTemp.lng;
    }
    
    // Initialize Days based on duration
    const totalDays = diffDays + 1;
    newTripData.days = [];
    for(let i=0; i<totalDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        
        const timeline = [];
        // 첫째 날 맨 처음에 '집에서 출발' 또는 사용자의 집 주소 추가
        if (i === 0) {
            // [Added] 사용자가 등록한 집 주소가 있으면 그것을 첫 번째 아이템으로 추가
            const homeItem = {
                time: "오전 09:00",
                title: currentUser.homeAddress ? "집에서 출발" : "집에서 출발",
                location: currentUser.homeAddress || "집",
                icon: "home",
                tag: "출발",
                image: null,
                isTransit: false,
                note: "",
                lat: currentUser.homeLat || null,
                lng: currentUser.homeLng || null,
                duration: 0  // [Added] 첫 번째 장소는 바로이동(0분)이 기본
            };
            timeline.push(homeItem);
        }

        newTripData.days.push({
            date: dateStr,
            timeline: timeline
        });
    }

    try {
        const docRef = await addDoc(collection(db, "plans"), newTripData);
        closeNewTripModal();
        openTrip(docRef.id);
    } catch (e) {
        console.error("Error creating trip:", e);
        alert("여행 생성 실패");
    }
}

// [Main View] 여행 삭제
let tripIdToDelete = null;

export function deleteTrip(tripId) {
    tripIdToDelete = tripId;
    // 메뉴 닫기
    document.querySelectorAll('[id^="trip-menu-"]').forEach(el => el.classList.add('hidden'));
    document.getElementById('delete-trip-modal').classList.remove('hidden');
}

export function closeDeleteTripModal() {
    document.getElementById('delete-trip-modal').classList.add('hidden');
    tripIdToDelete = null;
}

export async function confirmDeleteTrip() {
    if (!tripIdToDelete) return;

    try {
        const planRef = doc(db, "plans", tripIdToDelete);
        // 권한 체크는 Firestore 규칙이나 UI 필터링에 의존 (여기서는 간단히 삭제 시도)
        await deleteDoc(planRef);
        
        loadTripList(currentUser.uid);
        closeDeleteTripModal();
    } catch (e) {
        console.error("Delete failed:", e);
        alert("삭제 실패");
    }
}

// [Navigation] 메인으로 돌아가기
export function backToMain() {
    // 실시간 리스너 구독 해제
    if (currentTripUnsubscribe) {
        currentTripUnsubscribe();
        setCurrentTripUnsubscribe(null);
    }

    document.getElementById('detail-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    document.getElementById('back-btn').classList.add('hidden');
    document.getElementById('share-btn').classList.add('hidden');
    
    setCurrentTripId(null);
    if (currentUser) loadTripList(currentUser.uid);
}
// [Memory Items] 추억 관련 글로벌 변수
let memoryModalItemIndex = null;
let memoryModalDayIndex = null;
let pendingMemoryPhoto = null;

export function addMemoryItem(itemIndex, dayIndex = currentDayIndex) {
    memoryModalItemIndex = itemIndex;
    memoryModalDayIndex = dayIndex;
    
    const modal = document.getElementById('memory-modal');
    if (!modal) return;
    
    // 입력 필드 초기화
    document.getElementById('memory-photo-input').value = '';
    document.getElementById('memory-comment').value = '';
    
    // 사진 미리보기 초기화
    const placeholder = document.getElementById('memory-photo-placeholder');
    const img = document.getElementById('memory-photo-img');
    const clearBtn = document.getElementById('memory-photo-clear');
    if (placeholder) placeholder.classList.remove('hidden');
    if (img) img.classList.add('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
    
    pendingMemoryPhoto = null;
    
    modal.classList.remove('hidden');
}

export function closeMemoryModal() {
    const modal = document.getElementById('memory-modal');
    if (modal) modal.classList.add('hidden');
    memoryModalItemIndex = null;
    memoryModalDayIndex = null;
    pendingMemoryPhoto = null;
}

export function clearMemoryPhoto() {
    pendingMemoryPhoto = null;
    document.getElementById('memory-photo-input').value = '';
    const placeholder = document.getElementById('memory-photo-placeholder');
    const img = document.getElementById('memory-photo-img');
    const clearBtn = document.getElementById('memory-photo-clear');
    if (placeholder) placeholder.classList.remove('hidden');
    if (img) img.classList.add('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
}

export function handleMemoryPhotoChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 이미지가 아니면 에러
    if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 선택할 수 있습니다.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Canvas로 이미지 리사이즈 및 압축
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 최대 너비/높이 설정 (1200px)
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            
            let width = img.width;
            let height = img.height;
            
            // 비율 유지하며 리사이즈
            if (width > height) {
                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width = Math.round((width * MAX_HEIGHT) / height);
                    height = MAX_HEIGHT;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // 이미지 그리기
            ctx.drawImage(img, 0, 0, width, height);
            
            // JPEG로 압축 (품질 0.85)
            const compressedDataURL = canvas.toDataURL('image/jpeg', 0.85);
            
            // 미리보기 업데이트
            const placeholder = document.getElementById('memory-photo-placeholder');
            const imgElement = document.getElementById('memory-photo-img');
            const clearBtn = document.getElementById('memory-photo-clear');
            
            if (placeholder) placeholder.classList.add('hidden');
            if (imgElement) {
                imgElement.src = compressedDataURL;
                imgElement.classList.remove('hidden');
            }
            if (clearBtn) clearBtn.classList.remove('hidden');
            
            pendingMemoryPhoto = compressedDataURL;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

export async function saveMemoryItem() {
    const comment = document.getElementById('memory-comment').value.trim();
    
    if (!comment && !pendingMemoryPhoto) {
        alert('최소한 코멘트 또는 사진 중 하나는 입력해주세요.');
        return;
    }
    
    if (memoryModalItemIndex === null || memoryModalDayIndex === null) return;
    
    try {
        // timeline item에 memories 배열이 없으면 생성
        if (!travelData.days[memoryModalDayIndex].timeline[memoryModalItemIndex].memories) {
            travelData.days[memoryModalDayIndex].timeline[memoryModalItemIndex].memories = [];
        }
        
        let photoUrl = null;
        
        // 사진이 있으면 Cloud Functions를 통해 업로드
        if (pendingMemoryPhoto) {
            try {
                // 고유한 파일명 생성
                const timestamp = Date.now();
                const fileName = `memory_${memoryModalDayIndex}_${memoryModalItemIndex}_${timestamp}.jpg`;
                
                // Cloud Functions 엔드포인트를 통해 업로드
                const response = await fetch(`${BACKEND_URL}/upload-memory`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        base64Data: pendingMemoryPhoto,
                        fileName: fileName,
                        tripId: currentTripId
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '업로드 실패');
                }

                const result = await response.json();
                photoUrl = result.url;
            } catch (error) {
                console.error("사진 업로드 실패:", error);
                alert('사진 업로드에 실패했습니다: ' + error.message);
                return;
            }
        }
        
        const newMemory = {
            comment: comment,
            hasPhoto: photoUrl ? true : false,
            photoUrl: photoUrl,
            createdAt: new Date().toISOString()
        };
        
        travelData.days[memoryModalDayIndex].timeline[memoryModalItemIndex].memories.push(newMemory);
        
        // Firestore 업데이트
        const docRef = doc(db, "plans", currentTripId);
        await updateDoc(docRef, {
            days: travelData.days
        });
        
        closeMemoryModal();
        renderItinerary();
    } catch (error) {
        console.error("추억 저장 실패:", error);
        alert('추억 저장에 실패했습니다: ' + error.message);
    }
}

export function deleteMemory(itemIndex, dayIndex, memoryIndex) {
    if (!confirm('이 추억을 삭제하시겠습니까?')) return;
    
    if (travelData.days[dayIndex].timeline[itemIndex].memories && 
        travelData.days[dayIndex].timeline[itemIndex].memories[memoryIndex]) {
        travelData.days[dayIndex].timeline[itemIndex].memories.splice(memoryIndex, 1);
        
        try {
            const docRef = doc(db, "plans", currentTripId);
            updateDoc(docRef, {
                days: travelData.days
            }).then(() => {
                renderItinerary();
            });
        } catch (error) {
            console.error("추억 삭제 실패:", error);
            alert('추억 삭제에 실패했습니다.');
        }
    }
}

// 추억 잠금/해제 토글
export async function toggleMemoryLock() {
    if (!travelData.meta) travelData.meta = {};
    travelData.meta.memoryLocked = !travelData.meta.memoryLocked;
    
    try {
        const docRef = doc(db, "plans", currentTripId);
        await updateDoc(docRef, {
            'meta.memoryLocked': travelData.meta.memoryLocked
        });
        
        renderItinerary();
    } catch (error) {
        console.error("추억 잠금 상태 변경 실패:", error);
        alert('상태 변경에 실패했습니다.');
    }
}


// Google Login
export async function login() {
    try {
        await firebaseReady; // Firebase가 초기화될 때까지 대기
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("로그인 실패", error);
        alert("로그인 실패: " + error.message);
    }
}

// Logout
export async function logout() {
    try { await firebaseReady; await signOut(auth); closeLogoutModal(); } catch (error) { console.error("로그아웃 실패", error); }
}

export function openLogoutModal() {
    document.getElementById('logout-modal').classList.remove('hidden');
}

export function closeLogoutModal() {
    document.getElementById('logout-modal').classList.add('hidden');
}

export function confirmLogout() {
    openLogoutModal();
}

// 사용자 메뉴 열기/닫기
export function openUserMenu() {
    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
        // 다른 곳 클릭 시 닫기
        if (!dropdown.classList.contains('hidden')) {
            document.addEventListener('click', closeUserMenuOnClickOutside);
        }
    }
}

function closeUserMenuOnClickOutside(e) {
    const dropdown = document.getElementById('user-menu-dropdown');
    const userAvatar = document.getElementById('user-avatar');
    if (dropdown && userAvatar && !dropdown.contains(e.target) && !userAvatar.contains(e.target)) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeUserMenuOnClickOutside);
    }
}

export function openUserSettings() {
    // 추후 설정 페이지 구현
    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    alert('설정 기능은 준비 중입니다.');
}

export function openUserProfile() {
    // 프로필 페이지 열기
    const profileView = document.getElementById('profile-view');
    const mainView = document.getElementById('main-view');
    const detailView = document.getElementById('detail-view');
    const loginView = document.getElementById('login-view');
    
    // 다른 뷰 숨기고 프로필 뷰 표시
    mainView.classList.add('hidden');
    detailView.classList.add('hidden');
    loginView.classList.add('hidden');
    profileView.classList.remove('hidden');
    
    // 메뉴 닫기
    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    
    // 현재 사용자 정보 로드
    loadProfileData();
    
    // [Added] 집 주소 자동완성 설정
    setupHomeAddressAutocomplete();
}

export function closeProfileView() {
    const profileView = document.getElementById('profile-view');
    const mainView = document.getElementById('main-view');
    
    profileView.classList.add('hidden');
    mainView.classList.remove('hidden');
}

// [Added] 집 주소 자동완성 설정
function setupHomeAddressAutocomplete() {
    const homeAddressInput = document.getElementById('profile-home-address');
    if (!homeAddressInput) return;
    
    if (!window.google || !window.google.maps) {
        console.warn('Google Maps API not loaded');
        return;
    }
    
    const autocomplete = new google.maps.places.Autocomplete(homeAddressInput, {
        types: ['geocode']
    });
    
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
            const homeCoords = document.getElementById('profile-home-coords');
            if (homeCoords) {
                homeCoords.textContent = `좌표: ${place.geometry.location.lat().toFixed(6)}, ${place.geometry.location.lng().toFixed(6)}`;
            }
        }
    });
    
    // [Added] 엔터 키로 첫 번째 결과 자동 선택
    homeAddressInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            
            // 자동완성 dropdown에서 첫 번째 항목 선택
            const event = new Event('keydown', { bubbles: true });
            Object.defineProperty(event, 'keyCode', { value: 40 }); // down arrow
            homeAddressInput.dispatchEvent(event);
            
            // 약간의 지연 후 enter 키 시뮬레이션
            setTimeout(() => {
                const enterEvent = new Event('keydown', { bubbles: true });
                Object.defineProperty(enterEvent, 'keyCode', { value: 13 }); // enter
                homeAddressInput.dispatchEvent(enterEvent);
            }, 100);
        }
    });
}

// [Added] 주소를 좌표로 변환
async function geocodeAddress(address) {
    try {
        if (!window.google || !window.google.maps) {
            console.warn('Google Maps API not loaded');
            return null;
        }
        
        const geocoder = new google.maps.Geocoder();
        return new Promise((resolve) => {
            geocoder.geocode({ address }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    resolve({
                        lat: results[0].geometry.location.lat(),
                        lng: results[0].geometry.location.lng()
                    });
                } else {
                    alert('주소를 찾을 수 없습니다. 정확한 주소를 입력해주세요.');
                    resolve(null);
                }
            });
        });
    } catch (error) {
        console.error('Geocode error:', error);
        return null;
    }
}

function loadProfileData() {
    if (!currentUser) return;
    
    // 이름 입력란
    const nameInput = document.getElementById('profile-name-input');
    if (nameInput) nameInput.value = currentUser.displayName || '';
    
    // 이메일 표시
    const emailDisplay = document.getElementById('profile-email-display');
    if (emailDisplay) emailDisplay.textContent = currentUser.email || '--';
    
    // 프로필 사진
    let photoURL = currentUser.customPhotoURL || currentUser.photoURL || localStorage.getItem('cachedUserPhotoURL');
    const avatarLarge = document.getElementById('profile-avatar-large');
    if (avatarLarge && photoURL) {
        avatarLarge.style.backgroundImage = `url('${photoURL}')`;
    }
    
    // [Added] 집 주소 로드
    const homeAddressInput = document.getElementById('profile-home-address');
    const homeCoords = document.getElementById('profile-home-coords');
    if (homeAddressInput && currentUser.homeAddress) {
        homeAddressInput.value = currentUser.homeAddress;
    }
    if (homeCoords && currentUser.homeLat && currentUser.homeLng) {
        homeCoords.textContent = `좌표: ${currentUser.homeLat.toFixed(6)}, ${currentUser.homeLng.toFixed(6)}`;
    }
    
    // 여행 정보 로드
    const phoneInput = document.getElementById('profile-phone');
    const emergencyContactInput = document.getElementById('profile-emergency-contact');
    const passportInput = document.getElementById('profile-passport');
    const passportExpiryInput = document.getElementById('profile-passport-expiry');
    const birthInput = document.getElementById('profile-birth');
    const bloodTypeInput = document.getElementById('profile-blood-type');
    const allergiesInput = document.getElementById('profile-allergies');
    
    if (phoneInput) phoneInput.value = currentUser.phone || '';
    if (emergencyContactInput) emergencyContactInput.value = currentUser.emergencyContact || '';
    if (passportInput) passportInput.value = currentUser.passport || '';
    if (passportExpiryInput) passportExpiryInput.value = currentUser.passportExpiry || '';
    if (birthInput) birthInput.value = currentUser.birth || '';
    if (bloodTypeInput) bloodTypeInput.value = currentUser.bloodType || '';
    if (allergiesInput) allergiesInput.value = currentUser.allergies || '';
}

export function handleProfilePhotoChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 파일 크기 확인 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
        alert('파일 크기가 5MB를 초과합니다.');
        return;
    }
    
    // 이미지 미리보기
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataURL = e.target.result;
        const avatarLarge = document.getElementById('profile-avatar-large');
        if (avatarLarge) {
            avatarLarge.style.backgroundImage = `url('${dataURL}')`;
        }
        // 임시 저장 (저장 버튼을 눌러야 실제 저장됨)
        sessionStorage.setItem('pendingProfilePhoto', dataURL);
    };
    reader.readAsDataURL(file);
}

export async function saveProfileChanges() {
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    const nameInput = document.getElementById('profile-name-input');
    const homeAddressInput = document.getElementById('profile-home-address');
    const phoneInput = document.getElementById('profile-phone');
    const emergencyContactInput = document.getElementById('profile-emergency-contact');
    const passportInput = document.getElementById('profile-passport');
    const passportExpiryInput = document.getElementById('profile-passport-expiry');
    const birthInput = document.getElementById('profile-birth');
    const bloodTypeInput = document.getElementById('profile-blood-type');
    const allergiesInput = document.getElementById('profile-allergies');
    
    const newName = nameInput ? nameInput.value.trim() : '';
    const newHomeAddress = homeAddressInput ? homeAddressInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const emergencyContact = emergencyContactInput ? emergencyContactInput.value.trim() : '';
    const passport = passportInput ? passportInput.value.trim() : '';
    const passportExpiry = passportExpiryInput ? passportExpiryInput.value : '';
    const birth = birthInput ? birthInput.value : '';
    const bloodType = bloodTypeInput ? bloodTypeInput.value : '';
    const allergies = allergiesInput ? allergiesInput.value.trim() : '';
    
    if (!newName) {
        alert('이름을 입력하세요.');
        return;
    }
    
    try {
        // Firebase Auth에 이름 업데이트
        await updateProfile(auth.currentUser, {
            displayName: newName
        });
        
        // Firestore에 업데이트
        const userRef = doc(db, "users", currentUser.uid);
        const updateData = {
            displayName: newName,
            phone: phone,
            emergencyContact: emergencyContact,
            passport: passport,
            passportExpiry: passportExpiry,
            birth: birth,
            bloodType: bloodType,
            allergies: allergies
        };
        
        // [Added] 집 주소가 있으면 저장
        if (newHomeAddress) {
            // Google Places API로 주소 검색 (시뮬레이션)
            const homeData = await geocodeAddress(newHomeAddress);
            if (homeData) {
                updateData.homeAddress = newHomeAddress;
                updateData.homeLat = homeData.lat;
                updateData.homeLng = homeData.lng;
            }
        } else {
            // 집 주소 삭제
            updateData.homeAddress = '';
            updateData.homeLat = null;
            updateData.homeLng = null;
        }
        
        await updateDoc(userRef, updateData);
        
        // 프로필 사진이 변경되었으면 저장
        const pendingPhoto = sessionStorage.getItem('pendingProfilePhoto');
        if (pendingPhoto) {
            // Firestore에 Base64로 저장
            await updateDoc(userRef, {
                photoURL: pendingPhoto
            });
            
            // 로컬스토리지에 캐싱
            localStorage.setItem('cachedUserPhotoURL', pendingPhoto);
            
            // currentUser 업데이트
            setCurrentUser({ 
                ...currentUser, 
                customPhotoURL: pendingPhoto,
                displayName: newName 
            });
            
            // 헤더 프로필 사진도 즉시 업데이트
            const userAvatar = document.getElementById('user-avatar');
            if (userAvatar) {
                userAvatar.style.backgroundImage = `url('${pendingPhoto}')`;
            }
            
            sessionStorage.removeItem('pendingProfilePhoto');
        } else {
            // 사진 변경 없이 이름만 업데이트
            setCurrentUser({ ...currentUser, displayName: newName });
        }
        
        // 페이지 업데이트
        const mainTitle = document.getElementById('main-view-title');
        if (mainTitle) mainTitle.innerText = `${newName}님의 여행 계획`;
        
        // 성공 메시지
        alert('프로필이 저장되었습니다.');
        closeProfileView();
        
    } catch (error) {
        console.error("프로필 저장 실패:", error);
        alert('프로필 저장에 실패했습니다: ' + error.message);
    }
}

// Auth State Observer
async function initAuthStateObserver() {
    await firebaseReady; // Firebase가 초기화될 때까지 대기
    onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        const loginBtn = document.getElementById('login-btn');
        const userProfile = document.getElementById('user-profile');
        const userAvatar = document.getElementById('user-avatar');
        const mainTitle = document.getElementById('main-view-title');
        const loginView = document.getElementById('login-view');
    const mainView = document.getElementById('main-view');
    const detailView = document.getElementById('detail-view');
    const backBtn = document.getElementById('back-btn');
    const faviconLink = document.querySelector("link[rel~='icon']");
        
        // 인증 상태 확인 후 UI 표시
        document.body.style.opacity = '1';
        hideLoading();
    // [수정] 파비콘을 로그인 상태와 관계없이 고정
    if (faviconLink) faviconLink.href = '/favicon.ico';

    if (user) {
        // 로그인 상태
        loginBtn.classList.add('hidden');
        userProfile.classList.remove('hidden');
        
        // 공유 기능을 위해 사용자 정보 저장 (로컬스토리지에도 백업)
        const userRef = doc(db, "users", user.uid);
        const userData = {
            email: user.email,
            displayName: user.displayName
        };
        
        // [수정] Firestore에서 사용자 정보 로드 (프로필 사진, 집 주소 등)
        getDoc(userRef).then((docSnap) => {
            let customPhotoURL = null;
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                
                // Firestore에 저장된 커스텀 프로필 사진이 있으면 우선 사용
                if (data.photoURL) {
                    customPhotoURL = data.photoURL;
                }
                
                // currentUser에 집 주소 및 여행 정보 추가
                setCurrentUser({
                    ...user,
                    homeAddress: data.homeAddress || '',
                    homeLat: data.homeLat || null,
                    homeLng: data.homeLng || null,
                    phone: data.phone || '',
                    emergencyContact: data.emergencyContact || '',
                    passport: data.passport || '',
                    passportExpiry: data.passportExpiry || '',
                    birth: data.birth || '',
                    bloodType: data.bloodType || '',
                    allergies: data.allergies || '',
                    customPhotoURL: customPhotoURL
                });
            } else {
                setCurrentUser({
                    ...user,
                    customPhotoURL: customPhotoURL
                });
            }
            
            // 프로필 사진 설정 (커스텀 > Google > 캐시)
            const finalPhotoURL = customPhotoURL || user.photoURL || localStorage.getItem('cachedUserPhotoURL');
            
            if (finalPhotoURL) {
                localStorage.setItem('cachedUserPhotoURL', finalPhotoURL);
                userAvatar.style.backgroundImage = `url('${finalPhotoURL}')`;
                
                // 로드 실패 대비
                const testImg = new Image();
                testImg.onerror = () => {
                    const cached = localStorage.getItem('cachedUserPhotoURL');
                    if (cached && cached !== finalPhotoURL) {
                        userAvatar.style.backgroundImage = `url('${cached}')`;
                    } else {
                        // 캐시도 실패 시 기본 그라데이션
                        userAvatar.style.backgroundImage = '';
                    }
                };
                testImg.src = finalPhotoURL;
            } else {
                // photoURL이 없으면 캐싱된 이미지 사용
                const cached = localStorage.getItem('cachedUserPhotoURL');
                if (cached) {
                    userAvatar.style.backgroundImage = `url('${cached}')`;
                } else {
                    userAvatar.style.backgroundImage = '';
                }
            }
        }).catch(error => {
            console.error("Error loading user data:", error);
            
            // 에러 발생 시 기본 로직 사용
            const fallbackPhotoURL = user.photoURL || localStorage.getItem('cachedUserPhotoURL');
            if (fallbackPhotoURL) {
                userAvatar.style.backgroundImage = `url('${fallbackPhotoURL}')`;
            }
        });
        
        // Firestore 업데이트 (merge로 기존 데이터 유지)
        setDoc(userRef, userData, { merge: true });
        
        mainTitle.innerText = `${user.displayName}님의 여행 계획`;
        
        // 로컬스토리지에도 백업 저장
        localStorage.setItem('cachedUserDisplayName', user.displayName || '');
        localStorage.setItem('cachedUserEmail', user.email || '');

        loginView.classList.add('hidden');
        mainView.classList.remove('hidden');

        loadTripList(user.uid);
        checkInviteLink(); // 로그인 후 초대 링크 확인
    } else {
        // 로그아웃 상태
        loginBtn.classList.remove('hidden');
        userProfile.classList.add('hidden');
        userAvatar.style.backgroundImage = '';
        mainTitle.innerText = '나의 여행 계획';
        
        // 로그인 화면 표시, 다른 모든 뷰 숨기기
        loginView.classList.remove('hidden');
        mainView.classList.add('hidden');
        detailView.classList.add('hidden');
        backBtn.classList.add('hidden');
    }
    });
}

// Auth State Observer 초기화
initAuthStateObserver();

export function updateMeta(key, value) {
    if (key.includes('.')) {
        const [p, c] = key.split('.');
        travelData.meta[p][c] = value;
    } else {
        travelData.meta[key] = value;
    }
}

export function updateTimeline(index, key, value) {
    travelData.days[targetDayIndex].timeline[index][key] = value;
}

// 날짜 변경 처리 (YYYY-MM-DD -> YYYY년 MM월 DD일)
export function updateTripDate(dateStr) {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split('-');
    const formatted = `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
    updateMeta('subInfo', formatted);
}

export function updateDateRange() {
    const startDateInput = document.getElementById('edit-start-date');
    const endDateInput = document.getElementById('edit-end-date');
    if (!startDateInput || !endDateInput) return;

    const startDateStr = startDateInput.value;
    const endDateStr = endDateInput.value;

    if (!startDateStr || !endDateStr) return;

    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (end < start) {
        alert("종료일은 시작일보다 빠를 수 없습니다.");
        // Revert to original dates
        startDateInput.value = travelData.days[0].date;
        endDateInput.value = travelData.days[travelData.days.length - 1].date;
        return;
    }

    // Calculate new duration text
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    travelData.meta.dayCount = (diffDays === 0) ? "당일치기" : `${diffDays}박 ${diffDays + 1}일`;

    // Adjust travelData.days array
    const totalDays = diffDays + 1;
    const currentTotalDays = travelData.days.length;

    if (totalDays > currentTotalDays) {
        for (let i = currentTotalDays; i < totalDays; i++) {
            const newDate = new Date(start);
            newDate.setDate(newDate.getDate() + i);
            travelData.days.push({ date: newDate.toISOString().split('T')[0], timeline: [] });
        }
    } else if (totalDays < currentTotalDays) {
        travelData.days.splice(totalDays);
    }

    travelData.days.forEach((day, i) => { const d = new Date(start); d.setDate(d.getDate() + i); day.date = d.toISOString().split('T')[0]; });
    
    const format = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    let dateStr = format(start);
    if (travelData.meta.dayCount !== "당일치기") {
        dateStr += ` - ${end.getMonth() + 1}월 ${end.getDate()}일`;
    }
    let prefix = travelData.meta.subInfo && travelData.meta.subInfo.includes('•') ? travelData.meta.subInfo.split('•')[0].trim() : "";
    travelData.meta.subInfo = prefix ? `${prefix} • ${dateStr}` : dateStr;

    if (currentDayIndex >= travelData.days.length) { 
        setCurrentDayIndex(travelData.days.length - 1);
        setTargetDayIndex(travelData.days.length - 1);
    }
    renderItinerary();
}

// 이미지 업로드 처리 (Base64 변환)
export function handleImageUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            updateMeta('mapImage', e.target.result);
            renderItinerary();
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// [Helper] 타임라인 재정렬 및 이동시간 자동 계산
export function reorderTimeline(dayIndex = currentDayIndex) {
    // [Added] 스크롤 위치 저장
    const scrollPos = window.scrollY || document.documentElement.scrollTop;
    
    const timeline = travelData.days[dayIndex].timeline;
    if (!timeline || timeline.length === 0) return;

    // 1. 그룹화 (장소 + 그 뒤에 딸린 이동수단들)
    let groups = [];
    let currentGroup = { main: null, transits: [] };

    timeline.forEach(item => {
        if (!item.isTransit) {
            if (currentGroup.main !== null || currentGroup.transits.length > 0) {
                groups.push(currentGroup);
            }
            currentGroup = { main: item, transits: [] };
        } else {
            currentGroup.transits.push(item);
        }
    });
    groups.push(currentGroup);

    // 2. 정렬 (main 아이템의 시간 기준)
    groups.sort((a, b) => {
        const timeA = a.main ? parseTimeStr(a.main.time) : -1;
        const timeB = b.main ? parseTimeStr(b.main.time) : -1;
        
        // 시간이 없는 경우(-1)는 맨 뒤로 보내거나 처리
        if (timeA === -1 && timeB === -1) return 0;
        if (timeA === -1) return 1;
        if (timeB === -1) return -1;
        
        return timeA - timeB;
    });

    // 3. 평탄화
    const newTimeline = [];
    groups.forEach(g => {
        if (g.main) newTimeline.push(g.main);
        g.transits.forEach(t => newTimeline.push(t));
    });

    // 4. 이동수단 시간 자동 계산 및 다음 장소 시작 시간 계산
    for (let i = 0; i < newTimeline.length - 1; i++) {
        const curr = newTimeline[i];
        const next = newTimeline[i+1];

        // 현재 장소에서 다음 장소로의 시작 시간 계산 (잔류 시간 + 이동 시간)
        if (!curr.isTransit && !next.isTransit) {
            // 장소 -> 장소 (중간에 이동수단 없음)
            const currStartTime = parseTimeStr(curr.time);
            const duration = curr.duration !== undefined && curr.duration !== null ? curr.duration : 30; // 기본 30분
            
            if (currStartTime !== null) {
                const nextStartTime = currStartTime + duration;
                next.time = minutesTo24Hour(nextStartTime >= 24 * 60 ? nextStartTime - 24 * 60 : nextStartTime);
            }
        } else if (!curr.isTransit && next.isTransit && i + 1 < newTimeline.length - 1) {
            // 장소 -> 이동수단 -> 장소
            const nextNext = newTimeline[i+2];
            
            if (!nextNext.isTransit) {
                // [Modified] 최적경로(fixedDuration)인 경우 자동 계산 건너뛰기
                if (next.fixedDuration) {
                    const startTime = parseTimeStr(curr.time);
                    const durationMins = parseDurationStr(next.time);
                    const currDuration = curr.duration !== undefined && curr.duration !== null ? curr.duration : 30;
                    
                    if (startTime !== null && durationMins > 0) {
                        // 시작 시간 = 현재 장소 시작 + 잔류 시간
                        const transitStartTime = startTime + currDuration;
                        if (!next.transitInfo) next.transitInfo = {};
                        next.transitInfo.start = minutesTo24Hour(transitStartTime >= 24 * 60 ? transitStartTime - 24 * 60 : transitStartTime);
                        
                        // 종료 시간 = 시작 + 이동 시간
                        let endTime = transitStartTime + durationMins;
                        if (endTime >= 24 * 60) endTime -= 24 * 60;
                        next.transitInfo.end = minutesTo24Hour(endTime);
                        
                        // 다음 장소 시작 시간 업데이트
                        nextNext.time = minutesTo24Hour(endTime);
                    }
                    continue;
                }

                const startTime = parseTimeStr(curr.time);
                const endTime = parseTimeStr(nextNext.time);
                const currDuration = curr.duration !== undefined && curr.duration !== null ? curr.duration : 30;

                if (startTime !== null && endTime !== null) {
                    // 이동 시작 시간 = 현재 장소 시작 + 잔류 시간
                    const transitStartTime = startTime + currDuration;
                    
                    // 이동 소요 시간 = 다음 장소 시작 - 이동 시작
                    let diff = endTime - transitStartTime;
                    if (diff < 0) diff += 24 * 60; // 다음날로 넘어가는 경우
                    
                    if (diff >= 0) {
                        next.time = formatDuration(diff);

                        // [Added] transitInfo 자동 갱신
                        if (!next.transitInfo) next.transitInfo = {};
                        next.transitInfo.start = minutesTo24Hour(transitStartTime >= 24 * 60 ? transitStartTime - 24 * 60 : transitStartTime);
                        next.transitInfo.end = minutesTo24Hour(endTime);
                    }
                }
            }
        }
    }

    travelData.days[dayIndex].timeline = newTimeline;
    renderItinerary();
    autoSave();
    
    // [Added] 스크롤 위치 복원 (다음 렌더링 사이클에서)
    requestAnimationFrame(() => {
        window.scrollTo(0, scrollPos);
    });
}

// ==========================================
// [Touch Drag & Drop Logic]
// ==========================================
let touchLongPressTimer = null;
let isTouchDragging = false;
let touchStartIndex = null;
let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;
let currentSwipeItem = null;
let touchType = null;

export function touchStart(e, index, type = 'item') {
    // 롱프레스 감지
    touchStartIndex = index;
    touchType = type;
    isTouchDragging = false;
    isSwiping = false;
    
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    
    touchLongPressTimer = setTimeout(() => {
        if (isSwiping) return;

        if (navigator.vibrate) navigator.vibrate(50);

        if (isEditing && type === 'item') {
            // 편집 모드일 때는 드래그 시작
            isTouchDragging = true;
            const target = e.currentTarget;
            target.style.opacity = '0.5';
            draggingIndex = index;
        } else {
            // 일반 모드일 때는 컨텍스트 메뉴 오픈
            const touch = e.touches[0];
            // 가짜 이벤트 객체 생성하여 openContextMenu 호출
            const fakeEvent = {
                preventDefault: () => {},
                clientX: touch.clientX,
                clientY: touch.clientY,
                target: e.target
            };
            openContextMenu(fakeEvent, type, index);
        }
    }, 500);
}

export function touchMove(e) {
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartX;
    const diffY = touch.clientY - touchStartY;

    if (isTouchDragging) {
        e.preventDefault(); // 스크롤 방지
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetItem = element?.closest('.group\\/timeline-item');
        
        clearDragStyles();
        
        if (targetItem) {
            const indicator = targetItem.querySelector('.drag-indicator');
            if (indicator) indicator.classList.remove('hidden');
        }
        return;
    }

    // 움직임 감지 시 롱프레스 취소
    if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        clearTimeout(touchLongPressTimer);
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            longPressStartIndex = null;
        }
    }
}

export function touchEnd(e) {
    clearTimeout(touchLongPressTimer);
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressStartIndex = null;
    }
    
    if (isTouchDragging) {
        isTouchDragging = false;
        e.currentTarget.style.opacity = '1';
        clearDragStyles();

        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetItem = element?.closest('.group\\/timeline-item');
        
        if (targetItem && targetItem.dataset.index) {
            const targetIndex = parseInt(targetItem.dataset.index);
            moveTimelineItem(touchStartIndex, targetIndex, targetDayIndex);
        }
        
        draggingIndex = null;
    }
}

// ==========================================
// [Drag & Drop Logic]
// ==========================================

export function dragStart(e, index) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'single', index: index }));
    e.currentTarget.classList.add('dragging');
    draggingIndex = index; // 드래그 중인 인덱스 저장
}



export function dragEnd(e) {
    // 모든 dragging 클래스 제거
    document.querySelectorAll('.dragging').forEach(el => {
        el.classList.remove('dragging');
    });
    draggingIndex = null;
    clearDragStyles();
}

export function dragOver(e) {
    e.preventDefault(); // 필수: 드롭 허용
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.currentTarget;
    
    // 이미 활성화된 상태면 패스
    const indicator = target.querySelector('.drag-indicator');
    if (indicator && !indicator.classList.contains('hidden')) return;

    // 다른 요소들 스타일 초기화 (하나만 활성화)
    clearDragStyles();

    // 시각적 피드백: 인디케이터 표시
    if (indicator) indicator.classList.remove('hidden');
}

export function dragLeave(e) {
    const target = e.currentTarget;
    // 자식 요소로 들어갈 때는 무시 (relatedTarget이 target 내부에 있으면 리턴)
    if (target.contains(e.relatedTarget)) return;

    const indicator = target.querySelector('.drag-indicator');
    if (indicator) indicator.classList.add('hidden');
}

function clearDragStyles() {
    document.querySelectorAll('.group\\/timeline-item').forEach(el => {
        const indicator = el.querySelector('.drag-indicator');
        if (indicator) indicator.classList.add('hidden');
    });
}

export async function drop(e, targetIndex) {
    e.preventDefault();
    e.stopPropagation();
    clearDragStyles();

    const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    const dropIndex = parseInt(e.currentTarget?.getAttribute('data-drop-index') || targetIndex);
    
    if (data.type === 'group' && data.indices && data.indices.length > 0) {
        // 그룹 이동
        moveTransitGroup(data.indices, dropIndex);
    } else if (data.type === 'single' && data.index !== undefined) {
        // 단일 이동
        moveTimelineItem(data.index, dropIndex, targetDayIndex);
    } else {
        // 호환성 지원 (기존 포맷)
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (!isNaN(fromIndex)) {
            moveTimelineItem(fromIndex, dropIndex, targetDayIndex);
        }
    }
}

// 타임라인 컨테이너에 드롭 이벤트 추가 (마지막 위치 해결)
export function timelineContainerDrop(e, dayIndex) {
    e.preventDefault();
    e.stopPropagation();
    clearDragStyles();
    
    const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    const timeline = travelData.days[dayIndex]?.timeline;
    if (!timeline) return;
    
    if (data.type === 'single' && data.index !== undefined) {
        moveTimelineItem(data.index, timeline.length, dayIndex);
    } else {
        // 호환성 지원
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (!isNaN(fromIndex)) {
            moveTimelineItem(fromIndex, timeline.length, dayIndex);
        }
    }
}

// 순서 변경 공통 로직
export function moveTimelineItem(fromIndex, targetIndex, dayIndex = currentDayIndex) {
    const timeline = travelData.days[dayIndex].timeline;
    
    // 같은 위치면 무시
    if (fromIndex === targetIndex || fromIndex === targetIndex - 1) return;

    const movedItem = timeline[fromIndex];
    const isTransitItem = movedItem.isTransit;
    const originalTime = movedItem.time; // 이동 수단의 기존 시간 저장

    // [Step 1] 순서 변경
    timeline.splice(fromIndex, 1);
    
    // 인덱스 조정 (remove 후 insert 위치 계산)
    let insertIndex = targetIndex;
    if (fromIndex < targetIndex) {
        insertIndex = targetIndex - 1; // 뒤로 옮길 때는 -1
    }
    
    timeline.splice(insertIndex, 0, movedItem);

    // [Step 2] 이동 수단이 아닌 경우에만 시간 자동 계산 (중간값)
    if (!isTransitItem) {
        const prevItem = insertIndex > 0 ? timeline[insertIndex - 1] : null;
        const nextItem = insertIndex < timeline.length - 1 ? timeline[insertIndex + 1] : null;

        let newMinutes = null;

        if (prevItem && nextItem) {
            const prevMins = parseTimeStr(prevItem.time);
            let nextMins = parseTimeStr(nextItem.time);
            
            // 중간에 이동 수단이 있는지 확인 (insertIndex 바로 다음부터)
            let transitDuration = 0;
            let hasTransit = false;
            
            // insertIndex 바로 다음부터 이동수단 찾기
            for (let i = insertIndex + 1; i < timeline.length; i++) {
                if (timeline[i].isTransit) {
                    hasTransit = true;
                    const dur = parseDurationStr(timeline[i].time);
                    if (dur !== null) transitDuration += dur;
                } else {
                    // 다음 일반 일정을 만나면 중단
                    break;
                }
            }
            
            if (hasTransit && prevMins !== null) {
                // 이전 장소 시간 + 이동 수단 소요시간 = 새 시간
                newMinutes = prevMins + transitDuration;
            } else if (prevMins !== null && nextMins !== null) {
                if (nextMins < prevMins) {
                    // 자정 넘어가는 경우 (예: 23:00 ~ 01:00)
                    newMinutes = Math.floor((prevMins + (nextMins + 24 * 60)) / 2);
                    if (newMinutes >= 24 * 60) newMinutes -= 24 * 60;
                } else {
                    newMinutes = Math.floor((prevMins + nextMins) / 2);
                }
            } else if (prevMins !== null) {
                newMinutes = prevMins + 60;
            } else if (nextMins !== null) {
                newMinutes = nextMins - 60;
            }
        } else if (prevItem) {
            const prevMins = parseTimeStr(prevItem.time);
            // 바로 다음에 이동수단이 있는지 확인
            let transitDuration = 0;
            let hasTransit = false;
            for (let i = insertIndex + 1; i < timeline.length; i++) {
                if (timeline[i].isTransit) {
                    hasTransit = true;
                    const dur = parseDurationStr(timeline[i].time);
                    if (dur !== null) transitDuration += dur;
                } else {
                    break;
                }
            }
            if (hasTransit && prevMins !== null) {
                newMinutes = prevMins + transitDuration;
            } else if (prevMins !== null) {
                newMinutes = prevMins + 60;
            }
        } else if (nextItem) {
            const nextMins = parseTimeStr(nextItem.time);
            if (nextMins !== null) newMinutes = nextMins - 60;
        }

        if (newMinutes !== null) {
            if (newMinutes < 0) newMinutes += 24 * 60;
            movedItem.time = formatTimeStr(newMinutes);
        }
    } else {
        // 이동 수단의 경우 시간 고정 및 팝업 확인
        movedItem.time = originalTime;
        
        // 커스텀 모달 표시
        setTimeout(() => {
            showTransitRecalculateModal(originalTime, () => {
                // 확인 시: 앞뒤 일정 시간 재계산
                reorderTimeline(dayIndex);
            }, () => {
                // 취소 시: 그냥 저장만
                autoSave();
            });
        }, 100);
        return; // reorderTimeline을 모달에서 처리하므로 여기서는 리턴
    }

    // [Step 3] 시간순 재정렬 및 이동시간 자동 계산
    reorderTimeline(dayIndex);
}

// 날짜 탭 변경
export function selectDay(index) {
    setCurrentDayIndex(index);
    if (index !== -1) {
        setTargetDayIndex(index);
    }
    
    // 날짜에 맞는 날씨 업데이트
    const day = index !== -1 ? travelData.days[index] : travelData.days[0];
    if (day && day.date && travelData.meta.lat && travelData.meta.lng) {
        fetchWeather(travelData.meta.lat, travelData.meta.lng, day.date);
    }
    
    renderItinerary();
}

// [Detail Modal Logic]
export function viewTimelineItem(index, dayIndex = currentDayIndex) {
    if (isEditing) return;
    
    setTargetDayIndex(dayIndex);
    setViewingItemIndex(index);
    const timeline = travelData.days[dayIndex].timeline;
    const item = timeline[index];
    
    // [메모 아이템인 경우 전용 모달 호출]
    if (item.tag === '메모') {
        openMemoModal(item);
        return;
    }

    // [Modified] 이동수단인 경우 전용 상세 모달 호출
    if (item.isTransit) {
        openTransitDetailModal(item, index, dayIndex);
        Transit.openTransitDetailModal(item, index, dayIndex);
        return;
    }

    // 추억 잠금 상태에 따라 수정/삭제 버튼 표시/숨김
    const isMemoryLocked = travelData.meta.memoryLocked || false;
    const actionButtons = document.getElementById('detail-action-buttons');
    if (actionButtons) {
        const editBtn = actionButtons.querySelector('button[onclick="editCurrentItem()"]');
        const deleteBtn = actionButtons.querySelector('button[onclick="deleteCurrentItem()"]');
        if (editBtn && deleteBtn) {
            if (isMemoryLocked) {
                editBtn.classList.add('hidden');
                deleteBtn.classList.add('hidden');
            } else {
                editBtn.classList.remove('hidden');
                deleteBtn.classList.remove('hidden');
            }
        }
    }

    // Fill Content
    document.getElementById('detail-tag').innerText = item.tag || '기타';
    const durationText = item.duration !== undefined ? ` (${item.duration}분 체류)` : '';
    document.getElementById('detail-time').innerText = item.time + durationText;
    document.getElementById('detail-title').innerText = item.title;
    
    // [수정] 이동수단일 경우 위치 텍스트를 "출발지 -> 도착지"로 표시
    if (item.isTransit) {
        if (item.tag === '비행기' && item.location && item.location.includes('✈️')) {
            document.getElementById('detail-location-text').innerText = item.location;
        } else {
            const prevItem = index > 0 ? timeline[index - 1] : null;
            const nextItem = index < timeline.length - 1 ? timeline[index + 1] : null;
            const prevLoc = prevItem ? (prevItem.title || "출발지") : "출발지";
            const nextLoc = nextItem ? (nextItem.title || "도착지") : "도착지";
            document.getElementById('detail-location-text').innerText = `${prevLoc} ➡️ ${nextLoc}`;
        }
    } else {
        document.getElementById('detail-location-text').innerText = item.location || '위치 정보 없음';
    }

    document.getElementById('detail-note').value = item.note || '';
    document.getElementById('detail-note').readOnly = true; // 초기엔 읽기 전용
    
    document.getElementById('detail-total-budget').value = item.budget || 0;
    renderExpenseList(item);

    // Attachments
    renderAttachments(item, 'detail-attachment-list');

    // Memories (여행 완료 후에만 표시)
    const memoriesSection = document.getElementById('detail-memories-section');
    const memoriesList = document.getElementById('detail-memories-list');
    if (getTripStatus(travelData) === 'completed' && item.memories && item.memories.length > 0) {
        memoriesSection.classList.remove('hidden');
        memoriesList.innerHTML = item.memories.map((memory, memIdx) => {
            const date = new Date(memory.createdAt).toLocaleDateString('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            return `
                <div class="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
                    ${memory.photoUrl ? `<img src="${memory.photoUrl}" alt="Memory" class="w-full h-48 object-cover">` : ''}
                    <div class="p-3">
                        <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-body leading-relaxed mb-2">${memory.comment}</p>
                        <span class="text-xs text-gray-400">${date}</span>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        memoriesSection.classList.add('hidden');
    }

    // Map Logic - 맨 밑으로 이동
    const mapSection = document.getElementById('detail-map-section');
    const mapFrame = document.getElementById('detail-map-frame');
    
    // 이동수단이 아니고 위치 정보가 있을 때만 지도 표시
    if (item.location && item.location.length > 1 && item.location !== "위치" && !item.isTransit) {
        mapSection.classList.remove('hidden');
        mapFrame.src = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(item.title + "," + item.location)}`;
    } else {
        mapSection.classList.add('hidden');
        mapFrame.src = "";
    }
    
    document.getElementById('item-detail-modal').classList.remove('hidden');
}

export function closeDetailModal() {
    document.getElementById('item-detail-modal').classList.add('hidden');
    document.getElementById('detail-map-frame').src = "";
    setViewingItemIndex(null);
}

export function editCurrentItem() {
    if (viewingItemIndex !== null) {
        const idx = viewingItemIndex;
        setIsEditingFromDetail(true);
        closeDetailModal();
        editTimelineItem(idx, targetDayIndex);
    }
}

export function deleteCurrentItem() {
    if (viewingItemIndex !== null) {
        if (confirm("이 항목을 삭제하시겠습니까?")) {
            travelData.days[targetDayIndex].timeline.splice(viewingItemIndex, 1);
            updateTotalBudget();
            renderItinerary();
            autoSave();
            closeDetailModal();
        }
    }
}

export function openMemoModal(item) {
    const modal = document.getElementById('memo-detail-modal');
    const content = document.getElementById('memo-detail-content');
    const bookmarksContainer = document.getElementById('memo-bookmarks');
    const bookmarksList = document.getElementById('memo-bookmarks-list');
    
    // 내용 초기화 (textarea가 남아있을 경우 대비)
    content.innerHTML = ""; 
    
    // 링크 파싱 및 렌더링
    const { html, links } = processMemoContent(item.title);
    content.innerHTML = html;
    renderBookmarks(links, bookmarksContainer, bookmarksList);

    // 버튼 초기화 (저장 상태에서 닫았다가 다시 열 경우 대비)
    const btnContainer = modal.querySelector('.mt-6'); 
    if (btnContainer) {
        const btn = btnContainer.querySelector('button');
        if (btn) {
            btn.setAttribute('onclick', 'editCurrentMemo()');
            btn.innerHTML = `<span class="material-symbols-outlined text-sm">edit</span> 수정`;
            btn.className = "text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1";
        }
    }

    modal.classList.remove('hidden');
}

export function closeMemoModal() {
    document.getElementById('memo-detail-modal').classList.add('hidden');
    setViewingItemIndex(null);
}

// 이동수단 아이템 저장 함수
function saveTransitItem(index, dayIndex) {
    const timeline = travelData.days[dayIndex].timeline;
    const item = timeline[index];
    
    if (!item || !item.isTransit) return;
    
    const isAirplane = item.transitType === 'airplane';
    
    if (isAirplane) {
        // 비행기 정보 저장
        const departure = document.getElementById(`transit-departure-${index}`)?.value || '';
        const arrival = document.getElementById(`transit-arrival-${index}`)?.value || '';
        const time = document.getElementById(`transit-time-${index}`)?.value || '';
        const duration = document.getElementById(`transit-duration-${index}`)?.value || '';
        const flightNumber = document.getElementById(`transit-flight-number-${index}`)?.value || '';
        const bookingRef = document.getElementById(`transit-booking-ref-${index}`)?.value || '';
        const terminal = document.getElementById(`transit-terminal-${index}`)?.value || '';
        const gate = document.getElementById(`transit-gate-${index}`)?.value || '';
        const note = document.getElementById(`transit-note-${index}`)?.value || '';
        
        item.title = `${departure} → ${arrival}`;
        item.time = time;
        item.duration = duration;
        item.note = note;
        item.flightInfo = {
            departure,
            arrival,
            flightNumber,
            bookingRef,
            terminal,
            gate
        };
    } else {
        // 일반 이동수단 정보 저장
        const title = document.getElementById(`transit-title-${index}`)?.value || '';
        const time = document.getElementById(`transit-time-${index}`)?.value || '';
        const duration = document.getElementById(`transit-duration-${index}`)?.value || '';
        const note = document.getElementById(`transit-note-${index}`)?.value || '';
        
        item.title = title;
        item.time = time;
        item.duration = duration;
        item.note = note;
    }
    
    // 편집 모드 해제
    item.isEditing = false;
    
    // 저장 및 UI 업데이트
    autoSave();
    renderItinerary();
}

export function editCurrentMemo() {
    if (viewingItemIndex === null) return;
    
    const contentEl = document.getElementById('memo-detail-content');
    const currentText = contentEl.innerText;
    
    // 텍스트 영역으로 변환 (인라인 편집)
    contentEl.innerHTML = `<textarea id="memo-edit-area" class="w-full h-60 bg-white/50 dark:bg-black/20 border-2 border-yellow-300 dark:border-yellow-600/50 rounded-lg p-3 text-gray-800 dark:text-gray-200 resize-none focus:ring-0 outline-none leading-relaxed font-body text-lg placeholder-gray-400" placeholder="메모를 입력하세요">${currentText}</textarea>`;
    
    // 버튼 변경 (수정 -> 저장)
    const modal = document.getElementById('memo-detail-modal');
    const btnContainer = modal.querySelector('.mt-6');
    const btn = btnContainer.querySelector('button');
    
    btn.setAttribute('onclick', 'saveCurrentMemo()');
    btn.innerHTML = `<span class="material-symbols-outlined text-sm">save</span> 저장`;
    btn.className = "text-sm bg-primary text-white hover:bg-orange-500 px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-md";

    setTimeout(() => document.getElementById('memo-edit-area').focus(), 50);
}

export function saveCurrentMemo() {
    if (viewingItemIndex === null) return;
    
    const textarea = document.getElementById('memo-edit-area');
    if (!textarea) return;

    const newText = textarea.value;
    
    // 데이터 업데이트
    travelData.days[targetDayIndex].timeline[viewingItemIndex].title = newText;
    
    const { html, links } = processMemoContent(newText);

    // UI 복구 (보기 모드)
    const contentEl = document.getElementById('memo-detail-content');
    contentEl.innerHTML = html;
    renderBookmarks(links, document.getElementById('memo-bookmarks'), document.getElementById('memo-bookmarks-list'));

    // 버튼 복구 (저장 -> 수정)
    const modal = document.getElementById('memo-detail-modal');
    const btnContainer = modal.querySelector('.mt-6');
    const btn = btnContainer.querySelector('button');
    
    btn.setAttribute('onclick', 'editCurrentMemo()');
    btn.innerHTML = `<span class="material-symbols-outlined text-sm">edit</span> 수정`;
    btn.className = "text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1";

    renderItinerary();
    autoSave();
}

// [Memo Link & Bookmark Logic]
function processMemoContent(text) {
    if (!text) return { html: '', links: [] };
    
    // URL 정규식
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = [];
    
    // HTML 이스케이프 (보안)
    const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    const html = safeText.replace(urlRegex, (url) => {
        links.push(url);
        return `<a href="${url}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline break-all" onclick="event.stopPropagation()">${url}</a>`;
    });

    return { html, links };
}

function renderBookmarks(links, container, list) {
    if (!links || links.length === 0) {
        container.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    let html = '';
    // 중복 제거
    const uniqueLinks = [...new Set(links)];

    uniqueLinks.forEach(link => {
        try {
            const urlObj = new URL(link);
            html += `
                <a href="${link}" target="_blank" class="flex items-center gap-3 p-3 bg-white/50 dark:bg-black/20 border border-yellow-200 dark:border-yellow-700/30 rounded-xl hover:bg-yellow-100/50 dark:hover:bg-yellow-900/30 transition-colors group">
                    <div class="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center text-yellow-700 dark:text-yellow-500 flex-shrink-0">
                        <span class="material-symbols-outlined">public</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-gray-800 dark:text-gray-200 truncate group-hover:text-primary transition-colors">${urlObj.hostname}</p>
                        <p class="text-xs text-gray-500 truncate opacity-70">${link}</p>
                    </div>
                    <span class="material-symbols-outlined text-gray-400 text-sm">open_in_new</span>
                </a>
            `;
        } catch (e) {
            // Invalid URL ignored
        }
    });

    list.innerHTML = html;
    container.classList.remove('hidden');
}

export function updateItemNote(value) {
    if (viewingItemIndex === null) return;
    travelData.days[targetDayIndex].timeline[viewingItemIndex].note = value;
    autoSave();
}

// [Invite Link Logic]
export async function checkInviteLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');
    
    if (inviteId && currentUser) {
        try {
            const planRef = doc(db, "plans", inviteId);
            const planSnap = await getDoc(planRef);
            
            if (planSnap.exists()) {
                const data = planSnap.data();
                if (data.members && data.members[currentUser.uid]) {
                    // 이미 멤버임
                    openTrip(inviteId);
                } else {
                    if(confirm(`'${data.meta.title}' 여행 계획에 참여하시겠습니까?`)) {
                        await updateDoc(planRef, { [`members.${currentUser.uid}`]: 'editor' });
                        alert("여행 계획에 참여했습니다!");
                        openTrip(inviteId);
                    }
                }
            }
            // URL 정리
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
            console.error("Invite processing error", e);
        }
    }
}

// [Sharing Logic]
export async function openShareModal(tripId = null) {
    // 메뉴 닫기
    document.querySelectorAll('[id^="trip-menu-"]').forEach(el => el.classList.add('hidden'));

    const memberListEl = document.getElementById('member-list');
    memberListEl.innerHTML = '로딩 중...';
    document.getElementById('share-modal').classList.remove('hidden');

    let targetTripId = tripId || currentTripId;
    let members = {};

    // 메인 리스트에서 호출된 경우 데이터 fetch
    if (tripId) {
        try {
            const docRef = doc(db, "plans", tripId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                members = docSnap.data().members || {};
            }
        } catch (e) {
            console.error("Error fetching trip members:", e);
        }
    } else {
        // 상세 페이지에서 호출된 경우 현재 데이터 사용
        members = travelData.members || {};
    }

    const memberUIDs = Object.keys(members).sort((a, b) => {
        if (members[a] === 'owner') return -1;
        if (members[b] === 'owner') return 1;
        return 0;
    });
    
    // Generate Link
    const link = `${window.location.origin}${window.location.pathname}?invite=${targetTripId}`;
    document.getElementById('share-link-input').value = link;

    let html = '';

    for (const uid of memberUIDs) {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const role = members[uid];
            const isMe = currentUser && currentUser.uid === uid;
            const displayName = isMe ? `${userData.displayName} (나)` : userData.displayName;
            html += `
                <div class="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                    <div class="flex items-center gap-3">
                        <img src="${userData.photoURL}" class="w-8 h-8 rounded-full">
                        <div>
                            <p class="text-sm font-bold">${displayName}</p>
                            <p class="text-xs text-gray-500">${userData.email}</p>
                        </div>
                    </div>
                    <span class="text-xs font-semibold text-gray-500">${role}</span>
                </div>
            `;
        }
    }
    memberListEl.innerHTML = html;
}

export function closeShareModal() {
    document.getElementById('share-modal').classList.add('hidden');
}

export async function downloadTripAsPDF() {
    try {
        console.log('PDF 다운로드 시작');
        
        showLoading();
        
        // PDF용 HTML 생성
        const pdfContent = generatePDFContent();
        console.log('생성된 HTML 길이:', pdfContent.length);
        
        // 임시 컨테이너 생성
        const container = document.createElement('div');
        container.innerHTML = pdfContent;
        container.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 210mm;
            min-height: 297mm;
            background: white;
            padding: 20mm;
            z-index: 99999;
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.8);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif;
        `;
        document.body.appendChild(container);
        
        console.log('컨테이너 추가됨');
        
        // 폰트 로드 대기
        await document.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('html2canvas 시작');
        
        // html2canvas로 이미지 생성
        const canvas = await html2canvas(container, {
            scale: 3,
            useCORS: true,
            allowTaint: false,
            logging: true,
            backgroundColor: '#ffffff',
            windowWidth: container.scrollWidth,
            windowHeight: container.scrollHeight
        });
        
        console.log('Canvas 생성 완료:', canvas.width, 'x', canvas.height);
        
        const imgData = canvas.toDataURL('image/png', 1.0);
        console.log('이미지 데이터 길이:', imgData.length);
        
        if (imgData.length < 10000) {
            throw new Error('이미지가 제대로 생성되지 않았습니다.');
        }
        
        // 컨테이너 제거
        document.body.removeChild(container);
        
        // jsPDF로 PDF 생성
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true
        });
        
        const pageWidth = 210;
        const pageHeight = 297;
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * pageWidth) / canvas.width;
        
        console.log('PDF 이미지 크기:', imgWidth, 'x', imgHeight);
        
        if (imgHeight <= pageHeight) {
            // 한 페이지에 들어감
            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        } else {
            // 여러 페이지 필요
            let heightLeft = imgHeight;
            let position = 0;
            
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
        }
        
        console.log('PDF 저장 시작');
        
        // PDF 저장
        const filename = `${travelData.meta.title || '여행계획'}.pdf`;
        pdf.save(filename);
        
        console.log('PDF 저장 완료:', filename);
        
        hideLoading();
    } catch (error) {
        console.error('PDF 다운로드 실패:', error);
        alert('PDF 다운로드에 실패했습니다: ' + error.message);
        hideLoading();
        // 컨테이너 정리
        document.querySelectorAll('div[style*="z-index: 99999"]').forEach(el => {
            try { document.body.removeChild(el); } catch (e) {}
        });
    }
}

function generatePDFContent() {
    if (!travelData || !travelData.days || travelData.days.length === 0) {
        return '<div style="padding: 20px;"><h1>여행 데이터가 없습니다.</h1></div>';
    }
    
    const title = travelData.meta.title || '여행 계획';
    const subInfo = travelData.meta.subInfo || '';
    const dayCount = travelData.meta.dayCount || '';
    
    let html = `
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif; }
            .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #3579f6; }
            .header h1 { font-size: 32px; font-weight: bold; color: #3579f6; margin-bottom: 12px; }
            .header p { font-size: 14px; color: #666; margin: 5px 0; }
            .day-section { margin-bottom: 30px; page-break-inside: avoid; }
            .day-title { font-size: 20px; font-weight: bold; color: #ee8700; margin-bottom: 15px; padding-left: 12px; border-left: 5px solid #ee8700; }
            .timeline-item { margin-bottom: 15px; padding: 12px; background: #f9f9f9; border-radius: 8px; margin-left: 20px; page-break-inside: avoid; }
            .item-header { margin-bottom: 8px; }
            .item-icon { font-size: 20px; margin-right: 8px; }
            .item-time { font-size: 11px; color: #999; margin-right: 8px; }
            .item-title { font-size: 15px; color: #333; font-weight: bold; }
            .item-tag { margin-left: 8px; font-size: 10px; color: #666; background: #e0e0e0; padding: 3px 8px; border-radius: 4px; display: inline-block; }
            .item-location { font-size: 12px; color: #666; margin-left: 28px; margin-top: 5px; }
            .item-memo { font-size: 11px; color: #555; margin-left: 28px; margin-top: 8px; font-style: italic; padding: 8px; background: white; border-left: 3px solid #3579f6; }
            .memories { margin-left: 28px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #ddd; }
            .memory-title { font-size: 11px; font-weight: bold; color: #ee8700; margin-bottom: 8px; }
            .memory-item { font-size: 11px; color: #444; margin-bottom: 6px; padding-left: 10px; border-left: 3px solid #ffc107; }
            .note-section { margin-top: 30px; padding: 15px; background: #fff9e6; border-left: 5px solid #ffc107; border-radius: 8px; }
            .note-title { font-size: 14px; font-weight: bold; color: #ee8700; margin-bottom: 10px; }
            .note-content { font-size: 12px; color: #555; white-space: pre-wrap; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; text-align: center; }
            .footer p { font-size: 10px; color: #999; }
        </style>
        <div class="header">
            <h1>${title}</h1>
            <p>${subInfo}</p>
            <p style="color: #999; font-size: 12px;">${dayCount}</p>
        </div>
    `;
    
    // 날짜별 일정
    travelData.days.forEach((day, dayIndex) => {
        const dayDate = new Date(day.date);
        const dayLabel = `Day ${dayIndex + 1} - ${dayDate.getMonth() + 1}월 ${dayDate.getDate()}일`;
        
        html += `<div class="day-section"><div class="day-title">${dayLabel}</div>`;
        
        if (day.timeline && day.timeline.length > 0) {
            day.timeline.forEach((item) => {
                const isTransit = item.isTransit || false;
                const icon = isTransit ? '🚗' : '📍';
                const time = item.time || '';
                const itemTitle = item.title || '';
                const location = item.location || '';
                const tag = item.tag || '';
                const memo = item.memo || '';
                
                html += `<div class="timeline-item">`;
                html += `<div class="item-header">`;
                html += `<span class="item-icon">${icon}</span>`;
                html += `<span class="item-time">${time}</span>`;
                html += `<span class="item-title">${itemTitle}</span>`;
                if (tag) {
                    html += `<span class="item-tag">${tag}</span>`;
                }
                html += `</div>`;
                
                if (location) {
                    html += `<div class="item-location">📌 ${location}</div>`;
                }
                
                if (memo) {
                    html += `<div class="item-memo">${memo}</div>`;
                }
                
                // 추억
                if (item.memories && item.memories.length > 0) {
                    html += `<div class="memories">`;
                    html += `<div class="memory-title">💭 추억</div>`;
                    
                    item.memories.forEach((memory) => {
                        if (memory.comment) {
                            const comment = memory.comment.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            html += `<div class="memory-item">${comment}</div>`;
                        }
                    });
                    
                    html += `</div>`;
                }
                
                html += `</div>`;
            });
        }
        
        html += `</div>`;
    });
    
    // 여행 메모
    if (travelData.meta.note) {
        const note = travelData.meta.note.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += `
            <div class="note-section">
                <div class="note-title">📝 여행 메모</div>
                <div class="note-content">${note}</div>
            </div>
        `;
    }
    
    // 푸터
    html += `
        <div class="footer">
            <p>Made with ♥ by PLIN</p>
        </div>
    `;
    
    return html;
}

export function copyShareLink() {
    const copyText = document.getElementById("share-link-input");
    copyText.select();
    copyText.setSelectionRange(0, 99999); 
    navigator.clipboard.writeText(copyText.value).then(() => {
        alert("링크가 복사되었습니다! 친구에게 공유하세요.");
    });
}

export function enableNoteEdit() {
    const noteEl = document.getElementById('detail-note');
    noteEl.readOnly = false;
    noteEl.focus();
}

// [Trip Info Edit Logic]
export function openTripInfoModal() {
    const titleInput = document.getElementById('edit-trip-title');
    const startInput = document.getElementById('edit-trip-start');
    const endInput = document.getElementById('edit-trip-end');

    titleInput.value = travelData.meta.title;
    
    // 날짜 설정
    if (travelData.days && travelData.days.length > 0) {
        startInput.value = travelData.days[0].date;
        endInput.value = travelData.days[travelData.days.length - 1].date;
    } else {
        const today = new Date().toISOString().split('T')[0];
        startInput.value = today;
        endInput.value = today;
    }

    document.getElementById('trip-info-modal').classList.remove('hidden');
}

export function closeTripInfoModal() {
    document.getElementById('trip-info-modal').classList.add('hidden');
}

export function saveTripInfo() {
    const title = document.getElementById('edit-trip-title').value.trim();
    const startStr = document.getElementById('edit-trip-start').value;
    const endStr = document.getElementById('edit-trip-end').value;

    if (!title) return alert("여행 제목을 입력해주세요.");
    if (!startStr || !endStr) return alert("날짜를 선택해주세요.");

    const start = new Date(startStr);
    const end = new Date(endStr);

    if (end < start) return alert("종료일은 시작일보다 빠를 수 없습니다.");

    // 제목 업데이트
    updateMeta('title', title);

    // 날짜 및 기간 업데이트
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const durationText = (diffDays === 0) ? "당일치기" : `${diffDays}박 ${diffDays + 1}일`;
    updateMeta('dayCount', durationText);

    // 서브 정보(날짜 텍스트) 업데이트
    const format = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    let dateStr = format(start);
    if (durationText !== "당일치기") {
        dateStr += ` - ${end.getMonth() + 1}월 ${end.getDate()}일`;
    }
    let prefix = travelData.meta.subInfo && travelData.meta.subInfo.includes('•') ? travelData.meta.subInfo.split('•')[0].trim() : "";
    updateMeta('subInfo', prefix ? `${prefix} • ${dateStr}` : dateStr);

    // Days 배열 재구성
    const totalDays = diffDays + 1;
    const currentTotalDays = travelData.days.length;
    
    // 날짜가 늘어난 경우
    if (totalDays > currentTotalDays) {
        for (let i = currentTotalDays; i < totalDays; i++) {
            travelData.days.push({ date: "", timeline: [] });
        }
    } else if (totalDays < currentTotalDays) {
        // 날짜가 줄어든 경우 뒤에서부터 삭제
        travelData.days.splice(totalDays);
    }

    // 날짜 값 갱신
    travelData.days.forEach((day, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        day.date = d.toISOString().split('T')[0];
    });

    // 현재 인덱스가 범위를 벗어나지 않도록 조정
    if (currentDayIndex >= travelData.days.length) {
        selectDay(travelData.days.length - 1);
    }

    renderItinerary();
    autoSave();
    closeTripInfoModal();
}

export function resetHeroImage() {
    if (confirm("배경 이미지를 초기 설정된 이미지로 되돌리시겠습니까?")) {
        const defaultImg = travelData.meta.defaultMapImage || "https://placehold.co/600x400";
        updateMeta('mapImage', defaultImg);
        renderItinerary();
        autoSave();
    }
}

export function deleteHeroImage() {
    if (confirm("배경 이미지를 삭제하시겠습니까?")) {
        updateMeta('mapImage', "");
        renderItinerary();
        autoSave();
    }
}

// [Expense Logic]
export function renderExpenseList(item) {
    const listEl = document.getElementById('detail-expense-list');
    const totalEl = document.getElementById('detail-total-budget');
    
    if (!item.expenses) item.expenses = [];
    
    let html = '';
    let total = 0;

    item.expenses.forEach((exp, idx) => {
        // 두 형식 모두 지원 (마이그레이션 기간)
        const description = exp.description || exp.desc || '내역 없음';
        const amount = exp.amount || exp.cost || 0;
        
        total += Number(amount);
        html += `
        <div class="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg group">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-700 dark:text-gray-300">${description}</span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm font-bold text-text-main dark:text-white">₩${Number(amount).toLocaleString()}</span>
                <button type="button" onclick="deleteExpense(${idx})" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><span class="material-symbols-outlined text-sm">delete</span></button>
            </div>
        </div>`;
    });

    if (item.expenses.length === 0) {
        html = '<p class="text-xs text-gray-400 text-center py-2">지출 내역이 없습니다.</p>';
    }

    listEl.innerHTML = html;
    
    // 총 예산 업데이트 (지출 내역 합계)
    totalEl.value = total;
    item.budget = total;
}

export function updateTotalBudget() {
    let total = 0;
    if (travelData.days) {
        travelData.days.forEach(day => {
            if (day.timeline) {
                day.timeline.forEach(item => {
                    // 기존 budget 필드
                    if (item.budget) {
                        total += Number(item.budget);
                    }
                    // expenses 배열 합산
                    if (item.expenses && Array.isArray(item.expenses)) {
                        item.expenses.forEach(exp => {
                            total += Number(exp.amount || 0);
                        });
                    }
                });
            }
        });
    }
    travelData.meta.budget = `₩${total.toLocaleString()}`;
}

export function openExpenseModal() {
    document.getElementById('expense-desc').value = "";
    document.getElementById('expense-cost').value = "";
    document.getElementById('expense-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('expense-desc').focus(), 100);
}

export function closeExpenseModal() {
    window.selectedShoppingItemIndex = null; // 초기화
    document.getElementById('expense-modal').classList.add('hidden');
}

export function saveExpense() {
    const desc = document.getElementById('expense-desc').value;
    const cost = document.getElementById('expense-cost').value;
    
    if (!desc || !cost) {
        alert("내역과 금액을 입력해주세요.");
        return;
    }

    const item = travelData.days[targetDayIndex].timeline[viewingItemIndex];
    if (!item.expenses) item.expenses = [];
    
    item.expenses.push({ 
        description: desc, 
        amount: Number(cost) 
    });
    
    // 쇼핑 리스트에서 선택한 항목이 있으면 체크 처리 및 장소 정보 추가
    if (window.selectedShoppingItemIndex !== null && travelData.shoppingList && travelData.shoppingList[window.selectedShoppingItemIndex]) {
        const shoppingItem = travelData.shoppingList[window.selectedShoppingItemIndex];
        shoppingItem.checked = true;
        
        // 장소 정보가 없으면 현재 장소 정보 추가
        if (!shoppingItem.location && item.title) {
            shoppingItem.location = item.title;
            shoppingItem.locationDetail = item.location || '';
        }
        
        // 현재 장소를 저장하여 하이라이트 효과에 사용
        window.lastExpenseLocation = item.title;
        
        window.selectedShoppingItemIndex = null; // 초기화
        renderLists(); // 쇼핑 리스트 UI 업데이트
    }
    
    renderExpenseList(item);
    closeExpenseModal();
    updateTotalBudget();
    
    // 예산 카드 업데이트
    const budgetEl = document.getElementById('budget-amount');
    if (budgetEl) {
        budgetEl.textContent = travelData.meta.budget || '₩0';
    }
    
    renderItinerary();
    autoSave();
}

export function openShoppingListSelector() {
    const modal = document.getElementById('shopping-selector-modal');
    const listContainer = document.getElementById('shopping-selector-list');
    
    if (!travelData.shoppingList || travelData.shoppingList.length === 0) {
        listContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">쇼핑 리스트가 비어있습니다.</p>';
    } else {
        listContainer.innerHTML = travelData.shoppingList.map((item, idx) => `
            <button type="button" onclick="selectShoppingItem(${idx})" class="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-primary hover:bg-primary/5 transition-colors mb-2">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <div class="font-medium text-sm text-gray-800 dark:text-white">${item.text}</div>
                        ${item.location ? `<div class="text-xs text-gray-500 mt-1">${item.location}${item.locationDetail ? ` - ${item.locationDetail}` : ''}</div>` : ''}
                    </div>
                    <span class="material-symbols-outlined text-gray-400">chevron_right</span>
                </div>
            </button>
        `).join('');
    }
    
    modal.classList.remove('hidden');
}

export function closeShoppingListSelector() {
    document.getElementById('shopping-selector-modal').classList.add('hidden');
}

export function selectShoppingItem(idx) {
    const item = travelData.shoppingList[idx];
    const descInput = document.getElementById('expense-desc');
    
    // 선택한 쇼핑 리스트 인덱스 저장
    window.selectedShoppingItemIndex = idx;
    
    // 쇼핑 리스트 항목을 지출 내역에 자동 입력
    descInput.value = item.text;
    
    // 쇼핑 리스트 선택 모달 닫기
    closeShoppingListSelector();
    
    // 금액 입력란에 포커스
    setTimeout(() => {
        document.getElementById('expense-cost').focus();
    }, 100);
}

export function deleteExpense(expIndex) {
    const item = travelData.days[targetDayIndex].timeline[viewingItemIndex];
    item.expenses.splice(expIndex, 1);
    
    renderExpenseList(item);
    updateTotalBudget();
    
    // 예산 카드 업데이트
    const budgetEl = document.getElementById('budget-amount');
    if (budgetEl) {
        budgetEl.textContent = travelData.meta.budget || '₩0';
    }
    
    renderItinerary(); // 전체 예산 갱신
    autoSave();
}

export function openGoogleMapsExternal() {
    const loc = document.getElementById('detail-location-text').innerText;
    if (loc && loc !== '위치 정보 없음') {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`, '_blank');
    }
}

// 휠 이벤트 핸들러 (한 칸씩 이동)
function handleTimeWheel(e) {
    e.preventDefault();
    const container = e.currentTarget;
    const itemHeight = 40;
    const direction = Math.sign(e.deltaY);
    
    // 현재 스크롤 위치에서 가장 가까운 아이템 위치 계산
    const currentScroll = container.scrollTop;
    const targetScroll = Math.round((currentScroll + direction * itemHeight) / itemHeight) * itemHeight;

    container.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
    });
}

// 더블 클릭 핸들러 (직접 입력)
function handleTimeDblClick(e) {
    const container = e.currentTarget; // ul
    const parent = container.parentElement; // div.relative...
    
    // 이미 입력 모드면 무시
    if (parent.querySelector('input')) return;

    const currentVal = getPickerValue(container.id);
    
    // UI 전환
    container.classList.add('hidden');
    // 중앙 강조선 숨기기
    const highlight = parent.querySelector('.absolute.inset-x-0');
    if(highlight) highlight.classList.add('hidden');

    const input = document.createElement('input');
    input.type = 'number';
    input.className = "w-full h-full text-center text-2xl font-bold bg-white dark:bg-card-dark border-2 border-primary rounded-xl outline-none z-20 absolute inset-0";
    input.value = currentVal;
    
    // 범위 설정
    if (container.id === 'time-hour-list') {
        input.min = 1; input.max = 12;
    } else {
        input.min = 0; input.max = 59;
    }

    const finishEdit = () => {
        let val = parseInt(input.value);
        
        // 유효성 검사 및 범위 보정
        if (!isNaN(val)) {
            if (container.id === 'time-hour-list') {
                if (val < 1) val = 1;
                if (val > 12) val = 12;
            } else {
                if (val < 0) val = 0;
                if (val > 59) val = 59;
            }
            
            // 값 적용 (스크롤 이동)
            const items = Array.from(container.children);
            const index = items.findIndex(item => parseInt(item.dataset.value) === val);
            if (index !== -1) {
                container.scrollTop = index * 40;
            }
        }

        // UI 복구
        input.remove();
        container.classList.remove('hidden');
        if(highlight) highlight.classList.remove('hidden');
    };

    input.onblur = finishEdit;
    input.onkeydown = (ev) => {
        if (ev.key === 'Enter') {
            input.blur();
        }
    };

    parent.appendChild(input);
    input.focus();
}

// 카테고리 선택 모달
export function initCategoryModal() {
    const list = document.getElementById('category-grid');
    if (list.children.length === 0) {
        categoryList.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = "flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/30 transition-all aspect-square group";
            btn.onclick = () => selectCategory(cat);
            btn.innerHTML = `
                <div class="w-12 h-12 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center shadow-sm text-gray-500 dark:text-gray-300 group-hover:text-primary group-hover:scale-110 transition-all">
                    <span class="material-symbols-outlined text-2xl">${cat.icon}</span>
                </div>
                <span class="font-bold text-sm">${cat.name}</span>
            `;
            list.appendChild(btn);
        });
    }
}

export function openCategoryModal() {
    initCategoryModal();
    document.getElementById('category-selection-modal').classList.remove('hidden');
}

export function closeCategoryModal() {
    document.getElementById('category-selection-modal').classList.add('hidden');
}

export function selectCategory(cat) {
    const input = document.getElementById('item-category');
    input.value = cat.name;
    input.dataset.value = cat.code;
    closeCategoryModal();
}

// 시간 선택 모달 (일정 시간용)
export function initTimeModal() {
    const hList = document.getElementById('time-hour-list');
    const mList = document.getElementById('time-minute-list');
    
    if (hList.children.length === 0) {
        for(let i=1; i<=12; i++) {
            const li = document.createElement('li');
            li.className = "h-10 flex items-center justify-center snap-center text-lg font-bold text-gray-600 dark:text-gray-300 cursor-pointer transition-colors";
            li.innerText = String(i).padStart(2, '0');
            li.dataset.value = i;
            hList.appendChild(li);
        }
        // 1분 단위로 변경
        for(let i=0; i<60; i++) {
            const li = document.createElement('li');
            li.className = "h-10 flex items-center justify-center snap-center text-lg font-bold text-gray-600 dark:text-gray-300 cursor-pointer transition-colors";
            li.innerText = String(i).padStart(2, '0');
            li.dataset.value = i;
            mList.appendChild(li);
        }

        // 이벤트 리스너 추가 (휠 & 더블클릭)
        hList.addEventListener('wheel', handleTimeWheel, { passive: false });
        mList.addEventListener('wheel', handleTimeWheel, { passive: false });
        
        hList.addEventListener('dblclick', handleTimeDblClick);
        mList.addEventListener('dblclick', handleTimeDblClick);
    }
}

// 휠 피커 값 설정 헬퍼
function setPickerScroll(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const items = Array.from(el.children);
    const index = items.findIndex(item => item.dataset.value == value);
    if (index !== -1) {
        // setTimeout을 사용하여 모달이 렌더링된 후 스크롤 이동
        setTimeout(() => {
            el.scrollTop = index * 40; // h-10 = 40px
        }, 10);
    }
}

// 휠 피커 값 가져오기 헬퍼
function getPickerValue(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return null;
    const index = Math.round(el.scrollTop / 40);
    const items = el.children;
    // 범위 체크
    const safeIndex = Math.max(0, Math.min(index, items.length - 1));
    return items[safeIndex] ? items[safeIndex].dataset.value : null;
}

export function openTimeModal() {
    initTimeModal();
    document.getElementById('time-selection-modal').classList.remove('hidden');
    
    // 현재 입력된 값 파싱해서 기본값 설정
    const currentVal = document.getElementById('item-time').value;
    if (currentVal) {
        const isPM = currentVal.includes('오후');
        const timeParts = currentVal.replace(/[^0-9:]/g, '').split(':');
        if (timeParts.length >= 2) {
            setPickerScroll('time-ampm-list', isPM ? '오후' : '오전');
            setPickerScroll('time-hour-list', parseInt(timeParts[0]));
            setPickerScroll('time-minute-list', parseInt(timeParts[1]));
        }
    }
}

export function closeTimeModal() {
    document.getElementById('time-selection-modal').classList.add('hidden');
}

export function confirmTimeSelection() {
    const ampm = getPickerValue('time-ampm-list') || '오전';
    const h = getPickerValue('time-hour-list') || 12;
    const m = getPickerValue('time-minute-list') || 0;
    document.getElementById('item-time').value = `${ampm} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    closeTimeModal();
}

// [Transit Input Modal Logic]
let transitInputIndex = null;
let transitInputType = null;
let isTransitEditing = false;

// 이동 수단 추가
export function addTransitItem(index, type, dayIndex = currentDayIndex) {
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    const day = travelData.days[dayIndex];
    const tagMap = {
        'airplane': '비행기',
        'train': '기차',
        'bus': '버스',
        'car': '자동차',
        'walk': '도보'
    };

    // 빈 이동수단 아이템 생성
    const newItem = {
        time: "",
        title: "",
        location: "",
        icon: type === 'airplane' ? 'flight' : 'directions_walk',
        tag: tagMap[type] || '도보',
        tagColor: "green",
        isTransit: true,
        detailedSteps: []
    };

    // 타임라인에 추가
    day.timeline.splice(index, 0, newItem);
    autoSave();
    renderItinerary();

    // 바로 상세 모달을 edit 모드로 열기
    setTimeout(() => {
        viewRouteDetail(index, dayIndex, true);
    }, 100);
}

export function openTransitInputModal(index, type = null) {
    transitInputIndex = index;
    transitInputType = type;
    isTransitEditing = type === null; // type이 없으면 수정 모드
    
    const modal = document.getElementById('transit-input-modal');
    const titleEl = document.getElementById('transit-modal-title');
    const startEl = document.getElementById('transit-start-time');
    const endEl = document.getElementById('transit-end-time');
    const noteEl = document.getElementById('transit-note');
    const warningEl = document.getElementById('transit-warning');
    const fetchBtn = document.getElementById('btn-fetch-transit-time');
    
    // 초기화
    startEl.value = "";
    endEl.value = "";
    noteEl.value = "";
    document.getElementById('transit-duration-display').innerText = "--";
    if (warningEl) {
        warningEl.classList.add('hidden');
        warningEl.innerText = "";
    }

    if (isTransitEditing) {
        // 수정 모드: 기존 데이터 불러오기
        const item = travelData.days[targetDayIndex].timeline[index];
        titleEl.innerText = "이동 정보 수정";
        noteEl.value = item.note || "";
        
        // 기존에 저장된 transitInfo가 있다면 사용
        if (item.transitInfo) {
            startEl.value = item.transitInfo.start;
            endEl.value = item.transitInfo.end;
            calculateTransitDuration();
        } else {
            // 없으면 현재 시간 등으로 대략 설정 (여기서는 비워둠)
        }
        
        // [Modified] 수정 모드에서는 구글 맵 가져오기 버튼 숨김
        if (fetchBtn) fetchBtn.classList.add('hidden');
    } else {
        // 추가 모드
        titleEl.innerText = "이동 수단 추가";
        
        // 이전 일정의 시간을 출발 시간으로 자동 설정 시도
        const timeline = travelData.days[targetDayIndex].timeline;
        if (index >= 0 && timeline[index]) {
            const prevItem = timeline[index];
            const prevTimeMinutes = parseTimeStr(prevItem.time);
            if (prevTimeMinutes !== null) {
                const h = Math.floor(prevTimeMinutes / 60);
                const m = prevTimeMinutes % 60;
                startEl.value = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
            }
        }
        
        // [Modified] 추가 모드에서는 버튼 표시
        if (fetchBtn) fetchBtn.classList.remove('hidden');
    }
    
    modal.classList.remove('hidden');
}

export function closeTransitInputModal() {
    document.getElementById('transit-input-modal').classList.add('hidden');
    transitInputIndex = null;
    transitInputType = null;
}

export function calculateTransitDuration() {
    const start = document.getElementById('transit-start-time').value;
    const end = document.getElementById('transit-end-time').value;
    const display = document.getElementById('transit-duration-display');
    const warningEl = document.getElementById('transit-warning');
    
    // 경고 메시지 초기화
    if (warningEl) {
        warningEl.classList.add('hidden');
        warningEl.innerText = "";
    }
    display.innerText = "--";
    
    if (start && end) {
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        const startMins = h1 * 60 + m1;
        const endMins = h2 * 60 + m2;
        
        let diff = endMins - startMins;
        let warningMsg = "";

        // 1. 도착 < 출발 체크
        if (diff < 0) {
            diff += 24 * 60; // 다음날
            warningMsg = "도착 시간이 출발 시간보다 빠릅니다. (다음날 도착)";
        }

        // 2. 이전 일정과 비교 (논리적 순서 체크)
        let prevIndex = isTransitEditing ? transitInputIndex - 1 : transitInputIndex;
        
        if (prevIndex >= 0) {
            const timeline = travelData.days[targetDayIndex].timeline;
            if (timeline && timeline[prevIndex]) {
                const prevItem = timeline[prevIndex];
                let prevEndMins = null;

                if (prevItem.transitInfo && prevItem.transitInfo.end) {
                    // 이전이 이동수단이면 도착 시간 사용
                    const [ph, pm] = prevItem.transitInfo.end.split(':').map(Number);
                    prevEndMins = ph * 60 + pm;
                } else if (prevItem.time) {
                    // 일반 일정이면 시간 파싱
                    prevEndMins = parseTimeStr(prevItem.time);
                }

                if (prevEndMins !== null && startMins < prevEndMins) {
                    if (warningMsg) warningMsg += "\n";
                    warningMsg += "출발 시간이 이전 일정보다 빠릅니다.";
                }
            }
        }

        if (warningMsg && warningEl) {
            warningEl.innerText = warningMsg;
            warningEl.classList.remove('hidden');
        }
        
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        
        let str = "";
        if (h > 0) str += `${h}시간 `;
        str += `${m}분`;
        display.innerText = str;
        return str;
    } else {
        return null;
    }
}

export function fetchTransitTime() {
    if (!window.google || !window.google.maps) {
        alert("Google Maps API가 로드되지 않았습니다.");
        return;
    }

    // [Safety Check] targetDayIndex validity
    if (targetDayIndex === null || targetDayIndex === -1 || !travelData.days[targetDayIndex]) {
        alert("날짜 정보를 찾을 수 없습니다. (전체 보기에서는 사용할 수 없습니다)");
        return;
    }

    const timeline = travelData.days[targetDayIndex].timeline;

    // 유효한 위치 정보를 가진 아이템을 찾는 헬퍼 함수
    const findLocationItem = (startIndex, direction) => {
        let i = startIndex;
        
        // [Fix] 뒤로 검색할 때 시작 인덱스가 배열 범위를 벗어나면 조정 (맨 뒤에 추가하는 경우 대비)
        if (direction === -1 && i >= timeline.length) {
            i = timeline.length - 1;
        }

        while (i >= 0 && i < timeline.length) {
            const item = timeline[i];
            // [Modified] 조건 완화: lat/lng이 있거나, 이동수단/메모가 아니면 위치로 간주 (제목이라도 사용)
            const hasCoords = item.lat && item.lng;
            const isNotTransitOrMemo = !item.isTransit && item.tag !== '메모';
            
            if (hasCoords || isNotTransitOrMemo) {
                return item;
            }
            i += direction;
        }
        return null;
    };

    let prevItem, nextItem;
    const idx = Number(transitInputIndex); // Ensure number

    if (isTransitEditing) {
        // 수정 모드: 현재 아이템을 기준으로 앞뒤 검색
        prevItem = findLocationItem(idx - 1, -1);
        nextItem = findLocationItem(idx + 1, 1);
    } else {
        // 추가 모드: transitInputIndex는 "이 아이템 뒤에 추가"를 의미
        prevItem = findLocationItem(idx, -1);
        nextItem = findLocationItem(idx + 1, 1);
    }

    if (!prevItem || !nextItem) {
        // 도착지가 없는 경우(맨 뒤에 추가)는 출발지만 있어도 검색 시도 가능하게 할지 결정 필요하지만,
        // 구글 경로 검색은 도착지가 필수이므로 에러 메시지 표시
        alert("출발지 또는 도착지 정보를 찾을 수 없어 경로를 검색할 수 없습니다.\n(앞뒤에 위치 정보가 있는 일정이 있어야 합니다. 마지막에 추가하는 경우 도착지가 없어 계산할 수 없습니다.)");
        return;
    }

    const getLoc = (item) => {
        // 1. Google Maps Geometry 우선 확인
        if (item.geometry && item.geometry.location) {
            const loc = item.geometry.location;
            const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
            const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
            return { lat, lng };
        }

        // 2. 텍스트 좌표보다 lat/lng 속성 우선 확인 (함수 여부 체크 포함)
        if (item.lat !== undefined && item.lng !== undefined) {
            const lat = typeof item.lat === 'function' ? item.lat() : Number(item.lat);
            const lng = typeof item.lng === 'function' ? item.lng() : Number(item.lng);
            // NaN 체크: 좌표가 유효한 숫자인지 확인
            if (!isNaN(lat) && !isNaN(lng)) {
                return { lat, lng };
            }
        }

        // 3. 텍스트 반환
        const locStr = (item.location && item.location !== '위치') ? item.location : '';
        if (locStr) return locStr;
        if (item.title) return item.title;
        
        return '';
    };

    const origin = getLoc(prevItem);
    const destination = getLoc(nextItem);

    if (!origin || !destination) {
        alert("출발지 또는 도착지의 위치 정보가 부족합니다.");
        return;
    }

    const startTimeInput = document.getElementById('transit-start-time');
    if (!startTimeInput.value) {
        alert("정확한 검색을 위해 출발 시간을 먼저 입력해주세요.");
        startTimeInput.focus();
        return;
    }

    // 이동 수단 타입에 따른 모드 설정
    let mode = 'transit';
    if (isTransitEditing) {
        const item = travelData.days[targetDayIndex].timeline[transitInputIndex];
        if (item.tag === '도보') mode = 'walking';
        else if (item.tag === '차량') mode = 'driving';
    } else if (transitInputType) {
         if (transitInputType === 'walk') mode = 'walking';
         else if (transitInputType === 'car') mode = 'driving';
    }

    const [h, m] = startTimeInput.value.split(':').map(Number);
    
    // 오늘 날짜 기준으로 시간 설정 (과거 시간이면 API가 동작하지 않을 수 있으므로 현재 시간 이후로 보정하거나 날짜 지정 필요)
    // Mapbox Driving은 departure_time을 지원하지 않지만, 로직 유지를 위해 남겨둠
    const now = new Date();
    const departureTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    if (departureTime < now) {
        departureTime.setDate(departureTime.getDate() + 1); // 시간이 지났으면 내일로 설정
    }

    // [Modified] Use Google Maps DirectionsService directly
    const directionsService = new google.maps.DirectionsService();

    const request = {
        origin: origin,
        destination: destination,
        travelMode: mode.toUpperCase(),
        transitOptions: mode === 'transit' ? { departureTime: departureTime } : undefined
    };

    directionsService.route(request, (result, status) => {
        if (status === 'OK') {
            const route = result.routes[0];
            const leg = route.legs[0];
            
            const durationSec = leg.duration.value;
            const durationText = leg.duration.text;

            // 도착 시간 계산 및 입력
            const startMins = h * 60 + m;
            const durationMins = Math.ceil(durationSec / 60);
            const endMins = startMins + durationMins;
            
            const eh = Math.floor(endMins / 60) % 24;
            const em = endMins % 60;
            
            document.getElementById('transit-end-time').value = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
            
            // 메모에 경로 정보가 없으면 추가
            const noteInput = document.getElementById('transit-note');
            if (!noteInput.value) {
                noteInput.value = `구글맵 경로: ${durationText}`;
            }

            calculateTransitDuration(); // UI 갱신
            alert(`경로를 찾았습니다!\n소요시간: ${durationText}`);
        } else {
            console.error('Directions request failed:', status);
            alert("경로를 찾을 수 없습니다. (Status: " + status + ")");
        }
    });
}

// [Transit Detail Modal Logic]
export function openTransitDetailModal(item, index, dayIndex) {
    setViewingItemIndex(index);
    const modal = document.getElementById('transit-detail-modal');
    
    document.getElementById('transit-detail-icon').innerText = item.icon;
    document.getElementById('transit-detail-title').innerText = item.title;
    document.getElementById('transit-detail-time').innerText = item.time;
    
    // 시간 정보 저장을 위한 hidden input 값 설정
    const tInfo = item.transitInfo || {};
    document.getElementById('transit-detail-start-val').value = tInfo.start || '';
    document.getElementById('transit-detail-end-val').value = tInfo.end || '';
    
    // [Added] 대중교통 상세 정보 (정류장, 방향, 실시간 현황) 표시
    let publicInfoEl = document.getElementById('transit-detail-public-info');
    if (!publicInfoEl) {
        publicInfoEl = document.createElement('div');
        publicInfoEl.id = 'transit-detail-public-info';
        publicInfoEl.className = "w-full mb-6 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 hidden";
        const timeEl = document.getElementById('transit-detail-time').parentElement;
        timeEl.after(publicInfoEl);
    }

    if (['버스', '전철', '기차', '지하철'].some(t => item.tag && item.tag.includes(t)) && (tInfo.depStop || tInfo.arrStop)) {
        publicInfoEl.classList.remove('hidden');
        
        // 실시간 남은 시간 계산 (여행 당일인 경우)
        let statusHtml = '';
        if (tInfo.start) {
            const dayDate = travelData.days[dayIndex].date;
            if (dayDate) {
                const [h, m] = tInfo.start.split(':').map(Number);
                const target = new Date(dayDate);
                target.setHours(h, m, 0, 0);
                const now = new Date();
                
                if (target.toDateString() === now.toDateString()) {
                    const diff = Math.floor((target - now) / 60000);
                    if (diff > 0) statusHtml = `<span class="text-red-500 font-bold animate-pulse">${diff}분 후 도착</span>`;
                    else if (diff > -10) statusHtml = `<span class="text-gray-500 font-bold">도착/출발함</span>`;
                }
            }
        }

        publicInfoEl.innerHTML = `
            <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-center mb-3">
                <div class="flex flex-col items-center min-w-0">
                    <span class="text-[10px] text-gray-400 uppercase font-bold mb-1">출발</span>
                    <span class="font-bold text-sm text-gray-800 dark:text-white leading-tight truncate w-full">${tInfo.depStop || '출발지'}</span>
                    <span class="text-xs text-primary font-bold mt-1">${tInfo.start || '--:--'}</span>
                </div>
                <div class="text-gray-300"><span class="material-symbols-outlined">arrow_forward</span></div>
                <div class="flex flex-col items-center min-w-0">
                    <span class="text-[10px] text-gray-400 uppercase font-bold mb-1">도착</span>
                    <span class="font-bold text-sm text-gray-800 dark:text-white leading-tight truncate w-full">${tInfo.arrStop || '도착지'}</span>
                    <span class="text-xs text-gray-500 mt-1">${tInfo.end || '--:--'}</span>
                </div>
            </div>
            ${tInfo.headsign ? `
            <div class="flex justify-between items-center border-t border-gray-200 dark:border-gray-600 pt-3">
                <span class="text-xs text-gray-500">방향</span>
                <span class="text-sm font-bold text-gray-800 dark:text-white truncate ml-2">${tInfo.headsign}</span>
            </div>` : ''}
            ${statusHtml ? `
            <div class="flex justify-between items-center mt-2">
                <span class="text-xs text-gray-500">실시간 현황</span>
                ${statusHtml}
            </div>` : ''}
        `;
    } else {
        publicInfoEl.classList.add('hidden');
    }

    // [비행기 상세 정보 및 검색 버튼 처리]
    const flightInfoEl = document.getElementById('transit-detail-flight-info');
    const searchBtnEl = document.getElementById('transit-detail-search-btn');
    
    if (item.tag === '비행기') {
        const info = item.transitInfo || {};
        
        document.getElementById('transit-detail-pnr').innerText = info.pnr ? info.pnr.toUpperCase() : '미정';
        document.getElementById('transit-detail-terminal').innerText = info.terminal ? info.terminal.toUpperCase() : '미정';
        document.getElementById('transit-detail-gate').innerText = info.gate ? info.gate.toUpperCase() : '미정';
        
        flightInfoEl.classList.remove('hidden');
        
        // 항공편명 추출 (transitInfo에 없으면 title에서 파싱 시도)
        let flightNum = info.flightNum || (item.title.match(/\(([^)]+)\)/) ? item.title.match(/\(([^)]+)\)/)[1] : '');
        flightNum = flightNum.toUpperCase();
        
        if (flightNum) {
            searchBtnEl.classList.remove('hidden');
            searchBtnEl.innerHTML = `<span class="material-symbols-outlined text-base">search</span> 항공편 검색`;
            searchBtnEl.onclick = () => window.open(`https://www.google.com/search?q=${encodeURIComponent(flightNum + " 항공편")}`, '_blank');
        } else {
            searchBtnEl.classList.add('hidden');
        }
    } else {
        if (flightInfoEl) flightInfoEl.classList.add('hidden');
        
        if (searchBtnEl) {
            const timeline = travelData.days[dayIndex].timeline;
            
            // 유효한 위치 정보를 가진 아이템을 찾는 헬퍼 (앞뒤로 검색)
            const findLocItem = (start, dir) => {
                let i = start;
                while (i >= 0 && i < timeline.length) {
                    const it = timeline[i];
                    if ((it.lat && it.lng) || (!it.isTransit && it.tag !== '메모' && it.location && it.location !== '위치')) {
                        return it;
                    }
                    i += dir;
                }
                return null;
            };

            const originItem = findLocItem(index - 1, -1);
            const destItem = findLocItem(index + 1, 1);

            if (originItem && destItem) {
                searchBtnEl.classList.remove('hidden');
                searchBtnEl.innerHTML = `<span class="material-symbols-outlined text-base">map</span> 경로 보기`;
                searchBtnEl.onclick = () => {
                    const getLocStr = (it) => {
                        // 1. 주소(location) 정보가 유효하면 최우선으로 사용합니다.
                        if (it.location && it.location !== '위치') {
                            return it.location;
                        }
                        // 2. 주소가 없으면 장소명(title)을 사용합니다.
                        if (it.title) {
                            return it.title;
                        }
                        // 3. 둘 다 없으면 최후의 수단으로 좌표를 사용합니다.
                        if (it.lat && it.lng) {
                            return `${it.lat},${it.lng}`;
                        }
                        return ''; // 모든 정보가 없는 경우
                    };
                    const origin = encodeURIComponent(getLocStr(originItem));
                    const destination = encodeURIComponent(getLocStr(destItem));
                    
                    let mode = 'transit';
                    if (item.tag === '도보') mode = 'walking';
                    else if (item.tag === '차량') mode = 'driving';
                    
                    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`, '_blank');
                };
            } else {
                searchBtnEl.classList.add('hidden');
            }
        }
    }

    // Route Text
    const timeline = travelData.days[dayIndex].timeline;
    const prevItem = index > 0 ? timeline[index - 1] : null;
    const nextItem = index < timeline.length - 1 ? timeline[index + 1] : null;
    const prevLoc = prevItem ? (prevItem.title || "출발지") : "출발지";
    const nextLoc = nextItem ? (nextItem.title || "도착지") : "도착지";
    
    let routeText = `${prevLoc} ➡️ ${nextLoc}`;
    if (item.tag === '비행기' && item.location && item.location.includes('✈️')) {
        routeText = item.location;
    }
    document.getElementById('transit-detail-route').innerText = routeText;
    
    document.getElementById('transit-detail-note').innerText = item.note || "메모가 없습니다.";

    // Detailed Steps (Ekispert 등 다단계 경로)
    const stepsContainer = document.getElementById('transit-detail-steps');
    const stepsList = document.getElementById('transit-detail-steps-list');
    
    if (item.detailedSteps && item.detailedSteps.length > 0) {
        stepsContainer.classList.remove('hidden');
        stepsList.innerHTML = '';
        
        item.detailedSteps.forEach((step, idx) => {
            const stepCard = document.createElement('div');
            stepCard.className = 'bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3';
            
            // 태그 색상 처리
            let tagHtml = '';
            if (step.color && step.color.startsWith('rgb')) {
                // RGB 색상값 사용 (Ekispert API 등)
                const bgColor = step.color;
                const txtColor = step.textColor || 'white';
                tagHtml = `<span style="background-color: ${bgColor}; color: ${txtColor};" class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">${step.tag}</span>`;
            } else if (step.tagColor && step.tagColor.startsWith('rgb')) {
                // 하위 호환성
                tagHtml = `<span style="background-color: ${step.tagColor}; color: white;" class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">${step.tag}</span>`;
            } else {
                // Tailwind 클래스 사용
                const colorMap = {
                    'blue': 'bg-blue-500 text-white',
                    'green': 'bg-green-500 text-white',
                    'red': 'bg-red-500 text-white',
                    'orange': 'bg-orange-500 text-white',
                    'purple': 'bg-purple-500 text-white',
                    'gray': 'bg-gray-500 text-white'
                };
                const tagClass = colorMap[step.tagColor] || 'bg-blue-500 text-white';
                tagHtml = `<span class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${tagClass}">${step.tag}</span>`;
            }
            
            stepCard.innerHTML = `
                <span class="material-symbols-outlined text-gray-600 dark:text-gray-300">${step.icon}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        ${tagHtml}
                        <span class="text-xs text-gray-500 dark:text-gray-400">${step.time}</span>
                    </div>
                    <p class="text-sm font-bold text-gray-800 dark:text-white truncate">${step.title}</p>
                    ${step.transitInfo?.depStop && step.transitInfo?.arrStop ? `
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ${step.transitInfo.depStop} → ${step.transitInfo.arrStop}
                        ${step.transitInfo.stopCount ? ` (${step.transitInfo.stopCount}정거장)` : ''}
                    </p>
                    ` : ''}
                </div>
            `;
            
            stepsList.appendChild(stepCard);
        });
    } else {
        stepsContainer.classList.add('hidden');
    }

    // Attachments
    renderAttachments(item, 'transit-attachment-list');

    modal.classList.remove('hidden');
}

export function closeTransitDetailModal(fromHistory = false) {
    document.getElementById('transit-detail-modal').classList.add('hidden');
    setViewingItemIndex(null);
}

export function editCurrentTransitItem() {
    if (viewingItemIndex !== null) {
        const idx = viewingItemIndex;
        
        // 저장해둔 시간 값을 가져옵니다.
        const savedStart = document.getElementById('transit-detail-start-val').value;
        const savedEnd = document.getElementById('transit-detail-end-val').value;

        isEditingFromDetail = true;
        closeTransitDetailModal();
        // 모달 닫힘 애니메이션 등을 고려해 약간 지연 후 열기
        setTimeout(() => {
            editTimelineItem(idx, targetDayIndex);
            // 수정 모달의 입력창에 값을 설정하고 소요 시간을 갱신합니다.
            if (savedStart) document.getElementById('transit-start-time').value = savedStart;
            if (savedEnd) document.getElementById('transit-end-time').value = savedEnd;
            calculateTransitDuration();
        }, 50);
    }
}

export function deleteCurrentTransitItem() {
    if (viewingItemIndex !== null) {
        if (confirm("이 항목을 삭제하시겠습니까?")) {
            travelData.days[targetDayIndex].timeline.splice(viewingItemIndex, 1);
            reorderTimeline(targetDayIndex);
            closeTransitDetailModal();
        }
    }
}

// [Flight Input Modal Logic]
let flightInputIndex = null;
let isFlightEditing = false;

// 주요 공항 데이터 (자동완성용)
const majorAirports = [
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

export function openFlightInputModal(index, isEdit = false) {
    flightInputIndex = index;
    isFlightEditing = isEdit;

    // 초기화
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

    flightNumInput.value = "";
    pnrInput.value = "";
    depInput.value = "";
    arrInput.value = "";
    depTimeInput.value = "";
    arrTimeInput.value = "";
    terminalInput.value = "";
    gateInput.value = "";
    noteInput.value = "";
    
    // 공항 자동완성 리스트 채우기 (최초 1회)
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

        if (info.depTime) depTimeInput.value = info.depTime;
        if (info.arrTime) arrTimeInput.value = info.arrTime;
        if (info.terminal) terminalInput.value = info.terminal;
        if (info.gate) gateInput.value = info.gate;
        if (info.userNote) noteInput.value = info.userNote;
    } else {
        modalTitle.innerText = "항공편 정보 입력";
        saveBtn.innerText = "추가";
    }
    
    // 엔터 키로 검색 가능하게 설정
    flightNumInput.onkeydown = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchFlightNumber();
        }
    };

    // 공항 입력 필드 엔터 키 자동완성 처리
    const handleAirportEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = e.target.value.trim();
            if (!val) return;

            // 매칭되는 공항 찾기 (코드 또는 이름)
            const match = majorAirports.find(ap => 
                ap.name.includes(val) || 
                ap.code.includes(val.toUpperCase())
            );
            
            if (match) {
                e.target.value = `${match.code} (${match.name})`;
                // 다음 필드로 포커스 이동
                if (e.target.id === 'flight-dep-airport') {
                    arrInput.focus();
                }
            }
        }
    };

    depInput.onkeydown = handleAirportEnter;
    arrInput.onkeydown = handleAirportEnter;

    document.getElementById('flight-input-modal').classList.remove('hidden');
    setTimeout(() => flightNumInput.focus(), 100);
}

export function closeFlightInputModal() {
    document.getElementById('flight-input-modal').classList.add('hidden');
    flightInputIndex = null;
}

export function searchFlightNumber() {
    const flightNum = document.getElementById('flight-number').value.trim();
    if (!flightNum) {
        alert("항공편명을 입력해주세요 (예: KE123)");
        return;
    }
    window.open(`https://www.google.com/search?q=${encodeURIComponent(flightNum + " 항공편")}`, '_blank');
}
window.searchFlightNumber = searchFlightNumber;

export function saveFlightItem() {
    const flightNum = document.getElementById('flight-number').value;
    const pnr = document.getElementById('flight-pnr').value;
    const depAirport = document.getElementById('flight-dep-airport').value;
    const arrAirport = document.getElementById('flight-arr-airport').value;
    const depTime = document.getElementById('flight-dep-time').value;
    const arrTime = document.getElementById('flight-arr-time').value;
    const terminal = document.getElementById('flight-terminal').value;
    const gate = document.getElementById('flight-gate').value;
    const userNote = document.getElementById('flight-note').value;

    // 소요 시간 계산
    let durationStr = "2시간"; // 기본값
    if (depTime && arrTime) {
        const [h1, m1] = depTime.split(':').map(Number);
        const [h2, m2] = arrTime.split(':').map(Number);
        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60; // 다음날 도착 가정
        
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
        transitInfo: { 
            terminal: terminal.toUpperCase(), 
            gate: gate.toUpperCase(),
            flightNum: flightNum.toUpperCase(),
            pnr: pnr.toUpperCase(),
            depAirport: depAirport.toUpperCase(),
            arrAirport: arrAirport.toUpperCase(),
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
    isEditingFromDetail = false;
}

// 자동 저장 헬퍼 함수
// AutoSave debouncing
let autoSaveTimeout = null;

export async function autoSave() {
    if (!isEditing && currentUser && currentTripId) {
        // Debounce: 500ms 대기 후 저장 (연속 호출 시 마지막 것만 실행)
        if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
        }
        
        autoSaveTimeout = setTimeout(async () => {
            try {
                // [핵심] JSON 변환을 통해 undefined 값을 가진 필드를 자동으로 제거함
                const cleanData = JSON.parse(JSON.stringify(travelData));
                await setDoc(doc(db, "plans", currentTripId), cleanData);
            } catch (e) {
                console.error("Auto-save failed", e);
            }
        }, 500);
    }
}

export function renderItinerary() {    
    // 일일 총 지출 계산
    let dailyTotal = 0;
    const calcTimeline = (currentDayIndex === -1) ? [] : (travelData.days[currentDayIndex] ? travelData.days[currentDayIndex].timeline : []);
    if (currentDayIndex !== -1) {
        calcTimeline.forEach(item => { if (item.budget) dailyTotal += Number(item.budget); });
    }

    // 1. 메타 정보 채우기 - 사용자 아이콘 캐싱 적용
    let userImg = travelData.meta.userImage || localStorage.getItem('cachedUserPhotoURL') || "https://placehold.co/100";
    if (userImg.includes('via.placeholder.com')) userImg = localStorage.getItem('cachedUserPhotoURL') || "https://placehold.co/100";
    
    const userAvatarEl = document.getElementById('user-avatar');
    if (userAvatarEl) {
        userAvatarEl.style.backgroundImage = `url('${userImg}')`;
        // 이미지 로드 실패 시 대비
        const testImg = new Image();
        testImg.onload = () => { /* 정상 로드 */ };
        testImg.onerror = () => {
            // 로드 실패 시 캐싱된 이미지 사용
            const cached = localStorage.getItem('cachedUserPhotoURL');
            if (cached && cached !== userImg) {
                userAvatarEl.style.backgroundImage = `url('${cached}')`;
            }
        };
        testImg.src = userImg;
    }
    
    // 지도 로드 여부와 상관없이 배경 이미지 설정 (지도가 로드되지 않았거나 투명할 때 대비)
    let bgImg = travelData.meta.mapImage || "https://placehold.co/600x400";
    if (bgImg.includes('via.placeholder.com')) bgImg = "https://placehold.co/600x400";
    document.getElementById('map-bg').style.backgroundImage = `url('${bgImg}')`;
    const heroEl = document.getElementById('trip-hero');
    if (heroEl) heroEl.style.backgroundImage = `url('${bgImg}')`;

    // Google Map 위치 업데이트 (초기화 확인)
    try {
        if (googleMap && mapMarker) {
            const lat = Number(travelData.meta.lat);
            const lng = Number(travelData.meta.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                const pos = { lat, lng };
                if (googleMap.panTo) googleMap.panTo(pos);
                if (mapMarker.setPosition) mapMarker.setPosition(pos);
            }
        }
    } catch (e) {
        // googleMap이 아직 초기화되지 않았을 수 있음
        console.debug('Map not initialized yet');
    }

    if (isEditing) {
        // Edit Mode: Meta Inputs
        
        // Hero Image Upload Overlay
        if (heroEl) {
            heroEl.innerHTML = `
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer hover:bg-black/50 transition-colors" onclick="document.getElementById('hero-image-upload').click()">
                    <div class="text-white flex flex-col items-center gap-2">
                        <span class="material-symbols-outlined text-4xl">add_a_photo</span>
                        <span class="font-bold text-sm">배경 이미지 변경</span>
                    </div>
                </div>
            `;
        }

        // 기간 입력 (N박 M일)
        document.getElementById('trip-day-count').innerText = travelData.meta.dayCount;
        
        document.getElementById('trip-title').innerHTML = `<input type="text" class="bg-gray-50 border border-gray-300 rounded px-2 py-1 text-2xl font-bold w-full" value="${travelData.meta.title}" onchange="updateMeta('title', this.value)">`;
        
        // 날짜 범위 수정 UI
        const startDate = travelData.days[0]?.date || new Date().toISOString().split('T')[0];
        const endDate = travelData.days[travelData.days.length - 1]?.date || new Date().toISOString().split('T')[0];
        document.getElementById('trip-date-info').innerHTML = `
            <div class="flex items-center gap-2"><input type="date" id="edit-start-date" class="bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm" value="${startDate}" onchange="updateDateRange()"><span class="text-gray-400">~</span><input type="date" id="edit-end-date" class="bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm" value="${endDate}" onchange="updateDateRange()"></div>`;
        
        // 날씨는 자동 업데이트되므로 편집 모드에서도 수정 불가 (텍스트로 표시)
        document.getElementById('weather-temp').innerText = travelData.meta.weather.temp;
        document.getElementById('weather-range').innerText = `${travelData.meta.weather.minTemp || '-'} / ${travelData.meta.weather.maxTemp || '-'}`;
        document.getElementById('weather-desc').innerText = travelData.meta.weather.desc;
        
        document.getElementById('budget-amount').innerText = `₩${dailyTotal.toLocaleString()}`;
    } else {
        // View Mode: Text
        
        // Reset Hero Overlay
        if (heroEl) {
            heroEl.innerHTML = '<div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>';
        }

        // "1일" 또는 "당일"이 포함되면 "당일치기"로 표시
        let durationText = travelData.meta.dayCount;
        if (durationText === "1일" || durationText === "당일") {
            durationText = "당일치기";
        }
        document.getElementById('trip-day-count').innerText = durationText;
        
        document.getElementById('trip-title').innerText = travelData.meta.title;
        
        // 날짜 범위 표시 로직 (시작일 - 종료일)
        let dateDisplay = travelData.meta.subInfo;
        if (travelData.days && travelData.days.length > 0) {
            const start = new Date(travelData.days[0].date);
            const end = new Date(travelData.days[travelData.days.length - 1].date);
            const format = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
            
            let dateStr = format(start);
            if (travelData.meta.dayCount !== "당일치기" && start.getTime() !== end.getTime()) {
                dateStr += ` - ${end.getMonth() + 1}월 ${end.getDate()}일`;
            }
            
            const parts = travelData.meta.subInfo.split('•');
            dateDisplay = parts.length > 1 ? `${parts[0].trim()} • ${dateStr}` : dateStr;
        }
        document.getElementById('trip-date-info').innerText = dateDisplay;

        document.getElementById('weather-temp').innerText = travelData.meta.weather.temp;
        document.getElementById('weather-range').innerText = `${travelData.meta.weather.minTemp || '-'} / ${travelData.meta.weather.maxTemp || '-'}`;
        document.getElementById('weather-desc').innerText = travelData.meta.weather.desc;
        if (currentDayIndex === -1) {
            document.getElementById('budget-amount').innerText = travelData.meta.budget; // 전체 예산
        } else {
            document.getElementById('budget-amount').innerText = `₩${dailyTotal.toLocaleString()}`;
        }
        
    }

    renderLists();
    updateLocalTimeWidget(); // [Added] 시간 위젯 업데이트

    // 2. 날짜 탭 만들기
    const tabsEl = document.getElementById('day-tabs');
    let tabsHtml = '';

    if (!travelData.days) travelData.days = [];
    const isSingleDay = travelData.days.length === 1;

    // 전체 보기 탭 추가
    const isAllActive = currentDayIndex === -1 || isSingleDay;
    const allActiveClass = isAllActive 
        ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" 
        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
    tabsHtml += `
        <button type="button" onclick="selectDay(-1)" class="flex flex-col items-center justify-center px-6 py-3 rounded-t-lg transition-colors ${allActiveClass}">
            <span class="text-xs font-semibold uppercase">전체</span>
        </button>`;
    
    if (!isSingleDay) {
        travelData.days.forEach((day, index) => {
            const isActive = index === currentDayIndex;
            const activeClass = isActive 
                ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" 
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
            
            tabsHtml += `
            <button type="button" onclick="selectDay(${index})" class="flex flex-col items-center justify-center px-6 py-3 rounded-t-lg transition-colors ${activeClass}">
                <span class="text-xs font-semibold uppercase">${index + 1}일차</span>
            </button>
            `;
        });
    }

    tabsEl.innerHTML = tabsHtml;

    // 3. 타임라인 리스트 만들기
    const listEl = document.getElementById('timeline-list');
    let html = '';
    
    if (currentDayIndex === -1 || isSingleDay) {
        // 전체 보기 모드
        travelData.days.forEach((day, dayIdx) => {
            // [Modified] 당일치기인 경우 '1일차' 배지 숨김
            const dayBadge = isSingleDay ? '' : `<div class="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-sm">${dayIdx + 1}일차</div>`;

            html += `
                <div class="mb-8">
                    <div class="flex items-center gap-4 mb-4 pl-2">
                        ${dayBadge}
                        <div class="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                        <div class="text-xs text-gray-400">${day.date}</div>
                    </div>
                    <div class="flex flex-col">
            `;
            
            if (day.timeline && day.timeline.length > 0) {
                day.timeline.forEach((item, index) => {
                    const isLast = index === day.timeline.length - 1;
                    const isFirst = index === 0;
                    html += renderTimelineItemHtml(item, index, dayIdx, isLast, isFirst);
                });
            } else {
                html += `<div class="text-center py-4 text-gray-400 text-sm">일정이 없습니다.</div>`;
            }
            
            // 날짜별 일정 추가 버튼 (전체 보기에서도 추가 가능하도록, memoryLocked가 아닐 때만)
            const isMemoryLocked = travelData.meta.memoryLocked || false;
            if (!isMemoryLocked) {
                html += `
                    <div class="flex justify-center mt-2">
                        <button type="button" onclick="openAddModal(${day.timeline.length}, ${dayIdx})" class="text-xs text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">add</span> 일정 추가
                        </button>
                    </div>`;
            }
            html += `
                </div>
            </div>`;
        });
    } else {
        // 단일 날짜 보기 모드
        const currentTimeline = travelData.days[currentDayIndex] ? travelData.days[currentDayIndex].timeline : [];
        currentTimeline.forEach((item, index) => {
            const isLast = index === currentTimeline.length - 1;
        const isFirst = index === 0;
            html += renderTimelineItemHtml(item, index, currentDayIndex, isLast, isFirst);
        });
        
        // [Added] 마지막 위치 드롭 영역 (드래그앤드롭 마지막 아이템 지원)
        if (currentTimeline.length > 0) {
            html += `
                <div 
                    ondragover="dragOver(event)" 
                    ondragleave="dragLeave(event)" 
                    ondrop="timelineContainerDrop(event, ${currentDayIndex})"
                    class="h-8 relative mx-6"
                    style="z-index: 1;"
                >
                    <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-50 shadow-sm pointer-events-none"></div>
                </div>
            `;
        }
        
        // 타임라인이 비어있을 때 안내 메시지
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
    
    // 추억 잠금 버튼 업데이트 (여행 완료 상태일 때만 표시)
    const memoryLockBtnContainer = document.getElementById('memory-lock-btn-container');
    const memoryLockBtn = document.getElementById('memory-lock-btn');
    if (memoryLockBtnContainer && memoryLockBtn && getTripStatus(travelData) === 'completed') {
        memoryLockBtnContainer.classList.remove('hidden');
        const isLocked = travelData.meta.memoryLocked || false;
        const icon = memoryLockBtn.querySelector('.material-symbols-outlined');
        const text = memoryLockBtn.querySelector('span:last-child');
        
        if (isLocked) {
            // 잠금 상태
            memoryLockBtn.className = 'px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600';
            icon.textContent = 'lock';
            text.textContent = '추억 고치기';
        } else {
            // 해제 상태
            memoryLockBtn.className = 'px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-sm bg-primary text-white hover:bg-orange-500';
            icon.textContent = 'check_circle';
            text.textContent = '추억 저장 완료';
        }
    } else if (memoryLockBtnContainer) {
        memoryLockBtnContainer.classList.add('hidden');
    }
}

// [Added] 현지 시간 및 시차 계산 위젯 업데이트 함수
let timeUpdateInterval = null;

function updateLocalTimeWidget() {
    const timezone = travelData.meta.timezone;
    const displayEl = document.getElementById('local-time-display');
    const diffEl = document.getElementById('time-diff-display');
    
    if (!displayEl || !timezone) return;

    const update = () => {
        const now = new Date();
        
        // 1. 현지 시간 표시
        const localTimeStr = now.toLocaleTimeString('ko-KR', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        displayEl.innerText = localTimeStr;

        // 2. 시차 계산 (내 위치 vs 여행지)
        // 현재 브라우저 시간과 타겟 타임존의 시간을 비교
        const targetDateStr = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(now);
        const myDateStr = new Intl.DateTimeFormat('en-US', { hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(now);
        
        const targetDate = new Date(targetDateStr);
        const myDate = new Date(myDateStr);
        
        const diffMs = targetDate - myDate;
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        
        let diffText = "시차 없음";
        if (diffHours > 0) {
            diffText = `내 위치보다 ${Math.abs(diffHours)}시간 빠름`;
        } else if (diffHours < 0) {
            diffText = `내 위치보다 ${Math.abs(diffHours)}시간 느림`;
        }
        diffEl.innerText = diffText;
    };

    update(); // 즉시 실행
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    timeUpdateInterval = setInterval(update, 60000); // 1분마다 갱신
}

// 타임라인 아이템 HTML 생성 헬퍼 함수
function renderTimelineItemHtml(item, index, dayIndex, isLast, isFirst) {
    // 아이콘 및 라인 스타일
    const lineStyle = isLast 
        ? `bg-gradient-to-b from-gray-200 to-transparent dark:from-gray-700` 
            : `bg-gray-200 dark:bg-gray-700`;
        
        const linePosition = isFirst ? 'top-6 -bottom-8' : 'top-0 -bottom-8';
        let iconBg = item.isTransit ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-card-dark';
        let iconColor = item.isTransit ? 'text-primary/70' : 'text-primary';
        let iconStyle = '';

        if (item.tag === '메모') {
            iconBg = 'bg-yellow-50 dark:bg-yellow-900/20';
            iconColor = 'text-yellow-600 dark:text-yellow-400';
        } else if (item.color) {
            // [Added] 구글맵 노선 색상 적용
            iconBg = ''; // 기본 배경 클래스 제거
            iconColor = ''; // 기본 아이콘 색상 클래스 제거
            const fgColor = item.textColor || '#ffffff';
            // 배경색, 테두리색, 아이콘색(상속) 설정
            iconStyle = `background-color: ${item.color}; color: ${fgColor}; border-color: ${item.color};`;
        }

        // 편집 모드일 때 스타일 및 이벤트
        const editClass = isEditing ? "edit-mode-active ring-2 ring-primary/50 ring-offset-2" : "cursor-pointer hover:shadow-lg transform transition-all hover:-translate-y-1";
        const clickHandler = isEditing ? `onclick="editTimelineItem(${index}, ${dayIndex})"` : `onclick="viewTimelineItem(${index}, ${dayIndex})"`;

        // 컨텍스트 메뉴 이벤트 (우클릭)
        const contextHandler = `oncontextmenu="openContextMenu(event, 'item', ${index}, ${dayIndex})"`;
        
        // 추억 잠금 상태 확인
        const isMemoryLocked = travelData.meta.memoryLocked || false;
        
        // 드래그 속성: memoryLocked이면 비활성화
        const draggableAttr = (currentDayIndex === -1 || isMemoryLocked) ? 'draggable="false"' : `draggable="true" ondragstart="dragStart(event, ${index})" ondragend="dragEnd(event)" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="drop(event, ${index})" data-drop-index="${index}"`;
        // z-index 설정: 위쪽 아이템이 아래쪽 아이템보다 위에 오도록 하여 하단 버튼 클릭 가능하게 함
    // 전체 보기일 때는 dayIndex도 고려해야 하지만, 간단히 100 - index로 처리 (같은 날짜 내에서만 겹침 발생하므로)
    const zIndex = 100 - index;

    let html = `
        <div 
            ${draggableAttr}
            ontouchstart="touchStart(event, ${index}, 'item')"
            ontouchmove="touchMove(event)"
            ontouchend="touchEnd(event)"
            data-index="${index}"
            style="z-index: ${zIndex};"
            class="relative grid grid-cols-[auto_1fr] gap-x-3 md:gap-x-6 group/timeline-item pb-8 timeline-item-transition rounded-xl"
            ${contextHandler}
        >
        <!-- 드래그 인디케이터 (카드 사이 중앙 선) -->
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

        if (item.image) {
            // 이미지 카드
            html += `
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
                </div>
                <div class="p-3 md:p-4 flex justify-between items-center">
                    <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded text-sm font-medium text-text-main dark:text-gray-300">
                        <span class="material-symbols-outlined text-[18px]">schedule</span>
                        ${item.time}
                    </div>
                </div>
            </div>`;
        } else if (item.tag === '메모') {
            // 메모 카드 (포스트잇 스타일)
            html += `
            <div class="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/30 rounded-lg p-3 flex items-center gap-3 justify-between ${editClass}" ${clickHandler}>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200 break-words whitespace-pre-wrap leading-relaxed font-body">${item.title}</p>
                </div>
                ${isEditing ? `<button type="button" onclick="event.stopPropagation(); deleteTimelineItem(${index}, ${dayIndex})" class="text-red-500 hover:bg-red-50 p-2 rounded-full flex-shrink-0"><span class="material-symbols-outlined text-lg">delete</span></button>` : ''}
            </div>`;
        } else if (item.isTransit) {
            // 이동(Transit) 카드 - 모든 이동 수단을 클릭하면 경로 상세 모달 표시
            const hasDetailedSteps = item.isCollapsed && item.detailedSteps && item.detailedSteps.length > 0;
            const isAirplane = item.transitType === 'airplane';
            
            // 대중교통 노선 정보 추출 (도보 제외)
            let transitLinesHTML = '';
            if (hasDetailedSteps) {
                const transitSteps = item.detailedSteps.filter(step => step.tag !== '도보' && step.transitInfo);
                if (transitSteps.length > 0) {
                    transitLinesHTML = transitSteps.map((step, idx) => {
                        // step.tag에 노선명이 있음 (예: "7호선", "6019", "미도스지선 M")
                        const lineName = step.tag || step.title.match(/\(([^)]+)\)/)?.[1] || '대중교통';
                        let icon = 'directions_bus';
                        if (step.icon === 'subway') icon = 'subway';
                        else if (step.icon === 'train') icon = 'train';
                        
                        // 색상 처리: step.color 우선, 없으면 기본 색상
                        const bgColor = step.color || '#3b82f6';
                        const textColor = step.textColor || '#ffffff';
                        const arrow = idx < transitSteps.length - 1 ? '<span class="text-gray-400 mx-1">→</span>' : '';
                        
                        return `<div class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold shadow-sm" style="background-color: ${bgColor}; color: ${textColor}">
                            <span class="material-symbols-outlined text-sm">${icon}</span>
                            <span>${lineName}</span>
                        </div>${arrow}`;
                    }).join('');
                }
            }
            
            if (isAirplane && item.flightInfo) {
                // 비행기 카드
                const departureDisplay = item.flightInfo.departure || '출발';
                const arrivalDisplay = item.flightInfo.arrival || '도착';
                
                html += `
                <div class="bg-blue-50/50 dark:bg-card-dark/40 border border-blue-100 dark:border-gray-800 rounded-lg p-3 ${editClass}" onclick="viewRouteDetail(${index}, ${dayIndex})">
                    <div class="flex items-center gap-3 mb-2">
                        <span class="material-symbols-outlined text-primary text-2xl">flight</span>
                        <div class="flex-1">
                            <div class="font-bold text-sm">${departureDisplay} ✈️ ${arrivalDisplay}</div>
                            <div class="text-xs text-gray-500">${item.flightInfo.flightNumber || ''} ${item.flightInfo.bookingRef ? '· ' + item.flightInfo.bookingRef : ''}</div>
                        </div>
                        <div class="text-sm font-bold bg-white dark:bg-card-dark rounded px-3 py-1">${item.time || '--:--'}</div>
                    </div>
                    ${item.flightInfo.departureTime && item.flightInfo.arrivalTime ? `
                    <div class="text-xs text-gray-500 pl-9">
                        ${item.flightInfo.departureTime} → ${item.flightInfo.arrivalTime} · ${item.flightInfo.duration || ''}
                    </div>
                    ` : item.flightInfo.terminal || item.flightInfo.gate ? `
                    <div class="text-xs text-gray-500 pl-9">
                        ${item.flightInfo.terminal ? '터미널 ' + item.flightInfo.terminal : ''} 
                        ${item.flightInfo.gate ? ' · 게이트 ' + item.flightInfo.gate : ''}
                    </div>
                    ` : ''}
                </div>`;
            } else {
                // 일반 이동수단 카드
                html += `
                <div class="bg-blue-50/50 dark:bg-card-dark/40 border border-blue-100 dark:border-gray-800 rounded-lg p-3 flex flex-col gap-2 ${editClass}" onclick="viewRouteDetail(${index}, ${dayIndex})">
                    <div class="flex items-center gap-2 md:gap-4 justify-between">
                        <div class="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                            <div class="flex flex-col items-center justify-center bg-white dark:bg-card-dark rounded px-2 md:px-3 py-1 shadow-sm text-xs font-bold text-text-main dark:text-white min-w-[60px] md:min-w-[70px]">
                                <span>${item.duration || item.time || '30분'}</span>
                            </div>
                            ${transitLinesHTML ? `<div class="flex items-center flex-wrap gap-1 flex-1 min-w-0">${transitLinesHTML}</div>` : 
                            `<div class="flex items-center gap-2 flex-1 min-w-0">
                                <div class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold shadow-sm bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                                    <span class="material-symbols-outlined text-sm">${item.icon}</span>
                                    <span>${item.tag}</span>
                                </div>
                                <p class="text-sm font-bold text-text-main dark:text-white truncate">${item.title || ''}</p>
                            </div>`}
                        </div>
                        <div class="flex items-center gap-1">
                            ${hasDetailedSteps ? `<button type="button" onclick="event.stopPropagation(); viewRouteDetail(${index}, ${dayIndex})" class="text-primary hover:bg-orange-100 dark:hover:bg-orange-900/30 p-1 rounded-full flex-shrink-0"><span class="material-symbols-outlined text-lg">info</span></button>` : ''}
                        </div>
                    </div>
                    ${item.transitInfo?.summary ? `<p class="text-xs text-text-muted dark:text-gray-400 pl-[76px] md:pl-[86px]">${item.transitInfo.summary}</p>` : ''}
                </div>`;
            }
        } else {
            // 일반 카드
            html += `
            <div class="bg-card-light dark:bg-card-dark rounded-xl p-3 md:p-5 shadow-sm border border-gray-100 dark:border-gray-800 ${editClass}" ${clickHandler}>
                <div class="flex justify-between items-start mb-2 gap-2">
                    <div class="flex-1 min-w-0">
                        <h3 class="text-lg font-bold text-text-main dark:text-white break-words">${item.title}</h3>
                        <p class="text-sm text-text-muted dark:text-gray-400 flex items-center gap-1 mt-1 min-w-0">
                            <span class="material-symbols-outlined text-[16px] flex-shrink-0">location_on</span>
                            <span class="truncate flex-1">${item.location}</span>
                        </p>
                    </div>
                    ${item.tag ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 flex-shrink-0 whitespace-nowrap">${item.tag}</span>` : ''}
                    ${isEditing ? `<button type="button" onclick="event.stopPropagation(); deleteTimelineItem(${index}, ${dayIndex})" class="text-red-500 hover:bg-red-50 p-1 rounded flex-shrink-0"><span class="material-symbols-outlined text-lg">delete</span></button>` : ''}
                </div>
                <div class="flex items-center gap-4 text-sm font-medium text-text-main dark:text-gray-300">
                    <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded flex-shrink-0">
                        <span class="material-symbols-outlined text-[18px]">schedule</span>
                        ${item.time}
                    </div>
                    ${item.note ? `
                    <div class="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                        <span class="material-symbols-outlined text-[14px] flex-shrink-0">info</span> 
                        <span class="truncate">${item.note}</span>
                    </div>` : ''}
                </div>
            </div>`;
        }
        
        // 메모리 섹션 추가 (여행 완료 상태일 때만)
        if (getTripStatus(travelData) === 'completed' && item.memories && item.memories.length > 0) {
            html += `
            <div class="mt-4 flex flex-col gap-3">
                ${item.memories.map((memory, memIdx) => {
                    const date = new Date(memory.createdAt).toLocaleDateString('ko-KR', {
                        month: 'short',
                        day: 'numeric'
                    });
                    return `
                    <div class="bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 relative transform hover:shadow-md transition-shadow" style="transform: rotate(-${(memIdx % 2) ? '2deg' : '2deg'}); margin-left: ${memIdx % 2 ? '10px' : '0px'}">
                        ${memory.photoUrl ? `<img src="${memory.photoUrl}" alt="Memory" class="w-full h-40 object-cover">` : ''}
                        <div class="p-3">
                            <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-body leading-relaxed">${memory.comment}</p>
                            <div class="flex justify-between items-center mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                                <span class="text-xs text-gray-400">${date}</span>
                                ${isEditing ? `<button type="button" onclick="event.stopPropagation(); deleteMemory(${index}, ${dayIndex}, ${memIdx})" class="text-red-400 hover:text-red-600 transition-colors"><span class="material-symbols-outlined text-sm">delete</span></button>` : ''}
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
            `;
        }

        // 추가 메모리 버튼 (여행 완료 상태이고 memoryLocked가 아닐 때만)
        if (getTripStatus(travelData) === 'completed' && !isMemoryLocked) {
            html += `
            <div class="mt-3">
                <button type="button" onclick="addMemoryItem(${index}, ${dayIndex})" class="w-full py-2 px-3 rounded-lg border border-dashed border-primary/30 hover:border-primary hover:bg-orange-50 dark:hover:bg-orange-900/10 text-primary dark:text-blue-400 text-sm font-medium transition-all flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-lg">add_a_photo</span>
                    추억 추가
                </button>
            </div>
            `;
        }
        
        html += `</div></div>`; // Close Right Col and Draggable Item Wrapper

    return html;
}

export function renderLists() {
    const shoppingContainer = document.getElementById('shopping-list-container');
    const checkContainer = document.getElementById('checklist-container');
    
    // 스크롤 위치 저장
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
        </div>
    `;

    if (travelData.shoppingList && travelData.shoppingList.length > 0) {
        // 장소별로 정렬: lastExpenseLocation과 일치하는 항목을 상단에
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
        
        // 반짝임 효과 후 lastExpenseLocation 초기화 (3초 후)
        if (lastLocation) {
            setTimeout(() => {
                window.lastExpenseLocation = null;
            }, 3000);
        }
    } else {
        shoppingContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">리스트가 비어있습니다.</p>';
    }

    if (travelData.checklist && travelData.checklist.length > 0) {
        checkContainer.innerHTML = travelData.checklist.map((item, i) => renderItem(item, i, 'check')).join('');
    } else {
        checkContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">리스트가 비어있습니다.</p>';
    }
    
    // 스크롤 위치 복원
    requestAnimationFrame(() => {
        window.scrollTo(0, scrollPosition);
    });
}

export function addListItem(type) {
    if (type === 'shopping') {
        openShoppingAddModal();
    } else {
        openManualInputModal("", (val) => {
            travelData.checklist.push({ text: val, checked: false });
            renderLists();
            autoSave();
        }, "준비물 추가", "내용");
    }
}

export function toggleListCheck(type, index) {
    const list = type === 'shopping' ? travelData.shoppingList : travelData.checklist;
    if (list[index]) {
        list[index].checked = !list[index].checked;
        renderLists();
        autoSave();
    }
}

export function deleteListItem(type, index) {
    const list = type === 'shopping' ? travelData.shoppingList : travelData.checklist;
    list.splice(index, 1);
    renderLists();
    autoSave();
}

let selectedShoppingLocation = null;

export function openShoppingAddModal() {
    selectedShoppingLocation = null;
    const modal = document.getElementById('shopping-add-modal');
    const nameInput = document.getElementById('shopping-item-name');
    const locationList = document.getElementById('shopping-location-list');
    
    nameInput.value = '';
    locationList.innerHTML = '';
    
    // 타임라인에서 모든 장소 추출
    const locations = [];
    if (travelData.days) {
        travelData.days.forEach(day => {
            if (day.timeline) {
                day.timeline.forEach(item => {
                    if (item.title && !item.isTransit && item.tag !== '메모') {
                        const loc = {
                            title: item.title,
                            location: item.location || '',
                            dayDate: day.date
                        };
                        // 중복 제거
                        if (!locations.some(l => l.title === loc.title && l.location === loc.location)) {
                            locations.push(loc);
                        }
                    }
                });
            }
        });
    }
    
    if (locations.length > 0) {
        locations.forEach((loc, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-primary hover:bg-primary/5 transition-colors';
            btn.innerHTML = `
                <div class="font-medium text-sm text-gray-800 dark:text-white">${loc.title}</div>
                ${loc.location ? `<div class="text-xs text-gray-500">${loc.location}</div>` : ''}
            `;
            btn.onclick = () => selectShoppingLocation(idx, loc);
            btn.id = `shopping-loc-${idx}`;
            locationList.appendChild(btn);
        });
    } else {
        locationList.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">등록된 장소가 없습니다.</p>';
    }
    
    modal.classList.remove('hidden');
    setTimeout(() => nameInput.focus(), 100);
    
    nameInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmShoppingAdd();
        }
    };
}

export function selectShoppingLocation(idx, loc) {
    // 기존 선택 해제
    document.querySelectorAll('[id^="shopping-loc-"]').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/10');
        btn.classList.add('border-gray-200', 'dark:border-gray-600');
    });
    
    // 새 선택
    const btn = document.getElementById(`shopping-loc-${idx}`);
    if (btn) {
        btn.classList.add('border-primary', 'bg-primary/10');
        btn.classList.remove('border-gray-200', 'dark:border-gray-600');
    }
    
    selectedShoppingLocation = loc;
}

export function skipShoppingLocation() {
    selectedShoppingLocation = null;
    document.querySelectorAll('[id^="shopping-loc-"]').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/10');
        btn.classList.add('border-gray-200', 'dark:border-gray-600');
    });
}

export function closeShoppingAddModal() {
    document.getElementById('shopping-add-modal').classList.add('hidden');
    selectedShoppingLocation = null;
}

export function confirmShoppingAdd() {
    const nameInput = document.getElementById('shopping-item-name');
    const name = nameInput.value.trim();
    
    if (!name) {
        nameInput.classList.add('shake');
        setTimeout(() => nameInput.classList.remove('shake'), 300);
        return;
    }
    
    const item = {
        text: name,
        checked: false
    };
    
    if (selectedShoppingLocation) {
        item.location = selectedShoppingLocation.title;
        item.locationDetail = selectedShoppingLocation.location;
    }
    
    travelData.shoppingList.push(item);
    renderLists();
    autoSave();
    closeShoppingAddModal();
}

// [Autocomplete Logic]
let itemAutocompleteInstance = null;
let tempItemCoords = { lat: null, lng: null };

function setupItemAutocomplete() {
    const input = document.getElementById('place-search');
    if (!input || !window.google) return;

    if (itemAutocompleteInstance) {
        google.maps.event.clearInstanceListeners(itemAutocompleteInstance);
    }

    const options = {
        fields: ["formatted_address", "geometry", "name"],
        strictBounds: false,
    };

    // 장소명 입력란에 엔터 키 이벤트 리스너 추가
    const itemTitleInput = document.getElementById('item-title');
    if (itemTitleInput && !itemTitleInput.dataset.hasEnterListener) {
        itemTitleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveNewItem();
            }
        });
        itemTitleInput.dataset.hasEnterListener = 'true';
    }

    itemAutocompleteInstance = new google.maps.places.Autocomplete(input, options);
    itemAutocompleteInstance.addListener("place_changed", () => {
        const place = itemAutocompleteInstance.getPlace();

        if (!place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        if (searchMode === 'trip') {
            updateMeta('title', place.name);
            updateMeta('subInfo', place.formatted_address);
            updateMeta('lat', lat);
            updateMeta('lng', lng);
            
            if (travelData.days && travelData.days.length > 0) {
                 fetchWeather(lat, lng, travelData.days[0].date);
            }
            renderItinerary();
            closeModal();
        } else {
            tempItemCoords = { lat, lng };
            document.getElementById('item-title').value = place.name;
            document.getElementById('item-location').value = place.formatted_address;
            document.getElementById('item-title').focus();
        }
    });
}

export function openLocationSearch() {
    closeTripInfoModal();
    try {
        setSearchMode('trip');
    } catch (e) {
        console.debug('setSearchMode not available yet');
    }
    const modal = document.getElementById('item-modal');
    
    // 위치 설정 모드: 검색창 외 다른 입력 필드 숨기기
    const gridChildren = modal.querySelectorAll('.grid > div');
    gridChildren.forEach((el, index) => {
        if (index > 0) el.classList.add('hidden');
    });
    document.getElementById('save-item-btn').classList.add('hidden');
    modal.querySelector('h3').innerText = "여행지 위치 설정";

    modal.classList.remove('hidden');
    document.getElementById('place-search').value = "";
    document.getElementById('place-search').focus();
    setupItemAutocomplete();
}

// 카테고리 데이터
const categoryList = [
    { code: 'meal', name: '식사', icon: 'restaurant' },
    { code: 'culture', name: '문화', icon: 'museum' },
    { code: 'sightseeing', name: '관광', icon: 'photo_camera' },
    { code: 'shopping', name: '쇼핑', icon: 'shopping_bag' },
    { code: 'accommodation', name: '숙소', icon: 'hotel' },
    { code: 'custom', name: '기타', icon: 'star' }
];

export function addTimelineItem(insertIndex = null, dayIndex = currentDayIndex) {
    setIsEditingFromDetail(false);
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    setEditingItemIndex(null); // 추가 모드
    setInsertingItemIndex(insertIndex); // 삽입 위치 저장
    try {
        setSearchMode('item');
    } catch (e) {
        console.debug('setSearchMode not available yet');
    }
    const modal = document.getElementById('item-modal');
    
    // UI 복구: 모든 필드 표시
    const gridChildren = modal.querySelectorAll('.grid > div');
    gridChildren.forEach(el => el.classList.remove('hidden'));
    document.getElementById('save-item-btn').classList.remove('hidden');

    // 초기화
    tempItemCoords = { lat: null, lng: null };
    document.getElementById('place-search').value = "";
    document.getElementById('item-title').value = "";
    document.getElementById('item-location').value = "";
    
    // 이전 항목 시간 + 10분 자동 설정
    let defaultTime = "오후 12:00";
    const timeline = travelData.days[targetDayIndex].timeline;
    if (timeline.length > 0) {
        const lastItem = timeline[timeline.length - 1];
        const lastMinutes = parseTimeStr(lastItem.time);
        if (lastMinutes !== null) {
            defaultTime = formatTimeStr(lastMinutes + 10);
        }
    }
    
    document.getElementById('item-time').value = defaultTime;
    document.getElementById('item-notes').value = "";
    // 카테고리 초기값 설정
    document.getElementById('item-category').value = categoryList[5].name; // 기타
    document.getElementById('item-category').dataset.value = categoryList[5].code;
    
    // 모달 UI 설정 (추가 모드)
    document.querySelector('#item-modal h3').innerText = "새 장소 추가";
    document.getElementById('save-item-btn').innerText = "일정에 추가";
    
    modal.classList.remove('hidden');
    setupItemAutocomplete();
    
    // 장소 검색 입력란에 자동 포커스
    setTimeout(() => {
        const placeSearchInput = document.getElementById('place-search');
        if (placeSearchInput) placeSearchInput.focus();
    }, 100);
}

export function editTimelineItem(index, dayIndex = currentDayIndex) {
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    const item = travelData.days[targetDayIndex].timeline[index];
    
    // 이동 수단(Transit)인 경우 전용 모달 호출
    if (item.isTransit) {
        if (item.tag === '비행기') {
            openFlightInputModal(index, true);
            Transit.openFlightInputModal(index, true);
            return;
        }
        openTransitInputModal(index, null); // null type means editing
        Transit.openTransitInputModal(index, null); // null type means editing
        return;
    }
    
    setEditingItemIndex(index);
    try {
        setSearchMode('item');
    } catch (e) {
        console.debug('setSearchMode not available yet');
    }
    
    const modal = document.getElementById('item-modal');
    // UI 복구: 모든 필드 표시
    const gridChildren = modal.querySelectorAll('.grid > div');
    gridChildren.forEach(el => el.classList.remove('hidden'));
    document.getElementById('save-item-btn').classList.remove('hidden');
    
    // 데이터 채우기
    tempItemCoords = { lat: item.lat || null, lng: item.lng || null };
    document.getElementById('place-search').value = ""; // 검색창은 초기화
    document.getElementById('item-title').value = item.title;
    document.getElementById('item-location').value = item.location;
    document.getElementById('item-time').value = item.time;
    document.getElementById('item-duration').value = item.duration !== undefined && item.duration !== null ? item.duration : 30;
    document.getElementById('item-notes').value = item.note || "";
    
    const tagToCategory = {
        "식사": "meal",
        "문화": "culture",
        "관광": "sightseeing",
        "쇼핑": "shopping",
        "숙소": "accommodation",
        "기타": "custom"
    };

    let categoryValue = 'custom';
    if (item.tag) categoryValue = tagToCategory[item.tag] || item.tag.toLowerCase();
    
    const categoryObj = categoryList.find(c => c.code === categoryValue) || categoryList[5];
    document.getElementById('item-category').value = categoryObj.name;
    document.getElementById('item-category').dataset.value = categoryObj.code;
    
    // 모달 UI 설정 (수정 모드)
    document.querySelector('#item-modal h3').innerText = "활동 수정";
    document.getElementById('save-item-btn').innerText = "수정 완료";
    
    modal.classList.remove('hidden');
    setupItemAutocomplete();
}

export function openGoogleMapsRouteFromPrev() {
    const timeline = travelData.days[targetDayIndex].timeline;
    let prevItem = null;
    
    // 유효한 이전 장소 찾기 (메모나 이동수단이 아닌 실제 장소)
    let searchIdx = -1;
    if (editingItemIndex !== null) {
        searchIdx = editingItemIndex - 1;
    } else {
        if (insertingItemIndex !== null && typeof insertingItemIndex === 'number') {
            searchIdx = insertingItemIndex;
        } else {
            searchIdx = timeline.length - 1;
        }
    }

    while (searchIdx >= 0) {
        const item = timeline[searchIdx];
        // 좌표가 있거나, 이동수단/메모가 아니면서 위치 정보가 있는 경우
        if ((item.lat && item.lng) || (!item.isTransit && item.tag !== '메모' && item.location && item.location !== '위치')) {
            prevItem = item;
            break;
        }
        searchIdx--;
    }

    if (!prevItem) {
        alert("이전 장소 정보를 찾을 수 없어 경로를 검색할 수 없습니다.");
        return;
    }

    let origin = "";
    if (prevItem.lat && prevItem.lng) {
        const lat = typeof prevItem.lat === 'function' ? prevItem.lat() : prevItem.lat;
        const lng = typeof prevItem.lng === 'function' ? prevItem.lng() : prevItem.lng;
        origin = `${lat},${lng}`;
    } else {
        origin = encodeURIComponent(prevItem.location || prevItem.title);
    }

    let destination = "";
    const currentLocVal = document.getElementById('item-location').value;
    
    if (tempItemCoords && tempItemCoords.lat && tempItemCoords.lng) {
        destination = `${tempItemCoords.lat},${tempItemCoords.lng}`;
    } else if (currentLocVal) {
        destination = encodeURIComponent(currentLocVal);
    } else {
        alert("도착지(현재 장소)를 입력하거나 검색해주세요.");
        return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=transit`;
    window.open(url, '_blank');
}

export async function addFastestTransitItem() {
    // 1. 데이터 유효성 검사
    if (targetDayIndex === null || targetDayIndex === -1 || !travelData.days[targetDayIndex]) {
        alert("날짜 정보를 찾을 수 없습니다.");
        return;
    }

    const timeline = travelData.days[targetDayIndex].timeline;
    const insertIdx = (insertingItemIndex !== null) ? Number(insertingItemIndex) : -1;

    // 2. 출발지/도착지 탐색 (좌표 우선, 없으면 텍스트)
    let prevItem = null;
    let nextItem = null;

    // 이전 아이템 찾기
    for (let i = (insertIdx >= 0 ? Math.min(insertIdx, timeline.length - 1) : timeline.length - 1); i >= 0; i--) {
        const item = timeline[i];
        if ((item.lat && item.lng) || (!item.isTransit && item.tag !== '메모' && (item.location || item.title))) {
            prevItem = item;
            break;
        }
    }

    // 다음 아이템 찾기
    if (insertIdx >= 0) {
        for (let i = insertIdx + 1; i < timeline.length; i++) {
            const item = timeline[i];
            if ((item.lat && item.lng) || (!item.isTransit && item.tag !== '메모' && (item.location || item.title))) {
                nextItem = item;
                break;
            }
        }
    }

    if (!prevItem || !nextItem) {
        alert("경로를 계산할 출발지 또는 도착지 정보가 부족합니다.\n(일정 사이에 추가할 때 사용해주세요)");
        return;
    }

    // 3. UI 로딩 표시
    const btn = document.querySelector('#add-selection-modal button[onclick="addFastestTransitItem()"]');
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<div class="flex items-center justify-center gap-2"><span class="material-symbols-outlined animate-spin">refresh</span> 경로 탐색 중...</div>`;
    }

    try {
        // 위치 객체 생성 헬퍼 (좌표 -> 텍스트 순)
        const getPoint = (item) => {
            // 1. Google Maps Geometry 객체인 경우 (함수 실행 필요)
            if (item.geometry && item.geometry.location) {
                const loc = item.geometry.location;
                return {
                    lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
                    lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng
                };
            }
            
            // 2. 이미 저장된 lat/lng 속성이 있는 경우 (숫자 변환 및 함수 체크)
            if (item.lat !== undefined && item.lng !== undefined) {
                return {
                    lat: typeof item.lat === 'function' ? item.lat() : Number(item.lat),
                    lng: typeof item.lng === 'function' ? item.lng() : Number(item.lng)
                };
            }

            // 3. 텍스트 주소 사용
            return item.location || item.title;
        };

        const origin = getPoint(prevItem);
        const destination = getPoint(nextItem);
        
        // [Custom Logic] 일본/인도 지역 직선거리 기반 자동 처리
        // 국가 코드 추출 헬퍼 함수
        const getCountryCode = async (item) => {
            // 이미 국가 정보가 있으면 반환
            if (item.countryCode) return item.countryCode;
            
            // address_components가 있으면 추출
            if (item.address_components) {
                const country = item.address_components.find(c => c.types.includes('country'));
                if (country) return country.short_name;
            }
            
            // Geocoding으로 국가 정보 추출 (좌표가 있는 경우)
            if (item.lat && item.lng) {
                try {
                    const geocoder = new google.maps.Geocoder();
                    const result = await new Promise((resolve, reject) => {
                        geocoder.geocode({ 
                            location: { 
                                lat: typeof item.lat === 'function' ? item.lat() : Number(item.lat),
                                lng: typeof item.lng === 'function' ? item.lng() : Number(item.lng)
                            }
                        }, (results, status) => {
                            if (status === 'OK' && results[0]) {
                                resolve(results[0]);
                            } else {
                                resolve(null);
                            }
                        });
                    });
                    
                    if (result && result.address_components) {
                        const country = result.address_components.find(c => c.types.includes('country'));
                        if (country) {
                            // 캐싱
                            item.countryCode = country.short_name;
                            return country.short_name;
                        }
                    }
                } catch (e) {
                    console.warn('Geocoding failed:', e);
                }
            }
            
            return null;
        };
        
        // 앞뒤 장소의 국가 확인
        const prevCountry = await getCountryCode(prevItem);
        const nextCountry = await getCountryCode(nextItem);
        
        // 양쪽 모두 일본(JP) 또는 인도(IN)인 경우만 직선거리 계산
        const isTargetRegion = (prevCountry === 'JP' && nextCountry === 'JP') || 
                               (prevCountry === 'IN' && nextCountry === 'IN');

        if (isTargetRegion && typeof origin === 'object' && typeof destination === 'object') {
            const dist = calculateStraightDistance(origin, destination);
            if (dist !== null) {
                let title, icon, tag, durationMins;
                
                if (dist <= 1000) {
                    // 1000m 이하: 도보 (분당 80m 기준)
                    title = "도보로 이동";
                    icon = "directions_walk";
                    tag = "도보";
                    durationMins = Math.max(1, Math.ceil(dist / 80));
                } else {
                    // 1000m 초과: 대중교통 (거리별 속도 차등 적용)
                    title = "대중교통으로 이동";
                    icon = "directions_bus";
                    tag = "대중교통";
                    
                    if (dist <= 5000) {
                        durationMins = Math.ceil(dist / 120); // 1~5km: 120m/min
                    } else if (dist <= 15000) {
                        durationMins = Math.ceil(dist / (9000 / 60)); // 5~15km: 9km/h
                    } else if (dist <= 40000) {
                        durationMins = Math.ceil(dist / (13000 / 60)); // 15~40km: 13km/h
                    } else {
                        durationMins = Math.ceil(dist / (50000 / 60)); // 40km 이상: 50km/h
                    }
                    durationMins = Math.max(5, durationMins);
                }

                const h = Math.floor(durationMins / 60);
                const m = durationMins % 60;
                const durationStr = (h > 0 ? `${h}시간 ` : "") + `${m}분`;

                const newItem = {
                    time: durationStr,
                    title: title,
                    location: "",
                    icon: icon,
                    tag: tag,
                    isTransit: true,
                    image: null,
                    note: `직선거리: ${Math.round(dist)}m (자동 계산됨)`,
                    fixedDuration: true,
                    transitInfo: { start: "", end: "" }
                };

                timeline.splice(insertIdx + 1, 0, newItem);
                reorderTimeline(targetDayIndex);
                closeAddModal();
                return; // Google API 호출을 건너뜁니다.
            }
        }

        // 출발 시간 설정 (여행 날짜 반영)
        let departureTime = new Date();
        const tripDateStr = travelData.days[targetDayIndex].date; 
        if (tripDateStr) {
            const [y, m, d] = tripDateStr.split('-').map(Number);
            departureTime = new Date(y, m - 1, d);
            
            // 이전 일정 시간이 있으면 반영
            // insertIdx 기준 바로 앞 아이템(prevItem과 다를 수 있음, 시간 기준용)
            let timeRefItem = null;
            let searchIdx = (insertIdx >= 0) ? Math.min(insertIdx, timeline.length - 1) : timeline.length - 1;
            if (searchIdx >= 0) timeRefItem = timeline[searchIdx];

            const refItem = timeRefItem || prevItem;
            if (refItem) {
                let mins = null;
                if (refItem.isTransit && refItem.transitInfo?.end) {
                    const [h, m] = refItem.transitInfo.end.split(':').map(Number);
                    mins = h * 60 + m;
                } else {
                    mins = parseTimeStr(refItem.time);
                }
                
                if (mins !== null) {
                    departureTime.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
                } else {
                    departureTime.setHours(9, 0, 0, 0); // 기본 9시
                }
            }
        }

        // 과거 시간이면 현재 시간으로 보정
        if (departureTime < new Date()) departureTime = new Date();

        // 4. 경로 요청 래퍼 함수 (Promise)
        const fetchRoute = async (params) => {
            return new Promise((resolve) => {
                const directionsService = new google.maps.DirectionsService();
                const request = {
                    origin: params.origin,
                    destination: params.destination,
                    travelMode: params.travelMode.toUpperCase(),
                    provideRouteAlternatives: params.provideRouteAlternatives
                };
                if (params.transitOptions) {
                    request.transitOptions = params.transitOptions;
                }
                
                directionsService.route(request, (result, status) => {
                    if (status === 'OK') {
                        resolve(result);
                    } else {
                        console.warn("Directions request failed: " + status);
                        resolve(null);
                    }
                });
            });
        };

        // 5. 단계별 탐색 전략 (1 -> 3 -> 2 -> 4 순서)
        let result = null;
        let searchMode = null; // [Added] 성공한 탐색 모드 추적

        // [전략 1] 대중교통 + 지정된 시간 (좌표 우선)
        if (!result) {
            result = await fetchRoute({
                origin, destination,
                travelMode: 'transit',
                transitOptions: { departureTime },
                provideRouteAlternatives: true
            });
            if (result) searchMode = 'transit';
        }

        // [Modified] Mapbox는 텍스트 검색(Geocoding)을 Directions API에서 직접 지원하지 않으므로 전략 3 제거
        // [전략 2] 대중교통 + 현재 시간 (미래 데이터 부재 시 대응)
        if (!result) {
            console.log("🕒 지정 시간 실패, 현재 시간으로 재시도");
            result = await fetchRoute({
                origin, destination,
                travelMode: 'transit',
                transitOptions: { departureTime: new Date() },
                provideRouteAlternatives: true
            });
            if (result) searchMode = 'transit';
        }

        // [전략 4] 도보 경로
        if (!result) {
            console.log("🚶 대중교통 실패, 도보 경로 탐색 시도");
            result = await fetchRoute({
                origin, destination,
                travelMode: 'walking',
                provideRouteAlternatives: true
            });
            if (result) searchMode = 'walking';
        }

        // 6. 결과 처리
        if (result) {
            closeAddModal();
            setTimeout(() => openRouteSelectionModal(result.routes, insertIdx, searchMode), 50);
        } else {
            let msg = "경로를 찾을 수 없습니다.";
            msg += "\n\n[가능한 원인]";
            msg += "\n1. 대중교통 운행 정보가 없는 지역";
            msg += "\n2. 너무 먼 미래의 날짜 (시간표 미확정)";
            msg += "\n3. 바다 건너기 등 육로 이동 불가";
            alert(msg);
        }

    } catch (error) {
        console.error(error);
        alert("오류 발생: " + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

// [Route Selection Modal Logic]
let pendingRouteInsertIndex = null;

export function openRouteSelectionModal(routes, insertIdx, searchMode = null) {
    pendingRouteInsertIndex = insertIdx;
    
    let modal = document.getElementById('route-selection-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'route-selection-modal';
        modal.className = 'fixed inset-0 bg-black/50 z-[99999] hidden flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[80vh] animate-fade-in-up">
                <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <h3 class="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">alt_route</span> 경로 선택
                    </h3>
                    <button onclick="closeRouteSelectionModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="p-2 bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-600 dark:text-blue-300 text-center">
                    가장 적합한 경로를 선택해주세요.
                </div>
                <div id="route-selection-list" class="overflow-y-auto p-3 space-y-3 bg-gray-50/50 dark:bg-gray-900/50">
                    <!-- Routes injected here -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        // [Fix] 기존 모달이 있다면 z-index 및 클래스 강제 업데이트
        modal.className = 'fixed inset-0 bg-black/50 z-[99999] hidden flex items-center justify-center p-4';
    }
    
    const list = document.getElementById('route-selection-list');
    list.innerHTML = '';
    
    // [Helper] 시간/거리 포맷팅 (Mapbox 숫자 vs Google 텍스트 호환)
    const formatDuration = (valObj) => {
        return valObj ? valObj.text : "";
    };

    const formatDistance = (valObj) => {
        return valObj ? valObj.text : "";
    };

    routes.forEach((route, idx) => {
        const leg = route.legs[0];
        
        // [Fix] 도보 모드인데 소요시간이 비정상적으로 짧으면(운전으로 추정) 거리 기반으로 재계산
        // 시속 4km = 분당 약 67m
        if (searchMode === 'walking') {
            let distVal = 0;
            if (typeof leg.distance === 'number') distVal = leg.distance;
            else if (leg.distance?.value) distVal = leg.distance.value;
            
            if (distVal > 0) {
                const walkMins = Math.ceil(distVal / 67);
                const h = Math.floor(walkMins / 60);
                const m = walkMins % 60;
                const newText = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
                
                // 객체 원본 수정 (저장 시 processSelectedRoute에서도 반영되도록)
                leg.duration = { text: newText, value: walkMins * 60 };
            }
        }

        const duration = formatDuration(leg.duration);
        const distance = formatDistance(leg.distance);
        
        let iconsHtml = '';
        const transitSteps = leg.steps.filter(s => s.travel_mode === 'TRANSIT');
        
        if (transitSteps.length > 0) {
            transitSteps.forEach(step => {
                // [Fix] 데이터가 불완전할 경우를 대비해 Optional Chaining 사용
                const vehicle = step.transit?.line?.vehicle || { type: 'BUS' };
                let icon = 'directions_bus';
                let colorClass = 'text-gray-600 dark:text-gray-300';
                
                if (vehicle.type === 'SUBWAY' || vehicle.type === 'METRO') {
                    icon = 'subway';
                    colorClass = 'text-orange-500';
                } else if (vehicle.type === 'HEAVY_RAIL' || vehicle.type === 'TRAIN') {
                    icon = 'train';
                    colorClass = 'text-blue-500';
                }
                
                const lineName = step.transit?.line?.short_name || step.transit?.line?.name || '';
                const lineColor = step.transit?.line?.color ? `style="color: ${step.transit.line.color}"` : '';
                
                iconsHtml += `
                    <div class="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded-md text-xs shadow-sm">
                        <span class="material-symbols-outlined text-[16px] ${!lineColor ? colorClass : ''}" ${lineColor}>${icon}</span>
                        <span class="font-bold text-gray-700 dark:text-gray-200">${lineName}</span>
                    </div>`;
            });
        } else {
             iconsHtml += `
                <div class="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded-md text-xs shadow-sm">
                    <span class="material-symbols-outlined text-[16px] text-green-600">directions_walk</span>
                    <span class="font-bold text-gray-700 dark:text-gray-200">도보</span>
                </div>`;
        }
        
        const btn = document.createElement('button');
        btn.className = "w-full text-left p-4 rounded-xl bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 hover:border-primary hover:ring-1 hover:ring-primary hover:shadow-md transition-all group relative overflow-hidden";
        
        const badge = idx === 0 ? `<div class="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">추천</div>` : '';

        const formatAddr = (addr) => {
            if (!addr) return "";
            const parts = addr.split(' ');
            return parts.length > 1 ? parts.slice(1).join(' ') : addr;
        };
        const startAddr = formatAddr(leg.start_address) || '출발지';
        const endAddr = formatAddr(leg.end_address) || '도착지';

        btn.innerHTML = `
            ${badge}
            <div class="flex justify-between items-end mb-3">
                <span class="font-bold text-2xl text-gray-800 dark:text-white tracking-tight">${duration}</span>
                <span class="text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">${distance}</span>
            </div>
            <div class="flex flex-wrap gap-2 mb-3">
                ${iconsHtml}
            </div>
            <div class="flex items-center gap-1 text-xs text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
                <span class="truncate flex-1">${startAddr} → ${endAddr}</span>
            </div>
        `;
        
        btn.onclick = () => {
            processSelectedRoute(route, pendingRouteInsertIndex);
            closeRouteSelectionModal();
        };
        list.appendChild(btn);
    });
    
    modal.classList.remove('hidden');
}

export function closeRouteSelectionModal() {
    const modal = document.getElementById('route-selection-modal');
    if (modal) modal.classList.add('hidden');
    pendingRouteInsertIndex = null;
}

function processSelectedRoute(route, insertIdx) {
    const leg = route.legs[0];
    const steps = leg.steps;
    
    // [헬퍼] 값이 없으면 무조건 빈 문자열("")로 반환. undefined 절대 금지.
    const safe = (val) => (val === undefined || val === null) ? "" : val;
    
    const formatDuration = (valObj) => {
        return valObj ? valObj.text : "";
    };

    const formatDistance = (valObj) => {
        return valObj ? valObj.text : "";
    };

    const detailedSteps = [];
    
    // 대중교통 포함 여부 확인
    const hasTransit = steps.some(step => step.travel_mode === 'TRANSIT');

    // 전체 구간 시간/거리 계산
    const totalDuration = formatDuration(leg.duration);
    const totalDistance = formatDistance(leg.distance);
    
    // 그룹 ID 생성 (타임스탬프 기반)
    const routeGroupId = `route_${Date.now()}`;

    // 상세 경로 정보 생성 (펼쳐질 내용)
    if (!hasTransit) {
        // [순수 도보]
        detailedSteps.push({
            time: totalDuration || "시간 미정",
            title: "도보로 이동",
            location: "",
            icon: "directions_walk",
            tag: "도보",
            isTransit: true,
            image: null,
            note: `총 거리: ${totalDistance}`,
            fixedDuration: true,
            transitInfo: { start: "", end: "" },
            routeGroupId: routeGroupId
        });
    } else {
      // [대중교통 포함]
      for (const step of steps) {
        if (step.travel_mode === 'TRANSIT' && step.transit) {
            // 안전한 데이터 추출
            const line = step.transit.line || {};
            const vehicle = line.vehicle || { type: 'BUS' };
            
            // 이름이 없으면 '대중교통'이라도 넣음
            const lineName = safe(line.short_name) || safe(line.name) || "대중교통";
            
            let icon = "directions_bus";
            let tag = "버스";
            let titleBase = "버스로 이동";

            const vType = vehicle.type || 'BUS';
            if (vType === 'SUBWAY' || vType === 'METRO') {
                icon = "subway"; tag = "전철"; titleBase = "전철로 이동";
            } else if (vType === 'HEAVY_RAIL' || vType === 'TRAIN') {
                icon = "train"; tag = "기차"; titleBase = "기차로 이동";
            }

            const title = `${titleBase} (${lineName})`;
            
            // 색상은 없으면 null (null은 Firestore 저장 가능)
            const lineColor = line.color ? line.color : null; 
            const textColor = line.text_color ? line.text_color : null;
            
            const stepDuration = formatDuration(step.duration); // 호환성 적용

            detailedSteps.push({
                time: stepDuration,
                title: safe(title),
                location: "",
                icon: icon,
                tag: tag,
                isTransit: true,
                image: null,
                note: step.transit.num_stops ? `${step.transit.num_stops}개 정류장` : "",
                color: lineColor, 
                textColor: textColor, 
                fixedDuration: true,
                transitInfo: { 
                    start: safe(step.transit.departure_time?.text),
                    end: safe(step.transit.arrival_time?.text),
                    headsign: safe(step.transit.headsign),
                    depStop: safe(step.transit.departure_stop?.name),
                    arrStop: safe(step.transit.arrival_stop?.name)
                },
                routeGroupId: routeGroupId
            });
        } else if (step.travel_mode === 'WALKING') {
            const stepDuration = formatDuration(step.duration); // 호환성 적용
            // HTML 태그 제거 및 안전한 텍스트 추출
            let instructions = safe(step.instructions) || "도보로 이동";
            const div = document.createElement("div");
            div.innerHTML = instructions;
            instructions = div.textContent || div.innerText || "도보로 이동";

            detailedSteps.push({
                time: stepDuration,
                title: "도보로 이동",
                location: "",
                icon: "directions_walk",
                tag: "도보",
                isTransit: true,
                image: null,
                note: instructions,
                fixedDuration: true,
                transitInfo: { start: "", end: "" },
                routeGroupId: routeGroupId
            });
        }
      }
    }

    if (detailedSteps.length === 0) {
        detailedSteps.push({
            time: totalDuration || "이동",
            title: "이동",
            location: "",
            icon: "commute",
            tag: "이동",
            isTransit: true,
            image: null,
            note: "경로 상세 정보 없음",
            fixedDuration: true,
            transitInfo: { start: "", end: "" },
            routeGroupId: routeGroupId
        });
    }

    // 대표 경로 아이템 생성 (요약본)
    const transitSteps = steps.filter(s => s.travel_mode === 'TRANSIT');
    let summaryTitle = "";
    let summaryIcon = "commute";
    let summaryTag = "이동";
    
    if (!hasTransit) {
        // 순수 도보
        summaryTitle = "도보로 이동";
        summaryIcon = "directions_walk";
        summaryTag = "도보";
    } else {
        // 대중교통 포함
        // 대중교통 종류별 카운트
        const vehicleTypes = {};
        transitSteps.forEach(step => {
            const vType = step.transit?.line?.vehicle?.type || 'BUS';
            vehicleTypes[vType] = (vehicleTypes[vType] || 0) + 1;
        });
        
        if (Object.keys(vehicleTypes).length > 0) {
            // 가장 많이 사용된 교통수단
            const mainType = Object.keys(vehicleTypes).reduce((a, b) => 
                vehicleTypes[a] > vehicleTypes[b] ? a : b
            );
            
            if (mainType === 'SUBWAY' || mainType === 'METRO') {
                summaryIcon = "subway";
                summaryTag = "전철";
                summaryTitle = detailedSteps.length > 1 ? `전철 등 ${detailedSteps.length}개 구간` : "전철로 이동";
            } else if (mainType === 'HEAVY_RAIL' || mainType === 'TRAIN') {
                summaryIcon = "train";
                summaryTag = "기차";
                summaryTitle = detailedSteps.length > 1 ? `기차 등 ${detailedSteps.length}개 구간` : "기차로 이동";
            } else {
                summaryIcon = "directions_bus";
                summaryTag = "버스";
                summaryTitle = detailedSteps.length > 1 ? `버스 등 ${detailedSteps.length}개 구간` : "버스로 이동";
            }
        } else {
            // 대중교통이 있다고 했는데 vehicleTypes가 비어있는 경우 (fallback)
            summaryTitle = detailedSteps.length > 1 ? `대중교통 ${detailedSteps.length}개 구간` : "대중교통으로 이동";
            summaryIcon = "commute";
            summaryTag = "대중교통";
        }
    }

    // 타임라인 배열 가져오기
    const timelineArr = travelData.days[targetDayIndex].timeline;
    
    const summaryItem = {
        time: totalDuration || "시간 미정",
        title: summaryTitle,
        location: "",
        icon: summaryIcon,
        tag: summaryTag,
        isTransit: true,
        image: null,
        note: "",
        fixedDuration: true,
        transitInfo: { 
            start: "", 
            end: "",
            summary: detailedSteps.length > 1 ? `총 거리: ${totalDistance}` : `총 거리: ${totalDistance}`
        },
        routeGroupId: routeGroupId,
        isCollapsed: detailedSteps.length > 1,
        detailedSteps: detailedSteps.length > 1 ? detailedSteps : null,
        // 메모, 지출, 첨부파일을 위한 빈 필드들
        expenses: [],
        attachments: []
    };

    // 다음 장소 시간 자동 조정 로직
    
    if (insertIdx >= 0 && insertIdx < timelineArr.length) {
        const prevItem = timelineArr[insertIdx];
        const nextItem = (insertIdx + 1 < timelineArr.length) ? timelineArr[insertIdx + 1] : null;
        
        if (prevItem && nextItem && !prevItem.isTransit && !nextItem.isTransit) {
            const prevTimeMins = parseTimeStr(prevItem.time);
            const nextTimeMins = parseTimeStr(nextItem.time);
            
            if (prevTimeMins !== null) {
                // leg.duration 처리 시에도 호환성 체크
                let durVal = 0;
                if (typeof leg.duration === 'number') durVal = leg.duration;
                else if (leg.duration?.value) durVal = leg.duration.value;

                const durationMins = Math.ceil(durVal / 60);
                const arrivalTimeMins = prevTimeMins + durationMins;
                
                // 다음 장소 시간이 도착 시간보다 이르면 조정
                let effectiveNextTime = nextTimeMins;
                // 단순 비교를 위해 다음 시간이 이전 시간보다 작으면 다음날로 간주 (00:00 vs 23:00)
                if (effectiveNextTime !== null && effectiveNextTime < prevTimeMins) {
                    effectiveNextTime += 24 * 60;
                }
                
                if (effectiveNextTime === null || arrivalTimeMins > effectiveNextTime) {
                    let newTime = arrivalTimeMins >= 24 * 60 ? arrivalTimeMins - 24 * 60 : arrivalTimeMins;
                    nextItem.time = formatTimeStr(newTime);
                }
            }
        }
    }

    timelineArr.splice(insertIdx + 1, 0, summaryItem);
    
    reorderTimeline(targetDayIndex);
    closeAddModal();
}

// [Manual Input Modal Logic]
let manualInputCallback = null;

export function openManualInputModal(initialValue, callback, title = "직접 입력", label = "장소명 / 위치") {
    manualInputCallback = callback;
    const input = document.getElementById('manual-input-value');
    input.value = initialValue || "";
    
    // 엔터 키 처리
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            confirmManualInput();
        }
    };

    const modal = document.getElementById('manual-input-modal');
    modal.querySelector('h3').innerText = title;
    modal.querySelector('label').innerText = label;

    document.getElementById('manual-input-modal').classList.remove('hidden');
    setTimeout(() => input.focus(), 100);
}

export function closeManualInputModal() {
    document.getElementById('manual-input-modal').classList.add('hidden');
    manualInputCallback = null;
}

export function confirmManualInput() {
    const input = document.getElementById('manual-input-value');
    const val = input.value.trim();
    
    if (!val) {
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 300);
        input.focus();
        return;
    }

    if (manualInputCallback) {
        manualInputCallback(val);
    }
    closeManualInputModal();
}

export function useManualInput(type) {
    let initialValue = "";
    if (type === 'item') {
        initialValue = document.getElementById('place-search').value;
    } else if (type === 'new-trip') {
        initialValue = document.getElementById('new-trip-location').value;
    }

    openManualInputModal(initialValue, (val) => {
        if (type === 'item') {
            if (searchMode === 'trip') {
                // 위치 설정 모드
                updateMeta('title', val);
                updateMeta('subInfo', val);
                renderItinerary();
                closeModal();
            } else {
                // 일정 추가/수정 모드
                document.getElementById('item-title').value = val;
                document.getElementById('item-location').value = val;
                document.getElementById('item-title').focus();
            }
        } else if (type === 'new-trip') {
            document.getElementById('new-trip-location').value = val;
            newTripDataTemp.locationName = val;
            newTripDataTemp.address = val;
            nextWizardStep(2);
        }
    });
}

export function addNoteItem(insertIndex) {
    let defaultTime = "오후 12:00";
    const timeline = travelData.days[targetDayIndex].timeline;
    
    let prevItem = null;
    if (insertIndex !== null && insertIndex !== -1) {
        prevItem = timeline[insertIndex];
    } else if (timeline.length > 0) {
        prevItem = timeline[timeline.length - 1];
    }

    if (prevItem) {
        const prevMinutes = parseTimeStr(prevItem.time);
        if (prevMinutes !== null) {
            defaultTime = formatTimeStr(prevMinutes + 10);
        }
    }

    openManualInputModal("", (val) => {
        const newItem = {
            time: defaultTime,
            title: val,
            location: "",
            icon: "sticky_note_2",
            tag: "메모",
            image: null,
            isTransit: false,
            note: ""
        };
        
        if (insertIndex !== null && insertIndex !== -1) {
            timeline.splice(insertIndex + 1, 0, newItem);
        } else {
            timeline.push(newItem);
        }
        
        renderItinerary();
        autoSave();
    }, "메모 추가", "메모 내용");
}

export function closeModal() {
    document.getElementById('item-modal').classList.add('hidden');
    setEditingItemIndex(null);
}

// 잔류 시간 설정 함수
export function setDuration(minutes) {
    const durationInput = document.getElementById('item-duration');
    if (durationInput) {
        durationInput.value = minutes;
    }
}

export async function saveNewItem() {
    const category = document.getElementById('item-category').dataset.value || 'custom';
    let icon = "place";
    
    // 카테고리별 아이콘 매핑
    const icons = {
        meal: "restaurant",
        transit: "train",
        culture: "museum",
        sightseeing: "photo_camera",
        shopping: "shopping_bag",
        accommodation: "hotel",
        custom: "star"
    };
    icon = icons[category] || "place";

    const categoryNames = {
        meal: "식사",
        culture: "문화",
        sightseeing: "관광",
        shopping: "쇼핑",
        accommodation: "숙소",
        custom: "기타"
    };

    const newItem = {
        time: document.getElementById('item-time').value,
        title: document.getElementById('item-title').value || "새 활동",
        location: document.getElementById('item-location').value || "위치",
        icon: icon,
        lat: tempItemCoords.lat,
        lng: tempItemCoords.lng,
        tag: categoryNames[category] || category.toUpperCase(),
        image: null,
        isTransit: category === 'transit',
        note: document.getElementById('item-notes').value,
        duration: parseInt(document.getElementById('item-duration').value) || 30 // 잔류 시간 (분)
    };
    
    // 일본어 주소가 있으면 함께 저장
    const jaLocationField = document.getElementById('item-location-ja');
    if (jaLocationField && jaLocationField.value) {
        newItem.locationJa = jaLocationField.value;
        
        // 국가 코드도 저장
        newItem.countryCode = 'JP';
        newItem.address_components = [{
            types: ['country'],
            short_name: 'JP'
        }];
    }

    const timeline = travelData.days[targetDayIndex].timeline;

    if (editingItemIndex !== null) {
        // 수정
        timeline[editingItemIndex] = newItem;
    } else {
        // 추가
        if (typeof insertingItemIndex === 'number' && insertingItemIndex !== null) {
            timeline.splice(insertingItemIndex + 1, 0, newItem);
        } else {
            timeline.push(newItem);
        }
    }

    // 수정 모드였는지 확인하기 위해 미리 저장 (closeModal()이 editingItemIndex를 초기화하므로)
    const wasEditingIndex = editingItemIndex;

    // [핵심] 재정렬 및 이동시간 계산
    reorderTimeline(targetDayIndex);

    closeModal();

    // 상세 페이지에서 수정을 시작했다면 다시 상세 페이지 열기
    if (wasEditingIndex !== null && isEditingFromDetail) {
        // 재정렬로 인해 인덱스가 변경되었을 수 있으므로, 객체 참조로 새 인덱스를 찾음
        const newIndex = travelData.days[targetDayIndex].timeline.indexOf(newItem);
        if (newIndex !== -1) {
            viewTimelineItem(newIndex);
        }
    }
    setIsEditingFromDetail(false); // 리셋

}

export function deleteTimelineItem(index, dayIndex = currentDayIndex) {
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline[index];
    
    // routeGroupId가 있는 경우 그룹 삭제 옵션 제공
    if (item.routeGroupId) {
        const groupItems = timeline.filter(t => t.routeGroupId === item.routeGroupId);
        
        if (groupItems.length > 1) {
            // 커스텀 모달 열기
            openDeleteConfirmModal(index, dayIndex, groupItems.length);
            return;
        } else {
            // 그룹에 1개만 있으면 일반 삭제
            if (confirm("이 항목을 삭제하시겠습니까?")) {
                timeline.splice(index, 1);
            } else {
                return;
            }
        }
    } else {
        // routeGroupId 없는 일반 항목
        if (confirm("이 항목을 삭제하시겠습니까?")) {
            timeline.splice(index, 1);
        } else {
            return; // 취소 시 함수 종료
        }
    }
    
    updateTotalBudget();
    renderItinerary();
    autoSave();
}

// 삭제 확인 모달 관련 함수
let pendingDeleteIndex = null;
let pendingDeleteDayIndex = null;

export function openDeleteConfirmModal(index, dayIndex, groupCount) {
    pendingDeleteIndex = index;
    pendingDeleteDayIndex = dayIndex;
    
    const modal = document.getElementById('delete-confirm-modal');
    const message = document.getElementById('delete-confirm-message');
    const deleteSingleBtn = document.getElementById('delete-single-btn');
    const deleteGroupBtn = document.getElementById('delete-group-btn');
    
    message.textContent = `이 항목은 최적경로 검색으로 생성된 ${groupCount}개 이동 경로의 일부입니다. 전체 경로를 함께 삭제하시겠습니까?`;
    deleteGroupBtn.textContent = `전체 경로 삭제 (${groupCount}개)`;
    
    // 버튼 이벤트 리스너 설정
    deleteSingleBtn.onclick = () => {
        executeDelete(false);
        closeDeleteConfirmModal();
    };
    
    deleteGroupBtn.onclick = () => {
        executeDelete(true);
        closeDeleteConfirmModal();
    };
    
    modal.classList.remove('hidden');
}

export function closeDeleteConfirmModal() {
    const modal = document.getElementById('delete-confirm-modal');
    modal.classList.add('hidden');
    pendingDeleteIndex = null;
    pendingDeleteDayIndex = null;
}

// Transit Recalculate Modal
let transitRecalculateConfirmCallback = null;
let transitRecalculateCancelCallback = null;

export function showTransitRecalculateModal(time, onConfirm, onCancel) {
    const modal = document.getElementById('transit-recalculate-modal');
    const timeDisplay = document.getElementById('transit-time-display');
    
    timeDisplay.innerText = time;
    transitRecalculateConfirmCallback = onConfirm;
    transitRecalculateCancelCallback = onCancel;
    
    modal.classList.remove('hidden');
}

export function closeTransitRecalculateModal(shouldRecalculate) {
    const modal = document.getElementById('transit-recalculate-modal');
    modal.classList.add('hidden');
    
    if (shouldRecalculate && transitRecalculateConfirmCallback) {
        transitRecalculateConfirmCallback();
    } else if (!shouldRecalculate && transitRecalculateCancelCallback) {
        transitRecalculateCancelCallback();
    }
    
    transitRecalculateConfirmCallback = null;
    transitRecalculateCancelCallback = null;
}

function executeDelete(deleteGroup) {
    if (pendingDeleteIndex === null) return;
    
    setTargetDayIndex(pendingDeleteDayIndex);
    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline[pendingDeleteIndex];
    
    if (deleteGroup && item.routeGroupId) {
        // 그룹 전체 삭제 (뒤에서부터 삭제하여 인덱스 꼬임 방지)
        for (let i = timeline.length - 1; i >= 0; i--) {
            if (timeline[i].routeGroupId === item.routeGroupId) {
                timeline.splice(i, 1);
            }
        }
    } else {
        // 이 항목만 삭제
        timeline.splice(pendingDeleteIndex, 1);
    }
    
    updateTotalBudget();
    renderItinerary();
    autoSave();
}

// [Attachment Logic]
export async function handleAttachmentUpload(input, type) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // 파일 크기 제한: 이미지 5MB, PDF 10MB
        const maxSize = file.type.startsWith('image/') ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            alert(`파일 크기는 ${file.type.startsWith('image/') ? '5MB' : '10MB'} 이하여야 합니다.`);
            input.value = "";
            return;
        }

        try {
            showLoading();
            
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                try {
                    const item = travelData.days[targetDayIndex].timeline[viewingItemIndex];
                    if (!item.attachments) item.attachments = [];
                    
                    let fileUrl = null;
                    
                    // Cloud Functions를 통해 Storage에 업로드
                    const timestamp = Date.now();
                    const fileExtension = file.name.split('.').pop();
                    const fileName = `attachment_${targetDayIndex}_${viewingItemIndex}_${timestamp}.${fileExtension}`;
                    
                    const response = await fetch(`${BACKEND_URL}/upload-attachment`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            base64Data: e.target.result,
                            fileName: fileName,
                            tripId: currentTripId,
                            fileType: file.type
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || '업로드 실패');
                    }

                    const result = await response.json();
                    fileUrl = result.url;
                    
                    item.attachments.push({
                        name: file.name,
                        type: file.type,
                        url: fileUrl // URL로 저장
                    });
                    
                    const containerId = type === 'transit' ? 'transit-attachment-list' : 'detail-attachment-list';
                    renderAttachments(item, containerId);
                    await autoSave();
                    input.value = ""; // Reset input
                    
                    hideLoading();
                } catch (error) {
                    console.error("첨부파일 업로드 실패:", error);
                    alert('첨부파일 업로드에 실패했습니다: ' + error.message);
                    hideLoading();
                }
            };
            
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("파일 읽기 실패:", error);
            alert('파일 읽기에 실패했습니다: ' + error.message);
            input.value = "";
            hideLoading();
        }
    }
}

export function renderAttachments(item, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!item.attachments || item.attachments.length === 0) {
        container.innerHTML = '<p class="col-span-full text-xs text-gray-400 text-center py-2">첨부된 파일이 없습니다.</p>';
        return;
    }

    let html = '';
    item.attachments.forEach((att, index) => {
        const isImage = att.type.startsWith('image/');
        const icon = isImage ? 'image' : 'description';
        const bgClass = isImage ? '' : 'bg-gray-100 dark:bg-gray-700';
        
        // URL 또는 Base64 데이터 처리 (하위 호환성)
        const fileData = att.url || att.data;
        
        const content = isImage 
            ? `<div class="w-full h-full bg-cover bg-center" style="background-image: url('${fileData}')"></div>` 
            : `<div class="w-full h-full flex flex-col items-center justify-center text-gray-500"><span class="material-symbols-outlined text-2xl mb-1">picture_as_pdf</span><span class="text-[10px] px-2 truncate w-full text-center">${att.name}</span></div>`;

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

export async function deleteAttachment(index, containerId) {
    if (confirm("파일을 삭제하시겠습니까?")) {
        const item = travelData.days[targetDayIndex].timeline[viewingItemIndex];
        item.attachments.splice(index, 1);
        renderAttachments(item, containerId);
        await autoSave();
    }
}

export function openAttachment(data, type) {
    const win = window.open();
    if (type.startsWith('image/')) {
        win.document.write(`<img src="${data}" style="max-width:100%">`);
    } else {
        // PDF의 경우 iframe으로 열기
        win.document.write(`<iframe src="${data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
    }
}

// [Route View Logic]
let routeMap = null;
let routePolyline = null;
let routeMarkers = [];
let routePopup = null;

export async function openRouteModal() {
    const modal = document.getElementById('route-modal');
    modal.classList.remove('hidden');

    const container = document.getElementById('route-map-container');
    
    // 지도 초기화 (최초 1회)
    if (!routeMap && window.mapboxgl) {
        routeMap = new mapboxgl.Map({
            container: container,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [126.9780, 37.5665],
            zoom: 10,
            attributionControl: false
        });
    }

    if (!routeMap) return;

    const timeline = travelData.days[currentDayIndex].timeline;
    const bounds = new google.maps.LatLngBounds();
    const path = [];
    const geocoder = new google.maps.Geocoder();
    let lastPlacePos = null;
    let transitBuffer = [];

    // [Modified] 지도 스타일 로드 대기 후 레이어 조작
    const updateMapLayer = () => {
        if (!routeMap.getStyle()) return; // 스타일이 없으면 중단

        // 기존 마커 및 경로 제거
        if (routeMap.getSource('route-path')) {
            routeMap.getSource('route-path').setData({ type: 'FeatureCollection', features: [] });
        }
        routeMarkers.forEach(m => m.remove());
        routeMarkers = [];
        if (routePopup) routePopup.remove();

        // 경로 그리기 로직은 데이터 처리가 끝난 후(아래) 호출됨
    };

    if (routeMap.loaded()) updateMapLayer();
    else routeMap.once('load', updateMapLayer);

    // 좌표 가져오기 헬퍼 (저장된 좌표가 없으면 주소로 검색)
    const getPoint = async (item) => {
        if (item.lat && item.lng) {
            return { lat: Number(item.lat), lng: Number(item.lng) };
        }
        // 이동수단이 아니고 위치 정보가 유효한 경우
        if (item.location && item.location.length > 1 && !item.isTransit && item.location !== "위치") {
            return new Promise((resolve) => {
                geocoder.geocode({ address: item.location }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        resolve(results[0].geometry.location);
                    } else {
                        resolve(null);
                    }
                });
            });
        }
        return null;
    };

    // 순차적으로 좌표 처리 및 마커 생성
    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        
        if (item.isTransit) {
            transitBuffer.push(item);
            continue;
        }

        try {
            const pos = await getPoint(item);
            if (pos) {
                const lngLat = [pos.lng, pos.lat]; // Mapbox uses [lng, lat]
                path.push(lngLat);
                bounds.extend(lngLat);

                // 장소 마커 생성
                const el = document.createElement('div');
                el.className = 'w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white';
                el.innerText = path.length.toString();

                const marker = new mapboxgl.Marker(el)
                    .setLngLat(lngLat)
                    .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                        <div class="p-2">
                            <h4 class="font-bold text-sm mb-1">${item.title}</h4>
                            <p class="text-xs text-gray-500 mb-2">${item.location}</p>
                            <span class="inline-block bg-purple-50 text-purple-700 border border-purple-100 text-xs font-bold px-2 py-0.5 rounded">${item.time}</span>
                        </div>
                    `))
                    .addTo(routeMap);

                routeMarkers.push(marker);

                // 이전 장소와 현재 장소 사이에 이동수단이 있었다면 중간 지점에 마커 표시
                if (lastPlacePos && transitBuffer.length > 0) {
                    const count = transitBuffer.length;
                    for (let j = 0; j < count; j++) {
                        const tItem = transitBuffer[j];
                        const fraction = (j + 1) / (count + 1);
                        
                        // 선형 보간 (Linear Interpolation)
                        const lat = lastPlacePos.lat + (pos.lat - lastPlacePos.lat) * fraction;
                        const lng = lastPlacePos.lng + (pos.lng - lastPlacePos.lng) * fraction;
                        const transitPos = [lng, lat];

                        const tEl = document.createElement('div');
                        tEl.className = 'w-6 h-6 bg-white text-purple-700 rounded-full flex items-center justify-center shadow-md border border-purple-700';
                        tEl.innerHTML = `<span class="material-symbols-outlined text-[16px]">${tItem.icon}</span>`;

                        const tMarker = new mapboxgl.Marker(tEl)
                            .setLngLat(transitPos)
                            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                                <div class="p-2 min-w-[150px]">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="material-symbols-outlined text-primary">${tItem.icon}</span>
                                        <h4 class="font-bold text-sm text-gray-900">${tItem.title}</h4>
                                    </div>
                                    ${tItem.time ? `<span class="inline-block bg-blue-50 text-blue-700 border border-blue-100 text-xs font-bold px-2 py-0.5 rounded mt-1">${tItem.time}</span>` : ''}
                                    ${tItem.note ? `<p class="text-xs text-gray-500 mt-1">📝 ${tItem.note}</p>` : ''}
                                </div>
                            `))
                            .addTo(routeMap);

                        routeMarkers.push(tMarker);
                    }
                }

                lastPlacePos = pos;
                transitBuffer = []; // 버퍼 초기화
            }
        } catch (e) {
            console.error("Route processing error:", e);
        }
    }

    // 경로 그리기
    if (path.length > 0) {
        routePolyline = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#774b00',
            strokeOpacity: 0.8,
            strokeWeight: 5
        });
        routePolyline.setMap(routeMap);
        routeMap.fitBounds(bounds);

    } else if (travelData.meta.lat && travelData.meta.lng) {
        // 경로가 없으면 여행지 중심으로 이동
        routeMap.setCenter({ lat: Number(travelData.meta.lat), lng: Number(travelData.meta.lng) });
        routeMap.setZoom(12);
    }

    // 모달이 뜬 직후 지도 리사이즈 트리거 (깨짐 방지)
    setTimeout(() => {
        google.maps.event.trigger(routeMap, 'resize');
    }, 100);
}

export function closeRouteModal() {
    document.getElementById('route-modal').classList.add('hidden');
}

// 화면 아무곳이나 클릭하면 열린 메뉴 닫기
window.addEventListener('click', (e) => {
    // 메뉴 버튼이나 메뉴 내부를 클릭한 경우는 제외
    if (!e.target.closest('[id^="trip-menu-"]') && !e.target.closest('button[onclick*="toggleTripMenu"]')) {
        document.querySelectorAll('[id^="trip-menu-"]').forEach(el => el.classList.add('hidden'));
    }
});

// Window assignments
window.loadTripList = loadTripList;
window.openTrip = openTrip;
window.createNewTrip = createNewTrip;
window.closeNewTripModal = closeNewTripModal;
window.nextWizardStep = nextWizardStep;
window.finishNewTripWizard = finishNewTripWizard;
window.deleteTrip = deleteTrip;
window.closeDeleteTripModal = closeDeleteTripModal;
window.confirmDeleteTrip = confirmDeleteTrip;
window.toggleTripMenu = toggleTripMenu;
window.backToMain = backToMain;
window.addMemoryItem = addMemoryItem;
window.closeMemoryModal = closeMemoryModal;
window.handleMemoryPhotoChange = handleMemoryPhotoChange;
window.saveMemoryItem = saveMemoryItem;
window.deleteMemory = deleteMemory;
window.toggleMemoryLock = toggleMemoryLock;
window.login = login;
window.logout = logout;
window.openLogoutModal = openLogoutModal;
window.closeLogoutModal = closeLogoutModal;
window.confirmLogout = confirmLogout;
window.updateMeta = updateMeta;
window.updateTimeline = updateTimeline;
window.updateTripDate = updateTripDate;
window.updateDateRange = updateDateRange;
window.handleImageUpload = handleImageUpload;
window.dragStart = dragStart;
window.dragEnd = dragEnd;
window.dragOver = dragOver;
window.drop = drop;
window.selectDay = selectDay;
window.viewTimelineItem = viewTimelineItem;
window.closeDetailModal = closeDetailModal;
window.updateItemNote = updateItemNote;
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.downloadTripAsPDF = downloadTripAsPDF;
window.copyShareLink = copyShareLink;
window.enableNoteEdit = enableNoteEdit;
window.addListItem = addListItem;
window.toggleListCheck = toggleListCheck;
window.deleteListItem = deleteListItem;
window.openShoppingAddModal = openShoppingAddModal;
window.closeShoppingAddModal = closeShoppingAddModal;
window.confirmShoppingAdd = confirmShoppingAdd;
window.selectShoppingLocation = selectShoppingLocation;
window.skipShoppingLocation = skipShoppingLocation;
window.openExpenseModal = openExpenseModal;
window.closeExpenseModal = closeExpenseModal;
window.saveExpense = saveExpense;
window.deleteExpense = deleteExpense;
window.openShoppingListSelector = openShoppingListSelector;
window.closeShoppingListSelector = closeShoppingListSelector;
window.selectShoppingItem = selectShoppingItem;
window.selectedShoppingItemIndex = null; // 전역 변수로 노출
window.lastExpenseLocation = null; // 마지막 지출 장소 추적
window.openGoogleMapsExternal = openGoogleMapsExternal;
window.openTimeModal = openTimeModal;
window.closeTimeModal = closeTimeModal;
window.confirmTimeSelection = confirmTimeSelection;
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.selectCategory = selectCategory;
window.addTransitItem = addTransitItem;
window.openTransitInputModal = openTransitInputModal;
window.closeTransitInputModal = closeTransitInputModal;
window.saveTransitItem = saveTransitItem;
window.calculateTransitDuration = calculateTransitDuration;
window.addTransitItem = Transit.addTransitItem;
window.openTransitInputModal = Transit.openTransitInputModal;
window.closeTransitInputModal = Transit.closeTransitInputModal;
window.saveTransitItem = Transit.saveTransitItem;
window.calculateTransitDuration = Transit.calculateTransitDuration;
window.openLocationSearch = openLocationSearch;
window.addTimelineItem = addTimelineItem;
window.editTimelineItem = editTimelineItem;
window.closeModal = closeModal;
window.setDuration = setDuration;
window.addNoteItem = addNoteItem;
window.saveNewItem = saveNewItem;
window.deleteTimelineItem = deleteTimelineItem;
window.saveTransitItem = saveTransitItem;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.showTransitRecalculateModal = showTransitRecalculateModal;
window.closeTransitRecalculateModal = closeTransitRecalculateModal;
window.openUserMenu = openUserMenu;
window.openUserSettings = openUserSettings;
window.openUserProfile = openUserProfile;
window.closeProfileView = closeProfileView;
window.handleProfilePhotoChange = handleProfilePhotoChange;
window.saveProfileChanges = saveProfileChanges;
window.useManualInput = useManualInput;
window.openManualInputModal = openManualInputModal;
window.closeManualInputModal = closeManualInputModal;
window.confirmManualInput = confirmManualInput;
window.dragLeave = dragLeave;
window.timelineContainerDrop = timelineContainerDrop;
window.touchStart = touchStart;
window.touchMove = touchMove;
window.touchEnd = touchEnd;
window.openAddModal = openAddModal;
window.closeAddModal = closeAddModal;
window.selectAddType = selectAddType;
window.openFlightInputModal = openFlightInputModal;
window.closeFlightInputModal = closeFlightInputModal;
window.saveFlightItem = saveFlightItem;
window.searchFlightNumber = searchFlightNumber;
window.openFlightInputModal = Transit.openFlightInputModal;
window.closeFlightInputModal = Transit.closeFlightInputModal;
window.saveFlightItem = Transit.saveFlightItem;
window.searchFlightNumber = Transit.searchFlightNumber;
window.openTripInfoModal = openTripInfoModal;
window.closeTripInfoModal = closeTripInfoModal;
window.saveTripInfo = saveTripInfo;
window.resetHeroImage = resetHeroImage;
window.deleteHeroImage = deleteHeroImage;
window.openRouteModal = openRouteModal;
window.closeRouteModal = closeRouteModal;
window.openRouteModal = Transit.openRouteModal;
window.closeRouteModal = Transit.closeRouteModal;
window.closeMemoModal = closeMemoModal;
window.editCurrentMemo = editCurrentMemo;
window.editCurrentItem = editCurrentItem;
window.deleteCurrentItem = deleteCurrentItem;
window.saveCurrentMemo = saveCurrentMemo;
window.openCopyItemModal = openCopyItemModal;
window.closeCopyItemModal = closeCopyItemModal;
window.copyItemToCurrent = copyItemToCurrent;
window.handleAttachmentUpload = handleAttachmentUpload;
window.deleteAttachment = deleteAttachment;
window.openAttachment = openAttachment;
window.closeRouteSelectionModal = closeRouteSelectionModal;
window.closeRouteSelectionModal = Transit.closeRouteSelectionModal;
window.openExpenseDetailModal = openExpenseDetailModal;
window.closeExpenseDetailModal = closeExpenseDetailModal;

// 지출 상세 모달
export function openExpenseDetailModal() {
    const modal = document.getElementById('expense-detail-modal');
    
    // 전체 지출 계산
    let totalExpense = 0;
    const expensesByDay = [];
    
    if (travelData.days) {
        travelData.days.forEach((day, dayIdx) => {
            let dayTotal = 0;
            const dayExpenses = [];
            
            if (day.timeline) {
                day.timeline.forEach((item, itemIdx) => {
                    // budget 필드
                    if (item.budget) {
                        const amount = Number(item.budget);
                        dayTotal += amount;
                        dayExpenses.push({
                            title: item.title,
                            description: '예산',
                            amount: amount
                        });
                    }
                    
                    // expenses 배열
                    if (item.expenses && Array.isArray(item.expenses)) {
                        item.expenses.forEach(exp => {
                            const amount = Number(exp.amount || 0);
                            if (amount > 0) { // 0원 더미 데이터 제외
                                dayTotal += amount;
                                
                                // 이동수단인 경우 출발지->도착지 붙이기
                                let displayTitle = item.title;
                                if (item.isTransit) {
                                    const prevItem = itemIdx > 0 ? day.timeline[itemIdx - 1] : null;
                                    const nextItem = itemIdx < day.timeline.length - 1 ? day.timeline[itemIdx + 1] : null;
                                    const from = prevItem && !prevItem.isTransit ? prevItem.title : '출발지';
                                    const to = nextItem && !nextItem.isTransit ? nextItem.title : '도착지';
                                    displayTitle = `${item.title} (${from}→${to})`;
                                }
                                
                                dayExpenses.push({
                                    title: displayTitle,
                                    description: exp.description,
                                    amount: amount
                                });
                            }
                        });
                    }
                });
            }
            
            if (dayTotal > 0) {
                expensesByDay.push({
                    date: day.date,
                    total: dayTotal,
                    expenses: dayExpenses
                });
            }
            
            totalExpense += dayTotal;
        });
    }
    
    // 전체 금액 표시
    document.getElementById('total-expense-amount').textContent = `₩${totalExpense.toLocaleString()}`;
    
    // 일자별 지출 표시
    const dayListEl = document.getElementById('expense-by-day-list');
    if (expensesByDay.length === 0) {
        dayListEl.innerHTML = '<p class="text-center text-gray-400 py-8">지출 내역이 없습니다</p>';
    } else {
        dayListEl.innerHTML = expensesByDay.map((dayData, idx) => `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                <div class="flex justify-between items-center mb-3">
                    <h5 class="font-bold text-gray-800 dark:text-white">${dayData.date}</h5>
                    <p class="text-lg font-bold text-primary">₩${dayData.total.toLocaleString()}</p>
                </div>
                <div class="space-y-2">
                    ${dayData.expenses.map(exp => `
                        <div class="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-900 p-2 rounded-lg">
                            <div class="flex-1 min-w-0">
                                <p class="font-medium text-gray-700 dark:text-gray-300 truncate">${exp.title}</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400">${exp.description}</p>
                            </div>
                            <p class="font-bold text-gray-800 dark:text-white ml-2">₩${exp.amount.toLocaleString()}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
    
    // N분의 1 결과 숨기기
    document.getElementById('split-result').classList.add('hidden');
    document.getElementById('split-people-count').value = '1';
    
    modal.classList.remove('hidden');
}

export function closeExpenseDetailModal() {
    document.getElementById('expense-detail-modal').classList.add('hidden');
}

export function calculateSplit() {
    const peopleCount = Number(document.getElementById('split-people-count').value);
    if (!peopleCount || peopleCount < 1) {
        alert('인원 수를 입력해주세요.');
        return;
    }
    
    const totalText = document.getElementById('total-expense-amount').textContent;
    const total = Number(totalText.replace(/[^0-9]/g, ''));
    const perPerson = Math.ceil(total / peopleCount);
    
    document.getElementById('per-person-amount').textContent = `₩${perPerson.toLocaleString()}`;
    document.getElementById('split-result').classList.remove('hidden');
}

window.calculateSplit = calculateSplit;

// [Context Menu Logic]
let contextMenuTargetIndex = null;
let contextMenuType = null;

export function openContextMenu(e, type, index, dayIndex = currentDayIndex) {
    e.preventDefault();
    contextMenuTargetIndex = index;
    contextMenuType = type;
    setTargetDayIndex(dayIndex); // 컨텍스트 메뉴 열 때 타겟 날짜 설정

    const menu = document.getElementById('context-menu');
    let html = '';

    if (type === 'item') {
        html = `
            <button onclick="handleContextAction('edit')" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg text-primary">edit</span> 수정
            </button>
            <button onclick="handleContextAction('delete')" class="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg">delete</span> 삭제
            </button>
        `;
    } else if (type === 'hero') {
        html = `
            <button onclick="handleContextAction('change_hero')" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg text-primary">add_a_photo</span> 이미지 변경
            </button>
            <button onclick="handleContextAction('reset_hero')" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg text-blue-600">restart_alt</span> 초기 이미지로 복구
            </button>
            <button onclick="handleContextAction('delete_hero')" class="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg">delete</span> 이미지 삭제
            </button>
        `;
    } else if (type === 'trip_info') {
        html = `
            <button onclick="handleContextAction('edit_trip_info')" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg text-primary">edit_square</span> 정보 수정
            </button>
        `;
    }

    menu.innerHTML = html;
    menu.classList.remove('hidden');
    
    // 위치 계산 (화면 밖으로 나가지 않도록)
    let x = e.clientX;
    let y = e.clientY;
    
    const menuWidth = 160;
    const menuHeight = type === 'item' ? 88 : 88; // 대략적인 높이

    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y -= menuHeight;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

export function closeContextMenu() {
    const menu = document.getElementById('context-menu');
    if (!menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
}

export function handleContextAction(action) {
    closeContextMenu();
    
    if (action === 'edit') {
        setIsEditingFromDetail(false);
        editTimelineItem(contextMenuTargetIndex, targetDayIndex);
    } else if (action === 'delete') {
        deleteTimelineItem(contextMenuTargetIndex, targetDayIndex);
    } else if (action === 'change_hero') {
        document.getElementById('hero-image-upload').click();
    } else if (action === 'reset_hero') {
        resetHeroImage();
    } else if (action === 'delete_hero') {
        deleteHeroImage();
    } else if (action === 'edit_trip_info') {
        openTripInfoModal();
    }
}

// 전역 클릭 시 컨텍스트 메뉴 닫기
window.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) {
        closeContextMenu();
    }
});

window.openContextMenu = openContextMenu;
window.handleContextAction = handleContextAction;
window.closeTransitDetailModal = closeTransitDetailModal;
window.editCurrentTransitItem = editCurrentTransitItem;
window.deleteCurrentTransitItem = deleteCurrentTransitItem;
window.fetchTransitTime = fetchTransitTime;
window.openGoogleMapsRouteFromPrev = openGoogleMapsRouteFromPrev;
window.addFastestTransitItem = addFastestTransitItem;
window.closeTransitDetailModal = Transit.closeTransitDetailModal;
window.editCurrentTransitItem = Transit.editCurrentTransitItem;
window.deleteCurrentTransitItem = Transit.deleteCurrentTransitItem;
window.fetchTransitTime = Transit.fetchTransitTime;
window.openGoogleMapsRouteFromPrev = Transit.openGoogleMapsRouteFromPrev;
window.addFastestTransitItem = Transit.addFastestTransitItem;