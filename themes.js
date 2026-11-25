// ===== Themes =====
// "Original" is the app as it always was. "Paper" is the light one: warm paper,
// sage, tan and rust (themes.css). The choice is kept on this device; index.html
// sets the class before the first paint. Themes only change how things are
// drawn - no colour in a flowchart is ever changed by one.
(function () {
    const KEY = 'flowchart-theme';
    const THEMES = [
        { id: 'original', name: 'Original', note: 'Dark', sw: ['#323a4a', '#0f1724', '#00a67e', '#e75480'] },
        { id: 'paper', name: 'Paper', note: 'Light', sw: ['#fbfaf2', '#e2cda3', '#6f8f69', '#a4502f'] }
    ];
    const current = () => {
        let t = null;
        try { t = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
        return THEMES.some(x => x.id === t) ? t : 'original';
    };
    const isPaper = () => document.documentElement.classList.contains('theme-paper');

    // ----- Node colours on paper -----
    const MAP = {
        '#00a67e': '#a9b98c', '#2f8f6e': '#a9b98c', // green
        '#e75480': '#a9593a', // pink
        '#0074d9': '#64788a', '#0c66e4': '#64788a', '#3d7fd9': '#64788a', '#4c9aff': '#7f98a8', // blue
        '#ffcc00': '#d29a42', // yellow
        '#5e6c84': '#64788a', // row
        '#6e5dc6': '#e6dac2', // card
        '#2e9e5b': '#56794f', // done
        '#c9372c': '#a4452b', // over its limit
        '#323a4a': '#fdfcf5' // placeholder
    };
    const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
    let app = null;
    // The Kanban branch by what each node is: rows, columns by their place, cards.
    const kanbanColor = (id, col) => {
        const k = app && app.kanban;
        if (id === 'root') return '#a9b98c';
        if (col === '#2e9e5b' || col === '#c9372c') return null;
        if (id.startsWith('row:')) {
            const i = k ? k.rows.findIndex(r => `row:${r.id}` === id) : 0;
            return ['#64788a', '#a9593a', '#7c8a5c', '#8a6a4a'][Math.max(0, i) % 4];
        }
        if (id.startsWith('col:')) {
            const c = k && k.columns.find(x => `col:${x.id}` === id);
            const inRow = c ? k.columns.filter(x => x.row === c.row) : [];
            return ['#d29a42', '#8da584', '#b9a37c', '#7f98a8'][Math.max(0, inRow.indexOf(c)) % 4];
        }
        if (id.startsWith('ck:')) return ['#e6dac2', '#e6dac2', '#cdb28a'][hash(id) % 3];
        return ['#e6dac2', '#a7b795'][hash(id) % 2];
    };
    window.flowThemeNodeColor = (col, data) => {
        if (!isPaper()) return null;
        const c = (col || '#00a67e').toLowerCase();
        // A colour picked by hand on a Kanban node stays that colour.
        const auto = ['#0c66e4', '#5e6c84', '#6e5dc6', '#2e9e5b', '#c9372c'].includes(c);
        if (data && data._kanban && auto) { const k = kanbanColor(data._kanban, c); if (k) return k; }
        return MAP[c] || c;
    };

    // Kanban labels (and their tags and event dots).
    const LABELS = {
        '#1f845a': '#5f8258', '#0c66e4': '#64788a', '#6e5dc6': '#7d6474', '#e2b203': '#d29a42',
        '#c9372c': '#a4452b', '#227d9b': '#6d8f8c', '#ae4787': '#9a6068', '#5b7f24': '#8d9a5f', '#4c9aff': '#a9b98c'
    };
    window.flowThemeLabelColor = (c) => (isPaper() && LABELS[String(c).toLowerCase()]) || c;

    // ----- Choosing -----
    const meta = (name, value) => { const m = document.querySelector(`meta[name="${name}"]`); if (m) m.setAttribute('content', value); };
    const apply = (id, redraw) => {
        const paper = id === 'paper';
        document.documentElement.classList.toggle('theme-paper', paper);
        meta('color-scheme', paper ? 'light' : 'dark');
        meta('theme-color', paper ? '#f3eee2' : '#1a1e27');
        if (redraw && app && app.rootData) {
            try {
                app.renderFlowchart(app.rootData);
                if (app._kanbanMode && typeof app.renderKanban === 'function') app.renderKanban();
                if (app._ganttMode && typeof app.renderGantt === 'function') app.renderGantt();
                if (app.notesEditor && typeof app.notesEditor._noteDecorate === 'function') app.notesEditor._noteDecorate();
                if (typeof app.refreshRadialButtons === 'function') app.refreshRadialButtons();
            } catch (e) { console.error('Theme:', e); }
        }
    };
    const choose = (id) => {
        try { localStorage.setItem(KEY, id); } catch (e) { /* not kept */ }
        apply(id, true);
    };
    const close = () => {
        const m = document.getElementById('themes-menu');
        if (m) m.remove();
        document.removeEventListener('mousedown', outside, true);
        document.removeEventListener('keydown', onKey, true);
    };
    const outside = (e) => { if (!e.target.closest('#themes-menu, #top-themes-btn')) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const open = (anchor) => {
        if (document.getElementById('themes-menu')) { close(); return; }
        const m = document.createElement('div');
        m.id = 'themes-menu';
        const h = document.createElement('div');
        h.className = 'tm-title';
        h.textContent = 'Themes';
        m.append(h);
        THEMES.forEach((t) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tm-item' + (current() === t.id ? ' on' : '');
            const sw = document.createElement('span');
            sw.className = 'tm-sw';
            t.sw.forEach((c) => { const i = document.createElement('i'); i.style.background = c; sw.append(i); });
            const n = document.createElement('span');
            n.className = 'tm-name';
            n.textContent = t.name;
            const s = document.createElement('small');
            s.textContent = t.note;
            b.append(sw, n, s);
            b.addEventListener('click', () => { choose(t.id); close(); });
            m.append(b);
        });
        document.body.append(m);
        const r = anchor && anchor.offsetParent !== null ? anchor.getBoundingClientRect() : null;
        const w = m.offsetWidth;
        const ht = m.offsetHeight;
        const left = r ? (r.left - w - 8 > 4 ? r.left - w - 8 : r.right + 8) : (window.innerWidth - w) / 2;
        const top = r ? r.top : 70;
        m.style.left = `${Math.max(6, Math.min(left, window.innerWidth - w - 6))}px`;
        m.style.top = `${Math.max(6, Math.min(top, window.innerHeight - ht - 6))}px`;
        setTimeout(() => {
            document.addEventListener('mousedown', outside, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
    };

    const addButtons = () => {
        const col = document.querySelector('.zoom-controls');
        if (col && !document.getElementById('top-themes-btn')) {
            const b = document.createElement('div');
            b.className = 'zoom-btn';
            b.id = 'top-themes-btn';
            b.title = 'Themes';
            b.textContent = '🎨';
            b.addEventListener('click', () => open(b));
            col.insertBefore(b, document.getElementById('top-help-btn'));
        }
        const menu = document.getElementById('hamburger-dropdown');
        if (menu && !document.getElementById('hamburger-themes')) {
            const b = document.createElement('button');
            b.className = 'menu-item';
            b.id = 'hamburger-themes';
            b.textContent = '🎨 Themes';
            b.addEventListener('click', () => {
                menu.classList.remove('open');
                const h = document.getElementById('hamburger-menu');
                if (h) h.classList.remove('active');
                open(null);
            });
            menu.insertBefore(b, document.getElementById('hamburger-help'));
        }
    };

    apply(current(), false);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButtons); else addButtons();
    // Another tab of the app changed it.
    window.addEventListener('storage', (e) => { if (e.key === KEY) apply(current(), true); });

    if (typeof FlowchartViewer !== 'undefined') {
        const orig = FlowchartViewer.prototype.renderFlowchart;
        FlowchartViewer.prototype.renderFlowchart = function (...args) { app = this; return orig.apply(this, args); };
    }
})();
