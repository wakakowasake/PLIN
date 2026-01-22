import { fetchWeeklyWeather, fetchHourlyWeatherForDate, isMapInitialized } from '../map.js';
import { travelData as globalTravelData } from '../state.js';

// Module state
let currentWeatherWeekStart = null;
let selectedWeatherDate = null;
let weeklyWeatherData = null;

/**
 * Get the start of the week (Sunday) for a given date
 * @param {Date} date - Reference date
 * @returns {string} Formatted date string (YYYY-MM-DD)
 */
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day; // Sunday as reference
    d.setDate(d.getDate() - diff);
    return formatDate(d);
}

/**
 * Format date to YYYY-MM-DD string
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Ensure the weather detail modal exists in the DOM
 */
export function ensureWeatherDetailModal() {
    if (!document.getElementById('weather-detail-modal')) {
        const modal = document.createElement('div');
        modal.id = 'weather-detail-modal';
        modal.className = 'hidden fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';

        modal.onclick = (e) => {
            if (e.target === modal) closeWeatherDetailModal();
        };

        modal.innerHTML = `
        <div class="bg-white dark:bg-card-dark rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 modal-slide-in" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold text-text-main dark:text-white flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">partly_cloudy_day</span>
                    날씨
                </h3>
                <button type="button" onclick="window.closeWeatherDetailModal()" aria-label="날씨 상세 닫기"
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            
            <div class="mb-6 text-center">
                <p class="text-sm text-gray-600 dark:text-gray-400" id="weather-location-title">위치 로딩 중...</p>
            </div>
            
            <div id="weekly-weather-container" class="mb-6">
                <!-- 주간 날씨 카드가 여기에 동적으로 추가됨 -->
                <div class="text-center py-8 text-gray-400">
                    <p class="text-sm">로딩 중...</p>
                </div>
            </div>
            
            <div class="border-t border-gray-200 dark:border-gray-700 my-6"></div>
            
            <div>
                <h4 class="text-lg font-bold text-text-main dark:text-white mb-4 flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm">schedule</span>
                    <span id="selected-date-title">시간별 예보</span>
                </h4>
                <div id="hourly-weather-container">
                    <!-- 시간별 날씨가 여기에 동적으로 추가됨 -->
                    <div class="text-center py-8 text-gray-400">
                        <p class="text-sm">날짜를 선택하세요.</p>
                    </div>
                </div>
            </div>
            
            <div class="mt-6 flex justify-end">
                <button type="button" onclick="window.closeWeatherDetailModal()"
                    class="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-text-main dark:text-white rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                    닫기
                </button>
            </div>
        </div>
        `;
        document.body.appendChild(modal);
    }
}

