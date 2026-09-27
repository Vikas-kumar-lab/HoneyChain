#!/usr/bin/env node
/**
 * HoneyChain LIVE RESET (for the Vercel + Render deployment)
 * -------------------------------------------------------------
 * `npm run reset` (scripts/full-reset.js) is a LOCAL-only reset: it wipes
 * ./ganache_data and redeploys a brand-new contract on the local chain.
 * It does NOT make the *deployed* app fresh, because production (Vercel) does
 * not read the local chain — it reads Sepolia + the Render backend.
 *
 * This script resets the four layers the deployed app actually shows:
 *
 *   1. BROWSER localStorage  -> bumps `resetEpoch` in the client artifact.
 *      web3Utils.js compares it against localStorage["honeychain_reset_epoch"]
 *      on load and purges every honeychain_* key when it changed. Without this
 *      bump, testers keep seeing OLD hives / batches / applications even after
 *      the server is wiped, because that data lives in their browser.
 *
 *   2. BACKEND datasets      -> empties applications / directory /
 *      registered_hives / batches .json. Render redeploys from git with no
 *      persistent disk, so pushing these empty files boots a clean memory store.
 *
 *   3. LIVE BACKEND CLEAR    -> POSTs the deployed backend's /api/admin/reset-data, and
 *      REFUSES to run if that backend is unusable. This is not optional: the client
 *      re-hydrates hives, batches, applications, directory entries and POS shelf/sales
 *      records from the backend on every page load (hiveBatchRegistry, entityRegistry,
 *      applicationRegistry, RetailPOS), so a reset that leaves the backend stale is
 *      undone on the very first load — which looks exactly like "the reset did nothing".
 *      With --chain it is worse: batch IDs restart at 1, so stale shelf/sales records
 *      keyed by batchId would bind to the brand-new batch #1.
 *      The backend URL defaults to this deployment; override it with --remote <url>,
 *      or set BACKEND_URL in .env.
 *
 *   4. DEPLOY TRIGGER        -> prints (or runs, with --push) the exact git
 *      commands to commit ONLY these reset files and push, which makes Vercel
 *      and Render rebuild with the fresh state. With --push it refuses to push
 *      when the backend clear failed, so a known-broken reset is never deployed.
 *
 * By DEFAULT on-chain data is NOT touched (the contract addresses in the
 * artifact stay valid). That is important: the app enumerates batchCount() from
 * block 1 on every load, so beekeepers/hives/batches recorded on-chain by an
 * earlier test run KEEP SHOWING UP in the pipeline even after the local + backend
 * reset. Only a brand-new contract makes the pipeline truly empty:
 *
 *   npm run reset:live -- --chain               # deploy a fresh contract first
 *
 * --chain redeploys to Sepolia via truffle (needs RELAYER_PRIVATE_KEY + a little
 * testnet gas), preserves the other network entries in the artifact, and includes
 * the new address in the same reset commit.
 *
 * Usage:
 *   npm run reset:live -- --dry-run          # preview, writes nothing
 *   npm run reset:live                       # wipe + clear backend, then print git steps
 *   npm run reset:live -- --push             # wipe + clear backend + commit + push
 *   npm run reset:live -- --chain --push     # also deploy a fresh contract (fully empty)
 */
// Requires Node 18+ (global fetch, used by --remote). See "engines" in package.json.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Load the same .env truffle-config.js uses, so RPC_URL / BACKEND_URL are visible here too.
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
  /* dotenv is optional */
}

