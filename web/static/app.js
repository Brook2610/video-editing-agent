// State
let currentSession = null;
let viewMode = false;
let lastTimeInsert = null;
let currentViewAssetName = "";
let eventSource = null;
let pendingDeleteSession = null;
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'];

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
    toggleOptions: document.querySelectorAll(".toggle-option"),
    projectModal: document.getElementById("project-modal"),
    projectForm: document.getElementById("project-form"),
    projectNameInput: document.getElementById("project-name-input"),
    projectModalClose: document.getElementById("project-modal-close"),
    projectCancelBtn: document.getElementById("project-cancel"),
    projectCreateBtn: document.getElementById("project-create"),
    deleteProjectModal: document.getElementById("delete-project-modal"),
    deleteProjectName: document.getElementById("delete-project-name"),
    deleteProjectClose: document.getElementById("delete-project-close"),
    deleteProjectCancel: document.getElementById("delete-project-cancel"),
    deleteProjectConfirm: document.getElementById("delete-project-confirm")
};

// Utilities
function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
}

function updateIcons() {
    // Phosphor icons are auto-rendered via CSS classes, no init needed
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

function parseTimestampValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = String(value).trim();
    if (!text) return null;
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
    if (/^\d{1,2}:\d{2}$/.test(text)) {
        const [mm, ss] = text.split(':').map(Number);
        return (mm * 60) + ss;
    }
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(text)) {
        const [hh, mm, ss] = text.split(':').map(Number);
        return (hh * 3600) + (mm * 60) + ss;
    }
    return null;
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

