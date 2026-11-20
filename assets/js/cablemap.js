(function () {
	'use strict';

	// ---- configuration & libellés ------------------------------------------------
	var CFG = window.CABLEMAP_CFG || {};
	var C = CFG.colors || {};
	var SEV = C.severity || ['#4aa3df', '#4aa3df', '#f2c230', '#f08a24', '#e5534b', '#a4161a'];
	var COL_OK = C.ok || '#2fb36b', COL_DOWN = C.down || '#a4161a', COL_UPLINK = C.uplink || '#5b8def';
	var COL_FLOW_OUT = C.flow_out || '#7fe9ff', COL_FLOW_IN = C.flow_in || '#ffc46b';
	var COL_WARN = C.util_warn || '#f2c230', COL_CRIT = C.util_crit || '#e5534b';
	var UT = CFG.utilization || {};
	var UT_WARN = (UT.warn_percent || 50) / 100, UT_CRIT = (UT.crit_percent || 80) / 100;
	var DEFAULT_SPEED = UT.default_speed_bps || 1e9;
	var DEFAULT_LABELS = {
		recenter: 'Recenter', btn_services: 'Services', dir_up: 'up', dir_down: 'down', zoom_in: 'Zoom in', zoom_out: 'Zoom out', reset: 'Reset layout', display: 'Display', curved: 'Curved', animate: 'Animate traffic flow',
		traffic: 'Show link traffic', linkstyle: 'Link style', angled: 'Angled', rounded: 'Rounded',
		groups: 'Groups', expandall: 'Expand all', collapseall: 'Collapse all', expand: 'Expand', collapse: 'Collapse',
		hint: 'drag a node to move it (Shift = with its children) · wheel or +/\u2212 = zoom · drag background = pan',
		port: 'Port', rootcause: 'ROOT CAUSE', impacted: 'impacted', hosts: 'hosts', links: 'links', updated: 'updated',
		error: 'Loading error', problems: 'problem(s)', noproblem: 'No problem', unreachable: 'UNREACHABLE',
		impacted_tip: 'Impacted by a failed parent', ok: 'OK', hidden: 'hidden', usage: 'of',
		close: 'Close', loading: 'Loading…', maintenance: 'In maintenance', since: 'since',
		p_uplink: 'Uplink', p_to: 'Connected to', p_util: 'Utilization', p_below: 'Devices below', p_total: 'total',
		p_metrics: 'Metrics', p_ifaces: 'Interfaces', p_groups: 'Host groups', p_problems: 'Active problems',
		graph_title: 'Traffic', graph_nodata: 'No history', export: 'Export PNG', metric_names: {},
		btn_problems: 'Problems', btn_latest: 'Latest data', btn_dash: 'Dashboard', btn_graphs: 'Graphs', btn_host: 'Settings', if_ok: 'Available', if_ko: 'Unavailable', if_unk: 'Unknown (no item uses this interface)',
		severities: ['Not classified', 'Information', 'Warning', 'Average', 'High', 'Disaster'],
		empty: 'No links found. Add host tags to describe your topology:'
	};
	var L = {};
	Object.keys(DEFAULT_LABELS).forEach(function (k) {
		L[k] = (CFG.labels && CFG.labels[k] !== undefined) ? CFG.labels[k] : DEFAULT_LABELS[k];
	});
	var DATA_URL = 'zabbix.php?action=cablemap.data';
	var REFRESH_MS = (CFG.refresh || 30) * 1000;
	var NS = 'http://www.w3.org/2000/svg';
	var CELL_W = 150, LEVEL_H = 280, ROW_H = 135, MAX_COLS = 6, TOP = 70, R = 28, PERIOD = 96, PO = R + 72, FRAME_PAD = 96;	// FRAME_PAD : marge gauche/droite du cadre de groupe autour des cartes	// PO : le lien part sous le libellé du parent

	var root_el = document.getElementById('cablemap');
	if (!root_el) { return; }

	// ---- styles ----------------------------------------------------------------
	var style = document.createElement('style');
	style.textContent =
		'#cablemap{position:relative}' +
		'#cablemap .cm-panel{position:absolute;right:12px;width:340px;overflow:auto;z-index:5;border:1px solid rgba(127,127,127,.35);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.55);font-size:12px;backdrop-filter:blur(6px)}' +
		'#cablemap .cm-strip{height:4px;background:linear-gradient(90deg,var(--c),transparent)}' +
		'#cablemap .cm-ph{display:flex;align-items:center;gap:12px;padding:14px 12px 8px}' +
		'#cablemap .cm-pt{flex:1;min-width:0}#cablemap .cm-pn{font-size:15px;font-weight:700;line-height:1.25}' +
		'#cablemap .cm-pip{opacity:.6;margin-top:3px;font-size:11.5px}' +
		'#cablemap .cm-px{background:rgba(127,127,127,.15);border:0;color:inherit;font-size:18px;line-height:1;cursor:pointer;width:26px;height:26px;border-radius:50%;padding:0}#cablemap .cm-px:hover{background:rgba(127,127,127,.35)}' +
		'#cablemap .cm-pdot{width:14px;height:14px;border-radius:50%;flex:none;display:inline-block}#cablemap .cm-pdot.cm-small{width:7px;height:7px;margin-right:6px}' +
		'#cablemap .cm-pb{padding:2px 12px 14px}' +
		'#cablemap .cm-ps{margin:16px 0 7px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;opacity:.5;font-weight:700}' +
		'#cablemap .cm-pills{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 2px}' +
		'#cablemap .cm-pill2{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);border:1px solid color-mix(in srgb,var(--c) 45%,transparent)}' +
		'#cablemap .cm-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}' +
		'#cablemap .cm-tile{background:rgba(127,127,127,.12);border:1px solid rgba(127,127,127,.18);border-radius:10px;padding:8px 10px;min-width:0}' +
		'#cablemap .cm-tl{font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}' +
		'#cablemap .cm-tv{font-size:15px;font-weight:700;word-break:break-word}' +
		'#cablemap .cm-card{background:rgba(127,127,127,.08);border:1px solid rgba(127,127,127,.18);border-radius:12px;padding:10px}' +
		'#cablemap .cm-link{display:flex;align-items:center;flex-wrap:wrap;gap:6px}' +
		'#cablemap svg.cm-spark{width:100%;height:64px;min-height:0;border:0;border-radius:0;cursor:crosshair;display:block}' +
		'#cablemap .cm-sw{display:flex;height:64px}#cablemap .cm-plot{position:relative;flex:1;min-width:0}' +
		'#cablemap .cm-vl{position:absolute;top:0;bottom:0;width:1px;background:currentColor;opacity:.35;pointer-events:none}' +
		'#cablemap .cm-hd{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;border:1.5px solid rgba(255,255,255,.85);pointer-events:none}' +
		'#cablemap .cm-tip{position:absolute;top:2px;z-index:3;border:1px solid rgba(127,127,127,.45);border-radius:8px;padding:4px 8px;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.45)}' +
		'#cablemap .cm-bar2{height:7px;border-radius:4px;background:rgba(127,127,127,.22);margin-top:10px;overflow:hidden}' +
		'#cablemap .cm-fill{height:100%;border-radius:4px}#cablemap .cm-ulab{display:flex;justify-content:space-between;margin-top:5px}' +
		'#cablemap .cm-pm{opacity:.6;font-size:11px}#cablemap .cm-pchips{display:flex;flex-wrap:wrap;gap:6px}' +
		'#cablemap .cm-chip{display:inline-flex;align-items:center;border:1px solid rgba(127,127,127,.35);background:rgba(127,127,127,.1);border-radius:999px;padding:2px 10px;font-size:11px}' +
		'#cablemap .cm-pprob{border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 9%,transparent);border-radius:4px 10px 10px 4px;padding:7px 10px;margin-bottom:7px}' +
		'#cablemap .cm-ptx{font-size:12px;line-height:1.35}#cablemap .cm-pmeta{display:flex;align-items:center;gap:8px;margin-top:5px}#cablemap .cm-pmeta .cm-pill2{padding:1px 8px;font-size:10px}' +
		'#cablemap .cm-pbtns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}' +
		'#cablemap .cm-pbtn{border:1px solid rgba(127,127,127,.4);border-radius:10px;padding:8px;text-align:center;color:inherit;text-decoration:none;font-weight:600}#cablemap .cm-pbtn:hover{background:rgba(127,127,127,.2)}' +
		'#cablemap .cm-pbtn.cm-primary{background:var(--c);border-color:var(--c);color:#fff}#cablemap .cm-pbtn.cm-primary:hover{filter:brightness(1.12);background:var(--c)}' +
		'#cablemap .cm-bar{display:flex;gap:12px;align-items:center;margin:0 0 8px;font-size:12px;opacity:.9;flex-wrap:wrap}' +
		'#cablemap .cm-bar button{cursor:pointer}' +
		'#cablemap .cm-leg{display:inline-flex;align-items:center;gap:4px}' +
		'#cablemap .cm-dot{width:10px;height:10px;border-radius:50%;display:inline-block}' +
		'#cablemap svg{width:100%;height:calc(100vh - 230px);min-height:520px;border:1px solid rgba(127,127,127,.35);border-radius:8px;cursor:grab;display:block;user-select:none}' +
		'#cablemap svg.cm-drag{cursor:grabbing}' +
		'#cablemap .cm-node{cursor:pointer}#cablemap .cm-node .cm-ring{transition:stroke-width .15s}' +
		'#cablemap .cm-node:hover .cm-ring{stroke-width:3.2}' +
		'#cablemap .cm-ctl{cursor:pointer}#cablemap .cm-ctl:hover .cm-pill{stroke-opacity:1;stroke-width:2}' +
		'#cablemap text{fill:currentColor;font-family:inherit}' +
		'#cablemap .cm-dots{fill:none;stroke-linecap:round;pointer-events:none}' +
		'#cablemap .cm-dn{animation:cm-down 1s linear infinite}#cablemap .cm-upw{animation:cm-up 1s linear infinite}' +
		'@keyframes cm-down{from{stroke-dashoffset:0}to{stroke-dashoffset:-96}}' +
		'@keyframes cm-up{from{stroke-dashoffset:48}to{stroke-dashoffset:144}}' +
		'#cablemap .cm-pulse{transform-box:fill-box;transform-origin:center;animation:cm-pulse 1.8s ease-out infinite;pointer-events:none}' +
		'@keyframes cm-pulse{0%{opacity:.85;transform:scale(1)}100%{opacity:0;transform:scale(1.7)}}' +
		'#cablemap .cm-menu{position:absolute;top:100%;left:0;z-index:20;margin-top:4px;padding:10px 12px;border:1px solid rgba(127,127,127,.5);border-radius:6px;min-width:210px;display:none;box-shadow:0 4px 14px rgba(0,0,0,.35)}' +
		'#cablemap .cm-menu.open{display:block}' +
		'#cablemap .cm-menu label{display:block;margin:5px 0;cursor:pointer;white-space:nowrap}' +
		'#cablemap .cm-menu button{margin:4px 6px 0 0}' +
		'#cablemap .cm-menu h4{margin:8px 0 2px;font-size:11px;opacity:.7;text-transform:uppercase}';
	document.head.appendChild(style);

	// ---- état persistant (localStorage, facultatif) ------------------------------
	function loadJSON(key, def) {
		try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? def : v; } catch (err) { return def; }
	}
	function saveJSON(key, val) {
		try { localStorage.setItem(key, JSON.stringify(val)); } catch (err) { /* ignore */ }
	}

	var DISP = {links: 'curved', traffic: true, animate: true};
	(function () {
		var d0 = CFG.display || {};
		if (d0.links) { DISP.links = d0.links; }
		if (d0.traffic !== undefined) { DISP.traffic = !!d0.traffic; }
		if (d0.animate !== undefined) { DISP.animate = !!d0.animate; }
		if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { DISP.animate = false; }
		var sv = loadJSON('cablemap.display', null);
		if (sv && sv.links) { DISP.links = sv.links; }
		if (sv && sv.traffic !== undefined) { DISP.traffic = !!sv.traffic; }
		if (sv && sv.animate !== undefined) { DISP.animate = !!sv.animate; }
	})();
	var manual = loadJSON('cablemap.pos', {});		// id -> {x, y} positions choisies à la main
	var fold = loadJSON('cablemap.fold', {});		// id -> true (replié) / false (déplié)
	var lastData = null, lastTree = null, curPos = {}, selId = null;
	var view = null, bounds = null;

	// ---- utilitaires -------------------------------------------------------------
	function sevColor(s) {
		if (s < 0) { return COL_OK; }
		return SEV[Math.min(s, SEV.length - 1)];
	}

	function fmtBps(b) {
		if (b === null || b === undefined) { return null; }
		if (b >= 1e9) { return (b / 1e9).toFixed(1) + ' Gb/s'; }
		if (b >= 1e6) { return (b / 1e6).toFixed(1) + ' Mb/s'; }
		if (b >= 1e3) { return (b / 1e3).toFixed(1) + ' Kb/s'; }
		return Math.round(b) + ' b/s';
	}

	function fmtSpeed(b) {
		if (b >= 1e9) { return +(b / 1e9).toFixed(2) + 'G'; }
		if (b >= 1e6) { return +(b / 1e6).toFixed(0) + 'M'; }
		return +(b / 1e3).toFixed(0) + 'K';
	}

	function el(name, attrs, parent) {
		var e = document.createElementNS(NS, name);
		for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) { e.setAttribute(k, attrs[k]); } }
		if (parent) { parent.appendChild(e); }
		return e;
	}

	function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

	function pageBg() {
		var c = getComputedStyle(document.body).backgroundColor;
		if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') { c = getComputedStyle(document.documentElement).backgroundColor; }
		return (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') ? '#0e1013' : c;
	}

	/** Texte avec un liseré de la couleur du fond : reste lisible quand un lien passe derrière. */
	function text(parent, attrs, content, bg) {
		var t = el('text', attrs, parent);
		t.style.paintOrder = 'stroke';
		t.style.stroke = bg;
		t.style.strokeWidth = '4px';
		t.style.strokeLinejoin = 'round';
		t.textContent = content;
		return t;
	}

	/** Part de la capacité du port réellement utilisée (0..1), pour un débit donné. */
	/** Niveau d'activité 0..1 en échelle logarithmique : de 0,001 % (0) à 100 % de la capacité du port (1).
	 *  L'échelle linéaire écraserait tout ce qui est sous quelques % ; en log, 10x plus de débit = même écart visuel. */
	function flowLevel(u) {
		if (u <= 1e-5) { return 0; }
		return Math.min(1, (Math.log(u) / Math.LN10 + 5) / 5);
	}

	/** Vitesse des traits en unités/seconde : de 8 (quasi au repos) à 176 (port saturé), progression géométrique. */
	function flowSpeed(lvl) { return 8 * Math.pow(22, lvl); }

	function utilOf(bps, speed) { return Math.min(1, Math.max(0, (bps || 0) / speed)); }

	function utilColor(u) {
		if (u >= UT_CRIT) { return COL_CRIT; }
		if (u >= UT_WARN) { return COL_WARN; }
		return COL_UPLINK;
	}

	// ---- arbre ------------------------------------------------------------------
	/**
	 * Les compteurs d'un lien sont lus sur le parent déclaré par le tag (edge.from). Si l'arbre affiché place l'autre
	 * extrémité en haut (racine choisie par cm:root, par exemple), « in » et « out » sont inversés : on les permute
	 * pour que ↑ signifie toujours « vers le parent affiché ».
	 */
	function flipIfReversed(e, displayedParent) {
		if (e.kind !== 'uplink' || e.from === displayedParent) { return e; }
		var c = {};
		Object.keys(e).forEach(function (k) { c[k] = e[k]; });
		c.in_bps = e.out_bps;
		c.out_bps = e.in_bps;
		return c;
	}

	function buildTree(data) {
		var byId = {}, adj = {};
		data.nodes.forEach(function (n) { byId[n.id] = n; adj[n.id] = []; });
		data.edges.forEach(function (e) {
			if (byId[e.from] && byId[e.to]) {
				adj[e.from].push({id: e.to, edge: e});
				adj[e.to].push({id: e.from, edge: e});
			}
		});

		var rootId = data.root;
		if (rootId === null || !byId[rootId]) {
			var best = -1;
			data.nodes.forEach(function (n) {
				if (adj[n.id].length > best) { best = adj[n.id].length; rootId = n.id; }
			});
		}

		var children = {}, parentOf = {}, parentEdge = {}, seen = {}, queue = [rootId];
		seen[rootId] = true;
		data.nodes.forEach(function (n) { children[n.id] = []; });
		while (queue.length) {
			var cur = queue.shift();
			adj[cur].forEach(function (nb) {
				if (!seen[nb.id]) {
					seen[nb.id] = true;
					children[cur].push(nb.id);
					parentOf[nb.id] = cur;
					parentEdge[nb.id] = flipIfReversed(nb.edge, cur);
					queue.push(nb.id);
				}
			});
		}
		var orphans = data.nodes.filter(function (n) { return !seen[n.id]; }).map(function (n) { return n.id; });
		return {byId: byId, rootId: rootId, children: children, parentOf: parentOf, parentEdge: parentEdge, orphans: orphans};
	}

	/** Replié par choix de l'utilisateur ; sinon, par défaut, un parent qui est lui-même rangé dans un gros groupe. */
	function isCollapsed(tree, id) {
		if (tree.children[id].length === 0) { return false; }
		if (fold[id] !== undefined) { return !!fold[id]; }
		var pid = tree.parentOf[id];
		return pid !== undefined && tree.children[pid].length > MAX_COLS;
	}

	function visChildren(tree, id) { return isCollapsed(tree, id) ? [] : tree.children[id]; }

	function hiddenInfo(tree, id) {
		var info = {cnt: 0, prob: 0, sev: -1, down: false};
		(function walk(i) {
			tree.children[i].forEach(function (c) {
				var n = tree.byId[c];
				info.cnt++;
				info.prob += n.problems;
				if (n.severity > info.sev) { info.sev = n.severity; }
				if (n.down) { info.down = true; }
				walk(c);
			});
		})(id);
		return info;
	}

	function layout(tree) {
		var pos = {};
		function vc(id) { return visChildren(tree, id); }
		function units(id) {
			var ch = vc(id), leaves = ch.filter(function (c) { return vc(c).length === 0; });
			if (leaves.length <= MAX_COLS) {
				return ch.map(function (c) { return {ids: [c], grid: false}; });
			}
			var u = ch.filter(function (c) { return vc(c).length > 0; }).map(function (c) { return {ids: [c], grid: false}; });
			u.push({ids: leaves, grid: true});
			return u;
		}
		function unitWidth(u) { return u.grid ? MAX_COLS * CELL_W : measure(u.ids[0]); }
		function measure(id) {
			var w = 0;
			units(id).forEach(function (u) { w += unitWidth(u); });
			return Math.max(w, CELL_W);
		}
		function place(id, x0, y) {
			var us = units(id);
			if (!us.length) { pos[id] = {x: x0 + CELL_W / 2, y: y}; return; }
			var cx = x0, centers = [];
			us.forEach(function (u) {
				var w = unitWidth(u);
				if (u.grid) {
					var gx = cx + w / 2;
					var pills = u.ids.some(function (c) { return tree.parentEdge[c] && tree.parentEdge[c].kind === 'uplink'; });
					var rh = pills ? 175 : ROW_H;
					u.ids.forEach(function (c, i) {
						pos[c] = {x: cx + (i % MAX_COLS) * CELL_W + CELL_W / 2, y: y + LEVEL_H + Math.floor(i / MAX_COLS) * rh, grid: true, gx: gx, gy: y + LEVEL_H, pills: pills};
					});
					centers.push(gx);
				}
				else {
					place(u.ids[0], cx, y + LEVEL_H);
					centers.push(pos[u.ids[0]].x);
				}
				cx += w;
			});
			pos[id] = {x: (centers[0] + centers[centers.length - 1]) / 2, y: y};
		}
		place(tree.rootId, 0, TOP);
		var oy = 0;
		Object.keys(pos).forEach(function (k) { oy = Math.max(oy, pos[k].y); });
		tree.orphans.forEach(function (id, i) {
			pos[id] = {x: (i % 8) * CELL_W + CELL_W / 2, y: oy + LEVEL_H + Math.floor(i / 8) * ROW_H};
		});
		return pos;
	}

	// Cause racine : hôte injoignable dont aucun ancêtre ne l'est ; ses descendants sont "impactés".
	function rootCause(tree) {
		var cause = {}, impacted = {};
		function walk(id, ancestorDown) {
			var n = tree.byId[id];
			if (n.down && !ancestorDown) { cause[id] = true; }
			else if (ancestorDown) { impacted[id] = true; }
			tree.children[id].forEach(function (c) { walk(c, ancestorDown || n.down); });
		}
		walk(tree.rootId, false);
		return {cause: cause, impacted: impacted};
	}

	// ---- géométrie des liens ---------------------------------------------------
	function cubicPoint(t, p0, p1, p2, p3) {
		var m = 1 - t;
		return [
			m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
			m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]
		];
	}

	/** Polyligne -> chemin SVG, coins vifs ou arrondis (rayon max 22). */
	function polyPath(pts, rounded) {
		pts = pts.filter(function (q, i) { return i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]; });
		if (!rounded || pts.length < 3) {
			return 'M' + pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' L');
		}
		var d = 'M' + pts[0][0] + ',' + pts[0][1];
		for (var i = 1; i < pts.length - 1; i++) {
			var a = pts[i - 1], b = pts[i], n = pts[i + 1];
			var l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(n[0] - b[0], n[1] - b[1]);
			var r = Math.min(22, l1 / 2, l2 / 2);
			var p1 = [b[0] - (b[0] - a[0]) / l1 * r, b[1] - (b[1] - a[1]) / l1 * r];
			var p2 = [b[0] + (n[0] - b[0]) / l2 * r, b[1] + (n[1] - b[1]) / l2 * r];
			d += ' L' + p1[0] + ',' + p1[1] + ' Q' + b[0] + ',' + b[1] + ' ' + p2[0] + ',' + p2[1];
		}
		return d + ' L' + pts[pts.length - 1][0] + ',' + pts[pts.length - 1][1];
	}

	/** Courbe de Bézier. Le lien part toujours du dessous du parent ; si l'enfant est au même niveau ou plus haut,
	 *  il arrive par le dessous de l'enfant (arc en U). */
	function curveGeom(p, c) {
		var p0, p1, p2, p3, k, t;
		if (c.y - R > p.y + PO + 10) {
			p0 = [p.x, p.y + PO];
			p3 = [c.x, c.y - R];
			k = (p3[1] - p0[1]) * 0.46;
			p1 = [p0[0], p0[1] + k];
			p2 = [p3[0], p3[1] - k];
			t = 0.78;
		}
		else {
			p0 = [p.x, p.y + PO];
			p3 = [c.x, c.y + R];
			k = 60 + Math.min(90, Math.abs(c.x - p.x) * 0.15);
			p1 = [p0[0], p0[1] + k];
			p2 = [p3[0], p3[1] + k];
			t = 0.5;
		}
		var m = cubicPoint(t, p0, p1, p2, p3);
		return {d: 'M' + p0 + ' C' + p1 + ' ' + p2 + ' ' + p3, lx: m[0], ly: m[1]};
	}

	/** Polyligne orthogonale (coins vifs ou arrondis). */
	function orthoGeom(p, c, mode) {
		var y0 = p.y + PO, below = c.y - R > p.y + PO + 10, yEnd, my, pts, lx = c.x, ly;
		if (below) {
			yEnd = c.y - R;
			my = y0 + (yEnd - y0) * 0.4;
			pts = [[p.x, y0], [p.x, my], [c.x, my], [c.x, yEnd]];
			ly = yEnd - 55.5;
		}
		else {
			// Enfant au même niveau ou plus haut : on passe sous les deux et on remonte par le dessous de l'enfant.
			yEnd = c.y + R;
			my = Math.max(y0 + 20, c.y + R + 50);
			pts = [[p.x, y0], [p.x, my], [c.x, my], [c.x, yEnd]];
			lx = (p.x + c.x) / 2;
			ly = my;
		}
		return {d: polyPath(pts, mode === 'rounded'), lx: lx, ly: ly};
	}

	/** Enfants d'un groupe : UN lien du parent vers le tronc du cadre (courbe ou orthogonal), puis ramification. */
	function gridGeom(p, c, mode) {
		var y0 = p.y + PO, ftop = c.gy - R - (c.pills ? 124 : 76), ty = ftop + 30, bo = c.pills ? 76 : 42;
		if (y0 > ty - 20) { return null; }
		var tail = [[c.gx, ty], [c.gx, c.y - bo], [c.x, c.y - bo], [c.x, c.y - R]], d;
		if (mode === 'curved') {
			var k = (ty - y0) * 0.46;
			d = 'M' + p.x + ',' + y0 + ' C' + p.x + ',' + (y0 + k) + ' ' + c.gx + ',' + (ty - k) + ' ' + c.gx + ',' + ty +
				polyPath(tail, true).replace(/^M/, ' L');
		}
		else {
			d = polyPath([[p.x, y0], [p.x, ty], [c.gx, ty]].concat(tail.slice(1)), mode === 'rounded');
		}
		return {d: d, lx: c.x, ly: c.y - R - 24};
	}

	function linkGeom(p, c, mode) {
		if (c.grid && !c.moved) {
			var g = gridGeom(p, c, mode);
			if (g) { return g; }
		}
		return mode === 'curved' ? curveGeom(p, c) : orthoGeom(p, c, mode);
	}

	// ---- icônes ----------------------------------------------------------------
	function drawIcon(g, type) {
		var ig = el('g', {transform: 'scale(1.12)', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7,
			'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.92}, g);
		function ln(x1, y1, x2, y2) { el('line', {x1: x1, y1: y1, x2: x2, y2: y2}, ig); }
		function rc(x, y, w, h, r) { el('rect', {x: x, y: y, width: w, height: h, rx: r}, ig); }
		function dot(x, y, r) { el('circle', {cx: x, cy: y, r: r, fill: 'currentColor', stroke: 'none'}, ig); }

		if (type === 'router') {
			rc(-11, 0, 22, 10, 3);
			ln(-6, 0, -9, -9);
			ln(6, 0, 9, -9);
			dot(-6, 5, 1);
			dot(-2, 5, 1);
			ln(3, 5, 8, 5);
		}
		else if (type === 'wifi') {
			dot(0, 7, 1.5);
			[[5, 3.54], [9, 6.36], [13, 9.19]].forEach(function (a) {
				el('path', {d: 'M' + (-a[1]) + ',' + (7 - a[1]) + ' A' + a[0] + ',' + a[0] + ' 0 0 1 ' + a[1] + ',' + (7 - a[1])}, ig);
			});
		}
		else if (type === 'hypervisor') {
			el('path', {d: 'M0,-11 L10,-5.5 L10,5.5 L0,11 L-10,5.5 L-10,-5.5 Z'}, ig);
			el('path', {d: 'M-10,-5.5 L0,0 L10,-5.5 M0,0 L0,11'}, ig);
		}
		else if (type === 'storage') {
			el('ellipse', {cx: 0, cy: -7, rx: 9, ry: 3.5}, ig);
			el('path', {d: 'M-9,-7 V7 A9,3.5 0 0 0 9,7 V-7 M-9,0 A9,3.5 0 0 0 9,0'}, ig);
		}
		else if (type === 'switch' || type === 'network') {
			rc(-12, -6, 24, 12, 3);
			[-7.5, -2.5, 2.5, 7.5].forEach(function (x) { ln(x, -1.5, x, 3); });
		}
		else {
			rc(-10, -10, 20, 8, 2);
			rc(-10, 2, 20, 8, 2);
			dot(-6, -6, 1);
			dot(-6, 6, 1);
			ln(0, -6, 6, -6);
			ln(0, 6, 6, 6);
		}
	}

	// ---- barre d'outils, menu ---------------------------------------------------
	function saveDisp() { saveJSON('cablemap.display', DISP); }

	function buildMenu() {
		var wrap = document.createElement('span');
		wrap.style.position = 'relative';
		var mb = document.createElement('button');
		mb.type = 'button';
		mb.className = 'btn-alt';
		mb.textContent = L.display + ' ▾';
		var panel = document.createElement('div');
		panel.className = 'cm-menu';

		[['traffic', L.traffic], ['animate', L.animate]].forEach(function (o) {
			var lt = document.createElement('label');
			var chk = document.createElement('input');
			chk.type = 'checkbox';
			chk.checked = DISP[o[0]];
			chk.addEventListener('change', function () { DISP[o[0]] = chk.checked; saveDisp(); if (lastData) { render(lastData); } });
			lt.appendChild(chk);
			lt.appendChild(document.createTextNode(' ' + o[1]));
			panel.appendChild(lt);
		});

		var h = document.createElement('h4');
		h.textContent = L.linkstyle;
		panel.appendChild(h);
		[['curved', L.curved], ['rounded', L.rounded], ['angled', L.angled]].forEach(function (o) {
			var lb = document.createElement('label');
			var rd = document.createElement('input');
			rd.type = 'radio';
			rd.name = 'cm-links';
			rd.checked = DISP.links === o[0];
			rd.addEventListener('change', function () { DISP.links = o[0]; saveDisp(); if (lastData) { render(lastData); } });
			lb.appendChild(rd);
			lb.appendChild(document.createTextNode(' ' + o[1]));
			panel.appendChild(lb);
		});

		var h2 = document.createElement('h4');
		h2.textContent = L.groups;
		panel.appendChild(h2);
		[[L.expandall, false], [L.collapseall, true]].forEach(function (o) {
			var b = document.createElement('button');
			b.type = 'button';
			b.className = 'btn-alt';
			b.textContent = o[0];
			b.addEventListener('click', function () {
				if (!lastTree) { return; }
				Object.keys(lastTree.children).forEach(function (id) {
					if (lastTree.children[id].length && String(id) !== String(lastTree.rootId)) { fold[id] = o[1]; }
				});
				saveJSON('cablemap.fold', fold);
				render(lastData);
				fit();
			});
			panel.appendChild(b);
		});

		mb.addEventListener('click', function (ev) {
			ev.stopPropagation();
			panel.style.background = pageBg();
			panel.classList.toggle('open');
		});
		panel.addEventListener('click', function (ev) { ev.stopPropagation(); });
		document.addEventListener('click', function () { panel.classList.remove('open'); });
		wrap.appendChild(mb);
		wrap.appendChild(panel);
		return wrap;
	}

	var bar = document.createElement('div');
	bar.className = 'cm-bar';
	var status = document.createElement('span');
	var btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'btn-alt';
	btn.textContent = L.recenter;
	var zoomOut = document.createElement('button');
	zoomOut.type = 'button';
	zoomOut.className = 'btn-alt';
	zoomOut.textContent = '\u2212';
	zoomOut.title = L.zoom_out;
	var zoomIn = document.createElement('button');
	zoomIn.type = 'button';
	zoomIn.className = 'btn-alt';
	zoomIn.textContent = '+';
	zoomIn.title = L.zoom_in;
	var btnReset = document.createElement('button');
	btnReset.type = 'button';
	btnReset.className = 'btn-alt';
	btnReset.textContent = L.reset;
	var btnExport = document.createElement('button');
	btnExport.type = 'button';
	btnExport.className = 'btn-alt';
	btnExport.textContent = L.export;
	btnExport.addEventListener('click', function () { exportPng(); });
	var navSvc = document.createElement('a');
	navSvc.className = 'btn-alt';
	navSvc.textContent = L.btn_services;
	navSvc.href = 'zabbix.php?action=cablemap.services';
	navSvc.style.textDecoration = 'none';
	bar.appendChild(navSvc);
	bar.appendChild(btn);
	bar.appendChild(zoomOut);
	bar.appendChild(zoomIn);
	bar.appendChild(btnReset);
	bar.appendChild(btnExport);
	bar.appendChild(buildMenu());
	bar.appendChild(status);
	[[L.ok, COL_OK]].concat([1, 2, 3, 4, 5].map(function (i) { return [L.severities[i], SEV[i]]; })).forEach(function (l) {
		var s = document.createElement('span');
		s.className = 'cm-leg';
		var dot = document.createElement('span');
		dot.className = 'cm-dot';
		dot.style.background = l[1];
		s.appendChild(dot);
		s.appendChild(document.createTextNode(l[0]));
		bar.appendChild(s);
	});
	var hint = document.createElement('span');
	hint.style.opacity = 0.7;
	hint.textContent = L.hint;
	bar.appendChild(hint);
	root_el.appendChild(bar);

	var svg = el('svg', {}, root_el);

	function applyView() { svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h); }
	/** Exporte le graphe COMPLET (pas seulement la zone visible) en PNG, avec le fond et les styles de la page. */
	function exportPng() {
		if (!bounds) { return; }
		var pad = 40, x = bounds.minx - pad, y = bounds.miny - pad, w = bounds.maxx - bounds.minx + 2 * pad, hh = bounds.maxy - bounds.miny + 2 * pad;
		var scale = Math.max(1, Math.min(2.5, 6000 / Math.max(w, hh)));
		var cs = getComputedStyle(root_el), bgc = pageBg();
		var clone = svg.cloneNode(true);
		clone.setAttribute('xmlns', NS);
		clone.setAttribute('viewBox', [x, y, w, hh].join(' '));
		clone.setAttribute('width', Math.round(w * scale));
		clone.setAttribute('height', Math.round(hh * scale));
		clone.setAttribute('style', 'color:' + cs.color + ';font-family:' + cs.fontFamily);
		var st = document.createElementNS(NS, 'style');
		st.textContent = style.textContent.replace(/#cablemap svg\{[^}]*\}/, '').replace(/#cablemap /g, '') + '*{animation:none!important}';
		clone.insertBefore(st, clone.firstChild);
		var bgr = document.createElementNS(NS, 'rect');
		['x', 'y'].forEach(function (k, i) { bgr.setAttribute(k, i ? y : x); });
		bgr.setAttribute('width', w);
		bgr.setAttribute('height', hh);
		bgr.setAttribute('fill', bgc);
		clone.insertBefore(bgr, st.nextSibling);
		var xml = new XMLSerializer().serializeToString(clone);
		var img = new Image();
		img.onload = function () {
			var cv = document.createElement('canvas');
			cv.width = Math.round(w * scale);
			cv.height = Math.round(hh * scale);
			cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
			cv.toBlob(function (blob) {
				var a = document.createElement('a'), d = new Date(), p2 = function (n) { return ('0' + n).slice(-2); };
				a.href = URL.createObjectURL(blob);
				a.download = 'cablemap-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + '.png';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
			}, 'image/png');
		};
		img.onerror = function () { status.textContent = L.error + ' : export'; };
		img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
	}

	function fit() {
		if (!bounds) { return; }
		var pad = 50;
		view = {x: bounds.minx - pad, y: bounds.miny - pad, w: bounds.maxx - bounds.minx + 2 * pad, h: bounds.maxy - bounds.miny + 2 * pad};
		applyView();
	}
	/** Après un dépliage : recadre seulement si le graphe déborde de la vue. */
	function ensureVisible() {
		if (!view || !bounds) { return; }
		if (bounds.minx < view.x || bounds.maxx > view.x + view.w || bounds.miny < view.y || bounds.maxy > view.y + view.h) { fit(); }
	}
	btn.addEventListener('click', fit);
	btnReset.addEventListener('click', function () {
		manual = {};
		fold = {};
		saveJSON('cablemap.pos', manual);
		saveJSON('cablemap.fold', fold);
		if (lastData) { render(lastData); }
		fit();
	});

	// ---- interactions : zoom, déplacement de la vue, déplacement des noeuds -------
	function toSvg(ev) {
		var m = svg.getScreenCTM();
		if (!m) { return {x: 0, y: 0}; }
		var pt = svg.createSVGPoint();
		pt.x = ev.clientX;
		pt.y = ev.clientY;
		return pt.matrixTransform(m.inverse());
	}

	/** Zoom d'un facteur f (<1 = zoom avant) autour d'un point du SVG (centre de la vue par défaut). */
	function zoomBy(f, cx, cy) {
		if (!view) { return; }
		var ref = bounds ? Math.max(bounds.maxx - bounds.minx, bounds.maxy - bounds.miny) + 100 : view.w;
		var nw = view.w * f;
		if (nw < ref * 0.06 || nw > ref * 6) { return; }
		f = nw / view.w;
		if (cx === undefined) { cx = view.x + view.w / 2; cy = view.y + view.h / 2; }
		view.x = cx - (cx - view.x) * f;
		view.y = cy - (cy - view.y) * f;
		view.w *= f;
		view.h *= f;
		applyView();
	}
	zoomIn.addEventListener('click', function () { zoomBy(0.8); });
	zoomOut.addEventListener('click', function () { zoomBy(1.25); });

	// Molette douce : le facteur dépend de l'amplitude du geste (et reste borné à ~12 % par évènement),
	// donc une molette cliquante zoome par petits pas et un pavé tactile reste progressif.
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
		raf = requestAnimationFrame(function () { raf = 0; if (lastData) { render(lastData); } });
	}

	function subtreeIds(id) {
		var out = [id];
		visChildren(lastTree, id).forEach(function (c) { out = out.concat(subtreeIds(c)); });
		return out;
	}

	svg.addEventListener('mousedown', function (ev) {
		if (!view || ev.button !== 0) { return; }
		var m = svg.getScreenCTM();
		pan = {x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, k: m ? m.a : 1};
		svg.classList.add('cm-drag');
	});
	window.addEventListener('mousemove', function (ev) {
		if (nd) {
			if (!nd.moved && Math.abs(ev.clientX - nd.sx) + Math.abs(ev.clientY - nd.sy) > 4) { nd.moved = true; }
			if (nd.moved) {
				var pt = toSvg(ev), dx = pt.x - nd.pt.x, dy = pt.y - nd.pt.y;
				nd.ids.forEach(function (o) { manual[o.id] = o.g ? {x: o.x + dx, y: o.y + dy, g: true} : {x: o.x + dx, y: o.y + dy}; });
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
			if (nd.moved) { saveJSON('cablemap.pos', manual); }
			else { openPanel(nd.node.id); }
			nd = null;
		}
		pan = null;
		svg.classList.remove('cm-drag');
	});

	function startNodeDrag(ev, n) {
		if (ev.button !== 0) { return; }
		ev.stopPropagation();
		ev.preventDefault();
		var ids = ev.shiftKey ? subtreeIds(n.id) : [n.id];
		nd = {
			pt: toSvg(ev), sx: ev.clientX, sy: ev.clientY, moved: false, node: n,
			ids: ids.filter(function (id) { return curPos[id]; }).map(function (id) {
				return {id: id, x: curPos[id].x, y: curPos[id].y, g: id !== n.id && !!curPos[id].grid && !curPos[id].moved};
			})
		};
	}

	// ---- rendu -----------------------------------------------------------------
	function render(data) {
		lastData = data;
		var tree = buildTree(data), pos = layout(tree);
		// Positions choisies à la main. Un membre de groupe déplacé avec son parent (Maj) reste dans le groupe.
		Object.keys(manual).forEach(function (id) {
			var q = pos[id], m = manual[id];
			if (!q) { return; }
			if (m.g && q.grid) { pos[id] = {x: m.x, y: m.y, grid: true, gx: q.gx + (m.x - q.x), gy: q.gy + (m.y - q.y), pills: q.pills}; }
			else { pos[id] = {x: m.x, y: m.y, moved: true}; }
		});
		curPos = pos;
		lastTree = tree;
		var rc = rootCause(tree), bg = pageBg();

		var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
		Object.keys(pos).forEach(function (k) {
			minx = Math.min(minx, pos[k].x - (pos[k].grid ? FRAME_PAD : CELL_W / 2)); maxx = Math.max(maxx, pos[k].x + (pos[k].grid ? FRAME_PAD : CELL_W / 2));
			miny = Math.min(miny, pos[k].y - R - 20); maxy = Math.max(maxy, pos[k].y + R + 90);
		});
		bounds = {minx: minx, maxx: maxx, miny: miny, maxy: maxy};
		if (!view) { fit(); }

		while (svg.firstChild) { svg.removeChild(svg.firstChild); }

		var defs = el('defs', {}, svg);
		var grad = el('linearGradient', {id: 'cm-card', x1: 0, y1: 0, x2: 0, y2: 1}, defs);
		el('stop', {offset: '0%', 'stop-color': 'currentColor', 'stop-opacity': 0.13}, grad);
		el('stop', {offset: '100%', 'stop-color': 'currentColor', 'stop-opacity': 0.02}, grad);
		var pat = el('pattern', {id: 'cm-grid', width: 40, height: 40, patternUnits: 'userSpaceOnUse'}, defs);
		el('circle', {cx: 1, cy: 1, r: 1, fill: 'currentColor', opacity: 0.14}, pat);
		el('rect', {x: -6000, y: -6000, width: 12000, height: 12000, fill: 'url(#cm-grid)', 'pointer-events': 'none'}, svg);

		var gGroups = el('g', {}, svg), gEdges = el('g', {}, svg), gLabels = el('g', {}, svg), gNodes = el('g', {}, svg);

		// Cadres de groupe : enfants rangés en grille sous un même parent.
		var clusters = {};
		Object.keys(pos).forEach(function (id) {
			var q = pos[id], pid = tree.parentOf[id];
			if (q.grid && !q.moved && pid !== undefined && pos[pid]) { (clusters[pid] = clusters[pid] || []).push(id); }
		});
		Object.keys(clusters).forEach(function (pid) {
			var ids = clusters[pid], cx0 = 1e9, cx1 = -1e9, cy0 = 1e9, cy1 = -1e9;
			ids.forEach(function (id) {
				cx0 = Math.min(cx0, pos[id].x); cx1 = Math.max(cx1, pos[id].x);
				cy0 = Math.min(cy0, pos[id].y); cy1 = Math.max(cy1, pos[id].y);
			});
			var pills = pos[ids[0]].pills, x = cx0 - FRAME_PAD, top = cy0 - R - (pills ? 124 : 76);
			var w = cx1 - cx0 + 2 * FRAME_PAD, h = (cy1 + R + 62) - top;
			el('rect', {x: x, y: top, width: w, height: h, rx: 22, fill: 'currentColor', 'fill-opacity': 0.045,
				stroke: 'currentColor', 'stroke-opacity': 0.2, 'stroke-width': 1}, gGroups);
			var cname = trunc(tree.byId[pid].name, 30) + ' · ' + ids.length, cw = cname.length * 6.6 + 24;
			el('rect', {x: x + 18, y: top - 11, width: cw, height: 22, rx: 11, fill: bg, stroke: 'currentColor', 'stroke-opacity': 0.35}, gGroups);
			var cap = el('text', {x: x + 18 + cw / 2, y: top + 4, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 600}, gGroups);
			cap.textContent = cname;
		});

		// Liens
		Object.keys(tree.parentOf).forEach(function (cid) {
			var pid = tree.parentOf[cid], p = pos[pid], c = pos[cid], e = tree.parentEdge[cid];
			if (!p || !c) { return; }
			var up = e.kind === 'uplink';
			// Utilisation réelle = débit / capacité du port (capacité inconnue : valeur par défaut de la configuration).
			var speed = e.speed_bps || DEFAULT_SPEED, known = !!e.speed_bps;
			var u = Math.max(utilOf(e.in_bps, speed), utilOf(e.out_bps, speed));
			var lvlMax = Math.max(flowLevel(utilOf(e.in_bps, speed)), flowLevel(utilOf(e.out_bps, speed)));
			var w = up ? 1.2 + Math.pow(lvlMax, 1.5) * 3.4 : 1.2;
			var color = up ? utilColor(u) : 'currentColor';
			var impacted = rc.impacted[cid];
			var g = linkGeom(p, c, DISP.links), d = g.d;
			if (up) {
				el('path', {d: d, fill: 'none', stroke: color, 'stroke-width': w + 7, 'stroke-linecap': 'round', opacity: impacted ? 0.03 : 0.09}, gEdges);
			}
			el('path', {d: d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linejoin': 'round',
				'stroke-dasharray': up ? '' : '6 5', opacity: impacted ? 0.2 : (up ? 0.65 : 0.4)}, gEdges);

			// Flux animé : vitesse et longueur selon l'utilisation de la capacité du port, pas le débit brut.
			if (DISP.animate && up && !impacted) {
				[['out', e.out_bps, 'cm-dn', COL_FLOW_OUT], ['in', e.in_bps, 'cm-upw', COL_FLOW_IN]].forEach(function (f) {
					if (!f[1] || f[1] < 100) { return; }
					var lvl = flowLevel(utilOf(f[1], speed)), em = Math.pow(lvl, 1.5);
					// Des points : plus le flux est fort, plus il y en a (denses), plus ils sont gros, lumineux et rapides.
					var n = Math.round(2 + em * 10), dot = 2.2 + em * 3.2;
					var dur = PERIOD / flowSpeed(lvl);
					var delay = -((Date.now() / 1000) % dur);
					var pat = [], k;
					for (k = 0; k < n; k++) { pat.push(0.01, (PERIOD / n - 0.01).toFixed(2)); }
					[[dot + 4, 0.14 + em * 0.14], [dot, 0.7 + em * 0.3]].forEach(function (lay) {
						var dots = el('path', {d: d, 'class': 'cm-dots ' + f[2], stroke: f[3], 'stroke-width': lay[0], opacity: lay[1],
							'stroke-dasharray': pat.join(' ')}, gEdges);
						dots.style.animationDuration = dur.toFixed(3) + 's';
						dots.style.animationDelay = delay.toFixed(3) + 's';
					});
				});
			}

			if (DISP.traffic && up) {
				var inS = fmtBps(e.in_bps), outS = fmtBps(e.out_bps);
				if (inS !== null || outS !== null) {
					var pw = 84, ph = 37;
					var gl = el('g', {opacity: impacted ? 0.4 : 1}, gLabels);
					var pct = u * 100;
					el('title', {}, gl).textContent = L.port + ' ' + e.port + ' — ' + (pct < 0.1 ? '<0.1' : pct.toFixed(1)) + ' % ' + L.usage + ' ' +
						fmtSpeed(speed) + (known ? '' : ' (?)');
					el('rect', {x: g.lx - pw / 2, y: g.ly - ph / 2, width: pw, height: ph, rx: 7, fill: bg, stroke: color, 'stroke-opacity': 0.6, 'stroke-width': 1}, gl);
					[L.port + ' ' + e.port + (known ? ' · ' + fmtSpeed(speed) : ''), '↓ ' + (outS || '—'), '↑ ' + (inS || '—')].forEach(function (t, i) {
						var tx = el('text', {x: g.lx, y: g.ly - ph / 2 + 11 + i * 11, 'text-anchor': 'middle', 'font-size': 9.5}, gl);
						if (i === 0) { tx.setAttribute('opacity', 0.65); }
						tx.textContent = t;
					});
				}
			}
		});

		// Noeuds
		data.nodes.forEach(function (n) {
			var p = pos[n.id];
			if (!p) { return; }
			var col = n.down ? COL_DOWN : sevColor(n.severity);
			var impacted = rc.impacted[n.id], cause = rc.cause[n.id];
			var g = el('g', {'class': 'cm-node', transform: 'translate(' + p.x + ',' + p.y + ')', opacity: impacted ? 0.5 : 1}, gNodes);
			g.addEventListener('mousedown', function (ev) { startNodeDrag(ev, n); });

			var title = el('title', {}, g);
			title.textContent = n.name + (n.ip ? '\n' + n.ip : '') + '\n' + (n.problems ? n.problems + ' ' + L.problems : L.noproblem) +
				(n.down ? '\n' + L.unreachable : '') + (impacted ? '\n' + L.impacted_tip : '');

			if (DISP.animate && (n.down || n.severity >= 4)) {
				el('rect', {x: -R, y: -R, width: 2 * R, height: 2 * R, rx: 16, fill: 'none', stroke: col, 'stroke-width': 2, 'class': 'cm-pulse'}, g);
			}
			el('rect', {x: -R, y: -R, width: 2 * R, height: 2 * R, rx: 16, fill: bg}, g);
			el('rect', {x: -R, y: -R, width: 2 * R, height: 2 * R, rx: 16, fill: 'url(#cm-card)'}, g);
			var ring = el('rect', {x: -R + 1, y: -R + 1, width: 2 * R - 2, height: 2 * R - 2, rx: 15, fill: 'none', stroke: col,
				'stroke-width': 2.2, 'stroke-dasharray': n.down ? '6 4' : '', 'class': 'cm-ring'}, g);
			if (n.down || n.severity >= 2) { ring.style.filter = 'drop-shadow(0 0 6px ' + col + ')'; }
			if (n.id === selId) {
				el('rect', {x: -R - 6, y: -R - 6, width: 2 * R + 12, height: 2 * R + 12, rx: 20, fill: 'none', stroke: 'currentColor',
					'stroke-opacity': 0.55, 'stroke-width': 1.5, 'stroke-dasharray': '3 4'}, g);
			}
			drawIcon(g, n.type);

			if (n.problems > 0) {
				el('circle', {cx: R - 3, cy: -R + 3, r: 10, fill: sevColor(n.severity)}, g);
				var b = el('text', {x: R - 3, y: -R + 7, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold'}, g);
				b.setAttribute('style', 'fill:#fff');
				b.textContent = n.problems;
			}

			var kids = tree.children[n.id].length, dy = kids ? 14 : 0;
			text(g, {y: R + 24 + dy, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600}, trunc(n.name, 22), bg);
			var t2 = text(g, {y: R + 38 + dy, 'text-anchor': 'middle', 'font-size': 10}, n.ip || '', bg);
			t2.style.opacity = 0.7;
			if (cause || impacted) {
				var t3 = text(g, {y: R + 51 + dy, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 'bold'}, cause ? L.rootcause : L.impacted, bg);
				t3.style.fill = cause ? '#e5534b' : '#f2c230';
			}

			// Replier / déplier les enfants.
			if (tree.children[n.id].length) {
				var folded = isCollapsed(tree, n.id);
				var cg = el('g', {'class': 'cm-ctl', transform: 'translate(0,' + (R + 10) + ')'}, g);
				if (folded) {
					// Pastille « ▸ N » : N équipements repliés ; badge coloré = problèmes cachés (couleur = pire sévérité).
					var h = hiddenInfo(tree, n.id), hc = h.down ? COL_DOWN : (h.sev >= 0 ? sevColor(h.sev) : COL_OK);
					var lab = '▸ ' + h.cnt, tw = lab.length * 6.6 + 14, hasBadge = h.prob > 0 || h.down, total = tw + (hasBadge ? 24 : 0);
					el('rect', {x: -total / 2 - 8, y: -16, width: total + 16, height: 34, fill: 'transparent'}, cg);
					el('rect', {x: -total / 2, y: -10, width: total, height: 20, rx: 10, fill: bg, stroke: 'currentColor',
						'stroke-opacity': 0.55, 'stroke-width': 1.4, 'class': 'cm-pill'}, cg);
					var bt = el('text', {x: -total / 2 + tw / 2, y: 3.5, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 'bold'}, cg);
					bt.textContent = lab;
					if (hasBadge) {
						el('circle', {cx: total / 2 - 12, cy: 0, r: 8.5, fill: hc}, cg);
						var bb = el('text', {x: total / 2 - 12, y: 3.2, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold'}, cg);
						bb.setAttribute('style', 'fill:#fff');
						bb.textContent = h.prob > 99 ? '99+' : (h.prob || '!');
					}
					el('title', {}, cg).textContent = L.expand + ' : ' + h.cnt + ' ' + L.hidden +
						(h.prob ? ' · ' + h.prob + ' ' + L.problems : '') + (h.down ? ' · ' + L.unreachable : '');
				}
				else {
					el('circle', {r: 15, fill: 'transparent'}, cg);
					el('circle', {r: 9, fill: bg, stroke: 'currentColor', 'stroke-opacity': 0.5, 'stroke-width': 1.4, 'class': 'cm-pill'}, cg);
					el('line', {x1: -4, y1: 0, x2: 4, y2: 0, stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round'}, cg);
					el('title', {}, cg).textContent = L.collapse;
				}
				cg.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
				cg.addEventListener('click', function (ev) {
					ev.stopPropagation();
					fold[n.id] = !folded;
					saveJSON('cablemap.fold', fold);
					render(lastData);
					if (folded) { ensureVisible(); }
				});
			}
		});

		var dt = new Date(data.generated * 1000);
		status.textContent = data.nodes.length + ' ' + L.hosts + ' · ' + data.edges.length + ' ' + L.links + ' · ' + L.updated + ' ' + dt.toLocaleTimeString();
		if (!data.edges.length) {
			var tg = CFG.tags || {};
			var msg = document.createElementNS(NS, 'text');
			msg.setAttribute('x', bounds.minx + 20);
			msg.setAttribute('y', bounds.maxy + 30);
			msg.setAttribute('font-size', 13);
			msg.textContent = L.empty + ' ' + (tg.uplink || [])[0] + ' = host:port · ' + (tg.parent || [])[0] + ' = host · ' + (tg.root || [])[0];
			svg.appendChild(msg);
		}
	}

	// ---- panneau d'informations hôte ---------------------------------------------
	var HOST_URL = 'zabbix.php?action=cablemap.host&hostid=';
	var panel = document.createElement('div');
	panel.className = 'cm-panel';
	panel.style.display = 'none';
	root_el.appendChild(panel);
	var detail = {}, panelBody = null;

	function h(tag, cls, txt, parent) {
		var e = document.createElement(tag);
		if (cls) { e.className = cls; }
		if (txt !== undefined && txt !== null) { e.textContent = txt; }
		if (parent) { parent.appendChild(e); }
		return e;
	}

	function dur(sec) {
		sec = Math.max(0, Math.round(sec));
		var d = Math.floor(sec / 86400), hh = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
		if (d) { return d + ' j ' + hh + ' h'; }
		if (hh) { return hh + ' h ' + m + ' min'; }
		if (m) { return m + ' min'; }
		return sec + ' s';
	}

	function fmtMetric(it) {
		var v = parseFloat(it.lastvalue), u = it.units || '';
		if (isNaN(v)) { return it.lastvalue; }
		if (u === 'uptime') { return dur(v); }
		if (u === 's') { return v < 1 ? (v * 1000).toFixed(1) + ' ms' : v.toFixed(2) + ' s'; }
		if (u === 'B') {
			var sfx = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
			while (v >= 1024 && i < sfx.length - 1) { v /= 1024; i++; }
			return v.toFixed(i ? 1 : 0) + ' ' + sfx[i];
		}
		if (u === '%') { return v.toFixed(1) + ' %'; }
		return +v.toFixed(2) + (u ? ' ' + u : '');
	}

	function descendants(id) {
		var n = 0;
		(lastTree.children[id] || []).forEach(function (c) { n += 1 + descendants(c); });
		return n;
	}

	function openPanel(id) {
		selId = id;
		panel.style.display = 'block';
		panel.style.top = (svg.getBoundingClientRect().top - root_el.getBoundingClientRect().top + 10) + 'px';
		panel.style.maxHeight = (svg.clientHeight - 20) + 'px';
		panel.style.background = pageBg();
		renderPanel();
		fetchDetail(id);
		if (lastData) { render(lastData); }
	}

	function closePanel() {
		selId = null;
		panel.style.display = 'none';
		if (lastData) { render(lastData); }
	}

	function fetchDetail(id) {
		fetch(HOST_URL + encodeURIComponent(id), {credentials: 'same-origin'})
			.then(function (r) { return r.json(); })
			.then(function (d) { detail[id] = d; if (selId === id) { renderPanel(); } })
			.catch(function () { detail[id] = {error: L.error}; if (selId === id) { renderPanel(); } });
	}

	function section(title) {
		h('div', 'cm-ps', title, panelBody);
	}

	function row(k, v, parent) {
		var r = h('div', 'cm-pr', null, parent || panelBody);
		h('span', 'cm-pk', k, r);
		h('span', 'cm-pv', v, r);
		return r;
	}

	function pbtn(label, url, parent) {
		var a = h('a', 'cm-pbtn', label, parent);
		a.href = url;
		return a;
	}

	/** Mini-graphique : courbes SVG + repères d'échelle + infobulle au survol (heure et valeur de chaque série). */
	function sparkline(parent, list, opts) {
		var W = 300, H = 64, P = 4, NSV = 'http://www.w3.org/2000/svg', n = list[0].vals.length;
		var max = 0, fmt = opts.fmt;
		list.forEach(function (l) { l.vals.forEach(function (v) { if (v !== null && v > max) { max = v; } }); });
		if (max <= 0) { max = 1; }
		function xOf(i) { return P + i * (W - 2 * P) / (n - 1); }
		function yOf(v) { return H - P - (v / max) * (H - 2 * P - 6); }

		var wrap = h('div', 'cm-sw', null, parent), plot = h('div', 'cm-plot', null, wrap);
		var sv = document.createElementNS(NSV, 'svg');
		sv.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
		sv.setAttribute('preserveAspectRatio', 'none');
		sv.setAttribute('class', 'cm-spark');
		list.forEach(function (s) {
			var p = [];
			s.vals.forEach(function (v, i) { if (v !== null) { p.push([xOf(i), yOf(v)]); } });
			if (p.length < 2) { return; }
			var line = p.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ');
			var area = document.createElementNS(NSV, 'path');
			area.setAttribute('d', line + ' L' + p[p.length - 1][0].toFixed(1) + ',' + (H - P) + ' L' + p[0][0].toFixed(1) + ',' + (H - P) + ' Z');
			area.setAttribute('fill', s.color);
			area.setAttribute('opacity', 0.16);
			sv.appendChild(area);
			var ln = document.createElementNS(NSV, 'path');
			ln.setAttribute('d', line);
			ln.setAttribute('fill', 'none');
			ln.setAttribute('stroke', s.color);
			ln.setAttribute('stroke-width', 1.6);
			ln.setAttribute('stroke-linejoin', 'round');
			ln.setAttribute('vector-effect', 'non-scaling-stroke');
			sv.appendChild(ln);
		});
		plot.appendChild(sv);

		// survol
		var vl = h('div', 'cm-vl', null, plot), tip = h('div', 'cm-tip', null, plot), dots = [];
		tip.style.background = pageBg();
		[vl, tip].forEach(function (e) { e.style.display = 'none'; });
		list.forEach(function (s) {
			var d = h('div', 'cm-hd', null, plot);
			d.style.background = s.color;
			d.style.display = 'none';
			dots.push(d);
		});
		plot.addEventListener('mouseleave', function () {
			vl.style.display = tip.style.display = 'none';
			dots.forEach(function (d) { d.style.display = 'none'; });
		});
		plot.addEventListener('mousemove', function (ev) {
			var r = sv.getBoundingClientRect(), fx = (ev.clientX - r.left) / r.width * W;
			var i = Math.max(0, Math.min(n - 1, Math.round((fx - P) / (W - 2 * P) * (n - 1))));
			var left = xOf(i) / W * 100;
			vl.style.display = tip.style.display = 'block';
			vl.style.left = left + '%';
			tip.textContent = '';
			var t = opts.from + (i + 0.5) * (opts.to - opts.from) / n;
			h('div', 'cm-pm', new Date(t * 1000).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}), tip);
			list.forEach(function (s, k) {
				var v = s.vals[i], row = h('div', null, null, tip);
				h('span', 'cm-pdot cm-small', null, row).style.background = s.color;
				row.appendChild(document.createTextNode((s.name ? s.name + ' ' : '') + (v === null ? '—' : fmt(v))));
				dots[k].style.display = v === null ? 'none' : 'block';
				if (v !== null) { dots[k].style.left = left + '%'; dots[k].style.top = (yOf(v) / H * 100) + '%'; }
			});
			if (left > 55) { tip.style.left = 'auto'; tip.style.right = (100 - left + 2) + '%'; }
			else { tip.style.right = 'auto'; tip.style.left = (left + 2) + '%'; }
		});
		return max;
	}

	function tile(parent, label, value, color) {
		var t = h('div', 'cm-tile', null, parent);
		h('div', 'cm-tl', label, t);
		var v = h('div', 'cm-tv', value, t);
		if (color) { v.style.color = color; }
		return t;
	}

	function pill(parent, txt, color) {
		var p = h('span', 'cm-pill2', txt, parent);
		p.style.setProperty('--c', color);
		return p;
	}

	function renderPanel() {
		if (!lastData || selId === null) { return; }
		var n = null;
		lastData.nodes.forEach(function (x) { if (x.id === selId) { n = x; } });
		if (!n) { closePanel(); return; }
		var top = panel.scrollTop;
		panel.textContent = '';
		var col = n.down ? COL_DOWN : sevColor(n.severity);
		panel.style.setProperty('--c', col);
		h('div', 'cm-strip', null, panel);

		var head = h('div', 'cm-ph', null, panel);
		var dot = h('span', 'cm-pdot', null, head);
		dot.style.background = col;
		dot.style.boxShadow = '0 0 12px ' + col;
		var ttl = h('div', 'cm-pt', null, head);
		h('div', 'cm-pn', n.name, ttl);
		h('div', 'cm-pip', (n.ip || '') + (n.type ? '  ·  ' + n.type : ''), ttl);
		var x = h('button', 'cm-px', '×', head);
		x.title = L.close;
		x.addEventListener('click', closePanel);
		panelBody = h('div', 'cm-pb', null, panel);

		var rc = rootCause(lastTree), pills = h('div', 'cm-pills', null, panelBody);
		pill(pills, n.down ? L.unreachable : (n.problems ? n.problems + ' ' + L.problems : L.ok), col);
		if (rc.cause[n.id]) { pill(pills, L.rootcause, COL_DOWN); }
		else if (rc.impacted[n.id]) { pill(pills, L.impacted, COL_WARN); }

		var d = detail[n.id];
		if (d && d.maintenance) { pill(pills, L.maintenance, COL_WARN); }

		var below = descendants(n.id);
		if (below) {
			var st = h('div', 'cm-tiles', null, panelBody);
			tile(st, L.p_below, (lastTree.children[n.id] || []).length + '  /  ' + below + ' ' + L.p_total);
		}

		var pe = lastTree.parentEdge[n.id];
		if (pe) {
			var par = null;
			lastData.nodes.forEach(function (x2) { if (x2.id === pe.from) { par = x2; } });
			section(L.p_uplink);
			var card = h('div', 'cm-card', null, panelBody);
			var lk = h('div', 'cm-link', null, card);
			h('span', 'cm-pm', L.p_to + ' ', lk);
			h('b', null, par ? par.name : '?', lk);
			if (pe.kind === 'uplink') {
				var spd = pe.speed_bps || DEFAULT_SPEED, uu = Math.max(utilOf(pe.in_bps, spd), utilOf(pe.out_bps, spd));
				h('span', 'cm-chip', L.port + ' ' + pe.port + (pe.speed_bps ? ' · ' + fmtSpeed(pe.speed_bps) : ''), lk);
				var tt = h('div', 'cm-tiles', null, card);
				tile(tt, '↓ ' + L.dir_down, fmtBps(pe.out_bps) || '—', COL_FLOW_OUT);
				tile(tt, '↑ ' + L.dir_up, fmtBps(pe.in_bps) || '—', COL_FLOW_IN);
				var bar = h('div', 'cm-bar2', null, card), fill = h('div', 'cm-fill', null, bar), uc = utilColor(uu);
				fill.style.width = Math.max(2, Math.min(100, uu * 100)) + '%';
				fill.style.background = uc;
				var ul = h('div', 'cm-ulab', null, card);
				h('span', 'cm-pm', L.p_util, ul);
				h('b', null, (uu * 100 < 0.1 ? '<0.1' : (uu * 100).toFixed(1)) + ' %', ul).style.color = uc;
			}
		}

		(d && d.graphs ? d.graphs : []).forEach(function (g) {
			var per = g.minutes >= 60 ? (g.minutes / 60) + ' h' : g.minutes + ' min';
			var gcard, gl;
			if (g.type === 'traffic') {
				section(L.graph_title + ' · ' + per);
				gcard = h('div', 'cm-card', null, panelBody);
				var gmax = sparkline(gcard, [{vals: g.in, color: COL_FLOW_IN, name: '↑'}, {vals: g.out, color: COL_FLOW_OUT, name: '↓'}],
					{from: g.from, to: g.to, fmt: function (v) { return fmtBps(v); }});
				gl = h('div', 'cm-ulab', null, gcard);
				h('span', 'cm-pm', 'max ' + fmtBps(gmax), gl);
				var lg = h('span', 'cm-pm', null, gl);
				h('span', null, '↑ ' + L.dir_up, lg).style.color = COL_FLOW_IN;
				h('span', null, '   ↓ ' + L.dir_down, lg).style.color = COL_FLOW_OUT;
			}
			else {
				var nm = (g.fallback && L.metric_names && L.metric_names[g.label]) || g.label;
				section(nm + ' · ' + per);
				gcard = h('div', 'cm-card', null, panelBody);
				var mfmt = function (v) { return fmtMetric({lastvalue: v, units: g.units}); };
				var mmax = sparkline(gcard, [{vals: g.values, color: COL_UPLINK, name: ''}], {from: g.from, to: g.to, fmt: mfmt}), last = null;
				g.values.forEach(function (v) { if (v !== null) { last = v; } });
				gl = h('div', 'cm-ulab', null, gcard);
				h('span', 'cm-pm', 'max ' + fmtMetric({lastvalue: mmax, units: g.units}), gl);
				h('b', null, last === null ? '—' : fmtMetric({lastvalue: last, units: g.units}), gl);
			}
		});

		if (!d) { h('div', 'cm-pm', L.loading, panelBody); }
		else if (d.error) { h('div', 'cm-pm', d.error, panelBody); }
		else {
			if (d.metrics && d.metrics.length) {
				section(L.p_metrics);
				var mt = h('div', 'cm-tiles', null, panelBody);
				d.metrics.forEach(function (m) {
					var warn = /loss/i.test(m.label) && parseFloat(m.lastvalue) > 0;
					tile(mt, (L.metric_names && L.metric_names[m.label]) || m.label, fmtMetric(m), warn ? COL_CRIT : null);
				});
			}
			if (d.interfaces && d.interfaces.length) {
				section(L.p_ifaces);
				var chips = h('div', 'cm-pchips', null, panelBody), TY = {1: 'Agent', 2: 'SNMP', 3: 'IPMI', 4: 'JMX'};
				d.interfaces.forEach(function (i) {
					var c = h('span', 'cm-chip', null, chips);
					var dt = h('span', 'cm-pdot cm-small', null, c);
					dt.style.background = i.available === '1' ? COL_OK : (i.available === '2' ? COL_DOWN : '#888');
					c.title = i.available === '1' ? L.if_ok : (i.available === '2' ? L.if_ko : L.if_unk);
					c.appendChild(document.createTextNode((TY[i.type] || '?') + ' ' + (i.useip === '0' && i.dns ? i.dns : i.ip) + ':' + i.port));
				});
			}
			if (d.groups && d.groups.length) {
				section(L.p_groups);
				var gc = h('div', 'cm-pchips', null, panelBody);
				d.groups.forEach(function (g) { h('span', 'cm-chip', g, gc); });
			}
			if (d.problems && d.problems.length) {
				section(L.p_problems + ' (' + d.problems.length + (d.problems.length >= 15 ? '+' : '') + ')');
				var now = Date.now() / 1000;
				d.problems.forEach(function (p) {
					var r = h('div', 'cm-pprob', null, panelBody), pc = sevColor(p.severity);
					r.style.setProperty('--c', pc);
					h('div', 'cm-ptx', p.name, r);
					var mm = h('div', 'cm-pmeta', null, r);
					pill(mm, L.severities[p.severity] || '', pc);
					h('span', 'cm-pm', L.since + ' ' + dur(now - p.clock) + (p.acknowledged ? '  ✓' : ''), mm);
				});
			}
		}
		var bb = h('div', 'cm-pbtns', null, panelBody);
		pbtn(L.btn_problems, 'zabbix.php?action=problem.view&filter_set=1&hostids%5B%5D=' + n.id, bb).classList.add('cm-primary');
		pbtn(L.btn_latest, 'zabbix.php?action=latest.view&filter_set=1&hostids%5B%5D=' + n.id, bb);
		if (d && d.dashboardid) {
			pbtn(L.btn_dash, 'zabbix.php?action=host.dashboard.view&hostid=' + n.id + '&dashboardid=' + d.dashboardid, bb);
		}
		else {
			pbtn(L.btn_graphs, 'zabbix.php?action=charts.view&filter_set=1&filter_hostids%5B%5D=' + n.id, bb);
		}
		var hb = pbtn(L.btn_host, 'zabbix.php?action=host.list&filter_set=1&filter_name=' + encodeURIComponent(n.name), bb);
		hb.addEventListener('click', function (ev) {
			// Fenêtre d'édition native de Zabbix par-dessus la carte ; repli sur la liste des hôtes si indisponible.
			if (typeof window.PopUp !== 'function') { return; }
			ev.preventDefault();
			try { window.PopUp('host.edit', {hostid: n.id}, {dialogueid: 'host_edit', dialogue_class: 'modal-popup-large', prevent_navigation: true}); }
			catch (err) { window.location.href = hb.href; }
		});
		panel.scrollTop = top;
	}

	window.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && selId !== null) { closePanel(); } });

	// Lien profond depuis la vue Services : ?focus=<hostid> déplie les ancêtres, centre la vue et ouvre le panneau.
	var focusId = (/[?&]focus=(\d+)/.exec(window.location.search) || [])[1] || null;
	function focusHost(id) {
		if (!lastTree || !lastTree.byId[id]) { return; }
		var p = lastTree.parentOf[id];
		while (p !== undefined) { fold[p] = false; p = lastTree.parentOf[p]; }
		saveJSON('cablemap.fold', fold);
		render(lastData);
		var q = curPos[id];
		if (q && view) { view.x = q.x - view.w / 2; view.y = q.y - view.h / 2; applyView(); }
		openPanel(id);
	}

	function load() {
		if (nd) { return; }
		fetch(DATA_URL, {credentials: 'same-origin'})
			.then(function (r) { return r.json(); })
			.then(function (d) {
				render(d);
				if (selId !== null) { renderPanel(); fetchDetail(selId); }
				if (focusId !== null) { var fid = focusId; focusId = null; focusHost(fid); }
			})
			.catch(function (err) { status.textContent = L.error + ' : ' + err; });
	}

	load();
	setInterval(load, REFRESH_MS);
})();
