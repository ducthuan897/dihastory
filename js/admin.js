/**
 * AdminModule - Xử lý thông tin và cập nhật video YouTube
 */
const AdminModule = (function () {
    const STORAGE_KEY_VIDEO = "site_active_youtube_id";
    let selectedPreviewId = "dQw4w9WgXcQ";

    const PRESET_VIDEOS = [
        { id: "dQw4w9WgXcQ", title: "Rick Astley - Never Gonna Give You Up" },
        { id: "L_LUpnjgPso", title: "Official Trailer - Studio Ghibli Special" },
        { id: "jfKfPfyJRdk", title: "Lofi Hip Hop Radio - Beats to Relax/Study" },
        { id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody - Queen" }
    ];

    function extractYouTubeID(url) {
        if (!url) return null;
        url = url.trim();

        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    function setMainVideoPlayer(videoId) {
        const player = document.getElementById('mainVideoPlayer');
        if (player) {
            player.src = `https://www.youtube.com/embed/${videoId}?autoplay=0`;
            localStorage.setItem(STORAGE_KEY_VIDEO, videoId);
        }
    }

    function updateAdminPreview(videoId) {
        selectedPreviewId = videoId;
        const previewPlayer = document.getElementById('adminPreviewPlayer');
        const previewLabel = document.getElementById('previewIdLabel');

        if (previewPlayer) previewPlayer.src = `https://www.youtube.com/embed/${videoId}`;
        if (previewLabel) previewLabel.innerText = `ID: ${videoId}`;
    }

    function handleUrlInputChange() {
        const val = document.getElementById('youtubeUrlInput').value;
        const err = document.getElementById('urlErrorMsg');
        const extractedId = extractYouTubeID(val);

        if (val && !extractedId) {
            err.classList.remove('hidden');
        } else {
            err.classList.add('hidden');
            if (extractedId) {
                updateAdminPreview(extractedId);
            }
        }
    }

    function applyVideoFromInput() {
        const val = document.getElementById('youtubeUrlInput').value;
        const videoId = extractYouTubeID(val) || selectedPreviewId;

        if (!videoId) {
            App.showToast('URL hoặc ID video không hợp lệ!', 'error');
            return;
        }

        setMainVideoPlayer(videoId);
        App.showToast('Đã cập nhật video mới thành công!');
    }

    function renderPresets() {
        const container = document.getElementById('presetList');
        if (!container) return;
        container.innerHTML = '';

        PRESET_VIDEOS.forEach(item => {
            const card = document.createElement('div');
            card.className = "flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 transition cursor-pointer group";
            card.onclick = () => selectPreset(item.id);

            card.innerHTML = `
                <div class="flex items-center space-x-3">
                    <div class="w-10 h-10 bg-slate-900 text-red-500 rounded-lg flex items-center justify-center font-bold">
                        <i class="fa-brands fa-youtube"></i>
                    </div>
                    <div>
                        <h4 class="text-sm font-semibold text-slate-800">${item.title}</h4>
                        <span class="text-xs text-slate-400 font-mono">ID: ${item.id}</span>
                    </div>
                </div>
                <button class="text-xs bg-slate-100 group-hover:bg-brand-600 group-hover:text-white text-slate-600 px-3 py-1.5 rounded-lg font-medium transition">
                    Chọn
                </button>
            `;
            container.appendChild(card);
        });
    }

    function selectPreset(videoId) {
        document.getElementById('youtubeUrlInput').value = `https://www.youtube.com/watch?v=${videoId}`;
        document.getElementById('urlErrorMsg').classList.add('hidden');
        updateAdminPreview(videoId);
        App.showToast('Đã chọn video từ danh sách mẫu!');
    }

    function shareCurrentVideo() {
        const activeId = localStorage.getItem(STORAGE_KEY_VIDEO) || "dQw4w9WgXcQ";
        const url = `https://www.youtube.com/watch?v=${activeId}`;

        const dummy = document.createElement('input');
        document.body.appendChild(dummy);
        dummy.value = url;
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);

        App.showToast('Đã sao chép đường dẫn Video!');
    }

    return {
        STORAGE_KEY_VIDEO,
        setMainVideoPlayer,
        updateAdminPreview,
        handleUrlInputChange,
        applyVideoFromInput,
        renderPresets,
        shareCurrentVideo
    };
})();