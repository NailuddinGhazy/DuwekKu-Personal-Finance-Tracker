import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import {
  loginDenganGoogle,
  logoutDuwekKu,
} from './authService';
import DuwekkuNotificationListener from './modules/duwekku-notification-listener/src/DuwekkuNotificationListener';

// Kunci lama dipertahankan hanya untuk menawarkan migrasi eksplisit.
// Data baru selalu memakai kunci terpisah berdasarkan UID Firebase.
const LEGACY_STORAGE_KEY = '@duwekkU_transaksi_v1';

function storageKeyUntukPengguna(uid) {
  return `@duwekku_transaksi_user_${uid}`;
}

function parseDaftarTransaksi(raw) {
  if (raw === null || raw === undefined) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

const formatRupiah = (angka) =>
  'Rp ' + angka.toLocaleString('id-ID');

function normalizeNotificationAmount(value) {
  const cleaned = String(value)
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNominalNotifikasi(text) {
  const rawText = (text || '').replace(/\s+/g, ' ').trim();

  if (!rawText) return null;

  const patterns = [
    /(?:rp|idr)\s*[:.]?\s*(\d[\d.,]+)/i,
    /(\d[\d.,]+)\s*(?:rb|ribu|jt|juta)/i,
    /(?:nominal|jumlah|bayar|biaya|transfer)\s*[:.]?\s*(\d[\d.,]+)/i,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);

    if (match) {
      const parsed = normalizeNotificationAmount(match[1]);

      if (parsed !== null) return parsed;
    }
  }

  const fallbackMatch = rawText.match(/(\d[\d.,]{2,}\d|\d{3,})/g);

  if (!fallbackMatch) return null;

  for (const candidate of fallbackMatch) {
    const parsed = normalizeNotificationAmount(candidate);

    if (parsed !== null && parsed > 500 && parsed < 1000000000) {
      return parsed;
    }
  }

  return null;
}

function getNotificationSourceLabel(packageName, fallbackText = '') {
  const normalized = (packageName || '').toLowerCase();
  const sourceMap = [
    ['brimo', 'BRIMO'],
    ['bca', 'BCA Mobile'],
    ['dana', 'DANA'],
    ['gopay', 'GoPay'],
    ['ovo', 'OVO'],
    ['mandiri', 'Bank Mandiri'],
    ['jago', 'Bank Jago'],
    ['shopeepay', 'ShopeePay'],
    ['linkaja', 'LinkAja'],
    ['paypal', 'PayPal'],
  ];

  const matchedSource = sourceMap.find(([key]) =>
    normalized.includes(key)
  );

  if (matchedSource) {
    return matchedSource[1];
  }

  const fallback = (fallbackText || packageName || 'Aplikasi')
    .toLowerCase();

  const fallbackMap = [
    ['brimo', 'BRIMO'],
    ['bca', 'BCA Mobile'],
    ['dana', 'DANA'],
    ['gopay', 'GoPay'],
    ['ovo', 'OVO'],
    ['mandiri', 'Bank Mandiri'],
    ['jago', 'Bank Jago'],
  ];

  const matchedFallback = fallbackMap.find(([key]) =>
    fallback.includes(key)
  );

  if (matchedFallback) return matchedFallback[1];

  const lastSegment = (packageName || '').split('.').filter(Boolean).pop();

  if (!lastSegment) return 'Aplikasi';

  return lastSegment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildNotificationSummary(sourceLabel, title, text, nominal) {
  const rawSummary = (title || text || 'Pembayaran')
    .replace(/\s+/g, ' ')
    .trim();

  const summary = rawSummary || 'Pembayaran';
  const lowerSummary = summary.toLowerCase();
  const description =
    lowerSummary.includes('pembayaran') ||
    lowerSummary.includes('payment') ||
    lowerSummary.includes('transfer') ||
    lowerSummary.includes('purchase') ||
    lowerSummary.includes('paid') ||
    lowerSummary.includes('top up')
      ? summary
      : 'Pembayaran';

  if (nominal === null) {
    return `${sourceLabel}: ${description}`;
  }

  return `${sourceLabel}: ${description} ${formatRupiah(nominal)}`;
}

function tanggalHariIni() {
  return new Date().toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function jamSekarang() {
  const sekarang = new Date();
  return (
    String(sekarang.getHours()).padStart(2, '0') +
    ':' +
    String(sekarang.getMinutes()).padStart(2, '0')
  );
}

function tanggalKeDate(value) {
  const [hari, bulan, tahun] = value.split('/').map(Number);
  const date = new Date(tahun, bulan - 1, hari);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatTanggal(date) {
  const hari = String(date.getDate()).padStart(2, '0');
  const bulan = String(date.getMonth() + 1).padStart(2, '0');
  const tahun = date.getFullYear();
  return `${hari}/${bulan}/${tahun}`;
}

function tanggalTransaksiKeDate(value) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value || '')) return null;

  const date = tanggalKeDate(value);
  return formatTanggal(date) === value ? date : null;
}

function rentangPeriode(periode, tanggalAcuan) {
  const mulai = new Date(
    tanggalAcuan.getFullYear(),
    tanggalAcuan.getMonth(),
    tanggalAcuan.getDate()
  );

  let selesai;

  if (periode === 'hari') {
    selesai = new Date(mulai);
    selesai.setDate(selesai.getDate() + 1);
  } else if (periode === 'minggu') {
    const hariDalamMinggu = (mulai.getDay() + 6) % 7;
    mulai.setDate(mulai.getDate() - hariDalamMinggu);
    selesai = new Date(mulai);
    selesai.setDate(selesai.getDate() + 7);
  } else if (periode === 'bulan') {
    mulai.setDate(1);
    selesai = new Date(
      mulai.getFullYear(),
      mulai.getMonth() + 1,
      1
    );
  } else {
    mulai.setMonth(0, 1);
    selesai = new Date(mulai.getFullYear() + 1, 0, 1);
  }

  return { mulai, selesai };
}

function labelPeriode(periode, tanggalAcuan) {
  const { mulai, selesai } = rentangPeriode(
    periode,
    tanggalAcuan
  );

  if (periode === 'hari') {
    return mulai.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  if (periode === 'minggu') {
    const akhir = new Date(selesai);
    akhir.setDate(akhir.getDate() - 1);

    return `${mulai.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    })} - ${akhir.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;
  }

  if (periode === 'bulan') {
    return mulai.toLocaleDateString('id-ID', {
      month: 'long',
      year: 'numeric',
    });
  }

  return String(mulai.getFullYear());
}

function jamKeDate(value) {
  const [jam, menit] = value.split(':').map(Number);
  const date = new Date();

  if (
    Number.isInteger(jam) &&
    Number.isInteger(menit) &&
    jam >= 0 &&
    jam <= 23 &&
    menit >= 0 &&
    menit <= 59
  ) {
    date.setHours(jam, menit, 0, 0);
  }

  return date;
}

function formatJam(date) {
  const jam = String(date.getHours()).padStart(2, '0');
  const menit = String(date.getMinutes()).padStart(2, '0');
  return `${jam}:${menit}`;
}

export default function App() {
  const [transaksi, setTransaksi] = useState([]);
  const [dataSudahDimuat, setDataSudahDimuat] = useState(false);
  const [uidDataDimuat, setUidDataDimuat] = useState(null);
  const [gagalMuatData, setGagalMuatData] = useState(false);
  const [sinkronisasiSiap, setSinkronisasiSiap] = useState(false);
  const [gagalSinkronisasi, setGagalSinkronisasi] = useState(false);
  const [sedangSimpanTransaksi, setSedangSimpanTransaksi] = useState(false);

  const [idSedangDiedit, setIdSedangDiedit] = useState(null);
  const [formTerbuka, setFormTerbuka] = useState(false);

  const [periodeAktif, setPeriodeAktif] = useState('bulan');
  const [tanggalAcuan, setTanggalAcuan] = useState(
    () => new Date()
  );
  const [
    tampilkanKalenderPeriode,
    setTampilkanKalenderPeriode,
  ] = useState(false);

  const [tipe, setTipe] = useState('pengeluaran');
  const [nominal, setNominal] = useState('');
  const [kategori, setKategori] = useState('Makanan');
  const [catatan, setCatatan] = useState('');
  const [tanggal, setTanggal] = useState(tanggalHariIni());
  const [jam, setJam] = useState(jamSekarang());
  const [tampilkanKalender, setTampilkanKalender] = useState(false);
  const [tampilkanJam, setTampilkanJam] = useState(false);

  const [pengguna, setPengguna] = useState(null);
  const [authSudahDicek, setAuthSudahDicek] = useState(false);
  const [sedangLogin, setSedangLogin] = useState(false);
  const [notificationAccessEnabled, setNotificationAccessEnabled] =
    useState(false);
  const [pendingPaymentNotifications, setPendingPaymentNotifications] =
    useState([]);
  const [pendingNotificationDraftId, setPendingNotificationDraftId] =
    useState(null);

  // Pantau status login Firebase.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setPengguna(user);
      setAuthSudahDicek(true);
    });

    return unsubscribe;
  }, []);

  const penggunaUid = pengguna?.uid ?? null;
  const penggunaEmail = pengguna?.email ?? '';

  // Muat transaksi yang hanya dimiliki UID yang sedang login.
  useEffect(() => {
    if (!authSudahDicek) return undefined;

    let dibatalkan = false;
    const uid = penggunaUid;

    // Kosongkan tampilan saat akun berganti atau logout.
    setDataSudahDimuat(false);
    setUidDataDimuat(null);
    setGagalMuatData(false);
    setTransaksi([]);
    setFormTerbuka(false);
    setIdSedangDiedit(null);
    setTampilkanKalender(false);
    setTampilkanJam(false);

    if (!uid) {
      setDataSudahDimuat(true);

      return () => {
        dibatalkan = true;
      };
    }

    async function muatTransaksiPengguna() {
      try {
        const storageKey = storageKeyUntukPengguna(uid);
        const dataAkun = await AsyncStorage.getItem(storageKey);
        let daftar = [];

        if (dataAkun !== null) {
          daftar = parseDaftarTransaksi(dataAkun);
        } else {
          // Jangan otomatis mengaitkan data lama ke akun sembarang.
          // Minta persetujuan sebelum memindahkan data lama.
          const dataLama = await AsyncStorage.getItem(
            LEGACY_STORAGE_KEY
          );

          const transaksiLama = parseDaftarTransaksi(dataLama);

          if (transaksiLama.length > 0) {
            const pindahkanKeAkunIni = await new Promise(
              (resolve) => {
                Alert.alert(
                  'Pindahkan transaksi lama?',
                  `Ditemukan ${transaksiLama.length} transaksi lama yang belum terhubung ke akun tertentu. Pindahkan ke akun ${penggunaEmail || 'yang sedang login'}? Pilih ini hanya jika semua transaksi lama memang milik akun tersebut.`,
                  [
                    {
                      text: 'Mulai dari kosong',
                      style: 'cancel',
                      onPress: () => resolve(false),
                    },
                    {
                      text: 'Pindahkan ke akun ini',
                      onPress: () => resolve(true),
                    },
                  ],
                  { cancelable: false }
                );
              }
            );

            if (dibatalkan) return;

            if (pindahkanKeAkunIni) {
              // Salin lebih dahulu. Hapus kunci lama hanya
              // setelah penulisan data akun berhasil.
              await AsyncStorage.setItem(
                storageKey,
                JSON.stringify(transaksiLama)
              );

              try {
                await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
              } catch (error) {
                console.warn(
                  'Kunci transaksi lama belum bisa dihapus:',
                  error
                );
              }

              daftar = transaksiLama;
            }
          }
        }

        if (dibatalkan) return;

        setTransaksi(daftar);
        setUidDataDimuat(uid);
      } catch (error) {
        if (dibatalkan) return;

        console.error(
          'Gagal memuat transaksi pengguna:',
          error
        );

        Alert.alert(
          'Gagal memuat data',
          'Transaksi akun ini tidak bisa dibaca. Data tidak dihapus; coba buka ulang aplikasi.'
        );

        setTransaksi([]);
        setUidDataDimuat(null);
        setGagalMuatData(true);
      } finally {
        if (!dibatalkan) {
          setDataSudahDimuat(true);
        }
      }
    }

    muatTransaksiPengguna();

    return () => {
      dibatalkan = true;
    };
  }, [authSudahDicek, penggunaUid, penggunaEmail]);

  // Sinkronisasi cloud. Pembacaan awal harus berasal dari server
  // agar kondisi offline tidak keliru dianggap sebagai koleksi kosong.
  useEffect(() => {
    if (!authSudahDicek) return undefined;

    const uid = penggunaUid;
    let dibatalkan = false;
    let berhentiMendengarkan = null;

    if (
      !uid ||
      !dataSudahDimuat ||
      gagalMuatData ||
      uidDataDimuat !== uid
    ) {
      setSinkronisasiSiap(false);
      setGagalSinkronisasi(false);
      return () => {
        dibatalkan = true;
      };
    }

    setSinkronisasiSiap(false);
    setGagalSinkronisasi(false);

    const referensiTransaksi = collection(db, 'users', uid, 'transactions');
    const storageKey = storageKeyUntukPengguna(uid);

    async function mulaiSinkronisasi() {
      try {
        // Ambil status cloud dari server. Kalau gagal karena offline,
        // jangan menganggap cloud kosong dan jangan mengunggah data secara membabi buta.
        const [snapshotServer, dataLokalMentah] = await Promise.all([
          getDocsFromServer(referensiTransaksi),
          AsyncStorage.getItem(storageKey),
        ]);

        if (dibatalkan) return;

        const transaksiLokal = parseDaftarTransaksi(dataLokalMentah);

        if (snapshotServer.empty && transaksiLokal.length > 0) {
          // Migrasi lokal hanya saat koleksi cloud benar-benar kosong.
          // Batch 450 dokumen agar tetap di bawah batas Firestore.
          for (let awal = 0; awal < transaksiLokal.length; awal += 450) {
            if (dibatalkan) return;

            const batch = writeBatch(db);
            const bagian = transaksiLokal.slice(awal, awal + 450);

            bagian.forEach((item) => {
              if (item?.id === undefined || item?.id === null) return;
              const id = String(item.id);
              batch.set(
                doc(db, 'users', uid, 'transactions', id),
                { ...item, id }
              );
            });

            await batch.commit();
          }
        } else if (!snapshotServer.empty) {
          // Jika cloud sudah berisi data, cloud menjadi sumber utama.
          // Data lokal tidak menimpa data cloud.
          const daftarCloud = snapshotServer.docs.map((dokumen) => ({
            ...dokumen.data(),
            id: dokumen.id,
          }));

          setTransaksi(daftarCloud);
          await AsyncStorage.setItem(
            storageKey,
            JSON.stringify(daftarCloud)
          );
        } else {
          await AsyncStorage.setItem(storageKey, JSON.stringify([]));
        }

        if (dibatalkan) return;

        // Dengarkan perubahan cloud untuk memperbarui perangkat ini secara real-time.
        berhentiMendengarkan = onSnapshot(
          referensiTransaksi,
          (snapshot) => {
            if (dibatalkan) return;

            const daftarCloud = snapshot.docs.map((dokumen) => ({
              ...dokumen.data(),
              id: dokumen.id,
            }));

            setTransaksi(daftarCloud);
            setSinkronisasiSiap(true);

            AsyncStorage.setItem(
              storageKey,
              JSON.stringify(daftarCloud)
            ).catch((error) => {
              console.error('Gagal menyimpan cache transaksi:', error);
            });
          },
          (error) => {
            if (dibatalkan) return;

            console.error('Sinkronisasi Firestore gagal:', error);
            setGagalSinkronisasi(true);
            setSinkronisasiSiap(false);
            Alert.alert(
              'Sinkronisasi gagal',
              'Transaksi cloud belum bisa diakses. Data lokal tidak dihapus. Periksa koneksi internet dan coba masuk kembali.'
            );
          }
        );
      } catch (error) {
        if (dibatalkan) return;

        console.error('Gagal memulai sinkronisasi Firestore:', error);
        setGagalSinkronisasi(true);
        setSinkronisasiSiap(false);
        Alert.alert(
          'Gagal menghubungkan cloud',
          'Transaksi belum bisa disinkronkan. Data lokal tetap disimpan. Periksa koneksi internet dan Rules Firestore.'
        );
      }
    }

    mulaiSinkronisasi();

    return () => {
      dibatalkan = true;
      if (berhentiMendengarkan) berhentiMendengarkan();
    };
  }, [
    authSudahDicek,
    penggunaUid,
    dataSudahDimuat,
    uidDataDimuat,
    gagalMuatData,
  ]);

  // Simpan cache lokal hanya untuk UID yang telah selesai dimuat.
  useEffect(() => {
    if (
      !authSudahDicek ||
      !penggunaUid ||
      !dataSudahDimuat ||
      gagalMuatData ||
      uidDataDimuat !== penggunaUid
    ) {
      return;
    }

    async function simpanKePenyimpanan() {
      try {
        await AsyncStorage.setItem(
          storageKeyUntukPengguna(penggunaUid),
          JSON.stringify(transaksi)
        );
      } catch (error) {
        console.error(
          'Gagal menyimpan transaksi pengguna:',
          error
        );

        Alert.alert(
          'Gagal menyimpan',
          'Perubahan transaksi belum berhasil disimpan.'
        );
      }
    }

    simpanKePenyimpanan();
  }, [
    transaksi,
    dataSudahDimuat,
    authSudahDicek,
    penggunaUid,
    uidDataDimuat,
    gagalMuatData,
  ]);

  // pembacaan notif
  useEffect(() => {
    const checkNotifications = () => {
      try {
        const enabled =
          DuwekkuNotificationListener.isNotificationAccessEnabled();

        setNotificationAccessEnabled(enabled);

        if (enabled) {
          const notifications =
            DuwekkuNotificationListener.getPendingNotifications();

          if (notifications.length > 0) {
            setPendingPaymentNotifications((previous) => {
              const existingIds = new Set(previous.map((item) => item.id));

              return [
                ...previous,
                ...notifications.filter(
                  (item) => !existingIds.has(item.id)
                ),
              ];
            });
          }
        }
      } catch (error) {
        console.error('Gagal membaca notifikasi:', error);
      }
    };

    checkNotifications();

    const interval = setInterval(checkNotifications, 3000);

    return () => clearInterval(interval);
  }, []);

  const {
    mulai: awalPeriode,
    selesai: akhirPeriode,
  } = rentangPeriode(periodeAktif, tanggalAcuan);

  const transaksiPeriode = transaksi.filter((item) => {
    const tanggalItem = tanggalTransaksiKeDate(item.tanggal);

    return (
      tanggalItem &&
      tanggalItem >= awalPeriode &&
      tanggalItem < akhirPeriode
    );
  });

  const totalPemasukan = transaksiPeriode
    .filter((item) => item.tipe === 'pemasukan')
    .reduce((total, item) => total + item.nominal, 0);

  const totalPengeluaran = transaksiPeriode
    .filter((item) => item.tipe === 'pengeluaran')
    .reduce((total, item) => total + item.nominal, 0);

  const saldo = totalPemasukan - totalPengeluaran;

  const daftarKategori =
    tipe === 'pemasukan'
      ? ['Gaji', 'Uang saku', 'Lainnya']
      : ['Makanan', 'Transportasi', 'Belanja', 'Jajan', 'Lainnya'];

  function resetForm() {
    setIdSedangDiedit(null);
    setTipe('pengeluaran');
    setNominal('');
    setKategori('Makanan');
    setCatatan('');
    setTanggal(tanggalHariIni());
    setJam(jamSekarang());
  }

  function tutupForm() {
    setFormTerbuka(false);
    setTampilkanKalender(false);
    setTampilkanJam(false);
    resetForm();
  }

  function bukaForm(tipeBaru, sourceNotification = null) {
    if (!penggunaUid) {
      Alert.alert(
        'Masuk diperlukan',
        'Masuk dengan Google sebelum menambahkan transaksi.'
      );
      return;
    }

    if (
      !dataSudahDimuat ||
      uidDataDimuat !== penggunaUid ||
      !sinkronisasiSiap ||
      gagalSinkronisasi
    ) {
      Alert.alert(
        'Tunggu sebentar',
        'Data akun sedang disinkronkan atau belum terhubung ke cloud.'
      );
      return;
    }

    resetForm();
    setPendingNotificationDraftId(
      sourceNotification ? sourceNotification.id : null
    );
    setTipe(tipeBaru);
    setKategori(tipeBaru === 'pemasukan' ? 'Gaji' : 'Makanan');
    setFormTerbuka(true);
  }

  function geserPeriode(arah) {
    setTanggalAcuan((tanggalLama) => {
      const tanggalBaru = new Date(tanggalLama);

      if (periodeAktif === 'hari') {
        tanggalBaru.setDate(tanggalBaru.getDate() + arah);
      } else if (periodeAktif === 'minggu') {
        tanggalBaru.setDate(tanggalBaru.getDate() + arah * 7);
      } else if (periodeAktif === 'bulan') {
        tanggalBaru.setDate(1);
        tanggalBaru.setMonth(tanggalBaru.getMonth() + arah);
      } else {
        tanggalBaru.setFullYear(
          tanggalBaru.getFullYear() + arah
        );
      }

      return tanggalBaru;
    });
  }

  async function simpanTransaksiForm() {
    if (!penggunaUid) {
      Alert.alert(
        'Masuk diperlukan',
        'Masuk dengan Google untuk mengelola transaksi pribadi.'
      );
      return;
    }

    if (
      !dataSudahDimuat ||
      uidDataDimuat !== penggunaUid ||
      gagalMuatData ||
      !sinkronisasiSiap ||
      gagalSinkronisasi
    ) {
      Alert.alert(
        'Cloud belum siap',
        'Tunggu sampai transaksi selesai disinkronkan sebelum menyimpan perubahan.'
      );
      return;
    }

    const angka = Number(nominal);

    if (!nominal.trim() || !Number.isFinite(angka) || angka <= 0) {
      Alert.alert(
        'Nominal belum benar',
        'Masukkan nominal lebih dari nol.'
      );
      return;
    }

    if (!catatan.trim()) {
      Alert.alert(
        'Catatan kosong',
        'Masukkan catatan transaksi terlebih dahulu.'
      );
      return;
    }

    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(tanggal)) {
      Alert.alert(
        'Tanggal belum benar',
        'Gunakan format DD/MM/YYYY, misalnya 21/10/2026.'
      );
      return;
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(jam)) {
      Alert.alert(
        'Jam belum benar',
        'Gunakan format HH:MM, misalnya 19:40.'
      );
      return;
    }

    const uidTarget = penggunaUid;
    const draftNotificationId = pendingNotificationDraftId;
    setSedangSimpanTransaksi(true);

    try {
      // Jika sedang mengedit, tulis dokumen dengan ID yang sama di cloud.
      if (idSedangDiedit) {
        const transaksiDiperbarui = {
          id: idSedangDiedit,
          nama: catatan.trim(),
          kategori,
          nominal: angka,
          tipe,
          tanggal,
          jam,
        };

        await setDoc(
          doc(db, 'users', uidTarget, 'transactions', String(idSedangDiedit)),
          transaksiDiperbarui
        );

        // Jangan mengubah tampilan jika pengguna sudah berganti akun saat menunggu jaringan.
        if (auth.currentUser?.uid !== uidTarget) return;

        setTransaksi((dataLama) =>
          dataLama.map((item) =>
            item.id === idSedangDiedit
              ? transaksiDiperbarui
              : item
          )
        );

        if (draftNotificationId) {
          DuwekkuNotificationListener.acknowledgeNotification(
            draftNotificationId
          );
          setPendingPaymentNotifications((previous) =>
            previous.filter(
              (notification) => notification.id !== draftNotificationId
            )
          );
          setPendingNotificationDraftId(null);
        }

        resetForm();
        setFormTerbuka(false);
        Alert.alert('Berhasil!', 'Transaksi berhasil diperbarui dan disinkronkan.');
        return;
      }

      // Jika transaksi baru, gunakan ID yang sama untuk cloud dan cache lokal.
      const referensiTransaksiBaru = doc(
        collection(db, 'users', uidTarget, 'transactions')
      );
      const transaksiBaru = {
        id: referensiTransaksiBaru.id,
        nama: catatan.trim(),
        kategori,
        nominal: angka,
        tipe,
        tanggal,
        jam,
      };

      await setDoc(referensiTransaksiBaru, transaksiBaru);

      if (auth.currentUser?.uid !== uidTarget) return;

      setTransaksi((dataLama) => [
        transaksiBaru,
        ...dataLama.filter((item) => item.id !== transaksiBaru.id),
      ]);

      if (draftNotificationId) {
        DuwekkuNotificationListener.acknowledgeNotification(
          draftNotificationId
        );
        setPendingPaymentNotifications((previous) =>
          previous.filter(
            (notification) => notification.id !== draftNotificationId
          )
        );
        setPendingNotificationDraftId(null);
      }

      tutupForm();
      Alert.alert('Berhasil!', 'Transaksi berhasil ditambahkan dan disinkronkan.');
    } catch (error) {
      console.error('Gagal menyimpan transaksi ke Firestore:', error);
      Alert.alert(
        'Gagal menyimpan transaksi',
        'Perubahan belum dikonfirmasi oleh cloud. Periksa koneksi internet lalu coba lagi.'
      );
    } finally {
      setSedangSimpanTransaksi(false);
    }
  }

  function mulaiEdit(item) {
    if (!penggunaUid || uidDataDimuat !== penggunaUid || !sinkronisasiSiap || gagalSinkronisasi) {
      Alert.alert(
        'Akun belum siap',
        'Tunggu sampai transaksi akun selesai dimuat.'
      );
      return;
    }

    setPendingNotificationDraftId(null);

    if (tanggalTransaksiKeDate(item.tanggal)) {
      setTanggalAcuan(
        tanggalTransaksiKeDate(item.tanggal)
      );
    }

    setIdSedangDiedit(item.id);
    setTipe(item.tipe);
    setNominal(String(item.nominal));
    setKategori(item.kategori);
    setCatatan(item.nama);

    setTanggal(
      /^\d{2}\/\d{2}\/\d{4}$/.test(item.tanggal)
        ? item.tanggal
        : tanggalHariIni()
    );

    setJam(item.jam || jamSekarang());
    setFormTerbuka(true);
  }

  function handleNotificationAction(item) {
    const sourceLabel = getNotificationSourceLabel(
      item.packageName,
      item.title || item.text || ''
    );
    const amount = parseNominalNotifikasi(
      `${item.title || ''} ${item.text || ''}`
    );

    if (amount === null) {
      Alert.alert(
        'Nominal tidak terbaca',
        'DuwekKu tidak bisa membaca nominal dari notifikasi ini. Silakan isi manual.'
      );
      return;
    }

    const sourceText = `${item.title || ''} ${item.text || ''}`.trim();
    const normalizedType = /(?:transfer|pembayaran|dibayar|bayar|purchase|paid|debit|payment|top up|cashout|purchase)/i.test(sourceText)
      ? 'pengeluaran'
      : 'pemasukan';

    resetForm();
    setPendingNotificationDraftId(item.id);
    setIdSedangDiedit(null);
    setTipe(normalizedType);
    setKategori(normalizedType === 'pemasukan' ? 'Gaji' : 'Makanan');
    setNominal(String(Math.round(amount)));
    setCatatan(buildNotificationSummary(sourceLabel, item.title, item.text, amount));
    setTanggal(
      item.timestamp
        ? formatTanggal(new Date(item.timestamp))
        : tanggalHariIni()
    );
    setJam(
      item.timestamp
        ? new Date(item.timestamp).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : jamSekarang()
    );
    setTanggalAcuan(
      item.timestamp ? new Date(item.timestamp) : new Date()
    );
    setFormTerbuka(true);
  }

  function handleNotificationIgnore(item) {
    DuwekkuNotificationListener.acknowledgeNotification(item.id);
    setPendingPaymentNotifications((previous) =>
      previous.filter((notification) => notification.id !== item.id)
    );
  }

  function konfirmasiHapus(item) {
    if (!penggunaUid || uidDataDimuat !== penggunaUid || !sinkronisasiSiap || gagalSinkronisasi) {
      Alert.alert(
        'Akun belum siap',
        'Tunggu sampai transaksi akun selesai dimuat.'
      );
      return;
    }

    Alert.alert(
      'Hapus transaksi?',
      `Transaksi "${item.nama}" akan dihapus secara permanen.`,
      [
        {
          text: 'Batal',
          style: 'cancel',
        },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            const uidTarget = penggunaUid;

            try {
              await deleteDoc(
                doc(db, 'users', uidTarget, 'transactions', String(item.id))
              );

              if (auth.currentUser?.uid !== uidTarget) return;

              setTransaksi((dataLama) =>
                dataLama.filter((data) => data.id !== item.id)
              );

              if (idSedangDiedit === item.id) {
                tutupForm();
              }
            } catch (error) {
              console.error('Gagal menghapus transaksi dari Firestore:', error);
              Alert.alert(
                'Gagal menghapus',
                'Transaksi belum berhasil dihapus dari cloud. Periksa koneksi internet lalu coba lagi.'
              );
            }
          },
        },
      ]
    );
  }

  async function handleLoginGoogle() {
    try {
      setSedangLogin(true);

      const user = await loginDenganGoogle();

      if (user) {
        Alert.alert(
          'Login berhasil',
          `Selamat datang, ${user.displayName || user.email}!`
        );
      }
    } catch (error) {
      console.error('Login Google gagal:', error);

      Alert.alert(
        'Login gagal',
        error.message || 'Terjadi kesalahan saat login Google.'
      );
    } finally {
      setSedangLogin(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutDuwekKu();
      Alert.alert('Berhasil', 'Kamu sudah logout.');
    } catch (error) {
      console.error('Logout gagal:', error);

      Alert.alert(
        'Logout gagal',
        'Silakan coba lagi.'
      );
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logo}>DuwekKu</Text>

          {!authSudahDicek ? (
            <View
              style={[
                styles.accountButton,
                styles.accountButtonDisabled,
              ]}
            >
              <Text style={styles.accountButtonText}>
                Memuat...
              </Text>
            </View>
          ) : (
            <Pressable
              style={styles.accountButton}
              onPress={
                pengguna
                  ? handleLogout
                  : handleLoginGoogle
              }
              disabled={sedangLogin}
            >
              <View style={styles.accountAvatar}>
                <Text style={styles.accountAvatarText}>
                  {pengguna
                    ? (
                      pengguna.displayName ||
                      pengguna.email ||
                      'A'
                    )
                      .charAt(0)
                      .toUpperCase()
                    : '◉'}
                </Text>
              </View>

              <Text
                style={styles.accountButtonText}
                numberOfLines={1}
              >
                {sedangLogin
                  ? 'Masuk...'
                  : pengguna
                    ? 'Keluar'
                    : 'Masuk'}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.notificationSection}>
          <View style={styles.notificationHeaderRowCompact}>
            <Text style={styles.notificationSectionTitle}>Notifikasi masuk</Text>

            {!notificationAccessEnabled ? (
              <Pressable
                style={styles.notificationAccessButton}
                onPress={() =>
                  DuwekkuNotificationListener.openNotificationAccessSettings()
                }
              >
                <Text style={styles.notificationAccessText}>Aktifkan</Text>
              </Pressable>
            ) : (
              <Text style={styles.notificationStatusText}>Aktif</Text>
            )}
          </View>

          {notificationAccessEnabled ? (
            pendingPaymentNotifications.length === 0 ? (
              <Text style={styles.notificationDescription}>
                Belum ada notifikasi masuk.
              </Text>
            ) : (
              pendingPaymentNotifications.map((item) => {
                const notificationAmount = parseNominalNotifikasi(
                  `${item.title || ''} ${item.text || ''}`
                );
                const notificationSource = getNotificationSourceLabel(
                  item.packageName,
                  item.title || item.text || ''
                );
                const notificationDate = item.timestamp
                  ? new Date(item.timestamp).toLocaleString('id-ID', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Baru';

                return (
                  <View key={item.id} style={styles.notificationCard}>
                    <View style={styles.notificationBody}>
                      <View style={styles.notificationRowTop}>
                        <Text style={styles.notificationSource} numberOfLines={1}>
                          {notificationSource}
                        </Text>
                        <Text style={styles.notificationMetaText} numberOfLines={1}>
                          {notificationDate}
                        </Text>
                      </View>

                      <View style={styles.notificationRowBottom}>
                        <Text style={styles.notificationTitle} numberOfLines={1}>
                          {item.title || 'Pembayaran'}
                        </Text>

                        <Text style={styles.notificationAmount} numberOfLines={1}>
                          {notificationAmount !== null
                            ? formatRupiah(notificationAmount)
                            : 'Nominal tidak terbaca'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.notificationActionRow}>
                      <Pressable
                        style={[
                          styles.notificationActionButton,
                          styles.notificationAcceptButton,
                        ]}
                        onPress={() => handleNotificationAction(item)}
                        accessibilityLabel="Catat transaksi dari notifikasi"
                      >
                        <Text style={styles.notificationActionText}>✓</Text>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.notificationActionButton,
                          styles.notificationIgnoreButton,
                        ]}
                        onPress={() => {
                          Alert.alert(
                            'Abaikan notifikasi?',
                            'Notifikasi ini akan dihapus dari daftar deteksi DuwekKu.',
                            [
                              { text: 'Batal', style: 'cancel' },
                              {
                                text: 'Abaikan',
                                style: 'destructive',
                                onPress: () => handleNotificationIgnore(item),
                              },
                            ]
                          );
                        }}
                        accessibilityLabel="Abaikan notifikasi"
                      >
                        <Text style={styles.notificationActionText}>✕</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )
          ) : (
            <Text style={styles.notificationDescription}>
              Akses notif belum aktif. Izinkan untuk mulai mendeteksi transaksi.
            </Text>
          )}
        </View>

        {!authSudahDicek ||
          (pengguna && !dataSudahDimuat) ? (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>
              Memuat transaksi...
            </Text>
          </View>
        ) : pengguna && gagalMuatData ? (
          <View style={styles.loadingBox}>
            <Text style={styles.authPromptText}>
              Transaksi lokal belum bisa dimuat. Data tidak dihapus.
              Tutup lalu buka kembali aplikasi untuk mencoba lagi.
            </Text>
          </View>
        ) : pengguna && gagalSinkronisasi ? (
          <View style={styles.loadingBox}>
            <Text style={styles.authPromptText}>
              Cloud belum bisa dihubungi. Data lokal tetap disimpan dan transaksi dinonaktifkan sementara agar data tidak tertimpa. Periksa koneksi dan masuk kembali untuk mencoba lagi.
            </Text>
          </View>
        ) : pengguna && uidDataDimuat !== pengguna.uid ? (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>
              Memastikan akun transaksi...
            </Text>
          </View>
        ) : pengguna && !sinkronisasiSiap ? (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>
              Menyinkronkan transaksi dengan cloud...
            </Text>
          </View>
        ) : !pengguna ? (
          <View style={styles.loadingBox}>
            <Text style={styles.authPromptText}>
              Masuk dengan Google untuk melihat dan mengelola
              transaksi pribadimu.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.balanceCard}>
              <View style={styles.balanceLabelRow}>
                <Text style={styles.cardLabel}>
                  Total Saldo
                </Text>

                <Text style={styles.balanceIcon} numberOfLines={1}>
                  {labelPeriode(periodeAktif, tanggalAcuan)}
                </Text>
              </View>

              <Text
                style={styles.balance}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatRupiah(saldo)}
              </Text>

              <Text style={styles.balanceNote}>
                Ringkasan seluruh transaksi
              </Text>

              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>
                    Pemasukan
                  </Text>

                  <Text
                    style={styles.summaryAmount}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatRupiah(totalPemasukan)}
                  </Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>
                    Pengeluaran
                  </Text>

                  <Text
                    style={styles.summaryAmount}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatRupiah(totalPengeluaran)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.quickActions}>
              <Pressable
                style={[
                  styles.quickAction,
                  styles.incomeAction,
                ]}
                onPress={() => bukaForm('pemasukan')}
              >
                <Text style={styles.quickActionIcon}>
                  ＋
                </Text>

                <Text style={styles.quickActionText}>
                  Pemasukan
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.quickAction,
                  styles.expenseAction,
                ]}
                onPress={() => bukaForm('pengeluaran')}
              >
                <Text style={styles.quickActionIcon}>
                  −
                </Text>

                <Text style={styles.quickActionText}>
                  Pengeluaran
                </Text>
              </Pressable>
            </View>

            <View style={styles.historySection}>
              <View style={styles.historyHeading}>
                <View>
                  <Text style={styles.sectionTitle}>
                    Semua riwayat
                  </Text>

                  <Text style={styles.historyCount}>
                    {transaksiPeriode.length} transaksi
                  </Text>
                </View>
              </View>

              <View style={styles.periodTabs}>
                {[
                  ['hari', 'Hari'],
                  ['minggu', 'Minggu'],
                  ['bulan', 'Bulan'],
                  ['tahun', 'Tahun'],
                ].map(([nilai, judul]) => (
                  <Pressable
                    key={nilai}
                    style={[
                      styles.periodTab,
                      periodeAktif === nilai &&
                      styles.periodTabActive,
                    ]}
                    onPress={() => setPeriodeAktif(nilai)}
                  >
                    <Text
                      style={[
                        styles.periodTabText,
                        periodeAktif === nilai &&
                        styles.periodTabTextActive,
                      ]}
                    >
                      {judul}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.periodNavigator}>
                <Pressable
                  style={styles.periodArrow}
                  onPress={() => geserPeriode(-1)}
                  accessibilityLabel="Periode sebelumnya"
                >
                  <Text style={styles.periodArrowText}>
                    ‹
                  </Text>
                </Pressable>

                <Text
                  style={styles.periodLabel}
                  numberOfLines={1}
                >
                  {labelPeriode(
                    periodeAktif,
                    tanggalAcuan
                  )}
                </Text>

                <Pressable
                  style={styles.periodArrow}
                  onPress={() => geserPeriode(1)}
                  accessibilityLabel="Periode berikutnya"
                >
                  <Text style={styles.periodArrowText}>
                    ›
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.calendarButton}
                  onPress={() =>
                    setTampilkanKalenderPeriode(true)
                  }
                  accessibilityLabel="Pilih tanggal periode"
                >
                  <Text style={styles.calendarButtonText}>
                    ▦
                  </Text>
                </Pressable>
              </View>

              {tampilkanKalenderPeriode && (
                <DateTimePicker
                  value={tanggalAcuan}
                  mode="date"
                  display="calendar"
                  onChange={(event, selectedDate) => {
                    setTampilkanKalenderPeriode(false);

                    if (
                      event.type === 'set' &&
                      selectedDate
                    ) {
                      setTanggalAcuan(selectedDate);
                    }
                  }}
                />
              )}

              <View style={styles.transactions}>
                {transaksiPeriode.map((item) => (
                  <View
                    key={item.id}
                    style={styles.transactionRow}
                  >
                    <View
                      style={[
                        styles.transactionIcon,
                        item.tipe === 'pemasukan'
                          ? styles.incomeIcon
                          : styles.expenseIcon,
                      ]}
                    >
                      <Text
                        style={
                          item.tipe === 'pemasukan'
                            ? styles.incomeIconText
                            : styles.expenseIconText
                        }
                      >
                        {item.tipe === 'pemasukan'
                          ? '↙'
                          : '↗'}
                      </Text>
                    </View>

                    <View style={styles.transactionInfo}>
                      <Text
                        style={styles.transactionName}
                        numberOfLines={1}
                      >
                        {item.nama}
                      </Text>

                      <Text
                        style={styles.transactionDate}
                        numberOfLines={1}
                      >
                        {item.kategori} · {item.tanggal}
                        {item.jam ? ` · ${item.jam}` : ''}
                      </Text>

                      <View style={styles.actionRow}>
                        <Pressable
                          style={styles.editButton}
                          onPress={() => mulaiEdit(item)}
                        >
                          <Text
                            style={styles.editButtonText}
                          >
                            Edit
                          </Text>
                        </Pressable>

                        <Pressable
                          style={styles.deleteButton}
                          onPress={() =>
                            konfirmasiHapus(item)
                          }
                        >
                          <Text
                            style={styles.deleteButtonText}
                          >
                            Hapus
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    <Text
                      style={
                        item.tipe === 'pemasukan'
                          ? styles.incomeAmount
                          : styles.expenseAmount
                      }
                      numberOfLines={1}
                    >
                      {item.tipe === 'pemasukan'
                        ? '+'
                        : '−'}
                      {formatRupiah(item.nominal)}
                    </Text>
                  </View>
                ))}

                {transaksiPeriode.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>
                      ▤
                    </Text>

                    <Text style={styles.emptyTitle}>
                      Belum ada transaksi
                    </Text>

                    <Text style={styles.emptyText}>
                      Tidak ada transaksi pada periode ini.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}

        <Text style={styles.footer}>
          DuwekKu · Catat uangmu
        </Text>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={formTerbuka}
        onRequestClose={tutupForm}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissArea}
            onPress={tutupForm}
            accessibilityLabel="Tutup form"
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}
            pointerEvents="box-none"
          >
            <View style={styles.formModal}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalEyebrow}>
                    {idSedangDiedit
                      ? 'PERBARUI CATATAN'
                      : 'TRANSAKSI BARU'}
                  </Text>

                  <Text style={styles.modalTitle}>
                    {idSedangDiedit
                      ? 'Edit transaksi'
                      : 'Catat transaksi'}
                  </Text>
                </View>

                <Pressable
                  style={styles.closeButton}
                  onPress={tutupForm}
                  accessibilityLabel="Tutup"
                >
                  <Text style={styles.closeButtonText}>
                    ×
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.formScrollView}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={
                  Platform.OS === 'ios' ? 'interactive' : 'on-drag'
                }
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.formContent}
              >
                <View style={styles.typeRow}>
                  {[
                    'pemasukan',
                    'pengeluaran',
                  ].map((nilai) => {
                    const aktif = tipe === nilai;

                    return (
                      <Pressable
                        key={nilai}
                        style={[
                          styles.typeButton,
                          aktif &&
                          (nilai === 'pemasukan'
                            ? styles.incomeSelected
                            : styles.expenseSelected),
                        ]}
                        onPress={() => {
                          setTipe(nilai);

                          setKategori(
                            nilai === 'pemasukan'
                              ? 'Gaji'
                              : 'Makanan'
                          );
                        }}
                      >
                        <Text
                          style={[
                            styles.typeText,
                            aktif && styles.selectedText,
                          ]}
                        >
                          {nilai === 'pemasukan'
                            ? '＋ Pemasukan'
                            : '− Pengeluaran'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>
                  Nominal (Rupiah)
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Contoh: 25000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  value={nominal}
                  onChangeText={setNominal}
                />

                <Text style={styles.label}>
                  Kategori
                </Text>

                <View style={styles.categoryRow}>
                  {daftarKategori.map((item) => (
                    <Pressable
                      key={item}
                      style={[
                        styles.categoryButton,
                        kategori === item &&
                        styles.categorySelected,
                      ]}
                      onPress={() => setKategori(item)}
                    >
                      <Text
                        style={[
                          styles.categoryText,
                          kategori === item &&
                          styles.categoryTextSelected,
                        ]}
                      >
                        {item}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>
                  Catatan
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Contoh: Makan siang"
                  placeholderTextColor="#94A3B8"
                  value={catatan}
                  onChangeText={setCatatan}
                />

                <View style={styles.formDateRow}>
                  <View style={styles.formDateColumn}>
                    <Text style={styles.label}>
                      Tanggal
                    </Text>

                    <Pressable
                      style={styles.datePickerButton}
                      onPress={() =>
                        setTampilkanKalender(true)
                      }
                    >
                      <Text style={styles.datePickerText}>
                        {tanggal}
                      </Text>

                      <Text style={styles.datePickerIcon}>
                        ▦
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.formDateColumn}>
                    <Text style={styles.label}>
                      Jam
                    </Text>

                    <Pressable
                      style={styles.datePickerButton}
                      onPress={() =>
                        setTampilkanJam(true)
                      }
                    >
                      <Text style={styles.datePickerText}>
                        {jam}
                      </Text>

                      <Text style={styles.datePickerIcon}>
                        ◷
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {tampilkanKalender && (
                  <DateTimePicker
                    value={tanggalKeDate(tanggal)}
                    mode="date"
                    display="calendar"
                    onChange={(event, selectedDate) => {
                      setTampilkanKalender(false);

                      if (
                        event.type === 'set' &&
                        selectedDate
                      ) {
                        setTanggal(
                          formatTanggal(selectedDate)
                        );
                      }
                    }}
                  />
                )}

                {tampilkanJam && (
                  <DateTimePicker
                    value={jamKeDate(jam)}
                    mode="time"
                    display="clock"
                    is24Hour
                    onChange={(event, selectedDate) => {
                      setTampilkanJam(false);

                      if (
                        event.type === 'set' &&
                        selectedDate
                      ) {
                        setJam(formatJam(selectedDate));
                      }
                    }}
                  />
                )}

                <Pressable
                  style={styles.saveButton}
                  onPress={simpanTransaksiForm}
                  disabled={sedangSimpanTransaksi}
                >
                  <Text style={styles.saveButtonText}>
                    {sedangSimpanTransaksi
                      ? 'Menyimpan ke cloud...'
                      : idSedangDiedit
                        ? 'Simpan perubahan'
                        : 'Simpan transaksi'}
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F7',
  },
  screenContent: {
    paddingBottom: 24,
  },
  header: {
    minHeight: 88,
    backgroundColor: '#102A43',
    paddingTop: 48,
    paddingHorizontal: 22,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  accountButton: {
    maxWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 13,
  },
  accountButtonDisabled: {
    paddingLeft: 13,
  },
  accountAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#B9F2D1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountAvatarText: {
    color: '#087F50',
    fontSize: 14,
    fontWeight: '800',
  },
  accountButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
  },
  authPromptText: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  balanceCard: {
    backgroundColor: '#087F70',
    marginHorizontal: 18,
    marginTop: 8,
    padding: 20,
    borderRadius: 22,
    shadowColor: '#087F70',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  balanceLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    color: '#D6F5ED',
    fontSize: 14,
    fontWeight: '600',
  },
  balanceIcon: {
    color: '#D6F5ED',
    fontSize: 12,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
  },
  balance: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 12,
  },
  balanceNote: {
    color: '#D6F5ED',
    fontSize: 12,
    marginTop: 5,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
  },
  summaryCard: {
    flex: 1,
    minWidth: 0,
  },
  summaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 14,
  },
  summaryLabel: {
    color: '#D6F5ED',
    fontSize: 11,
  },
  summaryAmount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 7,
    flexShrink: 1,
  },
  incomeAmount: {
    color: '#087F50',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 7,
    flexShrink: 1,
  },
  expenseAmount: {
    color: '#D9364F',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 7,
    flexShrink: 1,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 18,
    marginTop: 12,
  },
  quickAction: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  incomeAction: {
    backgroundColor: '#E8FFF0',
  },
  expenseAction: {
    backgroundColor: '#FFE9ED',
  },
  quickActionIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  quickActionText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  historySection: {
    marginHorizontal: 18,
    marginTop: 20,
  },
  historyHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#334155',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  historyCount: {
    color: '#8293A3',
    fontSize: 12,
    marginTop: 4,
  },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: '#E9EEEF',
    borderRadius: 12,
    padding: 4,
  },
  periodTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  periodTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#102A43',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  periodTabText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  periodTabTextActive: {
    color: '#087F70',
    fontWeight: '800',
  },
  periodNavigator: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  periodArrow: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  periodArrowText: {
    color: '#334E68',
    fontSize: 28,
    lineHeight: 31,
  },
  periodLabel: {
    flex: 1,
    color: '#243B53',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  calendarButton: {
    width: 40,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDF5E8',
    borderRadius: 12,
  },
  calendarButtonText: {
    color: '#087F70',
    fontSize: 22,
  },
  transactions: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F0',
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeIcon: {
    backgroundColor: '#DDF5E8',
  },
  expenseIcon: {
    backgroundColor: '#FCE6E8',
  },
  incomeIconText: {
    color: '#087F50',
    fontSize: 18,
    fontWeight: '800',
  },
  expenseIconText: {
    color: '#D9364F',
    fontSize: 18,
    fontWeight: '800',
  },
  transactionInfo: {
    flex: 1,
    minWidth: 0,
  },
  transactionName: {
    color: '#243B53',
    fontSize: 13,
    fontWeight: '700',
  },
  transactionDate: {
    color: '#8293A3',
    fontSize: 10,
    marginTop: 5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
  },
  editButton: {
    backgroundColor: '#E8F2FA',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  editButtonText: {
    color: '#075985',
    fontSize: 10,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#FFF0F0',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
  },
  deleteButtonText: {
    color: '#B42335',
    fontSize: 10,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 38,
  },
  emptyIcon: {
    color: '#9AAAB8',
    fontSize: 32,
  },
  emptyTitle: {
    color: '#334E68',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
  },
  emptyText: {
    color: '#8293A3',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
  },
  footer: {
    color: '#9AAAB8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(12, 27, 39, 0.52)',
  },
  modalDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  modalKeyboard: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  formModal: {
    width: '100%',
    maxHeight: '86%',
    flexShrink: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalEyebrow: {
    color: '#087F70',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  modalTitle: {
    color: '#102A43',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F6',
    borderRadius: 18,
  },
  closeButtonText: {
    color: '#526579',
    fontSize: 25,
    lineHeight: 28,
  },
  formContent: {
    paddingBottom: 6,
  },
  formScrollView: {
    flexShrink: 1,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  typeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F6',
  },
  incomeSelected: {
    backgroundColor: '#087F70',
  },
  expenseSelected: {
    backgroundColor: '#D9364F',
  },
  typeText: {
    color: '#526579',
    fontWeight: '700',
    fontSize: 12,
  },
  selectedText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  label: {
    color: '#334E68',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 10,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: '#102A43',
    backgroundColor: '#FFFFFF',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    backgroundColor: '#F1F5F6',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  categorySelected: {
    backgroundColor: '#DDF5E8',
  },
  categoryText: {
    color: '#526579',
    fontSize: 11,
    fontWeight: '600',
  },
  categoryTextSelected: {
    color: '#087F70',
    fontWeight: '800',
  },
  formDateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formDateColumn: {
    flex: 1,
  },
  datePickerButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D9E2EC',
    borderRadius: 12,
    paddingHorizontal: 13,
  },
  datePickerText: {
    color: '#102A43',
    fontSize: 13,
    fontWeight: '600',
  },
  datePickerIcon: {
    color: '#087F70',
    fontSize: 19,
  },
  saveButton: {
    backgroundColor: '#102A43',
    paddingVertical: 15,
    borderRadius: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  notificationSection: {
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    marginHorizontal: 18,
  },

  notificationHeaderRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  notificationSectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  notificationAccessButton: {
    backgroundColor: '#16A34A',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },

  notificationAccessText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  notificationStatusText: {
    color: '#86EFAC',
    fontSize: 11,
    fontWeight: '700',
  },

  notificationDescription: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },

  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#334155',
    borderRadius: 12,
  },

  notificationBody: {
    flex: 1,
    marginRight: 10,
  },

  notificationRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },

  notificationRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },

  notificationSource: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },

  notificationMetaText: {
    color: '#CBD5E1',
    fontSize: 10,
    marginLeft: 8,
  },

  notificationTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  notificationAmount: {
    color: '#86EFAC',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    minWidth: 90,
  },

  notificationActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  notificationActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  notificationIgnoreButton: {
    backgroundColor: '#475569',
  },

  notificationAcceptButton: {
    backgroundColor: '#16A34A',
  },

  notificationActionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },

  primaryButton: {
    backgroundColor: '#16A34A',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  secondaryButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#475569',
  },

  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

