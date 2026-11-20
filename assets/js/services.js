(function () {
	'use strict';

	// ---- configuration & libellés ------------------------------------------------
	var CFG = window.CABLEMAP_SVC_CFG || {};
	var C = CFG.colors || {};
	var SEV = C.severity || ['#4aa3df', '#4aa3df', '#f2c230', '#f08a24', '#e5534b', '#a4161a'];
	var COL_OK = C.ok || '#2fb36b';
	var SC = CFG.services || {};
	var DEFAULT_DEPTH = SC.default_depth !== undefined ? SC.default_depth : 1;	// niveaux dépliés d'office (les branches en problème le sont toujours)
	var MAX_COLS = SC.max_columns || 8;
	var DEFAULT_LABELS = {
		svc_title: 'Services', svc_count: 'services', svc_problem: 'with problem', updated: 'updated',
		recenter: 'Recenter', reset: 'Reset layout', zoom_in: 'Zoom in', zoom_out: 'Zoom out',
		expandall: 'Expand all', collapseall: 'Collapse all', btn_infra: 'Infrastructure map', btn_services: 'Services',
		svc_hint: 'click a service for details · wheel or +/− = zoom · drag background = pan · ▸ = expand/collapse',
		svc_no_data: 'No services found. Create some in Services → Services.', error: 'Loading error', loading: 'Loading…', close: 'Close',
		ok: 'OK', severities: ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'],
		svc_parents: 'Used by', svc_children: 'Depends on', svc_algo: 'Status calculation', svc_tags: 'Tags',
		svc_problems: 'Problems impacting this service', svc_hosts: 'Related hosts', svc_none: 'None', svc_on_map: 'Show on infrastructure map',
		svc_settings: 'Edit service', svc_sla: 'Services page', since: 'since',
		svc_algos: ['Set status to OK', 'Most critical of child services', 'Most critical if all children have problems']
	};
	var L = {};
	Object.keys(DEFAULT_LABELS).forEach(function (k) {
		L[k] = (CFG.labels && CFG.labels[k] !== undefined) ? CFG.labels[k] : DEFAULT_LABELS[k];
	});
	var DATA_URL = 'zabbix.php?action=cablemap.servicesdata';
	var INFO_URL = 'zabbix.php?action=cablemap.serviceinfo&serviceid=';
	var REFRESH_MS = (CFG.refresh || 30) * 1000;
	var NS = 'http://www.w3.org/2000/svg';

	var root_el = document.getElementById('cablemap-services');
	if (!root_el) { return; }

	// ---- styles ----------------------------------------------------------------
	var style = document.createElement('style');
	style.textContent =
		'#cablemap-services{position:relative}' +
		'#cablemap-services .cm-bar{display:flex;gap:12px;align-items:center;margin:0 0 8px;font-size:12px;opacity:.9;flex-wrap:wrap}' +
		'#cablemap-services .cm-bar button,#cablemap-services .cm-bar a.btn-alt{cursor:pointer}' +
		'#cablemap-services .cm-leg{display:inline-flex;align-items:center;gap:4px}' +
		'#cablemap-services .cm-dot{width:10px;height:10px;border-radius:50%;display:inline-block}' +
		'#cablemap-services svg.cm-svg{width:100%;height:calc(100vh - 230px);min-height:520px;border:1px solid rgba(127,127,127,.35);border-radius:8px;cursor:grab;display:block;user-select:none}' +
		'#cablemap-services svg.cm-svg.cm-drag{cursor:grabbing}' +
		'#cablemap-services text{fill:currentColor;font-family:inherit}' +
		'#cablemap-services .cm-node{cursor:pointer}#cablemap-services .cm-node .cm-ring{transition:stroke-width .15s}' +
		'#cablemap-services .cm-node:hover .cm-ring{stroke-width:3.2}' +
		'#cablemap-services .cm-ctl{cursor:pointer}#cablemap-services .cm-ctl:hover .cm-pill{stroke-opacity:1;stroke-width:2}' +
		'#cablemap-services .cm-pulse{transform-box:fill-box;transform-origin:center;animation:cm-pulse 1.8s ease-out infinite;pointer-events:none}' +
		'@keyframes cm-pulse{0%{opacity:.85;transform:scale(1)}100%{opacity:0;transform:scale(1.35)}}' +
		'#cablemap-services .cm-panel{position:absolute;right:12px;width:340px;overflow:auto;z-index:5;border:1px solid rgba(127,127,127,.35);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.55);font-size:12px;backdrop-filter:blur(6px)}' +
		'#cablemap-services .cm-strip{height:4px;background:linear-gradient(90deg,var(--c),transparent)}' +
		'#cablemap-services .cm-ph{display:flex;align-items:center;gap:12px;padding:14px 12px 8px}' +
		'#cablemap-services .cm-pt{flex:1;min-width:0}#cablemap-services .cm-pn{font-size:15px;font-weight:700;line-height:1.25}' +
		'#cablemap-services .cm-pip{opacity:.6;margin-top:3px;font-size:11.5px}' +
		'#cablemap-services .cm-px{background:rgba(127,127,127,.15);border:0;color:inherit;font-size:18px;line-height:1;cursor:pointer;width:26px;height:26px;border-radius:50%;padding:0}#cablemap-services .cm-px:hover{background:rgba(127,127,127,.35)}' +
		'#cablemap-services .cm-pdot{width:14px;height:14px;border-radius:50%;flex:none;display:inline-block}' +
		'#cablemap-services .cm-pb{padding:2px 12px 14px}' +
		'#cablemap-services .cm-ps{margin:16px 0 7px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;opacity:.5;font-weight:700}' +
		'#cablemap-services .cm-pill2{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);border:1px solid color-mix(in srgb,var(--c) 45%,transparent)}' +
		'#cablemap-services .cm-pchips{display:flex;flex-wrap:wrap;gap:6px}' +
		'#cablemap-services .cm-chip{display:inline-flex;align-items:center;border:1px solid rgba(127,127,127,.35);background:rgba(127,127,127,.1);border-radius:999px;padding:2px 10px;font-size:11px;cursor:default}' +
		'#cablemap-services .cm-chip.cm-click{cursor:pointer}#cablemap-services .cm-chip.cm-click:hover{background:rgba(127,127,127,.3)}' +
		'#cablemap-services .cm-pprob{border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 9%,transparent);border-radius:4px 10px 10px 4px;padding:7px 10px;margin-bottom:7px}' +
		'#cablemap-services .cm-ptx{font-size:12px;line-height:1.35}#cablemap-services .cm-pmeta{display:flex;align-items:center;gap:8px;margin-top:5px}#cablemap-services .cm-pmeta .cm-pill2{padding:1px 8px;font-size:10px}' +
		'#cablemap-services .cm-pm{opacity:.6;font-size:11px}' +
		'#cablemap-services .cm-pbtns{display:grid;grid-template-columns:1fr;gap:8px;margin-top:16px}' +
		'#cablemap-services .cm-pbtn{border:1px solid rgba(127,127,127,.4);border-radius:10px;padding:8px;text-align:center;color:inherit;text-decoration:none;font-weight:600}#cablemap-services .cm-pbtn:hover{background:rgba(127,127,127,.2)}' +
		'#cablemap-services .cm-pbtn.cm-primary{background:var(--c);border-color:var(--c);color:#fff}#cablemap-services .cm-pbtn.cm-primary:hover{filter:brightness(1.12);background:var(--c)}';
	document.head.appendChild(style);

	function loadJSON(key, def) {
		try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? def : v; } catch (err) { return def; }
	}
	function saveJSON(key, val) {
		try { localStorage.setItem(key, JSON.stringify(val)); } catch (err) { /* ignore */ }
	}

	var fold = loadJSON('cablemap.svc.fold2', {});	// id -> true (replié) / false (déplié)
	var manual = loadJSON('cablemap.svc.pos', {});
	var scope;	// id de l'application affichée ; '' = aperçu de toutes les applications
	try { scope = localStorage.getItem('cablemap.svc.scope'); } catch (err) { scope = null; }
	function setScope(v) {
		scope = v || '';
		try { localStorage.setItem('cablemap.svc.scope', scope); } catch (err) { /* ignore */ }
		fold = {}; manual = {};
		saveJSON('cablemap.svc.fold2', fold); saveJSON('cablemap.svc.pos', manual);
		if (sel) { sel.value = scope; }
		view = null;
		if (lastData) { render(); }
	}
	function rootOf(id) {
		var seen = {}, q = [id];
		while (q.length) { var i = q.shift(); if (seen[i]) { continue; } seen[i] = true; if (!model.byId[i].parents.length) { return i; } q = q.concat(model.byId[i].parents); }
		return null;
	}
	function inScope(id) {
		if (!scope) { return true; }
		var seen = {}, q = [scope];
		while (q.length) { var i = q.pop(); if (i === id) { return true; } if (seen[i]) { continue; } seen[i] = true; q = q.concat(model.byId[i].children); }
		return false;
	}
	var sel = null;	// id -> {x,y}
	var lastData = null, model = null, selId = null, view = null, bounds = null, curPos = {};

	// ---- utilitaires -------------------------------------------------------------
	function sevColor(s) { return s < 0 ? COL_OK : SEV[Math.min(s, SEV.length - 1)]; }
	function sevName(s) { return s < 0 ? L.ok : (L.severities[Math.min(s, L.severities.length - 1)] || ''); }
	function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
	function el(name, attrs, parent) {
		var e = document.createElementNS(NS, name);
		for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) { e.setAttribute(k, attrs[k]); } }
		if (parent) { parent.appendChild(e); }
		return e;
	}
	function h(tag, cls, txt, parent) {
		var e = document.createElement(tag);
		if (cls) { e.className = cls; }
		if (txt !== undefined && txt !== null) { e.textContent = txt; }
		if (parent) { parent.appendChild(e); }
		return e;
	}
	function pageBg() {
		var c = getComputedStyle(document.body).backgroundColor;
		if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') { c = getComputedStyle(document.documentElement).backgroundColor; }
		return (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') ? '#0e1013' : c;
	}
	function text(parent, attrs, content, bg) {
		var t = el('text', attrs, parent);
		t.style.paintOrder = 'stroke';
		t.style.stroke = bg;
		t.style.strokeWidth = '4px';
		t.style.strokeLinejoin = 'round';
		t.textContent = content;
		return t;
	}

	// ---- modèle : graphe orienté (un service peut avoir plusieurs parents) --------
	// Convention Zabbix : le parent DÉPEND de ses enfants (un enfant en panne dégrade le parent).
	function buildModel(data) {
		var byId = {}, roots = [];
		data.nodes.forEach(function (n) { byId[n.id] = n; });
		data.nodes.forEach(function (n) {
			n.parents = n.parents.filter(function (p) { return byId[p]; });
			n.children = n.children.filter(function (c) { return byId[c]; });
		});
		data.nodes.forEach(function (n) { if (!n.parents.length) { roots.push(n.id); } });

		// Profondeur (plus long chemin depuis une racine) et « branche en problème ».
		var depth = {}, bad = {};
		function dpth(id, seen) {
			if (depth[id] !== undefined) { return depth[id]; }
			if (seen[id]) { return 0; }
			seen[id] = true;
			var d = 0;
			byId[id].parents.forEach(function (p) { d = Math.max(d, dpth(p, seen) + 1); });
			seen[id] = false;
			depth[id] = d;
			return d;
		}
		function isBad(id, seen) {
			if (bad[id] !== undefined) { return bad[id]; }
			if (seen[id]) { return false; }
			seen[id] = true;
			var b = byId[id].status >= 0;
			byId[id].children.forEach(function (c) { if (isBad(c, seen)) { b = true; } });
			seen[id] = false;
			bad[id] = b;
			return b;
		}
		data.nodes.forEach(function (n) { dpth(n.id, {}); isBad(n.id, {}); });
		return {byId: byId, roots: roots, depth: depth, bad: bad};
	}

	function isCollapsed(id) {
		var n = model.byId[id];
		if (!n.children.length) { return false; }
		if (fold[id] !== undefined) { return !!fold[id]; }
		return !scope;		// une application choisie : tout déplié ; aperçu : tout replié
	}

	function hiddenCount(id) {
		var seen = {}, cnt = 0, prob = 0, sev = -1;
		(function walk(i) {
			model.byId[i].children.forEach(function (c) {
				if (seen[c]) { return; }
				seen[c] = true;
				cnt++;
				var st = model.byId[c].status;
				if (st >= 0) { prob++; if (st > sev) { sev = st; } }
				walk(c);
			});
		})(id);
		return {cnt: cnt, prob: prob, sev: sev};
	}

	// ---- mise en page en couches ---------------------------------------------------
	var CELL_W = 176, NODE_W = 150, NODE_H = 46, LEVEL_GAP = 120, ROW_GAP = 86, TOP = 60;

	var primaryOf = null;
	function layout() {
		var byId = model.byId, visible = {}, order = [];
		function show(id) {
			if (visible[id]) { return; }
			visible[id] = true;
			order.push(id);
			if (!isCollapsed(id)) { byId[id].children.forEach(show); }
		}
		var rs = scope && byId[scope] ? [scope] : model.roots.slice().sort(function (a, b) {
			return (model.bad[b] ? 1 : 0) - (model.bad[a] ? 1 : 0) || byId[a].name.localeCompare(byId[b].name);
		});
		rs.forEach(show);

		if (scope && byId[scope]) {
			// Vue d'une application : arbre classique (chaque service sous son parent le plus proche),
			// les dépendances partagées n'ont qu'un seul emplacement ; les autres liens sont atténués.
			var dist = {}, primary = {}, q = [scope];
			dist[scope] = 0;
			while (q.length) {
				var cur = q.shift();
				if (isCollapsed(cur)) { continue; }
				byId[cur].children.forEach(function (c) {
					if (dist[c] === undefined) { dist[c] = dist[cur] + 1; primary[c] = cur; q.push(c); }
				});
			}
			primaryOf = primary;
			var kids = {};
			Object.keys(primary).forEach(function (c) { (kids[primary[c]] = kids[primary[c]] || []).push(c); });
			// Arbre compact (contours) : chaque service est centré sous le bas de son parent ;
			// les frères sont côte à côte sur la ligne en dessous, sans chevauchement.
			var rel = {};
			function contour(id) {
				var k = kids[id] || [];
				if (!k.length) { return {l: [0], r: [0]}; }
				var shifts = [], acc = null;
				k.forEach(function (c, i) {
					var cc = contour(c), sh = 0;
					if (acc) {
						for (var d = 0; d < Math.min(acc.r.length, cc.l.length); d++) { sh = Math.max(sh, acc.r[d] - cc.l[d] + CELL_W); }
						for (var e = 0; e < cc.l.length; e++) {
							var lv = cc.l[e] + sh, rv = cc.r[e] + sh;
							if (e < acc.l.length) { acc.l[e] = Math.min(acc.l[e], lv); acc.r[e] = Math.max(acc.r[e], rv); } else { acc.l.push(lv); acc.r.push(rv); }
						}
					} else { acc = {l: cc.l.slice(), r: cc.r.slice()}; }
					shifts.push(sh);
				});
				var off = (shifts[0] + shifts[shifts.length - 1]) / 2;
				k.forEach(function (c, i) { rel[c] = shifts[i] - off; });
				return {l: [0].concat(acc.l.map(function (v) { return v - off; })), r: [0].concat(acc.r.map(function (v) { return v - off; }))};
			}
			contour(scope);
			var tpos = {};
			(function place(id, x) {
				tpos[id] = {x: x, y: TOP + dist[id] * (NODE_H + LEVEL_GAP * 0.6)};
				(kids[id] || []).forEach(function (c) { place(c, x + rel[c]); });
			})(scope, 0);
			Object.keys(manual).forEach(function (id) { if (tpos[id]) { tpos[id] = {x: manual[id].x, y: manual[id].y, moved: true}; } });
			return {pos: tpos, visible: visible};
		}
		primaryOf = null;

		// Niveau = plus long chemin parmi les arêtes visibles (parent déplié -> enfant).
		var level = {};
		function lvl(id, seen) {
			if (level[id] !== undefined) { return level[id]; }
			if (seen[id]) { return 0; }
			seen[id] = true;
			var l = 0;
			byId[id].parents.forEach(function (p) {
				if (visible[p] && !isCollapsed(p)) { l = Math.max(l, lvl(p, seen) + 1); }
			});
			seen[id] = false;
			level[id] = l;
			return l;
		}
		order.forEach(function (id) { lvl(id, {}); });

		var levels = [];
		order.forEach(function (id) { (levels[level[id]] = levels[level[id]] || []).push(id); });
		levels = levels.map(function (l) { return l || []; });

		// Réduction des croisements : balayages par barycentre.
		var idx = {};
		function reindex() { levels.forEach(function (l) { l.forEach(function (id, i) { idx[id] = i; }); }); }
		reindex();
		function bary(id, up) {
			var nb = (up ? byId[id].parents : byId[id].children).filter(function (x) { return visible[x] && ((up ? !isCollapsed(x) : !isCollapsed(id))); });
			if (!nb.length) { return idx[id]; }
			var s = 0;
			nb.forEach(function (x) { s += idx[x]; });
			return s / nb.length;
		}
		for (var it = 0; it < 4; it++) {
			for (var a = 1; a < levels.length; a++) {
				levels[a].sort(function (x, y) { return bary(x, true) - bary(y, true); });
				reindex();
			}
			for (var b = levels.length - 2; b >= 0; b--) {
				levels[b].sort(function (x, y) { return bary(x, false) - bary(y, false); });
				reindex();
			}
		}

		var pos = {}, y = TOP;
		levels.forEach(function (l) {
			var rows = Math.ceil(l.length / MAX_COLS) || 1;
			for (var r = 0; r < rows; r++) {
				var part = l.slice(r * MAX_COLS, (r + 1) * MAX_COLS);
				part.forEach(function (id, i) {
					pos[id] = {x: (i - (part.length - 1) / 2) * CELL_W, y: y + r * ROW_GAP};
				});
			}
			y += (rows - 1) * ROW_GAP + NODE_H + LEVEL_GAP;
		});
		Object.keys(manual).forEach(function (id) { if (pos[id]) { pos[id] = {x: manual[id].x, y: manual[id].y, moved: true}; } });
		return {pos: pos, visible: visible};
	}

	// ---- rendu ----------------------------------------------------------------------
	var bar = h('div', 'cm-bar', null, root_el);
	var svg = el('svg', {'class': 'cm-svg'});
	root_el.appendChild(svg);
	var panel = h('div', 'cm-panel', null, root_el);
	panel.style.display = 'none';
	var panelBody = null, detail = {};

	function mkBtn(label, fn, title) {
		var b = h('button', 'btn-alt', label, bar);
		b.type = 'button';
		if (title) { b.title = title; }
		b.addEventListener('click', fn);
		return b;
	}
	var selLbl = h('span', null, (L.svc_app || 'Application') + ' :', bar);
	sel = h('select', 'cm-sel', null, bar);
	sel.addEventListener('change', function () { setScope(sel.value); });
	function fillSel() {
		var cur = scope || '';
		sel.innerHTML = '';
		var o = document.createElement('option'); o.value = ''; o.textContent = L.svc_overview || 'Aperçu (toutes les applications)'; sel.appendChild(o);
		model.roots.slice().sort(function (a, b) {
			return (model.bad[b] ? 1 : 0) - (model.bad[a] ? 1 : 0) || model.byId[a].name.localeCompare(model.byId[b].name);
		}).forEach(function (id) {
			var op = document.createElement('option'); op.value = id;
			op.textContent = (model.bad[id] ? '⚠ ' : '') + model.byId[id].name; sel.appendChild(op);
		});
		sel.value = cur;
	}
	var navInfra = h('a', 'btn-alt', L.btn_infra, bar);
	navInfra.href = 'zabbix.php?action=cablemap.view';
	navInfra.style.textDecoration = 'none';
	mkBtn(L.recenter, function () { fit(); });
	mkBtn('−', function () { zoomBy(1.25); }, L.zoom_out);
	mkBtn('+', function () { zoomBy(0.8); }, L.zoom_in);
	mkBtn(L.expandall, function () { setAllFold(false); });
	mkBtn(L.collapseall, function () { setAllFold(true); });
	mkBtn(L.reset, function () { fold = {}; manual = {}; saveJSON('cablemap.svc.fold2', fold); saveJSON('cablemap.svc.pos', manual); if (lastData) { render(); } fit(); });
	var status = h('span', null, null, bar);
	[[L.ok, COL_OK]].concat([1, 2, 3, 4, 5].map(function (i) { return [L.severities[i], SEV[i]]; })).forEach(function (l) {
		var s = h('span', 'cm-leg', null, bar);
		var dot = h('span', 'cm-dot', null, s);
		dot.style.background = l[1];
		s.appendChild(document.createTextNode(l[0]));
	});
	var hint = h('span', null, L.svc_hint, bar);
	hint.style.opacity = 0.7;

	function setAllFold(v) {
		fold = {};
		Object.keys(model.byId).forEach(function (id) { if (model.byId[id].children.length) { fold[id] = v; } });
		saveJSON('cablemap.svc.fold2', fold);
		render();
		fit();
	}

	function edgePath(p, c) {
		var x1 = p.x, y1 = p.y + NODE_H / 2, x2 = c.x, y2 = c.y - NODE_H / 2, m = (y1 + y2) / 2;
		return 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + m + ' ' + x2 + ',' + m + ' ' + x2 + ',' + y2;
	}

	function render() {
		if (!lastData) { return; }
		var bg = pageBg(), lay = layout(), pos = lay.pos;
		curPos = pos;
		while (svg.firstChild) { svg.removeChild(svg.firstChild); }
		var defs = el('defs', {}, svg);
		var grad = el('linearGradient', {id: 'cs-card', x1: 0, y1: 0, x2: 0, y2: 1}, defs);
		el('stop', {offset: '0%', 'stop-color': 'currentColor', 'stop-opacity': 0.13}, grad);
		el('stop', {offset: '100%', 'stop-color': 'currentColor', 'stop-opacity': 0.02}, grad);
		var pat = el('pattern', {id: 'cs-grid', width: 40, height: 40, patternUnits: 'userSpaceOnUse'}, defs);
		el('circle', {cx: 1, cy: 1, r: 1, fill: 'currentColor', opacity: 0.14}, pat);
		el('rect', {x: -9000, y: -9000, width: 18000, height: 18000, fill: 'url(#cs-grid)', 'pointer-events': 'none'}, svg);
		var gEdges = el('g', {}, svg), gNodes = el('g', {}, svg);

		var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;

		// Arêtes : parent (en haut) -> enfant ; couleur = statut de l'enfant (c'est lui qui dégrade le parent).
		Object.keys(pos).forEach(function (id) {
			var n = model.byId[id];
			if (isCollapsed(id)) { return; }
			n.children.forEach(function (cid) {
				if (!pos[cid]) { return; }
				var st = model.byId[cid].status, bad = st >= 0;
				var col = bad ? sevColor(st) : 'currentColor';
				var d = edgePath(pos[id], pos[cid]);
				if (primaryOf && primaryOf[cid] !== id) {
					// lien secondaire (service partagé) : discret, visible quand on sélectionne l'un des deux
					var hot = selId === id || selId === cid;
					el('path', {d: d, fill: 'none', stroke: bad ? col : 'currentColor', 'stroke-width': hot ? 2 : 1, 'stroke-dasharray': '5 5', opacity: hot ? 0.8 : (bad ? 0.5 : 0.1)}, gEdges);
					return;
				}
				if (bad) { el('path', {d: d, fill: 'none', stroke: col, 'stroke-width': 7, opacity: 0.1, 'stroke-linecap': 'round'}, gEdges); }
				el('path', {d: d, fill: 'none', stroke: col, 'stroke-width': bad ? 2 : 1.3, opacity: bad ? 0.85 : 0.35}, gEdges);
			});
		});

		Object.keys(pos).forEach(function (id) {
			var n = model.byId[id], p = pos[id], col = sevColor(n.status), bad = n.status >= 0;
			minx = Math.min(minx, p.x - NODE_W / 2); maxx = Math.max(maxx, p.x + NODE_W / 2);
			miny = Math.min(miny, p.y - NODE_H / 2); maxy = Math.max(maxy, p.y + NODE_H / 2 + 22);
			var g = el('g', {'class': 'cm-node', transform: 'translate(' + p.x + ',' + p.y + ')'}, gNodes);
			el('title', {}, g).textContent = n.name + '\n' + sevName(n.status);
			g.addEventListener('mousedown', function (ev) { startNodeDrag(ev, id); });
			if (bad && n.status >= 4) { el('rect', {x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H, rx: 12, fill: 'none', stroke: col, 'stroke-width': 2, 'class': 'cm-pulse'}, g); }
			el('rect', {x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H, rx: 12, fill: bg}, g);
			el('rect', {x: -NODE_W / 2, y: -NODE_H / 2, width: NODE_W, height: NODE_H, rx: 12, fill: 'url(#cs-card)'}, g);
			var ring = el('rect', {x: -NODE_W / 2 + 1, y: -NODE_H / 2 + 1, width: NODE_W - 2, height: NODE_H - 2, rx: 11, fill: 'none', stroke: col, 'stroke-width': id === selId ? 3.2 : 2, 'class': 'cm-ring'}, g);
			if (bad) { ring.style.filter = 'drop-shadow(0 0 6px ' + col + ')'; }
			el('circle', {cx: -NODE_W / 2 + 14, cy: 0, r: 5, fill: col}, g);
			// Nom sur une ou deux lignes.
			var name = n.name, l1 = name, l2 = '';
			if (name.length > 19) {
				var cut = name.lastIndexOf(' ', 19);
				cut = cut > 6 ? cut : 19;
				l1 = name.slice(0, cut); l2 = trunc(name.slice(cut).trim(), 19);
			}
			var t1 = el('text', {x: -NODE_W / 2 + 26, y: l2 ? -2 : 4, 'font-size': 11.5, 'font-weight': 600}, g);
			t1.textContent = l1;
			if (l2) { var t2 = el('text', {x: -NODE_W / 2 + 26, y: 12, 'font-size': 11.5, 'font-weight': 600}, g); t2.textContent = l2; }

			// Replier / déplier.
			if (n.children.length) {
				var folded = isCollapsed(id), cg = el('g', {'class': 'cm-ctl', transform: 'translate(0,' + (NODE_H / 2 + 12) + ')'}, g);
				if (folded) {
					var hc = hiddenCount(id), hcol = hc.prob ? sevColor(hc.sev) : COL_OK, lab = '▸ ' + hc.cnt, tw = lab.length * 6.6 + 14, tot = tw + (hc.prob ? 24 : 0);
					el('rect', {x: -tot / 2 - 8, y: -14, width: tot + 16, height: 30, fill: 'transparent'}, cg);
					el('rect', {x: -tot / 2, y: -9, width: tot, height: 18, rx: 9, fill: bg, stroke: 'currentColor', 'stroke-opacity': 0.55, 'stroke-width': 1.4, 'class': 'cm-pill'}, cg);
					var tx = el('text', {x: hc.prob ? -10 : 0, y: 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600}, cg);
					tx.textContent = lab;
					if (hc.prob) {
						el('circle', {cx: tot / 2 - 12, cy: 0, r: 8, fill: hcol}, cg);
						var bt = el('text', {x: tot / 2 - 12, y: 4, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 'bold'}, cg);
						bt.setAttribute('style', 'fill:#fff');
						bt.textContent = hc.prob;
					}
				} else {
					el('circle', {r: 9, fill: bg, stroke: 'currentColor', 'stroke-opacity': 0.55, 'stroke-width': 1.4, 'class': 'cm-pill'}, cg);
					el('line', {x1: -4, y1: 0, x2: 4, y2: 0, stroke: 'currentColor', 'stroke-width': 1.6}, cg);
				}
				cg.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
				cg.addEventListener('click', function (ev) {
					ev.stopPropagation();
					fold[id] = !folded;
					saveJSON('cablemap.svc.fold2', fold);
					render();
				});
			}
		});

		if (!Object.keys(pos).length) {
			el('text', {x: 40, y: 60, 'font-size': 14}, svg).textContent = L.svc_no_data;
			minx = 0; maxx = 400; miny = 0; maxy = 120;
		}
		bounds = {minx: minx, maxx: maxx, miny: miny, maxy: maxy};
		if (!view) { fit(); } else { applyView(); }

		var bads = lastData.nodes.filter(function (n) { return n.status >= 0; }).length;
		status.textContent = lastData.nodes.length + ' ' + L.svc_count + ' · ' + bads + ' ' + L.svc_problem + ' · ' + L.updated + ' ' + new Date(lastData.time * 1000).toLocaleTimeString();
	}

	// ---- vue : ajustement, zoom, déplacement -------------------------------------------
	function applyView() { svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h); }
	function fit() {
		if (!bounds) { return; }
		var pad = 50, bw = bounds.maxx - bounds.minx + 2 * pad, bh = bounds.maxy - bounds.miny + 2 * pad;
		var r = svg.clientWidth && svg.clientHeight ? svg.clientWidth / svg.clientHeight : 2;
		var w = bw, hh = bh;
		if (bw / bh < r) { w = bh * r; } else { hh = bw / r; }
		view = {x: bounds.minx - pad - (w - bw) / 2, y: bounds.miny - pad - (hh - bh) / 2, w: w, h: hh};
		applyView();
	}
	function zoomBy(f, cx, cy) {
		if (!view) { return; }
		var ref = bounds ? Math.max(bounds.maxx - bounds.minx, bounds.maxy - bounds.miny) + 100 : view.w;
		var nw = view.w * f;
		if (nw < ref * 0.04 || nw > ref * 6) { return; }
		f = nw / view.w;
		if (cx === undefined) { cx = view.x + view.w / 2; cy = view.y + view.h / 2; }
		view.x = cx - (cx - view.x) * f;
		view.y = cy - (cy - view.y) * f;
		view.w *= f;
		view.h *= f;
		applyView();
	}
	function toSvg(ev) {
		var m = svg.getScreenCTM();
		if (!m) { return {x: 0, y: 0}; }
		var pt = svg.createSVGPoint();
		pt.x = ev.clientX; pt.y = ev.clientY;
		return pt.matrixTransform(m.inverse());
	}
	svg.addEventListener('wheel', function (ev) {
		if (!view) { return; }
		ev.preventDefault();
		var d = ev.deltaY;
		if (ev.deltaMode === 1) { d *= 16; } else if (ev.deltaMode === 2) { d *= 100; }
		d = Math.max(-60, Math.min(60, d));
		var m = toSvg(ev);
		zoomBy(Math.exp(d * 0.002), m.x, m.y);
	}, {passive: false});

	var pan = null, nd = null, raf = 0;
	function scheduleRender() {
		if (raf) { return; }
		raf = requestAnimationFrame(function () { raf = 0; render(); });
	}
	svg.addEventListener('mousedown', function (ev) {
		if (!view || ev.button !== 0) { return; }
		var m = svg.getScreenCTM();
		pan = {x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, k: m ? m.a : 1};
		svg.classList.add('cm-drag');
	});
	function startNodeDrag(ev, id) {
		if (ev.button !== 0) { return; }
		ev.stopPropagation();
		ev.preventDefault();
		nd = {pt: toSvg(ev), sx: ev.clientX, sy: ev.clientY, moved: false, id: id, x: curPos[id].x, y: curPos[id].y};
	}
	window.addEventListener('mousemove', function (ev) {
		if (nd) {
			if (!nd.moved && Math.abs(ev.clientX - nd.sx) + Math.abs(ev.clientY - nd.sy) > 4) { nd.moved = true; }
			if (nd.moved) {
				var pt = toSvg(ev);
				manual[nd.id] = {x: nd.x + pt.x - nd.pt.x, y: nd.y + pt.y - nd.pt.y};
				scheduleRender();
			}
			return;
		}
		if (pan) {
			view.x = pan.vx - (ev.clientX - pan.x) / pan.k;
			view.y = pan.vy - (ev.clientY - pan.y) / pan.k;
			applyView();
		}
	});
	window.addEventListener('mouseup', function () {
		if (nd) {
			if (nd.moved) { saveJSON('cablemap.svc.pos', manual); } else if (!scope && model.byId[nd.id].children.length && !model.byId[nd.id].parents.length) { var rid = nd.id; nd = null; setScope(rid); return; } else { openPanel(nd.id); }
			nd = null;
		}
		pan = null;
		svg.classList.remove('cm-drag');
	});
	document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { closePanel(); } });

	// ---- panneau de détail -----------------------------------------------------------------
	function openPanel(id) {
		selId = id; if (primaryOf) { render(); }
		selId = id;
		panel.style.display = 'block';
		panel.style.top = (svg.getBoundingClientRect().top - root_el.getBoundingClientRect().top + 10) + 'px';
		panel.style.maxHeight = (svg.clientHeight - 20) + 'px';
		panel.style.background = pageBg();
		renderPanel();
		fetch(INFO_URL + encodeURIComponent(id), {credentials: 'same-origin'})
			.then(function (r) { return r.json(); })
			.then(function (d) { detail[id] = d; if (selId === id) { renderPanel(); } })
			.catch(function () { detail[id] = {error: L.error}; if (selId === id) { renderPanel(); } });
		render();
	}
	function closePanel() {
		if (selId === null) { return; }
		selId = null;
		panel.style.display = 'none';
		render();
	}
	function focusNode(id) {
		var n = model.byId[id];
		if (!n) { return; }
		if (scope && !inScope(id)) { scope = rootOf(id) || ''; if (sel) { sel.value = scope; } fold = {}; view = null; }
		// Déplie les ancêtres pour que le service soit visible, puis le sélectionne.
		(function up(i, seen) {
			if (seen[i]) { return; }
			seen[i] = true;
			model.byId[i].parents.forEach(function (p) { fold[p] = false; up(p, seen); });
		})(id, {});
		saveJSON('cablemap.svc.fold2', fold);
		render();
		var p = curPos[id];
		if (p && view) { view.x = p.x - view.w / 2; view.y = p.y - view.h / 2; applyView(); }
		openPanel(id);
	}

	function renderPanel() {
		panel.textContent = '';
		var n = model.byId[selId];
		if (!n) { return; }
		var col = sevColor(n.status), d = detail[selId];
		panel.style.setProperty('--c', col);
		h('div', 'cm-strip', null, panel);
		var head = h('div', 'cm-ph', null, panel);
		h('span', 'cm-pdot', null, head).style.background = col;
		var t = h('div', 'cm-pt', null, head);
		h('div', 'cm-pn', n.name, t);
		var pill = h('span', 'cm-pill2', sevName(n.status), t);
		pill.style.marginTop = '6px';
		pill.style.setProperty('--c', col);
		var x = h('button', 'cm-px', '×', head);
		x.type = 'button';
		x.title = L.close;
		x.addEventListener('click', closePanel);
		panelBody = h('div', 'cm-pb', null, panel);

		if (n.description) { h('div', 'cm-pm', n.description, panelBody); }

		function chips(title, ids) {
			h('div', 'cm-ps', title, panelBody);
			if (!ids.length) { h('div', 'cm-pm', L.svc_none, panelBody); return; }
			var w = h('div', 'cm-pchips', null, panelBody);
			ids.forEach(function (i) {
				var c = h('span', 'cm-chip cm-click', model.byId[i].name, w);
				var dot = h('span', 'cm-dot', null, c);
				dot.style.cssText = 'background:' + sevColor(model.byId[i].status) + ';margin-right:6px;width:8px;height:8px';
				c.insertBefore(dot, c.firstChild);
				c.addEventListener('click', function () { focusNode(i); });
			});
		}
		chips(L.svc_parents, n.parents);
		chips(L.svc_children, n.children);

		h('div', 'cm-ps', L.svc_algo, panelBody);
		h('div', null, (L.svc_algos && L.svc_algos[n.algorithm]) || String(n.algorithm), panelBody);

		if (n.tags.length) {
			h('div', 'cm-ps', L.svc_tags, panelBody);
			var tw = h('div', 'cm-pchips', null, panelBody);
			n.tags.forEach(function (tg) { h('span', 'cm-chip', tg.tag + (tg.value ? ': ' + tg.value : ''), tw); });
		}

		if (!d) { h('div', 'cm-pm', L.loading, panelBody); return; }
		if (d.error) { h('div', 'cm-pm', d.error, panelBody); return; }

		if (d.problems && d.problems.length) {
			h('div', 'cm-ps', L.svc_problems + ' (' + d.problems.length + ')', panelBody);
			d.problems.forEach(function (p) {
				var card = h('div', 'cm-pprob', null, panelBody);
				var c = sevColor(p.severity);
				card.style.setProperty('--c', c);
				h('div', 'cm-ptx', p.name, card);
				var meta = h('div', 'cm-pmeta', null, card);
				var sp = h('span', 'cm-pill2', sevName(p.severity), meta);
				sp.style.setProperty('--c', c);
				h('span', 'cm-pm', L.since + ' ' + new Date(p.clock * 1000).toLocaleString(), meta);
			});
		}

		if (d.hosts && d.hosts.length) {
			h('div', 'cm-ps', L.svc_hosts, panelBody);
			var btns = h('div', 'cm-pbtns', null, panelBody);
			d.hosts.forEach(function (hh, i) {
				var a = h('a', 'cm-pbtn' + (i === 0 ? ' cm-primary' : ''), L.svc_on_map + ' — ' + hh.name, btns);
				a.href = 'zabbix.php?action=cablemap.view&focus=' + encodeURIComponent(hh.hostid);
			});
		}
		var b2 = h('div', 'cm-pbtns', null, panelBody);
		var a2 = h('a', 'cm-pbtn', L.svc_sla, b2);
		a2.href = 'zabbix.php?action=service.list';
	}

	// ---- chargement ---------------------------------------------------------------------------
	function load() {
		fetch(DATA_URL, {credentials: 'same-origin'})
			.then(function (r) { return r.json(); })
			.then(function (data) {
				lastData = data;
				model = buildModel(data);
				if (scope === null || (scope && !model.byId[scope])) {
					var worst = model.roots.filter(function (i) { return model.bad[i]; })[0];
					scope = worst || '';
				}
				fillSel();
				render();
				if (selId && model.byId[selId]) {
					var keep = selId;
					fetch(INFO_URL + encodeURIComponent(keep), {credentials: 'same-origin'}).then(function (r) { return r.json(); })
						.then(function (d) { detail[keep] = d; if (selId === keep) { renderPanel(); } }).catch(function () {});
					renderPanel();
				}
			})
			.catch(function () { status.textContent = L.error; });
	}
	load();
	setInterval(load, REFRESH_MS);

	// Lien profond : ?focus=<serviceid>
	var m = /[?&]focus=(\d+)/.exec(window.location.search);
	if (m) { var iv = setInterval(function () { if (model) { clearInterval(iv); focusNode(m[1]); } }, 200); }
})();
