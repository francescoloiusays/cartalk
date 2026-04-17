// ============================================
// WalkieTalkie — Client App
// ============================================

const socket = io();

// ===== DOM Elements =====
const joinScreen   = document.getElementById('joinScreen');
const radioScreen  = document.getElementById('radioScreen');
const nicknameInput = document.getElementById('nicknameInput');
const roomInput    = document.getElementById('roomInput');
const joinBtn      = document.getElementById('joinBtn');
const leaveBtn     = document.getElementById('leaveBtn');
const channelName  = document.getElementById('channelName');
const userCount    = document.getElementById('userCount');
const connStatus   = document.getElementById('connectionStatus');
const connText     = connStatus.querySelector('.conn-text');
const pttButton    = document.getElementById('pttButton');
const waveContainer = document.getElementById('waveContainer');
const radioStatus  = document.getElementById('radioStatus');

// ===== State =====
let currentRoom = null;
let nickname = '';
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let receiveTimeout = null;

// ===== Socket Connection =====
socket.on('connect', () => {
    connStatus.classList.remove('offline');
    connText.textContent = 'Connesso';
});

socket.on('disconnect', () => {
    connStatus.classList.add('offline');
    connText.textContent = 'Offline';
});

// ===== Join Room =====
joinBtn.addEventListener('click', () => {
    const nick = nicknameInput.value.trim();
    const room = roomInput.value.trim();

    if (!nick || !room) {
        // Shake animation on empty fields
        if (!nick) shakeEl(nicknameInput);
        if (!room) shakeEl(roomInput);
        return;
    }

    nickname = nick;
    currentRoom = room;

    socket.emit('joinRoom', currentRoom);
});

// Allow Enter to join
[nicknameInput, roomInput].forEach(input => {
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinBtn.click();
    });
});

socket.on('roomJoined', ({ roomCode, userCount: count }) => {
    channelName.textContent = roomCode;
    userCount.textContent = count;
    switchScreen('radio');
});

socket.on('userJoined', ({ userCount: count }) => {
    userCount.textContent = count;
});

socket.on('userLeft', ({ userCount: count }) => {
    userCount.textContent = count;
});

// ===== Leave Room =====
leaveBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    currentRoom = null;
    switchScreen('join');
    // The socket stays connected, user just leaves the room
    location.reload(); // simplest way to reset state
});

// ===== Screen Switching =====
function switchScreen(targetId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (targetId === 'radio') {
        radioScreen.classList.add('active');
    } else {
        joinScreen.classList.add('active');
    }
}

// ===== Audio Init =====
async function initAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Check for supported mimeType
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/mp4';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // let the browser choose
        }

        const options = mimeType ? { mimeType } : {};
        mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                audioChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            if (audioChunks.length === 0) return;

            const mType = mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunks, { type: mType });
            audioChunks = [];

            if (currentRoom) {
                // Convert blob to ArrayBuffer for Socket.IO
                audioBlob.arrayBuffer().then(buffer => {
                    socket.emit('audioData', {
                        roomCode: currentRoom,
                        audio: buffer
                    });
                });
            }

            // Reset UI
            isRecording = false;
            waveContainer.classList.remove('transmitting');
            radioStatus.textContent = 'Tieni premuto per parlare';
            radioStatus.className = 'radio-status';
            pttButton.classList.remove('active');
            socket.emit('pttState', { roomCode: currentRoom, active: false });
        };

        return true;
    } catch (err) {
        console.error('Microphone access error:', err);
        radioStatus.textContent = '⚠ Microfono non disponibile';
        radioStatus.style.color = '#ef4444';
        return false;
    }
}

// ===== PTT Logic =====
async function startPTT(e) {
    if (e && e.cancelable) e.preventDefault();
    if (isRecording) return;

    if (!mediaRecorder) {
        const ok = await initAudio();
        if (!ok) return;
    }

    if (mediaRecorder.state === 'inactive') {
        isRecording = true;
        audioChunks = [];
        // Record in small chunks for potential streaming later
        mediaRecorder.start(200);

        pttButton.classList.add('active');
        waveContainer.classList.remove('receiving');
        waveContainer.classList.add('transmitting');
        radioStatus.textContent = '🔴 Trasmissione in corso...';
        radioStatus.className = 'radio-status tx';

        socket.emit('pttState', { roomCode: currentRoom, active: true });
    }
}

function stopPTT(e) {
    if (e && e.cancelable) e.preventDefault();
    if (!isRecording) return;

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
}

// Event listeners — mouse + touch
pttButton.addEventListener('mousedown', startPTT);
pttButton.addEventListener('mouseup', stopPTT);
pttButton.addEventListener('mouseleave', stopPTT);

pttButton.addEventListener('touchstart', startPTT, { passive: false });
pttButton.addEventListener('touchend', stopPTT, { passive: false });
pttButton.addEventListener('touchcancel', stopPTT, { passive: false });

// Prevent context menu on long press (mobile)
pttButton.addEventListener('contextmenu', (e) => e.preventDefault());

// ===== Receive Audio =====
socket.on('audioData', ({ userId, audio }) => {
    clearTimeout(receiveTimeout);

    waveContainer.classList.remove('transmitting');
    waveContainer.classList.add('receiving');
    radioStatus.textContent = '🔵 Ricezione audio...';
    radioStatus.className = 'radio-status rx';

    const mimeType = 'audio/webm;codecs=opus';
    const blob = new Blob([audio], {
        type: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'audio/webm'
    });
    const url = URL.createObjectURL(blob);
    const player = new Audio(url);

    player.onended = () => {
        URL.revokeObjectURL(url);
    };

    player.play().catch(err => {
        console.warn('Playback issue:', err);
    });

    // Reset UI after a short delay
    receiveTimeout = setTimeout(() => {
        if (!isRecording) {
            waveContainer.classList.remove('receiving');
            radioStatus.textContent = 'Tieni premuto per parlare';
            radioStatus.className = 'radio-status';
        }
    }, 1500);
});

// PTT state from others (visual feedback)
socket.on('pttState', ({ userId, active }) => {
    if (active && !isRecording) {
        waveContainer.classList.add('receiving');
        radioStatus.textContent = '🔵 Qualcuno sta parlando...';
        radioStatus.className = 'radio-status rx';
    } else if (!active && !isRecording) {
        clearTimeout(receiveTimeout);
        receiveTimeout = setTimeout(() => {
            if (!isRecording) {
                waveContainer.classList.remove('receiving');
                radioStatus.textContent = 'Tieni premuto per parlare';
                radioStatus.className = 'radio-status';
            }
        }, 500);
    }
});

// ===== Helpers =====
function shakeEl(el) {
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = 'shake 0.4s ease';
    setTimeout(() => { el.style.animation = ''; }, 400);
}

// Add shake keyframes dynamically
const style = document.createElement('style');
style.textContent = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-6px); }
    40%, 80% { transform: translateX(6px); }
}`;
document.head.appendChild(style);
