# Hướng dẫn Triển khai (Deployment Guide)

## 1. Triển khai Hợp nhất bằng Docker Compose (Khuyến nghị)

Cách đơn giản và ổn định nhất để chạy đầy đủ cả Frontend lẫn Backend Browser Engine (kèm Chromium và bộ font quốc tế) là sử dụng Docker Compose:

```bash
cp .env.example .env
# Chỉnh sửa DEPLOYMENT_MODE=cloud và COMPANION_AUTH_SECRET mạnh khi chạy trên máy chủ công cộng
docker compose up --build -d
```

Ứng dụng sẽ lắng nghe tại cổng `4000`. Bạn có thể đặt Nginx, Caddy hoặc Cloudflare Tunnel phía trước với cấu hình hỗ trợ WebSocket (`Upgrade: websocket`).

## 2. Triển khai lên Railway / Render / Fly.io

1. Đẩy mã nguồn lên GitHub repository.
2. Tạo dịch vụ Web Service mới từ Dockerfile ở thư mục gốc.
3. Thiết lập các biến môi trường:
   - `NODE_ENV=production`
   - `PORT=4000`
   - `DEPLOYMENT_MODE=cloud`
   - `MAX_CONCURRENT_SESSIONS=6`
   - `COMPANION_AUTH_SECRET=<chuỗi-bí-mật-ngẫu-nhiên-tối-thiểu-32-ký-tự>`
4. Đảm bảo instance có tối thiểu **1 GB - 2 GB RAM** để vận hành Chromium Headless mượt mà.

## 3. Triển khai Tách biệt Frontend (Vercel / Netlify) & Backend (VPS / Cloud Run)

- **Backend (`apps/server`)**: Triển khai bằng `Dockerfile` lên VPS/Fly.io/Render, thiết lập `CORS_ORIGIN=https://your-frontend.vercel.app`.
- **Frontend (`apps/web`)**: Cấu hình proxy `/api` và `/ws` trỏ về tên miền của Backend Server.
