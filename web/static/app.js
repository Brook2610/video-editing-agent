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

function addMessage(role, text) {
  const msgDiv = el("div", `message ${role}`);

  // Basic markdown-like handling for code blocks if needed, strictly text for now
  msgDiv.textContent = text;

  chat.appendChild(msgDiv);
  chat.scrollTop = chat.scrollHeight;
}

function clearChat() {
  chat.innerHTML = "";
}

async function loadSessions() {
  try {
    const res = await fetch("/api/sessions");
    const data = await res.json();
    sessionList.innerHTML = "";

    data.sessions.forEach((session) => {
      const li = el("li", session === currentSession ? "active" : "", session);
      li.addEventListener("click", () => selectSession(session));
      sessionList.appendChild(li);
    });

    if (!currentSession && data.sessions.length > 0) {
      selectSession(data.sessions[0]);
    }
  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}

async function selectSession(sessionId) {
  currentSession = sessionId;
  sessionTitle.textContent = sessionId;
  sessionMeta.textContent = `Project: ${sessionId}`;

  // Highlight active session
  Array.from(sessionList.children).forEach(li => {
    li.classList.toggle("active", li.textContent === sessionId);
  });

  await loadMessages();
  await loadAssets();
}

async function loadMessages() {
  if (!currentSession) return;
  try {
    const res = await fetch(`/api/sessions/${currentSession}/messages`);
    const data = await res.json();
    clearChat();
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
      assetsList.appendChild(el("div", "asset-meta", "No assets found."));
    }

    data.assets.forEach((asset) => {
      const row = el("div", "asset-item");

      // Checkbox for selection
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = asset.name;
      checkbox.style.marginRight = "8px"; // Inline style for spacing

      // Preview Icon (Generic based on extension)
      const ext = asset.name.split('.').pop().toLowerCase();
      let iconText = "FILE";
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) iconText = "IMG";
      if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) iconText = "VID";
      if (['mp3', 'wav', 'aac'].includes(ext)) iconText = "AUD";

      const preview = el("div", "asset-preview", iconText);

      // Info
      const info = el("div", "asset-info");
      const name = el("span", "asset-name", asset.name);

      // Calculate readable size
      let sizeStr = "";
      if (asset.size < 1024) sizeStr = asset.size + " B";
      else if (asset.size < 1024 * 1024) sizeStr = Math.round(asset.size / 1024) + " KB";
      else sizeStr = (asset.size / (1024 * 1024)).toFixed(1) + " MB";

      const meta = el("span", "asset-meta", sizeStr);

      info.appendChild(name);
      info.appendChild(meta);

      // Assemble
      // Structure: Checkbox | Preview | Info
      row.appendChild(checkbox);
      row.appendChild(preview);
      row.appendChild(info);

      // Clicking row toggles checkbox
      row.addEventListener("click", (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
      });

      assetsList.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load assets:", err);
  }
}

function getSelectedAssets() {
  const selections = [];
  assetsList.querySelectorAll("input[type=checkbox]").forEach((el) => {
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

  // Clear input immediately
  messageInput.value = "";

  // Add user message to UI
  addMessage("user", text);

  // Prepare FormData
  const form = new FormData();
  form.append("message", text);
  form.append("asset_names", JSON.stringify(getSelectedAssets()));

  // Append uploaded files if any
  if (assetUpload.files.length > 0) {
    Array.from(assetUpload.files).forEach((file) => {
      form.append("files", file);
    });
    // Clear file input
    assetUpload.value = "";
  }

  // Add temp AI loading message
  const loadingDiv = el("div", "message ai", "Thinking...");
  chat.appendChild(loadingDiv);
  chat.scrollTop = chat.scrollHeight;

  try {
    const res = await fetch(`/api/sessions/${currentSession}/message`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const data = await res.json();

    // Remove loading message
    chat.removeChild(loadingDiv);

    // Add real response
    addMessage("ai", data.reply || "(No response text)");

    // Refresh assets as the agent might have created new files
    await loadAssets();

  } catch (err) {
    loadingDiv.textContent = `Error: ${err.message}`;
    loadingDiv.style.color = "#ff6b6b";
  }
}

// Event Listeners
newSessionButton.addEventListener("click", async () => {
  const name = prompt("Enter project name:");
  if (!name) return;

  const form = new FormData();
  form.append("session_id", name); // API expects session_id usually in URL, but POST /api/sessions accepts form?
  // Checking app.py: @app.post("/api/sessions") def create_session(name: str = Form(...)):

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

// Initial Load
loadSessions();