const ROOT = path.join(__dirname, '..');
const SERVICE_DIR = path.join(ROOT, 'hive-intelligence-service');
const CLIENT_ARTIFACT = path.join(ROOT, 'client/src/artifacts/HoneyChainCore.json');
const SERVICE_ARTIFACT = path.join(SERVICE_DIR, 'HoneyChainCore.json');
const DATA_FILES = ['applications.json', 'directory.json', 'registered_hives.json', 'batches.json'];

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const PUSH = argv.includes('--push');
const CHAIN = argv.includes('--chain');
const CHAIN_NETWORK = process.env.CHAIN_NETWORK || 'sepolia';
// This deployment's Render backend. Override with --remote <url> or BACKEND_URL in .env.
const DEFAULT_BACKEND_URL = 'https://honeychain-backend-fzx3.onrender.com';
const remoteIdx = argv.indexOf('--remote');
// A flag swallowed as the URL (`--remote --push`) would skip the backend clear and then
// fail confusingly at fetch time, so validate whichever source actually wins.
const remoteArg = remoteIdx >= 0 ? argv[remoteIdx + 1] : '';
// A missing value would otherwise silently fall through to the default, making the user
// believe their override applied (and `--remote --push` would swallow the next flag).
if (remoteIdx >= 0 && (!remoteArg || remoteArg.startsWith('--'))) {
  console.error(
    '\n✗ --remote needs a backend URL, e.g. --remote https://your-backend.onrender.com\n',
  );
  process.exit(1);
}
const REMOTE_URL = remoteArg || process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
if (!/^https?:\/\//.test(REMOTE_URL)) {
  console.error(`\n✗ The backend URL must start with http(s):// — received "${REMOTE_URL}".\n`);
  process.exit(1);
}

const line = (msg) => console.log(`  ${msg}`);

