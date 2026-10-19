// src/services/NotificationService.js
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import API from '../api/client';

// Configurer le comportement d'affichage des alertes quand l'application est au premier plan
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.log('Les notifications Push nécessitent un smartphone physique.');
    return null;
  }

  // Vérifier et demander la permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permission de notification push refusée.');
    return null;
  }

  // Récupérer le jeton unique Expo Push
  try {
    const pushTokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = pushTokenData.data;

    // Configuration du canal Android pour un son prioritaire (sonnette de coursier)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Livrili Alertes',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1976d2',
      });
    }

    // Sauvegarde en BDD
    await API.post('auth.php?action=save_push_token', { push_token: pushToken });
    return pushToken;
  } catch (error) {
    console.error('Erreur token push :', error);
    return null;
  }
}