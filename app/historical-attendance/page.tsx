"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Employee = {
  uid: string;
  name: string;
  email: string;
  role: string;
};

type HistoryRow = {
  date: string;
  shift: "Pagi" | "Siang" | "Libur";
  overtimeMinutes: number;
};

const historyRows: HistoryRow[] = [
  { date: "2026-10-29", shift: "Siang", overtimeMinutes: 0 },
  { date: "2026-10-30", shift: "Pagi", overtimeMinutes: 398 },
  { date: "2026-10-31", shift: "Pagi", overtimeMinutes: 0 },
  { date: "2026-11-01", shift: "Pagi", overtimeMinutes: 420 },
  { date: "2026-11-02", shift: "Pagi", overtimeMinutes: 480 },
  { date: "2026-11-03", shift: "Pagi", overtimeMinutes: 300 },
  { date: "2026-11-04", shift: "Pagi", overtimeMinutes: 315 },
  { date: "2026-11-05", shift: "Pagi", overtimeMinutes: 0 },
  { date: "2026-11-06", shift: "Pagi", overtimeMinutes: 300 },
  { date: "2026-11-07", shift: "Pagi", overtimeMinutes: 180 },
  { date: "2026-11-08", shift: "Pagi", overtimeMinutes: 360 },
  { date: "2026-11-09", shift: "Pagi", overtimeMinutes: 360 },
  { date: "2026-11-10", shift: "Libur", overtimeMinutes: 0 },
  { date: "2026-11-11", shift: "Pagi", overtimeMinutes: 430 },
  { date: "2026-11-12", shift: "Siang", overtimeMinutes: 0 },
  { date: "2026-11-13", shift: "Pagi", overtimeMinutes: 0 },
];

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) return `${hours} jam`;
  return `${hours} jam ${remainingMinutes} menit`;
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function makeTimestamp(date: string, minutesAfterMidnight: number) {
  const base = new Date(`${date}T00:00:00+07:00`);
  return Timestamp.fromDate(
    new Date(base.getTime() + minutesAfterMidnight * 60_000)
  );
}

