"use client";

import { useEffect, useState } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        setChecking(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/dashboard");
    } catch (err: unknown) {
      console.error("LOGIN ERROR:", err);

      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err
      ) {
        const code = (err as { code: string }).code;

        if (code === "auth/invalid-credential") {
          setError("Email atau kata sandi salah.");
        } else if (code === "auth/invalid-email") {
          setError("Format email tidak valid.");
        } else if (code === "auth/too-many-requests") {
          setError("Terlalu banyak percobaan. Coba lagi nanti.");
        } else if (code === "auth/network-request-failed") {
          setError("Koneksi internet bermasalah.");
        } else {
          setError("Login gagal. Kode: " + code);
        }
      } else {
        setError("Terjadi kesalahan saat login.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#191c1b] text-[#f3f1eb]">
        Memeriksa sesi...
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#191c1b] px-5 py-10 text-[#f3f1eb]">
      <div className="w-full max-w-md">

        <div className="mb-10 text-center">
          <p className="text-xs tracking-[0.4em] text-[#c49a70]">
            PADANG ROASTERY
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-[0.2em]">
            SOLOK RADJO
          </h1>

          <p className="mt-3 text-sm text-gray-400">
            Worktime Management System
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl border border-white/10 bg-[#252a27] p-7 md:p-9"
        >
          <h2 className="text-2xl font-semibold">
            Selamat datang.
          </h2>

          <p className="mt-2 text-sm text-gray-400">
            Masuk untuk mengakses ruang kerja.
          </p>

          <div className="mt-8">
            <label className="mb-2 block text-xs text-gray-400">
              EMAIL
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Masukkan email"
              required
              autoComplete="username"
              className="w-full rounded-lg border border-white/10 bg-[#191c1b] px-4 py-3 text-sm outline-none focus:border-[#c49a70]"
            />
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-xs text-gray-400">
              KATA SANDI
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan kata sandi"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-white/10 bg-[#191c1b] px-4 py-3 text-sm outline-none focus:border-[#c49a70]"
            />
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-7 w-full rounded-lg bg-[#8a6243] py-3 text-sm font-semibold tracking-widest transition hover:bg-[#a17652] disabled:opacity-50"
          >
            {loading ? "MEMERIKSA..." : "MASUK"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs tracking-widest text-gray-600">
          INTERNAL WORKFORCE SYSTEM
        </p>

      </div>
    </main>
  );
}