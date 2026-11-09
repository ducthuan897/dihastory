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
            base = '/dihastory';
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
        // Nếu có mã bí mật hợp lệ (?k=...) thì tự động mở chế độ Khách Chọn Ảnh (Client Mode)
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
                        : (photoCodeParam ? `${base}/${targetSlug}/${encodeURIComponent(photoCodeParam)}` : `${base}/${targetSlug}`);
                    window.history.replaceState({ view: 'album', albumId: currentAlbumId, isClientMode, photoCode: photoCodeParam }, '', cleanUrl);
                    return true;
                }
                return false;
            };

            if (executeRestore(albumSlug)) return;

            // If opening on a new device, sync from cloud/data and load
            AdminModule.fetchCloudOrStaticAlbums().then(() => {
                executeRestore(albumSlug);
            });
            return;
        }

        // 2. Check if clean URL path /dihastory/<album-slug>/<photo-code> or hash was visited
        if (!albumParam && !viewParam) {
            const rawPath = window.location.pathname.replace(/^\/(?:dutustory|dihastory)\/?/i, '').replace(/^\/+|\/+$/g, '');
            if (rawPath && !rawPath.includes('.') && rawPath !== 'index.html') {
                const { albumSlug, photoCode } = parsePathRouting(rawPath);
                const found = AdminModule.getAlbumById(albumSlug);
                if (found) {
                    albumParam = found.id;
                    if (photoCode) photoCodeParam = photoCode;
                }
            }
            if (!albumParam && window.location.hash) {
                const cleanHash = window.location.hash.replace(/^#\/?/, '').trim();
                if (cleanHash && !cleanHash.startsWith('view=')) {
                    const { albumSlug, photoCode } = parsePathRouting(cleanHash);
                    const found = AdminModule.getAlbumById(albumSlug);
                    if (found) {
                        albumParam = found.id;
                        if (photoCode) photoCodeParam = photoCode;
                    }
                }
            }
        }

        if (albumParam) {
            const found = AdminModule.getAlbumById(albumParam);
            if (found) {
                currentAlbumId = found.id;
                if (clientKeyParam && typeof AdminModule.verifyAlbumClientToken === 'function') {
                    isClientMode = AdminModule.verifyAlbumClientToken(found.id, clientKeyParam);
                } else if (modeParam === 'client' || params.get('client') === '1' || params.get('select') === '1') {
                    isClientMode = true;
                } else {
                    isClientMode = false;
                }
            }
            showView('album', skipPush);
            if (photoCodeParam && found) {
                const targetPhotoIdx = found.photos.findIndex(p => p.code === photoCodeParam || p.id === photoCodeParam);
                if (targetPhotoIdx >= 0) {
                    setTimeout(() => openLightbox(targetPhotoIdx), 150);
                }
            }
        } else {
            showView('home', skipPush);
        }
    }

    function getCurrentAlbumId() {
        return currentAlbumId;
    }

    function getCurrentView() {
        return currentView;
    }

    async function showView(viewName, skipHistoryPush = false) {
        // Tự động nạp động file trang content con nếu chưa có trong DOM
        const targetPage = (viewName === 'manage-album' || viewName === 'users' || viewName === 'admin' || viewName === 'album')
            ? viewName
            : 'home';
        await ensurePageMounted(targetPage);

        const homeView = document.getElementById('homeView');
        const publicView = document.getElementById('publicView');
        const adminView = document.getElementById('adminView');
        const manageView = document.getElementById('albumManageView');
        const usersView = document.getElementById('usersManagementView');
        const mainHeader = document.getElementById('mainTopHeaderBar');
        const navAlbumContextual = document.getElementById('navAlbumContextualControls');

        if (viewName !== 'album' || isClientMode) {
            document.body.classList.remove('view-only-protected');
        }

        if (viewName === 'users') {
            if (!AuthModule.isLoggedIn()) {
                AuthModule.openLoginModal();
                return;
            }
            currentView = 'users';
            if (homeView) homeView.classList.add('hidden');
            if (publicView) publicView.classList.add('hidden');
            if (adminView) adminView.classList.add('hidden');
            if (manageView) manageView.classList.add('hidden');
            if (usersView) usersView.classList.remove('hidden');
            if (mainHeader) mainHeader.classList.remove('hidden');
            if (navAlbumContextual) navAlbumContextual.classList.add('hidden');

            if (!skipHistoryPush) {
                const base = getAppBasePath();
                const cleanBase = base ? `${base}/` : '/';
                const url = `${cleanBase}?view=users`;
                window.history.pushState({ view: 'users' }, '', url);
            }
            if (typeof AuthModule !== 'undefined' && typeof AuthModule.renderUsersPageList === 'function') {
                AuthModule.renderUsersPageList();
            }
        } else if (viewName === 'manage-album') {
            if (!AuthModule.isLoggedIn()) {
                AuthModule.openLoginModal();
                return;
            }
            currentView = 'manage-album';
            if (homeView) homeView.classList.add('hidden');
            if (publicView) publicView.classList.add('hidden');
            if (adminView) adminView.classList.add('hidden');
            if (manageView) manageView.classList.remove('hidden');
            if (usersView) usersView.classList.add('hidden');
            if (mainHeader) mainHeader.classList.remove('hidden');
            if (navAlbumContextual) navAlbumContextual.classList.add('hidden');

            const targetId = AdminModule.getActiveAdminAlbum()?.id || currentAlbumId;
            currentAlbumId = targetId;
            if (!skipHistoryPush) {
                const base = getAppBasePath();
                const cleanBase = base ? `${base}/` : '/';
                const url = `${cleanBase}?view=manage-album&album=${encodeURIComponent(targetId)}`;
                window.history.pushState({ view: 'manage-album', albumId: targetId }, '', url);
            }
            updateActiveNavButtons();
            AdminModule.renderAlbumManagePage();
        } else if (viewName === 'admin') {
            if (!AuthModule.isLoggedIn()) {
                AuthModule.openLoginModal();
                return;
            }
            currentView = 'admin';
            if (homeView) homeView.classList.add('hidden');
            if (publicView) publicView.classList.add('hidden');
            if (adminView) adminView.classList.remove('hidden');
            if (manageView) manageView.classList.add('hidden');
            if (usersView) usersView.classList.add('hidden');
            if (mainHeader) mainHeader.classList.remove('hidden');
            if (navAlbumContextual) navAlbumContextual.classList.add('hidden');

            if (!skipHistoryPush) {
                const base = getAppBasePath();
                const cleanBase = base ? `${base}/` : '/';
                const url = `${cleanBase}?view=admin`;
                window.history.pushState({ view: 'admin' }, '', url);
            }
            AdminModule.populateAdminDashboard();
        } else if (viewName === 'album') {
            currentView = 'album';
            if (homeView) homeView.classList.add('hidden');
            if (publicView) publicView.classList.remove('hidden');
            if (adminView) adminView.classList.add('hidden');
            if (manageView) manageView.classList.add('hidden');
            if (usersView) usersView.classList.add('hidden');
            if (mainHeader) mainHeader.classList.remove('hidden');
            if (navAlbumContextual) {
                if (isClientMode) {
                    navAlbumContextual.classList.remove('hidden');
                } else {
                    navAlbumContextual.classList.add('hidden');
                }
            }

            if (!skipHistoryPush) {
                const base = getAppBasePath();
                const url = isClientMode
                    ? buildClientAlbumUrl(currentAlbumId)
                    : `${base}/${encodeURIComponent(currentAlbumId)}`;
                window.history.pushState({ view: 'album', albumId: currentAlbumId, isClientMode }, '', url);
            }
            renderPublicAlbum();
            if (isClientMode) {
                maybeShowClientReminderModal();
            }
        } else {
            currentView = 'home';
            if (homeView) homeView.classList.remove('hidden');
            if (publicView) publicView.classList.add('hidden');
            if (adminView) adminView.classList.add('hidden');
            if (manageView) manageView.classList.add('hidden');
            if (usersView) usersView.classList.add('hidden');
            if (mainHeader) mainHeader.classList.remove('hidden');
            if (navAlbumContextual) navAlbumContextual.classList.add('hidden');

            if (!skipHistoryPush) {
                const base = getAppBasePath();
                const homeUrl = base ? `${base}/` : '/';
                window.history.pushState({ view: 'home' }, '', homeUrl);
            }
            renderHomeShowcase();
        }

        updateActiveNavButtons();
        if (typeof AuthModule !== 'undefined' && typeof AuthModule.updateProfileDropdownUI === 'function') {
            AuthModule.updateProfileDropdownUI();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateActiveNavButtons() {
        const navHome = document.getElementById('navTabHome');
        const navAlbum = document.getElementById('navTabAlbum');
        const navAdmin = document.getElementById('navTabAdmin');

        const setTabClass = (el, active) => {
            if (!el) return;
            if (active) {
                el.className = "px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-zinc-900 text-white transition flex items-center gap-1.5 shadow-sm";
            } else {
                el.className = "px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition flex items-center gap-1.5";
            }
        };

        setTabClass(navHome, currentView === 'home');
        setTabClass(navAlbum, currentView === 'album');
        setTabClass(navAdmin, currentView === 'admin' || currentView === 'manage-album' || currentView === 'users');
    }

    function openAlbumPage(albumId, isClient = false, fromView = null) {
        if (albumId) {
            currentAlbumId = albumId;
            activeCategory = 'ALL';
            searchQuery = '';
        }
        isClientMode = !!isClient;
        if (fromView) {
            albumPreviousView = fromView;
        } else if (currentView === 'admin' || currentView === 'manage-album') {
            albumPreviousView = currentView;
        } else {
            albumPreviousView = 'home';
        }
        showView('album');
    }

    function handleAlbumBackAction() {
        if (albumPreviousView === 'manage-album') {
            AdminModule.openAlbumManagePage(currentAlbumId);
        } else if (albumPreviousView === 'admin') {
            showView('admin');
        } else {
            showView('home');
        }
    }

    function handleQuickAlbumCodeAccess(event) {
        event.preventDefault();
        const input = document.getElementById('quickAlbumCodeInput');
        if (!input || !input.value.trim()) return;

        let raw = input.value.trim();
        if (raw.includes('album=')) {
            try {
                const u = new URL(raw, window.location.origin);
                raw = u.searchParams.get('album') || raw;
            } catch (e) {}
        } else if (raw.includes('/albums/')) {
            raw = raw.split('/albums/').pop().replace(/\/+$/, '');
        }

        const albums = AdminModule.getAllAlbums();
        const matched = albums.find(a => a.id.toLowerCase() === raw.toLowerCase());
        if (matched) {
            input.value = '';
            openAlbumPage(matched.id, true);
            showToast(`Đang mở Album: ${matched.title}`);
        } else {
            showToast(`Không tìm thấy Album với mã "${raw}"!`, "error");
        }
    }

    // =========================================================================
    // TRANG 1: TRANG CHỦ DỰ ÁN CÔNG KHAI (SORT BY TIME & GROUP BY LOCATION)
    // =========================================================================

    function setHomeLocationFilter(city) {
        homeLocationFilter = city;
        renderHomeShowcase();
    }

    function setHomeTimeSort(sortOrder) {
        homeTimeSort = sortOrder;
        renderHomeShowcase();
    }

    function toggleHomeGroupByLocation() {
        homeGroupByLocation = !homeGroupByLocation;
        renderHomeShowcase();
    }

    // Lấy thời gian của bức ảnh cũ nhất (sớm nhất) trong album để làm mốc sắp xếp
    function getAlbumOldestPhotoTime(album) {
        if (!album || !Array.isArray(album.photos) || !album.photos.length) {
            return album.date || '9999-99-99';
        }
        let oldest = null;
        album.photos.forEach(p => {
            const t = p.capturedAt || '';
            if (t) {
                if (!oldest || t.localeCompare(oldest) < 0) {
                    oldest = t;
                }
            }
        });
        return oldest || album.date || '9999-99-99';
    }

    function renderHomeShowcase() {
        const allAlbums = AdminModule.getAllAlbums();
        const publicAlbums = allAlbums.filter(a => a.isPublic);

        const countEl = document.getElementById('homePublicAlbumsCount');
        if (countEl) countEl.innerText = `${publicAlbums.length} Dự Án Công Khai`;

        // Tự động cập nhật ảnh bìa banner Trang Chủ (Hero Cover) từ Album công khai mới nhất
        const heroCoverEl = document.getElementById('homeStudioHeroCover');
        if (heroCoverEl) {
            // Album công khai đầu tiên trong danh sách (hoặc album đầu tiên nếu chưa có công khai)
            const targetAlbum = publicAlbums[0] || allAlbums[0];
            if (targetAlbum && targetAlbum.coverUrl) {
                heroCoverEl.src = targetAlbum.coverUrl;
            }
        }

        // 1. Sắp xếp danh sách Album theo thời gian của bức ảnh cũ nhất (sớm nhất) trong album
        let sortedAlbums = [...publicAlbums];
        sortedAlbums.sort((a, b) => {
            const timeA = getAlbumOldestPhotoTime(a);
            const timeB = getAlbumOldestPhotoTime(b);
            // Sớm nhất trước (cũ nhất đứng đầu)
            return timeA.localeCompare(timeB);
        });

        const container = document.getElementById('homeShowcaseContainer');
        if (!container) return;

        if (!sortedAlbums.length) {
            container.innerHTML = `
                <div class="text-center py-16 bg-white rounded-3xl border border-zinc-200">
                    <i class="fa-regular fa-folder-open text-3xl text-zinc-300 mb-3 block"></i>
                    <h3 class="text-base font-bold text-zinc-800">Chưa có dự án công khai nào</h3>
                    <p class="text-xs text-zinc-500 mt-1">Nhiếp ảnh gia có thể bật trạng thái "Công khai" cho Album trong Trang Quản Trị.</p>
                </div>
            `;
            return;
        }

        // Trình chiếu danh sách Album tinh gọn, không gom nhóm địa điểm trùng lặp
        container.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 sm:gap-6">
                ${sortedAlbums.map(album => renderHomeAlbumCard(album)).join('')}
            </div>
        `;
    }

    function renderHomeAlbumCard(album) {
        // Tìm bức ảnh cũ nhất (sớm nhất) trong album để hiển thị ngày và vị trí đại diện
        const oldestTime = getAlbumOldestPhotoTime(album);
        const formattedDate = oldestTime && oldestTime !== '9999-99-99'
            ? oldestTime.split('T')[0].split('-').reverse().join('.')
            : (album.date ? album.date.split('-').reverse().join('.') : '');

        return `
            <article
                onclick="App.openAlbumPage('${album.id}', false)"
                class="group bg-white rounded-2xl overflow-hidden border border-zinc-200 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col"
            >
                <div class="relative aspect-[4/3] overflow-hidden bg-zinc-100">
                    <img
                        src="${album.coverUrl}"
                        alt="${album.title}"
                        referrerpolicy="no-referrer"
                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    >
                    <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"></div>

                    <div class="absolute top-3 right-3">
                        <span class="bg-white/90 backdrop-blur-md text-zinc-900 text-[11px] font-bold px-2.5 py-1 rounded-full">
                            <i class="fa-regular fa-images mr-1"></i>${album.photos.length} ảnh
                        </span>
                    </div>

                    <div class="absolute bottom-3 left-3 right-3 text-white">
                        <span class="text-[11px] text-amber-300 font-medium block"><i class="fa-regular fa-clock mr-1"></i>Từ: ${formattedDate}</span>
                        <h3 class="font-serif-display text-2xl font-bold leading-snug">${album.title}</h3>
                    </div>
                </div>

                <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                        <p class="text-xs text-zinc-500 flex items-center gap-1.5">
                            <i class="fa-solid fa-map-pin text-zinc-400"></i>
                            <span class="truncate">${album.location || album.city || ''}</span>
                        </p>
                    </div>

                    <div class="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                        <span class="text-zinc-500">Khách hàng: <strong class="text-zinc-800">${album.clientName}</strong></span>
                        <span class="font-semibold text-zinc-900 group-hover:text-rose-600 transition flex items-center gap-1">
                            Xem Album <i class="fa-solid fa-arrow-right text-[10px]"></i>
                        </span>
                    </div>
                </div>
            </article>
        `;
    }

    // =========================================================================
    // TRANG 2: TRANG ALBUM GỬI KHÁCH (SHOTPIK REMINDER, DEADLINE & COMPLETE LOCK)
    // =========================================================================

    function isAlbumSelectionLocked(album) {
        if (!album) return false;
        if (album.isSelectionLockedBySubmit) return true;
        if (album.deadlineEnabled && album.deadlineAt) {
            const deadlineMs = new Date(album.deadlineAt).getTime();
            if (!isNaN(deadlineMs) && Date.now() > deadlineMs) {
                return true;
            }
        }
        return false;
    }

    function maybeShowClientReminderModal(forceOpen = false) {
        if (!isClientMode && !forceOpen) return;
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;

        if (!forceOpen) {
            if (!album.reminderEnabled || !album.reminderText) return;
            if (shownReminderSessionMap[album.id]) return;
        }

        shownReminderSessionMap[album.id] = true;
        const titleEl = document.getElementById('reminderModalAlbumTitle');
        const textEl = document.getElementById('reminderModalContentText');
        if (titleEl) titleEl.innerText = album.title;
        if (textEl) textEl.innerText = album.reminderText || "Mời bạn xem và thả tim chọn những bức ảnh ưng ý nhất trong Album nhé!";

        const modal = document.getElementById('clientReminderModal');
        if (modal) modal.classList.remove('hidden');
    }

    function closeClientReminderModal() {
        const modal = document.getElementById('clientReminderModal');
        if (modal) modal.classList.add('hidden');
    }

    function updateDeadlineCountdownUI(album) {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }

        const deadlineBanner = document.getElementById('albumDeadlineCountdownBox');
        const lockBanner = document.getElementById('albumSelectionLockedBanner');
        const lockReasonText = document.getElementById('albumSelectionLockedReasonText');
        const unlockBtnAdmin = document.getElementById('albumLockedAdminUnlockBtn');

        const lockedBySubmit = !!album.isSelectionLockedBySubmit;
        const hasDeadline = !!(album.deadlineEnabled && album.deadlineAt);

        const tick = () => {
            let expired = false;
            if (hasDeadline) {
                const diff = new Date(album.deadlineAt).getTime() - Date.now();
                if (diff <= 0) {
                    expired = true;
                    if (deadlineBanner) deadlineBanner.classList.add('hidden');
                } else {
                    if (deadlineBanner) {
                        deadlineBanner.classList.remove('hidden');
                        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                        const mins = Math.floor((diff / (1000 * 60)) % 60);
                        const secs = Math.floor((diff / 1000) % 60);
                        const timerEl = document.getElementById('albumCountdownTimerText');
                        if (timerEl) {
                            timerEl.innerText = `${days} ngày ${hours.toString().padStart(2, '0')}g ${mins.toString().padStart(2, '0')}p ${secs.toString().padStart(2, '0')}s`;
                        }
                    }
                }
            } else {
                if (deadlineBanner) deadlineBanner.classList.add('hidden');
            }

            const isLocked = lockedBySubmit || expired;
            if (isLocked) {
                if (lockBanner) lockBanner.classList.remove('hidden');
                if (lockReasonText) {
                    lockReasonText.innerText = lockedBySubmit
                        ? "Phần chọn ảnh đã được hoàn tất và tự động khoá. Khách hàng vẫn xem và tải ảnh về máy bình thường."
                        : "Thời hạn chọn ảnh của Album này đã kết thúc. Phần chọn ảnh đã tự động khoá.";
                }
                if (unlockBtnAdmin) {
                    const isAdmin = (typeof AuthModule !== 'undefined' && AuthModule.isLoggedIn());
                    if (isAdmin) {
                        unlockBtnAdmin.classList.remove('hidden');
                    } else {
                        unlockBtnAdmin.classList.add('hidden');
                    }
                }
            } else {
                if (lockBanner) lockBanner.classList.add('hidden');
            }
        };

        tick();
        if (hasDeadline) {
            countdownInterval = setInterval(tick, 1000);
        }
    }

    function checkPinProtection(album) {
        if (!album || !album.pinCode || !album.pinCode.trim()) return true;
        if (unlockedPinMap[album.id]) return true;
        if (typeof AuthModule !== 'undefined' && AuthModule.isLoggedIn()) return true;

        const pinOverlay = document.getElementById('pinLockOverlay');
        const pinTitle = document.getElementById('pinLockAlbumTitle');
        const pinInput = document.getElementById('pinCodeInput');
        const pinError = document.getElementById('pinErrorMsg');
        if (pinTitle) pinTitle.innerText = album.title;
        if (pinInput) pinInput.value = '';
        if (pinError) pinError.classList.add('hidden');
        if (pinOverlay) pinOverlay.classList.remove('hidden');
        return false;
    }

    function handlePinUnlock(e) {
        if (e && e.preventDefault) e.preventDefault();
        const input = document.getElementById('pinCodeInput');
        const errorEl = document.getElementById('pinErrorMsg');
        if (!input) return;

        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;

        if (input.value.trim() === album.pinCode.trim()) {
            unlockedPinMap[album.id] = true;
            const pinOverlay = document.getElementById('pinLockOverlay');
            if (pinOverlay) pinOverlay.classList.add('hidden');
            showToast("Mở khoá Album thành công!");
            renderPublicAlbum();
        } else {
            if (errorEl) errorEl.classList.remove('hidden');
            input.focus();
        }
    }

    function renderPublicAlbum() {
        if (typeof AdminModule === 'undefined') return;
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;

        if (!checkPinProtection(album)) return;

        updateDeadlineCountdownUI(album);

        const heroCover = document.getElementById('heroCoverImage');
        const heroClient = document.getElementById('heroClientName');
        const heroTitle = document.getElementById('heroAlbumTitle');
        const heroDate = document.getElementById('heroShootDate');
        const heroLoc = document.getElementById('heroLocation');
        const heroCount = document.getElementById('heroPhotoCount');
        const heroDlBtn = document.getElementById('heroClientDownloadBtn');
        const heroSubmitBtn = document.getElementById('heroClientSubmitBtn');

        if (heroCover) heroCover.src = album.coverUrl || (album.photos[0] ? album.photos[0].url : '');
        if (heroClient) heroClient.innerText = album.clientName || 'Khách hàng';
        if (heroTitle) heroTitle.innerText = album.title || 'Album';
        if (heroDate) heroDate.innerText = album.date ? album.date.split('-').reverse().join('.') : '';
        if (heroLoc) heroLoc.innerText = album.location || album.city || 'Việt Nam';
        if (heroCount) heroCount.innerText = `${album.photos.length} Ảnh`;

        if (isClientMode) {
            if (heroDlBtn) heroDlBtn.classList.remove('hidden');
            if (heroSubmitBtn) heroSubmitBtn.classList.remove('hidden');
            document.body.classList.remove('view-only-protected');
        } else {
            if (heroDlBtn) heroDlBtn.classList.add('hidden');
            if (heroSubmitBtn) heroSubmitBtn.classList.add('hidden');
            document.body.classList.add('view-only-protected');
        }

        renderCategoryTabs(album);
        filterAndRenderPhotos(album);
        updateSelectionUI();
    }

    function renderCategoryTabs(album) {
        const container = document.getElementById('categoryTabsContainer');
        if (!container) return;

        const selections = AdminModule.getSelections(album.id);
        const selectedCount = Object.values(selections).filter(s => s && s.selected).length;

        const locations = ['ALL'];
        album.photos.forEach(p => {
            const loc = p.city || p.location;
            if (loc && !locations.includes(loc)) {
                locations.push(loc);
            }
        });

        let tabsHtml = '';
        locations.forEach(loc => {
            const isActive = activeCategory === loc;
            const label = loc === 'ALL' ? 'Tất cả ảnh' : loc;
            const cls = isActive
                ? "px-3.5 py-1.5 rounded-full text-xs font-semibold bg-zinc-900 text-white shadow-xs shrink-0 cursor-pointer"
                : "px-3.5 py-1.5 rounded-full text-xs font-medium bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200 shrink-0 cursor-pointer";
            tabsHtml += `<button type="button" onclick="App.setCategoryFilter('${loc}')" class="${cls}">${label}</button>`;
        });

        if (isClientMode) {
            const isSelectedActive = activeCategory === 'SELECTED';
            const selCls = isSelectedActive
                ? "px-3.5 py-1.5 rounded-full text-xs font-semibold bg-rose-600 text-white shadow-xs shrink-0 cursor-pointer"
                : "px-3.5 py-1.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 shrink-0 cursor-pointer";
            tabsHtml += `<button type="button" onclick="App.setCategoryFilter('SELECTED')" class="${selCls}"><i class="fa-solid fa-heart mr-1 text-rose-500"></i>Đã chọn (${selectedCount})</button>`;
        }

        container.innerHTML = tabsHtml;
    }

    function filterAndRenderPhotos(album) {
        let photos = [...album.photos];
        const selections = AdminModule.getSelections(album.id);

        if (activeCategory === 'SELECTED') {
            photos = photos.filter(p => selections[p.id] && selections[p.id].selected);
        } else if (activeCategory !== 'ALL') {
            photos = photos.filter(p => (p.city === activeCategory || p.location === activeCategory));
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            photos = photos.filter(p =>
                (p.code && p.code.toLowerCase().includes(q)) ||
                (p.title && p.title.toLowerCase().includes(q)) ||
                (p.location && p.location.toLowerCase().includes(q)) ||
                (p.city && p.city.toLowerCase().includes(q))
            );
        }

        photos.sort((a, b) => {
            const tA = a.capturedAt || '';
            const tB = b.capturedAt || '';
            return albumTimeSort === 'asc' ? tA.localeCompare(tB) : tB.localeCompare(tA);
        });

        currentFilteredPhotos = photos;

        const wrapper = document.getElementById('gallerySectionsWrapper');
        const emptyState = document.getElementById('galleryEmptyState');
        if (!wrapper) return;

        if (!photos.length) {
            wrapper.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }
        if (emptyState) emptyState.classList.add('hidden');

        let gridClass = 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
        if (gridCols === 'cols-3') gridClass = 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
        if (gridCols === 'cols-2') gridClass = 'grid-cols-1 sm:grid-cols-2';

        if (albumGroupByLocation && activeCategory === 'ALL' && !searchQuery.trim()) {
            const groups = {};
            photos.forEach(p => {
                const key = p.city || p.location || 'Chung';
                if (!groups[key]) groups[key] = [];
                groups[key].push(p);
            });

            let groupsHtml = '';
            Object.keys(groups).forEach(grpName => {
                const grpPhotos = groups[grpName];
                groupsHtml += `
                    <div class="mb-10">
                        <div class="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-200">
                            <i class="fa-solid fa-location-dot text-rose-500 text-sm"></i>
                            <h3 class="text-sm sm:text-base font-bold text-zinc-800">${grpName}</h3>
                            <span class="text-xs text-zinc-400 font-medium">(${grpPhotos.length} ảnh)</span>
                        </div>
                        <div class="grid ${gridClass} gap-3 sm:gap-4">
                            ${grpPhotos.map(p => renderPhotoItem(p, album)).join('')}
                        </div>
                    </div>
                `;
            });
            wrapper.innerHTML = groupsHtml;
        } else {
            wrapper.innerHTML = `
                <div class="grid ${gridClass} gap-3 sm:gap-4">
                    ${photos.map(p => renderPhotoItem(p, album)).join('')}
                </div>
            `;
        }
    }

    function renderPhotoItem(photo, album) {
        const selections = AdminModule.getSelections(album.id);
        const sel = selections[photo.id] || {};
        const isSelected = !!sel.selected;
        const noteText = sel.note || '';
        const indexInFiltered = currentFilteredPhotos.findIndex(p => p.id === photo.id);
        const isLocked = isAlbumSelectionLocked(album);

        const heartCls = isSelected
            ? "bg-rose-600 text-white border-rose-600 shadow-sm"
            : "bg-white/80 hover:bg-white text-zinc-700 border-zinc-300";

        const noteCls = noteText
            ? "bg-amber-500 text-white border-amber-500 shadow-sm"
            : "bg-white/80 hover:bg-white text-zinc-700 border-zinc-300";

        const timeStr = photo.capturedAt ? photo.capturedAt.replace('T', ' ') : '';

        return `
            <div class="group relative bg-zinc-100 rounded-xl overflow-hidden shadow-2xs hover:shadow-lg transition-all duration-300 border border-zinc-200/80 flex flex-col select-none">
                <div class="relative aspect-[4/3] overflow-hidden cursor-pointer" onclick="App.openLightbox(${indexInFiltered})">
                    <img
                        src="${photo.url}"
                        alt="${photo.code || photo.title || ''}"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    >
                    <div class="absolute inset-0 bg-black/15 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span class="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] font-mono text-white">
                        ${photo.code || 'IMG'}
                    </span>
                </div>

                ${isClientMode ? `
                    <div class="p-2 sm:p-2.5 bg-white flex items-center justify-between gap-1.5 border-t border-zinc-100">
                        <span class="text-[11px] text-zinc-500 truncate font-mono">${timeStr}</span>
                        <div class="flex items-center gap-1.5">
                            <button
                                type="button"
                                onclick="App.openPhotoNoteModal('${photo.id}')"
                                class="w-7 h-7 rounded-full border flex items-center justify-center text-xs transition ${noteCls}"
                                title="${noteText ? 'Ghi chú: ' + noteText : 'Thêm ghi chú chỉnh sửa'}"
                            >
                                <i class="fa-solid fa-comment-dots"></i>
                            </button>
                            <button
                                type="button"
                                onclick="App.togglePhotoHeart('${photo.id}')"
                                ${isLocked ? 'disabled' : ''}
                                class="w-7 h-7 rounded-full border flex items-center justify-center text-xs transition ${heartCls} ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}"
                                title="${isSelected ? 'Bỏ chọn ảnh' : 'Chọn ảnh này'}"
                            >
                                <i class="fa-solid fa-heart"></i>
                            </button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    function togglePhotoHeart(photoId) {
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album || isAlbumSelectionLocked(album)) {
            showToast("Phần chọn ảnh đã khoá!", "error");
            return;
        }

        const selections = AdminModule.getSelections(album.id);
        if (!selections[photoId]) {
            selections[photoId] = { selected: true, note: '' };
        } else {
            selections[photoId].selected = !selections[photoId].selected;
        }

        AdminModule.saveSelections(selections, album.id);
        updateSelectionUI();
        filterAndRenderPhotos(album);
    }

    function updateSelectionUI() {
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;
        const selections = AdminModule.getSelections(album.id);
        const selectedCount = Object.values(selections).filter(s => s && s.selected).length;
        const limit = album.selectionLimit || 0;
        const limitText = limit > 0 ? `${selectedCount}/${limit}` : `${selectedCount}`;

        const navCounter = document.getElementById('navSelectedCounter');
        const toolbarCounter = document.getElementById('toolbarSelectedCounter');
        const submitBadge = document.getElementById('submitModalCountBadge');
        const dlSelectedCount = document.getElementById('dlModalSelectedCount');
        const dlTotalCount = document.getElementById('dlModalTotalCount');

        if (navCounter) navCounter.innerText = limitText;
        if (toolbarCounter) toolbarCounter.innerText = limitText;
        if (submitBadge) submitBadge.innerText = limitText;
        if (dlSelectedCount) dlSelectedCount.innerText = `${selectedCount} ảnh`;
        if (dlTotalCount) dlTotalCount.innerText = `${album.photos.length} ảnh`;
    }

    function setCategoryFilter(category) {
        activeCategory = category;
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (album) {
            renderCategoryTabs(album);
            filterAndRenderPhotos(album);
        }
    }

    function setAlbumTimeSort(sort) {
        albumTimeSort = sort;
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (album) filterAndRenderPhotos(album);
    }

    function toggleAlbumGroupByLocation() {
        albumGroupByLocation = !albumGroupByLocation;
        const btn = document.getElementById('albumGroupLocationBtn');
        if (btn) {
            if (albumGroupByLocation) {
                btn.className = "px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-900 text-white border border-zinc-900 transition flex items-center gap-1.5 shadow-xs";
            } else {
                btn.className = "px-3 py-1.5 rounded-full text-xs font-medium bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200 transition flex items-center gap-1.5 shadow-2xs";
            }
        }
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (album) filterAndRenderPhotos(album);
    }

    function handleSearchInput(value) {
        searchQuery = value || '';
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (album) filterAndRenderPhotos(album);
    }

    function setGridCols(cols) {
        gridCols = cols;
        ['cols-4', 'cols-3', 'cols-2'].forEach(c => {
            const btn = document.getElementById(`gridBtn_${c}`);
            if (btn) {
                btn.className = (c === cols)
                    ? "px-2.5 py-1 rounded-full text-xs font-medium bg-slate-900 text-white transition"
                    : "px-2.5 py-1 rounded-full text-xs font-medium text-slate-500 hover:text-slate-800 transition";
            }
        });
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (album) filterAndRenderPhotos(album);
    }

    function scrollToGallery() {
        const anchor = document.getElementById('galleryToolbarAnchor');
        if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
    }

    function openLightbox(index) {
        if (!currentFilteredPhotos.length || index < 0 || index >= currentFilteredPhotos.length) return;
        currentLightboxIndex = index;
        updateLightboxContent();
        const modal = document.getElementById('lightboxModal');
        if (modal) modal.classList.remove('hidden');
        resetLightboxTransform();
    }

    function openLightboxWithPhotos(photos, index, albumId) {
        if (albumId) currentAlbumId = albumId;
        currentFilteredPhotos = photos || [];
        openLightbox(index);
    }

    function closeLightbox() {
        if (slideshowTimer) {
            clearInterval(slideshowTimer);
            slideshowTimer = null;
        }
        const modal = document.getElementById('lightboxModal');
        if (modal) modal.classList.add('hidden');
    }

    function prevLightboxPhoto() {
        if (currentFilteredPhotos.length <= 1) return;
        currentLightboxIndex = (currentLightboxIndex - 1 + currentFilteredPhotos.length) % currentFilteredPhotos.length;
        updateLightboxContent();
        resetLightboxTransform();
    }

    function nextLightboxPhoto() {
        if (currentFilteredPhotos.length <= 1) return;
        currentLightboxIndex = (currentLightboxIndex + 1) % currentFilteredPhotos.length;
        updateLightboxContent();
        resetLightboxTransform();
    }

    function updateLightboxContent() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;

        const img = document.getElementById('lightboxImage');
        const codeEl = document.getElementById('lightboxCode');
        const counterEl = document.getElementById('lightboxCounter');
        const titleEl = document.getElementById('lightboxTitle');
        const heartBtn = document.getElementById('lightboxHeartBtn');
        const dlBtn = document.getElementById('lightboxDownloadBtn');
        const setCoverBtn = document.getElementById('lightboxSetCoverBtn');
        const proofingControls = document.getElementById('lightboxProofingControls');
        const notePreview = document.getElementById('lightboxNotePreview');

        if (img) img.src = photo.url;
        if (codeEl) codeEl.innerText = photo.code || photo.title || 'IMG';
        if (counterEl) counterEl.innerText = `${currentLightboxIndex + 1} / ${currentFilteredPhotos.length}`;
        if (titleEl) titleEl.innerText = photo.location || photo.city || '';

        const album = AdminModule.getAlbumById(currentAlbumId);
        const selections = album ? AdminModule.getSelections(album.id) : {};
        const sel = selections[photo.id] || {};

        if (isClientMode) {
            if (proofingControls) proofingControls.classList.remove('hidden');
            if (dlBtn) dlBtn.classList.remove('hidden');
            if (setCoverBtn) setCoverBtn.classList.add('hidden');

            if (heartBtn) {
                if (sel.selected) {
                    heartBtn.className = "px-4 py-2 rounded-full bg-rose-600 text-white text-xs font-semibold flex items-center gap-2 transition";
                    heartBtn.innerHTML = '<i class="fa-solid fa-heart"></i><span>Đã chọn ảnh này</span>';
                } else {
                    heartBtn.className = "px-4 py-2 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-semibold flex items-center gap-2 transition";
                    heartBtn.innerHTML = '<i class="fa-regular fa-heart"></i><span>Chọn lưu ảnh này</span>';
                }
            }
        } else {
            if (proofingControls) proofingControls.classList.add('hidden');
            if (dlBtn) dlBtn.classList.add('hidden');
            const isAdmin = (typeof AuthModule !== 'undefined' && AuthModule.isLoggedIn());
            if (isAdmin && setCoverBtn) {
                setCoverBtn.classList.remove('hidden');
            } else if (setCoverBtn) {
                setCoverBtn.classList.add('hidden');
            }
        }

        if (notePreview) {
            if (sel.note && isClientMode) {
                notePreview.classList.remove('hidden');
                notePreview.innerText = `Ghi chú: ${sel.note}`;
            } else {
                notePreview.classList.add('hidden');
            }
        }
    }

    function toggleLightboxCurrentHeart() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;
        togglePhotoHeart(photo.id);
        updateLightboxContent();
    }

    function openLightboxCurrentNote() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;
        openPhotoNoteModal(photo.id);
    }

    function toggleSlideshow() {
        const btn = document.getElementById('lightboxSlideshowBtn');
        if (slideshowTimer) {
            clearInterval(slideshowTimer);
            slideshowTimer = null;
            if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i><span class="hidden sm:inline">Slideshow</span>';
            showToast("Đã dừng Slideshow");
        } else {
            slideshowTimer = setInterval(nextLightboxPhoto, 3000);
            if (btn) btn.innerHTML = '<i class="fa-solid fa-pause"></i><span class="hidden sm:inline">Tạm dừng</span>';
            showToast("Bắt đầu tự động chuyển ảnh");
        }
    }

    function toggleLightboxBeforeAfter() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;
        const img = document.getElementById('lightboxImage');
        if (!img) return;

        isLightboxShowingBefore = !isLightboxShowingBefore;
        if (isLightboxShowingBefore && photo.beforeUrl) {
            img.src = photo.beforeUrl;
            showToast("Đang xem ảnh gốc");
        } else {
            img.src = photo.url;
            showToast("Đang xem ảnh đã chỉnh sửa");
        }
    }

    function setLightboxCurrentAsCover() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo || typeof AdminModule === 'undefined') return;
        AdminModule.setPhotoAsCover(photo.url, currentAlbumId);
        showToast("Đã đặt ảnh này làm ảnh bìa Album!");
    }

    function downloadLightboxCurrentPhoto() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;
        downloadSinglePhoto(photo.id);
    }

    async function downloadSinglePhoto(photoId) {
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;
        const photo = album.photos.find(p => p.id === photoId);
        if (!photo) return;

        try {
            showToast(`Đang tải ảnh ${photo.code || 'IMG'}...`);
            const a = document.createElement('a');
            a.href = photo.url;
            a.target = '_blank';
            a.download = `${photo.code || 'photo'}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            window.open(photo.url, '_blank');
        }
    }

    function setupLightboxZoom() {
        const stage = document.getElementById('lightboxStage');
        const img = document.getElementById('lightboxImage');
        if (!stage || !img) return;

        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.2 : -0.2;
            _lbScale = Math.min(LB_MAX_SCALE, Math.max(LB_MIN_SCALE, _lbScale + delta));
            applyLightboxTransform();
        }, { passive: false });

        img.addEventListener('mousedown', (e) => {
            if (_lbScale > 1) {
                _lbDragging = true;
                _lbDragStartX = e.clientX;
                _lbDragStartY = e.clientY;
                _lbPanStartX = _lbPanX;
                _lbPanStartY = _lbPanY;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (_lbDragging) {
                _lbPanX = _lbPanStartX + (e.clientX - _lbDragStartX);
                _lbPanY = _lbPanStartY + (e.clientY - _lbDragStartY);
                applyLightboxTransform();
            }
        });

        window.addEventListener('mouseup', () => {
            _lbDragging = false;
        });

        img.addEventListener('dblclick', () => {
            if (_lbScale > 1) {
                resetLightboxTransform();
            } else {
                _lbScale = 2.5;
                applyLightboxTransform();
            }
        });
    }

    function applyLightboxTransform() {
        const img = document.getElementById('lightboxImage');
        if (img) {
            img.style.transform = `translate(${_lbPanX}px, ${_lbPanY}px) scale(${_lbScale})`;
            img.style.cursor = _lbScale > 1 ? 'grab' : 'zoom-in';
        }
    }

    function resetLightboxTransform() {
        _lbScale = 1;
        _lbPanX = 0;
        _lbPanY = 0;
        applyLightboxTransform();
    }

    function openPhotoNoteModal(photoId) {
        activeNotePhotoId = photoId;
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;
        const photo = album.photos.find(p => p.id === photoId);
        if (!photo) return;

        const selections = AdminModule.getSelections(album.id);
        const sel = selections[photoId] || {};

        const thumb = document.getElementById('noteModalPhotoThumb');
        const codeEl = document.getElementById('noteModalPhotoCode');
        const input = document.getElementById('noteModalInput');

        if (thumb) thumb.src = photo.url;
        if (codeEl) codeEl.innerText = photo.code || photo.title || 'IMG';
        if (input) input.value = sel.note || '';

        const modal = document.getElementById('photoNoteModal');
        if (modal) modal.classList.remove('hidden');
    }

    function closePhotoNoteModal() {
        const modal = document.getElementById('photoNoteModal');
        if (modal) modal.classList.add('hidden');
        activeNotePhotoId = null;
    }

    function fillQuickNoteChip(text) {
        const input = document.getElementById('noteModalInput');
        if (!input) return;
        if (input.value.trim()) {
            input.value += `, ${text}`;
        } else {
            input.value = text;
        }
    }

    function savePhotoNote(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!activeNotePhotoId) return;

        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;

        const input = document.getElementById('noteModalInput');
        const note = input ? input.value.trim() : '';

        const selections = AdminModule.getSelections(album.id);
        if (!selections[activeNotePhotoId]) {
            selections[activeNotePhotoId] = { selected: true, note: note };
        } else {
            selections[activeNotePhotoId].note = note;
            if (note) selections[activeNotePhotoId].selected = true;
        }

        AdminModule.saveSelections(selections, album.id);
        showToast("Đã lưu ghi chú cho ảnh!");
        closePhotoNoteModal();
        updateSelectionUI();
        filterAndRenderPhotos(album);
        if (currentLightboxIndex >= 0) {
            updateLightboxContent();
        }
    }

    function openSubmitSelectionModal() {
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;

        const selections = AdminModule.getSelections(album.id);
        const selectedPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);

        if (!selectedPhotos.length) {
            showToast("Bạn chưa chọn bức ảnh nào để gửi!", "error");
            return;
        }

        const previewContainer = document.getElementById('submitModalCodesPreview');
        if (previewContainer) {
            previewContainer.innerHTML = selectedPhotos.map(p => {
                const note = selections[p.id]?.note;
                return `
                    <div class="py-1 px-2 border-b border-zinc-200 text-xs flex justify-between items-center">
                        <span class="font-mono font-bold text-zinc-800">${p.code || p.title}</span>
                        ${note ? `<span class="text-amber-600 truncate max-w-[200px]">"${note}"</span>` : '<span class="text-zinc-400">Không có ghi chú</span>'}
                    </div>
                `;
            }).join('');
        }

        const nameInput = document.getElementById('submitClientName');
        if (nameInput && !nameInput.value) {
            nameInput.value = album.clientName || '';
        }

        const modal = document.getElementById('submitSelectionModal');
        if (modal) modal.classList.remove('hidden');
    }

    function closeSubmitSelectionModal() {
        const modal = document.getElementById('submitSelectionModal');
        if (modal) modal.classList.add('hidden');
    }

    function handleClientSubmitSelections(e) {
        if (e && e.preventDefault) e.preventDefault();
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;

        const selections = AdminModule.getSelections(album.id);
        const nameInput = document.getElementById('submitClientName');
        const phoneInput = document.getElementById('submitClientPhone');
        const noteInput = document.getElementById('submitGeneralNote');

        const submission = {
            id: 'sub_' + Date.now(),
            createdAt: new Date().toISOString(),
            clientName: nameInput ? nameInput.value.trim() : album.clientName,
            clientPhone: phoneInput ? phoneInput.value.trim() : '',
            generalNote: noteInput ? noteInput.value.trim() : '',
            selections: selections
        };

        AdminModule.addSubmission(submission, album.id);
        album.isSelectionLockedBySubmit = true;
        AdminModule.saveAlbumsToStorage();

        closeSubmitSelectionModal();
        showToast("Đã gửi kết quả chọn ảnh thành công! Studio sẽ tiến hành hậu kỳ.");
        renderPublicAlbum();
    }

    function copyClientSelectionSummary() {
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;

        const selections = AdminModule.getSelections(album.id);
        const selectedPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);

        if (!selectedPhotos.length) {
            showToast("Chưa có ảnh nào được chọn!", "error");
            return;
        }

        let summary = `KẾT QUẢ CHỌN ẢNH - ${album.title}\n`;
        summary += `Khách hàng: ${album.clientName}\n`;
        summary += `Số lượng: ${selectedPhotos.length} ảnh\n`;
        summary += `----------------------------------------\n`;
        selectedPhotos.forEach((p, idx) => {
            const note = selections[p.id]?.note;
            summary += `${idx + 1}. ${p.code || p.title}${note ? ` (Ghi chú: ${note})` : ''}\n`;
        });

        navigator.clipboard.writeText(summary).then(() => {
            showToast("Đã sao chép danh sách ảnh chọn để gửi qua Zalo!");
        }).catch(() => {
            showToast("Không thể sao chép tự động!", "error");
        });
    }

    function openDownloadModal() {
        const modal = document.getElementById('downloadModal');
        if (modal) modal.classList.remove('hidden');
    }

    function closeDownloadModal() {
        const modal = document.getElementById('downloadModal');
        if (modal) modal.classList.add('hidden');
    }

    function handleBatchDownload(e) {
        if (e && e.preventDefault) e.preventDefault();
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;

        const scope = document.querySelector('input[name="dlScope"]:checked')?.value || 'selected';
        const selections = AdminModule.getSelections(album.id);

        let targetPhotos = album.photos;
        if (scope === 'selected') {
            targetPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);
        }

        if (!targetPhotos.length) {
            showToast("Không có bức ảnh nào để tải xuống!", "error");
            return;
        }

        closeDownloadModal();
        showToast(`Đang chuẩn bị tải ${targetPhotos.length} ảnh...`);
        targetPhotos.slice(0, 5).forEach((p, i) => {
            setTimeout(() => downloadSinglePhoto(p.id), i * 300);
        });
        if (targetPhotos.length > 5) {
            setTimeout(() => {
                showToast(`Đã mở tải 5 ảnh đầu tiên. Để tải trọn bộ tốc độ cao, vui lòng tải trực tiếp từ link Google Drive của Studio.`);
            }, 1800);
        }
    }

    function setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            const lightbox = document.getElementById('lightboxModal');
            const isLightboxOpen = lightbox && !lightbox.classList.contains('hidden');

            if (isLightboxOpen) {
                if (e.key === 'Escape') closeLightbox();
                if (e.key === 'ArrowLeft') prevLightboxPhoto();
                if (e.key === 'ArrowRight') nextLightboxPhoto();
                if (e.key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    toggleLightboxCurrentHeart();
                }
            }
        });
    }

    function setupProtectionHandlers() {
        const isProtected = () => currentView === 'album' && !isClientMode;
        const shield = document.getElementById('viewOnlyAntiCaptureShield');

        document.addEventListener('contextmenu', (e) => {
            if (isProtected()) {
                e.preventDefault();
                showToast("Chế độ chỉ xem được bảo vệ bản quyền!", "error");
            }
        });

        document.addEventListener('dragstart', (e) => {
            if (isProtected() && e.target.tagName === 'IMG') {
                e.preventDefault();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (!isProtected()) return;
            if (
                e.key === 'PrintScreen' ||
                (e.ctrlKey && (e.key === 's' || e.key === 'p' || e.key === 'u')) ||
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'C' || e.key === 'J')) ||
                e.key === 'F12'
            ) {
                e.preventDefault();
                if (shield) {
                    shield.classList.remove('hidden');
                    setTimeout(() => shield.classList.add('hidden'), 2500);
                }
                showToast("Chế độ xem được bảo vệ bản quyền!", "error");
            }
        });

        window.addEventListener('blur', () => {
            if (isProtected() && shield) {
                shield.classList.remove('hidden');
            }
        });

        window.addEventListener('focus', () => {
            if (shield) shield.classList.add('hidden');
        });
    }

    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const icon = document.getElementById('toastIcon');
        const msg = document.getElementById('toastMessage');
        if (!toast || !msg) return;

        msg.innerText = message;
        if (icon) {
            if (type === 'error') {
                icon.className = "fa-solid fa-circle-exclamation text-rose-400 text-lg";
            } else if (type === 'info') {
                icon.className = "fa-solid fa-circle-info text-sky-400 text-lg";
            } else {
                icon.className = "fa-solid fa-circle-check text-emerald-400 text-lg";
            }
        }

        toast.classList.remove('hidden');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.add('hidden');
        }, 3200);
    }

    return {
        init,
        showView,
        openAlbumPage,
        handleAlbumBackAction,
        renderHomeShowcase,
        renderPublicAlbum,
        setCategoryFilter,
        setAlbumTimeSort,
        toggleAlbumGroupByLocation,
        handleSearchInput,
        setGridCols,
        scrollToGallery,
        openLightbox,
        openLightboxWithPhotos,
        closeLightbox,
        prevLightboxPhoto,
        nextLightboxPhoto,
        toggleLightboxBeforeAfter,
        setLightboxCurrentAsCover,
        toggleSlideshow,
        downloadLightboxCurrentPhoto,
        downloadSinglePhoto,
        togglePhotoHeart,
        toggleLightboxCurrentHeart,
        openLightboxCurrentNote,
        openPhotoNoteModal,
        closePhotoNoteModal,
        fillQuickNoteChip,
        savePhotoNote,
        openSubmitSelectionModal,
        closeSubmitSelectionModal,
        handleClientSubmitSelections,
        copyClientSelectionSummary,
        openDownloadModal,
        closeDownloadModal,
        handleBatchDownload,
        handlePinUnlock,
        maybeShowClientReminderModal,
        closeClientReminderModal,
        updateSelectionUI,
        getCurrentAlbumId,
        getCurrentView,
        showToast
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});


