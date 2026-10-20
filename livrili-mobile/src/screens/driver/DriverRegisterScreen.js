// src/screens/driver/DriverRegisterScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import API from '../../api/client';
import { useThemeLang, COLORS } from '../../context/ThemeLanguageContext';

export default function DriverRegisterScreen({ navigation }) {
  const { t, isRTL } = useThemeLang();
  const [fullName, setFullName] = useState('');
  const [commune, setCommune] = useState('El Eulma');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [transportModes, setTransportModes] = useState([
    { id: 'moto', title_fr: 'Moto', title_ar: 'دراجة نارية', icon: 'motorbike' },
    { id: 'camionnette', title_fr: 'Chana / Harbin', title_ar: 'شاحنة صغيرة', icon: 'truck-flatbed' },
    { id: 'fourgon', title_fr: 'Fourgon', title_ar: 'فورغون', icon: 'truck-delivery' },
  ]);
  const [vehicleType, setVehicleType] = useState('moto');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittedAttempt, setSubmittedAttempt] = useState(false);

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlignDir = isRTL ? 'right' : 'left';

  useEffect(() => {
    detectCommuneInFrench();
    API.get('customer.php?action=get_transport_modes')
      .then((res) => {
        if (res.data?.transport_modes?.length > 0) {
          setTransportModes(res.data.transport_modes);
          setVehicleType(res.data.transport_modes[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Toujours en Français pour l'homogénéité de la BDD
  const detectCommuneInFrench = async () => {
    setGpsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.coords.latitude}&lon=${loc.coords.longitude}&accept-language=fr`,
        { headers: { 'User-Agent': 'Mozilla/5.0 LivriliAlgeria/1.0' } }
      );
      const data = await res.json();
      const detectedFr =
        data?.address?.city ||
        data?.address?.town ||
        data?.address?.village ||
        data?.address?.municipality ||
        'El Eulma';
      setCommune(detectedFr.trim());
    } catch (e) {
    } finally {
      setGpsLoading(false);
    }
  };

  const isValidFullName = (v) => v.trim().length >= 3;
  const isValidCommune = (v) => v.trim().length >= 2;
  const isValidBrand = (v) => v.trim().length >= 2;
  const isValidColor = (v) => v.trim().length >= 2;
  const isValidPlate = (v) => v.trim().length >= 4;

  const getFieldBoxStyle = (valid) => [
    styles.inputBox,
    { flexDirection: rowDir },
    valid && { borderColor: COLORS.primary },
    submittedAttempt && !valid && { borderColor: COLORS.danger, backgroundColor: COLORS.dangerLight },
  ];

  const handleSubmit = async () => {
    setSubmittedAttempt(true);
    if (
      !isValidFullName(fullName) ||
      !isValidCommune(commune) ||
      !isValidBrand(brand) ||
      !isValidColor(color) ||
      !isValidPlate(plate)
    ) {
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('full_name', fullName.trim());
      formData.append('commune_name', commune.trim());
      formData.append('vehicle_type', vehicleType);
      formData.append('brand', brand.trim());
      formData.append('color', color.trim());
      formData.append('plate_number', plate.trim());

      const res = await API.post('driver.php?action=register', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        Alert.alert('OK', res.data.message || 'Compte activé !');
        navigation.goBack();
      } else {
        Alert.alert('Erreur', res.data.error || "Erreur d'inscription");
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
        <Text style={[styles.title, { textAlign: textAlignDir }]}>
          {t('driverSectionTitle')}
        </Text>

        {/* NOM COMPLET */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('fullName')}</Text>
        <View style={getFieldBoxStyle(isValidFullName(fullName))}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir }]}
            placeholder={t('fullNamePlaceholder')}
            value={fullName}
            onChangeText={setFullName}
          />
          {isValidFullName(fullName) ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          ) : submittedAttempt ? (
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          ) : null}
        </View>
        {submittedAttempt && !isValidFullName(fullName) && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errFullName')}</Text>
        )}

        {/* COMMUNE EN FRANÇAIS */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('communeAutoGps')}</Text>
        <View style={getFieldBoxStyle(isValidCommune(commune))}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir, fontWeight: '700' }]}
            value={commune}
            onChangeText={setCommune}
          />
          {isValidCommune(commune) && (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          )}
          <TouchableOpacity onPress={detectCommuneInFrench} style={{ marginHorizontal: 4 }}>
            {gpsLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="locate" size={20} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        </View>
        {submittedAttempt && !isValidCommune(commune) && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errCommune')}</Text>
        )}

        {/* TYPE DE VÉHICULE DYNAMIQUE */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('transportModeLabel')}</Text>
        <View style={[styles.vGrid, { flexDirection: rowDir }]}>
          {transportModes.map((v) => {
            const vLabel = isRTL && v.title_ar ? v.title_ar : v.title_fr;
            return (
              <TouchableOpacity
                key={v.id}
                style={[styles.vBtn, vehicleType === v.id && styles.vBtnActive]}
                onPress={() => setVehicleType(v.id)}
              >
                <MaterialCommunityIcons
                  name={v.icon || 'motorbike'}
                  size={22}
                  color={vehicleType === v.id ? COLORS.primary : '#64748B'}
                />
                <Text style={vehicleType === v.id ? styles.vTextActive : styles.vText}>
                  {vLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* MARQUE ET MODÈLE */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('vehicleBrandLabel')}</Text>
        <View style={getFieldBoxStyle(isValidBrand(brand))}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir }]}
            placeholder={t('vehicleBrandPlaceholder')}
            value={brand}
            onChangeText={setBrand}
          />
          {isValidBrand(brand) ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          ) : submittedAttempt ? (
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          ) : null}
        </View>
        {submittedAttempt && !isValidBrand(brand) && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errBrand')}</Text>
        )}

        {/* COULEUR */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('vehicleColorLabel')}</Text>
        <View style={getFieldBoxStyle(isValidColor(color))}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir }]}
            placeholder={t('vehicleColorPlaceholder')}
            value={color}
            onChangeText={setColor}
          />
          {isValidColor(color) ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          ) : submittedAttempt ? (
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          ) : null}
        </View>
        {submittedAttempt && !isValidColor(color) && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errColor')}</Text>
        )}

        {/* MATRICULE */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('plateNumberLabel')}</Text>
        <View style={getFieldBoxStyle(isValidPlate(plate))}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir }]}
            placeholder={t('plateNumberPlaceholder')}
            value={plate}
            onChangeText={setPlate}
          />
          {isValidPlate(plate) ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          ) : submittedAttempt ? (
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          ) : null}
        </View>
        {submittedAttempt && !isValidPlate(plate) && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errPlate')}</Text>
        )}

        <TouchableOpacity style={styles.btnSubmit} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnSubmitText}>{t('submitDriverBtn')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 14 },
  card: { backgroundColor: COLORS.white, padding: 18, borderRadius: 16, elevation: 2 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.primary, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#495057', marginTop: 10, marginBottom: 5 },
  inputBox: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    backgroundColor: '#FAFAFA',
  },
  input: { flex: 1, fontSize: 14, color: COLORS.textDark },
  errorText: { color: COLORS.danger, fontSize: 11, fontWeight: '700', marginTop: 3 },
  vGrid: { gap: 6, marginBottom: 4 },
  vBtn: {
    flex: 1,
    padding: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    alignItems: 'center',
  },
  vBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  vText: { fontSize: 11, color: '#333', marginTop: 2 },
  vTextActive: { fontSize: 11, fontWeight: 'bold', color: COLORS.primary, marginTop: 2 },
  btnSubmit: {
    backgroundColor: COLORS.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  btnSubmitText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});