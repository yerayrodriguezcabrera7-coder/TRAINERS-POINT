import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "trainerspoint.session";
let webSession: string | null = null;

export const sessionStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === "web") return webSession;
    return SecureStore.getItemAsync(SESSION_KEY);
  },
  async set(value: string | null): Promise<void> {
    if (Platform.OS === "web") {
      webSession = value;
      return;
    }
    if (value) {
      await SecureStore.setItemAsync(SESSION_KEY,value,{
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    } else {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  },
};
