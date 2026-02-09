// State
let currentSession = null;
let viewMode = false;
let lastTimeInsert = null;
let currentViewAssetName = "";
let eventSource = null;

// DOM Elements
const els = {
    sessionList: document.getElementById("session-list"),
    sessionTitle: document.getElementById("session-title"),
    sessionMeta: document.getElementById("session-meta"),
    chat: document.getElementById("chat"),
    chatPane: document.getElementById("chat-pane"),
    viewPane: document.getElementById("view-pane"),
    viewContent: document.getElementById("view-content"),
    assetsList: document.getElementById("assets-list"),
    outputList: document.getElementById("output-list"),
    assetUpload: document.getElementById("asset-upload"),
    deleteAssetsBtn: document.getElementById("delete-assets"),
    addAssetBtn: document.getElementById("add-asset"),
    sendBtn: document.getElementById("send"),
    sendViewBtn: document.getElementById("send-view"),
    messageInput: document.getElementById("message"),
    messageViewInput: document.getElementById("message-view"),
    modelSelect: document.getElementById("model-select"),
    newSessionBtn: document.getElementById("new-session"),
    toggleOptions: document.querySelectorAll(".toggle-option")
};

// Utilities
function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

function updateIcons() {
    if (window.lucide) window.lucide.createIcons();
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTimestamp(seconds) {
    const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, "0");
    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
    }
    return `${pad(minutes)}:${pad(secs)}`;
}

