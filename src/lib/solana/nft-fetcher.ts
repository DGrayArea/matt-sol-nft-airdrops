import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import { createConnection } from "./config";

export interface NFTMetadata {
  id: string;
  mint: string;
  name: string;
  image: string;
  collection?: string;
  uri?: string;
  isCompressed?: boolean;
}

// Rate limit helper function
async function withRateLimit<T>(
  fn: () => Promise<T>,
  delay: number = 100
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (
      error.message?.includes("429") ||
      error.message?.includes("rate limit")
    ) {
      console.warn("Rate limit hit, waiting before retry...");
      await new Promise((resolve) => setTimeout(resolve, delay * 2));
      return await fn();
    }
    throw error;
  }
}

export async function fetchWalletNFTs(
  connection: Connection,
  walletAddress: PublicKey
): Promise<NFTMetadata[]> {
  try {
    // Use Helius DAS API for better performance and rate limit handling
    const response = await withRateLimit(async () => {
      return await fetch(connection.rpcEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "nft-fetch",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: walletAddress.toString(),
            page: 1,
            limit: 1000,
          },
        }),
      });
    });

    const { result } = await response.json();

    if (!result?.items) {
      return [];
    }

    // Filter for regular NFTs (non-compressed)
    const regularNFTs = result.items.filter(
      (asset: any) => !asset.compression?.compressed
    );

    return regularNFTs.map((asset: any) => ({
      id: asset.id,
      mint: asset.id,
      name: asset.content?.metadata?.name || "Unknown NFT",
      image:
        asset.content?.files?.[0]?.uri ||
        asset.content?.links?.image ||
        "/placeholder.svg",
      collection: asset.grouping?.find((g: any) => g.group_key === "collection")
        ?.group_value,
      uri: asset.content?.json_uri,
      isCompressed: false,
    }));
  } catch (error) {
    console.error("Error fetching wallet NFTs:", error);
    return [];
  }
}

export async function fetchWalletCNFTs(
  connection: Connection,
  walletAddress: PublicKey
): Promise<NFTMetadata[]> {
  try {
    // Use Helius DAS API for compressed NFTs
    const response = await withRateLimit(async () => {
      return await fetch(connection.rpcEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "cnft-fetch",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: walletAddress.toString(),
            page: 1,
            limit: 1000,
          },
        }),
      });
    });

    const { result } = await response.json();

    if (!result?.items) {
      return [];
    }

    // Filter for compressed NFTs
    const cnfts = result.items.filter(
      (asset: any) => asset.compression?.compressed
    );

    return cnfts.map((asset: any) => ({
      id: asset.id,
      mint: asset.id,
      name: asset.content?.metadata?.name || "Unknown cNFT",
      image:
        asset.content?.files?.[0]?.uri ||
        asset.content?.links?.image ||
        "/placeholder.svg",
      collection: asset.grouping?.find((g: any) => g.group_key === "collection")
        ?.group_value,
      uri: asset.content?.json_uri,
      isCompressed: true,
    }));
  } catch (error) {
    console.error("Error fetching cNFTs:", error);
    return [];
  }
}

// Unified function to fetch all NFTs (both regular and compressed) in one call
export async function fetchAllWalletNFTs(
  connection: Connection,
  walletAddress: PublicKey
): Promise<NFTMetadata[]> {
  try {
    // Use Helius DAS API to fetch all assets at once
    const response = await withRateLimit(async () => {
      return await fetch(connection.rpcEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "all-nft-fetch",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: walletAddress.toString(),
            page: 1,
            limit: 1000,
          },
        }),
      });
    });

    const { result } = await response.json();

    if (!result?.items) {
      return [];
    }

    // Process all assets and mark them as compressed or regular
    return result.items.map((asset: any) => ({
      id: asset.id,
      mint: asset.id,
      name: asset.content?.metadata?.name || "Unknown NFT",
      image:
        asset.content?.files?.[0]?.uri ||
        asset.content?.links?.image ||
        "/placeholder.svg",
      collection: asset.grouping?.find((g: any) => g.group_key === "collection")
        ?.group_value,
      uri: asset.content?.json_uri,
      isCompressed: asset.compression?.compressed || false,
    }));
  } catch (error) {
    console.error("Error fetching all wallet NFTs:", error);
    return [];
  }
}