function insertImageFilename(input) {
    if (!input || !currentViewAssetName) return;
    const value = input.value || "";
    const selectionStart = input.selectionStart ?? value.length;
    const selectionEnd = input.selectionEnd ?? value.length;
    const label = `[${currentViewAssetName}]`;
    const needsPrefixSpace = selectionStart > 0 && !/\s/.test(value[selectionStart - 1]);
    const needsSuffixSpace = selectionEnd < value.length && !/\s/.test(value[selectionEnd]);
    const prefix = needsPrefixSpace ? " " : "";
    const suffix = needsSuffixSpace ? " " : "";
    const insertText = `${prefix}${label}${suffix}`;

    input.value = value.slice(0, selectionStart) + insertText + value.slice(selectionEnd);
    const cursorPos = selectionStart + insertText.length;
    input.selectionStart = cursorPos;
    input.selectionEnd = cursorPos;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

function handleVideoTimecodeDblClick(videoEl) {
    const input = getActiveInput();
    if (!input || !videoEl) return;
    const timeText = formatTimestamp(videoEl.currentTime);
    insertTimecode(input, timeText);
    input.focus();
}

function handleAudioTimecodeDblClick(audioEl) {
    const input = getActiveInput();
    if (!input || !audioEl) return;
    const timeText = formatTimestamp(audioEl.currentTime);
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
    playIcon.className = 'ph ph-play';
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
    muteIcon.className = 'ph ph-speaker-high';
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
    fsIcon.className = 'ph ph-corners-out';
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
        icon.className = `ph ph-${name}`;
        btn.appendChild(icon);
    };

    const updatePlayIcon = () => {
        setButtonIcon(playBtn, videoEl.paused ? 'play' : 'pause');
    };

    const updateMuteIcon = () => {
        setButtonIcon(muteBtn, videoEl.muted ? 'speaker-x' : 'speaker-high');
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

function buildAudioControls(audioEl) {
    const controls = document.createElement('div');
    controls.className = 'video-controls';

    const left = document.createElement('div');
    left.className = 'controls-left';
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'control-btn';
    const playIcon = document.createElement('i');
    playIcon.className = 'ph ph-play';
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
    muteIcon.className = 'ph ph-speaker-high';
    muteBtn.appendChild(muteIcon);
    const volume = document.createElement('input');
    volume.type = 'range';
    volume.className = 'volume-range';
    volume.min = 0;
    volume.max = 1;
    volume.step = 0.01;
    volume.value = audioEl.volume ?? 1;
    right.appendChild(muteBtn);
    right.appendChild(volume);

    controls.appendChild(left);
    controls.appendChild(center);
    controls.appendChild(right);

    const tooltip = document.createElement('div');
    tooltip.className = 'timeline-tooltip';
    tooltip.textContent = 'Double click to insert timeline';
    rangeWrap.appendChild(tooltip);

    const setButtonIcon = (btn, name) => {
        btn.innerHTML = '';
        const icon = document.createElement('i');
        icon.className = `ph ph-${name}`;
        btn.appendChild(icon);
    };
    const updatePlayIcon = () => setButtonIcon(playBtn, audioEl.paused ? 'play' : 'pause');
    const updateMuteIcon = () => setButtonIcon(muteBtn, audioEl.muted ? 'speaker-x' : 'speaker-high');
    const updateTimeLabel = () => {
        const current = formatTimestamp(audioEl.currentTime);
        const total = Number.isFinite(audioEl.duration) ? formatTimestamp(audioEl.duration) : '00:00';
        timeLabel.textContent = `${current} / ${total}`;
    };

    playBtn.addEventListener('click', () => {
        if (audioEl.paused) audioEl.play().catch(() => {});
        else audioEl.pause();
    });
    muteBtn.addEventListener('click', () => {
        audioEl.muted = !audioEl.muted;
        updateMuteIcon();
    });
    volume.addEventListener('input', () => {
        audioEl.volume = Number(volume.value);
        if (audioEl.volume > 0 && audioEl.muted) {
            audioEl.muted = false;
            updateMuteIcon();
        }
    });
    audioEl.addEventListener('loadedmetadata', () => {
        range.max = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
        updateTimeLabel();
    });
    audioEl.addEventListener('timeupdate', () => {
        if (!Number.isFinite(audioEl.duration)) return;
        range.value = audioEl.currentTime;
        const pct = (audioEl.currentTime / audioEl.duration) * 100;
        range.style.setProperty('--progress', `${pct}%`);
        updateTimeLabel();
    });
    audioEl.addEventListener('play', updatePlayIcon);
    audioEl.addEventListener('pause', updatePlayIcon);
    audioEl.addEventListener('volumechange', updateMuteIcon);
    range.addEventListener('input', () => {
        if (!Number.isFinite(audioEl.duration)) return;
        audioEl.currentTime = Number(range.value);
        const pct = (audioEl.currentTime / audioEl.duration) * 100;
        range.style.setProperty('--progress', `${pct}%`);
    });
    range.addEventListener('dblclick', (e) => {
        if (!Number.isFinite(audioEl.duration)) return;
        const rect = range.getBoundingClientRect();
        const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        audioEl.currentTime = pct * audioEl.duration;
        range.style.setProperty('--progress', `${pct * 100}%`);
        handleAudioTimecodeDblClick(audioEl);
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

    updatePlayIcon();
    updateMuteIcon();
    updateTimeLabel();
    updateIcons();
    return controls;
}

async function readAudioArtwork(url) {
    if (!window.jsmediatags) return null;
    return new Promise((resolve) => {
        try {
            new window.jsmediatags.Reader(url).setTagsToRead(["picture"]).read({
                onSuccess: (tag) => {
                    const picture = tag?.tags?.picture;
                    if (!picture?.data || !picture?.format) {
                        resolve(null);
                        return;
                    }
                    let base64 = "";
                    for (let i = 0; i < picture.data.length; i += 1) {
                        base64 += String.fromCharCode(picture.data[i]);
                    }
                    resolve(`data:${picture.format};base64,${window.btoa(base64)}`);
                },
                onError: () => resolve(null),
            });
        } catch (_) {
            resolve(null);
        }
    });
}

// UI Rendering
function renderMessage(role, text) {
    if (!els.chat) return;
    const div = createEl("div", `message ${role}`);
    
    if (role === 'ai') {
        const content = document.createElement("div");
        content.className = "ai-content markdown-body";
        try {
            content.innerHTML = marked.parse(text, {
                breaks: true,
                gfm: true,
                headerIds: false,
                mangle: false
            });
        } catch (e) {
            console.error('Markdown parse error:', e);
            content.innerText = text;
        }
        const iconWrap = document.createElement("span");
        iconWrap.className = "ai-icon";
        iconWrap.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="6" width="18" height="12" rx="2"></rect>
              <path d="M7 6l2-2h2l-2 2H7zm6 0l2-2h2l-2 2h-2zm-6 12l2 2h2l-2-2H7zm6 0l2 2h2l-2-2h-2z"></path>
              <circle cx="9" cy="12" r="1.3"></circle>
              <circle cx="15" cy="12" r="1.3"></circle>
            </svg>
        `;
        div.appendChild(iconWrap);
        div.appendChild(content);
        updateIcons();
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
    icon.className = "ph ph-folder-simple";
    icon.style.fontSize = "16px";
    
    const span = createEl("span", "", name);
    const deleteBtn = createEl("button", "session-delete-btn");
    deleteBtn.type = "button";
    deleteBtn.title = "Delete project";
    deleteBtn.setAttribute("aria-label", `Delete project ${name}`);
    deleteBtn.innerHTML = '<i class="ph ph-trash"></i>';
    deleteBtn.onclick = (event) => {
        event.stopPropagation();
        openDeleteProjectModal(name);
    };
    
    li.appendChild(icon);
    li.appendChild(span);
    li.appendChild(deleteBtn);
    
    li.onclick = () => selectSession(name);
    return li;
}

function getActiveInput() {
    return viewMode ? els.messageViewInput : els.messageInput;
}

function switchToChatMode() {
    viewMode = false;
    els.chatPane.style.display = 'flex';
    els.viewPane.style.display = 'none';
    els.toggleOptions.forEach(opt => {
        if (opt.dataset.mode === 'chat') opt.classList.add('active');
        else opt.classList.remove('active');
    });
}

function switchToViewMode() {
    viewMode = true;
    els.chatPane.style.display = 'none';
    els.viewPane.style.display = 'flex';
    els.toggleOptions.forEach(opt => {
        if (opt.dataset.mode === 'view') opt.classList.add('active');
        else opt.classList.remove('active');
    });
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
    
    if (IMAGE_EXTENSIONS.includes(ext)) {
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
    } else if (VIDEO_EXTENSIONS.includes(ext)) {
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
            icon.className = "ph ph-video-camera";
            preview.appendChild(icon);
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
    } else if (AUDIO_EXTENSIONS.includes(ext)) {
        const icon = document.createElement("i");
        icon.className = "ph ph-waveform";
        preview.appendChild(icon);
        preview.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            currentViewAssetName = fileName;
            openInViewMode(assetUrl, 'audio');
        });
    } else {
        // Fallback Icon
        const icon = document.createElement("i");
        let iconClass = "ph ph-file";
        if (AUDIO_EXTENSIONS.includes(ext)) iconClass = "ph ph-music-note";
        
        icon.className = iconClass;
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
    icon.className = "ph ph-cloud-arrow-up";
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

        if (currentSession && !data.sessions.includes(currentSession)) {
            currentSession = null;
            resetWorkspace();
        }
        
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
            <i class="ph ph-image" style="font-size:48px;"></i>
            <p>Double-click any image, video, or audio file to view</p>
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
        const empty = createEl("div", "assets-empty", "Add files or drag and drop files here.");
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
    const fromViewMode = viewMode;
    const input = getActiveInput();
    const text = input.value.trim();
    if (!text) return;
    
    input.value = "";
    input.style.height = "auto";

    if (fromViewMode) {
        switchToChatMode();
    }
    
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
            const isVideo = VIDEO_EXTENSIONS.includes(ext);
            const isImage = IMAGE_EXTENSIONS.includes(ext);
            const isAudio = AUDIO_EXTENSIONS.includes(ext);
            if (!isVideo && !isImage && !isAudio) return;

            const url = view.kind === 'output'
                ? `/api/sessions/${currentSession}/outputs/${encodeURIComponent(path)}?t=${Date.now()}`
                : `/api/sessions/${currentSession}/assets/${encodeURIComponent(path)}?t=${Date.now()}`;

            currentViewAssetName = path.split('/').pop() || path;
            const delayMs = isVideo ? 1000 : 0;
            openInViewMode(url, isVideo ? 'video' : (isAudio ? 'audio' : 'image'), view.timestamp, delayMs);
        } catch (e) {
            console.warn('Event parse failed', e);
        }
    });
}
function renderOutputItem(output) {
    const item = createEl("div", "output-item");
    
    const icon = document.createElement("i");
    const ext = output.name.split('.').pop().toLowerCase();
    const isVideo = VIDEO_EXTENSIONS.includes(ext);
    const isImage = IMAGE_EXTENSIONS.includes(ext);
    const isAudio = AUDIO_EXTENSIONS.includes(ext);
    
    if (isVideo) {
        icon.className = "ph ph-video-camera";
    } else if (isAudio) {
        icon.className = "ph ph-music-note";
    } else {
        icon.className = "ph ph-file";
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
        if (isVideo || isImage || isAudio) {
            currentViewAssetName = output.name;
            openInViewMode(url, isVideo ? 'video' : (isAudio ? 'audio' : 'image'));
        } else {
            window.open(url, '_blank');
        }
    });
    
    return item;
}

function openInViewMode(url, type) {
    const startTimeRaw = arguments.length > 2 ? arguments[2] : null;
    const startTime = parseTimestampValue(startTimeRaw);
    const delayMs = arguments.length > 3 ? arguments[3] : 0;
    // Switch to view mode
    switchToViewMode();
    
    // Clear and add media
    els.viewContent.innerHTML = '';
    
    if (type === 'image') {
        const wrap = document.createElement('div');
        wrap.className = 'view-media-wrap';
        const img = document.createElement('img');
        img.src = url;
        img.className = 'view-media image';
        img.title = 'Double-click to insert image filename into prompt';
        img.addEventListener('dblclick', () => {
            const input = getActiveInput();
            insertImageFilename(input);
            input?.focus();
        });
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
        if (startTime !== null) {
            const seekTo = startTime;
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
    } else if (type === 'audio') {
        const container = document.createElement('div');
        container.className = 'view-video-container';

        const wrap = document.createElement('div');
        wrap.className = 'view-media-wrap';

        const audioPanel = document.createElement('div');
        audioPanel.className = 'view-audio-panel';
        const artwork = document.createElement('img');
        artwork.className = 'view-audio-art';
        artwork.alt = 'Album artwork';
        artwork.style.display = 'none';

        const fallback = document.createElement('div');
        fallback.className = 'view-audio-fallback';
        fallback.innerHTML = '<i class="ph ph-waveform"></i>';

        const title = document.createElement('div');
        title.className = 'view-audio-title';
        title.textContent = currentViewAssetName || 'Audio';

        audioPanel.appendChild(artwork);
        audioPanel.appendChild(fallback);
        audioPanel.appendChild(title);
        wrap.appendChild(audioPanel);

        const audio = document.createElement('audio');
        audio.src = url;
        audio.preload = 'metadata';
        audio.controls = false;
        audio.autoplay = true;
        audio.style.display = 'none';
        if (startTime !== null) {
            const seekTo = startTime;
            audio.addEventListener('loadedmetadata', () => {
                const target = Math.max(0, Math.min(audio.duration || seekTo, seekTo));
                audio.currentTime = target;
            });
        }
        audio.play().catch(() => {});

        readAudioArtwork(url).then((imageData) => {
            if (!imageData) return;
            artwork.src = imageData;
            artwork.style.display = 'block';
            fallback.style.display = 'none';
        });

        container.appendChild(wrap);
        container.appendChild(buildAudioControls(audio));
        container.appendChild(audio);
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

function resetWorkspace() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    if (els.sessionTitle) els.sessionTitle.textContent = "Select a Project";
    if (els.chat) els.chat.innerHTML = "";
    if (els.assetsList) {
        els.assetsList.innerHTML = `<div class="assets-empty">Add files or drag and drop files here.</div>`;
    }
    if (els.outputList) els.outputList.innerHTML = "";
    if (els.viewContent) {
        els.viewContent.innerHTML = `
            <div class="view-placeholder">
                <i class="ph ph-image" style="font-size:48px;"></i>
                <p>Double-click any image, video, or audio file to view</p>
            </div>
        `;
    }
    viewMode = false;
    currentViewAssetName = "";
    if (els.chatPane) els.chatPane.style.display = "flex";
    if (els.viewPane) els.viewPane.style.display = "none";
    els.toggleOptions.forEach(opt => {
        if (opt.dataset.mode === "chat") opt.classList.add("active");
        else opt.classList.remove("active");
    });
    updateIcons();
}

function openProjectModal() {
    if (!els.projectModal) return;
    els.projectModal.classList.add("open");
    els.projectModal.setAttribute("aria-hidden", "false");
    if (els.projectNameInput) {
        els.projectNameInput.value = "";
        els.projectNameInput.focus();
    }
}

function closeProjectModal() {
    if (!els.projectModal) return;
    els.projectModal.classList.remove("open");
    els.projectModal.setAttribute("aria-hidden", "true");
}

function openDeleteProjectModal(sessionId) {
    const targetSession = (sessionId || currentSession || "").trim();
    if (!els.deleteProjectModal || !targetSession) return;
    pendingDeleteSession = targetSession;
    if (els.deleteProjectName) {
        els.deleteProjectName.textContent = targetSession;
    }
    els.deleteProjectModal.classList.add("open");
    els.deleteProjectModal.setAttribute("aria-hidden", "false");
}

function closeDeleteProjectModal() {
    if (!els.deleteProjectModal) return;
    els.deleteProjectModal.classList.remove("open");
    els.deleteProjectModal.setAttribute("aria-hidden", "true");
    pendingDeleteSession = null;
}

async function submitProjectCreate(event) {
    event.preventDefault();
    const name = (els.projectNameInput?.value || "").trim();
    if (!name) return;

    if (els.projectCreateBtn) {
        els.projectCreateBtn.disabled = true;
        els.projectCreateBtn.textContent = "Creating...";
    }

    try {
        const form = new FormData();
        form.append("name", name);
        const res = await fetch("/api/sessions", { method: "POST", body: form });
        if (!res.ok) {
            throw new Error("Failed to create project");
        }
        const data = await res.json();
        closeProjectModal();
        await loadSessions();
        await selectSession(data.session);
    } catch (err) {
        console.error("Create project failed", err);
    } finally {
        if (els.projectCreateBtn) {
            els.projectCreateBtn.disabled = false;
            els.projectCreateBtn.textContent = "Create";
        }
    }
}

async function confirmDeleteProject() {
    const targetSession = (pendingDeleteSession || currentSession || "").trim();
    if (!targetSession) return;
    if (els.deleteProjectConfirm) {
        els.deleteProjectConfirm.disabled = true;
        els.deleteProjectConfirm.textContent = "Deleting...";
    }
    try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(targetSession)}`, {
            method: "DELETE"
        });
        if (!res.ok) {
            throw new Error("Failed to delete project");
        }
        closeDeleteProjectModal();
        if (currentSession === targetSession) {
            currentSession = null;
            resetWorkspace();
        }
        await loadSessions();
    } catch (err) {
        console.error("Delete project failed", err);
    } finally {
        if (els.deleteProjectConfirm) {
            els.deleteProjectConfirm.disabled = false;
            els.deleteProjectConfirm.textContent = "Delete";
        }
    }
}

// Event Listeners
if(els.newSessionBtn) {
    els.newSessionBtn.onclick = openProjectModal;
}
if(els.deleteAssetsBtn) els.deleteAssetsBtn.onclick = deleteAssets;
if(els.sendBtn) els.sendBtn.onclick = sendMessage;
if(els.sendViewBtn) els.sendViewBtn.onclick = sendMessage;
if(els.projectForm) els.projectForm.addEventListener("submit", submitProjectCreate);
if(els.projectModalClose) els.projectModalClose.onclick = closeProjectModal;
if(els.projectCancelBtn) els.projectCancelBtn.onclick = closeProjectModal;
if(els.deleteProjectClose) els.deleteProjectClose.onclick = closeDeleteProjectModal;
if(els.deleteProjectCancel) els.deleteProjectCancel.onclick = closeDeleteProjectModal;
if(els.deleteProjectConfirm) els.deleteProjectConfirm.onclick = confirmDeleteProject;
if(els.projectModal) {
    els.projectModal.addEventListener("click", (event) => {
        if (event.target === els.projectModal) {
            closeProjectModal();
        }
    });
}
if(els.deleteProjectModal) {
    els.deleteProjectModal.addEventListener("click", (event) => {
        if (event.target === els.deleteProjectModal) {
            closeDeleteProjectModal();
        }
    });
}

// Setup toggle slider
els.toggleOptions.forEach(option => {
    option.addEventListener('click', () => {
        const mode = option.dataset.mode;
        
        // Update active state
        els.toggleOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        
        // Switch mode
        if (mode === 'view') {
            switchToViewMode();
        } else {
            switchToChatMode();
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
    if (e.key === "Escape" && els.projectModal?.classList.contains("open")) {
        closeProjectModal();
        return;
    }
    if (e.key === "Escape" && els.deleteProjectModal?.classList.contains("open")) {
        closeDeleteProjectModal();
        return;
    }
    if (e.code !== 'Space') return;
    if (!viewMode) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
        return;
    }
    const media = els.viewContent ? els.viewContent.querySelector('video, audio') : null;
    if (!media) return;
    e.preventDefault();
    if (media.paused) {
        media.play().catch(() => {});
    } else {
        media.pause();
    }
});

// Init - Load sessions when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadSessions();
    startEventStream();
});




