# Panduan Instalasi Agen VPS

Dokumen ini menjelaskan cara menginstal agen streaming di server Virtual Private Server (VPS) baru.

## Prasyarat

-   Server VPS baru yang menjalankan sistem operasi Linux. **Ubuntu 20.04 atau lebih baru sangat disarankan.**
-   Akses ke terminal VPS Anda dengan hak `sudo`.

## Langkah-langkah Instalasi

Proses instalasi dirancang agar sepenuhnya otomatis. Anda hanya perlu menjalankan satu perintah di terminal VPS Anda.

### 1. Masuk ke VPS Anda

Gunakan SSH untuk terhubung ke server VPS Anda.

```bash
ssh nama_pengguna@alamat_ip_vps_anda
```

### 2. Jalankan Perintah Instalasi Otomatis

Salin dan tempel seluruh perintah berikut ke dalam terminal VPS Anda, lalu tekan `Enter`.

```bash
bash <(curl -sL https://raw.githubusercontent.com/maniqofgod/streamcurl-agent/main/install.sh)
```

### Apa yang Dilakukan Perintah Ini?

Skrip instalasi akan secara otomatis melakukan semua hal berikut:
1.  **Memperbarui Sistem:** Menjalankan `apt-get update`.
2.  **Menginstal Dependensi:** Memasang `git`, `ffmpeg`, dan `python3-pip` jika belum ada.
3.  **Mengunduh Proyek:** Mengkloning repositori `streamcurl-agent` dari GitHub Anda ke direktori home.
4.  **Menginstal Dependensi Python:** Memasang `fastapi`, `uvicorn`, dan `python-dotenv` sesuai `requirements.txt`.
5.  **Meminta Kunci API:** Anda akan diminta untuk memasukkan Kunci API. Anda bisa mengetik kunci Anda sendiri atau membiarkannya kosong agar skrip membuatkan kunci acak yang aman untuk Anda.
6.  **Membuat Layanan:** Mengatur agen agar berjalan sebagai layanan `systemd` di latar belakang (`vps-agent.service`), sehingga akan otomatis berjalan bahkan setelah VPS di-restart.
7.  **Mengonfigurasi Firewall:** Membuka port `8001` agar platform utama bisa berkomunikasi dengan agen.

## Setelah Instalasi

Setelah skrip selesai, Anda akan melihat output yang berisi informasi penting:

```
--------------------------------------------------
Harap simpan informasi berikut di tempat yang aman dan masukkan ke dalam platform Anda:
  Alamat IP VPS: [Alamat IP VPS Anda akan muncul di sini]
  Port Agen: 8001
  Kunci API Anda: [Kunci API yang Anda masukkan atau yang dibuatkan akan muncul di sini]
--------------------------------------------------
```

### Memeriksa Status Layanan

Anda dapat kapan saja memeriksa apakah agen berjalan dengan baik menggunakan perintah berikut:

```bash
sudo systemctl status vps-agent
```

Jika semuanya berjalan lancar, Anda akan melihat status `active (running)` berwarna hijau.

---

## Menambahkan VPS ke Platform Anda

Setelah agen berhasil diinstal di VPS Anda, langkah terakhir adalah mendaftarkannya di platform streaming Anda.

1.  **Buka Halaman Manajemen VPS:**
    *   Masuk ke akun Anda di platform streaming.
    *   Arahkan ke halaman "My VPS Management" (atau nama serupa di menu navigasi).

2.  **Gunakan Formulir "Add New VPS":**
    *   Anda akan melihat formulir dengan beberapa kolom. Isi formulir tersebut menggunakan informasi yang Anda dapatkan dari terminal VPS setelah instalasi selesai.

    *   **VPS Name:** Berikan nama yang mudah diingat untuk VPS Anda (contoh: `VPS Utama`, `Server Eropa`).
    *   **IP Address:** Masukkan `Alamat IP VPS` yang ditampilkan di terminal.
    *   **Port:** Biarkan `8001` kecuali Anda mengubahnya secara manual di VPS.
    *   **API Key:** Salin dan tempel `Kunci API Anda` yang ditampilkan di terminal.

3.  **Klik "Add VPS":**
    *   Setelah semua kolom terisi, klik tombol "Add VPS".

VPS Anda sekarang akan muncul di daftar "My VPS List" dan siap digunakan untuk memulai streaming dari platform Anda.