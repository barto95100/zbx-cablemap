<?php declare(strict_types = 0);

namespace Modules\Cablemap\Actions;

use API,
	CController,
	CControllerResponseData;

/** Tous les services (nom, statut calculé par Zabbix, parents/enfants, tags) pour le graphe. */
class CablemapServicesData extends CController {

	protected function init(): void {
		$this->disableCsrfValidation();
	}

	protected function checkInput(): bool {
		return true;
	}

	protected function checkPermissions(): bool {
		return $this->getUserType() >= USER_TYPE_ZABBIX_USER;
	}

	protected function doAction(): void {
		$nodes = [];

		try {
			$services = API::Service()->get([
				'output' => ['serviceid', 'name', 'status', 'algorithm', 'description', 'weight'],
				'selectParents' => ['serviceid'],
				'selectChildren' => ['serviceid'],
				'selectTags' => ['tag', 'value'],
				'sortfield' => 'name'
			]);
		}
		catch (\Throwable $e) {
			$services = [];
		}

		foreach ($services as $s) {
			$nodes[] = [
				'id' => (string) $s['serviceid'],
				'name' => (string) $s['name'],
				'status' => (int) $s['status'],	// -1 = OK, 0..5 = sévérité
				'algorithm' => (int) $s['algorithm'],
				'description' => (string) $s['description'],
				'parents' => array_map(static fn($p) => (string) $p['serviceid'], $s['parents']),
				'children' => array_map(static fn($c) => (string) $c['serviceid'], $s['children']),
				'tags' => array_map(static fn($t) => ['tag' => (string) $t['tag'], 'value' => (string) $t['value']], $s['tags'])
			];
		}

		$this->setResponse(new CControllerResponseData([
			'main_block' => json_encode(['nodes' => $nodes, 'time' => time()], JSON_UNESCAPED_UNICODE)
		]));
	}
}
