// Define StationNode and CircularLinkedList classes
class StationNode {
    constructor(station) {
        this.station = station;
        this.next = null;
    }
}

class CircularLinkedList {
    constructor() {
        this.head = null;
        this.tail = null;
    }

    addStation(station) {
        const newNode = new StationNode(station);
        if (!this.head) {
            this.head = newNode;
            this.tail = newNode;
            newNode.next = this.head; // Point to itself
        } else {
            this.tail.next = newNode;
            this.tail = newNode;
            this.tail.next = this.head; // Point to head to make it circular
        }
    }

    findStationById(id) {
        let currentNode = this.head;
        if (!currentNode) return null;

        do {
            if (currentNode.station.id === id) {
                return currentNode;
            }
            currentNode = currentNode.next;
        } while (currentNode !== this.head);

        return null; // Station not found
    }

    getNextStation(currentStationId) {
        const currentNode = this.findStationById(currentStationId);
        if (currentNode) {
            return currentNode.next.station;
        }
        return null; // Current station not found
    }
}

// Initialize the map centered on Sarajevo
var map = L.map('mapid').setView([43.8563, 18.4131], 13);
var stationsList = new CircularLinkedList(); // Circular Linked List for stations
var tramMarkers = {}; // Object to store tram markers

// Add OpenStreetMap tile layer to the map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Define tram icons
const tramIcon = L.icon({
    iconUrl: 'assets/train.png',
    iconSize: [25, 25],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Fetch stations and add them to the Circular LinkedList and map
fetch('http://localhost:3000/api/stations')
    .then(response => response.json())
    .then(fetchedStations => {
        fetchedStations.sort((a, b) => a.id - b.id); // Ensure stations are in order
        fetchedStations.forEach(station => {
            stationsList.addStation(station); // Add each station to the Circular LinkedList
        });
        displayStations(fetchedStations); // Display stations on the map
        initializeTramMarkers(); // Initialize tram markers after stations are loaded
    })
    .catch(error => console.error('Error fetching stations:', error));

function displayStations(stations) {
    stations.forEach(station => {
        var marker = L.marker([station.latitude, station.longitude], {
            icon: L.icon({
                iconUrl: 'assets/pini.png',
                iconSize: [25, 25]
            })
        }).addTo(map);
        marker.bindPopup(`Station: ${station.name}`);
    });
}

// Initialize tram markers from tram position data
function initializeTramMarkers() {
    fetch('http://localhost:3000/api/tramPositions')
        .then(response => response.json())
        .then(trams => {
            Object.keys(trams).forEach(tramId => {
                let tram = trams[tramId];
                let marker = L.marker([tram.lat, tram.lng], {
                    icon: tramIcon
                }).addTo(map);
                tramMarkers[tramId] = marker;

                let nearestStation = findNearestStation(tram);
                if (nearestStation) {
                    tram.currentStationId = nearestStation.id;
                    console.log(`Initial current station for tram ${tramId}: ${tram.currentStationId}`);
                }
                marker.on('click', () => {
                    generatePopupContent(tram, tramId).then(popupContent => {
                        marker.bindPopup(popupContent).openPopup();
                    });
                });
                updateTramMarker(tramId, tram);
            });
        })
        .catch(error => console.error('Error fetching tram positions:', error));
}

// Threshold distance to consider a tram as passing a station (in meters)
const STATION_PROXIMITY_THRESHOLD = 50;

function updateTramMarker(tramId, tram) {
    fetch('http://localhost:3000/api/tramPositions')
        .then(response => response.json())
        .then(trams => {
            let tram = trams[tramId];
            let marker = tramMarkers[tramId];
            if (marker) {
                let newLatLng = new L.LatLng(tram.lat, tram.lng);
                if (!marker.getLatLng().equals(newLatLng)) {
                    marker.setLatLng(newLatLng);
                    if (!tram.currentStationId) {
                        let nearestStation = findNearestStation(tram);
                        if (nearestStation) {
                            tram.currentStationId = nearestStation.id;
                            console.log(`Updated initial current station for tram ${tramId}: ${tram.currentStationId}`);
                        } else {
                            console.error(`Initial station for tram ${tramId} not found`);
                            return;
                        }
                    }
                    let nextStation = stationsList.getNextStation(tram.currentStationId);
                    if (nextStation) {
                        let distanceToNextStation = calculateDistance(tram.lat, tram.lng, nextStation.latitude, nextStation.longitude);
                        console.log(`Tram ${tramId} distance to next station ${nextStation.id}: ${distanceToNextStation}`);
                        let currentDistance = calculateDistance(tram.lat, tram.lng, stationsList.findStationById(tram.currentStationId).station.latitude, stationsList.findStationById(tram.currentStationId).station.longitude);
                        console.log(`Tram ${tramId} distance to current station ${tram.currentStationId}: ${currentDistance}`);
                        if (distanceToNextStation < STATION_PROXIMITY_THRESHOLD) {
                            tram.currentStationId = nextStation.id;
                            generatePopupContent(tram, tramId).then(popupContent => {
                                marker.bindPopup(popupContent).openPopup();
                            });
                            console.log(`Tram ${tramId} passed station ${tram.currentStationId}`);
                        } else if (distanceToNextStation > currentDistance && distanceToNextStation > STATION_PROXIMITY_THRESHOLD) {
                            tram.currentStationId = nextStation.id;
                            console.log(`Tram ${tramId} updated to next station ${tram.currentStationId} based on distance check`);
                        }
                    } else {
                        console.error(`Next station for tram ${tramId} not found`);
                    }
                } else {
                    console.log(`Tram ${tramId} is stationary at station ${tram.currentStationId}`);
                }
            }
        })
        .catch(error => console.error('Error updating tram positions:', error));
}

setInterval(() => {
    Object.keys(tramMarkers).forEach(tramId => {
        fetch(`http://localhost:3000/api/tramPositions`)
            .then(response => response.json())
            .then(trams => updateTramMarker(tramId, trams[tramId]))
            .catch(error => console.error('Error fetching tram positions:', error));
    });
}, 3000);

// Function to find the nearest station by distance
function findNearestStation(tram) {
    let minDistance = Infinity;
    let nearestStation = null;
    let currentNode = stationsList.head;
    if (!currentNode) return null;

    do {
        let station = currentNode.station;
        let distance = calculateDistance(tram.lat, tram.lng, station.latitude, station.longitude);
        console.log(`Distance from tram to station ${station.id} (${station.name}): ${distance}`);
        if (distance < minDistance) {
            minDistance = distance;
            nearestStation = station;
        }
        currentNode = currentNode.next;
    } while (currentNode !== stationsList.head);

    return nearestStation;
}

// Function to generate popup content for trams
async function generatePopupContent(tram, tram_id) {
    if (!tram || !tram.currentStationId) {
        return '<b>Tram Route Information:</b><br>No additional information available.';
    }

    let popupContent = `<b>Tram Route Information:<br>Tram ID: ${tram_id}</b><br>`;
    let currentStationId = tram.currentStationId;
    for (let i = 0; i < 5; i++) {
        let nextStation = stationsList.getNextStation(currentStationId);
        if (nextStation) {
            let distance = calculateDistance(tram.lat, tram.lng, nextStation.latitude, nextStation.longitude);
            let time = approximateTravelTime(distance, tram.speed);
            popupContent += `${i + 1}. Next station: ${nextStation.name}<br>Approx. travel time: ${time} mins<br>`;
            currentStationId = nextStation.id;
        }
    }

    return popupContent;
}

// Function to calculate distance using the Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371000; // Radius of the Earth in meters
    var lat1Rad = lat1 * Math.PI / 180;
    var lat2Rad = lat2 * Math.PI / 180;
    var deltaLat = (lat2 - lat1) * Math.PI / 180;
    var deltaLon = (lon1 - lon2) * Math.PI / 180;

    var a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Return distance in meters
}

// Function to approximate travel time based on distance and speed
function approximateTravelTime(distance, speed) {
    if (speed <= 0) return Infinity;
    const timeInSeconds = distance / speed;
    return Math.round(timeInSeconds / 60);
}

// WebSocket connection for real-time updates and notifications
document.addEventListener('DOMContentLoaded', function () {
    const ws = new WebSocket('ws://localhost:3000');

    ws.onopen = function () {
        console.log('WebSocket connection established.');
    };

    ws.onmessage = function (event) {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        if (message.type === 'notification') {
            new Notification(`Tram ${message.tramId} Alert`, {
                body: message.message,
            });
        }
    };

    ws.onerror = function (error) {
        console.error('WebSocket error:', error);
    };

    ws.onclose = function () {
        console.log('WebSocket connection closed.');
    };
});

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
    let currentNode = stationsList.head;
    if (!currentNode) return;

    do {
        let station = currentNode.station;
        if (station.name.toLowerCase().includes(text)) {
            results += `<div class="search-result" data-station-id="${station.id}">${station.name}</div>`;
        }
        currentNode = currentNode.next;
    } while (currentNode !== stationsList.head);

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
    let currentNode = stationsList.head;
    if (!currentNode) return;

    do {
        let station = currentNode.station;
        let marker = tramMarkers[station.id];
        if (marker) {
            marker.setIcon(L.icon({
                iconUrl: 'assets/pini.png',
                iconSize: [25, 25]
            }));
        }
        currentNode = currentNode.next;
    } while (currentNode !== stationsList.head);

    // Highlight the selected station marker
    let marker = tramMarkers[stationId];
    if (marker) {
        marker.setIcon(L.icon({
            iconUrl: 'assets/blackpin.png',
            iconSize: [30, 30]
        }));
        map.panTo(marker.getLatLng());
    }
}
