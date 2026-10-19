<?php
// api/auth.php
require_once __DIR__ . '/bootstrap.php';

$action = $_GET['action'] ?? '';
$input = getJsonInput();

// -------------------------------------------------------------
// 1. INSCRIPTION PAR EMAIL & MOT DE PASSE (Sans Téléphone)
// -------------------------------------------------------------
if ($action === 'register_email') {
    $fullName = trim($input['full_name'] ?? '');
    $email    = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
    $password = trim($input['password'] ?? '');
    $role     = in_array($input['role'] ?? '', ['customer', 'driver']) ? $input['role'] : 'customer';

    if (!$email || strlen($password) < 6) {
        jsonResponse(['success' => false, 'error' => 'Email invalide ou mot de passe trop court (min 6 caractères).']);
    }

    $stmtCheck = $pdo->prepare("SELECT id FROM telegram_users WHERE email = :e LIMIT 1");
    $stmtCheck->execute(['e' => $email]);
    if ($stmtCheck->fetch()) {
        jsonResponse(['success' => false, 'error' => 'Cet email est déjà utilisé.']);
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    $token = bin2hex(random_bytes(32));

    $stmt = $pdo->prepare("
        INSERT INTO telegram_users (full_name, email, password_hash, role, current_mode, auth_token, status, lang, created_at)
        VALUES (:name, :email, :pass, :role, :role, :tok, 'active', 'fr', NOW())
    ");
    $stmt->execute([
        'name'  => $fullName ?: 'Utilisateur',
        'email' => $email,
        'pass'  => $passwordHash,
        'role'  => $role,
        'tok'   => $token
    ]);
    $userId = (int)$pdo->lastInsertId();

    jsonResponse([
        'success' => true,
        'token'   => $token,
        'user'    => [
            'id'           => $userId,
            'full_name'    => $fullName,
            'email'        => $email,
            'phone'        => null,
            'role'         => $role,
            'current_mode' => $role
        ]
    ]);
}

// -------------------------------------------------------------
// 2. CONNEXION PAR EMAIL & MOT DE PASSE
// -------------------------------------------------------------
if ($action === 'login_email') {
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
if ($action === 'login_google') {
    $googleId = trim($input['google_id'] ?? '');
    $email    = filter_var(trim($input['email'] ?? ''), FILTER_VALIDATE_EMAIL);
    $fullName = trim($input['full_name'] ?? 'Utilisateur Google');

    if (!$email || !$googleId) {
        jsonResponse(['success' => false, 'error' => 'Données Google incomplètes.']);
    }

    $stmt = $pdo->prepare("SELECT * FROM telegram_users WHERE email = :e OR google_id = :gid LIMIT 1");
    $stmt->execute(['e' => $email, 'gid' => $googleId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    $token = bin2hex(random_bytes(32));

    if ($user) {
        $pdo->prepare("UPDATE telegram_users SET google_id = :gid, auth_token = :tok WHERE id = :id")
            ->execute(['gid' => $googleId, 'tok' => $token, 'id' => $user['id']]);
        $userId = (int)$user['id'];
        $role = $user['role'];
        $currentMode = $user['current_mode'];
        $phone = $user['phone'];
    } else {
        $stmtIns = $pdo->prepare("
            INSERT INTO telegram_users (full_name, email, google_id, role, current_mode, auth_token, status, lang, created_at)
            VALUES (:name, :email, :gid, 'customer', 'customer', :tok, 'active', 'fr', NOW())
        ");
        $stmtIns->execute(['name' => $fullName, 'email' => $email, 'gid' => $googleId, 'tok' => $token]);
        $userId = (int)$pdo->lastInsertId();
        $role = 'customer';
        $currentMode = 'customer';
        $phone = null;
    }

    jsonResponse([
        'success' => true,
        'token'   => $token,
        'user'    => [
            'id'           => $userId,
            'full_name'    => $fullName,
            'email'        => $email,
            'phone'        => $phone,
            'role'         => $role,
            'current_mode' => $currentMode
        ]
    ]);
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
    $user = requireAuth($pdo);
    $pushToken = trim($input['push_token'] ?? '');

    if (!empty($pushToken)) {
        $stmt = $pdo->prepare("UPDATE telegram_users SET push_token = :token WHERE id = :id");
        $stmt->execute(['token' => $pushToken, 'id' => $user['id']]);
        jsonResponse(['success' => true]);
    }

    jsonResponse(['success' => false, 'error' => 'Token manquant']);
}

jsonResponse(['success' => false, 'error' => 'Action d\'authentification non reconnue'], 404);