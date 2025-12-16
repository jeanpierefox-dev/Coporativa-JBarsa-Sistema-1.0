import { User, UserRole, Batch, ClientOrder, AppConfig } from '../types';
import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, enableIndexedDbPersistence, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';

const KEYS = {
  USERS: 'avi_users',
  BATCHES: 'avi_batches',
  ORDERS: 'avi_orders',
  CONFIG: 'avi_config',
  SESSION: 'avi_session'
};

// --- Helper: Safe Parse ---
const safeParse = (key: string, fallback: any) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : fallback;
    } catch (e) {
        console.warn(`Data corruption detected in ${key}. Resetting to default.`);
        return fallback;
    }
};

// --- Firebase Initialization ---
let db: any = null;
let unsubscribers: Function[] = [];

export const validateConfig = async (firebaseConfig: any): Promise<{ valid: boolean; error?: string }> => {
    let app: any = null;
    try {
        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
            return { valid: false, error: "Faltan campos obligatorios (API Key o Project ID)." };
        }

        const tempName = 'validator_' + Date.now() + Math.random().toString(36).substring(7);
        app = initializeApp(firebaseConfig, tempName);
        const db = getFirestore(app);
        
        // Try to read/write to validate rules
        // We set merge: true to avoid overwriting if it exists, but mainly to test write permission
        await setDoc(doc(db, 'config', 'validation_test'), { check: true, ts: Date.now() }, { merge: true });

        return { valid: true };
    } catch (e: any) {
        let msg = e.message || "Error desconocido";
        
        // Translate common Firestore errors for better UX
        if (e.code === 'permission-denied') {
            msg = "⛔ PERMISOS DENEGADOS: Ve a Firebase Console > Firestore Database > Reglas. Cambia 'allow read, write: if false;' a 'if true;'";
        } else if (e.code === 'unimplemented' || e.code === 'not-found') {
            msg = "⚠️ BASE DE DATOS NO CREADA: Ve a Firebase Console > Firestore Database y haz clic en 'Crear base de datos'.";
        } else if (e.code === 'unavailable') {
            msg = "📡 SIN CONEXIÓN: Verifica tu internet o si el servicio de Firebase está activo.";
        } else if (e.code === 'invalid-argument') {
            msg = "❌ DATOS INCORRECTOS: El formato de la configuración no es válido.";
        }

        return { valid: false, error: msg };
    } finally {
        if (app) {
            try { await deleteApp(app); } catch (e) { console.warn("Error cleanup temp app", e); }
        }
    }
};

export const initCloudSync = async () => {
  const config = getConfig();
  
  // Clear previous listeners
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];

  if (config.firebaseConfig?.apiKey && config.firebaseConfig?.projectId) {
    try {
      let app;
      
      if (!getApps().length) {
          app = initializeApp(config.firebaseConfig);
          // Optimize Firestore settings for speed
          db = initializeFirestore(app, {
              cacheSizeBytes: CACHE_SIZE_UNLIMITED
          });
          
          // Enable Offline Persistence (Critical for Speed)
          try {
              await enableIndexedDbPersistence(db);
              console.log("⚡ Persistencia Offline activada (Modo Rápido)");
          } catch (err: any) {
              if (err.code === 'failed-precondition') {
                  console.warn("Múltiples pestañas abiertas. La persistencia solo funciona en una.");
              } else if (err.code === 'unimplemented') {
                  console.warn("El navegador no soporta persistencia offline.");
              }
          }

      } else {
          app = getApp(); 
          db = getFirestore(app);
      }

      console.log("☁️ Sincronización en segundo plano iniciada...");
      startListeners();
      
      // Upload in background, don't await/block UI
      setTimeout(() => uploadLocalToCloud(), 2000);

    } catch (e) {
      console.error("Error al conectar con Firebase:", e);
    }
  }
};

