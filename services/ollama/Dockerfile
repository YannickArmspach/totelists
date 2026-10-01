# Ollama with the triage model pulled on first boot (into the volume, so
# restarts never need the network). Deployed by the Temps `tote-ai` project
# via docker-compose.ai.yml at the repository root.
FROM ollama/ollama:0.35.0

COPY --chmod=0755 docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
