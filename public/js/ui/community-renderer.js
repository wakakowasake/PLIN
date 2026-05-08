import { db, firebaseReady } from '../firebase.js';
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { currentUser } from '../state.js';
import { showToast, showLoading, hideLoading } from './modals.js';
import { escapeHtml, formatDuration, normalizeGooglePhotoUrl, sanitizeImageUrl } from '../ui-utils.js';
import { fetchBackendJson } from '../services/backend/api-client.js';
import { calculateEndTime, formatTime } from './time-helpers.js';
import {
    filterCommunityPosts
} from '../features/community/community-item-helpers.js';

let allPosts = []; // Local cache for filtering

function isCommunityAdmin(user) {
    return user?.role === 'admin';
}

/**
 * Render the Community Feed
 */
export async function renderCommunityFeed() {
    await firebaseReady;
    // console.log("[Community] Firebase ready. DB status:", typeof db);
    const feedEl = document.getElementById('community-feed');
    if (!feedEl) return;

    // Show Loader (Only on first load or manual refresh)
    if (allPosts.length === 0) {
        feedEl.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center text-gray-400 opacity-50">
                <span class="material-symbols-outlined text-6xl mb-4 spinning">refresh</span>
                <p class="font-bold">최신 여행 계획을 불러오는 중...</p>
            </div>
        `;
    }

    try {
        let q;
        let querySnapshot;

        try {
            q = query(collection(db, 'community_posts'), orderBy('publishedAt', 'desc'), limit(50));
            querySnapshot = await getDocs(q);
        } catch (initialErr) {
            console.warn("[Community] Sorted fetch failed, trying fallback:", initialErr);
            q = query(collection(db, 'community_posts'), limit(50));
            querySnapshot = await getDocs(q);
        }

        // Store in local cache and check likes status for current user
        allPosts = [];
        const promises = querySnapshot.docs.map(async (docSnap) => {
            const data = docSnap.data();
            let isLiked = false;

            // Check if current user liked this post
            if (currentUser) {
                const likeRef = doc(db, 'community_posts', docSnap.id, 'likes', currentUser.uid);
                const likeSnap = await getDoc(likeRef);
                isLiked = likeSnap.exists();
            }

            allPosts.push({
                id: docSnap.id,
                ...data,
                _isLiked: isLiked // Local state for rendering
            });
        });

        await Promise.all(promises);
        // console.log(`[Community] Successfully loaded ${allPosts.length} posts.`);

        // Initial render without filter
        renderFilteredFeed(allPosts);

    } catch (e) {
        console.error("Error fetching community feed:", e);
        feedEl.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center text-red-400 opacity-50">
                <span class="material-symbols-outlined text-6xl mb-4">error</span>
                <p class="font-bold">데이터를 불러오는 중 오류가 발생했습니다.</p>
            </div>
        `;
    }
}

/**
 * Handle Search Input
 */
export function handleCommunitySearch(keyword) {
    renderFilteredFeed(filterCommunityPosts(allPosts, keyword));
}

/**
 * Helper to render posts after filtering
 */
function renderFilteredFeed(posts) {
    const feedEl = document.getElementById('community-feed');
    if (!feedEl) return;

    if (posts.length === 0) {
        feedEl.innerHTML = `
            <div class="col-span-full py-20 flex flex-col items-center justify-center text-gray-400 opacity-50 animate-fade-in">
                <span class="material-symbols-outlined text-6xl mb-4">search_off</span>
                <p class="font-bold">검색 결과가 없습니다. ✨</p>
                <p class="text-xs mt-2">다른 검색어로 다시 시도해보세요.</p>
            </div>
        `;
        return;
    }

    let html = '';
    posts.forEach((post) => {
        html += renderCommunityCard(post.id, post);
    });
    feedEl.innerHTML = html;
}

/**
 * Render a single community card
 */