const startListeners = () => {
  if (!db) return;

  const syncCollection = (colName: string, storageKey: string, eventName: string) => {
    try {
        const q = collection(db, colName);
        
        const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
          // 1. Performance: If the snapshot is empty, do nothing
          if (snapshot.empty && snapshot.metadata.fromCache) return;

          // 2. Read Local Data once
          const currentLocalRaw = localStorage.getItem(storageKey);
          const currentLocal: any[] = currentLocalRaw ? JSON.parse(currentLocalRaw) : [];
          
          // 3. Optimized Merge using Map (O(N) complexity instead of O(N^2))
          const dataMap = new Map<string, any>();

          // A. Load Local Data first
          currentLocal.forEach(item => dataMap.set(item.id, item));

          // B. Apply Cloud Updates (Cloud is Source of Truth for conflicts)
          let hasChanges = false;
          snapshot.docChanges().forEach((change) => {
              const docData = change.doc.data();
              if (change.type === 'removed') {
                  if (dataMap.has(change.doc.id)) {
                      dataMap.delete(change.doc.id);
                      hasChanges = true;
                  }
              } else {
                  // Added or Modified
                  const existing = dataMap.get(docData.id);
                  // Deep compare simple (JSON stringify is fast enough for single items) to avoid UI flicker
                  if (!existing || JSON.stringify(existing) !== JSON.stringify(docData)) {
                      dataMap.set(docData.id, docData);
                      hasChanges = true;
                  }
              }
          });

          // C. If it's the initial load or a full refresh, ensure we have everything
          // (snapshot.docChanges only gives deltas, but on first load we iterate all to be safe if local was empty)
          if (currentLocal.length === 0 && !snapshot.empty) {
               snapshot.forEach(doc => dataMap.set(doc.id, doc.data()));
               hasChanges = true;
          }

          // 4. Write back ONLY if needed
          if (hasChanges) {
              const mergedData = Array.from(dataMap.values());
              const newString = JSON.stringify(mergedData);
              
              if (newString !== currentLocalRaw) {
                  localStorage.setItem(storageKey, newString);
                  window.dispatchEvent(new Event(eventName));
                  // console.log(`⚡ ${colName} updated from cloud. Items: ${mergedData.length}`);
              }
          }
        });
        
        unsubscribers.push(unsub);
    } catch(e: any) {
        console.error(`Error setting up listener for ${colName}:`, e);
    }
  };

  syncCollection('users', KEYS.USERS, 'avi_data_users');
  syncCollection('batches', KEYS.BATCHES, 'avi_data_batches');
  syncCollection('orders', KEYS.ORDERS, 'avi_data_orders');
};

const uploadLocalToCloud = async () => {
  if (!db) return;
  
  const upload = async (colName: string, data: any[]) => {
      // Use Batch Writes for Atomicity and Speed
      // Firestore allows 500 ops per batch.
      const batchSize = 400; 
      for (let i = 0; i < data.length; i += batchSize) {
          const chunk = data.slice(i, i + batchSize);
          // We process chunks sequentially to avoid flooding network, 
          // but individual items are just setDoc (no batch obj used here to keep it simple, 
          // but checking if exists would be better). 
          // For this app, simply iterating is robust enough.
          
          chunk.forEach(item => {
               if(item && item.id) {
                   // We don't await individual writes in this background loop to keep it non-blocking
                   setDoc(doc(db, colName, item.id), item, { merge: true }).catch(e => console.warn(e));
               }
          });
      }
  };

  await upload('users', getUsers());
  await upload('batches', getBatches());
  await upload('orders', getOrders());
};

// --- Helpers for Dual Write ---
const writeToCloud = async (collectionName: string, data: any) => {
  if (db && data.id) {
    try {
      // Fire and forget (don't await) to keep UI snappy
      setDoc(doc(db, collectionName, data.id), data).catch(e => console.warn("Cloud write failed", e));
    } catch (e) {
      console.error(`Error writing ${collectionName} to cloud:`, e);
    }
  }
};

const deleteFromCloud = async (collectionName: string, id: string) => {
  if (db && id) {
    try {
      deleteDoc(doc(db, collectionName, id)).catch(e => console.warn("Cloud delete failed", e));
    } catch (e) {
      console.error("Error deleting from cloud:", e);
    }
  }
};


