import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/client';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
  }, []);

  const loadStoredUser = async () => {
    try {
      const savedToken = await SecureStore.getItemAsync('auth_token');
      const savedUser = await SecureStore.getItemAsync('user_data');
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch (e) {
      console.log('Error loading auth state:', e);
    } finally {
      setLoading(false);
    }
  };

  // Sauvegarde sécurisée sans jamais faire planter SecureStore
  const saveSession = async (authToken, userData) => {
    const safeToken = String(authToken || '');
    const safeUser = userData || {};
    if (safeToken) {
      await SecureStore.setItemAsync('auth_token', safeToken);
      await SecureStore.setItemAsync('userToken', safeToken);
    }
    await SecureStore.setItemAsync('user_data', JSON.stringify(safeUser));
    setToken(safeToken);
    setUser(safeUser);
  };

  // Supporte à la fois login(token, user) ET login(email, password)
  const login = async (arg1, arg2) => {
    // Cas 1 : appelé après un appel API déjà fait -> login(token, user)
    if (typeof arg2 === 'object' && arg2 !== null) {
      await saveSession(arg1, arg2);
      return { success: true, user: arg2 };
    }
    // Cas 2 : appelé avec un seul objet -> login({ token, user })
    if (typeof arg1 === 'object' && arg1 !== null && (arg1.token || arg1.user)) {
      await saveSession(arg1.token || arg1.auth_token, arg1.user || arg1);
      return { success: true, user: arg1.user || arg1 };
    }
    // Cas 3 : appelé avec (identifier, password) pour faire la requête API
    const res = await apiClient.post('/auth.php?action=login', {
      identifier: arg1,
      email: arg1,
      phone: arg1,
      password: arg2,
    });
    if (res.data?.token && res.data?.user) {
      await saveSession(res.data.token, res.data.user);
    }
    return res.data;
  };

  // Fonction d'inscription directe
  const register = async (payload) => {
    const res = await apiClient.post('/auth.php?action=register', payload);
    if (res.data?.token && res.data?.user) {
      await saveSession(res.data.token, res.data.user);
    }
    return res.data;
  };

  // Connexion Google
  const googleLogin = async (googlePayload) => {
    const res = await apiClient.post('/auth.php?action=google_login', googlePayload);
    if (res.data?.token && res.data?.user) {
      await saveSession(res.data.token, res.data.user);
    }
    return res.data;
  };

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync('auth_token');
      await SecureStore.deleteItemAsync('user_data');
    } catch (e) {}
    setToken(null);
    setUser(null);
  };

  const switchMode = async (newMode) => {
    if (!user) return;
    const updatedUser = { ...user, current_mode: newMode };
    setUser(updatedUser);
    try {
      await SecureStore.setItemAsync('user_data', JSON.stringify(updatedUser));
      await apiClient.post('/auth.php?action=switch_mode', { mode: newMode }).catch(() => {});
    } catch (e) {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        setUser,
        loading,
        login,
        register,
        googleLogin,
        logout,
        switchMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};