#!/bin/bash

# Hentikan skrip jika terjadi error
set -e

# --- Konfigurasi ---
INSTALL_DIR="$HOME/streamcurl-vps-agent"
REPO_URL="https://raw.githubusercontent.com/maniqofgod/vps-agent/main"
FILES_TO_DOWNLOAD=("docker-compose.yml" "Dockerfile" "main.py" "requirements.txt")

# --- Fungsi Bantuan ---
print_info() {
    echo -e "\e[34mINFO: $1\e[0m"
}

print_success() {
    echo -e "\e[32mSUCCESS: $1\e[0m"
}

print_error() {
    echo -e "\e[31mERROR: $1\e[0m"
}

print_warning() {
    echo -e "\e[33mWARNING: $1\e[0m"
}

# --- Logika Instalasi Dependensi ---
install_docker() {
    print_info "Docker tidak ditemukan. Memulai instalasi Docker..."
    sudo apt-get update
    sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
    sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
    sudo apt-get update
    sudo apt-get install -y docker-ce
    sudo usermod -aG docker ${USER}
    print_success "Docker berhasil diinstal. Anda mungkin perlu logout dan login kembali agar perubahan grup diterapkan."
}

install_docker_compose() {
    print_info "Docker Compose tidak ditemukan. Memulai instalasi Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose berhasil diinstal."
}

# --- Logika Utama ---

# 1. Periksa dan instal dependensi
print_info "Memeriksa dependensi..."
if ! command -v docker &> /dev/null; then
    install_docker
fi
if ! command -v docker-compose &> /dev/null; then
    install_docker_compose
fi
if ! command -v wget &> /dev/null; then
    print_info "wget tidak ditemukan, menginstal..."
    sudo apt-get update && sudo apt-get install -y wget
fi
print_success "Semua dependensi siap."

# 2. Buat direktori instalasi dan unduh file
print_info "Membuat direktori instalasi di $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

print_info "Mengunduh file yang diperlukan dari GitHub..."
for file in "${FILES_TO_DOWNLOAD[@]}"; do
    wget -q "$REPO_URL/$file" -O "$file"
done
print_success "Semua file berhasil diunduh."

# 3. Siapkan file .env dengan API Key otomatis
if [ ! -f .env ]; then
    print_info "Membuat file .env dengan API Key baru..."
    API_KEY=$(openssl rand -hex 32)
    echo "AGENT_API_KEY=$API_KEY" > .env
    print_success "File .env berhasil dibuat."
else
    print_info "File .env sudah ada."
fi

# 4. Bangun dan jalankan container Docker
print_info "Membangun dan menjalankan agen VPS... Ini mungkin memakan waktu beberapa menit."
if groups ${USER} | grep &>/dev/null '\bdocker\b'; then
    docker-compose up --build -d
else
    print_warning "Menjalankan docker-compose dengan sudo karena Anda mungkin belum login ulang."
    sudo docker-compose up --build -d
fi

# 5. Tampilkan informasi penting
AGENT_API_KEY=$(grep AGENT_API_KEY .env | cut -d '=' -f2)

clear
print_success "Instalasi selesai! Agen VPS Streamcurl sekarang berjalan."
print_warning "ANDA MUNGKIN PERLU LOGOUT DAN LOGIN KEMBALI untuk menjalankan perintah docker tanpa sudo."
echo "------------------------------------------------------------------"
print_warning "SIMPAN API KEY INI DI TEMPAT YANG AMAN!"
echo "Anda akan membutuhkannya untuk menghubungkan VPS ini dari panel admin Streamcurl."
echo ""
echo "   AGENT_API_KEY: $AGENT_API_KEY"
echo ""
echo "------------------------------------------------------------------"
print_info "Direktori Instalasi: $INSTALL_DIR"
print_info "Untuk melihat log, jalankan: cd $INSTALL_DIR && docker-compose logs -f"
print_info "Untuk menghentikan agen, jalankan: cd $INSTALL_DIR && docker-compose down"