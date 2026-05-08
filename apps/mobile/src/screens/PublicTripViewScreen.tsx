import React from 'react';
import {
    ActivityIndicator,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import type { RootStackParamList } from '@/navigation/RootNavigator';
import { type AppTheme, useAppTheme } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PublicTripView'>;

const PUBLIC_WEB_BASE_URL = 'https://plin.ink';

function buildPublicTripUrl(token: string) {
    return `${PUBLIC_WEB_BASE_URL}/p/${encodeURIComponent(token)}`;
}

export function PublicTripViewScreen({ route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const token = String(route.params?.token || '').trim();
    const publicTripUrl = React.useMemo(() => buildPublicTripUrl(token), [token]);
    const [isLoading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [reloadKey, setReloadKey] = React.useState(0);

    const handleOpenInBrowser = React.useCallback(async () => {
        await Linking.openURL(publicTripUrl);
    }, [publicTripUrl]);

    const handleRetry = React.useCallback(() => {
        setError(null);
        setLoading(true);
        setReloadKey((current) => current + 1);
    }, []);

    if (!token) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.centerState}>
                    <Text style={styles.title}>공유 링크를 열 수 없어요</Text>
                    <Text style={styles.description}>링크 정보가 비어 있어요. 공유받은 링크를 다시 확인해 주세요.</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (Platform.OS === 'web') {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.centerState}>
                    <Text style={styles.title}>공유 여행 보기</Text>
                    <Text style={styles.description}>웹에서는 새 탭으로 공유 여행을 열어 주세요.</Text>
                    <Pressable
                        accessibilityRole="button"
                        onPress={handleOpenInBrowser}
                        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
                    >
                        <Text style={styles.buttonText}>웹에서 열기</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <View style={styles.container}>
                {isLoading ? (
                    <View style={styles.loadingBar}>
                        <ActivityIndicator color={theme.colors.accent} size="small" />
                        <Text style={styles.loadingText}>공유 여행을 여는 중이에요</Text>
                    </View>
                ) : null}
                {error ? (
                    <View style={styles.errorBar}>
                        <Text style={styles.errorText}>{error}</Text>
                        <View style={styles.errorActionRow}>
                            <Pressable
                                accessibilityRole="button"
                                onPress={handleRetry}
                                style={({ pressed }) => [styles.inlineButton, styles.inlineButtonPrimary, pressed ? styles.buttonPressed : null]}
                            >
                                <Text style={styles.inlineButtonPrimaryText}>다시 시도</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                onPress={handleOpenInBrowser}
                                style={({ pressed }) => [styles.inlineButton, pressed ? styles.buttonPressed : null]}
                            >
                                <Text style={styles.inlineButtonText}>브라우저로 열기</Text>
                            </Pressable>
                        </View>
                    </View>
                ) : null}
                <WebView
                    key={reloadKey}
                    source={{ uri: publicTripUrl }}
                    style={styles.webView}
                    startInLoadingState
                    onLoadStart={() => {
                        setError(null);
                        setLoading(true);
                    }}
                    onLoadEnd={() => {
                        setLoading(false);
                    }}
                    onError={() => {
                        setLoading(false);
                        setError('앱 안에서 공유 여행을 불러오지 못했어요.');
                    }}
                    onHttpError={(event) => {
                        setLoading(false);
                        const statusCode = event.nativeEvent.statusCode;
                        setError(`공유 여행을 불러오지 못했어요. (${statusCode})`);
                    }}
                />
            </View>
        </SafeAreaView>
    );
}

function createStyles(theme: AppTheme) {
    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: theme.colors.background
        },
        container: {
            flex: 1,
            backgroundColor: theme.colors.background
        },
        webView: {
            flex: 1,
            backgroundColor: theme.colors.background
        },
        loadingBar: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xs,
            backgroundColor: theme.colors.surface
        },
        loadingText: {
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.medium
        },
        errorBar: {
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xs,
            backgroundColor: theme.colors.warningSoft,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: theme.colors.border
        },
        errorText: {
            color: theme.colors.warning,
            lineHeight: 20
        },
        errorActionRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.xs,
            marginTop: theme.spacing.xs
        },
        inlineButton: {
            alignSelf: 'flex-start',
            borderRadius: theme.radius.sm,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xs,
            backgroundColor: theme.colors.surface
        },
        inlineButtonPrimary: {
            backgroundColor: theme.colors.accent
        },
        inlineButtonText: {
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.semibold
        },
        inlineButtonPrimaryText: {
            color: '#FFFFFF',
            fontFamily: theme.fonts.semibold
        },
        centerState: {
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.md
        },
        title: {
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.display,
            fontSize: 26,
            lineHeight: 32,
            textAlign: 'center'
        },
        description: {
            marginTop: theme.spacing.xs,
            color: theme.colors.textSecondary,
            lineHeight: 22,
            textAlign: 'center'
        },
        button: {
            marginTop: theme.spacing.md,
            minHeight: 48,
            borderRadius: theme.radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent
        },
        buttonText: {
            color: '#FFFFFF',
            fontFamily: theme.fonts.semibold
        },
        buttonPressed: {
            opacity: 0.86
        }
    });
}
