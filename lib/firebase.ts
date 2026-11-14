import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDUlRd2BKke-ggX_TnY5qKosNdhL0v6bz0",
  authDomain: "absensi-solok-radjo.firebaseapp.com",
  projectId: "absensi-solok-radjo",
  storageBucket: "absensi-solok-radjo.firebasestorage.app",
  messagingSenderId: "589791306901",
  appId: "1:589791306901:web:664b4e85ae635c662f679c"
};

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);