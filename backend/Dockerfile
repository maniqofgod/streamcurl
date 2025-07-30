FROM python:3.9-slim-bullseye

WORKDIR /app

# Create a non-root user
RUN useradd -m -u 1000 appuser

# Install system dependencies including ffmpeg, curl, and fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    fonts-dejavu-core \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create secure storage and set permissions
RUN mkdir /secure_storage && chown appuser:appuser /secure_storage

# Install Python dependencies
COPY --chown=appuser:appuser ./requirements.txt .
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Copy application
COPY --chown=appuser:appuser . .

# Create media directory and set permissions
RUN mkdir -p /app/media/videos /app/media/audios /app/media/overlays /app/media/hls /app/media/thumbnails /app/media/profile_pics && chown -R appuser:appuser /app/media

# Switch to non-root user
USER appuser

# Command to run the application without reload for stability
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
