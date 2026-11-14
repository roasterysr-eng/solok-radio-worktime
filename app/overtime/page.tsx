"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type OvertimeRecord = {
  id: string;
  userId: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  note: string;
  status: "pending" | "approved" | "rejected";
  createdAt?: Timestamp;
  reviewedByName?: string;
  reviewedAt?: Timestamp;
  reviewNote?: string;
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

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(year, month - 1, day, 5)));
}

function calculateDuration(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);

  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;

  if (endTotal <= startTotal) {
    endTotal += 24 * 60;
  }

  return endTotal - startTotal;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return `${hours} jam ${remaining} menit`;
}

function formatTimestamp(timestamp?: Timestamp) {
  if (!timestamp) return "-";

  return timestamp.toDate().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  if (status === "approved") return "Disetujui";
  if (status === "rejected") return "Ditolak";
  return "Menunggu Pemeriksaan";
}

export default function OvertimePage() {
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [isLeader, setIsLeader] = useState(false);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");

  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadRecords(userId: string, leader: boolean) {
    const attendanceQuery = leader
      ? collection(db, "overtime")
      : query(
          collection(db, "overtime"),
          where("userId", "==", userId)
        );

    const result = await getDocs(attendanceQuery);

    const data = result.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    })) as OvertimeRecord[];

    data.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;

      return (b.createdAt?.toMillis() || 0) -
        (a.createdAt?.toMillis() || 0);
    });

    setRecords(data);
  }

  useEffect(() => {
    setDate(getTodayJakarta());

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "/";
        return;
      }

      try {
        setLoading(true);

        const profile = await getDoc(doc(db, "users", user.uid));

        if (!profile.exists()) {
          setError("Profil pengguna tidak ditemukan.");
          return;
        }

        const userName = profile.data().name || "Pengguna";
        const leader = profile.data().role === "leader";

        setUid(user.uid);
        setName(userName);
        setIsLeader(leader);

        await loadRecords(user.uid, leader);
      } catch (err) {
        console.error(err);
        setError("Gagal memuat data lembur.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function submitOvertime(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!date || !startTime || !endTime || !note.trim()) {
      setError("Lengkapi semua data lembur.");
      return;
    }

    const durationMinutes = calculateDuration(startTime, endTime);

    if (durationMinutes <= 0 || durationMinutes > 24 * 60) {
      setError("Durasi lembur tidak valid.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      await addDoc(collection(db, "overtime"), {
        userId: uid,
        name,
        date,
        startTime,
        endTime,
        durationMinutes,
        note: note.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setStartTime("");
      setEndTime("");
      setNote("");

      await loadRecords(uid, isLeader);

      setMessage("Pengajuan lembur berhasil disimpan.");
    } catch (err) {
      console.error(err);
      setError("Gagal menyimpan lembur. Periksa koneksi dan Firestore Rules.");
    } finally {
      setSaving(false);
    }
  }

  async function reviewOvertime(
    record: OvertimeRecord,
    decision: "approved" | "rejected"
  ) {
    if (!isLeader) return;

    try {
      setError("");
      setMessage("");

      await updateDoc(doc(db, "overtime", record.id), {
        status: decision,
        reviewedBy: uid,
        reviewedByName: name,
        reviewedAt: serverTimestamp(),
        reviewNote: reviewNotes[record.id] || "",
      });

      await loadRecords(uid, isLeader);

      setMessage(
        decision === "approved"
          ? "Pengajuan lembur disetujui."
          : "Pengajuan lembur ditolak."
      );
    } catch (err) {
      console.error(err);
      setError("Gagal memproses pemeriksaan lembur.");
    }
  }

  const totalApproved = records
    .filter((record) => record.status === "approved")
    .reduce((total, record) => total + record.durationMinutes, 0);

  const totalPending = records.filter(
    (record) => record.status === "pending"
  ).length;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#191c1b] text-white">
        Memuat data lembur...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#191c1b] text-[#f3f1eb]">
      <div className="mx-auto max-w-5xl p-5 md:p-10">

        <a
          href="/dashboard"
          className="text-sm text-[#b99a7b] hover:text-white"
        >
          ← Kembali ke Dashboard
        </a>

        <header className="mt-8">
          <p className="text-xs tracking-[0.3em] text-[#b99a7b]">
            SOLOK RADJO / WORKTIME
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            Pencatatan Lembur
          </h1>
          <p className="mt-2 text-sm text-[#a6aaa7]">
            Catat, pantau, dan periksa jam kerja tambahan.
          </p>
        </header>

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {message}
          </div>
        )}

        <section className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-[#222927] p-5">
            <p className="text-xs text-[#a6aaa7]">
              Total Lembur Disetujui
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatDuration(totalApproved)}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#222927] p-5">
            <p className="text-xs text-[#a6aaa7]">
              Menunggu Pemeriksaan
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {totalPending}
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#222927] p-6">
          <p className="text-xs tracking-[0.2em] text-[#b99a7b]">
            FORM PENGAJUAN
          </p>

          <h2 className="mt-2 text-xl font-semibold">
            Catat Lembur Baru
          </h2>

          <p className="mt-1 text-sm text-[#a6aaa7]">
            Pengajuan akan menunggu pemeriksaan Team Leader.
          </p>

          <form onSubmit={submitOvertime} className="mt-6 space-y-5">

            <div>
              <label className="mb-2 block text-sm text-[#c7c9c5]">
                Nama Karyawan
              </label>
              <div className="rounded-lg border border-white/10 bg-[#191c1b] px-4 py-3 text-sm">
                {name}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#c7c9c5]">
                Tanggal Lembur
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full rounded-lg border border-white/10 bg-[#191c1b] px-4 py-3 text-sm text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm text-[#c7c9c5]">
                  Jam Mulai
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/10 bg-[#191c1b] px-3 py-3 text-sm text-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#c7c9c5]">
                  Jam Selesai
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/10 bg-[#191c1b] px-3 py-3 text-sm text-white"
                />
              </div>
            </div>

            {startTime && endTime && (
              <div className="rounded-lg border border-[#b99a7b]/20 bg-[#191c1b] p-4">
                <p className="text-xs text-[#a6aaa7]">
                  Durasi lembur otomatis
                </p>
                <p className="mt-1 text-lg font-semibold text-[#d2a982]">
                  {formatDuration(calculateDuration(startTime, endTime))}
                </p>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm text-[#c7c9c5]">
                Keterangan Lembur
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                rows={3}
                placeholder="Jelaskan pekerjaan yang dilakukan..."
                className="w-full rounded-lg border border-white/10 bg-[#191c1b] px-4 py-3 text-sm text-white placeholder:text-[#777f7a]"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#8a6243] px-5 py-3 font-medium text-white transition hover:bg-[#a07857] disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Kirim Pengajuan Lembur"}
            </button>

          </form>
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <p className="text-xs tracking-[0.2em] text-[#b99a7b]">
              OVERTIME RECORDS
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Riwayat Lembur
            </h2>
          </div>

          {records.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#222927] p-8 text-center">
              <p className="font-medium">Belum Ada Catatan Lembur</p>
              <p className="mt-2 text-sm text-[#a6aaa7]">
                Pengajuan lembur akan muncul di sini.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((record) => (
                <article
                  key={record.id}
                  className="rounded-xl border border-white/10 bg-[#222927] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{record.name}</h3>
                      <p className="mt-1 text-xs text-[#a6aaa7]">
                        {formatDate(record.date)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        record.status === "approved"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : record.status === "rejected"
                          ? "bg-red-500/10 text-red-300"
                          : "bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {statusLabel(record.status)}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-[#a6aaa7]">Mulai</p>
                      <p className="mt-1 font-semibold">
                        {record.startTime}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[#a6aaa7]">Selesai</p>
                      <p className="mt-1 font-semibold">
                        {record.endTime}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[#a6aaa7]">Durasi</p>
                      <p className="mt-1 font-semibold text-[#d2a982]">
                        {formatDuration(record.durationMinutes)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-4">
                    <p className="text-xs text-[#a6aaa7]">
                      Keterangan
                    </p>
                    <p className="mt-1 text-sm">{record.note}</p>
                  </div>

                  {record.status !== "pending" && (
                    <div className="mt-4 border-t border-white/10 pt-4 text-xs text-[#a6aaa7]">
                      <p>
                        Diperiksa oleh: {record.reviewedByName || "-"}
                      </p>
                      <p className="mt-1">
                        Waktu pemeriksaan: {formatTimestamp(record.reviewedAt)}
                      </p>
                      {record.reviewNote && (
                        <p className="mt-2">
                          Catatan pemeriksaan: {record.reviewNote}
                        </p>
                      )}
                    </div>
                  )}

                  {isLeader && record.status === "pending" && (
                    <div className="mt-5 border-t border-white/10 pt-4">
                      <label className="mb-2 block text-xs text-[#a6aaa7]">
                        Catatan pemeriksaan (opsional)
                      </label>

                      <textarea
                        rows={2}
                        value={reviewNotes[record.id] || ""}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({
                            ...prev,
                            [record.id]: e.target.value,
                          }))
                        }
                        placeholder="Tambahkan catatan jika diperlukan..."
                        className="w-full rounded-lg border border-white/10 bg-[#191c1b] px-3 py-3 text-sm text-white"
                      />

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <button
                          onClick={() =>
                            reviewOvertime(record, "approved")
                          }
                          className="rounded-lg bg-emerald-700 px-3 py-3 text-sm font-medium text-white hover:bg-emerald-600"
                        >
                          Setujui
                        </button>

                        <button
                          onClick={() =>
                            reviewOvertime(record, "rejected")
                          }
                          className="rounded-lg bg-red-900 px-3 py-3 text-sm font-medium text-white hover:bg-red-800"
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}