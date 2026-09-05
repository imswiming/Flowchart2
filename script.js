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
        this.reflectionPanelResizeHandle = document.getElementById('reflection-panel-resize-handle');
        this.leftPanelTabQuestions = document.getElementById('left-panel-tab-questions');
        this.leftPanelTabPugh = document.getElementById('left-panel-tab-pugh');
        this.leftPanelTabMorph = document.getElementById('left-panel-tab-morph');
        this.leftPanelTabsContainer = document.getElementById('left-panel-tabs');
        this.notesUnfoldBtn = document.getElementById('notes-unfold-btn');
        this.leftPanelZoomOutBtn = document.getElementById('left-panel-zoom-out');
        this.leftPanelZoomInBtn = document.getElementById('left-panel-zoom-in');
        this.leftPanelZoomLevel = document.getElementById('left-panel-zoom-level');
        this.leftPanelZoomControls = document.getElementById('left-panel-zoom-controls');
        this.leftPanelMain = document.getElementById('left-panel-main');
        this.pughPanelBody = document.getElementById('pugh-panel-body');
        this.morphPanelBody = document.getElementById('morph-panel-body');
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
            'What alternatives might I be overlooking?',
            'What can I do to make this problem worse?'
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
        // switchable via the Questions/Pugh Matrix/Morph Matrix tabs. Data is
        // per-flowchart (saved and loaded alongside the tree) so each chart can carry
        // its own matrices.
        this._leftPanelMode = 'questions'; // 'questions' | 'pugh' | 'morph'
        this._pughPanelActive = false;
        this._morphPanelActive = false;
        this._pughIdCounter = 0;
        this.pughMatrix = this.getDefaultPughMatrix();
        // Morphological Analysis matrix: each row is a "parameter" (a parent node's
        // name), its columns are that parent's immediate green children (candidate
        // options) - see addNodeToMorph/renderMorphPanel.
        this._morphIdCounter = 0;
        this.morphMatrix = this.getDefaultMorphMatrix();
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

    // Fast, non-cryptographic hash (djb2) used only to de-duplicate identical
    // image/drawing blobs before upload - collisions are irrelevant here since the
    // worst case is just an unnecessary re-upload, never a security concern.
    hashImageString(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(36);
    }

    // Every embedded image/drawing (_nodePhotoUrl on a node, or a notesDrawings/
    // notesImages entry's dataUrl) is a JSON string value starting with "data:" -
    // base64 never contains a quote or backslash, so the whole quoted value can be
    // found and swapped for a small "@img:<hash>" reference directly in the raw
    // JSON text, without parsing/rebuilding the tree. Returns the stripped string
    // plus a { hash: rawDataUrl } map of everything it found.
    stripImagesFromDataString(dataStr) {
        const imageMap = {};
        if (!dataStr) return { stripped: dataStr, imageMap };
        const stripped = dataStr.replace(/"data:[^"]*"/g, (match) => {
            const raw = match.slice(1, -1);
            const hash = this.hashImageString(raw);
            imageMap[hash] = raw;
            return `"@img:${hash}"`;
        });
        return { stripped, imageMap };
    }

    // Reverses stripImagesFromDataString: swaps each "@img:<hash>" reference back
    // for its real data URL, using whatever's in resolvedMap. A hash with no entry
    // (couldn't be fetched) is left as-is rather than corrupting the JSON - better a
    // missing image than a broken flowchart load.
    rehydrateImagesInDataString(dataStr, resolvedMap) {
        if (!dataStr) return dataStr;
        return dataStr.replace(/"@img:([a-z0-9]+)"/g, (match, hash) => {
            const raw = resolvedMap[hash];
            return raw === undefined ? match : JSON.stringify(raw);
        });
    }

    // All the distinct image hashes referenced (as "@img:<hash>") in one flowchart's
    // serialized data string - used to know what to fetch when actually loading it.
    findImageRefsInDataString(dataStr) {
        const hashes = new Set();
        if (!dataStr) return hashes;
        const re = /"@img:([a-z0-9]+)"/g;
        let m;
        while ((m = re.exec(dataStr))) hashes.add(m[1]);
        return hashes;
    }

    // Fetches and substitutes back in whichever images/drawings a single
    // flowchart's data string references, so they're only ever pulled down when
    // that flowchart is actually about to be viewed - not for every other saved
    // flowchart just because the sync row happened to include them too. Hashes
    // already confirmed present on the server (self._uploadedImageHashes) are
    // marked so a later push never needlessly re-uploads what was just downloaded.
    async rehydrateFlowchartImages(index) {
        const item = this.flowchartList[index];
        if (!item || !item.data) return;
        const hashes = Array.from(this.findImageRefsInDataString(item.data));
        if (hashes.length === 0) return;
        if (!this._uploadedImageHashes) this._uploadedImageHashes = new Set();
        const prefix = `${this.cloudSyncId}::img::`;
        try {
            const idsFilter = hashes.map(h => encodeURIComponent(prefix + h)).join(',');
            const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}?id=in.(${idsFilter})&select=id,data`, {
                headers: {
                    'apikey': this.cloudApiKey,
                    'Authorization': `Bearer ${this.cloudApiKey}`,
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) throw new Error(`Supabase API error ${res.status}: ${await res.text()}`);
            const rows = await res.json();
            const resolvedMap = {};
            rows.forEach(row => {
                if (!row.id.startsWith(prefix)) return;
                const hash = row.id.slice(prefix.length);
                if (row.data && typeof row.data.dataUrl === 'string') {
                    resolvedMap[hash] = row.data.dataUrl;
                    this._uploadedImageHashes.add(hash);
                }
            });
            item.data = this.rehydrateImagesInDataString(item.data, resolvedMap);
        } catch (err) {
            console.error('Failed to fetch synced images/drawings:', err);
        }
    }

    // ===== CLOUD SYNC (Supabase) =====
    // Free Postgres-backed key/value storage via Supabase's auto-generated REST
    // API (PostgREST). No login flow for the app itself (just a project URL and
    // anon/public API key pasted once). The main flowchart list (text/structure
    // only - see below) is one row in a `flowchart_sync` table keyed by a Sync ID.
    // Each distinct image/drawing is its own separate row, keyed by a content hash
    // (see stripImagesFromDataString) - so pasting one photo uploads it exactly
    // once no matter how many times the flowchart is edited afterward, instead of
    // re-uploading every embedded image's bytes on every single autosave. Pulling
    // a flowchart likewise only fetches the specific images it actually references,
    // and only once it's actually being opened. Last-write-wins by timestamp.
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
            if (!this._uploadedImageHashes) this._uploadedImageHashes = new Set();

            // Strip every embedded image/drawing out of each flowchart's data string
            // before touching the network at all - the main row's payload is then
            // just text/structure, typically tiny regardless of how many photos or
            // drawings are attached anywhere in the flowchart list.
            const newImageMap = {};
            const strippedList = this.flowchartList.map(item => {
                const { stripped, imageMap } = this.stripImagesFromDataString(item.data || '');
                Object.assign(newImageMap, imageMap);
                return { title: item.title, data: stripped };
            });

            const updatedAt = Date.now();
            const dataJson = JSON.stringify({ flowchartList: strippedList });

            // Upload whichever images aren't yet confirmed present on the server -
            // each is its own tiny row, upserted by content hash, so re-encountering
            // one already uploaded (e.g. reusing the same photo in two nodes, or the
            // very common case of *nothing* image-related having changed at all)
            // costs nothing but a Set lookup, never a network request.
            const hashesToUpload = Object.keys(newImageMap).filter(h => !this._uploadedImageHashes.has(h));
            for (const hash of hashesToUpload) {
                const res = await fetch(`${this.cloudProjectUrl}/rest/v1/${this.CLOUD_TABLE}`, {
                    method: 'POST',
                    headers: {
                        'apikey': this.cloudApiKey,
                        'Authorization': `Bearer ${this.cloudApiKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates,return=minimal'
                    },
                    body: JSON.stringify([{
                        id: `${this.cloudSyncId}::img::${hash}`,
                        updated_at: Date.now(),
                        data: { dataUrl: newImageMap[hash] }
                    }])
                });
                if (!res.ok) throw new Error(`Supabase API error ${res.status}: ${await res.text()}`);
                this._uploadedImageHashes.add(hash);
            }

            // Skip the main-row upload entirely if the (now image-free) payload is
            // identical to what was last pushed - the ~2s debounce can fire on
            // things like a blur event that didn't change any data.
            if (dataJson === this._lastPushedDataJson) {
                this._cloudSyncInFlight = false;
                this.updateCloudSyncStatus('synced');
                return true;
            }
            const serialized = JSON.stringify({ updated_at: updatedAt, data: { flowchartList: strippedList } });
            // With images no longer inlined here, this limit is now essentially just
            // a sanity check against runaway text content, not a real ceiling.
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
                    // rankSession is intentionally ephemeral (see the Pugh ranking
                    // mode block comment) - never written to flowchartList.data, so
                    // it doesn't survive re-parsing that JSON. That's fine for a
                    // genuine slot switch, but this reload targets the *same*
                    // flowchart the person may currently be mid-ranking - without
                    // carrying these over, the periodic background poll (every 8s,
                    // see startCloudPolling) would silently reset an in-progress
                    // ranking back to its fresh "everything tied" starting state
                    // right under the person's feet, so the very next round they
                    // ran would have nothing to compare against and settle
                    // everyone into one group - i.e. everyone scoring 1st.
                    const oldRankSessions = {};
                    if (this.pughMatrix && Array.isArray(this.pughMatrix.criteria)) {
                        this.pughMatrix.criteria.forEach(c => {
                            if (c.rankSession) oldRankSessions[c.id] = c.rankSession;
                        });
                    }

                    this._applyingRemote = true;
                    this.flowchartList = remoteList;
                    this._lastPushedDataJson = JSON.stringify({ flowchartList: remoteList });
                    this.saveFlowchartList();
                    localStorage.setItem('cloud-sync-known-remote-at', String(remoteUpdatedAt));
                    if (this.currentSlotIndex === null || this.currentSlotIndex >= this.flowchartList.length) {
                        this.currentSlotIndex = 0;
                    }
                    // Only fetch the images/drawings actually referenced by the
                    // flowchart about to be opened - the rest of the list may
                    // reference plenty more, but there's no reason to pull those
                    // bytes down until (if ever) that other flowchart is opened too.
                    await this.rehydrateFlowchartImages(this.currentSlotIndex);
                    this.loadFlowchartFromList(this.currentSlotIndex);

                    if (Object.keys(oldRankSessions).length > 0 && this.pughMatrix && Array.isArray(this.pughMatrix.criteria)) {
                        this.pughMatrix.criteria.forEach(c => {
                            if (oldRankSessions[c.id] && !c.rankSession) c.rankSession = oldRankSessions[c.id];
                        });
                        this.renderPughPanel();
                    }

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
        return this.isGreenNodeData(node.data);
    }

    // Same fallback rendering already relies on (d.data.color || '#00a67e') - a node
    // with no explicit color field at all (e.g. every node in the default new-flowchart
    // template) still renders green, so it needs to count as green here too. A strict
    // `=== '#00a67e'` check with no fallback was silently treating those nodes as
    // "not green" everywhere that mattered (Simplify? suffix, the Green button's
    // outline, and - most visibly - the Morph Matrix's green-children filter, which
    // excluded exactly the branch nodes in the starter template since they're the ones
    // that never got an explicit color written to them).
    isGreenNodeData(nodeData) {
        if (!nodeData) return false;
        return (nodeData.color || '#00a67e') === '#00a67e';
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
        
        // fitView is required here, not just the transform reset above: renderFlowchart
        // otherwise calls syncTransform(), which reads whatever pan/zoom the *previous*
        // flowchart's still-on-screen SVG was left at and overwrites this reset with it -
        // so without this, a new flowchart silently opened wherever the last one had been
        // scrolled to, instead of centered on its own (tiny, single "Start" node) content.
        this.renderFlowchart(this.rootData, { fitView: true });
        this.currentSlotIndex = this.flowchartList.length - 1;
        this.saveCurrentFlowchart();
        
        this.storagePopup.style.display = 'none';
        this.showNotification('New flowchart created!');
    }
    
    loadFlowchartFromList(index) {
        if (index >= this.flowchartList.length) return;

        // A flowchart pulled from cloud sync only has the *opened* slot's images
        // actually fetched (see cloudPull) - if this is some other slot that still
        // has unresolved "@img:<hash>" placeholders sitting in its data string,
        // fetch those first and then re-run this same load once they're back,
        // rather than rendering broken image references.
        const item0 = this.flowchartList[index];
        if (item0 && item0.data && this.cloudApiKey && this.cloudProjectUrl && this.cloudSyncId &&
            /"@img:/.test(item0.data)) {
            this.rehydrateFlowchartImages(index).then(() => this.loadFlowchartFromList(index));
            return;
        }
        
        // Applying an incoming remote pull (see cloudPull) always targets the *same*
        // slot index it just wrote into flowchartList - if that also happens to be
        // whatever this.currentSlotIndex already was (the common case: syncing
        // updates to the flowchart currently open), saving "current" here would
        // export the stale, not-yet-refreshed in-memory rootData right back over
        // the remote data that was just fetched, silently discarding the pull
        // (images included) before it's even read below.
        if (!this._applyingRemote && this.rootData && this.currentSlotIndex !== null && this.flowchartList[this.currentSlotIndex]) {
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
                this.morphMatrix = this.sanitizeMorphMatrix(parsed.morphMatrix);
                // rootData and morphMatrix were both just rebuilt fresh from this
                // flowchart's saved JSON, so any _morphNodeRefs left over from
                // whatever was open before are pointing at now-detached node objects
                // from the *previous* tree - relink them to the freshly-parsed nodes
                // (matched by name, same as when a row is first added) so
                // resyncMorphRows has something live to actually follow.
                this.relinkMorphNodeRefs();
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
                // "Leaf" here is judged from the underlying *data*'s real (non-
                // placeholder) children, not onlyChild.children - the latter comes
                // from the placeholder-filtered hierarchy (see childrenAccessor), so
                // with placeholders hidden, a node whose only child was a trailing
                // placeholder stub would otherwise get silently reclassified as a
                // leaf the moment that stub is filtered out - purely because of the
                // show/hide toggle, not because the tree's actual shape changed. That
                // caused this node to start tracking a "leaf" that wasn't really one,
                // compressing toward it and colliding with unrelated content, only
                // when placeholders happened to be hidden.
                const realGrandchildren = (onlyChild.data.children || []).filter(c => !this.isPlaceholderNodeData(c));
                const isLeafChild = realGrandchildren.length === 0;
                // Only an actual *leaf* child's raw position should be tracked - it's
                // the one genuinely about to scroll out of view. A non-leaf child that
                // hasn't started docking itself yet is just sitting wherever the tree
                // layout naturally put it, which (especially in compact/indented
                // layouts) can be much closer to this node than the normal offset -
                // tracking it anyway was pulling this node right into that child's
                // (or an unrelated sibling's) territory instead of waiting at the
                // clean offset. Once that child *does* start docking, it already
                // contributes a flat dockedScreenPos below (via the "not docked?" —
                // no, via the leaf check on *its own* eachAfter pass propagating up
                // through this same "non-leaf children stay flat" rule), so tracking
                // only ever happens one level at a time, right above the terminating
                // leaf - never bumping into content further up the chain.
                const childContribution = isLeafChild ? onlyChild._effectiveScreenPos : dockedScreenPos;
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
        this.relinkMorphNodeRefs();
        if (this.resyncMorphRows()) this.renderMorphPanel();
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
        this.relinkMorphNodeRefs();
        if (this.resyncMorphRows()) this.renderMorphPanel();
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
        
        if (this.resyncMorphRows()) this.renderMorphPanel();
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
        if (this.resyncMorphRows()) this.renderMorphPanel();
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
        if (this.resyncMorphRows()) this.renderMorphPanel();
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
        if (this.resyncMorphRows()) this.renderMorphPanel();
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
        if (this.resyncMorphRows()) this.renderMorphPanel();
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
                    if (this.resyncMorphRows()) this.renderMorphPanel();
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
                    if (this.resyncMorphRows()) this.renderMorphPanel();
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
                    if (this.resyncMorphRows()) this.renderMorphPanel();
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
                    if (this.resyncMorphRows()) this.renderMorphPanel();
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
                    if (this.resyncMorphRows()) this.renderMorphPanel();
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

            const moveLeftBtn = document.createElement('button');
            moveLeftBtn.textContent = '\u2190';
            moveLeftBtn.title = 'Move left (swap with previous sibling)';
            moveLeftBtn.style.background = 'var(--control-bg)';
            moveLeftBtn.style.color = 'var(--text)';
            moveLeftBtn.style.border = '1px solid var(--border)';
            moveLeftBtn.style.borderRadius = '5px';
            moveLeftBtn.style.padding = '6px 12px';
            moveLeftBtn.style.cursor = 'pointer';
            moveLeftBtn.onmousedown = (e) => e.preventDefault();
            moveLeftBtn.onclick = () => this.moveNodeLeft();

            const moveRightBtn = document.createElement('button');
            moveRightBtn.textContent = '\u2192';
            moveRightBtn.title = 'Move right (swap with next sibling)';
            moveRightBtn.style.background = 'var(--control-bg)';
            moveRightBtn.style.color = 'var(--text)';
            moveRightBtn.style.border = '1px solid var(--border)';
            moveRightBtn.style.borderRadius = '5px';
            moveRightBtn.style.padding = '6px 12px';
            moveRightBtn.style.cursor = 'pointer';
            moveRightBtn.onmousedown = (e) => e.preventDefault();
            moveRightBtn.onclick = () => this.moveNodeRight();

            colorBtns.appendChild(moveLeftBtn);
            colorBtns.appendChild(moveRightBtn);
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

            const addMorphBtn = document.createElement('button');
            addMorphBtn.textContent = '🧩 Add to Morph';
            addMorphBtn.type = 'button';
            addMorphBtn.style.flex = '1';
            addMorphBtn.style.background = 'var(--control-bg)';
            addMorphBtn.style.color = 'var(--text)';
            addMorphBtn.style.border = '1px solid var(--border)';
            addMorphBtn.style.borderRadius = '5px';
            addMorphBtn.style.padding = '6px 10px';
            addMorphBtn.style.cursor = 'pointer';
            addMorphBtn.onmousedown = (e) => e.preventDefault();
            addMorphBtn.onclick = () => this.addNodeToMorph();

            pughAddRow.appendChild(addSolutionBtn);
            pughAddRow.appendChild(addCriteriaBtn);
            pughAddRow.appendChild(addMorphBtn);
            this.nodeEditPopup.insertBefore(pughAddRow, colorBtns.nextSibling);

            // Third row: removes whichever image is attached to this node - a pasted
            // photo (see captureNodePhotoFromClipboard) or a hand-drawn one (see the
            // 🎨 radial button/openDrawingOverlay) both just end up as the same
            // _nodePhotoUrl data URL, so one button clears either.
            const imageActionsRow = document.createElement('div');
            imageActionsRow.id = 'node-image-actions-row';
            imageActionsRow.style.display = 'flex';
            imageActionsRow.style.gap = '8px';
            imageActionsRow.style.marginTop = '8px';

            const removeImageBtn = document.createElement('button');
            removeImageBtn.textContent = '🗑️ Remove Image';
            removeImageBtn.type = 'button';
            removeImageBtn.style.flex = '1';
            removeImageBtn.style.background = 'var(--control-bg)';
            removeImageBtn.style.color = 'var(--text)';
            removeImageBtn.style.border = '1px solid var(--border)';
            removeImageBtn.style.borderRadius = '5px';
            removeImageBtn.style.padding = '6px 10px';
            removeImageBtn.style.cursor = 'pointer';
            removeImageBtn.onmousedown = (e) => e.preventDefault();
            removeImageBtn.onclick = () => this.removeNodeImage();

            imageActionsRow.appendChild(removeImageBtn);
            this.nodeEditPopup.insertBefore(imageActionsRow, pughAddRow.nextSibling);
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

        const PHOTO_H = 30;
        const PHOTO_GAP = 6;
        const photoExtra = selectedData._nodePhotoUrl ? (PHOTO_H + PHOTO_GAP) : 0;

        const g = d3.select(targetEl);
        const rectHeight = finalLines.length * LINE_HEIGHT + PADDING_Y + photoExtra;
        g.select('rect')
            .attr('height', rectHeight)
            .attr('y', -(rectHeight / 2));

        const text = g.select('text');
        text.selectAll('tspan').remove();
        finalLines.forEach((line, i, arr) => {
            text.append('tspan')
                .attr('x', 0)
                .attr('y', (i - (arr.length - 1) / 2) * LINE_HEIGHT + 4 - photoExtra / 2)
                .text(line);
        });
        g.select('image').attr('y', (rectHeight / 2) - PHOTO_H - 3);
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
                    .attr('y', finalLines.length * LINE_HEIGHT / 2 + 25 + photoExtra)
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
            if (this.resyncMorphRows()) {
                this.renderMorphPanel();
                this.autosave();
            }
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
        const pughAddRow = document.getElementById('node-pugh-add-row');
        if (pughAddRow) pughAddRow.remove();
        const imageActionsRow = document.getElementById('node-image-actions-row');
        if (imageActionsRow) imageActionsRow.remove();
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
                // The very first bullet in an otherwise-empty document starts
                // pre-indented one level in, rather than flush left - every bullet
                // after that still starts wherever the person actually indents it.
                const isFirstEverBullet = value.trim() === '';
                const newLine = buildLine(isFirstEverBullet ? 1 : 0, '');
                textarea.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
                textarea.selectionStart = textarea.selectionEnd = lineStart + newLine.length;
                this.resizeReflectionAnswer(textarea);
                onChange(textarea.value);
                return true;
            }

            // Space at the very start of a non-empty line (before its bullet, or
            // before its text if it doesn't have one) indents the whole line by one
            // level, same as Tab would - a plain (bulletless) line gets promoted to
            // a bulleted one in the process, since indent levels are otherwise only
            // tracked via the bullet/INDENT prefix.
            if (key === ' ' && lineText !== '' && start === lineStart) {
                const newLevel = (hasBullet ? level : 0) + 1;
                const newLine = buildLine(newLevel, content);
                textarea.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
                const newPrefixLen = parseLine(newLine).prefixLen;
                textarea.selectionStart = textarea.selectionEnd = lineStart + newPrefixLen;
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
        } else if (this._leftPanelMode === 'morph') {
            this._morphPanelActive = false;
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
        this._morphPanelActive = false;
        this._notesFolded = false;
        this.pughMatrix = this.getDefaultPughMatrix();
        this.morphMatrix = this.getDefaultMorphMatrix();
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
        const panelActive = this._leftPanelMode === 'pugh' ? this._pughPanelActive
            : this._leftPanelMode === 'morph' ? this._morphPanelActive
            : questionsActive;

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

    // ===================== Morph Matrix (Morphological Analysis) =====================
    // Each row is a "parameter" (snapshotted from a parent node's name), and its
    // columns are that parent's immediate green-only children (candidate options) at
    // the moment "Add to Morph" was clicked - a static snapshot, same as how Pugh's
    // "Add Solution"/"Add Criteria" work, not a live link back into the tree. The
    // person picks one option per row by clicking its cell, building up a combined
    // idea (row1's pick + row2's pick + ...) shown live at the bottom, and "Accept"
    // saves that combination as a finished idea.
    nextMorphId(prefix) {
        this._morphIdCounter = (this._morphIdCounter || 0) + 1;
        return `${prefix}-${Date.now().toString(36)}-${this._morphIdCounter}`;
    }

    getDefaultMorphMatrix() {
        return {
            rows: [],   // [{ id, name, options: [string, ...] }]
            ideas: []   // [{ id, text, selections: { [rowId]: optionText[] } }]
        };
    }

    sanitizeMorphMatrix(raw) {
        if (!raw || typeof raw !== 'object') return this.getDefaultMorphMatrix();

        const rows = Array.isArray(raw.rows) ? raw.rows
            .filter(r => r && typeof r === 'object')
            .map(r => ({
                id: (typeof r.id === 'string' && r.id) ? r.id : this.nextMorphId('row'),
                // Strips any "(Simplify?)" suffix that got saved before that stripping
                // was added, so previously-saved rows/options get cleaned up on load
                // too, not just newly-added ones.
                name: this.stripSimplifySuffix((typeof r.name === 'string') ? r.name : ''),
                options: Array.isArray(r.options)
                    ? r.options.filter(o => typeof o === 'string').map(o => this.stripSimplifySuffix(o))
                    : []
            })) : [];

        const rowIds = new Set(rows.map(r => r.id));
        const ideas = Array.isArray(raw.ideas) ? raw.ideas
            .filter(i => i && typeof i === 'object' && typeof i.text === 'string')
            .map(i => ({
                id: (typeof i.id === 'string' && i.id) ? i.id : this.nextMorphId('idea'),
                text: i.text,
                selections: (i.selections && typeof i.selections === 'object')
                    ? Object.fromEntries(Object.entries(i.selections).filter(([rid]) => rowIds.has(rid)))
                    : {}
            })) : [];

        return { rows, ideas };
    }

    // Green leaf nodes automatically get a " (Simplify?)" suffix appended to their
    // displayed name (an internal UI marker, not meant to appear anywhere else) - this
    // strips it off wherever a node's name is pulled into the Morph Matrix.
    stripSimplifySuffix(name) {
        return (name || '').replace(/ \(Simplify\?\)$/, '').trim();
    }

    // Adds a node as a new Morph Matrix row - the row name is the node's own name,
    // and its columns are the node's immediate green-colored children only (any
    // other color, or grandchildren, are ignored). Skips if a row with that exact
    // name already exists, same duplicate-guard pattern as addNodeToPugh.
    //
    // Also keeps a live (non-persisted) reference to the underlying node data objects
    // - see syncMorphMatrixNames, called whenever a node is renamed, so a row/option's
    // displayed name always tracks the actual node instead of freezing at whatever it
    // was called when "Add to Morph" was clicked.
    addNodeToMorph() {
        if (!this.nodeBeingEdited) return;
        const rawName = this.nodeBeingEdited.data.name || '';
        const name = this.stripSimplifySuffix(rawName);
        if (!name) {
            this.showNotification('Name the node first.');
            return;
        }

        const exists = this.morphMatrix.rows.some(r => r.name.trim().toLowerCase() === name.toLowerCase());
        if (exists) {
            this.showNotification(`"${name}" is already a row in the Morph Matrix.`);
            return;
        }

        const nodeRef = this.nodeBeingEdited.data;
        const childRefs = (nodeRef.children || [])
            .filter(c => !this.isPlaceholderNodeData(c) && (c.name || '').trim() && this.isGreenNodeData(c));
        const options = childRefs.map(c => this.stripSimplifySuffix(c.name));

        if (options.length === 0) {
            this.showNotification(`"${name}" has no green children to use as options.`);
            return;
        }

        const rowId = this.nextMorphId('row');
        this.morphMatrix.rows.push({ id: rowId, name, options });
        // Live refs are kept entirely separate from morphMatrix itself (never
        // attached to the row object directly) - exportAsJSON/autosave embed
        // this.morphMatrix as-is without passing it through the sanitizer first, so
        // anything stored directly on a row would get serialized too: since these
        // are raw references into the tree (including each node's own .children
        // array), that would either massively bloat the saved JSON or risk crashing
        // JSON.stringify outright if anything circular ever showed up. Keeping them
        // here instead means this.morphMatrix always stays a plain, safe structure.
        if (!this._morphNodeRefs) this._morphNodeRefs = {};
        this._morphNodeRefs[rowId] = { nodeRef, optionRefs: childRefs };
        this.renderMorphPanel();
        this.autosave();
        this.showNotification(`Added "${name}" as a Morph Matrix row.`);
    }

    // Keeps every Morph Matrix row in sync with the live tree: refreshes the row's
    // name and each option's name (same as before), and now also rebuilds the whole
    // option list from the parent's *current* green children - which is what catches
    // a child being added or deleted after the row was first created, not just
    // renamed. Run automatically at the start of every renderMorphPanel (so it's
    // always fresh whenever the tab is viewed), and also called directly after the
    // tree-editing actions most likely to affect it (adding/deleting a child, saving
    // a rename) for immediate feedback without needing to switch tabs. Silent no-op
    // for any row with no live ref (e.g. after a reload - see addNodeToMorph).
    // Returns whether anything actually changed, so callers can skip a redundant
    // render/autosave when nothing did.
    resyncMorphRows() {
        if (!this._morphNodeRefs || !this.morphMatrix) return false;
        let changed = false;
        this.morphMatrix.rows.forEach(row => {
            const refs = this._morphNodeRefs[row.id];
            if (!refs || !refs.nodeRef) return;

            if (typeof refs.nodeRef.name === 'string') {
                const newName = this.stripSimplifySuffix(refs.nodeRef.name);
                if (newName && row.name !== newName) {
                    row.name = newName;
                    changed = true;
                }
            }

            // Recompute the parent's current green children fresh, rather than only
            // checking the same fixed set of refs for renames - this is what catches
            // additions/removals. Reading .children straight off the live parent
            // object always reflects whatever's currently there, whether it was
            // mutated in place (push/splice) or reassigned (a .filter() elsewhere in
            // the app building a new array) - either way it's the same parent object,
            // so this always sees the current state.
            const currentChildren = (refs.nodeRef.children || [])
                .filter(c => !this.isPlaceholderNodeData(c) && (c.name || '').trim() && this.isGreenNodeData(c));
            const oldOptionRefs = refs.optionRefs || [];
            // Reference identity alone only tells us whether options were added or
            // removed - it stays "same" if an existing option node was just renamed,
            // since it's still the same object. Compare the actual option text too,
            // so a plain rename of an option (no add/remove) is caught here as well.
            const currentOptionNames = currentChildren.map(c => this.stripSimplifySuffix(c.name));
            const sameSet = currentChildren.length === oldOptionRefs.length
                && currentChildren.every((c, i) => oldOptionRefs[i] === c)
                && currentOptionNames.length === row.options.length
                && currentOptionNames.every((n, i) => n === row.options[i]);

            if (!sameSet) {
                const sel = this._morphCurrentSelection;
                const oldSelectedOptions = sel ? (sel[row.id] || []) : [];
                // Each selected option needs to be re-found by its old *ref* (not its
                // old text) - remapping by ref is what lets a renamed still-selected
                // option keep its selection under the new label, same as before, just
                // done once per selected option instead of just one.
                const oldSelectedRefs = oldSelectedOptions.map(opt => {
                    const idx = row.options.indexOf(opt);
                    return idx !== -1 ? oldOptionRefs[idx] : undefined;
                });

                refs.optionRefs = currentChildren;
                row.options = currentOptionNames;
                changed = true;

                if (sel && oldSelectedOptions.length > 0) {
                    const newSelected = oldSelectedRefs
                        .map(ref => ref ? currentChildren.indexOf(ref) : -1)
                        .filter(idx => idx !== -1)
                        .map(idx => row.options[idx]);
                    if (newSelected.length === 0) {
                        // Everything that was selected got deleted - clear it rather
                        // than leaving stale choices pointing at nothing.
                        delete sel[row.id];
                    } else {
                        sel[row.id] = newSelected;
                    }
                }
            }
        });
        return changed;
    }


    // undo()/redo() swap in a brand new cloned tree (cloneData round-trips through
    // JSON), so every node data object - including the ones _morphNodeRefs is
    // holding onto - is a stale object no longer part of this.rootData. resyncMorphRows
    // can't fix that on its own since it only ever follows refs it's already holding;
    // it has no way to discover the *new* objects. This re-finds each row's parent
    // node (and its current green children) inside the fresh tree by name, the same
    // way addNodeToMorph identifies rows in the first place, and re-points
    // _morphNodeRefs at them so resyncMorphRows has something live to follow again.
    // Rows whose node can no longer be found (e.g. undoing past its creation) simply
    // lose their live link and fall back to their last-known static snapshot, same as
    // a row loaded from a save file.
    relinkMorphNodeRefs() {
        if (!this.morphMatrix || this.morphMatrix.rows.length === 0) return;
        if (!this._morphNodeRefs) this._morphNodeRefs = {};

        const allNodes = [];
        const walk = (n) => {
            if (!n) return;
            allNodes.push(n);
            (n.children || []).forEach(walk);
        };
        walk(this.rootData);

        this.morphMatrix.rows.forEach(row => {
            const match = allNodes.find(n => this.stripSimplifySuffix(n.name || '') === row.name);
            if (match) {
                const optionRefs = (match.children || [])
                    .filter(c => !this.isPlaceholderNodeData(c) && (c.name || '').trim() && this.isGreenNodeData(c));
                this._morphNodeRefs[row.id] = { nodeRef: match, optionRefs };
            } else {
                delete this._morphNodeRefs[row.id];
            }
        });
    }

    deleteMorphRow(rowId) {
        this.morphMatrix.rows = this.morphMatrix.rows.filter(r => r.id !== rowId);
        if (this._morphCurrentSelection) delete this._morphCurrentSelection[rowId];
        if (this._morphNodeRefs) delete this._morphNodeRefs[rowId];
        this.renderMorphPanel();
        this.autosave();
    }

    deleteMorphIdea(ideaId) {
        this.morphMatrix.ideas = this.morphMatrix.ideas.filter(i => i.id !== ideaId);
        this.renderMorphPanel();
        this.autosave();
    }

    // Toggles whether a given cell is part of the current selection for that row.
    // Multiple cells in the same column (row) can be selected at once - each row's
    // entry in _morphCurrentSelection is an array of selected option strings, not a
    // single value, so clicking a second cell in the same column adds to it instead
    // of replacing it. Clicking an already-selected cell again removes just that one.
    toggleMorphSelection(rowId, option) {
        if (!this._morphCurrentSelection) this._morphCurrentSelection = {};
        const current = this._morphCurrentSelection[rowId] || [];
        const idx = current.indexOf(option);
        let next;
        if (idx !== -1) {
            next = current.slice(0, idx).concat(current.slice(idx + 1));
        } else {
            next = current.concat([option]);
        }
        if (next.length === 0) {
            delete this._morphCurrentSelection[rowId];
        } else {
            this._morphCurrentSelection[rowId] = next;
        }
        this.renderMorphPanel();
    }

    // Builds "(optionA/optionB) + optionC + ..." out of whatever's currently selected,
    // in row order, skipping rows with no selection yet. Multiple selections within
    // the same row are joined with "/" and wrapped in parentheses whenever there's
    // more than one, so the row-level grouping stays visually distinct from the
    // "+" that separates different rows/parameters.
    getMorphCurrentIdeaText() {
        const sel = this._morphCurrentSelection || {};
        const parts = this.morphMatrix.rows
            .map(r => sel[r.id])
            .filter(options => Array.isArray(options) && options.length > 0)
            .map(options => options.length > 1 ? `(${options.join('/')})` : options[0]);
        return parts.join(' + ');
    }

    acceptMorphIdea() {
        const sel = this._morphCurrentSelection || {};
        const text = this.getMorphCurrentIdeaText();
        if (!text) return;
        const selectionsCopy = {};
        Object.keys(sel).forEach(rowId => {
            selectionsCopy[rowId] = (sel[rowId] || []).slice();
        });
        this.morphMatrix.ideas.push({
            id: this.nextMorphId('idea'),
            text,
            selections: selectionsCopy
        });
        this._morphCurrentSelection = {};
        this.renderMorphPanel();
        this.autosave();
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
        if (this.leftPanelTabMorph) {
            this.leftPanelTabMorph.addEventListener('click', () => this.switchLeftPanelMode('morph'));
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
        } else if (mode === 'morph') {
            this._morphPanelActive = true;
            this.renderMorphPanel();
        } else if (mode === 'questions') {
            // Save any in-progress ranking before leaving the Pugh tab, same as
            // leaving Rank mode itself - otherwise switching tabs mid-ranking
            // silently discarded whatever progress had been made.
            if (this._pughRankMode && this._pughActiveCriteriaId) {
                this.finalizeInProgressRankSessionIfAny(this._pughActiveCriteriaId);
                this._pughActiveCriteriaId = null;
            }
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
        if (this.leftPanelTabMorph) {
            this.leftPanelTabMorph.classList.toggle('active', this._leftPanelMode === 'morph');
        }
        if (this.reflectionPanelBody) {
            this.reflectionPanelBody.style.display = this._leftPanelMode === 'questions' ? 'flex' : 'none';
        }
        if (this.pughPanelBody) {
            this.pughPanelBody.style.display = this._leftPanelMode === 'pugh' ? 'flex' : 'none';
        }
        if (this.morphPanelBody) {
            this.morphPanelBody.style.display = this._leftPanelMode === 'morph' ? 'flex' : 'none';
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
        const checklistBtn = document.createElement('button');
        checklistBtn.id = 'notes-checklist-btn';
        checklistBtn.type = 'button';
        checklistBtn.textContent = '☑ Checklist';
        checklistBtn.title = 'Turn the selected (or current) lines into a checklist';
        checklistBtn.addEventListener('click', () => this.convertNotesLinesToChecklist());
        header.appendChild(checklistBtn);
        const titleBtn = document.createElement('button');
        titleBtn.id = 'notes-title-btn';
        titleBtn.type = 'button';
        titleBtn.textContent = 'T• Title';
        titleBtn.title = 'Make the selected (or current) lines a bold title';
        titleBtn.addEventListener('click', () => this.convertNotesLinesToTitle());
        header.appendChild(titleBtn);
        this.notesPanelBody.appendChild(header);

        const notesArea = document.createElement('textarea');
        notesArea.className = 'reflection-notes-global';
        notesArea.placeholder = 'Notes...';
        const savedNotes = this.globalNotes || '';
        notesArea.value = savedNotes.startsWith('\n') ? savedNotes : '\n' + savedNotes;
        this.setupIndentableTextarea(notesArea, (value) => {
            this.globalNotes = value;
            this._pendingNotesSave = true;
            // Lightweight - only rebuilds the small strip below, not the textarea
            // itself, so this is safe to run on every keystroke without disturbing
            // focus/cursor position. This is what makes a pasted image URL's preview
            // appear right away, since the URL is left as plain pasted text rather
            // than replaced by a marker (see handleNotesPaste).
            this.renderNotesMediaStrip();
            this.updateNotesHangIndent(notesArea);
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
        notesArea.addEventListener('click', () => {
            this._notesCursorPos = notesArea.selectionStart;
            this.maybeToggleNotesChecklistItem(notesArea);
        });
        notesArea.addEventListener('paste', (e) => this.handleNotesPaste(e));
        this.notesTextarea = notesArea;
        this.notesPanelBody.appendChild(notesArea);

        this.renderNotesMediaStrip();
        this.updateNotesHangIndent(notesArea);
    }

    // A plain <textarea> applies padding-left/text-indent uniformly to the whole
    // box, not per line - so the hanging indent that lines wrapped continuation
    // text up under its own bullet (see .reflection-notes-global in style.css)
    // can only ever exactly match ONE indent depth at a time. Rather than a
    // static guess (which left every indented line's wrapped text realigned back
    // to the top-level column, well short of its own bullet), this recomputes the
    // hang to match whichever indent level is currently the DEEPEST anywhere in
    // the notes, using the textarea's own real font metrics. That means a
    // shallower line's wrap can end up hanging a bit further right than its own
    // bullet (still reads fine), but nothing ever wraps back short of its bullet,
    // which was the actually-broken/confusing case.
    updateNotesHangIndent(textarea) {
        if (!textarea) return;
        const INDENT = '        '; // must match setupIndentableTextarea's INDENT
        const lines = textarea.value.split('\n');
        let maxLevel = 0;
        for (const line of lines) {
            let level = 0;
            let rest = line;
            while (rest.startsWith(INDENT)) {
                rest = rest.slice(INDENT.length);
                level++;
            }
            // Only counts if the line actually has a bullet/checkbox glyph after
            // its leading indent - plain leading whitespace with no bullet isn't
            // a real indent level.
            if (level > 0 && /^[\u2022\u25E6\u25AA\u2610\u2611]/.test(rest)) {
                maxLevel = Math.max(maxLevel, level);
            }
        }

        if (!this._notesHangCtx) {
            this._notesHangCtx = document.createElement('canvas').getContext('2d');
        }
        const computed = getComputedStyle(textarea);
        this._notesHangCtx.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
        const prefixSample = INDENT.repeat(maxLevel) + '\u2022 ';
        const prefixWidth = this._notesHangCtx.measureText(prefixSample).width;

        const BASE_INSET = 10; // small left margin before the very first bullet
        textarea.style.textIndent = -prefixWidth + 'px';
        textarea.style.paddingLeft = (BASE_INSET + prefixWidth) + 'px';
    }

    // Called on every click inside the notes textarea (see renderNotesPanel) - a
    // plain textarea has no way to attach a click handler to one specific
    // character, so this just checks whether the cursor position the click landed
    // on happens to sit immediately after a "☐"/"☑" glyph, and if so, treats that
    // as clicking the checkbox itself: toggles it, and strikes through (or
    // restores) the rest of that line's text.
    maybeToggleNotesChecklistItem(textarea) {
        const value = textarea.value;
        const pos = textarea.selectionStart;
        if (textarea.selectionEnd !== pos || pos < 1) return;
        const glyph = value[pos - 1];
        if (glyph !== '\u2610' && glyph !== '\u2611') return;
        // Only when the glyph is the first thing on its line (a real checklist
        // marker) and immediately followed by a space - guards against a stray
        // checkbox character someone typed as ordinary text elsewhere.
        const lineStart = value.lastIndexOf('\n', pos - 2) + 1;
        if (lineStart !== pos - 1) return;
        if (value[pos] !== ' ') return;

        let lineEnd = value.indexOf('\n', pos);
        if (lineEnd === -1) lineEnd = value.length;
        const wasChecked = glyph === '\u2611';
        const newGlyph = wasChecked ? '\u2610' : '\u2611';
        const rest = value.slice(pos + 1, lineEnd); // everything after "glyph "
        const newRest = wasChecked ? this.unstrikethroughText(rest) : this.strikethroughText(rest);
        textarea.value = value.slice(0, pos - 1) + newGlyph + ' ' + newRest + value.slice(lineEnd);
        textarea.selectionStart = textarea.selectionEnd = pos;
        this.globalNotes = textarea.value;
        this._pendingNotesSave = true;
        this.resizeReflectionAnswer(textarea);
    }

    // Turns whichever lines the current selection touches (or just the current
    // line, if nothing's selected) into checklist items - "☐ " prefixed, replacing
    // any existing bullet. Pressing it again on lines that are already all
    // checklist items instead toggles them back to plain (non-checklist) lines,
    // restoring any struck-through "done" text along the way. Clicking directly
    // on a "☐"/"☑" glyph (see setupIndentableTextarea's click handler) still
    // toggles just that one item checked/unchecked without leaving checklist mode.
    convertNotesLinesToChecklist() {
        const textarea = this.notesTextarea;
        if (!textarea) return;
        const value = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const lineStart = start <= 0 ? 0 : (value.lastIndexOf('\n', start - 1) + 1);
        let blockEnd = value.indexOf('\n', end);
        if (blockEnd === -1) blockEnd = value.length;

        const before = value.slice(0, lineStart);
        const block = value.slice(lineStart, blockEnd);
        const after = value.slice(blockEnd);

        const CHECK_RE = /^(\u2610|\u2611)\s/;
        const BULLET_RE = /^(\s*)([\u2022\u25E6\u25AA])\s+/;
        const blockLines = block.split('\n');
        const isChecklistOrBlank = line => CHECK_RE.test(line) || line.trim() === '';
        const alreadyAllChecklist = blockLines.some(line => CHECK_RE.test(line)) && blockLines.every(isChecklistOrBlank);

        const newLines = blockLines.map(line => {
            const checkMatch = line.match(CHECK_RE);
            if (alreadyAllChecklist) {
                // Toggle off: drop the checkbox glyph and restore any struck-through text.
                if (!checkMatch) return line;
                const wasChecked = checkMatch[1] === '☑';
                const rest = line.slice(checkMatch[0].length);
                return wasChecked ? this.unstrikethroughText(rest) : rest;
            }
            if (checkMatch) return line; // already a checklist item
            let content = line;
            const bulletMatch = line.match(BULLET_RE);
            if (bulletMatch) content = line.slice(bulletMatch[0].length);
            return '☐ ' + content;
        });
        const newBlock = newLines.join('\n');
        const lengthDelta = newBlock.length - block.length;

        textarea.value = before + newBlock + after;
        textarea.selectionStart = lineStart;
        textarea.selectionEnd = blockEnd + lengthDelta;
        this.globalNotes = textarea.value;
        this.resizeReflectionAnswer(textarea);
        this.renderNotesMediaStrip();
        this.autosave();
    }

    // Wraps each visible character of `text` with a Unicode combining
    // strikethrough (U+0336) - the closest thing to real strikethrough formatting
    // achievable in a plain textarea, which has no rich text support at all.
    strikethroughText(text) {
        return Array.from(text).map(ch => (ch === '\n' ? ch : ch + '\u0336')).join('');
    }

    // Reverses strikethroughText - just strips every combining strikethrough
    // character back out.
    unstrikethroughText(text) {
        return text.replace(/\u0336/g, '');
    }

    // Turns whichever lines the current selection touches (or just the current
    // line, if nothing's selected) into a bold "title" line - toggles back to
    // plain text if every touched line is already bolded. A plain <textarea> has
    // no real font-size/weight per line, so this uses the Mathematical
    // Sans-Serif Bold Unicode block (see boldifyText) to fake bold text; true
    // font-size can't vary per line without a richer (contenteditable) editor.
    convertNotesLinesToTitle() {
        const textarea = this.notesTextarea;
        if (!textarea) return;
        const value = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const lineStart = start <= 0 ? 0 : (value.lastIndexOf('\n', start - 1) + 1);
        let blockEnd = value.indexOf('\n', end);
        if (blockEnd === -1) blockEnd = value.length;

        const before = value.slice(0, lineStart);
        const block = value.slice(lineStart, blockEnd);
        const after = value.slice(blockEnd);

        const PREFIX_RE = /^(\s*(?:[\u2022\u25E6\u25AA]|\u2610|\u2611)\s+)?/;
        const blockLines = block.split('\n');
        const alreadyBold = blockLines.some(line => {
            const prefix = (line.match(PREFIX_RE) || [''])[0];
            return this.isBoldifiedText(line.slice(prefix.length));
        });

        const newLines = blockLines.map(line => {
            const prefix = (line.match(PREFIX_RE) || [''])[0];
            const rest = line.slice(prefix.length);
            const transformed = alreadyBold ? this.unboldifyText(rest) : this.boldifyText(rest);
            return prefix + transformed;
        });
        const newBlock = newLines.join('\n');
        const lengthDelta = newBlock.length - block.length;

        textarea.value = before + newBlock + after;
        textarea.selectionStart = lineStart;
        textarea.selectionEnd = blockEnd + lengthDelta;
        this.globalNotes = textarea.value;
        this.resizeReflectionAnswer(textarea);
        this.renderNotesMediaStrip();
        this.autosave();
    }

    // Maps plain A-Z/a-z/0-9 characters to their Mathematical Sans-Serif Bold
    // Unicode equivalents (U+1D5D4-U+1D607 letters, U+1D7EC-U+1D7F5 digits) -
    // the closest a plain textarea can get to real bold text, the same trick
    // strikethroughText above uses for strikethrough. Leaves any character
    // outside A-Z/a-z/0-9 (spaces, punctuation, existing bold chars) untouched.
    boldifyText(text) {
        return Array.from(text).map(ch => {
            const code = ch.codePointAt(0);
            if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + (code - 65));
            if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D5EE + (code - 97));
            if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + (code - 48));
            return ch;
        }).join('');
    }

    // Reverses boldifyText - maps Mathematical Sans-Serif Bold characters back
    // to plain A-Z/a-z/0-9.
    unboldifyText(text) {
        return Array.from(text).map(ch => {
            const code = ch.codePointAt(0);
            if (code >= 0x1D5D4 && code <= 0x1D5ED) return String.fromCharCode(65 + (code - 0x1D5D4));
            if (code >= 0x1D5EE && code <= 0x1D607) return String.fromCharCode(97 + (code - 0x1D5EE));
            if (code >= 0x1D7EC && code <= 0x1D7F5) return String.fromCharCode(48 + (code - 0x1D7EC));
            return ch;
        }).join('');
    }

    // True if `text` contains at least one Mathematical Sans-Serif Bold
    // character - used to decide whether convertNotesLinesToTitle is toggling
    // bold on or off for a given block of lines.
    isBoldifiedText(text) {
        return Array.from(text).some(ch => {
            const code = ch.codePointAt(0);
            return (code >= 0x1D5D4 && code <= 0x1D607) || (code >= 0x1D7EC && code <= 0x1D7F5);
        });
    }

    // Drawing/image markers embedded in the notes text look like [[drawing:ID]] or
    // [[image:ID]] (used only for raw pasted image *data*, which has no natural text
    // form), plus plain pasted image URLs found directly in the text (used for a
    // pasted *link* to an image - left as ordinary, readable/copyable URL text
    // instead of being hidden behind a marker, since that's the closest thing to "a
    // hyperlink to the image" achievable inside a plain textarea, which can't
    // support real clickable links no matter what text sits inside it). Everything
    // found gets a small preview thumbnail in a strip under the textarea, in the
    // order it appears in the text; tapping a drawing reopens it for editing,
    // tapping a photo opens it full-size.
    getNotesMediaMarkers() {
        const text = this.globalNotes || '';
        const items = [];
        const re = /\[\[(drawing|image):([a-zA-Z0-9_-]+)\]\]/g;
        let m;
        while ((m = re.exec(text))) items.push({ type: m[1], id: m[2] });

        const urlRe = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg|avif)(?:\?\S*)?/gi;
        let um;
        while ((um = urlRe.exec(text))) items.push({ type: 'image-url', id: um[0] });

        return items;
    }

    renderNotesMediaStrip() {
        if (!this.notesPanelBody) return;
        let strip = document.getElementById('notes-drawings-strip');
        if (strip) strip.remove();

        const items = this.getNotesMediaMarkers();
        if (items.length === 0) return;

        // A plain <textarea> can't contain a real clickable hyperlink no matter what
        // text is used - the [[drawing:id]]/[[image:id]] markers (or a pasted image
        // URL) sitting in the raw notes stay inert, plain text either way. This strip
        // is the closest equivalent: every embedded drawing/image gets a labeled,
        // clickable entry here that opens it, styled and captioned like a link
        // rather than a bare thumbnail, so it's clear at a glance that tapping it
        // does something.
        strip = document.createElement('div');
        strip.id = 'notes-drawings-strip';

        const addEntry = (src, label, onClick) => {
            const entry = document.createElement('div');
            entry.className = 'notes-media-link';
            entry.addEventListener('click', onClick);
            const thumb = document.createElement('img');
            thumb.className = 'notes-drawing-thumb';
            thumb.src = src;
            entry.appendChild(thumb);
            const caption = document.createElement('span');
            caption.className = 'notes-media-link-label';
            caption.textContent = label;
            entry.appendChild(caption);
            strip.appendChild(entry);
        };

        items.forEach(({ type, id }) => {
            if (type === 'drawing') {
                const drawing = this.notesDrawings && this.notesDrawings[id];
                if (!drawing) return;
                addEntry(drawing.dataUrl, '🎨 Open drawing', () => this.editNotesDrawing(id));
            } else if (type === 'image') {
                // Legacy marker format - kept for backward compatibility with
                // already-saved notes from before URL pastes stopped using markers.
                const image = this.notesImages && this.notesImages[id];
                if (!image) return;
                addEntry(image.dataUrl || image.url, '🖼 View image', () => this.openNotesImageLightbox(image.dataUrl || image.url));
            } else if (type === 'image-url') {
                // id IS the URL here - found directly in the text, no lookup needed.
                addEntry(id, '🖼 View image', () => this.openNotesImageLightbox(id));
            }
        });
        this.notesPanelBody.appendChild(strip);
    }

    // Handles pasting either actual image *data* (e.g. a screenshot, or copied from
    // an image editor) or a plain text URL that looks like it points at an image.
    // Raw image data has no natural text form, so it still gets a [[image:ID]]
    // marker; a pasted URL is left as plain, ordinary URL text - readable and
    // copyable, and picked up automatically for a preview by getNotesMediaMarkers -
    // rather than replaced with an opaque marker, since a real clickable hyperlink
    // isn't possible inside a plain textarea no matter what text is used.
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
        // Otherwise, a pasted image URL (or any other text) just pastes normally -
        // getNotesMediaMarkers picks up the URL and shows its preview automatically
        // once the resulting 'input' event fires and re-renders the strip.
    }

    // Shared by the drawing tool - drops a [[type:id]] marker on its own line at
    // wherever the cursor last was, then re-renders so the preview strip picks it up.
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

    // Grabs an image straight off the system clipboard (via the radial "📷" button
    // next to a node's delete/promote buttons) and attaches it to that node as a
    // small preview shown under its text - clicking the preview opens it full-screen
    // via the same lightbox Notes photos use. Requires a real user gesture to call
    // navigator.clipboard.read() (which this button click satisfies) and a secure
    // context (https, or localhost) - browsers block clipboard image reads
    // otherwise.
    async captureNodePhotoFromClipboard(d) {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            this.showNotification('Clipboard image access isn\'t available in this browser/context.');
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find(t => t.startsWith('image/'));
                if (!imageType) continue;
                const blob = await item.getType(imageType);
                const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                this.pushUndo();
                d.data._nodePhotoUrl = dataUrl;
                this.renderFlowchart(this.rootData);
                this.autosave();
                this.showNotification('Photo added to node.');
                return;
            }
            this.showNotification('No image found on the clipboard - copy an image first.');
        } catch (err) {
            console.error('Clipboard photo capture failed:', err);
            this.showNotification('Couldn\'t read an image from the clipboard (browser may need permission).');
        }
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
            color: '#000000',
            width: 4,
            eraserWidth: 24,
            editingId: null,
            // Set when the drawing overlay was opened for a specific node (the 🎨
            // radial button) rather than a Notes drawing - see openDrawingOverlay/
            // closeDrawingOverlay.
            nodeTarget: null,
            // True only while the enable-drawing button is physically held down -
            // drawing is gated on this the whole time, not a one-shot "armed" flag
            // consumed by a single stroke.
            holding: false,
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
            const diameter = Math.max(4, activeWidth() * state.scale * (state.fitScale || 1));
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
            // The enable-drawing button is static (bottom-left, fixed via CSS) and no
            // longer follows the handle around - it stays put so it's always at a
            // known, reachable spot regardless of where the drawing point currently is.
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
            btn.addEventListener('click', () => {
                if (btn.dataset.tool === 'text') {
                    setTool('text');
                    // Ask for the text first, then stamp it immediately at wherever
                    // the pen (the handle's crosshair point) currently sits - no
                    // press/drag/release needed, since there's nothing to preview
                    // while dragging for a text stamp anyway.
                    const text = window.prompt('Text:', '');
                    if (!text) return;
                    const handlePt = getHandleClientPoint();
                    const pt = toCrosshairCanvasPoint(handlePt.x, handlePt.y);
                    pushUndoSnapshot();
                    ctx.save();
                    ctx.fillStyle = state.color;
                    ctx.font = `${Math.max(14, state.width * 6)}px sans-serif`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(text, pt.x, pt.y);
                    ctx.restore();
                    return;
                }
                setTool(btn.dataset.tool);
            });
        });
        setTool('brush');

        const colorInput = document.getElementById('drawing-color');
        const widthInput = document.getElementById('drawing-width');
        const eraserWidthInput = document.getElementById('drawing-eraser-width');
        if (colorInput) colorInput.addEventListener('input', () => { state.color = colorInput.value; });

        // One-tap preset colors directly in the toolbar - the native <input type="color">
        // picker is still there for anything custom, but common colors shouldn't need
        // opening a whole separate picker dialog every time.
        const swatchWrap = document.getElementById('drawing-color-swatches');
        if (swatchWrap) {
            const presetColors = ['#000000', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0074d9', '#af52de'];
            presetColors.forEach(hex => {
                const swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.title = hex;
                swatch.style.cssText = `width:22px; height:22px; border-radius:5px; padding:0; cursor:pointer; background:${hex}; border:1.5px solid rgba(255,255,255,0.6);`;
                swatch.addEventListener('click', () => {
                    state.color = hex;
                    if (colorInput) colorInput.value = hex;
                });
                swatchWrap.appendChild(swatch);
            });
        }

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
        document.getElementById('drawing-delete-btn').addEventListener('click', () => this.deleteCurrentDrawing());

        // ---- Toggle button: drawing only happens while this is physically held
        // down. Pressing it also starts a stroke right away at wherever the handle's
        // crosshair currently sits (so a press-and-release with no handle movement
        // still draws a dot/mark there), and releasing it always finalizes whatever
        // stroke was in progress, even if the handle itself isn't the one that
        // triggered the release. ----
        let toggleBtnPointerId = null;
        this.drawingToggleBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleBtnPointerId = e.pointerId;
            this.drawingToggleBtn.setPointerCapture(toggleBtnPointerId);
            state.holding = true;
            this.drawingHandle.classList.add('armed');
            this.drawingToggleBtn.classList.add('armed');
            const handlePt = getHandleClientPoint();
            beginDrawAction(toCrosshairCanvasPoint(handlePt.x, handlePt.y));
        });
        const finishToggleBtnPointer = (e) => {
            if (e.pointerId !== toggleBtnPointerId) return;
            toggleBtnPointerId = null;
            state.holding = false;
            this.drawingHandle.classList.remove('armed');
            this.drawingToggleBtn.classList.remove('armed');
            if (state.drawing) {
                const handlePt = getHandleClientPoint();
                endDrawAction(toCrosshairCanvasPoint(handlePt.x, handlePt.y));
            }
        };
        this.drawingToggleBtn.addEventListener('pointerup', finishToggleBtnPointer);
        this.drawingToggleBtn.addEventListener('pointercancel', finishToggleBtnPointer);

        // ---- Handle: always draggable to reposition the pen; while the toggle
        // button above is held down, moving it also draws. ----
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
            if (state.tool === 'text') return; // handled instantly via the T button now
            state.drawing = true;
            state.beforeSnapshot = ctx.getImageData(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);
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
            }
            // Text is stamped instantly via the T button now (see the tool-button
            // click handler above), not through a handle press/drag/release, so
            // there's nothing left to finalize here for it.
            // beforeSnapshot already captures the pre-action state - commit it to the
            // undo stack now that the action is finished.
            state.undoStack.push(state.beforeSnapshot);
            if (state.undoStack.length > 40) state.undoStack.shift();
            state.redoStack = [];
            state.beforeSnapshot = null;
            state.drawing = false;
        };

        this.drawingHandle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handlePointerId = e.pointerId;
            this.drawingHandle.setPointerCapture(handlePointerId);
            const handlePt = getHandleClientPoint();
            grabOffsetX = e.clientX - handlePt.x;
            grabOffsetY = e.clientY - handlePt.y;
            if (state.holding && !state.drawing) {
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
            const canvasPt = toCrosshairCanvasPoint(centerClientX, centerClientY);
            if (state.holding) {
                // Covers both the common case (already drawing, just continue) and
                // the toggle button having been pressed *after* this drag already
                // started (nothing was drawing yet, so start now instead).
                if (state.drawing) {
                    continueDrawAction(canvasPt);
                } else {
                    beginDrawAction(canvasPt);
                }
            } else if (state.drawing) {
                // The button was released mid-drag - stop right where we are rather
                // than continuing to draw with nothing held down.
                endDrawAction(canvasPt);
            }
            // The handle still visually follows the finger/cursor regardless of
            // whether it's currently drawing.
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
            if (state.holding && !state.drawing) {
                const handlePt = getHandleClientPoint();
                beginDrawAction(toCrosshairCanvasPoint(handlePt.x, handlePt.y));
            }
        });

        // Safari fires its own proprietary gesture events (gesturestart/change/end)
        // to drive native pinch-to-zoom, and doesn't reliably respect touch-action:
        // none for that specific gesture on older iOS versions - so even with the
        // touchstart-based pinch guard above, a genuine two-finger touch (holding
        // the enable-drawing button + dragging the pen handle) could still get
        // hijacked into zooming the whole page rather than drawing. Unconditionally
        // blocking these while the overlay is open closes that gap.
        ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
            this.drawingOverlay.addEventListener(evt, (e) => e.preventDefault());
        });

        // ---- Two-finger pan + pinch zoom on the canvas area ----
        let pinch = null;
        // Hold-to-draw is itself a two-touch gesture on touchscreens (one finger
        // holding the enable-drawing button, a second dragging the pen handle) -
        // without this check, that gets misread as an attempt to pinch-zoom the
        // canvas instead of actually drawing.
        const isDrawingControlTouch = (touch) => {
            const t = touch && touch.target;
            return Boolean(t && (this.drawingToggleBtn.contains(t) || this.drawingHandle.contains(t)));
        };
        this.drawingOverlay.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                const [a, b] = e.touches;
                if (isDrawingControlTouch(a) || isDrawingControlTouch(b)) {
                    pinch = null;
                    return;
                }
                const midX = (a.clientX + b.clientX) / 2;
                const midY = (a.clientY + b.clientY) / 2;
                pinch = {
                    dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
                    startScale: state.scale,
                    // The canvas-wrap-space point currently sitting under the
                    // fingers' midpoint. transform-origin is 0,0 (top-left), so a
                    // scale change alone always expands/contracts everything away
                    // from that corner, not from wherever the fingers actually are -
                    // keeping this exact point anchored under the fingers as they
                    // move is what makes the zoom (and any panning motion) track the
                    // gesture correctly instead of just drifting toward the corner.
                    anchorX: (midX - state.panX) / state.scale,
                    anchorY: (midY - state.panY) / state.scale
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
                // Solve for the pan that keeps the anchored point exactly under the
                // fingers' current midpoint - this single formula correctly handles
                // pure pinch (fingers spread, midpoint roughly stationary), pure pan
                // (midpoint moves, spacing roughly stationary), and any combination
                // of the two at once.
                state.panX = midX - pinch.anchorX * state.scale;
                state.panY = midY - pinch.anchorY * state.scale;
                applyPanZoom();
            }
        }, { passive: false });
        this.drawingOverlay.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) pinch = null;
        });
        // Desktop equivalent: mouse wheel zooms, anchored under the cursor rather
        // than the top-left corner, for the same reason as the pinch fix above.
        this.drawingOverlay.addEventListener('wheel', (e) => {
            e.preventDefault();
            const anchorX = (e.clientX - state.panX) / state.scale;
            const anchorY = (e.clientY - state.panY) / state.scale;
            state.scale = clampScale(state.scale * (e.deltaY < 0 ? 1.1 : 0.9));
            state.panX = e.clientX - anchorX * state.scale;
            state.panY = e.clientY - anchorY * state.scale;
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
    // existingId: an id into this.notesDrawings, for editing/creating a Notes drawing
    // (unused/null when drawing for a node instead).
    // nodeTarget: a node's raw data object (see the 🎨 radial button) - when set, the
    // finished drawing is saved straight into that node's _nodePhotoUrl on Done
    // instead of into this.notesDrawings.
    openDrawingOverlay(existingId, nodeTarget = null) {
        if (!this.drawingOverlay) return;
        const state = this._drawingState;
        const ctx = this._drawingCtx;
        const canvas = this.drawingCanvas;

        this.drawingOverlay.style.display = 'block';
        // Fixed, device-independent internal resolution - NOT tied to
        // window.innerWidth/innerHeight. Two problems this solves at once:
        // 1. Reopening a drawing on a different-sized screen used to stretch it to
        //    fill whatever the new window's dimensions happened to be, distorting
        //    the whole image. A fixed internal size means the stored pixel grid
        //    never changes shape no matter what device opens it.
        // 2. It keeps the exported PNG's resolution - and so its file size - bounded
        //    and consistent, rather than scaling up (and bloating the base64 that
        //    gets pushed to cloud sync) on a large/high-DPI screen.
        // The on-screen *display* size is fit to the current viewport separately,
        // below, preserving this aspect ratio (letterboxed/centered by the wrap's
        // flex centering) rather than stretching - toCanvasPoint already derives
        // drawing coordinates from canvas.width/height vs. the actual rendered
        // bounding box, so it doesn't need to know the two differ.
        const DRAWING_CANVAS_W = 1600;
        const DRAWING_CANVAS_H = 1000;
        canvas.width = DRAWING_CANVAS_W;
        canvas.height = DRAWING_CANVAS_H;

        // Fit within the viewport, leaving room for the toolbar (top) and the
        // hold-to-draw bar (bottom), preserving aspect ratio.
        const availW = window.innerWidth - 24;
        const availH = window.innerHeight - 140;
        const fitScale = Math.max(0.1, Math.min(availW / DRAWING_CANVAS_W, availH / DRAWING_CANVAS_H));
        canvas.style.width = Math.round(DRAWING_CANVAS_W * fitScale) + 'px';
        canvas.style.height = Math.round(DRAWING_CANVAS_H * fitScale) + 'px';
        // Brush/eraser widths are defined in the canvas's own fixed pixel space
        // (ctx.lineWidth), but the canvas is displayed at fitScale * state.scale
        // relative to that (see updateSizeIndicator) - without dividing back out
        // fitScale here, the on-screen size indicator ignored how much the fixed
        // 1600x1000 canvas was shrunk to fit the viewport, so it never matched the
        // actual rendered stroke size except when fitScale happened to be 1.
        state.fitScale = fitScale;

        // Smooths both scaled image loads (see the letterboxed drawImage below) and
        // the visible on-screen rendering when the display size differs from the
        // canvas's own resolution - actual pen strokes are still drawn at native
        // resolution; this doesn't soften linework, only scaling artifacts.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        state.scale = 1;
        state.panX = 0;
        state.panY = 0;
        state.undoStack = [];
        state.redoStack = [];
        state.editingId = existingId || null;
        state.nodeTarget = nodeTarget || null;
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
                // Fit the loaded image within the fixed canvas preserving its own
                // aspect ratio (letterboxed/centered) rather than stretching it to
                // exactly fill the canvas - matters for drawings saved before this
                // fixed-resolution canvas existed, which may have any aspect ratio.
                const loadFitScale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const drawW = img.width * loadFitScale;
                const drawH = img.height * loadFitScale;
                const offsetX = (canvas.width - drawW) / 2;
                const offsetY = (canvas.height - drawH) / 2;
                ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
            };
            img.src = this.notesDrawings[existingId].dataUrl;
        }
    }

    closeDrawingOverlay(save) {
        if (!this.drawingOverlay) return;
        const state = this._drawingState;

        if (save) {
            const dataUrl = this.drawingCanvas.toDataURL('image/png');

            if (state.nodeTarget) {
                this.pushUndo();
                state.nodeTarget._nodePhotoUrl = dataUrl;
                state.nodeTarget = null;
                this.renderFlowchart(this.rootData);
                this.autosave();
                this.drawingOverlay.style.display = 'none';
                return;
            }

            let id = state.editingId;
            if (!id) {
                id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            }
            this.notesDrawings[id] = { dataUrl };

            if (!state.editingId && this.notesTextarea) {
                // Brand new drawing - insert its marker at wherever the cursor last was.
                this.insertNotesMediaMarker('drawing', id);
                this.drawingOverlay.style.display = 'none';
                state.nodeTarget = null;
                return;
            }

            this.renderNotesPanel();
            this.autosave();
        }

        state.nodeTarget = null;
        this.drawingOverlay.style.display = 'none';
    }

    // Swaps the currently-edited node with its previous/next real (non-placeholder)
    // sibling in their shared parent's children array - reordering left-to-right
    // position without changing depth or parent, unlike drag-and-drop (which can
    // also reparent). Does nothing at the leftmost/rightmost real sibling, or for
    // the root (no parent to reorder within).
    moveNodeLeft() {
        this.swapNodeWithSibling(-1);
    }

    moveNodeRight() {
        this.swapNodeWithSibling(1);
    }

    swapNodeWithSibling(direction) {
        const d = this.nodeBeingEdited;
        if (!d || !d.parent) return;
        const siblings = d.parent.data.children;
        if (!Array.isArray(siblings)) return;
        const realIndices = siblings
            .map((c, i) => ({ c, i }))
            .filter(({ c }) => !this.isPlaceholderNodeData(c))
            .map(({ i }) => i);
        const myPos = realIndices.indexOf(siblings.indexOf(d.data));
        const swapWithPos = myPos + direction;
        if (myPos === -1 || swapWithPos < 0 || swapWithPos >= realIndices.length) return;

        this.pushUndo();
        const i1 = realIndices[myPos];
        const i2 = realIndices[swapWithPos];
        [siblings[i1], siblings[i2]] = [siblings[i2], siblings[i1]];

        if (this.resyncMorphRows()) this.renderMorphPanel();
        this.renderFlowchart(this.rootData);
        this.hideNodeEditPopup(false);
        this.autosave();
    }

    // Clears whichever image is attached to the currently-edited node - a pasted
    // photo or a hand-drawn one (see the "Remove Image" button in the node edit
    // popup) - both are just _nodePhotoUrl under the hood, so one action clears either.
    removeNodeImage() {
        if (!this.nodeBeingEdited) return;
        if (!this.nodeBeingEdited.data._nodePhotoUrl) {
            this.showNotification('This node has no image or drawing to remove.');
            return;
        }
        this.pushUndo();
        delete this.nodeBeingEdited.data._nodePhotoUrl;
        this.renderFlowchart(this.rootData);
        this.autosave();
        this.showNotification('Image removed.');
    }

    // Deletes whatever the drawing overlay is currently attached to (see the
    // overlay's 🗑 Delete button) - a node's photo/drawing, or an existing Notes
    // drawing (its marker included, not just the pixel data, so Notes doesn't end
    // up with a dead "[[drawing:...]]" link pointing at nothing) - then closes the
    // overlay without saving whatever unsaved edits were in progress.
    deleteCurrentDrawing() {
        const state = this._drawingState;
        if (state.nodeTarget) {
            delete state.nodeTarget._nodePhotoUrl;
            state.nodeTarget = null;
            this.renderFlowchart(this.rootData);
            this.autosave();
        } else if (state.editingId && this.notesDrawings[state.editingId]) {
            delete this.notesDrawings[state.editingId];
            const marker = `[[drawing:${state.editingId}]]`;
            this.globalNotes = (this.globalNotes || '')
                .split('\n')
                .filter(line => line.trim() !== marker)
                .join('\n');
            this.renderNotesPanel();
            this.autosave();
        }
        this.drawingOverlay.style.display = 'none';
    }

    // Adds a node's name into the Pugh Matrix as a solution (column) or a criteria
    // (row), from the "Add Solution"/"Add Criteria" buttons in the node edit popup -
    // does nothing if that exact name is already present, rather than creating a
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

    // Adds an accepted Morph Matrix idea into the Pugh Matrix as a new solution
    // column - same duplicate-name guard as addNodeToPugh.
    addMorphIdeaToPugh(ideaId) {
        const idea = this.morphMatrix.ideas.find(i => i.id === ideaId);
        if (!idea) return;
        const exists = this.pughMatrix.columns.some(c => c.title.trim().toLowerCase() === idea.text.trim().toLowerCase());
        if (exists) {
            this.showNotification(`"${idea.text}" is already a solution in the Pugh Matrix.`);
            return;
        }
        this.pughMatrix.columns.push({ id: this.nextPughId('col'), title: idea.text });
        this.autosave();
        this.showNotification(`Added "${idea.text}" as a Pugh Matrix solution.`);
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
    // A partition-sort (quicksort-style) for ordering the solutions (columns)
    // against a single criteria at a time, rather than typing in numeric scores
    // directly. Session state (taskStack/settledGroups/baseline/pool/selections) is
    // deliberately ephemeral - held only on the in-memory criteria object, not
    // persisted through save/export - since it's mid-process working state; only the
    // *final* scores it produces get written into pughMatrix.scores.
    //
    // Algorithm: each round compares one baseline (the first item in whatever pool
    // is currently active) against every *other* member of that same pool, each
    // marked - (worse), S (tied), or + (better). That splits the pool into three
    // groups - better, tied-with-baseline, worse - and all three are immediately
    // final relative to *each other*: better is a strictly higher tier than
    // tied-with-baseline, which is strictly higher than worse. The tied-with-
    // baseline group settles immediately as one rank tier. The better and worse
    // groups, if they have more than one member, still need their own internal
    // order sorted out - each becomes its own pending task, and (per ordinary
    // partition-sort) the "better" subtree is always fully resolved down to
    // individual settled tiers before the tied tier is emitted, which is in turn
    // emitted before the "worse" subtree is touched - so tiers always come out in
    // correct best-to-worst order no matter how many rounds a given branch needs.
    // A pool of 0 or 1 members needs no comparison and settles immediately.
    getOrInitRankSession(crit) {
        if (!crit.rankSession) {
            const pool = this.pughMatrix.columns.map(c => c.id);
            crit.rankSession = {
                taskStack: pool.length > 0 ? [{ type: 'sort', pool }] : [],
                settledGroups: [],
                baselineId: null,
                pool: [],
                selections: {},
                lastRoundWinners: [],
                finished: false
            };
            this.advanceRankTaskStack(crit.rankSession);
        }
        return crit.rankSession;
    }

    // Pops anything already fully resolved off the task stack - explicit "emit"
    // tiers, and "sort" tasks with 0 or 1 members that need no actual comparison -
    // appending each to settledGroups in stack order (which is always correct
    // best-to-worst order; see the algorithm comment above). Stops as soon as it
    // hits a "sort" task with 2+ members, which becomes the round the person
    // actually sees and responds to, or leaves the session finished if the stack
    // empties out completely.
    advanceRankTaskStack(session) {
        while (session.taskStack.length > 0) {
            const top = session.taskStack[session.taskStack.length - 1];
            if (top.type === 'emit') {
                session.taskStack.pop();
                if (top.group.length > 0) session.settledGroups.push(top.group);
                continue;
            }
            if (top.pool.length === 0) {
                session.taskStack.pop();
                continue;
            }
            if (top.pool.length === 1) {
                session.taskStack.pop();
                session.settledGroups.push(top.pool.slice());
                continue;
            }
            // A genuine comparison is needed - present this as the active round.
            session.baselineId = top.pool[0];
            session.pool = top.pool;
            session.selections = {};
            top.pool.forEach(id => { if (id !== session.baselineId) session.selections[id] = 'S'; });
            return;
        }
        session.baselineId = null;
        session.pool = [];
        session.finished = true;
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

        const others = session.pool.filter(id => id !== session.baselineId);
        const better = others.filter(id => session.selections[id] === '+');
        const equal = others.filter(id => session.selections[id] === 'S');
        const worse = others.filter(id => session.selections[id] === '-');

        session.lastRoundWinners = better.length > 0 ? better.slice() : [session.baselineId, ...equal];

        // Replace the task we just resolved with its three outcomes, pushed so that
        // "better" ends up on top (resolved first), then the tied tier (an
        // immediate emit), then "worse" underneath (resolved last) - see the
        // algorithm comment above getOrInitRankSession for why this ordering keeps
        // tiers coming out best-to-worst.
        session.taskStack.pop();
        if (worse.length > 0) session.taskStack.push({ type: 'sort', pool: worse });
        session.taskStack.push({ type: 'emit', group: [session.baselineId, ...equal] });
        if (better.length > 0) session.taskStack.push({ type: 'sort', pool: better });

        this.advanceRankTaskStack(session);

        if (session.finished) {
            this.finalizePughRanking(critId);
        }

        this.renderPughPanel();
        this.autosave();
    }

    // Converts a finished session's tiered (best-to-worst, ties grouped together)
    // groups into scores, replacing whatever this criteria's scores were before - so
    // re-running the ranking as many times as you like always just *overwrites* its
    // scores with a fresh result rather than the numbers climbing every time you redo
    // it. Lowest score is best (1st place = 1), same as a race or golf score, and
    // every solution within a tied group gets the exact same number - it's the group
    // (rank tier) index that determines the score, not each item's position within a
    // flat list, so a 4-way tie for 2nd all score "2", not four different numbers.
    finalizePughRanking(critId) {
        const crit = this.pughMatrix.criteria.find(c => c.id === critId);
        if (!crit || !crit.rankSession) return;
        const groups = crit.rankSession.settledGroups;
        groups.forEach((group, groupIdx) => {
            const rank = groupIdx + 1; // 1st place (best) = 1, matching a race/golf score
            group.forEach(colId => this.setPughScore(critId, colId, rank));
        });
        // Column order must always show the best (lowest) total score on the left - a
        // completed ranking re-sorts the whole table immediately, rather than only
        // reordering when the "Overall Rank" button happens to be clicked separately.
        const totals = {};
        this.pughMatrix.columns.forEach(col => { totals[col.id] = this.computePughColumnTotal(col.id); });
        this.pughMatrix.columns.sort((a, b) => totals[a.id] - totals[b.id]);
    }

    // Called whenever the person leaves a criteria's ranking session before it's run
    // all the way to completion (toggling Rank mode off, or switching to rank a
    // different criteria) - without this, stopping partway through a tournament
    // saved nothing at all, since finalizePughRanking previously only ever ran once
    // a session reached its natural end. The currently-active pool goes back on the
    // stack as an unresolved task, then the whole stack drains in order: any "sort"
    // task with more than one member left becomes one tied group (no further
    // rounds to distinguish them), while the relative order between separate stack
    // frames - a "better" subtree vs. the tied tier vs. a "worse" subtree - is
    // preserved rather than being flattened into one big tie regardless of what was
    // already confirmed.
    finalizeInProgressRankSessionIfAny(critId) {
        const crit = this.pughMatrix.criteria.find(c => c.id === critId);
        if (!crit || !crit.rankSession || crit.rankSession.finished) return;
        const session = crit.rankSession;
        if (session.pool.length > 0) {
            session.taskStack.push({ type: 'sort', pool: session.pool });
        }
        while (session.taskStack.length > 0) {
            const task = session.taskStack.pop();
            if (task.type === 'emit') {
                if (task.group.length > 0) session.settledGroups.push(task.group);
            } else if (task.pool.length > 0) {
                session.settledGroups.push(task.pool.slice());
            }
        }
        session.pool = [];
        session.baselineId = null;
        session.finished = true;
        this.finalizePughRanking(critId);
        this.autosave();
    }

    // Reorders the solution columns left-to-right by total score across every
    // criteria (best/lowest first) - "overall rank" taking every ranked criteria into
    // account, not just the one currently active.
    reorderPughColumnsByOverallRank() {
        const m = this.pughMatrix;
        const totals = {};
        m.columns.forEach(col => { totals[col.id] = this.computePughColumnTotal(col.id); });
        m.columns.sort((a, b) => totals[a.id] - totals[b.id]);
        this.renderPughPanel();
        this.autosave();
    }

    // Reorders the solution columns left-to-right by just one criteria's score.
    reorderPughColumnsByCriteria(critId) {
        const m = this.pughMatrix;
        m.columns.sort((a, b) => this.getPughScore(critId, a.id) - this.getPughScore(critId, b.id));
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
            // Ties within a group are joined with "=" and groups (rank tiers) with
            // ">", e.g. "A > B = C > D" for a 4-way field where B and C tied for 2nd.
            const summary = session.settledGroups
                .map(group => group.map(getColTitle).join('  =  '))
                .join('  >  ');
            done.textContent = 'Done - final order: ' + summary;
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

            ['-', 'S', '+'].forEach(choice => {
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

    // The best 3 *distinct* score values within a single criteria's row - lowest
    // score is best now (1st place = 1, like a race/golf score), so e.g. row scores
    // [1, 1, 3, 4, 2, 8] have distinct values [1, 2, 3, 4, 8] sorted best-first, and
    // the best 3 are 1, 2, and 3 - every cell holding one of those values gets
    // highlighted (so a tie for 3rd place highlights all of the tied cells, not an
    // arbitrary subset, however many cells that ends up being). Returns null if
    // there are fewer than 2 columns to compare, or every score in the row is equal
    // (nothing meaningful to single out).
    getPughRowTopScores(critId) {
        const scores = this.pughMatrix.columns.map(col => this.getPughScore(critId, col.id));
        if (scores.length < 2) return null;
        const distinct = Array.from(new Set(scores)).sort((a, b) => a - b);
        if (distinct.length < 2) return null;
        return new Set(distinct.slice(0, 3));
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
            if (!this._pughRankMode) {
                if (this._pughActiveCriteriaId) {
                    this.finalizeInProgressRankSessionIfAny(this._pughActiveCriteriaId);
                }
                this._pughActiveCriteriaId = null;
            }
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

        // Body rows (one per criterion)
        const tbody = document.createElement('tbody');
        m.criteria.forEach(crit => {
            const tr = document.createElement('tr');
            // Top 3 scores *within this row* (across solutions) - highlighting is now
            // per criteria row, not per solution column.
            const rowTopScores = this.getPughRowTopScores(crit.id);

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
                    // Leaving whichever criteria was previously active - save
                    // whatever progress was made on it rather than abandoning it
                    // unsaved.
                    if (this._pughActiveCriteriaId) {
                        this.finalizeInProgressRankSessionIfAny(this._pughActiveCriteriaId);
                    }
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
                if (rowTopScores && rowTopScores.has(score)) {
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
        // Lowest total is best now, so that's the one highlighted here, not the highest.
        const bestTotal = totals.length ? Math.min(...totals) : null;
        const hasSpread = totals.some(t => t !== totals[0]);
        m.columns.forEach((col, i) => {
            const td = document.createElement('td');
            td.className = 'pugh-score-cell';
            td.dataset.colId = col.id;
            td.textContent = totals[i];
            td.style.textAlign = 'center';
            if (m.criteria.length > 0 && bestTotal !== null && totals[i] === bestTotal && hasSpread) {
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

    // Builds the Morph Matrix table fresh into #morph-panel-body - one row per
    // parameter, one clickable cell per green-child option, a live-updating "current
    // idea" preview built from whatever's selected so far, an Accept button, and a
    // list of previously accepted ideas.
    renderMorphPanel() {
        if (!this.morphPanelBody) return;
        // Self-healing: refresh every row/option's name from its live node reference
        // (if any) right before rendering, so renaming a node elsewhere always shows
        // up here the next time this panel draws, regardless of exactly which code
        // path triggered the rename.
        this.resyncMorphRows();
        const m = this.morphMatrix;
        this.morphPanelBody.innerHTML = '';
        this.morphPanelBody.style.display = this._leftPanelMode === 'morph' ? 'flex' : 'none';

        const toolbar = document.createElement('div');
        toolbar.className = 'pugh-toolbar';
        const hint = document.createElement('div');
        hint.className = 'pugh-empty-state';
        hint.style.padding = '4px 2px';
        hint.textContent = 'Use "Add to Morph" in a node\'s edit menu to add it as a column here.';
        toolbar.appendChild(hint);
        this.morphPanelBody.appendChild(toolbar);

        if (m.rows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'pugh-empty-state';
            empty.textContent = 'No columns yet - edit a green parent node with green children and click "Add to Morph".';
            this.morphPanelBody.appendChild(empty);
            return;
        }

        const wrap = document.createElement('div');
        wrap.className = 'pugh-table-wrap';
        const table = document.createElement('table');
        table.className = 'pugh-table morph-table';

        const sel = this._morphCurrentSelection || {};

        // Header row: one column per parameter (parent node), with its name + a
        // delete button - columns are the parents, rows below are the option slots.
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        m.rows.forEach(row => {
            const th = document.createElement('th');
            th.className = 'pugh-criteria-cell';
            const headDiv = document.createElement('div');
            headDiv.style.display = 'flex';
            headDiv.style.alignItems = 'center';
            headDiv.style.justifyContent = 'center';
            headDiv.style.gap = '4px';
            const nameLabel = document.createElement('div');
            nameLabel.className = 'morph-row-name';
            nameLabel.textContent = row.name;
            const delRowBtn = document.createElement('button');
            delRowBtn.className = 'pugh-delete-row-btn';
            delRowBtn.title = 'Delete this column';
            delRowBtn.textContent = '\u00d7';
            delRowBtn.addEventListener('click', () => this.deleteMorphRow(row.id));
            headDiv.appendChild(nameLabel);
            headDiv.appendChild(delRowBtn);
            th.appendChild(headDiv);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        // Body: one row per option "slot" - since different parameters can have
        // different numbers of green children, pad shorter columns with blank cells
        // up to the tallest column's option count.
        const tbody = document.createElement('tbody');
        const maxOptions = m.rows.reduce((max, row) => Math.max(max, row.options.length), 0);
        if (maxOptions === 0) {
            const tr = document.createElement('tr');
            const emptyTd = document.createElement('td');
            emptyTd.className = 'pugh-empty-state';
            emptyTd.colSpan = m.rows.length;
            emptyTd.textContent = '(no green children found on any row)';
            tr.appendChild(emptyTd);
            tbody.appendChild(tr);
        } else {
            for (let i = 0; i < maxOptions; i++) {
                const tr = document.createElement('tr');
                m.rows.forEach(row => {
                    const option = row.options[i];
                    const td = document.createElement('td');
                    if (option === undefined) {
                        td.className = 'morph-option-cell-blank';
                    } else {
                        td.className = 'morph-option-cell';
                        if (Array.isArray(sel[row.id]) && sel[row.id].includes(option)) td.classList.add('morph-option-selected');
                        td.textContent = option;
                        td.addEventListener('click', () => this.toggleMorphSelection(row.id, option));
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            }
        }
        table.appendChild(tbody);
        wrap.appendChild(table);
        this.morphPanelBody.appendChild(wrap);

        // Current idea preview + Accept
        const previewRow = document.createElement('div');
        previewRow.className = 'morph-preview-row';
        const ideaText = this.getMorphCurrentIdeaText();
        const previewLabel = document.createElement('div');
        previewLabel.className = 'morph-preview-label';
        previewLabel.textContent = ideaText ? ('Idea: ' + ideaText) : 'Click a cell in each column to build an idea.';
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'pugh-rerank-btn';
        acceptBtn.textContent = 'Accept';
        acceptBtn.disabled = !ideaText;
        acceptBtn.style.opacity = ideaText ? '1' : '0.5';
        acceptBtn.addEventListener('click', () => this.acceptMorphIdea());
        previewRow.appendChild(previewLabel);
        previewRow.appendChild(acceptBtn);
        this.morphPanelBody.appendChild(previewRow);

        // Accepted ideas list
        if (m.ideas.length > 0) {
            const ideasTitle = document.createElement('div');
            ideasTitle.className = 'pugh-rank-title';
            ideasTitle.style.marginTop = '8px';
            ideasTitle.textContent = 'Accepted ideas';
            this.morphPanelBody.appendChild(ideasTitle);

            const ideasList = document.createElement('div');
            ideasList.className = 'morph-ideas-list';
            m.ideas.forEach(idea => {
                const row = document.createElement('div');
                row.className = 'morph-idea-row';
                const text = document.createElement('div');
                text.className = 'morph-idea-text';
                text.textContent = idea.text;
                const addToPughBtn = document.createElement('button');
                addToPughBtn.className = 'pugh-toolbar-mini-btn';
                addToPughBtn.textContent = '📊 Add to Pugh\'s';
                addToPughBtn.title = 'Add this idea as a solution in the Pugh Matrix';
                addToPughBtn.addEventListener('click', () => this.addMorphIdeaToPugh(idea.id));
                const delBtn = document.createElement('button');
                delBtn.className = 'pugh-delete-row-btn';
                delBtn.title = 'Delete this idea';
                delBtn.textContent = '\u00d7';
                delBtn.addEventListener('click', () => this.deleteMorphIdea(idea.id));
                row.appendChild(text);
                row.appendChild(addToPughBtn);
                row.appendChild(delBtn);
                ideasList.appendChild(row);
            });
            this.morphPanelBody.appendChild(ideasList);
        }

        this.applyMobileViewState();
    }

    // Cheap update used while typing weights/scores: recomputes the totals row and
    // the per-row top-score highlight in place, instead of rebuilding (and losing
    // focus/cursor position in) the whole table.
    refreshPughComputedDisplays() {
        const m = this.pughMatrix;

        const rowTopScoresCache = {};
        this.pughPanelBody.querySelectorAll('.pugh-score-cell[data-crit-id]').forEach(td => {
            const critId = td.dataset.critId;
            const colId = td.dataset.colId;
            const score = this.getPughScore(critId, colId);
            if (!(critId in rowTopScoresCache)) {
                rowTopScoresCache[critId] = this.getPughRowTopScores(critId);
            }
            const rowTopScores = rowTopScoresCache[critId];
            const isTop = Boolean(rowTopScores && rowTopScores.has(score));
            td.classList.toggle('pugh-top-score-cell', isTop);
        });

        const row = document.getElementById('pugh-totals-row');
        if (!row) return;
        const totals = m.columns.map(col => this.computePughColumnTotal(col.id));
        // Lowest total is best now, so that's the one highlighted here, not the highest.
        const bestTotal = totals.length ? Math.min(...totals) : null;
        const hasSpread = totals.some(t => t !== totals[0]);
        const cells = row.querySelectorAll('td[data-col-id]');
        cells.forEach((td, i) => {
            td.textContent = totals[i];
            const isBest = m.criteria.length > 0 && bestTotal !== null && totals[i] === bestTotal && hasSpread;
            td.classList.toggle('pugh-max-weighted-cell', isBest);
        });
    }

    exportAsJSON() {
        function stripParents(node) {
            const { name, children, color, _collapsed, _reflectionAnswers, _isPlaceholder, _nodePhotoUrl } = node;
            const out = { name };
            if (color) out.color = color;
            if (_collapsed) out._collapsed = true;
            if (_isPlaceholder) out._isPlaceholder = true;
            if (_nodePhotoUrl) out._nodePhotoUrl = _nodePhotoUrl;
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
            morphMatrix: this.morphMatrix,
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

        // Every tree-editing action ultimately calls renderFlowchart to reflect the
        // change, so hooking the Morph Matrix resync in here - rather than trying to
        // individually catch every add/delete/reparent/duplicate function that could
        // affect it - guarantees it never misses a change, regardless of which
        // specific action caused it (this runs on genuine tree edits only; simple
        // pan/zoom doesn't call renderFlowchart at all).
        if (this.resyncMorphRows && this.resyncMorphRows()) {
            this.renderMorphPanel();
        }
        
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

        // A node with a photo attached (see captureNodePhotoFromClipboard) gets a
        // small thumbnail preview rendered below its text, inside the same box - the
        // box grows taller to fit it, and the text shifts up by half that extra space
        // so it stays visually centered over the top portion, with the photo filling
        // the newly added bottom portion.
        const PHOTO_W = 46;
        const PHOTO_H = 30;
        const PHOTO_GAP = 6;
        const textBoxHeight = d => d._lines.length * LINE_HEIGHT + PADDING_Y;
        const photoExtra = d => (d.data._nodePhotoUrl ? (PHOTO_H + PHOTO_GAP) : 0);
        const totalBoxHeight = d => textBoxHeight(d) + photoExtra(d);

        node.append('rect')
        .attr('width', NODE_WIDTH)
        .attr('height', d => totalBoxHeight(d))
        .attr('x', -NODE_WIDTH/2)
        .attr('y', d => -(totalBoxHeight(d) / 2))
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
            y: (i - (arr.length-1)/2) * LINE_HEIGHT + 4 - photoExtra(d) / 2,
            isLast: i === arr.length - 1,
            collapsed: d.data._collapsed
        })))
        .enter()
        .append('tspan')
        .attr('x', 0)
        .attr('y', d => d.y)
        .text(d => d.line);

        // Small photo preview under the text, for nodes with one attached (see
        // captureNodePhotoFromClipboard) - clicking it opens the full-size lightbox.
        node.filter(d => Boolean(d.data._nodePhotoUrl))
            .append('image')
            .attr('href', d => d.data._nodePhotoUrl)
            .attr('width', PHOTO_W)
            .attr('height', PHOTO_H)
            .attr('x', -PHOTO_W / 2)
            .attr('y', d => (totalBoxHeight(d) / 2) - PHOTO_H - 3)
            .attr('preserveAspectRatio', 'xMidYMid slice')
            .style('cursor', 'zoom-in')
            .on('click', (event, d) => {
                event.stopPropagation();
                this.openNotesImageLightbox(d.data._nodePhotoUrl);
            })
            .on('mousedown', (event) => event.stopPropagation());

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
                        .attr('y', d._lines.length * LINE_HEIGHT / 2 + 25 + photoExtra(d))
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
        // Matches the extra height added for a photo preview under the text in the
        // main node rendering above, so the radial buttons stay clear of a node with
        // a photo attached instead of floating too close to (or overlapping) it.
        const photoExtraHeight = targetDatum.data._nodePhotoUrl ? (30 + 6) : 0;
        const halfHeight = (lineCount * LINE_HEIGHT + PADDING_Y + photoExtraHeight) / 2;

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

        const activateAddPhoto = () => self.captureNodePhotoFromClipboard(targetDatum);
        const activateAddDrawing = () => self.openDrawingOverlay(null, targetDatum.data);

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
        deleteRowBtns.push({ label: '📷', activate: activateAddPhoto, fontSize: 18 });
        deleteRowBtns.push({ label: '🎨', activate: activateAddDrawing, fontSize: 18 });
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