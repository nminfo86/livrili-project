// src/utils/validators.js

// 1. Email strict : exige format standard (ex: nassim@domaine.dz)
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// 2. Téléphone mobile algérien strict : 05, 06 ou 07 suivi de 8 chiffres (10 chiffres au total)
export const DZ_PHONE_REGEX = /^(05|06|07)[0-9]{8}$/;

// 3. Nom complet : Lettres latines ou arabes, espaces, tirets (min 3 caractères, pas de chiffres)
export const FULLNAME_REGEX = /^[a-zA-ZÀ-ÿ\u0600-\u06FF\s'-]{3,60}$/;

// 4. Commune : Lettres latines/arabes, tirets, espaces (min 3 caractères)
export const COMMUNE_REGEX = /^[a-zA-ZÀ-ÿ\u0600-\u06FF0-9\s'-]{3,60}$/;

// 5. Marque / Modèle du véhicule (ex: SYM Symphony, Suzuki, DFSK, Chana...) : min 2 caractères alphanumériques
export const BRAND_REGEX = /^[a-zA-ZÀ-ÿ\u0600-\u06FF0-9\s.'/-]{2,50}$/;

// 6. Couleur du véhicule (ex: Noir, Blanc, Gris, أحمر...) : uniquement des lettres, min 3 caractères
export const COLOR_REGEX = /^[a-zA-ZÀ-ÿ\u0600-\u06FF\s/-]{3,30}$/;

// 7. Matricule Algérien (ex: 12345-125-19 ou 12345 125 19 ou similaire contenant au moins 5 chiffres)
export const PLATE_REGEX = /^[0-9A-Za-z\s-]{5,20}$/;

// --- FONCTIONS DE VALIDATION ---

export const isValidEmail = (val = '') => {
  const clean = String(val || '').trim();
  return EMAIL_REGEX.test(clean);
};

export const isValidDzPhone = (val = '') => {
  const clean = String(val || '').replace(/\s+/g, '');
  return DZ_PHONE_REGEX.test(clean);
};

// Identifiant Login : Valide UNIQUEMENT si c'est un vrai Email complet OU un vrai numéro DZ à 10 chiffres
export const isValidLoginIdentifier = (val = '') => {
  const clean = String(val || '').trim();
  const cleanNoSpaces = clean.replace(/\s+/g, '');
  if (/^[0-9+]+$/.test(cleanNoSpaces)) {
    return DZ_PHONE_REGEX.test(cleanNoSpaces);
  }
  return EMAIL_REGEX.test(clean);
};

export const isValidPassword = (val = '') => {
  const str = String(val || '');
  return str.length >= 6;
};

export const isValidFullName = (val = '') => {
  const clean = String(val || '').trim();
  return FULLNAME_REGEX.test(clean) && !/\d/.test(clean);
};

export const isValidCommune = (val = '') => {
  const clean = String(val || '').trim();
  return COMMUNE_REGEX.test(clean);
};

export const isValidBrand = (val = '') => {
  const clean = String(val || '').trim();
  return BRAND_REGEX.test(clean) && /[a-zA-ZÀ-ÿ\u0600-\u06FF]/.test(clean);
};

export const isValidColor = (val = '') => {
  const clean = String(val || '').trim();
  return COLOR_REGEX.test(clean) && !/\d/.test(clean);
};

export const isValidPlate = (val = '') => {
  const clean = String(val || '').trim();
  const digitsCount = (clean.match(/\d/g) || []).length;
  return PLATE_REGEX.test(clean) && digitsCount >= 4;
};

export const isValidPhoto = (photoUriOrBase64) => {
  return Boolean(photoUriOrBase64 && String(photoUriOrBase64).trim().length > 10);
};

export const isValidOtp = (val = '') => {
  return /^[0-9]{4,6}$/.test(String(val || '').trim());
};