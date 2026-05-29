import React from 'react';
import {
    Image,
    Pressable,
    ScrollView,
    Text,
    type ImageStyle,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
    View
} from 'react-native';

import type { MobileBudgetSummary, MobileTripDetail } from '@/types/trip';
import { buildCachedImageSource } from '@/utils/image-cache';

type TripDetailSummarySectionStyles = {
    listEmptyText: StyleProp<TextStyle>;
    metaPill: StyleProp<ViewStyle>;
    metaPillLabel: StyleProp<TextStyle>;
    metaRow: StyleProp<ViewStyle>;
    photoStrip: StyleProp<ViewStyle>;
    summaryActionButton: StyleProp<ViewStyle>;
    summaryActionButtonDisabled: StyleProp<ViewStyle>;
    summaryActionButtonPressed: StyleProp<ViewStyle>;
    summaryActionButtonText: StyleProp<TextStyle>;
    summaryCard: StyleProp<ViewStyle>;
    summaryCardPressed: StyleProp<ViewStyle>;
    summaryCaption: StyleProp<TextStyle>;
    summaryHeaderCopy: StyleProp<ViewStyle>;
    summaryHeaderRow: StyleProp<ViewStyle>;
    summaryLabel: StyleProp<TextStyle>;
    summaryValue: StyleProp<TextStyle>;
    tripPhotoPreview: StyleProp<ViewStyle>;
    tripPhotoPreviewImage: StyleProp<ImageStyle>;
    tripPhotoPreviewPressed: StyleProp<ViewStyle>;
    tripPhotoPreviewSpaced: StyleProp<ViewStyle>;
};

type BudgetSummarySectionProps = {
    averagePerDayLabel: string | null;
    budgetSummary: MobileBudgetSummary | null;
    canEditContent: boolean;
    canQuickAddBudget: boolean;
    firstBudgetQuickAddDayId: string | null;
    onOpenBudgetSummary(): void;
    onOpenQuickBudgetExpenseComposer(): void;
    styles: TripDetailSummarySectionStyles;
};

type PhotoSummarySectionProps = {
    canEditContent: boolean;
    canQuickAddMemory: boolean;
    detail: Pick<MobileTripDetail, 'id' | 'photoCount' | 'photoGalleryUrls' | 'photoPreviewUrls'>;
    firstMemoryQuickAddTargetExists: boolean;
    onOpenPhotoGallery(): void;
    onOpenQuickMemoryComposer(): void;
    onOpenSummaryPhotoViewer(index: number): void;
    styles: TripDetailSummarySectionStyles;
};

export function TripDetailBudgetSummarySection({
    averagePerDayLabel,
    budgetSummary,
    canEditContent,
    canQuickAddBudget,
    firstBudgetQuickAddDayId,
    onOpenBudgetSummary,
    onOpenQuickBudgetExpenseComposer,
    styles
}: BudgetSummarySectionProps) {
    if (budgetSummary) {
        return (
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="예산 상세 보기"
                onPress={onOpenBudgetSummary}
                style={({ pressed }) => [
                    styles.summaryCard,
                    pressed ? styles.summaryCardPressed : null
                ]}
            >
                <Text style={styles.summaryLabel}>예산 요약</Text>
                <Text style={styles.summaryValue}>{budgetSummary.totalLabel}</Text>
                <Text style={styles.summaryCaption}>{budgetSummary.caption}</Text>
                <View style={styles.metaRow}>
                    <View style={styles.metaPill}>
                        <Text style={styles.metaPillLabel}>기록 {budgetSummary.entryCount}건</Text>
                    </View>
                    <View style={styles.metaPill}>
                        <Text style={styles.metaPillLabel}>합계 기록일 {budgetSummary.daysWithExpenseCount}일</Text>
                    </View>
                    {averagePerDayLabel ? (
                        <View style={styles.metaPill}>
                            <Text style={styles.metaPillLabel}>일 평균 {averagePerDayLabel}</Text>
                        </View>
                    ) : null}
                </View>
            </Pressable>
        );
    }

    return (
        <View style={styles.summaryCard}>
            <View style={styles.summaryHeaderRow}>
                <View style={styles.summaryHeaderCopy}>
                    <Text style={styles.summaryLabel}>예산 요약</Text>
                    <Text style={styles.summaryCaption}>
                        {firstBudgetQuickAddDayId
                            ? '아직 기록된 지출이 없어요.'
                            : '일정을 추가하면 지출도 함께 정리돼요.'}
                    </Text>
                </View>
                {canEditContent ? (
                    <Pressable
                        accessibilityRole="button"
                        disabled={!canQuickAddBudget}
                        onPress={onOpenQuickBudgetExpenseComposer}
                        style={({ pressed }) => [
                            styles.summaryActionButton,
                            !canQuickAddBudget ? styles.summaryActionButtonDisabled : null,
                            pressed && canQuickAddBudget ? styles.summaryActionButtonPressed : null
                        ]}
                    >
                        <Text style={styles.summaryActionButtonText}>추가</Text>
                    </Pressable>
                ) : null}
            </View>
            <Text style={styles.summaryValue}>₩0</Text>
            <Text style={styles.listEmptyText}>지출 내역을 바로 추가해 예산 흐름을 기록해 보세요.</Text>
        </View>
    );
}

