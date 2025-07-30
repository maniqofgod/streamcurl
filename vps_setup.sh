#!/bin/bash
# Skrip untuk persiapan server VPS

# Hentikan skrip jika ada error
set -e

echo "=== Memulai persiapan server VPS ==="

# 1. Perbarui daftar paket dan upgrade sistem
echo "--> 1/6: Memperbarui sistem (apt update && upgrade)..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Git
echo "--> 2/6: Menginstal Git..."
sudo apt-get install git -y

# 3. Install Docker Engine
echo "--> 3/6: Menginstal Docker Engine..."
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh

# 4. Install Docker Compose Plugin
echo "--> 4/6: Menginstal Docker Compose..."
sudo apt-get install docker-compose-plugin -y

# 5. Tambahkan user ke grup docker
echo "--> 5/6: Menambahkan user saat ini ke grup Docker..."
sudo usermod -aG docker $USER

# 6. Clone repositori proyek
echo "--> 6/6: Mengkloning repositori dari GitHub..."
git clone https://github.com/maniqofgod/streamcurl.git
cd streamcurl

echo ""
echo "========================================"
echo "✅ Persiapan server selesai."
echo "PENTING: Silakan logout dari sesi SSH Anda dan login kembali."
echo "Setelah itu, masuk ke direktori 'streamcurl' dengan 'cd streamcurl' untuk melanjutkan."
echo "========================================"
