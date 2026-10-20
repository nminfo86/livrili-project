// src/screens/customer/SettingsScreen.js
import React, { useContext, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { useThemeLang, COLORS } from '../../context/ThemeLanguageContext';
import apiClient from '../../api/client';

export default function SettingsScreen() {
  const { user, setUser, logout, switchMode } = useContext(AuthContext);
  const { lang, isRTL, changeLanguage, t } = useThemeLang();

  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);
  const [submittedAttempt, setSubmittedAttempt] = useState(false);

  const [coords, setCoords] = useState({ lat: 36.1528, lon: 5.6902 });
  const [communeName, setCommuneName] = useState(user?.commune_name || 'El Eulma');
  const [transportModes, setTransportModes] = useState([
    { id: 'moto', title_fr: 'Moto', title_ar: 'دراجة نارية', icon: 'motorbike' },
    { id: 'camionnette', title_fr: 'Chana / Harbin', title_ar: 'شاحنة صغيرة', icon: 'truck-flatbed' },
    { id: 'fourgon', title_fr: 'Fourgon', title_ar: 'فورغون', icon: 'truck-delivery' },
  ]);
  const [vehicleType, setVehicleType] = useState('moto');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [proofPhotoUri, setProofPhotoUri] = useState(null);
  const [proofPhotoBase64, setProofPhotoBase64] = useState(null);

  const isRegisteredDriver =
    user?.role === 'driver' || user?.role === 'admin' || user?.is_driver === true;

  useEffect(() => {
    apiClient
      .get('customer.php?action=get_transport_modes')
      .then((res) => {
        if (res.data?.transport_modes?.length > 0) {
          setTransportModes(res.data.transport_modes);
          setVehicleType(res.data.transport_modes[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Validation champ par champ
  const isValidCommune = (val) => val.trim().length >= 2;
  const isValidBrand = (val) => val.trim().length >= 2;
  const isValidPlate = (val) => val.trim().length >= 4;
  const isValidColor = (val) => val.trim().length >= 2;
  const isValidPhoto = () => Boolean(proofPhotoBase64);

  // Détection automatique GPS -> TOUJOURS EN FRANÇAIS pour homogénéité BDD
  const detectGpsAndCommuneInFrench = async () => {
    setGpsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsLoading(false);
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;
      setCoords({ lat, lon });

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=fr`,
        { headers: { 'User-Agent': 'Mozilla/5.0 LivriliAlgeria/1.0' } }
      );
      const data = await res.json();
      const detectedFr =
        data?.address?.city ||
        data?.address?.town ||
        data?.address?.village ||
        data?.address?.municipality ||
        'El Eulma';
      setCommuneName(detectedFr.trim());
    } catch (e) {
      setCommuneName('El Eulma');
    } finally {
      setGpsLoading(false);
    }
  };

  const handleDriverAction = () => {
    if (user?.current_mode === 'driver') {
      switchMode('customer');
      return;
    }
    if (isRegisteredDriver) {
      switchMode('driver');
      return;
    }
    setSubmittedAttempt(false);
    setUpgradeModalVisible(true);
    detectGpsAndCommuneInFrench();
  };

  const pickProofPhoto = async (fromCamera = false) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') return;

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.5,
            base64: true,
            allowsEditing: true,
          });

      if (!result.canceled && result.assets?.[0]) {
        setProofPhotoUri(result.assets[0].uri);
        setProofPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (e) {}
  };

  const submitBecomeDriver = async () => {
    setSubmittedAttempt(true);

    if (
      !isValidCommune(communeName) ||
      !isValidBrand(vehicleBrand) ||
      !isValidPlate(plateNumber) ||
      !isValidColor(vehicleColor) ||
      !isValidPhoto()
    ) {
      // Les champs oubliés s'affichent en rouge avec le texte explicatif dessous
      return;
    }

    setSubmittingUpgrade(true);
    try {
      const res = await apiClient.post('auth.php?action=upgrade_to_driver', {
        user_id: user?.id,
        latitude: coords.lat,
        longitude: coords.lon,
        commune_name: communeName.trim() || 'El Eulma',
        vehicle_type: vehicleType,
        moto_brand: vehicleBrand.trim(),
        moto_color: vehicleColor.trim(),
        plate_number: plateNumber.trim(),
        photo_moto: proofPhotoBase64,
      });

      if (res.data?.success || res.data?.user) {
        const updatedUser = {
          ...user,
          ...(res.data.user || {}),
          role: 'driver',
          current_mode: 'driver',
          is_driver: true,
          commune_name: communeName.trim(),
        };
        setUser(updatedUser);
        await SecureStore.setItemAsync('user_data', JSON.stringify(updatedUser));
        setUpgradeModalVisible(false);
      } else {
        Alert.alert('Erreur', res.data?.error || "Impossible d'activer le mode livreur.");
      }
    } catch (err) {
      Alert.alert(
        'Erreur',
        err.response?.data?.error || err.response?.data?.message || "Erreur serveur lors de l'activation."
      );
    } finally {
      setSubmittingUpgrade(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => logout && logout() },
    ]);
  };

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlignDir = isRTL ? 'right' : 'left';

  const getFieldBoxStyle = (valid) => [
    styles.fieldBox,
    { flexDirection: rowDir },
    valid && { borderColor: COLORS.primary },
    submittedAttempt && !valid && { borderColor: COLORS.danger, backgroundColor: COLORS.dangerLight },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <View style={[styles.profileCard, { flexDirection: rowDir }]}>
        <View style={[styles.avatar, isRTL ? { marginLeft: 14 } : { marginRight: 14 }]}>
          <Text style={styles.avatarText}>
            {(user?.full_name || user?.phone || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
          <Text style={styles.userName}>{user?.full_name || 'Utilisateur Livrili'}</Text>
          <Text style={styles.userPhone}>{user?.phone || user?.email || 'Algérie'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {t('currentMode')} :{' '}
              {user?.current_mode === 'driver' ? t('roleDriver') : t('roleCustomer')}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { textAlign: textAlignDir }]}>{t('language')}</Text>
      <View style={[styles.langRow, { flexDirection: rowDir }]}>
        {[
          { code: 'fr', label: 'Français 🇫🇷' },
          { code: 'ar', label: 'العربية 🇩🇿' },
          { code: 'dz', label: 'الدارجة 🇩🇿' },
        ].map((item) => (
          <TouchableOpacity
            key={item.code}
            style={[styles.langBtn, lang === item.code && styles.langBtnActive]}
            onPress={() => changeLanguage(item.code)}
          >
            <Text style={[styles.langText, lang === item.code && styles.langTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.menuItem, { flexDirection: rowDir }]}
        onPress={handleDriverAction}
      >
        <MaterialCommunityIcons
          name={isRegisteredDriver ? 'swap-horizontal' : 'motorbike'}
          size={24}
          color={COLORS.primary}
        />
        <Text style={[styles.menuItemText, { textAlign: textAlignDir }]}>
          {user?.current_mode === 'driver'
            ? t('switchCustomer')
            : isRegisteredDriver
            ? t('switchDriver')
            : t('becomeDriverBtn')}
        </Text>
        <Ionicons
          name={isRTL ? 'chevron-back' : 'chevron-forward'}
          size={20}
          color="#94A3B8"
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.logoutBtn, { flexDirection: rowDir }]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>

      {/* MODAL DEVENIR LIVREUR AVEC VALIDATION COCHE VERTE / ERREUR ROUGE */}
      <Modal visible={upgradeModalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalHeader, { flexDirection: rowDir }]}>
              <Text style={styles.modalTitle}>{t('driverSectionTitle')}</Text>
              <TouchableOpacity onPress={() => setUpgradeModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('communeAutoGps')}</Text>
              <View style={getFieldBoxStyle(isValidCommune(communeName))}>
                <Ionicons name="location" size={20} color={COLORS.primary} />
                <TextInput
                  style={[styles.fieldInput, { textAlign: textAlignDir, fontWeight: '700' }]}
                  value={communeName}
                  onChangeText={setCommuneName}
                />
                {isValidCommune(communeName) && (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                )}
                <TouchableOpacity onPress={detectGpsAndCommuneInFrench} style={styles.gpsRefreshBtn}>
                  {gpsLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons name="locate" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              </View>
              {submittedAttempt && !isValidCommune(communeName) && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errCommune')}</Text>
              )}

              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t('transportModeLabel')}
              </Text>
              <View style={[styles.vehicleRow, { flexDirection: rowDir }]}>
                {transportModes.map((v) => {
                  const vLabel = isRTL && v.title_ar ? v.title_ar : v.title_fr;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      style={[
                        styles.vehicleBtn,
                        vehicleType === v.id && styles.vehicleBtnActive,
                      ]}
                      onPress={() => setVehicleType(v.id)}
                    >
                      <MaterialCommunityIcons
                        name={v.icon || 'motorbike'}
                        size={24}
                        color={vehicleType === v.id ? COLORS.primary : '#64748B'}
                      />
                      <Text
                        style={[
                          styles.vehicleBtnText,
                          vehicleType === v.id && styles.vehicleBtnTextActive,
                        ]}
                      >
                        {vLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* MARQUE / MODÈLE */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t('vehicleBrandLabel')}
              </Text>
              <View style={getFieldBoxStyle(isValidBrand(vehicleBrand))}>
                <MaterialCommunityIcons
                  name="motorbike"
                  size={20}
                  color={submittedAttempt && !isValidBrand(vehicleBrand) ? COLORS.danger : '#64748B'}
                />
                <TextInput
                  style={[styles.fieldInput, { textAlign: textAlignDir }]}
                  placeholder={t('vehicleBrandPlaceholder')}
                  value={vehicleBrand}
                  onChangeText={setVehicleBrand}
                />
                {isValidBrand(vehicleBrand) ? (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                ) : submittedAttempt ? (
                  <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                ) : null}
              </View>
              {submittedAttempt && !isValidBrand(vehicleBrand) && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errBrand')}</Text>
              )}

              {/* MATRICULE & COULEUR */}
              <View style={{ flexDirection: rowDir, justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginHorizontal: 3 }}>
                  <Text style={[styles.label, { textAlign: textAlignDir }]}>
                    {t('plateNumberLabel')}
                  </Text>
                  <View style={getFieldBoxStyle(isValidPlate(plateNumber))}>
                    <TextInput
                      style={[styles.fieldInput, { textAlign: textAlignDir }]}
                      placeholder={t('plateNumberPlaceholder')}
                      value={plateNumber}
                      onChangeText={setPlateNumber}
                    />
                    {isValidPlate(plateNumber) ? (
                      <Ionicons name="checkmark-circle" size={19} color={COLORS.primary} />
                    ) : submittedAttempt ? (
                      <Ionicons name="alert-circle" size={19} color={COLORS.danger} />
                    ) : null}
                  </View>
                  {submittedAttempt && !isValidPlate(plateNumber) && (
                    <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                      {t('errPlate')}
                    </Text>
                  )}
                </View>

                <View style={{ flex: 1, marginHorizontal: 3 }}>
                  <Text style={[styles.label, { textAlign: textAlignDir }]}>
                    {t('vehicleColorLabel')}
                  </Text>
                  <View style={getFieldBoxStyle(isValidColor(vehicleColor))}>
                    <TextInput
                      style={[styles.fieldInput, { textAlign: textAlignDir }]}
                      placeholder={t('vehicleColorPlaceholder')}
                      value={vehicleColor}
                      onChangeText={setVehicleColor}
                    />
                    {isValidColor(vehicleColor) ? (
                      <Ionicons name="checkmark-circle" size={19} color={COLORS.primary} />
                    ) : submittedAttempt ? (
                      <Ionicons name="alert-circle" size={19} color={COLORS.danger} />
                    ) : null}
                  </View>
                  {submittedAttempt && !isValidColor(vehicleColor) && (
                    <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                      {t('errColor')}
                    </Text>
                  )}
                </View>
              </View>

              {/* PHOTO PREUVE */}
              <View
                style={{
                  flexDirection: rowDir,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 10,
                }}
              >
                <Text style={[styles.label, { textAlign: textAlignDir, marginTop: 0 }]}>
                  {t('proofPhotoLabel')}
                </Text>
                {isValidPhoto() ? (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                ) : submittedAttempt ? (
                  <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                ) : null}
              </View>

              <View style={[styles.photoRow, { flexDirection: rowDir }]}>
                <TouchableOpacity
                  style={[
                    styles.photoBtn,
                    { flexDirection: rowDir },
                    submittedAttempt && !isValidPhoto() && styles.photoBtnError,
                  ]}
                  onPress={() => pickProofPhoto(true)}
                >
                  <Ionicons
                    name="camera-outline"
                    size={20}
                    color={submittedAttempt && !isValidPhoto() ? COLORS.danger : COLORS.primary}
                  />
                  <Text
                    style={[
                      styles.photoBtnText,
                      submittedAttempt && !isValidPhoto() && { color: COLORS.danger },
                    ]}
                  >
                    {t('takePhotoBtn')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.photoBtn,
                    { flexDirection: rowDir },
                    submittedAttempt && !isValidPhoto() && styles.photoBtnError,
                  ]}
                  onPress={() => pickProofPhoto(false)}
                >
                  <Ionicons
                    name="images-outline"
                    size={20}
                    color={submittedAttempt && !isValidPhoto() ? COLORS.danger : COLORS.primary}
                  />
                  <Text
                    style={[
                      styles.photoBtnText,
                      submittedAttempt && !isValidPhoto() && { color: COLORS.danger },
                    ]}
                  >
                    {t('galleryBtn')}
                  </Text>
                </TouchableOpacity>
              </View>
              {submittedAttempt && !isValidPhoto() && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errPhoto')}</Text>
              )}

              {proofPhotoUri && (
                <Image source={{ uri: proofPhotoUri }} style={styles.previewImg} />
              )}

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={submitBecomeDriver}
                disabled={submittingUpgrade}
              >
                {submittingUpgrade ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.submitBtnText}>{t('submitDriverBtn')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 40 },
  profileCard: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 18,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  userName: { fontSize: 17, fontWeight: '800', color: COLORS.textDark },
  userPhone: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  roleBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
  },
  roleText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  langRow: { justifyContent: 'space-between', marginBottom: 24 },
  langBtn: {
    flex: 1,
    backgroundColor: '#FFF',
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  langBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  langText: { fontSize: 13, fontWeight: '700', color: COLORS.textDark },
  langTextActive: { color: COLORS.primary },
  menuItem: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuItemText: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  logoutBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 12,
  },
  logoutText: { color: '#FFF', fontSize: 15, fontWeight: '800', marginHorizontal: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 10, marginBottom: 5 },
  fieldBox: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 46,
  },
  fieldInput: { flex: 1, marginHorizontal: 8, fontSize: 14, color: '#0F172A' },
  errorText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  gpsRefreshBtn: { padding: 4 },
  vehicleRow: { justifyContent: 'space-between' },
  vehicleBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    marginHorizontal: 3,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },
  vehicleBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  vehicleBtnText: { fontSize: 11, fontWeight: '700', color: '#64748B', marginTop: 3 },
  vehicleBtnTextActive: { color: COLORS.primary },
  photoRow: { justifyContent: 'space-between', marginTop: 4 },
  photoBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  photoBtnError: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerLight,
  },
  photoBtnText: { marginHorizontal: 6, fontSize: 13, fontWeight: '700', color: COLORS.primary },
  previewImg: { width: '100%', height: 130, borderRadius: 12, marginTop: 10 },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 10,
  },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
});