const readArtifact = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Contract artifact not found at ${path.relative(ROOT, filePath)}.\n` +
      '  Compile first (npm run compile) or restore the file from git before resetting.',
    );
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return { raw, json: JSON.parse(raw) };
  } catch (e) {
    throw new Error(`Contract artifact ${path.relative(ROOT, filePath)} is not valid JSON: ${e.message}`);
  }
};

// Surgical patch of just the resetEpoch value — these artifacts are ~72k-line
// truffle builds, so rewriting the whole file would create an enormous diff.
// The value is always written as a bare number (what web3Utils.js + full-reset.js expect).
const patchResetEpoch = (raw, epoch) => {
  const pattern = /("resetEpoch"\s*:\s*)("?\d+"?)/g;
  // Patch the LAST occurrence: the top-level key the client imports is the one
  // full-reset.js appended at the end of the object, so an ABI entry that happens
  // to share the name earlier in the file is never touched.
  let last = null;
  for (const m of raw.matchAll(pattern)) last = m;
  if (last) {
    const start = last.index;
    return {
      next: `${raw.slice(0, start)}${last[1]}${epoch}${raw.slice(start + last[0].length)}`,
      previous: last[2].replace(/"/g, ''),
    };
  }
  // Key absent (e.g. a raw `truffle compile` artifact) — append it as the last top-level key.
  const closing = raw.lastIndexOf('}');
  const head = raw.slice(0, closing).replace(/\s*$/, '');
  const needsComma = !head.trimEnd().endsWith('{');
  return { next: `${head}${needsComma ? ',' : ''}\n  "resetEpoch": ${epoch}\n${raw.slice(closing)}`, previous: '(none)' };
};

// Never let a corrupted artifact reach git — --push would ship it straight to Vercel.
const assertValidJson = (filePath, content) => {
  try {
    JSON.parse(content);
  } catch (e) {
    throw new Error(
      `Refusing to write ${path.relative(ROOT, filePath)} — the patched artifact is not valid JSON (${e.message}).`,
    );
  }
};

// Returns an entry count, or null when the file is missing/unreadable — so a
// corrupt dataset never gets reported as a clean "0 entries".
const countEntries = (file) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(SERVICE_DIR, file), 'utf8'));
    return Array.isArray(data) ? data.length : null;
  } catch (e) {
    return null;
  }
};

// Public RPC per CHAIN ID, used to confirm a fresh deploy actually landed on-chain.
// Keyed by CHAIN ID (not truffle network name) so the verification always queries the
// chain that was actually deployed to — pointing it at the wrong chain would return 0x
// and abort after the real deploy's gas was already spent.
const NETWORK_RPC_BY_ID = {
  '11155111': process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  '421614': process.env.ARBITRUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
};

// One raw JSON-RPC helper, shared by the deploy verification and the funding preflight.
const rpcCall = async (rpcUrl, method, params) => {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return (await res.json()).result;
};

// A truffle exit code of 0 is not proof; an empty batchCount() pipeline depends on
// the code really being at that address, so verify before any data gets wiped.
const verifyDeployed = async (address, networkId) => {
  // Prefer the id-keyed map: RPC_URL is shared with truffle-config and could point at a
  // different chain, which would make eth_getCode return 0x and hard-abort after the gas
  // for the real deploy was already spent.
  const rpcUrl = NETWORK_RPC_BY_ID[String(networkId)] || process.env.RPC_URL;
  if (!rpcUrl) {
    line(`⚠ no verification RPC known for network ${networkId} — set RPC_URL to verify the deploy`);
    return;
  }
  let code;
  try {
    code = await rpcCall(rpcUrl, 'eth_getCode', [address, 'latest']);
  } catch (err) {
    line(`⚠ could not verify the deploy over RPC (${err.message}) — continuing`);
    return;
  }
  if (!code || code === '0x') {
    throw new Error(
      `No contract code found at ${address} — the deploy did not land. Aborting before any data is wiped.`,
    );
  }
  line(`✓ verified live on-chain at ${address}`);
};

// Truffle reserves `gas * gasPrice` UP FRONT and aborts with a cryptic "insufficient funds"
// when the balance is short — which is exactly how --chain looked broken before. Do the same
// arithmetic here first so the failure names both numbers instead of hiding inside truffle.
// Skips silently whenever the numbers cannot be read, so it can never block a valid deploy.
const preflightDeployFunds = async () => {
  const net = require(path.join(ROOT, 'truffle-config.js')).networks[CHAIN_NETWORK];
  const privateKey = process.env.RELAYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  const rpcUrl = net && NETWORK_RPC_BY_ID[String(net.network_id)];
  if (!net || !net.gas || !privateKey || !rpcUrl) return;

  // Derive the deployer from the same key truffle-config uses, so the numbers are comparable.
  let address;
  let provider = null;
  try {
    const HDWalletProvider = require('@truffle/hdwallet-provider');
    provider = new HDWalletProvider({
      privateKeys: [privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`],
      providerOrUrl: rpcUrl,
    });
    [address] = await provider.getAddresses();
  } catch (e) {
    return; // cannot resolve the signer here — truffle will report the real error
  } finally {
    // This MUST always run: the provider keeps a polling interval that holds the event loop
    // open, so a leaked provider would hang the script after all the work was already done.
    if (provider && provider.engine && provider.engine.stop) provider.engine.stop();
  }

  let balance;
  let gasPrice;
  try {
    [balance, gasPrice] = await Promise.all([
      rpcCall(rpcUrl, 'eth_getBalance', [address, 'latest']),
      rpcCall(rpcUrl, 'eth_gasPrice', []),
    ]);
  } catch (e) {
    return; // RPC hiccup — let the deploy (and verifyDeployed) surface it
  }
  if (!balance || !gasPrice) return;

  const eth = (wei) => (Number(wei) / 1e18).toFixed(6);
  const gwei = (wei) => (Number(wei) / 1e9).toFixed(2);
  const reserved = BigInt(net.gas) * BigInt(gasPrice);
  // 25% headroom: truffle re-fetches eth_gasPrice when it builds the transaction, so a base
  // fee that rises in between would otherwise slip past this check and fail exactly as before.
  const needed = (reserved * 125n) / 100n;
  const summary =
    `gas ${Number(net.gas).toLocaleString()} x ${gwei(gasPrice)} gwei = ${eth(reserved)} ETH, ` +
    `${eth(needed)} ETH with 25% headroom`;

  if (BigInt(balance) < needed) {
    throw new Error(
      `The deployer ${address} holds only ${eth(balance)} ETH but this deploy needs roughly ` +
      `${eth(needed)} ETH (${summary}). Top the account up, or lower \`gas\` for the ` +
      `${CHAIN_NETWORK} network in truffle-config.js, then re-run.`,
    );
  }
  line(`✓ deployer funded: ${eth(balance)} ETH on hand vs ~${eth(needed)} ETH reserved (${summary})`);
};

