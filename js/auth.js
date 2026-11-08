/**
 * AuthModule - Quản lý đăng nhập, đăng xuất, đổi mật khẩu và menu hồ sơ Admin Nhiếp Ảnh Gia
 */
const AuthModule = (function () {
    const STORAGE_KEY_AUTH = "site_admin_logged_in";
    const STORAGE_KEY_PASSWORD = "site_admin_custom_password";
    const DEFAULT_PASS = "123456";

    function isLoggedIn() {
        return localStorage.getItem(STORAGE_KEY_AUTH) === 'true';
    }

    function getAdminPassword() {
        return localStorage.getItem(STORAGE_KEY_PASSWORD) || DEFAULT_PASS;
    }

    function checkAuthUI() {
        const navLoginBtn = document.getElementById('navLoginBtn');
        const navAdminControls = document.getElementById('navAdminControls');

        if (isLoggedIn()) {
            if (navLoginBtn) navLoginBtn.classList.add('hidden');
            if (navAdminControls) navAdminControls.classList.remove('hidden');
        } else {
            if (navLoginBtn) navLoginBtn.classList.remove('hidden');
            if (navAdminControls) navAdminControls.classList.add('hidden');
            closeProfileDropdown();
        }
    }

    function toggleProfileDropdown(event) {
        if (event) event.stopPropagation();
        const dd = document.getElementById('adminProfileDropdown');
        if (dd) {
            dd.classList.toggle('hidden');
        }
    }

    function closeProfileDropdown() {
        const dd = document.getElementById('adminProfileDropdown');
        if (dd) dd.classList.add('hidden');
    }

    // Tự động đóng dropdown khi nhấn ra ngoài
    document.addEventListener('click', function (e) {
        const adminControls = document.getElementById('navAdminControls');
        if (adminControls && !adminControls.contains(e.target)) {
            closeProfileDropdown();
        }
    });

    function handleLoginSubmit(event) {
        event.preventDefault();
        const user = document.getElementById('usernameInput').value.trim();
        const pass = document.getElementById('passwordInput').value.trim();
        const alertBox = document.getElementById('loginAlert');

        if (user === 'admin' && pass === getAdminPassword()) {
            localStorage.setItem(STORAGE_KEY_AUTH, 'true');
            alertBox.classList.add('hidden');
            closeLoginModal();
            checkAuthUI();
            App.showView('admin');
            App.showToast('Đăng nhập thành công vào Trang Quản Trị Studio!');
        } else {
            alertBox.classList.remove('hidden');
        }
    }

    function logout() {
        localStorage.removeItem(STORAGE_KEY_AUTH);
        checkAuthUI();
        App.showView('home');
        App.showToast('Đã đăng xuất tài khoản Quản trị.');
    }

    function openLoginModal() {
        const passInput = document.getElementById('passwordInput');
        if (passInput) passInput.value = '';
        document.getElementById('loginModal').classList.remove('hidden');
        document.getElementById('usernameInput').focus();
    }

    function closeLoginModal() {
        const passInput = document.getElementById('passwordInput');
        if (passInput) passInput.value = '';
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('loginAlert').classList.add('hidden');
    }

    function openChangePasswordModal() {
        closeProfileDropdown();
        const modal = document.getElementById('changePasswordModal');
        const alertBox = document.getElementById('changePasswordAlert');
        if (alertBox) alertBox.classList.add('hidden');
        ['currentPasswordInput', 'newPasswordInput', 'confirmNewPasswordInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (modal) {
            modal.classList.remove('hidden');
            setTimeout(() => document.getElementById('currentPasswordInput')?.focus(), 100);
        }
    }

    function closeChangePasswordModal() {
        const modal = document.getElementById('changePasswordModal');
        if (modal) modal.classList.add('hidden');
    }

    function handleChangePasswordSubmit(event) {
        event.preventDefault();
        const curPass = document.getElementById('currentPasswordInput').value.trim();
        const newPass = document.getElementById('newPasswordInput').value.trim();
        const confirmPass = document.getElementById('confirmNewPasswordInput').value.trim();
        const alertBox = document.getElementById('changePasswordAlert');

        if (curPass !== getAdminPassword()) {
            alertBox.innerText = 'Mật khẩu hiện tại không chính xác!';
            alertBox.classList.remove('hidden');
            return;
        }

        if (newPass.length < 6) {
            alertBox.innerText = 'Mật khẩu mới phải có ít nhất 6 ký tự!';
            alertBox.classList.remove('hidden');
            return;
        }

        if (newPass !== confirmPass) {
            alertBox.innerText = 'Xác nhận mật khẩu mới không trùng khớp!';
            alertBox.classList.remove('hidden');
            return;
        }

        localStorage.setItem(STORAGE_KEY_PASSWORD, newPass);
        closeChangePasswordModal();
        App.showToast('Thay đổi mật khẩu thành công!');
    }

    function openUserManagerModal() {
        closeProfileDropdown();
        const modal = document.getElementById('userManagerModal');
        if (modal) modal.classList.remove('hidden');
    }

    function closeUserManagerModal() {
        const modal = document.getElementById('userManagerModal');
        if (modal) modal.classList.add('hidden');
    }

    return {
        isLoggedIn,
        checkAuthUI,
        toggleProfileDropdown,
        closeProfileDropdown,
        handleLoginSubmit,
        logout,
        openLoginModal,
        closeLoginModal,
        openChangePasswordModal,
        closeChangePasswordModal,
        handleChangePasswordSubmit,
        openUserManagerModal,
        closeUserManagerModal
    };
})();
