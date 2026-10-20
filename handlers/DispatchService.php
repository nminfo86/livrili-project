<?php
// handlers/DispatchService.php

class DispatchService
{
    private $pdo;
    private $bot_token;

    public function __construct(PDO $pdo, string $bot_token)
    {
        $this->pdo = $pdo;
        $this->bot_token = $bot_token;
    }

    /**
     * Récupère tous les modes de transport actifs depuis la BDD
     */
    public function getActiveTransportModes(): array
    {
        try {
            $stmt = $this->pdo->query("
                SELECT * FROM transport_modes 
                WHERE is_active = 1 
                ORDER BY sort_order ASC
            ");
            $modes = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
            if (!empty($modes)) {
                return $modes;
            }
        } catch (Exception $e) {
        }

        // Fallback de sécurité si la table n'est pas encore créée
        return [
            [
                'id' => 'moto', 'title_fr' => 'Moto', 'icon' => 'motorbike', 'color' => '#006233',
                'pricing_mode' => 'per_km', 'base_price' => 200, 'base_km' => 2, 'commune_max_km' => 5,
                'per_km' => 50, 'round_trip_multiplier' => 1.6, 'search_radius_km' => 4, 'bid_step' => 50
            ],
            [
                'id' => 'camionnette', 'title_fr' => 'Harbin / Chana', 'icon' => 'truck-flatbed', 'color' => '#D97706',
                'pricing_mode' => 'flat_commune', 'base_price' => 600, 'base_km' => 2, 'commune_max_km' => 5,
                'per_km' => 100, 'round_trip_multiplier' => 1.5, 'search_radius_km' => 8, 'bid_step' => 100
            ],
            [
                'id' => 'fourgon', 'title_fr' => 'Fourgon', 'icon' => 'truck-delivery', 'color' => '#4F46E5',
                'pricing_mode' => 'flat_commune', 'base_price' => 900, 'base_km' => 2, 'commune_max_km' => 5,
                'per_km' => 150, 'round_trip_multiplier' => 1.5, 'search_radius_km' => 10, 'bid_step' => 200
            ]
        ];
    }

    /**
     * Récupère la configuration d'un véhicule précis
     */
    public function getVehicleConfig(string $vehicleType): array
    {
        try {
            $stmt = $this->pdo->prepare("SELECT * FROM transport_modes WHERE id = :id LIMIT 1");
            $stmt->execute(['id' => $vehicleType]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) return $row;
        } catch (Exception $e) {
        }

        $defaults = $this->getActiveTransportModes();
        foreach ($defaults as $d) {
            if ($d['id'] === $vehicleType) return $d;
        }
        return $defaults[0];
    }

    /**
     * Arrondit vers les 50 DA suivants si le reste dépasse 10 DA
     * Ex: 210 -> 200 | 211 -> 250 | 670 -> 700
     */
    public function roundPriceTo50(float $rawPrice, float $minPrice): float
    {
        if ($rawPrice <= $minPrice) {
            return (float)(ceil(($minPrice - 10) / 50) * 50);
        }
        $rounded = ceil(($rawPrice - 10) / 50) * 50;
        return (float)max($minPrice, $rounded);
    }

    /**
     * Calcul du tarif suggéré selon les paramètres BDD
     */
    public function calculateSuggestedPrice(
        float $lat1,
        float $lon1,
        ?float $lat2,
        ?float $lon2,
        string $vehicleType = 'moto',
        bool $isRoundTrip = false,
        string $pickupCommune = 'El Eulma',
        ?string $deliveryCommune = null
    ): array {
        $vConfig        = $this->getVehicleConfig($vehicleType);
        $pricingMode    = $vConfig['pricing_mode'] ?? 'per_km';
        $basePrice      = (float)($vConfig['base_price'] ?? 200);
        $baseKm         = (float)($vConfig['base_km'] ?? 2.0);
        $communeMaxKm   = (float)($vConfig['commune_max_km'] ?? 5.0);
        $perKm          = (float)($vConfig['per_km'] ?? 50.0);
        $rtMultiplier   = (float)($vConfig['round_trip_multiplier'] ?? 1.6);

        if (!$lat2 || !$lon2) {
            $raw = $isRoundTrip ? ($basePrice * $rtMultiplier) : $basePrice;
            return [
                'distance_km'     => 0.0,
                'suggested_price' => $this->roundPriceTo50($raw, $basePrice)
            ];
        }

        // Distance Haversine (aller simple * 1.3 pour route réelle)
        $earthRadius = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) * sin($dLat / 2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLon / 2) * sin($dLon / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        $oneWayDistance = max(1.0, round(($earthRadius * $c) * 1.3, 1));

        // Vérifier si même commune
        $sameCommune = true;
        if (!empty($pickupCommune) && !empty($deliveryCommune)) {
            $sameCommune = (mb_strtolower(trim($pickupCommune)) === mb_strtolower(trim($deliveryCommune)));
        }

        if ($pricingMode === 'flat_commune') {
            // Mode Camionnette / Fourgon : prix fixe si même commune ET rayon <= commune_max_km (ex: 5km)
            if ($sameCommune && $oneWayDistance <= $communeMaxKm) {
                $fee = $basePrice;
            } else {
                // Hors commune ou au-delà du rayon de 5km
                $extraKm = max(0.0, $oneWayDistance - $communeMaxKm);
                $fee = $basePrice + ($extraKm * $perKm);
            }

            if ($isRoundTrip) {
                $fee *= $rtMultiplier;
            }

            $routeDistance = $isRoundTrip ? round($oneWayDistance * 2, 1) : $oneWayDistance;
        } else {
            // Mode Moto / Voiture : calcul au km
            $routeDistance = $isRoundTrip ? round($oneWayDistance * 2, 1) : $oneWayDistance;
            $fee = ($routeDistance <= $baseKm)
                ? $basePrice
                : $basePrice + (($routeDistance - $baseKm) * $perKm);

            if ($isRoundTrip && $fee <= $basePrice) {
                $fee = $basePrice * $rtMultiplier;
            }
        }

        $finalPrice = $this->roundPriceTo50($fee, $basePrice);

        return [
            'distance_km'     => $routeDistance,
            'suggested_price' => $finalPrice
        ];
    }

    public function dispatchParcelToDrivers(int $parcel_id, int $maxDrivers = 10): array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM parcel_orders WHERE id = :pid LIMIT 1");
        $stmt->execute(['pid' => $parcel_id]);
        $parcel = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$parcel || $parcel['status'] !== 'SEARCHING') {
            return ['success' => false, 'reason' => 'order_not_searching'];
        }

