document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.querySelector("form");

    // ── LOGIN ────────────────────────────────────────────────────
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const email    = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        try {
            const response = await fetch("http://localhost:5000/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const result = await response.json();

            if (response.ok) {
                localStorage.removeItem("token");
                localStorage.removeItem("role");
                localStorage.setItem("token", result.token);
                localStorage.setItem("role", result.role);

                if (result.role === "admin") {
                    window.location.href = "admin_dashboard.html";
                } else {
                    window.location.href = "user_dashboard.html";
                }
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Login failed! Please try again.");
        }
    });

    // ── FORGOT PASSWORD ──────────────────────────────────────────
    document.getElementById("forgotLink").addEventListener("click", e => {
        e.preventDefault();
        document.getElementById("forgotModal").style.display = "flex";
    });

    document.getElementById("forgotSubmit").addEventListener("click", async () => {
        const email = document.getElementById("forgotEmail").value.trim();
        if (!email) return;

        document.getElementById("forgotSubmit").textContent = "Sending…";

        try {
            const res = await fetch("http://localhost:5000/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            const msg  = document.getElementById("forgotMsg");
            msg.style.display = "block";
            msg.textContent = data.message;
            if (data.resetToken) {
                msg.textContent += " (Dev token: " + data.resetToken.substring(0, 20) + "…)";
            }
        } catch {
            const msg = document.getElementById("forgotMsg");
            msg.style.display = "block";
            msg.textContent = "Something went wrong. Try again.";
        }

        document.getElementById("forgotSubmit").textContent = "Send Reset Link";
    });

});