function insertTimecode(input, timeText) {
    if (!input) return;
    const now = Date.now();
    const value = input.value || "";
    const selectionStart = input.selectionStart ?? value.length;
    const selectionEnd = input.selectionEnd ?? value.length;
    const label = currentViewAssetName ? `[${currentViewAssetName} ${timeText}]` : `[${timeText}]`;

    if (lastTimeInsert && lastTimeInsert.input === input && (now - lastTimeInsert.timestamp) <= 4000) {
        const startIndex = lastTimeInsert.index;
        const endIndex = startIndex + lastTimeInsert.timeText.length;
        if (value.slice(startIndex, endIndex) === lastTimeInsert.timeText) {
            const sameFile = (lastTimeInsert.fileName || "") === (currentViewAssetName || "");
            const rangeText = sameFile && currentViewAssetName
                ? `[${currentViewAssetName} (${lastTimeInsert.rawTimeText} - ${timeText})]`
                : sameFile
                    ? `[(${lastTimeInsert.rawTimeText} - ${timeText})]`
                    : currentViewAssetName
                        ? `[${currentViewAssetName} ${timeText}]`
                        : `[${timeText}]`;
            input.value = value.slice(0, startIndex) + rangeText + value.slice(endIndex);
            const cursorPos = startIndex + rangeText.length;
            input.selectionStart = cursorPos;
            input.selectionEnd = cursorPos;
            lastTimeInsert = null;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return;
        }
    }

    const needsPrefixSpace = selectionStart > 0 && !/\s/.test(value[selectionStart - 1]);
    const needsSuffixSpace = selectionEnd < value.length && !/\s/.test(value[selectionEnd]);
    const prefix = needsPrefixSpace ? " " : "";
    const suffix = needsSuffixSpace ? " " : "";
    const insertText = `${prefix}${label}${suffix}`;

    input.value = value.slice(0, selectionStart) + insertText + value.slice(selectionEnd);
    const cursorPos = selectionStart + insertText.length;
    input.selectionStart = cursorPos;
    input.selectionEnd = cursorPos;

    lastTimeInsert = {
        input,
        timeText: label,
        rawTimeText: timeText,
        fileName: currentViewAssetName || "",
        index: selectionStart + prefix.length,
        timestamp: now
    };

    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleVideoTimecodeDblClick(videoEl) {
    const input = viewMode ? els.messageViewInput : els.messageInput;
    if (!input || !videoEl) return;
    const timeText = formatTimestamp(videoEl.currentTime);
    insertTimecode(input, timeText);
    input.focus();
}

function buildVideoControls(videoEl) {
    const controls = document.createElement('div');
    controls.className = 'video-controls';

    const left = document.createElement('div');
    left.className = 'controls-left';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'control-btn';
    const playIcon = document.createElement('i');
    playIcon.setAttribute('data-lucide', 'play');
    playBtn.appendChild(playIcon);

    const timeLabel = document.createElement('span');
    timeLabel.className = 'time-label';
    timeLabel.textContent = '00:00 / 00:00';

    left.appendChild(playBtn);
    left.appendChild(timeLabel);

    const center = document.createElement('div');
    center.className = 'controls-center';

    const rangeWrap = document.createElement('div');
    rangeWrap.className = 'timeline-wrap';
    rangeWrap.dataset.tooltip = 'Double click to insert timeline';

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'timeline-range';
    range.min = 0;
    range.max = 0;
    range.step = 0.01;
    range.value = 0;

    rangeWrap.appendChild(range);
    center.appendChild(rangeWrap);

    const right = document.createElement('div');
    right.className = 'controls-right';

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'control-btn';
    const muteIcon = document.createElement('i');
    muteIcon.setAttribute('data-lucide', 'volume-2');
    muteBtn.appendChild(muteIcon);

    const volume = document.createElement('input');
    volume.type = 'range';
    volume.className = 'volume-range';
    volume.min = 0;
    volume.max = 1;
    volume.step = 0.01;
    volume.value = videoEl.volume ?? 1;

    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.type = 'button';
    fullscreenBtn.className = 'control-btn';
    const fsIcon = document.createElement('i');
    fsIcon.setAttribute('data-lucide', 'fullscreen');
    fullscreenBtn.appendChild(fsIcon);

    right.appendChild(muteBtn);
    right.appendChild(volume);
    right.appendChild(fullscreenBtn);

    controls.appendChild(left);
    controls.appendChild(center);
    controls.appendChild(right);

    const updateTimeLabel = () => {
        const current = formatTimestamp(videoEl.currentTime);
        const total = Number.isFinite(videoEl.duration)
            ? formatTimestamp(videoEl.duration)
            : '00:00';
        timeLabel.textContent = `${current} / ${total}`;
    };

    const tooltip = document.createElement('div');
    tooltip.className = 'timeline-tooltip';
    tooltip.textContent = 'Double click to insert timeline';
    rangeWrap.appendChild(tooltip);

    const setButtonIcon = (btn, name) => {
        btn.innerHTML = '';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', name);
        btn.appendChild(icon);
        updateIcons();
    };

    const updatePlayIcon = () => {
        setButtonIcon(playBtn, videoEl.paused ? 'play' : 'pause');
    };

    const updateMuteIcon = () => {
        setButtonIcon(muteBtn, videoEl.muted ? 'volume-x' : 'volume-2');
    };

    const hasAudioTrack = () => {
        if (Array.isArray(videoEl.audioTracks)) {
            return videoEl.audioTracks.length > 0;
        }
        if (typeof videoEl.mozHasAudio === 'boolean') {
            return videoEl.mozHasAudio;
        }
        if (typeof videoEl.webkitAudioDecodedByteCount === 'number') {
            return videoEl.webkitAudioDecodedByteCount > 0;
        }
        return true;
    };

    const syncAudioControls = () => {
        const enabled = hasAudioTrack();
        muteBtn.disabled = !enabled;
        volume.disabled = !enabled;
        muteBtn.classList.toggle('disabled', !enabled);
        volume.classList.toggle('disabled', !enabled);
    };

    playBtn.addEventListener('click', () => {
        if (videoEl.paused) {
            videoEl.play().catch(() => {});
        } else {
            videoEl.pause();
        }
    });

    muteBtn.addEventListener('click', () => {
        if (muteBtn.disabled) return;
        videoEl.muted = !videoEl.muted;
        updateMuteIcon();
    });

    volume.addEventListener('input', () => {
        if (volume.disabled) return;
        videoEl.volume = Number(volume.value);
        if (videoEl.volume > 0 && videoEl.muted) {
            videoEl.muted = false;
            updateMuteIcon();
        }
    });

    fullscreenBtn.addEventListener('click', () => {
        const target = videoEl.closest('.view-video-container') || videoEl;
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else if (target.requestFullscreen) {
            target.requestFullscreen().catch(() => {});
        }
    });

    videoEl.addEventListener('loadedmetadata', () => {
        range.max = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
        updateTimeLabel();
        syncAudioControls();
    });

    videoEl.addEventListener('timeupdate', () => {
        if (!Number.isFinite(videoEl.duration)) return;
        range.value = videoEl.currentTime;
        const pct = (videoEl.currentTime / videoEl.duration) * 100;
        range.style.setProperty('--progress', `${pct}%`);
        updateTimeLabel();
    });

    videoEl.addEventListener('play', updatePlayIcon);
    videoEl.addEventListener('pause', updatePlayIcon);
    videoEl.addEventListener('volumechange', updateMuteIcon);

    range.addEventListener('input', () => {
        if (!Number.isFinite(videoEl.duration)) return;
        videoEl.currentTime = Number(range.value);
        const pct = (videoEl.currentTime / videoEl.duration) * 100;
        range.style.setProperty('--progress', `${pct}%`);
    });

    rangeWrap.addEventListener('mousemove', (e) => {
        const rect = rangeWrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        tooltip.style.left = `${Math.max(12, Math.min(rect.width - 12, x))}px`;
        tooltip.style.opacity = '1';
    });

    rangeWrap.addEventListener('mouseleave', () => {
        tooltip.style.opacity = '0';
    });

    range.addEventListener('dblclick', (e) => {
        if (!Number.isFinite(videoEl.duration)) return;
        const rect = range.getBoundingClientRect();
        const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const targetTime = pct * videoEl.duration;
        videoEl.currentTime = targetTime;
        range.style.setProperty('--progress', `${pct * 100}%`);
        handleVideoTimecodeDblClick(videoEl);
    });

    updatePlayIcon();
    updateMuteIcon();
    updateTimeLabel();
    syncAudioControls();
    updateIcons();
    return controls;
}

// UI Rendering
function renderMessage(role, text) {
    if (!els.chat) return;
    const div = createEl("div", `message ${role}`);
    
    if (role === 'ai') {
        // Render markdown for AI messages
        div.classList.add('markdown-body');
        try {
            div.innerHTML = marked.parse(text, {
                breaks: true,
                gfm: true,
                headerIds: false,
                mangle: false
            });
        } catch (e) {
            console.error('Markdown parse error:', e);
            div.innerText = text;
        }
    } else {
        // Plain text for user messages
        div.innerText = text;
    }
    
    els.chat.appendChild(div);
    els.chat.scrollTop = els.chat.scrollHeight;
}

function renderSessionItem(name, isActive) {
    const li = createEl("li", `session-item ${isActive ? 'active' : ''}`);
    
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "folder"); // Standard folder icon
    icon.style.width = "16px";
    
    const span = createEl("span", "", name);
    
    li.appendChild(icon);
    li.appendChild(span);
    
    li.onclick = () => selectSession(name);
    return li;
}

