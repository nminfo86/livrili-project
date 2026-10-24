<?php
// api/customer.php
require_once __DIR__ . '/bootstrap.php';
require_once dirname(__DIR__) . '/handlers/DispatchService.php';
require_once __DIR__ . '/push_helper.php';


function getAuthenticatedCustomer(PDO $pdo)
{
    $token = '';

    // 1. Recherche dans les en-têtes HTTP
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $k => $v) {
        if (strtolower($k) === 'authorization' && preg_match('/Bearer\s+(.*)$/i', $v, $matches)) {
            $token = trim($matches[1]);
            break;
        } elseif (strtolower($k) === 'x-auth-token') {
            $token = trim($v);
            break;
        }
    }

    // 2. Recherche dans $_SERVER
    if (empty($token) && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        if (preg_match('/Bearer\s+(.*)$/i', $_SERVER['HTTP_AUTHORIZATION'], $matches)) {
            $token = trim($matches[1]);
        }
    }

    // 3. Repli via GET, POST ou le flux d'entrée JSON
    $rawInput = json_decode(file_get_contents('php://input'), true) ?: [];
    if (empty($token)) {
        $token = trim($_GET['auth_token'] ?? $_POST['auth_token'] ?? $rawInput['auth_token'] ?? '');
    }

    // Validation du token en base de données
    if (!empty($token)) {
        $stmt = $pdo->prepare("SELECT * FROM app_users WHERE auth_token = ? LIMIT 1");
        $stmt->execute([$token]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            return $user;
        }
    }

    // 4. Repli de secours via user_id
    $userId = intval($_GET['user_id'] ?? $_POST['user_id'] ?? $rawInput['user_id'] ?? 0);
    if ($userId > 0) {
        $stmt = $pdo->prepare("SELECT * FROM app_users WHERE id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            return $user;
        }
    }

    // Si aucune authentification n'a abouti
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Session expirée ou invalide'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$action = $_GET['action'] ?? '';

