// State
let currentSession = null;

// DOM Elements
const els = {
    sessionList: document.getElementById("session-list"),
    sessionTitle: document.getElementById("session-title"),
    sessionMeta: document.getElementById("session-meta"),
    chat: document.getElementById("chat"),
    assetsList: document.getElementById("assets-list"),
    assetUpload: document.getElementById("asset-upload"),
    refreshAssetsBtn: document.getElementById("refresh-assets"),
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
    div.innerText = text; // Safe text insertion
    els.chat.appendChild(div);
    els.chat.scrollTop = els.chat.scrollHeight;
}

function renderSessionItem(name, isActive) {
    const li = createEl("li", `session-item ${isActive ? 'active' : ''}`);
    
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "video");
    icon.style.width = "14px";
    
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
    
    // Preview Icon
    const preview = createEl("div", "asset-preview");
    const icon = document.createElement("i");
    
    const ext = asset.name.split('.').pop().toLowerCase();
    let iconName = "file";
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) iconName = "image";
    if (['mp4', 'mov', 'webm'].includes(ext)) iconName = "film";
    if (['mp3', 'wav'].includes(ext)) iconName = "music";
    
    icon.setAttribute("data-lucide", iconName);
    preview.appendChild(icon);
    
    // Info
    const info = createEl("div", "asset-info");
    const nameEl = createEl("span", "asset-name", asset.name);
    const sizeEl = createEl("span", "asset-size", formatSize(asset.size));
    
    info.appendChild(nameEl);
    info.appendChild(sizeEl);
    
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
    try {
        const res = await fetch("/api/sessions");
        const data = await res.json();
        
        els.sessionList.innerHTML = "";
        data.sessions.forEach(session => {
            const li = createEl("li", `session-item ${session === currentSession ? 'active' : ''}`);
            li.textContent = session; // simple text for now
            li.onclick = () => selectSession(session);
            els.sessionList.appendChild(li);
        });
        
        if (window.lucide) window.lucide.createIcons();
        
        // Auto-select first if none selected
        if (!currentSession && data.sessions.length > 0) {
            selectSession(data.sessions[0]);
        }
    } catch (e) {
        console.error("Load sessions failed", e);
    }
}

async function selectSession(id) {
    currentSession = id;
    if(els.sessionTitle) els.sessionTitle.textContent = id;
    
    // Update active class
    Array.from(els.sessionList.children).forEach(li => {
        if (li.textContent === id) li.classList.add("active");
        else li.classList.remove("active");
    });
    
    await loadMessages();
    await loadAssets();
}

async function loadMessages() {
    if (!currentSession) return;
    try {
        const res = await fetch(`/api/sessions/${currentSession}/messages`);
        const data = await res.json();
        els.chat.innerHTML = "";
        data.messages.forEach(msg => {
            const role = (msg.role === 'human' || msg.role === 'user') ? 'user' : 'ai';
            renderMessage(role, msg.text);
        });
    } catch(e) { console.error(e); }
}

async function loadAssets() {
    if (!currentSession) return;
    try {
        const res = await fetch(`/api/sessions/${currentSession}/assets`);
        const data = await res.json();
        els.assetsList.innerHTML = "";
        
        if (!data.assets || data.assets.length === 0) {
            const empty = createEl("div", "", "No assets found.");
            empty.style.color = "var(--text-muted)";
            empty.style.fontSize = "12px";
            empty.style.textAlign = "center";
            empty.style.padding = "20px";
            els.assetsList.appendChild(empty);
        } else {
            data.assets.forEach(asset => {
                const card = renderAssetCard(asset);
                els.assetsList.appendChild(card);
            });
        }
        if (window.lucide) window.lucide.createIcons();
    } catch(e) { console.error(e); }
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
    
    // Assets
    const selectedAssets = Array.from(document.querySelectorAll(".asset-check:checked")).map(cb => cb.value);
    form.append("asset_names", JSON.stringify(selectedAssets));
    
    // Files
    if (els.assetUpload.files.length > 0) {
        Array.from(els.assetUpload.files).forEach(f => form.append("files", f));
        els.assetUpload.value = ""; // Reset
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
        loadAssets(); // Refresh assets
        
    } catch (e) {
        const loader = document.getElementById(loadingId);
        if (loader) loader.innerText = "Error: " + e.message;
    }
}

// Event Listeners
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

els.refreshAssetsBtn.onclick = loadAssets;
els.sendBtn.onclick = sendMessage;

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

// Init
loadSessions();