function renderAssetCard(asset) {
    const card = createEl("div", "asset-card");
    
    // Checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "asset-check";
    checkbox.value = asset.name;
    
    // Preview Logic
    const preview = createEl("div", "asset-preview");
    const fileName = asset.name.split('/').pop() || asset.name; // Get just filename
    const ext = fileName.split('.').pop().toLowerCase();
    
    // Can we show a real preview?
    const assetUrl = `/api/sessions/${currentSession}/assets/${encodeURIComponent(asset.name)}`;
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
        const img = document.createElement("img");
        img.src = assetUrl;
        img.loading = "lazy";
        preview.appendChild(img);
        
        // Double-click to view
        preview.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            currentViewAssetName = fileName;
            openInViewMode(assetUrl, 'image');
        });
    } else if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
        // Video thumbnail/preview
        console.log('Creating video preview for:', asset.name, 'URL:', assetUrl);
        const video = document.createElement("video");
        video.src = assetUrl + '#t=0.5'; // Load frame at 0.5s
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.controls = false;
        video.crossOrigin = "anonymous";
        
        // Ensure video loads and shows first frame
        video.addEventListener('loadeddata', () => {
            console.log('Video loaded successfully:', asset.name);
        });
        
        video.addEventListener('error', (e) => {
            console.error('Video load error for', asset.name, ':', e);
            // Fallback to icon on error
            preview.innerHTML = '';
            const icon = document.createElement("i");
            icon.setAttribute("data-lucide", "video");
            preview.appendChild(icon);
            updateIcons();
        });
        
        video.onmouseenter = () => {
            video.currentTime = 0;
            video.play().catch(e => console.warn("Video play blocked", e));
        };
        video.onmouseleave = () => {
            video.pause();
            video.currentTime = 0.5;
        };
        preview.appendChild(video);
        
        // Double-click to view
        preview.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            currentViewAssetName = fileName;
            openInViewMode(assetUrl, 'video');
        });
    } else {
        // Fallback Icon
        const icon = document.createElement("i");
        let iconName = "file";
        if (['mp3', 'wav', 'aac'].includes(ext)) iconName = "music";
        
        icon.setAttribute("data-lucide", iconName);
        preview.appendChild(icon);
    }
    
    // Info
    const info = createEl("div", "asset-info");
    
    // Show filename only (not full path) for cleaner display
    const nameSpan = createEl("span", "asset-name", fileName);
    nameSpan.title = asset.name; // Full path on hover
    
    // Add path indicator if in subdirectory
    if (asset.name.includes('/')) {
        const pathSpan = createEl("span", "asset-path", "public/assets/" + asset.name.substring(0, asset.name.lastIndexOf('/')));
        info.appendChild(pathSpan);
    }
    
    info.appendChild(nameSpan);
    info.appendChild(createEl("span", "asset-size", formatSize(asset.size)));
    
    card.appendChild(checkbox);
    card.appendChild(preview);
    card.appendChild(info);
    
    // Single click to toggle checkbox (not on preview)
    card.addEventListener('click', (e) => {
        if (e.target !== checkbox && !preview.contains(e.target)) {
            checkbox.checked = !checkbox.checked;
        }
    });
    
    return card;
}

