<?php
class Config
{
    // Domaine public
    public static $baseUrl  = 'https://livrili.bouhezila.com';

    // Jeton Cron
    public static $cronSecretToken = '@2026livrili';

    // Client IDs OAuth Google acceptés (Android + Web) — Google Cloud Console
    public static $googleClientIds = [
        '185591388050-l57mmdjc1j8aod1a41453i4da891caoo.apps.googleusercontent.com',
        '185591388050-cmmhb1hndmqmkfnl5dpvm360k142uvkd.apps.googleusercontent.com',
    ];

    // Cache GPS en minutes
    public static $gpsCacheValidityMinutes = 60;

    // Validation des téléphones en Algérie
    public static $phoneValidation = [
        'prefixes'    => ['05', '06', '07'],
        'length'      => 10,
        'countryCode' => '+213'
    ];

    /**
     * Convertit un numéro local (06..., 05..., 07...) en format d'appel international cliquable
     */
    public static function formatPhoneLink(string $phone): string
    {
        $clean = preg_replace('/[^\d]/', '', $phone);
        if (str_starts_with($clean, '0')) {
            $intl = '+213' . substr($clean, 1);
        } elseif (str_starts_with($clean, '213')) {
            $intl = '+' . $clean;
        } else {
            $intl = '+' . $clean;
        }
        return '<a href="tel:' . $intl . '">📞 ' . htmlspecialchars($phone) . '</a> (<code>' . htmlspecialchars($phone) . '</code>)';
    }
}