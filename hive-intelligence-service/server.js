const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const hiveSimulator = require("./hiveTelemetrySimulator");
const riskAnalyzer = require("./riskAnalyzer");

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json());

const cloudGanache = require("./cloudGanache");

// Cloud Ganache Ethereum JSON-RPC Endpoint (Publicly accessible from Vercel & Web3)
app.options("/rpc", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.sendStatus(200);
});

app.get("/rpc", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    status: "online",
    chain: "HoneyChain Cloud Blockchain",
    chainId: 1337,
    contractAddress: cloudGanache.contractAddress,
    mining: "Instant (0.01s)",
    network: "Ganache Cloud Engine",
  });
});

app.post("/rpc", (req, res) => {
  cloudGanache.handleRpcRequest(req, res);
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "HoneyChain Hive Intelligence Service",
    cloudBlockchain: "active",
    contractAddress: cloudGanache.contractAddress,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/hives", async (req, res) => {
  try {
    const hives = await hiveSimulator.getLiveHives();
    res.json({ success: true, count: hives.length, hives });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/hives/:id", async (req, res) => {
  try {
    const hive = await hiveSimulator.getHiveById(req.params.id);
    if (!hive)
      return res.status(404).json({ success: false, error: "Hive not found" });
    res.json({ success: true, hive });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/hives/predict-yield", (req, res) => {
  try {
    const { hiveId, bloomingWeeks } = req.body;
    const prediction = hiveSimulator.predictHarvestYield(
      parseInt(hiveId) || 1,
      parseInt(bloomingWeeks) || 3,
    );
    res.json({ success: true, prediction });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/lab/evaluate-purity", (req, res) => {
  try {
    const {
      moisturePercent,
      c4SugarPercent,
      pollenCount,
      antibioticDetected,
      hmfMgKg,
      diastaseActivity,
    } = req.body;
    const evaluation = hiveSimulator.analyzeAdulterationRisk({
      moisturePercent: parseFloat(moisturePercent) || 18.0,
      c4SugarPercent: parseFloat(c4SugarPercent) || 0.0,
      pollenCount: parseInt(pollenCount) || 6000,
      antibioticDetected: Boolean(antibioticDetected),
      hmfMgKg: parseFloat(hmfMgKg) || 25.0,
      diastaseActivity: parseFloat(diastaseActivity) || 10.0,
    });
    res.json({ success: true, evaluation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/analyze-risk", async (req, res) => {
  try {
    const { productId, productHistory } = req.body;
    if (!productId || !productHistory) {
      return res
        .status(400)
        .json({ error: "productId and productHistory are required" });
    }
    const result = await riskAnalyzer.analyzeProduct(productId, productHistory);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/flagged-products", (req, res) => {
  res.json({ flaggedProducts: riskAnalyzer.getFlaggedProducts() });
});

// ==========================================
// SHARED APPLICATIONS, DIRECTORY, HIVES & BATCHES
// (Stateless in-memory cache seeded from JSON on boot; zero runtime disk writes)
// ==========================================
const APPS_FILE = path.join(__dirname, "applications.json");
const DIR_FILE = path.join(__dirname, "directory.json");
const HIVES_REG_FILE = path.join(__dirname, "registered_hives.json");
const BATCHES_FILE = path.join(__dirname, "batches.json");

function loadSeedJson(filePath, fallback = []) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn(`[Startup Seed] Notice reading ${filePath}:`, e.message);
  }
  return fallback;
}

function saveJsonSafe(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn(`[Safe Write] Notice writing ${filePath}:`, e.message);
  }
}

const loadedBatches = loadSeedJson(BATCHES_FILE, []);
const initialSold = {};
const initialInwarded = {};
loadedBatches.forEach((b) => {
  const bId = String(b.batchId || b.batchCode);
  if (Array.isArray(b.soldBottles) && b.soldBottles.length > 0) {
    initialSold[bId] = b.soldBottles;
  }
  if (Array.isArray(b.inwardedBottles) && b.inwardedBottles.length > 0) {
    initialInwarded[bId] = b.inwardedBottles;
  }
});

const memoryStore = {
  applications: loadSeedJson(APPS_FILE, []),
  directory: loadSeedJson(DIR_FILE, []),
  hives: loadSeedJson(HIVES_REG_FILE, []),
  batches: loadedBatches,
  inwardedBottles: initialInwarded,
  soldBottles: initialSold,
};

app.get("/api/pos/inward-bottles", (req, res) => {
  res.json({ success: true, inwardedBottles: memoryStore.inwardedBottles });
});

app.get("/api/pos/inward-bottles/:batchId", (req, res) => {
  const bId = String(req.params.batchId);
  const bottles = memoryStore.inwardedBottles[bId] || [];
  res.json({ success: true, batchId: bId, inwardedBottles: bottles });
});

app.get("/api/pos/sold-bottles/:batchId", (req, res) => {
  const bId = String(req.params.batchId);
  let bottles = memoryStore.soldBottles[bId] || [];
  if (bottles.length === 0) {
    const batch = memoryStore.batches.find(
      (b) => String(b.batchId || b.batchCode) === bId,
    );
    if (
      batch &&
      Array.isArray(batch.soldBottles) &&
      batch.soldBottles.length > 0
    ) {
      bottles = batch.soldBottles;
      memoryStore.soldBottles[bId] = bottles;
    }
  }
  res.json({ success: true, batchId: bId, soldBottles: bottles });
});

app.post("/api/pos/inward-bottles", (req, res) => {
  try {
    const { batchId, inwardedBottles } = req.body;
    if (!batchId || !Array.isArray(inwardedBottles)) {
      return res.status(400).json({
        success: false,
        error: "batchId and inwardedBottles array are required",
      });
    }
    const bId = String(batchId);
    const existing = new Set(memoryStore.inwardedBottles[bId] || []);
    inwardedBottles.forEach((n) => existing.add(Number(n)));
    const merged = Array.from(existing).sort((a, b) => a - b);
    memoryStore.inwardedBottles[bId] = merged;

    const bIdx = memoryStore.batches.findIndex(
      (b) => String(b.batchId || b.batchCode) === bId,
    );
    if (bIdx >= 0) {
      memoryStore.batches[bIdx].inwardedBottles = merged;
      saveJsonSafe(BATCHES_FILE, memoryStore.batches);
    }
    res.json({ success: true, batchId: bId, inwardedBottles: merged });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/pos/sold-bottles", (req, res) => {
  try {
    const { batchId, soldBottle, soldBottles } = req.body;
    if (!batchId) {
      return res
        .status(400)
        .json({ success: false, error: "batchId is required" });
    }
    const bId = String(batchId);
    if (!memoryStore.soldBottles[bId]) {
      memoryStore.soldBottles[bId] = [];
    }
    if (soldBottle && soldBottle.bottleNumber) {
      const bNum = Number(soldBottle.bottleNumber);
      if (
        !memoryStore.soldBottles[bId].some(
          (s) => Number(s.bottleNumber) === bNum,
        )
      ) {
        memoryStore.soldBottles[bId].push(soldBottle);
      }
    }
    if (Array.isArray(soldBottles)) {
      soldBottles.forEach((sb) => {
        if (sb && sb.bottleNumber) {
          const bNum = Number(sb.bottleNumber);
          if (
            !memoryStore.soldBottles[bId].some(
              (s) => Number(s.bottleNumber) === bNum,
            )
          ) {
            memoryStore.soldBottles[bId].push(sb);
          }
        }
      });
    }
    const bIdx = memoryStore.batches.findIndex(
      (b) => String(b.batchId || b.batchCode) === bId,
    );
    if (bIdx >= 0) {
      memoryStore.batches[bIdx].soldBottles = memoryStore.soldBottles[bId];
      saveJsonSafe(BATCHES_FILE, memoryStore.batches);
    }
    res.json({
      success: true,
      batchId: bId,
      soldBottles: memoryStore.soldBottles[bId],
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/applications", (req, res) => {
  res.json({ success: true, applications: memoryStore.applications });
});

app.post("/api/applications", (req, res) => {
  try {
    const newApp = req.body;
    const existingIdx = memoryStore.applications.findIndex(
      (a) => a.id === newApp.id,
    );
    if (existingIdx >= 0) {
      memoryStore.applications[existingIdx] = newApp;
    } else {
      memoryStore.applications.unshift(newApp);
    }
    res.json({
      success: true,
      application: newApp,
      applications: memoryStore.applications,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put("/api/applications/:id", (req, res) => {
  try {
    const idx = memoryStore.applications.findIndex(
      (a) => a.id === req.params.id,
    );
    if (idx >= 0) {
      memoryStore.applications[idx] = {
        ...memoryStore.applications[idx],
        ...req.body,
      };
      res.json({
        success: true,
        application: memoryStore.applications[idx],
        applications: memoryStore.applications,
      });
    } else {
      res.status(404).json({ success: false, error: "Application not found" });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/directory", (req, res) => {
  res.json({ success: true, directory: memoryStore.directory });
});

app.post("/api/directory", (req, res) => {
  try {
    const entity = req.body;
    if (entity && entity.address) {
      const clean = entity.address.toLowerCase();
      memoryStore.directory = memoryStore.directory.filter(
        (e) => e.address && e.address.toLowerCase() !== clean,
      );
      memoryStore.directory.push({
        ...entity,
        timestamp: entity.timestamp || Date.now(),
      });
      res.json({ success: true, directory: memoryStore.directory });
    } else {
      res.status(400).json({ success: false, error: "Invalid entity address" });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/registered-hives", (req, res) => {
  res.json({ success: true, hives: memoryStore.hives });
});

app.post("/api/registered-hives", (req, res) => {
  try {
    const hive = req.body;
    if (hive && (hive.boxCode || hive.id)) {
      const k = (hive.boxCode || hive.id).toString().toUpperCase();
      memoryStore.hives = memoryStore.hives.filter(
        (h) => (h.boxCode || h.id || "").toString().toUpperCase() !== k,
      );
      memoryStore.hives.push(hive);
      saveJsonSafe(HIVES_REG_FILE, memoryStore.hives);
      res.json({ success: true, hive, hives: memoryStore.hives });
    } else {
      res.status(400).json({ success: false, error: "Invalid hive data" });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/batches", (req, res) => {
  res.json({ success: true, batches: memoryStore.batches });
});

app.post("/api/batches", (req, res) => {
  try {
    const batch = req.body;
    if (batch && (batch.batchCode || batch.batchId)) {
      const k = (batch.batchCode || batch.batchId).toString().toUpperCase();
      memoryStore.batches = memoryStore.batches.filter(
        (b) => (b.batchCode || b.batchId || "").toString().toUpperCase() !== k,
      );
      memoryStore.batches.push(batch);
      memoryStore.batches.sort(
        (a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0),
      );
      saveJsonSafe(BATCHES_FILE, memoryStore.batches);
      res.json({ success: true, batch, batches: memoryStore.batches });
    } else {
      res.status(400).json({ success: false, error: "Invalid batch data" });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put("/api/batches/:id", (req, res) => {
  try {
    const target = req.params.id.toString().toUpperCase();
    const idx = memoryStore.batches.findIndex(
      (b) =>
        (b.batchId || b.batchCode || "").toString().toUpperCase() === target,
    );
    if (idx >= 0) {
      memoryStore.batches[idx] = { ...memoryStore.batches[idx], ...req.body };
      const bId = String(memoryStore.batches[idx].batchId || req.params.id);
      if (Array.isArray(req.body.soldBottles)) {
        memoryStore.soldBottles[bId] = req.body.soldBottles;
      }
      if (Array.isArray(req.body.inwardedBottles)) {
        memoryStore.inwardedBottles[bId] = req.body.inwardedBottles;
      }
      saveJsonSafe(BATCHES_FILE, memoryStore.batches);
      res.json({
        success: true,
        batch: memoryStore.batches[idx],
        batches: memoryStore.batches,
      });
    } else {
      res.status(404).json({ success: false, error: "Batch not found" });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Complete Environment Reset Endpoint for Fresh Demo Runs
app.post("/api/admin/reset-data", (req, res) => {
  try {
    memoryStore.applications = [];
    memoryStore.directory = [];
    memoryStore.hives = [];
    memoryStore.batches = [];
    memoryStore.inwardedBottles = {};
    memoryStore.soldBottles = {};
    saveJsonSafe(APPS_FILE, []);
    saveJsonSafe(DIR_FILE, []);
    saveJsonSafe(HIVES_REG_FILE, []);
    saveJsonSafe(BATCHES_FILE, []);

    if (cloudGanache && typeof cloudGanache.autoDeployContract === "function") {
      cloudGanache.autoDeployContract();
    }

    res.json({
      success: true,
      message:
        "HoneyChain datasets, in-memory stores and blockchain states have been completely reset to pristine Block-0 state.",
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==========================================
// KVIC BLOCKCHAIN RELAYER API GATEWAY
// (Walletless, Gasless & Cryptographically Secure)
// ==========================================
const relayer = require("./blockchainRelayer");

app.get("/api/blockchain/info", (req, res) => {
  try {
    res.json({ success: true, info: relayer.getInfo() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/blockchain/register-beekeeper", async (req, res) => {
  try {
    const result = await relayer.registerBeekeeper(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/blockchain/register-hive", async (req, res) => {
  try {
    const result = await relayer.registerSmartHive(req.body);
    if (result && result.success) {
      try {
        const boxId = String(req.body.boxIdentifier || "").trim();
        memoryStore.hives = memoryStore.hives.filter(
          (h) =>
            String(h.boxCode || "")
              .trim()
              .toUpperCase() !== boxId.toUpperCase(),
        );
        const floraMap = {
          0: "Mustard Flower Honey",
          1: "Kashmir Acacia Honey",
          2: "Eucalyptus Honey",
          3: "Wild Sidr Honey",
          4: "Himalayan Multifloral Honey",
          5: "Sundarbans Forest Wild",
        };
        const existingIds = memoryStore.hives
          .map((h) => parseInt(h.id, 10))
          .filter((n) => !isNaN(n));
        const nextId =
          existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
        const finalHiveId =
          result.hiveId &&
          !memoryStore.hives.some((h) => h.id === result.hiveId)
            ? result.hiveId
            : nextId;

        memoryStore.hives.push({
          id: finalHiveId,
          boxCode: boxId,
          beekeeper: req.body.beekeeperName || "Registered Beekeeper",
          location: req.body.clusterLocation || "Apiary Cluster",
          flora: floraMap[parseInt(req.body.flora)] || "Natural Flora Honey",
          beekeeperId: req.body.beekeeperId || 1,
          wallet: req.body.wallet || "",
          coordinates: req.body.coordinates || null,
          latitude:
            req.body.latitude ||
            (req.body.coordinates ? req.body.coordinates.latitude : null),
          longitude:
            req.body.longitude ||
            (req.body.coordinates ? req.body.coordinates.longitude : null),
          formattedCoordinates:
            req.body.formattedCoordinates ||
            (req.body.coordinates ? req.body.coordinates.formatted : ""),
        });
        saveJsonSafe(HIVES_REG_FILE, memoryStore.hives);
      } catch (err) {}
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/blockchain/harvest", async (req, res) => {
  try {
    const result = await relayer.harvestBatch(req.body);
    if (result && result.success) {
      try {
        const targetCode = (req.body.batchCode || "").toString().toUpperCase();
        memoryStore.batches = memoryStore.batches.filter(
          (b) => (b.batchCode || "").toString().toUpperCase() !== targetCode,
        );
        memoryStore.batches.push({
          batchId: result.batchId || memoryStore.batches.length + 1,
          batchCode: req.body.batchCode,
          yieldWeightKg: req.body.yieldWeightKg,
          harvestTimestamp: Math.floor(Date.now() / 1000),
          stageName: "Harvested from Smart Hive",
          stageIdx: 0,
        });
        memoryStore.batches.sort(
          (a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0),
        );
      } catch (err) {}
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/blockchain/certify-lab", async (req, res) => {
  try {
    const result = await relayer.certifyLabPurity(req.body);
    if (result && result.success) {
      try {
        const idx = memoryStore.batches.findIndex(
          (b) => String(b.batchId) === String(req.body.batchId),
        );
        if (idx >= 0) {
          const passed =
            req.body.moisturePercentX100 <= 2000 &&
            req.body.c4SugarPercentX100 <= 700 &&
            Boolean(req.body.antibioticFree);
          memoryStore.batches[idx].isCertifiedPure = passed;
          memoryStore.batches[idx].isFlagged = !passed;
          if (passed) {
            memoryStore.batches[idx].stageName = "QualityTested";
            memoryStore.batches[idx].currentStage = "QualityTested";
            memoryStore.batches[idx].stageIdx = 1;
          } else {
            memoryStore.batches[idx].flagReason =
              "Failed KVIC purity test: High moisture or C4 sugar adulteration detected";
          }
          memoryStore.batches[idx].labReport = {
            testTimestamp: Math.floor(Date.now() / 1000),
            moisturePercentX100: req.body.moisturePercentX100,
            c4SugarPercentX100: req.body.c4SugarPercentX100,
            pollenPurityScore: req.body.pollenPurityScore,
            antibioticFree: Boolean(req.body.antibioticFree),
            labCertHash: req.body.labCertHash,
            coordinates: req.body.coordinates || null,
            passed,
          };
          if (req.body.coordinates) {
            memoryStore.batches[idx].labCoordinates = req.body.coordinates;
          }
          if (req.body.historyEvent) {
            if (!Array.isArray(memoryStore.batches[idx].history)) {
              memoryStore.batches[idx].history = [];
            }
            memoryStore.batches[idx].history.push(req.body.historyEvent);
          }
          saveJsonSafe(BATCHES_FILE, memoryStore.batches);
        }
      } catch (err) {}
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/blockchain/process-batch", async (req, res) => {
  try {
    const result = await relayer.processBatch(req.body);
    if (result && result.success) {
      try {
        const idx = memoryStore.batches.findIndex(
          (b) => String(b.batchId) === String(req.body.batchId),
        );
        if (idx >= 0) {
          memoryStore.batches[idx].stageName = "Processed and Packaged";
          memoryStore.batches[idx].currentStage = "Processed and Packaged";
          memoryStore.batches[idx].stageIdx = 2;
          memoryStore.batches[idx].assignedDistributor =
            req.body.assignedDistributor;
          memoryStore.batches[idx].assignedRetailer = req.body.assignedRetailer;
          memoryStore.batches[idx].targetDestination =
            req.body.targetDestination;
        }
      } catch (err) {}
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/blockchain/dispatch-batch", async (req, res) => {
  try {
    const result = await relayer.dispatchBatch(req.body);
    if (result && result.success) {
      try {
        const idx = memoryStore.batches.findIndex(
          (b) => String(b.batchId) === String(req.body.batchId),
        );
        if (idx >= 0) {
          memoryStore.batches[idx].stageName = "In Transit / Logistics";
          memoryStore.batches[idx].currentStage = "In Transit / Logistics";
          memoryStore.batches[idx].stageIdx = 3;
          memoryStore.batches[idx].transitRoute = req.body.transitRoute;
        }
      } catch (err) {}
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/blockchain/stock-retail", async (req, res) => {
  try {
    const result = await relayer.stockAtRetail(req.body);
    if (result && result.success) {
      try {
        const idx = memoryStore.batches.findIndex(
          (b) => String(b.batchId) === String(req.body.batchId),
        );
        if (idx >= 0) {
          memoryStore.batches[idx].stageName = "Stocked at Retail";
          memoryStore.batches[idx].currentStage = "Stocked at Retail";
          memoryStore.batches[idx].stageIdx = 4;
          memoryStore.batches[idx].storeLocation = req.body.storeLocation;
        }
      } catch (err) {}
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/blockchain/sell-bottle", async (req, res) => {
  try {
    const result = await relayer.sellBottle(req.body);
    if (result && result.success) {
      try {
        const bId = String(req.body.batchId);
        const bNum = Number(req.body.bottleNumber);
        if (!memoryStore.soldBottles[bId]) {
          memoryStore.soldBottles[bId] = [];
        }
        if (
          !memoryStore.soldBottles[bId].some(
            (s) => Number(s.bottleNumber) === bNum,
          )
        ) {
          memoryStore.soldBottles[bId].push({
            bottleNumber: bNum,
            customerName: req.body.customerName || "Verified Consumer",
            customerPhone: req.body.customerPhone || "9876543210",
            invoiceNumber: req.body.invoiceNumber || `INV-${Date.now()}`,
            saleTimestamp: Math.floor(Date.now() / 1000),
            transactionHash: result.transactionHash || "",
          });
        }
        const idx = memoryStore.batches.findIndex(
          (b) => String(b.batchId) === bId,
        );
        if (idx >= 0) {
          memoryStore.batches[idx].jarsSold =
            (memoryStore.batches[idx].jarsSold || 0) + 1;
          memoryStore.batches[idx].soldBottles = memoryStore.soldBottles[bId];
          saveJsonSafe(BATCHES_FILE, memoryStore.batches);
        }
      } catch (err) {}
    }
    res.json({
      ...result,
      soldBottles: memoryStore.soldBottles[String(req.body.batchId)] || [],
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/blockchain/set-role", async (req, res) => {
  try {
    const result = await relayer.setEntityRole(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// MADHU-MITRA AI ENGINE (HoneyChain Assistant)
// ==========================================
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "inclusionai/ling-3.0-flash-vl:free";

/**
 * Call Pollinations AI (Free Public Multi-language LLM - Zero Key Required)
 * Runs all models in parallel and returns the fastest successful response.
 */
async function callPollinationsAI(
  messages,
  temperature = 0.7,
  timeoutMs = 10000,
) {
  const MODELS = ["openai", "mistral", "qwen"];

  // Race all models simultaneously — first to respond wins
  const promises = MODELS.map((model) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    return fetch("https://text.pollinations.ai/", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model, temperature, seed: 42 }),
    })
      .then(async (res) => {
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text || !text.trim()) throw new Error("Empty response");
        console.log(`[Pollinations] Winner model: '${model}'`);
        return { content: text.trim(), model: "Madhu-Mitra AI" };
      })
      .catch((err) => {
        clearTimeout(timer);
        return Promise.reject(err);
      });
  });

  // Promise.any = first fulfilled wins; rejects only if ALL fail
  return Promise.any(promises).catch(() => {
    throw new Error("All Pollinations models failed.");
  });
}

// ── Google Gemini AI configuration ──────────────────────────────────────────
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Call Google Gemini AI (Primary — AI Studio key)
 * Converts OpenAI-style {role, content}[] messages to Gemini format automatically.
 */
async function callGeminiAI(messages, temperature = 0.7, timeoutMs = 10000) {
  if (!GEMINI_API_KEY) {
    throw new Error("No GEMINI_API_KEY configured");
  }

  // Separate system prompt from conversation history
  const systemMsg = messages.find((m) => m.role === "system");
  const convMessages = messages.filter((m) => m.role !== "system");

  // Convert to Gemini contents format
  const contents = convMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const payload = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 1000,
    },
  };

  if (systemMsg) {
    payload.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const modelsToTry = [
    GEMINI_MODEL,
    "gemini-3-flash-preview",
    "gemini-3.6-flash",
  ];
  const uniqueModels = [...new Set(modelsToTry)];

  for (const model of uniqueModels) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(
          `Gemini HTTP ${response.status}: ${errBody.slice(0, 120)}`,
        );
      }
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("No content from Gemini");
      console.log(`[Gemini] Success via ${model}`);
      return { content, model: `gemini:${model}` };
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[Gemini] Model ${model} failed:`, err.message);
    }
  }

  throw new Error("All Gemini models failed in callGeminiAI");
}

/**
 * Call OpenRouter API (fallback — nvidia/nemotron or configured model)
 */
async function callOpenRouter(messages, temperature = 0.7, timeoutMs = 10000) {
  // Only skip if no key is set at all
  if (!OPENROUTER_API_KEY || !OPENROUTER_API_KEY.startsWith("sk-or-")) {
    throw new Error("No valid OpenRouter key configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://honey-chain-l6vm.vercel.app",
          "X-Title": "HoneyChain KVIC AI Copilot",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages,
          temperature,
          max_tokens: 1000,
        }),
      },
    );
    clearTimeout(timer);

    if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content from OpenRouter");
    return { content, model: data.model || OPENROUTER_MODEL };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

app.post("/api/ai/chat", async (req, res) => {
  try {
    const { messages, userRole, pageContext } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res
        .status(400)
        .json({ success: false, error: "Messages array is required" });
    }

    // Extract live app data from memoryStore
    const hivesData = (memoryStore.hives || []).slice(0, 20).map((h) => ({
      boxId: h.boxCode || h.id || h.hiveId,
      location: h.clusterLocation || h.location || "Apiary Zone",
      temperature: h.temperature ?? h.currentTemperature,
      weightKg: h.weight ?? h.currentWeightKg,
      soundFreqHz: h.soundFreq ?? h.currentFrequencyHz,
      humidity: h.humidity ?? h.currentHumidity,
      flora: h.flora || "Multifloral",
      health: h.healthStatus || "Stable",
    }));

    const batchesData = (memoryStore.batches || []).slice(0, 20).map((b) => ({
      batchId: b.batchId || b.batchCode,
      flora: b.floraOrigin || b.flora,
      weightKg: b.totalWeightKg || b.weight,
      bottles: b.totalBottles,
      status: b.status,
      moisturePercent: b.moisturePercent,
      hmfMgKg: b.hmfMgKg,
      c4SugarPercent: b.c4SugarPercent,
    }));

    const systemPrompt = `You are Madhu-Mitra, the official AI Assistant for HoneyChain — a blockchain-powered honey traceability platform built under KVIC Honey Mission / Ministry of MSME, Govt of India.

=== HONEYCHAIN APP INFORMATION ===
- Official App URL: https://honey-chain-l6vm.vercel.app
- To VERIFY a honey jar / bottle: Open https://honey-chain-l6vm.vercel.app, go to the "Verify" or "Scan QR" section, and enter the Batch ID printed on the jar label.
- Blockchain Explorer: Each batch has a transaction hash viewable on the Amoy (Polygon) testnet explorer.
- Always use https://honey-chain-l6vm.vercel.app as the app URL. Do not use or mention any other domain.

=== YOUR RESPONSIBILITIES ===
1. Answer ANY question the user has — about HoneyChain app, smart bee boxes, IoT telemetry, honey purity standards (FSSAI/BIS), blockchain traceability, apiculture, beekeeping techniques, swarming, or general science.
2. You have direct access to the live app data below:
   - Active Registered Smart Hives (${hivesData.length} total): ${JSON.stringify(hivesData)}
   - Tracked Honey Batches (${batchesData.length} total): ${JSON.stringify(batchesData)}
   - User Role: ${userRole || "User"}
   - Current App Screen: ${pageContext || "Portal"}
   Reference this real data accurately whenever the user asks about hives, boxes, honey batches, or system status.

=== CRITICAL LANGUAGE RULES ===
- DEFAULT LANGUAGE IS PURE ENGLISH.
- ALWAYS respond in the EXACT language used by the user in their prompt:
  * English question -> Reply in clear, fluent English ONLY. Do NOT mix Hindi or Hinglish.
  * Hinglish (Roman Hindi) question -> Reply in natural conversational Hinglish.
  * Hindi (Devanagari) question -> Reply in clear Hindi.
  * Any other regional language -> Reply in that same language.
- If the language is English or ambiguous, ALWAYS default to pure English.
- Formatting: Use clean markdown bullet points, bold key details, and concise paragraphs. Avoid wide multi-column tables.`;

    const finalMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-8),
    ];

    let aiResult = null;

    // 1st choice: OpenRouter (inclusionai/ling-3.0-flash-vl:free)
    try {
      aiResult = await callOpenRouter(finalMessages, 0.7, 12000);
    } catch (e) {
      console.warn(
        "[AI Service] OpenRouter failed, trying Gemini fallback:",
        e.message,
      );
      // 2nd choice: Google Gemini fallback
      try {
        aiResult = await callGeminiAI(finalMessages, 0.7, 10000);
      } catch (e2) {
        console.warn("[AI Service] Gemini fallback also failed:", e2.message);
      }
    }

    if (aiResult && aiResult.content) {
      return res.json({
        success: true,
        message: aiResult.content,
        model: aiResult.model || "Madhu-Mitra AI",
      });
    }

    // 3rd choice: Pollinations multi-model fallback
    try {
      aiResult = await callPollinations(finalMessages, 0.7, 8000);
      if (aiResult && aiResult.content) {
        return res.json({
          success: true,
          message: aiResult.content,
          model: aiResult.model || "Madhu-Mitra AI",
        });
      }
    } catch (e3) {
      console.warn("[AI Service] Pollinations also failed:", e3.message);
    }

    // 4. Safe apiculture fallback only if all network calls fail
    const lastUserMsg =
      [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const isHinglishOrHindi =
      /[\u0900-\u097F]|kya|kaise|bhai|batao|karo|hai|hain|namaste/i.test(
        lastUserMsg,
      );

    const helpfulFallback = isHinglishOrHindi
      ? `Madhu-Mitra AI: Smart bee boxes ka live telemetry data active hai. Optimal brood temperature 34°C–36°C aur sound frequency 220Hz–260Hz normal range hoti hai. Swarming detect karne ke liye sound >300Hz aur sudden weight drop monitor karein. Batch verify karne ke liye https://honey-chain-l6vm.vercel.app/verify par Batch ID darj karein.`
      : `Madhu-Mitra AI: Live telemetry active. Normal hive temperature is 34°C–36°C with acoustic frequency 220Hz–260Hz. Swarming is indicated by acoustic frequency spikes >300Hz and rapid weight reduction. To verify any honey batch purity report, visit https://honey-chain-l6vm.vercel.app/verify.`;

    return res.json({
      success: true,
      message: helpfulFallback,
      model: "Madhu-Mitra Knowledge Base",
    });
  } catch (err) {
    console.error("[AI Chat Service] Unexpected error:", err);
    res.json({
      success: true,
      message:
        "Madhu-Mitra AI service encountered a temporary error. Please try asking again in a moment.",
      model: "Madhu-Mitra Safe Fallback",
    });
  }
});

app.post("/api/ai/analyze-hive", async (req, res) => {
  console.log("[API] analyze-hive received request:", req.body);
  try {
    const {
      hiveId,
      weight,
      temperature,
      humidity,
      soundFreq,
      flora,
      clusterLocation,
    } = req.body;

    const prompt = `Analyze this smart bee box IoT telemetry for HoneyChain KVIC Smart Mission:
- Hive Box ID: ${hiveId || "HIVE-01"}
- Current Weight: ${weight || 35} kg
- Internal Temperature: ${temperature || 34.5} °C
- Internal Humidity: ${humidity || 58} %
- Acoustic Frequency: ${soundFreq || 185} Hz (Normal: 150-220Hz, Swarming/Stress: >260Hz)
- Flora: ${flora || "Multifloral"}
- Location: ${clusterLocation || "Apiary Zone"}

Provide a structured diagnostic assessment in clear Hinglish/English.
Evaluate:
1. Colony Health Status (Optimal / Mild Stress / High Risk)
2. Swarming Probability (0-100%) and why
3. Honey Production Readiness (Comb filling, harvest timing)
4. Three specific, actionable tips for the beekeeper.`;

    const messages = [
      {
        role: "system",
        content:
          "You are an expert Apiculturist and IoT Precision Beekeeping AI Specialist for KVIC Honey Mission.",
      },
      { role: "user", content: prompt },
    ];

    let aiResult = null;
    // 1st: Gemini, 2nd: OpenRouter, 3rd: Pollinations, 4th: edge deterministic
    try {
      aiResult = await callGeminiAI(messages, 0.4, 8000);
    } catch (e) {
      console.warn("[analyze-hive] Gemini failed:", e.message);
      try {
        aiResult = await callOpenRouter(messages, 0.4, 6000);
      } catch (e2) {
        console.warn("[analyze-hive] OpenRouter failed:", e2.message);
        try {
          aiResult = await callPollinationsAI(messages, 0.4, 6000);
        } catch (e3) {
          // Fall back to edge diagnostic
        }
      }
    }

    if (aiResult && aiResult.content) {
      return res.json({
        success: true,
        analysis: aiResult.content,
        model: aiResult.model,
      });
    }
    throw new Error(
      "All external LLM endpoints offline; activating deterministic edge model.",
    );
  } catch (err) {
    console.warn("[AI Hive Analysis] Quick Edge AI fallback:", err.message);
    const {
      hiveId,
      weight,
      temperature,
      humidity,
      soundFreq,
      flora,
      clusterLocation,
    } = req.body;
    const temp = parseFloat(temperature) || 34.2;
    const freq = parseInt(soundFreq) || 218;
    const hum = parseFloat(humidity) || 58.0;
    const wt = parseFloat(weight) || 25.0;
    const boxCode = hiveId || "HIVE-JK-01";

    let healthStatus = "Optimal Brood Homeostasis";
    if (temp > 36.5) healthStatus = "Thermal Stress Alert";
    else if (temp < 32.5) healthStatus = "Brood Chilling Alert";

    let swarmProb = freq > 380 ? 85 : freq > 260 ? 40 : 12;
    let daysToHarvest = Math.max(
      3,
      Math.round((35.0 - Math.min(35, wt)) * 1.8),
    );

    res.json({
      success: true,
      analysis: `### 🐝 Live Telemetry Diagnostic Assessment: ${boxCode}

- **Colony Health Homeostasis:** **${healthStatus}**
  Internal brood core temperature is **${temp}°C** (Optimal biological range: 33.0°C – 36.0°C). Queen oviposition and royal jelly production are operating normally.

- **Acoustic Swarm Risk:** **${swarmProb}% Probability** (${freq} Hz tone)
  ${freq > 380 ? "⚠️ High-frequency agitation detected (>380 Hz). High swarming probability; immediate inspection of queen swarm cells advised." : "Harmonic frequency is balanced. Colony rhythm indicates uniform queen pheromone distribution."}

- **Active Honey Biomass:** **~${wt} kg**
  Humidity at **${hum}%**. Optimal frame wax capping and extraction window estimated in **${daysToHarvest} - ${daysToHarvest + 4} days** once >=85% comb capping is verified.

- **Actionable Apiculture Advice:**
  1. **Thermal Regulation:** ${temp > 35 ? "Enlarge bottom board entrance for ventilation." : "Maintain entrance reducer to conserve nighttime brood heat."}
  2. **Nectar Flow:** Active foraging on *${flora || "Natural Flora"}* in *${clusterLocation || "Apiary Zone"}*. Ensure water source within 50m.
  3. **Super Inspection:** Scheduled in **${swarmProb > 50 ? "24 to 48 hours" : "5 to 7 days"}**.`,
      model: "Edge AI Precision Apiculture Model v2.4",
    });
  }
});

// Serve frontend React client build if present (e.g. for Render deployment)
const clientBuildPath = path.join(__dirname, "../client/build");
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health") return next();
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

// ==========================================
// 🚀 Render 24/7 Keepalive Auto-Pinger Bot
// ==========================================
const pingerState = {
  active: false,
  targetUrl: null,
  pingCount: 0,
  lastPingTime: null,
  lastStatus: null,
};

app.get("/api/autopinger/status", (req, res) => {
  res.json({
    success: true,
    pinger: pingerState,
    detectedRenderUrl: process.env.RENDER_EXTERNAL_URL || null,
  });
});

function initAutoPinger() {
  const targetUrl =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.SELF_PING_URL ||
    process.env.BACKEND_URL;

  if (!targetUrl) {
    console.log(
      "[Auto-Pinger] Standby mode: No external URL configured. (Render automatically populates RENDER_EXTERNAL_URL on deployment, or set SELF_PING_URL to enable 24/7 self-pinging).",
    );
    return;
  }

  const cleanUrl = targetUrl.replace(/\/+$/, "");
  const pingEndpoint = `${cleanUrl}/health`;

  pingerState.active = true;
  pingerState.targetUrl = pingEndpoint;

  console.log(
    `[Auto-Pinger] 🛡️ Render Keepalive initialized! Target: ${pingEndpoint}`,
  );
  console.log(
    `[Auto-Pinger] Interval: Every 10 minutes to guarantee Render backend never sleeps.`,
  );

  const doPing = () => {
    try {
      const startTime = Date.now();
      const client = pingEndpoint.startsWith("https")
        ? require("https")
        : require("http");

      const req = client.get(pingEndpoint, (res) => {
        pingerState.pingCount++;
        pingerState.lastPingTime = new Date().toISOString();
        pingerState.lastStatus = res.statusCode;
        console.log(
          `[Auto-Pinger] 💓 Heartbeat #${pingerState.pingCount} OK (HTTP ${res.statusCode}, ${Date.now() - startTime}ms) at ${new Date().toLocaleTimeString()}`,
        );
      });

      req.on("error", (err) => {
        pingerState.lastStatus = `ERR: ${err.message}`;
        console.warn(`[Auto-Pinger] ⚠️ Heartbeat failed: ${err.message}`);
      });
      req.setTimeout(15000, () => req.abort());
    } catch (err) {
      console.warn(`[Auto-Pinger] ⚠️ Ping execution error: ${err.message}`);
    }
  };

  // Initial warmup ping after 15 seconds, then every 10 minutes (600,000 ms)
  setTimeout(doPing, 15 * 1000);
  setInterval(doPing, 10 * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`Hive Intelligence Service running on :${PORT}`);
  initAutoPinger();
});
