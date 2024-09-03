require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const pool = require('./db'); 
const axios = require('axios');
const WebSocket = require('ws');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const wss = new WebSocket.Server({ noServer: true });

let tramLastPositions = {};

app.get('/api/nextStations/:tramId', async (req, res) => {
    try {
        const tramId = req.params.tramId;
        const tramQuery = await pool.query('SELECT latitude, longitude, speed FROM tram_positions WHERE tram_id = $1', [tramId]);
        const tram = tramQuery.rows[0];

        if (!tram) {
            console.error(`Tram ${tramId} not found.`);
            return res.status(404).send('Tram not found');
        }

        const stationQuery = await pool.query('SELECT * FROM stations ORDER BY id');
        const stations = stationQuery.rows;

        let currentStationIndex = findCurrentStationIndex(tram, stations);

        if (currentStationIndex === -1) {
            console.error('No current station found.');
            return res.status(404).send('No current station found');
        }

        let nextStations = getNextStationsById(currentStationIndex, stations);

        let stationsWithApproxTime = nextStations.map(station => {
            const distance = getDistance(tram.latitude, tram.longitude, station.latitude, station.longitude);
            const approxTime = calculateApproxTime(distance, tram.speed || 10); // Default speed if not provided
            return { ...station, approxTime, speed: tram.speed || 10 };
        });

        res.json(stationsWithApproxTime);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


function findCurrentStationIndex(tram, stations) {
    let currentStationIndex = -1;
    let minDistance = Number.MAX_VALUE;

    stations.forEach((station, index) => {
        const distance = getDistance(tram.latitude, tram.longitude, station.latitude, station.longitude);
        if (distance < minDistance) {
            minDistance = distance;
            currentStationIndex = index;
        }
    });

    return currentStationIndex;
}

function getNextStationsById(currentStationIndex, stations) {
    let nextStations = [];
    for (let i = 1; i <= 5; i++) {
        let nextStationIndex = (currentStationIndex + i) % stations.length;
        nextStations.push(stations[nextStationIndex]);
    }
    return nextStations;
}


function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; 
    return distance;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

setInterval(checkStationaryTrams, 60000); 

async function checkStationaryTrams() {
    try {
        const { rows: tramPositions } = await pool.query('SELECT tram_id, latitude, longitude, timestamp FROM tram_positions');

        const currentTime = new Date();
        const stationaryThreshold = 4 * 60 * 1000; //4 minutes

        tramPositions.forEach(tram => {
            const tramId = tram.tram_id;
            const currentPosition = { lat: tram.latitude, lng: tram.longitude };

            if (!tramLastPositions[tramId]) {
                tramLastPositions[tramId] = { position: currentPosition, timestamp: new Date(tram.timestamp).getTime() };
            } else {
                const lastPosition = tramLastPositions[tramId].position;
                const lastTimestamp = tramLastPositions[tramId].timestamp;

                if (lastPosition.lat === currentPosition.lat && lastPosition.lng === currentPosition.lng) {
                    if ((currentTime.getTime() - lastTimestamp) > stationaryThreshold) {
                        sendNotification(tramId);
                    }
                } else {
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




app.post('/report-bug', async (req, res) => {
    console.log('POST /report-bug endpoint hit');
    
    const { title, description } = req.body;

    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER, 
            pass: process.env.EMAIL_PASS  
        }
    });

    let mailOptions = {
        from: `"Bug Report" <${process.env.EMAIL_USER}>`, 
        to: process.env.EMAIL_USER, 
        subject: `Bug Report: ${title}`,
        text: `Title: ${title}\n\nDescription:\n${description}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error occurred while sending email:', error);
            return res.status(500).send('Failed to send email');
        }
        console.log('Message sent:', info.messageId);
        
    });
});


function calculateApproxTime(distance, speed) {}
const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, socket => {
        wss.emit('connection', socket, request);
    });
});
