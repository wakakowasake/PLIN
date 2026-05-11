import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
    Pressable,
    StyleSheet,
    type StyleProp,
    type ViewStyle
} from 'react-native';

import { type AppTheme, useAppTheme } from '@/theme';

type Props = {
    disabled?: boolean;
    onPress(): void;
    style?: StyleProp<ViewStyle>;
};

export function SheetBackButton({ disabled = false, onPress, style }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="뒤로 가기"
            disabled={disabled}
            hitSlop={8}
            onPress={onPress}
            style={({ pressed }) => [
                styles.button,
                disabled ? styles.buttonDisabled : null,
                pressed && !disabled ? styles.buttonPressed : null,
                style
            ]}
        >
            <MaterialCommunityIcons
                color={theme.colors.textPrimary}
                name="chevron-left"
                size={24}
            />
        </Pressable>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    button: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.sm,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted
    },
    buttonDisabled: {
        opacity: 0.55
    },
    buttonPressed: {
        opacity: 0.88
    }
});
