# Acoustic Localization System

Türkiye haritası üzerinde ESP32-S3 mikrofon düğümleri ve akustik kaynak konumlandırma dashboard'u.

## Yerel çalıştırma

```powershell
cd backend
py -m pip install -r requirements.txt
py app.py
```

Tarayıcıda açın: **http://127.0.0.1:5000**

## Render deploy

1. Projeyi GitHub'a yükleyin
2. Render → **New** → **Blueprint** veya **Web Service**
3. Repo'yu bağlayın, **Root Directory:** `backend`
4. **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT`

Canlı URL: `https://<servis-adiniz>.onrender.com`
