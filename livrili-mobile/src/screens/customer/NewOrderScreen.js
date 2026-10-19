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

// Modes de transport compacts (Icône + Petit titre)
const VEHICLES = [
  {
    id: 'moto',
    icon: 'motorbike',
    shortTitle: 'Moto',
    basePrice: 200,
    perKm: 50,
    color: '#006233',
  },
  {
    id: 'camionnette',
    icon: 'truck-flatbed',
    shortTitle: 'Harbin / Chana',
    basePrice: 600,
    perKm: 100,
    color: '#D97706',
  },
  {
    id: 'fourgon',
    icon: 'truck-delivery',
    shortTitle: 'Fourgon',
    basePrice: 900,
    perKm: 150,
    color: '#4F46E5',
  },
];

// Types d'objets de livraison rapides
const PARCEL_TYPES = [
  { id: 'Colis / Carton', label: 'Colis', icon: 'cube-outline' },
  { id: 'Documents / Clés', label: 'Documents/Clés', icon: 'document-text-outline' },
  { id: 'Repas / Courses', label: 'Repas/Courses', icon: 'fast-food-outline' },
  { id: 'Pièces / Matériel', label: 'Pièces/Outils', icon: 'construct-outline' },
  { id: 'Meuble / Électroménager', label: 'Encombrant', icon: 'tv-outline' },
];

