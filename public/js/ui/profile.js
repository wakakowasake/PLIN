import { auth, db } from '../firebase.js';
import { updateProfile } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, updateDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { currentUser, setCurrentUser } from '../state.js';

export function openUserMenu() {
    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
        if (!dropdown.classList.contains('hidden')) {
            document.addEventListener('click', closeUserMenuOnClickOutside);
        }
    }
}

export function closeUserMenuOnClickOutside(e) {
    const dropdown = document.getElementById('user-menu-dropdown');
    const userAvatar = document.getElementById('user-avatar');
    if (dropdown && userAvatar && !dropdown.contains(e.target) && !userAvatar.contains(e.target)) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeUserMenuOnClickOutside);
    }
}

export function openUserSettings() {
    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    // 설정 모달 생성 (이미 존재하면 재사용)
    let modal = document.getElementById('user-settings-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'user-settings-modal';
        modal.className = 'fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-text-main dark:text-white">설정</h3>
                    <button type="button" onclick="closeUserSettings()" class="text-gray-400 hover:text-gray-600"><span class="material-symbols-outlined">close</span></button>
                </div>
                <div class="p-6 space-y-4">
                    <!-- 다크모드 토글 -->
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="font-bold text-text-main dark:text-white">다크 모드</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">어두운 테마 사용</p>
                        </div>
                        <button type="button" id="dark-mode-toggle" onclick="toggleDarkMode()" 
                            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                            <span class="sr-only">다크 모드 토글</span>
                            <span id="dark-mode-toggle-dot" class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // 현재 다크모드 상태에 맞게 토글 버튼 업데이트
    updateDarkModeToggle();
    modal.classList.remove('hidden');
}

export function openUserProfile() {
    const profileView = document.getElementById('profile-view');
    const mainView = document.getElementById('main-view');
    const detailView = document.getElementById('detail-view');
    const loginView = document.getElementById('login-view');
    mainView.classList.add('hidden');
    detailView.classList.add('hidden');
    loginView.classList.add('hidden');
    profileView.classList.remove('hidden');
    const dropdown = document.getElementById('user-menu-dropdown'); if (dropdown) dropdown.classList.add('hidden');
    loadProfileData();
    setupHomeAddressAutocomplete();
}

export function closeProfileView() {
    const profileView = document.getElementById('profile-view');
    const mainView = document.getElementById('main-view');
    profileView.classList.add('hidden');
    mainView.classList.remove('hidden');

    // 프로필 뷰를 닫을 때 헤더 아바타를 최신 상태로 업데이트
    const cachedPhoto = localStorage.getItem('cachedUserPhotoURL');
    const userAvatar = document.getElementById('user-avatar');
    if (cachedPhoto && userAvatar) {
        userAvatar.style.backgroundImage = `url("${cachedPhoto}")`;
    }
}

export function setupHomeAddressAutocomplete() {
    const homeAddressInput = document.getElementById('profile-home-address');
    if (!homeAddressInput) return;
    if (!window.google || !window.google.maps) {
        console.warn('Google Maps API not loaded');
        return;
    }
    const autocomplete = new google.maps.places.Autocomplete(homeAddressInput, { types: ['geocode'] });
    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
            const homeCoords = document.getElementById('profile-home-coords');
            if (homeCoords) homeCoords.textContent = `좌표: ${place.geometry.location.lat().toFixed(6)}, ${place.geometry.location.lng().toFixed(6)}`;
        }
    });
    homeAddressInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const event = new Event('keydown', { bubbles: true });
            Object.defineProperty(event, 'keyCode', { value: 40 });
            homeAddressInput.dispatchEvent(event);
            setTimeout(() => {
                const enterEvent = new Event('keydown', { bubbles: true });
                Object.defineProperty(enterEvent, 'keyCode', { value: 13 });
                homeAddressInput.dispatchEvent(enterEvent);
            }, 100);
        }
    });
}

export async function geocodeAddress(address) {
    try {
        if (!window.google || !window.google.maps) {
            console.warn('Google Maps API not loaded');
            return null;
        }
        const geocoder = new google.maps.Geocoder();
        return new Promise((resolve) => {
            geocoder.geocode({ address }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    resolve({ lat: results[0].geometry.location.lat(), lng: results[0].geometry.location.lng() });
                } else {
                    alert('주소를 찾을 수 없습니다. 정확한 주소를 입력해주세요.');
                    resolve(null);
                }
            });
        });
    } catch (error) {
        console.error('Geocode error:', error);
        return null;
    }
}

export function loadProfileData() {
    if (!currentUser) return;
    const nameInput = document.getElementById('profile-name-input'); if (nameInput) nameInput.value = currentUser.displayName || '';
    const emailDisplay = document.getElementById('profile-email-display'); if (emailDisplay) emailDisplay.textContent = currentUser.email || '--';
    let photoURL = currentUser.customPhotoURL || currentUser.photoURL || localStorage.getItem('cachedUserPhotoURL');
    const avatarLarge = document.getElementById('profile-avatar-large'); if (avatarLarge && photoURL) avatarLarge.style.backgroundImage = `url("${photoURL}")`;
    const homeAddressInput = document.getElementById('profile-home-address'); const homeCoords = document.getElementById('profile-home-coords');
    if (homeAddressInput && currentUser.homeAddress) homeAddressInput.value = currentUser.homeAddress;
    if (homeCoords && currentUser.homeLat && currentUser.homeLng) homeCoords.textContent = `좌표: ${currentUser.homeLat.toFixed(6)}, ${currentUser.homeLng.toFixed(6)}`;
    const phoneInput = document.getElementById('profile-phone'); const emergencyContactInput = document.getElementById('profile-emergency-contact');
    const passportInput = document.getElementById('profile-passport'); const passportExpiryInput = document.getElementById('profile-passport-expiry');
    const birthInput = document.getElementById('profile-birth'); const bloodTypeInput = document.getElementById('profile-blood-type'); const allergiesInput = document.getElementById('profile-allergies');
    if (phoneInput) phoneInput.value = currentUser.phone || '';
    if (emergencyContactInput) emergencyContactInput.value = currentUser.emergencyContact || '';
    if (passportInput) passportInput.value = currentUser.passport || '';
    if (passportExpiryInput) passportExpiryInput.value = currentUser.passportExpiry || '';
    if (birthInput) birthInput.value = currentUser.birth || '';
    if (bloodTypeInput) bloodTypeInput.value = currentUser.bloodType || '';
    if (allergiesInput) allergiesInput.value = currentUser.allergies || '';
}

