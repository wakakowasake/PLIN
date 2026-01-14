import { travelData, setTravelData } from '../state.js';

export function dragStart(ev, itemIndex, dayIndex) {
    ev.dataTransfer.setData('text/plain', JSON.stringify({ itemIndex, dayIndex }));
}

export function drop(ev, targetIndex, targetDayIndex) {
    try {
        const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
        const { itemIndex, dayIndex } = data;
        if (dayIndex === undefined) return;
        const item = travelData.days[dayIndex].timeline.splice(itemIndex, 1)[0];
        travelData.days[targetDayIndex].timeline.splice(targetIndex, 0, item);
        setTravelData(travelData);
    } catch (e) {
        console.error('drop error', e);
    }
}

export function touchStart(e, meta) {
    // Placeholder for touch start handling
    meta.startY = e.touches ? e.touches[0].clientY : e.clientY;
}

export function touchMove(e, meta) {
    // Placeholder for touch move handling
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    meta.delta = y - (meta.startY || 0);
}

export function reorderTimeline(dayIndex, fromIndex, toIndex) {
    const arr = travelData.days[dayIndex].timeline;
    if (!arr || fromIndex === toIndex) return;
    const [item] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, item);
    setTravelData(travelData);
}

export default {
    dragStart,
    drop,
    touchStart,
    touchMove,
    reorderTimeline
};
