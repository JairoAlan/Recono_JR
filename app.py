import asyncio
import csv
import pickle
from typing import List, Tuple
import time
import logging

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from utils import get_face_landmarks

# Configuración del logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Definir el modelo para el nombre del cliente
class ClientName(BaseModel):
    name: str

# Inicializar FastAPI
app = FastAPI()

# Permitir CORS para permitir peticiones desde el frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montar archivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

# Cargar el modelo de emociones
with open('./model', 'rb') as f:
    model = pickle.load(f)

# Lista de emociones
emotions = ["Feliz", "Enojado", "Sorprendido"]

client_name = None
last_record_time = 0  # Variable para rastrear el último registro
detecting = False  # Variable para controlar la detección

# Ruta para registrar el nombre del cliente
@app.post("/register")
async def register_client(client: ClientName):
    global client_name
    client_name = client.name
    return {"message": "Client registered", "name": client_name}

class Faces(BaseModel):
    faces: List[Tuple[int, int, int, int]]

async def receive(websocket: WebSocket, queue: asyncio.Queue):
    bytes = await websocket.receive_bytes()
    try:
        queue.put_nowait(bytes)
    except asyncio.QueueFull:
        pass

async def detect(websocket: WebSocket, queue: asyncio.Queue):
    global last_record_time, detecting
    while detecting:
        bytes = await queue.get()
        logger.info('Received image data')
        data = np.frombuffer(bytes, dtype=np.uint8)
        img = cv2.imdecode(data, 1)
        face_landmarks = get_face_landmarks(img, draw=False, static_image_mode=False)
        
        if face_landmarks:
            output = model.predict([face_landmarks])
            emotion = emotions[int(output[0])]
            faces_output = {"emotion": emotion}
            logger.info('Detected emotion: %s', emotion)
            
            # Obtener el tiempo actual
            current_time = time.time()
            
            # Registrar la emoción si han pasado al menos 0.5 segundos desde el último registro
            if client_name and (current_time - last_record_time) >= 0.5:
                with open('emotions.csv', mode='a', newline='') as file:
                    writer = csv.writer(file)
                    writer.writerow([client_name, emotion])
                last_record_time = current_time
        else:
            faces_output = {"emotion": None}
        
        await websocket.send_json(faces_output)

@app.websocket("/emotion-detection")
async def emotion_detection(websocket: WebSocket):
    global detecting
    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue(maxsize=10)
    detecting = True
    detect_task = asyncio.create_task(detect(websocket, queue))
    try:
        while True:
            await receive(websocket, queue)
    except WebSocketDisconnect:
        detect_task.cancel()
        await websocket.close()
    finally:
        detecting = False
        global client_name
        client_name = None

@app.get("/")
async def read_index():
    return FileResponse('static/index.html')

@app.post("/stop-detection")
async def stop_detection():
    global detecting
    detecting = False
    return {"message": "Detection stopped"}
