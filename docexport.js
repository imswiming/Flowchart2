// ===== Everything as one editable document =====
// Export All > "📄 Editable document" makes a single web page holding every
// flowchart, in the light (Paper) theme: its notes (folded until opened), the
// Kanban board as a picture (click a card on it to jump to that card), the Kanban
// cards with their notes and links (folded too; only the columns they have
// something in), a picture of each card's own flowchart when it has one, and the
// whole flowchart as a picture you can drag and zoom. (Gantt and events aren't
// shown; they still travel inside the page.) Open it in any browser, read it, edit
// the text and tick boxes, press "Save edited copy" - and Import All >
// "📄 Import document" puts it all back in one step.
//
// - Everything the app stores travels inside the page (as JSON), so what isn't
//   shown comes back too: pictures, drawings, matrices, layout.
// - Each editable piece carries the place it came from (data-f). Importing takes
//   only the pieces whose text differs from what was exported.
(function () {
    if (typeof FlowchartViewer === 'undefined') return;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const stamp = (at, by) => (typeof window.__stampText === 'function' ? window.__stampText(at, by) : '');
    // The card emoji and (Simplify?) endings are the app's own, not the name.
    const plain = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

    // Notes as they can safely be shown in a page: no scripts, no event
    // handlers, only ordinary links. Pictures become placeholders filled in from
    // the page's own data.
    const cleanHtml = (htmlText) => {
        const doc = new DOMParser().parseFromString(`<body>${htmlText || ''}</body>`, 'text/html');
        doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form, base, svg, math').forEach(n => n.remove());
        doc.querySelectorAll('*').forEach((n) => {
            Array.from(n.attributes).forEach((a) => {
                const v = a.value.replace(/[\s\u0000-\u001f]/g, '');
                if (/^on/i.test(a.name) || a.name === 'srcdoc' || (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && !/^(https?:|mailto:|file:|#|data:image\/)/i.test(v))) n.removeAttribute(a.name);
            });
        });
        return doc.body.innerHTML;
    };
    const withMedia = h => h.replace(/\[\[(image|drawing):([\w-]+)\]\]/g, '<img data-m="$1:$2" alt="$1">');
    const noteView = h => withMedia(cleanHtml(h));
    const noteBack = (node) => {
        const copy = node.cloneNode(true);
        copy.querySelectorAll('img[data-m]').forEach(i => i.replaceWith(`[[${i.getAttribute('data-m')}]]`));
        return cleanHtml(copy.innerHTML);
    };

    // A place in the data: keys joined by "|", "#id" picks the list entry with
    // that id and "node" + "#id" a flowchart node.
    const findNode = (n, id) => {
        if (!n || typeof n !== 'object') return null;
        if (n._id === id) return n;
        for (const c of (n.children || [])) { const f = findNode(c, id); if (f) return f; }
        return null;
    };
    const locate = (data, path) => {
        const keys = path.split('|');
        let at = data;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!at) return null;
            const key = keys[i];
            if (key === 'node') { at = findNode(at.tree, keys[++i].slice(1)); continue; }
            if (key.startsWith('#')) at = Array.isArray(at) ? at.find(x => x && x.id === key.slice(1)) : null;
            else at = at[key];
        }
        return at && typeof at === 'object' ? { obj: at, key: keys[keys.length - 1] } : null;
    };

    // ----- The page -----
    // Light ("Paper") theme, as the app draws it: warm paper, sage, tan and rust.
    const text = (path, value, tag = 'span', cls = '') => `<${tag} class="f ${cls}" contenteditable="true" data-f="${esc(path)}" data-k="text">${esc(value)}</${tag}>`;
    const tick = (path, on) => `<input type="checkbox" data-f="${esc(path)}" data-k="tick"${on ? ' checked' : ''}>`;
    const note = (path, h) => `<div class="note f" contenteditable="true" data-f="${esc(path)}" data-k="html">${noteView(h)}</div>`;
    const when = t => (t ? `<span class="who">${esc(t)}</span>` : '');
    const checklist = (base, list) => (list && list.length ? `<ul class="ck">${list.map(i => `<li>${tick(`${base}|#${i.id}|done`, i.done)} ${text(`${base}|#${i.id}|text`, i.text)}</li>`).join('')}</ul>` : '');
    const hasText = h => !!plain(String(h || '').replace(/<(?!img\b)[^>]*>/gi, ' ').replace(/&nbsp;/g, ' ')) || /\[\[(image|drawing):/.test(String(h || ''));

    // A link's address, safe to open: web addresses as they are, file paths as file:// links.
    const hrefOf = (u) => {
        const s = String(u || '').trim().replace(/^["']+|["']+$/g, '').trim();
        if (/^(https?|file|ftp):\/\//i.test(s) || /^mailto:/i.test(s)) return s;
        if (/^[a-z]:[\\/]/i.test(s) || s.startsWith('\\\\') || s.startsWith('/')) return 'file:///' + s.replace(/\\/g, '/').replace(/^\/+/, '');
        return /^[a-z][a-z0-9+.-]*:/i.test(s) ? '' : 'https://' + s;
    };
    // Links: on a line each, the web addresses hyperlinks.
    const linksHtml = (links) => {
        const items = (links || []).filter(l => l && String(l.url || '').trim());
        if (!items.length) return '';
        return `<div class="links"><b>Links:</b>${items.map((l) => {
            const url = String(l.url).trim();
            const label = String(l.label || '').trim() && String(l.label).trim() !== url ? String(l.label).trim() : url;
            const href = hrefOf(url);
            return `<div>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label)}</div>`;
        }).join('')}</div>`;
    };

    // ----- Drawing charts (the same look as in the app, always in the light theme) -----
    const withPaper = (fn) => {
        const root = document.documentElement;
        const had = root.classList.contains('theme-paper');
        root.classList.add('theme-paper');
        try { return fn(); } finally { if (!had) root.classList.remove('theme-paper'); }
    };
    let measureCtx = null;
    const FONT_NODE = '600 12px Inter, "Segoe UI", system-ui, Arial, sans-serif';
    const FONT_CARD = '500 13px Inter, "Segoe UI", system-ui, Arial, sans-serif';
    const measure = (t, font) => {
        measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
        measureCtx.font = font;
        return measureCtx.measureText(t).width;
    };
    const wrapText = (t, max, font) => {
        const lines = [];
        let cur = '';
        const push = () => { if (cur) { lines.push(cur); cur = ''; } };
        String(t || '').split(/\s+/).filter(Boolean).forEach((word) => {
            let w = word;
            while (measure(w, font) > max && w.length > 1) {
                let cut = w.length - 1;
                while (cut > 1 && measure(w.slice(0, cut), font) > max) cut--;
                push();
                lines.push(w.slice(0, cut));
                w = w.slice(cut);
            }
            const tryLine = cur ? `${cur} ${w}` : w;
            if (measure(tryLine, font) <= max) cur = tryLine; else { push(); cur = w; }
        });
        push();
        return lines;
    };
    const num = n => Math.round(n * 10) / 10;

    // A flowchart as a picture: top-down, nodes in their app colours.
    const chartNodes = (n, skip) => {
        if (!n || typeof n !== 'object' || n._isPlaceholder || skip(n)) return null;
        const kids = (n.children || []).map(c => chartNodes(c, skip)).filter(Boolean);
        const name = plain(n.name) || (n._nodePhotoUrl ? '🖼 Picture' : '');
        if (!name && !kids.length) return null;
        return { name, color: n.color, src: n, kids };
    };
    const chartSvg = (rootNode, skip) => {
        const cd = chartNodes(rootNode, skip || (() => false));
        if (!cd || typeof d3 === 'undefined') return null;
        return withPaper(() => {
            const root = d3.hierarchy(cd, d => d.kids);
            const W = 120;
            root.each((nd) => {
                nd._lines = wrapText(nd.data.name, W - 14, FONT_NODE);
                nd._h = Math.max(30, nd._lines.length * 15 + 14);
            });
            d3.tree().nodeSize([W + 24, 1]).separation(() => 1)(root);
            const maxH = [];
            root.each((nd) => { maxH[nd.depth] = Math.max(maxH[nd.depth] || 0, nd._h); });
            const ys = [];
            let y = 0;
            maxH.forEach((h, i) => { ys[i] = y; y += h + 46; });
            let minX = Infinity, maxX = -Infinity;
            root.each((nd) => { nd._y = ys[nd.depth]; minX = Math.min(minX, nd.x); maxX = Math.max(maxX, nd.x); });
            const pad = 24;
            const width = maxX - minX + W + pad * 2;
            const height = y - 46 + pad * 2;
            const ox = -minX + W / 2 + pad;
            const links = root.links().map((l) => {
                const x1 = num(l.source.x + ox), y1 = num(l.source._y + l.source._h + pad);
                const x2 = num(l.target.x + ox), y2 = num(l.target._y + pad);
                const ym = num((y1 + y2) / 2);
                return `<path d="M${x1},${y1}V${ym}H${x2}V${y2}" class="lk"/>`;
            }).join('');
            const nodes = root.descendants().map((nd) => {
                const raw = (typeof window.flowThemeNodeColor === 'function' && window.flowThemeNodeColor(nd.data.color, nd.data.src)) || nd.data.color || '#00a67e';
                const txt = (typeof window.flowThemeTextColor === 'function' && window.flowThemeTextColor(raw)) || '#ffffff';
                const x = num(nd.x + ox - W / 2), yy = num(nd._y + pad);
                const lines = nd._lines.map((ln, i) => `<tspan x="${num(nd.x + ox)}" y="${num(yy + (nd._h - nd._lines.length * 15) / 2 + 12 + i * 15)}">${esc(ln)}</tspan>`).join('');
                return `<g><rect x="${x}" y="${yy}" width="${W}" height="${nd._h}" rx="5" fill="${esc(raw)}" stroke="#9a9a8c" stroke-width="1.2"/><text text-anchor="middle" fill="${esc(txt)}">${lines}</text></g>`;
            }).join('');
            return { w: Math.ceil(width), h: Math.ceil(height), body: `<g class="lks">${links}</g>${nodes}` };
        });
    };
    // A picture you can drag, zoom (buttons, pinch or Ctrl+scroll) and click through.
    const zoomBox = (pic, extraClass = '') => `<div class="zoombox ${extraClass}" style="aspect-ratio:${pic.w} / ${pic.h};max-width:${Math.max(pic.w, 360)}px"><div class="zb-btns"><button type="button" data-z="in" title="Zoom in">+</button><button type="button" data-z="out" title="Zoom out">&minus;</button><button type="button" data-z="reset" title="Fit">&#8962;</button></div><svg viewBox="0 0 ${pic.w} ${pic.h}" preserveAspectRatio="xMidYMin meet" class="zsvg"><g class="zg">${pic.body}</g></svg></div>`;

    // The Kanban board as a picture: the columns and cards as they stand. A card on it
    // takes you to that card's page.
    const boardPicture = (k, cardId) => {
        if (!k || !Array.isArray(k.columns) || !k.columns.length) return null;
        return withPaper(() => {
            const colW = 236, gap = 16, pad = 20, inner = colW - 24;
            const labelColor = (c) => (typeof window.flowThemeLabelColor === 'function' ? window.flowThemeLabelColor(c) : c);
            const rows = Array.isArray(k.rows) && k.rows.length ? k.rows : [{ id: 'r0', name: '' }];
            const multi = rows.length > 1;
            const today = new Date().toISOString().slice(0, 10);
            let out = '';
            let y = pad;
            let widest = 0;
            rows.forEach((row, ri) => {
                const cols = k.columns.filter(c => (c.row || rows[0].id) === row.id);
                if (!cols.length) return;
                if (multi) {
                    out += `<text x="${pad}" y="${y + 16}" class="b-row">${esc(row.name || 'Row')}</text><line x1="${pad}" x2="${pad + cols.length * (colW + gap) - gap}" y1="${y + 24}" y2="${y + 24}" class="b-rowline"/>`;
                    y += 38;
                }
                let tallest = 0;
                const colsOut = cols.map((col, ci) => {
                    const x = pad + ci * (colW + gap);
                    const cards = (k.cards || []).filter(c => c.column === col.id && (c.row || rows[0].id) === row.id || (c.column === col.id && !c.row && ri === 0));
                    let cy = y + 46;
                    const cardsOut = cards.map((c) => {
                        const titleLines = wrapText(c.title || '(untitled)', inner, FONT_CARD).slice(0, 4);
                        const labs = (c.labels || []).map(id => (k.labels || []).find(l => l.id === id)).filter(Boolean);
                        let h = 14 + titleLines.length * 17;
                        if (labs.length) h += 22;
                        const items = c.checklist || [];
                        const meta = [];
                        if (c.assignee) meta.push('👤 ' + c.assignee);
                        if (c.due) meta.push('📅 ' + c.due);
                        if (items.length) meta.push(`☑ ${items.filter(i => i.done).length}/${items.length}`);
                        if (c.blocked) meta.push('⛔ blocked');
                        if (meta.length) h += 20;
                        h += 8;
                        const top = cy;
                        let g = `<g class="kbcard" data-goto="${esc(`c-${cardId}-${c.id}`)}"><rect x="${x + 8}" y="${top}" width="${inner + 8}" height="${h}" rx="6" class="b-card"/>`;
                        if (c.blocked) g += `<rect x="${x + 8}" y="${top}" width="4" height="${h}" rx="2" fill="#a4452b"/>`;
                        let ty = top + 8;
                        if (labs.length) {
                            let lx = x + 18;
                            labs.slice(0, 4).forEach((l) => {
                                const w = Math.min(inner - 8, measure(l.name || '', '600 10px Inter, "Segoe UI", sans-serif') + 14);
                                g += `<rect x="${lx}" y="${ty}" width="${num(w)}" height="14" rx="7" fill="${esc(labelColor(l.color))}"/><text x="${num(lx + w / 2)}" y="${ty + 10.5}" class="b-chip" text-anchor="middle">${esc(l.name || '')}</text>`;
                                lx += w + 4;
                            });
                            ty += 22;
                        }
                        g += `<text class="b-title">${titleLines.map((ln, i) => `<tspan x="${x + 18}" y="${ty + 13 + i * 17}">${esc(ln)}</tspan>`).join('')}</text>`;
                        ty += titleLines.length * 17 + 4;
                        if (meta.length) {
                            const overdue = c.due && c.due < today && !(k.columns[k.columns.length - 1] === col);
                            g += `<text x="${x + 18}" y="${ty + 14}" class="b-meta${overdue ? ' b-over' : ''}">${esc(meta.join('   '))}</text>`;
                        }
                        g += '</g>';
                        cy += h + 8;
                        return g;
                    }).join('');
                    const end = Math.max(cy, y + 46 + 40);
                    tallest = Math.max(tallest, end - y);
                    return { x, end, cardsOut, col, count: cards.length };
                });
                colsOut.forEach((c) => {
                    out += `<rect x="${c.x}" y="${y}" width="${colW}" height="${tallest}" rx="8" class="b-col"/><text x="${c.x + 14}" y="${y + 28}" class="b-colname">${esc(c.col.name || 'Column')}</text><text x="${c.x + colW - 14}" y="${y + 28}" class="b-count" text-anchor="end">${c.count}</text>${c.cardsOut}`;
                });
                y += tallest + 20;
                widest = Math.max(widest, pad + cols.length * (colW + gap) - gap + pad);
            });
            return { w: Math.ceil(Math.max(widest, 300)), h: Math.ceil(y), body: out };
        });
    };

    const colNameOf = (k, id) => (k.columns.find(x => x.id === id) || {}).name || 'Column';
    const findCardNode = (tree, id) => {
        let hit = null;
        const walk = (n) => { if (!n || hit) return; if (n._kanban === id) { hit = n; return; } (n.children || []).forEach(walk); };
        walk(tree);
        return hit;
    };

    const cardHtml = (p, k, c, archived, fi, tree) => {
        const base = `${p}|kanban|${archived ? 'archived' : 'cards'}|#${c.id}`;
        const labelObjs = (c.labels || []).map(id => (k.labels || []).find(l => l.id === id)).filter(Boolean);
        const chips = labelObjs.length ? labelObjs.map(l => `<span class="chip" style="background:${esc(withPaper(() => (typeof window.flowThemeLabelColor === 'function' ? window.flowThemeLabelColor(l.color) : l.color)))}">${esc(l.name)}</span>`).join(' ') : '';
        // Only the columns this card has something in.
        const cols = new Set([...Object.keys(c.notes || {}), ...Object.keys(c.colChecklists || {}), c.column]);
        const parts = [];
        k.columns.filter(col => cols.has(col.id)).forEach((col) => {
            const list = col.id === c.column ? c.checklist : (c.colChecklists || {})[col.id];
            const checkPath = col.id === c.column ? `${base}|checklist` : `${base}|colChecklists|${col.id}`;
            const hasNote = hasText((c.notes || {})[col.id]);
            const hasList = Array.isArray(list) && list.length;
            if (!hasNote && !hasList) return;
            parts.push(`<div class="colpart"><div class="sub">${esc(col.name || 'Column')}</div>${hasList ? checklist(checkPath, list) : ''}${hasNote ? note(`${base}|notes|${col.id}`, c.notes[col.id]) : ''}</div>`);
        });
        const node = findCardNode(tree, c.id);
        const pic = node && (node.children || []).some(ch => chartNodes(ch, n => !!n._gantt)) ? chartSvg(node, n => !!n._gantt) : null;
        const facts = [chips, c.category && `Category: ${esc(c.category)}`, `Column: ${esc(colNameOf(k, c.column))}`].filter(Boolean).join(' &middot; ');
        return `<details class="card" id="c-${fi}-${esc(c.id)}"><summary><span class="ct">${esc(c.title || '(untitled)')}</span>${chips ? ` ${chips}` : ''}</summary>
            <div class="cbody">
            <div class="facts">Title: ${text(`${base}|title`, c.title)}</div>
            <div class="facts">${facts}</div>
            <div class="facts">Assignee: ${text(`${base}|assignee`, c.assignee)} &middot; Due: ${text(`${base}|due`, c.due)}</div>
            ${c.desc ? `<div>${text(`${base}|desc`, c.desc, 'div', 'desc')}</div>` : ''}
            ${linksHtml(c.links)}
            ${parts.join('')}
            ${pic ? `<div class="sub">Flowchart</div>${zoomBox(pic, 'small')}` : ''}
            <div class="facts">${when(`Added ${stamp(c.created, c.createdBy)}`)} ${c.editedAt ? when(`Edited ${stamp(c.editedAt, c.editedBy)}`) : ''} ${archived ? when(`Archived ${stamp(c.archivedAt, c.archivedBy)}`) : ''}</div>
            </div></details>`;
    };

    const kanbanHtml = (p, k, fi, tree) => {
        if (!k || !Array.isArray(k.columns) || !k.columns.length) return '';
        const cards = k.cards || [];
        if (!cards.length && !(k.archived || []).length) return '';
        const pic = boardPicture(k, fi);
        const arch = (k.archived || []).length ? `<details class="nt"><summary>Archived (${k.archived.length})</summary>${k.archived.map(c => cardHtml(p, k, c, true, fi, tree)).join('')}</details>` : '';
        return `${pic ? `<h3>Kanban board</h3><p class="hint">Click a card to jump to its details below.</p>${zoomBox(pic, 'board')}` : ''}
            <h3>Kanban cards</h3>${cards.map(c => cardHtml(p, k, c, false, fi, tree)).join('')}${arch}`;
    };

    const notesHtml = (p, d) => {
        const cardTab = d.kanban && d.kanban.cardTabId; // shown card by card instead
        const tabs = (d.notesTabs || []).filter(t => t && t.id !== cardTab && hasText(t.content));
        return tabs.length ? `<h3>Notes</h3>${tabs.map(t => `<details class="nt"><summary>${esc(t.name || 'Notes')}</summary>${note(`${p}|notesTabs|#${t.id}|content`, t.content)}</details>`).join('')}` : '';
    };

    // The whole flowchart, without the Kanban and Gantt branches (the board and the
    // cards have their own pages).
    const flowchartHtml = (d) => {
        const pic = chartSvg(d.tree, n => !!n._gantt || n._kanban === 'root');
        return pic ? `<h3>Flowchart</h3><p class="hint">Drag to move around, use + / &minus; (or pinch, or Ctrl + scroll) to zoom.</p>${zoomBox(pic)}` : '';
    };

    const makeCss = (assets) => `${assets.font ? `@font-face{font-family:'Fraunces Paper';font-weight:600;src:url(${assets.font}) format('truetype')}` : ''}
        :root{--bg:#fbfaf2;--panel:#f5f0e4;--text:#262622;--muted:#6b6a5e;--border:#d6cdb8;--control:#f7f3e8;--hover:#ebe3d1;--accent:#6f8f69;--serif:"Fraunces Paper","Sitka Heading","Sitka Text","Iowan Old Style","Palatino Linotype",Georgia,serif;--sans:"Inter","Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
        *{box-sizing:border-box}
        html{background:#fbfaf2}
        body{font:14px/1.45 var(--sans);color:var(--text);background:#fbfaf2${assets.paper ? ` url(${assets.paper})` : ''};max-width:1040px;margin:0 auto;padding:0 22px 80px}
        ::selection{background:#bccbae;color:#1f1f1c}
        #bar{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:rgba(240,234,222,.94);border-bottom:1px solid #ddd4c1;box-shadow:0 1px 3px rgba(90,75,45,.12);padding:10px 14px;margin:0 -22px 16px}
        #bar button{font:inherit;font-weight:600;padding:7px 18px;border:0;border-radius:16px;background:#6f8f6b;color:#fff;cursor:pointer;box-shadow:0 1px 5px rgba(80,105,75,.5)}
        #bar span{color:var(--muted);font-size:13px}
        details.fc{background:#f1ece0;border:1px solid #d6cdb8;border-radius:9px;box-shadow:0 1px 6px rgba(80,95,70,.3);padding:6px 20px 18px;margin:16px 0}
        details.fc>summary{font:600 26px var(--serif);color:#1f1f1c;cursor:pointer;padding:8px 0}
        h3{font:600 21px var(--serif);color:#1f1f1c;margin:26px 0 8px;padding-bottom:6px;border-bottom:2px solid;border-image:linear-gradient(90deg,#7f9a7a,#6f8a6a 50%,transparent) 1}
        .hint{color:var(--muted);font-size:12.5px;margin:0 0 8px}
        details.nt,details.card{background:#fbfaf2;border:1px solid #c4ccb6;border-radius:9px;box-shadow:0 1px 5px rgba(80,95,70,.28);margin:10px 0;padding:0 16px}
        details.nt>summary,details.card>summary{cursor:pointer;padding:10px 0;font:600 17px var(--serif);color:#1f1f1c;list-style-position:inside}
        details[open]>summary{border-bottom:1px solid #ddd4c1;margin-bottom:8px}
        details.nt>summary::marker,details.card>summary::marker{color:#7f9c7c}
        details.nt:not([open])>summary,details.card:not([open])>summary{border-bottom:0;margin-bottom:0}
        .cbody{padding:0 0 12px}
        details.card .ct{font:600 17px var(--serif)}
        .f{border-radius:4px;outline:none;min-width:24px;display:inline-block;padding:0 3px;min-height:1.3em}div.f{display:block}.f:hover{background:#ece6d8}.f:focus{background:#fffdf6;box-shadow:0 0 0 2px #8aa084}.f:empty::before{content:"-";color:#9a9786}
        .note{padding:2px 6px 10px;font-size:14px;color:#2b2b27;overflow-x:auto}
        .note :is(h4,h5){font-family:var(--serif);font-weight:600;color:#1f1f1c;margin:.5em 0 .1em}
        .note h4{font-size:30px;line-height:1.2;cursor:pointer}
        .note h4::before{content:"\\25BE";display:inline-block;width:1.1em;margin-right:.15em;font-size:.55em;color:#7f9c7c;vertical-align:middle}
        .note h4.is-folded::before{content:"\\25B8"}
        .note h5{font-size:21px;margin-left:14px}
        .note h6{font-size:16px;font-weight:700;color:#4a4a42;margin:.4em 0 0 28px}
        .note p{margin:.3em 0}.note ul,.note ol{padding-left:2.8em;margin:.2em 0}.note li{margin:.15em 0}
        .note ul.todo-list{list-style:none;padding-left:2.4em}
        .note .todo-list__label{display:flex;align-items:flex-start;gap:8px}
        .note input[type=checkbox]{appearance:none;-webkit-appearance:none;flex:none;width:16px;height:16px;margin:3px 0 0;border:2px solid #2f2f2b;border-radius:3px;background:transparent;position:relative;cursor:pointer}
        .note input[type=checkbox]:checked,ul.ck input[type=checkbox]:checked{background:#6f9472;border-color:#6f9472}
        .note input[type=checkbox]:checked::after,ul.ck input[type=checkbox]:checked::after{content:"";position:absolute;left:3px;top:0;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
        .note .todo-list__label:has(input:checked) .todo-list__label__description{text-decoration:line-through;color:var(--muted)}
        .note mark{color:#1b1b1b;padding:0 1px;border-radius:2px}.note mark.marker-yellow{background:#ffee00}.note mark.marker-green{background:#6ee7a0}.note mark.marker-blue{background:#7cc4ff}.note mark.marker-orange{background:#ffb35c}.note mark.marker-purple{background:#d4a5ff}
        .note table{border-collapse:collapse;margin:.5em 0}.note td,.note th{border:1px solid #d6cdb8;padding:4px 8px;vertical-align:top}.note th{background:#e3e6d6;color:#4d5a47}
        .note a,.links a{color:#2f6f9f}.note img{max-width:100%;max-height:340px;border-radius:6px;border:1px solid #d6cdb8}
        .note .is-hidden{display:none}
        [data-done="true"]{text-decoration:line-through;opacity:.65}
        ul.ck{list-style:none;padding-left:6px;margin:4px 0}ul.ck input[type=checkbox]{appearance:none;-webkit-appearance:none;width:15px;height:15px;border:2px solid #2f2f2b;border-radius:3px;vertical-align:-2px;position:relative;cursor:pointer;background:transparent}
        .who{color:var(--muted);font-size:12px}.facts{font-size:13px;color:#4f4d44;margin:2px 0}
        .sub{font:700 13px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:#7d555b;border-bottom:1px solid #a38d8d;margin:12px 0 4px;padding-bottom:2px}
        .links{margin:8px 0}.links b{font-weight:700;color:#7d555b}.links div{margin-left:2px}
        .chip{display:inline-block;color:#fff;font-size:11px;font-weight:600;padding:0 8px;border-radius:9px;line-height:17px;vertical-align:1px}
        .desc{white-space:pre-wrap}
        .colpart{margin:2px 0 6px}
        details.card.flash,details.card:target{box-shadow:0 0 0 3px #d29a42,0 1px 5px rgba(90,75,45,.4);background:#f8ecc9}
        .zoombox{position:relative;width:100%;height:auto;min-height:150px;max-height:560px;background:#fdfcf6;border:1px solid #c4ccb6;border-radius:9px;box-shadow:0 1px 5px rgba(80,95,70,.28);overflow:hidden;touch-action:none;cursor:grab}
        .zoombox.small{max-height:380px}.zoombox.drag{cursor:grabbing}
        .zoombox svg{width:100%;height:100%;display:block;user-select:none;-webkit-user-select:none}
        .zb-btns{position:absolute;bottom:8px;right:8px;z-index:2;display:flex;gap:4px}
        .zb-btns button{width:28px;height:28px;border:0;border-radius:50%;background:#d8d1c1;color:#2b2b27;font:700 16px/1 var(--sans);cursor:pointer}.zb-btns button:hover{background:#c9c1ae}
        .zsvg text{font-family:var(--sans)}
        .lk{fill:none;stroke:#868a91;stroke-width:1.4}
        .zsvg g>text{font-size:12px;font-weight:600}
        .b-col{fill:#fdfcf6;stroke:rgba(190,175,140,.7);stroke-width:1.2}.b-colname{font:500 15px var(--sans);fill:#1f1f1c}.b-count{font:600 12px var(--sans);fill:#6b6a5e}
        .b-card{fill:#fdfcf6;stroke:rgba(190,175,140,.9);stroke-width:1;filter:drop-shadow(0 1px 1.5px rgba(90,75,45,.35))}
        .kbcard{cursor:pointer}.kbcard:hover .b-card{fill:#fffefa;stroke:#6f8f69}
        .b-title{font:500 13px var(--sans);fill:#1f1f1c}.b-meta{font:500 11px var(--sans);fill:#4f4d44}.b-over{fill:#98432a}.b-chip{font:600 10px var(--sans);fill:#fff}
        .b-row{font:600 17px var(--serif);fill:#1f1f1c}.b-rowline{stroke:#b5bfa8}
        @media print{#bar,.zb-btns{display:none}details.card,details.nt{break-inside:avoid}}`;

    // Runs in the page (as a function, written out into it).
    function pageMain() {
        var D = JSON.parse(document.getElementById('flowchart-data').textContent);
        function src(el, m) {
            var p = m.split(':'), kind = p[0] === 'drawing' ? 'notesDrawings' : 'notesImages', gk = p[0] === 'drawing' ? 'drawings' : 'images';
            var f = el.closest('[data-fc]'), i = f ? f.getAttribute('data-fc') : 'g';
            var s = i === 'g' ? (D.globalNotes.media || {})[gk] : (D.flowcharts[i].data || {})[kind];
            var x = s && s[p[1]];
            var u = x && (x.dataUrl || x.url) || '';
            return /^(data:image\/|https?:)/i.test(u) ? u : '';
        }
        document.querySelectorAll('img[data-m]').forEach(function (i) { var u = src(i, i.getAttribute('data-m')); if (u) i.src = u; });

        // Titles in notes fold like in the app (the arrow, or a click on the title's start).
        function foldTitle(h, folded) {
            h.classList.toggle('is-folded', folded);
            for (var n = h.nextElementSibling; n && n.tagName !== 'H4'; n = n.nextElementSibling) n.classList.toggle('is-hidden', folded);
        }
        document.querySelectorAll('.note h4').forEach(function (h) { if (h.hasAttribute('data-folded')) foldTitle(h, true); });
        document.addEventListener('click', function (e) {
            var h = e.target.closest && e.target.closest('.note h4');
            if (!h || e.offsetX > 44) return;
            foldTitle(h, !h.classList.contains('is-folded'));
        });

        // Pictures you can drag and zoom.
        document.querySelectorAll('.zoombox').forEach(function (box) {
            var svg = box.querySelector('svg'), g = box.querySelector('.zg');
            var vb = svg.viewBox.baseVal;
            var s = 1, tx = 0, ty = 0, pts = {}, moved = 0, last = null, pinch = null;
            function fit() {
                var r = svg.getBoundingClientRect();
                var k = Math.min(r.width / vb.width, r.height / vb.height);
                s = 1; tx = 0; ty = 0;
                if (k > 1) { s = 1; }
                apply();
            }
            function apply() { g.setAttribute('transform', 'translate(' + tx + ',' + ty + ') scale(' + s + ')'); }
            function zoomAt(f, cx, cy) {
                var r = svg.getBoundingClientRect();
                var k = Math.min(r.width / vb.width, r.height / vb.height);
                var px = (cx - r.left - (r.width - vb.width * k) / 2) / k, py = (cy - r.top) / k;
                var ns = Math.max(0.2, Math.min(8, s * f));
                tx = px - (px - tx) * (ns / s); ty = py - (py - ty) * (ns / s); s = ns; apply();
            }
            function center() { var r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
            box.querySelectorAll('.zb-btns button').forEach(function (b) {
                b.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var z = b.getAttribute('data-z'), c = center();
                    if (z === 'in') zoomAt(1.4, c[0], c[1]); else if (z === 'out') zoomAt(1 / 1.4, c[0], c[1]); else fit();
                });
                b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
            });
            box.addEventListener('wheel', function (e) {
                if (!(e.ctrlKey || e.metaKey)) return;
                e.preventDefault();
                zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
            }, { passive: false });
            box.addEventListener('dblclick', function (e) { zoomAt(1.6, e.clientX, e.clientY); });
            box.addEventListener('pointerdown', function (e) {
                if (e.target.closest('.zb-btns')) return;
                try { box.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
                pts[e.pointerId] = [e.clientX, e.clientY];
                moved = 0; last = [e.clientX, e.clientY]; box.classList.add('drag');
                if (Object.keys(pts).length === 2) { var a = Object.values(pts); pinch = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); }
            });
            box.addEventListener('pointermove', function (e) {
                if (!pts[e.pointerId]) return;
                pts[e.pointerId] = [e.clientX, e.clientY];
                var ids = Object.keys(pts);
                if (ids.length === 2 && pinch) {
                    var a = Object.values(pts), d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
                    zoomAt(d / pinch, (a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2); pinch = d; moved = 99; return;
                }
                var r = svg.getBoundingClientRect(), k = Math.min(r.width / vb.width, r.height / vb.height);
                var dx = e.clientX - last[0], dy = e.clientY - last[1];
                moved += Math.abs(dx) + Math.abs(dy);
                if (moved > 5) { tx += dx / k; ty += dy / k; apply(); }
                last = [e.clientX, e.clientY];
            });
            function up(e) {
                var wasClick = moved <= 5 && Object.keys(pts).length === 1;
                delete pts[e.pointerId]; pinch = null; box.classList.remove('drag');
                if (wasClick) {
                    var hit = e.target.closest && e.target.closest('.kbcard');
                    if (hit) goto(hit.getAttribute('data-goto'));
                }
            }
            box.addEventListener('pointerup', up);
            box.addEventListener('pointercancel', function (e) { delete pts[e.pointerId]; pinch = null; box.classList.remove('drag'); });
            fit();
        });
        // A card on the board: open it (and what it is in) and bring it into view.
        function goto(id) {
            var el = document.getElementById(id);
            if (!el) return;
            for (var p = el; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('flash');
            setTimeout(function () { el.classList.remove('flash'); }, 2600);
        }

        var dirty = false;
        document.addEventListener('input', function () { dirty = true; });
        document.addEventListener('change', function (e) {
            if (e.target.type === 'checkbox') { dirty = true; if (e.target.checked) e.target.setAttribute('checked', ''); else e.target.removeAttribute('checked'); }
        });
        document.getElementById('save').addEventListener('click', function () {
            var c = document.documentElement.cloneNode(true);
            c.querySelectorAll('img[data-m]').forEach(function (i) { i.removeAttribute('src'); });
            c.querySelectorAll('.flash').forEach(function (n) { n.classList.remove('flash'); });
            var b = new Blob(['<!doctype html>\n' + c.outerHTML], { type: 'text/html' }), a = document.createElement('a');
            a.href = URL.createObjectURL(b); a.download = D.file || 'flowcharts.html'; document.body.appendChild(a); a.click(); a.remove(); dirty = false;
        });
        window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
    }
    const PAGE_SCRIPT = `(${pageMain.toString()})();`;

    const methods = {
        // Every flowchart's data, with its pictures filled in.
        async collectForDocument() {
            this.saveCurrentFlowchart();
            const flowcharts = [];
            for (let i = 0; i < this.flowchartList.length; i++) {
                const item = this.flowchartList[i];
                if (/"@img:/.test(item.data || '')) { try { await this.rehydrateFlowchartImages(i); } catch (e) { /* some pictures unreachable */ } }
                try { flowcharts.push({ title: item.title, data: JSON.parse(item.data) }); } catch (e) { /* unreadable - left out */ }
            }
            const d = new Date();
            const two = n => String(n).padStart(2, '0');
            return {
                app: 'flowchart-editor-document', version: 1, exportedAt: d.toISOString(), exportedBy: (typeof this.kbMyName === 'function' && this.kbMyName()) || '',
                file: `flowcharts-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.html`,
                flowcharts,
                globalNotes: { tabs: typeof this.visibleGlobalNotesTabs === 'function' ? this.visibleGlobalNotesTabs() : this.globalNotesTabs, media: this.globalNotesMedia }
            };
        },

        // The pictures the page uses (the app's paper and its title font), read once so
        // the page can be opened anywhere.
        async loadDocumentAssets() {
            const asData = async (path) => {
                try {
                    const r = await fetch(path);
                    if (!r.ok) return '';
                    const blob = await r.blob();
                    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(''); fr.readAsDataURL(blob); });
                } catch (e) { return ''; }
            };
            return { paper: await asData('vendor/paper.png'), font: await asData('vendor/fonts/fraunces.ttf') };
        },

        buildDocument(data, assets = {}) {
            const globals = (data.globalNotes.tabs || []).filter(t => hasText(t.content)).map(t => `<details class="nt"><summary>${esc(t.name || 'Notes')}</summary>${note(`globalNotes|tabs|#${t.id}|content`, t.content)}</details>`).join('');
            const charts = data.flowcharts.map((fc, i) => {
                const d = fc.data || {};
                const p = `flowcharts|${i}|data`;
                return `<details class="fc" data-fc="${i}"${i === 0 ? ' open' : ''}><summary>${esc(fc.title)}</summary>
                    ${notesHtml(p, d)}${kanbanHtml(p, d.kanban, i, d.tree)}${flowchartHtml(d)}</details>`;
            }).join('');
            const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
            return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Flowcharts - ${esc(data.exportedAt.slice(0, 10))}</title><style>${makeCss(assets)}</style></head>
<body><div id="bar"><button id="save" type="button">Save edited copy</button><span>Click any text to edit it and tick the boxes, then save a copy. Bring it back with <b>Import All &gt; 📄 Import document</b>.</span><span class="who">Exported ${esc(new Date(data.exportedAt).toLocaleString())}${data.exportedBy ? ` by ${esc(data.exportedBy)}` : ''}</span></div>
${globals ? `<details class="fc" data-fc="g"><summary>Global notes</summary>${globals}</details>` : ''}${charts}
<script type="application/json" id="flowchart-data">${json}</script><script>${PAGE_SCRIPT}</script></body></html>`;
        },

        async exportDocument() {
            this.showNotification('Building the document...');
            const data = await this.collectForDocument();
            const assets = await this.loadDocumentAssets();
            const blob = new Blob([this.buildDocument(data, assets)], { type: 'text/html' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = data.file;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            this.showNotification('Saved. Open it in any browser to read or edit it.', 4000);
        },

        // The document's data with the edits made in it: { data, edits }.
        readDocument(htmlText) {
            const doc = new DOMParser().parseFromString(htmlText, 'text/html');
            const holder = doc.getElementById('flowchart-data');
            if (!holder) throw new Error('This isn\'t an exported document.');
            const data = JSON.parse(holder.textContent);
            if (!data || data.app !== 'flowchart-editor-document' || !Array.isArray(data.flowcharts)) throw new Error('This isn\'t an exported document.');
            if (!data.globalNotes || typeof data.globalNotes !== 'object') data.globalNotes = { tabs: [], media: {} };
            let edits = 0;
            doc.querySelectorAll('[data-f]').forEach((n) => {
                const at = locate(data, n.getAttribute('data-f'));
                if (!at || ['__proto__', 'constructor', 'prototype'].includes(at.key)) return;
                const kind = n.getAttribute('data-k');
                const old = at.obj[at.key];
                if (kind === 'tick') {
                    const on = n.hasAttribute('checked');
                    if (on !== !!old) { at.obj[at.key] = on; edits++; }
                } else if (kind === 'html') {
                    const now = noteBack(n);
                    // Compared the same way it was written out, so only real edits count.
                    const was = new DOMParser().parseFromString(`<body><div>${noteView(old)}</div></body>`, 'text/html').body.firstChild;
                    if (now !== noteBack(was)) { at.obj[at.key] = now; edits++; }
                } else {
                    const lines = at.key === 'desc';
                    const tidy = s => (lines ? String(s == null ? '' : s).replace(/ /g, ' ').trim() : plain(s));
                    const copy = n.cloneNode(true);
                    if (lines) { copy.querySelectorAll('br').forEach(b => b.replaceWith('\n')); copy.querySelectorAll('div, p').forEach(b => b.prepend('\n')); }
                    const now = tidy(copy.textContent);
                    if (now === tidy(old)) return;
                    if (['due', 'start', 'end', 'date'].includes(at.key) && !(/^\d{4}-\d{2}-\d{2}$/.test(now) || (at.key === 'due' && !now))) return;
                    if (at.key === 'time' && !/^\d{2}:\d{2}$/.test(now)) return;
                    if (['name', 'title'].includes(at.key) && !now) return;
                    at.obj[at.key] = now;
                    edits++;
                }
            });
            return { data, edits };
        },

        async importDocument(htmlText) {
            let read;
            try { read = this.readDocument(htmlText); } catch (e) { alert(`Couldn't read that file: ${e.message}`); return false; }
            const { data, edits } = read;
            const fcs = data.flowcharts.filter(f => f && typeof f.title === 'string' && f.data && f.data.tree);
            const here = new Map(this.flowchartList.map(i => [i.title, i]));
            const same = fcs.filter(f => here.has(f.title)).map(f => `"${f.title}"`);
            const exported = new Date(data.exportedAt);
            const msg = `Bring back ${fcs.length} flowchart${fcs.length === 1 ? '' : 's'} from this document (exported ${isNaN(exported) ? 'earlier' : exported.toLocaleString()}, ${edits} edit${edits === 1 ? '' : 's'} made in it)?` +
                (same.length ? ` ${same.join(', ')} here ${same.length === 1 ? 'is' : 'are'} replaced by the document's version - anything changed here since the export is lost.` : '');
            if (!(await this.showConfirmDialog(msg, 'Import'))) return false;
            this.saveCurrentFlowchart();
            let viewOnly = 0;
            let first = null;
            fcs.forEach((f) => {
                const text0 = JSON.stringify(f.data, null, 2);
                const item = here.get(f.title);
                if (item && item.share && item.share.role === 'view') { viewOnly++; return; }
                // In place, so a shared flowchart stays shared.
                if (item) item.data = text0;
                else this.flowchartList.push({ title: f.title, data: text0 });
                if (first === null) first = f.title;
            });
            (data.globalNotes.tabs || []).forEach((t) => {
                if (!t || typeof t.id !== 'string') return;
                const clean = this.sanitizeNotesTabs([t])[0];
                if (!clean) return;
                const mine = this.globalNotesTabs.find(x => x.id === t.id);
                if (mine) { mine.name = clean.name; mine.content = clean.content; } else this.globalNotesTabs.push(clean);
            });
            const media = data.globalNotes.media || {};
            ['drawings', 'images'].forEach((k) => { Object.entries(media[k] || {}).forEach(([id, v]) => { if (v && typeof v === 'object' && !this.globalNotesMedia[k][id]) this.globalNotesMedia[k][id] = v; }); });
            this.saveGlobalNotesMedia();
            this.saveGlobalNotesTabs();
            this.saveFlowchartList();
            const open = this.flowchartList[this.currentSlotIndex];
            const at = open && fcs.some(f => f.title === open.title) ? this.currentSlotIndex : this.flowchartList.findIndex(i => i.title === first);
            if (at >= 0) {
                // Loaded as it came, not saved over by what was on screen.
                this._applyingRemote = true;
                try { this.loadFlowchartFromList(at); } finally { this._applyingRemote = false; }
            }
            if (typeof this.refreshEmbeddedEditors === 'function') this.refreshEmbeddedEditors();
            this.autosave();
            if (this.importPopup) this.importPopup.style.display = 'none';
            this.showNotification(`Brought back ${fcs.length - viewOnly} flowchart${fcs.length - viewOnly === 1 ? '' : 's'}${edits ? ` with ${edits} edit${edits === 1 ? '' : 's'}` : ''}.${viewOnly ? ` ${viewOnly} view-only left as is.` : ''}`, 5000);
            return true;
        },

        pickDocumentToImport() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.html,.htm,text/html';
            input.addEventListener('change', () => {
                const file = input.files && input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => this.importDocument(String(reader.result));
                reader.readAsText(file);
            });
            input.click();
        }
    };
    Object.assign(FlowchartViewer.prototype, methods);

    const proto = FlowchartViewer.prototype;
    const addButton = (popup, id, label, title, onclick) => {
        if (!popup || document.getElementById(id)) return;
        const row = popup.querySelector('div:last-child');
        const b = document.createElement('button');
        b.id = id;
        b.type = 'button';
        b.textContent = label;
        b.title = title;
        b.style.cssText = 'font-size:15px; padding:6px 18px; border:1px solid #0c66e4; border-radius:5px; background:#0c66e4; color:#fff; font-weight:600; cursor:pointer; margin-right:auto;';
        b.addEventListener('click', onclick);
        row.insertBefore(b, row.firstChild);
    };
    const origExport = proto.showExportPopup;
    proto.showExportPopup = function (...args) {
        const r = origExport.apply(this, args);
        addButton(this.exportPopup, 'export-document-btn', '📄 Editable document', 'Everything in one page you can read and edit in any browser, and import back', () => this.exportDocument());
        return r;
    };
    const origImport = proto.showImportPopup;
    proto.showImportPopup = function (...args) {
        const r = origImport.apply(this, args);
        addButton(this.importPopup, 'import-document-btn', '📄 Import document', 'Pick an exported document: everything in it comes back', () => this.pickDocumentToImport());
        return r;
    };
    // A document pasted or opened in the ordinary import box works too.
    const origText = proto.importFromText;
    proto.importFromText = function (...args) {
        const t = (this.importTextarea && this.importTextarea.value) || '';
        if (/^\s*<!doctype html/i.test(t) && t.includes('flowchart-data')) return this.importDocument(t);
        return origText.apply(this, args);
    };
})();
