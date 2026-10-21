// src/screens/customer/SettingsScreen.js
import React, { useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons, Fontisto, MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { useThemeLang, COLORS, FONTS, SHADOWS } from '../../context/ThemeLanguageContext';

export default function SettingsScreen({ navigation }) {
  const { user, logout, switchMode } = useContext(AuthContext);
  const { lang, isRTL, changeLanguage, t } = useThemeLang();

  const isRegisteredDriver =
    user?.role === 'driver' || user?.role === 'admin' || user?.is_driver === true;

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlignDir = isRTL ? 'right' : 'left';

  const handleDriverAction = () => {
    if (user?.current_mode === 'driver') {
      switchMode('customer');
      return;
    }
    if (isRegisteredDriver) {
      switchMode('driver');
      return;
    }
    // Redirige vers l'écran dédié d'inscription livreur au lieu d'alourdir SettingsScreen
    navigation.navigate('DriverRegister');
  };

  const handleLogout = () => {
    Alert.alert(t('logout'), t('logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('logout'), style: 'destructive', onPress: () => logout && logout() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      {/* CARTE PROFIL */}
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

      {/* LANGUE */}
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

      {/* BASCULER MODE CLIENT / LIVREUR */}
      <TouchableOpacity
        style={[styles.menuItem, { flexDirection: rowDir }]}
        onPress={handleDriverAction}
      >
        {isRegisteredDriver ? (
          <MaterialCommunityIcons name="swap-horizontal" size={24} color={COLORS.primary} />
        ) : (
          <Fontisto name="motorcycle" size={22} color={COLORS.primary} />
        )}
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

      {/* DÉCONNEXION */}
      <TouchableOpacity
        style={[styles.logoutBtn, { flexDirection: rowDir }]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={22} color="#FFFFFF" />
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: 30 },
  profileCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.white,
  },
  userName: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textDark,
  },
  userPhone: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  roleText: {
    fontFamily: FONTS.bold,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  langRow: {
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  langBtn: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  langBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  langText: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  langTextActive: {
    color: COLORS.primary,
    fontWeight: '900',
  },
  menuItem: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  menuItemText: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textDark,
    marginHorizontal: 12,
  },
  logoutBtn: {
    backgroundColor: COLORS.danger,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    ...SHADOWS.card,
  },
  logoutText: {
    fontFamily: FONTS.bold,
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
    marginHorizontal: 8,
    letterSpacing: 0.6,
  },
});