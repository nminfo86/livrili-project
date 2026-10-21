// livrili-mobile/src/api/client.js
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const BASE_URL = 'https://livrili.bouhezila.com/api/'; // Remplacez par votre URL actuelle

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    try {
      // 1. Récupération du token individuel ou extrait de l'objet utilisateur
      const token = await SecureStore.getItemAsync('auth_token');
      const userDataStr = await SecureStore.getItemAsync('user_data');
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      const finalToken = token || userData?.auth_token;

      if (finalToken) {
        config.headers.Authorization = `Bearer ${finalToken}`;
        config.headers['X-Auth-Token'] = finalToken;

        // Paramètre de secours injecté automatiquement sur toutes les requêtes (GET et POST)
        config.params = {
          ...(config.params || {}),
          auth_token: finalToken,
        };
      }

      if (userData?.id) {
        config.params = {
          ...(config.params || {}),
          user_id: userData.id,
        };
      }
    } catch (e) {
      console.log('Erreur interceptor client:', e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default apiClient;