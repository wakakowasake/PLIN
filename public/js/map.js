import { travelData, newTripDataTemp, currentDayIndex } from './state.js';
import { updateMeta, renderItinerary, closeModal } from './ui.js';

export let map;
export let mapMarker;
let autocomplete;

// [Mapbox Configuration]
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간 캐시 유지
const BACKEND_URL = "https://us-central1-plin-db93d.cloudfunctions.net/api";

async function fetchUnsplashImage(query) {
    const cacheKey = `unsplash_img_${query}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const { url, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
                return url; // 캐시된 이미지 반환 (API 호출 안 함)
            }
        } catch (e) {
            localStorage.removeItem(cacheKey);
        }
    }

    try {
        // 백엔드 프록시 서버 호출 (API 키 노출 방지)
        const res = await fetch(`${BACKEND_URL}/unsplash-proxy?query=${encodeURIComponent(query)}`);
        
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: res.statusText }));
            console.error("Unsplash Proxy Error:", errorData);
            return null;
        }

        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const url = data.results[0].urls.regular;
            try {
                localStorage.setItem(cacheKey, JSON.stringify({ url, timestamp: Date.now() }));
            } catch (e) { console.warn('LocalStorage full', e); }
            return url;
        }
    } catch (e) {
        console.error("Unsplash Image Fetch Error:", e);
    }
    return null;
}

let wizardAutocomplete;
export let searchMode = 'item'; // 'item' or 'trip'

export function setSearchMode(mode) {
    searchMode = mode;
}

// Google Maps 인증 실패 처리
export function gm_authFailure() {
    console.error("Google Maps API Authentication Error. Please check your API Key settings in Google Cloud Console.");
    alert("Google 지도 로드 실패: API 키 설정을 확인하세요. (자세한 내용은 콘솔 확인)");
}

// 엔터 키 입력 시 첫 번째 검색 결과 자동 선택
function handleEnterKey(e) {
    if (e.key === 'Enter') {
        const containers = document.querySelectorAll('.pac-container');
        let visibleContainer = null;
        for (const c of containers) {
            if (c.offsetParent && c.querySelector('.pac-item')) {
                visibleContainer = c;
                break;
            }
        }

        if (visibleContainer) {
            // 이미 선택된 항목이 있으면 패스
            if (visibleContainer.querySelector('.pac-item-selected')) return;

            // 선택된 항목이 없으면 첫 번째 항목 자동 선택 시도 (ArrowDown -> Enter 시뮬레이션)
            e.preventDefault();
            e.stopPropagation();
            const input = e.target;

            // 1. ArrowDown 이벤트 발송 (첫 번째 항목 선택 유도)
            const arrowDownEvent = new KeyboardEvent('keydown', {
                key: 'ArrowDown',
                code: 'ArrowDown',
                bubbles: true,
                cancelable: true
            });
            Object.defineProperty(arrowDownEvent, 'keyCode', { get: () => 40 });
            Object.defineProperty(arrowDownEvent, 'which', { get: () => 40 });
            input.dispatchEvent(arrowDownEvent);

            // 2. Enter 이벤트 발송 (선택된 항목 확정)
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true
            });
            Object.defineProperty(enterEvent, 'keyCode', { get: () => 13 });
            Object.defineProperty(enterEvent, 'which', { get: () => 13 });
            input.dispatchEvent(enterEvent);
        }
    }
}

export function setupAutocomplete() {
    const input = document.getElementById("place-search");
    if (!input || !window.google || !window.google.maps || !window.google.maps.places) return;
    
    if (!input.dataset.hasEnterListener) {
        input.addEventListener('keydown', handleEnterKey);
        input.dataset.hasEnterListener = "true";
    }

    if (autocomplete) return; // 이미 초기화됨
    
    const options = {
        fields: ["formatted_address", "geometry", "name", "formatted_phone_number", "photos", "address_components"],
        strictBounds: false,
    };
    
    try {
        autocomplete = new google.maps.places.Autocomplete(input, options);
        autocomplete.addListener("place_changed", fillInAddress);
    } catch (e) {
        console.error("Autocomplete setup failed:", e);
    }
}

export function setupWizardAutocomplete() {
    const input = document.getElementById("new-trip-location");
    if (!input || !window.google || !window.google.maps || !window.google.maps.places) return;
    
    if (!input.dataset.hasEnterListener) {
        input.addEventListener('keydown', handleEnterKey);
        input.dataset.hasEnterListener = "true";
    }

    if (wizardAutocomplete) return;
    
    const options = {
        fields: ["formatted_address", "geometry", "name", "photos", "address_components"],
        strictBounds: false
    };
    
    wizardAutocomplete = new google.maps.places.Autocomplete(input, options);
    wizardAutocomplete.addListener("place_changed", () => {
        const place = wizardAutocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;
        
        newTripDataTemp.locationName = place.name;
        newTripDataTemp.address = place.formatted_address;
        newTripDataTemp.lat = place.geometry.location.lat();
        newTripDataTemp.lng = place.geometry.location.lng();

        if (place.photos && place.photos.length > 0) {
            newTripDataTemp.mapImage = place.photos[0].getUrl({ maxWidth: 4000, maxHeight: 3000 });
        }

        // 랜드마크 검색으로 더 좋은 사진 찾기
        let searchQuery = place.name;
        
        // [Modified] 장소가 도시/국가 등 지역 그 자체라면 굳이 세부 행정구역명으로 덮어쓰지 않음
        const isRegion = place.types && (
            place.types.includes('locality') || 
            place.types.includes('administrative_area_level_1') || 
            place.types.includes('country')
        );

        if (!isRegion && place.address_components) {
            const locality = place.address_components.find(c => c.types.includes('locality'));
            const admin = place.address_components.find(c => c.types.includes('administrative_area_level_1'));
            if (locality) {
                searchQuery = locality.long_name;
            } else if (admin) {
                searchQuery = admin.long_name;
            }
        }

        // 한국어 행정구역 접미사 제거 (Unsplash 검색 정확도 향상)
        // 예: "도쿄도" -> "도쿄", "오사카부" -> "오사카", "후쿠오카현" -> "후쿠오카"
        searchQuery = searchQuery.replace(/([가-힣]{2,})(특별시|광역시|특별자치시|특별자치도|도|시|군|구|부|현)$/, '$1');
        
        console.log(`Unsplash Search Query: ${searchQuery}`); // 디버깅용

        // Unsplash에서 고화질 배경 검색
        fetchUnsplashImage(searchQuery).then(url => {
            if (url) {
                newTripDataTemp.mapImage = url;
            }
        });
    });
}

export async function initMap() {
    const mapEl = document.getElementById("map-bg");
    if (mapEl && window.google) {
        // 초기 좌표: 서울 (37.5665, 126.9780) 또는 저장된 좌표
        const lat = Number(travelData.meta.lat) || 37.5665;
        const lng = Number(travelData.meta.lng) || 126.9780;

        map = new google.maps.Map(mapEl, {
            center: { lat, lng },
            zoom: 13,
            disableDefaultUI: true,
            styles: [
                {
                    featureType: "poi",
                    elementType: "labels",
                    stylers: [{ visibility: "off" }]
                }
            ]
        });

        mapMarker = new google.maps.Marker({
            position: { lat, lng },
            map: map
        });
    }
    setupAutocomplete(); // 지도가 로드되면 검색 기능도 바로 준비
}

function fillInAddress() {
    const place = autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) return;

    if (searchMode === 'trip') {
        // 메인 여행지 설정
        updateMeta('title', place.name);
        updateMeta('subInfo', place.formatted_address);
        if (place.photos && place.photos.length > 0) {
            const photoUrl = place.photos[0].getUrl({ maxWidth: 4000, maxHeight: 3000 });
            updateMeta('mapImage', photoUrl);
            updateMeta('defaultMapImage', photoUrl);
        }

        // 랜드마크 검색으로 더 좋은 사진 찾기
        let searchQuery = place.name;
        
        const isRegion = place.types && (
            place.types.includes('locality') || 
            place.types.includes('administrative_area_level_1') || 
            place.types.includes('country')
        );

        if (!isRegion && place.address_components) {
            const locality = place.address_components.find(c => c.types.includes('locality'));
            const admin = place.address_components.find(c => c.types.includes('administrative_area_level_1'));
            if (locality) {
                searchQuery = locality.long_name;
            } else if (admin) {
                searchQuery = admin.long_name;
            }
        }

        // 한국어 행정구역 접미사 제거
        searchQuery = searchQuery.replace(/([가-힣]{2,})(특별시|광역시|특별자치시|특별자치도|도|시|군|구|부|현)$/, '$1');
        console.log(`Unsplash Search Query: ${searchQuery}`);

        // Unsplash에서 고화질 배경 검색
        fetchUnsplashImage(searchQuery).then(url => {
            if (url) {
                updateMeta('mapImage', url);
                updateMeta('defaultMapImage', url);
                // UI 업데이트
                const mapBg = document.getElementById('map-bg');
                if (mapBg) mapBg.style.backgroundImage = `url('${url}')`;
                const heroEl = document.getElementById('trip-hero');
                if (heroEl) heroEl.style.backgroundImage = `url('${url}')`;
            }
        });

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        travelData.meta.lat = lat;
        travelData.meta.lng = lng;
        
        // Google Maps 지도 이동 및 마커 업데이트
        if (map) map.setCenter({ lat, lng });
        if (mapMarker) mapMarker.setPosition({ lat, lng });
        
        const currentDate = travelData.days && travelData.days[currentDayIndex] ? travelData.days[currentDayIndex].date : null;
        fetchWeather(lat, lng, currentDate);
        renderItinerary();
        closeModal();
    } else {
        // 타임라인 아이템 설정
        document.getElementById('item-title').value = place.name;
        document.getElementById('item-location').value = place.formatted_address;
        
        let notes = "";
        if (place.formatted_phone_number) notes += `전화: ${place.formatted_phone_number}\n`;
        document.getElementById('item-notes').value = notes;
        
        // 일본 장소인 경우 일본어 주소도 함께 저장
        const country = place.address_components?.find(c => c.types.includes('country'));
        if (country && country.short_name === 'JP') {
            const lat = place.geometry.location.lat();
            const lng = place.geometry.location.lng();
            
            // Geocoding API로 일본어 주소 가져오기
            fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ja&key=${GOOGLE_MAPS_API_KEY}`)
                .then(response => response.json())
                .then(data => {
                    if (data.results && data.results[0]) {
                        const japaneseAddress = data.results[0].formatted_address;
                        // 일본어 주소를 hidden field에 저장
                        let jaField = document.getElementById('item-location-ja');
                        if (!jaField) {
                            jaField = document.createElement('input');
                            jaField.type = 'hidden';
                            jaField.id = 'item-location-ja';
                            document.getElementById('item-location').parentNode.appendChild(jaField);
                        }
                        jaField.value = japaneseAddress;
                        console.log('Japanese address saved:', japaneseAddress);
                    }
                })
                .catch(error => console.warn('Failed to fetch Japanese address:', error));
        }
    }
}

