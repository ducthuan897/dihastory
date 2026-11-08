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

    function parsePathRouting(rawPath) {
        if (!rawPath) return { albumSlug: null, photoCode: null };
        const parts = decodeURIComponent(rawPath).split('/').filter(Boolean);
        if (!parts.length) return { albumSlug: null, photoCode: null };
        const albumSlug = parts[0];
        const photoCode = parts.length > 1 ? parts.slice(1).join('/') : null;
        return { albumSlug, photoCode };
    }

    function handleUrlRouting(skipPush) {
        const params = new URLSearchParams(window.location.search);
        let albumParam = params.get('album');
        let albumPathParam = params.get('album_path');
        const viewParam = params.get('view');
        const modeParam = params.get('mode');
        let photoCodeParam = params.get('photo');

        // Phân biệt chế độ xem: Khách chọn ảnh (client) vs Trưng bày công khai (showcase)
        if (modeParam === 'client' || params.get('client') === '1' || params.get('select') === '1') {
            isClientMode = true;
        } else {
            isClientMode = false;
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
                    showView('album', true);
                    let base = window.location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
                    if (window.location.hostname.includes('github.io')) {
                        base = '/dutustory';
                    }
                    if (photoCodeParam) {
                        const targetPhotoIdx = currentFilteredPhotos.findIndex(p => p.code === photoCodeParam || p.id === photoCodeParam);
                        if (targetPhotoIdx >= 0) {
                            setTimeout(() => openLightbox(targetPhotoIdx), 150);
                        }
                    }
                    const cleanUrl = isClientMode
                        ? (photoCodeParam ? `${base}/${targetSlug}/${encodeURIComponent(photoCodeParam)}?mode=client` : `${base}/${targetSlug}?mode=client`)
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

        // 2. Check if clean URL path /dutustory/<album-slug>/<photo-code> or hash was visited
        if (!albumParam && !viewParam) {
            const rawPath = window.location.pathname.replace(/^\/dutustory\/?/i, '').replace(/^\/+|\/+$/g, '');
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

        if (viewParam === 'manage-album') {
            if (albumParam) {
                const found = AdminModule.getAlbumById(albumParam);
                if (found) currentAlbumId = found.id;
            }
            AdminModule.openAlbumManagePage(currentAlbumId, skipPush);
        } else if (albumParam) {
            const found = AdminModule.getAlbumById(albumParam);
            if (found) {
                currentAlbumId = found.id;
            }
            showView('album', skipPush);
            if (photoCodeParam && found) {
                const targetPhotoIdx = currentFilteredPhotos.findIndex(p => p.code === photoCodeParam || p.id === photoCodeParam);
                if (targetPhotoIdx >= 0) {
                    setTimeout(() => openLightbox(targetPhotoIdx), 150);
                }
            }
        } else if (viewParam === 'admin') {
            showView('admin', skipPush);
        } else {
            showView('home', skipPush);
        }
    }

    function getCurrentAlbumId() {
        return currentAlbumId;
    }

    function showView(viewName, skipHistoryPush = false) {
        const homeView = document.getElementById('homeView');
        const publicView = document.getElementById('publicView');
        const adminView = document.getElementById('adminView');
        const manageView = document.getElementById('albumManageView');
        const mainHeader = document.getElementById('mainTopHeaderBar');
        const navAlbumContextual = document.getElementById('navAlbumContextualControls');

        if (viewName !== 'album' || isClientMode) {
            document.body.classList.remove('view-only-protected');
        }

        if (viewName === 'manage-album') {
            if (!AuthModule.isLoggedIn()) {
                AuthModule.openLoginModal();
                return;
            }
            currentView = 'manage-album';
            if (homeView) homeView.classList.add('hidden');
            if (publicView) publicView.classList.add('hidden');
            if (adminView) adminView.classList.add('hidden');
            if (manageView) manageView.classList.remove('hidden');
            if (mainHeader) mainHeader.classList.remove('hidden');
            if (navAlbumContextual) navAlbumContextual.classList.add('hidden');

            const targetId = AdminModule.getActiveAdminAlbum()?.id || currentAlbumId;
            currentAlbumId = targetId;
            if (!skipHistoryPush) {
                const url = `${window.location.pathname}?view=manage-album&album=${encodeURIComponent(targetId)}`;
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
            if (mainHeader) mainHeader.classList.remove('hidden');
            if (navAlbumContextual) navAlbumContextual.classList.add('hidden');

            if (!skipHistoryPush) {
                const url = `${window.location.pathname}?view=admin`;
                window.history.pushState({ view: 'admin' }, '', url);
            }
            AdminModule.populateAdminDashboard();
        } else if (viewName === 'album') {
            currentView = 'album';
            if (homeView) homeView.classList.add('hidden');
            if (publicView) publicView.classList.remove('hidden');
            if (adminView) adminView.classList.add('hidden');
            if (manageView) manageView.classList.add('hidden');
            if (mainHeader) mainHeader.classList.remove('hidden');
            if (navAlbumContextual) {
                if (isClientMode) {
                    navAlbumContextual.classList.remove('hidden');
                } else {
                    navAlbumContextual.classList.add('hidden');
                }
            }

            if (!skipHistoryPush) {
                let base = window.location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
                if (window.location.hostname.includes('github.io')) {
                    base = '/dutustory';
                }
                const url = isClientMode
                    ? `${base}/${encodeURIComponent(currentAlbumId)}?mode=client`
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
            if (mainHeader) mainHeader.classList.remove('hidden');
            if (navAlbumContextual) navAlbumContextual.classList.add('hidden');

            if (!skipHistoryPush) {
                let base = window.location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
                if (window.location.hostname.includes('github.io')) {
                    base = '/dutustory';
                }
                const homeUrl = base ? `${base}/` : '/';
                window.history.pushState({ view: 'home' }, '', homeUrl);
            }
            renderHomeShowcase();
        }

        updateActiveNavButtons();
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
        setTabClass(navAdmin, currentView === 'admin' || currentView === 'manage-album');
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
        const allAlbums = AdminModule.getAllAlbums();
        const publicAlbums = allAlbums.filter(a => a.isPublic);

        const countEl = document.getElementById('homePublicAlbumsCount');
        if (countEl) countEl.innerText = `${publicAlbums.length} Dự Án Công Khai`;

        const locPillsContainer = document.getElementById('homeLocationFilterPills');
        if (locPillsContainer) {
            const cities = [];
            publicAlbums.forEach(a => {
                const c = a.city || 'Khác';
                if (!cities.includes(c)) cities.push(c);
            });

            const pills = [
                { id: 'ALL', label: `Tất cả (${publicAlbums.length})` },
                ...cities.map(c => ({
                    id: c,
                    label: `${c} (${publicAlbums.filter(a => (a.city || 'Khác') === c).length})`
                }))
            ];

            locPillsContainer.innerHTML = pills.map(p => {
                const active = homeLocationFilter === p.id;
                return `
                    <button
                        type="button"
                        onclick="App.setHomeLocationFilter('${p.id}')"
                        class="px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                            active
                                ? 'bg-zinc-900 text-white shadow-xs'
                                : 'bg-white text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200'
                        }"
                    >
                        <i class="fa-solid fa-location-dot text-[11px] ${active ? 'text-rose-400' : 'text-zinc-400'}"></i>
                        <span>${p.label}</span>
                    </button>
                `;
            }).join('');
        }

        const groupBtn = document.getElementById('homeGroupToggleBtn');
        const groupBtnMob = document.getElementById('homeGroupToggleBtnMobile');
        const activeClass = 'bg-zinc-900 text-white border-zinc-900 shadow-xs';
        const inactiveClass = 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100 shadow-xs';
        if (groupBtn) {
            groupBtn.className = `px-3 py-1.5 rounded-full text-xs font-semibold border transition flex items-center gap-1.5 shrink-0 ${
                homeGroupByLocation ? activeClass : inactiveClass
            }`;
        }
        if (groupBtnMob) {
            groupBtnMob.className = `px-2.5 py-1.5 rounded-full text-xs font-semibold border transition flex items-center gap-1 shrink-0 ${
                homeGroupByLocation ? activeClass : inactiveClass
            }`;
        }

    function renderHomeShowcase() {
        const allAlbums = AdminModule.getAllAlbums();
        const publicAlbums = allAlbums.filter(a => a.isPublic);

        const countEl = document.getElementById('homePublicAlbumsCount');
        if (countEl) countEl.innerText = `${publicAlbums.length} Dự Án Công Khai`;

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

        const tagsHtml = (album.tags || []).slice(0, 3).map(t => `<span class="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">#${t}</span>`).join('');
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
                        ${tagsHtml ? `<div class="flex flex-wrap gap-1 mt-2">${tagsHtml}</div>` : ''}
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

            if (lockedBySubmit || expired) {
                if (lockBanner) lockBanner.classList.remove('hidden');
                if (lockReasonText) {
                    lockReasonText.innerText = lockedBySubmit
                        ? "Bạn đã bấm 'Hoàn tất chọn ảnh' và gửi kết quả cho Studio. Phần chọn ảnh hiện đã tự động khoá (bạn vẫn xem và tải ảnh được)."
                        : "Đã hết thời hạn chọn ảnh cho Album này. Phần chọn ảnh đã tự động khoá, bạn vẫn có thể xem và tải ảnh về máy.";
                }
                if (unlockBtnAdmin) {
                    unlockBtnAdmin.classList.toggle('hidden', !lockedBySubmit);
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

    function checkAlbumPinLock(album) {
        const lockOverlay = document.getElementById('pinLockOverlay');
        if (!lockOverlay) return false;

        if (album.pinCode && album.pinCode.trim() !== "" && !unlockedPinMap[album.id] && !AuthModule.isLoggedIn()) {
            const titleEl = document.getElementById('pinLockAlbumTitle');
            if (titleEl) titleEl.innerText = album.title;
            lockOverlay.classList.remove('hidden');
            return true;
        } else {
            lockOverlay.classList.add('hidden');
            return false;
        }
    }

    function handlePinUnlock(event) {
        event.preventDefault();
        const input = document.getElementById('pinCodeInput');
        const err = document.getElementById('pinErrorMsg');
        const album = AdminModule.getAlbumById(currentAlbumId);

        if (input && input.value.trim() === album.pinCode.trim()) {
            unlockedPinMap[album.id] = true;
            if (err) err.classList.add('hidden');
            document.getElementById('pinLockOverlay').classList.add('hidden');
            showToast("Đã mở khoá Album thành công!");
        } else {
            if (err) err.classList.remove('hidden');
        }
    }

    function setAlbumTimeSort(order) {
        albumTimeSort = order;
        renderPublicAlbum();
    }

    function toggleAlbumGroupByLocation() {
        albumGroupByLocation = !albumGroupByLocation;
        renderPublicAlbum();
    }

    function renderPublicAlbum() {
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (!album) return;
        const selections = AdminModule.getSelections(album.id);

        if (isClientMode) {
            checkAlbumPinLock(album);
            updateDeadlineCountdownUI(album);
        } else {
            const pinOverlay = document.getElementById('pinLockOverlay');
            if (pinOverlay) pinOverlay.classList.add('hidden');
            const deadlineBar = document.getElementById('albumDeadlineBar');
            if (deadlineBar) deadlineBar.classList.add('hidden');
            const lockedBanner = document.getElementById('albumSelectionLockedBanner');
            if (lockedBanner) lockedBanner.classList.add('hidden');
        }

        const setTxt = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.innerText = txt;
        };

        const coverImg = document.getElementById('heroCoverImage');
        if (coverImg) coverImg.src = album.coverUrl;

        const formattedDate = album.date ? album.date.split('-').reverse().join('.') : '';
        setTxt('heroAlbumTitle', album.title);
        setTxt('heroClientName', album.clientName);
        setTxt('heroShootDate', formattedDate);
        setTxt('heroLocation', `${album.location} (${album.city || ''})`);
        setTxt('heroPhotoCount', `${album.photos.length} Ảnh`);

        // Mode toggling on Hero & Toolbars (Showcase Mode vs Client Link Mode)
        const topShareBar = document.getElementById('albumTopShareNoticeBar');
        const shareLinkWrap = document.getElementById('albumClientShareLinkWrap');
        const heroDownloadBtn = document.getElementById('heroClientDownloadBtn');
        const heroSubmitBtn = document.getElementById('heroClientSubmitBtn');
        const heroViewGalleryLabel = document.getElementById('heroViewGalleryBtnLabel');
        const heroBackBtn = document.getElementById('heroBackToHomeBtn');
        const guideToolbar = document.getElementById('galleryToolbarAnchor');
        const navAlbumContextual = document.getElementById('navAlbumContextualControls');
        const reminderBtn = document.getElementById('albumTopReminderBtn');

        // Luôn hiển thị thanh top bar màu đen có nút "Quay lại Trang Chủ" ở cả 2 trang
        if (topShareBar) topShareBar.classList.remove('hidden');
        // Nút quay lại ở giữa hero banner được ẩn đi vì đã có nút chuẩn trên thanh top bar
        if (heroBackBtn) heroBackBtn.classList.add('hidden');

        // Cập nhật nhãn nút quay lại trên top bar tùy theo trang xuất phát
        const backBtnLabel = document.getElementById('albumTopBackBtnLabel');
        if (backBtnLabel) {
            if (albumPreviousView === 'manage-album') {
                backBtnLabel.innerText = 'Quay về trang quản lý album';
            } else if (albumPreviousView === 'admin') {
                backBtnLabel.innerText = 'Quay về trang quản trị';
            } else {
                backBtnLabel.innerText = 'Quay lại Trang Chủ';
            }
        }

        // Bật/tắt chế độ bảo vệ chống sao chép, tải & chụp màn hình cho body
        if (!isClientMode) {
            document.body.classList.add('view-only-protected');
        } else {
            document.body.classList.remove('view-only-protected');
        }

        if (shareLinkWrap) shareLinkWrap.classList.toggle('hidden', !isClientMode);
        if (heroDownloadBtn) heroDownloadBtn.classList.toggle('hidden', !isClientMode);
        if (heroSubmitBtn) heroSubmitBtn.classList.toggle('hidden', !isClientMode);
        if (heroViewGalleryLabel) {
            heroViewGalleryLabel.innerText = isClientMode ? 'Xem Ảnh & Chọn Ảnh Lưu Về' : 'Khám Phá Bộ Ảnh';
        }
        if (guideToolbar) guideToolbar.classList.toggle('hidden', !isClientMode);
        if (navAlbumContextual) navAlbumContextual.classList.toggle('hidden', !isClientMode);
        if (reminderBtn) {
            reminderBtn.classList.toggle('hidden', !isClientMode || !(album.reminderEnabled && album.reminderText));
        }

        const shareLinkText = document.getElementById('albumClientLinkDisplay');
        if (shareLinkText) {
            shareLinkText.innerText = AdminModule.getClientShareUrl(album.id);
        }

        const selectedIds = album.photos.filter(p => selections[p.id] && selections[p.id].selected).map(p => p.id);
        const notedIds = album.photos.filter(p => selections[p.id] && selections[p.id].note && selections[p.id].note.trim()).map(p => p.id);
        const limitText = album.selectionLimit > 0 ? `${selectedIds.length}/${album.selectionLimit}` : `${selectedIds.length}`;

        setTxt('navSelectedCounter', limitText);
        setTxt('toolbarSelectedCounter', limitText);

        // Update label on Submit button according to Shotpik "Hoàn tất chọn ảnh"
        const navSubmitBtnLabel = document.getElementById('navSubmitBtnLabel');
        if (navSubmitBtnLabel) {
            navSubmitBtnLabel.innerText = album.isSelectionLockedBySubmit ? 'Đã hoàn tất chọn' : 'Hoàn tất chọn ảnh';
        }

        const groupBtn = document.getElementById('albumGroupLocationBtn');
        if (groupBtn) {
            groupBtn.className = `px-3 py-1.5 rounded-full text-xs font-semibold border transition flex items-center gap-1.5 shrink-0 shadow-xs ${
                albumGroupByLocation
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            }`;
        }

        renderCategoryTabs(album, selectedIds.length, notedIds.length);
        renderPhotoGrid(album, selections);

        const videoSection = document.getElementById('videoHighlightSection');
        const mainPlayer = document.getElementById('mainVideoPlayer');
        if (videoSection && mainPlayer) {
            if (album.youtubeId) {
                videoSection.classList.remove('hidden');
                const targetSrc = `https://www.youtube.com/embed/${album.youtubeId}?autoplay=0`;
                if (mainPlayer.src !== targetSrc) {
                    mainPlayer.src = targetSrc;
                }
            } else {
                videoSection.classList.add('hidden');
            }
        }
    }

    function renderCategoryTabs(album, selectedCount, notedCount) {
        const container = document.getElementById('categoryTabsContainer');
        if (!container) return;

        if (!isClientMode && (activeCategory === 'SELECTED' || activeCategory === 'NOTED')) {
            activeCategory = 'ALL';
        }

        const uniqueLocations = [];
        album.photos.forEach(p => {
            const loc = p.location || album.city || 'Khác';
            if (loc && !uniqueLocations.includes(loc)) {
                uniqueLocations.push(loc);
            }
        });

        const deliveredCount = (album.deliveredPhotos || []).length;
        const tabs = [
            { id: 'ALL', label: `Tất cả (${album.photos.length})`, icon: 'fa-solid fa-layer-group' }
        ];

        if (isClientMode) {
            tabs.push({ id: 'SELECTED', label: `Ảnh đã chọn (${selectedCount})`, icon: 'fa-solid fa-heart text-rose-500' });
            if (notedCount > 0) {
                tabs.push({ id: 'NOTED', label: `Có ghi chú (${notedCount})`, icon: 'fa-solid fa-comment-dots text-amber-500' });
            }
        }

        if (deliveredCount > 0) {
            tabs.push({ id: 'DELIVERED', label: `Ảnh đã chỉnh (${deliveredCount})`, icon: 'fa-solid fa-wand-magic-sparkles text-emerald-500' });
        }

        uniqueLocations.forEach(loc => {
            const count = album.photos.filter(p => (p.location || album.city || 'Khác') === loc).length;
            tabs.push({ id: `LOC:${loc}`, label: `${loc} (${count})`, icon: 'fa-solid fa-location-dot text-rose-400' });
        });

        container.innerHTML = tabs.map(tab => {
            const isActive = activeCategory === tab.id;
            return `
                <button
                    type="button"
                    onclick="App.setCategoryFilter('${tab.id}')"
                    class="px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                        isActive
                            ? 'bg-zinc-900 text-white shadow-xs'
                            : 'bg-white text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200'
                    }"
                >
                    ${tab.icon ? `<i class="${tab.icon}"></i>` : ''}
                    <span>${tab.label}</span>
                </button>
            `;
        }).join('');
    }

    function setCategoryFilter(catId) {
        activeCategory = catId;
        renderPublicAlbum();
    }

    function handleSearchInput(val) {
        searchQuery = (val || '').trim().toLowerCase();
        const album = AdminModule.getAlbumById(currentAlbumId);
        const selections = AdminModule.getSelections(album.id);
        renderPhotoGrid(album, selections);
    }

    function setGridCols(colsClass) {
        gridCols = colsClass;
        const album = AdminModule.getAlbumById(currentAlbumId);
        const selections = AdminModule.getSelections(album.id);
        renderPhotoGrid(album, selections);

        ['cols-4', 'cols-3', 'cols-2'].forEach(c => {
            const btn = document.getElementById(`gridBtn_${c}`);
            if (btn) {
                if (c === colsClass) {
                    btn.classList.add('bg-slate-900', 'text-white');
                    btn.classList.remove('text-slate-500', 'hover:text-slate-800');
                } else {
                    btn.classList.remove('bg-slate-900', 'text-white');
                    btn.classList.add('text-slate-500', 'hover:text-slate-800');
                }
            }
        });
    }

    function renderPhotoGrid(album, selections) {
        const wrapper = document.getElementById('gallerySectionsWrapper');
        const emptyState = document.getElementById('galleryEmptyState');
        if (!wrapper) return;

        let sourceList = activeCategory === 'DELIVERED' ? (album.deliveredPhotos || []) : album.photos;

        let filtered = sourceList.filter(p => {
            const st = selections[p.id] || {};
            const loc = p.location || album.city || 'Khác';
            if (activeCategory === 'SELECTED' && !st.selected) return false;
            if (activeCategory === 'NOTED' && !(st.note && st.note.trim())) return false;
            if (activeCategory.startsWith('LOC:')) {
                const targetLoc = activeCategory.slice(4);
                if (loc !== targetLoc) return false;
            }
            if (searchQuery) {
                const hay = `${p.code} ${p.title || ''} ${loc} ${st.note || ''}`.toLowerCase();
                if (!hay.includes(searchQuery)) return false;
            }
            return true;
        });

        filtered.sort((a, b) => {
            const cmp = (a.capturedAt || '').localeCompare(b.capturedAt || '');
            return albumTimeSort === 'asc' ? cmp : -cmp;
        });

        currentFilteredPhotos = filtered;

        if (!filtered.length) {
            wrapper.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        const indexMap = new Map();
        filtered.forEach((p, idx) => indexMap.set(p.id, idx));

        if (albumGroupByLocation) {
            const groups = new Map();
            filtered.forEach(p => {
                const loc = p.location || album.city || 'Địa Điểm Chụp';
                if (!groups.has(loc)) groups.set(loc, []);
                groups.get(loc).push(p);
            });

            let html = '';
            groups.forEach((photosInLoc, locName) => {
                const firstTime = AdminModule.formatTimeShort(photosInLoc[0]?.capturedAt);
                const lastTime = AdminModule.formatTimeShort(photosInLoc[photosInLoc.length - 1]?.capturedAt);
                const timeRange = firstTime && lastTime && firstTime !== lastTime ? `${firstTime} → ${lastTime}` : firstTime;

                html += `
                    <div class="mb-10 last:mb-0">
                        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2.5 border-b border-zinc-200">
                            <div class="flex items-center gap-2.5">
                                <span class="w-8 h-8 rounded-xl bg-zinc-900 text-rose-400 flex items-center justify-center text-sm shadow-sm">
                                    <i class="fa-solid fa-location-dot"></i>
                                </span>
                                <div>
                                    <h3 class="text-base sm:text-lg font-bold text-zinc-900">${locName}</h3>
                                    <p class="text-xs text-zinc-500"><i class="fa-regular fa-clock mr-1"></i>Khung giờ chụp: ${timeRange || album.date}</p>
                                </div>
                            </div>
                            <span class="text-xs bg-zinc-100 text-zinc-700 px-3 py-1 rounded-full font-semibold self-start sm:self-auto">
                                ${photosInLoc.length} ảnh tại địa điểm này
                            </span>
                        </div>
                        <div class="photo-grid ${gridCols}">
                            ${photosInLoc.map(photo => renderSinglePhotoCard(photo, selections, indexMap.get(photo.id))).join('')}
                        </div>
                    </div>
                `;
            });
            wrapper.innerHTML = html;
        } else {
            wrapper.innerHTML = `
                <div class="photo-grid ${gridCols}">
                    ${filtered.map((photo, index) => renderSinglePhotoCard(photo, selections, index)).join('')}
                </div>
            `;
        }
    }

    function renderSinglePhotoCard(photo, selections, lightboxIdx) {
        const album = AdminModule.getAlbumById(currentAlbumId);
        const st = selections[photo.id] || {};
        const isSelected = !!st.selected;
        const hasNote = !!(st.note && st.note.trim());
        const timeStr = AdminModule.formatTimeShort(photo.capturedAt);
        const isDeliveredItem = !!photo.beforeUrl || activeCategory === 'DELIVERED';
        const showWatermark = !!(album && album.watermarkEnabled);

        const cardStateClass = isClientMode
            ? `${isSelected ? 'is-selected' : ''} ${hasNote ? 'has-note' : ''}`
            : '';

        const clientActionIcons = isClientMode ? `
            <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
                <button
                    type="button"
                    onclick="App.openPhotoNoteModal('${photo.id}')"
                    title="${hasNote ? 'Sửa ghi chú chỉnh sửa' : 'Thêm ghi chú chỉnh sửa'}"
                    class="card-icon-btn ${hasNote ? 'active-note' : ''}"
                >
                    <i class="fa-solid fa-comment-dots text-sm"></i>
                </button>
                <button
                    type="button"
                    onclick="App.toggleSelectPhoto('${photo.id}')"
                    title="${isSelected ? 'Bỏ chọn ảnh này' : 'Chọn ảnh muốn lưu / in'}"
                    class="card-icon-btn ${isSelected ? 'active-heart' : ''}"
                >
                    <i class="${isSelected ? 'fa-solid' : 'fa-regular'} fa-heart text-sm"></i>
                </button>
            </div>
        ` : '<div></div>';

        const clientMetaInfo = isClientMode ? `
            ${st.selectorName ? `<span class="text-[10px] text-sky-300 block"><i class="fa-regular fa-user mr-1"></i>Người chọn: ${st.selectorName}</span>` : ''}
            ${hasNote ? `<p class="text-[11px] text-amber-200 bg-black/50 px-1.5 py-0.5 rounded truncate mt-1"><i class="fa-regular fa-note-sticky mr-1"></i>${st.note}</p>` : ''}
        ` : '';

        return `
            <div class="photo-card ${cardStateClass}" onclick="App.openLightbox(${lightboxIdx})">
                <img src="${photo.url}" alt="${photo.code}" referrerpolicy="no-referrer" loading="lazy">
                ${showWatermark ? `<div class="pointer-events-none absolute inset-0 flex items-center justify-center"><span class="text-white/35 font-serif-display text-sm sm:text-base font-bold tracking-widest uppercase -rotate-12 border border-white/25 px-3 py-1 rounded select-none">DIHA STORY</span></div>` : ''}
                <div class="photo-card-overlay">
                    <div class="flex items-center justify-between">
                        <span class="bg-black/65 backdrop-blur-md text-white text-[11px] font-mono px-2.5 py-1 rounded-full tracking-wide flex items-center gap-1">
                            ${isDeliveredItem ? '<i class="fa-solid fa-wand-magic-sparkles text-emerald-400"></i>' : ''}
                            <span>${photo.code}</span>
                        </span>
                        ${clientActionIcons}
                    </div>

                    <div class="flex items-end justify-between gap-2">
                        <div class="min-w-0">
                            <span class="text-[10px] text-amber-300 font-medium block truncate">
                                <i class="fa-solid fa-location-dot mr-1"></i>${photo.location || ''}
                            </span>
                            <span class="text-[10px] text-zinc-300 block"><i class="fa-regular fa-clock mr-1"></i>${timeStr}</span>
                            ${clientMetaInfo}
                        </div>
                        ${isClientMode ? `
                            <button
                                type="button"
                                onclick="event.stopPropagation(); App.downloadSinglePhoto('${photo.id}')"
                                title="Lưu ảnh này về máy"
                                class="card-icon-btn !w-8 !h-8 shrink-0"
                            >
                                <i class="fa-solid fa-download text-xs"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function toggleSelectPhoto(photoId) {
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (isAlbumSelectionLocked(album)) {
            showToast("Album hiện đã khoá phần chọn ảnh (Hết hạn hoặc bạn đã gửi kết quả Hoàn tất)!", "error");
            return;
        }

        const selections = AdminModule.getSelections(album.id);
        const current = selections[photoId] || { selected: false, note: "" };

        if (!current.selected) {
            const currentCount = album.photos.filter(p => selections[p.id] && selections[p.id].selected).length;
            if (album.selectionLimit > 0 && currentCount >= album.selectionLimit) {
                showToast(`Gói chụp cho phép chọn tối đa ${album.selectionLimit} ảnh! Bạn hãy bỏ chọn ảnh khác trước nhé.`, 'error');
                return;
            }

            if (album.multiSelectorEnabled && !sessionSelectorNameMap[album.id]) {
                const entered = window.prompt("Nhập tên của bạn (VD: Cô dâu, Chú rể, Gia đình...) để phân loại danh sách chọn:", album.clientName || "Cô dâu");
                sessionSelectorNameMap[album.id] = (entered && entered.trim()) ? entered.trim() : (album.clientName || "Khách hàng");
            }

            current.selected = true;
            current.selectorName = sessionSelectorNameMap[album.id] || current.selectorName || album.clientName || "Khách hàng";
            selections[photoId] = current;
            AdminModule.saveSelections(selections, album.id);
            const p = album.photos.find(x => x.id === photoId);
            showToast(`Đã chọn ảnh ${p ? p.code : ''} vào danh sách lưu/in ♥`);
        } else {
            current.selected = false;
            selections[photoId] = current;
            AdminModule.saveSelections(selections, album.id);
        }

        renderPublicAlbum();
        if (currentView === 'manage-album') {
            AdminModule.renderAlbumManagePage();
        }
        if (currentLightboxIndex >= 0) {
            updateLightboxContent();
        }
    }

    function openPhotoNoteModal(photoId) {
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (isAlbumSelectionLocked(album)) {
            showToast("Album hiện đã khoá phần chọn và ghi chú ảnh!", "error");
            return;
        }

        activeNotePhotoId = photoId;
        const selections = AdminModule.getSelections(album.id);
        const photo = album.photos.find(p => p.id === photoId);
        if (!photo) return;

        const st = selections[photoId] || { selected: false, note: "" };
        document.getElementById('noteModalPhotoThumb').src = photo.url;
        document.getElementById('noteModalPhotoCode').innerText = `${photo.code} • ${photo.location || ''}`;
        document.getElementById('noteModalInput').value = st.note || "";
        document.getElementById('photoNoteModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('noteModalInput').focus(), 50);
    }

    function closePhotoNoteModal() {
        document.getElementById('photoNoteModal').classList.add('hidden');
        activeNotePhotoId = null;
    }

    function savePhotoNote(event) {
        if (event) event.preventDefault();
        if (!activeNotePhotoId) return;

        const album = AdminModule.getAlbumById(currentAlbumId);
        const val = document.getElementById('noteModalInput').value.trim();
        const selections = AdminModule.getSelections(album.id);
        const current = selections[activeNotePhotoId] || { selected: false, note: "" };
        current.note = val;
        if (val && !current.selected) {
            const currentCount = album.photos.filter(p => selections[p.id] && selections[p.id].selected).length;
            if (!album.selectionLimit || currentCount < album.selectionLimit) {
                current.selected = true;
            }
        }
        selections[activeNotePhotoId] = current;
        AdminModule.saveSelections(selections, album.id);

        closePhotoNoteModal();
        renderPublicAlbum();
        if (currentView === 'manage-album') {
            AdminModule.renderAlbumManagePage();
        }
        if (currentLightboxIndex >= 0) {
            updateLightboxContent();
        }
        showToast(val ? "Đã lưu ghi chú cho ảnh!" : "Đã xoá ghi chú trên ảnh.");
    }

    function fillQuickNoteChip(text) {
        const input = document.getElementById('noteModalInput');
        if (!input) return;
        input.value = input.value.trim() ? `${input.value.trim()}, ${text}` : text;
        input.focus();
    }

    // Lightbox Functions
    function openLightbox(index) {
        if (index < 0 || index >= currentFilteredPhotos.length) return;
        currentLightboxIndex = index;
        isLightboxZoomed = false;
        document.getElementById('lightboxModal').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        updateLightboxContent();
        // Reset zoom after image is set
        resetLightboxZoom(false);
        _lbNaturalWidth = 0;
        _lbNaturalHeight = 0;

        // Cập nhật URL đường dẫn hiển thị mã ảnh / tên ảnh khi đang mở xem ảnh
        syncLightboxUrl();
    }

    function syncLightboxUrl() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;
        let base = window.location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
        if (window.location.hostname.includes('github.io')) {
            base = '/dutustory';
        }
        const photoCode = encodeURIComponent(photo.code || photo.id);
        const url = isClientMode
            ? `${base}/${encodeURIComponent(currentAlbumId)}/${photoCode}?mode=client`
            : `${base}/${encodeURIComponent(currentAlbumId)}/${photoCode}`;
        window.history.replaceState({ view: 'album', albumId: currentAlbumId, isClientMode, photoCode }, '', url);
    }

    function syncAlbumCloseUrl() {
        let base = window.location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
        if (window.location.hostname.includes('github.io')) {
            base = '/dutustory';
        }
        const url = isClientMode
            ? `${base}/${encodeURIComponent(currentAlbumId)}?mode=client`
            : `${base}/${encodeURIComponent(currentAlbumId)}`;
        window.history.replaceState({ view: 'album', albumId: currentAlbumId, isClientMode }, '', url);
    }

    function openLightboxWithPhotos(photosList, index, albumId) {
        if (albumId) currentAlbumId = albumId;
        if (Array.isArray(photosList) && photosList.length > 0) {
            currentFilteredPhotos = photosList;
        }
        openLightbox(index);
    }

    function closeLightbox() {
        stopSlideshow();
        resetLightboxZoom(false);
        _lbNaturalWidth = 0;
        _lbNaturalHeight = 0;
        currentLightboxIndex = -1;
        document.getElementById('lightboxModal').classList.add('hidden');
        document.body.style.overflow = '';
        syncAlbumCloseUrl();
    }

    // Hàm trích xuất fileId của Google Drive từ mọi định dạng link ảnh
    function getDriveIdFromPhoto(photo) {
        if (!photo) return null;
        if (photo.driveFileId) return photo.driveFileId;
        const url = photo.url || '';
        const match =
            url.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/) ||
            url.match(/\/d\/([a-zA-Z0-9_-]{15,})/) ||
            url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        return match ? match[1] : null;
    }

    function updateLightboxContent() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;

        const album = AdminModule.getAlbumById(currentAlbumId);
        const selections = AdminModule.getSelections(currentAlbumId);
        const st = selections[photo.id] || { selected: false, note: "" };
        const timeStr = AdminModule.formatTimeShort(photo.capturedAt);

        isLightboxShowingBefore = false;
        const img = document.getElementById('lightboxImage');
        // Reset transform & scale khi chuyển ảnh
        resetLightboxZoom(false);
        _lbNaturalWidth = 0;
        _lbNaturalHeight = 0;

        // BẮT BUỘC dùng nguồn ảnh trực tiếp từ Google User Content với độ phân giải gốc (=s0)
        const driveId = getDriveIdFromPhoto(photo);
        let bestQualityUrl = photo.url;
        if (driveId) {
            bestQualityUrl = `https://lh3.googleusercontent.com/d/${driveId}=s0`;
        } else if (photo.url && photo.url.includes('drive.google.com/thumbnail')) {
            bestQualityUrl = photo.url.replace(/sz=w\d+/, 'sz=w4096');
        }

        // Gán thẳng ảnh chất lượng cao nhất ngay từ đầu
        img.src = bestQualityUrl;

        img.classList.remove('lightbox-img-zoomed');
        isLightboxZoomed = false;

        document.getElementById('lightboxCode').innerText = photo.code;
        document.getElementById('lightboxTitle').innerText = `${photo.location || ''} • ${timeStr}`;
        document.getElementById('lightboxCounter').innerText = `${currentLightboxIndex + 1} / ${currentFilteredPhotos.length}`;

        // Hiển thị nút "Xem ảnh đã chỉnh (JPG)" nếu bức ảnh này có bản chỉnh sửa
        const toggleJpgBtn = document.getElementById('lightboxToggleJpgBtn');
        const toggleJpgLabel = document.getElementById('lightboxToggleJpgBtnLabel');
        const matchedDelivered = (album.deliveredPhotos || []).find(d => d.originalPhotoId === photo.id);
        const hasEditedVersion = !!(photo.beforeUrl || matchedDelivered);

        if (toggleJpgBtn) {
            // Chỉ hiển thị ở trang chọn ảnh của khách và khi ảnh có bản chỉnh sửa
            toggleJpgBtn.classList.toggle('hidden', !isClientMode || !hasEditedVersion);
            if (toggleJpgLabel) {
                toggleJpgLabel.innerText = isLightboxShowingBefore ? 'Quay lại ảnh gốc (RAW)' : 'Xem ảnh đã chỉnh (JPG)';
            }
        }

        const downloadBtn = document.getElementById('lightboxDownloadBtn');
        if (downloadBtn) {
            downloadBtn.classList.toggle('hidden', !isClientMode);
        }

        const proofingControls = document.getElementById('lightboxProofingControls');
        if (proofingControls) {
            proofingControls.classList.toggle('hidden', !isClientMode);
        }

        const noteBtn = document.getElementById('lightboxNoteBtn');
        if (noteBtn) noteBtn.classList.toggle('hidden', !isClientMode);

        const heartBtn = document.getElementById('lightboxHeartBtn');
        if (heartBtn) {
            heartBtn.classList.toggle('hidden', !isClientMode);
            if (st.selected) {
                heartBtn.className = "px-4 py-2 rounded-full bg-rose-600 text-white text-xs font-semibold flex items-center gap-2 transition shadow-lg";
                heartBtn.innerHTML = `<i class="fa-solid fa-heart"></i> <span>Đã chọn lưu ảnh này</span>`;
            } else {
                heartBtn.className = "px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-2 transition";
                heartBtn.innerHTML = `<i class="fa-regular fa-heart"></i> <span>Chọn lưu ảnh này</span>`;
            }
        }

        const noteBadge = document.getElementById('lightboxNotePreview');
        if (noteBadge) {
            if (isClientMode && st.note && st.note.trim()) {
                noteBadge.classList.remove('hidden');
                noteBadge.innerHTML = `<i class="fa-regular fa-comment-dots mr-1.5 text-amber-400"></i>Ghi chú: "${st.note}"`;
            } else {
                noteBadge.classList.add('hidden');
            }
        }
    }

    function toggleLightboxJpgEdited() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;
        const album = AdminModule.getAlbumById(currentAlbumId);
        const matchedDelivered = (album.deliveredPhotos || []).find(d => d.originalPhotoId === photo.id);
        const img = document.getElementById('lightboxImage');
        const toggleJpgLabel = document.getElementById('lightboxToggleJpgBtnLabel');
        const toggleJpgBtn = document.getElementById('lightboxToggleJpgBtn');

        isLightboxShowingBefore = !isLightboxShowingBefore;

        if (isLightboxShowingBefore) {
            // Đang xem bản ảnh đã chỉnh sửa JPG
            let editedUrl = matchedDelivered ? matchedDelivered.url : (photo.beforeUrl ? photo.url : photo.url);
            img.src = editedUrl;
            img.style.filter = 'none';
            if (toggleJpgLabel) toggleJpgLabel.innerText = 'Quay lại ảnh gốc (RAW)';
            if (toggleJpgBtn) {
                toggleJpgBtn.className = "px-3.5 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-sm";
            }
            showToast("Đang hiển thị bản ảnh sau khi chỉnh sửa (JPG). Bạn có thể bấm nút Tải xuống để lưu ảnh này về máy!");
        } else {
            // Quay lại ảnh gốc RAW
            const driveId = getDriveIdFromPhoto(photo);
            let rawUrl = photo.url;
            if (driveId) {
                rawUrl = `https://lh3.googleusercontent.com/d/${driveId}=s0`;
            } else if (photo.url && photo.url.includes('drive.google.com/thumbnail')) {
                rawUrl = photo.url.replace(/sz=w\d+/, 'sz=w4096');
            }
            img.src = rawUrl;
            img.style.filter = 'none';
            if (toggleJpgLabel) toggleJpgLabel.innerText = 'Xem ảnh đã chỉnh (JPG)';
            if (toggleJpgBtn) {
                toggleJpgBtn.className = "px-3.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-sm";
            }
        }
    }

    function setLightboxCurrentAsCover() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;
        AdminModule.setPhotoAsCover(photo.url, currentAlbumId);
    }

    function nextLightboxPhoto() {
        if (!currentFilteredPhotos.length) return;
        resetLightboxZoom(false);
        _lbNaturalWidth = 0;
        _lbNaturalHeight = 0;
        currentLightboxIndex = (currentLightboxIndex + 1) % currentFilteredPhotos.length;
        updateLightboxContent();
        syncLightboxUrl();
    }

    function prevLightboxPhoto() {
        if (!currentFilteredPhotos.length) return;
        resetLightboxZoom(false);
        _lbNaturalWidth = 0;
        _lbNaturalHeight = 0;
        currentLightboxIndex = (currentLightboxIndex - 1 + currentFilteredPhotos.length) % currentFilteredPhotos.length;
        updateLightboxContent();
        syncLightboxUrl();
    }

    // ─── Lightbox Free Zoom / Pan (Hardware Accelerated 60FPS) ───────────────────
    let _lbRafId = null;
    let _lbTargetScale = 1;
    let _lbTargetPanX = 0;
    let _lbTargetPanY = 0;

    function _lbRenderTransform() {
        const img = document.getElementById('lightboxImage');
        if (!img) return;
        img.style.transform = `translate3d(${_lbPanX}px, ${_lbPanY}px, 0) scale(${_lbScale})`;
        img.style.cursor = _lbDragging ? 'grabbing' : (_lbScale > 1 ? 'grab' : 'default');
    }

    function _lbApplyTransform(animate) {
        if (!animate) {
            _lbRenderTransform();
            return;
        }
        // Smooth lerp / transition on double-click or button clicks
        const img = document.getElementById('lightboxImage');
        if (!img) return;
        img.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
        _lbRenderTransform();
        setTimeout(() => {
            if (img) img.style.transition = 'none';
        }, 220);
    }

    function resetLightboxZoom(animate) {
        _lbScale = 1; _lbPanX = 0; _lbPanY = 0;
        _lbTargetScale = 1; _lbTargetPanX = 0; _lbTargetPanY = 0;
        isLightboxZoomed = false;
        const img = document.getElementById('lightboxImage');
        if (img) {
            img.classList.remove('lightbox-img-zoomed');
            img.style.cursor = 'default';
        }
        _lbApplyTransform(animate);
    }

    function zoomInLightbox() {
        const img = document.getElementById('lightboxImage');
        if (!img) return;
        const rect = img.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        _lbZoomToward(cx, cy, _lbScale * 1.4);
    }

    function zoomOutLightbox() {
        const img = document.getElementById('lightboxImage');
        if (!img) return;
        const rect = img.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        _lbZoomToward(cx, cy, _lbScale / 1.4);
    }

    function toggleLightboxZoom() {
        if (_lbScale > 1.05) {
            resetLightboxZoom(true);
        } else {
            const img = document.getElementById('lightboxImage');
            if (!img) return;
            const rect = img.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            _lbZoomToward(cx, cy, 2.5);
        }
    }

    let _lbNaturalWidth = 0;
    let _lbNaturalHeight = 0;

    function _lbClampPan() {
        if (_lbScale <= 1) { _lbPanX = 0; _lbPanY = 0; return; }
        const img = document.getElementById('lightboxImage');
        if (!img) return;

        const stage = document.getElementById('lightboxStage') || img.parentElement;
        const stageW = stage ? stage.clientWidth : window.innerWidth;
        const stageH = stage ? stage.clientHeight : window.innerHeight;

        const renderedW = img.offsetWidth || 800;
        const renderedH = img.offsetHeight || 600;

        // Chiều rộng & chiều cao thực tế của ảnh sau khi phóng to
        const scaledW = renderedW * _lbScale;
        const scaledH = renderedH * _lbScale;

        // Cho phép kéo tự do đến tận mép ảnh:
        // Đảm bảo dù ảnh kích thước thế nào, người dùng đều có thể kéo mép trái/phải/trên/dưới vào giữa màn hình để ngắm
        const maxX = Math.max(stageW * 0.45, (scaledW - stageW) / 2 + stageW * 0.35);
        const maxY = Math.max(stageH * 0.45, (scaledH - stageH) / 2 + stageH * 0.35);

        _lbPanX = Math.max(-maxX, Math.min(maxX, _lbPanX));
        _lbPanY = Math.max(-maxY, Math.min(maxY, _lbPanY));
    }

    function _lbZoomToward(clientX, clientY, newScale, animate) {
        const img = document.getElementById('lightboxImage');
        if (!img) return;
        newScale = Math.max(LB_MIN_SCALE, Math.min(LB_MAX_SCALE, newScale));
        if (newScale === _lbScale) return;

        const stage = document.getElementById('lightboxStage') || img.parentElement;
        const stageRect = stage ? stage.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

        // Tọa độ tâm ảnh unscaled (ngay trung tâm sân khấu stage)
        const stageCenterX = stageRect.left + stageRect.width / 2;
        const stageCenterY = stageRect.top + stageRect.height / 2;

        // Vị trí con trỏ chuột so với tâm ảnh hiện tại trên màn hình
        const mouseFromImgCenterX = clientX - (stageCenterX + _lbPanX);
        const mouseFromImgCenterY = clientY - (stageCenterY + _lbPanY);

        // Chuẩn hóa tâm zoom theo tỉ lệ mới:
        // Điểm ảnh nằm ngay dưới con trỏ chuột sẽ giữ nguyên vị trí tuyệt đối trên màn hình
        const scaleRatio = newScale / _lbScale;
        _lbPanX = _lbPanX - mouseFromImgCenterX * (scaleRatio - 1);
        _lbPanY = _lbPanY - mouseFromImgCenterY * (scaleRatio - 1);
        _lbScale = newScale;
        isLightboxZoomed = _lbScale > 1.05;
        _lbClampPan();

        if (animate) {
            _lbApplyTransform(true);
        } else {
            // Khi cuộn chuột: render qua requestAnimationFrame ngay trong frame tiếp theo
            if (!_lbRafId) {
                _lbRafId = requestAnimationFrame(() => {
                    _lbRenderTransform();
                    _lbRafId = null;
                });
            }
        }
    }

    function setupLightboxZoom() {
        const img = document.getElementById('lightboxImage');
        if (!img) return;

        // ── Mouse wheel (cuộn chuột để zoom bám sát tốc độ thật) ─────────────────
        const onWheelZoom = (e) => {
            if (currentLightboxIndex < 0) return;
            e.preventDefault();
            e.stopPropagation();

            // Tính toán mức độ cuộn thực tế theo deltaY chuẩn hóa (chống vọt tốc độ)
            const rawDelta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            const clampedDelta = Math.max(-100, Math.min(100, rawDelta));
            // Mỗi nấc cuộn nhẹ chỉ thay đổi khoảng 4% - 6%, zoom êm dịu theo đúng tay lăn
            const zoomDelta = -clampedDelta * 0.0012;
            const newScale = _lbScale * (1 + zoomDelta);

            _lbZoomToward(e.clientX, e.clientY, newScale, false);
        };

        img.addEventListener('wheel', onWheelZoom, { passive: false });

        const container = img.parentElement;
        if (container) {
            container.addEventListener('wheel', onWheelZoom, { passive: false });
        }

        // ── Mouse drag / pan (bắt trên cả ảnh và toàn bộ sân khấu stage) ────────
        const onStartDrag = (e) => {
            if (_lbScale <= 1.02) return;
            // Chỉ nhận click chuột trái và không bấm trúng nút prev/next
            if (e.button !== 0) return;
            if (e.target && e.target.closest('button')) return;
            e.preventDefault();
            _lbDragging = true;
            _lbDragStartX = e.clientX;
            _lbDragStartY = e.clientY;
            _lbPanStartX = _lbPanX;
            _lbPanStartY = _lbPanY;
            img.classList.add('lightbox-dragging');
            const stage = document.getElementById('lightboxStage');
            if (stage) stage.classList.add('lightbox-dragging');
        };

        img.addEventListener('mousedown', onStartDrag);
        const stage = document.getElementById('lightboxStage');
        if (stage) stage.addEventListener('mousedown', onStartDrag);

        document.addEventListener('mousemove', (e) => {
            if (!_lbDragging) return;
            _lbPanX = _lbPanStartX + (e.clientX - _lbDragStartX);
            _lbPanY = _lbPanStartY + (e.clientY - _lbDragStartY);
            _lbClampPan();
            if (!_lbRafId) {
                _lbRafId = requestAnimationFrame(() => {
                    _lbRenderTransform();
                    _lbRafId = null;
                });
            }
        });

        document.addEventListener('mouseup', () => {
            if (!_lbDragging) return;
            _lbDragging = false;
            img.classList.remove('lightbox-dragging');
            const stage = document.getElementById('lightboxStage');
            if (stage) stage.classList.remove('lightbox-dragging');
            _lbApplyTransform(false);
        });

        // ── Double-click toggle ────────────────────────────────────────────
        img.addEventListener('dblclick', (e) => {
            e.preventDefault();
            if (_lbScale > 1.05) {
                resetLightboxZoom(true);
            } else {
                _lbZoomToward(e.clientX, e.clientY, 2.5);
            }
        });

        // ── Touch: pinch-to-zoom + drag ────────────────────────────────────
        img.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches.length === 2) {
                const t0 = e.touches[0], t1 = e.touches[1];
                _lbPinchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
                _lbPinchCenterX = (t0.clientX + t1.clientX) / 2;
                _lbPinchCenterY = (t0.clientY + t1.clientY) / 2;
                _lbPinchScaleStart = _lbScale;
                _lbPinchPanStartX = _lbPanX;
                _lbPinchPanStartY = _lbPanY;
            } else if (e.touches.length === 1) {
                const now = Date.now();
                if (now - _lbLastTap < 300) {
                    if (_lbScale > 1.05) {
                        resetLightboxZoom(true);
                    } else {
                        _lbZoomToward(e.touches[0].clientX, e.touches[0].clientY, 2.5);
                    }
                    _lbLastTap = 0;
                } else {
                    _lbLastTap = now;
                }
                _lbDragging = (_lbScale > 1.05);
                _lbDragStartX = e.touches[0].clientX;
                _lbDragStartY = e.touches[0].clientY;
                _lbPanStartX = _lbPanX;
                _lbPanStartY = _lbPanY;
            }
        }, { passive: false });

        img.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 2) {
                const t0 = e.touches[0], t1 = e.touches[1];
                const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
                const newScale = Math.max(LB_MIN_SCALE, Math.min(LB_MAX_SCALE,
                    _lbPinchScaleStart * (dist / _lbPinchDist)));
                const cx = (t0.clientX + t1.clientX) / 2;
                const cy = (t0.clientY + t1.clientY) / 2;
                _lbZoomToward(cx, cy, newScale, true);
            } else if (e.touches.length === 1 && _lbDragging) {
                _lbPanX = _lbPanStartX + (e.touches[0].clientX - _lbDragStartX);
                _lbPanY = _lbPanStartY + (e.touches[0].clientY - _lbDragStartY);
                _lbClampPan();
                _lbApplyTransform(false);
            }
        }, { passive: false });

        img.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) _lbPinchDist = 0;
            if (e.touches.length === 0) _lbDragging = false;
        });
    }

    function toggleSlideshow() {
        const btn = document.getElementById('lightboxSlideshowBtn');
        if (slideshowTimer) {
            stopSlideshow();
            showToast("Đã dừng trình chiếu tự động.");
        } else {
            slideshowTimer = setInterval(() => {
                nextLightboxPhoto();
            }, 3000);
            if (btn) btn.innerHTML = `<i class="fa-solid fa-pause text-amber-400"></i> <span class="hidden sm:inline">Dừng chiếu</span>`;
            showToast("Đang phát Slideshow tự động (3 giây/ảnh)");
        }
    }

    function stopSlideshow() {
        if (slideshowTimer) {
            clearInterval(slideshowTimer);
            slideshowTimer = null;
        }
        const btn = document.getElementById('lightboxSlideshowBtn');
        if (btn) btn.innerHTML = `<i class="fa-solid fa-play"></i> <span class="hidden sm:inline">Slideshow</span>`;
    }

    function toggleLightboxCurrentHeart() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (photo) toggleSelectPhoto(photo.id);
    }

    function openLightboxCurrentNote() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (photo) openPhotoNoteModal(photo.id);
    }

    function downloadLightboxCurrentPhoto() {
        if (!isClientMode) {
            showToast("Chế độ chỉ xem không cho phép tải ảnh!", "error");
            return;
        }
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (photo) downloadSinglePhoto(photo.id);
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Bảo vệ bản quyền ở chế độ Chỉ Xem: chặn chụp màn hình, lưu trang, in ấn, view source
            if (currentView === 'album' && !isClientMode) {
                // Chặn PrintScreen
                if (e.key === 'PrintScreen' || e.keyCode === 44) {
                    e.preventDefault();
                    triggerAntiCaptureShield("Chức năng chụp màn hình đã bị vô hiệu hoá trên trang này!");
                    return;
                }
                // Chặn Ctrl+S (Lưu trang), Ctrl+P (In ấn), Ctrl+U (Xem nguồn), Ctrl+Shift+I (F12 DevTools)
                if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u', 'S', 'P', 'U'].includes(e.key)) {
                    e.preventDefault();
                    showToast("Chế độ chỉ xem không cho phép lưu hoặc in trang!", "error");
                    return;
                }
                if (e.key === 'F12' || ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key))) {
                    e.preventDefault();
                    return;
                }
            }

            if (currentLightboxIndex < 0) return;
            const noteModal = document.getElementById('photoNoteModal');
            if (noteModal && !noteModal.classList.contains('hidden')) return;

            if (e.key === 'ArrowRight') nextLightboxPhoto();
            else if (e.key === 'ArrowLeft') prevLightboxPhoto();
            else if (e.key === 'Escape') closeLightbox();
        });

        // Chặn menu chuột phải ở chế độ Chỉ Xem
        document.addEventListener('contextmenu', (e) => {
            if (currentView === 'album' && !isClientMode) {
                e.preventDefault();
                showToast("Hình ảnh này là tài sản của studio và khách hàng. Vui lòng không lưu ảnh khi không được phép", "error");
            }
        });

        // Chặn kéo ảnh (drag) ra ngoài để lưu
        document.addEventListener('dragstart', (e) => {
            if (currentView === 'album' && !isClientMode) {
                e.preventDefault();
            }
        });

        // Chặn phím chụp màn hình bằng cách theo dõi sự kiện nhả phím PrintScreen
        window.addEventListener('keyup', (e) => {
            if (currentView === 'album' && !isClientMode) {
                if (e.key === 'PrintScreen' || e.keyCode === 44) {
                    triggerAntiCaptureShield("Chức năng chụp màn hình đã bị vô hiệu hoá trên trang này!");
                }
            }
        });
    }

    let antiCaptureTimeout = null;
    function triggerAntiCaptureShield(msg) {
        const shield = document.getElementById('viewOnlyAntiCaptureShield');
        if (!shield) return;
        shield.classList.add('active');
        shield.classList.remove('hidden');
        if (msg) showToast(msg, "error");
        if (antiCaptureTimeout) clearTimeout(antiCaptureTimeout);
        antiCaptureTimeout = setTimeout(() => {
            shield.classList.remove('active');
            shield.classList.add('hidden');
        }, 1500);
    }

    async function downloadSinglePhoto(photoId) {
        if (!isClientMode) {
            showToast("Chế độ chỉ xem không cho phép tải ảnh!", "error");
            return;
        }
        const album = AdminModule.getAlbumById(currentAlbumId);
        let photo =
            album.photos.find(p => p.id === photoId) ||
            (album.deliveredPhotos || []).find(p => p.id === photoId);
        if (!photo) return;

        // Ưu tiên tải bản ảnh JPG đã chỉnh sửa nếu có
        const matchedDelivered = (album.deliveredPhotos || []).find(d => d.originalPhotoId === photo.id);
        if (matchedDelivered && matchedDelivered.url) {
            photo = matchedDelivered;
        }

        showToast(`Đang chuẩn bị lưu ảnh ${photo.code} về máy...`);

        // Handle Base64 local computer images directly
        if (photo.url && photo.url.startsWith('data:image')) {
            const link = document.createElement('a');
            link.href = photo.url;
            link.download = `${photo.code}-DucThuanStudio.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }

        // Handle Google Drive photos with direct download link
        const driveIdMatch = photo.driveFileId || (photo.url && (photo.url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/) || [])[1]);
        if (driveIdMatch) {
            const dlUrl = `https://drive.google.com/uc?export=download&id=${driveIdMatch}`;
            const link = document.createElement('a');
            link.href = dlUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.download = `${photo.code}-DucThuanStudio.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }

        try {
            const response = await fetch(photo.url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${photo.code}-DucThuanStudio.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            window.open(photo.url, '_blank');
        }
    }

    function openDownloadModal() {
        if (!isClientMode) {
            showToast("Chế độ chỉ xem không cho phép tải ảnh!", "error");
            return;
        }
        const album = AdminModule.getAlbumById(currentAlbumId);
        const selections = AdminModule.getSelections(album.id);
        const selectedCount = album.photos.filter(p => selections[p.id] && selections[p.id].selected).length;

        document.getElementById('dlModalTotalCount').innerText = `${album.photos.length} ảnh`;
        document.getElementById('dlModalSelectedCount').innerText = `${selectedCount} ảnh`;
        document.getElementById('downloadModal').classList.remove('hidden');
    }

    function closeDownloadModal() {
        document.getElementById('downloadModal').classList.add('hidden');
    }

    async function handleBatchDownload(event) {
        event.preventDefault();
        const scope = document.querySelector('input[name="dlScope"]:checked').value;
        const quality = document.querySelector('input[name="dlQuality"]:checked').value;
        const album = AdminModule.getAlbumById(currentAlbumId);
        const selections = AdminModule.getSelections(album.id);

        let targetPhotos = album.photos;
        if (scope === 'selected') {
            targetPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);
            if (!targetPhotos.length) {
                showToast("Bạn chưa thả tim chọn bức ảnh nào để lưu về!", "error");
                return;
            }
        }

        closeDownloadModal();
        showToast(`Đang bắt đầu lưu ${targetPhotos.length} ảnh (${quality === 'original' ? 'Chất lượng Gốc 4K' : 'Bản nén Web'})...`);

        const batch = targetPhotos.slice(0, 3);
        for (let i = 0; i < batch.length; i++) {
            await downloadSinglePhoto(batch[i].id);
        }
        if (targetPhotos.length > 3) {
            setTimeout(() => {
                showToast(`Đã tải mẫu ${batch.length}/${targetPhotos.length} ảnh về máy.`);
            }, 1500);
        }
    }

    function openSubmitSelectionModal() {
        const album = AdminModule.getAlbumById(currentAlbumId);
        if (isAlbumSelectionLocked(album)) {
            showToast("Album hiện đã khoá phần chọn ảnh. Vui lòng liên hệ Studio nếu bạn muốn mở khoá chọn lại!", "error");
            return;
        }

        const selections = AdminModule.getSelections(album.id);
        const selectedPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);

        const codesEl = document.getElementById('submitModalCodesPreview');
        const countEl = document.getElementById('submitModalCountBadge');
        const nameInput = document.getElementById('submitClientName');
        const lockNotice = document.getElementById('submitModalAutoLockNotice');

        if (countEl) {
            countEl.innerText = `${selectedPhotos.length} / ${album.selectionLimit || '∞'} ảnh đã chọn`;
        }
        if (nameInput) {
            nameInput.value = album.clientName || '';
        }
        if (lockNotice) {
            lockNotice.classList.toggle('hidden', !album.completeLockEnabled);
        }

        if (codesEl) {
            if (!selectedPhotos.length) {
                codesEl.innerHTML = `<p class="text-xs text-rose-600 py-2">Bạn chưa bấm biểu tượng Trái Tim (♥) trên bức ảnh nào. Hãy chọn các bức ảnh ưng ý trước khi hoàn tất nhé!</p>`;
            } else {
                codesEl.innerHTML = selectedPhotos.map(p => {
                    const note = selections[p.id]?.note;
                    return `
                        <div class="flex items-center justify-between py-1.5 border-b border-zinc-100 last:border-0 text-xs">
                            <div class="flex items-center gap-2">
                                <img src="${p.url}" class="w-8 h-8 rounded object-cover">
                                <span class="font-mono font-bold text-zinc-800">${p.code}</span>
                                <span class="text-zinc-400 truncate max-w-[140px]">${p.location || ''}</span>
                            </div>
                            <span class="text-amber-700 truncate max-w-[160px]">${note ? `✎ ${note}` : ''}</span>
                        </div>
                    `;
                }).join('');
            }
        }

        document.getElementById('submitSelectionModal').classList.remove('hidden');
    }

    function closeSubmitSelectionModal() {
        document.getElementById('submitSelectionModal').classList.add('hidden');
    }

    function handleClientSubmitSelections(event) {
        event.preventDefault();
        const album = AdminModule.getAlbumById(currentAlbumId);
        const selections = AdminModule.getSelections(album.id);
        const selectedPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);

        if (!selectedPhotos.length) {
            showToast("Vui lòng thả tim ít nhất 1 bức ảnh trước khi bấm Hoàn tất chọn ảnh!", "error");
            return;
        }

        const clientName = document.getElementById('submitClientName').value.trim() || album.clientName;
        const clientPhone = document.getElementById('submitClientPhone').value.trim() || "Khách hàng";
        const generalNote = document.getElementById('submitGeneralNote').value.trim();

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} - ${now.toLocaleDateString('vi-VN')}`;

        AdminModule.addSubmission({
            clientName,
            clientPhone,
            generalNote,
            codes: selectedPhotos.map(p => p.code),
            submittedAt: timeStr
        }, album.id);

        if (album.completeLockEnabled) {
            AdminModule.lockAlbumAfterClientSubmit(album.id);
        }

        closeSubmitSelectionModal();
        renderPublicAlbum();
        showToast(
            album.completeLockEnabled
                ? `Đã hoàn tất gửi ${selectedPhotos.length} ảnh & tự động khoá phần chọn ảnh!`
                : `Đã gửi danh sách ${selectedPhotos.length} ảnh cho Studio thành công!`
        );
    }

    function copyClientSelectionSummary() {
        const album = AdminModule.getAlbumById(currentAlbumId);
        const selections = AdminModule.getSelections(album.id);
        const selectedPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);

        if (!selectedPhotos.length) {
            showToast("Chưa có ảnh nào trong danh sách chọn!", "error");
            return;
        }

        const lines = [
            `ALBUM: ${album.title}`,
            `LINK ALBUM: ${AdminModule.getClientShareUrl(album.id)}`,
            `KHÁCH HÀNG: ${album.clientName}`,
            `DANH SÁCH MÃ ẢNH CHỌN (${selectedPhotos.length} ảnh):`,
            selectedPhotos.map(p => p.code).join(', '),
            `--- CHI TIẾT THEO ĐỊA ĐIỂM & GHI CHÚ ---`,
            ...selectedPhotos.map(p => {
                const n = selections[p.id]?.note;
                return `- ${p.code} (${p.location || ''}): ${n ? n : 'Chỉnh chuẩn màu Studio'}`;
            })
        ];

        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            showToast("Đã sao chép danh sách ảnh & ghi chú!");
        });
    }

    function copyCurrentAlbumLink() {
        AdminModule.copyAlbumClientLink(currentAlbumId);
    }

    function scrollToGallery() {
        const targetEl = (!isClientMode || document.getElementById('galleryToolbarAnchor')?.classList.contains('hidden'))
            ? document.getElementById('categoryTabsContainer') || document.getElementById('gallerySectionsWrapper')
            : document.getElementById('galleryToolbarAnchor');
        if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
    }

    function scrollToVideoHighlight() {
        const el = document.getElementById('videoHighlightSection');
        if (el && !el.classList.contains('hidden')) {
            el.scrollIntoView({ behavior: 'smooth' });
        } else {
            showToast("Album này hiện không đính kèm Video Highlight.");
        }
    }

    function showToast(msg, type = 'success') {
        const toast = document.getElementById('toast');
        const icon = document.getElementById('toastIcon');
        const text = document.getElementById('toastMessage');

        if (!toast) return;

        text.innerText = msg;
        if (type === 'error') {
            icon.className = 'fa-solid fa-circle-xmark text-rose-400 text-lg';
        } else {
            icon.className = 'fa-solid fa-circle-check text-emerald-400 text-lg';
        }

        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3200);
    }

    return {
        init,
        showView,
        getCurrentAlbumId,
        openAlbumPage,
        handleQuickAlbumCodeAccess,
        setHomeLocationFilter,
        setHomeTimeSort,
        toggleHomeGroupByLocation,
        renderHomeShowcase,
        renderPublicAlbum,
        maybeShowClientReminderModal,
        closeClientReminderModal,
        handlePinUnlock,
        setAlbumTimeSort,
        toggleAlbumGroupByLocation,
        setCategoryFilter,
        handleSearchInput,
        setGridCols,
        toggleSelectPhoto,
        openPhotoNoteModal,
        closePhotoNoteModal,
        savePhotoNote,
        fillQuickNoteChip,
        openLightbox,
        openLightboxWithPhotos,
        closeLightbox,
        toggleLightboxJpgEdited,
        nextLightboxPhoto,
        prevLightboxPhoto,
        toggleLightboxZoom,
        zoomInLightbox,
        zoomOutLightbox,
        resetLightboxZoom,
        toggleSlideshow,
        toggleLightboxCurrentHeart,
        openLightboxCurrentNote,
        downloadLightboxCurrentPhoto,
        downloadSinglePhoto,
        openDownloadModal,
        closeDownloadModal,
        handleBatchDownload,
        openSubmitSelectionModal,
        closeSubmitSelectionModal,
        handleClientSubmitSelections,
        copyClientSelectionSummary,
        copyCurrentAlbumLink,
        handleAlbumBackAction,
        scrollToGallery,
        scrollToVideoHighlight,
        getIsClientMode: () => isClientMode,
        setIsClientMode: (val) => { isClientMode = !!val; },
        showToast
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
