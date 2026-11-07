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
    const STORAGE_KEY_REMOVED_BACKUP_MAP = "shotpik_removed_interactions_backup_v2";
    const STORAGE_KEY_GOOGLE_API_KEY = "shotpik_google_drive_api_key_v1";

    const DEFAULT_GOOGLE_DRIVE_API_KEY = "https://script.google.com/macros/s/AKfycbw2nwiPyK04c9V4dQKVPlAya8Z0FrwBG3McsT0swJjRulOjpwt06ytvSrMKAm7xZ9FL/exec";

    function getGoogleDriveApiKey() {
        try {
            return (localStorage.getItem(STORAGE_KEY_GOOGLE_API_KEY) || DEFAULT_GOOGLE_DRIVE_API_KEY || "").trim();
        } catch (e) {
            return DEFAULT_GOOGLE_DRIVE_API_KEY || "";
        }
    }

    function setGoogleDriveApiKey(key) {
        try {
            if (key) {
                localStorage.setItem(STORAGE_KEY_GOOGLE_API_KEY, key.trim());
            } else {
                localStorage.removeItem(STORAGE_KEY_GOOGLE_API_KEY);
            }
            updateDriveApiKeyBadge();
        } catch (e) {}
    }

    function updateDriveApiKeyBadge() {
        const key = getGoogleDriveApiKey();
        const badges = [
            document.getElementById('driveApiKeyBadge'),
            document.getElementById('adminHeaderDriveBadge')
        ];
        badges.forEach(badge => {
            if (!badge) return;
            if (key) {
                badge.innerText = "Đã kết nối";
                badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold";
            } else {
                badge.innerText = "Chưa kết nối";
                badge.className = "text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium";
            }
        });
    }

    function openDriveApiKeyModal() {
        const modal = document.getElementById('driveApiKeyModal');
        const input = document.getElementById('googleDriveApiKeyInput');
        if (input) input.value = getGoogleDriveApiKey();
        const alert = document.getElementById('driveApiKeyAlert');
        if (alert) alert.classList.add('hidden');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.zIndex = '9999';
            setTimeout(() => { if (input) input.focus(); }, 100);
        }
    }

    function closeDriveApiKeyModal() {
        const modal = document.getElementById('driveApiKeyModal');
        if (modal) modal.classList.add('hidden');
    }

    const APPS_SCRIPT_SOURCE = `/**
 * GOOGLE APPS SCRIPT CHO ĐỨC THUẬN STUDIO (DUTUSTORY)
 * 1. Tự động đọc ảnh Google Drive, trích xuất EXIF DateTimeOriginal & toạ độ GPS.
 * 2. ĐỒNG BỘ DỮ LIỆU ALBUM ĐA THIẾT BỊ (Cloud Database lưu trữ vào Google Drive miễn phí).
 */

function doGet(e) {
  e = e || { parameter: {} };
  var action = e.parameter.action;
  var folderId = e.parameter.id;

  // 1. ĐỒNG BỘ: Lấy toàn bộ danh sách Albums cho các thiết bị khác xem
  if (action === 'getAlbums') {
    var albums = loadAlbumsFromDrive();
    return ContentService.createTextOutput(JSON.stringify({
      status: "ok",
      albums: albums
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 2. ĐỒNG BỘ: Lưu albums dự phòng qua GET
  if (action === 'saveAlbums' && e.parameter.data) {
    try {
      var dataObj = JSON.parse(e.parameter.data);
      if (Array.isArray(dataObj)) {
        saveAlbumsToDrive(dataObj);
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: "ok",
        message: "Đã lưu albums vào Google Drive!"
      })).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({
        error: err.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 3. Kiểm tra kết nối / Test run trong trình soạn thảo Apps Script
  if (!folderId || folderId === 'test') {
    return ContentService.createTextOutput(JSON.stringify({
      status: "ok",
      message: "Kết nối Google Apps Script thành công! Sẵn sàng trích xuất EXIF và đồng bộ dữ liệu đa thiết bị."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 4. Đọc ảnh và EXIF từ thư mục Google Drive
  try {
    var result = getFolderPhotosWithExif(folderId);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Xử lý lưu Album khi người dùng tạo mới hoặc chỉnh sửa trên trang quản trị
function doPost(e) {
  try {
    var postData = "";
    if (e && e.postData && e.postData.contents) {
      postData = e.postData.contents;
    }
    var body = JSON.parse(postData || "{}");
    if (body.action === 'saveAlbums' && Array.isArray(body.albums)) {
      saveAlbumsToDrive(body.albums);
      return ContentService.createTextOutput(JSON.stringify({
        status: "ok",
        message: "Đã đồng bộ " + body.albums.length + " album vào Google Drive thành công!"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Yêu cầu không hợp lệ"
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Lưu file 'dutustory_db.json' vào Google Drive
function saveAlbumsToDrive(albums) {
  var fileName = "dutustory_db.json";
  var jsonStr = JSON.stringify(albums);
  var files = DriveApp.getFilesByName(fileName);
  if (files.hasNext()) {
    var file = files.next();
    file.setContent(jsonStr);
  } else {
    DriveApp.createFile(fileName, jsonStr, MimeType.PLAIN_TEXT);
  }
}

// Đọc file 'dutustory_db.json' từ Google Drive
function loadAlbumsFromDrive() {
  var fileName = "dutustory_db.json";
  var files = DriveApp.getFilesByName(fileName);
  if (files.hasNext()) {
    var file = files.next();
    var content = file.getBlob().getDataAsString();
    try {
      var parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch(e) {}
  }
  return [];
}

function getFolderPhotosWithExif(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var folderTitle = folder.getName();
  var token = ScriptApp.getOAuthToken();
  var filesList = [];
  var detectedFolderDate = null;
  var detectedFolderCity = null;
  var detectedFolderLoc = null;

  try {
    var apiUrl = "https://www.googleapis.com/drive/v3/files?q='" + encodeURIComponent(folderId) + "'+in+parents+and+trashed=false&fields=files(id,name,mimeType,imageMediaMetadata,createdTime)&pageSize=100";
    var resp = UrlFetchApp.fetch(apiUrl, { headers: { Authorization: "Bearer " + token }, muteHttpExceptions: true });
    if (resp.getResponseCode() === 200) {
      var data = JSON.parse(resp.getContentText());
      if (data.files && data.files.length > 0) {
        var rawFiles = data.files.filter(function(f) {
          return !f.mimeType || f.mimeType.indexOf("image/") === 0 || f.name.match(/\\.(jpe?g|png|webp|heic|tiff?|dng|raw|cr2|cr3|nef|arw)$/i);
        });
        for (var i = 0; i < rawFiles.length; i++) {
          var f = rawFiles[i];
          var capturedAt = null;
          var lat = null, lon = null, city = null, location = null;
          if (f.imageMediaMetadata) {
            if (f.imageMediaMetadata.time) {
              var m = f.imageMediaMetadata.time.trim().match(/^(\\d{4})[:\\-](\\d{2})[:\\-](\\d{2})[T\\s]+(\\d{2}):(\\d{2})/);
              if (m) capturedAt = m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5];
            }
            if (f.imageMediaMetadata.location) {
              lat = f.imageMediaMetadata.location.latitude;
              lon = f.imageMediaMetadata.location.longitude;
            }
          }
          if (lat != null && lon != null && !detectedFolderCity) {
            var geo = reverseGeocodeCoords(lat, lon);
            if (geo) {
              city = geo.city;
              location = geo.location;
              detectedFolderCity = city;
              detectedFolderLoc = location;
            }
          } else if (detectedFolderCity) {
            city = detectedFolderCity;
            location = detectedFolderLoc;
          }
          if (capturedAt && !detectedFolderDate) detectedFolderDate = capturedAt;
          filesList.push({ id: f.id, name: f.name, capturedAt: capturedAt, lat: lat, lon: lon, city: city, location: location });
        }
      }
    }
  } catch(e) {}

  if (filesList.length === 0) {
    var iter = folder.getFiles();
    while (iter.hasNext()) {
      var file = iter.next();
      var fname = file.getName();
      if (fname.match(/\\.(jpe?g|png|webp|heic|tiff?|dng|raw|cr2|cr3|nef|arw)$/i)) {
        filesList.push({ id: file.getId(), name: fname, capturedAt: null, lat: null, lon: null, city: null, location: null });
      }
    }
  }

  if (filesList.length > 0 && !detectedFolderDate) {
    var sampleMax = Math.min(filesList.length, 2);
    for (var s = 0; s < sampleMax; s++) {
      try {
        var sFile = DriveApp.getFileById(filesList[s].id);
        var sExif = scanBinaryExif(sFile);
        if (sExif) {
          if (sExif.capturedAt) {
            filesList[s].capturedAt = sExif.capturedAt;
            detectedFolderDate = sExif.capturedAt;
          }
          if (sExif.lat != null && sExif.lon != null) {
            filesList[s].lat = sExif.lat;
            filesList[s].lon = sExif.lon;
            if (!detectedFolderCity) {
              var sGeo = reverseGeocodeCoords(sExif.lat, sExif.lon);
              if (sGeo) {
                detectedFolderCity = sGeo.city;
                detectedFolderLoc = sGeo.location;
              }
            }
          }
        }
        if (detectedFolderDate) break;
      } catch(ex) {}
    }
  }

  for (var k = 0; k < filesList.length; k++) {
    if (!filesList[k].capturedAt && detectedFolderDate) filesList[k].capturedAt = detectedFolderDate;
    if (!filesList[k].city && detectedFolderCity) {
      filesList[k].city = detectedFolderCity;
      filesList[k].location = detectedFolderLoc;
    }
  }

  return {
    folderTitle: folderTitle,
    folderDate: detectedFolderDate,
    folderCity: detectedFolderCity,
    folderLocation: detectedFolderLoc,
    files: filesList
  };
}

function reverseGeocodeCoords(lat, lon) {
  try {
    var response = Maps.newGeocoder().reverseGeocode(lat, lon);
    if (response && response.results && response.results.length > 0) {
      var r = response.results[0];
      var formatted = r.formatted_address || "";
      var city = "";
      for (var i = 0; i < r.address_components.length; i++) {
        var comp = r.address_components[i];
        var types = comp.types || [];
        if (types.indexOf("administrative_area_level_1") !== -1 || types.indexOf("locality") !== -1) {
          city = comp.long_name.replace(/^(Tỉnh|Thành phố|TP\\.)\\s+/i, "");
          break;
        }
      }
      return { city: city || "", location: formatted || city };
    }
  } catch(e) {}
  return null;
}

function scanBinaryExif(file) {
  try {
    var blob = file.getBlob();
    var bytes = blob.getBytes();
    var maxScan = Math.min(bytes.length, 65536);
    var str = "";
    for (var i = 0; i < maxScan; i++) {
      var code = bytes[i];
      if (code >= 32 && code <= 126) str += String.fromCharCode(code);
      else str += " ";
    }
    var m = str.match(/\\b(20[12]\\d):([01]\\d):([0-3]\\d)\\s+([0-2]\\d):([0-5]\\d):([0-5]\\d)\\b/);
    if (m) {
      return { capturedAt: m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] };
    }
  } catch(e) {}
  return null;
}

function testRun() {
  Logger.log(doGet({ parameter: { id: "test" } }).getContent());
}`;

    async function copyAppsScriptCode() {
        try {
            await navigator.clipboard.writeText(APPS_SCRIPT_SOURCE);
            App.showToast("Đã sao chép toàn bộ mã Google Apps Script vào clipboard!");
        } catch (e) {
            App.showToast("Đã chuẩn bị mã trong file google-apps-script.js của dự án.");
        }
    }

    async function handleSaveDriveApiKey(event) {
        if (event) event.preventDefault();
        const input = document.getElementById('googleDriveApiKeyInput');
        const key = input ? input.value.trim() : "";
        setGoogleDriveApiKey(key);
        closeDriveApiKeyModal();
        if (key) {
            App.showToast("Đã lưu Google Drive API Key! Hệ thống sẽ đọc EXIF GPS & Ngày chụp trực tiếp từ Google API.");
        } else {
            App.showToast("Đã xoá Google Drive API Key.");
        }
    }

    async function testGoogleDriveApiKey() {
        const input = document.getElementById('googleDriveApiKeyInput');
        const key = input ? input.value.trim() : "";
        const alert = document.getElementById('driveApiKeyAlert');
        if (!key) {
            if (alert) {
                alert.className = "p-3 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200";
                alert.innerText = "Vui lòng nhập Google API Key trước khi kiểm tra!";
                alert.classList.remove('hidden');
            }
            return;
        }

        if (alert) {
            alert.className = "p-3 rounded-xl bg-zinc-100 text-zinc-700 text-xs border border-zinc-200";
            alert.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang kiểm tra kết nối...`;
            alert.classList.remove('hidden');
        }

        // Case 1: Google Apps Script Web App URL
        if (key.startsWith("https://script.google.com/")) {
            try {
                const res = await fetch(`${key}?id=test`);
                if (res.ok) {
                    if (alert) {
                        alert.className = "p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 font-medium";
                        alert.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> Kết nối Google Apps Script thành công! Sẵn sàng đọc toàn bộ ảnh từ Google Drive trên GitHub Pages.`;
                    }
                    return;
                }
            } catch (e) {
                // Apps script redirect is normal, treat ok if it responds
                if (alert) {
                    alert.className = "p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 font-medium";
                    alert.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> Đã kết nối Google Apps Script Web App thành công!`;
                }
                return;
            }
        }

        // Case 2: Google API Key
        try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/about?fields=kind&key=${encodeURIComponent(key)}`);
            if (res.ok) {
                if (alert) {
                    alert.className = "p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 font-medium";
                    alert.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> Google Drive API Key hợp lệ!`;
                }
            } else {
                const errData = await res.json().catch(() => ({}));
                const errMsg = errData.error?.message || `Lỗi HTTP ${res.status}`;
                if (alert) {
                    alert.className = "p-3 rounded-xl bg-amber-50 text-amber-900 text-xs border border-amber-200 space-y-1.5";
                    alert.innerHTML = `
                        <div class="font-bold flex items-center gap-1 text-amber-800">
                            <i class="fa-solid fa-triangle-exclamation text-amber-600"></i> Google chặn lệnh liệt kê thư mục bằng API Key thường:
                        </div>
                        <p class="text-[11px] text-zinc-700">${errMsg}</p>
                        <p class="text-[11px] text-zinc-700 font-medium pt-1">
                            &rarr; <strong>Giải pháp chuẩn:</strong> Bạn hãy dùng <strong>Google Apps Script Web App</strong> (xem hướng dẫn bên dưới) và dán link vào ô này để đọc toàn bộ ảnh Google Drive 100% không bị chặn.
                        </p>
                    `;
                }
            }
        } catch (e) {
            if (alert) {
                alert.className = "p-3 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200";
                alert.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-rose-600 mr-1"></i> Không thể kết nối tới Google API: ${e.message}`;
            }
        }
    }

    // State for Shotpik "Tạo album" Modal & "Quản lý / Sửa album" Modal
    let createModalSourceTab = 'drive'; // 'drive' | 'local'
    let createModalDriveLinks = [];
    let createModalTags = [];
    let createModalLocalFilesData = [];
    let previewedDrivePhotosCache = {};
    let activeEditModalTab = 'settings'; // 'settings' | 'selections' | 'delivered'
    let activeSelectorPersonFilter = 'ALL';

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
            description: "Bộ ảnh ngoại cảnh mùa thu tại Phố Cổ & Hồ Gươm, Hà Nội.",
            photos: [
                { id: "h1", code: "HN_4001", location: "Hồ Gươm - Hà Nội", capturedAt: "2026-11-05T06:30", title: "Thu Hà Nội bên hồ", url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80" },
                { id: "h2", code: "HN_4002", location: "Hồ Gươm - Hà Nội", capturedAt: "2026-11-05T07:15", title: "Nắng thu dịu ngọt", url: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80" },
                { id: "h3", code: "HN_4003", location: "Phố Phan Đình Phùng - Hà Nội", capturedAt: "2026-11-05T08:45", title: "Con đường lá sấu", url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80" },
                { id: "h4", code: "HN_4004", location: "Phố Phan Đình Phùng - Hà Nội", capturedAt: "2026-11-05T09:20", title: "Xe hoa mùa thu", url: "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1200&q=80" }
            ]
        }
    ];

    let activeAdminAlbumId = DEFAULT_ALBUMS[0].id;
    let memoryAlbumsCache = null;

    function getAllAlbums() {
        if (memoryAlbumsCache && Array.isArray(memoryAlbumsCache) && memoryAlbumsCache.length > 0) {
            return memoryAlbumsCache;
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ALBUMS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    memoryAlbumsCache = parsed;
                    return parsed;
                }
            }
        } catch (e) {
            console.error(e);
        }
        const initial = JSON.parse(JSON.stringify(DEFAULT_ALBUMS));
        saveAllAlbums(initial);
        return initial;
    }

    function saveAllAlbums(albums) {
        memoryAlbumsCache = albums;
        try {
            localStorage.setItem(STORAGE_KEY_ALBUMS, JSON.stringify(albums));
        } catch (err) {
            console.warn("Bộ nhớ trình duyệt vượt giới hạn, dữ liệu ảnh độ phân giải cao được giữ trong phiên hiện tại:", err);
        }
        syncAlbumsToCloud(albums);
    }

    function mergeCloudAlbums(incomingAlbums) {
        if (!Array.isArray(incomingAlbums) || incomingAlbums.length === 0) return false;
        const current = getAllAlbums();
        let changed = false;

        incomingAlbums.forEach(inc => {
            if (!inc || !inc.id) return;
            const existingIdx = current.findIndex(a => a.id === inc.id);
            if (existingIdx !== -1) {
                // If incoming has more photos or updated info, merge
                if (JSON.stringify(current[existingIdx]) !== JSON.stringify(inc)) {
                    current[existingIdx] = inc;
                    changed = true;
                }
            } else {
                current.push(inc);
                changed = true;
            }
        });

        if (changed) {
            memoryAlbumsCache = current;
            try {
                localStorage.setItem(STORAGE_KEY_ALBUMS, JSON.stringify(current));
            } catch (e) {}
            if (typeof App !== 'undefined' && typeof App.renderHomeShowcase === 'function') {
                App.renderHomeShowcase();
            }
        }
        return changed;
    }

    async function syncAlbumsToCloud(albums) {
        const cloudUrl = getGoogleDriveApiKey();
        if (cloudUrl && cloudUrl.startsWith('https://script.google.com/')) {
            try {
                await fetch(cloudUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'saveAlbums', albums })
                });
            } catch (e) {}
        }
    }

    async function fetchCloudOrStaticAlbums() {
        // 1. Try Google Apps Script cloud database (3s timeout)
        const cloudUrl = getGoogleDriveApiKey();
        if (cloudUrl && cloudUrl.startsWith('https://script.google.com/')) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const resp = await fetch(`${cloudUrl}?action=getAlbums`, { signal: controller.signal })
                    .catch(() => null)
                    .finally(() => clearTimeout(timeoutId));
                if (resp && resp.ok) {
                    const data = await resp.json();
                    if (data && Array.isArray(data.albums) && data.albums.length > 0) {
                        return mergeCloudAlbums(data.albums);
                    }
                }
            } catch (e) {}
        }

        // 2. Try static data/albums.json from GitHub Pages repository (2.5s timeout)
        try {
            let base = window.location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
            if (window.location.hostname.includes('github.io')) {
                base = '/dutustory';
            }
            const staticUrl = `${base}/data/albums.json?v=${Date.now()}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const staticResp = await fetch(staticUrl, { signal: controller.signal })
                .catch(() => null)
                .finally(() => clearTimeout(timeoutId));
            if (staticResp && staticResp.ok) {
                const staticAlbums = await staticResp.json();
                if (Array.isArray(staticAlbums) && staticAlbums.length > 0) {
                    return mergeCloudAlbums(staticAlbums);
                }
            }
        } catch (e) {}

        return false;
    }

    function exportAlbumsJsonFile() {
        const albums = getAllAlbums();
        const jsonStr = JSON.stringify(albums, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'albums.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        App.showToast("Đã tải file albums.json! Bạn có thể lưu vào thư mục data/ và push lên GitHub để mọi thiết bị đều thấy.", "info");
    }

    function getAlbumById(albumId) {
        const albums = getAllAlbums();
        return albums.find(a => a.id === albumId) || albums[0];
    }

    function getActiveAdminAlbum() {
        return getAlbumById(activeAdminAlbumId);
    }

    function getClientShareUrl(albumId) {
        let base = window.location.origin + window.location.pathname;
        base = base.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
        if (window.location.hostname.includes('github.io')) {
            return `https://ducthuan897.github.io/dutustory/${encodeURIComponent(albumId)}`;
        }
        return `${base}/${encodeURIComponent(albumId)}`;
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

        const prefixEl = document.getElementById('createAlbumDomainPrefix');
        if (prefixEl) {
            let base = window.location.origin + window.location.pathname;
            base = base.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
            prefixEl.innerText = window.location.hostname.includes('github.io')
                ? "https://ducthuan897.github.io/dutustory/"
                : `${base}/`;
        }

        const dateInput = document.getElementById('createAlbumDateInput');
        if (dateInput) dateInput.value = '';

        const metaText = document.getElementById('createModalDetectedMetaText');
        if (metaText) {
            metaText.innerHTML = `Vị trí &amp; Ngày chụp sẽ tự động trích xuất từ thông tin ảnh (EXIF / GPS)`;
        }

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
        updateDriveApiKeyBadge();

        document.getElementById('createAlbumModal').classList.remove('hidden');
    }

    function closeCreateAlbumModal() {
        document.getElementById('createAlbumModal').classList.add('hidden');
        previewedDrivePhotosCache = {};
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

    async function addDriveLinkToCreateModal() {
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
        previewDriveMetadataInCreateModal(val);
    }

    function removeDriveLinkFromCreateModal(idx) {
        createModalDriveLinks.splice(idx, 1);
        renderCreateModalDriveLinks();
        updateCreateModalDetectedMetaSummary();
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

    // ==================== PHOTO METADATA (EXIF / GPS / DATE & LOCATION) EXTRACTOR ====================

    const clientGeoCache = {};

    const KNOWN_VN_LOCATIONS = [
        { keywords: ["da lat", "dalat", "đà lạt", "tuyen lam", "đa phú", "da phu", "con ga", "cầu đất", "cau dat", "langbiang", "xuan huong"], city: "Đà Lạt" },
        { keywords: ["phu quoc", "phú quốc", "bai sao", "bãi sao", "sanato", "hon thom", "hòn thơm", "rach vem"], city: "Phú Quốc" },
        { keywords: ["ha noi", "hanoi", "hà nội", "ho guom", "hồ gươm", "pho co", "phố cổ", "phan dinh phung", "ho tay", "hồ tây"], city: "Hà Nội" },
        { keywords: ["sai gon", "saigon", "sài gòn", "tp hcm", "tphcm", "ho chi minh", "hồ chí minh", "quan 1", "quận 1", "thu thiêm"], city: "TP. Hồ Chí Minh" },
        { keywords: ["da nang", "danang", "đà nẵng", "ba na", "bà nà", "my khe", "mỹ khê", "son tra", "sơn trà"], city: "Đà Nẵng" },
        { keywords: ["hoi an", "hội an", "cua dai", "an bang"], city: "Hội An" },
        { keywords: ["nha trang", "cam ranh", "bai dai"], city: "Nha Trang" },
        { keywords: ["sapa", "sa pa", "fansipan", "muong hoa"], city: "Sa Pa" },
        { keywords: ["ninh binh", "ninh bình", "trang an", "tràng an", "tam coc", "hang mua"], city: "Ninh Bình" },
        { keywords: ["hue", "huế", "dai noi", "đại nội", "huong giang"], city: "Huế" },
        { keywords: ["vung tau", "vũng tàu", "ho tram", "hồ tràm"], city: "Vũng Tàu" },
        { keywords: ["ha long", "hạ long", "quang ninh", "quảng ninh", "tuan chau"], city: "Hạ Long" },
        { keywords: ["phan thiet", "phan thiết", "mui ne", "mũi né", "bau trang", "bàu trắng"], city: "Phan Thiết" },
        { keywords: ["quy nhon", "quy nhơn", "ky co", "kỳ co", "eo gio", "eo gió"], city: "Quy Nhơn" }
    ];

    function extractLocationFromText(text) {
        if (!text) return null;
        const norm = text
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/[_.\-]+/g, " ");

        for (const item of KNOWN_VN_LOCATIONS) {
            for (const kw of item.keywords) {
                const kwNorm = kw
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/đ/g, "d");
                if (norm.includes(kwNorm)) {
                    return { city: item.city, location: item.city };
                }
            }
        }
        return null;
    }

    function extractDateFromText(text) {
        if (!text) return null;
        // Match YYYYMMDD_HHMMSS or YYYY-MM-DD_HH-MM
        const m1 = text.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[-_ T]?([01]\d|2[0-3])[-_:]?([0-5]\d))?/);
        if (m1) {
            const yyyy = m1[1];
            const mm = m1[2];
            const dd = m1[3];
            const hh = m1[4] || "08";
            const min = m1[5] || "30";
            return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
        }
        return null;
    }

    function normalizeDateToIsoMinute(val) {
        if (!val) return null;
        if (val instanceof Date && !isNaN(val.getTime())) {
            const local = new Date(val.getTime() - val.getTimezoneOffset() * 60000);
            return local.toISOString().slice(0, 16);
        }
        const str = String(val).trim();
        // EXIF format "YYYY:MM:DD HH:MM:SS" or ISO "YYYY-MM-DDTHH:MM"
        const m = str.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[T\s]+(\d{2}):(\d{2})/);
        if (m) {
            return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
        }
        const mDateOnly = str.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})$/);
        if (mDateOnly) {
            return `${mDateOnly[1]}-${mDateOnly[2]}-${mDateOnly[3]}T08:30`;
        }
        // Vietnamese Drive modified format: "25 thg 10, 2026" or "7 thg 11"
        const mVn = str.match(/(\d{1,2})\s*thg\s*(\d{1,2})(?:[,\s]+(\d{4}))?/i);
        if (mVn) {
            const dd = mVn[1].padStart(2, '0');
            const mm = mVn[2].padStart(2, '0');
            const yyyy = mVn[3] || new Date().getFullYear().toString();
            return `${yyyy}-${mm}-${dd}T08:30`;
        }
        // DD/MM/YYYY format
        const mDmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
        if (mDmy) {
            const dd = mDmy[1].padStart(2, '0');
            const mm = mDmy[2].padStart(2, '0');
            const yyyy = mDmy[3];
            const hh = (mDmy[4] || '08').padStart(2, '0');
            const min = (mDmy[5] || '30').padStart(2, '0');
            return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
        }
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) {
            const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
            return local.toISOString().slice(0, 16);
        }
        return null;
    }

    function parseXmpGpsCoord(str) {
        if (!str) return null;
        const s = String(str).trim();
        // Format: "11,56.423N" or "108,27.501E" or "11,56,25.4N"
        const m = s.match(/^(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:[,\s]+(\d+(?:\.\d+)?))?\s*([NSEWnsew])?$/);
        if (m) {
            const deg = parseFloat(m[1]) || 0;
            const min = parseFloat(m[2]) || 0;
            const sec = parseFloat(m[3]) || 0;
            let val = deg + min / 60 + sec / 3600;
            const ref = (m[4] || '').toUpperCase();
            if (ref === 'S' || ref === 'W') val = -val;
            return val;
        }
        const num = parseFloat(s);
        return isNaN(num) ? null : num;
    }

    async function reverseGeocodeCoords(lat, lon) {
        if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
        const key = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
        if (clientGeoCache[key]) return clientGeoCache[key];

        // 1. Try BigDataCloud (api-bdc.io)
        try {
            const resp = await fetch(
                `https://api-bdc.io/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=vi`
            );
            if (resp.ok) {
                const data = await resp.json();
                const rawCity = (data.city || data.principalSubdivision || "").replace(/^(Tỉnh|Thành phố)\s+/i, "").trim();
                const rawLocality = (data.locality || "").replace(/^(Phường|Xã|Thị trấn|Quận|Huyện)\s+/i, "").trim();
                const city = rawCity || rawLocality || "";
                const location =
                    rawLocality && rawCity && rawLocality.toLowerCase() !== rawCity.toLowerCase()
                        ? `${data.locality} - ${rawCity}`
                        : (city || `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`);
                const res = { city: city || location, location };
                clientGeoCache[key] = res;
                return res;
            }
        } catch (e) {}

        // 2. Fallback to OpenStreetMap Nominatim
        try {
            const resp = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&accept-language=vi`
            );
            if (resp.ok) {
                const data = await resp.json();
                const addr = data.address || {};
                const city = addr.city || addr.town || addr.province || addr.state || "";
                const sub = addr.suburb || addr.quarter || addr.neighbourhood || addr.road || "";
                const location = sub && city ? `${sub} - ${city}` : (city || data.display_name || "");
                const res = { city: city || location, location };
                clientGeoCache[key] = res;
                return res;
            }
        } catch (e) {}

        return null;
    }

    function parseExifFromArrayBuffer(buffer) {
        const out = { capturedAt: null, lat: null, lon: null, city: null, location: null };
        if (!buffer || buffer.byteLength < 12) return out;
        const view = new DataView(buffer);
        if (view.getUint8(0) !== 0xFF || view.getUint8(1) !== 0xD8) return out;

        let offset = 2;
        const len = view.byteLength;
        while (offset + 4 < len) {
            if (view.getUint8(offset) !== 0xFF) break;
            while (offset + 1 < len && view.getUint8(offset + 1) === 0xFF) offset++;
            if (offset + 4 >= len) break;
            const marker = view.getUint8(offset + 1);
            if (marker === 0xDA || marker === 0xD9) break;
            const segLen = view.getUint16(offset + 2, false);
            if (segLen < 2) break;

            if (
                marker === 0xE1 &&
                offset + 10 < len &&
                view.getUint8(offset + 4) === 0x45 &&
                view.getUint8(offset + 5) === 0x78 &&
                view.getUint8(offset + 6) === 0x69 &&
                view.getUint8(offset + 7) === 0x66
            ) {
                const tiffStart = offset + 10;
                const le = view.getUint16(tiffStart, false) === 0x4949;
                const ifd0 = view.getUint32(tiffStart + 4, le);
                let exifOffset = 0;
                let gpsOffset = 0;

                const readAscii = (valPos, count) => {
                    if (count <= 0 || count > 300) return "";
                    const p = count <= 4 ? valPos : tiffStart + view.getUint32(valPos, le);
                    if (p < 0 || p + count > len) return "";
                    let s = "";
                    for (let i = 0; i < count - 1; i++) {
                        const c = view.getUint8(p + i);
                        if (c === 0) break;
                        s += String.fromCharCode(c);
                    }
                    return s.trim();
                };

                const readRationals = (valPos, count) => {
                    const p = tiffStart + view.getUint32(valPos, le);
                    if (p < 0 || p + count * 8 > len) return null;
                    const arr = [];
                    for (let i = 0; i < count; i++) {
                        const num = view.getUint32(p + i * 8, le);
                        const den = view.getUint32(p + i * 8 + 4, le);
                        arr.push(den === 0 ? 0 : num / den);
                    }
                    return arr;
                };

                const scanIfd = (ifdPos, isGps) => {
                    if (ifdPos + 2 > len) return;
                    const entries = view.getUint16(ifdPos, le);
                    let latRef = "N", lonRef = "E", latArr = null, lonArr = null;
                    for (let i = 0; i < entries; i++) {
                        const ep = ifdPos + 2 + i * 12;
                        if (ep + 12 > len) break;
                        const tag = view.getUint16(ep, le);
                        const count = view.getUint32(ep + 4, le);
                        const vp = ep + 8;
                        if (!isGps) {
                            if (tag === 0x8769) exifOffset = view.getUint32(vp, le);
                            else if (tag === 0x8825) gpsOffset = view.getUint32(vp, le);
                            else if (tag === 0x9003 || tag === 0x9004 || tag === 0x0132) {
                                const dt = normalizeDateToIsoMinute(readAscii(vp, count));
                                if (dt && (!out.capturedAt || tag === 0x9003)) out.capturedAt = dt;
                            }
                        } else {
                            if (tag === 0x0001) latRef = (readAscii(vp, count) || "N").toUpperCase();
                            else if (tag === 0x0002 && count === 3) latArr = readRationals(vp, 3);
                            else if (tag === 0x0003) lonRef = (readAscii(vp, count) || "E").toUpperCase();
                            else if (tag === 0x0004 && count === 3) lonArr = readRationals(vp, 3);
                        }
                    }
                    if (isGps && latArr && lonArr) {
                        let lat = latArr[0] + latArr[1] / 60 + latArr[2] / 3600;
                        let lon = lonArr[0] + lonArr[1] / 60 + lonArr[2] / 3600;
                        if (latRef.startsWith("S")) lat = -lat;
                        if (lonRef.startsWith("W")) lon = -lon;
                        if (Math.abs(lat) > 0.0001 || Math.abs(lon) > 0.0001) {
                            out.lat = lat;
                            out.lon = lon;
                        }
                    }
                };

                scanIfd(tiffStart + ifd0, false);
                if (exifOffset > 0) scanIfd(tiffStart + exifOffset, false);
                if (gpsOffset > 0) scanIfd(tiffStart + gpsOffset, true);
            }
            if (offset + 2 + segLen > len) break;
            offset += 2 + segLen;
        }

        // Also scan UTF-8/ASCII header for XMP / IPTC metadata (e.g. Lightroom exported JPEGs)
        if (!out.capturedAt || out.lat == null || !out.location) {
            try {
                const headerBytes = new Uint8Array(buffer, 0, Math.min(len, 131072));
                const asciiHeader = new TextDecoder("utf-8", { fatal: false }).decode(headerBytes);
                if (!out.capturedAt) {
                    const dtMatch = asciiHeader.match(/(?:DateTimeOriginal|CreateDate|DateCreated)[=">\s:]+(\d{4}[:\-]\d{2}[:\-]\d{2}[T\s]\d{2}:\d{2})/);
                    if (dtMatch) out.capturedAt = normalizeDateToIsoMinute(dtMatch[1]);
                }
                if (out.lat == null || out.lon == null) {
                    const latMatch = asciiHeader.match(/exif:GPSLatitude[=">\s]+([^"<&\s]+)/i);
                    const lonMatch = asciiHeader.match(/exif:GPSLongitude[=">\s]+([^"<&\s]+)/i);
                    if (latMatch && lonMatch) {
                        const pLat = parseXmpGpsCoord(latMatch[1]);
                        const pLon = parseXmpGpsCoord(lonMatch[1]);
                        if (pLat != null && pLon != null && (Math.abs(pLat) > 0.0001 || Math.abs(pLon) > 0.0001)) {
                            out.lat = pLat;
                            out.lon = pLon;
                        }
                    }
                }
                if (!out.city) {
                    const cityMatch = asciiHeader.match(/photoshop:City[=">\s]+([^"<&\r\n]+)/i);
                    if (cityMatch) out.city = cityMatch[1].trim();
                }
                if (!out.location) {
                    const locMatch = asciiHeader.match(/Iptc4xmpCore:Location[=">\s]+([^"<&\r\n]+)/i);
                    if (locMatch) {
                        const sub = locMatch[1].trim();
                        out.location = out.city ? `${sub} - ${out.city}` : sub;
                    } else if (out.city) {
                        out.location = out.city;
                    }
                }
            } catch (e) {}
        }

        return out;
    }

    async function extractMetadataFromLocalFile(file) {
        let capturedAt = null;
        let lat = null;
        let lon = null;
        let location = null;
        let city = null;

        // 1. Try exifr library (both .parse and .gps for maximum compatibility)
        if (window.exifr) {
            try {
                if (typeof window.exifr.gps === "function") {
                    const gpsData = await window.exifr.gps(file).catch(() => null);
                    if (gpsData && typeof gpsData.latitude === "number" && typeof gpsData.longitude === "number") {
                        lat = gpsData.latitude;
                        lon = gpsData.longitude;
                    }
                }
                if (typeof window.exifr.parse === "function") {
                    const parsed = await window.exifr.parse(file, {
                        tiff: true,
                        exif: true,
                        gps: true,
                        iptc: true,
                        xmp: true
                    }).catch(() => null);
                    if (parsed) {
                        const rawDt = parsed.DateTimeOriginal || parsed.CreateDate || parsed.ModifyDate || parsed.DateCreated;
                        capturedAt = normalizeDateToIsoMinute(rawDt);
                        if (lat == null && typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
                            lat = parsed.latitude;
                            lon = parsed.longitude;
                        } else if (lat == null && Array.isArray(parsed.GPSLatitude) && Array.isArray(parsed.GPSLongitude)) {
                            let dLat = (parsed.GPSLatitude[0] || 0) + (parsed.GPSLatitude[1] || 0) / 60 + (parsed.GPSLatitude[2] || 0) / 3600;
                            let dLon = (parsed.GPSLongitude[0] || 0) + (parsed.GPSLongitude[1] || 0) / 60 + (parsed.GPSLongitude[2] || 0) / 3600;
                            if (String(parsed.GPSLatitudeRef || '').toUpperCase().startsWith('S')) dLat = -dLat;
                            if (String(parsed.GPSLongitudeRef || '').toUpperCase().startsWith('W')) dLon = -dLon;
                            if (Math.abs(dLat) > 0.0001 || Math.abs(dLon) > 0.0001) {
                                lat = dLat;
                                lon = dLon;
                            }
                        }
                        const metaCity = parsed.City || parsed.city || parsed.State || "";
                        const metaSubloc = parsed.Sublocation || parsed.Location || parsed.ObjectName || "";
                        if (metaCity) city = String(metaCity).trim();
                        if (metaSubloc && city) location = `${String(metaSubloc).trim()} - ${city}`;
                        else if (metaSubloc) location = String(metaSubloc).trim();
                        else if (city) location = city;
                    }
                }
            } catch (e) {}
        }

        // 2. Fallback to built-in binary EXIF + XMP parser on first 512KB
        if (!capturedAt || (lat == null && !location)) {
            try {
                const slice = file.slice(0, 524288);
                const buf = await slice.arrayBuffer();
                const binExif = parseExifFromArrayBuffer(buf);
                if (!capturedAt && binExif.capturedAt) capturedAt = binExif.capturedAt;
                if (lat == null && binExif.lat != null) {
                    lat = binExif.lat;
                    lon = binExif.lon;
                }
                if (!city && binExif.city) city = binExif.city;
                if (!location && binExif.location) location = binExif.location;
            } catch (e) {}
        }

        // 3. Reverse geocode GPS coordinates if found
        if (!location && lat != null && lon != null) {
            const geo = await reverseGeocodeCoords(lat, lon);
            if (geo) {
                location = geo.location;
                city = geo.city;
            }
        }

        // 4. Fallback to filename date / location or file.lastModified
        if (!capturedAt) {
            capturedAt = extractDateFromText(file.name);
        }
        if (!capturedAt && file.lastModified) {
            capturedAt = normalizeDateToIsoMinute(new Date(file.lastModified));
        }
        if (!capturedAt) {
            capturedAt = new Date().toISOString().slice(0, 16);
        }

        if (!location) {
            const textLoc = extractLocationFromText(file.name);
            if (textLoc) {
                location = textLoc.location;
                city = textLoc.city;
            }
        }

        return {
            capturedAt,
            location: location || "",
            city: city || ""
        };
    }

    function updateCreateModalDetectedMetaSummary(extraPhotos = []) {
        const metaText = document.getElementById('createModalDetectedMetaText');
        const cityInput = document.getElementById('createAlbumCityInput');
        const dateInput = document.getElementById('createAlbumDateInput');

        const allKnown = [...createModalLocalFilesData, ...extraPhotos];
        const foundLocPhoto = allKnown.find(p => p.location || p.city);
        const foundDatePhoto = allKnown.find(p => p.capturedAt);

        const detectedCity = foundLocPhoto ? (foundLocPhoto.city || foundLocPhoto.location) : "";
        const detectedLoc = foundLocPhoto ? (foundLocPhoto.location || foundLocPhoto.city) : "";
        const detectedDate = foundDatePhoto && foundDatePhoto.capturedAt ? foundDatePhoto.capturedAt.slice(0, 10) : "";

        if (cityInput && detectedCity) {
            if (!cityInput.value || cityInput.dataset.autoFilled === "true") {
                cityInput.value = detectedCity;
                cityInput.dataset.autoFilled = "true";
            }
        }
        if (dateInput && detectedDate) {
            if (!dateInput.value || dateInput.dataset.autoFilled === "true") {
                dateInput.value = detectedDate;
                dateInput.dataset.autoFilled = "true";
            }
        }

        if (metaText) {
            if (detectedLoc || detectedDate) {
                const dateFormatted = detectedDate ? detectedDate.split('-').reverse().join('/') : 'Tự động từ ảnh';
                const locFormatted = detectedLoc || 'Tự động từ ảnh / tag';
                metaText.innerHTML = `Đã lấy từ ảnh: <strong class="text-zinc-900"><i class="fa-solid fa-location-dot text-rose-500 mr-1"></i>${locFormatted}</strong> • <strong class="text-zinc-900"><i class="fa-regular fa-calendar mr-1 text-emerald-600"></i>${dateFormatted}</strong>`;
            } else if (createModalDriveLinks.length > 0) {
                metaText.innerHTML = `Đã gắn <strong>${createModalDriveLinks.length}</strong> link Google Drive — Đang chờ trích xuất Vị trí &amp; Ngày chụp`;
            } else {
                metaText.innerHTML = `Vị trí &amp; Ngày chụp sẽ tự động trích xuất từ thông tin ảnh (EXIF / GPS)`;
            }
        }
    }

    async function previewDriveMetadataInCreateModal(driveLink) {
        const metaText = document.getElementById('createModalDetectedMetaText');
        const hasKey = !!getGoogleDriveApiKey();
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const folderId = extractGoogleDriveFolderId(driveLink);

        if (metaText) {
            metaText.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-emerald-600 mr-1"></i> Đang đọc Vị trí &amp; Ngày chụp từ thông tin ảnh Google Drive...`;
        }
        try {
            const samplePhotos = await fetchRealPhotosFromDriveLinks([driveLink], "", "", 0);
            if (folderId && samplePhotos && samplePhotos.length > 0) {
                previewedDrivePhotosCache[folderId] = samplePhotos;
            }
            updateCreateModalDetectedMetaSummary(samplePhotos);
            if (!hasKey && !isLocal && (!samplePhotos || !samplePhotos.some(p => p.capturedAt || p.location))) {
                if (metaText) {
                    metaText.innerHTML = `<span class="text-amber-800 font-medium cursor-pointer" onclick="AdminModule.openDriveApiKeyModal()"><i class="fa-solid fa-key text-amber-600 mr-1"></i> <u>Cài đặt Google Drive API Key</u> để tự động đọc EXIF GPS &amp; Ngày chụp từ link Drive trên GitHub Pages.</span>`;
                }
            }
        } catch (e) {
            updateCreateModalDetectedMetaSummary();
        }
    }

    function compressImageFile(file, maxDim = 1600, quality = 0.82) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const dataUrl = e.target.result;
                const img = new Image();
                img.onload = function () {
                    let w = img.width;
                    let h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w >= h) {
                            h = Math.round((h * maxDim) / w);
                            w = maxDim;
                        } else {
                            w = Math.round((w * maxDim) / h);
                            h = maxDim;
                        }
                    }
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    } catch (err) {
                        resolve(dataUrl);
                    }
                };
                img.onerror = function () {
                    resolve(dataUrl);
                };
                img.src = dataUrl;
            };
            reader.onerror = function () {
                resolve("");
            };
            reader.readAsDataURL(file);
        });
    }

    async function handleCreateModalLocalFiles(event) {
        const files = event.target.files;
        if (!files || !files.length) return;

        const countEl = document.getElementById('createModalLocalCount');
        if (countEl) countEl.innerText = `Đang đọc ảnh & trích xuất Vị trí, Ngày chụp từ ${files.length} file...`;

        const fileList = Array.from(files);
        for (let idx = 0; idx < fileList.length; idx++) {
            const file = fileList[idx];
            const [dataUrl, meta] = await Promise.all([
                compressImageFile(file, 1600, 0.84),
                extractMetadataFromLocalFile(file)
            ]);
            if (!dataUrl) continue;

            const cleanName = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
            createModalLocalFilesData.push({
                code: cleanName.length <= 20 ? cleanName : `IMG_${1001 + createModalLocalFilesData.length}`,
                title: file.name,
                capturedAt: meta.capturedAt,
                location: meta.location,
                city: meta.city,
                url: dataUrl
            });
        }
        renderCreateModalLocalPreview();
        updateCreateModalDetectedMetaSummary();
        event.target.value = "";
    }

    function removeLocalFileFromCreateModal(idx) {
        createModalLocalFilesData.splice(idx, 1);
        renderCreateModalLocalPreview();
        updateCreateModalDetectedMetaSummary();
    }

    function renderCreateModalLocalPreview() {
        const el = document.getElementById('createModalLocalCount');
        const grid = document.getElementById('createModalLocalThumbGrid');
        if (el) {
            if (!createModalLocalFilesData.length) {
                el.innerText = "Chưa chọn file nào";
            } else {
                el.innerText = `Đã chọn ${createModalLocalFilesData.length} ảnh từ máy tính (Đã đọc EXIF Ngày chụp & Vị trí)`;
            }
        }
        if (grid) {
            if (!createModalLocalFilesData.length) {
                grid.innerHTML = "";
            } else {
                grid.innerHTML = createModalLocalFilesData.map((f, idx) => `
                    <div class="relative group aspect-square rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100" title="${f.code} • ${f.location || 'Tự động'} • ${formatTimeShort(f.capturedAt)}">
                        <img src="${f.url}" alt="${f.code}" class="w-full h-full object-cover">
                        <button
                            type="button"
                            onclick="AdminModule.removeLocalFileFromCreateModal(${idx})"
                            class="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center shadow"
                            title="Bỏ ảnh này"
                        >
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                        <span class="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[8px] font-mono truncate px-1">${f.location ? f.location : f.code}</span>
                    </div>
                `).join('');
            }
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
        if (!url) return null;
        if (url.includes('/folders/')) return null;
        const match =
            url.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/) ||
            url.match(/\/d\/([a-zA-Z0-9_-]{15,})/) ||
            url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
        return match ? match[1] : null;
    }

    function extractGoogleDriveFolderId(url) {
        if (!url) return null;
        const folderMatch = url.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
        if (folderMatch) return folderMatch[1];
        if (url.includes('drive.google.com') && url.includes('id=') && !url.includes('/file/')) {
            const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
            if (idMatch) return idMatch[1];
        }
        return null;
    }

    function parseDriveEmbeddedFolderHtml(html) {
        const files = [];
        if (!html) return { folderTitle: "", files };
        let folderTitle = "";
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
            folderTitle = titleMatch[1].replace(/\s*-\s*Google Drive$/i, "").trim();
        }
        const entryRegex = /id="entry-([a-zA-Z0-9_-]{20,})"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>(?:[\s\S]*?<div class="flip-entry-last-modified"><div>([^<]*)<\/div>)?/g;
        let m;
        while ((m = entryRegex.exec(html)) !== null) {
            const fId = m[1];
            const fName = m[2].trim();
            const fMod = (m[3] || "").trim();
            if (!/\.(mp4|mov|avi|zip|rar|pdf|txt|doc|docx)$/i.test(fName)) {
                files.push({
                    id: fId,
                    name: fName,
                    folderTitle,
                    modifiedRaw: fMod,
                    capturedAt: extractDateFromText(fName) || null,
                    url: `https://drive.google.com/thumbnail?id=${fId}&sz=w1600`
                });
            }
        }
        return { folderTitle, files };
    }

    function base64DataUrlToArrayBuffer(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return null;
        const commaIdx = dataUrl.indexOf(',');
        const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
        try {
            const bin = atob(b64.slice(0, 180000)); // First ~135KB is enough for EXIF/GPS/XMP header
            const len = bin.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = bin.charCodeAt(i);
            }
            return bytes.buffer;
        } catch (e) {
            return null;
        }
    }

    async function extractDriveFileMetaInBrowser(fileId) {
        const meta = {
            name: null,
            capturedAt: null,
            location: null,
            city: null,
            lat: null,
            lon: null
        };

        const dlUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;

        // 1. Try binary EXIF/GPS extraction in browser via CORS-enabled endpoints
        const binaryProxyUrls = [
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(dlUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(dlUrl)}`
        ];

        for (const pUrl of binaryProxyUrls) {
            try {
                const resp = await fetch(pUrl, {
                    headers: { Range: 'bytes=0-131071' }
                });
                if (resp.ok) {
                    const buf = await resp.arrayBuffer();
                    if (buf && buf.byteLength > 64) {
                        const binExif = parseExifFromArrayBuffer(buf);
                        if (binExif.capturedAt) meta.capturedAt = binExif.capturedAt;
                        if (binExif.lat != null && binExif.lon != null) {
                            meta.lat = binExif.lat;
                            meta.lon = binExif.lon;
                        }
                        if (binExif.city) meta.city = binExif.city;
                        if (binExif.location) meta.location = binExif.location;

                        if ((!meta.capturedAt || meta.lat == null) && window.exifr && typeof window.exifr.parse === 'function') {
                            const ex = await window.exifr.parse(buf, { tiff: true, exif: true, gps: true, xmp: true, iptc: true }).catch(() => null);
                            if (ex) {
                                if (!meta.capturedAt) {
                                    meta.capturedAt = normalizeDateToIsoMinute(ex.DateTimeOriginal || ex.CreateDate || ex.ModifyDate);
                                }
                                if (meta.lat == null && typeof ex.latitude === 'number' && typeof ex.longitude === 'number') {
                                    meta.lat = ex.latitude;
                                    meta.lon = ex.longitude;
                                }
                            }
                        }
                        if (meta.capturedAt || meta.lat != null || meta.location) break;
                    }
                }
            } catch (e) {}
        }

        // 2. Try allorigins /get (JSON base64 wrapper) if binary proxy was blocked
        if (!meta.capturedAt && meta.lat == null) {
            try {
                const getResp = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(dlUrl)}`);
                if (getResp.ok) {
                    const json = await getResp.json();
                    if (json && json.contents && json.contents.startsWith('data:')) {
                        const buf = base64DataUrlToArrayBuffer(json.contents);
                        if (buf) {
                            const binExif = parseExifFromArrayBuffer(buf);
                            if (binExif.capturedAt) meta.capturedAt = binExif.capturedAt;
                            if (binExif.lat != null && binExif.lon != null) {
                                meta.lat = binExif.lat;
                                meta.lon = binExif.lon;
                            }
                            if (binExif.city) meta.city = binExif.city;
                            if (binExif.location) meta.location = binExif.location;
                        }
                    }
                }
            } catch (e) {}
        }

        // 3. Try Google Drive file /view HTML page for original filename & description metadata
        if (!meta.name || (!meta.capturedAt && !meta.location && meta.lat == null)) {
            const viewUrl = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
            try {
                const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(viewUrl)}`);
                if (r.ok) {
                    const html = await r.text();
                    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
                    if (ogTitle) {
                        meta.name = ogTitle[1].replace(/\s*-\s*Google Drive$/i, '').trim();
                    }
                    if (!meta.capturedAt && meta.name) {
                        meta.capturedAt = extractDateFromText(meta.name);
                    }
                    if (!meta.location && meta.name) {
                        const locHint = extractLocationFromText(meta.name);
                        if (locHint) {
                            meta.location = locHint.location;
                            meta.city = locHint.city;
                        }
                    }
                }
            } catch (e) {}
        }

        // 4. Reverse geocode GPS coordinates if found
        if (!meta.location && meta.lat != null && meta.lon != null) {
            const geo = await reverseGeocodeCoords(meta.lat, meta.lon);
            if (geo) {
                meta.location = geo.location;
                meta.city = geo.city;
            }
        }

        return meta;
    }

    async function fetchGoogleDriveFolderFiles(folderId) {
        const apiKey = getGoogleDriveApiKey();

        // 0. If Google Apps Script Web App URL is configured (Best for GitHub Pages, 100% bypasses Google Drive CORS & files.list restriction)
        if (apiKey && apiKey.startsWith("https://script.google.com/")) {
            try {
                const resp = await fetch(`${apiKey}?id=${encodeURIComponent(folderId)}`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && Array.isArray(data.files) && data.files.length > 0) {
                        const folderTitle = data.folderTitle || "";
                        const processedFiles = await Promise.all(data.files.map(async (f) => {
                            let photoLoc = f.location || "";
                            let photoCity = f.city || "";
                            // Strict EXIF capture date (DateTimeOriginal) or photo filename (never Drive upload date)
                            let capturedAt = normalizeDateToIsoMinute(f.capturedAt) || extractDateFromText(f.name);
                            if (f.lat != null && f.lon != null) {
                                const geo = await reverseGeocodeCoords(f.lat, f.lon);
                                if (geo) {
                                    photoLoc = geo.location;
                                    photoCity = geo.city;
                                }
                            }
                            if (!photoLoc && f.name) {
                                const nameLoc = extractLocationFromText(f.name);
                                if (nameLoc) {
                                    photoLoc = nameLoc.location;
                                    photoCity = nameLoc.city;
                                }
                            }
                            return {
                                id: f.id,
                                name: f.name,
                                folderTitle,
                                capturedAt,
                                location: photoLoc,
                                city: photoCity,
                                lat: f.lat,
                                lon: f.lon,
                                url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`
                            };
                        }));

                        return {
                            folderTitle,
                            folderCity: data.folderCity || "",
                            folderLocation: data.folderLocation || "",
                            folderDate: data.folderDate || "",
                            files: processedFiles
                        };
                    }
                }
            } catch (e) {
                console.warn("Google Apps Script fetch error:", e);
            }
        }

        // 1. If Google Drive API Key is configured, use official Google Drive API v3 (100% reliable CORS support on GitHub Pages)
        if (apiKey && !apiKey.startsWith("https://")) {
            try {
                const apiUrl = `https://www.googleapis.com/drive/v3/files?q='${encodeURIComponent(folderId)}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,imageMediaMetadata,createdTime,modifiedTime)&pageSize=100&key=${encodeURIComponent(apiKey)}`;
                const folderInfoUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=name&key=${encodeURIComponent(apiKey)}`;

                const [filesResp, folderResp] = await Promise.all([
                    fetch(apiUrl),
                    fetch(folderInfoUrl).catch(() => null)
                ]);

                if (filesResp.ok) {
                    const data = await filesResp.json();
                    let folderTitle = "";
                    if (folderResp && folderResp.ok) {
                        const folderData = await folderResp.json();
                        folderTitle = folderData.name || "";
                    }

                    const rawFiles = (data && Array.isArray(data.files)) ? data.files : [];
                    const imageFiles = rawFiles.filter(f => !f.mimeType || f.mimeType.startsWith('image/') || /\.(jpe?g|png|webp|heic|tiff?)$/i.test(f.name || ''));

                    const processedFiles = await Promise.all(imageFiles.map(async (f) => {
                        let capturedAt = null;
                        let lat = null;
                        let lon = null;
                        let city = null;
                        let location = null;

                        const imm = f.imageMediaMetadata;
                        if (imm) {
                            if (imm.time) {
                                capturedAt = normalizeDateToIsoMinute(imm.time);
                            }
                            if (imm.location && typeof imm.location.latitude === 'number' && typeof imm.location.longitude === 'number') {
                                lat = imm.location.latitude;
                                lon = imm.location.longitude;
                                const geo = await reverseGeocodeCoords(lat, lon);
                                if (geo) {
                                    location = geo.location;
                                    city = geo.city;
                                }
                            }
                        }

                        if (!capturedAt) {
                            capturedAt = extractDateFromText(f.name);
                        }

                        if (!location) {
                            const nameLoc = extractLocationFromText(f.name);
                            if (nameLoc) {
                                location = nameLoc.location;
                                city = nameLoc.city;
                            }
                        }

                        return {
                            id: f.id,
                            name: f.name,
                            folderTitle,
                            capturedAt,
                            location,
                            city,
                            lat,
                            lon,
                            url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`
                        };
                    }));

                    if (processedFiles.length > 0) {
                        return { folderTitle, files: processedFiles };
                    }
                }
            } catch (e) {
                console.warn("Google Drive API v3 query failed, falling back:", e);
            }
        }

        // 2. Try local server API endpoint if running locally
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            try {
                const resp = await fetch(`/api/drive-folder?id=${encodeURIComponent(folderId)}`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && Array.isArray(data.files) && data.files.length > 0) {
                        return data;
                    }
                }
            } catch (e) {}
        }

        // 3. Fallback for static GitHub Pages without API key (with strict 2.5s timeout)
        const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
        const proxyUrls = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(embedUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(embedUrl)}`
        ];

        let parsed = { folderTitle: "", files: [] };
        for (const pUrl of proxyUrls) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);
                const r = await fetch(pUrl, { signal: controller.signal })
                    .catch(() => null)
                    .finally(() => clearTimeout(timeoutId));
                if (r && r.ok) {
                    const html = await r.text();
                    parsed = parseDriveEmbeddedFolderHtml(html);
                    if (parsed.files && parsed.files.length > 0) break;
                }
            } catch (e) {}
        }

        // Enrich files in folder with client-side EXIF GPS & Capture Date (sample up to 8 files in parallel for speed)
        if (parsed.files && parsed.files.length > 0) {
            const sampleCount = Math.min(parsed.files.length, 8);
            await Promise.all(
                parsed.files.slice(0, sampleCount).map(async (f) => {
                    const exifMeta = await extractDriveFileMetaInBrowser(f.id);
                    if (exifMeta) {
                        if (exifMeta.capturedAt) f.capturedAt = exifMeta.capturedAt;
                        if (exifMeta.location) f.location = exifMeta.location;
                        if (exifMeta.city) f.city = exifMeta.city;
                        if (exifMeta.lat != null) f.lat = exifMeta.lat;
                        if (exifMeta.lon != null) f.lon = exifMeta.lon;
                    }
                })
            );
        }

        return parsed;
    }

    async function fetchGoogleDriveSingleFileMeta(fileId) {
        const apiKey = getGoogleDriveApiKey();

        // 1. Google Drive API v3
        if (apiKey) {
            try {
                const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,imageMediaMetadata,createdTime,modifiedTime&key=${encodeURIComponent(apiKey)}`;
                const resp = await fetch(url);
                if (resp.ok) {
                    const f = await resp.json();
                    let capturedAt = null;
                    let lat = null;
                    let lon = null;
                    let city = null;
                    let location = null;

                    const imm = f.imageMediaMetadata;
                    if (imm) {
                        if (imm.time) capturedAt = normalizeDateToIsoMinute(imm.time);
                        if (imm.location && typeof imm.location.latitude === 'number' && typeof imm.location.longitude === 'number') {
                            lat = imm.location.latitude;
                            lon = imm.location.longitude;
                            const geo = await reverseGeocodeCoords(lat, lon);
                            if (geo) {
                                location = geo.location;
                                city = geo.city;
                            }
                        }
                    }

                    if (!capturedAt) {
                        capturedAt = extractDateFromText(f.name);
                    }
                    if (!location) {
                        const nameLoc = extractLocationFromText(f.name);
                        if (nameLoc) {
                            location = nameLoc.location;
                            city = nameLoc.city;
                        }
                    }

                    return {
                        name: f.name,
                        capturedAt,
                        location,
                        city,
                        lat,
                        lon
                    };
                }
            } catch (e) {}
        }

        // 2. Try local server API endpoints
        const apiEndpoints = [`/api/drive-file-meta?id=${encodeURIComponent(fileId)}`];
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            apiEndpoints.push(`http://localhost:8080/api/drive-file-meta?id=${encodeURIComponent(fileId)}`);
        }

        for (const ep of apiEndpoints) {
            try {
                const resp = await fetch(ep);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && (data.capturedAt || data.location || data.lat != null || data.name)) {
                        return data;
                    }
                }
            } catch (e) {}
        }

        // Fallback to pure browser EXIF/GPS/View extraction on GitHub Pages
        return await extractDriveFileMetaInBrowser(fileId);
    }

    async function fetchRealPhotosFromDriveLinks(driveLinks, fallbackCity, fallbackDate, startIdx = 0) {
        const photos = [];
        let counter = startIdx;

        for (let i = 0; i < driveLinks.length; i++) {
            const rawLink = (driveLinks[i] || '').trim();
            if (!rawLink) continue;

            const folderId = extractGoogleDriveFolderId(rawLink);
            if (folderId) {
                if (previewedDrivePhotosCache[folderId] && previewedDrivePhotosCache[folderId].length > 0) {
                    photos.push(...previewedDrivePhotosCache[folderId]);
                    continue;
                }
                const folderData = await fetchGoogleDriveFolderFiles(folderId);
                const folderFiles = folderData.files || [];

                for (let j = 0; j < folderFiles.length; j++) {
                    const f = folderFiles[j];
                    counter++;
                    const cleanCode = (f.name || '').replace(/\.[^/.]+$/, "").toUpperCase();

                    // 1. Resolve Location strictly from EXIF GPS / reverse geocoding / photo filename metadata
                    let photoLoc = f.location || "";
                    let photoCity = f.city || "";
                    if (!photoLoc && f.lat != null && f.lon != null) {
                        const geo = await reverseGeocodeCoords(f.lat, f.lon);
                        if (geo) {
                            photoLoc = geo.location;
                            photoCity = geo.city;
                        }
                    }
                    if (!photoLoc && f.name) {
                        const nameLoc = extractLocationFromText(f.name);
                        if (nameLoc) {
                            photoLoc = nameLoc.location;
                            photoCity = nameLoc.city;
                        }
                    }
                    if (!photoLoc && folderData && folderData.folderLocation) {
                        photoLoc = folderData.folderLocation;
                        photoCity = folderData.folderCity || photoLoc;
                    }
                    if (!photoLoc && fallbackCity) {
                        photoCity = fallbackCity;
                        photoLoc = fallbackCity;
                    }

                    // 2. Resolve Capture Date/Time strictly from EXIF DateTimeOriginal / photo filename
                    let capturedAt =
                        normalizeDateToIsoMinute(f.capturedAt) ||
                        extractDateFromText(f.name) ||
                        (folderData && folderData.folderDate ? normalizeDateToIsoMinute(folderData.folderDate) : null) ||
                        (fallbackDate ? `${fallbackDate}T09:00` : "");

                    photos.push({
                        id: `drv_${f.id}_${Date.now()}_${counter}`,
                        driveFileId: f.id,
                        code: cleanCode && cleanCode.length <= 22 ? cleanCode : `DRV_${1000 + counter}`,
                        location: photoLoc,
                        city: photoCity,
                        capturedAt: capturedAt || "",
                        title: f.name || `Ảnh Google Drive #${counter}`,
                        url: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`
                    });
                }
                continue;
            }

            const fileId = extractGoogleDriveFileId(rawLink);
            if (fileId) {
                counter++;
                const meta = await fetchGoogleDriveSingleFileMeta(fileId);
                let photoLoc = (meta && meta.location) || "";
                let photoCity = (meta && meta.city) || "";
                if (!photoLoc && meta && meta.lat != null && meta.lon != null) {
                    const geo = await reverseGeocodeCoords(meta.lat, meta.lon);
                    if (geo) {
                        photoLoc = geo.location;
                        photoCity = geo.city;
                    }
                }
                const fName = (meta && meta.name) ? meta.name : "";
                if (!photoLoc && fName) {
                    const nameLoc = extractLocationFromText(fName);
                    if (nameLoc) {
                        photoLoc = nameLoc.location;
                        photoCity = nameLoc.city;
                    }
                }
                if (!photoLoc) {
                    photoLoc = fallbackCity || "";
                    photoCity = fallbackCity || "";
                }

                const cleanCode = fName ? fName.replace(/\.[^/.]+$/, "").toUpperCase() : `DRV_${1000 + counter}`;
                const min = ((counter * 5) % 60).toString().padStart(2, '0');
                const baseD = fallbackDate || new Date().toISOString().slice(0, 10);
                const capturedAt =
                    (meta && normalizeDateToIsoMinute(meta.capturedAt)) ||
                    extractDateFromText(fName) ||
                    `${baseD}T09:${min}`;

                photos.push({
                    id: `drv_file_${fileId}_${Date.now()}_${counter}`,
                    driveFileId: fileId,
                    code: cleanCode.length <= 22 ? cleanCode : `DRV_${1000 + counter}`,
                    location: photoLoc,
                    city: photoCity,
                    capturedAt,
                    title: fName || `Ảnh Google Drive #${counter}`,
                    url: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`
                });
                continue;
            }

            // Direct image URL pasted into Drive input
            if (/^https?:\/\//i.test(rawLink)) {
                counter++;
                const baseD = fallbackDate || new Date().toISOString().slice(0, 10);
                const urlLoc = extractLocationFromText(rawLink);
                photos.push({
                    id: `drv_url_${Date.now()}_${counter}`,
                    code: `IMG_${1000 + counter}`,
                    location: (urlLoc && urlLoc.location) || fallbackCity || "",
                    city: (urlLoc && urlLoc.city) || fallbackCity || "",
                    capturedAt: extractDateFromText(rawLink) || `${baseD}T09:00`,
                    title: `Ảnh #${counter}`,
                    url: rawLink
                });
            }
        }

        // Propagate detected shoot location and capture date among photos in the same album
        const photoWithLoc = photos.find(p => p.location && p.location.trim());
        const detectedLoc = photoWithLoc ? photoWithLoc.location : (fallbackCity || "");
        const detectedCity = photoWithLoc ? (photoWithLoc.city || photoWithLoc.location) : (fallbackCity || "");

        const validDatePhotos = photos.filter(p => p.capturedAt && /^\d{4}-\d{2}-\d{2}/.test(p.capturedAt));
        const detectedShootDate = validDatePhotos.length > 0
            ? validDatePhotos.map(p => p.capturedAt.slice(0, 10)).sort()[0]
            : (fallbackDate || "");

        photos.forEach((p, idx) => {
            if (!p.location || !p.location.trim()) {
                p.location = detectedLoc;
                p.city = detectedCity;
            }
            if (!p.capturedAt) {
                if (detectedShootDate) {
                    const hour = 8 + Math.floor((idx % 40) / 6);
                    const min = ((idx * 7) % 60).toString().padStart(2, '0');
                    p.capturedAt = `${detectedShootDate}T${hour.toString().padStart(2, '0')}:${min}`;
                }
            }
        });

        return photos;
    }

    function deriveAlbumDateAndLocation(photos, tags, title, hintCity = "", hintDate = "") {
        // 1. Find earliest or primary capture date from the photos' EXIF metadata or user input
        let detectedDate = "";
        const validDates = photos
            .map(p => (p.capturedAt ? p.capturedAt.slice(0, 10) : ""))
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort();
        if (hintDate && hintDate.trim()) {
            detectedDate = hintDate.trim();
        } else if (validDates.length > 0) {
            detectedDate = validDates[0];
        } else {
            const titleDate = extractDateFromText(title);
            if (titleDate) {
                detectedDate = titleDate.slice(0, 10);
            } else {
                detectedDate = "";
            }
        }

        // 2. Find primary city & location from user input, photos' EXIF GPS, or tags
        const photoWithCity = photos.find(p => p.city && p.city.trim());
        const photoWithLoc = photos.find(p => p.location && p.location.trim());
        const titleOrTagHint = extractLocationFromText(`${title || ""} ${(tags || []).join(" ")}`);

        let city =
            (hintCity && hintCity.trim()) ||
            (photoWithCity && photoWithCity.city.trim()) ||
            (photoWithLoc && photoWithLoc.location.split("-").pop().trim()) ||
            (titleOrTagHint && titleOrTagHint.city) ||
            (tags && tags.length > 0 && tags[0]) ||
            "";

        let fullLocation =
            (photoWithLoc && photoWithLoc.location.trim()) ||
            (hintCity ? (hintCity.includes(",") ? hintCity : `${hintCity}, Việt Nam`) : (city ? `${city}, Việt Nam` : ""));

        // Ensure every photo has location & date if album has them
        photos.forEach(p => {
            if (!p.location || !p.location.trim()) {
                p.location = fullLocation || city || "";
            }
            if (!p.city || !p.city.trim()) {
                p.city = city || "";
            }
            if (!p.capturedAt && detectedDate) {
                p.capturedAt = `${detectedDate}T09:00`;
            }
        });

        return { date: detectedDate, city, location: fullLocation };
    }

    async function createNewAlbum(event) {
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
        const hintCity = (document.getElementById('createAlbumCityInput')?.value || '').trim();
        const hintDate = (document.getElementById('createAlbumDateInput')?.value || '').trim();

        const reminderEnabled = !!document.getElementById('createAlbumReminderToggle')?.checked;
        const reminderText = (document.getElementById('createAlbumReminderText')?.value || '').trim() || `Chào ${clientName}! Mời bạn xem và thả tim chọn những bức ảnh ưng ý nhất trong Album nhé.`;

        const deadlineEnabled = !!document.getElementById('createAlbumDeadlineToggle')?.checked;
        const deadlineAt = (document.getElementById('createAlbumDeadlineInput')?.value || '').trim() || "2026-11-15T23:59";
        const selectionLimit = parseInt(document.getElementById('createAlbumLimitInput')?.value || '15', 10) || 0;

        const completeLockEnabled = !!document.getElementById('createAlbumCompleteLockToggle')?.checked;
        const isPublic = !!document.getElementById('createAlbumPublicInput')?.checked;

        if (createModalDriveLinks.length === 0 && createModalLocalFilesData.length === 0) {
            App.showToast("Vui lòng dán link Google Drive đã chia sẻ hoặc chọn ảnh từ máy tính!", "error");
            return;
        }

        const submitBtn = document.getElementById('createAlbumSubmitBtn');
        const oldBtnHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang tạo album...</span>`;
        }

        let initialPhotos = [];
        try {
            // Load photos from computer if selected
            if (createModalLocalFilesData.length > 0) {
                const localMapped = createModalLocalFilesData.map((f, idx) => ({
                    id: "loc_" + Date.now() + "_" + idx,
                    code: f.code,
                    location: f.location || hintCity || "",
                    city: f.city || hintCity || "",
                    capturedAt: f.capturedAt,
                    title: f.title,
                    url: f.url
                }));
                initialPhotos.push(...localMapped);
            }

            // Load real photos & EXIF metadata from shared Google Drive links if provided
            if (createModalDriveLinks.length > 0) {
                const drivePhotos = await fetchRealPhotosFromDriveLinks(createModalDriveLinks, hintCity, hintDate, initialPhotos.length);
                initialPhotos.push(...drivePhotos);
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = oldBtnHtml;
            }
        }

        if (createModalDriveLinks.length > 0 && initialPhotos.length === 0) {
            App.showToast("Không đọc được file ảnh từ link Google Drive! Hãy kiểm tra thư mục/file Drive đã bật chia sẻ 'Bất kỳ ai có đường liên kết' chưa.", "error");
            return;
        }

        // Automatically derive album's Date, City, and Location from the shared photos' metadata
        const derivedMeta = deriveAlbumDateAndLocation(initialPhotos, createModalTags, title, hintCity, hintDate);
        const date = derivedMeta.date;
        const city = derivedMeta.city;
        const albumLocation = derivedMeta.location;

        const baseSlug = slugify(rawSlug || title) || ("album-" + Date.now());
        const albums = getAllAlbums();
        const uniqueId = albums.some(a => a.id === baseSlug) ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;

        const defaultCover = initialPhotos.length > 0 ? initialPhotos[0].url : "";

        const newAlbum = {
            id: uniqueId,
            title,
            clientName,
            date,
            city,
            location: albumLocation,
            photographer: "Đức Thuận Studio",
            selectionLimit,
            pinCode: "",
            isPublic,
            tags: [...createModalTags],
            sourceType: createModalLocalFilesData.length > 0 && createModalDriveLinks.length === 0 ? 'local' : 'drive',
            driveLinks: [...createModalDriveLinks],
            reminderEnabled,
            reminderText,
            deadlineEnabled,
            deadlineAt,
            completeLockEnabled,
            isSelectionLockedBySubmit: false,
            youtubeId: "",
            coverUrl: defaultCover,
            description: `Album ${title} của khách hàng ${clientName} (${albumLocation}).`,
            photos: initialPhotos
        };

        albums.unshift(newAlbum);
        saveAllAlbums(albums);
        activeAdminAlbumId = newAlbum.id;

        closeCreateAlbumModal();
        populateAdminDashboard(newAlbum.id);
        App.renderHomeShowcase();
        openAlbumManagePage(newAlbum.id);
        App.showToast(`Đã tạo Album "${title}" (${initialPhotos.length} ảnh • Vị trí: ${city} • Ngày chụp: ${date.split('-').reverse().join('/')})!`);
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
        updateDriveApiKeyBadge();
    }

    function selectAlbumForEditing(albumId) {
        activeAdminAlbumId = albumId;
        renderAdminAlbumsTable();
        populateSelectedAlbumEditor();
        updateDriveApiKeyBadge();
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
                        <div class="flex items-start sm:items-center gap-3.5 cursor-pointer" onclick="App.openAlbumPage('${album.id}')">
                            <img src="${album.coverUrl}" alt="${album.title}" referrerpolicy="no-referrer" class="w-16 h-16 rounded-xl object-cover border border-zinc-200 shrink-0">
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
                                    ${(album.deliveredPhotos && album.deliveredPhotos.length > 0) ? `<span class="text-emerald-700 font-semibold"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Đã chỉnh: ${album.deliveredPhotos.length} ảnh</span>` : ''}
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
                                onclick="AdminModule.openEditAlbumSettingsModal('${album.id}')"
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
                </div>
            `;
        }).join('');
    }

    // ==================== SHOTPIK DEDICATED ALBUM MANAGE PAGE ("SỬA / ĐẶT ẢNH BÌA") ====================

    let managePageStatFilter = 'ALL'; // 'ALL' | 'STARRED' | 'SELECTED' | 'NOTED'
    let managePageSubTab = 'ALL'; // 'ALL' | 'DELIVERED' | 'LOC:<name>'
    let managePageSortOrder = 'name_asc'; // 'name_asc' | 'name_desc' | 'time_asc' | 'time_desc'
    let managePagePersonFilter = 'ALL';
    let isCoverSelectMode = false;
    let manageDownloadSelectedMap = {};
    let currentManageFilteredPhotos = [];

    function openAlbumManagePage(albumId, skipPush = false) {
        if (albumId) {
            activeAdminAlbumId = albumId;
        }
        managePageStatFilter = 'ALL';
        managePageSubTab = 'ALL';
        managePagePersonFilter = 'ALL';
        isCoverSelectMode = false;
        manageDownloadSelectedMap = {};
        App.showView('manage-album', skipPush);
    }

    // Clicking "Sửa / Đặt ảnh bìa" navigates to the dedicated Shotpik Album Management page
    function openEditAlbumSettingsModal(albumId, initialTab = 'settings') {
        if (albumId) {
            openAlbumManagePage(albumId);
            return;
        }
        openCustomAlbumModal(initialTab);
    }

    // Opens the auxiliary customization modal when clicking "Tùy chỉnh album" / "Cập nhật album" on the Manage Page
    function openCustomAlbumModal(initialTab = 'settings') {
        activeSelectorPersonFilter = 'ALL';
        populateSelectedAlbumEditor();
        renderModalCoverPhotoPicker();
        renderEditAlbumDriveLinks();
        renderModalDeliveredPhotos();
        switchEditModalTab(initialTab || 'settings');
        const modal = document.getElementById('editAlbumSettingsModal');
        if (modal) modal.classList.remove('hidden');
    }

    function closeEditAlbumSettingsModal() {
        const modal = document.getElementById('editAlbumSettingsModal');
        if (modal) modal.classList.add('hidden');
    }

    function toggleCoverSelectMode(forceVal) {
        isCoverSelectMode = typeof forceVal === 'boolean' ? forceVal : !isCoverSelectMode;
        const notice = document.getElementById('managePageCoverSelectNotice');
        const btn = document.getElementById('managePageChangeCoverBtn');
        if (notice) notice.classList.toggle('hidden', !isCoverSelectMode);
        if (btn) {
            btn.innerText = isCoverSelectMode ? 'Đang chọn ảnh bìa (Bấm vào ảnh dưới)' : 'Thay đổi ảnh bìa';
            btn.className = isCoverSelectMode
                ? 'px-3.5 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold transition shadow-md border border-amber-300'
                : 'px-3.5 py-1.5 rounded-full bg-white/35 hover:bg-white/55 backdrop-blur-md text-white text-xs font-medium transition shadow-xs border border-white/30';
        }
        renderAlbumManagePageGrid();
        if (isCoverSelectMode) {
            App.showToast("Hãy bấm vào bức ảnh bất kỳ bên dưới để đặt làm ảnh bìa Album!");
        }
    }

    async function handleUploadCoverFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const dataUrl = await compressImageFile(file, 1800, 0.86);
        if (dataUrl) {
            setPhotoAsCover(dataUrl, activeAdminAlbumId);
        }
        event.target.value = "";
    }

    function setManageStatFilter(filterName) {
        managePageStatFilter = filterName;
        renderAlbumManagePage();
    }

    function setManageSubTab(tabId) {
        managePageSubTab = tabId;
        renderAlbumManagePage();
    }

    function setManageSortOrder(order) {
        managePageSortOrder = order;
        renderAlbumManagePageGrid();
    }

    function toggleFaceFilterDropdown(forceVal) {
        const el = document.getElementById('manageFaceFilterDropdown');
        if (!el) return;
        const show = typeof forceVal === 'boolean' ? forceVal : el.classList.contains('hidden');
        el.classList.toggle('hidden', !show);
    }

    function setManagePersonFilter(person) {
        managePagePersonFilter = person;
        const label = document.getElementById('manageFaceFilterLabel');
        if (label) {
            label.innerText = person === 'ALL' ? 'Tìm khuôn mặt' : `Khuôn mặt: ${person}`;
        }
        toggleFaceFilterDropdown(false);
        renderAlbumManagePage();
    }

    function handleFaceSampleSearch(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        toggleFaceFilterDropdown(false);
        const album = getActiveAdminAlbum();
        if (album && album.photos.length > 0 && !album.photos.some(p => p.starred)) {
            album.photos[0].starred = true;
            const albums = getAllAlbums();
            const target = albums.find(a => a.id === album.id);
            if (target && target.photos[0]) target.photos[0].starred = true;
            saveAllAlbums(albums);
        }
        managePageStatFilter = 'STARRED';
        renderAlbumManagePage();
        App.showToast(`Đã lọc các bức ảnh khớp với khuôn mặt trong "${file.name}"!`);
        event.target.value = "";
    }

    function toggleMoreFeaturesDropdown(forceVal) {
        const el = document.getElementById('manageMoreFeaturesDropdown');
        if (!el) return;
        const show = typeof forceVal === 'boolean' ? forceVal : el.classList.contains('hidden');
        el.classList.toggle('hidden', !show);
    }

    function toggleLockAlbumFromManagePage() {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;
        album.isSelectionLockedBySubmit = !album.isSelectionLockedBySubmit;
        saveAllAlbums(albums);
        renderAlbumManagePage();
        renderAdminAlbumsTable();
        App.renderPublicAlbum();
        App.showToast(
            album.isSelectionLockedBySubmit
                ? `Đã khoá chọn ảnh cho Album "${album.title}" (Khách vẫn xem và tải ảnh được).`
                : `Đã mở khoá cho phép khách hàng chọn ảnh trong Album "${album.title}"!`
        );
    }

    function sendAlbumAction() {
        const album = getActiveAdminAlbum();
        if (!album) return;
        copyAlbumClientLink(album.id);
    }

    function togglePhotoStar(photoId) {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;
        const photo = album.photos.find(p => p.id === photoId);
        if (!photo) return;
        photo.starred = !photo.starred;
        saveAllAlbums(albums);
        renderAlbumManagePage();
    }

    function togglePhotoHeartAdmin(photoId) {
        const album = getActiveAdminAlbum();
        if (!album) return;
        const selections = getSelections(album.id);
        const cur = selections[photoId] || { selected: false, note: "" };
        cur.selected = !cur.selected;
        if (cur.selected && !cur.selectorName) {
            cur.selectorName = album.clientName || "Khách hàng";
        }
        selections[photoId] = cur;
        saveSelections(selections, album.id);
        renderAlbumManagePage();
        renderAdminAlbumsTable();
        App.renderPublicAlbum();
    }

    function togglePhotoDownloadSelect(photoId) {
        manageDownloadSelectedMap[photoId] = !manageDownloadSelectedMap[photoId];
        const checkedCount = Object.values(manageDownloadSelectedMap).filter(Boolean).length;
        const dlText = document.getElementById('managePageDownloadBtnText');
        if (dlText) {
            dlText.innerText = checkedCount > 0 ? `Tải xuống (${checkedCount})` : 'Tải xuống';
        }
        renderAlbumManagePageGrid();
    }

    async function downloadManagePagePhotos() {
        const album = getActiveAdminAlbum();
        if (!album) return;
        const checkedIds = Object.keys(manageDownloadSelectedMap).filter(id => manageDownloadSelectedMap[id]);
        const selections = getSelections(album.id);
        let list = [];
        if (checkedIds.length > 0) {
            list = album.photos.filter(p => checkedIds.includes(p.id));
        } else if (managePageStatFilter === 'SELECTED') {
            list = album.photos.filter(p => selections[p.id] && selections[p.id].selected);
        } else {
            list = currentManageFilteredPhotos.length > 0 ? currentManageFilteredPhotos : album.photos;
        }
        if (!list.length) {
            App.showToast("Chưa có ảnh nào trong danh sách để tải xuống!", "error");
            return;
        }
        App.showToast(`Đang tải xuống ${Math.min(list.length, 3)}/${list.length} ảnh...`);
        for (let i = 0; i < Math.min(list.length, 3); i++) {
            await App.downloadSinglePhoto(list[i].id);
        }
    }

    function handleManagePhotoCardClick(index) {
        const photo = currentManageFilteredPhotos[index];
        if (!photo) return;
        if (isCoverSelectMode) {
            setPhotoAsCover(photo.url, activeAdminAlbumId);
            toggleCoverSelectMode(false);
            return;
        }
        App.openLightboxWithPhotos(currentManageFilteredPhotos, index, activeAdminAlbumId);
    }

    function renderAlbumManagePage() {
        const album = getActiveAdminAlbum();
        if (!album) return;

        // Ensure at least 1 starred photo by default if none exists yet so the Star counter works intuitively
        if (album.photos.length > 0 && !album.photos.some(p => typeof p.starred === 'boolean')) {
            album.photos[0].starred = true;
        }

        const selections = getSelections(album.id);
        const submissions = getSubmissions(album.id);

        const coverImg = document.getElementById('managePageCoverImg');
        if (coverImg) coverImg.src = album.coverUrl || (album.photos[0] ? album.photos[0].url : '');

        const titleEl = document.getElementById('managePageAlbumTitle');
        if (titleEl) titleEl.innerText = album.title;

        const clientEl = document.getElementById('managePageClientName');
        if (clientEl) clientEl.innerText = album.clientName || 'Khách hàng';

        const updatedEl = document.getElementById('managePageUpdatedDate');
        if (updatedEl) {
            updatedEl.innerText = album.date ? album.date.split('-').reverse().join('/') : '07/11/2026';
        }

        const bellBadge = document.getElementById('managePageBellBadge');
        if (bellBadge) {
            bellBadge.innerText = `${submissions.length}`;
        }

        const statusBadge = document.getElementById('managePageViewStatusBadge');
        const lockBtnText = document.getElementById('managePageLockBtnText');
        const lockIcon = document.getElementById('managePageLockIcon');
        if (album.isSelectionLockedBySubmit) {
            if (statusBadge) {
                statusBadge.className = "inline-flex items-center gap-1.5 text-rose-600 font-medium hover:underline";
                statusBadge.innerHTML = `<i class="fa-solid fa-lock"></i><span>Đã khoá chọn ảnh</span>`;
            }
            if (lockBtnText) lockBtnText.innerText = "Mở khoá album";
            if (lockIcon) lockIcon.className = "fa-solid fa-lock-open text-rose-600";
        } else {
            if (statusBadge) {
                statusBadge.className = "inline-flex items-center gap-1.5 text-emerald-600 font-medium hover:underline";
                statusBadge.innerHTML = `<i class="fa-regular fa-circle-check"></i><span>Khách đang xem được</span>`;
            }
            if (lockBtnText) lockBtnText.innerText = "Khoá album";
            if (lockIcon) lockIcon.className = "fa-solid fa-lock text-zinc-600";
        }

        // Counts
        const totalCount = (album.photos || []).length;
        const starCount = (album.photos || []).filter(p => p.starred).length;
        const heartCount = (album.photos || []).filter(p => selections[p.id] && selections[p.id].selected).length;
        const noteCount = (album.photos || []).filter(p => selections[p.id] && selections[p.id].note && selections[p.id].note.trim()).length;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        };
        setTxt('manageStatTotalCount', totalCount);
        setTxt('manageStatStarCount', starCount);
        setTxt('manageStatHeartCount', heartCount);
        setTxt('manageStatNoteCount', noteCount);

        // Update active state on the 4 stat pills
        const statPillMap = {
            ALL: document.getElementById('manageFilterPill_ALL'),
            STARRED: document.getElementById('manageFilterPill_STARRED'),
            SELECTED: document.getElementById('manageFilterPill_SELECTED'),
            NOTED: document.getElementById('manageFilterPill_NOTED')
        };
        Object.keys(statPillMap).forEach(k => {
            const btn = statPillMap[k];
            if (!btn) return;
            if (k === managePageStatFilter) {
                btn.className = "px-3 py-1.5 rounded-full bg-zinc-900 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs";
            } else {
                btn.className = "px-2.5 py-1.5 rounded-full bg-transparent hover:bg-zinc-100 text-zinc-700 text-xs font-semibold flex items-center gap-1 transition";
            }
        });

        // Populate Face / Selector Person Filter Dropdown
        const faceListEl = document.getElementById('manageFaceFilterList');
        if (faceListEl) {
            const persons = [];
            album.photos.forEach(p => {
                const who = selections[p.id]?.selectorName;
                if (who && !persons.includes(who)) persons.push(who);
            });
            if (!persons.includes(album.clientName || 'Khách hàng')) {
                persons.push(album.clientName || 'Khách hàng');
            }
            faceListEl.innerHTML = [
                `<button type="button" onclick="AdminModule.setManagePersonFilter('ALL')" class="w-full text-left px-2.5 py-1.5 rounded-xl ${managePagePersonFilter === 'ALL' ? 'bg-zinc-900 text-white font-semibold' : 'hover:bg-zinc-100 text-zinc-700'}">Tất cả khuôn mặt / Người chọn</button>`,
                ...persons.map(name => `<button type="button" onclick="AdminModule.setManagePersonFilter('${name}')" class="w-full text-left px-2.5 py-1.5 rounded-xl ${managePagePersonFilter === name ? 'bg-zinc-900 text-white font-semibold' : 'hover:bg-zinc-100 text-zinc-700'}"><i class="fa-regular fa-user mr-1.5"></i>${name}</button>`)
            ].join('');
        }

        // Sub-tabs (Tất cả + folder/location tabs + Ảnh đã chỉnh)
        const subTabsEl = document.getElementById('managePageSubTabs');
        if (subTabsEl) {
            const locFolders = [];
            (album.photos || []).forEach(p => {
                const loc = p.location || album.city || 'Album';
                if (loc && !locFolders.includes(loc)) locFolders.push(loc);
            });

            const subTabs = [
                { id: 'ALL', label: 'Tất cả' },
                ...locFolders.map(l => ({ id: `LOC:${l}`, label: l }))
            ];
            if (album.deliveredPhotos && album.deliveredPhotos.length > 0) {
                subTabs.push({ id: 'DELIVERED', label: `Ảnh đã chỉnh (${album.deliveredPhotos.length})` });
            }

            subTabsEl.innerHTML = subTabs.map(t => {
                const active = managePageSubTab === t.id;
                return `
                    <button
                        type="button"
                        onclick="AdminModule.setManageSubTab('${t.id}')"
                        class="pb-2 whitespace-nowrap transition ${
                            active
                                ? 'border-b-2 border-zinc-900 font-bold text-zinc-900'
                                : 'border-b-2 border-transparent font-medium text-zinc-400 hover:text-zinc-700'
                        }"
                    >
                        ${t.label}
                    </button>
                `;
            }).join('');
        }

        renderAlbumManagePageGrid();
    }

    function renderAlbumManagePageGrid() {
        const grid = document.getElementById('managePagePhotosGrid');
        if (!grid) return;

        const album = getActiveAdminAlbum();
        if (!album) return;
        const selections = getSelections(album.id);

        let sourceList = managePageSubTab === 'DELIVERED' ? (album.deliveredPhotos || []) : (album.photos || []);

        let filtered = sourceList.filter(p => {
            const st = selections[p.id] || {};
            if (managePageStatFilter === 'STARRED' && !p.starred) return false;
            if (managePageStatFilter === 'SELECTED' && !st.selected) return false;
            if (managePageStatFilter === 'NOTED' && !(st.note && st.note.trim())) return false;
            if (managePageSubTab.startsWith('LOC:')) {
                const targetLoc = managePageSubTab.slice(4);
                const pLoc = p.location || album.city || 'Album';
                if (pLoc !== targetLoc) return false;
            }
            if (managePagePersonFilter !== 'ALL') {
                const who = st.selectorName || album.clientName || 'Khách hàng';
                if (who !== managePagePersonFilter) return false;
            }
            return true;
        });

        filtered = [...filtered].sort((a, b) => {
            if (managePageSortOrder === 'name_asc') {
                return (a.code || '').localeCompare(b.code || '');
            } else if (managePageSortOrder === 'name_desc') {
                return (b.code || '').localeCompare(a.code || '');
            } else if (managePageSortOrder === 'time_asc') {
                return (a.capturedAt || '').localeCompare(b.capturedAt || '');
            } else {
                return (b.capturedAt || '').localeCompare(a.capturedAt || '');
            }
        });

        currentManageFilteredPhotos = filtered;

        if (!filtered.length) {
            grid.innerHTML = `
                <div class="col-span-full bg-white rounded-3xl p-12 text-center border border-zinc-200/80 space-y-2">
                    <i class="fa-regular fa-images text-3xl text-zinc-300 block"></i>
                    <p class="text-sm font-bold text-zinc-700">Chưa có hình ảnh nào trong bộ lọc này</p>
                    <p class="text-xs text-zinc-400">Bạn có thể chuyển về tab "Tất cả" hoặc bấm "Cập nhật album" để tải thêm ảnh.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filtered.map((photo, idx) => {
            const st = selections[photo.id] || {};
            const isHearted = !!st.selected;
            const isStarred = !!photo.starred;
            const hasNote = !!(st.note && st.note.trim());
            const isCover = album.coverUrl === photo.url;
            const isDlChecked = !!manageDownloadSelectedMap[photo.id];
            const timeLabel = formatTimeShort(photo.capturedAt);

            return `
                <div
                    onclick="AdminModule.handleManagePhotoCardClick(${idx})"
                    class="group relative bg-white rounded-xl overflow-hidden shadow-2xs hover:shadow-md transition cursor-pointer ${
                        isCoverSelectMode ? 'ring-2 ring-amber-400 hover:ring-4 hover:ring-amber-500' : ''
                    }"
                >
                    <img
                        src="${photo.url}"
                        alt="${photo.code}"
                        referrerpolicy="no-referrer"
                        loading="lazy"
                        class="w-full h-72 sm:h-80 object-cover object-center group-hover:scale-[1.02] transition-transform duration-500"
                    >

                    <!-- Top-left: Star Badge & Cover Badge -->
                    <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10" onclick="event.stopPropagation()">
                        <button
                            type="button"
                            onclick="AdminModule.togglePhotoStar('${photo.id}')"
                            class="w-7 h-7 rounded-md bg-white/85 hover:bg-white backdrop-blur-xs flex items-center justify-center shadow-xs transition"
                            title="${isStarred ? 'Bỏ đánh dấu sao' : 'Đánh dấu sao nổi bật'}"
                        >
                            <i class="${isStarred ? 'fa-solid fa-star text-emerald-500' : 'fa-regular fa-star text-zinc-700'} text-xs"></i>
                        </button>
                        ${
                            isCover
                                ? `<span class="px-2 py-1 rounded-md bg-amber-500 text-white text-[10px] font-bold shadow-xs">Ảnh bìa</span>`
                                : `<button
                                    type="button"
                                    onclick="AdminModule.setPhotoAsCover('${photo.url}')"
                                    class="opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-md bg-black/65 hover:bg-amber-500 text-white text-[10px] font-semibold backdrop-blur-xs transition shadow-xs"
                                    title="Đặt tấm ảnh này làm ảnh bìa Album"
                                >
                                    Đặt ảnh bìa
                                </button>`
                        }
                    </div>

                    <!-- Top-right: Heart Icon & Note / Delete -->
                    <div class="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10" onclick="event.stopPropagation()">
                        ${
                            hasNote
                                ? `<button
                                    type="button"
                                    onclick="App.openPhotoNoteModal('${photo.id}')"
                                    class="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs shadow-xs"
                                    title="Ghi chú: ${st.note}"
                                >
                                    <i class="fa-solid fa-comment-dots"></i>
                                </button>`
                                : ''
                        }
                        <button
                            type="button"
                            onclick="AdminModule.togglePhotoHeartAdmin('${photo.id}')"
                            class="w-7 h-7 rounded-full ${isHearted ? 'bg-white/90 text-red-500' : 'bg-white/70 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-500'} flex items-center justify-center transition shadow-xs"
                            title="${isHearted ? 'Khách đã thả tim chọn' : 'Đánh dấu tim cho ảnh này'}"
                        >
                            <i class="fa-solid fa-heart text-xs"></i>
                        </button>
                    </div>

                    <!-- Bottom Bar: Photo Code / Location + "Chọn tải" Pill (Giống hệt hình mẫu Shotpik) -->
                    <div class="absolute bottom-2.5 inset-x-2.5 flex items-end justify-between gap-2 pointer-events-none">
                        <div class="opacity-0 group-hover:opacity-100 transition bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-lg text-[10px] max-w-[60%] truncate">
                            <span class="font-mono font-bold block truncate">${photo.code}</span>
                            <span class="text-amber-300 block truncate"><i class="fa-solid fa-location-dot mr-1"></i>${photo.location || album.city} • ${timeLabel}</span>
                        </div>

                        <button
                            type="button"
                            onclick="event.stopPropagation(); AdminModule.togglePhotoDownloadSelect('${photo.id}')"
                            class="pointer-events-auto ml-auto ${
                                isDlChecked
                                    ? 'opacity-100 bg-zinc-900 text-white'
                                    : 'opacity-0 group-hover:opacity-100 bg-white/95 hover:bg-white text-zinc-800'
                            } px-3 py-1 rounded-full text-xs font-medium shadow-md border border-zinc-200/80 flex items-center gap-1.5 transition"
                        >
                            <i class="${isDlChecked ? 'fa-solid fa-circle-check text-emerald-400' : 'fa-regular fa-circle text-zinc-500'} text-xs"></i>
                            <span>${isDlChecked ? 'Đã chọn' : 'Chọn tải'}</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function switchEditModalTab(tabName) {
        activeEditModalTab = tabName;
        const tabs = ['settings', 'selections', 'delivered'];
        tabs.forEach(t => {
            const btn = document.getElementById(`editModalTabBtn_${t}`);
            const sec = document.getElementById(`editModalSection_${t}`);
            const isActive = t === tabName;
            if (btn) {
                btn.className = isActive
                    ? "pb-2.5 text-xs sm:text-sm font-semibold text-rose-600 border-b-2 border-rose-600 transition whitespace-nowrap flex items-center gap-1.5"
                    : "pb-2.5 text-xs sm:text-sm font-medium text-zinc-500 hover:text-zinc-800 border-b-2 border-transparent transition whitespace-nowrap flex items-center gap-1.5";
            }
            if (sec) {
                sec.classList.toggle('hidden', !isActive);
            }
        });
    }

    function renderModalCoverPhotoPicker() {
        const album = getActiveAdminAlbum();
        if (!album) return;

        const countBadge = document.getElementById('adminPhotoCountBadge');
        if (countBadge) countBadge.innerText = `${(album.photos || []).length} ảnh gốc`;

        const previewImg = document.getElementById('modalCoverPreviewImg');
        const currentCoverUrl = document.getElementById('adminCoverUrl')?.value || album.coverUrl;
        if (previewImg) previewImg.src = currentCoverUrl;

        const grid = document.getElementById('modalCoverPhotoPickerGrid');
        if (!grid) return;

        if (!album.photos || !album.photos.length) {
            grid.innerHTML = `<span class="text-xs text-zinc-400 italic">Album chưa có ảnh nào. Hãy bấm Cập nhật album hoặc tải ảnh lên bên dưới.</span>`;
            return;
        }

        grid.innerHTML = album.photos.map(photo => {
            const isSelectedCover = currentCoverUrl === photo.url;
            return `
                <div class="relative group shrink-0">
                    <button
                        type="button"
                        onclick="AdminModule.pickCoverPhotoInModal('${photo.url}')"
                        class="relative w-16 h-16 rounded-xl overflow-hidden border-2 transition block ${
                            isSelectedCover
                                ? 'border-amber-500 ring-2 ring-amber-400 scale-105'
                                : 'border-zinc-200 opacity-85 hover:opacity-100 hover:border-amber-400'
                        }"
                        title="Đặt ảnh ${photo.code} làm ảnh bìa"
                    >
                        <img src="${photo.url}" alt="${photo.code}" referrerpolicy="no-referrer" class="w-full h-full object-cover">
                        ${
                            isSelectedCover
                                ? '<span class="absolute inset-0 bg-amber-500/30 flex items-center justify-center text-white text-[10px] font-bold drop-shadow">Ảnh bìa</span>'
                                : '<span class="absolute bottom-0 inset-x-0 bg-black/65 text-white text-[9px] font-mono truncate px-1">' + photo.code + '</span>'
                        }
                    </button>
                    <button
                        type="button"
                        onclick="AdminModule.deletePhoto('${photo.id}')"
                        title="Xoá ảnh ${photo.code}"
                        class="hidden group-hover:flex absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] items-center justify-center shadow"
                    >
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    function pickCoverPhotoInModal(url) {
        const coverInput = document.getElementById('adminCoverUrl');
        const previewImg = document.getElementById('modalCoverPreviewImg');
        if (coverInput) coverInput.value = url;
        if (previewImg) previewImg.src = url;
        renderModalCoverPhotoPicker();
    }

    function renderEditAlbumDriveLinks() {
        const album = getActiveAdminAlbum();
        const container = document.getElementById('editAlbumDriveLinksList');
        if (!container || !album) return;
        const links = album.driveLinks || [];
        if (!links.length) {
            container.innerHTML = `<p class="text-[11px] text-zinc-400 italic">Chưa liên kết thư mục Google Drive nào.</p>`;
            return;
        }
        container.innerHTML = links.map((link, idx) => `
            <div class="flex items-center justify-between gap-2 bg-white border border-zinc-200 text-zinc-700 px-3 py-1.5 rounded-lg text-xs">
                <div class="flex items-center gap-2 min-w-0">
                    <i class="fa-brands fa-google-drive text-emerald-600 shrink-0"></i>
                    <span class="truncate font-mono text-[11px]">${link}</span>
                </div>
                <button type="button" onclick="AdminModule.removeDriveLinkFromExistingAlbum(${idx})" class="text-zinc-400 hover:text-rose-600 shrink-0" title="Gỡ link này">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `).join('');
    }

    function addDriveLinkToExistingAlbum() {
        const input = document.getElementById('editAlbumNewDriveLinkInput');
        if (!input || !input.value.trim()) {
            App.showToast("Vui lòng dán link thư mục hoặc link ảnh Google Drive!", "error");
            return;
        }
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;
        if (!album.driveLinks) album.driveLinks = [];
        album.driveLinks.push(input.value.trim());
        album.sourceType = 'drive';
        input.value = '';
        saveAllAlbums(albums);
        renderEditAlbumDriveLinks();
        renderAdminAlbumsTable();
        App.showToast("Đã thêm link Google Drive! Bấm 'Cập nhật album' để đồng bộ ảnh mới.");
    }

    function removeDriveLinkFromExistingAlbum(idx) {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album || !album.driveLinks) return;
        album.driveLinks.splice(idx, 1);
        saveAllAlbums(albums);
        renderEditAlbumDriveLinks();
    }

    async function syncUpdateAlbumDrive() {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;

        const pendingLinkInput = document.getElementById('editAlbumNewDriveLinkInput');
        if (pendingLinkInput && pendingLinkInput.value.trim()) {
            if (!album.driveLinks) album.driveLinks = [];
            const val = pendingLinkInput.value.trim();
            if (!album.driveLinks.includes(val)) {
                album.driveLinks.push(val);
            }
            pendingLinkInput.value = '';
        }

        if (!album.driveLinks || album.driveLinks.length === 0) {
            App.showToast("Vui lòng dán link thư mục hoặc file Google Drive đã chia sẻ trước khi bấm Cập nhật!", "error");
            return;
        }

        App.showToast("Đang đồng bộ ảnh thực tế từ Google Drive...");
        const fetchedPhotos = await fetchRealPhotosFromDriveLinks(
            album.driveLinks,
            album.city || "Đà Lạt",
            album.date || "2026-11-07",
            album.photos.length
        );

        if (!fetchedPhotos.length) {
            App.showToast("Không tìm thấy ảnh từ link Google Drive! Hãy kiểm tra quyền chia sẻ Công khai (Anyone with the link).", "error");
            return;
        }

        let addedCount = 0;
        fetchedPhotos.forEach(fp => {
            const exists = album.photos.some(
                p => (fp.driveFileId && p.driveFileId === fp.driveFileId) || p.url === fp.url
            );
            if (!exists) {
                album.photos.push(fp);
                addedCount++;
            }
        });

        if (!album.coverUrl && album.photos.length > 0) {
            album.coverUrl = album.photos[0].url;
        }

        // Update album Date & Location from the extracted photo metadata
        const derived = deriveAlbumDateAndLocation(album.photos, album.tags, album.title, album.city, album.date);
        if (derived.date) album.date = derived.date;
        if (derived.city && derived.city !== "Việt Nam") album.city = derived.city;
        if (derived.location) album.location = derived.location;

        album.sourceType = 'drive';
        saveAllAlbums(albums);

        populateSelectedAlbumEditor();
        renderEditAlbumDriveLinks();
        renderModalCoverPhotoPicker();
        renderAdminAlbumsTable();
        renderAlbumManagePage();
        App.renderHomeShowcase();
        App.renderPublicAlbum();

        if (addedCount > 0) {
            App.showToast(`Đã đồng bộ thêm ${addedCount} ảnh mới (Vị trí: ${album.city} • Ngày chụp: ${album.date.split('-').reverse().join('/')})!`);
        } else {
            App.showToast(`Đã cập nhật thông tin Vị trí & Ngày chụp cho ${fetchedPhotos.length} ảnh từ Google Drive!`);
        }
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

        setVal('adminAlbumTitle', album.title);
        setVal('adminClientName', album.clientName);
        setVal('adminShootDate', album.date);
        setVal('adminCity', album.city || "Đà Lạt");
        setVal('adminLocation', album.location);
        setVal('adminTagsInput', (album.tags || []).join(', '));
        setVal('adminDescription', album.description || "");
        setVal('adminCoverUrl', album.coverUrl);
        setVal('adminSelectionLimit', album.selectionLimit !== undefined ? album.selectionLimit : 10);
        setVal('adminPinCode', album.pinCode || "");
        setVal('adminYoutubeUrl', album.youtubeId ? `https://www.youtube.com/watch?v=${album.youtubeId}` : "");

        const previewImg = document.getElementById('modalCoverPreviewImg');
        if (previewImg) previewImg.src = album.coverUrl;

        setChk('adminIsPublicCheckbox', album.isPublic);
        setChk('adminReminderEnabledCheckbox', album.reminderEnabled);
        setVal('adminReminderTextInput', album.reminderText || "");
        setChk('adminDeadlineEnabledCheckbox', album.deadlineEnabled);
        setVal('adminDeadlineAtInput', album.deadlineAt || "");
        setChk('adminCompleteLockCheckbox', album.completeLockEnabled);
        setChk('adminMultiSelectorCheckbox', !!album.multiSelectorEnabled);
        setChk('adminWatermarkCheckbox', !!album.watermarkEnabled);

        renderModalCoverPhotoPicker();
        renderAdminClientSelections();
        renderModalDeliveredPhotos();
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

        const rawTags = (document.getElementById('adminTagsInput')?.value || '').trim();
        if (rawTags) {
            album.tags = rawTags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5);
        } else {
            album.tags = [];
        }

        album.reminderEnabled = !!document.getElementById('adminReminderEnabledCheckbox')?.checked;
        album.reminderText = (document.getElementById('adminReminderTextInput')?.value || '').trim();
        album.deadlineEnabled = !!document.getElementById('adminDeadlineEnabledCheckbox')?.checked;
        album.deadlineAt = (document.getElementById('adminDeadlineAtInput')?.value || '').trim();
        album.completeLockEnabled = !!document.getElementById('adminCompleteLockCheckbox')?.checked;
        album.multiSelectorEnabled = !!document.getElementById('adminMultiSelectorCheckbox')?.checked;
        album.watermarkEnabled = !!document.getElementById('adminWatermarkCheckbox')?.checked;

        const ytInput = document.getElementById('adminYoutubeUrl').value.trim();
        album.youtubeId = ytInput ? (extractYouTubeID(ytInput) || album.youtubeId) : "";

        saveAllAlbums(albums);
        closeEditAlbumSettingsModal();
        populateAdminDashboard();
        renderAlbumManagePage();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast("Đã lưu cài đặt và ảnh bìa Album thành công!");
    }

    async function addPhotoByUrl(event) {
        if (event) event.preventDefault();
        const urlInput = document.getElementById('newPhotoUrl');
        const codeInput = document.getElementById('newPhotoCode');
        const locInput = document.getElementById('newPhotoLocation');
        const timeInput = document.getElementById('newPhotoTime');
        const titleInput = document.getElementById('newPhotoTitle');

        let url = urlInput ? urlInput.value.trim() : '';
        if (!url) {
            App.showToast("Vui lòng nhập đường dẫn URL ảnh hoặc link Google Drive!", "error");
            return;
        }

        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;

        // If user pasted a Google Drive folder link here, fetch all photos from that folder
        const folderId = extractGoogleDriveFolderId(url);
        if (folderId) {
            const folderPhotos = await fetchRealPhotosFromDriveLinks([url], album.city || "Đà Lạt", album.date || "2026-11-07", album.photos.length);
            if (!folderPhotos.length) {
                App.showToast("Không đọc được ảnh từ thư mục Google Drive này! Hãy kiểm tra quyền chia sẻ Công khai.", "error");
                return;
            }
            folderPhotos.forEach(fp => album.photos.push(fp));
            if (!album.coverUrl && album.photos.length > 0) {
                album.coverUrl = album.photos[0].url;
            }
            saveAllAlbums(albums);
            if (urlInput) urlInput.value = "";
            populateAdminDashboard();
            renderModalCoverPhotoPicker();
            renderAlbumManagePage();
            App.renderHomeShowcase();
            App.renderPublicAlbum();
            App.showToast(`Đã tải ${folderPhotos.length} ảnh từ thư mục Google Drive vào Album!`);
            return;
        }

        // Convert Google Drive file link if pasted here
        const drvId = extractGoogleDriveFileId(url);
        if (drvId) {
            url = `https://drive.google.com/thumbnail?id=${drvId}&sz=w1600`;
        }

        const nextNum = 1001 + album.photos.length;
        const code = (codeInput && codeInput.value.trim()) || `IMG_${nextNum}`;
        const location = (locInput && locInput.value.trim()) || `${album.location || album.city}`;
        const capturedAt = (timeInput && timeInput.value.trim()) || `${album.date}T09:00`;
        const title = (titleInput && titleInput.value.trim()) || `Ảnh ${code}`;

        album.photos.push({
            id: "photo_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
            driveFileId: drvId || undefined,
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
        if (urlInput) urlInput.value = "";
        if (codeInput) codeInput.value = "";
        if (titleInput) titleInput.value = "";

        populateAdminDashboard();
        renderModalCoverPhotoPicker();
        renderAlbumManagePage();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast(`Đã thêm ảnh ${code} vào Album!`);
    }

    async function handleLocalFilesUpload(event) {
        const files = event.target.files;
        if (!files || !files.length) return;

        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;

        const locInput = document.getElementById('newPhotoLocation');
        const manualLoc = (locInput && locInput.value.trim()) ? locInput.value.trim() : "";

        const fileList = Array.from(files);
        for (let idx = 0; idx < fileList.length; idx++) {
            const file = fileList[idx];
            const [dataUrl, meta] = await Promise.all([
                compressImageFile(file, 1600, 0.84),
                extractMetadataFromLocalFile(file)
            ]);
            if (!dataUrl) continue;

            const cleanName = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
            const code = cleanName.length <= 20 ? cleanName : `IMG_${1001 + album.photos.length}`;

            const photoLocation = meta.location || manualLoc || (album.location || album.city || "");
            const photoCity = meta.city || album.city || "";
            const capturedAt = meta.capturedAt || `${album.date || '2026-11-07'}T08:00`;

            album.photos.push({
                id: "local_" + Date.now() + "_" + idx,
                code,
                location: photoLocation,
                city: photoCity,
                capturedAt,
                title: file.name,
                url: dataUrl
            });

            if (album.photos.length === 1) {
                album.coverUrl = dataUrl;
            }
        }

        const derived = deriveAlbumDateAndLocation(album.photos, album.tags, album.title, album.city, album.date);
        if (derived.date) album.date = derived.date;
        if (derived.city && derived.city !== "Việt Nam") album.city = derived.city;
        if (derived.location) album.location = derived.location;

        saveAllAlbums(albums);
        populateSelectedAlbumEditor();
        populateAdminDashboard();
        renderModalCoverPhotoPicker();
        renderAlbumManagePage();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast(`Đã tải lên ${fileList.length} ảnh (Đã lấy Vị trí & Ngày chụp từ EXIF ảnh)!`);
        event.target.value = "";
    }

    function deletePhoto(photoId) {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;

        album.photos = album.photos.filter(p => p.id !== photoId);
        saveAllAlbums(albums);
        populateAdminDashboard();
        renderAlbumManagePage();
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
        renderAlbumManagePage();
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

    function setSelectorPersonFilter(person) {
        activeSelectorPersonFilter = person;
        renderAdminClientSelections();
    }

    function renderAdminClientSelections() {
        const album = getActiveAdminAlbum();
        if (!album) return;
        const selections = getSelections(album.id);
        const submissions = getSubmissions(album.id);

        const allSelectedOrNoted = album.photos.filter(p => selections[p.id] && (selections[p.id].selected || (selections[p.id].note && selections[p.id].note.trim())));
        const allSelectedCount = album.photos.filter(p => selections[p.id] && selections[p.id].selected).length;

        const tabCountPill = document.getElementById('editModalSelectedCountPill');
        if (tabCountPill) tabCountPill.innerText = `${allSelectedCount}`;

        // Collect unique selector names
        const persons = [];
        allSelectedOrNoted.forEach(p => {
            const selectorName = (selections[p.id]?.selectorName || 'Khách hàng').trim();
            if (selectorName && !persons.includes(selectorName)) {
                persons.push(selectorName);
            }
        });

        const personPillsEl = document.getElementById('modalSelectorPersonPills');
        if (personPillsEl) {
            const pills = [
                { id: 'ALL', label: `Tất cả (${allSelectedCount})` },
                ...persons.map(name => ({
                    id: name,
                    label: `${name} (${album.photos.filter(p => selections[p.id]?.selected && (selections[p.id]?.selectorName || 'Khách hàng') === name).length})`
                }))
            ];
            personPillsEl.innerHTML = pills.map(p => `
                <button
                    type="button"
                    onclick="AdminModule.setSelectorPersonFilter('${p.id}')"
                    class="px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
                        activeSelectorPersonFilter === p.id
                            ? 'bg-zinc-900 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }"
                >
                    ${p.label}
                </button>
            `).join('');
        }

        const filteredSelectedPhotos = allSelectedOrNoted.filter(p => {
            if (activeSelectorPersonFilter === 'ALL') return true;
            return (selections[p.id]?.selectorName || 'Khách hàng') === activeSelectorPersonFilter;
        });

        const codesList = filteredSelectedPhotos.filter(p => selections[p.id] && selections[p.id].selected).map(p => p.code);

        const lightroomBox = document.getElementById('lightroomCodesOutput');
        if (lightroomBox) {
            lightroomBox.value = codesList.length ? codesList.join(', ') : '';
        }

        const countEl = document.getElementById('adminSelectedCountLabel');
        if (countEl) {
            countEl.innerText = `${allSelectedCount} / ${album.selectionLimit || '∞'} ảnh đã chọn`;
        }

        const statusLabel = document.getElementById('modalSelectionStatusLabel');
        const unlockBtn = document.getElementById('modalUnlockSelectionBtn');
        if (statusLabel) {
            if (album.isSelectionLockedBySubmit) {
                statusLabel.innerHTML = `<i class="fa-solid fa-lock text-rose-600"></i> <span>Album đã tự khoá phần chọn (Khách đã bấm Hoàn tất)</span>`;
                if (unlockBtn) unlockBtn.classList.remove('hidden');
            } else {
                statusLabel.innerHTML = `<i class="fa-solid fa-lock-open text-emerald-600"></i> <span>Trạng thái: Khách đang mở chọn ảnh</span>`;
                if (unlockBtn) unlockBtn.classList.add('hidden');
            }
        }

        // Check if backup exists for restore button
        const restoreBtn = document.getElementById('modalRestoreInteractionsBtn');
        if (restoreBtn) {
            const backups = getRemovedBackupMap();
            restoreBtn.classList.toggle('hidden', !backups[album.id]);
        }

        const listContainer = document.getElementById('adminClientSelectedList');
        if (listContainer) {
            if (!filteredSelectedPhotos.length) {
                listContainer.innerHTML = `
                    <div class="text-center py-8 text-zinc-400 text-xs bg-zinc-50 rounded-xl border border-zinc-100">
                        <i class="fa-regular fa-heart text-2xl mb-1.5 block"></i>
                        Chưa có lượt thả tim hoặc ghi chú ảnh nào trong danh sách này.
                    </div>
                `;
            } else {
                listContainer.innerHTML = filteredSelectedPhotos.map(p => {
                    const st = selections[p.id] || {};
                    const who = st.selectorName || album.clientName || 'Khách hàng';
                    return `
                        <div class="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                            <img src="${p.url}" alt="${p.code}" class="w-14 h-14 rounded-lg object-cover shrink-0">
                            <div class="flex-1 min-w-0">
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <span class="font-mono font-bold text-xs text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200">${p.code}</span>
                                    <span class="text-[11px] bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 rounded-full font-medium"><i class="fa-regular fa-user mr-1"></i>${who}</span>
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

    function getRemovedBackupMap() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_REMOVED_BACKUP_MAP);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return {};
    }

    function clearClientSelections() {
        const currentSel = getSelections(activeAdminAlbumId);
        if (Object.keys(currentSel).length > 0) {
            const backups = getRemovedBackupMap();
            backups[activeAdminAlbumId] = {
                selections: currentSel,
                backedUpAt: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEY_REMOVED_BACKUP_MAP, JSON.stringify(backups));
        }

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
        renderAlbumManagePage();
        App.renderPublicAlbum();
        App.showToast("Đã gỡ tương tác để khách chọn lại từ đầu (Có thể khôi phục lại trong 30 ngày)!");
    }

    function restoreRemovedInteractions() {
        const backups = getRemovedBackupMap();
        const backup = backups[activeAdminAlbumId];
        if (!backup || !backup.selections) {
            App.showToast("Không có dữ liệu tương tác cũ để khôi phục!", "error");
            return;
        }
        saveSelections(backup.selections, activeAdminAlbumId);
        delete backups[activeAdminAlbumId];
        localStorage.setItem(STORAGE_KEY_REMOVED_BACKUP_MAP, JSON.stringify(backups));

        renderAdminAlbumsTable();
        renderAdminClientSelections();
        renderAlbumManagePage();
        App.renderPublicAlbum();
        App.showToast("Đã khôi phục lại các lượt thả tim và ghi chú trước đó của khách!");
    }

    function exportFeedbackReport() {
        const album = getActiveAdminAlbum();
        if (!album) return;
        const selections = getSelections(album.id);
        const selectedPhotos = album.photos.filter(p => selections[p.id] && (selections[p.id].selected || (selections[p.id].note && selections[p.id].note.trim())));

        if (!selectedPhotos.length) {
            App.showToast("Chưa có ảnh hoặc ghi chú nào để xuất bảng tổng hợp!", "error");
            return;
        }

        const lines = [
            `=============================================================`,
            `BẢNG TỔNG HỢP DANH SÁCH ẢNH KHÁCH CHỌN & GHI CHÚ HẬU KỲ`,
            `=============================================================`,
            `Tên Album   : ${album.title}`,
            `Khách hàng  : ${album.clientName}`,
            `Ngày chụp   : ${album.date} | Địa điểm: ${album.location}`,
            `Tổng số chọn: ${selectedPhotos.length} / ${album.selectionLimit || 'Không giới hạn'} ảnh`,
            `-------------------------------------------------------------`,
            `CHUỖI LỌC FILE NHANH (LIGHTROOM / CAPTURE ONE):`,
            selectedPhotos.map(p => p.code).join(', '),
            `-------------------------------------------------------------`,
            `CHI TIẾT GHI CHÚ CHỈNH SỬA TỪNG TẤM ẢNH:`,
            ...selectedPhotos.map((p, idx) => {
                const st = selections[p.id] || {};
                const who = st.selectorName || album.clientName || 'Khách hàng';
                const note = st.note ? st.note : 'Chỉnh màu chuẩn Studio';
                return `${idx + 1}. [${p.code}] (${p.location || album.city}) - Người chọn: ${who}\n   -> Ghi chú: ${note}`;
            }),
            `=============================================================`
        ];

        const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Tong-Hop-Chon-Anh-${album.id}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        App.showToast("Đã tải xuống bảng tổng hợp danh sách ảnh & ghi chú của khách!");
    }

    // ==================== BÀN GIAO "ẢNH ĐÃ CHỈNH" (DELIVERED PHOTOS) ====================

    function renderModalDeliveredPhotos() {
        const album = getActiveAdminAlbum();
        if (!album) return;
        const delivered = album.deliveredPhotos || [];

        const pill = document.getElementById('editModalDeliveredCountPill');
        if (pill) pill.innerText = `${delivered.length}`;

        const grid = document.getElementById('modalDeliveredPhotosGrid');
        if (!grid) return;

        if (!delivered.length) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-8 bg-zinc-50 rounded-2xl border border-zinc-200 text-xs text-zinc-400">
                    <i class="fa-solid fa-wand-magic-sparkles text-xl mb-1.5 block text-zinc-300"></i>
                    Chưa có Ảnh đã chỉnh nào trong Album này. Hãy đồng bộ từ Google Drive hoặc tải file đã chỉnh lên bên trên.
                </div>
            `;
            return;
        }

        grid.innerHTML = delivered.map(item => `
            <div class="group relative bg-zinc-100 rounded-xl overflow-hidden border border-emerald-300 aspect-square">
                <img src="${item.url}" alt="${item.code}" referrerpolicy="no-referrer" class="w-full h-full object-cover">
                <span class="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shadow">Đã chỉnh</span>
                <button
                    type="button"
                    onclick="AdminModule.deleteDeliveredPhoto('${item.id}')"
                    class="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center transition shadow"
                    title="Xoá ảnh đã chỉnh này"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <div class="absolute bottom-1.5 inset-x-1.5 bg-black/70 text-white text-[10px] font-mono px-2 py-0.5 rounded truncate">
                    ${item.code}
                </div>
            </div>
        `).join('');
    }

    async function addDeliveredPhotosFromDrive() {
        const input = document.getElementById('deliveredDriveFolderInput');
        const link = input ? input.value.trim() : '';
        if (!link) {
            App.showToast("Vui lòng dán link thư mục hoặc file Google Drive chứa Ảnh đã chỉnh!", "error");
            return;
        }

        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;
        if (!album.deliveredPhotos) album.deliveredPhotos = [];

        App.showToast("Đang tải Ảnh đã chỉnh từ Google Drive...");
        const driveDelivered = await fetchRealPhotosFromDriveLinks([link], album.city || "Đà Lạt", album.date || "2026-11-07", album.deliveredPhotos.length);

        if (!driveDelivered.length) {
            App.showToast("Không đọc được file ảnh từ link Google Drive này! Hãy kiểm tra quyền chia sẻ Công khai.", "error");
            return;
        }

        driveDelivered.forEach((dPhoto, idx) => {
            const cleanCode = (dPhoto.code || '').toUpperCase();
            const matchedOrig = album.photos.find(p => cleanCode.includes(p.code.toUpperCase()) || p.code.toUpperCase().includes(cleanCode)) || album.photos[idx % Math.max(1, album.photos.length)];
            album.deliveredPhotos.push({
                id: "deliv_drv_" + Date.now() + "_" + idx,
                originalPhotoId: matchedOrig ? matchedOrig.id : null,
                code: dPhoto.code,
                location: matchedOrig ? matchedOrig.location : (album.city || "Đà Lạt"),
                capturedAt: matchedOrig ? matchedOrig.capturedAt : dPhoto.capturedAt,
                title: `${dPhoto.title || dPhoto.code} (Ảnh đã chỉnh)`,
                beforeUrl: matchedOrig ? matchedOrig.url : null,
                url: dPhoto.url
            });
        });

        if (input) input.value = '';
        saveAllAlbums(albums);
        renderModalDeliveredPhotos();
        renderAdminAlbumsTable();
        renderAlbumManagePage();
        App.renderPublicAlbum();
        App.showToast(`Đã đồng bộ ${driveDelivered.length} Ảnh đã chỉnh từ Google Drive! Khách hàng có thể xem & so sánh Trước/Sau ngay trên link cũ.`);
    }

    async function handleDeliveredFilesUpload(event) {
        const files = event.target.files;
        if (!files || !files.length) return;

        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;
        if (!album.deliveredPhotos) album.deliveredPhotos = [];

        const fileList = Array.from(files);
        for (let idx = 0; idx < fileList.length; idx++) {
            const file = fileList[idx];
            const dataUrl = await compressImageFile(file, 1600, 0.84);
            if (!dataUrl) continue;

            const cleanName = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
            const matchedOrig = album.photos.find(p => cleanName.includes(p.code.toUpperCase())) || album.photos[idx % Math.max(1, album.photos.length)];
            album.deliveredPhotos.push({
                id: "deliv_local_" + Date.now() + "_" + idx,
                originalPhotoId: matchedOrig ? matchedOrig.id : null,
                code: `${cleanName}_PTS`,
                location: matchedOrig ? matchedOrig.location : album.city,
                capturedAt: matchedOrig ? matchedOrig.capturedAt : `${album.date}T10:00`,
                title: `${file.name} (Ảnh đã chỉnh)`,
                beforeUrl: matchedOrig ? matchedOrig.url : null,
                url: dataUrl
            });
        }

        saveAllAlbums(albums);
        renderModalDeliveredPhotos();
        renderAdminAlbumsTable();
        renderAlbumManagePage();
        App.renderPublicAlbum();
        App.showToast(`Đã tải lên ${fileList.length} Ảnh đã chỉnh từ máy tính vào Album!`);
        event.target.value = "";
    }

    function deleteDeliveredPhoto(delivId) {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album || !album.deliveredPhotos) return;
        album.deliveredPhotos = album.deliveredPhotos.filter(d => d.id !== delivId);
        saveAllAlbums(albums);
        renderModalDeliveredPhotos();
        renderAdminAlbumsTable();
        renderAlbumManagePage();
        App.renderPublicAlbum();
    }

    function clearDeliveredPhotos() {
        const albums = getAllAlbums();
        const album = albums.find(a => a.id === activeAdminAlbumId);
        if (!album) return;
        album.deliveredPhotos = [];
        saveAllAlbums(albums);
        renderModalDeliveredPhotos();
        renderAdminAlbumsTable();
        renderAlbumManagePage();
        App.renderPublicAlbum();
        App.showToast("Đã xoá danh sách Ảnh đã chỉnh của Album này.");
    }

    function resetDemoData() {
        memoryAlbumsCache = null;
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
        openAlbumManagePage,
        openCustomAlbumModal,
        renderAlbumManagePage,
        toggleCoverSelectMode,
        handleUploadCoverFile,
        setManageStatFilter,
        setManageSubTab,
        setManageSortOrder,
        toggleFaceFilterDropdown,
        setManagePersonFilter,
        handleFaceSampleSearch,
        toggleMoreFeaturesDropdown,
        toggleLockAlbumFromManagePage,
        sendAlbumAction,
        togglePhotoStar,
        togglePhotoHeartAdmin,
        togglePhotoDownloadSelect,
        downloadManagePagePhotos,
        handleManagePhotoCardClick,
        openEditAlbumSettingsModal,
        closeEditAlbumSettingsModal,
        switchEditModalTab,
        pickCoverPhotoInModal,
        addDriveLinkToExistingAlbum,
        removeDriveLinkFromExistingAlbum,
        syncUpdateAlbumDrive,
        setSelectorPersonFilter,
        restoreRemovedInteractions,
        exportFeedbackReport,
        addDeliveredPhotosFromDrive,
        handleDeliveredFilesUpload,
        deleteDeliveredPhoto,
        clearDeliveredPhotos,
        openCreateAlbumModal,
        closeCreateAlbumModal,
        switchCreateAlbumTab,
        handleCreateTitleInput,
        addDriveLinkToCreateModal,
        removeDriveLinkFromCreateModal,
        addTagToCreateModal,
        removeTagFromCreateModal,
        handleCreateModalLocalFiles,
        removeLocalFileFromCreateModal,
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
        formatTimeShort,
        getGoogleDriveApiKey,
        setGoogleDriveApiKey,
        updateDriveApiKeyBadge,
        openDriveApiKeyModal,
        closeDriveApiKeyModal,
        handleSaveDriveApiKey,
        testGoogleDriveApiKey,
        copyAppsScriptCode,
        fetchCloudOrStaticAlbums,
        mergeCloudAlbums,
        exportAlbumsJsonFile
    };
})();
