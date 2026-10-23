// src/screens/driver/DriverBidsScreen.js
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { addNotificationReceivedListener } from '../../services/NotificationService';
import API from '../../api/client';
import { useThemeLang, COLORS } from '../../context/ThemeLanguageContext';

export default function DriverBidsScreen({ route }) {
  const { t, isRTL } = useThemeLang();
  const flatListRef = useRef(null);

  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState(null);

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlignDir = isRTL ? 'right' : 'left';

  const focusOrderId = route?.params?.focusOrderId || null;

  const fetchDriverBids = async () => {
    try {
      const res = await API.get('driver.php?action=driver_bids');
      if (res.data?.success) {
        const list = res.data.bids || [];
        setBids(list);

        if (focusOrderId) {
          setHighlightedOrderId(Number(focusOrderId));
          const idx = list.findIndex(
            (b) => Number(b.order_id || b.parcel_order_id) === Number(focusOrderId)
          );
          if (idx >= 0 && flatListRef.current) {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({
                index: idx,
                animated: true,
                viewPosition: 0.1,
              });
            }, 300);
          }
        }
      }
    } catch (e) {
      console.log('Error fetching bids:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDriverBids();
    }, [focusOrderId, route?.params?.timestamp])
  );

  // Rafraîchir automatiquement si l'offre est acceptée pendant que l'écran est ouvert
  useEffect(() => {
    const sub = addNotificationReceivedListener((notif) => {
      const data = notif?.request?.content?.data;
      if (data?.type === 'BID_ACCEPTED') {
        if (data?.orderId) setHighlightedOrderId(Number(data.orderId));
        fetchDriverBids();
      }
    });
    return () => sub.remove();
  }, []);

  const updateOrderStep = async (orderId, step) => {
    try {
      const res = await API.post('driver.php?action=update_step', {
        order_id: orderId,
        step: step,
      });
      if (res.data?.success) {
        Alert.alert(
          'Succès',
          step === 'PICKED_UP' ? 'Colis récupéré !' : 'Course livrée avec succès !'
        );
        fetchDriverBids();
      }
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut.');
    }
  };

  const getBidBadge = (status, orderStatus) => {
    if (orderStatus === 'DELIVERED') {
      return { label: '✅ Livré', bg: '#D1FAE5', color: '#059669' };
    }
    if (orderStatus === 'PICKED_UP') {
      return { label: '📦 Colis récupéré', bg: '#E0E7FF', color: '#4F46E5' };
    }
    if (status === 'accepted' || orderStatus === 'DRIVER_ASSIGNED') {
      return { label: '🎉 Acceptée par le client', bg: COLORS.primaryLight, color: COLORS.primary };
    }
    if (status === 'rejected') {
      return { label: '❌ Refusée', bg: '#FEE2E2', color: '#DC2626' };
    }
    return { label: '⏳ En attente de réponse', bg: '#FEF3C7', color: '#D97706' };
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={bids}
          keyExtractor={(item) => String(item.bid_id || item.id)}
          onScrollToIndexFailed={() => {}}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchDriverBids();
              }}
              colors={[COLORS.primary]}
            />
          }
          contentContainerStyle={{ padding: 14 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="time-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Aucune offre envoyée récemment.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getBidBadge(item.bid_status, item.order_status);
            const isAccepted =
              (item.bid_status === 'accepted' ||
                item.order_status === 'DRIVER_ASSIGNED' ||
                item.order_status === 'PICKED_UP') &&
              item.order_status !== 'DELIVERED';
            const isHighlighted =
              Number(item.order_id || item.parcel_order_id) === Number(highlightedOrderId);

            return (
              <View style={[styles.card, isHighlighted && styles.cardHighlighted]}>
                <View style={[styles.cardHead, { flexDirection: rowDir }]}>
                  <Text style={styles.code}>#{item.code}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                </View>

                <Text style={[styles.line, { textAlign: textAlignDir }]}>
                  🟢 Départ : {item.pickup_address}
                </Text>
                <Text style={[styles.line, { textAlign: textAlignDir }]}>
                  🔴 Arrivée : {item.delivery_address}
                </Text>
                <Text style={[styles.price, { textAlign: textAlignDir }]}>
                  Votre offre : <Text style={{ fontWeight: '900' }}>{item.bid_amount} DA</Text>
                </Text>

                {isAccepted && (
                  <View style={styles.acceptedBox}>
                    <Text style={[styles.clientInfo, { textAlign: textAlignDir }]}>
                      👤 Client : {item.client_name} ({item.client_phone})
                    </Text>

                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => Linking.openURL(`tel:${item.client_phone}`)}
                    >
                      <Ionicons name="call" size={16} color="#FFF" />
                      <Text style={styles.callBtnText}>Appeler le client</Text>
                    </TouchableOpacity>

                    {item.order_status === 'DRIVER_ASSIGNED' && (
                      <TouchableOpacity
                        style={styles.stepBtn}
                        onPress={() => updateOrderStep(item.order_id, 'PICKED_UP')}
                      >
                        <Text style={styles.stepBtnText}>Marquer Colis Récupéré</Text>
                      </TouchableOpacity>
                    )}

                    {item.order_status === 'PICKED_UP' && (
                      <TouchableOpacity
                        style={[styles.stepBtn, { backgroundColor: '#059669' }]}
                        onPress={() => updateOrderStep(item.order_id, 'DELIVERED')}
                      >
                        <Text style={styles.stepBtnText}>Marquer Course Livrée / Terminée</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  emptyBox: { alignItems: 'center', marginTop: 80, paddingHorizontal: 20 },
  emptyText: { marginTop: 10, color: COLORS.textMuted, fontSize: 13 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
  },
  cardHighlighted: {
    borderColor: COLORS.primary,
    borderWidth: 2.5,
    backgroundColor: '#F0FDF4',
  },
  cardHead: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  code: { fontWeight: '800', fontSize: 14, color: COLORS.primary },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  line: { fontSize: 13, color: COLORS.textDark, marginVertical: 2, fontWeight: '600' },
  price: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: 4 },
  acceptedBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  clientInfo: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 8 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 6,
  },
  callBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12, marginLeft: 6 },
  stepBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  stepBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
});