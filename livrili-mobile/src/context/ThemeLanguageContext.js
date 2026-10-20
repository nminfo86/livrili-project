// src/context/ThemeLanguageContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

// =========================================================================
// 🎨 CONFIGURATION CENTRALISÉE DU THÈME (Changez ACTIVE_THEME ici !)
// Choix disponibles : 'emerald' | 'royalBlue' | 'orange' | 'indigo'
// =========================================================================
const ACTIVE_THEME = 'emerald';

const THEME_PRESETS = {
  emerald: {
    primary: '#006233',       // Couleur principale (Boutons, Tabs actifs, Headers)
    primaryLight: '#E6F2EC',  // Fond léger des éléments sélectionnés
    secondary: '#D21034',     // Couleur secondaire / Alerte / Pin Destination
    softBlue: '#E8F0F8',      // Boutons secondaires (+ INFOS COLIS)
  },
  royalBlue: {
    primary: '#1976D2',       // Bleu Livrili Classique
    primaryLight: '#E3F2FD',
    secondary: '#E11D48',
    softBlue: '#EFF6FF',
  },
  orange: {
    primary: '#EA580C',       // Orange Express
    primaryLight: '#FFEDD5',
    secondary: '#1E293B',
    softBlue: '#F1F5F9',
  },
  indigo: {
    primary: '#4F46E5',       // Indigo Moderne
    primaryLight: '#EEF2FF',
    secondary: '#EC4899',
    softBlue: '#F3F4F6',
  },
};

const selectedPalette = THEME_PRESETS[ACTIVE_THEME] || THEME_PRESETS.emerald;

export const COLORS = {
  ...selectedPalette,
  background: '#F8FAFC',
  white: '#FFFFFF',
  textDark: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#DC2626',
};

const translations = {
  fr: {
    bookTitle: 'Commander une course',
    pickupPlaceholder: 'Point de départ (GPS ou recherche)...',
    destinationPlaceholder: 'Où allez-vous ? (Rechercher commune, rue...)',
    parcelDescPlaceholder: 'Que livrez-vous ? (Ex: Colis, Clés, Repas...)',
    recipientPhonePlaceholder: 'Téléphone du destinataire (ex: 0550...)',
    bookLater: 'DÉTAILS COLIS',
    bookNow: 'COMMANDER',
    home: 'Accueil',
    myBookings: 'Mes Courses',
    myWallet: 'Portefeuille',
    settings: 'Paramètres',
    available: 'Disponible immédiatement',
    roundTrip: 'Aller-retour',
    payBySender: 'Payé au départ',
    payByRecipient: "Payé à l'arrivée",
    logout: 'Se déconnecter',
    language: "Langue de l'application",
    switchDriver: 'Passer en mode Livreur',
    switchCustomer: 'Passer en mode Client',
    walletBalance: 'Solde et Tarifs Officiels',
  },
  ar: {
    bookTitle: 'اطلب توصيلة',
    pickupPlaceholder: 'نقطة الانطلاق (GPS أو بحث)...',
    destinationPlaceholder: 'إلى أين؟ (ابحث عن بلدية، حي...)',
    parcelDescPlaceholder: 'ماذا تريد توصيله؟',
    recipientPhonePlaceholder: 'هاتف المستلم (مثال: 0550...)',
    bookLater: 'تفاصيل الطرد',
    bookNow: 'اطلب الآن',
    home: 'الرئيسية',
    myBookings: 'طلباتي',
    myWallet: 'المحفظة',
    settings: 'الإعدادات',
    available: 'متوفر فورا',
    roundTrip: 'ذهاب وإياب',
    payBySender: 'الدفع عند الانطلاق',
    payByRecipient: 'الدفع عند الاستلام',
    logout: 'تسجيل الخروج',
    language: 'لغة التطبيق',
    switchDriver: 'التبديل إلى وضع السائق',
    switchCustomer: 'التبديل إلى وضع الزبون',
    walletBalance: 'الرصيد والتسعيرات الرسمية',
  },
  dz: {
    bookTitle: 'كوموندي كورسة',
    pickupPlaceholder: 'منين راك مقلع (GPS)...',
    destinationPlaceholder: 'وين رايح؟ (حوس على حومة، بلدية...)',
    parcelDescPlaceholder: 'واش راك حاب تبعث؟',
    recipientPhonePlaceholder: 'ميرو تاع لي يستقبل (0550...)',
    bookLater: 'معلومات الكولي',
    bookNow: 'كوموندي درك',
    home: 'الرئيسية',
    myBookings: 'الكورسات تاوعي',
    myWallet: 'البورتفاي',
    settings: 'باراميتر',
    available: 'واجد درك',
    roundTrip: 'ألي - روتور',
    payBySender: 'يخلص في الديبار',
    payByRecipient: 'يخلص كي يوصل',
    logout: 'الخروج (Logout)',
    language: 'اللغة',
    switchDriver: 'بدل لمود ليفرور (Livreur)',
    switchCustomer: 'بدل لمود كليون (Client)',
    walletBalance: 'التسعيرات الرسمية',
  },
};

const ThemeLanguageContext = createContext();

export const ThemeLanguageProvider = ({ children }) => {
  const [lang, setLang] = useState('fr');

  useEffect(() => {
    SecureStore.getItemAsync('app_lang')
      .then((saved) => {
        if (saved && translations[saved]) setLang(saved);
      })
      .catch(() => {});
  }, []);

  const changeLanguage = async (newLang) => {
    setLang(newLang);
    try {
      await SecureStore.setItemAsync('app_lang', newLang);
    } catch (e) {}
  };

  const t = (key) => translations[lang]?.[key] || translations['fr'][key] || key;

  return (
    <ThemeLanguageContext.Provider value={{ lang, changeLanguage, t, COLORS }}>
      {children}
    </ThemeLanguageContext.Provider>
  );
};

export const useThemeLang = () => useContext(ThemeLanguageContext);