const Web3 = require('web3');
const fs = require('fs');
const path = require('path');

class BlockchainRelayer {
  constructor() {
    this.isCloudGanache = process.env.USE_CLOUD_GANACHE === 'true' || process.env.CLOUD_GANACHE === 'true' || process.env.USE_GANACHE === 'true';

    if (this.isCloudGanache) {
      const cloudGanache = require('./cloudGanache');
      this.web3 = cloudGanache.web3;
      this.rpcUrl = 'Cloud Ganache Engine (Embedded 0.01s)';
    } else {
      this.rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8546';
      this.web3 = new Web3(this.rpcUrl);
    }
    
    // Deterministic Master KVIC Authority private key for relayer signing
    // Can be overridden via RELAYER_PRIVATE_KEY or PRIVATE_KEY in .env
    this.privateKey = process.env.RELAYER_PRIVATE_KEY || process.env.PRIVATE_KEY || '6000ec97987aa0fe00d3254b37fbf440d052da16bddffdb95a7c39f1106fb1b9';
    if (!this.privateKey.startsWith('0x')) {
      this.privateKey = '0x' + this.privateKey;
    }

    try {
      this.account = this.web3.eth.accounts.privateKeyToAccount(this.privateKey);
      this.web3.eth.accounts.wallet.add(this.account);
      this.web3.eth.defaultAccount = this.account.address;
    } catch (e) {
      console.warn('Relayer account init warning:', e.message);
    }

    this.contract = null;
    this.contractAddress = null;
    this.txQueue = Promise.resolve();
    this.activeTxPromise = null;
    this.loadContract();
  }

  queueTx(fn) {
    const next = this.txQueue.then(() => fn(), () => fn());
    this.txQueue = next;
    return next;
  }

  // Like sendTransaction but always waits for the full mined receipt.
  // Use for operations whose on-chain state must be confirmed before the next call.
  async sendTransactionAndWait(methodCall, retries = 6) {
    return this.queueTx(async () => {
      if (this.activeTxPromise) {
        try { await this.activeTxPromise; } catch (e) {}
        this.activeTxPromise = null;
      }
      return this._executeSendAndWait(methodCall, retries);
    });
  }

  async _executeSendAndWait(methodCall, retries = 6) {
    this.ensureReady();
    const from = await this.getAuthorityAccount();
    if (!from) throw new Error('No relayer authority wallet available to send transaction');

    let gas = 600000;
    try {
      const estimated = await methodCall.estimateGas({ from });
      gas = Math.floor(estimated * 1.3);
    } catch (e) {}

    let gasPrice = await this.web3.eth.getGasPrice().catch(() => '3000000000');
    try {
      const minGwei = this.web3.utils.toWei('3', 'gwei');
      gasPrice = BigInt(gasPrice) < BigInt(minGwei)
        ? minGwei
        : (BigInt(gasPrice) * BigInt(125) / BigInt(100)).toString();
    } catch (e) { gasPrice = '5000000000'; }

    const nonce = await this.web3.eth.getTransactionCount(from, 'pending');

    try {
      // Always await the full receipt — no early broadcast shortcut
      const receipt = await methodCall.send({ from, gas, gasPrice, nonce });
      if (!receipt || receipt.status === false) {
        throw new Error('Transaction reverted on chain (status=false)');
      }
      return {
        success: true,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        from,
        contractAddress: this.contractAddress
      };
    } catch (err) {
      if (err.message && (err.message.includes('in-flight') || err.message.includes('underpriced')) && retries > 0) {
        console.warn(`[Relayer] In-flight limit hit, waiting 4s... (${retries} retries remaining)`);
        await new Promise(r => setTimeout(r, 4000));
        return this._executeSendAndWait(methodCall, retries - 1);
      }
      throw err;
    }
  }

  loadContract() {
    try {
      let artifactPath = path.join(__dirname, '../client/src/artifacts/HoneyChainCore.json');
      if (!fs.existsSync(artifactPath)) {
        artifactPath = path.join(__dirname, 'HoneyChainCore.json');
      }
      if (!fs.existsSync(artifactPath)) return;
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

      if (this.isCloudGanache) {
        const cloudGanache = require('./cloudGanache');
        if (cloudGanache.contractAddress) {
          this.contractAddress = cloudGanache.contractAddress;
          this.contract = new this.web3.eth.Contract(artifact.abi, this.contractAddress);
          return;
        }
      }

      // Prioritize local Ganache network 1337, Sepolia 11155111, or CONTRACT_ADDRESS env var
      const net = artifact.networks['1337'] || artifact.networks['5777'] || artifact.networks['11155111'] || Object.values(artifact.networks || {})[0];
      const targetAddr = process.env.CONTRACT_ADDRESS || (net && net.address);
      if (targetAddr) {
        this.contractAddress = targetAddr;
        this.contract = new this.web3.eth.Contract(artifact.abi, targetAddr);
      }
    } catch (e) {
      console.warn('BlockchainRelayer: Could not load contract:', e.message);
    }
  }

