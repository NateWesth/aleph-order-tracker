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
  // Only available on native platforms
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

export const saveCredentials = async (
  email: string,
  password: string
): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    await NativeBiometric.setCredentials({
      username: email,
      password: password,
      server: SERVER_ID,
    });
    console.log("Credentials saved for biometric login");
    
    // Trigger success haptic when credentials are saved
    await triggerNotificationHaptic('success');
    
    return true;
  } catch (error) {
    console.error("Error saving credentials:", error);
    return false;
  }
};

export const getCredentials = async (): Promise<{
  email: string;
  password: string;
} | null> => {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    const credentials = await NativeBiometric.getCredentials({
      server: SERVER_ID,
    });
    return {
      email: credentials.username,
      password: credentials.password,
    };
  } catch (error) {
    console.error("Error getting credentials:", error);
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
    
    // Trigger medium haptic when credentials are deleted
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

    // Trigger light haptic when biometric prompt appears
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

    // Trigger success haptic on successful authentication
    await triggerNotificationHaptic('success');

    return true;
  } catch (error) {
    console.error("Biometric authentication failed:", error);
    
    // Trigger error haptic on failed authentication
    await triggerNotificationHaptic('error');
    
    return false;
  }
};

export const hasStoredCredentials = async (): Promise<boolean> => {
  const credentials = await getCredentials();
  return credentials !== null && credentials.email !== "" && credentials.password !== "";
};