function renderCommunityCard(id, data) {
    const title = data.meta?.title || "제목 없는 여행";
    const subInfo = data.meta?.subInfo || "정보 없음";
    const image = normalizeGooglePhotoUrl(data.meta?.mapImage, 600)
        || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop';
    const authorName = data.authorName || "익명";
    const authorPhoto = sanitizeImageUrl(data.authorPhoto || "/images/basic-profile.png", "/images/basic-profile.png");
    const likes = data.likesCount || 0;
    const clones = data.clonesCount || 0;
    const isLiked = data._isLiked || false;
    const isAuthor = currentUser && data.authorUid === currentUser.uid;
    const isAdmin = isCommunityAdmin(currentUser);
    const canManage = isAuthor || isAdmin;

    return `
        <div onclick="window.viewCommunityPost('${id}')" class="community-post-card group bg-card-light dark:bg-card-dark rounded-3xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl transition-all h-full flex flex-col transform hover:-translate-y-1 relative cursor-pointer">
            <div class="relative h-48 overflow-hidden">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                
                <!-- More Menu for Author or Admin -->
                ${canManage ? `
                <div class="absolute top-4 right-4 z-10">
                    <button onclick="window.toggleCommunityMenu(event, '${id}')" class="size-8 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/40 transition-colors">
                        <span class="material-symbols-outlined text-sm">more_vert</span>
                    </button>
                    <!-- Dropdown -->
                    <div id="comm-menu-${id}" class="hidden absolute right-0 mt-2 w-32 bg-white dark:bg-card-dark rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 animate-fade-in-up">
                        <button onclick="window.deleteCommunityPost('${id}')" class="w-full text-left px-4 py-2 text-xs text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                            <span class="material-symbols-outlined text-sm">delete</span> 삭제하기
                        </button>
                    </div>
                </div>
                ` : ''}

                <!-- Overlay Info -->
                <div class="absolute bottom-4 left-4 right-4">
                    <div class="flex items-center gap-2 mb-1">
                         <img src="${escapeHtml(authorPhoto)}" class="w-5 h-5 rounded-full border border-white/20">
                         <span class="text-white text-[10px] font-bold opacity-80">${escapeHtml(authorName)}</span>
                    </div>
                    <h3 class="text-white font-bold text-lg truncate drop-shadow-md">${escapeHtml(title)}</h3>
                </div>
            </div>

            <div class="p-5 flex-1 flex flex-col">
                <div class="flex items-center justify-between mb-4">
                    <span class="text-xs text-gray-400 font-medium">${escapeHtml(subInfo)}</span>
                    <div class="flex items-center gap-3">
                        <button onclick="window.likeCommunityPost(event, '${id}')" class="flex items-center gap-1 ${isLiked ? 'text-red-500' : 'text-gray-400'} hover:scale-110 transition-transform">
                            <span class="material-symbols-outlined text-sm" style="${isLiked ? 'font-variation-settings: \'FILL\' 1;' : ''}">favorite</span>
                            <span class="text-[10px] font-bold" id="likes-count-${id}">${likes}</span>
                        </button>
                        <div class="flex items-center gap-1 text-gray-400">
                            <span class="material-symbols-outlined text-sm">content_copy</span>
                            <span class="text-[10px] font-bold" id="clones-count-${id}">${clones}</span>
                        </div>
                    </div>
                </div>

                <div class="mt-auto flex gap-2">
                    <button onclick="window.viewCommunityPost('${id}')" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors">자세히 보기</button>
                    <button onclick="window.cloneCommunityPost(event, '${id}')" class="flex-1 py-3 bg-primary/10 text-primary rounded-xl font-bold text-sm hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined text-sm">download</span> 나의 계획으로
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Clone a post to currentUser's private plans
 */
export async function cloneCommunityPost(postId) {
    if (!currentUser) {
        showToast("로그인 후 내 여행으로 가져올 수 있습니다. 🔑", "warning");
        return;
    }

    window.showConfirmModal("이 여행 계획을 내 보관함으로 복사할까요? 📂", async () => {

        showLoading();
        try {
            await fetchBackendJson(`/community/posts/${encodeURIComponent(postId)}/duplicate-to-trip`, {
                method: 'POST'
            });

            // [New] Update clone count in community post
            const post = allPosts.find(p => p.id === postId);
            if (post) {
                post.clonesCount = (post.clonesCount || 0) + 1;
                const counters = document.querySelectorAll(`.modal-clones-count`);
                counters.forEach(c => c.textContent = post.clonesCount);

                // Also update card counter if visible
                const cardCounter = document.getElementById(`clones-count-${postId}`);
                if (cardCounter) cardCounter.textContent = post.clonesCount;
            }

            showToast("나의 계획으로 복사되었습니다! 메인 탭에서 확인하세요. ✨", "success");

            // Switch to main tab (optional but good)
            if (window.switchTab) window.switchTab('main');
            if (window.Trips && window.Trips.loadTripList) window.Trips.loadTripList(currentUser.uid);

        } catch (e) {
            console.error("Error cloning post:", e);
            showToast("복사 중 오류가 발생했습니다.", "error");
        } finally { hideLoading(); }
    }, { icon: 'content_copy', iconColor: 'text-primary', iconBgColor: 'bg-primary/10', confirmBtnColor: 'bg-primary hover:opacity-90' });
}

/**
 * [NEW] Enhanced clone post with event support to prevent propagation
 */
export async function cloneCommunityPostWithEvent(event, postId) {
    if (event) event.stopPropagation();
    return cloneCommunityPost(postId);
}
window.cloneCommunityPost = cloneCommunityPostWithEvent;

/**
 * View Post Detail (Modal Popup)
 */
export async function viewCommunityPost(postId) {
    await firebaseReady;
    if (!postId || postId === 'undefined') {
        console.error("[Community] Invalid postId:", postId);
        return;
    }
    currentViewingPostId = postId;

    // [New] Ensure mobile panel is closed when opening a new post
    window.toggleMobileComments(false);

    // find post in local cache
    const post = allPosts.find(p => p.id === postId);

    if (!post) {
        console.warn("[Community] Post not found in cache. This might happen if the feed was refreshed.");
        showToast("게시물 정보를 불러올 수 없습니다. 다시 시도해주세요.", "error");
        return;
    }

    try {
        const modal = document.getElementById('community-post-detail-modal');
        if (!modal) return;

        // Bind Data safely
        const title = post.meta?.title || post.title || "제목 없는 여행";
        const subInfo = post.meta?.subInfo || post.subInfo || "정보 없음";
        const authorName = post.authorName || "익명";
        const authorPhoto = sanitizeImageUrl(post.authorPhoto || "/images/basic-profile.png", "/images/basic-profile.png");
        const mapImage = normalizeGooglePhotoUrl(post.meta?.mapImage || post.image, 1200)
            || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop';

        document.getElementById('comm-detail-title').textContent = title;
        document.getElementById('comm-detail-subinfo').textContent = subInfo;

        const mainImg = document.getElementById('comm-detail-image');
        if (mainImg) {
            mainImg.src = mapImage;
            // Handle 403 or other load errors for Google Maps photos
            mainImg.onerror = () => {
                // If it's a Google Maps URL, try to recover via proxy using the extracted reference
                const reference = extractGooglePhotoReference(mapImage);
                if (reference) {
                    const backendBase = "https://asia-northeast3-plin-db93d.cloudfunctions.net/api";
                    mainImg.src = `${backendBase}/google-photo-proxy?reference=${encodeURIComponent(reference)}`;
                    mainImg.onerror = () => {
                        mainImg.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop';
                        mainImg.onerror = null;
                    };
                    return;
                }
                mainImg.src = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop';
                mainImg.onerror = null;
            };
        }


        const authImg = document.getElementById('comm-detail-author-photo');
        if (authImg) {
            authImg.src = authorPhoto;
            authImg.onerror = () => { authImg.src = "/images/basic-profile.png"; };
        }

        document.getElementById('comm-detail-author-name').textContent = authorName;

        // Setup Clone Button
        const cloneBtn = document.getElementById('comm-detail-clone-btn');
        if (cloneBtn) {
            cloneBtn.onclick = () => window.cloneCommunityPost(postId);
        }
        const cloneBtnMobile = document.getElementById('comm-detail-clone-btn-mobile');
        if (cloneBtnMobile) {
            cloneBtnMobile.onclick = () => window.cloneCommunityPost(postId);
        }

        // Setup Like Button in Modal (Footer)
        const likeBtn = document.getElementById('comm-footer-like-btn');
        if (likeBtn) {
            const isLiked = post._isLiked;
            const icon = likeBtn.querySelector('.material-symbols-outlined');
            if (isLiked) {
                likeBtn.classList.add('text-red-500');
                likeBtn.classList.remove('text-gray-400');
                if (icon) icon.classList.add('icon-filled');
            } else {
                likeBtn.classList.remove('text-red-500');
                likeBtn.classList.add('text-gray-400');
                if (icon) icon.classList.remove('icon-filled');
            }
            likeBtn.onclick = (e) => window.likeCommunityPost(e, postId);
        }

        // Render Timeline
        const timelineEl = document.getElementById('comm-detail-timeline');
        if (timelineEl) {
            timelineEl.innerHTML = renderCommunityPostTimeline(post.days || []);
        }

        // Setup Interaction Info in Modal
        const modalLikes = modal.querySelectorAll('.modal-likes-count');
        const modalClones = modal.querySelectorAll('.modal-clones-count');
        modalLikes.forEach(el => el.textContent = post.likesCount || 0);
        modalClones.forEach(el => el.textContent = post.clonesCount || 0);

        // [NEW] Load Comments
        loadCommunityComments(postId);

        // Setup Comment Input (Enter key)
        const commentInput = document.getElementById('comm-footer-comment-input');
        if (commentInput) {
            commentInput.value = ''; // Reset
            commentInput.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    window.submitCommunityComment();
                }
            };
        }

        // Setup Mobile Comment Input (Enter key)
        const mobileCommentInput = document.getElementById('comm-mobile-comment-input');
        if (mobileCommentInput) {
            mobileCommentInput.value = '';
            mobileCommentInput.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    window.submitCommunityComment('mobile');
                }
            };
        }

        // Show Modal with Animation
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');

        // [New] Reset scroll position of modal content
        const scrollContainer = modal.querySelector('.overflow-y-auto');
        if (scrollContainer) scrollContainer.scrollTop = 0;

    } catch (err) {
        console.error("[Community] Error opening post detail:", err);
        showToast("상세 정보를 표시하는 중 오류가 발생했습니다.", "error");
    }
}

/**
 * Close Post Detail Modal
 */
export function closeCommunityPostDetail() {
    stopCommunityCommentsSync();
    currentViewingPostId = null;
    const modal = document.getElementById('community-post-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    }
}

/**
 * Helper to render timeline inside modal
 */
function renderCommunityPostTimeline(days) {
    if (!days || days.length === 0) {
        return `<div class="py-10 text-center text-gray-400 text-sm italic font-hand">아직 여행 일정이 등록되지 않았습니디.</div>`;
    }

    return days.map((day, dayIndex) => {
        const timeline = day.timeline || [];

        return `
            <div class="day-group mb-12">
                <div class="flex items-center gap-4 mb-6">
                    <div class="bg-primary/10 text-primary w-[60px] py-1 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 uppercase tracking-tighter">${dayIndex + 1}일차</div>
                    <div class="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
                    <div class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">${day.date || ""}</div>
                </div>
                
                <div class="flex flex-col gap-6">
                    ${timeline.length > 0 ? timeline.map((item, idx) => buildCommunityTimelineItem(item, idx, dayIndex)).join('') : `<div class="text-center py-6 text-xs text-gray-400 italic font-hand">이날의 일정이 없습니다.</div>`}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Build individual timeline item for community (Mirror design & logic)
 */
function buildCommunityTimelineItem(item, index, dayIndex) {
    const title = item.title || "미지정 장소";
    const time = item.time || "";

    // Parse times for the left time card
    let startTime = "--:--";
    let endTime = "--:--";

    // 1. Handle Transit/Flight specific times
    if (item.isTransit && item.transitType === 'airplane' && item.flightInfo) {
        startTime = item.flightInfo.departureTime || '--:--';
        endTime = item.flightInfo.arrivalTime || '--:--';
    } else if (item.isTransit && item.transitInfo) {
        const isValidTime = (t) => t && /^\d{1,2}:\d{2}$/.test(t);
        if (isValidTime(item.transitInfo.start)) {
            startTime = item.transitInfo.start;
            endTime = item.transitInfo.end || '--:--';
        }
    }
    // 2. Handle range strings like "09:00 - 10:30"
    else if (time.includes('-')) {
        const parts = time.split('-');
        startTime = formatTime(parts[0].trim());
        endTime = formatTime(parts[1].trim());
    }
    // 3. Handle single time + duration (Mirror renderers.js logic)
    else if (time) {
        const timeStr = time.replace(/오전|오후|AM|PM/gi, '').trim();
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);

        if (timeMatch) {
            startTime = formatTime(`${timeMatch[1]}:${timeMatch[2]}`);

            // Calculate end time using duration (default 30 min if missing)
            const duration = (item.duration !== undefined && item.duration !== null) ? Number(item.duration) : 30;
            endTime = calculateEndTime(startTime, duration);
        }
    }

    return `
        <div class="relative grid grid-cols-[auto_1fr] gap-x-3 md:gap-x-6">
            <!-- Time Section -->
            <div class="relative flex flex-col pt-1">
                ${item.tag === '메모' ? `
                    <div class="w-[60px] shrink-0"></div>
                ` : `
                    <div class="relative z-10 h-full flex flex-col items-center justify-between bg-white dark:bg-card-dark rounded-2xl px-2 py-2 shadow-sm w-[60px] shrink-0 border border-gray-100 dark:border-gray-700 tabular-nums" style="width: 60px; min-width: 60px;">
                        <div class="font-bold font-hand text-sm text-gray-900 dark:text-white leading-tight">${startTime}</div>
                        <div class="text-[10px] text-gray-300">↓</div>
                        <div class="font-bold font-hand text-sm text-gray-900 dark:text-white leading-tight">${endTime === '--:--' ? '...' : endTime}</div>
                    </div>
                `}
            </div>

            <!-- Card Content -->
            <div class="flex flex-col justify-center min-w-0">
                ${renderCommunityCardByType(item, index, dayIndex)}
            </div>
        </div>
    `;
}

