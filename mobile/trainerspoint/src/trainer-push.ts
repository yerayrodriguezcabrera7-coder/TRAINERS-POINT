import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { ApiClient } from "../../shared/api";

type NativePlatform = "ios" | "android";
let registered: { platform: NativePlatform; token: string } | null = null;

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({ handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }) });
}

export async function registerTrainerPush(api: ApiClient): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  const platform = Platform.OS as NativePlatform;
  const available = await api.getTrainerPushAvailability();
  if (!available[platform]) return false;
  if (platform === "android") await Notifications.setNotificationChannelAsync("agenda", {
    name: "Cambios en la agenda", importance: Notifications.AndroidImportance.HIGH, sound: "default",
  });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) return false;
  const deviceToken = await Notifications.getDevicePushTokenAsync();
  if (typeof deviceToken.data !== "string" || !deviceToken.data) return false;
  if (registered && (registered.platform !== platform || registered.token !== deviceToken.data)) {
    await api.unregisterTrainerPush(registered.platform,registered.token);
    registered = null;
  }
  await api.registerTrainerPush(platform,deviceToken.data);
  registered = { platform, token: deviceToken.data };
  return true;
}

export async function unregisterTrainerPush(api: ApiClient) {
  const device = registered;
  registered = null;
  if (device) await api.unregisterTrainerPush(device.platform,device.token);
}
