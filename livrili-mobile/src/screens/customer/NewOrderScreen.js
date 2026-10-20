// src/screens/customer/NewOrderScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  Switch,
  Platform,
  Keyboard,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemeLang, COLORS } from '../../context/ThemeLanguageContext';
import apiClient from '../../api/client';
import localLocations from '../../data/algeriaLocations.json';

const DEFAULT_VEHICLES = [
  {
    id: 'moto',
    icon: 'motorbike',
    title_fr: 'Moto',
    pricing_mode: 'per_km',
    base_price: 200,
    base_km: 2,
    commune_max_km: 5,
    per_km: 50,
    round_trip_multiplier: 1.6,
    color: COLORS.primary,
  },
  {
    id: 'camionnette',
    icon: 'truck-flatbed',
    title_fr: 'Harbin / Chana',
    pricing_mode: 'flat_commune',
    base_price: 600,
    base_km: 2,
    commune_max_km: 5,
    per_km: 100,
    round_trip_multiplier: 1.5,
    color: '#D97706',
  },
  {
    id: 'fourgon',
    icon: 'truck-delivery',
    title_fr: 'Fourgon',
    pricing_mode: 'flat_commune',
    base_price: 900,
    base_km: 2,
    commune_max_km: 5,
    per_km: 150,
    round_trip_multiplier: 1.5,
    color: '#4F46E5',
  },
];

const PARCEL_TYPES = [
  { id: 'Colis / Carton', label: 'Colis', icon: 'cube-outline' },
  { id: 'Documents / Clés', label: 'Documents/Clés', icon: 'document-text-outline' },
  { id: 'Repas / Courses', label: 'Repas/Courses', icon: 'fast-food-outline' },
  { id: 'Pièces / Matériel', label: 'Pièces/Outils', icon: 'construct-outline' },
  { id: 'Meuble / Électroménager', label: 'Encombrant', icon: 'tv-outline' },
];

