import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { COLORS } from '../../context/ThemeLanguageContext';
import apiClient from '../../api/client';
import { startDriverGpsTracking, stopDriverGpsTracking } from '../../services/LocationTask';

export default function DriverDashboardScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ rating: '100%', delivered: 0 });

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
      // Basculer quand même l'état visuel et le GPS
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
        <View style={styles.headerRow}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="motorbike" size={30} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Espace Transporteur</Text>
            <Text style={styles.subtitle}>
              {user?.full_name || 'Livreur'} • {user?.commune_name || 'El Eulma'}
            </Text>
          </View>
        </View>

        <View style={styles.statusBadgeBox}>
          <View
            style={[
              styles.dot,
              { backgroundColor: isOnline ? '#10B981' : '#94A3B8' },
            ]}
          />
          <Text style={styles.statusText}>
            Statut : {isOnline ? 'EN LIGNE (Prêt à recevoir)' : 'HORS LIGNE'}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.toggleBtn,
            { backgroundColor: isOnline ? COLORS.secondary : COLORS.primary },
          ]}
          onPress={toggleOnlineStatus}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons
                name={isOnline ? 'power' : 'flash'}
                size={20}
                color="#FFF"
              />
              <Text style={styles.toggleBtnText}>
                {isOnline ? 'Passer Hors Ligne' : 'Passer En Ligne'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* BOUTON CORRIGÉ : OUVRE DIRECTEMENT LES COURSES DISPONIBLES */}
      <TouchableOpacity
        style={styles.poolActionCard}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('DriverPool')}
      >
        <View style={styles.poolIconBox}>
          <Ionicons name="list-circle" size={28} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.poolActionTitle}>Voir les demandes disponibles</Text>
          <Text style={styles.poolActionSub}>
            Consultez et acceptez les courses autour de votre commune
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
      </TouchableOpacity>

      {/* STATISTIQUES RAPIDES */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Ionicons name="star" size={24} color="#F59E0B" />
          <Text style={styles.statValue}>{stats.rating}</Text>
          <Text style={styles.statLabel}>Fiabilité</Text>
        </View>
        <View style={styles.statBox}>
          <Ionicons name="checkmark-done-circle" size={24} color={COLORS.primary} />
          <Text style={styles.statValue}>{stats.delivered}</Text>
          <Text style={styles.statLabel}>Courses livrées</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  statusBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 14,
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  statusText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  toggleBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginLeft: 8,
  },
  poolActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
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
    marginRight: 12,
  },
  poolActionTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  poolActionSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statValue: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginTop: 6 },
  statLabel: { fontSize: 12, color: '#64748B', marginTop: 2 },
});