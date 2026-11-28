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

    // Two kinds of backup, both in a fixed number of slots so the space used stays bounded:
    //  - daily: the last version of each day something was changed, in SLOTS slots -
    //    once they are all used, the newest replaces the oldest.
    //  - half-hourly: during the day, the version every half hour (at most one per
    //    half hour), wiped when the day is over (its last version having gone into a
    //    daily slot), so they never pile up.
    // Days are the device's own (local) days.
    const DAY_MS = 86400000;
    const SLOTS = 16;
    const DAY_KEY = 'cloud-backup-day2';
    const HALF_MS = 30 * 60000;
    const localDay = at => Math.floor((at - new Date(at).getTimezoneOffset() * 60000) / DAY_MS);
    const halfOfDay = (at) => { const d = new Date(at); return Math.floor((d.getHours() * 60 + d.getMinutes()) / 30); };

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
        async snapshotServerTo(slot, kind, extra) {
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
                v: 1, kind, at, day: localDay(at), charts: main.flowchartList.length, ...(extra || {}),
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

        // When the cloud copy was last changed.
        async serverUpdatedAt() {
            const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=eq.${encodeURIComponent(this.cloudSyncId)}&select=updated_at`, {
                headers: this.cloudHeaders({ 'Accept': 'application/json' })
            });
            if (!res.ok) return null;
            const row = (await res.json())[0];
            const t = row && (typeof row.updated_at === 'number' ? row.updated_at : Date.parse(row.updated_at));
            return Number.isFinite(t) ? t : null;
        },

        // Called by cloudPush just before it replaces the cloud copy. Never blocks syncing.
        async ensureServerBackup() {
            try {
                if (!this.cloudProjectUrl || !this.cloudSyncId) return;
                const now = Date.now();
                const today = localDay(now);
                await this.ensureDailyBackup(today);
                await this.ensureHalfHourBackup(now, today);
            } catch (err) {
                console.error('Server backup failed (syncing carries on):', err);
            }
        },

        // The first push of a day: what the server holds is the last version of the
        // day it was last changed on - kept in a daily slot (the oldest one once all
        // are used), and the half-hourly backups of earlier days are wiped.
        async ensureDailyBackup(today) {
            if (this._backupDay === today) return;
            let done = 0;
            try { done = Number(localStorage.getItem(DAY_KEY)) || 0; } catch (e) { /* ignore */ }
            const mark = () => { this._backupDay = today; try { localStorage.setItem(DAY_KEY, String(today)); } catch (e) { /* ignore */ } };
            if (done === today) { this._backupDay = today; return; }
            const changed = await this.serverUpdatedAt();
            const editDay = changed ? localDay(changed) : today - 1;
            // Changed today already (another device): today isn't over - but yesterday's
            // last version was kept by that device's first push.
            if (editDay < today) {
                const rows = await this.listServerBackups();
                const daily = rows.filter(r => r.meta.kind === 'daily');
                if (!daily.some(r => (r.meta.editDay !== undefined ? r.meta.editDay : r.meta.day) === editDay)) {
                    let id;
                    if (daily.length < SLOTS) {
                        const used = new Set(daily.map(r => r.id));
                        for (let i = 0; i < SLOTS && !id; i++) if (!used.has(this.backupRowId(`d${i}`))) id = this.backupRowId(`d${i}`);
                    }
                    if (!id) id = daily.slice().sort((a, b) => (a.meta.at || 0) - (b.meta.at || 0))[0].id;
                    const slot = id.slice(this.backupRowId('').length);
                    await this.snapshotServerTo(slot, 'daily', { editDay, editedAt: changed || undefined });
                }
                // Earlier days' half-hourly backups go (their last version is kept above).
                const stale = rows.filter(r => r.meta.kind === 'half' && r.meta.day !== today);
                if (stale.length) {
                    await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=in.(${stale.map(r => `"${encodeURIComponent(r.id)}"`).join(',')})`, {
                        method: 'DELETE',
                        headers: this.cloudHeaders({ 'Prefer': 'return=minimal' })
                    }).catch(() => {});
                }
            }
            mark();
        },

        // At most once each half hour of the day: the version the server holds.
        async ensureHalfHourBackup(now, today) {
            const half = halfOfDay(now);
            const key = `${today}:${half}`;
            if (this._backupHalf === key) return;
            const id = this.backupRowId(`h${half}`);
            const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=eq.${encodeURIComponent(id)}&select=meta:data->meta`, {
                headers: this.cloudHeaders({ 'Accept': 'application/json' })
            });
            if (res.ok) {
                const row = (await res.json())[0];
                if (row && row.meta && row.meta.day === today && now - (row.meta.at || 0) < HALF_MS) { this._backupHalf = key; return; }
            }
            // Nothing changed today yet: nothing of today's to keep.
            const changed = await this.serverUpdatedAt();
            if (changed && localDay(changed) !== today) { this._backupHalf = key; return; }
            if (await this.snapshotServerTo(`h${half}`, 'half', { editedAt: changed || undefined })) this._backupHalf = key;
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
                const dayLabel = at => new Date(at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
                title.textContent = m.kind === 'undo' ? `Before the last restore - ${this.backupLabel(m.at)}`
                    : m.kind === 'half' ? `Today, half-hourly - ${new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : `End of ${dayLabel(m.editedAt || (m.editDay !== undefined ? m.at - DAY_MS : m.at))}`;
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
                const look = document.createElement('button');
                look.type = 'button';
                look.className = 'cs-btn cs-small-btn';
                look.textContent = '👁 Preview';
                look.title = 'Look through this backup\'s flowcharts first. Nothing is changed or saved while you look.';
                look.addEventListener('click', () => this.previewServerBackup(r.id));
                const btns = document.createElement('div');
                btns.className = 'cs-row';
                btns.append(look, copies, all);
                row.append(info, btns);
                box.append(row);
            });
        },

        // ----- Previewing a backup -----
        // The backup's flowcharts are drawn in the chart, one at a time (picked on the
        // banner), read only: nothing is saved or synced while previewing, and Exit
        // brings back the open flowchart as it was.
        async previewServerBackup(id) {
            try {
                await this.ensureCloudToken();
                this.setCloudPopupStatus('Reading the backup...');
                const snap = await this.readServerBackup(id);
                const charts = snap.list.filter(i => i && typeof i.title === 'string');
                if (!charts.length) { this.setCloudPopupStatus('That backup has no flowcharts.', true); return; }
                this.setCloudPopupStatus('');
                if (this.cloudSyncPopup) this.cloudSyncPopup.style.display = 'none';
                if (!this._bakPreview) {
                    // What's open now is saved first; it comes back on Exit.
                    try { if (typeof this.flushNotesEditors === 'function') this.flushNotesEditors(); this.saveCurrentFlowchart(); this.saveFlowchartList(); } catch (e) { /* as it was */ }
                    if (this.nodeBeingEdited && typeof this.hideNodeEditPopup === 'function') this.hideNodeEditPopup(false);
                }
                this._bakPreview = { id, snap, charts, at: 0 };
                this.showBackupPreviewChart(0);
            } catch (err) {
                console.error('Previewing a backup failed:', err);
                this.setCloudPopupStatus('Preview failed: ' + err.message, true);
            }
        },

        showBackupPreviewChart(i) {
            const p = this._bakPreview;
            if (!p) return;
            p.at = i;
            let tree = null;
            try { tree = JSON.parse(p.charts[i].data || '{}').tree; } catch (e) { tree = null; }
            if (!tree) tree = { name: '(this flowchart could not be read)', color: '#c9372c' };
            if (typeof this.deselectNode === 'function') this.deselectNode();
            this.renderFlowchart(this.wrapRootWithPlaceholder(tree), { fitView: true });
            if (typeof this.applyPendingFit === 'function') { try { this.applyPendingFit(); } catch (e) { /* fits on its own */ } }
            let bar = document.getElementById('bak-preview-bar');
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'bak-preview-bar';
                bar.style.cssText = 'position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:6000; display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; max-width:calc(100% - 20px); padding:6px 10px; border-radius:20px; background:rgba(30,36,48,0.95); border:1px solid #4c9aff; color:#e6eef8; font:13px Arial,sans-serif; box-shadow:0 4px 16px rgba(0,0,0,0.35);';
                document.body.append(bar);
            }
            bar.innerHTML = '';
            const btn = (text, fn, primary) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = text;
                b.style.cssText = `padding:4px 11px; border-radius:14px; border:1px solid rgba(255,255,255,0.2); cursor:pointer; font:inherit; ${primary ? 'background:#4c9aff; color:#10233f; font-weight:bold;' : 'background:rgba(255,255,255,0.08); color:#e6eef8;'}`;
                b.addEventListener('click', fn);
                return b;
            };
            const label = document.createElement('b');
            label.textContent = `👁 Backup preview - ${this.backupLabel(p.snap.meta.at || Date.now())}`;
            const pick = document.createElement('select');
            pick.style.cssText = 'max-width:40vw; padding:3px; border-radius:6px;';
            p.charts.forEach((c, j) => { const o = document.createElement('option'); o.value = String(j); o.textContent = c.title || '(untitled)'; if (j === i) o.selected = true; pick.append(o); });
            pick.addEventListener('change', () => this.showBackupPreviewChart(Number(pick.value)));
            const id = p.id;
            bar.append(label, pick,
                btn('Open as copies', () => { this.exitBackupPreview(); this.restoreServerBackup(id, 'copies'); }),
                btn('Restore all', () => { this.exitBackupPreview(); this.restoreServerBackup(id, 'replace'); }),
                btn('✕ Exit preview', () => this.exitBackupPreview(), true));
        },

        exitBackupPreview() {
            if (!this._bakPreview) return;
            this._bakPreview = null;
            const bar = document.getElementById('bak-preview-bar');
            if (bar) bar.remove();
            if (typeof this.deselectNode === 'function') this.deselectNode();
            this.loadFlowchartFromList(this.currentSlotIndex);
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

    // While a backup is being previewed nothing is saved or synced (the chart
    // shows the backup, not the flowchart that's open).
    const proto = FlowchartViewer.prototype;
    ['autosave', 'autosaveNow', 'saveCurrentFlowchart', 'saveFlowchartList', 'scheduleCloudPush'].forEach((name) => {
        const orig = proto[name];
        if (!orig) return;
        proto[name] = function (...args) { return this._bakPreview ? undefined : orig.apply(this, args); };
    });
    ['cloudPush', 'cloudPull'].forEach((name) => {
        const orig = proto[name];
        if (!orig) return;
        proto[name] = function (...args) { return this._bakPreview ? Promise.resolve(false) : orig.apply(this, args); };
    });
    // Opening another flowchart ends the preview.
    const origLoad = proto.loadFlowchartFromList;
    if (origLoad) {
        proto.loadFlowchartFromList = function (...args) {
            if (this._bakPreview) { this._bakPreview = null; const bar = document.getElementById('bak-preview-bar'); if (bar) bar.remove(); }
            return origLoad.apply(this, args);
        };
    }
})();
