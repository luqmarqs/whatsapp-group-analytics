import Docker from 'dockerode'
import pool from '../db'

export const docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' })

export const WORKER_IMAGE = process.env.WORKER_IMAGE ?? 'whatsapp-group-analytics-worker'
export const DOCKER_NETWORK = process.env.DOCKER_NETWORK ?? 'whatsapp-group-analytics_backend'
export const MANAGED_CONTAINER_RE = /^wga-worker-[a-z0-9-]+$/

interface WorkerInstance {
  id: string
  name: string
  container_name: string | null
  is_running: boolean | null
}

export function isManagedWorkerContainer(containerName: string) {
  return MANAGED_CONTAINER_RE.test(containerName)
}

export async function getWorkerContainerStatus(containerName: string): Promise<'running' | 'stopped' | 'missing'> {
  if (!isManagedWorkerContainer(containerName)) return 'missing'
  try {
    const container = docker.getContainer(containerName)
    const info = await container.inspect()
    return info.State.Running ? 'running' : 'stopped'
  } catch {
    return 'missing'
  }
}

async function createWorkerContainer(instanceName: string, containerName: string) {
  return docker.createContainer({
    Image: WORKER_IMAGE,
    name: containerName,
    Env: [
      `DATABASE_URL=${process.env.DATABASE_URL}`,
      `REDIS_URL=${process.env.REDIS_URL}`,
      `INSTANCE_NAME=${instanceName}`,
      `SESSION_DIR=/app/sessions`,
      `NODE_ENV=production`,
      `STORE_MESSAGE_BODY=${process.env.STORE_MESSAGE_BODY ?? 'false'}`,
    ],
    HostConfig: {
      NetworkMode: DOCKER_NETWORK,
      Mounts: [{ Type: 'volume', Source: `wga-sessions-${instanceName}`, Target: '/app/sessions' }],
      RestartPolicy: { Name: 'unless-stopped' },
    },
  })
}

async function imageIsCurrent(containerName: string) {
  const [containerInfo, imageInfo] = await Promise.all([
    docker.getContainer(containerName).inspect(),
    docker.getImage(WORKER_IMAGE).inspect(),
  ])
  return containerInfo.Image === imageInfo.Id
}

export async function ensureWorkerContainer(instance: WorkerInstance, start: boolean) {
  const containerName = instance.container_name ?? `wga-worker-${instance.name}`
  if (!isManagedWorkerContainer(containerName)) {
    throw new Error(`Container is not managed by this app: ${containerName}`)
  }

  let shouldCreate = false
  let wasRunning = false

  try {
    const container = docker.getContainer(containerName)
    const info = await container.inspect()
    wasRunning = info.State.Running

    if (!await imageIsCurrent(containerName)) {
      if (wasRunning) await container.stop({ t: 20 }).catch(() => {})
      await container.remove({ force: true })
      shouldCreate = true
    }
  } catch {
    shouldCreate = true
  }

  const container = shouldCreate
    ? await createWorkerContainer(instance.name, containerName)
    : docker.getContainer(containerName)

  if (start) {
    const status = await getWorkerContainerStatus(containerName)
    if (status !== 'running') await container.start()
    await pool.query('UPDATE whatsapp_instances SET is_running = true WHERE id = $1', [instance.id])
  } else if (shouldCreate) {
    await pool.query('UPDATE whatsapp_instances SET is_running = false WHERE id = $1', [instance.id])
  } else if (wasRunning) {
    await pool.query('UPDATE whatsapp_instances SET is_running = true WHERE id = $1', [instance.id])
  }

  return { containerName, recreated: shouldCreate }
}

export async function removeWorkerContainer(containerName: string) {
  if (!isManagedWorkerContainer(containerName)) {
    throw new Error('Container is not managed by this app')
  }
  const container = docker.getContainer(containerName)
  await container.stop().catch(() => {})
  await container.remove().catch(() => {})
}

export async function reconcileManagedWorkersOnStartup() {
  if (process.env.AUTO_RECREATE_WORKERS_ON_START === 'false') return

  const { rows } = await pool.query<WorkerInstance>(
    `SELECT id, name, container_name, is_running
     FROM whatsapp_instances
     WHERE container_name IS NOT NULL
     ORDER BY created_at`,
  )

  for (const row of rows) {
    const containerName = row.container_name ?? `wga-worker-${row.name}`
    if (!isManagedWorkerContainer(containerName)) continue
    try {
      const status = await getWorkerContainerStatus(containerName)
      await ensureWorkerContainer(row, row.is_running === true || status === 'running')
    } catch (err) {
      console.error(`[workers] failed to reconcile ${row.name}`, err)
    }
  }
}
