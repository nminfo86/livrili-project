import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = 'https://livrili.bouhezila.com/api'; // Gardez l'URL de votre serveur si différente

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    try {
      let token =
        (await SecureStore.getItemAsync('auth_token')) ||
        (await SecureStore.getItemAsync('userToken')) ||
        (await SecureStore.getItemAsync('token'));

      if (token) {
        // 1. En-tête standard + X-Auth-Token
        config.headers.Authorization = `Bearer ${token}`;
        config.headers['X-Auth-Token'] = token;

        // 2. Ajout en paramètre GET (au cas où Apache/CGI filtre le header Authorization)
        config.params = { ...(config.params || {}), token, auth_token: token };

        // 3. Ajout dans le body JSON si c'est une requête POST
        if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
          config.data = { ...config.data, token, auth_token: token };
        }
      }
    } catch (e) {
      console.log('Token interceptor error:', e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default apiClient;