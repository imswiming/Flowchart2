// ===== Kanban board =====
// Each flowchart can carry a Kanban board (`kanban` in its saved data, so it
// syncs and shares along with everything else). "📋 Kanban" swaps the
// flowchart view for the board and back.
//
//   kanban = {
//     columns: [{ id, name, wip (0 = no limit), policy }],
//     cards:   [{ id, num, title, desc, column, labels: [label ids], assignee,
//                 due ('YYYY-MM-DD' or ''), blocked, blockReason,
//                 checklist: [{ id, text, done }],
//                 created, started, finished, moved (ms timestamps or null) }],
//     labels:  [{ id, name, color }],
//     prefix, nextNum, groupBy: 'none' | 'assignee' | 'label'
//   }
//
// - Cards keep their order in `cards`; a column shows its cards in that order.
// - The first column is the backlog, the last one is "done". A card is
//   "started" the first time it leaves the first column and "finished" while
//   it sits in the last one - Insights works out lead time (created -> done)
//   and cycle time (started -> done) from these.
// - A column's WIP limit is how many cards it should hold at once. Going over
//   is allowed, but the column turns red: finish something before pulling more.
// - A column's policy says when a card is ready to move on (shown under its
//   name).
(function () {
    if (typeof FlowchartViewer === 'undefined') return;

    const DAY = 86400000;
    // Label colours: green, blue, purple, yellow, red, teal, magenta, olive.
    const LABEL_COLORS = ['#1f845a', '#0c66e4', '#6e5dc6', '#e2b203', '#c9372c', '#227d9b', '#ae4787', '#5b7f24'];
    const AVATAR_COLORS = ['#e2735a', '#4c9aff', '#36b37e', '#9f8fef', '#f5a623', '#00b8d9', '#e774bb', '#8f7ee7', '#57d9a3', '#ff8f73'];

    const kbNorm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const uid = p => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const now = () => Date.now();
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
    const darkText = (hex) => {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return false;
        const n = parseInt(m[1], 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return (r * 299 + g * 587 + b * 114) / 1000 > 160;
    };
    const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
    const initials = (name) => {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };
    const avatar = (name, extra) => el('span', {
        class: 'kb-avatar' + (extra ? ' ' + extra : ''), title: name || 'Unassigned',
        style: name ? `background:${AVATAR_COLORS[hash(name) % AVATAR_COLORS.length]}` : '',
        text: name ? initials(name) : ''
    });
    const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const fmtDue = (s) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
        if (!m) return '';
        return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    };
    const days = ms => ms / DAY;
    const fmtDays = (d) => {
        if (!Number.isFinite(d)) return '–';
        if (d < 1) { const h = Math.round(d * 24); return h <= 1 ? '< 1 h' : `${h} h`; }
        return `${d < 10 ? d.toFixed(1) : Math.round(d)} d`;
    };

    // ----- Templates: [name, WIP limit, policy] -----
    const TEMPLATES = {
        basic: {
            name: 'To do / In progress / Done',
            desc: 'The simplest board: three columns.',
            columns: [['To do', 0, ''], ['In progress', 3, 'Someone is working on it now.'], ['Done', 0, 'Finished and checked.']]
        },
        software: {
            name: 'Software team',
            desc: 'Backlog, ready, in progress, in review, done - with WIP limits.',
            columns: [
                ['Backlog', 0, 'Ideas and requests, not yet agreed.'],
                ['Ready', 5, 'Agreed, small enough, acceptance criteria written.'],
                ['In progress', 3, 'Being built. Pull a new card only when one moves on.'],
                ['In review', 2, 'Code review and testing.'],
                ['Done', 0, 'Merged, tested and released.']]
        },
        product: {
            name: 'Product development',
            desc: 'Ideas through design, prototype and test to launch.',
            columns: [
                ['Ideas', 0, ''], ['Design', 3, 'Sketches and CAD under way.'], ['Prototype', 2, 'Being built.'],
                ['Testing', 2, 'Test plan written before it moves here.'], ['Launched', 0, '']]
        },
        content: {
            name: 'Content pipeline',
            desc: 'Ideas, writing, editing, published.',
            columns: [['Ideas', 0, ''], ['Writing', 2, 'Outline agreed.'], ['Editing', 2, 'Full draft in.'], ['Published', 0, 'Live and shared.']]
        },
        personal: {
            name: 'Personal',
            desc: 'To do, doing (two at a time), done.',
            columns: [['To do', 0, ''], ['Doing', 2, 'No more than two things at once.'], ['Done', 0, '']]
        }
    };

    const methods = {
        sanitizeKanban(raw) {
            if (!raw || typeof raw !== 'object') return null;
            const columns = (Array.isArray(raw.columns) ? raw.columns : []).filter(c => c && typeof c.id === 'string').map(c => ({
                id: c.id,
                name: typeof c.name === 'string' ? c.name : 'Column',
                wip: Number.isFinite(+c.wip) && +c.wip > 0 ? Math.round(+c.wip) : 0,
                policy: typeof c.policy === 'string' ? c.policy : ''
            }));
            if (!columns.length) return null;
            const colIds = new Set(columns.map(c => c.id));
            const labels = (Array.isArray(raw.labels) ? raw.labels : []).filter(l => l && typeof l.id === 'string').map(l => ({
                id: l.id, name: typeof l.name === 'string' ? l.name : 'Label',
                color: typeof l.color === 'string' ? l.color : LABEL_COLORS[0]
            }));
            const labelIds = new Set(labels.map(l => l.id));
            const ts = v => (Number.isFinite(v) ? v : null);
            let maxNum = 0;
            const cards = (Array.isArray(raw.cards) ? raw.cards : []).filter(c => c && typeof c.id === 'string').map((c) => {
                const num = Number.isFinite(c.num) ? c.num : 0;
                maxNum = Math.max(maxNum, num);
                return {
                    id: c.id, num,
                    title: typeof c.title === 'string' ? c.title : 'Card',
                    desc: typeof c.desc === 'string' ? c.desc : '',
                    column: colIds.has(c.column) ? c.column : columns[0].id,
                    labels: Array.isArray(c.labels) ? c.labels.filter(l => labelIds.has(l)) : [],
                    assignee: typeof c.assignee === 'string' ? c.assignee : '',
                    createdBy: typeof c.createdBy === 'string' ? c.createdBy : '',
                    due: typeof c.due === 'string' ? c.due : '',
                    blocked: !!c.blocked,
                    blockReason: typeof c.blockReason === 'string' ? c.blockReason : '',
                    checklist: Array.isArray(c.checklist) ? c.checklist.filter(i => i && typeof i.id === 'string').map(i => ({ id: i.id, text: String(i.text || ''), done: !!i.done })) : [],
                    created: ts(c.created) || now(), started: ts(c.started), finished: ts(c.finished), moved: ts(c.moved) || ts(c.created) || now()
                };
            });
            // Cards without a number get the next ones.
            let next = Math.max(maxNum + 1, Number.isFinite(raw.nextNum) ? raw.nextNum : 1);
            cards.forEach((c) => { if (!c.num) c.num = next++; });
            return {
                columns, cards, labels,
                prefix: typeof raw.prefix === 'string' && raw.prefix.trim() ? raw.prefix.trim().slice(0, 8) : 'KB',
                nextNum: next,
                groupBy: ['assignee', 'label'].includes(raw.groupBy) ? raw.groupBy : 'none',
                notesTabId: typeof raw.notesTabId === 'string' ? raw.notesTabId : null,
                noteTitles: (raw.noteTitles && typeof raw.noteTitles === 'object') ? Object.assign({}, raw.noteTitles) : {}
            };
        },

        kbCards() { return (this.kanban && this.kanban.cards) || []; },
        kbCard(id) { return this.kbCards().find(c => c.id === id) || null; },
        kbColumn(id) { return this.kanban ? this.kanban.columns.find(c => c.id === id) || null : null; },
        kbColIndex(id) { return this.kanban ? this.kanban.columns.findIndex(c => c.id === id) : -1; },
        kbIsDone(card) { const cols = this.kanban.columns; return cols.length > 1 && card.column === cols[cols.length - 1].id; },
        kbLabel(id) { return this.kanban ? this.kanban.labels.find(l => l.id === id) || null : null; },
        kbKey(card) { return `${this.kanban.prefix}-${card.num}`; },
        // Whether the open flowchart is shared (sharing.js), and the name this
        // person goes by: the name they joined with, else their sign-in email's
        // first part.
        kbIsShared() {
            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            return !!(item && item.share && item.share.id);
        },
        kbMyName() {
            const saved = (localStorage.getItem('flowchart-guest-name') || '').trim();
            if (saved) return saved;
            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            let email = '';
            try {
                const conn = item && item.share && typeof this.shareConn === 'function' ? this.shareConn(item.share.url) : null;
                email = (conn && conn.email) || '';
            } catch (e) { /* not signed in */ }
            if (!email && this._cloudAuth && this._cloudAuth.user) email = this._cloudAuth.user.email || '';
            const local = email.split('@')[0] || '';
            return local ? local.replace(/[._-]+/g, ' ').replace(/\w/g, ch => ch.toUpperCase()) : '';
        },
        kbAssignees() {
            const set = new Set();
            this.kbCards().forEach((c) => { if (c.assignee) set.add(c.assignee); });
            return [...set].sort((a, b) => a.localeCompare(b));
        },

        // ----- Changes, undo / redo -----
        // `fromNotes`: the change came from editing the notes, which are not
        // rewritten while you type in them.
        kanbanChanged(fromNotes) {
            this.recordKanbanHistory();
            this.renderKanban();
            if (!fromNotes) this.syncKanbanNotes();
            this.syncKanbanFlow();
            this.autosave();
        },

        kanbanSnapshot() {
            const k = this.kanban;
            return JSON.stringify(k ? { columns: k.columns, cards: k.cards, labels: k.labels, prefix: k.prefix, nextNum: k.nextNum } : null);
        },
        resetKanbanHistory() {
            this._kbUndo = [];
            this._kbRedo = [];
            this._kbLastSnap = this.kanbanSnapshot();
            this.updateUndoRedoButtons();
        },
        recordKanbanHistory() {
            if (!this._kbUndo) this.resetKanbanHistory();
            const snap = this.kanbanSnapshot();
            if (snap === this._kbLastSnap) return;
            this._kbUndo.push(this._kbLastSnap);
            if (this._kbUndo.length > 100) this._kbUndo.shift();
            this._kbRedo = [];
            this._kbLastSnap = snap;
            this.updateUndoRedoButtons();
        },
        restoreKanbanSnapshot(snap) {
            const data = JSON.parse(snap);
            const old = this.kanban || {};
            this.kanban = data ? this.sanitizeKanban(Object.assign(data, { groupBy: old.groupBy, notesTabId: old.notesTabId, noteTitles: old.noteTitles })) : null;
            if (this._kbSelected && !this.kbCard(this._kbSelected)) this._kbSelected = null;
            this._kbLastSnap = snap;
            const pop = document.getElementById('kanban-popup');
            if (pop) pop.remove();
            this.renderKanban();
            this.syncKanbanNotes();
            this.syncKanbanFlow();
            this.autosave();
            this.updateUndoRedoButtons();
        },
        undoKanban() {
            if (!this._kbUndo || !this._kbUndo.length) return;
            this._kbRedo.push(this.kanbanSnapshot());
            this.restoreKanbanSnapshot(this._kbUndo.pop());
        },
        redoKanban() {
            if (!this._kbRedo || !this._kbRedo.length) return;
            this._kbUndo.push(this.kanbanSnapshot());
            this.restoreKanbanSnapshot(this._kbRedo.pop());
        },

        // ----- Building boards -----
        newKanbanBoard(columns) {
            const old = this.kanban || {};
            this.kanban = {
                columns: columns.map(([name, wip, policy]) => ({ id: uid('kc'), name, wip: wip || 0, policy: policy || '' })),
                cards: [], labels: [], prefix: 'KB', nextNum: 1, groupBy: 'none',
                // The notes tab stays; what was written under old cards goes under "Removed".
                notesTabId: old.notesTabId || null, noteTitles: old.noteTitles || {}
            };
            return this.kanban;
        },

        kbNewCard(fields) {
            const k = this.kanban;
            const t = now();
            const card = Object.assign({
                id: uid('kb'), num: k.nextNum++, title: 'New card', desc: '', column: k.columns[0].id, labels: [],
                assignee: '', createdBy: this.kbMyName(), due: '', blocked: false, blockReason: '', checklist: [],
                created: t, started: null, finished: null, moved: t
            }, fields || {});
            const i = this.kbColIndex(card.column);
            if (i > 0) card.started = card.started || t;
            if (this.kbIsDone(card)) card.finished = card.finished || t;
            return card;
        },

        kbLabelByName(name, create) {
            const k = this.kanban;
            const n = String(name || '').trim();
            if (!n) return null;
            let l = k.labels.find(x => x.name.toLowerCase() === n.toLowerCase());
            if (!l && create) {
                l = { id: uid('kl'), name: n, color: LABEL_COLORS[k.labels.length % LABEL_COLORS.length] };
                k.labels.push(l);
            }
            return l;
        },

        async applyKanbanTemplate(key) {
            if (this.kbCards().length && !(await this.showConfirmDialog('Replace this board (and its cards) with a new one? Ctrl+Z brings it back.'))) return false;
            const tpl = TEMPLATES[key];
            if (!tpl) return false;
            this.newKanbanBoard(tpl.columns);
            this._kbSelected = null;
            this.kanbanChanged();
            return true;
        },

        // Cards from the Gantt chart's tasks (gantt.js): subtasks and milestones,
        // or main tasks that have none, labelled with their main task.
        importKanbanFromGantt() {
            const tasks = (this.gantt && this.gantt.tasks) || [];
            if (!tasks.length) { this.showNotification('This flowchart has no Gantt chart yet.'); return; }
            if (!this.kanban) this.newKanbanBoard(TEMPLATES.basic.columns);
            const k = this.kanban;
            const cols = k.columns;
            const mains = tasks.filter(t => !t.parent);
            let added = 0;
            mains.forEach((m) => {
                const kids = tasks.filter(t => t.parent === m.id);
                const label = this.kbLabelByName(m.name, true);
                (kids.length ? kids : [m]).forEach((t) => {
                    const done = typeof this.ganttComplete === 'function' ? this.ganttComplete(t) : !!t.done;
                    const some = t.checklist && t.checklist.some(c => c.done);
                    const col = done ? cols[cols.length - 1] : (some && cols.length > 2 ? cols[1] : cols[0]);
                    k.cards.push(this.kbNewCard({
                        title: (t.kind === 'milestone' ? '◆ ' : '') + t.name, column: col.id, labels: label && kids.length ? [label.id] : [],
                        assignee: t.assignee || '', due: t.end || '',
                        checklist: (t.checklist || []).map(c => ({ id: uid('ck'), text: c.text, done: c.done }))
                    }));
                    added++;
                });
            });
            this.kanbanChanged();
            this.showNotification(`Added ${added} card${added === 1 ? '' : 's'} from the Gantt chart.`);
        },

        // Cards from the flowchart: every end node (a node with no branches),
        // labelled with the top branch it sits under.
        importKanbanFromFlowchart() {
            const root = this.rootData;
            if (!root) return;
            if (!this.kanban) this.newKanbanBoard(TEMPLATES.basic.columns);
            const k = this.kanban;
            const leaves = [];
            const walk = (n, path) => {
                if (!n || n._isPlaceholder || n._gantt || n._kanban) return;
                const kids = (n.children || []).filter(c => c && !c._isPlaceholder && !c._gantt && !c._kanban);
                if (!kids.length && path.length) leaves.push({ node: n, top: path[1] || path[0] });
                kids.forEach(c => walk(c, path.concat(n)));
            };
            walk(root, []);
            if (!leaves.length) { this.showNotification('The flowchart has no end nodes to turn into cards.'); return; }
            const have = new Set(k.cards.map(c => c.title));
            let added = 0;
            leaves.slice(0, 200).forEach(({ node, top }) => {
                const title = String(node.name || '').trim();
                if (!title || have.has(title)) return;
                const label = top && top !== root ? this.kbLabelByName(top.name, true) : null;
                k.cards.push(this.kbNewCard({ title, labels: label ? [label.id] : [] }));
                have.add(title);
                added++;
            });
            this.kanbanChanged();
            this.showNotification(added ? `Added ${added} card${added === 1 ? '' : 's'} from the flowchart's end nodes.` : 'Every end node already has a card.');
        },

        // ----- Moving cards -----
        // Moves a card to a column (and lane), before `beforeId` (or to the end
        // of that column), stamping when it started / finished.
        kbMoveCard(id, colId, beforeId, lane) {
            const k = this.kanban;
            const card = this.kbCard(id);
            if (!card) return;
            const fromCol = card.column;
            k.cards.splice(k.cards.indexOf(card), 1);
            let at = -1;
            if (beforeId) at = k.cards.findIndex(c => c.id === beforeId);
            if (at < 0) {
                // After the last card of that column.
                for (let i = k.cards.length - 1; i >= 0; i--) if (k.cards[i].column === colId) { at = i + 1; break; }
            }
            if (at < 0) at = k.cards.length;
            k.cards.splice(at, 0, card);
            if (lane !== undefined && k.groupBy === 'assignee') card.assignee = lane;
            if (lane !== undefined && k.groupBy === 'label') {
                if (!lane) card.labels = [];
                else card.labels = [lane, ...card.labels.filter(l => l !== lane)];
            }
            if (fromCol !== colId) {
                const t = now();
                card.column = colId;
                card.moved = t;
                if (this.kbColIndex(colId) > 0 && !card.started) card.started = t;
                if (this.kbColIndex(colId) === 0) card.started = null;
                card.finished = this.kbIsDone(card) ? t : null;
                const col = this.kbColumn(colId);
                const count = k.cards.filter(c => c.column === colId).length;
                if (col.wip && count > col.wip) {
                    this.showNotification(`"${col.name}" is over its WIP limit (${count} / ${col.wip}). Finish something there before pulling in more.`, 4500);
                }
            }
            this.kanbanChanged();
        },

        deleteKanbanSelected() {
            const card = this._kbSelected && this.kbCard(this._kbSelected);
            if (!card) return false;
            this.kanban.cards = this.kanban.cards.filter(c => c !== card);
            this._kbSelected = null;
            this.kanbanChanged();
            this.showNotification(`Deleted "${card.title}" - Ctrl+Z to undo.`, 4000);
            return true;
        },

        // ----- Mode -----
        setupKanban() {
            this._kanbanMode = false;
            this._kbSelected = null;
            this._kbSearch = '';
            this._kbPeople = new Set();
            const panel = document.getElementById('flowchart-panel');
            if (panel && !document.getElementById('kanban-view')) {
                panel.insertBefore(el('div', { id: 'kanban-view', style: 'display:none;' }), panel.firstChild.nextSibling);
            }
            ['kanban-btn', 'top-kanban-btn'].forEach((id) => {
                const b = document.getElementById(id);
                if (b) b.addEventListener('click', () => this.toggleKanbanMode());
            });
            if (localStorage.getItem('flowchart-kanban-mode') === '1') setTimeout(() => this.toggleKanbanMode(true), 0);
        },

        toggleKanbanMode(on, quiet) {
            const want = on === undefined ? !this._kanbanMode : !!on;
            if (want && this._ganttMode && typeof this.toggleGanttMode === 'function') this.toggleGanttMode(false);
            this._kanbanMode = want;
            localStorage.setItem('flowchart-kanban-mode', want ? '1' : '0');
            document.body.classList.toggle('kanban-mode', want);
            const view = document.getElementById('kanban-view');
            const chart = document.getElementById('flowchart');
            if (view) view.style.display = want ? 'flex' : 'none';
            if (chart) chart.style.display = want ? 'none' : '';
            document.querySelectorAll('#kanban-btn, #hamburger-kanban').forEach((b) => { b.textContent = want ? '🔀 Flowchart' : '📋 Kanban'; });
            const top = document.getElementById('top-kanban-btn');
            if (top) { top.textContent = want ? '🔀' : '📋'; top.title = want ? 'Back to the flowchart' : 'Kanban board'; }
            if (want) {
                if (this.selectedNode && typeof this.deselectNode === 'function') this.deselectNode();
                this.selectedNode = null;
                if (!this._kbUndo) this.resetKanbanHistory();
                this.renderKanban();
                // Boards made before the flowchart branch existed get one.
                if (this.kanban && this.kanban.cards.length && !this.findKanbanFlowRoot()) { this.syncKanbanFlow(); this.autosave(); }
            } else {
                const pop = document.getElementById('kanban-popup');
                if (pop) pop.remove();
                if (!quiet && this.rootData) this.renderFlowchart(this.rootData);
            }
            this.updateUndoRedoButtons();
        },

        // ----- Drawing -----
        renderKanban() {
            const view = document.getElementById('kanban-view');
            if (!view || !this._kanbanMode) return;
            const keep = this.kbScrollState();
            view.innerHTML = '';
            // Title, filters and buttons share one row (see .kb-top in kanban.css).
            const top = el('div', { class: 'kb-top' }, this.buildKanbanHeader());
            view.append(top);
            if (!this.kanban) { view.append(this.buildKanbanEmpty()); return; }
            top.append(this.buildKanbanBar());
            view.append(el('div', { class: 'kb-board-wrap' }));
            this.renderKanbanBoard(keep);
        },

        kbScrollState() {
            const view = document.getElementById('kanban-view');
            const board = view && view.querySelector('.kb-board');
            if (!board) return null;
            const cells = {};
            board.querySelectorAll('.kb-cell').forEach((c) => { cells[c.dataset.col + '|' + c.dataset.lane] = c.scrollTop; });
            return { left: board.scrollLeft, top: board.scrollTop, cells };
        },

        buildKanbanHeader() {
            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            const btn = (text, title, onclick, cls) => el('button', { class: 'kb-btn' + (cls ? ' ' + cls : ''), type: 'button', text, title, onclick });
            const canUndo = !!(this._kbUndo && this._kbUndo.length);
            const canRedo = !!(this._kbRedo && this._kbRedo.length);
            return el('div', { class: 'kb-head' },
                el('div', { class: 'kb-titles' },
                    el('div', { class: 'kb-crumb', text: item ? item.title : 'Flowchart' }),
                    el('h1', { class: 'kb-h1', text: 'Board' })),
                el('div', { class: 'kb-head-actions' },
                    btn('↩', 'Undo (Ctrl+Z)', () => this.undoKanban(), 'kb-undo' + (canUndo ? '' : ' disabled')),
                    btn('↪', 'Redo (Ctrl+Shift+Z)', () => this.redoKanban(), 'kb-redo' + (canRedo ? '' : ' disabled')),
                    this.kanban ? btn('📝', 'Open the Kanban notes (a title per column and card)', () => this.openKanbanNotes(this._kbSelected)) : null,
                    this.kanban ? btn('🌳', 'Open the Kanban branch of the flowchart', () => this.showKanbanCardInFlowchart(null)) : null,
                    this.kanban ? btn('⋯', 'Board: templates, add cards from the Gantt chart or flowchart', () => this.openKanbanBoardMenu()) : null,
                    btn('🔀 Flowchart', 'Back to the flowchart', () => this.toggleKanbanMode(false))));
        },

        buildKanbanEmpty() {
            const box = el('div', { class: 'kb-empty' },
                el('div', { class: 'kb-empty-title', text: 'Track this flowchart\'s work on a Kanban board' }),
                el('div', { class: 'kb-sub', text: 'Pick a starting set of columns. Cards move left to right as work gets done; WIP limits keep each column from overloading. The board is saved with this flowchart.' }));
            const grid = el('div', { class: 'kb-templates' });
            Object.entries(TEMPLATES).forEach(([key, tpl]) => {
                grid.append(el('button', { class: 'kb-template', type: 'button', onclick: () => this.applyKanbanTemplate(key) },
                    el('b', { text: tpl.name }), el('span', { text: tpl.desc }),
                    el('div', { class: 'kb-template-cols' }, ...tpl.columns.map(c => el('i', { text: c[0] })))));
            });
            if (this.gantt && this.gantt.tasks && this.gantt.tasks.length) {
                grid.append(el('button', { class: 'kb-template', type: 'button', onclick: () => this.importKanbanFromGantt() },
                    el('b', { text: '📅 From the Gantt chart' }), el('span', { text: 'A card for each task, finished ones already in Done.' })));
            }
            grid.append(el('button', { class: 'kb-template', type: 'button', onclick: () => this.importKanbanFromFlowchart() },
                el('b', { text: '🔀 From the flowchart' }), el('span', { text: 'A card for each end node, labelled with its branch.' })));
            box.append(grid);
            return box;
        },

        buildKanbanBar() {
            const k = this.kanban;
            const search = el('input', { class: 'kb-search', type: 'search', placeholder: 'Search cards', value: this._kbSearch });
            search.addEventListener('input', () => { this._kbSearch = search.value; this.renderKanbanBoard(this.kbScrollState()); });
            const people = this.kbAssignees();
            // Filtering by someone who no longer has cards drops them.
            [...this._kbPeople].forEach((p) => { if (!people.includes(p)) this._kbPeople.delete(p); });
            const avs = el('div', { class: 'kb-people' });
            const shown = people.slice(0, 6);
            shown.forEach((p) => {
                const a = avatar(p, this._kbPeople.has(p) ? 'on' : '');
                a.setAttribute('role', 'button');
                a.title = `${p} - show only their cards`;
                a.addEventListener('click', () => {
                    if (this._kbPeople.has(p)) this._kbPeople.delete(p); else this._kbPeople.add(p);
                    this.renderKanban();
                });
                avs.append(a);
            });
            if (people.length > shown.length) {
                const more = el('span', { class: 'kb-avatar kb-more', text: `+${people.length - shown.length}`, title: people.slice(6).join(', '), role: 'button' });
                more.addEventListener('click', () => this.openKanbanPeople());
                avs.append(more);
            }
            const labelSel = el('select', { class: 'kb-select', title: 'Show only cards with this label' },
                el('option', { value: '', text: 'All labels' }), ...k.labels.map(l => el('option', { value: l.id, text: l.name })));
            labelSel.value = k.labels.some(l => l.id === this._kbLabelFilter) ? this._kbLabelFilter : '';
            labelSel.addEventListener('change', () => { this._kbLabelFilter = labelSel.value; this.renderKanbanBoard(this.kbScrollState()); });
            const group = el('select', { class: 'kb-select' },
                el('option', { value: 'none', text: 'None' }), el('option', { value: 'assignee', text: 'Assignee' }), el('option', { value: 'label', text: 'Label' }));
            group.value = k.groupBy;
            group.addEventListener('change', () => { k.groupBy = group.value; this.renderKanbanBoard(); this.autosave(); });
            const filtering = this._kbSearch || this._kbPeople.size || this._kbLabelFilter;
            return el('div', { class: 'kb-bar' },
                el('div', { class: 'kb-search-wrap' }, search),
                avs,
                k.labels.length ? labelSel : null,
                filtering ? el('button', { class: 'kb-link', type: 'button', text: 'Clear filters', onclick: () => {
                    this._kbSearch = ''; this._kbPeople.clear(); this._kbLabelFilter = ''; this.renderKanban();
                } }) : null,
                el('span', { class: 'kb-spacer' }),
                el('label', { class: 'kb-group' }, el('span', { text: 'GROUP BY' }), group),
                el('button', { class: 'kb-btn', type: 'button', text: '📈', title: 'Insights: lead time, cycle time, throughput, WIP', onclick: () => this.openKanbanInsights() }));
        },

        kbMatches(card) {
            if (this._kbPeople.size && !this._kbPeople.has(card.assignee)) return false;
            if (this._kbLabelFilter && !card.labels.includes(this._kbLabelFilter)) return false;
            const q = (this._kbSearch || '').trim().toLowerCase();
            if (!q) return true;
            const text = [card.title, card.desc, card.assignee, card.createdBy, ...card.labels.map(l => (this.kbLabel(l) || {}).name || '')].join(' ').toLowerCase();
            return text.includes(q);
        },

        // Swimlanes for the "group by" choice: [{ key, name, cards test }].
        kbLanes() {
            const k = this.kanban;
            if (k.groupBy === 'assignee') {
                const lanes = this.kbAssignees().map(p => ({ key: p, name: p, test: c => c.assignee === p, person: p }));
                lanes.push({ key: '', name: 'Unassigned', test: c => !c.assignee, person: '' });
                return lanes;
            }
            if (k.groupBy === 'label') {
                const lanes = k.labels.map(l => ({ key: l.id, name: l.name, test: c => c.labels[0] === l.id, label: l }));
                lanes.push({ key: '', name: 'No label', test: c => !c.labels.length });
                return lanes;
            }
            return [{ key: null, name: '', test: () => true }];
        },

        renderKanbanBoard(keep) {
            const view = document.getElementById('kanban-view');
            const wrap = view && view.querySelector('.kb-board-wrap');
            if (!wrap) return;
            const k = this.kanban;
            const cols = k.columns;
            const lanes = this.kbLanes();
            const grouped = k.groupBy !== 'none';
            wrap.innerHTML = '';
            const board = el('div', { class: 'kb-board' + (grouped ? ' grouped' : '') });
            board.style.gridTemplateColumns = `repeat(${cols.length}, var(--kb-col-w)) 40px`;
            if (!grouped) board.style.gridTemplateRows = 'auto minmax(0, 1fr)';
            // Lanes as tall as their cards (plain auto rows shrink in a scrolling grid).
            else board.style.gridAutoRows = 'max-content';
            const visible = this.kbCards().filter(c => this.kbMatches(c));

            cols.forEach((col, i) => {
                const all = this.kbCards().filter(c => c.column === col.id);
                const over = col.wip && all.length > col.wip;
                const last = i === cols.length - 1 && cols.length > 1;
                const head = el('div', { class: 'kb-col-head' + (over ? ' over' : '') + (grouped ? '' : ' joined'), title: col.policy ? `Policy: ${col.policy}` : '' },
                    el('div', { class: 'kb-col-row' },
                        el('span', { class: 'kb-col-name', text: col.name }),
                        el('span', { class: 'kb-col-count', text: col.wip ? `${all.length} / ${col.wip}` : `${all.length}` }),
                        last ? el('span', { class: 'kb-col-done', text: '✓', title: 'Cards here count as done' }) : null,
                        el('span', { class: 'kb-spacer' }),
                        el('button', { class: 'kb-col-menu', type: 'button', text: '⋯', title: 'Column: name, WIP limit, policy', onclick: () => this.openKanbanColumn(col.id) })),
                    col.policy ? el('div', { class: 'kb-col-policy', text: col.policy }) : null,
                    over ? el('div', { class: 'kb-col-warn', text: `Over the WIP limit by ${all.length - col.wip}` }) : null);
                head.style.gridColumn = String(i + 1);
                head.style.gridRow = '1';
                board.append(head);
            });
            board.append(el('button', { class: 'kb-add-col', type: 'button', text: '+', title: 'Add a column', style: 'grid-column:' + (cols.length + 1) + '; grid-row:1;', onclick: () => this.addKanbanColumn() }));

            let row = 2;
            lanes.forEach((lane) => {
                const laneCards = visible.filter(lane.test);
                if (grouped) {
                    const n = laneCards.length;
                    if (!n && lane.key === '' ) { /* show empty catch-all lanes too, so cards can be dropped there */ }
                    const collapsed = this._kbCollapsed && this._kbCollapsed.has(lane.key);
                    board.append(el('div', { class: 'kb-lane-head', style: `grid-column:1 / ${cols.length + 1}; grid-row:${row};`, onclick: () => {
                        if (!this._kbCollapsed) this._kbCollapsed = new Set();
                        if (collapsed) this._kbCollapsed.delete(lane.key); else this._kbCollapsed.add(lane.key);
                        this.renderKanbanBoard(this.kbScrollState());
                    } },
                        el('span', { class: 'kb-lane-caret', text: collapsed ? '▸' : '▾' }),
                        lane.person !== undefined ? avatar(lane.person, 'sm') : null,
                        lane.label ? el('span', { class: 'kb-chip', style: this.kbChipStyle(lane.label), text: lane.name }) : el('b', { text: lane.name }),
                        el('span', { class: 'kb-lane-count', text: `${n} card${n === 1 ? '' : 's'}` })));
                    row++;
                    if (collapsed) return;
                }
                cols.forEach((col, i) => {
                    const cell = el('div', { class: 'kb-cell' + (grouped ? '' : ' joined'), 'data-col': col.id, 'data-lane': lane.key === null ? '' : lane.key });
                    cell.dataset.grouped = grouped ? '1' : '';
                    cell.style.gridColumn = String(i + 1);
                    cell.style.gridRow = String(row);
                    laneCards.filter(c => c.column === col.id).forEach(c => cell.append(this.buildKanbanCard(c)));
                    cell.append(this.buildKanbanAdd(col, lane));
                    board.append(cell);
                });
                row++;
            });
            wrap.append(board);
            if (keep) {
                board.scrollLeft = keep.left;
                board.scrollTop = keep.top;
                board.querySelectorAll('.kb-cell').forEach((c) => {
                    const v = keep.cells[c.dataset.col + '|' + c.dataset.lane];
                    if (v) c.scrollTop = v;
                });
            }
        },

        kbChipStyle(l) { return `background:${l.color}; color:${darkText(l.color) ? '#172b4d' : '#fff'}`; },

        buildKanbanCard(card) {
            const done = this.kbIsDone(card);
            const ckDone = card.checklist.filter(c => c.done).length;
            const overdue = card.due && !done && card.due < todayStr();
            const ageDays = days(now() - (card.moved || card.created));
            const node = el('div', {
                class: 'kb-card' + (card.id === this._kbSelected ? ' selected' : '') + (card.blocked ? ' blocked' : '') + (done ? ' done' : ''),
                'data-id': card.id, tabindex: '0'
            },
                el('div', { class: 'kb-card-title', text: card.title }),
                card.blocked ? el('div', { class: 'kb-blocked', text: '⛔ Blocked' + (card.blockReason ? ` - ${card.blockReason}` : '') }) : null,
                card.labels.length ? el('div', { class: 'kb-chips' }, ...card.labels.map((id) => {
                    const l = this.kbLabel(id);
                    return l ? el('span', { class: 'kb-chip', style: this.kbChipStyle(l), text: l.name }) : null;
                })) : null,
                el('div', { class: 'kb-card-foot' },
                    card.checklist.length ? el('span', { class: 'kb-meta' + (ckDone === card.checklist.length ? ' full' : ''), text: `☑ ${ckDone}/${card.checklist.length}`, title: 'Checklist' }) : null,
                    card.due ? el('span', { class: 'kb-meta' + (overdue ? ' overdue' : ''), text: `🗓 ${fmtDue(card.due)}`, title: overdue ? 'Overdue' : 'Due' }) : null,
                    !done && ageDays >= 3 ? el('span', { class: 'kb-age', title: `${Math.floor(ageDays)} days in this column`, text: '●'.repeat(Math.min(4, Math.floor(Math.log2(ageDays)))) }) : null,
                    el('span', { class: 'kb-spacer' }),
                    avatar(card.assignee, card.assignee ? '' : 'empty')));
            this.wireKanbanDrag(node, card);
            node.addEventListener('dblclick', () => this.openKanbanCard(card.id));
            node.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.openKanbanCard(card.id); } });
            return node;
        },

        buildKanbanAdd(col, lane) {
            const box = el('div', { class: 'kb-create' });
            const open = () => {
                box.innerHTML = '';
                const ta = el('textarea', { class: 'kb-create-input', rows: '2', placeholder: 'What needs to be done?' });
                const add = () => {
                    const title = ta.value.trim();
                    if (!title) return false;
                    const fields = { title, column: col.id };
                    if (lane.person !== undefined) fields.assignee = lane.person;
                    // On a shared board a new card goes under the name of whoever adds it.
                    else if (this.kbIsShared() && this.kbMyName()) fields.assignee = this.kbMyName();
                    if (lane.label) fields.labels = [lane.label.id];
                    this.kanban.cards.push(this.kbNewCard(fields));
                    this._kbReopenCreate = col.id + '|' + (lane.key === null ? '' : lane.key);
                    this.kanbanChanged();
                    return true;
                };
                ta.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); }
                    if (e.key === 'Escape') { e.preventDefault(); this.renderKanbanBoard(this.kbScrollState()); }
                });
                ta.addEventListener('blur', () => setTimeout(() => {
                    if (!box.isConnected || box.contains(document.activeElement)) return;
                    if (!add()) this.renderKanbanBoard(this.kbScrollState());
                }, 120));
                box.append(ta, el('div', { class: 'kb-create-hint', text: 'Enter to add, Esc to cancel' }));
                setTimeout(() => ta.focus(), 0);
            };
            box.append(el('button', { class: 'kb-create-btn', type: 'button', text: '+ Create', onclick: open }));
            // Keep the box open after adding, for the next card.
            const key = col.id + '|' + (lane.key === null ? '' : lane.key);
            if (this._kbReopenCreate === key) { this._kbReopenCreate = null; setTimeout(open, 0); }
            return box;
        },

        // ----- Drag and drop (mouse, pen, and touch after a short hold) -----
        wireKanbanDrag(node, card) {
            node.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 || e.target.closest('button, input, textarea, select')) return;
                const sx = e.clientX, sy = e.clientY;
                const touch = e.pointerType === 'touch';
                let dragging = false;
                let ghost = null;
                let offX = 0, offY = 0;
                let holdTimer = null;
                let armed = !touch;
                const board = node.closest('.kb-board');
                const stopTouchScroll = (te) => { if (dragging) te.preventDefault(); };
                if (touch) {
                    holdTimer = setTimeout(() => { armed = true; node.classList.add('kb-armed'); if (navigator.vibrate) navigator.vibrate(15); }, 320);
                    node.addEventListener('touchmove', stopTouchScroll, { passive: false });
                }
                const begin = (x, y) => {
                    dragging = true;
                    const r = node.getBoundingClientRect();
                    offX = x - r.left;
                    offY = y - r.top;
                    ghost = node.cloneNode(true);
                    ghost.classList.add('kb-ghost');
                    ghost.classList.remove('kb-armed');
                    ghost.style.width = r.width + 'px';
                    document.body.append(ghost);
                    node.classList.add('kb-placeholder');
                    document.body.classList.add('kb-dragging-body');
                };
                const place = (x, y) => {
                    ghost.style.transform = `translate(${x - offX}px, ${y - offY}px) rotate(2deg)`;
                    // Scroll the board near its edges.
                    if (board) {
                        const br = board.getBoundingClientRect();
                        if (x < br.left + 50) board.scrollLeft -= 14;
                        else if (x > br.right - 50) board.scrollLeft += 14;
                        if (y < br.top + 40) board.scrollTop -= 12;
                        else if (y > br.bottom - 40) board.scrollTop += 12;
                    }
                    const under = document.elementFromPoint(x, y);
                    const cell = under && under.closest('#kanban-view .kb-cell');
                    if (!cell) return;
                    const cr = cell.getBoundingClientRect();
                    if (y > cr.bottom - 40) cell.scrollTop += 10;
                    else if (y < cr.top + 30) cell.scrollTop -= 10;
                    const others = [...cell.querySelectorAll('.kb-card')].filter(c => c !== node);
                    const before = others.find((c) => { const b = c.getBoundingClientRect(); return y < b.top + b.height / 2; });
                    const add = cell.querySelector('.kb-create');
                    const ref = before || add;
                    if (node.nextSibling !== ref || node.parentNode !== cell) cell.insertBefore(node, ref);
                };
                const move = (ev) => {
                    if (ev.pointerId !== e.pointerId) return;
                    const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy);
                    if (!dragging) {
                        if (!armed) { if (dist > 8) cleanup(); return; }
                        if (dist < 5) return;
                        begin(ev.clientX, ev.clientY);
                    }
                    ev.preventDefault();
                    place(ev.clientX, ev.clientY);
                };
                const up = (ev) => {
                    if (ev.pointerId !== e.pointerId) return;
                    const wasDragging = dragging;
                    cleanup();
                    if (wasDragging) {
                        const cell = node.parentNode;
                        if (!cell || !cell.classList || !cell.classList.contains('kb-cell')) { this.renderKanban(); return; }
                        const next = node.nextElementSibling && node.nextElementSibling.classList.contains('kb-card') ? node.nextElementSibling.dataset.id : null;
                        const lane = cell.dataset.grouped ? cell.dataset.lane : undefined;
                        const before = JSON.stringify(this.kbCards().map(c => [c.id, c.column, c.assignee, c.labels[0] || '']));
                        this.kbMoveCard(card.id, cell.dataset.col, next, lane);
                        if (JSON.stringify(this.kbCards().map(c => [c.id, c.column, c.assignee, c.labels[0] || ''])) === before) this.renderKanban();
                    } else if (ev.type === 'pointerup' && !(touch && armed)) {
                        // A click: selects; a second click on the selected card opens it.
                        if (this._kbSelected === card.id) this.openKanbanCard(card.id);
                        else { this._kbSelected = card.id; this.renderKanbanBoard(this.kbScrollState()); this.focusKanbanNoteTitle(card.id); }
                    }
                };
                const cleanup = () => {
                    clearTimeout(holdTimer);
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    window.removeEventListener('pointercancel', up);
                    node.removeEventListener('touchmove', stopTouchScroll);
                    node.classList.remove('kb-placeholder', 'kb-armed');
                    document.body.classList.remove('kb-dragging-body');
                    if (ghost) ghost.remove();
                    ghost = null;
                    dragging = false;
                };
                window.addEventListener('pointermove', move, { passive: false });
                window.addEventListener('pointerup', up);
                window.addEventListener('pointercancel', up);
            });
        },

        // ----- Kanban notes: a Title per column, a Subheading per card -----
        // A "Kanban notes" tab in the flowchart's notes, kept in board order as
        // cards come, go and move (what's written under a card's heading moves
        // with it). Checklist items are Minor headings, done cards crossed out.
        // Headings are compared with their whitespace tidied (kbNorm): the notes
        // editor turns runs of spaces into &nbsp;.
        kbNoteLabel(card) { return kbNorm(card.title) || 'Card'; },
        // Two cards can share a title: the nth one (in board order) goes with
        // the nth heading of it.
        kbNoteOccurrence(card) {
            const label = this.kbNoteLabel(card);
            const order = this.kanban.columns.flatMap(col => this.kbCards().filter(c => c.column === col.id));
            return Math.max(0, order.filter(c => this.kbNoteLabel(c) === label).indexOf(card));
        },

        kanbanNotesTab(create) {
            const k = this.kanban;
            if (!k) return null;
            let tab = k.notesTabId ? (this.notesTabs || []).find(x => x.id === k.notesTabId) : null;
            if (!tab && create && typeof this.getDefaultNotesTab === 'function') {
                tab = this.getDefaultNotesTab('Kanban notes');
                tab.content = '<p>Notes for the Kanban board: a title for each column and each card. They follow the board - write under them.</p>';
                this.notesTabs.push(tab);
                if (Array.isArray(this.notesPinned)) this.notesPinned.push(`chart:${tab.id}`);
                k.notesTabId = tab.id;
                k.noteTitles = {};
                if (typeof this.renderNotesTabBar === 'function') this.renderNotesTabBar();
            }
            return tab;
        },

        syncKanbanNotes() {
            const k = this.kanban;
            if (!k || (!k.cards.length && !k.notesTabId)) return false;
            const tab = this.kanbanNotesTab(true);
            if (!tab) return false;
            const doc = new DOMParser().parseFromString(`<body>${tab.content || ''}</body>`, 'text/html');
            const blocks = Array.from(doc.body.childNodes).filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()));
            // Headings written last time, by tag and text -> ids in order.
            const tagOf = id => (id.startsWith('col:') ? 'H4' : id.startsWith('ck:') ? 'H6' : 'H5');
            const byText = new Map();
            Object.entries(k.noteTitles || {}).forEach(([id, text]) => {
                const key = `${tagOf(id)}|${kbNorm(text)}`;
                if (!byText.has(key)) byText.set(key, []);
                byText.get(key).push(id);
            });
            const sections = new Map();
            const preamble = [];
            let cur = null;
            blocks.forEach((n) => {
                const isHead = n.nodeType === 1 && /^H[456]$/.test(n.tagName);
                const q = isHead ? byText.get(`${n.tagName}|${kbNorm(n.textContent)}`) : null;
                const id = q ? q.find(x => !sections.has(x)) : null;
                if (id) {
                    cur = { id, blocks: [], folded: n.getAttribute('data-folded') === 'true', title: kbNorm(n.textContent) };
                    sections.set(id, cur);
                    return;
                }
                if (cur) cur.blocks.push(n);
                else preamble.push(n);
            });
            const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            const hasContent = bs => bs.some(b => (b.textContent || '').trim() || (b.querySelector && b.querySelector('img')));
            const html = b => b.outerHTML || `<p>${escH(b.textContent)}</p>`;
            const out = [];
            preamble.forEach(b => out.push(html(b)));
            const titles = {};
            const live = new Set();
            const write = (id, tag, label, done, blankLine) => {
                live.add(id);
                titles[id] = label;
                const sec = sections.get(id);
                out.push(`<${tag}${sec && sec.folded ? ' data-folded="true"' : ''}${done ? ' data-done="true"' : ''}>${escH(label)}</${tag}>`);
                if (sec && sec.blocks.length) sec.blocks.forEach(b => out.push(html(b)));
                else if (blankLine) out.push('<p>&nbsp;</p>');
            };
            k.columns.forEach((col) => {
                write(`col:${col.id}`, 'h4', kbNorm(col.name), false, false);
                this.kbCards().filter(c => c.column === col.id).forEach((card) => {
                    const done = this.kbIsDone(card);
                    write(card.id, 'h5', this.kbNoteLabel(card), done, true);
                    card.checklist.forEach((item) => {
                        if (!item.text.trim()) return;
                        write(`ck:${item.id}`, 'h6', kbNorm(`${item.done ? '✓ ' : ''}${item.text}`), item.done, false);
                    });
                });
            });
            sections.forEach((sec, id) => {
                if (live.has(id) || !hasContent(sec.blocks)) return;
                out.push(`<h4>Removed: ${escH(sec.title)}</h4>`);
                sec.blocks.forEach(b => out.push(html(b)));
            });
            const result = out.join('');
            k.noteTitles = titles;
            if (result === tab.content) return false;
            tab.content = result;
            this._kbNotesSeen = result;
            if (typeof this.refreshEmbeddedEditors === 'function') this.refreshEmbeddedEditors();
            if (typeof this.syncNotesPanesShowingTab === 'function') this.syncNotesPanesShowingTab('chart', tab.id, result);
            return true;
        },

        kanbanNotesOpen() {
            const k = this.kanban;
            if (!k || !k.notesTabId) return false;
            const panel = document.getElementById('reflection-panel');
            const panelOpen = this._leftPanelMode === 'notes' && this._notesTabActive &&
                !!panel && panel.offsetParent !== null && getComputedStyle(panel).display !== 'none';
            return panelOpen && this._activeNotesScope === 'chart' && this.getActiveNotesTabId('chart') === k.notesTabId;
        },

        openKanbanNotes(cardId) {
            if (!this.kanban) return;
            const tab = this.kanbanNotesTab(true);
            if (!tab) return;
            this.syncKanbanNotes();
            this.autosave();
            this._activeNotesScope = 'chart';
            this.setActiveNotesTabId('chart', tab.id);
            this.openNotesPanel();
            if (typeof this.renderNotesPanel === 'function') this.renderNotesPanel();
            setTimeout(() => {
                this.showEmbeddedEditor('chart', tab.id);
                this.renderNotesTabBar();
                if (cardId) this.focusKanbanNoteTitle(cardId, true);
            }, 60);
        },

        // Selecting a card while the Kanban notes are open goes to its heading.
        // `cardId` can also be 'col:<column id>': that column's Title.
        focusKanbanNoteTitle(cardId, force) {
            if (!force && !this.kanbanNotesOpen()) return;
            const isCol = typeof cardId === 'string' && cardId.startsWith('col:');
            const col = isCol ? this.kbColumn(cardId.slice(4)) : null;
            const card = isCol ? null : this.kbCard(cardId);
            if (!card && !col) return;
            const label = card ? this.kbNoteLabel(card) : kbNorm(col.name);
            const want = card ? 'heading5' : 'heading4';
            // Two columns / cards can share a name: the nth one goes with the nth heading.
            const occurrence = card ? this.kbNoteOccurrence(card)
                : Math.max(0, this.kanban.columns.filter(c => kbNorm(c.name) === label).indexOf(col));
            const tryJump = (left) => {
                const editor = this.notesEditor;
                const tab = this.kanbanNotesTab(false);
                const ok = editor && tab && editor._noteTabRef && editor._noteTabRef.tabId === tab.id;
                if (!ok) { if (left > 0) setTimeout(() => tryJump(left - 1), 150); return; }
                const root = editor.model.document.getRoot();
                const all = Array.from(root.getChildren());
                const textOf = (h) => { let s = ''; for (const it of h.getChildren()) if (it.is('$text')) s += it.data; return kbNorm(s); };
                const matches = all.filter(c => c.is('element', want) && textOf(c) === label);
                const target = matches[Math.min(occurrence, matches.length - 1)];
                if (!target) return;
                if (col && target.getAttribute('folded') && typeof this.toggleTitleFold === 'function') this.toggleTitleFold(editor, target, false);
                // Unfold its column's Title.
                for (let i = all.indexOf(target) - 1; card && i >= 0; i--) {
                    if (all[i].is('element', 'heading4')) {
                        if (all[i].getAttribute('folded') && typeof this.toggleTitleFold === 'function') this.toggleTitleFold(editor, all[i], false);
                        break;
                    }
                }
                if (typeof this.jumpToNotesTitle === 'function') this.jumpToNotesTitle(editor, target);
                const next = target.nextSibling;
                if (next && next.is('element') && !/^heading[456]$/.test(next.name)) {
                    try { editor.model.change(w => w.setSelection(w.createPositionAt(next, 0))); } catch (e) { /* not a text block */ }
                }
                if (force && !window.matchMedia('(pointer: coarse)').matches) {
                    try { editor.editing.view.focus(); } catch (e) { /* not on screen */ }
                }
                const viewEl = editor.editing.mapper.toViewElement(target);
                const dom = viewEl && editor.editing.view.domConverter.mapViewToDom(viewEl);
                if (dom) { dom.classList.add('gantt-note-flash'); setTimeout(() => dom.classList.remove('gantt-note-flash'), 1200); }
            };
            tryJump(15);
        },

        // A card's heading edited in the notes renames the card (the key in
        // front is optional); a column's Title renames the column.
        pullKanbanNotesEdits() {
            const k = this.kanban;
            const tab = k && k.notesTabId ? this.kanbanNotesTab(false) : null;
            if (!tab || !tab.content || tab.content === this._kbNotesSeen) return;
            this._kbNotesSeen = tab.content;
            const doc = new DOMParser().parseFromString(`<body>${tab.content}</body>`, 'text/html');
            const heads = Array.from(doc.body.children).filter(n => /^H[45]$/.test(n.tagName)).map(n => ({ tag: n.tagName, text: kbNorm(n.textContent) }));
            const known = new Set(heads.map(h => `${h.tag}|${h.text}`));
            // Headings no longer matching what was written, in order, by tag.
            const expected = { H4: [], H5: [] };
            Object.entries(k.noteTitles || {}).forEach(([id, text]) => {
                if (id.startsWith('ck:')) return;
                expected[id.startsWith('col:') ? 'H4' : 'H5'].push({ id, text: kbNorm(text) });
            });
            const stale = { H4: expected.H4.filter(e => !known.has(`H4|${e.text}`)), H5: expected.H5.filter(e => !known.has(`H5|${e.text}`)) };
            const fresh = { H4: [], H5: [] };
            const titled = new Set(Object.values(k.noteTitles || {}).map(kbNorm));
            heads.forEach((h) => { if (!titled.has(h.text) && !/^Removed:/.test(h.text)) fresh[h.tag].push(h.text); });
            let changed = false;
            // Only a clear one-for-one rename is taken.
            ['H4', 'H5'].forEach((tag) => {
                if (stale[tag].length !== 1 || fresh[tag].length !== 1) return;
                const { id } = stale[tag][0];
                const written = fresh[tag][0];
                if (tag === 'H4') {
                    const col = this.kbColumn(id.slice(4));
                    if (!col || !written) return;
                    col.name = written;
                } else {
                    const card = this.kbCard(id);
                    const name = written;
                    if (!card || !name) return;
                    card.title = name;
                }
                k.noteTitles[id] = written;
                changed = true;
            });
            if (changed) this.kanbanChanged(true);
        },

        // ----- The flowchart branch that mirrors the board -----
        // "📋 <flowchart> - Kanban" beside the existing tree (under the hidden top
        // node): a node per column, the column's cards under it (coloured by
        // their first label, green once done) and each card's checklist items
        // under the card. A card moved to another column takes its node (and
        // anything under it) along. Nodes added by hand are left alone.
        findKanbanFlowRoot() {
            const root = this.rootData;
            if (!root || !Array.isArray(root.children)) return null;
            return root.children.find(c => c && c._kanban === 'root') || null;
        },

        syncKanbanFlow() {
            const k = this.kanban;
            const top = this.rootData;
            if (!top || typeof this.isPlaceholderNodeData !== 'function') return;
            let branch = this.findKanbanFlowRoot();
            const isHand = c => c && !c._kanban && !this.isPlaceholderNodeData(c) && (c.name || '').trim();
            if (!k || !k.cards.length) {
                // An empty board: the branch goes, unless someone wrote in it.
                if (branch && !(branch.children || []).some(isHand)) {
                    top.children = top.children.filter(c => c !== branch);
                    this.kbFlowRender();
                }
                return;
            }
            if (!this.isPlaceholderNodeData(top)) return;
            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            const title = `📋 ${item ? item.title : 'Project'} - Kanban`;
            if (!branch) {
                branch = { name: title, color: '#0c66e4', _kanban: 'root', children: [] };
                if (!Array.isArray(top.children)) top.children = [];
                const last = top.children[top.children.length - 1];
                const at = last && this.isPlaceholderNodeData(last) ? top.children.length - 1 : top.children.length;
                top.children.splice(at, 0, branch);
            }
            branch.name = title;
            const DONE_GREEN = '#2e9e5b';
            const cardNode = (card) => {
                const done = this.kbIsDone(card);
                const col = this.kbColumn(card.column);
                const l = card.labels.length ? this.kbLabel(card.labels[0]) : null;
                return {
                    name: `${card.blocked && !done ? '⛔ ' : ''}${card.title}${done ? ' ✓' : (card.assignee ? ` (${card.assignee})` : '')}`,
                    color: done ? DONE_GREEN : (l ? l.color : '#5e6c84')
                };
            };
            const itemNode = (it, card) => ({ name: `${it.done ? '✓ ' : ''}${it.text.trim()}`, color: it.done ? DONE_GREEN : cardNode(card).color });
            // Puts the wanted nodes into a node's children, in order, leaving
            // nodes added by hand (and placeholders) where they are. `pool`:
            // nodes to reuse from anywhere in the branch (a card's node moving
            // to another column keeps what's under it).
            const reconcile = (parentNode, wanted, pool) => {
                // A node showing its criteria (criteria.js) keeps its real
                // children aside in _critSaved: those are what follow the board.
                const field = parentNode._critOn ? '_critSaved' : 'children';
                const kids = Array.isArray(parentNode[field]) ? parentNode[field] : [];
                const existing = pool || new Map(kids.filter(c => c && c._kanban && c._kanban !== 'root').map(c => [c._kanban, c]));
                const ids = new Set(wanted.map(w => w.id));
                const nodes = wanted.map((w) => {
                    const n = existing.get(w.id) || { _kanban: w.id };
                    n.name = w.name;
                    n.color = w.color;
                    delete n._isPlaceholder;
                    return n;
                });
                const out = [];
                let qi = 0;
                kids.forEach((c) => {
                    if (c && c._kanban && c._kanban !== 'root') {
                        if (ids.has(c._kanban) && qi < nodes.length) out.push(nodes[qi++]);
                        // A deleted card's node goes (with anything under it).
                    } else {
                        out.push(c);
                    }
                });
                while (qi < nodes.length) {
                    let at = out.length;
                    while (at > 0 && this.isPlaceholderNodeData(out[at - 1]) && !(out[at - 1].name || '').trim()) at--;
                    out.splice(at, 0, nodes[qi++]);
                }
                parentNode[field] = out;
                return nodes;
            };
            // Every card node already in the branch, wherever it is (older
            // boards had the cards straight under the branch).
            const pool = new Map();
            const collect = (n) => [].concat(n._critOn ? (n._critSaved || []) : (n.children || [])).forEach((c) => {
                if (!c) return;
                if (c._kanban && c._kanban !== 'root' && !c._kanban.startsWith('col:') && !c._kanban.startsWith('ck:')) pool.set(c._kanban, c);
                collect(c);
            });
            collect(branch);
            const colNode = (col, i) => {
                const n = k.cards.filter(c => c.column === col.id).length;
                const over = col.wip && n > col.wip;
                const last = i === k.columns.length - 1 && k.columns.length > 1;
                return { id: `col:${col.id}`, name: `${col.name}${last ? ' ✓' : ''} (${col.wip ? `${n}/${col.wip}` : n})`, color: over ? '#c9372c' : (last ? DONE_GREEN : '#0c66e4') };
            };
            const colNodes = reconcile(branch, k.columns.map(colNode));
            k.columns.forEach((col, i) => {
                const cards = k.cards.filter(c => c.column === col.id);
                const cardNodes = reconcile(colNodes[i], cards.map(c => Object.assign({ id: c.id }, cardNode(c))), pool);
                cards.forEach((card, j) => {
                    reconcile(cardNodes[j], card.checklist.filter(it => it.text.trim()).map(it => Object.assign({ id: `ck:${it.id}` }, itemNode(it, card))));
                });
                if (typeof this.ensureRightmostPlaceholderNodes === 'function' && !colNodes[i]._critOn) this.ensureRightmostPlaceholderNodes(colNodes[i]);
            });
            if (typeof this.ensureRightmostPlaceholderNodes === 'function') this.ensureRightmostPlaceholderNodes(branch);
            this.kbFlowRender();
        },

        kbFlowRender() {
            if (this._kanbanMode || this._ganttMode || this._kbFlowRenderPending) return;
            this._kbFlowRenderPending = true;
            requestAnimationFrame(() => { this._kbFlowRenderPending = false; this.renderFlowchart(this.rootData); });
        },

        // Opens the flowchart with this card's node (or the whole Kanban branch)
        // unfolded, its ancestors open and everything else folded.
        showKanbanCardInFlowchart(cardId) {
            this.syncKanbanFlow();
            const branch = this.findKanbanFlowRoot();
            if (!branch) { this.showNotification('Add a card first - the board shows up in the flowchart once it has cards.'); return; }
            let target = branch;
            if (cardId) {
                const find = (n) => {
                    if (n._kanban === cardId) return n;
                    for (const c of (n.children || [])) { const f = find(c); if (f) return f; }
                    return null;
                };
                target = find(branch) || branch;
            }
            const path = [];
            const walk = (n, trail) => {
                if (n === target) { path.push(...trail, n); return true; }
                return (n.children || []).some(c => walk(c, [...trail, n]));
            };
            walk(this.rootData, []);
            const keepOpen = new Set(path);
            const openAll = (n) => { n._collapsed = false; (n.children || []).forEach(openAll); };
            const fold = (n) => {
                if (n === target) { openAll(n); return; }
                if (keepOpen.has(n)) n._collapsed = false;
                else if ((n.children || []).some(c => !this.isPlaceholderNodeData(c))) n._collapsed = true;
                (n.children || []).forEach(fold);
            };
            fold(this.rootData);
            this.rootData._collapsed = false;
            const pop = document.getElementById('kanban-popup');
            if (pop) pop.remove();
            this.toggleKanbanMode(false, true);
            this.renderFlowchart(this.rootData);
            const d = d3.select('#flowchart').selectAll('g.node').data().find(x => x && x.data === target);
            if (d) {
                this.selectedNode = d;
                if (typeof this.refreshRadialButtons === 'function') this.refreshRadialButtons();
                const svg = d3.select('#flowchart svg');
                if (this._zoomBehavior && !svg.empty() && Number.isFinite(d.x)) {
                    const w = this.flowchartPanel.clientWidth, h = this.flowchartPanel.clientHeight;
                    const z = this.transform.k;
                    svg.transition().duration(350).call(this._zoomBehavior.transform, d3.zoomIdentity.translate(w / 2 - d.x * z, h / 3 - d.y * z).scale(z));
                }
            }
            this.autosave();
        },

        // ----- Popups -----
        kbPopup(title) {
            const old = document.getElementById('kanban-popup');
            if (old) old.remove();
            const pop = el('div', { id: 'kanban-popup', class: 'cs-popup kb-popup' });
            const body = el('div');
            const close = () => { pop.remove(); document.removeEventListener('keydown', esc, true); };
            const esc = (e) => { if (e.key === 'Escape' && pop.isConnected) { e.stopPropagation(); close(); } };
            document.addEventListener('keydown', esc, true);
            const footer = el('div', { class: 'cs-row', style: 'justify-content:flex-end; margin-top:12px;' });
            pop.append(el('div', { class: 'cs-title', text: title }), body, footer);
            document.body.append(pop);
            return { pop, body, footer, close };
        },

        openKanbanCard(id) {
            const card = this.kbCard(id);
            if (!card) return;
            this._kbSelected = id;
            const k = this.kanban;
            const p = this.kbPopup('Card');
            const row = (label, ...inputs) => el('div', null, el('label', { class: 'cs-label', text: label }), el('div', { class: 'cs-row' }, ...inputs));
            const title = el('input', { class: 'cs-input', type: 'text', value: card.title });
            const desc = el('textarea', { class: 'cs-input kb-desc', rows: '3', placeholder: 'Details, acceptance criteria, links...' });
            desc.value = card.desc;
            const column = el('select', { class: 'cs-input' }, ...k.columns.map(c => el('option', { value: c.id, text: c.name })));
            column.value = card.column;
            const people = el('datalist', { id: 'kb-people-list' }, ...this.kbAssignees().map(n => el('option', { value: n })));
            const who = el('input', { class: 'cs-input', type: 'text', value: card.assignee, placeholder: 'Who is doing it', list: 'kb-people-list' });
            const due = el('input', { class: 'cs-input', type: 'date', value: card.due });
            const blocked = el('input', { type: 'checkbox', checked: card.blocked });
            const reason = el('input', { class: 'cs-input', type: 'text', value: card.blockReason, placeholder: 'Waiting on...' });

            // Labels: click to toggle; type a new one to add it.
            const chosen = new Set(card.labels);
            const chips = el('div', { class: 'kb-label-pick' });
            const drawChips = () => {
                chips.innerHTML = '';
                k.labels.forEach((l) => {
                    chips.append(el('button', { type: 'button', class: 'kb-chip kb-chip-btn' + (chosen.has(l.id) ? ' on' : ''), style: this.kbChipStyle(l), text: (chosen.has(l.id) ? '✓ ' : '') + l.name,
                        onclick: () => { if (chosen.has(l.id)) chosen.delete(l.id); else chosen.add(l.id); drawChips(); } }));
                });
            };
            drawChips();
            const newLabel = el('input', { class: 'cs-input', type: 'text', placeholder: 'New label, Enter to add' });
            newLabel.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const l = this.kbLabelByName(newLabel.value, true);
                if (l) { chosen.add(l.id); newLabel.value = ''; drawChips(); }
            });

            // Checklist
            const list = card.checklist.map(c => Object.assign({}, c));
            const ckBox = el('div', { class: 'kb-ck' });
            const drawList = () => {
                ckBox.innerHTML = '';
                list.forEach((c, i) => {
                    const cb = el('input', { type: 'checkbox', checked: c.done });
                    cb.addEventListener('change', () => { c.done = cb.checked; drawList(); });
                    const tx = el('input', { class: 'cs-input kb-ck-text' + (c.done ? ' done' : ''), type: 'text', value: c.text });
                    tx.addEventListener('input', () => { c.text = tx.value; });
                    ckBox.append(el('div', { class: 'kb-ck-item' }, cb, tx,
                        el('button', { class: 'cs-btn kb-ck-del', type: 'button', text: '✕', title: 'Remove', onclick: () => { list.splice(i, 1); drawList(); } })));
                });
                const add = el('input', { class: 'cs-input', type: 'text', placeholder: '+ Add an item, Enter' });
                add.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter' || !add.value.trim()) return;
                    e.preventDefault();
                    list.push({ id: uid('ck'), text: add.value.trim(), done: false });
                    drawList();
                    const again = ckBox.querySelector('input[placeholder^="+ Add"]');
                    if (again) again.focus();
                });
                ckBox.append(add);
            };
            drawList();

            const age = days(now() - (card.moved || card.created));
            const facts = [`Added${card.createdBy ? ` by ${card.createdBy}` : ''} ${new Date(card.created).toLocaleDateString()}`, `${fmtDays(age)} in this column`];
            if (card.finished && card.started) facts.push(`cycle time ${fmtDays(days(card.finished - card.started))}`);
            if (card.finished) facts.push(`lead time ${fmtDays(days(card.finished - card.created))}`);

            p.body.append(
                row('Title', title),
                row('Description', desc),
                el('div', { class: 'kb-two' }, row('Column', column), row('Assignee', who, people)),
                el('div', { class: 'kb-two' }, row('Due', due), el('div', null, el('label', { class: 'cs-label' }, blocked, ' Blocked'), reason)),
                el('label', { class: 'cs-label', text: 'Labels' }), chips, el('div', { class: 'cs-row' }, newLabel),
                el('label', { class: 'cs-label', text: 'Checklist' }), ckBox,
                el('p', { class: 'cs-muted cs-small kb-facts', text: facts.join(' · ') }));

            const save = () => {
                card.title = title.value.trim() || card.title;
                card.desc = desc.value;
                card.assignee = who.value.trim();
                card.due = due.value;
                card.blocked = blocked.checked;
                card.blockReason = reason.value.trim();
                card.labels = k.labels.filter(l => chosen.has(l.id)).map(l => l.id);
                card.checklist = list.filter(c => c.text.trim());
                p.close();
                if (column.value !== card.column) this.kbMoveCard(card.id, column.value, null);
                else this.kanbanChanged();
            };
            title.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
            p.footer.append(
                el('button', { class: 'cs-btn kb-danger', type: 'button', text: '🗑 Delete', onclick: () => { p.close(); this._kbSelected = card.id; this.deleteKanbanSelected(); } }),
                el('span', { class: 'kb-spacer' }),
                el('button', { class: 'cs-btn', type: 'button', text: '🌳', title: 'Show this card in the flowchart', onclick: () => { save(); this.showKanbanCardInFlowchart(card.id); } }),
                el('button', { class: 'cs-btn', type: 'button', text: '📝 Notes', title: 'Save, then open the notes for this card', onclick: () => { save(); this.openKanbanNotes(card.id); } }),
                el('button', { class: 'cs-btn', type: 'button', text: 'Cancel', onclick: p.close }),
                el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Save', onclick: save }));
            this.renderKanbanBoard(this.kbScrollState());
            setTimeout(() => title.focus(), 30);
        },

        addKanbanColumn() {
            const k = this.kanban;
            const col = { id: uid('kc'), name: 'New column', wip: 0, policy: '' };
            // Before "done", so done stays last.
            k.columns.splice(Math.max(k.columns.length - 1, 0), 0, col);
            this.kanbanChanged();
            this.openKanbanColumn(col.id);
        },

        openKanbanColumn(id) {
            const k = this.kanban;
            const col = this.kbColumn(id);
            if (!col) return;
            const i = this.kbColIndex(id);
            const p = this.kbPopup(`Column: ${col.name}`);
            const name = el('input', { class: 'cs-input', type: 'text', value: col.name });
            const wip = el('input', { class: 'cs-input', type: 'number', min: '0', step: '1', value: String(col.wip || 0) });
            const policy = el('textarea', { class: 'cs-input', rows: '2', placeholder: 'e.g. Ready to move on when it has been reviewed' });
            policy.value = col.policy;
            p.body.append(
                el('label', { class: 'cs-label', text: 'Name' }), el('div', { class: 'cs-row' }, name),
                el('label', { class: 'cs-label', text: 'WIP limit (0 = none)' }), el('div', { class: 'cs-row' }, wip),
                el('p', { class: 'cs-muted cs-small', text: 'How many cards this column should hold at once. Going over is allowed, but the column turns red - finish work before starting more.' }),
                el('label', { class: 'cs-label', text: 'Policy' }), el('div', { class: 'cs-row' }, policy),
                el('p', { class: 'cs-muted cs-small', text: 'When is a card ready to move here, or done here? Shown under the column name. The last column counts as done.' }));
            const save = () => {
                col.name = name.value.trim() || col.name;
                col.wip = Math.max(0, Math.round(+wip.value || 0));
                col.policy = policy.value.trim();
                p.close();
                this.kanbanChanged();
            };
            const shift = (d) => {
                const j = i + d;
                if (j < 0 || j >= k.columns.length) return;
                k.columns.splice(i, 1);
                k.columns.splice(j, 0, col);
                p.close();
                this.kanbanChanged();
            };
            const remove = async () => {
                if (k.columns.length <= 1) { this.showNotification('A board needs at least one column.'); return; }
                const cards = this.kbCards().filter(c => c.column === col.id);
                const to = k.columns[i > 0 ? i - 1 : 1];
                if (cards.length && !(await this.showConfirmDialog(`Delete "${col.name}"? Its ${cards.length} card${cards.length === 1 ? '' : 's'} move to "${to.name}".`))) return;
                cards.forEach((c) => { c.column = to.id; c.moved = now(); });
                k.columns.splice(i, 1);
                p.close();
                this.kanbanChanged();
                k.cards.forEach((c) => { c.finished = this.kbIsDone(c) ? (c.finished || now()) : null; });
            };
            name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
            p.footer.append(
                el('button', { class: 'cs-btn', type: 'button', text: '◀', title: 'Move left', disabled: i === 0, onclick: () => shift(-1) }),
                el('button', { class: 'cs-btn', type: 'button', text: '▶', title: 'Move right', disabled: i === k.columns.length - 1, onclick: () => shift(1) }),
                el('button', { class: 'cs-btn kb-danger', type: 'button', text: '🗑', title: 'Delete column', onclick: remove }),
                el('span', { class: 'kb-spacer' }),
                el('button', { class: 'cs-btn', type: 'button', text: 'Cancel', onclick: p.close }),
                el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Save', onclick: save }));
            setTimeout(() => { name.focus(); name.select(); }, 30);
        },

        openKanbanPeople() {
            const p = this.kbPopup('Show cards for');
            this.kbAssignees().forEach((n) => {
                const cb = el('input', { type: 'checkbox', checked: this._kbPeople.has(n) });
                cb.addEventListener('change', () => { if (cb.checked) this._kbPeople.add(n); else this._kbPeople.delete(n); this.renderKanban(); });
                p.body.append(el('label', { class: 'kb-person-row' }, cb, avatar(n, 'sm'), el('span', { text: n })));
            });
            p.footer.append(el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Done', onclick: p.close }));
        },

        openKanbanBoardMenu() {
            const k = this.kanban;
            const p = this.kbPopup('Board');
            const me = el('input', { class: 'cs-input', type: 'text', maxlength: '80', value: this.kbMyName(), placeholder: 'Your name' });
            me.addEventListener('change', () => { if (me.value.trim()) localStorage.setItem('flowchart-guest-name', me.value.trim()); });
            p.body.append(el('label', { class: 'cs-label', text: 'Your name' }), el('div', { class: 'cs-row' }, me),
                el('p', { class: 'cs-muted cs-small', text: 'Cards you add are marked with it. On a shared flowchart they are also assigned to you, so they show under your name.' }));
            p.body.append(el('label', { class: 'cs-label', text: 'Add cards' }));
            if (this.gantt && this.gantt.tasks && this.gantt.tasks.length) {
                p.body.append(el('button', { class: 'kb-template wide', type: 'button', onclick: () => { p.close(); this.importKanbanFromGantt(); } },
                    el('b', { text: '📅 From the Gantt chart' }), el('span', { text: 'A card for each task.' })));
            }
            p.body.append(el('button', { class: 'kb-template wide', type: 'button', onclick: () => { p.close(); this.importKanbanFromFlowchart(); } },
                el('b', { text: '🔀 From the flowchart' }), el('span', { text: 'A card for each end node not already on the board.' })));
            p.body.append(el('label', { class: 'cs-label', text: 'Start over from a template (replaces the board)' }));
            Object.entries(TEMPLATES).forEach(([key, tpl]) => {
                p.body.append(el('button', { class: 'kb-template wide', type: 'button', onclick: async () => { if (await this.applyKanbanTemplate(key)) p.close(); } },
                    el('b', { text: tpl.name }), el('span', { text: tpl.desc })));
            });
            p.footer.append(el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Close', onclick: p.close }));
        },

        // Kanban metrics: WIP, throughput, lead and cycle time, how long cards
        // sit in each column.
        openKanbanInsights() {
            const k = this.kanban;
            const cards = this.kbCards();
            const cols = k.columns;
            const t = now();
            const done = cards.filter(c => this.kbIsDone(c) && c.finished);
            const recent = done.filter(c => t - c.finished < 90 * DAY);
            const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
            const lead = avg(recent.map(c => days(c.finished - c.created)));
            const cycle = avg(recent.filter(c => c.started).map(c => days(c.finished - c.started)));
            const wip = cards.filter(c => { const i = this.kbColIndex(c.column); return i > 0 && !this.kbIsDone(c); }).length;
            const week = done.filter(c => t - c.finished < 7 * DAY).length;
            const month = done.filter(c => t - c.finished < 30 * DAY).length;
            const blocked = cards.filter(c => c.blocked && !this.kbIsDone(c)).length;
            const p = this.kbPopup('📈 Insights');
            p.pop.classList.add('wide');
            const stat = (n, label, hint) => el('div', { class: 'kb-stat', title: hint || '' }, el('b', { text: String(n) }), el('span', { text: label }));
            p.body.append(el('div', { class: 'kb-stats' },
                stat(wip, 'in progress', 'Cards past the first column and not done'),
                stat(week, 'done this week', 'Throughput, last 7 days'),
                stat(month, 'done in 30 days', 'Throughput, last 30 days'),
                stat(fmtDays(cycle), 'avg cycle time', 'Started -> done, cards finished in the last 90 days'),
                stat(fmtDays(lead), 'avg lead time', 'Created -> done, cards finished in the last 90 days'),
                stat(blocked, 'blocked', 'Blocked cards not yet done')));
            const max = Math.max(1, ...cols.map(c => cards.filter(x => x.column === c.id).length), ...cols.map(c => c.wip || 0));
            const table = el('div', { class: 'kb-flow' });
            cols.forEach((col, i) => {
                const here = cards.filter(c => c.column === col.id);
                const isDone = i === cols.length - 1 && cols.length > 1;
                const ages = here.map(c => days(t - (c.moved || c.created)));
                const oldest = here.reduce((o, c) => (!o || (c.moved || c.created) < (o.moved || o.created) ? c : o), null);
                const over = col.wip && here.length > col.wip;
                table.append(el('div', { class: 'kb-flow-row' },
                    el('div', { class: 'kb-flow-name', text: col.name }),
                    el('div', { class: 'kb-flow-bar' },
                        el('div', { class: 'kb-flow-fill' + (over ? ' over' : '') + (isDone ? ' done' : ''), style: `width:${(here.length / max) * 100}%` }),
                        col.wip ? el('div', { class: 'kb-flow-wip', style: `left:${(col.wip / max) * 100}%`, title: `WIP limit ${col.wip}` }) : null),
                    el('div', { class: 'kb-flow-num', text: col.wip ? `${here.length} / ${col.wip}` : String(here.length) }),
                    el('div', { class: 'kb-flow-age', text: isDone || !here.length ? '' : `avg ${fmtDays(avg(ages))} here` + (oldest ? `, oldest "${oldest.title.length > 28 ? oldest.title.slice(0, 27) + '…' : oldest.title}"` : '') })));
            });
            p.body.append(el('label', { class: 'cs-label', text: 'Cards per column (the line is the WIP limit)' }), table);
            // Where work waits longest - the bottleneck to look at first.
            const waits = cols.slice(0, -1).map((col) => {
                const here = cards.filter(c => c.column === col.id);
                return { col, age: avg(here.map(c => days(t - (c.moved || c.created)))), n: here.length };
            }).filter(w => w.n && this.kbColIndex(w.col.id) > 0).sort((a, b) => b.age - a.age);
            if (waits.length) {
                p.body.append(el('p', { class: 'cs-muted cs-small', text: `Cards wait longest in "${waits[0].col.name}" (${fmtDays(waits[0].age)} on average) - a likely bottleneck.` }));
            }
            if (!recent.length) p.body.append(el('p', { class: 'cs-muted cs-small', text: 'Lead and cycle times appear once cards reach the last column.' }));
            p.footer.append(el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Close', onclick: p.close }));
        }
    };

    Object.assign(FlowchartViewer.prototype, methods);

    // Set up alongside the Gantt view (the app calls setupGantt from its constructor).
    const origSetupGantt = FlowchartViewer.prototype.setupGantt;
    FlowchartViewer.prototype.setupGantt = function (...args) {
        const r = origSetupGantt ? origSetupGantt.apply(this, args) : undefined;
        window.__flowchartApp = this;
        this.setupKanban();
        return r;
    };

    // Opening the Gantt chart leaves the board.
    const origToggleGantt = FlowchartViewer.prototype.toggleGanttMode;
    if (origToggleGantt) {
        FlowchartViewer.prototype.toggleGanttMode = function (on, ...rest) {
            const want = on === undefined ? !this._ganttMode : !!on;
            if (want && this._kanbanMode) this.toggleKanbanMode(false, true);
            return origToggleGantt.call(this, on, ...rest);
        };
    }

    // A different flowchart opened (or this one updated from elsewhere).
    const origLoad = FlowchartViewer.prototype.loadFlowchartFromList;
    FlowchartViewer.prototype.loadFlowchartFromList = function (...args) {
        const before = this.currentSlotIndex;
        const r = origLoad.apply(this, args);
        if (before !== this.currentSlotIndex) {
            this._kbSelected = null;
            this.resetKanbanHistory();
        } else {
            this._kbLastSnap = this.kanbanSnapshot();
        }
        if (this._kanbanMode) this.renderKanban();
        return r;
    };

    // Headings renamed in the Kanban notes rename their card / column.
    const origNotesSave = FlowchartViewer.prototype.scheduleNotesAutosave;
    if (origNotesSave) {
        FlowchartViewer.prototype.scheduleNotesAutosave = function (...args) {
            const r = origNotesSave.apply(this, args);
            if (this.kanban && this.kanban.notesTabId) {
                clearTimeout(this._kbNotesPullTimer);
                this._kbNotesPullTimer = setTimeout(() => this.pullKanbanNotesEdits(), 700);
            }
            return r;
        };
    }

    // A column or card node selected in the flowchart while the Kanban notes
    // are open goes to its heading there (a checklist item: its card). The
    // keyboard stays with the flowchart.
    const origSelectNode = FlowchartViewer.prototype.selectNode;
    if (origSelectNode) {
        FlowchartViewer.prototype.selectNode = function (d, ...rest) {
            const r = origSelectNode.call(this, d, ...rest);
            try {
                let n = d && d.data;
                let id = n && n._kanban;
                if (id && id.startsWith('ck:') && d.parent && d.parent.data) id = d.parent.data._kanban;
                if (id && id !== 'root' && this.kanban && this.kanbanNotesOpen()) this.focusKanbanNoteTitle(id);
            } catch (e) { /* the notes aren't ready - nothing to jump to */ }
            return r;
        };
    }

    const origNew = FlowchartViewer.prototype.createNewFlowchart;
    FlowchartViewer.prototype.createNewFlowchart = function (...args) {
        const r = origNew.apply(this, args);
        this._kbSelected = null;
        this.resetKanbanHistory();
        if (this._kanbanMode) this.renderKanban();
        return r;
    };

    // Undo / redo (buttons, Ctrl+Z, Ctrl+Shift+Z) act on the board while it shows.
    const origUndo = FlowchartViewer.prototype.undo;
    const origRedo = FlowchartViewer.prototype.redo;
    const origButtons = FlowchartViewer.prototype.updateUndoRedoButtons;
    FlowchartViewer.prototype.undo = function (...args) { return this._kanbanMode ? this.undoKanban() : origUndo.apply(this, args); };
    FlowchartViewer.prototype.redo = function (...args) { return this._kanbanMode ? this.redoKanban() : origRedo.apply(this, args); };
    FlowchartViewer.prototype.updateUndoRedoButtons = function (...args) {
        if (!this._kanbanMode) return origButtons.apply(this, args);
        const canUndo = !!(this._kbUndo && this._kbUndo.length);
        const canRedo = !!(this._kbRedo && this._kbRedo.length);
        [[this.undoBtn, canUndo], [this.topUndoBtn, canUndo], [this.redoBtn, canRedo], [this.topRedoBtn, canRedo]].forEach(([b, on]) => {
            if (!b) return;
            b.style.opacity = on ? '1' : '0.5';
            b.style.pointerEvents = on ? 'auto' : 'none';
        });
        const u = document.querySelector('#kanban-view .kb-undo');
        const rd = document.querySelector('#kanban-view .kb-redo');
        if (u) u.classList.toggle('disabled', !canUndo);
        if (rd) rd.classList.toggle('disabled', !canRedo);
    };

    // Keys on the board: Delete removes the selected card, Escape clears the
    // selection, Ctrl+Y / Cmd+Z also undo and redo. They never reach the
    // flowchart's own handlers, which would act on hidden nodes.
    document.addEventListener('keydown', (e) => {
        const app = window.__flowchartApp;
        if (!app || !app._kanbanMode) return;
        const a = document.activeElement;
        const typing = a && ((a.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(a.type)) ||
            a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
        const k = (e.key || '').toLowerCase();
        if (e.key === 'Delete' || e.key === 'Del' || e.key === 'Backspace') {
            if (typing) { if (e.key !== 'Backspace') e.stopImmediatePropagation(); return; }
            e.stopImmediatePropagation();
            if (document.getElementById('kanban-popup')) return;
            if (app.deleteKanbanSelected()) e.preventDefault();
            return;
        }
        if (typing) return;
        if (e.key === 'Escape' && app._kbSelected && !document.getElementById('kanban-popup')) {
            app._kbSelected = null;
            app.renderKanbanBoard(app.kbScrollState());
        } else if (e.metaKey && !e.ctrlKey && k === 'z') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.shiftKey) app.redoKanban(); else app.undoKanban();
        } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'y') {
            e.preventDefault();
            e.stopImmediatePropagation();
            app.redoKanban();
        }
    }, true);
})();
