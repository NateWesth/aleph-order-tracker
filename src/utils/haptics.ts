import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Trigger haptic feedback for UI interactions
 * Falls back gracefully if haptics are not available
 */
export const triggerHapticFeedback = async (style: 'light' | 'medium' | 'heavy' = 'light') => {
  try {
    // Try Capacitor Haptics first (native)
    const impactStyle = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    }[style];
    
    await Haptics.impact({ style: impactStyle });
  } catch {
    // Fall back to Web Vibration API
    if ('vibrate' in navigator) {
      const duration = {
        light: 10,
        medium: 20,
        heavy: 30,
      }[style];
      navigator.vibrate(duration);
    }
  }
};

/**
 * Trigger selection changed haptic feedback
 */
export const triggerSelectionHaptic = async () => {
  try {
    await Haptics.selectionChanged();
  } catch {
    if ('vibrate' in navigator) {
      navigator.vibrate(5);
    }
  }
};

/**
 * Trigger notification haptic feedback
 */
export const triggerNotificationHaptic = async (type: 'success' | 'warning' | 'error' = 'success') => {
  try {
    const notificationType = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    }[type];
    
    await Haptics.notification({ type: notificationType });
  } catch {
    if ('vibrate' in navigator) {
      const pattern = {
        success: [10, 50, 10],
        warning: [20, 50, 20],
        error: [30, 50, 30, 50, 30],
      }[type];
      navigator.vibrate(pattern);
    }
  }
};
