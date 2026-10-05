import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Testcontainers looks for /var/run/docker.sock. Colima (used instead of Docker Desktop, see README)
 * exposes its socket elsewhere, so point Testcontainers at it unless DOCKER_HOST is already set.
 */
export function configureDockerForColima(): void {
  if (process.env.DOCKER_HOST) return;
  const colimaSocket = join(homedir(), '.colima', 'default', 'docker.sock');
  if (existsSync(colimaSocket)) {
    process.env.DOCKER_HOST = `unix://${colimaSocket}`;
    process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE ??= '/var/run/docker.sock';
  }
}