// Deploys a brand-new HoneyChainCore so batchCount()/hiveCount()/beekeeperCount()
// restart at 0 — the ONLY way to clear records that already exist on-chain.
const redeployChain = async () => {
  const previousNetworks = JSON.parse(fs.readFileSync(CLIENT_ARTIFACT, 'utf8')).networks || {};

  line(`⚠ this spends a little testnet gas and changes the contract address on ${CHAIN_NETWORK}`);
  execFileSync('npx', ['truffle', 'migrate', '--reset', '--network', CHAIN_NETWORK], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // truffle's contracts_build_directory is the CLIENT artifact only, and --reset can
  // drop previously deployed networks (that silently broke local Ganache dev before).
  const artifact = JSON.parse(fs.readFileSync(CLIENT_ARTIFACT, 'utf8'));
  artifact.networks = artifact.networks || {};
  const missing = Object.entries(previousNetworks).filter(([id]) => !artifact.networks[id]);
  if (missing.length > 0) {
    missing.forEach(([id, net]) => {
      artifact.networks[id] = net;
    });
    fs.writeFileSync(CLIENT_ARTIFACT, JSON.stringify(artifact, null, 2), 'utf8');
    line(`✓ restored ${missing.length} previously deployed network entry(ies)`);
  }

  // Identify the freshly deployed network by DIFFING against the pre-migrate snapshot.
  // (truffle's per-network entries carry no `updatedAt`, so "newest" cannot be inferred
  // from a timestamp — doing so silently picked the first entry, i.e. old Ganache 1337.)
  const changed = Object.entries(artifact.networks).filter(
    ([id, net]) => !previousNetworks[id] || previousNetworks[id].address !== net.address,
  );
  if (changed.length !== 1) {
    throw new Error(
      `Expected exactly one newly deployed network, found ${changed.length}` +
      ` (${changed.map(([id]) => id).join(', ') || 'none'}). Aborting before any data is\n` +
      '  wiped — note the deploy may already have cost gas, and the artifact is left modified.',
    );
  }
  const [deployedId, deployed] = changed[0];
  await verifyDeployed(deployed.address, deployedId);

  // The relayer reads its OWN artifact copy. Without this it would keep submitting
  // transactions to the previous contract while the frontend reads the new one.
  fs.copyFileSync(CLIENT_ARTIFACT, SERVICE_ARTIFACT);
  line(`✓ new contract ${deployed.address} (network ${deployedId}) synced to the relayer artifact`);
};

const backendBase = () => REMOTE_URL.replace(/\/+$/, '');

// Because the backend URL is now a hardcoded default, a renamed or torn-down Render host
// can no longer be caught by "did the user pass a URL?". Probe it BEFORE anything is
// written, and refuse to run rather than produce a reset that silently does nothing.
const probeBackend = async () => {
  const base = backendBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let status = 0;
  let failure = null;
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    status = res.status;
  } catch (err) {
    failure = err.message;
  } finally {
    clearTimeout(timer);
  }
  // Distinguish "host down" from "host up but unhealthy" so the message is honest.
  if (failure || status < 200 || status >= 300) {
    throw new Error(
      `The live backend at ${base} is not usable (${failure || `HTTP ${status}`}). Aborting\n` +
      '  BEFORE anything is wiped: the client re-hydrates hives, batches, directory and POS\n' +
      '  records from the backend on the next page load, so a reset against a stale backend\n' +
      '  is undone. Fix the URL with --remote <url> or BACKEND_URL in .env.',
    );
  }
  line(`✓ live backend reachable at ${base}`);
};