        $lat         = (float)$parcel['pickup_lat'];
        $lon         = (float)$parcel['pickup_lon'];
        $commune     = $parcel['pickup_commune'];
        $vehicleType = $parcel['vehicle_type'];

        $selectedTypes = array_filter(array_map('trim', explode(',', $vehicleType)));
        if (empty($selectedTypes)) $selectedTypes = ['moto'];

        // Récupérer le rayon max et infos depuis la BDD
        $maxDist = 4.0;
        $firstVConfig = $this->getVehicleConfig($selectedTypes[0]);
        foreach ($selectedTypes as $vt) {
            $cfg = $this->getVehicleConfig($vt);
            $rad = (float)($cfg['search_radius_km'] ?? 4.0);
            if ($rad > $maxDist) {
                $maxDist = $rad;
            }
        }

        $sqlDrivers = "
            SELECT dp.id, dp.full_name, tu.push_token, tu.telegram_id, dp.rating, dp.vehicle_type,
                   IF(tu.latitude IS NOT NULL AND tu.longitude IS NOT NULL,
                      (6371 * acos(cos(radians(:lat)) * cos(radians(tu.latitude)) * cos(radians(tu.longitude) - radians(:lon)) + sin(radians(:lat)) * sin(radians(tu.latitude)))),
                      3.0
                   ) AS dist_km
            FROM driver_profiles dp
            JOIN telegram_users tu ON dp.telegram_user_id = tu.id
            WHERE dp.is_online = 1
                AND dp.verification_status = 'approved'
                AND FIND_IN_SET(dp.vehicle_type, :vtypes) > 0
                AND tu.latitude IS NOT NULL
                AND tu.gps_updated_at >= (NOW() - INTERVAL 15 MINUTE)
                AND (dp.commune_name = :commune OR tu.latitude IS NOT NULL)
                AND dp.id NOT IN (SELECT driver_id FROM parcel_bids WHERE parcel_order_id = :pid)
                AND dp.id NOT IN (
                    SELECT selected_driver_id 
                    FROM parcel_orders 
                    WHERE selected_driver_id IS NOT NULL 
                      AND status IN ('DRIVER_ASSIGNED', 'PICKED_UP')
                      AND DATE(created_at) = CURDATE()
                )
            HAVING dist_km <= :max_dist
            ORDER BY (dp.rating * 0.6 - dist_km * 6.0) DESC, dp.last_assigned_at ASC
            LIMIT " . (int)$maxDrivers;

        $stmtDrv = $this->pdo->prepare($sqlDrivers);
        $stmtDrv->execute([
            'lat'      => $lat,
            'lon'      => $lon,
            'vtypes'   => implode(',', $selectedTypes),
            'commune'  => $commune,
            'pid'      => $parcel_id,
            'max_dist' => $maxDist
        ]);

        $drivers = $stmtDrv->fetchAll(PDO::FETCH_ASSOC);

        if (empty($drivers)) {
            return ['success' => false, 'notified_count' => 0];
        }

