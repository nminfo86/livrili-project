// src/screens/driver/DriverRegisterScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import API from '../../api/client';

export default function DriverRegisterScreen({ navigation }) {
  const [fullName, setFullName] = useState('');
  const [commune, setCommune] = useState('El Eulma');
  const [vehicleType, setVehicleType] = useState('moto');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!fullName || !brand || !color || !plate) {
      Alert.alert('Champs obligatoires', 'Veuillez remplir l\'ensemble des informations du véhicule.');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('full_name', fullName);
      formData.append('commune_name', commune);
      formData.append('vehicle_type', vehicleType);
      formData.append('brand', brand);
      formData.append('color', color);
      formData.append('plate_number', plate);

      const res = await API.post('driver.php?action=register', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        Alert.alert('Dossier Enregistré !', 'Votre demande est en cours de validation par l\'administration.');
        navigation.goBack();
      } else {
        Alert.alert('Erreur', res.data.error || 'Erreur d\'inscription');
      }
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de joindre le serveur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Postuler comme Livreur 🛵</Text>

        <Text style={styles.label}>Nom et Prénom complets</Text>
        <TextInput style={styles.input} placeholder="Ex: Mohamed Amine" value={fullName} onChangeText={setFullName} />

        <Text style={styles.label}>Commune d'activité</Text>
        <TextInput style={styles.input} placeholder="Ex: El Eulma, Sétif..." value={commune} onChangeText={setCommune} />

        <Text style={styles.label}>Type de véhicule</Text>
        <View style={styles.vGrid}>
          {[
            { id: 'moto', label: '🛵 Moto' },
            { id: 'voiture', label: '🚗 Voiture' },
            { id: 'camionnette', label: '🚐 DFSK' },
            { id: 'fourgon', label: '🚚 Fourgon' },
          ].map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[styles.vBtn, vehicleType === v.id && styles.vBtnActive]}
              onPress={() => setVehicleType(v.id)}
            >
              <Text style={vehicleType === v.id ? styles.vTextActive : styles.vText}>{v.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Marque et Modèle</Text>
        <TextInput style={styles.input} placeholder="Ex: SYM Symphony ST, Dacia Logan..." value={brand} onChangeText={setBrand} />

        <Text style={styles.label}>Couleur principale</Text>
        <TextInput style={styles.input} placeholder="Ex: Blanc, Noir, Gris..." value={color} onChangeText={setColor} />

        <Text style={styles.label}>Numéro d'immatriculation (Matricule)</Text>
        <TextInput style={styles.input} placeholder="Ex: 01452 121 19" value={plate} onChangeText={setPlate} />

        <TouchableOpacity style={styles.btnSubmit} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnSubmitText}>Envoyer mon dossier</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8', padding: 14 },
  card: { backgroundColor: '#fff', padding: 18, borderRadius: 12, elevation: 2 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1976d2', marginBottom: 15 },
  label: { fontSize: 13, fontWeight: '700', color: '#495057', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#dee2e6', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fafafa', marginBottom: 12 },
  vGrid: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  vBtn: { flex: 1, padding: 8, borderWidth: 1, borderColor: '#dee2e6', borderRadius: 8, alignItems: 'center' },
  vBtnActive: { borderColor: '#1976d2', backgroundColor: '#e3f2fd' },
  vText: { fontSize: 11, color: '#333' },
  vTextActive: { fontSize: 11, fontWeight: 'bold', color: '#1976d2' },
  btnSubmit: { backgroundColor: '#1976d2', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnSubmitText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});