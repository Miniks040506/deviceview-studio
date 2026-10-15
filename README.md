# DeviceView Studio

**DeviceView Studio** là công cụ mã nguồn mở hiện đại dành cho lập trình viên (Developer Studio) để kiểm thử, tương tác và so sánh giao diện responsive trực tiếp trên các thiết bị mô phỏng sát thực tế như **iPhone 18 Pro Max**, **iPhone 18 Pro**, **iPhone Duo**, **iPhone 17 / 16 series**, **Samsung Galaxy S26 / S25 series**, **Galaxy Z Fold / Flip**, **Google Pixel 10 / 9 series**, **iPad Pro M5 / iPad Air** và **MacBook / Desktop**.

---

## 1. Tính năng nổi bật

1. **Tương tác Website Trực tiếp (Không dùng ảnh tĩnh thay thế)**:
   - Hỗ trợ nhập URL thực tế (`https://...`, `http://...`), tự động chuẩn hóa URL thiếu giao thức, hỗ trợ `localhost:3000`, `localhost:5173`, `localhost:8080` và bất kỳ custom port nào.
   - Tương tác đầy đủ: click, cuộn trang (scroll wheel), nhập liệu bàn phím, điều hướng.
2. **Kiến trúc Dual Preview Engine (`Direct Mode` & `Browser Mode`)**:
   - **Direct Mode (Iframe)**: Nhúng trực tiếp với tốc độ phản hồi tức thì cho các website cho phép iframe.
   - **Browser Mode (Playwright / Headless Chromium CDP)**: Tự động kích hoạt (hoặc chọn thủ công) khi website chặn nhúng bằng `X-Frame-Options: DENY / SAMEORIGIN` hoặc `Content-Security-Policy: frame-ancestors 'none'`. Phiên trình duyệt chạy thực tế ở backend, truyền khung hình tương tác qua WebSocket và chuyển tiếp sự kiện chuột/bàn phím/cuộn theo thời gian thực.
3. **Thư viện 29+ Thiết bị Hiện đại (`packages/device-registry`)**:
   - Dữ liệu thiết bị lưu trữ độc lập tại `packages/device-registry/data/devices.json`, có thể mở rộng dễ dàng bằng JSON hoặc qua REST API `POST /api/devices` mà không cần sửa code giao diện.
   - Bao gồm các dòng máy mới nhất đã được xác minh thông số CSS Viewport, Device Pixel Ratio (DPR), độ phân giải vật lý (Physical Resolution), kích thước màn hình (inches), tỷ lệ khung hình và kiểu camera cutout (`Dynamic Island`, `Notch`, `Punch-hole`, `MacBook Notch`).
   - Những mẫu máy mới ra mắt có thông số viewport trình duyệt đang ở trạng thái ước tính được gắn nhãn `Estimated (Est.)` minh bạch kèm liên kết nguồn tham chiếu.
4. **Khung Thiết bị Sát Thực tế (Realistic Hardware Frames)**:
   - Mô phỏng viền bezel, bo góc (`borderRadius`), nút cứng vật lý (Action button, Volume, Power), thanh trạng thái, Dynamic Island / Hole-punch và thanh Home Indicator.
   - Hỗ trợ xoay dọc/ngang (**Portrait / Landscape**), tự động co giãn vừa khung làm việc (**Fit to screen**), phóng to/thu nhỏ (**Zoom**) và ẩn/hiện vỏ thiết bị (**Hide/Show Frame**).
5. **Công cụ Developer & Đa thiết bị**:
   - **Compare Mode (Side-by-Side)**: Đặt 2 thiết bị cạnh nhau (ví dụ `iPhone 18 Pro Max` và `Galaxy S26 Ultra`) để đối chiếu bố cục responsive cùng lúc.
   - **Custom Viewport & DPR**: Ghi đè chiều rộng, chiều cao và DPR tùy ý.
   - **Screenshot PNG & Full-Page PNG**: Xuất ảnh chụp màn hình theo đúng độ phân giải thiết bị hoặc chụp toàn bộ chiều dài trang web qua Browser Engine.
   - **Developer Telemetry Panel**: Theo dõi trực tiếp `Console Logs`, `Uncaught JS Errors`, `Network Requests` và thông tin bảo mật HTTP Headers (`X-Frame-Options`, `CSP`).
   - **Workspace Presets, Favorites & Recent URLs**: Lưu trữ cấu hình làm việc trong `localStorage` và chia sẻ qua URL query parameters.
6. **Hỗ trợ Localhost An toàn & Bảo vệ Chống SSRF**:
   - Khi chạy ở chế độ `DEPLOYMENT_MODE=local`, hỗ trợ kết nối trực tiếp tới các cổng phát triển trên máy (`localhost:3000`, `5173`, `8080`...).
   - Khi triển khai trên đám mây (`DEPLOYMENT_MODE=cloud`), backend chặn tuyệt đối truy cập trực tiếp tới `169.254.169.254` (Cloud Metadata), loopback và dải IP nội bộ RFC1918 (kể cả chống DNS Rebinding). Lập trình viên có thể kết nối localhost từ máy cá nhân lên Cloud thông qua **Local Companion Tunnel Agent** (`npm run companion`) có xác thực secret token.

---

## 2. Cấu trúc Monorepo