function createUploadPlaceholder(file) {
    const card = createEl("div", "asset-card asset-loading");

    const preview = createEl("div", "asset-preview");
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "upload");
    preview.appendChild(icon);

    const info = createEl("div", "asset-info");
    const nameSpan = createEl("span", "asset-name", file.name || "Uploading...");
    const sizeSpan = createEl("span", "asset-size", formatSize(file.size || 0));
    info.appendChild(nameSpan);
    info.appendChild(sizeSpan);

    card.appendChild(preview);
    card.appendChild(info);
    return card;
}

function addUploadPlaceholders(files) {
    if (!els.assetsList) return [];
    const list = Array.from(files || []);
    if (list.length === 0) return [];

    if (!els.assetsList.querySelector(".asset-card")) {
        els.assetsList.innerHTML = "";
    }

    const placeholders = [];
    list.forEach((file) => {
        const card = createUploadPlaceholder(file);
        placeholders.push(card);
        els.assetsList.appendChild(card);
    });
    updateIcons();
    return placeholders;
}

// Logic
async function loadSessions() {
    console.log('loadSessions called');
    try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        console.log('Sessions data:', data);
        
        els.sessionList.innerHTML = "";
        
        if (data.sessions.length === 0) {
            console.log('No sessions found');
            const empty = createEl("div", "", "No projects yet");
            empty.style.color = "var(--text-muted)";
            empty.style.fontSize = "12px";
            empty.style.textAlign = "center";
            empty.style.padding = "20px";
            els.sessionList.appendChild(empty);
        } else {
            console.log('Rendering sessions:', data.sessions);
            data.sessions.forEach(session => {
                els.sessionList.appendChild(renderSessionItem(session, session === currentSession));
            });
        }
        
        updateIcons();
        
        // Auto-select first if none selected
        if (!currentSession && data.sessions.length > 0) {
            console.log('Auto-selecting first session:', data.sessions[0]);
            await selectSession(data.sessions[0]);
        }
    } catch (e) {
        console.error("Load sessions failed", e);
    }
}

async function selectSession(id) {
    currentSession = id;
    if(els.sessionTitle) els.sessionTitle.textContent = id;

    // Reset view when switching projects
    viewMode = false;
    currentViewAssetName = "";
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    
    els.chatPane.style.display = 'flex';
    els.viewPane.style.display = 'none';
    els.viewContent.innerHTML = `
        <div class="view-placeholder">
            <i data-lucide="image"></i>
            <p>Double-click any image or video to view</p>
        </div>
    `;
    updateIcons();
    
    // Update active class in sidebar
    Array.from(els.sessionList.children).forEach(li => {
        const span = li.querySelector("span");
        const text = span ? span.textContent : "";
        if (text === id) li.classList.add("active");
        else li.classList.remove("active");
    });
    
    await Promise.all([loadMessages(), loadAssets(), loadOutputs()]);
    startEventStream();
}

