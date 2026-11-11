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

5. **Tự động lấy Vị trí và Ngày chụp từ thông tin metadata (EXIF / File Info) riêng cho từng bức ảnh & Bảo toàn thông tin ảnh đã đăng**:
   - Hệ thống tự động trích xuất ngày giờ chụp từ duy nhất thẻ `DateTimeOriginal` (EXIF `0x9003` - Date/Time Original) và tọa độ/vị trí chụp (`GPSLatitude`, `GPSLongitude` chuyển đổi sang địa danh thực tế hoặc thông tin vị trí trong metadata/tên file) trực tiếp và độc lập cho **từng bức ảnh** từ Google Drive đã chia sẻ hoặc file tải từ máy tính. Tuyệt đối không lấy thẻ `CreateDate` (`0x9004`) để đảm bảo đúng ngày chụp gốc thực tế.
   - Luôn áp dụng quy tắc này cho **toàn bộ các Album hiện tại và mọi Album trong tương lai**.
   - Tuyệt đối **không được lấy thời gian hoặc vị trí của một bức ảnh bất kỳ rồi áp dụng chung cho toàn bộ các ảnh khác** trong Album. Mỗi bức ảnh phải mang thông tin thời gian và vị trí riêng biệt của chính bức ảnh đó.
   - **Tuyệt đối không tự ý thay đổi, ghi đè hoặc làm biến đổi thông tin của các bức ảnh đã đăng tải** (ngày giờ chụp, toạ độ, địa danh, mã ảnh, liên kết ảnh) trong quá trình cập nhật Album, chỉnh sửa Album, hoặc đồng bộ hóa dữ liệu.
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

9. **Quy trình xem & chọn ảnh trên Trang Chọn Ảnh của khách (Chỉ xem và chọn ảnh đã chỉnh sửa JPG)**:
   - Khách chỉ xem và chọn ảnh đã chỉnh sửa hoàn thiện (định dạng JPG) được tối ưu chất lượng cao. Không hiển thị ảnh gốc RAW.
   - Bỏ nút chuyển đổi "ẢNH GỐC / ẢNH ĐÃ SỬA". Khách duyệt trực tiếp ảnh đã chỉnh sửa.
   - Nếu khách muốn yêu cầu chỉnh sửa thêm, khách nhập ghi chú vào bức ảnh đó.
   - Khi khách lưu hoặc gửi ghi chú, hệ thống tự động đồng bộ và hiển thị thông báo ghi chú của khách trên Trang Quản Trị của Studio (thông qua badge số lượng "Có ghi chú", danh sách thông báo và cập nhật tức thì).
   - Xóa bỏ nút "Đặt làm ảnh bìa" trong Lightbox của Trang Chọn Ảnh.

10. **Xử lý trực tiếp, dứt điểm ngay lập tức (No Background Waiting)**:
   - Mọi yêu cầu của người dùng phải được tiếp nhận, xử lý đồng bộ và hoàn thành dứt điểm ngay trong lượt phản hồi hiện tại.
   - Không đẩy tác vụ vào chế độ chạy nền (background task) kéo dài hoặc bắt người dùng phải chờ đợi tin nhắn phản hồi sau.
   - Đảm bảo thực thi nhanh chóng, trả lời ngay kết quả sau khi hoàn tất.

11. **Quản lý nhiều tài khoản Google Drive & Phân quyền bảo mật**:
   - Cho phép kết nối và quản lý danh sách nhiều tài khoản Google Drive (tên tài khoản / nhãn, URL Google Apps Script Web App hoặc Google API Key).
   - Chỉ người dùng có vai trò `admin` hoặc `super_admin` mới có quyền xem đầy đủ mã kết nối, thêm mới, sửa, kích hoạt hoặc xóa tài khoản Google Drive. Người dùng có vai trò khác (như `editor`) hoặc khách chỉ thấy trạng thái ẩn/che mã kết nối (`••••••••`) và không có quyền thay đổi.
   - Khi tạo hoặc cập nhật Album từ Google Drive, hệ thống tự động kiểm tra và quét qua các tài khoản Google Drive đã kết nối để lấy danh sách ảnh và trích xuất EXIF/GPS.

12. **Bắt buộc đọc lại toàn bộ Rule trong `GEMINI.md` trước khi thực hiện bất kỳ yêu cầu nào (Read Rules Before Action)**:
   - Sau mỗi yêu cầu từ người dùng, AI bắt buộc phải đọc và rà soát lại toàn bộ các quy tắc trong file `GEMINI.md` này trước khi bắt đầu phân tích, lập trình hoặc chỉnh sửa bất kỳ nội dung nào.
   - Đảm bảo mọi giải pháp và hành động luôn tuân thủ 100% tất cả các quy tắc đã đề ra.

