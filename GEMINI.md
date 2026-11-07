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

4. **Ảnh hiển thị trong Album phải là ảnh thực tế từ Google Drive đã chia sẻ hoặc từ máy tính**:
   - Khi tạo hoặc cập nhật Album từ Google Drive, hệ thống phải lấy đúng các ảnh thực tế nằm trong thư mục/file Google Drive đã chia sẻ của người dùng.
   - Khi tạo hoặc tải ảnh từ máy tính (Local), hệ thống phải hiển thị và lưu trữ đúng các file ảnh người dùng đã chọn từ máy tính.
   - Tuyệt đối không tự ý chèn ảnh mẫu (Unsplash) giả vào Album của người dùng khi tạo mới hoặc cập nhật Album.

5. **Tự động lấy Vị trí và Ngày chụp từ thông tin metadata (EXIF / File Info) của ảnh chia sẻ**:
   - Hệ thống tự động trích xuất ngày giờ chụp (`DateTimeOriginal`, `CreateDate`, `lastModified`) và vị trí chụp (`GPSLatitude`, `GPSLongitude` chuyển đổi sang địa danh thực tế hoặc thông tin vị trí trong metadata/thư mục của ảnh) trực tiếp từ file ảnh Google Drive đã chia sẻ hoặc file ảnh chọn từ máy tính.
   - Tự động điền và cập nhật ngày chụp, thành phố/địa điểm chụp của Album và của từng bức ảnh dựa trên thông tin trích xuất được từ ảnh.
