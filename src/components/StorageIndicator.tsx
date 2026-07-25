import { useEffect, useState } from 'react'
import { isStoragePersisted } from '../storage/persist'

export function StorageIndicator() {
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    isStoragePersisted().then(setPersisted)
  }, [])

  if (persisted === null) return null

  return (
    <span
      title={
        persisted
          ? 'Storage is persisted — protected from automatic eviction'
          : 'Storage is not persisted — data may be cleared if the device runs low on space'
      }
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${persisted ? 'bg-emerald-500' : 'bg-amber-500'}`}
    />
  )
}
