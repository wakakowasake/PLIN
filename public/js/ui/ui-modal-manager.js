/**
 * ui-modal-manager.js
 * 
 * 역할: 모달 열기/닫기/제어에 관련된 모든 함수들을 한곳에서 관리
 * 
 * 현황: ui.js에 직접 구현되어 있는 모달 함수들을 점진적으로 이 모듈로 이동
 * 
 * Phase 5.4 Step 2: 메모 모달, 여행정보 모달 등을 분리하기 위한 시작점
 */

// 순환 참조 방지: window 글로벌 함수를 사용하거나 lazy import 사용

// 메모 모달 함수들
export const openMemoModal = (...args) => window.openMemoModal?.(...args);
export const closeMemoModal = (...args) => window.closeMemoModal?.(...args);
export const editCurrentMemo = (...args) => window.editCurrentMemo?.(...args);
export const saveCurrentMemo = (...args) => window.saveCurrentMemo?.(...args);
export const updateItemNote = (...args) => window.updateItemNote?.(...args);

// 여행정보 모달 함수들
export const openTripInfoModal = (...args) => window.openTripInfoModal?.(...args);
export const saveTripInfo = (...args) => window.saveTripInfo?.(...args);
export const resetHeroImage = (...args) => window.resetHeroImage?.(...args);
export const deleteHeroImage = (...args) => window.deleteHeroImage?.(...args);

// 초대/공유 모달 함수들
export const openInviteModal = (...args) => window.openInviteModal?.(...args);
export const closeInviteModal = (...args) => window.closeInviteModal?.(...args);
export const closeShareModal = (...args) => window.closeShareModal?.(...args);

// 기타 모달 함수들
export const openTimeModal = (...args) => window.openTimeModal?.(...args);
export const openTransitDetailModal = (...args) => window.openTransitDetailModal?.(...args);
export const closeRouteModal = (...args) => window.closeRouteModal?.(...args);
