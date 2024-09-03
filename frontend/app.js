var map = L.map('mapid').setView([43.8563, 18.4131], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const tramIcon = L.icon({
    iconUrl: 'assets/tram-icon.png',
    iconSize: [25, 25],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
});

const stationIcon = L.icon({
    iconUrl: 'assets/pini.png',
    iconSize: [25, 25],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
});

const highlightIcon = L.icon({
    iconUrl: 'assets/blackpin.png',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
});

const stationaryTramIcon = L.icon({
    iconUrl: 'assets/tramacc.png',
    iconSize: [40, 40],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
});

let tramMarkers = {};
let stationMarkers = [];
let highlightedMarker = null;
let tramStationsData = {};

function initWebSocket() {
    const ws = new WebSocket('ws://localhost:3000');

    ws.onopen = function() {
        console.log('WebSocket connection established.');
    };

    ws.onmessage = function(event) {
        const message = JSON.parse(event.data);
        if (message.type === 'notification') {
            new Notification(`Marked Tram ${message.tramId} Alert`, {
                body: message.message,
            });
            if (message.highlight) {
                highlightTramMarker(message.tramId);
            }
        }
    };

    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };

    ws.onclose = function() {
        console.log('WebSocket connection closed.');

        setTimeout(initWebSocket, 1000);
    };

    //highlight tram marker
    function highlightTramMarker(tramId) {
        const tramMarker = tramMarkers[tramId];
        if (tramMarker) {
            tramMarker.setIcon(stationaryTramIcon);
        }
    }

}

//highlight station
function highlightStation(marker, name) {
    if (highlightedMarker) {
        highlightedMarker.setIcon(stationIcon);
    }
    marker.setIcon(highlightIcon);
    highlightedMarker = marker;
    map.setView(marker.getLatLng(), 15);
    marker.bindPopup(`Station: ${name}`);
}

//search input
document.getElementById('search-input').addEventListener('input', function () {
    const query = this.value.toLowerCase();
    const results = stationMarkers.filter(item => item.name.toLowerCase().includes(query));
    const resultsContainer = document.getElementById('search-results');

    resultsContainer.innerHTML = '';
    results.forEach(item => {
        const div = document.createElement('div');
        div.classList.add('search-result');
        div.textContent = item.name;
        div.onclick = () => {
            highlightStation(item.marker, item.name);
            resultsContainer.innerHTML = '';
            document.getElementById('search-input').value = '';
        };
        resultsContainer.appendChild(div);
    });
});

//display all stations in the search results
function displayAllStations(stations) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';
    stations.forEach(station => {
        const div = document.createElement('div');
        div.classList.add('search-result');
        div.textContent = station.name;
        div.onclick = () => {
            const marker = stationMarkers.find(item => item.id === station.id).marker;
            highlightStation(marker, station.name);
            resultsContainer.innerHTML = '';
            document.getElementById('search-input').value = '';
        };
        resultsContainer.appendChild(div);
    });
}

//load tram data and update markers
async function loadTramData() {
    try {
        const response = await fetch('http://localhost:3000/api/tramPositions');
        const data = await response.json();

        // Update tram markers
        for (let tramId in data) {
            const tram = data[tramId];
            const newLatLng = L.latLng(tram.lat, tram.lng); 

            if (tramMarkers[tramId]) {
                const marker = tramMarkers[tramId];
                const oldLatLng = marker.getLatLng();
                marker.setLatLng(newLatLng);

                if (tramStationsData[tramId]) {
                    updateNextStations(tramId, oldLatLng, newLatLng);
                }
            } else {
                const marker = L.marker([tram.lat, tram.lng], { icon: tramIcon }).addTo(map)
                    .on('click', () => {
                        showTramInfo(tramId);
                    });
                tramMarkers[tramId] = marker;

                //next 5 stations
                await showTramInfo(tramId);
            }
        }
    } catch (error) {
        console.error('Error loading tram data:', error);
    }
}

//load station data and create markers
async function loadStationData() {
    try {
        const response = await fetch('http://localhost:3000/api/stations');
        const data = await response.json();

        data.forEach(station => {
            const marker = L.marker([station.latitude, station.longitude], { icon: stationIcon }).addTo(map)
                .bindPopup(`Station: ${station.name}`)
                .on('click', () => highlightStation(marker, station.name));
            stationMarkers.push({ marker: marker, name: station.name, id: station.id });
        });

        //search results when search bar is clicked
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('focus', () => displayAllStations(data));
        }
    } catch (error) {
        console.error('Error loading station data:', error);
    }
}

//show tram info on marker click
async function showTramInfo(tramId) {
    try {
        const response = await fetch(`http://localhost:3000/api/nextStations/${tramId}`);
        const data = await response.json();

        tramStationsData[tramId] = data;

        updateTramPopup(tramId);
    } catch (error) {
        console.error('Error fetching tram info:', error);
    }
}

//update tram popup with next 5 stations and approximate times
function updateTramPopup(tramId) {
    const tram = tramMarkers[tramId].getLatLng();
    const stations = tramStationsData[tramId];
    
    let info = `<strong>Tram: ${tramId}</strong><br><br><strong>Next 5 Stations:</strong><br>`;
    stations.forEach(station => {
        const distance = map.distance(tram, L.latLng(station.latitude, station.longitude)) / 1000; // in km
        const time = calculateApproxTime(distance, station.speed || 10); //speed if not provided
        info += `${station.name} (approx. ${time})<br>`;
    });

    tramMarkers[tramId].bindPopup(info);
}

//calculate approximate time in minutes and seconds
function calculateApproxTime(distance, speed) {
    if (isNaN(distance) || isNaN(speed) || speed <= 0) return '0 mins';
    const timeInMinutes = (distance / speed) * 60; // time in minutes
    const minutes = Math.floor(timeInMinutes);
    const seconds = Math.round((timeInMinutes - minutes) * 60);
    return `${minutes} mins ${seconds} secs`;
}

//update next 5 stations based on tram position
function updateNextStations(tramId, oldLatLng, newLatLng) {
    const stations = tramStationsData[tramId];
    if (stations && stations.length > 0) {
        const currentStation = stations[0];
        const currentStationLatLng = L.latLng(currentStation.latitude, currentStation.longitude);

        const oldDistance = oldLatLng.distanceTo(currentStationLatLng);
        const newDistance = newLatLng.distanceTo(currentStationLatLng);

        if (newDistance > oldDistance) {
            // Tram has passed the current station, update next 5 stations
            showTramInfo(tramId);
        } else {
            updateTramPopup(tramId);
        }
    }
}

//hide search results when clicking outside of them
document.addEventListener('click', function (event) {
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    if (searchInput && searchResults) {
        const isClickInside = searchInput.contains(event.target) || searchResults.contains(event.target);
        if (!isClickInside) {
            searchResults.innerHTML = '';
        }
    }
});

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
    initWebSocket();
    loadStationData();
    loadTramData();
    setInterval(loadTramData, 3000); 
});
