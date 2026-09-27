import Web3 from "web3";
import HoneyChainABI from "./artifacts/HoneyChainCore.json";
import { GANACHE_CHAIN_ID_HEX, GANACHE_RPC, SEPOLIA_CHAIN_ID_HEX, SEPOLIA_PUBLIC_RPC, API_BASE_URL } from "./config";

// Known admin addresses across local Ganache GUI, Ganache CLI, and Sepolia
export const KNOWN_ADMIN_ADDRESSES = [
  "0x556fce98dc5b75c5097eef0581bc17f771944ebb", // Sepolia Deployer / Admin
  "0xcfec0724613ea8d9be61672400396c4a4bdab4de", // Ganache GUI Account 0
  "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1", // Ganache CLI deterministic Account 0
];

// Resolves enterprise username or identifier to an on-chain address
export const resolveEnterpriseAddress = (identifier) => {
  if (!identifier) return "0x556FCE98dC5b75C5097eEf0581BC17f771944EbB";
  const clean = String(identifier).trim().toLowerCase();
  if (clean === "admin" || clean === "kvic")
    return "0x556FCE98dC5b75C5097eEf0581BC17f771944EbB";
  if (clean === "beekeeper")
    return "0x556FCE98dC5b75C5097eEf0581BC17f771944EbB";
  if (clean === "lab") return "0x556FCE98dC5b75C5097eEf0581BC17f771944EbB";
  if (clean === "processor")
    return "0x556FCE98dC5b75C5097eEf0581BC17f771944EbB";
  if (clean === "distributor")
    return "0x556FCE98dC5b75C5097eEf0581BC17f771944EbB";
  if (clean === "retailer") return "0x556FCE98dC5b75C5097eEf0581BC17f771944EbB";

  if (clean.startsWith("0x") && clean.length === 42) return clean;

  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash).toString(16).padStart(8, "0");
  return "0x" + seed.repeat(5).slice(0, 40);
};

// Helper to determine if an address has KVIC Admin rights
export const checkIsAdmin = async (contract, address) => {
  if (!address) return false;
  const cleanAddr = String(address).toLowerCase().trim();
  if (KNOWN_ADMIN_ADDRESSES.includes(cleanAddr)) return true;
  if (!contract) return false;

  try {
    if (contract.methods.kvicAdmin) {
      const onChainAdmin = await contract.methods
        .kvicAdmin()
        .call()
        .catch(() => "");
      if (onChainAdmin && onChainAdmin.toLowerCase().trim() === cleanAddr)
        return true;
    }
    if (contract.methods.checkIsAdmin) {
      const isAdm = await contract.methods
        .checkIsAdmin(cleanAddr)
        .call()
        .catch(() => false);
      if (isAdm) return true;
    }
    if (contract.methods.isKvicAdmin) {
      const isAdm2 = await contract.methods
        .isKvicAdmin(cleanAddr)
        .call()
        .catch(() => false);
      if (isAdm2) return true;
    }
  } catch (e) {
    console.warn("checkIsAdmin check error:", e);
  }
  return false;
};

// simple module-level cache so we're not re-instantiating on every call
let localWeb3 = null;
let readContract = null;
let deployedAddress = null;

// Simple in-memory response cache to make tab transitions smooth without hammering RPC
const memoryCache = new Map();

// Every storage key this app owns lives in one of these namespaces. Purging by
// PREFIX (instead of a hardcoded key allowlist) matters because several keys are
// built dynamically per batch — e.g. `honeychain_sold_<batchId>` and
// `honeychain_inwarded_<batchId>` written by RetailPOS. An allowlist silently
// leaves those behind, so old sales/inventory "resurrect" after a reset.
const OWNED_STORAGE_PREFIXES = ["honeychain", "hc_", "cached_"];

const isOwnedStorageKey = (key) =>
  OWNED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));

// A brand-new contract deployment or reset means every locally cached batch/hive/profile belongs to the
// PREVIOUS deployment. Purge them completely so ghost inventory, users, and beekeepers can never
// survive a reset/redeploy.
export const purgeLocalContractState = () => {
  if (typeof localStorage === "undefined") return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && isOwnedStorageKey(k)) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {
    console.warn("Local contract state purge warning:", e);
  }
};

