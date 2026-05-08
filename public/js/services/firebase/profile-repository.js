import { doc, getDoc, setDoc, deleteDoc, updateDoc, deleteField } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { db } from './firebase-app.js';

function getUserProfileRef(userId) {
    return doc(db, 'users', userId);
}

export function fetchUserProfile(userId) {
    return getDoc(getUserProfileRef(userId));
}

export function mergeUserProfile(userId, data, options = { merge: true }) {
    return setDoc(getUserProfileRef(userId), data, options);
}

export function updateUserProfile(userId, data) {
    return updateDoc(getUserProfileRef(userId), data);
}

export function deleteUserProfile(userId) {
    return deleteDoc(getUserProfileRef(userId));
}

export function firestoreDeleteFieldValue() {
    return deleteField();
}
