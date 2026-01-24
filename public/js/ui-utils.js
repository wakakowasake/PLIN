// d:\SoongSil Univ\piln\public\js\ui-utils.js
export function parseTimeStr(str) {
    if (!str) return null;
    let isPM = str.includes('오후') || str.toLowerCase().includes('pm');
    let isAM = str.includes('오전') || str.toLowerCase().includes('am');
    let timeParts = str.replace(/[^0-9:]/g, '').split(':');
    if (timeParts.length < 2) return null;
    let h = parseInt(timeParts[0]);
    let m = parseInt(timeParts[1]);

    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;

    return h * 60 + m;
}

export function formatTimeStr(totalMinutes) {
    let h = Math.floor(totalMinutes / 60) % 24;
    let m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function minutesTo24Hour(totalMinutes) {
    let h = Math.floor(totalMinutes / 60) % 24;
    let m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseDurationStr(str) {
    if (!str) return 0;
    let h = 0, m = 0;
    const hMatch = str.match(/(\d+)시간/);
    const mMatch = str.match(/(\d+)분/);
    if (hMatch) h = parseInt(hMatch[1]);
    if (mMatch) m = parseInt(mMatch[1]);
    return h * 60 + m;
}

export function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}시간 ${m}분`;
    if (h > 0) return `${h}시간`;
    return `${m}분`;
}

export function calculateStraightDistance(p1, p2) {
    if (!p1 || !p2 || typeof p1 !== 'object' || typeof p2 !== 'object') return null;
    const lat1 = p1.lat;
    const lng1 = p1.lng;
    const lat2 = p2.lat;
    const lng2 = p2.lng;
    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return null;

    const R = 6371e3; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Input text
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
