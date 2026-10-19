// src/screens/customer/NewOrderScreen.js
import React, { useState, useContext, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Dimensions,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthContext } from "../../context/AuthContext";
import API from "../../api/client";
import { requestPhoneNumber } from "react-native-phone-number-hint";

const { width } = Dimensions.get("window");

const VEHICLES = [
  {
    id: "moto",
    label: "Moto Express",
    desc: "Petits colis (< 10kg)",
    icon: "motorbike",
    price: "250 DA",
  },
  {
    id: "voiture",
    label: "Voiture",
    desc: "Cartons & repas (< 40kg)",
    icon: "car",
    price: "450 DA",
  },
  {
    id: "camionnette",
    label: "Camionnette",
    desc: "Moyen volume (DFSK)",
    icon: "truck-cargo-container",
    price: "900 DA",
  },
  {
    id: "fourgon",
    label: "Fourgon",
    desc: "Meubles & palettes",
    icon: "truck",
    price: "1500 DA",
  },
];

export default function NewOrderScreen({ navigation }) {
  const { user, setUser } = useContext(AuthContext);

  const [pickupAddr, setPickupAddr] = useState("Centre-ville, El Eulma");
  const [deliveryAddr, setDeliveryAddr] = useState("");
  const [description, setDescription] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState("moto");
  const [isRoundTrip, setIsRoundTrip] = useState(false);

  // Modal d'exigence du numéro de téléphone au 1er ordre
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [inputPhone, setInputPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const handleOrderPress = () => {
    // Si l'utilisateur n'a pas encore de numéro de téléphone en base, ouvrir la boîte modale
    if (!user?.phone) {
      setPhoneModalVisible(true);
      return;
    }
    proceedWithOrder();
  };

  const saveUserPhone = async () => {
    const clean = inputPhone.replace(/[^\d]/g, "");
    if (
      clean.length !== 10 ||
      !["05", "06", "07"].some((p) => clean.startsWith(p))
    ) {
      Alert.alert(
        "Numéro invalide",
        "Indiquez un numéro valide (05, 06 ou 07).",
      );
      return;
    }

    setSavingPhone(true);
    try {
      const res = await API.post("auth.php?action=update_phone", {
        phone: clean,
      });
      if (res.data.success) {
        setUser((prev) => ({ ...prev, phone: clean }));
        setPhoneModalVisible(false);
        Alert.alert("Numéro enregistré !", "Votre profil a été mis à jour.");
        proceedWithOrder();
      } else {
        Alert.alert("Erreur", res.data.error);
      }
    } catch (e) {
      Alert.alert("Erreur", "Impossible de joindre le serveur.");
    } finally {
      setSavingPhone(false);
    }
  };

  const proceedWithOrder = async () => {
    if (!deliveryAddr || !description) {
      Alert.alert(
        "Champs requis",
        "Veuillez préciser l'adresse d'arrivée et l'objet à livrer.",
      );
      return;
    }

    try {
      const payload = {
        pickup_address: pickupAddr,
        pickup_lat: 36.1528,
        pickup_lon: 5.6902,
        delivery_address: deliveryAddr,
        recipient_phone: "0555000000",
        vehicle_type: selectedVehicle,
        parcel_description: description,
        payment_by: "sender",
        is_round_trip: isRoundTrip ? 1 : 0,
      };

      const res = await API.post("customer.php?action=create_order", payload);
      if (res.data.success) {
        Alert.alert(
          "Course demandée !",
          `Course #${res.data.code} transmise aux coursiers.`,
        );
        navigation.navigate("Orders");
      }
    } catch (e) {
      Alert.alert("Erreur", "Échec de transmission de la course.");
    }
  };

  // Fonction appelée quand le client n'a pas encore de numéro
  const retrieveVerifiedPhone = async () => {
    try {
      // Affiche la boîte de dialogue système Google Play Services
      const rawNumber = await requestPhoneNumber();

      if (rawNumber) {
        // Nettoie l'indicatif international (+213 -> 0)
        let clean = rawNumber.replace(/[^\d]/g, "");
        if (clean.startsWith("213")) {
          clean = "0" + clean.substring(3);
        }

        // 1. Mise à jour automatique de l'interface
        setInputPhone(clean);

        // 2. Synchronisation immédiate en BDD
        const res = await API.post("auth.php?action=update_phone", {
          phone: clean,
        });
        if (res.data.success) {
          setUser((prev) => ({ ...prev, phone: clean }));
          setPhoneModalVisible(false);
          // Poursuit la publication de la course automatiquement
          proceedWithOrder();
        }
      }
    } catch (error) {
      // Si l'utilisateur annule ou si le service n'est pas dispo, on le laisse taper manuellement
      console.log("Saisie manuelle requise");
    }
  };

  return (
    <View style={styles.container}>
      {/* Carte en arrière-plan */}
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 36.1528,
          longitude: 5.6902,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <Marker
          coordinate={{ latitude: 36.1528, longitude: 5.6902 }}
          title="Départ"
          pinColor="#FF6B4A"
        />
      </MapView>

      {/* Carte supérieure des adresses[cite: 13] */}
      <View style={styles.addressCard}>
        <View style={styles.addrRow}>
          <Ionicons name="radio-button-on" size={18} color="#22C55E" />
          <TextInput
            style={styles.addrInput}
            value={pickupAddr}
            onChangeText={setPickupAddr}
            placeholder="Point de ramassage"
          />
        </View>
        <View style={styles.addrDivider} />
        <View style={styles.addrRow}>
          <Ionicons name="location" size={18} color="#FF6B4A" />
          <TextInput
            style={styles.addrInput}
            value={deliveryAddr}
            onChangeText={setDeliveryAddr}
            placeholder="Adresse d'arrivée (ex: Cité 500 logts)"
          />
        </View>
      </View>

      {/* Sélecteur inférieur de véhicules et commande[cite: 13] */}
      <View style={styles.bottomSheet}>
        <TextInput
          style={styles.descInput}
          placeholder="Que transportez-vous ? (ex: Clés, Pièce auto, Repas...)"
          value={description}
          onChangeText={setDescription}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.vehicleScroll}
        >
          {VEHICLES.map((v) => (
            <TouchableOpacity
              key={v.id}
              style={[
                styles.vCard,
                selectedVehicle === v.id && styles.vCardActive,
              ]}
              onPress={() => setSelectedVehicle(v.id)}
            >
              <MaterialCommunityIcons
                name={v.icon}
                size={32}
                color={selectedVehicle === v.id ? "#FF6B4A" : "#64748B"}
              />
              <Text style={styles.vTitle}>{v.label}</Text>
              <Text style={styles.vDesc}>{v.desc}</Text>
              <Text style={styles.vPrice}>{v.price}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.orderBtn} onPress={handleOrderPress}>
          <Text style={styles.orderBtnText}>Commander maintenant</Text>
        </TouchableOpacity>
      </View>

      {/* Modal : Exigence du numéro de téléphone avant commande */}
      <Modal visible={phoneModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="shield-checkmark" size={32} color="#FF6B4A" />
            </View>

            <Text style={styles.modalTitle}>Vérification du Téléphone</Text>
            <Text style={styles.modalDesc}>
              Pour valider votre commande et permettre au coursier de vous
              localiser, associez votre numéro mobile :
            </Text>

            {/* Bouton 1-clic façon Telegram */}
            <TouchableOpacity
              style={styles.btnShareSim}
              onPress={retrieveVerifiedPhone}
            >
              <Ionicons
                name="phone-portrait-outline"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.btnShareSimText}>
                Partager mon numéro SIM
              </Text>
            </TouchableOpacity>

            <View style={styles.dividerBox}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OU SAISIR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TextInput
              style={styles.phoneInput}
              placeholder="05 / 06 / 07 XX XX XX"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={10}
              value={inputPhone}
              onChangeText={setInputPhone}
            />

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={saveUserPhone}
              disabled={savingPhone}
            >
              <Text style={styles.modalSaveText}>Valider et continuer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: "100%", height: "100%" },
  addressCard: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  addrRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  addrInput: { flex: 1, marginLeft: 10, fontSize: 14, color: "#1E293B" },
  addrDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 6,
    marginLeft: 28,
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  descInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  vehicleScroll: { marginBottom: 12 },
  vCard: {
    width: 140,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "#FFFFFF",
  },
  vCardActive: { borderColor: "#FF6B4A", backgroundColor: "#FFF5F2" },
  vTitle: { fontSize: 13, fontWeight: "bold", color: "#1E293B", marginTop: 4 },
  vDesc: {
    fontSize: 10,
    color: "#64748B",
    textAlign: "center",
    marginVertical: 2,
  },
  vPrice: { fontSize: 13, fontWeight: "800", color: "#FF6B4A", marginTop: 2 },
  orderBtn: {
    backgroundColor: "#FF6B4A",
    borderRadius: 14,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  orderBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "bold" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  modalIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFF0EC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#1E293B",
    textAlign: "center",
  },
  modalDesc: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginVertical: 10,
    lineHeight: 18,
  },
  phoneInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    fontSize: 18,
    textAlign: "center",
    fontWeight: "bold",
    marginVertical: 14,
  },
  modalSaveBtn: {
    backgroundColor: "#FF6B4A",
    width: "100%",
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  modalSaveText: { color: "#FFFFFF", fontWeight: "bold", fontSize: 15 },

  // Styles à ajouter pour le bouton SIM
  btnShareSim: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E293B",
    borderRadius: 14,
    height: 50,
    width: "100%",
    gap: 10,
    marginTop: 6,
  },
  btnShareSimText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
});
