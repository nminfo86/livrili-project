// src/screens/customer/OrdersScreen.js
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  ScrollView,
  Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons, Fontisto } from "@expo/vector-icons";
import apiClient from "../../api/client";
import { COLORS, FONTS, SHADOWS, useThemeLang } from "../../context/ThemeLanguageContext";

export default function OrdersScreen({ route }) {
  const { t, isRTL } = useThemeLang();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef(null);

  // Modal pour afficher les détails d'une course terminée
  const [selectedDeliveredOrder, setSelectedDeliveredOrder] = useState(null);

  const targetOrderId = route?.params?.newOrderId;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const rowDir = isRTL ? "row-reverse" : "row";
  const textAlignDir = isRTL ? "right" : "left";

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, []);

  const fetchOrders = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get("/customer.php?action=my_orders");
      let list = [];
      if (res.data?.orders) {
        list = res.data.orders;
      } else if (Array.isArray(res.data)) {
        list = res.data;
      }
      setOrders(list);

      if (targetOrderId && flatListRef.current) {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 300);
      }
    } catch (e) {
      console.log("Fetch orders error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
      const interval = setInterval(() => {
        fetchOrders(true);
      }, 5000);
      return () => clearInterval(interval);
    }, [targetOrderId])
  );

  const handleAcceptBid = async (orderId, bidId) => {
    try {
      const res = await apiClient.post("/customer.php?action=accept_bid", {
        order_id: orderId,
        bid_id: bidId,
      });
      if (res.data?.success) {
        fetchOrders(true);
      } else {
        Alert.alert("Info", res.data?.error || "Impossible de valider cette offre.");
      }
    } catch (e) {
      Alert.alert("Erreur", "Impossible de contacter le serveur.");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "SEARCHING":
        return { label: t("statusSearching"), bg: "#FEF3C7", color: "#D97706", isSearching: true };
      case "DRIVER_ASSIGNED":
        return { label: t("statusAssigned"), bg: "#DBEAFE", color: "#1D4ED8" };
      case "PICKED_UP":
        return { label: t("statusPickedUp"), bg: "#E0E7FF", color: "#4F46E5" };
      case "DELIVERED":
        return { label: t("statusDelivered"), bg: "#D1FAE5", color: "#059669" };
      case "CANCELLED":
        return { label: t("statusCancelled"), bg: "#FEE2E2", color: "#DC2626" };
      default:
        return { label: status, bg: "#F1F5F9", color: "#475569" };
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <Text style={styles.headerTitle}>{t("myBookings")}</Text>
        <TouchableOpacity onPress={() => fetchOrders(false)} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading && orders.length === 0 ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={orders}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchOrders(false);
              }}
              colors={[COLORS.primary]}
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={56} color="#CBD5E1" />
              <Text style={styles.emptyText}>{t("noOrdersYet")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const badge = getStatusBadge(item.status);
            const isHighlight = String(item.id) === String(targetOrderId) || item.status === "SEARCHING";
            const isDelivered = item.status === "DELIVERED";
            const isAssigned = item.status === "DRIVER_ASSIGNED" || item.status === "PICKED_UP";

            return (
              <TouchableOpacity
                activeOpacity={isDelivered ? 0.75 : 1}
                onPress={() => {
                  if (isDelivered) setSelectedDeliveredOrder(item);
                }}
                style={[styles.card, isHighlight && styles.cardHighlight]}
              >
                {/* En-tête */}
                <View style={[styles.cardTop, { flexDirection: rowDir }]}>
                  <Text style={styles.orderCode}>#{item.code || item.id}</Text>
                  {badge.isSearching ? (
                    <Animated.View
                      style={[
                        styles.badge,
                        { backgroundColor: badge.bg, opacity: pulseAnim, flexDirection: rowDir, alignItems: "center" },
                      ]}
                    >
                      <ActivityIndicator size="small" color={badge.color} style={{ marginHorizontal: 4 }} />
                      <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                    </Animated.View>
                  ) : (
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  )}
                </View>

                {/* Adresses */}
                <View style={styles.routeBox}>
                  <View style={[styles.routeLine, { flexDirection: rowDir }]}>
                    <Ionicons name="radio-button-on" size={16} color={COLORS.primary} />
                    <Text style={[styles.addressText, { textAlign: textAlignDir }]} numberOfLines={1}>
                      {item.pickup_address}
                    </Text>
                  </View>
                  <View style={[styles.routeLine, { flexDirection: rowDir }]}>
                    <Ionicons name="location" size={16} color={COLORS.danger} />
                    <Text style={[styles.addressText, { textAlign: textAlignDir }]} numberOfLines={1}>
                      {item.delivery_address}
                    </Text>
                  </View>
                </View>

                {/* Diffusion de recherche */}
                {badge.isSearching && (!item.bids || item.bids.length === 0) && (
                  <View style={[styles.searchingBanner, { flexDirection: rowDir }]}>
                    <Animated.View style={{ opacity: pulseAnim, marginHorizontal: 6 }}>
                      <MaterialCommunityIcons name="radar" size={22} color="#D97706" />
                    </Animated.View>
                    <Text style={[styles.searchingBannerText, { textAlign: textAlignDir }]}>
                      Recherche de livreurs à proximité en cours...
                    </Text>
                  </View>
                )}

                {/* LISTE DES OFFRES REÇUES AVEC FIABILITÉ */}
                {item.status === "SEARCHING" && Array.isArray(item.bids) && item.bids.length > 0 && (
                  <View style={styles.bidsBox}>
                    <Text style={[styles.bidsTitle, { textAlign: textAlignDir }]}>
                      Offres reçues ({item.bids.length}) :
                    </Text>
                    {item.bids.map((b) => (
                      <View key={b.bid_id} style={[styles.bidRow, { flexDirection: rowDir }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.bidDriverName, { textAlign: textAlignDir }]}>
                            {b.full_name} ({b.moto_brand})
                          </Text>
                          {/* Fiabilité du livreur */}
                          <View style={[styles.ratingRow, { flexDirection: rowDir }]}>
                            <Ionicons name="star" size={14} color="#D97706" />
                            <Text style={styles.bidRatingText}>
                              {Number(b.rating ?? 100).toFixed(0)}% de fiabilité
                            </Text>
                          </View>
                          <Text style={[styles.bidPrice, { textAlign: textAlignDir }]}>
                            {b.bid_amount} DA
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.acceptBidBtn}
                          onPress={() => handleAcceptBid(item.id, b.bid_id)}
                        >
                          <Text style={styles.acceptBidText}>Accepter</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* DÉTAILS DU LIVREUR ASSIGNÉ APRÈS ACCEPTATION */}
                {isAssigned && item.driver_name && (
                  <View style={styles.assignedDriverCard}>
                    <View style={[styles.driverHeader, { flexDirection: rowDir }]}>
                      <View style={styles.driverAvatar}>
                        <Fontisto name="motorcycle" size={16} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1, marginHorizontal: 8 }}>
                        <Text style={[styles.assignedDriverName, { textAlign: textAlignDir }]}>
                          Livreur : {item.driver_name}
                        </Text>
                        <Text style={[styles.assignedDriverVehicle, { textAlign: textAlignDir }]}>
                          {item.driver_vehicle_brand} • {item.driver_vehicle_color} ({item.driver_plate})
                        </Text>
                      </View>
                      {item.driver_phone ? (
                        <TouchableOpacity
                          style={styles.callDriverBtn}
                          onPress={() => Linking.openURL(`tel:${item.driver_phone}`)}
                        >
                          <Ionicons name="call" size={16} color="#FFF" />
                          <Text style={styles.callDriverBtnText}>Appeler</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                )}

                {/* Pied de carte */}
                <View style={[styles.cardFooter, { flexDirection: rowDir }]}>
                  <Text style={styles.vehicleType}>
                    {String(item.vehicle_type || "moto").toUpperCase()} • {item.distance_km} km
                  </Text>
                  <Text style={styles.priceText}>
                    {item.agreed_fee > 0 ? item.agreed_fee : item.estimated_price} DA
                  </Text>
                </View>

                {/* Indication clic si livrée */}
                {isDelivered && (
                  <View style={[styles.deliveredHintRow, { flexDirection: rowDir }]}>
                    <Ionicons name="information-circle-outline" size={15} color="#059669" />
                    <Text style={styles.deliveredHintText}>
                      Course terminée • Cliquez pour voir le reçu complet
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* MODAL RÉCAPITULATIVE COMPLÈTE DE LA COURSE LIVRÉE */}
      <Modal visible={Boolean(selectedDeliveredOrder)} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalHeader, { flexDirection: rowDir }]}>
              <View style={{ flexDirection: rowDir, alignItems: "center" }}>
                <Ionicons name="checkmark-circle" size={24} color="#059669" />
                <Text style={[styles.modalTitle, { marginHorizontal: 8 }]}>Détails de la course</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedDeliveredOrder(null)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {selectedDeliveredOrder && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.recapSection}>
                  <Text style={styles.recapCode}>Commande #{selectedDeliveredOrder.code}</Text>
                  <Text style={styles.recapPrice}>
                    {selectedDeliveredOrder.agreed_fee || selectedDeliveredOrder.estimated_price} DA
                  </Text>
                  <Text style={styles.recapSub}>
                    Payé par : {selectedDeliveredOrder.payment_by === 'sender' ? 'L’expéditeur (Au départ)' : 'Le destinataire (À l’arrivée)'}
                  </Text>
                </View>

                {/* Adresses */}
                <View style={styles.recapBox}>
                  <Text style={styles.recapLabel}>Départ :</Text>
                  <Text style={styles.recapValue}>{selectedDeliveredOrder.pickup_address}</Text>

                  <View style={styles.recapDivider} />

                  <Text style={styles.recapLabel}>Arrivée :</Text>
                  <Text style={styles.recapValue}>{selectedDeliveredOrder.delivery_address}</Text>
                </View>

                {/* Détails du coursier */}
                {selectedDeliveredOrder.driver_name && (
                  <View style={styles.recapBox}>
                    <Text style={styles.recapLabel}>Livreur ayant assuré la course :</Text>
                    <Text style={styles.recapValueBold}>{selectedDeliveredOrder.driver_name}</Text>
                    {selectedDeliveredOrder.driver_phone ? (
                      <Text style={styles.recapSub}>Tél : {selectedDeliveredOrder.driver_phone}</Text>
                    ) : null}
                    <Text style={styles.recapSub}>
                      Véhicule : {selectedDeliveredOrder.driver_vehicle_brand} ({selectedDeliveredOrder.driver_plate || 'Immatriculé'})
                    </Text>
                  </View>
                )}

                {/* Description & Distance */}
                <View style={styles.recapBox}>
                  <Text style={styles.recapLabel}>Colis & Distance :</Text>
                  <Text style={styles.recapValue}>
                    {selectedDeliveredOrder.parcel_description || 'Colis standard'}
                  </Text>
                  <Text style={styles.recapSub}>Distance totale : ~{selectedDeliveredOrder.distance_km} km</Text>
                </View>

                <TouchableOpacity
                  style={styles.closeModalBtn}
                  onPress={() => setSelectedDeliveredOrder(null)}
                >
                  <Text style={styles.closeModalBtnText}>Fermer</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 44 },
  header: { justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14 },
  headerTitle: { fontSize: 22, fontFamily: FONTS.bold, fontWeight: "900", color: COLORS.textDark },
  refreshBtn: { padding: 6 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  cardHighlight: { borderColor: COLORS.primary, backgroundColor: "#FFFBF7" },
  cardTop: { justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  orderCode: { fontSize: 16, fontFamily: FONTS.bold, fontWeight: "900", color: COLORS.textDark },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 12, fontFamily: FONTS.bold, fontWeight: "800" },
  routeBox: { marginBottom: 10 },
  routeLine: { alignItems: "center", marginVertical: 3 },
  addressText: { marginHorizontal: 8, fontSize: 14, fontFamily: FONTS.medium, color: "#334155", flex: 1, fontWeight: "600" },
  searchingBanner: {
    backgroundColor: "#FEF3C7",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  searchingBannerText: { flex: 1, color: "#B45309", fontSize: 12, fontFamily: FONTS.medium, fontWeight: "700" },
  bidsBox: {
    backgroundColor: COLORS.primaryLight,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  bidsTitle: { fontSize: 13, fontFamily: FONTS.bold, fontWeight: "900", color: COLORS.primary, marginBottom: 8 },
  bidRow: { alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(234, 88, 12, 0.2)" },
  bidDriverName: { fontSize: 13, fontFamily: FONTS.bold, fontWeight: "800", color: COLORS.textDark },
  ratingRow: { alignItems: "center", marginTop: 2 },
  bidRatingText: { fontSize: 11, fontFamily: FONTS.medium, fontWeight: "700", color: "#D97706", marginHorizontal: 4 },
  bidPrice: { fontSize: 15, fontFamily: FONTS.bold, fontWeight: "900", color: COLORS.primary, marginTop: 2 },
  acceptBidBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  acceptBidText: { color: COLORS.white, fontFamily: FONTS.bold, fontSize: 12, fontWeight: "900" },
  assignedDriverCard: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1.5,
    borderColor: "#86EFAC",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  driverHeader: { alignItems: "center", justifyContent: "space-between" },
  driverAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  assignedDriverName: { fontSize: 13, fontFamily: FONTS.bold, fontWeight: "800", color: "#166534" },
  assignedDriverVehicle: { fontSize: 11, fontFamily: FONTS.medium, color: "#475569", marginTop: 1 },
  callDriverBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#16A34A", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  callDriverBtnText: { color: "#FFF", fontSize: 11, fontFamily: FONTS.bold, fontWeight: "800", marginLeft: 4 },
  cardFooter: { justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingTop: 10 },
  vehicleType: { fontSize: 12, fontFamily: FONTS.bold, fontWeight: "700", color: COLORS.textMuted },
  priceText: { fontSize: 16, fontFamily: FONTS.bold, fontWeight: "900", color: COLORS.primary },
  deliveredHintRow: { alignItems: "center", marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  deliveredHintText: { fontSize: 11, fontFamily: FONTS.medium, fontWeight: "700", color: "#059669", marginHorizontal: 4 },
  emptyBox: { alignItems: "center", marginTop: 80 },
  emptyText: { marginTop: 12, fontFamily: FONTS.medium, color: COLORS.textMuted, fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.65)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: "85%", ...SHADOWS.floating },
  modalHeader: { justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontFamily: FONTS.bold, fontWeight: "900", color: "#0F172A" },
  recapSection: { alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 14, padding: 14, marginBottom: 14 },
  recapCode: { fontSize: 14, fontFamily: FONTS.bold, fontWeight: "800", color: "#475569" },
  recapPrice: { fontSize: 26, fontFamily: FONTS.bold, fontWeight: "900", color: COLORS.primary, marginVertical: 4 },
  recapSub: { fontSize: 12, fontFamily: FONTS.medium, color: "#64748B" },
  recapBox: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#E2E8F0" },
  recapLabel: { fontSize: 12, fontFamily: FONTS.bold, fontWeight: "800", color: "#64748B", marginBottom: 2 },
  recapValue: { fontSize: 14, fontFamily: FONTS.medium, fontWeight: "600", color: "#0F172A" },
  recapValueBold: { fontSize: 15, fontFamily: FONTS.bold, fontWeight: "800", color: "#0F172A" },
  recapDivider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 8 },
  closeModalBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 12, marginBottom: 10 },
  closeModalBtnText: { color: "#FFFFFF", fontFamily: FONTS.bold, fontSize: 15, fontWeight: "900" },
});