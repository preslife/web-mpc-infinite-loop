import { useEffect, useCallback } from 'react';

interface KeyboardShortcuts {
  onPlay?: () => void;
  onStop?: () => void;
  onRecord?: () => void;
  onClear?: () => void;
  onRandomize?: () => void;
  onFill?: () => void;
  onBpmIncrease?: () => void;
  onBpmDecrease?: () => void;
  onVolumeUp?: () => void;
  onVolumeDown?: () => void;
  onPadPress?: (padIndex: number) => void;
  onStepToggle?: (stepIndex: number) => void;
}

export const useKeyboardShortcuts = ({
  onPlay,
  onStop,
  onRecord,
  onClear,
  onRandomize,
  onFill,
  onBpmIncrease,
  onBpmDecrease,
  onVolumeUp,
  onVolumeDown,
  onPadPress,
  onStepToggle
}: KeyboardShortcuts) => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    if (event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement) {
      return;
    }

    const { key, ctrlKey, metaKey, shiftKey, altKey } = event;
    const isModifierPressed = ctrlKey || metaKey;

    switch (key.toLowerCase()) {
      case ' ':
        event.preventDefault();
        onPlay?.();
        break;
      
      case 'escape':
        event.preventDefault();
        onStop?.();
        break;
      
      case 'r':
        if (isModifierPressed) {
          event.preventDefault();
          onRecord?.();
        } else if (altKey) {
          event.preventDefault();
          onRandomize?.();
        }
        break;
      
      case 'c':
        if (isModifierPressed && shiftKey) {
          event.preventDefault();
          onClear?.();
        }
        break;
      
      case 'f':
        if (altKey) {
          event.preventDefault();
          onFill?.();
        }
        break;
      
      case 'arrowup':
        if (shiftKey) {
          event.preventDefault();
          onBpmIncrease?.();
        } else if (altKey) {
          event.preventDefault();
          onVolumeUp?.();
        }
        break;
      
      case 'arrowdown':
        if (shiftKey) {
          event.preventDefault();
          onBpmDecrease?.();
        } else if (altKey) {
          event.preventDefault();
          onVolumeDown?.();
        }
        break;
      
      // Pad shortcuts (Q, W, E, R, A, S, D, F, Z, X, C, V, T, G, B, H)
      case 'q':
        if (!isModifierPressed) onPadPress?.(0);
        break;
      case 'w':
        if (!isModifierPressed) onPadPress?.(1);
        break;
      case 'e':
        if (!isModifierPressed) onPadPress?.(2);
        break;
      case 'r':
        if (!isModifierPressed) onPadPress?.(3);
        break;
      case 'a':
        if (!isModifierPressed) onPadPress?.(4);
        break;
      case 's':
        if (!isModifierPressed) onPadPress?.(5);
        break;
      case 'd':
        if (!isModifierPressed) onPadPress?.(6);
        break;
      case 'f':
        if (!isModifierPressed) onPadPress?.(7);
        break;
      case 'z':
        if (!isModifierPressed) onPadPress?.(8);
        break;
      case 'x':
        if (!isModifierPressed) onPadPress?.(9);
        break;
      case 'c':
        if (!isModifierPressed) onPadPress?.(10);
        break;
      case 'v':
        if (!isModifierPressed) onPadPress?.(11);
        break;
      case 't':
        if (!isModifierPressed) onPadPress?.(12);
        break;
      case 'g':
        if (!isModifierPressed) onPadPress?.(13);
        break;
      case 'b':
        if (!isModifierPressed) onPadPress?.(14);
        break;
      case 'h':
        if (!isModifierPressed) onPadPress?.(15);
        break;
      
      // Step shortcuts (1-9, 0 for step 10)
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        if (altKey) {
          event.preventDefault();
          onStepToggle?.(parseInt(key) - 1);
        }
        break;
      case '0':
        if (altKey) {
          event.preventDefault();
          onStepToggle?.(9);
        }
        break;
    }
  }, [
    onPlay, onStop, onRecord, onClear, onRandomize, onFill,
    onBpmIncrease, onBpmDecrease, onVolumeUp, onVolumeDown,
    onPadPress, onStepToggle
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

export default useKeyboardShortcuts;