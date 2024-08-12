const IMAGE_INTERVAL_MS = 42;

const displayEmotion = (video, canvas, emotion) => {
  const ctx = canvas.getContext('2d');
  ctx.width = video.videoWidth;
  ctx.height = video.videoHeight;
  ctx.beginPath();
  ctx.clearRect(0, 0, ctx.width, ctx.height);
  ctx.font = "30px Arial";
  ctx.fillStyle = "red";
  ctx.fillText(emotion, 10, 50);
};

const startEmotionDetection = (video, canvas, deviceId) => {
  const socket = new WebSocket('ws://localhost:8000/emotion-detection');
  let intervalId;

  socket.addEventListener('open', function () {
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId,
        width: { max: 640 },
        height: { max: 480 },
      },
    }).then(function (stream) {
      video.srcObject = stream;
      video.play().then(() => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        intervalId = setInterval(() => {
          const tempCanvas = document.createElement('canvas');
          const ctx = tempCanvas.getContext('2d');
          tempCanvas.width = video.videoWidth;
          tempCanvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          tempCanvas.toBlob((blob) => socket.send(blob), 'image/jpeg');
        }, IMAGE_INTERVAL_MS);
      });
    });
  });

  socket.addEventListener('message', function (event) {
    const data = JSON.parse(event.data);
    displayEmotion(video, canvas, data.emotion || 'No Emotion Detected');
  });

  socket.addEventListener('close', function () {
    window.clearInterval(intervalId);
    video.pause();
  });

  return socket;
};

const enumerateDevices = () => {
  const cameraSelect = document.getElementById('camera-select');
  navigator.mediaDevices.enumerateDevices().then((devices) => {
    for (const device of devices) {
      if (device.kind === 'videoinput' && device.deviceId) {
        const deviceOption = document.createElement('option');
        deviceOption.value = device.deviceId;
        deviceOption.innerText = device.label || `Camera ${cameraSelect.length + 1}`;
        cameraSelect.appendChild(deviceOption);
      }
    }
    if (cameraSelect.length === 0) {
      console.error("No cameras found");
    }
  }).catch((error) => {
    console.error("Error enumerating devices:", error);
  });
};

window.addEventListener('DOMContentLoaded', (event) => {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const cameraSelect = document.getElementById('camera-select');
  let socket;

  const formRegister = document.getElementById('form-register');
  formRegister.addEventListener('submit', (event) => {
    event.preventDefault();
    const clientName = document.getElementById('client-name').value;
    fetch('http://localhost:8000/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: clientName }),
    })
      .then(response => response.json())
      .then(data => {
        if (data.message === 'Client registered') {
          formRegister.style.display = 'none';
          document.getElementById('form-connect').style.display = 'block';
          // Habilita el botón de descarga
          document.getElementById('button-download').style.display = 'block';
        }
      })
      .catch(error => console.error('Error registering client:', error));
  });

  navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
    enumerateDevices();
    stream.getTracks().forEach(track => track.stop());
  }).catch((error) => {
    console.error("Error accessing camera:", error);
  });

  document.getElementById('form-connect').addEventListener('submit', (event) => {
    event.preventDefault();
    if (socket) {
      socket.close();
    }
    const selectedOption = cameraSelect.selectedOptions[0];
    if (selectedOption) {
      const deviceId = selectedOption.value;
      socket = startEmotionDetection(video, canvas, deviceId);
    } else {
      console.error("No camera selected");
    }
  });

  const stopEmotionDetection = () => {
    if (socket) {
      fetch('http://localhost:8000/stop-detection', {
        method: 'POST'
      }).then(response => {
        if (response.ok) {
          socket.close();
          console.log("Detection stopped");
          // Muestra el botón de descarga después de detener la detección
          document.getElementById('button-download').style.display = 'block';
          // Reinicia la página después de detener la detección
          window.location.reload();
        }
      }).catch(error => {
        console.error("Error stopping detection:", error);
      });
    }
  }

  document.getElementById('button-stop').addEventListener('click', (event) => {
    stopEmotionDetection();
  });

  document.getElementById('button-download').addEventListener('click', (event) => {
    fetch('http://localhost:8000/emotions-csv')
      .then(response => response.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'emotions.csv';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(error => console.error('Error downloading CSV:', error));
  });
});
