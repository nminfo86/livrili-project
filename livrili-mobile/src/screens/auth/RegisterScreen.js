// src/screens/auth/RegisterScreen.js
import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons, Fontisto } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { useThemeLang, COLORS, FONTS, SHADOWS } from '../../context/ThemeLanguageContext';
import {
  isValidFullName,
  isValidDzPhone,
  isValidEmail,
  isValidPassword,
  isValidCommune,
  isValidBrand,
  isValidColor,
  isValidPlate,
  isValidPhoto,
} from '../../utils/validators';
import apiClient from '../../api/client';

export default function RegisterScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const { t, isRTL } = useThemeLang();

  // Type de compte : 'customer' ou 'driver'
  const [accountType, setAccountType] = useState('customer');

  // Champs communs
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Champs spécifiques Livreur
  const [commune, setCommune] = useState('El Eulma');
  const [coords, setCoords] = useState({ lat: 36.1528, lon: 5.6902 });
  const [gpsLoading, setGpsLoading] = useState(false);
  const [transportModes, setTransportModes] = useState([
    { id: 'moto', title_fr: 'Moto Express', title_ar: 'دراجة نارية', icon: 'moped' },
    { id: 'camionnette', title_fr: 'Harbin / DFSK', title_ar: 'شاحنة صغيرة', icon: 'truck-flatbed' },
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

  const detectCommuneInFrench = async () => {
    setGpsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      setCoords({ lat: loc.coords.latitude, lon: loc.coords.longitude });
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

  const pickVehiclePhoto = async (fromCamera = false) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission requise', "Veuillez autoriser l'accès à l'appareil photo/galerie.");
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.5,
            base64: true,
            allowsEditing: true,
          });
      if (!result.canceled && result.assets?.[0]) {
        setPhotoUri(result.assets[0].uri);
        setPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (e) {}
  };

  // États de validation Regex
  const nameOk = isValidFullName(fullName);
  const phoneOk = isValidDzPhone(phone);
  const emailOk = email.trim().length === 0 ? true : isValidEmail(email); // Optionnel ou strict si rempli
  const passOk = isValidPassword(password);
  const communeOk = isValidCommune(commune);
  const brandOk = isValidBrand(brand);
  const colorOk = isValidColor(color);
  const plateOk = isValidPlate(plate);
  const photoOk = isValidPhoto(photoBase64);

  const getFieldBoxStyle = (valid, value) => [
    styles.inputBox,
    { flexDirection: rowDir },
    valid && value.length > 0 && styles.inputBoxValid,
    (submittedAttempt || value.length > 0) && !valid && styles.inputBoxError,
  ];

  const handleRegister = async () => {
    setSubmittedAttempt(true);

    if (!nameOk || !phoneOk || !emailOk || !passOk) {
      return;
    }

    if (accountType === 'driver') {
      if (!communeOk || !brandOk || !colorOk || !plateOk || !photoOk) {
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        full_name: fullName.trim(),
        phone: phone.replace(/\s+/g, ''),
        email: email.trim() || null,
        password: password,
        role: accountType,
        current_mode: accountType,
        commune_name: commune.trim() || 'El Eulma',
        latitude: coords.lat,
        longitude: coords.lon,
      };

      if (accountType === 'driver') {
        payload.vehicle_type = vehicleType;
        payload.moto_brand = brand.trim();
        payload.moto_color = color.trim();
        payload.plate_number = plate.trim();
        payload.photo_moto = photoBase64;
      }

      const res = await apiClient.post('auth.php?action=register', payload);

      if (res.data?.success && res.data?.user) {
        await login(res.data.user, res.data.token || res.data.user.auth_token);
      } else {
        Alert.alert('Erreur', res.data?.error || "Impossible de finaliser l'inscription.");
      }
    } catch (err) {
      Alert.alert(
        'Erreur',
        err.response?.data?.error || "Une erreur est survenue lors de l'inscription."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={[styles.title, { textAlign: textAlignDir }]}>{t('registerTitle')}</Text>
          <Text style={[styles.subtitle, { textAlign: textAlignDir }]}>
            {t('registerSubtitle')}
          </Text>

          {/* CHOIX DU RÔLE : CLIENT OU LIVREUR */}
          <View style={[styles.roleSwitchRow, { flexDirection: rowDir }]}>
            <TouchableOpacity
              style={[styles.roleTab, accountType === 'customer' && styles.roleTabActive]}
              onPress={() => setAccountType('customer')}
            >
              <Ionicons
                name="person"
                size={18}
                color={accountType === 'customer' ? COLORS.white : '#475569'}
              />
              <Text
                style={[styles.roleTabText, accountType === 'customer' && styles.roleTabTextActive]}
              >
                {t('roleCustomer')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleTab, accountType === 'driver' && styles.roleTabActive]}
              onPress={() => {
                setAccountType('driver');
                detectCommuneInFrench();
              }}
            >
              <Fontisto
                name="motorcycle"
                size={18}
                color={accountType === 'driver' ? COLORS.white : '#475569'}
              />
              <Text
                style={[styles.roleTabText, accountType === 'driver' && styles.roleTabTextActive]}
              >
                {t('roleDriver')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 1. NOM COMPLET */}
          <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('fullName')} *</Text>
          <View style={getFieldBoxStyle(nameOk, fullName)}>
            <Ionicons name="person-outline" size={20} color="#64748B" style={{ marginHorizontal: 6 }} />
            <TextInput
              style={[styles.input, { textAlign: textAlignDir }]}
              placeholder={t('fullNamePlaceholder')}
              placeholderTextColor="#94A3B8"
              value={fullName}
              onChangeText={setFullName}
            />
            {nameOk ? (
              <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
            ) : (submittedAttempt || fullName.length > 0) ? (
              <Ionicons name="alert-circle" size={22} color={COLORS.danger} />
            ) : null}
          </View>
          {(submittedAttempt || fullName.length > 0) && !nameOk && (
            <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errFullName')}</Text>
          )}

          {/* 2. TÉLÉPHONE ALGÉRIEN (05 / 06 / 07) */}
          <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('phoneNumber')} *</Text>
          <View style={getFieldBoxStyle(phoneOk, phone)}>
            <Ionicons name="call-outline" size={20} color="#64748B" style={{ marginHorizontal: 6 }} />
            <TextInput
              style={[styles.input, { textAlign: textAlignDir }]}
              placeholder="05 / 06 / 07 XX XX XX XX"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={(txt) => setPhone(txt.replace(/[^0-9]/g, ''))}
            />
            {phoneOk ? (
              <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
            ) : (submittedAttempt || phone.length > 0) ? (
              <Ionicons name="alert-circle" size={22} color={COLORS.danger} />
            ) : null}
          </View>
          {(submittedAttempt || phone.length > 0) && !phoneOk && (
            <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errPhone')}</Text>
          )}

          {/* 3. EMAIL (SI RENSEIGNÉ, DOIT RESPECTER REGEX EMAIL) */}
          <Text style={[styles.label, { textAlign: textAlignDir }]}>
            {t('emailAddress')} <Text style={{ fontWeight: '400', color: '#64748B' }}>{t('optionalTag')}</Text>
          </Text>
          <View style={getFieldBoxStyle(emailOk, email)}>
            <Ionicons name="mail-outline" size={20} color="#64748B" style={{ marginHorizontal: 6 }} />
            <TextInput
              style={[styles.input, { textAlign: textAlignDir }]}
              placeholder="exemple@domaine.com"
              placeholderTextColor="#94A3B8"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            {email.length > 0 && emailOk ? (
              <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
            ) : email.length > 0 && !emailOk ? (
              <Ionicons name="alert-circle" size={22} color={COLORS.danger} />
            ) : null}
          </View>
          {email.length > 0 && !emailOk && (
            <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errEmail')}</Text>
          )}

          {/* 4. MOT DE PASSE */}
          <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('password')} *</Text>
          <View style={getFieldBoxStyle(passOk, password)}>
            <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={{ marginHorizontal: 6 }} />
            <TextInput
              style={[styles.input, { textAlign: textAlignDir }]}
              placeholder="Minimum 6 caractères"
              placeholderTextColor="#94A3B8"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ paddingHorizontal: 6 }}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
            </TouchableOpacity>
            {passOk ? (
              <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
            ) : (submittedAttempt || password.length > 0) ? (
              <Ionicons name="alert-circle" size={22} color={COLORS.danger} />
            ) : null}
          </View>
          {(submittedAttempt || password.length > 0) && !passOk && (
            <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errPassword')}</Text>
          )}

          {/* SECTION SUPPLÉMENTAIRE SI MODE LIVREUR CHOISI */}
          {accountType === 'driver' && (
            <View style={styles.driverExtraBox}>
              <Text style={[styles.driverBoxHeading, { textAlign: textAlignDir }]}>
                INFORMATIONS DU VÉHICULE LIVREUR
              </Text>

              {/* COMMUNE */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('communeAutoGps')} *</Text>
              <View style={getFieldBoxStyle(communeOk, commune)}>
                <Ionicons name="location" size={20} color={COLORS.primary} style={{ marginHorizontal: 6 }} />
                <TextInput
                  style={[styles.input, { textAlign: textAlignDir }]}
                  value={commune}
                  onChangeText={setCommune}
                />
                {communeOk && <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />}
                <TouchableOpacity onPress={detectCommuneInFrench} style={{ paddingHorizontal: 6 }}>
                  {gpsLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons name="locate" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              </View>
              {!communeOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errCommune')}</Text>
              )}

              {/* TYPE DE VÉHICULE AVEC NOUVELLE ICÔNE MOTO */}
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

              {/* MARQUE / MODÈLE */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('vehicleBrandLabel')} *</Text>
              <View style={getFieldBoxStyle(brandOk, brand)}>
                <TextInput
                  style={[styles.input, { textAlign: textAlignDir }]}
                  placeholder={t('vehicleBrandPlaceholder')}
                  placeholderTextColor="#94A3B8"
                  value={brand}
                  onChangeText={setBrand}
                />
                {brandOk ? (
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                ) : (submittedAttempt || brand.length > 0) ? (
                  <Ionicons name="alert-circle" size={22} color={COLORS.danger} />
                ) : null}
              </View>
              {(submittedAttempt || brand.length > 0) && !brandOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errBrand')}</Text>
              )}

              {/* COULEUR & MATRICULE */}
              <View style={{ flexDirection: rowDir, justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 }}>
                  <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('vehicleColorLabel')} *</Text>
                  <View style={getFieldBoxStyle(colorOk, color)}>
                    <TextInput
                      style={[styles.input, { textAlign: textAlignDir }]}
                      placeholder={t('vehicleColorPlaceholder')}
                      placeholderTextColor="#94A3B8"
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
                </View>

                <View style={{ flex: 1, marginLeft: isRTL ? 0 : 6, marginRight: isRTL ? 6 : 0 }}>
                  <Text style={[styles.label, { textAlign: textAlignDir }]}>{t('plateNumberLabel')} *</Text>
                  <View style={getFieldBoxStyle(plateOk, plate)}>
                    <TextInput
                      style={[styles.input, { textAlign: textAlignDir }]}
                      placeholder={t('plateNumberPlaceholder')}
                      placeholderTextColor="#94A3B8"
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
                </View>
              </View>

              {/* PHOTO DU VÉHICULE OBLIGATOIRE */}
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
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                ) : submittedAttempt ? (
                  <Ionicons name="alert-circle" size={22} color={COLORS.danger} />
                ) : null}
              </View>

              <View style={[styles.photoBtnsRow, { flexDirection: rowDir }]}>
                <TouchableOpacity
                  style={[
                    styles.photoBtn,
                    { flexDirection: rowDir },
                    submittedAttempt && !photoOk && styles.photoBtnError,
                  ]}
                  onPress={() => pickVehiclePhoto(true)}
                >
                  <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>{t('takePhotoBtn')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.photoBtn,
                    { flexDirection: rowDir },
                    submittedAttempt && !photoOk && styles.photoBtnError,
                  ]}
                  onPress={() => pickVehiclePhoto(false)}
                >
                  <Ionicons name="images-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>{t('galleryBtn')}</Text>
                </TouchableOpacity>
              </View>

              {photoUri && <Image source={{ uri: photoUri }} style={styles.previewImg} />}
              {submittedAttempt && !photoOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>{t('errPhoto')}</Text>
              )}
            </View>
          )}

          {/* BOUTON S'INSCRIRE */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleRegister} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.submitBtnText}>{t('registerBtn')}</Text>
            )}
          </TouchableOpacity>

          <View style={[styles.footerRow, { flexDirection: rowDir }]}>
            <Text style={styles.footerText}>{t('alreadyHaveAccount')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.footerLink}>{t('loginLink')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.textDark,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 14,
  },
  roleSwitchRow: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  roleTabActive: {
    backgroundColor: COLORS.primary,
  },
  roleTabText: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
    marginHorizontal: 6,
  },
  roleTabTextActive: {
    color: COLORS.white,
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
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 10,
    minHeight: 48,
    backgroundColor: '#F8FAFC',
  },
  inputBoxValid: {
    borderColor: COLORS.success,
    backgroundColor: '#F0FDF4',
  },
  inputBoxError: {
    borderColor: COLORS.danger,
    backgroundColor: '#FEF2F2',
  },
  input: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textDark,
    paddingVertical: 8,
    includeFontPadding: false,
  },
  errorText: {
    fontFamily: FONTS.medium,
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  driverExtraBox: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
  },
  driverBoxHeading: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  vGrid: { gap: 8, marginTop: 4 },
  vBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  vBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  vText: { fontFamily: FONTS.medium, fontSize: 11, color: '#475569', marginTop: 4, fontWeight: '700' },
  vTextActive: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
    marginTop: 4,
  },
  photoBtnsRow: { justifyContent: 'space-between', marginTop: 6 },
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
  photoBtnError: {
    borderColor: COLORS.danger,
    backgroundColor: '#FEF2F2',
  },
  photoBtnText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
    marginHorizontal: 6,
  },
  previewImg: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    marginTop: 10,
    resizeMode: 'cover',
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 22,
    ...SHADOWS.card,
  },
  submitBtnText: {
    fontFamily: FONTS.bold,
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  footerRow: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  footerText: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  footerLink: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.primary,
  },
});