// Detect reset epoch or new deployment to immediately wipe browser localStorage
if (typeof localStorage !== "undefined") {
  try {
    // This value must be something that actually CHANGES on a reset. A contract address
    // must never be used here: reset-live.js deliberately preserves addresses, so an
    // address-based epoch would be a constant and the purge would fire exactly once ever.
    const epoch = String(
      HoneyChainABI.resetEpoch ||
      HoneyChainABI.networks?.["1337"]?.transactionHash ||
      ""
    );
    if (!epoch) {
      console.warn(
        "[HoneyChain] No resetEpoch in the contract artifact — a reset/redeploy cannot be " +
          "detected and stale local data will persist. Run `npm run reset:live` to stamp one."
      );
    }
    const lastEpoch = localStorage.getItem("honeychain_reset_epoch");
    if (epoch && lastEpoch !== epoch) {
      purgeLocalContractState();
      localStorage.setItem("honeychain_reset_epoch", epoch);
    }
    // Also clean up any lingering RPC cache keys
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("hc_cache_") || k.startsWith("cached_"))) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

}

export const cachedCall = async (fnOrPromise, cacheKey, ttlMs = 1500) => {
  const now = Date.now();
  if (memoryCache.has(cacheKey)) {
    const entry = memoryCache.get(cacheKey);
    if (now - entry.timestamp < ttlMs) {
      return entry.data;
    }
  }

  try {
    const data =
      typeof fnOrPromise === "function"
        ? await fnOrPromise()
        : await fnOrPromise;
    memoryCache.set(cacheKey, { data, timestamp: now });
    return data;
  } catch (err) {
    // Stale-on-error: If network or RPC lags, serve existing cached data instead of failing
    if (memoryCache.has(cacheKey)) {
      return memoryCache.get(cacheKey).data;
    }
    throw err;
  }
};

export const clearWeb3Cache = () => {
  memoryCache.clear();
  if (typeof localStorage !== "undefined") {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("hc_cache_")) localStorage.removeItem(k);
      }
    } catch (e) {}
  }
};

export const invalidateContractCache = (keyPrefix) => {
  if (!keyPrefix) {
    clearWeb3Cache();
    return;
  }
  for (const k of memoryCache.keys()) {
    if (k.startsWith(keyPrefix)) {
      memoryCache.delete(k);
    }
  }
};

export const deepCleanLocalStorage = () => {
  purgeLocalContractState();
};

