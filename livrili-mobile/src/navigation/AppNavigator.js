// src/navigation/AppNavigator.js
import React, { useContext } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, Fontisto } from '@expo/vector-icons';

import { AuthContext } from '../context/AuthContext';
import { useThemeLang, COLORS, FONTS, SHADOWS } from '../context/ThemeLanguageContext';

// Écrans d'authentification
import LoginScreen from '../screens/auth/LoginScreen';

// Écrans Client
import NewOrderScreen from '../screens/customer/NewOrderScreen';
import OrdersScreen from '../screens/customer/OrdersScreen';
import SettingsScreen from '../screens/customer/SettingsScreen';

// Écrans Livreur
import DriverDashboardScreen from '../screens/driver/DriverDashboardScreen';
import DriverPoolScreen from '../screens/driver/DriverPoolScreen';
import DriverBidsScreen from '../screens/driver/DriverBidsScreen';
import DriverRegisterScreen from '../screens/driver/DriverRegisterScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function WalletPlaceholderScreen() {
  const { isRTL } = useThemeLang();
  return (
    <View style={styles.centered}>
      <Ionicons name="wallet-outline" size={64} color={COLORS.primary} />
      <Text style={[styles.placeholderTitle, { textAlign: isRTL ? 'right' : 'left' }]}>
        {isRTL ? 'المحفظة قريباً' : 'Portefeuille bientôt disponible'}
      </Text>
      <Text style={[styles.placeholderSub, { textAlign: isRTL ? 'right' : 'left' }]}>
        {isRTL ? 'إدارة الأرصدة والمدفوعات' : 'Gestion des soldes et paiements de livraison'}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------
// 1. NAVIGATION CLIENT (INVERSION NATIVE RTL EN ARABE / DARJA)
// ------------------------------------------------------------------
function CustomerTabNavigator() {
  const { isRTL } = useThemeLang();

  // Définition des onglets
  const tabScreens = [
    <Tab.Screen
      key="home"
      name="Home"
      component={NewOrderScreen}
      options={{
        tabBarLabel: isRTL ? 'الرئيسية' : 'Accueil',
        tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
      }}
    />,
    <Tab.Screen
      key="orders"
      name="Orders"
      component={OrdersScreen}
      options={{
        tabBarLabel: isRTL ? 'طلباتي' : 'Mes Courses',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="receipt-outline" size={size} color={color} />
        ),
      }}
    />,
    <Tab.Screen
      key="wallet"
      name="Wallet"
      component={WalletPlaceholderScreen}
      options={{
        tabBarLabel: isRTL ? 'المحفظة' : 'Portefeuille',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="wallet-outline" size={size} color={color} />
        ),
      }}
    />,
    <Tab.Screen
      key="settings"
      name="Settings"
      component={SettingsScreen}
      options={{
        tabBarLabel: isRTL ? 'الإعدادات' : 'Paramètres',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="settings-outline" size={size} color={color} />
        ),
      }}
    />,
  ];

  return (
    <Tab.Navigator
      key={isRTL ? 'customer-tabs-rtl' : 'customer-tabs-ltr'}
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          ...SHADOWS.card,
        },
        tabBarLabelStyle: {
          fontFamily: FONTS.bold,
          fontSize: 11,
          fontWeight: '800',
        },
      }}
    >
      {/* En RTL, la liste est inversée pour que "Accueil" soit placé à l'extrême droite */}
      {isRTL ? tabScreens.slice().reverse() : tabScreens}
    </Tab.Navigator>
  );
}

// ------------------------------------------------------------------
// 2. NAVIGATION LIVREUR (INVERSION NATIVE RTL EN ARABE / DARJA)
// ------------------------------------------------------------------
function DriverTabNavigator() {
  const { isRTL } = useThemeLang();

  const driverScreens = [
    <Tab.Screen
      key="pool"
      name="DriverPool"
      component={DriverPoolScreen}
      options={{
        tabBarLabel: isRTL ? 'الطلبات المتاحة' : 'Disponibles',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="navigate-circle-outline" size={size} color={color} />
        ),
      }}
    />,
    <Tab.Screen
      key="bids"
      name="DriverBids"
      component={DriverBidsScreen}
      options={{
        tabBarLabel: isRTL ? 'عروضي' : 'Mes Offres',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="time-outline" size={size} color={color} />
        ),
      }}
    />,
    <Tab.Screen
      key="dashboard"
      name="DriverDashboard"
      component={DriverDashboardScreen}
      options={{
        tabBarLabel: isRTL ? 'لوحة القيادة' : 'Tableau de bord',
        tabBarIcon: ({ color }) => (
          <Fontisto name="motorcycle" size={20} color={color} />
        ),
      }}
    />,
    <Tab.Screen
      key="driver-settings"
      name="DriverSettings"
      component={SettingsScreen}
      options={{
        tabBarLabel: isRTL ? 'الإعدادات' : 'Paramètres',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="settings-outline" size={size} color={color} />
        ),
      }}
    />,
  ];

  return (
    <Tab.Navigator
      key={isRTL ? 'driver-tabs-rtl' : 'driver-tabs-ltr'}
      initialRouteName="DriverPool"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          ...SHADOWS.card,
        },
        tabBarLabelStyle: {
          fontFamily: FONTS.bold,
          fontSize: 11,
          fontWeight: '800',
        },
      }}
    >
      {isRTL ? driverScreens.slice().reverse() : driverScreens}
    </Tab.Navigator>
  );
}

// ------------------------------------------------------------------
// 3. NAVIGATEUR PRINCIPAL
// ------------------------------------------------------------------
export default function AppNavigator() {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const isDriverMode = user && user.current_mode === 'driver';

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
          </>
        ) : isDriverMode ? (
          <>
            <Stack.Screen name="DriverTabs" component={DriverTabNavigator} />
            <Stack.Screen
              name="DriverRegister"
              component={DriverRegisterScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="CustomerTabs" component={CustomerTabNavigator} />
            <Stack.Screen
              name="DriverRegister"
              component={DriverRegisterScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderTitle: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textDark,
    marginTop: 14,
  },
  placeholderSub: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
  },
});