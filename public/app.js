const socket = io();

const statusDiv = document.getElementById('status');
const statusText = statusDiv.querySelector('.text');
const pttButton = document.getElementById('pttButton');
const logs = document.getElementById('logs');

let mediaRecorder;
let audioChunks = [];

// UI Status Handlers
socket.on('connect', () => {
    statusDiv.className = 'status-indicator connected';
    statusText.textContent = 'Connected';
});

socket.on('disconnect', () => {
    statusDiv.className = 'status-indicator error';
    statusText.textContent = 'Offline';
});

// Setup MediaStream
async function initAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            // Send the entire recorded Blob to the server
            socket.emit('audioStream', audioBlob);
            audioChunks = [];
        };

        return true;
    } catch (err) {
        console.error('Error accessing microphone:', err);
        logs.innerHTML = '<p style="color: #da3633">Mic access denied.</p>';
        return false;
    }
}

// Receive and play audio from others
socket.on('audioStream', async (arrayBuffer) => {
    logs.className = 'logs receiving';
    logs.innerHTML = '<p>Receiving audio...</p>';

    const blob = new Blob([arrayBuffer], { type: 'audio/webm' });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);

    audio.onended = () => {
        URL.revokeObjectURL(audioUrl); // Clean up
        if (!pttButton.classList.contains('active')) {
            logs.className = 'logs';
            logs.innerHTML = '<p>Press and hold to speak.</p>';
        }
    };

    try {
        await audio.play();
    } catch (err) {
        console.error("Playback failed", err);
    }
});

// PTT Handling
async function startRecording(e) {
    if (e && e.cancelable) e.preventDefault();
    if (!mediaRecorder) {
        const ready = await initAudio();
        if (!ready) return;
    }

    if (mediaRecorder.state === 'inactive') {
        audioChunks = [];
        mediaRecorder.start();
        pttButton.classList.add('active');
        logs.innerHTML = '<p>Transmitting...</p>';
    }
}

function stopRecording(e) {
    if (e && e.cancelable) e.preventDefault();
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        pttButton.classList.remove('active');
        logs.innerHTML = '<p>Press and hold to speak.</p>';
    }
}

// Event Listeners for both Mouse and Touch
pttButton.addEventListener('mousedown', startRecording);
pttButton.addEventListener('mouseup', stopRecording);
pttButton.addEventListener('mouseleave', stopRecording);

pttButton.addEventListener('touchstart', startRecording, { passive: false });
pttButton.addEventListener('touchend', stopRecording, { passive: false });
pttButton.addEventListener('touchcancel', stopRecording, { passive: false });
