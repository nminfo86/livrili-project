// src/screens/customer/OrdersScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import API from '../../api/client';

export default function OrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await API.get('customer.php?action=my_orders');
      if (res.data.success) {
        setOrders(res.data.orders);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const acceptBid = async (orderId, bidId) => {
    try {
      const res = await API.post('customer.php?action=accept_bid', { order_id: orderId, bid_id: bidId });
      if (res.data.success) {
        Alert.alert('Chauffeur confirmé !', 'Votre coursier est en route vers le point de retrait.');
        fetchOrders();
      }
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de valider.');
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucune course en cours aujourd'hui.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.orderCode}>Course #{item.code}</Text>
              <Text style={styles.badgeStatus}>{item.status}</Text>
            </View>

            <Text style={styles.routeText}>📍 {item.pickup_address}</Text>
            <Text style={styles.routeText}>🏁 {item.delivery_address}</Text>

            {/* Liste des devis des chauffeurs (Style Image 4[cite: 14]) */}
            {item.status === 'SEARCHING' && item.bids?.length > 0 && (
              <View style={styles.bidsWrapper}>
                <Text style={styles.bidsTitle}>Transporteurs disponibles :</Text>
                {item.bids.map(b => (
                  <View key={b.bid_id} style={styles.bidCard}>
                    <View style={styles.driverAvatar}>
                      <Ionicons name="person" size={24} color="#64748B" />
                    </View>
                    <View style={styles.driverInfo}>
                      <Text style={styles.driverName}>{b.full_name}</Text>
                      <View style={styles.ratingRow}>
                        <Ionicons name="star" size={14} color="#F59E0B" />
                        <Text style={styles.ratingText}>5.0 • {b.moto_brand}</Text>
                      </View>
                    </View>
                    <View style={styles.actionCol}>
                      <Text style={styles.bidPrice}>{b.bid_amount} DA</Text>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => acceptBid(item.id, b.bid_id)}
                      >
                        <Text style={styles.acceptText}>ACCEPT</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 14 },
  empty: { textAlign: 'center', marginTop: 40, color: '#94A3B8' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  orderCode: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  badgeStatus: { backgroundColor: '#FFF0EC', color: '#FF6B4A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 11, fontWeight: 'bold' },
  routeText: { fontSize: 13, color: '#475569', marginVertical: 2 },
  bidsWrapper: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 },
  bidsTitle: { fontSize: 13, fontWeight: 'bold', color: '#334155', marginBottom: 8 },
  bidCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  driverAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  driverInfo: { flex: 1, marginLeft: 10 },
  driverName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  ratingText: { fontSize: 11, color: '#64748B', marginLeft: 4 },
  actionCol: { alignItems: 'flex-end' },
  bidPrice: { fontSize: 15, fontWeight: '900', color: '#1E293B', marginBottom: 4 },
  acceptBtn: { backgroundColor: '#22C55E', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  acceptText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
});