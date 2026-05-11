import React from 'react';
import { View } from 'react-native';

import { DaySection } from '@/components/DaySection';
import { EmptyState } from '@/components/EmptyState';
import type { MobileTripDaySection } from '@/types/trip';

type DaySectionProps = React.ComponentProps<typeof DaySection>;

type Props = {
    canAddEmptyDayItem: DaySectionProps['canAddEmptyDayItem'];
    days: MobileTripDaySection[];
    hasReminder: DaySectionProps['hasReminder'];
    isDeletingItem: DaySectionProps['isDeletingItem'];
    isMovingItem: DaySectionProps['isMovingItem'];
    isTimelineEditMode: DaySectionProps['isTimelineEditMode'];
    onAddItem: DaySectionProps['onAddItem'];
    onDeleteItem: DaySectionProps['onDeleteItem'];
    onMoveItem: DaySectionProps['onMoveItem'];
    onOpenSortMenu: DaySectionProps['onOpenSortMenu'];
    onSelectItem: DaySectionProps['onSelectItem'];
    onToggleReminder: DaySectionProps['onToggleReminder'];
    registerSectionOffset(dayId: string, y: number): void;
};

export function TripDetailTimelineSection({
    canAddEmptyDayItem,
    days,
    hasReminder,
    isDeletingItem,
    isMovingItem,
    isTimelineEditMode,
    onAddItem,
    onDeleteItem,
    onMoveItem,
    onOpenSortMenu,
    onSelectItem,
    onToggleReminder,
    registerSectionOffset
}: Props) {
    if (days.length === 0) {
        return (
            <EmptyState
                title="아직 일정이 없어요."
                description="등록된 일정이 아직 없거나, 연결이 완전히 돌아오지 않아 최신 내용을 아직 다 불러오지 못했을 수 있어요."
            />
        );
    }

    return (
        <>
            {days.map((day) => (
                <View
                    key={day.id}
                    onLayout={(event) => {
                        registerSectionOffset(day.id, event.nativeEvent.layout.y);
                    }}
                >
                    <DaySection
                        day={day}
                        isTimelineEditMode={isTimelineEditMode}
                        canAddEmptyDayItem={canAddEmptyDayItem}
                        onAddItem={onAddItem}
                        onOpenSortMenu={onOpenSortMenu}
                        onSelectItem={onSelectItem}
                        onMoveItem={onMoveItem}
                        onToggleReminder={onToggleReminder}
                        hasReminder={hasReminder}
                        onDeleteItem={onDeleteItem}
                        isDeletingItem={isDeletingItem}
                        isMovingItem={isMovingItem}
                    />
                </View>
            ))}
        </>
    );
}
