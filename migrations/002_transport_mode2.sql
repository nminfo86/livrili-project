-- 1. Création de la table des modes de transport
CREATE TABLE IF NOT EXISTS `transport_modes` (
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
  `sort_order` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Insertion des véhicules avec vos règles tarifaires
INSERT INTO `transport_modes` 
(`id`, `title_fr`, `title_ar`, `icon`, `color`, `is_active`, `pricing_mode`, `base_price`, `base_km`, `commune_max_km`, `per_km`, `round_trip_multiplier`, `search_radius_km`, `bid_step`, `sort_order`) VALUES
('moto', 'Moto', 'دراجة نارية', 'motorbike', '#006233', 1, 'per_km', 200, 2.0, 5.0, 50, 1.6, 4.0, 50, 1),
('voiture', 'Voiture', 'سيارة', 'car', '#2563EB', 0, 'per_km', 350, 2.0, 5.0, 70, 1.6, 6.0, 100, 2),
('camionnette', 'Harbin / Chana', 'شاحنة صغيرة', 'truck-flatbed', '#D97706', 1, 'flat_commune', 600, 2.0, 5.0, 100, 1.5, 8.0, 100, 3),
('fourgon', 'Fourgon', 'فورغون', 'truck-delivery', '#4F46E5', 1, 'flat_commune', 900, 2.0, 5.0, 150, 1.5, 10.0, 200, 4)
ON DUPLICATE KEY UPDATE
  `pricing_mode` = VALUES(`pricing_mode`),
  `base_price` = VALUES(`base_price`),
  `commune_max_km` = VALUES(`commune_max_km`),
  `per_km` = VALUES(`per_km`);

-- 3. Convertir l'ENUM de driver_profiles en VARCHAR pour supporter tout futur véhicule en BDD
ALTER TABLE `driver_profiles` 
  MODIFY `vehicle_type` varchar(30) NOT NULL DEFAULT 'moto';

-- 4. Ajouter la commune de destination dans parcel_orders (optionnel mais utile pour l'historique)
ALTER TABLE `parcel_orders`
  ADD COLUMN IF NOT EXISTS `delivery_commune` varchar(100) DEFAULT NULL AFTER `delivery_lon`;