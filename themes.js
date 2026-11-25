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
        '#ffcc00': '#ffcc00', // yellow (requirements), as the criteria bar's button
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
    // Light, warm nodes (beige, yellow) keep their colour and take dark text;
    // every other one is muted and deepened until white text reads well on it.
    const rgbOf = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const lum = (rgb) => { const f = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    const toHsl = ([r, g, b]) => {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
        if (!d) return [0, 0, l];
        const h = mx === r ? ((g - b) / d + 6) % 6 : (mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
        return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
    };
    const fromHsl = (h, s, l) => {
        const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
        return [0, 8, 4].map(n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
    };
    const isLight = (rgb) => { const [h] = toHsl(rgb); const L = lum(rgb); return L > 0.72 || (h >= 30 && h <= 60 && L > 0.5); };
    const readable = (hex) => {
        const rgb = rgbOf(hex);
        if (!rgb || isLight(rgb)) return hex;
        let [h, s, l] = toHsl(rgb);
        if (s > 0.45) s = 0.45 + (s - 0.45) * 0.15;
        let out = fromHsl(h, s, l);
        while (l > 0.1 && 1.05 / (lum(out) + 0.05) < 4.5) { l -= 0.01; out = fromHsl(h, s, l); }
        return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
    };
    window.flowThemeTextColor = (fill) => { const rgb = isPaper() && rgbOf(fill); return rgb ? (isLight(rgb) ? '#2f3d49' : '#ffffff') : null; };
    window.flowThemeNodeColor = (col, data) => {
        if (!isPaper()) return null;
        const c = (col || '#00a67e').toLowerCase();
        // A colour picked by hand on a Kanban node stays that colour.
        const auto = ['#0c66e4', '#5e6c84', '#6e5dc6', '#2e9e5b', '#c9372c'].includes(c);
        if (data && data._kanban && auto) { const k = kanbanColor(data._kanban, c); if (k) return readable(k); }
        return readable(MAP[c] || c);
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
