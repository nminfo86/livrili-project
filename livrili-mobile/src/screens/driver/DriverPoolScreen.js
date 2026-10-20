// src/screens/driver/DriverPoolScreen.js
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import API from '../../api/client';
import { COLORS } from '../../context/ThemeLanguageContext';

export default function DriverPoolScreen() {
  const [orders, setOrders] = useState([]);
  const [driverVType, setDriverVType] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadPool = async () => {
    try {
      const res = await API.get('driver.php?action=pool');
      if (res.data?.success) {
        setOrders(res.data.pool || []);
        if (res.data.driver_vtype) setDriverVType(res.data.driver_vtype);
      } else if (res.data?.error) {
        Alert.alert('Information Livreur', res.data.error);
      }
    } catch (e) {
      const msg = e.response?.data?.error || 'Impossible de charger les courses disponibles.';
      Alert.alert('Attention', msg);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPool();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPool();
    setRefreshing(false);
  };

  const handleSendBid = (item) => {
    const p1 = Number(item.estimated_price);
    const step = Number(item.bid_step || 50);
    const p2 = p1 + step;
    const p3 = p1 + step * 2;

    Alert.alert('Proposer un tarif', 'Sélectionnez votre offre pour cette course :', [
      { text: 'Annuler', style: 'cancel' },
      { text: `${p1} DA (Prix suggéré)`, onPress: () => submitBid(item.id, p1) },
      { text: `${p2} DA`, onPress: () => submitBid(item.id, p2) },
      { text: `${p3} DA`, onPress: () => submitBid(item.id, p3) },
    ]);
  };

  const submitBid = async (orderId, amount) => {
    try {
      const res = await API.post('driver.php?action=submit_bid', {
        order_id: orderId,
        amount: amount,
      });
      if (res.data?.success) {
        Alert.alert('Succès', `Votre offre de ${amount} DA a été transmise au client !`);
        loadPool();
      } else {
        Alert.alert('Erreur', res.data?.error || "Impossible d'envoyer l'offre.");
      }
    } catch (e) {
      Alert.alert('Erreur', e.response?.data?.error || 'Erreur de connexion au serveur.');
    }
  };

  return (
    <View style={styles.container}>
      {driverVType ? (
        <View style={styles.filterBanner}>
          <Ionicons name="funnel-outline" size={15} color={COLORS.primary} />
          <Text style={styles.filterBannerText}>
            Courses filtrées pour votre véhicule : {driverVType.toUpperCase()}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={orders}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="navigate-circle-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.empty}>
              Aucune course disponible pour votre type de véhicule dans votre zone actuellement.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.code}>
                #{item.code} ({item.time})
              </Text>
              {Number(item.is_round_trip) === 1 && (
                <Text style={styles.roundBadge}>🔄 Aller-Retour</Text>
              )}
            </View>

            <Text style={styles.line}>📍 Départ : {item.pickup_address}</Text>
            <Text style={styles.line}>🏁 Arrivée : {item.delivery_address}</Text>
            <Text style={styles.desc}>📦 {item.parcel_description}</Text>
            <Text style={styles.price}>
              Prix suggéré : {item.estimated_price} DA (~{item.distance_km} km)
            </Text>

            <TouchableOpacity style={styles.btnBid} onPress={() => handleSendBid(item)}>
              <Text style={styles.btnBidText}>Faire une offre</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  filterBannerText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  emptyBox: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  empty: { textAlign: 'center', marginTop: 10, color: COLORS.textMuted, fontSize: 13 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  code: { fontWeight: '800', fontSize: 14, color: COLORS.primary },
  roundBadge: {
    backgroundColor: COLORS.primaryLight,
    color: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 'bold',
  },
  line: { fontSize: 13, color: COLORS.textDark, marginVertical: 2, fontWeight: '600' },
  desc: { fontSize: 12, color: COLORS.textMuted, marginVertical: 3 },
  price: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginTop: 4 },
  btnBid: {
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  btnBidText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
});