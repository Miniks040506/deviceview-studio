# Kiến trúc Hệ thống — DeviceView Studio

## 1. Tổng quan Kiến trúc

DeviceView Studio được thiết kế theo mô hình Monorepo gồm 4 gói thành phần chính:

1. **`@deviceview/shared` (`packages/shared`)**:
   - Định nghĩa toàn bộ kiểu dữ liệu TypeScript dùng chung giữa Frontend và Backend.
   - Cung cấp bộ chuẩn hóa URL (`normalizeInputUrl`) và bộ kiểm tra bảo mật chống SSRF (`validateTargetUrl`, `isMetadataHost`, `isPrivateOrInternalIp`).
   - Định nghĩa giao thức thông điệp thời gian thực qua WebSocket (`ClientToServerWsMessage`, `ServerToClientWsMessage`).

2. **`@deviceview/device-registry` (`packages/device-registry`)**:
   - Quản lý danh mục thiết bị từ nguồn dữ liệu chuẩn hóa `data/devices.json`.
   - Cung cấp API tìm kiếm, lọc theo hãng (`Apple`, `Samsung`, `Google`, `Generic`), lọc theo phân loại (`phone`, `tablet`, `foldable`, `laptop`, `desktop`) và tính toán kích thước CSS Viewport khi xoay chiều `portrait` / `landscape`.

3. **`@deviceview/server` (`apps/server`)**:
   - **Direct Mode Probe (`direct-probe.ts`)**: Thực hiện kiểm tra HTTP/HTTPS headers (`X-Frame-Options`, `Content-Security-Policy: frame-ancestors`), phát hiện trang yêu cầu xác thực CAPTCHA/DRM/Auth và đưa ra khuyến nghị engine tự động.
   - **DNS & SSRF Guard (`ssrf-guard.ts`)**: Phân giải DNS trước mỗi kết nối để ngăn chặn tấn công DNS Rebinding trỏ về `169.254.169.254` hoặc mạng nội bộ.
   - **Browser Mode Engine (`browser-engine.ts`)**: Quản lý vòng đời phiên trình duyệt Chromium Headless thông qua Chrome DevTools Protocol (CDP) / Playwright với cơ chế Warm Browser Pool giúp chuyển đổi thiết bị và chụp ảnh màn hình trong ~300ms.
   - **Local Companion Tunnel Hub (`tunnel-hub.ts`)**: Quản lý đường hầm WebSocket có xác thực từ máy lập trình viên lên Cloud Server.

4. **`@deviceview/web` (`apps/web`)**:
   - Giao diện Developer Studio hỗ trợ Light/Dark Mode, danh sách thiết bị bên trái, khung thiết bị tương tác trung tâm (hỗ trợ Single & Side-by-Side Compare Mode), thanh công cụ nổi và bảng Inspector/DevTools bên phải.
