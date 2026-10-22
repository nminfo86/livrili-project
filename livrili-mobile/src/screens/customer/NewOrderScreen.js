// src/screens/customer/NewOrderScreen.js
import React, { useState, useEffect, useRef } from "react";
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
  Animated,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Ionicons, MaterialCommunityIcons, Fontisto } from "@expo/vector-icons";
import {
  useThemeLang,
  COLORS,
  FONTS,
  SHADOWS,
} from "../../context/ThemeLanguageContext";
import apiClient from "../../api/client";
import localLocations from "../../data/algeriaLocations.json";
import { GOOGLE_MAPS_API_KEY, DEFAULT_COORDS } from "../../config/mapsConfig";
import {
  testGoogleMapsAccess,
  reverseGeocodeCoords,
  searchAddressSuggestions,
  getGooglePlaceCoordinates,
} from "../../services/MapService";

const DEFAULT_VEHICLES = [
  {
    id: "moto",
    icon: "moped",
    title_fr: "Moto Express",
    pricing_mode: "per_km",
    base_price: 200,
    base_km: 2,
    commune_max_km: 5,
    per_km: 50,
    round_trip_multiplier: 1.6,
    color: "#EA580C",
  },
  {
    id: "camionnette",
    icon: "truck-flatbed",
    title_fr: "Harbin / DFSK",
    pricing_mode: "flat_commune",
    base_price: 600,
    base_km: 2,
    commune_max_km: 5,
    per_km: 100,
    round_trip_multiplier: 1.5,
    color: "#D97706",
  },
  {
    id: "fourgon",
    icon: "truck-fast",
    title_fr: "Fourgon",
    pricing_mode: "flat_commune",
    base_price: 900,
    base_km: 2,
    commune_max_km: 5,
    per_km: 150,
    round_trip_multiplier: 1.5,
    color: "#4F46E5",
  },
];

