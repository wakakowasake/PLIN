import React from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { type AppTheme, useAppTheme } from '@/theme';

type Props = {
    title?: string;
    message?: string;
    hint?: string;
    fullscreen?: boolean;
};

export function LoadingView({ title = '불러오는 중', fullscreen = true }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const spinValue = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        const loop = Animated.loop(Animated.timing(spinValue, {
            toValue: 1,
            duration: 900,
            easing: Easing.linear,
            useNativeDriver: true
        }));

        loop.start();

        return () => {
            loop.stop();
            spinValue.stopAnimation();
            spinValue.setValue(0);
        };
    }, [spinValue]);

    const spinnerRotation = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    return (
        <View style={fullscreen ? styles.fullscreenContainer : styles.inlineContainer}>
            <View
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={title}
                style={styles.spinnerWrap}
            >
                <Animated.View
                    style={[
                        styles.spinnerRing,
                        {
                            transform: [{ rotate: spinnerRotation }]
                        }
                    ]}
                />
            </View>
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    fullscreenContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background
    },
    inlineContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.md
    },
    spinnerWrap: {
        width: 64,
        height: 64,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accentSoft
    },
    spinnerRing: {
        width: 32,
        height: 32,
        borderRadius: theme.radius.md,
        borderWidth: theme.spacing.micro,
        borderColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(36, 48, 71, 0.12)',
        borderTopColor: theme.colors.accent,
        borderRightColor: theme.colors.accent
    }
});
