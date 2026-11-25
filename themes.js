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
    // (Red is for assumptions - pink nodes - and nothing else.)
    const MAP = {
        '#00a67e': '#2cc98a', '#2f8f6e': '#2cc98a', // green
        '#e75480': '#f2607c', // pink: assumptions
        '#0074d9': '#4db8f0', '#0c66e4': '#4db8f0', '#3d7fd9': '#4db8f0', '#4c9aff': '#8fd0f5', // blue
        '#ffcc00': '#ffcc00', // yellow (requirements), as the criteria bar's button
        '#5e6c84': '#4db8f0', // row
        '#6e5dc6': '#a77bea', // card
        '#2e9e5b': '#3fb92c', // done
        '#c9372c': '#e58a00', // over its limit
        '#323a4a': '#f6f1e5' // placeholder
    };
    const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
    let app = null;
    // The Kanban branch by what each node is: rows, columns, cards.
    const kanbanColor = (id, col) => {
        const k = app && app.kanban;
        if (id === 'root') return '#10d98f';
        // Rows and columns all have the one colour.
        if (id.startsWith('row:')) return '#4db8f0';
        if (id.startsWith('col:')) return '#4db8f0';
        if (col === '#2e9e5b' || col === '#c9372c') return null;
        if (id.startsWith('ck:')) return ['#a77bea', '#ef9126', '#2fb5a0', '#3fa8dd', '#63b53a'][hash(id) % 5];
        return ['#a77bea', '#1fb955'][hash(id) % 2];
    };
    // Node text is white, each colour deepened just until white stands out on it.
    // Only the requirements' yellow keeps its colour, with dark text.
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
    const isLight = rgb => rgb[0] > 240 && rgb[1] > 200 && rgb[2] < 110;
    const toHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
    // A little of the paper in every colour.
    const pastel = (hex) => {
        const rgb = rgbOf(hex);
        return rgb ? toHex(rgb.map((v, i) => Math.round(v + ([246, 241, 229][i] - v) * 0.2))) : hex;
    };
    const readable = hex => pastel(deepen(hex));
    const deepen = (hex) => {
        const rgb = rgbOf(hex);
        if (!rgb || isLight(rgb) || hex === '#4db8f0') return hex; // (baby blue stays as it is)
        let [h, s, l] = toHsl(rgb);
        let out = fromHsl(h, s, l);
        while (l > 0.1 && 1.05 / (lum(out) + 0.05) < 2.8) { l -= 0.01; out = fromHsl(h, s, l); }
        return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
    };
    window.flowThemeTextColor = (fill) => { const rgb = isPaper() && rgbOf(fill); return rgb ? (isLight(rgb) ? '#20302a' : '#ffffff') : null; };
    // The Gantt's red phases are drawn orange (a red picked by hand stays red).
    const notRed = (hex, data) => {
        const rgb = data && data._gantt && rgbOf(hex);
        if (!rgb) return hex;
        const [h, sat, l] = toHsl(rgb);
        return sat > 0.25 && hex.toLowerCase() !== '#e75480' && (h >= 325 || h <= 24) ? toHex(fromHsl(30, sat, l)) : hex;
    };
    // An empty node's dashed outline: a tint of what it hangs from.
    window.flowThemePlaceholderStroke = (parent) => {
        if (!isPaper()) return null;
        const p = parent && parent.data;
        const rgb = p && !p._isPlaceholder && rgbOf(window.flowThemeNodeColor(p.color, p));
        if (!rgb) return '#b5b7a0';
        const [h, sat, l] = toHsl(rgb);
        return toHex(fromHsl(h, sat * 0.55, Math.min(0.66, l)));
    };
    window.flowThemeNodeColor = (col, data) => {
        if (!isPaper()) return null;
        const c = (col || '#00a67e').toLowerCase();
        // A colour picked by hand on a Kanban node stays that colour.
        const auto = ['#0c66e4', '#5e6c84', '#6e5dc6', '#2e9e5b', '#c9372c'].includes(c);
        if (data && data._kanban && auto) { const k = kanbanColor(data._kanban, c); if (k) return readable(k); }
        return readable(MAP[c] || notRed(c, data));
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
