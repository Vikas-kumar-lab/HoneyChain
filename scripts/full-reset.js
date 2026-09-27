#!/usr/bin/env node
/**
 * HoneyChain FULL RESET
 * -------------------------------------------------------------
 * Wipes every layer of application state so a completely fresh
 * beekeeper -> harvest -> lab -> process -> dispatch -> inward -> sell
 * run can be performed:
 *
 *   1. the local chain  -> deploys a brand-new HoneyChainCore (truffle migrate --reset)
 *   2. backend JSON datasets (applications, directory, hives, batches)
 *   3. both contract artifact copies (client + hive-intelligence-service)
 *
 * Browser localStorage is purged automatically the next time the app loads:
 * a changed contract address triggers a local-state purge in client/src/web3Utils.js.
 *
 * Usage:  npm run reset
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const SERVICE_DIR = path.join(ROOT, 'hive-intelligence-service');
const CLIENT_ARTIFACT = path.join(ROOT, 'client/src/artifacts/HoneyChainCore.json');
const SERVICE_ARTIFACT = path.join(SERVICE_DIR, 'HoneyChainCore.json');
const GANACHE_BIN = path.join(ROOT, 'node_modules/.bin/ganache');
const RPC_HOST = '127.0.0.1';
const RPC_PORT = 8546;
const DATA_FILES = [
  'applications.json',
  'directory.json',
  'registered_hives.json',
  'batches.json',
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const line = (msg) => console.log(`  ${msg}`);

const rpcRequest = (method, params) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const req = http.request(
      { host: RPC_HOST, port: RPC_PORT, method: 'POST', timeout: 3000 },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) reject(new Error(parsed.error.message));
            else resolve(parsed.result);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RPC timeout'));
    });
    req.end(body);
  });

const rpcAlive = async () => {
  try {
    await rpcRequest('eth_blockNumber', []);
    return true;
  } catch (e) {
    return false;
  }
};

let ownChain = null;

const stopOwnChain = async () => {
  if (!ownChain) return;
  ownChain.kill('SIGINT');
  for (let i = 0; i < 12; i++) {
    await wait(250);
    if (!(await rpcAlive())) {
      line('✓ temporary chain stopped (deployment persisted in ./ganache_data)');
      ownChain = null;
      return;
    }
  }
  // `child.killed` only means a signal was sent — verify the port, then force it.
  ownChain.kill('SIGKILL');
  for (let i = 0; i < 12; i++) {
    await wait(250);
    if (!(await rpcAlive())) break;
  }
  line('✓ temporary chain force-stopped');
  ownChain = null;
};

// Ctrl+C during the migration must not orphan the Ganache we started
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, async () => {
    await stopOwnChain();
    process.exit(130);
  });
});

(async () => {
  console.log('\n🧨  HoneyChain FULL RESET');
  console.log('   ' + '─'.repeat(48));

  try {
    // 0 ── Clean wipe blockchain data for a true block-0 fresh start (unless --keep-chain is passed)
    const keepChain = process.argv.includes('--keep-chain');
    if (!keepChain) {
      line('… stopping any running chain on 8546 and purging ./ganache_data for block-0 reset');
      try {
        execSync('kill -9 $(lsof -ti:8546 2>/dev/null) 2>/dev/null || true');
      } catch (e) {}
      await wait(600);
      const ganacheDataDir = path.join(ROOT, 'ganache_data');
      if (fs.existsSync(ganacheDataDir)) {
        try {
          fs.rmSync(ganacheDataDir, { recursive: true, force: true });
        } catch (e) {}
      }
      fs.mkdirSync(ganacheDataDir, { recursive: true });
      line('✓ ./ganache_data wiped clean');
    }

    // 1 ── Ensure a chain is available ------------------------------------
    if (await rpcAlive()) {
      line('✓ using the chain already running on 8546');
    } else {
      line('… starting a temporary Ganache (persisted in ./ganache_data)');
      if (!fs.existsSync(GANACHE_BIN)) {
        throw new Error('Could not find ganache. Run `npm install` first.');
      }
      ownChain = spawn(
        GANACHE_BIN,
        ['--port', String(RPC_PORT), '--networkId', '1337', '--wallet.deterministic', '--db', './ganache_data'],
        { cwd: ROOT, stdio: 'ignore' },
      );
      let up = false;
      for (let i = 0; i < 40; i++) {
        await wait(500);
        if (await rpcAlive()) {
          up = true;
          break;
        }
      }
      if (!up) throw new Error('Chain did not start on 8546.');
      line('✓ temporary chain started');
    }

    // 2 ── Fresh contract deployment --------------------------------------
    line('… deploying a brand-new HoneyChainCore (truffle migrate --reset)');
    execSync('npx truffle migrate --reset --network development', {
      cwd: ROOT,
      stdio: 'inherit',
    });

    let address = null;
    try {
      const artifact = JSON.parse(fs.readFileSync(CLIENT_ARTIFACT, 'utf8'));
      const net = artifact.networks['1337'] || Object.values(artifact.networks || {})[0];
      address = net && net.address;
    } catch (e) {
      /* handled below */
    }
    if (!address) {
      throw new Error('Migration finished but no contract address was written to the client artifact.');
    }

    // Verify the deployment is really live before destroying any dataset
    const code = await rpcRequest('eth_getCode', [address, 'latest']);
    if (!code || code === '0x') {
      throw new Error(`No contract code found at ${address} — migration did not land on-chain.`);
    }
    line(`✓ fresh contract live at ${address}`);

    // 3 ── Backend shared datasets (only after a verified deploy) ----------
    DATA_FILES.forEach((file) => {
      fs.writeFileSync(path.join(SERVICE_DIR, file), '[]\n', 'utf8');
    });
    line(`✓ wiped backend datasets (${DATA_FILES.length} files → [])`);

    // 4 ── Stamp resetEpoch into artifact so client automatically purges browser localStorage on refresh
    const resetEpoch = Date.now();
    try {
      const art = JSON.parse(fs.readFileSync(CLIENT_ARTIFACT, 'utf8'));
      art.resetEpoch = resetEpoch;
      fs.writeFileSync(CLIENT_ARTIFACT, JSON.stringify(art, null, 2), 'utf8');
      line(`✓ stamped resetEpoch (${resetEpoch}) into client artifact`);
    } catch (e) {
      line(`⚠ could not stamp resetEpoch: ${e.message}`);
    }

    // 5 ── Keep the relayer service artifact in sync -----------------------
    fs.copyFileSync(CLIENT_ARTIFACT, SERVICE_ARTIFACT);
    line('✓ synced hive-intelligence-service/HoneyChainCore.json');
  } finally {
    await stopOwnChain();
  }

  console.log('\n✅ Reset complete. Next steps:');
  console.log('   1. npm start                  # chain + AI-IOT service + client UI');
  console.log('   2. hard-refresh the browser   # local data is purged automatically (new contract address)');
  console.log('   3. beekeeper → harvest → lab → process → dispatch → inward → sell');
  console.log('\n   ⚠ If the AI-IOT service was already running during this reset, restart it');
  console.log('     so it picks up the new contract address.\n');
})().catch(async (err) => {
  await stopOwnChain();
  console.error(`\n✗ Reset failed: ${err.message}`);
  console.error('  Datasets are only wiped AFTER a verified on-chain deploy, so a failed\n  run leaves existing data and contract state untouched. See the output above.\n');
  process.exit(1);
});
