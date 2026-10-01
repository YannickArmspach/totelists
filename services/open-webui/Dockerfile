# Open WebUI, the authenticated gateway in front of Ollama: per-user API keys
# for /ollama/api/chat (triage) and /api/v1/audio/transcriptions (built-in
# faster-whisper STT). Deployed by the Temps `tote-ai` project via
# docker-compose.ai.yml at the repository root.
FROM ghcr.io/open-webui/open-webui:v0.11.4

# Pre-download the faster-whisper model into the path the app reads
# (WHISPER_MODEL_DIR default). The named volume mounted over
# /app/backend/data is seeded from the image on first creation, so the
# first transcription doesn't block on a ~460 MB download.
RUN python -c "from faster_whisper.utils import download_model; download_model('small', cache_dir='/app/backend/data/cache/whisper/models')"
