let currentSession = null;

// DOM Elements
const sessionList = document.getElementById("session-list");
const sessionTitle = document.getElementById("session-title");
const sessionMeta = document.getElementById("session-meta");
const chat = document.getElementById("chat");
const assetsList = document.getElementById("assets-list");
const assetUpload = document.getElementById("asset-upload");
const refreshAssetsButton = document.getElementById("refresh-assets");
const sendButton = document.getElementById("send");
const messageInput = document.getElementById("message");
const newSessionButton = document.getElementById("new-session");

// Helper to create elements
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

// Format date helper
function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function addMessage(role, text) {
  const msgDiv = el("div", `message ${role}`);
  // Add Markdown support if needed later, for now text content
  msgDiv.textContent = text;
  
  // Optional: timestamp or avatar could be added here
  
  chat.appendChild(msgDiv);
  chat.scrollTop = chat.scrollHeight;
}

function clearChat() {
  chat.innerHTML = "";
  // Re-add empty state if needed, but for now just clear
  if (!currentSession) {
      chat.innerHTML = `
        <div class="empty-state">
            <i data-lucide="sparkles"></i>
            <h3>Start Creating</h3>
            <p>Select a project or create a new one to begin editing.</p>
        </div>`;
      lucide.createIcons();
  }
}

async function loadSessions() {
  try {
    const res = await fetch("/api/sessions");
    const data = await res.json();
    sessionList.innerHTML = "";

    data.sessions.forEach((session) => {
      const li = el("li", session === currentSession ? "active" : "");
      
      // Project Icon
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", "film"); // Generic video icon
      icon.style.width = "16px";
      icon.style.height = "16px";
      
      const span = el("span", "", session);
      
      li.appendChild(icon);
      li.appendChild(span);
      
      li.addEventListener("click", () => selectSession(session));
      sessionList.appendChild(li);
    });

    lucide.createIcons();

    if (!currentSession && data.sessions.length > 0) {
      // Don't auto-select, let user choose, or select first?
      // Let's select first for convenience
      selectSession(data.sessions[0]);
    }
  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}

async function selectSession(sessionId) {
  currentSession = sessionId;
  sessionTitle.textContent = sessionId;
  sessionMeta.textContent = "Active Project";
  sessionMeta.className = "badge";
  sessionMeta.style.color = "var(--accent-color)";
  sessionMeta.style.borderColor = "var(--accent-color)";

  // Highlight active session
  Array.from(sessionList.children).forEach(li => {
    const text = li.querySelector("span").textContent;
    li.classList.toggle("active", text === sessionId);
  });

  await loadMessages();
  await loadAssets();
}

async function loadMessages() {
  if (!currentSession) return;
  try {
    const res = await fetch(`/api/sessions/${currentSession}/messages`);
    const data = await res.json();
    
    // Clear chat but remove empty state
    chat.innerHTML = "";
    
    data.messages.forEach((msg) => {
      const role = (msg.role === "human" || msg.role === "user") ? "user" : "ai";
      addMessage(role, msg.text || "");
    });
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

async function loadAssets() {
  if (!currentSession) return;
  try {
    const res = await fetch(`/api/sessions/${currentSession}/assets`);
    const data = await res.json();
    assetsList.innerHTML = "";

    if (data.assets.length === 0) {
        const empty = el("div", "empty-state", "No assets");
        empty.style.fontSize = "12px";
        empty.style.padding = "20px";
        assetsList.appendChild(empty);
    }

    data.assets.forEach((asset) => {
      // New Asset Card Structure
      const card = el("div", "asset-card");
      
      // Checkbox (Overlay)
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = asset.name;
      checkbox.className = "asset-select";
      
      // Preview
      const ext = asset.name.split('.').pop().toLowerCase();
      let iconName = "file";
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) iconName = "image";
      if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) iconName = "video";
      if (['mp3', 'wav', 'aac'].includes(ext)) iconName = "music";
      
      const preview = el("div", "asset-preview");
      // Could load real image here if endpoint existed, for now icon
      const icon = document.createElement("i");
      icon.setAttribute("data-lucide", iconName);
      icon.style.opacity = "0.5";
      preview.appendChild(icon);

      // Info
      const info = el("div", "asset-info");
      const name = el("span", "asset-name", asset.name);
      
      // Size
      let sizeStr = "";
      if (asset.size < 1024) sizeStr = asset.size + " B";
      else if (asset.size < 1024 * 1024) sizeStr = Math.round(asset.size / 1024) + " KB";
      else sizeStr = (asset.size / (1024 * 1024)).toFixed(1) + " MB";
      
      const meta = el("span", "asset-meta", sizeStr);

      info.appendChild(name);
      info.appendChild(meta);

      card.appendChild(checkbox);
      card.appendChild(preview);
      card.appendChild(info);
      
      // Click card to toggle checkbox
      card.addEventListener("click", (e) => {
          if (e.target !== checkbox) {
              checkbox.checked = !checkbox.checked;
          }
      });

      assetsList.appendChild(card);
    });
    
    lucide.createIcons();
    
  } catch (err) {
    console.error("Failed to load assets:", err);
  }
}

function getSelectedAssets() {
  const selections = [];
  assetsList.querySelectorAll("input.asset-select").forEach((el) => {
    if (el.checked) selections.push(el.value);
  });
  return selections;
}

async function sendMessage() {
  if (!currentSession) {
    alert("Please select or create a project first.");
    return;
  }

  const text = messageInput.value.trim();
  if (!text) return;

  // Clear input
  messageInput.value = "";
  // Reset height
  messageInput.style.height = 'auto';

  // Add user message
  addMessage("user", text);

  const form = new FormData();
  form.append("message", text);
  form.append("asset_names", JSON.stringify(getSelectedAssets()));

  if (assetUpload.files.length > 0) {
    Array.from(assetUpload.files).forEach((file) => {
      form.append("files", file);
    });
    assetUpload.value = "";
  }

  // Loading state
  const loadingDiv = el("div", "message ai", "Thinking...");
  const spinner = document.createElement("i");
  spinner.setAttribute("data-lucide", "loader-2");
  spinner.classList.add("spin"); // Define spin animation in css if needed, or just static text
  // Actually, let's just use text for simplicity unless I add keyframes
  chat.appendChild(loadingDiv);
  chat.scrollTop = chat.scrollHeight;

  try {
    const res = await fetch(`/api/sessions/${currentSession}/message`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();

    chat.removeChild(loadingDiv);
    addMessage("ai", data.reply || "(No response text)");
    await loadAssets();

  } catch (err) {
    loadingDiv.textContent = `Error: ${err.message}`;
    loadingDiv.style.color = "#ef4444";
  }
}

// Event Listeners
newSessionButton.addEventListener("click", async () => {
  const name = prompt("Enter project name:");
  if (!name) return;

  const form = new FormData();
  form.append("name", name);
  try {
    const res = await fetch("/api/sessions", { method: "POST", body: form });
    const data = await res.json();
    await loadSessions();
    selectSession(data.session);
  } catch (e) {
    alert("Failed to create session: " + e);
  }
});

refreshAssetsButton.addEventListener("click", loadAssets);
sendButton.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
messageInput.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = (this.scrollHeight) + "px";
});

// Initial Load
loadSessions();