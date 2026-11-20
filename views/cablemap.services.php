<?php declare(strict_types = 0);

/**
 * @var CView $this
 * @var array $data
 */

(new CHtmlPage())
	->setTitle($data['title'])
	->addItem((new CDiv())->setId('cablemap-services'))
	->show();

(new CScriptTag(
	'window.CABLEMAP_SVC_CFG = '.json_encode($data['js_config'], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG).';'
))->show();
(new CScriptTag(file_get_contents(__DIR__.'/../assets/js/services.js')))->show();
