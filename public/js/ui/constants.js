/**
 * Global Z-Index System
 * Systematic approach to stacking layers
 */
export const Z_INDEX = {
    BASE: 0,
    UI_LOW: 1,             // Normal elements
    UI_BASE: 10,           // Floating buttons, indicators
    MODAL_INNER: 50,       // Buttons inside modals
    STICKY: 100,           // Sticky headers
    DROPDOWN: 110,         // Context menus, dropdowns
    MODAL_BACKDROP: 140,   // Backdrop (usually handled by inset-0 bg-black/50)
    MODAL_VIEW: 150,       // Level 1: Detail viewers (Transit Detail, Route Map)
    MODAL_INPUT: 210,      // Level 2: Editor/Input modals (Add Memory, Add Flight)
    MODAL_CONFIRM: 250,    // Level 3: Confirmation dialogs
    MODAL_SELECTOR: 260,   // Level 3.2: Selectors over Input modals (Shopping List Selector)
    MODAL_LIGHTBOX: 300,   // Level 3.5: Lightbox/Image preview
    MODAL_SYSTEM: 400,     // Level 4: Toasts, Global system alerts
    DRAG_GHOST: 500,       // Drag ghost element
    MODAL_MAX: 1000,       // Emergencies
    MAX: 2147483647
};

// Re-export data from other modules for backward compatibility
export { categoryList } from './category-picker.js';

/**
 * Major airports worldwide (for flight autocomplete suggestions)
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
