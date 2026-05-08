import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

type Props = {
    colors: string[];
    locations?: number[];
    style?: StyleProp<ViewStyle>;
};

function parseGradientStopColor(color: string) {
    const normalizedColor = String(color || '').trim();
    const rgbaMatch = normalizedColor.match(
        /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i
    );

    if (!rgbaMatch) {
        return {
            stopColor: normalizedColor || '#000000',
            stopOpacity: 1
        };
    }

    return {
        stopColor: `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`,
        stopOpacity: rgbaMatch[4] === undefined ? 1 : Number(rgbaMatch[4])
    };
}

export function BottomImageGradient({ colors, locations, style }: Props) {
    const gradientId = React.useMemo(
        () => `bottom-image-gradient-${Math.random().toString(36).slice(2, 10)}`,
        []
    );

    return (
        <View pointerEvents="none" style={style}>
            <Svg height="100%" preserveAspectRatio="none" style={styles.fill} width="100%">
                <Defs>
                    <SvgLinearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                        {colors.map((color, index) => {
                            const { stopColor, stopOpacity } = parseGradientStopColor(color);
                            const offset = locations?.[index] ?? (colors.length === 1 ? 1 : index / (colors.length - 1));

                            return (
                                <Stop
                                    key={`${gradientId}-${index}`}
                                    offset={`${Math.max(0, Math.min(offset, 1)) * 100}%`}
                                    stopColor={stopColor}
                                    stopOpacity={stopOpacity}
                                />
                            );
                        })}
                    </SvgLinearGradient>
                </Defs>
                <Rect fill={`url(#${gradientId})`} height="100%" width="100%" x="0" y="0" />
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    fill: {
        ...StyleSheet.absoluteFillObject
    }
});
