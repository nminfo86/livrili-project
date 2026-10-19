import React, { useState, useContext, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { AuthContext } from '../../context/AuthContext';
import { startDriverGpsTracking, stopDriverGpsTracking } from '../../services/LocationTask';
import API from '../../api/client';

export default function DriverDashboardScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [isOnline, setIsOnline] = useState(false);

  const toggleOnline = async () => {
    if (!isOnline) {
      const ok = await startDriverGpsTracking();
      if (!ok) {
        Alert.alert('GPS Requis', 'Veuillez accorder la permission de localisation en arrière-plan.');
        return;
      }
      setIsOnline(true);
    } else {
      await stopDriverGpsTracking();
      setIsOnline(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Espace Transporteur</Text>
        <Text style={styles.status}>
          Statut : {isOnline ? '🟢 EN LIGNE (Prêt à recevoir)' : '🔴 HORS LIGNE'}
        </Text>

        <TouchableOpacity
          style={[styles.btnToggle, isOnline ? styles.btnOffline : styles.btnOnline]}
          onPress={toggleOnline}
        >
          <Text style={styles.btnToggleText}>
            {isOnline ? 'Passer Hors Ligne' : 'Passer En Ligne (Activer GPS)'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.menuBtn}
        onPress={() => navigation.navigate('DriverPool')}
        disabled={!isOnline}
      >
        <Text style={styles.menuText}>📋 Voir les demandes disponibles</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8', padding: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, elevation: 1 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1976d2', marginBottom: 8 },
  status: { fontSize: 14, fontWeight: '600', marginBottom: 14 },
  btnToggle: { padding: 14, borderRadius: 8, alignItems: 'center' },
  btnOnline: { backgroundColor: '#2e7d32' },
  btnOffline: { backgroundColor: '#d32f2f' },
  btnToggleText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  menuBtn: { backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#dee2e6' },
  menuText: { fontSize: 15, fontWeight: '600', color: '#333' },
});