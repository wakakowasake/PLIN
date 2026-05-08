export function parseTimeStr(str) {
    if (!str) return null;

    let isPM = str.includes('오후') || str.toLowerCase().includes('pm');
    let isAM = str.includes('오전') || str.toLowerCase().includes('am');
    let timeParts = str.replace(/[^0-9:]/g, '').split(':');
    if (timeParts.length < 2) return null;

    let h = parseInt(timeParts[0], 10);
    let m = parseInt(timeParts[1], 10);

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

    let h = 0;
    let m = 0;
    const hMatch = str.match(/(\d+)시간/);
    const mMatch = str.match(/(\d+)분/);

    if (hMatch) h = parseInt(hMatch[1], 10);
    if (mMatch) m = parseInt(mMatch[1], 10);

    return h * 60 + m;
}

export function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    if (h > 0 && m > 0) return `${h}시간 ${m}분`;
    if (h > 0) return `${h}시간`;
    return `${m}분`;
}
