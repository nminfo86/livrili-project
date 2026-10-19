import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { ThemeLanguageProvider } from './src/context/ThemeLanguageContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <ThemeLanguageProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <AppNavigator />
      </AuthProvider>
    </ThemeLanguageProvider>
  );
}