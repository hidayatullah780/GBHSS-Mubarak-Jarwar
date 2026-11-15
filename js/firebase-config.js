// GBHSS Mubarak Jarwar — Firebase connection.
//
// This is the ONLY file that imports the Firebase SDK from the internet. Every other file
// imports what it needs from here, so the Firebase version is changed in one place.
//
// The values in firebaseConfig below are PUBLIC identifiers, not secrets. They only tell the
// browser which Firebase project to talk to. What actually protects your data is the set of
// Security Rules (firestore.rules) published in the Firebase Console.
// NEVER put a service-account key or any "private_key" in this project.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';

import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';

import {
  getFirestore, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection,
  query, where, orderBy, limit, onSnapshot, writeBatch, runTransaction, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js';

/* ------------------------------------------------------------------
   STEP: paste YOUR values from the Firebase Console between the quotes.
   (Project settings -> General -> Your apps -> SDK setup and configuration)
------------------------------------------------------------------- */
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {  apiKey: "AIzaSyBhrOmnfjZoO8MiEefuRDI3xmgYvfWo3wQ",
  authDomain: "gbhss-mubarak-jarwar.firebaseapp.com",
  projectId: "gbhss-mubarak-jarwar",
  storageBucket: "gbhss-mubarak-jarwar.firebasestorage.app",
  messagingSenderId: "247636573380",
  appId: "1:247636573380:web:79c688928b9f17378b9d91",
  measurementId: "G-L7NFDS15KE"
};

/** True once every PASTE_... placeholder above has been replaced. */
export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every((v) => typeof v === 'string' && v && !v.startsWith('PASTE_'));
}

// Nothing is started until the config is filled in, so the app never half-connects.
export const app = isFirebaseConfigured() ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
// Default (memory) cache on purpose: nothing is kept on the device after the tab closes.
// Offline storage is switched on deliberately in Stage 9, with shared-device protection.
export const db = app ? getFirestore(app) : null;

// Re-exported so other files never import the SDK directly.
export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection,
  query, where, orderBy, limit, onSnapshot, writeBatch, runTransaction, serverTimestamp, Timestamp,
};
