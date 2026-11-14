"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const OFFICE_LAT = -0.9499245;
const OFFICE_LNG = 100.3633908;
const MAX_DISTANCE = 100;

function distanceInMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getJakartaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return parts;
}

export default function AttendancePage() {
  const [nama, setNama] = useState("");
  const [uid, setUid] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [locationText, setLocationText] = useState("Belum diperiksa");
  const [distance, setDistance] = useState<number | null>(null);
  const [attendance, setAttendance] = useState<{
    checkInAt?: unknown;
    checkOutAt?: unknown;
  }>({});

  useEffect(() => {
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

        setNama(profile.data().name || "Karyawan");
        setUid(user.uid);
      } catch {
        setStatus("Gagal memuat profil.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) return;

    const loadAttendance = async () => {
      try {
        const date = getJakartaDate();
        const attendanceRef = doc(db, "attendance", `${date}_${uid}`);
        const result = await getDoc(attendanceRef);

        if (result.exists()) {
          setAttendance(result.data());
        }
      } catch {
        setStatus("Gagal memuat riwayat absensi hari ini.");
      }
    };

    loadAttendance();
  }, [uid]);

  function getLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Browser tidak mendukung GPS."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }

  async function submitAttendance(type: "checkIn" | "checkOut") {
    if (!uid || processing) return;

    setProcessing(true);
    setStatus("Sedang memeriksa GPS...");
    setLocationText("Memeriksa lokasi...");

    try {
      const position = await getLocation();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      const meters = distanceInMeters(
        OFFICE_LAT,
        OFFICE_LNG,
        lat,
        lng
      );

      setDistance(Math.round(meters));

      if (meters > MAX_DISTANCE) {
        setLocationText("Di luar area kerja");
        setStatus(
          `Absensi ditolak. Jarak kamu ${Math.round(meters)} meter dari lokasi kerja.`
        );
        return;
      }

      const date = getJakartaDate();
      const attendanceRef = doc(db, "attendance", `${date}_${uid}`);

      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(attendanceRef);

        if (type === "checkIn") {
          if (existing.exists() && existing.data().checkInAt) {
            throw new Error("Kamu sudah melakukan absen masuk hari ini.");
          }

          transaction.set(attendanceRef, {
            userId: uid,
            name: nama,
            date,
            checkInAt: serverTimestamp(),
            checkInLocation: { lat, lng, accuracy },
          }, { merge: true });
        } else {
          if (!existing.exists() || !existing.data().checkInAt) {
            throw new Error("Kamu harus absen masuk terlebih dahulu.");
          }

          if (existing.data().checkOutAt) {
            throw new Error("Kamu sudah melakukan absen pulang hari ini.");
          }

          transaction.update(attendanceRef, {
            checkOutAt: serverTimestamp(),
            checkOutLocation: { lat, lng, accuracy },
          });
        }
      });

      setLocationText("Lokasi terverifikasi");
      setStatus(
        type === "checkIn"
          ? "Absen masuk berhasil disimpan."
          : "Absen pulang berhasil disimpan."
      );

      const updated = await getDoc(attendanceRef);
      if (updated.exists()) setAttendance(updated.data());
    } catch (error: unknown) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Absensi gagal. Periksa koneksi internet dan izin GPS."
      );
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#191c1b] p-8 text-white">
        Memuat...
      </main>
    );
  }

  const hasCheckedIn = Boolean(attendance.checkInAt);
  const hasCheckedOut = Boolean(attendance.checkOutAt);

  return (
    <main className="min-h-screen bg-[#191c1b] p-6 text-[#f3f1eb]">
      <p className="text-xs tracking-[0.25em] text-[#c49a70]">
        SOLOK RADJO
      </p>

      <h1 className="mt-8 text-3xl font-semibold">
        Absensi Harian
      </h1>

      <p className="mt-2 text-gray-400">
        Selamat bekerja, {nama}.
      </p>

      <section className="mt-8 rounded-2xl bg-[#292e2b] p-6">
        <p className="text-sm text-gray-400">Status kehadiran</p>
        <h2 className="mt-3 text-xl font-semibold">
          {hasCheckedOut
            ? "Absensi selesai"
            : hasCheckedIn
            ? "Sudah absen masuk"
            : "Belum melakukan absensi"}
        </h2>

        <p className="mt-3 text-sm text-gray-400">
          Lokasi: {locationText}
        </p>

        {distance !== null && (
          <p className="mt-1 text-sm text-gray-400">
            Jarak dari lokasi kerja: {distance} meter
          </p>
        )}
      </section>

      <section className="mt-5 space-y-3">
        <button
          onClick={() => submitAttendance("checkIn")}
          disabled={processing || hasCheckedIn}
          className="w-full rounded-xl bg-[#8a6243] p-5 font-semibold disabled:opacity-40"
        >
          {processing ? "Memproses..." : "Absen Masuk"}
        </button>

        <button
          onClick={() => submitAttendance("checkOut")}
          disabled={processing || !hasCheckedIn || hasCheckedOut}
          className="w-full rounded-xl border border-[#8a6243] p-5 font-semibold disabled:opacity-40"
        >
          {processing ? "Memproses..." : "Absen Pulang"}
        </button>
      </section>

      {status && (
        <p className="mt-5 rounded-xl bg-[#292e2b] p-4 text-sm text-[#e6c49e]">
          {status}
        </p>
      )}

      <p className="mt-6 text-xs text-gray-500">
        Verifikasi GPS menggunakan radius 100 meter.
        Waktu absensi dicatat menggunakan waktu server.
      </p>

      <button
        onClick={() => (window.location.href = "/dashboard")}
        className="mt-8 rounded-lg border border-[#555] px-6 py-3"
      >
        Kembali ke Dashboard
      </button>
    </main>
  );
}