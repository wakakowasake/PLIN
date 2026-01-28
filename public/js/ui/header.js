import { firebaseReady, db } from '../firebase.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { travelData, currentUser } from '../state.js';
import { showLoading, hideLoading } from './modals.js';
import { setupTripInfoAutocomplete } from '../map.js';

export async function openShareModal(tripId = null) {
    document.querySelectorAll('[id^="trip-menu-"]').forEach(el => el.classList.add('hidden'));

    const memberListEl = document.getElementById('member-list');
    if (memberListEl) memberListEl.innerHTML = '로딩 중...';
    const modalEl = document.getElementById('share-modal');
    if (modalEl) {
        modalEl.classList.remove('hidden');
        if (window.pushModalState) window.pushModalState();
    }

    let targetTripId = tripId || window.currentTripId || travelData.id;
    let members = {};

    if (tripId) {
        try {
            const docRef = doc(db, 'plans', tripId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                members = docSnap.data().members || {};
            }
        } catch (e) {
            console.error('Error fetching trip members:', e);
        }
    } else {
        members = travelData.members || {};
    }

    const memberUIDs = Object.keys(members).sort((a, b) => {
        if (members[a] === 'owner') return -1;
        if (members[b] === 'owner') return 1;
        return 0;
    });

    // [New] Fetch isPublic state
    let isPublic = false;
    if (targetTripId) {
        try {
            const docRef = doc(db, 'plans', targetTripId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                isPublic = docSnap.data().isPublic || false;
            }
        } catch (e) {
            console.error('Error fetching isPublic state:', e);
        }
    }

    // [New] Generate Share Link based on isPublic
    // 초대 링크 (협업용): invite=...
    // 공개 링크 (보기용): share=...
    const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${targetTripId}`;
    const publicLink = `${window.location.origin}/v/${targetTripId}`;

    // 현재 표시할 링크 결정 (공개 모드면 공개 링크, 아니면 초대 링크)
    // 단, 이 부분은 사용자가 "어떤 링크를 복사하고 싶은지" 명확히 해야 하므로,
    // 공개 모드가 켜져있으면 공개 링크를 우선 보여주거나, 두 링크를 따로 제공하는 것이 좋음.
    // 여기서는 심플하게: 공개 모드가 켜져있으면 공개 링크를 input에 넣음.
    const input = document.getElementById('share-link-input');
    if (input) {
        input.value = isPublic ? publicLink : inviteLink;
    }

    // Add Toggle UI
    const toggleContainer = document.getElementById('public-share-toggle-container');
    if (toggleContainer) {
        // [Modified] 탭 스타일 (Segmented Control)로 직관성 개선
        const helpText = isPublic ? '로그인 없이 누구나 여행 계획을 볼 수 있습니다.' : '초대된 멤버만 여행을 수정할 수 있습니다.';

        const controlHtml = `
            <div class="flex flex-col gap-3">
                <div class="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                    <button type="button" onclick="window.togglePublicShare('${targetTripId}', false)" 
                        class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${!isPublic ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}">
                        <span class="material-symbols-outlined text-[18px]">lock</span>
                        <span>초대 전용</span>
                    </button>
                    <button type="button" onclick="window.togglePublicShare('${targetTripId}', true)" 
                        class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${isPublic ? 'bg-white dark:bg-gray-700 text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}">
                        <span class="material-symbols-outlined text-[18px]">public</span>
                        <span>공개 링크</span>
                    </button>
                </div>
                <div class="flex items-start gap-2 px-1">
                    <span class="material-symbols-outlined text-sm text-gray-400 mt-0.5">info</span>
                    <p id="share-help-text" class="text-xs text-gray-500 dark:text-gray-400 leading-snug">${helpText}</p>
                </div>
                
                <!-- Hidden Input for Logic Compatibility -->
                <input type="checkbox" id="public-share-toggle" class="hidden" ${isPublic ? 'checked' : ''}>
            </div>
         `;
        toggleContainer.innerHTML = controlHtml;
    }

    if (memberListEl) {
        // 멤버 리스트 HTML 생성 (토글 제외)
        let listHtml = '<div class="space-y-2">';
        for (const uid of memberUIDs) {
            try {
                const userRef = doc(db, 'users', uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const userData = userSnap.data();
                    const role = members[uid];
                    const isMe = currentUser && currentUser.uid === uid;
                    const displayName = isMe ? `${userData.displayName} (나)` : userData.displayName;
                    const photoURL = userData.photoURL || '/images/icon-192.png';

                    listHtml += `
                    <div class="flex justify-between items-center bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-100 dark:border-gray-600">
                        <div class="flex items-center gap-3">
                            <img src="${photoURL}" class="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600" onerror="this.src='/images/icon-192.png'">
                            <div>
                                <p class="text-sm font-bold text-gray-900 dark:text-white">${displayName}</p>
                                <p class="text-xs text-gray-500">${userData.email}</p>
                            </div>
                        </div>
                        <span class="text-xs font-semibold text-gray-500 bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded text-center min-w-[50px]">${role}</span>
                    </div>
                `;
                }
            } catch (e) {
                console.error('Error loading member user:', e);
            }
        }
        listHtml += '</div>';

        memberListEl.innerHTML = listHtml;
    }
}

export async function togglePublicShare(tripId, newState) {
    // If newState is provided directly (from button click), use it.
    // Otherwise fall back to checkbox (legacy support or if still used)
    const toggle = document.getElementById('public-share-toggle');
    let isPublic = newState;

    if (typeof newState === 'undefined' && toggle) {
        isPublic = toggle.checked;
    }

    const input = document.getElementById('share-link-input');
    const helpText = document.getElementById('share-help-text');

    // UI Optimistic Update (Re-render buttons to show active state immediately)
    // For simplicity, we can let openShareModal handle the full re-render or just toggle classes here.
    // Let's re-call openShareModal to refresh the UI cleanly (since it builds HTML string)
    // But that causes flicker. Better to update the hidden checkbox and the buttons manually.

    if (toggle) toggle.checked = isPublic;

    // Update Button Styles manually to avoid full re-render flicker
    const container = document.getElementById('public-share-toggle-container');
    if (container) {
        const buttons = container.querySelectorAll('button');
        if (buttons.length === 2) {
            const btnPrivate = buttons[0];
            const btnPublic = buttons[1];

            if (isPublic) {
                btnPrivate.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all text-gray-500 hover:text-gray-700 dark:text-gray-400';
                btnPublic.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all bg-white dark:bg-gray-700 text-primary shadow-sm';
            } else {
                btnPrivate.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all bg-white dark:bg-gray-700 text-primary shadow-sm';
                btnPublic.className = 'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all text-gray-500 hover:text-gray-700 dark:text-gray-400';
            }
        }
    }

    try {
        await firebaseReady; // Firebase 초기화 대기
        const docRef = doc(db, 'plans', tripId);
        await updateDoc(docRef, { isPublic: isPublic });

        // [Fix] 로컬 상태 동기화 (AutoSave 시 덮어쓰기 방지)
        if (window.currentTripId === tripId && travelData) {
            travelData.isPublic = isPublic;
        }

        // 링크 입력창 업데이트
        if (input) {
            const inviteLink = `${window.location.origin}${window.location.pathname}?invite=${tripId}`;
            // [Modified] 공개 링크는 동적 OG 태그를 지원하는 SSR 엔드포인트(/v/)로 연결
            const publicLink = `${window.location.origin}/v/${tripId}`;
            input.value = isPublic ? publicLink : inviteLink;

            // 흔들림 효과 등으로 링크가 바뀌었음을 알림
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 300);
        }

        if (helpText) {
            helpText.textContent = isPublic ? '로그인 없이 누구나 여행 계획을 볼 수 있습니다.' : '초대된 멤버만 여행을 수정할 수 있습니다.';
        }

    } catch (e) {
        console.error("Error toggling public share:", e);
        // 에러 메시지를 좀 더 구체적으로 표시
        alert(`설정 변경 중 오류가 발생했습니다: ${e.message || e}`);
        if (toggle) toggle.checked = !isPublic; // Revert
        // Revert UI if needed (omitted for brevity, assume success mostly)
        openShareModal(tripId); // Revert UI by full reload
    }
}

// Window assignment for onclick handler
window.togglePublicShare = togglePublicShare;

export function closeShareModal() {
    const el = document.getElementById('share-modal');
    if (el) el.classList.add('hidden');
}

export async function downloadTripAsPDF() {
    try {
        showLoading();

        const pdfContent = generatePDFContent();

        const container = document.createElement('div');
        container.innerHTML = pdfContent;
        container.style.cssText = `
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 210mm;
            min-height: 297mm;
            background: white;
            padding: 20mm;
            z-index: ${Z_INDEX.MODAL_INNER};
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.8);
            font-family: 'MemomentKkukkukk', sans-serif;
        `;
        document.body.appendChild(container);

        await document.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 500));

        const canvas = await html2canvas(container, {
            scale: 3,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/png', 1.0);
        document.body.removeChild(container);

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const pageWidth = 210;
        const pageHeight = 297;
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * pageWidth) / canvas.width;

        if (imgHeight <= pageHeight) {
            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
        } else {
            let heightLeft = imgHeight;
            let position = 0;
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
        }

        const filename = `${travelData.meta.title || '여행계획'}.pdf`;
        pdf.save(filename);
        hideLoading();
    } catch (error) {
        console.error('PDF 다운로드 실패:', error);
        alert('PDF 다운로드에 실패했습니다: ' + (error.message || error));
        hideLoading();
    }
}

function generatePDFContent() {
    if (!travelData || !travelData.days || travelData.days.length === 0) {
        return '<div style="padding: 20px;"><h1>여행 데이터가 없습니다.</h1></div>';
    }
    const title = travelData.meta.title || '여행 계획';
    const subInfo = travelData.meta.subInfo || '';
    const dayCount = travelData.meta.dayCount || '';

    let html = `
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'MemomentKkukkukk', sans-serif; }
            .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #3579f6; }
            .header h1 { font-size: 32px; font-weight: bold; color: #3579f6; margin-bottom: 12px; }
            .header p { font-size: 14px; color: #666; margin: 5px 0; }
            .day-section { margin-bottom: 30px; page-break-inside: avoid; }
            .day-title { font-size: 20px; font-weight: bold; color: #ee8700; margin-bottom: 15px; padding-left: 12px; border-left: 5px solid #ee8700; }
            .timeline-item { margin-bottom: 15px; padding: 12px; background: #f9f9f9; border-radius: 8px; margin-left: 20px; page-break-inside: avoid; }
            .item-header { margin-bottom: 8px; }
            .item-icon { font-size: 20px; margin-right: 8px; }
            .item-time { font-size: 11px; color: #999; margin-right: 8px; }
            .item-title { font-size: 15px; color: #333; font-weight: bold; }
            .item-tag { margin-left: 8px; font-size: 10px; color: #666; background: #e0e0e0; padding: 3px 8px; border-radius: 4px; display: inline-block; }
            .item-location { font-size: 12px; color: #666; margin-left: 28px; margin-top: 5px; }
            .item-memo { font-size: 11px; color: #555; margin-left: 28px; margin-top: 8px; font-style: italic; padding: 8px; background: white; border-left: 3px solid #3579f6; }
            .memories { margin-left: 28px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #ddd; }
            .memory-title { font-size: 11px; font-weight: bold; color: #ee8700; margin-bottom: 8px; }
            .memory-item { font-size: 11px; color: #444; margin-bottom: 6px; padding-left: 10px; border-left: 3px solid #ffc107; }
            .note-section { margin-top: 30px; padding: 15px; background: #fff9e6; border-left: 5px solid #ffc107; border-radius: 8px; }
            .note-title { font-size: 14px; font-weight: bold; color: #ee8700; margin-bottom: 10px; }
            .note-content { font-size: 12px; color: #555; white-space: pre-wrap; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; text-align: center; }
            .footer p { font-size: 10px; color: #999; }
        </style>
        <div class="header">
            <h1>${title}</h1>
            <p>${subInfo}</p>
            <p style="color: #999; font-size: 12px;">${dayCount}</p>
        </div>
    `;

    travelData.days.forEach((day, dayIndex) => {
        const dayDate = new Date(day.date);
        const dayLabel = `Day ${dayIndex + 1} - ${dayDate.getMonth() + 1}월 ${dayDate.getDate()}일`;
        html += `<div class="day-section"><div class="day-title">${dayLabel}</div>`;
        if (day.timeline && day.timeline.length > 0) {
            day.timeline.forEach((item) => {
                const isTransit = item.isTransit || false;
                const icon = isTransit ? '🚗' : '📍';
                const time = item.time || '';
                const itemTitle = item.title || '';
                const location = item.location || '';
                const tag = item.tag || '';
                const memo = item.memo || '';

                html += `<div class="timeline-item">`;
                html += `<div class="item-header">`;
                html += `<span class="item-icon">${icon}</span>`;
                html += `<span class="item-time">${time}</span>`;
                html += `<span class="item-title">${itemTitle}</span>`;
                if (tag) html += `<span class="item-tag">${tag}</span>`;
                html += `</div>`;

                if (location) html += `<div class="item-location">📌 ${location}</div>`;
                if (memo) html += `<div class="item-memo">${memo}</div>`;

                if (item.memories && item.memories.length > 0) {
                    html += `<div class="memories"><div class="memory-title">💭 추억</div>`;
                    item.memories.forEach((memory) => {
                        if (memory.comment) {
                            const comment = memory.comment.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            html += `<div class="memory-item">${comment}</div>`;
                        }
                    });
                    html += `</div>`;
                }

                html += `</div>`;
            });
        }
        html += `</div>`;
    });

    if (travelData.meta.note) {
        const note = travelData.meta.note.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += `
            <div class="note-section">
                <div class="note-title">📝 여행 메모</div>
                <div class="note-content">${note}</div>
            </div>
        `;
    }

    html += `
        <div class="footer">
            <p>Made with ♥ by PLIN</p>
        </div>
    `;

    return html;
}

export function copyShareLink() {
    const copyText = document.getElementById('share-link-input');
    if (!copyText) return;
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value).then(() => {
        alert('링크가 복사되었습니다! 친구에게 공유하세요.');
    });
}

export function enableNoteEdit() {
    const noteEl = document.getElementById('detail-note');
    if (!noteEl) return;
    noteEl.readOnly = false;
    noteEl.focus();
}

export function openTripInfoModal() {
    // [Added] 모달 오픈 시 오토컴플리트 초기화 트리거
    if (typeof setupTripInfoAutocomplete === 'function') {
        setupTripInfoAutocomplete();
    }
    const titleInput = document.getElementById('edit-trip-title');
    const startInput = document.getElementById('edit-trip-start');
    const endInput = document.getElementById('edit-trip-end');

    if (titleInput) titleInput.value = travelData.meta.title;

    if (travelData.days && travelData.days.length > 0) {
        if (startInput) startInput.value = travelData.days[0].date;
        if (endInput) endInput.value = travelData.days[travelData.days.length - 1].date;
    } else {
        const today = new Date().toISOString().split('T')[0];
        if (startInput) startInput.value = today;
        if (endInput) endInput.value = today;
    }

    const modal = document.getElementById('trip-info-modal');
    if (modal) modal.classList.remove('hidden');
}

export function closeTripInfoModal() {
    const modal = document.getElementById('trip-info-modal');
    if (modal) modal.classList.add('hidden');
}

export default { openShareModal, closeShareModal, downloadTripAsPDF, copyShareLink, enableNoteEdit, openTripInfoModal, closeTripInfoModal };
