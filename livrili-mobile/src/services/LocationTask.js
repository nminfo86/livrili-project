import * as Location from 'expo-location';
import apiClient from '../api/client';

let foregroundSubscription = null;

export async function startDriverGpsTracking() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('Permission GPS refusée');
      return false;
    }

    // Nettoyage d'un éventuel abonnement précédent
    if (foregroundSubscription) {
      foregroundSubscription.remove();
      foregroundSubscription = null;
    }

    // Suivi GPS compatible à 100% avec Expo Go et APK Android/iOS
    foregroundSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15000, // Mise à jour toutes les 15 secondes
        distanceInterval: 20, // Ou tous les 20 mètres
      },
      async (location) => {
        try {
          const { latitude, longitude } = location.coords;
          await apiClient.post('driver.php?action=update_gps', {
            latitude,
            longitude,
          });
        } catch (err) {
          // Ignorer silencieusement les micro-coupures réseau
        }
      }
    );

    return true;
  } catch (error) {
    console.log('GPS Tracking fallback:', error.message);
    return false;
  }
}

export async function stopDriverGpsTracking() {
  try {
    if (foregroundSubscription) {
      foregroundSubscription.remove();
      foregroundSubscription = null;
    }
  } catch (error) {
    console.log('Stop GPS error:', error.message);
  }
}