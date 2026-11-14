"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Attendance = {
  id: string;
  userId: string;
  name: string;
  date: string;
  checkInAt?: Timestamp;
  checkOutAt?: Timestamp;
};

function formatDate(date: string) {
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(timestamp?: Timestamp) {
  if (!timestamp) return "--:--";

  return timestamp.toDate().toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getDuration(start?: Timestamp, end?: Timestamp) {
  if (!start || !end) return "Belum selesai";

  const minutes = Math.max(
    0,
    Math.floor((end.toMillis() - start.toMillis()) / 60000)
  );

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours} jam ${remainingMinutes} menit`;
}

export default function HistoryPage() {
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "/";
        return;
      }

      try {
        setLoading(true);

        const profile = await getDocs(
          query(collection(db, "users"), where("__name__", "==", user.uid))
        );

        if (profile.empty) {
          setError("Profil pengguna tidak ditemukan.");
          return;
        }

        const role = profile.docs[0].data().role;
        const leader = role === "leader";
        setIsLeader(leader);

        const attendanceQuery = leader
          ? collection(db, "attendance")
          : query(
              collection(db, "attendance"),
              where("userId", "==", user.uid)
            );

        const result = await getDocs(attendanceQuery);

        const data = result.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as Attendance[];

        data.sort((a, b) => b.date.localeCompare(a.date));

        setRecords(data);
      } catch (err) {
        console.error(err);
        setError("Gagal memuat riwayat kehadiran.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

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
            SOL0K RADJO / WORKTIME
          </p>

          <h1 className="mt-3 text-3xl font-semibold">
            Riwayat Kehadiran
          </h1>

          <p className="mt-2 text-sm text-[#a6aaa7]">
            Catatan absensi masuk dan pulang karyawan.
          </p>
        </header>

        <section className="mt-8 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-[#222927] p-5">
            <p className="text-xs text-[#a6aaa7]">Total Catatan</p>
            <p className="mt-2 text-3xl font-semibold">{records.length}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#222927] p-5">
            <p className="text-xs text-[#a6aaa7]">Akses</p>
            <p className="mt-2 text-lg font-semibold">
              {isLeader ? "Team Leader" : "Personal"}
            </p>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Catatan Absensi</h2>
            <span className="text-xs text-[#a6aaa7]">
              Terbaru di atas
            </span>
          </div>

          {loading ? (
            <p className="py-10 text-center text-[#a6aaa7]">
              Memuat riwayat...
            </p>
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-sm text-red-300">
              {error}
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#222927] p-8 text-center">
              <p className="text-lg font-medium">Belum Ada Riwayat</p>
              <p className="mt-2 text-sm text-[#a6aaa7]">
                Data absensi akan muncul setelah karyawan melakukan absen.
              </p>
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
                      <p className="text-sm font-semibold">
                        {record.name || "Karyawan"}
                      </p>
                      <p className="mt-1 text-xs text-[#a6aaa7]">
                        {formatDate(record.date)}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs ${
                        record.checkOutAt
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {record.checkOutAt
                        ? "Selesai"
                        : record.checkInAt
                        ? "Belum Absen Pulang"
                        : "Belum Absen"}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-[#a6aaa7]">Jam Masuk</p>
                      <p className="mt-1 text-xl font-semibold">
                        {formatTime(record.checkInAt)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[#a6aaa7]">Jam Pulang</p>
                      <p className="mt-1 text-xl font-semibold">
                        {formatTime(record.checkOutAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-3">
                    <p className="text-xs text-[#a6aaa7]">
                      Rentang waktu
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {getDuration(record.checkInAt, record.checkOutAt)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}