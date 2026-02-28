// ══════════════════════════════════════════════════════════════════
//  DriveFlow — User Dashboard JS
//  Features: toast notifications, drag & drop, theme toggle,
//  rename, preview, download, storage indicator, sort, empty states
// ══════════════════════════════════════════════════════════════════

const API = "http://localhost:5000";
let currentFolderId = null;
let allFiles = [];
let sortField = "name";
let sortDir = "asc";
let isDark = localStorage.getItem("theme") !== "light";

// ── TOAST SYSTEM ─────────────────────────────────────────────────
function toast(msg, type = "info", duration = 3500) {
    const container = document.getElementById("toast-container");
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    const icons = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
    t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
        t.classList.remove("show");
        setTimeout(() => t.remove(), 400);
    }, duration);
}

// ── THEME TOGGLE ──────────────────────────────────────────────────
function applyTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.textContent = dark ? "☀️" : "🌙";
    localStorage.setItem("theme", dark ? "dark" : "light");
}

// ── AUTH HELPERS ──────────────────────────────────────────────────
function authHeaders() {
    return { "Authorization": `Bearer ${localStorage.getItem("token")}` };
}
function jsonHeaders() {
    return { ...authHeaders(), "Content-Type": "application/json" };
}

// ── LOADING ───────────────────────────────────────────────────────
function setLoading(show) {
    const el = document.getElementById("loading-indicator");
    if (el) el.style.display = show ? "flex" : "none";
}

// ── STORAGE INDICATOR ────────────────────────────────────────────
async function fetchStorageUsage() {
    try {
        const res = await fetch(`${API}/storage-usage`, { headers: authHeaders() });
        if (!res.ok) return;
        const { totalBytes, fileCount, limitBytes } = await res.json();
        const usedMB = (totalBytes / (1024 * 1024)).toFixed(1);
        const limitGB = (limitBytes / (1024 * 1024 * 1024)).toFixed(0);
        const pct = Math.min((totalBytes / limitBytes) * 100, 100).toFixed(1);
        const bar = document.getElementById("storage-bar");
        const label = document.getElementById("storage-label");
        const count = document.getElementById("storage-count");
        if (bar) {
            bar.style.width = pct + "%";
            bar.style.background = pct > 80 ? "var(--danger)" : pct > 60 ? "#f59e0b" : "linear-gradient(90deg, var(--accent), var(--accent2))";
        }
        if (label) label.textContent = `${usedMB} MB of ${limitGB} GB used`;
        if (count) count.textContent = `${fileCount} file${fileCount !== 1 ? "s" : ""}`;
    } catch (_) {}
}

// ── FILE ICONS ────────────────────────────────────────────────────
function fileIcon(name, mimeType) {
    const ext = (name || "").split(".").pop().toLowerCase();
    if (mimeType === "application/vnd.google-apps.folder") return { icon: "📁", color: "#fbbf24" };
    const map = {
        pdf: { icon: "📄", color: "#ef4444" },
        doc: { icon: "📝", color: "#3b82f6" }, docx: { icon: "📝", color: "#3b82f6" },
        xls: { icon: "📊", color: "#22c55e" }, xlsx: { icon: "📊", color: "#22c55e" },
        ppt: { icon: "📊", color: "#f97316" }, pptx: { icon: "📊", color: "#f97316" },
        jpg: { icon: "🖼️", color: "#a855f7" }, jpeg: { icon: "🖼️", color: "#a855f7" },
        png: { icon: "🖼️", color: "#a855f7" }, gif: { icon: "🖼️", color: "#a855f7" },
        webp: { icon: "🖼️", color: "#a855f7" },
        mp4: { icon: "🎬", color: "#06b6d4" }, mov: { icon: "🎬", color: "#06b6d4" },
        mp3: { icon: "🎵", color: "#ec4899" }, wav: { icon: "🎵", color: "#ec4899" },
        zip: { icon: "🗜️", color: "#84cc16" }, rar: { icon: "🗜️", color: "#84cc16" },
        txt: { icon: "📃", color: "#94a3b8" },
    };
    return map[ext] || { icon: "📎", color: "#64748b" };
}

