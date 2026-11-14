"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Employee = {
  id: string;
  name: string;
  role: string;
};

type AttendanceRecord = {
  id: string;
  userId: string;
  name: string;
  date: string;
  checkInAt?: Timestamp;
  checkOutAt?: Timestamp;
};

type ScheduleRecord = {
  id: string;
  date: string;
  shifts: Record<string, string>;
};

type OvertimeRecord = {
  id: string;
  userId: string;
  name: string;
  date: string;
  durationMinutes: number;
  status: string;
};

type EmployeeSummary = {
  employee: Employee;
  present: number;
  absent: number;
  off: number;
  late: number;
  lateMinutes: number;
  incomplete: number;
  workMinutes: number;
  overtimeMinutes: number;
  days: {
    date: string;
    shift: string;
    checkIn: string;
    checkOut: string;
    duration: number;
    lateMinutes: number;
    status: string;
  }[];
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

function getJakartaMonth() {
  return getTodayJakarta().slice(0, 7);
}

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const remaining = safeMinutes % 60;

  return `${hours} jam ${remaining} menit`;
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");

  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

function formatTime(timestamp?: Timestamp) {
  if (!timestamp) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp.toDate());
}

function getDateList(month: string) {
  if (!month) return [];

  const [year, monthNumber] = month.split("-").map(Number);
  const totalDays = new Date(year, monthNumber, 0).getDate();

  return Array.from({ length: totalDays }, (_, index) => {
    return `${year}-${String(monthNumber).padStart(2, "0")}-${String(
      index + 1
    ).padStart(2, "0")}`;
  });
}

function getShiftStart(shift: string) {
  if (shift === "Pagi") return 8 * 60;
  if (shift === "Siang") return 12 * 60;
  if (shift === "Full Time") return 8 * 60;

  return null;
}

function calculateLate(
  timestamp: Timestamp | undefined,
  shift: string
) {
  if (!timestamp) return 0;

  const start = getShiftStart(shift);
  if (start === null) return 0;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(timestamp.toDate());

  const hour = Number(
    parts.find((p) => p.type === "hour")?.value
  );

  const minute = Number(
    parts.find((p) => p.type === "minute")?.value
  );

  const actual = hour * 60 + minute;
  const allowed = start + 15;

  return Math.max(0, actual - allowed);
}

function getDuration(
  checkIn?: Timestamp,
  checkOut?: Timestamp
) {
  if (!checkIn || !checkOut) return 0;

  return Math.max(
    0,
    Math.floor(
      (checkOut.toMillis() - checkIn.toMillis()) / 60000
    )
  );
}

function getStatusStyle(status: string) {
  switch (status) {
    case "Hadir":
      return "text-emerald-400";
    case "Tidak hadir":
      return "text-red-400";
    case "Libur":
      return "text-blue-300";
    case "Belum berlangsung":
      return "text-[#a6aaa7]";
    case "Belum absen":
    case "Belum absen pulang":
      return "text-yellow-300";
    default:
      return "text-[#a6aaa7]";
  }
}

