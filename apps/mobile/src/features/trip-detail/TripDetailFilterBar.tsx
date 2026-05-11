import React from 'react';
import {
    Pressable,
    ScrollView,
    Text,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
    View
} from 'react-native';

export type TripDetailFilterChip = {
    key: string;
    label: string;
};

type TripDetailFilterBarStyles = {
    filterChip: StyleProp<ViewStyle>;
    filterChipActive: StyleProp<ViewStyle>;
    filterChipBar: StyleProp<ViewStyle>;
    filterChipPressed: StyleProp<ViewStyle>;
    filterChipRow: StyleProp<ViewStyle>;
    filterChipSpaced: StyleProp<ViewStyle>;
    filterChipText: StyleProp<TextStyle>;
    filterChipTextActive: StyleProp<TextStyle>;
};

type Props = {
    chips: TripDetailFilterChip[];
    selectedKey: string;
    scrollRef: React.RefObject<ScrollView | null>;
    styles: TripDetailFilterBarStyles;
    onSelect(key: string): void;
};

export function TripDetailFilterBar({
    chips,
    selectedKey,
    scrollRef,
    styles,
    onSelect
}: Props) {
    return (
        <View style={styles.filterChipBar}>
            <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipRow}
            >
                {chips.map((chip, index) => {
                    const isActive = selectedKey === chip.key;

                    return (
                        <Pressable
                            key={chip.key}
                            accessibilityRole="button"
                            onPress={() => {
                                onSelect(chip.key);
                            }}
                            style={({ pressed }) => [
                                styles.filterChip,
                                isActive ? styles.filterChipActive : null,
                                pressed ? styles.filterChipPressed : null,
                                index < chips.length - 1 ? styles.filterChipSpaced : null
                            ]}
                        >
                            <Text
                                style={[
                                    styles.filterChipText,
                                    isActive ? styles.filterChipTextActive : null
                                ]}
                            >
                                {chip.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
}
