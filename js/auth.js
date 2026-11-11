/**
 * AuthModule - Quản lý đăng nhập, đăng xuất, đổi mật khẩu và menu hồ sơ Admin Nhiếp Ảnh Gia
 */
const AuthModule = (function () {
    const STORAGE_KEY_AUTH = "site_admin_logged_in";
    const STORAGE_KEY_CURRENT_USER = "site_admin_current_user";
    const STORAGE_KEY_PASSWORD = "site_admin_custom_password";
    const STORAGE_KEY_USERS = "site_admin_users_list_v1";
    const STORAGE_KEY_REMEMBER = "site_admin_remembered_credentials_v1";
    const DEFAULT_PASS = "123456";

    // Chuỗi salt bí mật để băm mật khẩu bảo mật (SHA-256 + Salt)
    const HASH_SALT = "DihaStory_Security_Salt_#2026";

    // Thứ tự phân quyền theo cấp bậc: 1. super_admin > 2. admin > 3. editor
    const ROLE_LEVELS = {
        'super_admin': 3,
        'admin': 2,
        'editor': 1
    };

    const ROLE_LABELS = {
        'super_admin': 'Super Admin',
        'admin': 'Admin',
        'editor': 'Editor'
    };

    const ROLE_FULL_NAMES = {
        'super_admin': 'Chủ sở hữu & Super Admin',
        'admin': 'Quản trị viên Studio',
        'editor': 'Nhiếp ảnh gia phụ / Editor'
    };

    function escapeHtml(str) {
        if (!str || typeof str !== 'string') return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function sanitizeAvatarUrl(raw) {
        if (!raw || typeof raw !== 'string') return "";
        const trimmed = raw.trim();
        if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('data:image/')) {
            return "";
        }
        try {
            const parsedUrl = new URL(trimmed);
            if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
                return encodeURI(parsedUrl.href);
            }
        } catch (e) {}
        if (trimmed.startsWith('data:image/')) return encodeURI(trimmed);
        return "";
    }

    function getRoleLevel(role) {
        return ROLE_LEVELS[role] || 1;
    }

    function canModifyUser(currentUser, targetUser) {
        if (!currentUser) return false;
        // Được phép sửa thông tin của chính mình
        if (currentUser.id === targetUser.id || currentUser.username === targetUser.username) {
            return true;
        }
        const curLevel = getRoleLevel(currentUser.role);
        const targetLevel = getRoleLevel(targetUser.role);
        // Cấp trên có thể sửa/xóa cấp dưới nghiêm ngặt (curLevel > targetLevel)
        return curLevel > targetLevel;
    }

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
        const users = getUsersList();
        const adminUser = users.find(u => u.username === 'admin');
        if (adminUser && adminUser.customPassword) {
            return adminUser.customPassword;
        }
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
                customPassword: "sha256_e04b1c139d165f32519cafcc8b6f544dcf8e66a0cecbef905ef38631722d7b86",
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
                customPassword: "sha256_e04b1c139d165f32519cafcc8b6f544dcf8e66a0cecbef905ef38631722d7b86",
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
                const avatarSrc = sanitizeAvatarUrl(u.avatar) || defaultAvatar;

                if (navAvatarImg) navAvatarImg.src = avatarSrc;
                if (cardAvatarImg) cardAvatarImg.src = avatarSrc;
                if (cardName) cardName.innerText = u.fullName || u.username;

                // Phân quyền hiển thị "Kết nối Google Drive" và "Quản lý người dùng" ngoài màn hình quản trị
                // Chỉ Super Admin và Admin mới thấy
                const isPrivileged = (u.role === 'super_admin' || u.role === 'admin');
                const headerDriveBtn = document.getElementById('adminHeaderDriveBtn');
                const headerUsersBtn = document.getElementById('adminHeaderUsersBtn');
                if (headerDriveBtn) headerDriveBtn.classList.toggle('hidden', !isPrivileged);
                if (headerUsersBtn) headerUsersBtn.classList.toggle('hidden', !isPrivileged);
            }
        } else {
            if (navLoginBtn) navLoginBtn.classList.remove('hidden');
            if (navAdminControls) navAdminControls.classList.add('hidden');
            const headerDriveBtn = document.getElementById('adminHeaderDriveBtn');
            const headerUsersBtn = document.getElementById('adminHeaderUsersBtn');
            if (headerDriveBtn) headerDriveBtn.classList.add('hidden');
            if (headerUsersBtn) headerUsersBtn.classList.add('hidden');
            closeProfileDropdown();
        }
    }

    function updateProfileDropdownUI() {
        const chevron = document.getElementById('profileOpenAdminChevron');
        const card = document.getElementById('profileHeaderActionCard');
        const currentView = (typeof App !== 'undefined' && typeof App.getCurrentView === 'function')
            ? App.getCurrentView()
            : '';

        const isInAdmin = (currentView === 'admin' || currentView === 'manage-album');

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

        // 1. Luôn ưu tiên lấy danh sách người dùng mới nhất trực tiếp từ Firebase Database
        let users = getUsersList();
        if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
            try {
                const cloudUsers = await FirebaseModule.getUsersOnce();
                if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
                    users = cloudUsers;
                    applyLatestCloudUsers(cloudUsers);
                }
            } catch (err) {
                console.warn("Chưa lấy được users tức thì từ Firebase, dùng dữ liệu đã đồng bộ:", err);
            }
        }

        // 2. Tìm tài khoản trong database
        const matched = users.find(u => (u.username && u.username.toLowerCase() === inputUser) && u.active !== false);

        if (matched) {
            // Mật khẩu bắt buộc lấy từ trường customPassword của database
            const storedPass = matched.customPassword || (matched.username === 'admin' ? getAdminPassword() : DEFAULT_PASS);
            const isMatch = await verifyPassword(inputPass, storedPass);
            if (isMatch) {
                // Tự động nâng cấp mã hóa nếu mật khẩu trong DB chưa được mã hóa SHA-256
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

                // Xử lý lưu thông tin tài khoản nếu người dùng tích chọn
                const rememberCheckbox = document.getElementById('rememberPasswordCheckbox');
                if (rememberCheckbox && rememberCheckbox.checked) {
                    try {
                        const creds = {
                            username: matched.username
                        };
                        localStorage.setItem(STORAGE_KEY_REMEMBER, JSON.stringify(creds));
                    } catch (e) {}
                } else {
                    try {
                        localStorage.removeItem(STORAGE_KEY_REMEMBER);
                    } catch (e) {}
                }

                alertBox.classList.add('hidden');
                closeLoginModal();
                checkAuthUI();
                App.showView('admin');
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

    function togglePasswordVisibility(inputId, iconId) {
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);
        if (!input) return;

        if (input.type === 'password') {
            input.type = 'text';
            if (icon) {
                icon.className = 'fa-regular fa-eye-slash';
            }
        } else {
            input.type = 'password';
            if (icon) {
                icon.className = 'fa-regular fa-eye';
            }
        }
    }

    function openLoginModal() {
        const userInput = document.getElementById('usernameInput');
        const passInput = document.getElementById('passwordInput');
        const rememberCheckbox = document.getElementById('rememberPasswordCheckbox');
        const icon = document.getElementById('togglePasswordIcon');

        if (passInput) {
            passInput.type = 'password';
            passInput.value = '';
        }
        if (icon) icon.className = 'fa-regular fa-eye';

        // Khôi phục thông tin đăng nhập đã lưu (nếu có)
        try {
            const rememberedRaw = localStorage.getItem(STORAGE_KEY_REMEMBER);
            if (rememberedRaw) {
                const creds = JSON.parse(rememberedRaw);
                if (creds && creds.username && userInput) {
                    userInput.value = creds.username;
                }
                if (rememberCheckbox) {
                    rememberCheckbox.checked = true;
                }
            } else if (rememberCheckbox) {
                rememberCheckbox.checked = false;
            }
        } catch (e) {}

        document.getElementById('loginModal').classList.remove('hidden');
        if (userInput && !userInput.value) {
            userInput.focus();
        } else if (passInput) {
            passInput.focus();
        }
    }

    function closeLoginModal() {
        const passInput = document.getElementById('passwordInput');
        const icon = document.getElementById('togglePasswordIcon');
        if (passInput) {
            passInput.type = 'password';
            passInput.value = '';
        }
        if (icon) icon.className = 'fa-regular fa-eye';
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
        const roleColors = {
            'super_admin': 'bg-purple-100 text-purple-800 border-purple-200',
            'admin': 'bg-indigo-100 text-indigo-800 border-indigo-200',
            'editor': 'bg-emerald-100 text-emerald-800 border-emerald-200'
        };

        container.innerHTML = users.map(u => {
            const safeAvatar = escapeHtml(sanitizeAvatarUrl(u.avatar || ''));
            const safeFullName = escapeHtml(u.fullName || '');
            const safeUsername = escapeHtml(u.username || '');
            const safeInitials = escapeHtml((u.fullName || u.username || 'UN').slice(0, 2).toUpperCase());
            const safeEmail = escapeHtml(u.email || 'user@dihastory.vn');
            const safeRoleName = escapeHtml(ROLE_FULL_NAMES[u.role] || u.role || '');
            return `
            <div class="p-3.5 rounded-2xl border ${u.role === 'super_admin' ? 'border-purple-200 bg-purple-50/40' : (u.role === 'admin' ? 'border-indigo-200 bg-indigo-50/40' : 'border-zinc-200 bg-white')} flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="relative">
                        <div class="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-400 text-white flex items-center justify-center font-bold text-sm">
                            ${safeAvatar ? `<img src="${safeAvatar}" alt="${safeFullName}" class="w-full h-full object-cover">` : safeInitials}
                        </div>
                        <span class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
                    </div>
                    <div class="min-w-0">
                        <div class="font-bold text-zinc-900 text-sm truncate">${safeFullName} (${safeUsername})</div>
                        <div class="text-[11px] text-zinc-500 truncate">${safeEmail} • ${safeRoleName}</div>
                    </div>
                </div>
                <span class="px-2.5 py-1 rounded-full border ${roleColors[u.role] || 'bg-zinc-100 text-zinc-700'} text-[11px] font-bold shrink-0">
                    ${ROLE_LABELS[u.role] || 'Editor'}
                </span>
            </div>
        `}).join('');
    }

    function renderUsersPageList() {
        const users = getUsersList();
        const currentUser = getCurrentUser();
        const curLevel = currentUser ? getRoleLevel(currentUser.role) : 1;

        const totalEl = document.getElementById('usersPageTotalCount');
        const superEl = document.getElementById('usersPageSuperAdminCount');
        const adminEl = document.getElementById('usersPageAdminCount');
        const editorEl = document.getElementById('usersPageEditorCount');
        const container = document.getElementById('usersPageListContainer');

        if (totalEl) totalEl.innerText = users.length;
        if (superEl) superEl.innerText = users.filter(u => u.role === 'super_admin').length;
        if (adminEl) adminEl.innerText = users.filter(u => u.role === 'admin').length;
        if (editorEl) editorEl.innerText = users.filter(u => u.role === 'editor').length;

        // Chỉ hiển thị nút "Thêm Người Dùng" nếu người đăng nhập là Admin hoặc Super Admin (curLevel >= 2)
        const addUserBtn = document.getElementById('addUserBtnOnPage');
        if (addUserBtn) {
            if (curLevel >= 2) {
                addUserBtn.classList.remove('hidden');
            } else {
                addUserBtn.classList.add('hidden');
            }
        }

        if (!container) return;

        const roleBadges = {
            'super_admin': '<span class="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200"><i class="fa-solid fa-crown mr-1 text-[11px]"></i>Super Admin</span>',
            'admin': '<span class="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200"><i class="fa-solid fa-shield-halved mr-1 text-[11px]"></i>Admin</span>',
            'editor': '<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><i class="fa-solid fa-wand-magic-sparkles mr-1 text-[11px]"></i>Editor</span>'
        };

        container.innerHTML = users.map(u => {
            const isMe = currentUser && (currentUser.id === u.id || currentUser.username === u.username);
            const targetLevel = getRoleLevel(u.role);
            const isAllowedToEdit = isMe || (curLevel > targetLevel);
            const isAllowedToDelete = !isMe && (curLevel > targetLevel) && (u.username !== 'admin');

            const safeAvatar = escapeHtml(sanitizeAvatarUrl(u.avatar || ''));
            const safeFullName = escapeHtml(u.fullName || '');
            const safeUsername = escapeHtml(u.username || '');
            const safeInitials = escapeHtml((u.fullName || u.username || 'UN').slice(0, 2).toUpperCase());
            const safeEmail = escapeHtml(u.email || 'user@dihastory.vn');
            const safeRoleName = escapeHtml(ROLE_FULL_NAMES[u.role] || u.role || '');
            const safeId = escapeHtml(u.id || '');

            return `
            <div class="p-4 sm:p-5 rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 transition shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex items-center gap-3.5 min-w-0">
                    <div class="relative shrink-0">
                        <div class="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-400 text-white flex items-center justify-center font-bold text-base shadow-sm ring-1 ring-zinc-200">
                            ${safeAvatar ? `<img src="${safeAvatar}" alt="${safeFullName}" class="w-full h-full object-cover">` : safeInitials}
                        </div>
                        <span class="absolute bottom-0 right-0 w-3.5 h-3.5 ${u.active ? 'bg-emerald-500' : 'bg-zinc-400'} border-2 border-white rounded-full"></span>
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-zinc-900 text-base leading-tight truncate">${safeFullName}</span>
                            <span class="text-xs text-zinc-400">@${safeUsername}</span>
                            ${isMe ? '<span class="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">Bạn</span>' : ''}
                        </div>
                        <div class="text-xs text-zinc-500 mt-0.5 truncate flex items-center gap-2">
                            <span><i class="fa-regular fa-envelope text-[11px] mr-1"></i>${safeEmail}</span>
                            <span>•</span>
                            <span class="font-medium text-zinc-600">${safeRoleName}</span>
                        </div>
                    </div>
                </div>

                <div class="flex flex-wrap items-center gap-2.5 shrink-0 self-end md:self-auto">
                    ${roleBadges[u.role] || roleBadges['editor']}

                    ${isAllowedToEdit ? `
                    <button type="button" onclick="AuthModule.openEditUserModal('${safeId}')"
                        class="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold transition flex items-center gap-1.5">
                        <i class="fa-solid fa-user-pen text-xs"></i>
                        <span>Chỉnh sửa</span>
                    </button>
                    ` : ''}

                    ${isAllowedToDelete ? `
                    <button type="button" onclick="AuthModule.deleteUser('${safeId}')"
                        class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition flex items-center gap-1.5">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                        <span>Xóa</span>
                    </button>
                    ` : ''}
                </div>
            </div>
            `;
        }).join('');
    }

    function updateAvatarPreviewInModal(avatarUrl, displayName) {
        const previewWrap = document.getElementById('editUserAvatarPreviewWrap');
        const img = document.getElementById('editUserAvatarImg');
        const text = document.getElementById('editUserAvatarText');
        if (!previewWrap || !img || !text) return;

        const safeSrc = sanitizeAvatarUrl(avatarUrl);
        if (safeSrc) {
            img.setAttribute('src', encodeURI(safeSrc));
            img.classList.remove('hidden');
            text.classList.add('hidden');
        } else {
            img.removeAttribute('src');
            img.classList.add('hidden');
            text.classList.remove('hidden');
            text.innerText = (displayName || 'UN').slice(0, 2).toUpperCase();
        }
    }

    function handleAvatarFileSelect(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Vui lòng chọn file hình ảnh (JPG, PNG, WEBP...)');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const rawDataUrl = e.target.result;
            // Nén ảnh avatar nhỏ gọn (tối đa 250x250) để lưu database nhẹ và nhanh
            const tempImg = new Image();
            tempImg.onload = function () {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 240;
                let width = tempImg.width;
                let height = tempImg.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height = Math.round((height * MAX_SIZE) / width);
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width = Math.round((width * MAX_SIZE) / height);
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(tempImg, 0, 0, width, height);

                const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
                const avatarInput = document.getElementById('editUserAvatar');
                if (avatarInput) avatarInput.value = optimizedDataUrl;

                updateAvatarPreviewInModal(optimizedDataUrl, '');
            };
            tempImg.src = rawDataUrl;
        };
        reader.readAsDataURL(file);
    }

    function openAddUserModal() {
        const currentUser = getCurrentUser();
        const curLevel = currentUser ? getRoleLevel(currentUser.role) : 1;

        if (curLevel < 2) {
            alert('Bạn là Editor, không có quyền thêm thành viên mới vào hệ thống!');
            return;
        }

        const modal = document.getElementById('userEditModal');
        const title = document.getElementById('userEditModalTitle');
        if (title) title.innerText = 'Thêm Người Dùng';
        document.getElementById('editUserId').value = '';
        document.getElementById('editUserUsername').value = '';
        document.getElementById('editUserUsername').removeAttribute('readonly');
        document.getElementById('editUserFullName').value = '';
        document.getElementById('editUserEmail').value = '';
        document.getElementById('editUserAvatar').value = '';
        updateAvatarPreviewInModal('', '');
        document.getElementById('editUserPassword').value = '';

        // Tùy chọn vai trò phân quyền
        const roleSelect = document.getElementById('editUserRole');
        if (roleSelect) {
            if (curLevel >= 3) {
                // Super Admin: có thể tạo Super Admin, Admin, hoặc Editor
                roleSelect.innerHTML = `
                    <option value="super_admin">1. Super Admin (Chủ sở hữu Studio / Toàn quyền)</option>
                    <option value="admin">2. Admin (Quản trị viên Studio / Quản lý Editor & Album)</option>
                    <option value="editor" selected>3. Editor (Nhiếp ảnh gia phụ / Chỉnh sửa album)</option>
                `;
            } else {
                // Admin (cấp 2): chỉ có thể tạo Editor (cấp 1)
                roleSelect.innerHTML = `
                    <option value="editor" selected>3. Editor (Nhiếp ảnh gia phụ / Chỉnh sửa album)</option>
                `;
            }
            roleSelect.removeAttribute('disabled');
        }

        if (modal) modal.classList.remove('hidden');
    }

    function openEditUserModal(userId) {
        const users = getUsersList();
        const targetUser = users.find(u => u.id === userId);
        if (!targetUser) return;

        const currentUser = getCurrentUser();
        if (!canModifyUser(currentUser, targetUser)) {
            alert('Bạn không có quyền chỉnh sửa tài khoản có cấp bậc bằng hoặc cao hơn bạn!');
            return;
        }

        const modal = document.getElementById('userEditModal');
        const title = document.getElementById('userEditModalTitle');
        const isSelf = currentUser && (currentUser.id === targetUser.id || currentUser.username === targetUser.username);

        if (title) title.innerText = isSelf ? 'Chỉnh sửa thông tin cá nhân' : `Chỉnh Sửa: ${targetUser.fullName}`;

        document.getElementById('editUserId').value = targetUser.id;
        document.getElementById('editUserUsername').value = targetUser.username;
        if (targetUser.username === 'admin' || isSelf) {
            document.getElementById('editUserUsername').setAttribute('readonly', 'true');
        } else {
            document.getElementById('editUserUsername').removeAttribute('readonly');
        }
        document.getElementById('editUserFullName').value = targetUser.fullName || '';
        document.getElementById('editUserEmail').value = targetUser.email || '';
        document.getElementById('editUserAvatar').value = targetUser.avatar || '';
        updateAvatarPreviewInModal(targetUser.avatar, targetUser.fullName || targetUser.username);
        document.getElementById('editUserPassword').value = '';

        // Phân quyền cho dropdown vai trò
        const roleSelect = document.getElementById('editUserRole');
        const curLevel = currentUser ? getRoleLevel(currentUser.role) : 1;

        if (roleSelect) {
            if (isSelf) {
                // Tự sửa chính mình: không được tự ý đổi quyền của mình
                const validRole = ROLE_LABELS[targetUser.role] ? targetUser.role : 'editor';
                roleSelect.textContent = '';
                const opt = document.createElement('option');
                opt.value = validRole;
                opt.selected = true;
                opt.textContent = ROLE_LABELS[validRole];
                roleSelect.appendChild(opt);
                roleSelect.setAttribute('disabled', 'true');
            } else if (curLevel === 3) {
                // Super Admin: có thể set cả 3 quyền cho cấp dưới
                roleSelect.innerHTML = `
                    <option value="super_admin" ${targetUser.role === 'super_admin' ? 'selected' : ''}>1. Super Admin (Chủ sở hữu Studio / Toàn quyền)</option>
                    <option value="admin" ${targetUser.role === 'admin' ? 'selected' : ''}>2. Admin (Quản trị viên Studio / Quản lý Editor & Album)</option>
                    <option value="editor" ${targetUser.role === 'editor' ? 'selected' : ''}>3. Editor (Nhiếp ảnh gia phụ / Chỉnh sửa album)</option>
                `;
                roleSelect.removeAttribute('disabled');
            } else {
                // Admin cấp 2 chỉ có thể sửa Editor cấp 1
                roleSelect.innerHTML = `<option value="editor" selected>3. Editor (Nhiếp ảnh gia phụ)</option>`;
                roleSelect.setAttribute('disabled', 'true');
            }
        }

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
        const currentUser = getCurrentUser();
        const curLevel = currentUser ? getRoleLevel(currentUser.role) : 1;

        if (id) {
            // Edit existing user
            const idx = users.findIndex(u => u.id === id);
            if (idx >= 0) {
                const targetUser = users[idx];
                if (!canModifyUser(currentUser, targetUser)) {
                    alert('Bạn không có quyền chỉnh sửa tài khoản có cấp bậc bằng hoặc cao hơn bạn!');
                    return;
                }

                users[idx].fullName = fullName;
                users[idx].email = email;
                // Nếu tự sửa chính mình thì giữ nguyên role, cấp trên mới có quyền đổi role cấp dưới
                const isSelf = currentUser && (currentUser.id === targetUser.id || currentUser.username === targetUser.username);
                if (!isSelf && (curLevel > getRoleLevel(targetUser.role) || curLevel === 3)) {
                    users[idx].role = role;
                    users[idx].roleName = ROLE_FULL_NAMES[role] || role;
                }
                users[idx].avatar = avatar;
                if (pass) {
                    const hashedPass = await hashPassword(pass);
                    users[idx].customPassword = hashedPass;
                    if (users[idx].username === 'admin') {
                        localStorage.setItem(STORAGE_KEY_PASSWORD, hashedPass);
                    }
                }
                if (isSelf) {
                    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(users[idx]));
                    updateProfileDropdownUI();
                }
            }
        } else {
            // Add new user (Chỉ Super Admin & Admin mới có quyền thêm)
            if (curLevel < 2) {
                alert('Editor không có quyền thêm tài khoản mới!');
                return;
            }
            if (users.some(u => u.username === username)) {
                alert('Tên đăng nhập này đã tồn tại!');
                return;
            }
            // Kiểm tra quyền khi gán vai trò:
            // Super Admin (cấp 3) có thể tạo super_admin, admin hoặc editor.
            // Admin (cấp 2) chỉ có thể tạo editor (cấp 1).
            let assignedRole = 'editor';
            if (curLevel >= 3) {
                assignedRole = ['super_admin', 'admin', 'editor'].includes(role) ? role : 'editor';
            } else if (curLevel === 2) {
                assignedRole = 'editor';
            }
            const hashedPass = await hashPassword(pass || '123456');
            const newUser = {
                id: 'usr_' + Date.now(),
                username,
                fullName,
                email: email || `${username}@dihastory.vn`,
                role: assignedRole,
                roleName: ROLE_FULL_NAMES[assignedRole] || assignedRole,
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

        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const curLevel = getRoleLevel(currentUser.role);
        const targetLevel = getRoleLevel(target.role);

        // Chỉ cấp trên mới có quyền xóa cấp dưới (không được tự xóa chính mình hoặc xóa người bằng/hơn cấp)
        if (curLevel <= targetLevel || currentUser.id === target.id) {
            alert('Bạn không có quyền xóa tài khoản có cấp bậc bằng hoặc cao hơn bạn!');
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
        togglePasswordVisibility,
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
        getUsersList,
        handleAvatarFileSelect
    };
})();
