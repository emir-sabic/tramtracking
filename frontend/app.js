// Initialize the map centered on Sarajevo
var map = L.map('mapid').setView([43.8563, 18.4131], 13);
var stations = []; // Array to store stations
var tramMarkers = {}; // Object to store tram markers

// Add OpenStreetMap tile layer to the map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Define tram icons
const normalIcon = L.icon({
    iconUrl: 'assets/train.png',
    iconSize: [25, 25],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});
const highlightedIcon = L.icon({
    iconUrl: 'assets/tramacc.png', // Ensure you have this highlighted icon
    iconSize: [40, 40],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Fetch stations and add them to the map
fetch('http://localhost:3000/api/stations')
    .then(response => response.json())
    .then(fetchedStations => {
        if (!Array.isArray(fetchedStations) || fetchedStations.length === 0) {
            console.error('Failed to load stations or data is empty');
            return;
        }
        stations = fetchedStations;
        displayStations(stations);
    }).catch(error => {
        console.error('Error fetching stations:', error);
    });

function displayStations(stations) {
    stations.forEach(station => {
        var marker = L.marker([station.latitude, station.longitude], {
            icon: L.icon({
                iconUrl: 'assets/pini.png',
                iconSize: [25, 25],
                className: `marker-${station.id}`
            })
        }).addTo(map);
        marker.bindPopup('Station: ' + station.name);
        tramMarkers[station.id] = marker; // Store markers by station ID for easy access
    });
}

// Initialize tram markers from tram position data
function initializeTramMarkers() {
    fetch('http://localhost:3000/api/tramPositions')
        .then(response => response.json())
        .then(trams => {
            Object.keys(trams).forEach(tramId => {
                let tram = trams[tramId];
                if (tram.lat && tram.lng) {
                    let marker = L.marker([tram.lat, tram.lng], {
                        icon: normalIcon
                    }).addTo(map);
                    tramMarkers[tramId] = marker;

                    // Set the initial currentStationId based on the nearest station
                    let nearestStation = findNearestStation(tram);
                    if (nearestStation) {
                        tram.currentStationId = nearestStation.id;
                        tram.direction = 1; // Initialize direction to forward
                        marker.currentStationId = tram.currentStationId;
                    }
                    updateTramMarker(tramId, tram.currentStationId); // Update tram markers on the map
                }
            });
        });
}

initializeTramMarkers();

function updateTramMarker(tramId, station) {
    fetch('http://localhost:3000/api/tramPositions')
        .then(response => response.json())
        .then(trams => {
            Object.keys(trams).forEach(tramId => {
                let tram = trams[tramId];
                let marker = tramMarkers[tramId];
                if (marker) {
                    let newLatLng = new L.LatLng(tram.lat, tram.lng);
                    if (!marker.getLatLng().equals(newLatLng)) {  // Only update if position has changed
                        marker.setLatLng(newLatLng);
                        let nearestStation = findNearestStation(tram);
                        if (nearestStation) {
                            if (!tram.currentStationId || tram.currentStationId !== nearestStation.id) {
                                tram.currentStationId = nearestStation.id;
                                console.log('Tram moved to a new station ID:', tram.currentStationId);
                                marker.currentStationId = tram.currentStationId;
                            }
                            generatePopupContent(tram, tramId).then(popupContent => {
                                marker.bindPopup(popupContent);
                            }).catch(error => {
                                console.error('Failed to generate popup content:', error);
                            });
                        }
                    }
                } else {
                    console.error('Marker not found for tram:', tramId);
                }
            });
        });
}

setInterval(() => {
    Object.keys(tramMarkers).forEach(updateTramMarker);
}, 3000);

function findNearestStation(tram) {
    if (!tram.currentStationId) {
        // If currentStationId is not set, find the nearest station by distance
        let minDistance = Infinity;
        let nearestStation = null;
        stations.forEach(station => {
            let distance = calculateDistance(tram.lat, tram.lng, station.latitude, station.longitude);
            if (distance < minDistance) {
                minDistance = distance;
                nearestStation = station;
            }
        });
        console.log('Nearest Station by Distance:', nearestStation);
        return nearestStation;
    } else {
        // If currentStationId is set, find the next station by ID and direction
        let currentStationIndex = stations.findIndex(station => station.id === tram.currentStationId);
        if (currentStationIndex === -1) return null; // If current station not found, return null

        let nextStationIndex = (currentStationIndex + tram.direction) % stations.length;
        if (nextStationIndex < 0) nextStationIndex += stations.length; // Handle negative index

        // Ensure the station direction is correct
        let nextStation = stations[nextStationIndex];
        while (nextStation && nextStation.name === stations[currentStationIndex].name && nextStation.id !== stations[currentStationIndex].id) {
            nextStationIndex = (nextStationIndex + tram.direction) % stations.length;
            if (nextStationIndex < 0) nextStationIndex += stations.length; // Handle negative index
            nextStation = stations[nextStationIndex];
        }

        return nextStation;
    }
}

// Function to calculate distance using the Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371000; // Radius of the Earth in meters
    var lat1Rad = lat1 * Math.PI / 180;
    var lat2Rad = lat2 * Math.PI / 180;
    var deltaLat = (lat2 - lat1) * Math.PI / 180;
    var deltaLon = (lon2 - lon1) * Math.PI / 180;

    var a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Return distance in meters
}

// Function to approximate travel time based on distance and speed
function approximateTravelTime(distance, speed) {
    if (speed <= 0) return Infinity; // Avoid division by zero or negative speed
    const timeInSeconds = distance / speed;
    return Math.round(timeInSeconds / 60); // Convert to minutes
}

function generatePopupContent(tram, tram_id) {
    return new Promise((resolve, reject) => {
        if (!tram || !tram.currentStationId || !Array.isArray(stations)) {
            resolve('<b>Tram Route Information:</b><br>No additional information available.');
        }

        let popupContent = `<b>Tram Route Information:<br>Tram ID: ${tram_id}</b><br>`;
        fetch(`http://localhost:3000/api/nextStations/${tram.currentStationId}`)
            .then(response => response.json())
            .then(nextStations => {
                console.log('Next stations fetched:', nextStations); // Log the next stations data fetched
                nextStations.forEach((station, index) => {
                    let distance = calculateDistance(tram.lat, tram.lng, station.latitude, station.longitude);
                    let time = approximateTravelTime(distance, tram.speed);
                    popupContent += `${index + 1}. Next station: ${station.name}<br>Approx. travel time: ${time} mins<br>`;
                });
                resolve(popupContent);
            })
            .catch(error => {
                console.error('Error fetching next stations:', error);
                reject(error);
            });
    });
}

document.getElementById('search-input').addEventListener('input', function (e) {
    var searchText = e.target.value.toLowerCase();
    updateSearchResults(searchText);
});

document.getElementById('search-input').addEventListener('focus', function () {
    updateSearchResults(''); // Show all results when input is focused
});

// Hide search results when clicking outside of them
document.addEventListener('click', function(event) {
    var isClickInside = document.getElementById('search-input').contains(event.target) || document.getElementById('search-results').contains(event.target);
if (!isClickInside) {
     document.getElementById('search-results').innerHTML = '';
}
});

function updateSearchResults(text) {
    var results = '';
    stations.forEach(station => {
        if (station.name.toLowerCase().includes(text)) {
            results += `<div class="search-result" data-station-id="${station.id}">${station.name}</div>`;
        }
    });
    document.getElementById('search-results').innerHTML = results;

    // Add click listeners to each search result
    document.querySelectorAll('.search-result').forEach(item => {
        item.addEventListener('click', function () {
            let stationId = this.getAttribute('data-station-id');
            highlightMarker(stationId);
        });
    });
}

function highlightMarker(stationId) {
    // Reset only station markers to default icon
    stations.forEach(station => {
        let marker = tramMarkers[station.id];
        if (marker) {
            marker.setIcon(L.icon({
                iconUrl: 'assets/pini.png',
                iconSize: [25, 25]
            }));
        }
    });
    // Highlight the selected station marker
    let marker = tramMarkers[stationId];
    if (marker) {
        marker.setIcon(L.icon({
            iconUrl: 'assets/blackpin.png', // Ensure you have a highlighted icon
            iconSize: [30, 30] // Slightly larger
        }));
        map.panTo(marker.getLatLng()); // Center the map on the selected marker
    }
}

// WebSocket connection for real-time updates
document.addEventListener('DOMContentLoaded', function () {
    function requestNotificationPermission() {
        if (Notification.permission !== 'granted') {
            Notification.requestPermission().then(permission => {
                console.log('Notification permission status:', permission);
                if (permission !== 'granted') {
                    alert('Notifications are blocked. Please allow notifications in the browser settings.');
                }
            });
        } else {
            console.log('Notification permission status:', Notification.permission);
        }
    }

    requestNotificationPermission();

    const ws = new WebSocket('ws://localhost:3000');

    ws.onopen = function () {
        console.log('WebSocket connection established.');
    };

    ws.onmessage = function (event) {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        if (message.type === 'notification') {
            new Notification(`Marked Tram ${message.tramId} Alert`, {
                body: message.message,
            });
            if (message.highlight) {
                highlightTramMarker(message.tramId);
            }
        }
    };

    ws.onerror = function (error) {
        console.error('WebSocket error:', error);
    };

    ws.onclose = function () {
        console.log('WebSocket connection closed.');
    };

    // Function to highlight tram marker
    function highlightTramMarker(tramId) {
        const tramMarker = tramMarkers[tramId];
        if (tramMarker) {
            tramMarker.setIcon(highlightedIcon);
        }
    }
});
