// ===== Sharing a flowchart with other people =====
// The server side (tables, rules and functions) is at the bottom of
// supabase-setup.sql.
//
// - A shared flowchart is taken out of the owner's own synced list and kept in a
//   row of its own, 'share::<share id>' (its pictures: 'share::<id>::img::<hash>').
//   Everyone with access syncs that row, with the same three-way merge the
//   owner's own list uses, so edits from several people combine.
// - Its entry in flowchartList carries `share: { id, url, key, role, title }`:
//   url/key are the owner's Supabase project, so a guest needs nothing of their
//   own - they're signed in anonymously in that project when they join.
// - Owner: "Manage access" makes one-use codes (label + view/edit). The code
//   goes in by hand or rides inside the link. Claiming it (flowchart_claim_invite)
//   adds that person and uses up the code in one statement.
// - A guest can add their email; signing in with it on another device brings the
//   flowchart along without a new code. Each person is listed by name with every
//   device they've used.
// - Guests only ever get this one row: never the owner's global notes or other
//   flowcharts. While a flowchart shared with you is open, global notes are hidden.
(function () {
    if (typeof FlowchartViewer === 'undefined') return;

    const STATE_KEY = 'flowchart-share-sync';          // { shareId: { knownAt, base, title } }
    const GUEST_AUTH_KEY = 'flowchart-guest-auth';     // { projectUrl: { key, auth } }
    const DEVICE_ID_KEY = 'flowchart-device-id';
    const DEVICE_SEEN_KEY = 'flowchart-device-seen';   // { 'url|userId': ms }
    const GUEST_NAME_KEY = 'flowchart-guest-name';
    const EMAIL_PENDING_KEY = 'flowchart-guest-email-pending';
    const POLL_MS = 8000;
    const DISCOVER_MS = 30000;

    const normUrl = u => String(u || '').trim().replace(/\/+$/, '');
    const rowIdOf = id => `share::${id}`;
    const imgPrefixOf = id => `share::${id}::img::`;
    const enc = encodeURIComponent;
    const formatCode = c => {
        const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return s.length > 4 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
    };
    const b64urlEncode = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const b64urlDecode = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))));
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
    const timeAgo = (t) => {
        const ms = Date.now() - new Date(t).getTime();
        if (!Number.isFinite(ms)) return '';
        const m = Math.round(ms / 60000);
        if (m < 2) return 'just now';
        if (m < 60) return `${m} min ago`;
        const h = Math.round(m / 60);
        if (h < 24) return `${h} h ago`;
        const d = Math.round(h / 24);
        if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
        return new Date(t).toLocaleDateString();
    };
    const roleText = r => r === 'owner' ? 'Can manage' : r === 'edit' ? 'Can edit' : 'View only';
    const friendlyError = (err) => {
        const msg = (err && err.message) || String(err);
        if (/anonymous/i.test(msg) && /disabled|not enabled/i.test(msg)) {
            return 'The owner\'s Supabase project doesn\'t allow guest sign-ins yet. (Owner: Supabase > Authentication > Sign In / Providers > turn on "Allow anonymous sign-ins".)';
        }
        if (/Failed to fetch|NetworkError/i.test(msg)) return 'Couldn\'t reach the server - check your connection and try again.';
        if (/flowchart_(claim_invite|create_share|create_invite|share_access)/.test(msg) && /not find|does not exist/i.test(msg)) {
            return 'Sharing isn\'t set up on this Supabase project yet: run the sharing part of supabase-setup.sql in its SQL Editor.';
        }
        return msg;
    };

    const methods = {
        // ----- Start-up -----
        setupSharing() {
            this._shareUploaded = {};      // shareId -> Set of picture hashes known to be on the server
            this._shareBusy = false;
            this._shareLastDiscover = 0;
            this.buildSharingUI();
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) this.pollShares();
            });
            setInterval(() => { if (!document.hidden) this.pollShares(); }, POLL_MS);
            setTimeout(() => this.pollShares(true), 1200);
            setTimeout(() => this.handleJoinLink(), 400);
            window.addEventListener('hashchange', () => this.handleJoinLink());
            this.updateShareBanner();
            // The notes tabs were drawn before the open flowchart was known to be
            // shared - draw them again now.
            setTimeout(() => this.refreshGlobalNotesVisibility(true), 0);
        },

        // Leaves global notes (and redraws the notes tabs) when the open
        // flowchart hides them, or brings them back when it no longer does.
        refreshGlobalNotesVisibility(force) {
            const hide = this.hideGlobalNotes();
            if (hide && this._activeNotesScope === 'global') {
                this._activeNotesScope = 'chart';
                force = true;
                if (typeof this.showEmbeddedEditor === 'function' && this.notesEditor) {
                    try { this.showEmbeddedEditor('chart', this.getActiveNotesTab().id); } catch (e) { /* panel not built yet */ }
                }
            }
            if (force || hide !== this._globalNotesWereHidden) {
                this._globalNotesWereHidden = hide;
                if (typeof this.renderNotesTabBar === 'function') this.renderNotesTabBar();
            }
        },

        buildSharingUI() {
            if (!document.getElementById('share-popup')) {
                document.body.appendChild(el('div', { id: 'share-popup', class: 'cs-popup sh-popup', style: 'display:none;' }));
            }
            if (!document.getElementById('share-join-popup')) {
                document.body.appendChild(el('div', { id: 'share-join-popup', class: 'cs-popup sh-popup', style: 'display:none;' }));
            }
            if (!document.getElementById('share-banner')) {
                const banner = el('div', { id: 'share-banner', style: 'display:none;', title: 'Sharing - who can open this flowchart',
                    onclick: () => this.openSharePanel(this.currentSlotIndex) });
                document.body.appendChild(banner);
            }
            // (The ☰ menu's Share item clicks share-btn - see index.html.)
            ['share-btn', 'top-share-btn'].forEach((id) => {
                const b = document.getElementById(id);
                if (b) b.addEventListener('click', () => this.openSharePanel(this.currentSlotIndex));
            });
        },

        // ----- Small helpers -----
        loadShareState() { return this.loadJSONFromStorage(STATE_KEY, {}) || {}; },
        saveShareState(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) { /* full */ } },
        loadGuestAuths() { return this.loadJSONFromStorage(GUEST_AUTH_KEY, {}) || {}; },
        saveGuestAuth(url, key, auth) {
            const all = this.loadGuestAuths();
            if (auth) all[normUrl(url)] = { key, auth };
            else delete all[normUrl(url)];
            localStorage.setItem(GUEST_AUTH_KEY, JSON.stringify(all));
        },
        sharedItems() { return (this.flowchartList || []).filter(i => i && i.share && i.share.id); },
        findSharedItem(id) { return this.flowchartList.find(i => i && i.share && i.share.id === id) || null; },
        currentSharedItem() {
            if (!Array.isArray(this.flowchartList) || this.currentSlotIndex === null || this.currentSlotIndex === undefined) return null;
            const it = this.flowchartList[this.currentSlotIndex];
            return it && it.share ? it : null;
        },
        // Global notes are the owner's own: hidden while a flowchart shared with
        // you (by someone else) is open.
        hideGlobalNotes() {
            const it = this.currentSharedItem();
            return !!(it && it.share.role !== 'owner');
        },
        deviceId() {
            let id = localStorage.getItem(DEVICE_ID_KEY);
            if (!id) {
                id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
                localStorage.setItem(DEVICE_ID_KEY, id);
            }
            return id;
        },
        deviceName() {
            const ua = navigator.userAgent || '';
            const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
                : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'Chromebook' : /Mac OS X/.test(ua) ? 'Mac'
                : /Linux/.test(ua) ? 'Linux' : 'device';
            const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
                : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
            return `${br} on ${os}`;
        },
        uniqueTitle(title, except) {
            const taken = t => this.flowchartList.some(i => i !== except && i.title === t);
            if (!taken(title)) return title;
            for (let n = 1; ; n++) {
                const t = n === 1 ? `${title} (shared)` : `${title} (shared ${n})`;
                if (!taken(t)) return t;
            }
        },
        inviteLink(share, code) {
            const payload = { u: share.url, k: share.key, s: share.id, t: share.title };
            if (code) payload.c = code;
            return `${location.origin}${location.pathname}#join=${b64urlEncode(JSON.stringify(payload))}`;
        },
        async copyText(text) {
            try {
                await navigator.clipboard.writeText(text);
            } catch (err) {
                const ta = el('textarea', { style: 'position:fixed;opacity:0;' });
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (e) { /* ignore */ }
                ta.remove();
            }
            this.showNotification('Copied.');
        },

        // ----- Talking to Supabase -----
        async sbAuth(url, key, path, { body, token, method } = {}) {
            const headers = { 'apikey': key, 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(`${normUrl(url)}/auth/v1/${path}`, {
                method: method || (body === undefined ? 'GET' : 'POST'),
                headers,
                body: body === undefined ? undefined : JSON.stringify(body)
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const e = new Error(json.msg || json.error_description || json.message || `Sign-in error ${res.status}`);
                e.status = res.status;
                throw e;
            }
            return json;
        },

        toShareAuth(s, prevUser) {
            const u = s.user || prevUser || {};
            return {
                access_token: s.access_token,
                refresh_token: s.refresh_token,
                expires_at: s.expires_at || (Math.floor(Date.now() / 1000) + (s.expires_in || 3600)),
                user: { id: u.id, email: u.email || '', is_anonymous: !!u.is_anonymous && !u.email }
            };
        },

        // How this device talks to one project for sharing: through the main
        // email sign-in when it's the same project, otherwise its guest sign-in.
        shareConn(url) {
            url = normUrl(url);
            if (this._cloudAuth && normUrl(this.cloudProjectUrl) === url) {
                return {
                    url, key: this.cloudApiKey, kind: 'main', userId: this._cloudAuth.user.id,
                    email: this._cloudAuth.user.email || '', isAnon: false,
                    token: async () => ((await this.ensureCloudToken()) && this._cloudAuth ? this._cloudAuth.access_token : null)
                };
            }
            const g = this.loadGuestAuths()[url];
            if (!g || !g.auth || !g.auth.user || !g.auth.user.id) return null;
            return {
                url, key: g.key, kind: 'guest', userId: g.auth.user.id,
                email: g.auth.user.email || '', isAnon: !g.auth.user.email,
                token: () => this.guestToken(url)
            };
        },

        allShareConns() {
            const urls = new Set(Object.keys(this.loadGuestAuths()));
            if (this._cloudAuth && this.cloudProjectUrl) urls.add(normUrl(this.cloudProjectUrl));
            this.sharedItems().forEach(i => urls.add(normUrl(i.share.url)));
            return Array.from(urls).map(u => this.shareConn(u)).filter(Boolean);
        },

        async guestToken(url) {
            const all = this.loadGuestAuths();
            const g = all[url];
            if (!g || !g.auth) return null;
            if (g.auth.expires_at - 90 > Date.now() / 1000) return g.auth.access_token;
            if (!this._guestRefreshing) this._guestRefreshing = {};
            if (this._guestRefreshing[url]) return this._guestRefreshing[url];
            this._guestRefreshing[url] = (async () => {
                try {
                    const r = await this.sbAuth(url, g.key, 'token?grant_type=refresh_token', { body: { refresh_token: g.auth.refresh_token } });
                    const auth = this.toShareAuth(Object.assign({ refresh_token: g.auth.refresh_token }, r), g.auth.user);
                    this.saveGuestAuth(url, g.key, auth);
                    return auth.access_token;
                } catch (err) {
                    console.error('Could not renew the guest sign-in:', err);
                    if (err.status === 400 || err.status === 401) this.saveGuestAuth(url, g.key, null);
                    return null;
                } finally {
                    this._guestRefreshing[url] = null;
                }
            })();
            return this._guestRefreshing[url];
        },

        async sbRest(conn, path, { method = 'GET', body, prefer } = {}) {
            const token = await conn.token();
            if (!token) throw new Error('Signed out - sign in again.');
            const headers = { 'apikey': conn.key, 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
            if (body !== undefined) headers['Content-Type'] = 'application/json';
            if (prefer) headers['Prefer'] = prefer;
            const res = await fetch(`${conn.url}/rest/v1/${path}`, {
                method, headers, body: body === undefined ? undefined : JSON.stringify(body)
            });
            const text = await res.text();
            let json = null;
            try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
            if (!res.ok) {
                const e = new Error((json && (json.message || json.hint)) || text || `Supabase error ${res.status}`);
                e.status = res.status;
                throw e;
            }
            return json;
        },

        rpc(conn, fn, args) {
            return this.sbRest(conn, `rpc/${fn}`, { method: 'POST', body: args || {} });
        },

        // Keeps "last seen" for this device fresh (at most every few hours).
        async touchDevice(conn, force) {
            const seen = this.loadJSONFromStorage(DEVICE_SEEN_KEY, {}) || {};
            const k = `${conn.url}|${conn.userId}`;
            if (!force && seen[k] && Date.now() - seen[k] < 3 * 3600 * 1000) return;
            try {
                await this.rpc(conn, 'flowchart_register_device', { p_device_id: this.deviceId(), p_device_name: this.deviceName() });
                seen[k] = Date.now();
                localStorage.setItem(DEVICE_SEEN_KEY, JSON.stringify(seen));
            } catch (err) { /* sharing not set up on this project - fine */ }
        },

        // Pictures this share needs that the server doesn't have yet go up first,
        // so nobody is ever pointed at a picture they can't fetch.
        async uploadShareImages(conn, shareId, imageMap) {
            if (!this._shareUploaded[shareId]) this._shareUploaded[shareId] = new Set();
            const known = this._shareUploaded[shareId];
            let hashes = Object.keys(imageMap).filter(h => !known.has(h));
            if (hashes.length === 0) return;
            const prefix = imgPrefixOf(shareId);
            for (let i = 0; i < hashes.length; i += 40) {
                const chunk = hashes.slice(i, i + 40);
                const rows = await this.sbRest(conn, `${this.CLOUD_TABLE}?id=in.(${chunk.map(h => enc(prefix + h)).join(',')})&select=id`);
                (rows || []).forEach(r => known.add(r.id.slice(prefix.length)));
            }
            hashes = hashes.filter(h => !known.has(h));
            for (const h of hashes) {
                await this.sbRest(conn, this.CLOUD_TABLE, {
                    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
                    body: [{ id: prefix + h, updated_at: Date.now(), data: { dataUrl: imageMap[h] } }]
                });
                known.add(h);
            }
        },

        async fetchShareImages(item, hashes) {
            const conn = this.shareConn(item.share.url);
            const out = {};
            if (!conn || hashes.length === 0) return out;
            const prefix = imgPrefixOf(item.share.id);
            if (!this._shareUploaded[item.share.id]) this._shareUploaded[item.share.id] = new Set();
            for (let i = 0; i < hashes.length; i += 40) {
                const chunk = hashes.slice(i, i + 40);
                const rows = await this.sbRest(conn, `${this.CLOUD_TABLE}?id=in.(${chunk.map(h => enc(prefix + h)).join(',')})&select=id,data`);
                (rows || []).forEach((row) => {
                    if (row.id.startsWith(prefix) && row.data && typeof row.data.dataUrl === 'string') {
                        const h = row.id.slice(prefix.length);
                        out[h] = row.data.dataUrl;
                        this._shareUploaded[item.share.id].add(h);
                    }
                });
            }
            return out;
        },

        // ----- Keeping shared flowcharts in sync -----
        scheduleSharePush() {
            if (this._applyingRemote || !this.sharedItems().some(i => i.share.role !== 'view')) return;
            clearTimeout(this._sharePushTimer);
            this._sharePushTimer = setTimeout(() => this.pushShares(), 2000);
        },

        async pollShares(forceDiscover) {
            if (this._shareBusy) return;
            const conns = this.allShareConns();
            if (conns.length === 0) return;
            this._shareBusy = true;
            try {
                if (forceDiscover || Date.now() - this._shareLastDiscover > DISCOVER_MS) {
                    this._shareLastDiscover = Date.now();
                    for (const conn of conns) {
                        try { await this.discoverShares(conn); } catch (err) { console.error('Checking shared flowcharts failed:', err); }
                    }
                }
                for (const conn of conns) {
                    const items = this.sharedItems().filter(i => normUrl(i.share.url) === conn.url);
                    if (items.length === 0) continue;
                    try {
                        const rows = await this.sbRest(conn, `${this.CLOUD_TABLE}?id=in.(${items.map(i => enc(rowIdOf(i.share.id))).join(',')})&select=id,updated_at`);
                        const state = this.loadShareState();
                        for (const row of (rows || [])) {
                            const item = this.findSharedItem(row.id.slice(7));
                            if (!item) continue;
                            const st = state[item.share.id] || {};
                            if ((Number(row.updated_at) || 0) !== (st.knownAt || 0)) await this.pullShareItem(item, conn);
                        }
                    } catch (err) {
                        console.error('Shared flowchart sync failed:', err);
                    }
                }
            } finally {
                this._shareBusy = false;
            }
        },

        // Which shares this person belongs to on one project: new ones are added
        // to the list, ones they've lost access to are taken off it.
        async discoverShares(conn) {
            const rows = await this.sbRest(conn, `flowchart_members?user_id=eq.${enc(conn.userId)}&select=share_id,role,name`);
            this.touchDevice(conn);
            const mine = new Map((rows || []).map(r => [r.share_id, r]));
            let changed = false;
            // Lost access (removed, left on another device, or no longer shared).
            this.sharedItems().filter(i => normUrl(i.share.url) === conn.url && !mine.has(i.share.id)).forEach((item) => {
                const wasOwner = item.share.role === 'owner';
                this.removeListItem(this.flowchartList.indexOf(item));
                const st = this.loadShareState();
                delete st[item.share.id];
                this.saveShareState(st);
                if (!wasOwner) this.showNotification(`You no longer have access to "${item.title}".`, 5000);
                changed = true;
            });
            for (const [id, m] of mine) {
                const item = this.findSharedItem(id);
                if (item) {
                    if (item.share.role !== m.role) {
                        item.share.role = m.role;
                        changed = true;
                        if (item === this.currentSharedItem()) this.showNotification(`You can now ${m.role === 'view' ? 'only view' : 'edit'} "${item.title}".`);
                    }
                    continue;
                }
                const got = await this.sbRest(conn, `${this.CLOUD_TABLE}?id=eq.${enc(rowIdOf(id))}&select=updated_at,data`);
                const row = got && got[0];
                if (!row || !row.data || typeof row.data.data !== 'string') continue;
                const title = row.data.title || 'Shared flowchart';
                this.flowchartList.push({
                    title: this.uniqueTitle(title),
                    data: row.data.data,
                    share: { id, url: conn.url, key: conn.key, role: m.role, title }
                });
                const st = this.loadShareState();
                st[id] = { knownAt: Number(row.updated_at) || 0, base: row.data.data, title };
                this.saveShareState(st);
                changed = true;
                if (m.role !== 'owner' && !this._joiningShareId) this.showNotification(`"${title}" was shared with you - it's in 📂 Open.`, 5000);
            }
            if (changed) {
                this.tidySharedTitles();
                this.saveFlowchartList();
                this.updateShareBanner();
            }
        },

        // A shared flowchart shown as "X (shared)" because the name was taken goes
        // back to plain "X" once it's free.
        tidySharedTitles() {
            this.sharedItems().forEach((item) => {
                if (item.title !== item.share.title && !this.flowchartList.some(i => i !== item && i.title === item.share.title)) {
                    item.title = item.share.title;
                }
            });
        },

        removeListItem(index) {
            if (index < 0 || index >= this.flowchartList.length) return;
            const wasOpen = index === this.currentSlotIndex;
            this.flowchartList.splice(index, 1);
            if (this.currentSlotIndex > index) this.currentSlotIndex--;
            if (wasOpen) {
                this.currentSlotIndex = null;
                if (this.flowchartList.length === 0) {
                    this.gantt = null;
                    this.kanban = null;
                    this.criteria = [];
                    this.renderFlowchart(this.getSampleData());
                    this.currentSlotIndex = 0;
                    this.saveCurrentFlowchart();
                } else {
                    this._applyingRemote = true;
                    try { this.loadFlowchartFromList(0); } finally { this._applyingRemote = false; }
                }
            }
            this.saveFlowchartList();
        },

        // Brings one shared flowchart up to date with the server, merging in
        // whatever was changed on this device since the last sync.
        async pullShareItem(item, conn) {
            const got = await this.sbRest(conn, `${this.CLOUD_TABLE}?id=eq.${enc(rowIdOf(item.share.id))}&select=updated_at,data`);
            const row = got && got[0];
            if (!row || !row.data || typeof row.data.data !== 'string') return;
            // The list may have been reloaded meanwhile (e.g. the Open list does that).
            item = this.findSharedItem(item.share.id);
            if (!item) return;
            const remoteData = row.data.data;
            const remoteTitle = row.data.title || item.share.title;
            const state = this.loadShareState();
            const st = state[item.share.id] || {};

            const idx = this.flowchartList.indexOf(item);
            const isOpen = idx === this.currentSlotIndex;
            // Don't swap a note out from under someone mid-sentence; the next poll retries.
            if (isOpen && this.notesEditor && this.notesEditor.ui && this.notesEditor.ui.focusTracker.isFocused &&
                Date.now() - (this._lastNotesTypingAt || 0) < 3000) return;
            if (isOpen) this.saveCurrentFlowchart();
            const { stripped: before, imageMap } = this.stripImagesFromDataString(item.data || '');

            let newData;
            if (item.share.role === 'view') {
                newData = this.rehydrateImagesInDataString(remoteData, imageMap);
            } else {
                const baseItem = typeof st.base === 'string' ? { title: remoteTitle, data: st.base } : null;
                const baseParsed = baseItem ? this.parseFlowchartData(baseItem) : null;
                const merged = this.mergeFlowchartItem(baseItem, item, before, { title: remoteTitle, data: remoteData }, imageMap,
                    baseParsed && Array.isArray(baseParsed.notesTabs) ? baseParsed.notesTabs : undefined);
                newData = this.rehydrateImagesInDataString(merged.data, imageMap);
            }
            item.data = newData;
            if (remoteTitle !== item.share.title) {
                item.share.title = remoteTitle;
                item.title = this.uniqueTitle(remoteTitle, item);
            }
            state[item.share.id] = { knownAt: Number(row.updated_at) || 0, base: remoteData, title: remoteTitle };
            this.saveShareState(state);
            this.saveFlowchartList();

            const after = this.stripImagesFromDataString(newData).stripped;
            if (item.share.role !== 'view' && after !== remoteData) this.scheduleSharePush();
            if (isOpen && after !== before) {
                const wasInNotes = this._leftPanelMode === 'notes' && this._notesTabActive;
                const i = this.flowchartList.indexOf(item);
                this._applyingRemote = true;
                try {
                    const hashes = Array.from(this.findImageRefsInDataString(item.data));
                    if (hashes.length) await this.rehydrateFlowchartImages(i);
                    if (!this._imagesTried) this._imagesTried = new WeakSet();
                    this._imagesTried.add(item);
                    this.loadFlowchartFromList(i);
                } finally {
                    this._applyingRemote = false;
                }
                if (wasInNotes) this.openNotesPanel();
                this.showNotification(`"${item.title}" was updated.`);
            }
            this.updateShareBanner();
        },

        async pushShares() {
            if (this._shareBusy) {
                clearTimeout(this._sharePushTimer);
                this._sharePushTimer = setTimeout(() => this.pushShares(), 1500);
                return;
            }
            this._shareBusy = true;
            let again = false;
            try {
                for (const item of this.sharedItems()) {
                    if (item.share.role === 'view') continue;
                    const conn = this.shareConn(item.share.url);
                    if (!conn) continue;
                    try {
                        const state = this.loadShareState();
                        const st = state[item.share.id] || {};
                        const { stripped, imageMap } = this.stripImagesFromDataString(item.data || '');
                        if (stripped === st.base && item.share.title === st.title) continue;
                        const rid = enc(rowIdOf(item.share.id));
                        const head = await this.sbRest(conn, `${this.CLOUD_TABLE}?id=eq.${rid}&select=updated_at`);
                        if (!head || !head[0]) continue; // gone - the next check tidies it up
                        if ((Number(head[0].updated_at) || 0) !== (st.knownAt || 0)) {
                            // Someone saved first: merge theirs in, then try again.
                            await this.pullShareItem(item, conn);
                            again = true;
                            continue;
                        }
                        await this.uploadShareImages(conn, item.share.id, imageMap);
                        const ts = Math.max(Date.now(), (st.knownAt || 0) + 1);
                        const written = await this.sbRest(conn, `${this.CLOUD_TABLE}?id=eq.${rid}&updated_at=eq.${st.knownAt || 0}`, {
                            method: 'PATCH', prefer: 'return=representation',
                            body: { updated_at: ts, data: { title: item.share.title, data: stripped } }
                        });
                        if (!Array.isArray(written) || written.length === 0) { again = true; continue; }
                        const s2 = this.loadShareState();
                        s2[item.share.id] = { knownAt: ts, base: stripped, title: item.share.title };
                        this.saveShareState(s2);
                    } catch (err) {
                        console.error(`Saving shared flowchart "${item.title}" failed:`, err);
                        if (err.status === 401 || err.status === 403) this.showNotification(`Couldn't save "${item.title}" - your access may have changed.`, 5000);
                    }
                }
            } finally {
                this._shareBusy = false;
            }
            if (again) {
                clearTimeout(this._sharePushTimer);
                this._sharePushTimer = setTimeout(() => this.pushShares(), 400);
            }
        },

        // ----- Owner actions -----
        // Who shares: the email sign-in if there is one, otherwise this device
        // signs in anonymously in the connected project (no email needed). The
        // owner's other devices then join with a "Can manage" invite.
        async ownerConnForSharing() {
            if (this._cloudAuth) return this.shareConn(this.cloudProjectUrl);
            const { url, key } = this.getCloudConfig();
            if (!url || !key) throw new Error('Connect the app to your Supabase project first (Cloud Sync > Advanced: Project URL and key).');
            const have = this.shareConn(url);
            if (have) return have;
            const s = await this.sbAuth(url, key, 'signup', { body: { data: {} } });
            if (!s.access_token) throw new Error('Couldn\'t sign this device in.');
            this.saveGuestAuth(url, key, this.toShareAuth(s));
            return this.shareConn(url);
        },

        async startSharing(index) {
            const conn = await this.ownerConnForSharing();
            if (index === this.currentSlotIndex) this.saveCurrentFlowchart();
            const item = this.flowchartList[index];
            if (!item || item.share) return;
            const sid = await this.rpc(conn, 'flowchart_create_share', { p_name: conn.email || localStorage.getItem(GUEST_NAME_KEY) || 'Owner' });
            const { stripped, imageMap } = this.stripImagesFromDataString(item.data || '');
            await this.uploadShareImages(conn, sid, imageMap);
            const ts = Date.now();
            await this.sbRest(conn, this.CLOUD_TABLE, {
                method: 'POST', prefer: 'return=minimal',
                body: [{ id: rowIdOf(sid), updated_at: ts, data: { title: item.title, data: stripped } }]
            });
            item.share = { id: sid, url: conn.url, key: conn.key, role: 'owner', title: item.title };
            const st = this.loadShareState();
            st[sid] = { knownAt: ts, base: stripped, title: item.title };
            this.saveShareState(st);
            this.saveFlowchartList();
            this.touchDevice(conn, true);
            // It now lives in its own row; the next push of the owner's own list
            // leaves it out.
            this.scheduleCloudPush();
            this.updateShareBanner();
        },

        // Back to an ordinary flowchart of the owner's; everyone else loses it.
        async stopSharing(item) {
            const conn = this.shareConn(item.share.url);
            if (!conn) throw new Error('Sign in again first.');
            const id = item.share.id;
            await this.sbRest(conn, `${this.CLOUD_TABLE}?id=like.${enc(rowIdOf(id) + '*')}`, { method: 'DELETE', prefer: 'return=minimal' });
            await this.sbRest(conn, `flowchart_shares?id=eq.${enc(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
            delete item.share;
            const st = this.loadShareState();
            delete st[id];
            this.saveShareState(st);
            this.saveFlowchartList();
            this.scheduleCloudPush();
            this.updateShareBanner();
        },

        async leaveShare(item) {
            const conn = this.shareConn(item.share.url);
            if (conn) {
                await this.sbRest(conn, `flowchart_members?share_id=eq.${enc(item.share.id)}&user_id=eq.${enc(conn.userId)}`, { method: 'DELETE', prefer: 'return=minimal' });
            }
            const st = this.loadShareState();
            delete st[item.share.id];
            this.saveShareState(st);
            this.removeListItem(this.flowchartList.indexOf(item));
            this.updateShareBanner();
        },

        // Called from the Open list's Delete button.
        async deleteSharedFlowchart(index) {
            const item = this.flowchartList[index];
            if (!item || !item.share) return;
            try {
                if (item.share.role === 'owner') {
                    if (!confirm(`"${item.title}" is shared. Delete it for everyone? Everyone you invited loses it, and this can't be undone.`)) return;
                    await this.stopSharing(item);
                    this.removeListItem(this.flowchartList.indexOf(item));
                } else {
                    if (!confirm(`Remove "${item.title}" from this device and leave it? To get it back you'd need a new code from the owner.`)) return;
                    await this.leaveShare(item);
                }
            } catch (err) {
                alert(friendlyError(err));
            }
            if (this.storagePopup && this.storagePopup.style.display !== 'none') this.showStoragePopup();
        },

        renameSharedFlowchart(index, title) {
            const item = this.flowchartList[index];
            if (!item || !item.share) return false;
            if (item.share.role === 'view') {
                alert('This flowchart is view only, so it can\'t be renamed.');
                return true;
            }
            item.share.title = title;
            item.title = this.uniqueTitle(title, item);
            this.saveFlowchartList();
            this.scheduleSharePush();
            return true;
        },

        // ----- Banner over a shared flowchart -----
        updateShareBanner() {
            const banner = document.getElementById('share-banner');
            if (!banner) return;
            const item = this.currentSharedItem();
            if (!item) { banner.style.display = 'none'; return; }
            const r = item.share.role;
            banner.textContent = r === 'owner' ? '👥 Shared - Manage access'
                : r === 'edit' ? '👥 Shared with you - you can edit'
                : '👥 Shared with you - view only (changes here aren\'t saved)';
            banner.className = r === 'view' ? 'sh-view' : '';
            banner.style.display = 'block';
        },

        // ----- The Sharing / Manage access panel -----
        openSharePanel(index) {
            if (index === null || index === undefined || !this.flowchartList[index]) {
                this.showNotification('Open a flowchart first.');
                return;
            }
            if (this.storagePopup) this.storagePopup.style.display = 'none';
            this._sharePanelIndex = index;
            this._lastInvite = null;
            this.renderSharePanel();
            document.getElementById('share-popup').style.display = 'block';
        },

        closeSharePanel() {
            document.getElementById('share-popup').style.display = 'none';
        },

        renderSharePanel() {
            const pop = document.getElementById('share-popup');
            const item = this.flowchartList[this._sharePanelIndex];
            pop.innerHTML = '';
            if (!item) { this.closeSharePanel(); return; }
            const status = el('div', { class: 'cs-status', id: 'share-status' });
            const setStatus = (t, err) => { status.textContent = t || ''; status.style.color = err ? '#ff8a80' : '#4cd9a8'; };
            const closeRow = el('div', { class: 'cs-row', style: 'justify-content:flex-end; margin-top:12px;' },
                el('button', { class: 'cs-btn', type: 'button', text: 'Close', onclick: () => this.closeSharePanel() }));

            if (!item.share) {
                pop.append(el('div', { class: 'cs-title', text: `👥 Share "${item.title}"` }));
                const cfg = this.getCloudConfig();
                if (!this._cloudAuth && !(cfg.url && cfg.key)) {
                    pop.append(
                        el('p', { class: 'cs-text', text: 'Sharing uses your Supabase project: connect it first in Cloud Sync (Advanced: Project URL and key) - no email sign-in needed. The people you invite don\'t need an account or a Supabase of their own - they just enter a code.' }),
                        el('div', { class: 'cs-row' }, el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Open Cloud Sync',
                            onclick: () => { this.closeSharePanel(); this.showCloudSyncPopup(); } })),
                        closeRow);
                    return;
                }
                const btn = el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Start sharing' });
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    setStatus('Setting up sharing...');
                    try {
                        await this.startSharing(this._sharePanelIndex);
                        this.renderSharePanel();
                        this.showNotification('Sharing is on - make an invite for each person.');
                    } catch (err) {
                        console.error('Start sharing failed:', err);
                        setStatus(friendlyError(err), true);
                        btn.disabled = false;
                    }
                });
                pop.append(
                    el('p', { class: 'cs-text', text: 'Invite people to this flowchart with a code. They see and work on this flowchart and its own notes only - never your global notes or your other flowcharts.' }),
                    el('div', { class: 'cs-row' }, btn), status, closeRow);
                return;
            }

            if (item.share.role === 'owner') this.renderOwnerPanel(pop, item, status, setStatus, closeRow);
            else this.renderGuestPanel(pop, item, status, setStatus, closeRow);
        },

        renderOwnerPanel(pop, item, status, setStatus, closeRow) {
            const conn = this.shareConn(item.share.url);
            pop.append(el('div', { class: 'cs-title', text: `👥 Manage access - "${item.title}"` }));
            if (conn && conn.isAnon) {
                pop.append(el('p', { class: 'cs-note', text: 'You\'re sharing from this device without an email. To open and manage it from your other devices too, make an invite set to "Can manage" and enter that code on each one.' }));
            }

            // New invite
            const label = el('input', { class: 'cs-input', type: 'text', placeholder: 'Label, e.g. Sam - work laptop', maxlength: '80' });
            const role = el('select', { class: 'cs-input sh-role' },
                el('option', { value: 'edit', text: 'Can edit' }), el('option', { value: 'view', text: 'View only' }),
                el('option', { value: 'owner', text: 'Can manage (your other devices)' }));
            const newBtn = el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'New invite' });
            const result = el('div', { id: 'share-invite-result' });
            const showInvite = (inv) => {
                result.innerHTML = '';
                if (!inv) return;
                const link = this.inviteLink(item.share, inv.code);
                result.append(el('div', { class: 'sh-invite' },
                    el('div', { class: 'cs-muted cs-small', text: `${inv.label ? inv.label + ' - ' : ''}${roleText(inv.role)}` }),
                    el('div', { class: 'sh-code', text: formatCode(inv.code) }),
                    el('div', { class: 'cs-row' },
                        el('button', { class: 'cs-btn cs-small-btn', type: 'button', text: 'Copy code', onclick: () => this.copyText(formatCode(inv.code)) }),
                        el('button', { class: 'cs-btn cs-small-btn', type: 'button', text: 'Copy link with code', onclick: () => this.copyText(link) })),
                    el('div', { class: 'cs-muted cs-small', text: 'Works once, on one device. Once it\'s used, a copied or forwarded code no longer works - make a new invite for each device.' })));
            };
            newBtn.addEventListener('click', async () => {
                newBtn.disabled = true;
                setStatus('Making an invite...');
                try {
                    const code = await this.rpc(conn, 'flowchart_create_invite', { p_share: item.share.id, p_role: role.value, p_label: label.value.trim() || null });
                    this._lastInvite = { code, role: role.value, label: label.value.trim() };
                    label.value = '';
                    setStatus('');
                    showInvite(this._lastInvite);
                    this.loadAccessList(item, people, invites, setStatus);
                } catch (err) {
                    console.error('New invite failed:', err);
                    setStatus(friendlyError(err), true);
                } finally {
                    newBtn.disabled = false;
                }
            });
            label.addEventListener('keydown', (e) => { if (e.key === 'Enter') newBtn.click(); });

            const people = el('div', { class: 'sh-list' }, el('div', { class: 'cs-muted', text: 'Loading...' }));
            const invites = el('div', { class: 'sh-list' });
            const plainLink = this.inviteLink(item.share, null);

            pop.append(
                el('div', { class: 'sh-section' },
                    el('div', { class: 'cs-label', text: 'Invite someone' }),
                    el('div', { class: 'cs-row' }, label),
                    el('div', { class: 'cs-row' }, role, newBtn),
                    result),
                status,
                el('div', { class: 'sh-section' },
                    el('div', { class: 'cs-label', text: 'People with access' }), people),
                el('div', { class: 'sh-section' },
                    el('div', { class: 'cs-label', text: 'Unused invites' }), invites),
                el('details', { class: 'cs-details' },
                    el('summary', { text: 'Flowchart link (without a code)' }),
                    el('p', { class: 'cs-text cs-small', text: 'Anyone opening this link is asked for a code, so it\'s fine to send by itself - then send each person their code.' }),
                    el('div', { class: 'cs-row' },
                        el('input', { class: 'cs-input', type: 'text', readonly: true, value: plainLink }),
                        el('button', { class: 'cs-btn cs-small-btn', type: 'button', text: 'Copy', onclick: () => this.copyText(plainLink) }))),
                el('div', { class: 'cs-row', style: 'margin-top:10px;' },
                    el('button', { class: 'cs-btn cs-danger', type: 'button', text: 'Stop sharing', onclick: async () => {
                        if (!confirm(`Stop sharing "${item.title}"? Everyone you invited loses it; it stays here as one of your own flowcharts.`)) return;
                        setStatus('Stopping...');
                        try {
                            await this.stopSharing(item);
                            this.renderSharePanel();
                            this.showNotification('Sharing stopped.');
                        } catch (err) {
                            setStatus(friendlyError(err), true);
                        }
                    } })),
                closeRow);
            showInvite(this._lastInvite);
            if (!conn) {
                people.textContent = 'Sign in again (Cloud Sync) to manage access.';
                return;
            }
            this.loadAccessList(item, people, invites, setStatus);
        },

        async loadAccessList(item, people, invites, setStatus) {
            const conn = this.shareConn(item.share.url);
            let data;
            try {
                data = await this.rpc(conn, 'flowchart_share_access', { p_share: item.share.id });
            } catch (err) {
                people.textContent = friendlyError(err);
                return;
            }
            people.innerHTML = '';
            (data.members || []).forEach((m) => {
                const isMe = m.user_id === conn.userId;
                const name = m.name || m.email || m.invite_label || 'Guest';
                const devices = (m.devices || []);
                const head = el('div', { class: 'sh-member-head' },
                    el('div', { class: 'sh-member-name' }, el('b', { text: name }), isMe ? el('span', { class: 'cs-muted', text: ' (you)' }) : null),
                    m.role === 'owner'
                        ? el('span', { class: 'sh-badge', text: 'Owner' })
                        : (() => {
                            const sel = el('select', { class: 'cs-input sh-role', title: 'What they can do' },
                                el('option', { value: 'edit', text: 'Can edit' }), el('option', { value: 'view', text: 'View only' }));
                            sel.value = m.role;
                            sel.addEventListener('change', async () => {
                                try {
                                    await this.sbRest(conn, `flowchart_members?share_id=eq.${enc(item.share.id)}&user_id=eq.${enc(m.user_id)}`, {
                                        method: 'PATCH', prefer: 'return=minimal', body: { role: sel.value } });
                                    setStatus(`${name} can now ${sel.value === 'view' ? 'only view' : 'edit'}.`);
                                } catch (err) {
                                    setStatus(friendlyError(err), true);
                                }
                            });
                            return sel;
                        })(),
                    isMe ? null : el('button', { class: 'cs-btn cs-small-btn cs-danger', type: 'button', text: 'Remove', onclick: async () => {
                        if (!confirm(`Remove ${name}? They lose access on every device they use.`)) return;
                        try {
                            await this.sbRest(conn, `flowchart_members?share_id=eq.${enc(item.share.id)}&user_id=eq.${enc(m.user_id)}`, { method: 'DELETE', prefer: 'return=minimal' });
                            this.loadAccessList(item, people, invites, setStatus);
                        } catch (err) {
                            setStatus(friendlyError(err), true);
                        }
                    } }));
                const facts = [];
                if (m.email && m.email !== name) facts.push(m.email);
                else if (m.role !== 'owner') facts.push('no email added - this device only');
                if (m.invite_label && m.invite_label !== name) facts.push(`invited as "${m.invite_label}"`);
                if (m.role !== 'owner' && m.joined_at) facts.push(`joined ${timeAgo(m.joined_at)}`);
                people.append(el('div', { class: 'sh-member' },
                    head,
                    facts.length ? el('div', { class: 'cs-muted cs-small', text: facts.join(' · ') }) : null,
                    el('ul', { class: 'sh-devices' }, devices.length
                        ? devices.map(d => el('li', { text: `${d.name || 'Device'} - last seen ${timeAgo(d.last_seen)}` }))
                        : [el('li', { class: 'cs-muted', text: 'No devices yet' })])));
            });
            invites.innerHTML = '';
            const list = data.invites || [];
            if (list.length === 0) invites.append(el('div', { class: 'cs-muted cs-small', text: 'None - every invite made so far has been used.' }));
            list.forEach((inv) => {
                invites.append(el('div', { class: 'sh-invite-row' },
                    el('span', { class: 'sh-code-small', text: formatCode(inv.code) }),
                    el('span', { class: 'cs-small', style: 'flex:1; min-width:0;', text: `${inv.label || 'No label'} · ${roleText(inv.role)} · ${timeAgo(inv.created_at)}` }),
                    el('button', { class: 'cs-btn cs-small-btn', type: 'button', text: 'Copy link', onclick: () => this.copyText(this.inviteLink(item.share, inv.code)) }),
                    el('button', { class: 'cs-btn cs-small-btn cs-danger', type: 'button', text: 'Revoke', onclick: async () => {
                        try {
                            await this.sbRest(conn, `flowchart_invites?code=eq.${enc(inv.code)}`, { method: 'DELETE', prefer: 'return=minimal' });
                            if (this._lastInvite && this._lastInvite.code === inv.code) {
                                this._lastInvite = null;
                                const r = document.getElementById('share-invite-result');
                                if (r) r.innerHTML = '';
                            }
                            this.loadAccessList(item, people, invites, setStatus);
                        } catch (err) {
                            setStatus(friendlyError(err), true);
                        }
                    } })));
            });
        },

        renderGuestPanel(pop, item, status, setStatus, closeRow) {
            const conn = this.shareConn(item.share.url);
            pop.append(
                el('div', { class: 'cs-title', text: `👥 "${item.title}"` }),
                el('p', { class: 'cs-text', text: `This flowchart is shared with you. ${item.share.role === 'edit' ? 'You can edit it; everyone with access sees your changes.' : 'You can view it; changes you make here aren\'t saved.'}` }));

            const emailSection = el('div', { class: 'sh-section' });
            if (conn && conn.kind === 'guest' && conn.isAnon) {
                const email = el('input', { class: 'cs-input', type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'you@example.com' });
                const send = el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Send code' });
                const code = el('input', { class: 'cs-input', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: 'Code from the email' });
                const verify = el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Confirm' });
                const step2 = el('div', { style: 'display:none;' }, el('div', { class: 'cs-row' }, code, verify));
                const pending = this.loadJSONFromStorage(EMAIL_PENDING_KEY, null);
                if (pending && pending.url === conn.url && Date.now() - pending.at < 86400000) {
                    email.value = pending.email;
                    step2.style.display = 'block';
                }
                send.addEventListener('click', async () => {
                    const addr = email.value.trim().toLowerCase();
                    if (!addr.includes('@')) { setStatus('Enter your email address first.', true); return; }
                    setStatus('Sending...');
                    try {
                        const token = await conn.token();
                        await this.sbAuth(conn.url, conn.key, 'user', { method: 'PUT', token, body: { email: addr } });
                        localStorage.setItem(EMAIL_PENDING_KEY, JSON.stringify({ url: conn.url, email: addr, at: Date.now() }));
                        step2.style.display = 'block';
                        code.focus();
                        setStatus('Email sent - type the code from it here (or tap its link on this device).');
                    } catch (err) {
                        setStatus(friendlyError(err), true);
                    }
                });
                verify.addEventListener('click', async () => {
                    const addr = email.value.trim().toLowerCase();
                    const token = code.value.replace(/\s+/g, '');
                    if (!addr || !token) { setStatus('Enter the code from the email.', true); return; }
                    setStatus('Checking...');
                    try {
                        let s;
                        try {
                            s = await this.sbAuth(conn.url, conn.key, 'verify', { body: { type: 'email_change', email: addr, token } });
                        } catch (err) {
                            s = await this.sbAuth(conn.url, conn.key, 'verify', { body: { type: 'email', email: addr, token } });
                        }
                        this.saveGuestAuth(conn.url, conn.key, this.toShareAuth(s));
                        localStorage.removeItem(EMAIL_PENDING_KEY);
                        this.renderSharePanel();
                        this.showNotification('Email added - sign in with it on your other devices.');
                    } catch (err) {
                        setStatus(friendlyError(err), true);
                    }
                });
                emailSection.append(
                    el('div', { class: 'cs-label', text: 'Use it on your other devices too' }),
                    el('p', { class: 'cs-text cs-small', text: 'Right now only this device has access. Add your email, and on another device open the flowchart link, choose "I\'ve joined before" and sign in with it - no new code needed.' }),
                    el('div', { class: 'cs-row' }, email, send), step2);
            } else if (conn) {
                emailSection.append(el('p', { class: 'cs-text cs-small', text: conn.email
                    ? `Signed in as ${conn.email}. On another device, open the flowchart link and choose "I've joined before" to sign in with this email.`
                    : 'Signed in.' }));
            } else {
                emailSection.append(el('p', { class: 'cs-text cs-small', text: 'This device is signed out of the shared flowchart. Open the invite link again to sign back in.' }));
            }
            pop.append(emailSection, status,
                el('div', { class: 'cs-row', style: 'margin-top:10px;' },
                    el('button', { class: 'cs-btn cs-danger', type: 'button', text: 'Leave this flowchart', onclick: () => this.deleteSharedFlowchart(this.flowchartList.indexOf(item)).then(() => {
                        if (!this.flowchartList.includes(item)) this.closeSharePanel();
                    }) })),
                closeRow);
        },

        // ----- Joining -----
        parseJoinHash() {
            const m = location.hash.match(/(?:^#|&)join=([A-Za-z0-9_-]+)/);
            if (!m) return null;
            try {
                const p = JSON.parse(b64urlDecode(m[1]));
                if (!p || !p.u || !p.k || !p.s) return null;
                return { url: normUrl(p.u), key: String(p.k), shareId: String(p.s), title: p.t ? String(p.t) : '', code: p.c ? String(p.c) : '' };
            } catch (err) {
                return null;
            }
        },

        handleJoinLink() {
            const j = this.parseJoinHash();
            if (!j) return;
            history.replaceState(null, '', location.pathname + location.search);
            const have = this.findSharedItem(j.shareId);
            if (have) {
                this.openSharedItem(have);
                this.showNotification(`You already have "${have.title}".`);
                return;
            }
            this.showJoinPopup(j);
        },

        openSharedItem(item) {
            const i = this.flowchartList.indexOf(item);
            if (i === -1) return;
            this.loadFlowchartFromList(i);
            this.updateShareBanner();
        },

        showJoinPopup(j) {
            const pop = document.getElementById('share-join-popup');
            pop.innerHTML = '';
            const status = el('div', { class: 'cs-status' });
            const setStatus = (t, err) => { status.textContent = t || ''; status.style.color = err ? '#ff8a80' : '#4cd9a8'; };
            const code = el('input', { class: 'cs-input sh-code-input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'K7QM-29XD', maxlength: '12' });
            code.value = formatCode(j.code);
            code.addEventListener('input', () => {
                const pos = code.value.length;
                code.value = formatCode(code.value);
                if (pos >= code.value.length) code.setSelectionRange(code.value.length, code.value.length);
            });
            const name = el('input', { class: 'cs-input', type: 'text', autocomplete: 'name', placeholder: 'Your name', maxlength: '80' });
            name.value = localStorage.getItem(GUEST_NAME_KEY) || '';
            const join = el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Join' });
            const close = () => { pop.style.display = 'none'; };
            join.addEventListener('click', async () => {
                const c = code.value.replace(/[^A-Za-z0-9]/g, '');
                if (c.length < 8) { setStatus('Enter the 8-character code you were sent.', true); return; }
                if (!name.value.trim()) { setStatus('Enter your name, so the owner knows who you are.', true); name.focus(); return; }
                join.disabled = true;
                setStatus('Joining...');
                try {
                    await this.joinWithCode(j, c, name.value.trim());
                    localStorage.setItem(GUEST_NAME_KEY, name.value.trim());
                    close();
                } catch (err) {
                    console.error('Joining failed:', err);
                    setStatus(friendlyError(err), true);
                    join.disabled = false;
                }
            });
            [code, name].forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') join.click(); }));

            // Joined before, on another device, and added an email then.
            const email = el('input', { class: 'cs-input', type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'The email you added' });
            const send = el('button', { class: 'cs-btn', type: 'button', text: 'Send code' });
            const otp = el('input', { class: 'cs-input', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: 'Code from the email' });
            const verify = el('button', { class: 'cs-btn cs-primary', type: 'button', text: 'Sign in' });
            const otpRow = el('div', { class: 'cs-row', style: 'display:none;' }, otp, verify);
            send.addEventListener('click', async () => {
                const addr = email.value.trim().toLowerCase();
                if (!addr.includes('@')) { setStatus('Enter your email address first.', true); return; }
                setStatus('Sending...');
                try {
                    await this.sbAuth(j.url, j.key, 'otp', { body: { email: addr, create_user: false } });
                    otpRow.style.display = 'flex';
                    otp.focus();
                    setStatus('Email sent - type the code from it here.');
                } catch (err) {
                    setStatus(/signups not allowed|not found|user/i.test(err.message) ? 'No one has added that email to a shared flowchart yet.' : friendlyError(err), true);
                }
            });
            verify.addEventListener('click', async () => {
                const addr = email.value.trim().toLowerCase();
                const token = otp.value.replace(/\s+/g, '');
                if (!addr || !token) { setStatus('Enter the code from the email.', true); return; }
                setStatus('Signing in...');
                try {
                    const s = await this.sbAuth(j.url, j.key, 'verify', { body: { type: 'email', email: addr, token } });
                    await this.signInAsGuest(j, s);
                    close();
                } catch (err) {
                    setStatus(friendlyError(err), true);
                }
            });

            pop.append(
                el('div', { class: 'cs-title', text: '👥 Join a shared flowchart' }),
                el('p', { class: 'cs-text', text: j.title ? `You've been invited to "${j.title}". Enter the code you were sent.` : 'Enter the code you were sent.' }),
                el('label', { class: 'cs-label', text: 'Code' }), el('div', { class: 'cs-row' }, code),
                el('label', { class: 'cs-label', text: 'Your name' }), el('div', { class: 'cs-row' }, name),
                el('div', { class: 'cs-row' }, join),
                status,
                el('p', { class: 'cs-muted cs-small', text: 'No account needed. Each code works once, on one device.' }),
                el('details', { class: 'cs-details' },
                    el('summary', { text: 'I\'ve joined before on another device' }),
                    el('p', { class: 'cs-text cs-small', text: 'If you added your email there, sign in with it here - no new code needed.' }),
                    el('div', { class: 'cs-row' }, email, send), otpRow),
                el('div', { class: 'cs-row', style: 'justify-content:flex-end; margin-top:12px;' },
                    el('button', { class: 'cs-btn', type: 'button', text: 'Cancel', onclick: close })));
            pop.style.display = 'block';
            setTimeout(() => (code.value ? name : code).focus(), 50);
        },

        async joinWithCode(j, code, name) {
            let conn = this.shareConn(j.url);
            if (!conn) {
                // No account here: an anonymous guest sign-in in the owner's project.
                const s = await this.sbAuth(j.url, j.key, 'signup', { body: { data: {} } });
                if (!s.access_token) throw new Error('Couldn\'t sign in as a guest.');
                this.saveGuestAuth(j.url, j.key, this.toShareAuth(s));
                conn = this.shareConn(j.url);
            }
            const r = await this.rpc(conn, 'flowchart_claim_invite', {
                p_code: code, p_name: name, p_device_id: this.deviceId(), p_device_name: this.deviceName()
            });
            const seen = this.loadJSONFromStorage(DEVICE_SEEN_KEY, {}) || {};
            seen[`${conn.url}|${conn.userId}`] = Date.now();
            localStorage.setItem(DEVICE_SEEN_KEY, JSON.stringify(seen));
            await this.afterJoin(conn, (r && r.share_id) || j.shareId);
        },

        async signInAsGuest(j, session) {
            this.saveGuestAuth(j.url, j.key, this.toShareAuth(session));
            const conn = this.shareConn(j.url);
            await this.touchDevice(conn, true);
            await this.afterJoin(conn, j.shareId, true);
        },

        async afterJoin(conn, shareId, viaEmail) {
            this._joiningShareId = shareId;
            try {
                // Wait for any sync already running, then look again.
                for (let i = 0; i < 40 && this._shareBusy; i++) await new Promise(r => setTimeout(r, 150));
                this._shareBusy = true;
                try { await this.discoverShares(conn); } finally { this._shareBusy = false; }
            } finally {
                this._joiningShareId = null;
            }
            const item = this.findSharedItem(shareId);
            if (item) {
                this.openSharedItem(item);
                this.showNotification(`You've joined "${item.title}".`, 4000);
            } else if (viaEmail) {
                const n = this.sharedItems().filter(i => normUrl(i.share.url) === conn.url).length;
                this.showNotification(n ? 'Signed in - your shared flowcharts are in 📂 Open. You don\'t have access to this one yet: ask for a code.'
                    : 'Signed in, but this email doesn\'t have access to that flowchart. Ask the owner for a code.', 6000);
            }
        },

        // The link in the "confirm your email" mail (a guest adding their email)
        // lands back here with a sign-in in the address bar. Returns true if it was
        // that, so the main Cloud Sync sign-in leaves it alone.
        async takeGuestAuthRedirect(params) {
            const pending = this.loadJSONFromStorage(EMAIL_PENDING_KEY, null);
            if (!pending || !pending.url || Date.now() - pending.at > 86400000) return false;
            const g = this.loadGuestAuths()[pending.url];
            if (!g) return false;
            const access = params.get('access_token');
            const refresh = params.get('refresh_token');
            if (!access || !refresh) return false;
            try {
                const user = await this.sbAuth(pending.url, g.key, 'user', { token: access });
                if (!user || user.id !== g.auth.user.id) return false;
                this.saveGuestAuth(pending.url, g.key, this.toShareAuth({
                    access_token: access, refresh_token: refresh,
                    expires_at: Number(params.get('expires_at')) || 0,
                    expires_in: Number(params.get('expires_in')) || 3600, user
                }));
                localStorage.removeItem(EMAIL_PENDING_KEY);
                this.showNotification('Email added - sign in with it on your other devices.', 5000);
                return true;
            } catch (err) {
                return false;
            }
        }
    };

    Object.assign(FlowchartViewer.prototype, methods);

    // Every flowchart switch updates the banner (and leaves global notes if this
    // one hides them).
    const origLoad = FlowchartViewer.prototype.loadFlowchartFromList;
    FlowchartViewer.prototype.loadFlowchartFromList = function (...args) {
        const r = origLoad.apply(this, args);
        this.refreshGlobalNotesVisibility();
        if (typeof this.updateShareBanner === 'function' && document.getElementById('share-banner')) this.updateShareBanner();
        return r;
    };
})();
