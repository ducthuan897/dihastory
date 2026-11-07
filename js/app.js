/**
 * App Module - Quản lý chính khởi tạo ứng dụng và chuyển đổi View
 */
const App = (function () {
    
    function init() {
        // 1. Tải trạng thái video đã lưu từ localStorage
        const savedVideoId = localStorage.getItem(AdminModule.STORAGE_KEY_VIDEO) || "dQw4w9WgXcQ";
        AdminModule.setMainVideoPlayer(savedVideoId);

        // 2. Kiểm tra quyền Đăng nhập
        AuthModule.checkAuthUI();

        // 3. Render danh sách mẫu
        AdminModule.renderPresets();
    }

    function showView(viewName) {
        const publicView = document.getElementById('publicView');
        const adminView = document.getElementById('adminView');

        if (viewName === 'admin') {
            if (!AuthModule.isLoggedIn()) {
                AuthModule.openLoginModal();
                return;
            }
            publicView.classList.add('hidden');
            adminView.classList.remove('hidden');

            const savedVideoId = localStorage.getItem(AdminModule.STORAGE_KEY_VIDEO) || "dQw4w9WgXcQ";
            AdminModule.updateAdminPreview(savedVideoId);
        } else {
            publicView.classList.remove('hidden');
            adminView.classList.add('hidden');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        const icon = document.getElementById('toastIcon');
        const text = document.getElementById('toastMessage');

        if (!toast) return;

        text.innerText = msg;
        if (type === 'error') {
            icon.className = 'fa-solid fa-circle-xmark text-red-400 text-lg';
        } else {
            icon.className = 'fa-solid fa-circle-check text-emerald-400 text-lg';
        }

        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    return {
        init,
        showView,
        showToast
    };
})();

// Tự động khởi tạo khi toàn bộ cây DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});