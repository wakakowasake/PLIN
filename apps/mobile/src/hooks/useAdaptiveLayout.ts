import { useWindowDimensions } from 'react-native';

export type AdaptiveLayoutMode = 'phone' | 'tablet';
export type AdaptiveOrientation = 'portrait' | 'landscape';

export const TABLET_MIN_WIDTH = 768;
export const TABLET_MIN_PANE_WIDTH = 360;

export function useAdaptiveLayout() {
    const { width, height, scale, fontScale } = useWindowDimensions();
    const mode: AdaptiveLayoutMode = width >= TABLET_MIN_WIDTH ? 'tablet' : 'phone';
    const orientation: AdaptiveOrientation = width >= height ? 'landscape' : 'portrait';

    return {
        width,
        height,
        scale,
        fontScale,
        mode,
        orientation,
        isTablet: mode === 'tablet',
        isPhone: mode === 'phone',
        paneMinWidth: TABLET_MIN_PANE_WIDTH
    };
}
