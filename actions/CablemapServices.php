<?php declare(strict_types = 0);

namespace Modules\Cablemap\Actions;

require_once __DIR__.'/../lib/Config.php';
require_once __DIR__.'/../lib/Lang.php';

use CController,
	CControllerResponseData,
	Modules\Cablemap\Lib\Config,
	Modules\Cablemap\Lib\Lang;

/** Page « Services » : arbre des services Zabbix (SLA / Services) sous forme de graphe. */
class CablemapServices extends CController {

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
		$cfg = Config::get();

		$this->setResponse(new CControllerResponseData([
			'title' => _('Cablemap services'),
			'js_config' => [
				'refresh' => max(5, (int) $cfg['refresh_seconds']),
				'colors' => $cfg['colors'],
				'labels' => array_replace(Lang::labels(Lang::userLang()), (array) ($cfg['labels'] ?? [])),
				'services' => $cfg['services'] ?? []
			]
		]));
	}
}
