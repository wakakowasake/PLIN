import React from 'react';
import {
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlinIcon, type PlinIconName } from '@/components/PlinIcon';
import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';

type Props = {
    visible: boolean;
    dayLabel: string;
    dayDate: string;
    insertContextLabel?: string;
    canAddMemory: boolean;
    canAddBudget: boolean;
    canAddMemo: boolean;
    canQuickRoute: boolean;
    canCopyExisting: boolean;
    onClose(): void;
    onSelectNewPlace(): void;
    onSelectBudget(): void;
    onSelectMemory(): void;
    onSelectMemo(): void;
    onSelectQuickRoute(): void;
    onSelectCopyExisting(): void;
    onSelectManualTransit(): void;
};

type OptionTone = 'place' | 'budget' | 'memory' | 'memo' | 'route' | 'copy' | 'transit';
const MIN_ANDROID_SHEET_BOTTOM_INSET = 48;

type OptionTileProps = {
    iconName: PlinIconName;
    title: string;
    subtitle?: string;
    tone: OptionTone;
    disabled?: boolean;
    fullWidth?: boolean;
    onPress(): void;
};

function getToneColors(theme: AppTheme, tone: OptionTone) {
    if (tone === 'place') {
        return {
            card: theme.mode === 'dark' ? '#2b2418' : '#fff2de',
            border: theme.mode === 'dark' ? '#6c5530' : '#efc98e',
            bubble: theme.mode === 'dark' ? '#3c2e17' : '#ffe2b0',
            text: theme.mode === 'dark' ? '#ffd28a' : '#b76700'
        };
    }

    if (tone === 'memo') {
        return {
            card: theme.mode === 'dark' ? '#312816' : '#fff7d8',
            border: theme.mode === 'dark' ? '#7d6733' : '#e5c96f',
            bubble: theme.mode === 'dark' ? '#453614' : '#ffe89a',
            text: theme.mode === 'dark' ? '#f7d777' : '#9c6b00'
        };
    }

    if (tone === 'budget') {
        return {
            card: theme.mode === 'dark' ? '#1f3024' : '#e6f6ea',
            border: theme.mode === 'dark' ? '#446852' : '#a7d7b4',
            bubble: theme.mode === 'dark' ? '#294034' : '#cdeed7',
            text: theme.mode === 'dark' ? '#9fe0b5' : '#267a46'
        };
    }

    if (tone === 'memory') {
        return {
            card: theme.mode === 'dark' ? '#342322' : '#ffe9e3',
            border: theme.mode === 'dark' ? '#7d4e4a' : '#efb4a6',
            bubble: theme.mode === 'dark' ? '#4a2e2c' : '#ffd0c4',
            text: theme.mode === 'dark' ? '#ffb8a8' : '#b44d31'
        };
    }

    if (tone === 'route') {
        return {
            card: theme.mode === 'dark' ? '#1f2e34' : '#e5f3ff',
            border: theme.mode === 'dark' ? '#45616b' : '#9dc8e8',
            bubble: theme.mode === 'dark' ? '#23424c' : '#cce7ff',
            text: theme.mode === 'dark' ? '#9fd8ff' : '#155f8c'
        };
    }

    if (tone === 'copy') {
        return {
            card: theme.mode === 'dark' ? '#2a2134' : '#f1e8ff',
            border: theme.mode === 'dark' ? '#65527f' : '#c8afe8',
            bubble: theme.mode === 'dark' ? '#3b2b4f' : '#e0cbff',
            text: theme.mode === 'dark' ? '#cdb8ff' : '#6f43b1'
        };
    }

    return {
        card: theme.colors.accentSoft,
        border: theme.colors.accent,
        bubble: theme.mode === 'dark' ? '#4a3623' : '#e8d4b5',
        text: theme.colors.accent
    };
}

function OptionTile({
    iconName,
    title,
    subtitle,
    tone,
    disabled = false,
    fullWidth = false,
    onPress
}: OptionTileProps) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const colors = getToneColors(theme, tone);

    return (
        <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.tile,
                fullWidth ? styles.tileFullWidth : null,
                {
                    backgroundColor: colors.card
                },
                disabled ? styles.tileDisabled : null,
                pressed && !disabled ? styles.buttonPressed : null
            ]}
        >
            <View style={[styles.tileIconBubble, { backgroundColor: colors.bubble }]}>
                <PlinIcon color={colors.text} name={iconName} size={20} />
            </View>
            <Text style={styles.tileTitle}>{title}</Text>
            {subtitle ? (
                <Text style={styles.tileSubtitle}>
                    {subtitle}
                </Text>
            ) : null}
        </Pressable>
    );
}