// -------------------------------------------------------------------------
// 0. RÉCUPÉRATION DYNAMIQUE DES MODES DE TRANSPORT ET PARAMÈTRES DE PRIX
// -------------------------------------------------------------------------
if ($action === 'get_transport_modes') {
    $dispatch = new DispatchService($pdo);
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
// ============================================================================
// ACTION : create_order (api/customer.php)
// ============================================================================
if ($action === 'create_order') {
    header('Content-Type: application/json; charset=utf-8');

    // 1. Authentifier l'utilisateur
    $currentUser = getAuthenticatedCustomer($pdo);
    $senderId = (int)$currentUser['id'];

    if (empty($currentUser['phone'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Votre numéro de téléphone est obligatoire pour passer une commande.']);
        exit;
    }

    // 2. Récupérer les données JSON envoyées par Axios (React Native)
    $rawInput = json_decode(file_get_contents('php://input'), true) ?: $_POST;

    $pickupLat       = floatval($rawInput['pickup_lat'] ?? 0);
    $pickupLon       = floatval($rawInput['pickup_lon'] ?? 0);
    $pickupCommune   = trim($rawInput['pickup_commune'] ?? 'El Eulma');
    $pickupAddress   = trim($rawInput['pickup_address'] ?? 'El Eulma');

    $deliveryLat     = floatval($rawInput['delivery_lat'] ?? 0);
    $deliveryLon     = floatval($rawInput['delivery_lon'] ?? 0);
    $deliveryCommune = trim($rawInput['delivery_commune'] ?? $pickupCommune);
    $deliveryAddress = trim($rawInput['delivery_address'] ?? '');

    $recipientPhone  = preg_replace('/\s+/', '', $rawInput['recipient_phone'] ?? '');
    $paymentBy       = in_array($rawInput['payment_by'] ?? '', ['sender', 'recipient']) ? $rawInput['payment_by'] : 'sender';
    $isRoundTrip     = intval($rawInput['is_round_trip'] ?? 0);

    // Récupérer le véhicule sélectionné (ex: fourgon, camionnette, moto)
    $vehicleType     = trim($rawInput['vehicle_type'] ?? 'moto');
    $parcelDesc      = trim($rawInput['parcel_description'] ?? 'Colis standard');

    // 3. Conserver la distance routière réelle et le prix envoyés par le mobile
    $distanceKm      = floatval($rawInput['distance_km'] ?? 0);
    $estimatedPrice  = floatval($rawInput['estimated_price'] ?? 0);

    // Sécurité : Si le mobile n'a pas transmis de prix, calculer le tarif de base
    if ($estimatedPrice <= 0) {
        $modeStmt = $pdo->prepare("SELECT * FROM transport_modes WHERE id = ? LIMIT 1");
        $modeStmt->execute([$vehicleType]);
        $mode = $modeStmt->fetch(PDO::FETCH_ASSOC);
        $estimatedPrice = $mode ? floatval($mode['base_price']) : 200.0;
    }

    if (empty($deliveryAddress)) {
        echo json_encode(['success' => false, 'error' => 'Adresse de destination obligatoire']);
        exit;
    }

    // 4. Générer un code unique de commande (ex: LV-A8F2B)
    $orderCode = 'LV-' . strtoupper(substr(md5(uniqid(mt_rand(), true)), 0, 5));

    // 5. Insertion en base de données avec les valeurs réelles
    $insertSql = "
        INSERT INTO parcel_orders (
            code,
            sender_id,
            sender_phone,
            pickup_lat,
            pickup_lon,
            pickup_commune,
            pickup_address,
            delivery_lat,
            delivery_lon,
            delivery_commune,
            delivery_address,
            recipient_phone,
            payment_by,
            is_round_trip,
            vehicle_type,
            parcel_description,
            distance_km,
            estimated_price,
            agreed_fee,
            status,
            created_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'SEARCHING', NOW()
        )
    ";

    $stmt = $pdo->prepare($insertSql);
    $success = $stmt->execute([
        $orderCode,
        $senderId,
        $currentUser['phone'] ?? '',
        $pickupLat,
        $pickupLon,
        $pickupCommune,
        $pickupAddress,
        $deliveryLat,
        $deliveryLon,
        $deliveryCommune,
        $deliveryAddress,
        $recipientPhone,
        $paymentBy,
        $isRoundTrip,
        $vehicleType,      // Enregistre bien 'fourgon' ou 'camionnette'
        $parcelDesc,
        $distanceKm,       // Enregistre bien la distance réelle (ex: 5.4 km)
        $estimatedPrice    // Enregistre bien le prix réel (ex: 950 DA)
    ]);

    if ($success) {
        $newOrderId = (int)$pdo->lastInsertId();
        echo json_encode([
            'success'  => true,
            'order_id' => $newOrderId,
            'code'     => $orderCode,
            'message'  => 'Commande créée avec succès'
        ], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode(['success' => false, 'error' => 'Erreur lors de l’enregistrement de la commande']);
        exit;
    }

    // vehicle_type peut contenir plusieurs types séparés par des virgules (ex: moto,fourgon)
    $stmtDrivers = $pdo->prepare("
    SELECT DISTINCT u.id AS user_id, u.push_token 
    FROM driver_profiles dp
    INNER JOIN app_users u ON u.id = dp.app_user_id
    WHERE dp.is_online = 1 
      AND dp.verification_status = 'approved'
      AND FIND_IN_SET(dp.vehicle_type, :vtype)
");
    $stmtDrivers->execute([':vtype' => str_replace(' ', '', $vehicleType)]);
    $driversToNotify = $stmtDrivers->fetchAll(PDO::FETCH_ASSOC);

    if (!empty($driversToNotify)) {
        $title = "📦 Nouvelle course disponible (#$orderCode)";
        $body  = "Départ : $pickupAddress ➔ $deliveryAddress ($estimatedPrice DA)";
        $data  = [
            'type'       => 'NEW_ORDER_POOL',
            'screen'     => 'DriverPool',
            'orderId'    => $newOrderId,
            'targetRole' => 'driver'
        ];
        foreach ($driversToNotify as $d) {
            storeNotification($pdo, (int)$d['user_id'], $title, $body, $data);
        }
        sendExpoPushNotifications(array_column($driversToNotify, 'push_token'), $title, $body, $data);
    }
    exit;
}
// ============================================================================
// ACTION : my_orders (api/customer.php)
// ============================================================================
if ($action === 'my_orders') {
    header('Content-Type: application/json; charset=utf-8');

    // 1. AUTHENTIFICATION DU CLIENT
    // (Récupère le token depuis les Headers, GET, POST ou JSON)
    $token = '';
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $k => $v) {
        if (strtolower($k) === 'authorization' && preg_match('/Bearer\s+(.*)$/i', $v, $matches)) {
            $token = trim($matches[1]);
            break;
        } elseif (strtolower($k) === 'x-auth-token') {
            $token = trim($v);
            break;
        }
    }

    if (empty($token) && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        if (preg_match('/Bearer\s+(.*)$/i', $_SERVER['HTTP_AUTHORIZATION'], $matches)) {
            $token = trim($matches[1]);
        }
    }

    $rawInput = json_decode(file_get_contents('php://input'), true) ?: [];
    if (empty($token)) {
        $token = trim($_GET['auth_token'] ?? $_POST['auth_token'] ?? $rawInput['auth_token'] ?? '');
    }

    $currentUser = null;
    if (!empty($token)) {
        $stmt = $pdo->prepare("SELECT * FROM app_users WHERE auth_token = ? LIMIT 1");
        $stmt->execute([$token]);
        $currentUser = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    // Repli de secours via user_id
    if (!$currentUser) {
        $userIdFallback = intval($_GET['user_id'] ?? $_POST['user_id'] ?? $rawInput['user_id'] ?? 0);
        if ($userIdFallback > 0) {
            $stmt = $pdo->prepare("SELECT * FROM app_users WHERE id = ? LIMIT 1");
            $stmt->execute([$userIdFallback]);
            $currentUser = $stmt->fetch(PDO::FETCH_ASSOC);
        }
    }

    if (!$currentUser) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error'   => 'Session expirée ou invalide'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $userId = (int)$currentUser['id'];

    // 2. RÉCUPÉRATION DES COMMANDES AVEC INFOS DU LIVREUR ASSIGNÉ
    $orderQuery = "
        SELECT 
            po.id,
            po.code,
            po.sender_id,
            po.sender_phone,
            po.pickup_lat,
            po.pickup_lon,
            po.pickup_commune,
            po.pickup_address,
            po.delivery_lat,
            po.delivery_lon,
            po.delivery_address,
            po.recipient_phone,
            po.payment_by,
            po.is_round_trip,
            po.vehicle_type,
            po.parcel_description,
            po.distance_km,
            po.estimated_price,
            po.agreed_fee,
            po.selected_driver_id,
            po.status,
            po.created_at,
            po.accepted_at,
            po.picked_up_at,
            po.delivered_at,
            -- Détails complets du livreur sélectionné (s'il existe)
            dp.full_name AS driver_name,
            dp.phone AS driver_phone,
            dp.moto_brand AS driver_vehicle_brand,
            dp.moto_color AS driver_vehicle_color,
            dp.plate_number AS driver_plate,
            COALESCE(dtm.title_fr, dp.vehicle_type) AS driver_vehicle_type,
            IFNULL(dp.rating, 100.00) AS driver_rating
        FROM parcel_orders po
        LEFT JOIN driver_profiles dp ON po.selected_driver_id = dp.id
        LEFT JOIN transport_modes dtm ON dp.vehicle_type = dtm.id
        WHERE po.sender_id = ?
          AND (
              po.status NOT IN ('DELIVERED', 'CANCELLED')
              OR (po.status = 'DELIVERED' AND DATE(po.delivered_at) = CURDATE())
              OR (po.status = 'CANCELLED' AND DATE(po.updated_at) = CURDATE())
          )
        ORDER BY (po.status IN ('DELIVERED', 'CANCELLED')) ASC, po.created_at DESC
        LIMIT 40
    ";

    $stmtOrders = $pdo->prepare($orderQuery);
    $stmtOrders->execute([$userId]);
    $rawOrders = $stmtOrders->fetchAll(PDO::FETCH_ASSOC);

    if (empty($rawOrders)) {
        echo json_encode([
            'success' => true,
            'orders'  => []
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 3. PRÉPARATION DE LA REQUÊTE POUR LES OFFRES (BIDS) AVEC FIABILITÉ
    $bidsStmt = $pdo->prepare("
        SELECT 
            pb.id AS bid_id,
            pb.parcel_order_id,
            pb.driver_id,
            pb.bid_amount,
            pb.status AS bid_status,
            pb.created_at AS bid_created_at,
            dp.full_name,
            dp.phone,
            dp.moto_brand,
            dp.moto_color,
            dp.plate_number,
            COALESCE(tm.title_fr, dp.vehicle_type) AS vehicle_type,
            IFNULL(dp.rating, 100.00) AS rating
        FROM parcel_bids pb
        JOIN driver_profiles dp ON pb.driver_id = dp.id
        LEFT JOIN transport_modes tm ON dp.vehicle_type = tm.id
        WHERE pb.parcel_order_id = ?
        ORDER BY pb.bid_amount ASC, pb.created_at ASC
    ");

    $formattedOrders = [];

    // 4. FORMATAGE ET ATTACHEMENT DES BIDS À CHAQUE COMMANDE
    foreach ($rawOrders as $order) {
        $orderId = (int)$order['id'];

        // Si la commande est en recherche ou assignée, charger les offres associées
        $bidsList = [];
        if (in_array($order['status'], ['SEARCHING', 'DRIVER_ASSIGNED', 'PICKED_UP'])) {
            $bidsStmt->execute([$orderId]);
            $bidsList = $bidsStmt->fetchAll(PDO::FETCH_ASSOC);

            // Cast propre des nombres pour le mobile
            foreach ($bidsList as &$b) {
                $b['bid_id']     = (int)$b['bid_id'];
                $b['bid_amount'] = (float)$b['bid_amount'];
                $b['rating']     = round((float)$b['rating'], 0);
            }
            unset($b);
        }

        $formattedOrders[] = [
            'id'                   => $orderId,
            'code'                 => $order['code'] ?: 'LV-' . $orderId,
            'sender_phone'         => $order['sender_phone'],
            'pickup_lat'           => (float)$order['pickup_lat'],
            'pickup_lon'           => (float)$order['pickup_lon'],
            'pickup_commune'       => $order['pickup_commune'],
            'pickup_address'       => $order['pickup_address'],
            'delivery_lat'         => (float)$order['delivery_lat'],
            'delivery_lon'         => (float)$order['delivery_lon'],
            'delivery_address'     => $order['delivery_address'],
            'recipient_phone'      => $order['recipient_phone'],
            'payment_by'           => $order['payment_by'],
            'is_round_trip'        => (int)$order['is_round_trip'],
            'vehicle_type'         => $order['vehicle_type'],
            'parcel_description'   => $order['parcel_description'],
            'distance_km'          => (float)$order['distance_km'],
            'estimated_price'      => (float)$order['estimated_price'],
            'agreed_fee'           => (float)$order['agreed_fee'],
            'status'               => $order['status'],
            'created_at'           => $order['created_at'],
            'accepted_at'          => $order['accepted_at'],
            'picked_up_at'         => $order['picked_up_at'],
            'delivered_at'         => $order['delivered_at'],
            // Coordonnées et véhicule du coursier assigné
            'driver_name'          => $order['driver_name'],
            'driver_phone'         => $order['driver_phone'],
            'driver_vehicle_brand' => $order['driver_vehicle_brand'],
            'driver_vehicle_color' => $order['driver_vehicle_color'],
            'driver_plate'         => $order['driver_plate'],
            'driver_vehicle_type'  => $order['driver_vehicle_type'],
            'driver_rating'        => round((float)$order['driver_rating'], 0),
            // Tableau des offres
            'bids'                 => $bidsList,
        ];
    }

    // 5. SORTIE JSON
    echo json_encode([
        'success' => true,
        'orders'  => $formattedOrders
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// -------------------------------------------------------------------------
// 3. ACCEPTATION D'UNE OFFRE DE COURSIER
// -------------------------------------------------------------------------
if ($action === 'accept_bid') {
    header('Content-Type: application/json; charset=utf-8');

    $raw = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $orderId = intval($raw['order_id'] ?? 0);
    $bidId   = intval($raw['bid_id'] ?? 0);

    if ($orderId <= 0 || $bidId <= 0) {
        echo json_encode(['success' => false, 'error' => 'Paramètres manquants']);
        exit;
    }

    // 1. Récupérer l'offre sélectionnée
    $bStmt = $pdo->prepare("SELECT * FROM parcel_bids WHERE id = ? AND parcel_order_id = ? LIMIT 1");
    $bStmt->execute([$bidId, $orderId]);
    $bid = $bStmt->fetch(PDO::FETCH_ASSOC);

    if (!$bid) {
        echo json_encode(['success' => false, 'error' => 'Offre introuvable']);
        exit;
    }

    // 2. Assigner le livreur et mettre à jour le prix convenu (agreed_fee)
    $upOrder = $pdo->prepare("
        UPDATE parcel_orders 
        SET selected_driver_id = ?, 
            agreed_fee = ?, 
            status = 'DRIVER_ASSIGNED', 
            accepted_at = NOW() 
        WHERE id = ?
    ");
    $upOrder->execute([$bid['driver_id'], $bid['bid_amount'], $orderId]);

    // 3. Marquer cette offre comme acceptée et les autres comme rejetées
    $pdo->prepare("UPDATE parcel_bids SET status = 'accepted' WHERE id = ?")->execute([$bidId]);
    $pdo->prepare("UPDATE parcel_bids SET status = 'rejected' WHERE parcel_order_id = ? AND id != ?")->execute([$orderId, $bidId]);

    echo json_encode([
        'success' => true,
        'message' => 'Livreur assigné avec succès'
    ]);

    // Récupérer le push_token du livreur sélectionné et le code de la commande
    $stmtNotifDriver = $pdo->prepare("
    SELECT u.id AS user_id, u.push_token, po.code, po.pickup_address, po.agreed_fee
    FROM parcel_orders po
    INNER JOIN driver_profiles dp ON dp.id = po.selected_driver_id
    INNER JOIN app_users u ON u.id = dp.app_user_id
    WHERE po.id = :order_id
");
    $stmtNotifDriver->execute([':order_id' => $orderId]);
    $notifInfo = $stmtNotifDriver->fetch(PDO::FETCH_ASSOC);

    if ($notifInfo) {
        $title = "✅ Votre offre a été acceptée ! (#{$notifInfo['code']})";
        $body  = "Montant : {$notifInfo['agreed_fee']} DA. Rendez-vous au point de départ : {$notifInfo['pickup_address']}";
        $data  = [
            'type'       => 'BID_ACCEPTED',
            'screen'     => 'DriverBids',
            'orderId'    => (int)$orderId,
            'targetRole' => 'driver'
        ];
        storeNotification($pdo, (int)$notifInfo['user_id'], $title, $body, $data);
        if (!empty($notifInfo['push_token'])) {
            sendExpoPushNotifications($notifInfo['push_token'], $title, $body, $data);
        }
    }

    exit;
}

// -------------------------------------------------------------------------
// 4. ANNULATION D'UNE COMMANDE (tant qu'aucun livreur n'est choisi)
// -------------------------------------------------------------------------
if ($action === 'cancel_order') {
    header('Content-Type: application/json; charset=utf-8');

    $currentUser = getAuthenticatedCustomer($pdo);
    $raw     = json_decode(file_get_contents('php://input'), true) ?: $_POST;
    $orderId = intval($raw['order_id'] ?? 0);

    if ($orderId <= 0) {
        echo json_encode(['success' => false, 'error' => 'Paramètres manquants']);
        exit;
    }

    $up = $pdo->prepare("
        UPDATE parcel_orders
        SET status = 'CANCELLED'
        WHERE id = ? AND sender_id = ? AND status = 'SEARCHING' AND selected_driver_id IS NULL
    ");
    $up->execute([$orderId, $currentUser['id']]);

    if ($up->rowCount() === 0) {
        echo json_encode(['success' => false, 'error' => 'Annulation impossible : un livreur a déjà été choisi ou la commande est introuvable.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Livreurs ayant déjà proposé une offre (à prévenir de l'annulation)
    $stmtBidders = $pdo->prepare("
        SELECT DISTINCT u.id AS user_id, u.push_token, po.code
        FROM parcel_bids pb
        INNER JOIN driver_profiles dp ON dp.id = pb.driver_id
        INNER JOIN app_users u ON u.id = dp.app_user_id
        INNER JOIN parcel_orders po ON po.id = pb.parcel_order_id
        WHERE pb.parcel_order_id = ? AND pb.status = 'pending'
    ");
    $stmtBidders->execute([$orderId]);
    $bidders = $stmtBidders->fetchAll(PDO::FETCH_ASSOC);

    $pdo->prepare("UPDATE parcel_bids SET status = 'rejected' WHERE parcel_order_id = ? AND status = 'pending'")
        ->execute([$orderId]);

    echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);

    if (!empty($bidders)) {
        $orderCode = $bidders[0]['code'];
        $title = "❌ Commande annulée (#{$orderCode})";
        $body  = "Le client a annulé la commande #{$orderCode} sur laquelle vous aviez fait une offre.";
        $data  = [
            'type'       => 'ORDER_CANCELLED',
            'screen'     => 'DriverPool',
            'orderId'    => (int)$orderId,
            'targetRole' => 'driver'
        ];
        foreach ($bidders as $b) {
            storeNotification($pdo, (int)$b['user_id'], $title, $body, $data);
        }
        sendExpoPushNotifications(array_column($bidders, 'push_token'), $title, $body, $data);
    }
    exit;
}

jsonResponse(['success' => false, 'error' => 'Action client inconnue'], 404);
