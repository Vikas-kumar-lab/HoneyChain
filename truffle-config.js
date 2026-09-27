require('dotenv').config();

const path = require('path');

const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  contracts_directory: path.join(__dirname, 'contracts'),
  migrations_directory: path.join(__dirname, 'migrations'),
  contracts_build_directory: path.join(__dirname, 'client/src/artifacts'),

  networks: {
    development: {
      host: '127.0.0.1',
      port: 8546,
      network_id: 1337,
    },
    sepolia: {
      provider: () => {
        const privateKey = process.env.RELAYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
        const rpcUrl = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
        if (!privateKey) {
          throw new Error('RELAYER_PRIVATE_KEY or PRIVATE_KEY must be set in .env to deploy to Sepolia');
        }
        return new HDWalletProvider({
          privateKeys: [privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`],
          providerOrUrl: rpcUrl,
          pollingInterval: 8000,
        });
      },
      network_id: 11155111,
      // On-chain estimate for HoneyChainCore is ~5.24M gas — keep a little headroom.
      gas: 6500000,
      // Do NOT pin a gas price here. The deployer is a low-balance testnet account and
      // Sepolia's base fee sits near 1 Gwei, but a hardcoded 20 Gwei made truffle reserve
      // roughly 20x what the deploy actually costs — several times the account's whole
      // balance — so every deploy aborted with "insufficient funds" even though the real
      // cost is ~0.005 ETH. Omitting it lets truffle use the live eth_gasPrice, which is
      // both far cheaper and adapts when the base fee moves.
      // Sanity check before every --chain run: gas * gasPrice must stay under the
      // deployer's balance, because truffle reserves the full limit up front.
      confirmations: 1,
      timeoutBlocks: 200,
      skipDryRun: true,
    },
    arbitrum_sepolia: {
      provider: () => {
        const privateKey = process.env.RELAYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
        const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
        if (!privateKey) {
          throw new Error('RELAYER_PRIVATE_KEY or PRIVATE_KEY must be set in .env');
        }
        return new HDWalletProvider({
          privateKeys: [privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`],
          providerOrUrl: rpcUrl,
          pollingInterval: 2000,
        });
      },
      network_id: 421614,
      gas: 25000000,
      gasPrice: 100000000, // 0.1 Gwei
      confirmations: 1,
      timeoutBlocks: 200,
      skipDryRun: true,
    },
  },


  compilers: {
    solc: {
      version: '0.5.16',
      settings: {
        optimizer: { enabled: true, runs: 1 },
        evmVersion: 'petersburg',
      },
    },
  },

  db: { enabled: false },
};
