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
    MODAL_LIGHTBOX: 300,   // Level 3.5: Lightbox/Image preview
    MODAL_SYSTEM: 400,     // Level 4: Toasts, Global system alerts
    DRAG_GHOST: 500,       // Drag ghost element
    MODAL_MAX: 1000,       // Emergencies
    MAX: 2147483647
};

// Re-export data from other modules for backward compatibility
export { categoryList } from './category-picker.js';
export { majorAirports } from './flight-manager.js';