export async function fetchWeather(lat, lng, date = null) {
    if (!lat || !lng) return;
    try {
        // 날짜 유효성 검증
        if (date) {
            const requestDate = new Date(date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // 과거 날짜 확인
            if (requestDate < today) {
                console.warn(`Past date ${date} not supported, skipping request`);
                return;
            }
            
            // 16일 이상 미래 확인
            const diffDays = Math.floor((requestDate - today) / (1000 * 60 * 60 * 24));
            if (diffDays > 16) {
                console.warn(`Date ${date} is too far in future (${diffDays} days, max 16), skipping weather fetch`);
                return;
            }
        }

        // Open-Meteo API 사용 (무료, API 키 불필요)
        let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`;
        
        if (date) {
            // 특정 날짜 예보
            url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${date}&end_date=${date}`;
        }

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        
        // 타임존 정보 업데이트
        if (data.timezone) {
            updateMeta('timezone', data.timezone);
        }

        let temp, minTemp, maxTemp, desc;

        if (date && data.daily) {
            // 특정 날짜 예보
            if (data.daily.temperature_2m_max && data.daily.temperature_2m_max.length > 0) {
                const maxT = data.daily.temperature_2m_max[0];
                const minT = data.daily.temperature_2m_min[0];
                maxTemp = `${Math.round(maxT)}°C`;
                minTemp = `${Math.round(minT)}°C`;
                temp = `${Math.round((maxT + minT) / 2)}°C`;
                
                const code = data.daily.weather_code[0];
                desc = translateWeatherCode(code);
            }
        } else if (data.current) {
            // 현재 날씨
            temp = `${Math.round(data.current.temperature_2m)}°C`;
            desc = translateWeatherCode(data.current.weather_code);
            
            if (data.daily && data.daily.temperature_2m_max) {
                maxTemp = `${Math.round(data.daily.temperature_2m_max[0])}°C`;
                minTemp = `${Math.round(data.daily.temperature_2m_min[0])}°C`;
            }
        }

        // 데이터 업데이트
        if (temp) updateMeta('weather.temp', temp);
        if (minTemp) updateMeta('weather.minTemp', minTemp);
        if (maxTemp) updateMeta('weather.maxTemp', maxTemp);
        if (desc) updateMeta('weather.desc', desc);
        
        renderItinerary();
    } catch (e) {
        console.warn("Weather fetch failed for date", date, ":", e.message);
    }
}