export function TimelineInsertOptionsModal({
    visible,
    dayLabel,
    dayDate,
    insertContextLabel,
    canAddMemory,
    canAddBudget,
    canAddMemo,
    canQuickRoute,
    canCopyExisting,
    onClose,
    onSelectNewPlace,
    onSelectBudget,
    onSelectMemory,
    onSelectMemo,
    onSelectQuickRoute,
    onSelectCopyExisting,
    onSelectManualTransit
}: Props) {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const bottomInset = Platform.OS === 'android'
        ? Math.max(insets.bottom, MIN_ANDROID_SHEET_BOTTOM_INSET)
        : insets.bottom;
    const contentInsetStyle = React.useMemo(() => ({
        paddingBottom: bottomInset + theme.spacing.sm
    }), [bottomInset, theme.spacing.sm]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable
                    accessibilityRole="button"
                    onPress={onClose}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.sheet}>
                    <View style={styles.handle} />
                    <View style={styles.header}>
                        <View style={styles.headerCopy}>
                            <Text style={styles.headerLabel}>일정 추가</Text>
                            <Text style={styles.headerTitle}>어떤 일정을 추가할까요?</Text>
                            <Text style={styles.headerMeta}>
                                {dayLabel} · {dayDate}
                            </Text>
                            {insertContextLabel ? (
                                <Text style={styles.headerContext}>
                                    {insertContextLabel}
                                </Text>
                            ) : null}
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            onPress={onClose}
                            style={({ pressed }) => [
                                styles.closeButton,
                                pressed ? styles.buttonPressed : null
                            ]}
                        >
                            <Text style={styles.closeButtonText}>닫기</Text>
                        </Pressable>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[styles.content, contentInsetStyle]}
                    >
                        <View style={styles.grid}>
                            <OptionTile
                                iconName="map-pin-plus"
                                title="장소 추가"
                                subtitle="장소 검색으로 추가"
                                tone="place"
                                onPress={onSelectNewPlace}
                            />
                            <OptionTile
                                iconName="receipt"
                                title="예산 추가"
                                subtitle={canAddBudget ? '일정에 비용 기록하기' : '연결할 일정 카드가 필요해요'}
                                tone="budget"
                                disabled={!canAddBudget}
                                onPress={onSelectBudget}
                            />
                            <OptionTile
                                iconName="image-plus"
                                title="추억 추가"
                                subtitle={canAddMemory ? '위 일정에 연결하기' : '위에 일정 카드가 필요해요'}
                                tone="memory"
                                disabled={!canAddMemory}
                                onPress={onSelectMemory}
                            />
                            <OptionTile
                                iconName="notebook-pen"
                                title="메모"
                                subtitle={canAddMemo ? '위 일정에 메모 붙이기' : '위에 일정 카드가 필요해요'}
                                tone="memo"
                                disabled={!canAddMemo}
                                onPress={onSelectMemo}
                            />
                            <OptionTile
                                iconName="route"
                                title="자동 추천 경로"
                                subtitle={canQuickRoute ? '앞뒤 장소 기준으로 찾기' : '앞뒤 장소 카드가 필요해요'}
                                tone="route"
                                disabled={!canQuickRoute}
                                onPress={onSelectQuickRoute}
                            />
                            <OptionTile
                                iconName="copy"
                                title="기존 일정 복사"
                                subtitle={canCopyExisting ? '기존 일정에서 가져오기' : '가져올 일정이 없어요'}
                                tone="copy"
                                disabled={!canCopyExisting}
                                onPress={onSelectCopyExisting}
                            />
                        </View>

                        <OptionTile
                            iconName="train-front"
                            title="이동 수단 직접 추가"
                            subtitle="비행기 · 기차 · 전철 · 버스 · 도보 · 차량"
                            tone="transit"
                            fullWidth
                            onPress={onSelectManualTransit}
                        />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.28)'
    },
    sheet: {
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.contextualMax,
        borderTopLeftRadius: theme.radius.lg,
        borderTopRightRadius: theme.radius.lg,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden'
    },
    handle: {
        alignSelf: 'center',
        width: 48,
        height: 5,
        borderRadius: theme.radius.full,
        marginTop: theme.spacing.sm,
        backgroundColor: theme.colors.border
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.xs
    },
    headerCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    headerLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    headerTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 22,
        lineHeight: 28,
        fontFamily: theme.fonts.display
    },
    headerMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    headerContext: {
        marginTop: theme.spacing.micro,
        color: theme.colors.accent,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.semibold
    },
    closeButton: {
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    closeButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    content: {
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.md
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between'
    },
    tile: {
        width: '48.5%',
        minHeight: 96,
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center'
    },
    tileFullWidth: {
        width: '100%',
        minHeight: 78
    },
    tileDisabled: {
        opacity: 0.48
    },
    tileIconBubble: {
        width: 40,
        height: 40,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center'
    },
    tileTitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontSize: 14,
        lineHeight: 18,
        textAlign: 'center',
        fontFamily: theme.fonts.bold
    },
    tileSubtitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 11,
        lineHeight: 14,
        textAlign: 'center',
        fontFamily: theme.fonts.body
    },
    buttonPressed: {
        opacity: 0.88
    }
});
