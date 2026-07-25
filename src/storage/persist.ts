export async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return
  const alreadyPersisted = await navigator.storage.persisted()
  if (alreadyPersisted) return
  await navigator.storage.persist()
}

export async function isStoragePersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  return navigator.storage.persisted()
}
