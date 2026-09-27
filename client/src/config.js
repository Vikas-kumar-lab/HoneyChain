// Centralized application configuration for HoneyChain2
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5002';

// Local / Cloud Ganache Blockchain RPC endpoint
export const GANACHE_CHAIN_ID = 1337;
export const GANACHE_CHAIN_ID_HEX = '0x539';
export const GANACHE_RPC = process.env.REACT_APP_RPC_URL || process.env.REACT_APP_GANACHE_RPC || `${API_BASE_URL}/rpc`;


// Public Ethereum Sepolia Testnet
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';
export const SEPOLIA_PUBLIC_RPC = process.env.REACT_APP_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