export const getTargetNetwork = () => {
  const sepoliaNet = HoneyChainABI.networks?.["11155111"];
  const ganacheNet =
    HoneyChainABI.networks?.["1337"] ||
    HoneyChainABI.networks?.["5777"];

  const preferSepolia =
    process.env.REACT_APP_CHAIN_ID === "11155111" ||
    (typeof window !== "undefined" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1");

  if (preferSepolia && sepoliaNet && sepoliaNet.address) {
    return {
      networkId: "11155111",
      chainIdHex: SEPOLIA_CHAIN_ID_HEX,
      name: "Ethereum Sepolia",
      rpcUrl: SEPOLIA_PUBLIC_RPC,
      net: sepoliaNet,
    };
  }

  if (ganacheNet && ganacheNet.address) {
    return {
      networkId: "1337",
      chainIdHex: GANACHE_CHAIN_ID_HEX,
      name: "HoneyChain Blockchain Engine",
      rpcUrl: GANACHE_RPC,
      net: ganacheNet,
    };
  }

  if (sepoliaNet && sepoliaNet.address) {
    return {
      networkId: "11155111",
      chainIdHex: SEPOLIA_CHAIN_ID_HEX,
      name: "Ethereum Sepolia",
      rpcUrl: SEPOLIA_PUBLIC_RPC,
      net: sepoliaNet,
    };
  }

  const fallback = Object.values(HoneyChainABI.networks || {})[0];
  if (fallback && fallback.address) {
    return {
      networkId: "1337",
      chainIdHex: GANACHE_CHAIN_ID_HEX,
      name: "Fallback Network",
      rpcUrl: GANACHE_RPC,
      net: fallback,
    };
  }

  return null;

};

export const getContractInstance = async () => {
  const target = getTargetNetwork();
  if (!target?.net?.address)
    throw new Error("Contract not deployed. Run: truffle migrate");

  if (!localWeb3 || deployedAddress !== target.net.address) {
    localWeb3 = new Web3(target.rpcUrl || GANACHE_RPC);
    readContract = new localWeb3.eth.Contract(
      HoneyChainABI.abi,
      target.net.address,
    );
    deployedAddress = target.net.address;

    if (typeof localStorage !== "undefined") {
      const lastAddr = localStorage.getItem("honeychain_last_contract_address");
      if (
        lastAddr &&
        lastAddr.toLowerCase() !== target.net.address.toLowerCase()
      ) {
        deepCleanLocalStorage();
        // The contract changed (e.g. after `npm run reset`) — drop every record that
        // belongs to the previous deployment instead of resurrecting ghost data.
        purgeLocalContractState();
      }
      localStorage.setItem(
        "honeychain_last_contract_address",
        target.net.address.toLowerCase(),
      );
    }
  }

  let writeContract = readContract;
  let userAccount = "";

  if (window.ethereum) {
    try {
      const userWeb3 = new Web3(window.ethereum);
      writeContract = new userWeb3.eth.Contract(
        HoneyChainABI.abi,
        target.net.address,
      );
      if (window.ethereum.selectedAddress) {
        userAccount = window.ethereum.selectedAddress;
      } else {
        const accounts = await window.ethereum
          .request({ method: "eth_accounts" })
          .catch(() => []);
        if (accounts?.length) userAccount = accounts[0];
      }
    } catch (e) {
      console.warn("Wallet not available for writes, using read-only provider");
    }
  }

  return {
    address: target.net.address,
    readContract,
    writeContract,
    userAccount,
    abi: HoneyChainABI.abi,
    targetNetwork: target,
  };
};

export const ensureCorrectNetwork = async () => {
  // Relayer gateway automatically interfaces with the correct blockchain node
  return true;
};

export const ensureSepoliaNetwork = ensureCorrectNetwork;
export const ensureGanacheNetwork = ensureCorrectNetwork;

// ---------------------------------------------------------------------------
// Direct on-chain fallback (no relayer gateway required)
// Mirrors the exact argument normalisation used by hive-intelligence-service/blockchainRelayer.js
// so the same payloads produce the same on-chain calls.
// ---------------------------------------------------------------------------
const isAddressLike = (value) => {
  try {
    return Boolean(value) && Web3.utils.isAddress(String(value));
  } catch (e) {
    return false;
  }
};

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
};