```text
deviceview-studio/
├── apps/
│   ├── web/                  # Giao diện React + TypeScript + Studio Design System (Light/Dark Mode)
│   └── server/               # Backend Node.js HTTP/WebSocket + SSRF Guard + Browser CDP/Playwright Engine
├── packages/
│   ├── device-registry/      # Thư viện quản lý thông số thiết bị (JSON-driven: data/devices.json)
│   └── shared/               # TypeScript schemas, URL validator, SSRF rules & WebSocket protocol
├── scripts/
│   ├── build.mjs             # Trình biên dịch & đóng gói production cho toàn bộ monorepo
│   ├── typecheck.mjs         # Trình kiểm tra kiểu, cú pháp AST TypeScript & tính toàn vẹn import/JSON
│   ├── test-unit.mjs         # Bộ kiểm thử đơn vị (Unit Tests)
│   ├── test-e2e.mjs          # Bộ kiểm thử tích hợp đầu-cuối (E2E Tests) với Headless Chromium thật
│   └── local-companion.mjs   # Agent tạo đường hầm bảo mật từ máy local lên Cloud Server
├── tests/
│   ├── unit/                 # Kiểm thử URL normalization, SSRF guard, Device Registry, Header analysis
│   └── e2e/                  # Kiểm thử E2E luồng Direct Mode, Browser Mode, Localhost, Screenshot
├── docs/
│   ├── ARCHITECTURE.md       # Tài liệu kiến trúc chi tiết
│   ├── DEPLOYMENT.md         # Hướng dẫn triển khai Docker, Cloud & GitHub
│   └── SECURITY_AND_LIMITATIONS.md # Chính sách bảo mật SSRF, giới hạn Browser Mode & CAPTCHA/DRM
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## 3. Lý do lựa chọn Kỹ thuật & Khả năng tương thích

- **Dual Browser Driver (`Playwright` + `Direct Chromium CDP`)**:
  - Dự án cấu hình đầy đủ `playwright` và `fastify` trong `package.json` cho môi trường phát triển tiêu chuẩn.
  - Đồng thời, `apps/server` tích hợp sẵn bộ điều khiển **Native Chrome DevTools Protocol (CDP)** giao tiếp trực tiếp với nhân Chromium qua WebSocket và trình biên dịch Babel/TypeScript độc lập trong `scripts/`. Nhờ đó, ứng dụng có thể biên dịch, chạy kiểm thử E2E thực tế với Chromium và khởi chạy ngay cả trong các môi trường container biệt lập hoặc hạn chế cài đặt gói phụ thuộc.
- **Bảo toàn trạng thái Iframe**:
  - Khi chuyển đổi thiết bị, xoay màn hình hoặc đổi giao diện Sáng/Tối ở chế độ Direct Mode, lớp đồng bộ DOM giữ nguyên phần tử `<iframe>` đang hoạt động để không làm mất trạng thái cuộn hoặc dữ liệu form đang nhập.

---

## 4. Hướng dẫn Cài đặt & Chạy Local

### Yêu cầu hệ thống
- **Node.js**: `>= 18.0.0` (khuyến nghị Node 20 LTS)
- **Chromium** hoặc **Google Chrome** (dành cho tính năng Browser Mode & chụp ảnh Full-Page PNG)

### Các bước khởi chạy
```bash
# 1. Giải nén hoặc clone mã nguồn
cd deviceview-studio

# 2. Tạo file cấu hình môi trường
cp .env.example .env

# 3. Cài đặt dependencies (nếu chạy trên máy mới có kết nối mạng)
npm install

# 4. Kiểm tra kiểu dữ liệu TypeScript & biên dịch Production
npm run typecheck
npm run build

# 5. Khởi chạy ứng dụng (mặc định tại http://localhost:4000)
npm start
```
Sau khi chạy `npm start` (hoặc `npm run dev`), mở trình duyệt tại **`http://localhost:4000`**.

### Chạy bộ kiểm thử (Tests)
```bash
# Chạy Unit Tests (URL Validator, SSRF Guard, Device Registry, Header Probe)
npm run test:unit

# Chạy E2E Tests thực tế với Headless Chromium
npm run test:e2e
```

---

## 5. Hướng dẫn sử dụng Local Companion Tunnel (Khi chạy Server trên Cloud)

Nếu bạn triển khai DeviceView Studio lên máy chủ Cloud (`DEPLOYMENT_MODE=cloud`) và muốn kiểm thử một website đang chạy ở `http://localhost:3000` trên laptop cá nhân:

```bash
# Trên laptop cá nhân, chạy Companion Agent kết nối lên Cloud Server:
node scripts/local-companion.mjs \
  --server wss://your-deviceview-cloud.example.com/ws/companion \
  --port 3000 \
  --tunnel-id my-laptop \
  --secret your-companion-secret \
  --watch ./src
```

---

## 6. Hướng dẫn Đưa lên GitHub & Triển khai (Deployment)

### Đưa dự án lên GitHub
```bash
cd deviceview-studio
git init
git add .
git commit -m "feat: initial release of DeviceView Studio"
git branch -M main
git remote add origin https://github.com/<your-username>/deviceview-studio.git
git push -u origin main
```

### Chạy bằng Docker Compose
```bash
docker compose up --build -d
# Mở http://localhost:4000
```

Xem thêm hướng dẫn chi tiết về triển khai tách biệt Frontend (Vercel/Cloudflare) + Backend (Fly.io/Render/Railway/VPS) trong file [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) và các giới hạn kỹ thuật trong [`docs/SECURITY_AND_LIMITATIONS.md`](./docs/SECURITY_AND_LIMITATIONS.md).

---

## 7. Giấy phép (License)

Dự án được phát hành theo giấy phép **MIT License** — xem chi tiết tại file [`LICENSE`](./LICENSE).
