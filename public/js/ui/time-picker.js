// Time Picker Modal Module
// Handles the time selection UI with scroll picker and direct input

/**
 * Handle wheel events for time picker (scroll up/down)
 * @param {WheelEvent} e - Wheel event
 */
function handleTimeWheel(e) {
    e.preventDefault();
    const container = e.currentTarget;
    const direction = Math.sign(e.deltaY);

    // Get current selected value
    let currentVal = getPickerValue(container.id);
    if (currentVal === null) return;
    currentVal = parseInt(currentVal);

    // Increment/decrement with wrap-around (59 -> 0, 12 -> 1)
    let nextVal = currentVal + direction;

    if (container.id === 'time-hour-list') {
        if (nextVal > 23) nextVal = 0;
        if (nextVal < 0) nextVal = 23;
    } else {
        if (nextVal > 59) nextVal = 0;
        if (nextVal < 0) nextVal = 59;
    }

    // Scroll to the element with the next value
    setPickerScroll(container.id, nextVal);
}

/**
 * Handle double-click on time picker for direct input
 * @param {MouseEvent} e - Double-click event
 */
function handleTimeDblClick(e) {
    const container = e.currentTarget; // ul
    const parent = container.parentElement; // div.relative...

    // Ignore if already in input mode
    if (parent.querySelector('input')) return;

    const currentVal = getPickerValue(container.id);

    // UI transition
    container.classList.add('hidden');
    // Hide center highlight line
    const highlight = parent.querySelector('.absolute.inset-x-0');
    if (highlight) highlight.classList.add('hidden');

    const input = document.createElement('input');
    input.type = 'number';
    input.className = "w-full h-full text-center text-2xl font-bold bg-white dark:bg-card-dark border-2 border-primary rounded-xl outline-none z-20 absolute inset-0";
    input.value = currentVal;
    // Prevent click event propagation (prevent modal close)
    input.onclick = (ev) => ev.stopPropagation();

    // Set range
    if (container.id === 'time-hour-list') {
        input.min = 0; input.max = 23;
    } else {
        input.min = 0; input.max = 59;
    }

    let isFinished = false;
    const finishEdit = () => {
        if (isFinished) return;
        isFinished = true;

        let val = parseInt(input.value);

        // Validate and clamp to range
        if (!isNaN(val)) {
            if (container.id === 'time-hour-list') {
                if (val < 0) val = 0;
                if (val > 23) val = 23;
            } else {
                if (val < 0) val = 0;
                if (val > 59) val = 59;
            }

            // Apply value (scroll to position)
            const items = Array.from(container.children);
            const index = items.findIndex(item => parseInt(item.dataset.value) === val);
            if (index !== -1) {
                container.scrollTop = index * 40;
            }
        }

        // Restore UI
        input.remove();
        container.classList.remove('hidden');
        if (highlight) highlight.classList.remove('hidden');
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

/**
 * Initialize time modal by populating hour and minute lists
 */
export function initTimeModal() {
    const hList = document.getElementById('time-hour-list');
    const mList = document.getElementById('time-minute-list');

    if (hList.children.length === 0) {
        for (let i = 0; i <= 23; i++) {
            const li = document.createElement('li');
            li.className = "h-10 flex items-center justify-center snap-center text-lg font-bold text-gray-600 dark:text-gray-300 cursor-pointer transition-colors";
            li.innerText = String(i).padStart(2, '0');
            li.dataset.value = i;
            hList.appendChild(li);
        }
        // Changed to 1-minute intervals
        for (let i = 0; i < 60; i++) {
            const li = document.createElement('li');
            li.className = "h-10 flex items-center justify-center snap-center text-lg font-bold text-gray-600 dark:text-gray-300 cursor-pointer transition-colors";
            li.innerText = String(i).padStart(2, '0');
            li.dataset.value = i;
            mList.appendChild(li);
        }

        // Add event listeners (wheel & double-click)
        hList.addEventListener('wheel', handleTimeWheel, { passive: false });
        mList.addEventListener('wheel', handleTimeWheel, { passive: false });

        hList.addEventListener('dblclick', handleTimeDblClick);
        mList.addEventListener('dblclick', handleTimeDblClick);
    }
}

/**
 * Helper to set picker scroll position to specific value
 * @param {string} elementId - ID of the picker element
 * @param {number} value - Value to scroll to
 */
function setPickerScroll(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const items = Array.from(el.children);
    const index = items.findIndex(item => parseInt(item.dataset.value) === parseInt(value));
    if (index !== -1) {
        el.scrollTop = index * 40; // h-10 = 40px
    }
}

/**
 * Helper to get current selected value from picker
 * @param {string} elementId - ID of the picker element
 * @returns {string|null} Current selected value
 */
function getPickerValue(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return null;
    const index = Math.round(el.scrollTop / 40);
    const items = el.children;
    // Range check
    const safeIndex = Math.max(0, Math.min(index, items.length - 1));
    return items[safeIndex] ? items[safeIndex].dataset.value : null;
}

/**
 * Open the time selection modal
 */
let currentTargetId = 'item-time';

/**
 * Open the time selection modal
 * @param {string} targetId - ID of the input element to receive the time value
 */
export function openTimeModal(targetId = 'item-time') {
    currentTargetId = targetId;
    initTimeModal();
    document.getElementById('time-selection-modal').classList.remove('hidden');

    // Parse current input value and set defaults
    const input = document.getElementById(currentTargetId);
    const currentVal = input ? input.value : '';

    if (currentVal) {
        const timeParts = currentVal.split(':');
        if (timeParts.length >= 2) {
            setPickerScroll('time-hour-list', parseInt(timeParts[0]));
            setPickerScroll('time-minute-list', parseInt(timeParts[1]));
        }
    } else {
        // Default to 12:00 or current time if needed
        setPickerScroll('time-hour-list', 12);
        setPickerScroll('time-minute-list', 0);
    }
}

/**
 * Close the time selection modal
 */
export function closeTimeModal() {
    document.getElementById('time-selection-modal').classList.add('hidden');
    currentTargetId = 'item-time'; // Reset to default
}

/**
 * Confirm time selection and update the input field
 */
export function confirmTimeSelection() {
    const h = getPickerValue('time-hour-list') || 0;
    const m = getPickerValue('time-minute-list') || 0;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    const input = document.getElementById(currentTargetId);
    if (input) {
        input.value = timeStr;
        // Dispatch change event to trigger listeners (e.g. auto-calculation in flight modal)
        input.dispatchEvent(new Event('change'));
    }

    closeTimeModal();
}
