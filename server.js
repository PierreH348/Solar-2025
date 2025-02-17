const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html by default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let devices = [];
const savedDevicesFile = path.join(__dirname, 'saved-devices.json');

// Load saved devices from file
function loadSavedDevices() {
    if (fs.existsSync(savedDevicesFile)) {
        const data = fs.readFileSync(savedDevicesFile);
        return JSON.parse(data);
    }
    return [];
}

let savedDevices = loadSavedDevices();

// Save devices to file
function saveDevicesToFile() {
    fs.writeFileSync(savedDevicesFile, JSON.stringify(savedDevices, null, 2));
}

// Endpoint to get discovered devices
app.get('/devices', (req, res) => {
    res.json(devices);
});

// Endpoint to get saved devices
app.get('/saved-devices', (req, res) => {
    res.json(savedDevices);
});

// Endpoint to add a new device
app.post('/devices', (req, res) => {
    const device = req.body;
    if (!savedDevices.some(d => d.id === device.id)) {
        savedDevices.push(device);
        saveDevicesToFile();
        res.send('Device added successfully');
    } else {
        res.status(400).send('Device already exists');
    }
});

// Endpoint to remove a saved device
app.delete('/devices/:id', (req, res) => {
    const deviceId = req.params.id;
    savedDevices = savedDevices.filter(d => d.id !== deviceId);
    saveDevicesToFile();
    res.send('Device removed successfully');
});

// WebSocket connection
wss.on('connection', ws => {
    console.log('WebSocket connection established');

    ws.on('message', message => {
        console.log('Received:', message);
        const data = JSON.parse(message);

        // Handle device status and error reporting
        if (data.type === 'status') {
            const device = savedDevices.find(d => d.id === data.device);
            if (device) {
                device.status = data.status;
                saveDevicesToFile();
            }
        }

        // Broadcast the message to all connected clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });

        // Forward command to ESP8266
        if (data.command) {
            forwardCommandToESP(data.command);
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});

// Function to forward command to ESP8266
function forwardCommandToESP(command) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ command }));
        }
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