        $targetChatIds = array_filter(array_column($drivers, 'telegram_id'));
        $driverIds     = array_column($drivers, 'id');

        $placeholders = implode(',', array_fill(0, count($driverIds), '?'));
        $this->pdo->prepare("UPDATE driver_profiles SET last_assigned_at = NOW() WHERE id IN ($placeholders)")
            ->execute($driverIds);

        $vLabel = $firstVConfig['title_fr'] ?? ucfirst($vehicleType);
        $pickupMapsUrl = "https://www.google.com/maps?q={$lat},{$lon}";
        $destMapsHtml  = (!empty($parcel['delivery_lat']) && !empty($parcel['delivery_lon']))
            ? " (<a href='https://www.google.com/maps/dir/{$lat},{$lon}/{$parcel['delivery_lat']},{$parcel['delivery_lon']}'>Itinéraire Maps</a>)"
            : "";

        $distText = ((float)$parcel['distance_km'] > 0) ? " (~" . (float)$parcel['distance_km'] . " km)" : "";
        $estPrice = (float)$parcel['estimated_price'];
        $isRoundTrip = !empty($parcel['is_round_trip']);
        $tripTag = $isRoundTrip ? "🔄 <b>TRAJET ALLER-RETOUR</b>\n" : "";

        $msg  = "📦 <b>NOUVELLE COURSE LIVRILI ({$parcel['code']})</b>\n\n";
        $msg .= "🚗 Véhicule : <b>{$vLabel}</b>{$distText}\n";
        $msg .= $tripTag;
        $msg .= "📍 Départ : <b>" . htmlspecialchars($parcel['pickup_address']) . "</b> (<a href='{$pickupMapsUrl}'>GPS</a>)\n";
        $msg .= "🏁 Arrivée : <b>" . htmlspecialchars($parcel['delivery_address']) . "</b>{$destMapsHtml}\n";
        if ($isRoundTrip) {
            $msg .= "⚠️ <i>Le coursier doit revenir au point de départ (Documents/Échange/Retour).</i>\n";
        }
        $msg .= "📝 Objet : <i>" . htmlspecialchars($parcel['parcel_description']) . "</i>\n";
        $msg .= "💰 Tarif proposé : <b>" . number_format($estPrice, 0, '.', ' ') . " DA</b>\n\n";

        $step = (int)($firstVConfig['bid_step'] ?? 50);
        $p1 = (int)$estPrice;
        $p2 = (int)($estPrice + $step);
        $p3 = (int)($estPrice + ($step * 2));
        $p4 = (int)($estPrice + ($step * 3));

        $keyboard = [
            'inline_keyboard' => [
                [
                    ['text' => "✅ {$p1} DA", 'callback_data' => "livrili_bid_{$parcel_id}_{$p1}"],
                    ['text' => "💵 {$p2} DA", 'callback_data' => "livrili_bid_{$parcel_id}_{$p2}"]
                ],
                [
                    ['text' => "💵 {$p3} DA", 'callback_data' => "livrili_bid_{$parcel_id}_{$p3}"],
                    ['text' => "💵 {$p4} DA", 'callback_data' => "livrili_bid_{$parcel_id}_{$p4}"]
                ],
                [['text' => "🎛 Tableau de bord", 'callback_data' => 'dash']]
            ]
        ];

        if (!empty($targetChatIds)) {
            $this->broadcastToDrivers('sendMessage', $targetChatIds, [
                'text'                     => $msg,
                'parse_mode'               => 'HTML',
                'disable_web_page_preview' => true,
                'reply_markup'             => $keyboard
            ]);
        }

        foreach ($drivers as $drv) {
            if (!empty($drv['push_token'])) {
                sendPushNotification(
                    $drv['push_token'],
                    "📦 Nouvelle course disponible !",
                    "Départ : {$parcel['pickup_address']} ({$parcel['estimated_price']} DA)",
                    ['type' => 'new_order', 'order_id' => $parcel_id]
                );
            }
        }

        return ['success' => true, 'notified_count' => count($drivers)];
    }

    private function broadcastToDrivers(string $method, array $chatIds, array $basePayload)
    {
        $chatIds = array_values(array_unique($chatIds));
        if (empty($chatIds)) return;

        $apiUrl = "https://api.telegram.org/bot{$this->bot_token}/{$method}";
        $mh = curl_multi_init();
        $handles = [];

        foreach ($chatIds as $cid) {
            $payload = $basePayload;
            $payload['chat_id'] = $cid;
            $ch = curl_init($apiUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 3);
            curl_setopt($ch, CURLOPT_NOSIGNAL, 1);
            curl_multi_add_handle($mh, $ch);
            $handles[] = $ch;
        }

        $running = null;
        do {
            curl_multi_exec($mh, $running);
        } while ($running);

        foreach ($handles as $ch) {
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);
    }
}