function formatClock(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function HistoricalAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [isLeader, setIsLeader] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const totalOvertime = historyRows.reduce(
    (total, row) => total + row.overtimeMinutes,
    0
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          setError("Silakan login terlebih dahulu.");
          setLoading(false);
          return;
        }

        const profileSnap = await getDoc(doc(db, "users", user.uid));

        if (!profileSnap.exists() || profileSnap.data().role !== "leader") {
          setError("Halaman ini hanya bisa diakses oleh Team Leader.");
          setLoading(false);
          return;
        }

        setIsLeader(true);

        const usersSnap = await getDocs(collection(db, "users"));

        const employeeList: Employee[] = usersSnap.docs.map((item) => {
          const data = item.data();

          return {
            uid: item.id,
            name: data.name || "Tanpa nama",
            email: data.email || "",
            role: data.role || "member",
          };
        });

        setEmployees(employeeList);

        const palito = employeeList.find((employee) =>
          employee.name.toLowerCase().includes("palito")
        );

        if (palito) {
          setSelectedEmployee(palito.uid);
        }
      } catch (err) {
        console.error(err);
        setError("Gagal memuat data pengguna.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function handleImport() {
    if (!selectedEmployee) {
      setError("Pilih karyawan terlebih dahulu.");
      return;
    }

    const employee = employees.find(
      (item) => item.uid === selectedEmployee
    );

    if (!employee) {
      setError("Data karyawan tidak ditemukan.");
      return;
    }

    const confirmed = window.confirm(
      `Impor histori absensi untuk ${employee.name} dari 29 Oktober sampai 13 November 2026?`
    );

    if (!confirmed) return;

    setImporting(true);
    setMessage("");
    setError("");

    let attendanceAdded = 0;
    let attendanceSkipped = 0;
    let overtimeAdded = 0;
    let overtimeSkipped = 0;
    let scheduleAdded = 0;

    try {
      // Ambil data lembur yang sudah ada agar tidak membuat duplikat.
      const overtimeSnap = await getDocs(collection(db, "overtime"));

      const existingOvertime = new Set(
        overtimeSnap.docs
          .filter(
            (item) =>
              item.data().userId === selectedEmployee
          )
          .map((item) => item.data().date)
      );

      for (const row of historyRows) {
        if (row.shift === "Libur") {
          continue;
        }

        const isMorning = row.shift === "Pagi";
        const shiftStart = isMorning ? 8 * 60 : 12 * 60;
        const shiftEnd = isMorning ? 17 * 60 : 21 * 60;

        // Simpan jadwal kerja.
        const scheduleRef = doc(db, "schedules", row.date);
        const scheduleSnap = await getDoc(scheduleRef);

        const oldSchedule = scheduleSnap.exists()
          ? scheduleSnap.data()
          : {};

        const oldShifts = oldSchedule.shifts || {};

        await setDoc(scheduleRef, {
          ...oldSchedule,
          date: row.date,
          shifts: {
            ...oldShifts,
            [selectedEmployee]: row.shift,
          },
          updatedBy: auth.currentUser!.uid,
          updatedByName: "Team Leader",
          updatedAt: serverTimestamp(),
        });

        scheduleAdded++;

        // Simpan histori kehadiran.
        const attendanceId = `${row.date}_${selectedEmployee}`;
        const attendanceRef = doc(db, "attendance", attendanceId);
        const attendanceSnap = await getDoc(attendanceRef);

        if (attendanceSnap.exists()) {
          attendanceSkipped++;
        } else {
          const checkInAt = makeTimestamp(row.date, shiftStart);
          const checkOutAt = makeTimestamp(
            row.date,
            shiftEnd + row.overtimeMinutes
          );

          await setDoc(attendanceRef, {
            userId: selectedEmployee,
            name: employee.name,
            date: row.date,
            checkInAt,
            checkOutAt,
            source: "manual_historical",
            historicalBy: auth.currentUser!.uid,
            historicalAt: serverTimestamp(),
          });

          attendanceAdded++;
        }

        // Simpan lembur yang tercatat.
        if (row.overtimeMinutes > 0) {
          if (existingOvertime.has(row.date)) {
            overtimeSkipped++;
          } else {
            const overtimeId = `historical_${selectedEmployee}_${row.date}`;

            const startTime = formatClock(shiftEnd);
            const endTime = formatClock(
              shiftEnd + row.overtimeMinutes
            );

            await setDoc(doc(db, "overtime", overtimeId), {
              userId: selectedEmployee,
              name: employee.name,
              date: row.date,
              startTime,
              endTime,
              durationMinutes: row.overtimeMinutes,
              note: "Impor histori lembur sebelum sistem absensi digunakan.",
              status: "approved",
              createdAt: serverTimestamp(),
              source: "manual_historical",
              historicalBy: auth.currentUser!.uid,
            });

            overtimeAdded++;
          }
        }
      }

      setMessage(
        `Impor selesai. Absensi baru: ${attendanceAdded}. Absensi dilewati: ${attendanceSkipped}. Lembur baru: ${overtimeAdded}. Lembur dilewati: ${overtimeSkipped}. Jadwal diperbarui: ${scheduleAdded}.`
      );
    } catch (err) {
      console.error(err);
      setError(
        "Impor terhenti karena terjadi kesalahan. Sebagian data mungkin sudah tersimpan. Periksa database sebelum mencoba lagi."
      );
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return <main className="p-8">Memuat halaman...</main>;
  }

  if (!isLeader) {
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold">Histori Absen</h1>
        <p className="mt-3 text-red-600">{error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Histori Absen</h1>
        <p className="mt-1 text-sm text-gray-500">
          Impor data absensi lama ke sistem Solok Radjo Worktime.
        </p>
      </div>

      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Pilih Karyawan</h2>

        <select
          value={selectedEmployee}
          onChange={(event) => setSelectedEmployee(event.target.value)}
          className="mt-3 w-full rounded-lg border p-3"
        >
          <option value="">Pilih karyawan</option>
          {employees.map((employee) => (
            <option key={employee.uid} value={employee.uid}>
              {employee.name} ({employee.role})
            </option>
          ))}
        </select>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">Periode</p>
          <p className="mt-1 font-bold">16 hari</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">Hari kerja</p>
          <p className="mt-1 font-bold">15 hari</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">Hari libur</p>
          <p className="mt-1 font-bold">1 hari</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-500">Total lembur</p>
          <p className="mt-1 font-bold">
            {formatDuration(totalOvertime)}
          </p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border">
        <div className="border-b p-4">
          <h2 className="font-semibold">Rincian Histori</h2>
        </div>

        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-3">Tanggal</th>
              <th className="p-3">Shift</th>
              <th className="p-3">Jam Masuk</th>
              <th className="p-3">Jam Pulang</th>
              <th className="p-3">Lembur</th>
            </tr>
          </thead>

          <tbody>
            {historyRows.map((row) => {
              const isMorning = row.shift === "Pagi";
              const shiftEnd = isMorning ? 17 * 60 : 21 * 60;

              return (
                <tr key={row.date} className="border-t">
                  <td className="p-3">{formatDate(row.date)}</td>
                  <td className="p-3">{row.shift}</td>
                  <td className="p-3">
                    {row.shift === "Libur"
                      ? "-"
                      : isMorning
                        ? "08:00"
                        : "12:00"}
                  </td>
                  <td className="p-3">
                    {row.shift === "Libur"
                      ? "-"
                      : formatClock(shiftEnd + row.overtimeMinutes)}
                  </td>
                  <td className="p-3">
                    {row.overtimeMinutes > 0
                      ? formatDuration(row.overtimeMinutes)
                      : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {message && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="font-semibold text-amber-900">
          Periksa sebelum impor
        </p>
        <p className="mt-1 text-sm text-amber-800">
          Pastikan karyawan dan seluruh tanggal sudah benar. Data yang
          sudah ada akan dilewati. Data histori ini tidak menggunakan
          validasi GPS karena merupakan catatan manual masa lalu.
        </p>
      </section>

      <button
        onClick={handleImport}
        disabled={importing || !selectedEmployee}
        className="w-full rounded-xl bg-black px-5 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {importing ? "Sedang mengimpor..." : "Import Histori Absen"}
      </button>
    </main>
  );
}