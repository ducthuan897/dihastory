/**
 * AuthModule - Quản lý đăng nhập, đăng xuất và phân quyền Admin Nhiếp Ảnh Gia
 */
const AuthModule = (function () {
    const STORAGE_KEY_AUTH = "site_admin_logged_in";

    function isLoggedIn() {
        return localStorage.getItem(STORAGE_KEY_AUTH) === 'true';
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
        }
    }

    function handleLoginSubmit(event) {
        event.preventDefault();
        const user = document.getElementById('usernameInput').value.trim();
        const pass = document.getElementById('passwordInput').value.trim();
        const alertBox = document.getElementById('loginAlert');

        if (user === 'admin' && pass === '123456') {
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

    return {
        isLoggedIn,
        checkAuthUI,
        handleLoginSubmit,
        logout,
        openLoginModal,
        closeLoginModal
    };
})();
