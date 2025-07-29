# Panduan Penyiapan Cepat VPS untuk Streaming

Dokumen ini memberikan panduan untuk menyiapkan Virtual Private Server (VPS) Anda dengan cepat menggunakan skrip instalasi otomatis.

## Proses Instalasi

Prosesnya dirancang agar sangat sederhana. Anda hanya perlu mengunduh dan menjalankan satu file skrip di VPS Anda.

### Langkah 1: Hubungkan ke VPS Anda

Gunakan SSH untuk terhubung ke VPS Anda sebagai pengguna non-root (pengguna dengan hak `sudo`).

### Langkah 2: Unduh Skrip Instalasi

Unduh skrip `install.sh` dari proyek ini ke VPS Anda. Cara termudah adalah dengan menggunakan `curl` atau `wget`. Ganti `URL_RAW_INSTALL.SH` dengan URL langsung ke file `install.sh` di repositori Git Anda (misalnya, di GitHub, klik file `install.sh` lalu klik tombol "Raw").

```bash
# Menggunakan curl
curl -O URL_RAW_INSTALL.SH

# Atau menggunakan wget
wget URL_RAW_INSTALL.SH
```

Setelah diunduh, pastikan nama filenya adalah `install.sh`.

### Langkah 3: Jadikan Skrip Dapat Dieksekusi

Berikan izin eksekusi pada file yang baru saja Anda unduh.

```bash
chmod +x install.sh
```

### Langkah 4: Jalankan Skrip

Jalankan skrip instalasi.

```bash
./install.sh
```

Skrip akan melakukan semua hal berikut secara otomatis:
*   Menginstal `ffmpeg` dan `python3`.
*   Membuat semua file aplikasi yang diperlukan.
*   Menginstal dependensi Python.
*   Meminta Anda untuk memasukkan Kunci API (atau membuatnya secara otomatis).
*   Mengkonfigurasi dan memulai layanan `vps-agent` agar berjalan di latar belakang.
*   Membuka port yang diperlukan di firewall.

### Langkah 5: Simpan Kredensial Anda

Setelah skrip selesai, ia akan menampilkan **Alamat IP**, **Port**, dan **Kunci API** Anda.

**Simpan informasi ini di tempat yang aman.** Anda akan membutuhkannya untuk ditambahkan ke dalam platform streaming Anda melalui antarmuka pengguna.

### Selesai!

VPS Anda sekarang sepenuhnya siap untuk menerima tugas streaming dari backend utama. Anda dapat memeriksa status agen kapan saja dengan perintah:

```bash
sudo systemctl status vps-agent