document.addEventListener("DOMContentLoaded", function() {
    const temperatureElement = document.getElementById("temperature");
    const distanceElement = document.getElementById("distance");
    const fanStatusElement = document.getElementById("fan_status");
    const oscillationStatusElement = document.getElementById("oscillation_status");
    const historyList = document.getElementById("history-list");
    const toggleOscillationButton = document.getElementById("toggle-oscillation");
    const goToSettingsButton = document.getElementById("go-to-settings");
    const socket = new WebSocket("ws://localhost:3000");
    
    
    socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "sensor_update") {
        document.getElementById("temperature").textContent = data.temperature;
        document.getElementById("distance").textContent = data.distance;
        document.getElementById("fan_status").textContent = data.fan_status ? "On" : "Off";
        document.getElementById("oscillation_status").textContent = data.oscillation_status ? "Enabled" : "Disabled";
    }
    };


    // ✅ Handle real-time sensor data updates
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Received WebSocket update:", data); // Debugging

        if (data.type === "sensor_update") {
            temperatureElement.textContent = `${data.temperature}°C`;
            distanceElement.textContent = `${data.distance} cm`;
            fanStatusElement.textContent = data.fan_status ? "On" : "Off";
            oscillationStatusElement.textContent = data.oscillation_status ? "Enabled" : "Disabled";
            
            // ✅ Also update usage history in real time
            fetchUsageHistory();
        }
    };

    // ✅ Function to fetch usage history from backend
    function fetchUsageHistory() {
        fetch("http://localhost:3000/api/usage-history")
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    historyList.innerHTML = ""; // Clear previous history
                    data.history.forEach(entry => {
                        const li = document.createElement("li");
                        li.textContent = `Temp: ${entry.temperature}°C, Distance: ${entry.distance}cm, Fan: ${entry.fan_status ? "On" : "Off"}, Oscillation: ${entry.oscillation_status ? "Enabled" : "Disabled"}`;
                        historyList.appendChild(li);
                    });
                }
            })
            .catch(error => console.error("Error fetching usage history:", error));
    }

    // Toggle oscillation function
    toggleOscillationButton.addEventListener("click", () => {
        fetch("http://localhost:3000/update-oscillation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oscillation_status: oscillationStatusElement.textContent === "Enabled" ? 0 : 1 })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) fetchSensorData(); // Refresh status
        })
        .catch(error => console.error("Error toggling oscillation:", error));
    });

    goToSettingsButton.addEventListener("click", () => {
        const token = localStorage.getItem("authToken");
    
        if (token) {
            // User is logged in, go to settings
            window.location.href = "settings.html";
        } else {
            // User is not logged in, go to login first
            window.location.href = "login.html";
        }
    });
    
    

    // Auto-refresh data every 3 seconds
    setInterval(() => {
        fetchUsageHistory();
    }, 3000);
});
