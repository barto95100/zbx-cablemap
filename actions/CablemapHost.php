<?php declare(strict_types = 0);

namespace Modules\Cablemap\Actions;

require_once __DIR__.'/../lib/Config.php';
require_once __DIR__.'/../lib/KeyMatch.php';

use API,
	CController,
	CControllerResponseData,
	Modules\Cablemap\Lib\Config,
	Modules\Cablemap\Lib\KeyMatch;

/**
 * Détails d'un hôte pour le panneau latéral : interfaces, groupes, problèmes actifs,
 * quelques métriques (configurables via "panel.metrics" dans config.json).
 */
class CablemapHost extends CController {

	protected function init(): void {
		$this->disableCsrfValidation();
	}

	protected function checkInput(): bool {
		$ret = $this->validateInput(['hostid' => 'required|db hosts.hostid']);

		if (!$ret) {
			$this->respond(['error' => 'Invalid host']);
		}

		return $ret;
	}

	protected function checkPermissions(): bool {
		return $this->getUserType() >= USER_TYPE_ZABBIX_USER;
	}

	private function respond(array $data): void {
		$this->setResponse(new CControllerResponseData([
			'main_block' => json_encode($data, JSON_UNESCAPED_UNICODE)
		]));
	}

	protected function doAction(): void {
		$cfg = Config::get();
		$hostid = $this->getInput('hostid');

		$hosts = API::Host()->get([
			'output' => ['hostid', 'name', 'status', 'maintenance_status'],
			'hostids' => [$hostid],
			'selectHostGroups' => ['name'],
			'selectTags' => ['tag', 'value'],
			'selectInterfaces' => ['ip', 'dns', 'port', 'type', 'useip', 'available']
		]);
		if (!$hosts) {
			$this->respond(['error' => 'Host not found']);
			return;
		}
		$h = $hosts[0];

		$min_sev = (int) ($cfg['problems']['min_severity'] ?? 0);
		$problems = [];
		foreach (API::Problem()->get([
			'output' => ['eventid', 'name', 'severity', 'clock', 'acknowledged'],
			'hostids' => [$hostid],
			'severities' => range($min_sev, 5),
			'sortfield' => ['eventid'],
			'sortorder' => 'DESC',
			'limit' => 15
		]) as $p) {
			$problems[] = [
				'name' => $p['name'],
				'severity' => (int) $p['severity'],
				'clock' => (int) $p['clock'],
				'acknowledged' => $p['acknowledged'] === '1'
			];
		}

		// Métriques : première valeur trouvée pour chaque entrée de panel.metrics.
		$defs = (array) ($cfg['panel']['metrics'] ?? []);
		$needles = [];
		foreach ($defs as $def) {
			foreach ((array) ($def['search'] ?? []) as $n) {
				$needles[] = (string) $n;
			}
		}
		$metrics = [];
		if ($needles) {
			$items = API::Item()->get([
				'output' => ['key_', 'name', 'lastvalue', 'units'],
				'hostids' => [$hostid],
				'search' => ['key_' => $needles],
				'searchByAny' => true,
				'filter' => ['status' => 0]
			]);
			foreach ($defs as $def) {
				foreach ((array) ($def['search'] ?? []) as $needle) {
					foreach ($items as $it) {
						if ($it['lastvalue'] !== '' && stripos($it['key_'], (string) $needle) !== false) {
							$metrics[] = [
								'label' => (string) ($def['label'] ?? $it['name']),
								'lastvalue' => $it['lastvalue'],
								'units' => $it['units']
							];
							continue 3;
						}
					}
				}
			}
		}

		$graphs = $this->graphs($cfg, (string) $hostid, $h['tags'] ?? []);

		// Dashboards d'hôte (Zabbix >= 7.0) : le bouton n'est proposé que s'il y en a.
		$dashboardid = null;
		try {
			$dashboards = API::HostDashboard()->get([
				'output' => ['dashboardid'],
				'hostids' => [$hostid],
				'limit' => 1
			]);
			if ($dashboards) {
				$dashboardid = $dashboards[0]['dashboardid'];
			}
		}
		catch (\Throwable $e) {
			$dashboardid = null;
		}

		$this->respond([
			'hostid' => $h['hostid'],
			'dashboardid' => $dashboardid,
			'name' => $h['name'],
			'maintenance' => $h['maintenance_status'] === '1',
			'groups' => array_column($h['hostgroups'], 'name'),
			'interfaces' => $h['interfaces'],
			'problems' => $problems,
			'metrics' => $metrics,
			'graphs' => $graphs
		]);
	}