/**
 * Render card based on its type (Ported from renderers.js)
 */
function renderCommunityCardByType(item, index, dayIndex) {
    const title = item.title || "제목 없음";
    const location = item.location || "";
    const note = item.note || "";
    const tag = item.tag || "";
    const rotation = (index % 2 === 0) ? 'rotate-1' : '-rotate-1';
    const tapeRotation = (index % 2 === 0) ? '-rotate-3' : 'rotate-3';

    // 1. Image Card
    if (item.image) {
        const itemImage = normalizeGooglePhotoUrl(item.image, 800);
        return `
            <div class="community-timeline-card bg-card-light dark:bg-card-dark rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800">
                <div class="community-timeline-card-media h-32 w-full relative overflow-hidden">
                    <img src="${escapeHtml(itemImage)}" alt="${escapeHtml(title)}" class="absolute inset-0 h-full w-full object-cover" loading="eager" decoding="async" fetchpriority="auto" onerror="this.remove();">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <div class="absolute bottom-3 left-4 right-4 text-white">
                        <h3 class="text-xl font-hand truncate tracking-wide">${escapeHtml(title)}</h3>
                        <div class="flex items-center gap-1 text-sm font-hand opacity-90 overflow-hidden">
                            <span class="material-symbols-outlined text-[14px] flex-shrink-0">location_on</span>
                            <span class="truncate flex-1">${escapeHtml(location)}</span>
                        </div>
                    </div>
                </div>
                <div class="p-3 flex items-center gap-2 flex-wrap">
                    <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 px-2 py-1 rounded text-xs font-medium text-text-main dark:text-gray-300 w-fit">
                        <span class="material-symbols-outlined text-[16px]">schedule</span>
                        ${item.time || ""}
                    </div>
                    ${typeof item.duration === 'number' ? `
                    <div class="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-sm border border-primary/20 text-[11px] font-hand">
                        <span class="material-symbols-outlined text-[14px]">timer</span>
                        <span>${formatDuration(item.duration)}</span>
                    </div>` : ''}
                </div>
            </div>`;
    }

    // 2. Memo Card
    if (tag === '메모') {
        return `
            <div class="community-timeline-card relative bg-card-light dark:bg-card-dark border border-gray-100 dark:border-gray-700 rounded-2xl p-4 ${rotation} shadow-sm">
                <div class="community-timeline-card-tape absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-6 bg-white/30 backdrop-blur-[2px] border border-white/40 shadow-sm ${tapeRotation} pointer-events-none"></div>
                <p class="text-sm font-medium text-text-main dark:text-white break-words whitespace-pre-wrap leading-relaxed font-body">${escapeHtml(title)}</p>
            </div>`;
    }

    // 3. Transit Card
    if (item.isTransit || item.type === 'transit' || item.type === 'flight') {
        let icon = 'directions_car';
        let typeLabel = item.tag || "";

        if (item.type === 'flight' || item.transitType === 'airplane') {
            icon = 'flight';
            if (!typeLabel) typeLabel = "항공";
        } else if (item.transitType === 'train') {
            icon = 'train';
            if (!typeLabel) typeLabel = "기차";
        } else if (item.transitType === 'bus') {
            icon = 'directions_bus';
            if (!typeLabel) typeLabel = "버스";
        } else if (item.transitType === 'walk') {
            icon = 'directions_walk';
            if (!typeLabel) typeLabel = "도보";
        } else if (!typeLabel) {
            typeLabel = "자동차";
        }

        const rawTitle = item.title || "";
        let titleHtml = "";

        // [Fix] 구글 지도의 노선 정보(HTML) 처리 - renderers.js 로직 이식
        if (rawTitle && rawTitle.includes('<span')) {
            const dangerPatterns = [/on\w+\s*=/i, /javascript:/i, /<script/i, /alert\(/i, /prompt\(/i, /confirm\(/i];
            const isDangerous = dangerPatterns.some(pattern => pattern.test(rawTitle));
            titleHtml = isDangerous ? escapeHtml(rawTitle) : rawTitle;
        } else {
            titleHtml = rawTitle ? `<p class="text-xl font-hand text-text-main dark:text-white truncate ml-2 tracking-wide">${escapeHtml(rawTitle)}</p>` : "";
        }

        // [New] 태그 배지 생성 (renderers.js와 동일한 디자인)
        const tagBadge = `<div class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold shadow-sm bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary">
                            <span class="material-symbols-outlined text-sm">${icon}</span>
                            <span>${typeLabel}</span>
                        </div>`;

        return `
            <div class="community-timeline-card bg-white dark:bg-card-dark rounded-2xl p-4 border border-gray-200 dark:border-gray-700 paper-shadow flex flex-col gap-2 relative transform transition-transform hover:-rotate-1">
                <div class="community-timeline-card-tape absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-white/30 backdrop-blur-sm border border-white/40 shadow-sm rotate-[-2deg] pointer-events-none"></div>
                <div class="flex items-center gap-3">
                    <div class="flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-sm px-3 py-1 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white min-w-[70px] flex-shrink-0">
                        <span class="font-hand text-base">${typeof item.duration === 'number' ? formatDuration(item.duration) : (item.duration || "시간 미정")}</span>
                    </div>
                    <div class="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
                        ${tagBadge}
                        ${titleHtml}
                    </div>
                </div>
            </div>`;
    }

    // 4. Default Card (Place)
    return `
            <div class="community-timeline-card bg-white dark:bg-card-dark rounded-2xl p-4 md:p-5 paper-shadow border border-gray-200 dark:border-gray-700 relative transform transition-transform hover:-rotate-1">
                <div class="community-timeline-card-tape absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-white/30 backdrop-blur-sm border border-white/40 shadow-sm rotate-[-2deg] pointer-events-none"></div>

                <div class="flex justify-between items-start mb-3 gap-2">
                    <div class="flex-1 min-w-0">
                        <h3 class="text-xl md:text-2xl font-hand text-text-main dark:text-white break-words tracking-wide leading-tight">${escapeHtml(title)}</h3>
                        <p class="text-sm font-hand text-text-muted dark:text-gray-400 flex items-center gap-1 mt-1">
                            <span class="material-symbols-outlined text-[16px] flex-shrink-0">location_on</span>
                            <span class="truncate flex-1">${escapeHtml(location)}</span>
                        </p>
                    </div>
                    ${item.tag ? `<span class="inline-flex items-center px-2 py-0.5 rounded-sm text-sm font-hand font-bold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 transform rotate-2 shadow-sm">${escapeHtml(item.tag)}</span>` : ''}
                </div>
                
                <div class="flex items-center gap-2 text-xs font-medium text-text-main dark:text-gray-300 flex-wrap">
                    <div class="flex items-center gap-1 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-sm border border-gray-100 dark:border-gray-600">
                        <span class="material-symbols-outlined text-[16px]">schedule</span>
                        <span class="font-hand text-base">${item.time || ''}</span>
                    </div>
                    ${typeof item.duration === 'number' ? `
                    <div class="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-sm border border-primary/20 text-xs">
                        <span class="material-symbols-outlined text-[14px]">timer</span>
                        <span class="font-hand text-base">${formatDuration(item.duration)}</span>
                    </div>` : ''}
                    ${note ? `
                    <div class="text-xs text-gray-500 flex items-center gap-1 min-w-0 bg-card-light dark:bg-gray-800/50 px-2 py-1 rounded-sm border border-gray-100 dark:border-gray-700">
                        <span class="material-symbols-outlined text-[14px] flex-shrink-0 text-primary">edit_note</span>
                        <span class="truncate font-hand text-base text-gray-700 dark:text-gray-300">${escapeHtml(note)}</span>
                    </div>` : ''}
                </div>
            </div>`;
}

export function toggleCommunityMenu(event, postId) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const menu = document.getElementById(`comm-menu-${postId}`);
    if (!menu) return;

    // Close all other menus first
    document.querySelectorAll('[id^="comm-menu-"]').forEach(el => {
        if (el.id !== `comm-menu-${postId}`) el.classList.add('hidden');
    });

    menu.classList.toggle('hidden');

    // Close when clicking outside
    const closeMenu = (e) => {
        if (!event.target.closest(`#comm-menu-${postId}`)) {
            menu.classList.add('hidden');
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
}

/**
 * [NEW] Toggle Mobile Comments Panel (Bottom Sheet)
 */
export function toggleMobileComments(show = true) {
    const panel = document.getElementById('comm-mobile-comments-panel');
    const backdrop = document.getElementById('comm-mobile-comments-backdrop');
    const bar = document.getElementById('comm-detail-footer-bar');
    if (!panel || !backdrop) return;

    if (show) {
        panel.classList.remove('hidden');
        // Small delay to allow 'hidden' to be removed before animation
        setTimeout(() => {
            panel.classList.add('panel-slide-up');
            panel.classList.remove('pointer-events-none');
            backdrop.classList.remove('pointer-events-none');
            backdrop.classList.add('opacity-100');
            // Footer bar remains fixed at the bottom (animation removed)
        }, 10);
        // Focus input after animation
        setTimeout(() => document.getElementById('comm-mobile-comment-input')?.focus(), 300);
    } else {
        panel.classList.remove('panel-slide-up');
        panel.classList.add('panel-slide-down');
        panel.classList.add('pointer-events-none');
        backdrop.classList.add('pointer-events-none');
        backdrop.classList.remove('opacity-100');
        // Footer bar transform cleanup (if any)
        if (bar) bar.classList.remove('panel-slide-up');
        // Wait for animation to finish before adding 'hidden'
        setTimeout(() => panel.classList.add('hidden'), 300);
    }
}
window.toggleMobileComments = toggleMobileComments;

/**
 * Load & Sync Comments for a post
 */
const COMMUNITY_COMMENT_POLL_MS = 15000;
let commentPollTimer = null;

function stopCommunityCommentsSync() {
    if (commentPollTimer) {
        window.clearInterval(commentPollTimer);
        commentPollTimer = null;
    }
}

function renderCommunityComments(postId, comments) {
    const listEl = document.getElementById('comm-comment-list');
    const mobileListEl = document.getElementById('comm-mobile-comment-list');
    const countEl = document.getElementById('comm-detail-comments-count');
    const mobileCountEls = document.querySelectorAll('.modal-comments-count');
    const mobileBadge = document.getElementById('comm-mobile-comment-count-badge');

    if (countEl) countEl.textContent = comments.length;
    mobileCountEls.forEach((el) => {
        el.textContent = comments.length;
    });

    if (mobileBadge) {
        mobileBadge.textContent = comments.length;
        mobileBadge.classList.toggle('hidden', comments.length === 0);
    }

    if (comments.length === 0) {
        const emptyMsg = `<p class="text-xs text-gray-400 text-center py-10 italic">첫 번째 댓글을 남겨보세요! ✨</p>`;
        if (listEl) listEl.innerHTML = emptyMsg;
        if (mobileListEl) mobileListEl.innerHTML = emptyMsg;
        return;
    }

    const html = comments.map((c) => {
        const canDelete = currentUser && (c.authorUid === currentUser.uid || isCommunityAdmin(currentUser));

        return `
            <div class="bg-white dark:bg-gray-800/10 p-3 rounded-xl border border-gray-50 dark:border-gray-700/50 shadow-sm animate-fade-in group">
                <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-1.5">
                        <img src="${escapeHtml(sanitizeImageUrl(c.authorPhoto || '/images/basic-profile.png', '/images/basic-profile.png'))}" 
                             style="width: 20px; height: 20px;" 
                             class="rounded-full object-cover shrink-0">
                        <span class="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate max-w-[100px]">${escapeHtml(c.authorName)}</span>
                        <span class="text-[9px] text-gray-400">${c.createdAt ? new Date(c.createdAt.toDate()).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '방금 전'}</span>
                    </div>
                    ${canDelete ? `
                        <button onclick="window.deleteCommunityComment('${postId}', '${c.id}')" 
                                class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                title="삭제">
                            <span class="material-symbols-outlined text-red-500 text-sm">delete</span>
                        </button>
                    ` : ''}
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-400 leading-normal whitespace-pre-wrap">${escapeHtml(c.text)}</p>
            </div>
        `;
    }).join('');

    if (listEl) listEl.innerHTML = html;
    if (mobileListEl) mobileListEl.innerHTML = html;
}

async function refreshCommunityComments(postId) {
    const listEl = document.getElementById('comm-comment-list');
    const mobileListEl = document.getElementById('comm-mobile-comment-list');
    if (!listEl && !mobileListEl) return;

    const commentsRef = collection(db, 'community_posts', postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    const comments = [];
    snapshot.forEach((docSnap) => {
        comments.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderCommunityComments(postId, comments);
}

export async function loadCommunityComments(postId) {
    await firebaseReady;
    stopCommunityCommentsSync();

    try {
        await refreshCommunityComments(postId);
    } catch (err) {
        console.error("Error loading comments:", err);
        const listEl = document.getElementById('comm-comment-list');
        if (listEl) {
            listEl.innerHTML = `<p class="text-xs text-red-400 text-center py-10 opacity-50">댓글을 불러오지 못했습니다.</p>`;
        }
        const mobileListEl = document.getElementById('comm-mobile-comment-list');
        if (mobileListEl) {
            mobileListEl.innerHTML = `<p class="text-xs text-red-400 text-center py-10 opacity-50">댓글을 불러오지 못했습니다.</p>`;
        }
        return;
    }

    commentPollTimer = window.setInterval(() => {
        const modal = document.getElementById('community-post-detail-modal');
        if (!modal || modal.classList.contains('hidden') || currentViewingPostId !== postId) {
            stopCommunityCommentsSync();
            return;
        }

        refreshCommunityComments(postId).catch((error) => {
            console.warn("Comment refresh failed:", error);
        });
    }, COMMUNITY_COMMENT_POLL_MS);
}

/**
 * Submit a new comment
 */
export async function submitCommunityComment(mode = 'desktop') {
    await firebaseReady;
    if (!currentUser) {
        showToast("로그인 후 댓글을 남길 수 있습니다. ✨", "warning");
        return;
    }

    const inputId = mode === 'mobile' ? 'comm-mobile-comment-input' : 'comm-footer-comment-input';
    const input = document.getElementById(inputId);
    const text = input?.value.trim();
    if (!text) return;

    if (!currentViewingPostId) {
        showToast("오류가 발생했습니다. 다시 시도해주세요.", "error");
        return;
    }

    try {
        await fetchBackendJson(`/community/posts/${encodeURIComponent(currentViewingPostId)}/comments`, {
            method: 'POST',
            body: { text }
        });

        // Clear both inputs
        const desktopInput = document.getElementById('comm-footer-comment-input');
        const mobileInput = document.getElementById('comm-mobile-comment-input');
        if (desktopInput) desktopInput.value = '';
        if (mobileInput) mobileInput.value = '';
        if (input) input.blur();
        refreshCommunityComments(currentViewingPostId).catch((error) => {
            console.warn("Comment refresh after submit failed:", error);
        });
        showToast("댓글이 등록되었습니다! 💬", "success");
    } catch (err) {
        console.error("Error adding comment:", err);
        showToast("댓글 등록에 실패했습니다.", "error");
    }
}
window.submitCommunityComment = submitCommunityComment;

/**
 * Delete a community comment
 */
export async function deleteCommunityComment(postId, commentId) {
    await firebaseReady;
    if (!currentUser) {
        showToast("로그인이 필요합니다.", "warning");
        return;
    }


    // Show custom confirm modal
    window.showConfirmModal(
        "댓글을 삭제하시겠습니까?",
        async () => {
            try {
                await fetchBackendJson(
                    `/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
                    { method: 'DELETE' }
                );
                refreshCommunityComments(postId).catch((error) => {
                    console.warn("Comment refresh after delete failed:", error);
                });
                showToast("댓글이 삭제되었습니다.", "success");
            } catch (err) {
                console.error("Error deleting comment:", err);
                showToast("댓글 삭제에 실패했습니다.", "error");
            }
        },
        {
            icon: 'delete',
            iconColor: 'text-red-500',
            iconBgColor: 'bg-red-50 dark:bg-red-900/20',
            confirmBtnColor: 'bg-red-500 hover:bg-red-600'
        }
    );
}

let currentViewingPostId = null;

/**
 * Like/Unlike a community post (Toggle)
 */
export async function likeCommunityPost(event, postId) {
    await firebaseReady;
    if (event) event.stopPropagation();
    if (!currentUser) {
        showToast("로그인 후 좋아요를 누를 수 있습니다. ✨", "warning");
        return;
    }

    const post = allPosts.find(p => p.id === postId);
    if (!post) return;

    // Toggle Logic
    const isLiked = post._isLiked;

    try {
        const result = await fetchBackendJson(`/community/posts/${encodeURIComponent(postId)}/like-toggle`, {
            method: 'POST'
        });
        post._isLiked = Boolean(result?.isLiked);
        post.likesCount = Number.isFinite(Number(result?.likesCount))
            ? Math.max(0, Number(result.likesCount))
            : (post._isLiked ? (post.likesCount || 0) + 1 : Math.max(0, (post.likesCount || 0) - 1));

        // Update UI (Card)
        const btn = event.currentTarget || document.querySelector(`[onclick*="likeCommunityPost(event, '${postId}')"]`);
        if (btn) {
            const icon = btn.querySelector('.material-symbols-outlined');
            const count = btn.querySelector('span:not(.material-symbols-outlined)');

            if (post._isLiked) {
                btn.classList.add('text-red-500');
                btn.classList.remove('text-gray-400');
                icon.classList.add('icon-filled');
            } else {
                btn.classList.remove('text-red-500');
                btn.classList.add('text-gray-400');
                icon.classList.remove('icon-filled');
            }
            if (count) count.textContent = post.likesCount;
        }

        // Update UI (Modal if open)
        const modal = document.getElementById('community-post-detail-modal');
        if (modal && !modal.classList.contains('hidden')) {
            const modalLikeBtn = document.getElementById('comm-footer-like-btn');
            const modalLikesCounts = modal.querySelectorAll('.modal-likes-count');

            if (modalLikeBtn) {
                const icon = modalLikeBtn.querySelector('.material-symbols-outlined');
                if (post._isLiked) {
                    modalLikeBtn.classList.add('text-red-500');
                    modalLikeBtn.classList.remove('text-gray-400');
                    if (icon) icon.classList.add('icon-filled');
                } else {
                    modalLikeBtn.classList.remove('text-red-500');
                    modalLikeBtn.classList.add('text-gray-400');
                    if (icon) icon.classList.remove('icon-filled');
                }
            }
            modalLikesCounts.forEach(el => el.textContent = post.likesCount);
        }

    } catch (err) {
        console.error("Error toggling like:", err);
        showToast("좋아요 처리 중 오류가 발생했습니다.", "error");
    }
}

/**
 * Delete a community post
 */
export async function deleteCommunityPost(postId) {
    await firebaseReady; window.showConfirmModal("이 게시물을 커뮤니티에서 삭제할까요? 🗑️\n(내 보관함의 계획은 유지됩니다.)", async () => {

        showLoading();
        try {
            await fetchBackendJson(`/community/posts/${encodeURIComponent(postId)}`, {
                method: 'DELETE'
            });
            showToast("게시물이 삭제되었습니다. 👋", "success");
            renderCommunityFeed(); // Refresh feed
        } catch (e) {
            console.error("Error deleting post:", e);
            showToast("삭제 중 오류가 발생했습니다. 권한이 있는지 확인해주세요.", "error");
        } finally { hideLoading(); }
    }, { icon: 'content_copy', iconColor: 'text-primary', iconBgColor: 'bg-primary/10', confirmBtnColor: 'bg-primary hover:opacity-90' });
}

// Window Binding
window.renderCommunityFeed = renderCommunityFeed;
window.cloneCommunityPost = cloneCommunityPost;
window.viewCommunityPost = viewCommunityPost;
window.deleteCommunityPost = deleteCommunityPost;
window.deleteCommunityComment = deleteCommunityComment;
window.toggleCommunityMenu = toggleCommunityMenu;
window.handleCommunitySearch = handleCommunitySearch;
window.closeCommunityPostDetail = closeCommunityPostDetail;
window.likeCommunityPost = likeCommunityPost;
window.submitCommunityComment = submitCommunityComment;
