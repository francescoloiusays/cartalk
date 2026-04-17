const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    maxHttpBufferSize: 1e7 // 10 MB for audio chunks
});

// Serve static files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Track rooms: { roomCode: Set<socketId> }
const rooms = {};

io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    // Join a room
    socket.on('joinRoom', (roomCode) => {
        // Leave previous rooms first
        for (const r of socket.rooms) {
            if (r !== socket.id) socket.leave(r);
        }

        socket.join(roomCode);
        if (!rooms[roomCode]) rooms[roomCode] = new Set();
        rooms[roomCode].add(socket.id);

        const count = rooms[roomCode].size;
        console.log(`[*] ${socket.id} joined room "${roomCode}" (${count} users)`);

        // Notify the joiner
        socket.emit('roomJoined', { roomCode, userCount: count });

        // Notify others in the room
        socket.to(roomCode).emit('userJoined', { userId: socket.id, userCount: count });
    });

    // Relay audio data to everyone else in the same room
    socket.on('audioData', ({ roomCode, audio }) => {
        socket.to(roomCode).emit('audioData', { userId: socket.id, audio });
    });

    // PTT state broadcast
    socket.on('pttState', ({ roomCode, active }) => {
        socket.to(roomCode).emit('pttState', { userId: socket.id, active });
    });

    socket.on('disconnect', () => {
        console.log(`[-] Disconnected: ${socket.id}`);
        // Clean up rooms
        for (const [code, members] of Object.entries(rooms)) {
            if (members.has(socket.id)) {
                members.delete(socket.id);
                const count = members.size;
                io.to(code).emit('userLeft', { userId: socket.id, userCount: count });
                if (count === 0) delete rooms[code];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎙️  WalkieTalkie server running on port ${PORT}`);
});
