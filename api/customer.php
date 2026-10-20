<?php
// api/customer.php
require_once __DIR__ . '/bootstrap.php';
require_once dirname(__DIR__) . '/handlers/DispatchService.php';

$action = $_GET['action'] ?? '';

// -------------------------------------------------------------------------
// 0. RÉCUPÉRATION DYNAMIQUE DES MODES DE TRANSPORT ET PARAMÈTRES DE PRIX
// -------------------------------------------------------------------------
if ($action === 'get_transport_modes') {
    $dispatch = new DispatchService($pdo, Config::$botToken ?? '');
    $modes = $dispatch->getActiveTransportModes();
    jsonResponse([
        'success'         => true,
        'transport_modes' => $modes
    ]);
}

$user = requireAuth($pdo);
$input = getJsonInput();

// -------------------------------------------------------------------------
// 1. CRÉATION D'UNE COURSE
// -------------------------------------------------------------------------
if ($action === 'create_order') {
    $pickupAddr   = trim($input['pickup_address'] ?? '');
    $pickupLat    = (float)($input['pickup_lat'] ?? 0);
    $pickupLon    = (float)($input['pickup_lon'] ?? 0);
    $pickupComm   = trim($input['pickup_commune'] ?? 'El Eulma');
    $delivAddr    = trim($input['delivery_address'] ?? '');
    $delivLat     = !empty($input['delivery_lat']) ? (float)$input['delivery_lat'] : null;
    $delivLon     = !empty($input['delivery_lon']) ? (float)$input['delivery_lon'] : null;
    $delivComm    = trim($input['delivery_commune'] ?? $pickupComm);
    $recipPhone   = preg_replace('/[^\d]/', '', $input['recipient_phone'] ?? '');
    $vTypes       = trim($input['vehicle_type'] ?? 'moto');
    $desc         = trim($input['parcel_description'] ?? 'Colis / Carton');
    $paymentBy    = in_array($input['payment_by'] ?? '', ['sender', 'recipient']) ? $input['payment_by'] : 'sender';
    $isRoundTrip  = !empty($input['is_round_trip']) ? 1 : 0;

    if (!$pickupAddr || !$delivAddr) {
        jsonResponse(['success' => false, 'error' => 'Les adresses de départ et de destination sont obligatoires.']);
    }

    // Contrôle obligatoire du téléphone mobile algérien (05, 06, 07 + 8 chiffres)
    if (!preg_match('/^(05|06|07)[0-9]{8}$/', $recipPhone)) {
        jsonResponse([
            'success' => false,
            'error'   => 'Le numéro de téléphone du destinataire est obligatoire et doit commencer par 05, 06 ou 07 (10 chiffres).'
        ]);
    }

    // Si aucune description n'est fournie, valeur par défaut
    if ($desc === '') {
        $desc = 'Colis standard';
    }

    // Calcul du tarif estimé sur le véhicule choisi avec les paramètres BDD
    $dispatch = new DispatchService($pdo, Config::$botToken);
    $firstVType = explode(',', $vTypes)[0];
    $priceInfo = $dispatch->calculateSuggestedPrice(
        $pickupLat,
        $pickupLon,
        $delivLat,
        $delivLon,
        $firstVType,
        (bool)$isRoundTrip,
        $pickupComm,
        $delivComm
    );

    $code = 'LV-' . strtoupper(substr(uniqid(), -5));

    $sql = "INSERT INTO parcel_orders (
                code, sender_telegram_id, sender_phone, pickup_lat, pickup_lon, pickup_commune,
                pickup_address, delivery_lat, delivery_lon, delivery_address, recipient_phone,
                payment_by, is_round_trip, vehicle_type, parcel_description, distance_km, estimated_price,
                status, created_at
            ) VALUES (
                :code, :tid, :sphone, :plat, :plon, :pcom,
                :paddr, :dlat, :dlon, :daddr, :rphone,
                :pby, :rtrip, :vtype, :pdesc, :dist, :price,
                'SEARCHING', NOW()
            )";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        'code'   => $code,
        'tid'    => $user['id'],
        'sphone' => $user['phone'],
        'plat'   => $pickupLat,
        'plon'   => $pickupLon,
        'pcom'   => $pickupComm,
        'paddr'  => $pickupAddr,
        'dlat'   => $delivLat,
        'dlon'   => $delivLon,
        'daddr'  => $delivAddr,
        'rphone' => $recipPhone,
        'pby'    => $paymentBy,
        'rtrip'  => $isRoundTrip,
        'vtype'  => $vTypes,
        'pdesc'  => $desc,
        'dist'   => $priceInfo['distance_km'],
        'price'  => $priceInfo['suggested_price']
    ]);

    $orderId = (int)$pdo->lastInsertId();
    $dispatchResult = $dispatch->dispatchParcelToDrivers($orderId);

    jsonResponse([
        'success'         => true,
        'order_id'        => $orderId,
        'code'            => $code,
        'estimated_price' => $priceInfo['suggested_price'],
        'distance_km'     => $priceInfo['distance_km'],
        'dispatched'      => $dispatchResult['notified_count'] ?? 0,
        'message'         => 'Le système est en train de chercher des livreurs proches...'
    ]);
}
// -------------------------------------------------------------------------
// 2. SUIVI DES COURSES DU JOUR (1 seule livrée max + toutes les actives)
// -------------------------------------------------------------------------
if ($action === 'my_orders') {
    $stmt = $pdo->prepare("
        SELECT po.*, 
               dp.full_name as driver_name, dp.phone as driver_phone,
               dp.moto_brand, dp.moto_color, dp.rating as driver_rating
        FROM parcel_orders po
        LEFT JOIN driver_profiles dp ON po.selected_driver_id = dp.id
        WHERE po.sender_telegram_id = :uid
          AND DATE(po.created_at) = CURDATE()
        ORDER BY po.id DESC
    ");
    $stmt->execute(['uid' => $user['id']]);
    $rawOrders = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $orders = [];
    $hasDelivered = false;

    foreach ($rawOrders as $ord) {
        if ($ord['status'] === 'DELIVERED') {
            if (!$hasDelivered) {
                $orders[] = $ord;
                $hasDelivered = true;
            }
        } else {
            $orders[] = $ord;
        }
    }

    foreach ($orders as &$ord) {
        if ($ord['status'] === 'SEARCHING') {
            $stmtBids = $pdo->prepare("
                SELECT pb.id as bid_id, pb.bid_amount, dp.full_name, dp.phone, dp.moto_brand, dp.moto_color, dp.rating
                FROM parcel_bids pb
                JOIN driver_profiles dp ON pb.driver_id = dp.id
                WHERE pb.parcel_order_id = :poid AND pb.status = 'pending'
                ORDER BY pb.bid_amount ASC
            ");
            $stmtBids->execute(['poid' => $ord['id']]);
            $ord['bids'] = $stmtBids->fetchAll(PDO::FETCH_ASSOC);
        } else {
            $ord['bids'] = [];
        }
    }
    unset($ord);

    jsonResponse(['success' => true, 'orders' => $orders]);
}

// -------------------------------------------------------------------------
// 3. ACCEPTATION D'UNE OFFRE DE COURSIER
// -------------------------------------------------------------------------
if ($action === 'accept_bid') {
    $bidId   = (int)($input['bid_id'] ?? 0);
    $orderId = (int)($input['order_id'] ?? 0);

    $stmtBid = $pdo->prepare("SELECT * FROM parcel_bids WHERE id = :bid AND parcel_order_id = :oid LIMIT 1");
    $stmtBid->execute(['bid' => $bidId, 'oid' => $orderId]);
    $bid = $stmtBid->fetch(PDO::FETCH_ASSOC);

    if (!$bid) {
        jsonResponse(['success' => false, 'error' => 'Proposition introuvable']);
    }

    $pdo->prepare("
        UPDATE parcel_orders 
        SET selected_driver_id = :did, agreed_fee = :fee, status = 'DRIVER_ASSIGNED', accepted_at = NOW() 
        WHERE id = :oid AND sender_telegram_id = :uid
    ")->execute([
        'did' => $bid['driver_id'],
        'fee' => $bid['bid_amount'],
        'oid' => $orderId,
        'uid' => $user['id']
    ]);

    $pdo->prepare("UPDATE parcel_bids SET status = 'accepted' WHERE id = :bid")->execute(['bid' => $bidId]);
    $pdo->prepare("UPDATE parcel_bids SET status = 'rejected' WHERE parcel_order_id = :oid AND id <> :bid")->execute(['oid' => $orderId, 'bid' => $bidId]);

    $stmtDrvToken = $pdo->prepare("
    SELECT tu.push_token 
    FROM driver_profiles dp
    JOIN telegram_users tu ON dp.telegram_user_id = tu.id
    WHERE dp.id = :did
");
    $stmtDrvToken->execute(['did' => $bid['driver_id']]);
    $drvToken = $stmtDrvToken->fetchColumn();

    sendPushNotification(
        $drvToken,
        "🎉 Offre acceptée !",
        "Le client a validé votre offre de {$bid['bid_amount']} DA. Rendez-vous au point de collecte !",
        ['type' => 'order_assigned', 'order_id' => $orderId]
    );

    jsonResponse(['success' => true]);
}

jsonResponse(['success' => false, 'error' => 'Action client inconnue'], 404);
