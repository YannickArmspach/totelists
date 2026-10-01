# Open WebUI, the authenticated gateway in front of Ollama: per-user API keys
# for /ollama/api/chat (triage) and /api/v1/audio/transcriptions (built-in
# faster-whisper STT). Deployed by the Temps `tote-ai` project via
# docker-compose.ai.yml at the repository root.
FROM ghcr.io/open-webui/open-webui:v0.11.4

# Must match MODEL_TRANSCRIBE (compose passes it as a build arg): the model is
# pre-downloaded into the path the app reads (WHISPER_MODEL_DIR default), and
# the named volume mounted over /app/backend/data is seeded from the image on
# first creation, so the first transcription doesn't block on the download.
ARG MODEL_TRANSCRIBE=large-v3-turbo
RUN python -c "from faster_whisper.utils import download_model; download_model('${MODEL_TRANSCRIBE}', cache_dir='/app/backend/data/cache/whisper/models')"
