// src/navigation/AppNavigator.js
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import API from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { UnreadContext } from '../context/UnreadContext';
import { useThemeLang, COLORS } from '../context/ThemeLanguageContext';
import {
  navigationRef,
  navigateFromNotificationData,
  consumePendingNotification,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
} from '../services/NotificationService';

// Écrans Auth
import LoginScreen from '../screens/auth/LoginScreen';

// Écrans Client
import NewOrderScreen from '../screens/customer/NewOrderScreen';
import OrdersScreen from '../screens/customer/OrdersScreen';
import SettingsScreen from '../screens/customer/SettingsScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';

// Écrans Livreur
import DriverDashboardScreen from '../screens/driver/DriverDashboardScreen';
import DriverPoolScreen from '../screens/driver/DriverPoolScreen';
import DriverBidsScreen from '../screens/driver/DriverBidsScreen';
import DriverRegisterScreen from '../screens/driver/DriverRegisterScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Mis à true quand on passe en mode client : les onglets client s'ouvrent alors sur Paramètres
let openSettingsOnMount = false;

function selectMode(current, mode, switchMode) {
  if (mode === current) {
    if (mode === 'customer' && navigationRef.isReady()) navigationRef.navigate('Settings');
    return;
  }
  if (mode === 'customer') openSettingsOnMount = true;
  switchMode(mode);
}

// Helper qui évite d'afficher le nom brut de la clé (ex: "dashboardTab") si elle manque dans ThemeLanguageContext
function translateTab(t, isRTL, key, fallbackFr, fallbackAr) {
  const val = typeof t === 'function' ? t(key) : '';
  if (val && val !== key) return val;
  return isRTL ? fallbackAr : fallbackFr;
}

