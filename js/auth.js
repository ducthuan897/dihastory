/**
 * AuthModule - Quản lý đăng nhập, đăng xuất, đổi mật khẩu và menu hồ sơ Admin Nhiếp Ảnh Gia
 */
const AuthModule = (function () {
    const STORAGE_KEY_AUTH = "site_admin_logged_in";
    const STORAGE_KEY_PASSWORD = "site_admin_custom_password";
    const STORAGE_KEY_USERS = "site_admin_users_list_v1";
    const DEFAULT_PASS = "123456";

    let cachedUsersList = [];

    function isLoggedIn() {
        return localStorage.getItem(STORAGE_KEY_AUTH) === 'true';
    }

    function getAdminPassword() {
        return localStorage.getItem(STORAGE_KEY_PASSWORD) || DEFAULT_PASS;
    }

    function getUsersList() {
        if (cachedUsersList && cachedUsersList.length > 0) return cachedUsersList;
        try {
            const raw = localStorage.getItem(STORAGE_KEY_USERS);
            if (raw) {
                cachedUsersList = JSON.parse(raw);
                return cachedUsersList;
            }
        } catch (e) {}
        return [
            {
                id: "usr_thuan",
                username: "admin",
                fullName: "Nguyễn Đức Thuận",
                email: "admin@dihastory.vn",
                role: "super_admin",
                roleName: "Chủ sở hữu & Super Admin",
                avatar: "https://lh3.googleusercontent.com/d/1uFtOa6VDIqirSz8Ozz9z-Fq-32E2j8eP=s120",
                active: true
            },
            {
                id: "usr_troly",
                username: "troly",
                fullName: "Trợ lý Studio",
                email: "assistant@dihastory.vn",
                role: "editor",
                roleName: "Nhiếp ảnh gia phụ / Editor",
                avatar: "",
                active: true
            }
        ];
    }

    function applyLatestCloudUsers(usersList) {
        if (!Array.isArray(usersList) || usersList.length === 0) return;
        cachedUsersList = usersList;
        try {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(usersList));
        } catch (e) {}

        const adminUser = usersList.find(u => u.username === 'admin');
        if (adminUser && adminUser.customPassword) {
            localStorage.setItem(STORAGE_KEY_PASSWORD, adminUser.customPassword);
        }
        renderUserManagerModalList();
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

    function updateProfileDropdownUI() {
        const subtext = document.getElementById('profileOpenAdminSubtext');
        const chevron = document.getElementById('profileOpenAdminChevron');
        const card = document.getElementById('profileHeaderActionCard');
        const currentView = (typeof App !== 'undefined' && typeof App.getCurrentView === 'function')
            ? App.getCurrentView()
            : '';

        const isInAdmin = (currentView === 'admin' || currentView === 'manage-album');

        if (subtext) {
            subtext.classList.toggle('hidden', isInAdmin);
        }
        if (chevron) {
            chevron.classList.toggle('hidden', isInAdmin);
        }
        if (card) {
            if (isInAdmin) {
                card.classList.remove('cursor-pointer', 'hover:bg-zinc-50');
            } else {
                card.classList.add('cursor-pointer', 'hover:bg-zinc-50');
            }
        }
    }

    function handleHeaderCardClick() {
        const currentView = (typeof App !== 'undefined' && typeof App.getCurrentView === 'function')
            ? App.getCurrentView()
            : '';
        App.showView('admin');
        closeProfileDropdown();
    }

    function toggleProfileDropdown(event) {
        if (event) event.stopPropagation();
        const dd = document.getElementById('adminProfileDropdown');
        if (dd) {
            updateProfileDropdownUI();
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

        // Đồng bộ mật khẩu mới của admin lên Firebase Realtime Database
        const users = getUsersList();
        const adminUser = users.find(u => u.username === 'admin');
        if (adminUser) {
            adminUser.customPassword = newPass;
            if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
                FirebaseModule.saveUsers(users);
            }
        }

        closeChangePasswordModal();
        App.showToast('Thay đổi mật khẩu thành công! Dữ liệu đã đồng bộ bảo mật đa thiết bị.');
    }

    function renderUserManagerModalList() {
        const container = document.getElementById('userManagerUsersListContainer');
        if (!container) return;
        const users = getUsersList();
        container.innerHTML = users.map(u => `
            <div class="p-3.5 rounded-2xl border ${u.role === 'super_admin' ? 'border-blue-200 bg-blue-50/50' : 'border-zinc-200 bg-white'} flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="relative">
                        <div class="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-400 text-white flex items-center justify-center font-bold text-sm">
                            ${u.avatar ? `<img src="${u.avatar}" alt="${u.fullName}" class="w-full h-full object-cover">` : (u.fullName || u.username).slice(0, 2).toUpperCase()}
                        </div>
                        <span class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                    </div>
                    <div class="min-w-0">
                        <div class="font-bold text-zinc-900 text-sm truncate">${u.fullName} (${u.username})</div>
                        <div class="text-[11px] text-zinc-500 truncate">${u.email || 'user@dihastory.vn'} • ${u.roleName || u.role}</div>
                    </div>
                </div>
                <span class="px-2.5 py-1 rounded-full ${u.role === 'super_admin' ? 'bg-blue-100 text-blue-800' : 'bg-zinc-100 text-zinc-700'} text-[11px] font-bold shrink-0">
                    ${u.role === 'super_admin' ? 'Super Admin' : 'Editor'}
                </span>
            </div>
        `).join('');
    }

    function openUserManagerModal() {
        closeProfileDropdown();
        renderUserManagerModalList();
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
        handleHeaderCardClick,
        updateProfileDropdownUI,
        handleLoginSubmit,
        logout,
        openLoginModal,
        closeLoginModal,
        openChangePasswordModal,
        closeChangePasswordModal,
        handleChangePasswordSubmit,
        openUserManagerModal,
        closeUserManagerModal,
        applyLatestCloudUsers,
        getUsersList
    };
})();
