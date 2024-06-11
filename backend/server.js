const express = require('express');
const cors = require('cors');
const pool = require('./db'); 
const axios = require('axios');
const WebSocket = require('ws');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const wss = new WebSocket.Server({ noServer: true });

let tramLastPositions = {}; // Store the last known position and timestamp for each tram

// Periodically check for stationary trams
setInterval(checkStationaryTrams, 60000); // Check every minute

async function checkStationaryTrams() {
    try {
        const { rows: tramPositions } = await pool.query('SELECT tram_id, latitude, longitude, timestamp FROM tram_positions');

        const currentTime = new Date();
        const stationaryThreshold = 0.5 * 60 * 4000; // 4 minutes in milliseconds

        tramPositions.forEach(tram => {
            const tramId = tram.tram_id;
            const currentPosition = { lat: tram.latitude, lng: tram.longitude };

            if (!tramLastPositions[tramId]) {
                // Initialize last known position and timestamp
                tramLastPositions[tramId] = { position: currentPosition, timestamp: new Date(tram.timestamp).getTime() };
            } else {
                const lastPosition = tramLastPositions[tramId].position;
                const lastTimestamp = tramLastPositions[tramId].timestamp;

                if (lastPosition.lat === currentPosition.lat && lastPosition.lng === currentPosition.lng) {
                    // Check if the tram has been stationary for too long
                    if ((currentTime.getTime() - lastTimestamp) > stationaryThreshold) {
                        sendNotification(tramId);
                    }
                } else {
                    // Update the last known position and timestamp
                    tramLastPositions[tramId] = { position: currentPosition, timestamp: currentTime.getTime() };
                }
            }
        });
    } catch (err) {
        console.error('Error checking stationary trams:', err);
    }
}

function sendNotification(tramId) {
    const message = JSON.stringify({
        type: 'notification',
        tramId: tramId,
        message: `Tram ${tramId} has been stationary for a while. Accident occurred probably.`,
        highlight: true
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

app.post('/api/gps', async (req, res) => {
    const { tramId, lat, lng, speed } = req.body;
    console.log('Received data:', req.body); // Log the received data to the console
    try {
        const query = `
            INSERT INTO tram_positions (tram_id, latitude, longitude, speed, timestamp)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (tram_id)
            DO UPDATE SET
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                speed = EXCLUDED.speed,
                timestamp = EXCLUDED.timestamp
        `;
        await pool.query(query, [tramId, lat, lng, speed]);
        res.status(200).send('GPS data received and stored successfully.');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

app.get('/api/stations', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM stations ORDER BY id');
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

app.get('/api/nextStations/:stationId', async (req, res) => {
    try {
        const currentStationId = parseInt(req.params.stationId);
        const { rows } = await pool.query('SELECT * FROM stations ORDER BY id');
        const currentStationIndex = rows.findIndex(station => station.id === currentStationId);
        if (currentStationIndex === -1) return res.status(404).send('Station not found');

        let nextStations = [];

        for (let i = 1; i <= 5; i++) {
            let nextStationIndex = (currentStationIndex + i) % rows.length;
            nextStations.push(rows[nextStationIndex]);
        }

        res.json(nextStations);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

app.get('/api/tramPositions', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT tram_id, latitude AS lat, longitude AS lng, speed
            FROM tram_positions
        `);

        if (!rows.length) {
            console.log('No tram positions found');
            return res.status(404).send('No tram positions found');
        }

        const tramPositions = rows.reduce((acc, row) => {
            if (row.lat !== null && row.lng !== null) {
                acc[row.tram_id] = { lat: row.lat, lng: row.lng, speed: row.speed };
            } else {
                console.error(`Invalid coordinates for tram_id ${row.tram_id}: lat ${row.lat}, lng ${row.lng}`);
            }
            return acc;
        }, {});

        res.json(tramPositions);
    } catch (err) {
        console.error('Error fetching tram positions:', err);
        res.status(500).send('Server error');
    }
});

const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, socket => {
        wss.emit('connection', socket, request);
    });
});
