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
 * Renvoie la topologie en JSON : noeuds (hôtes), liens (tags configurables),
 * débits des ports du parent, problèmes actifs par hôte.
 *
 * Tags par défaut (voir config.default.json) :
 *   cablemap.uplink = <hôte parent>:<port>   lien vers le parent + port du parent (ifIndex ou nom)
 *   cablemap.parent = <hôte parent>          lien sans mesure de débit
 *   cablemap.root   = <n'importe quoi>       hôte placé en haut de la carte
 * Les anciens noms nt:uplink / nt:parent (ZabFox / Network Topology) sont reconnus aussi.
 */
class CablemapData extends CController {

	protected function init(): void {
		$this->disableCsrfValidation();
	}

	protected function checkInput(): bool {
		return true;
	}

	protected function checkPermissions(): bool {
		return $this->getUserType() >= USER_TYPE_ZABBIX_USER;
	}

	/** Valeurs de tout tag dont le nom figure dans $names. */
	private static function tagValues(array $tags, array $names): array {
		$out = [];
		foreach ($tags as $t) {
			if (in_array($t['tag'], $names, true)) {
				$out[] = $t['value'];
			}
		}

		return $out;
	}

	private static function hasTag(array $tags, array $names): bool {
		foreach ($tags as $t) {
			if (in_array($t['tag'], $names, true)) {
				return true;
			}
		}

		return false;
	}

	private static function matches(string $regex, string $subject): bool {
		if ($regex === '') {
			return false;
		}

		return @preg_match('/'.str_replace('/', '\\/', $regex).'/iu', $subject) === 1;
	}

	/** Premier type dont group_regex (noms de groupes) ou name_regex (nom de l'hôte) correspond ; sinon "server". */
	private static function nodeType(array $groups, array $rules, string $name, string $host): string {
		foreach ($rules as $rule) {
			$group_re = (string) ($rule['group_regex'] ?? '');
			$name_re = (string) ($rule['name_regex'] ?? '');
			foreach ($groups as $g) {
				if (self::matches($group_re, $g)) {
					return (string) $rule['type'];
				}
			}
			if (self::matches($name_re, $name) || self::matches($name_re, $host)) {
				return (string) $rule['type'];
			}
		}

		return 'server';
	}

	/** "1G", "2.5G", "100M", "10000" (Mb/s par défaut) -> bits par seconde. */
	private static function parseSpeed(string $value): ?float {
		if (!preg_match('/^\s*([0-9]+(?:[.,][0-9]+)?)\s*([kmgt]?)/i', $value, $m)) {
			return null;
		}
		$num = (float) str_replace(',', '.', $m[1]);
		$mult = ['' => 1e6, 'k' => 1e3, 'm' => 1e6, 'g' => 1e9, 't' => 1e12][strtolower($m[2])];

		return $num * $mult;
	}

