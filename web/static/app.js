// State
let currentSession = null;

// DOM Elements
const els = {
    sessionList: document.getElementById("session-list"),
    sessionTitle: document.getElementById("session-title"),
    sessionMeta: document.getElementById("session-meta"),
    chat: document.getElementById("chat"),
    assetsList: document.getElementById("assets-list"),
    outputList: document.getElementById("output-list"),
    assetUpload: document.getElementById("asset-upload"),
    deleteAssetsBtn: document.getElementById("delete-assets"),
    addAssetBtn: document.getElementById("add-asset"),
    sendBtn: document.getElementById("send"),
    messageInput: document.getElementById("message"),
    newSessionBtn: document.getElementById("new-session")
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
    
    // Toggle check on card click
    card.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
        }
    });
    
    return card;
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
    
    // Update active class in sidebar
    Array.from(els.sessionList.children).forEach(li => {
        const span = li.querySelector("span");
        const text = span ? span.textContent : "";
        if (text === id) li.classList.add("active");
        else li.classList.remove("active");
    });
    
    await Promise.all([loadMessages(), loadAssets(), loadOutputs()]);
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
    
    const text = els.messageInput.value.trim();
    if (!text) return;
    
    els.messageInput.value = "";
    els.messageInput.style.height = "auto";
    
    renderMessage("user", text);
    
    // Collect data
    const form = new FormData();
    form.append("message", text);
    
    // Note: Assets are now managed separately via Add/Remove buttons,
    // so we don't strictly need to attach them here unless the agent needs context.
    // However, the agent *does* need to know which assets to use.
    // The previous design attached selected assets. Let's keep that but rely on what's in the folder?
    // Or allow specific selection for the prompt.
    // For now, let's assume all assets in the folder are available to the agent,
    // or pass the selected ones if any are checked.
    
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
    
    try {
        // Use new upload endpoint
        const res = await fetch(`/api/sessions/${currentSession}/assets/upload`, {
            method: "POST",
            body: form
        });
        
        if (res.ok) {
            loadAssets();
        } else {
            alert("Upload failed.");
        }
    } catch (e) {
        console.error(e);
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
    
    try {
        const res = await fetch(`/api/sessions/${currentSession}/assets/upload`, {
            method: "POST",
            body: form
        });
        
        if (res.ok) {
            loadAssets();
        } else {
            alert("Upload failed.");
        }
    } catch (e) {
        console.error(e);
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

function renderOutputItem(output) {
    const item = createEl("div", "output-item");
    
    const icon = document.createElement("i");
    const ext = output.name.split('.').pop().toLowerCase();
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) {
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
    
    // Click to download/view with cache busting
    item.onclick = () => {
        const timestamp = Date.now();
        const url = `/api/sessions/${currentSession}/outputs/${encodeURIComponent(output.name)}?t=${timestamp}`;
        window.open(url, '_blank');
    };
    
    return item;
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

// Init - Load sessions when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadSessions();
});