<?php

class DispatchService
{
    private $pdo;
    private $bot_token;

    public function __construct(PDO $pdo, string $bot_token)
    {
        $this->pdo = $pdo;
        $this->bot_token = $bot_token;
    }

    // Remplacer la signature et le calcul de distance dans calculateSuggestedPrice :
    public function calculateSuggestedPrice(
        float $lat1,
        float $lon1,
        ?float $lat2,
        ?float $lon2,
        string $vehicleType = 'moto',
        bool $isRoundTrip = false
    ): array {
        $settings = [
            'base_km'         => 2.0,
            'moto_min_fee'    => 200.0,
            'moto_per_km'     => 50.0,
            'voiture_min_fee' => 350.0,
            'voiture_per_km'  => 70.0,
            'fourgon_min_fee' => 900.0,
            'fourgon_per_km'  => 150.0
        ];

        try {
            $stmt = $this->pdo->query("SELECT setting_key, setting_value FROM platform_settings");
            if ($stmt) {
                $dbConfig = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
                foreach ($settings as $k => $v) {
                    if (isset($dbConfig[$k])) $settings[$k] = (float)$dbConfig[$k];
                }
            }
        } catch (Exception $e) {
        }

        $baseKm = $settings['base_km'];
        if ($vehicleType === 'fourgon') {
            $minFee = $settings['fourgon_min_fee'];
            $perKm  = $settings['fourgon_per_km'];
        } elseif ($vehicleType === 'voiture') {
            $minFee = $settings['voiture_min_fee'];
            $perKm  = $settings['voiture_per_km'];
        } else {
            $minFee = $settings['moto_min_fee'];
            $perKm  = $settings['moto_per_km'];
        }

        if (!$lat2 || !$lon2) {
            $price = $isRoundTrip ? ($minFee * 1.8) : $minFee;
            return ['distance_km' => 0.0, 'suggested_price' => $price];
        }

        $earthRadius = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) * sin($dLat / 2) + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) * sin($dLon / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        $oneWayDistance = round(($earthRadius * $c) * 1.3, 1);

        // Si Aller-Retour, la distance totale est doublée
        $routeDistance = $isRoundTrip ? round($oneWayDistance * 2, 1) : $oneWayDistance;

        // Calcul du tarif basé sur les km réels
        $fee = ($routeDistance <= $baseKm) ? $minFee : $minFee + (($routeDistance - $baseKm) * $perKm);

        // Si Aller-Retour sur courte distance (< baseKm), appliquer une majoration minimale de retour
        if ($isRoundTrip && $fee <= $minFee) {
            $fee = $minFee * 1.6;
        }

        $fee = (float)max($minFee, ceil(($fee - 10) / 50) * 50);

        return ['distance_km' => $routeDistance, 'suggested_price' => $fee];
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

        // 1. Rayon et Tarifs adaptés
        $radiusMap = [
            'moto'        => 4.0,
            'voiture'     => 6.0,
            'camionnette' => 8.0,
            'fourgon'     => 10.0
        ];

        // Si le client a coché "moto,voiture", on découpe en tableau
        $selectedTypes = array_filter(array_map('trim', explode(',', $parcel['vehicle_type'])));
        if (empty($selectedTypes)) $selectedTypes = ['moto'];

        // On retient le rayon le plus grand parmi les véhicules choisis
        $maxDist = 4.0;
        foreach ($selectedTypes as $vt) {
            if (isset($radiusMap[$vt]) && $radiusMap[$vt] > $maxDist) {
                $maxDist = $radiusMap[$vt];
            }
        }

        // 2. Requête SQL de ciblage avec FIND_IN_SET ou IN()
        // Remplacer : AND dp.vehicle_type = :vtype
        // Par : FIND_IN_SET(dp.vehicle_type, :vtypes)
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

        $targetChatIds = array_column($drivers, 'telegram_id');
        $driverIds     = array_column($drivers, 'id');

        $placeholders = implode(',', array_fill(0, count($driverIds), '?'));
        $this->pdo->prepare("UPDATE driver_profiles SET last_assigned_at = NOW() WHERE id IN ($placeholders)")
            ->execute($driverIds);

        $vIcons = ['moto' => '🛵 Moto', 'camionnette' => '🚚 Herbin/DFSK', 'voiture' => '🚗 Voiture', 'fourgon' => '🚐 Fourgon'];
        $vLabel = $vIcons[$vehicleType] ?? '🛵 Moto';

        $pickupMapsUrl = "https://www.google.com/maps?q={$lat},{$lon}";
        $destMapsHtml  = (!empty($parcel['delivery_lat']) && !empty($parcel['delivery_lon']))
            ? " (<a href='https://www.google.com/maps/dir/{$lat},{$lon}/{$parcel['delivery_lat']},{$parcel['delivery_lon']}'>Itinéraire Maps</a>)"
            : "";

        $distText = ((float)$parcel['distance_km'] > 0) ? " (~" . (float)$parcel['distance_km'] . " km)" : "";
        $estPrice = (float)$parcel['estimated_price'];

        $isRoundTrip = !empty($parcel['is_round_trip']);
        $tripTag = $isRoundTrip ? " 🔄 <b>TRAJET ALLER-RETOUR</b>\n" : "";

        $msg  = "📦 <b>NOUVELLE COURSE LIVRILI ({$parcel['code']})</b>\n\n";
        $msg .= "🚗 Véhicule : <b>{$vLabel}</b>{$distText}\n";
        $msg .= $tripTag;
        $msg .= "📍 Départ : <b>" . htmlspecialchars($parcel['pickup_address']) . "</b> (<a href='{$pickupMapsUrl}'>GPS</a>)\n";
        $msg .= "🏁 Arrivée : <b>" . htmlspecialchars($parcel['delivery_address']) . "</b>{$destMapsHtml}\n";
        if ($isRoundTrip) {
            $msg .= "⚠️ <i>Le coursier doit revenir au point de départ (Documents/Échange/Retour).</i>\n";
        }
        $msg .= "📦 Objet : <i>" . htmlspecialchars($parcel['parcel_description']) . "</i>\n";
        $msg .= "💰 Tarif proposé : <b>" . number_format($estPrice, 0, '.', ' ') . " DA</b>\n\n";

        $step = ($vehicleType === 'fourgon') ? 200 : (($vehicleType === 'voiture') ? 100 : 50);
        $p1 = (int)$estPrice;
        $p2 = (int)($estPrice + $step);
        $p3 = (int)($estPrice + ($step * 2));
        $p4 = (int)($estPrice + ($step * 3));

        $keyboard = [
            'inline_keyboard' => [
                [
                    ['text' => "✅ {$p1} DA", 'callback_data' => "livrili_bid_{$parcel_id}_{$p1}"],
                    ['text' => "⚡ {$p2} DA", 'callback_data' => "livrili_bid_{$parcel_id}_{$p2}"]
                ],
                [
                    ['text' => "⚡ {$p3} DA", 'callback_data' => "livrili_bid_{$parcel_id}_{$p3}"],
                    ['text' => "⚡ {$p4} DA", 'callback_data' => "livrili_bid_{$parcel_id}_{$p4}"]
                ],
                [['text' => "🔙 Tableau de bord", 'callback_data' => 'dash']]
            ]
        ];

        $this->broadcastToDrivers('sendMessage', $targetChatIds, [
            'text'                     => $msg,
            'parse_mode'               => 'HTML',
            'disable_web_page_preview' => true,
            'reply_markup'             => $keyboard
        ]);

        //notifier aussi l'application mobile des chauffeurs :
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
        //

        return ['success' => true, 'notified_count' => count($targetChatIds)];
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