	protected function doAction(): void {
		$cfg = Config::get();
		$tag_uplink = (array) $cfg['tags']['uplink'];
		$tag_parent = (array) $cfg['tags']['parent'];
		$tag_root = (array) $cfg['tags']['root'];
		$tag_speed = (array) ($cfg['tags']['speed'] ?? ['cablemap.speed']);
		$tag_swap = (array) ($cfg['tags']['swap'] ?? ['cablemap.swap']);
		$min_sev = (int) ($cfg['problems']['min_severity'] ?? 0);

		$host_params = [
			'output' => ['hostid', 'host', 'name', 'status'],
			'selectTags' => ['tag', 'value'],
			'selectHostGroups' => ['name'],
			'selectInterfaces' => ['ip', 'type', 'main', 'available'],
			'monitored_hosts' => true,
			'preservekeys' => true
		];
		if (!empty($cfg['scope']['host_groups'])) {
			$groupids = array_keys(API::HostGroup()->get([
				'output' => ['groupid'],
				'filter' => ['name' => (array) $cfg['scope']['host_groups']],
				'preservekeys' => true
			]));
			$host_params['groupids'] = $groupids ?: [0];
		}
		$hosts = API::Host()->get($host_params);

		$by_name = [];
		foreach ($hosts as $hostid => $h) {
			$by_name[$h['name']] = $hostid;
		}
		foreach ($hosts as $hostid => $h) {
			$by_name[$h['host']] = $hostid;	// le nom technique prime sur le nom visible
		}

		// Problèmes actifs par hôte (nombre + sévérité max).
		$problems = [];
		$triggers = API::Trigger()->get([
			'output' => ['triggerid', 'priority'],
			'selectHosts' => ['hostid'],
			'monitored' => true,
			'only_true' => true,
			'skipDependent' => true,
			'min_severity' => $min_sev,
			'filter' => ['value' => TRIGGER_VALUE_TRUE]
		]);
		foreach ($triggers as $t) {
			foreach ($t['hosts'] as $th) {
				$hid = $th['hostid'];
				$problems[$hid]['count'] = ($problems[$hid]['count'] ?? 0) + 1;
				$problems[$hid]['max'] = max($problems[$hid]['max'] ?? 0, (int) $t['priority']);
			}
		}

		$nodes = [];
		$edges = [];
		$root = null;
		$wanted = [];	// hostid parent => [clé => true]

		foreach ($hosts as $hostid => $h) {
			$groups = array_column($h['hostgroups'], 'name');
			$ip = '';
			foreach ($h['interfaces'] as $if) {
				if ($if['main'] === '1') {
					$ip = $if['ip'];
					break;
				}
			}

			// Injoignable : au moins une interface marquée indisponible et aucune disponible.
			$avail = array_column($h['interfaces'], 'available');
			$down = in_array('2', $avail, true) && !in_array('1', $avail, true);

			$nodes[$hostid] = [
				'id' => $hostid,
				'host' => $h['host'],
				'name' => $h['name'],
				'ip' => $ip,
				'type' => self::nodeType($groups, (array) $cfg['types'], $h['name'], $h['host']),
				'groups' => $groups,
				'problems' => $problems[$hostid]['count'] ?? 0,
				'severity' => $problems[$hostid]['max'] ?? -1,
				'down' => $down
			];

			if (self::hasTag($h['tags'], $tag_root)) {
				$root = $hostid;
			}

			foreach (self::tagValues($h['tags'], $tag_uplink) as $value) {
				$pos = strrpos($value, ':');
				if ($pos === false) {
					continue;
				}
				$parent_name = trim(substr($value, 0, $pos));
				$port = trim(substr($value, $pos + 1));
				if (!isset($by_name[$parent_name]) || $port === '') {
					continue;
				}
				$pid = $by_name[$parent_name];
				$tag_bps = null;
				foreach (self::tagValues($h['tags'], $tag_speed) as $sv) {
					$tag_bps = self::parseSpeed($sv);
				}
				$swap = false;
				foreach (self::tagValues($h['tags'], $tag_swap) as $sv) {
					$swap = !in_array(strtolower(trim($sv)), ['0', 'false', 'no', 'non'], true);
				}
				$edges[] = [
					'from' => $pid, 'to' => $hostid, 'kind' => 'uplink', 'port' => $port,
					'in_bps' => null, 'out_bps' => null, 'speed_bps' => $tag_bps, 'swap' => $swap
				];
				foreach ((array) ($cfg['traffic']['speed'] ?? []) as $pattern) {
					$wanted[$pid][str_replace('{port}', $port, (string) $pattern['key'])] = true;
				}
				foreach (['in', 'out'] as $dir) {
					foreach ((array) $cfg['traffic'][$dir] as $pattern) {
						$wanted[$pid][str_replace('{port}', $port, (string) $pattern['key'])] = true;
					}
				}
			}

			foreach (self::tagValues($h['tags'], $tag_parent) as $value) {
				$value = trim($value);
				if (!isset($by_name[$value])) {
					continue;
				}
				$edges[] = [
					'from' => $by_name[$value], 'to' => $hostid, 'kind' => 'parent', 'port' => null,
					'in_bps' => null, 'out_bps' => null
				];
			}
		}

		// Dernières valeurs des compteurs de port sur l'hôte parent.
		$last = [];
		foreach ($wanted as $pid => $keys) {
			$exact = [];
			$wild = [];
			foreach (array_keys($keys) as $k) {
				if (KeyMatch::isWildcard((string) $k)) {
					$wild[] = (string) $k;
				}
				else {
					$exact[] = (string) $k;
				}
			}
			if ($exact) {
				$items = API::Item()->get([
					'output' => ['key_', 'lastvalue'],
					'hostids' => [$pid],
					'filter' => ['key_' => $exact]
				]);
				foreach ($items as $it) {
					$last[$pid][$it['key_']] = is_numeric($it['lastvalue']) ? (float) $it['lastvalue'] : null;
				}
			}
			foreach ($wild as $pattern) {
				$items = API::Item()->get([
					'output' => ['key_', 'lastvalue'],
					'hostids' => [$pid],
					'search' => ['key_' => KeyMatch::searchTerm($pattern)]
				]);
				foreach ($items as $it) {
					if (KeyMatch::matches($pattern, $it['key_']) && is_numeric($it['lastvalue'])) {
						$last[$pid][$pattern] = (float) $it['lastvalue'];
						break;
					}
				}
			}
		}
		foreach ($edges as &$e) {
			if ($e['kind'] !== 'uplink') {
				continue;
			}
			foreach (['in', 'out'] as $dir) {
				foreach ((array) $cfg['traffic'][$dir] as $pattern) {
					$key = str_replace('{port}', (string) $e['port'], (string) $pattern['key']);
					$v = $last[$e['from']][$key] ?? null;
					if ($v !== null) {
						$e[$dir.'_bps'] = $v * (float) ($pattern['multiplier'] ?? 1);
						break;
					}
				}
			}
			if (!empty($e['swap'])) {
				$tmp = $e['in_bps'];
				$e['in_bps'] = $e['out_bps'];
				$e['out_bps'] = $tmp;
			}
		}
		unset($e);

		// Capacité des ports : tag cablemap.speed en priorité, sinon items de vitesse du parent.
		foreach ($edges as &$e) {
			if ($e['kind'] !== 'uplink' || $e['speed_bps'] !== null) {
				continue;
			}
			foreach ((array) ($cfg['traffic']['speed'] ?? []) as $pattern) {
				$key = str_replace('{port}', (string) $e['port'], (string) $pattern['key']);
				$v = $last[$e['from']][$key] ?? null;
				if ($v !== null && $v > 0) {
					$v *= (float) ($pattern['multiplier'] ?? 1);
					$e['speed_bps'] = $v < 100000 ? $v * 1e6 : $v;	// valeur en Mb/s (ifHighSpeed) -> b/s
					break;
				}
			}
		}
		unset($e);

		if (!empty($cfg['scope']['hide_unlinked'])) {
			$linked = [];
			foreach ($edges as $e) {
				$linked[$e['from']] = $linked[$e['to']] = true;
			}
			if ($root !== null) {
				$linked[$root] = true;
			}
			$nodes = array_intersect_key($nodes, $linked);
		}

		$this->setResponse(new CControllerResponseData([
			'main_block' => json_encode([
				'generated' => time(),
				'root' => $root,
				'nodes' => array_values($nodes),
				'edges' => $edges
			], JSON_UNESCAPED_UNICODE)
		]));
	}
}
