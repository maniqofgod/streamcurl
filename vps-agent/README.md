# Streamcurl VPS Worker Agent

Agen ini bertanggung jawab untuk menerima tugas streaming dari server utama Streamcurl dan menjalankannya di VPS. Ini memungkinkan distribusi beban kerja streaming ke beberapa mesin.

## Instalasi Cepat

Jalankan perintah berikut di terminal VPS Anda. Skrip ini akan secara otomatis mengunduh, mengkonfigurasi, dan menjalankan agen.

```bash
bash -c "$(wget -qO- https://raw.githubusercontent.com/maniqofgod/vps-agent/main/install.sh)"
```

Atau menggunakan `curl`:
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/maniqofgod/vps-agent/main/install.sh)"
```

Di akhir instalasi, sebuah **API Key akan ditampilkan**. Simpan kunci ini di tempat yang aman, karena Anda akan membutuhkannya untuk menghubungkan VPS ini dari panel admin Streamcurl.

## Prasyarat

Skrip instalasi akan memeriksa dependensi berikut:
- `wget` atau `curl`
- `docker`
- `docker-compose`

Jika ada yang hilang, skrip akan berhenti dan memberitahu Anda apa yang perlu diinstal.

## Manajemen Agen

Agen diinstal di direktori `~/streamcurl-vps-agent`. Untuk mengelolanya:

- **Pindah ke Direktori Instalasi**
  ```bash
  cd ~/streamcurl-vps-agent
  ```

- **Memeriksa Status & Log**
  ```bash
  docker-compose logs -f
  ```

- **Menghentikan Agen**
  ```bash
  docker-compose down
  ```

- **Memperbarui Agen**
  Cukup jalankan kembali perintah instalasi cepat. Skrip akan mengunduh versi terbaru dan membangun ulang agen tanpa mengubah API Key Anda yang sudah ada.
  ```bash
  bash -c "$(wget -qO- https://raw.githubusercontent.com/maniqofgod/vps-agent/main/install.sh)"