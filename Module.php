<?php declare(strict_types = 0);

namespace Modules\Cablemap;

use APP,
	CMenuItem,
	Zabbix\Core\CModule;

class Module extends CModule {

	public function init(): void {
		APP::Component()->get('menu.main')
			->findOrAdd(_('Monitoring'))
			->getSubmenu()
			->add(
				(new CMenuItem(_('Cablemap')))
					->setAction('cablemap.view')
					->setAliases(['cablemap.data', 'cablemap.host'])
			)
			->add(
				(new CMenuItem(_('Cablemap services')))
					->setAction('cablemap.services')
					->setAliases(['cablemap.servicesdata', 'cablemap.serviceinfo'])
			);
	}
}
