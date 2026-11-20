<?php declare(strict_types = 0);

namespace Modules\Cablemap\Lib;

/**
 * Motifs de clés d'item : "*" remplace n'importe quelle suite de caractères
 * (les crochets des clés Zabbix sont traités littéralement).
 */
class KeyMatch {

	public static function isWildcard(string $pattern): bool {
		return strpos($pattern, '*') !== false;
	}

	public static function matches(string $pattern, string $key): bool {
		$re = '/^'.str_replace('\*', '.*', preg_quote($pattern, '/')).'$/';

		return preg_match($re, $key) === 1;
	}

	/** Plus longue partie fixe du motif : sert de terme de recherche à l'API. */
	public static function searchTerm(string $pattern): string {
		$best = '';
		foreach (explode('*', $pattern) as $seg) {
			if (strlen($seg) > strlen($best)) {
				$best = $seg;
			}
		}

		return $best;
	}
}
