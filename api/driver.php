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
    $fullName  = trim($_POST['full_name'] ?? '');
    $commune   = trim($_POST['commune_name'] ?? 'El Eulma');
    $vType     = in_array($_POST['vehicle_type'] ?? '', ['moto', 'voiture', 'camionnette', 'fourgon']) ? $_POST['vehicle_type'] : 'moto';
    $brand     = trim($_POST['brand'] ?? '');
    $color     = trim($_POST['color'] ?? '');
    $plate     = trim($_POST['plate_number'] ?? '');

    if (!$fullName || !$brand || !$color || !$plate) {
        jsonResponse(['success' => false, 'error' => 'Informations du véhicule et nom complet obligatoires']);
    }

    // Vérifier si un profil existe déjà
    $stmtCheck = $pdo->prepare("SELECT id, verification_status FROM driver_profiles WHERE telegram_user_id = :uid LIMIT 1");
    $stmtCheck->execute(['uid' => $user['id']]);
    $existing = $stmtCheck->fetch();

    if ($existing) {
        jsonResponse(['success' => false, 'error' => 'Votre dossier est déjà enregistré (Statut: ' . $existing['verification_status'] . ')']);
    }

    // Gestion du fichier photo
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
                'pending', 0, 100.00, NOW()
            )";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        'uid'     => $user['id'],
        'name'    => $fullName,
        'phone'   => $user['phone'],
        'commune' => $commune,
        'vtype'   => $vType,
        'brand'   => $brand,
        'color'   => $color,
        'plate'   => $plate,
        'photo'   => $relPath
    ]);

    // Passer le rôle utilisateur à driver
    $pdo->prepare("UPDATE telegram_users SET role = 'driver' WHERE id = :id")->execute(['id' => $user['id']]);

    jsonResponse(['success' => true, 'message' => 'Dossier transmis pour validation administrative']);
}

// Vérification que l'utilisateur a un profil chauffeur pour les actions suivantes
$stmtD = $pdo->prepare("SELECT * FROM driver_profiles WHERE telegram_user_id = :uid LIMIT 1");
$stmtD->execute(['uid' => $user['id']]);
$driver = $stmtD->fetch(PDO::FETCH_ASSOC);

if (!$driver || $driver['verification_status'] !== 'approved') {
    jsonResponse(['success' => false, 'error' => 'Compte chauffeur non approuvé'], 403);
}

// -------------------------------------------------------------------------
// 2. MISE À JOUR GPS EN ARRIÈRE-PLAN (Toutes les 59 secondes)
// -------------------------------------------------------------------------
if ($action === 'update_gps') {
    $lat = (float)($input['lat'] ?? 0);
    $lon = (float)($input['lon'] ?? 0);

    if ($lat && $lon) {
        $stmtGps = $pdo->prepare("
            UPDATE telegram_users 
            SET latitude = :lat, longitude = :lon, gps_updated_at = NOW() 
            WHERE id = :id 
              AND (gps_updated_at IS NULL OR gps_updated_at <= (NOW() - INTERVAL 59 SECOND))
        ");
        $stmtGps->execute(['lat' => $lat, 'lon' => $lon, 'id' => $user['id']]);

        // Maintien automatique du chauffeur en ligne
        $pdo->prepare("UPDATE driver_profiles SET is_online = 1 WHERE id = :did")->execute(['did' => $driver['id']]);

        jsonResponse(['success' => true]);
    }
    jsonResponse(['success' => false, 'error' => 'Coordonnées GPS invalides']);
}

// -------------------------------------------------------------------------
// 3. POOL DES DEMANDES DISPONIBLES DANS LE SECTEUR
// -------------------------------------------------------------------------
if ($action === 'pool') {
    $sql = "SELECT id, code, pickup_address, delivery_address, estimated_price, distance_km, 
                   is_round_trip, parcel_description, DATE_FORMAT(created_at, '%H:%i') as time
            FROM parcel_orders
            WHERE status = 'SEARCHING'
              AND pickup_commune = :commune
              AND FIND_IN_SET(:vtype, vehicle_type) > 0
              AND created_at >= (NOW() - INTERVAL 3 HOUR)
              AND id NOT IN (SELECT parcel_order_id FROM parcel_bids WHERE driver_id = :did)
            ORDER BY id DESC LIMIT 20";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        'commune' => $driver['commune_name'],
        'vtype'   => $driver['vehicle_type'],
        'did'     => $driver['id']
    ]);

    jsonResponse(['success' => true, 'pool' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

// -------------------------------------------------------------------------
// 4. SOUMISSION D'UNE OFFRE DE PRIX (BID)
// -------------------------------------------------------------------------
if ($action === 'submit_bid') {
    $orderId = (int)($input['order_id'] ?? 0);
    $amount  = (float)($input['amount'] ?? 0);

    // Vérifier si le chauffeur est déjà en cours de livraison aujourd'hui
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
    // Récupérer le push_token du client expéditeur
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
        "💰 Nouvelle offre de prix reçue !",
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
    $step    = trim($input['step'] ?? ''); // 'PICKED_UP' ou 'DELIVERED'

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