async function loadMessages() {
    if (!currentSession) return;
    const res = await fetch(`/api/sessions/${currentSession}/messages`);
    const data = await res.json();
    els.chat.innerHTML = "";
    data.messages.forEach(msg => {
        const role = (msg.role === 'human' || msg.role === 'user') ? 'user' : 'ai';
        renderMessage(role, msg.text);
    });
}

async function loadAssets() {
    if (!currentSession) return;
    const res = await fetch(`/api/sessions/${currentSession}/assets`);
    const data = await res.json();
    els.assetsList.innerHTML = "";
    
    if (data.assets.length === 0) {
        const empty = createEl("div", "", "No assets yet. Drag & drop files here.");
        empty.style.color = "var(--text-muted)";
        empty.style.fontSize = "12px";
        empty.style.textAlign = "center";
        empty.style.padding = "40px 20px";
        els.assetsList.appendChild(empty);
    } else {
        data.assets.forEach(asset => {
            els.assetsList.appendChild(renderAssetCard(asset));
        });
    }
    updateIcons();
    
    // Setup drag and drop
    setupDragAndDrop();
}

async function sendMessage() {
    if (!currentSession) return alert("Select a project first.");
    
    // Get the active input based on current mode
    const input = viewMode ? els.messageViewInput : els.messageInput;
    const text = input.value.trim();
    if (!text) return;
    
    input.value = "";
    input.style.height = "auto";
    
    renderMessage("user", text);
    
    // Collect data
    const form = new FormData();
    form.append("message", text);
    const selectedModel = (els.modelSelect && els.modelSelect.value) ? els.modelSelect.value : "flash";
    form.append("model", selectedModel);
    
    const selectedAssets = Array.from(document.querySelectorAll(".asset-check:checked")).map(cb => cb.value);
    if (selectedAssets.length > 0) {
        form.append("asset_names", JSON.stringify(selectedAssets));
    }
    
    // Loading indicator
    const loadingId = "loading-" + Date.now();
    const loadingDiv = createEl("div", "message ai", "Processing...");
    loadingDiv.id = loadingId;
    els.chat.appendChild(loadingDiv);
    els.chat.scrollTop = els.chat.scrollHeight;
    
    try {
        const res = await fetch(`/api/sessions/${currentSession}/message`, {
            method: "POST",
            body: form
        });
        
        const data = await res.json();
        
        // Replace loading
        const loader = document.getElementById(loadingId);
        if (loader) loader.remove();
        
        renderMessage("ai", data.reply || "Done.");
        loadAssets(); // Refresh assets as agent might have created output
        loadOutputs(); // Refresh outputs as agent might have rendered video
        
    } catch (e) {
        const loader = document.getElementById(loadingId);
        if (loader) loader.innerText = "Error: " + e.message;
    }
}

async function uploadAssets() {
    if (!currentSession) return alert("Select a project first.");
    const files = els.assetUpload.files;
    if (files.length === 0) return;

    const form = new FormData();
    Array.from(files).forEach(f => form.append("files", f));
    const placeholders = addUploadPlaceholders(files);
    
    try {
        // Use new upload endpoint
        const res = await fetch(`/api/sessions/${currentSession}/assets/upload`, {
            method: "POST",
            body: form
        });
        
        if (res.ok) {
            loadAssets();
        } else {
            placeholders.forEach(card => {
                card.classList.add("upload-failed");
                const size = card.querySelector(".asset-size");
                if (size) size.textContent = "Upload failed";
            });
            alert("Upload failed.");
        }
    } catch (e) {
        console.error(e);
        placeholders.forEach(card => {
            card.classList.add("upload-failed");
            const size = card.querySelector(".asset-size");
            if (size) size.textContent = "Upload failed";
        });
        alert("Upload error: " + e.message);
    } finally {
        els.assetUpload.value = ""; // Reset
    }
}

