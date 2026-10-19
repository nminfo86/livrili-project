import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeLang, COLORS } from '../../context/ThemeLanguageContext';

export default function WalletScreen() {
  const { t } = useThemeLang();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.balanceCard}>
        <View style={styles.cardHeader}>
          <Ionicons name="wallet-outline" size={28} color="#FFF" />
          <Text style={styles.cardBadge}>ALGÉRIE DZD</Text>
        </View>
        <Text style={styles.balanceLabel}>{t('walletBalance')}</Text>
        <Text style={styles.balanceValue}>Paiement Cash à la livraison</Text>
      </View>

      <Text style={styles.sectionTitle}>Grille Tarifaire Officielle Livrili</Text>

      {[
        { title: 'Moto Express', base: '200 DA', km: '50 DA / km' },
        { title: 'Voiture', base: '350 DA', km: '70 DA / km' },
        { title: 'Camionnette (DFSK / Harbin)', base: '600 DA', km: '100 DA / km' },
        { title: 'Fourgon', base: '900 DA', km: '150 DA / km' },
      ].map((item, idx) => (
        <View key={idx} style={styles.rateRow}>
          <View>
            <Text style={styles.rateTitle}>{item.title}</Text>
            <Text style={styles.rateSub}>2 premiers km inclus</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.rateBase}>Départ : {item.base}</Text>
            <Text style={styles.rateKm}>+ {item.km}</Text>
          </View>
        </View>
      ))}
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
    flexDirection: 'row',
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
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
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