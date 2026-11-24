// ===== Criteria view =====
// One list of criteria per flowchart (`criteria` in its saved data, so it syncs
// and shares with everything else) - every node's criteria view shows the same
// list.
//
// - 🎯 on a node's button row, right there in the flowchart: its children are
//   put aside and the criteria take their place as yellow nodes. Build ideas
//   under each criterion like any other branch; 🎯 again puts the criteria away
//   (keeping what's under them) and brings the children back. Other nodes can
//   have theirs open at the same time. ✎ edits the list of criteria.
// - Shift + click nodes to pick several (yellow outline), then 🎯 on one of
//   them: they're shown on their own, side by side under an empty node, every
//   criteria tree unfolded, to compare and edit together; ↩ / "Back to
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
            // the Gantt / Kanban branches (their nodes follow the chart / board).
            for (let a = d; a; a = a.parent) {
                if (a.data && (a.data._critId || a.data._gantt || a.data._kanban)) return null;
            }
            if (data._critOn) {
                return [
                    { label: '🎯', icon: '↩', title: 'Put the criteria away and show the children again', activate: () => this.toggleCriteriaInline(data) },
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
            this.toggleCriteriaInline(data);
        },

        // Which buttons the view's own nodes keep. A criterion can take children
        // (whatever is built under it is an ordinary branch) but can't be moved,
        // deleted or given siblings; a node showing its criteria can't be given
        // a child of its own until they're put away.
        criteriaNodeLock(d) {
            if (!d || !d.data) return null;
            const data = d.data;
            const keep = ['F', '⊟', '⊞', '↩'];
            if (data._critId) return { keep, addChild: true };
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
        paintCritPicks() {
            const picks = this._critPicks;
            if (typeof d3 === 'undefined') return;
            d3.selectAll('#flowchart g.node').classed('crit-picked', d => !!(picks && picks.size && d && picks.has(d.data)));
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
            const visit = (n) => {
                if (!n || typeof n !== 'object') return;
                if (typeof n._critHost === 'number' && v.hosts[n._critHost]) {
                    const host = v.hosts[n._critHost];
                    if ((n.name || '').trim()) host.name = n.name;
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
            // A criterion renamed under one node is renamed under all of them.
            if (renamed.size) {
                const rename = (n) => {
                    if (!n) return;
                    if (n._critId && renamed.has(n._critId)) n.name = renamed.get(n._critId);
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
            }
            this.autosave();
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

    Object.assign(FlowchartViewer.prototype, methods);
    const proto = FlowchartViewer.prototype;

    // Every redraw: edits made in the view go back into the real tree first,
    // and the picked nodes / banner are shown again.
    const origRender = proto.renderFlowchart;
    proto.renderFlowchart = function (data, ...rest) {
        if (this._critView && data === this.rootData) this.critWriteBack();
        const r = origRender.call(this, data, ...rest);
        this.paintCritPicks();
        this.updateCritBanner();
        return r;
    };

    // Saving always writes the real tree.
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
            // Another flowchart replaces this one: put its in-place criteria away first.
            if (!onlyWhenOpening) this.critInlineOffAll();
            return orig.apply(this, args);
        };
    });

    // Shift + click picks nodes for the side-by-side view; a plain click on a
    // node that isn't picked starts over.
    document.addEventListener('click', (e) => {
        const app = window.__flowchartApp;
        if (!app || app._critView || typeof d3 === 'undefined') return;
        const nodeEl = e.target && e.target.closest && e.target.closest('#flowchart g.node');
        // A click on empty space in the chart lets go of the picked nodes.
        if (!nodeEl) {
            const inChart = e.target && e.target.closest && e.target.closest('#flowchart svg');
            if (inChart && !e.target.closest('.radial-add-btn-layer, .fold-arrow-btn')) app.clearCritPicks();
            return;
        }
        if (e.target.closest('.radial-add-btn')) return;
        const d = d3.select(nodeEl).datum();
        if (!d || !d.data) return;
        if (!app._critPicks) app._critPicks = new Set();
        const picks = app._critPicks;
        if (!e.shiftKey) {
            if (picks.size && !picks.has(d.data)) app.clearCritPicks();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (!d.parent || app.isPlaceholderNodeData(d.data)) return;
        // The node already selected counts as the first pick.
        if (!picks.size && app.selectedNode && app.selectedNode.data && app.selectedNode.data !== d.data && app.selectedNode.parent) picks.add(app.selectedNode.data);
        if (picks.has(d.data)) picks.delete(d.data); else picks.add(d.data);
        app.paintCritPicks();
        if (picks.size > 1) app.showNotification(`${picks.size} nodes picked - 🎯 on one of them shows their criteria side by side. Esc clears.`, 3500);
    }, true);

    document.addEventListener('keydown', (e) => {
        const app = window.__flowchartApp;
        if (!app || e.key !== 'Escape') return;
        if (app._critPicks && app._critPicks.size) app.clearCritPicks();
    });
})();
