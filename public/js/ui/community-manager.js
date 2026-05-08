import { travelData, currentUser } from '../state.js';
import { showToast, showLoading, hideLoading, lockBodyScroll, unlockBodyScroll } from './modals.js';
import { fetchBackendJson } from '../services/backend/api-client.js';
import {
    sanitizeCommunityTripData
} from '../features/community/community-item-helpers.js';

/**
 * Open the Community Publishing Wizard Modal
 */
export function openCommunityPublishModal() {
    if (!currentUser) {
        showToast("로그인 후 커뮤니티에 게시할 수 있습니다. 🔑", "warning");
        return;
    }

    let modal = document.getElementById('community-publish-modal');
    if (modal) modal.remove(); // 항상 새로 생성하여 상태 오염 방지

    modal = document.createElement('div');
    modal.id = 'community-publish-modal';
    modal.className = 'fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in';
    modal.innerHTML = `
            <div class="bg-white dark:bg-card-dark rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
                <div class="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <h3 class="text-xl font-black text-text-main dark:text-white font-hand">커뮤니티에 자랑하기 🚀</h3>
                    <button type="button" onclick="window.closeCommunityPublishModal()" class="text-gray-400 hover:text-gray-600"><span class="material-symbols-outlined">close</span></button>
                </div>
                
                <div class="p-8 space-y-6">
                    <div class="bg-primary/5 dark:bg-primary/10 p-4 rounded-2xl border border-primary/10">
                        <p class="text-sm text-primary font-bold italic">"당신의 소중한 여행 계획이 다른 사람에게 영감이 됩니다."</p>
                    </div>

                        <!-- [LEGACY: Privacy Option UI] 사용자 요청으로 주석 처리 (2026-01-29) 
                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-widest">포함할 항목 선택</label>
                        <div class="flex items-center justify-between p-4 bg-gray-50/50 dark:bg-gray-800/50 rounded-2xl opacity-60 grayscale cursor-not-allowed">
                            <div class="flex items-center gap-3">
                                <span class="material-symbols-outlined text-gray-400">description</span>
                                <span class="font-bold text-gray-400 dark:text-gray-500">상세 메모 / 지출 / 사진</span>
                            </div>
                            <span class="text-[10px] bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full text-gray-500">Auto-Filtered</span>
                        </div>
                        -->

                        <!-- 간소화된 개인정보 안내 문구 -->
                        <div class="bg-blue-50/50 dark:bg-blue-900/10 p-5 rounded-2xl border border-blue-100/50 dark:border-blue-800/30 text-center space-y-2">
                            <div class="flex justify-center mb-1">
                                <span class="material-symbols-outlined text-blue-500 text-3xl">verified_user</span>
                            </div>
                            <p class="text-sm font-bold text-blue-900 dark:text-blue-200">개인 정보 보호 안내 🛡️</p>
                            <p class="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                                소중한 개인 정보 보호를 위해,<br>
                                <span class="font-bold underline">장소와 경로 정보만</span> 안전하게 추출하여 공유됩니다.
                            </p>
                        </div>

                        <!-- [LEGACY: Detailed Info Box] 사용자 요청으로 주석 처리
                        <p class="text-[11px] text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                            🔒 <span class="font-bold">Privacy-by-Design:</span> 커뮤니티 공유 시 장소별 상세 메모, 지출 내역, 개인 사진은 보안을 위해 자동으로 제외됩니다.
                        </p>
                        -->

                    <p class="text-[10px] text-gray-400 text-center leading-relaxed">
                        공개되는 포스트는 개인의 계획과는 별개의 '발행본'으로 저장됩니다.<br>
                        민감한 정보가 포함되지 않았는지 한 번 더 확인해주세요!
                    </p>
                </div>

                <div class="p-6 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                    <button type="button" onclick="window.closeCommunityPublishModal()" class="flex-1 py-4 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl transition-all">취소</button>
                    <button type="button" onclick="window.confirmCommunityPublish()" class="flex-1 py-4 bg-primary text-white font-bold rounded-2xl hover:bg-orange-500 shadow-lg active:scale-95 transition-all">발행하기</button>
                </div>
            </div>
        `;
    document.body.appendChild(modal);

    // modal.classList.remove('hidden'); // 더 이상 hidden을 기본으로 쓰지 않음
    lockBodyScroll();
    if (window.pushModalState) window.pushModalState();
}

/**
 * Close the publishing modal
 */
export function closeCommunityPublishModal() {
    const modal = document.getElementById('community-publish-modal');
    if (modal) {
        // [Bug Fix] 단순히 숨기는 대신 DOM에서 완전히 제거하여 확실한 폐쇄 보장
        modal.remove();
    }
    unlockBodyScroll();
}

/**
 * Sanitize and Publish to Community
 */
export async function confirmCommunityPublish() {
    if (!currentUser) return;
    if (window.currentTripPermissions && window.currentTripPermissions.canPublishCommunity === false) {
        showToast("이 여행은 게시 권한이 없어요.", "warning");
        return;
    }

    // 1. 모달 즉시 닫기 (로딩 표시 전)
    closeCommunityPublishModal();

    // [Bug Fix] 상위 "공유하기" 모달도 존재한다면 함께 닫기
    if (window.closeShareModal) window.closeShareModal();

    // 2. 로딩 표시
    showLoading();

    try {
        const tripId = travelData.id || window.currentTripId || null;
        if (!tripId) {
            const sanitizedData = sanitizeCommunityTripData(travelData);
            if (!sanitizedData?.meta?.title) {
                throw new Error('게시할 여행을 찾지 못했어요.');
            }
        }
        await fetchBackendJson('/community/posts', {
            method: 'POST',
            body: { tripId }
        });

        // 3. 성공 알림 및 탭 전환
        showToast("커뮤니티에 성공적으로 게시되었습니다! ✨", "success");

        // 확실히 모달이 닫혔는지 한 번 더 확인 (상태 보완)
        closeCommunityPublishModal();

        if (window.switchTab) window.switchTab('community');

    } catch (e) {
        console.error("Error publishing to community:", e);
        showToast("게시 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", "error");
    } finally {
        hideLoading();
    }

}
// Window Binding
window.openCommunityPublishModal = openCommunityPublishModal;
window.closeCommunityPublishModal = closeCommunityPublishModal;
window.confirmCommunityPublish = confirmCommunityPublish;
