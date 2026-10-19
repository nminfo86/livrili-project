import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

export const COLORS = {
  primary: '#006233',       // Vert Émeraude Algérien
  primaryLight: '#E6F2EC',  // Vert très clair (sélection)
  secondary: '#D21034',     // Rouge Algérien (Marqueur destination / Badges)
  background: '#F8FAFC',
  white: '#FFFFFF',
  textDark: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  softBlue: '#E8F0F8',      // Bouton secondaire style maquette
  success: '#10B981',
  warning: '#F59E0B',
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
    motoTitle: 'MOTO EXPRESS',
    motoDesc: '200 DA min • 50 DA/km • Max 15 Kg',
    voitureTitle: 'VOITURE',
    voitureDesc: '350 DA min • 70 DA/km • Max 50 Kg',
    camionnetteTitle: 'CAMIONNETTE (DFSK/Harbin)',
    camionnetteDesc: '600 DA min • 100 DA/km • Max 500 Kg',
    fourgonTitle: 'FOURGON',
    fourgonDesc: '900 DA min • 150 DA/km • Gros volume',
    available: 'Disponible immédiatement',
    roundTrip: 'Aller-retour',
    payBySender: 'Payé au départ',
    payByRecipient: 'Payé à l\'arrivée',
    logout: 'Se déconnecter',
    language: 'Langue de l\'application',
    switchDriver: 'Passer en mode Livreur',
    switchCustomer: 'Passer en mode Client',
    walletBalance: 'Solde et Tarifs Officiels',
  },
  ar: {
    bookTitle: 'اطلب توصيلة',
    pickupPlaceholder: 'نقطة الانطلاق (GPS أو بحث)...',
    destinationPlaceholder: 'إلى أين؟ (ابحث عن بلدية أو حي...)',
    parcelDescPlaceholder: 'ماذا تريد أن ترسل؟ (طرد، وثائق...)',
    recipientPhonePlaceholder: 'هاتف المستلم',
    bookLater: 'تفاصيل الطرد',
    bookNow: 'اطلب الآن',
    home: 'الرئيسية',
    myBookings: 'طلباتي',
    myWallet: 'المحفظة',
    settings: 'الإعدادات',
    motoTitle: 'دراجة نارية سريعة',
    motoDesc: '200 دج أدنى • 50 دج/كم • أقل من 15 كغ',
    voitureTitle: 'سيارة سياحية',
    voitureDesc: '350 دج أدنى • 70 دج/كم • أقل من 50 كغ',
    camionnetteTitle: 'شاحنة صغيرة (هاربين / DFSK)',
    camionnetteDesc: '600 دج أدنى • 100 دج/كم • حمولة متوسطة',
    fourgonTitle: 'شاحنة كبيرة (فورغون)',
    fourgonDesc: '900 دج أدنى • 150 دج/كم • حمولة كبيرة',
    available: 'متوفر الآن',
    roundTrip: 'ذهاب وإياب',
    payBySender: 'الدفع عند الانطلاق',
    payByRecipient: 'الدفع عند الاستلام',
    logout: 'تسجيل الخروج',
    language: 'لغة التطبيق',
    switchDriver: 'التبديل إلى حساب سائق',
    switchCustomer: 'التبديل إلى حساب زبون',
    walletBalance: 'الرصيد والتسعيرات',
  },
  dz: {
    bookTitle: 'كوموندي كورسة',
    pickupPlaceholder: 'منين يديها؟ (بلاصتك ولا حوس)...',
    destinationPlaceholder: 'وين يديها؟ (حوس على البلاصة...)',
    parcelDescPlaceholder: 'واش راك حاب تبعث؟ (كولي، مفاتح، قضيان...)',
    recipientPhonePlaceholder: 'نيميرو تاع لي يستقبل',
    bookLater: 'معلومات الكولي',
    bookNow: 'كوموندي دوك',
    home: 'الرئيسية',
    myBookings: 'الكورسات تاوعي',
    myWallet: 'البورتفاي',
    settings: 'باراميتر',
    motoTitle: 'موطو خفيف ظريف',
    motoDesc: 'من 200 دج • 50 دج/كم • قل من 15 كيلو',
    voitureTitle: 'طوموبيل',
    voitureDesc: 'من 350 دج • 70 دج/كم • حتى 50 كيلو',
    camionnetteTitle: 'هاربين / كاميونات',
    camionnetteDesc: 'من 600 دج • 100 دج/كم • سلعة كبيرة',
    fourgonTitle: 'فورغون',
    fourgonDesc: 'من 900 دج • 150 دج/كم • رحيل و سلعة ثقيلة',
    available: 'واجد دوكا',
    roundTrip: 'ألي - روتور',
    payBySender: 'خالص في الديبار',
    payByRecipient: 'يخلص كي يوصل',
    logout: 'خرج من الكونت (Logout)',
    language: 'بدل اللغة',
    switchDriver: 'ولي ليفرور (Livreur)',
    switchCustomer: 'ولي كليون (Client)',
    walletBalance: 'السولد و السومات',
  }
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