function formatSize(bytes) {
    if (!bytes || bytes === "0") return "–";
    const b = parseInt(bytes);
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function isPreviewable(name) {
    const ext = (name || "").split(".").pop().toLowerCase();
    return ["pdf", "jpg", "jpeg", "png", "gif", "webp", "mp4", "mp3", "wav", "txt"].includes(ext);
}

// ── RENDER FILES TABLE ────────────────────────────────────────────
function renderFiles(files) {
    const tbody = document.getElementById("document-table-body");
    const emptyState = document.getElementById("empty-state");
    tbody.innerHTML = "";

    if (!files || files.length === 0) {
        if (emptyState) emptyState.style.display = "flex";
        return;
    }
    if (emptyState) emptyState.style.display = "none";

    const sorted = [...files].sort((a, b) => {
        let av = a[sortField] || "", bv = b[sortField] || "";
        if (sortField === "size") { av = parseInt(a.size) || 0; bv = parseInt(b.size) || 0; }
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
    });

    const folders = sorted.filter(f => f.mimeType === "application/vnd.google-apps.folder");
    const regularFiles = sorted.filter(f => f.mimeType !== "application/vnd.google-apps.folder");

    [...folders, ...regularFiles].forEach(file => {
        const isFolder = file.mimeType === "application/vnd.google-apps.folder";
        const { icon } = fileIcon(file.name, file.mimeType);
        const canPreview = !isFolder && isPreviewable(file.name);
        const row = document.createElement("tr");

        row.innerHTML = `
            <td><span style="font-size:18px;">${icon}</span></td>
            <td class="file-name-cell">
                ${isFolder
                    ? `<span class="folder-link" data-id="${file.id}">${file.name}</span>`
                    : `<span>${file.name}</span>`}
            </td>
            <td>${formatSize(file.size)}</td>
            <td class="actions-cell">
                ${canPreview ? `<button class="action-btn btn-view">👁 Preview</button>` : ""}
                ${!isFolder ? `<button class="action-btn btn-download">⬇ Download</button>` : ""}
                <button class="action-btn btn-rename">✏️ Rename</button>
                ${!isFolder ? `<button class="action-btn btn-share">🔗 Share</button>` : ""}
                <button class="action-btn btn-delete">🗑 Delete</button>
            </td>
        `;

        tbody.appendChild(row);

        if (isFolder) {
            row.querySelector(".folder-link").addEventListener("click", () => {
                currentFolderId = file.id;
                fetchUploadedFiles(file.id);
            });
        }
        row.querySelector(".btn-rename")?.addEventListener("click", () => openRenameModal(file.id, file.name));
        row.querySelector(".btn-delete")?.addEventListener("click", () => openDeleteModal(file.id));
        row.querySelector(".btn-share")?.addEventListener("click", () => openShareModal(file.id));
        row.querySelector(".btn-view")?.addEventListener("click", () => openPreviewModal(file.webViewLink, file.name));
        row.querySelector(".btn-download")?.addEventListener("click", () => downloadFile(file.id, file.name));
    });
}

// ── FETCH FILES ───────────────────────────────────────────────────
async function fetchUploadedFiles(folderId) {
    setLoading(true);
    try {
        const url = folderId ? `${API}/list-files?folderId=${folderId}` : `${API}/list-files`;
        const res = await fetch(url, { headers: authHeaders() });
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const data = await res.json();
        allFiles = data.files || [];
        filterFiles();
        fetchStorageUsage();
        fetchFolders();
        const breadcrumb = document.getElementById("breadcrumb");
        if (breadcrumb) {
            breadcrumb.innerHTML = folderId
                ? `<span id="bc-home" style="cursor:pointer;color:var(--muted);">Home</span> › <span>Folder</span>`
                : `<span>Home</span>`;
            document.getElementById("bc-home")?.addEventListener("click", () => {
                currentFolderId = null; fetchUploadedFiles(null);
            });
        }
    } catch (err) {
        toast(`Error fetching files: ${err.message}`, "error");
    } finally {
        setLoading(false);
    }
}

// ── FILTER & SORT ─────────────────────────────────────────────────
function filterFiles() {
    const search = (document.getElementById("searchInput")?.value || "").toLowerCase();
    const filter = document.getElementById("filterSelect")?.value || "";
    const imageExts = ["jpg", "jpeg", "png", "gif", "webp"];
    const filtered = allFiles.filter(f => {
        const name = (f.name || "").toLowerCase();
        const ext = name.split(".").pop();
        const nameMatch = name.includes(search);
        let typeMatch = true;
        if (filter) typeMatch = filter === "image" ? imageExts.includes(ext) : ext === filter;
        return nameMatch && typeMatch;
    });
    renderFiles(filtered);
}

// ── UPLOAD ────────────────────────────────────────────────────────
async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);
    if (currentFolderId) formData.append("folderId", currentFolderId);

    const progressWrap = document.getElementById("uploadProgress");
    const progressBar = document.getElementById("progressBar");
    const progressPct = document.getElementById("progressPercent");
    if (progressWrap) progressWrap.style.display = "block";

    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API}/upload`);
        xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("token")}`);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                if (progressBar) progressBar.style.width = pct + "%";
                if (progressPct) progressPct.textContent = pct + "%";
            }
        };
        xhr.onload = () => {
            if (progressWrap) progressWrap.style.display = "none";
            if (progressBar) progressBar.style.width = "0%";
            if (xhr.status >= 200 && xhr.status < 300) {
                toast(`"${file.name}" uploaded!`, "success");
                document.getElementById("file-name-display").textContent = "";
                document.getElementById("file-upload").value = "";
                fetchUploadedFiles(currentFolderId);
            } else {
                toast("Upload failed. Try again.", "error");
            }
            resolve();
        };
        xhr.onerror = () => { if (progressWrap) progressWrap.style.display = "none"; toast("Upload error.", "error"); resolve(); };
        xhr.send(formData);
    });
}

