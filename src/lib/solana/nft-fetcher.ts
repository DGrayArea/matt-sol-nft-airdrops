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
}

export async function fetchWalletNFTs(
  connection: Connection,
  walletAddress: PublicKey
): Promise<NFTMetadata[]> {
  try {
    const metaplex = Metaplex.make(connection);

    const nfts = await metaplex.nfts().findAllByOwner({ owner: walletAddress });

    const nftMetadata: NFTMetadata[] = [];

    for (const nft of nfts) {
      if (nft.model === "metadata") {
        try {
          const fullNft = await metaplex.nfts().load({ metadata: nft });

          nftMetadata.push({
            id: nft.mintAddress.toString(),
            mint: nft.mintAddress.toString(),
            name: nft.name || "Unknown NFT",
            image: fullNft.json?.image || "/placeholder.svg",
            collection: fullNft.collection?.address.toString(),
            uri: nft.uri,
          });
        } catch (error) {
          console.error("Error loading NFT metadata:", error);
        }
      }
    }

    return nftMetadata;
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
    // For cNFTs, we need to use the DAS (Digital Asset Standard) API
    // This requires an RPC endpoint that supports the DAS API (like Helius)
    const response = await fetch(connection.rpcEndpoint, {
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
    }));
  } catch (error) {
    console.error("Error fetching cNFTs:", error);
    return [];
  }
}