export default function NewOrderScreen({ navigation }) {
  const { t, isRTL } = useThemeLang();
  const webViewRef = useRef(null);

  // Moteur de carte actif : true = Google Maps | false = OpenStreetMap
  const [isGoogleMapsActive, setIsGoogleMapsActive] = useState(false);

  const [vehicles, setVehicles] = useState(DEFAULT_VEHICLES);
  const [pickupCoords, setPickupCoords] = useState(DEFAULT_COORDS);
  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [pickupCommune, setPickupCommune] = useState("El Eulma");
  const [deliveryCommune, setDeliveryCommune] = useState("El Eulma");
  const [pickupText, setPickupText] = useState("Position GPS...");
  const [destinationText, setDestinationText] = useState("");

  // Champ actuellement ciblé par la recherche ('pickup' ou 'destination')
  const [activeField, setActiveField] = useState("destination");
  const [suggestions, setSuggestions] = useState([]);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Masquer le panneau inférieur si le clavier est ouvert, si un champ est actif ou si des suggestions sont affichées
  const shouldHideBottomSheet =
    isKeyboardVisible || isInputFocused || suggestions.length > 0;

  const [selectedVehicle, setSelectedVehicle] = useState("moto");
  const [selectedParcelType, setSelectedParcelType] = useState("boxParcel");
  const [distanceKm, setDistanceKm] = useState(2.0);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [parcelDescription, setParcelDescription] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [paymentBy, setPaymentBy] = useState("sender");
  const [submitting, setSubmitting] = useState(false);
  const [phoneErrorText, setPhoneErrorText] = useState("");

  // Animation pour l'icône GPS clignotante lors de la localisation
  const [isGpsLocating, setIsGpsLocating] = useState(false);
  const blinkAnim = useRef(new Animated.Value(1)).current;

  const rowDir = isRTL ? "row-reverse" : "row";
  const textAlignDir = isRTL ? "right" : "left";

  // Couleur de l'icône GPS : Vert (Google Maps) ou Orange (OSM)
  const engineColor = isGoogleMapsActive ? "#16A34A" : "#EA580C";

  const PARCEL_TYPES = [
    { key: "boxParcel", label: t("boxParcel"), icon: "cube-outline" },
    { key: "foodParcel", label: t("foodParcel"), icon: "fast-food-outline" },
    {
      key: "clothesParcel",
      label: t("clothesParcel") || (isRTL ? "ملابس" : "Vêtements"),
      icon: "shirt-outline",
    },
    { key: "fragileParcel", label: t("fragileParcel"), icon: "wine-outline" },
    { key: "bulkyParcel", label: t("bulkyParcel"), icon: "tv-outline" },
    { key: "otherParcel", label: t("otherParcel"), icon: "cube-outline" },
  ];

  const isValidAlgerianMobile = (phoneStr) => {
    const clean = String(phoneStr || "").replace(/\s+/g, "");
    return /^(05|06|07)[0-9]{8}$/.test(clean);
  };

  useEffect(() => {
    let animationLoop;
    if (isGpsLocating) {
      animationLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 0.2,
            duration: 350,
            useNativeDriver: true,
          }),
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),
        ]),
      );
      animationLoop.start();
    } else {
      blinkAnim.setValue(1);
    }
    return () => animationLoop && animationLoop.stop();
  }, [isGpsLocating]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setIsKeyboardVisible(false);
        setIsInputFocused(false);
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const isAvailable = await testGoogleMapsAccess();
      setIsGoogleMapsActive(isAvailable);

      await fetchTransportModes();
      await triggerAutoGps(isAvailable);
    };

    initialize();
  }, []);

  const fetchTransportModes = async () => {
    try {
      const res = await apiClient.get(
        "customer.php?action=get_transport_modes",
      );
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

  const triggerAutoGps = async (googleActiveFlag = isGoogleMapsActive) => {
    setIsGpsLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setIsGpsLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = loc.coords;
      setPickupCoords({ lat: latitude, lon: longitude });

      const geo = await reverseGeocodeCoords(
        latitude,
        longitude,
        googleActiveFlag,
      );
      setPickupText(geo.address);
      setPickupCommune(geo.commune);
    } catch (e) {
      console.log("GPS Error:", e);
    } finally {
      setIsGpsLocating(false);
    }
  };

  // Recalcul de l'estimation de distance à vol d'oiseau si les deux points changent
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
  }, [pickupCoords, deliveryCoords, isGoogleMapsActive]);

  // Recherche dynamique pour le départ ou l'arrivée (avec biais de proximité GPS)
  const handleSearchAddress = async (query, targetField) => {
    setActiveField(targetField);
    if (targetField === "pickup") {
      setPickupText(query);
    } else {
      setDestinationText(query);
    }

    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const results = await searchAddressSuggestions(
      query,
      isGoogleMapsActive,
      localLocations,
      pickupCommune,
      pickupCoords, // <-- Priorise les résultats Google autour de la position actuelle
    );
    setSuggestions(results);
  };

  // Sélection d'une adresse dans la liste déroulante
  const handleSelectSuggestion = async (item) => {
    Keyboard.dismiss();
    setIsInputFocused(false);
    setSuggestions([]);

    let coords = null;
    let communeName = pickupCommune;
    let fullAddress = item.display_name;

    // Si l'élément contient déjà lat/lon (ex: retour direct Geocoding ou OSM)
    if (item.lat && item.lon) {
      coords = { lat: parseFloat(item.lat), lon: parseFloat(item.lon) };
      if (item.commune) communeName = item.commune;
    } else if (item.isGoogle) {
      // Sinon on récupère les coordonnées via PlaceId (v1 ou Geocode)
      const details = await getGooglePlaceCoordinates(
        item.place_id,
        item.display_name,
      );
      if (details) {
        coords = { lat: details.lat, lon: details.lon };
        communeName = details.commune;
        fullAddress = details.display_name;
      }
    }

    if (activeField === "pickup") {
      setPickupText(fullAddress);
      setPickupCommune(communeName);
      if (coords) setPickupCoords(coords);
    } else {
      setDestinationText(fullAddress);
      setDeliveryCommune(communeName);
      if (coords) setDeliveryCoords(coords);
    }
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
    const basePrice = Number(vehicle.base_price ?? 200);
    const baseKm = Number(vehicle.base_km ?? 2.0);
    const communeMaxKm = Number(vehicle.commune_max_km ?? 5.0);
    const perKm = Number(vehicle.per_km ?? 50);
    const rtMult = Number(vehicle.round_trip_multiplier ?? 1.6);
    const pricingMode = vehicle.pricing_mode || "per_km";
    const sameCommune =
      !deliveryCommune ||
      pickupCommune.trim().toLowerCase() ===
        deliveryCommune.trim().toLowerCase();

    let rawTotal = basePrice;
    if (pricingMode === "flat_commune") {
      if (sameCommune && distanceKm <= communeMaxKm) {
        rawTotal = basePrice;
      } else {
        const extraKm = Math.max(0, distanceKm - communeMaxKm);
        rawTotal = basePrice + extraKm * perKm;
      }
      if (isRoundTrip) rawTotal *= rtMult;
    } else {
      const routeDist = isRoundTrip ? distanceKm * 2 : distanceKm;
      if (routeDist <= baseKm) {
        rawTotal = basePrice;
      } else {
        rawTotal = basePrice + (routeDist - baseKm) * perKm;
      }
      if (isRoundTrip && rawTotal <= basePrice) rawTotal = basePrice * rtMult;
    }
    return Math.max(basePrice, Math.ceil((rawTotal - 10) / 50) * 50);
  };

  const currentVehicleObj =
    vehicles.find((v) => v.id === selectedVehicle) || vehicles[0];
  const finalPrice = calculateEstimatedPrice(currentVehicleObj);

  const handleOpenOrderPopup = () => {
    if (!destinationText.trim()) {
      Alert.alert(t("appName"), t("destinationPlaceholder"));
      return;
    }
    setPhoneErrorText("");
    setDetailsModalVisible(true);
  };

  const handleConfirmOrder = async () => {
    if (!isValidAlgerianMobile(recipientPhone)) {
      setPhoneErrorText(t("errPhone"));
      return;
    }
    setDetailsModalVisible(false);
    setSubmitting(true);
    try {
      let finalDelivCoords = deliveryCoords;
      if (!finalDelivCoords) {
        finalDelivCoords = {
          lat: pickupCoords.lat + 0.01,
          lon: pickupCoords.lon + 0.01,
        };
      }
      const selectedTypeLabel = t(selectedParcelType);
      const finalDesc = `${selectedTypeLabel}${
        parcelDescription.trim() ? " - " + parcelDescription.trim() : ""
      }`;

      const res = await apiClient.post("customer.php?action=create_order", {
        pickup_lat: pickupCoords.lat,
        pickup_lon: pickupCoords.lon,
        pickup_commune: pickupCommune,
        pickup_address: pickupText,
        delivery_lat: finalDelivCoords.lat,
        delivery_lon: finalDelivCoords.lon,
        delivery_commune: deliveryCommune || pickupCommune,
        delivery_address: destinationText.trim(),
        recipient_phone: recipientPhone.replace(/\s+/g, ""),
        payment_by: paymentBy,
        is_round_trip: isRoundTrip ? 1 : 0,
        vehicle_type: selectedVehicle,
        parcel_description: finalDesc,
        distance_km: distanceKm,
        estimated_price: finalPrice,
      });

      if (res.data?.success || res.data?.order_id || res.status === 200) {
        const createdOrderId = res.data?.order_id || res.data?.id;
        setDestinationText("");
        setDeliveryCoords(null);
        setParcelDescription("");
        navigation.navigate("Orders", { newOrderId: createdOrderId });
      } else {
        Alert.alert("Info", res.data?.error || "Erreur lors de la création.");
      }
    } catch (e) {
      Alert.alert(
        "Erreur",
        e.response?.data?.error || "Impossible de créer la commande.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Google Maps JS avec nettoyage automatique et support Routes API + OSRM
  const googleMapsHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body, #map { width:100%; height:100%; overflow:hidden; background:#e5e7eb; }
      </style>
      <script>
        window.gm_authFailure = function() {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'GOOGLE_AUTH_FAILED' }));
          }
        };
      </script>
      <script src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry"></script>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map;
        var pickupMarker;
        var deliveryMarker;
        var directionsService;
        var directionsRenderer;
        var routePolyline = null; // Stocke le tracé pour pouvoir l'effacer au clic suivant

        function clearCurrentRoute() {
          if (directionsRenderer) {
            directionsRenderer.set('directions', null);
          }
          if (routePolyline) {
            routePolyline.setMap(null);
            routePolyline = null;
          }
        }

        function initMap() {
          var startPos = { lat: ${pickupCoords.lat}, lng: ${pickupCoords.lon} };
          map = new google.maps.Map(document.getElementById('map'), {
            center: startPos,
            zoom: 14,
            disableDefaultUI: true,
            gestureHandling: 'greedy'
          });

          directionsService = new google.maps.DirectionsService();
          directionsRenderer = new google.maps.DirectionsRenderer({
            map: map,
            suppressMarkers: true,
            polylineOptions: { strokeColor: '#EA580C', strokeWeight: 5, strokeOpacity: 0.9 }
          });

          pickupMarker = new google.maps.Marker({
            position: startPos,
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#16A34A',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3
            }
          });

          map.addListener('click', function(e) {
            var lat = e.latLng.lat();
            var lng = e.latLng.lng();
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'MAP_CLICK',
                lat: lat,
                lon: lng
              }));
            }
          });
        }

        // Fonction qui trace une vraie route via la nouvelle Routes API de Google ou OSRM
        function drawRealRoadFallback(pLat, pLon, dLat, dLon) {
          // 1. Appel à la nouvelle Routes API v2 (déjà activée sur votre compte GCC)
          fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': '${GOOGLE_MAPS_API_KEY}',
              'X-Goog-FieldMask': 'routes.distanceMeters,routes.polyline.encodedPolyline'
            },
            body: JSON.stringify({
              origin: { location: { latLng: { latitude: Number(pLat), longitude: Number(pLon) } } },
              destination: { location: { latLng: { latitude: Number(dLat), longitude: Number(dLon) } } },
              travelMode: 'DRIVE'
            })
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.routes && data.routes.length > 0) {
              clearCurrentRoute();
              var encoded = data.routes[0].polyline.encodedPolyline;
              var decodedPath = google.maps.geometry.encoding.decodePath(encoded);

              routePolyline = new google.maps.Polyline({
                path: decodedPath,
                geodesic: true,
                strokeColor: '#EA580C',
                strokeOpacity: 0.9,
                strokeWeight: 5,
                map: map
              });

              var bounds = new google.maps.LatLngBounds();
              decodedPath.forEach(function(pt) { bounds.extend(pt); });
              map.fitBounds(bounds, 50);

              var distKm = parseFloat((data.routes[0].distanceMeters / 1000).toFixed(1));
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'ROUTE_CALCULATED',
                  distance: distKm
                }));
              }
            } else {
              throw new Error('Routes API vide');
            }
          })
          .catch(function() {
            // 2. Secours routier réel via OSRM si Routes API échoue
            var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' +
              pLon + ',' + pLat + ';' + dLon + ',' + dLat +
              '?overview=full&geometries=geojson';

            fetch(osrmUrl)
              .then(function(r) { return r.json(); })
              .then(function(osrmData) {
                clearCurrentRoute();
                if (osrmData.routes && osrmData.routes.length > 0) {
                  var coords = osrmData.routes[0].geometry.coordinates.map(function(c) {
                    return { lat: c[1], lng: c[0] };
                  });
                  routePolyline = new google.maps.Polyline({
                    path: coords,
                    geodesic: true,
                    strokeColor: '#EA580C',
                    strokeOpacity: 0.9,
                    strokeWeight: 5,
                    map: map
                  });

                  var bounds = new google.maps.LatLngBounds();
                  coords.forEach(function(pt) { bounds.extend(pt); });
                  map.fitBounds(bounds, 50);

                  var distKm = parseFloat((osrmData.routes[0].distance / 1000).toFixed(1));
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'ROUTE_CALCULATED',
                      distance: distKm
                    }));
                  }
                }
              })
              .catch(function() {
                // 3. Dernier recours : Ligne droite unique (en nettoyant la précédente)
                clearCurrentRoute();
                routePolyline = new google.maps.Polyline({
                  path: [
                    { lat: Number(pLat), lng: Number(pLon) },
                    { lat: Number(dLat), lng: Number(dLon) }
                  ],
                  geodesic: true,
                  strokeColor: '#EA580C',
                  strokeOpacity: 0.8,
                  strokeWeight: 4,
                  map: map
                });
              });
          });
        }

        window.updateLivriliMap = function(data) {
          try {
            if (!map) return;
            if (data.pickup) {
              pickupMarker.setPosition({ lat: Number(data.pickup.lat), lng: Number(data.pickup.lon) });
            }
            if (data.delivery) {
              var dPos = { lat: Number(data.delivery.lat), lng: Number(data.delivery.lon) };
              if (!deliveryMarker) {
                deliveryMarker = new google.maps.Marker({
                  position: dPos,
                  map: map,
                  icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: '#DC2626',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 3
                  }
                });
              } else {
                deliveryMarker.setPosition(dPos);
              }

              // Nettoyage systématique de l'ancien tracé avant de calculer le nouveau
              clearCurrentRoute();

              directionsService.route({
                origin: new google.maps.LatLng(data.pickup.lat, data.pickup.lon),
                destination: new google.maps.LatLng(data.delivery.lat, data.delivery.lon),
                travelMode: google.maps.TravelMode.DRIVING
              }, function(result, status) {
                if (status === google.maps.DirectionsStatus.OK) {
                  clearCurrentRoute();
                  directionsRenderer.setDirections(result);
                  var meters = result.routes[0].legs[0].distance.value;
                  var distKm = parseFloat((meters / 1000).toFixed(1));
                  if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'ROUTE_CALCULATED',
                      distance: distKm
                    }));
                  }
                } else {
                  // Bascule immédiate sur Routes API v2 / OSRM pour tracer la vraie route
                  drawRealRoadFallback(data.pickup.lat, data.pickup.lon, data.delivery.lat, data.delivery.lon);
                }
              });
            } else {
              // Si on efface la destination (bouton X), on retire le marqueur rouge et la route
              if (deliveryMarker) {
                deliveryMarker.setMap(null);
                deliveryMarker = null;
              }
              clearCurrentRoute();
            }
          } catch(err) {}
        };

        window.onload = initMap;
      </script>
    </body>
    </html>
  `;

  // Leaflet / OpenStreetMap Fallback
  const leafletOsmHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body, #map { width:100%; height:100%; overflow:hidden; background:#e5e7eb; }
        .leaflet-control-attribution { display: none !important; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { zoomControl: false }).setView([${pickupCoords.lat}, ${pickupCoords.lon}], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

        var greenIcon = L.divIcon({
          html: '<div style="width:18px;height:18px;background:#16A34A;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>',
          className: '', iconSize: [22, 22], iconAnchor: [11, 11]
        });
        var redPinIcon = L.divIcon({
          html: '<div style="width:20px;height:20px;background:#DC2626;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>',
          className: '', iconSize: [24, 24], iconAnchor: [12, 12]
        });

        var pickupMarker = L.marker([${pickupCoords.lat}, ${pickupCoords.lon}], { icon: greenIcon }).addTo(map);
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
            if (data.pickup) {
              pickupMarker.setLatLng([data.pickup.lat, data.pickup.lon]);
            }
            if (data.delivery) {
              if (!deliveryMarker) {
                deliveryMarker = L.marker([data.delivery.lat, data.delivery.lon], { icon: redPinIcon }).addTo(map);
              } else {
                deliveryMarker.setLatLng([data.delivery.lat, data.delivery.lon]);
              }

              var osrmUrl = 'https://router.project-osrm.org/route/v1/driving/' +
                data.pickup.lon + ',' + data.pickup.lat + ';' +
                data.delivery.lon + ',' + data.delivery.lat +
                '?overview=full&geometries=geojson';

              fetch(osrmUrl)
                .then(function(res) { return res.json(); })
                .then(function(routeData) {
                  if (routeData.routes && routeData.routes.length > 0) {
                    if (routeLine) map.removeLayer(routeLine);
                    routeLine = L.geoJSON(routeData.routes[0].geometry, {
                      style: { color: '#EA580C', weight: 5, opacity: 0.9 }
                    }).addTo(map);
                    map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

                    var realDistanceKm = parseFloat((routeData.routes[0].distance / 1000).toFixed(1));
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'ROUTE_CALCULATED',
                        distance: realDistanceKm
                      }));
                    }
                  }
                })
                .catch(function() {
                  if (routeLine) map.removeLayer(routeLine);
                  routeLine = L.polyline([[data.pickup.lat, data.pickup.lon], [data.delivery.lat, data.delivery.lon]], {
                    color: '#EA580C', weight: 4, dashArray: '6, 6'
                  }).addTo(map);
                  map.fitBounds([[data.pickup.lat, data.pickup.lon], [data.delivery.lat, data.delivery.lon]], { padding: [50, 50] });
                });
            } else if (deliveryMarker) {
              map.removeLayer(deliveryMarker);
              deliveryMarker = null;
              if (routeLine) {
                map.removeLayer(routeLine);
                routeLine = null;
              }
            }
          } catch(e) {}
        };
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      {/* 1. CARTE (Pleine page en arrière-plan) */}
      <View style={styles.mapContainer}>
        <WebView
          key={isGoogleMapsActive ? "google-map" : "osm-map"}
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{
            html: isGoogleMapsActive ? googleMapsHtml : leafletOsmHtml,
          }}
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onLoadEnd={updateMapMarkers}
          onMessage={async (event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === "MAP_CLICK") {
                Keyboard.dismiss();
                setIsInputFocused(false);
                setSuggestions([]);
                const geo = await reverseGeocodeCoords(
                  msg.lat,
                  msg.lon,
                  isGoogleMapsActive,
                );
                // Si l'utilisateur avait sélectionné le départ, le clic modifie le départ
                if (activeField === "pickup") {
                  setPickupCoords({ lat: msg.lat, lon: msg.lon });
                  setPickupText(geo.address);
                  setPickupCommune(geo.commune);
                } else {
                  // Sinon, il modifie l'arrivée (comportement par défaut)
                  setDeliveryCoords({ lat: msg.lat, lon: msg.lon });
                  setDestinationText(geo.address);
                  setDeliveryCommune(geo.commune);
                }
              } else if (msg.type === "ROUTE_CALCULATED" && msg.distance > 0) {
                setDistanceKm(msg.distance);
              } else if (msg.type === "GOOGLE_AUTH_FAILED") {
                console.warn(
                  "Échec d'authentification Google Maps -> Bascule automatique sur OpenStreetMap",
                );
                setIsGoogleMapsActive(false);
              }
            } catch (e) {}
          }}
        />
      </View>

      {/* 2. BARRE DE DÉPART ET D'ARRIVÉE */}
      <View style={styles.topOverlay}>
        <View style={[styles.addressCard, { flexDirection: rowDir }]}>
          <View style={styles.timelineColumn}>
            <View style={styles.greenDot} />
            <View style={styles.verticalLine} />
            <View style={styles.redSquare} />
          </View>
          <View style={styles.inputsColumn}>
            {/* CHAMP DÉPART (MODIFIABLE) */}
            <View style={[styles.inputRow, { flexDirection: rowDir }]}>
              <TextInput
                style={[styles.addressInput, { textAlign: textAlignDir }]}
                value={pickupText}
                placeholder={t("pickupPlaceholder")}
                placeholderTextColor="#94A3B8"
                onFocus={() => {
                  setActiveField("pickup");
                  setIsInputFocused(true);
                }}
                onBlur={() => setIsInputFocused(false)}
                onChangeText={(txt) => handleSearchAddress(txt, "pickup")}
              />
              {pickupText.length > 0 && (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => {
                    setPickupText("");
                    setSuggestions([]);
                  }}
                >
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
              {/* ICÔNE GPS QUI SERT D'INDICATEUR DE MOTEUR */}
              <TouchableOpacity
                style={styles.gpsBtnIcon}
                onPress={() => triggerAutoGps(isGoogleMapsActive)}
              >
                <Animated.View style={{ opacity: blinkAnim }}>
                  <Ionicons name="locate" size={24} color={engineColor} />
                </Animated.View>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* CHAMP DESTINATION */}
            <View style={[styles.inputRow, { flexDirection: rowDir }]}>
              <TextInput
                style={[styles.addressInput, { textAlign: textAlignDir }]}
                placeholder={t("destinationPlaceholder")}
                placeholderTextColor="#94A3B8"
                value={destinationText}
                onFocus={() => {
                  setActiveField("destination");
                  setIsInputFocused(true);
                }}
                onBlur={() => setIsInputFocused(false)}
                onChangeText={(txt) => handleSearchAddress(txt, "destination")}
              />
              {destinationText.length > 0 && (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => {
                    setDestinationText("");
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

        {/* LISTE DES SUGGESTIONS D'ADRESSES */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsBox}>
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
                    name={item.isGoogle ? "logo-google" : "location-outline"}
                    size={18}
                    color={engineColor}
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

      {/* 3. PANNEAU INFÉRIEUR : Masqué automatiquement pendant la saisie d'adresse */}
      {!shouldHideBottomSheet && (
        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          <View style={[styles.vehiclesGridRow, { flexDirection: rowDir }]}>
            {vehicles.map((v) => {
              const isSelected = selectedVehicle === v.id;
              const title = isRTL && v.title_ar ? v.title_ar : v.title_fr;
              const iconColor = isSelected ? COLORS.primary : "#64748B";
              return (
                <TouchableOpacity
                  key={v.id}
                  activeOpacity={0.85}
                  onPress={() => setSelectedVehicle(v.id)}
                  style={[
                    styles.vehicleCompactBox,
                    isSelected && styles.vehicleCompactBoxSelected,
                  ]}
                >
                  {v.id === "moto" ? (
                    <Fontisto name="motorcycle" size={24} color={iconColor} />
                  ) : (
                    <MaterialCommunityIcons
                      name={v.icon || "truck-flatbed"}
                      size={26}
                      color={iconColor}
                    />
                  )}
                  <Text
                    style={[
                      styles.vehicleSmallTitle,
                      isSelected && styles.vehicleSmallTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 4. BOUTON COMMANDER */}
          <TouchableOpacity
            style={styles.bookNowBtnFull}
            onPress={handleOpenOrderPopup}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <View style={[styles.btnPriceRow, { flexDirection: rowDir }]}>
                <Text style={styles.bookNowText}>
                  {t("bookNow")} (~{distanceKm} km)
                </Text>
                <View
                  style={[
                    styles.priceTagBadge,
                    isRTL ? { marginRight: 10 } : { marginLeft: 10 },
                  ]}
                >
                  <Text style={styles.priceTagText}>{finalPrice} DA</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* 5. MODAL DE CONFIRMATION */}
      <Modal visible={detailsModalVisible} animationType="fade" transparent>
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <View style={[styles.modalHeaderRow, { flexDirection: rowDir }]}>
              <Text
                style={[
                  styles.popupSectionTitle,
                  { textAlign: textAlignDir, marginBottom: 0 },
                ]}
              >
                {t("modalParcelTitle")}
              </Text>
              <TouchableOpacity
                style={styles.closeBtnIcon}
                onPress={() => setDetailsModalVisible(false)}
              >
                <Ionicons name="close" size={22} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text
                style={[
                  styles.inputSubLabel,
                  { textAlign: textAlignDir, marginTop: 8 },
                ]}
              >
                {t("whatToSend")}
              </Text>
              <View style={[styles.parcelGridRow, { flexDirection: rowDir }]}>
                {PARCEL_TYPES.map((pt) => {
                  const selected = selectedParcelType === pt.key;
                  return (
                    <TouchableOpacity
                      key={pt.key}
                      style={[
                        styles.parcelGridBox,
                        selected && styles.parcelGridBoxSelected,
                        { flexDirection: rowDir },
                      ]}
                      onPress={() => setSelectedParcelType(pt.key)}
                    >
                      <View
                        style={[
                          styles.radioOuter,
                          selected && styles.radioOuterSelected,
                          isRTL
                            ? { marginLeft: 8, marginRight: 0 }
                            : { marginRight: 8, marginLeft: 0 },
                        ]}
                      >
                        {selected && <View style={styles.radioInner} />}
                      </View>
                      <Ionicons
                        name={pt.icon}
                        size={17}
                        color={selected ? COLORS.primary : "#64748B"}
                        style={
                          isRTL
                            ? { marginLeft: 8, marginRight: 0 }
                            : { marginRight: 8, marginLeft: 0 }
                        }
                      />
                      <Text
                        style={[
                          styles.radioLabel,
                          selected && styles.radioLabelSelected,
                          { textAlign: textAlignDir, flex: 1 },
                        ]}
                        numberOfLines={1}
                      >
                        {pt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text
                style={[
                  styles.inputSubLabel,
                  { textAlign: textAlignDir, marginTop: 12 },
                ]}
              >
                {t("recipientPhoneRequired")}
              </Text>
              <TextInput
                style={[
                  styles.popupInput,
                  { textAlign: textAlignDir },
                  phoneErrorText
                    ? { borderColor: COLORS.danger, backgroundColor: "#FEF2F2" }
                    : null,
                ]}
                placeholder="05 / 06 / 07 XX XX XX XX"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                maxLength={10}
                value={recipientPhone}
                onChangeText={(txt) => {
                  const cleaned = txt.replace(/[^0-9]/g, "");
                  setRecipientPhone(cleaned);
                  if (isValidAlgerianMobile(cleaned)) setPhoneErrorText("");
                }}
              />
              {phoneErrorText ? (
                <Text style={[styles.errorHelper, { textAlign: textAlignDir }]}>
                  {phoneErrorText}
                </Text>
              ) : null}

              <TextInput
                style={[
                  styles.popupInput,
                  { textAlign: textAlignDir, marginTop: 10 },
                ]}
                placeholder={t("parcelDetailsPlaceholder")}
                placeholderTextColor="#94A3B8"
                value={parcelDescription}
                onChangeText={setParcelDescription}
              />

              <View style={[styles.switchRow, { flexDirection: rowDir }]}>
                <Text style={styles.radioLabel}>{t("roundTrip")}</Text>
                <Switch
                  value={isRoundTrip}
                  onValueChange={setIsRoundTrip}
                  trackColor={{ false: "#CBD5E1", true: COLORS.primary }}
                />
              </View>

              <View style={[styles.paymentRow, { flexDirection: rowDir }]}>
                <TouchableOpacity
                  style={[
                    styles.paymentChip,
                    paymentBy === "sender" && styles.paymentChipActive,
                  ]}
                  onPress={() => setPaymentBy("sender")}
                >
                  <Text
                    style={[
                      styles.paymentChipText,
                      paymentBy === "sender" && styles.paymentChipTextActive,
                    ]}
                  >
                    {t("payBySender")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.paymentChip,
                    paymentBy === "recipient" && styles.paymentChipActive,
                  ]}
                  onPress={() => setPaymentBy("recipient")}
                >
                  <Text
                    style={[
                      styles.paymentChipText,
                      paymentBy === "recipient" && styles.paymentChipTextActive,
                    ]}
                  >
                    {t("payByRecipient")}
                  </Text>
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.actionButtonsContainer,
                  { flexDirection: rowDir },
                ]}
              >
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setDetailsModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.popupOkBtn}
                  onPress={handleConfirmOrder}
                >
                  <Text style={styles.popupBtnText}>{t("validateBtn")}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E5E7EB" },
  mapContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "88%",
    zIndex: 1,
  },
  map: { flex: 1, width: "100%", height: "100%" },
  topOverlay: {
    paddingTop: Platform.OS === "ios" ? 48 : 36,
    paddingHorizontal: 14,
    zIndex: 20,
  },
  addressCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...SHADOWS.card,
  },
  timelineColumn: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    paddingVertical: 10,
  },
  greenDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#16A34A",
  },
  verticalLine: {
    width: 2,
    flex: 1,
    backgroundColor: "#94A3B8",
    marginVertical: 4,
  },
  redSquare: { width: 12, height: 12, backgroundColor: "#DC2626" },
  inputsColumn: { flex: 1, justifyContent: "center" },
  inputRow: { alignItems: "center", minHeight: 46, paddingHorizontal: 4 },
  addressInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: "#0F172A",
    fontWeight: "600",
    paddingVertical: 8,
    includeFontPadding: false,
  },
  clearBtn: { padding: 4, marginHorizontal: 2 },
  gpsBtnIcon: { padding: 6, marginHorizontal: 2 },
  divider: { height: 1, backgroundColor: "#CBD5E1", marginVertical: 2 },
  suggestionsBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginTop: 8,
    maxHeight: 200,
    ...SHADOWS.card,
  },
  suggestionItem: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  suggestionText: {
    fontSize: 14,
    fontFamily: FONTS.medium,
    color: "#0F172A",
    fontWeight: "600",
    flex: 1,
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    zIndex: 10,
    ...SHADOWS.floating,
  },
  sheetHandle: {
    width: 50,
    height: 5,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 10,
  },
  vehiclesGridRow: { justifyContent: "space-between", marginBottom: 12 },
  vehicleCompactBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  vehicleCompactBoxSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  vehicleSmallTitle: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    fontWeight: "800",
    color: "#475569",
    marginTop: 4,
  },
  vehicleSmallTitleActive: { color: COLORS.primary },
  bookNowBtnFull: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.card,
  },
  btnPriceRow: { alignItems: "center", justifyContent: "center" },
  bookNowText: {
    color: "#FFFFFF",
    fontFamily: FONTS.bold,
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  priceTagBadge: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 10,
  },
  priceTagText: {
    color: COLORS.primary,
    fontFamily: FONTS.bold,
    fontWeight: "900",
    fontSize: 14,
  },
  popupBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  popupCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    maxHeight: "88%",
    ...SHADOWS.floating,
  },
  modalHeaderRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  closeBtnIcon: { padding: 4 },
  popupSectionTitle: {
    fontSize: 16,
    fontFamily: FONTS.bold,
    fontWeight: "900",
    color: "#0F172A",
  },
  inputSubLabel: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    fontWeight: "800",
    color: "#334155",
    marginBottom: 6,
  },
  parcelGridRow: {
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  parcelGridBox: {
    width: "48.5%",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  parcelGridBoxSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  radioLabel: {
    fontSize: 12,
    fontFamily: FONTS.medium,
    color: "#334155",
    fontWeight: "700",
  },
  radioLabelSelected: {
    color: COLORS.primary,
    fontWeight: "800",
  },
  popupInput: {
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  errorHelper: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  switchRow: {
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 10,
  },
  paymentRow: { justifyContent: "space-between", marginBottom: 14 },
  paymentChip: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    alignItems: "center",
    marginHorizontal: 4,
  },
  paymentChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  paymentChipText: {
    fontSize: 13,
    fontFamily: FONTS.bold,
    color: "#64748B",
    fontWeight: "700",
  },
  paymentChipTextActive: { color: COLORS.primary, fontWeight: "900" },
  actionButtonsContainer: {
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginRight: 6,
  },
  cancelBtnText: {
    color: "#475569",
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: "800",
  },
  popupOkBtn: {
    flex: 1.4,
    backgroundColor: "#16A34A",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginLeft: 6,
  },
  popupBtnText: {
    color: "#FFFFFF",
    fontFamily: FONTS.bold,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
});