// Open-Meteo 날씨 코드를 한국어로 변환
function translateWeatherCode(code) {
    const translations = {
        0: '맑음',
        1: '대체로 맑음',
        2: '구름 조금',
        3: '흐림',
        45: '안개',
        48: '안개',
        51: '가랑비',
        53: '가랑비',
        55: '가랑비',
        56: '차가운 이슬비',
        57: '차가운 이슬비',
        61: '약한 비',
        63: '비',
        65: '폭우',
        66: '차가운 비',
        67: '차가운 비',
        71: '약한 눈',
        73: '눈',
        75: '폭설',
        77: '진눈깨비',
        80: '소나기',
        81: '소나기',
        82: '강한 소나기',
        85: '눈',
        86: '폭설',
        95: '뇌우',
        96: '뇌우',
        99: '강한 뇌우'
    };
    return translations[code] || '맑음';
}


// 전역 객체 할당 (HTML 콜백용)
window.initMap = initMap;
window.gm_authFailure = gm_authFailure;

// Google Maps API 동적 로드 (서버에서 키를 가져온 후 실행)
async function loadGoogleMapsAPI() {
    try {
        const response = await fetch(`${BACKEND_URL}/config`);
        const config = await response.json();
        const mapsApiKey = config.googleMapsApiKey;
        
        if (!window.google || !window.google.maps) {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places,geometry&loading=async&language=ko&callback=initMap`;
            script.async = true;
            document.head.appendChild(script);
        } else {
            console.warn('Google Maps API already loaded. Skipping additional load.');
        }
    } catch (error) {
        console.error("Failed to load Google Maps API:", error);
    }
}

// 시간별 날씨 예보 가져오기 (Open-Meteo API)
export async function fetchHourlyWeather(lat, lng, hours = 24) {
    if (!lat || !lng) return null;
    
    try {
        // Open-Meteo API - 시간별 예보
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code&timezone=auto&forecast_hours=${hours}`;
        
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        
        if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
            const hourlyData = [];
            
            for (let i = 0; i < Math.min(hours, data.hourly.time.length); i++) {
                const timeStr = data.hourly.time[i];
                const temp = data.hourly.temperature_2m[i];
                const feelsLike = data.hourly.apparent_temperature[i];
                const humidity = data.hourly.relative_humidity_2m[i];
                const precipitation = data.hourly.precipitation_probability[i];
                const weatherCode = data.hourly.weather_code[i];
                
                hourlyData.push({
                    time: formatHourlyTime(timeStr),
                    temp: temp !== null ? Math.round(temp) : null,
                    feelsLike: feelsLike !== null ? Math.round(feelsLike) : null,
                    humidity: humidity || null,
                    precipitation: precipitation || 0,
                    weatherCode: weatherCode,
                    weatherDesc: translateWeatherCode(weatherCode),
                    icon: getWeatherIconFromCode(weatherCode),
                    isDaytime: isDaytime(timeStr)
                });
            }
            
            return hourlyData;
        }
        
        return null;
    } catch (e) {
        console.warn("Hourly weather fetch failed:", e.message);
        return null;
    }
}