async function uploadFiles(files) {
    if (!currentSession) return alert("Select a project first.");
    if (!files || files.length === 0) return;

    const form = new FormData();
    Array.from(files).forEach(f => form.append("files", f));
    const placeholders = addUploadPlaceholders(files);
    
    try {
        const res = await fetch(`/api/sessions/${currentSession}/assets/upload`, {
            method: "POST",
            body: form
        });
        
        if (res.ok) {
            loadAssets();
        } else {
            placeholders.forEach(card => {
                card.classList.add("upload-failed");
                const size = card.querySelector(".asset-size");
                if (size) size.textContent = "Upload failed";
            });
            alert("Upload failed.");
        }
    } catch (e) {
        console.error(e);
        placeholders.forEach(card => {
            card.classList.add("upload-failed");
            const size = card.querySelector(".asset-size");
            if (size) size.textContent = "Upload failed";
        });
        alert("Upload error: " + e.message);
    }
}

function setupDragAndDrop() {
    const assetsList = els.assetsList;
    
    if (!assetsList) return;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        assetsList.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Visual feedback when dragging over
    ['dragenter', 'dragover'].forEach(eventName => {
        assetsList.addEventListener(eventName, () => {
            assetsList.classList.add('drag-over');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        assetsList.addEventListener(eventName, () => {
            assetsList.classList.remove('drag-over');
        }, false);
    });
    
    // Handle dropped files
    assetsList.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        uploadFiles(files);
    }, false);
}

async function loadOutputs() {
    if (!currentSession) return;
    try {
        const res = await fetch(`/api/sessions/${currentSession}/outputs`);
        const data = await res.json();
        
        els.outputList.innerHTML = "";
        
        if (data.outputs.length === 0) {
            const empty = createEl("div", "", "No output files yet.");
            empty.style.color = "var(--text-muted)";
            empty.style.fontSize = "12px";
            empty.style.textAlign = "center";
            empty.style.padding = "20px";
            els.outputList.appendChild(empty);
        } else {
            data.outputs.forEach(output => {
                els.outputList.appendChild(renderOutputItem(output));
            });
        }
        updateIcons();
    } catch (e) {
        console.error("Load outputs failed", e);
    }
}

