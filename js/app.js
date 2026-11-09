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
            const rawPath = window.location.pathname.replace(/^\/dihastory\/?/i, '').replace(/^\/+|\/+$/g, '');
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

        const heroCoverEl = document.getElementById('homeStudioHeroCover');
        if (heroCoverEl) {
            const targetAlbum = publicAlbums[0] || allAlbums[0];
            if (targetAlbum && targetAlbum.coverUrl) {
                heroCoverEl.src = targetAlbum.coverUrl;
            }
        }

        let sortedAlbums = [...publicAlbums];
        sortedAlbums.sort((a, b) => {
            const timeA = getAlbumOldestPhotoTime(a);
            const timeB = getAlbumOldestPhotoTime(b);
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

        container.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 sm:gap-6">
                ${sortedAlbums.map(album => renderHomeAlbumCard(album)).join('')}
            </div>
        `;
    }

    function renderHomeAlbumCard(album) {
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

            if (lockedBySubmit || expired) {
                if (lockBanner) {
                    lockBanner.classList.remove('hidden');
                    if (lockReasonText) {
                        lockReasonText.innerText = lockedBySubmit 
                            ? "Khách hàng đã bấm nút hoàn tất chốt danh sách ảnh." 
                            : "Đã quá thời hạn chọn ảnh của album này.";
                    }
                }
            } else {
                if (lockBanner) lockBanner.classList.add('hidden');
            }
        };

        tick();
        if (hasDeadline && !lockedBySubmit) {
            countdownInterval = setInterval(tick, 1000);
        }
    }

    return {
        init,
        getCurrentAlbumId,
        getCurrentView,
        showView,
        openAlbumPage,
        handleAlbumBackAction,
        handleQuickAlbumCodeAccess,
        setHomeLocationFilter,
        setHomeTimeSort,
        toggleHomeGroupByLocation,
        maybeShowClientReminderModal,
        closeClientReminderModal,
        updateDeadlineCountdownUI
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
