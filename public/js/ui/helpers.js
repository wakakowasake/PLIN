import { travelData, targetDayIndex } from '../state.js';

export function updateMeta(key, value) {
    if (key.includes('.')) {
        const [p, c] = key.split('.');
        travelData.meta[p][c] = value;
    } else {
        travelData.meta[key] = value;
    }
}

export function updateTimeline(index, key, value) {
    if (!travelData.days || !travelData.days[targetDayIndex]) return;
    travelData.days[targetDayIndex].timeline[index][key] = value;
}

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
        // Revert to original dates if travelData exists
        if (travelData.days && travelData.days.length > 0) {
            startDateInput.value = travelData.days[0].date || '';
            endDateInput.value = travelData.days[travelData.days.length - 1].date || '';
        }
        return;
    }

    // Update travelData.days based on range
    const days = [];
    let cur = new Date(start);
    while (cur <= end) {
        days.push({ date: cur.toISOString().split('T')[0], timeline: [] });
        cur.setDate(cur.getDate() + 1);
    }
    travelData.days = days;
}

export function handleImageUpload(input) {
    const file = input.files && input.files[0];
    if (!file) return null;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default { updateMeta, updateTimeline, updateTripDate, updateDateRange, handleImageUpload };
