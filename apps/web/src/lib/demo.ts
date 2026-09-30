import type { ProjectRecord } from "@seenow/shared"
import { keys, putBlob, studioDb } from "@/lib/db"
import { renderSampleRoom } from "@/lib/sample-room"

export const DEMO_CLIENT_ID = "client-demo"

function nextRoomName(projects: ProjectRecord[], clientId: string): string {
  const names = new Set(
    projects.filter((project) => project.clientId === clientId).map((project) => project.name),
  )
  const base = "Sala de estar"
  if (!names.has(base)) return base
  let index = 2
  while (names.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

export async function startDemoProject(): Promise<string> {
  const current = studioDb.getSnapshot()
  if (!current.clients.some((client) => client.id === DEMO_CLIENT_ID)) {
    await studioDb.addClient({
      id: DEMO_CLIENT_ID,
      fullName: "Marina Costa",
      email: "marina.costa@exemplo.com",
      phone: "(11) 98888-1200",
      createdAt: new Date().toISOString(),
    })
  }
  const projectId = crypto.randomUUID()
  const project: ProjectRecord = {
    id: projectId,
    clientId: DEMO_CLIENT_ID,
    name: nextRoomName(studioDb.getSnapshot().projects, DEMO_CLIENT_ID),
    createdAt: new Date().toISOString(),
    hasPhoto: true,
  }
  await putBlob(keys.photo(projectId), await renderSampleRoom())
  await studioDb.addProject(project)
  return projectId
}
