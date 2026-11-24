// ===== Everything as one editable document =====
// Export All > "📄 Editable document" makes a single web page holding every
// flowchart: its notes, Kanban cards (archived ones too), Gantt chart, events
// and flowchart structure, with when things were changed and by whom. Open it in
// any browser, read it, edit the text and tick boxes, press "Save edited copy" -
// and Import All > "📄 Import document" puts it all back in one step.
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
    const text = (path, value, tag = 'span', cls = '') => `<${tag} class="f ${cls}" contenteditable="true" data-f="${esc(path)}" data-k="text">${esc(value)}</${tag}>`;
    const tick = (path, on) => `<input type="checkbox" data-f="${esc(path)}" data-k="tick"${on ? ' checked' : ''}>`;
    const note = (path, h) => `<div class="note f" contenteditable="true" data-f="${esc(path)}" data-k="html">${noteView(h)}</div>`;
    const when = t => (t ? `<span class="who">${esc(t)}</span>` : '');
    const checklist = (base, list) => (list && list.length ? `<ul class="ck">${list.map(i => `<li>${tick(`${base}|#${i.id}|done`, i.done)} ${text(`${base}|#${i.id}|text`, i.text)}</li>`).join('')}</ul>` : '');

    const treeHtml = (p, n) => {
        if (!n || n._isPlaceholder && !(n.children || []).length) return '';
        const kids = (n.children || []).map(c => treeHtml(p, c)).join('');
        if (n._isPlaceholder) return kids;
        // Nodes drawn from the board or the Gantt chart take their names from there.
        const mirrored = n._kanban || n._gantt;
        const name = mirrored || !n._id ? `<span>${esc(n.name)}</span>` : text(`${p}|node|#${n._id}|name`, n.name);
        return `<li>${name} ${when(stamp(n._at, n._by))}${kids ? `<ul>${kids}</ul>` : ''}</li>`;
    };

    const cardHtml = (p, k, c, archived) => {
        const base = `${p}|kanban|${archived ? 'archived' : 'cards'}|#${c.id}`;
        const label = c.labels && c.labels.length ? c.labels.map(id => (k.labels.find(l => l.id === id) || {}).name).filter(Boolean).join(', ') : '';
        const colName = id => (k.columns.find(x => x.id === id) || {}).name || 'Column';
        const notes = Object.entries(c.notes || {}).map(([id, h]) => `<div class="sub">Notes - ${esc(colName(id))}</div>${note(`${base}|notes|${id}`, h)}`).join('');
        const lists = Object.entries(c.colChecklists || {}).map(([id, l]) => `<div class="sub">Checklist - ${esc(colName(id))}</div>${checklist(`${base}|colChecklists|${id}`, l)}`).join('');
        return `<div class="card"><div class="ct">${text(`${base}|title`, c.title)}</div>
            <div class="facts">${[label && `Labels: ${esc(label)}`, c.category && `Category: ${esc(c.category)}`].filter(Boolean).join(' · ')}</div>
            <div class="facts">Assignee: ${text(`${base}|assignee`, c.assignee)} · Due: ${text(`${base}|due`, c.due)}</div>
            <div>${text(`${base}|desc`, c.desc, 'div', 'desc')}</div>
            ${(c.links || []).length ? `<div class="facts">Links: ${c.links.map(l => esc(l.label ? `${l.label} (${l.url})` : l.url)).join(' · ')}</div>` : ''}
            ${checklist(`${base}|checklist`, c.checklist)}${lists}${notes}
            <div class="facts">${when(`Added ${stamp(c.created, c.createdBy)}`)} ${c.editedAt ? when(`Edited ${stamp(c.editedAt, c.editedBy)}`) : ''} ${archived ? when(`Archived ${stamp(c.archivedAt, c.archivedBy)}`) : ''}</div></div>`;
    };

    const kanbanHtml = (p, k) => {
        if (!k || !Array.isArray(k.columns)) return '';
        const cols = k.columns.map((col) => {
            const cards = (k.cards || []).filter(c => c.column === col.id);
            return `<h4>${text(`${p}|kanban|columns|#${col.id}|name`, col.name)} <span class="who">${cards.length} card${cards.length === 1 ? '' : 's'}</span></h4>${cards.map(c => cardHtml(p, k, c)).join('')}`;
        }).join('');
        const arch = (k.archived || []).length ? `<h4>🗄 Archived</h4>${k.archived.map(c => cardHtml(p, k, c, true)).join('')}` : '';
        return `<h3>📋 Kanban</h3>${cols}${arch}`;
    };

    const ganttHtml = (p, g) => {
        if (!g || !Array.isArray(g.tasks) || !g.tasks.length) return '';
        const row = (t) => {
            const base = `${p}|gantt|tasks|#${t.id}`;
            return `<tr class="${t.parent ? 'sub' : 'main'}"><td>${t.kind === 'milestone' ? '◆ ' : ''}${text(`${base}|name`, t.name)}${checklist(`${base}|checklist`, t.checklist)}</td>
                <td>${text(`${base}|start`, t.start)}</td><td>${text(`${base}|end`, t.end)}</td><td>${text(`${base}|assignee`, t.assignee)}</td><td>${text(`${base}|resources`, t.resources)}</td></tr>`;
        };
        const ordered = g.tasks.filter(t => !t.parent).flatMap(m => [m, ...g.tasks.filter(t => t.parent === m.id)]);
        return `<h3>📅 Gantt</h3><table><tr><th>Task</th><th>Start</th><th>End</th><th>Owner</th><th>Resources</th></tr>${ordered.map(row).join('')}</table>`;
    };

    const eventsHtml = (p, list) => (Array.isArray(list) && list.length ? `<h3>⏰ Events</h3><table><tr><th>Event</th><th>Date</th><th>Time</th><th>Repeats</th></tr>${list.map(e => `<tr><td>${text(`${p}|events|#${e.id}|name`, e.name)}</td><td>${text(`${p}|events|#${e.id}|date`, e.date)}</td><td>${text(`${p}|events|#${e.id}|time`, e.time)}</td><td>${esc(e.repeat || 'no')}</td></tr>`).join('')}</table>` : '');

    const notesHtml = (p, d) => {
        const cardTab = d.kanban && d.kanban.cardTabId; // shown card by card instead
        const tabs = (d.notesTabs || []).filter(t => t && t.id !== cardTab && plain(String(t.content || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')));
        return tabs.length ? `<h3>📝 Notes</h3>${tabs.map(t => `<h4>${text(`${p}|notesTabs|#${t.id}|name`, t.name)}</h4>${note(`${p}|notesTabs|#${t.id}|content`, t.content)}`).join('')}` : '';
    };

    const CSS = `body{font:15px/1.5 "Segoe UI",system-ui,Arial,sans-serif;color:#172b4d;background:#fff;max-width:980px;margin:0 auto;padding:20px 24px 80px}
        #bar{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#fff;border-bottom:2px solid #dfe1e6;padding:10px 0;margin-bottom:14px}
        #bar button{font:inherit;font-weight:600;padding:7px 16px;border:0;border-radius:6px;background:#0c66e4;color:#fff;cursor:pointer}
        details.fc{border:1px solid #dfe1e6;border-radius:10px;padding:6px 18px 14px;margin:14px 0}details.fc>summary{font-size:22px;font-weight:700;cursor:pointer;padding:6px 0}
        h3{margin:24px 0 8px;border-bottom:1px solid #dfe1e6;padding-bottom:4px}h4{margin:16px 0 6px}
        .f{border-radius:4px;outline:none;min-width:24px;display:inline-block;padding:0 3px;min-height:1.3em}div.f{display:block}.f:hover{background:#f1f2f4}.f:focus{background:#e9f2ff;box-shadow:0 0 0 2px #0c66e4}.f:empty::before{content:"-";color:#8590a2}
        .note{border-left:3px solid #dfe1e6;padding:2px 12px;margin:4px 0 12px}.note h4{font-size:20px}.note h5{font-size:17px;margin:10px 0 2px}.note h6{font-size:14px;margin:6px 0 0}.note img{max-width:100%;max-height:340px}
        [data-done="true"]{text-decoration:line-through;opacity:.7}.who{color:#5e6c84;font-size:12px}.facts{font-size:13px;color:#44546f}.sub{font-weight:600;font-size:13px;margin-top:6px}
        .card{border:1px solid #dfe1e6;border-radius:8px;padding:8px 12px;margin:8px 0}.ct{font-weight:600}.desc{white-space:pre-wrap}ul.ck{list-style:none;padding-left:6px;margin:4px 0}
        table{border-collapse:collapse;width:100%}td,th{border:1px solid #dfe1e6;padding:4px 8px;text-align:left;vertical-align:top}tr.main{background:#f7f8f9;font-weight:600}tr.sub td:first-child{padding-left:24px}
        @media print{#bar{display:none}}`;
    // In the page: pictures from its own data, tick boxes kept on saving, and
    // "Save edited copy".
    const PAGE_SCRIPT = `(function(){var D=JSON.parse(document.getElementById('flowchart-data').textContent);
        function src(el,m){var p=m.split(':'),kind=p[0]==='drawing'?'notesDrawings':'notesImages',gk=p[0]==='drawing'?'drawings':'images',f=el.closest('[data-fc]'),i=f?f.getAttribute('data-fc'):'g',s=i==='g'?(D.globalNotes.media||{})[gk]:(D.flowcharts[i].data||{})[kind];var x=s&&s[p[1]];var u=x&&(x.dataUrl||x.url)||'';return /^(data:image\\/|https?:)/i.test(u)?u:'';}
        document.querySelectorAll('img[data-m]').forEach(function(i){var u=src(i,i.getAttribute('data-m'));if(u)i.src=u;});
        var dirty=false;document.addEventListener('input',function(){dirty=true;});
        document.addEventListener('change',function(e){if(e.target.type==='checkbox'){dirty=true;if(e.target.checked)e.target.setAttribute('checked','');else e.target.removeAttribute('checked');}});
        document.getElementById('save').addEventListener('click',function(){var c=document.documentElement.cloneNode(true);c.querySelectorAll('img[data-m]').forEach(function(i){i.removeAttribute('src');});
        var b=new Blob(['<!doctype html>\\n'+c.outerHTML],{type:'text/html'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=D.file||'flowcharts.html';document.body.appendChild(a);a.click();a.remove();dirty=false;});
        window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue='';}});})();`;

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

        buildDocument(data) {
            const globals = (data.globalNotes.tabs || []).map(t => `<h4>${text(`globalNotes|tabs|#${t.id}|name`, t.name)}</h4>${note(`globalNotes|tabs|#${t.id}|content`, t.content)}`).join('');
            const charts = data.flowcharts.map((fc, i) => {
                const d = fc.data || {};
                const p = `flowcharts|${i}|data`;
                return `<details class="fc" data-fc="${i}"${i === 0 ? ' open' : ''}><summary>${esc(fc.title)}</summary>
                    ${notesHtml(p, d)}${kanbanHtml(p, d.kanban)}${ganttHtml(p, d.gantt)}${eventsHtml(p, d.events)}
                    <h3>🔀 Flowchart</h3><ul class="tree">${treeHtml(p, d.tree)}</ul></details>`;
            }).join('');
            const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
            return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Flowcharts - ${esc(data.exportedAt.slice(0, 10))}</title><style>${CSS}</style></head>
<body><div id="bar"><button id="save" type="button">Save edited copy</button><span>Click any text to edit it and tick the boxes, then save a copy. Bring it back with <b>Import All &gt; 📄 Import document</b>.</span><span class="who">Exported ${esc(new Date(data.exportedAt).toLocaleString())}${data.exportedBy ? ` by ${esc(data.exportedBy)}` : ''}</span></div>
${globals ? `<details class="fc" data-fc="g"><summary>🌐 Global notes</summary>${globals}</details>` : ''}${charts}
<script type="application/json" id="flowchart-data">${json}</script><script>${PAGE_SCRIPT}</script></body></html>`;
        },

        async exportDocument() {
            this.showNotification('Building the document...');
            const data = await this.collectForDocument();
            const blob = new Blob([this.buildDocument(data)], { type: 'text/html' });
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
