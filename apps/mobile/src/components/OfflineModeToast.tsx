import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
    Animated,
    Easing,
    StyleSheet,
    Text
} from 'react-native';

import { type AppTheme, useAppTheme } from '@/theme';

type Props = {
    visible: boolean;
    message: string;
};

export function OfflineModeToast({ visible, message }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const opacity = React.useRef(new Animated.Value(0)).current;
    const translateY = React.useRef(new Animated.Value(8)).current;
    const [shouldRender, setShouldRender] = React.useState(visible);

    React.useEffect(() => {
        if (visible) {
            setShouldRender(true);
        }

        Animated.parallel([
            Animated.timing(opacity, {
                toValue: visible ? 1 : 0,
                duration: visible ? 220 : 180,
                easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
                useNativeDriver: true
            }),
            Animated.timing(translateY, {
                toValue: visible ? 0 : 8,
                duration: visible ? 220 : 180,
                easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
                useNativeDriver: true
            })
        ]).start(({ finished }) => {
            if (finished && !visible) {
                setShouldRender(false);
            }
        });
    }, [opacity, translateY, visible]);

    if (!shouldRender) {
        return null;
    }

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.card,
                {
                    opacity,
                    transform: [{ translateY }]
                }
            ]}
        >
            <Animated.View style={styles.iconBadge}>
                <MaterialCommunityIcons
                    color={theme.colors.accent}
                    name="wifi-off"
                    size={16}
                />
            </Animated.View>
            <Text style={styles.message}>{message}</Text>
        </Animated.View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    card: {
        minHeight: 44,
        width: '100%',
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        shadowColor: '#000',
        shadowOpacity: theme.mode === 'dark' ? 0.24 : 0.08,
        shadowRadius: 18,
        shadowOffset: {
            width: 0,
            height: 10
        }
    },
    iconBadge: {
        width: 28,
        height: 28,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center'
    },
    message: {
        flex: 1,
        color: theme.colors.textPrimary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.contentMedium
    }
});
