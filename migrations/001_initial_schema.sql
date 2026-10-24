-- phpMyAdmin SQL Dump
-- version 5.0.4deb2+deb11u2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Oct 23, 2026 at 10:52 PM
-- Server version: 10.5.29-MariaDB-0+deb11u1
-- PHP Version: 7.4.33

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:01";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `c3_livrili_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `app_users`
--

CREATE TABLE `app_users` (
  `id` int(11) NOT NULL,
  `full_name` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `google_id` varchar(100) DEFAULT NULL,
  `otp_code` varchar(6) DEFAULT NULL,
  `otp_expires_at` datetime DEFAULT NULL,
  `auth_token` varchar(64) DEFAULT NULL,
  `push_token` varchar(255) DEFAULT NULL,
  `role` enum('customer','driver','admin') NOT NULL DEFAULT 'customer',
  `current_mode` enum('customer','driver','admin') NOT NULL DEFAULT 'customer',
  `status` enum('active','suspended','banned') NOT NULL DEFAULT 'active',
  `lang` varchar(5) NOT NULL DEFAULT 'fr',
  `suspended_until` datetime DEFAULT NULL,
  `strikes_count` int(11) NOT NULL DEFAULT 0,
  `current_state` text DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `commune_name` varchar(100) DEFAULT NULL,
  `gps_updated_at` datetime DEFAULT NULL,
  `bot_messages_history` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `driver_profiles`
--

CREATE TABLE `driver_profiles` (
  `id` int(11) NOT NULL,
  `app_user_id` int(11) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `wilaya_code` int(11) NOT NULL DEFAULT 19,
  `commune_name` varchar(100) NOT NULL,
  `vehicle_type` varchar(30) NOT NULL DEFAULT 'moto',
  `moto_brand` varchar(80) NOT NULL COMMENT 'Marque/Modèle du véhicule',
  `moto_color` varchar(40) NOT NULL COMMENT 'Couleur du véhicule',
  `plate_number` varchar(50) NOT NULL DEFAULT '',
  `photo_moto` varchar(255) NOT NULL COMMENT 'Photo du véhicule',
  `verification_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `is_online` tinyint(1) NOT NULL DEFAULT 0,
  `last_assigned_at` datetime DEFAULT NULL,
  `rating` decimal(5,2) NOT NULL DEFAULT 100.00,
  `missed_deliveries_count` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Triggers `driver_profiles`
--
DELIMITER $$
CREATE TRIGGER `trg_driver_before_update_rating` BEFORE UPDATE ON `driver_profiles` FOR EACH ROW BEGIN
    DECLARE v_deliv INT DEFAULT 0;
    DECLARE v_total INT DEFAULT 0;

    IF NEW.missed_deliveries_count <> OLD.missed_deliveries_count THEN
        SELECT COUNT(*) INTO v_deliv 
        FROM `parcel_orders` 
        WHERE `selected_driver_id` = NEW.id 
          AND `status` = 'DELIVERED';

        SET v_total = v_deliv + NEW.missed_deliveries_count;

        IF v_total > 0 THEN
            SET NEW.rating = LEAST(100.00, GREATEST(0.00, ROUND((v_deliv / v_total) * 100, 1)));
        ELSE
            SET NEW.rating = 100.00;
        END IF;
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `parcel_bids`
--

CREATE TABLE `parcel_bids` (
  `id` int(11) NOT NULL,
  `parcel_order_id` int(11) NOT NULL,
  `driver_id` int(11) NOT NULL,
  `bid_amount` double NOT NULL,
  `status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `parcel_orders`
--

CREATE TABLE `parcel_orders` (
  `id` int(11) NOT NULL,
  `code` varchar(50) NOT NULL,
  `sender_id` int(11) NOT NULL,
  `sender_phone` varchar(30) NOT NULL,
  `pickup_lat` decimal(10,8) NOT NULL,
  `pickup_lon` decimal(11,8) NOT NULL,
  `pickup_commune` varchar(100) NOT NULL,
  `pickup_address` varchar(255) NOT NULL,
  `delivery_lat` decimal(10,8) DEFAULT NULL,
  `delivery_lon` decimal(11,8) DEFAULT NULL,
  `delivery_commune` varchar(100) DEFAULT NULL,
  `delivery_address` varchar(255) NOT NULL,
  `recipient_phone` varchar(30) DEFAULT NULL,
  `payment_by` enum('sender','recipient') NOT NULL DEFAULT 'sender' COMMENT 'Qui paie la course : Départ ou Arrivée',
  `is_round_trip` tinyint(1) NOT NULL DEFAULT 0,
  `vehicle_type` varchar(30) NOT NULL DEFAULT 'moto',
  `parcel_description` varchar(500) NOT NULL,
  `parcel_photo` varchar(255) DEFAULT NULL,
  `distance_km` double NOT NULL DEFAULT 0,
  `estimated_price` double NOT NULL DEFAULT 200,
  `agreed_fee` double NOT NULL DEFAULT 0,
  `selected_driver_id` int(11) DEFAULT NULL,
  `status` enum('SEARCHING','DRIVER_ASSIGNED','PICKED_UP','DELIVERED','CANCELLED') NOT NULL DEFAULT 'SEARCHING',
  `comment` varchar(300) DEFAULT NULL,
  `disclaimer_accepted` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `accepted_at` datetime DEFAULT NULL,
  `picked_up_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Triggers `parcel_orders`
--
DELIMITER $$
CREATE TRIGGER `trg_parcel_after_update_rating` AFTER UPDATE ON `parcel_orders` FOR EACH ROW BEGIN
    DECLARE v_deliv INT DEFAULT 0;
    DECLARE v_dmiss INT DEFAULT 0;
    DECLARE v_driver_total INT DEFAULT 0;
    DECLARE v_driver_rate DOUBLE DEFAULT 100.00;

    IF NEW.selected_driver_id IS NOT NULL AND NEW.status <> OLD.status AND NEW.status = 'DELIVERED' THEN
        SELECT COUNT(*) INTO v_deliv 
        FROM `parcel_orders` 
        WHERE `selected_driver_id` = NEW.selected_driver_id 
          AND `status` = 'DELIVERED';

        SELECT IFNULL(`missed_deliveries_count`, 0) INTO v_dmiss 
        FROM `driver_profiles` 
        WHERE `id` = NEW.selected_driver_id;

        SET v_driver_total = v_deliv + v_dmiss;
        IF v_driver_total > 0 THEN
            SET v_driver_rate = ROUND((v_deliv / v_driver_total) * 100, 1);
        ELSE
            SET v_driver_rate = 100.00;
        END IF;

        UPDATE `driver_profiles` 
        SET `rating` = LEAST(100.00, GREATEST(0.00, v_driver_rate)) 
        WHERE `id` = NEW.selected_driver_id;
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `platform_settings`
--

CREATE TABLE `platform_settings` (
  `setting_key` varchar(50) NOT NULL,
  `setting_value` varchar(255) NOT NULL,
  `description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `platform_settings`
--

INSERT INTO `platform_settings` (`setting_key`, `setting_value`, `description`) VALUES
('base_km', '2', 'Kilomètres inclus dans le tarif de départ'),
('camionnette_min_fee', '600', 'Tarif minimum suggéré en Camionnette DFSK/Harbin (DA)'),
('camionnette_per_km', '100', 'Tarif par km supplémentaire en Camionnette (DA)'),
('fourgon_min_fee', '900', 'Tarif minimum suggéré en Fourgon (DA)'),
('fourgon_per_km', '150', 'Tarif par km supplémentaire en Fourgon (DA)'),
('moto_min_fee', '200', 'Tarif minimum suggéré en Moto (DA)'),
('moto_per_km', '50', 'Tarif par km supplémentaire en Moto (DA)'),
('super_admin_ids', '349957958', 'IDs Telegram des SuperAdmins séparés par des virgules'),
('voiture_min_fee', '350', 'Tarif minimum suggéré en Voiture (DA)'),
('voiture_per_km', '70', 'Tarif par km supplémentaire en Voiture (DA)'),
('whatsapp_business', '213552791323', 'Numéro WhatsApp Support sans le +');

-- --------------------------------------------------------

--
-- Table structure for table `transport_modes`
--

CREATE TABLE `transport_modes` (
  `id` varchar(30) NOT NULL,
  `title_fr` varchar(60) NOT NULL,
  `title_ar` varchar(60) DEFAULT NULL,
  `icon` varchar(50) NOT NULL DEFAULT 'motorbike',
  `color` varchar(20) NOT NULL DEFAULT '#006233',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `pricing_mode` enum('per_km','flat_commune') NOT NULL DEFAULT 'per_km' COMMENT 'per_km = Moto/Voiture | flat_commune = Forfait intra-commune puis km hors commune',
  `base_price` double NOT NULL DEFAULT 200 COMMENT 'Prix min (ou forfait intra-commune)',
  `base_km` double NOT NULL DEFAULT 2 COMMENT 'Km inclus dans base_price (mode per_km)',
  `commune_max_km` double NOT NULL DEFAULT 5 COMMENT 'Seuil rayon km considéré intra-commune',
  `per_km` double NOT NULL DEFAULT 50 COMMENT 'Prix par km supplémentaire',
  `round_trip_multiplier` double NOT NULL DEFAULT 1.6 COMMENT 'Multiplicateur Aller-Retour',
  `search_radius_km` double NOT NULL DEFAULT 4 COMMENT 'Rayon de recherche des livreurs',
  `bid_step` int(11) NOT NULL DEFAULT 50 COMMENT 'Pas d enchère livreur',
  `sort_order` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `transport_modes`
--

INSERT INTO `transport_modes` (`id`, `title_fr`, `title_ar`, `icon`, `color`, `is_active`, `pricing_mode`, `base_price`, `base_km`, `commune_max_km`, `per_km`, `round_trip_multiplier`, `search_radius_km`, `bid_step`, `sort_order`) VALUES
('camionnette', 'Harbin / DFSK', 'شاحنة صغيرة', 'truck-flatbed', '#D97706', 1, 'flat_commune', 600, 2, 5, 100, 1.5, 8, 100, 2),
('fourgon', 'Fourgon', 'فورغون', 'truck-delivery', '#4F46E5', 1, 'flat_commune', 900, 2, 5, 150, 1.5, 10, 200, 3),
('moto', 'Moto', 'دراجة نارية', 'motorbike', '#006233', 1, 'per_km', 200, 2, 5, 50, 1.6, 4, 50, 1),
('voiture', 'Voiture', 'سيارة', 'car', '#2563EB', 0, 'per_km', 350, 2, 5, 70, 1.6, 6, 100, 4);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `app_users`
--
ALTER TABLE `app_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_user_phone` (`phone`),
  ADD UNIQUE KEY `uniq_user_phone` (`phone`),
  ADD UNIQUE KEY `uniq_user_email` (`email`),
  ADD KEY `idx_role_mode` (`role`,`current_mode`),
  ADD KEY `idx_user_coords` (`latitude`,`longitude`),
  ADD KEY `idx_auth_token` (`auth_token`),
  ADD KEY `idx_google_id` (`google_id`);

--
-- Indexes for table `driver_profiles`
--
ALTER TABLE `driver_profiles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `telegram_user_id` (`app_user_id`),
  ADD KEY `idx_driver_dispatch` (`is_online`,`verification_status`,`commune_name`,`vehicle_type`),
  ADD KEY `idx_dp_vehicle_type` (`vehicle_type`);

--
-- Indexes for table `parcel_bids`
--
ALTER TABLE `parcel_bids`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_pbid_order` (`parcel_order_id`,`status`),
  ADD KEY `idx_pbid_driver` (`driver_id`);

--
-- Indexes for table `parcel_orders`
--
ALTER TABLE `parcel_orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_parcel_driver` (`selected_driver_id`),
  ADD KEY `idx_parcel_pool` (`status`,`pickup_commune`,`vehicle_type`,`created_at`),
  ADD KEY `idx_po_vehicle_type` (`vehicle_type`),
  ADD KEY `idx_parcel_sender` (`sender_id`);

--
-- Indexes for table `platform_settings`
--
ALTER TABLE `platform_settings`
  ADD PRIMARY KEY (`setting_key`);

--
-- Indexes for table `transport_modes`
--
ALTER TABLE `transport_modes`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `app_users`
--
ALTER TABLE `app_users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `driver_profiles`
--
ALTER TABLE `driver_profiles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `parcel_bids`
--
ALTER TABLE `parcel_bids`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `parcel_orders`
--
ALTER TABLE `parcel_orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `driver_profiles`
--
ALTER TABLE `driver_profiles`
  ADD CONSTRAINT `fk_driver_profiles_transport_mode` FOREIGN KEY (`vehicle_type`) REFERENCES `transport_modes` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_livrili_driver_user` FOREIGN KEY (`app_user_id`) REFERENCES `app_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `parcel_bids`
--
ALTER TABLE `parcel_bids`
  ADD CONSTRAINT `fk_pbid_driver` FOREIGN KEY (`driver_id`) REFERENCES `driver_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_pbid_order` FOREIGN KEY (`parcel_order_id`) REFERENCES `parcel_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `parcel_orders`
--
ALTER TABLE `parcel_orders`
  ADD CONSTRAINT `fk_parcel_driver` FOREIGN KEY (`selected_driver_id`) REFERENCES `driver_profiles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_parcel_orders_transport_mode` FOREIGN KEY (`vehicle_type`) REFERENCES `transport_modes` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_parcel_sender` FOREIGN KEY (`sender_id`) REFERENCES `app_users` (`id`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
