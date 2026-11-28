// ===== Server backups (Cloud Sync > Server backups) =====
// The cloud copy of your flowcharts is overwritten by every sync, so if a device
// ever pushes something wrong, nothing would remain. To guard against that, the
// first time a device syncs on a new day it saves what the server held just before
// (flowcharts + global notes, text only - pictures are rows of their own that are
// never removed) into one of 16 fixed "slots": slot = day number mod 16. A new day
// overwrites the slot it reuses, so there are never more than 16 daily backups
// (about the last two weeks, and a day or two over), the space stays bounded and
// nothing piles up. Each is gzip-compressed, which makes them a fraction of the size
// of the live data.
//
// Cloud Sync > "Server backups" lists them; each can be opened as copies (nothing
// existing is touched) or restored over everything (the version being replaced is
// first kept in an extra "before last restore" slot, so even that can be undone).
(function () {
    if (typeof FlowchartViewer === 'undefined') return;

    const DAY_MS = 86400000;
    const SLOTS = 16;
    const DAY_KEY = 'cloud-backup-day';

    const toB64 = (bytes) => {
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    };
    const fromB64 = (str) => {
        const s = atob(str);
        const b = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
        return b;
    };
    const gzip = async (text) => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    const gunzip = async (bytes) => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Blob === 'function';
    const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

    const methods = {
        backupRowId(slot) {
            return `${this.cloudSyncId}::bak::${slot}`;
        },

        async fetchRowData(id) {
            const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=eq.${encodeURIComponent(id)}&select=data`, {
                headers: this.cloudHeaders({ 'Accept': 'application/json' })
            });
            if (!res.ok) throw new Error(`Supabase API error ${res.status}: ${await res.text()}`);
            const row = (await res.json())[0];
            return row ? row.data : null;
        },

        // Writes what the server holds right now (flowcharts + global notes) into a backup slot.
        async snapshotServerTo(slot, kind) {
            const main = await this.fetchRowData(this.cloudSyncId);
            if (!main || !Array.isArray(main.flowchartList)) return false;
            let gn = null;
            try { gn = await this.fetchRowData(this.globalNotesRowId()); } catch (err) { /* global notes are optional */ }
            const payload = JSON.stringify({
                flowchartList: main.flowchartList,
                globalNotes: gn && Array.isArray(gn.tabs) ? { tabs: gn.tabs } : null
            });
            const at = Date.now();
            const meta = {
                v: 1, kind, at, day: Math.floor(at / DAY_MS), charts: main.flowchartList.length,
                titles: main.flowchartList.slice(0, 12).map(i => String(i.title || '').slice(0, 60)),
                notes: gn && Array.isArray(gn.tabs) ? gn.tabs.length : 0, raw: payload.length
            };
            const data = { meta };
            if (canZip()) {
                const z = await gzip(payload);
                meta.enc = 'gzip';
                meta.bytes = z.length;
                data.z = toB64(z);
            } else {
                meta.bytes = payload.length;
                data.plain = JSON.parse(payload);
            }
            const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}`, {
                method: 'POST',
                headers: this.cloudHeaders({ 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                body: JSON.stringify([{ id: this.backupRowId(slot), updated_at: at, data }])
            });
            if (!res.ok) throw new Error(`Supabase API error ${res.status}: ${await res.text()}`);
            return true;
        },

        // Called by cloudPush just before it replaces the cloud copy: the first time
        // on each day, keep the copy about to be replaced. Never blocks syncing.
        async ensureServerBackup() {
            try {
                if (!this.cloudProjectUrl || !this.cloudSyncId) return;
                const today = Math.floor(Date.now() / DAY_MS);
                if (this._backupDay === today) return;
                let done = 0;
                try { done = Number(localStorage.getItem(DAY_KEY)) || 0; } catch (e) { /* ignore */ }
                if (done === today) { this._backupDay = today; return; }
                const slot = today % SLOTS;
                const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=eq.${encodeURIComponent(this.backupRowId(slot))}&select=meta:data->meta`, {
                    headers: this.cloudHeaders({ 'Accept': 'application/json' })
                });
                if (res.ok) {
                    const row = (await res.json())[0];
                    if (row && row.meta && row.meta.day === today) {
                        this._backupDay = today;
                        try { localStorage.setItem(DAY_KEY, String(today)); } catch (e) { /* ignore */ }
                        return;
                    }
                }
                if (await this.snapshotServerTo(slot, 'daily')) {
                    this._backupDay = today;
                    try { localStorage.setItem(DAY_KEY, String(today)); } catch (e) { /* ignore */ }
                }
            } catch (err) {
                console.error('Server backup failed (syncing carries on):', err);
            }
        },

        async listServerBackups() {
            const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=like.${encodeURIComponent(this.cloudSyncId + '::bak::')}*&select=id,updated_at,meta:data->meta&order=updated_at.desc`, {
                headers: this.cloudHeaders({ 'Accept': 'application/json' })
            });
            if (!res.ok) throw new Error(`Supabase API error ${res.status}: ${await res.text()}`);
            return (await res.json()).filter(r => r && r.meta && r.meta.v === 1);
        },

        async readServerBackup(id) {
            const data = await this.fetchRowData(id);
            if (!data) throw new Error('That backup is gone.');
            let payload = data.plain;
            if (data.z) {
                if (!canZip()) throw new Error("This browser can't unpack backups - open the app in a current Chrome, Edge, Safari or Firefox.");
                payload = JSON.parse(await gunzip(fromB64(data.z)));
            }
            if (!payload || !Array.isArray(payload.flowchartList)) throw new Error('That backup is unreadable.');
            return { list: payload.flowchartList, globalNotes: payload.globalNotes, meta: data.meta || {} };
        },

        backupLabel(at) {
            return new Date(at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        },

        async showServerBackups() {
            const box = document.getElementById('cloud-backup-list');
            if (!box) return;
            if (!(this.cloudApiKey && this.cloudProjectUrl && this.cloudSyncId)) {
                box.textContent = 'Connect Cloud Sync first.';
                return;
            }
            box.textContent = 'Loading backups...';
            let rows;
            try {
                await this.ensureCloudToken();
                rows = await this.listServerBackups();
            } catch (err) {
                box.textContent = 'Could not load the backups: ' + err.message;
                return;
            }
            box.textContent = '';
            if (!rows.length) {
                box.textContent = 'No backups yet - the first one is made the next time this or another device syncs a change.';
                return;
            }
            rows.forEach((r) => {
                const m = r.meta;
                const row = document.createElement('div');
                row.className = 'cs-backup-row';
                const info = document.createElement('div');
                info.className = 'cs-backup-info';
                const title = document.createElement('b');
                title.textContent = (m.kind === 'undo' ? 'Before the last restore - ' : '') + this.backupLabel(m.at);
                const detail = document.createElement('span');
                detail.className = 'cs-muted cs-small';
                detail.textContent = ` ${m.charts} flowchart${m.charts === 1 ? '' : 's'}, ${m.notes || 0} global note${m.notes === 1 ? '' : 's'} (${kb(m.bytes || 0)})`;
                info.append(title, detail);
                if (m.titles && m.titles.length) {
                    const names = document.createElement('div');
                    names.className = 'cs-muted cs-small';
                    names.textContent = m.titles.join(', ') + (m.charts > m.titles.length ? ', ...' : '');
                    info.append(names);
                }
                const copies = document.createElement('button');
                copies.type = 'button';
                copies.className = 'cs-btn cs-small-btn';
                copies.textContent = 'Open as copies';
                copies.title = 'Adds this backup\'s flowcharts next to yours. Nothing you have is changed.';
                copies.addEventListener('click', () => this.restoreServerBackup(r.id, 'copies'));
                const all = document.createElement('button');
                all.type = 'button';
                all.className = 'cs-btn cs-small-btn cs-danger';
                all.textContent = 'Restore all';
                all.title = 'Makes everything - on every device - the way it was in this backup.';
                all.addEventListener('click', () => this.restoreServerBackup(r.id, 'replace'));
                const btns = document.createElement('div');
                btns.className = 'cs-row';
                btns.append(copies, all);
                row.append(info, btns);
                box.append(row);
            });
        },

        async restoreServerBackup(id, mode) {
            const status = (t, err) => { this.setCloudPopupStatus(t, !!err); };
            try {
                await this.ensureCloudToken();
                status('Reading the backup...');
                const snap = await this.readServerBackup(id);
                const label = this.backupLabel(snap.meta.at || Date.now());
                if (mode === 'replace') {
                    if (!confirm(`Restore everything to how it was on ${label}?\n\n` +
                        `Your ${this.ownFlowcharts().length} current flowchart(s) are replaced by the backup's ${snap.list.length}, on this device and on every device signed in to this account. ` +
                        `The version being replaced is kept first under "Before the last restore", so this can be undone.\n\nShared flowcharts and global notes are not replaced.`)) {
                        status('');
                        return;
                    }
                    // Bring this device level with the server, keep the version about to be replaced, then replace.
                    await this.cloudPull();
                    await this.snapshotServerTo('undo', 'undo');
                    this._applyingRemote = true;
                    try {
                        const restored = snap.list.map(i => ({ title: i.title, data: i.data }));
                        this.flowchartList = this.withSharedFlowcharts(restored);
                        this.currentSlotIndex = 0;
                        this.saveFlowchartList();
                        await this.rehydrateFlowchartImages(0);
                        this.loadFlowchartFromList(0);
                        this.saveActiveFlowchartIndex();
                    } finally {
                        this._applyingRemote = false;
                    }
                    this._lastPushedDataJson = null;
                    const ok = await this.cloudPush();
                    if (snap.globalNotes) this.restoreBackupGlobalNotes(snap.globalNotes);
                    status(ok ? 'Restored - every device will pick it up.' : 'Restored here, but the upload failed - it will retry.', !ok);
                    this.showNotification(`Restored the backup from ${label}.`, 5000);
                    return;
                }
                // Copies: a chart that's missing now comes back under its own name, one that
                // differs comes back beside it ("(backup ...)"), identical ones are skipped.
                const short = new Date(snap.meta.at || Date.now()).toLocaleDateString([], { day: 'numeric', month: 'short' });
                let added = 0;
                snap.list.forEach((item) => {
                    if (!item || typeof item.title !== 'string') return;
                    const have = this.flowchartList.find(i => i.title === item.title);
                    let title = item.title;
                    if (have) {
                        const a = this.stripImagesFromDataString(have.data || '').stripped;
                        const b = this.stripImagesFromDataString(item.data || '').stripped;
                        if (a === b) return;
                        let n = 1;
                        const make = () => `${item.title} (backup ${short}${n > 1 ? ' ' + n : ''})`;
                        while (this.flowchartList.some(i => i.title === make())) n++;
                        title = make();
                    }
                    this.flowchartList.push({ title, data: item.data });
                    added++;
                });
                const notes = snap.globalNotes ? this.restoreBackupGlobalNotes(snap.globalNotes) : 0;
                this.saveFlowchartList();
                if (added) {
                    const idx = this.flowchartList.length - added;
                    await this.rehydrateFlowchartImages(idx);
                    this.loadFlowchartFromList(idx);
                }
                this.autosave();
                this.scheduleCloudPush();
                status(`Added ${added} flowchart${added === 1 ? '' : 's'}${notes ? ` and ${notes} global note${notes === 1 ? '' : 's'}` : ''} from the backup.`);
                this.showNotification(added || notes ? `Added ${added} flowchart(s) from the ${label} backup - see 📂 Open.` : 'Everything in that backup is already here.', 5000);
            } catch (err) {
                console.error('Restoring a backup failed:', err);
                status('Restore failed: ' + err.message, true);
            }
        },

        // Global notes only ever gain (see importGlobalNotes): missing ones are added, a
        // changed one is kept alongside as "(imported)".
        restoreBackupGlobalNotes(gn) {
            if (!gn || typeof this.importGlobalNotes !== 'function') return 0;
            const n = this.importGlobalNotes({ tabs: gn.tabs });
            if (n) {
                try { this.refreshEmbeddedEditors(); this.renderNotesTabBar(); } catch (e) { /* ignore */ }
            }
            return n;
        }
    };

    Object.assign(FlowchartViewer.prototype, methods);
})();