// web3Utils.js owns the epoch purge — the one file whose COMMITTED state decides whether a
// reset actually wipes the browser. If it is uncommitted the user is mid-fix on that very
// logic, so pushing now would deploy a reset without their change.
const PURGE_OWNER = ['client/src/web3Utils.js'];

// Related to the same data, but deliberately NOT part of the reset commit (filesToCommit), so
// their dirtiness cannot change what gets deployed. Worth reporting, never worth blocking —
// otherwise any in-progress edit to RetailPOS would make every reset refuse for no reason.
const RESET_RELATED = [
  'client/src/hiveBatchRegistry.js',
  'client/src/entityRegistry.js',
  'client/src/applicationRegistry.js',
  'client/src/pages/RetailPOS.jsx',
];

// Read-only; returns the porcelain lines for the given paths ('' when clean). Never throws:
// "git is unavailable" must not block a reset that does not need git at all.
const gitDirty = (paths) => {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', ...paths], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch (e) {
    return '';
  }
};

const indent = (porcelain) => porcelain.split('\n').map((l) => `      ${l}`).join('\n');

const banner = () => {
  console.log('\n🧨  HoneyChain LIVE RESET (Vercel + Render fresh-testing reset)');
  console.log('   ' + '─'.repeat(58));
  if (DRY_RUN) console.log('   MODE: dry run — nothing will be written\n');
};