// 시간 포맷 헬퍼 (ISO 8601 형식에서 시간 추출)
function formatHourlyTime(isoTimeStr) {
    if (!isoTimeStr) return '--:--';
    
    try {
        const date = new Date(isoTimeStr);
        const hours = date.getHours();
        const ampm = hours < 12 ? '오전' : '오후';
        const displayHour = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
        
        return `${ampm} ${displayHour}시`;
    } catch (e) {
        return '--:--';
    }
}

// 낮/밤 판별
function isDaytime(isoTimeStr) {
    try {
        const date = new Date(isoTimeStr);
        const hours = date.getHours();
        return hours >= 6 && hours < 18;
    } catch (e) {
        return true;
    }
}

// 날씨 코드에 따른 아이콘 반환
function getWeatherIconFromCode(code) {
    if (code === 0) return 'wb_sunny';
    if (code >= 1 && code <= 3) return 'partly_cloudy_day';
    if (code >= 45 && code <= 48) return 'foggy';
    if (code >= 51 && code <= 57) return 'rainy_light';
    if (code >= 61 && code <= 67) return 'rainy';
    if (code >= 71 && code <= 77) return 'ac_unit';
    if (code >= 80 && code <= 82) return 'rainy';
    if (code >= 85 && code <= 86) return 'ac_unit';
    if (code >= 95 && code <= 99) return 'thunderstorm';
    return 'wb_sunny';
}

