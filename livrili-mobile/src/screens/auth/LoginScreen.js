// src/screens/auth/LoginScreen.js
import React, { useState, useContext, useEffect } from "react";
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
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { Ionicons, MaterialCommunityIcons, Fontisto } from "@expo/vector-icons";
import { AuthContext } from "../../context/AuthContext";
import { useThemeLang, COLORS } from "../../context/ThemeLanguageContext";
import apiClient from "../../api/client";
import {
  isValidLoginIdentifier,
  isValidFullName,
  isValidDzPhone,
  isValidEmail,
  isValidPassword,
  isValidBrand,
  isValidColor,
  isValidPlate,
  isValidPhoto,
} from "../../utils/validators";

const HERO_IMAGE = require('../../../assets/login-hero.png');

const LANGUAGES = [
  { code: "fr", label: "Français", short: "Français" },
  { code: "ar", label: "العربية", short: "العربية" },
  { code: "dz", label: "الدارجة", short: "الدارجة" },
];

export default function LoginScreen() {
  const { login } = useContext(AuthContext);
  const { t, lang, isRTL, changeLanguage } = useThemeLang();

  const [langDropdownVisible, setLangDropdownVisible] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("customer");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittedAttempt, setSubmittedAttempt] = useState(false);

  // État de suivi "champ quitté" (Blur)
  const [touched, setTouched] = useState({
    loginId: false,
    loginPassword: false,
    fullName: false,
    phone: false,
    email: false,
    password: false,
    confirmPassword: false,
    brand: false,
    plate: false,
    color: false,
  });

  const markTouched = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  // GPS & Commune
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userCoords, setUserCoords] = useState({ lat: 36.1528, lon: 5.6902 });
  const [communeName, setCommuneName] = useState("El Eulma");

  // Champs spécifiques Livreur
  const [transportModes, setTransportModes] = useState([
    { id: "moto", title_fr: "Moto", title_ar: "دراجة نارية", icon: "motorbike" },
    { id: "camionnette", title_fr: "Chana / Harbin", title_ar: "شاحنة صغيرة", icon: "truck-flatbed" },
    { id: "fourgon", title_fr: "Fourgon", title_ar: "فورغون", icon: "truck-delivery" },
  ]);
  const [vehicleType, setVehicleType] = useState("moto");
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [proofPhotoUri, setProofPhotoUri] = useState(null);
  const [proofPhotoBase64, setProofPhotoBase64] = useState(null);

  // Modal OTP 2FA Inscription
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [devOtpHint, setDevOtpHint] = useState("");
  const [phoneVerifiedBySim, setPhoneVerifiedBySim] = useState(false);

  useEffect(() => {
    apiClient
      .get("customer.php?action=get_transport_modes")
      .then((res) => {
        if (res.data?.transport_modes?.length > 0) {
          setTransportModes(res.data.transport_modes);
          setVehicleType(res.data.transport_modes[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isRegister) {
      detectUserCommuneAutomatic();
    }
  }, [isRegister]);

  const detectUserCommuneAutomatic = async () => {
    setGpsLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setCommuneName("El Eulma");
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
      setUserCoords({ lat: latitude, lon: longitude });

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=fr`,
        { headers: { "User-Agent": "Mozilla/5.0 LivriliAlgeria/1.0" } },
      );
      const data = await res.json();
      const detected =
        data?.address?.city ||
        data?.address?.town ||
        data?.address?.village ||
        data?.address?.municipality ||
        "El Eulma";
      setCommuneName(detected.trim());
    } catch (e) {
      setCommuneName("El Eulma");
    } finally {
      setGpsLoading(false);
    }
  };

  // Validations unitaires
  const loginIdOk = isValidLoginIdentifier(email);
  const loginPassOk = isValidPassword(password);
  const nameOk = isValidFullName(fullName);
  const phoneOk = isValidDzPhone(phone);
  const emailOk = isValidEmail(email);
  const passOk = isValidPassword(password);
  const confirmPassOk = confirmPassword.length > 0 && password === confirmPassword;
  const brandOk = isValidBrand(vehicleBrand);
  const plateOk = isValidPlate(plateNumber);
  const colorOk = isValidColor(vehicleColor);
  const photoOk = isValidPhoto(proofPhotoBase64);

  const pickDriverProofPhoto = async (fromCamera = false) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") return;

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true, allowsEditing: true });

      if (!result.canceled && result.assets && result.assets[0]) {
        setProofPhotoUri(result.assets[0].uri);
        setProofPhotoBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
      }
    } catch (e) {}
  };

  const verifySimOwnershipViaWhatsapp = async () => {
    if (!isValidDzPhone(phone)) {
      setSubmittedAttempt(true);
      markTouched("phone");
      return;
    }
    setPhoneVerifiedBySim(true);
    const msg = encodeURIComponent(`Vérification de mon numéro Livrili DZ : ${phone.trim()}`);
    Linking.openURL(`https://wa.me/213552791323?text=${msg}`).catch(() => {});
  };

  const handleSubmit = async () => {
    setSubmittedAttempt(true);

    if (!isRegister) {
      if (!loginIdOk || !loginPassOk) return;
      setLoading(true);
      try {
        const cleanId = email.trim();
        const res = await apiClient.post("auth.php?action=login", {
          identifier: cleanId,
          email: cleanId,
          phone: cleanId,
          password: password,
        });
        const data = res.data;
        if (data && (data.token || data.auth_token || data.success)) {
          await login(data.token || data.auth_token, data.user);
        } else {
          Alert.alert("Erreur", data?.error || data?.message || "Identifiants incorrects.");
        }
      } catch (err) {
        const msg = err.response?.data?.error || err.response?.data?.message || "Erreur de connexion.";
        Alert.alert("Attention", msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    const baseValid = nameOk && phoneOk && emailOk && passOk && confirmPassOk;
    const driverValid = role !== "driver" || (brandOk && plateOk && colorOk && photoOk);

    if (!baseValid || !driverValid) return;

    setLoading(true);
    try {
      const otpRes = await apiClient.post("auth.php?action=send_otp", {
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        full_name: fullName.trim(),
      });
      const receivedOtp = otpRes.data?.otp_code || otpRes.data?.dev_otp;
      setDevOtpHint(receivedOtp ? String(receivedOtp) : "");
      setOtpCode("");
      setOtpModalVisible(true);
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.message;
      Alert.alert("Erreur", errMsg || "Impossible d'envoyer le code OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtpAndRegister = async () => {
    if (otpCode.trim().length !== 6) {
      Alert.alert("Code invalide", "Veuillez entrer le code de vérification à 6 chiffres.");
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
        commune_name: communeName || "El Eulma",
        vehicle_type: vehicleType,
        moto_brand: vehicleBrand.trim(),
        moto_color: vehicleColor.trim() || "Standard",
        plate_number: plateNumber.trim(),
        photo_moto: proofPhotoBase64,
      };
      const res = await apiClient.post("auth.php?action=register", payload);
      const data = res.data;
      if (data && (data.token || data.auth_token || data.success)) {
        setOtpModalVisible(false);
        const token = data.token || data.auth_token || "session_token";
        const userObj = data.user || {
          full_name: fullName.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          commune_name: payload.commune_name,
          role: role,
          current_mode: role,
          is_driver: role === "driver",
        };
        await login(token, userObj);
      } else {
        Alert.alert("Erreur OTP", data?.error || data?.message || "Code OTP incorrect.");
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || "Code OTP invalide.";
      Alert.alert("Erreur", msg);
    } finally {
      setLoading(false);
    }
  };

  const rowDir = isRTL ? "row-reverse" : "row";
  const textAlignDir = isRTL ? "right" : "left";
  const currentLangObj = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  // Le style ne change qu'après avoir quitté le champ (isFieldTouched) ou après validation globale
  const getBoxStyle = (isValid, isFieldTouched) => {
    const shouldShow = isFieldTouched || submittedAttempt;
    if (shouldShow && isValid) {
      return [
        styles.softInputBox,
        { flexDirection: rowDir, borderColor: COLORS.primary, borderWidth: 1.5 },
      ];
    }
    if (shouldShow && !isValid) {
      return [
        styles.softInputBox,
        { flexDirection: rowDir, borderColor: COLORS.danger, backgroundColor: COLORS.dangerLight, borderWidth: 1.5 },
      ];
    }
    return [styles.softInputBox, { flexDirection: rowDir }];
  };

  const handleGoogleSignIn = async () => {
    Alert.alert("Google", "Connexion rapide avec votre compte Google...");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* DROPDOWN LANGUE */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.langDropdownBtn}
            activeOpacity={0.8}
            onPress={() => setLangDropdownVisible(true)}
          >
            <Text style={styles.langLabelPrefix}>Lang: </Text>
            <Text style={styles.langLabelValue}>{currentLangObj.short}</Text>
            <Ionicons name="chevron-down" size={16} color="#0F172A" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        {/* ILLUSTRATION HERO */}
        <View style={styles.heroContainer}>
          {HERO_IMAGE ? (
            <Image source={HERO_IMAGE} style={styles.heroImage} resizeMode="contain" />
          ) : (
            <View style={styles.heroFallback}>
              <Fontisto name="motorcycle" size={80} color={COLORS.primary} />
            </View>
          )}
        </View>

        {/* FORMULAIRE */}
        <View style={styles.formContainer}>
          {!isRegister ? (
            <>
              {/* Email ou Téléphone */}
              <View style={getBoxStyle(loginIdOk, touched.loginId)}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("emailOrPhoneLabel") || "Email ou Téléphone"}
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => markTouched("loginId")}
                />
                {(touched.loginId || submittedAttempt) && loginIdOk ? (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                ) : (touched.loginId || submittedAttempt) && !loginIdOk ? (
                  <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                ) : null}
              </View>
              {(touched.loginId || submittedAttempt) && !loginIdOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errIdentifier") || "Format invalide (ex: 0550123456 ou nom@mail.com)."}
                </Text>
              )}

              {/* Mot de passe */}
              <View style={[getBoxStyle(loginPassOk, touched.loginPassword), { marginTop: 14 }]}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("passwordLabel") || "Mot de passe"}
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => markTouched("loginPassword")}
                />
                {(touched.loginPassword || submittedAttempt) && loginPassOk && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                    style={{ marginHorizontal: 6 }}
                  />
                )}
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
              {(touched.loginPassword || submittedAttempt) && !loginPassOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errLoginPassword") || "Mot de passe requis (min 6 caractères)."}
                </Text>
              )}
            </>
          ) : (
            /* --- INSCRIPTION --- */
            <>
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("accountType") || "Type de compte"}
              </Text>
              <View style={[styles.roleRow, { flexDirection: rowDir }]}>
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    { flexDirection: rowDir },
                    role === "customer" && styles.roleChipActive,
                  ]}
                  onPress={() => setRole("customer")}
                >
                  <Ionicons
                    name="cube-outline"
                    size={20}
                    color={role === "customer" ? COLORS.primary : "#64748B"}
                  />
                  <Text style={[styles.roleChipText, role === "customer" && styles.roleChipTextActive]}>
                    {t("roleCustomer") || "Client"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleChip,
                    { flexDirection: rowDir },
                    role === "driver" && styles.roleChipActive,
                  ]}
                  onPress={() => setRole("driver")}
                >
                  <Fontisto
                    name="motorcycle"
                    size={18}
                    color={role === "driver" ? COLORS.primary : "#64748B"}
                  />
                  <Text style={[styles.roleChipText, role === "driver" && styles.roleChipTextActive]}>
                    {t("roleDriver") || "Livreur"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* COMMUNE */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("communeAutoGps") || "Commune (GPS)"}
              </Text>
              <View
                style={[
                  styles.softInputBox,
                  {
                    flexDirection: rowDir,
                    backgroundColor: COLORS.primaryLight,
                    borderColor: COLORS.primary,
                    borderWidth: 1.5,
                  },
                ]}
              >
                <Ionicons name="location" size={20} color={COLORS.primary} />
                <Text
                  style={[
                    styles.softInput,
                    { textAlign: textAlignDir, fontWeight: "800", color: COLORS.primary },
                  ]}
                >
                  {gpsLoading ? (t("detectingGps") || "Recherche...") : communeName}
                </Text>
                <TouchableOpacity onPress={detectUserCommuneAutomatic}>
                  {gpsLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              </View>

              {/* NOM COMPLET */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("fullName") || "Nom complet"}
              </Text>
              <View style={getBoxStyle(nameOk, touched.fullName)}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("fullNamePlaceholder") || "Ex: Nassim Bouhezila"}
                  placeholderTextColor="#64748B"
                  value={fullName}
                  onChangeText={setFullName}
                  onBlur={() => markTouched("fullName")}
                />
                {(touched.fullName || submittedAttempt) && nameOk ? (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                ) : (touched.fullName || submittedAttempt) && !nameOk ? (
                  <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                ) : null}
              </View>
              {(touched.fullName || submittedAttempt) && !nameOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errFullName") || "Nom complet invalide (lettres uniquement, min 3 caractères)."}
                </Text>
              )}

              {/* TÉLÉPHONE */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("phoneLabel") || "Téléphone"}
              </Text>
              <View style={getBoxStyle(phoneOk, touched.phone)}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("phonePlaceholder") || "05 / 06 / 07 XX XX XX XX"}
                  placeholderTextColor="#64748B"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(txt) => setPhone(txt.replace(/[^0-9]/g, ""))}
                  onBlur={() => markTouched("phone")}
                />
                {(touched.phone || submittedAttempt) && phoneOk ? (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                ) : (touched.phone || submittedAttempt) && !phoneOk ? (
                  <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                ) : null}
              </View>
              {(touched.phone || submittedAttempt) && !phoneOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errPhone") || "Numéro invalide : 10 chiffres (05, 06 ou 07)."}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.simVerifyBtn,
                  { flexDirection: rowDir, alignSelf: isRTL ? "flex-end" : "flex-start" },
                ]}
                onPress={verifySimOwnershipViaWhatsapp}
              >
                <Ionicons
                  name={phoneVerifiedBySim ? "checkmark-done-circle" : "logo-whatsapp"}
                  size={17}
                  color={COLORS.primary}
                />
                <Text style={styles.simVerifyText}>
                  {phoneVerifiedBySim ? (t("simVerified") || "Numéro vérifié") : (t("simVerifyBtn") || "Vérifier via WhatsApp")}
                </Text>
              </TouchableOpacity>

              {/* EMAIL */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("emailLabel") || "Email"}
              </Text>
              <View style={getBoxStyle(emailOk, touched.email)}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("emailPlaceholder") || "nom@domaine.com"}
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => markTouched("email")}
                />
                {(touched.email || submittedAttempt) && emailOk ? (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                ) : (touched.email || submittedAttempt) && !emailOk ? (
                  <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                ) : null}
              </View>
              {(touched.email || submittedAttempt) && !emailOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errEmail") || "Adresse email invalide."}
                </Text>
              )}

              {/* MOT DE PASSE */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("passwordLabel") || "Mot de passe"}
              </Text>
              <View style={getBoxStyle(passOk, touched.password)}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("passwordPlaceholder") || "Minimum 6 caractères"}
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => markTouched("password")}
                />
                {(touched.password || submittedAttempt) && passOk && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                    style={{ marginHorizontal: 4 }}
                  />
                )}
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
              {(touched.password || submittedAttempt) && !passOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errPassword") || "Le mot de passe doit comporter au moins 6 caractères."}
                </Text>
              )}

              {/* CONFIRMATION MOT DE PASSE */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("confirmPasswordLabel") || "Confirmer le mot de passe"}
              </Text>
              <View style={getBoxStyle(confirmPassOk, touched.confirmPassword)}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("confirmPasswordPlaceholder") || "Répéter le mot de passe"}
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onBlur={() => markTouched("confirmPassword")}
                />
                {(touched.confirmPassword || submittedAttempt) && confirmPassOk ? (
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                ) : (touched.confirmPassword || submittedAttempt) && !confirmPassOk ? (
                  <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                ) : null}
              </View>
              {(touched.confirmPassword || submittedAttempt) && !confirmPassOk && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errConfirmPassword") || "Les mots de passe ne correspondent pas."}
                </Text>
              )}

              {/* SECTION LIVREUR */}
              {role === "driver" && (
                <View style={styles.driverSection}>
                  <Text style={[styles.driverSectionTitle, { textAlign: textAlignDir }]}>
                    {t("driverSectionTitle") || "Informations Véhicule Livreur"}
                  </Text>

                  <Text style={[styles.label, { textAlign: textAlignDir }]}>
                    {t("transportModeLabel") || "Type de véhicule"}
                  </Text>
                  <View style={[styles.vehicleTypeRow, { flexDirection: rowDir }]}>
                    {transportModes.map((v) => {
                      const vLabel = isRTL && v.title_ar ? v.title_ar : v.title_fr;
                      const active = vehicleType === v.id;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={[styles.vehicleTypeBtn, active && styles.vehicleTypeBtnActive]}
                          onPress={() => setVehicleType(v.id)}
                        >
                          {v.id === "moto" ? (
                            <Fontisto
                              name="motorcycle"
                              size={20}
                              color={active ? COLORS.primary : "#64748B"}
                            />
                          ) : (
                            <MaterialCommunityIcons
                              name={v.icon || "truck-flatbed"}
                              size={22}
                              color={active ? COLORS.primary : "#64748B"}
                            />
                          )}
                          <Text style={[styles.vehicleTypeText, active && styles.vehicleTypeTextActive]}>
                            {vLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Marque */}
                  <Text style={[styles.label, { textAlign: textAlignDir }]}>
                    {t("vehicleBrandLabel") || "Marque et modèle"}
                  </Text>
                  <View style={getBoxStyle(brandOk, touched.brand)}>
                    <TextInput
                      style={[styles.softInput, { textAlign: textAlignDir }]}
                      placeholder={t("vehicleBrandPlaceholder") || "Ex: SYM, DFSK..."}
                      placeholderTextColor="#64748B"
                      value={vehicleBrand}
                      onChangeText={setVehicleBrand}
                      onBlur={() => markTouched("brand")}
                    />
                    {(touched.brand || submittedAttempt) && brandOk ? (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    ) : (touched.brand || submittedAttempt) && !brandOk ? (
                      <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                    ) : null}
                  </View>
                  {(touched.brand || submittedAttempt) && !brandOk && (
                    <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                      {t("errBrand") || "Indiquez la marque réelle."}
                    </Text>
                  )}

                  {/* Matricule & Couleur */}
                  <View style={{ flexDirection: rowDir, justifyContent: "space-between" }}>
                    <View style={{ flex: 1, marginHorizontal: 3 }}>
                      <Text style={[styles.label, { textAlign: textAlignDir }]}>
                        {t("plateNumberLabel") || "Matricule"}
                      </Text>
                      <View style={getBoxStyle(plateOk, touched.plate)}>
                        <TextInput
                          style={[styles.softInput, { textAlign: textAlignDir }]}
                          placeholder={t("plateNumberPlaceholder") || "Ex: 12345-122-19"}
                          placeholderTextColor="#64748B"
                          value={plateNumber}
                          onChangeText={setPlateNumber}
                          onBlur={() => markTouched("plate")}
                        />
                        {(touched.plate || submittedAttempt) && plateOk ? (
                          <Ionicons name="checkmark-circle" size={19} color={COLORS.primary} />
                        ) : (touched.plate || submittedAttempt) && !plateOk ? (
                          <Ionicons name="alert-circle" size={19} color={COLORS.danger} />
                        ) : null}
                      </View>
                      {(touched.plate || submittedAttempt) && !plateOk && (
                        <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                          {t("errPlate") || "Matricule invalide."}
                        </Text>
                      )}
                    </View>

                    <View style={{ flex: 1, marginHorizontal: 3 }}>
                      <Text style={[styles.label, { textAlign: textAlignDir }]}>
                        {t("vehicleColorLabel") || "Couleur"}
                      </Text>
                      <View style={getBoxStyle(colorOk, touched.color)}>
                        <TextInput
                          style={[styles.softInput, { textAlign: textAlignDir }]}
                          placeholder={t("vehicleColorPlaceholder") || "Ex: Noir, Blanc..."}
                          placeholderTextColor="#64748B"
                          value={vehicleColor}
                          onChangeText={setVehicleColor}
                          onBlur={() => markTouched("color")}
                        />
                        {(touched.color || submittedAttempt) && colorOk ? (
                          <Ionicons name="checkmark-circle" size={19} color={COLORS.primary} />
                        ) : (touched.color || submittedAttempt) && !colorOk ? (
                          <Ionicons name="alert-circle" size={19} color={COLORS.danger} />
                        ) : null}
                      </View>
                      {(touched.color || submittedAttempt) && !colorOk && (
                        <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                          {t("errColor") || "Couleur invalide."}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Photo */}
                  <View
                    style={{
                      flexDirection: rowDir,
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 10,
                    }}
                  >
                    <Text style={[styles.label, { textAlign: textAlignDir, marginTop: 0 }]}>
                      {t("proofPhotoLabel") || "Photo du véhicule *"}
                    </Text>
                    {photoOk ? (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    ) : submittedAttempt && !photoOk ? (
                      <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
                    ) : null}
                  </View>

                  <View style={[styles.photoButtonsRow, { flexDirection: rowDir }]}>
                    <TouchableOpacity
                      style={[
                        styles.photoBtn,
                        { flexDirection: rowDir },
                        submittedAttempt && !photoOk && styles.photoBtnError,
                      ]}
                      onPress={() => pickDriverProofPhoto(true)}
                    >
                      <Ionicons
                        name="camera-outline"
                        size={20}
                        color={submittedAttempt && !photoOk ? COLORS.danger : COLORS.primary}
                      />
                      <Text
                        style={[
                          styles.photoBtnText,
                          submittedAttempt && !photoOk && { color: COLORS.danger },
                        ]}
                      >
                        {t("takePhotoBtn") || "Caméra"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.photoBtn,
                        { flexDirection: rowDir },
                        submittedAttempt && !photoOk && styles.photoBtnError,
                      ]}
                      onPress={() => pickDriverProofPhoto(false)}
                    >
                      <Ionicons
                        name="images-outline"
                        size={20}
                        color={submittedAttempt && !photoOk ? COLORS.danger : COLORS.primary}
                      />
                      <Text
                        style={[
                          styles.photoBtnText,
                          submittedAttempt && !photoOk && { color: COLORS.danger },
                        ]}
                      >
                        {t("galleryBtn") || "Galerie"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {submittedAttempt && !photoOk && (
                    <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                      {t("errPhoto") || "La photo du véhicule est obligatoire."}
                    </Text>
                  )}

                  {proofPhotoUri && (
                    <View style={styles.previewBox}>
                      <Image source={{ uri: proofPhotoUri }} style={styles.previewImage} />
                      <Text style={styles.previewSuccess}>
                        {t("photoAddedSuccess") || "Photo ajoutée avec succès"}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* BOUTON PRINCIPAL */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isRegister
                  ? (t("submitRegisterBtn") || "S'INSCRIRE")
                  : (t("submitLoginBtn") || "SE CONNECTER")}
              </Text>
            )}
          </TouchableOpacity>

          {/* SÉPARATEUR & GOOGLE */}
          <View style={styles.orDividerRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>{t("orConnectWith") || "OU SE CONNECTER AVEC"}</Text>
            <View style={styles.orLine} />
          </View>

          <View style={styles.socialCenterRow}>
            <TouchableOpacity
              style={styles.googleCircleBtn}
              activeOpacity={0.8}
              onPress={handleGoogleSignIn}
            >
              <Image
                source={require('../../../assets/g-logo.png')}
                style={styles.googleLogoImg}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>

          {/* LIENS DU BAS */}
          <View style={[styles.bottomLinksRow, { flexDirection: rowDir }]}>
            <TouchableOpacity
              onPress={() => {
                setIsRegister(!isRegister);
                setSubmittedAttempt(false);
              }}
            >
              <Text style={styles.bottomLinkText}>
                {isRegister
                  ? (t("loginTab") || "Déjà un compte ? Se connecter")
                  : `${t("registerTab") || "Créer un compte"} ?`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => Linking.openURL("https://livrili.bouhezila.com").catch(() => {})}
            >
              <Text style={styles.bottomLinkText}>{t("privacyPolicy") || "Confidentialité"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* MODAL LANGUES */}
      <Modal visible={langDropdownVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setLangDropdownVisible(false)}
        >
          <View style={styles.dropdownMenu}>
            {LANGUAGES.map((item) => {
              const selected = lang === item.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.dropdownItem, selected && styles.dropdownItemActive]}
                  onPress={() => {
                    changeLanguage(item.code);
                    setLangDropdownVisible(false);
                  }}
                >
                  <Text style={[styles.dropdownItemText, selected && styles.dropdownItemTextActive]}>
                    {item.label}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL OTP */}
      <Modal visible={otpModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalHeader, { flexDirection: rowDir }]}>
              <Text style={styles.modalTitle}>Vérification 2FA (6 chiffres)</Text>
              <TouchableOpacity onPress={() => setOtpModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.otpSubtitle, { textAlign: textAlignDir }]}>
              {phone} / {email}
            </Text>
            {devOtpHint ? (
              <TouchableOpacity style={styles.devOtpBanner} onPress={() => setOtpCode(devOtpHint)}>
                <Text style={styles.devOtpText}>OTP : {devOtpHint}</Text>
              </TouchableOpacity>
            ) : null}
            <TextInput
              style={styles.otpInput}
              placeholder="••••••"
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
                <Text style={styles.submitBtnText}>{t("validateBtn") || "VALIDER"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 42,
    paddingBottom: 30,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  langDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.2,
    borderColor: "#CBD5E1",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 7,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  langLabelPrefix: { fontSize: 13, color: "#475569", fontWeight: "500" },
  langLabelValue: { fontSize: 13, color: "#0F172A", fontWeight: "800" },
  heroContainer: {
    alignItems: "center",
    marginVertical: 14,
  },
  heroImage: {
    width: 260,
    height: 220,
    marginBottom: 8,
  },
  heroFallback: {
    width: 150,
    height: 130,
    borderRadius: 24,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  formContainer: {
    marginTop: 12,
  },
  softInputBox: {
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
  },
  softInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    fontWeight: "500",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 5,
    marginTop: 12,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
  },
  simVerifyBtn: {
    alignItems: "center",
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
  },
  simVerifyText: {
    marginHorizontal: 6,
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  roleRow: { justifyContent: "space-between", marginBottom: 4 },
  roleChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    marginHorizontal: 4,
    backgroundColor: "#F8FAFC",
  },
  roleChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  roleChipText: {
    marginHorizontal: 6,
    fontSize: 14,
    fontWeight: "800",
    color: "#64748B",
  },
  roleChipTextActive: { color: COLORS.primary },
  driverSection: {
    marginTop: 14,
    padding: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  driverSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primary,
    marginBottom: 6,
  },
  vehicleTypeRow: { justifyContent: "space-between" },
  vehicleTypeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    marginHorizontal: 3,
    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  vehicleTypeBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  vehicleTypeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    marginTop: 2,
  },
  vehicleTypeTextActive: { color: COLORS.primary },
  photoButtonsRow: { justifyContent: "space-between", marginTop: 6 },
  photoBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingVertical: 11,
    borderRadius: 10,
    marginHorizontal: 4,
  },
  photoBtnError: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerLight,
  },
  photoBtnText: {
    marginHorizontal: 6,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  previewBox: { alignItems: "center", marginTop: 10 },
  previewImage: { width: "100%", height: 130, borderRadius: 10 },
  previewSuccess: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.primary,
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
    elevation: 2,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.4,
  },
  bottomLinksRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 26,
    paddingHorizontal: 6,
  },
  bottomLinkText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
    alignItems: "flex-end",
    paddingTop: 82,
    paddingRight: 22,
  },
  dropdownMenu: {
    width: 165,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 6,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  dropdownItemActive: {
    backgroundColor: COLORS.primaryLight,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  dropdownItemTextActive: {
    fontWeight: "800",
    color: COLORS.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
  },
  modalHeader: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  otpSubtitle: { fontSize: 13, color: "#64748B", marginBottom: 12 },
  devOtpBanner: {
    backgroundColor: COLORS.primaryLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  devOtpText: { color: COLORS.primary, fontWeight: "800", fontSize: 14 },
  otpInput: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 12,
    height: 54,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 10,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  orDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#94A3B8',
    maxWidth: 65,
  },
  orText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  socialCenterRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  googleCircleBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  googleLogoImg: {
    width: 30,
    height: 30,
  },
});