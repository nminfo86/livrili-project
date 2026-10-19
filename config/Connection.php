<?php

class Connection
{
    public static $host     = 'localhost';
    public static $db_name  = 'c3_livrili_db';
    public static $username = 'c3_livrili_user';
    public static $password = 'yi_PRQPrvw66';

    public static function getPDO(): PDO
    {
        $dsn = "mysql:host=" . self::$host . ";dbname=" . self::$db_name . ";charset=utf8mb4";
        return new PDO($dsn, self::$username, self::$password, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
    }
}