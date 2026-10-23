<?php
// api/auth.php
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/push_helper.php';

$action = $_GET['action'] ?? '';
$input = getJsonInput();

// -------------------------------------------------------------
// 1. INSCRIPTION PAR EMAIL & MOT DE PASSE (Sans Téléphone)
// -------------------------------------------------------------
if ($action === 'register') {
    $fullName = trim($input['full_name'] ?? '');
    $phone    = trim($input['phone'] ?? '');
    $email    = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';
    $role     = in_array($input['role'] ?? '', ['customer', 'driver']) ? $input['role'] : 'customer';
    $otpCode  = trim($input['otp_code'] ?? '');

    // Vérification du code OTP à 6 chiffres
    $otpFile = sys_get_temp_dir() . '/livrili_otp_' . md5($email) . '.json';
    if (file_exists($otpFile)) {
        $savedOtp = json_decode(file_get_contents($otpFile), true);
        if (!$savedOtp || $savedOtp['otp'] !== $otpCode || time() > $savedOtp['expires']) {
            http_response_code(400);
            echo json_encode(['error' => 'Code OTP à 6 chiffres incorrect ou expiré.']);
            exit;
        }
        @unlink($otpFile);
    }

    $chk = $pdo->prepare("SELECT id FROM telegram_users WHERE email = ? OR phone = ? LIMIT 1");
    $chk->execute([$email, $phone]);
    if ($chk->fetch()) {
        http_response_code(400);
        echo json_encode(['error' => 'Cet email ou téléphone est déjà utilisé.']);
        exit;
    }

    $hash  = password_hash($password, PASSWORD_BCRYPT);
    $token = bin2hex(random_bytes(32));

    $lat     = isset($input['latitude']) ? (float)$input['latitude'] : null;
    $lon     = isset($input['longitude']) ? (float)$input['longitude'] : null;
    $commune = trim($input['commune_name'] ?? 'El Eulma');

    $ins = $pdo->prepare("
        INSERT INTO telegram_users 
        (full_name, phone, email, password_hash, auth_token, role, current_mode, status, latitude, longitude, commune_name, gps_updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NOW())
    ");
    $ins->execute([$fullName, $phone, $email, $hash, $token, $role, $role, $lat, $lon, $commune]);
    $userId = (int)$pdo->lastInsertId();

    // Si l'utilisateur s'inscrit comme LIVREUR, créer son profil dans driver_profiles
    if ($role === 'driver') {
        $vehicleType = in_array($input['vehicle_type'] ?? '', ['moto', 'camionnette', 'fourgon'])
            ? $input['vehicle_type']
            : 'moto';
        $commune     = trim($input['commune_name'] ?? 'El Eulma');
        $motoBrand   = trim($input['moto_brand'] ?? 'Moto');
        $motoColor   = trim($input['moto_color'] ?? 'Standard');
        $plateNumber = trim($input['plate_number'] ?? '');
        $photoBase64 = $input['photo_moto'] ?? '';

        $savedPhotoPath = 'uploads/drivers/default.jpg';
        if (!empty($photoBase64) && strpos($photoBase64, 'base64,') !== false) {
            $uploadDir = __DIR__ . '/../uploads/drivers/';
            if (!is_dir($uploadDir)) {
                @mkdir($uploadDir, 0755, true);
            }
            $parts = explode('base64,', $photoBase64);
            $imgData = base64_decode($parts[1]);
            $fileName = 'driver_' . $userId . '_' . time() . '.jpg';
            if (file_put_contents($uploadDir . $fileName, $imgData)) {
                $savedPhotoPath = 'uploads/drivers/' . $fileName;
            }
        }

        $drvIns = $pdo->prepare("
            INSERT INTO driver_profiles
            (telegram_user_id, full_name, phone, wilaya_code, commune_name, vehicle_type, moto_brand, moto_color, plate_number, photo_moto, verification_status, is_online)
            VALUES (?, ?, ?, 19, ?, ?, ?, ?, ?, ?, 'approved', 1)
        ");
        $drvIns->execute([
            $userId,
            $fullName,
            $phone,
            $commune,
            $vehicleType,
            $motoBrand,
            $motoColor,
            $plateNumber,
            $savedPhotoPath
        ]);
    }

    $stmt = $pdo->prepare("SELECT * FROM telegram_users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    unset($user['password_hash']);

    echo json_encode([
        'success' => true,
        'token' => $token,
        'user' => $user
    ]);
    exit;
}

// -------------------------------------------------------------------------
// 5. ACTIVATION PROFIL LIVREUR DEPUIS UN COMPTE CLIENT (SettingsScreen)
// -------------------------------------------------------------------------
if ($action === 'upgrade_to_driver') {
    $user = requireAuth($pdo);
    $commune = trim($input['commune_name'] ?? 'El Eulma');
    $vType   = trim($input['vehicle_type'] ?? 'moto');
    $brand   = trim($input['moto_brand'] ?? '');
    $color   = trim($input['moto_color'] ?? 'Standard');
    $plate   = trim($input['plate_number'] ?? '');
    $lat     = (float)($input['latitude'] ?? 36.1528);
    $lon     = (float)($input['longitude'] ?? 5.6902);

    // Vérifier que le vehicle_type existe dans transport_modes
    $stmtMode = $pdo->prepare("SELECT id FROM transport_modes WHERE id = :id LIMIT 1");
    $stmtMode->execute(['id' => $vType]);
    if (!$stmtMode->fetchColumn()) {
        $vType = 'moto';
    }

    $stmtCheck = $pdo->prepare("SELECT id FROM driver_profiles WHERE telegram_user_id = :uid LIMIT 1");
    $stmtCheck->execute(['uid' => $user['id']]);
    $existingId = $stmtCheck->fetchColumn();

    if ($existingId) {
        $pdo->prepare("
            UPDATE driver_profiles 
            SET commune_name = :c, vehicle_type = :v, moto_brand = :b, moto_color = :col, plate_number = :p, verification_status = 'approved', is_online = 1
            WHERE id = :id
        ")->execute(['c' => $commune, 'v' => $vType, 'b' => $brand, 'col' => $color, 'p' => $plate, 'id' => $existingId]);
    } else {
        $pdo->prepare("
            INSERT INTO driver_profiles (
                telegram_user_id, full_name, phone, wilaya_code, commune_name,
                vehicle_type, moto_brand, moto_color, plate_number, photo_moto,
                verification_status, is_online, rating, created_at
            ) VALUES (
                :uid, :name, :phone, 19, :c,
                :v, :b, :col, :p, '',
                'approved', 1, 100.00, NOW()
            )
        ")->execute([
            'uid'   => $user['id'],
            'name'  => $user['full_name'] ?: 'Livreur Livrili',
            'phone' => $user['phone'] ?: '',
            'c'     => $commune,
            'v'     => $vType,
            'b'     => $brand,
            'col'   => $color,
            'p'     => $plate
        ]);
    }

    $pdo->prepare("UPDATE telegram_users SET role = 'driver', current_mode = 'driver', commune_name = :c, latitude = :lat, longitude = :lon, gps_updated_at = NOW() WHERE id = :uid")
        ->execute(['c' => $commune, 'lat' => $lat, 'lon' => $lon, 'uid' => $user['id']]);

    jsonResponse([
        'success' => true,
        'user'    => [
            'id'           => (int)$user['id'],
            'full_name'    => $user['full_name'],
            'phone'        => $user['phone'],
            'email'        => $user['email'],
            'role'         => 'driver',
            'current_mode' => 'driver',
            'commune_name' => $commune,
            'vehicle_type' => $vType
        ]
    ]);
}

// 1. AJOUTEZ CE BLOC DANS api/auth.php POUR ENVOYER LE CODE OTP À 6 CHIFFRES :
if ($action === 'send_otp') {
    $email = trim($input['email'] ?? '');
    $phone = trim($input['phone'] ?? '');

    if (empty($email) || empty($phone)) {
        http_response_code(400);
        echo json_encode(['error' => 'Email et téléphone requis']);
        exit;
    }

    // Vérifier si l'email ou le téléphone existe déjà
    $chk = $pdo->prepare("SELECT id FROM telegram_users WHERE email = ? OR phone = ? LIMIT 1");
    $chk->execute([$email, $phone]);
    if ($chk->fetch()) {
        http_response_code(400);
        echo json_encode(['error' => 'Cet email ou numéro de téléphone est déjà utilisé.']);
        exit;
    }

    $otp = (string)random_int(100000, 999999);

    // Stocker temporairement l'OTP dans platform_settings ou session fichier
    $otpFile = sys_get_temp_dir() . '/livrili_otp_' . md5(strtolower($email)) . '.json';
    file_put_contents($otpFile, json_encode([
        'otp' => $otp,
        'expires' => time() + 600
    ]));

    // Envoi par email (si mail() est configuré sur le serveur)
    @mail($email, "Votre code de verification Livrili DZ", "Votre code OTP a 6 chiffres est : $otp");

    echo json_encode([
        'success' => true,
        'message' => 'Code OTP à 6 chiffres envoyé',
        'dev_otp' => $otp // Affiché pour faciliter vos tests si le serveur SMTP n'est pas encore actif
    ]);
    exit;
}


// 1. DEMANDE DE RÉINITIALISATION DE MOT DE PASSE (Envoi OTP à 6 chiffres)
if ($action === 'forgot_password') {
    $identifier = trim($input['identifier'] ?? '');

    if (empty($identifier)) {
        http_response_code(400);
        echo json_encode(['error' => 'Veuillez saisir votre email ou votre numéro de téléphone.']);
        exit;
    }

    // Chercher l'utilisateur par email ou téléphone dans telegram_users
    $stmt = $pdo->prepare("SELECT id, full_name, email, phone FROM telegram_users WHERE email = ? OR phone = ? LIMIT 1");
    $stmt->execute([strtolower($identifier), $identifier]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(404);
        echo json_encode(['error' => 'Aucun compte trouvé avec cet email ou numéro de téléphone.']);
        exit;
    }

    // Générer le code OTP à 6 chiffres valable 10 minutes
    $otp = (string)random_int(100000, 999999);
    $upd = $pdo->prepare("
        UPDATE telegram_users 
        SET otp_code = ?, otp_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) 
        WHERE id = ?
    ");
    $upd->execute([$otp, $user['id']]);

    // Envoyer par email si l'utilisateur a une adresse email
    $mailSent = false;
    if (!empty($user['email'])) {
        $host = $_SERVER['HTTP_HOST'] ?? 'livrili.com';
        $subject = "Reinitialisation de votre mot de passe Livrili DZ : $otp";
        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-type: text/html; charset=UTF-8\r\n";
        $headers .= "From: Livrili DZ <no-reply@" . $host . ">\r\n";

        $htmlBody = "
        <div style='font-family:Arial,sans-serif;padding:20px;border:1px solid #e2e8f0;border-radius:12px;max-width:420px;'>
            <h2 style='color:#006233;margin-top:0;'>LIVRILI DZ - Mot de passe oublié</h2>
            <p>Bonjour <b>" . htmlspecialchars($user['full_name'] ?? 'Utilisateur') . "</b>,</p>
            <p>Voici votre code à 6 chiffres pour réinitialiser votre mot de passe :</p>
            <div style='background:#E6F2EC;color:#006233;font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;padding:14px;border-radius:8px;margin:16px 0;'>
                $otp
            </div>
            <p style='color:#64748B;font-size:12px;'>Ce code expire dans 10 minutes.</p>
        </div>";

        $mailSent = @mail($user['email'], $subject, $htmlBody, $headers);
    }

    echo json_encode([
        'success'   => true,
        'mail_sent' => $mailSent,
        'dev_otp'   => $otp, // Pour test rapide si l'email met du temps à arriver
        'message'   => 'Un code de récupération à 6 chiffres a été généré.'
    ]);
    exit;
}

// 2. VALIDATION DU CODE OTP ET CHANGEMENT DU MOT DE PASSE
if ($action === 'reset_password') {
    $identifier  = trim($input['identifier'] ?? '');
    $otpCode     = trim($input['otp_code'] ?? '');
    $newPassword = $input['new_password'] ?? '';

    if (empty($identifier) || empty($otpCode) || empty($newPassword)) {
        http_response_code(400);
        echo json_encode(['error' => 'Tous les champs sont obligatoires.']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT * FROM telegram_users WHERE email = ? OR phone = ? LIMIT 1");
    $stmt->execute([strtolower($identifier), $identifier]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(404);
        echo json_encode(['error' => 'Compte introuvable.']);
        exit;
    }

    if (empty($user['otp_code']) || (string)$user['otp_code'] !== (string)$otpCode) {
        http_response_code(400);
        echo json_encode(['error' => 'Le code à 6 chiffres est incorrect.']);
        exit;
    }

    if (!empty($user['otp_expires_at']) && strtotime($user['otp_expires_at']) < time()) {
        http_response_code(400);
        echo json_encode(['error' => 'Ce code OTP a expiré. Veuillez en demander un nouveau.']);
        exit;
    }

    // Hasher le nouveau mot de passe et effacer le code OTP
    $hash  = password_hash($newPassword, PASSWORD_BCRYPT);
    $token = bin2hex(random_bytes(32));

    $upd = $pdo->prepare("
        UPDATE telegram_users 
        SET password_hash = ?, otp_code = NULL, otp_expires_at = NULL, auth_token = ? 
        WHERE id = ?
    ");
    $upd->execute([$hash, $token, $user['id']]);

    $user['auth_token'] = $token;
    unset($user['password_hash'], $user['otp_code']);

    echo json_encode([
        'success' => true,
        'token'   => $token,
        'user'    => $user,
        'message' => 'Mot de passe modifié avec succès !'
    ]);
    exit;
}

// -------------------------------------------------------------
// 2. CONNEXION PAR EMAIL & MOT DE PASSE
// -------------------------------------------------------------
if ($action === 'login') {
    $email    = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
    $password = trim($input['password'] ?? '');

    $stmt = $pdo->prepare("SELECT * FROM telegram_users WHERE email = :e LIMIT 1");
    $stmt->execute(['e' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user || !password_verify($password, $user['password_hash'] ?? '')) {
        jsonResponse(['success' => false, 'error' => 'Identifiants incorrects.']);
    }

    $token = bin2hex(random_bytes(32));
    $pdo->prepare("UPDATE telegram_users SET auth_token = :tok WHERE id = :id")->execute(['tok' => $token, 'id' => $user['id']]);

    jsonResponse([
        'success' => true,
        'token'   => $token,
        'user'    => [
            'id'           => (int)$user['id'],
            'full_name'    => $user['full_name'],
            'email'        => $user['email'],
            'phone'        => $user['phone'],
            'role'         => $user['role'],
            'current_mode' => $user['current_mode']
        ]
    ]);
}

// -------------------------------------------------------------
// 3. AUTHENTIFICATION GOOGLE (SSO)
// -------------------------------------------------------------
// Dans api/auth.php, assurez-vous que le bloc google_login accepte l'email direct :
if ($action === 'google_login') {
    $email = trim($input['email'] ?? '');
    $fullName = trim($input['full_name'] ?? 'Utilisateur Google');
    $googleId = trim($input['google_id'] ?? ('g_' . md5($email)));

    if (empty($email)) {
        http_response_code(400);
        echo json_encode(['error' => 'Email Google manquant']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT * FROM telegram_users WHERE email = ? OR google_id = ? LIMIT 1");
    $stmt->execute([$email, $googleId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    $token = bin2hex(random_bytes(32));

    if ($user) {
        $upd = $pdo->prepare("UPDATE telegram_users SET auth_token = ?, google_id = COALESCE(google_id, ?) WHERE id = ?");
        $upd->execute([$token, $googleId, $user['id']]);
        $user['auth_token'] = $token;
    } else {
        $ins = $pdo->prepare("INSERT INTO telegram_users (full_name, email, google_id, auth_token, role, current_mode, status) VALUES (?, ?, ?, ?, 'customer', 'customer', 'active')");
        $ins->execute([$fullName, $email, $googleId, $token]);
        $newId = $pdo->lastInsertId();
        $stmt = $pdo->prepare("SELECT * FROM telegram_users WHERE id = ?");
        $stmt->execute([$newId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    unset($user['password_hash']);
    echo json_encode([
        'success' => true,
        'token' => $token,
        'user' => $user
    ]);
    exit;
}

// -------------------------------------------------------------
// 4. ACTUALISATION DU NUMÉRO DE TÉLÉPHONE (Premier Ordre)
// -------------------------------------------------------------
if ($action === 'update_phone') {
    $user = requireAuth($pdo);
    $phone = preg_replace('/[^\d]/', '', $input['phone'] ?? '');

    if (strlen($phone) !== 10 || !in_array(substr($phone, 0, 2), ['05', '06', '07'])) {
        jsonResponse(['success' => false, 'error' => 'Numéro invalide (doit commencer par 05, 06 ou 07).']);
    }

    $stmtCheck = $pdo->prepare("SELECT id FROM telegram_users WHERE phone = :p AND id != :uid LIMIT 1");
    $stmtCheck->execute(['p' => $phone, 'uid' => $user['id']]);
    if ($stmtCheck->fetch()) {
        jsonResponse(['success' => false, 'error' => 'Ce numéro de téléphone est déjà associé à un autre compte.']);
    }

    $pdo->prepare("UPDATE telegram_users SET phone = :p WHERE id = :uid")->execute(['p' => $phone, 'uid' => $user['id']]);

    jsonResponse(['success' => true, 'phone' => $phone]);
}

// -------------------------------------------------------------------------
// 1. DEMANDE D'OTP : Envoi d'un code de vérification à l'email du client
// -------------------------------------------------------------------------
if ($action === 'request_otp') {
    $phone = preg_replace('/[^\d]/', '', $input['phone'] ?? '');
    $email = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);

    if (strlen($phone) !== 10 || !in_array(substr($phone, 0, 2), ['05', '06', '07'])) {
        jsonResponse(['success' => false, 'error' => 'Numéro invalide (doit commencer par 05, 06 ou 07 et faire 10 chiffres)']);
    }

    if (!$email) {
        jsonResponse(['success' => false, 'error' => 'Adresse email valide requise pour recevoir le code']);
    }

    // Génération d'un code OTP aléatoire à 4 chiffres (valable 10 minutes)
    $otp = (string)random_int(1000, 9999);
    $expiresAt = date('Y-m-d H:i:s', strtotime('+10 minutes'));

    // Créer ou mettre à jour l'utilisateur
    $stmtCheck = $pdo->prepare("SELECT id FROM telegram_users WHERE phone = :p LIMIT 1");
    $stmtCheck->execute(['p' => $phone]);
    $existing = $stmtCheck->fetch();

    if ($existing) {
        $stmtUp = $pdo->prepare("
            UPDATE telegram_users 
            SET email = :email, otp_code = :otp, otp_expires_at = :exp 
            WHERE id = :id
        ");
        $stmtUp->execute(['email' => $email, 'otp' => $otp, 'exp' => $expiresAt, 'id' => $existing['id']]);
    } else {
        $stmtIns = $pdo->prepare("
            INSERT INTO telegram_users (phone, email, otp_code, otp_expires_at, role, current_mode, status, lang, created_at)
            VALUES (:p, :email, :otp, :exp, 'customer', 'customer', 'active', 'fr', NOW())
        ");
        $stmtIns->execute(['p' => $phone, 'email' => $email, 'otp' => $otp, 'exp' => $expiresAt]);
    }

    // Envoi de l'email via la fonction mail() native du serveur
    $subject = "Votre code de connexion Livrili : {$otp}";
    $message = "
    <html>
    <head><title>Code Livrili</title></head>
    <body style='font-family: Arial, sans-serif; background-color: #f7f9fb; padding: 20px;'>
        <div style='max-width: 450px; margin: auto; background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #e0e0e0;'>
            <h2 style='color: #1976d2; margin-top: 0;'>Livrili Express 📦</h2>
            <p>Voici votre code de sécurité pour vous connecter à votre compte :</p>
            <div style='text-align: center; margin: 25px 0;'>
                <span style='font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1976d2; background: #e3f2fd; padding: 10px 20px; border-radius: 6px;'>{$otp}</span>
            </div>
            <p style='color: #666; font-size: 12px;'>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
        </div>
    </body>
    </html>
    ";

    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-type: text/html; charset=UTF-8\r\n";
    $headers .= "From: Livrili Authentification <no-reply@livrili.bouhezila.com>\r\n";

    @mail($email, $subject, $message, $headers);

    jsonResponse(['success' => true, 'message' => 'Code envoyé avec succès par email']);
}

// -------------------------------------------------------------------------
// 2. VÉRIFICATION DE L'OTP : Validation du code et délivrance du Token
// -------------------------------------------------------------------------
if ($action === 'verify_otp') {
    $phone = preg_replace('/[^\d]/', '', $input['phone'] ?? '');
    $otp   = trim($input['otp'] ?? '');

    if (empty($phone) || empty($otp)) {
        jsonResponse(['success' => false, 'error' => 'Numéro et code de validation requis']);
    }

    $stmt = $pdo->prepare("
        SELECT tu.*, dp.id AS driver_id, dp.verification_status, dp.vehicle_type, dp.is_online, dp.rating, dp.commune_name AS driver_commune
        FROM telegram_users tu
        LEFT JOIN driver_profiles dp ON dp.telegram_user_id = tu.id
        WHERE tu.phone = :p AND tu.otp_code = :otp AND tu.otp_expires_at >= NOW()
        LIMIT 1
    ");
    $stmt->execute(['p' => $phone, 'otp' => $otp]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        jsonResponse(['success' => false, 'error' => 'Code erroné ou expiré']);
    }

    // Génération d'un jeton d'authentification Bearer
    $authToken = bin2hex(random_bytes(32));

    // Suppression du code consommé et enregistrement du jeton
    $pdo->prepare("UPDATE telegram_users SET auth_token = :token, otp_code = NULL, otp_expires_at = NULL WHERE id = :id")
        ->execute(['token' => $authToken, 'id' => $user['id']]);

    jsonResponse([
        'success' => true,
        'token'   => $authToken,
        'user'    => [
            'id'           => (int)$user['id'],
            'full_name'    => $user['full_name'],
            'phone'        => $user['phone'],
            'email'        => $user['email'],
            'role'         => $user['role'],
            'current_mode' => $user['current_mode'],
            'commune_name' => $user['commune_name'] ?? 'El Eulma',
            'driver_profile' => $user['driver_id'] ? [
                'id'                  => (int)$user['driver_id'],
                'verification_status' => $user['verification_status'],
                'vehicle_type'        => $user['vehicle_type'],
                'is_online'           => (int)$user['is_online'],
                'rating'              => (float)$user['rating'],
                'commune_name'        => $user['driver_commune']
            ] : null
        ]
    ]);
}

// -------------------------------------------------------------------------
// 3. RÉCUPÉRATION DU PROFIL ACTIF (Auto-login avec le Token)
// -------------------------------------------------------------------------
if ($action === 'me') {
    $user = requireAuth($pdo);
    jsonResponse([
        'success' => true,
        'user'    => [
            'id'           => (int)$user['id'],
            'full_name'    => $user['full_name'],
            'phone'        => $user['phone'],
            'email'        => $user['email'],
            'role'         => $user['role'],
            'current_mode' => $user['current_mode'],
            'commune_name' => $user['commune_name'] ?? 'El Eulma',
            'driver_profile' => $user['driver_id'] ? [
                'id'                  => (int)$user['driver_id'],
                'verification_status' => $user['verification_status'],
                'vehicle_type'        => $user['vehicle_type'],
                'is_online'           => (int)$user['is_online'],
                'rating'              => (float)$user['rating']
            ] : null
        ]
    ]);
}

// -------------------------------------------------------------------------
// 4. BASCULE DU MODE (Client <-> Livreur)
// -------------------------------------------------------------------------
if ($action === 'switch_mode') {
    $user = requireAuth($pdo);
    $newMode = in_array($input['mode'] ?? '', ['customer', 'driver']) ? $input['mode'] : 'customer';

    if ($newMode === 'driver' && $user['role'] !== 'driver') {
        jsonResponse(['success' => false, 'error' => 'Vous n\'êtes pas encore inscrit en tant que transporteur']);
    }

    $pdo->prepare("UPDATE telegram_users SET current_mode = :m WHERE id = :id")
        ->execute(['m' => $newMode, 'id' => $user['id']]);

    jsonResponse(['success' => true, 'current_mode' => $newMode]);
}

// -------------------------------------------------------------------------
// ENREGISTREMENT DU TOKEN NOTIFICATION PUSH DU SMARTPHONE
// -------------------------------------------------------------------------

if ($action === 'save_push_token') {
    // $user correspond à l'utilisateur authentifié via le Bearer Token
     $user = requireAuth($pdo);

    $input = json_decode(file_get_contents('php://input'), true);
    $pushToken = isset($input['push_token']) ? trim($input['push_token']) : null;

    $stmt = $pdo->prepare("UPDATE telegram_users SET push_token = :token WHERE id = :id");
    $stmt->execute([
        ':token' => $pushToken,
        ':id'    => $user['id']
    ]);

    echo json_encode(['success' => true]);
    exit;
}

// -------------------------------------------------------------------------
// 5. ACTIVATION PROFIL LIVREUR DEPUIS UN COMPTE CLIENT (SettingsScreen)
// -------------------------------------------------------------------------
if ($action === 'upgrade_to_driver') {
    $user = requireAuth($pdo);
    $commune = trim($input['commune_name'] ?? 'El Eulma');
    $vType   = trim($input['vehicle_type'] ?? 'moto');
    $brand   = trim($input['moto_brand'] ?? '');
    $color   = trim($input['moto_color'] ?? 'Standard');
    $plate   = trim($input['plate_number'] ?? '');
    $lat     = (float)($input['latitude'] ?? 36.1528);
    $lon     = (float)($input['longitude'] ?? 5.6902);

    // Vérifier que le vehicle_type existe dans transport_modes
    $stmtMode = $pdo->prepare("SELECT id FROM transport_modes WHERE id = :id LIMIT 1");
    $stmtMode->execute(['id' => $vType]);
    if (!$stmtMode->fetchColumn()) {
        $vType = 'moto';
    }

    $stmtCheck = $pdo->prepare("SELECT id FROM driver_profiles WHERE telegram_user_id = :uid LIMIT 1");
    $stmtCheck->execute(['uid' => $user['id']]);
    $existingId = $stmtCheck->fetchColumn();

    if ($existingId) {
        $pdo->prepare("
            UPDATE driver_profiles 
            SET commune_name = :c, vehicle_type = :v, moto_brand = :b, moto_color = :col, plate_number = :p, verification_status = 'approved', is_online = 1
            WHERE id = :id
        ")->execute(['c' => $commune, 'v' => $vType, 'b' => $brand, 'col' => $color, 'p' => $plate, 'id' => $existingId]);
    } else {
        $pdo->prepare("
            INSERT INTO driver_profiles (
                telegram_user_id, full_name, phone, wilaya_code, commune_name,
                vehicle_type, moto_brand, moto_color, plate_number, photo_moto,
                verification_status, is_online, rating, created_at
            ) VALUES (
                :uid, :name, :phone, 19, :c,
                :v, :b, :col, :p, '',
                'approved', 1, 100.00, NOW()
            )
        ")->execute([
            'uid'   => $user['id'],
            'name'  => $user['full_name'] ?: 'Livreur Livrili',
            'phone' => $user['phone'] ?: '',
            'c'     => $commune,
            'v'     => $vType,
            'b'     => $brand,
            'col'   => $color,
            'p'     => $plate
        ]);
    }

    $pdo->prepare("UPDATE telegram_users SET role = 'driver', current_mode = 'driver', commune_name = :c, latitude = :lat, longitude = :lon, gps_updated_at = NOW() WHERE id = :uid")
        ->execute(['c' => $commune, 'lat' => $lat, 'lon' => $lon, 'uid' => $user['id']]);

    jsonResponse([
        'success' => true,
        'user'    => [
            'id'           => (int)$user['id'],
            'full_name'    => $user['full_name'],
            'phone'        => $user['phone'],
            'email'        => $user['email'],
            'role'         => 'driver',
            'current_mode' => 'driver',
            'commune_name' => $commune,
            'vehicle_type' => $vType
        ]
    ]);
}

jsonResponse(['success' => false, 'error' => 'Action d\'authentification non reconnue'], 404);
