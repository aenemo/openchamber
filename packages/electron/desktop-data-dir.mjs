import os from 'node:os';
import path from 'node:path';
import { assignInjectedEnv } from '@openchamber/web/server/lib/injected-env.js';

export function configureOpenChamberDataDir(env, directoryName, home = os.homedir()) {
  if (env.OPENCHAMBER_DATA_DIR?.trim()) return;
  assignInjectedEnv(env, {
    OPENCHAMBER_DATA_DIR: path.join(home, '.config', directoryName),
  });
}
