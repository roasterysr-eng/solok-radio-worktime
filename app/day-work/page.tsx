"use client";

import { useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const DW_RATE = 110000;

type DWPayment = {
  id: string;
  recipientName: string;
  date: string;
  amount: number;
  note: string;
  recordedBy: string;
  recordedByName: string;
  createdAt?: Timestamp;
};

function getTodayJakarta() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  const months = [
    "Januari", "Februari", "Maret", "April",
    "Mei", "Juni", "Juli", "Agustus",
    "September", "Oktober", "November", "Desember",
  ];

  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

export default function DayWorkPage() {
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("");

  const [recipientName, setRecipientName] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  const [currentMonth, setCurrentMonth] = useState("");

  const [records, setRecords] = useState<DWPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const totalPaid = records.reduce(
    (total, record) => total + record.amount,
    0
  );

  const monthlyRecords = records.filter(
    (record) => currentMonth && record.date.slice(0, 7) === currentMonth
  );

  const monthlyTotal = monthlyRecords.reduce(
    (total, record) => total + record.amount,
    0
  );

  async function loadRecords() {
    const result = await getDocs(
      query(
        collection(db, "dwPayments"),
        orderBy("createdAt", "desc")
      )
    );

    const data = result.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })) as DWPayment[];

    setRecords(data);
  }

  useEffect(() => {
    const today = getTodayJakarta();

    setDate(today);
    setCurrentMonth(today.slice(0, 7));

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "/";
        return;
      }

      try {
        setUserId(user.uid);

        const profile = await getDoc(doc(db, "users", user.uid));

        if (!profile.exists()) {
          setError("Profil pengguna tidak ditemukan.");
          setLoading(false);
          return;
        }

        setUserName(profile.data().name || "Pengguna");
        setRole(profile.data().role || "member");

        await loadRecords();
      } catch (err) {
        console.error(err);
        setError("Gagal memuat riwayat pembayaran DW.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!recipientName.trim()) {
      setError("Nama penerima DW wajib diisi.");
      return;
    }

    if (!date) {
      setError("Tanggal pembayaran wajib diisi.");
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, "dwPayments"), {
        recipientName: recipientName.trim(),
        date,
        amount: DW_RATE,
        note: note.trim(),
        recordedBy: userId,
        recordedByName: userName,
        createdAt: serverTimestamp(),
      });

      setMessage("Pembayaran DW berhasil dicatat.");
      setRecipientName("");
      setNote("");

      await loadRecords();
    } catch (err) {
      console.error(err);
      setError(
        "Gagal menyimpan pembayaran. Periksa aturan Firestore."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#191c1b] text-[#f3f1eb]">
        Memuat data DW...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#191c1b] text-[#f3f1eb]">
      <div className="mx-auto max-w-5xl p-5 md:p-10">

        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.3em] text-[#b99a7b]">
              SOLOK RADJO / WORKTIME
            </p>
            <h1 className="mt-3 text-2xl font-semibold">
              DW & Kas Keluar
            </h1>
            <p className="mt-1 text-sm text-[#a6aaa7]">
              Pencatatan pembayaran Day Work
            </p>
          </div>

          <a
            href="/dashboard"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/10"
          >
            ← Dashboard
          </a>
        </header>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#222927] p-5">
            <p className="text-xs tracking-wider text-[#a6aaa7]">
              TARIF PER DW
            </p>
            <p className="mt-2 text-2xl font-semibold text-[#d2a982]">
              {formatRupiah(DW_RATE)}
            </p>
            <p className="mt-1 text-xs text-[#a6aaa7]">
              Per satu kali penugasan
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#222927] p-5">
            <p className="text-xs tracking-wider text-[#a6aaa7]">
              TOTAL DW BULAN INI
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatRupiah(monthlyTotal)}
            </p>
            <p className="mt-1 text-xs text-[#a6aaa7]">
              {monthlyRecords.length} kali pembayaran
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#222927] p-6">
          <p className="text-xs tracking-[0.2em] text-[#b99a7b]">
            TRANSAKSI KAS
          </p>

          <h2 className="mt-2 text-xl font-semibold">
            Catat Pembayaran DW
          </h2>

          <p className="mt-1 text-sm text-[#a6aaa7]">
            Dicatat oleh {userName} ·{" "}
            {role === "leader" ? "Team Leader" : "Team Member"}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm text-[#c7c9c5]">
                Nama penerima DW
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Masukkan nama penerima"
                required
                className="w-full rounded-xl border border-white/10 bg-[#191c1b] p-3 text-white outline-none focus:border-[#b99a7b]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#c7c9c5]">
                Tanggal pembayaran
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-[#191c1b] p-3 text-white outline-none focus:border-[#b99a7b]"
              />
            </div>

            <div className="rounded-xl border border-[#8a6243]/30 bg-[#2b261f] p-4">
              <p className="text-xs tracking-wider text-[#b99a7b]">
                NOMINAL PENGELUARAN KAS
              </p>
              <p className="mt-2 text-3xl font-semibold">
                {formatRupiah(DW_RATE)}
              </p>
              <p className="mt-1 text-xs text-[#a6aaa7]">
                Nominal otomatis, satu kali pembayaran DW.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#c7c9c5]">
                Keterangan
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Contoh: Pembayaran DW shift siang."
                className="w-full rounded-xl border border-white/10 bg-[#191c1b] p-3 text-white outline-none focus:border-[#b99a7b]"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-lg bg-green-500/10 p-3 text-sm text-green-400">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving || !recipientName.trim() || !date}
              className="w-full rounded-xl bg-[#8a6243] px-5 py-3 font-semibold text-white transition hover:bg-[#a77b50] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Catat Pengeluaran DW"}
            </button>
          </form>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.25em] text-[#b99a7b]">
                TRANSACTION HISTORY
              </p>
              <h2 className="mt-2 text-xl font-semibold">
                Riwayat Pembayaran DW
              </h2>
            </div>

            <div className="text-right">
              <p className="text-xs text-[#a6aaa7]">
                Total seluruh pembayaran
              </p>
              <p className="mt-1 font-semibold text-[#d2a982]">
                {formatRupiah(totalPaid)}
              </p>
            </div>
          </div>

          {records.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#222927] p-6 text-center text-sm text-[#a6aaa7]">
              Belum ada pembayaran DW yang dicatat.
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <article
                  key={record.id}
                  className="rounded-xl border border-white/10 bg-[#222927] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {record.recipientName}
                      </h3>
                      <p className="mt-1 text-sm text-[#a6aaa7]">
                        {formatDate(record.date)}
                      </p>
                    </div>

                    <span className="rounded-full bg-[#3a2d22] px-3 py-1 text-xs text-[#d2a982]">
                      DW PAID
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#a6aaa7]">
                        Pengeluaran kas
                      </p>
                      <p className="mt-1 text-lg font-semibold text-[#d2a982]">
                        {formatRupiah(record.amount)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-[#a6aaa7]">
                        Dicatat oleh
                      </p>
                      <p className="mt-1 text-sm">
                        {record.recordedByName}
                      </p>
                    </div>
                  </div>

                  {record.note && (
                    <p className="mt-4 border-t border-white/10 pt-3 text-sm text-[#a6aaa7]">
                      {record.note}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 border-t border-white/10 pt-5 text-center">
          <p className="text-xs tracking-wider text-[#777f7a]">
            SOLOK RADJO WORKTIME · INTERNAL SYSTEM
          </p>
        </footer>
      </div>
    </main>
  );
}