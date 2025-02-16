document.addEventListener("DOMContentLoaded", function () {
    const loginForm = document.getElementById("login-form");
    const backToMainButton = document.getElementById("back-to-main");

    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;

        fetch("http://localhost:3000/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                localStorage.setItem("authToken", data.token);
                window.location.href = "settings.html"; // Redirect to settings page after login
            } else {
                document.getElementById("login-error").textContent = "Invalid credentials!";
            }
        })
        .catch(error => console.error("Error logging in:", error));
    });

    // Navigate back to the main page
    backToMainButton.addEventListener("click", function () {
        window.location.href = "index.html";
    });
});
