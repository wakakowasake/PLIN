import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { type AppTheme, useAppTheme } from '@/theme';

type Props = {
    uri?: string | null;
    label: string;
    size: number;
    textSize?: number;
    tone?: 'accent' | 'warning';
};

function getInitials(label: string) {
    const source = String(label || '').trim() || 'P';
    const parts = source.split(/\s+/).filter(Boolean);

    if (parts.length <= 1) {
        return source.slice(0, 1).toUpperCase();
    }

    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

export function AvatarImage({
    uri,
    label,
    size,
    textSize = Math.max(12, Math.round(size * 0.35)),
    tone = 'accent'
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const [hasError, setHasError] = React.useState(false);
    const safeUri = typeof uri === 'string' ? uri.trim() : '';
    const avatarSizeStyle = React.useMemo(() => ({
        width: size,
        height: size,
        borderRadius: size / 2
    }), [size]);
    const avatarImageStyle = React.useMemo(() => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.colors.surfaceMuted
    }), [size, theme.colors.surfaceMuted]);
    const avatarTextStyle = React.useMemo(() => ({
        fontSize: textSize
    }), [textSize]);

    React.useEffect(() => {
        setHasError(false);
    }, [safeUri]);

    if (!safeUri || hasError) {
        return (
            <View
                style={[
                    styles.fallback,
                    tone === 'warning' ? styles.fallbackWarning : styles.fallbackAccent,
                    avatarSizeStyle
                ]}
            >
                <Text
                    style={[
                        styles.fallbackText,
                        tone === 'warning' ? styles.fallbackTextWarning : styles.fallbackTextAccent,
                        avatarTextStyle
                    ]}
                >
                    {getInitials(label)}
                </Text>
            </View>
        );
    }

    return (
        <Image
            source={{ uri: safeUri }}
            onError={() => {
                setHasError(true);
            }}
            style={avatarImageStyle}
        />
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    fallback: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    fallbackAccent: {
        backgroundColor: theme.colors.accentSoft
    },
    fallbackWarning: {
        backgroundColor: theme.colors.warningSoft
    },
    fallbackText: {
        fontFamily: theme.fonts.bold
    },
    fallbackTextAccent: {
        color: theme.colors.accent
    },
    fallbackTextWarning: {
        color: theme.colors.warning
    }
});
