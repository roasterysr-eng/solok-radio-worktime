"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Employee = {
  uid: string;
  name: string;
};

type Shift = "Pagi" | "Siang" | "Full Time" | "Libur" | "DW";

type DaySchedule = Record<string, Shift>;

const shifts: Shift[] = [
  "Pagi",
  "Siang",
  "Full Time",
  "Libur",
  "DW",
];

const dayNames = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];

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

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getWeekDates(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const selected = new Date(year, month - 1, day);

  const monday = new Date(selected);
  const offset = (selected.getDay() + 6) % 7;

  monday.setDate(selected.getDate() - offset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return formatDate(date);
  });
}

function displayDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(
    "id-ID",
    {
      day: "numeric",
      month: "short",
    }
  );
}

export default function SchedulePage() {
  const [uid, setUid] = useState("");
  const [nama, setNama] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [weeklySchedule, setWeeklySchedule] = useState<
    Record<string, DaySchedule>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSelectedDate(getTodayJakarta());

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "/";
        return;
      }

      try {
        const profile = await getDoc(doc(db, "users", user.uid));

        if (!profile.exists()) {
          window.location.href = "/";
          return;
        }

        setUid(user.uid);
        setNama(profile.data().name || "Karyawan");

        const usersSnapshot = await getDocs(collection(db, "users"));

        const team = usersSnapshot.docs.map((item) => ({
          uid: item.id,
          name: item.data().name || "Karyawan",
        }));

        setEmployees(team);
      } catch (error) {
        console.error(error);
        setMessage("Gagal memuat data tim.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const weekDates = selectedDate
    ? getWeekDates(selectedDate)
    : [];

  useEffect(() => {
    if (!weekDates.length || !employees.length) return;

    let cancelled = false;

    async function loadWeek() {
      try {
        const results = await Promise.all(
          weekDates.map((date) =>
            getDoc(doc(db, "schedules", date))
          )
        );

        if (cancelled) return;

        const loaded: Record<string, DaySchedule> = {};

        results.forEach((result, index) => {
          const date = weekDates[index];

          loaded[date] = result.exists()
            ? result.data().shifts || {}
            : {};
        });

        setWeeklySchedule(loaded);
        setMessage("");
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setMessage("Gagal memuat jadwal mingguan.");
        }
      }
    }

    loadWeek();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, employees]);

  function changeShift(
    date: string,
    employeeUid: string,
    shift: Shift
  ) {
    setWeeklySchedule((previous) => ({
      ...previous,
      [date]: {
        ...(previous[date] || {}),
        [employeeUid]: shift,
      },
    }));
  }

  function changeWeek(amount: number) {
    if (!selectedDate) return;

    const [year, month, day] = selectedDate.split("-").map(Number);
    const next = new Date(year, month - 1, day);

    next.setDate(next.getDate() + amount * 7);

    setSelectedDate(formatDate(next));
  }

  async function saveSchedule() {
    if (!uid || !weekDates.length || saving) return;

    for (const date of weekDates) {
      const day = weeklySchedule[date] || {};

      if (employees.some((employee) => !day[employee.uid])) {
        setMessage(
          `Lengkapi jadwal semua anggota untuk hari ${dayNames[weekDates.indexOf(date)]}.`
        );
        return;
      }
    }

    setSaving(true);
    setMessage("");

    try {
      const batch = writeBatch(db);

      for (const date of weekDates) {
        const scheduleRef = doc(db, "schedules", date);
        const historyRef = doc(collection(db, "scheduleHistory"));

        const previous = await getDoc(scheduleRef);

        const oldShifts = previous.exists()
          ? previous.data().shifts || {}
          : {};

        const newShifts = weeklySchedule[date] || {};

        batch.set(
          scheduleRef,
          {
            date,
            shifts: newShifts,
            updatedBy: uid,
            updatedByName: nama,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        batch.set(historyRef, {
          date,
          previousShifts: oldShifts,
          newShifts,
          changedBy: uid,
          changedByName: nama,
          changedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      setMessage("Jadwal satu minggu berhasil disimpan.");
    } catch (error) {
      console.error(error);
      setMessage(
        "Gagal menyimpan jadwal. Periksa aturan keamanan Firestore."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading || !selectedDate) {
    return (
      <main className="min-h-screen bg-[#191c1b] p-8 text-white">
        Memuat jadwal...
      </main>
    );
  }

  const sortedEmployees = [...employees].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <main className="min-h-screen bg-[#191c1b] text-[#f3f1eb]">
      <div className="mx-auto max-w-5xl p-5 md:p-10">

        <header>
          <p className="text-xs tracking-[0.3em] text-[#c49a70]">
            SOLOK RADJO
          </p>

          <h1 className="mt-6 text-3xl font-semibold">
            Jadwal Kerja
          </h1>

          <p className="mt-2 text-sm text-gray-400">
            Halo, {nama}. Kelola jadwal mingguan tim Padang.
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-white/10 bg-[#292e2b] p-5">
          <p className="text-xs tracking-widest text-[#c49a70]">
            PERIODE JADWAL
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              onClick={() => changeWeek(-1)}
              className="rounded-lg border border-white/20 px-4 py-3"
            >
              ←
            </button>

            <div className="text-center">
              <p className="font-semibold">
                {displayDate(weekDates[0])}
                {" – "}
                {displayDate(weekDates[6])}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Senin – Minggu
              </p>
            </div>

            <button
              onClick={() => changeWeek(1)}
              className="rounded-lg border border-white/20 px-4 py-3"
            >
              →
            </button>
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-5 w-full rounded-lg border border-white/20 bg-[#191c1b] p-3 text-white"
          />

          <button
            onClick={() => setSelectedDate(getTodayJakarta())}
            className="mt-3 text-sm text-[#c49a70]"
          >
            Kembali ke minggu ini
          </button>
        </section>

        <section className="mt-8">
          <div className="mb-5">
            <p className="text-xs tracking-[0.25em] text-[#c49a70]">
              WEEKLY ROSTER
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Pembagian Shift
            </h2>
          </div>

          <div className="space-y-4">
            {weekDates.map((date, index) => {
              const daySchedule = weeklySchedule[date] || {};

              return (
                <article
                  key={date}
                  className="rounded-2xl border border-white/10 bg-[#292e2b] p-5"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                      {dayNames[index]}
                    </h3>

                    <span className="text-sm text-gray-400">
                      {displayDate(date)}
                    </span>
                  </div>

                  <div className="mt-5 space-y-5">
                    {sortedEmployees.map((employee) => (
                      <div key={employee.uid}>
                        <p className="mb-2 text-sm font-medium">
                          {employee.name}
                        </p>

                        <select
                          value={daySchedule[employee.uid] || ""}
                          onChange={(e) =>
                            changeShift(
                              date,
                              employee.uid,
                              e.target.value as Shift
                            )
                          }
                          className="w-full rounded-lg border border-white/10 bg-[#191c1b] p-3 text-white"
                        >
                          <option value="">
                            Pilih jadwal
                          </option>

                          {shifts.map((shift) => (
                            <option key={shift} value={shift}>
                              {shift}
                            </option>
                          ))}
                        </select>

                        <p className="mt-1 text-xs text-gray-500">
                          {daySchedule[employee.uid] === "Pagi" &&
                            "08.00–17.00"}
                          {daySchedule[employee.uid] === "Siang" &&
                            "12.00–21.00"}
                          {daySchedule[employee.uid] === "Full Time" &&
                            "08.00–21.00"}
                          {daySchedule[employee.uid] === "Libur" &&
                            "Tidak dijadwalkan bekerja"}
                          {daySchedule[employee.uid] === "DW" &&
                            "Day Work"}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <button
          onClick={saveSchedule}
          disabled={saving || employees.length === 0}
          className="mt-8 w-full rounded-xl bg-[#8a6243] p-4 font-semibold text-white transition hover:bg-[#a47752] disabled:opacity-50"
        >
          {saving ? "Menyimpan jadwal..." : "Simpan Jadwal Mingguan"}
        </button>

        {message && (
          <p className="mt-4 rounded-xl bg-[#292e2b] p-4 text-sm text-[#e6c49e]">
            {message}
          </p>
        )}

        <button
          onClick={() => (window.location.href = "/dashboard")}
          className="mt-5 rounded-lg border border-white/20 px-6 py-3 text-sm"
        >
          ← Kembali ke Dashboard
        </button>

      </div>
    </main>
  );
}