// Sélecteur de mode : le segment actif correspond au mode courant, un appui bascule vers l'autre
function ModeSwitch({ current, onSelect, isRTL }) {
  const options = [
    { key: 'customer', label: isRTL ? 'زبون' : 'Client', icon: 'person' },
    { key: 'driver', label: isRTL ? 'سائق' : 'Livreur', icon: 'bicycle' },
  ];

  return (
    <View style={styles.modeSwitch}>
      {options.map((opt) => {
        const active = current === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.modeSegment, active && styles.modeSegmentActive]}
            onPress={() => onSelect(opt.key)}
            activeOpacity={0.8}
          >
            <Ionicons name={opt.icon} size={14} color={active ? '#FFF' : COLORS.primary} />
            <Text style={[styles.modeSegmentText, active && styles.modeSegmentTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CustomerTabs() {
  const { t, isRTL } = useThemeLang();
  const { user, switchMode } = useContext(AuthContext);
  const { unread } = useContext(UnreadContext);
  const insets = useSafeAreaInsets();
  const [initialRoute] = useState(() => (openSettingsOnMount ? 'Settings' : 'NewOrder'));

  useEffect(() => {
    openSettingsOnMount = false;
  }, []);

  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        headerRight: () =>
          user?.role === 'driver' ? (
            <ModeSwitch
              current="customer"
              onSelect={(mode) => selectMode('customer', mode, switchMode)}
              isRTL={isRTL}
            />
          ) : null,
        tabBarIcon: ({ color, size }) => {
          let iconName = 'cube-outline';
          if (route.name === 'NewOrder') iconName = 'map-outline';
          else if (route.name === 'Orders') iconName = 'list-outline';
          else if (route.name === 'Notifications') iconName = 'notifications-outline';
          else if (route.name === 'Settings') iconName = 'settings-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="NewOrder"
        component={NewOrderScreen}
        options={{
          headerShown: false,
          title: translateTab(t, isRTL, 'newOrder', 'Commander', 'طلب توصيل'),
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          title: translateTab(t, isRTL, 'myOrders', 'Mes Commandes', 'طلباتي'),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: isRTL ? 'الإشعارات' : 'Notifications',
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: translateTab(t, isRTL, 'settings', 'Paramètres', 'الإعدادات'),
        }}
      />
    </Tab.Navigator>
  );
}

function DriverTabs() {
  const { t, isRTL } = useThemeLang();
  const { switchMode } = useContext(AuthContext);
  const { unread } = useContext(UnreadContext);
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        headerRight: () => (
          <ModeSwitch
            current="driver"
            onSelect={(mode) => selectMode('driver', mode, switchMode)}
            isRTL={isRTL}
          />
        ),
        tabBarIcon: ({ color, size }) => {
          let iconName = 'speedometer-outline';
          if (route.name === 'DriverDashboard') iconName = 'speedometer-outline';
          else if (route.name === 'DriverPool') iconName = 'navigate-circle-outline';
          else if (route.name === 'DriverBids') iconName = 'pricetag-outline';
          else if (route.name === 'Notifications') iconName = 'notifications-outline';
          else if (route.name === 'Settings') iconName = 'settings-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="DriverDashboard"
        component={DriverDashboardScreen}
        options={{
          title: translateTab(t, isRTL, 'driverSpaceTitle', 'Tableau de bord', 'لوحة القيادة'),
        }}
      />
      <Tab.Screen
        name="DriverPool"
        component={DriverPoolScreen}
        options={{
          title: translateTab(t, isRTL, 'availableOrders', 'Courses dispo', 'الطلبات المتاحة'),
        }}
      />
      <Tab.Screen
        name="DriverBids"
        component={DriverBidsScreen}
        options={{
          title: translateTab(t, isRTL, 'myBids', 'Mes offres', 'عروضي'),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: isRTL ? 'الإشعارات' : 'Notifications',
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: translateTab(t, isRTL, 'settings', 'Paramètres', 'الإعدادات'),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading, setUser } = useContext(AuthContext);
  const { isRTL } = useThemeLang();
  const notificationListener = useRef();
  const responseListener = useRef();
  const [unread, setUnread] = useState(0);

  const isDriverMode =
    !!user && (user.current_mode === 'driver' || (!user.current_mode && user.role === 'driver'));
  const currentRole = isDriverMode ? 'driver' : 'customer';

  // Compteur de notifications non lues du mode actif (badge de l'onglet Notifications)
  const refreshUnread = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await API.get('auth.php?action=notifications', { params: { role: currentRole } });
      if (res.data?.success) setUnread(Number(res.data.unread_count) || 0);
    } catch (e) {}
  }, [user?.id, currentRole]);

  // Un seul appel serveur à la connexion et à chaque changement de mode (pas de polling)
  useEffect(() => {
    if (!user?.id) {
      setUnread(0);
      return;
    }
    refreshUnread();
  }, [refreshUnread]);

  const handleRoleSwitchIfNeeded = (targetRole) => {
    if (!targetRole || typeof setUser !== 'function') return;
    setUser((prev) =>
      prev && prev.current_mode !== targetRole ? { ...prev, current_mode: targetRole } : prev
    );
  };

  const refreshUnreadRef = useRef(refreshUnread);
  refreshUnreadRef.current = refreshUnread;

  useEffect(() => {
    if (!user) return;

    getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) {
        navigateFromNotificationData(data, handleRoleSwitchIfNeeded);
      }
    });

    notificationListener.current = addNotificationReceivedListener(() => refreshUnreadRef.current());

    responseListener.current = addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) {
        navigateFromNotificationData(data, handleRoleSwitchIfNeeded);
      }
    });

    return () => {
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, [user?.id]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <UnreadContext.Provider value={{ unread, refreshUnread }}>
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        if (user) {
          consumePendingNotification(handleRoleSwitchIfNeeded);
        }
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen
              name="MainTabs"
              component={isDriverMode ? DriverTabs : CustomerTabs}
            />
            <Stack.Screen
              name="DriverRegister"
              component={DriverRegisterScreen}
              options={{
                headerShown: true,
                title: isRTL ? 'التسجيل كسائق' : 'Devenir Livreur',
                headerStyle: { backgroundColor: COLORS.primary },
                headerTintColor: '#FFF',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </UnreadContext.Provider>
  );
}

const styles = StyleSheet.create({
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 3,
    marginRight: 12,
  },
  modeSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 17,
  },
  modeSegmentActive: {
    backgroundColor: COLORS.primary,
  },
  modeSegmentText: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 4,
  },
  modeSegmentTextActive: {
    color: '#FFFFFF',
  },
});