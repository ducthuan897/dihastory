/**
 * GOOGLE APPS SCRIPT CHO DIHA STORY (DUTUSTORY)
 * 1. Tự động đọc ảnh Google Drive, trích xuất EXIF DateTimeOriginal & toạ độ GPS.
 * 2. ĐỒNG BỘ DỮ LIỆU ALBUM ĐA THIẾT BỊ (Cloud Database lưu trữ vào Google Drive miễn phí).
 * 
 * Hướng dẫn cập nhật:
 * 1. Vào script.google.com -> Mở dự án Apps Script của bạn.
 * 2. Xóa hết mã cũ trong file Mã.gs, dán toàn bộ đoạn mã này vào rồi bấm Lưu (Ctrl + S).
 * 3. Bấm Triển khai (Deploy) -> Quản lý bản triển khai (Manage deployments).
 * 4. Bấm vào biểu tượng cây bút Sửa (Edit) -> Ở mục Phiên bản (Version) chọn "Phiên bản mới" (New version) -> Bấm Triển khai (Deploy).
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

// Lưu file 'dutustory_db.json' vào Google Drive
function saveAlbumsToDrive(albums) {
  var fileName = "dutustory_db.json";
  var jsonStr = JSON.stringify(albums);
  var files = DriveApp.getFilesByName(fileName);
  var saved = false;
  while (files.hasNext()) {
    var file = files.next();
    if (!file.isTrashed()) {
      file.setContent(jsonStr);
      saved = true;
      break;
    }
  }
  if (!saved) {
    DriveApp.createFile(fileName, jsonStr, MimeType.PLAIN_TEXT);
  }
}

// Đọc file 'dutustory_db.json' từ Google Drive (luôn lấy bản mới nhất, bỏ qua file thùng rác)
function loadAlbumsFromDrive() {
  var fileName = "dutustory_db.json";
  var files = DriveApp.getFilesByName(fileName);
  while (files.hasNext()) {
    var file = files.next();
    if (!file.isTrashed()) {
      var content = file.getBlob().getDataAsString("UTF-8");
      try {
        var parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch(e) {}
    }
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
    .replace(/\u0111/gi, "d")
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
        var cleanName = name.replace(/^(Tỉnh|Thành phố|TP\.|Quận|Huyện|Thị xã|Phường|Xã)\s+/i, "").trim();
        if (types.indexOf("administrative_area_level_1") !== -1 || types.indexOf("locality") !== -1) {
          if (!city && cleanName) city = cleanName;
        }
        if (types.indexOf("administrative_area_level_2") !== -1 || types.indexOf("sublocality") !== -1) {
          if (!subLoc && cleanName) subLoc = cleanName;
        }
      }
      var finalCity = city || subLoc || "";
      var finalLoc = (subLoc && city && subLoc.toLowerCase() !== city.toLowerCase())
        ? (subLoc + " - " + city)
        : (finalCity || formatted);
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
    // Đọc nhị phân 64KB đầu của file ảnh để quét EXIF ASCII và TIFF GPS trong 1-2ms
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

    // 1. Tìm ngày giờ chụp thật từ EXIF / XMP (DateTimeOriginal / CreateDate / DateCreated)
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

    // 2. Tìm toạ độ GPS từ XMP
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

    // 3. Quét toạ độ GPS từ Binary EXIF TIFF nếu XMP không có
    if (meta.lat == null && bytes.length > 512) {
      try {
        var binGps = parseBinaryExifGps(bytes);
        if (binGps && binGps.lat != null && binGps.lon != null) {
          meta.lat = binGps.lat;
          meta.lon = binGps.lon;
        }
      } catch(eBin) {}
    }

    // 4. Tìm địa danh Photoshop / Lightroom đã gắn vào ảnh
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
  // 4. Nếu file không có EXIF: lấy ngày từ tên file hoặc ngày file được cập nhật
  if (!meta.capturedAt && fname) {
    meta.capturedAt = extractDateFromText(fname);
  }
  if (!meta.capturedAt) {
    try {
      meta.capturedAt = Utilities.formatDate(file.getLastUpdated(), "GMT+7", "yyyy-MM-dd'T'HH:mm");
    } catch(e) {}
  }

  // 5. Kiểm tra tên file có chứa tên địa điểm quen thuộc
  if (!meta.city && fname) {
    var fnLoc = extractLocationFromText(fname);
    if (fnLoc) {
      meta.city = fnLoc.city;
      meta.location = fnLoc.location;
    }
  }

  // 6. Dịch toạ độ GPS thành địa danh tiếng Việt thực tế (có cache theo toạ độ để chạy siêu tốc)
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

  // 1. Kiểm tra vị trí & ngày chụp từ tên thư mục (ví dụ: "Chụp cưới Đà Lạt 20-10-2024")
  var titleLoc = extractLocationFromText(folderTitle);
  if (titleLoc) {
    detectedFolderCity = titleLoc.city;
    detectedFolderLoc = titleLoc.location;
  }
  var titleDate = extractDateFromText(folderTitle);
  if (titleDate) {
    detectedFolderDate = titleDate;
  }

  // 2. Lấy danh sách file ảnh trong thư mục
  var iter = folder.getFiles();
  var allFiles = [];
  while (iter.hasNext()) {
    var file = iter.next();
    var fname = file.getName();
    if (fname.match(/\.(jpe?g|png|webp|heic|tiff?|dng|raw|cr2|cr3|nef|arw)$/i)) {
      allFiles.push(file);
    }
  }

  // 3. Quét metadata EXIF, GPS & ngày giờ riêng biệt cho TỪNG tấm ảnh
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

    filesList.push({
      id: f.getId(),
      name: fname,
      capturedAt: fDate || "",
      city: meta.city || detectedFolderCity || "",
      location: meta.location || detectedFolderLoc || meta.city || detectedFolderCity || "",
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
}
