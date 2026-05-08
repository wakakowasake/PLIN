import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

const THEME_PREFERENCE_STORAGE_KEY = 'plin:settings:dark-mode';
const FONT_PRESET_STORAGE_KEY = 'plin:settings:font-preset';

export type FontPreset = 'pretendard' | 'memoment';

type ThemeMode = 'light' | 'dark';
type AppFontTokens = {
    body: string;
    medium: string;
    semibold: string;
    bold: string;
    display: string;
    heading: string;
    content: string;
    contentMedium: string;
    contentSemibold: string;
    contentBold: string;
};

const DEFAULT_FONT_PRESET: FontPreset = 'pretendard';

const fontPresetTokens: Record<FontPreset, AppFontTokens> = {
    pretendard: {
        body: 'PretendardRegular',
        medium: 'PretendardMedium',
        semibold: 'PretendardSemiBold',
        bold: 'PretendardBold',
        display: 'PretendardExtraBold',
        heading: 'PretendardBold',
        content: 'PretendardRegular',
        contentMedium: 'PretendardMedium',
        contentSemibold: 'PretendardSemiBold',
        contentBold: 'PretendardBold'
    },
    memoment: {
        body: 'MemomentKkukkukk',
        medium: 'MemomentKkukkukk',
        semibold: 'MemomentKkukkukk',
        bold: 'MemomentKkukkukk',
        display: 'MemomentKkukkukk',
        heading: 'MemomentKkukkukk',
        content: 'MemomentKkukkukk',
        contentMedium: 'MemomentKkukkukk',
        contentSemibold: 'MemomentKkukkukk',
        contentBold: 'MemomentKkukkukk'
    }
};

function normalizeFontPreset(value: string | null): FontPreset | null {
    if (value === 'pretendard' || value === 'memoment') {
        return value;
    }

    if (value === 'freesentation') {
        return 'pretendard';
    }

    return null;
}

const sharedTheme = {
    spacing: {
        micro: 4,
        xs: 8,
        sm: 16,
        md: 24,
        lg: 32,
        xl: 40,
        xxl: 48,
        xxxl: 64
    },
    radius: {
        xs: 4,
        sm: 8,
        md: 16,
        lg: 24,
        xl: 32,
        full: 999
    }
} as const;

const lightColors = {
    background: '#FFFFFF',
    surface: '#F7F8F9',
    surfaceMuted: '#F3F4F5',
    border: '#DCDEE3',
    textPrimary: '#1A1C20',
    textSecondary: '#868B94',
    accent: '#FF6600',
    accentStrong: '#E84500',
    accentSoft: '#FFF2EC',
    warning: '#F21E16',
    warningSoft: '#FDF2F2'
} as const;

const darkColors = {
    background: '#121212',
    surface: '#25272C',
    surfaceMuted: '#2C2E34',
    border: '#3E4145',
    textPrimary: '#F3F4F5',
    textSecondary: '#B0B3BA',
    accent: '#FF6600',
    accentStrong: '#F75900',
    accentSoft: '#31241F',
    warning: '#F73526',
    warningSoft: '#322323'
} as const;

function createTheme(mode: ThemeMode, fontPreset: FontPreset) {
    return {
        ...sharedTheme,
        mode,
        fontPreset,
        fonts: fontPresetTokens[fontPreset],
        colors: mode === 'dark' ? darkColors : lightColors
    } as const;
}

export const lightTheme = createTheme('light', DEFAULT_FONT_PRESET);
export const darkTheme = createTheme('dark', DEFAULT_FONT_PRESET);

export type AppTheme = ReturnType<typeof createTheme>;

type ThemeContextValue = {
    theme: AppTheme;
    isDarkModeEnabled: boolean;
    fontPreset: FontPreset;
    isThemePreferenceLoading: boolean;
    setDarkModeEnabled(nextValue: boolean): Promise<void>;
    setFontPreset(nextValue: FontPreset): Promise<void>;
};

const ThemeContext = React.createContext<ThemeContextValue>({
    theme: createTheme('light', DEFAULT_FONT_PRESET),
    isDarkModeEnabled: false,
    fontPreset: DEFAULT_FONT_PRESET,
    isThemePreferenceLoading: true,
    setDarkModeEnabled: async () => {},
    setFontPreset: async () => {}
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [isDarkModeEnabled, setIsDarkModeEnabledState] = React.useState(false);
    const [fontPreset, setFontPresetState] = React.useState<FontPreset>(DEFAULT_FONT_PRESET);
    const [isThemePreferenceLoading, setIsThemePreferenceLoading] = React.useState(true);

    React.useEffect(() => {
        let isMounted = true;

        void Promise.all([
            AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY),
            AsyncStorage.getItem(FONT_PRESET_STORAGE_KEY)
        ])
            .then(([storedDarkModeValue, storedFontPresetValue]) => {
                if (!isMounted) {
                    return;
                }

                setIsDarkModeEnabledState(storedDarkModeValue === 'true');
                setFontPresetState(normalizeFontPreset(storedFontPresetValue) ?? DEFAULT_FONT_PRESET);
            })
            .finally(() => {
                if (isMounted) {
                    setIsThemePreferenceLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const setDarkModeEnabled = React.useCallback(async (nextValue: boolean) => {
        const previousValue = isDarkModeEnabled;
        setIsDarkModeEnabledState(nextValue);

        try {
            await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, String(nextValue));
        } catch {
            setIsDarkModeEnabledState(previousValue);
        }
    }, [isDarkModeEnabled]);

    const setFontPreset = React.useCallback(async (nextValue: FontPreset) => {
        const previousValue = fontPreset;
        setFontPresetState(nextValue);

        try {
            await AsyncStorage.setItem(FONT_PRESET_STORAGE_KEY, nextValue);
        } catch {
            setFontPresetState(previousValue);
        }
    }, [fontPreset]);

    const value = React.useMemo<ThemeContextValue>(() => ({
        theme: createTheme(isDarkModeEnabled ? 'dark' : 'light', fontPreset),
        isDarkModeEnabled,
        fontPreset,
        isThemePreferenceLoading,
        setDarkModeEnabled,
        setFontPreset
    }), [fontPreset, isDarkModeEnabled, isThemePreferenceLoading, setDarkModeEnabled, setFontPreset]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useAppTheme() {
    return React.useContext(ThemeContext).theme;
}

export function useThemePreference() {
    return React.useContext(ThemeContext);
}

export const theme = createTheme('light', DEFAULT_FONT_PRESET);
