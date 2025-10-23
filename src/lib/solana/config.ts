import { Connection, Commitment } from "@solana/web3.js";

// RPC Configuration
export const RPC_CONFIG = {
  // Default to public RPC, but can be overridden with environment variables
  endpoint:
    import.meta.env.VITE_SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com",
  commitment:
    (import.meta.env.VITE_RPC_COMMITMENT as Commitment) || "confirmed",
  timeout: parseInt(import.meta.env.VITE_RPC_TIMEOUT || "30000"),
  network: import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta",
};

// Create a configured connection instance
export function createConnection(): Connection {
  return new Connection(RPC_CONFIG.endpoint, {
    commitment: RPC_CONFIG.commitment,
    confirmTransactionInitialTimeout: RPC_CONFIG.timeout,
  });
}

// Check if the RPC endpoint supports DAS API (required for compressed NFTs)
export async function checkDASSupport(
  connection: Connection
): Promise<boolean> {
  try {
    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "das-check",
        method: "getAsset",
        params: {
          id: "test",
        },
      }),
    });

    const result = await response.json();
    // If we get a proper error response (not a network error), DAS is supported
    return result.error?.code !== -32601; // Method not found
  } catch (error) {
    return false;
  }
}

// RPC Provider recommendations
export const RPC_PROVIDERS = {
  public: {
    name: "Public Solana RPC",
    endpoint: "https://api.mainnet-beta.solana.com",
    dasSupport: false,
    rateLimit: "Low",
    cost: "Free",
  },
  helius: {
    name: "Helius",
    endpoint: "https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY",
    dasSupport: true,
    rateLimit: "High",
    cost: "Paid",
    website: "https://helius.dev",
  },
  quicknode: {
    name: "QuickNode",
    endpoint: "https://your-endpoint.solana-mainnet.quiknode.pro/YOUR_API_KEY/",
    dasSupport: true,
    rateLimit: "High",
    cost: "Paid",
    website: "https://quicknode.com",
  },
  alchemy: {
    name: "Alchemy",
    endpoint: "https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY",
    dasSupport: true,
    rateLimit: "High",
    cost: "Paid",
    website: "https://alchemy.com",
  },
};

// Get RPC provider info based on current endpoint
export function getCurrentRPCProvider() {
  const endpoint = RPC_CONFIG.endpoint;

  if (endpoint.includes("helius")) return RPC_PROVIDERS.helius;
  if (endpoint.includes("quiknode")) return RPC_PROVIDERS.quicknode;
  if (endpoint.includes("alchemy")) return RPC_PROVIDERS.alchemy;

  return RPC_PROVIDERS.public;
}
