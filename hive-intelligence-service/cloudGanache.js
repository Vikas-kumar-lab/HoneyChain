const path = require('path');
const fs = require('fs');
const ganache = require('ganache');
const Web3 = require('web3');

class CloudGanacheEngine {
  constructor() {
    this.provider = null;
    this.web3 = null;
    this.contractAddress = null;
    this.isReady = false;
    this.init();
  }

  init() {
    const dbPath = path.join(__dirname, 'cloud_chain_data');

    this.provider = ganache.provider({
      wallet: {
        deterministic: true,
        defaultBalance: 1000,
        totalAccounts: 10
      },
      chain: {
        chainId: 1337,
        networkId: 1337
      },
      database: {
        dbPath: dbPath
      },
      miner: {
        blockTime: 0 // Instant mining (0ms)
      },
      logging: {
        quiet: true
      }
    });

    this.web3 = new Web3(this.provider);
    this.autoDeployContract();
  }

  async autoDeployContract() {
    try {
      let artifactPath = path.join(__dirname, 'HoneyChainCore.json');
      if (!fs.existsSync(artifactPath)) {
        artifactPath = path.join(__dirname, '../client/src/artifacts/HoneyChainCore.json');
      }
      if (!fs.existsSync(artifactPath)) {
        console.warn('[CloudGanache] HoneyChainCore artifact not found for auto-deploy.');
        this.isReady = true;
        return;
      }

      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const accounts = await this.web3.eth.getAccounts();
      const deployer = accounts[0];

      // Check if existing deployed address on 1337 has bytecode
      const existingAddr = artifact.networks?.['1337']?.address;
      if (existingAddr) {
        const code = await this.web3.eth.getCode(existingAddr);
        if (code && code !== '0x' && code !== '0x0') {
          this.contractAddress = existingAddr;
          this.isReady = true;
          console.log(`[CloudGanache] Reconnected to existing contract at: ${this.contractAddress}`);
          return;
        }
      }

      // Auto-deploy contract into Cloud Ganache in < 100ms
      console.log(`[CloudGanache] Auto-deploying HoneyChainCore from deployer: ${deployer}...`);
      const contractObj = new this.web3.eth.Contract(artifact.abi);
      const deployed = await contractObj.deploy({
        data: artifact.bytecode
      }).send({
        from: deployer,
        gas: 6721975,
        gasPrice: '20000000000'
      });

      this.contractAddress = deployed.options.address;
      this.isReady = true;
      console.log(`[CloudGanache] ⚡ Contract live at: ${this.contractAddress} (ChainId: 1337, Instant 0.01s Mining)`);

      // Update artifact network record for 1337
      artifact.networks = artifact.networks || {};
      artifact.networks['1337'] = {
        events: {},
        links: {},
        address: this.contractAddress
      };
      fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
      
      const clientPath = path.join(__dirname, '../client/src/artifacts/HoneyChainCore.json');
      if (fs.existsSync(clientPath) && clientPath !== artifactPath) {
        fs.writeFileSync(clientPath, JSON.stringify(artifact, null, 2), 'utf8');
      }
    } catch (err) {
      console.error('[CloudGanache] Auto-deploy warning:', err.message);
      this.isReady = true;
    }
  }

  // Handle incoming Ethereum JSON-RPC requests (e.g. from Web3 / MetaMask)
  handleRpcRequest(req, res) {
    const payload = req.body;
    if (!payload) {
      return res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
    }

    this.provider.send(payload, (err, response) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

      if (err) {
        return res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: err.message || 'Internal error' },
          id: payload.id || null
        });
      }
      res.json(response);
    });
  }
}

module.exports = new CloudGanacheEngine();
