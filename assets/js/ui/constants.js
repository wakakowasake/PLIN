// Constants Module
// Shared constants, default values, and configuration

/**
 * Category list for timeline items
 */
export const categoryList = [
    { code: 'meal', name: '식사', icon: 'restaurant' },
    { code: 'culture', name: '문화', icon: 'museum' },
    { code: 'sightseeing', name: '관광', icon: 'photo_camera' },
    { code: 'shopping', name: '쇼핑', icon: 'shopping_bag' },
    { code: 'accommodation', name: '숙소', icon: 'hotel' },
    { code: 'custom', name: '기타', icon: 'star' }
];

/**
 * Major airports for autocomplete
 */
export const majorAirports = [
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

/**
 * Transit icons mapping
 */
export const transitIcons = {
    walk: 'directions_walk',
    car: 'directions_car',
    bus: 'directions_bus',
    subway: 'subway',
    train: 'train',
    flight: 'flight',
    ferry: 'directions_boat',
    bike: 'directions_bike',
};

/**
 * Default travel data structure
 */
export const defaultTravelData = {
    meta: {
        title: '새로운 여행',
        subInfo: '',
        dayCount: '1박 2일',
        mapImage: '',
        defaultMapImage: '',
        lat: null,
        lng: null,
        note: '',
        budget: '₩0',
        memoryLocked: false
    },
    days: []
};

/**
 * Day names (Korean)
 */
export const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * Month names (Korean)
 */
export const monthNames = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월'
];

/**
 * Weather icon mapping
 */
export const weatherIcons = {
    clear: 'wb_sunny',
    clouds: 'cloud',
    rain: 'rainy',
    snow: 'ac_unit',
    thunderstorm: 'thunderstorm',
    drizzle: 'grain',
    mist: 'foggy',
    fog: 'foggy',
};

/**
 * Color themes
 */
export const colors = {
    primary: '#ee8700',
    secondary: '#3579f6',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    gray: {
        50: '#f9fafb',
        100: '#f3f4f6',
        200: '#e5e7eb',
        300: '#d1d5db',
        400: '#9ca3af',
        500: '#6b7280',
        600: '#4b5563',
        700: '#374151',
        800: '#1f2937',
        900: '#111827',
    }
};

/**
 * Animation durations (ms)
 */
export const animationDurations = {
    fast: 150,
    normal: 300,
    slow: 500,
};

/**
 * Auto-save debounce delay (ms)
 */
export const AUTO_SAVE_DELAY = 1000;

/**
 * Long press duration for drag (ms)
 */
export const LONG_PRESS_DURATION = 500;

/**
 * Maximum file upload size (bytes)
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default {
    categoryList,
    majorAirports,
    transitIcons,
    defaultTravelData,
    dayNames,
    monthNames,
    weatherIcons,
    colors,
    animationDurations,
    AUTO_SAVE_DELAY,
    LONG_PRESS_DURATION,
    MAX_FILE_SIZE
};
