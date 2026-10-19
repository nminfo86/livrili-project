import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import API from '../../api/client';

export default function DriverPoolScreen() {
  const [orders, setOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadPool = async () => {
    try {
      const res = await API.get('driver.php?action=pool');
      if (res.data.success) {
        setOrders(res.data.pool || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadPool();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPool();
    setRefreshing(false);
  };

  const handleSendBid = async (orderId, estPrice) => {
    const p1 = Number(estPrice);
    const p2 = p1 + 50;

    Alert.alert(
      'Proposer un tarif',
      `Sélectionnez votre offre pour la course :`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: `${p1} DA`, onPress: () => submitBid(orderId, p1) },
        { text: `${p2} DA`, onPress: () => submitBid(orderId, p2) },
      ]
    );
  };

  const submitBid = async (orderId, amount) => {
    try {
      const res = await API.post('driver.php?action=submit_bid', {
        order_id: orderId,
        amount: amount,
      });

      if (res.data.success) {
        Alert.alert('Succès', `Votre offre de ${amount} DA a été transmise au client !`);
        loadPool();
      } else {
        Alert.alert('Erreur', res.data.error || 'Impossible d\'envoyer l\'offre.');
      }
    } catch (e) {
      Alert.alert('Erreur', 'Erreur de connexion au serveur.');
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucune course disponible dans votre zone pour le moment.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.code}>#{item.code} ({item.time})</Text>
              {item.is_round_trip == 1 && <Text style={styles.roundBadge}>🔄 Aller-Retour</Text>}
            </View>
            <Text style={styles.line}>📍 Départ : {item.pickup_address}</Text>
            <Text style={styles.line}>🏁 Arrivée : {item.delivery_address}</Text>
            <Text style={styles.desc}>📦 {item.parcel_description}</Text>
            <Text style={styles.price}>Prix suggéré : {item.estimated_price} DA</Text>

            <TouchableOpacity
              style={styles.btnBid}
              onPress={() => handleSendBid(item.id, item.estimated_price)}
            >
              <Text style={styles.btnBidText}>Faire une offre</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8', padding: 12 },
  empty: { textAlign: 'center', marginTop: 40, color: '#888' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1 },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  code: { fontWeight: 'bold', fontSize: 14, color: '#1976d2' },
  roundBadge: { backgroundColor: '#e3f2fd', color: '#1976d2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 11, fontWeight: 'bold' },
  line: { fontSize: 13, color: '#333', marginVertical: 2 },
  desc: { fontSize: 12, color: '#666', marginVertical: 2 },
  price: { fontSize: 13, fontWeight: 'bold', color: '#2e7d32', marginTop: 4 },
  btnBid: { backgroundColor: '#1976d2', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnBidText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});