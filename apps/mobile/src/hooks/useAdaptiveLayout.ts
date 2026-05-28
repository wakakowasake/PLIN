import { useWindowDimensions } from 'react-native';

export type AdaptiveLayoutMode = 'phone' | 'tablet' | 'desktop';
export type AdaptiveOrientation = 'portrait' | 'landscape';

export const TABLET_MIN_WIDTH = 768;
export const DESKTOP_MIN_WIDTH = 1180;
export const TABLET_MIN_PANE_WIDTH = 360;
export const DESKTOP_LEFT_PANE_WIDTH = 420;
export const DESKTOP_RIGHT_PANE_WIDTH = 360;

export function useAdaptiveLayout() {
    const { width, height, scale, fontScale } = useWindowDimensions();
    const mode: AdaptiveLayoutMode = width >= DESKTOP_MIN_WIDTH
        ? 'desktop'
        : width >= TABLET_MIN_WIDTH
            ? 'tablet'
            : 'phone';
    const orientation: AdaptiveOrientation = width >= height ? 'landscape' : 'portrait';

    return {
        width,
        height,
        scale,
        fontScale,
        mode,
        orientation,
        isTablet: mode !== 'phone',
        isDesktop: mode === 'desktop',
        isPhone: mode === 'phone',
        paneMinWidth: TABLET_MIN_PANE_WIDTH,
        desktopLeftPaneWidth: DESKTOP_LEFT_PANE_WIDTH,
        desktopRightPaneWidth: DESKTOP_RIGHT_PANE_WIDTH
    };
}
