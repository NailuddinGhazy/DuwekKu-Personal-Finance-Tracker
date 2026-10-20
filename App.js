
import { useState } from 'react';
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

const formatRupiah = (angka) =>
  'Rp ' + angka.toLocaleString('id-ID');

export default function App() {
  const [transaksi, setTransaksi] = useState([
    {
      id: '1',
      nama: 'Belanja kebutuhan',
      kategori: 'Belanja',
      nominal: 250000,
      tipe: 'pengeluaran',
      tanggal: 'Transaksi contoh',
    },
    {
      id: '2',
      nama: 'Makan siang',
      kategori: 'Makanan',
      nominal: 35000,
      tipe: 'pengeluaran',
      tanggal: 'Transaksi contoh',
    },
    {
      id: '3',
      nama: 'Uang masuk',
      kategori: 'Lainnya',
      nominal: 500000,
      tipe: 'pemasukan',
      tanggal: 'Transaksi contoh',
    },
  ]);

  const [tipe, setTipe] = useState('pengeluaran');
  const [nominal, setNominal] = useState('');
  const [kategori, setKategori] = useState('Makanan');
  const [catatan, setCatatan] = useState('');

  const totalPemasukan = transaksi
    .filter((item) => item.tipe === 'pemasukan')
    .reduce((total, item) => total + item.nominal, 0);

  const totalPengeluaran = transaksi
    .filter((item) => item.tipe === 'pengeluaran')
    .reduce((total, item) => total + item.nominal, 0);

  const saldo = totalPemasukan - totalPengeluaran;

  function tambahTransaksi() {
    const angka = Number(nominal);

    if (!nominal.trim() || !Number.isFinite(angka) || angka <= 0) {
      Alert.alert('Nominal belum benar', 'Masukkan nominal lebih dari nol.');
      return;
    }

    if (!catatan.trim()) {
      Alert.alert('Catatan kosong', 'Masukkan catatan transaksi terlebih dahulu.');
      return;
    }

    const transaksiBaru = {
      id: Date.now().toString(),
      nama: catatan.trim(),
      kategori,
      nominal: angka,
      tipe,
      tanggal: new Date().toLocaleDateString('id-ID'),
    };

    setTransaksi((dataLama) => [transaksiBaru, ...dataLama]);
    setNominal('');
    setCatatan('');

    Alert.alert('Berhasil!', 'Transaksi berhasil ditambahkan.');
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

        <View style={styles.balanceCard}>
          <Text style={styles.cardLabel}>Total Saldo</Text>
          <Text style={styles.balance}>{formatRupiah(saldo)}</Text>
          <Text style={styles.balanceNote}>Saldo dari transaksi saat ini</Text>
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
          <Text style={styles.sectionTitle}>Tambah Transaksi</Text>

          <View style={styles.typeRow}>
            <Pressable
              style={[
                styles.typeButton,
                tipe === 'pemasukan' && styles.incomeSelected,
              ]}
              onPress={() => {
                setTipe('pemasukan');
                setKategori('Lainnya');
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
                setKategori('Makanan');
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
            {(tipe === 'pemasukan'
              ? ['Gaji', 'Uang saku', 'Lainnya']
              : ['Makanan', 'Transportasi', 'Belanja', 'Jajan', 'Lainnya']
            ).map((item) => (
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

          <Text style={styles.label}>Catatan</Text>
          <TextInput
            style={styles.input}
            placeholder="Contoh: Makan siang di warteg"
            value={catatan}
            onChangeText={setCatatan}
          />

          <Pressable style={styles.saveButton} onPress={tambahTransaksi}>
            <Text style={styles.saveButtonText}>Simpan Transaksi</Text>
          </Pressable>
        </View>

        <View style={styles.transactions}>
          <Text style={styles.sectionTitle}>Riwayat Transaksi</Text>

          {transaksi.map((item) => (
            <View key={item.id} style={styles.transactionRow}>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionName}>{item.nama}</Text>
                <Text style={styles.transactionDate}>
                  {item.kategori} • {item.tanggal}
                </Text>
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
            <Text style={styles.emptyText}>Belum ada transaksi.</Text>
          )}
        </View>

        <Text style={styles.footer}>DuwekKu • Catat uangmu.</Text>
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
});
