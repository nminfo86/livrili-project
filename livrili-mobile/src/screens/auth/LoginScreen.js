import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Image,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { COLORS } from '../../context/ThemeLanguageContext';
import apiClient from '../../api/client';

export default function LoginScreen() {
  const { login } = useContext(AuthContext);

  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // GPS & Commune automatique
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userCoords, setUserCoords] = useState({ lat: 36.1528, lon: 5.6902 });
  const [communeName, setCommuneName] = useState('Détection GPS...');

  // Champs spécifiques Livreur
  const [vehicleType, setVehicleType] = useState('moto');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [proofPhotoUri, setProofPhotoUri] = useState(null);
  const [proofPhotoBase64, setProofPhotoBase64] = useState(null);

  // Modal OTP 2FA Inscription (6 chiffres)
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [devOtpHint, setDevOtpHint] = useState('');
  const [phoneVerifiedBySim, setPhoneVerifiedBySim] = useState(false);

  // Modal Mot de passe oublié (Forgot Password)
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: Demander code | 2: Valider code + Nouveau MDP
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotDevOtp, setForgotDevOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    if (isRegister) {
      detectUserCommuneAutomatic();
    }
  }, [isRegister]);

  const detectUserCommuneAutomatic = async () => {
    setGpsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setCommuneName('El Eulma');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
      setUserCoords({ lat: latitude, lon: longitude });

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=fr`,
        { headers: { 'User-Agent': 'Mozilla/5.0 LivriliAlgeria/1.0' } }
      );
      const data = await res.json();
      const detected =
        data?.address?.city ||
        data?.address?.town ||
        data?.address?.village ||
        data?.address?.municipality ||
        'El Eulma';
      setCommuneName(detected);
    } catch (e) {
      setCommuneName('El Eulma');
    } finally {
      setGpsLoading(false);
    }
  };

  const isValidAlgerianPhone = (num) => {
    const clean = num.replace(/\s+/g, '');
    if (/^0[567](\d)\1{7}$/.test(clean) || clean === '0512345678' || clean === '0612345678') {
      return false;
    }
    return /^(05|06|07)[0-9]{8}$/.test(clean);
  };

  const isStrongPassword = (pwd) => {
    const hasLetter = /[a-zA-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^a-zA-Z0-9]/.test(pwd);
    return pwd.length >= 8 && hasLetter && hasNumber && hasSpecial;
  };

  const pickDriverProofPhoto = async (fromCamera = false) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert('Permission requise', 'Veuillez autoriser l’accès à la caméra/galerie.');
        return;
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true, allowsEditing: true });

      if (!result.canceled && result.assets && result.assets[0]) {
        setProofPhotoUri(result.assets[0].uri);
        setProofPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (e) {
      Alert.alert('Erreur photo', 'Impossible de charger la photo.');
    }
  };

  const verifySimOwnershipViaWhatsapp = async () => {
    if (!isValidAlgerianPhone(phone)) {
      Alert.alert(
        'Numéro invalide',
        'Veuillez sélectionner le vrai numéro de votre carte SIM (05, 06 ou 07 suivi de 8 chiffres).'
      );
      return;
    }
    setPhoneVerifiedBySim(true);
    const msg = encodeURIComponent(`Vérification de mon numéro Livrili DZ : ${phone.trim()}`);
    Linking.openURL(`https://wa.me/213552791323?text=${msg}`).catch(() => {});
  };

  const handleSubmit = async () => {
    if (!isRegister) {
      if ((!email.trim() && !phone.trim()) || !password.trim()) {
        Alert.alert('Champs requis', 'Veuillez saisir votre email/téléphone et votre mot de passe.');
        return;
      }

      setLoading(true);
      try {
        const res = await apiClient.post('auth.php?action=login', {
          identifier: (email || phone).trim(),
          email: (email || phone).trim(),
          phone: (email || phone).trim(),
          password: password,
        });
        const data = res.data;

        if (data && (data.token || data.auth_token || data.success)) {
          await login(data.token || data.auth_token, data.user);
        } else {
          Alert.alert('Erreur', data?.error || data?.message || 'Identifiants incorrects.');
        }
      } catch (err) {
        const msg = err.response?.data?.error || err.response?.data?.message || 'Erreur de connexion.';
        Alert.alert('Attention', msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    // --- VALIDATIONS INSCRIPTION ---
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password) {
      Alert.alert('Champs requis', 'Veuillez remplir tous les champs obligatoires.');
      return;
    }

    if (!isValidAlgerianPhone(phone.trim())) {
      Alert.alert(
        'Numéro de téléphone invalide',
        'Veuillez utiliser le vrai numéro de votre carte SIM (05, 06 ou 07).'
      );
      return;
    }

    if (!isStrongPassword(password)) {
      Alert.alert(
        'Mot de passe faible',
        'Le mot de passe doit contenir au moins 8 caractères avec des lettres, des chiffres et un caractère spécial (@, #, !, $).'
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Confirmation incorrecte', 'Les deux mots de passe ne correspondent pas.');
      return;
    }

    if (role === 'driver') {
      if (!vehicleBrand.trim() || !plateNumber.trim()) {
        Alert.alert(
          'Informations Livreur manquantes',
          'Veuillez indiquer la marque du véhicule et le numéro d’immatriculation.'
        );
        return;
      }
      if (!proofPhotoBase64) {
        Alert.alert(
          'Photo preuve obligatoire',
          'Veuillez ajouter une photo de vous avec votre moyen de transport et matricule visible.'
        );
        return;
      }
    }

    setLoading(true);
    try {
      const otpRes = await apiClient.post('auth.php?action=send_otp', {
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        full_name: fullName.trim(),
      });

      const receivedOtp = otpRes.data?.otp_code || otpRes.data?.dev_otp;
      setDevOtpHint(receivedOtp ? String(receivedOtp) : '');
      setOtpCode('');
      setOtpModalVisible(true);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.message;
      Alert.alert('Erreur', errMsg || 'Impossible d’envoyer le code OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpAndRegister = async () => {
    if (otpCode.trim().length !== 6) {
      Alert.alert('Code invalide', 'Veuillez entrer le code de vérification à 6 chiffres.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        password: password,
        role: role,
        otp_code: otpCode.trim(),
        latitude: userCoords.lat,
        longitude: userCoords.lon,
        commune_name: communeName === 'Détection GPS...' ? 'El Eulma' : communeName,
        vehicle_type: vehicleType,
        moto_brand: vehicleBrand.trim(),
        moto_color: vehicleColor.trim() || 'Standard',
        plate_number: plateNumber.trim(),
        photo_moto: proofPhotoBase64,
      };

      const res = await apiClient.post('auth.php?action=register', payload);
      const data = res.data;

      if (data && (data.token || data.auth_token || data.success)) {
        setOtpModalVisible(false);
        const token = data.token || data.auth_token || 'session_token';
        const userObj = data.user || {
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          commune_name: payload.commune_name,
          role: role,
          current_mode: role,
          is_driver: role === 'driver',
        };
        await login(token, userObj);
      } else {
        Alert.alert('Erreur OTP', data?.error || data?.message || 'Code OTP incorrect.');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Code OTP invalide.';
      Alert.alert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  // --- FONCTIONS MOT DE PASSE OUBLIÉ ---
  const handleRequestPasswordReset = async () => {
    if (!forgotIdentifier.trim()) {
      Alert.alert('Champ requis', 'Veuillez entrer votre email ou numéro de téléphone.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await apiClient.post('auth.php?action=forgot_password', {
        identifier: forgotIdentifier.trim(),
      });
      if (res.data?.success) {
        setForgotDevOtp(res.data?.dev_otp ? String(res.data.dev_otp) : '');
        setForgotOtp('');
        setForgotStep(2);
      } else {
        Alert.alert('Erreur', res.data?.error || 'Compte introuvable.');
      }
    } catch (err) {
      Alert.alert(
        'Erreur',
        err.response?.data?.error || 'Aucun compte trouvé avec cet identifiant.'
      );
    } finally {
      setForgotLoading(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (forgotOtp.trim().length !== 6) {
      Alert.alert('Code invalide', 'Veuillez saisir le code OTP à 6 chiffres.');
      return;
    }
    if (!isStrongPassword(newPassword)) {
      Alert.alert(
        'Mot de passe faible',
        'Le nouveau mot de passe doit contenir au moins 8 caractères avec lettres, chiffres et caractère spécial (@, #, !, $).'
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Erreur', 'Les deux mots de passe ne correspondent pas.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await apiClient.post('auth.php?action=reset_password', {
        identifier: forgotIdentifier.trim(),
        otp_code: forgotOtp.trim(),
        new_password: newPassword,
      });

      if (res.data?.success) {
        setForgotModalVisible(false);
        setForgotStep(1);
        Alert.alert('Succès', 'Votre mot de passe a été réinitialisé avec succès !');
        if (res.data.token && res.data.user) {
          await login(res.data.token, res.data.user);
        }
      } else {
        Alert.alert('Erreur', res.data?.error || 'Impossible de réinitialiser le mot de passe.');
      }
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Code OTP incorrect ou expiré.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.brandBox}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="motorbike" size={42} color="#FFFFFF" />
          </View>
          <Text style={styles.brandTitle}>LIVRILI DZ</Text>
          <Text style={styles.brandSubtitle}>Livraison rapide partout en Algérie 🇩🇿</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.tabSwitch}>
            <TouchableOpacity
              style={[styles.tabBtn, !isRegister && styles.tabBtnActive]}
              onPress={() => setIsRegister(false)}
            >
              <Text style={[styles.tabText, !isRegister && styles.tabTextActive]}>Connexion</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, isRegister && styles.tabBtnActive]}
              onPress={() => setIsRegister(true)}
            >
              <Text style={[styles.tabText, isRegister && styles.tabTextActive]}>Inscription</Text>
            </TouchableOpacity>
          </View>

          {isRegister && (
            <>
              <Text style={styles.label}>Type de compte</Text>
              <View style={styles.roleRow}>
                <TouchableOpacity
                  style={[styles.roleChip, role === 'customer' && styles.roleChipActive]}
                  onPress={() => setRole('customer')}
                >
                  <Ionicons
                    name="cube-outline"
                    size={20}
                    color={role === 'customer' ? COLORS.primary : '#64748B'}
                  />
                  <Text
                    style={[styles.roleChipText, role === 'customer' && styles.roleChipTextActive]}
                  >
                    Client
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.roleChip, role === 'driver' && styles.roleChipActive]}
                  onPress={() => setRole('driver')}
                >
                  <MaterialCommunityIcons
                    name="motorbike"
                    size={22}
                    color={role === 'driver' ? COLORS.primary : '#64748B'}
                  />
                  <Text
                    style={[styles.roleChipText, role === 'driver' && styles.roleChipTextActive]}
                  >
                    Livreur
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Votre Commune (Détectée automatiquement par GPS)</Text>
              <View
                style={[
                  styles.inputBox,
                  { backgroundColor: '#E6F2EC', borderColor: COLORS.primary },
                ]}
              >
                <Ionicons name="location" size={20} color={COLORS.primary} />
                <Text style={[styles.input, { fontWeight: '800', color: COLORS.primary }]}>
                  {communeName}
                </Text>
                <TouchableOpacity onPress={detectUserCommuneAutomatic}>
                  {gpsLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons name="locate" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Nom complet</Text>
              <View style={styles.inputBox}>
                <Ionicons name="person-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Nom et Prénom"
                  autoComplete="name"
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              <Text style={styles.label}>
                Numéro de téléphone de cet appareil (Suggestion SIM automatique)
              </Text>
              <View style={styles.inputBox}>
                <Ionicons name="call-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Cliquez ici et choisissez votre numéro SIM"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  importantForAutofill="yes"
                  maxLength={10}
                  value={phone}
                  onChangeText={(txt) => setPhone(txt.replace(/[^0-9]/g, ''))}
                />
                {isValidAlgerianPhone(phone) && (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                )}
              </View>

              <TouchableOpacity
                style={styles.simVerifyBtn}
                onPress={verifySimOwnershipViaWhatsapp}
              >
                <Ionicons
                  name={phoneVerifiedBySim ? 'checkmark-done-circle' : 'logo-whatsapp'}
                  size={17}
                  color={COLORS.primary}
                />
                <Text style={styles.simVerifyText}>
                  {phoneVerifiedBySim
                    ? 'Numéro SIM vérifié'
                    : 'Vérifier mon numéro via la carte SIM / WhatsApp'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.label}>{isRegister ? 'Adresse Email' : 'Email ou Téléphone'}</Text>
          <View style={styles.inputBox}>
            <Ionicons name="mail-outline" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="exemple@gmail.com ou 0550..."
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.label}>Mot de passe</Text>
          <View style={styles.inputBox}>
            <Ionicons name="lock-closed-outline" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="Lettres + chiffres + symbole (@#!)"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>
          </View>

          {/* LIEN MOT DE PASSE OUBLIÉ (EN MODE CONNEXION) */}
          {!isRegister && (
            <TouchableOpacity
              style={styles.forgotLinkBtn}
              onPress={() => {
                setForgotIdentifier(email || phone);
                setForgotStep(1);
                setForgotModalVisible(true);
              }}
            >
              <Text style={styles.forgotLinkText}>Mot de passe oublié ?</Text>
            </TouchableOpacity>
          )}

          {isRegister && (
            <>
              <Text style={styles.pwdHint}>
                Min. 8 caractères avec lettres, chiffres et caractère spécial (@, #, !, $...)
              </Text>

              <Text style={styles.label}>Confirmer le mot de passe</Text>
              <View style={styles.inputBox}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Retapez votre mot de passe"
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>
            </>
          )}

          {isRegister && role === 'driver' && (
            <View style={styles.driverSection}>
              <Text style={styles.driverSectionTitle}>
                Informations du Véhicule & Preuve Livreur
              </Text>

              <Text style={styles.label}>Moyen de transport</Text>
              <View style={styles.vehicleTypeRow}>
                {[
                  { id: 'moto', label: 'Moto', icon: 'motorbike' },
                  { id: 'camionnette', label: 'Chana / Harbin', icon: 'truck-flatbed' },
                  { id: 'fourgon', label: 'Fourgon', icon: 'truck-delivery' },
                ].map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.vehicleTypeBtn,
                      vehicleType === v.id && styles.vehicleTypeBtnActive,
                    ]}
                    onPress={() => setVehicleType(v.id)}
                  >
                    <MaterialCommunityIcons
                      name={v.icon}
                      size={22}
                      color={vehicleType === v.id ? COLORS.primary : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.vehicleTypeText,
                        vehicleType === v.id && styles.vehicleTypeTextActive,
                      ]}
                    >
                      {v.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Marque / Modèle du véhicule</Text>
              <View style={styles.inputBox}>
                <MaterialCommunityIcons name="motorbike" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Ex: SYM 300, VMS, Chana, Harbin, Master..."
                  value={vehicleBrand}
                  onChangeText={setVehicleBrand}
                />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={styles.label}>Matricule</Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex: 01234-119-19"
                      value={plateNumber}
                      onChangeText={setPlateNumber}
                    />
                  </View>
                </View>

                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={styles.label}>Couleur</Text>
                  <View style={styles.inputBox}>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex: Noir, Blanc..."
                      value={vehicleColor}
                      onChangeText={setVehicleColor}
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.label}>
                Photo preuve (Vous + Véhicule avec Matricule visible)
              </Text>
              <View style={styles.photoButtonsRow}>
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={() => pickDriverProofPhoto(true)}
                >
                  <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>Prendre Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={() => pickDriverProofPhoto(false)}
                >
                  <Ionicons name="images-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.photoBtnText}>Galerie</Text>
                </TouchableOpacity>
              </View>

              {proofPhotoUri && (
                <View style={styles.previewBox}>
                  <Image source={{ uri: proofPhotoUri }} style={styles.previewImage} />
                  <Text style={styles.previewSuccess}>✓ Photo preuve ajoutée</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isRegister ? 'RECEVOIR LE CODE OTP (2FA)' : 'SE CONNECTER'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL OTP INSCRIPTION */}
      <Modal visible={otpModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Vérification 2FA (6 chiffres)</Text>
              <TouchableOpacity onPress={() => setOtpModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <Text style={styles.otpSubtitle}>
              Code de sécurité généré pour {phone} / {email}.
            </Text>

            {devOtpHint ? (
              <TouchableOpacity
                style={styles.devOtpBanner}
                onPress={() => setOtpCode(devOtpHint)}
              >
                <Text style={styles.devOtpText}>
                  Votre code OTP : {devOtpHint} (Appuyez ici pour remplir)
                </Text>
              </TouchableOpacity>
            ) : null}

            <TextInput
              style={styles.otpInput}
              placeholder="• • • • • •"
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { marginTop: 16 }]}
              onPress={handleVerifyOtpAndRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitBtnText}>VALIDER LE CODE & CONFIRMER</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL MOT DE PASSE OUBLIÉ (2 ÉTAPES AVEC OTP 6 CHIFFRES) */}
      <Modal visible={forgotModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mot de passe oublié</Text>
              <TouchableOpacity onPress={() => setForgotModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {forgotStep === 1 ? (
              <>
                <Text style={styles.otpSubtitle}>
                  Entrez votre adresse email ou votre numéro de téléphone pour recevoir un code de récupération à 6 chiffres.
                </Text>

                <View style={styles.inputBox}>
                  <Ionicons name="mail-outline" size={20} color="#64748B" />
                  <TextInput
                    style={styles.input}
                    placeholder="Votre Email ou Téléphone (0550...)"
                    autoCapitalize="none"
                    value={forgotIdentifier}
                    onChangeText={setForgotIdentifier}
                  />
                </View>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleRequestPasswordReset}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>ENVOYER LE CODE À 6 CHIFFRES</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.otpSubtitle}>
                  Entrez le code à 6 chiffres reçu et choisissez votre nouveau mot de passe.
                </Text>

                {forgotDevOtp ? (
                  <TouchableOpacity
                    style={styles.devOtpBanner}
                    onPress={() => setForgotOtp(forgotDevOtp)}
                  >
                    <Text style={styles.devOtpText}>
                      Code OTP : {forgotDevOtp} (Appuyez pour remplir)
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TextInput
                  style={styles.otpInput}
                  placeholder="• • • • • •"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={forgotOtp}
                  onChangeText={setForgotOtp}
                />

                <Text style={styles.label}>Nouveau mot de passe</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="lock-closed-outline" size={20} color="#64748B" />
                  <TextInput
                    style={styles.input}
                    placeholder="Lettres + chiffres + symbole (@#!)"
                    secureTextEntry={!showPassword}
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                </View>

                <Text style={styles.label}>Confirmer le nouveau mot de passe</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#64748B" />
                  <TextInput
                    style={styles.input}
                    placeholder="Retapez le nouveau mot de passe"
                    secureTextEntry={!showPassword}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                  />
                </View>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleConfirmPasswordReset}
                  disabled={forgotLoading}
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>CHANGER MON MOT DE PASSE</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  brandBox: { alignItems: 'center', marginBottom: 16, marginTop: 14 },
  logoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    elevation: 6,
  },
  brandTitle: { fontSize: 23, fontWeight: '900', color: '#0F172A', letterSpacing: 1 },
  brandSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, elevation: 4 },
  tabSwitch: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#FFFFFF', elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: COLORS.primary },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 5, marginTop: 10 },
  pwdHint: { fontSize: 11, color: '#64748B', marginTop: 4 },
  forgotLinkBtn: { alignSelf: 'flex-end', marginTop: 8, paddingVertical: 2 },
  forgotLinkText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    backgroundColor: '#F8FAFC',
  },
  input: { flex: 1, marginLeft: 8, fontSize: 14, color: '#0F172A' },
  simVerifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  simVerifyText: { marginLeft: 6, fontSize: 11, fontWeight: '700', color: COLORS.primary },
  roleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  roleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginHorizontal: 4,
  },
  roleChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  roleChipText: { marginLeft: 6, fontSize: 14, fontWeight: '800', color: '#64748B' },
  roleChipTextActive: { color: COLORS.primary },
  driverSection: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  driverSectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.primary, marginBottom: 6 },
  vehicleTypeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  vehicleTypeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    marginHorizontal: 3,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  vehicleTypeBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  vehicleTypeText: { fontSize: 11, fontWeight: '700', color: '#64748B', marginTop: 2 },
  vehicleTypeTextActive: { color: COLORS.primary },
  photoButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  photoBtnText: { marginLeft: 6, fontSize: 12, fontWeight: '700', color: COLORS.primary },
  previewBox: { alignItems: 'center', marginTop: 10 },
  previewImage: { width: '100%', height: 130, borderRadius: 10 },
  previewSuccess: { marginTop: 4, fontSize: 12, fontWeight: '700', color: COLORS.primary },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  otpSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 12 },
  devOtpBanner: {
    backgroundColor: COLORS.primaryLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  devOtpText: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  otpInput: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 12,
    height: 54,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 10,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
});