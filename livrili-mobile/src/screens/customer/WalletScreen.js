// src/screens/customer/WalletScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemeLang, COLORS } from '../../context/ThemeLanguageContext';
import apiClient from '../../api/client';

export default function WalletScreen() {
  const { t, isRTL } = useThemeLang();
  const [modes, setModes] = useState([]);
  const [loading, setLoading] = useState(true);

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlignDir = isRTL ? 'right' : 'left';

  useEffect(() => {
    apiClient
      .get('customer.php?action=get_transport_modes')
      .then((res) => {
        if (res.data?.transport_modes) {
          setModes(res.data.transport_modes);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.balanceCard}>
        <View style={[styles.cardHeader, { flexDirection: rowDir }]}>
          <Ionicons name="wallet-outline" size={28} color="#FFF" />
          <Text style={styles.cardBadge}>ALGÉRIE DZD</Text>
        </View>
        <Text style={[styles.balanceLabel, { textAlign: textAlignDir }]}>
          {t('walletBalance')}
        </Text>
        <Text style={[styles.balanceValue, { textAlign: textAlignDir }]}>
          {t('cashOnDelivery')}
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { textAlign: textAlignDir }]}>
        {t('officialRatesTitle')}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
      ) : (
        modes.map((item) => {
          const vehicleTitle = isRTL && item.title_ar ? item.title_ar : item.title_fr;
          return (
            <View key={item.id} style={[styles.rateRow, { flexDirection: rowDir }]}>
              <View style={{ flexDirection: rowDir, alignItems: 'center', flex: 1 }}>
                <MaterialCommunityIcons
                  name={item.icon || 'motorbike'}
                  size={28}
                  color={item.color || COLORS.primary}
                  style={{ marginHorizontal: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rateTitle, { textAlign: textAlignDir }]}>
                    {vehicleTitle}
                  </Text>
                  <Text style={[styles.rateSub, { textAlign: textAlignDir }]}>
                    {item.pricing_mode === 'flat_commune'
                      ? `${t('flatCommuneDesc')} ${item.commune_max_km} km)`
                      : `${item.base_km} ${t('firstKmIncluded')}`}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
                <Text style={styles.rateBase}>
                  {t('baseRateLabel')} {item.base_price} DA
                </Text>
                <Text style={styles.rateKm}>+ {item.per_km} DA / km</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 40 },
  balanceCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    padding: 22,
    marginBottom: 24,
  },
  cardHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#FFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontWeight: '700',
    fontSize: 12,
  },
  balanceLabel: { color: '#E2E8F0', fontSize: 14 },
  balanceValue: { color: '#FFF', fontSize: 20, fontWeight: '800', marginTop: 4 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 12,
  },
  rateRow: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rateTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textDark },
  rateSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  rateBase: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  rateKm: { fontSize: 12, color: COLORS.secondary, fontWeight: '600' },
});