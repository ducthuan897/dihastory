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

5. **Tự động lấy Vị trí và Ngày chụp từ thông tin metadata (EXIF / File Info) riêng cho từng bức ảnh**:
   - Hệ thống tự động trích xuất ngày giờ chụp (`DateTimeOriginal`, `CreateDate`, `lastModified`) và tọa độ/vị trí chụp (`GPSLatitude`, `GPSLongitude` chuyển đổi sang địa danh thực tế hoặc thông tin vị trí trong metadata/tên file) trực tiếp và độc lập cho **từng bức ảnh** từ Google Drive đã chia sẻ hoặc file tải từ máy tính.
   - Tuyệt đối **không được lấy thời gian hoặc vị trí của một bức ảnh bất kỳ rồi áp dụng chung cho toàn bộ các ảnh khác** trong Album. Mỗi bức ảnh phải mang thông tin thời gian và vị trí riêng biệt của chính bức ảnh đó.
   - Tự động điền và cập nhật ngày chụp, thành phố/địa điểm của Album dựa trên thông tin tổng hợp phù hợp, nhưng metadata hiển thị và phân loại của từng bức ảnh luôn phải giữ đúng giá trị riêng của từng bức ảnh đó.

6. **Chức năng "Sửa / Đặt ảnh bìa" là một trang web quản lý chi tiết Album riêng biệt theo giao diện Shotpik**:
   - Khi nhấn vào "Sửa / Đặt ảnh bìa", hệ thống mở trang quản lý chi tiết của Album đó (không hiển thị toàn bộ trong một popup chung như cũ) với bố cục chuẩn Shotpik: nút `< Quay về trang quản lý`, banner ảnh bìa ngang có nút `Thay đổi ảnh bìa` và tiêu đề Album, dòng thông tin khách hàng / ngày cập nhật / trạng thái `Khách đang xem được`, nút `Tùy chỉnh album` và `Gửi album`, thanh thống kê bộ lọc (Tổng ảnh, Đánh dấu sao, Đã thả tim, Có ghi chú), các nút hành động (`Cập nhật album`, `Tìm khuôn mặt`, `Khoá album`, `Tải xuống`, `Tải PDF ghi chú`, `Các tính năng khác`), thanh tab phân mục, bộ chọn `Sắp xếp` và lưới ảnh toàn trang bên dưới.

7. **Trang Chỉ Xem Album được bảo vệ bản quyền (Chỉ Xem, Không Tải, Chặn Chụp Màn Hình & Lưu Ảnh)**:
   - Ở chế độ Trang Chỉ Xem (`isClientMode = false`), hệ thống chỉ cho phép khách duyệt và chiêm ngưỡng ảnh.
   - Tuyệt đối ẩn hoặc chặn toàn bộ nút tải ảnh về máy (cả trên giao diện chính lẫn trong Lightbox).
   - Vô hiệu hoá chuột phải (`contextmenu`), chặn phím tắt chụp màn hình / lưu trang / in / copy (`PrintScreen`, `Ctrl+S`, `Ctrl+P`, `Ctrl+Shift+I`, `Ctrl+U`, `F12`, `Win+Shift+S`).
   - Tự động làm mờ nội dung hoặc chèn màn chắn bảo vệ khi người dùng chuyển tab, mất tiêu điểm hoặc khi phát hiện phím chụp màn hình.
   - Chặn kéo thả ảnh (`dragstart`) và chặn bôi đen/chọn ảnh (`user-select: none`).

8. **Chỉ sửa đúng khu vực code được yêu cầu (Strict Scope Control)**:
   - Chỉ được phép chỉnh sửa đúng phần tử, chức năng và khu vực mã nguồn mà người dùng chỉ định cụ thể trong yêu cầu.
   - Tuyệt đối không tự ý đụng chạm, sửa đổi, tái cấu trúc hoặc can thiệp vào các khu vực code khác ngoài phạm vi khi chưa có sự đồng ý hoặc yêu cầu rõ ràng từ người dùng.

9. **Quy trình xem & tải ảnh trên Trang Chọn Ảnh của khách (RAW vs JPG Đã Chỉnh)**:
   - Khi khách mở xem chi tiết một bức ảnh trong Trang Chọn Ảnh, hệ thống mặc định hiển thị bức ảnh gốc RAW để khách chọn và thả tim.
   - Trên thanh công cụ góc trên bên phải (bên cạnh nút Trình chiếu, nút Tải xuống và nút Đóng), hiển thị nút chuyển đổi xem bản ảnh đã chỉnh sửa định dạng JPG (nếu bức ảnh đó đã có bản hậu kỳ/chỉnh sửa). Khi chuyển đổi, khách xem được chất lượng ảnh đã chỉnh và có thể tải ảnh này về.
   - Xóa bỏ nút "Đặt làm ảnh bìa" trong Lightbox của Trang Chọn Ảnh.
