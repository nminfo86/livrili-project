import React, { createContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import API from '../api/client';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [activeMode, setActiveMode] = useState('customer');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkExistingAuth();
  }, []);

  const checkExistingAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync('livrili_token');
      if (token) {
        const res = await API.get('auth.php?action=me');
        if (res.data.success) {
          setUser(res.data.user);
          setActiveMode(res.data.user.current_mode || 'customer');
        } else {
          await logout();
        }
      }
    } catch (e) {
      console.log('Session non restaurée :', e.message);
    } finally {
      setLoading(false);
    }
  };

  const completeLogin = async (token, userData) => {
    await SecureStore.setItemAsync('livrili_token', token);
    setUser(userData);
    setActiveMode(userData.current_mode || 'customer');
  };

  const switchMode = async (targetMode) => {
    try {
      const res = await API.post('auth.php?action=switch_mode', { mode: targetMode });
      if (res.data.success) {
        setActiveMode(targetMode);
        setUser((prev) => ({ ...prev, current_mode: targetMode }));
      }
    } catch (e) {
      console.error('Erreur switch mode:', e);
    }
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('livrili_token');
    setUser(null);
    setActiveMode('customer');
  };

  return (
    <AuthContext.Provider value={{ user, activeMode, loading, completeLogin, switchMode, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};