  ensureReady() {
    if (!this.contract) this.loadContract();
    if (!this.contract) throw new Error('HoneyChainCore contract not initialized on relayer.');
    if (!this.account) throw new Error('Relayer authority wallet account not available.');
  }

  async getAuthorityAccount() {
    try {
      const accs = await this.web3.eth.getAccounts();
      if (accs && accs.length > 0) return accs[0];
    } catch (e) {}
    return this.account ? this.account.address : null;
  }

  async sendTransaction(methodCall, retries = 6) {
    return this.queueTx(async () => {
      // If a previous transaction is still mining on the public node, wait for it so in-flight limit is never hit!
      if (this.activeTxPromise) {
        try {
          await this.activeTxPromise;
        } catch (e) {}
        this.activeTxPromise = null;
      }
      return this._executeSend(methodCall, retries);
    });
  }

  async _executeSend(methodCall, retries = 6) {
    this.ensureReady();
    const from = await this.getAuthorityAccount();
    if (!from) throw new Error('No relayer authority wallet available to send transaction');
    
    if (this.isCloudGanache) {
      const receipt = await methodCall.send({
        from,
        gas: 600000,
        gasPrice: '20000000000'
      });
      return {
        success: true,
        transactionHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        from,
        contractAddress: this.contractAddress
      };
    }

    // Estimate gas or fallback safely
    let gas = 600000;
    try {
      const estimated = await methodCall.estimateGas({ from });
      gas = Math.floor(estimated * 1.3);
    } catch (e) {
      console.log('Gas estimation fallback to 600000:', e.message);
    }

    let gasPrice = await this.web3.eth.getGasPrice().catch(() => '3000000000');
    try {
      const minGwei = this.web3.utils.toWei('3', 'gwei');
      if (BigInt(gasPrice) < BigInt(minGwei)) {
        gasPrice = minGwei;
      } else {
        gasPrice = (BigInt(gasPrice) * BigInt(125) / BigInt(100)).toString();
      }
    } catch (e) {
      gasPrice = '5000000000';
    }

    // Always fetch pending nonce to prevent replacement transaction underpriced errors
    const nonce = await this.web3.eth.getTransactionCount(from, 'pending');

    try {
      return await new Promise((resolve, reject) => {
        const promi = methodCall.send({
          from,
          gas,
          gasPrice,
          nonce
        });

        this.activeTxPromise = promi;

        let resolved = false;
        let txHash = null;

        // ⚡ Sub-second lightning response on transactionHash
        promi.on('transactionHash', (hash) => {
          txHash = hash;
          setTimeout(() => {
            if (!resolved && txHash) {
              resolved = true;
              resolve({
                success: true,
                transactionHash: txHash,
                blockNumber: null,
                gasUsed: gas,
                from,
                status: 'broadcasted',
                contractAddress: this.contractAddress
              });
            }
          }, 1500);
        });

        promi.then((receipt) => {
          this.activeTxPromise = null;
          if (!resolved) {
            resolved = true;
            resolve({
              success: true,
              transactionHash: receipt.transactionHash,
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed,
              from,
              contractAddress: this.contractAddress
            });
          }
        }).catch((err) => {
          this.activeTxPromise = null;
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });
      });
    } catch (err) {
      if (err.message && (err.message.includes('in-flight') || err.message.includes('underpriced')) && retries > 0) {
        console.warn(`[Relayer] In-flight limit hit, auto-waiting 4s for previous block... (${retries} retries remaining)`);
        await new Promise(r => setTimeout(r, 4000));
        return this._executeSend(methodCall, retries - 1);
      }
      throw err;
    }
  }

  // 1. Register Beekeeper
  // IMPORTANT: Uses sendTransactionAndWait (not sendTransaction) so that
  // beekeeperCount() is read only AFTER the tx is mined. This prevents
  // registerSmartHive from firing with beekeeperId=0 and reverting.
  async registerBeekeeper({ wallet, name, clusterLocation, state, kvicRegNumber }) {
    this.ensureReady();
    let assignedWallet = wallet;
    if (!assignedWallet || !this.web3.utils.isAddress(assignedWallet)) {
      assignedWallet = this.web3.eth.accounts.create().address;
    } else {
      const lookupFn = this.contract.methods.beekeeperIdByWallet || this.contract.methods.beekeeperIdByAddress;
      const existingId = lookupFn ? await lookupFn(assignedWallet).call().catch(() => 0) : 0;
      if (parseInt(existingId) > 0) {
        assignedWallet = this.web3.eth.accounts.create().address;
      }
    }

    const call = this.contract.methods.registerBeekeeper(
      assignedWallet,
      name || 'Certified Beekeeper',
      clusterLocation || 'Kashmir Apiary',
      state || 'Jammu & Kashmir',
      kvicRegNumber || `KVIC-${Math.floor(1000 + Math.random() * 9000)}`
    );

    // Wait for full mining confirmation before reading beekeeperCount
    const result = await this.sendTransactionAndWait(call);
    const count = await this.contract.methods.beekeeperCount().call().catch(() => 1);
    const beekeeperId = parseInt(count);
    if (!beekeeperId || beekeeperId === 0) {
      throw new Error('Beekeeper registration mined but beekeeperCount is still 0 — contract state error.');
    }
    console.log(`[Relayer] Beekeeper registered on-chain. beekeeperId=${beekeeperId}`);
    return { ...result, beekeeperId };
  }