// --- Initialization ---

const seedData = () => {
  if (localStorage.getItem(KEYS.USERS) === null) {
    const admin: User = {
      id: 'admin-1',
      username: 'admin',
      password: '123',
      name: 'Administrador Principal',
      role: UserRole.ADMIN
    };
    localStorage.setItem(KEYS.USERS, JSON.stringify([admin]));
  }
  if (localStorage.getItem(KEYS.CONFIG) === null) {
    const config: AppConfig = {
      companyName: 'Avícola Demo',
      logoUrl: '',
      printerConnected: false,
      scaleConnected: false,
      defaultFullCrateBatch: 5,
      defaultEmptyCrateBatch: 10
    };
    localStorage.setItem(KEYS.CONFIG, JSON.stringify(config));
  }
};

// --- Users ---

export const getUsers = (): User[] => safeParse(KEYS.USERS, []);

export const saveUser = (user: User) => {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx >= 0) users[idx] = user;
  else users.push(user);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  writeToCloud('users', user);
  window.dispatchEvent(new Event('avi_data_users'));
};

export const deleteUser = (id: string) => {
  const users = getUsers().filter(u => u.id !== id);
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  deleteFromCloud('users', id);
  window.dispatchEvent(new Event('avi_data_users'));
};

export const login = (u: string, p: string): User | null => {
  const users = getUsers();
  return users.find(user => user.username === u && user.password === p) || null;
};

// --- Batches ---

export const getBatches = (): Batch[] => safeParse(KEYS.BATCHES, []);

export const saveBatch = (batch: Batch) => {
  const batches = getBatches();
  const idx = batches.findIndex(b => b.id === batch.id);
  if (idx >= 0) batches[idx] = batch;
  else batches.push(batch);
  localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
  writeToCloud('batches', batch);
  window.dispatchEvent(new Event('avi_data_batches'));
};

export const deleteBatch = (id: string) => {
  const batches = getBatches().filter(b => b.id !== id);
  localStorage.setItem(KEYS.BATCHES, JSON.stringify(batches));
  deleteFromCloud('batches', id);
  window.dispatchEvent(new Event('avi_data_batches'));
};

// --- Orders/Weighings ---

export const getOrders = (): ClientOrder[] => safeParse(KEYS.ORDERS, []);

export const saveOrder = (order: ClientOrder) => {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === order.id);
  if (idx >= 0) orders[idx] = order;
  else orders.push(order);
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  writeToCloud('orders', order);
  window.dispatchEvent(new Event('avi_data_orders'));
};

export const getOrdersByBatch = (batchId: string) => getOrders().filter(o => o.batchId === batchId);

// --- Config ---

export const getConfig = (): AppConfig => safeParse(KEYS.CONFIG, {});
export const saveConfig = (cfg: AppConfig) => {
  localStorage.setItem(KEYS.CONFIG, JSON.stringify(cfg));
  if (cfg.firebaseConfig?.apiKey) {
    initCloudSync();
  }
  window.dispatchEvent(new Event('avi_data_config'));
};

export const isFirebaseConfigured = (): boolean => {
  const c = getConfig();
  return !!(c.firebaseConfig?.apiKey && c.firebaseConfig?.projectId);
};

// New Helper: Import Full Backup
export const restoreBackup = (data: any) => {
    if (data.users) localStorage.setItem(KEYS.USERS, data.users);
    if (data.batches) localStorage.setItem(KEYS.BATCHES, data.batches);
    if (data.orders) localStorage.setItem(KEYS.ORDERS, data.orders);
    if (data.config) localStorage.setItem(KEYS.CONFIG, data.config);
    window.location.reload();
};

export const resetApp = () => {
  localStorage.clear();
  seedData();
  window.location.reload();
};

// --- STARTUP EXECUTION ---
// Executed at the end to ensure all functions (getConfig, getUsers, etc.) are defined.
seedData();
// Try to init cloud on load if config exists
initCloudSync();