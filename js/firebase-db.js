/**
 * FirebaseModule - Quản lý kết nối Firebase Realtime Database
 * Đồng bộ thời gian thực: Albums, Users & Phân quyền, Selections, tương tác khách hàng
 */
const FirebaseModule = (function () {
    const firebaseConfig = {
        apiKey: "AIzaSyCyrO16Tha7G61eGYBElhCsF1bk1vKgvJ0",
        authDomain: "dihastory.firebaseapp.com",
        databaseURL: "https://dihastory-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "dihastory",
        storageBucket: "dihastory.firebasestorage.app",
        messagingSenderId: "105817657660",
        appId: "1:105817657660:web:f87a0b2fec1e50463d0e39",
        measurementId: "G-320DX6XMXE"
    };

    let app = null;
    let database = null;
    let isConnected = false;

    function init() {
        try {
            if (typeof firebase !== 'undefined' && !firebase.apps.length) {
                app = firebase.initializeApp(firebaseConfig);
                database = firebase.database();
                isConnected = true;
                console.log("Firebase Realtime Database initialized successfully!");
                listenToCloudAlbums();
                listenToCloudUsers();
                listenToCloudSelections();
                updateDatabaseStatusBadge(true);
            }
        } catch (e) {
            console.warn("Firebase initialization warning:", e);
            updateDatabaseStatusBadge(false);
        }
    }

    function updateDatabaseStatusBadge(connected) {
        const badges = [
            document.getElementById('firebaseStatusBadge'),
            document.getElementById('adminHeaderDriveBadge')
        ];
        badges.forEach(b => {
            if (!b) return;
            if (connected) {
                b.innerText = "Firebase Realtime: Đã kết nối";
                b.className = "text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1";
            } else {
                b.innerText = "Firebase: Chưa kết nối";
                b.className = "text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium flex items-center gap-1";
            }
        });
    }

    function isReady() {
        return !!database;
    }

    // 1. ALBUMS REALTIME SYNC
    function listenToCloudAlbums() {
        if (!database) return;
        const albumsRef = database.ref('albums');
        albumsRef.on('value', snapshot => {
            const val = snapshot.val();
            if (val) {
                const list = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
                if (list.length > 0 && typeof AdminModule !== 'undefined' && typeof AdminModule.applyLatestCloudAlbums === 'function') {
                    AdminModule.applyLatestCloudAlbums(list);
                }
            }
        });
    }

    async function saveAlbums(albums) {
        if (!database) return false;
        try {
            await database.ref('albums').set(albums);
            return true;
        } catch (e) {
            console.error("Firebase saveAlbums error:", e);
            return false;
        }
    }

    async function getAlbumsOnce() {
        if (!database) return null;
        try {
            const snap = await database.ref('albums').once('value');
            const val = snap.val();
            if (val) {
                return Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
            }
            return null;
        } catch (e) {
            console.error("Firebase getAlbumsOnce error:", e);
            return null;
        }
    }

    // 2. USERS & ROLES SYNC
    function listenToCloudUsers() {
        if (!database) return;
        const usersRef = database.ref('users');
        usersRef.on('value', snapshot => {
            const val = snapshot.val();
            if (val && typeof AuthModule !== 'undefined' && typeof AuthModule.applyLatestCloudUsers === 'function') {
                const list = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
                AuthModule.applyLatestCloudUsers(list);
            }
        });
    }

    async function saveUsers(usersList) {
        if (!database) return false;
        try {
            await database.ref('users').set(usersList);
            return true;
        } catch (e) {
            console.error("Firebase saveUsers error:", e);
            return false;
        }
    }

    async function getUsersOnce() {
        if (!database) return null;
        try {
            const snap = await database.ref('users').once('value');
            const val = snap.val();
            if (val) {
                return Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
            }
            return null;
        } catch (e) {
            console.error("Firebase getUsersOnce error:", e);
            return null;
        }
    }

    // 3. SELECTIONS & CLIENT FEEDBACK SYNC
    function listenToCloudSelections() {
        if (!database) return;
        const selectionsRef = database.ref('selections');
        selectionsRef.on('value', snapshot => {
            const val = snapshot.val();
            if (val && typeof AdminModule !== 'undefined' && typeof AdminModule.applyLatestCloudSelections === 'function') {
                AdminModule.applyLatestCloudSelections(val);
            }
        });
    }

    async function saveAlbumSelections(albumId, selections) {
        if (!database || !albumId) return false;
        try {
            await database.ref(`selections/${albumId}`).set(selections);
            return true;
        } catch (e) {
            console.error("Firebase saveAlbumSelections error:", e);
            return false;
        }
    }

    async function getSelectionsOnce() {
        if (!database) return null;
        try {
            const snap = await database.ref('selections').once('value');
            return snap.val() || null;
        } catch (e) {
            console.error("Firebase getSelectionsOnce error:", e);
            return null;
        }
    }

    return {
        init,
        isReady,
        saveAlbums,
        getAlbumsOnce,
        saveUsers,
        getUsersOnce,
        saveAlbumSelections,
        getSelectionsOnce
    };
})();

// Khởi chạy khi tài liệu nạp xong
document.addEventListener('DOMContentLoaded', function () {
    FirebaseModule.init();
});