  // 2. Register Smart Hive Box
  async registerSmartHive({ beekeeperId, boxIdentifier, flora }) {
    this.ensureReady();
    const floraIdx = parseInt(flora) || 0;
    const call = this.contract.methods.registerSmartHive(
      parseInt(beekeeperId),
      boxIdentifier,
      floraIdx
    );
    const result = await this.sendTransaction(call);
    const count = await this.contract.methods.hiveCount().call().catch(() => 1);
    return { ...result, hiveId: parseInt(count) };
  }

  // 3. Harvest Batch
  async harvestBatch({ hiveId, batchCode, yieldWeightKg, iotTelemetryHash }) {
    this.ensureReady();
    const hId = parseInt(hiveId) || 1;
    const kg = parseInt(yieldWeightKg) || 20;
    const hash = iotTelemetryHash || `IOT-HASH-${Date.now()}`;
    
    const call = this.contract.methods.harvestBatch(hId, batchCode, kg, hash);
    const result = await this.sendTransaction(call);
    const count = await this.contract.methods.batchCount().call().catch(() => 1);
    return { ...result, batchId: parseInt(count) };
  }

  // 4. Certify Lab Purity
  async certifyLabPurity({ batchId, moisturePercentX100, c4SugarPercentX100, pollenPurityScore, antibioticFree, labCertHash }) {
    this.ensureReady();
    const bId = parseInt(batchId);
    const m = parseInt(moisturePercentX100) || 1780;
    const c4 = parseInt(c4SugarPercentX100) || 0;
    const p = parseInt(pollenPurityScore) || 95;
    const ab = Boolean(antibioticFree !== false);
    const hash = labCertHash || `LAB-CERT-HASH-${Date.now()}`;

    const call = this.contract.methods.certifyLabPurity(bId, m, c4, p, ab, hash);
    return await this.sendTransaction(call);
  }

  // 5. Process Batch
  async processBatch({ batchId, facilityLocation, assignedDistributor, assignedRetailer, targetDestination }) {
    this.ensureReady();
    const authority = await this.getAuthorityAccount();
    const bId = parseInt(batchId);
    const dist = assignedDistributor && this.web3.utils.isAddress(assignedDistributor)
      ? assignedDistributor
      : authority;
    const ret = assignedRetailer && this.web3.utils.isAddress(assignedRetailer)
      ? assignedRetailer
      : authority;

    const call = this.contract.methods.processBatch(
      bId,
      facilityLocation || 'KVIC Central Processing Unit',
      dist,
      ret,
      targetDestination || 'KVIC State Retail Store'
    );
    return await this.sendTransaction(call);
  }

  // 6. Dispatch Batch (Logistics)
  async dispatchBatch({ batchId, transitRoute }) {
    this.ensureReady();
    const bId = parseInt(batchId);
    const route = transitRoute || 'Secure Temperature Controlled Route NH-44';
    const call = this.contract.methods.dispatchBatch(bId, route);
    return await this.sendTransaction(call);
  }

  // 7. Stock At Retail (Inwarding)
  async stockAtRetail({ batchId, storeLocation }) {
    this.ensureReady();
    const bId = parseInt(batchId);
    const loc = storeLocation || 'KVIC Khadi Bhavan Flagship Store';
    const call = this.contract.methods.stockAtRetail(bId, loc);
    return await this.sendTransaction(call);
  }

  // 8. Sell Bottle (POS sale & customer e-bill lock)
  async sellBottle({ batchId, bottleNumber, customerName, customerPhone, invoiceNumber }) {
    this.ensureReady();
    const bId = parseInt(batchId);
    const bNum = parseInt(bottleNumber);
    const cName = customerName || 'Verified Consumer';
    const cPhone = customerPhone || '9876543210';
    const inv = invoiceNumber || `INV-${Date.now()}`;

    const call = this.contract.methods.sellBottle(bId, bNum, cName, cPhone, inv);
    return await this.sendTransactionAndWait(call);
  }

  // 9. Assign Entity Role
  async setEntityRole({ entity, role, active }) {
    this.ensureReady();
    const act = active !== false;
    let normRole = String(role || '').trim().toUpperCase();
    if (normRole.includes('LAB')) normRole = 'LAB';
    else if (normRole.includes('PROCESS')) normRole = 'PROCESSOR';
    else if (normRole.includes('DISTRIBUT')) normRole = 'DISTRIBUTOR';
    else if (normRole.includes('RETAIL')) normRole = 'RETAILER';
    const call = this.contract.methods.setEntityRole(entity, normRole, act);
    return await this.sendTransaction(call);
  }

  // 10. Read Contract Info
  getInfo() {
    return {
      relayerAddress: this.account ? this.account.address : null,
      contractAddress: this.contractAddress,
      network: 'Ganache Local (Isolated: 8546)',
      rpcUrl: this.rpcUrl
    };
  }
}

module.exports = new BlockchainRelayer();