export default function NewOrderScreen({ navigation }) {
  const { t, lang } = useThemeLang();
  const webViewRef = useRef(null);

  const [pickupCoords, setPickupCoords] = useState({ lat: 36.1528, lon: 5.6902 });
  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [pickupCommune, setPickupCommune] = useState('El Eulma');

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

  useEffect(() => {
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
      const d = Math.max(1, parseFloat((R * c * 1.25).toFixed(1)));
      setDistanceKm(d);
    }
    updateMapMarkers();
  }, [pickupCoords, deliveryCoords]);

  const reverseGeocode = async (lat, lon, target) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=${
          lang === 'ar' || lang === 'dz' ? 'ar' : 'fr'
        }`,
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
          setPickupCommune(commune);
        } else {
          setDestinationText(shortName);
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
        display_name:
          lang === 'ar' || lang === 'dz'
            ? `${loc.name_ar} (${loc.name_fr})`
            : `${loc.name_fr} - ${loc.name_ar}`,
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
        display_name:
          lang === 'ar' || lang === 'dz'
            ? `${loc.name_ar} • ${loc.name_fr}`
            : `${loc.name_fr} - ${loc.name_ar}`,
        lat: loc.lat,
        lon: loc.lon,
        commune: loc.commune,
        isLocal: true,
      }));

    setSuggestions(matchedLocal);

    if (cleanQuery.length < 3) return;

    setSearchingAddress(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=dz&addressdetails=1&limit=4&q=${encodeURIComponent(
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
      console.log('OSM fallback error:', err);
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

  const calculateEstimatedPrice = (vehicle) => {
    const extraKm = Math.max(0, distanceKm - 2);
    let total = vehicle.basePrice + extraKm * vehicle.perKm;
    if (isRoundTrip) total *= 1.5;
    return Math.round(total / 10) * 10;
  };

  const handleCreateOrder = async () => {
    if (!destinationText.trim()) {
      Alert.alert('Adresse manquante', 'Veuillez choisir ou saisir une adresse de destination.');
      return;
    }

    let finalDeliveryCoords = deliveryCoords;
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
      } else {
        finalDeliveryCoords = {
          lat: pickupCoords.lat + 0.01,
          lon: pickupCoords.lon + 0.01,
        };
      }
    }

    setSubmitting(true);
    try {
      const vObj = VEHICLES.find((v) => v.id === selectedVehicle) || VEHICLES[0];
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
        delivery_address: destinationText.trim(),
        recipient_phone: recipientPhone || '',
        payment_by: paymentBy,
        is_round_trip: isRoundTrip ? 1 : 0,
        vehicle_type: selectedVehicle,
        parcel_description: finalDescription,
        distance_km: distanceKm,
        estimated_price: estimatedPrice,
      });

      if (response.data?.success || response.data?.order_id || response.status === 200) {
        Alert.alert('Commande envoyée !', 'Les livreurs à proximité ont reçu votre demande.');
        setDestinationText('');
        setDeliveryCoords(null);
        navigation.navigate('Orders');
      } else {
        Alert.alert('Info', response.data?.error || response.data?.message || 'Commande créée.');
      }
    } catch (error) {
      Alert.alert(
        'Erreur',
        error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          'Impossible de créer la commande.'
      );
    } finally {
      setSubmitting(false);
    }
  };

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
        var map = L.map('map', { zoomControl: false }).setView([36.1528, 5.6902], 14);

        L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          maxZoom: 20
        }).addTo(map);

        setTimeout(function() { map.invalidateSize(); }, 300);

        var greenIcon = L.divIcon({
          html: '<div style="width:18px;height:18px;background:#006233;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>',
          className: '',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        var redPinIcon = L.divIcon({
          html: '<div style="width:24px;height:24px;background:#D21034;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,0.5);"></div>',
          className: '',
          iconSize: [26, 26],
          iconAnchor: [13, 26]
        });

        var pickupMarker = L.marker([36.1528, 5.6902], { icon: greenIcon }).addTo(map);
        var deliveryMarker = null;
        var routeLine = null;

        map.on('click', function(e) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MAP_CLICK',
              lat: e.latlng.lat,
              lon: e.latlng.lng
            }));
          }
        });

        window.updateLivriliMap = function(data) {
          try {
            map.invalidateSize();
            if (data.pickup) {
              pickupMarker.setLatLng([data.pickup.lat, data.pickup.lon]);
            }
            if (data.delivery) {
              if (!deliveryMarker) {
                deliveryMarker = L.marker([data.delivery.lat, data.delivery.lon], { icon: redPinIcon }).addTo(map);
              } else {
                deliveryMarker.setLatLng([data.delivery.lat, data.delivery.lon]);
              }
              if (routeLine) map.removeLayer(routeLine);
              routeLine = L.polyline([
                [data.pickup.lat, data.pickup.lon],
                [data.delivery.lat, data.delivery.lon]
              ], { color: '#006233', weight: 5, dashArray: '8, 8' }).addTo(map);

              map.fitBounds([
                [data.pickup.lat, data.pickup.lon],
                [data.delivery.lat, data.delivery.lon]
              ], { padding: [70, 70] });
            } else if (data.pickup) {
              map.setView([data.pickup.lat, data.pickup.lon], 14);
            }
          } catch(e) {}
        };
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      {/* CARTE PLEIN ÉCRAN (70% DE L'ÉCRAN) */}
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
          userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
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
        <View style={styles.addressCard}>
          <View style={styles.timelineColumn}>
            <View style={styles.greenDot} />
            <View style={styles.verticalLine} />
            <View style={styles.redSquare} />
          </View>

          <View style={styles.inputsColumn}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.addressInput}
                placeholder={t('pickupPlaceholder')}
                placeholderTextColor="#94A3B8"
                value={pickupText}
                onChangeText={(txt) => searchAlgerianAddress(txt, 'pickup')}
                onFocus={() => searchAlgerianAddress(pickupText, 'pickup')}
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

            <View style={styles.inputRow}>
              <TextInput
                style={styles.addressInput}
                placeholder="Destination (ex: Belaala, Dubaï, 19 Juin...)"
                placeholderTextColor="#94A3B8"
                value={destinationText}
                onChangeText={(txt) => searchAlgerianAddress(txt, 'destination')}
                onFocus={() => searchAlgerianAddress(destinationText, 'destination')}
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
            <View style={styles.suggestionHeader}>
              <Text style={styles.suggestionHeaderTitle}>
                Quartiers & Repères ({pickupCommune})
              </Text>
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
                  style={styles.suggestionItem}
                  onPress={() => handleSelectSuggestion(item)}
                >
                  <Ionicons
                    name={item.isLocal ? 'star' : 'location-outline'}
                    size={17}
                    color={item.isLocal ? COLORS.primary : COLORS.secondary}
                  />
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {item.display_name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {/* PANNEAU DU BAS ULTRA-COMPACT : TYPE D'OBJET + ICÔNES VÉHICULES CÔTE À CÔTE */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />

        {/* 1. CHOIX DU TYPE D'OBJET À LIVRER */}
        <Text style={styles.miniSectionLabel}>Que voulez-vous envoyer ?</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.parcelTypesScroll}
          contentContainerStyle={{ paddingBottom: 6 }}
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
                <Text style={[styles.parcelChipText, active && styles.parcelChipTextActive]}>
                  {pt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 2. CHOIX DU VÉHICULE : ICÔNES + PETIT TITRE EN LIGNE HORIZONTALE */}
        <View style={styles.vehiclesGridRow}>
          {VEHICLES.map((v) => {
            const isSelected = selectedVehicle === v.id;
            const estPrice = calculateEstimatedPrice(v);
            return (
              <TouchableOpacity
                key={v.id}
                activeOpacity={0.85}
                onPress={() => setSelectedVehicle(v.id)}
                style={[styles.vehicleCompactBox, isSelected && styles.vehicleCompactBoxSelected]}
              >
                <MaterialCommunityIcons
                  name={v.icon}
                  size={30}
                  color={isSelected ? COLORS.primary : v.color}
                />
                <Text style={styles.vehicleSmallTitle} numberOfLines={1}>
                  {v.shortTitle}
                </Text>
                <Text style={styles.vehicleSmallPrice}>{estPrice} DA</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 3. BOUTONS D'ACTION */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.bookLaterBtn}
            onPress={() => setDetailsModalVisible(true)}
          >
            <Ionicons name="options-outline" size={16} color="#0F172A" />
            <Text style={styles.bookLaterText}> + INFOS COLIS</Text>
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

      {/* MODAL OPTIONS SUPPLÉMENTAIRES DU COLIS */}
      <Modal visible={detailsModalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Options de livraison</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Précisions sur l'objet ({selectedParcelType})</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Fragile, 2 cartons, appeler en arrivant..."
              value={parcelDescription}
              onChangeText={setParcelDescription}
            />

            <Text style={styles.inputLabel}>Téléphone du destinataire</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t('recipientPhonePlaceholder')}
              keyboardType="phone-pad"
              value={recipientPhone}
              onChangeText={setRecipientPhone}
            />

            <View style={styles.switchRow}>
              <Text style={styles.inputLabel}>{t('roundTrip')}</Text>
              <Switch
                value={isRoundTrip}
                onValueChange={setIsRoundTrip}
                trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
              />
            </View>

            <View style={styles.paymentRow}>
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
                style={[
                  styles.paymentChip,
                  paymentBy === 'recipient' && styles.paymentChipActive,
                ]}
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

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={() => setDetailsModalVisible(false)}
            >
              <Text style={styles.bookNowText}>Valider</Text>
            </TouchableOpacity>
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
    height: '72%',
    zIndex: 1,
  },
  map: { flex: 1, width: '100%', height: '100%' },
  topOverlay: {
    paddingTop: Platform.OS === 'ios' ? 44 : 28,
    paddingHorizontal: 14,
    zIndex: 20,
  },
  addressCard: {
    flexDirection: 'row',
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
  inputRow: { flexDirection: 'row', alignItems: 'center', height: 34 },
  addressInput: { flex: 1, fontSize: 13, color: COLORS.textDark, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 2 },
  suggestionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 6,
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  suggestionHeader: {
    flexDirection: 'row',
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionText: { marginLeft: 8, fontSize: 13, color: COLORS.textDark, fontWeight: '600', flex: 1 },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
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
  miniSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  parcelTypesScroll: {
    flexGrow: 0,
    marginBottom: 6,
  },
  parcelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginRight: 7,
  },
  parcelChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  parcelChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginLeft: 5,
  },
  parcelChipTextActive: {
    color: '#FFFFFF',
  },
  vehiclesGridRow: {
    flexDirection: 'row',
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
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bookLaterBtn: {
    flex: 0.9,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: COLORS.softBlue,
    paddingVertical: 12,
    borderRadius: 10,
    marginRight: 6,
    alignItems: 'center',
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
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textDark },
  inputLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textDark, marginBottom: 6, marginTop: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
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
  modalSaveBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});