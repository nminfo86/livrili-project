import React, { useContext } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { AuthContext } from '../context/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';
import NewOrderScreen from '../screens/customer/NewOrderScreen';
import OrdersScreen from '../screens/customer/OrdersScreen';
import DriverDashboardScreen from '../screens/driver/DriverDashboardScreen';
import DriverPoolScreen from '../screens/driver/DriverPoolScreen';
import DriverRegisterScreen from '../screens/driver/DriverRegisterScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function CustomerTabs({ navigation }) {
  const { switchMode, user } = useContext(AuthContext);

  const handleDriverAccess = () => {
    if (user?.role === 'driver' && user?.driver_profile?.verification_status === 'approved') {
      switchMode('driver');
    } else {
      navigation.navigate('DriverRegister');
    }
  };

  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => (
          <TouchableOpacity
            style={{ marginRight: 15, padding: 6, backgroundColor: '#e3f2fd', borderRadius: 6 }}
            onPress={handleDriverAccess}
          >
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#1976d2' }}>
              {user?.role === 'driver' ? 'Mode Livreur 🔄' : 'Devenir Livreur 🛵'}
            </Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tab.Screen name="NewOrder" component={NewOrderScreen} options={{ title: 'Commander' }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Mes Courses' }} />
    </Tab.Navigator>
  );
}

function DriverTabs() {
  const { switchMode } = useContext(AuthContext);
  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => (
          <TouchableOpacity
            style={{ marginRight: 15, padding: 6, backgroundColor: '#e8f5e9', borderRadius: 6 }}
            onPress={() => switchMode('customer')}
          >
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#2e7d32' }}>Mode Client 🔄</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tab.Screen name="DriverDash" component={DriverDashboardScreen} options={{ title: 'Tableau de bord' }} />
      <Tab.Screen name="DriverPool" component={DriverPoolScreen} options={{ title: 'Demandes' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, activeMode, loading } = useContext(AuthContext);

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : activeMode === 'driver' && user?.role === 'driver' ? (
          <Stack.Screen name="DriverApp" component={DriverTabs} />
        ) : (
          <>
            <Stack.Screen name="CustomerApp" component={CustomerTabs} />
            <Stack.Screen
              name="DriverRegister"
              component={DriverRegisterScreen}
              options={{ headerShown: true, title: 'Inscription Chauffeur' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}