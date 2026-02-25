import { NativeBiometric, BiometryType } from "capacitor-native-biometric";
import { Capacitor } from "@capacitor/core";
import { triggerHapticFeedback, triggerNotificationHaptic } from "./haptics";

// Re-export BiometryType for convenience
export { BiometryType } from "capacitor-native-biometric";

const SERVER_ID = "aleph-order-tracker.lovable.app";

interface BiometricResult {
  isAvailable: boolean;
  biometryType: BiometryType;
  errorCode?: number;
}

export const isBiometricAvailable = async (): Promise<BiometricResult> => {
  if (!Capacitor.isNativePlatform()) {
    return { isAvailable: false, biometryType: BiometryType.NONE };
  }

  try {
    const result = await NativeBiometric.isAvailable();
    return {
      isAvailable: result.isAvailable,
      biometryType: result.biometryType,
      errorCode: result.errorCode,
    };
  } catch (error) {
    console.error("Error checking biometric availability:", error);
    return { isAvailable: false, biometryType: BiometryType.NONE };
  }
};

export const getBiometricTypeName = (type: BiometryType): string => {
  switch (type) {
    case BiometryType.FACE_ID:
      return "Face ID";
    case BiometryType.TOUCH_ID:
      return "Touch ID";
    case BiometryType.FINGERPRINT:
      return "Fingerprint";
    case BiometryType.FACE_AUTHENTICATION:
      return "Face Recognition";
    case BiometryType.IRIS_AUTHENTICATION:
      return "Iris Authentication";
    case BiometryType.MULTIPLE:
      return "Biometric";
    default:
      return "Biometric";
  }
};

/**
 * Save a Supabase refresh token securely in device keystore.
 * We store the refresh token (not the password) so that biometric login
 * can re-establish a session without ever persisting the user's password.
 */
export const saveRefreshToken = async (refreshToken: string): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    await NativeBiometric.setCredentials({
      username: "supabase_refresh_token",
      password: refreshToken,
      server: SERVER_ID,
    });
    console.log("Refresh token saved for biometric login");
    await triggerNotificationHaptic('success');
    return true;
  } catch (error) {
    console.error("Error saving refresh token:", error);
    return false;
  }
};

/**
 * Retrieve the stored refresh token from device keystore.
 */
export const getRefreshToken = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    const credentials = await NativeBiometric.getCredentials({
      server: SERVER_ID,
    });
    if (credentials.username === "supabase_refresh_token" && credentials.password) {
      return credentials.password;
    }
    return null;
  } catch (error) {
    console.error("Error getting refresh token:", error);
    return null;
  }
};

export const deleteCredentials = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    await NativeBiometric.deleteCredentials({
      server: SERVER_ID,
    });
    console.log("Credentials deleted");
    await triggerHapticFeedback('medium');
    return true;
  } catch (error) {
    console.error("Error deleting credentials:", error);
    return false;
  }
};

export const authenticateWithBiometric = async (
  reason: string = "Log in to your account"
): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const availability = await isBiometricAvailable();
    if (!availability.isAvailable) {
      return false;
    }

    const biometricName = getBiometricTypeName(availability.biometryType);
    await triggerHapticFeedback('light');

    await NativeBiometric.verifyIdentity({
      reason: reason,
      title: "Authentication Required",
      subtitle: `Use ${biometricName} to log in`,
      description: "Place your finger on the sensor or look at the camera",
      maxAttempts: 3,
      useFallback: true,
      fallbackTitle: "Use Password",
    });

    await triggerNotificationHaptic('success');
    return true;
  } catch (error) {
    console.error("Biometric authentication failed:", error);
    await triggerNotificationHaptic('error');
    return false;
  }
};

export const hasStoredCredentials = async (): Promise<boolean> => {
  const token = await getRefreshToken();
  return token !== null && token !== "";
};

// Legacy exports removed: saveCredentials, getCredentials (password-based) are no longer available
