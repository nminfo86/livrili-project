// src/api/client.js
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API = axios.create({
  baseURL: 'https://livrili.bouhezila.com/api', // Pointe vers le nouveau dossier modulaire
  timeout: 10000,
});

API.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('livrili_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;