export default function ReportPage() {
  const [role, setRole] = useState("");
  const [month, setMonth] = useState("");
  const [today, setToday] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("all");

  useEffect(() => {
    setToday(getTodayJakarta());
    setMonth(getJakartaMonth());

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "/";
        return;
      }

      try {
        const profile = await getDoc(doc(db, "users", user.uid));

        if (!profile.exists()) {
          setError("Profil pengguna tidak ditemukan.");
          setLoading(false);
          return;
        }

        const currentRole = profile.data().role || "member";
        setRole(currentRole);

        const userSnapshot = await getDocs(collection(db, "users"));

        const employeeData = userSnapshot.docs.map((item) => ({
          id: item.id,
          name: item.data().name || "Karyawan",
          role: item.data().role || "member",
        })) as Employee[];

        const visibleEmployees =
          currentRole === "leader"
            ? employeeData
            : employeeData.filter((item) => item.id === user.uid);

        setEmployees(visibleEmployees);

        const attendanceQuery =
          currentRole === "leader"
            ? collection(db, "attendance")
            : query(
                collection(db, "attendance"),
                where("userId", "==", user.uid)
              );

        const overtimeQuery =
          currentRole === "leader"
            ? collection(db, "overtime")
            : query(
                collection(db, "overtime"),
                where("userId", "==", user.uid)
              );

        const [
          attendanceSnapshot,
          scheduleSnapshot,
          overtimeSnapshot,
        ] = await Promise.all([
          getDocs(attendanceQuery),
          getDocs(collection(db, "schedules")),
          getDocs(overtimeQuery),
        ]);

        setAttendance(
          attendanceSnapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as AttendanceRecord[]
        );

        setSchedules(
          scheduleSnapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as ScheduleRecord[]
        );

        setOvertimes(
          overtimeSnapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as OvertimeRecord[]
        );
      } catch (err) {
        console.error("Report error:", err);
        setError(
          "Gagal memuat laporan. Periksa koneksi dan izin Firestore."
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const dates = month ? getDateList(month) : [];

  const summaries: EmployeeSummary[] = employees.map((employee) => {
    let present = 0;
    let absent = 0;
    let off = 0;
    let late = 0;
    let lateMinutes = 0;
    let incomplete = 0;
    let workMinutes = 0;

    const employeeAttendance = attendance.filter(
      (item) =>
        item.userId === employee.id &&
        item.date.startsWith(month)
    );

    const employeeSchedules = schedules.filter(
      (item) => item.date.startsWith(month)
    );

    const days = dates.map((date) => {
      const record = employeeAttendance.find(
        (item) => item.date === date
      );

      const schedule = employeeSchedules.find(
        (item) => item.date === date
      );

      const shift =
        schedule?.shifts?.[employee.id] || "Belum diatur";

      const checkIn = record?.checkInAt;
      const checkOut = record?.checkOutAt;
      const duration = getDuration(checkIn, checkOut);

      const lateValue = calculateLate(checkIn, shift);

      let status = "Belum diatur";

      if (shift === "Libur") {
        status = "Libur";
        off++;
      } else if (shift === "Belum diatur") {
        status = "Belum diatur";
      } else if (date > today) {
        status = "Belum berlangsung";
      } else if (!record && date === today) {
        status = "Belum absen";
      } else if (!record) {
        status = "Tidak hadir";
        absent++;
      } else if (checkIn && !checkOut) {
        status = "Belum absen pulang";
        present++;
        incomplete++;
      } else if (checkIn && checkOut) {
        status = "Hadir";
        present++;
      } else {
        status = "Data absensi tidak lengkap";
      }

      if (lateValue > 0) {
        late++;
        lateMinutes += lateValue;
      }

      workMinutes += duration;

      return {
        date,
        shift,
        checkIn: formatTime(checkIn),
        checkOut: formatTime(checkOut),
        duration,
        lateMinutes: lateValue,
        status,
      };
    });

    const overtimeMinutes = overtimes
      .filter(
        (item) =>
          item.userId === employee.id &&
          item.date.startsWith(month) &&
          item.status === "approved"
      )
      .reduce(
        (total, item) => total + (item.durationMinutes || 0),
        0
      );

    return {
      employee,
      present,
      absent,
      off,
      late,
      lateMinutes,
      incomplete,
      workMinutes,
      overtimeMinutes,
      days,
    };
  });

  const visibleSummaries =
    selectedEmployee === "all"
      ? summaries
      : summaries.filter(
          (item) => item.employee.id === selectedEmployee
        );

  const totalPresent = visibleSummaries.reduce(
    (total, item) => total + item.present,
    0
  );

  const totalAbsent = visibleSummaries.reduce(
    (total, item) => total + item.absent,
    0
  );

  const totalLate = visibleSummaries.reduce(
    (total, item) => total + item.late,
    0
  );

  const totalWorkMinutes = visibleSummaries.reduce(
    (total, item) => total + item.workMinutes,
    0
  );

  const totalOvertime = visibleSummaries.reduce(
    (total, item) => total + item.overtimeMinutes,
    0
  );

  if (loading || !today) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#191c1b] text-white">
        Memuat laporan bulanan...
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#191c1b] p-6 text-white">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-400/20 bg-[#222927] p-6">
          <h1 className="text-xl font-semibold">
            Laporan tidak dapat dimuat
          </h1>
          <p className="mt-3 text-sm text-red-400">{error}</p>
          <a
            href="/dashboard"
            className="mt-6 inline-block text-sm text-[#d2a982]"
          >
            ← Kembali ke Dashboard
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#191c1b] text-[#f3f1eb]">
      <div className="mx-auto max-w-6xl p-5 md:p-10">

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.3em] text-[#b99a7b]">
              SOLOK RADJO / WORKTIME
            </p>
            <h1 className="mt-3 text-2xl font-semibold">
              Rekap Bulanan
            </h1>
            <p className="mt-1 text-sm text-[#a6aaa7]">
              Laporan kehadiran dan jam kerja
            </p>
          </div>

          <a
            href="/dashboard"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/10"
          >
            ← Dashboard
          </a>
        </header>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#222927] p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-[#a6aaa7]">
                Pilih bulan laporan
              </label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#191c1b] p-3 text-white outline-none focus:border-[#b99a7b]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#a6aaa7]">
                Karyawan
              </label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#191c1b] p-3 text-white outline-none focus:border-[#b99a7b]"
              >
                {role === "leader" && (
                  <option value="all">Semua karyawan</option>
                )}

                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: "Total kehadiran", value: `${totalPresent} hari` },
            { label: "Tidak hadir", value: `${totalAbsent} hari` },
            { label: "Keterlambatan", value: `${totalLate} kali` },
            {
              label: "Total durasi kerja",
              value: formatMinutes(totalWorkMinutes),
            },
            {
              label: "Lembur disetujui",
              value: formatMinutes(totalOvertime),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-[#222927] p-4"
            >
              <p className="text-xs text-[#a6aaa7]">{item.label}</p>
              <p className="mt-2 text-lg font-semibold text-[#d2a982]">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-8 space-y-6">
          {visibleSummaries.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#222927] p-8 text-center">
              <p className="text-[#a6aaa7]">
                Tidak ada data karyawan untuk ditampilkan.
              </p>
            </div>
          )}

          {visibleSummaries.map((summary) => (
            <article
              key={summary.employee.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-[#222927]"
            >
              <div className="border-b border-white/10 p-5">
                <h2 className="text-xl font-semibold">
                  {summary.employee.name}
                </h2>
                <p className="mt-1 text-sm text-[#a6aaa7]">
                  {summary.employee.role === "leader"
                    ? "Team Leader"
                    : "Team Member"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-[#a6aaa7]">Hadir</p>
                  <p className="mt-1 text-lg font-semibold">
                    {summary.present} hari
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#a6aaa7]">Tidak hadir</p>
                  <p className="mt-1 text-lg font-semibold">
                    {summary.absent} hari
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#a6aaa7]">Libur</p>
                  <p className="mt-1 text-lg font-semibold">
                    {summary.off} hari
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#a6aaa7]">Terlambat</p>
                  <p className="mt-1 text-lg font-semibold text-[#d2a982]">
                    {summary.late} kali
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#a6aaa7]">Total jam kerja</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatMinutes(summary.workMinutes)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#a6aaa7]">Total terlambat</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatMinutes(summary.lateMinutes)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#a6aaa7]">
                    Lembur disetujui
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatMinutes(summary.overtimeMinutes)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[#a6aaa7]">
                    Belum absen pulang
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {summary.incomplete} hari
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border-t border-white/10">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-[#191c1b] text-xs text-[#b99a7b]">
                    <tr>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Shift</th>
                      <th className="p-3">Masuk</th>
                      <th className="p-3">Pulang</th>
                      <th className="p-3">Durasi</th>
                      <th className="p-3">Terlambat</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {summary.days.map((day) => (
                      <tr
                        key={day.date}
                        className="border-t border-white/5"
                      >
                        <td className="whitespace-nowrap p-3">
                          {formatDate(day.date)}
                        </td>
                        <td className="p-3">{day.shift}</td>
                        <td className="p-3">{day.checkIn}</td>
                        <td className="p-3">{day.checkOut}</td>
                        <td className="whitespace-nowrap p-3">
                          {day.duration > 0
                            ? formatMinutes(day.duration)
                            : "-"}
                        </td>
                        <td className="p-3">
                          {day.lateMinutes > 0
                            ? `${day.lateMinutes} menit`
                            : "-"}
                        </td>
                        <td
                          className={`whitespace-nowrap p-3 font-medium ${getStatusStyle(
                            day.status
                          )}`}
                        >
                          {day.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#222927] p-5">
          <h2 className="font-semibold">
            Keterangan perhitungan
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-[#a6aaa7]">
            <li>• Durasi kerja dihitung dari check-in sampai check-out.</li>
            <li>• Waktu istirahat tidak dikurangi.</li>
            <li>• Toleransi keterlambatan adalah 15 menit.</li>
            <li>• Lembur hanya dihitung jika berstatus approved.</li>
            <li>• Day Work tidak dimasukkan ke rekap absensi.</li>
            <li>• Hari tanpa jadwal ditampilkan sebagai Belum diatur.</li>
            <li>• Jadwal masa depan ditampilkan sebagai Belum berlangsung.</li>
            <li>• Hari ini tanpa absensi ditampilkan sebagai Belum absen.</li>
          </ul>
        </section>

        <div className="mt-8 flex justify-end print:hidden">
          <button
            onClick={() => window.print()}
            className="rounded-xl bg-[#8a6243] px-6 py-3 font-semibold transition hover:bg-[#a77b50]"
          >
            Cetak / Simpan PDF
          </button>
        </div>

        <footer className="mt-12 border-t border-white/10 pt-5 text-center">
          <p className="text-xs tracking-wider text-[#777f7a]">
            SOLOK RADJO WORKTIME · INTERNAL SYSTEM
          </p>
        </footer>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: landscape;
            margin: 12mm;
          }

          body {
            background: white !important;
            color: black !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          main {
            min-height: auto !important;
            background: white !important;
            color: black !important;
          }

          main > div {
            max-width: none !important;
            padding: 0 !important;
          }

          article,
          section {
            break-inside: avoid;
          }

          article {
            border: 1px solid #ddd !important;
            background: white !important;
          }

          article > div {
            border-color: #ddd !important;
          }

          table {
            color: black !important;
          }

          thead {
            background: #eee !important;
          }

          th,
          td {
            color: black !important;
            border-color: #ddd !important;
          }

          button,
          a {
            display: none !important;
          }

          footer {
            color: #555 !important;
          }
        }
      `}</style>
    </main>
  );
}