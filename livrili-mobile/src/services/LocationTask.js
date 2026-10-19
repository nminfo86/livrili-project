import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import API from '../api/client';

export const BACKGROUND_GPS_TASK = 'LIVRILI_DRIVER_GPS';

TaskManager.defineTask(BACKGROUND_GPS_TASK, async ({ data, error }) => {
  if (error) return;
  if (data) {
    const { locations } = data;
    const loc = locations[0];
    if (!loc) return;

    try {
      const sessionStr = await SecureStore.getItemAsync('livrili_session');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        if (session.id && session.current_mode === 'driver') {
          await API.post('driver.php?action=update_gps', {
            telegram_id: session.id, // Mapping rétrocompatible
            user_id: session.id,
            lat: loc.coords.latitude,
            lon: loc.coords.longitude,
            commune: session.commune_name || 'El Eulma',
          });
        }
      }
    } catch (err) {
      console.error('Erreur tracking background GPS:', err);
    }
  }
});

export async function startDriverGpsTracking() {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return false;

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') return false;

  const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_GPS_TASK);
  if (!hasStarted) {
    await Location.startLocationUpdatesAsync(BACKGROUND_GPS_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 59000, // Mise à jour calée sur 59 secondes
      distanceInterval: 40,
      foregroundService: {
        notificationTitle: 'Livrili Livreur Actif',
        notificationBody: 'Votre position GPS en direct est active pour recevoir des courses.',
        notificationColor: '#1976d2',
      },
    });
  }
  return true;
}

export async function stopDriverGpsTracking() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_GPS_TASK);
  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_GPS_TASK);
  }
}