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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

const STORAGE_KEY = '@duwekkU_transaksi_v1';

const TRANSAKSI_CONTOH = [
  {
    id: 'contoh-1',
    nama: 'Belanja kebutuhan',
    kategori: 'Belanja',
    nominal: 250000,
    tipe: 'pengeluaran',
    tanggal: 'Transaksi contoh',
  },
  {
    id: 'contoh-2',
    nama: 'Makan siang',
    kategori: 'Makanan',
    nominal: 35000,
    tipe: 'pengeluaran',
    tanggal: 'Transaksi contoh',
  },
  {
    id: 'contoh-3',
    nama: 'Uang masuk',
    kategori: 'Lainnya',
    nominal: 500000,
    tipe: 'pemasukan',
    tanggal: 'Transaksi contoh',
  },
];

const formatRupiah = (angka) =>
  'Rp ' + angka.toLocaleString('id-ID');

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

function jamKeDate(value) {
  const [jam, menit] = value.split(':').map(Number);
  const date = new Date();

  if (
    Number.isInteger(jam) &&
    Number.isInteger(menit) &&
    jam >= 0 && jam <= 23 &&
    menit >= 0 && menit <= 59
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
  const [idSedangDiedit, setIdSedangDiedit] = useState(null);

  const [tipe, setTipe] = useState('pengeluaran');
  const [nominal, setNominal] = useState('');
  const [kategori, setKategori] = useState('Makanan');
  const [catatan, setCatatan] = useState('');
  const [tanggal, setTanggal] = useState(tanggalHariIni());
  const [jam, setJam] = useState(jamSekarang());
  const [tampilkanKalender, setTampilkanKalender] = useState(false);
  const [tampilkanJam, setTampilkanJam] = useState(false);


  // Memuat transaksi ketika aplikasi dibuka.
  useEffect(() => {
    async function muatTransaksi() {
      try {
        const dataTersimpan = await AsyncStorage.getItem(STORAGE_KEY);

        if (dataTersimpan !== null) {
          const dataParsed = JSON.parse(dataTersimpan);
          setTransaksi(Array.isArray(dataParsed) ? dataParsed : []);
        } else {
          setTransaksi(TRANSAKSI_CONTOH);
        }
      } catch (error) {
        Alert.alert(
          'Gagal memuat data',
          'Data transaksi tidak bisa dibaca. Silakan buka ulang aplikasi.'
        );
        setTransaksi(TRANSAKSI_CONTOH);
      } finally {
        setDataSudahDimuat(true);
      }
    }

    muatTransaksi();
  }, []);

  // Menyimpan transaksi setiap kali datanya berubah.
  useEffect(() => {
    if (!dataSudahDimuat) return;

    async function simpanKePenyimpanan() {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(transaksi)
        );
      } catch (error) {
        Alert.alert(
          'Gagal menyimpan',
          'Perubahan transaksi belum berhasil disimpan.'
        );
      }
    }

    simpanKePenyimpanan();
  }, [transaksi, dataSudahDimuat]);

  const totalPemasukan = transaksi
    .filter((item) => item.tipe === 'pemasukan')
    .reduce((total, item) => total + item.nominal, 0);

  const totalPengeluaran = transaksi
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

  function simpanTransaksiForm() {
    if (!dataSudahDimuat) {
      Alert.alert('Tunggu sebentar', 'Data masih dimuat.');
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

    // Jika sedang mengedit, perbarui transaksi lama.
    if (idSedangDiedit) {
      setTransaksi((dataLama) =>
        dataLama.map((item) =>
          item.id === idSedangDiedit
            ? {
              ...item,
              nama: catatan.trim(),
              kategori,
              nominal: angka,
              tipe,
              tanggal,
              jam,
            }
            : item
        )
      );

      resetForm();
      Alert.alert('Berhasil!', 'Transaksi berhasil diperbarui.');
      return;
    }

    // Jika tidak sedang mengedit, tambahkan transaksi baru.
    const transaksiBaru = {
      id: Date.now().toString(),
      nama: catatan.trim(),
      kategori,
      nominal: angka,
      tipe,
      tanggal,
      jam,
    };

    setTransaksi((dataLama) => [transaksiBaru, ...dataLama]);

    setNominal('');
    setCatatan('');

    Alert.alert('Berhasil!', 'Transaksi berhasil ditambahkan.');
  }

  function mulaiEdit(item) {
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

    setJam(
      item.jam || jamSekarang()
    );
  }

  function konfirmasiHapus(item) {
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
          onPress: () => {
            setTransaksi((dataLama) =>
              dataLama.filter((data) => data.id !== item.id)
            );

            if (idSedangDiedit === item.id) {
              resetForm();
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>DuwekKu</Text>
          <Text style={styles.tagline}>
            Pahami Uangmu, Kendalikan Masa Depanmu.
          </Text>
        </View>

        {!dataSudahDimuat ? (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>
              Memuat transaksi...
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.cardLabel}>Total Saldo</Text>
              <Text style={styles.balance}>
                {formatRupiah(saldo)}
              </Text>
              <Text style={styles.balanceNote}>
                Saldo dari transaksi saat ini
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, styles.incomeCard]}>
                <Text style={styles.summaryLabel}>Pemasukan</Text>
                <Text style={styles.incomeAmount}>
                  {formatRupiah(totalPemasukan)}
                </Text>
              </View>

              <View style={[styles.summaryCard, styles.expenseCard]}>
                <Text style={styles.summaryLabel}>Pengeluaran</Text>
                <Text style={styles.expenseAmount}>
                  {formatRupiah(totalPengeluaran)}
                </Text>
              </View>
            </View>

            <View style={styles.form}>
              <Text style={styles.sectionTitle}>
                {idSedangDiedit
                  ? 'Edit Transaksi'
                  : 'Tambah Transaksi'}
              </Text>

              <View style={styles.typeRow}>
                <Pressable
                  style={[
                    styles.typeButton,
                    tipe === 'pemasukan' && styles.incomeSelected,
                  ]}
                  onPress={() => {
                    setTipe('pemasukan');

                    if (
                      !['Gaji', 'Uang saku', 'Lainnya'].includes(kategori)
                    ) {
                      setKategori('Lainnya');
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.typeText,
                      tipe === 'pemasukan' && styles.selectedText,
                    ]}
                  >
                    + Pemasukan
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.typeButton,
                    tipe === 'pengeluaran' && styles.expenseSelected,
                  ]}
                  onPress={() => {
                    setTipe('pengeluaran');

                    if (
                      ![
                        'Makanan',
                        'Transportasi',
                        'Belanja',
                        'Jajan',
                        'Lainnya',
                      ].includes(kategori)
                    ) {
                      setKategori('Makanan');
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.typeText,
                      tipe === 'pengeluaran' && styles.selectedText,
                    ]}
                  >
                    − Pengeluaran
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Nominal (Rupiah)</Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: 25000"
                keyboardType="number-pad"
                value={nominal}
                onChangeText={setNominal}
              />

              <Text style={styles.label}>Kategori</Text>
              <View style={styles.categoryRow}>
                {daftarKategori.map((item) => (
                  <Pressable
                    key={item}
                    style={[
                      styles.categoryButton,
                      kategori === item && styles.categorySelected,
                    ]}
                    onPress={() => setKategori(item)}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        kategori === item && styles.selectedText,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </View>


              <Text style={styles.label}>Tanggal Transaksi</Text>

              <View style={styles.pickerRow}>
                <TextInput
                  style={styles.pickerInput}
                  value={tanggal}
                  editable={false}
                  placeholder="Pilih tanggal"
                />

                <Pressable
                  style={styles.pickerIconButton}
                  onPress={() => setTampilkanKalender(true)}
                >
                  <Text style={styles.pickerIconText}>📅</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Jam Transaksi</Text>

              <View style={styles.pickerRow}>
                <TextInput
                  style={styles.pickerInput}
                  value={jam}
                  editable={false}
                  placeholder="Pilih jam"
                />

                <Pressable
                  style={styles.pickerIconButton}
                  onPress={() => setTampilkanJam(true)}
                >
                  <Text style={styles.pickerIconText}>🕒</Text>
                </Pressable>
              </View>

              {tampilkanKalender && (
                <DateTimePicker
                  value={tanggalKeDate(tanggal)}
                  mode="date"
                  display="calendar"
                  onChange={(event, selectedDate) => {
                    setTampilkanKalender(false);

                    if (event.type === 'set' && selectedDate) {
                      setTanggal(formatTanggal(selectedDate));
                    }
                  }}
                />
              )}

              {tampilkanJam && (
                <DateTimePicker
                  value={jamKeDate(jam)}
                  mode="time"
                  display="clock"
                  is24Hour={true}
                  onChange={(event, selectedDate) => {
                    setTampilkanJam(false);

                    if (event.type === 'set' && selectedDate) {
                      setJam(formatJam(selectedDate));
                    }
                  }}
                />
              )}

              <Text style={styles.label}>Catatan</Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: Makan siang di warteg"
                value={catatan}
                onChangeText={setCatatan}
              />

              <Pressable
                style={styles.saveButton}
                onPress={simpanTransaksiForm}
              >
                <Text style={styles.saveButtonText}>
                  {idSedangDiedit
                    ? 'Simpan Perubahan'
                    : 'Simpan Transaksi'}
                </Text>
              </Pressable>

              {idSedangDiedit && (
                <Pressable
                  style={styles.cancelButton}
                  onPress={resetForm}
                >
                  <Text style={styles.cancelButtonText}>
                    Batal Edit
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.transactions}>
              <Text style={styles.sectionTitle}>
                Riwayat Transaksi
              </Text>

              {transaksi.map((item) => (
                <View key={item.id} style={styles.transactionRow}>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionName}>
                      {item.nama}
                    </Text>

                    <Text style={styles.transactionDate}>
                      {item.kategori} • {item.tanggal}
                      {item.jam ? ` • ${item.jam}` : ''}
                    </Text>

                    <View style={styles.actionRow}>
                      <Pressable
                        style={styles.editButton}
                        onPress={() => mulaiEdit(item)}
                      >
                        <Text style={styles.editButtonText}>
                          Edit
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.deleteButton}
                        onPress={() => konfirmasiHapus(item)}
                      >
                        <Text style={styles.deleteButtonText}>
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
                  >
                    {item.tipe === 'pemasukan' ? '+' : '−'}
                    {formatRupiah(item.nominal)}
                  </Text>
                </View>
              ))}

              {transaksi.length === 0 && (
                <Text style={styles.emptyText}>
                  Belum ada transaksi.
                </Text>
              )}
            </View>
          </>
        )}

        <Text style={styles.footer}>
          DuwekKu • Catat uangmu.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F7F6',
  },
  header: {
    backgroundColor: '#102A43',
    paddingTop: 55,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: 'bold',
  },
  tagline: {
    color: '#B8D8D0',
    fontSize: 12,
    marginTop: 6,
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
  },
  loadingText: {
    color: '#425466',
    fontSize: 14,
  },
  balanceCard: {
    backgroundColor: '#087F70',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 22,
    borderRadius: 20,
  },
  cardLabel: {
    color: '#D6F5ED',
    fontSize: 14,
  },
  balance: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 10,
  },
  balanceNote: {
    color: '#D6F5ED',
    fontSize: 12,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  incomeCard: {
    backgroundColor: '#D9F5E8',
  },
  expenseCard: {
    backgroundColor: '#FFE5E5',
  },
  summaryLabel: {
    color: '#425466',
    fontSize: 12,
  },
  incomeAmount: {
    color: '#087F50',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 8,
  },
  expenseAmount: {
    color: '#D9364F',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 8,
  },
  form: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 18,
    borderRadius: 18,
  },
  sectionTitle: {
    color: '#102A43',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  incomeSelected: {
    backgroundColor: '#087F70',
  },
  expenseSelected: {
    backgroundColor: '#D9364F',
  },
  typeText: {
    color: '#425466',
    fontWeight: '600',
    fontSize: 12,
  },
  selectedText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  label: {
    color: '#334E68',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D9E2EC',
    borderRadius: 12,
    padding: 13,
    fontSize: 14,
    color: '#102A43',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  categorySelected: {
    backgroundColor: '#087F70',
  },
  categoryText: {
    color: '#425466',
    fontSize: 12,
  },
  saveButton: {
    backgroundColor: '#102A43',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 22,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#E8EEF3',
    padding: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  cancelButtonText: {
    color: '#334E68',
    fontSize: 13,
    fontWeight: 'bold',
  },
  transactions: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 18,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F0',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionName: {
    color: '#243B53',
    fontSize: 13,
    fontWeight: '600',
  },
  transactionDate: {
    color: '#8293A3',
    fontSize: 11,
    marginTop: 5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
  },
  editButton: {
    backgroundColor: '#E0F2FE',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  editButtonText: {
    color: '#075985',
    fontSize: 11,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#FFE5E5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  deleteButtonText: {
    color: '#B42335',
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#8293A3',
    textAlign: 'center',
    padding: 16,
  },
  footer: {
    color: '#8293A3',
    fontSize: 11,
    textAlign: 'center',
    marginVertical: 24,
  },

  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  pickerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    borderRadius: 12,
    padding: 13,
    fontSize: 14,
    color: '#102A43',
    backgroundColor: '#FFFFFF',
  },

  pickerIconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E0F2F1',
    alignItems: 'center',
    justifyContent: 'center',
  },

  pickerIconText: {
    fontSize: 22,
  },
});