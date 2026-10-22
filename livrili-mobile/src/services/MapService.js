// src/services/MapService.js
import { GOOGLE_MAPS_API_KEY } from '../config/mapsConfig';

/**
 * 1. Test de santé Google Maps API
 * Vérifie si la clé est valide et la facturation active
 */
export async function testGoogleMapsAccess() {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'VOTRE_CLE_GOOGLE_MAPS_ICI') {
    console.warn('[MapService] Clé Google Maps absente.');
    return false;
  }
  try {
    const testUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=36.1528,5.6902&key=${GOOGLE_MAPS_API_KEY}&language=fr`;
    const res = await fetch(testUrl);
    const data = await res.json();

    if (data.status === 'OK') {
      console.log('✅ [MAPS DEBUG] Google Maps API est 100% VALIDE et ACTIF !');
      return true;
    }
    console.warn('⚠️ [MAPS DEBUG] Google refusé (' + data.status + ') -> Mode Fallback OSM.');
    return false;
  } catch (error) {
    console.warn('[MapService] Erreur réseau test Google Maps -> Mode Fallback OSM.');
    return false;
  }
}

/**
 * 2. Géocodage inverse : Coordonnées GPS -> Adresse texte & Commune
 */
export async function reverseGeocodeCoords(lat, lon, isGoogleActive) {
  if (isGoogleActive) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_MAPS_API_KEY}&language=fr`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.results?.length > 0) {
        // Choisir le résultat le plus précis (éviter le Plus Code brut type "5M3R+43" si une rue existe)
        const bestResult =
          data.results.find((r) => !r.types.includes('plus_code')) || data.results[0];

        let commune = 'El Eulma';
        for (const comp of bestResult.address_components || []) {
          if (
            comp.types.includes('locality') ||
            comp.types.includes('administrative_area_level_2') ||
            comp.types.includes('sublocality')
          ) {
            // Nettoyer d'éventuels mélanges arabe/latin renvoyés par Google
            commune = comp.long_name.replace(/[\u0600-\u06FF]/g, '').trim() || comp.long_name;
            break;
          }
        }

        return {
          address: bestResult.formatted_address.split(',').slice(0, 3).join(', '),
          commune: commune.trim() || 'El Eulma',
        };
      }
    } catch (e) {
      console.warn('[MapService] Échec Google Reverse Geocode');
    }
  }

  // Fallback OpenStreetMap / Nominatim UNIQUEMENT si Google Maps est inactif
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=fr`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 LivriliAlgeria/1.0' },
    });
    const data = await res.json();
    if (data && data.display_name) {
      const shortName = data.display_name.split(',').slice(0, 3).join(', ');
      const com =
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        data.address?.municipality ||
        'El Eulma';
      return { address: shortName, commune: com.trim() };
    }
  } catch (err) {}

  return { address: 'Position sélectionnée', commune: 'El Eulma' };
}

/**
 * 3. Recherche d'adresses en Algérie
 * Si isGoogleActive === true : utilise UNIQUEMENT Google (Places API New v1 -> Legacy -> Geocoding)
 * Ne touche JAMAIS à localLocations (algeriaLocations.json) quand Google est actif.
 */
export async function searchAddressSuggestions(
  query,
  isGoogleActive,
  localLocations = [],
  defaultCommune = 'El Eulma',
  biasCoords = { lat: 36.1528, lon: 5.6902 }
) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return [];

  // =========================================================================
  // MODE 1 : GOOGLE MAPS ACTIF (Zéro utilisation de algeriaLocations.json)
  // =========================================================================
  if (isGoogleActive) {
    // 1A. Essai avec la nouvelle "Places API (New)" v1 (activée sur les nouveaux comptes GCC)
    try {
      const v1Response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        },
        body: JSON.stringify({
          input: cleanQuery,
          includedRegionCodes: ['dz'],
          languageCode: 'fr',
          locationBias: {
            circle: {
              center: {
                latitude: Number(biasCoords?.lat || 36.1528),
                longitude: Number(biasCoords?.lon || 5.6902),
              },
              radius: 25000.0, // Priorise un rayon de 25 km autour du client
            },
          },
        }),
      });

      const v1Data = await v1Response.json();
      if (Array.isArray(v1Data.suggestions) && v1Data.suggestions.length > 0) {
        return v1Data.suggestions
          .filter((s) => s.placePrediction)
          .map((s) => ({
            place_id: s.placePrediction.placeId,
            display_name: s.placePrediction.text?.text || '',
            isGoogle: true,
          }));
      }
    } catch (errV1) {
      console.log('[MapService] Places v1 non disponible, test Places Legacy...');
    }

    // 1B. Essai avec Places API (Legacy) avec biais de proximité
    try {
      const lat = biasCoords?.lat || 36.1528;
      const lon = biasCoords?.lon || 5.6902;
      const legacyUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        cleanQuery
      )}&components=country:dz&location=${lat},${lon}&radius=25000&language=fr&key=${GOOGLE_MAPS_API_KEY}`;

      const res = await fetch(legacyUrl);
      const data = await res.json();

      if (data.status === 'OK' && Array.isArray(data.predictions)) {
        return data.predictions.map((p) => ({
          place_id: p.place_id,
          display_name: p.description,
          isGoogle: true,
        }));
      }
    } catch (errLegacy) {}

    // 1C. Secours 100% Google : Geocoding API (qui est déjà validée et active sur votre clé)
    try {
      const searchWithContext =
        cleanQuery.toLowerCase().includes(defaultCommune.toLowerCase())
          ? cleanQuery
          : `${cleanQuery}, ${defaultCommune}`;

      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        searchWithContext
      )}&components=country:dz&language=fr&key=${GOOGLE_MAPS_API_KEY}`;

      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();

      if (geoData.status === 'OK' && Array.isArray(geoData.results)) {
        return geoData.results.slice(0, 6).map((item) => ({
          place_id: item.place_id,
          display_name: item.formatted_address,
          lat: item.geometry.location.lat,
          lon: item.geometry.location.lng,
          isGoogle: true,
        }));
      }
    } catch (errGeo) {}

    // Si Google est actif mais ne trouve rien, on renvoie un tableau vide (SANS lire le JSON local)
    return [];
  }

  // =========================================================================
  // MODE 2 : FALLBACK OPENSTREETMAP (Uniquement si Google Maps est HS / Non payé)
  // =========================================================================
  const lower = cleanQuery.toLowerCase();
  const matchedLocal = (localLocations || [])
    .filter(
      (loc) =>
        loc.name_fr?.toLowerCase().includes(lower) ||
        loc.name_ar?.includes(lower) ||
        loc.commune?.toLowerCase().includes(lower)
    )
    .map((loc) => ({
      place_id: String(loc.id),
      display_name: `${loc.name_fr} - ${loc.name_ar}`,
      lat: parseFloat(loc.lat),
      lon: parseFloat(loc.lon),
      commune: loc.commune,
      isGoogle: false,
    }));

  if (cleanQuery.length < 3) {
    return matchedLocal;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=dz&addressdetails=1&accept-language=fr&limit=5&q=${encodeURIComponent(
      cleanQuery + ' Algeria'
    )}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 LivriliAlgeria/1.0' },
    });
    const osmData = await res.json();
    if (Array.isArray(osmData)) {
      const formattedOsm = osmData.map((item) => ({
        place_id: String(item.place_id),
        display_name: item.display_name.split(',').slice(0, 3).join(', '),
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        commune: item.address?.city || item.address?.town || defaultCommune,
        isGoogle: false,
      }));
      return [...matchedLocal, ...formattedOsm];
    }
  } catch (err) {}

  return matchedLocal;
}

/**
 * 4. Récupération des coordonnées d'un lieu Google sélectionné
 * Compatible Places API (New) v1 + Places Legacy + Geocoding API
 */
export async function getGooglePlaceCoordinates(placeId, addressText = '') {
  try {
    // 1. Essai via Places API (New) v1
    if (placeId) {
      try {
        const v1Url = `https://places.googleapis.com/v1/places/${placeId}?fields=location,formattedAddress,addressComponents&languageCode=fr&key=${GOOGLE_MAPS_API_KEY}`;
        const v1Res = await fetch(v1Url);
        const v1Data = await v1Res.json();

        if (v1Data && v1Data.location) {
          let commune = 'El Eulma';
          for (const comp of v1Data.addressComponents || []) {
            if (
              comp.types?.includes('locality') ||
              comp.types?.includes('administrative_area_level_2') ||
              comp.types?.includes('sublocality')
            ) {
              commune = (comp.longText || '').replace(/[\u0600-\u06FF]/g, '').trim() || comp.longText;
              break;
            }
          }
          return {
            lat: v1Data.location.latitude,
            lon: v1Data.location.longitude,
            display_name: v1Data.formattedAddress || addressText,
            commune: commune.trim() || 'El Eulma',
          };
        }
      } catch (e) {}
    }

    // 2. Essai via Geocoding API avec place_id (100% supporté par votre clé actuelle)
    if (placeId) {
      const geoIdUrl = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${placeId}&language=fr&key=${GOOGLE_MAPS_API_KEY}`;
      const geoIdRes = await fetch(geoIdUrl);
      const geoIdData = await geoIdRes.json();

      if (geoIdData.status === 'OK' && geoIdData.results?.length > 0) {
        const first = geoIdData.results[0];
        let commune = 'El Eulma';
        for (const comp of first.address_components || []) {
          if (
            comp.types.includes('locality') ||
            comp.types.includes('administrative_area_level_2') ||
            comp.types.includes('sublocality')
          ) {
            commune = comp.long_name.replace(/[\u0600-\u06FF]/g, '').trim() || comp.long_name;
            break;
          }
        }
        return {
          lat: first.geometry.location.lat,
          lon: first.geometry.location.lng,
          display_name: addressText || first.formatted_address,
          commune: commune.trim() || 'El Eulma',
        };
      }
    }

    // 3. Essai via Geocoding API par texte d'adresse
    if (addressText) {
      const geoTextUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        addressText
      )}&components=country:dz&language=fr&key=${GOOGLE_MAPS_API_KEY}`;
      const geoTextRes = await fetch(geoTextUrl);
      const geoTextData = await geoTextRes.json();

      if (geoTextData.status === 'OK' && geoTextData.results?.length > 0) {
        const first = geoTextData.results[0];
        return {
          lat: first.geometry.location.lat,
          lon: first.geometry.location.lng,
          display_name: addressText || first.formatted_address,
          commune: 'El Eulma',
        };
      }
    }
  } catch (err) {
    console.error('[MapService] Erreur getGooglePlaceCoordinates:', err);
  }
  return null;
}

/**
 * 5. Détection directe de la commune depuis des coordonnées GPS (ex: DriverRegisterScreen)
 */
export async function getCommuneFromCoords(lat, lon) {
  const isGoogleActive = await testGoogleMapsAccess();
  const result = await reverseGeocodeCoords(lat, lon, isGoogleActive);
  return result.commune || 'El Eulma';
}