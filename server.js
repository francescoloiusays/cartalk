const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle Socket connections
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Receive audio transmission from a client
    socket.on('audioMessage', (audioData) => {
        // Broadcast the audio to all OTHER connected clients
        socket.broadcast.emit('audioMessage', audioData);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Walkie-Talkie server is running on port ${PORT}`);
});
