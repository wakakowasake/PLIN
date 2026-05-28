import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTimelineFocusTarget } from '@/types/trip';

type Props = {
    tripId: string;
    userId: string | null;
    selectedTarget: MobileTimelineFocusTarget | null;
    onSelectTarget(target: MobileTimelineFocusTarget): void;
};

export function TripWorkspaceMapPanel({
    tripId: _tripId,
    userId: _userId,
    selectedTarget: _selectedTarget,
    onSelectTarget: _onSelectTarget
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <View style={styles.shell}>
            <MaterialCommunityIcons name="map-outline" size={32} color={theme.colors.textSecondary} />
            <Text style={styles.title}>지도는 웹에서 열려요</Text>
            <Text style={styles.description}>
                PC 웹 작업공간에서는 일정 장소를 지도 핀으로 함께 볼 수 있어요.
            </Text>
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    shell: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.surface
    },
    title: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold,
        fontSize: 16,
        lineHeight: 22,
        textAlign: 'center'
    },
    description: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body,
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center'
    }
});
