<?php
// api/push_helper.php

/**
 * Envoie une notification Push Expo à un ou plusieurs push_tokens
 *
 * @param array|string $pushTokens Un token ou un tableau de tokens Expo (ExponentPushToken[...])
 * @param string $title Titre de la notification
 * @param string $body Message de la notification
 * @param array $data Données embarquées pour la navigation au clic (ex: ['screen' => 'Orders', 'orderId' => 15, 'targetRole' => 'customer'])
 */
function sendExpoPushNotifications($pushTokens, $title, $body, $data = []) {
    if (empty($pushTokens)) {
        return false;
    }

    if (!is_array($pushTokens)) {
        $pushTokens = [$pushTokens];
    }

    // Filtrer uniquement les tokens Expo valides
    $validTokens = array_values(array_unique(array_filter($pushTokens, function($token) {
        return !empty($token) && (strpos($token, 'ExponentPushToken[') === 0 || strpos($token, 'ExpoPushToken[') === 0);
    })));

    if (empty($validTokens)) {
        return false;
    }

    $messages = [];
    foreach ($validTokens as $token) {
        $messages[] = [
            'to' => $token,
            'sound' => 'default',
            'title' => $title,
            'body' => $body,
            'priority' => 'high',
            'channelId' => 'default',
            'data' => (object)$data,
        ];
    }

    $ch = curl_init('https://exp.host/--/api/v2/push/send');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: application/json',
        'Content-Type: application/json',
    ]);
    curl_setopt($ch, CURLOPT_ENCODING, '');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($messages));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    $response = curl_exec($ch);
    if ($response === false) {
        error_log('[push] curl: ' . curl_error($ch));
    } elseif (strpos($response, '"error"') !== false) {
        error_log('[push] expo: ' . $response);
    }
    curl_close($ch);

    return $response;
}