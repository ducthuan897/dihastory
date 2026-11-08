/**
 * AuthModule - Quản lý đăng nhập, đăng xuất, đổi mật khẩu và menu hồ sơ Admin Nhiếp Ảnh Gia
 */
const AuthModule = (function () {
    const STORAGE_KEY_AUTH = "site_admin_logged_in";
    const STORAGE_KEY_CURRENT_USER = "site_admin_current_user";
    const STORAGE_KEY_PASSWORD = "site_admin_custom_password";
    const STORAGE_KEY_USERS = "site_admin_users_list_v1";
    const DEFAULT_PASS = "123456";

    // Chuỗi salt bí mật để băm mật khẩu bảo mật (SHA-256 + Salt)
    const HASH_SALT = "DihaStory_Security_Salt_#2026";

    let cachedUsersList = [];

    // Hàm băm mật khẩu chuẩn SHA-256 (Web Crypto API tiêu chuẩn bảo mật cao)
    async function hashPassword(plainText) {
        if (!plainText) return "";
        try {
            if (window.crypto && window.crypto.subtle) {
                const enc = new TextEncoder();
                const data = enc.encode(plainText + HASH_SALT);
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return "sha256_" + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) {
            console.warn("Crypto API fallback:", e);
        }
        // Fallback hash nhẹ nếu trình duyệt không hỗ trợ Web Crypto
        let h = 0x811c9dc5;
        const str = plainText + HASH_SALT;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h * 0x01000193) >>> 0;
        }
        return "fnv1a_" + h.toString(16);
    }

    async function verifyPassword(plainInput, storedHashOrPlain) {
        if (!storedHashOrPlain) return false;
        // Nếu trong DB đã là dạng băm
        if (storedHashOrPlain.startsWith("sha256_") || storedHashOrPlain.startsWith("fnv1a_")) {
            const hashedInput = await hashPassword(plainInput);
            return hashedInput === storedHashOrPlain;
        }
        // Nếu trong DB là bản plain cũ thì so sánh trực tiếp
        return plainInput === storedHashOrPlain;
    }

    function isLoggedIn() {
        return localStorage.getItem(STORAGE_KEY_AUTH) === 'true';
    }

    function getCurrentUser() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        const users = getUsersList();
        return users[0] || null;
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
        renderUsersPageList();
    }

    function checkAuthUI() {
        const navLoginBtn = document.getElementById('navLoginBtn');
        const navAdminControls = document.getElementById('navAdminControls');

        if (isLoggedIn()) {
            if (navLoginBtn) navLoginBtn.classList.add('hidden');
            if (navAdminControls) navAdminControls.classList.remove('hidden');

            // Cập nhật tên và avatar của tài khoản đang đăng nhập
            const u = getCurrentUser();
            if (u) {
                const navAvatarImg = document.querySelector('#adminProfileMenuBtn img');
                const cardAvatarImg = document.querySelector('#profileHeaderActionCard img');
                const cardName = document.querySelector('#profileHeaderActionCard .font-bold');

                const defaultAvatar = "https://lh3.googleusercontent.com/d/1uFtOa6VDIqirSz8Ozz9z-Fq-32E2j8eP=s120";
                const avatarSrc = u.avatar || defaultAvatar;

                if (navAvatarImg) navAvatarImg.src = avatarSrc;
                if (cardAvatarImg) cardAvatarImg.src = avatarSrc;
                if (cardName) cardName.innerText = u.fullName || u.username;
            }
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

    async function handleLoginSubmit(event) {
        event.preventDefault();
        const inputUser = document.getElementById('usernameInput').value.trim().toLowerCase();
        const inputPass = document.getElementById('passwordInput').value.trim();
        const alertBox = document.getElementById('loginAlert');

        const users = getUsersList();
        const matched = users.find(u => (u.username && u.username.toLowerCase() === inputUser) && u.active !== false);

        if (matched) {
            const storedPass = matched.customPassword || (matched.username === 'admin' ? getAdminPassword() : DEFAULT_PASS);
            const isMatch = await verifyPassword(inputPass, storedPass);
            if (isMatch) {
                // Tự động nâng cấp mã hóa nếu mật khẩu trong DB chưa được mã hóa
                if (!storedPass.startsWith('sha256_') && !storedPass.startsWith('fnv1a_')) {
                    matched.customPassword = await hashPassword(inputPass);
                    try {
                        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
                    } catch (e) {}
                    if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
                        FirebaseModule.saveUsers(users);
                    }
                }

                localStorage.setItem(STORAGE_KEY_AUTH, 'true');
                localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(matched));
                alertBox.classList.add('hidden');
                closeLoginModal();
                checkAuthUI();
                App.showView('admin');
                App.showToast(`Chào mừng ${matched.fullName || matched.username} đăng nhập thành công!`);
                return;
            }
        }

        // Dự phòng cho admin gốc
        if (inputUser === 'admin') {
            const adminPass = getAdminPassword();
            const isAdminMatch = await verifyPassword(inputPass, adminPass);
            if (isAdminMatch) {
                localStorage.setItem(STORAGE_KEY_AUTH, 'true');
                if (users[0]) localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(users[0]));
                alertBox.classList.add('hidden');
                closeLoginModal();
                checkAuthUI();
                App.showView('admin');
                App.showToast('Đăng nhập thành công vào Trang Quản Trị Studio!');
                return;
            }
        }

        alertBox.classList.remove('hidden');
    }

    function logout() {
        localStorage.removeItem(STORAGE_KEY_AUTH);
        localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
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

    async function handleChangePasswordSubmit(event) {
        event.preventDefault();
        const curPass = document.getElementById('currentPasswordInput').value.trim();
        const newPass = document.getElementById('newPasswordInput').value.trim();
        const confirmPass = document.getElementById('confirmNewPasswordInput').value.trim();
        const alertBox = document.getElementById('changePasswordAlert');

        const currentStoredPass = getAdminPassword();
        const isCurMatch = await verifyPassword(curPass, currentStoredPass);

        if (!isCurMatch) {
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

        // Mã hóa mật khẩu mới trước khi lưu
        const hashedNewPass = await hashPassword(newPass);
        localStorage.setItem(STORAGE_KEY_PASSWORD, hashedNewPass);

        // Đồng bộ mật khẩu mới của admin lên Firebase Realtime Database
        const users = getUsersList();
        const adminUser = users.find(u => u.username === 'admin');
        if (adminUser) {
            adminUser.customPassword = hashedNewPass;
            if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
                FirebaseModule.saveUsers(users);
            }
        }

        closeChangePasswordModal();
        App.showToast('Thay đổi mật khẩu thành công! Dữ liệu đã được mã hóa và bảo vệ an toàn.');
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

    function renderUsersPageList() {
        const users = getUsersList();
        const totalEl = document.getElementById('usersPageTotalCount');
        const superEl = document.getElementById('usersPageSuperAdminCount');
        const editorEl = document.getElementById('usersPageEditorCount');
        const container = document.getElementById('usersPageListContainer');

        if (totalEl) totalEl.innerText = users.length;
        if (superEl) superEl.innerText = users.filter(u => u.role === 'super_admin').length;
        if (editorEl) editorEl.innerText = users.filter(u => u.role !== 'super_admin').length;

        if (!container) return;

        container.innerHTML = users.map(u => `
            <div class="p-4 sm:p-5 rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 transition shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center gap-3.5 min-w-0">
                    <div class="relative shrink-0">
                        <div class="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-400 text-white flex items-center justify-center font-bold text-base shadow-sm ring-1 ring-zinc-200">
                            ${u.avatar ? `<img src="${u.avatar}" alt="${u.fullName}" class="w-full h-full object-cover">` : (u.fullName || u.username).slice(0, 2).toUpperCase()}
                        </div>
                        <span class="absolute bottom-0 right-0 w-3.5 h-3.5 ${u.active ? 'bg-emerald-500' : 'bg-zinc-400'} border-2 border-white rounded-full"></span>
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-zinc-900 text-base leading-tight truncate">${u.fullName}</span>
                            <span class="text-xs text-zinc-400">@${u.username}</span>
                        </div>
                        <div class="text-xs text-zinc-500 mt-0.5 truncate flex items-center gap-2">
                            <span><i class="fa-regular fa-envelope text-[11px] mr-1"></i>${u.email || 'user@dihastory.vn'}</span>
                            <span>•</span>
                            <span class="font-medium text-zinc-600">${u.roleName || (u.role === 'super_admin' ? 'Chủ sở hữu & Super Admin' : 'Editor')}</span>
                        </div>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-2.5 shrink-0 self-end md:self-auto">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${
                        u.role === 'super_admin' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }">
                        <i class="${u.role === 'super_admin' ? 'fa-solid fa-shield-halved' : 'fa-solid fa-wand-magic-sparkles'} mr-1 text-[11px]"></i>
                        ${u.role === 'super_admin' ? 'Super Admin' : 'Editor'}
                    </span>

                    <button type="button" onclick="AuthModule.openEditUserModal('${u.id}')"
                        class="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold transition flex items-center gap-1.5">
                        <i class="fa-solid fa-user-pen text-xs"></i>
                        <span>Chỉnh sửa</span>
                    </button>

                    ${u.username !== 'admin' ? `
                    <button type="button" onclick="AuthModule.deleteUser('${u.id}')"
                        class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition flex items-center gap-1.5">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                        <span>Xóa</span>
                    </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    function openAddUserModal() {
        const modal = document.getElementById('userEditModal');
        const title = document.getElementById('userEditModalTitle');
        if (title) title.innerText = 'Thêm Người Dùng Mới';
        document.getElementById('editUserId').value = '';
        document.getElementById('editUserUsername').value = '';
        document.getElementById('editUserUsername').removeAttribute('readonly');
        document.getElementById('editUserFullName').value = '';
        document.getElementById('editUserEmail').value = '';
        document.getElementById('editUserRole').value = 'editor';
        document.getElementById('editUserAvatar').value = '';
        document.getElementById('editUserPassword').value = '';
        if (modal) modal.classList.remove('hidden');
    }

    function openEditUserModal(userId) {
        const users = getUsersList();
        const user = users.find(u => u.id === userId);
        if (!user) return;

        const modal = document.getElementById('userEditModal');
        const title = document.getElementById('userEditModalTitle');
        if (title) title.innerText = `Chỉnh Sửa: ${user.fullName}`;

        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUserUsername').value = user.username;
        if (user.username === 'admin') {
            document.getElementById('editUserUsername').setAttribute('readonly', 'true');
        } else {
            document.getElementById('editUserUsername').removeAttribute('readonly');
        }
        document.getElementById('editUserFullName').value = user.fullName || '';
        document.getElementById('editUserEmail').value = user.email || '';
        document.getElementById('editUserRole').value = user.role || 'editor';
        document.getElementById('editUserAvatar').value = user.avatar || '';
        document.getElementById('editUserPassword').value = '';

        if (modal) modal.classList.remove('hidden');
    }

    function closeUserEditModal() {
        const modal = document.getElementById('userEditModal');
        if (modal) modal.classList.add('hidden');
    }

    async function handleSaveUserSubmit(event) {
        event.preventDefault();
        const id = document.getElementById('editUserId').value;
        const username = document.getElementById('editUserUsername').value.trim().toLowerCase();
        const fullName = document.getElementById('editUserFullName').value.trim();
        const email = document.getElementById('editUserEmail').value.trim();
        const role = document.getElementById('editUserRole').value;
        const avatar = document.getElementById('editUserAvatar').value.trim();
        const pass = document.getElementById('editUserPassword').value.trim();

        let users = [...getUsersList()];

        if (id) {
            // Edit existing user
            const idx = users.findIndex(u => u.id === id);
            if (idx >= 0) {
                users[idx].fullName = fullName;
                users[idx].email = email;
                users[idx].role = role;
                users[idx].roleName = role === 'super_admin' ? 'Chủ sở hữu & Super Admin' : 'Nhiếp ảnh gia phụ / Editor';
                users[idx].avatar = avatar;
                if (pass) {
                    const hashedPass = await hashPassword(pass);
                    users[idx].customPassword = hashedPass;
                    if (users[idx].username === 'admin') {
                        localStorage.setItem(STORAGE_KEY_PASSWORD, hashedPass);
                    }
                }
            }
        } else {
            // Add new user
            if (users.some(u => u.username === username)) {
                alert('Tên đăng nhập này đã tồn tại!');
                return;
            }
            const hashedPass = await hashPassword(pass || '123456');
            const newUser = {
                id: 'usr_' + Date.now(),
                username,
                fullName,
                email: email || `${username}@dihastory.vn`,
                role,
                roleName: role === 'super_admin' ? 'Chủ sở hữu & Super Admin' : 'Nhiếp ảnh gia phụ / Editor',
                avatar: avatar || '',
                customPassword: hashedPass,
                active: true,
                createdAt: new Date().toISOString()
            };
            users.push(newUser);
        }

        cachedUsersList = users;
        try {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
        } catch (e) {}

        // Đồng bộ thời gian thực lên Firebase dưới dạng hash bảo mật
        if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
            FirebaseModule.saveUsers(users);
        }

        closeUserEditModal();
        renderUsersPageList();
        renderUserManagerModalList();
        App.showToast('Đã lưu thông tin người dùng và mã hóa mật khẩu trên Firebase thành công!');
    }

    function deleteUser(userId) {
        let users = getUsersList();
        const target = users.find(u => u.id === userId);
        if (!target) return;
        if (target.username === 'admin') {
            alert('Không thể xóa tài khoản Quản trị viên chính!');
            return;
        }
        if (!confirm(`Bạn có chắc muốn xóa tài khoản "${target.fullName} (${target.username})"?`)) {
            return;
        }

        users = users.filter(u => u.id !== userId);
        cachedUsersList = users;
        try {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
        } catch (e) {}

        if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
            FirebaseModule.saveUsers(users);
        }

        renderUsersPageList();
        renderUserManagerModalList();
        App.showToast('Đã xóa người dùng thành công!');
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
        renderUsersPageList,
        openAddUserModal,
        openEditUserModal,
        closeUserEditModal,
        handleSaveUserSubmit,
        deleteUser,
        getCurrentUser,
        applyLatestCloudUsers,
        getUsersList
    };
})();
