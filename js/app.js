/**
 * App Module - Giao diện Trả Ảnh & Chọn Ảnh Khách Hàng (Shotpik Style)
 */
const App = (function () {
    let activeCategory = 'ALL';
    let searchQuery = '';
    let gridCols = 'cols-4';
    let currentFilteredPhotos = [];
    let currentLightboxIndex = -1;
    let isLightboxZoomed = false;
    let slideshowTimer = null;
    let unlockedPinSession = false;
    let activeNotePhotoId = null;

    function init() {
        AuthModule.checkAuthUI();
        renderPublicAlbum();
        setupKeyboardShortcuts();
    }

    function showView(viewName) {
        const publicView = document.getElementById('publicView');
        const adminView = document.getElementById('adminView');

        if (viewName === 'admin') {
            if (!AuthModule.isLoggedIn()) {
                AuthModule.openLoginModal();
                return;
            }
            publicView.classList.add('hidden');
            adminView.classList.remove('hidden');
            AdminModule.populateAdminDashboard();
        } else {
            publicView.classList.remove('hidden');
            adminView.classList.add('hidden');
            renderPublicAlbum();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function checkAlbumPinLock(album) {
        const lockOverlay = document.getElementById('pinLockOverlay');
        if (!lockOverlay) return false;

        if (album.pinCode && album.pinCode.trim() !== "" && !unlockedPinSession && !AuthModule.isLoggedIn()) {
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
        const album = AdminModule.getAlbumData();

        if (input && input.value.trim() === album.pinCode.trim()) {
            unlockedPinSession = true;
            if (err) err.classList.add('hidden');
            document.getElementById('pinLockOverlay').classList.add('hidden');
            showToast("Đã mở khoá Album thành công!");
        } else {
            if (err) err.classList.remove('hidden');
        }
    }

    function renderPublicAlbum() {
        const album = AdminModule.getAlbumData();
        const selections = AdminModule.getSelections();

        checkAlbumPinLock(album);

        // 1. Update Hero Banner
        const setTxt = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.innerText = txt;
        };

        const coverImg = document.getElementById('heroCoverImage');
        if (coverImg) coverImg.src = album.coverUrl;

        setTxt('heroAlbumTitle', album.title);
        setTxt('heroClientName', album.clientName);
        setTxt('heroShootDate', album.date);
        setTxt('heroLocation', album.location || 'Việt Nam');
        setTxt('heroPhotoCount', `${album.photos.length} Ảnh`);

        // 2. Update Selection Counters in Navbar & Toolbar
        const selectedIds = album.photos.filter(p => selections[p.id] && selections[p.id].selected).map(p => p.id);
        const notedIds = album.photos.filter(p => selections[p.id] && selections[p.id].note && selections[p.id].note.trim()).map(p => p.id);
        const limitText = album.selectionLimit > 0 ? `${selectedIds.length}/${album.selectionLimit}` : `${selectedIds.length}`;

        setTxt('navSelectedCounter', limitText);
        setTxt('toolbarSelectedCounter', limitText);

        // 3. Render Category Filter Tabs
        renderCategoryTabs(album, selectedIds.length, notedIds.length);

        // 4. Filter & Render Photo Grid
        renderPhotoGrid(album, selections);

        // 5. Update Video Highlight Section
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

        const uniqueCats = [];
        album.photos.forEach(p => {
            if (p.category && !uniqueCats.includes(p.category)) {
                uniqueCats.push(p.category);
            }
        });

        const tabs = [
            { id: 'ALL', label: `Tất cả (${album.photos.length})`, icon: 'fa-solid fa-border-all' },
            { id: 'SELECTED', label: `Đã chọn (${selectedCount})`, icon: 'fa-solid fa-heart text-rose-500' }
        ];

        if (notedCount > 0) {
            tabs.push({ id: 'NOTED', label: `Có ghi chú (${notedCount})`, icon: 'fa-solid fa-comment-dots text-amber-500' });
        }

        uniqueCats.forEach(cat => {
            const count = album.photos.filter(p => p.category === cat).length;
            tabs.push({ id: `CAT:${cat}`, label: `${cat} (${count})`, icon: '' });
        });

        container.innerHTML = tabs.map(tab => {
            const isActive = activeCategory === tab.id;
            return `
                <button
                    type="button"
                    onclick="App.setCategoryFilter('${tab.id}')"
                    class="px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap flex items-center gap-1.5 ${
                        isActive
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
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
        const album = AdminModule.getAlbumData();
        const selections = AdminModule.getSelections();
        renderPhotoGrid(album, selections);
    }

    function setGridCols(colsClass) {
        gridCols = colsClass;
        const grid = document.getElementById('galleryPhotoGrid');
        if (grid) {
            grid.className = `photo-grid ${gridCols}`;
        }
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
        const grid = document.getElementById('galleryPhotoGrid');
        const emptyState = document.getElementById('galleryEmptyState');
        if (!grid) return;

        grid.className = `photo-grid ${gridCols}`;

        const filtered = album.photos.filter(p => {
            const st = selections[p.id] || {};
            if (activeCategory === 'SELECTED' && !st.selected) return false;
            if (activeCategory === 'NOTED' && !(st.note && st.note.trim())) return false;
            if (activeCategory.startsWith('CAT:')) {
                const targetCat = activeCategory.slice(4);
                if (p.category !== targetCat) return false;
            }
            if (searchQuery) {
                const hay = `${p.code} ${p.title || ''} ${p.category || ''} ${st.note || ''}`.toLowerCase();
                if (!hay.includes(searchQuery)) return false;
            }
            return true;
        });

        currentFilteredPhotos = filtered;

        if (!filtered.length) {
            grid.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        grid.innerHTML = filtered.map((photo, index) => {
            const st = selections[photo.id] || {};
            const isSelected = !!st.selected;
            const hasNote = !!(st.note && st.note.trim());

            return `
                <div class="photo-card ${isSelected ? 'is-selected' : ''} ${hasNote ? 'has-note' : ''}" onclick="App.openLightbox(${index})">
                    <img src="${photo.url}" alt="${photo.code}" loading="lazy">
                    <div class="photo-card-overlay">
                        <!-- Top Row -->
                        <div class="flex items-center justify-between">
                            <span class="bg-black/60 backdrop-blur-md text-white text-[11px] font-mono px-2.5 py-1 rounded-full tracking-wide">
                                ${photo.code}
                            </span>
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
                                    title="${isSelected ? 'Bỏ chọn ảnh này' : 'Chọn ảnh in / chỉnh sửa'}"
                                    class="card-icon-btn ${isSelected ? 'active-heart' : ''}"
                                >
                                    <i class="${isSelected ? 'fa-solid' : 'fa-regular'} fa-heart text-sm"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Bottom Row -->
                        <div class="flex items-end justify-between gap-2">
                            <div class="min-w-0">
                                <span class="text-[10px] uppercase tracking-wider text-white/80 font-semibold block">${photo.category || ''}</span>
                                <p class="text-xs sm:text-sm text-white font-medium truncate">${photo.title || photo.code}</p>
                                ${hasNote ? `<p class="text-[11px] text-amber-300 truncate mt-0.5"><i class="fa-regular fa-note-sticky mr-1"></i>${st.note}</p>` : ''}
                            </div>
                            <button
                                type="button"
                                onclick="event.stopPropagation(); App.downloadSinglePhoto('${photo.id}')"
                                title="Tải ảnh này về máy"
                                class="card-icon-btn !w-8 !h-8 shrink-0"
                            >
                                <i class="fa-solid fa-download text-xs"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function toggleSelectPhoto(photoId) {
        const album = AdminModule.getAlbumData();
        const selections = AdminModule.getSelections();
        const current = selections[photoId] || { selected: false, note: "" };

        if (!current.selected) {
            // Check selection limit
            const currentCount = album.photos.filter(p => selections[p.id] && selections[p.id].selected).length;
            if (album.selectionLimit > 0 && currentCount >= album.selectionLimit) {
                showToast(`Gói chụp cho phép chọn tối đa ${album.selectionLimit} ảnh! Bạn hãy bỏ chọn ảnh khác trước nhé.`, 'error');
                return;
            }
            current.selected = true;
            selections[photoId] = current;
            AdminModule.saveSelections(selections);
            const p = album.photos.find(x => x.id === photoId);
            showToast(`Đã thêm ${p ? p.code : 'ảnh'} vào danh sách chọn ♥`);
        } else {
            current.selected = false;
            selections[photoId] = current;
            AdminModule.saveSelections(selections);
        }

        renderPublicAlbum();
        if (currentLightboxIndex >= 0) {
            updateLightboxContent();
        }
    }

    // Individual Photo Retouch Note Modal
    function openPhotoNoteModal(photoId) {
        activeNotePhotoId = photoId;
        const album = AdminModule.getAlbumData();
        const selections = AdminModule.getSelections();
        const photo = album.photos.find(p => p.id === photoId);
        if (!photo) return;

        const st = selections[photoId] || { selected: false, note: "" };
        document.getElementById('noteModalPhotoThumb').src = photo.url;
        document.getElementById('noteModalPhotoCode').innerText = photo.code;
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

        const val = document.getElementById('noteModalInput').value.trim();
        const selections = AdminModule.getSelections();
        const current = selections[activeNotePhotoId] || { selected: false, note: "" };
        current.note = val;
        if (val && !current.selected) {
            // Automatically select photo if client writes a retouch request and under limit
            const album = AdminModule.getAlbumData();
            const currentCount = album.photos.filter(p => selections[p.id] && selections[p.id].selected).length;
            if (!album.selectionLimit || currentCount < album.selectionLimit) {
                current.selected = true;
            }
        }
        selections[activeNotePhotoId] = current;
        AdminModule.saveSelections(selections);

        closePhotoNoteModal();
        renderPublicAlbum();
        if (currentLightboxIndex >= 0) {
            updateLightboxContent();
        }
        showToast(val ? "Đã lưu ghi chú chỉnh sửa cho ảnh!" : "Đã xoá ghi chú trên ảnh.");
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
    }

    function closeLightbox() {
        stopSlideshow();
        currentLightboxIndex = -1;
        document.getElementById('lightboxModal').classList.add('hidden');
        document.body.style.overflow = '';
    }

    function updateLightboxContent() {
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (!photo) return;

        const selections = AdminModule.getSelections();
        const st = selections[photo.id] || { selected: false, note: "" };

        const img = document.getElementById('lightboxImage');
        img.src = photo.url;
        img.classList.remove('lightbox-img-zoomed');
        isLightboxZoomed = false;

        document.getElementById('lightboxCode').innerText = photo.code;
        document.getElementById('lightboxTitle').innerText = `${photo.title || photo.code} • ${photo.category || ''}`;
        document.getElementById('lightboxCounter').innerText = `${currentLightboxIndex + 1} / ${currentFilteredPhotos.length}`;

        const heartBtn = document.getElementById('lightboxHeartBtn');
        if (st.selected) {
            heartBtn.className = "px-4 py-2 rounded-full bg-rose-600 text-white text-xs font-semibold flex items-center gap-2 transition shadow-lg";
            heartBtn.innerHTML = `<i class="fa-solid fa-heart"></i> <span>Đã chọn ảnh này</span>`;
        } else {
            heartBtn.className = "px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-2 transition";
            heartBtn.innerHTML = `<i class="fa-regular fa-heart"></i> <span>Chọn ảnh (Retouch/In)</span>`;
        }

        const noteBadge = document.getElementById('lightboxNotePreview');
        if (st.note && st.note.trim()) {
            noteBadge.classList.remove('hidden');
            noteBadge.innerHTML = `<i class="fa-regular fa-comment-dots mr-1.5 text-amber-400"></i>Ghi chú: "${st.note}"`;
        } else {
            noteBadge.classList.add('hidden');
        }
    }

    function nextLightboxPhoto() {
        if (!currentFilteredPhotos.length) return;
        currentLightboxIndex = (currentLightboxIndex + 1) % currentFilteredPhotos.length;
        updateLightboxContent();
    }

    function prevLightboxPhoto() {
        if (!currentFilteredPhotos.length) return;
        currentLightboxIndex = (currentLightboxIndex - 1 + currentFilteredPhotos.length) % currentFilteredPhotos.length;
        updateLightboxContent();
    }

    function toggleLightboxZoom() {
        const img = document.getElementById('lightboxImage');
        if (!img) return;
        isLightboxZoomed = !isLightboxZoomed;
        img.classList.toggle('lightbox-img-zoomed', isLightboxZoomed);
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
        const photo = currentFilteredPhotos[currentLightboxIndex];
        if (photo) downloadSinglePhoto(photo.id);
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (currentLightboxIndex < 0) return;
            const noteModal = document.getElementById('photoNoteModal');
            if (noteModal && !noteModal.classList.contains('hidden')) return;

            if (e.key === 'ArrowRight') nextLightboxPhoto();
            else if (e.key === 'ArrowLeft') prevLightboxPhoto();
            else if (e.key === 'Escape') closeLightbox();
        });
    }

    // Download Functions
    async function downloadSinglePhoto(photoId) {
        const album = AdminModule.getAlbumData();
        const photo = album.photos.find(p => p.id === photoId);
        if (!photo) return;

        showToast(`Đang chuẩn bị tải ảnh ${photo.code}...`);
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
        const album = AdminModule.getAlbumData();
        const selections = AdminModule.getSelections();
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
        const album = AdminModule.getAlbumData();
        const selections = AdminModule.getSelections();

        let targetPhotos = album.photos;
        if (scope === 'selected') {
            targetPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);
            if (!targetPhotos.length) {
                showToast("Bạn chưa thả tim chọn bức ảnh nào để tải!", "error");
                return;
            }
        }

        closeDownloadModal();
        showToast(`Đang bắt đầu tải ${targetPhotos.length} ảnh (${quality === 'original' ? 'Chất lượng Gốc 4K' : 'Bản nén Web'})...`);

        // Trigger download for first 3 photos to avoid browser popup blocker, or single photo
        const batch = targetPhotos.slice(0, 3);
        for (let i = 0; i < batch.length; i++) {
            await downloadSinglePhoto(batch[i].id);
        }
        if (targetPhotos.length > 3) {
            setTimeout(() => {
                showToast(`Đã tải mẫu ${batch.length}/${targetPhotos.length} ảnh (Trình duyệt giới hạn tải hàng loạt cùng lúc).`);
            }, 1500);
        }
    }

    // Submit Selection Modal (Client sends chosen photos to Photographer)
    function openSubmitSelectionModal() {
        const album = AdminModule.getAlbumData();
        const selections = AdminModule.getSelections();
        const selectedPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);

        const codesEl = document.getElementById('submitModalCodesPreview');
        const countEl = document.getElementById('submitModalCountBadge');
        const nameInput = document.getElementById('submitClientName');

        if (countEl) {
            countEl.innerText = `${selectedPhotos.length} / ${album.selectionLimit || '∞'} ảnh đã chọn`;
        }
        if (nameInput && !nameInput.value) {
            nameInput.value = album.clientName || '';
        }

        if (codesEl) {
            if (!selectedPhotos.length) {
                codesEl.innerHTML = `<p class="text-xs text-rose-600 py-2">Bạn chưa bấm biểu tượng Trái Tim (♥) trên bức ảnh nào. Hãy chọn các bức ảnh ưng ý trước khi gửi nhé!</p>`;
            } else {
                codesEl.innerHTML = selectedPhotos.map(p => {
                    const note = selections[p.id]?.note;
                    return `
                        <div class="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 text-xs">
                            <div class="flex items-center gap-2">
                                <img src="${p.url}" class="w-8 h-8 rounded object-cover">
                                <span class="font-mono font-bold text-slate-800">${p.code}</span>
                                <span class="text-slate-400">${p.category}</span>
                            </div>
                            <span class="text-amber-700 truncate max-w-[180px]">${note ? `✎ ${note}` : ''}</span>
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
        const album = AdminModule.getAlbumData();
        const selections = AdminModule.getSelections();
        const selectedPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);

        if (!selectedPhotos.length) {
            showToast("Vui lòng thả tim ít nhất 1 bức ảnh trước khi gửi!", "error");
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
        });

        closeSubmitSelectionModal();
        showToast(`Đã gửi danh sách ${selectedPhotos.length} ảnh cho ${album.photographer || 'Studio'} thành công!`);
    }

    function copyClientSelectionSummary() {
        const album = AdminModule.getAlbumData();
        const selections = AdminModule.getSelections();
        const selectedPhotos = album.photos.filter(p => selections[p.id] && selections[p.id].selected);

        if (!selectedPhotos.length) {
            showToast("Chưa có ảnh nào trong danh sách chọn!", "error");
            return;
        }

        const lines = [
            `ALBUM: ${album.title}`,
            `KHÁCH HÀNG: ${album.clientName}`,
            `DANH SÁCH MÃ ẢNH CHỌN (${selectedPhotos.length} ảnh):`,
            selectedPhotos.map(p => p.code).join(', '),
            `--- CHI TIẾT GHI CHÚ ---`,
            ...selectedPhotos.map(p => {
                const n = selections[p.id]?.note;
                return `- ${p.code}: ${n ? n : 'Chỉnh chuẩn màu Studio'}`;
            })
        ];

        navigator.clipboard.writeText(lines.join('\n')).then(() => {
            showToast("Đã sao chép danh sách ảnh & ghi chú (Bạn có thể dán gửi qua Zalo/Messenger)!");
        });
    }

    function scrollToGallery() {
        const el = document.getElementById('galleryToolbarAnchor');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
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
        renderPublicAlbum,
        handlePinUnlock,
        setCategoryFilter,
        handleSearchInput,
        setGridCols,
        toggleSelectPhoto,
        openPhotoNoteModal,
        closePhotoNoteModal,
        savePhotoNote,
        fillQuickNoteChip,
        openLightbox,
        closeLightbox,
        nextLightboxPhoto,
        prevLightboxPhoto,
        toggleLightboxZoom,
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
        scrollToGallery,
        scrollToVideoHighlight,
        showToast
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
