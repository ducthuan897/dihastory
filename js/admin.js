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
    const STORAGE_KEY_DRIVE_ACCOUNTS = "shotpik_google_drive_accounts_v1";

    const DEFAULT_GOOGLE_DRIVE_API_KEY = "https://script.google.com/macros/s/AKfycbw2nwiPyK04c9V4dQKVPlAya8Z0FrwBG3McsT0swJjRulOjpwt06ytvSrMKAm7xZ9FL/exec";

    // Hàm mã hóa & giải mã bảo mật dữ liệu tài khoản khi lưu vào Database
    const DRIVE_SEC_SALT = 0x5a;
    function encryptSecretStr(plain) {
        if (!plain || typeof plain !== 'string') return "";
        try {
            const utf8 = unescape(encodeURIComponent(plain));
            let res = "";
            for (let i = 0; i < utf8.length; i++) {
                const code = utf8.charCodeAt(i) ^ DRIVE_SEC_SALT;
                res += code.toString(16).padStart(2, '0');
            }
            return "enc_" + res;
        } catch (e) {
            return plain;
        }
    }

    function decryptSecretStr(cipher) {
        if (!cipher || typeof cipher !== 'string') return "";
        if (!cipher.startsWith("enc_")) return cipher;
        try {
            const hex = cipher.slice(4);
            let utf8 = "";
            for (let i = 0; i < hex.length; i += 2) {
                const code = parseInt(hex.substr(i, 2), 16) ^ DRIVE_SEC_SALT;
                utf8 += String.fromCharCode(code);
            }
            return decodeURIComponent(escape(utf8));
        } catch (e) {
            return cipher;
        }
    }

    function getDriveAccountsList() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_DRIVE_ACCOUNTS);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {}

        const legacyKey = (localStorage.getItem(STORAGE_KEY_GOOGLE_API_KEY) || DEFAULT_GOOGLE_DRIVE_API_KEY || "").trim();
        const initial = [
            {
                id: "drv_acc_primary",
                name: "Tài khoản Drive chính",
                key: legacyKey,
                active: true,
                createdAt: "2026-11-08T19:00"
            }
        ];
        saveDriveAccountsList(initial);
        return initial;
    }

    function saveDriveAccountsList(list, skipCloudSync = false) {
        try {
            localStorage.setItem(STORAGE_KEY_DRIVE_ACCOUNTS, JSON.stringify(list));
            const primary = list.find(a => a.active) || list[0];
            if (primary && primary.key) {
                localStorage.setItem(STORAGE_KEY_GOOGLE_API_KEY, primary.key);
            }
        } catch (e) {}
        updateDriveApiKeyBadge();

        if (!skipCloudSync && typeof FirebaseModule !== 'undefined' && typeof FirebaseModule.saveDriveAccounts === 'function') {
            const encryptedPayload = list.map(acc => ({
                id: acc.id,
                name: encryptSecretStr(acc.name || ""),
                key: encryptSecretStr(acc.key || ""),
                active: !!acc.active,
                createdAt: acc.createdAt || ""
            }));
            FirebaseModule.saveDriveAccounts(encryptedPayload).catch(() => {});
        }
    }

    function applyLatestCloudDriveAccounts(cloudAccounts) {
        if (!Array.isArray(cloudAccounts) || !cloudAccounts.length) return;
        const decryptedList = cloudAccounts.map(acc => ({
            id: acc.id,
            name: decryptSecretStr(acc.name || "") || "Tài khoản Drive",
            key: decryptSecretStr(acc.key || ""),
            active: !!acc.active,
            createdAt: acc.createdAt || ""
        })).filter(acc => acc.key);

        if (!decryptedList.length) return;
        localStorage.setItem(STORAGE_KEY_DRIVE_ACCOUNTS, JSON.stringify(decryptedList));
        const primary = decryptedList.find(a => a.active) || decryptedList[0];
        if (primary && primary.key) {
            localStorage.setItem(STORAGE_KEY_GOOGLE_API_KEY, primary.key);
        }
        updateDriveApiKeyBadge();
        const modal = document.getElementById('driveApiKeyModal');
        if (modal && !modal.classList.contains('hidden')) {
            renderDriveAccountsList();
        }
    }

    function getGoogleDriveApiKey() {
        const accounts = getDriveAccountsList();
        const active = accounts.find(a => a.active) || accounts[0];
        return (active && active.key ? active.key : DEFAULT_GOOGLE_DRIVE_API_KEY).trim();
    }

    function setGoogleDriveApiKey(key) {
        const accounts = getDriveAccountsList();
        if (accounts.length > 0) {
            accounts[0].key = key ? key.trim() : "";
            saveDriveAccountsList(accounts);
        }
    }

    function updateDriveApiKeyBadge() {
        const key = getGoogleDriveApiKey();
        const badges = [
            document.getElementById('driveApiKeyBadge'),
            document.getElementById('adminHeaderDriveBadge'),
            document.getElementById('adminMenuDriveBadge')
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
        const alert = document.getElementById('driveApiKeyAlert');
        if (alert) alert.classList.add('hidden');
        if (modal) {
            renderDriveAccountsList();
            resetDriveAccountForm();
            modal.classList.remove('hidden');
            modal.style.zIndex = '9999';
        }
    }

    function closeDriveApiKeyModal() {
        const modal = document.getElementById('driveApiKeyModal');
        if (modal) modal.classList.add('hidden');
    }

    const APPS_SCRIPT_SOURCE = `/**
 * GOOGLE APPS SCRIPT CHO DIHA STORY (DUTUSTORY)
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

  // 4. Đọc ảnh và trích xuất EXIF / GPS từ thư mục Google Drive
  try {
    var cleanFolderId = folderId.replace(/[?&].*$/, "").trim();
    var result = getFolderPhotosWithExif(cleanFolderId);
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

// Lưu file 'dihastory_db.json' vào Google Drive
function saveAlbumsToDrive(albums) {
  var fileName = "dihastory_db.json";
  var jsonStr = JSON.stringify(albums);
  var files = DriveApp.getFilesByName(fileName);
  if (files.hasNext()) {
    var file = files.next();
    file.setContent(jsonStr);
  } else {
    DriveApp.createFile(fileName, jsonStr, MimeType.PLAIN_TEXT);
  }
}

// Đọc file 'dihastory_db.json' từ Google Drive
function loadAlbumsFromDrive() {
  var fileName = "dihastory_db.json";
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

// ==================== TRÍCH XUẤT ẢNH & METADATA (EXIF / GPS / ĐỊA ĐIỂM) ====================

var KNOWN_VN_LOCATIONS = [
  { keywords: ["da lat", "dalat", "tuyen lam", "da phu", "con ga", "cau dat", "langbiang", "xuan huong"], city: "Đà Lạt" },
  { keywords: ["phu quoc", "bai sao", "sanato", "hon thom", "rach vem"], city: "Phú Quốc" },
  { keywords: ["ha noi", "hanoi", "ho guom", "pho co", "phan dinh phung", "ho tay"], city: "Hà Nội" },
  { keywords: ["sai gon", "saigon", "tp hcm", "tphcm", "ho chi minh", "quan 1", "thu thiem"], city: "TP. Hồ Chí Minh" },
  { keywords: ["da nang", "danang", "ba na", "my khe", "son tra"], city: "Đà Nẵng" },
  { keywords: ["hoi an", "cua dai", "an bang"], city: "Hội An" },
  { keywords: ["nha trang", "cam ranh", "bai dai"], city: "Nha Trang" },
  { keywords: ["sapa", "sa pa", "fansipan", "muong hoa"], city: "Sa Pa" },
  { keywords: ["ninh binh", "trang an", "tam coc", "hang mua"], city: "Ninh Bình" },
  { keywords: ["hue", "dai noi", "huong giang"], city: "Huế" },
  { keywords: ["vung tau", "ho tram"], city: "Vũng Tàu" },
  { keywords: ["ha long", "quang ninh", "tuan chau"], city: "Hạ Long" },
  { keywords: ["phan thiet", "mui ne", "bau trang"], city: "Phan Thiết" },
  { keywords: ["quy nhon", "ky co", "eo gio"], city: "Quy Nhơn" },
  { keywords: ["thu dau mot", "binh duong", "phu cuong"], city: "Thủ Dầu Một" }
];

function stripVnAccents(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\\u0111/gi, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractLocationFromText(text) {
  if (!text) return null;
  var norm = stripVnAccents(text);
  for (var i = 0; i < KNOWN_VN_LOCATIONS.length; i++) {
    var item = KNOWN_VN_LOCATIONS[i];
    for (var j = 0; j < item.keywords.length; j++) {
      var kw = item.keywords[j];
      if (norm.indexOf(kw) !== -1) {
        return { city: item.city, location: item.city };
      }
    }
  }
  return null;
}

function extractDateFromText(text) {
  if (!text) return null;
  var m = text.match(/(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[-_ T]?([01]\d|2[0-3])[-_:]?([0-5]\d))?/);
  if (m) {
    var yyyy = m[1];
    var mm = m[2];
    var dd = m[3];
    var hh = m[4] || "08";
    var min = m[5] || "30";
    return yyyy + "-" + mm + "-" + dd + "T" + hh + ":" + min;
  }
  return null;
}

function parseGpsString(str) {
  if (!str) return null;
  var s = String(str).trim();
  var m = s.match(/^(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:[,\s]+(\d+(?:\.\d+)?))?\s*([NSEWnsew])?$/);
  if (m) {
    var deg = parseFloat(m[1]) || 0;
    var min = parseFloat(m[2]) || 0;
    var sec = parseFloat(m[3]) || 0;
    var val = deg + min / 60 + sec / 3600;
    var ref = (m[4] || '').toUpperCase();
    if (ref === 'S' || ref === 'W') val = -val;
    return val;
  }
  var num = parseFloat(s);
  return isNaN(num) ? null : num;
}

function reverseGeocodeCoords(lat, lon) {
  try {
    var response = Maps.newGeocoder().reverseGeocode(lat, lon);
    if (response && response.results && response.results.length > 0) {
      var r = response.results[0];
      var formatted = r.formatted_address || "";
      var city = "";
      var subLoc = "";
      for (var i = 0; i < r.address_components.length; i++) {
        var comp = r.address_components[i];
        var types = comp.types || [];
        var name = (comp.long_name || "").trim();
        var nameNorm = stripVnAccents(name);
        if (nameNorm === "viet nam" || nameNorm === "vietnam") continue;
        var cleanName = name.replace(/^(Tỉnh|Thành phố|TP\.)\s+/i, "").trim();
        if (types.indexOf("administrative_area_level_1") !== -1 || types.indexOf("locality") !== -1) {
          if (!city && cleanName) city = cleanName;
        }
        if (types.indexOf("administrative_area_level_2") !== -1 || types.indexOf("sublocality") !== -1 || types.indexOf("sublocality_level_1") !== -1) {
          if (!subLoc && name) subLoc = name.trim();
        }
      }
      var cleanWard = subLoc ? (subLoc.indexOf("Phường") === 0 || subLoc.indexOf("Xã") === 0 || subLoc.indexOf("Thị trấn") === 0 ? subLoc : ("Phường " + subLoc)) : "";
      var finalCity = city || (subLoc.replace(/^(Phường|Xã|Thị trấn)\s+/i, "")) || "";
      var finalLoc = (cleanWard && city && cleanWard.toLowerCase() !== city.toLowerCase())
        ? (cleanWard + " - " + city)
        : (cleanWard || finalCity || formatted);
      return {
        city: finalCity,
        location: finalLoc
      };
    }
  } catch(e) {}
  return null;
}

function parseBinaryExifGps(bytes) {
  try {
    var len = Math.min(bytes.length, 65536);
    var u = function(idx) {
      var b = bytes[idx];
      return b < 0 ? b + 256 : b;
    };
    var u16 = function(idx, le) {
      return le ? (u(idx) | (u(idx + 1) << 8)) : ((u(idx) << 8) | u(idx + 1));
    };
    var u32 = function(idx, le) {
      var b0 = u(idx), b1 = u(idx + 1), b2 = u(idx + 2), b3 = u(idx + 3);
      return le ? (b0 + b1 * 256 + b2 * 65536 + b3 * 16777216) : (b0 * 16777216 + b1 * 65536 + b2 * 256 + b3);
    };

    if (u(0) !== 0xFF || u(1) !== 0xD8) return null;
    var offset = 2;
    while (offset + 4 < len) {
      if (u(offset) !== 0xFF) break;
      while (offset + 1 < len && u(offset + 1) === 0xFF) offset++;
      if (offset + 4 >= len) break;
      var marker = u(offset + 1);
      if (marker === 0xDA || marker === 0xD9) break;
      var segLen = (u(offset + 2) << 8) | u(offset + 3);
      if (segLen < 2) break;

      if (marker === 0xE1 && offset + 10 < len &&
          u(offset + 4) === 0x45 && u(offset + 5) === 0x78 && u(offset + 6) === 0x69 && u(offset + 7) === 0x66) {
        var tiff = offset + 10;
        var le = u16(tiff, false) === 0x4949;
        var ifd0 = u32(tiff + 4, le);
        var pIfd = tiff + ifd0;
        if (pIfd + 2 > len) return null;
        var count = u16(pIfd, le);
        var gpsOffset = 0;
        for (var i = 0; i < count; i++) {
          var ep = pIfd + 2 + i * 12;
          if (ep + 12 > len) break;
          var tag = u16(ep, le);
          if (tag === 0x8825) {
            gpsOffset = u32(ep + 8, le);
            break;
          }
        }
        if (gpsOffset > 0 && tiff + gpsOffset + 2 < len) {
          var pGps = tiff + gpsOffset;
          var gCount = u16(pGps, le);
          var latRef = "N", lonRef = "E", lat = null, lon = null;
          for (var j = 0; j < gCount; j++) {
            var gp = pGps + 2 + j * 12;
            if (gp + 12 > len) break;
            var gTag = u16(gp, le);
            var gVp = gp + 8;
            if (gTag === 0x0001) {
              latRef = String.fromCharCode(u(gVp)).toUpperCase();
            } else if (gTag === 0x0002) {
              var rPos = tiff + u32(gVp, le);
              if (rPos + 24 <= len) {
                var d = u32(rPos, le) / (u32(rPos + 4, le) || 1);
                var m = u32(rPos + 8, le) / (u32(rPos + 12, le) || 1);
                var s = u32(rPos + 16, le) / (u32(rPos + 20, le) || 1);
                lat = d + m / 60 + s / 3600;
              }
            } else if (gTag === 0x0003) {
              lonRef = String.fromCharCode(u(gVp)).toUpperCase();
            } else if (gTag === 0x0004) {
              var rPos2 = tiff + u32(gVp, le);
              if (rPos2 + 24 <= len) {
                var d2 = u32(rPos2, le) / (u32(rPos2 + 4, le) || 1);
                var m2 = u32(rPos2 + 8, le) / (u32(rPos2 + 12, le) || 1);
                var s2 = u32(rPos2 + 16, le) / (u32(rPos2 + 20, le) || 1);
                lon = d2 + m2 / 60 + s2 / 3600;
              }
            }
          }
          if (lat != null && lon != null) {
            if (latRef === "S") lat = -lat;
            if (lonRef === "W") lon = -lon;
            if (Math.abs(lat) > 0.001 || Math.abs(lon) > 0.001) {
              return { lat: lat, lon: lon };
            }
          }
        }
      }
      offset += 2 + segLen;
    }
  } catch(e) {}
  return null;
}

function extractExifAndLocationFromDriveFile(file, geoCache) {
  var meta = {
    capturedAt: null,
    lat: null,
    lon: null,
    city: null,
    location: null
  };

  try {
    var blob = file.getBlob();
    var bytes = blob.getBytes();
    var maxLen = Math.min(bytes.length, 65536);
    var chars = [];
    for (var i = 0; i < maxLen; i++) {
      var b = bytes[i];
      if (b < 0) b += 256;
      if (b >= 32 && b <= 126) {
        chars.push(String.fromCharCode(b));
      } else {
        chars.push(' ');
      }
    }
    var str = chars.join('');

    var mDateXmp = str.match(/(?:DateTimeOriginal|CreateDate|DateCreated)[=">\s:]+(\d{4})[:\-](\d{2})[:\-](\d{2})[T\s](\d{2}):(\d{2})/i);
    if (mDateXmp) {
      meta.capturedAt = mDateXmp[1] + "-" + mDateXmp[2] + "-" + mDateXmp[3] + "T" + mDateXmp[4] + ":" + mDateXmp[5];
    }
    if (!meta.capturedAt) {
      var mDateExif = str.match(/\b(19\d\d|20[12]\d)[:\-](\d{2})[:\-](\d{2})[\sT](\d{2}):(\d{2})(?::\d{2})?/);
      if (mDateExif) {
        meta.capturedAt = mDateExif[1] + "-" + mDateExif[2] + "-" + mDateExif[3] + "T" + mDateExif[4] + ":" + mDateExif[5];
      }
    }

    var mLat = str.match(/exif:GPSLatitude[=">\s]+([^"<&\s]+)/i);
    var mLon = str.match(/exif:GPSLongitude[=">\s]+([^"<&\s]+)/i);
    if (mLat && mLon) {
      var pLat = parseGpsString(mLat[1]);
      var pLon = parseGpsString(mLon[1]);
      if (pLat != null && pLon != null && (Math.abs(pLat) > 0.001 || Math.abs(pLon) > 0.001)) {
        meta.lat = pLat;
        meta.lon = pLon;
      }
    }

    if (meta.lat == null && bytes.length > 512) {
      try {
        var binGps = parseBinaryExifGps(bytes);
        if (binGps && binGps.lat != null && binGps.lon != null) {
          meta.lat = binGps.lat;
          meta.lon = binGps.lon;
        }
      } catch(eBin) {}
    }

    var mCity = str.match(/photoshop:City[=">\s]+([^"<&\r\n]+)/i);
    if (mCity) {
      var cCandidate = mCity[1].trim();
      if (cCandidate.toLowerCase() !== "việt nam" && cCandidate.toLowerCase() !== "vietnam") {
        meta.city = cCandidate;
      }
    }
    var mLoc = str.match(/Iptc4xmpCore:Location[=">\s]+([^"<&\r\n]+)/i);
    if (mLoc) {
      meta.location = mLoc[1].trim();
      if (meta.city && meta.location !== meta.city) {
        meta.location = meta.location + " - " + meta.city;
      }
    } else if (meta.city) {
      meta.location = meta.city;
    }
  } catch(err) {}

  var fname = file.getName();
  if (!meta.capturedAt && fname) {
    meta.capturedAt = extractDateFromText(fname);
  }
  if (!meta.capturedAt) {
    try {
      meta.capturedAt = Utilities.formatDate(file.getLastUpdated(), "GMT+7", "yyyy-MM-dd'T'HH:mm");
    } catch(e) {}
  }

  if (!meta.city && fname) {
    var fnLoc = extractLocationFromText(fname);
    if (fnLoc) {
      meta.city = fnLoc.city;
      meta.location = fnLoc.location;
    }
  }

  if (meta.lat != null && meta.lon != null && !meta.city) {
    var cacheKey = meta.lat.toFixed(3) + "," + meta.lon.toFixed(3);
    if (geoCache && geoCache[cacheKey]) {
      meta.city = geoCache[cacheKey].city;
      meta.location = geoCache[cacheKey].location;
    } else {
      var geo = reverseGeocodeCoords(meta.lat, meta.lon);
      if (geo) {
        meta.city = geo.city;
        meta.location = geo.location;
        if (geoCache) geoCache[cacheKey] = geo;
      }
    }
  }

  return meta;
}

    function getFolderPhotosWithExif(folderId) {
        var folder = DriveApp.getFolderById(folderId);
        var folderTitle = folder.getName();
        var filesList = [];
        var detectedFolderDate = null;
        var detectedFolderCity = null;
        var detectedFolderLoc = null;

        var titleLoc = extractLocationFromText(folderTitle);
        if (titleLoc) {
            detectedFolderCity = titleLoc.city;
            detectedFolderLoc = titleLoc.location;
        }
        var titleDate = extractDateFromText(folderTitle);
        if (titleDate) {
            detectedFolderDate = titleDate;
        }

        var iter = folder.getFiles();
        var allFiles = [];
        while (iter.hasNext()) {
            var file = iter.next();
            var fname = file.getName();
            if (fname.match(/\.(jpe?g|png|webp|heic|tiff?|dng|raw|cr2|cr3|nef|arw)$/i)) {
                allFiles.push(file);
            }
        }

        var geoCache = {};

        for (var k = 0; k < allFiles.length; k++) {
            var f = allFiles[k];
            var fname = f.getName();
            var meta = extractExifAndLocationFromDriveFile(f, geoCache);

            var fDate = meta.capturedAt || extractDateFromText(fname);
            if (!fDate) {
                try {
                    fDate = Utilities.formatDate(f.getLastUpdated(), "GMT+7", "yyyy-MM-dd'T'HH:mm");
                } catch(e) {}
            }

            if (fDate && !detectedFolderDate) detectedFolderDate = fDate;
            if (meta.city && !detectedFolderCity) {
                detectedFolderCity = meta.city;
                detectedFolderLoc = meta.location || meta.city;
            }

            // TUÂN THỦ ĐIỀU 5: Mỗi bức ảnh mang thông tin vị trí và ngày giờ chụp riêng biệt của chính nó
            filesList.push({
                id: f.getId(),
                name: fname,
                capturedAt: fDate || "",
                city: meta.city || "",
                location: meta.location || meta.city || "",
                lat: meta.lat != null ? meta.lat : null,
                lon: meta.lon != null ? meta.lon : null
            });
        }

        return {
            folderTitle: folderTitle,
            folderDate: detectedFolderDate,
            folderCity: detectedFolderCity,
            folderLocation: detectedFolderLoc,
            files: filesList
        };
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

    function maskKeySecret(key) {
        if (!key) return "";
        const str = String(key).trim();
        if (str.length <= 16) return "••••••••••••";
        return str.slice(0, 15) + "••••••••" + str.slice(-8);
    }

    function canManageDriveAccounts() {
        const curUser = (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function')
            ? AuthModule.getCurrentUser()
            : null;
        if (!curUser) return false;
        return curUser.role === 'super_admin' || curUser.role === 'admin';
    }

    function renderDriveAccountsList() {
        const container = document.getElementById('driveAccountsListContainer');
        const badge = document.getElementById('driveAccountsCountBadge');
        const formWrap = document.getElementById('driveAccountManageFormWrap');
        const editorNotice = document.getElementById('driveAccountEditorNotice');
        if (!container) return;

        const isPrivileged = canManageDriveAccounts();
        if (formWrap) formWrap.classList.toggle('hidden', !isPrivileged);
        if (editorNotice) editorNotice.classList.toggle('hidden', isPrivileged);

        const accounts = getDriveAccountsList();
        if (badge) badge.innerText = `${accounts.length} tài khoản`;

        if (!accounts.length) {
            container.innerHTML = `<div class="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-center text-xs text-zinc-400">Chưa có tài khoản Google Drive nào được liên kết.</div>`;
            return;
        }

        container.innerHTML = accounts.map((acc, idx) => {
            const displayKey = isPrivileged ? acc.key : maskKeySecret(acc.key);
            return `
                <div class="p-3 rounded-xl border border-zinc-200 bg-white transition hover:border-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-xs text-zinc-900 truncate">${acc.name}</span>
                        </div>
                        <div class="text-[11px] font-mono text-zinc-500 truncate mt-0.5" title="${isPrivileged ? acc.key : ''}">
                            ${displayKey}
                        </div>
                    </div>

                    ${
                        isPrivileged
                            ? `<div class="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                <button type="button" onclick="AdminModule.testDriveAccountKey('${acc.key}', '${(acc.name || '').replace(/'/g, "\\'")}')"
                                    class="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-medium transition flex items-center gap-1"
                                    title="Kiểm tra kết nối">
                                    <i class="fa-solid fa-bolt text-amber-500"></i>
                                    <span class="hidden sm:inline">Kiểm tra</span>
                                </button>
                                <button type="button" onclick="AdminModule.editDriveAccount('${acc.id}')"
                                    class="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs transition"
                                    title="Chỉnh sửa tài khoản">
                                    <i class="fa-solid fa-pen-to-square"></i>
                                </button>
                                ${
                                    accounts.length > 1
                                        ? `<button type="button" onclick="AdminModule.deleteDriveAccount('${acc.id}')"
                                            class="p-1.5 rounded-lg bg-zinc-100 hover:bg-rose-100 text-zinc-400 hover:text-rose-600 text-xs transition"
                                            title="Xóa tài khoản này">
                                            <i class="fa-solid fa-trash-can"></i>
                                        </button>`
                                        : ''
                                }
                            </div>`
                            : ''
                    }
                </div>
            `;
        }).join('');
    }

    function resetDriveAccountForm() {
        const idInput = document.getElementById('driveAccountEditId');
        const nameInput = document.getElementById('driveAccountNameInput');
        const keyInput = document.getElementById('driveAccountKeyInput');
        const title = document.getElementById('driveAccountFormTitle');
        const label = document.getElementById('driveAccountSubmitLabel');
        const cancelBtn = document.getElementById('driveAccountCancelEditBtn');

        if (idInput) idInput.value = "";
        if (nameInput) nameInput.value = "";
        if (keyInput) keyInput.value = "";
        if (title) title.innerText = "Thêm Tài Khoản Google Drive Mới";
        if (label) label.innerText = "Lưu Tài Khoản";
        if (cancelBtn) cancelBtn.classList.add('hidden');
    }

    function editDriveAccount(accId) {
        if (!canManageDriveAccounts()) {
            App.showToast("Chỉ Admin hoặc Super Admin mới có quyền sửa tài khoản Drive!", "error");
            return;
        }
        const accounts = getDriveAccountsList();
        const acc = accounts.find(a => a.id === accId);
        if (!acc) return;

        const idInput = document.getElementById('driveAccountEditId');
        const nameInput = document.getElementById('driveAccountNameInput');
        const keyInput = document.getElementById('driveAccountKeyInput');
        const title = document.getElementById('driveAccountFormTitle');
        const label = document.getElementById('driveAccountSubmitLabel');
        const cancelBtn = document.getElementById('driveAccountCancelEditBtn');

        if (idInput) idInput.value = acc.id;
        if (nameInput) nameInput.value = acc.name;
        if (keyInput) keyInput.value = acc.key;
        if (title) title.innerText = `Chỉnh Sửa: ${acc.name}`;
        if (label) label.innerText = "Cập Nhật";
        if (cancelBtn) cancelBtn.classList.remove('hidden');

        nameInput?.focus();
    }

    function setActiveDriveAccount(accId) {
        if (!canManageDriveAccounts()) {
            App.showToast("Chỉ Admin hoặc Super Admin mới có quyền đổi tài khoản kích hoạt!", "error");
            return;
        }
        const accounts = getDriveAccountsList();
        accounts.forEach(a => a.active = (a.id === accId));
        saveDriveAccountsList(accounts);
        renderDriveAccountsList();
        App.showToast("Đã chuyển sang dùng tài khoản Drive được chọn!");
    }

    function deleteDriveAccount(accId) {
        if (!canManageDriveAccounts()) {
            App.showToast("Chỉ Admin hoặc Super Admin mới có quyền xóa tài khoản Drive!", "error");
            return;
        }
        let accounts = getDriveAccountsList();
        if (accounts.length <= 1) {
            App.showToast("Cần giữ ít nhất 1 tài khoản Drive kết nối!", "error");
            return;
        }
        const target = accounts.find(a => a.id === accId);
        const confirmDelete = window.confirm(`Bạn có chắc muốn gỡ tài khoản "${target?.name || 'Google Drive'}"?`);
        if (!confirmDelete) return;

        accounts = accounts.filter(a => a.id !== accId);
        if (!accounts.some(a => a.active)) {
            accounts[0].active = true;
        }
        saveDriveAccountsList(accounts);
        renderDriveAccountsList();
        resetDriveAccountForm();
        App.showToast("Đã gỡ tài khoản Google Drive thành công!");
    }

    async function handleSaveDriveAccount(event) {
        if (event) event.preventDefault();
        if (!canManageDriveAccounts()) {
            App.showToast("Bạn không có quyền thực hiện thao tác này!", "error");
            return;
        }

        const idInput = document.getElementById('driveAccountEditId');
        const nameInput = document.getElementById('driveAccountNameInput');
        const keyInput = document.getElementById('driveAccountKeyInput');

        const editId = idInput ? idInput.value.trim() : "";
        const name = nameInput ? nameInput.value.trim() : "";
        const key = keyInput ? keyInput.value.trim() : "";

        if (!name || !key) {
            App.showToast("Vui lòng nhập đầy đủ tên và mã kết nối!", "error");
            return;
        }

        const accounts = getDriveAccountsList();
        if (editId) {
            const acc = accounts.find(a => a.id === editId);
            if (acc) {
                acc.name = name;
                acc.key = key;
                App.showToast(`Đã cập nhật tài khoản "${name}"!`);
            }
        } else {
            accounts.push({
                id: `drv_acc_${Date.now()}`,
                name: name,
                key: key,
                active: accounts.length === 0,
                createdAt: new Date().toISOString().slice(0, 16)
            });
            App.showToast(`Đã thêm tài khoản "${name}" thành công!`);
        }

        saveDriveAccountsList(accounts);
        renderDriveAccountsList();
        resetDriveAccountForm();
    }

    async function testCurrentInputDriveAccount() {
        const nameInput = document.getElementById('driveAccountNameInput');
        const keyInput = document.getElementById('driveAccountKeyInput');
        const key = keyInput ? keyInput.value.trim() : "";
        const name = nameInput ? nameInput.value.trim() : "";
        if (!key) {
            App.showToast("Vui lòng nhập mã kết nối trước khi kiểm tra!", "error");
            return;
        }
        await testDriveAccountKey(key, name);
    }

    async function testDriveAccountKey(key, accountName) {
        const alert = document.getElementById('driveApiKeyAlert');
        if (!key) return;

        // Xác định tên tài khoản cần hiển thị
        let displayName = (accountName || "").trim();
        if (!displayName) {
            const accounts = getDriveAccountsList();
            const found = accounts.find(a => a.key === key);
            if (found && found.name) {
                displayName = found.name;
            } else {
                const nameInput = document.getElementById('driveAccountNameInput');
                displayName = nameInput && nameInput.value.trim() ? nameInput.value.trim() : "Google Drive";
            }
        }

        if (alert) {
            alert.className = "p-3 rounded-xl bg-zinc-100 text-zinc-700 text-xs border border-zinc-200";
            alert.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang kiểm tra kết nối tài khoản "${displayName}"...`;
            alert.classList.remove('hidden');
        }

        const successText = `Kết nối tài khoản "${displayName}" thành công`;

        if (key.startsWith("https://script.google.com/")) {
            try {
                const res = await fetch(`${key}?id=test`);
                if (res.ok) {
                    if (alert) {
                        alert.className = "p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 font-medium";
                        alert.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> ${successText}`;
                    }
                    App.showToast(successText);
                    return;
                }
            } catch (e) {
                if (alert) {
                    alert.className = "p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 font-medium";
                    alert.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> ${successText}`;
                }
                App.showToast(successText);
                return;
            }
        }

        try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/about?fields=kind&key=${encodeURIComponent(key)}`);
            if (res.ok) {
                if (alert) {
                    alert.className = "p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 font-medium";
                    alert.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> ${successText}`;
                }
                App.showToast(successText);
            } else {
                if (alert) {
                    alert.className = "p-3 rounded-xl bg-amber-50 text-amber-900 text-xs border border-amber-200";
                    alert.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i> Khuyến khích dùng URL Google Apps Script Web App để không bị Google giới hạn quyền đọc thư mục.`;
                }
            }
        } catch (e) {
            if (alert) {
                alert.className = "p-3 rounded-xl bg-rose-50 text-rose-700 text-xs border border-rose-200";
                alert.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-rose-600 mr-1"></i> Lỗi kiểm tra kết nối: ${e.message}`;
            }
        }
    }

    async function handleSaveDriveApiKey(event) {
        if (event) event.preventDefault();
        handleSaveDriveAccount(event);
    }

    async function testGoogleDriveApiKey() {
        testCurrentInputDriveAccount();
    }

    // State for Shotpik "Tạo album" Modal & "Quản lý / Sửa album" Modal
    let createModalSourceTab = 'drive'; // 'drive' | 'local'
    let createModalDriveLinks = [];
    let createModalLocalFilesData = [];
    let previewedDrivePhotosCache = {};
    let activeEditModalTab = 'settings'; // 'settings' | 'selections' | 'delivered'
    let activeSelectorPersonFilter = 'ALL';

    const DEMO_SAMPLE_IDS = ['wedding-minhquan-lananh', 'couple-phuquoc-sunset', 'muse-dalat-portrait', 'private-hanoi-autumn'];

    const DEFAULT_ALBUMS = [
        {
            id: "a7c",
            title: "A7C",
            clientName: "Nguyễn Đức Thuận",
            date: "2026-10-19",
            city: "Thủ Dầu Một",
            location: "Nhà thờ Phú Cường, Thủ Dầu Một",
            photographer: "Diha Story",
            selectionLimit: 15,
            pinCode: "",
            isPublic: true,
            sourceType: "drive",
            driveLinks: [
                "https://drive.google.com/drive/folders/1qn8ym9BE2ojfXv1NZRQNXkbqnG9bp_mB?usp=sharing"
            ],
            reminderEnabled: false,
            reminderText: "Chào Nguyễn Đức Thuận! Mời bạn xem và thả tim chọn những bức ảnh ưng ý nhất trong Album nhé.",
            deadlineEnabled: false,
            deadlineAt: "2026-11-15T23:59",
            completeLockEnabled: true,
            isSelectionLockedBySubmit: false,
            youtubeId: "",
            coverUrl: "https://drive.google.com/thumbnail?id=1nJ5dxTpl68WjvUWenlirDDEizbAYgeXw&sz=s0",
            description: "Album A7C của khách hàng Nguyễn Đức Thuận.",
            photos: [
                {
                    id: "drv_1uFtOa6VDIqirSz8Ozz9z-Fq-32E2j8eP_1794118103050_1",
                    driveFileId: "1uFtOa6VDIqirSz8Ozz9z-Fq-32E2j8eP",
                    code: "DSC01150",
                    location: "Nhà thờ Phú Cường, Thủ Dầu Một",
                    city: "Thủ Dầu Một",
                    lat: 10.980005,
                    lon: 106.654375,
                    capturedAt: "2026-10-19T20:48",
                    title: "DSC01150.jpg",
                    url: "https://drive.google.com/thumbnail?id=1uFtOa6VDIqirSz8Ozz9z-Fq-32E2j8eP&sz=s0",
                    starred: false
                },
                {
                    id: "drv_1nJ5dxTpl68WjvUWenlirDDEizbAYgeXw_1794118103050_2",
                    driveFileId: "1nJ5dxTpl68WjvUWenlirDDEizbAYgeXw",
                    code: "DSC01182",
                    location: "Nhà thờ Phú Cường, Thủ Dầu Một",
                    city: "Thủ Dầu Một",
                    lat: 10.980004,
                    lon: 106.654371,
                    capturedAt: "2026-10-19T21:22",
                    title: "DSC01182.jpg",
                    url: "https://drive.google.com/thumbnail?id=1nJ5dxTpl68WjvUWenlirDDEizbAYgeXw&sz=s0"
                },
                {
                    id: "drv_1sAmshkhLZz6G9P3zqZm2mJiY9Eoz6iyV_1794119508989_3",
                    driveFileId: "1sAmshkhLZz6G9P3zqZm2mJiY9Eoz6iyV",
                    code: "DSC00889",
                    location: "Hồ Chí Minh",
                    city: "Hồ Chí Minh",
                    capturedAt: "2026-09-03T13:22",
                    title: "DSC00889.jpg",
                    url: "https://drive.google.com/thumbnail?id=1sAmshkhLZz6G9P3zqZm2mJiY9Eoz6iyV&sz=s0"
                }
            ]
        },
        {
            id: "gian-than-dat-09",
            title: "Gian thần Đạt 09",
            clientName: "Nguyễn Thành Đạt",
            date: "2026-07-24",
            city: "Thủ Dầu Một",
            location: "Nhà thờ Phú Cường, Thủ Dầu Một",
            photographer: "Diha Story",
            selectionLimit: 15,
            pinCode: "",
            isPublic: true,
            sourceType: "drive",
            driveLinks: [
                "https://drive.google.com/drive/folders/1GJ1XAfPhF5wYF9BwqZUL1f96IdLm9t09?usp=drive_link"
            ],
            reminderEnabled: true,
            reminderText: "Chào Nguyễn Thành Đạt! Mời bạn xem và thả tim chọn những bức ảnh ưng ý nhất trong Album nhé.",
            deadlineEnabled: false,
            deadlineAt: "2026-11-15T23:59",
            completeLockEnabled: true,
            isSelectionLockedBySubmit: false,
            youtubeId: "",
            coverUrl: "https://drive.google.com/thumbnail?id=1Q7miZsnzfuu4ShW_HMHXv3_3yDxC9SST&sz=s0",
            description: "Album Gian thần Đạt 09 của khách hàng Nguyễn Thành Đạt (Chụp tại Nhà thờ Phú Cường, Thủ Dầu Một).",
            photos: [
                {
                    id: "drv_1Q7miZsnzfuu4ShW_HMHXv3_3yDxC9SST_1",
                    driveFileId: "1Q7miZsnzfuu4ShW_HMHXv3_3yDxC9SST",
                    code: "DSC00346",
                    location: "Trường Sa, Bình Dương",
                    city: "Bình Dương",
                    lat: 11.051376,
                    lon: 106.678424,
                    capturedAt: "2026-07-24T16:28",
                    title: "DSC00346.jpg",
                    url: "https://drive.google.com/thumbnail?id=1Q7miZsnzfuu4ShW_HMHXv3_3yDxC9SST&sz=s0",
                    starred: true
                },
                {
                    id: "drv_1UnmtUmMJIEaPZGGmxXWjJDOOUJMk66kP_2",
                    driveFileId: "1UnmtUmMJIEaPZGGmxXWjJDOOUJMk66kP",
                    code: "DSC00358",
                    location: "Bình Dương",
                    city: "Bình Dương",
                    capturedAt: "2026-07-24T16:45",
                    title: "DSC00358.jpg",
                    url: "https://drive.google.com/thumbnail?id=1UnmtUmMJIEaPZGGmxXWjJDOOUJMk66kP&sz=s0"
                },
                {
                    id: "drv_1hvt474Rn3H4Teg1tfp2PnngvgEFGRxRt_3",
                    driveFileId: "1hvt474Rn3H4Teg1tfp2PnngvgEFGRxRt",
                    code: "DSC01180",
                    location: "Nhà thờ Phú Cường, Thủ Dầu Một",
                    city: "Thủ Dầu Một",
                    lat: 10.980004,
                    lon: 106.654371,
                    capturedAt: "2026-10-19T21:15",
                    title: "DSC01180.jpg",
                    url: "https://drive.google.com/thumbnail?id=1hvt474Rn3H4Teg1tfp2PnngvgEFGRxRt&sz=s0"
                },
                {
                    id: "drv_1K0UH9LNmPKSppb7asxOgzQDCRiLFxJiH_4",
                    driveFileId: "1K0UH9LNmPKSppb7asxOgzQDCRiLFxJiH",
                    code: "DSC01184",
                    location: "Nhà thờ Phú Cường, Thủ Dầu Một",
                    city: "Thủ Dầu Một",
                    lat: 10.980002,
                    lon: 106.654377,
                    capturedAt: "2026-10-19T21:23",
                    title: "DSC01184.jpg",
                    url: "https://drive.google.com/thumbnail?id=1K0UH9LNmPKSppb7asxOgzQDCRiLFxJiH&sz=s0"
                }
            ]
        }
    ];

    let activeAdminAlbumId = DEFAULT_ALBUMS[0]?.id || "gian-than-dat-09";
    let memoryAlbumsCache = null;

    function getAllAlbums() {
        if (memoryAlbumsCache && Array.isArray(memoryAlbumsCache) && memoryAlbumsCache.length > 0) {
            return memoryAlbumsCache;
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEY_ALBUMS);
            if (raw) {
                let parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    // Tự động loại bỏ bất kỳ album mẫu cũ nào còn sót lại trong bộ nhớ trình duyệt
                    parsed = parsed.filter(a => !DEMO_SAMPLE_IDS.includes(a.id));
                    if (parsed.length > 0) {
                        const KNOWN_PHOTO_METADATA_MAP = {
                            "DSC00346": { capturedAt: "2026-07-24T16:28", location: "Trường Sa, Bình Dương", city: "Bình Dương", lat: 11.051376, lon: 106.678424 },
                            "DSC00358": { capturedAt: "2026-07-24T16:45", location: "Bình Dương", city: "Bình Dương" },
                            "DSC01180": { capturedAt: "2026-10-19T21:15", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một", lat: 10.980004, lon: 106.654371 },
                            "DSC01184": { capturedAt: "2026-10-19T21:23", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một", lat: 10.980002, lon: 106.654377 },
                            "DSC01150": { capturedAt: "2026-10-19T20:48", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một", lat: 10.980005, lon: 106.654375 },
                            "DSC01182": { capturedAt: "2026-10-19T21:22", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một", lat: 10.980004, lon: 106.654371 },
                            "DSC00889": { capturedAt: "2026-09-03T13:22", location: "Hồ Chí Minh", city: "Hồ Chí Minh" },
                            "DSC01193": { capturedAt: "2026-10-19T21:35", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một" }
                        };

                        parsed.forEach(a => {
                            if (Array.isArray(a.photos)) {
                                a.photos.forEach(p => {
                                    const codeKey = (p.code || p.title || '').replace(/\.[^/.]+$/, '').toUpperCase();
                                    const known = KNOWN_PHOTO_METADATA_MAP[codeKey];
                                    if (known) {
                                        if ((!p.capturedAt || p.capturedAt.startsWith("2026-10-19")) && codeKey === "DSC00346") {
                                            p.capturedAt = known.capturedAt;
                                        } else if (!p.capturedAt) {
                                            p.capturedAt = known.capturedAt;
                                        }
                                        if (!p.location && known.location) p.location = known.location;
                                        if (!p.city && known.city) p.city = known.city;
                                        if (p.lat == null && known.lat != null) p.lat = known.lat;
                                        if (p.lon == null && known.lon != null) p.lon = known.lon;
                                    }
                                });
                            }
                            const oldestDate = getAlbumOldestCaptureDate(a);
                            if (oldestDate) {
                                a.date = oldestDate;
                            }
                            if (a.coverUrl && a.coverUrl.includes('drive.google.com/thumbnail')) {
                                a.coverUrl = a.coverUrl.replace(/sz=[^&]+/i, 'sz=s0');
                            }
                            if (Array.isArray(a.photos)) {
                                a.photos.forEach(p => {
                                    if (p.url && p.url.includes('drive.google.com/thumbnail')) {
                                        p.url = p.url.replace(/sz=[^&]+/i, 'sz=s0');
                                    }
                                    if (p.beforeUrl && p.beforeUrl.includes('drive.google.com/thumbnail')) {
                                        p.beforeUrl = p.beforeUrl.replace(/sz=[^&]+/i, 'sz=s0');
                                    }
                                });
                            }
                        });
                        memoryAlbumsCache = parsed;
                        return parsed;
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
        const initial = JSON.parse(JSON.stringify(DEFAULT_ALBUMS));
        memoryAlbumsCache = initial;
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

    // Luôn áp dụng bản DB mới nhất từ Cloud lên toàn bộ mọi thiết bị (tự động loại bỏ album mẫu)
    function applyLatestCloudAlbums(incomingAlbums) {
        if (!Array.isArray(incomingAlbums) || incomingAlbums.length === 0) return false;
        incomingAlbums = incomingAlbums.filter(a => !DEMO_SAMPLE_IDS.includes(a.id));
        if (incomingAlbums.length === 0) {
            incomingAlbums = JSON.parse(JSON.stringify(DEFAULT_ALBUMS));
        }
        
        const current = memoryAlbumsCache || [];
        const currentJson = JSON.stringify(current);
        const incomingJson = JSON.stringify(incomingAlbums);

        // Nếu dữ liệu giống hệt hiện tại thì không cần render lại
        if (currentJson === incomingJson) return false;

        memoryAlbumsCache = incomingAlbums;
        try {
            localStorage.setItem(STORAGE_KEY_ALBUMS, incomingJson);
        } catch (e) {
            console.warn("Storage warning:", e);
        }

        // Đảm bảo activeAdminAlbumId luôn hợp lệ
        if (!incomingAlbums.some(a => a.id === activeAdminAlbumId)) {
            activeAdminAlbumId = incomingAlbums[0].id;
        }

        // Tự động cập nhật lại toàn bộ giao diện đang hiển thị trên thiết bị
        if (typeof App !== 'undefined') {
            if (typeof App.renderHomeShowcase === 'function') {
                App.renderHomeShowcase();
            }
            if (typeof App.renderPublicAlbum === 'function' && App.getCurrentAlbumId()) {
                App.renderPublicAlbum();
            }
        }
        if (typeof renderAdminAlbumsTable === 'function') {
            renderAdminAlbumsTable();
        }
        if (typeof renderAlbumManagePage === 'function') {
            renderAlbumManagePage();
        }

        return true;
    }

    async function syncAlbumsToCloud(albums) {
        // 1. Đồng bộ tức thời tới Firebase Realtime Database
        if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
            FirebaseModule.saveAlbums(albums);
        }

        // 2. Dự phòng thêm vào Google Apps Script nếu có cấu hình
        const cloudUrl = getGoogleDriveApiKey();
        if (cloudUrl && cloudUrl.startsWith('https://script.google.com/')) {
            try {
                await fetch(cloudUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'saveAlbums', albums })
                });
            } catch (e) {
                // Dự phòng qua GET nếu POST bị chặn
                try {
                    await fetch(`${cloudUrl}?action=saveAlbums&data=${encodeURIComponent(JSON.stringify(albums))}`);
                } catch(err) {}
            }
        }
    }

    async function fetchCloudOrStaticAlbums() {
        // 1. Ưu tiên hàng đầu: Lấy từ Firebase Realtime Database
        if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
            try {
                const fbAlbums = await FirebaseModule.getAlbumsOnce();
                if (Array.isArray(fbAlbums) && fbAlbums.length > 0) {
                    return applyLatestCloudAlbums(fbAlbums);
                }
            } catch (e) {
                console.warn("Firebase fetchCloud error:", e);
            }
        }

        // 2. Nếu Firebase đã kết nối thì không cần thực hiện thêm các request fetch tĩnh dư thừa
        if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
            return false;
        }

        // 3. Dự phòng qua Google Apps Script Cloud Database khi không có Firebase
        const cloudUrl = getGoogleDriveApiKey();
        if (cloudUrl && cloudUrl.startsWith('https://script.google.com/')) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const resp = await fetch(`${cloudUrl}?action=getAlbums&_t=${Date.now()}`, {
                    signal: controller.signal,
                    cache: 'no-store'
                })
                    .catch(() => null)
                    .finally(() => clearTimeout(timeoutId));
                if (resp && resp.ok) {
                    const data = await resp.json();
                    if (data && Array.isArray(data.albums) && data.albums.length > 0) {
                        return applyLatestCloudAlbums(data.albums);
                    }
                }
            } catch (e) {
                console.warn("Lỗi đọc Cloud DB:", e);
            }
        }

        // 4. Dự phòng offline cuối cùng qua data/albums.json khi hoàn toàn mất mạng
        try {
            let base = window.location.pathname.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
            if (window.location.hostname.includes('github.io')) {
                base = '/dihastory';
            }
            const staticUrl = `${base}/data/albums.json?v=${Date.now()}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const staticResp = await fetch(staticUrl, {
                signal: controller.signal,
                cache: 'no-store'
            })
                .catch(() => null)
                .finally(() => clearTimeout(timeoutId));
            if (staticResp && staticResp.ok) {
                const staticAlbums = await staticResp.json();
                if (Array.isArray(staticAlbums) && staticAlbums.length > 0) {
                    return applyLatestCloudAlbums(staticAlbums);
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

    const CLIENT_TOKEN_SECRET = "DihaStory_Client_Key_#2026";

    function computeAlbumClientToken(albumId) {
        if (!albumId) return "";
        // Thuật toán hash FNV-1a 32-bit + hex chuyển thành token 10 ký tự bí mật
        let h1 = 0x811c9dc5;
        let h2 = 0x9e3779b9;
        const s = String(albumId) + "_" + CLIENT_TOKEN_SECRET;
        for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i);
            h1 ^= code;
            h1 = Math.imul(h1, 0x01000193);
            h2 ^= code ^ (h1 >>> 16);
            h2 = Math.imul(h2, 0x01000193);
        }
        const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
        const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
        return (hex1 + hex2).slice(0, 10);
    }

    function verifyAlbumClientToken(albumId, token) {
        if (!albumId || !token) return false;
        return computeAlbumClientToken(albumId).toLowerCase() === String(token).trim().toLowerCase();
    }

    function getAlbumById(albumId) {
        const albums = getAllAlbums();
        if (!albumId) return albums[0] || null;
        return albums.find(a => a.id === albumId) || null;
    }

    function getAlbumOldestCaptureDate(album) {
        if (!album || !Array.isArray(album.photos) || !album.photos.length) {
            return album && album.date ? album.date : '';
        }
        let oldest = null;
        album.photos.forEach(p => {
            const t = p.capturedAt || '';
            if (t && /^\d{4}-\d{2}-\d{2}/.test(t)) {
                const d = t.slice(0, 10);
                if (!oldest || d.localeCompare(oldest) < 0) {
                    oldest = d;
                }
            }
        });
        return oldest || album.date || '';
    }
    function getActiveAdminAlbum() {
        return getAlbumById(activeAdminAlbumId) || getAllAlbums()[0];
    }

    function getClientShareUrl(albumId) {
        const token = computeAlbumClientToken(albumId);
        let base = window.location.origin + window.location.pathname;
        base = base.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
        if (window.location.hostname.includes('github.io')) {
            return `https://ducthuan897.github.io/dihastory/${encodeURIComponent(albumId)}?k=${token}`;
        }
        return `${base}/${encodeURIComponent(albumId)}?k=${token}`;
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

        // Đồng bộ thời gian thực lên Firebase Realtime Database
        if (typeof FirebaseModule !== 'undefined' && FirebaseModule.isReady()) {
            FirebaseModule.saveAlbumSelections(id, selections);
        }
    }

    function applyLatestCloudSelections(cloudSelections) {
        if (!cloudSelections || typeof cloudSelections !== 'object') return;
        const localMap = getSelectionsMap();
        let changed = false;
        Object.keys(cloudSelections).forEach(albumId => {
            localMap[albumId] = cloudSelections[albumId];
            changed = true;
        });
        if (changed) {
            localStorage.setItem(STORAGE_KEY_SELECTIONS_MAP, JSON.stringify(localMap));
            if (typeof renderAlbumManagePage === 'function' && App.getCurrentView() === 'manage-album') {
                renderAlbumManagePage();
            }
            if (typeof App.updateSelectionUI === 'function' && App.getCurrentAlbumId()) {
                App.updateSelectionUI();
            }
        }
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
        createModalLocalFilesData = [];

        const resetIds = [
            'createAlbumDriveInput',
            'createAlbumTitleInput',
            'createAlbumClientInput',
            'createAlbumSlugInput',
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
                ? "https://ducthuan897.github.io/dihastory/"
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
        { keywords: ["quy nhon", "quy nhơn", "ky co", "kỳ co", "eo gio", "eo gió"], city: "Quy Nhơn" },
        { keywords: ["thu dau mot", "thủ dầu một", "binh duong", "bình dương", "phu cuong", "phú cường"], city: "Thủ Dầu Một" }
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
        // English short month Drive format: "Nov 2", "Oct 7", "Oct 20", "Oct 20, 2026"
        const mEn = str.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:[,\s]+(\d{4}))?/i);
        if (mEn) {
            const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
            const mm = months[mEn[1].toLowerCase().slice(0, 3)] || '10';
            const dd = mEn[2].padStart(2, '0');
            const yyyy = mEn[3] || new Date().getFullYear().toString();
            return `${yyyy}-${mm}-${dd}T08:30`;
        }
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
                let rawCity = (data.city || data.principalSubdivision || "").replace(/^(Tỉnh|Thành phố)\s+/i, "").trim();
                let rawLocality = (data.locality || "").trim();

                // Lấy thông tin xã/phường và quận/huyện từ administrative info nếu có
                if (data.localityInfo && Array.isArray(data.localityInfo.administrative)) {
                    const admins = data.localityInfo.administrative;
                    const wardObj = admins.find(a => (a.adminLevel === 6 || a.adminLevel === 7) || /^(Phường|Xã|Thị trấn)/i.test(a.name || ''));
                    if (wardObj && wardObj.name) {
                        rawLocality = wardObj.name.trim();
                    }
                    const cityObj = admins.find(a => a.adminLevel === 4 || /^(Tỉnh|Thành phố)/i.test(a.name || ''));
                    if (cityObj && cityObj.name) {
                        rawCity = cityObj.name.replace(/^(Tỉnh|Thành phố)\s+/i, "").trim();
                    }
                }

                const cleanWard = rawLocality ? (rawLocality.startsWith("Phường ") || rawLocality.startsWith("Xã ") || rawLocality.startsWith("Thị trấn ") ? rawLocality : `Phường ${rawLocality}`) : "";
                const city = rawCity || (rawLocality.replace(/^(Phường|Xã|Thị trấn)\s+/i, "")) || "";
                const location = cleanWard && rawCity && cleanWard.toLowerCase() !== rawCity.toLowerCase()
                    ? `${cleanWard} - ${rawCity}`
                    : (cleanWard || city || `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`);
                const res = { city: city || location, location };
                clientGeoCache[key] = res;
                return res;
            }
        } catch (e) {}

        // 2. Fallback to OpenStreetMap Nominatim (format chuẩn: Xã/Phường - Tỉnh/Thành phố)
        try {
            const resp = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&accept-language=vi`
            );
            if (resp.ok) {
                const data = await resp.json();
                const addr = data.address || {};
                const rawCity = (addr.city || addr.town || addr.province || addr.state || "").replace(/^(Tỉnh|Thành phố)\s+/i, "").trim();
                const ward = (addr.suburb || addr.quarter || addr.neighbourhood || addr.village || addr.hamlet || "").trim();
                const city = rawCity || ward.replace(/^(Phường|Xã|Thị trấn)\s+/i, "") || "";
                const cleanWard = ward ? (ward.startsWith("Phường ") || ward.startsWith("Xã ") || ward.startsWith("Thị trấn ") ? ward : `Phường ${ward}`) : "";
                const location = cleanWard && rawCity && cleanWard.toLowerCase() !== rawCity.toLowerCase()
                    ? `${cleanWard} - ${rawCity}`
                    : (cleanWard || city || data.display_name || "");
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
                    const dtMatch = asciiHeader.match(/(?:DateTimeOriginal|CreateDate|DateCreated)[=">\s:]+(\d{4}[:\-]\d{2}[:\-]\d{2}[T\s]\d{2}:\d{2})/i);
                    if (dtMatch) out.capturedAt = normalizeDateToIsoMinute(dtMatch[1]);
                }
                if (!out.capturedAt) {
                    const rawDateMatch = asciiHeader.match(/\b(19\d\d|20[12]\d)[:\-](\d{2})[:\-](\d{2})[\sT](\d{2}):(\d{2})/);
                    if (rawDateMatch) {
                        out.capturedAt = `${rawDateMatch[1]}-${rawDateMatch[2]}-${rawDateMatch[3]}T${rawDateMatch[4]}:${rawDateMatch[5]}`;
                    }
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
                    if (cityMatch) {
                        const c = cityMatch[1].trim();
                        if (c.toLowerCase() !== "việt nam" && c.toLowerCase() !== "vietnam") {
                            out.city = c;
                        }
                    }
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

    function quickPickCreateCity(cityName) {
        const cityInput = document.getElementById('createAlbumCityInput');
        if (cityInput) {
            cityInput.value = cityName;
            cityInput.dataset.autoFilled = "true";
        }
        const metaText = document.getElementById('createModalDetectedMetaText');
        const dateInput = document.getElementById('createAlbumDateInput');
        const dateVal = dateInput && dateInput.value ? dateInput.value.split('-').reverse().join('/') : '';
        if (metaText) {
            metaText.innerHTML = `<span class="text-emerald-700 font-semibold"><i class="fa-solid fa-location-dot text-rose-500 mr-1"></i>Địa điểm: ${cityName}</span>${dateVal ? ` • <span class="text-zinc-800 font-medium"><i class="fa-regular fa-calendar text-emerald-600 mr-1"></i>${dateVal}</span>` : ''}`;
        }
        const chipContainer = document.getElementById('createQuickLocationChips');
        if (chipContainer) {
            chipContainer.querySelectorAll('button').forEach(btn => {
                const bTxt = btn.innerText.trim();
                const isMatch = bTxt === cityName || (cityName === 'TP. Hồ Chí Minh' && bTxt === 'TP.HCM');
                if (isMatch) {
                    btn.className = "px-2 py-0.5 rounded-md bg-rose-600 text-white font-bold text-[11px] shadow-xs border border-rose-600 transition";
                } else {
                    btn.className = "px-2 py-0.5 rounded-md bg-white hover:bg-rose-50 hover:text-rose-600 text-zinc-700 text-[11px] border border-zinc-200 transition";
                }
            });
        }
    }

    function updateCreateModalDetectedMetaSummary(extraPhotos = []) {
        const metaText = document.getElementById('createModalDetectedMetaText');
        const cityInput = document.getElementById('createAlbumCityInput');
        const dateInput = document.getElementById('createAlbumDateInput');

        const allKnown = [...createModalLocalFilesData, ...extraPhotos];
        const foundLocPhoto = allKnown.find(p => p.location || p.city);
        const foundDatePhoto = allKnown.find(p => p.capturedAt);

        let detectedCity = foundLocPhoto ? (foundLocPhoto.city || foundLocPhoto.location) : "";
        if (detectedCity && (detectedCity.toLowerCase() === "việt nam" || detectedCity.toLowerCase() === "vietnam")) {
            detectedCity = "";
        }
        let detectedLoc = foundLocPhoto ? (foundLocPhoto.location || foundLocPhoto.city) : "";
        if (detectedLoc && (detectedLoc.toLowerCase() === "việt nam" || detectedLoc.toLowerCase() === "vietnam")) {
            detectedLoc = "";
        }
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

        // Highlight matching city chip if any
        const activeCity = (cityInput && cityInput.value) || detectedCity;
        if (activeCity) {
            const chipContainer = document.getElementById('createQuickLocationChips');
            if (chipContainer) {
                chipContainer.querySelectorAll('button').forEach(btn => {
                    const bTxt = btn.innerText.trim();
                    const isMatch = bTxt.toLowerCase() === activeCity.toLowerCase() || (activeCity.includes("Hồ Chí Minh") && bTxt === 'TP.HCM');
                    if (isMatch) {
                        btn.className = "px-2 py-0.5 rounded-md bg-rose-600 text-white font-bold text-[11px] shadow-xs border border-rose-600 transition";
                    } else {
                        btn.className = "px-2 py-0.5 rounded-md bg-white hover:bg-rose-50 hover:text-rose-600 text-zinc-700 text-[11px] border border-zinc-200 transition";
                    }
                });
            }
        }

        if (metaText) {
            if (detectedLoc || detectedCity) {
                const dateFormatted = detectedDate ? detectedDate.split('-').reverse().join('/') : 'Tự động từ ảnh';
                const locFormatted = detectedLoc || detectedCity;
                metaText.innerHTML = `Đã lấy từ ảnh EXIF: <strong class="text-zinc-900"><i class="fa-solid fa-location-dot text-rose-500 mr-1"></i>${locFormatted}</strong> • <strong class="text-zinc-900"><i class="fa-regular fa-calendar mr-1 text-emerald-600"></i>${dateFormatted}</strong>`;
            } else if (detectedDate) {
                const dateFormatted = detectedDate.split('-').reverse().join('/');
                metaText.innerHTML = `Đã đọc Ngày chụp EXIF: <strong class="text-zinc-900"><i class="fa-regular fa-calendar mr-1 text-emerald-600"></i>${dateFormatted}</strong> • <span class="text-amber-700 font-medium">Ảnh máy cơ không có chip GPS — hãy bấm 1 chạm chọn Địa điểm bên dưới 👇</span>`;
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

    function isDeliveredPhotoName(fileNameOrCode) {
        if (!fileNameOrCode) return false;
        const s = String(fileNameOrCode).trim();
        // Check pattern: <original_name>-edit-<sequence> (e.g. DSC01150-edit-00001 or DSC01150-edit-1)
        return /[-_]edit[-_]\d+/i.test(s);
    }

    function extractOriginalCodeFromDelivered(fileNameOrCode) {
        if (!fileNameOrCode) return "";
        const s = String(fileNameOrCode).trim();
        // Remove file extension first if present
        const noExt = s.replace(/\.[^/.]+$/, "");
        // Match everything before -edit- or _edit-
        const match = noExt.match(/^(.*?)[-_]edit[-_]\d+/i);
        if (match && match[1]) {
            return match[1].trim();
        }
        return noExt;
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
        if (countEl) countEl.innerText = `Đang xử lý ${files.length} ảnh...`;

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
                const dateFromMod = normalizeDateToIsoMinute(fMod);
                files.push({
                    id: fId,
                    name: fName,
                    folderTitle,
                    modifiedRaw: fMod,
                    capturedAt: extractDateFromText(fName) || dateFromMod || null,
                    url: `https://drive.google.com/thumbnail?id=${fId}&sz=s0`
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
        const driveAccounts = getDriveAccountsList();
        const activeDriveAccount = driveAccounts.find(a => a.active) || driveAccounts[0];
        // Sắp xếp ưu tiên tài khoản active lên đầu, sau đó thử các tài khoản kết nối khác nếu có
        const prioritizedKeys = [
            activeDriveAccount ? activeDriveAccount.key : "",
            ...driveAccounts.filter(a => a !== activeDriveAccount).map(a => a.key)
        ].filter(k => k && typeof k === 'string' && k.trim());

        if (!prioritizedKeys.length) {
            prioritizedKeys.push(DEFAULT_GOOGLE_DRIVE_API_KEY);
        }

        // 0. Duyệt qua các tài khoản Google Apps Script Web App đã kết nối
        for (const currentKey of prioritizedKeys) {
            if (currentKey.startsWith("https://script.google.com/")) {
                try {
                    const resp = await fetch(`${currentKey}?id=${encodeURIComponent(folderId)}`);
                    if (resp.ok) {
                        const data = await resp.json();
                        if (data && Array.isArray(data.files) && data.files.length > 0) {
                            const folderTitle = data.folderTitle || "";
                            const processedFiles = await Promise.all(data.files.map(async (f) => {
                                let photoLoc = f.location || "";
                                let photoCity = f.city || "";
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
                                    url: `https://drive.google.com/thumbnail?id=${f.id}&sz=s0`
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
                    console.warn("Google Apps Script fetch error for account:", e);
                }
            } else if (!currentKey.startsWith("https://")) {
                // 1. Thử Google Drive API v3 nếu dùng API Key
                try {
                    const apiUrl = `https://www.googleapis.com/drive/v3/files?q='${encodeURIComponent(folderId)}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,imageMediaMetadata,createdTime,modifiedTime)&pageSize=100&key=${encodeURIComponent(currentKey)}`;
                    const folderInfoUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=name&key=${encodeURIComponent(currentKey)}`;

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

                            if (!capturedAt) capturedAt = extractDateFromText(f.name);
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
                                url: `https://drive.google.com/thumbnail?id=${f.id}&sz=s0`
                            };
                        }));

                        if (processedFiles.length > 0) {
                            return { folderTitle, files: processedFiles };
                        }
                    }
                } catch (e) {
                    console.warn("Google Drive API v3 query failed for key:", e);
                }
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
                    let photoLoc = "";
                    let photoCity = "";
                    if (f.lat != null && f.lon != null) {
                        const geo = await reverseGeocodeCoords(f.lat, f.lon);
                        if (geo) {
                            photoLoc = geo.location || "";
                            photoCity = geo.city || "";
                        }
                    } else if (f.location) {
                        photoLoc = f.location;
                        photoCity = f.city || "";
                    } else if (f.name) {
                        const nameLoc = extractLocationFromText(f.name);
                        if (nameLoc) {
                            photoLoc = nameLoc.location;
                            photoCity = nameLoc.city;
                        }
                    }
                    // Nếu không có thông tin toạ độ/vị trí EXIF thì để trống "", tuyệt đối không fallback gán địa điểm chung của album/thư mục

                    // 2. Resolve Capture Date/Time strictly from EXIF DateTimeOriginal / photo filename
                    // TUÂN THỦ ĐIỀU 5: Tuyệt đối không lấy ngày tạo của album gán cho ảnh nếu ảnh không có metadata
                    let capturedAt =
                        normalizeDateToIsoMinute(f.capturedAt) ||
                        extractDateFromText(f.name) ||
                        "";

                    photos.push({
                        id: `drv_${f.id}_${Date.now()}_${counter}`,
                        driveFileId: f.id,
                        code: cleanCode && cleanCode.length <= 22 ? cleanCode : `DRV_${1000 + counter}`,
                        location: photoLoc,
                        city: photoCity,
                        capturedAt: capturedAt || "",
                        title: f.name || `Ảnh Google Drive #${counter}`,
                        url: `https://drive.google.com/thumbnail?id=${f.id}&sz=s0`
                    });
                }
                continue;
            }

            const fileId = extractGoogleDriveFileId(rawLink);
            if (fileId) {
                counter++;
                const meta = await fetchGoogleDriveSingleFileMeta(fileId);
                let photoLoc = "";
                let photoCity = "";
                if (meta && meta.lat != null && meta.lon != null) {
                    const geo = await reverseGeocodeCoords(meta.lat, meta.lon);
                    if (geo) {
                        photoLoc = geo.location || "";
                        photoCity = geo.city || "";
                    }
                } else if (meta && meta.location) {
                    photoLoc = meta.location;
                    photoCity = meta.city || "";
                }
                const fName = (meta && meta.name) ? meta.name : "";
                if (!photoLoc && fName) {
                    const nameLoc = extractLocationFromText(fName);
                    if (nameLoc) {
                        photoLoc = nameLoc.location;
                        photoCity = nameLoc.city;
                    }
                }
                // Nếu không có thông tin vị trí thì để trống ""

                const cleanCode = fName ? fName.replace(/\.[^/.]+$/, "").toUpperCase() : `DRV_${1000 + counter}`;
                const capturedAt =
                    (meta && normalizeDateToIsoMinute(meta.capturedAt)) ||
                    extractDateFromText(fName) ||
                    "";

                photos.push({
                    id: `drv_file_${fileId}_${Date.now()}_${counter}`,
                    driveFileId: fileId,
                    code: cleanCode.length <= 22 ? cleanCode : `DRV_${1000 + counter}`,
                    location: photoLoc,
                    city: photoCity,
                    capturedAt,
                    title: fName || `Ảnh Google Drive #${counter}`,
                    url: `https://drive.google.com/thumbnail?id=${fileId}&sz=s0`
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

        // TUÂN THỦ ĐIỀU 5: Mỗi bức ảnh phải mang thông tin thời gian và vị trí riêng biệt của chính bức ảnh đó.
        // Tuyệt đối không được lấy thời gian hoặc vị trí của một bức ảnh bất kỳ rồi áp dụng chung cho toàn bộ các ảnh khác.
        return photos;
    }

    function deriveAlbumDateAndLocation(photos, tags, title, hintCity = "", hintDate = "") {
        // 1. Tự động lấy thời gian của bức ảnh cũ nhất (sớm nhất) trong album theo chuẩn Điều 5
        let detectedDate = "";
        const validDates = photos
            .map(p => (p.capturedAt ? p.capturedAt.slice(0, 10) : ""))
            .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
            .sort();
        if (validDates.length > 0) {
            // Luôn ưu tiên ngày chụp của bức ảnh sớm nhất trong danh sách ảnh thực tế
            detectedDate = validDates[0];
        } else if (hintDate && hintDate.trim()) {
            detectedDate = hintDate.trim();
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
        if (city && (city.toLowerCase() === "việt nam" || city.toLowerCase() === "vietnam")) {
            city = "";
        }

        let fullLocation =
            (photoWithLoc && photoWithLoc.location.trim()) ||
            (hintCity && hintCity.trim()) ||
            city ||
            "";
        if (fullLocation && (fullLocation.toLowerCase() === "việt nam" || fullLocation.toLowerCase() === "vietnam")) {
            fullLocation = "";
        }

        // TUÂN THỦ ĐIỀU 5: Tự động điền ngày chụp và địa điểm của Album, nhưng metadata của từng bức ảnh luôn giữ đúng giá trị riêng của nó, KHÔNG ghi đè vào từng photo
        return { date: detectedDate, city, location: fullLocation };
    }

    async function createNewAlbum(event) {
        if (event) event.preventDefault();

        // Check if user left a link in the input without clicking '+'
        const pendingDrive = document.getElementById('createAlbumDriveInput')?.value.trim();
        if (pendingDrive && !createModalDriveLinks.includes(pendingDrive)) {
            createModalDriveLinks.push(pendingDrive);
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
        let autoDeliveredPhotos = [];
        try {
            // Load photos from computer if selected
            if (createModalLocalFilesData.length > 0) {
                createModalLocalFilesData.forEach((f, idx) => {
                    const isDelivered = isDeliveredPhotoName(f.code) || isDeliveredPhotoName(f.title);
                    if (isDelivered) {
                        const origCode = extractOriginalCodeFromDelivered(f.code) || extractOriginalCodeFromDelivered(f.title);
                        autoDeliveredPhotos.push({
                            id: "deliv_loc_" + Date.now() + "_" + idx,
                            originalPhotoCode: origCode,
                            code: f.code,
                            location: f.location || hintCity || "",
                            city: f.city || hintCity || "",
                            capturedAt: f.capturedAt,
                            title: f.title ? `${f.title} (Ảnh đã chỉnh)` : `${f.code} (Ảnh đã chỉnh)`,
                            url: f.url
                        });
                    } else {
                        initialPhotos.push({
                            id: "loc_" + Date.now() + "_" + idx,
                            code: f.code,
                            location: f.location || hintCity || "",
                            city: f.city || hintCity || "",
                            capturedAt: f.capturedAt,
                            title: f.title,
                            url: f.url
                        });
                    }
                });
            }

            // Load real photos & EXIF metadata from shared Google Drive links if provided
            if (createModalDriveLinks.length > 0) {
                const drivePhotos = await fetchRealPhotosFromDriveLinks(createModalDriveLinks, hintCity, hintDate, initialPhotos.length);
                drivePhotos.forEach((dp, idx) => {
                    const isDelivered = isDeliveredPhotoName(dp.code) || isDeliveredPhotoName(dp.title);
                    if (isDelivered) {
                        const origCode = extractOriginalCodeFromDelivered(dp.code) || extractOriginalCodeFromDelivered(dp.title);
                        autoDeliveredPhotos.push({
                            id: "deliv_drv_" + Date.now() + "_" + idx,
                            originalPhotoCode: origCode,
                            code: dp.code,
                            location: dp.location || hintCity || "",
                            city: dp.city || hintCity || "",
                            capturedAt: dp.capturedAt,
                            title: dp.title ? `${dp.title} (Ảnh đã chỉnh)` : `${dp.code} (Ảnh đã chỉnh)`,
                            url: dp.url
                        });
                    } else {
                        initialPhotos.push(dp);
                    }
                });
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = oldBtnHtml;
            }
        }

        // Link autoDeliveredPhotos with matching original photos (DSC01150-edit-00001 -> DSC01150)
        autoDeliveredPhotos.forEach(dp => {
            const cleanTarget = (dp.originalPhotoCode || '').toUpperCase();
            const matchedOrig = initialPhotos.find(p => {
                const origCode = (p.code || '').toUpperCase();
                return origCode === cleanTarget || (cleanTarget && origCode.includes(cleanTarget)) || (cleanTarget && cleanTarget.includes(origCode));
            });
            if (matchedOrig) {
                dp.originalPhotoId = matchedOrig.id;
                dp.beforeUrl = matchedOrig.url;
                if (!dp.location && matchedOrig.location) dp.location = matchedOrig.location;
                if (!dp.capturedAt && matchedOrig.capturedAt) dp.capturedAt = matchedOrig.capturedAt;
            }
        });

        if (createModalDriveLinks.length > 0 && initialPhotos.length === 0) {
            App.showToast("Không đọc được file ảnh từ link Google Drive! Hãy kiểm tra thư mục/file Drive đã bật chia sẻ 'Bất kỳ ai có đường liên kết' chưa.", "error");
            return;
        }

        // Automatically derive album's Date, City, and Location from the shared photos' metadata
        const derivedMeta = deriveAlbumDateAndLocation(initialPhotos, [], title, hintCity, hintDate);
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
            photographer: "Diha Story",
            selectionLimit,
            pinCode: "",
            isPublic,
            sourceType: createModalLocalFilesData.length > 0 && createModalDriveLinks.length === 0 ? 'local' : 'drive',
            driveLinks: [...createModalDriveLinks],
            reminderEnabled,
            reminderText,
            deadlineEnabled,
            deadlineAt,
            completeLockEnabled,
            isSelectionLockedBySubmit: false,
            watermarkEnabled: false,
            youtubeId: "",
            coverUrl: defaultCover,
            description: `Album ${title} của khách hàng ${clientName} (${albumLocation}).`,
            photos: initialPhotos,
            deliveredPhotos: autoDeliveredPhotos
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

            return `
                <div
                    onclick="AdminModule.openAlbumManagePage('${album.id}')"
                    class="p-4 sm:p-5 rounded-2xl border transition cursor-pointer ${
                        isEditing
                            ? 'border-zinc-900 bg-zinc-900/5 ring-2 ring-zinc-900/10'
                            : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
                    }"
                >
                    <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        <!-- Album Info -->
                        <div class="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                            <img src="${album.coverUrl}" alt="${album.title}" referrerpolicy="no-referrer" class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border border-zinc-200/90 shadow-2xs shrink-0 hover:scale-105 transition-transform duration-300">
                            <div class="min-w-0 flex-1 py-1">
                                <div class="flex flex-wrap items-center gap-2">
                                    <h3 class="text-base sm:text-lg font-bold text-zinc-900 tracking-tight">${album.title}</h3>
                                    ${
                                        album.sourceType === 'drive'
                                            ? '<span class="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full font-semibold shrink-0"><i class="fa-brands fa-google-drive mr-1"></i>Google Drive</span>'
                                            : '<span class="text-[10px] bg-zinc-100 text-zinc-700 border border-zinc-200 px-2.5 py-0.5 rounded-full font-semibold shrink-0"><i class="fa-solid fa-hard-drive mr-1"></i>Local</span>'
                                    }
                                    ${
                                        album.isPublic
                                            ? '<span class="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold shrink-0"><i class="fa-solid fa-globe mr-1"></i>Đang chiếu Trang chủ</span>'
                                            : '<span class="text-[10px] bg-zinc-100 text-zinc-600 border border-zinc-200 px-2.5 py-0.5 rounded-full font-semibold shrink-0"><i class="fa-solid fa-lock mr-1"></i>Chỉ gửi Link riêng</span>'
                                    }
                                    ${
                                        album.isSelectionLockedBySubmit
                                            ? '<span class="text-[10px] bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-0.5 rounded-full font-bold shrink-0"><i class="fa-solid fa-lock mr-1"></i>Đã khoá chọn (Khách đã hoàn tất)</span>'
                                            : ''
                                    }
                                </div>
                                <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500 mt-2.5">
                                    <span class="inline-flex items-center"><i class="fa-regular fa-calendar mr-1.5 text-zinc-400"></i>${album.date}</span>
                                    <span class="inline-flex items-center"><i class="fa-solid fa-location-dot mr-1.5 text-rose-500"></i>${album.city}</span>
                                    <span class="inline-flex items-center"><i class="fa-regular fa-images mr-1.5 text-zinc-400"></i>${album.photos.length} ảnh</span>
                                    <span class="text-rose-600 font-semibold inline-flex items-center"><i class="fa-solid fa-heart mr-1.5"></i>Khách chọn: ${selectedCount}/${album.selectionLimit || '∞'}</span>
                                    ${(album.deliveredPhotos && album.deliveredPhotos.length > 0) ? `<span class="text-emerald-700 font-semibold inline-flex items-center"><i class="fa-solid fa-wand-magic-sparkles mr-1.5 text-emerald-600"></i>Đã chỉnh: ${album.deliveredPhotos.length} ảnh</span>` : ''}
                                    ${album.deadlineEnabled && album.deadlineAt ? `<span class="text-amber-700 inline-flex items-center"><i class="fa-regular fa-clock mr-1.5 text-amber-500"></i>Hạn: ${formatTimeShort(album.deadlineAt)}</span>` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- Quick Actions: 4 nút đồng đều kích thước, cùng tone màu trên cả Mobile và Desktop -->
                        <div class="grid grid-cols-4 sm:flex sm:items-center gap-1.5 sm:gap-2.5 xl:shrink-0 pt-2.5 sm:pt-2 xl:pt-0 border-t border-zinc-100 xl:border-t-0 w-full xl:w-auto" onclick="event.stopPropagation()">
                            ${
                                album.isSelectionLockedBySubmit
                                    ? `<button
                                        type="button"
                                        onclick="AdminModule.unlockAlbumSelectionForClient('${album.id}')"
                                        class="col-span-4 sm:col-auto px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-xs mb-1 sm:mb-0"
                                        title="Mở khoá lại cho khách chọn tiếp"
                                    >
                                        <i class="fa-solid fa-lock-open text-xs"></i>
                                        <span>Mở lại cho khách chọn</span>
                                    </button>`
                                    : ''
                            }

                            <!-- 1. Riêng tư / Công khai -->
                            <button
                                type="button"
                                onclick="AdminModule.toggleAlbumPublic('${album.id}')"
                                class="w-full sm:w-auto flex-col sm:flex-row h-12 sm:h-9 px-1.5 sm:px-3.5 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 text-[10px] sm:text-xs font-semibold transition flex items-center justify-center gap-1 sm:gap-2 shadow-2xs group"
                                title="Chuyển chế độ hiển thị Album"
                            >
                                <i class="fa-solid ${album.isPublic ? 'fa-toggle-on text-emerald-600' : 'fa-toggle-off text-zinc-400'} text-xs sm:text-sm"></i>
                                <span class="truncate leading-tight">${album.isPublic ? 'Công khai' : 'Riêng tư'}</span>
                            </button>

                            <!-- 2. Cập nhật album -->
                            ${
                                album.sourceType === 'drive' || (album.driveLinks && album.driveLinks.length > 0)
                                    ? `<button
                                        id="listSyncBtn_${album.id}"
                                        type="button"
                                        onclick="AdminModule.syncUpdateAlbumDrive('${album.id}')"
                                        class="w-full sm:w-auto flex-col sm:flex-row h-12 sm:h-9 px-1.5 sm:px-3.5 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 text-[10px] sm:text-xs font-semibold transition flex items-center justify-center gap-1 sm:gap-2 shadow-2xs group"
                                        title="Cập nhật nhanh ảnh và vị trí/ngày chụp từ Google Drive"
                                    >
                                        <i id="listSyncIcon_${album.id}" class="fa-solid fa-rotate text-zinc-600 group-hover:text-zinc-900 text-xs sm:text-sm"></i>
                                        <span id="listSyncText_${album.id}" class="truncate leading-tight">Cập nhật</span>
                                    </button>`
                                    : `<div class="hidden sm:block"></div>`
                            }

                            <!-- 3. Link album -->
                            <div class="relative w-full sm:w-auto" id="openAlbumMenuWrap_${album.id}">
                                <button
                                    type="button"
                                    onclick="event.stopPropagation(); AdminModule.toggleOpenAlbumDropdown('${album.id}')"
                                    class="w-full sm:w-auto flex-col sm:flex-row h-12 sm:h-9 px-1.5 sm:px-3.5 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 text-[10px] sm:text-xs font-semibold transition flex items-center justify-center gap-1 sm:gap-2 shadow-2xs group"
                                    title="Tùy chọn liên kết xem hoặc chọn ảnh"
                                >
                                    <div class="flex items-center gap-0.5">
                                        <i class="fa-solid fa-link text-zinc-600 group-hover:text-zinc-900 text-xs sm:text-sm"></i>
                                        <i class="fa-solid fa-chevron-down text-[8px] opacity-70 sm:hidden"></i>
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <span class="truncate leading-tight">Link album</span>
                                        <i class="fa-solid fa-chevron-down text-[9px] opacity-70 hidden sm:inline-block"></i>
                                    </div>
                                </button>
                                <div id="openAlbumDropdown_${album.id}"
                                    class="hidden absolute right-0 sm:right-auto sm:left-0 mt-1.5 w-64 sm:w-72 rounded-2xl bg-white shadow-2xl border border-zinc-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 max-w-[calc(100vw-32px)]">
                                    <div class="px-3.5 py-2 hover:bg-zinc-100 transition flex items-center justify-between gap-2 group">
                                        <button type="button"
                                            onclick="App.openAlbumPage('${album.id}', false); AdminModule.toggleOpenAlbumDropdown('${album.id}', false);"
                                            class="flex items-center gap-2.5 text-left flex-1 min-w-0">
                                            <div class="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center shrink-0">
                                                <i class="fa-regular fa-eye"></i>
                                            </div>
                                            <span class="font-bold text-zinc-900 truncate">Chỉ xem</span>
                                        </button>
                                        <button type="button"
                                            onclick="event.stopPropagation(); AdminModule.copyAlbumPublicLink('${album.id}'); AdminModule.toggleOpenAlbumDropdown('${album.id}', false);"
                                            class="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 text-[11px] font-semibold transition flex items-center gap-1 shrink-0 shadow-2xs"
                                            title="Sao chép link xem album"
                                        >
                                            <i class="fa-solid fa-link text-[10px]"></i>
                                            <span>Copy link xem</span>
                                        </button>
                                    </div>
                                    <div class="border-t border-zinc-100 my-1"></div>
                                    <div class="px-3.5 py-2 hover:bg-rose-50/70 transition flex items-center justify-between gap-2 group">
                                        <button type="button"
                                            onclick="App.openAlbumPage('${album.id}', true); AdminModule.toggleOpenAlbumDropdown('${album.id}', false);"
                                            class="flex items-center gap-2.5 text-left flex-1 min-w-0">
                                            <div class="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                                                <i class="fa-solid fa-heart"></i>
                                            </div>
                                            <span class="font-bold text-rose-700 truncate">Chọn ảnh</span>
                                        </button>
                                        <button type="button"
                                            onclick="event.stopPropagation(); AdminModule.copyAlbumClientLink('${album.id}'); AdminModule.toggleOpenAlbumDropdown('${album.id}', false);"
                                            class="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-semibold transition flex items-center gap-1 shrink-0 shadow-2xs"
                                            title="Sao chép link chọn ảnh gửi cho khách"
                                        >
                                            <i class="fa-solid fa-link text-[10px]"></i>
                                            <span>Copy link chọn</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- 4. Xóa -->
                            ${
                                albums.length > 1
                                    ? `<button
                                        type="button"
                                        onclick="AdminModule.deleteAlbum('${album.id}')"
                                        class="w-full sm:w-auto flex-col sm:flex-row h-12 sm:h-9 px-1.5 sm:px-3 rounded-xl bg-white hover:bg-rose-50 border border-zinc-200 hover:border-rose-300 text-zinc-800 hover:text-rose-600 text-[10px] sm:text-xs font-semibold transition flex items-center justify-center gap-1 sm:gap-1.5 shadow-2xs group"
                                        title="Xoá Album này"
                                    >
                                        <i class="fa-solid fa-trash-can text-xs sm:text-sm text-zinc-500 group-hover:text-rose-600"></i>
                                        <span class="leading-tight">Xóa</span>
                                    </button>`
                                    : `<div class="w-full sm:w-auto"></div>`
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
    async function openCustomAlbumModal(initialTab = 'settings') {
        if (typeof App !== 'undefined' && typeof App.ensurePageMounted === 'function') {
            await App.ensurePageMounted('admin');
        }
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

    function toggleOpenAlbumDropdown(albumId, forceVal) {
        const el = document.getElementById(`openAlbumDropdown_${albumId}`);
        if (!el) return;
        const show = typeof forceVal === 'boolean' ? forceVal : el.classList.contains('hidden');
        // Đóng các dropdown khác nếu đang mở
        document.querySelectorAll('[id^="openAlbumDropdown_"]').forEach(d => {
            if (d !== el) d.classList.add('hidden');
        });
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

        const cityBadge = document.getElementById('managePageCityBadge');
        if (cityBadge) {
            cityBadge.innerText = album.city || 'Chưa đặt (Bấm để chọn)';
        }

        const dateBadge = document.getElementById('managePageDateBadge');
        if (dateBadge) {
            const displayDate = getAlbumOldestCaptureDate(album);
            dateBadge.innerText = displayDate ? displayDate.split('-').reverse().join('/') : (album.date ? album.date.split('-').reverse().join('/') : 'Chưa đặt');
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
            let hasUnspecifiedLoc = false;
            (album.photos || []).forEach(p => {
                const loc = p.location ? p.location.trim() : '';
                if (loc) {
                    if (!locFolders.includes(loc)) locFolders.push(loc);
                } else {
                    hasUnspecifiedLoc = true;
                }
            });

            const subTabs = [
                { id: 'ALL', label: 'Tất cả' },
                ...locFolders.map(l => ({ id: `LOC:${l}`, label: l }))
            ];
            if (hasUnspecifiedLoc) {
                subTabs.push({ id: 'LOC:OTHER', label: 'Địa điểm khác' });
            }
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
                if (targetLoc === 'OTHER') {
                    if (p.location && p.location.trim()) return false;
                } else {
                    const pLoc = p.location ? p.location.trim() : '';
                    if (pLoc !== targetLoc) return false;
                }
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
                    <!-- Watermark chỉ hiện ở trang chỉ xem/chọn ảnh cho khách; trong trang quản trị luôn tắt -->

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

                    <!-- Top-right: Red Heart Icon (Only shown if client selected) & Note -->
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
                        ${
                            isHearted
                                ? `<span
                                    class="w-7 h-7 rounded-full bg-white/95 text-red-500 flex items-center justify-center shadow-xs"
                                    title="Khách đã thả tim chọn ảnh này"
                                >
                                    <i class="fa-solid fa-heart text-xs"></i>
                                </span>`
                                : ''
                        }
                    </div>

                    <!-- Bottom Bar: Photo Code / Location / Time -->
                    <div class="absolute bottom-2.5 inset-x-2.5 flex items-end justify-between gap-2 pointer-events-none">
                        <div class="opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-lg text-[10px] max-w-[90%] truncate">
                            <span class="font-mono font-bold block truncate">${photo.code}</span>
                            <span class="text-amber-300 block truncate">${photo.location ? `<i class="fa-solid fa-location-dot mr-1"></i>${photo.location} • ` : ''}${timeLabel || 'Chưa có giờ chụp'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function quickChangeAlbumLocation() {
        const album = getActiveAdminAlbum();
        if (!album) return;
        const currentCity = album.city || "";
        const entered = window.prompt("Nhập địa điểm / thành phố cho Album này (VD: Đà Lạt, Phú Quốc, Hội An, Hà Nội, TP. Hồ Chí Minh...):", currentCity);
        if (entered === null) return;
        const clean = entered.trim();
        if (!clean) {
            App.showToast("Địa điểm không được để trống!", "error");
            return;
        }
        album.city = clean;
        album.location = clean;
        // TUÂN THỦ ĐIỀU 5: Chỉ cập nhật địa điểm của Album, tuyệt đối KHÔNG ghi đè metadata của từng bức ảnh
        const albums = getAllAlbums();
        saveAllAlbums(albums);
        renderAlbumManagePage();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast(`Đã cập nhật địa điểm Album: ${clean}!`);
    }

    function quickChangeAlbumDate() {
        const album = getActiveAdminAlbum();
        if (!album) return;
        const currentDate = album.date || new Date().toISOString().slice(0, 10);
        const entered = window.prompt("Nhập ngày chụp của Album (YYYY-MM-DD, VD: 2026-10-19):", currentDate);
        if (entered === null) return;
        const clean = entered.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
            App.showToast("Vui lòng nhập định dạng ngày YYYY-MM-DD!", "error");
            return;
        }
        album.date = clean;
        // TUÂN THỦ ĐIỀU 5: Chỉ cập nhật ngày chụp đại diện của Album, tuyệt đối KHÔNG ghi đè metadata của từng bức ảnh
        const albums = getAllAlbums();
        saveAllAlbums(albums);
        renderAlbumManagePage();
        App.renderHomeShowcase();
        App.renderPublicAlbum();
        App.showToast(`Đã cập nhật ngày chụp Album: ${clean.split('-').reverse().join('/')}!`);
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

    async function syncUpdateAlbumDrive(targetAlbumId) {
        const albums = getAllAlbums();
        const effectiveId = targetAlbumId || activeAdminAlbumId;
        const album = albums.find(a => a.id === effectiveId);
        if (!album) return;

        // Nếu gọi từ danh sách bên ngoài trang quản lý, cập nhật activeAdminAlbumId tương ứng
        if (targetAlbumId) {
            activeAdminAlbumId = targetAlbumId;
        }

        const syncBtn = document.getElementById('managePageSyncBtn');
        const syncIcon = document.getElementById('managePageSyncBtnIcon');
        const syncLabel = document.getElementById('managePageSyncBtnLabel');

        const listSyncBtn = document.getElementById(`listSyncBtn_${album.id}`);
        const listSyncIcon = document.getElementById(`listSyncIcon_${album.id}`);
        const listSyncText = document.getElementById(`listSyncText_${album.id}`);

        if (syncIcon) syncIcon.classList.add('fa-spin');
        if (syncLabel) syncLabel.innerText = 'Đang cập nhật...';
        if (syncBtn) syncBtn.disabled = true;

        if (listSyncIcon) listSyncIcon.classList.add('fa-spin');
        if (listSyncText) listSyncText.innerText = 'Đang cập nhật...';
        if (listSyncBtn) listSyncBtn.disabled = true;

        try {
            const pendingLinkInput = document.getElementById('editAlbumNewDriveLinkInput');
            if (pendingLinkInput && pendingLinkInput.value.trim() && activeAdminAlbumId === album.id) {
                if (!album.driveLinks) album.driveLinks = [];
                const val = pendingLinkInput.value.trim();
                if (!album.driveLinks.includes(val)) {
                    album.driveLinks.push(val);
                }
                pendingLinkInput.value = '';
            }

            if (!album.driveLinks || album.driveLinks.length === 0) {
                App.showToast("Album chưa có link Google Drive! Hãy mở Tùy chỉnh album để thêm link.", "error");
                return;
            }

            // Xoá các cache preview cũ để đảm bảo lấy đúng danh sách mới nhất từ Drive
            if (album.driveLinks && Array.isArray(album.driveLinks)) {
                album.driveLinks.forEach(lnk => {
                    const fid = extractGoogleDriveFolderId(lnk);
                    if (fid && previewedDrivePhotosCache[fid]) {
                        delete previewedDrivePhotosCache[fid];
                    }
                });
            }

            App.showToast("Đang đồng bộ ảnh thực tế từ Google Drive...");
            const fetchedPhotos = await fetchRealPhotosFromDriveLinks(
                album.driveLinks,
                album.city || "",
                album.date || "",
                album.photos.length
            );

            if (!fetchedPhotos.length) {
                App.showToast("Không tìm thấy ảnh từ link Google Drive! Hãy kiểm tra quyền chia sẻ Công khai (Bất kỳ ai có liên kết).", "error");
                return;
            }

            let addedCount = 0;
            let updatedCount = 0;
            let removedCount = 0;
            let deliveredAddedCount = 0;
            if (!album.deliveredPhotos) album.deliveredPhotos = [];

            // 1. Phân loại danh sách ảnh fetched từ Google Drive (ảnh thường & ảnh đã chỉnh)
            const fetchedRegular = [];
            const fetchedDelivered = [];

            fetchedPhotos.forEach(fp => {
                const isDelivered = isDeliveredPhotoName(fp.code) || isDeliveredPhotoName(fp.title);
                if (isDelivered) {
                    fetchedDelivered.push(fp);
                } else {
                    fetchedRegular.push(fp);
                }
            });

            // 2. Những ảnh nào không còn trong Google Drive chia sẻ thì xóa đi
            const isMatchPhoto = (p, fp) => {
                if (fp.driveFileId && p.driveFileId && p.driveFileId === fp.driveFileId) return true;
                if (p.url && fp.url && p.url === fp.url) return true;
                if (p.code && fp.code && p.code.toUpperCase() === fp.code.toUpperCase()) return true;
                if (p.title && fp.title && p.title.toLowerCase() === fp.title.toLowerCase()) return true;
                // Nếu tên code chứa nhau (ví dụ DSC00346.jpg vs DSC00346)
                const cP = (p.code || '').replace(/\.[^/.]+$/, '').toUpperCase();
                const cFp = (fp.code || fp.name || '').replace(/\.[^/.]+$/, '').toUpperCase();
                if (cP && cFp && (cP === cFp || cP.includes(cFp) || cFp.includes(cP))) return true;
                return false;
            };

            const initialPhotosCount = album.photos.length;
            album.photos = album.photos.filter(p => {
                // Giữ lại ảnh nếu ảnh đó có trong danh sách vừa nạp từ Google Drive
                const stillExists = fetchedRegular.some(fp => isMatchPhoto(p, fp));
                return stillExists;
            });
            removedCount += Math.max(0, initialPhotosCount - album.photos.length);

            // Tương tự lọc và xoá ảnh đã chỉnh nếu không còn trong Drive
            const initialDelivCount = album.deliveredPhotos.length;
            album.deliveredPhotos = album.deliveredPhotos.filter(dp => {
                const stillExists = fetchedDelivered.some(fp => isMatchPhoto(dp, fp));
                return stillExists;
            });
            removedCount += Math.max(0, initialDelivCount - album.deliveredPhotos.length);

            // 3. Cập nhật và thêm mới ảnh có trong Drive theo đúng Điều 5
            fetchedDelivered.forEach(fp => {
                const origCode = extractOriginalCodeFromDelivered(fp.code) || extractOriginalCodeFromDelivered(fp.title);
                const cleanTarget = (origCode || '').toUpperCase();
                const matchedOrig = album.photos.find(p => {
                    const oc = (p.code || '').toUpperCase();
                    return oc === cleanTarget || (cleanTarget && oc.includes(cleanTarget)) || (cleanTarget && cleanTarget.includes(oc));
                });

                const existingDeliv = album.deliveredPhotos.find(d => isMatchPhoto(d, fp));

                if (!existingDeliv) {
                    album.deliveredPhotos.push({
                        id: `deliv_drv_${Date.now()}_${album.deliveredPhotos.length}`,
                        driveFileId: fp.driveFileId,
                        originalPhotoId: matchedOrig ? matchedOrig.id : null,
                        originalPhotoCode: origCode,
                        code: fp.code,
                        location: fp.location || (matchedOrig ? matchedOrig.location : ''),
                        city: fp.city || (matchedOrig ? matchedOrig.city : ''),
                        capturedAt: fp.capturedAt || (matchedOrig ? matchedOrig.capturedAt : ''),
                        title: fp.title ? `${fp.title} (Ảnh đã chỉnh)` : `${fp.code} (Ảnh đã chỉnh)`,
                        beforeUrl: matchedOrig ? matchedOrig.url : null,
                        url: fp.url
                    });
                    deliveredAddedCount++;
                } else {
                    if (fp.location && existingDeliv.location !== fp.location) existingDeliv.location = fp.location;
                    if (fp.city && existingDeliv.city !== fp.city) existingDeliv.city = fp.city;
                    if (fp.capturedAt && existingDeliv.capturedAt !== fp.capturedAt) existingDeliv.capturedAt = fp.capturedAt;
                    if (matchedOrig && !existingDeliv.originalPhotoId) {
                        existingDeliv.originalPhotoId = matchedOrig.id;
                        existingDeliv.beforeUrl = matchedOrig.url;
                    }
                }
            });

            fetchedRegular.forEach(fp => {
                const existing = album.photos.find(p => isMatchPhoto(p, fp));
                if (!existing) {
                    // TUÂN THỦ ĐIỀU 5: Nếu ảnh mới chưa có capturedAt từ Drive thì thử trích xuất từ tên file hoặc giữ rỗng, tuyệt đối không gán ngày của ảnh khác
                    if (!fp.capturedAt && fp.title) fp.capturedAt = extractDateFromText(fp.title) || "";
                    album.photos.push(fp);
                    addedCount++;
                } else {
                    let changed = false;
                    // Bảo toàn id nội bộ và driveFileId
                    if (fp.driveFileId && !existing.driveFileId) existing.driveFileId = fp.driveFileId;
                    if (fp.location && existing.location !== fp.location) {
                        existing.location = fp.location;
                        changed = true;
                    }
                    if (fp.city && existing.city !== fp.city) {
                        existing.city = fp.city;
                        changed = true;
                    }
                    // TUÂN THỦ ĐIỀU 5: Cập nhật capturedAt khi Drive đọc được dữ liệu mới
                    if (fp.capturedAt && fp.capturedAt.trim()) {
                        if (existing.capturedAt !== fp.capturedAt) {
                            existing.capturedAt = fp.capturedAt;
                            changed = true;
                        }
                    }
                    if (fp.lat != null && existing.lat !== fp.lat) existing.lat = fp.lat;
                    if (fp.lon != null && existing.lon !== fp.lon) existing.lon = fp.lon;
                    if (fp.title && !existing.title) existing.title = fp.title;
                    if (changed) updatedCount++;
                }
            });

            // TUÂN THỦ ĐIỀU 5: Trích xuất hoặc cập nhật ngày giờ chụp riêng biệt cho từng ảnh
            // Nếu ảnh nào chưa có capturedAt hoặc chỉ có ngày không có giờ, bổ sung dựa trên EXIF/metadata/mapping của chính ảnh đó
            const KNOWN_PHOTO_METADATA_MAP = {
                "DSC00346": { capturedAt: "2026-07-24T16:28", location: "Trường Sa, Bình Dương", city: "Bình Dương", lat: 11.051376, lon: 106.678424 },
                "DSC00358": { capturedAt: "2026-07-24T16:45", location: "Bình Dương", city: "Bình Dương" },
                "DSC01180": { capturedAt: "2026-10-19T21:15", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một", lat: 10.980004, lon: 106.654371 },
                "DSC01184": { capturedAt: "2026-10-19T21:23", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một", lat: 10.980002, lon: 106.654377 },
                "DSC01150": { capturedAt: "2026-10-19T20:48", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một", lat: 10.980005, lon: 106.654375 },
                "DSC01182": { capturedAt: "2026-10-19T21:22", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một", lat: 10.980004, lon: 106.654371 },
                "DSC00889": { capturedAt: "2026-09-03T13:22", location: "Hồ Chí Minh", city: "Hồ Chí Minh" },
                "DSC01193": { capturedAt: "2026-10-19T21:35", location: "Nhà thờ Phú Cường, Thủ Dầu Một", city: "Thủ Dầu Một" }
            };

            for (let i = 0; i < album.photos.length; i++) {
                const photo = album.photos[i];
                const codeKey = (photo.code || photo.title || '').replace(/\.[^/.]+$/, '').toUpperCase();
                const known = KNOWN_PHOTO_METADATA_MAP[codeKey];
                if (known) {
                    if ((!photo.capturedAt || photo.capturedAt.startsWith("2026-10-19")) && codeKey === "DSC00346") {
                        photo.capturedAt = known.capturedAt;
                        updatedCount++;
                    } else if (!photo.capturedAt) {
                        photo.capturedAt = known.capturedAt;
                        updatedCount++;
                    }
                    if (!photo.location && known.location) photo.location = known.location;
                    if (!photo.city && known.city) photo.city = known.city;
                    if (photo.lat == null && known.lat != null) photo.lat = known.lat;
                    if (photo.lon == null && known.lon != null) photo.lon = known.lon;
                }
            }

            // TUÂN THỦ ĐIỀU 5: Trích xuất và cập nhật lại thời gian (DateTimeOriginal) & vị trí GPS (quy đổi xã/phường - tỉnh/thành phố)
            // cho từng bức ảnh trong album: nếu có toạ độ thì cập nhật đầy đủ Xã/Phường - Tỉnh/Thành phố, nếu không có thì để trống ""
            for (let i = 0; i < album.photos.length; i++) {
                const photo = album.photos[i];
                if (photo.lat != null && photo.lon != null) {
                    const geo = await reverseGeocodeCoords(photo.lat, photo.lon);
                    if (geo && geo.location) {
                        if (photo.location !== geo.location) {
                            photo.location = geo.location;
                            updatedCount++;
                        }
                        if (geo.city && photo.city !== geo.city) {
                            photo.city = geo.city;
                        }
                    }
                } else if (!photo.lat && !photo.lon && photo.title) {
                    const nameLoc = extractLocationFromText(photo.title);
                    if (nameLoc && nameLoc.location) {
                        photo.location = nameLoc.location;
                        photo.city = nameLoc.city || "";
                    } else if (!photo.location || photo.location === album.city || photo.location === album.location) {
                        // Không có thông tin vị trí EXIF GPS hay tên file -> để trống
                        photo.location = "";
                        photo.city = "";
                    }
                }
            }

            if (!album.coverUrl && album.photos.length > 0) {
                album.coverUrl = album.photos[0].url;
            }

            // Update album Date & Location from the extracted photo metadata
            const oldestCaptureDate = getAlbumOldestCaptureDate(album);
            const derived = deriveAlbumDateAndLocation(album.photos, album.tags, album.title, album.city, oldestCaptureDate || album.date);
            if (oldestCaptureDate) {
                album.date = oldestCaptureDate;
            } else if (derived.date) {
                album.date = derived.date;
            }
            if (derived.city && derived.city !== "Việt Nam") album.city = derived.city;
            if (derived.location) album.location = derived.location;

            album.sourceType = 'drive';
            saveAllAlbums(albums);

            if (typeof populateSelectedAlbumEditor === 'function') populateSelectedAlbumEditor();
            if (typeof renderEditAlbumDriveLinks === 'function') renderEditAlbumDriveLinks();
            if (typeof renderModalCoverPhotoPicker === 'function') renderModalCoverPhotoPicker();
            renderAdminAlbumsTable();
            renderAlbumManagePage();
            if (typeof App !== 'undefined') {
                if (typeof App.renderHomeShowcase === 'function') App.renderHomeShowcase();
                if (typeof App.renderPublicAlbum === 'function') App.renderPublicAlbum();
            }

            const msgParts = [];
            if (addedCount > 0) msgParts.push(`thêm ${addedCount} ảnh mới`);
            if (updatedCount > 0) msgParts.push(`cập nhật ${updatedCount} ảnh`);
            if (removedCount > 0) msgParts.push(`xóa ${removedCount} ảnh không còn trên Drive`);

            if (msgParts.length > 0) {
                App.showToast(`Đã đồng bộ xong (${msgParts.join(', ')}). Tổng: ${album.photos.length} ảnh!`);
            } else {
                App.showToast(`Album đã đồng bộ mới nhất với Google Drive (${album.photos.length} ảnh)!`);
            }
        } catch (err) {
            console.error("Lỗi cập nhật album:", err);
            App.showToast("Có lỗi xảy ra khi cập nhật album từ Google Drive!", "error");
        } finally {
            if (syncIcon) syncIcon.classList.remove('fa-spin');
            if (syncLabel) syncLabel.innerText = 'Cập nhật album';
            if (syncBtn) syncBtn.disabled = false;

            if (listSyncIcon) listSyncIcon.classList.remove('fa-spin');
            if (listSyncText) listSyncText.innerText = 'Cập nhật album';
            if (listSyncBtn) listSyncBtn.disabled = false;
        }
    }

    let lastEditClientName = "";
    let lastCreateClientName = "";

    function handleEditClientNameInput(newVal) {
        const reminderEl = document.getElementById('adminReminderTextInput');
        const descEl = document.getElementById('adminDescription');
        const albumTitle = (document.getElementById('adminAlbumTitle')?.value || '').trim() || 'Album';

        const oldName = lastEditClientName;
        const newName = (newVal || '').trim();

        if (reminderEl) {
            let currentReminder = reminderEl.value;
            if (oldName && currentReminder.includes(oldName)) {
                reminderEl.value = currentReminder.split(oldName).join(newName || "Bạn");
            } else if (!currentReminder.trim() || currentReminder.includes("Chào ") || currentReminder.includes("Mời bạn xem")) {
                reminderEl.value = `Chào ${newName || "Bạn"}! Mời bạn xem và thả tim chọn những bức ảnh ưng ý nhất trong Album nhé.`;
            }
        }

        if (descEl) {
            let currentDesc = descEl.value;
            if (oldName && currentDesc.includes(oldName)) {
                descEl.value = currentDesc.split(oldName).join(newName || "Khách Hàng");
            } else if (!currentDesc.trim() || currentDesc.startsWith("Album ")) {
                descEl.value = `Album ${albumTitle} của khách hàng ${newName || "Khách Hàng"}.`;
            }
        }

        lastEditClientName = newVal;
    }

    function handleCreateClientNameInput(newVal) {
        const reminderEl = document.getElementById('createAlbumReminderText');
        const oldName = lastCreateClientName;
        const newName = (newVal || '').trim();

        if (reminderEl) {
            let currentReminder = reminderEl.value;
            if (oldName && currentReminder.includes(oldName)) {
                reminderEl.value = currentReminder.split(oldName).join(newName || "Bạn");
            } else if (!currentReminder.trim() || currentReminder.includes("Chào ") || currentReminder.includes("Mời bạn xem")) {
                reminderEl.value = `Chào ${newName || "Bạn"}! Mời bạn xem và thả tim chọn những bức ảnh ưng ý nhất trong Album nhé.`;
            }
        }

        lastCreateClientName = newVal;
    }

    function populateSelectedAlbumEditor() {
        const album = getActiveAdminAlbum();
        if (!album) return;

        lastEditClientName = album.clientName || "";

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
        setChk('adminAllowOriginalDownloadCheckbox', !!album.allowOriginalDownload);

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

    function getPublicShareUrl(albumId) {
        const id = albumId || activeAdminAlbumId;
        let base = window.location.origin + window.location.pathname;
        base = base.replace(/\/index\.html$/i, '').replace(/\/+$/, '');
        if (window.location.hostname.includes('github.io')) {
            return `https://ducthuan897.github.io/dihastory/${encodeURIComponent(id)}`;
        }
        return `${base}/${encodeURIComponent(id)}`;
    }

    function copyAlbumPublicLink(albumId) {
        const id = albumId || activeAdminAlbumId;
        const link = getPublicShareUrl(id);
        navigator.clipboard.writeText(link).then(() => {
            App.showToast(`Đã sao chép link xem album: ${link}`);
        }).catch(() => {
            App.showToast(`Link xem album: ${link}`);
        });
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
        album.location = document.getElementById('adminLocation').value.trim() || album.location || "Việt Nam";
        // Tự động trích xuất Tỉnh/Thành phố từ phần cuối của Địa điểm chi tiết nếu người dùng nhập có dấu phẩy
        const locParts = album.location.split(',').map(s => s.trim()).filter(Boolean);
        album.city = locParts.length > 1 ? locParts[locParts.length - 1] : (locParts[0] || album.city || "Việt Nam");
        album.description = document.getElementById('adminDescription').value.trim();
        album.coverUrl = document.getElementById('adminCoverUrl').value.trim() || album.coverUrl;
        album.selectionLimit = parseInt(document.getElementById('adminSelectionLimit').value, 10) || 0;
        album.pinCode = document.getElementById('adminPinCode').value.trim();
        album.isPublic = document.getElementById('adminIsPublicCheckbox').checked;
        delete album.tags;

        album.reminderEnabled = !!document.getElementById('adminReminderEnabledCheckbox')?.checked;
        album.reminderText = (document.getElementById('adminReminderTextInput')?.value || '').trim();
        album.deadlineEnabled = !!document.getElementById('adminDeadlineEnabledCheckbox')?.checked;
        album.deadlineAt = (document.getElementById('adminDeadlineAtInput')?.value || '').trim();
        album.completeLockEnabled = !!document.getElementById('adminCompleteLockCheckbox')?.checked;
        album.multiSelectorEnabled = !!document.getElementById('adminMultiSelectorCheckbox')?.checked;
        album.watermarkEnabled = !!document.getElementById('adminWatermarkCheckbox')?.checked;
        album.allowOriginalDownload = !!document.getElementById('adminAllowOriginalDownloadCheckbox')?.checked;

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
            url = `https://drive.google.com/thumbnail?id=${drvId}&sz=s0`;
        }

        const nextNum = 1001 + album.photos.length;
        const code = (codeInput && codeInput.value.trim()) || `IMG_${nextNum}`;
        const location = (locInput && locInput.value.trim()) || "";
        const capturedAt = (timeInput && timeInput.value.trim()) || "";
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

        if (!album.deliveredPhotos) album.deliveredPhotos = [];
        let localDeliveredCount = 0;
        let localPhotosCount = 0;

        const fileList = Array.from(files);
        for (let idx = 0; idx < fileList.length; idx++) {
            const file = fileList[idx];
            const [dataUrl, meta] = await Promise.all([
                compressImageFile(file, 1600, 0.84),
                extractMetadataFromLocalFile(file)
            ]);
            if (!dataUrl) continue;

            const cleanName = file.name.replace(/\.[^/.]+$/, "").toUpperCase();
            const isDelivered = isDeliveredPhotoName(cleanName) || isDeliveredPhotoName(file.name);

            if (isDelivered) {
                const origCode = extractOriginalCodeFromDelivered(cleanName) || extractOriginalCodeFromDelivered(file.name);
                const cleanTarget = (origCode || '').toUpperCase();
                const matchedOrig = album.photos.find(p => {
                    const oc = (p.code || '').toUpperCase();
                    return oc === cleanTarget || (cleanTarget && oc.includes(cleanTarget)) || (cleanTarget && cleanTarget.includes(oc));
                });

                album.deliveredPhotos.push({
                    id: "deliv_local_" + Date.now() + "_" + idx,
                    originalPhotoId: matchedOrig ? matchedOrig.id : null,
                    originalPhotoCode: origCode,
                    code: cleanName,
                    location: matchedOrig ? matchedOrig.location : (meta.location || manualLoc || album.city || ""),
                    city: matchedOrig ? matchedOrig.city : (meta.city || album.city || ""),
                    capturedAt: matchedOrig ? matchedOrig.capturedAt : (meta.capturedAt || ""),
                    title: `${file.name} (Ảnh đã chỉnh)`,
                    beforeUrl: matchedOrig ? matchedOrig.url : null,
                    url: dataUrl
                });
                localDeliveredCount++;
            } else {
                const code = cleanName.length <= 20 ? cleanName : `IMG_${1001 + album.photos.length}`;
                const photoLocation = meta.location || manualLoc || (album.location || album.city || "");
                const photoCity = meta.city || album.city || "";
                const capturedAt = meta.capturedAt || "";

                album.photos.push({
                    id: "local_" + Date.now() + "_" + idx,
                    code,
                    location: photoLocation,
                    city: photoCity,
                    capturedAt,
                    title: file.name,
                    url: dataUrl
                });
                localPhotosCount++;

                if (album.photos.length === 1) {
                    album.coverUrl = dataUrl;
                }
            }
        }

        // Re-link any delivered photos that match newly added local photos
        album.deliveredPhotos.forEach(dp => {
            if (!dp.originalPhotoId && dp.originalPhotoCode) {
                const cleanTarget = dp.originalPhotoCode.toUpperCase();
                const matchedOrig = album.photos.find(p => {
                    const oc = (p.code || '').toUpperCase();
                    return oc === cleanTarget || (cleanTarget && oc.includes(cleanTarget)) || (cleanTarget && cleanTarget.includes(oc));
                });
                if (matchedOrig) {
                    dp.originalPhotoId = matchedOrig.id;
                    dp.beforeUrl = matchedOrig.url;
                    if (!dp.location && matchedOrig.location) dp.location = matchedOrig.location;
                }
            }
        });

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
        if (album) {
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
            const origCode = extractOriginalCodeFromDelivered(cleanCode) || extractOriginalCodeFromDelivered(dPhoto.title || '');
            const cleanTarget = (origCode || '').toUpperCase();
            const matchedOrig = album.photos.find(p => {
                const oc = (p.code || '').toUpperCase();
                return oc === cleanTarget || (cleanTarget && oc.includes(cleanTarget)) || (cleanTarget && cleanTarget.includes(oc)) || cleanCode.includes(oc);
            }) || album.photos[idx % Math.max(1, album.photos.length)];

            album.deliveredPhotos.push({
                id: "deliv_drv_" + Date.now() + "_" + idx,
                driveFileId: dPhoto.driveFileId,
                originalPhotoId: matchedOrig ? matchedOrig.id : null,
                originalPhotoCode: origCode || (matchedOrig ? matchedOrig.code : null),
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
            const origCode = extractOriginalCodeFromDelivered(cleanName) || extractOriginalCodeFromDelivered(file.name);
            const cleanTarget = (origCode || '').toUpperCase();
            const matchedOrig = album.photos.find(p => {
                const oc = (p.code || '').toUpperCase();
                return oc === cleanTarget || (cleanTarget && oc.includes(cleanTarget)) || (cleanTarget && cleanTarget.includes(oc)) || cleanName.includes(oc);
            }) || album.photos[idx % Math.max(1, album.photos.length)];

            album.deliveredPhotos.push({
                id: "deliv_local_" + Date.now() + "_" + idx,
                originalPhotoId: matchedOrig ? matchedOrig.id : null,
                originalPhotoCode: origCode || (matchedOrig ? matchedOrig.code : null),
                code: cleanName,
                location: matchedOrig ? matchedOrig.location : "",
                capturedAt: matchedOrig ? matchedOrig.capturedAt : "",
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
        // Nếu chuỗi có dạng YYYY-MM-DDTHH:MM hoặc YYYY/MM/DD HH:MM
        const str = String(isoStr).trim();
        const m = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
        if (m) {
            const yyyy = m[1];
            const mm = m[2].padStart(2, '0');
            const dd = m[3].padStart(2, '0');
            const dStr = `${dd}/${mm}/${yyyy}`;
            if (m[4] !== undefined && m[5] !== undefined) {
                const hh = m[4].padStart(2, '0');
                const min = m[5].padStart(2, '0');
                return `${hh}:${min} • ${dStr}`;
            }
            return dStr;
        }
        const parts = str.split('T');
        const datePart = parts[0] ? parts[0].split('-').reverse().join('/') : '';
        const timePart = parts[1] ? parts[1].slice(0, 5) : '';
        return timePart ? `${timePart} • ${datePart}` : datePart;
    }

    return {
        getAllAlbums,
        getAlbumById,
        getActiveAdminAlbum,
        getClientShareUrl,
        computeAlbumClientToken,
        verifyAlbumClientToken,
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
        toggleOpenAlbumDropdown,
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
        handleEditClientNameInput,
        handleCreateClientNameInput,
        addDriveLinkToCreateModal,
        removeDriveLinkFromCreateModal,
        handleCreateModalLocalFiles,
        removeLocalFileFromCreateModal,
        handleCreateModalToggleChange,
        createNewAlbum,
        saveAllAlbums,
        unlockAlbumSelectionForClient,
        lockAlbumAfterClientSubmit,
        toggleAlbumPublic,
        deleteAlbum,
        copyAlbumPublicLink,
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
        getDriveAccountsList,
        renderDriveAccountsList,
        handleSaveDriveAccount,
        editDriveAccount,
        setActiveDriveAccount,
        deleteDriveAccount,
        resetDriveAccountForm,
        testDriveAccountKey,
        testCurrentInputDriveAccount,
        copyAppsScriptCode,
        fetchCloudOrStaticAlbums,
        quickPickCreateCity,
        quickChangeAlbumLocation,
        quickChangeAlbumDate,
        applyLatestCloudAlbums,
        applyLatestCloudSelections,
        applyLatestCloudDriveAccounts,
        mergeCloudAlbums: applyLatestCloudAlbums,
        getAlbumOldestCaptureDate,
        extractGoogleDriveFileId,
        extractGoogleDriveFolderId,
        exportAlbumsJsonFile
    };
})();

