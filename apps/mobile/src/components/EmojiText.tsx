import React from 'react';
import {
    Platform,
    StyleSheet,
    Text,
    type TextProps,
    type TextStyle
} from 'react-native';

export const emojiSafeFontFamily = Platform.select({
    ios: 'Apple Color Emoji',
    android: 'sans-serif',
    default: undefined
});

const EMOJI_REGEX = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

export function containsEmojiText(value: string | null | undefined) {
    if (!value) {
        return false;
    }

    return EMOJI_REGEX.test(value);
}

function flattenText(children: React.ReactNode): string {
    if (children == null || typeof children === 'boolean') {
        return '';
    }

    if (typeof children === 'string' || typeof children === 'number') {
        return String(children);
    }

    if (Array.isArray(children)) {
        return children.map((child) => flattenText(child)).join('');
    }

    if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
        return flattenText(children.props.children);
    }

    return '';
}

export function EmojiText({ children, style, ...props }: TextProps) {
    const textValue = flattenText(children);
    const flattenedStyle = React.useMemo<TextStyle>(
        () => StyleSheet.flatten(style) || {},
        [style]
    );
    const outerStyle = React.useMemo<TextStyle>(() => {
        const { fontFamily: _fontFamily, fontWeight: _fontWeight, ...restStyle } = flattenedStyle;
        return restStyle;
    }, [flattenedStyle]);
    const emojiSafeStyle = React.useMemo<TextStyle>(() => ({
        fontFamily: emojiSafeFontFamily,
        fontWeight: undefined
    }), []);
    const segments = React.useMemo(() => {
        if (!containsEmojiText(textValue)) {
            return null;
        }

        const graphemes = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
            ? Array.from(
                new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(textValue),
                (entry) => entry.segment
            )
            : Array.from(textValue);

        const nextSegments: Array<{ text: string; isEmoji: boolean }> = [];

        graphemes.forEach((grapheme) => {
            const isEmoji = containsEmojiText(grapheme);
            const lastSegment = nextSegments[nextSegments.length - 1];

            if (lastSegment && lastSegment.isEmoji === isEmoji) {
                lastSegment.text += grapheme;
                return;
            }

            nextSegments.push({
                text: grapheme,
                isEmoji
            });
        });

        return nextSegments;
    }, [textValue]);

    if (!segments) {
        return (
            <Text {...props} style={style}>
                {children}
            </Text>
        );
    }

    return (
        <Text {...props} style={outerStyle}>
            {segments.map((segment, index) => (
                <Text
                    key={`emoji-segment-${index}`}
                    style={segment.isEmoji ? [outerStyle, emojiSafeStyle] : flattenedStyle}
                >
                    {segment.text}
                </Text>
            ))}
        </Text>
    );
}
