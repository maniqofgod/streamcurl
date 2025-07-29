# YouTube Streaming Platform

This project is an automated YouTube live streaming platform. It allows users to upload videos and stream them 24/7 to YouTube.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** FastAPI (Python)
- **Database:** PostgreSQL
- **Streaming Engine:** FFmpeg
- **Task Queue:** Celery
- **Message Broker:** Redis
- **Infrastructure:** Docker

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd youtube-looper
    ```

2.  **Build and run the services:**
    ```bash
    docker-compose up --build
    ```

3.  **Access the application:**
    -   API: `http://localhost:8000`
    -   Frontend: `http://localhost:3000`
