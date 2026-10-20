import React, { useContext } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { AuthContext } from '../context/AuthContext';
import { useThemeLang, COLORS } from '../context/ThemeLanguageContext';

import LoginScreen from '../screens/auth/LoginScreen';
import NewOrderScreen from '../screens/customer/NewOrderScreen';
import OrdersScreen from '../screens/customer/OrdersScreen';
import WalletScreen from '../screens/customer/WalletScreen';
import SettingsScreen from '../screens/customer/SettingsScreen';

import DriverDashboardScreen from '../screens/driver/DriverDashboardScreen';
import DriverPoolScreen from '../screens/driver/DriverPoolScreen';
import DriverRegisterScreen from '../screens/driver/DriverRegisterScreen';
import DriverBidsScreen from '../screens/driver/DriverBidsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function CustomerTabs() {
  const { t } = useThemeLang();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarIcon: ({ focused, color }) => {
          let iconName = 'home-outline';
          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Orders') {
            iconName = focused ? 'list-circle' : 'list-circle-outline';
          } else if (route.name === 'Wallet') {
            iconName = focused ? 'wallet' : 'wallet-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={NewOrderScreen}
        options={{ tabBarLabel: t('home') }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ tabBarLabel: t('myBookings') }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ tabBarLabel: t('myWallet') }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: t('settings') }}
      />
    </Tab.Navigator>
  );
}

function DriverTabs() {
  const { t } = useThemeLang();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: '#FFF',
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarIcon: ({ focused, color }) => {
          let iconName = 'speedometer-outline';
          if (route.name === 'DriverDashboard') {
            iconName = focused ? 'speedometer' : 'speedometer-outline';
          } else if (route.name === 'DriverPool') {
            iconName = focused ? 'navigate-circle' : 'navigate-circle-outline';
          } else if (route.name === 'DriverSettings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="DriverDashboard"
        component={DriverDashboardScreen}
        options={{ title: t('driverDashboardTab') }}
      />
      <Tab.Screen
        name="DriverPool"
        component={DriverPoolScreen}
        options={{ title: t('availablePoolTitle') }}
      />
      <Tab.Screen
        name="DriverBids"
        component={DriverBidsScreen}
        options={{ title: 'Mes Offres' }}
      />
      <Tab.Screen
        name="DriverSettings"
        component={SettingsScreen}
        options={{ title: t('settings'), headerShown: false }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : user.current_mode === 'driver' && (user.role === 'driver' || user.role === 'admin' || user.is_driver) ? (
          <>
            <Stack.Screen name="DriverMain" component={DriverTabs} />
            <Stack.Screen name="DriverRegister" component={DriverRegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="CustomerMain" component={CustomerTabs} />
            <Stack.Screen
              name="DriverRegister"
              component={DriverRegisterScreen}
              options={{ headerShown: true, title: 'Devenir Livreur Livrili' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}