class FlowchartViewer {
    constructor() {
        // Shared with computeIndentedContour/updateStickyAncestors/renderFlowchart so
        // there's one source of truth for the node box's width in local (pre-zoom)
        // units, rather than three separately hardcoded copies of the same number.
        this.NODE_WIDTH = 120;
        this.flowchartContainer = document.getElementById('flowchart');
        this.flowchartPanel = document.getElementById('flowchart-panel');
        // Top-right controls: previously zoom in/out/reset, now undo/redo/open.
        // Zooming itself is still available via scroll-wheel / pinch (see setupZoom).
        this.topUndoBtn = document.getElementById('top-undo-btn');
        this.topRedoBtn = document.getElementById('top-redo-btn');
        this.topOpenBtn = document.getElementById('top-open-btn');
        this.topTogglePlaceholdersBtn = document.getElementById('top-toggle-placeholders-btn');
        this.reflectionPanel = document.getElementById('reflection-panel');
        this.reflectionPanelBody = document.getElementById('reflection-panel-body');
        this.reflectionPanelClose = document.getElementById('reflection-panel-close');
        this.reflectionPanelBackBtn = document.getElementById('reflection-panel-back-btn');
        this.reflectionPanelResizeHandle = document.getElementById('reflection-panel-resize-handle');
        this.leftPanelTabQuestions = document.getElementById('left-panel-tab-questions');
        this.leftPanelTabPugh = document.getElementById('left-panel-tab-pugh');
        this.leftPanelTabsContainer = document.getElementById('left-panel-tabs');
        this.notesUnfoldBtn = document.getElementById('notes-unfold-btn');
        this.leftPanelZoomOutBtn = document.getElementById('left-panel-zoom-out');
        this.leftPanelZoomInBtn = document.getElementById('left-panel-zoom-in');
        this.leftPanelZoomLevel = document.getElementById('left-panel-zoom-level');
        this.leftPanelZoomControls = document.getElementById('left-panel-zoom-controls');
        this.leftPanelMain = document.getElementById('left-panel-main');
        this.pughPanelBody = document.getElementById('pugh-panel-body');
        this.notesPanelBody = document.getElementById('notes-panel-body');
        this.notesResizeHandle = document.getElementById('notes-resize-handle');
        this.pughMatrixBtn = document.getElementById('pugh-matrix-btn');
        this.topPughMatrixBtn = document.getElementById('top-pugh-matrix-btn');
        this.notesBtn = document.getElementById('notes-btn');
        this.topNotesBtn = document.getElementById('top-notes-btn');
        this.resetViewBtn = document.getElementById('reset-view');
        this.orientationBtn = document.getElementById('orientation-btn');
        this.hamburgerOrientationBtn = document.getElementById('hamburger-orientation');

        // Layout arrangement (centered vs indented-list). This is a display preference,
        // not part of any individual chart's data, so it lives in localStorage and stays
        // the same across every chart and across browser sessions.
        this.arrangementBtn = document.getElementById('arrangement-btn');
        this.hamburgerArrangementBtn = document.getElementById('hamburger-arrangement');
        this.arrangement = localStorage.getItem('flowchart-arrangement') === 'indented' ? 'indented' : 'centered';
        this.undoBtn = document.getElementById('undo-btn');
        this.redoBtn = document.getElementById('redo-btn');
        this.exportBtn = document.getElementById('export-btn');
        this.importBtn = document.getElementById('import-btn');
        this.exportPopup = document.getElementById('export-popup');
        this.exportTextarea = document.getElementById('export-textarea');
        this.closeExportBtn = document.getElementById('close-export-btn');
        this.importPopup = document.getElementById('import-popup');
        this.importTextarea = document.getElementById('import-textarea');
        this.importConfirmBtn = document.getElementById('import-confirm-btn');
        this.closeImportBtn = document.getElementById('close-import-btn');
        this.openBtn = document.getElementById('open-btn');
        this.storagePopup = document.getElementById('storage-popup');
        this.storageSlots = document.getElementById('storage-slots');
        this.closeStorageBtn = document.getElementById('close-storage-btn');
        this.newFlowchartBtn = document.getElementById('new-flowchart-btn');

        // Show/hide non-root placeholder ("add new") nodes
        this.showPlaceholders = true;
        this.togglePlaceholdersBtn = document.getElementById('toggle-placeholders-btn');
        this.hamburgerTogglePlaceholdersBtn = document.getElementById('hamburger-toggle-placeholders');

        // AI Export/Import
        this.aiExportBtn = document.getElementById('ai-export-btn');
        this.aiImportBtn = document.getElementById('ai-import-btn');

        // Cloud Sync (Supabase) - free Postgres-backed key/value storage via the
        // auto-generated REST API, no login flow for the app itself (just a project
        // URL + anon key pasted once). The whole flowchart list is stored as one
        // row; last-write-wins by timestamp.
        this.cloudSyncBtn = document.getElementById('cloud-sync-btn');
        this.topCloudSyncBtn = document.getElementById('top-cloud-sync-btn');
        this.cloudSyncPopup = document.getElementById('cloud-sync-popup');
        this.cloudSyncUrlInput = document.getElementById('cloud-sync-url-input');
        this.cloudSyncKeyInput = document.getElementById('cloud-sync-key-input');
        this.cloudSyncBinInput = document.getElementById('cloud-sync-bin-input');
        this.cloudSyncCreateBinBtn = document.getElementById('cloud-sync-create-bin-btn');
        this.cloudSyncSaveBtn = document.getElementById('cloud-sync-save-btn');
        this.cloudSyncDisconnectBtn = document.getElementById('cloud-sync-disconnect-btn');
        this.closeCloudSyncBtn = document.getElementById('close-cloud-sync-btn');
        this.cloudSyncPopupStatus = document.getElementById('cloud-sync-popup-status');
        this.cloudSyncStatusBadge = document.getElementById('cloud-sync-status');
        this.cloudProjectUrl = (localStorage.getItem('cloud-sync-project-url') || '').replace(/\/+$/, '');
        this.cloudApiKey = localStorage.getItem('cloud-sync-api-key') || '';
        this.cloudSyncId = localStorage.getItem('cloud-sync-id') || '';
        this._cloudPushTimer = null;
        this._cloudPollTimer = null;
        this._cloudSyncInFlight = false;
        this._applyingRemote = false;
        this.setupCloudSync();

        this.selectedConnection = null;
        this.connectionMoveStep = 10;
        this.connectionControlsRow = document.getElementById('connection-controls-row');
        this.connectionControls = document.getElementById('connection-controls');
        this.moveLeftBtn = document.getElementById('move-connection-left');
        this.moveRightBtn = document.getElementById('move-connection-right');
        this.deleteConnectionBtn = document.getElementById('delete-connection-btn');
        this.nodeControlsRow = document.getElementById('node-controls-row');
        this.deleteNodeBtn = document.getElementById('delete-node-btn');

        // Zoom/pan variables
        this.transform = d3.zoomIdentity;

        // Tracks whether a pan/zoom gesture on the chart is currently in progress.
        // Capture-phase so it fires before the browser's native "blur the focused input"
        // default action for a mousedown/touchstart elsewhere on the page - this lets
        // the node-edit textarea's blur handler reliably tell whether it's being blurred
        // because of a pan gesture (and should defer its render) versus some other
        // reason (and can render immediately).
        this._gestureActive = false;
        const markGestureActive = (e) => {
            if (this.flowchartContainer && this.flowchartContainer.contains(e.target)) {
                this._gestureActive = true;
            }
        };
        const markGestureInactive = () => {
            this._gestureActive = false;
            if (this._deferredRenderPending) {
                this._deferredRenderPending = false;
                try {
                    this.renderFlowchart(this.rootData);
                } catch (err) {
                    console.error('Error flushing deferred render:', err);
                }
            }
        };
        document.addEventListener('mousedown', markGestureActive, true);
        document.addEventListener('touchstart', markGestureActive, true);
        document.addEventListener('mouseup', markGestureInactive, true);
        document.addEventListener('touchend', markGestureInactive, true);
        document.addEventListener('touchcancel', markGestureInactive, true);

        // Reflection panel: guided questions shown for Assumption (pink, #e75480) and
        // Simplify (green, #00a67e) nodes. Answers are stored per-node in
        // node.data._reflectionAnswers and persisted like any other node field.
        this.ASSUMPTION_QUESTIONS = [
            'What problem am I actually trying to solve?',
            'If this assumption was true is it really a problem needing to be solved? What would be the worst case scenario if I kept it?',
            'What evidence do I have that this is true? Is it evidence or interpretation?',
            'What is externally attached to this component or affecting this component? Can I alter that to solve the assumption?',
            'What constraints have I imposed with this assumption?',
            'What alternatives might I be overlooking?'
        ];
        this.SIMPLIFY_QUESTIONS = [
            'Is there anything I can remove to make this simpler?',
            'What alternatives could be simpler than this design?'
        ];
        this._reflectionNodeData = null;
        this._reflectionQuestions = null;
        this._reflectionPanelActive = false;
        this._reflectionPanelWidth = parseInt(localStorage.getItem('reflection-panel-width'), 10) || 340;
        this.setupReflectionPanel();

        // Pugh Matrix: lives in the same left-hand panel as the reflection questions,
        // switchable via the Questions/Pugh Matrix tabs. Data is per-flowchart (saved
        // and loaded alongside the tree) so each chart can carry its own matrix.
        this._leftPanelMode = 'questions'; // 'questions' | 'pugh'
        this._pughPanelActive = false;
        this._pughIdCounter = 0;
        this.pughMatrix = this.getDefaultPughMatrix();
        // Ranking mode: a pairwise "beat the baseline" tournament for ordering the
        // solutions (columns) under whichever single criteria is currently active -
        // see startOrResumeRankSession/handlePughReRank for the algorithm.
        this._pughRankMode = false;
        this._pughActiveCriteriaId = null;

        // Notes: a single free-form text field, global to the whole flowchart (not
        // tied to any node). Lives in a persistent strip at the bottom of the same
        // left-hand panel, visible under both the Questions and Pugh Matrix tabs. Its
        // height is user-resizable (drag the handle above it) and remembered across
        // sessions, same as the panel's own width.
        this.globalNotes = '';
        // Drawings inserted into the notes, keyed by the [[drawing:ID]] marker in
        // globalNotes that references them - see renderNotesDrawingsStrip.
        this.notesDrawings = {};
        // Pasted images/photo links, keyed by the [[image:ID]] marker in globalNotes.
        // Each entry is either { dataUrl } for an actually-pasted image, or { url }
        // for a pasted link to one - links are stored as just the URL string (no
        // bytes at all), which also keeps them out of the cloud-sync payload size,
        // unlike embedded image data.
        this.notesImages = {};
        this._notesPanelHeight = parseInt(localStorage.getItem('notes-panel-height'), 10) || 200;

        this.setupPughPanel();
        this.setupLeftPanelZoom();
        this.updateLeftPanelTabs();
        this.renderNotesPanel();
        this.setupNotesResizeHandle();
        this.setupDrawingOverlay();

        this.orientation = 'TB';
        this.lrNodeSpacing = 150;
        this.tbNodeSpacing = 150;
        this.tbHorizontalSpacing = 150;
        this.tbVerticalSpacing = 160;
        this.minZoom = 0.1;
        this.maxZoom = 5;
        this.zoomStep = 0.2;
        this.currentZoom = null;

        // Context menu
        this.contextMenu = null;

        // Moving node state
        this.isMovingNode = false;
        this.movingNodeDatum = null;
        this.movingNodeAncestors = null;

        // Ctrl+drag reparent state
        this.ctrlDragState = null;
        this.skipNextNodeClick = false;

        // Making connection state
        this.isMakingConnection = false;
        this.connectionSourceNode = null;

        // Custom connections storage
        this.customConnections = [];

        // Undo/redo stacks
        this.undoStack = [];
        this.redoStack = [];

        // Node edit popup elements
        this.nodeEditPopup = document.getElementById('node-edit-popup');
        this.nodeEditInput = document.getElementById('node-edit-input');
        this.nodeEditForm = document.getElementById('node-edit-form');
        this.nodeBeingEdited = null;
        // Set the instant a brand-new node's data is created (before it's even in a
        // rendered hierarchy yet), so childrenAccessor can keep it visible despite
        // "hide placeholders" being on - nodeBeingEdited itself isn't set until
        // showNodeEditPopup runs afterwards, which is too late for that first render.
        this._pendingEditData = null;

        // Current active flowchart index
        this.currentSlotIndex = null;
        this.flowchartList = [];
        this.loadFlowchartList();

        // Set up event listeners
        if (this.topUndoBtn) this.topUndoBtn.addEventListener('click', () => this.undo());
        if (this.topRedoBtn) this.topRedoBtn.addEventListener('click', () => this.redo());
        if (this.topOpenBtn) this.topOpenBtn.addEventListener('click', () => this.showStoragePopup());
        if (this.topTogglePlaceholdersBtn) this.topTogglePlaceholdersBtn.addEventListener('click', () => this.togglePlaceholders());
        this.resetViewBtn.addEventListener('click', () => this.resetView());
        this.orientationBtn.addEventListener('click', () => this.toggleOrientation());
        this.hamburgerOrientationBtn.addEventListener('click', () => this.toggleOrientation());
        if (this.arrangementBtn) {
            this.arrangementBtn.addEventListener('click', () => this.toggleArrangement());
        }
        if (this.hamburgerArrangementBtn) {
            this.hamburgerArrangementBtn.addEventListener('click', () => this.toggleArrangement());
        }
        this.undoBtn.addEventListener('click', () => this.undo());
        this.redoBtn.addEventListener('click', () => this.redo());
        this.exportBtn.addEventListener('click', () => this.showExportPopup());
        this.closeExportBtn.addEventListener('click', () => this.exportPopup.style.display = 'none');
        this.importBtn.addEventListener('click', () => this.showImportPopup());
        this.closeImportBtn.addEventListener('click', () => this.importPopup.style.display = 'none');
        this.importConfirmBtn.addEventListener('click', () => this.importFromText());
        this.openBtn.addEventListener('click', () => this.showStoragePopup());
        this.closeStorageBtn.addEventListener('click', () => this.storagePopup.style.display = 'none');
        this.newFlowchartBtn.addEventListener('click', () => this.createNewFlowchart());
        if (this.togglePlaceholdersBtn) {
            this.togglePlaceholdersBtn.addEventListener('click', () => this.togglePlaceholders());
        }
        if (this.hamburgerTogglePlaceholdersBtn) {
            this.hamburgerTogglePlaceholdersBtn.addEventListener('click', () => this.togglePlaceholders());
        }

        // Cloud Sync event listeners
        if (this.cloudSyncBtn) this.cloudSyncBtn.addEventListener('click', () => this.showCloudSyncPopup());
        if (this.topCloudSyncBtn) this.topCloudSyncBtn.addEventListener('click', () => this.showCloudSyncPopup());
        if (this.closeCloudSyncBtn) this.closeCloudSyncBtn.addEventListener('click', () => this.cloudSyncPopup.style.display = 'none');
        if (this.cloudSyncSaveBtn) this.cloudSyncSaveBtn.addEventListener('click', () => this.saveCloudSyncSettings());
        if (this.cloudSyncCreateBinBtn) this.cloudSyncCreateBinBtn.addEventListener('click', () => this.createCloudBin());
        if (this.cloudSyncDisconnectBtn) this.cloudSyncDisconnectBtn.addEventListener('click', () => this.disconnectCloudSync());

        // Help popup
        this.helpBtn = document.getElementById('help-btn');
        this.topHelpBtn = document.getElementById('top-help-btn');
        this.helpPopup = document.getElementById('help-popup');
        this.closeHelpBtn = document.getElementById('close-help-btn');
        const showHelp = () => { if (this.helpPopup) this.helpPopup.style.display = 'flex'; };
        const hideHelp = () => { if (this.helpPopup) this.helpPopup.style.display = 'none'; };
        if (this.helpBtn) this.helpBtn.addEventListener('click', showHelp);
        if (this.topHelpBtn) this.topHelpBtn.addEventListener('click', showHelp);
        if (this.closeHelpBtn) this.closeHelpBtn.addEventListener('click', hideHelp);
        if (this.helpPopup) {
            this.helpPopup.addEventListener('click', (e) => {
                if (e.target === this.helpPopup) hideHelp();
            });
        }

        // Pugh Matrix event listeners
        if (this.pughMatrixBtn) this.pughMatrixBtn.addEventListener('click', () => this.openPughPanel());
        if (this.topPughMatrixBtn) this.topPughMatrixBtn.addEventListener('click', () => this.openPughPanel());

        // Notes event listeners
        if (this.notesBtn) this.notesBtn.addEventListener('click', () => this.openNotesPanel());
        if (this.topNotesBtn) this.topNotesBtn.addEventListener('click', () => this.openNotesPanel());

        // AI Export/Import event listeners
        this.aiExportBtn.addEventListener('click', () => this.exportToAi());
        this.aiImportBtn.addEventListener('click', () => this.importFromAi());

        // Node edit popup handlers
        this.nodeEditForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Do nothing on enter, let blur or background click handle save
        });

        // Save on every keystroke in the node name input
        this.nodeEditInput.addEventListener('input', () => {
            if (this.nodeBeingEdited) {
                this._pendingNodeSave = true;
            }
            this.resizeNodeEditInput();
        });

        // Save on blur (clicking away from the input). If a pan/zoom gesture is
        // currently in progress, defer the render just like the zoom behavior's own
        // 'start' handler does - a full render mid-gesture breaks the gesture's pointer
        // tracking. Whichever of the two (this blur handler or the zoom 'start' handler)
        // fires first does the save; nodeBeingEdited is null by the time the other runs,
        // so there's no double-save.
        this.nodeEditInput.addEventListener('blur', () => {
            if (this._pendingNodeSave && this.nodeBeingEdited) {
                this._pendingNodeSave = false;
                try {
                    this.saveNodeEdit(this._gestureActive);
                } catch (err) {
                    console.error('Error saving node edit on blur:', err);
                }
            }
        });

        // The edit field is a wrapping textarea now (so long names wrap at the popup's
        // width instead of overflowing); Enter still commits/blurs rather than adding a
        // newline, matching how the old single-line input behaved.
        this.nodeEditInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.nodeEditInput.blur();
            }
        });

        // On first ever load seed with sample data; otherwise restore the last opened flowchart
        if (this.flowchartList.length > 0) {
            const initialIndex = this.getPreferredFlowchartIndex();
            this.loadFlowchartFromList(initialIndex);
        } else {
            this.renderFlowchart(this.getSampleData(), { fitView: true });
            this.currentSlotIndex = 0;
            this.saveCurrentFlowchart();
        }

        this.updateOrientationButtonLabels();
        this.updateTogglePlaceholdersLabels();
        this.updateArrangementButtonLabels();
        this.applyMobileViewState();

        // Re-render on real window resizes and orientation changes so the SVG's
        // viewBox/width/height actually track the container's new size - otherwise the
        // chart stays pinned to whatever size it was first drawn at, leaving a stale
        // border/gap once the window or device orientation actually changes.
        let resizeRenderTimer = null;
        let lastRenderWidth = window.innerWidth;
        const rerenderForResize = () => {
            if (this.rootData) {
                this.renderFlowchart(this.rootData);
            }
            if (this.nodeBeingEdited) {
                this.positionNodeEditPopupForMobile();
            }
        };
        window.addEventListener('resize', () => {
            // Ignore height-only changes (e.g. the on-screen keyboard opening/closing);
            // only width changes indicate an actual window resize or orientation change.
            const widthChanged = window.innerWidth !== lastRenderWidth;
            if (!widthChanged && window.visualViewport) return;
            lastRenderWidth = window.innerWidth;
            clearTimeout(resizeRenderTimer);
            resizeRenderTimer = setTimeout(rerenderForResize, 150);
        });
        window.addEventListener('orientationchange', () => {
            lastRenderWidth = window.innerWidth;
            clearTimeout(resizeRenderTimer);
            resizeRenderTimer = setTimeout(rerenderForResize, 250);
        });

        // Keyboard shortcuts for undo/redo and delete
        document.addEventListener('keydown', (e) => {
            // Handle Delete key always (even when an input is focused) to remove selected node
            if (e.key === 'Delete' || e.key === 'Del') {
                if (this.selectedNode) {
                    e.preventDefault();
                    this.deleteNode(this.selectedNode);
                    this.deselectNode();
                }
                return;
            }

            // Escape closes the node edit popup (even while the text input is focused).
            if (e.key === 'Escape' || e.key === 'Esc') {
                if (this.nodeBeingEdited) {
                    e.preventDefault();
                    this.hideNodeEditPopup(true);
                }
                return;
            }

            // Ignore other shortcuts if focus is in an input or textarea
            const tag = document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            if (e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                this.undo();
            } else if (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                this.redo();
            }
        });

        // Add event listeners for connection move buttons
        this.moveLeftBtn.addEventListener('click', () => this.moveSelectedConnection(-this.connectionMoveStep));
        this.moveRightBtn.addEventListener('click', () => this.moveSelectedConnection(this.connectionMoveStep));
        this.deleteConnectionBtn.addEventListener('click', () => this.deleteSelectedConnection());
    }

    // Load flowchart list from localStorage
    loadFlowchartList() {
        const saved = localStorage.getItem('flowchart-list');
        if (saved) {
            try {
                this.flowchartList = JSON.parse(saved);
                // Ensure each entry has a title and data
                this.flowchartList = this.flowchartList.filter(item => item && item.data);
            } catch (e) {
                this.flowchartList = [];
            }
        } else {
            this.flowchartList = [];
        }
    }

    // Save flowchart list to localStorage
    saveFlowchartList() {
        localStorage.setItem('flowchart-list', JSON.stringify(this.flowchartList));
    }

    getPreferredFlowchartIndex() {
        if (!Array.isArray(this.flowchartList) || this.flowchartList.length === 0) {
            return 0;
        }

        const savedIndex = Number(localStorage.getItem('flowchart-last-index'));
        if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < this.flowchartList.length) {
            return savedIndex;
        }

        return 0;
    }

    saveActiveFlowchartIndex() {
        if (this.currentSlotIndex !== null && this.currentSlotIndex >= 0) {
            localStorage.setItem('flowchart-last-index', String(this.currentSlotIndex));
        }
    }

    // Save current flowchart to the list
    saveCurrentFlowchart() {
        // Recover from null index if we have a list
        if (this.currentSlotIndex === null) {
            if (this.flowchartList.length > 0) {
                this.currentSlotIndex = this.flowchartList.length - 1;
            } else {
                return;
            }
        }
        const data = this.exportAsJSON();
        if (this.currentSlotIndex < this.flowchartList.length) {
            this.flowchartList[this.currentSlotIndex].data = data;
        } else {
            // If index is out of bounds, add a new entry
            this.flowchartList.push({
                title: `Flowchart ${this.flowchartList.length + 1}`,
                data: data
            });
            this.currentSlotIndex = this.flowchartList.length - 1;
        }
        this.saveFlowchartList();
        this.saveActiveFlowchartIndex();
    }

    // Autosave wrapper - call after any edit
    autosave() {
        this.saveCurrentFlowchart();
        if (!this._applyingRemote) this.scheduleCloudPush();
    }

    // ===== CLOUD SYNC (Supabase) =====
    // Free Postgres-backed key/value storage via Supabase's auto-generated REST
    // API (PostgREST). No login flow for the app itself (just a project URL and
    // anon/public API key pasted once). The whole flowchart list is stored as a
    // single row in a `flowchart_sync` table, keyed by a Sync ID. Last-write-wins
    // by timestamp.
    setupCloudSync() {
        this.CLOUD_TABLE = 'flowchart_sync';
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.cloudApiKey && this.cloudProjectUrl && this.cloudSyncId) this.cloudPull();
        });
        if (this.cloudApiKey && this.cloudProjectUrl && this.cloudSyncId) {
            this.updateCloudSyncStatus('idle');
            this.startCloudPolling();
            // Pick up anything saved from another device shortly after boot.
            setTimeout(() => this.cloudPull(), 800);
        }
    }

    startCloudPolling() {
        clearInterval(this._cloudPollTimer);
        this._cloudPollTimer = setInterval(() => {
            if (!document.hidden) this.cloudPull();
        }, 8000);
    }

    scheduleCloudPush() {
        if (!this.cloudApiKey || !this.cloudProjectUrl || !this.cloudSyncId) return;
        clearTimeout(this._cloudPushTimer);
        this._cloudPushTimer = setTimeout(() => this.cloudPush(), 2000);
    }

    setCloudPopupStatus(text, isError = false) {
        if (!this.cloudSyncPopupStatus) return;
        this.cloudSyncPopupStatus.textContent = text || '';
        this.cloudSyncPopupStatus.style.color = isError ? '#a00' : '#0a0';
    }

    updateCloudSyncStatus(state, message) {
        const badge = this.cloudSyncStatusBadge;
        if (!badge) return;
        if (!this.cloudApiKey || !this.cloudProjectUrl || !this.cloudSyncId) {
            badge.style.display = 'none';
            return;
        }
        badge.style.display = 'block';
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (state === 'syncing') badge.textContent = '☁ Syncing...';
        else if (state === 'synced') badge.textContent = `☁ Synced ${time}`;
        else if (state === 'error') badge.textContent = `☁ Sync error${message ? ': ' + message : ''}`;
        else badge.textContent = '☁ Cloud sync on';
    }

    showCloudSyncPopup() {
        if (!this.cloudSyncPopup) return;
        this.cloudSyncUrlInput.value = this.cloudProjectUrl || '';
        this.cloudSyncKeyInput.value = this.cloudApiKey || '';
        this.cloudSyncBinInput.value = this.cloudSyncId || '';
        this.setCloudPopupStatus(this.cloudApiKey && this.cloudProjectUrl && this.cloudSyncId ? 'Connected.' : '');
        this.cloudSyncPopup.style.display = 'block';
    }

    saveCloudSyncSettings() {
        const url = (this.cloudSyncUrlInput.value || '').trim().replace(/\/+$/, '');
        const key = (this.cloudSyncKeyInput.value || '').trim();
        const syncId = (this.cloudSyncBinInput.value || '').trim();
        if (!url || !key || !syncId) {
            this.setCloudPopupStatus('Enter the Project URL, API key, and a Sync ID (or click "Create New Sync").', true);
            return;
        }
        this.cloudProjectUrl = url;
        this.cloudApiKey = key;
        this.cloudSyncId = syncId;
        localStorage.setItem('cloud-sync-project-url', url);
        localStorage.setItem('cloud-sync-api-key', key);
        localStorage.setItem('cloud-sync-id', syncId);
        this.setCloudPopupStatus('Connected. Syncing...');
        this.startCloudPolling();

        // Race the sync against a timeout so the popup always resolves to something
        // concrete - "Synced", a specific error, or "taking longer than expected" -
        // instead of sitting on "Syncing..." forever if a request stalls.
        const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 15000));
        Promise.race([
            this.cloudPull().then(() => this.cloudPush()),
            timeout
        ]).then((result) => {
            if (result === 'timeout') {
                this.setCloudPopupStatus('Still trying to reach Supabase - check your connection and try again.', true);
            } else if (result) {
                this.setCloudPopupStatus('Synced!');
            } else {
                this.setCloudPopupStatus('Connected, but the last sync failed - double check the URL, key, and Sync ID.', true);
            }
        });
    }

    disconnectCloudSync() {
        this.cloudProjectUrl = '';
        this.cloudApiKey = '';
        this.cloudSyncId = '';
        localStorage.removeItem('cloud-sync-project-url');
        localStorage.removeItem('cloud-sync-api-key');
        localStorage.removeItem('cloud-sync-id');
        localStorage.removeItem('cloud-sync-known-remote-at');
        clearTimeout(this._cloudPushTimer);
        clearInterval(this._cloudPollTimer);
        this._cloudPollTimer = null;
        if (this.cloudSyncUrlInput) this.cloudSyncUrlInput.value = '';
        if (this.cloudSyncKeyInput) this.cloudSyncKeyInput.value = '';
        if (this.cloudSyncBinInput) this.cloudSyncBinInput.value = '';
        this.setCloudPopupStatus('Disconnected.');
        this.updateCloudSyncStatus('idle');
    }

    async createCloudBin() {
        const url = (this.cloudSyncUrlInput.value || '').trim().replace(/\/+$/, '');
        const key = (this.cloudSyncKeyInput.value || '').trim();
        if (!url || !key) {
            this.setCloudPopupStatus('Enter the Project URL and API key first.', true);
            return;
        }
        this.setCloudPopupStatus('Creating sync row...');
        try {
            const newId = (crypto.randomUUID && crypto.randomUUID()) ||
                `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            const updatedAt = Date.now();
            const res = await fetch(`${url}/rest/v1/${this.CLOUD_TABLE}`, {
                method: 'POST',
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify([{ id: newId, updated_at: updatedAt, data: { flowchartList: this.flowchartList } }])
            });
            if (!res.ok) throw new Error(`Supabase API error ${res.status}: ${await res.text()}`);
            this.cloudSyncBinInput.value = newId;
            this.setCloudPopupStatus('Sync row created! Click "Save & Sync Now" to connect.');
        } catch (err) {
            console.error('Create sync row failed:', err);
            this.setCloudPopupStatus('Failed to create sync row: ' + err.message, true);
        }
    }

    async cloudPush() {
        if (!this.cloudApiKey || !this.cloudProjectUrl || !this.cloudSyncId) return false;
        if (this._cloudSyncInFlight) {
            this._cloudPushTimer = setTimeout(() => this.cloudPush(), 1500);
            return false;
        }
        this._cloudSyncInFlight = true;
        this.updateCloudSyncStatus('syncing');
        try {
            const updatedAt = Date.now();
            const dataJson = JSON.stringify({ flowchartList: this.flowchartList });
            // Skip the upload entirely if nothing has actually changed since the last
            // successful push - the ~2s debounce can fire on things like a blur event
            // that didn't change any data, and without this check that still costs a
            // full re-upload of everything, drawings included, for no reason.
            if (dataJson === this._lastPushedDataJson) {
                this._cloudSyncInFlight = false;
                this.updateCloudSyncStatus('synced');
                return true;
            }
            const serialized = JSON.stringify({ updated_at: updatedAt, data: { flowchartList: this.flowchartList } });
            // Supabase free tier rows via PostgREST handle multi-MB JSON comfortably,
            // but bail out with a clear warning well before anything unreasonable
            // instead of silently losing data.
            if (serialized.length > 8000000) {
                this.updateCloudSyncStatus('error', 'data too large (>8MB) - remove some old flowcharts');
                this._cloudSyncInFlight = false;
                return false;
            }
            const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=eq.${encodeURIComponent(this.cloudSyncId)}`, {
                method: 'PATCH',
                headers: {
                    'apikey': this.cloudApiKey,
                    'Authorization': `Bearer ${this.cloudApiKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: serialized
            });
            if (!res.ok) throw new Error(`Supabase API error ${res.status}: ${await res.text()}`);
            localStorage.setItem('cloud-sync-known-remote-at', String(updatedAt));
            this._lastPushedDataJson = dataJson;
            this.updateCloudSyncStatus('synced');
            return true;
        } catch (err) {
            console.error('Cloud push failed:', err);
            this.updateCloudSyncStatus('error', err.message);
            return false;
        } finally {
            this._cloudSyncInFlight = false;
        }
    }

    async cloudPull() {
        if (!this.cloudApiKey || !this.cloudProjectUrl || !this.cloudSyncId) return false;
        if (this._cloudSyncInFlight) return false;
        this._cloudSyncInFlight = true;
        try {
            // Two-step check: first ask for just updated_at (a few bytes) rather than
            // the full row. Every poll used to download the entire data blob - drawings
            // included - just to see if anything had changed, even though almost every
            // poll finds nothing new. Only fetching the (potentially multi-MB) `data`
            // column once we already know the remote copy is actually newer cuts
            // routine idle-tab bandwidth by roughly the size of that blob, every cycle.
            const headRes = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=eq.${encodeURIComponent(this.cloudSyncId)}&select=updated_at`, {
                headers: {
                    'apikey': this.cloudApiKey,
                    'Authorization': `Bearer ${this.cloudApiKey}`,
                    'Accept': 'application/json'
                }
            });
            if (!headRes.ok) throw new Error(`Supabase API error ${headRes.status}: ${await headRes.text()}`);
            const headRows = await headRes.json();
            const headRow = headRows && headRows[0];
            if (!headRow) throw new Error('sync row not found - check the Sync ID');
            const remoteUpdatedAt = Number(headRow.updated_at) || 0;
            const knownRemoteAt = Number(localStorage.getItem('cloud-sync-known-remote-at')) || 0;

            if (remoteUpdatedAt > knownRemoteAt) {
                const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=eq.${encodeURIComponent(this.cloudSyncId)}&select=updated_at,data`, {
                    headers: {
                        'apikey': this.cloudApiKey,
                        'Authorization': `Bearer ${this.cloudApiKey}`,
                        'Accept': 'application/json'
                    }
                });
                if (!res.ok) throw new Error(`Supabase API error ${res.status}: ${await res.text()}`);
                const rows = await res.json();
                const row = rows && rows[0];
                const remoteList = row && row.data && row.data.flowchartList;
                if (Array.isArray(remoteList)) {
                    this._applyingRemote = true;
                    this.flowchartList = remoteList;
                    this._lastPushedDataJson = JSON.stringify({ flowchartList: remoteList });
                    this.saveFlowchartList();
                    localStorage.setItem('cloud-sync-known-remote-at', String(remoteUpdatedAt));
                    if (this.currentSlotIndex === null || this.currentSlotIndex >= this.flowchartList.length) {
                        this.currentSlotIndex = 0;
                    }
                    this.loadFlowchartFromList(this.currentSlotIndex);
                    this._applyingRemote = false;
                    this.showNotification('Synced latest changes from another device.');
                }
            }
            this.updateCloudSyncStatus('synced');
            return true;
        } catch (err) {
            console.error('Cloud pull failed:', err);
            this.updateCloudSyncStatus('error', err.message);
            return false;
        } finally {
            this._cloudSyncInFlight = false;
        }
    }

    // Helper methods for leaf node and green node detection
    isLeafNode(node) {
        // A node is a leaf if it has no children AND no outgoing custom connections
        const hasChildren = node.children && node.children.length > 0;
        const hasOutgoingConnections = this.customConnections.some(conn => conn.source === node.data);
        return !hasChildren && !hasOutgoingConnections;
    }

    isGreenNode(node) {
        return node.data.color === '#00a67e';
    }

    hasVisibleChildren(node) {
        return Boolean(
            node.data.children &&
            node.data.children.some(child => !this.isPlaceholderNodeData(child) && (child.name || '').trim())
        );
    }

    toggleNodeCollapse(d, keepSelection = false) {
        if (!d || !d.data || !d.data.children || d.data.children.length === 0) return;
        this.pushUndo();
        const nodeData = d.data;
        nodeData._collapsed = !Boolean(nodeData._collapsed);
        if (keepSelection) {
            // Used by the radial "F" button: re-render, then re-find and re-select the
            // same node (its d3.hierarchy wrapper is a new object after every render)
            // so the radial menu stays open and can be toggled again immediately,
            // instead of silently disappearing after one use.
            this.renderFlowchart(this.rootData);
            let found = null;
            d3.hierarchy(this.rootData).each(node => {
                if (node.data === nodeData) found = node;
            });
            this.selectedNode = found || null;
            this.refreshRadialButtons();
        } else {
            // Hide the radial add-buttons after a fold/unfold; they only reappear if the
            // node is clicked again.
            this.selectedNode = null;
            this.renderFlowchart(this.rootData);
        }
        this.autosave();
    }

    // Update all leaf node names with "(Simplify?)" suffix if they're green
    updateSimplifyPrefixes(node) {
        if (!node) return;
        
        // Check if this is a green leaf node
        if (this.isGreenNode(node) && this.isLeafNode(node)) {
            // Add "(Simplify?)" suffix if not already present
            if (!node.data.name.endsWith(' (Simplify?)')) {
                node.data.name = node.data.name + ' (Simplify?)';
            }
        } else {
            // Remove "(Simplify?)" suffix if it exists and node is no longer a green leaf
            if (node.data.name.endsWith(' (Simplify?)')) {
                node.data.name = node.data.name.substring(0, node.data.name.length - ' (Simplify?)'.length);
            }
        }
        
        // Recursively process children
        if (node.children) {
            node.children.forEach(child => {
                this.updateSimplifyPrefixes(child);
            });
        }
    }

    showStoragePopup() {
        this.loadFlowchartList();
        this.storageSlots.innerHTML = '';
        
        // Display existing flowcharts
        if (this.flowchartList.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = 'No flowcharts saved. Click "New Flowchart" to create one.';
            emptyMsg.style.padding = '20px';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.style.color = '#9aa6b2';
            this.storageSlots.appendChild(emptyMsg);
        } else {
            this.flowchartList.forEach((item, index) => {
                const slot = document.createElement('div');
                slot.className = 'storage-slot';
                if (index === this.currentSlotIndex) {
                    slot.classList.add('active-slot');
                }
                
                const titleSpan = document.createElement('span');
                titleSpan.textContent = item.title || `Flowchart ${index + 1}`;
                titleSpan.style.flex = '1';
                titleSpan.style.padding = '4px 8px';
                
                const selectBtn = document.createElement('button');
                selectBtn.textContent = 'Select';
                selectBtn.style.padding = '4px 12px';
                selectBtn.style.background = '#e0f0ff';
                selectBtn.style.border = '1px solid #aaa';
                selectBtn.style.borderRadius = '4px';
                selectBtn.style.cursor = 'pointer';
                
                selectBtn.onclick = () => {
                    this.loadFlowchartFromList(index);
                    this.storagePopup.style.display = 'none';
                };
                
                const renameBtn = document.createElement('button');
                renameBtn.textContent = 'Rename';
                renameBtn.style.padding = '4px 12px';
                renameBtn.style.background = '#fff0d0';
                renameBtn.style.border = '1px solid #aaa';
                renameBtn.style.borderRadius = '4px';
                renameBtn.style.cursor = 'pointer';
                
                renameBtn.onclick = () => {
                    const newTitle = prompt('Enter new name:', titleSpan.textContent);
                    if (newTitle && newTitle.trim()) {
                        this.flowchartList[index].title = newTitle.trim();
                        this.saveFlowchartList();
                        this.showStoragePopup();
                    }
                };
                
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.style.padding = '4px 12px';
                deleteBtn.style.background = '#ffe0e0';
                deleteBtn.style.border = '1px solid #ffaaaa';
                deleteBtn.style.borderRadius = '4px';
                deleteBtn.style.cursor = 'pointer';
                
                deleteBtn.onclick = () => {
                    if (confirm(`Delete "${titleSpan.textContent}"?`)) {
                        this.flowchartList.splice(index, 1);
                        if (this.currentSlotIndex === index) {
                            this.currentSlotIndex = null;
                        } else if (this.currentSlotIndex > index) {
                            this.currentSlotIndex--;
                        }
                        this.saveFlowchartList();
                        this.showStoragePopup();
                        if (this.flowchartList.length === 0) {
                            this.renderFlowchart(this.getSampleData());
                            this.currentSlotIndex = 0;
                            this.saveCurrentFlowchart();
                        } else if (this.currentSlotIndex === null) {
                            this.loadFlowchartFromList(0);
                        }
                    }
                };
                
                slot.appendChild(titleSpan);
                slot.appendChild(selectBtn);
                slot.appendChild(renameBtn);
                slot.appendChild(deleteBtn);
                this.storageSlots.appendChild(slot);
            });
        }
        
        this.storagePopup.style.display = 'block';
    }
    
    createNewFlowchart() {
        if (this.currentSlotIndex !== null && this.flowchartList[this.currentSlotIndex]) {
            this.saveCurrentFlowchart();
        }
        this.resetReflectionState();

        const defaultData = {
            name: "New Flowchart",
            color: '#00a67e',
            children: [
                { name: "Start", color: '#00a67e' }
            ]
        };
        
        this.flowchartList.push({
            title: `Flowchart ${this.flowchartList.length + 1}`,
            data: JSON.stringify({
                tree: defaultData,
                customConnections: [],
                orientation: 'TB',
                showPlaceholders: true
            })
        });
        
        this.currentSlotIndex = this.flowchartList.length - 1;
        this.saveFlowchartList();
        
        if (this.currentSlotIndex !== null && this.flowchartList[this.currentSlotIndex]) {
            this.saveCurrentFlowchart();
        }
        
        this.customConnections = [];
        this.rootData = defaultData;
        this.orientation = 'TB';
        this.showPlaceholders = true;
        this.transform = d3.zoomIdentity;
        this._zoomBehavior = null;
        this.updateOrientationButtonLabels();
        this.updateTogglePlaceholdersLabels();
        
        this.renderFlowchart(this.rootData);
        this.currentSlotIndex = this.flowchartList.length - 1;
        this.saveCurrentFlowchart();
        
        this.storagePopup.style.display = 'none';
        this.showNotification('New flowchart created!');
    }
    
    loadFlowchartFromList(index) {
        if (index >= this.flowchartList.length) return;
        
        if (this.rootData && this.currentSlotIndex !== null && this.flowchartList[this.currentSlotIndex]) {
            this.saveCurrentFlowchart();
        }
        
        const item = this.flowchartList[index];
        if (!item || !item.data) return;
        
        this.resetReflectionState();
        try {
            const parsed = JSON.parse(item.data);
            if (parsed.tree) {
                if (this.rootData) this.pushUndo();
                this.orientation = parsed.orientation || 'TB';
                this.showPlaceholders = parsed.showPlaceholders !== false;
                this.updateTogglePlaceholdersLabels();
                const savedTransform = parsed.transform;
                const hasSavedTransform = savedTransform &&
                    typeof savedTransform.x === 'number' &&
                    typeof savedTransform.y === 'number' &&
                    typeof savedTransform.k === 'number';
                this.transform = hasSavedTransform
                    ? d3.zoomIdentity.translate(savedTransform.x, savedTransform.y).scale(savedTransform.k)
                    : d3.zoomIdentity;
                const renderOpts = hasSavedTransform ? { keepTransform: true } : { fitView: true };
                this._zoomBehavior = null;
                this.updateOrientationButtonLabels();
                
                let treeData = parsed.tree;
                if (this.isPlaceholderNodeData(treeData) || 
                    (treeData.name === '' && treeData.color === this.getPlaceholderColor() && treeData.children && treeData.children.length > 0)) {
                    this.rootData = treeData;
                } else {
                    this.rootData = this.wrapRootWithPlaceholder(treeData);
                    this.ensureRightmostPlaceholderNodes(this.rootData);
                }

                this.pughMatrix = this.sanitizePughMatrix(parsed.pughMatrix);
                this.globalNotes = (typeof parsed.globalNotes === 'string') ? parsed.globalNotes : '';
                this.notesDrawings = (parsed.notesDrawings && typeof parsed.notesDrawings === 'object') ? parsed.notesDrawings : {};
                this.notesImages = (parsed.notesImages && typeof parsed.notesImages === 'object') ? parsed.notesImages : {};
                this.renderNotesPanel();
                
                if (parsed.customConnections) {
                    const nodeMap = new Map();
                    d3.hierarchy(this.rootData).each(d => nodeMap.set(d.data.name, d.data));
                    
                    this.customConnections = parsed.customConnections
                        .map(conn => {
                            const source = nodeMap.get(conn.source);
                            const target = nodeMap.get(conn.target);
                            if (source && target) {
                                return {
                                    source,
                                    target,
                                    _offset: conn._offset || 0
                                };
                            }
                            return null;
                        })
                        .filter(Boolean);
                    
                    this.renderFlowchart(this.rootData, renderOpts);
                }
                
                this.renderFlowchart(this.rootData, renderOpts);
                this.currentSlotIndex = index;
                this.saveCurrentFlowchart();
                this.autosave();
            }
        } catch (e) {
            console.error('Error loading saved flowchart:', e);
            alert('Failed to load saved flowchart');
        }
    }

    getSampleData() {
        return {
            name: "Root",
            children: [
                {
                    name: "Node A",
                    children: [
                        { name: "Node A1" },
                        { name: "Node A2" }
                    ]
                },
                {
                    name: "Node B",
                    children: [
                        { name: "Node B1" },
                        { name: "Node B2" }
                    ]
                }
            ]
        };
    }

    setupZoom(svg, g) {
        if (!this._zoomBehavior) {
            this._zoomBehavior = d3.zoom()
                .scaleExtent([this.minZoom, this.maxZoom])
                .clickDistance(10)
                .on('start', (event) => {
                    // Real user gesture starting to pan/zoom while a node's text is being
                    // edited: save that edit instead of discarding it. Only fires once per
                    // gesture, before any 'zoom' ticks. The render is deferred (see below)
                    // so the SVG isn't torn down and rebuilt while this same gesture is
                    // still actively tracking - doing that mid-drag broke d3-zoom's pointer
                    // state and made the *next* pan jump. Wrapped in try/catch since an
                    // uncaught exception here would abort d3-zoom's own gesture setup
                    // partway through, freezing the drag entirely rather than just this save.
                    if (event.sourceEvent && this.nodeBeingEdited && !this._suppressPopupHide) {
                        try {
                            this.hideNodeEditPopup(true, true);
                        } catch (err) {
                            console.error('Error saving node edit at gesture start:', err);
                        }
                    }
                })
                .on('zoom', (event) => {
                    this.transform = event.transform;
                    const flowGroup = d3.select('#flowchart g').node();
                    if (flowGroup) {
                        d3.select(flowGroup).attr('transform', this.transform);
                    }
                    this.updateStickyAncestors();
                    this.hideContextMenu();
                    // Dragging/zooming the background hides the radial add-buttons too;
                    // they only come back if the node is clicked again. Gated to real user
                    // gestures (sourceEvent set) so our own programmatic transform calls -
                    // e.g. the mobile centering that now runs after the keyboard opens -
                    // don't immediately wipe out buttons that were just shown.
                    if (event.sourceEvent && this.selectedNode) {
                        this.selectedNode = null;
                        d3.selectAll('.radial-add-btn-layer').remove();
                    }
                })
                .on('end', (event) => {
                    // Only persist on a real user gesture (sourceEvent set) - our own
                    // programmatic transform calls (initial setup, mobile centering,
                    // restoring a saved view) also fire 'end' but shouldn't trigger a save.
                    if (event.sourceEvent) {
                        try {
                            this.autosave();
                        } catch (err) {
                            console.error('Error autosaving at gesture end:', err);
                        }
                    }
                    // Now that the gesture has fully finished, it's safe to flush any
                    // render that a mid-gesture text save deferred.
                    if (this._deferredRenderPending) {
                        this._deferredRenderPending = false;
                        try {
                            this.renderFlowchart(this.rootData);
                        } catch (err) {
                            console.error('Error flushing deferred render at gesture end:', err);
                        }
                    }
                });
        }

        svg.call(this._zoomBehavior);
        svg.call(this._zoomBehavior.transform, this.transform);

        svg.on('dblclick.zoom', null);

        svg.on('click', (event) => {
            if (event.target === svg.node()) {
                this.hideContextMenu();
                this.hideNodeEditPopup(true);
                this.deselectNode();
                if (this.isMovingNode) this.cancelMoveNode();
                if (this.isMakingConnection) this.cancelMakeConnection();
            }
        });
    }

    zoom(factor) {
        const svg = d3.select('#flowchart svg');
        if (!this._zoomBehavior || svg.empty()) return;
        const container = this.flowchartContainer.getBoundingClientRect();
        const cx = container.width / 2;
        const cy = container.height / 2;
        svg.call(this._zoomBehavior.scaleBy, factor, [cx, cy]);
    }

    resetZoom() {
        const svg = d3.select('#flowchart svg');
        if (!this._zoomBehavior || svg.empty()) return;
        svg.transition().duration(300)
            .call(this._zoomBehavior.scaleTo, 1);
    }

    // On mobile, tapping a node centers it horizontally and vertically in the middle of
    // the top half of the screen, and opens the keyboard via showNodeEditPopup's focus
    // call. This happens instantly, synchronously alongside opening the popup. On
    // desktop, nothing is re-centered (the person's own pan/zoom is left alone) - but
    // ensureNodeInView still nudges the view just enough to keep the node on-screen, so
    // e.g. adding a child far out along an already-scrolled-to-the-edge branch doesn't
    // leave the brand new node clipped off the visible canvas.
    centerNodeOnMobile(d, callback) {
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        const svg = d3.select('#flowchart svg');
        if (!isMobile || !this._zoomBehavior || svg.empty() || !d ||
            !Number.isFinite(d.x) || !Number.isFinite(d.y)) {
            if (!isMobile) this.ensureNodeInView(d);
            callback();
            return;
        }

        const width = this.flowchartPanel.clientWidth;
        const height = this.flowchartPanel.clientHeight;
        const k = this.transform.k;
        const tx = width / 2 - d.x * k;
        // Center of the top half of the screen: 1/4 of the height.
        const ty = (height * 0.25) - d.y * k;
        const newTransform = d3.zoomIdentity.translate(tx, ty).scale(k);
        svg.call(this._zoomBehavior.transform, newTransform);
        callback();
    }

    // Pans (never zooms) just enough to bring node `d` fully into view within the
    // current viewport, if it isn't already - used after adding a node so a newly
    // created node can never end up positioned outside/clipped by the visible canvas
    // just because the person had already panned or zoomed in on a different area.
    // A no-op if the node is already fully visible.
    ensureNodeInView(d, margin = 60) {
        if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
        const svg = d3.select('#flowchart svg');
        if (!this._zoomBehavior || svg.empty()) return;

        const width = this.flowchartPanel.clientWidth;
        const height = this.flowchartPanel.clientHeight;
        const k = this.transform.k;
        const screenX = d.x * k + this.transform.x;
        const screenY = d.y * k + this.transform.y;

        // Generous half-width/height allowance (actual node box is smaller, but
        // multi-line text can grow it, and it's better to over- than under-estimate
        // here) so the whole node box clears the edge, not just its center point.
        const halfNodeW = 70 * k;
        const halfNodeH = 50 * k;

        let dx = 0;
        let dy = 0;
        if (screenX - halfNodeW < margin) {
            dx = margin - (screenX - halfNodeW);
        } else if (screenX + halfNodeW > width - margin) {
            dx = (width - margin) - (screenX + halfNodeW);
        }
        if (screenY - halfNodeH < margin) {
            dy = margin - (screenY - halfNodeH);
        } else if (screenY + halfNodeH > height - margin) {
            dy = (height - margin) - (screenY + halfNodeH);
        }

        if (dx === 0 && dy === 0) return;

        const newTransform = d3.zoomIdentity
            .translate(this.transform.x + dx, this.transform.y + dy)
            .scale(k);
        svg.call(this._zoomBehavior.transform, newTransform);
    }

    resetView() {
        this.transform = d3.zoomIdentity;
        this._zoomBehavior = null;
        this.updateFlowchart();
    }

    toggleOrientation() {
        this.orientation = this.orientation === 'LR' ? 'TB' : 'LR';
        this.updateOrientationButtonLabels();
        this.renderFlowchart(this.rootData);
        this.autosave();
    }

    updateOrientationButtonLabels() {
        const label = this.orientation === 'LR' ? '↔ Left-Right' : '↕ Top-Down';
        if (this.orientationBtn) this.orientationBtn.textContent = label;
        if (this.hamburgerOrientationBtn) this.hamburgerOrientationBtn.textContent = label;
    }

    toggleArrangement() {
        this.arrangement = this.arrangement === 'indented' ? 'centered' : 'indented';
        localStorage.setItem('flowchart-arrangement', this.arrangement);
        this.updateArrangementButtonLabels();
        this.renderFlowchart(this.rootData);
        this.autosave();
    }

    updateArrangementButtonLabels() {
        const label = this.arrangement === 'indented' ? '📐 Indented Layout' : '📐 Centered Layout';
        if (this.arrangementBtn) this.arrangementBtn.textContent = label;
        if (this.hamburgerArrangementBtn) this.hamburgerArrangementBtn.textContent = label;
    }

    // Positions a d3 hierarchy in "indented list" style instead of the default centered
    // tree: each node's first child continues straight along the depth axis (same
    // secondary-axis coordinate as its parent), and any additional siblings fan out
    // along the secondary axis starting from that first child, rather than being
    // centered as a group under the parent. Operates in the pre-LR-swap coordinate
    // frame (x = secondary/sibling-spread axis, y = primary/depth axis), same as
    // d3.tree(), so the existing LR swap that runs after layout still applies.
    //
    // Each *real* (non-empty) sibling after the first starts only once the entire
    // previous sibling's subtree has been cleared - i.e. at the point its
    // deepest-reaching leaf ended, not just wherever the two subtrees would first
    // collide row-by-row - so no real subtree ever ends up positioned above/left of
    // a neighboring subtree's children. Empty/placeholder siblings are exempt from
    // this and keep the old tight, row-by-row packing (they're just visual stubs
    // with no children of their own, so there's nothing for them to visually
    // collide with - no reason to waste space waiting for a whole neighboring
    // subtree to clear). This is done with a contour: for each node,
    // node._contour[r] tracks the min/max secondary-axis extent reached by its
    // subtree r rows below itself, and combinedMax tracks the single furthest
    // extent reached by anything already placed, across every row.
    isEmptyIndentedNode(node) {
        const data = node && node.data;
        if (!data) return true;
        return this.isPlaceholderNodeData(data) || !(data.name || '').trim();
    }

    computeIndentedContour(node, secondarySpacing) {
        const children = node.children;
        if (!children || children.length === 0) {
            node._contour = [{ min: 0, max: 0 }];
            return node._contour;
        }

        children.forEach(child => this.computeIndentedContour(child, secondarySpacing));

        // Contour of everything placed under this node so far, in this node's own
        // local frame (this node sits at local x = 0).
        const combined = [];
        let combinedMax = 0;
        const mergeInto = (childContour, offset) => {
            childContour.forEach((c, row) => {
                if (!c) return;
                const parentRow = row + 1;
                const shifted = { min: c.min + offset, max: c.max + offset };
                if (!combined[parentRow]) {
                    combined[parentRow] = { min: shifted.min, max: shifted.max };
                } else {
                    combined[parentRow].min = Math.min(combined[parentRow].min, shifted.min);
                    combined[parentRow].max = Math.max(combined[parentRow].max, shifted.max);
                }
                combinedMax = Math.max(combinedMax, shifted.max);
            });
        };

        // First child always continues flush with the parent (offset 0) - that's what
        // keeps the "first entry stays in line with its parent" look.
        children[0]._secondaryOffset = 0;
        mergeInto(children[0]._contour, 0);

        for (let i = 1; i < children.length; i++) {
            const child = children[i];
            const childContour = child._contour;
            let offset;

            if (this.isEmptyIndentedNode(child)) {
                // Empty/placeholder: pack in tightly, row by row - only rows where it
                // would actually collide with something already placed push it further out.
                offset = 0;
                for (let row = 0; row < childContour.length; row++) {
                    const c = childContour[row];
                    if (!c) continue;
                    const parentRow = row + 1;
                    const existing = combined[parentRow];
                    if (existing) {
                        const required = (existing.max + secondarySpacing) - c.min;
                        if (required > offset) offset = required;
                    }
                }
            } else {
                // Real node: start only once the previous sibling's entire subtree - down
                // to its deepest leaf - has been cleared.
                let childMin = Infinity;
                childContour.forEach(c => {
                    if (c) childMin = Math.min(childMin, c.min);
                });
                if (!isFinite(childMin)) childMin = 0;
                offset = (combinedMax + secondarySpacing) - childMin;
            }

            child._secondaryOffset = offset;
            mergeInto(childContour, offset);
        }

        const contour = [{ min: 0, max: 0 }];
        for (let row = 1; row < combined.length; row++) {
            contour[row] = combined[row];
        }
        node._contour = contour;
        return contour;
    }

    assignIndentedPositions(node, secondaryStart, depth, primarySpacing) {
        node.x = secondaryStart;
        node.y = depth * primarySpacing;
        (node.children || []).forEach(child => {
            this.assignIndentedPositions(child, secondaryStart + (child._secondaryOffset || 0), depth + 1, primarySpacing);
        });
    }

    // The parent-to-child connector path (rounded elbow, or a straight line when
    // source/target line up) for the main hierarchy links. Pulled out into its own
    // method so updateStickyAncestors can redraw a link using an adjusted (sticky)
    // endpoint instead of a node's true position, using the exact same path shape.
    computeLinkPathD(sourceX, sourceY, targetX, targetY, cornerRadius = 10) {
        if (this.orientation === 'LR') {
            // Any link whose source and target sit at the same height gets a plain
            // horizontal line. This covers a lone child, an odd-count symmetric middle
            // child under the centered layout, AND the first child under the indented
            // layout (which is deliberately kept flush with its parent's row) - so the
            // parent-to-first-child segment is a straight line rather than the mismatched
            // up/down curve pair that appeared when sourceY and targetY were nearly
            // equal but not treated as a straight case.
            const isStraightLink = Math.abs(sourceY - targetY) < 1;

            if (isStraightLink) {
                return `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
            }

            const dir = Math.sign(targetX - sourceX) || 1;
            const connectionX = Math.round((sourceX + dir * 80) / 10) * 10;
            const yDirection = sourceY < targetY ? 1 : -1;
            const curveStartY = sourceY + yDirection * cornerRadius;
            const curveEndY = targetY - yDirection * cornerRadius;
            return `
                M ${sourceX},${sourceY}
                L ${connectionX - dir * cornerRadius},${sourceY}
                Q ${connectionX},${sourceY} ${connectionX},${curveStartY}
                L ${connectionX},${curveEndY}
                Q ${connectionX},${targetY} ${connectionX + dir * cornerRadius},${targetY}
                L ${targetX},${targetY}
            `;
        }

        const dir = Math.sign(targetX - sourceX) || 1;
        if (sourceX === targetX) {
            return `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
        }
        const connectionY = Math.round((targetY - 80) / 10) * 10;
        return `
            M ${sourceX},${sourceY}
            L ${sourceX},${connectionY - cornerRadius}
            Q ${sourceX},${connectionY} ${sourceX + dir * cornerRadius},${connectionY}
            L ${targetX - dir * cornerRadius},${connectionY}
            Q ${targetX},${connectionY} ${targetX},${connectionY + cornerRadius}
            L ${targetX},${targetY}
        `;
    }

    // How far from the left edge of the flowchart viewport sticky nodes/labels should
    // stop - accounts for the Questions/Pugh Matrix panel, which is an absolutely
    // positioned overlay on the left rather than something that shrinks the flowchart,
    // so without this a sticky node would end up rendered underneath it.
    getStickyLeftBound() {
        const margin = 20;
        if (this.reflectionPanel && this.flowchartPanel) {
            const panelStyle = window.getComputedStyle(this.reflectionPanel);
            if (panelStyle.display !== 'none') {
                const panelRect = this.reflectionPanel.getBoundingClientRect();
                const flowRect = this.flowchartPanel.getBoundingClientRect();
                const panelRightEdge = panelRect.right - flowRect.left;
                if (panelRect.width > 0 && panelRightEdge > margin) {
                    return panelRightEdge + margin;
                }
            }
        }
        return margin;
    }

    // How far from the top edge of the flowchart viewport sticky nodes/labels should
    // stop, when docking along the vertical axis (see updateStickyAncestors). Unlike
    // the left bound, the Questions/Pugh Matrix panel spans the full height along the
    // left rather than occupying a horizontal band across the top, so it isn't a
    // vertical obstruction the same way - just a flat margin from the top.
    getStickyTopBound() {
        return 20;
    }

    // Keeps a node "docked" at the edge of the visible flowchart area while its true
    // position has been panned off-screen, as long as at least one of its *real*
    // (non-empty) children is still on-screen or itself docked - i.e. there's a
    // connector line to real content the person would otherwise lose track of.
    // Docking happens along whichever axis *siblings spread on*, not the depth axis -
    // that's the axis where this actually comes up: a parent sits at one particular
    // spot relative to its (possibly many, spread-out) children, and panning along
    // that spread to browse them can scroll the parent out of view while some of its
    // children remain visible. For the default Top-Down orientation, siblings spread
    // horizontally, so docking happens against the left edge, following the pan
    // left/right. For Left-Right, siblings spread vertically instead, so docking
    // happens against the top edge, following the pan up/down. Docked nodes/links
    // shift with the pan along that axis, and release back to their true position
    // once panning brings that position back past the docking point. Runs after every
    // render and on every pan/zoom tick.
    updateStickyAncestors() {
        const root = this._lastRenderedRoot;
        const g = this._flowchartG;
        if (!root || !g || g.empty()) return;

        const isLR = this.orientation === 'LR';
        const k = this.transform.k;
        // t is the pan offset along the sibling-spread axis; bound is the edge sticky
        // nodes dock against on that same axis.
        const t = isLR ? this.transform.y : this.transform.x;
        const bound = isLR ? this.getStickyTopBound() : this.getStickyLeftBound();
        // Nodes are drawn centered on their position along this axis - docking a node
        // exactly at bound would put its center right on the boundary and hide half of
        // it, so a docked node's normal resting spot is one full node-width/height
        // clearance past it instead. (There's no fixed NODE_HEIGHT the way there's a
        // fixed NODE_WIDTH, since box height depends on line count - this is a
        // reasonable single-line approximation.)
        const nodeClearance = isLR ? 40 : this.NODE_WIDTH;
        const dockedScreenPos = bound + nodeClearance * k;
        const getPos = d => isLR ? d.y : d.x;

        root.eachAfter(d => {
            const truePos = getPos(d) * k + t;
            // Placeholder/empty children (typically a trailing "add new" stub) don't
            // count as a reason to keep the parent docked - otherwise the parent would
            // stay stuck to the edge even once every *real* child has scrolled out of
            // view, just because an empty stub is still hanging on screen. Real
            // children are checked against bound (not dockedScreenPos) here - any
            // child visible at all past the boundary is reason enough to keep the
            // parent docked, even if that child itself hasn't reached full clearance.
            const relevantChildren = d.children
                ? d.children.filter(child => !this.isEmptyIndentedNode(child) && child._effectiveScreenPos >= bound)
                : [];

            if (relevantChildren.length === 0) {
                d._effectiveScreenPos = truePos;
                d._stickyRenderPos = getPos(d);
                d._docked = false;
                return;
            }

            // Each child contributes either its own true position (if it isn't itself
            // docked - it's just sitting wherever it naturally is, so tracking it makes
            // sense) or the standard clearance offset (if it's ALREADY docked - its own
            // compressed/tracked position must not propagate further up the chain, or
            // every ancestor above a terminating branch would compress together with
            // it, one after another, instead of only the immediate parent doing so).
            //
            // Tracking (compressing toward a child's position, rather than sitting
            // still at the normal offset) only kicks in once there's exactly ONE
            // relevant child left. With multiple children still relevant, using the
            // minimum across all of them meant the parent started lagging/compressing
            // as soon as *any single* child got close to the boundary - producing a
            // lag-then-jump pattern for every child it passed, one after another,
            // instead of staying put until only the final child remains. Now the
            // parent stays fixed at the normal offset the whole time multiple
            // children are still relevant, and only starts tracking/compressing once
            // it's down to that last one - i.e. lags off-screen only as it reaches
            // the final non-empty leaf among its children, not for every child along
            // the way.
            let dockCeiling;
            if (relevantChildren.length === 1) {
                const onlyChild = relevantChildren[0];
                const childContribution = onlyChild._docked ? dockedScreenPos : onlyChild._effectiveScreenPos;
                dockCeiling = Math.min(dockedScreenPos, childContribution);
            } else {
                dockCeiling = dockedScreenPos;
            }

            if (truePos < dockCeiling) {
                d._effectiveScreenPos = dockCeiling;
                d._stickyRenderPos = (dockCeiling - t) / k;
                d._docked = true;
            } else {
                d._effectiveScreenPos = truePos;
                d._stickyRenderPos = getPos(d);
                d._docked = false;
            }
        });

        const snap10 = v => Math.round(v / 10) * 10;

        g.selectAll('.node')
            .attr('transform', d => isLR
                ? `translate(${d.x},${snap10(d._stickyRenderPos)})`
                : `translate(${snap10(d._stickyRenderPos)},${d.y})`);

        g.selectAll('path.link:not(.custom-link)')
            .attr('d', d => isLR
                ? this.computeLinkPathD(
                    snap10(d.source.x), snap10(d.source._stickyRenderPos),
                    snap10(d.target.x), snap10(d.target._stickyRenderPos)
                  )
                : this.computeLinkPathD(
                    snap10(d.source._stickyRenderPos), snap10(d.source.y),
                    snap10(d.target._stickyRenderPos), snap10(d.target.y)
                  ));
    }

    applyIndentedLayout(root, secondarySpacing, primarySpacing) {
        this.computeIndentedContour(root, secondarySpacing);
        this.assignIndentedPositions(root, 0, 0, primarySpacing);
    }

    togglePlaceholders() {
        this.showPlaceholders = !this.showPlaceholders;
        this.updateTogglePlaceholdersLabels();
        this.renderFlowchart(this.rootData);
        this.autosave();
    }

    updateTogglePlaceholdersLabels() {
        const label = this.showPlaceholders ? '👻 Hide Placeholders' : '👻 Show Placeholders';
        if (this.togglePlaceholdersBtn) this.togglePlaceholdersBtn.textContent = label;
        if (this.hamburgerTogglePlaceholdersBtn) this.hamburgerTogglePlaceholdersBtn.textContent = label;
    }

    updateFlowchart() {
        this.renderFlowchart(this.rootData);
    }

    getNodeLevel(node) {
        let level = 0;
        while (node.parent) {
            level++;
            node = node.parent;
        }
        return level;
    }

    getPlaceholderColor() {
        return '#323a4a';
    }

    isPlaceholderNodeData(nodeData) {
        if (!nodeData) return false;
        return Boolean(nodeData._isPlaceholder);
    }

    markNodeAsReal(nodeData) {
        if (nodeData) {
            delete nodeData._isPlaceholder;
            if (nodeData.color === this.getPlaceholderColor()) {
                nodeData.color = '#00a67e';
            }
        }
    }

    createPlaceholderNode() {
        return {
            name: '',
            color: this.getPlaceholderColor(),
            _isPlaceholder: true
        };
    }

    wrapRootWithPlaceholder(data) {
        if (!data || typeof data !== 'object') return this.createPlaceholderNode();
        if (this.isPlaceholderNodeData(data)) return data;
        
        if (data.children && data.children.length > 0) {
            if (data.name === '' && data.color === this.getPlaceholderColor()) {
                const hasRealChild = data.children.some(child => !this.isPlaceholderNodeData(child));
                if (hasRealChild) {
                    return data;
                }
            }
        }
        
        return {
            ...this.createPlaceholderNode(),
            children: [data]
        };
    }

    isRootPlaceholderNode(node) {
        return Boolean(
            node &&
            node.parent === null &&
            this.isPlaceholderNodeData(node.data)
        );
    }

    ensureRightmostPlaceholderNodes(nodeData) {
        if (!nodeData || typeof nodeData !== 'object') return;

        if (!Array.isArray(nodeData.children) || nodeData.children.length === 0) {
            return;
        }

        nodeData.children.forEach(child => {
            this.ensureRightmostPlaceholderNodes(child);
        });

        if (nodeData._skipAutoPlaceholder) {
            return;
        }

        const lastChild = nodeData.children[nodeData.children.length - 1];

        if (
            lastChild &&
            (
                this.isPlaceholderNodeData(lastChild) ||
                !(lastChild.name || '').trim()
            )
        ) {
            return;
        }

        nodeData.children.push(this.createPlaceholderNode());
    }

    // Generic helpers that operate directly on the plain-object tree by object reference,
    // independent of any particular d3.hierarchy snapshot.
    removeNodeDataFromTree(nodeData) {
        const removeFrom = (node) => {
            if (!node || !Array.isArray(node.children)) return false;
            const idx = node.children.indexOf(nodeData);
            if (idx !== -1) {
                node.children.splice(idx, 1);
                if (node.children.length === 0) delete node.children;
                return true;
            }
            for (const child of node.children) {
                if (removeFrom(child)) return true;
            }
            return false;
        };
        removeFrom(this.rootData);
    }

    unwrapNodeInTree(wrapData, replacementData) {
        if (this.rootData === wrapData) {
            this.rootData = replacementData;
            return;
        }
        const replace = (node) => {
            if (!node || !Array.isArray(node.children)) return false;
            const idx = node.children.indexOf(wrapData);
            if (idx !== -1) {
                node.children[idx] = replacementData;
                return true;
            }
            for (const child of node.children) {
                if (replace(child)) return true;
            }
            return false;
        };
        replace(this.rootData);
    }

    showContextMenu(event, d) {
        // Context menu removed per user request
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
            document.removeEventListener('mousedown', this._contextMenuListener);
            this._contextMenuListener = null;
        }
    }

    startCtrlDragNode(event, d) {
        event.preventDefault();
        event.stopPropagation();
        this.skipNextNodeClick = true;
        this.ctrlDragState = {
            source: d,
            startX: event.clientX,
            startY: event.clientY
        };

        d3.selectAll('.node')
            .filter(nd => d.descendants().includes(nd))
            .selectAll('rect')
            .attr('opacity', 0.4);

        const svg = d3.select('svg');
        svg.on('mousemove.ctrlDrag', (moveEvent) => {
            if (!this.ctrlDragState) return;

            const dx = moveEvent.clientX - this.ctrlDragState.startX;
            const dy = moveEvent.clientY - this.ctrlDragState.startY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                this.ctrlDragState.hasMoved = true;
            }

            const hoveredNode = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.node');
            const hoveredDatum = hoveredNode ? d3.select(hoveredNode).datum() : null;
            const sourceD = this.ctrlDragState.source;

            d3.selectAll('.node')
                .selectAll('rect')
                .attr('stroke', d => d === sourceD ? '#ff9900' : '#999')
                .attr('stroke-width', d => d === sourceD ? '3px' : '1.5px');

            if (hoveredDatum && hoveredDatum !== sourceD && !sourceD.descendants().includes(hoveredDatum)) {
                d3.select(hoveredNode)
                    .selectAll('rect')
                    .attr('stroke', '#00a67e')
                    .attr('stroke-width', '3px');
            }
        });

        svg.on('mouseup.ctrlDrag', (upEvent) => {
            if (!this.ctrlDragState) return;
            const nodeEl = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest('.node');
            const targetD = nodeEl ? d3.select(nodeEl).datum() : null;
            const sourceD = this.ctrlDragState.source;

            if (targetD && targetD !== sourceD && !sourceD.descendants().includes(targetD)) {
                this.moveNodeTo(sourceD, targetD);
            }

            this.finishCtrlDrag();
        });

        svg.on('mouseleave.ctrlDrag', () => this.finishCtrlDrag());
    }

    finishCtrlDrag() {
        if (!this.ctrlDragState) return;
        const svg = d3.select('svg');
        svg.on('mousemove.ctrlDrag', null);
        svg.on('mouseup.ctrlDrag', null);
        svg.on('mouseleave.ctrlDrag', null);
        d3.selectAll('.node rect')
            .attr('opacity', 1)
            .attr('stroke', '#999')
            .attr('stroke-width', '1.5px');
        this.ctrlDragState = null;
    }

    startMoveNode(d) {
        this.isMovingNode = true;
        this.movingNodeDatum = d;
        this.movingNodeAncestors = new Set(d.ancestors().map(a => a.data));
        d3.selectAll('.node')
            .filter(nd => d.descendants().includes(nd))
            .selectAll('rect')
            .attr('opacity', 0.4);
        this.showMoveInstruction();
        d3.selectAll('.node')
            .on('click.move', (event, targetD) => {
                if (d === targetD || d.descendants().includes(targetD)) {
                    this.cancelMoveNode();
                    return;
                }
                this.moveNodeTo(d, targetD);
                this.cancelMoveNode();
            });
        d3.select('svg').on('click.cancelmove', (event) => {
            if (event.target.tagName === 'svg') {
                this.cancelMoveNode();
            }
        });
    }

    showMoveInstruction() {
        if (!document.getElementById('move-instruction')) {
            const instr = document.createElement('div');
            instr.id = 'move-instruction';
            instr.style.position = 'absolute';
            instr.style.left = '50%';
            instr.style.bottom = '30px';
            instr.style.transform = 'translateX(-50%)';
            instr.style.background = 'rgba(255,255,255,0.95)';
            instr.style.border = '1px solid #ccc';
            instr.style.padding = '14px 28px';
            instr.style.borderRadius = '8px';
            instr.style.zIndex = 2000;
            instr.style.fontSize = '16px';
            instr.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
            instr.style.display = 'flex';
            instr.style.alignItems = 'center';
            instr.style.gap = '18px';

            const msg = document.createElement('span');
            msg.innerText = 'Select a new parent node';

            const cancelBtn = document.createElement('button');
            cancelBtn.innerText = 'Cancel';
            cancelBtn.style.fontSize = '15px';
            cancelBtn.style.padding = '6px 18px';
            cancelBtn.style.border = '1px solid #aaa';
            cancelBtn.style.borderRadius = '5px';
            cancelBtn.style.background = '#f8f8f8';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.addEventListener('click', () => this.cancelMoveNode());

            instr.appendChild(msg);
            instr.appendChild(cancelBtn);

            this.flowchartContainer.appendChild(instr);
        }
    }

    hideMoveInstruction() {
        const instr = document.getElementById('move-instruction');
        if (instr) instr.remove();
    }

    cancelMoveNode() {
        this.isMovingNode = false;
        this.movingNodeDatum = null;
        this.movingNodeAncestors = null;
        d3.selectAll('.node rect').attr('opacity', 1);
        d3.selectAll('.node').on('click.move', null);
        d3.select('svg').on('click.cancelmove', null);
        this.hideMoveInstruction();
    }

    startMakeConnection(d) {
        this.isMakingConnection = true;
        this.connectionSourceNode = d;
        d3.selectAll('.node')
            .filter(nd => nd === d)
            .selectAll('rect')
            .attr('stroke', '#ff9900')
            .attr('stroke-width', '2px');
        this.showConnectionInstruction();
        d3.selectAll('.node')
            .on('click.connect', (event, targetD) => {
                if (d === targetD) {
                    this.cancelMakeConnection();
                    return;
                }
                this.createConnection(d, targetD);
                this.hideNodeEditPopup(false);
                this.cancelMakeConnection();
            });
        d3.select('svg').on('click.cancelconnect', (event) => {
            if (event.target.tagName === 'svg') {
                this.cancelMakeConnection();
            }
        });
    }

    showConnectionInstruction() {
        if (!document.getElementById('connection-instruction')) {
            const instr = document.createElement('div');
            instr.id = 'connection-instruction';
            instr.style.position = 'absolute';
            instr.style.left = '50%';
            instr.style.bottom = '30px';
            instr.style.transform = 'translateX(-50%)';
            instr.style.background = 'rgba(255,255,255,0.95)';
            instr.style.border = '1px solid #ccc';
            instr.style.padding = '14px 28px';
            instr.style.borderRadius = '8px';
            instr.style.zIndex = 2000;
            instr.style.fontSize = '16px';
            instr.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
            instr.style.display = 'flex';
            instr.style.alignItems = 'center';
            instr.style.gap = '18px';

            const msg = document.createElement('span');
            msg.innerText = 'Select a target node to connect to';

            const cancelBtn = document.createElement('button');
            cancelBtn.innerText = 'Cancel';
            cancelBtn.style.fontSize = '15px';
            cancelBtn.style.padding = '6px 18px';
            cancelBtn.style.border = '1px solid #aaa';
            cancelBtn.style.borderRadius = '5px';
            cancelBtn.style.background = '#f8f8f8';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.addEventListener('click', () => this.cancelMakeConnection());

            instr.appendChild(msg);
            instr.appendChild(cancelBtn);

            this.flowchartContainer.appendChild(instr);
        }
    }

    hideConnectionInstruction() {
        const instr = document.getElementById('connection-instruction');
        if (instr) instr.remove();
    }

    cancelMakeConnection() {
        this.isMakingConnection = false;
        if (this.connectionSourceNode) {
            d3.selectAll('.node')
                .filter(nd => nd === this.connectionSourceNode)
                .selectAll('rect')
                .attr('stroke', '#999')
                .attr('stroke-width', '1.5px');
        }
        this.connectionSourceNode = null;
        d3.selectAll('.node').on('click.connect', null);
        d3.select('svg').on('click.cancelconnect', null);
        this.hideConnectionInstruction();
    }

    createConnection(sourceD, targetD) {
        this.pushUndo();

        const sourceLevel = this.getNodeLevel(sourceD);
        const targetLevel = this.getNodeLevel(targetD);

        if (sourceLevel <= targetLevel) {
            this.customConnections.push({
                source: sourceD.data,
                target: targetD.data
            });
        } else {
            this.customConnections.push({
                source: targetD.data,
                target: sourceD.data
            });
        }

        this.renderFlowchart(this.rootData);
        this.autosave();
    }

    cloneData(data) {
        return JSON.parse(JSON.stringify(data));
    }

    pushUndo() {
        const state = {
            data: this.cloneData(this.rootData),
            connections: JSON.parse(JSON.stringify(this.customConnections))
        };
        this.undoStack.push(state);
        if (this.undoStack.length > 100) this.undoStack.shift();
        this.redoStack = [];
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        this.undoBtn.style.opacity = this.undoStack.length > 0 ? "1" : "0.5";
        this.undoBtn.style.pointerEvents = this.undoStack.length > 0 ? "auto" : "none";
        this.redoBtn.style.opacity = this.redoStack.length > 0 ? "1" : "0.5";
        this.redoBtn.style.pointerEvents = this.redoStack.length > 0 ? "auto" : "none";
        if (this.topUndoBtn) {
            this.topUndoBtn.style.opacity = this.undoStack.length > 0 ? "1" : "0.5";
            this.topUndoBtn.style.pointerEvents = this.undoStack.length > 0 ? "auto" : "none";
        }
        if (this.topRedoBtn) {
            this.topRedoBtn.style.opacity = this.redoStack.length > 0 ? "1" : "0.5";
            this.topRedoBtn.style.pointerEvents = this.redoStack.length > 0 ? "auto" : "none";
        }
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const currentState = {
            data: this.cloneData(this.rootData),
            connections: JSON.parse(JSON.stringify(this.customConnections))
        };
        this.redoStack.push(currentState);
        const prev = this.undoStack.pop();
        this.rootData = prev.data;
        this.customConnections = prev.connections;
        this.renderFlowchart(this.rootData);
        this.updateUndoRedoButtons();
        this.autosave();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const currentState = {
            data: this.cloneData(this.rootData),
            connections: JSON.parse(JSON.stringify(this.customConnections))
        };
        this.undoStack.push(currentState);
        const next = this.redoStack.pop();
        this.rootData = next.data;
        this.customConnections = next.connections;
        this.renderFlowchart(this.rootData);
        this.updateUndoRedoButtons();
        this.autosave();
    }

    moveNodeTo(movingD, newParentD) {
        if (movingD === newParentD || movingD.descendants().includes(newParentD)) {
            return;
        }

        this.pushUndo();
        
        const movingData = movingD.data;
        const parent = movingD.parent;
        
        if (parent) {
            parent.data.children = (parent.data.children || []).filter(child => child !== movingData);
            if (parent.data.children.length === 0) {
                delete parent.data.children;
            } else {
                const children = parent.data.children;
                for (let i = children.length - 2; i >= 0; i--) {
                    if (this.isPlaceholderNodeData(children[i])) {
                        children.splice(i, 1);
                    }
                }
                const lastChild = children[children.length - 1];
                if (!this.isPlaceholderNodeData(lastChild) && lastChild.name && lastChild.name.trim()) {
                    children.push(this.createPlaceholderNode());
                }
            }
        }
        
        if (!newParentD.data.children) {
            newParentD.data.children = [];
        }
        
        const newChildren = newParentD.data.children;
        if (newChildren.length > 0) {
            const lastChild = newChildren[newChildren.length - 1];
            if (this.isPlaceholderNodeData(lastChild)) {
                newChildren.pop();
            }
        }
        
        newParentD.data.children.push(movingData);
        newParentD.data.children.push(this.createPlaceholderNode());
        
        this.ensureRightmostPlaceholderNodes(this.rootData);
        this.updateSimplifyPrefixes(d3.hierarchy(this.rootData));
        
        this.renderFlowchart(this.rootData);
        this.updateUndoRedoButtons();
        this.hideNodeEditPopup(false);
        const renderedNode = this.findRenderedNode(movingData);
        if (renderedNode) {
            this.centerNodeOnMobile(renderedNode, () => {});
        }
        this.autosave();
    }

    addChildNode(d) {
        this.pushUndo();
        if (!d.data.children) d.data.children = [];
        let baseName = "New Node";
        let idx = 1;
        let siblingNames = (d.data.children || []).map(child => child.name);
        let newName = baseName;
        while (siblingNames.includes(newName)) {
            newName = `${baseName} ${idx++}`;
        }
        const newChild = { name: newName, color: '#00a67e' };
        const children = d.data.children;
        const placeholderIndex = children.reduce((lastIndex, child, index) => {
            if (this.isPlaceholderNodeData(child) || !(child.name || '').trim()) {
                return index;
            }
            return lastIndex;
        }, -1);

        if (placeholderIndex !== -1) {
            children.splice(placeholderIndex, 0, newChild);
        } else {
            children.push(newChild);
        }

        this.renderFlowchart(this.rootData);
        this.updateUndoRedoButtons();
        this.autosave();

        const renderedNode = this.findRenderedNode(newChild);
        if (renderedNode) this.centerNodeOnMobile(renderedNode, () => {});

        return newChild;
    }

    addParentNode(d) {
        this.pushUndo();
        const oldData = d.data;
        const parent = d.parent;
        const newParent = { name: '', color: '#00a67e' };
        newParent.children = [oldData];

        if (parent) {
            const siblings = parent.data.children || [];
            const idx = siblings.indexOf(oldData);
            if (idx !== -1) {
                siblings[idx] = newParent;
            } else {
                siblings.push(newParent);
            }
            parent.data.children = siblings;
        } else {
            this.rootData = newParent;
        }

        this._pendingEditData = newParent;
        this.renderFlowchart(this.rootData);
        let found = null;
        d3.hierarchy(this.rootData).each(node => {
            if (node.data === newParent) found = node;
        });
        if (found) {
            const renderedNode = this.findRenderedNode(newParent) || found;
            this.centerNodeOnMobile(renderedNode, () => {
                this.showNodeEditPopup(found);
                this.nodeEditInput.value = '';
                this.resizeNodeEditInput();
                this.nodeEditInput.focus();
                this.nodeEditInput.select();
            });
        }
        this.updateUndoRedoButtons();
        this.autosave();
        return newParent;
    }

    duplicateNodeToParentSiblings(d) {
        if (!d || !d.parent) {
            alert('Cannot duplicate: node has no parent.');
            return;
        }
        const parent = d.parent;
        const grandparent = parent.parent;
        if (!grandparent) {
            alert('Cannot duplicate: parent has no siblings to duplicate to.');
            return;
        }

        this.pushUndo();

        const nodeCopy = {};
        for (const key in d.data) {
            if (key === 'children') continue;
            nodeCopy[key] = JSON.parse(JSON.stringify(d.data[key]));
        }

        const siblings = (grandparent.data.children || []).filter(child => child !== parent.data);
        siblings.forEach(sibData => {
            if (!sibData.children) sibData.children = [];
            const newNode = JSON.parse(JSON.stringify(nodeCopy));
            const existingNames = sibData.children.map(c => c.name);
            let baseName = newNode.name || 'New Node';
            let newName = baseName;
            let idx = 1;
            while (existingNames.includes(newName)) {
                newName = `${baseName} ${idx++}`;
            }
            newNode.name = newName;
            sibData.children.push(newNode);
        });

        this.renderFlowchart(this.rootData);
        this.updateUndoRedoButtons();
        this.autosave();
    }

    addSiblingNode(d, direction) {
        if (!d.parent) {
            alert('Cannot add a sibling to the root node.');
            return null;
        }
        this.pushUndo();
        const parent = d.parent;
        if (!parent.data.children) parent.data.children = [];
        const siblings = parent.data.children;
        // Siblings start out empty (placeholder styling) - only newly spawned *child*
        // nodes default to green (see addChildNode). Deliberately NOT built via
        // createPlaceholderNode()/_isPlaceholder: that flag means "hideable decorative
        // stub", which is right for the automatic trailing "add new" placeholder
        // (ensureRightmostPlaceholderNodes) but wrong here - this node exists because
        // the person explicitly asked to add a sibling and is about to type into it, so
        // it must stay visible even with "Hide Placeholders" on. It still starts out
        // blank and placeholder-*colored* purely for the visual "click to fill in" look
        // (saveNodeEdit resets that color once a real name is typed in).
        const newSibling = { name: '', color: this.getPlaceholderColor() };
        const idxPos = siblings.indexOf(d.data);
        const insertAt = direction < 0 ? idxPos : idxPos + 1;
        siblings.splice(insertAt, 0, newSibling);
        this._pendingEditData = newSibling;
        this.renderFlowchart(this.rootData);
        let found = null;
        d3.hierarchy(this.rootData).each(node => {
            if (node.data === newSibling) found = node;
        });
        if (found) {
            const renderedNode = this.findRenderedNode(newSibling) || found;
            this.centerNodeOnMobile(renderedNode, () => this.showNodeEditPopup(found));
        }
        this.updateUndoRedoButtons();
        this.autosave();
        return newSibling;
    }

    deleteNodeAndPromoteChildren(d) {
        if (!d.parent) {
            alert('Cannot delete the root node.');
            return;
        }
        this.pushUndo();
        const parent = d.parent;
        const siblings = parent.data.children || [];
        const idx = siblings.indexOf(d.data);
        const children = d.data.children || [];
        if (idx !== -1) {
            siblings.splice(idx, 1);
            if (children.length > 0) {
                siblings.splice(idx, 0, ...children);
            }
        }
        if (parent.data.children && parent.data.children.length === 0) delete parent.data.children;
        this.customConnections = this.customConnections.filter(conn => conn.source !== d.data && conn.target !== d.data);
        this.renderFlowchart(this.rootData);
        this.updateUndoRedoButtons();
        this.autosave();
    }

    deleteNode(d) {
        if (!d.parent) {
            alert("Cannot delete the root node.");
            return;
        }
        this.pushUndo();
        const parent = d.parent;
        parent.data.children = (parent.data.children || []).filter(child => child !== d.data);
        if (parent.data.children.length === 0) delete parent.data.children;
        this.customConnections = this.customConnections.filter(conn =>
            conn.source !== d.data && conn.target !== d.data
        );
        this.renderFlowchart(this.rootData);
        this.updateUndoRedoButtons();
        this.autosave();
    }

    getNodeNameFromInput(color = null) {
        let name = (this.nodeEditInput.value || '').trim();
        if (name.startsWith('Assumption: ')) {
            name = name.substring('Assumption: '.length);
        }
        if (name.endsWith(' (Simplify?)')) {
            name = name.substring(0, name.length - ' (Simplify?)'.length);
        }
        if (color === '#e75480') {
            name = 'Assumption: ' + name;
        }
        return name;
    }

    // Grows the node-edit textarea to fit however many lines the wrapped text now
    // takes, so the box expands downward instead of scrolling internally.
    resizeNodeEditInput() {
        const el = this.nodeEditInput;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = (el.scrollHeight + 2) + 'px';
    }

    showNodeEditPopup(d) {
        if (!d || !d.data) return;

        this.nodeBeingEdited = d;
        // nodeBeingEdited now covers keeping this node visible (see childrenAccessor);
        // the pending-data flag was only needed to bridge the gap between creating the
        // node and this popup actually opening for it.
        if (this._pendingEditData === d.data) this._pendingEditData = null;
        this._suppressPopupHide = false;
        
        // Get the display name without prefixes/suffixes
        let displayName = d.data.name || '';
        
        // Remove "Assumption: " prefix if present
        if (displayName.startsWith('Assumption: ')) {
            displayName = displayName.substring('Assumption: '.length);
        }
        
        // Remove " (Simplify?)" suffix if present
        if (displayName.endsWith(' (Simplify?)')) {
            displayName = displayName.substring(0, displayName.length - ' (Simplify?)'.length);
        }
        
        this.nodeEditInput.value = displayName;
        this.resizeNodeEditInput();
        setTimeout(() => {
            try { this.nodeEditInput.select(); } catch (e) { /* ignore */ }
        }, 0);
        
        let colorBtns = document.getElementById('node-color-btns');
        if (!colorBtns) {
            colorBtns = document.createElement('div');
            colorBtns.id = 'node-color-btns';
            colorBtns.style.display = 'flex';
            colorBtns.style.gap = '10px';
            colorBtns.style.marginBottom = '10px';
            colorBtns.style.justifyContent = 'center';
            colorBtns.style.flexWrap = 'wrap';
            
            const greenBtn = document.createElement('button');
            greenBtn.textContent = 'Green';
            greenBtn.style.background = '#00a67e';
            greenBtn.style.color = 'white';
            greenBtn.style.border = 'none';
            greenBtn.style.borderRadius = '5px';
            greenBtn.style.padding = '6px 16px';
            greenBtn.style.cursor = 'pointer';
            greenBtn.onmousedown = (e) => e.preventDefault();
            greenBtn.onclick = () => {
                if (this.nodeBeingEdited) {
                    this._suppressPopupHide = true;
                    this.pushUndo();
                    if (this.isPlaceholderNodeData(this.nodeBeingEdited.data)) {
                        this.markNodeAsReal(this.nodeBeingEdited.data);
                    }
                    const currentNode = this.nodeBeingEdited;
                    currentNode.data.name = this.getNodeNameFromInput('#00a67e');
                    currentNode.data.color = '#00a67e';
                    this.ensureRightmostPlaceholderNodes(this.rootData);
                    this.updateSimplifyPrefixes(d3.hierarchy(this.rootData));
                    this.renderFlowchart(this.rootData);
                    this._suppressPopupHide = false;
                    this.updateReflectionPanel(currentNode);
                    this.hideNodeEditPopup(false);
                    this.autosave();
                }
            };
            
            const pinkBtn = document.createElement('button');
            pinkBtn.textContent = 'Pink';
            pinkBtn.style.background = '#e75480';
            pinkBtn.style.color = 'white';
            pinkBtn.style.border = 'none';
            pinkBtn.style.borderRadius = '5px';
            pinkBtn.style.padding = '6px 16px';
            pinkBtn.style.cursor = 'pointer';
            pinkBtn.onmousedown = (e) => e.preventDefault();
            pinkBtn.onclick = () => {
                if (this.nodeBeingEdited) {
                    this._suppressPopupHide = true;
                    this.pushUndo();
                    if (this.isPlaceholderNodeData(this.nodeBeingEdited.data)) {
                        this.markNodeAsReal(this.nodeBeingEdited.data);
                    }
                    const currentNode = this.nodeBeingEdited;
                    currentNode.data.name = this.getNodeNameFromInput('#e75480');
                    currentNode.data.color = '#e75480';
                    this.ensureRightmostPlaceholderNodes(this.rootData);
                    this.updateSimplifyPrefixes(d3.hierarchy(this.rootData));
                    this.renderFlowchart(this.rootData);
                    this._suppressPopupHide = false;
                    this.updateReflectionPanel(currentNode);
                    this.hideNodeEditPopup(false);
                    this.autosave();
                }
            };
            
            const blueBtn = document.createElement('button');
            blueBtn.textContent = 'Blue';
            blueBtn.style.background = '#0074d9';
            blueBtn.style.color = 'white';
            blueBtn.style.border = 'none';
            blueBtn.style.borderRadius = '5px';
            blueBtn.style.padding = '6px 16px';
            blueBtn.style.cursor = 'pointer';
            blueBtn.onmousedown = (e) => e.preventDefault();
            blueBtn.onclick = () => {
                if (this.nodeBeingEdited) {
                    this._suppressPopupHide = true;
                    this.pushUndo();
                    if (this.isPlaceholderNodeData(this.nodeBeingEdited.data)) {
                        this.markNodeAsReal(this.nodeBeingEdited.data);
                    }
                    const currentNode = this.nodeBeingEdited;
                    currentNode.data.name = this.getNodeNameFromInput('#0074d9');
                    currentNode.data.color = '#0074d9';
                    this.ensureRightmostPlaceholderNodes(this.rootData);
                    this.updateSimplifyPrefixes(d3.hierarchy(this.rootData));
                    this.renderFlowchart(this.rootData);
                    this._suppressPopupHide = false;
                    this.updateReflectionPanel(currentNode);
                    this.hideNodeEditPopup(false);
                    this.autosave();
                }
            };
            
            const yellowBtn = document.createElement('button');
            yellowBtn.textContent = 'Yellow';
            yellowBtn.style.background = '#ffcc00';
            yellowBtn.style.color = 'black';
            yellowBtn.style.border = 'none';
            yellowBtn.style.borderRadius = '5px';
            yellowBtn.style.padding = '6px 16px';
            yellowBtn.style.cursor = 'pointer';
            yellowBtn.onmousedown = (e) => e.preventDefault();
            yellowBtn.onclick = () => {
                if (this.nodeBeingEdited) {
                    this._suppressPopupHide = true;
                    this.pushUndo();
                    if (this.isPlaceholderNodeData(this.nodeBeingEdited.data)) {
                        this.markNodeAsReal(this.nodeBeingEdited.data);
                    }
                    const currentNode = this.nodeBeingEdited;
                    currentNode.data.name = this.getNodeNameFromInput('#ffcc00');
                    currentNode.data.color = '#ffcc00';
                    this.ensureRightmostPlaceholderNodes(this.rootData);
                    this.updateSimplifyPrefixes(d3.hierarchy(this.rootData));
                    this.renderFlowchart(this.rootData);
                    this._suppressPopupHide = false;
                    this.updateReflectionPanel(currentNode);
                    this.hideNodeEditPopup(false);
                    this.autosave();
                }
            };
            
            const emptyBtn = document.createElement('button');
            emptyBtn.textContent = 'Empty';
            emptyBtn.style.background = '#323a4a';
            emptyBtn.style.color = 'white';
            emptyBtn.style.border = 'none';
            emptyBtn.style.borderRadius = '5px';
            emptyBtn.style.padding = '6px 16px';
            emptyBtn.style.cursor = 'pointer';
            emptyBtn.onmousedown = (e) => e.preventDefault();
            emptyBtn.onclick = () => {
                if (this.nodeBeingEdited) {
                    this._suppressPopupHide = true;
                    this.pushUndo();
                    const currentNode = this.nodeBeingEdited;
                    currentNode.data.color = this.getPlaceholderColor();
                    currentNode.data.name = '';
                    currentNode.data._isPlaceholder = true;
                    this.ensureRightmostPlaceholderNodes(this.rootData);
                    this.updateSimplifyPrefixes(d3.hierarchy(this.rootData));
                    this.renderFlowchart(this.rootData);
                    this._suppressPopupHide = false;
                    this.updateReflectionPanel(currentNode);
                    this.hideNodeEditPopup(false);
                    this.autosave();
                }
            };
            
            colorBtns.appendChild(greenBtn);
            colorBtns.appendChild(pinkBtn);
            colorBtns.appendChild(blueBtn);
            colorBtns.appendChild(yellowBtn);
            colorBtns.appendChild(emptyBtn);
            this.nodeEditPopup.insertBefore(colorBtns, this.nodeEditPopup.firstChild);

            // Second row: quick-add this node's name into the Pugh Matrix as either a
            // solution (column) or a criteria (row), for people who'd rather build the
            // matrix from the tree than type everything into it separately.
            const pughAddRow = document.createElement('div');
            pughAddRow.id = 'node-pugh-add-row';
            pughAddRow.style.display = 'flex';
            pughAddRow.style.gap = '8px';
            pughAddRow.style.marginTop = '8px';

            const addSolutionBtn = document.createElement('button');
            addSolutionBtn.textContent = '📊 Add Solution';
            addSolutionBtn.type = 'button';
            addSolutionBtn.style.flex = '1';
            addSolutionBtn.style.background = 'var(--control-bg)';
            addSolutionBtn.style.color = 'var(--text)';
            addSolutionBtn.style.border = '1px solid var(--border)';
            addSolutionBtn.style.borderRadius = '5px';
            addSolutionBtn.style.padding = '6px 10px';
            addSolutionBtn.style.cursor = 'pointer';
            addSolutionBtn.onmousedown = (e) => e.preventDefault();
            addSolutionBtn.onclick = () => this.addNodeToPugh('solution');

            const addCriteriaBtn = document.createElement('button');
            addCriteriaBtn.textContent = '📊 Add Criteria';
            addCriteriaBtn.type = 'button';
            addCriteriaBtn.style.flex = '1';
            addCriteriaBtn.style.background = 'var(--control-bg)';
            addCriteriaBtn.style.color = 'var(--text)';
            addCriteriaBtn.style.border = '1px solid var(--border)';
            addCriteriaBtn.style.borderRadius = '5px';
            addCriteriaBtn.style.padding = '6px 10px';
            addCriteriaBtn.style.cursor = 'pointer';
            addCriteriaBtn.onmousedown = (e) => e.preventDefault();
            addCriteriaBtn.onclick = () => this.addNodeToPugh('criteria');

            pughAddRow.appendChild(addSolutionBtn);
            pughAddRow.appendChild(addCriteriaBtn);
            this.nodeEditPopup.insertBefore(pughAddRow, colorBtns.nextSibling);
        }
        
        Array.from(colorBtns.children).forEach(btn => {
            if (btn.textContent === 'Green' && d.data.color === '#00a67e') {
                btn.style.outline = '2px solid #00a67e';
            } else if (btn.textContent === 'Pink' && d.data.color === '#e75480') {
                btn.style.outline = '2px solid #e75480';
            } else if (btn.textContent === 'Blue' && d.data.color === '#0074d9') {
                btn.style.outline = '2px solid #0074d9';
            } else if (btn.textContent === 'Yellow' && d.data.color === '#ffcc00') {
                btn.style.outline = '2px solid #ffcc00';
            } else if (btn.textContent === 'Empty' && this.isPlaceholderNodeData(d.data)) {
                btn.style.outline = '2px solid #323a4a';
            } else {
                btn.style.outline = 'none';
            }
        });

        this.nodeEditPopup.style.display = 'block';
        // The textarea must be visible (display:block on the popup) before scrollHeight
        // reflects real content, so resize here rather than only right after setting .value.
        this.resizeNodeEditInput();

        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        // Default view: desktop shows the reflection panel (if any) automatically
        // alongside this popup, as it always has. Mobile defaults to the node edit menu
        // (this popup + the radial popup buttons on the canvas); the toggle button
        // switches to the reflection/question-boxes view instead, when available.
        this._reflectionPanelActive = !isMobile;
        this.nodeEditInput.focus();
        this.nodeEditInput.select();

        this.positionNodeEditPopupForMobile();
        this.updateReflectionPanel(d);
    }

    // On mobile, positions the node edit popup's top edge halfway between the center of
    // the top half of the screen (25% - where the node is centered, see
    // centerNodeOnMobile) and the vertical midline (50%), i.e. 37.5% down the screen,
    // then nudges it down by one popup button's height (40px, matching btnHeight in
    // refreshRadialButtons) for extra clearance from the node/buttons above. This keeps
    // it clear of the node above without depending on the keyboard's actual height.
    positionNodeEditPopupForMobile() {
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        if (!isMobile) {
            // Desktop: keep the popup centered on the window (not "snapped" to wherever
            // the clicked node happens to be), and clear of the bottom-right control
            // buttons (Undo, Reset View, Export, etc.) - those wrap onto more rows the
            // narrower the window gets, so their height is measured live instead of
            // assuming a fixed offset.
            this.nodeEditPopup.style.position = 'fixed';
            this.nodeEditPopup.style.left = '50%';
            this.nodeEditPopup.style.transform = 'translateX(-50%)';
            this.nodeEditPopup.style.top = '';
            this.nodeEditPopup.style.maxHeight = '';

            let clearance = 80;
            if (this.resetViewBtn) {
                const controlsEl = this.resetViewBtn.closest('.reset-view-controls');
                if (controlsEl) {
                    const rect = controlsEl.getBoundingClientRect();
                    if (rect.height > 0) {
                        clearance = (window.innerHeight - rect.top) + 20;
                    }
                }
            }
            this.nodeEditPopup.style.bottom = clearance + 'px';
            return;
        }

        this.nodeEditPopup.style.position = 'absolute';
        this.nodeEditPopup.style.left = '50%';
        this.nodeEditPopup.style.transform = 'translateX(-50%)';

        const POPUP_BTN_HEIGHT = 40;
        const viewportHeight = window.innerHeight;
        const topPosition = (viewportHeight * 0.375) + POPUP_BTN_HEIGHT;

        this.nodeEditPopup.style.top = topPosition + 'px';
        this.nodeEditPopup.style.bottom = 'auto';
        this.nodeEditPopup.style.maxHeight = Math.max(120, viewportHeight - topPosition - 20) + 'px';
    }

    // Updates one node's on-screen text/box directly, without touching any other DOM
    // element or rebinding the zoom behavior. Used when a text edit is saved mid-pan,
    // where a full renderFlowchart (which tears down and rebuilds the whole SVG) would
    // disrupt the active gesture. This only fixes up the edited node itself - any
    // knock-on layout changes (siblings shifting, etc.) are corrected by the real
    // renderFlowchart once the gesture ends.
    quickPatchNodeText(d) {
        if (!d || !d.data) return;
        const selectedData = d.data;
        const nodeEls = d3.selectAll('#flowchart .node');
        if (nodeEls.empty()) return;
        let targetEl = null;
        nodeEls.each(function(nd) {
            if (nd && nd.data === selectedData) targetEl = this;
        });
        if (!targetEl) return;

        const NODE_WIDTH = this.NODE_WIDTH;
        const LINE_HEIGHT = 18;
        const PADDING_Y = 12;
        const FONT_SIZE = 13;
        const FONT_FAMILY = 'Arial, sans-serif';

        const measureTextWidth = (text) => {
            const tempSvg = d3.select('body').append('svg')
                .attr('style', 'position:absolute;left:-9999px;top:-9999px');
            const tempText = tempSvg.append('text')
                .attr('font-size', FONT_SIZE)
                .attr('font-family', FONT_FAMILY)
                .text(text);
            const width = tempText.node().getComputedTextLength();
            tempSvg.remove();
            return width;
        };

        const rawName = selectedData.name || '';
        const words = rawName.split(/(\s+)/);
        let lines = [];
        let current = '';
        words.forEach(word => {
            const testLine = (current + word).trim();
            if (testLine && measureTextWidth(testLine) > NODE_WIDTH - 16) {
                if (current) lines.push(current.trim());
                current = word.trim();
            } else {
                current += word;
            }
        });
        if (current.trim()) lines.push(current.trim());
        const finalLines = lines.length ? lines : [rawName || ''];
        d._lines = finalLines;

        const g = d3.select(targetEl);
        const rectHeight = finalLines.length * LINE_HEIGHT + PADDING_Y;
        g.select('rect')
            .attr('height', rectHeight)
            .attr('y', -(rectHeight / 2));

        const text = g.select('text');
        text.selectAll('tspan').remove();
        finalLines.forEach((line, i, arr) => {
            text.append('tspan')
                .attr('x', 0)
                .attr('y', (i - (arr.length - 1) / 2) * LINE_HEIGHT + 4)
                .text(line);
        });
        if (selectedData._collapsed) {
            if (this.orientation === 'LR') {
                text.append('tspan')
                    .attr('x', NODE_WIDTH / 2 + 16)
                    .attr('y', 4)
                    .attr('fill', '#ffffff')
                    .attr('font-size', FONT_SIZE + 3)
                    .text('▶');
            } else {
                text.append('tspan')
                    .attr('x', 0)
                    .attr('y', finalLines.length * LINE_HEIGHT / 2 + 25)
                    .attr('fill', '#ffffff')
                    .attr('font-size', FONT_SIZE + 3)
                    .text('▼');
            }
        }
    }

    saveNodeEdit(deferRender = false) {
        if (!this.nodeBeingEdited) return;
        const originalData = this.nodeBeingEdited.data;
        const wasPlaceholderLook = this.isPlaceholderNodeData(originalData) || originalData.color === this.getPlaceholderColor();
        const isRootPlaceholder = this.isRootPlaceholderNode(this.nodeBeingEdited);
        let newName = this.getNodeNameFromInput(originalData.color);

        // If the field reads back empty (e.g. a just-created node whose input we
        // deliberately cleared for typing, then the user panned away before typing
        // anything) don't blank out its name - keep whatever it already was.
        if (!newName.trim() && originalData.name && originalData.name.trim()) {
            newName = originalData.name;
        }

        // Add " (Simplify?)" suffix for green leaf nodes (only once there's an actual
        // name - otherwise a freshly created, not-yet-typed-into node would end up
        // saved as the broken " (Simplify?)" with no real name at all).
        if (newName.trim() && this.isLeafNode(this.nodeBeingEdited) && this.isGreenNode(this.nodeBeingEdited)) {
            newName = newName + ' (Simplify?)';
        }

        const nameChanged = newName !== originalData.name;
        const needsWrap = isRootPlaceholder && originalData.color !== this.getPlaceholderColor();

        if (nameChanged || needsWrap) {
            this.pushUndo();
            // markNodeAsReal is a no-op on a node that was never placeholder-flagged or
            // placeholder-colored, so it's safe to call any time the name actually
            // changed - this also catches a newly created sibling that starts out
            // *looking* like a placeholder (blank name, placeholder-gray color) without
            // necessarily carrying the _isPlaceholder flag itself, so its color still
            // resets to green once a real name is typed in.
            if (wasPlaceholderLook) {
                this.markNodeAsReal(originalData);
            }
            originalData.name = newName;
            if (needsWrap) {
                this.rootData = this.wrapRootWithPlaceholder(this.rootData);
            }
            this.ensureRightmostPlaceholderNodes(this.rootData);
            this.updateSimplifyPrefixes(d3.hierarchy(this.rootData));
            if (deferRender) {
                // Recreating the SVG right now would break an in-progress pan/zoom
                // gesture's pointer tracking (causing the next gesture to jump), so hold
                // off until the gesture actually finishes (see the zoom behavior's 'end'
                // handler). The data above is already fully committed either way; patch
                // the node's on-screen text immediately so the edit is visible right
                // away instead of only after the pan ends.
                this._deferredRenderPending = true;
                try {
                    this.quickPatchNodeText(this.nodeBeingEdited);
                } catch (err) {
                    console.error('Error patching node text in place:', err);
                }
            } else {
                const editedRef = this.nodeBeingEdited;
                this.renderFlowchart(this.rootData);
                if (!this.nodeBeingEdited) {
                    this.nodeBeingEdited = editedRef;
                }
            }
        }
        this.autosave();
        this.hideContextMenu();
    }

    moveNodeInSiblings(d, direction) {
        if (!d.parent) return;
        const siblings = d.parent.data.children;
        const idx = siblings.indexOf(d.data);
        if (idx === -1) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= siblings.length) return;
        this.pushUndo();
        [siblings[idx], siblings[newIdx]] = [siblings[newIdx], siblings[idx]];
        this.renderFlowchart(this.rootData);
        let found = null;
        d3.hierarchy(this.rootData).each(node => {
            if (node.data === d.data) found = node;
        });
        if (found) {
            const renderedNode = this.findRenderedNode(d.data) || found;
            this.centerNodeOnMobile(renderedNode, () => this.showNodeEditPopup(found));
        }
        this.autosave();
    }

    hideNodeEditPopup(save = true, deferRender = false) {
        this._pendingNodeSave = false;
        if (save) this.saveNodeEdit(deferRender);
        this.nodeEditPopup.style.display = 'none';
        this.nodeBeingEdited = null;
        this._suppressPopupHide = false;
        const colorBtns = document.getElementById('node-color-btns');
        if (colorBtns) colorBtns.remove();
        this.applyMobileViewState();
    }

    // Resolves a node's raw data object back to its currently-rendered hierarchy node -
    // the one bound to the actual DOM element, which has real .x/.y coordinates from the
    // last layout pass. A fresh d3.hierarchy(this.rootData) call, by contrast, builds new
    // node wrappers with no coordinates at all (no layout algorithm has run on them),
    // which is only safe to use for their .data - never for positioning.
    findRenderedNode(nodeData) {
        if (!nodeData) return null;
        let found = null;
        d3.selectAll('#flowchart .node').each(function(nd) {
            if (nd && nd.data === nodeData) found = nd;
        });
        return found;
    }

    // Returns the guided question set for a node's current color, or null if the node
    // isn't an Assumption (pink) or Simplify (green) node.
    getReflectionQuestions(nodeData) {
        if (!nodeData) return null;
        if (nodeData.color === '#e75480') return this.ASSUMPTION_QUESTIONS;
        if (nodeData.color === '#00a67e') return this.SIMPLIFY_QUESTIONS;
        return null;
    }

    // Wires up the reflection panel's close button, drag-to-resize handle (desktop), and
    // mobile full-screen toggle button. Called once from the constructor.
    setupReflectionPanel() {
        if (this.reflectionPanelClose) {
            this.reflectionPanelClose.addEventListener('click', () => this.hideReflectionPanel());
        }

        if (this.notesUnfoldBtn) {
            this.notesUnfoldBtn.addEventListener('click', () => this.unfoldNotesSection());
        }

        if (this.reflectionPanelBackBtn) {
            this.reflectionPanelBackBtn.addEventListener('click', () => this.toggleMobileFieldsVisibility());
        }

        if (this.reflectionPanelResizeHandle) {
            let dragging = false;
            let startX = 0;
            let startWidth = 0;
            const onMove = (clientX) => {
                if (!dragging) return;
                const delta = clientX - startX;
                const maxWidth = window.innerWidth * 0.8;
                const newWidth = Math.max(220, Math.min(startWidth + delta, maxWidth));
                this._reflectionPanelWidth = newWidth;
                this.reflectionPanel.style.width = newWidth + 'px';
                this.updateStickyAncestors();
            };
            const onEnd = () => {
                if (!dragging) return;
                dragging = false;
                document.body.style.userSelect = '';
                localStorage.setItem('reflection-panel-width', String(this._reflectionPanelWidth));
            };
            this.reflectionPanelResizeHandle.addEventListener('mousedown', (e) => {
                dragging = true;
                startX = e.clientX;
                startWidth = this.reflectionPanel.getBoundingClientRect().width;
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });
            window.addEventListener('mousemove', (e) => onMove(e.clientX));
            window.addEventListener('mouseup', onEnd);
            this.reflectionPanelResizeHandle.addEventListener('touchstart', (e) => {
                dragging = true;
                startX = e.touches[0].clientX;
                startWidth = this.reflectionPanel.getBoundingClientRect().width;
            }, { passive: true });
            window.addEventListener('touchmove', (e) => {
                if (!dragging) return;
                // Non-passive so preventDefault can stop the browser from claiming this
                // as a page scroll/swipe gesture based on the drag's initial direction
                // (see the equivalent fix on the notes resize handle for the same bug).
                e.preventDefault();
                onMove(e.touches[0].clientX);
            }, { passive: false });
            window.addEventListener('touchend', onEnd);
        }
    }

    // Shows/updates/hides the reflection panel for whichever node was just
    // opened/selected. Called from showNodeEditPopup so it tracks node selection.
    // Turns a plain textarea into an auto-bulleting, auto-growing list: every line gets
    // a leading bullet, Enter starts a new bulleted line instead of a bare newline, and
    // the box grows taller to fit its content instead of scrolling internally.
    resizeReflectionAnswer(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight + 2) + 'px';
    }

    setupBulletAnswerTextarea(textarea, onChange) {
        const BULLET = '\u2022 ';

        const ensureLeadingBullet = () => {
            if (textarea.value && !textarea.value.startsWith('\u2022')) {
                const cursor = textarea.selectionStart;
                textarea.value = BULLET + textarea.value;
                textarea.selectionStart = textarea.selectionEnd = cursor + BULLET.length;
            }
        };

        // Collapses however many spaces follow the bullet on the current line down to
        // exactly one, so there's always a single space between the bullet and the text
        // no matter how many spaces were typed or pasted in.
        const normalizeCurrentLineSpacing = () => {
            const value = textarea.value;
            const cursor = textarea.selectionStart;
            const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
            let lineEnd = value.indexOf('\n', cursor);
            if (lineEnd === -1) lineEnd = value.length;
            const line = value.slice(lineStart, lineEnd);
            const match = line.match(/^\u2022( *)/);
            if (match && match[1].length !== 1) {
                const rebuilt = BULLET + line.slice(match[0].length);
                const delta = rebuilt.length - line.length;
                textarea.value = value.slice(0, lineStart) + rebuilt + value.slice(lineEnd);
                textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, cursor + delta);
            }
        };

        textarea.addEventListener('focus', () => {
            if (!textarea.value) {
                textarea.value = BULLET;
                textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
            } else {
                ensureLeadingBullet();
            }
            this.resizeReflectionAnswer(textarea);
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const insertion = '\n' + BULLET;
                textarea.value = textarea.value.slice(0, start) + insertion + textarea.value.slice(end);
                const newPos = start + insertion.length;
                textarea.selectionStart = textarea.selectionEnd = newPos;
                this.resizeReflectionAnswer(textarea);
                onChange(textarea.value);
            }
        });

        textarea.addEventListener('input', () => {
            ensureLeadingBullet();
            normalizeCurrentLineSpacing();
            this.resizeReflectionAnswer(textarea);
            onChange(textarea.value);
        });
    }

    // Turns a plain textarea into a bulleted outline editor, the way Word's
    // multilevel lists behave: every line gets a bullet matching its indent depth
    // (•, then ◦, then ▪, cycling for deeper levels), Enter starts a new line at the
    // same indent level with the matching bullet already in place, and Tab/Shift+Tab
    // indent/dedent the current line - or every line touched by the selection - one
    // level at a time, updating each line's bullet to match its new depth.
    setupIndentableTextarea(textarea, onChange) {
        const INDENT = '        '; // 8 spaces per indent level (doubled from 4)
        const BULLETS = ['\u2022', '\u25E6', '\u25AA']; // •, ◦, ▪ - cycles for deeper levels
        const bulletFor = (level) => BULLETS[level % BULLETS.length];

        // Finds where the line containing `pos` starts. Plain `value.lastIndexOf('\n',
        // pos - 1) + 1` looks equivalent but has a boundary bug at pos === 0: with a
        // negative fromIndex, lastIndexOf clamps to searching only index 0 itself, and
        // since the notes box always starts with a mandatory blank line (value[0] ===
        // '\n'), that lookup finds *that* newline and incorrectly returns 1 - as if the
        // cursor were on the second line - rather than 0, which is where the actual
        // (empty) first line starts. This one helper is used everywhere a line start is
        // needed so that boundary case only has to be handled correctly once.
        const getLineStart = (value, pos) => {
            if (pos <= 0) return 0;
            return value.lastIndexOf('\n', pos - 1) + 1;
        };

        // Breaks a line into how many indent levels of leading INDENT it has, how
        // many characters that indent + bullet + trailing space take up, and the
        // actual text content after that.
        const parseLine = (line) => {
            let level = 0;
            let rest = line;
            while (rest.startsWith(INDENT)) {
                rest = rest.slice(INDENT.length);
                level++;
            }
            const indentLen = line.length - rest.length;
            let bulletLen = 0;
            for (const b of BULLETS) {
                if (rest.startsWith(b)) {
                    // Consume the bullet plus *every* trailing space, not just one - this
                    // is what lets us always rebuild the line with exactly one space
                    // between the bullet and its text (see buildLine), collapsing any
                    // extra spaces the person typed instead of leaving them in the content.
                    let consumed = b.length;
                    while (rest[consumed] === ' ') consumed++;
                    if (consumed > b.length) bulletLen = consumed;
                    break;
                }
            }
            const hasBullet = bulletLen > 0;
            // A line with no bullet is plain text (e.g. the mandatory blank first line,
            // or any line whose bullet was just removed via Backspace) - report it as
            // level 0 with no prefix and the whole line as its content, rather than
            // treating stray leading spaces as a bullet's indent.
            if (!hasBullet) {
                return { level: 0, hasBullet: false, prefixLen: 0, content: line };
            }
            return { level, hasBullet: true, prefixLen: indentLen + bulletLen, content: rest.slice(bulletLen) };
        };

        const buildLine = (level, content) => INDENT.repeat(level) + bulletFor(level) + ' ' + content;

        // Rebuilds just the line the cursor is currently on through parseLine/buildLine,
        // which both enforces a single space after the bullet and re-derives the bullet
        // glyph from the line's (possibly just-changed) indent level. Keeps the cursor
        // anchored relative to the content rather than the raw character offset, so
        // collapsing extra spaces doesn't make the cursor jump somewhere unexpected.
        // Plain (bulletless) lines are left untouched - there's no bullet spacing to fix.
        const normalizeCurrentLineSpacing = () => {
            const value = textarea.value;
            const cursor = textarea.selectionStart;
            const lineStart = getLineStart(value, cursor);
            let lineEnd = value.indexOf('\n', cursor);
            if (lineEnd === -1) lineEnd = value.length;
            const line = value.slice(lineStart, lineEnd);
            const parsed = parseLine(line);
            if (!parsed.hasBullet) return;
            const rebuilt = buildLine(parsed.level, parsed.content);
            if (rebuilt !== line) {
                const delta = rebuilt.length - line.length;
                textarea.value = value.slice(0, lineStart) + rebuilt + value.slice(lineEnd);
                const newCursor = Math.max(lineStart, cursor + delta);
                textarea.selectionStart = textarea.selectionEnd = newCursor;
            }
        };

        // The notes box always keeps a blank line pinned at the very top, above
        // anything the person writes, so their content never starts on line 1 itself.
        const ensureBlankFirstLine = () => {
            if (!textarea.value.startsWith('\n')) {
                const cursor = textarea.selectionStart;
                textarea.value = '\n' + textarea.value;
                textarea.selectionStart = textarea.selectionEnd = cursor + 1;
            }
        };

        textarea.addEventListener('focus', () => {
            ensureBlankFirstLine();
            this.resizeReflectionAnswer(textarea);
        });

        textarea.addEventListener('keydown', (e) => {
            const value = textarea.value;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;

            // Never allow deleting the mandatory blank first line - the box should
            // always open with an empty line at the top, so backspacing at the very
            // start of the second line (right up against that boundary) does nothing
            // rather than merging up into it.
            if (e.key === 'Backspace' && start === end && start === 1 && value[0] === '\n') {
                e.preventDefault();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const lineStart = getLineStart(value, start);
                let lineEnd = value.indexOf('\n', start);
                if (lineEnd === -1) lineEnd = value.length;
                const parsed = parseLine(value.slice(lineStart, lineEnd));
                // Only continue the bullet onto the new line if the current line
                // actually has one - a plain line just gets a plain new line under it.
                const insertion = parsed.hasBullet ? '\n' + buildLine(parsed.level, '') : '\n';
                textarea.value = value.slice(0, start) + insertion + value.slice(end);
                const newPos = start + insertion.length;
                textarea.selectionStart = textarea.selectionEnd = newPos;
                this.resizeReflectionAnswer(textarea);
                onChange(textarea.value);
                return;
            }

            if (e.key === 'Tab') {
                e.preventDefault();

                // Expand the affected range to cover every full line touched by the
                // selection (or just the current line, if nothing is selected).
                const lineStart = getLineStart(value, start);
                let blockEnd = value.indexOf('\n', end);
                if (blockEnd === -1) blockEnd = value.length;

                const before = value.slice(0, lineStart);
                const block = value.slice(lineStart, blockEnd);
                const after = value.slice(blockEnd);

                let firstLineDelta = 0;
                const newLines = block.split('\n').map((line, i) => {
                    const { level, content } = parseLine(line);
                    const newLevel = e.shiftKey ? Math.max(0, level - 1) : level + 1;
                    const newLine = buildLine(newLevel, content);
                    if (i === 0) firstLineDelta = newLine.length - line.length;
                    return newLine;
                });
                const newBlock = newLines.join('\n');
                const lengthDelta = newBlock.length - block.length;

                textarea.value = before + newBlock + after;
                textarea.selectionStart = Math.max(lineStart, start + firstLineDelta);
                textarea.selectionEnd = end + lengthDelta;

                this.resizeReflectionAnswer(textarea);
                onChange(textarea.value);
                return;
            }

        });

        // Space and Backspace right at the start of a bullet's text (i.e. the cursor
        // sits immediately after the indent+bullet+space prefix, before any actual
        // content) double up as quick indent/outdent shortcuts, mirroring Tab/
        // Shift+Tab without requiring the modifier line to be selected first. Space on
        // a completely blank (bulletless) line instead creates a new bullet there.
        //
        // This lives on 'beforeinput' rather than 'keydown' - keydown's preventDefault
        // is unreliable for actually blocking the character on mobile virtual
        // keyboards (many mobile browsers don't cancel the resulting input even when
        // keydown is prevented), which is why Space-to-indent didn't work on mobile.
        // beforeinput fires right before the DOM actually mutates and its
        // preventDefault is honored consistently on both desktop and mobile.
        const handleBulletSpaceOrBackspace = (key) => {
            const value = textarea.value;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            if (start !== end) return false;

            if (key === 'Backspace' && start === 1 && value[0] === '\n') {
                // Never allow deleting the mandatory blank first line.
                return true;
            }

            const lineStart = getLineStart(value, start);
            let lineEnd = value.indexOf('\n', start);
            if (lineEnd === -1) lineEnd = value.length;
            const lineText = value.slice(lineStart, lineEnd);
            const parsed = parseLine(lineText);
            const { level, prefixLen, content, hasBullet } = parsed;

            if (key === ' ' && !hasBullet && lineText === '' && start === lineStart) {
                const newLine = buildLine(0, '');
                textarea.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
                textarea.selectionStart = textarea.selectionEnd = lineStart + newLine.length;
                this.resizeReflectionAnswer(textarea);
                onChange(textarea.value);
                return true;
            }

            if (hasBullet && start === lineStart + prefixLen) {
                if (key === ' ') {
                    const newLine = buildLine(level + 1, content);
                    textarea.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
                    const newPrefixLen = parseLine(newLine).prefixLen;
                    textarea.selectionStart = textarea.selectionEnd = lineStart + newPrefixLen;
                    this.resizeReflectionAnswer(textarea);
                    onChange(textarea.value);
                    return true;
                }

                // Backspace: outdent one level, or - if already at the leftmost level -
                // remove the bullet entirely, turning the line into plain text (keeping
                // whatever content it already had) rather than merging into the line above.
                if (level > 0) {
                    const newLine = buildLine(level - 1, content);
                    textarea.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
                    const newPrefixLen = parseLine(newLine).prefixLen;
                    textarea.selectionStart = textarea.selectionEnd = lineStart + newPrefixLen;
                } else {
                    textarea.value = value.slice(0, lineStart) + content + value.slice(lineEnd);
                    textarea.selectionStart = textarea.selectionEnd = lineStart;
                }
                this.resizeReflectionAnswer(textarea);
                onChange(textarea.value);
                return true;
            }

            return false;
        };

        textarea.addEventListener('beforeinput', (e) => {
            if (e.inputType === 'insertText' && e.data === ' ') {
                if (handleBulletSpaceOrBackspace(' ')) e.preventDefault();
            } else if (e.inputType === 'deleteContentBackward') {
                if (handleBulletSpaceOrBackspace('Backspace')) e.preventDefault();
            }
        });

        textarea.addEventListener('input', () => {
            ensureBlankFirstLine();
            normalizeCurrentLineSpacing();
            this.resizeReflectionAnswer(textarea);
            onChange(textarea.value);
        });
    }

    updateReflectionPanel(d) {
        if (!d || !d.data) {
            this._reflectionQuestions = null;
            this._reflectionNodeData = null;
            this.reflectionPanelBody.innerHTML = '';
            this.applyMobileViewState();
            return;
        }
        const questions = this.getReflectionQuestions(d.data);
        this._reflectionQuestions = questions;
        if (!questions) {
            this._reflectionNodeData = null;
            this.reflectionPanelBody.innerHTML = '';
            this.applyMobileViewState();
            return;
        }

        const nodeData = d.data;
        this._reflectionNodeData = nodeData;
        if (!Array.isArray(nodeData._reflectionAnswers)) {
            nodeData._reflectionAnswers = [];
        }

        this.reflectionPanelBody.innerHTML = '';

        const titleEl = document.createElement('div');
        titleEl.className = 'reflection-panel-subtitle';
        titleEl.style.fontWeight = 'bold';
        titleEl.style.marginBottom = '-6px';
        titleEl.textContent = nodeData.color === '#e75480'
            ? 'Assumption Questions'
            : 'Simplify Questions';
        this.reflectionPanelBody.appendChild(titleEl);

        questions.forEach((question, i) => {
            const wrap = document.createElement('div');

            const label = document.createElement('div');
            label.className = 'reflection-question';
            label.textContent = question;

            const textarea = document.createElement('textarea');
            textarea.className = 'reflection-answer';
            textarea.rows = 1;
            textarea.value = nodeData._reflectionAnswers[i] || '';
            this.setupBulletAnswerTextarea(textarea, (value) => {
                nodeData._reflectionAnswers[i] = value;
                this._pendingReflectionSave = true;
            });
            textarea.addEventListener('blur', () => {
                if (this._pendingReflectionSave) {
                    this._pendingReflectionSave = false;
                    this.autosave();
                }
            });

            wrap.appendChild(label);
            wrap.appendChild(textarea);
            this.reflectionPanelBody.appendChild(wrap);
        });

        this.applyMobileViewState();
        this.reflectionPanelBody.querySelectorAll('.reflection-answer').forEach(ta => {
            this.resizeReflectionAnswer(ta);
        });
    }

    // Explicit close (the X button): dismiss whichever left-panel view is currently
    // showing (questions or Pugh Matrix) without forgetting its underlying state -
    // otherwise the mobile toggle button would vanish since there'd be nothing left
    // to toggle to. Notes has no active flag of its own since it's always visible
    // alongside whichever view is open.
    hideReflectionPanel() {
        if (this._leftPanelMode === 'pugh') {
            this._pughPanelActive = false;
        } else {
            this._reflectionPanelActive = false;
        }
        this.unfoldNotesSection();
        this.applyMobileViewState();
        if (this.nodeEditPopup.style.display === 'block' &&
            window.matchMedia('(max-width: 600px)').matches) {
            this.nodeEditInput.focus();
            this.nodeEditInput.select();
        }
    }

    // Full reset: used when switching/creating flowcharts, where any previous node's
    // reflection state (and its availability) no longer applies at all. Also resets
    // the Pugh Matrix and the global Notes back to their per-flowchart defaults;
    // loadFlowchartFromList fills them back in from saved data right after this
    // runs, if any was saved.
    resetReflectionState() {
        this._reflectionQuestions = null;
        this._reflectionNodeData = null;
        this._reflectionPanelActive = false;
        this.reflectionPanelBody.innerHTML = '';
        this._leftPanelMode = 'questions';
        this._pughPanelActive = false;
        this._notesFolded = false;
        this.pughMatrix = this.getDefaultPughMatrix();
        this.globalNotes = '';
        this.notesDrawings = {};
        this.notesImages = {};
        this.updateLeftPanelTabs();
        this.renderNotesPanel();
        this.applyMobileViewState();
    }

    // Single source of truth for what's visible on screen: the node edit popup, the
    // left panel (questions or Pugh Matrix, whichever tab is active, with the global
    // Notes strip always visible underneath), and the mobile toggle button. On
    // desktop, the left panel (when available and not dismissed) sits beside the node
    // edit popup as always. On mobile, the node edit menu is the default view; the
    // toggle button - shown only when the current node actually has a
    // reflection/question set - switches to a full-screen view of that panel instead,
    // hiding the node edit menu while active. The Pugh Matrix tab is driven by its own
    // independent active flag, tied to nothing about node selection, so switching
    // nodes never yanks it away or forces it open.
    applyMobileViewState() {
        const isMobile = window.matchMedia('(max-width: 600px)').matches;
        // Visibility of the Questions tab should only depend on whether that tab is
        // active, same as Pugh - NOT on whether a node with guided questions happens
        // to be loaded right now. Tying it to _reflectionQuestions meant tapping the
        // Questions tab with no such node selected computed panelActive as false and
        // closed the whole panel instead of just showing its (empty) Questions view.
        const questionsActive = this._reflectionPanelActive;
        const panelActive = this._leftPanelMode === 'pugh' ? this._pughPanelActive : questionsActive;

        if (!isMobile) {
            if (this._notesFolded) this.unfoldNotesSection();
            this.reflectionPanel.style.display = panelActive ? 'flex' : 'none';
            if (panelActive) {
                this.reflectionPanel.style.width = this._reflectionPanelWidth + 'px';
            }
            this.updateStickyAncestors();
            return;
        }

        this.reflectionPanel.style.display = panelActive ? 'flex' : 'none';
        this.nodeEditPopup.style.display = (!panelActive && this.nodeBeingEdited) ? 'block' : 'none';
        this.updateStickyAncestors();
    }

    // Toggles between the node edit menu and the reflection/question-boxes view on
    // mobile. Switching to the text-boxes view is also when the keyboard closes (the
    // node edit input is hidden); switching back re-focuses it.
    toggleMobileFieldsVisibility() {
        if (!this._reflectionQuestions) return;
        this._reflectionPanelActive = !this._reflectionPanelActive;
        this.applyMobileViewState();
        if (this._reflectionPanelActive) {
            if (document.activeElement === this.nodeEditInput) {
                this.nodeEditInput.blur();
            }
        } else if (this.nodeEditPopup.style.display === 'block') {
            this.nodeEditInput.focus();
            this.nodeEditInput.select();
        }
    }

    // On mobile, editing Notes hides the Questions/Pugh Matrix content sitting above
    // it so the on-screen keyboard has room, leaving just a "Show" button in the
    // header to bring it back. Desktop always shows everything, so this is a no-op
    // there.
    foldNotesSection() {
        if (!window.matchMedia('(max-width: 600px)').matches) return;
        if (this._notesFolded) return;
        this._notesFolded = true;
        if (this.leftPanelMain) this.leftPanelMain.style.display = 'none';
        if (this.leftPanelTabsContainer) this.leftPanelTabsContainer.style.display = 'none';
        if (this.leftPanelZoomControls) this.leftPanelZoomControls.style.display = 'none';
        if (this.notesUnfoldBtn) this.notesUnfoldBtn.style.display = 'inline-flex';
    }

    // Reverses foldNotesSection - restores the Questions/Pugh Matrix content and tabs,
    // and blurs the Notes textarea (closing the on-screen keyboard) since the whole
    // point of tapping "Show" is to get back to editing/viewing that content instead.
    unfoldNotesSection() {
        this._notesFolded = false;
        if (this.leftPanelMain) this.leftPanelMain.style.display = '';
        if (this.leftPanelTabsContainer) this.leftPanelTabsContainer.style.display = '';
        if (this.leftPanelZoomControls) this.leftPanelZoomControls.style.display = '';
        if (this.notesUnfoldBtn) this.notesUnfoldBtn.style.display = 'none';
        if (this.notesTextarea && document.activeElement === this.notesTextarea) {
            this.notesTextarea.blur();
        }
    }

    // ===== PUGH MATRIX =====
    // A decision matrix living in the same left-hand panel as the reflection
    // questions, switchable via the Questions/Pugh Matrix tabs at the top. Criteria
    // (rows) each carry a weight (default 1); solutions (columns) can be added,
    // deleted, and either typed directly or "armed" so that clicking a node in the
    // flowchart copies that node's name in as the column heading.

    nextPughId(prefix) {
        this._pughIdCounter = (this._pughIdCounter || 0) + 1;
        return `${prefix}-${Date.now().toString(36)}-${this._pughIdCounter}`;
    }

    getDefaultPughMatrix() {
        return {
            criteria: [],
            columns: [
                { id: this.nextPughId('col'), title: 'Solution 1' }
            ],
            scores: {}
        };
    }

    // Validates/repairs a Pugh Matrix loaded from saved JSON, falling back to sane
    // defaults for anything missing or malformed rather than trusting the shape.
    sanitizePughMatrix(raw) {
        if (!raw || typeof raw !== 'object') return this.getDefaultPughMatrix();

        const columns = Array.isArray(raw.columns) ? raw.columns
            .filter(c => c && typeof c === 'object')
            .map(c => ({
                id: (typeof c.id === 'string' && c.id) ? c.id : this.nextPughId('col'),
                title: (typeof c.title === 'string') ? c.title : ''
            })) : [];

        const criteria = Array.isArray(raw.criteria) ? raw.criteria
            .filter(c => c && typeof c === 'object')
            .map(c => ({
                id: (typeof c.id === 'string' && c.id) ? c.id : this.nextPughId('crit'),
                name: (typeof c.name === 'string') ? c.name : '',
                weight: (typeof c.weight === 'number' && !isNaN(c.weight)) ? c.weight : 1
            })) : [];

        const columnIds = new Set(columns.map(c => c.id));
        const scores = {};
        if (raw.scores && typeof raw.scores === 'object') {
            criteria.forEach(crit => {
                const row = raw.scores[crit.id];
                if (row && typeof row === 'object') {
                    scores[crit.id] = {};
                    Object.keys(row).forEach(colId => {
                        if (columnIds.has(colId) && typeof row[colId] === 'number' && !isNaN(row[colId])) {
                            scores[crit.id][colId] = row[colId];
                        }
                    });
                }
            });
        }

        return { criteria, columns, scores };
    }

    // Wires up the +/- zoom buttons in the left panel header. These scale the
    // Questions/Pugh Matrix/Notes sections (including their tables and font size)
    // up or down via CSS `zoom`, independent of the flowchart's own zoom. The level
    // persists across sessions since it's a display preference, not chart data.
    setupLeftPanelZoom() {
        const MIN_ZOOM = 0.6;
        const MAX_ZOOM = 2.0;
        const STEP = 0.1;
        const stored = parseFloat(localStorage.getItem('flowchart-panel-zoom'));
        this.panelZoom = (!isNaN(stored) && stored >= MIN_ZOOM && stored <= MAX_ZOOM) ? stored : 1;

        const applyPanelZoom = () => {
            document.documentElement.style.setProperty('--panel-zoom', this.panelZoom);
            if (this.leftPanelZoomLevel) {
                this.leftPanelZoomLevel.textContent = Math.round(this.panelZoom * 100) + '%';
            }
            localStorage.setItem('flowchart-panel-zoom', String(this.panelZoom));
        };
        applyPanelZoom();

        if (this.leftPanelZoomInBtn) {
            this.leftPanelZoomInBtn.addEventListener('click', () => {
                this.panelZoom = Math.min(MAX_ZOOM, Math.round((this.panelZoom + STEP) * 100) / 100);
                applyPanelZoom();
            });
        }
        if (this.leftPanelZoomOutBtn) {
            this.leftPanelZoomOutBtn.addEventListener('click', () => {
                this.panelZoom = Math.max(MIN_ZOOM, Math.round((this.panelZoom - STEP) * 100) / 100);
                applyPanelZoom();
            });
        }
    }

    // Wires up the left-panel tab switcher. Called once from the constructor.
    setupPughPanel() {
        if (this.leftPanelTabQuestions) {
            this.leftPanelTabQuestions.addEventListener('click', () => this.switchLeftPanelMode('questions'));
        }
        if (this.leftPanelTabPugh) {
            this.leftPanelTabPugh.addEventListener('click', () => this.switchLeftPanelMode('pugh'));
        }
    }

    // Opens the left panel directly to the Pugh Matrix tab - used by the toolbar/
    // hamburger "Pugh Matrix" buttons, which aren't tied to any node selection.
    openPughPanel() {
        this._pughPanelActive = true;
        this.switchLeftPanelMode('pugh');
    }

    // Opens the left panel so the (always-visible) Notes strip is on screen - used by
    // the toolbar/hamburger "Notes" buttons. If a node's guided questions are already
    // showing, just brings that view forward; otherwise falls back to the Pugh Matrix
    // tab, since Notes isn't a view of its own anymore and needs something above it.
    openNotesPanel() {
        if (this._leftPanelMode === 'questions' && this._reflectionQuestions) {
            this._reflectionPanelActive = true;
            this.applyMobileViewState();
        } else {
            this.openPughPanel();
        }
        if (this.notesTextarea) {
            this.notesTextarea.focus();
        }
    }

    switchLeftPanelMode(mode) {
        this._leftPanelMode = mode;
        if (mode === 'pugh') {
            this._pughPanelActive = true;
            this.renderPughPanel();
        } else if (mode === 'questions') {
            // Mirrors the 'pugh' branch above (which flips _pughPanelActive on) so
            // switching tabs always shows that tab's content - otherwise, if
            // _reflectionPanelActive happened to be false (e.g. never turned on, or
            // switched off earlier), applyMobileViewState would see panelActive as
            // false and close the whole left panel instead of showing Questions.
            this._reflectionPanelActive = true;
        }
        this.updateLeftPanelTabs();
        this.applyMobileViewState();
    }

    updateLeftPanelTabs() {
        if (this.leftPanelTabQuestions) {
            this.leftPanelTabQuestions.classList.toggle('active', this._leftPanelMode === 'questions');
        }
        if (this.leftPanelTabPugh) {
            this.leftPanelTabPugh.classList.toggle('active', this._leftPanelMode === 'pugh');
        }
        if (this.reflectionPanelBody) {
            this.reflectionPanelBody.style.display = this._leftPanelMode === 'questions' ? 'flex' : 'none';
        }
        if (this.pughPanelBody) {
            this.pughPanelBody.style.display = this._leftPanelMode === 'pugh' ? 'flex' : 'none';
        }
    }

    // ===== NOTES =====
    // A single free-form notes field, global to the whole flowchart rather than tied
    // to any node. Lives in a persistent strip at the bottom of the left panel, below
    // whichever of Questions/Pugh Matrix is currently showing above it - always
    // visible whenever the panel itself is open, regardless of tab.
    renderNotesPanel() {
        if (!this.notesPanelBody) return;
        this.notesPanelBody.innerHTML = '';
        this.notesPanelBody.style.height = this._notesPanelHeight + 'px';

        const header = document.createElement('div');
        header.id = 'notes-panel-header-row';
        const label = document.createElement('div');
        label.id = 'notes-panel-label';
        label.textContent = 'Notes';
        const insertDrawingBtn = document.createElement('button');
        insertDrawingBtn.id = 'notes-insert-drawing-btn';
        insertDrawingBtn.type = 'button';
        insertDrawingBtn.textContent = '🎨 Insert Drawing';
        insertDrawingBtn.title = 'Insert a drawing at the cursor';
        insertDrawingBtn.addEventListener('click', () => this.startNewNotesDrawing());
        header.appendChild(label);
        header.appendChild(insertDrawingBtn);
        this.notesPanelBody.appendChild(header);

        const notesArea = document.createElement('textarea');
        notesArea.className = 'reflection-notes-global';
        notesArea.placeholder = 'Notes...';
        const savedNotes = this.globalNotes || '';
        notesArea.value = savedNotes.startsWith('\n') ? savedNotes : '\n' + savedNotes;
        this.setupIndentableTextarea(notesArea, (value) => {
            this.globalNotes = value;
            this._pendingNotesSave = true;
        });
        notesArea.addEventListener('focus', () => {
            this.foldNotesSection();
        });
        notesArea.addEventListener('blur', () => {
            this._notesCursorPos = notesArea.selectionStart;
            if (this._pendingNotesSave) {
                this._pendingNotesSave = false;
                this.autosave();
            }
        });
        notesArea.addEventListener('keyup', () => { this._notesCursorPos = notesArea.selectionStart; });
        notesArea.addEventListener('click', () => { this._notesCursorPos = notesArea.selectionStart; });
        notesArea.addEventListener('paste', (e) => this.handleNotesPaste(e));
        this.notesTextarea = notesArea;
        this.notesPanelBody.appendChild(notesArea);

        this.renderNotesMediaStrip();
    }

    // Drawing/image markers embedded in the notes text look like [[drawing:ID]] or
    // [[image:ID]], each on its own line, in the order they appear. A plain
    // <textarea> can't render an inline image in place of a marker, so as a
    // practical stand-in, everything referenced anywhere in the notes gets a small
    // preview thumbnail in a strip under the textarea, in the same order they appear
    // in the text; tapping a drawing reopens it for editing, tapping a photo opens it
    // full-size. The marker line itself is what anchors *where* in the outline each
    // item conceptually sits.
    getNotesMediaMarkers() {
        const text = this.globalNotes || '';
        const items = [];
        const re = /\[\[(drawing|image):([a-zA-Z0-9_-]+)\]\]/g;
        let m;
        while ((m = re.exec(text))) items.push({ type: m[1], id: m[2] });
        return items;
    }

    renderNotesMediaStrip() {
        if (!this.notesPanelBody) return;
        let strip = document.getElementById('notes-drawings-strip');
        if (strip) strip.remove();

        const items = this.getNotesMediaMarkers();
        if (items.length === 0) return;

        strip = document.createElement('div');
        strip.id = 'notes-drawings-strip';
        items.forEach(({ type, id }) => {
            if (type === 'drawing') {
                const drawing = this.notesDrawings && this.notesDrawings[id];
                if (!drawing) return;
                const thumb = document.createElement('img');
                thumb.className = 'notes-drawing-thumb';
                thumb.src = drawing.dataUrl;
                thumb.title = 'Tap to edit this drawing';
                thumb.addEventListener('click', () => this.editNotesDrawing(id));
                strip.appendChild(thumb);
            } else if (type === 'image') {
                const image = this.notesImages && this.notesImages[id];
                if (!image) return;
                const thumb = document.createElement('img');
                thumb.className = 'notes-drawing-thumb';
                thumb.src = image.dataUrl || image.url;
                thumb.title = 'Tap to view full size';
                thumb.addEventListener('click', () => this.openNotesImageLightbox(image.dataUrl || image.url));
                strip.appendChild(thumb);
            }
        });
        this.notesPanelBody.appendChild(strip);
    }

    // Handles pasting either actual image data (e.g. copied from an image editor or
    // a screenshot) or a plain text URL that looks like it points at an image -
    // either way, inserts a [[image:ID]] marker at the cursor and shows a preview
    // thumbnail, same as a drawing. Pasted URLs are stored as just the link (no
    // image bytes at all) so they don't add anything to the notes' storage/sync size
    // the way an actually-embedded image does.
    handleNotesPaste(e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (items) {
            for (const item of items) {
                if (item.type && item.type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    if (!blob) continue;
                    const reader = new FileReader();
                    reader.onload = () => {
                        const id = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
                        this.notesImages[id] = { dataUrl: reader.result };
                        this.insertNotesMediaMarker('image', id);
                    };
                    reader.readAsDataURL(blob);
                    return;
                }
            }
        }

        const pastedText = e.clipboardData ? e.clipboardData.getData('text') : '';
        const trimmed = pastedText.trim();
        const looksLikeImageUrl = /^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg|avif)(\?\S*)?$/i.test(trimmed);
        if (looksLikeImageUrl) {
            e.preventDefault();
            const id = 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            this.notesImages[id] = { url: trimmed };
            this.insertNotesMediaMarker('image', id);
        }
        // Otherwise, let the paste proceed normally as plain text.
    }

    // Shared by both the drawing tool and image paste - drops a [[type:id]] marker
    // on its own line at wherever the cursor last was, then re-renders so the
    // preview strip picks it up.
    insertNotesMediaMarker(type, id) {
        const marker = `[[${type}:${id}]]`;
        const value = this.globalNotes || '';
        const pos = Math.min(this._notesCursorPos || value.length, value.length);
        const lineStart = pos <= 0 ? 0 : (value.lastIndexOf('\n', pos - 1) + 1);
        let lineEnd = value.indexOf('\n', pos);
        if (lineEnd === -1) lineEnd = value.length;
        const lineText = value.slice(lineStart, lineEnd);
        const insertion = (lineText.trim() ? '\n' : '') + marker + '\n';
        this.globalNotes = value.slice(0, lineEnd) + insertion + value.slice(lineEnd);
        this.renderNotesPanel();
        this.autosave();
    }

    // A simple full-screen lightbox for viewing a pasted photo at full size - same
    // idea as opening an embedded image in a Word doc.
    openNotesImageLightbox(src) {
        let overlay = document.getElementById('notes-image-lightbox');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'notes-image-lightbox';
        overlay.addEventListener('click', () => overlay.remove());
        const img = document.createElement('img');
        img.src = src;
        overlay.appendChild(img);
        document.body.appendChild(overlay);
    }

    // Opens the full-screen drawing overlay for a brand new drawing, to be inserted
    // at wherever the cursor last was in the notes textarea.
    startNewNotesDrawing() {
        if (this.notesTextarea) {
            this._notesCursorPos = this.notesTextarea.selectionStart;
        }
        this.openDrawingOverlay(null);
    }

    // Opens the full-screen drawing overlay pre-loaded with an existing drawing.
    editNotesDrawing(id) {
        this.openDrawingOverlay(id);
    }

    // Lets the person drag the handle above the Notes strip to resize it vertically,
    // same drag-and-persist pattern as the panel's own width handle.
    setupNotesResizeHandle() {
        if (!this.notesResizeHandle || !this.notesPanelBody) return;

        let dragging = false;
        let startY = 0;
        let startHeight = 0;

        const onMove = (clientY) => {
            if (!dragging) return;
            // Dragging up (clientY decreasing) should grow the notes strip, since it's
            // pinned to the bottom of the panel.
            const delta = startY - clientY;
            const panelHeight = this.reflectionPanel.getBoundingClientRect().height || window.innerHeight;
            const maxHeight = Math.max(120, panelHeight - 120);
            const newHeight = Math.max(80, Math.min(startHeight + delta, maxHeight));
            this._notesPanelHeight = newHeight;
            this.notesPanelBody.style.height = newHeight + 'px';
        };
        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.userSelect = '';
            localStorage.setItem('notes-panel-height', String(this._notesPanelHeight));
        };

        this.notesResizeHandle.addEventListener('mousedown', (e) => {
            dragging = true;
            startY = e.clientY;
            startHeight = this.notesPanelBody.getBoundingClientRect().height;
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => onMove(e.clientY));
        window.addEventListener('mouseup', onEnd);
        this.notesResizeHandle.addEventListener('touchstart', (e) => {
            dragging = true;
            startY = e.touches[0].clientY;
            startHeight = this.notesPanelBody.getBoundingClientRect().height;
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            if (!dragging) return;
            // Must be a non-passive listener so preventDefault can actually stop the
            // browser from treating this as a page/panel scroll instead of a resize -
            // without it, the browser decides the gesture type from the very first
            // touchmove's direction, and a downward drag (unlike an upward one) was
            // getting claimed as a native scroll before this handler ever got to act,
            // which is why only "drag up first" reliably worked.
            e.preventDefault();
            onMove(e.touches[0].clientY);
        }, { passive: false });
        window.addEventListener('touchend', onEnd);
    }

    // ===================== Drawing overlay (Notes drawings) =====================
    // A full-screen canvas editor opened from the Notes panel. Its interaction model
    // mirrors a "precision drawing" pattern from apps like Android's Notes: a
    // draggable handle (with a crosshair, shown only while just repositioning it)
    // lets you see exactly where you're about to act despite your finger covering
    // the screen, and a separate toggle button arms the *next* drag of that handle
    // to actually draw with the current tool - releasing the drag both finishes that
    // one stroke/shape and disarms back to plain repositioning, so drawing is always
    // a single deliberate motion rather than an ambiguous free-touch gesture.
    setupDrawingOverlay() {
        this.drawingOverlay = document.getElementById('drawing-overlay');
        this.drawingCanvas = document.getElementById('drawing-canvas');
        this.drawingCanvasWrap = document.getElementById('drawing-canvas-wrap');
        this.drawingHandle = document.getElementById('drawing-handle');
        this.drawingToggleBtn = document.getElementById('drawing-toggle-btn');
        if (!this.drawingOverlay || !this.drawingCanvas) return;

        const ctx = this.drawingCanvas.getContext('2d');
        this._drawingCtx = ctx;

        const state = {
            tool: 'brush',
            color: '#ffffff',
            width: 4,
            eraserWidth: 24,
            editingId: null,
            armed: false,
            drawing: false,
            path: null,           // brush/eraser: array of {x,y} points
            startPoint: null,     // line/rect/ellipse/text: canvas-space start point
            beforeSnapshot: null, // ImageData captured right before the in-progress action
            undoStack: [],
            redoStack: [],
            scale: 1,
            panX: 0,
            panY: 0,
            handleX: 0,
            handleY: 0
        };
        this._drawingState = state;

        const clampScale = s => Math.max(0.3, Math.min(6, s));

        // How far up-and-left of the handle's center the pen/eraser size-indicator
        // (and the actual point drawing happens at) sits. Shared by
        // updateSizeIndicator and toCrosshairCanvasPoint below so they always agree
        // on exactly the same point.
        const PEN_CIRCLE_OFFSET = 55;

        // Which width applies right now - brush/shape tools use one slider, the
        // eraser has its own separate one (erasing usually wants a bigger area than
        // a fine brush stroke, so sharing one slider was awkward).
        const activeWidth = () => (state.tool === 'eraser' ? state.eraserWidth : state.width);

        // Resizes/repositions the size-indicator circle to match the active tool's
        // width (scaled to match the current canvas zoom, so it always reflects how
        // big the stroke will actually look) and keeps it centered on the exact point
        // toCrosshairCanvasPoint draws at, regardless of diameter.
        const updateSizeIndicator = () => {
            const diameter = Math.max(4, activeWidth() * state.scale);
            const indicator = document.getElementById('drawing-size-indicator');
            if (!indicator) return;
            indicator.style.width = diameter + 'px';
            indicator.style.height = diameter + 'px';
            // Center the circle on the same point PEN_CIRCLE_OFFSET up-and-left of
            // the handle's own center that toCrosshairCanvasPoint uses (see there for
            // the math) - the handle's own top-left corner is local (0,0), its center
            // is (23,23), so the target point is local (23-PEN_CIRCLE_OFFSET,
            // 23-PEN_CIRCLE_OFFSET); offsetting by half the circle's own diameter
            // keeps it centered there rather than anchored by its corner.
            const offset = (23 - PEN_CIRCLE_OFFSET) - diameter / 2;
            indicator.style.left = offset + 'px';
            indicator.style.top = offset + 'px';
        };

        const applyPanZoom = () => {
            this.drawingCanvasWrap.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`;
            updateSizeIndicator();
        };

        const positionHandleGroup = (x, y) => {
            state.handleX = x;
            state.handleY = y;
            this.drawingHandle.style.left = x + 'px';
            this.drawingHandle.style.top = y + 'px';
            // Toggle button sits directly to the right of the handle, touching
            // (handle radius 23 + its own radius 23 = 46px apart), same height.
            this.drawingToggleBtn.style.left = (x + 46) + 'px';
            this.drawingToggleBtn.style.top = y + 'px';
        };

        // Where the handle's own circle center currently is, in *client* (viewport)
        // coordinates - used to start a draw action from the handle's actual tracked
        // position rather than the raw pointerdown coordinates, which can land
        // anywhere within the handle's hit area, not necessarily its exact center.
        // Without this, the stroke could start at a slightly different point than
        // where the indicator circle is actually shown, reading as a small "jump".
        const getHandleClientPoint = () => {
            const overlayRect = this.drawingOverlay.getBoundingClientRect();
            return { x: overlayRect.left + state.handleX, y: overlayRect.top + state.handleY };
        };

        // Converts a client (viewport) point into the canvas's own pixel space,
        // accounting for the pan/zoom transform and any canvas-vs-display size
        // mismatch, by reading back the actually-rendered bounding box - this way it
        // stays correct regardless of how the transform is implemented.
        const toCanvasPoint = (clientX, clientY) => {
            const rect = this.drawingCanvas.getBoundingClientRect();
            const scaleX = this.drawingCanvas.width / rect.width;
            const scaleY = this.drawingCanvas.height / rect.height;
            return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
        };

        // The handle's pointer-tracked position (e.clientX/Y while dragging it) is
        // its own *center* - but the pen/eraser size-indicator circle sits
        // PEN_CIRCLE_OFFSET up-and-left of that (see updateSizeIndicator), and
        // that's where drawing should actually happen, so the person can see the
        // exact point and size being drawn with instead of it being hidden under
        // their finger/the handle itself. Used for every actual draw action;
        // positionHandleGroup (which just moves the handle/toggle group around)
        // intentionally still uses the raw pointer position, not this.
        const toCrosshairCanvasPoint = (clientX, clientY) =>
            toCanvasPoint(clientX - PEN_CIRCLE_OFFSET, clientY - PEN_CIRCLE_OFFSET);

        const pushUndoSnapshot = () => {
            state.undoStack.push(ctx.getImageData(0, 0, this.drawingCanvas.width, this.drawingCanvas.height));
            if (state.undoStack.length > 40) state.undoStack.shift();
            state.redoStack = [];
        };

        const setTool = (tool) => {
            state.tool = tool;
            document.querySelectorAll('.drawing-tool-btn[data-tool]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === tool);
            });
            updateSizeIndicator();
        };

        // Assigned as early as possible (before any of the listener wiring below,
        // which touches more elements and is more likely to hit something
        // unexpected) - openDrawingOverlay only needs positionHandleGroup to work,
        // and if some later, non-essential wiring throws, this still lets the handle
        // itself show up rather than silently leaving it undefined and invisible.
        this._drawingHelpers = { toCanvasPoint, toCrosshairCanvasPoint, positionHandleGroup, applyPanZoom, pushUndoSnapshot, setTool, updateSizeIndicator };

        try {

        document.querySelectorAll('.drawing-tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => setTool(btn.dataset.tool));
        });
        setTool('brush');

        const colorInput = document.getElementById('drawing-color');
        const widthInput = document.getElementById('drawing-width');
        const eraserWidthInput = document.getElementById('drawing-eraser-width');
        if (colorInput) colorInput.addEventListener('input', () => { state.color = colorInput.value; });
        if (widthInput) widthInput.addEventListener('input', () => {
            state.width = parseInt(widthInput.value, 10) || 1;
            updateSizeIndicator();
        });
        if (eraserWidthInput) eraserWidthInput.addEventListener('input', () => {
            state.eraserWidth = parseInt(eraserWidthInput.value, 10) || 1;
            updateSizeIndicator();
        });

        const restoreSnapshot = (imgData) => {
            ctx.putImageData(imgData, 0, 0);
        };

        document.getElementById('drawing-undo-btn').addEventListener('click', () => {
            if (state.undoStack.length === 0) return;
            state.redoStack.push(ctx.getImageData(0, 0, this.drawingCanvas.width, this.drawingCanvas.height));
            restoreSnapshot(state.undoStack.pop());
        });
        document.getElementById('drawing-redo-btn').addEventListener('click', () => {
            if (state.redoStack.length === 0) return;
            state.undoStack.push(ctx.getImageData(0, 0, this.drawingCanvas.width, this.drawingCanvas.height));
            restoreSnapshot(state.redoStack.pop());
        });

        document.getElementById('drawing-cancel-btn').addEventListener('click', () => this.closeDrawingOverlay(false));
        document.getElementById('drawing-done-btn').addEventListener('click', () => this.closeDrawingOverlay(true));

        // ---- Toggle button: arms the *next* handle drag to draw ----
        this.drawingToggleBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.armed = !state.drawing && !state.armed;
            this.drawingHandle.classList.toggle('armed', state.armed);
            this.drawingToggleBtn.classList.toggle('armed', state.armed);
        });

        // ---- Handle: plain drag repositions it; an armed drag draws instead ----
        let handlePointerId = null;
        // The offset between where the pointer actually grabbed the handle and the
        // handle's own center at that moment - without tracking this, moving the
        // pointer even slightly after an off-center grab snaps the handle's center
        // straight to the pointer position, causing a visible jump equal to however
        // far off-center the initial press was. Preserving this offset throughout the
        // drag keeps the handle (and the crosshair/draw point derived from it)
        // moving smoothly by the same delta the pointer moves, instead of snapping.
        let grabOffsetX = 0;
        let grabOffsetY = 0;

        const beginDrawAction = (canvasPt) => {
            state.drawing = true;
            state.beforeSnapshot = ctx.getImageData(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
            this.drawingHandle.classList.add('armed');
            if (state.tool === 'brush' || state.tool === 'eraser') {
                state.path = [canvasPt];
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = activeWidth();
                if (state.tool === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = 'rgba(0,0,0,1)';
                } else {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = state.color;
                }
                ctx.beginPath();
                ctx.moveTo(canvasPt.x, canvasPt.y);
            } else {
                state.startPoint = canvasPt;
            }
        };

        const continueDrawAction = (canvasPt) => {
            if (state.tool === 'brush' || state.tool === 'eraser') {
                state.path.push(canvasPt);
                ctx.lineTo(canvasPt.x, canvasPt.y);
                ctx.stroke();
            } else if (state.tool === 'line' || state.tool === 'rect' || state.tool === 'ellipse') {
                restoreSnapshot(state.beforeSnapshot);
                ctx.save();
                ctx.strokeStyle = state.color;
                ctx.lineWidth = state.width;
                ctx.lineCap = 'round';
                const { x: x0, y: y0 } = state.startPoint;
                const { x: x1, y: y1 } = canvasPt;
                ctx.beginPath();
                if (state.tool === 'line') {
                    ctx.moveTo(x0, y0);
                    ctx.lineTo(x1, y1);
                } else if (state.tool === 'rect') {
                    ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
                } else {
                    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
                    const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
                    ctx.ellipse(cx, cy, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2);
                }
                ctx.stroke();
                ctx.restore();
            }
            // Text tool has no live preview - it's stamped once on release.
        };

        const endDrawAction = (canvasPt) => {
            if (state.tool === 'brush' || state.tool === 'eraser') {
                ctx.restore();
            } else if (state.tool === 'text') {
                const text = window.prompt('Text:', '');
                if (text) {
                    ctx.save();
                    ctx.fillStyle = state.color;
                    ctx.font = `${Math.max(14, state.width * 6)}px sans-serif`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(text, state.startPoint.x, state.startPoint.y);
                    ctx.restore();
                } else {
                    // Nothing typed - discard, restore to how it was before this action.
                    restoreSnapshot(state.beforeSnapshot);
                }
            }
            // beforeSnapshot already captures the pre-action state - commit it to the
            // undo stack now that the action is finished, rather than at action start,
            // so an action the person backs out of (e.g. an empty text prompt) never
            // leaves a redundant no-op entry on the stack.
            state.undoStack.push(state.beforeSnapshot);
            if (state.undoStack.length > 40) state.undoStack.shift();
            state.redoStack = [];
            state.beforeSnapshot = null;
            state.drawing = false;
            state.armed = false;
            this.drawingHandle.classList.remove('armed');
            this.drawingToggleBtn.classList.remove('armed');
        };

        this.drawingHandle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handlePointerId = e.pointerId;
            this.drawingHandle.setPointerCapture(handlePointerId);
            const handlePt = getHandleClientPoint();
            grabOffsetX = e.clientX - handlePt.x;
            grabOffsetY = e.clientY - handlePt.y;
            if (state.armed) {
                // Start from the handle's tracked center (see getHandleClientPoint),
                // not the raw click point - keeps the stroke's start exactly where
                // the indicator circle is actually displayed, no matter where within
                // the handle's hit area the person happened to press down.
                beginDrawAction(toCrosshairCanvasPoint(handlePt.x, handlePt.y));
            }
        });
        this.drawingHandle.addEventListener('pointermove', (e) => {
            if (e.pointerId !== handlePointerId) return;
            // Subtract the grab offset captured on pointerdown so the handle's
            // center moves by the same delta as the pointer, rather than snapping
            // to sit directly under it.
            const centerClientX = e.clientX - grabOffsetX;
            const centerClientY = e.clientY - grabOffsetY;
            if (state.drawing) {
                continueDrawAction(toCrosshairCanvasPoint(centerClientX, centerClientY));
            }
            // The handle still visually follows the finger/cursor while drawing,
            // it just also draws (at the crosshair position) at the same time.
            positionHandleGroup(
                centerClientX - this.drawingOverlay.getBoundingClientRect().left,
                centerClientY - this.drawingOverlay.getBoundingClientRect().top
            );
        });
        const finishHandlePointer = (e) => {
            if (e.pointerId !== handlePointerId) return;
            handlePointerId = null;
            if (state.drawing) {
                const centerClientX = e.clientX - grabOffsetX;
                const centerClientY = e.clientY - grabOffsetY;
                endDrawAction(toCrosshairCanvasPoint(centerClientX, centerClientY));
            }
        };
        this.drawingHandle.addEventListener('pointerup', finishHandlePointer);
        this.drawingHandle.addEventListener('pointercancel', finishHandlePointer);

        // ---- Tapping elsewhere on the canvas teleports the handle group there,
        // and keeps following the same finger/pointer if it keeps moving instead of
        // just teleporting once and going static ----
        this.drawingCanvasWrap.addEventListener('pointerdown', (e) => {
            if (e.target !== this.drawingCanvas && e.target !== this.drawingCanvasWrap) return;
            e.preventDefault();
            const overlayRect = this.drawingOverlay.getBoundingClientRect();
            positionHandleGroup(e.clientX - overlayRect.left, e.clientY - overlayRect.top);
            // Hand this pointer off to the same tracking the handle's own drag uses -
            // pointer capture redirects this pointer's future move/up events to fire
            // on the handle element itself, so its existing pointermove/pointerup
            // listeners keep the handle (and any armed drawing) following this same
            // finger for the rest of the gesture, exactly as if it had been grabbed
            // there directly. No initial grab offset, since the handle was just
            // teleported to sit exactly under this pointer.
            handlePointerId = e.pointerId;
            grabOffsetX = 0;
            grabOffsetY = 0;
            this.drawingHandle.setPointerCapture(handlePointerId);
            if (state.armed) {
                const handlePt = getHandleClientPoint();
                beginDrawAction(toCrosshairCanvasPoint(handlePt.x, handlePt.y));
            }
        });

        // ---- Two-finger pan + pinch zoom on the canvas area ----
        let pinch = null;
        this.drawingOverlay.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                const [a, b] = e.touches;
                pinch = {
                    dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
                    midX: (a.clientX + b.clientX) / 2,
                    midY: (a.clientY + b.clientY) / 2,
                    startScale: state.scale,
                    startPanX: state.panX,
                    startPanY: state.panY
                };
            }
        }, { passive: true });
        this.drawingOverlay.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && pinch) {
                e.preventDefault();
                const [a, b] = e.touches;
                const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                const midX = (a.clientX + b.clientX) / 2;
                const midY = (a.clientY + b.clientY) / 2;
                state.scale = clampScale(pinch.startScale * (dist / pinch.dist));
                state.panX = pinch.startPanX + (midX - pinch.midX);
                state.panY = pinch.startPanY + (midY - pinch.midY);
                applyPanZoom();
            }
        }, { passive: false });
        this.drawingOverlay.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) pinch = null;
        });
        // Desktop equivalent: mouse wheel zooms.
        this.drawingOverlay.addEventListener('wheel', (e) => {
            e.preventDefault();
            state.scale = clampScale(state.scale * (e.deltaY < 0 ? 1.1 : 0.9));
            applyPanZoom();
        }, { passive: false });

        } catch (err) {
            // Surfaces the real cause in the console instead of leaving the handle/
            // toggle/crosshair silently un-wired with no clue why.
            console.error('Drawing overlay setup error:', err);
        }
    }

    // Opens the full-screen drawing overlay. Pass an existing drawing id to edit it,
    // or null/undefined to start a brand new blank drawing.
    openDrawingOverlay(existingId) {
        if (!this.drawingOverlay) return;
        const state = this._drawingState;
        const ctx = this._drawingCtx;
        const canvas = this.drawingCanvas;

        this.drawingOverlay.style.display = 'block';
        // Size the canvas 1:1 with CSS pixels for the whole editing session (no
        // devicePixelRatio scaling) - toCanvasPoint derives drawing coordinates from
        // the canvas's actual rendered bounding box, so keeping canvas.width/height
        // equal to its displayed CSS size keeps that mapping simple and exact,
        // rather than needing every draw call to also account for a separate DPI
        // transform on the context.
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        state.scale = 1;
        state.panX = 0;
        state.panY = 0;
        state.undoStack = [];
        state.redoStack = [];
        state.editingId = existingId || null;
        this.drawingCanvasWrap.style.transform = 'translate(0px, 0px) scale(1)';
        try {
            this._drawingHelpers.positionHandleGroup(window.innerWidth / 2, window.innerHeight / 2);
        } catch (err) {
            // The handle/toggle already have CSS fallback positions (center of
            // screen) for exactly this case, so a failure here is non-fatal - just
            // surface it rather than leaving the rest of this function to guess.
            console.error('Could not position drawing handle:', err);
        }
        if (this._drawingHelpers.updateSizeIndicator) this._drawingHelpers.updateSizeIndicator();

        if (existingId && this.notesDrawings[existingId]) {
            const img = new Image();
            img.onload = () => {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            };
            img.src = this.notesDrawings[existingId].dataUrl;
        }
    }

    closeDrawingOverlay(save) {
        if (!this.drawingOverlay) return;
        const state = this._drawingState;

        if (save) {
            const dataUrl = this.drawingCanvas.toDataURL('image/png');
            let id = state.editingId;
            if (!id) {
                id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            }
            this.notesDrawings[id] = { dataUrl };

            if (!state.editingId && this.notesTextarea) {
                // Brand new drawing - insert its marker at wherever the cursor last was.
                this.insertNotesMediaMarker('drawing', id);
                return;
            }

            this.renderNotesPanel();
            this.autosave();
        }

        this.drawingOverlay.style.display = 'none';
    }

    // Adds a node's name into the Pugh Matrix as a solution (column) or a criteria
    // (row), from the "Add Solution"/"Add Criteria" buttons in the node edit popup -
    // does nothing if that exact name is already present, rather than creating a
    // duplicate every time the button's pressed again.
    addNodeToPugh(kind) {
        if (!this.nodeBeingEdited) return;
        const name = (this.nodeBeingEdited.data.name || '').trim();
        if (!name) {
            this.showNotification('Name the node first.');
            return;
        }

        if (kind === 'solution') {
            const exists = this.pughMatrix.columns.some(c => c.title.trim().toLowerCase() === name.toLowerCase());
            if (exists) {
                this.showNotification(`"${name}" is already a solution in the Pugh Matrix.`);
                return;
            }
            this.pughMatrix.columns.push({ id: this.nextPughId('col'), title: name });
        } else {
            const exists = this.pughMatrix.criteria.some(c => c.name.trim().toLowerCase() === name.toLowerCase());
            if (exists) {
                this.showNotification(`"${name}" is already a criteria in the Pugh Matrix.`);
                return;
            }
            this.pughMatrix.criteria.push({ id: this.nextPughId('crit'), name });
        }

        this.renderPughPanel();
        this.autosave();
        this.showNotification(`Added "${name}" as a ${kind === 'solution' ? 'solution' : 'criteria'}.`);
    }

    addPughCriteria() {
        this.pughMatrix.criteria.push({
            id: this.nextPughId('crit'),
            name: '',
            weight: 1 // all new criteria default to a weight of 1
        });
        this.renderPughPanel();
        this.autosave();
    }

    deletePughCriteria(criteriaId) {
        this.pughMatrix.criteria = this.pughMatrix.criteria.filter(c => c.id !== criteriaId);
        delete this.pughMatrix.scores[criteriaId];
        this.renderPughPanel();
        this.autosave();
    }

    addPughColumn() {
        const n = this.pughMatrix.columns.length + 1;
        this.pughMatrix.columns.push({ id: this.nextPughId('col'), title: `Solution ${n}` });
        this.renderPughPanel();
        this.autosave();
    }

    deletePughColumn(columnId) {
        this.pughMatrix.columns = this.pughMatrix.columns.filter(c => c.id !== columnId);
        Object.values(this.pughMatrix.scores).forEach(row => { delete row[columnId]; });
        this.renderPughPanel();
        this.autosave();
    }

    getPughScore(criteriaId, columnId) {
        const row = this.pughMatrix.scores[criteriaId];
        const v = row ? row[columnId] : undefined;
        return (typeof v === 'number' && !isNaN(v)) ? v : 0;
    }

    setPughScore(criteriaId, columnId, value) {
        if (!this.pughMatrix.scores[criteriaId]) this.pughMatrix.scores[criteriaId] = {};
        this.pughMatrix.scores[criteriaId][columnId] = value;
    }

    // Weight has been removed as a user-facing concept - every criterion counts
    // equally now, so a column's total is just the sum of its scores.
    computePughColumnTotal(columnId) {
        return this.pughMatrix.criteria.reduce((sum, c) => sum + this.getPughScore(c.id, columnId), 0);
    }

    // ===================== Pugh Matrix ranking mode =====================
    // A pairwise "beat the baseline" tournament for ordering the solutions (columns)
    // against a single criteria at a time, rather than typing in numeric scores
    // directly. Session state (pool/settled/baseline/selections) is deliberately
    // ephemeral - held only on the in-memory criteria object, not persisted through
    // save/export - since it's mid-process working state; only the *final* scores it
    // produces get written into pughMatrix.scores.
    //
    // Algorithm (a selection-sort built out of repeated pairwise rounds):
    // - `pool` holds every solution not yet confirmed into final position; `settled`
    //   holds those already confirmed, in winner-to-loser order.
    // - Each round compares the current `baselineId` (a pool member) against every
    //   *other* pool member, each marked S (tied/not better) or + (beat baseline).
    // - Re-rank: if anything beat the baseline, one of those winners (chosen at
    //   random if several tied for it) becomes the new baseline for another round -
    //   the old baseline stays in the pool to be compared again later. If nothing
    //   beat the baseline, it has beaten/tied everything left in the pool, so it's
    //   confirmed - moved into `settled` - and a fresh baseline is picked from
    //   whatever remains.
    // - Selections always reset to S at the start of a new round.
    getOrInitRankSession(crit) {
        if (!crit.rankSession) {
            const pool = this.pughMatrix.columns.map(c => c.id);
            const baselineId = pool[0] || null;
            const selections = {};
            pool.forEach(id => { if (id !== baselineId) selections[id] = 'S'; });
            crit.rankSession = {
                pool,
                settled: [],
                baselineId,
                selections,
                lastRoundWinners: [],
                finished: pool.length === 0
            };
        }
        return crit.rankSession;
    }

    // Starts a brand new ranking session for a criteria, discarding any in-progress
    // one - used when the person explicitly wants to redo a criteria's ranking from
    // scratch (its previously *finalized* score isn't touched until this new session
    // itself finishes and overwrites it).
    restartRankSession(critId) {
        const crit = this.pughMatrix.criteria.find(c => c.id === critId);
        if (!crit) return;
        delete crit.rankSession;
        this.getOrInitRankSession(crit);
        this.renderPughPanel();
    }

    handlePughReRank(critId) {
        const crit = this.pughMatrix.criteria.find(c => c.id === critId);
        if (!crit) return;
        const session = this.getOrInitRankSession(crit);
        if (session.finished || !session.baselineId) return;

        const winners = session.pool.filter(id => id !== session.baselineId && session.selections[id] === '+');

        if (winners.length > 0) {
            const newBaselineId = winners.length === 1 ? winners[0] : winners[Math.floor(Math.random() * winners.length)];
            session.lastRoundWinners = winners.slice();
            // Reorder the pool for display purposes - the round's winner(s) float to
            // the front (chosen new baseline first), the old baseline (which just
            // lost its spot) comes right after, then everyone still on 'S'.
            const others = session.pool.filter(id => id !== newBaselineId);
            const remainingWinners = winners.filter(id => id !== newBaselineId);
            const oldBaselineId = session.baselineId;
            const sTied = others.filter(id => id !== oldBaselineId && !remainingWinners.includes(id));
            session.pool = [newBaselineId, ...remainingWinners, oldBaselineId, ...sTied];
            session.baselineId = newBaselineId;
        } else {
            // Nothing beat the baseline - it's confirmed as the next-best remaining
            // solution for this criteria.
            session.lastRoundWinners = [session.baselineId];
            session.settled.push(session.baselineId);
            session.pool = session.pool.filter(id => id !== session.baselineId);
            session.baselineId = session.pool[0] || null;
        }

        if (session.pool.length <= 1) {
            // Either nothing (or exactly one item, trivially settled) is left to
            // compare - fold it in and finish up.
            if (session.pool.length === 1) session.settled.push(session.pool[0]);
            session.pool = [];
            session.baselineId = null;
            session.finished = true;
            this.finalizePughRanking(critId);
        } else {
            session.selections = {};
            session.pool.forEach(id => { if (id !== session.baselineId) session.selections[id] = 'S'; });
        }

        this.renderPughPanel();
        this.autosave();
    }

    // Converts a finished session's final winner-to-loser order into bounded scores
    // (N points for 1st place down to 1 point for last) and writes them in, replacing
    // whatever this criteria's scores were before - so re-running the ranking for the
    // same criteria as many times as you like always just *overwrites* its scores
    // with a fresh, equally-bounded result, rather than the number climbing higher
    // every time you redo it.
    finalizePughRanking(critId) {
        const crit = this.pughMatrix.criteria.find(c => c.id === critId);
        if (!crit || !crit.rankSession) return;
        const order = crit.rankSession.settled;
        const n = order.length;
        order.forEach((colId, idx) => {
            this.setPughScore(critId, colId, n - idx);
        });
    }

    // Reorders the solution columns left-to-right by total score across every
    // criteria (winner first) - "overall rank" taking every ranked criteria into
    // account, not just the one currently active.
    reorderPughColumnsByOverallRank() {
        const m = this.pughMatrix;
        const totals = {};
        m.columns.forEach(col => { totals[col.id] = this.computePughColumnTotal(col.id); });
        m.columns.sort((a, b) => totals[b.id] - totals[a.id]);
        this.renderPughPanel();
        this.autosave();
    }

    // Reorders the solution columns left-to-right by just one criteria's score.
    reorderPughColumnsByCriteria(critId) {
        const m = this.pughMatrix;
        m.columns.sort((a, b) => this.getPughScore(critId, b.id) - this.getPughScore(critId, a.id));
        this.renderPughPanel();
        this.autosave();
    }

    // Builds the baseline/S+/re-rank UI for whichever criteria is currently active
    // in rank mode - see the ranking-mode block comment above getOrInitRankSession.
    buildPughRankPanel(crit) {
        const session = this.getOrInitRankSession(crit);
        const panel = document.createElement('div');
        panel.className = 'pugh-rank-panel';

        const getColTitle = (id) => {
            const col = this.pughMatrix.columns.find(c => c.id === id);
            return (col && col.title) ? col.title : '(unnamed solution)';
        };

        const title = document.createElement('div');
        title.className = 'pugh-rank-title';
        title.textContent = 'Ranking: ' + (crit.name || '(unnamed criteria)');
        panel.appendChild(title);

        if (session.finished) {
            const done = document.createElement('div');
            done.className = 'pugh-rank-done';
            done.textContent = 'Done - final order: ' + session.settled.map(getColTitle).join('  >  ');
            panel.appendChild(done);
            const restartBtn = document.createElement('button');
            restartBtn.className = 'pugh-rerank-btn';
            restartBtn.textContent = 'Re-rank from scratch';
            restartBtn.addEventListener('click', () => this.restartRankSession(crit.id));
            panel.appendChild(restartBtn);
            return panel;
        }

        const baselineRow = document.createElement('div');
        baselineRow.className = 'pugh-rank-baseline-row';
        if (session.lastRoundWinners.includes(session.baselineId)) {
            baselineRow.classList.add('pugh-rank-round-winner');
        }
        baselineRow.textContent = 'Baseline: ' + getColTitle(session.baselineId);
        panel.appendChild(baselineRow);

        const table = document.createElement('table');
        table.className = 'pugh-rank-table';
        session.pool.filter(id => id !== session.baselineId).forEach(id => {
            const tr = document.createElement('tr');
            if (session.lastRoundWinners.includes(id)) tr.classList.add('pugh-rank-round-winner');

            const nameTd = document.createElement('td');
            nameTd.textContent = getColTitle(id);
            tr.appendChild(nameTd);

            ['S', '+'].forEach(choice => {
                const td = document.createElement('td');
                const btn = document.createElement('button');
                btn.textContent = choice;
                btn.className = 'pugh-rank-choice-btn' + (session.selections[id] === choice ? ' active' : '');
                btn.addEventListener('click', () => {
                    session.selections[id] = choice;
                    this.renderPughPanel();
                });
                td.appendChild(btn);
                tr.appendChild(td);
            });
            table.appendChild(tr);
        });
        panel.appendChild(table);

        const reRankBtn = document.createElement('button');
        reRankBtn.className = 'pugh-rerank-btn';
        reRankBtn.textContent = 'Re-rank';
        reRankBtn.addEventListener('click', () => this.handlePughReRank(crit.id));
        panel.appendChild(reRankBtn);

        return panel;
    }

    // Builds the Pugh Matrix table fresh into #pugh-panel-body. Called on open and
    // after every add/delete/select-node change; individual keystrokes into the
    // number/text inputs update the underlying data directly without a full re-render
    // (see the input handlers below) so focus/cursor position isn't lost while typing.
    renderPughPanel() {
        if (!this.pughPanelBody) return;
        const m = this.pughMatrix;
        this.pughPanelBody.innerHTML = '';
        this.pughPanelBody.style.display = this._leftPanelMode === 'pugh' ? 'flex' : 'none';

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'pugh-toolbar';
        const addCritBtn = document.createElement('button');
        addCritBtn.textContent = '+ Add Criteria';
        addCritBtn.addEventListener('click', () => this.addPughCriteria());
        const addColBtn = document.createElement('button');
        addColBtn.textContent = '+ Add Solution';
        addColBtn.addEventListener('click', () => this.addPughColumn());
        toolbar.appendChild(addCritBtn);
        toolbar.appendChild(addColBtn);

        const rankBtn = document.createElement('button');
        rankBtn.textContent = this._pughRankMode ? '🏆 Rank: ON' : '🏆 Rank';
        rankBtn.className = this._pughRankMode ? 'pugh-rank-toggle-btn active' : 'pugh-rank-toggle-btn';
        rankBtn.title = 'Click a criteria name to rank the solutions against it';
        rankBtn.addEventListener('click', () => {
            this._pughRankMode = !this._pughRankMode;
            if (!this._pughRankMode) this._pughActiveCriteriaId = null;
            this.renderPughPanel();
        });
        toolbar.appendChild(rankBtn);

        if (m.columns.length > 1) {
            const overallBtn = document.createElement('button');
            overallBtn.textContent = 'Overall Rank';
            overallBtn.title = 'Reorder solutions by total score across all criteria';
            overallBtn.addEventListener('click', () => this.reorderPughColumnsByOverallRank());
            toolbar.appendChild(overallBtn);

            if (this._pughActiveCriteriaId && m.criteria.some(c => c.id === this._pughActiveCriteriaId)) {
                const activeBtn = document.createElement('button');
                activeBtn.textContent = 'This Criteria Rank';
                activeBtn.title = 'Reorder solutions by score for the active criteria only';
                activeBtn.addEventListener('click', () => this.reorderPughColumnsByCriteria(this._pughActiveCriteriaId));
                toolbar.appendChild(activeBtn);
            }
        }

        this.pughPanelBody.appendChild(toolbar);

        if (this._pughRankMode) {
            const activeCrit = m.criteria.find(c => c.id === this._pughActiveCriteriaId);
            if (activeCrit && m.columns.length >= 2) {
                this.pughPanelBody.appendChild(this.buildPughRankPanel(activeCrit));
            } else {
                const note = document.createElement('div');
                note.className = 'pugh-empty-state';
                note.textContent = activeCrit
                    ? 'Add at least 2 solutions to rank against each other.'
                    : 'Click into a criteria\'s name below to rank the solutions against it.';
                this.pughPanelBody.appendChild(note);
            }
        }

        if (m.columns.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'pugh-empty-state';
            empty.textContent = 'No solutions yet - click "+ Add Solution" to start comparing options.';
            this.pughPanelBody.appendChild(empty);
            return;
        }

        const wrap = document.createElement('div');
        wrap.className = 'pugh-table-wrap';
        const table = document.createElement('table');
        table.className = 'pugh-table';

        // Header row
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const critTh = document.createElement('th');
        critTh.className = 'pugh-criteria-cell';
        critTh.textContent = 'Criteria';
        headRow.appendChild(critTh);

        m.columns.forEach(col => {
            const th = document.createElement('th');
            th.className = 'pugh-col-header';

            const row = document.createElement('div');
            row.className = 'pugh-col-header-row';

            // A textarea (not a single-line input) so long solution names wrap onto
            // multiple lines instead of being clipped or scrolling horizontally.
            const titleInput = document.createElement('textarea');
            titleInput.className = 'pugh-col-title-input';
            titleInput.rows = 1;
            titleInput.value = col.title || '';
            titleInput.placeholder = 'Solution name';
            titleInput.addEventListener('input', () => {
                col.title = titleInput.value;
                this._pendingPughSave = true;
                this.resizeReflectionAnswer(titleInput);
            });
            titleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    titleInput.blur();
                }
            });
            titleInput.addEventListener('blur', () => {
                if (this._pendingPughSave) { this._pendingPughSave = false; this.autosave(); }
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'pugh-delete-col-btn';
            delBtn.title = 'Delete this solution column';
            delBtn.textContent = '\u00d7';
            delBtn.addEventListener('click', () => this.deletePughColumn(col.id));

            row.appendChild(titleInput);
            row.appendChild(delBtn);
            th.appendChild(row);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        // Highest base score per column, used to highlight that single cell (or
        // cells, in a tie) below - skipped for columns where every score is equal
        // (nothing to single out) or there's only one criterion to compare.
        const maxScorePerColumn = {};
        m.columns.forEach(col => {
            if (m.criteria.length < 2) { maxScorePerColumn[col.id] = null; return; }
            const scores = m.criteria.map(crit => this.getPughScore(crit.id, col.id));
            const allEqual = scores.every(s => s === scores[0]);
            maxScorePerColumn[col.id] = allEqual ? null : Math.max(...scores);
        });

        // Body rows (one per criterion)
        const tbody = document.createElement('tbody');
        m.criteria.forEach(crit => {
            const tr = document.createElement('tr');

            const nameTd = document.createElement('td');
            nameTd.className = 'pugh-criteria-cell';
            const nameRow = document.createElement('div');
            nameRow.style.display = 'flex';
            nameRow.style.alignItems = 'center';
            nameRow.style.gap = '4px';
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'pugh-criteria-input';
            nameInput.value = crit.name || '';
            nameInput.placeholder = 'Criteria name';
            nameInput.addEventListener('input', () => {
                crit.name = nameInput.value;
                this._pendingPughSave = true;
            });
            nameInput.addEventListener('focus', () => {
                // The criteria currently being typed into is what "Rank" mode ranks
                // the solutions against.
                if (this._pughRankMode && this._pughActiveCriteriaId !== crit.id) {
                    this._pughActiveCriteriaId = crit.id;
                    this.renderPughPanel();
                }
            });
            nameInput.addEventListener('blur', () => {
                if (this._pendingPughSave) { this._pendingPughSave = false; this.autosave(); }
            });
            const delRowBtn = document.createElement('button');
            delRowBtn.className = 'pugh-delete-row-btn';
            delRowBtn.title = 'Delete this criteria';
            delRowBtn.textContent = '\u00d7';
            delRowBtn.addEventListener('click', () => this.deletePughCriteria(crit.id));
            nameRow.appendChild(nameInput);
            nameRow.appendChild(delRowBtn);
            nameTd.appendChild(nameRow);
            tr.appendChild(nameTd);

            m.columns.forEach(col => {
                const td = document.createElement('td');
                td.className = 'pugh-score-cell';
                td.dataset.critId = crit.id;
                td.dataset.colId = col.id;
                const score = this.getPughScore(crit.id, col.id);
                if (maxScorePerColumn[col.id] !== null && score === maxScorePerColumn[col.id]) {
                    td.classList.add('pugh-top-score-cell');
                }
                const scoreInput = document.createElement('input');
                scoreInput.type = 'number';
                scoreInput.className = 'pugh-score-input';
                scoreInput.value = score;
                scoreInput.dataset.critId = crit.id;
                scoreInput.dataset.colId = col.id;
                scoreInput.addEventListener('input', () => {
                    const v = parseFloat(scoreInput.value);
                    this.setPughScore(crit.id, col.id, isNaN(v) ? 0 : v);
                    this._pendingPughSave = true;
                    this.refreshPughComputedDisplays();
                });
                scoreInput.addEventListener('blur', () => {
                    if (this._pendingPughSave) { this._pendingPughSave = false; this.autosave(); }
                });
                td.appendChild(scoreInput);
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        // Totals row - label left-aligned, and one cell per solution column so the
        // totals line up directly under their column's score cells above.
        const tfoot = document.createElement('tfoot');
        const totalsRow = document.createElement('tr');
        totalsRow.className = 'pugh-total-row';
        totalsRow.id = 'pugh-totals-row';
        const totalLabelTd = document.createElement('td');
        totalLabelTd.colSpan = 1;
        totalLabelTd.textContent = 'Total Score';
        totalLabelTd.style.textAlign = 'right';
        totalsRow.appendChild(totalLabelTd);

        const totals = m.columns.map(col => this.computePughColumnTotal(col.id));
        const maxTotal = totals.length ? Math.max(...totals) : null;
        const hasSpread = totals.some(t => t !== totals[0]);
        m.columns.forEach((col, i) => {
            const td = document.createElement('td');
            td.className = 'pugh-score-cell';
            td.dataset.colId = col.id;
            td.textContent = totals[i];
            if (m.criteria.length > 0 && maxTotal !== null && totals[i] === maxTotal && hasSpread) {
                td.classList.add('pugh-max-weighted-cell');
            }
            totalsRow.appendChild(td);
        });
        tfoot.appendChild(totalsRow);
        table.appendChild(tfoot);

        wrap.appendChild(table);
        this.pughPanelBody.appendChild(wrap);

        this.applyMobileViewState();
        this.pughPanelBody.querySelectorAll('.pugh-col-title-input').forEach(ta => {
            this.resizeReflectionAnswer(ta);
        });
    }

    // Cheap update used while typing weights/scores: recomputes the totals row and
    // the per-column top-score highlight in place, instead of rebuilding (and losing
    // focus/cursor position in) the whole table.
    refreshPughComputedDisplays() {
        const m = this.pughMatrix;

        const maxScorePerColumn = {};
        m.columns.forEach(col => {
            if (m.criteria.length < 2) { maxScorePerColumn[col.id] = null; return; }
            const scores = m.criteria.map(crit => this.getPughScore(crit.id, col.id));
            const allEqual = scores.every(s => s === scores[0]);
            maxScorePerColumn[col.id] = allEqual ? null : Math.max(...scores);
        });
        this.pughPanelBody.querySelectorAll('.pugh-score-cell[data-crit-id]').forEach(td => {
            const critId = td.dataset.critId;
            const colId = td.dataset.colId;
            const score = this.getPughScore(critId, colId);
            const isTop = maxScorePerColumn[colId] !== null && score === maxScorePerColumn[colId];
            td.classList.toggle('pugh-top-score-cell', isTop);
        });

        const row = document.getElementById('pugh-totals-row');
        if (!row) return;
        const totals = m.columns.map(col => this.computePughColumnTotal(col.id));
        const maxTotal = totals.length ? Math.max(...totals) : null;
        const hasSpread = totals.some(t => t !== totals[0]);
        const cells = row.querySelectorAll('td[data-col-id]');
        cells.forEach((td, i) => {
            td.textContent = totals[i];
            const isMax = m.criteria.length > 0 && maxTotal !== null && totals[i] === maxTotal && hasSpread;
            td.classList.toggle('pugh-max-weighted-cell', isMax);
        });
    }

    exportAsJSON() {
        function stripParents(node) {
            const { name, children, color, _collapsed, _reflectionAnswers, _isPlaceholder } = node;
            const out = { name };
            if (color) out.color = color;
            if (_collapsed) out._collapsed = true;
            if (_isPlaceholder) out._isPlaceholder = true;
            if (Array.isArray(_reflectionAnswers) && _reflectionAnswers.some(a => a && a.trim())) {
                out._reflectionAnswers = _reflectionAnswers;
            }
            if (children) out.children = children.map(stripParents);
            return out;
        }
        return JSON.stringify({
            tree: stripParents(this.rootData),
            customConnections: this.customConnections.map(conn => ({
                source: conn.source.name,
                target: conn.target.name,
                _offset: conn._offset || 0
            })),
            orientation: this.orientation,
            showPlaceholders: this.showPlaceholders,
            transform: { x: this.transform.x, y: this.transform.y, k: this.transform.k },
            pughMatrix: this.pughMatrix,
            globalNotes: this.globalNotes,
            notesDrawings: this.notesDrawings,
            notesImages: this.notesImages
        }, null, 2);
    }

    exportAllAsJSON() {
        this.saveCurrentFlowchart();
        const exportData = this.flowchartList.map(item => ({
            title: item.title,
            data: item.data
        }));
        return JSON.stringify(exportData, null, 2);
    }

    exportAsText() {
        function walk(node, depth = 0) {
            let lines = [];
            lines.push(' '.repeat(depth * 2) + node.name);
            if (node.children) {
                for (const child of node.children) {
                    lines = lines.concat(walk(child, depth + 1));
                }
            }
            return lines;
        }
        return walk(this.rootData).join('\n');
    }

    // ===== AI EXPORT (Auto-copy to clipboard) =====
    // Marks the end of the human-readable explanation block and the start of the
    // actual tree data in AI exports/imports (see exportToAi/convertToTreeDiagram
    // and parseTreeDiagram).
    static AI_TREE_MARKER = '=== TREE START (parse everything below this line) ===';

    // The block of instructions prepended to every AI export, explaining the
    // indentation/bullet/prefix format well enough that an LLM reading it can
    // understand - and correctly modify - the tree structure below it.
    getAiTreeInstructions() {
        return [
            'The outline below represents a tree-structured flowchart. Format:',
            '- Each line is one node; indentation (4 spaces per level) shows parent/child nesting - a node\'s children are the lines directly below it indented one level deeper.',
            '- Every node line starts with "- ".',
            '- A line prefixed "(solution) " is a Solution node (green).',
            '- A line prefixed "(assumption) " is an Assumption node (pink).',
            '- A line with neither prefix is a plain/neutral node.',
            '- A line may end with a "[color=NAME]" tag (blue, yellow, or empty) to set a non-default color; omit it for plain/solution/assumption nodes.',
            'When editing or regenerating this tree, keep the same indentation, "- " bullets, and prefixes/tags so it can be re-imported.',
            '',
            FlowchartViewer.AI_TREE_MARKER,
            ''
        ].join('\n');
    }

    exportToAi() {
        const treeString = this.getAiTreeInstructions() + this.convertToTreeDiagram();
        
        // Copy to clipboard
        navigator.clipboard.writeText(treeString).then(() => {
            this.showNotification('AI tree copied to clipboard!');
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = treeString;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                this.showNotification('AI tree copied to clipboard!');
            } catch (err) {
                this.showNotification('Failed to copy. Please copy manually.');
            }
            document.body.removeChild(textarea);
        });
    }

    getColorMetadataSuffix(color) {
        if (!color) return '';
        const normalized = (color || '').toLowerCase();
        const colorNames = {
            '#00a67e': 'green',
            '#e75480': 'pink',
            '#0074d9': 'blue',
            '#ffcc00': 'yellow',
            '#323a4a': 'empty'
        };
        const token = colorNames[normalized] || color;
        if (token === 'green' || token === 'pink') return '';
        return ` [color=${token}]`;
    }

    parseColorMetadata(name) {
        let text = name || '';
        let color = undefined;
        const match = text.match(/\s*\[color\s*[:=]\s*([^\]]+)\]$/i);
        if (match) {
            const token = (match[1] || '').trim().toLowerCase();
            const colorMap = {
                'green': '#00a67e',
                'pink': '#e75480',
                'blue': '#0074d9',
                'yellow': '#ffcc00',
                'empty': '#323a4a',
                '#00a67e': '#00a67e',
                '#e75480': '#e75480',
                '#0074d9': '#0074d9',
                '#ffcc00': '#ffcc00',
                '#323a4a': '#323a4a'
            };
            color = colorMap[token];
            text = text.substring(0, match.index).trimEnd();
        }
        return { name: text, color };
    }

    convertToTreeDiagram() {
        // Don't try to guess/unwrap the "real" root here. A node with a blank name or no
        // color (including the invisible wrapper root, or a leftover placeholder that a
        // real child got added under) simply produces no bullet line for itself below -
        // its children are still visited and exported normally, so nothing gets dropped.
        const treeData = this.rootData;

        const lines = [];
        const prefixMap = {
            '#00a67e': '(solution) ',
            '#e75480': '(assumption) '
        };

        const getLabel = (node) => {
            let name = node.name || '';
            // Node names for Assumption (pink) nodes already carry a literal
            // "Assumption: " prefix baked into their data (see getNodeNameFromInput) -
            // strip it here so it isn't doubled up with the "(assumption)" marker below.
            if (name.startsWith('Assumption: ')) {
                name = name.substring('Assumption: '.length);
            }
            // Remove "(Simplify?)" suffix for display
            if (name.endsWith(' (Simplify?)')) {
                name = name.substring(0, name.length - ' (Simplify?)'.length);
            }
            const prefix = prefixMap[node.color] || '';
            const colorSuffix = this.getColorMetadataSuffix(node.color);
            return prefix + name + colorSuffix;
        };

        const buildTree = (node, depth = 0) => {
            const label = getLabel(node);
            const hasLabel = Boolean(label && label.trim());
            if (hasLabel) {
                const indent = '    '.repeat(depth);
                lines.push(`${indent}- ${label}`);
            }

            if (node.children && node.children.length > 0) {
                // Visit every child, even placeholder or blank-named ones - a node created
                // without a name or color (or a still-unconverted placeholder that had a
                // real child added under it) must not hide real content beneath it. Nodes
                // that themselves produce no label are simply skipped when printing, and
                // their children are kept at the same depth as their nearest labeled
                // ancestor so the indentation stays meaningful.
                node.children.forEach(child => {
                    buildTree(child, hasLabel ? depth + 1 : depth);
                });
            }
        };

        buildTree(treeData);
        return lines.join('\n');
    }

    // ===== AI IMPORT (Auto-read from clipboard) =====
    importFromAi() {
        // Try to read from clipboard
        navigator.clipboard.readText().then(text => {
            if (!text || !text.trim()) {
                this.showNotification('Clipboard is empty. Copy a tree diagram first.');
                return;
            }
            this.processAiTree(text);
        }).catch(() => {
            // Fallback: prompt user to paste
            const text = prompt('Paste the AI tree diagram:');
            if (text && text.trim()) {
                this.processAiTree(text);
            } else {
                this.showNotification('No text provided.');
            }
        });
    }

    processAiTree(text) {
        try {
            const tree = this.parseTreeDiagram(text);
            if (!tree) {
                this.showNotification('Failed to parse the tree diagram. Please check the format.');
                return;
            }

            // Apply colors based on explicit prefixes or encoded metadata; leave plain nodes uncolored
            const applyColors = (node) => {
                let name = node.name || '';
                let color = undefined;
                const parsed = this.parseColorMetadata(name);
                name = parsed.name;
                color = parsed.color;
                
                if (name.startsWith('(solution) ')) {
                    name = name.substring('(solution) '.length);
                    color = '#00a67e';
                } else if (name.startsWith('(assumption) ')) {
                    name = name.substring('(assumption) '.length);
                    color = '#e75480';
                }
                
                // Assumption (pink) nodes carry a literal "Assumption: " prefix baked
                // into their name everywhere else in the app (see getNodeNameFromInput) -
                // restore it here so an AI-imported assumption node behaves the same as
                // one created through the UI (node text, edit popup stripping, etc.)
                if (color === '#e75480' && !name.startsWith('Assumption: ')) {
                    name = 'Assumption: ' + name;
                }
                
                node.name = name;
                if (color) {
                    node.color = color;
                } else {
                    delete node.color;
                }
                
                if (node.children) {
                    node.children.forEach(child => applyColors(child));
                }
            };

            applyColors(tree);

            // Save current state
            if (this.rootData) {
                this.pushUndo();
            }

            // Ensure rightmost placeholder nodes
            this.rootData = this.wrapRootWithPlaceholder(tree);
            this.ensureRightmostPlaceholderNodes(this.rootData);
            
            // Clear custom connections
            this.customConnections = [];
            
            // Render the flowchart
            this.renderFlowchart(this.rootData);
            this.autosave();
            
            this.showNotification('Flowchart generated from AI tree!');
            
        } catch (error) {
            this.showNotification('Error parsing tree: ' + error.message);
        }
    }

    parseTreeDiagram(text) {
        // If this text still has the AI-export instructions block at the top (either
        // pasted back unchanged, or echoed back by the AI along with its response),
        // ignore everything up to and including the marker line - only what follows
        // it is actual tree data.
        const markerIndex = text.indexOf(FlowchartViewer.AI_TREE_MARKER);
        if (markerIndex !== -1) {
            text = text.slice(markerIndex + FlowchartViewer.AI_TREE_MARKER.length);
        }

        const lines = text.split('\n')
            .map(line => line.replace(/\r$/, ''))
            .filter(line => line.trim());

        if (lines.length === 0) return null;

        const parsedLines = [];
        for (const line of lines) {
            const leadingSpaces = line.length - line.trimStart().length;
            const trimmed = line.trim();
            const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
            const content = bulletMatch ? bulletMatch[1].trim() : trimmed.trim();

            if (!content) continue;
            parsedLines.push({ leadingSpaces, content });
        }

        if (parsedLines.length === 0) return null;

        const positiveIndents = parsedLines
            .map(item => item.leadingSpaces)
            .filter(count => count > 0);

        let indentUnit = 4;
        if (positiveIndents.length > 0) {
            let gcd = positiveIndents[0];
            for (const indent of positiveIndents.slice(1)) {
                let a = gcd;
                let b = indent;
                while (b) {
                    const remainder = a % b;
                    a = b;
                    b = remainder;
                }
                gcd = a;
            }
            if (gcd > 0) indentUnit = gcd;
        }

        const root = { name: '', color: '#00a67e' };
        const stack = [];

        for (const item of parsedLines) {
            const depth = item.leadingSpaces === 0 ? 0 : Math.round(item.leadingSpaces / indentUnit);
            const node = { name: item.content, color: '#00a67e' };

            while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
                stack.pop();
            }

            if (stack.length === 0) {
                root.name = node.name;
                root.children = root.children || [];
                if (!root.children.some(child => child.name === node.name)) {
                    root.children.push(node);
                }
                stack.push({ node, depth });
            } else {
                const parent = stack[stack.length - 1].node;
                if (!parent.children) parent.children = [];
                parent.children.push(node);
                stack.push({ node, depth });
            }
        }

        if (root.children && root.children.length === 1) {
            return root.children[0];
        }

        return root;
    }

    // ===== END AI IMPORT/EXPORT =====

    showExportPopup() {
        // Always snapshot current state before exporting
        this.saveCurrentFlowchart();
        this.exportTextarea.value = this.exportAllAsJSON();
        this.exportPopup.style.display = 'block';
        this.exportTextarea.select();
        
        if (!document.getElementById('open-file-export-btn')) {
            const buttonContainer = this.exportPopup.querySelector('div:last-child');
            const openFileBtn = document.createElement('button');
            openFileBtn.id = 'open-file-export-btn';
            openFileBtn.textContent = 'Open Text File';
            openFileBtn.style.cssText = 'font-size:15px; padding:6px 18px; border:1px solid #aaa; border-radius:5px; background:#e0f0ff; cursor:pointer; margin-right:8px;';
            openFileBtn.addEventListener('click', () => this.openFileForExport());
            buttonContainer.insertBefore(openFileBtn, buttonContainer.firstChild);
            
            const saveBtn = document.createElement('button');
            saveBtn.id = 'save-file-export-btn';
            saveBtn.textContent = 'Save to File';
            saveBtn.style.cssText = 'font-size:15px; padding:6px 18px; border:1px solid #aaa; border-radius:5px; background:#e0ffe0; cursor:pointer; margin-right:8px;';
            saveBtn.addEventListener('click', () => this.saveExportToFile());
            buttonContainer.insertBefore(saveBtn, buttonContainer.firstChild);
        }
    }
    
    openFileForExport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.json,text/plain,application/json';
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    JSON.parse(content);
                    this.exportTextarea.value = content;
                    this.exportTextarea.select();
                    this.showNotification('File loaded successfully');
                } catch (error) {
                    alert('The file does not contain valid JSON content');
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }
    
    saveExportToFile() {
        const content = this.exportTextarea.value;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'flowcharts.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showNotification('File saved');
    }

    importFromText() {
        const text = this.importTextarea.value;
        if (!text.trim()) {
            alert("Paste exported JSON to import.");
            return;
        }
        try {
            const importedData = JSON.parse(text);
            
            let flowchartsToImport = [];
            if (Array.isArray(importedData)) {
                flowchartsToImport = importedData;
            } else if (importedData.tree) {
                flowchartsToImport = [{
                    title: `Imported Flowchart ${this.flowchartList.length + 1}`,
                    data: text
                }];
            } else {
                throw new Error("Invalid format. Expected array of flowcharts or a single flowchart.");
            }
            
            flowchartsToImport = flowchartsToImport.filter(item => item && item.data);
            
            if (flowchartsToImport.length === 0) {
                alert("No valid flowcharts found in the import data.");
                return;
            }
            
            let saveCurrent = false;
            if (this.currentSlotIndex !== null && this.flowchartList[this.currentSlotIndex]) {
                saveCurrent = confirm("Save the current flowchart before importing?");
            }
            
            if (saveCurrent) {
                this.saveCurrentFlowchart();
            }
            
            // Do NOT reload from localStorage here - we work against the in-memory list
            // so dedup and index adjustments stay consistent
            
            let addedCount = 0;
            flowchartsToImport.forEach(item => {
                try {
                    JSON.parse(item.data);
                    const incomingTitle = item.title || `Imported Flowchart ${this.flowchartList.length + 1}`;

                    // Remove any existing flowchart with the same title
                    const dupeIdx = this.flowchartList.findIndex(f => f.title === incomingTitle);
                    if (dupeIdx !== -1) {
                        this.flowchartList.splice(dupeIdx, 1);
                        // Adjust currentSlotIndex after removal
                        if (this.currentSlotIndex === dupeIdx) {
                            this.currentSlotIndex = null;
                        } else if (this.currentSlotIndex !== null && this.currentSlotIndex > dupeIdx) {
                            this.currentSlotIndex--;
                        }
                    }

                    this.flowchartList.push({
                        title: incomingTitle,
                        data: item.data
                    });
                    addedCount++;
                } catch (e) {
                    console.warn('Skipping invalid flowchart entry:', e);
                }
            });
            
            this.saveFlowchartList();
            this.importPopup.style.display = 'none';
            
            if (addedCount > 0) {
                const newIndex = this.flowchartList.length - addedCount;
                this.loadFlowchartFromList(newIndex);
                this.autosave();
                this.showNotification(`Imported ${addedCount} flowchart(s)!`);
            } else {
                this.showNotification('No valid flowcharts were imported.');
            }
            
        } catch (e) {
            alert("Failed to import. Make sure the format is correct: " + e.message);
        }
    }

    showImportPopup() {
        this.importTextarea.value = '';
        this.importPopup.style.display = 'block';
        this.importTextarea.focus();
        
        if (!document.getElementById('open-file-import-btn')) {
            const buttonContainer = this.importPopup.querySelector('div:last-child');
            const openFileBtn = document.createElement('button');
            openFileBtn.id = 'open-file-import-btn';
            openFileBtn.textContent = 'Open Text File';
            openFileBtn.style.cssText = 'font-size:15px; padding:6px 18px; border:1px solid #aaa; border-radius:5px; background:#e0f0ff; cursor:pointer; margin-right:8px;';
            openFileBtn.addEventListener('click', () => this.openFileForImport());
            buttonContainer.insertBefore(openFileBtn, buttonContainer.firstChild);
        }
    }
    
    openFileForImport() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.json,text/plain,application/json';
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                this.importTextarea.value = e.target.result;
                this.showNotification('File loaded for import');
            };
            reader.readAsText(file);
        });
        input.click();
    }

    parseIndentedText(text) {
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        const rootStack = [];
        let root = null;
        let prevDepth = -1;
        for (let i = 0; i < lines.length; ++i) {
            const line = lines[i];
            const match = line.match(/^(\s*)(.*)$/);
            const depth = Math.floor(match[1].length / 2);
            const name = match[2].trim();
            const node = { name };
            if (depth === 0) {
                root = node;
                rootStack.length = 0;
                rootStack.push(node);
            } else {
                while (rootStack.length > depth) rootStack.pop();
                const parent = rootStack[rootStack.length - 1];
                if (!parent.children) parent.children = [];
                parent.children.push(node);
                rootStack.push(node);
            }
            prevDepth = depth;
        }
        if (!root) throw new Error("No root node found");
        return root;
    }

    getConnectionOffset(conn) {
        if (!conn._offset) conn._offset = 0;
        return conn._offset;
    }
    setConnectionOffset(conn, offset) {
        conn._offset = offset;
    }

    moveSelectedConnection(dx) {
        if (!this.selectedConnection) return;
        this.pushUndo();
        this.setConnectionOffset(this.selectedConnection, this.getConnectionOffset(this.selectedConnection) + dx);
        this.renderFlowchart(this.rootData);
        setTimeout(() => this.selectConnectionByData(this.selectedConnection), 0);
        this.autosave();
    }

    selectConnectionByData(conn) {
        this.selectedConnection = conn;
        this.connectionControlsRow.style.display = 'flex';
        this.connectionControls.style.display = 'flex';
        d3.selectAll('.custom-link').classed('selected', d => d === conn);
    }

    deselectConnection() {
        this.selectedConnection = null;
        this.connectionControlsRow.style.display = 'none';
        this.connectionControls.style.display = 'none';
        d3.selectAll('.custom-link').classed('selected', false);
    }

    selectNode(d) {
        this.selectedNode = d;
        this.nodeControlsRow.style.display = 'none';
        this.nodeControlsRow.innerHTML = '';
    }
    deselectNode() {
        this.selectedNode = null;
        this.nodeControlsRow.style.display = 'none';
        this.nodeControlsRow.innerHTML = '';
        this.refreshRadialButtons();
    }
    deleteSelectedNode() {
        // No-op since delete node button is removed
    }

    deleteSelectedConnection() {
        if (!this.selectedConnection) return;
        this.pushUndo();
        this.customConnections = this.customConnections.filter(conn => conn !== this.selectedConnection);
        this.deselectConnection();
        this.renderFlowchart(this.rootData);
        this.autosave();
    }

    syncTransform() {
        const oldSvg = this.flowchartContainer.querySelector('svg');
        if (oldSvg) {
            this.transform = d3.zoomTransform(oldSvg);
        }
    }

    renderFlowchart(data, options = {}) {
        const self = this;
        const { fitView = false, keepTransform = false } = options;
        if (fitView) {
            this.transform = d3.zoomIdentity;
        } else if (!keepTransform) {
            this.syncTransform();
        }
        this.rootData = this.wrapRootWithPlaceholder(data);
        this.ensureRightmostPlaceholderNodes(this.rootData);
        
        const contentRoot = this.rootData.children && this.rootData.children.length > 0
            ? this.rootData.children[0]
            : this.rootData;
        this.ensureRightmostPlaceholderNodes(contentRoot);
        
        const rootHierarchy = d3.hierarchy(this.rootData);
        this.updateSimplifyPrefixes(rootHierarchy);
        
        this.flowchartContainer.innerHTML = '';

        const width = this.flowchartPanel.clientWidth;
        const height = this.flowchartPanel.clientHeight;

        const svg = d3.select('#flowchart')
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`);

        const g = svg.append('g');
        this._flowchartG = g;

        this.setupZoom(svg, g);

        const childrenAccessor = d => {
            if (d._collapsed) return null;
            if (!d.children) return null;
            // The root placeholder (the tree's own top node) is never filtered here since this
            // accessor only ever hides *children* of a node, never the node passed in as root.
            if (this.showPlaceholders) return d.children;
            // The node currently open in the edit popup is always kept, even on the off
            // chance it's flagged placeholder (e.g. via the explicit "Empty" button) -
            // otherwise, with "hide placeholders" on, editing a node and picking that
            // color would yank it off the canvas out from under the person mid-edit.
            const editingData = this.nodeBeingEdited ? this.nodeBeingEdited.data : null;
            return d.children.filter(child =>
                !this.isPlaceholderNodeData(child) || child === editingData || child === this._pendingEditData
            );
        };
        const root = d3.hierarchy(this.rootData, childrenAccessor);
        this._lastRenderedRoot = root;

        if (this.arrangement === 'indented') {
            const secondarySpacing = this.orientation === 'LR' ? this.lrNodeSpacing : this.tbHorizontalSpacing;
            const primarySpacing = this.orientation === 'LR' ? 160 : this.tbVerticalSpacing;
            this.applyIndentedLayout(root, secondarySpacing, primarySpacing);
        } else {
            const treeLayout = d3.tree()
                .nodeSize(this.orientation === 'LR' ? [this.lrNodeSpacing, 160] : [this.tbHorizontalSpacing, this.tbVerticalSpacing])
                // By default d3 doubles the separation between nodes that don't share a parent,
                // which is what makes the gap between two sibling trees (measured leaf-to-leaf)
                // balloon far past the gap between plain childless siblings. Using a uniform
                // separation keeps every pair of adjacent nodes at the same minimum distance,
                // whether they're true siblings or the closest edges of two neighboring subtrees.
                .separation(() => 1);
            treeLayout(root);
        }

        if (this.orientation === 'LR') {
            root.each(node => {
                const temp = node.x;
                node.x = node.y;
                node.y = temp;
            });
        }

        const cornerRadius = 10;
        const linkGroup = g.append('g')
            .selectAll('path')
            .data(root.links())
            .enter()
            .append('path')
            .attr('class', 'link')
            .attr('d', d => {
                const snap10 = v => Math.round(v / 10) * 10;
                return this.computeLinkPathD(snap10(d.source.x), snap10(d.source.y), snap10(d.target.x), snap10(d.target.y), cornerRadius);
            });

        if (this.customConnections.length > 0) {
            const nodeMap = new Map();
            root.each(d => {
                nodeMap.set(d.data, d);
            });

            this.customConnections = this.customConnections.filter(conn => {
                return nodeMap.has(conn.source) && nodeMap.has(conn.target);
            });

            const customLinksGroup = g.append('g');

            const verticalEntry = 80;
            const fillet = 10;

            customLinksGroup
                .selectAll('.custom-link-hit')
                .data(this.customConnections)
                .enter()
                .append('path')
                .attr('class', 'custom-link-hit')
                .attr('d', d => {
                    const snap10 = v => Math.round(v / 10) * 10;
                    const source = nodeMap.get(d.source);
                    const target = nodeMap.get(d.target);
                    if (!source || !target) return '';
                    const offset = this.getConnectionOffset(d);
                    const sourceX = snap10(source.x);
                    const sourceY = snap10(source.y);
                    const targetX = snap10(target.x);
                    const targetY = snap10(target.y);
                    const elbowY = snap10(sourceY + 50);
                    const elbowX = snap10(sourceX + offset - 10);
                    const entryY = snap10(targetY - verticalEntry);

                    let path = `M ${sourceX},${sourceY}`;
                    path += ` L ${sourceX},${elbowY - fillet}`;
                    path += ` Q ${sourceX},${elbowY} ${sourceX + Math.sign(offset) * fillet},${elbowY}`;
                    path += ` L ${elbowX - Math.sign(offset) * fillet},${elbowY}`;
                    path += ` Q ${elbowX},${elbowY} ${elbowX},${elbowY + fillet}`;
                    path += ` L ${elbowX},${entryY - fillet}`;
                    path += ` Q ${elbowX},${entryY} ${elbowX + Math.sign(targetX - elbowX) * fillet},${entryY}`;
                    path += ` L ${targetX - Math.sign(targetX - elbowX) * fillet},${entryY}`;
                    path += ` Q ${targetX},${entryY} ${targetX},${entryY + fillet}`;
                    path += ` L ${targetX},${targetY}`;
                    return path;
                })
                .style('fill', 'none')
                .style('stroke', 'rgba(0,0,0,0)')
                .style('stroke-width', 18)
                .style('cursor', 'pointer')
                .on('click', (event, d) => {
                    event.stopPropagation();
                    if (this.selectedConnection === d) {
                        this.deselectConnection();
                    } else {
                        this.selectConnectionByData(d);
                    }
                });

            customLinksGroup
                .selectAll('.custom-link')
                .data(this.customConnections)
                .enter()
                .append('path')
                .attr('class', 'custom-link link')
                .classed('selected', d => d === this.selectedConnection)
                .attr('d', d => {
                    const snap10 = v => Math.round(v / 10) * 10;
                    const source = nodeMap.get(d.source);
                    const target = nodeMap.get(d.target);
                    if (!source || !target) return '';
                    const offset = this.getConnectionOffset(d);
                    const sourceX = snap10(source.x);
                    const sourceY = snap10(source.y);
                    const targetX = snap10(target.x);
                    const targetY = snap10(target.y);
                    const elbowY = snap10(sourceY + 50);
                    const elbowX = snap10(sourceX + offset);
                    const entryY = snap10(targetY - verticalEntry);

                    let path = `M ${sourceX},${sourceY}`;
                    path += ` L ${sourceX},${elbowY - fillet}`;
                    path += ` Q ${sourceX},${elbowY} ${sourceX + Math.sign(offset) * fillet},${elbowY}`;
                    path += ` L ${elbowX - Math.sign(offset) * fillet},${elbowY}`;
                    path += ` Q ${elbowX},${elbowY} ${elbowX},${elbowY + fillet}`;
                    path += ` L ${elbowX},${entryY - fillet}`;
                    path += ` Q ${elbowX},${entryY} ${elbowX + Math.sign(targetX - elbowX) * fillet},${entryY}`;
                    path += ` L ${targetX - Math.sign(targetX - elbowX) * fillet},${entryY}`;
                    path += ` Q ${targetX},${entryY} ${targetX},${entryY + fillet}`;
                    path += ` L ${targetX},${targetY}`;
                    return path;
                })
                .on('click', (event, d) => {
                    event.stopPropagation();
                    if (this.selectedConnection === d) {
                        this.deselectConnection();
                    } else {
                        this.selectConnectionByData(d);
                    }
                });

            d3.select('svg').on('click.deselectconn', (event) => {
                if (event.target.tagName === 'svg') {
                    this.deselectConnection();
                }
            });
        } else {
            d3.select('svg').on('click.deselectconn', null);
            this.deselectConnection();
        }

        // Empty/placeholder nodes are drawn first (painted underneath) and real nodes
        // after (painted on top) - otherwise, as a sticky node slides past an empty
        // stub sitting further along the same row/column, whichever one happened to
        // come later in root.descendants() would visually cover the other, and empty
        // stubs shouldn't be able to obscure a real node passing behind them.
        const orderedDescendants = root.descendants().slice().sort((a, b) =>
            (this.isEmptyIndentedNode(a) ? 0 : 1) - (this.isEmptyIndentedNode(b) ? 0 : 1)
        );

        const node = g.append('g')
            .selectAll('.node')
            .data(orderedDescendants)
            .enter()
            .append('g')
            .attr('class', 'node')
            .attr('transform', d => {
                const snap10 = v => Math.round(v / 10) * 10;
                return `translate(${snap10(d.x)},${d.y})`;
            })
            .on('mousedown', (event, d) => {
                if (event.button === 0 && event.ctrlKey) {
                    this.startCtrlDragNode(event, d);
                }
            })
            .on('click', (event, d) => {
                if (event.button === 0) {
                    if (this.skipNextNodeClick) {
                        this.skipNextNodeClick = false;
                        return;
                    }
                    event.stopPropagation();
                    this.centerNodeOnMobile(d, () => {
                        this.showNodeEditPopup(d);
                        this.selectNode(d);
                        this.refreshRadialButtons();
                    });
                }
            })
            .on('dblclick', (event, d) => {
                event.stopPropagation();
                if (d && d.data && d.data.children && d.data.children.length > 0) {
                    this.toggleNodeCollapse(d);
                }
            })
            .on('contextmenu', (event, d) => {
                event.preventDefault();
                // Long-press (which fires as 'contextmenu' on mobile) is imprecise
                // enough that a press near - but not really on - a node can still
                // register as landing on it, opening the edit popup for a node the
                // person didn't mean to touch. A plain tap already opens the same
                // popup reliably via the 'click' handler above, so on mobile there's
                // no need for long-press to do anything beyond blocking the browser's
                // own native context menu.
                if (window.matchMedia('(max-width: 600px)').matches) return;
                this.showNodeEditPopup(d);
                this.selectNode(d);
                this.refreshRadialButtons();
            });

        const NODE_WIDTH = this.NODE_WIDTH;
        const LINE_HEIGHT = 18;
        const PADDING_Y = 12;
        const FONT_SIZE = 13;
        const FONT_FAMILY = 'Arial, sans-serif';

        function measureTextWidth(text) {
            const svg = d3.select('body').append('svg').attr('style', 'position:absolute;left:-9999px;top:-9999px');
            const tempText = svg.append('text')
                .attr('font-size', FONT_SIZE)
                .attr('font-family', FONT_FAMILY)
                .text(text);
            const width = tempText.node().getComputedTextLength();
            svg.remove();
            return width;
        }

        node.each(function(d) {
            const rawName = d.data.name || '';
            if (rawName) {
                d.data.name = rawName.replace(/^\s*\S/, ch => ch.toUpperCase());
            }
            const words = d.data.name.split(/(\s+)/);
            let lines = [];
            let current = '';
            words.forEach(word => {
                const testLine = (current + word).trim();
                if (testLine && measureTextWidth(testLine) > NODE_WIDTH - 16) {
                    if (current) lines.push(current.trim());
                    current = word.trim();
                } else {
                    current += word;
                }
            });
            if (current.trim()) lines.push(current.trim());
            d._lines = lines.length ? lines : [d.data.name || ''];
        });

        node.append('rect')
        .attr('width', NODE_WIDTH)
        .attr('height', d => d._lines.length * LINE_HEIGHT + PADDING_Y)
        .attr('x', -NODE_WIDTH/2)
        .attr('y', d => -((d._lines.length * LINE_HEIGHT + PADDING_Y)/2))
        .attr('fill', d => {
            if (this.isPlaceholderNodeData(d.data)) {
                return this.getPlaceholderColor();
            }
            const sourceNodes = new Set(this.customConnections.map(conn => conn.source));
            const hasHierarchicalChildren = d.children && d.children.length > 0;
            const hasCustomConnections = sourceNodes.has(d.data);
            const isParentNode = hasHierarchicalChildren || hasCustomConnections;
            if (isParentNode) {
                return d.data.color || '#00a67e';
            }
            return d.data.color || '#00a67e';
        })
        .attr('stroke', d => {
            if (this.isPlaceholderNodeData(d.data)) {
                return this.getPlaceholderColor();
            }
            return d.data._collapsed ? '#ffcc00' : '#999';
        })
        .attr('stroke-width', d => {
            if (this.isPlaceholderNodeData(d.data)) {
                return '0';
            }
            return d.data._collapsed ? '3px' : '1.5px';
        });

        node.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', FONT_SIZE)
        .attr('font-weight', 'bold')
        .attr('fill', d => {
            if (this.isPlaceholderNodeData(d.data)) {
                return this.getPlaceholderColor();
            }
            const fill = d.data.color || '#00a67e';
            function hexToRgb(hex) {
                if (!hex) return { r: 0, g: 0, b: 0 };
                if (hex[0] === '#') hex = hex.slice(1);
                if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
                const int = parseInt(hex, 16);
                return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
            }
            const { r, g, b } = hexToRgb(fill);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness > 150 ? '#000000' : '#ffffff';
        })
        .selectAll('tspan')
        .data(d => d._lines.map((line, i, arr) => ({
            line,
            y: (i - (arr.length-1)/2) * LINE_HEIGHT + 4,
            isLast: i === arr.length - 1,
            collapsed: d.data._collapsed
        })))
        .enter()
        .append('tspan')
        .attr('x', 0)
        .attr('y', d => d.y)
        .text(d => d.line);

        const collapseArrowOrientation = this.orientation;
        node.each(function(d) {
            if (d.data._collapsed) {
                const text = d3.select(this).select('text');
                if (collapseArrowOrientation === 'LR') {
                    // Children extend to the right in LR mode, so the fold/unfold
                    // indicator sits just outside the node's right edge instead of below it.
                    text.append('tspan')
                        .attr('x', NODE_WIDTH / 2 + 16)
                        .attr('y', 4)
                        .attr('fill', '#ffffff')
                        .attr('font-size', FONT_SIZE + 3)
                        .text('▶');
                } else {
                    text.append('tspan')
                        .attr('x', 0)
                        .attr('y', d._lines.length * LINE_HEIGHT / 2 + 25)
                        .attr('fill', '#ffffff')
                        .attr('font-size', FONT_SIZE + 3)
                        .text('▼');
                }
            }
        });

        const isIdentity = (t) => t.k === 1 && t.x === 0 && t.y === 0;
        if (fitView || isIdentity(this.transform)) {
            const bounds = g.node().getBBox();
            const scale = 0.9 / Math.max(bounds.width / width, bounds.height / height);
            const tx = (width - bounds.width * scale) / 2 - bounds.x * scale;
            const ty = (height - bounds.height * scale) / 2 - bounds.y * scale;
            this.transform = d3.zoomIdentity.translate(tx, ty).scale(scale);
            g.attr('transform', this.transform);
            svg.call(this._zoomBehavior.transform, this.transform);
        } else {
            g.attr('transform', this.transform);
        }

        this.updateStickyAncestors();

        this.updateUndoRedoButtons();
        this.refreshRadialButtons();
    }

    // Floating quick-add buttons around the currently selected node: left/right add a
    // sibling on that side, below adds a child, above adds a new parent (same action as
    // the "Add Parent" button in the edit popup). Rebuilt on demand rather than kept in
    // sync incrementally, since selection changes and re-renders are both infrequent
    // relative to normal interaction.
    refreshRadialButtons() {
        d3.selectAll('.radial-add-btn-layer').remove();
        if (!this.selectedNode) return;

        const selectedData = this.selectedNode.data;
        if (!selectedData) return;

        const nodeEls = d3.selectAll('#flowchart .node');
        if (nodeEls.empty()) return;
        const containerEl = nodeEls.node().parentNode;
        if (!containerEl) return;
        const container = d3.select(containerEl);

        let targetDatum = null;
        nodeEls.each(function(d) {
            if (d && d.data === selectedData) targetDatum = d;
        });
        if (!targetDatum) return;

        const NODE_WIDTH = this.NODE_WIDTH;
        const LINE_HEIGHT = 18;
        const PADDING_Y = 12;
        const btnWidth = 52;
        const btnHeight = 40;
        const btnClearance = 20;
        const btnSpacing = 10;
        const horizGap = btnClearance + btnWidth / 2;
        const vertGap = btnClearance + btnHeight / 2;
        const DANGER_TEXT = '#ff6b6b';
        const self = this;
        const snap10 = v => Math.round(v / 10) * 10;

        const baseX = snap10(targetDatum.x);
        const baseY = targetDatum.y;
        const lineCount = (targetDatum._lines && targetDatum._lines.length) || 1;
        const halfHeight = (lineCount * LINE_HEIGHT + PADDING_Y) / 2;

        // Appended last, to the same container that holds every node - not nested inside
        // the selected node's own <g> - so this layer always paints on top of neighboring
        // nodes (e.g. a sibling sitting right where the right-hand button goes) instead of
        // being hidden behind whichever node happens to come later in the draw order.
        const btnLayer = container.append('g').attr('class', 'radial-add-btn-layer');

        const makeRadialBtn = (dx, dy, label, onActivate, danger = false, fontSize = 26) => {
            const btnGroup = btnLayer.append('g')
                .attr('class', 'radial-add-btn')
                .attr('transform', `translate(${baseX + dx},${baseY + dy})`)
                .style('cursor', 'pointer')
                .on('mousedown', (event) => event.stopPropagation())
                .on('touchstart', (event) => event.stopPropagation())
                .on('click', (event) => {
                    event.stopPropagation();
                    onActivate();
                });
            btnGroup.append('rect')
                .attr('x', -btnWidth / 2)
                .attr('y', -btnHeight / 2)
                .attr('width', btnWidth)
                .attr('height', btnHeight)
                .attr('rx', 8)
                .attr('ry', 8)
                .style('fill', 'var(--bg)')
                .attr('stroke', 'none');
            btnGroup.append('text')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('fill', danger ? DANGER_TEXT : '#e6eef8')
                .attr('font-size', fontSize)
                .attr('font-weight', 'bold')
                .attr('y', 1)
                .text(label);
        };

        // After a button spawns a new node, move the radial buttons onto that new node
        // instead of leaving them on the original one.
        const focusNewNode = (newData, afterCenter) => {
            if (!newData) return null;
            let found = null;
            d3.hierarchy(self.rootData).each(node => {
                if (node.data === newData) found = node;
            });
            if (found) {
                const renderedNode = self.findRenderedNode(newData) || found;
                self.centerNodeOnMobile(renderedNode, () => {
                    self.selectNode(found);
                    self.refreshRadialButtons();
                    if (afterCenter) afterCenter(found);
                });
            }
            return found;
        };

        const activateAddChild = () => {
            const newChild = self.addChildNode(targetDatum);
            focusNewNode(newChild, (found) => {
                self.showNodeEditPopup(found);
                self.nodeEditInput.value = '';
                self.resizeNodeEditInput();
                self.nodeEditInput.focus();
            });
        };
        const activateAddParent = () => {
            const newParentData = self.addParentNode(targetDatum);
            focusNewNode(newParentData);
        };
        const activateAddSiblingBefore = () => focusNewNode(self.addSiblingNode(targetDatum, -1));
        const activateAddSiblingAfter = () => focusNewNode(self.addSiblingNode(targetDatum, 1));
        const activateMoveLeft = () => self.moveNodeInSiblings(targetDatum, -1);
        const activateMoveRight = () => self.moveNodeInSiblings(targetDatum, 1);
        const activateMove = () => {
            self.hideNodeEditPopup();
            self.deselectNode();
            self.startMoveNode(targetDatum);
        };
        const activateDelete = () => {
            self.hideNodeEditPopup(false);
            self.selectedNode = null;
            self.deleteNode(targetDatum);
        };
        const activateDeleteAndPromote = () => {
            self.hideNodeEditPopup(false);
            self.selectedNode = null;
            self.deleteNodeAndPromoteChildren(targetDatum);
        };

        const activateMakeConnection = () => {
            self.hideNodeEditPopup();
            self.deselectNode();
            self.startMakeConnection(targetDatum);
        };

        // Fold/unfold, driven by a dedicated button rather than relying on double-click
        // (which is unreliable on mobile once a tap has re-centered the view - the
        // second tap can land on a different element and the browser never fires
        // dblclick at all). Keeps the node selected so the row stays open afterward.
        const canFold = Boolean(targetDatum.data.children && targetDatum.data.children.length > 0);
        const activateFold = () => self.toggleNodeCollapse(targetDatum, true);

        // The "top" +button sits at the same offset in both orientations (see below), so
        // the delete-row above it can be positioned once, independent of orientation.
        const topPlusDy = -(halfHeight + vertGap);
        const deleteRowDy = topPlusDy - (btnHeight + btnSpacing);

        // Built as a list and evenly spaced around dx=0 so the row is always centered
        // as a whole, whatever combination of buttons ends up in it - rather than each
        // button having a hardcoded offset (which is what made the row look lopsided
        // before). F (fold) always sits immediately left of C (make connection).
        const deleteRowBtns = [];
        if (canFold) deleteRowBtns.push({ label: 'F', activate: activateFold });
        deleteRowBtns.push({ label: 'C', activate: activateMakeConnection });
        deleteRowBtns.push({ label: 'M', activate: activateMove });
        if (targetDatum.parent) {
            deleteRowBtns.push({ label: '✕', activate: activateDelete, danger: true, fontSize: 22 });
            deleteRowBtns.push({ label: 'P', activate: activateDeleteAndPromote, danger: true, fontSize: 20 });
        }
        const rowUnit = btnWidth + btnSpacing;
        const rowCount = deleteRowBtns.length;
        deleteRowBtns.forEach((btn, i) => {
            const dx = (i - (rowCount - 1) / 2) * rowUnit;
            makeRadialBtn(dx, deleteRowDy, btn.label, btn.activate, Boolean(btn.danger), btn.fontSize || 26);
        });

        if (this.orientation === 'LR') {
            // Children extend to the right and parents sit to the left in this
            // orientation, so the horizontal buttons follow that flow: left adds a new
            // parent, right adds a child. Siblings stack vertically, so they move to
            // the top/bottom buttons instead of left/right.
            makeRadialBtn(-(NODE_WIDTH / 2 + horizGap), 0, '+', activateAddParent);
            makeRadialBtn(NODE_WIDTH / 2 + horizGap, 0, '+', activateAddChild);
            if (targetDatum.parent) {
                makeRadialBtn(0, topPlusDy, '+', activateAddSiblingBefore);
                makeRadialBtn(0, halfHeight + vertGap, '+', activateAddSiblingAfter);
                makeRadialBtn(-(btnWidth + btnSpacing), topPlusDy, '◀', activateMoveLeft);
                makeRadialBtn(btnWidth + btnSpacing, halfHeight + vertGap, '▶', activateMoveRight);
            }
        } else {
            if (targetDatum.parent) {
                makeRadialBtn(-(NODE_WIDTH / 2 + horizGap), 0, '+', activateAddSiblingBefore);
                makeRadialBtn(NODE_WIDTH / 2 + horizGap, 0, '+', activateAddSiblingAfter);
                makeRadialBtn(-(NODE_WIDTH / 2 + horizGap) - (btnWidth + btnSpacing), 0, '◀', activateMoveLeft);
                makeRadialBtn(NODE_WIDTH / 2 + horizGap + (btnWidth + btnSpacing), 0, '▶', activateMoveRight);
            }
            makeRadialBtn(0, halfHeight + vertGap, '+', activateAddChild);
            makeRadialBtn(0, topPlusDy, '+', activateAddParent);
        }
    }

    showNotification(message, duration = 3000) {
        const notif = document.createElement('div');
        notif.className = 'flowchart-notification';
        notif.textContent = message;
        Object.assign(notif.style, {
            position: 'fixed',
            right: '20px',
            bottom: '20px',
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: '6px',
            zIndex: 9999,
            boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
            opacity: '1',
            transition: 'opacity 300ms ease',
            maxWidth: '400px'
        });
        document.body.appendChild(notif);
        setTimeout(() => {
            notif.style.opacity = '0';
            setTimeout(() => {
                try { notif.remove(); } catch (e) {}
            }, 300);
        }, duration);
    }
}

// Initialize the viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new FlowchartViewer();
});