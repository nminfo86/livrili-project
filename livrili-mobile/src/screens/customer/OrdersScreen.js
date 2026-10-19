import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../api/client';
import { COLORS, useThemeLang } from '../../context/ThemeLanguageContext';

export default function OrdersScreen() {
  const { t } = useThemeLang();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await apiClient.get('/customer.php?action=my_orders');
      if (res.data?.orders) {
        setOrders(res.data.orders);
      } else if (Array.isArray(res.data)) {
        setOrders(res.data);
      }
    } catch (e) {
      console.log('Fetch orders error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [])
  );

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SEARCHING':
        return { label: 'Recherche livreur...', bg: '#FEF3C7', color: '#D97706' };
      case 'DRIVER_ASSIGNED':
        return { label: 'Livreur en route', bg: '#DBEAFE', color: '#2563EB' };
      case 'PICKED_UP':
        return { label: 'Colis récupéré', bg: '#E0E7FF', color: '#4F46E5' };
      case 'DELIVERED':
        return { label: 'Livré', bg: '#D1FAE5', color: '#059669' };
      case 'CANCELLED':
        return { label: 'Annulé', bg: '#FEE2E2', color: '#DC2626' };
      default:
        return { label: status, bg: '#F1F5F9', color: '#475569' };
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('myBookings')}</Text>
        <TouchableOpacity onPress={fetchOrders}>
          <Ionicons name="refresh" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchOrders();
              }}
              colors={[COLORS.primary]}
            />
          }
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={52} color="#CBD5E1" />
              <Text style={styles.emptyText}>Aucune course pour le moment</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadge(item.status);
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.orderCode}>#{item.code || item.id}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>
                      {badge.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeBox}>
                  <View style={styles.routeLine}>
                    <Ionicons name="radio-button-on" size={16} color={COLORS.primary} />
                    <Text style={styles.addressText} numberOfLines={1}>
                      {item.pickup_address}
                    </Text>
                  </View>
                  <View style={styles.routeLine}>
                    <Ionicons name="location" size={16} color={COLORS.secondary} />
                    <Text style={styles.addressText} numberOfLines={1}>
                      {item.delivery_address}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.vehicleType}>
                    {String(item.vehicle_type || 'moto').toUpperCase()} • {item.distance_km} km
                  </Text>
                  <Text style={styles.priceText}>
                    {item.agreed_fee > 0 ? item.agreed_fee : item.estimated_price} DA
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 44 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.textDark },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderCode: { fontSize: 15, fontWeight: '800', color: COLORS.textDark },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  routeBox: { marginBottom: 12 },
  routeLine: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  addressText: { marginLeft: 8, fontSize: 13, color: '#334155', flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  vehicleType: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  priceText: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyText: { marginTop: 10, color: COLORS.textMuted, fontSize: 14 },
});