// Builds the equivalent contract method for a relayer endpoint (returns null if unmapped).
// May return { wallet, call } when the on-chain method needs a pre-resolved argument.
const buildDirectMethodCall = async (
  contract,
  endpoint,
  payload,
  from,
  web3,
) => {
  const p = payload || {};
  switch (endpoint) {
    case "register-beekeeper": {
      let wallet = isAddressLike(p.wallet)
        ? String(p.wallet)
        : web3.eth.accounts.create().address;
      // Mirror the relayer: never reuse an already-registered wallet (on-chain revert otherwise)
      const existingId = await contract.methods
        .beekeeperIdByWallet(wallet)
        .call()
        .catch(() => 0);
      if (toInt(existingId, 0) > 0) {
        wallet = web3.eth.accounts.create().address;
      }
      return {
        wallet,
        call: contract.methods.registerBeekeeper(
          wallet,
          p.name || "Certified Beekeeper",
          p.clusterLocation || "Kashmir Apiary",
          p.state || "Jammu & Kashmir",
          p.kvicRegNumber || `KVIC-${Date.now().toString().slice(-6)}`,
        ),
      };
    }
    case "register-hive":
      return contract.methods.registerSmartHive(
        toInt(p.beekeeperId, 1),
        p.boxIdentifier || `BOX-${Date.now()}`,
        toInt(p.flora, 0),
      );
    case "harvest":
      return contract.methods.harvestBatch(
        toInt(p.hiveId, 1),
        p.batchCode || `HONEY-${Date.now()}`,
        toInt(p.yieldWeightKg, 20),
        p.iotTelemetryHash || `IOT-HASH-${Date.now()}`,
      );
    case "certify-lab":
      return contract.methods.certifyLabPurity(
        toInt(p.batchId, 1),
        toInt(p.moisturePercentX100, 1780),
        toInt(p.c4SugarPercentX100, 0),
        toInt(p.pollenPurityScore, 95),
        p.antibioticFree !== false,
        p.labCertHash || `LAB-CERT-HASH-${Date.now()}`,
      );
    case "process-batch":
      return contract.methods.processBatch(
        toInt(p.batchId, 1),
        p.facilityLocation || "KVIC Central Processing Unit",
        isAddressLike(p.assignedDistributor)
          ? String(p.assignedDistributor)
          : from,
        isAddressLike(p.assignedRetailer) ? String(p.assignedRetailer) : from,
        p.targetDestination || "KVIC State Retail Store",
      );
    case "dispatch-batch":
      return contract.methods.dispatchBatch(
        toInt(p.batchId, 1),
        p.transitRoute || "Secure Temperature Controlled Route NH-44",
      );
    case "stock-retail":
      return contract.methods.stockAtRetail(
        toInt(p.batchId, 1),
        p.storeLocation || "KVIC Khadi Bhavan Flagship Store",
      );
    case "sell-bottle":
      return contract.methods.sellBottle(
        toInt(p.batchId, 1),
        toInt(p.bottleNumber, 1),
        p.customerName || "Verified Consumer",
        p.customerPhone || "9876543210",
        p.invoiceNumber || `INV-${Date.now()}`,
      );
    case "set-role": {
      // Never substitute the signer here — a bad address must fail loudly instead of
      // silently granting the role to whoever relays the transaction.
      if (!isAddressLike(p.entity)) {
        const inputErr = new Error(
          `Invalid entity address for role assignment: "${p.entity ?? ""}".`,
        );
        inputErr.isInputError = true;
        throw inputErr;
      }
      return contract.methods.setEntityRole(
        String(p.entity),
        p.role || "RETAILER",
        p.active !== false,
      );
    }
    default:
      return null;
  }
};