// 주간 날씨 데이터 가져오기 (7일)
export async function fetchWeeklyWeather(lat, lng, weekStartDate) {
    if (!lat || !lng) return null;
    
    try {
        const startDate = new Date(weekStartDate);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        
        const startStr = formatDateStr(startDate);
        const endStr = formatDateStr(endDate);
        
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${startStr}&end_date=${endStr}`;
        
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const weeklyData = [];
        
        if (data.daily && data.daily.time && data.daily.time.length > 0) {
            for (let i = 0; i < data.daily.time.length; i++) {
                const date = data.daily.time[i];
                const dateObj = new Date(date);
                const maxTemp = data.daily.temperature_2m_max[i];
                const minTemp = data.daily.temperature_2m_min[i];
                const weatherCode = data.daily.weather_code[i];
                
                // 오늘 이전 날짜는 사용 불가 처리
                const isAvailable = dateObj >= today;
                
                weeklyData.push({
                    date: date,
                    maxTemp: maxTemp !== null ? Math.round(maxTemp) : null,
                    minTemp: minTemp !== null ? Math.round(minTemp) : null,
                    weatherCode: weatherCode,
                    weatherDesc: translateWeatherCode(weatherCode),
                    icon: getWeatherIconFromCode(weatherCode),
                    available: isAvailable
                });
            }
        }
        
        return weeklyData;
    } catch (e) {
        console.warn("Weekly weather fetch failed:", e.message);
        return null;
    }
}

// 특정 날짜의 시간별 날씨 가져오기
export async function fetchHourlyWeatherForDate(lat, lng, dateStr) {
    if (!lat || !lng) return null;
    
    try {
        const targetDate = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 과거 날짜는 데이터 없음
        if (targetDate < today) {
            return null;
        }
        
        // Open-Meteo API - 특정 날짜의 시간별 예보
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,weather_code&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
        
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        
        if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
            const hourlyData = [];
            
            for (let i = 0; i < data.hourly.time.length; i++) {
                const timeStr = data.hourly.time[i];
                const temp = data.hourly.temperature_2m[i];
                const feelsLike = data.hourly.apparent_temperature[i];
                const humidity = data.hourly.relative_humidity_2m[i];
                const precipitation = data.hourly.precipitation_probability[i];
                const weatherCode = data.hourly.weather_code[i];
                
                hourlyData.push({
                    time: formatHourlyTime(timeStr),
                    temp: temp !== null ? Math.round(temp) : null,
                    feelsLike: feelsLike !== null ? Math.round(feelsLike) : null,
                    humidity: humidity || 0,
                    precipitation: precipitation || 0,
                    weatherCode: weatherCode,
                    weatherDesc: translateWeatherCode(weatherCode),
                    icon: getWeatherIconFromCode(weatherCode),
                    isDaytime: isDaytime(timeStr)
                });
            }
            
            return hourlyData;
        }
        
        return null;
    } catch (e) {
        console.warn("Hourly weather for date fetch failed:", e.message);
        return null;
    }
}

function formatDateStr(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// API 로드 시작
loadGoogleMapsAPI();