	/**
	 * Moyennes par tranche ($buckets) de l'historique d'un item sur [$from, $to].
	 * @return array<int, float|null>
	 */
	private static function bucketHistory(string $itemid, int $value_type, int $from, int $to, int $buckets, float $mult): array {
		$series = array_fill(0, $buckets, null);
		$step = ($to - $from) / $buckets;
		$rows = API::History()->get([
			'output' => ['clock', 'value'],
			'history' => $value_type,
			'itemids' => [$itemid],
			'time_from' => $from,
			'sortfield' => 'clock',
			'sortorder' => 'ASC',
			'limit' => 5000
		]);
		$sum = array_fill(0, $buckets, 0.0);
		$cnt = array_fill(0, $buckets, 0);
		foreach ($rows as $r) {
			$i = min($buckets - 1, max(0, (int) floor(((int) $r['clock'] - $from) / $step)));
			$sum[$i] += (float) $r['value'] * $mult;
			$cnt[$i]++;
		}
		for ($i = 0; $i < $buckets; $i++) {
			if ($cnt[$i] > 0) {
				$series[$i] = $sum[$i] / $cnt[$i];
			}
		}

		return $series;
	}

	private static function hasData(array $series): bool {
		foreach ($series as $v) {
			if ($v !== null) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Item numérique de l'hôte : clé exacte en priorité ; sinon, sauf si $exact, premier item dont la clé contient $needle.
	 */
	private static function findItem(string $hostid, string $needle, bool $exact = false): ?array {
		$params = [
			'output' => ['itemid', 'key_', 'name', 'units', 'value_type', 'lastvalue'],
			'hostids' => [$hostid],
			'filter' => ['status' => 0, 'value_type' => [0, 3], 'key_' => $needle]
		];
		foreach (API::Item()->get($params) as $it) {
			if ($it['lastvalue'] !== '') {
				return $it;
			}
		}
		if ($exact) {
			return null;
		}
		unset($params['filter']['key_']);
		$params['search'] = ['key_' => $needle];
		$params['limit'] = 30;
		foreach (API::Item()->get($params) as $it) {
			if ($it['lastvalue'] !== '') {
				return $it;
			}
		}

		return null;
	}

	/** Items de l'hôte correspondant à une liste de clés (exactes ou avec "*"), avec le motif retenu dans 'pattern'. */
	private static function itemsForKeys(string $hostid, array $keys): array {
		$exact = [];
		$wild = [];
		foreach ($keys as $k) {
			if (KeyMatch::isWildcard((string) $k)) {
				$wild[] = (string) $k;
			}
			else {
				$exact[] = (string) $k;
			}
		}
		$out = [];
		if ($exact) {
			foreach (API::Item()->get([
				'output' => ['itemid', 'key_', 'value_type'],
				'hostids' => [$hostid],
				'filter' => ['key_' => $exact]
			]) as $it) {
				$it['pattern'] = $it['key_'];
				$out[] = $it;
			}
		}
		foreach ($wild as $pattern) {
			foreach (API::Item()->get([
				'output' => ['itemid', 'key_', 'value_type'],
				'hostids' => [$hostid],
				'search' => ['key_' => KeyMatch::searchTerm($pattern)]
			]) as $it) {
				if (KeyMatch::matches($pattern, $it['key_'])) {
					$it['pattern'] = $pattern;
					$out[] = $it;
				}
			}
		}

		return $out;
	}

	/**
	 * Graphiques du panneau (60 points sur panel.graph_minutes) :
	 *  1. trafic du port d'uplink (compteurs lus sur le parent), si l'hôte a un tag uplink ;
	 *  2. un graphique par tag "graph" (valeur = [libellé|]clé d'item ou fragment de clé) ;
	 *  3. à défaut, premier résultat de panel.graph_fallback (CPU, latence...).
	 */
	private function graphs(array $cfg, string $hostid, array $tags): array {
		$minutes = max(10, (int) ($cfg['panel']['graph_minutes'] ?? 60));
		$buckets = 60;
		$to = time();
		$from = $to - $minutes * 60;
		$out = [];

		// 1. trafic du lien
		$uplink = null;
		foreach ($tags as $t) {
			if (in_array($t['tag'], (array) $cfg['tags']['uplink'], true) && strrpos($t['value'], ':') !== false) {
				$uplink = $t['value'];
				break;
			}
		}
		if ($uplink !== null) {
			$pos = strrpos($uplink, ':');
			$parent_name = trim(substr($uplink, 0, $pos));
			$port = trim(substr($uplink, $pos + 1));
			$parents = API::Host()->get(['output' => ['hostid'], 'filter' => ['host' => [$parent_name]]]);
			if (!$parents) {
				$parents = API::Host()->get(['output' => ['hostid'], 'filter' => ['name' => [$parent_name]]]);
			}
			if ($parents) {
				$g = ['type' => 'traffic', 'minutes' => $minutes];
				foreach (['in', 'out'] as $dir) {
					$keys = [];
					foreach ((array) $cfg['traffic'][$dir] as $pattern) {
						$keys[str_replace('{port}', $port, (string) $pattern['key'])] = (float) ($pattern['multiplier'] ?? 1);
					}
					$items = self::itemsForKeys((string) $parents[0]['hostid'], array_keys($keys));
					$g[$dir] = array_fill(0, $buckets, null);
					foreach (array_keys($keys) as $k) {
						foreach ($items as $it) {
							if ($it['pattern'] === $k) {
								$g[$dir] = self::bucketHistory($it['itemid'], (int) $it['value_type'], $from, $to, $buckets, $keys[$k]);
								break 2;
							}
						}
					}
				}
				foreach ($tags as $t2) {
					if (in_array($t2['tag'], (array) ($cfg['tags']['swap'] ?? ['cablemap.swap']), true)
							&& !in_array(strtolower(trim((string) $t2['value'])), ['0', 'false', 'no', 'non'], true)) {
						$tmp = $g['in'];
						$g['in'] = $g['out'];
						$g['out'] = $tmp;
					}
				}
				if (self::hasData($g['in']) || self::hasData($g['out'])) {
					$out[] = $g;
				}
			}
		}

		// 2. graphiques demandés par tag
		$tag_names = (array) ($cfg['tags']['graph'] ?? ['cablemap.graph']);
		foreach ($tags as $t) {
			if (!in_array($t['tag'], $tag_names, true) || trim($t['value']) === '') {
				continue;
			}
			$label = null;
			$needle = trim($t['value']);
			if (($p = strpos($needle, '|')) !== false) {
				$label = trim(substr($needle, 0, $p));
				$needle = trim(substr($needle, $p + 1));
			}
			$it = self::findItem($hostid, $needle);
			if ($it !== null) {
				$vals = self::bucketHistory($it['itemid'], (int) $it['value_type'], $from, $to, $buckets, 1.0);
				if (self::hasData($vals)) {
					$out[] = ['type' => 'metric', 'label' => $label ?? $it['name'], 'units' => $it['units'], 'values' => $vals, 'minutes' => $minutes];
				}
			}
		}

		// 3. repli : première métrique disponible, tant qu'il y a moins de 2 graphiques
		if (count($out) < 2) {
			foreach ((array) ($cfg['panel']['graph_fallback'] ?? []) as $def) {
				foreach ((array) ($def['search'] ?? []) as $needle) {
					$it = self::findItem($hostid, (string) $needle, true);
					if ($it === null) {
						continue;
					}
					$vals = self::bucketHistory($it['itemid'], (int) $it['value_type'], $from, $to, $buckets, 1.0);
					if (self::hasData($vals)) {
						$out[] = ['type' => 'metric', 'label' => (string) ($def['label'] ?? $it['name']), 'fallback' => true,
							'units' => $it['units'], 'values' => $vals, 'minutes' => $minutes];
						break 2;
					}
				}
			}
		}

		foreach ($out as &$g) {
			$g['from'] = $from;
			$g['to'] = $to;
		}
		unset($g);

		return array_slice($out, 0, 3);
	}
}