export default function NewOrderScreen({ navigation }) {
  const { t, lang, isRTL } = useThemeLang();
  const webViewRef = useRef(null);

  const [vehicles, setVehicles] = useState(DEFAULT_VEHICLES);
  const [pickupCoords, setPickupCoords] = useState({ lat: 36.1528, lon: 5.6902 });
  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [pickupCommune, setPickupCommune] = useState('El Eulma');
  const [deliveryCommune, setDeliveryCommune] = useState('El Eulma');

  const [pickupText, setPickupText] = useState('El Eulma, Centre');
  const [destinationText, setDestinationText] = useState('');
  const [activeInput, setActiveInput] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [searchingAddress, setSearchingAddress] = useState(false);

  const [selectedVehicle, setSelectedVehicle] = useState('moto');
  const [selectedParcelType, setSelectedParcelType] = useState('Colis / Carton');
  const [distanceKm, setDistanceKm] = useState(2.0);

  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [parcelDescription, setParcelDescription] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [paymentBy, setPaymentBy] = useState('sender');
  const [submitting, setSubmitting] = useState(false);

  const [parcelInfoAlert, setParcelInfoAlert] = useState(false);
  const [phoneErrorText, setPhoneErrorText] = useState('');

  const rowDir = isRTL ? 'row-reverse' : 'row';
  const textAlignDir = isRTL ? 'right' : 'left';

  const isValidAlgerianMobile = (phoneStr) => {
    const clean = String(phoneStr || '').replace(/\s+/g, '');
    return /^(05|06|07)[0-9]{8}$/.test(clean);
  };

  useEffect(() => {
    fetchTransportModes();
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        let loc = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = loc.coords;
        setPickupCoords({ lat: latitude, lon: longitude });
        reverseGeocode(latitude, longitude, 'pickup');
      } catch (e) {
        console.log('GPS error:', e);
      }
    })();
  }, []);

  const fetchTransportModes = async () => {
    try {
      const res = await apiClient.get('customer.php?action=get_transport_modes');
      if (
        res.data?.success &&
        Array.isArray(res.data.transport_modes) &&
        res.data.transport_modes.length > 0
      ) {
        setVehicles(res.data.transport_modes);
        setSelectedVehicle(res.data.transport_modes[0].id);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (pickupCoords && deliveryCoords) {
      const R = 6371;
      const dLat = ((deliveryCoords.lat - pickupCoords.lat) * Math.PI) / 180;
      const dLon = ((deliveryCoords.lon - pickupCoords.lon) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((pickupCoords.lat * Math.PI) / 180) *
          Math.cos((deliveryCoords.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const d = Math.max(1, parseFloat((R * c * 1.3).toFixed(1)));
      setDistanceKm(d);
    }
    updateMapMarkers();
  }, [pickupCoords, deliveryCoords]);

  const reverseGeocode = async (lat, lon, target) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=fr`,
        { headers: { 'User-Agent': 'Mozilla/5.0 LivriliAlgeria/1.0' } }
      );
      const data = await res.json();
      if (data && data.display_name) {
        const shortName = data.display_name.split(',').slice(0, 3).join(',');
        const commune =
          data.address?.city ||
          data.address?.town ||
          data.address?.village ||
          data.address?.municipality ||
          'El Eulma';
        if (target === 'pickup') {
          setPickupText(shortName);
          setPickupCommune(commune.trim());
        } else {
          setDestinationText(shortName);
          setDeliveryCommune(commune.trim());
        }
      }
    } catch (err) {}
  };

  const searchAlgerianAddress = async (query, type) => {
    if (type === 'pickup') setPickupText(query);
    else setDestinationText(query);
    setActiveInput(type);

    const cleanQuery = query.trim().toLowerCase();
    if (cleanQuery.length === 0) {
      const popular = localLocations.slice(0, 6).map((loc) => ({
        place_id: loc.id,
        display_name: `${loc.name_fr} - ${loc.name_ar}`,
        lat: loc.lat,
        lon: loc.lon,
        commune: loc.commune,
        isLocal: true,
      }));
      setSuggestions(popular);
      return;
    }

    const matchedLocal = localLocations
      .filter(
        (loc) =>
          loc.name_fr.toLowerCase().includes(cleanQuery) ||
          loc.name_ar.includes(cleanQuery) ||
          loc.commune.toLowerCase().includes(cleanQuery) ||
          loc.keywords.some((k) => k.toLowerCase().includes(cleanQuery))
      )
      .map((loc) => ({
        place_id: loc.id,
        display_name: `${loc.name_fr} - ${loc.name_ar}`,
        lat: loc.lat,
        lon: loc.lon,
        commune: loc.commune,
        isLocal: true,
      }));

    setSuggestions(matchedLocal);
    if (cleanQuery.length < 3) return;

    setSearchingAddress(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=dz&addressdetails=1&accept-language=fr&limit=4&q=${encodeURIComponent(
        query + ' Algeria'
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
          commune:
            item.address?.city ||
            item.address?.town ||
            item.address?.village ||
            pickupCommune,
          isLocal: false,
        }));
        setSuggestions([...matchedLocal, ...formattedOsm]);
      }
    } catch (err) {
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleSelectSuggestion = (item) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    if (activeInput === 'pickup') {
      setPickupText(item.display_name);
      setPickupCoords({ lat, lon });
      if (item.commune) setPickupCommune(item.commune);
    } else {
      setDestinationText(item.display_name);
      setDeliveryCoords({ lat, lon });
      if (item.commune) setDeliveryCommune(item.commune);
    }
    setSuggestions([]);
    setActiveInput(null);
    Keyboard.dismiss();
  };

  const updateMapMarkers = () => {
    if (!webViewRef.current) return;
    const payload = JSON.stringify({
      pickup: pickupCoords,
      delivery: deliveryCoords,
    });
    webViewRef.current.injectJavaScript(`
      if (window.updateLivriliMap) {
        window.updateLivriliMap(${payload});
      }
      true;
    `);
  };

  const roundToNext50After10 = (rawPrice, minPrice) => {
    if (rawPrice <= minPrice) {
      return Math.ceil((minPrice - 10) / 50) * 50;
    }
    const rounded = Math.ceil((rawPrice - 10) / 50) * 50;
    return Math.max(minPrice, rounded);
  };

  const calculateEstimatedPrice = (vehicle) => {
    const basePrice = Number(vehicle.base_price ?? vehicle.basePrice ?? 200);
    const baseKm = Number(vehicle.base_km ?? 2.0);
    const communeMaxKm = Number(vehicle.commune_max_km ?? 5.0);
    const perKm = Number(vehicle.per_km ?? vehicle.perKm ?? 50);
    const rtMult = Number(vehicle.round_trip_multiplier ?? 1.6);
    const pricingMode = vehicle.pricing_mode || 'per_km';

    const sameCommune =
      !deliveryCommune ||
      pickupCommune.trim().toLowerCase() === deliveryCommune.trim().toLowerCase();

    let rawTotal = basePrice;

    if (pricingMode === 'flat_commune') {
      if (sameCommune && distanceKm <= communeMaxKm) {
        rawTotal = basePrice;
      } else {
        const extraKm = Math.max(0, distanceKm - communeMaxKm);
        rawTotal = basePrice + extraKm * perKm;
      }
      if (isRoundTrip) {
        rawTotal *= rtMult;
      }
    } else {
      const routeDist = isRoundTrip ? distanceKm * 2 : distanceKm;
      if (routeDist <= baseKm) {
        rawTotal = basePrice;
      } else {
        rawTotal = basePrice + (routeDist - baseKm) * perKm;
      }
      if (isRoundTrip && rawTotal <= basePrice) {
        rawTotal = basePrice * rtMult;
      }
    }

    return roundToNext50After10(rawTotal, basePrice);
  };

  const handleValidateModal = () => {
    if (!isValidAlgerianMobile(recipientPhone)) {
      setPhoneErrorText('Numéro obligatoire : 05, 06 ou 07 (10 chiffres).');
      setParcelInfoAlert(true);
      Alert.alert(
        'Numéro invalide',
        'Veuillez saisir un numéro de téléphone mobile algérien valide (05, 06 ou 07).'
      );
      return;
    }
    setPhoneErrorText('');
    setParcelInfoAlert(false);
    setDetailsModalVisible(false);
  };

  const handleCreateOrder = async () => {
    if (!destinationText.trim()) {
      Alert.alert('Adresse manquante', 'Veuillez choisir une adresse de destination.');
      return;
    }

    if (!isValidAlgerianMobile(recipientPhone)) {
      setParcelInfoAlert(true);
      setPhoneErrorText('Le numéro du destinataire est obligatoire.');
      Alert.alert(
        'Infos Colis manquantes',
        'Veuillez renseigner le téléphone du destinataire dans "+ INFOS COLIS" avant de commander.',
        [{ text: 'Remplir', onPress: () => setDetailsModalVisible(true) }]
      );
      return;
    }

    setParcelInfoAlert(false);

    let finalDeliveryCoords = deliveryCoords;
    let finalDelivCommune = deliveryCommune || pickupCommune;

    if (!finalDeliveryCoords) {
      const q = destinationText.trim().toLowerCase();
      const foundLocal = localLocations.find(
        (loc) =>
          loc.name_fr.toLowerCase().includes(q) ||
          loc.name_ar.includes(q) ||
          loc.keywords.some((k) => k.toLowerCase().includes(q))
      );
      if (foundLocal) {
        finalDeliveryCoords = { lat: foundLocal.lat, lon: foundLocal.lon };
        finalDelivCommune = foundLocal.commune || pickupCommune;
      } else {
        finalDeliveryCoords = {
          lat: pickupCoords.lat + 0.01,
          lon: pickupCoords.lon + 0.01,
        };
      }
    }

    setSubmitting(true);
    try {
      const vObj = vehicles.find((v) => v.id === selectedVehicle) || vehicles[0];
      const estimatedPrice = calculateEstimatedPrice(vObj);
      const finalDescription = parcelDescription.trim()
        ? `${selectedParcelType} - ${parcelDescription.trim()}`
        : selectedParcelType;

      const response = await apiClient.post('customer.php?action=create_order', {
        pickup_lat: pickupCoords.lat,
        pickup_lon: pickupCoords.lon,
        pickup_commune: pickupCommune,
        pickup_address: pickupText || 'El Eulma',
        delivery_lat: finalDeliveryCoords.lat,
        delivery_lon: finalDeliveryCoords.lon,
        delivery_commune: finalDelivCommune,
        delivery_address: destinationText.trim(),
        recipient_phone: recipientPhone.replace(/\s+/g, ''),
        payment_by: paymentBy,
        is_round_trip: isRoundTrip ? 1 : 0,
        vehicle_type: selectedVehicle,
        parcel_description: finalDescription,
        distance_km: distanceKm,
        estimated_price: estimatedPrice,
      });

      if (response.data?.success || response.data?.order_id || response.status === 200) {
        Alert.alert(t('searchingDriversTitle'), t('searchingDriversMsg'));
        setDestinationText('');
        setDeliveryCoords(null);
        setParcelDescription('');
        navigation.navigate('Orders');
      } else {
        Alert.alert('Info', response.data?.error || 'Erreur lors de la création.');
      }
    } catch (error) {
      Alert.alert('Erreur', error.response?.data?.error || 'Impossible de créer la commande.');
    } finally {
      setSubmitting(false);
    }
  };

  const primaryColorHex = COLORS.primary || '#006233';
  const secondaryColorHex = COLORS.secondary || '#D21034';

  const leafletHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: #e5e7eb; }
        #map { position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; }
        .leaflet-control-attribution { display: none !important; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var PRIMARY_COLOR = "${primaryColorHex}";
        var SECONDARY_COLOR = "${secondaryColorHex}";
        var map = L.map('map', { zoomControl: false }).setView([36.1528, 5.6902], 14);
        L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20 }).addTo(map);
        setTimeout(function() { map.invalidateSize(); }, 300);

        var greenIcon = L.divIcon({
          html: '<div style="width:18px;height:18px;background:' + PRIMARY_COLOR + ';border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>',
          className: '', iconSize: [22, 22], iconAnchor: [11, 11]
        });
        var redPinIcon = L.divIcon({
          html: '<div style="width:24px;height:24px;background:' + SECONDARY_COLOR + ';border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,0.5);"></div>',
          className: '', iconSize: [26, 26], iconAnchor: [13, 26]
        });

        var pickupMarker = L.marker([36.1528, 5.6902], { icon: greenIcon }).addTo(map);
        var deliveryMarker = null;
        var routeLine = null;

        map.on('click', function(e) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MAP_CLICK', lat: e.latlng.lat, lon: e.latlng.lng }));
          }
        });

        window.updateLivriliMap = function(data) {
          try {
            map.invalidateSize();
            if (data.pickup) { pickupMarker.setLatLng([data.pickup.lat, data.pickup.lon]); }
            if (data.delivery) {
              if (!deliveryMarker) {
                deliveryMarker = L.marker([data.delivery.lat, data.delivery.lon], { icon: redPinIcon }).addTo(map);
              } else {
                deliveryMarker.setLatLng([data.delivery.lat, data.delivery.lon]);
              }
              if (routeLine) map.removeLayer(routeLine);
              routeLine = L.polyline([[data.pickup.lat, data.pickup.lon], [data.delivery.lat, data.delivery.lon]], { color: PRIMARY_COLOR, weight: 5, dashArray: '8, 8' }).addTo(map);
              map.fitBounds([[data.pickup.lat, data.pickup.lon], [data.delivery.lat, data.delivery.lon]], { padding: [70, 70] });
            }
          } catch(e) {}
        };
      </script>
    </body>
    </html>
  `;

  const isPhoneComplete = isValidAlgerianMobile(recipientPhone);

  return (
    <View style={styles.container}>
      {/* 1. CARTE AGRANDIE (85% DE L'ÉCRAN) */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: leafletHtml }}
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          mixedContentMode="always"
          androidLayerType="hardware"
          onLoadEnd={updateMapMarkers}
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === 'MAP_CLICK') {
                setDeliveryCoords({ lat: msg.lat, lon: msg.lon });
                reverseGeocode(msg.lat, msg.lon, 'destination');
              }
            } catch (e) {}
          }}
        />
      </View>

      {/* INPUTS ADRESSES EN HAUT */}
      <View style={styles.topOverlay}>
        <View style={[styles.addressCard, { flexDirection: rowDir }]}>
          <View style={styles.timelineColumn}>
            <View style={styles.greenDot} />
            <View style={styles.verticalLine} />
            <View style={styles.redSquare} />
          </View>
          <View style={styles.inputsColumn}>
            <View style={[styles.inputRow, { flexDirection: rowDir }]}>
              <TextInput
                style={[styles.addressInput, { textAlign: textAlignDir }]}
                placeholder={t('pickupPlaceholder')}
                placeholderTextColor="#94A3B8"
                value={pickupText}
                onChangeText={(txt) => searchAlgerianAddress(txt, 'pickup')}
              />
              <TouchableOpacity
                onPress={async () => {
                  let loc = await Location.getCurrentPositionAsync({});
                  setPickupCoords({ lat: loc.coords.latitude, lon: loc.coords.longitude });
                  reverseGeocode(loc.coords.latitude, loc.coords.longitude, 'pickup');
                }}
              >
                <Ionicons name="locate" size={19} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
            <View style={[styles.inputRow, { flexDirection: rowDir }]}>
              <TextInput
                style={[styles.addressInput, { textAlign: textAlignDir }]}
                placeholder={t('destinationPlaceholder')}
                placeholderTextColor="#94A3B8"
                value={destinationText}
                onChangeText={(txt) => searchAlgerianAddress(txt, 'destination')}
              />
              {destinationText.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setDestinationText('');
                    setDeliveryCoords(null);
                    setSuggestions([]);
                  }}
                >
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {(searchingAddress || suggestions.length > 0) && (
          <View style={styles.suggestionsBox}>
            <View style={[styles.suggestionHeader, { flexDirection: rowDir }]}>
              <Text style={styles.suggestionHeaderTitle}>Quartiers & Repères</Text>
              <TouchableOpacity onPress={() => setSuggestions([])}>
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={suggestions}
              keyExtractor={(item, idx) => String(item.place_id || idx)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.suggestionItem, { flexDirection: rowDir }]}
                  onPress={() => handleSelectSuggestion(item)}
                >
                  <Ionicons
                    name={item.isLocal ? 'star' : 'location-outline'}
                    size={17}
                    color={item.isLocal ? COLORS.primary : COLORS.secondary}
                  />
                  <Text
                    style={[
                      styles.suggestionText,
                      { textAlign: textAlignDir, marginHorizontal: 8 },
                    ]}
                    numberOfLines={2}
                  >
                    {item.display_name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* 2. PANNEAU DU BAS COMPACT (SANS LES ONGLETS DE COLIS) */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />

        <View style={[styles.vehiclesGridRow, { flexDirection: rowDir }]}>
          {vehicles.map((v) => {
            const isSelected = selectedVehicle === v.id;
            const estPrice = calculateEstimatedPrice(v);
            const title = lang === 'ar' || lang === 'dz' ? v.title_ar || v.title_fr : v.title_fr;
            return (
              <TouchableOpacity
                key={v.id}
                activeOpacity={0.85}
                onPress={() => setSelectedVehicle(v.id)}
                style={[styles.vehicleCompactBox, isSelected && styles.vehicleCompactBoxSelected]}
              >
                <MaterialCommunityIcons
                  name={v.icon || 'motorbike'}
                  size={26}
                  color={isSelected ? COLORS.primary : v.color || COLORS.primary}
                />
                <Text style={styles.vehicleSmallTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.vehicleSmallPrice}>{estPrice} DA</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.actionButtonsRow, { flexDirection: rowDir }]}>
          <TouchableOpacity
            style={[
              styles.bookLaterBtn,
              parcelInfoAlert && styles.bookLaterBtnAlert,
              isPhoneComplete && !parcelInfoAlert && styles.bookLaterBtnValid,
            ]}
            onPress={() => setDetailsModalVisible(true)}
          >
            <Ionicons
              name={
                parcelInfoAlert
                  ? 'alert-circle'
                  : isPhoneComplete
                  ? 'checkmark-circle'
                  : 'options-outline'
              }
              size={17}
              color={parcelInfoAlert ? '#FFFFFF' : isPhoneComplete ? COLORS.primary : '#0F172A'}
            />
            <Text
              style={[
                styles.bookLaterText,
                parcelInfoAlert && { color: '#FFFFFF' },
                isPhoneComplete && !parcelInfoAlert && { color: COLORS.primary },
              ]}
            >
              {' '}
              {t('parcelInfoBtn')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bookNowBtn}
            onPress={handleCreateOrder}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.bookNowText}>
                {t('bookNow')} (~{distanceKm} km)
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. MODAL INFOS COLIS (AVEC LES ONGLETS DE TYPE DE COLIS DÉPLACÉS ICI) */}
      <Modal visible={detailsModalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalHeader, { flexDirection: rowDir }]}>
              <Text style={styles.modalTitle}>{t('modalParcelTitle')}</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { textAlign: textAlignDir }]}>
                {t('whatToSend')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.parcelTypesScroll}
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                {PARCEL_TYPES.map((pt) => {
                  const active = selectedParcelType === pt.id;
                  return (
                    <TouchableOpacity
                      key={pt.id}
                      style={[styles.parcelChip, active && styles.parcelChipActive]}
                      onPress={() => setSelectedParcelType(pt.id)}
                    >
                      <Ionicons
                        name={pt.icon}
                        size={15}
                        color={active ? '#FFFFFF' : COLORS.primary}
                      />
                      <Text
                        style={[
                          styles.parcelChipText,
                          active && styles.parcelChipTextActive,
                          { marginHorizontal: 4 },
                        ]}
                      >
                        {pt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.inputLabel, { textAlign: textAlignDir }]}>
                {t('recipientPhoneLabel')} <Text style={{ color: COLORS.secondary }}>{t('requiredTag')}</Text>
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  { textAlign: textAlignDir },
                  phoneErrorText ? { borderColor: COLORS.secondary, backgroundColor: '#FEF2F2' } : null,
                ]}
                placeholder="Ex: 0550123456"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                maxLength={10}
                value={recipientPhone}
                onChangeText={(txt) => {
                  const cleaned = txt.replace(/[^0-9]/g, '');
                  setRecipientPhone(cleaned);
                  if (isValidAlgerianMobile(cleaned)) {
                    setPhoneErrorText('');
                    setParcelInfoAlert(false);
                  }
                }}
              />
              {phoneErrorText ? (
                <Text style={[styles.errorHelper, { textAlign: textAlignDir }]}>{phoneErrorText}</Text>
              ) : null}

              <Text style={[styles.inputLabel, { textAlign: textAlignDir }]}>
                {t('parcelDetailsLabel')} <Text style={{ color: '#64748B', fontWeight: '400' }}>{t('optionalTag')}</Text>
              </Text>
              <TextInput
                style={[styles.modalInput, { textAlign: textAlignDir }]}
                placeholder={t('parcelDetailsPlaceholder')}
                placeholderTextColor="#94A3B8"
                value={parcelDescription}
                onChangeText={setParcelDescription}
              />

              <View style={[styles.switchRow, { flexDirection: rowDir }]}>
                <Text style={styles.inputLabel}>{t('roundTrip')}</Text>
                <Switch
                  value={isRoundTrip}
                  onValueChange={setIsRoundTrip}
                  trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
                />
              </View>

              <View style={[styles.paymentRow, { flexDirection: rowDir }]}>
                <TouchableOpacity
                  style={[styles.paymentChip, paymentBy === 'sender' && styles.paymentChipActive]}
                  onPress={() => setPaymentBy('sender')}
                >
                  <Text
                    style={[
                      styles.paymentChipText,
                      paymentBy === 'sender' && styles.paymentChipTextActive,
                    ]}
                  >
                    {t('payBySender')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paymentChip, paymentBy === 'recipient' && styles.paymentChipActive]}
                  onPress={() => setPaymentBy('recipient')}
                >
                  <Text
                    style={[
                      styles.paymentChipText,
                      paymentBy === 'recipient' && styles.paymentChipTextActive,
                    ]}
                  >
                    {t('payByRecipient')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleValidateModal}>
                <Text style={styles.bookNowText}>{t('validateBtn')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E5E7EB' },
  mapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '85%', // 👈 CARTE AGRANDIE À 85%
    zIndex: 1,
  },
  map: { flex: 1, width: '100%', height: '100%' },
  topOverlay: {
    paddingTop: Platform.OS === 'ios' ? 44 : 28,
    paddingHorizontal: 14,
    zIndex: 20,
  },
  addressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 6,
  },
  timelineColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    paddingVertical: 6,
  },
  greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  verticalLine: { width: 2, flex: 1, backgroundColor: '#CBD5E1', marginVertical: 3 },
  redSquare: { width: 10, height: 10, backgroundColor: COLORS.secondary },
  inputsColumn: { flex: 1 },
  inputRow: { alignItems: 'center', height: 34 },
  addressInput: { flex: 1, fontSize: 13, color: COLORS.textDark, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 2 },
  suggestionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 6,
    maxHeight: 200,
    elevation: 8,
  },
  suggestionHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  suggestionHeaderTitle: { fontSize: 11, fontWeight: '800', color: '#475569' },
  suggestionItem: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionText: { fontSize: 13, color: COLORS.textDark, fontWeight: '600', flex: 1 },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    zIndex: 10,
    elevation: 12,
  },
  sheetHandle: {
    width: 48,
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 6,
  },
  vehiclesGridRow: {
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  vehicleCompactBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  vehicleCompactBoxSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  vehicleSmallTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
  },
  vehicleSmallPrice: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
    marginTop: 1,
  },
  actionButtonsRow: { justifyContent: 'space-between' },
  bookLaterBtn: {
    flex: 0.95,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: COLORS.softBlue,
    paddingVertical: 12,
    borderRadius: 10,
    marginRight: 6,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  bookLaterBtnAlert: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  bookLaterBtnValid: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  bookLaterText: { color: '#0F172A', fontWeight: '800', fontSize: 12 },
  bookNowBtn: {
    flex: 1.3,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    marginLeft: 6,
    alignItems: 'center',
  },
  bookNowText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textDark },
  parcelTypesScroll: { flexGrow: 0, marginBottom: 10 },
  parcelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  parcelChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  parcelChipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  parcelChipTextActive: { color: '#FFFFFF' },
  inputLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 6, marginTop: 8 },
  modalInput: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  errorHelper: { color: COLORS.secondary, fontSize: 12, fontWeight: '700', marginTop: 4 },
  switchRow: { justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  paymentRow: { justifyContent: 'space-between', marginBottom: 18 },
  paymentChip: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  paymentChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  paymentChipText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  paymentChipTextActive: { color: COLORS.primary, fontWeight: '800' },
  modalSaveBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
});