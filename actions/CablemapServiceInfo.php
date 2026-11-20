<?php declare(strict_types = 0);

namespace Modules\Cablemap\Actions;

use API,
	CController,
	CControllerResponseData;

/**
 * Détail d'un service pour le panneau : problèmes qui l'impactent, hôtes concernés (via les évènements de problème,
 * sinon via les tags de problème du service comparés aux tags des hôtes).
 */
class CablemapServiceInfo extends CController {

	protected function init(): void {
		$this->disableCsrfValidation();
	}

	protected function checkInput(): bool {
		$ret = $this->validateInput(['serviceid' => 'required|db services.serviceid']);

		if (!$ret) {
			$this->respond(['error' => 'Invalid service']);
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
		$id = (string) $this->getInput('serviceid');
		$out = ['serviceid' => $id, 'problems' => [], 'hosts' => [], 'problem_tags' => []];

		$rows = API::Service()->get([
			'output' => ['serviceid', 'name', 'status'],
			'serviceids' => [$id],
			'selectProblemEvents' => ['eventid', 'severity', 'name'],
			'selectProblemTags' => ['tag', 'operator', 'value']
		]);

		if (!$rows) {
			$this->respond($out);
			return;
		}

		$svc = $rows[0];
		$out['problem_tags'] = $svc['problem_tags'];
		$hosts = [];

		$events = array_slice($svc['problem_events'] ?? [], 0, 15);
		$clocks = [];

		if ($events) {
			$evs = API::Event()->get([
				'output' => ['eventid', 'clock'],
				'eventids' => array_column($events, 'eventid'),
				'selectHosts' => ['hostid', 'name']
			]);
			foreach ($evs as $ev) {
				$clocks[(string) $ev['eventid']] = (int) $ev['clock'];
				foreach ($ev['hosts'] as $h) {
					$hosts[(string) $h['hostid']] = (string) $h['name'];
				}
			}
		}

		foreach ($events as $ev) {
			$out['problems'][] = [
				'eventid' => (string) $ev['eventid'],
				'severity' => (int) $ev['severity'],
				'name' => (string) $ev['name'],
				'clock' => $clocks[(string) $ev['eventid']] ?? time()
			];
		}

		// Pas de problème : hôtes dont les tags correspondent aux tags de problème du service (au mieux).
		if (!$hosts && $svc['problem_tags']) {
			$tags = [];
			foreach ($svc['problem_tags'] as $t) {
				$tags[] = ['tag' => $t['tag'], 'value' => $t['value'], 'operator' => (int) $t['operator'] === 2 ? 0 : 1];
			}
			try {
				foreach (API::Host()->get(['output' => ['hostid', 'name'], 'tags' => $tags, 'evaltype' => 0, 'limit' => 10]) as $h) {
					$hosts[(string) $h['hostid']] = (string) $h['name'];
				}
			}
			catch (\Throwable $e) {
			}
		}

		foreach ($hosts as $hid => $name) {
			$out['hosts'][] = ['hostid' => (string) $hid, 'name' => $name];
		}

		$this->respond($out);
	}
}
