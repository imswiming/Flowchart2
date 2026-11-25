// ===== One flowchart, not an original and a shared copy =====
// A flowchart the owner shares is kept in a row of its own (sharing.js). If the
// owner's ordinary list still holds the original - shared before signing in,
// or brought back by another device - the owner sees both "X" and
// "X (shared)", and they drift apart. Here the shared one, being the newest,
// takes the original's place: one flowchart with the original's name, still
// shared. It asks first, and:
// - both copies are backed up on this device and downloaded as a file first;
// - the shared one's contents are never changed by this;
// - the original goes only once the shared one is confirmed on the server.
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
    const download = (data, name) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
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

        // What the original has that the shared one doesn't.
        onlyInOriginal(own, item) {
            const of = it => contentOf(JSON.parse(this.stripImagesFromDataString(it.data || '{}').stripped));
            return missing(of(own), of(item));
        },

        async foldShare(ownTitle, shareId) {
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
                const asked = own.data;
                const extra = this.onlyInOriginal(own, item).length;
                const ok = await this.showConfirmDialog(
                    `Replace the original "${ownTitle}" with the shared version?\n\n`
                    + (extra ? `The original has ${extra} thing${extra === 1 ? '' : 's'} the shared version doesn't; they go. ` : '')
                    + 'Nothing in the shared version changes. Both are backed up and downloaded as a file first.', 'Replace');
                if (!ok) return false;
                ({ own, item } = find());
                if (!own || !item || this.onlyInOriginal(own, { data: asked }).length) throw new Error('The original changed meanwhile - try again.');

                const backup = { at: Date.now(), title: item.share.title, original: own.data, shared: item.data };
                await saveBackup(backup);
                download([backup], `${item.share.title} - backup ${new Date(backup.at).toISOString().slice(0, 16).replace(/:/g, '.')}.json`);

                const ownData = own.data;
                const wasOpen = this.flowchartList[this.currentSlotIndex];
                const openIsOneOfThem = wasOpen === own || wasOpen === item;
                // On the server before anything is taken away.
                const want = () => { const it = this.findSharedItem(shareId); return it ? this.stripImagesFromDataString(it.data || '').stripped : null; };
                let saved = false;
                for (let i = 0; i < 12 && !saved; i++) {
                    await this.pushShares();
                    const st = this.loadShareState()[shareId] || {};
                    saved = want() !== null && st.base === want();
                    if (!saved) await new Promise(r => setTimeout(r, 700));
                }
                // Not from this device's memory of it: what Supabase holds right now.
                if (saved) {
                    const got = await this.sbRest(conn, `${this.CLOUD_TABLE}?id=eq.${encodeURIComponent('share::' + shareId)}&select=updated_at,data`);
                    saved = !!(got && got[0] && got[0].data && got[0].data.data === want());
                }
                if (!saved) throw new Error('This device does not have the same shared version as the server yet, so the original was kept - try again in a moment.');

                if (typeof this.autosaveNow === 'function') this.autosaveNow();
                if (this.flowchartList[this.currentSlotIndex] === find().own) this.saveCurrentFlowchart();
                ({ own, item } = find());
                if (!item) return false;
                if (own) {
                    if (this.onlyInOriginal(own, { data: ownData }).length) throw new Error('The original changed meanwhile, so it was kept - try again.');
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

        // After each look for shared changes: offer to make a pair one.
        async foldSharedTwins() {
            if (this._folding || this._cloudSyncInFlight || this._shareBusy) return;
            if (!this._foldAsked) this._foldAsked = new Set();
            for (const item of this.sharedItems()) {
                const own = this.sharedTwinOf(item);
                if (!own || this._foldAsked.has(item.share.id)) continue;
                const id = item.share.id;
                try {
                    this._foldAsked.add(id); // once per visit; Manage access offers it again
                    await this.foldShare(own.title, id);
                } catch (err) {
                    console.error('Replacing the original with the shared flowchart failed:', err);
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

    // Manage access: replace any older copy in your own list (one that
    // was renamed), and the backups.
    const origPanel = proto.renderOwnerPanel;
    proto.renderOwnerPanel = function (pop, item, status, setStatus, closeRow) {
        const r = origPanel.call(this, pop, item, status, setStatus, closeRow);
        const box = document.createElement('div');
        const own = this.ownFlowcharts();
        if (own.length) {
            const label = document.createElement('label');
            label.className = 'cs-label';
            label.textContent = 'Is there an older copy of this in your list?';
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
            go.textContent = 'Replace it with this one';
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
            b.textContent = 'Download the copies from before replacing';
            b.addEventListener('click', () => {
                download(mine, `${item.share.title} - before replacing.json`);
            });
            backups.append(b);
            // If the two were combined (an earlier version did that): the shared
            // version exactly as it was before.
            const newest = mine.filter(x => x.shared).pop();
            if (!newest || missing(contentOf(JSON.parse(this.stripImagesFromDataString(item.data || '{}').stripped)),
                contentOf(JSON.parse(this.stripImagesFromDataString(newest.shared).stripped))).length === 0) return;
            const put = document.createElement('button');
            put.type = 'button';
            put.className = 'cs-btn';
            put.textContent = `Go back to the shared version of ${new Date(newest.at).toLocaleString()}`;
            put.addEventListener('click', async () => {
                try {
                    if (!await this.showConfirmDialog('Go back to that version? Anything changed since goes, for everyone it is shared with. The version now is downloaded as a backup first.', 'Go back')) return;
                    if (typeof this.autosaveNow === 'function') this.autosaveNow();
                    const it = this.findSharedItem(item.share.id);
                    if (!it) return;
                    const i = this.flowchartList.indexOf(it);
                    if (i === this.currentSlotIndex) this.saveCurrentFlowchart();
                    const now = { at: Date.now(), title: item.share.title, original: it.data };
                    await saveBackup(now);
                    download([now], `${item.share.title} - backup.json`);
                    it.data = newest.shared;
                    if (i === this.currentSlotIndex) {
                        this._applyingRemote = true;
                        try { this.loadFlowchartFromList(i); } finally { this._applyingRemote = false; }
                    }
                    this.saveFlowchartList();
                    this.pushShares();
                    this.renderSharePanel();
                } catch (err) { setStatus(err.message, true); }
            });
            backups.append(put);
        }).catch(() => { /* none */ });
        box.append(backups);
        pop.insertBefore(box, closeRow && closeRow.parentNode === pop ? closeRow : null);
        return r;
    };
})();
