import React from 'react';
import {
    type StyleProp,
    type ViewStyle,
    View
} from 'react-native';

type TripDetailExtrasSectionStyles = {
    bottomListStack: StyleProp<ViewStyle>;
    bottomSummaryStack: StyleProp<ViewStyle>;
    extraContentStack: StyleProp<ViewStyle>;
};

type Props = {
    budgetSummarySection: React.ReactNode;
    checklistSection: React.ReactNode;
    photoSummarySection: React.ReactNode;
    shoppingListSection: React.ReactNode;
    styles: TripDetailExtrasSectionStyles;
    onLayout(y: number): void;
};

export function TripDetailExtrasSection({
    budgetSummarySection,
    checklistSection,
    photoSummarySection,
    shoppingListSection,
    styles,
    onLayout
}: Props) {
    return (
        <View
            onLayout={(event) => {
                onLayout(event.nativeEvent.layout.y);
            }}
            style={styles.extraContentStack}
        >
            <View style={styles.bottomSummaryStack}>
                {photoSummarySection}
                {budgetSummarySection}
            </View>
            <View style={styles.bottomListStack}>
                {checklistSection}
                {shoppingListSection}
            </View>
        </View>
    );
}
