// ===== One flowchart, not an original and a shared copy =====
// A flowchart the owner shares is kept in a row of its own (sharing.js). If the
// owner's ordinary list still holds the original - shared before signing in,
// or brought back by another device - the owner sees both "X" and
// "X (shared)", and they drift apart. Here the two become one again: a single
// flowchart with the original's name, still shared, holding what both had.
//
// Nothing is thrown away on the way:
// - both copies are backed up on this device first (Manage access downloads it);
// - the two are combined; where the same thing differs, the shared copy's stands;
// - if anything in the shared copy would be missing from the result, or a
//   picture isn't here to be copied, it stops and changes nothing;
// - the ordinary copy goes only once the combined one is saved on the server
//   and only if it hasn't changed meanwhile.
// It happens by itself only when the ordinary copy has nothing the shared one
// lacks; otherwise it asks.
(function () {
    if (typeof FlowchartViewer === 'undefined') return;

    const SKIP = new Set(['_id', 'id', 'color', 'transform', 'orientation', 'showPlaceholders', 'activeNotesTabId', 'activePughMatrixId',
        'activeMorphMatrixId', 'notesPinned', '_kanban', '_gantt', '_kbCol', '_by', '_colParent', 'noteTitles', 'noteCols', 'notesTabId', 'cardTabId',
        'column', 'row', 'labels', 'groupBy', 'parent', 'deps', 'kind', 'prefix']);
    const tidy = s => String(s).replace(/(\s*\(Simplify\?\))+\s*$/, '').replace(/[ \s]+/g, ' ').trim();

    // Every piece of content in a saved flowchart: node names, card and task
    // text, each block of notes text, pictures (by their hash)...
    const contentOf = (data) => {
        const out = new Set();
        const add = (s) => {
            (String(s).match(/@img:[A-Za-z0-9_-]+/g) || []).forEach(h => out.add(h));
            if (/<[a-z][^>]*>/i.test(s)) {
                String(s).split(/<\/(?:p|h[1-6]|li|ul|ol|div|td|th|label)>|<br\s*\/?>/i)
                    .forEach((b) => { const t = tidy(new DOMParser().parseFromString(b, 'text/html').body.textContent); if (t) out.add(t); });
            } else { const t = tidy(s); if (t) out.add(t); }
        };
        const walk = (v) => {
            if (typeof v === 'string') add(v);
            else if (Array.isArray(v)) v.forEach(walk);
            else if (v && typeof v === 'object') Object.keys(v).forEach((k) => {
                if (SKIP.has(k)) return;
                // Objects keyed by an id can also hold a drawing's data: content either way.
                walk(v[k]);
            });
        };
        walk(data);
        return out;
    };
    // (An empty matrix's default names are no content.)
    const missing = (from, inn) => [...from].filter(x => !inn.has(x) && !/^(Matrix|Solution|Row|Idea|Notes) ?\d*$/.test(x));

    // Old saves hold the top node bare; newer ones under the hidden root. Both
    // the same way, or combining would see two different trees.
    const wrapRoot = (str) => {
        const d = JSON.parse(str);
        if (d.tree && d.tree._id !== '__root__' && !d.tree._isPlaceholder) {
            d.tree = { name: '', color: '#323a4a', _isPlaceholder: true, _id: '__root__', children: [d.tree] };
        }
        return JSON.stringify(d);
    };

    // Nodes as "id|name", to tell whether two flowcharts started as the same one.
    const nodeKeys = (data) => {
        const out = new Set();
        const walk = (n) => {
            if (!n) return;
            if (n._id && n._id !== '__root__' && tidy(n.name || '')) out.add(`${n._id}|${tidy(n.name)}`);
            (n.children || []).forEach(walk);
        };
        walk(data && data.tree);
        return out;
    };

    const nodeIds = (data) => new Set([...nodeKeys(data)].map(k => k.slice(0, k.indexOf('|'))));

    const openDb = () => new Promise((res, rej) => {
        const r = indexedDB.open('flowchart-backups', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('copies', { keyPath: 'at' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
    const saveBackup = async (entry) => {
        const db = await openDb();
        await new Promise((res, rej) => {
            const tx = db.transaction('copies', 'readwrite');
            tx.objectStore('copies').put(entry);
            tx.oncomplete = res;
            tx.onerror = tx.onabort = () => rej(tx.error);
        });
        db.close();
    };
    const listBackups = async () => {
        const db = await openDb();
        const all = await new Promise((res, rej) => {
            const q = db.transaction('copies').objectStore('copies').getAll();
            q.onsuccess = () => res(q.result || []);
            q.onerror = () => rej(q.error);
        });
        db.close();
        return all;
    };

    const methods = {
        // The ordinary copies of a shared flowchart of the owner's: same name,
        // and clearly the same flowchart (nodes in common).
        sharedTwinOf(item) {
            if (!item || !item.share || item.share.role !== 'owner') return null;
            const own = this.ownFlowcharts().find(o => o.title === item.share.title);
            if (!own) return null;
            const a = nodeKeys(this.parseFlowchartData(own));
            const b = nodeKeys(this.parseFlowchartData(item));
            const common = [...a].filter(k => b.has(k)).length;
            const least = Math.min(a.size, b.size);
            return least > 0 && common >= Math.max(1, Math.ceil(least * 0.3)) ? own : null;
        },

        // What combining would give, without changing anything.
        planShareFold(own, item) {
            own = { title: own.title, data: wrapRoot(own.data) };
            item = { title: item.title, data: wrapRoot(item.data) };
            const a = this.stripImagesFromDataString(own.data || '');
            const b = this.stripImagesFromDataString(item.data || '');
            const images = Object.assign({}, a.imageMap, b.imageMap);
            // The shared copy is given as "this device's": its side stands where both differ.
            const merged = this.mergeFlowchartItem(null, { title: own.title, data: item.data }, b.stripped, { title: own.title, data: a.stripped }, images);
            const m = this.stripImagesFromDataString(merged.data || '').stripped;
            const A = contentOf(JSON.parse(a.stripped));
            const B = contentOf(JSON.parse(b.stripped));
            const M = contentOf(JSON.parse(m));
            return {
                data: merged.data,
                onlyInOwn: missing(A, B),
                lostFromShared: missing(B, M),
                lostFromOwn: missing(A, M),
                // Nodes of either that aren't in the result at all.
                lostNodes: [...nodeIds(JSON.parse(a.stripped)), ...nodeIds(JSON.parse(b.stripped))].filter(x => !nodeIds(JSON.parse(m)).has(x))
            };
        },

        async foldShare(ownTitle, shareId, { ask = true } = {}) {
            if (this._folding) return false;
            this._folding = true;
            try {
                if (typeof this.autosaveNow === 'function') this.autosaveNow();
                this.saveCurrentFlowchart();
                const find = () => ({ own: this.ownFlowcharts().find(o => o.title === ownTitle), item: this.findSharedItem(shareId) });
                let { own, item } = find();
                if (!own || !item || item.share.role !== 'owner') return false;
                const conn = this.shareConnOf(item);
                if (!conn) throw new Error('Sign in again first.');
                // The latest of the shared copy, and every picture of both.
                await this.pullShareItem(item, conn);
                for (const which of ['own', 'item']) {
                    const it = find()[which];
                    if (it) await this.rehydrateFlowchartImages(this.flowchartList.indexOf(it));
                }
                ({ own, item } = find());
                if (!own || !item) return false;
                if (/"@img:/.test(own.data || '')) throw new Error('Some pictures in your copy could not be loaded, so nothing was changed. Try again when online.');

                const plan = this.planShareFold(own, item);
                if (plan.lostFromShared.length) throw new Error(`Combining would lose something from the shared copy ("${plan.lostFromShared[0].slice(0, 60)}"), so nothing was changed.`);
                if (plan.lostNodes.length) throw new Error('Combining would lose some nodes, so nothing was changed.');
                const different = plan.onlyInOwn.length || plan.lostFromOwn.length;
                if (different && !ask) return 'ask';
                if (different) {
                    const ok = await this.showConfirmDialog(
                        `"${ownTitle}" is here twice: your own and the shared one. Combine them into one "${ownTitle}" that stays shared?\n\n`
                        + `Everything in the shared one is kept. Your own copy has ${plan.onlyInOwn.length} thing${plan.onlyInOwn.length === 1 ? '' : 's'} the shared one doesn't; `
                        + (plan.lostFromOwn.length ? `${plan.lostFromOwn.length} of them differ from the shared copy's version, which is kept instead.` : 'they are added.')
                        + ' Both copies are backed up on this device first. People you shared it with will see the combined one.', 'Combine');
                    if (!ok) return false;
                    const now = find();
                    if (!now.own || !now.item || now.own.data !== own.data || now.item.data !== item.data) throw new Error('One of them changed meanwhile - try again.');
                }

                await saveBackup({ at: Date.now(), title: ownTitle, original: own.data, shared: item.data });

                const ownData = own.data;
                const wasOpen = this.flowchartList[this.currentSlotIndex];
                const openIsOneOfThem = wasOpen === own || wasOpen === item;
                item.data = plan.data;
                this.saveFlowchartList();
                if (wasOpen === item) {
                    this._applyingRemote = true;
                    try { this.loadFlowchartFromList(this.flowchartList.indexOf(item)); } finally { this._applyingRemote = false; }
                }
                // On the server before anything is taken away.
                const want = () => { const it = this.findSharedItem(shareId); return it ? this.stripImagesFromDataString(it.data || '').stripped : null; };
                let saved = false;
                for (let i = 0; i < 12 && !saved; i++) {
                    await this.pushShares();
                    const st = this.loadShareState()[shareId] || {};
                    saved = want() !== null && st.base === want();
                    if (!saved) await new Promise(r => setTimeout(r, 700));
                }
                if (!saved) throw new Error('The combined flowchart could not be saved to the server yet, so your own copy was kept.');

                if (typeof this.autosaveNow === 'function') this.autosaveNow();
                if (this.flowchartList[this.currentSlotIndex] === find().own) this.saveCurrentFlowchart();
                ({ own, item } = find());
                if (!item) return false;
                if (own) {
                    if (own.data !== ownData && this.planShareFold(own, item).onlyInOwn.length) throw new Error('Your own copy changed meanwhile, so it was kept - combine again.');
                    const open = this.flowchartList[this.currentSlotIndex];
                    this.flowchartList.splice(this.flowchartList.indexOf(own), 1);
                    item.title = this.uniqueTitle(item.share.title, item);
                    const stay = openIsOneOfThem ? item : open;
                    this.currentSlotIndex = Math.max(0, this.flowchartList.indexOf(stay));
                    if (open === own) {
                        this._applyingRemote = true;
                        try { this.loadFlowchartFromList(this.currentSlotIndex); } finally { this._applyingRemote = false; }
                    }
                }
                this.saveFlowchartList();
                if (typeof this.saveActiveFlowchartIndex === 'function') this.saveActiveFlowchartIndex();
                this.scheduleCloudPush();
                this.showNotification(`"${item.title}" is one flowchart again (still shared).`, 5000);
                return true;
            } finally {
                this._folding = false;
            }
        },

        // After each look for shared changes: put any pair back together.
        async foldSharedTwins() {
            if (this._folding || this._cloudSyncInFlight || this._shareBusy) return;
            if (!this._foldAsked) this._foldAsked = new Set();
            for (const item of this.sharedItems()) {
                const own = this.sharedTwinOf(item);
                if (!own || this._foldAsked.has(item.share.id)) continue;
                const id = item.share.id;
                try {
                    let r = await this.foldShare(own.title, id, { ask: false });
                    if (r === 'ask') {
                        this._foldAsked.add(id); // once per visit; Manage access offers it again
                        r = await this.foldShare(own.title, id);
                    }
                } catch (err) {
                    this._foldAsked.add(id);
                    console.error('Combining the shared flowchart failed:', err);
                    this.showNotification(`"${item.share.title}": ${err.message}`, 7000);
                }
                return;
            }
        }
    };
    Object.assign(FlowchartViewer.prototype, methods);
    const proto = FlowchartViewer.prototype;

    const origPoll = proto.pollShares;
    proto.pollShares = async function (...args) {
        const r = await origPoll.apply(this, args);
        try { await this.foldSharedTwins(); } catch (err) { console.error('Shared copies check failed:', err); }
        return r;
    };

    // Manage access: combine with any of your own flowcharts (for a copy that
    // was renamed), and download the backups.
    const origPanel = proto.renderOwnerPanel;
    proto.renderOwnerPanel = function (pop, item, status, setStatus, closeRow) {
        const r = origPanel.call(this, pop, item, status, setStatus, closeRow);
        const box = document.createElement('div');
        const own = this.ownFlowcharts();
        if (own.length) {
            const label = document.createElement('label');
            label.className = 'cs-label';
            label.textContent = 'Is there another copy of this in your list?';
            const row = document.createElement('div');
            row.className = 'cs-row';
            const pick = document.createElement('select');
            pick.className = 'cs-input';
            own.forEach((o) => { const op = document.createElement('option'); op.value = o.title; op.textContent = o.title; pick.append(op); });
            const twin = own.find(o => o.title === item.share.title);
            if (twin) pick.value = twin.title;
            const go = document.createElement('button');
            go.type = 'button';
            go.className = 'cs-btn';
            go.textContent = 'Combine into this one';
            go.addEventListener('click', async () => {
                go.disabled = true;
                try {
                    const done = await this.foldShare(pick.value, item.share.id);
                    if (done === true) { this._sharePanelIndex = this.flowchartList.indexOf(this.findSharedItem(item.share.id)); this.renderSharePanel(); }
                } catch (err) { setStatus(err.message, true); }
                go.disabled = false;
            });
            row.append(pick, go);
            box.append(label, row);
        }
        const backups = document.createElement('div');
        listBackups().then((all) => {
            const mine = all.filter(b => b.title === item.share.title);
            if (!mine.length) return;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'cs-btn';
            b.textContent = 'Download the copies from before combining';
            b.addEventListener('click', () => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([JSON.stringify(mine, null, 1)], { type: 'application/json' }));
                a.download = `${item.share.title} - before combining.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            });
            backups.append(b);
        }).catch(() => { /* none */ });
        box.append(backups);
        pop.insertBefore(box, closeRow && closeRow.parentNode === pop ? closeRow : null);
        return r;
    };
})();
