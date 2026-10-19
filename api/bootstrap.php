<?php
// api/bootstrap.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

date_default_timezone_set('Africa/Algiers');

require_once dirname(__DIR__) . '/config/config.php';
require_once dirname(__DIR__) . '/config/Connection.php';

try {
    $pdo = Connection::getPDO();
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => 'Erreur de connexion base de données']);
    exit;
}

function jsonResponse(array $data, int $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonInput(): array {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $_POST;
}

/**
 * Middleware d'authentification obligatoire par Token Bearer
 */
function requireAuth(PDO $pdo): array {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

    if (!preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        jsonResponse(['success' => false, 'error' => 'Accès refusé : jeton d\'authentification manquant'], 401);
    }

    $token = $matches[1];
    $stmt = $pdo->prepare("
        SELECT tu.*, dp.id AS driver_id, dp.verification_status, dp.vehicle_type, dp.is_online, dp.rating
        FROM telegram_users tu
        LEFT JOIN driver_profiles dp ON dp.telegram_user_id = tu.id
        WHERE tu.auth_token = :token AND tu.status = 'active'
        LIMIT 1
    ");
    $stmt->execute(['token' => $token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        jsonResponse(['success' => false, 'error' => 'Session expirée ou invalide'], 401);
    }

    return $user;
}

/**
 * Envoie une notification push native sur le smartphone (Android / iOS) via Expo
 */
function sendPushNotification(?string $expoPushToken, string $title, string $body, array $extraData = []): bool {
    if (empty($expoPushToken) || !str_starts_with($expoPushToken, 'ExponentPushToken')) {
        return false;
    }

    $payload = [
        'to'       => $expoPushToken,
        'sound'    => 'default',
        'title'    => $title,
        'body'     => $body,
        'priority' => 'high',
        'data'     => $extraData
    ];

    $ch = curl_init('https://exp.host/--/api/v2/push/send');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Accept: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);
    $res = curl_exec($ch);
    curl_close($ch);

    return $res !== false;
}