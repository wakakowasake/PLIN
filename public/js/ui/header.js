import { firebaseReady, db } from '../firebase.js';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { travelData, currentUser, setCurrentTripId, setTravelData } from '../state.js';
import { showLoading, hideLoading } from './modals.js';
import { renderRouteOnMap, setupTripInfoAutocomplete } from '../map.js';
import { normalizeGooglePhotoUrl, sanitizeImageUrl as sanitizeSharedImageUrl } from '../ui-utils.js';
import { fetchBackendJson } from '../services/backend/api-client.js';
import { fetchTripRevisions, restoreTripRevision } from '../services/backend/trip-revisions.js';
import { bindTripInfoTitleInput, syncTripInfoTitleCounter } from '../features/trip-info/trip-info-form.js';
import { readMemoryComment } from '../features/memories/memory-helpers.js';

const TRIP_REVISION_HISTORY_ENABLED = false;

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJsString(value = '') {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
}

function sanitizeImageUrl(value = '', fallback = '/images/icon-192.png') {
    if (!value) return fallback;
    return sanitizeSharedImageUrl(normalizeGooglePhotoUrl(value, 600), fallback);
}

const tripRevisionModalState = {
    tripId: '',
    items: [],
    nextCursor: null,
    hasMore: false,
    loading: false,
    error: '',
    busyRevisionId: ''
};

function resetTripRevisionModalState() {
    tripRevisionModalState.tripId = '';
    tripRevisionModalState.items = [];
    tripRevisionModalState.nextCursor = null;
    tripRevisionModalState.hasMore = false;
    tripRevisionModalState.loading = false;
    tripRevisionModalState.error = '';
    tripRevisionModalState.busyRevisionId = '';
}

function formatTripRevisionTimestamp(value = '') {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
        return '시간 정보 없음';
    }

    return new Intl.DateTimeFormat('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(parsed);
}

function formatTripRevisionRestorePoint(value = '') {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
        return '선택한 시점';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hour = String(parsed.getHours()).padStart(2, '0');
    const minute = String(parsed.getMinutes()).padStart(2, '0');

    return `${year}.${month}.${day} ${hour}:${minute}`;
}

function buildTripRevisionOperationLabel(operation = '') {
    if (operation === 'restore') {
        return '복구';
    }

    if (operation === 'meta_update') {
        return '정보 수정';
    }

    return '일정 수정';
}

function buildTripRevisionOperationClass(operation = '') {
    if (operation === 'restore') {
        return 'bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary';
    }

    if (operation === 'meta_update') {
        return 'bg-[#FDF2F2] text-[#F21E16] dark:bg-[#322323] dark:text-[#F73526]';
    }

    return 'bg-[#F3F4F5] text-[#868B94] dark:bg-[#2C2E34] dark:text-[#B0B3BA]';
}

function buildTripRevisionSourceLabel(sourceClient = '') {
    if (sourceClient === 'mobile') {
        return '모바일';
    }

    if (sourceClient === 'web') {
        return '웹';
    }

    if (sourceClient === 'server') {
        return '서버';
    }

    return '기타';
}

function applyRestoredTripState(tripId, trip) {
    if (!trip || typeof trip !== 'object') {
        return;
    }

    setTravelData(trip);
    setCurrentTripId(tripId);
    window.currentTripId = tripId;
    window.renderItinerary?.();
    Promise.resolve(renderRouteOnMap()).catch((error) => {
        console.warn('Failed to refresh trip map after restore:', error);
    });
}

