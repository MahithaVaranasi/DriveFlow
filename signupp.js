document.addEventListener("DOMContentLoaded", function () {
    const signupForm = document.querySelector("form");

    signupForm.addEventListener("submit", async function (event) {
        event.preventDefault(); // Prevent default form submission

        const fullName = document.getElementById("fullName").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const role = document.querySelector('input[name="role"]:checked').value;

        // ✅ Fixed: validate password match before sending to server
        if (password !== confirmPassword) {
            alert("Passwords do not match. Please try again.");
            return;
        }

        if (password.length < 6) {
            alert("Password must be at least 6 characters.");
            return;
        }

        const userData = {
            full_name: fullName,
            email: email,
            password: password,
            role: role
        };

        try {
            const response = await fetch("http://localhost:5000/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(userData)
            });

            const result = await response.json();

            if (response.ok) {
                localStorage.setItem("token", result.token);
                localStorage.setItem("role", result.user.role);

                // Redirect based on role
                if (result.user.role === "admin") {
                    window.location.href = "admin_dashboard.html";  // Change this to your admin page
                } else {
                    window.location.href = "user_dashboard.html";  // Change this to your user page
                }
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error("Error:", error);
            alert("Signup failed!");
        }
    });
});