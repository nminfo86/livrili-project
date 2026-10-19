// src/services/NotificationService.js
export async function registerForPushNotificationsAsync() {
  // Les notifications push complètes nécessitent un APK autonome (EAS Build)
  console.log('[Dev] Notifications désactivées sous Expo Go.');
  return null;
}