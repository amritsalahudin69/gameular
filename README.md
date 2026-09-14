# gameular
prompt umum :

# INITIAL GAME PROMPT — GAMEULAR

ANDA ADALAH SENIOR FRONTEND GAME ENGINEER.

Buat sebuah game ular 3D sederhana berbasis React dan Vite.

==================================================
KONSEP GAME
==================================================

Nama game:
Gameular

Jenis game:
Snake game 3D dengan arena maze/labirin.

Target:
Game ringan, bisa berjalan di browser, dan cocok dikembangkan bertahap.

==================================================
TECH STACK
==================================================

Gunakan:
- React
- Vite
- Three.js
- @react-three/fiber
- @react-three/drei
- @react-three/rapier
- Zustand
- CSS biasa

Jangan gunakan backend dulu.

==================================================
FITUR UTAMA
==================================================

1. Arena 3D berbentuk labirin.
2. Ular/player bergerak di dalam arena.
3. Makanan muncul di posisi acak yang valid.
4. Ketika makanan dimakan:
   - score bertambah
   - tubuh ular bertambah panjang
   - makanan berpindah ke posisi lain
5. Game over jika ular menabrak dinding atau keluar arena.
6. Tersedia tombol:
   - Start
   - Restart
7. Tampilkan HUD:
   - Score
   - High Score
   - Timer
8. Simpan high score di localStorage.
9. Tambahkan pilihan skin/warna ular.
10. Kontrol awal menggunakan keyboard:
   - Arrow Up
   - Arrow Down
   - Arrow Left
   - Arrow Right
   - W A S D

==================================================
STRUKTUR AWAL
==================================================

Gunakan struktur minimal:

src/
├── App.jsx
├── Scene.jsx
├── Store.js
├── main.jsx
└── index.css

==================================================
ATURAN IMPLEMENTASI
==================================================

1. Jangan buat backend.
2. Jangan buat database.
3. Jangan pakai TypeScript.
4. Gunakan React non-TypeScript.
5. Logic global game dikelola dengan Zustand.
6. Scene 3D dikelola di Scene.jsx.
7. UI/HUD utama dikelola di App.jsx.
8. Style dasar dikelola di index.css.
9. Game harus bisa dijalankan dengan:

npm install
npm run dev

10. Build harus lolos dengan:

npm run build

==================================================
OUTPUT WAJIB
==================================================

Berikan:
1. Struktur folder.
2. Isi package.json.
3. Isi src/main.jsx.
4. Isi src/App.jsx.
5. Isi src/Scene.jsx.
6. Isi src/Store.js.
7. Isi src/index.css.
8. Cara menjalankan project.
9. Cara build project.

==================================================
VALIDASI WAJIB
==================================================

Game dianggap valid jika:

1. Browser menampilkan canvas 3D.
2. Ular dapat bergerak dengan keyboard.
3. Score bertambah saat makanan dimakan.
4. High score tersimpan setelah restart.
5. Game over muncul saat ular menabrak dinding atau keluar arena.
6. Tombol restart mengulang game dari awal.
7. npm run build berhasil tanpa error.
