import {
    readTripDateRangeFormValues,
    readTripInfoFormValues,
} from './trip-info-form.js';
import {
    buildTripDateRangeUpdatePlan,
    buildTripInfoSavePlan,
    syncTravelDaysWithRange
} from '../../../../shared/features/trip-info/trip-info-helpers.js';
import { getTripTitleTooLongMessage } from '../../../../shared/features/trips/trip-title.js';

export async function saveTripInfoFlow({
    travelData,
    currentDayIndex,
    updateMeta,
    selectDay,
    renderItinerary,
    autoSave,
    closeTripInfoModal,
    showToast,
    persistTripInfo,
    applyPersistedTrip
}) {
    const { title, location, startStr, endStr } = readTripInfoFormValues();

    const plan = buildTripInfoSavePlan({
        title,
        location,
        startStr,
        endStr,
        currentDayIndex
    });

    if (plan.status === 'missing_title') {
        return showToast("여행 제목을 입력해주세요! 🏝️", 'warning');
    }

    if (plan.status === 'title_too_long') {
        return showToast(getTripTitleTooLongMessage(), 'warning');
    }

    if (plan.status === 'missing_dates') {
        return showToast("여행 날짜를 선택해주세요! 📅", 'warning');
    }

    if (plan.status === 'invalid_range') {
        return showToast("종료일이 시작일보다 빠를 수 없어요 😅", 'warning');
    }

    if (persistTripInfo) {
        try {
            const persistedTrip = await persistTripInfo({
                title: plan.metaUpdates.title,
                location,
                startDate: startStr,
                endDate: endStr
            });

            if (persistedTrip) {
                applyPersistedTrip?.(persistedTrip);

                if (plan.nextSelectedDayIndex !== null) {
                    selectDay(plan.nextSelectedDayIndex);
                }

                renderItinerary();
                closeTripInfoModal();
                return;
            }
        } catch (error) {
            return showToast(error?.message || "여행 정보를 저장하지 못했어요.", 'error');
        }
    }

    updateMeta('title', plan.metaUpdates.title);
    updateMeta('dayCount', plan.metaUpdates.dayCount);
    updateMeta('subInfo', plan.metaUpdates.subInfo);

    syncTravelDaysWithRange(travelData, plan.syncRange.startDate, plan.syncRange.totalDays);

    if (plan.nextSelectedDayIndex !== null) {
        selectDay(plan.nextSelectedDayIndex);
    }

    renderItinerary();
    autoSave();
    closeTripInfoModal();
}

export async function updateDateRangeFlow({
    travelData,
    updateMetaState,
    renderItinerary,
    autoSave,
    confirmShrink,
    alertFn,
    showToast,
    persistTripInfo,
    applyPersistedTrip
}) {
    const { startStr, endStr } = readTripDateRangeFormValues();

    const plan = buildTripDateRangeUpdatePlan({
        startStr,
        endStr,
        currentSubInfo: travelData?.meta?.subInfo,
        currentTotalDays: travelData?.days.length || 0
    });

    if (plan.status === 'noop_missing') {
        return;
    }

    if (plan.status === 'invalid_range') {
        alertFn?.("종료일은 시작일보다 빠를 수 없습니다.");
        return;
    }

    updateMetaState?.('dayCount', plan.metaUpdates.dayCount);
    updateMetaState?.('subInfo', plan.metaUpdates.subInfo);

    if (plan.requiresShrinkConfirmation) {
        const shouldShrink = confirmShrink?.("기간을 줄이면 일부 일정이 삭제될 수 있습니다. 계속하시겠습니까?") ?? true;
        if (!shouldShrink) {
            renderItinerary?.();
            return;
        }
    }

    if (persistTripInfo) {
        try {
            const persistedTrip = await persistTripInfo({
                location: travelData?.meta?.location || '',
                startDate: startStr,
                endDate: endStr
            });

            if (persistedTrip) {
                applyPersistedTrip?.(persistedTrip);
                renderItinerary?.();
                return;
            }
        } catch (error) {
            showToast?.(error?.message || "여행 정보를 저장하지 못했어요.", 'error');
            return;
        }
    }

    syncTravelDaysWithRange(travelData, plan.syncRange.startDate, plan.syncRange.totalDays);

    renderItinerary?.();
    autoSave?.();
}
