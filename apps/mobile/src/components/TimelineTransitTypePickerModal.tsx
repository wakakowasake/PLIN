import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTransitTypeMeta } from '@shared/features/transit/transit-item-helpers.js';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import type { MobileTimelineManualTransitType } from '@/types/trip';

type TransitIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TRANSIT_TYPE_OPTIONS: Array<{ type: MobileTimelineManualTransitType; iconName: TransitIconName }> = [
    { type: 'airplane', iconName: 'airplane' },
    { type: 'train', iconName: 'train' },
    { type: 'subway', iconName: 'subway' },
    { type: 'bus', iconName: 'bus' },
    { type: 'taxi', iconName: 'taxi' },
    { type: 'bike', iconName: 'bike' },
    { type: 'boat', iconName: 'ferry' },
    { type: 'walk', iconName: 'walk' },
    { type: 'car', iconName: 'car' }
];

type Props = {
    visible: boolean;
    dayLabel: string;
    dayDate: string;
    onClose(): void;
    onSelect(type: MobileTimelineManualTransitType): void;
};

export function TimelineTransitTypePickerModal({
    visible,
    dayLabel,
    dayDate,
    onClose,
    onSelect
}: Props) {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const contentInsetStyle = React.useMemo(() => ({
        paddingBottom: insets.bottom + theme.spacing.md
    }), [insets.bottom, theme.spacing.md]);

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
                            <Text style={styles.headerLabel}>이동 수단 직접 추가</Text>
                            <Text style={styles.headerTitle}>어떤 수단으로 이동할까요?</Text>
                            <Text style={styles.headerMeta}>
                                {dayLabel} · {dayDate}
                            </Text>
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
                            {TRANSIT_TYPE_OPTIONS.map(({ type, iconName }) => {
                                const meta = getTransitTypeMeta(type);

                                return (
                                    <Pressable
                                        key={type}
                                        accessibilityRole="button"
                                        onPress={() => {
                                            onSelect(type);
                                        }}
                                        style={({ pressed }) => [
                                            styles.tile,
                                            pressed ? styles.buttonPressed : null
                                        ]}
                                    >
                                        <View style={styles.iconBubble}>
                                            <MaterialCommunityIcons color={theme.colors.accent} name={iconName} size={22} />
                                        </View>
                                        <Text style={styles.tileTitle}>{meta.tag}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
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
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.pickerMax,
        borderTopLeftRadius: theme.radius.lg,
        borderTopRightRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden'
    },
    handle: {
        alignSelf: 'center',
        width: 48,
        height: 5,
        borderRadius: theme.radius.full,
        marginTop: theme.spacing.xs,
        backgroundColor: theme.colors.border
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
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
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.sm
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between'
    },
    tile: {
        width: '31.5%',
        minHeight: 96,
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.micro,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        alignItems: 'center',
        justifyContent: 'center'
    },
    iconBubble: {
        width: 44,
        height: 44,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    tileTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 13,
        textAlign: 'center',
        fontFamily: theme.fonts.bold
    },
    buttonPressed: {
        opacity: 0.88
    }
});
