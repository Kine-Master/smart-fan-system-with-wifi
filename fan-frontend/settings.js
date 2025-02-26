document.addEventListener("DOMContentLoaded", function () {
    const settingsForm = document.getElementById("settings-form");
    const backToMainButton = document.getElementById("back-to-main");
    const logoutButton = document.getElementById("logout");

    // Redirect to login if not logged in
    const token = localStorage.getItem("authToken");
    if (!token) {
        window.location.href = "login.html";
        return; // Stop execution if not logged in
    }

    // Fetch current settings
    function fetchSettings() {
        fetch("http://localhost:3000/api/settings")
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    document.getElementById("speed1-threshold").value = data.data.speed1_threshold;
                    document.getElementById("speed2-threshold").value = data.data.speed2_threshold;
                    document.getElementById("speed3-threshold").value = data.data.speed3_threshold;
                    document.getElementById("distance-threshold").value = data.data.distance_threshold;
                }
            })
            .catch(error => console.error("Error fetching settings:", error));
    }

    fetchSettings(); // Load settings on page load

    // Handle settings update
    settingsForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const speed1_threshold = document.getElementById("speed1-threshold").value;
        const speed2_threshold = document.getElementById("speed2-threshold").value;
        const speed3_threshold = document.getElementById("speed3-threshold").value;
        const distance_threshold = document.getElementById("distance-threshold").value;

        fetch("http://localhost:3000/update-settings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` // Include token for authentication
            },
            body: JSON.stringify({ speed1_threshold, speed2_threshold, speed3_threshold, distance_threshold})
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert("Settings updated successfully!");
            } else {
                document.getElementById("settings-error").textContent = "Failed to update settings.";
            }
        })
        .catch(error => console.error("Error updating settings:", error));
    });

    // Logout functionality
    logoutButton.addEventListener("click", function () {
        localStorage.removeItem("authToken"); // Clear authentication token
        window.location.href = "login.html"; // Redirect to login page
    });

    // Navigate back to the main page
    backToMainButton.addEventListener("click", function () {
        window.location.href = "index.html";
    });
});
