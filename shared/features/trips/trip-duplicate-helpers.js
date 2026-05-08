export function buildDuplicatedTripData(sourceData, options, currentUid) {
    const { optRegion, optPlaces, optMemos, optBudget, optShopping, optSupplies } = options;

    const newMeta = { ...sourceData.meta };
    newMeta.title = `[복제] ${newMeta.title} `;
    if (newMeta.docId) delete newMeta.docId;

    if (!optRegion) {
        const subInfo = String(newMeta.subInfo || '');
        const parts = subInfo.split('•');
        newMeta.location = '';
        newMeta.subInfo = parts[1] ? `위치 미정 • ${parts[1]} ` : subInfo;
        newMeta.lat = null;
        newMeta.lng = null;
        newMeta.mapImage = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&h=400&fit=crop';
    }

    if (!optBudget) {
        newMeta.budget = 0;
    }

    const newDays = (sourceData.days || []).map((day) => {
        const newDay = { ...day };
        if (newDay.timeline) {
            newDay.timeline = newDay.timeline
                .filter((item) => {
                    const isMemo = item.tag === '메모';
                    if (isMemo) return optMemos;
                    return optPlaces;
                })
                .map((item) => {
                    const newItem = JSON.parse(JSON.stringify(item));
                    if (!optBudget) {
                        delete newItem.budget;
                        delete newItem.expenses;
                    }
                    return newItem;
                });
        }
        return newDay;
    });

    const newTrip = {
        ...sourceData,
        meta: newMeta,
        days: newDays,
        members: { [currentUid]: 'owner' },
        createdAt: new Date().toISOString(),
        createdBy: currentUid,
        isPublic: false
    };

    if (!optShopping) newTrip.shoppingList = [];
    if (!optSupplies) newTrip.checklist = [];

    return newTrip;
}