export function handleProfilePhotoChange(event) {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('파일 크기가 5MB를 초과합니다.'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataURL = e.target.result;
        const avatarLarge = document.getElementById('profile-avatar-large'); if (avatarLarge) avatarLarge.style.backgroundImage = `url("${dataURL}")`;
        sessionStorage.setItem('pendingProfilePhoto', dataURL);
    };
    reader.readAsDataURL(file);
}

export async function saveProfileChanges() {
    if (!currentUser) { alert('로그인이 필요합니다.'); return; }
    const nameInput = document.getElementById('profile-name-input'); const homeAddressInput = document.getElementById('profile-home-address');
    const phoneInput = document.getElementById('profile-phone'); const emergencyContactInput = document.getElementById('profile-emergency-contact');
    const passportInput = document.getElementById('profile-passport'); const passportExpiryInput = document.getElementById('profile-passport-expiry');
    const birthInput = document.getElementById('profile-birth'); const bloodTypeInput = document.getElementById('profile-blood-type'); const allergiesInput = document.getElementById('profile-allergies');
    const newName = nameInput ? nameInput.value.trim() : '';
    const newHomeAddress = homeAddressInput ? homeAddressInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const emergencyContact = emergencyContactInput ? emergencyContactInput.value.trim() : '';
    const passport = passportInput ? passportInput.value.trim() : '';
    const passportExpiry = passportExpiryInput ? passportExpiryInput.value : '';
    const birth = birthInput ? birthInput.value : '';
    const bloodType = bloodTypeInput ? bloodTypeInput.value : '';
    const allergies = allergiesInput ? allergiesInput.value.trim() : '';
    if (!newName) { alert('이름을 입력하세요.'); return; }
    try {
        await updateProfile(auth.currentUser, { displayName: newName });
        const userRef = doc(db, "users", currentUser.uid);
        const updateData = { displayName: newName, phone, emergencyContact, passport, passportExpiry, birth, bloodType, allergies };
        if (newHomeAddress) {
            const homeData = await geocodeAddress(newHomeAddress);
            if (homeData) { updateData.homeAddress = newHomeAddress; updateData.homeLat = homeData.lat; updateData.homeLng = homeData.lng; }
        } else { updateData.homeAddress = ''; updateData.homeLat = null; updateData.homeLng = null; }
        await updateDoc(userRef, updateData);
        const pendingPhoto = sessionStorage.getItem('pendingProfilePhoto');
        if (pendingPhoto) {
            await updateDoc(userRef, { photoURL: pendingPhoto });
            localStorage.setItem('cachedUserPhotoURL', pendingPhoto);
            setCurrentUser({ ...currentUser, customPhotoURL: pendingPhoto, displayName: newName });
            const userAvatar = document.getElementById('user-avatar'); if (userAvatar) userAvatar.style.backgroundImage = `url("${pendingPhoto}")`;
            sessionStorage.removeItem('pendingProfilePhoto');
        } else {
            setCurrentUser({ ...currentUser, displayName: newName });
        }
        const mainTitle = document.getElementById('main-view-title'); if (mainTitle) mainTitle.innerText = `${newName}님의 여행 계획`;
        alert('프로필이 저장되었습니다.'); closeProfileView();
    } catch (error) { console.error("프로필 저장 실패:", error); alert('프로필 저장에 실패했습니다: ' + error.message); }
}

export function closeUserSettings() {
    const modal = document.getElementById('user-settings-modal');
    if (modal) modal.classList.add('hidden');
}

export function toggleDarkMode() {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');

    if (isDark) {
        html.classList.remove('dark');
        html.classList.add('light');
        localStorage.setItem('theme', 'light');
    } else {
        html.classList.remove('light');
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }

    updateDarkModeToggle();
}

export function updateDarkModeToggle() {
    const toggle = document.getElementById('dark-mode-toggle');
    const dot = document.getElementById('dark-mode-toggle-dot');
    if (!toggle || !dot) return;

    const isDark = document.documentElement.classList.contains('dark');

    if (isDark) {
        toggle.classList.add('bg-primary');
        toggle.classList.remove('bg-gray-300');
        dot.classList.add('translate-x-5');
    } else {
        toggle.classList.remove('bg-primary');
        toggle.classList.add('bg-gray-300');
        dot.classList.remove('translate-x-5');
    }
}

// 페이지 로드 시 다크모드 초기화
export function initDarkMode() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const html = document.documentElement;

    if (savedTheme === 'dark') {
        html.classList.remove('light');
        html.classList.add('dark');
    } else {
        html.classList.remove('dark');
        html.classList.add('light');
    }
}

export default { openUserMenu, closeUserMenuOnClickOutside, openUserSettings, closeUserSettings, toggleDarkMode, updateDarkModeToggle, initDarkMode, openUserProfile, closeProfileView, setupHomeAddressAutocomplete, geocodeAddress, loadProfileData, handleProfilePhotoChange, saveProfileChanges };
