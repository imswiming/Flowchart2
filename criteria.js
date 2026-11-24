// ===== Criteria view =====
// One list of criteria per flowchart (`criteria` in its saved data, so it syncs
// and shares with everything else) - every node's criteria view shows the same
// list.
//
// - 🎯 on a node's button row turns criteria mode on, right there in the
//   flowchart: the node's children are put aside and the criteria take their
//   place as yellow nodes. Build ideas under each criterion like any other
//   branch. While the mode is on, every node you click shows its criteria too
//   (they stay showing). ↩ on any of them - or "Turn off" on the mode's
//   banner - puts them all away (keeping what's under the criteria), brings
//   the children back and ends the mode. ✎ edits the list of criteria.
// - Shift + click nodes to pick several (yellow outline), then 🎯 on one of
//   them: the comparison view, shown on its own and the other way round -
//   each criterion once (yellow), under it every picked node, and under each
//   of those what it has for that criterion. Criteria none of them has
//   anything for start folded. A node added beside the picked ones (under any
//   criterion) is a new option: it shows under every criterion, and goes into
//   the flowchart next to the picked nodes when the view closes. ↩ / "Back to
//   flowchart" returns.
// - While a node's criteria are showing, its real children wait in
//   `_critSaved` (saving always writes the real children, never the
//   criteria nodes); showing them isn't saved, so a reload shows the children.
// - What's written under a criterion is kept on the node as
//   `_crit: { criterionId: [nodes] }` - only criteria with something under
//   them, without empty "+" placeholders or node ids, so it stays small.
//
// While the view is open the chart shows a stand-in tree (this.rootData); the
// real tree waits in this._critView.real. Saving always writes the real tree,
// with the view's edits put back into it first.
(function () {
    if (typeof FlowchartViewer === 'undefined') return;

    const YELLOW = '#ffcc00';
    // The "(Simplify?)" the chart adds to end nodes by itself: a picked node
    // drawn as an end node in the view mustn't take it back to the tree.
    const plainName = n => String(n || '').replace(/\s*\(Simplify\?\)\s*$/, '');
    const TOP_COLOR = '#454f63';
    const uid = () => `cr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const el = (tag, props, ...kids) => {
        const e = document.createElement(tag);
        Object.entries(props || {}).forEach(([k, v]) => {
            if (v === undefined || v === null || v === false) return;
            if (k === 'class') e.className = v;
            else if (k === 'text') e.textContent = v;
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
            else if (k === 'style') e.style.cssText = v;
            else e.setAttribute(k, v === true ? '' : v);
        });
        kids.flat().forEach(k => { if (k !== null && k !== undefined && k !== false) e.append(k); });
        return e;
    };

    const style = document.createElement('style');
    style.textContent = `
        #flowchart g.node.crit-picked rect { stroke: ${YELLOW} !important; stroke-width: 3px !important; }
        #crit-banner { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 1500;
            display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;
            max-width: calc(100% - 140px); padding: 6px 8px 6px 14px; border-radius: 22px;
            background: rgba(30, 36, 48, 0.92); border: 1px solid rgba(255, 204, 0, 0.45);
            color: #e6eef8; font: 14px Arial, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
        #crit-banner b { color: ${YELLOW}; }
        #crit-mode-bar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 1500;
            display: flex; align-items: center; gap: 8px; padding: 5px 6px 5px 14px; border-radius: 20px;
            background: rgba(30, 36, 48, 0.92); border: 1px solid rgba(255, 204, 0, 0.45); color: #e6eef8;
            font: 13px Arial, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,0.35); white-space: nowrap; }
        #crit-mode-bar b { color: ${YELLOW}; }
        #crit-mode-bar button { padding: 4px 11px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.18);
            background: rgba(255,255,255,0.08); color: #e6eef8; cursor: pointer; font: inherit; }
        #crit-mode-bar button.primary { background: ${YELLOW}; border-color: ${YELLOW}; color: #1d2430; font-weight: bold; }
        body.kanban-mode #crit-mode-bar, body.gantt-mode #crit-mode-bar { display: none; }
        @media (max-width: 600px) { #crit-mode-bar { top: 62px; } #crit-mode-bar > span { display: none; } }
        #crit-banner .crit-names { max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #crit-banner button { padding: 5px 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.18);
            background: rgba(255,255,255,0.08); color: #e6eef8; cursor: pointer; font: inherit; font-size: 13px; white-space: nowrap; }
        #crit-banner button:hover { background: rgba(255,255,255,0.16); }
        #crit-banner button.primary { background: ${YELLOW}; border-color: ${YELLOW}; color: #1d2430; font-weight: bold; }
        .crit-popup { width: min(460px, 94vw); z-index: 4500; }
        .crit-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
        .crit-row .cs-input { padding: 6px 8px; font-size: 14px; }
        .crit-row .cs-btn { padding: 5px 9px; }
        .crit-dot { width: 10px; height: 10px; border-radius: 50%; background: ${YELLOW}; flex: 0 0 auto; }
        @media (max-width: 600px) { #crit-banner { top: 62px; max-width: calc(100% - 20px); } }
    `;
    document.head.append(style);

    // A node (and what's below it) as stored: placeholders with nothing in them
    // dropped, no ids, only fields that are set.
    const leanNode = (n) => {
        if (!n || typeof n !== 'object') return null;
        const kids = (Array.isArray(n.children) ? n.children : []).map(leanNode).filter(Boolean);
        const name = typeof n.name === 'string' ? n.name : '';
        if (n._isPlaceholder && !name.trim() && !kids.length && !n._nodePhotoUrl) return null;
        const o = { name };
        if (n.color) o.color = n.color;
        if (n._isPlaceholder) o._isPlaceholder = true;
        if (n._collapsed) o._collapsed = true;
        if (n._hl) o._hl = true;
        if (n._nodePhotoUrl) o._nodePhotoUrl = n._nodePhotoUrl;
        if (n._nodePhotoUrl && n._nodePhotoIsDrawing) o._nodePhotoIsDrawing = true;
        if (kids.length) o.children = kids;
        return o;
    };

    const methods = {
        sanitizeCriteria(raw) {
            if (!Array.isArray(raw)) return [];
            const seen = new Set();
            return raw.filter(c => c && typeof c.id === 'string' && !seen.has(c.id) && seen.add(c.id))
                .map(c => ({ id: c.id, name: typeof c.name === 'string' ? c.name : '' }));
        },

        // `_crit` as saved: criteria that still exist and have something under them.
        leanCriteriaTrees(crit) {
            if (!crit || typeof crit !== 'object') return null;
            const live = new Set((this.criteria || []).map(c => c.id));
            const out = {};
            let any = false;
            Object.entries(crit).forEach(([id, arr]) => {
                if (!live.has(id) || !Array.isArray(arr)) return;
                const lean = arr.map(leanNode).filter(Boolean);
                if (lean.length) { out[id] = lean; any = true; }
            });
            return any ? out : null;
        },

        // ----- Buttons on the selected node (script.js refreshRadialButtons) -----
        // Returns the buttons to add to the node's row (or null).
        criteriaRowButton(d) {
            if (this._critView) return { label: '↩', activate: () => this.exitCriteriaView(), fontSize: 22 };
            if (!d || !d.parent || !d.data || this.isPlaceholderNodeData(d.data)) return null;
            const data = d.data;
            // Not on the criteria themselves or what's built under them, and not on
            // the Gantt branch (its nodes follow the chart). Kanban nodes can: the
            // board's sync leaves a node's criteria alone (kanban.js).
            for (let a = d; a; a = a.parent) {
                if (a.data && (a.data._critId || a.data._gantt)) return null;
            }
            if (data._critOn) {
                return [
                    { label: '🎯', icon: '↩', title: 'Criteria mode off: put every node\'s criteria away and show their children again', activate: () => this.critModeOff() },
                    { label: '✎', title: 'Edit the list of criteria', activate: () => this.openCriteriaEditor() }
                ];
            }
            return { label: '🎯', activate: () => this.criteriaButton(data), fontSize: 18 };
        },

        // 🎯: several nodes picked - the side-by-side view; one - its criteria in place.
        criteriaButton(data) {
            const picks = this._critPicks ? [...this._critPicks] : [];
            if (picks.length && !picks.includes(data)) picks.push(data);
            if (picks.length > 1) { this.openCriteriaView(data); return; }
            if (data._critOn) { this.critModeOff(); return; }
            if (!this.criteria || !this.criteria.length) {
                this.openCriteriaEditor(() => this.criteriaButton(data));
                return;
            }
            this._critMode = true;
            this.toggleCriteriaInline(data);
            this.updateCritModeBar();
        },

        // ----- Criteria mode -----
        // Can this node show its criteria? Real nodes only - not the criteria or
        // what's built under them, and not the Gantt branch.
        critEligible(d) {
            if (!d || !d.parent || !d.data || this.isPlaceholderNodeData(d.data)) return false;
            for (let a = d; a; a = a.parent) {
                if (a.data && (a.data._critId || a.data._gantt || a.data._critTop)) return false;
            }
            return true;
        },

        // Mode on and a node clicked: it shows its criteria too, keeping its
        // edit box open.
        critAutoOn(d) {
            const host = d.data;
            this._critAutoBusy = true;
            try {
                this.pushUndo();
                host._critSaved = Array.isArray(host.children) ? host.children : [];
                host.children = this.critNodesFor(host);
                host._critOn = true;
                host._collapsed = false;
                this.renderFlowchart(this.rootData);
                const d2 = d3.select('#flowchart').selectAll('g.node').data().find(x => x && x.data === host);
                if (d2) {
                    if (this.nodeBeingEdited && this.nodeBeingEdited.data === host) this.nodeBeingEdited = d2;
                    this.selectNode(d2);
                    this.refreshRadialButtons();
                }
                this.autosave();
            } finally {
                this._critAutoBusy = false;
            }
        },

        critModeOff() {
            const hosts = this.critInlineHosts();
            this._critMode = false;
            const sel = this.selectedNode && this.selectedNode.data;
            if (hosts.length) {
                if (this.nodeBeingEdited && typeof this.hideNodeEditPopup === 'function') this.hideNodeEditPopup(true);
                this.pushUndo();
                hosts.forEach(h => this.critInlineOff(h, false));
                this.renderFlowchart(this.rootData);
                this.autosave();
                const d = sel && d3.select('#flowchart').selectAll('g.node').data().find(x => x && x.data === sel);
                if (d) { this.selectNode(d); this.refreshRadialButtons(); }
            }
            this.updateCritModeBar();
        },

        // A small banner while the mode is on.
        updateCritModeBar() {
            let bar = document.getElementById('crit-mode-bar');
            const on = this._critMode && !this._critView && !this._kanbanMode && !this._ganttMode;
            if (!on) { if (bar) bar.remove(); return; }
            if (bar) return;
            const panel = document.getElementById('flowchart-panel') || document.body;
            bar = el('div', { id: 'crit-mode-bar' },
                el('span', null, el('b', { text: '🎯 Criteria mode' }), ' - click nodes to show their criteria'),
                el('button', { type: 'button', text: '✎ Criteria', title: 'Add, rename, reorder or remove criteria', onclick: () => this.openCriteriaEditor() }),
                el('button', { type: 'button', class: 'primary', text: 'Turn off', title: 'Put every node\'s criteria away', onclick: () => this.critModeOff() }));
            panel.append(bar);
        },

        // Which buttons the view's own nodes keep. A criterion can take children
        // (whatever is built under it is an ordinary branch) but can't be moved,
        // deleted or given siblings; a node showing its criteria can't be given
        // a child of its own until they're put away.
        criteriaNodeLock(d) {
            if (!d || !d.data) return null;
            const data = d.data;
            const keep = ['F', '⊟', '⊞', '↩'];
            if (data._critPivot) return { keep, addChild: false };
            if (data._critId) return { keep, addChild: true };
            if (this._critView && data._critCol) return { keep, addChild: true, sides: true };
            if (this._critView && (data._critHost !== undefined || data._critTop)) return { keep, addChild: false };
            if (!this._critView && data._critOn) return { keep: null, addChild: false, sides: true, parent: true };
            return null;
        },

        // ----- Criteria shown in place (one node at a time, in the full tree) -----
        critInlineHosts() {
            const out = [];
            const walk = (n) => {
                if (!n || typeof n !== 'object') return;
                if (n._critOn) out.push(n);
                (n.children || []).forEach(walk);
            };
            walk(this.rootData);
            return out;
        },

        critNodesFor(host) {
            if (!host._crit || typeof host._crit !== 'object') host._crit = {};
            return this.criteria.map((c) => {
                if (!Array.isArray(host._crit[c.id])) host._crit[c.id] = [];
                return { name: c.name || 'Criterion', color: YELLOW, _critId: c.id, children: host._crit[c.id] };
            });
        },

        // What's under each criterion node goes back into host._crit (and a
        // criterion renamed here renames it everywhere).
        critInlineWriteBack(host) {
            if (!host || !host._critOn) return;
            if (!host._crit || typeof host._crit !== 'object') host._crit = {};
            (host.children || []).forEach((c) => {
                if (!c || !c._critId) return;
                host._crit[c._critId] = Array.isArray(c.children) ? c.children : [];
                const crit = this.criteria.find(x => x.id === c._critId);
                const nm = (c.name || '').trim();
                if (crit && nm && nm !== crit.name) {
                    crit.name = nm;
                    this.critInlineHosts().forEach(h => (h.children || []).forEach((k) => { if (k && k._critId === crit.id) k.name = nm; }));
                }
                if (c.color !== YELLOW) c.color = YELLOW;
            });
        },

        critInlineOff(host, render = true) {
            if (!host || !host._critOn) return;
            this.critInlineWriteBack(host);
            host.children = Array.isArray(host._critSaved) ? host._critSaved : [];
            delete host._critSaved;
            delete host._critOn;
            if (render) this.renderFlowchart(this.rootData);
        },

        critInlineOffAll() {
            this.critInlineHosts().forEach(h => this.critInlineOff(h, false));
        },

        toggleCriteriaInline(host) {
            if (!host) return;
            if (!host._critOn && (!this.criteria || !this.criteria.length)) {
                this.openCriteriaEditor(() => this.toggleCriteriaInline(host));
                return;
            }
            if (this.nodeBeingEdited && typeof this.hideNodeEditPopup === 'function') this.hideNodeEditPopup(true);
            this.pushUndo();
            if (host._critOn) {
                this.critInlineOff(host, false);
            } else {
                host._critSaved = Array.isArray(host.children) ? host.children : [];
                host.children = this.critNodesFor(host);
                host._critOn = true;
                host._collapsed = false;
            }
            this.clearCritPicks();
            this.renderFlowchart(this.rootData);
            this.autosave();
            // The node stays selected, with its buttons.
            const d = d3.select('#flowchart').selectAll('g.node').data().find(x => x && x.data === host);
            if (d) { this.selectNode(d); this.refreshRadialButtons(); }
        },

        // The criteria list changed: nodes showing theirs show the new list.
        critInlineRefresh() {
            this.critInlineHosts().forEach((h) => {
                this.critInlineWriteBack(h);
                h.children = this.critNodesFor(h);
            });
        },

        // ----- Picking several nodes (Shift + click) -----
        // The yellow outline: on the Shift-picked nodes, and on the selected node.
        paintCritPicks() {
            const picks = this._critPicks;
            if (typeof d3 === 'undefined') return;
            const sel = this.selectedNode && this.selectedNode.data;
            d3.selectAll('#flowchart g.node').classed('crit-picked', d => !!(d && d.data && (
                (picks && picks.size && picks.has(d.data)) || (sel && d.data === sel && !this.isPlaceholderNodeData(d.data)))));
        },

        clearCritPicks() {
            if (this._critPicks && this._critPicks.size) {
                this._critPicks.clear();
                this.paintCritPicks();
            }
        },

        // ----- The view -----
        criteriaHosts(hostData) {
            const picks = this._critPicks ? [...this._critPicks] : [];
            if (picks.length && !picks.includes(hostData)) picks.push(hostData);
            const hosts = picks.length > 1 ? picks : [hostData];
            // Only nodes still in the tree, in tree order.
            const order = [];
            const walk = (n) => { if (!n) return; order.push(n); (n.children || []).forEach(walk); };
            walk(this.rootData);
            return hosts.filter(h => order.includes(h)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
        },

        openCriteriaView(hostData) {
            if (this._critView || !hostData) return;
            if (!this.criteria || !this.criteria.length) {
                this.openCriteriaEditor(() => this.openCriteriaView(hostData));
                return;
            }
            this.critInlineOffAll();
            const hosts = this.criteriaHosts(hostData);
            if (!hosts.length) return;
            if (this.nodeBeingEdited && typeof this.hideNodeEditPopup === 'function') this.hideNodeEditPopup(true);
            if (typeof this.deselectNode === 'function') this.deselectNode();
            this._critView = {
                real: this.rootData,
                hosts,
                undo: this.undoStack,
                redo: this.redoStack,
                transform: this.transform
            };
            // Undo inside the view steps through the view's own edits.
            this.undoStack = [];
            this.redoStack = [];
            this.updateUndoRedoButtons();
            if (this._critPicks) this._critPicks.clear();
            this.renderFlowchart(this.buildCriteriaTree(), { fitView: true });
            if (typeof this.applyPendingFit === 'function') { try { this.applyPendingFit(); } catch (e) { /* fits on its own */ } }
        },

        buildCriteriaTree() {
            const v = this._critView;
            const open = function unfold(n) { if (n) { n._collapsed = false; (n.children || []).forEach(unfold); } };
            if (v.hosts.length > 1) {
                // Comparing: criterion -> the picked nodes -> what each has for it.
                const has = (h, c) => Array.isArray(h._crit && h._crit[c.id]) && h._crit[c.id].some(x => x && !this.isPlaceholderNodeData(x));
                // Every criterion holds every picked node; a criterion none of
                // them has anything for starts folded, the others unfolded.
                const crits = this.criteria.map(c => ({
                    name: c.name || 'Criterion',
                    color: YELLOW,
                    _critId: c.id,
                    _critPivot: true,
                    _collapsed: !v.hosts.some(h => has(h, c)),
                    children: v.hosts.map((h, i) => {
                        if (!h._crit || typeof h._crit !== 'object') h._crit = {};
                        if (!Array.isArray(h._crit[c.id])) h._crit[c.id] = [];
                        h._crit[c.id].forEach(open);
                        return { name: h.name, color: h.color, _critHost: i, _critCol: c.id, children: h._crit[c.id] };
                    })
                }));
                return crits.length === 1 ? crits[0] : { name: '', color: TOP_COLOR, _critTop: true, children: crits };
            }
            const copies = v.hosts.map((h, i) => ({
                name: h.name,
                color: h.color,
                _critHost: i,
                children: this.criteria.map((c) => {
                    if (!h._crit || typeof h._crit !== 'object') h._crit = {};
                    if (!Array.isArray(h._crit[c.id])) h._crit[c.id] = [];
                    // Several nodes side by side: everything unfolded.
                    if (v.hosts.length > 1) h._crit[c.id].forEach(function open(n) { if (n) { n._collapsed = false; (n.children || []).forEach(open); } });
                    return { name: c.name || 'Criterion', color: YELLOW, _critId: c.id, children: h._crit[c.id] };
                })
            }));
            return copies.length === 1 ? copies[0] : { name: '', color: TOP_COLOR, _critTop: true, children: copies };
        },

        // Puts the view's edits back into the real tree: the nodes' names and
        // colours, what's under each criterion, and criteria renamed in the view.
        critWriteBack() {
            const v = this._critView;
            if (!v) return;
            const renamed = new Map();
            const renamedHosts = new Map();
            const newHosts = [];
            const recolored = new Map();
            const visit = (n) => {
                if (!n || typeof n !== 'object') return;
                // Comparing: a criterion node, then one node per picked node, each
                // holding what that node has for the criterion.
                if (n._critPivot && n._critId) {
                    const crit = this.criteria.find(x => x.id === n._critId);
                    const nm = (n.name || '').trim();
                    if (crit && nm && nm !== crit.name) { crit.name = nm; renamed.set(crit.id, nm); }
                    if (n.color !== YELLOW) n.color = YELLOW;
                    const sibs = n.children || [];
                    sibs.forEach((hc, idx) => {
                        if (!hc || typeof hc._critHost === 'number' || hc._critId || hc._critTop) return;
                        if (this.isPlaceholderNodeData(hc) && !(hc.name || '').trim()) return;
                        // A new option, added next to the picked nodes: it becomes
                        // one of them (a real node, put into the flowchart beside
                        // its neighbour when the view closes).
                        const node = { name: plainName(hc.name), color: hc.color || '#00a67e', children: [], _crit: {} };
                        const hostIdx = v.hosts.length;
                        v.hosts.push(node);
                        let near = null;
                        let after = true;
                        for (let j = idx - 1; j >= 0 && near === null; j--) if (sibs[j] && typeof sibs[j]._critHost === 'number') near = sibs[j]._critHost;
                        if (near === null) { after = false; for (let j = idx + 1; j < sibs.length && near === null; j++) if (sibs[j] && typeof sibs[j]._critHost === 'number') near = sibs[j]._critHost; }
                        if (!v.added) v.added = [];
                        v.added.push({ hostIdx, near, after });
                        hc._critHost = hostIdx;
                        hc._critCol = n._critId;
                        delete hc._isPlaceholder;
                        newHosts.push({ hostIdx, near, after });
                    });
                    sibs.forEach((hc) => {
                        if (!hc || typeof hc._critHost !== 'number' || !v.hosts[hc._critHost]) return;
                        const host = v.hosts[hc._critHost];
                        if (!host._crit || typeof host._crit !== 'object') host._crit = {};
                        host._crit[n._critId] = Array.isArray(hc.children) ? hc.children : [];
                        const hn = (hc.name || '').trim();
                        if (hn && plainName(hn) !== plainName(host.name)) { host.name = plainName(hc.name); renamedHosts.set(hc._critHost, host.name); }
                        // A new option takes its colour once named (it starts grey).
                        if (hc.color && hc.color !== host.color && hc.color !== this.getPlaceholderColor()) { host.color = hc.color; recolored.set(hc._critHost, hc.color); }
                    });
                    return;
                }
                if (typeof n._critHost === 'number' && v.hosts[n._critHost]) {
                    const host = v.hosts[n._critHost];
                    if ((n.name || '').trim() && plainName(n.name) !== plainName(host.name)) host.name = plainName(n.name);
                    if (n.color && !this.isPlaceholderNodeData(n)) host.color = n.color;
                    if (!host._crit || typeof host._crit !== 'object') host._crit = {};
                    (n.children || []).forEach((c) => {
                        if (!c || !c._critId) return;
                        host._crit[c._critId] = Array.isArray(c.children) ? c.children : [];
                        const crit = this.criteria.find(x => x.id === c._critId);
                        const nm = (c.name || '').trim();
                        if (crit && nm && nm !== crit.name) { crit.name = nm; renamed.set(crit.id, nm); }
                        if (c.color !== YELLOW) c.color = YELLOW;
                    });
                    return;
                }
                (n.children || []).forEach(visit);
            };
            visit(this.rootData);
            // A new option shows under every criterion, next to the same neighbour.
            if (newHosts.length) {
                const pivots = [];
                const find = (n) => { if (!n) return; if (n._critPivot) pivots.push(n); (n.children || []).forEach(find); };
                find(this.rootData);
                newHosts.forEach(({ hostIdx, near, after }) => {
                    const node = v.hosts[hostIdx];
                    pivots.forEach((pn) => {
                        const kids = pn.children || (pn.children = []);
                        if (kids.some(k => k && k._critHost === hostIdx)) return;
                        if (!Array.isArray(node._crit[pn._critId])) node._crit[pn._critId] = [];
                        const copy = { name: node.name, color: node.color, _critHost: hostIdx, _critCol: pn._critId, children: node._crit[pn._critId] };
                        let at = kids.findIndex(k => k && k._critHost === near);
                        at = at < 0 ? kids.filter(k => k && typeof k._critHost === 'number').length : at + (after ? 1 : 0);
                        kids.splice(at, 0, copy);
                    });
                });
            }
            // A criterion (or, comparing, a node) renamed in one place is renamed
            // everywhere it shows.
            if (renamed.size || renamedHosts.size || recolored.size) {
                const rename = (n) => {
                    if (!n) return;
                    if (n._critId && renamed.has(n._critId)) n.name = renamed.get(n._critId);
                    if (typeof n._critHost === 'number' && renamedHosts.has(n._critHost)) n.name = renamedHosts.get(n._critHost);
                    if (typeof n._critHost === 'number' && recolored.has(n._critHost)) n.color = recolored.get(n._critHost);
                    (n.children || []).forEach(rename);
                };
                rename(this.rootData);
            }
        },

        exitCriteriaView(render = true) {
            const v = this._critView;
            if (!v) return;
            if (this.nodeBeingEdited && typeof this.hideNodeEditPopup === 'function') {
                try { this.hideNodeEditPopup(true); } catch (e) { /* closing anyway */ }
            }
            this.critWriteBack();
            const placed = this.critPlaceNewOptions(v);
            this._critView = null;
            this.selectedNode = null;
            this.rootData = v.real;
            this.undoStack = v.undo || [];
            this.redoStack = v.redo || [];
            this.updateUndoRedoButtons();
            const banner = document.getElementById('crit-banner');
            if (banner) banner.remove();
            if (render) {
                this.transform = v.transform || this.transform;
                this.renderFlowchart(this.rootData, { keepTransform: true });
                if (placed.length) this.critFocusNode(placed[0]);
            }
            this.autosave();
        },

        // New options made in the comparison view (still there, with a name or
        // ideas): each goes into the real tree as a sibling of the picked node
        // it was added next to. Returns them.
        critPlaceNewOptions(v) {
            const out = [];
            if (!v.added || !v.added.length) return out;
            const shown = new Set();
            const walk = (n) => { if (!n) return; if (typeof n._critHost === 'number') shown.add(n._critHost); (n.children || []).forEach(walk); };
            walk(this.rootData);
            const parentOf = (target) => {
                let found = null;
                const w = (n) => {
                    if (!n || found) return;
                    const kids = n._critOn ? (n._critSaved || []) : (n.children || []);
                    if (kids.includes(target)) { found = n; return; }
                    kids.forEach(w);
                };
                w(v.real);
                return found;
            };
            v.added.forEach(({ hostIdx, near, after }) => {
                const node = v.hosts[hostIdx];
                if (!node || !shown.has(hostIdx)) return;
                const hasIdeas = Object.values(node._crit || {}).some(a => Array.isArray(a) && a.some(x => x && !this.isPlaceholderNodeData(x)));
                if (!(node.name || '').trim() && !hasIdeas) return;
                const neighbour = near !== null ? v.hosts[near] : v.hosts[0];
                const parent = neighbour && parentOf(neighbour);
                if (!parent) return;
                const field = parent._critOn ? '_critSaved' : 'children';
                const kids = parent[field] || (parent[field] = []);
                const at = kids.indexOf(neighbour);
                kids.splice(at < 0 ? kids.length : at + (after ? 1 : 0), 0, node);
                out.push(node);
            });
            return out;
        },

        // Selects a node and brings it into view.
        critFocusNode(data) {
            const d = d3.select('#flowchart').selectAll('g.node').data().find(x => x && x.data === data);
            if (!d) return;
            this.selectNode(d);
            this.refreshRadialButtons();
            const svg = d3.select('#flowchart svg');
            if (this._zoomBehavior && !svg.empty() && Number.isFinite(d.x)) {
                const w = this.flowchartPanel.clientWidth, h = this.flowchartPanel.clientHeight;
                const z = this.transform.k;
                svg.transition().duration(350).call(this._zoomBehavior.transform, d3.zoomIdentity.translate(w / 2 - d.x * z, h / 3 - d.y * z).scale(z));
            }
        },

        // In the view, the chart's own hidden top node and the empty node holding
        // the criteria (with its "+" stub) are only there to hang the tree on:
        // they and their lines aren't drawn, so the criteria are the top row.
        hideCritScaffold() {
            if (typeof d3 === 'undefined') return;
            const scaffold = (d) => !!d && (d.depth === 0 || (d.data && d.data._critTop)
                || (d.parent && d.parent.data && d.parent.data._critTop && this.isPlaceholderNodeData(d.data))
                || (d.depth === 1 && this.isPlaceholderNodeData(d.data)));
            d3.selectAll('#flowchart g.node').each(function (d) { if (scaffold(d)) this.style.display = 'none'; });
            d3.selectAll('#flowchart path.link').each(function (l) { if (l && (scaffold(l.source) || scaffold(l.target))) this.style.display = 'none'; });
        },

        updateCritBanner() {
            const v = this._critView;
            let banner = document.getElementById('crit-banner');
            if (!v) { if (banner) banner.remove(); return; }
            const panel = document.getElementById('flowchart-panel') || document.body;
            if (!banner) {
                banner = el('div', { id: 'crit-banner' });
                panel.append(banner);
            }
            banner.innerHTML = '';
            const names = v.hosts.map(h => (h.name || '').trim() || '(no name)');
            banner.append(
                el('span', null, el('b', { text: '🎯 Criteria' })),
                el('span', { class: 'crit-names', title: names.join(', '), text: names.join('  ·  ') }),
                el('button', { type: 'button', text: '✎ Criteria', title: 'Add, rename, reorder or remove criteria', onclick: () => this.openCriteriaEditor() }),
                el('button', { type: 'button', class: 'primary', text: '↩ Back to flowchart', onclick: () => this.exitCriteriaView() }));
        },

        // ----- Editing the list -----
        openCriteriaEditor(after) {
            const old = document.getElementById('crit-popup');
            if (old) old.remove();
            const pop = el('div', { id: 'crit-popup', class: 'cs-popup crit-popup' });
            const rows = (this.criteria || []).map(c => ({ id: c.id, name: c.name }));
            const list = el('div');
            const close = () => { pop.remove(); document.removeEventListener('keydown', onKey, true); };
            const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
            document.addEventListener('keydown', onKey, true);
            const draw = (focusLast) => {
                list.innerHTML = '';
                rows.forEach((r, i) => {
                    const input = el('input', { class: 'cs-input', type: 'text', value: r.name, placeholder: 'Criterion' });
                    input.addEventListener('input', () => { r.name = input.value; });
                    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rows.splice(i + 1, 0, { id: uid(), name: '' }); draw(i + 1); } });
                    list.append(el('div', { class: 'crit-row' }, el('span', { class: 'crit-dot' }), input,
                        el('button', { class: 'cs-btn', type: 'button', text: '↑', title: 'Move up', disabled: i === 0, onclick: () => { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); draw(); } }),
                        el('button', { class: 'cs-btn', type: 'button', text: '↓', title: 'Move down', disabled: i === rows.length - 1, onclick: () => { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); draw(); } }),
                        el('button', { class: 'cs-btn', type: 'button', text: '✕', title: 'Remove', onclick: () => { rows.splice(i, 1); draw(); } })));
                    if (focusLast === i) setTimeout(() => input.focus(), 0);
                });
                if (!rows.length) list.append(el('p', { class: 'cs-muted cs-small', text: 'No criteria yet - add the qualities every option should be judged on.' }));
            };
            draw();
            const pughNames = [];
            (this.pughMatrices || []).forEach(m => (m.criteria || []).forEach((c) => {
                const n = (c.name || '').trim();
                if (n && !pughNames.includes(n)) pughNames.push(n);
            }));
            pop.append(
                el('div', { class: 'cs-title', text: '🎯 Criteria' }),
                el('p', { class: 'cs-muted cs-small', text: 'Every node\'s criteria view shows this same list. Enter adds the next one.' }),
                list,
                el('div', { class: 'cs-row', style: 'margin-top:6px;' },
                    el('button', { class: 'cs-btn', type: 'button', text: '+ Add criterion', onclick: () => { rows.push({ id: uid(), name: '' }); draw(rows.length - 1); } }),
                    pughNames.length ? el('button', { class: 'cs-btn', type: 'button', text: '📊 From the Pugh matrix', title: pughNames.join(', '), onclick: () => {
                        pughNames.forEach((n) => { if (!rows.some(r => r.name.trim().toLowerCase() === n.toLowerCase())) rows.push({ id: uid(), name: n }); });
                        draw();
                    } }) : null));
            const save = async () => {
                const next = rows.map(r => ({ id: r.id, name: r.name.trim() })).filter(r => r.name);
                const keep = new Set(next.map(r => r.id));
                const removed = (this.criteria || []).filter(c => !keep.has(c.id));
                // Removing a criterion drops what was written under it.
                if (removed.length) {
                    let used = 0;
                    const tree = this._critView ? this._critView.real : this.rootData;
                    if (this._critView) this.critWriteBack();
                    const walk = (n) => {
                        if (!n) return;
                        if (n._crit && removed.some(c => Array.isArray(n._crit[c.id]) && n._crit[c.id].some(x => x && !this.isPlaceholderNodeData(x)))) used++;
                        (n.children || []).forEach(walk);
                    };
                    walk(tree);
                    if (used && !(await this.showConfirmDialog(`Remove ${removed.map(c => `"${c.name}"`).join(', ')}? What's written under ${removed.length === 1 ? 'it' : 'them'} on ${used} node${used === 1 ? '' : 's'} goes too.`))) return;
                }
                close();
                if (this._critView) this.critWriteBack();
                this.critInlineHosts().forEach(h => this.critInlineWriteBack(h));
                this.criteria = next;
                try { this.syncPughCriteria(); if (typeof this.renderPughPanel === 'function') this.renderPughPanel(); } catch (e) { /* drawn next time */ }
                if (this._critView) {
                    this.renderFlowchart(this.buildCriteriaTree(), { keepTransform: true });
                } else if (this.critInlineHosts().length) {
                    this.critInlineRefresh();
                    this.renderFlowchart(this.rootData);
                }
                this.autosave();
                if (typeof after === 'function' && next.length) after();
            };
            pop.append(el('div', { class: 'cs-row', style: 'justify-content:flex-end; margin-top:12px;' },
                el('button', { class: 'cs-btn', type: 'button', text: 'Cancel', onclick: close }),
                el('button', { class: 'cs-btn cs-primary', type: 'button', text: after ? 'Save and view' : 'Save', onclick: save })));
            document.body.append(pop);
            if (!rows.length) { rows.push({ id: uid(), name: '' }); draw(0); }
        }
    };

    // ----- The Pugh matrix uses the criteria list -----
    // Every Pugh matrix's criteria are the flowchart's criteria (same ids, so
    // scores stay put; each keeps its own weights). A criterion renamed in a
    // Pugh matrix is renamed in the list; one added or deleted there is added
    // to / deleted from the list. A flowchart whose list is empty takes its
    // criteria from the Pugh matrix the first time.
    methods.syncPughCriteria = function () {
        const mats = Array.isArray(this.pughMatrices) ? this.pughMatrices : [];
        if (!mats.length) return;
        if (!Array.isArray(this.criteria)) this.criteria = [];
        if (!this.criteria.length) {
            const src = mats.find(m => Array.isArray(m.criteria) && m.criteria.some(c => (c.name || '').trim()));
            if (src) this.criteria = src.criteria.filter(c => (c.name || '').trim()).map(c => ({ id: c.id, name: c.name.trim() }));
        }
        // The first time for this flowchart, criteria only a Pugh matrix had
        // join the list (so none disappear from it).
        if (this._pughMergedFor !== this.criteria) {
            const names = new Set(this.criteria.map(c => c.name.trim().toLowerCase()));
            const ids = new Set(this.criteria.map(c => c.id));
            mats.forEach(m => (m.criteria || []).forEach((c) => {
                const n = (c.name || '').trim();
                if (!n || ids.has(c.id) || names.has(n.toLowerCase())) return;
                this.criteria.push({ id: c.id, name: n });
                ids.add(c.id);
                names.add(n.toLowerCase());
            }));
            this._pughMergedFor = this.criteria;
            this._pughSyncedNames = null;
        }
        const seen = this._pughSyncedNames || {};
        // Names changed in a Pugh matrix since the last sync go to the list.
        mats.forEach(m => (m.criteria || []).forEach((c) => {
            const g = this.criteria.find(x => x.id === c.id);
            if (g && seen[c.id] !== undefined && c.name !== seen[c.id] && (c.name || '').trim()) g.name = c.name.trim();
        }));
        mats.forEach((m) => {
            const old = new Map((m.criteria || []).map(c => [c.id, c]));
            m.criteria = this.criteria.map(g => Object.assign({}, old.get(g.id) || { weight: 1 }, { id: g.id, name: g.name }));
        });
        const names = {};
        this.criteria.forEach((g) => { names[g.id] = g.name; });
        this._pughSyncedNames = names;
    };

    Object.assign(FlowchartViewer.prototype, methods);
    const proto = FlowchartViewer.prototype;

    const origRenderPugh = proto.renderPughPanel;
    if (origRenderPugh) {
        proto.renderPughPanel = function (...args) {
            try { this.syncPughCriteria(); } catch (e) { console.error('Pugh criteria:', e); }
            return origRenderPugh.apply(this, args);
        };
    }
    // Adding or deleting a criterion in the Pugh matrix changes the list.
    const origAddPughCrit = proto.addPughCriteria;
    if (origAddPughCrit) {
        proto.addPughCriteria = function () {
            if (!Array.isArray(this.criteria)) this.criteria = [];
            this.criteria.push({ id: uid(), name: 'New criterion' });
            this.renderPughPanel();
            this.autosave();
        };
    }
    const origDelPughCrit = proto.deletePughCriteria;
    if (origDelPughCrit) {
        proto.deletePughCriteria = function (criteriaId) {
            this.criteria = (this.criteria || []).filter(c => c.id !== criteriaId);
            return origDelPughCrit.call(this, criteriaId);
        };
    }
    const origAddNodeToPugh = proto.addNodeToPugh;
    if (origAddNodeToPugh) {
        proto.addNodeToPugh = function (kind, ...rest) {
            if (kind === 'criteria' && this.nodeBeingEdited) {
                const name = (this.nodeBeingEdited.data.name || '').replace(/\s*\(Simplify\?\)\s*$/, '').trim();
                if (!name) { this.showNotification('Name the node first.'); return; }
                if ((this.criteria || []).some(c => c.name.toLowerCase() === name.toLowerCase())) { this.showNotification(`"${name}" is already a criterion.`); return; }
                this.criteria.push({ id: uid(), name });
                this.renderPughPanel();
                this.autosave();
                this.showNotification(`Added "${name}" to the criteria.`);
                return;
            }
            return origAddNodeToPugh.call(this, kind, ...rest);
        };
    }

    // Every redraw: edits made in the view go back into the real tree first,
    // and the picked nodes / banner are shown again.
    const origRender = proto.renderFlowchart;
    proto.renderFlowchart = function (data, ...rest) {
        if (this._critView && data === this.rootData) this.critWriteBack();
        const r = origRender.call(this, data, ...rest);
        this.paintCritPicks();
        this.updateCritBanner();
        if (this._critView) this.hideCritScaffold();
        // The mode ends when nothing shows its criteria any more (undo, a
        // node deleted...).
        if (this._critMode && !this._critView && !this.critInlineHosts().length && !this._critAutoBusy) this._critMode = false;
        this.updateCritModeBar();
        return r;
    };

    // Saving always writes the real tree.
    // Selecting / deselecting a node moves the yellow outline.
    ['selectNode', 'deselectNode'].forEach((name) => {
        const orig = proto[name];
        if (!orig) return;
        proto[name] = function (...args) {
            const r = orig.apply(this, args);
            this.paintCritPicks();
            // Criteria mode: a node you clicked shows its criteria.
            const d = args[0];
            if (name === 'selectNode' && this._critMode && !this._critView && !this._critAutoBusy
                && d && d.data && d.data === this._critUserClick && !d.data._critOn && this.critEligible(d)
                && this.criteria && this.criteria.length) {
                this._critUserClick = null;
                this.critAutoOn(d);
            }
            return r;
        };
    });

    // Saving always writes the real tree: the view's stand-in swapped out, and
    // nodes showing their criteria in place saved with their real children.
    const withRealChildren = (app, fn) => {
        const hosts = app.critInlineHosts();
        const shown = hosts.map(h => h.children);
        hosts.forEach((h) => { app.critInlineWriteBack(h); h.children = h._critSaved || []; });
        try { return fn(); } finally { hosts.forEach((h, i) => { h.children = shown[i]; }); }
    };
    const origExport = proto.exportAsJSON;
    proto.exportAsJSON = function (...args) {
        if (!this._critView) return withRealChildren(this, () => origExport.apply(this, args));
        this.critWriteBack();
        const shown = this.rootData;
        this.rootData = this._critView.real;
        try { return withRealChildren(this, () => origExport.apply(this, args)); } finally { this.rootData = shown; }
    };

    // The Morph matrix follows real nodes; it isn't resynced against the view.
    ['resyncMorphRows', 'relinkMorphNodeRefs'].forEach((name) => {
        const orig = proto[name];
        if (!orig) return;
        proto[name] = function (...args) { return (this._critView || this.critInlineHosts().length) ? false : orig.apply(this, args); };
    });

    // Opening another flowchart, a new one, the Gantt chart or the Kanban board
    // leaves the view first (saving it).
    [['loadFlowchartFromList', false], ['createNewFlowchart', false], ['toggleGanttMode', true], ['toggleKanbanMode', true]].forEach(([name, onlyWhenOpening]) => {
        const orig = proto[name];
        if (!orig) return;
        proto[name] = function (...args) {
            if (this._critView && (!onlyWhenOpening || args[0] !== false)) this.exitCriteriaView(false);
            // Another flowchart replaces this one: put its in-place criteria away
            // first, and criteria mode ends.
            if (!onlyWhenOpening) { this.critInlineOffAll(); this._critMode = false; }
            return orig.apply(this, args);
        };
    });

    // Shift + click picks nodes for the side-by-side view; a plain click on a
    // node that isn't picked starts over.
    //
    // The pick happens on mousedown, and the mousedown is kept from the page:
    // otherwise it takes focus out of the open node's edit box, whose blur
    // saves and redraws the whole chart before the button comes up - the node
    // under the mouse is replaced, no click ever arrives, and the redraw drops
    // the selected node's menu. Keeping it from the chart's pan/zoom also stops
    // a slight wobble of the mouse counting as a drag that deselects.
    document.addEventListener('mousedown', (e) => {
        const app = window.__flowchartApp;
        if (!app || app._critView || !e.shiftKey || e.button !== 0 || typeof d3 === 'undefined') return;
        const nodeEl = e.target && e.target.closest && e.target.closest('#flowchart g.node');
        if (!nodeEl || e.target.closest('.radial-add-btn-layer, .fold-arrow-btn')) return;
        const d = d3.select(nodeEl).datum();
        if (!d || !d.data) return;
        e.preventDefault();
        e.stopPropagation();
        app._critShiftDown = true;
        if (!d.parent || app.isPlaceholderNodeData(d.data)) return;
        if (!app._critPicks) app._critPicks = new Set();
        const picks = app._critPicks;
        // The node already selected counts as the first pick.
        if (!picks.size && app.selectedNode && app.selectedNode.data && app.selectedNode.data !== d.data && app.selectedNode.parent) picks.add(app.selectedNode.data);
        if (picks.has(d.data)) picks.delete(d.data); else picks.add(d.data);
        app.paintCritPicks();
        // The selected node keeps its menu (for 🎯).
        if (app.selectedNode && !document.querySelector('.radial-add-btn-layer')) app.refreshRadialButtons();
        if (picks.size > 1) app.showNotification(`${picks.size} nodes picked - 🎯 on one of them shows their criteria side by side. Esc clears.`, 3500);
    }, true);
    // ... and the rest of that Shift + click goes nowhere either.
    ['pointerup', 'mouseup', 'click', 'dblclick'].forEach((type) => {
        document.addEventListener(type, (e) => {
            const app = window.__flowchartApp;
            if (!app || !app._critShiftDown) return;
            if (type === 'click' || type === 'dblclick') {
                if (type === 'click') app._critShiftDown = false;
                e.preventDefault();
                e.stopPropagation();
            } else {
                // No click comes if the mouse left the node: let go anyway.
                setTimeout(() => { app._critShiftDown = false; }, 300);
            }
        }, true);
    });

    document.addEventListener('click', (e) => {
        const app = window.__flowchartApp;
        if (!app || app._critView || typeof d3 === 'undefined') return;
        const nodeEl = e.target && e.target.closest && e.target.closest('#flowchart g.node');
        // A click on empty space in the chart lets go of the picked nodes.
        if (!nodeEl) {
            const inChart = e.target && e.target.closest && e.target.closest('#flowchart svg');
            if (inChart && !e.shiftKey && !e.target.closest('.radial-add-btn-layer, .fold-arrow-btn')) app.clearCritPicks();
            return;
        }
        if (e.target.closest('.radial-add-btn') || e.shiftKey) return;
        const d = d3.select(nodeEl).datum();
        if (!d || !d.data) return;
        app._critUserClick = d.data;
        clearTimeout(app._critUserClickTimer);
        app._critUserClickTimer = setTimeout(() => { app._critUserClick = null; }, 1500);
        const picks = app._critPicks;
        if (picks && picks.size && !picks.has(d.data)) app.clearCritPicks();
    }, true);

    // A click on a node can be lost: leaving the open node's edit box saves and
    // redraws the chart while the button is down, so the node pressed on is
    // replaced and the browser never sends the click. When that happens the
    // redrawn node is selected (and opened for editing) here instead.
    document.addEventListener('pointerdown', (e) => {
        const app = window.__flowchartApp;
        if (!app || e.button !== 0 || e.shiftKey || e.ctrlKey || typeof d3 === 'undefined') { if (app) app._downNode = null; return; }
        const n = e.target && e.target.closest && e.target.closest('#flowchart g.node');
        if (!n || e.target.closest('.fold-arrow-btn, .kb-ck-box')) { app._downNode = null; return; }
        const d = d3.select(n).datum();
        app._downNode = d && d.data ? { el: n, data: d.data, x: e.clientX, y: e.clientY } : null;
    }, true);
    document.addEventListener('pointerup', (e) => {
        const app = window.__flowchartApp;
        const dn = app && app._downNode;
        if (app) app._downNode = null;
        if (!dn || Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 10) return;
        // The redraw can come just after the button is up, before the click:
        // check a moment later whether the click arrived.
        app._clickWaiting = dn;
        setTimeout(() => {
            if (app._clickWaiting !== dn) return; // the click came
            app._clickWaiting = null;
            if (dn.el.isConnected) return;
            const d = d3.select('#flowchart').selectAll('g.node').data().find(x => x && x.data === dn.data);
            if (!d || (app.selectedNode && app.selectedNode.data === dn.data && app.nodeBeingEdited)) return;
            app.showNodeEditPopup(d);
            app.selectNode(d);
            app.refreshRadialButtons();
        }, 80);
    }, true);
    document.addEventListener('click', () => { const app = window.__flowchartApp; if (app) app._clickWaiting = null; }, true);

    // A drag or click on the chart can drop the selection without going
    // through deselectNode (script.js's pan handler): keep the outline in step.
    document.addEventListener('pointerup', (e) => {
        const app = window.__flowchartApp;
        if (!app || !e.target || !e.target.closest || !e.target.closest('#flowchart')) return;
        setTimeout(() => app.paintCritPicks(), 0);
    }, true);

    document.addEventListener('keydown', (e) => {
        const app = window.__flowchartApp;
        if (!app || e.key !== 'Escape') return;
        if (app._critPicks && app._critPicks.size) app.clearCritPicks();
    });
})();
