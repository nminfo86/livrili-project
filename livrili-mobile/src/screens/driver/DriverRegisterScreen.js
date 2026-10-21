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
  Image,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons, Fontisto } from '@expo/vector-icons';
import API from '../../api/client';
import { useThemeLang, COLORS, FONTS, SHADOWS } from '../../context/ThemeLanguageContext';
import {
  isValidFullName,
  isValidCommune,
  isValidBrand,
  isValidColor,
  isValidPlate,
  isValidPhoto,
} from '../../utils/validators';

export default function DriverRegisterScreen({ navigation }) {
  const { t, isRTL } = useThemeLang();
  const [fullName, setFullName] = useState('');
  const [commune, setCommune] = useState('El Eulma');
  const [gpsLoading, setGpsLoading] = useState(false);

  const [transportModes, setTransportModes] = useState([
    { id: 'moto', title_fr: 'Moto', title_ar: 'دراجة نارية', icon: 'moped' },
    { id: 'camionnette', title_fr: 'Chana / Harbin', title_ar: 'شاحنة صغيرة', icon: 'truck-flatbed' },
    { id: 'fourgon', title_fr: 'Fourgon', title_ar: 'فورغون', icon: 'truck-delivery' },
  ]);
  const [vehicleType, setVehicleType] = useState('moto');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);
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

  const pickPhoto = async (fromCamera = false) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') return;

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true, allowsEditing: true });

      if (!result.canceled && result.assets?.[0]) {
        setPhotoUri(result.assets[0].uri);
        setPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (e) {}
  };

  const nameOk = isValidFullName(fullName);
  const communeOk = isValidCommune(commune);
  const brandOk = isValidBrand(brand);
  const colorOk = isValidColor(color);
  const plateOk = isValidPlate(plate);
  const photoOk = isValidPhoto(photoBase64);

  const getFieldBoxStyle = (valid, val = '') => [
    styles.inputBox,
    { flexDirection: rowDir },
    valid && styles.inputBoxValid,
    (submittedAttempt || val.length > 0) && !valid && styles.inputBoxError,
  ];

  const handleSubmit = async () => {
    setSubmittedAttempt(true);

    if (!nameOk || !communeOk || !brandOk || !colorOk || !plateOk || !photoOk) {
      return;
    }

    setLoading(true);
    try {
      const res = await API.post('auth.php?action=upgrade_to_driver', {
        full_name: fullName.trim(),
        commune_name: commune.trim(),
        vehicle_type: vehicleType,
        moto_brand: brand.trim(),
        moto_color: color.trim(),
        plate_number: plate.trim(),
        photo_moto: photoBase64,
      });

      if (res.data?.success) {
        Alert.alert('Succès', res.data.message || 'Compte livreur activé !');
        navigation.goBack();
      } else {
        Alert.alert('Erreur', res.data?.error || "Erreur d'inscription");
      }
    } catch (e) {
      Alert.alert('Erreur', e.response?.data?.error || 'Impossible de joindre le serveur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={styles.card}>
        <Text style={[styles.title, { textAlign: textAlignDir }]}>{t('driverSectionTitle')}</Text>

        {/* NOM COMPLET */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('fullName')} *</Text>
        <View style={getFieldBoxStyle(nameOk, fullName)}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir }]}
            placeholder={t('fullNamePlaceholder')}
            value={fullName}
            onChangeText={setFullName}
          />
          {nameOk ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          ) : (submittedAttempt || fullName.length > 0) ? (
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          ) : null}
        </View>
        {(submittedAttempt || fullName.length > 0) && !nameOk && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errFullName')}</Text>
        )}

        {/* COMMUNE EN FRANÇAIS */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('communeAutoGps')} *</Text>
        <View style={getFieldBoxStyle(communeOk, commune)}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir, fontWeight: '700' }]}
            value={commune}
            onChangeText={setCommune}
          />
          {communeOk && <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />}
          <TouchableOpacity onPress={detectCommuneInFrench} style={{ marginHorizontal: 6 }}>
            {gpsLoading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="locate" size={20} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        </View>
        {(submittedAttempt || commune.length > 0) && !communeOk && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errCommune')}</Text>
        )}

        {/* TYPE DE VÉHICULE AVEC ICÔNE MOTO CORRIGÉE */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('transportModeLabel')} *</Text>
        <View style={[styles.vGrid, { flexDirection: rowDir }]}>
          {transportModes.map((v) => {
            const active = vehicleType === v.id;
            const vLabel = isRTL && v.title_ar ? v.title_ar : v.title_fr;
            return (
              <TouchableOpacity
                key={v.id}
                style={[styles.vBtn, active && styles.vBtnActive]}
                onPress={() => setVehicleType(v.id)}
              >
                {v.id === 'moto' ? (
                  <Fontisto
                    name="motorcycle"
                    size={22}
                    color={active ? COLORS.primary : '#64748B'}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={v.icon || 'truck-flatbed'}
                    size={24}
                    color={active ? COLORS.primary : '#64748B'}
                  />
                )}
                <Text style={active ? styles.vTextActive : styles.vText}>{vLabel}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* MARQUE ET MODÈLE */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('vehicleBrandLabel')} *</Text>
        <View style={getFieldBoxStyle(brandOk, brand)}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir }]}
            placeholder={t('vehicleBrandPlaceholder')}
            value={brand}
            onChangeText={setBrand}
          />
          {brandOk ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          ) : (submittedAttempt || brand.length > 0) ? (
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          ) : null}
        </View>
        {(submittedAttempt || brand.length > 0) && !brandOk && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errBrand')}</Text>
        )}

        {/* COULEUR */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('vehicleColorLabel')} *</Text>
        <View style={getFieldBoxStyle(colorOk, color)}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir }]}
            placeholder={t('vehicleColorPlaceholder')}
            value={color}
            onChangeText={setColor}
          />
          {colorOk ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          ) : (submittedAttempt || color.length > 0) ? (
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          ) : null}
        </View>
        {(submittedAttempt || color.length > 0) && !colorOk && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errColor')}</Text>
        )}

        {/* MATRICULE */}
        <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('plateNumberLabel')} *</Text>
        <View style={getFieldBoxStyle(plateOk, plate)}>
          <TextInput
            style={[styles.input, { textAlign: textAlignDir }]}
            placeholder={t('plateNumberPlaceholder')}
            value={plate}
            onChangeText={setPlate}
          />
          {plateOk ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          ) : (submittedAttempt || plate.length > 0) ? (
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          ) : null}
        </View>
        {(submittedAttempt || plate.length > 0) && !plateOk && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errPlate')}</Text>
        )}

        {/* PHOTO PREUVE DU VÉHICULE */}
        <View
          style={{
            flexDirection: rowDir,
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 12,
          }}
        >
          <Text style={[styles.label, { textAlign: textAlignDir, marginTop: 0 }]}>
            {t('proofPhotoLabel')} *
          </Text>
          {photoOk ? (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
          ) : submittedAttempt ? (
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
          ) : null}
        </View>

        <View style={[styles.photoRow, { flexDirection: rowDir }]}>
          <TouchableOpacity
            style={[styles.photoBtn, { flexDirection: rowDir }, submittedAttempt && !photoOk && styles.photoBtnErr]}
            onPress={() => pickPhoto(true)}
          >
            <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
            <Text style={styles.photoBtnText}>{t('takePhotoBtn')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.photoBtn, { flexDirection: rowDir }, submittedAttempt && !photoOk && styles.photoBtnErr]}
            onPress={() => pickPhoto(false)}
          >
            <Ionicons name="images-outline" size={20} color={COLORS.primary} />
            <Text style={styles.photoBtnText}>{t('galleryBtn')}</Text>
          </TouchableOpacity>
        </View>

        {photoUri && <Image source={{ uri: photoUri }} style={styles.previewImg} />}
        {submittedAttempt && !photoOk && (
          <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errPhoto')}</Text>
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
  card: {
    backgroundColor: COLORS.white,
    padding: 18,
    borderRadius: 18,
    ...SHADOWS.card,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.primary,
    marginBottom: 12,
  },
  label: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginTop: 10,
    marginBottom: 5,
  },
  inputBox: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
    backgroundColor: '#F8FAFC',
  },
  inputBoxValid: { borderColor: COLORS.success, backgroundColor: '#F0FDF4' },
  inputBoxError: { borderColor: COLORS.danger, backgroundColor: '#FEF2F2' },
  input: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDark,
    includeFontPadding: false,
  },
  errorText: {
    fontFamily: FONTS.medium,
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  vGrid: { gap: 8, marginBottom: 4 },
  vBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  vBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  vText: { fontFamily: FONTS.medium, fontSize: 11, color: '#475569', marginTop: 4, fontWeight: '700' },
  vTextActive: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
    marginTop: 4,
  },
  photoRow: { justifyContent: 'space-between', marginTop: 6 },
  photoBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 10,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  photoBtnErr: { borderColor: COLORS.danger, backgroundColor: '#FEF2F2' },
  photoBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
    marginHorizontal: 6,
  },
  previewImg: { width: '100%', height: 150, borderRadius: 12, marginTop: 10 },
  btnSubmit: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    ...SHADOWS.card,
  },
  btnSubmitText: {
    fontFamily: FONTS.bold,
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.8,
  },
});