// Submits a real transaction straight to the chain when the relayer gateway is unreachable.
// Prefers the local node's unlocked authority account (same signer the relayer would use),
// then an injected wallet (MetaMask). Throws if no real transaction can be mined.
const sendDirectOnChain = async (endpoint, payload) => {
  const target = getTargetNetwork();
  if (!target?.net?.address) {
    throw new Error(
      "No deployed HoneyChainCore contract found in build artifacts. Run: truffle migrate",
    );
  }

  // Hard request timeout so a dead/slow RPC cannot hang the checkout spinner forever
  const nodeProvider = new Web3.providers.HttpProvider(
    target.rpcUrl || GANACHE_RPC,
    { timeout: 20000 },
  );
  const nodeWeb3 = new Web3(nodeProvider);
  let signerWeb3 = null;
  let from = "";
  let relayMode = "node-direct";

  const nodeAccounts = await nodeWeb3.eth.getAccounts().catch(() => []);
  if (nodeAccounts && nodeAccounts.length > 0) {
    signerWeb3 = nodeWeb3;
    from = nodeAccounts[0];
  } else if (typeof window !== "undefined" && window.ethereum) {
    const walletAccounts = await window.ethereum
      .request({ method: "eth_accounts" })
      .catch(() => []);
    if (walletAccounts && walletAccounts.length > 0) {
      signerWeb3 = new Web3(window.ethereum);
      from = walletAccounts[0];
      relayMode = "wallet-direct";
    }
  }

  if (!signerWeb3 || !from) {
    throw new Error(
      "No blockchain signer available. Start the local chain (npm run chain) or connect an unlocked wallet.",
    );
  }

  const signerContract = new signerWeb3.eth.Contract(
    HoneyChainABI.abi,
    target.net.address,
  );
  const built = await buildDirectMethodCall(
    signerContract,
    endpoint,
    payload,
    from,
    signerWeb3,
  );
  if (!built) {
    throw new Error(
      `No direct on-chain fallback is implemented for "${endpoint}".`,
    );
  }
  // NOTE: a web3 ContractMethod also exposes a truthy `.call` function, so unwrap by shape
  // (only the register-beekeeper resolver returns { wallet, call }).
  const methodCall = built.wallet ? built.call : built;

  let gas = 900000;
  try {
    const estimated = await methodCall.estimateGas({ from });
    gas = Math.floor(estimated * 1.35);
  } catch (e) {
    // On a wallet-provider path a failed estimate means the tx will almost certainly revert —
    // surface it instead of asking the user to approve a doomed transaction.
    if (relayMode === "wallet-direct") {
      throw new Error(`Transaction would fail on-chain: ${e.message}`);
    }
    console.warn(`Direct gas estimation failed for ${endpoint}: ${e.message}`);
  }

  const gasPrice = await signerWeb3.eth
    .getGasPrice()
    .catch(() => "20000000000");
  const receipt = await methodCall.send({ from, gas, gasPrice });

  // Resolve the newly created entity id so callers behave the same as they do via the gateway
  const idResult = {};
  try {
    if (endpoint === "register-beekeeper") {
      idResult.beekeeperId = toInt(
        await signerContract.methods.beekeeperCount().call(),
        0,
      );
    } else if (endpoint === "register-hive") {
      idResult.hiveId = toInt(
        await signerContract.methods.hiveCount().call(),
        0,
      );
    } else if (endpoint === "harvest") {
      idResult.batchId = toInt(
        await signerContract.methods.batchCount().call(),
        0,
      );
    }
  } catch (e) {
    console.warn(`Could not resolve resulting id for ${endpoint}:`, e.message);
  }

  return {
    success: true,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    from,
    contractAddress: target.net.address,
    relayMode,
    simulated: false,
    ...(built.wallet ? { wallet: built.wallet } : {}),
    ...idResult,
  };
};

// Call backend Blockchain Relayer to execute transactions seamlessly on-chain.
// If the gateway is unreachable, a REAL transaction is submitted directly to the chain.
// Success is only ever reported after a transaction hash is actually mined — never fabricated.
export const executeBlockchainRelayer = async (endpoint, payload) => {
  const url = `${API_BASE_URL}/api/blockchain/${endpoint}`;
  let gatewayError = null;

  try {
    const controller = new AbortController();
    // Allow up to 65 seconds for public Ethereum testnet transactions to mine
    const timeoutId = setTimeout(() => controller.abort(), 65000);
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await response.json().catch(() => ({
      success: false,
      error: `Invalid response from relayer gateway (HTTP ${response.status}).`,
    }));
    if (!response.ok || data.success === false) {
      throw new Error(
        data.error || `Blockchain transaction failed on ${endpoint}`,
      );
    }
    return {
      ...data,
      relayMode: data.relayMode || "gateway",
      simulated: false,
    };
  } catch (err) {
    gatewayError = err;
    console.warn(
      `Relayer gateway "${endpoint}" unavailable (${err.message}). Trying direct on-chain submission...`,
    );
  }

  try {
    const direct = await sendDirectOnChain(endpoint, payload);
    console.info(
      `Direct on-chain fallback succeeded for "${endpoint}" (tx: ${direct.transactionHash}).`,
    );
    return direct;
  } catch (fallbackErr) {
    console.error(
      `Direct on-chain fallback for "${endpoint}" failed:`,
      fallbackErr,
    );
    // Input-validation problems should surface as-is, not disguised as a gateway outage
    if (fallbackErr?.isInputError) throw fallbackErr;
    throw new Error(
      `Transaction was NOT recorded on the blockchain. ` +
        `Relayer gateway: ${gatewayError?.message || "unreachable"}. ` +
        `Direct chain submission: ${fallbackErr?.message || "failed"}.`,
    );
  }
};
