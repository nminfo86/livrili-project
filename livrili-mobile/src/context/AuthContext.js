// src/context/AuthContext.js
import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import API, { setAuthToken } from '../api/client';
import {
  registerForPushNotificationsAsync,
  unregisterPushNotificationsAsync,
} from '../services/NotificationService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, []);

  // Dès qu'un utilisateur est authentifié, on enregistre son Expo Push Token sur le serveur
  useEffect(() => {
    if (user && user.id) {
      registerForPushNotificationsAsync();
    }
  }, [user?.id]);

  const loadSession = async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      const savedUser = await SecureStore.getItemAsync('user_data');

      if (token) {
        if (typeof setAuthToken === 'function') {
          setAuthToken(token);
        } else if (API.defaults?.headers?.common) {
          API.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }

        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
          } catch (e) {}
        }

        // Rafraîchir les infos du profil depuis le serveur
        try {
          const res = await API.get('auth.php?action=me');
          if (res.data?.user) {
            setUser(res.data.user);
            await SecureStore.setItemAsync('user_data', JSON.stringify(res.data.user));
          }
        } catch (err) {
          // Si le token est expiré (401), on nettoie la session locale
          if (err.response?.status === 401) {
            await SecureStore.deleteItemAsync('auth_token');
            await SecureStore.deleteItemAsync('user_data');
            setUser(null);
          }
        }
      }
    } catch (error) {
      console.log('Erreur chargement session :', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (token, userData) => {
    try {
      if (token) {
        await SecureStore.setItemAsync('auth_token', String(token));
        if (typeof setAuthToken === 'function') {
          setAuthToken(token);
        } else if (API.defaults?.headers?.common) {
          API.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }
      }

      if (userData) {
        await SecureStore.setItemAsync('user_data', JSON.stringify(userData));
        setUser(userData);
      }

      // Enregistrer immédiatement le token de notification Push après connexion
      await registerForPushNotificationsAsync();
    } catch (error) {
      console.log('Erreur login SecureStore :', error);
    }
  };

  const updateUser = async (updatedFields) => {
    try {
      setUser((prev) => {
        const nextUser = prev ? { ...prev, ...updatedFields } : updatedFields;
        SecureStore.setItemAsync('user_data', JSON.stringify(nextUser)).catch(() => {});
        return nextUser;
      });
    } catch (e) {}
  };

  const switchMode = async (newMode) => {
    try {
      await updateUser({ current_mode: newMode });
      await API.post('auth.php?action=switch_mode', { mode: newMode });
    } catch (e) {
      console.log('Info switchMode :', e.message);
    }
  };

  const logout = async () => {
    try {
      // 1. Détacher le push_token en base de données avant de supprimer le token d'auth
      await unregisterPushNotificationsAsync();
    } catch (e) {}

    try {
      // 2. Nettoyer le stockage sécurisé local
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_data');
      if (typeof setAuthToken === 'function') {
        setAuthToken(null);
      } else if (API.defaults?.headers?.common) {
        delete API.defaults.headers.common['Authorization'];
      }
    } catch (error) {
      console.log('Erreur logout :', error);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        login,
        logout,
        updateUser,
        switchMode,
        refreshProfile: loadSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};