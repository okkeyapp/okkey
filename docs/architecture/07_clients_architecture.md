# Clients Architecture

Okkey has several client applications.

All clients use **shared packages**.

---

## Clients
- Web
- Mobile
- Desktop
- Browser Extension

---

## Shared SDK

All clients use:
- packages/api
- packages/crypto
- packages/vault
- packages/sync
- packages/auth

---

## Web Application

- React
- Next.js
- Typescript

Data storage: IndexedDB

---

## Mobile Application

- React Native

Secure storage:
- iOS Keychain
- Android Keystore

---

## Desktop Application

- Tauri
- React UI
- Rust backend

Storage:
- OS secure storage
- SQLite

---

## Browser Extension

Uses:
- React
- WebExtension API

Features:
- autofill
- password capture
- quick vault access

---

## Crypto Usage

All clients use Rust WASM crypto engine, via packages/crypto

---

## Local State

Clients have local vault state.

This provides:
- fast UI
- offline support
- local search
