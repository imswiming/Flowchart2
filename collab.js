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
                if (!n || typeof n !== 'object' || n._critId) return;
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

        // Marks the nodes changed (or new) since the snapshot as edited by you.
        collabStamp() {
            if (!this.rootData || this._critView || !this.collabShared()) return;
            const me = this.collabMe();
            if (!me) return;
            if (typeof FlowchartMerge !== 'undefined') FlowchartMerge.ensureIds(this.rootData);
            const sigs = this._collabSigs;
            if (!sigs) { this.collabSnapshot(); return; }
            this.collabWalk((n) => {
                if (!n._id) return;
                const now = sign(n);
                const before = sigs.get(n._id);
                if (before === undefined ? (sigs.size > 0 && plainName(n).trim()) : before !== now) n._by = me;
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
            if (!this.collabShared() && !counts.size) { if (box) box.remove(); return; }
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
            btn.textContent = on ? '👥 Hide edits' : '👥 Edits';
            btn.title = 'Show or hide the nodes other people edited last, in a colour per person';
            btn.addEventListener('click', () => {
                localStorage.setItem(SHOW_KEY, on ? '0' : '1');
                this.paintCollabEdits();
            });
            box.append(btn);
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

    Object.assign(FlowchartViewer.prototype, methods);
    const proto = FlowchartViewer.prototype;

    const origExport = proto.exportAsJSON;
    proto.exportAsJSON = function (...args) {
        try { this.collabStamp(); } catch (e) { console.error('Could not mark edited nodes:', e); }
        return origExport.apply(this, args);
    };

    const origRender = proto.renderFlowchart;
    proto.renderFlowchart = function (...args) {
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
