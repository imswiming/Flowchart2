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
    // Every card's node in the flowchart has this colour (green once done).
    const CARD_COLOR = '#6e5dc6';
    const CARD_EMOJI = '🃏';
    const ckItem = i => Object.assign({ id: i.id, text: String(i.text || ''), done: !!i.done }, typeof i.note === 'string' && i.note ? { note: i.note } : {});
    const escHtml = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const blocksHaveText = bs => bs.some(b => (b.textContent || '').trim() || (b.querySelector && b.querySelector('img')));
    const blocksHtml = bs => bs.map(b => b.outerHTML || `<p>${escHtml(b.textContent)}</p>`).join('');
    const ROW_DIVIDER = '━━━━━━'; // (older card notes)
    // Invisible marks at the start of the card notes' own headings: a row's name
    // (one) and the card's title (two).
    const ROW_MARK = '\u2063';
    const TITLE_MARK = '\u2063\u2063';
    // A link's address: web addresses as they are, file paths as file:// links.
    const kbHref = (u) => {
        const s = String(u || '').trim();
        // Only these kinds of address: anything else (javascript: and the like,
        // which someone sharing the board could have put there) isn't run.
        if (/^(https?|file|ftp):\/\//i.test(s) || /^mailto:/i.test(s)) return s;
        if (/^[a-z]:[\\/]/i.test(s) || s.startsWith('\\\\') || s.startsWith('/')) return 'file:///' + s.replace(/\\/g, '/').replace(/^\/+/, '');
        return 'https://' + s.replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, '');
    };
    // A link's short text: its name, else the site (and what was searched for or
    // the page), or the file's name.
    const kbLinkText = (l) => {
        if (String(l.label || '').trim() && l.label.trim() !== String(l.url).trim()) return kbNorm(l.label);
        const href = kbHref(l.url);
        const cut = s => (s.length > 60 ? s.slice(0, 57) + '...' : s);
        const dec = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };
        if (href.startsWith('file:')) return cut(String(l.url).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(l.url));
        try {
            const u = new URL(href);
            const host = (u.hostname || u.pathname).replace(/^www\./, '');
            const q = u.searchParams.get('q');
            const last = dec(u.pathname).split('/').filter(Boolean).pop();
            return cut(kbNorm(q ? `${host} - ${q}` : last ? `${host} - ${last}` : host));
        } catch (e) { return cut(String(l.url)); }
    };
    // Browsers don't let a web page open files on the computer: for a file the
    // path is copied too, to paste into File Explorer / Finder.
    const kbOpenLink = (e, u, app) => {
        const href = kbHref(u);
        if (!href.startsWith('file:')) return;
        try { navigator.clipboard.writeText(String(u)); } catch (err) { /* no clipboard */ }
        if (app && app.showNotification) app.showNotification('File path copied - browsers block opening files from a web page, so paste it into File Explorer (or Finder) to open it.', 6000);
    };
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
    // A card, item or column made an assumption (Pink in the node menu) is pink
    // like any other; the rest have the board's colours.
    const kbNodeColor = (name, color) => (/^(?:[^\p{L}\p{N}]+\s*)?Assumption: /u.test(String(name || '')) ? '#e75480' : color);
    // A label's colour as the theme draws it (themes.js).
    const labelColor = (c) => (typeof window.flowThemeLabelColor === 'function' ? window.flowThemeLabelColor(c) : c);
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

    // Runs `fn` once the mouse button / finger is up, so redrawing the board
    // doesn't swallow the click that's under way.
    let pressed = false;
    document.addEventListener('pointerdown', () => { pressed = true; }, true);
    ['pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, () => { pressed = false; }, true));
    const afterClick = (fn) => {
        if (!pressed) { setTimeout(fn, 0); return; }
        let ran = false;
        const go = () => {
            if (ran) return;
            ran = true;
            ['pointerup', 'pointercancel'].forEach(t => window.removeEventListener(t, go, true));
            setTimeout(fn, 30);
        };
        ['pointerup', 'pointercancel'].forEach(t => window.addEventListener(t, go, true));
    };

    const methods = {
        sanitizeKanban(raw) {
            if (!raw || typeof raw !== 'object') return null;
            // Rows: each with its own columns (one unnamed row on older boards).
            const rowSeen = new Set();
            let rows = (Array.isArray(raw.rows) ? raw.rows : []).filter(r => r && typeof r.id === 'string' && !rowSeen.has(r.id) && rowSeen.add(r.id))
                .map(r => ({ id: r.id, name: typeof r.name === 'string' ? r.name : '' }));
            if (!rows.length) rows = [{ id: 'r0', name: '' }];
            const rowIds = new Set(rows.map(r => r.id));
            const columns = (Array.isArray(raw.columns) ? raw.columns : []).filter(c => c && typeof c.id === 'string').map(c => ({
                id: c.id,
                row: rowIds.has(c.row) ? c.row : rows[0].id,
                name: typeof c.name === 'string' ? c.name : 'Column',
                wip: Number.isFinite(+c.wip) && +c.wip > 0 ? Math.round(+c.wip) : 0,
                // 'oldest': the column lists its cards oldest first.
                sort: c.sort === 'oldest' ? 'oldest' : '',
                policy: typeof c.policy === 'string' ? c.policy : ''
            }));
            if (!columns.length) return null;
            // Columns kept grouped by row, in row order.
            const rowOrder = new Map(rows.map((r, i) => [r.id, i]));
            columns.sort((a, b) => rowOrder.get(a.row) - rowOrder.get(b.row));
            // A row without columns goes.
            rows = rows.filter(r => columns.some(c => c.row === r.id));
            const colIds = new Set(columns.map(c => c.id));
            const labels = (Array.isArray(raw.labels) ? raw.labels : []).filter(l => l && typeof l.id === 'string').map(l => ({
                id: l.id, name: typeof l.name === 'string' ? l.name : 'Label',
                color: typeof l.color === 'string' ? l.color : LABEL_COLORS[0]
            }));
            const labelIds = new Set(labels.map(l => l.id));
            const ts = v => (Number.isFinite(v) ? v : null);
            let maxNum = 0;
            const oneCard = (c) => {
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
                    // When it was last changed, and by whom.
                    editedAt: Number.isFinite(c.editedAt) ? c.editedAt : undefined,
                    editedBy: typeof c.editedBy === 'string' && c.editedBy ? c.editedBy : undefined,
                    // Optional: a category (grouping), who issued it, what it's for, links.
                    category: typeof c.category === 'string' ? c.category : '',
                    issuer: typeof c.issuer === 'string' ? c.issuer : '',
                    purpose: typeof c.purpose === 'string' ? c.purpose : '',
                    links: Array.isArray(c.links) ? c.links.filter(x => x && typeof x.url === 'string' && x.url.trim()).map(x => ({ label: String(x.label || ''), url: x.url.trim() })) : [],
                    due: typeof c.due === 'string' ? c.due : '',
                    highlight: !!c.highlight,
                    blocked: !!c.blocked,
                    blockReason: typeof c.blockReason === 'string' ? c.blockReason : '',
                    checklist: Array.isArray(c.checklist) ? c.checklist.filter(i => i && typeof i.id === 'string').map(ckItem) : [],
                    // The checklists for the other columns it has been in.
                    colChecklists: (c.colChecklists && typeof c.colChecklists === 'object') ? Object.fromEntries(Object.entries(c.colChecklists).filter(([kk, v]) => colIds.has(kk) && Array.isArray(v) && v.length).map(([kk, v]) => [kk, v.filter(i => i && typeof i.id === 'string').map(ckItem)])) : undefined,
                    // The card's own notes, per column it has been in (only those with text).
                    notes: (c.notes && typeof c.notes === 'object') ? Object.fromEntries(Object.entries(c.notes).filter(([kk, v]) => colIds.has(kk) && typeof v === 'string' && v)) : undefined,
                    created: ts(c.created) || now(), started: ts(c.started), finished: ts(c.finished), moved: ts(c.moved) || ts(c.created) || now()
                };
            };
            const cardList = v => (Array.isArray(v) ? v : []).filter(c => c && typeof c.id === 'string');
            const cards = cardList(raw.cards).map(oneCard);
            // Archived cards: off the board, kept whole - with their node (and
            // everything built under it) from the flowchart.
            const onBoard = new Set(cards.map(c => c.id));
            const archived = cardList(raw.archived).filter(c => !onBoard.has(c.id)).map(c => Object.assign(oneCard(c), {
                archivedAt: ts(c.archivedAt) || now(), archivedBy: typeof c.archivedBy === 'string' ? c.archivedBy : '',
                node: c.node && typeof c.node === 'object' ? c.node : null
            }));
            // Cards without a number get the next ones.
            let next = Math.max(maxNum + 1, Number.isFinite(raw.nextNum) ? raw.nextNum : 1);
            cards.forEach((c) => { if (!c.num) c.num = next++; });
            return {
                rows, columns, cards, archived, labels,
                // The old Kanban notes tab has been put away (kbRetireNotes).
                notesRetired: !!raw.notesRetired,
                prefix: typeof raw.prefix === 'string' && raw.prefix.trim() ? raw.prefix.trim().slice(0, 8) : 'KB',
                nextNum: next,
                groupBy: ['assignee', 'label', 'category'].includes(raw.groupBy) ? raw.groupBy : 'none',
                notesTabId: typeof raw.notesTabId === 'string' ? raw.notesTabId : null,
                noteTitles: (raw.noteTitles && typeof raw.noteTitles === 'object') ? Object.assign({}, raw.noteTitles) : {},
                // Which column each card's text in the Kanban notes belongs to (the
                // one it was in when the notes were last written).
                noteCols: (raw.noteCols && typeof raw.noteCols === 'object') ? Object.assign({}, raw.noteCols) : {},
                // The hidden notes tab showing one card's own notes.
                cardTabId: typeof raw.cardTabId === 'string' ? raw.cardTabId : null
            };
        },

        kbCards() { return (this.kanban && this.kanban.cards) || []; },
        kbCard(id) { return this.kbCards().find(c => c.id === id) || null; },
        kbColumn(id) { return this.kanban ? this.kanban.columns.find(c => c.id === id) || null : null; },
        kbColIndex(id) { return this.kanban ? this.kanban.columns.findIndex(c => c.id === id) : -1; },
        // Rows: each holds its own columns; the first column of a row is its
        // backlog and the last one its "done".
        kbRows() { return (this.kanban && this.kanban.rows) || []; },
        kbRowCols(rowId) { return this.kanban ? this.kanban.columns.filter(c => c.row === rowId) : []; },
        kbMultiRow() { const r = this.kbRows(); return r.length > 1 || !!(r[0] && r[0].name); },
        kbColPos(id) { const col = this.kbColumn(id); return col ? this.kbRowCols(col.row).indexOf(col) : -1; },
        kbColIsDone(col) { if (!col) return false; const cols = this.kbRowCols(col.row); return cols.length > 1 && cols[cols.length - 1] === col; },
        kbIsDone(card) { return this.kbColIsDone(this.kbColumn(card.column)); },
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
                const conn = item && item.share && typeof this.shareConnOf === 'function' ? this.shareConnOf(item) : null;
                email = (conn && conn.email) || '';
            } catch (e) { /* not signed in */ }
            if (!email && this._cloudAuth && this._cloudAuth.user) email = this._cloudAuth.user.email || '';
            const local = email.split('@')[0] || '';
            if (local) return local.replace(/[._-]+/g, ' ').replace(/(^|\s)\w/g, ch => ch.toUpperCase());
            // Sharing without an email or a name: still somebody, so what they
            // add and change is marked as theirs.
            return item && item.share && item.share.role === 'owner' ? 'Owner' : '';
        },
        kbAssignees() {
            const set = new Set();
            this.kbCards().forEach((c) => { if (c.assignee) set.add(c.assignee); });
            return [...set].sort((a, b) => a.localeCompare(b));
        },

        // ----- Changes, undo / redo -----
        // `fromNotes`: the change came from editing the notes, which are not
        // rewritten while you type in them.
        // Cards that changed since last time get the time and your name.
        kbStampCards(initOnly) {
            const sig = c => JSON.stringify([c.title, c.desc, c.column, c.labels, c.assignee, c.due, c.blocked, c.blockReason, c.checklist, c.category, c.issuer, c.purpose, c.links, !!c.highlight]);
            const me = this.kbMyName();
            const old = this._kbCardSigs;
            const next = new Map();
            this.kbCards().forEach((c) => {
                const now = sig(c);
                next.set(c.id, now);
                if (initOnly || !old) return;
                if (old.get(c.id) !== now) {
                    c.editedAt = Date.now();
                    if (me) c.editedBy = me; else delete c.editedBy;
                }
            });
            this._kbCardSigs = next;
        },

        kanbanChanged(fromNotes) {
            try { this.kbFindCardTabCard(); } catch (e) { /* no card notes */ }
            this._kbInChange = true;
            try { this.pullKbCardTabEdits(); } finally { this._kbInChange = false; }
            this.kbStampCards();
            this.recordKanbanHistory();
            this.renderKanban();
            if (!fromNotes) this.syncKanbanNotes();
            const shownCard = this._kbCardTabFor && this.kbCard(this._kbCardTabFor);
            if (shownCard && !fromNotes) this.writeKbCardTab(shownCard);
            this.syncKanbanFlow();
            this.kbShowCardTab();
            if (shownCard) this.kbRefreshCardTabLinks(shownCard);
            this.autosave();
        },

        // The card notes' tab is in the notes' tab row as soon as there is a card
        // (and goes with the last one).
        kbShowCardTab() {
            const bar = document.getElementById('notes-tab-bar');
            if (!bar) return;
            const want = !!(this.kanban && this.kbCards().length);
            if (want !== !!bar.querySelector('.kb-card-tab')) this.renderNotesTabBar();
        },

        kanbanSnapshot() {
            const k = this.kanban;
            return JSON.stringify(k ? { rows: k.rows, columns: k.columns, cards: k.cards, archived: k.archived || [], labels: k.labels, prefix: k.prefix, nextNum: k.nextNum } : null);
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
            this.kanban = data ? this.sanitizeKanban(Object.assign(data, { groupBy: old.groupBy, notesTabId: old.notesTabId, noteTitles: old.noteTitles, noteCols: old.noteCols, cardTabId: old.cardTabId, notesRetired: old.notesRetired })) : null;
            this.kbReturnArchivedNodes(old.archived);
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
                rows: [{ id: 'r0', name: '' }],
                columns: columns.map(([name, wip, policy]) => ({ id: uid('kc'), row: 'r0', name, wip: wip || 0, policy: policy || '' })),
                cards: [], archived: old.archived || [], labels: [], prefix: 'KB', nextNum: 1, groupBy: 'none', notesRetired: true,
                // The notes tab stays; what was written under old cards goes under "Removed".
                notesTabId: old.notesTabId || null, noteTitles: old.noteTitles || {},
                noteCols: {}, cardTabId: old.cardTabId || null
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
            const i = this.kbColPos(card.column);
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
            if (lane !== undefined && k.groupBy === 'category') card.category = lane.startsWith('cat:') ? lane.slice(4) : '';
            if (lane !== undefined && k.groupBy === 'label') {
                if (!lane) card.labels = [];
                else card.labels = [lane, ...card.labels.filter(l => l !== lane)];
            }
            if (fromCol !== colId) {
                const t = now();
                // Each column has its own checklist: the one for the column it
                // leaves is kept, the one for the column it enters comes out.
                if (!card.colChecklists) card.colChecklists = {};
                if (card.checklist.length) card.colChecklists[fromCol] = card.checklist; else delete card.colChecklists[fromCol];
                card.checklist = card.colChecklists[colId] || [];
                delete card.colChecklists[colId];
                if (!Object.keys(card.colChecklists).length) delete card.colChecklists;
                card.column = colId;
                card.moved = t;
                if (this.kbColPos(colId) > 0 && !card.started) card.started = t;
                if (this.kbColPos(colId) === 0) card.started = null;
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

        // ----- Archive -----
        // Takes a card off the board without losing anything: its details, notes,
        // checklists and its node in the flowchart (with what's under it) are
        // kept and come back with it.
        kbFindNode(id) {
            const kids = n => [].concat(n._critOn ? (n._critSaved || []) : n._kbColView ? (n._kbColSaved || []) : (n.children || []));
            const walk = (n) => {
                for (const c of kids(n)) {
                    if (!c) continue;
                    if (c._kanban === id) return c;
                    const f = walk(c);
                    if (f) return f;
                }
                return null;
            };
            const branch = this.findKanbanFlowRoot();
            return branch ? walk(branch) : null;
        },

        archiveKanbanCard(id) {
            const k = this.kanban;
            const card = this.kbCard(id);
            if (!card) return;
            this.pullKbCardTabEdits();
            const node = this.kbFindNode(id);
            if (node && node._kbColView) this.kbColViewOff(node);
            if (node && node._critOn && typeof this.critInlineOff === 'function') this.critInlineOff(node, false);
            if (!k.archived) k.archived = [];
            k.archived.unshift(Object.assign({}, card, { archivedAt: now(), archivedBy: this.kbMyName(), node: node ? JSON.parse(JSON.stringify(node)) : null }));
            k.cards = k.cards.filter(c => c !== card);
            if (this._kbSelected === id) this._kbSelected = null;
            if (this._kbCardTabFor === id) this._kbCardTabFor = null;
            this.kanbanChanged();
            this.showNotification(`Archived "${card.title}" - 🗄 on the board brings it back.`, 4500);
        },

        // Puts the flowchart nodes of cards that came back from the archive into
        // the branch, for the next sync to place under their column.
        kbReturnArchivedNodes(list) {
            const branch = this.findKanbanFlowRoot();
            (list || []).forEach((c) => {
                if (!c.node || !this.kbCard(c.id) || this.kbFindNode(c.id)) return;
                const copy = JSON.parse(JSON.stringify(c.node));
                if (branch) branch.children = (branch.children || []).concat(copy);
                else this._kbPendingNodes = (this._kbPendingNodes || []).concat(copy);
            });
        },

        restoreKanbanCard(id) {
            const k = this.kanban;
            const a = (k.archived || []).find(c => c.id === id);
            if (!a) return;
            k.archived = k.archived.filter(c => c !== a);
            const card = Object.assign({}, a);
            ['archivedAt', 'archivedBy', 'node'].forEach((f) => { delete card[f]; });
            if (!this.kbColumn(card.column)) card.column = k.columns[0].id;
            card.labels = card.labels.filter(l => this.kbLabel(l));
            k.cards.push(card);
            this.kbReturnArchivedNodes([a]);
            this._kbSelected = card.id;
            this.kanbanChanged();
            this.showNotification(`"${card.title}" is back in "${this.kbColumn(card.column).name}".`);
        },

        openKanbanArchive() {
            const p = this.kbPopup('🗄 Archived cards');
            const draw = () => {
                p.body.innerHTML = '';
                const list = this.kanban.archived || [];
                if (!list.length) p.body.append(el('p', { class: 'cs-muted', text: 'Nothing archived. 🗄 on a card puts it here; everything about it is kept.' }));
                list.forEach((c) => {
                    const col = this.kbColumn(c.column);
                    p.body.append(el('div', { class: 'kb-arch' },
                        el('div', { class: 'kb-arch-main' }, el('b', { text: c.title }),
                            el('div', { class: 'cs-muted cs-small', text: `${col ? col.name : 'Column gone'} · archived ${new Date(c.archivedAt).toLocaleDateString()}${c.archivedBy ? ` by ${c.archivedBy}` : ''}` })),
                        el('button', { class: 'cs-btn cs-primary', type: 'button', text: '↩ Restore', onclick: () => { this.restoreKanbanCard(c.id); draw(); } }),
                        el('button', { class: 'cs-btn kb-danger', type: 'button', text: '🗑', title: 'Delete for good', onclick: async () => {
                            if (!(await this.showConfirmDialog(`Delete "${c.title}" for good, with its notes and flowchart? (Ctrl+Z on the board still brings it back until you close the site.)`))) return;
                            this.kanban.archived = this.kanban.archived.filter(x => x !== c);
                            this.kanbanChanged();
                            draw();
                        } })));
                });
            };
            draw();
            p.footer.append(el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Close', onclick: p.close }));
        },

        // ----- Labels -----
        async kbDeleteLabel(id) {
            const k = this.kanban;
            const l = this.kbLabel(id);
            if (!l) return false;
            const used = k.cards.filter(c => c.labels.includes(id)).length;
            if (used && !(await this.showConfirmDialog(`Delete the label "${l.name}"? It comes off ${used} card${used === 1 ? '' : 's'}.`))) return false;
            k.labels = k.labels.filter(x => x.id !== id);
            k.cards.concat(k.archived || []).forEach((c) => { c.labels = c.labels.filter(x => x !== id); });
            if (this._kbLabelFilter === id) this._kbLabelFilter = '';
            this.kanbanChanged();
            return true;
        },

        // Renames a label on every card that has it. False if it can't be.
        kbRenameLabel(id, name) {
            const l = this.kbLabel(id);
            const n = kbNorm(name);
            if (!l || !n || n === l.name) return false;
            const other = this.kbLabelByName(n, false);
            if (other && other !== l) { this.showNotification(`There is already a label called "${other.name}".`); return false; }
            l.name = n;
            this.kanbanChanged();
            return true;
        },

        // A small box beside the card: pick labels, add a new one, delete saved ones.
        openKbLabelPicker(cardId, anchor, done) {
            const old = document.getElementById('kb-label-box');
            if (old) old.remove();
            const card0 = this.kbCard(cardId);
            if (!card0) { if (done) done(); return; }
            const box = el('div', { id: 'kb-label-box', class: 'kb-label-box' });
            let closed = false;
            let busy = false; // a question about deleting a label is open
            const close = () => {
                if (closed) return;
                closed = true;
                box.remove();
                document.removeEventListener('pointerdown', outside, true);
                if (done) done();
            };
            const outside = (e) => {
                if (busy || box.contains(e.target)) return;
                close();
            };
            const input = el('input', { class: 'kb-label-new', type: 'text', placeholder: 'New label, or Enter for none', maxlength: '40' });
            const listEl = el('div', { class: 'kb-label-list' });
            const toggle = (id) => {
                const card = this.kbCard(cardId);
                if (!card) { close(); return; }
                card.labels = card.labels.includes(id) ? card.labels.filter(x => x !== id) : card.labels.concat(id);
                this.kanbanChanged();
                draw();
            };
            const draw = () => {
                const card = this.kbCard(cardId);
                listEl.innerHTML = '';
                const q = input.value.trim().toLowerCase();
                this.kanban.labels.filter(l => !q || l.name.toLowerCase().includes(q)).forEach((l) => {
                    const on = card && card.labels.includes(l.id);
                    listEl.append(el('div', { class: 'kb-label-row' },
                        el('button', { class: 'kb-chip kb-label-chip' + (on ? ' on' : ''), type: 'button', style: this.kbChipStyle(l), text: (on ? '✓ ' : '') + l.name, onclick: () => toggle(l.id) }),
                        el('button', { class: 'kb-label-del kb-label-ren', type: 'button', text: '✎', title: `Rename the label "${l.name}"`, onclick: (e) => {
                            const rowEl = e.currentTarget.parentNode;
                            const nm = el('input', { class: 'kb-label-new kb-label-name', type: 'text', value: l.name, maxlength: '40' });
                            let over = false;
                            const finish = (keep) => {
                                if (over) return;
                                over = true;
                                if (keep) this.kbRenameLabel(l.id, nm.value);
                                if (box.isConnected) draw();
                            };
                            nm.addEventListener('keydown', (ke) => {
                                ke.stopPropagation();
                                if (ke.key === 'Enter') { ke.preventDefault(); finish(true); input.focus(); }
                                if (ke.key === 'Escape') { ke.preventDefault(); finish(false); input.focus(); }
                            });
                            nm.addEventListener('blur', () => finish(true));
                            rowEl.innerHTML = '';
                            rowEl.append(nm);
                            nm.focus();
                            nm.select();
                        } }),
                        el('button', { class: 'kb-label-del', type: 'button', text: '✕', title: `Delete the label "${l.name}" from the board`, onclick: async () => { busy = true; try { await this.kbDeleteLabel(l.id); } finally { busy = false; } if (box.isConnected) draw(); } })));
                });
                if (!this.kanban.labels.length) listEl.append(el('div', { class: 'kb-create-hint', text: 'No labels yet - type one.' }));
            };
            input.addEventListener('input', draw);
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Escape') { e.preventDefault(); close(); return; }
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const l = this.kbLabelByName(input.value, true);
                const card = this.kbCard(cardId);
                if (l && card && !card.labels.includes(l.id)) { card.labels.push(l.id); this.kanbanChanged(); }
                close();
            });
            box.append(el('div', { class: 'kb-label-title', text: `Label for "${card0.title}"` }), listEl, input,
                el('div', { class: 'kb-label-foot' }, el('button', { class: 'kb-btn', type: 'button', text: 'Done', onclick: close })));
            draw();
            document.body.append(box);
            const r = anchor || { left: window.innerWidth / 2 - 120, bottom: 120, top: 120 };
            box.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.left))) + 'px';
            box.style.top = Math.round(Math.max(8, Math.min(window.innerHeight - box.offsetHeight - 8, r.bottom + 4))) + 'px';
            document.addEventListener('pointerdown', outside, true);
            setTimeout(() => { if (box.isConnected) input.focus(); }, 0);
        },

        // ----- Links and files on a card -----
        // The selected card lists its links by name; "+ Add link" shows with the
        // checklist's add box (address, Enter, then a name, Enter).
        buildKanbanCardLinks(card) {
            const box = el('div', { class: 'kb-lk' });
            if (!Array.isArray(card.links)) card.links = [];
            if (card.id === this._kbSelected) {
                card.links.forEach((l) => {
                    const row = el('div', { class: 'kb-link-row' });
                    const show = () => {
                        row.innerHTML = '';
                        row.append(
                            el('a', { class: 'kb-lk-a', href: kbHref(l.url), target: '_blank', rel: 'noopener', text: `🔗 ${l.label || l.url}`, title: l.url, onclick: (e) => { e.stopPropagation(); kbOpenLink(e, l.url, this); } }),
                            el('button', { class: 'kb-lk-btn', type: 'button', text: '✎', title: 'Name this link', onclick: rename }),
                            el('button', { class: 'kb-lk-btn', type: 'button', text: '✕', title: 'Remove this link', onclick: () => { card.links = card.links.filter(x => x !== l); this.kanbanChanged(); } }));
                    };
                    const rename = () => {
                        const inp = el('input', { class: 'kb-cl-text', type: 'text', value: l.label, placeholder: 'Name for it' });
                        let over = false;
                        const finish = (keep) => { if (over) return; over = true; if (keep && inp.value.trim() !== l.label) { l.label = inp.value.trim(); this.kanbanChanged(); } else show(); };
                        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') finish(false); });
                        inp.addEventListener('blur', () => finish(true));
                        row.innerHTML = '';
                        row.append(inp);
                        inp.focus();
                        inp.select();
                    };
                    show();
                    box.append(row);
                });
            }
            const add = el('input', { class: 'kb-cl-add kb-lk-add', type: 'text', placeholder: '+ Add link or file' });
            let url = '';
            const commit = (label) => {
                const u = url;
                url = '';
                add.value = '';
                if (!u) return;
                card.links.push({ label, url: u });
                this._kbSelected = card.id;
                this.kanbanChanged();
            };
            add.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Escape') { url = ''; add.value = ''; add.placeholder = '+ Add link or file'; add.blur(); return; }
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (!url) {
                    if (!add.value.trim()) return;
                    url = add.value.trim();
                    add.value = '';
                    add.placeholder = 'Name for it (optional), Enter';
                } else commit(add.value.trim());
            });
            // Clicking elsewhere accepts the link as typed so far.
            add.addEventListener('blur', () => {
                // The row stays until the click is done, so nothing moves under it.
                box.classList.add('adding');
                afterClick(() => box.classList.remove('adding'));
                const u = url || add.value.trim();
                const label = url ? add.value.trim() : '';
                url = '';
                add.value = '';
                const now0 = u && this.kbCard(card.id);
                if (!now0) return;
                now0.links = (now0.links || []).concat({ label, url: u });
                afterClick(() => this.kanbanChanged());
            });
            box.append(add);
            return box;
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
                // The card to show: the selected flowchart node's card, or the card
                // whose heading the cursor is under in the Kanban notes.
                const focusCard = this.kbActiveCardId();
                if (focusCard) this._kbSelected = focusCard;
                if (this.selectedNode && typeof this.deselectNode === 'function') this.deselectNode();
                this.selectedNode = null;
                if (!this._kbUndo) this.resetKanbanHistory();
                this.renderKanban();
                if (this._kbSelected) {
                    const elCard = document.querySelector(`#kanban-view .kb-card[data-id="${this._kbSelected}"]`);
                    if (elCard) elCard.scrollIntoView({ block: 'nearest', inline: 'center' });
                }
                // Boards made before the flowchart branch existed get one.
                if (this.kanban && this.kanban.cards.length && !this.findKanbanFlowRoot()) { this.syncKanbanFlow(); this.autosave(); }
            } else {
                const pop = document.getElementById('kanban-popup');
                if (pop) pop.remove();
                if (!quiet && this.rootData) this.renderFlowchart(this.rootData);
            }
            this.updateUndoRedoButtons();
        },

        kbActiveCardId() {
            const sel = this.selectedNode && this.selectedNode.data;
            if (sel && sel._kanban) {
                let id = sel._kanban;
                if (id.startsWith('ck:') && this.selectedNode.parent) id = this.selectedNode.parent.data._kanban;
                if (id && this.kbCard(id)) return id;
            }
            if (this._kbCardTabFor && this.notesPanelShowing && this.notesPanelShowing()) {
                const t = this.getActiveNotesTarget && this.getActiveNotesTarget();
                if (t && this.kanban && t.tabId === this.kanban.cardTabId) return this._kbCardTabFor;
            }
            const ed = this.notesEditor;
            if (ed && this.kanban && ed._noteTabRef && ed._noteTabRef.tabId === this.kanban.notesTabId) {
                const pos = ed.model.document.selection.getFirstPosition();
                let b = pos && pos.parent;
                while (b && b.parent && !b.parent.is('rootElement')) b = b.parent;
                for (; b; b = b.previousSibling) {
                    if (b.is('element', 'heading4')) break;
                    if (b.is('element', 'heading5')) {
                        let t = '';
                        for (const ch of b.getChildren()) if (ch.is('$text')) t += ch.data;
                        const c = this.kbCards().find(x => this.kbNoteLabel(x) === kbNorm(t));
                        return c ? c.id : null;
                    }
                }
            }
            return null;
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
            const board = view && (view.querySelector('.kb-rows') || view.querySelector('.kb-board'));
            if (!board) return null;
            const cells = {};
            view.querySelectorAll('.kb-cell').forEach((c) => { cells[c.dataset.col + '|' + c.dataset.lane] = c.scrollTop; });
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
                    this.kanban ? btn('📝', 'Card notes: the selected card\'s notes for each column', () => this.openKanbanNotes(null)) : null,
                    this.kanban ? btn(`🗄${(this.kanban.archived || []).length ? ' ' + this.kanban.archived.length : ''}`, 'Archived cards: bring them back', () => this.openKanbanArchive()) : null,
                    this.kanban ? btn('🔗', 'Links: every link on the cards', () => { const on = this.kbLinksOpen(); localStorage.setItem('flowchart-kb-links', on ? '0' : '1'); this.renderKanbanBoard(this.kbScrollState()); }, 'kb-links-btn') : null,
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
                el('option', { value: 'none', text: 'None' }), el('option', { value: 'assignee', text: 'Assignee' }), el('option', { value: 'label', text: 'Label' }), el('option', { value: 'category', text: 'Category' }));
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
            const text = [card.title, card.desc, card.assignee, card.createdBy, card.category, card.issuer, card.purpose, ...card.labels.map(l => (this.kbLabel(l) || {}).name || '')].join(' ').toLowerCase();
            return text.includes(q);
        },

        // Swimlanes for the "group by" choice: [{ key, name, cards test }].
        kbCategories() {
            const set = new Set();
            this.kbCards().forEach((c) => { if (c.category) set.add(c.category); });
            return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        },

        kbLanes() {
            const k = this.kanban;
            // Categories: alphabetical, only those some card is in, then the uncategorised.
            if (k.groupBy === 'category') {
                const lanes = this.kbCategories().map(c => ({ key: 'cat:' + c, name: c, test: x => x.category === c, category: c }));
                lanes.push({ key: '', name: 'No category', test: x => !x.category, category: '' });
                return lanes;
            }
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
            const lanes = this.kbLanes();
            const grouped = this.kanban.groupBy !== 'none';
            const visible = this.kbCards().filter(c => this.kbMatches(c));
            const oldLinks = wrap.querySelector('.kb-links-list');
            const linksTop = oldLinks ? oldLinks.scrollTop : 0;
            wrap.innerHTML = '';
            const rows = this.kbRows();
            if (!this.kbMultiRow()) {
                // One row: the board fills the view, each column scrolling on its own.
                const board = this.buildKanbanGrid(this.kbRowCols(rows[0].id), lanes, grouped, visible, true);
                board.append(el('button', { class: 'kb-add-row', type: 'button', text: '+ Row', title: 'Add a row with columns of its own', onclick: () => this.addKanbanRow() }));
                wrap.append(board);
            } else {
                const scroller = el('div', { class: 'kb-rows' });
                rows.forEach((row) => {
                    scroller.append(el('div', { class: 'kb-row', 'data-row': row.id },
                        el('div', { class: 'kb-row-head' },
                            el('span', { class: 'kb-row-name', text: row.name || 'Row' }),
                            el('button', { class: 'kb-col-menu', type: 'button', text: '⋯', title: 'Row: name, order, delete', onclick: () => this.openKanbanRow(row.id) })),
                        this.buildKanbanGrid(this.kbRowCols(row.id), lanes, grouped, visible, false)));
                });
                scroller.append(el('button', { class: 'kb-add-row', type: 'button', text: '+ Add row', title: 'Add a row with columns of its own', onclick: () => this.addKanbanRow() }));
                wrap.append(scroller);
            }
            if (this.kbLinksOpen()) {
                wrap.append(this.buildKanbanLinks());
                wrap.querySelector('.kb-links-list').scrollTop = linksTop;
            }
            if (keep) {
                const sc = wrap.querySelector('.kb-rows') || wrap.querySelector('.kb-board');
                if (sc) { sc.scrollLeft = keep.left; sc.scrollTop = keep.top; }
                wrap.querySelectorAll('.kb-cell').forEach((c) => {
                    const v = keep.cells[c.dataset.col + '|' + c.dataset.lane];
                    if (v) c.scrollTop = v;
                });
            }
        },

        // One row's columns as a grid: headers, then (grouped) a heading per lane
        // with the grey column strips running on under it, and the cells.
        buildKanbanGrid(cols, lanes, grouped, visible, fill) {
            const board = el('div', { class: 'kb-board' + (grouped ? ' grouped' : '') + (fill ? '' : ' in-rows') });
            board.style.gridTemplateColumns = `repeat(${cols.length}, var(--kb-col-w)) 40px`;
            if (!grouped && fill) board.style.gridTemplateRows = 'auto minmax(0, 1fr)';
            // Lanes as tall as their cards (plain auto rows shrink in a scrolling grid).
            else board.style.gridAutoRows = 'max-content';
            cols.forEach((col, i) => {
                const all = this.kbCards().filter(c => c.column === col.id);
                const over = col.wip && all.length > col.wip;
                const last = this.kbColIsDone(col);
                const head = el('div', { class: 'kb-col-head' + (over ? ' over' : '') + (grouped ? '' : ' joined'), title: col.policy ? `Policy: ${col.policy}` : '' },
                    el('div', { class: 'kb-col-row' },
                        el('span', { class: 'kb-col-name', text: col.name }),
                        el('span', { class: 'kb-col-count', text: col.wip ? `${all.length} / ${col.wip}` : `${all.length}` }),
                        last ? el('span', { class: 'kb-col-done', text: '✓', title: 'Cards here count as done' }) : null,
                        el('span', { class: 'kb-spacer' }),
                        el('button', { class: 'kb-col-menu', type: 'button', text: '⋯', title: 'Column: name, WIP limit, policy', onclick: () => this.openKanbanColumn(col.id) })),
                    col.policy ? el('div', { class: 'kb-col-policy', text: col.policy }) : null,
                    col.sort === 'oldest' ? el('div', { class: 'kb-col-policy', text: '⇅ Oldest first' }) : null,
                    over ? el('div', { class: 'kb-col-warn', text: `Over the WIP limit by ${all.length - col.wip}` }) : null);
                head.classList.add(last ? 'kb-cdone' : `kb-c${i % 3}`);
                head.style.gridColumn = String(i + 1);
                head.style.gridRow = '1';
                board.append(head);
            });
            const rowId = cols.length ? cols[0].row : null;
            board.append(el('button', { class: 'kb-add-col', type: 'button', text: '+', title: 'Add a column', style: 'grid-column:' + (cols.length + 1) + '; grid-row:1;', onclick: () => this.addKanbanColumn(rowId) }));
            let row = 2;
            const cellsByCol = cols.map(() => []);
            lanes.forEach((lane) => {
                const laneCards = visible.filter(lane.test);
                if (grouped && lane.category !== undefined && !laneCards.some(c => cols.some(col => col.id === c.column))) return;
                if (grouped) {
                    const n = laneCards.filter(c => cols.some(col => col.id === c.column)).length;
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
                    cell.classList.add(this.kbColIsDone(col) ? 'kb-cdone' : `kb-c${i % 3}`);
                    cell.style.gridColumn = String(i + 1);
                    cell.style.gridRow = String(row);
                    let inCell = laneCards.filter(c => c.column === col.id);
                    if (col.sort === 'oldest') inCell = inCell.slice().sort((a, b) => (a.created || 0) - (b.created || 0));
                    inCell.forEach(c => cell.append(this.buildKanbanCard(c)));
                    cell.append(this.buildKanbanAdd(col, lane));
                    board.append(cell);
                    cellsByCol[i].push(cell);
                });
                row++;
            });
            return board;
        },

        // ----- Links list -----
        // Every link on the cards, once each: web addresses, then folders and
        // files. ✎ renames it on every card that has it; dragging it onto a card
        // adds it there.
        kbLinksOpen() {
            const v = localStorage.getItem('flowchart-kb-links');
            return v === null ? window.innerWidth > 900 : v === '1';
        },

        kbAllLinks() {
            const map = new Map();
            this.kbCards().forEach(c => (c.links || []).forEach((l) => {
                const key = String(l.url).trim().toLowerCase();
                if (!map.has(key)) map.set(key, { key, url: l.url, label: '', cards: [] });
                const e = map.get(key);
                if (!e.label && l.label) e.label = l.label;
                if (!e.cards.includes(c)) e.cards.push(c);
            }));
            const all = [...map.values()].sort((a, b) => (a.label || a.url).localeCompare(b.label || b.url, undefined, { sensitivity: 'base' }));
            const isPath = u => kbHref(u).startsWith('file:');
            return { urls: all.filter(e => !isPath(e.url)), paths: all.filter(e => isPath(e.url)) };
        },

        buildKanbanLinks() {
            const { urls, paths } = this.kbAllLinks();
            const list = el('div', { class: 'kb-links-list' });
            const rowOf = (e) => {
                const row = el('div', { class: 'kb-links-row', title: `${e.url}\nOn: ${e.cards.map(c => c.title).join(', ')}\nDrag onto a card to add it there` });
                const show = () => {
                    row.innerHTML = '';
                    row.append(
                        el('span', { class: 'kb-links-grip', text: '⠿' }),
                        el('a', { class: 'kb-links-a', href: kbHref(e.url), target: '_blank', rel: 'noopener', draggable: 'false', text: e.label || e.url, onclick: (ev) => kbOpenLink(ev, e.url, this) }),
                        el('span', { class: 'kb-links-n', text: String(e.cards.length), title: `On ${e.cards.length} card${e.cards.length === 1 ? '' : 's'}` }),
                        el('button', { class: 'kb-lk-btn', type: 'button', text: '✎', title: 'Rename it on every card', onclick: rename }));
                };
                const rename = () => {
                    const inp = el('input', { class: 'kb-links-in', type: 'text', value: e.label, placeholder: 'Name for it' });
                    let over = false;
                    const finish = (save) => {
                        if (over) return;
                        over = true;
                        const v = inp.value.trim();
                        if (!save || v === e.label) { show(); return; }
                        this.kbCards().forEach(c => (c.links || []).forEach((l) => { if (String(l.url).trim().toLowerCase() === e.key) l.label = v; }));
                        afterClick(() => this.kanbanChanged());
                    };
                    inp.addEventListener('keydown', (ke) => { ke.stopPropagation(); if (ke.key === 'Enter') { ke.preventDefault(); finish(true); } if (ke.key === 'Escape') finish(false); });
                    inp.addEventListener('blur', () => finish(true));
                    row.innerHTML = '';
                    row.append(inp);
                    inp.focus();
                    inp.select();
                };
                show();
                this.wireKanbanLinkDrag(row, e);
                return row;
            };
            const group = (name, items, none) => list.append(el('div', { class: 'kb-links-head', text: `${name} (${items.length})` }), ...(items.length ? items.map(rowOf) : [el('div', { class: 'kb-links-none', text: none })]));
            group('🌐 Web links', urls, 'None yet.');
            group('📁 Folders and files', paths, 'None yet.');
            return el('div', { class: 'kb-links' },
                el('div', { class: 'kb-links-title' }, el('b', { text: '🔗 Links' }), el('span', { class: 'kb-spacer' }),
                    el('button', { class: 'kb-lk-btn', type: 'button', text: '✕', title: 'Hide (🔗 at the top shows it again)', onclick: () => { localStorage.setItem('flowchart-kb-links', '0'); this.renderKanbanBoard(this.kbScrollState()); } })),
                list);
        },

        // Drag by the row (on a touch screen: by its ⠿).
        wireKanbanLinkDrag(row, entry) {
            row.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 || e.target.closest('button, input')) return;
                if (e.pointerType === 'touch' && !e.target.closest('.kb-links-grip')) return;
                const sx = e.clientX, sy = e.clientY;
                let ghost = null;
                let over = null;
                const move = (ev) => {
                    if (ev.pointerId !== e.pointerId) return;
                    if (!ghost) {
                        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
                        ghost = el('div', { class: 'kb-links-ghost', text: `🔗 ${entry.label || entry.url}` });
                        document.body.append(ghost);
                        document.body.classList.add('kb-dragging-body');
                    }
                    ev.preventDefault();
                    ghost.style.transform = `translate(${ev.clientX + 10}px, ${ev.clientY + 10}px)`;
                    const under = document.elementFromPoint(ev.clientX, ev.clientY);
                    const card = under && under.closest('#kanban-view .kb-card');
                    if (over && over !== card) over.classList.remove('kb-link-drop');
                    over = card;
                    if (over) over.classList.add('kb-link-drop');
                };
                const up = (ev) => {
                    if (ev.pointerId !== e.pointerId) return;
                    ['pointermove', 'pointerup', 'pointercancel'].forEach((t, i) => window.removeEventListener(t, i ? up : move));
                    if (!ghost) return;
                    ghost.remove();
                    document.body.classList.remove('kb-dragging-body');
                    // The click ending a drag doesn't open the link.
                    const eat = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
                    window.addEventListener('click', eat, { capture: true, once: true });
                    setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0);
                    if (over) over.classList.remove('kb-link-drop');
                    const card = over && ev.type === 'pointerup' && this.kbCard(over.dataset.id);
                    if (!card) return;
                    if ((card.links || []).some(l => String(l.url).trim().toLowerCase() === entry.key)) { this.showNotification(`"${card.title}" already has that link.`); return; }
                    card.links = (card.links || []).concat({ label: entry.label, url: entry.url });
                    this.kanbanChanged();
                    this.showNotification(`Added the link to "${card.title}".`);
                };
                window.addEventListener('pointermove', move, { passive: false });
                window.addEventListener('pointerup', up);
                window.addEventListener('pointercancel', up);
            });
        },

        kbChipStyle(l) { const c = labelColor(l.color); return `background:${c}; color:${darkText(c) ? '#172b4d' : '#fff'}`; },

        buildKanbanCard(card) {
            const done = this.kbIsDone(card);
            const ckDone = card.checklist.filter(c => c.done).length;
            const overdue = card.due && !done && card.due < todayStr();
            const ageDays = days(now() - (card.moved || card.created));
            const node = el('div', {
                class: 'kb-card' + (card.id === this._kbSelected ? ' selected' : '') + (card.blocked ? ' blocked' : '') + (done ? ' done' : '') + (card.highlight ? ' highlighted' : ''),
                'data-id': card.id, tabindex: '0'
            },
                // The title, with the card's buttons and bubbles at the top right.
                el('div', { class: 'kb-card-head' },
                    el('div', { class: 'kb-card-title', text: card.title }),
                    el('div', { class: 'kb-card-tools' },
                    // Highlights the card (shown on the selected card, and on highlighted ones).
                    el('button', { class: 'kb-card-flow kb-hl-btn', type: 'button', text: '🖍', title: card.highlight ? 'Remove the highlight' : 'Highlight this card',
                        onclick: (e) => { e.stopPropagation(); card.highlight = !card.highlight; this.kanbanChanged(); } }),
                    // Opens the card's details.
                    el('button', { class: 'kb-card-flow', type: 'button', text: '✎', title: 'Edit card',
                        onclick: (e) => { e.stopPropagation(); this._kbSelected = card.id; this.openKanbanCard(card.id); } }),
                    el('button', { class: 'kb-card-flow', type: 'button', text: '🗄', title: 'Archive: off the board, everything kept',
                        onclick: (e) => { e.stopPropagation(); this.archiveKanbanCard(card.id); } }),
                    // Opens the flowchart on this card's node.
                    el('button', { class: 'kb-card-flow', type: 'button', text: '🌳', title: 'Show this card in the flowchart',
                        onclick: (e) => { e.stopPropagation(); this.showKanbanCardInFlowchart(card.id); } }),
                    // On a shared board: the bubble of whoever last changed it, too.
                    this.kbIsShared() && (card.editedBy || card.createdBy) && (card.editedBy || card.createdBy) !== card.assignee
                        ? (() => { const a = avatar(card.editedBy || card.createdBy, 'sm kb-editor'); a.title = `${card.editedBy ? 'Last changed' : 'Added'} by ${card.editedBy || card.createdBy}`; return a; })() : null,
                    card.assignee ? avatar(card.assignee) : null)),
                card.category ? el('div', { class: 'kb-card-cat', text: card.category }) : null,
                // Who issued it and what it's for show on the selected card.
                card.id === this._kbSelected && (card.issuer || card.purpose)
                    ? el('div', { class: 'kb-card-about' }, card.issuer ? el('b', { text: `Issued by ${card.issuer}` }) : null, card.issuer && card.purpose ? ' - ' : null, card.purpose || null)
                    : null,
                card.blocked ? el('div', { class: 'kb-blocked', text: '⛔ Blocked' + (card.blockReason ? ` - ${card.blockReason}` : '') }) : null,
                this.buildKanbanCardChecklist(card),
                this.buildKanbanCardLinks(card),
                // Labels: click one to change it, "+ label" to add one.
                el('div', { class: 'kb-chips' + (card.labels.length ? '' : ' none') }, ...card.labels.map((id) => {
                    const l = this.kbLabel(id);
                    return l ? el('button', { class: 'kb-chip', type: 'button', style: this.kbChipStyle(l), text: l.name, title: 'Change the labels', onclick: (e) => { e.stopPropagation(); this.openKbLabelPicker(card.id, e.currentTarget.getBoundingClientRect()); } }) : null;
                }), el('button', { class: 'kb-chip-add', type: 'button', text: '+ label', title: 'Add a label', onclick: (e) => { e.stopPropagation(); this.openKbLabelPicker(card.id, e.currentTarget.getBoundingClientRect()); } })),
                el('div', { class: 'kb-card-foot' },
                    card.checklist.length ? el('span', { class: 'kb-meta' + (ckDone === card.checklist.length ? ' full' : ''), text: `☑ ${ckDone}/${card.checklist.length}`, title: 'Checklist' }) : null,
                    card.due ? el('span', { class: 'kb-meta' + (overdue ? ' overdue' : ''), text: `🗓 ${fmtDue(card.due)}`, title: overdue ? 'Overdue' : 'Due' }) : null,
                    !done && ageDays >= 3 ? el('span', { class: 'kb-age', title: `${Math.floor(ageDays)} days in this column`, text: '●'.repeat(Math.min(4, Math.floor(Math.log2(ageDays)))) }) : null,
                    el('span', { class: 'kb-spacer' }),
                    card.links && card.links.length ? el('span', { class: 'kb-meta', text: `🔗 ${card.links.length}`, title: card.links.map(l => l.label || l.url).join('\n') }) : null,
                el('span', { class: 'kb-card-stamp', text: card.editedAt
                    ? `Edited ${(window.__stampText || (() => ''))(card.editedAt, card.editedBy)}`
                    : `Added ${(window.__stampText || (() => ''))(card.created, card.createdBy)}` })));
            this.wireKanbanDrag(node, card);
            return node;
        },

        // The card's checklist, right on the card: tick items, edit their text in
        // place (emptying one removes it), and add new ones (the add box shows
        // while the pointer is over the card).
        buildKanbanCardChecklist(card) {
            const box = el('div', { class: 'kb-cl' });
            const commit = () => { this._kbCardEditing = null; this.kanbanChanged(); };
            card.checklist.forEach((item) => {
                const cb = el('input', { type: 'checkbox', checked: item.done, title: item.done ? 'Done - untick' : 'Tick off' });
                cb.addEventListener('change', () => { item.done = cb.checked; commit(); });
                const tx = el('input', { class: 'kb-cl-text' + (item.done ? ' done' : ''), type: 'text', value: item.text });
                tx.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); tx.blur(); }
                    if (e.key === 'Escape') { tx.value = item.text; tx.blur(); }
                    e.stopPropagation();
                });
                tx.addEventListener('blur', () => {
                    const v = tx.value.trim();
                    if (v === item.text) return;
                    if (!v) card.checklist = card.checklist.filter(x => x !== item);
                    else item.text = v;
                    commit();
                });
                box.append(el('label', { class: 'kb-cl-item' }, cb, tx));
            });
            const add = el('input', { class: 'kb-cl-add', type: 'text', placeholder: '+ Add checklist item' });
            let entered = false;
            add.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Escape') { add.value = ''; add.blur(); return; }
                if (e.key !== 'Enter' || !add.value.trim()) return;
                e.preventDefault();
                const typed = add.value.trim();
                add.value = '';
                entered = true; // the redraw takes this box away: not a click elsewhere
                card.checklist.push({ id: uid('ck'), text: typed, done: false });
                // Ready for the next item: the redrawn card's add box gets the
                // cursor straight away, so fast typing isn't lost in between.
                this._kbCardEditing = card.id;
                this.kanbanChanged();
                const next = document.querySelector(`#kanban-view .kb-card[data-id="${card.id}"] .kb-cl-add`);
                if (next) next.focus();
            });
            // Clicking elsewhere accepts what was typed.
            add.addEventListener('blur', () => {
                if (entered) return;
                // The row stays until the click is done, so nothing moves under it.
                box.classList.add('adding');
                afterClick(() => box.classList.remove('adding'));
                const typed = add.value.trim();
                add.value = '';
                if (this._kbCardEditing === card.id) this._kbCardEditing = null;
                const now0 = typed && this.kbCard(card.id);
                if (!now0) return;
                now0.checklist.push({ id: uid('ck'), text: typed, done: false });
                afterClick(() => this.kanbanChanged());
            });
            box.append(add);
            if (this._kbCardEditing === card.id) {
                box.classList.add('adding');
                setTimeout(() => { if (add.isConnected) add.focus(); }, 0);
            }
            return box;
        },

        buildKanbanAdd(col, lane) {
            const box = el('div', { class: 'kb-create' });
            const open = () => {
                box.innerHTML = '';
                const ta = el('textarea', { class: 'kb-create-input', rows: '2', placeholder: 'What needs to be done?' });
                const add = (pick) => {
                    const title = ta.value.trim();
                    if (!title) return false;
                    const fields = { title, column: col.id };
                    if (lane.person !== undefined) fields.assignee = lane.person;
                    // On a shared board a new card goes under the name of whoever adds it.
                    else if (this.kbIsShared() && this.kbMyName()) fields.assignee = this.kbMyName();
                    if (lane.label) fields.labels = [lane.label.id];
                    if (lane.category) fields.category = lane.category;
                    const card = this.kbNewCard(fields);
                    this.kanban.cards.push(card);
                    const reopen = col.id + '|' + (lane.key === null ? '' : lane.key);
                    const r0 = box.getBoundingClientRect();
                    const at = { left: r0.left, top: r0.top, bottom: r0.bottom };
                    // Typed and Entered: pick (or type) its label, then on to the next card.
                    if (pick && !lane.label) {
                        this.kanbanChanged();
                        this.openKbLabelPicker(card.id, at, () => { this._kbReopenCreate = reopen; this.renderKanbanBoard(this.kbScrollState()); });
                    } else {
                        this._kbReopenCreate = reopen;
                        this.kanbanChanged();
                    }
                    return true;
                };
                ta.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(true); }
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
                if (e.button !== 0 || e.target.closest('button, input, textarea, select, a')) return;
                const sx = e.clientX, sy = e.clientY;
                const touch = e.pointerType === 'touch';
                let dragging = false;
                let ghost = null;
                let offX = 0, offY = 0;
                let holdTimer = null;
                let armed = !touch;
                const board = node.closest('.kb-rows') || node.closest('.kb-board');
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
                        // A click selects the card (and shows its notes, if Notes is
                        // open); its details open from the ✎ on the card.
                        if (this._kbSelected !== card.id) {
                            this._kbSelected = card.id;
                            this.renderKanbanBoard(this.kbScrollState());
                            if (this.notesPanelShowing()) this.openKbCardNotes(card.id);
                        }
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
        // The order cards are written in the Kanban notes: by column, and within
        // a column grouped by first label (A-Z), cards without one last.
        kbNoteCards(colId) {
            const lname = c => (c.labels.length && this.kbLabel(c.labels[0]) ? this.kbLabel(c.labels[0]).name.toLowerCase() : '\uffff');
            return this.kbCards().filter(c => c.column === colId).map((c, i) => ({ c, i }))
                .sort((a, b) => (lname(a.c) < lname(b.c) ? -1 : lname(a.c) > lname(b.c) ? 1 : a.i - b.i)).map(x => x.c);
        },

        kbNoteOccurrence(card) {
            const label = this.kbNoteLabel(card);
            const order = this.kanban.columns.flatMap(col => this.kbNoteCards(col.id));
            return Math.max(0, order.filter(c => this.kbNoteLabel(c) === label).indexOf(card));
        },

        kanbanNotesTab(create) {
            const k = this.kanban;
            if (!k) return null;
            let tab = k.notesTabId ? (this.notesTabs || []).find(x => x.id === k.notesTabId) : null;
            if (!tab && create && !k.notesRetired && k.notesTabId && typeof this.getDefaultNotesTab === 'function') {
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
            if (!k || k.notesRetired || !k.notesTabId) return false;
            const tab = this.kanbanNotesTab(false);
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
            const write = (id, tag, label, done, blankLine, body) => {
                live.add(id);
                titles[id] = label;
                const sec = sections.get(id);
                out.push(`<${tag}${sec && sec.folded ? ' data-folded="true"' : ''}${done ? ' data-done="true"' : ''}>${escH(label)}</${tag}>`);
                if (body !== undefined) out.push(body || '<p>&nbsp;</p>');
                else if (sec && sec.blocks.length) sec.blocks.forEach(b => out.push(html(b)));
                else if (blankLine) out.push('<p>&nbsp;</p>');
            };
            if (!k.noteCols) k.noteCols = {};
            const cardWins = this._kbCardWins || new Set();
            k.columns.forEach((col) => {
                write(`col:${col.id}`, 'h4', kbNorm(col.name), false, false);
                this.kbNoteCards(col.id).forEach((card) => {
                    const done = this.kbIsDone(card);
                    // What was written under the card goes to its notes for the
                    // column it was in then; what's shown is its notes for the
                    // column it's in now (a card moved back finds its old text).
                    const sec = sections.get(card.id);
                    if (sec && !cardWins.has(card.id)) {
                        const prev = k.noteCols[card.id] || card.column;
                        const text = hasContent(sec.blocks) ? sec.blocks.map(html).join('') : '';
                        if (text || (card.notes && card.notes[prev])) {
                            if (!card.notes) card.notes = {};
                            if (text) card.notes[prev] = text; else delete card.notes[prev];
                        }
                    }
                    if (card.notes && !Object.keys(card.notes).length) delete card.notes;
                    k.noteCols[card.id] = card.column;
                    write(card.id, 'h5', this.kbNoteLabel(card), done, true, (card.notes && card.notes[card.column]) || '');
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
            Object.keys(k.noteCols).forEach((id) => { if (!this.kbCard(id)) delete k.noteCols[id]; });
            if (result === tab.content) return false;
            tab.content = result;
            this._kbNotesSeen = result;
            if (typeof this.refreshEmbeddedEditors === 'function') this.refreshEmbeddedEditors();
            if (typeof this.syncNotesPanesShowingTab === 'function') this.syncNotesPanesShowingTab('chart', tab.id, result);
            return true;
        },

        // ----- A card's own notes (a hidden tab, one card at a time) -----
        // Every column as a Title, with the card's notes for that column under
        // it; the cursor goes to the column the card is in. Edits go back into
        // the card (and its current column's text into the Kanban notes).
        kbCardTab(create) {
            const k = this.kanban;
            if (!k) return null;
            let tab = k.cardTabId ? (this.notesTabs || []).find(x => x.id === k.cardTabId) : null;
            if (!tab && create && typeof this.getDefaultNotesTab === 'function') {
                tab = this.getDefaultNotesTab('Card notes');
                this.notesTabs.push(tab);
                k.cardTabId = tab.id;
            }
            return tab;
        },

        // Folds every Title in the note except `keep` (which is opened).
        kbFoldAllBut(editor, keep) {
            if (typeof this.toggleTitleFold !== 'function') return;
            Array.from(editor.model.document.getRoot().getChildren()).forEach((h) => {
                if (!h.is('element', 'heading4')) return;
                const folded = !!h.getAttribute('folded');
                if (h === keep && folded) this.toggleTitleFold(editor, h, false);
                else if (h !== keep && !folded) this.toggleTitleFold(editor, h, true);
            });
        },

        // Never listed with the ordinary tabs (the card notes have their own pill;
        // what's left of the old Kanban notes is in the notes list).
        isHiddenNotesTab(tab) {
            return !!(tab && this.kanban && (tab.id === this.kanban.cardTabId || (this.kanban.notesRetired && tab.id === this.kanban.notesTabId)));
        },

        kbColItems(card, colId) {
            return colId === card.column ? card.checklist : ((card.colChecklists && card.colChecklists[colId]) || []);
        },

        // Which card the card notes show is not saved: after loading, the card
        // is found again by the note's title (and, if several have that name,
        // its checklist). Without this its tick boxes and edits go nowhere.
        kbFindCardTabCard() {
            const tab = this.kbCardTab(false);
            if (!tab || (this._kbCardTabFor && this.kbCard(this._kbCardTabFor))) return;
            this._kbCardTabFor = null;
            const doc = new DOMParser().parseFromString(`<body>${tab.content || ''}</body>`, 'text/html');
            const head = Array.from(doc.querySelectorAll('h5')).find(h => h.textContent.startsWith(TITLE_MARK));
            if (!head) return;
            const title = kbNorm(head.textContent.replace(/⁣/g, ''));
            const lines = new Set(Array.from(doc.querySelectorAll('h6')).map(h => kbNorm(h.textContent).replace(/^✓\s*/, '')));
            const itemsOf = c => this.kanban.columns.reduce((a, col) => a.concat(this.kbColItems(c, col.id).map(x => kbNorm(x.text)).filter(Boolean)), []);
            const same = this.kbCards().filter(c => kbNorm(c.title) === title);
            const allIn = same.filter(c => itemsOf(c).every(t => lines.has(t)));
            const full = allIn.filter(c => new Set(itemsOf(c)).size === lines.size);
            const card = same.length === 1 ? same[0] : (full.length === 1 ? full[0] : null);
            if (!card) return;
            if (allIn.includes(card)) { this._kbCardTabFor = card.id; this._kbCardTabSeen = tab.content; }
            else { this.writeKbCardTab(card); return; } // the card has newer items
            this.kbRefreshCardTabLinks(card);
        },

        // The links at the top of the card notes, by the names they have now
        // (they may have been renamed while the note wasn't looked at).
        kbRefreshCardTabLinks(card) {
            const tab = this.kbCardTab(false);
            if (!tab || !card || this._kbCardTabFor !== card.id) return;
            const doc = new DOMParser().parseFromString(`<body>${tab.content || ''}</body>`, 'text/html');
            const kids = Array.from(doc.body.children);
            const end = kids.findIndex((n, i) => n.tagName === 'H4' || (i > 0 && n.tagName === 'H5'));
            const top = end < 0 ? kids : kids.slice(0, end);
            if (!top.length || top[0].tagName !== 'H5') return;
            const old = top.filter(n => n.tagName === 'P' && n.textContent.trim().startsWith('🔗'));
            const want = (card.links || []).map(l => `🔗 ${kbLinkText(l)}`);
            if (old.length === want.length && old.every((n, i) => kbNorm(n.textContent) === kbNorm(want[i]))) return;
            let at = top[top.length - 1];
            while (old.includes(at)) at = at.previousElementSibling;
            old.forEach(n => n.remove());
            want.forEach((t) => { const p = doc.createElement('p'); p.textContent = t; at.after(p); at = p; });
            const same = tab.content === this._kbCardTabSeen;
            tab.content = doc.body.innerHTML;
            if (same) this._kbCardTabSeen = tab.content;
            if (typeof this.refreshEmbeddedEditors === 'function') this.refreshEmbeddedEditors();
            if (typeof this.syncNotesPanesShowingTab === 'function') this.syncNotesPanesShowingTab('chart', tab.id, tab.content);
        },

        writeKbCardTab(card) {
            const tab = this.kbCardTab(true);
            if (!tab || !card) return null;
            // The card itself as the note's title (editing it renames the card), its
            // description and its links - above the columns, not part of any of them.
            const parts = [`<h5>${TITLE_MARK}${escHtml(kbNorm(card.title))}</h5>`];
            if ((card.desc || '').trim()) parts.push(...card.desc.trim().split(/\n+/).map(x => `<p>${escHtml(x)}</p>`));
            (card.links || []).forEach((l) => { parts.push(`<p>🔗 ${escHtml(kbLinkText(l))}</p>`); });
            const multi = (this.kanban.rows || []).length > 1;
            let lastRow = null;
            this.kanban.columns.forEach((col) => {
                // Several rows: divided by a line with the row's name.
                if (multi && col.row !== lastRow) {
                    const r = this.kanban.rows.find(x => x.id === col.row);
                    parts.push(`<h5>${ROW_MARK}${escHtml((r && r.name) || 'Row')}</h5>`);
                    lastRow = col.row;
                }
                // Only the column the card is in starts open (written folded, so a
                // later refresh of the note can't undo it).
                parts.push(`<h4${col.id === card.column ? '' : ' data-folded="true"'}>${escHtml(col.name)}</h4>`);
                parts.push((card.notes && card.notes[col.id]) || '<p>&nbsp;</p>');
                this.kbColItems(card, col.id).forEach((it) => {
                    if (!it.text.trim()) return;
                    parts.push(`<h6${it.done ? ' data-done="true"' : ''}>${escHtml(kbNorm(it.text))}</h6>`, it.note || '<p>&nbsp;</p>');
                });
            });
            const content = parts.join('');
            this._kbCardTabFor = card.id;
            if (tab.content !== content) {
                tab.content = content;
                if (typeof this.refreshEmbeddedEditors === 'function') this.refreshEmbeddedEditors();
                if (typeof this.syncNotesPanesShowingTab === 'function') this.syncNotesPanesShowingTab('chart', tab.id, content);
            }
            this._kbCardTabSeen = content;
            return tab;
        },

        // Text typed in a card's tab goes back into the card; a card checklist
        // line added, renamed or removed there is on the card and in the
        // flowchart too.
        pullKbCardTabEdits() {
            const tab = this.kbCardTab(false);
            const card = this._kbCardTabFor && this.kbCard(this._kbCardTabFor);
            if (!tab || !card) return;
            if (typeof this.flushNotesEditors === 'function') this.flushNotesEditors();
            if (tab.content === this._kbCardTabSeen) return;
            this._kbCardTabSeen = tab.content;
            const doc = new DOMParser().parseFromString(`<body>${tab.content}</body>`, 'text/html');
            const cols = this.kanban.columns;
            let i = -1;
            let newTitle = '';
            let desc = null; // the lines under the title
            let inRows = false;
            const parts = cols.map(() => ({ body: [], items: [] }));
            Array.from(doc.body.childNodes).forEach((n) => {
                if (n.nodeType === 1 && n.tagName === 'H4') { i++; return; }
                if (n.nodeType === 1 && n.tagName === 'H5' && n.textContent.startsWith(ROW_MARK)) {
                    if (n.textContent.startsWith(TITLE_MARK)) { newTitle = kbNorm(n.textContent.replace(/\u2063/g, '')); desc = desc || []; } else inRows = true;
                    return;
                }
                if (i === -1 && desc && !inRows && n.nodeType === 1) {
                    n.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
                    n.textContent.replace(/[\u2063\u200b]/g, '').replace(/\u00a0/g, ' ').split('\n').map(x => x.trim()).forEach((line) => { if (line && !line.startsWith('🔗')) desc.push(line); });
                    return;
                }
                if ((n.textContent || '').trim().startsWith(ROW_DIVIDER.slice(0, 1))) return;
                if (i < 0 || i >= cols.length || !(n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()))) return;
                const p = parts[i];
                if (n.nodeType === 1 && n.tagName === 'H6') p.items.push({ text: kbNorm(n.textContent).replace(/^✓\s*/, ''), blocks: [] });
                else if (p.items.length) p.items[p.items.length - 1].blocks.push(n);
                else p.body.push(n);
            });
            // A column's Title is missing or doubled: not a layout to read back.
            if (i !== cols.length - 1) return;
            let changed = false;
            let listChanged = false;
            if (newTitle && newTitle !== kbNorm(card.title)) { card.title = newTitle; listChanged = true; }
            if (newTitle && desc) {
                const was = (card.desc || '').split(/\n+/).map(x => x.trim()).filter(Boolean).join('\n');
                if (desc.join('\n') !== was) { card.desc = desc.join('\n'); listChanged = true; }
            }
            cols.forEach((col, j) => {
                const text = blocksHaveText(parts[j].body) ? blocksHtml(parts[j].body) : '';
                if (text !== ((card.notes && card.notes[col.id]) || '')) {
                    if (!card.notes) card.notes = {};
                    if (text) card.notes[col.id] = text; else delete card.notes[col.id];
                    changed = true;
                }
                // Lines that still read the same are the same items; what's left
                // over is matched in order (renamed), then added or removed.
                const old = this.kbColItems(card, col.id).filter(x => x.text.trim());
                const lines = parts[j].items;
                const pair = new Map();
                const used = new Set();
                lines.forEach((ln) => {
                    const it = ln.text && old.find(x => !used.has(x) && kbNorm(x.text) === ln.text);
                    if (it) { pair.set(ln, it); used.add(it); }
                });
                const rest = old.filter(x => !used.has(x));
                lines.forEach((ln) => { if (!pair.has(ln) && rest.length) pair.set(ln, rest.shift()); });
                const next = [];
                lines.forEach((ln) => {
                    let it = pair.get(ln);
                    if (!it) {
                        if (!ln.text) return; // a line just started
                        it = { id: uid('ck'), text: ln.text, done: false };
                        listChanged = true;
                    } else if (ln.text && ln.text !== kbNorm(it.text)) {
                        it.text = ln.text;
                        listChanged = true;
                    }
                    const note = blocksHaveText(ln.blocks) ? blocksHtml(ln.blocks) : '';
                    if (note !== (it.note || '')) { if (note) it.note = note; else delete it.note; changed = true; }
                    next.push(it);
                });
                if (next.length !== old.length || next.some((x, n) => x !== old[n])) {
                    listChanged = true;
                    if (col.id === card.column) card.checklist = next;
                    else {
                        if (!card.colChecklists) card.colChecklists = {};
                        if (next.length) card.colChecklists[col.id] = next; else delete card.colChecklists[col.id];
                        if (!Object.keys(card.colChecklists).length) delete card.colChecklists;
                    }
                }
            });
            if (card.notes && !Object.keys(card.notes).length) delete card.notes;
            if (listChanged) {
                // Called from kanbanChanged itself: that goes on to do the rest.
                if (!this._kbInChange) this.kanbanChanged(true);
            } else if (changed && !this._kbInChange) this.autosave();
        },

        notesPanelShowing() {
            const panel = document.getElementById('reflection-panel');
            return this._leftPanelMode === 'notes' && this._notesTabActive && !!panel && panel.offsetParent !== null && getComputedStyle(panel).display !== 'none';
        },

        openKbCardNotes(cardId, opts) {
            const card = this.kbCard(cardId);
            if (!card) return;
            this.pullKbCardTabEdits();
            this.syncKanbanNotes();
            const tab = this.writeKbCardTab(card);
            if (!tab) return;
            this.autosave();
            this._activeNotesScope = 'chart';
            this.setActiveNotesTabId('chart', tab.id);
            if (!this.notesPanelShowing()) this.openNotesPanel();
            if (typeof this.renderNotesPanel === 'function') this.renderNotesPanel();
            const at = this.kbColIndex(card.column);
            setTimeout(() => {
                this.showEmbeddedEditor('chart', tab.id);
                this.renderNotesTabBar();
                const tryJump = (left) => {
                    const editor = this.notesEditor;
                    const ok = editor && editor._noteTabRef && editor._noteTabRef.tabId === tab.id;
                    if (!ok) { if (left > 0) setTimeout(() => tryJump(left - 1), 150); return; }
                    const heads = Array.from(editor.model.document.getRoot().getChildren()).filter(c => c.is('element', 'heading4'));
                    const target = heads[at];
                    if (!target) return;
                    // Only the card's current column is open; the other titles fold.
                    this.kbFoldAllBut(editor, target);
                    if (typeof this.jumpToNotesTitle === 'function') this.jumpToNotesTitle(editor, target);
                    const next = target.nextSibling;
                    if (next && next.is('element') && !/^heading[456]$/.test(next.name)) {
                        try { editor.model.change(w => w.setSelection(w.createPositionAt(next, 0))); } catch (e) { /* not a text block */ }
                    }
                    if (opts && opts.focus && !window.matchMedia('(pointer: coarse)').matches) {
                        try { editor.editing.view.focus(); } catch (e) { /* not on screen */ }
                    }
                };
                tryJump(15);
            }, 60);
        },

        // In the Kanban notes each card - its heading and everything under it,
        // up to the next card or column - is drawn as a box, its heading marked
        // as a card. On-screen classes only; nothing is saved.
        decorateNotesEditor(editor) {
            const ref = editor._noteTabRef || editor.config.get('noteTab');
            const isKb = !!(this.kanban && ref && ref.tabId === this.kanban.notesTabId);
            // The Gantt notes get the same boxes, one per subtask (gantt.js).
            const isGantt = !isKb && !!(this.gantt && ref && ref.tabId === this.gantt.notesTabId);
            const isMaster = isKb || isGantt;
            const isCard = !isMaster && !!(this.kanban && ref && ref.tabId === this.kanban.cardTabId);
            if (isCard) this.kbWireCardNotes(editor);
            if (!isMaster && !isCard && !editor._kbDecorated) return;
            const view = editor.editing.view;
            const root = view.document.getRoot();
            if (!root) return;
            const kids = Array.from(root.getChildren()).filter(c => c.is('element'));
            const CLS = ['kb-nc-head', 'kb-nc-body', 'kb-nc-end', 'kb-nc-item', 'kb-nc-card-item', 'kb-nc-title', 'kb-nc-row', 'kb-cl-box', 'kb-cl-first', 'kb-cl-last', 'kb-nc-link'];
            // Clicking an item's tick box ticks it on the card (once per editor).
            if (isMaster && !editor._kbTickWired) {
                editor._kbTickWired = true;
                const dom = editor.editing.view.getDomRoot();
                if (dom) dom.addEventListener('mousedown', (e) => {
                    const h = e.target && e.target.closest && e.target.closest('h6.kb-nc-item');
                    if (!h || e.clientX > h.getBoundingClientRect().left + 34) return;
                    // Which item: by its card heading above and its place under it.
                    let head = h.previousElementSibling;
                    let idx = 0;
                    while (head && head.tagName !== 'H5') { if (head.tagName === 'H6') idx++; head = head.previousElementSibling; }
                    if (!head) return;
                    const refNow = editor._noteTabRef || editor.config.get('noteTab');
                    if (this.gantt && refNow && refNow.tabId === this.gantt.notesTabId) {
                        // Gantt: the subtask by its heading (nth of that name), then the item.
                        const name = kbNorm(head.textContent);
                        const heads = Array.from(dom.querySelectorAll('h5')).filter(x => kbNorm(x.textContent) === name);
                        const nth = heads.indexOf(head);
                        const subs = this.ganttOrdered(true).filter(t => t.parent && kbNorm(this.ganttNoteLabel(t)) === name);
                        const task = subs[Math.max(0, nth)];
                        const gi = task ? task.checklist.filter(x => x.text.trim()) : [];
                        if (!gi[idx]) return;
                        e.preventDefault();
                        e.stopPropagation();
                        gi[idx].done = !gi[idx].done;
                        this.ganttChanged(true);
                        return;
                    }
                    const card = this.kbCards().find(c => this.kbNoteLabel(c) === kbNorm(head.textContent));
                    const items = card ? card.checklist.filter(x => x.text.trim()) : [];
                    if (!items[idx]) return;
                    e.preventDefault();
                    e.stopPropagation();
                    this.kbToggleItem(items[idx].id);
                }, true);
            }
            const plan = new Map();
            const tags = new Map();
            // Card headings in board order, by their text, to find each one's label.
            const byLabel = new Map();
            if (isKb) this.kanban.columns.forEach(col => this.kbNoteCards(col.id).forEach((c) => {
                const key = this.kbNoteLabel(c);
                if (!byLabel.has(key)) byLabel.set(key, []);
                byLabel.get(key).push(c);
            }));
            // Gantt: subtasks by their heading text, in chart order.
            const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const fmt = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${+m[3]} ${MON[+m[2] - 1]}` : ''; };
            if (isGantt && typeof this.ganttOrdered === 'function') this.ganttOrdered(true).filter(t => t.parent).forEach((t) => {
                const key = kbNorm(this.ganttNoteLabel(t));
                if (!byLabel.has(key)) byLabel.set(key, []);
                byLabel.get(key).push(t);
            });
            const textOf = (vel) => { let t = ''; for (const ch of vel.getChildren()) { if (ch.is('$text')) t += ch.data; else if (ch.is('element')) for (const g of ch.getChildren()) if (g.is('$text')) t += g.data; } return kbNorm(t); };
            if (isMaster) {
                let open = null;
                const close = () => { if (open && open.length) plan.get(open[open.length - 1]).push('kb-nc-end'); open = null; };
                kids.forEach((el) => {
                    if (el.name === 'h5') {
                        close(); plan.set(el, ['kb-nc-head']); open = [el];
                        // Its tag: the card's first label (in its colour), else "CARD".
                        const q = byLabel.get(textOf(el));
                        const item = q && q.shift();
                        if (isGantt) {
                            // A subtask's tag: its dates, in its bar's colour.
                            const color = item && typeof this.ganttColor === 'function' ? this.ganttColor(item) : '#3cb4dc';
                            const when = item ? (item.kind === 'milestone' ? `◆ ${fmt(item.start)}` : `${fmt(item.start)} - ${fmt(item.end)}`) : 'SUBTASK';
                            tags.set(el, { text: when, color, dark: darkText(color) });
                            return;
                        }
                        const card = item;
                        const l = card && card.labels.length ? this.kbLabel(card.labels[0]) : null;
                        tags.set(el, l ? { text: l.name.toUpperCase(), color: labelColor(l.color), dark: darkText(labelColor(l.color)) } : { text: 'CARD', color: labelColor('#4c9aff'), dark: true });
                        return;
                    }
                    if (el.name === 'h4') { close(); return; }
                    if (open) { plan.set(el, ['kb-nc-body'].concat(el.name === 'h6' ? ['kb-nc-item'] : [])); open.push(el); }
                });
                close();
            }
            if (isCard) {
                // The card's title, the rows' names, and a panel for each
                // checklist item with what's written under it.
                let list = [];
                let top = true; // above the columns: the card's own links
                const endList = () => { if (list.length) { plan.get(list[0]).push('kb-cl-first'); plan.get(list[list.length - 1]).push('kb-cl-last'); } list = []; };
                kids.forEach((el) => {
                    const mark = el.name === 'h5' ? textOf(el) : '';
                    if (mark.startsWith(ROW_MARK)) { endList(); plan.set(el, [mark.startsWith(TITLE_MARK) ? 'kb-nc-title' : 'kb-nc-row']); return; }
                    if (el.name === 'h4') { top = false; endList(); return; }
                    if (top && el.name === 'p' && textOf(el).startsWith('🔗')) { plan.set(el, ['kb-nc-link']); return; }
                    if (el.name === 'h6') endList(); // each item has its own panel
                    if (el.name === 'h6') plan.set(el, ['kb-nc-item', 'kb-nc-card-item', 'kb-cl-box']);
                    else if (list.length) plan.set(el, ['kb-cl-box']);
                    else return;
                    list.push(el);
                });
                endList();
            }
            view.change((writer) => {
                kids.forEach((el) => {
                    const want = plan.get(el) || [];
                    CLS.forEach((c) => {
                        const has = el.hasClass(c);
                        if (want.includes(c) && !has) writer.addClass(c, el);
                        else if (!want.includes(c) && has) writer.removeClass(c, el);
                    });
                    const tag = tags.get(el);
                    if (tag) {
                        if (el.getAttribute('data-kb-tag') !== tag.text) writer.setAttribute('data-kb-tag', tag.text, el);
                        writer.setStyle({ '--kb-tag-bg': tag.color, '--kb-tag-fg': tag.dark ? '#172b4d' : '#ffffff' }, el);
                    } else if (el.hasAttribute('data-kb-tag')) {
                        writer.removeAttribute('data-kb-tag', el);
                        writer.removeStyle(['--kb-tag-bg', '--kb-tag-fg'], el);
                    }
                });
            });
            editor._kbDecorated = isMaster || isCard;
        },

        kbWireCardNotes(editor) {
            if (editor._kbCardWired) return;
            editor._kbCardWired = true;
            const isCardNote = () => { const r = editor._noteTabRef || editor.config.get('noteTab'); return !!(r && this.kanban && r.tabId === this.kanban.cardTabId); };
            const dom = editor.editing.view.getDomRoot();
            // The card's links: a click opens the address, or copies a file's path.
            const linkAt = (e) => {
                const p = e.target && e.target.closest && e.target.closest('p.kb-nc-link');
                return p && isCardNote() && e.button === 0 ? p : null;
            };
            if (dom) dom.addEventListener('mousedown', (e) => { if (linkAt(e)) { e.preventDefault(); e.stopPropagation(); } }, true);
            if (dom) dom.addEventListener('click', (e) => {
                const p = linkAt(e);
                if (!p) return;
                e.preventDefault();
                e.stopPropagation();
                this.kbFindCardTabCard();
                const card = this._kbCardTabFor && this.kbCard(this._kbCardTabFor);
                const links = (card && card.links) || [];
                const text = kbNorm(p.textContent).replace(/^🔗\s*/, '');
                const l = links.find(x => [kbLinkText(x), kbNorm(x.label), kbNorm(x.url)].includes(text))
                    || links[Array.from(dom.querySelectorAll('p.kb-nc-link')).indexOf(p)];
                if (!l) return;
                const href = kbHref(l.url);
                if (href.startsWith('file:')) kbOpenLink(e, l.url, this);
                else window.open(href, '_blank', 'noopener');
            }, true);
            // A click on an item's box ticks it: which column, and which item in it.
            if (dom) dom.addEventListener('mousedown', (e) => {
                const h = e.target && e.target.closest && e.target.closest('h6.kb-nc-card-item');
                if (!h || !isCardNote() || e.clientX > h.getBoundingClientRect().left + 40) return;
                const all = Array.from(dom.children);
                let colAt = -1;
                let itemAt = -1;
                for (const x of all) {
                    if (x.tagName === 'H4') { colAt++; itemAt = -1; }
                    if (x.tagName === 'H6') itemAt++;
                    if (x === h) break;
                }
                e.preventDefault();
                e.stopPropagation();
                this.kbFindCardTabCard();
                this.pullKbCardTabEdits();
                const card = this._kbCardTabFor && this.kbCard(this._kbCardTabFor);
                const col = this.kanban.columns[colAt];
                const it = card && col && this.kbColItems(card, col.id).filter(x => x.text.trim())[itemAt];
                if (!it) return;
                it.done = !it.done;
                this.kanbanChanged();
            }, true);
            // A new line on an item is a line under it, in the same panel.
            editor.editing.view.document.on('enter', (evt, data) => {
                if (!isCardNote()) return;
                const sel = editor.model.document.selection;
                const pos = sel.getFirstPosition();
                const block = pos.parent;
                if (!sel.isCollapsed || !block.is('element', 'heading6')) return;
                data.preventDefault();
                evt.stop();
                if (block.isEmpty) {
                    // Enter on an empty item: the list ends, back to normal text.
                    editor.execute('paragraph');
                    return;
                }
                editor.model.change((writer) => {
                    const next = block.nextSibling;
                    const blank = next && next.is('element', 'paragraph') && (next.isEmpty || !Array.from(next.getChildren()).some(x => !x.is('$text') || x.data.replace(/ /g, ' ').trim()));
                    if (pos.isAtEnd && blank) {
                        // Its blank line is free: typing starts there.
                        writer.setSelection(next, 0);
                        return;
                    }
                    const line = writer.createElement('paragraph');
                    writer.insert(line, block, 'after');
                    if (!pos.isAtEnd) writer.move(writer.createRange(pos, writer.createPositionAt(block, 'end')), line, 0);
                    writer.setSelection(line, 0);
                });
                editor.editing.view.scrollToTheSelection();
            }, { priority: 'highest' });
            // Ctrl + Enter anywhere in an item's panel: a new item after it.
            editor.editing.view.document.on('keydown', (evt, data) => {
                if (data.keyCode !== 13 || !(data.ctrlKey || data.metaKey) || !isCardNote()) return;
                let b = editor.model.document.selection.getFirstPosition().parent;
                while (b && b.parent && !b.parent.is('rootElement')) b = b.parent;
                let item = b;
                while (item && !/^heading[456]$/.test(item.name)) item = item.previousSibling;
                if (!item || item.name !== 'heading6') return;
                data.preventDefault();
                evt.stop();
                let last = b;
                while (last.nextSibling && !/^heading[456]$/.test(last.nextSibling.name)) last = last.nextSibling;
                editor.model.change((writer) => {
                    const it = writer.createElement('heading6');
                    writer.insert(it, last, 'after');
                    writer.insertElement('paragraph', it, 'after');
                    writer.setSelection(it, 0);
                });
                editor.editing.view.scrollToTheSelection();
            }, { priority: 'highest' });
        },

        // Is the note being edited a card's?
        kbInCardNotes() {
            const t = this.getActiveNotesTarget && this.getActiveNotesTarget();
            return !!(t && t.scope === 'chart' && this.kanban && this.kanban.cardTabId && t.tabId === this.kanban.cardTabId);
        },

        // The selected lines become items of the card's checklist, or - when
        // they all already are - normal text again.
        kbToggleCardCheck() {
            const { editor } = this.getActiveNotesTarget();
            if (!editor) return;
            const blocks = Array.from(editor.model.document.selection.getSelectedBlocks());
            const top = blocks[0];
            let title = null;
            for (let b = top; b; b = b.parent && !b.parent.is('rootElement') ? b.parent : b.previousSibling) if (b.is('element', 'heading4')) { title = b; break; }
            if (!title) { this.showNotification('Put the cursor under a column\'s title first.'); return; }
            const all = blocks.every(b => b.is('element', 'heading6'));
            editor.model.change((writer) => {
                blocks.forEach((b) => {
                    if (b.is('element', 'heading4')) return;
                    ['listItemId', 'listType', 'listIndent', 'todoListChecked', 'noteExtraIndent'].forEach((a) => { if (b.hasAttribute(a)) writer.removeAttribute(a, b); });
                    if (all) { writer.removeAttribute('ganttDone', b); writer.rename(b, 'paragraph'); }
                    else if (!b.is('element', 'heading6')) writer.rename(b, 'heading6');
                });
                // Somewhere to type after the list.
                const last = blocks[blocks.length - 1];
                const after = last.nextSibling;
                if (!all && last.parent && last.parent.is('rootElement') && (!after || /^heading4$/.test(after.name))) writer.insertElement('paragraph', last, 'after');
            });
            editor.editing.view.focus();
        },

        // The notes' Card button: the line the cursor is on becomes a new card in
        // the board's leftmost column. In the Kanban notes the line goes (the
        // card's heading takes its place); elsewhere it stays, marked 📋.
        notesLineToCard() {
            const { editor, scope, tabId } = this.getActiveNotesTarget();
            if (!editor) return;
            const pos = editor.model.document.selection.getFirstPosition();
            const block = pos && pos.parent;
            let text = '';
            if (block) for (const ch of block.getChildren()) if (ch.is('$text')) text += ch.data;
            text = kbNorm(text).replace(/^📋\s*/, '');
            if (!text) { this.showNotification('Put the cursor on a line with some text first.'); return; }
            if (!this.kanban) this.newKanbanBoard(TEMPLATES.basic.columns);
            const first = this.kbRowCols(this.kbRows()[0].id)[0];
            const inMaster0 = scope === 'chart' && (tabId === this.kanban.notesTabId || tabId === this.kanban.cardTabId);
            // From another note: labelled with the Title the line is under.
            let labels = [];
            if (!inMaster0 && block) {
                let top = block;
                while (top.parent && !top.parent.is('rootElement')) top = top.parent;
                for (let b = top.previousSibling; b; b = b.previousSibling) {
                    if (b.is('element', 'heading4')) {
                        let t = '';
                        for (const ch of b.getChildren()) if (ch.is('$text')) t += ch.data;
                        const l = this.kbLabelByName(kbNorm(t), true);
                        if (l) labels = [l.id];
                        break;
                    }
                }
            }
            const card = this.kbNewCard({ title: text, column: first.id, labels });
            this.kanban.cards.push(card);
            const inMaster = scope === 'chart' && tabId === this.kanban.notesTabId;
            editor.model.change((writer) => {
                if (inMaster) writer.remove(block);
                else writer.insertText('📋 ', writer.createPositionAt(block, 0));
            });
            this.kanbanChanged();
            this.showNotification(`Added card "${text}" to "${first.name}".`);
        },

        // A checklist item ticked / unticked from the notes or the flowchart.
        kbToggleItem(itemId) {
            for (const c of this.kbCards()) {
                const it = c.checklist.find(x => x.id === itemId);
                if (it) { it.done = !it.done; this.kanbanChanged(); return true; }
            }
            return false;
        },

        // Draws a tick box on the checklist items' nodes in the flowchart.
        paintKanbanItemBoxes() {
            if (typeof d3 === 'undefined' || !this.kanban) return;
            const app = this;
            d3.selectAll('#flowchart g.node').each(function (d) {
                const id = d && d.data && d.data._kanban;
                if (!id || !id.startsWith('ck:')) return;
                const item = app.kbCards().reduce((f, c) => f || c.checklist.find(x => `ck:${x.id}` === id), null);
                if (!item) return;
                const rect = this.querySelector('rect');
                if (!rect || this.querySelector('.kb-ck-box')) return;
                // The box sits right beside the text, the two centred together.
                const textEl = this.querySelector(':scope > text');
                let half = 0;
                try { half = textEl ? textEl.getBBox().width / 2 : 0; } catch (e) { /* not on screen */ }
                const left = +rect.getAttribute('x') + 6;
                const shift = Math.max(10, left + 20 + half);
                const x = half ? Math.max(left, Math.min(10, shift) - half - 20) : left;
                const y = +rect.getAttribute('y') + (+rect.getAttribute('height')) / 2 - 7;
                const g = d3.select(this).append('g').attr('class', 'kb-ck-box').style('cursor', 'pointer');
                g.append('title').text(item.done ? 'Done - untick' : 'Tick off');
                g.append('rect').attr('x', x).attr('y', y).attr('width', 14).attr('height', 14).attr('rx', 3)
                    .attr('fill', item.done ? '#2e9e5b' : 'rgba(0,0,0,0.25)').attr('stroke', '#fff').attr('stroke-width', 1.4);
                if (item.done) g.append('path').attr('d', `M${x + 3},${y + 7.5} l3,3 l5,-6`).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 2).attr('stroke-linecap', 'round');
                g.on('mousedown', ev => ev.stopPropagation()).on('dblclick', ev => ev.stopPropagation())
                    .on('click', (ev) => { ev.stopPropagation(); app.kbToggleItem(id.slice(3)); });
                d3.select(this).select('text').attr('transform', `translate(${half ? Math.max(0, x + 20 + half) : 10},0)`).style('text-decoration', item.done ? 'line-through' : null);
            });
        },

        kanbanNotesOpen() {
            const k = this.kanban;
            if (!k || !k.notesTabId || k.notesRetired) return false;
            const panel = document.getElementById('reflection-panel');
            const panelOpen = this._leftPanelMode === 'notes' && this._notesTabActive &&
                !!panel && panel.offsetParent !== null && getComputedStyle(panel).display !== 'none';
            return panelOpen && this._activeNotesScope === 'chart' && this.getActiveNotesTabId('chart') === k.notesTabId;
        },

        // The board's notes: a card's own (the one asked for, else the selected
        // one, else the last one shown, else the first).
        openKanbanNotes(cardId) {
            if (!this.kanban) return;
            const id = [cardId, this._kbSelected, this._kbCardTabFor].find(x => x && this.kbCard(x)) || (this.kbCards()[0] || {}).id;
            if (!id) { this.showNotification('Add a card first - each card has its own notes.'); return; }
            this.openKbCardNotes(id, { focus: true });
        },

        // The old "Kanban notes" tab (every card in one note) is put away: what
        // was under each card and checklist item moves to the card's own notes.
        // Anything else written there stays in a note called "Kanban notes (old)".
        kbRetireNotes() {
            const k = this.kanban;
            if (!k || k.notesRetired) return;
            const tab = k.notesTabId ? (this.notesTabs || []).find(x => x.id === k.notesTabId) : null;
            if (tab) {
                // Writes the text under each card into the card.
                this.syncKanbanNotes();
                const doc = new DOMParser().parseFromString(`<body>${tab.content || ''}</body>`, 'text/html');
                const byText = new Map();
                Object.entries(k.noteTitles || {}).forEach(([id, text]) => {
                    const key = `${id.startsWith('col:') ? 'H4' : id.startsWith('ck:') ? 'H6' : 'H5'}|${kbNorm(text)}`;
                    if (!byText.has(key)) byText.set(key, []);
                    byText.get(key).push(id);
                });
                let cur = null;
                const left = [];
                const itemText = new Map();
                Array.from(doc.body.childNodes).forEach((n) => {
                    const isHead = n.nodeType === 1 && /^H[456]$/.test(n.tagName);
                    const q = isHead ? byText.get(`${n.tagName}|${kbNorm(n.textContent)}`) : null;
                    if (q && q.length) { cur = q.shift(); return; }
                    if (cur && cur.startsWith('ck:')) { if (!itemText.has(cur)) itemText.set(cur, []); itemText.get(cur).push(n); return; }
                    if (cur && !cur.startsWith('col:') && !isHead) return; // a card's text: already in the card
                    if (/^Notes for the Kanban board:/.test((n.textContent || '').trim())) return;
                    left.push(n);
                });
                itemText.forEach((bs, id) => {
                    if (!blocksHaveText(bs)) return;
                    k.cards.forEach(c => c.checklist.forEach((it) => { if (`ck:${it.id}` === id && !it.note) it.note = blocksHtml(bs); }));
                });
                if (blocksHaveText(left)) { tab.name = 'Kanban notes (old)'; tab.content = blocksHtml(left); }
                else this.notesTabs = this.notesTabs.filter(x => x !== tab);
                if (Array.isArray(this.notesPinned)) this.notesPinned = this.notesPinned.filter(x => x !== `chart:${k.notesTabId}`);
                if (this.activeNotesTabId === k.notesTabId) {
                    const next = this.notesTabs.find(x => x.id !== k.notesTabId && x.id !== k.cardTabId) || this.notesTabs[0];
                    if (next) this.activeNotesTabId = next.id;
                }
            }
            k.notesRetired = true;
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
                // A card: only its column's Title stays open.
                if (card) {
                    for (let i = all.indexOf(target) - 1; i >= 0; i--) {
                        if (all[i].is('element', 'heading4')) { this.kbFoldAllBut(editor, all[i]); break; }
                    }
                }
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
            const tab = k && k.notesTabId && !k.notesRetired ? this.kanbanNotesTab(false) : null;
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
            const title = `📋 ${item ? item.title : 'Project'}`;
            if (!branch) {
                branch = { name: title, color: '#0c66e4', _kanban: 'root', children: [] };
                if (!Array.isArray(top.children)) top.children = [];
                const last = top.children[top.children.length - 1];
                const at = last && this.isPlaceholderNodeData(last) ? top.children.length - 1 : top.children.length;
                top.children.splice(at, 0, branch);
            }
            branch.name = title;
            if (this._kbPendingNodes) { branch.children = (branch.children || []).concat(this._kbPendingNodes); this._kbPendingNodes = null; }
            const DONE_GREEN = '#2e9e5b';
            const cardNode = (card) => {
                const done = this.kbIsDone(card);
                return {
                    name: `${card.blocked && !done ? '⛔ ' : ''}${card.title}${done ? ' ✓' : ''} ${CARD_EMOJI}`,
                    color: done ? DONE_GREEN : CARD_COLOR
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
                const field = parentNode._critOn ? '_critSaved' : parentNode._kbColView ? '_kbColSaved' : 'children';
                const kids = Array.isArray(parentNode[field]) ? parentNode[field] : [];
                const existing = pool || new Map(kids.filter(c => c && c._kanban && c._kanban !== 'root').map(c => [c._kanban, c]));
                const ids = new Set(wanted.map(w => w.id));
                const nodes = wanted.map((w) => {
                    const n = existing.get(w.id) || { _kanban: w.id };
                    n.name = w.name;
                    n.color = kbNodeColor(w.name, w.color);
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
            const colPool = new Map();
            const collect = (n) => [].concat(n._critOn ? (n._critSaved || []) : n._kbColView ? (n._kbColSaved || []) : (n.children || [])).forEach((c) => {
                if (!c) return;
                if (c._kanban && c._kanban.startsWith('col:')) colPool.set(c._kanban, c);
                else if (c._kanban && c._kanban !== 'root' && !c._kanban.startsWith('row:') && !c._kanban.startsWith('ck:')) pool.set(c._kanban, c);
                collect(c);
            });
            collect(branch);
            const colNode = (col) => {
                const n = k.cards.filter(c => c.column === col.id).length;
                const over = col.wip && n > col.wip;
                const last = this.kbColIsDone(col);
                return { id: `col:${col.id}`, name: `${col.name}${last ? ' ✓' : ''}`, color: over ? '#c9372c' : (last ? DONE_GREEN : '#0c66e4') };
            };
            // Several rows (or a named one): row nodes, each the parent of its columns.
            let colNodes;
            if (this.kbMultiRow()) {
                const rowNodes = reconcile(branch, k.rows.map(r => ({ id: `row:${r.id}`, name: r.name || 'Row', color: '#5e6c84' })));
                colNodes = [];
                k.rows.forEach((r, ri) => {
                    const made = reconcile(rowNodes[ri], this.kbRowCols(r.id).map(colNode), colPool);
                    colNodes.push(...made);
                    if (typeof this.ensureRightmostPlaceholderNodes === 'function' && !rowNodes[ri]._critOn) this.ensureRightmostPlaceholderNodes(rowNodes[ri]);
                });
            } else {
                colNodes = reconcile(branch, k.columns.map(colNode), colPool);
            }
            const realKids = n => (n._critOn ? (n._critSaved || []) : n._kbColView ? (n._kbColSaved || []) : (n.children || []));
            const setKids = (n, list) => { if (n._critOn) n._critSaved = list; else if (n._kbColView) n._kbColSaved = list; else n.children = list; };
            // Card nodes sitting under hand-made nodes inside a column (a parent
            // added to a card) stay where they are while the card is in that column.
            // Every node in it gets a lasting id, so a card can find its way back
            // into the structure it sat in.
            if (typeof FlowchartMerge !== 'undefined') FlowchartMerge.ensureIds(this.rootData);
            const isCardNode = c => c && c._kanban && !c._kanban.startsWith('ck:') && !c._kanban.startsWith('col:') && !c._kanban.startsWith('row:') && c._kanban !== 'root';
            const nestedIn = (colNode) => {
                const out = new Map();
                // Hand-made nodes on the way down to a card are its structure
                // ("groups"): marked, so they stay groups when the card moves away.
                const walk = (n, path) => realKids(n).forEach((c) => {
                    if (!c) return;
                    if (isCardNode(c)) { out.set(c._kanban, { node: c, parent: n }); path.forEach((g) => { g._kbGroup = true; }); return; }
                    if (!c._kanban) walk(c, path.concat(c));
                });
                realKids(colNode).forEach((c) => { if (c && !c._kanban) walk(c, [c]); });
                return out;
            };
            const findIn = (n, id) => {
                for (const c of realKids(n)) {
                    if (!c) continue;
                    if (c._id === id) return c;
                    if (!c._kanban || c._kanban.startsWith('ck:')) { const f = findIn(c, id); if (f) return f; }
                }
                return null;
            };
            const detach = (node) => {
                const w = (n) => {
                    const kids = realKids(n);
                    if (kids.includes(node)) { setKids(n, kids.filter(x => x !== node)); return true; }
                    return kids.some(c => c && w(c));
                };
                w(branch);
            };
            k.columns.forEach((col, i) => {
                const cards = k.cards.filter(c => c.column === col.id);
                const nested = nestedIn(colNodes[i]);
                // Nested cards that moved to another column leave their group -
                // remembering it, to go back into it if the card comes back.
                nested.forEach(({ node, parent }, id) => {
                    const c = this.kbCard(id);
                    if (c && c.column === col.id) return;
                    if (!node._colParent || typeof node._colParent !== 'object') node._colParent = {};
                    if (parent && parent._id) node._colParent[col.id] = parent._id;
                    setKids(parent, realKids(parent).filter(x => x !== node));
                    nested.delete(id);
                });
                // Cards coming back to a column they sat in a group in go back there.
                cards.forEach((c) => {
                    if (nested.has(c.id)) return;
                    const n = pool.get(c.id);
                    const pid = n && n._colParent && n._colParent[col.id];
                    if (!pid) return;
                    const grp = findIn(colNodes[i], pid);
                    delete n._colParent[col.id];
                    if (!grp) return;
                    detach(n);
                    setKids(grp, realKids(grp).concat(n));
                    nested.set(c.id, { node: n, parent: grp });
                });
                const direct = cards.filter(c => !(nested.has(c.id) && nested.get(c.id).node));
                realKids(colNodes[i]).forEach((x) => { if (isCardNode(x) && x._colParent) delete x._colParent[col.id]; });
                const directNodes = reconcile(colNodes[i], direct.map(c => Object.assign({ id: c.id }, cardNode(c))), pool);
                const nodeOf = new Map(direct.map((c, j) => [c.id, directNodes[j]]));
                cards.forEach((c) => {
                    if (nodeOf.has(c.id)) return;
                    const n = nested.get(c.id).node;
                    const v = cardNode(c);
                    n.name = v.name;
                    n.color = kbNodeColor(v.name, v.color);
                    nodeOf.set(c.id, n);
                });
                cards.forEach((card) => {
                    const n = nodeOf.get(card.id);
                    // What's built under a card belongs to the column it's in: moving
                    // it puts that away and brings out the chart for the new column
                    // (empty the first time; the old one again when it moves back).
                    if (!n._kbColView) {
                        if (n._kbCol && n._kbCol !== card.column) {
                            const kids = realKids(n);
                            if (!n._colTrees || typeof n._colTrees !== 'object') n._colTrees = {};
                            if (kids.some(c => c && !this.isPlaceholderNodeData(c))) n._colTrees[n._kbCol] = kids; else delete n._colTrees[n._kbCol];
                            const back = n._colTrees[card.column] || [];
                            delete n._colTrees[card.column];
                            setKids(n, back);
                        }
                        n._kbCol = card.column;
                    }
                    reconcile(n, card.checklist.filter(it => it.text.trim()).map(it => Object.assign({ id: `ck:${it.id}` }, itemNode(it, card))));
                });
                if (typeof this.ensureRightmostPlaceholderNodes === 'function' && !colNodes[i]._critOn) this.ensureRightmostPlaceholderNodes(colNodes[i]);
            });
            if (typeof this.ensureRightmostPlaceholderNodes === 'function') this.ensureRightmostPlaceholderNodes(branch);
            this.kbFlowRender();
        },

        // ----- Edits made in the flowchart's Kanban branch go to the board -----
        // A node added under a card becomes a checklist item, one added under a
        // column a new card (its own children its checklist); renaming a card,
        // a checklist item or a column renames it on the board. The board then
        // redraws the branch, the notes and the cards as usual.
        pullKanbanFlowEdits() {
            const k = this.kanban;
            const branch = this.findKanbanFlowRoot();
            if (!k || !branch || this._kbPulling) return false;
            const strip = n => String(n || '').replace(/(\s*\(Simplify\?\))+\s*$/, '').trim();
            const real = n => (n._critOn ? (n._critSaved || []) : n._kbColView ? (n._kbColSaved || []) : (n.children || []));
            // A hand-made node holding cards (a parent added to cards) is a group, not a new card.
            const holdsCards = (n) => !!n._kbGroup || real(n).some(c => c && ((c._kanban && !c._kanban.startsWith('ck:')) || (!c._kanban && holdsCards(c))));
            const isNew = n => n && !n._kanban && !n._critId && !this.isPlaceholderNodeData(n) && strip(n.name);
            let changed = false;
            const pullChecklist = (card, node) => {
                const kids = real(node);
                kids.forEach((c) => {
                    if (!c) return;
                    if (c._kanban && c._kanban.startsWith('ck:')) {
                        const item = card.checklist.find(x => `ck:${x.id}` === c._kanban);
                        const text = strip(c.name).replace(/^✓\s*/, '');
                        if (item && text && text !== item.text) { item.text = text; changed = true; }
                    } else if (isNew(c)) {
                        const item = { id: uid('ck'), text: strip(c.name).replace(/^✓\s*/, ''), done: false };
                        card.checklist.push(item);
                        c._kanban = `ck:${item.id}`;
                        changed = true;
                    }
                });
            };
            const colNodesOf = (n) => real(n).filter(c => c && c._kanban && c._kanban.startsWith('col:'));
            const colNodeList = [];
            real(branch).forEach((n) => {
                if (!n || !n._kanban) return;
                if (n._kanban.startsWith('row:')) {
                    const row = (k.rows || []).find(r => `row:${r.id}` === n._kanban);
                    const rname = strip(n.name);
                    if (row && rname && rname !== (row.name || 'Row')) { row.name = rname; changed = true; }
                    colNodeList.push(...colNodesOf(n));
                } else if (n._kanban.startsWith('col:')) {
                    colNodeList.push(n);
                }
            });
            colNodeList.forEach((colNode) => {
                const col = this.kbColumn(colNode._kanban.slice(4));
                if (!col) return;
                const cname = strip(colNode.name).replace(/\s*✓$/, '');
                if (cname && cname !== col.name) { col.name = cname; changed = true; }
                const inCol = [];
                const gather = (n) => real(n).forEach((c) => {
                    if (!c) return;
                    if (!c._kanban && holdsCards(c)) { gather(c); return; }
                    inCol.push(c);
                });
                gather(colNode);
                inCol.forEach((cardNode) => {
                    if (!cardNode) return;
                    let card = cardNode._kanban ? this.kbCard(cardNode._kanban) : null;
                    if (!card && isNew(cardNode)) {
                        card = this.kbNewCard({ title: strip(cardNode.name), column: col.id });
                        k.cards.push(card);
                        cardNode._kanban = card.id;
                        changed = true;
                    } else if (card) {
                        let t = strip(cardNode.name).replace(/(\s*🃏)+\s*$/u, '').replace(/^⛔\s*/, '').replace(/\s*✓$/, '');
                        // (older node names ended with the assignee)
                        if (card.assignee && t === `${card.title} (${card.assignee})`) t = t.slice(0, -(card.assignee.length + 3));
                        t = t.trim();
                        if (t && t !== card.title) { card.title = t; changed = true; }
                    }
                    if (card) pullChecklist(card, cardNode);
                });
            });
            if (changed) {
                this._kbPulling = true;
                try { this.kanbanChanged(); } finally { this._kbPulling = false; }
            }
            return changed;
        },

        // ----- A card node's column history (like criteria mode) -----
        // 🕘 on a card node: its children are put aside and every column of its
        // row takes their place, each with what was built under the card while
        // it was in that column (the current column's being what's there now).
        // Edit any of them; 🕘 again puts them back and remembers the changes.
        toggleKbColView(host) {
            const card = host && this.kbCard(host._kanban);
            if (!card) return;
            if (this.nodeBeingEdited && typeof this.hideNodeEditPopup === 'function') this.hideNodeEditPopup(true);
            this.pushUndo();
            if (host._kbColView) this.kbColViewOff(host);
            else {
                const col = this.kbColumn(card.column);
                const cols = col ? this.kbRowCols(col.row) : [];
                if (!host._colTrees || typeof host._colTrees !== 'object') host._colTrees = {};
                host._kbColSaved = Array.isArray(host.children) ? host.children : [];
                host.children = cols.map((c) => {
                    const kids = c.id === card.column ? host._kbColSaved : (Array.isArray(host._colTrees[c.id]) ? host._colTrees[c.id] : (host._colTrees[c.id] = []));
                    return { name: c.name + (c.id === card.column ? ' (now)' : ''), color: c.id === card.column ? '#4c9aff' : '#5e6c84', _colViewId: c.id, children: kids };
                });
                host._kbColView = true;
                host._collapsed = false;
            }
            this.renderFlowchart(this.rootData);
            this.autosave();
            const d = d3.select('#flowchart').selectAll('g.node').data().find(x => x && x.data === host);
            if (d) { this.selectNode(d); this.refreshRadialButtons(); }
        },

        kbColViewWriteBack(host) {
            const card = this.kbCard(host._kanban);
            if (!host._kbColView || !card) return;
            if (!host._colTrees || typeof host._colTrees !== 'object') host._colTrees = {};
            (host.children || []).forEach((cn) => {
                if (!cn || !cn._colViewId) return;
                const kids = Array.isArray(cn.children) ? cn.children : [];
                if (cn._colViewId === card.column) host._kbColSaved = kids;
                else {
                    if (kids.some(c => c && !this.isPlaceholderNodeData(c))) host._colTrees[cn._colViewId] = kids; else delete host._colTrees[cn._colViewId];
                    // Checklist items renamed there are renamed on the card too.
                    const list = card.colChecklists && card.colChecklists[cn._colViewId];
                    if (list) kids.forEach((x) => {
                        const it = x && x._kanban && x._kanban.startsWith('ck:') && list.find(i => `ck:${i.id}` === x._kanban);
                        const t = it && String(x.name || '').replace(/(\s*\(Simplify\?\))+\s*$/, '').replace(/^✓\s*/, '').trim();
                        if (it && t) it.text = t;
                    });
                }
            });
        },

        kbColViewOff(host) {
            this.kbColViewWriteBack(host);
            host.children = Array.isArray(host._kbColSaved) ? host._kbColSaved : [];
            delete host._kbColSaved;
            delete host._kbColView;
        },

        kbColViewHosts() {
            const out = [];
            const walk = (n) => { if (!n) return; if (n._kbColView) out.push(n); (n.children || []).forEach(walk); };
            walk(this.findKanbanFlowRoot());
            return out;
        },

        // ----- Links on nodes -----
        // Any node can carry links (web addresses or file paths). A Kanban card's
        // node shows and edits the card's own links, so the two stay the same.
        nodeLinksOf(data) {
            const card = data && data._kanban && this.kbCard(data._kanban);
            if (card) return card.links || [];
            return Array.isArray(data && data._links) ? data._links : [];
        },

        setNodeLinks(data, links) {
            const card = data && data._kanban && this.kbCard(data._kanban);
            if (card) { card.links = links; this.kanbanChanged(); return; }
            this.pushUndo();
            if (links.length) data._links = links; else delete data._links;
            this.renderFlowchart(this.rootData);
            this.autosave();
        },

        nodeLinkButton(d) {
            if (!d || !d.data || this.isPlaceholderNodeData(d.data) || d.data._critId || d.data._colViewId) return null;
            const n = this.nodeLinksOf(d.data).length;
            return { label: '🔗', title: n ? `Links and files (${n})` : 'Links and files', activate: () => this.openNodeLinks(d.data) };
        },

        openNodeLinks(data) {
            const links = this.nodeLinksOf(data).map(l => Object.assign({}, l));
            const p = this.kbPopup(`🔗 ${String(data.name || '').replace(/(\s*\(Simplify\?\))+\s*$/, '') || 'Links'}`);
            const box = el('div', { class: 'kb-links' });
            const draw = () => {
                box.innerHTML = '';
                if (!links.length) box.append(el('p', { class: 'cs-muted cs-small', text: 'No links yet - add a web address or a file path.' }));
                links.forEach((l, i) => {
                    box.append(el('div', { class: 'kb-ck-item' },
                        el('a', { class: 'kb-link-a', href: kbHref(l.url), target: '_blank', rel: 'noopener', text: l.label || l.url, title: l.url, onclick: (e) => kbOpenLink(e, l.url, this) }),
                        el('button', { class: 'cs-btn kb-ck-del', type: 'button', text: '✕', title: 'Remove', onclick: () => { links.splice(i, 1); draw(); } })));
                });
                const url = el('input', { class: 'cs-input', type: 'text', placeholder: 'https://... or C:\\folder\\file.pdf' });
                const label = el('input', { class: 'cs-input', type: 'text', placeholder: 'Name (optional)' });
                const add = () => { if (!url.value.trim()) return; links.push({ label: label.value.trim(), url: url.value.trim() }); draw(); };
                [url, label].forEach(x => x.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }));
                box.append(el('div', { class: 'cs-row' }, url, label, el('button', { class: 'cs-btn', type: 'button', text: '+ Link', onclick: add })));
                setTimeout(() => url.focus(), 0);
            };
            draw();
            const card = data._kanban && this.kbCard(data._kanban);
            p.body.append(box, card ? el('p', { class: 'cs-muted cs-small', text: `These are the card's links - the same on the board.` }) : null);
            p.footer.append(
                el('button', { class: 'cs-btn', type: 'button', text: 'Cancel', onclick: p.close }),
                el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Save', onclick: () => { p.close(); this.setNodeLinks(data, links); } }));
        },

        // A small 🔗 on nodes with links (click it to see them).
        paintNodeLinkBadges() {
            if (typeof d3 === 'undefined') return;
            const app = this;
            d3.selectAll('#flowchart g.node').each(function (d) {
                const old = this.querySelector('.node-link-badge');
                if (old) old.remove();
                if (!d || !d.data) return;
                const n = app.nodeLinksOf(d.data).length;
                if (!n) return;
                const rect = this.querySelector('rect');
                if (!rect) return;
                const x = +rect.getAttribute('x') + (+rect.getAttribute('width')) - 4;
                const y = +rect.getAttribute('y') + 4;
                const g = d3.select(this).append('g').attr('class', 'node-link-badge').style('cursor', 'pointer');
                g.append('title').text(app.nodeLinksOf(d.data).map(l => l.label || l.url).join('\n'));
                g.append('circle').attr('cx', x).attr('cy', y).attr('r', 8).attr('fill', '#2b3343').attr('stroke', 'rgba(255,255,255,0.3)');
                g.append('text').attr('x', x).attr('y', y + 3.5).attr('text-anchor', 'middle').style('font-size', '9px').text('🔗');
                g.on('mousedown', ev => ev.stopPropagation()).on('click', (ev) => { ev.stopPropagation(); app.openNodeLinks(d.data); });
            });
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
                // Selected the usual way, so it gets the selection outline too.
                if (typeof this.selectNode === 'function') this.selectNode(d); else this.selectedNode = d;
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
            const rowName = (c) => { const r = k.rows.find(x => x.id === c.row); return r && this.kbMultiRow() ? `${r.name || 'Row'} › ` : ''; };
            const column = el('select', { class: 'cs-input' }, ...k.columns.map(c => el('option', { value: c.id, text: rowName(c) + c.name })));
            column.value = card.column;
            const people = el('datalist', { id: 'kb-people-list' }, ...this.kbAssignees().map(n => el('option', { value: n })));
            const who = el('input', { class: 'cs-input', type: 'text', value: card.assignee, placeholder: 'Who is doing it', list: 'kb-people-list' });
            const due = el('input', { class: 'cs-input', type: 'date', value: card.due });
            const blocked = el('input', { type: 'checkbox', checked: card.blocked });
            const reason = el('input', { class: 'cs-input', type: 'text', value: card.blockReason, placeholder: 'Waiting on...' });
            const issuer = el('input', { class: 'cs-input', type: 'text', value: card.issuer || '', placeholder: 'Optional - who asked for it', list: 'kb-people-list' });
            const purpose = el('textarea', { class: 'cs-input kb-desc', rows: '2', placeholder: 'Optional - what it is for' });
            purpose.value = card.purpose || '';
            const cats = el('datalist', { id: 'kb-cat-list' }, ...this.kbCategories().map(n => el('option', { value: n })));
            const category = el('input', { class: 'cs-input', type: 'text', value: card.category || '', placeholder: 'Pick one, or type a new one', list: 'kb-cat-list' });
            // Links: web addresses or file paths (shown as links in the card's notes).
            const links = (card.links || []).map(l => Object.assign({}, l));
            const linkBox = el('div', { class: 'kb-links' });
            const drawLinks = () => {
                linkBox.innerHTML = '';
                links.forEach((l, i) => {
                    linkBox.append(el('div', { class: 'kb-ck-item' },
                        (() => {
                            const nm = el('input', { class: 'cs-input', type: 'text', value: l.label, placeholder: 'Name (optional)' });
                            nm.addEventListener('input', () => { l.label = nm.value.trim(); });
                            return nm;
                        })(),
                        el('a', { class: 'kb-link-a', href: kbHref(l.url), target: '_blank', rel: 'noopener', text: l.url, title: l.url, onclick: (e) => kbOpenLink(e, l.url, this) }),
                        el('button', { class: 'cs-btn kb-ck-del', type: 'button', text: '✕', title: 'Remove', onclick: () => { links.splice(i, 1); drawLinks(); } })));
                });
                const url = el('input', { class: 'cs-input', type: 'text', placeholder: 'https://... or C:\\folder\\file.pdf' });
                const label = el('input', { class: 'cs-input', type: 'text', placeholder: 'Name (optional)' });
                const add = () => { if (!url.value.trim()) return; links.push({ label: label.value.trim(), url: url.value.trim() }); drawLinks(); };
                [url, label].forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }));
                linkBox.append(el('div', { class: 'cs-row' }, url, label, el('button', { class: 'cs-btn', type: 'button', text: '+ Link', onclick: add })));
            };
            drawLinks();

            // Labels: click to toggle; type a new one to add it.
            const chosen = new Set(card.labels);
            const chips = el('div', { class: 'kb-label-pick' });
            const drawChips = () => {
                chips.innerHTML = '';
                k.labels.forEach((l) => {
                    chips.append(el('button', { type: 'button', class: 'kb-chip kb-chip-btn' + (chosen.has(l.id) ? ' on' : ''), style: this.kbChipStyle(l), text: (chosen.has(l.id) ? '✓ ' : '') + l.name,
                        onclick: () => { if (chosen.has(l.id)) chosen.delete(l.id); else chosen.add(l.id); drawChips(); } }),
                        el('button', { type: 'button', class: 'kb-chip-x', text: '✎', title: `Rename the label "${l.name}"`,
                            onclick: async () => {
                                const v = await this.showNameDialog('Rename label', l.name, { plain: true });
                                if (v && this.kbRenameLabel(l.id, v)) drawChips();
                            } }),
                        el('button', { type: 'button', class: 'kb-chip-x', text: '✕', title: `Delete the label "${l.name}" from the board`,
                            onclick: async () => { if (await this.kbDeleteLabel(l.id)) { chosen.delete(l.id); drawChips(); } } }));
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
                    const typed = add.value.trim();
                    add.value = '';
                    list.push({ id: uid('ck'), text: typed, done: false });
                    drawList();
                    const again = ckBox.querySelector('input[placeholder^="+ Add"]');
                    if (again) again.focus();
                });
                add.addEventListener('blur', () => {
                    const typed = add.value.trim();
                    add.value = '';
                    if (!typed) return;
                    list.push({ id: uid('ck'), text: typed, done: false });
                    afterClick(drawList);
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
                el('div', { class: 'kb-two' }, row('Issued by', issuer), row('Category', category, cats)),
                row('Purpose', purpose),
                el('div', null, el('label', { class: 'cs-label', text: 'Links and files' }), linkBox),
                el('div', null, el('label', { class: 'cs-label', text: 'Labels' }), chips, el('div', { class: 'cs-row' }, newLabel)),
                el('div', null, el('label', { class: 'cs-label', text: 'Checklist' }), ckBox),
                el('p', { class: 'cs-muted cs-small kb-facts', text: facts.join(' · ') }));

            const save = () => {
                card.title = title.value.trim() || card.title;
                card.desc = desc.value;
                card.assignee = who.value.trim();
                card.due = due.value;
                card.blocked = blocked.checked;
                card.blockReason = reason.value.trim();
                card.issuer = issuer.value.trim();
                card.purpose = purpose.value.trim();
                card.category = category.value.trim();
                card.links = links;
                card.labels = k.labels.filter(l => chosen.has(l.id)).map(l => l.id);
                card.checklist = list.filter(c => c.text.trim());
                p.close();
                if (column.value !== card.column) this.kbMoveCard(card.id, column.value, null);
                else this.kanbanChanged();
            };
            title.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
            p.footer.append(
                el('button', { class: 'cs-btn kb-danger', type: 'button', text: '🗑 Delete', onclick: () => { p.close(); this._kbSelected = card.id; this.deleteKanbanSelected(); } }),
                el('button', { class: 'cs-btn', type: 'button', text: '🗄 Archive', title: 'Take it off the board; everything is kept', onclick: () => { save(); this.archiveKanbanCard(card.id); } }),
                el('span', { class: 'kb-spacer' }),
                el('button', { class: 'cs-btn', type: 'button', text: '🌳', title: 'Show this card in the flowchart', onclick: () => { save(); this.showKanbanCardInFlowchart(card.id); } }),
                el('button', { class: 'cs-btn', type: 'button', text: '📝 Notes', title: 'Save, then open the notes for this card', onclick: () => { save(); this.openKbCardNotes(card.id, { focus: true }); } }),
                el('button', { class: 'cs-btn', type: 'button', text: 'Cancel', onclick: p.close }),
                el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Save', onclick: save }));
            this.renderKanbanBoard(this.kbScrollState());
            setTimeout(() => title.focus(), 30);
        },

        addKanbanColumn(rowId) {
            const k = this.kanban;
            const row = rowId || (this.kbRows()[0] || {}).id;
            const col = { id: uid('kc'), row, name: 'New column', wip: 0, policy: '' };
            // Before the row's "done", so done stays last.
            const rowCols = this.kbRowCols(row);
            const anchor = rowCols.length > 1 ? rowCols[rowCols.length - 1] : null;
            if (anchor) k.columns.splice(k.columns.indexOf(anchor), 0, col);
            else k.columns.splice(rowCols.length ? k.columns.indexOf(rowCols[0]) + 1 : k.columns.length, 0, col);
            this.kanbanChanged();
            this.openKanbanColumn(col.id);
        },

        async addKanbanRow() {
            const k = this.kanban;
            const name = await this.showNameDialog('Name the new row', '', { plain: true, placeholder: 'e.g. Manufacturing' });
            if (!name) return;
            // Name the first row too, so both have a heading.
            if (k.rows.length === 1 && !k.rows[0].name) {
                const first = await this.showNameDialog('Name the existing row', 'Main', { plain: true });
                k.rows[0].name = first || 'Main';
            }
            const row = { id: uid('kr'), name };
            k.rows.push(row);
            TEMPLATES.basic.columns.forEach(([cn, wip, policy]) => k.columns.push({ id: uid('kc'), row: row.id, name: cn, wip: wip || 0, policy: policy || '' }));
            this.kanbanChanged();
            this.showNotification(`Added row "${name}" - ⋯ on its columns renames them, + adds more.`, 4000);
        },

        openKanbanRow(rowId) {
            const k = this.kanban;
            const row = k.rows.find(r => r.id === rowId);
            if (!row) return;
            const i = k.rows.indexOf(row);
            const p = this.kbPopup(`Row: ${row.name || 'Row'}`);
            const name = el('input', { class: 'cs-input', type: 'text', value: row.name });
            p.body.append(el('label', { class: 'cs-label', text: 'Name' }), el('div', { class: 'cs-row' }, name),
                el('p', { class: 'cs-muted cs-small', text: 'Each row has its own columns; in the flowchart the row is the parent of its column nodes.' }));
            const regroup = () => {
                const order = new Map(k.rows.map((r, j) => [r.id, j]));
                k.columns.sort((a, b) => order.get(a.row) - order.get(b.row));
            };
            const save = () => { row.name = name.value.trim() || row.name; p.close(); this.kanbanChanged(); };
            const shift = (d) => {
                const j = i + d;
                if (j < 0 || j >= k.rows.length) return;
                k.rows.splice(i, 1);
                k.rows.splice(j, 0, row);
                regroup();
                p.close();
                this.kanbanChanged();
            };
            const remove = async () => {
                if (k.rows.length <= 1) { this.showNotification('A board needs at least one row.'); return; }
                const other = k.rows[i > 0 ? 0 : 1];
                const to = this.kbRowCols(other.id)[0];
                const cards = this.kbCards().filter(c => this.kbColumn(c.column).row === row.id);
                if (!(await this.showConfirmDialog(`Delete the row "${row.name || 'Row'}" and its columns?${cards.length ? ` Its ${cards.length} card${cards.length === 1 ? '' : 's'} move to "${to.name}" in "${other.name || 'Row'}".` : ''}`))) return;
                cards.forEach((c) => { c.column = to.id; c.moved = now(); c.finished = null; });
                k.columns = k.columns.filter(c => c.row !== row.id);
                k.rows.splice(i, 1);
                p.close();
                this.kanbanChanged();
            };
            name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
            p.footer.append(
                el('button', { class: 'cs-btn', type: 'button', text: '▲', title: 'Move up', disabled: i === 0, onclick: () => shift(-1) }),
                el('button', { class: 'cs-btn', type: 'button', text: '▼', title: 'Move down', disabled: i === k.rows.length - 1, onclick: () => shift(1) }),
                el('button', { class: 'cs-btn kb-danger', type: 'button', text: '🗑', title: 'Delete row', onclick: remove }),
                el('span', { class: 'kb-spacer' }),
                el('button', { class: 'cs-btn', type: 'button', text: 'Cancel', onclick: p.close }),
                el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Save', onclick: save }));
            setTimeout(() => { name.focus(); name.select(); }, 30);
        },

        openKanbanColumn(id) {
            const k = this.kanban;
            const col = this.kbColumn(id);
            if (!col) return;
            const i = this.kbColIndex(id);
            const rowCols = this.kbRowCols(col.row);
            const ri = rowCols.indexOf(col);
            const p = this.kbPopup(`Column: ${col.name}`);
            const name = el('input', { class: 'cs-input', type: 'text', value: col.name });
            const wip = el('input', { class: 'cs-input', type: 'number', min: '0', step: '1', value: String(col.wip || 0) });
            const policy = el('textarea', { class: 'cs-input', rows: '2', placeholder: 'e.g. Ready to move on when it has been reviewed' });
            policy.value = col.policy;
            const sortOld = el('input', { type: 'checkbox', checked: col.sort === 'oldest' });
            p.body.append(
                el('label', { class: 'cs-label', text: 'Name' }), el('div', { class: 'cs-row' }, name),
                el('label', { class: 'cs-label', text: 'WIP limit (0 = none)' }), el('div', { class: 'cs-row' }, wip),
                el('p', { class: 'cs-muted cs-small', text: 'How many cards this column should hold at once. Going over is allowed, but the column turns red - finish work before starting more.' }),
                el('label', { class: 'cs-label', text: 'Policy' }), el('div', { class: 'cs-row' }, policy),
                el('label', { class: 'cs-label' }, sortOld, ' Oldest cards first'),
                el('p', { class: 'cs-muted cs-small', text: 'When is a card ready to move here, or done here? Shown under the column name. The last column counts as done.' }));
            const save = () => {
                col.name = name.value.trim() || col.name;
                col.wip = Math.max(0, Math.round(+wip.value || 0));
                col.policy = policy.value.trim();
                col.sort = sortOld.checked ? 'oldest' : '';
                p.close();
                this.kanbanChanged();
            };
            // Moves within its row.
            const shift = (d) => {
                const other = rowCols[ri + d];
                if (!other) return;
                const j = k.columns.indexOf(other);
                k.columns[i] = other;
                k.columns[j] = col;
                p.close();
                this.kanbanChanged();
            };
            const remove = async () => {
                if (rowCols.length <= 1) { this.showNotification(k.rows.length > 1 ? 'A row needs at least one column - delete the row instead (⋯ next to its name).' : 'A board needs at least one column.'); return; }
                const cards = this.kbCards().filter(c => c.column === col.id);
                const to = rowCols[ri > 0 ? ri - 1 : 1];
                if (cards.length && !(await this.showConfirmDialog(`Delete "${col.name}"? Its ${cards.length} card${cards.length === 1 ? '' : 's'} move to "${to.name}".`))) return;
                cards.forEach((c) => { c.column = to.id; c.moved = now(); });
                k.columns.splice(i, 1);
                p.close();
                this.kanbanChanged();
                k.cards.forEach((c) => { c.finished = this.kbIsDone(c) ? (c.finished || now()) : null; });
            };
            name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
            p.footer.append(
                el('button', { class: 'cs-btn', type: 'button', text: '◀', title: 'Move left', disabled: ri === 0, onclick: () => shift(-1) }),
                el('button', { class: 'cs-btn', type: 'button', text: '▶', title: 'Move right', disabled: ri === rowCols.length - 1, onclick: () => shift(1) }),
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
            const wip = cards.filter(c => { const i = this.kbColPos(c.column); return i > 0 && !this.kbIsDone(c); }).length;
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
                const isDone = this.kbColIsDone(col);
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
            const waits = cols.filter(col => !this.kbColIsDone(col)).map((col) => {
                const here = cards.filter(c => c.column === col.id);
                return { col, age: avg(here.map(c => days(t - (c.moved || c.created)))), n: here.length };
            }).filter(w => w.n && this.kbColPos(w.col.id) > 0).sort((a, b) => b.age - a.age);
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

    // A card's node moved under another column (or under something in one): the
    // card moves there as if dragged on the board, so its own chart and
    // checklist for that column come out (or start fresh). Ctrl+Z puts it back.
    const origMoveNode = FlowchartViewer.prototype.moveNodeTo;
    if (origMoveNode) {
        FlowchartViewer.prototype.moveNodeTo = function (movingD, newParentD, ...rest) {
            const id = movingD && movingD.data && movingD.data._kanban;
            const card = id && this.kanban && !this._critView ? this.kbCard(id) : null;
            if (card && newParentD && !movingD.descendants().includes(newParentD)) {
                let col = null;
                for (let a = newParentD; a; a = a.parent) {
                    const k = a.data && a.data._kanban;
                    if (k && k.startsWith('col:')) { col = this.kbColumn(k.slice(4)); break; }
                }
                if (col && col.id !== card.column) {
                    const node = movingD.data;
                    if (node._kbColView) this.kbColViewOff(node);
                    this.pushUndo();
                    const top = this.undoStack[this.undoStack.length - 1];
                    if (top) top.kbMove = { id: card.id, from: card.column, to: col.id };
                    // Dropped on a group in that column: it goes into the group.
                    const g = newParentD.data;
                    if (!g._kanban && g._id) {
                        if (!node._colParent || typeof node._colParent !== 'object') node._colParent = {};
                        node._colParent[col.id] = g._id;
                    }
                    this.kbMoveCard(card.id, col.id, null);
                    this.renderFlowchart(this.rootData);
                    this.hideNodeEditPopup(false);
                    this.showNotification(`Moved "${card.title}" to "${col.name}".`);
                    const d = this.findRenderedNode(this.kbFindNode(card.id));
                    if (d) this.centerNodeOnMobile(d, () => {});
                    return undefined;
                }
            }
            return origMoveNode.call(this, movingD, newParentD, ...rest);
        };
    }

    // The card notes' pill in the notes' tab row: always there once the board
    // has cards.
    const origTabBar = FlowchartViewer.prototype.buildNotesTabBar;
    if (origTabBar) {
        FlowchartViewer.prototype.buildNotesTabBar = function (...args) {
            const bar = origTabBar.apply(this, args);
            if (!this.kanban || !this.kbCards().length) return bar;
            const on = this._activeNotesScope === 'chart' && !!this.kanban.cardTabId && this.getActiveNotesTabId('chart') === this.kanban.cardTabId;
            const card = this._kbCardTabFor && this.kbCard(this._kbCardTabFor);
            const pill = el('div', { class: 'matrix-tab kb-card-tab' + (on ? ' active' : ''), title: 'Card notes: the selected card\'s notes for each column' },
                el('span', { class: 'matrix-tab-label', text: `${CARD_EMOJI} ${card ? card.title : 'Card notes'}` }));
            pill.addEventListener('click', () => this.openKanbanNotes(null));
            bar.prepend(pill);
            return bar;
        };
    }

    // In a card's notes the checklist button makes two kinds: the card's own
    // checklist (on the card and in the flowchart) or one for the notes only.
    const origToolbar = FlowchartViewer.prototype.buildNotesToolbar;
    if (origToolbar) {
        FlowchartViewer.prototype.buildNotesToolbar = function (...args) {
            const row = origToolbar.apply(this, args);
            const plain = row.querySelector('.nt-checklist');
            if (plain) {
                const b = el('button', { class: 'notes-toolbar-btn notes-icon-btn nt-card-check', type: 'button', title: 'Card checklist - these lines go on the card and in the flowchart', 'aria-label': 'Card checklist' });
                b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 12l3.5 3.5L17 9"/></svg>';
                b.addEventListener('click', () => this.kbToggleCardCheck());
                plain.before(b);
                plain.classList.add('kb-plain-check');
                plain.dataset.title = plain.title;
            }
            return row;
        };
    }
    const origShowEditor = FlowchartViewer.prototype.showEmbeddedEditor;
    if (origShowEditor) {
        FlowchartViewer.prototype.showEmbeddedEditor = function (scope, tabId, ...rest) {
            const on = scope === 'chart' && !!this.kanban && !!this.kanban.cardTabId && tabId === this.kanban.cardTabId;
            document.body.classList.toggle('kb-card-notes', on);
            document.querySelectorAll('.kb-plain-check').forEach((b) => { b.title = on ? 'Plain checklist - stays in the notes only' : (b.dataset.title || b.title); });
            return origShowEditor.call(this, scope, tabId, ...rest);
        };
    }

    // Opening the Gantt chart leaves the board.
    const origToggleGantt = FlowchartViewer.prototype.toggleGanttMode;
    if (origToggleGantt) {
        FlowchartViewer.prototype.toggleGanttMode = function (on, ...rest) {
            const want = on === undefined ? !this._ganttMode : !!on;
            if (want && this._kanbanMode) this.toggleKanbanMode(false, true);
            return origToggleGantt.call(this, on, ...rest);
        };
    }

    // Every redraw of the flowchart: edits in the Kanban branch go to the board,
    // and checklist items' nodes get their tick boxes.
    const origRenderFlow = FlowchartViewer.prototype.renderFlowchart;
    FlowchartViewer.prototype.renderFlowchart = function (...args) {
        const r = origRenderFlow.apply(this, args);
        try { this.paintKanbanItemBoxes(); } catch (e) { /* drawn next time */ }
        // A card showing its column history: everything outside it is dimmed.
        try {
            const hosts = new Set(this.kanban && !this._critView ? this.kbColViewHosts() : []);
            if (hosts.size && typeof d3 !== 'undefined') {
                const inside = (d) => { for (let a = d; a; a = a.parent) if (a.data && hosts.has(a.data)) return true; return false; };
                d3.selectAll('#flowchart g.node').style('opacity', d => (d && d.data && !inside(d) ? 0.22 : null));
                d3.selectAll('#flowchart .link').style('opacity', d => (d && d.target && !inside(d.source) ? 0.22 : null));
            }
        } catch (e) { /* drawn next time */ }
        try { this.paintNodeLinkBadges(); } catch (e) { /* drawn next time */ }
        if (!this._kanbanMode && !this._critView && this.kanban) {
            try { this.pullKanbanFlowEdits(); } catch (e) { console.error('Kanban branch edits:', e); }
        }
        return r;
    };

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
        try { this.kbRetireNotes(); } catch (e) { console.error('Kanban notes:', e); }
        if (before !== this.currentSlotIndex) this._kbCardTabFor = null;
        try { if (this.kanban) this.kbFindCardTabCard(); } catch (e) { console.error('Card notes:', e); }
        // The flowchart branch is brought up to date (names and layout as this
        // version draws them).
        if (this.kanban && this.kanban.cards.length) { try { this.syncKanbanFlow(); } catch (e) { console.error('Kanban branch:', e); } }
        this._kbCardSigs = null;
        if (this.kanban) this.kbStampCards(true);
        try { this.kbShowCardTab(); } catch (e) { /* drawn with the notes */ }
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
            if (this.kanban && this.kanban.cardTabId && this._kbCardTabFor) {
                clearTimeout(this._kbCardPullTimer);
                this._kbCardPullTimer = setTimeout(() => this.pullKbCardTabEdits(), 700);
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
                if (id && id !== 'root' && this.kanban && this.notesPanelShowing()) {
                    if (this.kbCard(id)) {
                        this.openKbCardNotes(id);
                    }
                }
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
    // A card node's move to another column is one step: the tree and the card
    // go back (or forward) together.
    const withMove = (app, stack, other, run, pick) => {
        const move = app[stack].length ? app[stack][app[stack].length - 1].kbMove : null;
        const r = run();
        if (move) {
            const back = app[other][app[other].length - 1];
            if (back) back.kbMove = move;
            const card = app.kbCard(move.id);
            const [was, to] = pick === 'undo' ? [move.to, move.from] : [move.from, move.to];
            if (card && card.column === was && app.kbColumn(to)) app.kbMoveCard(card.id, to, null);
        }
        return r;
    };
    FlowchartViewer.prototype.undo = function (...args) { return this._kanbanMode ? this.undoKanban() : withMove(this, 'undoStack', 'redoStack', () => origUndo.apply(this, args), 'undo'); };
    FlowchartViewer.prototype.redo = function (...args) { return this._kanbanMode ? this.redoKanban() : withMove(this, 'redoStack', 'undoStack', () => origRedo.apply(this, args), 'redo'); };
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

    // Tab (outside text fields and popups - a node's name box counts as outside)
    // switches views keeping the selection: from the board or the Gantt chart
    // to the flowchart with the selected card's / task's node selected, and
    // from the flowchart back to the view it came from, with the selected
    // node's card / task selected.
    document.addEventListener('keydown', (e) => {
        const app = window.__flowchartApp;
        if (!app || e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
        const a = document.activeElement;
        const nameBox = a && a.id === 'node-edit-input';
        if (!nameBox && a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return;
        if (document.getElementById('kanban-popup') || document.getElementById('gantt-popup') || document.getElementById('event-popup')) return;
        e.preventDefault();
        if (nameBox && app.nodeBeingEdited) app.hideNodeEditPopup(true);
        if (app._kanbanMode) {
            app._tabBack = 'kanban';
            const id = app._kbSelected;
            if (id && app.kbCard(id)) app.showKanbanCardInFlowchart(id); else app.toggleKanbanMode(false);
        } else if (app._ganttMode) {
            app._tabBack = 'gantt';
            const id = app._ganttSelected;
            if (id && typeof app.showGanttTaskInFlowchart === 'function' && app.ganttTask(id)) app.showGanttTaskInFlowchart(id);
            else app.toggleGanttMode(false);
        } else if (app._tabBack === 'gantt' && typeof app.toggleGanttMode === 'function') {
            const n = app.selectedNode && app.selectedNode.data;
            if (n && n._gantt && n._gantt !== 'root' && app.ganttTask(n._gantt)) { app._ganttSelected = n._gantt; app._ganttScrollToToday = false; }
            app.toggleGanttMode(true);
        } else {
            app.toggleKanbanMode(true);
        }
    }, true);

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
