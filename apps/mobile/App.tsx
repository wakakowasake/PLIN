import 'react-native-gesture-handler';

import React from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AdaptersProvider } from './src/adapters/AdaptersProvider';
import { getMobileRuntimeGateState } from './src/config/mobile-runtime-config';
import { FeedbackProvider } from './src/feedback';
import { RootNavigator } from './src/navigation/RootNavigator';
import { RuntimeConfigErrorScreen } from './src/screens/RuntimeConfigErrorScreen';
import { ConnectivityProvider } from './src/state/connectivity-store';
import { SessionStoreProvider } from './src/state/session-store';
import { ThemeProvider, useAppTheme } from './src/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function AppRoot() {
    const theme = useAppTheme();
    const runtimeGate = React.useMemo(() => getMobileRuntimeGateState(), []);

    React.useEffect(() => {
        if (!runtimeGate.isBlocked) {
            return;
        }

        void SplashScreen.hideAsync().catch(() => {});
    }, [runtimeGate.isBlocked]);

    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <SafeAreaProvider>
                <FeedbackProvider>
                    <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
                    {runtimeGate.isBlocked ? (
                        <RuntimeConfigErrorScreen
                            title={runtimeGate.title || '앱 설정을 확인해 주세요.'}
                            description={runtimeGate.description || '앱 설정을 확인하지 못했어요.'}
                            supportText={runtimeGate.supportText}
                        />
                    ) : (
                        <AdaptersProvider>
                            <ConnectivityProvider>
                                <SessionStoreProvider>
                                    <RootNavigator />
                                </SessionStoreProvider>
                            </ConnectivityProvider>
                        </AdaptersProvider>
                    )}
                </FeedbackProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

export default function App() {
    const [fontsLoaded, fontLoadError] = useFonts({
        ...Ionicons.font,
        ...MaterialCommunityIcons.font,
        PretendardRegular: require('./assets/fonts/Pretendard-Regular.otf'),
        PretendardMedium: require('./assets/fonts/Pretendard-Medium.otf'),
        PretendardSemiBold: require('./assets/fonts/Pretendard-SemiBold.otf'),
        PretendardBold: require('./assets/fonts/Pretendard-Bold.otf'),
        PretendardExtraBold: require('./assets/fonts/Pretendard-ExtraBold.otf'),
        MemomentKkukkukk: require('./assets/fonts/MemomentKkukkukk.ttf')
    });

    if (!fontsLoaded && !fontLoadError) {
        return null;
    }

    return (
        <ThemeProvider>
            <AppRoot />
        </ThemeProvider>
    );
}
