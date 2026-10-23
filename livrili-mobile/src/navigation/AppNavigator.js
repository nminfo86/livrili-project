// src/navigation/AppNavigator.js
import React, { useContext, useEffect, useRef } from 'react';
import { ActivityIndicator, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import API from '../api/client';
import { AuthContext } from '../context/AuthContext';
import { useThemeLang, COLORS } from '../context/ThemeLanguageContext';
import {
  navigationRef,
  navigateFromNotificationData,
  consumePendingNotification,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
  triggerLocalNotification,
} from '../services/NotificationService';

// Écrans Auth
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

// Helper qui évite d'afficher le nom brut de la clé (ex: "dashboardTab") si elle manque dans ThemeLanguageContext
function translateTab(t, isRTL, key, fallbackFr, fallbackAr) {
  const val = typeof t === 'function' ? t(key) : '';
  if (val && val !== key) return val;
  return isRTL ? fallbackAr : fallbackFr;
}

function CustomerTabs() {
  const { t, isRTL } = useThemeLang();
  const { user, switchMode } = useContext(AuthContext);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6 },
        headerRight: () =>
          user?.role === 'driver' ? (
            <TouchableOpacity
              style={styles.switchRoleBtn}
              onPress={() => switchMode('driver')}
            >
              <Ionicons name="bicycle" size={16} color={COLORS.primary} />
              <Text style={styles.switchRoleText}>
                {isRTL ? 'وضع السائق' : 'Mode Livreur'}
              </Text>
            </TouchableOpacity>
          ) : null,
        tabBarIcon: ({ color, size }) => {
          let iconName = 'cube-outline';
          if (route.name === 'NewOrder') iconName = 'map-outline';
          else if (route.name === 'Orders') iconName = 'list-outline';
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

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#FFF',
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6 },
        headerRight: () => (
          <TouchableOpacity
            style={styles.switchRoleBtn}
            onPress={() => switchMode('customer')}
          >
            <Ionicons name="person" size={15} color={COLORS.primary} />
            <Text style={styles.switchRoleText}>
              {isRTL ? 'وضع الزبون' : 'Mode Client'}
            </Text>
          </TouchableOpacity>
        ),
        tabBarIcon: ({ color, size }) => {
          let iconName = 'speedometer-outline';
          if (route.name === 'DriverDashboard') iconName = 'speedometer-outline';
          else if (route.name === 'DriverPool') iconName = 'navigate-circle-outline';
          else if (route.name === 'DriverBids') iconName = 'pricetag-outline';
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

  // Mémoire des états connus pour déclencher une notification locale dès qu'un changement survient en BDD
  const knownStateRef = useRef({
    initialized: false,
    orderStatuses: {}, // { [orderId]: status }
    orderBidCounts: {}, // { [orderId]: count }
    poolOrderIds: new Set(),
    driverBidStatuses: {}, // { [bidId]: status }
  });

  const handleRoleSwitchIfNeeded = (targetRole) => {
    if (!user || !targetRole) return;
    const currentMode = user.current_mode || user.role || 'customer';
    if (targetRole !== currentMode && typeof setUser === 'function') {
      setUser((prev) => (prev ? { ...prev, current_mode: targetRole } : prev));
    }
  };

  useEffect(() => {
    if (!user) return;

    getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data) {
        navigateFromNotificationData(data, handleRoleSwitchIfNeeded);
      }
    });

    notificationListener.current = addNotificationReceivedListener(() => {});

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

  // Surveillance temps réel (Polling léger toutes les 8s) pour déclencher les notifications même sans Firebase
  useEffect(() => {
    if (!user?.id) return;

    const checkUpdates = async () => {
      const mem = knownStateRef.current;
      const isFirstRun = !mem.initialized;

      // 1. Vérifier les commandes du client (offres reçues & changements de statut)
      try {
        const resCust = await API.get('customer.php?action=my_orders');
        if (resCust.data?.success && Array.isArray(resCust.data.orders)) {
          for (const ord of resCust.data.orders) {
            const oid = Number(ord.id);
            const bidCount = Array.isArray(ord.bids) ? ord.bids.length : 0;

            if (!isFirstRun) {
              // Nouvelle offre reçue d'un livreur
              if (
                typeof mem.orderBidCounts[oid] === 'number' &&
                bidCount > mem.orderBidCounts[oid]
              ) {
                const latestBid = ord.bids[0];
                await triggerLocalNotification(
                  `🛵 Nouvelle offre (#${ord.code})`,
                  `Un livreur propose ${latestBid?.bid_amount || ''} DA pour votre course. Appuyez pour voir.`,
                  {
                    type: 'NEW_BID',
                    screen: 'Orders',
                    orderId: oid,
                    targetRole: 'customer',
                  }
                );
              }

              // Changement de statut (DRIVER_ASSIGNED, PICKED_UP, DELIVERED)
              if (mem.orderStatuses[oid] && mem.orderStatuses[oid] !== ord.status) {
                if (ord.status === 'PICKED_UP') {
                  await triggerLocalNotification(
                    `📦 Colis récupéré (#${ord.code})`,
                    `Le livreur a récupéré votre colis et est en route vers la destination.`,
                    {
                      type: 'ORDER_STATUS_CHANGED',
                      screen: 'Orders',
                      orderId: oid,
                      targetRole: 'customer',
                    }
                  );
                } else if (ord.status === 'DELIVERED') {
                  await triggerLocalNotification(
                    `🎉 Colis livré (#${ord.code})`,
                    `Votre commande #${ord.code} a été livrée avec succès !`,
                    {
                      type: 'ORDER_STATUS_CHANGED',
                      screen: 'Orders',
                      orderId: oid,
                      targetRole: 'customer',
                    }
                  );
                }
              }
            }

            mem.orderBidCounts[oid] = bidCount;
            mem.orderStatuses[oid] = ord.status;
          }
        }
      } catch (e) {}

      // 2. Si l'utilisateur possède un profil livreur, vérifier le Pool et ses Offres
      if (user.role === 'driver' || user.current_mode === 'driver') {
        try {
          const resPool = await API.get('driver.php?action=pool');
          if (resPool.data?.success && Array.isArray(resPool.data.pool)) {
            for (const p of resPool.data.pool) {
              const pid = Number(p.id);
              if (!isFirstRun && !mem.poolOrderIds.has(pid)) {
                await triggerLocalNotification(
                  `📦 Nouvelle course disponible (#${p.code})`,
                  `${p.pickup_address} ➔ ${p.delivery_address} (${p.estimated_price} DA)`,
                  {
                    type: 'NEW_ORDER_POOL',
                    screen: 'DriverPool',
                    orderId: pid,
                    targetRole: 'driver',
                  }
                );
              }
              mem.poolOrderIds.add(pid);
            }
          }
        } catch (e) {}

        try {
          const resBids = await API.get('driver.php?action=driver_bids');
          if (resBids.data?.success && Array.isArray(resBids.data.bids)) {
            for (const b of resBids.data.bids) {
              const bidId = Number(b.bid_id || b.id);
              const orderId = Number(b.order_id || b.parcel_order_id);
              if (
                !isFirstRun &&
                mem.driverBidStatuses[bidId] &&
                mem.driverBidStatuses[bidId] !== 'accepted' &&
                b.bid_status === 'accepted'
              ) {
                await triggerLocalNotification(
                  `✅ Offre acceptée (#${b.code}) !`,
                  `Le client a accepté votre offre à ${b.bid_amount} DA. Appuyez pour voir les détails.`,
                  {
                    type: 'BID_ACCEPTED',
                    screen: 'DriverBids',
                    orderId: orderId,
                    targetRole: 'driver',
                  }
                );
              }
              mem.driverBidStatuses[bidId] = b.bid_status;
            }
          }
        } catch (e) {}
      }

      mem.initialized = true;
    };

    checkUpdates();
    const interval = setInterval(checkUpdates, 8000);
    return () => clearInterval(interval);
  }, [user?.id, user?.role, user?.current_mode]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const isDriverMode =
    user && (user.current_mode === 'driver' || (!user.current_mode && user.role === 'driver'));

  return (
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
  );
}

const styles = StyleSheet.create({
  switchRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 12,
  },
  switchRoleText: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    marginLeft: 5,
  },
});