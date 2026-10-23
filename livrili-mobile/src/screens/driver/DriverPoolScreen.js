// src/screens/driver/DriverPoolScreen.js
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { addNotificationReceivedListener } from "../../services/NotificationService";
import API from "../../api/client";
import { useThemeLang, COLORS } from "../../context/ThemeLanguageContext";

export default function DriverPoolScreen({ route }) {
  const { t, isRTL } = useThemeLang();
  const flatListRef = useRef(null);

  const [orders, setOrders] = useState([]);
  const [driverVType, setDriverVType] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [highlightedOrderId, setHighlightedOrderId] = useState(null);

  const rowDir = isRTL ? "row-reverse" : "row";
  const textAlignDir = isRTL ? "right" : "left";

  const focusOrderId = route?.params?.focusOrderId || null;

  const loadPool = async () => {
    try {
      const res = await API.get("driver.php?action=pool");
      if (res.data?.success) {
        const list = res.data.pool || [];
        setOrders(list);
        if (res.data.driver_vtype) setDriverVType(res.data.driver_vtype);

        if (focusOrderId) {
          setHighlightedOrderId(Number(focusOrderId));
          const idx = list.findIndex((o) => Number(o.id) === Number(focusOrderId));
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
      } else if (res.data?.error) {
        Alert.alert("Info", res.data.error);
      }
    } catch (e) {
      const msg =
        e.response?.data?.error ||
        "Impossible de charger les courses disponibles.";
      Alert.alert("Attention", msg);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPool();
    }, [focusOrderId, route?.params?.timestamp]),
  );

  // Rafraîchir automatiquement le pool quand une notification de nouvelle commande arrive
  useEffect(() => {
    const sub = addNotificationReceivedListener((notif) => {
      const data = notif?.request?.content?.data;
      if (data?.type === "NEW_ORDER_POOL") {
        if (data?.orderId) setHighlightedOrderId(Number(data.orderId));
        loadPool();
      }
    });
    return () => sub.remove();
  }, []);

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

    Alert.alert(t("proposeRateTitle"), t("proposeRateMsg"), [
      { text: t("cancel"), style: "cancel" },
      { text: `${p1} DA`, onPress: () => submitBid(item.id, p1) },
      { text: `${p2} DA`, onPress: () => submitBid(item.id, p2) },
      { text: `${p3} DA`, onPress: () => submitBid(item.id, p3) },
    ]);
  };

  const openGoogleMapsRoute = (pLat, pLon, dLat, dLon) => {
    const url = `https://www.google.com/maps/dir/?api=1&origin=${pLat},${pLon}&destination=${dLat},${dLon}&travelmode=driving`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Erreur", "Impossible d'ouvrir Google Maps.");
    });
  };

  const submitBid = async (orderId, amount) => {
    try {
      const res = await API.post("driver.php?action=submit_bid", {
        order_id: orderId,
        amount: amount,
      });
      if (res.data?.success) {
        Alert.alert("OK", `${t("offerSentSuccess")} (${amount} DA)`);
        loadPool();
      } else {
        Alert.alert(
          "Erreur",
          res.data?.error || "Impossible d'envoyer l'offre.",
        );
      }
    } catch (e) {
      Alert.alert(
        "Erreur",
        e.response?.data?.error || "Erreur de connexion au serveur.",
      );
    }
  };

  return (
    <View style={styles.container}>
      {driverVType ? (
        <View style={[styles.filterBanner, { flexDirection: rowDir }]}>
          <Ionicons name="funnel-outline" size={15} color={COLORS.primary} />
          <Text style={styles.filterBannerText}>
            {t("filterVehicleBanner")} {driverVType.toUpperCase()}
          </Text>
        </View>
      ) : null}

      <FlatList
        ref={flatListRef}
        data={orders}
        keyExtractor={(item) => String(item.id)}
        onScrollToIndexFailed={() => {}}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons
              name="navigate-circle-outline"
              size={48}
              color={COLORS.textMuted}
            />
            <Text style={styles.empty}>{t("emptyPoolMsg")}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isHighlighted = Number(item.id) === Number(highlightedOrderId);
          return (
            <View style={[styles.card, isHighlighted && styles.cardHighlighted]}>
              <View style={[styles.head, { flexDirection: rowDir }]}>
                <Text style={styles.code}>
                  #{item.code} ({item.time})
                </Text>
                {Number(item.is_round_trip) === 1 && (
                  <Text style={styles.roundBadge}>🔄 {t("roundTrip")}</Text>
                )}
              </View>

              <Text style={[styles.line, { textAlign: textAlignDir }]}>
                🟢 {t("pickupLabel")} {item.pickup_address}
              </Text>
              <Text style={[styles.line, { textAlign: textAlignDir }]}>
                🔴 {t("arrivalLabel")} {item.delivery_address}
              </Text>
              <Text style={[styles.desc, { textAlign: textAlignDir }]}>
                📦 {item.parcel_description}
              </Text>

              <Text style={[styles.price, { textAlign: textAlignDir }]}>
                {t("suggestedPrice")} : {item.estimated_price} DA (~
                {item.distance_km} km)
              </Text>

              <TouchableOpacity
                style={styles.btnMaps}
                onPress={() =>
                  openGoogleMapsRoute(
                    item.pickup_lat,
                    item.pickup_lon,
                    item.delivery_lat,
                    item.delivery_lon,
                  )
                }
              >
                <Ionicons name="navigate" size={16} color="#2563EB" />
                <Text style={styles.btnMapsText}>
                  Voir le trajet sur Google Maps
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.btnBid}
                onPress={() => handleSendBid(item)}
              >
                <Text style={styles.btnBidText}>{t("makeOfferBtn")}</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  filterBanner: {
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  filterBannerText: {
    marginHorizontal: 6,
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primary,
  },
  emptyBox: { alignItems: "center", marginTop: 60, paddingHorizontal: 20 },
  empty: {
    textAlign: "center",
    marginTop: 10,
    color: COLORS.textMuted,
    fontSize: 13,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
  },
  cardHighlighted: {
    borderColor: COLORS.primary,
    borderWidth: 2.5,
    backgroundColor: "#F0FDF4",
  },
  head: { justifyContent: "space-between", marginBottom: 6 },
  code: { fontWeight: "800", fontSize: 14, color: COLORS.primary },
  roundBadge: {
    backgroundColor: COLORS.primaryLight,
    color: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: "bold",
  },
  line: {
    fontSize: 13,
    color: COLORS.textDark,
    marginVertical: 2,
    fontWeight: "600",
  },
  desc: { fontSize: 12, color: COLORS.textMuted, marginVertical: 3 },
  price: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.primary,
    marginTop: 4,
  },
  btnBid: {
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  btnBidText: { color: COLORS.white, fontWeight: "800", fontSize: 13 },
  btnMaps: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  btnMapsText: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 6,
  },
});