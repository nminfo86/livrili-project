<?php
// api/driver.php
require_once __DIR__ . '/bootstrap.php';

$user = requireAuth($pdo);
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

    jsonResponse([
        'success'             => true,
        'is_online'           => (int)$driver['is_online'],
        'rating'              => (float)$driver['rating'],
        'verification_status' => $driver['verification_status'],
        'vehicle_type'        => $driver['vehicle_type'],
        'delivered_count'     => $deliveredCount
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
// 3. POOL DES DEMANDES DISPONIBLES DANS LE SECTEUR
// -------------------------------------------------------------------------
if ($action === 'pool') {
    $drvLat = (float)($user['latitude'] ?? 36.1528);
    $drvLon = (float)($user['longitude'] ?? 5.6902);

    $sql = "SELECT po.id, po.code, po.pickup_address, po.delivery_address, po.estimated_price, po.distance_km, 
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

    jsonResponse([
        'success'      => true,
        'driver_vtype' => $driver['vehicle_type'],
        'pool'         => $stmt->fetchAll(PDO::FETCH_ASSOC)
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

    $stmtClient = $pdo->prepare("
        SELECT tu.push_token 
        FROM parcel_orders po
        JOIN telegram_users tu ON po.sender_telegram_id = tu.id
        WHERE po.id = :oid
    ");
    $stmtClient->execute(['oid' => $orderId]);
    $clientToken = $stmtClient->fetchColumn();

    sendPushNotification(
        $clientToken,
        "💵 Nouvelle offre de prix reçue !",
        "Un chauffeur propose {$amount} DA pour votre course.",
        ['type' => 'new_bid', 'order_id' => $orderId]
    );

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
    }
    jsonResponse(['success' => true]);
}

jsonResponse(['success' => false, 'error' => 'Action chauffeur inconnue'], 404);