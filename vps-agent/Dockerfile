# Gunakan image Python versi slim sebagai dasar
FROM python:3.9-slim-bullseye

# Tetapkan direktori kerja di dalam container
WORKDIR /app

# Perbarui package list dan install ffmpeg
# ffmpeg diperlukan untuk menjalankan proses streaming
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Salin file requirements.txt terlebih dahulu untuk caching layer
COPY requirements.txt .

# Install dependensi Python
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# Salin sisa kode aplikasi
COPY . .

# Expose port yang akan digunakan oleh aplikasi (default 8001)
EXPOSE 8001

# Perintah untuk menjalankan aplikasi saat container dimulai
# Menggunakan uvicorn untuk menjalankan aplikasi FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]