const socket = io();

const pttButton = document.getElementById('pttButton');
const pttContainer = document.querySelector('.ptt-container');
const statusBadge = document.getElementById('status');
const feedbackText = document.getElementById('feedback');

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Socket connection feedback
socket.on('connect', () => {
    statusBadge.textContent = 'Ready';
    statusBadge.classList.remove('offline');
    statusBadge.classList.add('online');
});

socket.on('disconnect', () => {
    statusBadge.textContent = 'Disconnected';
    statusBadge.classList.remove('online');
    statusBadge.classList.add('offline');
});

// Setup microphone natively dynamically to deal with permission rules in browsers
async function initAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream); // Usually defaults to webm or ogg depending on browser

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            audioChunks = [];
            
            // Send audio blob over socket
            socket.emit('audioMessage', audioBlob);
        };
        
        return true;
    } catch (err) {
        console.error("Microphone Error:", err);
        alert("E' necessario accettare i permessi del microfono per usare il Walkie-Talkie.");
        return false;
    }
}

// Logic for starting recording
function startRecording(e) {
    if (e && e.cancelable) e.preventDefault(); // Stop default behaviours (scrolling etc)
    
    // First interaction will initialize audio if not done yet
    if (!mediaRecorder) {
        initAudio().then(success => {
            if (success) executeStartRecording();
        });
    } else {
        executeStartRecording();
    }
}

function executeStartRecording() {
    if (mediaRecorder && mediaRecorder.state === "inactive") {
        isRecording = true;
        audioChunks = [];
        mediaRecorder.start();
        
        pttButton.classList.add('active');
        pttContainer.classList.add('recording');
        feedbackText.classList.add('show');
    }
}

// Logic for stopping recording
function stopRecording(e) {
    if (e && e.cancelable) e.preventDefault();
    
    if (isRecording && mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        isRecording = false;
        
        pttButton.classList.remove('active');
        pttContainer.classList.remove('recording');
        feedbackText.classList.remove('show');
    }
}

// Attach Touch Events (Mobile)
pttButton.addEventListener('touchstart', startRecording, { passive: false });
pttButton.addEventListener('touchend', stopRecording, { passive: false });
pttButton.addEventListener('touchcancel', stopRecording, { passive: false });

// Attach Mouse Events (Desktop testing)
pttButton.addEventListener('mousedown', startRecording);
pttButton.addEventListener('mouseup', stopRecording);
pttButton.addEventListener('mouseleave', stopRecording); // If user drags out of button

/* Audio Player logic */
const audioQueue = [];
let isPlaying = false;

// When an audio message is received over WebSockets
socket.on('audioMessage', async (blobData) => {
    // Convert ArrayBuffer back to Blob
    const blob = new Blob([blobData]); 
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    
    // Clean up when finished playing chunks
    audio.onended = () => {
        pttButton.classList.remove('receiving');
        isPlaying = false;
        URL.revokeObjectURL(audioUrl); // free memory
        playNextInQueue();
    };

    audioQueue.push(audio);
    playNextInQueue();
});

function playNextInQueue() {
    if (isPlaying || audioQueue.length === 0) return;
    
    isPlaying = true;
    const nextAudio = audioQueue.shift();
    
    pttButton.classList.add('receiving'); // Visual effect
    
    nextAudio.play().catch(e => {
        console.error("Playback error. Browsers auto-play policy might block this:", e);
        isPlaying = false;
        pttButton.classList.remove('receiving');
        playNextInQueue();
    });
}