function renderTripRevisionModalContent() {
    const contentEl = document.getElementById('trip-revision-content');
    if (!contentEl) {
        return;
    }

    if (tripRevisionModalState.loading && tripRevisionModalState.items.length === 0) {
        contentEl.innerHTML = `
            <div class="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-5 text-sm text-gray-500 dark:text-gray-300">
                수정 기록을 불러오는 중...
            </div>
        `;
        return;
    }

    if (tripRevisionModalState.error && tripRevisionModalState.items.length === 0) {
        contentEl.innerHTML = `
            <div class="rounded-2xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-5 text-sm text-red-600 dark:text-red-300">
                ${escapeHtml(tripRevisionModalState.error)}
            </div>
        `;
        return;
    }

    if (!tripRevisionModalState.items.length) {
        contentEl.innerHTML = `
            <div class="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 p-8 text-center">
                <p class="text-base font-bold text-text-main dark:text-white">아직 저장된 수정 기록이 없어요.</p>
                <p class="mt-2 text-sm text-gray-500 dark:text-gray-300">여행을 수정하고 저장하면 여기에서 기록을 볼 수 있어요.</p>
            </div>
        `;
        return;
    }

    const cardsHtml = tripRevisionModalState.items.map((entry) => {
        const actorName = escapeHtml(entry?.actor?.displayName || entry?.actor?.email || entry?.actor?.uid || '멤버');
        const actorMeta = escapeHtml(formatTripRevisionTimestamp(entry?.createdAt || ''));
        const actorPhoto = sanitizeImageUrl(entry?.actor?.photoURL || '', '/images/icon-192.png');
        const summaryText = escapeHtml(entry?.summary?.text || '여행 내용 수정');
        const operationLabel = escapeHtml(buildTripRevisionOperationLabel(entry?.operation || ''));
        const operationClass = buildTripRevisionOperationClass(entry?.operation || '');
        const sourceLabel = escapeHtml(buildTripRevisionSourceLabel(entry?.sourceClient || ''));
        const revisionId = escapeJsString(entry?.id || '');
        const tripId = escapeJsString(tripRevisionModalState.tripId || '');
        const isBusy = tripRevisionModalState.busyRevisionId === entry?.id;
        const restoreButtonDisabled = isBusy ? 'opacity-60 cursor-not-allowed' : '';

        return `
            <div class="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900/50 p-4 shadow-sm">
                <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                        <img src="${escapeHtml(actorPhoto)}" alt="" class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700" onerror="this.src='/images/icon-192.png'">
                        <div class="min-w-0">
                            <p class="text-sm font-bold text-text-main dark:text-white truncate">${actorName}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-300">${actorMeta}</p>
                        </div>
                    </div>
                    <span class="shrink-0 rounded-full px-3 py-1 text-xs font-bold ${operationClass}">${operationLabel}</span>
                </div>
                <p class="mt-4 text-sm leading-6 text-text-main dark:text-white">${summaryText}</p>
                <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
                    <span>버전 ${escapeHtml(String(entry?.contentVersionBefore ?? 0))} → ${escapeHtml(String(entry?.contentVersionAfter ?? 0))}</span>
                    <span>•</span>
                    <span>${sourceLabel}</span>
                </div>
                <div class="mt-4 flex justify-end">
                    <button
                        type="button"
                        onclick="window.restoreTripRevisionAction('${tripId}', '${revisionId}')"
                        ${isBusy ? 'disabled' : ''}
                        class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-all hover:bg-orange-600 ${restoreButtonDisabled}">
                        <span class="material-symbols-outlined text-[18px]">${isBusy ? 'sync' : 'restore'}</span>
                        ${isBusy ? '복구 중...' : '이 시점으로 복구'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    const loadMoreHtml = tripRevisionModalState.hasMore
        ? `
            <button
                type="button"
                onclick="window.loadMoreTripRevisions()"
                ${tripRevisionModalState.loading ? 'disabled' : ''}
                class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 text-sm font-bold text-text-main dark:text-white transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
                ${tripRevisionModalState.loading ? '불러오는 중...' : '이전 기록 더 보기'}
            </button>
        `
        : '';

    const errorHtml = tripRevisionModalState.error
        ? `
            <div class="rounded-2xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-600 dark:text-red-300">
                ${escapeHtml(tripRevisionModalState.error)}
            </div>
        `
        : '';

    contentEl.innerHTML = `
        <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
            <button
                type="button"
                onclick="window.refreshTripRevisionHistory()"
                ${tripRevisionModalState.loading ? 'disabled' : ''}
                class="inline-flex items-center gap-2 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-bold text-text-main dark:text-white transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                <span class="material-symbols-outlined text-[18px]">refresh</span>
                새로고침
            </button>
            <span class="rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-300">
                최근 20개 / 30일 보관
            </span>
        </div>
        ${errorHtml}
        <div class="space-y-4">
            ${cardsHtml}
        </div>
        ${loadMoreHtml}
    `;
}

function readShareTokenFromUrl(value = '') {
    const safeValue = String(value || '').trim();
    if (!safeValue) {
        return '';
    }

    try {
        const url = new URL(safeValue, window.location.origin);
        const inviteToken = url.searchParams.get('invite');
        if (inviteToken) {
            return inviteToken.trim();
        }

        const segments = url.pathname.split('/').filter(Boolean);
        if (segments[0] === 'p' && segments[1]) {
            return segments[1].trim();
        }
    } catch {
        return '';
    }

    return '';
}

function normalizeShareResponse(value = {}) {
    const normalizeShareRoleValue = (roleValue) => {
        const role = String(roleValue || '').trim();
        if (role === 'viewer' || role === 'member') {
            return role;
        }

        return 'editor';
    };
    const directMode = String(value?.shareLink?.mode || '').trim() === 'link'
        ? 'link'
        : 'private';
    const directRole = normalizeShareRoleValue(value?.shareLink?.role);
    const directUrl = String(value?.shareLink?.url || '').trim();
    const collaboratorUrl = String(value?.collaboratorLink?.url || '').trim();
    const generalAccessUrl = String(value?.generalAccess?.url || '').trim();
    const collaboratorRole = normalizeShareRoleValue(value?.collaboratorLink?.defaultRole);
    const generalAccessMode = String(value?.generalAccess?.mode || '').trim() === 'link_view'
        ? 'link_view'
        : 'restricted';
    const members = Array.isArray(value?.members)
        ? value.members.map((member) => ({
            uid: String(member?.uid || '').trim(),
            displayName: String(member?.displayName || '').trim() || '멤버',
            email: String(member?.email || '').trim(),
            photoURL: sanitizeImageUrl(member?.photoURL || '', '/images/icon-192.png'),
            role: ['owner', 'editor', 'member', 'viewer'].includes(String(member?.role || '').trim())
                ? String(member.role).trim()
                : 'member',
            isSelf: member?.isSelf === true
        }))
        : [];

    let mode = directMode;
    let role = directRole;
    let url = directUrl;

    if (!directUrl && directMode !== 'link') {
        if (generalAccessMode === 'link_view' && generalAccessUrl) {
            mode = 'link';
            role = 'viewer';
            url = generalAccessUrl;
        } else if (collaboratorUrl) {
            mode = 'link';
            role = collaboratorRole;
            url = collaboratorUrl;
        }
    }

    const active = mode === 'link' && Boolean(url || value?.shareLink?.active === true);
    const permissionRole = ['owner', 'editor', 'member', 'viewer'].includes(String(value?.permissions?.role || '').trim())
        ? String(value.permissions.role).trim()
        : '';

    return {
        permissions: {
            role: permissionRole,
            canManageShare: value?.permissions?.canManageShare === true,
            canManageMembers: value?.permissions?.canManageMembers === true,
            canSendAnnouncement: value?.permissions?.canSendAnnouncement === true
        },
        members,
        shareLink: {
            mode: active ? mode : 'private',
            role,
            url: active ? url : '',
            active
        }
    };
}

function applyShareResponseToCurrentTrip(tripId, shareResponse) {
    if (window.currentTripId !== tripId || !travelData) {
        return;
    }

    const normalizedShare = normalizeShareResponse(shareResponse);
    const shareTokenId = readShareTokenFromUrl(normalizedShare.shareLink.url);
    const isLinkMode = normalizedShare.shareLink.mode === 'link';
    const isPublic = isLinkMode && normalizedShare.shareLink.role === 'viewer';
    const isInvite = isLinkMode && normalizedShare.shareLink.role !== 'viewer';

    travelData.isPublic = isPublic;
    travelData.share = {
        ...(travelData.share || {}),
        mode: isLinkMode ? 'link' : 'private',
        role: isLinkMode ? normalizedShare.shareLink.role : 'viewer',
        tokenId: isLinkMode ? shareTokenId : '',
        collaboratorLink: {
            tokenId: isInvite ? shareTokenId : '',
            defaultRole: normalizedShare.shareLink.role,
            active: isInvite
        },
        generalAccess: {
            mode: isPublic ? 'link_view' : 'restricted',
            tokenId: isPublic ? shareTokenId : ''
        },
        publicReadable: isPublic,
        inviteEnabled: isInvite,
        shareId: isInvite ? shareTokenId : '',
        publicTokenId: isPublic ? shareTokenId : '',
        inviteTokenId: isInvite ? shareTokenId : ''
    };
}

function buildRoleLabel(role = '') {
    if (role === 'owner') {
        return 'Owner';
    }

    if (role === 'editor') {
        return 'Editor';
    }

    if (role === 'member') {
        return 'Member';
    }

    return 'Viewer';
}

function renderMemberRow(member, tripId, canManageMembers = false) {
    const safeTripId = escapeJsString(tripId || '');
    const safeUid = escapeJsString(member?.uid || '');
    const safeName = escapeHtml(member?.displayName || '멤버');
    const safeEmail = escapeHtml(member?.email || '이메일 비공개');
    const safeRole = buildRoleLabel(member?.role || '');
    const safePhoto = escapeHtml(sanitizeImageUrl(member?.photoURL || '', '/images/icon-192.png'));
    const isOwner = member?.role === 'owner';
    const canEdit = member?.role === 'editor';
    const isMember = member?.role === 'member';
    const isSelf = member?.isSelf === true;

    const roleControls = isOwner || !canManageMembers
        ? ''
        : `
            <div class="mt-3 flex flex-wrap gap-2">
                <button type="button"
                    onclick="window.shareSetMemberRole('${safeTripId}', '${safeUid}', 'editor')"
                    class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${canEdit ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}">
                    편집 가능
                </button>
                <button type="button"
                    onclick="window.shareSetMemberRole('${safeTripId}', '${safeUid}', 'member')"
                    class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${isMember ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}">
                    멤버
                </button>
                <button type="button"
                    onclick="window.shareRemoveMember('${safeTripId}', '${safeUid}', '${escapeJsString(member?.displayName || member?.email || '이 멤버')}')"
                    class="px-3 py-1.5 rounded-full text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 dark:text-red-300 transition-colors">
                    제거
                </button>
            </div>
        `;

    return `
        <div class="bg-white dark:bg-gray-700 p-3 rounded-xl border border-gray-100 dark:border-gray-600">
            <div class="flex justify-between items-center gap-3">
                <div class="flex items-center gap-3 min-w-0">
                <img src="${safePhoto}" class="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600" onerror="this.src='/images/icon-192.png'">
                    <div class="min-w-0">
                    <p class="text-sm font-bold text-gray-900 dark:text-white truncate">${safeName}${isSelf ? ' (나)' : ''}</p>
                    <p class="text-xs text-gray-500">${safeEmail}</p>
                </div>
            </div>
                <span class="shrink-0 text-xs font-semibold text-gray-500 bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded-full text-center min-w-[64px]">${safeRole}</span>
            </div>
            ${roleControls}
        </div>
    `;
}

function renderShareSettingsContent(tripId, shareResponse) {
    const contentEl = document.getElementById('share-settings-content');
    if (!contentEl) return;

    const normalizedShare = normalizeShareResponse(shareResponse);
    const safeTripId = escapeJsString(tripId || '');
    const safeShareUrl = escapeJsString(normalizedShare.shareLink.url || '');
    const isLinkMode = normalizedShare.shareLink.mode === 'link';
    const shareRole = normalizedShare.shareLink.role;
    const canManageMembers = normalizedShare.permissions?.canManageMembers === true;
    const shareRoleHint = shareRole === 'viewer'
        ? '로그인 없이 볼 수 있는 공개 보기 링크예요.'
        : shareRole === 'member'
            ? '로그인 후 읽기 전용 멤버로 여행에 참여해요.'
            : '로그인 후 편집 가능한 멤버로 여행에 참여해요.';

    contentEl.innerHTML = `
        <div class="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Link Sharing</p>
            <h4 class="text-lg font-bold text-text-main dark:text-white">공유 링크</h4>
            <p class="text-sm text-gray-500 dark:text-gray-300 mt-1">비공개로 두거나, 편집 멤버 초대와 읽기 멤버 초대, 공개 보기 링크 중에서 정할 수 있어요.</p>

            <div class="mt-4 flex p-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                <button type="button"
                    onclick="window.shareSetMode('${safeTripId}', 'private')"
                    class="flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${!isLinkMode ? 'bg-primary text-white shadow-sm' : 'text-gray-500 dark:text-gray-300'}">
                    비공개
                </button>
                <button type="button"
                    onclick="window.shareSetMode('${safeTripId}', 'link')"
                    class="flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${isLinkMode ? 'bg-primary text-white shadow-sm' : 'text-gray-500 dark:text-gray-300'}">
                    링크 공유
                </button>
            </div>

            ${isLinkMode ? `
                <div class="mt-3 flex p-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                    <button type="button"
                        onclick="window.shareSetRole('${safeTripId}', 'editor')"
                        class="flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${shareRole === 'editor' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 dark:text-gray-300'}">
                        편집 멤버
                    </button>
                    <button type="button"
                        onclick="window.shareSetRole('${safeTripId}', 'member')"
                        class="flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${shareRole === 'member' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 dark:text-gray-300'}">
                        읽기 멤버
                    </button>
                    <button type="button"
                        onclick="window.shareSetRole('${safeTripId}', 'viewer')"
                        class="flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all ${shareRole === 'viewer' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 dark:text-gray-300'}">
                        뷰어 링크
                    </button>
                </div>

                <div class="mt-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 px-3 py-3 text-sm text-gray-500 dark:text-gray-300 bg-white/80 dark:bg-gray-900/40">
                    ${shareRoleHint}
                </div>

                <div class="mt-3">
                    <button type="button" onclick="window.shareTripLink('${safeShareUrl}')"
                        class="w-full bg-primary text-white text-sm font-bold px-4 py-3 rounded-xl transition-colors hover:opacity-90 flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-base">share</span>
                        공유
                    </button>
                </div>
            ` : `
                <div class="mt-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 px-3 py-3 text-sm text-gray-500 dark:text-gray-300 bg-white/80 dark:bg-gray-900/40">
                    이 여행은 지금 비공개예요.
                </div>
            `}
        </div>

        <div class="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Collaborators</p>
            <h4 class="text-lg font-bold text-text-main dark:text-white">멤버</h4>
            <p class="text-sm text-gray-500 dark:text-gray-300 mt-1">${canManageMembers ? '소유자는 멤버 권한을 바꾸거나 접근 권한을 제거할 수 있어요.' : '참여 중인 멤버를 확인할 수 있어요.'}</p>
            <div class="mt-4 flex flex-col gap-2">
                ${normalizedShare.members.length > 0
                    ? normalizedShare.members.map((member) => renderMemberRow(member, tripId, canManageMembers)).join('')
                    : '<div class="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 px-3 py-3 text-sm text-gray-500 dark:text-gray-300 bg-white/80 dark:bg-gray-900/40">협업 멤버를 불러오는 중이에요.</div>'}
            </div>
        </div>
    `;
}

async function refreshShareModalState(tripId) {
    const result = await fetchBackendJson(`/plans/${encodeURIComponent(tripId)}/share`);
    const normalizedShare = normalizeShareResponse(result);

    applyShareResponseToCurrentTrip(tripId, normalizedShare);
    renderShareSettingsContent(tripId, normalizedShare);

    return normalizedShare;
}

async function mutateShareState(tripId, request) {
    showLoading();

    try {
        const result = await request();
        const normalizedShare = normalizeShareResponse(result);
        applyShareResponseToCurrentTrip(tripId, normalizedShare);
        renderShareSettingsContent(tripId, normalizedShare);
        return normalizedShare;
    } catch (error) {
        console.error('Share action error:', error);
        alert(`공유 설정을 변경하지 못했어요: ${error.message || error}`);
        return null;
    } finally {
        hideLoading();
    }
}

async function refreshTripRevisionModalState(tripId, options = {}) {
    const safeTripId = String(tripId || '').trim();
    if (!safeTripId) {
        return null;
    }

    if (tripRevisionModalState.loading) {
        return null;
    }

    const append = options.append === true;
    const cursor = append ? tripRevisionModalState.nextCursor : null;

    tripRevisionModalState.tripId = safeTripId;
    tripRevisionModalState.loading = true;
    if (!append) {
        tripRevisionModalState.error = '';
    }
    renderTripRevisionModalContent();

    try {
        const result = await fetchTripRevisions(safeTripId, {
            cursor,
            limit: 20
        });

        tripRevisionModalState.items = append
            ? [...tripRevisionModalState.items, ...result.items]
            : result.items;
        tripRevisionModalState.nextCursor = result.nextCursor || null;
        tripRevisionModalState.hasMore = result.hasMore === true;
        tripRevisionModalState.error = '';
        return result;
    } catch (error) {
        console.error('Trip revision load error:', error);
        tripRevisionModalState.error = error?.message || '수정 기록을 불러오지 못했어요.';
        return null;
    } finally {
        tripRevisionModalState.loading = false;
        renderTripRevisionModalContent();
    }
}

export async function openTripRevisionHistoryModal(tripId = null) {
    if (!TRIP_REVISION_HISTORY_ENABLED) {
        alert('수정 기록 기능은 아직 준비 중이에요.');
        return;
    }

    const targetTripId = String(tripId || window.currentTripId || '').trim();
    const detailView = document.getElementById('detail-view');
    const isInDetailView = detailView && !detailView.classList.contains('hidden');
    const canEditContent = window.currentTripPermissions?.canEditContent === true;

    if (!targetTripId || !isInDetailView) {
        alert('여행 상세 화면에서 수정 기록을 볼 수 있어요.');
        return;
    }

    if (!canEditContent) {
        alert('수정 기록은 편집 권한이 있는 멤버만 볼 수 있어요.');
        return;
    }

    document.querySelectorAll('[id^="trip-menu-"]').forEach((el) => el.classList.add('hidden'));

    const modalEl = document.getElementById('trip-revision-modal');
    if (!modalEl) {
        return;
    }

    resetTripRevisionModalState();
    tripRevisionModalState.tripId = targetTripId;
    modalEl.classList.remove('hidden');
    if (window.pushModalState) {
        window.pushModalState();
    }

    renderTripRevisionModalContent();
    await refreshTripRevisionModalState(targetTripId);
}

export function closeTripRevisionModal() {
    if (tripRevisionModalState.busyRevisionId) {
        return;
    }

    const modalEl = document.getElementById('trip-revision-modal');
    if (modalEl) {
        modalEl.classList.add('hidden');
    }
}

export async function loadMoreTripRevisions() {
    if (!TRIP_REVISION_HISTORY_ENABLED) {
        return;
    }

    if (!tripRevisionModalState.tripId || !tripRevisionModalState.hasMore || !tripRevisionModalState.nextCursor) {
        return;
    }

    await refreshTripRevisionModalState(tripRevisionModalState.tripId, {
        append: true
    });
}

export async function refreshTripRevisionHistory() {
    if (!TRIP_REVISION_HISTORY_ENABLED) {
        return;
    }

    if (!tripRevisionModalState.tripId) {
        return;
    }

    await refreshTripRevisionModalState(tripRevisionModalState.tripId);
}

export async function restoreTripRevisionAction(tripId, revisionId) {
    if (!TRIP_REVISION_HISTORY_ENABLED) {
        alert('수정 기록 복구 기능은 아직 준비 중이에요.');
        return;
    }

    const safeTripId = String(tripId || '').trim();
    const safeRevisionId = String(revisionId || '').trim();

    if (!safeTripId || !safeRevisionId || tripRevisionModalState.busyRevisionId) {
        return;
    }

    const selectedRevision = tripRevisionModalState.items.find((entry) => entry?.id === safeRevisionId) || null;
    const restorePoint = formatTripRevisionRestorePoint(selectedRevision?.createdAt || '');
    const restoreSummaryText = selectedRevision?.summary?.text
        ? `기준 기록: ${selectedRevision.summary.text}\n`
        : '';
    const confirmed = confirm(
        `${restorePoint} 상태로 되돌립니다.\n${restoreSummaryText}제목/날짜/일정/체크리스트가 모두 이 시점으로 복구됩니다.\n이 작업도 새 수정 기록으로 남아요. 계속할까요?`
    );
    if (!confirmed) {
        return;
    }

    tripRevisionModalState.busyRevisionId = safeRevisionId;
    tripRevisionModalState.error = '';
    renderTripRevisionModalContent();
    showLoading();

    try {
        const expectedContentVersion = Number.isFinite(Number(travelData?.contentVersion))
            ? Number(travelData.contentVersion)
            : null;
        const restoredTrip = await restoreTripRevision(safeTripId, safeRevisionId, expectedContentVersion);
        if (!restoredTrip) {
            throw new Error('복구된 여행 내용을 다시 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        }

        applyRestoredTripState(safeTripId, restoredTrip);
        await refreshTripRevisionModalState(safeTripId);
        alert('선택한 시점으로 여행 내용을 되돌렸어요.');
    } catch (error) {
        console.error('Trip revision restore error:', error);
        tripRevisionModalState.error = error?.message || '여행 복구에 실패했어요.';
        renderTripRevisionModalContent();
        alert(`복구에 실패했어요: ${error?.message || error}`);
    } finally {
        tripRevisionModalState.busyRevisionId = '';
        hideLoading();
        renderTripRevisionModalContent();
    }
}

export async function openShareModal(tripId = null) {
    // 1. 만약 명시적인 tripId가 인자로 들어왔다면 즉시 공유 모달 오픈
    if (tripId) {
        return handleOpenDirectShareModal(tripId);
    }

    // 2. 현재 여행 상세 페이지를 보고 있는지 확인
    const detailView = document.getElementById('detail-view');
    const isInDetailView = detailView && !detailView.classList.contains('hidden');

    if (isInDetailView && window.currentTripId) {
        // 상세 페이지면 현재 보고 있는 여행으로 즉시 오픈
        return handleOpenDirectShareModal(window.currentTripId);
    }

    // 3. 그 외의 경우 (메인, 프로필 등) 여행 선택 모달 오픈
    return openTripSelectionModal();
}

/**
 * 특정 여행 ID로 즉시 공유 모달을 여는 내부 처리 함수
 */
async function handleOpenDirectShareModal(tripId) {
    document.querySelectorAll('[id^="trip-menu-"]').forEach(el => el.classList.add('hidden'));

    const modalEl = document.getElementById('share-modal');
    if (modalEl) {
        modalEl.classList.remove('hidden');
        if (window.pushModalState) window.pushModalState();
    }

    let targetTripId = tripId;
    let tripTitle = '여행 계획';

    if (targetTripId) {
        try {
            const docRef = doc(db, 'plans', targetTripId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                const currentRole = currentUser?.uid
                    ? (data.createdBy === currentUser.uid || data.userId === currentUser.uid
                        ? 'owner'
                        : (data.members?.[currentUser.uid] || ''))
                    : '';
                if (currentRole !== 'owner' && currentRole !== 'editor') {
                    closeShareModal();
                    alert('공유 설정은 여행 소유자나 편집자만 변경할 수 있습니다.');
                    return;
                }
                tripTitle = (data.meta && data.meta.title) || data.title || '제목 없는 여행';
                const hydratedData = {
                    ...data,
                    isPublic: false
                };

                import('../state.js').then(state => {
                    state.setTravelData(hydratedData);
                    state.setCurrentTripId(targetTripId);
                    window.currentTripId = targetTripId;
                });
            }
        } catch (e) {
            console.error('Error fetching trip data for share:', e);
            alert(`공유 설정을 준비하지 못했어요: ${e.message || e}`);
            closeShareModal();
            return;
        }
    }

    const modalHeaderTitle = document.querySelector('#share-modal h3');
    if (modalHeaderTitle) {
        const safeTripTitle = escapeHtml(tripTitle || '제목 없는 여행');
        modalHeaderTitle.innerHTML = `
            <div class="flex flex-col">
                <span class="text-xs text-primary font-bold uppercase tracking-wider mb-0.5">여행 계획 공유하기</span>
                <span class="text-base truncate">${safeTripTitle}</span>
            </div>
        `;
    }

    const contentEl = document.getElementById('share-settings-content');
    if (contentEl) {
        contentEl.innerHTML = `
            <div class="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-sm text-gray-500 dark:text-gray-300">
                공유 설정을 불러오는 중...
            </div>
        `;
    }

    await refreshShareModalState(targetTripId);
}

export async function shareSetMode(tripId, mode) {
    return mutateShareState(tripId, () => (
        fetchBackendJson(`/plans/${encodeURIComponent(tripId)}/share`, {
            method: 'PATCH',
            body: {
                shareLink: {
                    mode: mode === 'link' ? 'link' : 'private'
                }
            }
        })
    ));
}

export async function shareSetRole(tripId, role) {
    return mutateShareState(tripId, () => (
        fetchBackendJson(`/plans/${encodeURIComponent(tripId)}/share`, {
            method: 'PATCH',
            body: {
                shareLink: {
                    mode: 'link',
                    role: role === 'viewer'
                        ? 'viewer'
                        : role === 'member'
                            ? 'member'
                            : 'editor'
                }
            }
        })
    ));
}

export async function shareRegenerateLink(tripId) {
    return mutateShareState(tripId, () => (
        fetchBackendJson(`/plans/${encodeURIComponent(tripId)}/share`, {
            method: 'PATCH',
            body: {
                shareLink: {
                    regenerate: true
                }
            }
        })
    ));
}

export async function shareSetCollaboratorRole(tripId, role) {
    return shareSetRole(tripId, role);
}

export async function shareRegenerateCollaboratorLink(tripId) {
    return shareRegenerateLink(tripId);
}

export async function shareSetGeneralAccess(tripId, mode) {
    return shareSetMode(tripId, mode === 'link_view' ? 'link' : 'private');
}

export async function shareSetMemberRole(tripId, memberUid, role) {
    return mutateShareState(tripId, () => (
        fetchBackendJson(`/plans/${encodeURIComponent(tripId)}/members/${encodeURIComponent(memberUid)}`, {
            method: 'PATCH',
            body: {
                role: role === 'editor' ? 'editor' : 'member'
            }
        })
    ));
}

export async function shareRemoveMember(tripId, memberUid, memberLabel = '이 멤버') {
    const confirmed = confirm(`${memberLabel} 님의 접근 권한을 제거할까요?`);
    if (!confirmed) {
        return null;
    }

    return mutateShareState(tripId, () => (
        fetchBackendJson(`/plans/${encodeURIComponent(tripId)}/members/${encodeURIComponent(memberUid)}`, {
            method: 'DELETE'
        })
    ));
}

window.shareSetMode = shareSetMode;
window.shareSetRole = shareSetRole;
window.shareRegenerateLink = shareRegenerateLink;
window.shareSetCollaboratorRole = shareSetCollaboratorRole;
window.shareRegenerateCollaboratorLink = shareRegenerateCollaboratorLink;
window.shareSetGeneralAccess = shareSetGeneralAccess;
window.shareSetMemberRole = shareSetMemberRole;
window.shareRemoveMember = shareRemoveMember;
window.restoreTripRevisionAction = restoreTripRevisionAction;
window.refreshTripRevisionHistory = refreshTripRevisionHistory;
window.loadMoreTripRevisions = loadMoreTripRevisions;
window.openTripRevisionHistoryModal = openTripRevisionHistoryModal;
window.closeTripRevisionModal = closeTripRevisionModal;


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
        container.className = 'modal-z-confirm';
        container.style.position = 'fixed';
        container.style.left = '50%';
        container.style.top = '50%';
        container.style.transform = 'translate(-50%, -50%)';
        container.style.width = '210mm';
        container.style.minHeight = '297mm';
        container.style.background = 'white';
        container.style.padding = '20mm';
        container.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.8)';
        container.style.fontFamily = "'MemomentKkukkukk', sans-serif";
        document.body.appendChild(container);

        await document.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 500));

        const html2canvasFn = window.html2canvas;
        if (typeof html2canvasFn !== 'function') {
            throw new Error('PDF 변환 라이브러리(html2canvas)를 찾을 수 없습니다.');
        }

        const canvas = await html2canvasFn(container, {
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
                    const visibleComments = item.memories
                        .map((memory) => readMemoryComment(memory))
                        .filter(Boolean);

                    if (visibleComments.length > 0) {
                        html += `<div class="memories"><div class="memory-title">💭 추억</div>`;
                        visibleComments.forEach((commentText) => {
                            const comment = commentText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            html += `<div class="memory-item">${comment}</div>`;
                        });
                        html += `</div>`;
                    }
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

function copyShareValue(value = '') {
    const safeValue = String(value || '').trim();
    if (!safeValue) {
        alert('공유할 링크가 아직 준비되지 않았어요.');
        return Promise.resolve(false);
    }

    const tempInput = document.createElement('input');
    tempInput.type = 'text';
    tempInput.value = safeValue;
    tempInput.setAttribute('readonly', '');
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.select();
    tempInput.setSelectionRange(0, safeValue.length);

    const cleanup = () => {
        tempInput.remove();
    };

    const handleSuccess = () => {
        cleanup();
        alert('링크를 복사했어요.');
        return true;
    };

    const handleFailure = () => {
        try {
            const copied = document.execCommand('copy');
            if (copied) {
                return handleSuccess();
            }
        } catch (fallbackError) {
            console.warn('Fallback share copy failed', fallbackError);
        }

        cleanup();
        alert('링크를 복사하지 못했어요. 다시 시도해 주세요.');
        return false;
    };

    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(safeValue)
            .then(() => handleSuccess())
            .catch(() => handleFailure());
    }

    return Promise.resolve(handleFailure());
}

export function copyShareLink(inputId = 'share-link-input') {
    const copyText = document.getElementById(inputId);
    if (!(copyText instanceof HTMLInputElement)) {
        return;
    }

    const value = String(copyText.value || '').trim();
    if (!value) {
        alert('복사할 링크가 아직 준비되지 않았어요.');
        return;
    }

    void copyShareValue(value);
}

export async function shareTripLink(url = '') {
    const shareUrl = String(url || '').trim();
    if (!shareUrl) {
        alert('공유할 링크가 아직 준비되지 않았어요.');
        return;
    }

    if (navigator.share) {
        try {
            await navigator.share({ url: shareUrl });
            return;
        } catch (error) {
            if (error?.name === 'AbortError') {
                return;
            }
        }
    }

    await copyShareValue(shareUrl);
}

window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.copyShareLink = copyShareLink;
window.shareTripLink = shareTripLink;

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

    if (titleInput) titleInput.value = travelData.meta.title || "";
    bindTripInfoTitleInput();
    syncTripInfoTitleCounter();

    // [Added] subInfo에서 위치 명칭 추출하여 장소 필드에 채움
    const locationInput = document.getElementById('edit-trip-location');
    if (locationInput) {
        const subInfo = travelData.meta.subInfo || "";
        // "위치 • 날짜" 형식에서 위치 부분만 추출
        const parts = subInfo.split('•').map(p => p.trim());
        locationInput.value = parts.length > 1 ? parts[0] : (subInfo.includes("-") ? "" : subInfo);
    }

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
/**
 * 공유할 여행을 선택하는 모달을 오픈
 */
export async function openTripSelectionModal() {
    const modal = document.getElementById('trip-selection-modal');
    const listEl = document.getElementById('trip-selection-list');

    if (modal) {
        modal.classList.remove('hidden');
        if (window.pushModalState) window.pushModalState();
    }

    if (!listEl) return;

    // 로딩 상태 표시
    listEl.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-gray-400">
            <span class="material-symbols-outlined text-5xl mb-4 spinning">refresh</span>
            <p class="font-bold">내 여행 목록을 불러오는 중...</p>
        </div>
    `;

    if (!currentUser) {
        listEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-gray-400">
                <span class="material-symbols-outlined text-5xl mb-4">login</span>
                <p class="font-bold">로그인이 필요한 기능입니다.</p>
                <button onclick="window.closeTripSelectionModal(); window.handleLogin();" 
                    class="mt-4 px-6 py-2 bg-primary text-white rounded-xl font-bold">로그인하기</button>
            </div>
        `;
        return;
    }

    try {
        // [Modified] Firestore에서 사용자가 포함된 모든 여행(참여 중 포함) 로드
        // members 필드 내에 현재 사용자의 UID가 존재하는 문서들 쿼리
        const q = query(
            collection(db, 'plans'),
            where(`members.${currentUser.uid}`, 'in', ['owner', 'editor', 'viewer']),
            limit(50)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            listEl.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 text-gray-400 text-center">
                    <span class="material-symbols-outlined text-6xl mb-4 opacity-20">event_busy</span>
                    <p class="font-bold text-lg">아직 생성된 여행이 없습니다.</p>
                    <p class="text-sm mt-1">새로운 여행을 만들어 공유해보세요!</p>
                </div>
            `;
            return;
        }

        let html = '';
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const id = doc.id;

            // [Fix] Access nested fields correctly according to travelData structure
            const title = (data.meta && data.meta.title) || data.title || '제목 없는 여행';

            // Get date range from days if meta.subInfo or top-level dates is missing
            let dateStr = data.dates || (data.meta && data.meta.subInfo) || '날짜 미정';
            if (dateStr === '날짜 미정' && data.days && data.days.length > 0) {
                const startDate = data.days[0].date;
                const endDate = data.days[data.days.length - 1].date;
                if (startDate && endDate) {
                    dateStr = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
                } else if (startDate) {
                    dateStr = startDate;
                }
            }

            const coverImage = (data.meta && (data.meta.mapImage || data.meta.coverImage)) || data.mapImage || data.coverImage || '/images/default-cover.jpg';
            const safeTripId = escapeJsString(id);
            const safeCoverImage = escapeHtml(sanitizeImageUrl(coverImage, '/images/default-cover.jpg'));
            const safeTitle = escapeHtml(title);
            const safeDateStr = escapeHtml(dateStr);

            html += `
                <div onclick="selectTripForShare('${safeTripId}')" 
                    class="trip-selection-option group flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800/50 hover:bg-orange-50 dark:hover:bg-primary/20 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-primary/30">
                    <div class="trip-selection-thumb size-14 rounded-xl overflow-hidden flex-shrink-0 shadow-sm bg-gray-200 dark:bg-gray-700">
                        <img src="${safeCoverImage}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onerror="this.src='/images/default-cover.jpg'">
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="trip-selection-title font-bold text-text-main dark:text-white truncate group-hover:text-primary transition-colors">${safeTitle}</h4>
                        <p class="trip-selection-meta text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <span class="material-symbols-outlined text-[14px]">calendar_today</span>
                            ${safeDateStr}
                        </p>
                    </div>
                    <span class="trip-selection-chevron material-symbols-outlined text-gray-300 group-hover:text-primary transition-colors">chevron_right</span>
                </div>
            `;
        });
        listEl.innerHTML = html;

    } catch (e) {
        console.error('Error loading trips for selection:', e);
        listEl.innerHTML = `
            <div class="p-8 text-center text-red-400">
                <p>여행 목록을 불러오지 못했습니다.</p>
                <button onclick="openTripSelectionModal()" class="mt-2 text-sm underline">다시 시도</button>
            </div>
        `;
    }
}

/**
 * 여행 선택 모달 닫기
 */
window.openTripSelectionModal = openTripSelectionModal;
window.closeTripSelectionModal = function () {
    const modal = document.getElementById('trip-selection-modal');
    if (modal) modal.classList.add('hidden');
};

/**
 * 목록에서 여행을 선택했을 때 처리
 */
window.selectTripForShare = function (tripId) {
    window.closeTripSelectionModal();
    // 0.3s delay for natural transition
    setTimeout(() => {
        openShareModal(tripId);
    }, 200);
};
