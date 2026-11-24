// ===== Gantt chart =====
// Each flowchart can carry a Gantt chart (`gantt` in its saved data, so it syncs
// and shares along with everything else). "📅 Gantt" swaps the flowchart view
// for the Gantt view and back.
//
//   gantt = {
//     tasks: [{ id, name, kind: 'task'|'milestone', parent: id|null, start, end,
//               assignee, resources, color, checklist: [{ id, text, done }],
//               done, deps: [predecessor ids, finish-to-start], collapsed }],
//     pxPerDay, notesTabId, noteTitles: { taskId: title text last written }
//   }
//
// - Main tasks (parent null) and their subtasks, in array order. Dates are
//   'YYYY-MM-DD', the end inclusive. A main task with subtasks spans them.
// - A bar fills up as its checklist is ticked off; a subtask without a list has a
//   single "done" tick. Finished bars turn green with a ✓ and their name is
//   crossed out; a main task is crossed out once all its subtasks are.
// - A "Gantt notes" tab in the flowchart's notes holds one Title per main task
//   and a Subheading per subtask, kept in order as tasks come and go (the text
//   under each one stays with its task). Clicking a bar jumps to its title there.
// - The chart is mirrored as a branch of the flowchart ("📅 ... Gantt", beside
//   the existing tree, under the hidden top node). Nodes added to that branch by
//   hand are left alone; the task nodes follow the chart.
(function () {
    if (typeof FlowchartViewer === 'undefined') return;

    const DAY = 86400000;
    const ROW_MAIN = 34;
    const ROW_SUB = 21;
    // The date rows (56px) and, under them, a strip for card dots and events (events.js).
    const HEAD_H = 72;
    const MIN_PPD = 0.12;
    const MAX_PPD = 80;
    // Project-chart colours on a navy background: amber, olive, orange, sky, coral, violet, mint, pink.
    const PALETTE = ['#f5b942', '#c5cc55', '#f08a5d', '#3cb4dc', '#f0555f', '#9d86f0', '#4fd1a5', '#e86aa6'];
    const DONE = '#2fcf8a';
    const FLOW_DONE = '#2e9e5b'; // not the app's "green" (#00a67e), which marks Simplify? leaves
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const toDay = (s) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : null;
    };
    const fromDay = n => new Date(n * DAY).toISOString().slice(0, 10);
    const todayDay = () => { const n = new Date(); return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY); };
    const dateOf = n => new Date(n * DAY);
    const fmtShort = n => { const d = dateOf(n); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
    const fmtLong = n => { const d = dateOf(n); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
    const uid = p => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const el = (tag, props, ...kids) => {
        const e = document.createElement(tag);
        Object.entries(props || {}).forEach(([k, v]) => {
            if (v === undefined || v === null || v === false) return;
            if (k === 'class') e.className = v;
            else if (k === 'text') e.textContent = v;
            else if (k === 'html') e.innerHTML = v;
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
            else if (k === 'style') e.style.cssText = v;
            else e.setAttribute(k, v === true ? '' : v);
        });
        kids.flat().forEach(k => { if (k !== null && k !== undefined && k !== false) e.append(k); });
        return e;
    };
    const lighten = (hex, amt) => {
        const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
        if (!m) return hex;
        const n = parseInt(m[1], 16);
        const mix = c => Math.round(c + (255 - c) * amt);
        const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    };

    // ----- Templates -----
    // [name, start offset (days), length (days), checklist] ; milestones: ['◆', name, offset]
    const TEMPLATES = {
        product: {
            name: 'Product development',
            desc: 'Research to launch: concept, design, prototypes, testing, manufacturing.',
            phases: [
                ['Discovery & research', [
                    ['Market research', 0, 7, ['Competitor review', 'Market size estimate', 'Pricing benchmarks']],
                    ['User interviews', 3, 8, ['Recruit participants', 'Run interviews', 'Summarise findings']],
                    ['Requirements', 10, 5, ['Must-haves list', 'Constraints & standards', 'Sign-off']],
                    ['◆', 'Requirements approved', 15]]],
                ['Concept design', [
                    ['Sketching & ideation', 16, 6, ['Ideation session', 'Shortlist concepts']],
                    ['Concept selection (Pugh matrix)', 22, 3, ['Define criteria', 'Score concepts', 'Pick a direction']],
                    ['◆', 'Concept frozen', 25]]],
                ['Detailed design', [
                    ['CAD modelling', 26, 12, ['Main assembly', 'Part drawings', 'Tolerance check']],
                    ['Materials & suppliers', 30, 8, ['Material choice', 'Request quotes']],
                    ['Design review', 38, 2, ['Review meeting', 'Actions closed']]]],
                ['Prototyping', [
                    ['Build prototype', 40, 10, ['Order parts', 'Assemble', 'Photograph build']],
                    ['Iterate', 50, 7, ['Fix issues from build', 'Second build']]]],
                ['Testing & validation', [
                    ['Functional testing', 57, 7, ['Test plan', 'Run tests', 'Report']],
                    ['Safety & compliance', 60, 10, ['Standards checklist', 'Third-party test', 'Certificates']],
                    ['User testing', 64, 6, ['Recruit testers', 'Run sessions', 'Collect feedback']],
                    ['◆', 'Design verified', 70]]],
                ['Manufacturing', [
                    ['Tooling', 71, 14, ['Tooling quotes', 'Tooling approved', 'First-off samples']],
                    ['Pilot run', 85, 7, ['Pilot build', 'Quality inspection']]]],
                ['Launch', [
                    ['Marketing assets', 80, 12, ['Photos & video', 'Product page', 'Packaging artwork']],
                    ['Production run', 92, 10, ['Production order', 'Quality checks', 'Ship to warehouse']],
                    ['◆', 'Launch', 102]]]
            ]
        },
        software: {
            name: 'Software release',
            desc: 'Plan, build, test and ship a release.',
            phases: [
                ['Planning', [
                    ['Scope & backlog', 0, 4, ['Gather requests', 'Prioritise', 'Agree scope']],
                    ['Technical design', 4, 4, ['Architecture notes', 'Review']]]],
                ['Build', [
                    ['Sprint 1', 8, 10, ['Features A', 'Features B', 'Code review']],
                    ['Sprint 2', 18, 10, ['Features C', 'Bug fixes', 'Code review']]]],
                ['Test', [
                    ['QA testing', 28, 6, ['Test cases', 'Regression run', 'Bug triage']],
                    ['Beta', 32, 7, ['Invite testers', 'Collect feedback']]]],
                ['Release', [
                    ['Release prep', 39, 3, ['Release notes', 'Docs updated']],
                    ['◆', 'Release', 42]]]
            ]
        },
        event: {
            name: 'Event planning',
            desc: 'Venue, suppliers, promotion and the day itself.',
            phases: [
                ['Plan', [
                    ['Budget & goals', 0, 3, ['Budget', 'Goals', 'Date options']],
                    ['Book venue', 3, 7, ['Shortlist venues', 'Site visits', 'Sign contract']]]],
                ['Suppliers', [
                    ['Catering', 10, 10, ['Quotes', 'Menu', 'Confirm numbers']],
                    ['AV & equipment', 12, 8, ['Requirements', 'Book supplier']]]],
                ['Promote', [
                    ['Invitations', 10, 14, ['Guest list', 'Send invites', 'Track RSVPs']],
                    ['Social media', 14, 20, ['Content plan', 'Posts scheduled']]]],
                ['Event', [
                    ['Run sheet', 30, 4, ['Timings', 'Roles', 'Contingencies']],
                    ['◆', 'Event day', 35],
                    ['Follow-up', 36, 5, ['Thank-yous', 'Feedback survey', 'Final costs']]]]
            ]
        },
        simple: {
            name: 'Simple project',
            desc: 'Three phases with a milestone each - a quick starting point.',
            phases: [
                ['Plan', [['Define goals', 0, 3, ['Goals written', 'Agreed']], ['◆', 'Plan agreed', 3]]],
                ['Do', [['Work package 1', 4, 7, []], ['Work package 2', 8, 7, []]]],
                ['Review', [['Check results', 15, 3, ['Results reviewed']], ['◆', 'Done', 18]]]
            ]
        }
    };

    const methods = {
        // ----- Data -----
        sanitizeGantt(raw) {
            if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) return null;
            const ids = new Set();
            const tasks = [];
            raw.tasks.forEach((t) => {
                if (!t || typeof t !== 'object' || typeof t.id !== 'string' || ids.has(t.id)) return;
                const start = toDay(t.start) !== null ? t.start : fromDay(todayDay());
                let end = toDay(t.end) !== null ? t.end : start;
                if (toDay(end) < toDay(start)) end = start;
                ids.add(t.id);
                tasks.push({
                    id: t.id,
                    name: typeof t.name === 'string' ? t.name : 'Task',
                    kind: t.kind === 'milestone' ? 'milestone' : 'task',
                    parent: typeof t.parent === 'string' ? t.parent : null,
                    start, end: t.kind === 'milestone' ? start : end,
                    assignee: typeof t.assignee === 'string' ? t.assignee : '',
                    resources: typeof t.resources === 'string' ? t.resources : '',
                    color: typeof t.color === 'string' ? t.color : '',
                    checklist: Array.isArray(t.checklist) ? t.checklist.filter(c => c && typeof c.id === 'string').map(c => ({ id: c.id, text: String(c.text || ''), done: !!c.done })) : [],
                    done: !!t.done,
                    deps: Array.isArray(t.deps) ? t.deps.filter(d => typeof d === 'string') : [],
                    collapsed: !!t.collapsed
                });
            });
            // Only two levels: a parent must be a main task that exists.
            const mains = new Set(tasks.filter(t => !t.parent).map(t => t.id));
            tasks.forEach((t) => { if (t.parent && !mains.has(t.parent)) t.parent = null; });
            tasks.forEach((t) => { t.deps = t.deps.filter(d => d !== t.id && ids.has(d)); });
            return {
                tasks,
                pxPerDay: Number.isFinite(raw.pxPerDay) ? clamp(raw.pxPerDay, MIN_PPD, MAX_PPD) : 22,
                notesTabId: typeof raw.notesTabId === 'string' ? raw.notesTabId : null,
                noteTitles: (raw.noteTitles && typeof raw.noteTitles === 'object') ? Object.assign({}, raw.noteTitles) : {}
            };
        },

        ganttTasks() { return (this.gantt && this.gantt.tasks) || []; },
        ganttTask(id) { return this.ganttTasks().find(t => t.id === id) || null; },
        ganttChildren(id) { return this.ganttTasks().filter(t => t.parent === id); },
        ganttMains() { return this.ganttTasks().filter(t => !t.parent); },

        // Display order: each main task followed by its subtasks.
        ganttOrdered(includeCollapsed) {
            const out = [];
            this.ganttMains().forEach((m) => {
                out.push(m);
                if (includeCollapsed || !m.collapsed) this.ganttChildren(m.id).forEach(c => out.push(c));
            });
            return out;
        },

        ganttNumber(t) {
            const mains = this.ganttMains();
            if (!t.parent) return `${mains.indexOf(t) + 1}`;
            const p = this.ganttTask(t.parent);
            return `${mains.indexOf(p) + 1}.${this.ganttChildren(t.parent).indexOf(t) + 1}`;
        },

        // { done, total } in checklist items. A subtask/milestone without a list
        // counts as one item (its own done tick); a main task adds up its subtasks.
        ganttCounts(t) {
            const kids = t.parent ? [] : this.ganttChildren(t.id);
            if (kids.length) {
                return kids.reduce((acc, k) => {
                    const c = this.ganttCounts(k);
                    return { done: acc.done + c.done, total: acc.total + c.total };
                }, { done: 0, total: 0 });
            }
            if (t.checklist.length) return { done: t.checklist.filter(c => c.done).length, total: t.checklist.length };
            return { done: t.done ? 1 : 0, total: 1 };
        },
        ganttProgress(t) { const c = this.ganttCounts(t); return c.total ? c.done / c.total : 0; },
        ganttComplete(t) {
            const kids = t.parent ? [] : this.ganttChildren(t.id);
            if (kids.length) return kids.every(k => this.ganttComplete(k));
            const c = this.ganttCounts(t);
            return c.total > 0 && c.done === c.total;
        },

        // Start/end days actually drawn: a main task with subtasks spans them.
        ganttSpan(t) {
            const kids = t.parent ? [] : this.ganttChildren(t.id);
            if (kids.length) {
                const s = Math.min(...kids.map(k => toDay(k.start)));
                const e = Math.max(...kids.map(k => toDay(k.end)));
                return { s, e };
            }
            return { s: toDay(t.start), e: toDay(t.end) };
        },

        ganttColor(t) {
            if (t.parent) {
                const p = this.ganttTask(t.parent);
                return lighten(this.ganttColor(p), 0.18);
            }
            if (t.color) return t.color;
            const i = this.ganttMains().indexOf(t);
            return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
        },

        ensureGantt() {
            if (!this.gantt) this.gantt = { tasks: [], pxPerDay: 22, notesTabId: null, noteTitles: {} };
            return this.gantt;
        },

        // Something about the chart changed: save, redraw, and bring the notes
        // titles and the flowchart branch along.
        ganttChanged(structure) {
            if (this.gantt) {
                // Main tasks with subtasks keep start/end in step with them.
                this.ganttMains().forEach((m) => {
                    if (this.ganttChildren(m.id).length) {
                        const sp = this.ganttSpan(m);
                        m.start = fromDay(sp.s);
                        m.end = fromDay(sp.e);
                    }
                });
            }
            this.recordGanttHistory();
            this.renderGantt();
            this.refreshGanttDock();
            this.syncGanttFlow();
            if (structure) this.syncGanttNotes();
            this.autosave();
        },

        // ----- Undo / redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, and the undo/redo buttons) -----
        // A snapshot of the tasks is kept after every change; zooming and panning
        // are not changes. A whole drag is one step.
        ganttSnapshot() { return JSON.stringify(this.ganttTasks()); },

        resetGanttHistory() {
            this._ganttUndo = [];
            this._ganttRedo = [];
            this._ganttLastSnap = this.ganttSnapshot();
            this.updateUndoRedoButtons();
        },

        recordGanttHistory() {
            if (this._ganttRestoring) return;
            if (!this._ganttUndo) this.resetGanttHistory();
            const now = this.ganttSnapshot();
            if (now === this._ganttLastSnap) return;
            this._ganttUndo.push(this._ganttLastSnap);
            if (this._ganttUndo.length > 100) this._ganttUndo.shift();
            this._ganttRedo = [];
            this._ganttLastSnap = now;
            this.updateUndoRedoButtons();
        },

        restoreGanttSnapshot(snap) {
            const g = this.ensureGantt();
            g.tasks = JSON.parse(snap);
            if (this._ganttSelected && !this.ganttTask(this._ganttSelected)) this._ganttSelected = null;
            this._ganttLastSnap = snap;
            this._ganttRestoring = true;
            try {
                const old = document.getElementById('gantt-popup');
                if (old) old.remove();
                this.ganttChanged(true);
            } finally {
                this._ganttRestoring = false;
            }
            this.updateUndoRedoButtons();
        },

        undoGantt() {
            if (!this._ganttUndo || !this._ganttUndo.length) return;
            this._ganttRedo.push(this.ganttSnapshot());
            this.restoreGanttSnapshot(this._ganttUndo.pop());
        },

        redoGantt() {
            if (!this._ganttRedo || !this._ganttRedo.length) return;
            this._ganttUndo.push(this.ganttSnapshot());
            this.restoreGanttSnapshot(this._ganttRedo.pop());
        },

        applyGanttTemplate(key) {
            const tpl = TEMPLATES[key];
            const g = this.ensureGantt();
            g.tasks = [];
            if (tpl) {
                // Starts on the Monday of this week.
                const t0 = todayDay();
                const dow = (dateOf(t0).getUTCDay() + 6) % 7;
                const base = t0 - dow;
                let prevPhaseLast = null;
                tpl.phases.forEach(([phaseName, items]) => {
                    const main = { id: uid('gt'), name: phaseName, kind: 'task', parent: null, start: '', end: '', assignee: '', resources: '', color: '', checklist: [], done: false, deps: [], collapsed: false };
                    g.tasks.push(main);
                    let prev = null;
                    items.forEach((it) => {
                        let task;
                        if (it[0] === '◆') {
                            task = { id: uid('gt'), name: it[1], kind: 'milestone', parent: main.id, start: fromDay(base + it[2]), end: fromDay(base + it[2]), assignee: '', resources: '', color: '', checklist: [], done: false, deps: [], collapsed: false };
                        } else {
                            const [name, off, len, list] = it;
                            task = {
                                id: uid('gt'), name, kind: 'task', parent: main.id,
                                start: fromDay(base + off), end: fromDay(base + off + len - 1),
                                assignee: '', resources: '', color: '', done: false, deps: [], collapsed: false,
                                checklist: (list || []).map(text => ({ id: uid('ck'), text, done: false }))
                            };
                        }
                        // Finish-to-start links: each step after the one before it
                        // (when it really starts after it), and each phase's first
                        // step after the previous phase's last.
                        const link = prev || prevPhaseLast;
                        if (link && toDay(task.start) > toDay(link.end)) task.deps.push(link.id);
                        g.tasks.push(task);
                        prev = task;
                    });
                    prevPhaseLast = prev;
                });
            }
            this._ganttSelected = null;
            this._ganttScrollToToday = true;
            this.ganttChanged(true);
            // Show the whole plan, by weeks, like a printed project chart.
            this.fitGantt();
        },

        newGanttTask(kind, parentId) {
            const g = this.ensureGantt();
            const t0 = todayDay();
            let start = t0;
            const sibs = parentId ? this.ganttChildren(parentId) : this.ganttMains();
            if (sibs.length) start = Math.max(...sibs.map(s => this.ganttSpan(s).e)) + 1;
            else if (parentId) start = toDay(this.ganttTask(parentId).start);
            const len = kind === 'milestone' ? 1 : 5;
            const task = {
                id: uid('gt'), name: kind === 'milestone' ? 'New milestone' : (parentId ? 'New subtask' : 'New task'),
                kind, parent: parentId || null, start: fromDay(start), end: fromDay(start + len - 1),
                assignee: '', resources: '', color: '', checklist: [], done: false, deps: [], collapsed: false
            };
            // After the parent's last subtask, or at the end.
            const tasks = g.tasks;
            if (parentId) {
                const kids = this.ganttChildren(parentId);
                const after = kids.length ? kids[kids.length - 1] : this.ganttTask(parentId);
                tasks.splice(tasks.indexOf(after) + 1, 0, task);
                this.ganttTask(parentId).collapsed = false;
            } else {
                tasks.push(task);
            }
            this._ganttSelected = task.id;
            this.ganttChanged(true);
            this.openGanttEditor(task.id, true);
        },

        // Deletes the selected task (with its subtasks); Ctrl+Z brings it back.
        deleteGanttSelected() {
            const t = this._ganttSelected && this.ganttTask(this._ganttSelected);
            if (!t) return false;
            const kids = t.parent ? 0 : this.ganttChildren(t.id).length;
            this.deleteGanttTask(t.id);
            this.showNotification(`Deleted "${t.name}"${kids ? ` and its ${kids} subtask${kids === 1 ? '' : 's'}` : ''} - Ctrl+Z to undo.`, 4000);
            return true;
        },

        deleteGanttTask(id) {
            const g = this.gantt;
            if (!g) return;
            const gone = new Set([id, ...this.ganttChildren(id).map(c => c.id)]);
            g.tasks = g.tasks.filter(t => !gone.has(t.id));
            g.tasks.forEach((t) => { t.deps = t.deps.filter(d => !gone.has(d)); });
            if (gone.has(this._ganttSelected)) this._ganttSelected = null;
            this.ganttChanged(true);
        },

        moveGanttTask(id, dir) {
            const g = this.gantt;
            const t = this.ganttTask(id);
            if (!t) return;
            const sibs = t.parent ? this.ganttChildren(t.parent) : this.ganttMains();
            const i = sibs.indexOf(t);
            const j = i + dir;
            if (j < 0 || j >= sibs.length) return;
            const other = sibs[j];
            // Swap the two (with their subtasks, for main tasks) in the array.
            const block = x => (x.parent ? [x] : [x, ...this.ganttChildren(x.id)]);
            const a = block(dir < 0 ? other : t);
            const b = block(dir < 0 ? t : other);
            const rest = g.tasks.filter(x => !a.includes(x) && !b.includes(x));
            const at = g.tasks.indexOf(a[0]);
            const before = g.tasks.slice(0, at).filter(x => rest.includes(x));
            const after = rest.filter(x => !before.includes(x));
            g.tasks = [...before, ...b, ...a, ...after];
            this.ganttChanged(true);
        },

        // ----- View switching -----
        setupGantt() {
            window.__flowchartApp = this;
            this._ganttMode = false;
            this._ganttSelected = null;
            const panel = document.getElementById('flowchart-panel');
            if (panel && !document.getElementById('gantt-view')) {
                panel.insertBefore(el('div', { id: 'gantt-view', style: 'display:none;' }), panel.firstChild.nextSibling);
            }
            ['gantt-btn', 'top-gantt-btn'].forEach((id) => {
                const b = document.getElementById(id);
                if (b) b.addEventListener('click', () => this.toggleGanttMode());
            });
            // The today line moves on at midnight.
            setInterval(() => { if (this._ganttMode && this._ganttToday !== todayDay()) this.renderGantt(); }, 60000);
            // Redraw when the view changes size (window, side panel, or coming out
            // from under the full-screen notes on a phone).
            const view = document.getElementById('gantt-view');
            if (view && window.ResizeObserver) {
                let lastW = 0;
                let lastH = 0;
                new ResizeObserver(() => {
                    const w = view.clientWidth;
                    const h = view.clientHeight;
                    if (this._ganttMode && w && (Math.abs(w - lastW) > 2 || Math.abs(h - lastH) > 2)) {
                        lastW = w;
                        lastH = h;
                        this.renderGantt();
                    }
                }).observe(view);
            } else {
                window.addEventListener('resize', () => { if (this._ganttMode) this.renderGantt(); });
            }
            if (localStorage.getItem('flowchart-gantt-mode') === '1') setTimeout(() => this.toggleGanttMode(true), 0);
        },

        toggleGanttMode(on) {
            const want = on === undefined ? !this._ganttMode : !!on;
            this._ganttMode = want;
            localStorage.setItem('flowchart-gantt-mode', want ? '1' : '0');
            document.body.classList.toggle('gantt-mode', want);
            const view = document.getElementById('gantt-view');
            const chart = document.getElementById('flowchart');
            if (view) view.style.display = want ? 'flex' : 'none';
            if (chart) chart.style.display = want ? 'none' : '';
            document.querySelectorAll('#gantt-btn, #hamburger-gantt').forEach((b) => {
                b.textContent = want ? '🔀 Flowchart' : '📅 Gantt';
            });
            const top = document.getElementById('top-gantt-btn');
            if (top) { top.textContent = want ? '🔀' : '📅'; top.title = want ? 'Back to the flowchart' : 'Gantt chart'; }
            if (want) {
                // A flowchart node left selected must not be deleted by keys
                // pressed in the Gantt view.
                if (this.selectedNode && typeof this.deselectNode === 'function') this.deselectNode();
                this.selectedNode = null;
                this._ganttScrollToToday = true;
                if (!this._ganttUndo) this.resetGanttHistory();
                // Bring older Gantt notes up to date (titles, a line under each).
                if (this.gantt && this.gantt.tasks.length && this.syncGanttNotes()) this.autosave();
                this.renderGantt();
            } else if (this.rootData) {
                this.closeGanttDock();
                this.renderFlowchart(this.rootData);
            }
            // The undo/redo buttons follow whichever view is showing.
            this.updateUndoRedoButtons();
        },

        // ----- Drawing the chart -----
        renderGantt() {
            const view = document.getElementById('gantt-view');
            if (!view || !this._ganttMode) return;
            // Not on screen yet (e.g. under the full-screen notes): drawn when it is.
            if (!view.clientWidth) return;
            const prevScroll = view.querySelector('.gantt-scroll');
            const keep = prevScroll ? { left: prevScroll.scrollLeft, top: prevScroll.scrollTop } : null;
            view.innerHTML = '';
            const tasks = this.ganttTasks();
            view.append(this.buildGanttToolbar());
            if (tasks.length === 0) {
                view.append(this.buildGanttEmpty());
                return;
            }
            const narrow = view.clientWidth < 700;
            // Phone: no task-name column, the chart has the whole width.
            const phone = window.matchMedia('(max-width: 600px)').matches;
            const LIST_W = phone ? 0 : (narrow ? 175 : 280);
            const g = this.gantt;
            const ppd = g.pxPerDay;
            const today = todayDay();
            this._ganttToday = today;

            const spans = this.ganttOrdered(true).map(t => this.ganttSpan(t));
            const minD = Math.min(today, ...spans.map(s => s.s));
            const maxD = Math.max(today, ...spans.map(s => s.e));
            // Room either side, and at least a screen's width.
            const padDays = Math.max(14, Math.ceil(240 / ppd));
            let r0 = minD - padDays;
            let r1 = maxD + padDays;
            const screenDays = Math.ceil((view.clientWidth - LIST_W) / ppd) + 2;
            if (r1 - r0 < screenDays) r1 = r0 + screenDays;
            // Start the range on a clean boundary for the scale in use.
            const scale = ppd >= 16 ? 'day' : ppd >= 3.2 ? 'week' : ppd >= 0.9 ? 'month' : 'year';
            const d0 = dateOf(r0);
            if (scale === 'day' || scale === 'week') r0 = Math.round(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) / DAY);
            if (scale === 'month') r0 = Math.round(Date.UTC(d0.getUTCFullYear(), 0, 1) / DAY);
            if (scale === 'year') r0 = Math.round(Date.UTC(d0.getUTCFullYear(), 0, 1) / DAY);
            const days = r1 - r0 + 1;
            const TL_W = Math.ceil(days * ppd);
            const xOf = d => (d - r0) * ppd;
            this._ganttGeom = { r0, ppd, LIST_W };

            // Rows: main tasks taller than subtasks, with a gap above each group.
            // When the whole plan fits on screen, the rows stretch to fill the
            // height (up to 3x); a longer plan keeps normal rows and scrolls.
            const rows = this.ganttOrdered(false);
            const layout = (f) => {
                const tops = []; const heights = [];
                let y = 6 * f;
                rows.forEach((t, i) => {
                    if (!t.parent && i > 0) y += 10 * f;
                    tops.push(y);
                    const h = (t.parent ? ROW_SUB : ROW_MAIN) * f;
                    heights.push(h);
                    y += h;
                });
                return { tops, heights, end: y + 16 * f };
            };
            const natural = layout(1);
            const barRoom = view.querySelector('.gantt-top, .gantt-toolbar');
            const avail = view.clientHeight - (barRoom ? barRoom.offsetHeight : 0) - HEAD_H - 14;
            const fit = clamp(avail / natural.end, 1, 3);
            const { tops, heights } = fit > 1.02 ? layout(fit) : natural;
            this._ganttRowScale = fit > 1.02 ? fit : 1;
            const bodyH = Math.max(fit > 1.02 ? avail : natural.end, 140);
            this._ganttRows = { rows, tops, heights };

            const scroll = el('div', { class: 'gantt-scroll' });
            // Two rows (header, body), each the list column + the timeline. The
            // list and the header stay put while the chart scrolls (sticky), which
            // only works when their containing block spans the whole chart.
            const grid = el('div', { class: 'gantt-grid', style: `width:${LIST_W + TL_W}px;` });
            const headRow = el('div', { class: 'gantt-headrow', style: `height:${HEAD_H}px;` });
            const bodyRow = el('div', { class: 'gantt-bodyrow', style: `height:${bodyH}px;` });
            grid.append(headRow, bodyRow);
            scroll.append(grid);

            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            headRow.append(el('div', { class: 'gantt-corner', style: `width:${LIST_W}px;` },
                el('div', { class: 'gantt-corner-title', text: (item ? item.title : 'Project').toUpperCase() })));

            // Timeline header: two rows of labels.
            const head = el('div', { class: 'gantt-head', style: `width:${TL_W}px;` });
            const topRow = el('div', { class: 'gh-top' });
            const botRow = el('div', { class: 'gh-bot' });
            head.append(topRow, botRow);
            const addLabel = (row, x, w, text, cls) => row.append(el('div', { class: 'gh-cell' + (cls ? ' ' + cls : ''), style: `left:${x}px;width:${w}px;`, text }));
            const majorLines = [];
            const minorLines = [];
            const monthName = (dt, w) => (w > 70 ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][dt.getUTCMonth()] : MONTHS[dt.getUTCMonth()]);
            for (let d = r0; d <= r1;) {
                const dt = dateOf(d);
                let next;
                let text;
                if (scale === 'day' || scale === 'week') {
                    next = Math.round(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / DAY);
                    const w = (Math.min(next, r1 + 1) - d) * ppd;
                    text = monthName(dt, w) + (dt.getUTCMonth() === 0 || d === r0 ? ` ${dt.getUTCFullYear()}` : '');
                } else {
                    next = Math.round(Date.UTC(dt.getUTCFullYear() + 1, 0, 1) / DAY);
                    text = `${dt.getUTCFullYear()}`;
                }
                addLabel(topRow, xOf(d), (Math.min(next, r1 + 1) - d) * ppd, text);
                majorLines.push(xOf(d));
                d = next;
            }
            // Bottom row: days, weeks of the month (W1-W5), months or quarters.
            for (let d = r0; d <= r1;) {
                const dt = dateOf(d);
                let next; let text; let weekend = false;
                if (scale === 'day') {
                    next = d + 1; text = String(dt.getUTCDate());
                    weekend = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
                } else if (scale === 'week') {
                    const monthEnd = Math.round(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / DAY);
                    const wk = Math.floor((dt.getUTCDate() - 1) / 7);
                    next = Math.min(d + 7, monthEnd);
                    // A last "week" of only 1-3 days joins the one before.
                    if (monthEnd - next > 0 && monthEnd - next < 4) next = monthEnd;
                    text = `W${wk + 1}`;
                } else if (scale === 'month') {
                    next = Math.round(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / DAY);
                    text = (next - d) * ppd > 34 ? MONTHS[dt.getUTCMonth()] : MONTHS[dt.getUTCMonth()][0];
                } else {
                    const q = Math.floor(dt.getUTCMonth() / 3);
                    next = Math.round(Date.UTC(dt.getUTCFullYear(), (q + 1) * 3, 1) / DAY);
                    text = (next - d) * ppd > 22 ? `Q${q + 1}` : '';
                }
                addLabel(botRow, xOf(d), (next - d) * ppd, text, weekend ? 'weekend' : '');
                minorLines.push({ x: xOf(d), weekend, w: (next - d) * ppd });
                d = next;
            }
            // Today ticker.
            const tx = xOf(today) + Math.min(ppd, 24) / 2;
            head.append(el('div', { class: 'gantt-today-tick', style: `left:${tx}px;`, title: fmtLong(today) },
                el('span', { text: `TODAY · ${fmtShort(today)}` })));
            headRow.append(head);

            // Task list.
            const list = el('div', { class: 'gantt-list' + (narrow ? ' narrow' : ''), style: `width:${LIST_W}px;` });
            rows.forEach((t, i) => list.append(this.buildGanttListRow(t, tops[i], heights[i], narrow)));
            if (LIST_W) bodyRow.append(list);

            // Timeline body.
            const body = el('div', { class: 'gantt-body', style: `width:${TL_W}px;height:${bodyH}px;` });
            minorLines.forEach((gl) => {
                body.append(el('div', { class: 'gantt-vline minor' + (gl.weekend ? ' weekend' : ''), style: `left:${gl.x}px;` + (gl.weekend ? `width:${gl.w}px;` : '') }));
            });
            majorLines.forEach(x => body.append(el('div', { class: 'gantt-vline major', style: `left:${x}px;` })));
            rows.forEach((t, i) => {
                if (t.id === this._ganttSelected) body.append(el('div', { class: 'gantt-hrow selected', style: `top:${tops[i]}px;height:${heights[i]}px;` }));
                if (!t.parent) body.append(el('div', { class: 'gantt-group-line', style: `top:${tops[i] + heights[i] / 2}px;` }));
            });
            body.append(el('div', { class: 'gantt-today-line', style: `left:${tx}px;` }));

            // Connector lines underneath the bars: each main task to its
            // subtasks (the bracket on the left), and finish-to-start links.
            const NS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('class', 'gantt-deps');
            svg.setAttribute('width', TL_W);
            svg.setAttribute('height', bodyH);
            svg.innerHTML = '<defs><marker id="gantt-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>';
            const rowOf = new Map(rows.map((t, i) => [t.id, i]));
            const midY = i => tops[i] + heights[i] / 2;
            const addPath = (d, cls, color, titleText, arrow) => {
                const path = document.createElementNS(NS, 'path');
                path.setAttribute('d', d);
                path.setAttribute('class', cls);
                if (color) path.style.stroke = color;
                if (arrow) path.setAttribute('marker-end', 'url(#gantt-arrow)');
                if (titleText) {
                    const title = document.createElementNS(NS, 'title');
                    title.textContent = titleText;
                    path.append(title);
                }
                svg.append(path);
            };
            this.ganttMains().forEach((m) => {
                if (m.collapsed || !rowOf.has(m.id)) return;
                const kids = this.ganttChildren(m.id);
                if (!kids.length) return;
                const mi = rowOf.get(m.id);
                const x0 = xOf(this.ganttSpan(m).s) + 5;
                const color = this.ganttComplete(m) ? DONE : this.ganttColor(m);
                kids.forEach((k) => {
                    const ki = rowOf.get(k.id);
                    if (ki === undefined) return;
                    const kx = xOf(this.ganttSpan(k).s) + (k.kind === 'milestone' ? Math.min(ppd, 24) / 2 - 7 : 0);
                    // Only a bracket when the subtask starts at (or after) the group's start.
                    if (kx < x0) return;
                    addPath(`M${x0},${midY(mi) + 5} V${midY(ki)} H${kx}`, 'gantt-bracket', color);
                });
            });
            this.ganttTasks().forEach((t) => {
                t.deps.forEach((pid) => {
                    const p = this.ganttTask(pid);
                    if (!p) return;
                    const visible = (x) => {
                        if (rowOf.has(x.id)) return rowOf.get(x.id);
                        const par = x.parent && this.ganttTask(x.parent);
                        return par && rowOf.has(par.id) ? rowOf.get(par.id) : null;
                    };
                    const ri = visible(t); const pi = visible(p);
                    if (ri === null || pi === null || ri === pi) return;
                    const ps = this.ganttSpan(p); const ts = this.ganttSpan(t);
                    const half = Math.min(ppd, 24) / 2;
                    const x1 = p.kind === 'milestone' ? xOf(ps.s) + half + 7 : xOf(ps.e + 1) - 3;
                    const x2 = t.kind === 'milestone' ? xOf(ts.s) + half - 8 : xOf(ts.s) + 2;
                    const y1 = midY(pi); const y2 = midY(ri);
                    const late = ts.s <= ps.e;
                    let d;
                    if (x2 - 10 >= x1) d = `M${x1},${y1} V${y2} H${x2}`;
                    else {
                        const yMid = y2 > y1 ? tops[ri] - 2 : tops[ri] + heights[ri] + 2;
                        d = `M${x1},${y1} H${x1 + 6} V${yMid} H${x2 - 8} V${y2} H${x2}`;
                    }
                    addPath(d, 'gantt-dep' + (late ? ' late' : ''), late ? null : lighten(this.ganttComplete(t) ? DONE : this.ganttColor(t), 0.15),
                        `${p.name} → ${t.name}${late ? ' (starts before it finishes!)' : ''}`, true);
                });
            });
            body.append(svg);

            // Bars and milestones.
            rows.forEach((t, i) => body.append(this.buildGanttBar(t, tops[i], heights[i], xOf)));
            bodyRow.append(body);
            if (typeof this.ganttDecorate === 'function') { try { this.ganttDecorate(head, body, xOf, ppd, r0, r1); } catch (e) { console.error('Gantt strip:', e); } }
            view.append(scroll);
            // Fill the window: the grid, list and today line run to the bottom.
            const room = scroll.clientHeight - HEAD_H;
            if (room > bodyH) {
                bodyRow.style.height = `${room}px`;
                body.style.height = `${room}px`;
                svg.setAttribute('height', room);
            }

            this.wireGanttScroll(scroll, body);
            if (this._ganttScrollToToday) {
                this._ganttScrollToToday = false;
                scroll.scrollLeft = Math.max(0, xOf(Math.min(today, minD)) - 60);
                if (keep) scroll.scrollTop = keep.top;
            } else if (this._ganttAnchor) {
                const a = this._ganttAnchor;
                this._ganttAnchor = null;
                scroll.scrollLeft = (a.day - r0) * ppd - a.x;
                scroll.scrollTop = keep ? keep.top : 0;
            } else if (keep) {
                // The range may have grown on the left: keep the same dates on screen.
                const shift = (this._ganttR0 !== undefined && this._ganttPpd === ppd) ? (this._ganttR0 - r0) * ppd : 0;
                scroll.scrollLeft = keep.left + shift;
                scroll.scrollTop = keep.top;
            }
            this._ganttR0 = r0;
            this._ganttPpd = ppd;
            this.positionGanttDock();
        },

        buildGanttToolbar() {
            const g = this.gantt;
            const sel = this._ganttSelected && this.ganttTask(this._ganttSelected);
            const btn = (text, title, onclick, cls) => el('button', { class: 'gantt-tb-btn' + (cls ? ' ' + cls : ''), type: 'button', text, title, onclick });
            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            const bar = el('div', { class: 'gantt-toolbar' },
                el('div', { class: 'gantt-title', text: `📅 ${item ? item.title : 'Gantt chart'}` }),
                btn('🔀 Flowchart', 'Back to the flowchart', () => this.toggleGanttMode(false)),
                btn('↩', 'Undo (Ctrl+Z)', () => this.undoGantt(), (this._ganttUndo && this._ganttUndo.length) ? '' : 'disabled'),
                btn('↪', 'Redo (Ctrl+Shift+Z)', () => this.redoGantt(), (this._ganttRedo && this._ganttRedo.length) ? '' : 'disabled'),
                btn('+ Task', 'Add a main task', () => this.newGanttTask('task', null), 'primary'),
                btn('+ Subtask', 'Add a subtask to the selected task', () => {
                    const s = this._ganttSelected && this.ganttTask(this._ganttSelected);
                    if (!s) { this.showNotification('Select a task first.'); return; }
                    this.newGanttTask('task', s.parent || s.id);
                }),
                btn('+ Milestone', 'Add a milestone (to the selected task\'s group)', () => {
                    const s = this._ganttSelected && this.ganttTask(this._ganttSelected);
                    this.newGanttTask('milestone', s ? (s.parent || s.id) : null);
                }),
                btn('Templates', 'Start from a template', () => this.openGanttTemplates()),
                el('span', { class: 'gantt-tb-sep' }),
                btn('−', 'Zoom out', () => this.zoomGantt(1 / 1.5)),
                btn('+', 'Zoom in', () => this.zoomGantt(1.5)),
                btn('Today', 'Scroll to today', () => { this._ganttScrollToToday = true; this.renderGantt(); }),
                btn('Fit', 'Fit the whole plan on screen', () => this.fitGantt()),
                el('span', { class: 'gantt-tb-btn gantt-notes-btn', role: 'button', tabindex: '0', title: 'Open the Gantt notes',
                    text: '📝 Notes', onclick: () => this.openGanttNotes(null) }));
            if (!g || !g.tasks.length) return bar;
            const actions = el('div', { class: 'gantt-actions' });
            if (sel) {
                const c = this.ganttCounts(sel);
                const kids = sel.parent ? [] : this.ganttChildren(sel.id);
                actions.append(
                    el('span', { class: 'gantt-sel-name', text: `${this.ganttNumber(sel)}  ${sel.name}` }),
                    btn(`☑ Checklist ${c.done}/${c.total}`, 'Show the checklist (bottom left)', () => this.openGanttChecklist(sel.id)),
                    btn('✎ Edit', 'Name, dates, owner, links', () => this.openGanttEditor(sel.id)),
                    btn('↑', 'Move up', () => this.moveGanttTask(sel.id, -1)),
                    btn('↓', 'Move down', () => this.moveGanttTask(sel.id, 1)),
                    btn('🌳 Show in flowchart', 'Open the flowchart with this task unfolded and everything else folded', () => this.showGanttTaskInFlowchart(sel.id)),
                    btn('📅 Gantt flowchart', 'Open the whole Gantt branch of the flowchart', () => this.showGanttTaskInFlowchart(null)),
                    btn('🗑', 'Delete (Delete key) - Ctrl+Z brings it back', () => this.deleteGanttSelected(), 'danger'));
            } else {
                actions.append(el('span', { class: 'gantt-hint', text: 'Tap a bar or a name to select it (Delete key removes it, Ctrl+Z undoes). Drag bars to move them, drag their ends to change dates. Scroll the mouse wheel (or pinch) to zoom; drag any empty space to pan; Shift + wheel scrolls up and down.' }));
            }
            return el('div', { class: 'gantt-top' }, bar, actions);
        },

        buildGanttEmpty() {
            const box = el('div', { class: 'gantt-empty' },
                el('div', { class: 'gantt-empty-title', text: 'Plan this flowchart with a Gantt chart' }),
                el('div', { class: 'cs-muted', text: 'Start from a template or with a blank chart. It\'s saved with this flowchart, and shows up as a branch of the flowchart too.' }));
            const cards = el('div', { class: 'gantt-templates' });
            Object.entries(TEMPLATES).forEach(([key, tpl]) => {
                cards.append(el('button', { class: 'gantt-template', type: 'button', onclick: () => this.applyGanttTemplate(key) },
                    el('b', { text: tpl.name }), el('span', { text: tpl.desc })));
            });
            cards.append(el('button', { class: 'gantt-template', type: 'button', onclick: () => { this.ensureGantt(); this.newGanttTask('task', null); } },
                el('b', { text: 'Blank' }), el('span', { text: 'Start with one task and build it up.' })));
            box.append(cards);
            return box;
        },

        openGanttTemplates() {
            const pop = this.ganttPopup('Templates');
            const has = this.ganttTasks().length > 0;
            if (has) pop.body.append(el('p', { class: 'cs-note', text: 'Using a template replaces the tasks in this chart. Their notes stay in the Gantt notes, under "Removed".' }));
            Object.entries(TEMPLATES).forEach(([key, tpl]) => {
                pop.body.append(el('button', { class: 'gantt-template wide', type: 'button', onclick: async () => {
                    if (has && !(await this.showConfirmDialog(`Replace this chart with the "${tpl.name}" template?`))) return;
                    pop.close();
                    this.applyGanttTemplate(key);
                } }, el('b', { text: tpl.name }), el('span', { text: tpl.desc })));
            });
        },

        buildGanttListRow(t, top, h, narrow) {
            const kids = t.parent ? [] : this.ganttChildren(t.id);
            const complete = this.ganttComplete(t);
            const pct = Math.round(this.ganttProgress(t) * 100);
            const grow = Math.min(Math.sqrt(this._ganttRowScale || 1), 1.4);
            const row = el('div', {
                class: 'gantt-lrow' + (t.parent ? ' sub' : ' main') + (complete ? ' complete' : '') + (t.id === this._ganttSelected ? ' selected' : ''),
                style: `top:${top}px;height:${h}px;font-size:${Math.round(grow * 100)}%;`,
                title: `${this.ganttNumber(t)}  ${t.name}${t.assignee ? ' - ' + t.assignee : ''} (${pct}% done)`,
                onclick: () => this.selectGanttTask(t.id)
            });
            if (!narrow) {
                row.append(el('div', { class: 'gc-note' + (this.ganttHasNoteText(t) ? ' has' : ''), text: '📝', title: 'Open this task\'s notes',
                    onclick: (e) => { e.stopPropagation(); this.selectGanttTask(t.id, true); this.openGanttNotes(t.id); } }));
            }
            const name = el('div', { class: 'gc-name' },
                complete ? el('span', { class: 'gantt-tick', text: '✓' }) : null,
                t.kind === 'milestone' ? el('span', { class: 'gantt-ms-mark', text: '◆', style: `color:${complete ? DONE : this.ganttColor(t)};` }) : null,
                el('span', { class: 'gantt-label', text: t.name,
                    ondblclick: async (e) => {
                        e.stopPropagation();
                        const v = await this.showNameDialog('Rename', t.name);
                        if (v === null || !v.trim()) return;
                        t.name = v.trim();
                        this.ganttChanged(true);
                    } }));
            row.append(name);
            if (!t.parent) {
                row.append(el('span', { class: 'gantt-fold' + (kids.length ? '' : ' none'), text: kids.length ? (t.collapsed ? '▸' : '▾') : '',
                    title: kids.length ? (t.collapsed ? 'Show subtasks' : 'Hide subtasks') : '',
                    onclick: (e) => { e.stopPropagation(); if (!kids.length) return; t.collapsed = !t.collapsed; this.ganttChanged(false); } }));
            } else {
                row.append(el('span', { class: 'gantt-fold none' }));
            }
            row.append(el('div', { class: 'gc-pct' + (kids.length ? '' : ' clickable') + (complete ? ' done' : ''), title: kids.length ? 'From its subtasks' : 'Open the checklist', text: `${pct}%`,
                onclick: (e) => { e.stopPropagation(); this.selectGanttTask(t.id, true); this.openGanttChecklist(t.id); } }));
            return row;
        },

        buildGanttBar(t, top, h, xOf) {
            const sp = this.ganttSpan(t);
            const complete = this.ganttComplete(t);
            const prog = this.ganttProgress(t);
            const color = complete ? DONE : this.ganttColor(t);
            const kids = t.parent ? [] : this.ganttChildren(t.id);
            const ppd = this.gantt.pxPerDay;
            const mid = top + h / 2;
            const sel = t.id === this._ganttSelected;
            if (t.kind === 'milestone') {
                const cx = xOf(sp.s) + Math.min(ppd, 24) / 2;
                const m = el('div', {
                    class: 'gantt-milestone' + (complete ? ' complete' : '') + (sel ? ' selected' : ''),
                    style: `left:${cx - 7}px;top:${mid - 7}px;--c:${color};`,
                    title: `◆ ${t.name} - ${fmtLong(sp.s)}${complete ? ' (reached)' : ''}`
                }, el('span', { class: 'gantt-ms-label' + (complete ? ' done' : ''), text: `${complete ? '✓ ' : ''}${t.name} · ${fmtShort(sp.s)}` }));
                this.wireGanttDrag(m, t, 'move');
                return m;
            }
            const x = xOf(sp.s);
            const w = Math.max((sp.e - sp.s + 1) * ppd, 8);
            // Thicker bars when the rows are stretched to fill the screen.
            const grow = Math.min(Math.sqrt(this._ganttRowScale || 1), 1.6);
            const barH = Math.round((t.parent ? 7 : 13) * grow);
            const b = el('div', {
                class: 'gantt-bar' + (t.parent ? ' sub' : ' main') + (complete ? ' complete' : '') + (sel ? ' selected' : ''),
                style: `left:${x}px;top:${mid - barH / 2}px;width:${w}px;height:${barH}px;--c:${color};`,
                title: `${t.name}\n${fmtLong(sp.s)} - ${fmtLong(sp.e)} (${sp.e - sp.s + 1} days)\n${Math.round(prog * 100)}% done${t.assignee ? '\nOwner: ' + t.assignee : ''}${t.resources ? '\nResources: ' + t.resources : ''}`
            },
            el('div', { class: 'gantt-fill', style: `width:${Math.round(prog * 100)}%;` }));
            // The owner above main bars (as on a classic project chart); a
            // subtask's owner shows when it differs from its main task's.
            const parent = t.parent && this.ganttTask(t.parent);
            // Every bar is labelled: a main task's name above its bar, a
            // subtask's just after its end; the owner follows the name.
            const ownerText = t.assignee && (!parent || parent.assignee !== t.assignee) ? t.assignee : '';
            const label = `${t.name}${ownerText ? ` · ${ownerText}` : ''}`;
            if (!t.parent) b.append(el('span', { class: 'gantt-bar-above' + (complete ? ' done' : ''), text: label }));
            else b.append(el('span', { class: 'gantt-bar-after' + (complete ? ' done' : ''), text: label }));
            if (complete) b.append(el('span', { class: 'gantt-bar-tick', text: '✓' }));
            if (!kids.length) {
                b.append(el('div', { class: 'gantt-handle l' }), el('div', { class: 'gantt-handle r' }));
            }
            this.wireGanttDrag(b, t, kids.length ? 'move-group' : 'move');
            return b;
        },

        // ----- Pointer handling: select, drag to move/resize, pan, zoom -----
        wireGanttDrag(node, t, mode) {
            node.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                const handle = e.target.classList.contains('gantt-handle') ? (e.target.classList.contains('l') ? 'l' : 'r') : null;
                // On touch, a bar has to be selected before it can be dragged, so
                // a swipe over the chart still scrolls it.
                const canDrag = e.pointerType !== 'touch' || this._ganttSelected === t.id;
                const startX = e.clientX;
                const ppd = this.gantt.pxPerDay;
                const orig = new Map();
                const group = mode === 'move-group' ? [t, ...this.ganttChildren(t.id)] : [t];
                group.forEach(g => orig.set(g.id, { s: toDay(g.start), e: toDay(g.end) }));
                let moved = false;
                let lastDelta = 0;
                if (canDrag) { try { node.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ } }
                const onMove = (ev) => {
                    if (!canDrag) return;
                    const dx = ev.clientX - startX;
                    if (!moved && Math.abs(dx) < 4) return;
                    moved = true;
                    const delta = Math.round(dx / ppd);
                    if (delta === lastDelta) return;
                    lastDelta = delta;
                    group.forEach((g) => {
                        const o = orig.get(g.id);
                        if (handle === 'l') g.start = fromDay(Math.min(o.s + delta, o.e));
                        else if (handle === 'r') g.end = fromDay(Math.max(o.e + delta, o.s));
                        else { g.start = fromDay(o.s + delta); g.end = fromDay(o.e + delta); }
                        if (g.kind === 'milestone') g.end = g.start;
                    });
                    // Just this bar follows the pointer; everything is redrawn on release.
                    const geom = this._ganttGeom;
                    const sp = this.ganttSpan(t);
                    if (t.kind === 'milestone') node.style.left = `${(sp.s - geom.r0) * ppd + Math.min(ppd, 24) / 2 - 7}px`;
                    else {
                        node.style.left = `${(sp.s - geom.r0) * ppd}px`;
                        node.style.width = `${Math.max((sp.e - sp.s + 1) * ppd, 6)}px`;
                    }
                    node.classList.add('dragging');
                    this.showGanttDragTip(ev, t);
                };
                const onUp = (ev) => {
                    // A quick flick can arrive with no moves in between.
                    if (ev && ev.type === 'pointerup') onMove(ev);
                    node.removeEventListener('pointermove', onMove);
                    node.removeEventListener('pointerup', onUp);
                    node.removeEventListener('pointercancel', onUp);
                    this.hideGanttDragTip();
                    if (moved) { this._ganttSelected = t.id; this.ganttChanged(false); }
                    else { this.selectGanttTask(t.id); this.openGanttChecklist(t.id); }
                };
                node.addEventListener('pointermove', onMove);
                node.addEventListener('pointerup', onUp);
                node.addEventListener('pointercancel', onUp);
            });
        },

        showGanttDragTip(ev, t) {
            let tip = document.getElementById('gantt-drag-tip');
            if (!tip) { tip = el('div', { id: 'gantt-drag-tip' }); document.body.append(tip); }
            const sp = this.ganttSpan(t);
            tip.textContent = t.kind === 'milestone' ? fmtLong(sp.s) : `${fmtShort(sp.s)} - ${fmtShort(sp.e)} (${sp.e - sp.s + 1} d)`;
            tip.style.left = `${ev.clientX + 12}px`;
            tip.style.top = `${ev.clientY - 30}px`;
            tip.style.display = 'block';
        },
        hideGanttDragTip() { const tip = document.getElementById('gantt-drag-tip'); if (tip) tip.style.display = 'none'; },

        wireGanttScroll(scroll, body) {
            // Mouse wheel zooms around the pointer (Shift + wheel scrolls up and
            // down; a trackpad's sideways swipe still scrolls sideways).
            let wheelFactor = 1;
            let wheelX = 0;
            let wheelPending = false;
            scroll.addEventListener('wheel', (e) => {
                if (e.shiftKey && !(e.ctrlKey || e.metaKey)) return;
                if (!(e.ctrlKey || e.metaKey) && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
                e.preventDefault();
                const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
                wheelFactor *= clamp(Math.exp(-dy * 0.0016), 0.6, 1.6);
                wheelX = e.clientX;
                if (wheelPending) return;
                wheelPending = true;
                requestAnimationFrame(() => {
                    wheelPending = false;
                    const f = wheelFactor;
                    wheelFactor = 1;
                    if (Math.abs(f - 1) > 0.001) this.zoomGantt(f, wheelX, true);
                });
            }, { passive: false });
            // Mouse: drag any empty spot (timeline, task list, header) to pan.
            // A press that doesn't move is still an ordinary click.
            scroll.addEventListener('pointerdown', (e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                if (e.target.closest('.gantt-bar, .gantt-milestone, button, input, select, a, .gc-pct.clickable, .gc-note, .gantt-fold')) return;
                const sx = e.clientX, sy = e.clientY, l = scroll.scrollLeft, t = scroll.scrollTop;
                let moved = false;
                const onBody = !!e.target.closest('.gantt-body');
                const move = (ev) => {
                    if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
                    if (!moved) {
                        moved = true;
                        scroll.classList.add('panning');
                        document.body.style.userSelect = 'none';
                    }
                    scroll.scrollLeft = l - (ev.clientX - sx);
                    scroll.scrollTop = t - (ev.clientY - sy);
                };
                const up = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    window.removeEventListener('pointercancel', up);
                    scroll.classList.remove('panning');
                    document.body.style.userSelect = '';
                    if (moved) {
                        // Swallow the click that follows a drag (it would select a row).
                        const eat = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
                        window.addEventListener('click', eat, { capture: true, once: true });
                        setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 0);
                    } else if (onBody && (this._ganttSelected || this._ganttDockId)) {
                        this._ganttSelected = null;
                        this.closeGanttDock();
                        this.renderGantt();
                    }
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
                window.addEventListener('pointercancel', up);
            });
            // Touch: two fingers pinch to zoom (one finger scrolls natively).
            const pts = new Map();
            let pinch0 = null;
            scroll.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') pts.set(e.pointerId, e.clientX); });
            scroll.addEventListener('pointermove', (e) => {
                if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
                pts.set(e.pointerId, e.clientX);
                if (pts.size === 2) {
                    const [a, b] = [...pts.values()];
                    const dist = Math.abs(a - b);
                    if (!pinch0) pinch0 = { dist, ppd: this.gantt.pxPerDay };
                    else if (pinch0.dist > 20) {
                        const want = clamp(pinch0.ppd * dist / pinch0.dist, MIN_PPD, MAX_PPD);
                        if (Math.abs(want - this.gantt.pxPerDay) / this.gantt.pxPerDay > 0.08) {
                            this.zoomGantt(want / this.gantt.pxPerDay, (a + b) / 2, true);
                        }
                    }
                }
            });
            const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
            scroll.addEventListener('pointerup', end);
            scroll.addEventListener('pointercancel', end);
        },

        zoomGantt(factor, clientX, noSave) {
            const g = this.gantt;
            if (!g) return;
            const scroll = document.querySelector('#gantt-view .gantt-scroll');
            const geom = this._ganttGeom;
            const next = clamp(g.pxPerDay * factor, MIN_PPD, MAX_PPD);
            if (next === g.pxPerDay) return;
            if (scroll && geom) {
                const rect = scroll.getBoundingClientRect();
                const xIn = (clientX === undefined ? rect.left + (rect.width + geom.LIST_W) / 2 : clientX) - rect.left;
                const xTl = Math.max(0, xIn - geom.LIST_W);
                const day = geom.r0 + (scroll.scrollLeft + xTl) / geom.ppd;
                this._ganttAnchor = { day, x: xTl };
            }
            g.pxPerDay = next;
            this.renderGantt();
            if (!noSave) this.autosave();
            else { clearTimeout(this._ganttZoomSave); this._ganttZoomSave = setTimeout(() => this.autosave(), 600); }
        },

        fitGantt() {
            const g = this.gantt;
            const view = document.getElementById('gantt-view');
            if (!g || !g.tasks.length || !view) return;
            const spans = this.ganttTasks().map(t => this.ganttSpan(t));
            const s = Math.min(...spans.map(x => x.s)), e = Math.max(...spans.map(x => x.e));
            const LIST_W = view.clientWidth < 700 ? 175 : 280;
            const avail = Math.max(200, view.clientWidth - LIST_W - 60);
            const from = Math.min(s, todayDay()) - 7;
            g.pxPerDay = clamp(avail / (e - from + 4), MIN_PPD, MAX_PPD);
            this._ganttAnchor = { day: from, x: 0 };
            this.renderGantt();
            this.autosave();
        },

        releaseGanttFocus() {
            const a = document.activeElement;
            if (a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) {
                try { a.blur(); } catch (e) { /* ignore */ }
            }
            const sel = window.getSelection && window.getSelection();
            if (sel && sel.rangeCount && sel.anchorNode && sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest('[contenteditable="true"]')) {
                sel.removeAllRanges();
            }
        },

        selectGanttTask(id, quiet) {
            this.releaseGanttFocus();
            this._ganttSelected = id;
            this.renderGantt();
            if (!quiet) this.focusGanttNoteTitle(id);
        },

        // ----- Popups -----
        ganttPopup(title) {
            const old = document.getElementById('gantt-popup');
            if (old) old.remove();
            const pop = el('div', { id: 'gantt-popup', class: 'cs-popup gantt-popup' });
            const body = el('div');
            const close = () => pop.remove();
            const footer = el('div', { class: 'cs-row', style: 'justify-content:flex-end; margin-top:12px;' });
            pop.append(el('div', { class: 'cs-title', text: title }), body, footer);
            document.body.append(pop);
            return { pop, body, footer, close };
        },

        // The checklist of a task, in a panel at the bottom left of the screen
        // (opened by clicking its bar). It stays open while you work on the
        // chart and follows the selection; a main task with subtasks lists them.
        openGanttChecklist(id) {
            if (!this.ganttTask(id)) return;
            this._ganttDockId = id;
            this.renderGanttDock();
        },

        // In the timeline's bottom-left corner, just right of the task list (on a
        // phone: the bottom of the screen).
        positionGanttDock() {
            const d = document.getElementById('gantt-checklist-dock');
            const sc = document.querySelector('#gantt-view .gantt-scroll');
            if (!d) return;
            if (!sc || window.innerWidth <= 600 || !this._ganttGeom) {
                d.style.left = ''; d.style.bottom = ''; d.style.width = '';
                return;
            }
            const r = sc.getBoundingClientRect();
            const scrollbar = sc.offsetHeight - sc.clientHeight;
            const left = r.left + this._ganttGeom.LIST_W + 12;
            d.style.left = `${Math.round(left)}px`;
            d.style.bottom = `${Math.round(window.innerHeight - r.bottom + scrollbar + 12)}px`;
            d.style.width = `${Math.round(Math.max(220, Math.min(320, r.right - left - 12)))}px`;
        },

        closeGanttDock() {
            this._ganttDockId = null;
            const d = document.getElementById('gantt-checklist-dock');
            if (d) d.remove();
        },

        // Redrawn after every change (undo included), unless an item is being typed in.
        refreshGanttDock() {
            const d = document.getElementById('gantt-checklist-dock');
            if (!this._ganttDockId) return;
            if (!this._ganttMode || !this.ganttTask(this._ganttDockId)) { this.closeGanttDock(); return; }
            if (d && d.contains(document.activeElement) && document.activeElement.type === 'text') return;
            this.renderGanttDock();
        },

        renderGanttDock() {
            const t = this.ganttTask(this._ganttDockId);
            if (!t) { this.closeGanttDock(); return; }
            let d = document.getElementById('gantt-checklist-dock');
            if (!d) {
                d = el('div', { id: 'gantt-checklist-dock', class: 'gantt-dock' });
                document.body.append(d);
            }
            d.innerHTML = '';
            this.positionGanttDock();
            const kids = t.parent ? [] : this.ganttChildren(t.id);
            const c = this.ganttCounts(t);
            const pct = c.total ? Math.round(c.done / c.total * 100) : 0;
            const complete = this.ganttComplete(t);
            d.style.setProperty('--c', complete ? DONE : this.ganttColor(t));
            d.append(
                el('div', { class: 'gantt-dock-head' },
                    el('span', { class: 'gantt-dock-swatch' }),
                    el('span', { class: 'gantt-dock-title' + (complete ? ' done' : ''), text: `${t.kind === 'milestone' ? '◆ ' : ''}${t.name}`, title: t.name }),
                    el('button', { class: 'gantt-dock-x', type: 'button', text: '×', title: 'Close', onclick: () => this.closeGanttDock() })),
                el('div', { class: 'gantt-ck-progress' },
                    el('div', { class: 'gantt-ck-fill' + (pct === 100 ? ' complete' : ''), style: `width:${pct}%;` }),
                    el('span', { text: `${c.done} of ${c.total} done${pct === 100 ? ' ✓' : ''}` })));
            const body = el('div', { class: 'gantt-dock-body' });
            d.append(body);

            if (kids.length) {
                // A main task: its subtasks, each opening its own checklist.
                kids.forEach((k) => {
                    const kc = this.ganttCounts(k);
                    const kp = kc.total ? Math.round(kc.done / kc.total * 100) : 0;
                    const kdone = this.ganttComplete(k);
                    body.append(el('button', { class: 'gantt-dock-sub' + (kdone ? ' done' : ''), type: 'button', title: 'Open its checklist',
                        onclick: () => { this.selectGanttTask(k.id, true); this.openGanttChecklist(k.id); } },
                        el('span', { class: 'gantt-dock-sub-name', text: `${kdone ? '✓ ' : ''}${k.kind === 'milestone' ? '◆ ' : ''}${k.name}` }),
                        el('span', { class: 'gantt-dock-mini' }, el('span', { style: `width:${kp}%;` })),
                        el('span', { class: 'gantt-dock-sub-pct', text: `${kc.done}/${kc.total}` })));
                });
                return;
            }
            if (t.checklist.length === 0) {
                body.append(el('label', { class: 'gantt-ck-item' },
                    el('input', { type: 'checkbox', checked: t.done, onchange: (e) => { t.done = e.target.checked; this.ganttChanged(true); this.renderGanttDock(); } }),
                    el('span', { text: t.kind === 'milestone' ? 'Milestone reached' : 'Done (or add checklist items below)' })));
            }
            t.checklist.forEach((item) => {
                const text = el('input', { class: 'cs-input gantt-ck-text' + (item.done ? ' done' : ''), type: 'text', value: item.text });
                text.addEventListener('change', () => { item.text = text.value; this.ganttChanged(true); });
                text.addEventListener('keydown', (e) => { if (e.key === 'Enter') text.blur(); });
                body.append(el('div', { class: 'gantt-ck-item' },
                    el('input', { type: 'checkbox', checked: item.done, onchange: (e) => { item.done = e.target.checked; this.ganttChanged(true); this.renderGanttDock(); } }),
                    text,
                    el('button', { class: 'cs-btn cs-small-btn cs-danger', type: 'button', text: '×', title: 'Remove', onclick: () => {
                        t.checklist = t.checklist.filter(x => x !== item);
                        this.ganttChanged(true);
                        this.renderGanttDock();
                    } })));
            });
            const add = el('input', { class: 'cs-input', type: 'text', placeholder: 'Add an item...' });
            const doAdd = () => {
                const v = add.value.trim();
                if (!v) return;
                t.checklist.push({ id: uid('ck'), text: v, done: false });
                add.blur();
                this.ganttChanged(true);
                const again = document.querySelector('#gantt-checklist-dock input[placeholder="Add an item..."]');
                if (again) again.focus();
            };
            add.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
            d.append(el('div', { class: 'cs-row gantt-dock-add' }, add,
                el('button', { class: 'cs-btn cs-primary cs-small-btn', type: 'button', text: 'Add', onclick: doAdd })));
        },

        openGanttEditor(id, isNew) {
            const t = this.ganttTask(id);
            if (!t) return;
            const p = this.ganttPopup(isNew ? 'New ' + (t.kind === 'milestone' ? 'milestone' : 'task') : `✎ ${this.ganttNumber(t)}  ${t.name}`);
            const kids = t.parent ? [] : this.ganttChildren(t.id);
            const name = el('input', { class: 'cs-input', type: 'text', value: t.name });
            const kind = el('select', { class: 'cs-input' }, el('option', { value: 'task', text: 'Task (bar)' }), el('option', { value: 'milestone', text: 'Milestone (◆)' }));
            kind.value = t.kind;
            if (kids.length) kind.disabled = true;
            const parent = el('select', { class: 'cs-input' }, el('option', { value: '', text: '- None (a main task) -' }),
                ...this.ganttMains().filter(m => m !== t).map(m => el('option', { value: m.id, text: `${this.ganttNumber(m)}  ${m.name}` })));
            parent.value = t.parent || '';
            if (kids.length) parent.disabled = true;
            const start = el('input', { class: 'cs-input', type: 'date', value: t.start });
            const end = el('input', { class: 'cs-input', type: 'date', value: t.end });
            const owner = el('input', { class: 'cs-input', type: 'text', value: t.assignee, placeholder: 'Who owns it' });
            const res = el('input', { class: 'cs-input', type: 'text', value: t.resources, placeholder: 'e.g. 2 engineers, CNC machine' });
            const color = el('input', { type: 'color', value: this.ganttColor(t), class: 'gantt-color' });
            const depBox = el('div', { class: 'gantt-dep-list' });
            this.ganttOrdered(true).filter(o => o !== t && o.parent !== t.id).forEach((o) => {
                depBox.append(el('label', { class: 'gantt-dep-item' + (o.parent ? ' sub' : '') },
                    el('input', { type: 'checkbox', value: o.id, checked: t.deps.includes(o.id) }),
                    el('span', { text: `${this.ganttNumber(o)}  ${o.name}` })));
            });
            const row = (label, ...inputs) => el('div', { class: 'gantt-form-row' }, el('label', { class: 'cs-label', text: label }), el('div', { class: 'cs-row' }, ...inputs));
            p.body.append(
                row('Name', name),
                row('Type', kind),
                row('Part of', parent),
                kids.length ? el('p', { class: 'cs-muted cs-small', text: 'Dates come from its subtasks.' }) : row('Start / end', start, end),
                row('Owner', owner),
                row('Resources', res),
                t.parent ? null : row('Colour', color),
                el('label', { class: 'cs-label', text: 'Starts after (finish-to-start)' }), depBox);
            const save = () => {
                const oldParent = t.parent;
                t.name = name.value.trim() || t.name;
                if (!kids.length) {
                    t.kind = kind.value;
                    t.parent = parent.value || null;
                    if (toDay(start.value) !== null) t.start = start.value;
                    if (toDay(end.value) !== null) t.end = end.value;
                    if (toDay(t.end) < toDay(t.start)) t.end = t.start;
                    if (t.kind === 'milestone') t.end = t.start;
                }
                t.assignee = owner.value.trim();
                t.resources = res.value.trim();
                if (!t.parent) t.color = color.value === this.ganttColor(Object.assign({}, t, { color: '' })) ? t.color : color.value;
                t.deps = [...depBox.querySelectorAll('input:checked')].map(i => i.value);
                // A task moved under another main task goes after its subtasks.
                if (t.parent && t.parent !== oldParent) {
                    const g = this.gantt;
                    g.tasks = g.tasks.filter(x => x !== t);
                    const sibs = g.tasks.filter(x => x.parent === t.parent);
                    const after = sibs.length ? sibs[sibs.length - 1] : g.tasks.find(x => x.id === t.parent);
                    g.tasks.splice(g.tasks.indexOf(after) + 1, 0, t);
                }
                p.close();
                this.ganttChanged(true);
            };
            name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
            p.footer.append(
                kids.length ? null : el('button', { class: 'cs-btn', type: 'button', text: '☑ Checklist', onclick: () => { save(); this.openGanttChecklist(t.id); } }),
                el('button', { class: 'cs-btn', type: 'button', text: 'Cancel', onclick: p.close }),
                el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Save', onclick: save }));
            setTimeout(() => { name.focus(); name.select(); }, 30);
        },

        // ----- Gantt notes: one Title per main task, a Subheading per subtask -----
        ganttNoteLabel(t) {
            return t.name;
        },

        // Two tasks can share a name: the nth task with this name (at the same
        // level) goes with the nth heading of it.
        ganttNoteOccurrence(t) {
            const label = this.ganttNoteLabel(t);
            const same = this.ganttOrdered(true).filter(o => !o.parent === !t.parent && this.ganttNoteLabel(o) === label);
            return Math.max(0, same.indexOf(t));
        },

        ganttNotesTab(create) {
            const g = this.gantt;
            if (!g) return null;
            let tab = g.notesTabId ? (this.notesTabs || []).find(x => x.id === g.notesTabId) : null;
            if (!tab && create) {
                tab = this.getDefaultNotesTab('Gantt notes');
                tab.content = '<p>Notes for each task in the Gantt chart. Titles here follow the chart - write under them.</p>';
                this.notesTabs.push(tab);
                if (Array.isArray(this.notesPinned)) this.notesPinned.push(`chart:${tab.id}`);
                g.notesTabId = tab.id;
                g.noteTitles = {};
                if (typeof this.renderNotesTabBar === 'function') this.renderNotesTabBar();
            }
            return tab;
        },

        // Rewrites the headings of the Gantt notes to match the chart: a Title per
        // main task, a Subheading per subtask and a Minor heading per checklist
        // item (✓ once ticked), keeping what was written under each one with it.
        syncGanttNotes() {
            const g = this.gantt;
            if (!g || g.tasks.length === 0 && !g.notesTabId) return false;
            const tab = this.ganttNotesTab(true);
            if (!tab) return false;
            const doc = new DOMParser().parseFromString(`<body>${tab.content || ''}</body>`, 'text/html');
            const blocks = Array.from(doc.body.childNodes).filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()));
            // Headings written last time: text -> [ids, in order]. Tasks are
            // Titles/Subheadings ('T'), checklist items Minor headings ('C').
            const kindOfTag = tag => (tag === 'H6' ? 'C' : 'T');
            const byText = new Map();
            Object.entries(g.noteTitles || {}).forEach(([id, text]) => {
                const key = `${id.startsWith('ck:') ? 'C' : 'T'}|${text}`;
                if (!byText.has(key)) byText.set(key, []);
                byText.get(key).push(id);
            });
            const sections = new Map(); // id -> { blocks, folded, title }
            const preamble = [];
            let cur = null;
            blocks.forEach((n) => {
                const isHead = n.nodeType === 1 && /^H[456]$/.test(n.tagName);
                const queue = isHead ? byText.get(`${kindOfTag(n.tagName)}|${n.textContent.trim()}`) : null;
                const id = queue ? queue.find(x => !sections.has(x)) : null;
                if (id) {
                    cur = { id, blocks: [], folded: n.getAttribute('data-folded') === 'true', title: n.textContent.trim() };
                    sections.set(id, cur);
                    return;
                }
                if (cur) cur.blocks.push(n);
                else preamble.push(n);
            });
            const hasContent = bs => bs.some(b => (b.textContent || '').trim() || (b.querySelector && b.querySelector('img')));
            const html = b => b.outerHTML || `<p>${esc(b.textContent)}</p>`;
            const out = [];
            preamble.forEach(b => out.push(html(b)));
            const titles = {};
            const live = new Set();
            const writeSection = (id, tag, label, folded, done) => {
                live.add(id);
                titles[id] = label;
                const sec = sections.get(id);
                // Finished ones are crossed out (data-done, see script.js).
                out.push(`<${tag}${folded && sec && sec.folded ? ' data-folded="true"' : ''}${done ? ' data-done="true"' : ''}>${esc(label)}</${tag}>`);
                // Writing under a heading is ordinary text: an empty normal line
                // sits under any heading with nothing below it yet.
                if (sec && sec.blocks.length) sec.blocks.forEach(b => out.push(html(b)));
                else out.push('<p>&nbsp;</p>');
            };
            this.ganttOrdered(true).forEach((t) => {
                writeSection(t.id, t.parent ? 'h5' : 'h4', this.ganttNoteLabel(t), !t.parent, this.ganttComplete(t));
                t.checklist.forEach((item) => {
                    if (!item.text.trim()) return;
                    writeSection(`ck:${item.id}`, 'h6', `${item.done ? '✓ ' : ''}${item.text.trim()}`, false, item.done);
                });
            });
            sections.forEach((sec, id) => {
                if (live.has(id) || !hasContent(sec.blocks)) return;
                out.push(`<h4>Removed: ${esc(sec.title)}</h4>`);
                sec.blocks.forEach(b => out.push(html(b)));
            });
            const result = out.join('');
            g.noteTitles = titles;
            if (result === tab.content) return false;
            tab.content = result;
            this._ganttNotesSeen = result;
            if (typeof this.refreshEmbeddedEditors === 'function') this.refreshEmbeddedEditors();
            if (typeof this.syncNotesPanesShowingTab === 'function') this.syncNotesPanesShowingTab('chart', tab.id, result);
            return true;
        },

        ganttHasNoteText(t) {
            const tab = this.ganttNotesTab(false);
            if (!tab || !tab.content) return false;
            const label = this.ganttNoteLabel(t);
            const tag = t.parent ? 'H5' : 'H4';
            const doc = new DOMParser().parseFromString(`<body>${tab.content}</body>`, 'text/html');
            const kids = Array.from(doc.body.children);
            const matches = kids.map((k, j) => (k.tagName === tag && k.textContent.trim() === label ? j : -1)).filter(j => j !== -1);
            const i = matches.length ? matches[Math.min(this.ganttNoteOccurrence(t), matches.length - 1)] : -1;
            if (i === -1) return false;
            for (let j = i + 1; j < kids.length; j++) {
                if (/^H[45]$/.test(kids[j].tagName)) break;
                if (kids[j].tagName === 'H6') continue;
                if (kids[j].textContent.trim() || kids[j].querySelector('img')) return true;
            }
            return false;
        },

        ganttNotesOpen() {
            const g = this.gantt;
            if (!g || !g.notesTabId) return false;
            const panel = document.getElementById('reflection-panel');
            const panelOpen = this._leftPanelMode === 'notes' && this._notesTabActive &&
                !!panel && panel.offsetParent !== null && getComputedStyle(panel).display !== 'none';
            return panelOpen && this._activeNotesScope === 'chart' && this.getActiveNotesTabId('chart') === g.notesTabId;
        },

        // Opens the notes panel on the Gantt notes (and that task's title).
        openGanttNotes(taskId) {
            const tab = this.ganttNotesTab(true);
            this.syncGanttNotes();
            this._activeNotesScope = 'chart';
            this.setActiveNotesTabId('chart', tab.id);
            this.openNotesPanel();
            if (typeof this.renderNotesPanel === 'function') this.renderNotesPanel();
            setTimeout(() => {
                this.showEmbeddedEditor('chart', tab.id);
                this.renderNotesTabBar();
                if (taskId) this.focusGanttNoteTitle(taskId, true);
            }, 60);
        },

        // Clicking a task while the Gantt notes are open goes to its title there,
        // unfolding it.
        focusGanttNoteTitle(taskId, force) {
            if (!force && !this.ganttNotesOpen()) return;
            const t = this.ganttTask(taskId);
            if (!t) return;
            const label = this.ganttNoteLabel(t);
            const tryJump = (left) => {
                const editor = this.notesEditor;
                const tab = this.ganttNotesTab(false);
                const ok = editor && tab && editor._noteTabRef && editor._noteTabRef.tabId === tab.id;
                if (!ok) { if (left > 0) setTimeout(() => tryJump(left - 1), 150); return; }
                const root = editor.model.document.getRoot();
                const heads = Array.from(root.getChildren()).filter(c => c.is('element', 'heading4') || c.is('element', 'heading5'));
                const textOf = (h) => { let s = ''; for (const it of h.getChildren()) if (it.is('$text')) s += it.data; return s.trim(); };
                const want = t.parent ? 'heading5' : 'heading4';
                const matches = heads.filter(h => h.is('element', want) && textOf(h) === label);
                const target = matches[Math.min(this.ganttNoteOccurrence(t), matches.length - 1)];
                if (!target) return;
                // A subheading sits inside its main task's Title: open that too.
                if (target.is('element', 'heading5')) {
                    const all = Array.from(root.getChildren());
                    for (let i = all.indexOf(target) - 1; i >= 0; i--) {
                        if (all[i].is('element', 'heading4')) {
                            if (all[i].getAttribute('folded')) this.toggleTitleFold(editor, all[i], false);
                            break;
                        }
                    }
                }
                this.jumpToNotesTitle(editor, target);
                // The caret goes on the (normal text) line under the heading, so
                // typing doesn't add to the heading itself.
                const next = target.nextSibling;
                if (next && next.is('element') && !next.is('element', 'heading4') && !next.is('element', 'heading5')) {
                    try { editor.model.change(w => w.setSelection(w.createPositionAt(next, 0))); } catch (e) { /* not a text block */ }
                }
                // Only the 📝 button puts the cursor in the notes; a click on the
                // chart leaves the keyboard with the chart (so Delete deletes
                // the task, not text).
                if (force && !window.matchMedia('(pointer: coarse)').matches) {
                    try { editor.editing.view.focus(); } catch (e) { /* not on screen */ }
                }
                const viewEl = editor.editing.mapper.toViewElement(target);
                const dom = viewEl && editor.editing.view.domConverter.mapViewToDom(viewEl);
                if (dom) { dom.classList.add('gantt-note-flash'); setTimeout(() => dom.classList.remove('gantt-note-flash'), 1200); }
            };
            tryJump(15);
        },

        // A checklist item renamed in the Gantt notes (its Minor heading edited)
        // takes the new name in the checklist too. Headings are matched to items
        // by position under their task; when that's not clear-cut (a heading
        // added or removed by hand) nothing is changed.
        pullGanttNotesEdits() {
            const g = this.gantt;
            const tab = g && g.notesTabId ? this.ganttNotesTab(false) : null;
            if (!tab || !tab.content || tab.content === this._ganttNotesSeen) return;
            this._ganttNotesSeen = tab.content;
            const doc = new DOMParser().parseFromString(`<body>${tab.content}</body>`, 'text/html');
            // Which task each Title / Subheading belongs to (last written text, in order).
            const byText = new Map();
            Object.entries(g.noteTitles || {}).forEach(([id, text]) => {
                if (id.startsWith('ck:')) return;
                if (!byText.has(text)) byText.set(text, []);
                byText.get(text).push(id);
            });
            const used = new Set();
            const found = new Map(); // taskId -> [h6 texts]
            let cur = null;
            Array.from(doc.body.children).forEach((n) => {
                if (/^H[45]$/.test(n.tagName)) {
                    const q = byText.get(n.textContent.trim());
                    const id = q ? q.find(x => !used.has(x)) : null;
                    if (id) { used.add(id); cur = id; found.set(id, []); }
                    return;
                }
                if (n.tagName === 'H6' && cur) found.get(cur).push(n.textContent.trim());
            });
            let changed = false;
            found.forEach((texts, taskId) => {
                const t = this.ganttTask(taskId);
                if (!t) return;
                const items = t.checklist.filter(i => i.text.trim());
                if (texts.length !== items.length) return;
                items.forEach((item, i) => {
                    const written = texts[i];
                    const expected = `${item.done ? '✓ ' : ''}${item.text.trim()}`;
                    if (written === expected) return;
                    const name = written.replace(/^✓\s*/, '').trim();
                    if (!name || name === item.text.trim()) return;
                    item.text = name;
                    // Remember the heading as written, so the next tidy-up of the
                    // notes still knows it belongs to this item.
                    g.noteTitles[`ck:${item.id}`] = written;
                    changed = true;
                });
            });
            // Saved and redrawn without rewriting the notes (you're typing there).
            if (changed) this.ganttChanged(false);
        },

        // ----- The flowchart branch that mirrors the chart -----
        findGanttFlowRoot() {
            const root = this.rootData;
            if (!root || !Array.isArray(root.children)) return null;
            return root.children.find(c => c && c._gantt === 'root') || null;
        },

        syncGanttFlow() {
            const g = this.gantt;
            const top = this.rootData;
            if (!top || !g) return;
            let branch = this.findGanttFlowRoot();
            if (!g.tasks.length) {
                if (branch && !(branch.children || []).some(c => !c._gantt && !this.isPlaceholderNodeData(c) && (c.name || '').trim())) {
                    top.children = top.children.filter(c => c !== branch);
                    if (!this._ganttMode) this.renderFlowchart(this.rootData);
                }
                return;
            }
            // The top node is the hidden placeholder above the flowchart's own root.
            if (!this.isPlaceholderNodeData(top)) return;
            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            const title = `📅 ${item ? item.title : 'Project'} - Gantt`;
            if (!branch) {
                branch = { name: title, color: '#3d7fd9', _gantt: 'root', children: [] };
                if (!Array.isArray(top.children)) top.children = [];
                // Beside the existing tree, before the trailing "add" placeholder.
                const last = top.children[top.children.length - 1];
                const at = last && this.isPlaceholderNodeData(last) ? top.children.length - 1 : top.children.length;
                top.children.splice(at, 0, branch);
            }
            branch.name = title;
            const nodeFor = (t) => {
                const complete = this.ganttComplete(t);
                const pct = Math.round(this.ganttProgress(t) * 100);
                return {
                    name: `${t.kind === 'milestone' ? '◆ ' : ''}${t.name}${complete ? ' ✓' : (pct ? ` (${pct}%)` : '')}`,
                    color: complete ? FLOW_DONE : this.ganttColor(t)
                };
            };
            // Puts the wanted task nodes into a node's children, in chart order,
            // leaving nodes added by hand (and placeholders) where they are.
            const reconcile = (parentNode, wanted) => {
                const kids = Array.isArray(parentNode.children) ? parentNode.children : [];
                const existing = new Map(kids.filter(k => k && k._gantt && k._gantt !== 'root').map(k => [k._gantt, k]));
                const wantedIds = wanted.map(t => t.id);
                const nodes = wanted.map((t) => {
                    const n = existing.get(t.id) || { _gantt: t.id };
                    const v = nodeFor(t);
                    n.name = v.name;
                    n.color = v.color;
                    delete n._isPlaceholder;
                    return n;
                });
                const out = [];
                let qi = 0;
                kids.forEach((k) => {
                    if (k && k._gantt && k._gantt !== 'root') {
                        if (wantedIds.includes(k._gantt) && qi < nodes.length) out.push(nodes[qi++]);
                        // A deleted task's node goes (along with anything under it).
                    } else {
                        out.push(k);
                    }
                });
                // New ones: after the last task node, before a trailing placeholder.
                while (qi < nodes.length) {
                    let at = out.length;
                    while (at > 0 && this.isPlaceholderNodeData(out[at - 1]) && !(out[at - 1].name || '').trim()) at--;
                    out.splice(at, 0, nodes[qi++]);
                }
                parentNode.children = out;
                return nodes;
            };
            const mainNodes = reconcile(branch, this.ganttMains());
            this.ganttMains().forEach((m, i) => reconcile(mainNodes[i], this.ganttChildren(m.id)));
            this.ensureRightmostPlaceholderNodes(branch);
            if (!this._ganttMode && !this._ganttFlowRenderPending) {
                this._ganttFlowRenderPending = true;
                requestAnimationFrame(() => { this._ganttFlowRenderPending = false; this.renderFlowchart(this.rootData); });
            }
        },

        // Opens the flowchart with this task's node (or the whole Gantt branch)
        // unfolded, its ancestors open and everything else folded.
        showGanttTaskInFlowchart(taskId) {
            this.syncGanttFlow();
            const branch = this.findGanttFlowRoot();
            if (!branch) return;
            let target = branch;
            if (taskId) {
                const find = (n) => {
                    if (n._gantt === taskId) return n;
                    for (const c of (n.children || [])) { const f = find(c); if (f) return f; }
                    return null;
                };
                target = find(branch) || branch;
            }
            // Path from the top to the target.
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
            this.toggleGanttMode(false);
            this.renderFlowchart(this.rootData);
            const d = d3.select('#flowchart').selectAll('g.node').data().find(x => x && x.data === target);
            if (d) {
                this.selectedNode = d;
                if (typeof this.refreshRadialButtons === 'function') this.refreshRadialButtons();
                const svg = d3.select('#flowchart svg');
                if (this._zoomBehavior && !svg.empty() && Number.isFinite(d.x)) {
                    const w = this.flowchartPanel.clientWidth, h = this.flowchartPanel.clientHeight;
                    const k = this.transform.k;
                    svg.transition().duration(350).call(this._zoomBehavior.transform, d3.zoomIdentity.translate(w / 2 - d.x * k, h / 3 - d.y * k).scale(k));
                }
            }
            this.autosave();
        }
    };

    Object.assign(FlowchartViewer.prototype, methods);

    // A different flowchart opened (or the open one updated from elsewhere): its
    // Gantt chart replaces the one on screen.
    const origLoad = FlowchartViewer.prototype.loadFlowchartFromList;
    FlowchartViewer.prototype.loadFlowchartFromList = function (...args) {
        const before = this.currentSlotIndex;
        const r = origLoad.apply(this, args);
        if (before !== this.currentSlotIndex) {
            this._ganttSelected = null;
            this.resetGanttHistory();
        } else {
            // Same flowchart reloaded (e.g. someone else's change synced in).
            this._ganttLastSnap = this.ganttSnapshot();
        }
        if (this._ganttMode) this.renderGantt();
        return r;
    };

    // In the Gantt view, undo/redo (the buttons and Ctrl+Z / Ctrl+Shift+Z, which
    // script.js already sends here) act on the chart instead of the tree.
    const origUndo = FlowchartViewer.prototype.undo;
    const origRedo = FlowchartViewer.prototype.redo;
    const origButtons = FlowchartViewer.prototype.updateUndoRedoButtons;
    FlowchartViewer.prototype.undo = function (...args) {
        return this._ganttMode ? this.undoGantt() : origUndo.apply(this, args);
    };
    FlowchartViewer.prototype.redo = function (...args) {
        return this._ganttMode ? this.redoGantt() : origRedo.apply(this, args);
    };
    FlowchartViewer.prototype.updateUndoRedoButtons = function (...args) {
        if (!this._ganttMode) return origButtons.apply(this, args);
        const canUndo = !!(this._ganttUndo && this._ganttUndo.length);
        const canRedo = !!(this._ganttRedo && this._ganttRedo.length);
        [[this.undoBtn, canUndo], [this.topUndoBtn, canUndo], [this.redoBtn, canRedo], [this.topRedoBtn, canRedo]].forEach(([b, on]) => {
            if (!b) return;
            b.style.opacity = on ? '1' : '0.5';
            b.style.pointerEvents = on ? 'auto' : 'none';
        });
        document.querySelectorAll('#gantt-view .gantt-tb-btn').forEach((b) => {
            if (b.textContent === '↩') b.classList.toggle('disabled', !canUndo);
            if (b.textContent === '↪') b.classList.toggle('disabled', !canRedo);
        });
    };
    // Delete / Backspace removes the selected task (picked by clicking its bar or
    // its name on the left). In the Gantt view these keys never reach the
    // flowchart's own Delete handler, which would remove a hidden node.
    document.addEventListener('keydown', (e) => {
        const app = window.__flowchartApp;
        if (!app || !app._ganttMode) return;
        if (e.key !== 'Delete' && e.key !== 'Del' && e.key !== 'Backspace') return;
        const a = document.activeElement;
        const typing = a && ((a.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(a.type)) ||
            a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
        if (typing) {
            // Ordinary text editing - but keep the flowchart handler out of it.
            if (e.key !== 'Backspace') e.stopImmediatePropagation();
            return;
        }
        e.stopImmediatePropagation();
        if (document.getElementById('gantt-popup')) return;
        if (app.deleteGanttSelected()) e.preventDefault();
    }, true);

    // Also Ctrl+Y, and Cmd+Z / Cmd+Shift+Z on a Mac (script.js handles Ctrl+Z / Ctrl+Shift+Z).
    document.addEventListener('keydown', (e) => {
        const app = window.__flowchartApp;
        if (!app || !app._ganttMode) return;
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return;
        const k = (e.key || '').toLowerCase();
        if (e.metaKey && !e.ctrlKey && k === 'z') {
            e.preventDefault();
            if (e.shiftKey) app.redoGantt(); else app.undoGantt();
        } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'y') {
            e.preventDefault();
            app.redoGantt();
        }
    });

    const origNotesSave = FlowchartViewer.prototype.scheduleNotesAutosave;
    if (origNotesSave) {
        FlowchartViewer.prototype.scheduleNotesAutosave = function (...args) {
            const r = origNotesSave.apply(this, args);
            if (this.gantt && this.gantt.notesTabId) {
                clearTimeout(this._ganttNotesPullTimer);
                this._ganttNotesPullTimer = setTimeout(() => this.pullGanttNotesEdits(), 700);
            }
            return r;
        };
    }

    // A brand-new flowchart starts without a Gantt chart.
    const origNew = FlowchartViewer.prototype.createNewFlowchart;
    FlowchartViewer.prototype.createNewFlowchart = function (...args) {
        const r = origNew.apply(this, args);
        this._ganttSelected = null;
        this.resetGanttHistory();
        if (this._ganttMode) this.renderGantt();
        return r;
    };
})();
