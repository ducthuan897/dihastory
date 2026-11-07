/**
 * GOOGLE APPS SCRIPT CHO ĐỨC THUẬN STUDIO (DUTUSTORY)
 * 1. Tự động đọc ảnh Google Drive, trích xuất EXIF DateTimeOriginal (ngày giờ chụp thật) & toạ độ GPS.
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

  // 1. Dùng Drive API v3 (Lấy imageMediaMetadata EXIF thời gian chụp & GPS nhanh nhất)
  try {
    var apiUrl = "https://www.googleapis.com/drive/v3/files?q='" + encodeURIComponent(folderId) + "'+in+parents+and+trashed=false&fields=files(id,name,mimeType,imageMediaMetadata,createdTime)&pageSize=100";
    var resp = UrlFetchApp.fetch(apiUrl, {
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) {
      var data = JSON.parse(resp.getContentText());
      if (data.files && data.files.length > 0) {
        var rawFiles = data.files.filter(function(f) {
          return !f.mimeType || f.mimeType.indexOf("image/") === 0 || f.name.match(/\.(jpe?g|png|webp|heic|tiff?|dng|raw|cr2|cr3|nef|arw)$/i);
        });

        for (var i = 0; i < rawFiles.length; i++) {
          var f = rawFiles[i];
          var capturedAt = null;
          var lat = null;
          var lon = null;
          var city = null;
          var location = null;

          if (f.imageMediaMetadata) {
            // EXIF DateTimeOriginal: "YYYY:MM:DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM"
            if (f.imageMediaMetadata.time) {
              var tStr = f.imageMediaMetadata.time.trim();
              var m = tStr.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[T\s]+(\d{2}):(\d{2})/);
              if (m) {
                capturedAt = m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5];
              }
            }
            if (f.imageMediaMetadata.location) {
              lat = f.imageMediaMetadata.location.latitude;
              lon = f.imageMediaMetadata.location.longitude;
            }
          }

          // Phân tích toạ độ GPS thành địa danh tiếng Việt thực tế
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

          if (capturedAt && !detectedFolderDate) {
            detectedFolderDate = capturedAt;
          }

          filesList.push({
            id: f.id,
            name: f.name,
            capturedAt: capturedAt,
            lat: lat,
            lon: lon,
            city: city,
            location: location
          });
        }
      }
    }
  } catch(e) {}

  // 2. Dự phòng bằng DriveApp nếu Drive v3 chưa tải xong
  if (filesList.length === 0) {
    var iter = folder.getFiles();
    while (iter.hasNext()) {
      var file = iter.next();
      var fname = file.getName();
      if (fname.match(/\.(jpe?g|png|webp|heic|tiff?|dng|raw|cr2|cr3|nef|arw)$/i)) {
        filesList.push({
          id: file.getId(),
          name: fname,
          capturedAt: null,
          lat: null,
          lon: null,
          city: null,
          location: null
        });
      }
    }
  }

  // 3. Quét nhị phân header JPEG (APP1 EXIF) cho 2 ảnh đầu tiên nếu chưa có capturedAt
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

  // Gán thông tin ngày chụp và vị trí cho các ảnh khác trong cùng buổi chụp
  for (var k = 0; k < filesList.length; k++) {
    if (!filesList[k].capturedAt && detectedFolderDate) {
      filesList[k].capturedAt = detectedFolderDate;
    }
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
          city = comp.long_name.replace(/^(Tỉnh|Thành phố|TP\.)\s+/i, "");
          break;
        }
      }
      return {
        city: city || "",
        location: formatted || city
      };
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
      if (code >= 32 && code <= 126) {
        str += String.fromCharCode(code);
      } else {
        str += " ";
      }
    }
    var m = str.match(/\b(20[12]\d):([01]\d):([0-3]\d)\s+([0-2]\d):([0-5]\d):([0-5]\d)\b/);
    if (m) {
      return {
        capturedAt: m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5]
      };
    }
  } catch(e) {}
  return null;
}

function testRun() {
  Logger.log(doGet({ parameter: { id: "test" } }).getContent());
}
