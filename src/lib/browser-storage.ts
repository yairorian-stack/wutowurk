let userId: string | null = null;
const listeners = new Set<() => void>();
export function storageUserId() {
  return userId;
}
export function scopedStorageKey(base: string) {
  return userId ? `${base}:${userId}` : base;
}
export function subscribeStorageUser(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function setStorageUser(id: string) {
  if (id !== userId) {
    userId = id;
    listeners.forEach((fn) => fn());
  }
}
