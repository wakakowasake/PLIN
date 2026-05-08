import React from 'react';
import {
    findNodeHandle,
    Keyboard,
    type KeyboardEvent,
    Platform,
    ScrollView,
    type TextInputProps,
    UIManager,
    useWindowDimensions
} from 'react-native';

type FocusEvent = Parameters<NonNullable<TextInputProps['onFocus']>>[0];
type FocusHandler = NonNullable<TextInputProps['onFocus']>;

type ScrollResponderHandle = {
    scrollResponderScrollNativeHandleToKeyboard?: (
        nodeHandle: number,
        additionalOffset?: number,
        preventNegativeScrollOffset?: boolean
    ) => void;
};

type KeyboardAwareScrollViewHandle = ScrollView & {
    getScrollResponder?: () => ScrollResponderHandle | null;
};

const FOCUSED_INPUT_TOP_RATIO = 0.1;
const FOCUSED_INPUT_MIN_TOP_OFFSET = 72;
const FOCUSED_INPUT_MAX_TOP_OFFSET = 112;
const KEYBOARD_SCROLL_SPACE_RATIO = 0.82;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function useKeyboardAwareInputScroll(extraOffset = 96) {
    const { height: windowHeight } = useWindowDimensions();
    const scrollRef = React.useRef<ScrollView | null>(null);
    const focusedTargetRef = React.useRef<number | null>(null);
    const retryTimeoutsRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
    const [keyboardBottomInset, setKeyboardBottomInset] = React.useState(0);
    const focusedInputTopOffset = React.useMemo(() => clamp(
        Math.round(windowHeight * FOCUSED_INPUT_TOP_RATIO),
        FOCUSED_INPUT_MIN_TOP_OFFSET,
        FOCUSED_INPUT_MAX_TOP_OFFSET
    ), [windowHeight]);
    const keyboardScrollSpace = React.useMemo(() => (
        Math.max(extraOffset, Math.round(windowHeight * KEYBOARD_SCROLL_SPACE_RATIO))
    ), [extraOffset, windowHeight]);

    const clearRetryTimeouts = React.useCallback(() => {
        retryTimeoutsRef.current.forEach((timeoutId) => {
            clearTimeout(timeoutId);
        });
        retryTimeoutsRef.current = [];
    }, []);

    const fallbackScrollToKeyboard = React.useCallback((targetNode: number) => {
        const responder = (scrollRef.current as KeyboardAwareScrollViewHandle | null)
            ?.getScrollResponder?.();

        try {
            responder?.scrollResponderScrollNativeHandleToKeyboard?.(
                targetNode,
                extraOffset,
                true
            );
        } catch {}
    }, [extraOffset]);

    const scrollToTarget = React.useCallback((targetNode: number) => {
        if (!Number.isFinite(targetNode)) {
            return;
        }

        const scrollViewNode = findNodeHandle(scrollRef.current);

        if (!scrollViewNode) {
            fallbackScrollToKeyboard(targetNode);
            return;
        }

        try {
            UIManager.measureLayout(
                targetNode,
                scrollViewNode,
                () => {
                    fallbackScrollToKeyboard(targetNode);
                },
                (_left, top) => {
                    scrollRef.current?.scrollTo({
                        y: Math.max(0, top - focusedInputTopOffset),
                        animated: false
                    });
                }
            );
        } catch {
            fallbackScrollToKeyboard(targetNode);
        }
    }, [fallbackScrollToKeyboard, focusedInputTopOffset]);

    const scheduleScrollToTarget = React.useCallback((targetNode: number) => {
        if (!Number.isFinite(targetNode)) {
            return;
        }

        clearRetryTimeouts();

        requestAnimationFrame(() => {
            if (focusedTargetRef.current === targetNode) {
                scrollToTarget(targetNode);
            }
        });

        [80, 180, 320].forEach((delay) => {
            const timeoutId = setTimeout(() => {
                requestAnimationFrame(() => {
                    if (focusedTargetRef.current === targetNode) {
                        scrollToTarget(targetNode);
                    }
                });
            }, delay);

            retryTimeoutsRef.current.push(timeoutId);
        });
    }, [clearRetryTimeouts, scrollToTarget]);

    const createFocusHandler = React.useCallback((existingHandler?: FocusHandler) => {
        return (event: FocusEvent) => {
            const targetNode = Number(
                (event as { nativeEvent?: { target?: unknown } })?.nativeEvent?.target
                ?? (event as { target?: unknown })?.target
            );

            if (typeof (event as { persist?: () => void }).persist === 'function') {
                (event as { persist?: () => void }).persist?.();
            }

            existingHandler?.(event);

            if (!Number.isFinite(targetNode)) {
                return;
            }

            focusedTargetRef.current = targetNode;
            scheduleScrollToTarget(targetNode);
        };
    }, [scheduleScrollToTarget]);

    const handleKeyboardShow = React.useCallback((event?: KeyboardEvent) => {
        const screenY = Number(event?.endCoordinates?.screenY);
        const keyboardHeight = Number(event?.endCoordinates?.height);
        const nextInset = Number.isFinite(screenY)
            ? Math.max(0, windowHeight - screenY)
            : Math.max(0, Number.isFinite(keyboardHeight) ? keyboardHeight : 0);

        setKeyboardBottomInset(nextInset);

        const targetNode = focusedTargetRef.current;
        if (typeof targetNode !== 'number' || !Number.isFinite(targetNode)) {
            return;
        }

        scheduleScrollToTarget(targetNode);
    }, [scheduleScrollToTarget, windowHeight]);

    const handleKeyboardHide = React.useCallback(() => {
        setKeyboardBottomInset(0);
        clearRetryTimeouts();
    }, [clearRetryTimeouts]);

    React.useEffect(() => {
        const handleKeyboardShowWithoutEvent = () => {
            const targetNode = focusedTargetRef.current;
            if (typeof targetNode !== 'number' || !Number.isFinite(targetNode)) {
                return;
            }

            scheduleScrollToTarget(targetNode);
        };

        const showSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            handleKeyboardShow
        );
        const didShowSubscription = Platform.OS === 'ios'
            ? Keyboard.addListener('keyboardDidShow', handleKeyboardShow)
            : null;
        const frameSubscription = Platform.OS === 'ios'
            ? Keyboard.addListener('keyboardWillChangeFrame', handleKeyboardShow)
            : null;
        const hideSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            handleKeyboardHide
        );

        requestAnimationFrame(handleKeyboardShowWithoutEvent);

        return () => {
            clearRetryTimeouts();
            showSubscription.remove();
            didShowSubscription?.remove();
            frameSubscription?.remove();
            hideSubscription.remove();
        };
    }, [clearRetryTimeouts, handleKeyboardHide, handleKeyboardShow, scheduleScrollToTarget]);

    const scrollViewProps = React.useMemo(() => ({
        keyboardShouldPersistTaps: 'handled' as const,
        keyboardDismissMode: Platform.OS === 'ios' ? 'interactive' as const : 'on-drag' as const,
        automaticallyAdjustKeyboardInsets: true
    }), []);

    const keyboardAwareContentInsetStyle = React.useMemo(() => (
        keyboardBottomInset > 0
            ? { paddingBottom: keyboardBottomInset + keyboardScrollSpace }
            : null
    ), [keyboardBottomInset, keyboardScrollSpace]);

    return {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        keyboardBottomInset,
        scrollViewProps
    };
}