export async function openWeatherDetailModal(data) {
    const travelData = data || globalTravelData;
    ensureWeatherDetailModal();
    const modal = document.getElementById('weather-detail-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    // Set week start based on trip start date
    if (travelData.days && travelData.days.length > 0) {
        const firstDate = new Date(travelData.days[0].date);
        currentWeatherWeekStart = getWeekStart(firstDate);
        selectedWeatherDate = formatDate(firstDate);
    } else {
        // If no trip data, use today
        const today = new Date();
        currentWeatherWeekStart = getWeekStart(today);
        selectedWeatherDate = formatDate(today);
    }

    // Load and render weekly weather data
    await loadAndRenderWeeklyWeather(travelData);
}

/**
 * Load and render weekly weather forecast
 * @param {Object} data - Travel data containing location
 */
async function loadAndRenderWeeklyWeather(data) {
    const travelData = data || globalTravelData;
    const location = (travelData.meta && travelData.meta.title) || '위치 정보 없음';
    document.getElementById('weather-location-title').textContent = location;

    // [Added] 지도 및 위치 정보 초기화 방어 코드
    if (!travelData.meta || !travelData.meta.lat || !travelData.meta.lng) {
        document.getElementById('weekly-weather-container').innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p>위치 정보가 없어 날씨를 표시할 수 없습니다.</p>
            </div>
        `;
        return;
    }

    // 지도가 아직 초기화되지 않았다면 잠시 대기하거나 경고 표시 (API 에러 방지)
    if (!isMapInitialized) {
        // 단, 위도/경도가 확실히 있다면 지도가 없어도 Open-Meteo 호출은 가능하므로
        // 심각한 blocking보다는 경고 로그 정도로 처리하거나, 
        // 엄격한 방어를 원할 경우 여기서 return 처리할 수 있음.
        // 현재는 API 로드 속도 차이를 고려해 loading indicator를 보여주는 방식으로 개선
        console.warn('Weather loaded before Map initialized. Proceeding with latitude/longitude...');
    }

    // Fetch weekly weather data (7 days)
    try {
        weeklyWeatherData = await fetchWeeklyWeather(travelData.meta.lat, travelData.meta.lng, currentWeatherWeekStart);
        renderWeeklyWeather(travelData);

        // Display hourly forecast for selected date
        await loadAndRenderHourlyWeather(travelData);
    } catch (e) {
        console.error('Failed to load weekly weather:', e);
        document.getElementById('weekly-weather-container').innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p>날씨 정보를 불러오는 중 오류가 발생했습니다.</p>
            </div>
        `;
    }
}

/**
 * Render the weekly weather grid
 * @param {Object} data - Travel data for highlighting trip dates
 */
function renderWeeklyWeather(data) {
    const travelData = data || globalTravelData;
    const container = document.getElementById('weekly-weather-container');
    if (!container || !weeklyWeatherData) return;

    // Week header (year-month + navigation)
    const weekStartDate = new Date(currentWeatherWeekStart);
    const yearMonth = `${weekStartDate.getFullYear()}년 ${weekStartDate.getMonth() + 1}월`;

    let html = `
        <div class="flex items-center justify-between mb-4">
            <button onclick="navigateWeatherWeek(-1)" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <h3 class="text-lg font-bold text-text-main dark:text-white">${yearMonth}</h3>
            <button onclick="navigateWeatherWeek(1)" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <span class="material-symbols-outlined">chevron_right</span>
            </button>
        </div>
        <div class="grid grid-cols-7 gap-2">
    `;

    // Create set of trip dates for highlighting
    const tripDates = new Set();
    if (travelData && travelData.days) {
        travelData.days.forEach(day => {
            tripDates.add(day.date);
        });
    }

    // Render 7 days starting from currentWeatherWeekStart
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeatherWeekStart);
        date.setDate(date.getDate() + i);
        const dateStr = formatDate(date);

        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        const dayName = dayNames[date.getDay()];

        const dayData = weeklyWeatherData.find(d => d.date === dateStr);
        const isTripDay = tripDates.has(dateStr);
        const isSelected = dateStr === selectedWeatherDate;
        const isAvailable = dayData && dayData.available;

        const cardClass = isSelected
            ? 'bg-primary text-white'
            : (isTripDay
                ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-primary'
                : 'bg-card-light dark:bg-card-dark border border-gray-200 dark:border-gray-700');

        const textClass = isSelected
            ? 'text-white'
            : (isAvailable
                ? 'text-text-main dark:text-white'
                : 'text-gray-400');

        html += `
            <button 
                onclick="selectWeatherDate('${dateStr}')" 
                class="${cardClass} p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all ${!isAvailable ? 'opacity-50' : ''}">
                <p class="text-xs ${textClass} mb-1">${dayName}</p>
                <p class="text-sm font-bold ${textClass} mb-2">${date.getDate()}</p>
                ${isAvailable && dayData ? `
                    <span class="material-symbols-outlined text-xl ${isSelected ? 'text-white' : 'text-primary'}">${dayData.icon}</span>
                    <p class="text-xs ${textClass} mt-1">${dayData.maxTemp}°</p>
                    <p class="text-xs ${textClass}">${dayData.minTemp}°</p>
                ` : `
                    <span class="material-symbols-outlined text-xl text-gray-400">help</span>
                    <p class="text-xs text-gray-400 mt-1">--</p>
                `}
            </button>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

/**
 * Load and render hourly weather for a specific date
 * @param {Object} data - Travel data containing location
 */
async function loadAndRenderHourlyWeather(data) {
    const travelData = data || globalTravelData;
    const container = document.getElementById('hourly-weather-container');
    if (!container) return;

    const selectedDate = new Date(selectedWeatherDate);
    const dateDisplay = `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`;

    document.getElementById('selected-date-title').textContent = dateDisplay;

    try {
        const hourlyData = await fetchHourlyWeatherForDate(
            travelData.meta.lat,
            travelData.meta.lng,
            selectedWeatherDate
        );

        if (hourlyData && hourlyData.length > 0) {
            let html = '';

            hourlyData.forEach(hour => {
                const tempColor = hour.temp >= 25 ? 'text-red-500' : (hour.temp <= 10 ? 'text-blue-500' : 'text-text-main dark:text-white');

                html += `
                    <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <div class="flex items-center gap-4 flex-1">
                            <p class="text-sm text-gray-600 dark:text-gray-400 w-16">${hour.time}</p>
                            <span class="material-symbols-outlined text-2xl text-primary">${hour.icon}</span>
                            <p class="text-sm text-gray-600 dark:text-gray-400 flex-1">${hour.weatherDesc}</p>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-right">
                                <p class="text-xs text-gray-400">강수</p>
                                <p class="text-sm text-blue-500">${hour.precipitation}%</p>
                            </div>
                            <div class="text-right">
                                <p class="text-xs text-gray-400">습도</p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">${hour.humidity}%</p>
                            </div>
                            <p class="text-xl font-bold ${tempColor} w-16 text-right">${hour.temp}°</p>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <p class="text-sm">해당 날짜의 시간별 예보가 없습니다.</p>
                </div>
            `;
        }
    } catch (e) {
        console.error('Failed to load hourly weather:', e);
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p class="text-sm">시간별 예보를 불러오는 중 오류가 발생했습니다.</p>
            </div>
        `;
    }
}

/**
 * Select a date and update the weather display
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {Object} data - Travel data
 */
export async function selectWeatherDate(dateStr, data) {
    const travelData = data || globalTravelData;
    selectedWeatherDate = dateStr;
    renderWeeklyWeather(travelData);
    await loadAndRenderHourlyWeather(travelData);
}

/**
 * Navigate to previous or next week
 * @param {number} direction - -1 for previous week, 1 for next week
 * @param {Object} data - Travel data
 */
export async function navigateWeatherWeek(direction, data) {
    const travelData = data || globalTravelData;
    const weekStart = new Date(currentWeatherWeekStart);
    weekStart.setDate(weekStart.getDate() + (direction * 7));
    currentWeatherWeekStart = formatDate(weekStart);

    await loadAndRenderWeeklyWeather(travelData);
}

// Global bindings for HTML event handlers
window.openWeatherDetailModal = openWeatherDetailModal;
window.closeWeatherDetailModal = closeWeatherDetailModal;
window.selectWeatherDate = selectWeatherDate;
window.navigateWeatherWeek = navigateWeatherWeek;

/**
 * Close the weather detail modal
 */
export function closeWeatherDetailModal() {
    const modal = document.getElementById('weather-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}
