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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthContext } from "../../context/AuthContext";
import { useThemeLang, COLORS } from "../../context/ThemeLanguageContext";
import apiClient from "../../api/client";

// 👉 Décommentez la ligne ci-dessous dès que vous avez mis votre image dans assets/login-hero.png :
const HERO_IMAGE = require('../../../assets/login-hero.png');
// const HERO_IMAGE = null;

const LANGUAGES = [
  { code: "fr", label: "Français", short: "Français" },
  { code: "ar", label: "العربية", short: "العربية" },
  { code: "dz", label: "الدارجة", short: "الدارجة" },
];

export default function LoginScreen() {
  const { login, googleLogin } = useContext(AuthContext);
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

  // GPS & Commune
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userCoords, setUserCoords] = useState({ lat: 36.1528, lon: 5.6902 });
  const [communeName, setCommuneName] = useState("El Eulma");

  // Champs spécifiques Livreur
  const [transportModes, setTransportModes] = useState([
    {
      id: "moto",
      title_fr: "Moto",
      title_ar: "دراجة نارية",
      icon: "motorbike",
    },
    {
      id: "camionnette",
      title_fr: "Chana / Harbin",
      title_ar: "شاحنة صغيرة",
      icon: "truck-flatbed",
    },
    {
      id: "fourgon",
      title_fr: "Fourgon",
      title_ar: "فورغون",
      icon: "truck-delivery",
    },
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

  // --- VALIDATIONS UNITAIRES ---
  const isValidFullName = (val) => val.trim().length >= 3;
  const isValidAlgerianPhone = (num) => {
    const clean = String(num || "").replace(/\s+/g, "");
    if (
      /^0[567](\d)\1{7}$/.test(clean) ||
      clean === "0512345678" ||
      clean === "0612345678"
    ) {
      return false;
    }
    return /^(05|06|07)[0-9]{8}$/.test(clean);
  };
  const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  const isStrongPassword = (pwd) => {
    const hasLetter = /[a-zA-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^a-zA-Z0-9]/.test(pwd);
    return pwd.length >= 8 && hasLetter && hasNumber && hasSpecial;
  };
  const isValidConfirmPassword = () =>
    confirmPassword.length > 0 && password === confirmPassword;
  const isValidBrand = (val) => val.trim().length >= 2;
  const isValidPlate = (val) => val.trim().length >= 4;
  const isValidColor = (val) => val.trim().length >= 2;
  const isValidPhoto = () => Boolean(proofPhotoBase64);

  const pickDriverProofPhoto = async (fromCamera = false) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== "granted") return;

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            quality: 0.5,
            base64: true,
            allowsEditing: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.5,
            base64: true,
            allowsEditing: true,
          });

      if (!result.canceled && result.assets && result.assets[0]) {
        setProofPhotoUri(result.assets[0].uri);
        setProofPhotoBase64(
          `data:image/jpeg;base64,${result.assets[0].base64}`,
        );
      }
    } catch (e) {}
  };

  const verifySimOwnershipViaWhatsapp = async () => {
    if (!isValidAlgerianPhone(phone)) {
      setSubmittedAttempt(true);
      return;
    }
    setPhoneVerifiedBySim(true);
    const msg = encodeURIComponent(
      `Vérification de mon numéro Livrili DZ : ${phone.trim()}`,
    );
    Linking.openURL(`https://wa.me/213552791323?text=${msg}`).catch(() => {});
  };

  const handleSubmit = async () => {
    setSubmittedAttempt(true);

    if (!isRegister) {
      if (!email.trim() || !password.trim()) {
        return;
      }
      setLoading(true);
      try {
        const res = await apiClient.post("auth.php?action=login", {
          identifier: email.trim(),
          email: email.trim(),
          phone: email.trim(),
          password: password,
        });
        const data = res.data;
        if (data && (data.token || data.auth_token || data.success)) {
          await login(data.token || data.auth_token, data.user);
        } else {
          Alert.alert(
            "Erreur",
            data?.error || data?.message || "Identifiants incorrects.",
          );
        }
      } catch (err) {
        const msg =
          err.response?.data?.error ||
          err.response?.data?.message ||
          "Erreur de connexion.";
        Alert.alert("Attention", msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    const baseValid =
      isValidFullName(fullName) &&
      isValidAlgerianPhone(phone) &&
      isValidEmail(email) &&
      isStrongPassword(password) &&
      isValidConfirmPassword();

    const driverValid =
      role !== "driver" ||
      (isValidBrand(vehicleBrand) &&
        isValidPlate(plateNumber) &&
        isValidColor(vehicleColor) &&
        isValidPhoto());

    if (!baseValid || !driverValid) {
      return;
    }

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
      Alert.alert(
        "Code invalide",
        "Veuillez entrer le code de vérification à 6 chiffres.",
      );
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
        Alert.alert(
          "Erreur OTP",
          data?.error || data?.message || "Code OTP incorrect.",
        );
      }
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        "Code OTP invalide.";
      Alert.alert("Erreur", msg);
    } finally {
      setLoading(false);
    }
  };

  const rowDir = isRTL ? "row-reverse" : "row";
  const textAlignDir = isRTL ? "right" : "left";
  const currentLangObj = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  const getBoxStyle = (isValid) => {
    if (isValid) {
      return [
        styles.softInputBox,
        {
          flexDirection: rowDir,
          borderColor: COLORS.primary,
          borderWidth: 1.5,
        },
      ];
    }
    if (submittedAttempt && !isValid) {
      return [
        styles.softInputBox,
        {
          flexDirection: rowDir,
          borderColor: COLORS.danger,
          backgroundColor: COLORS.dangerLight,
          borderWidth: 1.5,
        },
      ];
    }
    return [styles.softInputBox, { flexDirection: rowDir }];
  };

  const handleGoogleSignIn = async () => {
    // Si vous utilisez expo-auth-session / Google Sign-In, passez le payload ici :
    Alert.alert("Google", "Connexion rapide avec votre compte Google...");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. BOUTON DROPDOWN LANGUE EN HAUT À DROITE (Style Maquette) */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.langDropdownBtn}
            activeOpacity={0.8}
            onPress={() => setLangDropdownVisible(true)}
          >
            <Text style={styles.langLabelPrefix}>Lang: </Text>
            <Text style={styles.langLabelValue}>{currentLangObj.short}</Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color="#0F172A"
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        </View>

        {/* 2. ILLUSTRATION HERO + TITRE */}
        <View style={styles.heroContainer}>
          {HERO_IMAGE ? (
            <Image
              source={HERO_IMAGE}
              style={styles.heroImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.heroFallback}>
              <MaterialCommunityIcons
                name="truck-fast-outline"
                size={96}
                color={COLORS.primary}
              />
            </View>
          )}
          {/* <Text style={styles.brandTitle}>LIVRILI DELIVERY</Text> */}
          {/* <Text style={styles.brandSubtitle}>{t("appSubtitle")}</Text> */}
        </View>

        {/* 3. FORMULAIRE */}
        <View style={styles.formContainer}>
          {!isRegister ? (
            <>
              {/* Indicatifs Pays style maquette */}
              {/* <View
                style={[
                  styles.softInputBox,
                  { flexDirection: rowDir, marginBottom: 14 },
                ]}
              >
                <Text style={[styles.countryText, { textAlign: textAlignDir }]}>
                  🇩🇿 Algérie (+213)
                </Text>
              </View> */}

              {/* Email ou Téléphone */}
              <View style={getBoxStyle(email.trim().length >= 4)}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("emailOrPhoneLabel")}
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                {email.trim().length >= 4 ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                  />
                ) : submittedAttempt ? (
                  <Ionicons
                    name="alert-circle"
                    size={20}
                    color={COLORS.danger}
                  />
                ) : null}
              </View>
              {submittedAttempt && email.trim().length < 4 && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errIdentifier")}
                </Text>
              )}

              {/* Mot de passe */}
              <View
                style={[getBoxStyle(password.length >= 4), { marginTop: 14 }]}
              >
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("passwordLabel")}
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                {password.length >= 4 && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                    style={{ marginHorizontal: 6 }}
                  />
                )}
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
              {submittedAttempt && password.length < 4 && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errLoginPassword")}
                </Text>
              )}
            </>
          ) : (
            /* --- FORMULAIRE D'INSCRIPTION COMPLET --- */
            <>
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("accountType")}
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
                  <Text
                    style={[
                      styles.roleChipText,
                      role === "customer" && styles.roleChipTextActive,
                    ]}
                  >
                    {t("roleCustomer")}
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
                  <MaterialCommunityIcons
                    name="motorbike"
                    size={22}
                    color={role === "driver" ? COLORS.primary : "#64748B"}
                  />
                  <Text
                    style={[
                      styles.roleChipText,
                      role === "driver" && styles.roleChipTextActive,
                    ]}
                  >
                    {t("roleDriver")}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* COMMUNE (Sans texte technique) */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("communeAutoGps")}
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
                    {
                      textAlign: textAlignDir,
                      fontWeight: "800",
                      color: COLORS.primary,
                    },
                  ]}
                >
                  {gpsLoading ? t("detectingGps") : communeName}
                </Text>
                <TouchableOpacity onPress={detectUserCommuneAutomatic}>
                  {gpsLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={COLORS.primary}
                    />
                  )}
                </TouchableOpacity>
              </View>

              {/* NOM COMPLET */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("fullName")}
              </Text>
              <View style={getBoxStyle(isValidFullName(fullName))}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("fullNamePlaceholder")}
                  placeholderTextColor="#64748B"
                  value={fullName}
                  onChangeText={setFullName}
                />
                {isValidFullName(fullName) ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                  />
                ) : submittedAttempt ? (
                  <Ionicons
                    name="alert-circle"
                    size={20}
                    color={COLORS.danger}
                  />
                ) : null}
              </View>
              {submittedAttempt && !isValidFullName(fullName) && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errFullName")}
                </Text>
              )}

              {/* TÉLÉPHONE ALGÉRIEN */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("phoneLabel")}
              </Text>
              <View style={getBoxStyle(isValidAlgerianPhone(phone))}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("phonePlaceholder")}
                  placeholderTextColor="#64748B"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(txt) => setPhone(txt.replace(/[^0-9]/g, ""))}
                />
                {isValidAlgerianPhone(phone) ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                  />
                ) : submittedAttempt ? (
                  <Ionicons
                    name="alert-circle"
                    size={20}
                    color={COLORS.danger}
                  />
                ) : null}
              </View>
              {submittedAttempt && !isValidAlgerianPhone(phone) && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errPhone")}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.simVerifyBtn,
                  {
                    flexDirection: rowDir,
                    alignSelf: isRTL ? "flex-end" : "flex-start",
                  },
                ]}
                onPress={verifySimOwnershipViaWhatsapp}
              >
                <Ionicons
                  name={
                    phoneVerifiedBySim
                      ? "checkmark-done-circle"
                      : "logo-whatsapp"
                  }
                  size={17}
                  color={COLORS.primary}
                />
                <Text style={styles.simVerifyText}>
                  {phoneVerifiedBySim ? t("simVerified") : t("simVerifyBtn")}
                </Text>
              </TouchableOpacity>

              {/* EMAIL */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("emailLabel")}
              </Text>
              <View style={getBoxStyle(isValidEmail(email))}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("emailPlaceholder")}
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                {isValidEmail(email) ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                  />
                ) : submittedAttempt ? (
                  <Ionicons
                    name="alert-circle"
                    size={20}
                    color={COLORS.danger}
                  />
                ) : null}
              </View>
              {submittedAttempt && !isValidEmail(email) && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errEmail")}
                </Text>
              )}

              {/* MOT DE PASSE */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("passwordLabel")}
              </Text>
              <View style={getBoxStyle(isStrongPassword(password))}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("passwordPlaceholder")}
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                {isStrongPassword(password) && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                    style={{ marginHorizontal: 4 }}
                  />
                )}
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
              {submittedAttempt && !isStrongPassword(password) && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errPassword")}
                </Text>
              )}

              {/* CONFIRMATION MOT DE PASSE */}
              <Text style={[styles.label, { textAlign: textAlignDir }]}>
                {t("confirmPasswordLabel")}
              </Text>
              <View style={getBoxStyle(isValidConfirmPassword())}>
                <TextInput
                  style={[styles.softInput, { textAlign: textAlignDir }]}
                  placeholder={t("confirmPasswordPlaceholder")}
                  placeholderTextColor="#64748B"
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                {isValidConfirmPassword() ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={COLORS.primary}
                  />
                ) : submittedAttempt ? (
                  <Ionicons
                    name="alert-circle"
                    size={20}
                    color={COLORS.danger}
                  />
                ) : null}
              </View>
              {submittedAttempt && !isValidConfirmPassword() && (
                <Text style={[styles.errorText, { textAlign: textAlignDir }]}>
                  {t("errConfirmPassword")}
                </Text>
              )}

              {/* SECTION SPÉCIFIQUE LIVREUR */}
              {role === "driver" && (
                <View style={styles.driverSection}>
                  <Text
                    style={[
                      styles.driverSectionTitle,
                      { textAlign: textAlignDir },
                    ]}
                  >
                    {t("driverSectionTitle")}
                  </Text>

                  <Text style={[styles.label, { textAlign: textAlignDir }]}>
                    {t("transportModeLabel")}
                  </Text>
                  <View
                    style={[styles.vehicleTypeRow, { flexDirection: rowDir }]}
                  >
                    {transportModes.map((v) => {
                      const vLabel =
                        isRTL && v.title_ar ? v.title_ar : v.title_fr;
                      return (
                        <TouchableOpacity
                          key={v.id}
                          style={[
                            styles.vehicleTypeBtn,
                            vehicleType === v.id && styles.vehicleTypeBtnActive,
                          ]}
                          onPress={() => setVehicleType(v.id)}
                        >
                          <MaterialCommunityIcons
                            name={v.icon || "motorbike"}
                            size={22}
                            color={
                              vehicleType === v.id ? COLORS.primary : "#64748B"
                            }
                          />
                          <Text
                            style={[
                              styles.vehicleTypeText,
                              vehicleType === v.id &&
                                styles.vehicleTypeTextActive,
                            ]}
                          >
                            {vLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.label, { textAlign: textAlignDir }]}>
                    {t("vehicleBrandLabel")}
                  </Text>
                  <View style={getBoxStyle(isValidBrand(vehicleBrand))}>
                    <TextInput
                      style={[styles.softInput, { textAlign: textAlignDir }]}
                      placeholder={t("vehicleBrandPlaceholder")}
                      placeholderTextColor="#64748B"
                      value={vehicleBrand}
                      onChangeText={setVehicleBrand}
                    />
                    {isValidBrand(vehicleBrand) ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={COLORS.primary}
                      />
                    ) : submittedAttempt ? (
                      <Ionicons
                        name="alert-circle"
                        size={20}
                        color={COLORS.danger}
                      />
                    ) : null}
                  </View>
                  {submittedAttempt && !isValidBrand(vehicleBrand) && (
                    <Text
                      style={[styles.errorText, { textAlign: textAlignDir }]}
                    >
                      {t("errBrand")}
                    </Text>
                  )}

                  <View
                    style={{
                      flexDirection: rowDir,
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1, marginHorizontal: 3 }}>
                      <Text style={[styles.label, { textAlign: textAlignDir }]}>
                        {t("plateNumberLabel")}
                      </Text>
                      <View style={getBoxStyle(isValidPlate(plateNumber))}>
                        <TextInput
                          style={[
                            styles.softInput,
                            { textAlign: textAlignDir },
                          ]}
                          placeholder={t("plateNumberPlaceholder")}
                          placeholderTextColor="#64748B"
                          value={plateNumber}
                          onChangeText={setPlateNumber}
                        />
                        {isValidPlate(plateNumber) ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={19}
                            color={COLORS.primary}
                          />
                        ) : submittedAttempt ? (
                          <Ionicons
                            name="alert-circle"
                            size={19}
                            color={COLORS.danger}
                          />
                        ) : null}
                      </View>
                      {submittedAttempt && !isValidPlate(plateNumber) && (
                        <Text
                          style={[
                            styles.errorText,
                            { textAlign: textAlignDir },
                          ]}
                        >
                          {t("errPlate")}
                        </Text>
                      )}
                    </View>

                    <View style={{ flex: 1, marginHorizontal: 3 }}>
                      <Text style={[styles.label, { textAlign: textAlignDir }]}>
                        {t("vehicleColorLabel")}
                      </Text>
                      <View style={getBoxStyle(isValidColor(vehicleColor))}>
                        <TextInput
                          style={[
                            styles.softInput,
                            { textAlign: textAlignDir },
                          ]}
                          placeholder={t("vehicleColorPlaceholder")}
                          placeholderTextColor="#64748B"
                          value={vehicleColor}
                          onChangeText={setVehicleColor}
                        />
                        {isValidColor(vehicleColor) ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={19}
                            color={COLORS.primary}
                          />
                        ) : submittedAttempt ? (
                          <Ionicons
                            name="alert-circle"
                            size={19}
                            color={COLORS.danger}
                          />
                        ) : null}
                      </View>
                      {submittedAttempt && !isValidColor(vehicleColor) && (
                        <Text
                          style={[
                            styles.errorText,
                            { textAlign: textAlignDir },
                          ]}
                        >
                          {t("errColor")}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection: rowDir,
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 10,
                    }}
                  >
                    <Text
                      style={[
                        styles.label,
                        { textAlign: textAlignDir, marginTop: 0 },
                      ]}
                    >
                      {t("proofPhotoLabel")}
                    </Text>
                    {isValidPhoto() ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={COLORS.primary}
                      />
                    ) : submittedAttempt ? (
                      <Ionicons
                        name="alert-circle"
                        size={20}
                        color={COLORS.danger}
                      />
                    ) : null}
                  </View>

                  <View
                    style={[styles.photoButtonsRow, { flexDirection: rowDir }]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.photoBtn,
                        { flexDirection: rowDir },
                        submittedAttempt &&
                          !isValidPhoto() &&
                          styles.photoBtnError,
                      ]}
                      onPress={() => pickDriverProofPhoto(true)}
                    >
                      <Ionicons
                        name="camera-outline"
                        size={20}
                        color={
                          submittedAttempt && !isValidPhoto()
                            ? COLORS.danger
                            : COLORS.primary
                        }
                      />
                      <Text
                        style={[
                          styles.photoBtnText,
                          submittedAttempt &&
                            !isValidPhoto() && { color: COLORS.danger },
                        ]}
                      >
                        {t("takePhotoBtn")}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.photoBtn,
                        { flexDirection: rowDir },
                        submittedAttempt &&
                          !isValidPhoto() &&
                          styles.photoBtnError,
                      ]}
                      onPress={() => pickDriverProofPhoto(false)}
                    >
                      <Ionicons
                        name="images-outline"
                        size={20}
                        color={
                          submittedAttempt && !isValidPhoto()
                            ? COLORS.danger
                            : COLORS.primary
                        }
                      />
                      <Text
                        style={[
                          styles.photoBtnText,
                          submittedAttempt &&
                            !isValidPhoto() && { color: COLORS.danger },
                        ]}
                      >
                        {t("galleryBtn")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {submittedAttempt && !isValidPhoto() && (
                    <Text
                      style={[styles.errorText, { textAlign: textAlignDir }]}
                    >
                      {t("errPhoto")}
                    </Text>
                  )}

                  {proofPhotoUri && (
                    <View style={styles.previewBox}>
                      <Image
                        source={{ uri: proofPhotoUri }}
                        style={styles.previewImage}
                      />
                      <Text style={styles.previewSuccess}>
                        {t("photoAddedSuccess")}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* BOUTON PRINCIPAL */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {isRegister ? t("submitRegisterBtn") : t("submitLoginBtn")}
              </Text>
            )}
          </TouchableOpacity>

          {/* SÉPARATEUR "OU SE CONNECTER AVEC" + LOGO GOOGLE CENTRÉ UNIQUEMENT */}
          <View style={styles.orDividerRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>{t("orConnectWith")}</Text>
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

          {/* LIENS EN BAS (Register User? | Privacy Policy) */}
          <View style={[styles.bottomLinksRow, { flexDirection: rowDir }]}>
            <TouchableOpacity
              onPress={() => {
                setIsRegister(!isRegister);
                setSubmittedAttempt(false);
              }}
            >
              <Text style={styles.bottomLinkText}>
                {isRegister ? t("loginTab") : `${t("registerTab")} ?`}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                Linking.openURL("https://livrili.bouhezila.com").catch(() => {})
              }
            >
              <Text style={styles.bottomLinkText}>{t("privacyPolicy")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* MODAL DROPDOWN SÉLECTEUR DE LANGUE */}
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
                  style={[
                    styles.dropdownItem,
                    selected && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    changeLanguage(item.code);
                    setLangDropdownVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      selected && styles.dropdownItemTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {selected && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={COLORS.primary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* MODAL OTP INSCRIPTION */}
      <Modal visible={otpModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalHeader, { flexDirection: rowDir }]}>
              <Text style={styles.modalTitle}>
                Vérification 2FA (6 chiffres)
              </Text>
              <TouchableOpacity onPress={() => setOtpModalVisible(false)}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>
            <Text style={[styles.otpSubtitle, { textAlign: textAlignDir }]}>
              {phone} / {email}
            </Text>
            {devOtpHint ? (
              <TouchableOpacity
                style={styles.devOtpBanner}
                onPress={() => setOtpCode(devOtpHint)}
              >
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
                <Text style={styles.submitBtnText}>{t("validateBtn")}</Text>
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
  brandTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 1.2,
    textAlign: "center",
  },
  brandSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
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
  countryText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
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