// Resets the running Render instance immediately instead of waiting for a redeploy.
// Returns whether the backend was ACTUALLY cleared, so the closing notes never claim
// success after a failed (or dry-run) call.
const resetLiveBackend = async () => {
  const base = backendBase();
  console.log('\n▶ Step 3: Clear the live backend memory store');
  line(`POST ${base}/api/admin/reset-data`);
  if (DRY_RUN) {
    line('✓ skipped (dry run)');
    return false;
  }
  try {
    const res = await fetch(`${base}/api/admin/reset-data`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    line('✓ live backend memory + JSON cleared immediately');
    return true;
  } catch (err) {
    line(`⚠ live backend reset failed (${err.message})`);
    return false;
  }
};

// Stages and commits ONLY the reset files, so unrelated work in the index never ships.
const commitAndPush = (files, message) => {
  const git = (args) => execFileSync('git', args, { cwd: ROOT, stdio: 'inherit' });
  git(['add', '--', ...files]);
  // Pathspec commit: anything else already staged by the user is left untouched.
  git(['commit', '-m', message, '--', ...files]);
  git(['push']);
};

const main = async () => {
  banner();

  // Checked before ANY write or deploy: a reset whose purge logic never reaches the deployed
  // bundle is a silent no-op, and unlike a backend-clear failure this is knowable up front —
  // so refuse BEFORE wiping anything, never after (a late refusal leaves a half-applied reset).
  const dirtyPurge = gitDirty(PURGE_OWNER);
  if (dirtyPurge) {
    if (PUSH && !DRY_RUN) {
      line('✗ Refusing to run: client/src/web3Utils.js (the localStorage purge) has uncommitted');
      line('  changes, so the deployed bundle would not contain the logic that makes this reset');
      line('  work — the app would keep showing old data:');
      console.log(indent(dirtyPurge));
      line('  Commit or stash it, then re-run.');
      process.exitCode = 1;
      console.log('');
      return;
    }
    line('⚠ client/src/web3Utils.js (the localStorage purge) has uncommitted changes — the reset');
    line('  will not include them. Commit it before you deploy:');
    console.log(indent(dirtyPurge));
  }

  // Not fatal: these are never part of the reset commit, so say so instead of blocking.
  const dirtyRelated = gitDirty(RESET_RELATED);
  if (dirtyRelated) {
    line('ℹ uncommitted work in reset-related files (NOT included in this reset commit):');
    console.log(indent(dirtyRelated));
  }

  // Verify the backend is reachable BEFORE anything is written or deployed.
  if (DRY_RUN) {
    line(`• dry run — would probe ${backendBase()}/health, then POST /api/admin/reset-data`);
    console.log('');
  } else {
    await probeBackend();
  }

  // ── 0. Optional: deploy a brand-new contract so the on-chain pipeline is empty
  if (CHAIN) {
    console.log('▶ Step 0: Deploy a fresh contract (clears on-chain hives/batches)');
    if (DRY_RUN) {
      line(`✓ skipped (dry run) — would run: npx truffle migrate --reset --network ${CHAIN_NETWORK}`);
    } else {
      try {
        await preflightDeployFunds();
        await redeployChain();
      } catch (err) {
        // The deploy runs BEFORE any wipe on purpose (never destroy data we cannot replace),
        // but that means a failed deploy leaves the app showing the previous test run. Say so
        // explicitly — otherwise this reads as "the reset did nothing".
        // execFileSync's message is multi-line, so keep only the first line for the summary.
        line(`✗ contract deploy failed: ${String(err?.message || err).split('\n')[0]}`);
        line('  The layers the app actually shows were NOT reset: the live backend/POS stores, the');
        line('  four datasets and the browser purge epoch are all untouched, so the app still shows');
        line('  the previous test run. (The contract artifact may have been rewritten by the partial');
        line('  deploy — check `git status` and restore it from git if so.)');
        line('  Fix the cause (the truffle output above has the real reason) and re-run this command.');
        // Already reported above in full — don't let main().catch print it a second time.
        if (err && typeof err === 'object') err.alreadyReported = true;
        throw err;
      }
    }
  }

  // ── 1. Bump resetEpoch so every browser purges its localStorage ─────────────
  console.log("▶ Step 1: Bump browser resetEpoch (forces every tester's localStorage to purge)");
  const clientArtifact = readArtifact(CLIENT_ARTIFACT);
  const newEpoch = String(Date.now());

  const clientPatch = patchResetEpoch(clientArtifact.raw, newEpoch);
  line(`old epoch: ${clientPatch.previous}`);
  line(`new epoch: ${newEpoch}`);

  const patches = [[CLIENT_ARTIFACT, clientPatch.next]];
  if (fs.existsSync(SERVICE_ARTIFACT)) {
    patches.push([SERVICE_ARTIFACT, patchResetEpoch(readArtifact(SERVICE_ARTIFACT).raw, newEpoch).next]);
  }
  if (!DRY_RUN) {
    // Validate everything first so a bad patch can never leave a half-applied reset.
    patches.forEach(([file, content]) => assertValidJson(file, content));
    patches.forEach(([file, content]) => fs.writeFileSync(file, content, 'utf8'));
  }
  line(`✓ resetEpoch ${DRY_RUN ? 'would be' : ''} stamped in ${patches.length} artifact(s)`);

  const keptNetworks = Object.entries(clientArtifact.json.networks || {})
    .map(([id, net]) => `${id}=${net && net.address}`)
    .join(', ');
  line(`✓ contract addresses kept intact (${keptNetworks || 'none'})`);

  // ── 2. Empty the backend datasets ───────────────────────────────────────────
  console.log('\n▶ Step 2: Empty the four backend datasets');
  DATA_FILES.forEach((file) => {
    const before = countEntries(file);
    if (!DRY_RUN) fs.writeFileSync(path.join(SERVICE_DIR, file), '[]\n', 'utf8');
    const summary = before === null ? 'unreadable/missing → 0' : `${before} entr${before === 1 ? 'y' : 'ies'} → 0`;
    line(`✓ ${file.padEnd(24)} ${summary}`);
  });

  // ── 3. Optionally clear the live Render instance right now ──────────────────
  const backendCleared = await resetLiveBackend();

  // ── 4. Commit & push so Vercel + Render rebuild fresh ───────────────────────
  const COMMIT_MSG = `chore(reset): fresh testing state — wipe datasets & bump resetEpoch to ${newEpoch}`;
  const filesToCommit = [
    'client/src/artifacts/HoneyChainCore.json',
    // truffle rewrites Migrations.json on every --chain redeploy; committing it keeps the
    // repo consistent with the chain that was actually deployed (otherwise it stays dirty).
    ...(CHAIN ? ['client/src/artifacts/Migrations.json'] : []),
    ...(fs.existsSync(SERVICE_ARTIFACT) ? ['hive-intelligence-service/HoneyChainCore.json'] : []),
    ...DATA_FILES.map((f) => `hive-intelligence-service/${f}`),
    // The reset must ship the tool + gas settings it depends on, or the next `--chain`
    // run silently fails against the old configuration.
    'scripts/reset-live.js',
    ...(CHAIN ? ['truffle-config.js'] : []),
  ];

  console.log('\n▶ Step 4: Deploy the reset (Vercel + Render rebuild)');
  if (PUSH && !DRY_RUN && !backendCleared) {
    // Never deploy a reset we already know is broken — it would be undone on first load.
    line('⚠ Refusing to push: the live backend was NOT cleared, so this reset is incomplete');
    line('  and would be undone the moment a tester opens the app. Fix the backend clear and');
    line('  re-run: npm run reset:live -- --push');
    process.exitCode = 1;
  } else if (PUSH && !DRY_RUN) {
    try {
      commitAndPush(filesToCommit, COMMIT_MSG);
      line('✓ pushed — Vercel (frontend) and Render (backend) will redeploy automatically');
    } catch (err) {
      line(`⚠ git step failed: ${err.message}`);
      line('  the reset files are written; fix the git error and re-run with --push');
      process.exitCode = 1;
    }
  } else {
    line('Run these three commands (or re-run this script with --push):');
    const quoted = filesToCommit.map((f) => `"${f}"`).join(' ');
    console.log('');
    console.log(`   git add -- ${quoted}`);
    console.log(`   git commit -m "${COMMIT_MSG}" -- ${quoted}`);
    console.log('   git push');
    console.log('');
    line('⚠ Only these reset files are committed — never `git add -A`, so unrelated');
    line('  in-progress work never ships. The reset tool itself (and truffle-config.js with');
    line('  --chain) is included, so the next reset runs on the same settings.');
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  console.log('\n📋 Notes for a truly fresh test run');
  if (DRY_RUN) {
    line('• Dry run only: no files were written and the backend was not called.');
  } else if (backendCleared) {
    line('• Live backend memory + POS bottle stores cleared.');
  } else {
    line('⚠ RESET INCOMPLETE: the live backend reset call did NOT succeed (see above). Its');
    line('  hives/batches/directory/POS records will be restored into the browser on the first');
    line('  page load. Fix that and re-run before treating this as a fresh state.');
    process.exitCode = 1;
  }
  if (!CHAIN) {
    line('• On-chain records from earlier runs still show up: the app enumerates every');
    line('  batch ever created, and authorized retailers/processors/labs are discovered by');
    line('  scanning role events from block 0 — so old store identities and branch names');
    line('  reappear even though the browser was purged.');
    line('  Add --chain for a genuinely empty pipeline:');
    line('    npm run reset:live -- --chain --push');
  }
  line('• After the Vercel build finishes, open the site in a NEW/incognito window (or hard');
  line('  refresh with Cmd+Shift+R) so the PWA service worker does not serve a stale bundle.');
  line('• Browser data purges itself on first load because resetEpoch changed — no manual');
  line('  "clear site data" needed.');
  console.log('');
};

main().catch((err) => {
  // Errors already printed with full context (e.g. the --chain deploy block) must not be
  // repeated here — a wall of duplicate text is what made the original failure unreadable.
  if (!err?.alreadyReported) console.error(`\n✗ Live reset failed: ${err?.message || err}\n`);
  process.exit(1);
});
