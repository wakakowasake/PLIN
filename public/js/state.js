export const defaultTravelData = {
    meta: {
        userImage: "https://placehold.co/100", // 사용자 프로필 사진
        dayCount: "2박 3일", // 여행 기간 (N박 M일)
        title: "아라시야마 탐방",
        subInfo: "교토 봄 여행 • 2024년 4월 12일",
        mapImage: "https://placehold.co/600x400", // 지도 배경 이미지
        defaultMapImage: "https://placehold.co/600x400", // 초기 설정된 지도 배경 이미지 (복구용)
        lat: 35.0116, lng: 135.6688, // 기본 좌표 (Arashiyama)
        weather: { temp: "22°C", minTemp: "15°C", maxTemp: "25°C", desc: "맑음, 쾌청" },
        timezone: "Asia/Tokyo", // [Added] 타임존 정보 (기본값: 도쿄)
        budget: "₩60,000",
        note: "대나무 숲은 사람이 붐비기 전 이른 아침에 사진 찍기 좋음.",
        memoryLocked: false // [Added] 추억 잠금 상태
    },
    shoppingList: [],
    checklist: [],
    // 날짜별 일정 관리 (기존 timeline을 days 배열로 변경)
    days: [
        {
            date: "2024-04-12",
            timeline: [
                {
                    time: "오전 08:00 - 09:00",
                    title: "호텔 조식",
                    location: "교토 센추리 호텔",
                    icon: "restaurant",
                    tag: "포함됨",
                    tagColor: "green",
                    image: null
                },
                {
                    time: "오전 09:30",
                    title: "대나무 숲으로 이동 (기차)",
                    location: "산인선 • 3번 승강장 • JR 패스 사용",
                    icon: "train",
                    tag: null,
                    isTransit: true,
                    image: null
                },
                {
                    time: "오전 10:30",
                    title: "대나무 숲 산책",
                    location: "필수 사진 명소",
                    icon: "directions_walk",
                    tag: null,
                    image: "https://placehold.co/600x300"
                },
                {
                    time: "오후 01:00",
                    title: "점심 식사 (% 아라비카)",
                    location: "아라시야마 강변",
                    icon: "local_cafe",
                    tag: "약 1,500엔",
                    tagColor: "gray",
                    image: null
                }
            ]
        }
    ]
};

export let travelData = JSON.parse(JSON.stringify(defaultTravelData));
export let currentDayIndex = 0;
export let targetDayIndex = 0; // 작업 대상 날짜 인덱스 (전체 보기 시 클릭한 아이템의 날짜)
export let currentTripId = null;
export let newTripDataTemp = {};
export let pendingTransitCallback = null;
export let editingItemIndex = null;
export let viewingItemIndex = null;
export let currentTripUnsubscribe = null;
export let isEditing = false;
export let currentUser = null;
export let insertingItemIndex = null;
export let isEditingFromDetail = false;

// Observer Pattern: Listeners
const listeners = [];

export const subscribe = (listener) => {
    listeners.push(listener);
    return () => { // Unsubscribe function
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
    };
};

const notifyListeners = () => {
    listeners.forEach(listener => listener(travelData));
};

// Setter functions to allow modification from other modules
export const setTravelData = (val) => {
    travelData = val;
    notifyListeners();
};
export const setCurrentDayIndex = (val) => currentDayIndex = val;
export const setTargetDayIndex = (val) => targetDayIndex = val;
export const setCurrentTripId = (val) => currentTripId = val;
export const setNewTripDataTemp = (val) => newTripDataTemp = val;
export const setPendingTransitCallback = (val) => pendingTransitCallback = val;
export const setEditingItemIndex = (val) => editingItemIndex = val;
export const setViewingItemIndex = (val) => viewingItemIndex = val;
export const setCurrentTripUnsubscribe = (val) => currentTripUnsubscribe = val;
export const setIsEditing = (val) => isEditing = val;
export const setCurrentUser = (val) => currentUser = val;
export const setInsertingItemIndex = (val) => insertingItemIndex = val;
export const setIsEditingFromDetail = (val) => isEditingFromDetail = val;