"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Employee = {
  uid: string;
  name: string;
};

type Attendance = {
  checkInAt?: Timestamp;
  checkOutAt?: Timestamp;
};

type Shift = "Pagi" | "Siang" | "Full Time" | "Libur" | "DW";

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

function formatTime(timestamp?: Timestamp) {
  if (!timestamp) return "--:--";

  return timestamp.toDate().toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getShiftTime(shift?: Shift) {
  switch (shift) {
    case "Pagi":
      return "08.00–17.00";
    case "Siang":
      return "12.00–21.00";
    case "Full Time":
      return "08.00–21.00";
    case "Libur":
      return "Hari libur";
    case "DW":
      return "Day Work";
    default:
      return "Belum diatur";
  }
}

export default function DashboardPage() {
  const [nama, setNama] = useState("");
  const [role, setRole] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [teamShifts, setTeamShifts] = useState<Record<string, Shift>>({});
  const [myShift, setMyShift] = useState<Shift | "">("");
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [today, setToday] = useState("");
  const [todayLabel, setTodayLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const todayDate = getTodayJakarta();

    setToday(todayDate);
    setTodayLabel(
      new Date(`${todayDate}T12:00:00+07:00`).toLocaleDateString("id-ID", {
        timeZone: "Asia/Jakarta",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "/";
        return;
      }

      try {
        setError("");

        // 1. Ambil profil pengguna
        const profileRef = doc(db, "users", user.uid);
        const profile = await getDoc(profileRef);

        if (!profile.exists()) {
          throw new Error("Profil pengguna tidak ditemukan.");
        }

        const userName = profile.data().name || "Pengguna";
        const userRole = profile.data().role || "member";

        setNama(userName);
        setRole(userRole);

        // 2. Ambil jadwal hari ini
        let shifts: Record<string, Shift> = {};

        try {
          const scheduleResult = await getDoc(
            doc(db, "schedules", todayDate)
          );

          if (scheduleResult.exists()) {
            shifts = scheduleResult.data().shifts || {};
          }
        } catch (err) {
          console.error("Gagal membaca jadwal:", err);
          throw new Error("Gagal membaca jadwal kerja.");
        }

        setTeamShifts(shifts);
        setMyShift(shifts[user.uid] || "");

        // 3. Ambil absensi hari ini
        try {
          const attendanceResult = await getDoc(
            doc(db, "attendance", `${todayDate}_${user.uid}`)
          );

          setAttendance(
            attendanceResult.exists()
              ? (attendanceResult.data() as Attendance)
              : null
          );
        } catch (err) {
          console.error("Gagal membaca absensi:", err);
          throw new Error("Gagal membaca data kehadiran.");
        }

        // 4. Ambil daftar anggota tim
        try {
          const usersResult = await getDocs(collection(db, "users"));

          const team = usersResult.docs.map((item) => ({
            uid: item.id,
            name: item.data().name || "Karyawan",
          }));

          setEmployees(team);
        } catch (err) {
          console.error("Gagal membaca anggota tim:", err);
          throw new Error("Gagal membaca daftar anggota tim.");
        }
      } catch (err) {
        console.error("DASHBOARD ERROR:", err);

        const firebaseError = err as {
          code?: string;
          message?: string;
        };

        setError(
          `${firebaseError.message || "Gagal memuat dashboard."}${
            firebaseError.code ? ` (${firebaseError.code})` : ""
          }`
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function handleLogout() {
    await signOut(auth);
    window.location.href = "/";
  }

  if (loading || !today) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#191c1b] text-[#f3f1eb]">
        Memuat dashboard...
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#191c1b] p-8 text-white">
        <h1 className="text-xl font-bold">Terjadi masalah</h1>
        <p className="mt-3 text-red-400">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-5 rounded-lg bg-[#8a6243] px-5 py-3"
        >
          Coba lagi
        </button>
      </main>
    );
  }

  const leader = role === "leader";
  const hasCheckedIn = Boolean(attendance?.checkInAt);
  const hasCheckedOut = Boolean(attendance?.checkOutAt);

  let attendanceStatus = "Belum Absen";
  let attendanceDescription = "Belum melakukan absensi masuk hari ini.";

  if (hasCheckedIn && !hasCheckedOut) {
    attendanceStatus = "Sedang Bekerja";
    attendanceDescription = "Absensi masuk sudah tercatat.";
  }

  if (hasCheckedIn && hasCheckedOut) {
    attendanceStatus = "Selesai Bekerja";
    attendanceDescription = "Absensi masuk dan pulang sudah tercatat.";
  }

  return (
    <main className="min-h-screen bg-[#191c1b] text-[#f3f1eb]">
      <div className="mx-auto max-w-6xl p-5 md:p-10">

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.3em] text-[#b99a7b]">
              SOLOK RADJO / WORKTIME
            </p>
            <h1 className="mt-3 text-2xl font-semibold">Dashboard</h1>
            <p className="mt-1 text-sm text-[#a6aaa7]">{todayLabel}</p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-[#c7c9c5] transition hover:bg-white/10"
          >
            Keluar
          </button>
        </header>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#222927] p-6">
          <p className="text-xs tracking-[0.2em] text-[#b99a7b]">
            SELAMAT DATANG
          </p>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">{nama}</h2>
              <p className="mt-1 text-xs uppercase tracking-wider text-[#a6aaa7]">
                {leader ? "Team Leader" : "Team Member"}
              </p>
            </div>

            <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#c7c9c5]">
              {leader ? "LEADER" : "MEMBER"}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#222927] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.2em] text-[#b99a7b]">
                STATUS KEHADIRAN
              </p>
              <h2 className="mt-3 text-xl font-semibold">
                {attendanceStatus}
              </h2>
              <p className="mt-1 text-sm text-[#a6aaa7]">
                {attendanceDescription}
              </p>
            </div>

            <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-[#c7c9c5]">
              {myShift || "Jadwal belum diatur"}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-5">
            <div>
              <p className="text-xs text-[#a6aaa7]">Jam masuk</p>
              <p className="mt-2 text-xl font-semibold">
                {formatTime(attendance?.checkInAt)}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#a6aaa7]">Jam pulang</p>
              <p className="mt-2 text-xl font-semibold">
                {formatTime(attendance?.checkOutAt)}
              </p>
            </div>
          </div>

          <a
            href="/attendance"
            className="mt-6 inline-flex text-sm font-medium text-[#d2a982] hover:text-white"
          >
            Buka absensi →
          </a>
        </section>

        <section className="mt-8">
          <div className="mb-4">
            <p className="text-xs tracking-[0.25em] text-[#b99a7b]">
              TEAM OVERVIEW
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Jadwal Tim Hari Ini
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {employees.map((employee) => {
              const shift = teamShifts[employee.uid];

              return (
                <div
                  key={employee.uid}
                  className="rounded-xl border border-white/10 bg-[#222927] p-5"
                >
                  <p className="text-xs text-[#a6aaa7]">Anggota tim</p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {employee.name}
                  </h3>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-sm text-[#d2a982]">
                      {shift || "Belum diatur"}
                    </span>
                    <span className="text-xs text-[#a6aaa7]">
                      {getShiftTime(shift)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4">
            <p className="text-xs tracking-[0.25em] text-[#b99a7b]">
              WORKSPACE
            </p>
            <h2 className="mt-2 text-xl font-semibold">Aktivitas Kerja</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <a
              href="/attendance"
              className="group rounded-xl border border-white/10 bg-[#222927] p-5 transition hover:border-[#b99a7b]/50 hover:bg-[#29312e]"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">◷</span>
                <span className="text-xs text-[#b99a7b]">BUKA →</span>
              </div>
              <h3 className="mt-4 font-semibold">Kehadiran</h3>
              <p className="mt-1 text-xs text-[#a6aaa7]">
                Absensi masuk dan pulang.
              </p>
              <p className="mt-5 text-sm font-medium text-[#d2a982]">
                Buka absensi →
              </p>
            </a>

            <a
              href="/schedule"
              className="group rounded-xl border border-white/10 bg-[#222927] p-5 transition hover:border-[#b99a7b]/50 hover:bg-[#29312e]"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">▦</span>
                <span className="text-xs text-[#b99a7b]">BUKA →</span>
              </div>
              <h3 className="mt-4 font-semibold">Jadwal Kerja</h3>
              <p className="mt-1 text-xs text-[#a6aaa7]">
                Atur dan lihat jadwal kerja tim.
              </p>
              <p className="mt-5 text-sm font-medium text-[#d2a982]">
                Buka jadwal →
              </p>
            </a>

            <a
              href="/history"
              className="group rounded-xl border border-white/10 bg-[#222927] p-5 transition hover:border-[#b99a7b]/50 hover:bg-[#29312e]"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">◴</span>
                <span className="text-xs text-[#b99a7b]">BUKA →</span>
              </div>
              <h3 className="mt-4 font-semibold">Riwayat Kehadiran</h3>
              <p className="mt-1 text-xs text-[#a6aaa7]">
                Lihat catatan absensi masuk dan pulang.
              </p>
              <p className="mt-5 text-sm font-medium text-[#d2a982]">
                Buka riwayat →
              </p>
            </a>

            <a
              href="/overtime"
              className="group rounded-xl border border-white/10 bg-[#222927] p-5 transition hover:border-[#b99a7b]/50 hover:bg-[#29312e]"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">◷</span>
                <span className="text-xs text-[#b99a7b]">BUKA →</span>
              </div>
              <h3 className="mt-4 font-semibold">Lembur</h3>
              <p className="mt-1 text-xs text-[#a6aaa7]">
                Pengajuan dan persetujuan jam lembur.
              </p>
              <p className="mt-5 text-sm font-medium text-[#d2a982]">
                Buka lembur →
              </p>
            </a>

            <a
              href="/day-work"
              className="group rounded-xl border border-white/10 bg-[#222927] p-5 transition hover:border-[#b99a7b]/50 hover:bg-[#29312e]"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">▤</span>
                <span className="text-xs text-[#b99a7b]">BUKA →</span>
              </div>
              <h3 className="mt-4 font-semibold">Day Work</h3>
              <p className="mt-1 text-xs text-[#a6aaa7]">
                Pencatatan kerja pada hari libur.
              </p>
              <p className="mt-5 text-sm font-medium text-[#d2a982]">
                Buka Day Work →
              </p>
            </a>

            <a
              href="/report"
              className="group rounded-xl border border-[#b99a7b]/40 bg-gradient-to-br from-[#302a24] to-[#222927] p-5 transition hover:border-[#d2a982] hover:bg-[#29312e]"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">▥</span>
                <span className="text-xs text-[#b99a7b]">BUKA →</span>
              </div>
              <h3 className="mt-4 font-semibold">Rekap Bulanan</h3>
              <p className="mt-1 text-xs text-[#a6aaa7]">
                Ringkasan absensi, keterlambatan, jam kerja, dan lembur.
              </p>
              <p className="mt-5 text-sm font-medium text-[#d2a982]">
                Buka rekap →
              </p>
            </a>
          </div>
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