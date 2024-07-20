import asyncio
import pickle
from typing import List, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from utils import get_face_landmarks  # Importa la función de utilidades para obtener los puntos faciales

# Inicializar FastAPI
app = FastAPI()

# Montar archivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

# Cargar el modelo de emociones
with open('./model', 'rb') as f:
    model = pickle.load(f)

# Lista de emociones
emotions = ["Feliz", "Triste", "Sorprendido"]

class Faces(BaseModel):
    faces: List[Tuple[int, int, int, int]]

async def receive(websocket: WebSocket, queue: asyncio.Queue):
    bytes = await websocket.receive_bytes()
    try:
        queue.put_nowait(bytes)
    except asyncio.QueueFull:
        pass

async def detect(websocket: WebSocket, queue: asyncio.Queue):
    while True:
        bytes = await queue.get()
        data = np.frombuffer(bytes, dtype=np.uint8)
        img = cv2.imdecode(data, 1)
        face_landmarks = get_face_landmarks(img, draw=False, static_image_mode=False)
        
        if face_landmarks:
            output = model.predict([face_landmarks])
            emotion = emotions[int(output[0])]
            faces_output = {"emotion": emotion}
        else:
            faces_output = {"emotion": None}
        
        await websocket.send_json(faces_output)

@app.websocket("/emotion-detection")
async def emotion_detection(websocket: WebSocket):
    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue(maxsize=10)
    detect_task = asyncio.create_task(detect(websocket, queue))
    try:
        while True:
            await receive(websocket, queue)
    except WebSocketDisconnect:
        detect_task.cancel()
        await websocket.close()

@app.get("/")
async def read_index():
    return FileResponse('static/index.html')
