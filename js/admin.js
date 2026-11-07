/**
 * AdminModule - Quản lý dữ liệu Album, Ảnh, Presets và xuất mã Lightroom (Shotpik Style)
 */
const AdminModule = (function () {
    const STORAGE_KEY_ALBUM = "shotpik_studio_album_data_v1";
    const STORAGE_KEY_SELECTIONS = "shotpik_client_selections_v1";
    const STORAGE_KEY_SUBMISSIONS = "shotpik_client_submissions_v1";

    const PRESET_ALBUMS = [
        {
            id: "wedding-minhquan-lananh",
            title: "Wedding: Minh Quân & Lan Anh",
            clientName: "Minh Quân & Lan Anh",
            date: "07.11.2026",
            location: "Dalat Palace Heritage, Đà Lạt",
            photographer: "Đức Thuận Studio",
            selectionLimit: 10,
            pinCode: "",
            youtubeId: "dQw4w9WgXcQ",
            coverUrl: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1800&q=85",
            photos: [
                { id: "p1", code: "IMG_1001", category: "Pre-Wedding", title: "Nắng sớm bên hồ", url: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80" },
                { id: "p2", code: "IMG_1002", category: "Pre-Wedding", title: "Khoảnh khắc nắm tay", url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80" },
                { id: "p3", code: "IMG_1003", category: "Lễ Cưới", title: "Cô dâu chuẩn bị", url: "https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80" },
                { id: "p4", code: "IMG_1004", category: "Lễ Cưới", title: "Trao nhẫn cưới", url: "https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=1200&q=80" },
                { id: "p5", code: "IMG_1005", category: "Pre-Wedding", title: "Giữa rừng thông Đà Lạt", url: "https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80" },
                { id: "p6", code: "IMG_1006", category: "Lễ Cưới", title: "Hoa cưới tinh khôi", url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80" },
                { id: "p7", code: "IMG_1007", category: "Tiệc Tối", title: "Khiêu vũ đầu tiên", url: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=80" },
                { id: "p8", code: "IMG_1008", category: "Tiệc Tối", title: "Nâng ly chúc mừng", url: "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=1200&q=80" },
                { id: "p9", code: "IMG_1009", category: "Pre-Wedding", title: "Chiều hoàng hôn", url: "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1200&q=80" },
                { id: "p10", code: "IMG_1010", category: "Lễ Cưới", title: "Nụ cười hạnh phúc", url: "https://images.unsplash.com/photo-1591604466107-ec97de577aff?auto=format&fit=crop&w=1200&q=80" },
                { id: "p11", code: "IMG_1011", category: "Tiệc Tối", title: "Bàn tiệc lung linh", url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80" },
                { id: "p12", code: "IMG_1012", category: "Pre-Wedding", title: "Hẹn ước trăm năm", url: "https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1200&q=80" }
            ]
        },
        {
            id: "muse-dalat-portrait",
            title: "Muse Concept: Nàng Thơ Mùa Thu",
            clientName: "Khánh Linh",
            date: "02.11.2026",
            location: "Hồ Tuyền Lâm, Đà Lạt",
            photographer: "Đức Thuận Studio",
            selectionLimit: 8,
            pinCode: "",
            youtubeId: "jfKfPfyJRdk",
            coverUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1800&q=85",
            photos: [
                { id: "m1", code: "DSC_2001", category: "Chân Dung", title: "Ánh nhìn trong veo", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=80" },
                { id: "m2", code: "DSC_2002", category: "Ngoại Cảnh", title: "Nắng chiều dịu dàng", url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80" },
                { id: "m3", code: "DSC_2003", category: "Chân Dung", title: "Góc nghiêng thần thái", url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80" },
                { id: "m4", code: "DSC_2004", category: "Film Look", title: "Màu phim hoài niệm", url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80" },
                { id: "m5", code: "DSC_2005", category: "Ngoại Cảnh", title: "Dạo bước phố hoa", url: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1200&q=80" },
                { id: "m6", code: "DSC_2006", category: "Film Look", title: "Chiều thu lắng đọng", url: "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1200&q=80" },
                { id: "m7", code: "DSC_2007", category: "Chân Dung", title: "Nét đẹp tự nhiên", url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=1200&q=80" },
                { id: "m8", code: "DSC_2008", category: "Ngoại Cảnh", title: "Gió chiều thảo nguyên", url: "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=1200&q=80" }
            ]
        },
        {
            id: "couple-phuquoc-sunset",
            title: "Love Story: Hoàng Hôn Phú Quốc",
            clientName: "Hoàng Nam & Bảo Ngọc",
            date: "28.10.2026",
            location: "Sunset Sanato, Phú Quốc",
            photographer: "Đức Thuận Studio",
            selectionLimit: 12,
            pinCode: "",
            youtubeId: "L_LUpnjgPso",
            coverUrl: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1800&q=85",
            photos: [
                { id: "c1", code: "RAW_3011", category: "Biển Chiều", title: "Bước chân trên cát", url: "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=80" },
                { id: "c2", code: "RAW_3012", category: "Biển Chiều", title: "Hoàng hôn rực rỡ", url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80" },
                { id: "c3", code: "RAW_3013", category: "Candid", title: "Tiếng cười bên sóng", url: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=1200&q=80" },
                { id: "c4", code: "RAW_3014", category: "Candid", title: "Ôm trọn hoàng hôn", url: "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=1200&q=80" },
                { id: "c5", code: "RAW_3015", category: "Biển Chiều", title: "Gió biển chiều tà", url: "https://images.unsplash.com/photo-1474552226712-ac0f0961a954?auto=format&fit=crop&w=1200&q=80" },
                { id: "c6", code: "RAW_3016", category: "Candid", title: "Ánh mắt trao nhau", url: "https://images.unsplash.com/photo-1545232972-90466c963042?auto=format&fit=crop&w=1200&q=80" }
            ]
        }
    ];

    function getAlbumData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ALBUM);
            if (raw) {
                return JSON.parse(raw);
            }
        } catch (e) {
            console.error("Failed to parse album data:", e);
        }
        const defaultAlbum = JSON.parse(JSON.stringify(PRESET_ALBUMS[0]));
        saveAlbumData(defaultAlbum);
        return defaultAlbum;
    }

    function saveAlbumData(album) {
        localStorage.setItem(STORAGE_KEY_ALBUM, JSON.stringify(album));
    }

    function getSelections() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_SELECTIONS);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.error(e);
        }
        return {}; // { [photoId]: { selected: true/false, note: "" } }
    }

    function saveSelections(selections) {
        localStorage.setItem(STORAGE_KEY_SELECTIONS, JSON.stringify(selections));
    }

    function getSubmissions() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_SUBMISSIONS);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.error(e);
        }
        return [];
    }

    function addSubmission(sub) {
        const list = getSubmissions();
        list.unshift(sub);
        localStorage.setItem(STORAGE_KEY_SUBMISSIONS, JSON.stringify(list));
    }

    function extractYouTubeID(url) {
        if (!url) return "";
        url = url.trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : "";
    }

    // Populate Admin Form when entering Admin View
    function populateAdminDashboard() {
        const album = getAlbumData();

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val !== undefined && val !== null ? val : "";
        };

        setVal('adminAlbumTitle', album.title);
        setVal('adminClientName', album.clientName);
        setVal('adminShootDate', album.date);
        setVal('adminLocation', album.location);
        setVal('adminCoverUrl', album.coverUrl);
        setVal('adminSelectionLimit', album.selectionLimit || 10);
        setVal('adminPinCode', album.pinCode || "");
        setVal('adminYoutubeUrl', album.youtubeId ? `https://www.youtube.com/watch?v=${album.youtubeId}` : "");

        renderPresetAlbumsList();
        renderAdminPhotosList();
        renderAdminClientSelections();
    }

    function saveAlbumSettings(event) {
        if (event) event.preventDefault();
        const album = getAlbumData();

        album.title = document.getElementById('adminAlbumTitle').value.trim() || "Album Khách Hàng";
        album.clientName = document.getElementById('adminClientName').value.trim() || "Khách Hàng";
        album.date = document.getElementById('adminShootDate').value.trim() || "2026";
        album.location = document.getElementById('adminLocation').value.trim() || "Việt Nam";
        album.coverUrl = document.getElementById('adminCoverUrl').value.trim() || album.coverUrl;
        album.selectionLimit = parseInt(document.getElementById('adminSelectionLimit').value, 10) || 0;
        album.pinCode = document.getElementById('adminPinCode').value.trim();

        const ytInput = document.getElementById('adminYoutubeUrl').value.trim();
        album.youtubeId = ytInput ? (extractYouTubeID(ytInput) || album.youtubeId) : "";

        saveAlbumData(album);
        App.renderPublicAlbum();
        App.showToast("Đã lưu thông tin cài đặt Album thành công!");
    }

    function addPhotoByUrl(event) {
        if (event) event.preventDefault();
        const urlInput = document.getElementById('newPhotoUrl');
        const codeInput = document.getElementById('newPhotoCode');
        const catInput = document.getElementById('newPhotoCategory');
        const titleInput = document.getElementById('newPhotoTitle');

        const url = urlInput.value.trim();
        if (!url) {
            App.showToast("Vui lòng nhập đường dẫn URL ảnh!", "error");
            return;
        }

        const album = getAlbumData();
        const nextNum = 1001 + album.photos.length;
        const code = codeInput.value.trim() || `IMG_${nextNum}`;
        const category = catInput.value.trim() || "Ngoại Cảnh";
        const title = titleInput.value.trim() || `Ảnh ${code}`;

        album.photos.unshift({
            id: "photo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            code,
            category,
            title,
            url
        });

        saveAlbumData(album);
        urlInput.value = "";
        codeInput.value = "";
        titleInput.value = "";

        renderAdminPhotosList();
        App.renderPublicAlbum();
        App.showToast(`Đã thêm ảnh ${code} vào Album!`);
    }

    function handleLocalFilesUpload(event) {
        const files = event.target.files;
        if (!files || !files.length) return;

        const catInput = document.getElementById('newPhotoCategory');
        const category = (catInput && catInput.value.trim()) ? catInput.value.trim() : "Ảnh Mới Tải Lên";
        const album = getAlbumData();

        let processed = 0;
        Array.from(files).forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const cleanName = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
                const code = cleanName.length <= 14 ? cleanName : `IMG_${1001 + album.photos.length + idx}`;
                album.photos.unshift({
                    id: "local_" + Date.now() + "_" + idx,
                    code: code,
                    category: category,
                    title: file.name,
                    url: e.target.result
                });
                processed++;
                if (processed === files.length) {
                    saveAlbumData(album);
                    renderAdminPhotosList();
                    App.renderPublicAlbum();
                    App.showToast(`Đã tải lên ${files.length} ảnh vào Album!`);
                    event.target.value = "";
                }
            };
            reader.readAsDataURL(file);
        });
    }

    function deletePhoto(photoId) {
        const album = getAlbumData();
        album.photos = album.photos.filter(p => p.id !== photoId);
        saveAlbumData(album);
        renderAdminPhotosList();
        App.renderPublicAlbum();
        App.showToast("Đã xoá ảnh khỏi Album.");
    }

    function setPhotoAsCover(url) {
        const album = getAlbumData();
        album.coverUrl = url;
        saveAlbumData(album);
        const coverInput = document.getElementById('adminCoverUrl');
        if (coverInput) coverInput.value = url;
        App.renderPublicAlbum();
        App.showToast("Đã đặt ảnh này làm Ảnh bìa Album!");
    }

    function loadPresetAlbum(presetId) {
        const preset = PRESET_ALBUMS.find(p => p.id === presetId);
        if (!preset) return;
        const cloned = JSON.parse(JSON.stringify(preset));
        saveAlbumData(cloned);
        saveSelections({});
        populateAdminDashboard();
        App.renderPublicAlbum();
        App.showToast(`Đã nạp bộ Album mẫu: ${cloned.title}`);
    }

    function renderPresetAlbumsList() {
        const container = document.getElementById('presetAlbumsList');
        if (!container) return;
        const currentAlbum = getAlbumData();
        container.innerHTML = '';

        PRESET_ALBUMS.forEach(item => {
            const isCurrent = currentAlbum.id === item.id;
            const div = document.createElement('div');
            div.className = `flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer ${
                isCurrent ? 'border-rose-500 bg-rose-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'
            }`;
            div.onclick = () => loadPresetAlbum(item.id);
            div.innerHTML = `
                <div class="flex items-center space-x-3.5">
                    <img src="${item.coverUrl}" alt="${item.title}" class="w-14 h-14 rounded-lg object-cover border border-slate-200">
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="text-sm font-bold text-slate-900">${item.title}</h4>
                            ${isCurrent ? '<span class="text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-semibold">Đang dùng</span>' : ''}
                        </div>
                        <p class="text-xs text-slate-500 mt-0.5"><i class="fa-regular fa-images mr-1"></i>${item.photos.length} ảnh • Khách: ${item.clientName}</p>
                    </div>
                </div>
                <button type="button" class="text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg font-medium transition shrink-0">
                    Nạp mẫu
                </button>
            `;
            container.appendChild(div);
        });
    }

    function renderAdminPhotosList() {
        const container = document.getElementById('adminPhotosGrid');
        const countBadge = document.getElementById('adminPhotoCountBadge');
        if (!container) return;

        const album = getAlbumData();
        if (countBadge) countBadge.innerText = `${album.photos.length} ảnh`;

        container.innerHTML = '';
        album.photos.forEach(photo => {
            const card = document.createElement('div');
            card.className = "group relative bg-slate-100 rounded-xl overflow-hidden border border-slate-200 aspect-square";
            card.innerHTML = `
                <img src="${photo.url}" alt="${photo.code}" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition flex flex-col justify-between p-2.5">
                    <div class="flex justify-between items-start">
                        <span class="text-[11px] bg-black/70 text-white px-2 py-0.5 rounded font-mono">${photo.code}</span>
                        <div class="flex gap-1">
                            <button type="button" onclick="AdminModule.setPhotoAsCover('${photo.url}')" title="Đặt làm ảnh bìa" class="w-7 h-7 rounded-lg bg-white/90 hover:bg-amber-500 hover:text-white text-slate-800 text-xs flex items-center justify-center transition">
                                <i class="fa-solid fa-star"></i>
                            </button>
                            <button type="button" onclick="AdminModule.deletePhoto('${photo.id}')" title="Xoá ảnh" class="w-7 h-7 rounded-lg bg-white/90 hover:bg-red-600 hover:text-white text-red-600 text-xs flex items-center justify-center transition">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                    <div>
                        <span class="text-[10px] text-amber-300 font-medium block">${photo.category}</span>
                        <p class="text-xs text-white font-medium truncate">${photo.title || photo.code}</p>
                    </div>
                </div>
                <div class="
                    group-hover:hidden absolute bottom-1.5 left-1.5 bg-black/65 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded font-mono
                ">${photo.code}</div>
            `;
            container.appendChild(card);
        });
    }

    function renderAdminClientSelections() {
        const album = getAlbumData();
        const selections = getSelections();
        const submissions = getSubmissions();

        const selectedPhotos = album.photos.filter(p => selections[p.id] && (selections[p.id].selected || (selections[p.id].note && selections[p.id].note.trim())));
        const codesList = album.photos.filter(p => selections[p.id] && selections[p.id].selected).map(p => p.code);

        const lightroomBox = document.getElementById('lightroomCodesOutput');
        if (lightroomBox) {
            lightroomBox.value = codesList.length ? codesList.join(', ') : '';
        }

        const countEl = document.getElementById('adminSelectedCountLabel');
        if (countEl) {
            countEl.innerText = `${codesList.length} / ${album.selectionLimit || '∞'} ảnh đã thả tim`;
        }

        const listContainer = document.getElementById('adminClientSelectedList');
        if (listContainer) {
            if (!selectedPhotos.length) {
                listContainer.innerHTML = `
                    <div class="text-center py-8 text-slate-400 text-sm">
                        <i class="fa-regular fa-heart text-2xl mb-2 block"></i>
                        Khách hàng chưa chọn hoặc ghi chú bức ảnh nào.
                    </div>
                `;
            } else {
                listContainer.innerHTML = selectedPhotos.map(p => {
                    const st = selections[p.id] || {};
                    return `
                        <div class="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                            <img src="${p.url}" alt="${p.code}" class="w-16 h-16 rounded-lg object-cover shrink-0">
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="font-mono font-bold text-xs text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">${p.code}</span>
                                    <span class="text-xs text-slate-500">${p.category}</span>
                                    ${st.selected ? '<span class="text-[11px] text-rose-600 font-semibold"><i class="fa-solid fa-heart mr-1"></i>Chọn in/retouch</span>' : ''}
                                </div>
                                <p class="text-xs text-slate-600 mt-1.5">
                                    ${st.note ? `<span class="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md block"><i class="fa-regular fa-comment-dots mr-1"></i><strong>Ghi chú của khách:</strong> ${st.note}</span>` : '<span class="text-slate-400 italic">Không có ghi chú chỉnh sửa riêng</span>'}
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
                subContainer.innerHTML = `<p class="text-xs text-slate-400 italic">Chưa có lượt gửi xác nhận chính thức nào từ khách hàng.</p>`;
            } else {
                subContainer.innerHTML = submissions.map(sub => `
                    <div class="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs space-y-1.5">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-emerald-950"><i class="fa-solid fa-circle-check text-emerald-600 mr-1.5"></i>${sub.clientName} (${sub.clientPhone})</span>
                            <span class="text-slate-400 text-[11px]">${sub.submittedAt}</span>
                        </div>
                        <p class="text-slate-700"><strong>Mã ảnh đã gửi (${sub.codes.length} ảnh):</strong> <span class="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200">${sub.codes.join(', ')}</span></p>
                        ${sub.generalNote ? `<p class="text-slate-600"><strong>Lời nhắn:</strong> ${sub.generalNote}</p>` : ''}
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
        }).catch(() => {
            box.select();
            document.execCommand('copy');
            App.showToast("Đã sao chép danh sách mã file chuẩn Lightroom!");
        });
    }

    function clearClientSelections() {
        saveSelections({});
        localStorage.removeItem(STORAGE_KEY_SUBMISSIONS);
        renderAdminClientSelections();
        App.renderPublicAlbum();
        App.showToast("Đã đặt lại danh sách chọn ảnh của khách.");
    }

    function shareCurrentAlbum() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            App.showToast("Đã sao chép đường dẫn Album gửi cho khách hàng!");
        }).catch(() => {
            App.showToast("Đã sao chép đường dẫn Album!");
        });
    }

    return {
        STORAGE_KEY_ALBUM,
        STORAGE_KEY_SELECTIONS,
        getAlbumData,
        saveAlbumData,
        getSelections,
        saveSelections,
        addSubmission,
        populateAdminDashboard,
        saveAlbumSettings,
        addPhotoByUrl,
        handleLocalFilesUpload,
        deletePhoto,
        setPhotoAsCover,
        loadPresetAlbum,
        renderAdminClientSelections,
        copyLightroomCodes,
        clearClientSelections,
        shareCurrentAlbum
    };
})();
