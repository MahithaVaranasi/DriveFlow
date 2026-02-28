const API = "http://localhost:5000";
let isDark = localStorage.getItem("theme") !== "light";

function toast(msg, type = "info", duration = 3500) {
    const container = document.getElementById("toast-container");
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    const icons = { success: "✓", error: "✕", info: "ℹ", warning: "⚠" };
    t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, duration);
}

function applyTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.textContent = dark ? "☀️" : "🌙";
    localStorage.setItem("theme", dark ? "dark" : "light");
}

document.addEventListener("DOMContentLoaded", async () => {
    applyTheme(isDark);
    document.getElementById("theme-toggle")?.addEventListener("click", () => {
        isDark = !isDark; applyTheme(isDark);
    });

    const token = localStorage.getItem("token");
    if (!token) { window.location.href = "loginn.html"; return; }

    document.getElementById("logout-btn").addEventListener("click", () => {
        localStorage.clear(); window.location.href = "loginn.html";
    });

    try {
        const res = await fetch(`${API}/admin-data`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) { fetchUsers(); }
        else { toast("Access denied.", "error"); window.location.href = "loginn.html"; }
    } catch { toast("Server error.", "error"); }
});

async function fetchUsers() {
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API}/users`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const users = await res.json();
        const tbody = document.querySelector("#user-table tbody");
        tbody.innerHTML = "";

        if (!users || users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--muted);">No users found</td></tr>`;
            return;
        }

        const currentUserId = JSON.parse(atob(token.split(".")[1])).id;

        users.forEach(user => {
            const row = document.createElement("tr");
            const isMe = user.id === currentUserId;
            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.full_name}</td>
                <td>${user.email}</td>
                <td><span class="role-badge role-${user.role}">${user.role}</span></td>
                <td>${isMe ? '<span style="color:var(--muted);font-size:12px;">You</span>' :
                    `<button class="user-delete-btn" data-id="${user.id}">Delete</button>`}</td>
            `;
            if (!isMe) {
                row.querySelector(".user-delete-btn").addEventListener("click", () => deleteUser(user.id, user.full_name));
            }
            tbody.appendChild(row);
        });
    } catch { toast("Failed to fetch users.", "error"); }
}

async function deleteUser(userId, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    const token = localStorage.getItem("token");
    try {
        const res = await fetch(`${API}/users/${userId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) { toast(`User "${name}" deleted.`, "success"); fetchUsers(); }
        else toast(data.message || "Failed to delete user.", "error");
    } catch { toast("Server error.", "error"); }
}