// src/screens/auth/LoginScreen.js
import React, { useState, useContext } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import API from '../../api/client';

export default function LoginScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer'); // customer ou driver[cite: 12]
  const [loading, setLoading] = useState(false);

  const { completeLogin } = useContext(AuthContext);

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Champs requis', 'Veuillez saisir votre email et votre mot de passe.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? 'auth.php?action=register_email' : 'auth.php?action=login_email';
      const payload = isRegister ? { full_name: fullName, email, password, role } : { email, password };

      const res = await API.post(endpoint, payload);
      if (res.data.success) {
        await completeLogin(res.data.token, res.data.user);
      } else {
        Alert.alert('Erreur', res.data.error || 'Identifiants incorrects.');
      }
    } catch (e) {
      Alert.alert('Erreur réseau', 'Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLoginMock = async () => {
    // Connexion Google rapide (prête à être branchée sur votre Client ID Google Cloud)
    setLoading(true);
    try {
      const mockGoogleUser = {
        google_id: 'goog_' + Date.now(),
        email: email || 'utilisateur.google@gmail.com',
        full_name: fullName || 'Client Livrili',
      };
      const res = await API.post('auth.php?action=login_google', mockGoogleUser);
      if (res.data.success) {
        await completeLogin(res.data.token, res.data.user);
      }
    } catch (e) {
      Alert.alert('Erreur Google', 'Échec de connexion Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* En-tête illustré */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="cube" size={48} color="#FF6B4A" />
          </View>
          <Text style={styles.brandTitle}>LIVRILI EXPRESS</Text>
          <Text style={styles.brandSubtitle}>Livraison express & courses en Algérie</Text>
        </View>

        {/* Carte de formulaire[cite: 11, 12] */}
        <View style={styles.card}>
          {isRegister && (
            <View style={styles.rolePicker}>
              <TouchableOpacity
                style={[styles.roleBtn, role === 'customer' && styles.roleBtnActive]}
                onPress={() => setRole('customer')}
              >
                <Text style={[styles.roleText, role === 'customer' && styles.roleTextActive]}>Client</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleBtn, role === 'driver' && styles.roleBtnActive]}
                onPress={() => setRole('driver')}
              >
                <Text style={[styles.roleText, role === 'driver' && styles.roleTextActive]}>Livreur</Text>
              </TouchableOpacity>
            </View>
          )}

          {isRegister && (
            <View style={styles.inputBox}>
              <Ionicons name="person-outline" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nom complet"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
          )}

          <View style={styles.inputBox}>
            <Ionicons name="mail-outline" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Adresse Email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputBox}>
            <Ionicons name="lock-closed-outline" size={20} color="#888" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Mot de passe"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity style={styles.mainBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.mainBtnText}>{isRegister ? "S'inscrire" : 'Se connecter'}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerBox}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OU CONTINUER AVEC</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Bouton Google[cite: 11] */}
          <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleLoginMock}>
            <Ionicons name="logo-google" size={20} color="#DB4437" />
            <Text style={styles.googleBtnText}>Continuer avec Google</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={styles.toggleBtn}>
            <Text style={styles.toggleText}>
              {isRegister ? 'Vous avez déjà un compte ? ' : "Nouveau sur Livrili ? "}
              <Text style={styles.toggleHighlight}>{isRegister ? 'Se connecter' : 'Créer un compte'}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  scroll: { padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginTop: 30, marginBottom: 25 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF0EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandTitle: { fontSize: 26, fontWeight: '900', color: '#1E293B', letterSpacing: 0.5 },
  brandSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 22, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  rolePicker: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4, marginBottom: 16 },
  roleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  roleBtnActive: { backgroundColor: '#FF6B4A' },
  roleText: { fontWeight: '600', color: '#64748B', fontSize: 13 },
  roleTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
    height: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#1E293B' },
  mainBtn: {
    backgroundColor: '#FF6B4A',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    elevation: 2,
  },
  mainBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  dividerBox: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { marginHorizontal: 10, fontSize: 11, color: '#94A3B8', fontWeight: 'bold' },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    height: 50,
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  googleBtnText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  toggleBtn: { marginTop: 22, alignItems: 'center' },
  toggleText: { fontSize: 13, color: '#64748B' },
  toggleHighlight: { color: '#FF6B4A', fontWeight: 'bold' },
});