function startEventStream() {
    if (!currentSession) return;
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/sessions/${currentSession}/events`);
    eventSource.addEventListener('view', (evt) => {
        try {
            const payload = JSON.parse(evt.data || "{}");
            const view = payload.data || {};
            const path = view.path || "";
            const ext = path.split('.').pop().toLowerCase();
            const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
            if (!isVideo && !isImage) return;

            const url = view.kind === 'output'
                ? `/api/sessions/${currentSession}/outputs/${encodeURIComponent(path)}?t=${Date.now()}`
                : `/api/sessions/${currentSession}/assets/${encodeURIComponent(path)}?t=${Date.now()}`;

            currentViewAssetName = path.split('/').pop() || path;
            const delayMs = isVideo ? 1000 : 0;
            openInViewMode(url, isVideo ? 'video' : 'image', view.timestamp, delayMs);
        } catch (e) {
            console.warn('Event parse failed', e);
        }
    });
}
function renderOutputItem(output) {
    const item = createEl("div", "output-item");
    
    const icon = document.createElement("i");
    const ext = output.name.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'webm', 'mov', 'avi'].includes(ext);
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    
    if (isVideo) {
        icon.setAttribute("data-lucide", "video");
    } else if (['mp3', 'wav', 'aac'].includes(ext)) {
        icon.setAttribute("data-lucide", "music");
    } else {
        icon.setAttribute("data-lucide", "file");
    }
    
    const info = createEl("div", "output-item-info");
    const name = createEl("div", "output-item-name", output.name);
    const size = createEl("div", "output-item-size", formatSize(output.size));
    info.appendChild(name);
    info.appendChild(size);
    
    item.appendChild(icon);
    item.appendChild(info);
    
    // Double-click to view in view mode
    item.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const timestamp = Date.now();
        const url = `/api/sessions/${currentSession}/outputs/${encodeURIComponent(output.name)}?t=${timestamp}`;
        if (isVideo || isImage) {
            currentViewAssetName = output.name;
            openInViewMode(url, isVideo ? 'video' : 'image');
        } else {
            window.open(url, '_blank');
        }
    });
    
    return item;
}

function openInViewMode(url, type) {
    const startTime = arguments.length > 2 ? arguments[2] : null;
    const delayMs = arguments.length > 3 ? arguments[3] : 0;
    // Switch to view mode
    viewMode = true;
    els.chatPane.style.display = 'none';
    els.viewPane.style.display = 'flex';
    
    // Update slider
    els.toggleOptions.forEach(opt => {
        if (opt.dataset.mode === 'view') {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
    
    // Clear and add media
    els.viewContent.innerHTML = '';
    
    if (type === 'image') {
        const wrap = document.createElement('div');
        wrap.className = 'view-media-wrap';
        const img = document.createElement('img');
        img.src = url;
        img.className = 'view-media image';
        wrap.appendChild(img);
        els.viewContent.appendChild(wrap);
    } else if (type === 'video') {
        const container = document.createElement('div');
        container.className = 'view-video-container';

        const wrap = document.createElement('div');
        wrap.className = 'view-media-wrap';

        const video = document.createElement('video');
        video.src = url;
        video.className = 'view-media video';
        video.controls = false;
        video.autoplay = false;
        if (startTime !== null && !Number.isNaN(Number(startTime))) {
            const seekTo = Number(startTime);
            video.addEventListener('loadedmetadata', () => {
                const target = Math.max(0, Math.min(video.duration || seekTo, seekTo));
                video.currentTime = target;
            });
        }
        const startPlayback = () => {
            if (video.paused) {
                video.play().catch(() => {});
            }
        };
        video.addEventListener('loadedmetadata', () => {
            if (delayMs > 0) {
                setTimeout(startPlayback, delayMs);
            } else {
                startPlayback();
            }
        });
        wrap.appendChild(video);
        container.appendChild(wrap);
        container.appendChild(buildVideoControls(video));
        els.viewContent.appendChild(container);
    }
}

async function deleteAssets() {
    if (!currentSession) return;
    const selected = Array.from(document.querySelectorAll(".asset-check:checked")).map(cb => cb.value);
    
    if (selected.length === 0) return alert("Select assets to remove.");
    if (!confirm(`Delete ${selected.length} assets?`)) return;
    
    const form = new FormData();
    selected.forEach(name => form.append("asset_names", name));
    
    try {
        const res = await fetch(`/api/sessions/${currentSession}/assets/delete`, {
            method: "POST",
            body: form
        });
        
        if (res.ok) {
            loadAssets();
        } else {
            alert("Delete failed.");
        }
    } catch (e) {
        console.error(e);
        alert("Delete error: " + e.message);
    }
}

// Event Listeners
if(els.newSessionBtn) {
    els.newSessionBtn.onclick = async () => {
        const name = prompt("Project Name:");
        if (name) {
            const form = new FormData();
            form.append("name", name);
            const res = await fetch("/api/sessions", { method: "POST", body: form });
            const data = await res.json();
            await loadSessions();
            selectSession(data.session);
        }
    };
}

if(els.deleteAssetsBtn) els.deleteAssetsBtn.onclick = deleteAssets;
if(els.sendBtn) els.sendBtn.onclick = sendMessage;
if(els.sendViewBtn) els.sendViewBtn.onclick = sendMessage;

// Setup toggle slider
els.toggleOptions.forEach(option => {
    option.addEventListener('click', () => {
        const mode = option.dataset.mode;
        
        // Update active state
        els.toggleOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        
        // Switch mode
        if (mode === 'view') {
            viewMode = true;
            els.chatPane.style.display = 'none';
            els.viewPane.style.display = 'flex';
        } else {
            viewMode = false;
            els.chatPane.style.display = 'flex';
            els.viewPane.style.display = 'none';
        }
    });
});

if(els.assetUpload) {
    els.assetUpload.onchange = uploadAssets;
}

if(els.messageInput) {
    els.messageInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
    
    // Auto-expand textarea
    els.messageInput.oninput = function() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
    };
}

if(els.messageViewInput) {
    els.messageViewInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
    
    // Auto-expand textarea
    els.messageViewInput.oninput = function() {
        this.style.height = "auto";
        this.style.height = (this.scrollHeight) + "px";
    };
}

document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    if (!viewMode) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
        return;
    }
    const video = els.viewContent ? els.viewContent.querySelector('video') : null;
    if (!video) return;
    e.preventDefault();
    if (video.paused) {
        video.play().catch(() => {});
    } else {
        video.pause();
    }
});

// Init - Load sessions when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadSessions();
    startEventStream();
});




