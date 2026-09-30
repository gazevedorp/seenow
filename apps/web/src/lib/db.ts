import { useSyncExternalStore } from "react"
import type { ClientRecord, GenerationRecord, ProjectRecord } from "@seenow/shared"

export type StudioData = {
  clients: ClientRecord[]
  projects: ProjectRecord[]
  generations: GenerationRecord[]
}

export type StudioState = StudioData & {
  ready: boolean
  error: string | null
}

const emptyData = (): StudioData => ({
  clients: [],
  projects: [],
  generations: [],
})

let snapshot: StudioState = {
  ready: false,
  error: null,
  ...emptyData(),
}

const listeners = new Set<() => void>()
let opening: Promise<IDBDatabase> | null = null
let initStarted = false

function emit() {
  for (const listener of listeners) listener()
}

function replace(next: StudioState) {
  snapshot = next
  emit()
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento local."))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha ao gravar."))
    transaction.onabort = () => reject(transaction.error ?? new Error("Gravação cancelada."))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open("seenow", 1)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta")
        if (!database.objectStoreNames.contains("blobs")) database.createObjectStore("blobs")
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponível."))
    })
  }
  return opening
}

async function readData(): Promise<StudioData> {
  const database = await openDatabase()
  const transaction = database.transaction("meta", "readonly")
  const stored = await requestToPromise(transaction.objectStore("meta").get("state"))
  if (!stored || typeof stored !== "object") return emptyData()
  const data = stored as Partial<StudioData>
  return {
    clients: Array.isArray(data.clients) ? data.clients : [],
    projects: Array.isArray(data.projects) ? data.projects : [],
    generations: Array.isArray(data.generations) ? data.generations : [],
  }
}

async function writeData(data: StudioData) {
  const database = await openDatabase()
  const transaction = database.transaction("meta", "readwrite")
  transaction.objectStore("meta").put(data, "state")
  await transactionDone(transaction)
}

function currentData(): StudioData {
  return {
    clients: snapshot.clients,
    projects: snapshot.projects,
    generations: snapshot.generations,
  }
}

async function commit(data: StudioData) {
  replace({ ready: true, error: null, ...data })
  try {
    await writeData(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar."
    replace({ ...snapshot, error: message })
    throw error
  }
}

export const keys = {
  photo: (projectId: string) => `photo:${projectId}`,
  original: (generationId: string) => `original:${generationId}`,
  result: (generationId: string) => `result:${generationId}`,
}

export async function putBlob(key: string, blob: Blob) {
  const database = await openDatabase()
  const transaction = database.transaction("blobs", "readwrite")
  transaction.objectStore("blobs").put(blob, key)
  await transactionDone(transaction)
}

export async function getBlob(key: string): Promise<Blob | null> {
  const database = await openDatabase()
  const transaction = database.transaction("blobs", "readonly")
  const result = await requestToPromise(transaction.objectStore("blobs").get(key))
  return result instanceof Blob ? result : null
}

export async function deleteBlob(key: string) {
  const database = await openDatabase()
  const transaction = database.transaction("blobs", "readwrite")
  transaction.objectStore("blobs").delete(key)
  await transactionDone(transaction)
}

export const studioDb = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot() {
    return snapshot
  },
  async init() {
    if (initStarted) return
    initStarted = true
    try {
      const data = await readData()
      replace({ ready: true, error: null, ...data })
    } catch {
      replace({
        ready: true,
        error: "Não foi possível abrir o armazenamento local deste navegador.",
        ...emptyData(),
      })
    }
  },
  async addClient(client: ClientRecord) {
    const data = currentData()
    await commit({ ...data, clients: [client, ...data.clients] })
  },
  async addProject(project: ProjectRecord) {
    const data = currentData()
    await commit({ ...data, projects: [project, ...data.projects] })
  },
  async updateProject(id: string, patch: Partial<Pick<ProjectRecord, "name" | "hasPhoto">>) {
    const data = currentData()
    await commit({
      ...data,
      projects: data.projects.map((project) => (project.id === id ? { ...project, ...patch } : project)),
    })
  },
  async addGeneration(generation: GenerationRecord) {
    const data = currentData()
    await commit({ ...data, generations: [generation, ...data.generations] })
  },
  async removeProject(projectId: string) {
    const data = currentData()
    const removed = data.generations.filter((generation) => generation.projectId === projectId)
    await commit({
      ...data,
      projects: data.projects.filter((project) => project.id !== projectId),
      generations: data.generations.filter((generation) => generation.projectId !== projectId),
    })
    await deleteBlob(keys.photo(projectId)).catch(() => undefined)
    await Promise.all(
      removed.flatMap((generation) => [
        deleteBlob(keys.original(generation.id)).catch(() => undefined),
        deleteBlob(keys.result(generation.id)).catch(() => undefined),
      ]),
    )
  },
}

export function useStudio() {
  return useSyncExternalStore(studioDb.subscribe, studioDb.getSnapshot, studioDb.getSnapshot)
}
