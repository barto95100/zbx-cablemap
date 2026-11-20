<?php declare(strict_types = 0);

namespace Modules\Cablemap\Lib;

/**
 * Charge config.default.json puis la surcharge (fusion récursive) avec config.json s'il existe.
 * config.json est le fichier local de l'utilisateur : il n'est jamais écrasé par un déploiement.
 */
class Config {

	private static ?array $cache = null;

	public static function get(): array {
		if (self::$cache !== null) {
			return self::$cache;
		}

		$dir = dirname(__DIR__);
		$cfg = self::read($dir.'/config.default.json');
		$local = self::read($dir.'/config.json');

		self::$cache = self::merge($cfg, $local);

		return self::$cache;
	}

	private static function read(string $file): array {
		if (!is_file($file)) {
			return [];
		}
		$decoded = json_decode((string) file_get_contents($file), true);

		return is_array($decoded) ? $decoded : [];
	}

	/** Les listes (tableaux indexés) du local remplacent celles par défaut ; les objets sont fusionnés. */
	private static function merge(array $base, array $over): array {
		foreach ($over as $k => $v) {
			if (is_array($v) && isset($base[$k]) && is_array($base[$k]) && self::isAssoc($v) && self::isAssoc($base[$k])) {
				$base[$k] = self::merge($base[$k], $v);
			}
			else {
				$base[$k] = $v;
			}
		}

		return $base;
	}

	private static function isAssoc(array $a): bool {
		return $a !== [] && array_keys($a) !== range(0, count($a) - 1);
	}
}
