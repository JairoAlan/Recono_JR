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

  // Conexion abierta
  socket.addEventListener('open', function () {

    // Comienza a leer el video 
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
        // Adapta el video 
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Manda una imagen al cada 42 ms
        intervalId = setInterval(() => {

          // Crea un virtual canvas para dibujar en el video/imagen actual
          const tempCanvas = document.createElement('canvas');
          const ctx = tempCanvas.getContext('2d');
          tempCanvas.width = video.videoWidth;
          tempCanvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);

          // Lo convierte a JPEG y lo manda al WebSocket
          tempCanvas.toBlob((blob) => socket.send(blob), 'image/jpeg');
        }, IMAGE_INTERVAL_MS);
      });
    });
  });

  // EL socket escucha los "mensaje"
  socket.addEventListener('message', function (event) {
    const data = JSON.parse(event.data);
    displayEmotion(video, canvas, data.emotion || 'No Emotion Detected');
  });

  // Para el video
  socket.addEventListener('close', function () {
    window.clearInterval(intervalId);
    video.pause();
  });

  return socket;
};

const enumerateDevices = () => {
  const cameraSelect = document.getElementById('camera-select');
  navigator.mediaDevices.enumerateDevices().then((devices) => {
    console.log("Available devices:", devices);
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
    } else {
      console.log("Cameras added to select element");
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

  // Pide acceso a la camara 
  navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
    // Una vez el acceso esta garantizado, enumera las camaras que contiene el dispositivo o estan conectadas
    enumerateDevices();

    // Para la transmicion si no obtiene permisos
    stream.getTracks().forEach(track => track.stop());
  }).catch((error) => {
    console.error("Error accessing camera:", error);
  });

  // Comienza la deteccion de emociones en la camara seleccionada
  document.getElementById('form-connect').addEventListener('submit', (event) => {
    event.preventDefault();

    // Cierra el socket anterior si hay uno
    if (socket) {
      socket.close();
    }

    const selectedOption = cameraSelect.selectedOptions[0];
    if (selectedOption) {
      const deviceId = selectedOption.value;
      console.log("Selected device ID:", deviceId);
      socket = startEmotionDetection(video, canvas, deviceId);
    } else {
      console.error("No camera selected");
    }
  });

});
