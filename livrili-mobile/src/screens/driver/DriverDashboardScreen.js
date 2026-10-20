// src/screens/driver/DriverDashboardScreen.js
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { useThemeLang, COLORS } from '../../context/ThemeLanguageContext';
import apiClient from '../../api/client';
import { startDriverGpsTracking, stopDriverGpsTracking } from '../../services/LocationTask';

export default function DriverDashboardScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const { t, isRTL } = useThemeLang();
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ rating: '100%', delivered: 0 });

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlignDir = isRTL ? 'right' : 'left';

  useEffect(() => {
    fetchDriverStatus();
  }, []);

  const fetchDriverStatus = async () => {
    try {
      const res = await apiClient.get('driver.php?action=status');
      if (res.data) {
        if (typeof res.data.is_online !== 'undefined') {
          const online = Boolean(Number(res.data.is_online));
          setIsOnline(online);
          if (online) startDriverGpsTracking();
        }
        if (res.data.rating) {
          setStats({
            rating: `${res.data.rating}%`,
            delivered: res.data.delivered_count || 0,
          });
        }
      }
    } catch (e) {}
  };

  const toggleOnlineStatus = async () => {
    const nextState = !isOnline;
    setLoading(true);
    try {
      await apiClient.post('driver.php?action=toggle_online', {
        is_online: nextState ? 1 : 0,
      });
      setIsOnline(nextState);
      if (nextState) {
        await startDriverGpsTracking();
      } else {
        await stopDriverGpsTracking();
      }
    } catch (e) {
      setIsOnline(nextState);
      if (nextState) await startDriverGpsTracking();
      else await stopDriverGpsTracking();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18 }}>
      {/* CARTE STATUT LIVREUR */}
      <View style={styles.statusCard}>
        <View style={[styles.headerRow, { flexDirection: rowDir }]}>
          <View style={[styles.iconCircle, isRTL ? { marginLeft: 12 } : { marginRight: 12 }]}>
            <MaterialCommunityIcons name="motorbike" size={30} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { textAlign: textAlignDir }]}>
              {t('driverSpaceTitle')}
            </Text>
            <Text style={[styles.subtitle, { textAlign: textAlignDir }]}>
              {user?.full_name || t('roleDriver')} • {user?.commune_name || 'El Eulma'}
            </Text>
          </View>
        </View>

        <View style={[styles.statusBadgeBox, { flexDirection: rowDir }]}>
          <View
            style={[
              styles.dot,
              { backgroundColor: isOnline ? COLORS.success : '#94A3B8' },
            ]}
          />
          <Text style={styles.statusText}>
            {t('statusLabel')} {isOnline ? t('statusOnline') : t('statusOffline')}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.toggleBtn,
            {
              flexDirection: rowDir,
              backgroundColor: isOnline ? COLORS.secondary : COLORS.primary,
            },
          ]}
          onPress={toggleOnlineStatus}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name={isOnline ? 'power' : 'flash'} size={20} color="#FFF" />
              <Text style={styles.toggleBtnText}>
                {isOnline ? t('goOfflineBtn') : t('goOnlineBtn')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* BOUTON VOIR LES DEMANDES DISPONIBLES */}
      <TouchableOpacity
        style={[styles.poolActionCard, { flexDirection: rowDir }]}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('DriverPool')}
      >
        <View style={[styles.poolIconBox, isRTL ? { marginLeft: 12 } : { marginRight: 12 }]}>
          <Ionicons name="list-circle" size={28} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.poolActionTitle, { textAlign: textAlignDir }]}>
            {t('viewAvailableOrders')}
          </Text>
          <Text style={[styles.poolActionSub, { textAlign: textAlignDir }]}>
            {t('viewAvailableOrdersSub')}
          </Text>
        </View>
        <Ionicons
          name={isRTL ? 'chevron-back' : 'chevron-forward'}
          size={22}
          color={COLORS.primary}
        />
      </TouchableOpacity>

      {/* STATISTIQUES RAPIDES */}
      <View style={[styles.statsRow, { flexDirection: rowDir }]}>
        <View style={styles.statBox}>
          <Ionicons name="star" size={24} color={COLORS.warning} />
          <Text style={styles.statValue}>{stats.rating}</Text>
          <Text style={styles.statLabel}>{t('reliability')}</Text>
        </View>
        <View style={styles.statBox}>
          <Ionicons name="checkmark-done-circle" size={24} color={COLORS.primary} />
          <Text style={styles.statValue}>{stats.delivered}</Text>
          <Text style={styles.statLabel}>{t('deliveredOrders')}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 3,
  },
  headerRow: { alignItems: 'center', marginBottom: 14 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.textDark },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  statusBadgeBox: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 14,
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginHorizontal: 8 },
  statusText: { fontSize: 14, fontWeight: '700', color: COLORS.textDark },
  toggleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  toggleBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '800',
    marginHorizontal: 8,
  },
  poolActionCard: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    elevation: 2,
  },
  poolIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolActionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textDark },
  poolActionSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  statsRow: { justifyContent: 'space-between' },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: { fontSize: 20, fontWeight: '900', color: COLORS.textDark, marginTop: 6 },
  statLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});