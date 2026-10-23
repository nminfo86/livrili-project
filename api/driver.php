<?php
// api/driver.php
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/push_helper.php';

// Fonction de vérification d'authentification robuste (Headers Apache, GET, POST, JSON)
function getAuthenticatedUser(PDO $pdo)
{
    $token = '';

    // 1. Chercher dans les Headers HTTP
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $k => $v) {
        if (strtolower($k) === 'authorization' && preg_match('/Bearer\s+(.*)$/i', $v, $m)) {
            $token = trim($m[1]);
            break;
        } elseif (strtolower($k) === 'x-auth-token') {
            $token = trim($v);
            break;
        }
    }

    if (empty($token) && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        if (preg_match('/Bearer\s+(.*)$/i', $_SERVER['HTTP_AUTHORIZATION'], $m)) {
            $token = trim($m[1]);
        }
    }

    // 2. Fallback via GET, POST ou JSON Body
    $rawInput = json_decode(file_get_contents('php://input'), true) ?: [];
    if (empty($token)) {
        $token = trim($_GET['auth_token'] ?? $_POST['auth_token'] ?? $rawInput['auth_token'] ?? '');
    }

    if (!empty($token)) {
        $stmt = $pdo->prepare("SELECT * FROM telegram_users WHERE auth_token = ? LIMIT 1");
        $stmt->execute([$token]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) return $user;
    }

    // 3. Fallback de secours via user_id
    $userId = intval($_GET['user_id'] ?? $_POST['user_id'] ?? $rawInput['user_id'] ?? 0);
    if ($userId > 0) {
        $stmt = $pdo->prepare("SELECT * FROM telegram_users WHERE id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) return $user;
    }

    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Session expirée ou invalide'], JSON_UNESCAPED_UNICODE);
    exit;
}

$user = getAuthenticatedUser($pdo);
$action = $_GET['action'] ?? '';
$input = getJsonInput();

// -------------------------------------------------------------------------
// 1. INSCRIPTION CHAUFFEUR (Avec téléversement photo du véhicule)
// -------------------------------------------------------------------------
if ($action === 'register') {
    $fullName = trim($_POST['full_name'] ?? $input['full_name'] ?? '');
    $commune  = trim($_POST['commune_name'] ?? $input['commune_name'] ?? 'El Eulma');
    $vType    = trim($_POST['vehicle_type'] ?? $input['vehicle_type'] ?? 'moto');
    $brand    = trim($_POST['brand'] ?? $input['brand'] ?? '');
    $color    = trim($_POST['color'] ?? $input['color'] ?? '');
    $plate    = trim($_POST['plate_number'] ?? $input['plate_number'] ?? '');

    if (!$fullName || !$brand || !$color || !$plate) {
        jsonResponse(['success' => false, 'error' => 'Informations du véhicule et nom complet obligatoires']);
    }

    // Vérifier que le vehicle_type existe dans transport_modes
    $stmtMode = $pdo->prepare("SELECT id FROM transport_modes WHERE id = :id LIMIT 1");
    $stmtMode->execute(['id' => $vType]);
    if (!$stmtMode->fetchColumn()) {
        $vType = 'moto';
    }

    $stmtCheck = $pdo->prepare("SELECT id, verification_status FROM driver_profiles WHERE telegram_user_id = :uid LIMIT 1");
    $stmtCheck->execute(['uid' => $user['id']]);
    $existing = $stmtCheck->fetch();
    if ($existing) {
        jsonResponse(['success' => false, 'error' => 'Votre dossier est déjà enregistré (Statut: ' . $existing['verification_status'] . ')']);
    }

    $relPath = '';
    if (isset($_FILES['photo']) && $_FILES['photo']['error'] === UPLOAD_ERR_OK) {
        $ext = strtolower(pathinfo($_FILES['photo']['name'], PATHINFO_EXTENSION));
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
            $dir = dirname(__DIR__) . "/driver-media/{$user['id']}";
            if (!is_dir($dir)) mkdir($dir, 0755, true);
            $absPath = "{$dir}/vehicle.{$ext}";
            move_uploaded_file($_FILES['photo']['tmp_name'], $absPath);
            $relPath = "driver-media/{$user['id']}/vehicle.{$ext}";
        }
    }

    $sql = "INSERT INTO driver_profiles (
                telegram_user_id, full_name, phone, wilaya_code, commune_name,
                vehicle_type, moto_brand, moto_color, plate_number, photo_moto,
                verification_status, is_online, rating, created_at
            ) VALUES (
                :uid, :name, :phone, 19, :commune,
                :vtype, :brand, :color, :plate, :photo,
                'approved', 1, 100.00, NOW()
            )";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        'uid'     => $user['id'],
        'name'    => $fullName,
        'phone'   => $user['phone'] ?? '',
        'commune' => $commune,
        'vtype'   => $vType,
        'brand'   => $brand,
        'color'   => $color,
        'plate'   => $plate,
        'photo'   => $relPath
    ]);

    $pdo->prepare("UPDATE telegram_users SET role = 'driver', current_mode = 'driver' WHERE id = :id")
        ->execute(['id' => $user['id']]);

    jsonResponse(['success' => true, 'message' => 'Compte livreur activé avec succès']);
}

