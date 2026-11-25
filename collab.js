// ===== Collaborators' edits in the flowchart =====
// On a shared flowchart (sharing.js) every node remembers who last edited it
// (`_by`, a name). "👥 Edits" at the bottom right shows or hides other people's
// edits: their nodes get an outline in that person's colour, and a list of who
// edited what (with your own edits left plain).
//
// - Edited = the node's text, colour, picture or highlight changed, or the node
//   is new. Adding a child counts as editing the child, not its parent.
// - Worked out when the flowchart is saved, against how it looked when it was
//   last opened or synced in - so changes synced in from someone else keep
//   their name.
// - The name is the one you joined with (or your sign-in email's first part,
//   see kanban.js kbMyName).
(function () {
    if (typeof FlowchartViewer === 'undefined') return;

    const COLORS = ['#ff6b6b', '#4dabf7', '#ffd43b', '#b197fc', '#63e6be', '#38d9a9', '#f783ac', '#a9e34b', '#66d9e8', '#e599f7', '#ffa8a8', '#74c0fc'];
    const SHOW_KEY = 'flowchart-show-edits';
    const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
    // The leaf marker the app adds by itself isn't an edit.
    const plainName = n => String((n && n.name) || '').replace(/\s*\(Simplify\?\)\s*$/, '');
    const sign = n => [plainName(n), n.color || '', n._nodePhotoUrl ? 'p' : '', n._hl ? 'h' : ''].join('|');

    const style = document.createElement('style');
    style.textContent = `
        #collab-edits { position: absolute; right: 20px; bottom: 110px; z-index: 2500; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
            font: 13px "Segoe UI", system-ui, Arial, sans-serif; }
        #collab-edits button { padding: 7px 12px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.16); background: rgba(38,46,60,0.94);
            color: #e6eef8; cursor: pointer; font: inherit; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        #collab-edits button.on { border-color: #4dabf7; background: rgba(77,171,247,0.18); }
        #collab-edits .collab-legend { padding: 8px 12px; border-radius: 10px; background: rgba(30,36,48,0.94); border: 1px solid rgba(255,255,255,0.12);
            color: #e6eef8; max-height: 40vh; overflow: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        #collab-edits .collab-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; white-space: nowrap; }
        #collab-edits .collab-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
        #collab-edits .collab-count { color: #9aa8bb; font-size: 12px; }
        body.gantt-mode #collab-edits, body.kanban-mode #collab-edits { display: none; }
        /* The when / who tag, in the notes history's small print. */
        #node-stamp-tag { position: fixed; z-index: 2400; pointer-events: none; padding: 1px 6px; border-radius: 4px;
            background: rgba(20, 25, 34, 0.9); color: var(--muted, #9aa6b2); font: 11px/1.4 "Segoe UI", system-ui, Arial, sans-serif; white-space: nowrap; }
        body.gantt-mode #node-stamp-tag, body.kanban-mode #node-stamp-tag { display: none; }
        #collab-edits-btn.on { border-color: #4dabf7 !important; }
        @media (min-width: 601px) { body:not(.panel-bottom) #collab-edits { bottom: var(--collab-up, 110px); } body:not(.panel-bottom) #collab-edits button { display: none; } }
        @media (max-width: 600px) { #collab-edits { bottom: 150px; right: 10px; } }
    `;
    document.head.append(style);

    const methods = {
        collabColor(name) { return COLORS[hash(name) % COLORS.length]; },
        collabMe() { return typeof this.kbMyName === 'function' ? this.kbMyName() : (localStorage.getItem('flowchart-guest-name') || '').trim(); },
        collabShared() {
            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            return !!(item && item.share && item.share.id);
        },
        collabShown() { return localStorage.getItem(SHOW_KEY) === '1'; },

        collabWalk(fn) {
            const walk = (n) => {
                if (!n || typeof n !== 'object' || n._critId || n._colViewId) return;
                if (!this.isPlaceholderNodeData(n)) fn(n);
                (n.children || []).forEach(walk);
            };
            walk(this.rootData);
        },

        // How every node looks now - what the next save is compared with.
        collabSnapshot() {
            if (!this.rootData || this._critView) return;
            if (typeof FlowchartMerge !== 'undefined') FlowchartMerge.ensureIds(this.rootData);
            const sigs = new Map();
            this.collabWalk((n) => { if (n._id) sigs.set(n._id, sign(n)); });
            this._collabSigs = sigs;
        },

        // Marks the nodes changed (or new) since the snapshot: when, and by you
        // (your name, once set - Cloud Sync, or the name you joined a shared
        // flowchart with).
        collabStamp() {
            if (!this.rootData || this._critView) return;
            const me = this.collabMe();
            if (typeof FlowchartMerge !== 'undefined') FlowchartMerge.ensureIds(this.rootData);
            const sigs = this._collabSigs;
            if (!sigs) { this.collabSnapshot(); return; }
            this.collabWalk((n) => {
                if (!n._id) return;
                const now = sign(n);
                const before = sigs.get(n._id);
                if (before === undefined ? (sigs.size > 0 && plainName(n).trim()) : before !== now) {
                    n._at = Date.now();
                    if (me) n._by = me; else delete n._by;
                }
                sigs.set(n._id, now);
            });
        },

        // The button, the list of who edited what, and the outlines.
        paintCollabEdits() {
            const panel = document.getElementById('flowchart-panel');
            if (!panel) return;
            const me = this.collabMe();
            const counts = new Map();
            this.collabWalk((n) => { if (n._by && n._by !== me) counts.set(n._by, (counts.get(n._by) || 0) + 1); });
            let box = document.getElementById('collab-edits');
            let desk = document.getElementById('collab-edits-btn');
            if (!this.collabShared() && !counts.size) { if (box) box.remove(); if (desk) desk.remove(); return; }
            if (!box) { box = document.createElement('div'); box.id = 'collab-edits'; panel.append(box); }
            const on = this.collabShown();
            box.innerHTML = '';
            if (on) {
                const legend = document.createElement('div');
                legend.className = 'collab-legend';
                if (!counts.size) legend.textContent = 'No edits from anyone else yet.';
                [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([name, n]) => {
                    const row = document.createElement('div');
                    row.className = 'collab-row';
                    const dot = document.createElement('span');
                    dot.className = 'collab-dot';
                    dot.style.background = this.collabColor(name);
                    const label = document.createElement('span');
                    label.textContent = name;
                    const count = document.createElement('span');
                    count.className = 'collab-count';
                    count.textContent = `${n} node${n === 1 ? '' : 's'}`;
                    row.append(dot, label, count);
                    legend.append(row);
                });
                box.append(legend);
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = on ? 'on' : '';
            const toggle = () => {
                localStorage.setItem(SHOW_KEY, on ? '0' : '1');
                this.paintCollabEdits();
            };
            btn.textContent = on ? '👥 Hide edits' : '👥 Edits';
            btn.title = 'Show or hide the nodes other people edited last, in a colour per person';
            btn.addEventListener('click', toggle);
            box.append(btn);
            // With the other buttons at the bottom right. (The one above is for
            // where those are hidden: phones, and the panel along the bottom.)
            const controls = document.querySelector('.desktop-controls');
            if (controls) {
                if (!desk) {
                    desk = document.createElement('div');
                    desk.id = 'collab-edits-btn';
                    controls.insertBefore(desk, document.getElementById('gantt-btn'));
                }
                desk.className = 'reset-view-btn' + (on ? ' on' : '');
                desk.textContent = btn.textContent;
                desk.title = btn.title;
                desk.onclick = toggle;
                // The list of names stays clear of however many rows of buttons there are.
                const placed = controls.closest('.reset-view-controls');
                box.style.setProperty('--collab-up', `${(placed ? placed.offsetHeight : 70) + 30}px`);
            }
            if (typeof d3 === 'undefined') return;
            d3.selectAll('#flowchart g.node').each(function (d) {
                const rect = this.querySelector('rect');
                if (!rect || !d || !d.data) return;
                const by = d.data._by;
                let tip = this.querySelector('title.collab-tip');
                if (on && by && by !== me) {
                    const c = COLORS[hash(by) % COLORS.length];
                    if (rect.dataset.collabStroke === undefined) {
                        rect.dataset.collabStroke = rect.getAttribute('stroke') || '';
                        rect.dataset.collabWidth = rect.getAttribute('stroke-width') || '';
                    }
                    rect.setAttribute('stroke', c);
                    rect.setAttribute('stroke-width', '3px');
                    if (!tip) { tip = document.createElementNS('http://www.w3.org/2000/svg', 'title'); tip.setAttribute('class', 'collab-tip'); this.prepend(tip); }
                    tip.textContent = `Last edited by ${by}`;
                } else {
                    if (rect.dataset.collabStroke !== undefined) {
                        rect.setAttribute('stroke', rect.dataset.collabStroke);
                        rect.setAttribute('stroke-width', rect.dataset.collabWidth);
                        delete rect.dataset.collabStroke;
                        delete rect.dataset.collabWidth;
                    }
                    if (tip) tip.remove();
                }
            });
        }
    };

    // ----- When / who, on hover (or the selected node, on a phone) -----
    const stampText = (at, by) => {
        if (!at && !by) return '';
        const d = at ? new Date(at) : null;
        const when = d ? `${d.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
        return [when, by].filter(Boolean).join(' - ');
    };
    window.__stampText = stampText;
    methods.showNodeStamp = function (nodeEl) {
        let tag = document.getElementById('node-stamp-tag');
        const d = nodeEl && typeof d3 !== 'undefined' ? d3.select(nodeEl).datum() : null;
        const text = d && d.data ? stampText(d.data._at, d.data._by) : '';
        if (!text) { if (tag) tag.remove(); return; }
        if (!tag) { tag = document.createElement('div'); tag.id = 'node-stamp-tag'; document.body.append(tag); }
        tag.textContent = text;
        const r = (nodeEl.querySelector('rect') || nodeEl).getBoundingClientRect();
        // Just past the node's bottom right corner, clear of its fold button.
        const w = tag.offsetWidth;
        tag.style.left = Math.round(Math.max(4, Math.min(window.innerWidth - w - 4, r.right + 6))) + 'px';
        tag.style.top = Math.round(r.bottom + 4) + 'px';
    };
    const hideStamp = () => { const t = document.getElementById('node-stamp-tag'); if (t) t.remove(); };
    document.addEventListener('mouseover', (e) => {
        const app = window.__flowchartApp;
        if (!app || !window.matchMedia('(hover: hover)').matches) return;
        const nodeEl = e.target && e.target.closest && e.target.closest('#flowchart g.node');
        if (nodeEl) app.showNodeStamp(nodeEl);
        else hideStamp();
    });
    // Panning, zooming or pressing anywhere on the flowchart puts it away (the
    // node moves out from under it), and so does editing a node.
    document.addEventListener('pointerdown', hideStamp, true);
    document.addEventListener('wheel', hideStamp, { capture: true, passive: true });
    document.addEventListener('input', hideStamp, true);

    // Your name: in the Cloud Sync popup (the same one shared flowcharts use).
    const addNameField = () => {
        const pop = document.getElementById('cloud-sync-popup');
        if (!pop || document.getElementById('cloud-my-name')) return;
        const status = document.getElementById('cloud-sync-popup-status');
        const wrap = document.createElement('div');
        wrap.innerHTML = '<label class="cs-label" for="cloud-my-name">Your name</label><div class="cs-row"><input id="cloud-my-name" class="cs-input" type="text" maxlength="80" placeholder="Shown on what you add and change"></div><p class="cs-muted cs-small">Nodes, cards and notes you edit are marked with it and the time.</p>';
        pop.insertBefore(wrap, status || null);
        const input = wrap.querySelector('input');
        const fill = () => { const app = window.__flowchartApp; input.value = (app && app.collabMe && app.collabMe()) || localStorage.getItem('flowchart-guest-name') || ''; };
        fill();
        new MutationObserver(fill).observe(pop, { attributes: true, attributeFilter: ['style'] });
        input.addEventListener('change', () => {
            const v = input.value.trim();
            if (v) localStorage.setItem('flowchart-guest-name', v); else localStorage.removeItem('flowchart-guest-name');
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addNameField); else addNameField();

    Object.assign(FlowchartViewer.prototype, methods);
    const proto = FlowchartViewer.prototype;

    // On a phone the selected node shows its tag (no hover there).
    const origSelect = proto.selectNode;
    proto.selectNode = function (...args) {
        const r = origSelect.apply(this, args);
        if (window.matchMedia('(hover: none)').matches) {
            const d = args[0];
            const nodeEl = d && [...document.querySelectorAll('#flowchart g.node')].find(g => typeof d3 !== 'undefined' && d3.select(g).datum() && d3.select(g).datum().data === d.data);
            if (nodeEl) this.showNodeStamp(nodeEl);
        }
        return r;
    };

    const origPan = proto.updateChartButtonsForPan;
    if (origPan) {
        proto.updateChartButtonsForPan = function (...args) {
            hideStamp();
            return origPan.apply(this, args);
        };
    }

    const origExport = proto.exportAsJSON;
    proto.exportAsJSON = function (...args) {
        try { this.collabStamp(); } catch (e) { console.error('Could not mark edited nodes:', e); }
        return origExport.apply(this, args);
    };

    const origRender = proto.renderFlowchart;
    proto.renderFlowchart = function (...args) {
        hideStamp();
        const r = origRender.apply(this, args);
        try { this.paintCollabEdits(); } catch (e) { /* drawn next time */ }
        return r;
    };

    // Opening or syncing in a flowchart: that's the starting point, not an edit.
    ['loadFlowchartFromList', 'createNewFlowchart'].forEach((name) => {
        const orig = proto[name];
        if (!orig) return;
        proto[name] = function (...args) {
            const r = orig.apply(this, args);
            this.collabSnapshot();
            try { this.paintCollabEdits(); } catch (e) { /* drawn next time */ }
            return r;
        };
    });
})();
