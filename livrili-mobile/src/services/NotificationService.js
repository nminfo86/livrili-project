// src/services/NotificationService.js
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createNavigationContainerRef } from '@react-navigation/native';
import API from '../api/client';

export const navigationRef = createNavigationContainerRef();
let pendingNotificationData = null;

let Notifications = null;
let isNativeNotificationsAvailable = false;
let hasRemotePushToken = false;

// Chargement sécurisé : compatible Expo Go et APK autonome
try {
  Notifications = require('expo-notifications');
  if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    isNativeNotificationsAvailable = true;
  }
} catch (error) {
  console.log('[NotificationService] Notifications natives en attente du build autonome.');
}

/**
 * Enregistrement du push token
 */
export async function registerForPushNotificationsAsync() {
  if (!isNativeNotificationsAvailable || !Device.isDevice) {
    return null;
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Livrili Alertes',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#006233',
        // 'sound' retiré ici : Android applique automatiquement le son système par défaut
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    const pushTokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const pushToken = pushTokenData?.data;

    if (pushToken) {
      await API.post('auth.php?action=save_push_token', { push_token: pushToken });
      hasRemotePushToken = true;
    }

    return pushToken;
  } catch (error) {
    console.log('[NotificationService] Info token push :', error.message);
    return null;
  }
}

/**
 * Notification locale de secours (polling) ; ignorée si le push serveur est actif pour éviter les doublons
 */
export async function triggerLocalNotification(title, body, data = {}) {
  if (!isNativeNotificationsAvailable || hasRemotePushToken) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: 'default' },
      trigger: null,
    });
  } catch (e) {
    console.log('[NotificationService] Notification locale :', e.message);
  }
}

/**
 * Déconnexion du push token
 */
export async function unregisterPushNotificationsAsync() {
  hasRemotePushToken = false;
  try {
    await API.post('auth.php?action=save_push_token', { push_token: null });
  } catch (e) {}
}

/**
 * Écouteurs sécurisés
 */
export function addNotificationReceivedListener(callback) {
  if (isNativeNotificationsAvailable && Notifications?.addNotificationReceivedListener) {
    return Notifications.addNotificationReceivedListener(callback);
  }
  return { remove: () => {} };
}

export function addNotificationResponseReceivedListener(callback) {
  if (isNativeNotificationsAvailable && Notifications?.addNotificationResponseReceivedListener) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }
  return { remove: () => {} };
}

export async function getLastNotificationResponseAsync() {
  if (isNativeNotificationsAvailable && Notifications?.getLastNotificationResponseAsync) {
    return await Notifications.getLastNotificationResponseAsync();
  }
  return null;
}

/**
 * Redirection vers l'écran concerné
 */
export function navigateFromNotificationData(data, switchRoleCallback = null) {
  if (!data) return;

  const targetScreen = data.screen || 'Orders';
  const orderId = data.orderId || data.order_id || null;
  const targetRole = data.targetRole || null;

  if (targetRole && typeof switchRoleCallback === 'function') {
    switchRoleCallback(targetRole);
  }

  if (navigationRef.isReady()) {
    setTimeout(() => {
      try {
        navigationRef.navigate(targetScreen, {
          focusOrderId: orderId ? Number(orderId) : undefined,
          newOrderId: orderId ? Number(orderId) : undefined,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.log('[Notifications] Erreur navigation :', err.message);
      }
    }, 250);
    pendingNotificationData = null;
  } else {
    pendingNotificationData = data;
  }
}

export function consumePendingNotification(switchRoleCallback = null) {
  if (pendingNotificationData) {
    navigateFromNotificationData(pendingNotificationData, switchRoleCallback);
  }
}