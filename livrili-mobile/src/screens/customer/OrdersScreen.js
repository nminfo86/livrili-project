// src/screens/customer/OrdersScreen.js
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
  Modal,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { addNotificationReceivedListener } from '../../services/NotificationService';
import API from '../../api/client';
import { useThemeLang, COLORS } from '../../context/ThemeLanguageContext';

export default function OrdersScreen({ route }) {
  const { t, isRTL } = useThemeLang();
  const flatListRef = useRef(null);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlignDir = isRTL ? 'right' : 'left';

  const targetOrderId = route?.params?.focusOrderId || route?.params?.newOrderId || null;

  const fetchOrders = async () => {
    try {
      const res = await API.get('customer.php?action=my_orders');
      if (res.data?.success) {
        const list = res.data.orders || [];
        setOrders(list);

        if (targetOrderId) {
          setHighlightedOrderId(Number(targetOrderId));
          const idx = list.findIndex((o) => Number(o.id) === Number(targetOrderId));
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
      console.log('Error fetching customer orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [targetOrderId, route?.params?.timestamp])
  );

  // Rafraîchir la liste en temps réel si une notification arrive pendant que l'écran est ouvert
  useEffect(() => {
    const sub = addNotificationReceivedListener((notif) => {
      const data = notif?.request?.content?.data;
      if (data?.orderId) {
        setHighlightedOrderId(Number(data.orderId));
      }
      fetchOrders();
    });
    return () => sub.remove();
  }, []);

  const handleAcceptBid = async (orderId, bidId, amount) => {
    try {
      const res = await API.post('customer.php?action=accept_bid', {
        order_id: orderId,
        bid_id: bidId,
      });
      if (res.data?.success) {
        Alert.alert('Succès', `Offre à ${amount} DA acceptée ! Le livreur est en route.`);
        fetchOrders();
      } else {
        Alert.alert('Erreur', res.data?.error || "Impossible d'accepter cette offre.");
      }
    } catch (e) {
      Alert.alert('Erreur', e.response?.data?.error || 'Erreur serveur.');
    }
  };

  const handleCancelOrder = (orderId) => {
    Alert.alert(
      'Annuler la commande',
      'Voulez-vous vraiment annuler cette course ?',
      [
        { text: t('cancel') || 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await API.post('customer.php?action=cancel_order', {
                order_id: orderId,
              });
              if (res.data?.success) {
                fetchOrders();
              } else {
                Alert.alert('Info', res.data?.error || 'Annulation impossible.');
              }
            } catch (e) {
              Alert.alert('Erreur', 'Impossible de joindre le serveur.');
            }
          },
        },
      ]
    );
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SEARCHING':
        return { label: '🔍 Recherche livreur...', bg: '#FEF3C7', color: '#D97706' };
      case 'DRIVER_ASSIGNED':
        return { label: '🛵 Livreur en route', bg: COLORS.primaryLight, color: COLORS.primary };
      case 'PICKED_UP':
        return { label: '📦 Colis récupéré', bg: '#E0E7FF', color: '#4F46E5' };
      case 'DELIVERED':
        return { label: '✅ Livré', bg: '#D1FAE5', color: '#059669' };
      case 'CANCELLED':
        return { label: '❌ Annulé', bg: '#FEE2E2', color: '#DC2626' };
      default:
        return { label: status, bg: '#F1F5F9', color: '#475569' };
    }
  };

  return (
    <View style={styles.container}>
      <Modal
        visible={!!detailOrder}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailOrder(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setDetailOrder(null)}
          />
          <View style={styles.modalCard}>
            {detailOrder && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.sheetHandle} />
                  <View style={[styles.modalHeaderRow, { flexDirection: rowDir }]}>
                    <View>
                      <Text style={[styles.modalHeaderLabel, { textAlign: textAlignDir }]}>
                        Commande
                      </Text>
                      <Text style={[styles.modalHeaderCode, { textAlign: textAlignDir }]}>
                        #{detailOrder.code}
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.closeBtn} onPress={() => setDetailOrder(null)}>
                      <Ionicons name="close" size={20} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.modalHeaderRow, { flexDirection: rowDir, marginTop: 12 }]}>
                    <View style={styles.headerBadge}>
                      <Text style={styles.headerBadgeText}>
                        {getStatusBadge(detailOrder.status).label}
                      </Text>
                    </View>
                    <Text style={styles.headerPrice}>
                      {Number(detailOrder.agreed_fee) > 0
                        ? detailOrder.agreed_fee
                        : detailOrder.estimated_price}{' '}
                      DA
                    </Text>
                  </View>
                </View>

                <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { textAlign: textAlignDir }]}>Trajet</Text>
                    <View style={[styles.routeRow, { flexDirection: rowDir }]}>
                      <View style={styles.routeTimeline}>
                        <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                        <View style={styles.routeLine} />
                        <View style={[styles.routeDot, { backgroundColor: COLORS.danger }]} />
                      </View>
                      <View style={{ flex: 1, marginHorizontal: 12 }}>
                        <Text style={[styles.routeLabel, { textAlign: textAlignDir }]}>Départ</Text>
                        <Text style={[styles.routeValue, { textAlign: textAlignDir }]}>
                          {detailOrder.pickup_address}
                        </Text>
                        <Text style={[styles.routeLabel, { textAlign: textAlignDir, marginTop: 14 }]}>
                          Arrivée
                        </Text>
                        <Text style={[styles.routeValue, { textAlign: textAlignDir }]}>
                          {detailOrder.delivery_address}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.chipsRow, { flexDirection: rowDir }]}>
                      {Number(detailOrder.distance_km) > 0 && (
                        <View style={styles.chip}>
                          <Ionicons name="navigate-outline" size={13} color={COLORS.primary} />
                          <Text style={styles.chipText}>{detailOrder.distance_km} km</Text>
                        </View>
                      )}
                      {!!detailOrder.is_round_trip && (
                        <View style={styles.chip}>
                          <Ionicons name="repeat" size={13} color={COLORS.primary} />
                          <Text style={styles.chipText}>Aller-retour</Text>
                        </View>
                      )}
                      {!!detailOrder.payment_by && (
                        <View style={styles.chip}>
                          <Ionicons name="wallet-outline" size={13} color={COLORS.primary} />
                          <Text style={styles.chipText}>Payé par {detailOrder.payment_by}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { textAlign: textAlignDir }]}>Colis</Text>
                    <Text style={[styles.routeValue, { textAlign: textAlignDir }]}>
                      {detailOrder.parcel_description || '-'}
                    </Text>
                    {!!detailOrder.recipient_phone && (
                      <View style={[styles.inlineRow, { flexDirection: rowDir }]}>
                        <Ionicons name="person-outline" size={15} color={COLORS.textMuted} />
                        <Text style={styles.inlineText}>
                          Destinataire : {detailOrder.recipient_phone}
                        </Text>
                      </View>
                    )}
                  </View>

                  {!!detailOrder.driver_name && (
                    <View style={styles.section}>
                      <Text style={[styles.sectionTitle, { textAlign: textAlignDir }]}>Livreur</Text>
                      <View style={[styles.driverRow, { flexDirection: rowDir }]}>
                        <View style={styles.driverAvatar}>
                          <Text style={styles.driverAvatarText}>
                            {detailOrder.driver_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, marginHorizontal: 12 }}>
                          <Text style={[styles.routeValue, { textAlign: textAlignDir }]}>
                            {detailOrder.driver_name}
                          </Text>
                          <Text style={[styles.inlineText, { textAlign: textAlignDir }]}>
                            {[
                              detailOrder.driver_vehicle_type,
                              detailOrder.driver_vehicle_brand,
                              detailOrder.driver_vehicle_color,
                              detailOrder.driver_plate,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Véhicule non renseigné'}
                          </Text>
                        </View>
                        <View style={styles.ratingChip}>
                          <Ionicons name="star" size={12} color="#D97706" />
                          <Text style={styles.ratingText}>{detailOrder.driver_rating || 100}%</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <View style={[styles.section, { marginBottom: 0 }]}>
                    <Text style={[styles.sectionTitle, { textAlign: textAlignDir }]}>Chronologie</Text>
                    {[
                      ['Créée', detailOrder.created_at, 'time-outline'],
                      ['Acceptée', detailOrder.accepted_at, 'checkmark-circle-outline'],
                      ['Récupérée', detailOrder.picked_up_at, 'cube-outline'],
                      ['Livrée', detailOrder.delivered_at, 'flag-outline'],
                    ]
                      .filter(([, v]) => v)
                      .map(([label, value, icon]) => (
                        <View key={label} style={[styles.timeRow, { flexDirection: rowDir }]}>
                          <Ionicons name={icon} size={16} color={COLORS.primary} />
                          <Text style={styles.timeLabel}>{label}</Text>
                          <Text style={[styles.timeValue, { textAlign: isRTL ? 'left' : 'right' }]}>
                            {String(value)}
                          </Text>
                        </View>
                      ))}
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={orders}
          keyExtractor={(item) => String(item.id)}
          onScrollToIndexFailed={() => {}}
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
          contentContainerStyle={{ padding: 14 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={48} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Aucune commande pour le moment.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadge(item.status);
            const isHighlighted = Number(item.id) === Number(highlightedOrderId);
            const bids = Array.isArray(item.bids) ? item.bids : [];

            return (
              <TouchableOpacity
                activeOpacity={item.status === 'DELIVERED' ? 0.7 : 1}
                onPress={() => item.status === 'DELIVERED' && setDetailOrder(item)}
                style={[styles.card, isHighlighted && styles.cardHighlighted]}
              >
                {isHighlighted && (
                  <View style={[styles.focusBanner, { flexDirection: rowDir }]}>
                    <Ionicons name="notifications" size={14} color="#FFF" />
                    <Text style={styles.focusBannerText}>Commande sélectionnée</Text>
                  </View>
                )}

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
                <Text style={[styles.desc, { textAlign: textAlignDir }]}>
                  📦 {item.parcel_description}
                </Text>

                <Text style={[styles.price, { textAlign: textAlignDir }]}>
                  Tarif :{' '}
                  <Text style={{ fontWeight: '900' }}>
                    {Number(item.agreed_fee) > 0 ? item.agreed_fee : item.estimated_price} DA
                  </Text>
                </Text>

                {/* Liste des offres des livreurs si la commande est en recherche */}
                {item.status === 'SEARCHING' && bids.length > 0 && (
                  <View style={styles.bidsSection}>
                    <Text style={[styles.bidsTitle, { textAlign: textAlignDir }]}>
                      Offres des livreurs ({bids.length}) :
                    </Text>
                    {bids.map((bid) => (
                      <View
                        key={String(bid.id || bid.bid_id)}
                        style={[styles.bidRow, { flexDirection: rowDir }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.bidDriverName, { textAlign: textAlignDir }]}>
                            🛵 {bid.full_name || 'Livreur'}
                          </Text>
                          <Text style={[styles.inlineText, { textAlign: textAlignDir }]}>
                            Fiabilité : {bid.rating ?? 100}%
                            {bid.vehicle_type ? ` · ${bid.vehicle_type}` : ''}
                          </Text>
                          <Text style={[styles.bidAmount, { textAlign: textAlignDir }]}>
                            {bid.bid_amount} DA
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.acceptBidBtn}
                          onPress={() =>
                            handleAcceptBid(item.id, bid.id || bid.bid_id, bid.bid_amount)
                          }
                        >
                          <Text style={styles.acceptBidText}>Accepter</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Infos du livreur assigné */}
                {item.driver_phone &&
                  (item.status === 'DRIVER_ASSIGNED' || item.status === 'PICKED_UP') && (
                    <View style={styles.driverBox}>
                      <Text style={[styles.driverInfo, { textAlign: textAlignDir }]}>
                        🛵 Livreur : {item.driver_name || 'Assigné'} ({item.driver_phone})
                      </Text>
                      <Text style={[styles.driverInfo, { textAlign: textAlignDir }]}>
                        Fiabilité : {item.driver_rating ?? 100}%
                        {item.driver_vehicle_type ? ` · ${item.driver_vehicle_type}` : ''}
                      </Text>
                      <TouchableOpacity
                        style={styles.callBtn}
                        onPress={() => Linking.openURL(`tel:${item.driver_phone}`)}
                      >
                        <Ionicons name="call" size={16} color="#FFF" />
                        <Text style={styles.callBtnText}>Appeler le livreur</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                {item.status === 'SEARCHING' && (
                  <TouchableOpacity
                    style={styles.cancelOrderBtn}
                    onPress={() => handleCancelOrder(item.id)}
                  >
                    <Text style={styles.cancelOrderText}>Annuler la commande</Text>
                  </TouchableOpacity>
                )}

                {item.status === 'DELIVERED' && (
                  <Text style={styles.detailHint}>Appuyez pour voir les détails</Text>
                )}
              </TouchableOpacity>
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
  focusBanner: {
    backgroundColor: COLORS.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 8,
  },
  focusBannerText: { color: '#FFF', fontSize: 11, fontWeight: '800', marginHorizontal: 4 },
  cardHead: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  code: { fontWeight: '800', fontSize: 14, color: COLORS.primary },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  line: { fontSize: 13, color: COLORS.textDark, marginVertical: 2, fontWeight: '600' },
  desc: { fontSize: 12, color: COLORS.textMuted, marginVertical: 3 },
  price: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: 4 },
  bidsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  bidsTitle: { fontSize: 12, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  bidRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bidDriverName: { fontSize: 12, fontWeight: '700', color: '#334155' },
  bidAmount: { fontSize: 14, fontWeight: '900', color: COLORS.primary, marginTop: 2 },
  acceptBidBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  acceptBidText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  driverBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  driverInfo: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 8 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 8,
    borderRadius: 8,
  },
  callBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12, marginLeft: 6 },
  cancelOrderBtn: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
  },
  cancelOrderText: { color: '#DC2626', fontSize: 12, fontWeight: '700' },
  detailHint: { marginTop: 8, fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  modalHeader: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingBottom: 16,
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
  },
  modalHeaderRow: { justifyContent: 'space-between', alignItems: 'center' },
  modalHeaderLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700' },
  modalHeaderCode: { color: '#FFF', fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    backgroundColor: '#FFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  headerBadgeText: { color: '#059669', fontSize: 12, fontWeight: '800' },
  headerPrice: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  routeRow: { alignItems: 'stretch' },
  routeTimeline: { alignItems: 'center', paddingVertical: 4 },
  routeDot: { width: 12, height: 12, borderRadius: 6 },
  routeLine: { flex: 1, width: 2, backgroundColor: COLORS.border, marginVertical: 2 },
  routeLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  routeValue: { fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginTop: 2 },
  chipsRow: { flexWrap: 'wrap', marginTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginRight: 6,
    marginTop: 4,
  },
  chipText: { color: COLORS.primary, fontSize: 11, fontWeight: '800', marginLeft: 4 },
  inlineRow: { alignItems: 'center', marginTop: 10 },
  inlineText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginHorizontal: 6 },
  driverRow: { alignItems: 'center' },
  driverAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  ratingText: { color: '#D97706', fontSize: 11, fontWeight: '800', marginLeft: 3 },
  timeRow: {
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  timeLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginHorizontal: 8 },
  timeValue: { flex: 1, fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
});