// Récupération du profil chauffeur pour les actions suivantes
$stmtD = $pdo->prepare("SELECT * FROM driver_profiles WHERE telegram_user_id = :uid LIMIT 1");
$stmtD->execute(['uid' => $user['id']]);
$driver = $stmtD->fetch(PDO::FETCH_ASSOC);

if (!$driver) {
    jsonResponse(['success' => false, 'error' => 'Aucun profil livreur trouvé pour ce compte.'], 403);
}

if ($driver['verification_status'] === 'rejected') {
    jsonResponse(['success' => false, 'error' => 'Votre compte chauffeur a été refusé.'], 403);
}

// -------------------------------------------------------------------------
// 1b. STATUT & BASCULE EN LIGNE / HORS LIGNE (Dashboard)
// -------------------------------------------------------------------------
if ($action === 'status') {
    $stmtDeliv = $pdo->prepare("SELECT COUNT(*) FROM parcel_orders WHERE selected_driver_id = :did AND status = 'DELIVERED'");
    $stmtDeliv->execute(['did' => $driver['id']]);
    $deliveredCount = (int)$stmtDeliv->fetchColumn();

    // Calcul des gains du jour
    $stmtDay = $pdo->prepare("
        SELECT SUM(IF(agreed_fee > 0, agreed_fee, estimated_price)) 
        FROM parcel_orders 
        WHERE selected_driver_id = :did 
          AND status = 'DELIVERED' 
          AND DATE(delivered_at) = CURDATE() 
    ");
    $stmtDay->execute(['did' => $driver['id']]);
    $earningsDay = (float)$stmtDay->fetchColumn();

    // Calcul des gains du mois
    $stmtMonth = $pdo->prepare("
        SELECT SUM(IF(agreed_fee > 0, agreed_fee, estimated_price)) 
        FROM parcel_orders 
        WHERE selected_driver_id = :did 
          AND status = 'DELIVERED' 
          AND MONTH(delivered_at) = MONTH(NOW()) 
          AND YEAR(delivered_at) = YEAR(NOW())
    ");
    $stmtMonth->execute(['did' => $driver['id']]);
    $earningsMonth = (float)$stmtMonth->fetchColumn();

    jsonResponse([
        'success'         => true,
        'is_online'       => (int)$driver['is_online'],
        'rating'          => (float)$driver['rating'],
        'delivered_count' => $deliveredCount,
        'earnings_day'    => $earningsDay,
        'earnings_month'  => $earningsMonth
    ]);
}

if ($action === 'toggle_online') {
    $isOnline = !empty($input['is_online']) ? 1 : 0;
    $pdo->prepare("UPDATE driver_profiles SET is_online = :on WHERE id = :did")
        ->execute(['on' => $isOnline, 'did' => $driver['id']]);
    jsonResponse(['success' => true, 'is_online' => $isOnline]);
}

// -------------------------------------------------------------------------
// 2. MISE À JOUR GPS (Accepte lat/lon OU latitude/longitude)
// -------------------------------------------------------------------------
if ($action === 'update_gps') {
    $lat = (float)($input['lat'] ?? $input['latitude'] ?? 0);
    $lon = (float)($input['lon'] ?? $input['longitude'] ?? 0);

    if ($lat && $lon) {
        $stmtGps = $pdo->prepare("
            UPDATE telegram_users 
            SET latitude = :lat, longitude = :lon, gps_updated_at = NOW() 
            WHERE id = :id
        ");
        $stmtGps->execute(['lat' => $lat, 'lon' => $lon, 'id' => $user['id']]);
        $pdo->prepare("UPDATE driver_profiles SET is_online = 1 WHERE id = :did")->execute(['did' => $driver['id']]);
        jsonResponse(['success' => true]);
    }
    jsonResponse(['success' => false, 'error' => 'Coordonnées GPS invalides']);
}

// -------------------------------------------------------------------------
// 3. POOL DES DEMANDES DISPONIBLES (AVEC COORDONNÉES GPS COMPLÈTES)
// -------------------------------------------------------------------------
if ($action === 'pool') {
    $drvLat = (float)($user['latitude'] ?? 36.1528);
    $drvLon = (float)($user['longitude'] ?? 5.6902);

    // Sélection explicite des coordonnées GPS pour Google Maps
    $sql = "SELECT po.id, po.code, 
                   po.pickup_lat, po.pickup_lon, po.pickup_commune, po.pickup_address, 
                   po.delivery_lat, po.delivery_lon, po.delivery_address, 
                   po.estimated_price, po.distance_km, 
                   po.is_round_trip, po.parcel_description, po.vehicle_type,
                   DATE_FORMAT(po.created_at, '%H:%i') as time,
                   tm.bid_step
            FROM parcel_orders po
            LEFT JOIN transport_modes tm ON po.vehicle_type = tm.id
            WHERE po.status = 'SEARCHING'
              AND po.vehicle_type = :vtype
              AND po.created_at >= (NOW() - INTERVAL 12 HOUR)
              AND (
                  LOWER(TRIM(po.pickup_commune)) = LOWER(TRIM(:commune))
                  OR (
                      6371 * acos(
                          LEAST(1.0, GREATEST(-1.0,
                              cos(radians(:lat)) * cos(radians(po.pickup_lat)) * cos(radians(po.pickup_lon) - radians(:lon))
                              + sin(radians(:lat)) * sin(radians(po.pickup_lat))
                          ))
                      )
                  ) <= 15.0
              )
              AND po.id NOT IN (SELECT parcel_order_id FROM parcel_bids WHERE driver_id = :did)
            ORDER BY po.id DESC LIMIT 30";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        'commune' => $driver['commune_name'] ?: 'El Eulma',
        'vtype'   => $driver['vehicle_type'],
        'lat'     => $drvLat,
        'lon'     => $drvLon,
        'did'     => $driver['id']
    ]);

    $poolData = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Cast numérique explicite pour le mobile
    foreach ($poolData as &$item) {
        $item['pickup_lat']   = (float)$item['pickup_lat'];
        $item['pickup_lon']   = (float)$item['pickup_lon'];
        $item['delivery_lat'] = (float)$item['delivery_lat'];
        $item['delivery_lon'] = (float)$item['delivery_lon'];
        $item['distance_km']  = (float)$item['distance_km'];
        $item['estimated_price'] = (float)$item['estimated_price'];
    }
    unset($item);

    jsonResponse([
        'success'      => true,
        'driver_vtype' => $driver['vehicle_type'],
        'pool'         => $poolData
    ]);
}

// -------------------------------------------------------------------------
// 3b. HISTORIQUE DES OFFRES (BIDS) DU CHAUFFEUR ET COURSES ATTRIBUÉES
// -------------------------------------------------------------------------
if ($action === 'driver_bids') {
    $sql = "SELECT pb.id AS bid_id, pb.bid_amount, pb.status AS bid_status, pb.created_at AS bid_date,
                   po.id AS order_id, po.code, 
                   po.pickup_lat, po.pickup_lon, po.delivery_lat, po.delivery_lon,
                   po.pickup_address, po.delivery_address, 
                   po.recipient_phone, po.payment_by, po.is_round_trip, po.status AS order_status,
                   po.distance_km, po.agreed_fee,
                   tu.phone AS client_phone, tu.full_name AS client_name
            FROM parcel_bids pb
            JOIN parcel_orders po ON pb.parcel_order_id = po.id
            JOIN telegram_users tu ON po.sender_telegram_id = tu.id
            WHERE pb.driver_id = :did
              AND pb.created_at >= (NOW() - INTERVAL 24 HOUR)
              AND (po.status <> 'DELIVERED' OR DATE(po.delivered_at) = CURDATE())
            ORDER BY (po.status = 'DELIVERED') ASC, pb.id DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute(['did' => $driver['id']]);

    $bidsData = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($bidsData as &$b) {
        $b['pickup_lat']   = (float)$b['pickup_lat'];
        $b['pickup_lon']   = (float)$b['pickup_lon'];
        $b['delivery_lat'] = (float)$b['delivery_lat'];
        $b['delivery_lon'] = (float)$b['delivery_lon'];
    }
    unset($b);

    jsonResponse([
        'success' => true,
        'bids'    => $bidsData
    ]);
}

// -------------------------------------------------------------------------
// 4. SOUMISSION D'UNE OFFRE DE PRIX (BID)
// -------------------------------------------------------------------------
if ($action === 'submit_bid') {
    $orderId = (int)($input['order_id'] ?? 0);
    $amount  = (float)($input['amount'] ?? 0);

    $stmtBusy = $pdo->prepare("
        SELECT COUNT(*) FROM parcel_orders 
        WHERE selected_driver_id = :did 
          AND status IN ('DRIVER_ASSIGNED', 'PICKED_UP')
          AND DATE(created_at) = CURDATE()
    ");
    $stmtBusy->execute(['did' => $driver['id']]);
    if ((int)$stmtBusy->fetchColumn() > 0) {
        jsonResponse(['success' => false, 'error' => 'Vous avez déjà une course active en cours d\'acheminement']);
    }

    $stmtCheck = $pdo->prepare("SELECT id FROM parcel_bids WHERE parcel_order_id = :oid AND driver_id = :did LIMIT 1");
    $stmtCheck->execute(['oid' => $orderId, 'did' => $driver['id']]);
    $existingBid = $stmtCheck->fetchColumn();

    if ($existingBid) {
        $pdo->prepare("UPDATE parcel_bids SET bid_amount = :amt, status = 'pending', created_at = NOW() WHERE id = :id")
            ->execute(['amt' => $amount, 'id' => $existingBid]);
    } else {
        $pdo->prepare("INSERT INTO parcel_bids (parcel_order_id, driver_id, bid_amount, status, created_at) VALUES (:oid, :did, :amt, 'pending', NOW())")
            ->execute(['oid' => $orderId, 'did' => $driver['id'], 'amt' => $amount]);
    }

    // sender_telegram_id stocke soit telegram_users.id soit telegram_users.telegram_id
    $stmtClient = $pdo->prepare("
        SELECT u.push_token, po.code 
        FROM parcel_orders po
        INNER JOIN telegram_users u ON (u.id = po.sender_telegram_id OR u.telegram_id = po.sender_telegram_id)
        WHERE po.id = :order_id
        LIMIT 1
    ");
    $stmtClient->execute([':order_id' => $orderId]);
    $clientInfo = $stmtClient->fetch(PDO::FETCH_ASSOC);

    if ($clientInfo && !empty($clientInfo['push_token'])) {
        sendExpoPushNotifications(
            $clientInfo['push_token'],
            "🛵 Nouvelle offre pour votre commande #{$clientInfo['code']}",
            "Un livreur propose de livrer votre colis pour {$amount} DA. Appuyez pour voir.",
            [
                'type'       => 'NEW_BID',
                'screen'     => 'Orders',
                'orderId'    => (int)$orderId,
                'targetRole' => 'customer'
            ]
        );
    }

    jsonResponse(['success' => true]);
}

// -------------------------------------------------------------------------
// 5. COURSES ACTIVES DU CHAUFFEUR
// -------------------------------------------------------------------------
if ($action === 'active_orders') {
    $sql = "SELECT * FROM parcel_orders
            WHERE selected_driver_id = :did
              AND status IN ('DRIVER_ASSIGNED', 'PICKED_UP')
            ORDER BY updated_at ASC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['did' => $driver['id']]);
    jsonResponse(['success' => true, 'active_orders' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

// -------------------------------------------------------------------------
// 6. AVANCEMENT DE L'ÉTAPE DU COLIS (PICKED_UP / DELIVERED)
// -------------------------------------------------------------------------
if ($action === 'update_step') {
    $orderId = (int)($input['order_id'] ?? 0);
    $step    = trim($input['step'] ?? '');

    if ($step === 'PICKED_UP') {
        $pdo->prepare("UPDATE parcel_orders SET status = 'PICKED_UP', picked_up_at = NOW() WHERE id = :oid AND selected_driver_id = :did")
            ->execute(['oid' => $orderId, 'did' => $driver['id']]);
    } elseif ($step === 'DELIVERED') {
        $pdo->prepare("UPDATE parcel_orders SET status = 'DELIVERED', delivered_at = NOW() WHERE id = :oid AND selected_driver_id = :did")
            ->execute(['oid' => $orderId, 'did' => $driver['id']]);
    } else {
        jsonResponse(['success' => true]);
    }

    $stmtClient = $pdo->prepare("
    SELECT u.push_token, po.code 
    FROM parcel_orders po
    INNER JOIN telegram_users u ON (u.id = po.sender_telegram_id OR u.telegram_id = po.sender_telegram_id)
    WHERE po.id = :order_id
    LIMIT 1
");
    $stmtClient->execute([':order_id' => $orderId]);
    $clientInfo = $stmtClient->fetch(PDO::FETCH_ASSOC);

    if ($clientInfo && !empty($clientInfo['push_token'])) {
        $title = ($step === 'PICKED_UP')
            ? "📦 Colis récupéré (#{$clientInfo['code']})"
            : "🎉 Colis livré avec succès (#{$clientInfo['code']})";
        $body = ($step === 'PICKED_UP')
            ? "Le livreur a récupéré votre colis et est en route vers la destination."
            : "Votre commande #{$clientInfo['code']} a bien été livrée. Merci d'avoir utilisé Livrili !";

        sendExpoPushNotifications(
            $clientInfo['push_token'],
            $title,
            $body,
            [
                'type'       => 'ORDER_STATUS_CHANGED',
                'screen'     => 'Orders',
                'orderId'    => (int)$orderId,
                'status'     => $step,
                'targetRole' => 'customer'
            ]
        );
    }

    jsonResponse(['success' => true]);
}

jsonResponse(['success' => false, 'error' => 'Action chauffeur inconnue'], 404);
