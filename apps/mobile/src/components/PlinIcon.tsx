import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { StyleProp, ViewStyle } from 'react-native';

/*
Lucide icon path data.
ISC License
Copyright (c) 2026 Lucide Icons and Contributors
Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.
*/

type IconNode =
    | { type: 'path'; d: string }
    | { type: 'circle'; cx: number; cy: number; r: number }
    | { type: 'rect'; x: number; y: number; width: number; height: number; rx?: number; ry?: number };

const ICON_NODES = {
    'map-pin-plus': [
        { type: 'path', d: 'M19.914 11.105A7.298 7.298 0 0 0 20 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32 32 0 0 0 .824-.738' },
        { type: 'circle', cx: 12, cy: 10, r: 3 },
        { type: 'path', d: 'M16 18h6' },
        { type: 'path', d: 'M19 15v6' }
    ],
    receipt: [
        { type: 'path', d: 'M12 17V7' },
        { type: 'path', d: 'M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8' },
        { type: 'path', d: 'M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z' }
    ],
    'image-plus': [
        { type: 'path', d: 'M16 5h6' },
        { type: 'path', d: 'M19 2v6' },
        { type: 'path', d: 'M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5' },
        { type: 'path', d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' },
        { type: 'circle', cx: 9, cy: 9, r: 2 }
    ],
    'notebook-pen': [
        { type: 'path', d: 'M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4' },
        { type: 'path', d: 'M2 6h4' },
        { type: 'path', d: 'M2 10h4' },
        { type: 'path', d: 'M2 14h4' },
        { type: 'path', d: 'M2 18h4' },
        { type: 'path', d: 'M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z' }
    ],
    route: [
        { type: 'circle', cx: 6, cy: 19, r: 3 },
        { type: 'path', d: 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15' },
        { type: 'circle', cx: 18, cy: 5, r: 3 }
    ],
    copy: [
        { type: 'rect', x: 8, y: 8, width: 14, height: 14, rx: 2, ry: 2 },
        { type: 'path', d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }
    ],
    'train-front': [
        { type: 'path', d: 'M8 3.1V7a4 4 0 0 0 8 0V3.1' },
        { type: 'path', d: 'm9 15-1-1' },
        { type: 'path', d: 'm15 15 1-1' },
        { type: 'path', d: 'M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z' },
        { type: 'path', d: 'm8 19-2 3' },
        { type: 'path', d: 'm16 19 2 3' }
    ],
    'cloud-sync': [
        { type: 'path', d: 'm17 18-1.535 1.605a5 5 0 0 1-8-1.5' },
        { type: 'path', d: 'M17 22v-4h-4' },
        { type: 'path', d: 'M20.996 15.251A4.5 4.5 0 0 0 17.495 8h-1.79a7 7 0 1 0-12.709 5.607' },
        { type: 'path', d: 'M7 10v4h4' },
        { type: 'path', d: 'm7 14 1.535-1.605a5 5 0 0 1 8 1.5' }
    ],
    save: [
        { type: 'path', d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' },
        { type: 'path', d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' },
        { type: 'path', d: 'M7 3v4a1 1 0 0 0 1 1h7' }
    ],
    'circle-check': [
        { type: 'circle', cx: 12, cy: 12, r: 10 },
        { type: 'path', d: 'm9 12 2 2 4-4' }
    ],
    'wifi-off': [
        { type: 'path', d: 'M12 20h.01' },
        { type: 'path', d: 'M8.5 16.429a5 5 0 0 1 7 0' },
        { type: 'path', d: 'M5 12.859a10 10 0 0 1 5.17-2.69' },
        { type: 'path', d: 'M19 12.859a10 10 0 0 0-2.007-1.523' },
        { type: 'path', d: 'M2 8.82a15 15 0 0 1 4.177-2.643' },
        { type: 'path', d: 'M22 8.82a15 15 0 0 0-11.288-3.764' },
        { type: 'path', d: 'm2 2 20 20' }
    ],
    'eye-off': [
        { type: 'path', d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49' },
        { type: 'path', d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' },
        { type: 'path', d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143' },
        { type: 'path', d: 'm2 2 20 20' }
    ],
    pencil: [
        { type: 'path', d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' },
        { type: 'path', d: 'm15 5 4 4' }
    ],
    sparkles: [
        { type: 'path', d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' },
        { type: 'path', d: 'M20 2v4' },
        { type: 'path', d: 'M22 4h-4' },
        { type: 'circle', cx: 4, cy: 20, r: 2 }
    ]
} as const satisfies Record<string, readonly IconNode[]>;

export type PlinIconName = keyof typeof ICON_NODES;

type Props = {
    name: PlinIconName;
    size?: number;
    color: string;
    strokeWidth?: number;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
};

export function PlinIcon({
    name,
    size = 24,
    color,
    strokeWidth = 2,
    style,
    accessibilityLabel
}: Props) {
    const nodes = ICON_NODES[name];

    return (
        <Svg
            accessible={Boolean(accessibilityLabel)}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole={accessibilityLabel ? 'image' : undefined}
            fill="none"
            height={size}
            style={style}
            viewBox="0 0 24 24"
            width={size}
        >
            {nodes.map((node, index) => {
                const nodeKey = `${node.type}-${index}`;
                const commonProps = {
                    stroke: color,
                    strokeLinecap: 'round' as const,
                    strokeLinejoin: 'round' as const,
                    strokeWidth
                };

                if (node.type === 'circle') {
                    return (
                        <Circle
                            key={nodeKey}
                            {...commonProps}
                            cx={node.cx}
                            cy={node.cy}
                            r={node.r}
                        />
                    );
                }

                if (node.type === 'rect') {
                    return (
                        <Rect
                            key={nodeKey}
                            {...commonProps}
                            height={node.height}
                            rx={node.rx}
                            ry={node.ry}
                            width={node.width}
                            x={node.x}
                            y={node.y}
                        />
                    );
                }

                return <Path key={nodeKey} {...commonProps} d={node.d} />;
            })}
        </Svg>
    );
}
