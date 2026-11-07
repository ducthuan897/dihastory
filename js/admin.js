/**
 * AdminModule - Quản lý danh sách nhiều Album theo chuẩn Shotpik:
 * - Tạo Album từ Google Drive / Local
 * - Tên miền album tuỳ chỉnh (slug), Tags (tối đa 5 tag)
 * - Lời nhắc cho khách hàng (Popup khi khách mở link)
 * - Hạn chọn ảnh (Đếm ngược & tự khoá chọn khi hết hạn)
 * - Nút "Hoàn tất chọn ảnh" (Tự khoá chọn sau khi khách gửi kết quả, Admin mở lại bất cứ lúc nào)
 */
const AdminModule = (function () {
    const STORAGE_KEY_ALBUMS = "shotpik_multi_albums_v2";
    const STORAGE_KEY_SELECTIONS_MAP = "shotpik_multi_selections_v2";
    const STORAGE_KEY_SUBMISSIONS_MAP = "shotpik_multi_submissions_v2";

    // State for Shotpik "Tạo album" Modal
    let createModalSourceTab = 'drive'; // 'drive' | 'local'
    let createModalDriveLinks = [];
    let createModalTags = [];
    let createModalLocalFilesData = [];

    const DEFAULT_ALBUMS = [
        {
            id: "wedding-minhquan-lananh",
            title: "Wedding: Minh Quân & Lan Anh",
            clientName: "Minh Quân & Lan Anh",
            date: "2026-11-07",
            city: "Đà Lạt",
            location: "Dalat Palace Heritage, Đà Lạt",
            photographer: "Đức Thuận Studio",
            selectionLimit: 10,
            pinCode: "",
            isPublic: true,
            tags: ["Đà Lạt", "Wedding", "Pre-Wedding"],
            sourceType: "drive",
            driveLinks: ["https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ"],
            reminderEnabled: true,
            reminderText: "Chào Minh Quân & Lan Anh! Hai bạn vui lòng thả tim chọn 10 tấm ảnh ưng ý nhất để Studio tiến hành chỉnh sửa chi tiết và in ảnh cổng trước ngày 15/11 nhé!",
            deadlineEnabled: true,
            deadlineAt: "2026-11-15T23:59",
            completeLockEnabled: true,
            isSelectionLockedBySubmit: false,
            youtubeId: "dQw4w9WgXcQ",
            coverUrl: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1800&q=85",
            description: "Bộ ảnh phóng sự cưới và ngoại cảnh bình minh tại Đà Lạt.",
            photos: [
                { id: "p1", code: "IMG_1001", location: "Đồi Thông Đa Phú - Đà Lạt", capturedAt: "2026-11-07T05:45", title: "Sương sớm đồi thông", url: "https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80" },
                { id: "p2", code: "IMG_1002", location: "Đồi Thông Đa Phú - Đà Lạt", capturedAt: "2026-11-07T06:15", title: "Nắng mai chạm ngõ", url: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80" },
                { id: "p3", code: "IMG_1003", location: "Đồi Thông Đa Phú - Đà Lạt", capturedAt: "2026-11-07T06:50", title: "Khoảnh khắc nắm tay", url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80" },
                { id: "p4", code: "IMG_1004", location: "Đồi Thông Đa Phú - Đà Lạt", capturedAt: "2026-11-07T07:20", title: "Hẹn ước trăm năm", url: "https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1200&q=80" },
                { id: "p5", code: "IMG_1005", location: "Nhà Thờ Con Gà - Đà Lạt", capturedAt: "2026-11-07T09:30", title: "Cô dâu chuẩn bị lễ", url: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80" },
                { id: "p6", code: "IMG_1006", location: "Nhà Thờ Con Gà - Đà Lạt", capturedAt: "2026-11-07T10:05", title: "Hoa cưới tinh khôi", url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80" },
                { id: "p7", code: "IMG_1007", location: "Nhà Thờ Con Gà - Đà Lạt", capturedAt: "2026-11-07T10:40", title: "Nghi thức trao nhẫn", url: "https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=1200&q=80" },
                { id: "p8", code: "IMG_1008", location: "Nhà Thờ Con Gà - Đà Lạt", capturedAt: "2026-11-07T11:15", title: "Nụ cười hạnh phúc", url: "https://images.unsplash.com/photo-1591604466107-ec97de577aff?auto=format&fit=crop&w=1200&q=80" },
                { id: "p9", code: "IMG_1009", location: "Dalat Palace Heritage - Đà Lạt", capturedAt: "2026-11-07T17:10", title: "Chiều hoàng hôn bên hồ", url: "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1200&q=80" },
                { id: "p10", code: "IMG_1010", location: "Dalat Palace Heritage - Đà Lạt", capturedAt: "2026-11-07T18:30", title: "Không gian bàn tiệc tối", url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80" },
                { id: "p11", code: "IMG_1011", location: "Dalat Palace Heritage - Đà Lạt", capturedAt: "2026-11-07T19:15", title: "Điệu nhảy đầu tiên", url: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=80" },
                { id: "p12", code: "IMG_1012", location: "Dalat Palace Heritage - Đà Lạt", capturedAt: "2026-11-07T20:00", title: "Nâng ly chúc mừng", url: "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=1200&q=80" }
            ]
        },
        {
            id: "couple-phuquoc-sunset",
            title: "Love Story: Hoàng Hôn Phú Quốc",
            clientName: "Hoàng Nam & Bảo Ngọc",
            date: "2026-11-02",
            city: "Phú Quốc",
            location: "Sunset Sanato & Bãi Sao, Phú Quốc",
            photographer: "Đức Thuận Studio",
            selectionLimit: 12,
            pinCode: "",
            isPublic: true,
            tags: ["Phú Quốc", "Couple", "Sunset"],
            sourceType: "drive",
            driveLinks: [],
            reminderEnabled: false,
            reminderText: "",
            deadlineEnabled: false,
            deadlineAt: "",
            completeLockEnabled: true,
            isSelectionLockedBySubmit: false,
            youtubeId: "L_LUpnjgPso",
            coverUrl: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1800&q=85",
            description: "Kỷ niệm 5 năm bên nhau giữa biển xanh và hoàng hôn đảo ngọc Phú Quốc.",
            photos: [
                { id: "c1", code: "RAW_3011", location: "Bãi Sao - Phú Quốc", capturedAt: "2026-11-02T14:30", title: "Bước chân trên cát trắng", url: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=80" },
                { id: "c2", code: "RAW_3012", location: "Bãi Sao - Phú Quốc", capturedAt: "2026-11-02T15:10", title: "Tiếng cười bên sóng biển", url: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1200&q=80" },
                { id: "c3", code: "RAW_3013", location: "Bãi Sao - Phú Quốc", capturedAt: "2026-11-02T15:45", title: "Gió biển dịu êm", url: "https://images.unsplash.com/photo-1474552226712-ac0f0961a954?auto=format&fit=crop&w=1200&q=80" },
                { id: "c4", code: "RAW_3014", location: "Sunset Sanato - Phú Quốc", capturedAt: "2026-11-02T17:05", title: "Ánh nắng chiều tà", url: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=80" },
                { id: "c5", code: "RAW_3015", location: "Sunset Sanato - Phú Quốc", capturedAt: "2026-11-02T17:35", title: "Ôm trọn hoàng hôn", url: "https://images.unsplash.com/photo-1545232972-90466c963042?auto=format&fit=crop&w=1200&q=80" },
                { id: "c6", code: "RAW_3016", location: "Sunset Sanato - Phú Quốc", capturedAt: "2026-11-02T17:55", title: "Bản tình ca biển đảo", url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80" }
            ]
        },
        {
            id: "muse-dalat-portrait",
            title: "Muse Concept: Nàng Thơ Mùa Thu",
            clientName: "Khánh Linh",
            date: "2026-10-25",
            city: "Đà Lạt",
            location: "Hồ Tuyền Lâm & Dốc Nhà Bò, Đà Lạt",
            photographer: "Đức Thuận Studio",
            selectionLimit: 8,
            pinCode: "",
            isPublic: true,
            tags: ["Đà Lạt", "Portrait", "Muse"],
            sourceType: "local",
            driveLinks: [],
            reminderEnabled: false,
            reminderText: "",
            deadlineEnabled: false,
            deadlineAt: "",
            completeLockEnabled: false,
            isSelectionLockedBySubmit: false,
            youtubeId: "jfKfPfyJRdk",
            coverUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1800&q=85",
            description: "Bộ ảnh chân dung nàng thơ phong cách màu phim trong trẻo tại Đà Lạt.",
            photos: [
                { id: "m1", code: "DSC_2001", location: "Hồ Tuyền Lâm - Đà Lạt", capturedAt: "2026-10-25T08:00", title: "Ánh nhìn trong veo", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=80" },
                { id: "m2", code: "DSC_2002", location: "Hồ Tuyền Lâm - Đà Lạt", capturedAt: "2026-10-25T08:35", title: "Nắng sớm bên hồ", url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80" },
                { id: "m3", code: "DSC_2003", location: "Hồ Tuyền Lâm - Đà Lạt", capturedAt: "2026-10-25T09:15", title: "Góc nghiêng thần thái", url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80" },
                { id: "m4", code: "DSC_2004", location: "Hồ Tuyền Lâm - Đà Lạt", capturedAt: "2026-10-25T09:50", title: "Gió chiều thảo nguyên", url: "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=1200&q=80" },
                { id: "m5", code: "DSC_2005", location: "Dốc Nhà Bò - Đà Lạt", capturedAt: "2026-10-25T15:20", title: "Màu phim hoài niệm", url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80" },
                { id: "m6", code: "DSC_2006", location: "Dốc Nhà Bò - Đà Lạt", capturedAt: "2026-10-25T16:00", title: "Dạo bước phố hoa", url: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1200&q=80" },
                { id: "m7", code: "DSC_2007", location: "Dốc Nhà Bò - Đà Lạt", capturedAt: "2026-10-25T16:30", title: "Chiều thu lắng đọng", url: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1200&q=80" },
                { id: "m8", code: "DSC_2008", location: "Dốc Nhà Bò - Đà Lạt", capturedAt: "2026-10-25T17:00", title: "Nét đẹp tự nhiên", url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80" }
            ]
        },
        {
            id: "private-hanoi-autumn",
            title: "Pre-Wedding: Tuấn Kiệt & Mai Phương",
            clientName: "Tuấn Kiệt & Mai Phương",
            date: "2026-11-05",
            city: "Hà Nội",
            location: "Phố Cổ & Hồ Gươm, Hà Nội",
            photographer: "Đức Thuận Studio",
            selectionLimit: 15,
            pinCode: "",
            isPublic: false,
            tags: ["Hà Nội", "Pre-Wedding", "Mùa Thu"],
            sourceType: "drive",
            driveLinks: ["https://drive.google.com/drive/folders/1HanoiAutumnFolderDemo"],
            reminderEnabled: true,
            reminderText: "Chào Tuấn Kiệt & Mai Phương! Đây là link ảnh gốc buổi chụp tại Hà Nội, hai bạn bấm thả tim chọn 15 ảnh để Studio hậu kỳ nhé.",
            deadlineEnabled: true,
            deadlineAt: "2026-11-20T23:59",
            completeLockEnabled: true,
            isSelectionLockedBySubmit: false,
            youtubeId: "",
            coverUrl: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1800&q=85",
            description: "Album riêng tư gửi link trực tiếp cho khách hàng chọn ảnh in (Không hiển thị ngoài Trang Chủ).",
            photos: [
                { id: "h1", code: "HN_4001", location: "Hồ Gươm - Hà Nội", capturedAt: "2026-11-05T06:30", title: "Thu Hà Nội bên hồ", url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80" },
                { id: "h2", code: "HN_4002", location: "Hồ Gươm - Hà Nội", capturedAt: "2026-11-05T07:15", title: "Nắng thu dịu ngọt", url: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80" },
                { id: "h3", code: "HN_4003", location: "Phố Phan Đình Phùng - Hà Nội", capturedAt: "2026-11-05T08:45", title: "Con đường lá sấu", url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80" },
                { id: "h4", code: "HN_4004", location: "Phố Phan Đình Phùng - Hà Nội", capturedAt: "2026-11-05T09:20", title: "Xe hoa mùa thu", url: "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1200&q=80" }
            ]
        }
    ];

    let activeAdminAlbumId = DEFAULT_ALBUMS[0].id;

    function getAllAlbums() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ALBUMS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {
            console.error(e);
        }
        const initial = JSON.parse(JSON.stringify(DEFAULT_ALBUMS));
        saveAllAlbums(initial);
        return initial;
    }

    function saveAllAlbums(albums) {
        localStorage.setItem(STORAGE_KEY_ALBUMS, JSON.stringify(albums));
    }

    function getAlbumById(albumId) {
        const albums = getAllAlbums();
        return albums.find(a => a.id === albumId) || albums[0];
    }

    function getActiveAdminAlbum() {
        return getAlbumById(activeAdminAlbumId);
    }

    function getClientShareUrl(albumId) {
        const base = window.location.origin + window.location.pathname;
        return `${base}?album=${encodeURIComponent(albumId)}`;
    }

    function getSelectionsMap() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_SELECTIONS_MAP);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.error(e);
        }
        return {};
    }

    function getSelections(albumId) {
        const id = albumId || App.getCurrentAlbumId();
        const map = getSelectionsMap();
        return map[id] || {};
    }

    function saveSelections(selections, albumId) {
        const id = albumId || App.getCurrentAlbumId();
        const map = getSelectionsMap();
        map[id] = selections;
        localStorage.setItem(STORAGE_KEY_SELECTIONS_MAP, JSON.stringify(map));
    }

    function getSubmissionsMap() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_SUBMISSIONS_MAP);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.error(e);
        }
        return {};
    }

    function getSubmissions(albumId) {
        const id = albumId || activeAdminAlbumId;
        const map = getSubmissionsMap();
        return map[id] || [];
    }

    function addSubmission(sub, albumId) {
        const id = albumId || App.getCurrentAlbumId();
        const map = getSubmissionsMap();
        if (!map[id]) map[id] = [];
        map[id].unshift(sub);
        localStorage.setItem(STORAGE_KEY_SUBMISSIONS_MAP, JSON.stringify(map));
    }

    function extractYouTubeID(url) {
        if (!url) return "";
        url = url.trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : "";
    }

    function slugify(str) {
        return (str || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
    }

    // ==================== SHOTPIK "TẠO ALBUM" MODAL LOGIC ====================

    function openCreateAlbumModal() {
        createModalSourceTab = 'drive';
        createModalDriveLinks = [];
        createModalTags = [];
        createModalLocalFilesData = [];

        const resetIds = [
            'createAlbumDriveInput',
            'createAlbumTitleInput',
            'createAlbumClientInput',
            'createAlbumSlugInput',
            'createAlbumTagInput',
            'createAlbumCityInput',
            'createAlbumReminderText'
        ];
        resetIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const slugInput = document.getElementById('createAlbumSlugInput');
        if (slugInput) slugInput.dataset.manual = '';

        const dateInput = document.getElementById('createAlbumDateInput');
        if (dateInput) dateInput.value = "2026-11-07";

        const deadlineInput = document.getElementById('createAlbumDeadlineInput');
        if (deadlineInput) deadlineInput.value = "2026-11-15T23:59";

        const reminderToggle = document.getElementById('createAlbumReminderToggle');
        if (reminderToggle) reminderToggle.checked = false;

        const deadlineToggle = document.getElementById('createAlbumDeadlineToggle');
        if (deadlineToggle) deadlineToggle.checked = false;

        const completeLockToggle = document.getElementById('createAlbumCompleteLockToggle');
        if (completeLockToggle) completeLockToggle.checked = true;

        const publicToggle = document.getElementById('createAlbumPublicInput');
        if (publicToggle) publicToggle.checked = false;

        switchCreateAlbumTab('drive');
        renderCreateModalDriveLinks();
        renderCreateModalTags();
        renderCreateModalLocalPreview();
        handleCreateModalToggleChange();

        document.getElementById('createAlbumModal').classList.remove('hidden');
    }

    function closeCreateAlbumModal() {
        document.getElementById('createAlbumModal').classList.add('hidden');
    }

    function switchCreateAlbumTab(tabName) {
        createModalSourceTab = tabName;
        const tabDriveBtn = document.getElementById('tabBtnDrive');
        const tabLocalBtn = document.getElementById('tabBtnLocal');
        const driveSection = document.getElementById('createModalDriveSection');
        const localSection = document.getElementById('createModalLocalSection');

        if (tabName === 'drive') {
            if (tabDriveBtn) tabDriveBtn.className = "pb-2.5 text-sm font-semibold text-rose-600 border-b-2 border-rose-600 transition";
            if (tabLocalBtn) tabLocalBtn.className = "pb-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 border-b-2 border-transparent transition";
            if (driveSection) driveSection.classList.remove('hidden');
            if (localSection) localSection.classList.add('hidden');
        } else {
            if (tabLocalBtn) tabLocalBtn.className = "pb-2.5 text-sm font-semibold text-rose-600 border-b-2 border-rose-600 transition";
            if (tabDriveBtn) tabDriveBtn.className = "pb-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 border-b-2 border-transparent transition";
            if (localSection) localSection.classList.remove('hidden');
            if (driveSection) driveSection.classList.add('hidden');
        }
    }

    function handleCreateTitleInput(val) {
        const slugInput = document.getElementById('createAlbumSlugInput');
        if (slugInput && !slugInput.dataset.manual) {
            slugInput.value = slugify(val);
        }
    }

    function addDriveLinkToCreateModal() {
        const input = document.getElementById('createAlbumDriveInput');
        if (!input) return;
        const val = input.value.trim();
        if (!val) {
            App.showToast("Vui lòng dán link thư mục hoặc ảnh Google Drive!", "error");
            return;
        }
        createModalDriveLinks.push(val);
        input.value = '';
        renderCreateModalDriveLinks();
    }

    function removeDriveLinkFromCreateModal(idx) {
        createModalDriveLinks.splice(idx, 1);
        renderCreateModalDriveLinks();
    }

    function renderCreateModalDriveLinks() {
        const container = document.getElementById('createAlbumDriveLinksList');
        if (!container) return;
        if (!createModalDriveLinks.length) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = createModalDriveLinks.map((link, idx) => `
            <div class="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-1.5 rounded-lg text-xs">
                <div class="flex items-center gap-2 min-w-0">
                    <i class="fa-brands fa-google-drive text-emerald-600 shrink-0"></i>
                    <span class="truncate font-mono text-[11px]">${link}</span>
                </div>
                <button type="button" onclick="AdminModule.removeDriveLinkFromCreateModal(${idx})" class="text-zinc-400 hover:text-rose-600 shrink-0">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `).join('');
    }

    function addTagToCreateModal() {
        const input = document.getElementById('createAlbumTagInput');
        if (!input) return;
        const val = input.value.trim();
        if (!val) return;

        if (createModalTags.length >= 5) {
            App.showToast("Tối đa 5 tag cho mỗi Album!", "error");
            return;
        }
        if (!createModalTags.includes(val)) {
            createModalTags.push(val);
        }
        input.value = '';
        renderCreateModalTags();
    }

    function removeTagFromCreateModal(idx) {
        createModalTags.splice(idx, 1);
        renderCreateModalTags();
    }

    function renderCreateModalTags() {
        const container = document.getElementById('createAlbumTagsList');
        if (!container) return;
        if (!createModalTags.length) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = createModalTags.map((tag, idx) => `
            <span class="inline-flex items-center gap-1.5 bg-zinc-200/80 text-zinc-800 text-xs font-medium px-2.5 py-1 rounded-full">
                <span>#${tag}</span>
                <button type="button" onclick="AdminModule.removeTagFromCreateModal(${idx})" class="text-zinc-500 hover:text-rose-600">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </span>
        `).join('');
    }

    function handleCreateModalLocalFiles(event) {
        const files = event.target.files;
        if (!files || !files.length) return;

        let loaded = 0;
        Array.from(files).forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const cleanName = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
                let capturedAt = "2026-11-07T08:30";
                if (file.lastModified) {
                    const d = new Date(file.lastModified);
                    capturedAt = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                }
                createModalLocalFilesData.push({
                    code: cleanName.length <= 16 ? cleanName : `IMG_${1001 + idx}`,
                    title: file.name,
                    capturedAt,
                    url: e.target.result
                });
                loaded++;
                if (loaded === files.length) {
                    renderCreateModalLocalPreview();
                }
            };
            reader.readAsDataURL(file);
        });
    }

    function renderCreateModalLocalPreview() {
        const el = document.getElementById('createModalLocalCount');
        if (!el) return;
        if (!createModalLocalFilesData.length) {
            el.innerText = "Chưa chọn file nào";
        } else {
            el.innerText = `Đã chọn sẵn ${createModalLocalFilesData.length} ảnh từ máy tính`;
        }
    }

    function handleCreateModalToggleChange() {
        const reminderOn = document.getElementById('createAlbumReminderToggle')?.checked;
        const deadlineOn = document.getElementById('createAlbumDeadlineToggle')?.checked;

        const reminderBox = document.getElementById('createAlbumReminderExpand');
        const deadlineBox = document.getElementById('createAlbumDeadlineExpand');

        if (reminderBox) reminderBox.classList.toggle('hidden', !reminderOn);
        if (deadlineBox) deadlineBox.classList.toggle('hidden', !deadlineOn);
    }

    function extractGoogleDriveFileId(url) {
        const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }

    function buildSamplePhotosFromDriveLinks(driveLinks, city, date) {
        const samplePool = [
            { code: "DRV_0101", title: "Khoảnh khắc mở đầu", url: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80", time: "07:30" },
            { code: "DRV_0102", title: "Ánh nắng ban mai", url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80", time: "08:15" },
            { code: "DRV_0103", title: "Nụ cười rạng rỡ", url: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80", time: "09:00" },
            { code: "DRV_0104", title: "Góc máy nghệ thuật", url: "https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80", time: "10:20" },
            { code: "DRV_0105", title: "Chiều hoàng hôn lãng mạn", url: "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1200&q=80", time: "16:45" },
            { code: "DRV_0106", title: "Kỷ niệm đáng nhớ", url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80", time: "17:30" }
        ];

        const photos = [];
        // Check if any link is a direct file link
        driveLinks.forEach((link, idx) => {
            const fileId = extractGoogleDriveFileId(link);
            if (fileId && !link.includes('/folders/')) {
                photos.push({
                    id: "drv_file_" + Date.now() + "_" + idx,
                    code: `DRV_${1001 + idx}`,
                    location: `${city}`,
                    capturedAt: `${date}T09:${(10 + idx * 5).toString().padStart(2, '0')}`,
                    title: `Ảnh Google Drive #${idx + 1}`,
                    url: `https://lh3.googleusercontent.com/d/${fileId}=w1600`
                });
            }
        });

        // If folder links were provided (or no direct file links), import sample Drive folder photos so user can immediately preview & set cover
        if (driveLinks.length > 0 && photos.length === 0) {
            samplePool.forEach((item, idx) => {
                const loc = idx < 3 ? `Điểm chụp Sáng - ${city}` : `Điểm chụp Chiều - ${city}`;
                photos.push({
                    id: "drv_folder_" + Date.now() + "_" + idx,
                    code: item.code,
                    location: loc,
                    capturedAt: `${date}T${item.time}`,
                    title: item.title,
                    url: item.url
                });
            });
        }
        return photos;
    }

    function createNewAlbum(event) {
        if (event) event.preventDefault();

        // Check if user left a link or tag in the input without clicking '+'
        const pendingDrive = document.getElementById('createAlbumDriveInput')?.value.trim();
        if (pendingDrive && !createModalDriveLinks.includes(pendingDrive)) {
            createModalDriveLinks.push(pendingDrive);
        }
        const pendingTag = document.getElementById('createAlbumTagInput')?.value.trim();
        if (pendingTag && createModalTags.length < 5 && !createModalTags.includes(pendingTag)) {
            createModalTags.push(pendingTag);
        }

        const title = (document.getElementById('createAlbumTitleInput')?.value || '').trim();
        if (!title) {
            App.showToast("Vui lòng nhập Tên album!", "error");
            return;
        }

        const clientName = (document.getElementById('createAlbumClientInput')?.value || '').trim() || "Khách Hàng";
        const rawSlug = (document.getElementById('createAlbumSlugInput')?.value || '').trim();
        const cityInput = (document.getElementById('createAlbumCityInput')?.value || '').trim();
        const city = cityInput || (createModalTags[0] ? createModalTags[0] : "Đà Lạt");
        const date = (document.getElementById('createAlbumDateInput')?.value || '').trim() || "2026-11-07";

        const reminderEnabled = !!document.getElementById('createAlbumReminderToggle')?.checked;
        const reminderText = (document.getElementById('createAlbumReminderText')?.value || '').trim() || `Chào ${clientName}! Mời bạn xem và thả tim chọn những bức ảnh ưng ý nhất trong Album nhé.`;

        const deadlineEnabled = !!document.getElementById('createAlbumDeadlineToggle')?.checked;
        const deadlineAt = (document.getElementById('createAlbumDeadlineInput')?.value || '').trim() || "2026-11-15T23:59";
        const selectionLimit = parseInt(document.getElementById('createAlbumLimitInput')?.value || '15', 10) || 0;

        const completeLockEnabled = !!document.getElementById('createAlbumCompleteLockToggle')?.checked;
        const isPublic = !!document.getElementById('createAlbumPublicInput')?.checked;

        const baseSlug = slugify(rawSlug || title) || ("album-" + Date.now());
        const albums = getAllAlbums();
        const uniqueId = albums.some(a => a.id === baseSlug) ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

        let initialPhotos = [];
        if (createModalSourceTab === 'local' && createModalLocalFilesData.length > 0) {
            initialPhotos = createModalLocalFilesData.map((f, idx) => ({
                id: "loc_" + Date.now() + "_" + idx,
                code: f.code,
                location: `${city}`,
                capturedAt: f.capturedAt,
                title: f.title,
                url: f.url
            }));
        } else if (createModalDriveLinks.length > 0) {
            initialPhotos = buildSamplePhotosFromDriveLinks(createModalDriveLinks, city, date);
        }

        const defaultCover = initialPhotos.length > 0
            ? initialPhotos[0].url
            : "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1800&q=85";

        const newAlbum = {
            id: uniqueId,
            title,
            clientName,
            date,
            city,
            location: `${city}, Việt Nam`,
            photographer: "Đức Thuận Studio",
            selectionLimit,
            pinCode: "",
            isPublic,
            tags: [...createModalTags],
            sourceType: createModalSourceTab,
            driveLinks: [...createModalDriveLinks],
            reminderEnabled,
            reminderText,
            deadlineEnabled,
            deadlineAt,
            completeLockEnabled,
            isSelectionLockedBySubmit: false,
            youtubeId: "",
            coverUrl: defaultCover,
            description: `Album ${title} của khách hàng ${clientName} (${city}).`,
            photos: initialPhotos
        };

        albums.unshift(newAlbum);
        saveAllAlbums(albums);
        activeAdminAlbumId = newAlbum.id;

        closeCreateAlbumModal();
        populateAdminDashboard(newAlbum.id);
        App.renderHomeShowcase();
        App.showToast(`Đã tạo Album "${title}"! Bạn có thể chọn ảnh và nhấn "Đặt làm ảnh bìa".`);
    }

    // ==================== ADMIN DASHBOARD FUNCTIONS ====================

    function populateAdminDashboard(targetAlbumId) {
        const albums = getAllAlbums();
        if (targetAlbumId && albums.some(a => a.id === targetAlbumId)) {
            activeAdminAlbumId = targetAlbumId;
        } else if (!albums.some(a => a.id === activeAdminAlbumId)) {
            activeAdminAlbumId = albums[0].id;
        }

        renderAdminAlbumsTable();
        populateSelectedAlbumEditor();
    }

    function selectAlbumForEditing(albumId) {
        activeAdminAlbumId = albumId;
        renderAdminAlbumsTable();
        populateSelectedAlbumEditor();
    }

    function unlockAlbumSelectionForClient(albumId) {
        const albums = getAllAlbums();
        const target = albums.find(a => a.id === (albumId || activeAdminAlbumId));
        if (!target) return;

        target.isSelectionLockedBySubmit = false;
        saveAllAlbums(albums);
        populateAdminDashboard();
        App.renderPublicAlbum();
        App.showToast(`Đã mở khoá lại phần chọn ảnh cho khách hàng (${target.title})!`);
    }

    function renderAdminAlbumsTable() {
        const container = document.getElementById('adminAlbumsListContainer');
        const totalBadge = document.getElementById('adminTotalAlbumsBadge');
        if (!container) return;

        const albums = getAllAlbums();
        const selectionsMap = getSelectionsMap();

        if (totalBadge) {
            const publicCount = albums.filter(a => a.isPublic).length;
            totalBadge.innerText = `${albums.length} Album (${publicCount} Công khai trên Trang chủ)`;
        }

        const sorted = [...albums].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        container.innerHTML = sorted.map(album => {
            const isEditing = album.id === activeAdminAlbumId;
            const sel = selectionsMap[album.id] || {};
            const selectedCount = album.photos.filter(p => sel[p.id] && sel[p.id].selected).length;
            const shareLink = getClientShareUrl(album.id);
            const tagsHtml = (album.tags || []).map(t => `<span class="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">#${t}</span>`).join('');

            return `
                <div
                    class="p-4 rounded-2xl border transition ${
                        isEditing
                            ? 'border-zinc-900 bg-zinc-900/5 ring-2 ring-zinc-900/10'
                            : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }"
                >
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <!-- Album Info -->
                        <div class="flex items-start sm:items-center gap-3.5 cursor-pointer" onclick="AdminModule.selectAlbumForEditing('${album.id}')">
                            <img src="${album.coverUrl}" alt="${album.title}" class="w-16 h-16 rounded-xl object-cover border border-zinc-200 shrink-0">
                            <div>
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <h3 class="text-sm font-bold text-zinc-900">${album.title}</h3>
                                    ${
                                        album.sourceType === 'drive'
                                            ? '<span class="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-semibold"><i class="fa-brands fa-google-drive mr-1"></i>Google Drive</span>'
                                            : '<span class="text-[10px] bg-zinc-100 text-zinc-700 border border-zinc-200 px-2 py-0.5 rounded-full font-semibold"><i class="fa-solid fa-hard-drive mr-1"></i>Local</span>'
                                    }
                                    ${
                                        album.isPublic
                                            ? '<span class="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold"><i class="fa-solid fa-globe mr-1"></i>Đang chiếu Trang chủ</span>'
                                            : '<span class="text-[10px] bg-zinc-100 text-zinc-600 border border-zinc-200 px-2 py-0.5 rounded-full font-semibold"><i class="fa-solid fa-lock mr-1"></i>Chỉ gửi Link riêng</span>'
                                    }
                                    ${
                                        album.isSelectionLockedBySubmit
                                            ? '<span class="text-[10px] bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full font-bold"><i class="fa-solid fa-lock mr-1"></i>Đã khoá chọn (Khách đã hoàn tất)</span>'
                                            : ''
                                    }
                                </div>
                                <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-1">
                                    <span><i class="fa-regular fa-calendar mr-1"></i>${album.date}</span>
                                    <span><i class="fa-solid fa-location-dot mr-1 text-rose-500"></i>${album.city}</span>
                                    <span><i class="fa-regular fa-images mr-1"></i>${album.photos.length} ảnh</span>
                                    <span class="text-rose-600 font-semibold"><i class="fa-solid fa-heart mr-1"></i>Khách chọn: ${selectedCount}/${album.selectionLimit || '∞'}</span>
                                    ${album.deadlineEnabled && album.deadlineAt ? `<span class="text-amber-700"><i class="fa-regular fa-clock mr-1"></i>Hạn: ${formatTimeShort(album.deadlineAt)}</span>` : ''}
                                </div>
                                ${tagsHtml ? `<div class="flex flex-wrap gap-1 mt-1.5">${tagsHtml}</div>` : ''}
                            </div>
                        </div>

                        <!-- Quick Actions -->
                        <div class="flex flex-wrap items-center gap-2 shrink-0">
                            ${
                                album.isSelectionLockedBySubmit
                                    ? `<button
                                        type="button"
                                        onclick="AdminModule.unlockAlbumSelectionForClient('${album.id}')"
                                        class="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-sm"
                                        title="Mở khoá lại cho khách chọn tiếp"
                                    >
                                        <i class="fa-solid fa-lock-open"></i>
                                        <span>Mở lại cho khách chọn</span>
                                    </button>`
                                    : ''
                            }

                            <button
                                type="button"
                                onclick="AdminModule.toggleAlbumPublic('${album.id}')"
                                class="px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                                    album.isPublic
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                        : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:bg-zinc-200'
                                }"
                            >
                                <i class="fa-solid ${album.isPublic ? 'fa-toggle-on text-emerald-600 text-sm' : 'fa-toggle-off text-zinc-400 text-sm'}"></i>
                                <span>${album.isPublic ? 'Công khai' : 'Ẩn Trang chủ'}</span>
                            </button>

                            <button
                                type="button"
                                onclick="AdminModule.copyAlbumClientLink('${album.id}')"
                                class="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold transition flex items-center gap-1.5"
                            >
                                <i class="fa-solid fa-link"></i>
                                <span>Copy Link Khách</span>
                            </button>

                            <button
                                type="button"
                                onclick="App.openAlbumPage('${album.id}')"
                                class="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold transition flex items-center gap-1.5"
                            >
                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                <span>Mở Trang Album</span>
                            </button>

                            <button
                                type="button"
                                onclick="AdminModule.selectAlbumForEditing('${album.id}')"
                                class="px-3 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-800 border border-zinc-300 text-xs font-semibold transition"
                            >
                                <i class="fa-solid fa-pen-to-square mr-1"></i>Sửa / Đặt ảnh bìa
                            </button>

                            ${
                                albums.length > 1
                                    ? `<button
                                        type="button"
                                        onclick="AdminModule.deleteAlbum('${album.id}')"
                                        class="p-1.5 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                        title="Xoá Album này"
                                    >
                                        <i class="fa-solid fa-trash-can"></i>
                                    </button>`
                                    : ''
                            }
                        </div>
                    </div>

                    <!-- Generated Client Link Bar -->
                    <div class="mt-3 pt-2.5 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-zinc-400 font-medium shrink-0">Tên miền album:</span>
                            <code class="font-mono text-[11px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded truncate">https://ducthuanstudio.shotpik.com/albums/${album.id}</code>
                            <span class="text-zinc-300">•</span>
                            <code class="font-mono text-[11px] bg-amber-50 text-amber-900 px-2 py-0.5 rounded truncate">${shareLink}</code>
                        </div>
                        <span class="text-[11px] text-zinc-400 shrink-0">Mã Album: <strong class="font-mono text-zinc-600">${album.id}</strong></span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function populateSelectedAlbumEditor() {
        const album = getActiveAdminAlbum();
        if (!album) return;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val !== undefined && val !== null ? val : "";
        };

        const setChk = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!val;
        };

        const editingBadge = document.getElementById('editingAlbumNameBadge');
        if (editingBadge) editingBadge.innerText = album.title;

        const shareInput = document.getElementById('adminActiveAlbumShareUrl');
        if (shareInput) shareInput.value = getClientShareUrl(album.id);

        setVal('adminAlbumTitle', album.title);
        setVal('adminClientName', album.clientName);
        setVal('adminShootDate', album.date);
        setVal('adminCity', album.city || "Đà Lạt");
        setVal('adminLocation', album.location);
        setVal('adminDescription', album.description || "");
        setVal('adminCoverUrl', album.coverUrl);
        setVal('adminSelectionLimit', album.selectionLimit || 10);
        setVal('adminPinCode', album.pinCode || "");
        setVal('adminYoutubeUrl', album.youtubeId ? `https://www.youtube.com/watch?v=${album.youtubeId}` : "");

        setChk('adminIsPublicCheckbox', album.isPublic);
        setChk('adminReminderEnabledCheckbox', album.reminderEnabled);
        setVal('adminReminderTextInput', album.reminderText || "");
        setChk('adminDeadlineEnabledCheckbox', album.deadlineEnabled);
        setVal('adminDeadlineAtInput', album.deadlineAt || "");
        setChk('adminCompleteLockCheckbox', album.completeLockEnabled);

        setVal('newPhotoLocation', album.location ? `${album.location.split(',')[0]} - ${album.city}` : album.city);
        setVal('newPhotoTime', `${album.date || '2026-11-07'}T08:30`);

        renderAdminPhotosList();
        renderAdminClientSelections();
    }

    function toggleAlbumPublic(albumId) {
        const albums = getAllAlbums();
        const target = albums.find(a => a.id === albumId);
        if (!target) return;

        target.isPublic = !target.isPublic;
        saveAllAlbums(albums);
        populateAdminDashboard();
        App.renderHomeShowcase();
        App.showToast(
            target.isPublic
                ? `Đã bật hiển thị "${target.title}" lên Trang Chủ công khai!`
                : `Đã chuyển "${target.title}" sang chế độ Riêng tư (Chỉ truy cập qua link).`
        );
    }

    function deleteAlbum(albumId) {
        const albums = getAllAlbums();
        if (albums.length <= 1) {
            App.showToast("Cần giữ lại ít nhất 1 Album trong hệ thống!", "error");
            return;
        }
        const filtered = albums.filter(a => a.id !== albumId);
        saveAllAlbums(filtered);
        if (activeAdminAlbumId === albumId) {
            activeAdminAlbumId = filtered[0].id;
        }
        populateAdminDashboard();
        App.renderHomeShowcase();
        App.showToast("Đã xoá Album khỏi hệ thống.");
    }

    function copyAlbumClientLink(albumId) {
        const id = albumId || activeAdminAlbumId;
        const link = getClientShareUrl(id);
        navigator.clipboard.writeText(link).then(() => {
            App.showToast(`Đã sao chép Link gửi khách: ${link}`);
        }).catch(() => {
            App.showToast(`Link gửi khách: ${link}`);
        });
    }

    function saveAlbumSettings(event) {
        if (event) event.preventDefault();
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;

        album.title = document.getElementById('adminAlbumTitle').value.trim() || "Album Khách Hàng";
        album.clientName = document.getElementById('adminClientName').value.trim() || "Khách Hàng";
        album.date = document.getElementById('adminShootDate').value.trim() || "2026-11-07";
        album.city = document.getElementById('adminCity').value.trim() || "Đà Lạt";
        album.location = document.getElementById('adminLocation').value.trim() || album.city;
        album.description = document.getElementById('adminDescription').value.trim();
        album.coverUrl = document.getElementById('adminCoverUrl').value.trim() || album.coverUrl;
        album.selectionLimit = parseInt(document.getElementById('adminSelectionLimit').value, 10) || 0;
        album.pinCode = document.getElementById('adminPinCode').value.trim();
        album.isPublic = document.getElementById('adminIsPublicCheckbox').checked;

        album.reminderEnabled = !!document.getElementById('adminReminderEnabledCheckbox')?.checked;
        album.reminderText = (document.getElementById('adminReminderTextInput')?.value || '').trim();
        album.deadlineEnabled = !!document.getElementById('adminDeadlineEnabledCheckbox')?.checked;
        album.deadlineAt = (document.getElementById('adminDeadlineAtInput')?.value || '').trim();
        album.completeLockEnabled = !!document.getElementById('adminCompleteLockCheckbox')?.checked;

        const ytInput = document.getElementById('adminYoutubeUrl').value.trim();
        album.youtubeId = ytInput ? (extractYouTubeID(ytInput) || album.youtubeId) : "";

        saveAllAlbums(albums);
        populateAdminDashboard();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast("Đã lưu thông tin cài đặt Album thành công!");
    }

    function addPhotoByUrl(event) {
        if (event) event.preventDefault();
        const urlInput = document.getElementById('newPhotoUrl');
        const codeInput = document.getElementById('newPhotoCode');
        const locInput = document.getElementById('newPhotoLocation');
        const timeInput = document.getElementById('newPhotoTime');
        const titleInput = document.getElementById('newPhotoTitle');

        let url = urlInput.value.trim();
        if (!url) {
            App.showToast("Vui lòng nhập đường dẫn URL ảnh hoặc link Google Drive!", "error");
            return;
        }

        // Convert Google Drive link if pasted here
        const drvId = extractGoogleDriveFileId(url);
        if (drvId && !url.includes('/folders/')) {
            url = `https://lh3.googleusercontent.com/d/${drvId}=w1600`;
        }

        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;

        const nextNum = 1001 + album.photos.length;
        const code = codeInput.value.trim() || `IMG_${nextNum}`;
        const location = locInput.value.trim() || `${album.location || album.city}`;
        const capturedAt = timeInput.value.trim() || `${album.date}T09:00`;
        const title = titleInput.value.trim() || `Ảnh ${code}`;

        album.photos.push({
            id: "photo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            code,
            location,
            capturedAt,
            title,
            url
        });

        if (album.photos.length === 1) {
            album.coverUrl = url;
        }

        saveAllAlbums(albums);
        urlInput.value = "";
        codeInput.value = "";
        titleInput.value = "";

        populateAdminDashboard();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast(`Đã thêm ảnh ${code} vào Album!`);
    }

    function handleLocalFilesUpload(event) {
        const files = event.target.files;
        if (!files || !files.length) return;

        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;

        const locInput = document.getElementById('newPhotoLocation');
        const baseTimeInput = document.getElementById('newPhotoTime');
        const location = (locInput && locInput.value.trim()) ? locInput.value.trim() : (album.location || album.city);
        const fallbackDate = (baseTimeInput && baseTimeInput.value) ? baseTimeInput.value : `${album.date}T08:00`;

        let processed = 0;
        Array.from(files).forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const cleanName = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
                const code = cleanName.length <= 16 ? cleanName : `IMG_${1001 + album.photos.length + idx}`;

                let capturedAt = fallbackDate;
                if (file.lastModified) {
                    const d = new Date(file.lastModified);
                    capturedAt = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                }

                album.photos.push({
                    id: "local_" + Date.now() + "_" + idx,
                    code,
                    location,
                    capturedAt,
                    title: file.name,
                    url: e.target.result
                });

                if (album.photos.length === 1) {
                    album.coverUrl = e.target.result;
                }

                processed++;
                if (processed === files.length) {
                    saveAllAlbums(albums);
                    populateAdminDashboard();
                    App.renderHomeShowcase();
                    App.renderPublicAlbum();
                    App.showToast(`Đã tải lên ${files.length} ảnh vào "${album.title}"!`);
                    event.target.value = "";
                }
            };
            reader.readAsDataURL(file);
        });
    }

    function deletePhoto(photoId) {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;

        album.photos = album.photos.filter(p => p.id !== photoId);
        saveAllAlbums(albums);
        populateAdminDashboard();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast("Đã xoá ảnh khỏi Album.");
    }

    function setPhotoAsCover(url, targetAlbumId) {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === (targetAlbumId || activeAdminAlbumId));
        if (!album) return;

        album.coverUrl = url;
        saveAllAlbums(albums);
        populateAdminDashboard();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast("Đã đặt ảnh này làm Ảnh bìa Album thành công!");
    }

    function lockAlbumAfterClientSubmit(albumId) {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === albumId);
        if (album && album.completeLockEnabled) {
            album.isSelectionLockedBySubmit = true;
            saveAllAlbums(albums);
        }
    }

    function renderAdminPhotosList() {
        const container = document.getElementById('adminPhotosGrid');
        const countBadge = document.getElementById('adminPhotoCountBadge');
        if (!container) return;

        const album = getActiveAdminAlbum();
        if (countBadge) countBadge.innerText = `${album.photos.length} ảnh`;

        if (!album.photos.length) {
            container.innerHTML = `<div class="col-span-full text-center py-8 text-xs text-zinc-400">Album này chưa có ảnh nào. Hãy tải ảnh lên ở khung bên trên!</div>`;
            return;
        }

        const sortedPhotos = [...album.photos].sort((a, b) => (a.capturedAt || '').localeCompare(b.capturedAt || ''));

        container.innerHTML = sortedPhotos.map(photo => {
            const timeLabel = formatTimeShort(photo.capturedAt);
            const isCover = album.coverUrl === photo.url;
            return `
                <div class="group relative bg-zinc-100 rounded-xl overflow-hidden border ${isCover ? 'border-amber-500 ring-2 ring-amber-400' : 'border-zinc-200'} aspect-square">
                    <img src="${photo.url}" alt="${photo.code}" class="w-full h-full object-cover">
                    ${isCover ? '<span class="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shadow">Ảnh bìa</span>' : ''}
                    <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition flex flex-col justify-between p-2.5">
                        <div class="flex justify-between items-start">
                            <span class="text-[10px] bg-black/70 text-white px-2 py-0.5 rounded font-mono">${photo.code}</span>
                            <button type="button" onclick="AdminModule.deletePhoto('${photo.id}')" title="Xoá ảnh" class="w-6 h-6 rounded-lg bg-white/90 hover:bg-rose-600 hover:text-white text-rose-600 text-xs flex items-center justify-center transition">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                        <div class="space-y-1.5">
                            <button
                                type="button"
                                onclick="AdminModule.setPhotoAsCover('${photo.url}')"
                                class="w-full py-1 px-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold transition flex items-center justify-center gap-1 shadow"
                            >
                                <i class="fa-solid fa-image"></i> Đặt làm ảnh bìa
                            </button>
                            <span class="text-[10px] text-amber-300 font-medium block truncate"><i class="fa-solid fa-location-dot mr-1"></i>${photo.location || album.city}</span>
                            <span class="text-[9px] text-zinc-300 block"><i class="fa-regular fa-clock mr-1"></i>${timeLabel}</span>
                        </div>
                    </div>
                    <div class="group-hover:hidden absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between bg-black/65 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded font-mono">
                        <span>${photo.code}</span>
                        <span class="text-amber-300 truncate max-w-[70px]">${photo.location || ''}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderAdminClientSelections() {
        const album = getActiveAdminAlbum();
        const selections = getSelections(album.id);
        const submissions = getSubmissions(album.id);

        const selectedPhotos = album.photos.filter(p => selections[p.id] && (selections[p.id].selected || (selections[p.id].note && selections[p.id].note.trim())));
        const codesList = album.photos.filter(p => selections[p.id] && selections[p.id].selected).map(p => p.code);

        const lightroomBox = document.getElementById('lightroomCodesOutput');
        if (lightroomBox) {
            lightroomBox.value = codesList.length ? codesList.join(', ') : '';
        }

        const countEl = document.getElementById('adminSelectedCountLabel');
        if (countEl) {
            countEl.innerText = `${codesList.length} / ${album.selectionLimit || '∞'} ảnh đã chọn`;
        }

        const lockBanner = document.getElementById('adminAlbumLockStatusBanner');
        if (lockBanner) {
            if (album.isSelectionLockedBySubmit) {
                lockBanner.classList.remove('hidden');
            } else {
                lockBanner.classList.add('hidden');
            }
        }

        const listContainer = document.getElementById('adminClientSelectedList');
        if (listContainer) {
            if (!selectedPhotos.length) {
                listContainer.innerHTML = `
                    <div class="text-center py-8 text-zinc-400 text-xs">
                        <i class="fa-regular fa-heart text-2xl mb-2 block"></i>
                        Khách hàng chưa thả tim hoặc ghi chú ảnh nào trong Album "${album.title}".
                    </div>
                `;
            } else {
                listContainer.innerHTML = selectedPhotos.map(p => {
                    const st = selections[p.id] || {};
                    return `
                        <div class="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                            <img src="${p.url}" alt="${p.code}" class="w-14 h-14 rounded-lg object-cover shrink-0">
                            <div class="flex-1 min-w-0">
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <span class="font-mono font-bold text-xs text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200">${p.code}</span>
                                    <span class="text-[11px] text-zinc-500"><i class="fa-solid fa-location-dot mr-1 text-rose-500"></i>${p.location || album.city}</span>
                                    ${st.selected ? '<span class="text-[10px] text-rose-600 font-semibold"><i class="fa-solid fa-heart mr-0.5"></i>Đã chọn</span>' : ''}
                                </div>
                                <p class="text-xs text-zinc-600 mt-1">
                                    ${st.note ? `<span class="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md block"><i class="fa-regular fa-comment-dots mr-1"></i><strong>Ghi chú:</strong> ${st.note}</span>` : '<span class="text-zinc-400 italic text-[11px]">Không có ghi chú riêng</span>'}
                                </p>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        const subContainer = document.getElementById('adminSubmissionsHistory');
        if (subContainer) {
            if (!submissions.length) {
                subContainer.innerHTML = `<p class="text-xs text-zinc-400 italic">Chưa có lượt bấm "Hoàn tất chọn ảnh" nào từ khách hàng cho Album này.</p>`;
            } else {
                subContainer.innerHTML = submissions.map(sub => `
                    <div class="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs space-y-1">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-emerald-950"><i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i>${sub.clientName} (${sub.clientPhone})</span>
                            <span class="text-zinc-400 text-[10px]">${sub.submittedAt}</span>
                        </div>
                        <p class="text-zinc-700"><strong>Mã chọn (${sub.codes.length}):</strong> <span class="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200">${sub.codes.join(', ')}</span></p>
                        ${sub.generalNote ? `<p class="text-zinc-600"><strong>Lời nhắn:</strong> ${sub.generalNote}</p>` : ''}
                    </div>
                `).join('');
            }
        }
    }

    function copyLightroomCodes() {
        const box = document.getElementById('lightroomCodesOutput');
        if (!box || !box.value.trim()) {
            App.showToast("Chưa có mã ảnh nào được khách chọn!", "error");
            return;
        }
        navigator.clipboard.writeText(box.value.trim()).then(() => {
            App.showToast("Đã sao chép danh sách mã file chuẩn Lightroom!");
        });
    }

    function clearClientSelections() {
        saveSelections({}, activeAdminAlbumId);
        const subMap = getSubmissionsMap();
        delete subMap[activeAdminAlbumId];
        localStorage.setItem(STORAGE_KEY_SUBMISSIONS_MAP, JSON.stringify(subMap));

        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (album) {
            album.isSelectionLockedBySubmit = false;
            saveAllAlbums(albums);
        }

        renderAdminAlbumsTable();
        renderAdminClientSelections();
        App.renderPublicAlbum();
        App.showToast("Đã đặt lại danh sách chọn ảnh và mở khoá cho Album này.");
    }

    function resetDemoData() {
        localStorage.removeItem(STORAGE_KEY_ALBUMS);
        localStorage.removeItem(STORAGE_KEY_SELECTIONS_MAP);
        localStorage.removeItem(STORAGE_KEY_SUBMISSIONS_MAP);
        activeAdminAlbumId = DEFAULT_ALBUMS[0].id;
        populateAdminDashboard();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast("Đã khôi phục dữ liệu mẫu ban đầu!");
    }

    function formatTimeShort(isoStr) {
        if (!isoStr) return "";
        const parts = isoStr.split('T');
        const datePart = parts[0] ? parts[0].split('-').reverse().join('/') : '';
        const timePart = parts[1] ? parts[1].slice(0, 5) : '';
        return timePart ? `${timePart} • ${datePart}` : datePart;
    }

    return {
        getAllAlbums,
        getAlbumById,
        getActiveAdminAlbum,
        getClientShareUrl,
        getSelections,
        saveSelections,
        addSubmission,
        populateAdminDashboard,
        selectAlbumForEditing,
        openCreateAlbumModal,
        closeCreateAlbumModal,
        switchCreateAlbumTab,
        handleCreateTitleInput,
        addDriveLinkToCreateModal,
        removeDriveLinkFromCreateModal,
        addTagToCreateModal,
        removeTagFromCreateModal,
        handleCreateModalLocalFiles,
        handleCreateModalToggleChange,
        createNewAlbum,
        unlockAlbumSelectionForClient,
        lockAlbumAfterClientSubmit,
        toggleAlbumPublic,
        deleteAlbum,
        copyAlbumClientLink,
        saveAlbumSettings,
        addPhotoByUrl,
        handleLocalFilesUpload,
        deletePhoto,
        setPhotoAsCover,
        copyLightroomCodes,
        clearClientSelections,
        resetDemoData,
        formatTimeShort
    };
})();
