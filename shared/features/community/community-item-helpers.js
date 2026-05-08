const DEFAULT_COMMUNITY_AUTHOR_NAME = '익명의 여행자';
const DEFAULT_COMMUNITY_AUTHOR_PHOTO = '/images/basic-profile.png';

export function extractGooglePhotoReference(url) {
    if (!url || typeof url !== 'string' || !url.includes('google')) {
        return '';
    }

    const match = url.match(/(?:[?&]1s=?([^&]+)|[?&]photoreference=([^&]+))/i);
    return match ? (match[1] || match[2] || '') : '';
}

export function filterCommunityPosts(posts, keyword) {
    const term = String(keyword || '').toLowerCase().trim();
    if (!term) {
        return posts;
    }

    return posts.filter((post) => {
        const title = String(post?.meta?.title || '').toLowerCase();
        const city = String(post?.meta?.subInfo || '').toLowerCase();
        return title.includes(term) || city.includes(term);
    });
}

export function buildCommunityPostPayload({ sanitizedData, currentUser, tripId }) {
    return {
        ...sanitizedData,
        authorUid: currentUser.uid,
        authorName: currentUser.displayName || DEFAULT_COMMUNITY_AUTHOR_NAME,
        authorPhoto: currentUser.customPhotoURL || currentUser.photoURL || DEFAULT_COMMUNITY_AUTHOR_PHOTO,
        likesCount: 0,
        clonesCount: 0,
        tripId: tripId || null
    };
}

export function buildClonedPlanFromCommunityPost(data, ownerUid) {
    return {
        meta: JSON.parse(JSON.stringify(data.meta || {})),
        days: JSON.parse(JSON.stringify(data.days || [])),
        shoppingList: JSON.parse(JSON.stringify(data.shoppingList || [])),
        checklist: JSON.parse(JSON.stringify(data.checklist || [])),
        members: { [ownerUid]: 'owner' },
        createdBy: ownerUid,
        createdAt: new Date().toISOString(),
        isPublic: false
    };
}

export function sanitizeCommunityTripData(data) {
    const clean = JSON.parse(JSON.stringify(data || {}));

    delete clean.members;

    (clean.days || []).forEach((day) => {
        (day.timeline || []).forEach((item) => {
            if (item.tag === '메모') {
                item._originalTitle = item.title;
                item.title = '🔒 비공개 메모입니다.';
            }

            if (item.note) {
                item._note = item.note;
                delete item.note;
            }

            if (item.memo) {
                item._memo = item.memo;
                delete item.memo;
            }

            if (item.expenses) {
                item._expenses = item.expenses;
                delete item.expenses;
            }

            if (item.budget) {
                item._budget = item.budget;
                delete item.budget;
            }

            if (item.memories) {
                item._memories = item.memories;
                delete item.memories;
            }

            if (item.image) {
                item._image = item.image;
                delete item.image;
            }
        });
    });

    if (clean.meta && clean.meta.budget) {
        clean.meta._budget = clean.meta.budget;
        clean.meta.budget = '비공개';
    }

    if (clean.shoppingList) {
        clean._shoppingList = clean.shoppingList;
        clean.shoppingList = [];
    }

    return clean;
}
