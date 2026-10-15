# Chính sách Bảo mật & Các Giới hạn Kỹ thuật

## 1. Bảo vệ Chống SSRF (Server-Side Request Forgery)

Khi triển khai một công cụ cho phép người dùng nhập URL bất kỳ để backend mở bằng trình duyệt thật (Chromium), rủi ro lớn nhất là **SSRF**. DeviceView Studio áp dụng 4 lớp bảo vệ:

1. **Chặn Tuyệt đối Cloud Metadata Endpoints**: Mọi yêu cầu tới `169.254.169.254`, `169.254.170.2`, `metadata.google.internal`, `100.100.100.200` đều bị từ chối ở cả chế độ `local` lẫn `cloud`.
2. **Chặn Dải IP Nội bộ trong Chế độ Cloud (`DEPLOYMENT_MODE=cloud`)**: Mọi địa chỉ `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fc00::/7`, `fe80::/10` và tên miền nội bộ (`.internal`, `.local`, `.lan`, `.corp`) đều bị chặn trừ khi được quản trị viên khai báo rõ trong `ALLOWED_HOSTS`.
3. **Kiểm tra Phân giải DNS (DNS Rebinding Protection)**: Trước khi kết nối, `ssrf-guard.ts` phân giải tên miền qua `dns.promises.lookup` và kiểm tra từng IP kết quả để ngăn chặn tên miền công cộng phân giải về IP nội bộ.
4. **Giới hạn Tài nguyên Phiên (Session Isolation & Resource Limits)**: Giới hạn số phiên đồng thời (`MAX_CONCURRENT_SESSIONS`), tự động thu hồi phiên nhàn rỗi (`SESSION_IDLE_TIMEOUT_MS`) và giới hạn thời gian sống tối đa (`SESSION_MAX_LIFETIME_MS`).

## 2. Giới hạn của Direct Mode và Browser Mode

- **Direct Mode (Iframe)**:
  - Không thể nhúng các website gửi header `X-Frame-Options: DENY`, `X-Frame-Options: SAMEORIGIN` hoặc `Content-Security-Policy: frame-ancestors 'none'`.
  - Vì chính sách Same-Origin Policy của trình duyệt, khi mở một website khác tên miền (Cross-Origin) trong Direct Mode, trình duyệt không cho phép đọc trực tiếp Console Logs hay Network Requests bên trong iframe. Để xem đầy đủ Console Logs, JS Errors và Network Requests của trang bất kỳ, hãy chọn **Browser Mode**.
- **Browser Mode (Playwright / Headless Chromium CDP)**:
  - **Không vượt CAPTCHA / Anti-Bot**: Các website sử dụng Cloudflare Turnstile, Google reCAPTCHA, DataDome hoặc chặn IP máy chủ trung tâm dữ liệu sẽ hiển thị màn hình thử thách bảo mật. DeviceView Studio tuyệt đối **không** tích hợp cơ chế bypass CAPTCHA trái phép; hệ thống sẽ phát hiện và hiển thị thông báo rõ ràng cho người dùng.
  - **Không hỗ trợ nội dung DRM (Widevine / FairPlay / PlayReady)**: Các dịch vụ phát video có bản quyền DRM không thể kết xuất trong trình duyệt Chromium Headless.
  - **Độ trễ khung hình**: Browser Mode truyền ảnh chụp màn hình thời gian thực qua WebSocket nên tốc độ khung hình phụ thuộc vào băng thông mạng và tài nguyên CPU của máy chủ (thích hợp để kiểm thử giao diện, bố cục, form và luồng tương tác, không thay thế phát video 60fps).