// ── DRAG & DROP ───────────────────────────────────────────────────
function initDragDrop() {
    const zone = document.getElementById("drop-zone");
    if (!zone) return;
    ["dragenter", "dragover"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add("drag-over"); }));
    ["dragleave", "drop"].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove("drag-over"); }));
    zone.addEventListener("drop", async e => {
        const files = Array.from(e.dataTransfer.files);
        for (const file of files) {
            if (file.size > 10 * 1024 * 1024) { toast(`"${file.name}" exceeds 10MB`, "warning"); continue; }
            toast(`Uploading "${file.name}"...`, "info");
            await uploadFile(file);
        }
    });
}

// ── MODALS ────────────────────────────────────────────────────────
function closeModal(id) {
    document.getElementById(id)?.classList.remove("open");
}
function bindClose(modalId) {
    const modal = document.getElementById(modalId);
    modal?.querySelectorAll(".close, .modal-backdrop").forEach(el => el.onclick = () => closeModal(modalId));
}

function openRenameModal(fileId, currentName) {
    const modal = document.getElementById("renameModal");
    const input = document.getElementById("renameInput");
    input.value = currentName;
    modal.classList.add("open");
    input.focus(); input.select();
    bindClose("renameModal");
    document.getElementById("cancelRename").onclick = () => closeModal("renameModal");
    document.getElementById("confirmRename").onclick = async () => {
        const newName = input.value.trim();
        if (!newName || newName === currentName) { closeModal("renameModal"); return; }
        try {
            const res = await fetch(`${API}/rename-file/${fileId}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ newName }) });
            if (!res.ok) throw new Error();
            toast(`Renamed to "${newName}"`, "success");
            closeModal("renameModal");
            fetchUploadedFiles(currentFolderId);
        } catch { toast("Failed to rename.", "error"); }
    };
}

function openDeleteModal(fileId) {
    const modal = document.getElementById("deleteModal");
    modal.classList.add("open");
    bindClose("deleteModal");
    document.getElementById("cancelDelete").onclick = () => closeModal("deleteModal");
    document.getElementById("confirmDelete").onclick = async () => {
        try {
            const res = await fetch(`${API}/delete-file/${fileId}`, { method: "DELETE", headers: authHeaders() });
            if (!res.ok) throw new Error();
            toast("File moved to trash.", "success");
            closeModal("deleteModal");
            fetchUploadedFiles(currentFolderId);
        } catch { toast("Failed to delete file.", "error"); }
    };
}

function openShareModal(fileId) {
    const modal = document.getElementById("shareModal");
    const emailInput = document.getElementById("shareEmail");
    emailInput.value = "";
    modal.classList.add("open");
    emailInput.focus();
    bindClose("shareModal");
    document.getElementById("confirmShare").onclick = async () => {
        const email = emailInput.value.trim();
        if (!email) { toast("Enter an email address.", "warning"); return; }
        try {
            const res = await fetch(`${API}/share-file/${fileId}`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ email }) });
            if (!res.ok) throw new Error();
            toast(`Shared with ${email}`, "success");
            closeModal("shareModal");
        } catch { toast("Failed to share.", "error"); }
    };
}

function openPreviewModal(link, name) {
    const modal = document.getElementById("previewModal");
    const frame = document.getElementById("previewFrame");
    const title = document.getElementById("previewTitle");
    if (title) title.textContent = name;
    frame.src = link.replace("/view", "/preview");
    modal.classList.add("open");
    modal.querySelectorAll(".close, .modal-backdrop").forEach(el => {
        el.onclick = () => { closeModal("previewModal"); frame.src = ""; };
    });
}

function openFolderModal() {
    const modal = document.getElementById("folderModal");
    const input = document.getElementById("folderNameInput");
    input.value = "";
    modal.classList.add("open");
    input.focus();
    bindClose("folderModal");
    document.getElementById("cancelFolder").onclick = () => closeModal("folderModal");
    document.getElementById("confirmFolder").onclick = () => {
        const name = input.value.trim();
        if (!name) { toast("Enter a folder name.", "warning"); return; }
        closeModal("folderModal");
        createFolder(name);
    };
}

// ── DOWNLOAD ─────────────────────────────────────────────────────
async function downloadFile(fileId, fileName) {
    try {
        toast(`Preparing "${fileName}"...`, "info");
        const res = await fetch(`${API}/download-file/${fileId}`, { headers: authHeaders() });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
        toast(`Downloaded "${fileName}"!`, "success");
    } catch { toast("Download failed.", "error"); }
}

// ── FOLDER CREATE ─────────────────────────────────────────────────
async function createFolder(folderName) {
    try {
        const res = await fetch(`${API}/create-folder`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ folderName }) });
        if (!res.ok) throw new Error();
        toast(`Folder "${folderName}" created!`, "success");
        fetchUploadedFiles(currentFolderId);
    } catch { toast("Failed to create folder.", "error"); }
}

// ── TRASH ─────────────────────────────────────────────────────────
async function fetchTrashItems() {
    setLoading(true);
    try {
        const res = await fetch(`${API}/trash`, { headers: authHeaders() });
        if (!res.ok) throw new Error();
        displayTrashItems(await res.json());
    } catch { toast("Failed to load trash.", "error"); }
    finally { setLoading(false); }
}

function displayTrashItems(items) {
    const tbody = document.getElementById("document-table-body");
    const emptyState = document.getElementById("empty-state");
    tbody.innerHTML = "";
    if (!items || items.length === 0) {
        if (emptyState) { emptyState.style.display = "flex"; emptyState.querySelector("p").textContent = "Trash is empty"; }
        return;
    }
    if (emptyState) emptyState.style.display = "none";
    items.forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${fileIcon(item.name, item.mimeType).icon}</td>
            <td>${item.name}</td>
            <td>${item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : "–"}</td>
            <td>
                <button class="action-btn btn-share">↩ Restore</button>
                <button class="action-btn btn-delete">✕ Delete forever</button>
            </td>`;
        tbody.appendChild(row);
        row.querySelector(".btn-share").addEventListener("click", () => restoreFile(item.id));
        row.querySelector(".btn-delete").addEventListener("click", () => permanentDeleteFile(item.id));
    });
}

async function restoreFile(fileId) {
    try {
        const res = await fetch(`${API}/restore-file/${fileId}`, { method: "PUT", headers: authHeaders() });
        if (!res.ok) throw new Error();
        toast("File restored!", "success"); fetchTrashItems();
    } catch { toast("Failed to restore.", "error"); }
}

async function permanentDeleteFile(fileId) {
    try {
        const res = await fetch(`${API}/permanent-delete/${fileId}`, { method: "DELETE", headers: authHeaders() });
        if (!res.ok) throw new Error();
        toast("Permanently deleted.", "success"); fetchTrashItems();
    } catch { toast("Failed to delete.", "error"); }
}

// ── SIDEBAR FOLDER LIST ───────────────────────────────────────────
async function fetchFolders() {
    try {
        const res = await fetch(`${API}/list-files`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const folders = (data.files || []).filter(f => f.mimeType === "application/vnd.google-apps.folder");
        const list = document.getElementById("folder-list");
        if (!list) return;
        list.innerHTML = folders.length === 0
            ? `<li style="color:var(--muted);font-size:13px;padding:8px 12px;">No folders yet</li>`
            : "";
        folders.forEach(f => {
            const li = document.createElement("li");
            li.innerHTML = `<span style="color:#fbbf24;">📁</span> ${f.name}`;
            li.addEventListener("click", () => { currentFolderId = f.id; fetchUploadedFiles(f.id); });
            list.appendChild(li);
        });
    } catch (_) {}
}

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
    applyTheme(isDark);

    const token = localStorage.getItem("token");
    if (!token) { window.location.href = "loginn.html"; return; }

    // Welcome name + banner greeting
    try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        const firstName = (payload.full_name || payload.email || "there").split(" ")[0];
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

        const welcomeEl = document.getElementById("welcome-msg") || document.querySelector(".welcome");
        if (welcomeEl) welcomeEl.textContent = `Hi, ${firstName}!`;

        const bannerTitle = document.getElementById("bannerTitle");
        if (bannerTitle) bannerTitle.textContent = `${greeting}, ${firstName}! 👋`;
    } catch { window.location.href = "loginn.html"; return; }

    // Banner dismiss
    const banner = document.getElementById("welcomeBanner");
    if (banner) {
        if (localStorage.getItem("bannerDismissed")) banner.classList.add("hidden");
        const dismissBtn = document.getElementById("dismissBanner");
        if (dismissBtn) dismissBtn.addEventListener("click", () => {
            banner.classList.add("hidden");
            localStorage.setItem("bannerDismissed", "1");
        });
    }

    // Theme toggle
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    const themeBtn = document.getElementById("themeToggle") || document.getElementById("theme-toggle");
    if (themeBtn) themeBtn.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
    });

    document.getElementById("logout-btn")?.addEventListener("click", () => { localStorage.clear(); window.location.href = "loginn.html"; });
    document.getElementById("searchInput")?.addEventListener("input", filterFiles);
    document.getElementById("filterSelect")?.addEventListener("change", filterFiles);
    document.getElementById("createFolderButton")?.addEventListener("click", openFolderModal);

    // Sort headers
    document.querySelectorAll("[data-sort]").forEach(th => {
        th.style.cursor = "pointer";
        th.addEventListener("click", () => {
            const field = th.dataset.sort;
            if (sortField === field) sortDir = sortDir === "asc" ? "desc" : "asc";
            else { sortField = field; sortDir = "asc"; }
            document.querySelectorAll("[data-sort] .sort-arrow").forEach(a => a.remove());
            const arrow = document.createElement("span");
            arrow.className = "sort-arrow";
            arrow.textContent = sortDir === "asc" ? " ↑" : " ↓";
            th.appendChild(arrow);
            filterFiles();
        });
    });

    const fileInput = document.getElementById("file-upload");
    const fileNameDisplay = document.getElementById("file-name-display");
    fileInput?.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 10 * 1024 * 1024) { toast("File exceeds 10MB limit.", "warning"); fileInput.value = ""; fileNameDisplay.textContent = ""; return; }
            fileNameDisplay.textContent = file.name;
        } else { fileNameDisplay.textContent = ""; }
    });

    document.getElementById("upload-btn")?.addEventListener("click", () => {
        if (fileInput.files.length > 0) uploadFile(fileInput.files[0]);
        else toast("Please select a file first.", "warning");
    });

    document.getElementById("trash-button")?.addEventListener("click", fetchTrashItems);
    document.getElementById("back-to-main-button")?.addEventListener("click", () => { currentFolderId = null; fetchUploadedFiles(null); });

    initDragDrop();
    await fetchUploadedFiles(null);
    fetchFolders();
});