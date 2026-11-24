// ===== Events and reminders =====
// Each flowchart can hold events (`events` in its saved data, so they sync and
// share): a name, a date (picked on a calendar), a time, a reminder (at the
// time, 2 hours / a day / a week before, or a custom number of minutes) and an
// optional repeat (daily, weekly, fortnightly, monthly or every N days).
//
// - Made with ⏰ in the Gantt chart's toolbar, the Kanban board's header or
//   the flowchart's menu.
// - On the Gantt chart a one-off event is a dashed ticker at its date and
//   time (repeating ones aren't drawn); new Kanban cards are dots on a strip
//   under the dates, at the day they were added.
// - A reminder pops up on any view when it's due - and if the site was
//   closed at the time, as soon as it's opened. "Done" dismisses that
//   occurrence (saved, so other devices don't show it again).
(function () {
    if (typeof FlowchartViewer === 'undefined') return;

    const MIN = 60000, HOUR = 3600000, DAY = 86400000;
    const REMIND = { none: null, at: 0, '2h': 2 * HOUR, '1d': DAY, '1w': 7 * DAY };
    const uid = () => `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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
    const fmtWhen = (ms) => {
        const d = new Date(ms);
        return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    const style = document.createElement('style');
    style.textContent = `
        .gh-strip { position: absolute; left: 0; right: 0; top: 56px; height: 16px; border-top: 1px solid rgba(255,255,255,0.12); }
        .gh-dot { position: absolute; top: 4px; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; cursor: pointer; box-shadow: 0 0 0 1.5px rgba(0,0,0,0.35); }
        .gh-dot:hover { transform: scale(1.5); }
        .gh-ev { position: absolute; top: 1px; transform: translateX(-50%); font-size: 11px; line-height: 14px; cursor: pointer; white-space: nowrap; }
        .gantt-event-line { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed #ffcc00; opacity: 0.8; pointer-events: none; z-index: 3; }
        .gantt-event-label { position: absolute; top: 2px; padding: 1px 6px; border-radius: 4px; background: #ffcc00; color: #1d2430; font-size: 11px; font-weight: 600; white-space: nowrap; cursor: pointer; z-index: 4; transform: translateX(-50%); }
        .ev-popup { width: min(440px, 94vw); z-index: 4600; }
        .ev-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        #reminder-pop { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 6000; width: min(420px, 94vw);
            padding: 14px 16px; border-radius: 12px; background: #1e2430; color: #e6eef8; border: 1px solid #ffcc00;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5); font: 14px "Segoe UI", system-ui, Arial, sans-serif; }
        #reminder-pop .rp-title { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
        #reminder-pop .rp-row { padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1); }
        #reminder-pop .rp-when { color: #ffcc00; font-size: 13px; }
        #reminder-pop .rp-sub { color: #9aa6b2; font-size: 12px; }
        #reminder-pop .rp-btns { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
        #reminder-pop button { padding: 5px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #e6eef8; cursor: pointer; font: inherit; font-size: 13px; }
        #reminder-pop button.primary { background: #ffcc00; border-color: #ffcc00; color: #1d2430; font-weight: 700; }
    `;
    document.head.append(style);

    const sanitizeEvents = (raw) => (Array.isArray(raw) ? raw : []).filter(e => e && typeof e.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '')).map(e => ({
        id: e.id,
        name: typeof e.name === 'string' && e.name.trim() ? e.name : 'Event',
        date: e.date,
        time: /^\d{2}:\d{2}$/.test(e.time || '') ? e.time : '09:00',
        remind: Object.prototype.hasOwnProperty.call(REMIND, e.remind) || e.remind === 'custom' ? e.remind : 'at',
        remindMins: Number.isFinite(+e.remindMins) ? Math.max(0, Math.round(+e.remindMins)) : 30,
        repeat: ['', 'daily', 'weekly', 'fortnightly', 'monthly', 'every'].includes(e.repeat) ? e.repeat : '',
        every: Number.isFinite(+e.every) && +e.every > 0 ? Math.round(+e.every) : 3,
        ack: Number.isFinite(e.ack) ? e.ack : 0
    }));

    // The occurrence times of an event up to `until` (one-off: just the one).
    const startOf = ev => new Date(`${ev.date}T${ev.time}:00`).getTime();
    const occurrenceBefore = (ev, until) => {
        const s = startOf(ev);
        if (!ev.repeat) return s;
        if (ev.repeat === 'monthly') {
            const d = new Date(s);
            let last = s;
            for (let k = 1; k < 1200; k++) {
                const n = new Date(d.getFullYear(), d.getMonth() + k, d.getDate(), d.getHours(), d.getMinutes()).getTime();
                if (n > until) break;
                last = n;
            }
            return last;
        }
        const step = ({ daily: 1, weekly: 7, fortnightly: 14, every: ev.every })[ev.repeat] * DAY;
        if (until < s) return s;
        return s + Math.floor((until - s) / step) * step;
    };
    const offsetOf = ev => (ev.remind === 'custom' ? ev.remindMins * MIN : REMIND[ev.remind]);
    // The reminder due now, if any: { occ, at } (the latest occurrence whose
    // reminder time has passed and that hasn't been dismissed).
    const dueReminder = (ev, now) => {
        const off = offsetOf(ev);
        if (off === null || off === undefined) return null;
        const occ = occurrenceBefore(ev, now + off);
        const at = occ - off;
        if (at > now || occ <= (ev.ack || 0)) return null;
        // A one-off long past (over a week) without being seen still shows; a
        // repeating one only its latest occurrence (handled above).
        return { occ, at };
    };

    const methods = {
        ensureEvents() { if (!Array.isArray(this.events)) this.events = []; return this.events; },

        openEventEditor(evId, presetDate) {
            const events = this.ensureEvents();
            const ev = evId ? events.find(x => x.id === evId) : null;
            const old = document.getElementById('event-popup');
            if (old) old.remove();
            const pop = el('div', { id: 'event-popup', class: 'cs-popup ev-popup' });
            const close = () => pop.remove();
            const today = new Date();
            const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const name = el('input', { class: 'cs-input', type: 'text', value: ev ? ev.name : '', placeholder: 'e.g. Supplier meeting' });
            const date = el('input', { class: 'cs-input', type: 'date', value: ev ? ev.date : (presetDate || iso(today)) });
            const time = el('input', { class: 'cs-input', type: 'time', value: ev ? ev.time : '09:00' });
            const remind = el('select', { class: 'cs-input' },
                el('option', { value: 'at', text: 'On the day, at the time' }),
                el('option', { value: '2h', text: '2 hours before' }),
                el('option', { value: '1d', text: 'The day before' }),
                el('option', { value: '1w', text: 'A week before' }),
                el('option', { value: 'custom', text: 'Custom...' }),
                el('option', { value: 'none', text: 'No reminder' }));
            remind.value = ev ? ev.remind : 'at';
            const mins = el('input', { class: 'cs-input', type: 'number', min: '0', step: '5', value: String(ev ? ev.remindMins : 30) });
            const minsRow = el('div', { class: 'cs-row' }, mins, el('span', { class: 'cs-muted', text: 'minutes before' }));
            const repeat = el('select', { class: 'cs-input' },
                el('option', { value: '', text: 'Does not repeat' }),
                el('option', { value: 'daily', text: 'Every day' }),
                el('option', { value: 'weekly', text: 'Every week' }),
                el('option', { value: 'fortnightly', text: 'Every fortnight' }),
                el('option', { value: 'monthly', text: 'Every month' }),
                el('option', { value: 'every', text: 'Every ... days' }));
            repeat.value = ev ? ev.repeat : '';
            const every = el('input', { class: 'cs-input', type: 'number', min: '1', step: '1', value: String(ev ? ev.every : 3) });
            const everyRow = el('div', { class: 'cs-row' }, el('span', { class: 'cs-muted', text: 'Every' }), every, el('span', { class: 'cs-muted', text: 'days' }));
            const sync = () => { minsRow.style.display = remind.value === 'custom' ? '' : 'none'; everyRow.style.display = repeat.value === 'every' ? '' : 'none'; };
            remind.addEventListener('change', sync);
            repeat.addEventListener('change', sync);
            sync();
            const lab = t => el('label', { class: 'cs-label', text: t });
            pop.append(
                el('div', { class: 'cs-title', text: ev ? '⏰ Event' : '⏰ New event' }),
                lab('Name'), el('div', { class: 'cs-row' }, name),
                el('div', { class: 'ev-two' }, el('div', null, lab('Date'), date), el('div', null, lab('Time'), time)),
                lab('Reminder'), el('div', { class: 'cs-row' }, remind), minsRow,
                lab('Repeat'), el('div', { class: 'cs-row' }, repeat), everyRow,
                el('p', { class: 'cs-muted cs-small', text: 'One-off events show on the Gantt chart as a dashed line. Reminders pop up on any view - and when you next open the site, if it was closed at the time.' }));
            const save = () => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) { this.showNotification('Pick a date.'); return; }
                const data = {
                    id: ev ? ev.id : uid(), name: name.value.trim() || 'Event', date: date.value, time: time.value || '09:00',
                    remind: remind.value, remindMins: Math.max(0, Math.round(+mins.value || 0)), repeat: repeat.value,
                    every: Math.max(1, Math.round(+every.value || 1)), ack: ev ? ev.ack : 0
                };
                // Moving an event forward lets its reminder show again.
                if (ev && startOf(data) !== startOf(ev)) data.ack = 0;
                if (ev) Object.assign(ev, data); else events.push(data);
                close();
                this.eventsChanged();
            };
            const footer = el('div', { class: 'cs-row', style: 'justify-content:flex-end; margin-top:12px;' },
                ev ? el('button', { class: 'cs-btn', type: 'button', text: '🗑 Delete', onclick: () => { this.events = events.filter(x => x !== ev); close(); this.eventsChanged(); } }) : null,
                el('span', { style: 'flex:1' }),
                el('button', { class: 'cs-btn', type: 'button', text: 'Cancel', onclick: close }),
                el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Save', onclick: save }));
            pop.append(footer);
            document.body.append(pop);
            setTimeout(() => name.focus(), 30);
        },

        eventsChanged() {
            this.autosave();
            if (this._ganttMode && typeof this.renderGantt === 'function') this.renderGantt();
            this.updateReminderIndex();
            this.checkReminders();
        },

        // The Gantt chart: the strip under the dates (new cards as dots, events'
        // names) and the events' dashed lines.
        ganttDecorate(head, body, xOf, ppd, r0, r1) {
            const strip = el('div', { class: 'gh-strip' });
            head.append(strip);
            const dayOf = ms => { const d = new Date(ms); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
            // Kanban cards, at the day they were added.
            const k = this.kanban;
            if (k && Array.isArray(k.cards)) {
                k.cards.forEach((c) => {
                    if (!Number.isFinite(c.created)) return;
                    const day = dayOf(c.created);
                    if (day < r0 || day > r1) return;
                    const l = c.labels && c.labels.length && typeof this.kbLabel === 'function' ? this.kbLabel(c.labels[0]) : null;
                    strip.append(el('div', { class: 'gh-dot', style: `left:${xOf(day) + Math.min(ppd, 24) / 2}px; background:${l ? l.color : '#4c9aff'};`,
                        title: `Card: ${c.title} (added ${new Date(c.created).toLocaleDateString()})`,
                        onclick: () => { this._kbSelected = c.id; if (typeof this.toggleKanbanMode === 'function') this.toggleKanbanMode(true); } }));
                });
            }
            // One-off events: a dashed line at their date and time.
            // Labels step down a little so ones close together don't sit on top of each other.
            this.ensureEvents().filter(ev => !ev.repeat).sort((a, b) => startOf(a) - startOf(b)).forEach((ev, n) => {
                const t = startOf(ev);
                const day = dayOf(t);
                if (day < r0 || day > r1) return;
                const d = new Date(t);
                const x = xOf(day) + ppd * ((d.getHours() * 60 + d.getMinutes()) / 1440);
                body.append(el('div', { class: 'gantt-event-line', style: `left:${x}px;` }));
                body.append(el('div', { class: 'gantt-event-label', style: `left:${x}px; top:${2 + (n % 3) * 20}px;`, text: `⏰ ${ev.name}`, title: fmtWhen(t), onclick: (e) => { e.stopPropagation(); this.openEventEditor(ev.id); } }));
            });
        },

        // ----- Reminders across every flowchart -----
        // A small index of every flowchart's events (kept on this device) so all
        // of them are checked, not just the open one.
        updateReminderIndex(rebuild) {
            let idx = {};
            try { idx = rebuild ? {} : JSON.parse(localStorage.getItem('flowchart-reminders') || '{}'); } catch (e) { idx = {}; }
            if (rebuild) {
                (this.flowchartList || []).forEach((item, i) => {
                    if (i === this.currentSlotIndex) return;
                    try { const ev = sanitizeEvents(JSON.parse(item.data || '{}').events); if (ev.length) idx[item.title] = ev; } catch (e) { /* unreadable */ }
                });
            }
            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            if (item) { if (this.ensureEvents().length) idx[item.title] = this.events; else delete idx[item.title]; }
            try { localStorage.setItem('flowchart-reminders', JSON.stringify(idx)); } catch (e) { /* full */ }
            this._reminderIndex = idx;
        },

        checkReminders() {
            const now = Date.now();
            const idx = this._reminderIndex || {};
            const due = [];
            Object.entries(idx).forEach(([title, list]) => (list || []).forEach((ev) => {
                const r = dueReminder(ev, now);
                if (r && !(this._snoozed && this._snoozed[`${ev.id}@${r.occ}`] > now)) due.push({ title, ev, r });
            }));
            this.showReminders(due);
        },

        showReminders(due) {
            let pop = document.getElementById('reminder-pop');
            if (!due.length) { if (pop) pop.remove(); return; }
            if (!pop) { pop = el('div', { id: 'reminder-pop' }); document.body.append(pop); }
            pop.innerHTML = '';
            pop.append(el('div', { class: 'rp-title', text: `⏰ Reminder${due.length > 1 ? 's' : ''}` }));
            due.forEach(({ title, ev, r }) => {
                const soon = r.occ - Date.now();
                const rel = soon > 0 ? `in ${soon < HOUR ? Math.round(soon / MIN) + ' min' : soon < DAY ? Math.round(soon / HOUR) + ' h' : Math.round(soon / DAY) + ' days'}` : (Date.now() - r.occ < HOUR ? 'now' : 'missed');
                pop.append(el('div', { class: 'rp-row' },
                    el('div', null, el('b', { text: ev.name })),
                    el('div', { class: 'rp-when', text: `${fmtWhen(r.occ)} - ${rel}` }),
                    el('div', { class: 'rp-sub', text: title }),
                    el('div', { class: 'rp-btns' },
                        el('button', { type: 'button', text: 'Snooze 10 min', onclick: () => { if (!this._snoozed) this._snoozed = {}; this._snoozed[`${ev.id}@${r.occ}`] = Date.now() + 10 * MIN; this.checkReminders(); } }),
                        el('button', { type: 'button', class: 'primary', text: 'Done', onclick: () => this.dismissReminder(title, ev.id, r.occ) }))));
            });
        },

        // "Done": that occurrence is dismissed, in the flowchart's own data.
        dismissReminder(title, evId, occ) {
            const item = this.flowchartList && this.flowchartList[this.currentSlotIndex];
            if (item && item.title === title) {
                const ev = this.ensureEvents().find(x => x.id === evId);
                if (ev) ev.ack = occ;
                this.autosave();
            } else {
                const other = (this.flowchartList || []).find(x => x.title === title);
                if (other) {
                    try {
                        const data = JSON.parse(other.data);
                        (data.events || []).forEach((e) => { if (e.id === evId) e.ack = occ; });
                        other.data = JSON.stringify(data, null, 2);
                        this.saveFlowchartList();
                        if (typeof this.scheduleCloudPush === 'function') this.scheduleCloudPush();
                    } catch (e) { /* unreadable */ }
                }
                const list = this._reminderIndex && this._reminderIndex[title];
                (list || []).forEach((e) => { if (e.id === evId) e.ack = occ; });
                try { localStorage.setItem('flowchart-reminders', JSON.stringify(this._reminderIndex)); } catch (e) { /* full */ }
            }
            this.updateReminderIndex();
            this.checkReminders();
        }
    };
    methods.sanitizeEvents = sanitizeEvents;

    Object.assign(FlowchartViewer.prototype, methods);
    const proto = FlowchartViewer.prototype;

    // A flowchart opened: its events become the open ones.
    const origLoad = proto.loadFlowchartFromList;
    proto.loadFlowchartFromList = function (...args) {
        const r = origLoad.apply(this, args);
        if (!this._remindersStarted) {
            // First load: every flowchart's events are indexed, reminders checked
            // (anything missed while the site was closed shows now), then every
            // 30 seconds.
            this._remindersStarted = true;
            this.updateReminderIndex(true);
            setTimeout(() => this.checkReminders(), 1500);
            setInterval(() => this.checkReminders(), 30000);
        } else {
            this.updateReminderIndex();
        }
        return r;
    };

    // Buttons: Gantt toolbar, Kanban header, flowchart menu.
    const origToolbar = proto.buildGanttToolbar;
    if (origToolbar) {
        proto.buildGanttToolbar = function (...args) {
            const top = origToolbar.apply(this, args);
            const bar = top.classList.contains('gantt-toolbar') ? top : top.querySelector('.gantt-toolbar');
            if (bar) bar.append(el('button', { class: 'gantt-tb-btn', type: 'button', text: '⏰ Event', title: 'Add an event, with a reminder', onclick: () => this.openEventEditor() }));
            return top;
        };
    }
    const origKbHeader = proto.buildKanbanHeader;
    if (origKbHeader) {
        proto.buildKanbanHeader = function (...args) {
            const head = origKbHeader.apply(this, args);
            const actions = head.querySelector('.kb-head-actions');
            if (actions) actions.prepend(el('button', { class: 'kb-btn', type: 'button', text: '⏰', title: 'Add an event, with a reminder', onclick: () => this.openEventEditor() }));
            return head;
        };
    }
    const addFlowButtons = () => {
        const desk = document.querySelector('.desktop-controls');
        if (desk && !document.getElementById('event-btn')) {
            const b = el('div', { class: 'reset-view-btn', id: 'event-btn', title: 'Add an event, with a reminder', text: '⏰ Event' });
            b.addEventListener('click', () => { const app = window.__flowchartApp; if (app) app.openEventEditor(); });
            desk.append(b);
        }
        const menu = document.getElementById('hamburger-gantt');
        if (menu && !document.getElementById('hamburger-event')) {
            const m = el('button', { class: 'menu-item', id: 'hamburger-event', text: '⏰ Event' });
            m.addEventListener('click', (e) => { e.stopPropagation(); const app = window.__flowchartApp; if (app) app.openEventEditor(); });
            menu.after(m);
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addFlowButtons); else addFlowButtons();
})();
