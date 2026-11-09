/**
 * App Module - Điều phối 3 trang:
 * 1. Trang Chủ (home): Chiếu các dự án công khai, nhóm theo địa điểm & sắp xếp theo thời gian
 * 2. Trang Album (album): Link riêng gửi khách (?album=...) kèm Lời nhắc, Đếm ngược Hạn chọn ảnh,
 *    Nút "Hoàn tất chọn ảnh" tự khoá và nút "Đặt làm ảnh bìa" khi mở ảnh
 * 3. Trang Quản Trị (admin): Quản lý các Album đã tải ảnh lên, Tạo album chuẩn Shotpik (Google Drive / Local)
 */
const App = (function () {
    let currentView = 'home'; // 'home' | 'album' | 'admin'
    let currentAlbumId = 'gian-than-dat-09';
    let isClientMode = false; // true: Giao diện Link gửi khách chọn ảnh, false: Giao diện Trưng bày Trang chủ chỉ xem
    let albumPreviousView = 'home'; // Ghi nhận trang trước đó ('home' | 'admin' | 'manage-album')

    // State for Home Showcase (Page 1)
    let homeLocationFilter = 'ALL';
    let homeTimeSort = 'newest';
    let homeGroupByLocation = true;

    // State for Client Album Page (Page 2)
    let activeCategory = 'ALL';
    let searchQuery = '';
    let albumTimeSort = 'asc';
    let albumGroupByLocation = true;
    let gridCols = 'cols-4';
    let currentFilteredPhotos = [];
    let currentLightboxIndex = -1;
    let isLightboxZoomed = false;
    let isLightboxShowingBefore = false;

    // Lightbox free zoom / pan state
    let _lbScale = 1;
    let _lbPanX = 0;
    let _lbPanY = 0;
    let _lbDragging = false;
    let _lbDragStartX = 0;
    let _lbDragStartY = 0;
    let _lbPanStartX = 0;
    let _lbPanStartY = 0;
    let _lbPinchDist = 0;
    let _lbLastTap = 0;
    let _lbTouchPanX = 0;
    let _lbTouchPanY = 0;
    let _lbPinchCenterX = 0;
    let _lbPinchCenterY = 0;
    let _lbPinchScaleStart = 1;
    let _lbPinchPanStartX = 0;
    let _lbPinchPanStartY = 0;
    const LB_MIN_SCALE = 1;
    const LB_MAX_SCALE = 5;
    let slideshowTimer = null;
    let countdownInterval = null;
    let unlockedPinMap = {};
    let shownReminderSessionMap = {};
    let sessionSelectorNameMap = {};
    let activeNotePhotoId = null;

    // Bộ nhớ đệm lưu HTML các trang content (Modular Multi-Pages Cache)
    const pageHtmlCache = {};

    async function loadPageContent(pageName) {
        if (pageHtmlCache[pageName]) {
            return pageHtmlCache[pageName];
        }
        try {
            const base = getAppBasePath();
            const url = `${base}/pages/${pageName}.html?v=${Date.now()}`;
            const resp = await fetch(url);
            if (resp && resp.ok) {
                const html = await resp.text();
                pageHtmlCache[pageName] = html;
                return html;
            }
        } catch (e) {
            console.error(`Không thể tải trang con pages/${pageName}.html:`, e);
        }
        return '';
    }

    async function ensurePageMounted(pageName) {
        const outlet = document.getElementById('mainContentOutlet');
        if (!outlet) return;

        const targetMap = {
            'home': 'homeView',
            'album': 'publicView',
            'admin': 'adminView',
            'users': 'usersManagementView',
            'manage-album': 'albumManageView'
        };

        const targetId = targetMap[pageName];
        if (targetId && document.getElementById(targetId)) {
            return; // Đã nạp vào DOM
        }

        const html = await loadPageContent(pageName);
        if (html) {
            const temp = document.createElement('div');
            temp.innerHTML = html.trim();
            while (temp.firstChild) {
                outlet.appendChild(temp.firstChild);
            }
        }
    }

    function init() {
        AuthModule.checkAuthUI();
        setupKeyboardShortcuts();
        setupLightboxZoom();
        handleUrlRouting();

        window.addEventListener('popstate', (e) => {
            if (e.state && typeof e.state.isClientMode !== 'undefined') {
                isClientMode = e.state.isClientMode;
            }
            handleUrlRouting(true);
        });

        // Tự động đóng các menu dropdown khi click ra ngoài
        document.addEventListener('click', (e) => {
            if (!e.target.closest('[id^="openAlbumMenuWrap_"]')) {
                document.querySelectorAll('[id^="openAlbumDropdown_"]').forEach(d => d.classList.add('hidden'));
            }
            if (!e.target.closest('#manageMoreFeaturesDropdown') && !e.target.closest('button[onclick*="toggleMoreFeaturesDropdown"]')) {
                const el = document.getElementById('manageMoreFeaturesDropdown');
                if (el) el.classList.add('hidden');
            }
        });

        // 1. Luôn tải bản DB mới nhất từ Cloud ngay khi khởi động
        AdminModule.fetchCloudOrStaticAlbums().then(hasNewData => {
            if (hasNewData) {
                handleUrlRouting(true);
            }
        });

        // 2. Tự động kiểm tra và đồng bộ bản DB mới nhất khi người dùng chuyển lại tab hoặc mở màn hình điện thoại
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                AdminModule.fetchCloudOrStaticAlbums();
            }
        });
        window.addEventListener('focus', () => {
            AdminModule.fetchCloudOrStaticAlbums();
        });

        // 3. Tự động đồng bộ ngầm định kỳ mỗi 15 giây để mọi thiết bị luôn luôn có bản DB mới nhất
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                AdminModule.fetchCloudOrStaticAlbums();
            }
        }, 15000);
    }

    function getAppBasePath() {
        let base = window.location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
        if (window.location.hostname.includes('github.io')) {
            base = '/dihastory'; // Đã cập nhật sang repo mới
        }
        return base || '';
    }

    function parsePathRouting(rawPath) {
        if (!rawPath) return { albumSlug: null, photoCode: null };
        const parts = decodeURIComponent(rawPath).split('/').filter(Boolean);
        if (!parts.length) return { albumSlug: null, photoCode: null };
        const albumSlug = parts[0];
        const photoCode = parts.length > 1 ? parts.slice(1).join('/') : null;
        return { albumSlug, photoCode };
    }

    function buildClientAlbumUrl(albumId, photoCodeParam) {
        const base = getAppBasePath();
        const token = (typeof AdminModule !== 'undefined' && typeof AdminModule.computeAlbumClientToken === 'function')
            ? AdminModule.computeAlbumClientToken(albumId)
            : '';
        const tokenQuery = token ? `?k=${token}` : '?mode=client';
        if (photoCodeParam) {
            return `${base}/${encodeURIComponent(albumId)}/${encodeURIComponent(photoCodeParam)}${tokenQuery}`;
        }
        return `${base}/${encodeURIComponent(albumId)}${tokenQuery}`;
    }

    function handleUrlRouting(skipPush) {
        const params = new URLSearchParams(window.location.search);
        let albumParam = params.get('album');
        let albumPathParam = params.get('album_path');
        const viewParam = params.get('view');
        const modeParam = params.get('mode');
        const clientKeyParam = params.get('k') || params.get('key') || params.get('token');
        let photoCodeParam = params.get('photo');

        // Phân biệt chế độ xem: Khách chọn ảnh qua mã bí mật token (?k=...) hoặc mode=client
        let hasValidClientKey = false;

        // Ưu tiên cao nhất cho view=admin, view=users hoặc view=manage-album
        if (viewParam === 'admin') {
            showView('admin', skipPush);
            return;
        }

        if (viewParam === 'users') {
            showView('users', skipPush);
            return;
        }

        if (viewParam === 'manage-album') {
            if (albumParam) {
                const found = AdminModule.getAlbumById(albumParam);
                if (found) currentAlbumId = found.id;
            }
            AdminModule.openAlbumManagePage(currentAlbumId, skipPush);
            return;
        }

        // 1. Check if redirected from GitHub Pages 404.html
        let savedCleanPath = sessionStorage.getItem('spa_clean_path') || albumPathParam;
        if (savedCleanPath) {
            sessionStorage.removeItem('spa_clean_path');
            const { albumSlug, photoCode } = parsePathRouting(savedCleanPath);
            if (photoCode) photoCodeParam = photoCode;

            const executeRestore = (targetSlug) => {
                const found = AdminModule.getAlbumById(targetSlug);
                if (found) {
                    currentAlbumId = found.id;
                    if (clientKeyParam && typeof AdminModule.verifyAlbumClientToken === 'function') {
                        isClientMode = AdminModule.verifyAlbumClientToken(found.id, clientKeyParam);
                    } else if (modeParam === 'client' || params.get('client') === '1' || params.get('select') === '1') {
                        isClientMode = true;
                    } else {
                        isClientMode = false;
                    }

                    showView('album', true);
                    const base = getAppBasePath();
                    if (photoCodeParam) {
                        const targetPhotoIdx = found.photos.findIndex(p => p.code === photoCodeParam || p.id === photoCodeParam);
                        if (targetPhotoIdx >= 0) {
                            setTimeout(() => openLightbox(targetPhotoIdx), 150);
                        }
                    }
                    const cleanUrl = isClientMode
                        ? buildClientAlbumUrl(targetSlug, photoCodeParam)
                        : (photoCodeParam ?
