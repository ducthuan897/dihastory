# Quy Tắc Dự Án (Project Rules)

Các quy tắc bắt buộc phải luôn tuân thủ trong toàn bộ quá trình phát triển và chỉnh sửa dự án. Khi có quy tắc mới từ người dùng, luôn cập nhật trực tiếp vào file `GEMINI.md` này:

1. **Không đưa câu lệnh của người dùng lên giao diện (No Prompt Echoing in UI)**:
   - Tuyệt đối không trích dẫn, lặp lại hoặc đưa nguyên văn câu lệnh, yêu cầu kỹ thuật của người dùng lên văn bản hiển thị của giao diện web (HTML/UI).
   - Nội dung hiển thị trên giao diện phải sử dụng ngôn ngữ tự nhiên, chuyên nghiệp, đóng vai trò là sản phẩm thực tế dành cho khách hàng và nhiếp ảnh gia.

2. **Không hiển thị mật khẩu công khai ở bất cứ đâu (No Public Passwords Anywhere)**:
   - Tuyệt đối không hiển thị mật khẩu, mã PIN gợi ý, hoặc thông tin đăng nhập mặc định dưới dạng văn bản công khai trên giao diện (trong popup đăng nhập, placeholder, tooltip, ghi chú, footer, hay thông báo).
   - Không điền sẵn (`value="..."`) mật khẩu vào các ô input trên giao diện.

3. **Quản lý quy tắc tập trung tại `GEMINI.md`**:
   - Luôn tuân thủ các quy tắc trong file `GEMINI.md` và chỉ cập nhật các quy tắc mới trực tiếp vào file này.
