import { Connection, Commitment } from "@solana/web3.js";

// RPC Configuration with automatic provider selection
function getBestRPCEndpoint(): string {
  // Priority order: Custom URL > Helius URL > Alchemy URL > Public
  if (import.meta.env.VITE_SOLANA_RPC_URL) {
    return import.meta.env.VITE_SOLANA_RPC_URL;
  }

  if (import.meta.env.VITE_HELIUS_KEY) {
    return import.meta.env.VITE_HELIUS_KEY;
  }

  if (import.meta.env.VITE_ALCHEMY_KEY) {
    return import.meta.env.VITE_ALCHEMY_KEY;
  }

  return "https://api.mainnet-beta.solana.com";
}

export const RPC_CONFIG = {
  endpoint: getBestRPCEndpoint(),
  commitment:
    (import.meta.env.VITE_RPC_COMMITMENT as Commitment) || "confirmed",
  timeout: parseInt(import.meta.env.VITE_RPC_TIMEOUT || "30000"),
  network: import.meta.env.VITE_SOLANA_NETWORK || "mainnet-beta",
};

// Create a configured connection instance with rate limit handling
export function createConnection(): Connection {
  return new Connection(RPC_CONFIG.endpoint, {
    commitment: RPC_CONFIG.commitment,
    confirmTransactionInitialTimeout: RPC_CONFIG.timeout,
    // Add rate limit handling
    httpHeaders: {
      "User-Agent": "Solana-NFT-Distributor/1.0.0",
    },
    // Disable retry for rate limit issues
    disableRetryOnRateLimit: false,
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

// Get the active provider name for display
export function getActiveProviderName(): string {
  if (import.meta.env.VITE_SOLANA_RPC_URL) return "Custom RPC";
  if (import.meta.env.VITE_HELIUS_KEY) return "Helius";
  if (import.meta.env.VITE_ALCHEMY_KEY) return "Alchemy";
  return "Public Solana RPC";
}
