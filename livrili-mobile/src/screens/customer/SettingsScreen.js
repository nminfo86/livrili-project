import React, { useContext, useState } from 'react';
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
  const { lang, changeLanguage, t } = useThemeLang();

  // États pour le Modal "Devenir Livreur" (Client déjà connecté)
  const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);

  const [coords, setCoords] = useState({ lat: 36.1528, lon: 5.6902 });
  const [communeName, setCommuneName] = useState(user?.commune_name || 'El Eulma');
  const [vehicleType, setVehicleType] = useState('moto');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [proofPhotoUri, setProofPhotoUri] = useState(null);
  const [proofPhotoBase64, setProofPhotoBase64] = useState(null);

  const isRegisteredDriver =
    user?.role === 'driver' || user?.role === 'admin' || user?.is_driver === true;

  // Détection automatique GPS + Commune dès l'ouverture du formulaire Livreur
  const detectGpsAndCommune = async () => {
    setGpsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('GPS requis', 'Veuillez activer le GPS pour détecter votre commune automatiquement.');
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
      const detectedCommune =
        data?.address?.city ||
        data?.address?.town ||
        data?.address?.village ||
        data?.address?.municipality ||
        'El Eulma';
      setCommuneName(detectedCommune);
    } catch (e) {
      console.log('GPS detect error:', e);
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

    // Si le client n'est pas encore livreur : ouvrir le formulaire rapide et détecter sa commune par GPS
    setUpgradeModalVisible(true);
    detectGpsAndCommune();
  };

  const pickProofPhoto = async (fromCamera = false) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (perm.status !== 'granted') {
        Alert.alert('Permission requise', 'Autorisez la caméra ou la galerie.');
        return;
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true, allowsEditing: true });

      if (!result.canceled && result.assets?.[0]) {
        setProofPhotoUri(result.assets[0].uri);
        setProofPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de charger la photo.');
    }
  };

  const submitBecomeDriver = async () => {
    if (!vehicleBrand.trim() || !plateNumber.trim()) {
      Alert.alert('Champs requis', 'Veuillez indiquer le modèle (ex: Sym 300, Harbin...) et le matricule.');
      return;
    }
    if (!proofPhotoBase64) {
      Alert.alert('Photo requise', 'Veuillez ajouter une photo preuve de votre véhicule avec matricule.');
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
        moto_color: vehicleColor.trim() || 'Standard',
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
          commune_name: communeName,
        };
        setUser(updatedUser);
        await SecureStore.setItemAsync('user_data', JSON.stringify(updatedUser));
        setUpgradeModalVisible(false);
        Alert.alert('Félicitations !', 'Votre compte Livreur est activé. Vous êtes maintenant en mode Livreur.');
      } else {
        Alert.alert('Erreur', res.data?.error || 'Impossible d’activer le mode livreur.');
      }
    } catch (err) {
      Alert.alert(
        'Erreur',
        err.response?.data?.error || err.response?.data?.message || 'Erreur serveur lors de l’activation.'
      );
    } finally {
      setSubmittingUpgrade(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => logout && logout() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.full_name || user?.phone || 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user?.full_name || 'Utilisateur Livrili'}</Text>
          <Text style={styles.userPhone}>{user?.phone || user?.email || 'Algérie'}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              Mode actuel : {user?.current_mode === 'driver' ? 'Livreur' : 'Client'}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('language')}</Text>
      <View style={styles.langRow}>
        {[
          { code: 'fr', label: 'Français 🇫🇷' },
          { code: 'ar', label: 'العربية 🇩🇿' },
          { code: 'dz', label: 'دارجة 🇩🇿' },
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

      <TouchableOpacity style={styles.menuItem} onPress={handleDriverAction}>
        <MaterialCommunityIcons
          name={isRegisteredDriver ? 'swap-horizontal' : 'motorbike'}
          size={24}
          color={COLORS.primary}
        />
        <Text style={styles.menuItemText}>
          {user?.current_mode === 'driver'
            ? t('switchCustomer')
            : isRegisteredDriver
            ? t('switchDriver')
            : 'Devenir Livreur (Activer mon véhicule)'}
        </Text>
        <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>

      {/* MODAL DEVENIR LIVREUR (UNIQUEMENT VÉHICULE + GPS AUTO) */}
      <Modal visible={upgradeModalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Activer mon profil Livreur</Text>
              <TouchableOpacity onPress={() => setUpgradeModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Commune détectée automatiquement par GPS */}
              <Text style={styles.label}>Commune d'activité (Détectée par GPS)</Text>
              <View style={styles.gpsBox}>
                <Ionicons name="location" size={20} color={COLORS.primary} />
                <TextInput
                  style={styles.gpsInput}
                  value={communeName}
                  onChangeText={setCommuneName}
                />
                <TouchableOpacity onPress={detectGpsAndCommune} style={styles.gpsRefreshBtn}>
                  {gpsLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons name="locate" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Moyen de transport</Text>
              <View style={styles.vehicleRow}>
                {[
                  { id: 'moto', label: 'Moto', icon: 'motorbike' },
                  { id: 'camionnette', label: 'Chana / Harbin', icon: 'truck-flatbed' },
                  { id: 'fourgon', label: 'Fourgon', icon: 'truck-delivery' },
                ].map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.vehicleBtn,
                      vehicleType === v.id && styles.vehicleBtnActive,
                    ]}
                    onPress={() => setVehicleType(v.id)}
                  >
                    <MaterialCommunityIcons
                      name={v.icon}
                      size={24}
                      color={vehicleType === v.id ? COLORS.primary : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.vehicleBtnText,
                        vehicleType === v.id && styles.vehicleBtnTextActive,
                      ]}
                    >
                      {v.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Marque / Modèle (Moto, Chana, Harbin, Fourgon...)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Sym 300, VMS, Chana, Harbin, Master..."
                value={vehicleBrand}
                onChangeText={setVehicleBrand}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.label}>Matricule</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: 01234-119-19"
                    value={plateNumber}
                    onChangeText={setPlateNumber}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={styles.label}>Couleur</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ex: Noir, Blanc"
                    value={vehicleColor}
                    onChangeText={setVehicleColor}
                  />
                </View>
              </View>

              <Text style={styles.label}>Photo preuve (Véhicule + Matricule)</Text>
              <View style={styles.photoRow}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickProofPhoto(true)}>
                  <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>Caméra</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickProofPhoto(false)}>
                  <Ionicons name="images-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>Galerie</Text>
                </TouchableOpacity>
              </View>

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
                  <Text style={styles.submitBtnText}>ACTIVER MON COMPTE LIVREUR</Text>
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
    flexDirection: 'row',
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
    marginRight: 14,
  },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  userName: { fontSize: 17, fontWeight: '800', color: COLORS.textDark },
  userPhone: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  roleBadge: {
    alignSelf: 'flex-start',
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
  langRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuItemText: { flex: 1, marginLeft: 12, fontSize: 15, fontWeight: '700', color: COLORS.textDark },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 12,
  },
  logoutText: { color: '#FFF', fontSize: 15, fontWeight: '800', marginLeft: 8 },
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
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 10, marginBottom: 5 },
  gpsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    height: 46,
  },
  gpsInput: { flex: 1, marginLeft: 8, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  gpsRefreshBtn: { padding: 6 },
  vehicleRow: { flexDirection: 'row', justifyContent: 'space-between' },
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
  input: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14,
    backgroundColor: '#F8FAFC',
  },
  photoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  photoBtnText: { marginLeft: 6, fontSize: 13, fontWeight: '700', color: COLORS.primary },
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