export function TripDetailPhotoSummarySection({
    canEditContent,
    canQuickAddMemory,
    detail,
    firstMemoryQuickAddTargetExists,
    onOpenPhotoGallery,
    onOpenQuickMemoryComposer,
    onOpenSummaryPhotoViewer,
    styles
}: PhotoSummarySectionProps) {
    if (detail.photoCount > 0) {
        const previewUrls = detail.photoPreviewUrls.length > 0
            ? detail.photoPreviewUrls
            : detail.photoGalleryUrls.slice(0, 3);

        return (
            <View style={styles.summaryCard}>
                <View style={styles.summaryHeaderRow}>
                    <View style={styles.summaryHeaderCopy}>
                        <Text style={styles.summaryLabel}>추억 사진</Text>
                        <Text style={styles.summaryCaption}>등록된 사진 {detail.photoCount}장</Text>
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        onPress={onOpenPhotoGallery}
                        style={({ pressed }) => [
                            styles.summaryActionButton,
                            pressed ? styles.summaryActionButtonPressed : null
                        ]}
                    >
                        <Text style={styles.summaryActionButtonText}>전체 보기</Text>
                    </Pressable>
                </View>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.photoStrip}
                >
                    {previewUrls.map((url, index) => (
                        <Pressable
                            key={`${detail.id}-trip-photo-${index}`}
                            accessibilityRole="button"
                            accessibilityLabel={`추억 사진 ${index + 1}번 보기`}
                            onPress={() => {
                                const galleryIndex = detail.photoGalleryUrls.indexOf(url);
                                onOpenSummaryPhotoViewer(galleryIndex >= 0 ? galleryIndex : index);
                            }}
                            style={({ pressed }) => [
                                styles.tripPhotoPreview,
                                index < previewUrls.length - 1 ? styles.tripPhotoPreviewSpaced : null,
                                pressed ? styles.tripPhotoPreviewPressed : null
                            ]}
                        >
                            <Image
                                source={buildCachedImageSource(url)}
                                style={styles.tripPhotoPreviewImage}
                            />
                        </Pressable>
                    ))}
                </ScrollView>
            </View>
        );
    }

    return (
        <View style={styles.summaryCard}>
            <View style={styles.summaryHeaderRow}>
                <View style={styles.summaryHeaderCopy}>
                    <Text style={styles.summaryLabel}>추억 사진</Text>
                    <Text style={styles.summaryCaption}>
                        {firstMemoryQuickAddTargetExists
                            ? '아직 등록된 추억 사진이 없어요.'
                            : '일정을 추가하면 추억 사진을 붙일 수 있어요.'}
                    </Text>
                </View>
                {canEditContent ? (
                    <Pressable
                        accessibilityRole="button"
                        disabled={!canQuickAddMemory}
                        onPress={onOpenQuickMemoryComposer}
                        style={({ pressed }) => [
                            styles.summaryActionButton,
                            !canQuickAddMemory ? styles.summaryActionButtonDisabled : null,
                            pressed && canQuickAddMemory ? styles.summaryActionButtonPressed : null
                        ]}
                    >
                        <Text style={styles.summaryActionButtonText}>추가</Text>
                    </Pressable>
                ) : null}
            </View>
            <Text style={styles.listEmptyText}>
                사진을 고르면 일정 카드의 추억으로 바로 저장돼요.
            </Text>
        </View>
    );
}
