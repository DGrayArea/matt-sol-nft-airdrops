import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Keypair,
} from "@solana/web3.js";
import {
  createTransferInstruction as createSPLTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { WalletContextState } from "@solana/wallet-adapter-react";
// SPL Program IDs for compressed NFTs (using known program IDs)
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
);
const SPL_NOOP_PROGRAM_ID = new PublicKey(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);

// Import Bubblegum transfer instruction
import { getTransferInstructionDataSerializer } from "@metaplex-foundation/mpl-bubblegum";

interface TransferNFTParams {
  connection: Connection;
  wallet: WalletContextState;
  nftMints: string[];
  recipients: string[];
}

export async function transferRegularNFTs({
  connection,
  wallet,
  nftMints,
  recipients,
}: TransferNFTParams): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  if (nftMints.length !== recipients.length) {
    throw new Error("Number of NFTs must match number of recipients");
  }

  const transaction = new Transaction();
  const fromPubkey = wallet.publicKey;

  for (let i = 0; i < nftMints.length; i++) {
    const mintPubkey = new PublicKey(nftMints[i]);
    const toPubkey = new PublicKey(recipients[i]);

    // Get sender's token account
    const fromTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      fromPubkey
    );

    // Get or create recipient's token account
    const toTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      toPubkey
    );

    // Check if recipient token account exists
    try {
      await getAccount(connection, toTokenAccount);
    } catch (error) {
      // Create associated token account if it doesn't exist
      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromPubkey,
          toTokenAccount,
          toPubkey,
          mintPubkey
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createSPLTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromPubkey,
        1 // NFTs have amount of 1
      )
    );
  }

  // Get latest blockhash
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  // Sign and send transaction with rate limit handling
  let signature: string;
  let retries = 3;

  while (retries > 0) {
    try {
      const signed = await wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Confirm transaction with timeout
      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed"
      );

      break;
    } catch (error: any) {
      retries--;
      if (retries === 0) {
        throw new Error(
          `Transaction failed after 3 attempts: ${error.message}`
        );
      }

      // Check if it's a rate limit error
      if (
        error.message?.includes("429") ||
        error.message?.includes("rate limit")
      ) {
        console.warn(
          `Rate limit hit, waiting before retry... (${retries} attempts left)`
        );
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds for rate limit
      } else {
        console.warn(
          `Transaction attempt failed, retrying... (${retries} attempts left)`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second for other errors
      }
    }
  }

  return signature;
}

// Interface for asset proof data
interface AssetProof {
  root: string;
  proof: string[];
  leaf: string;
  tree_id: string;
  node_index: number;
}

// Interface for asset data
interface AssetData {
  id: string;
  ownership: {
    owner: string;
    delegate?: string;
  };
  compression: {
    eligible: boolean;
    compressed: boolean;
    data_hash: string;
    creator_hash: string;
    asset_hash: string;
    tree: string;
    seq: number;
    leaf_id: number;
  };
}

// Helper function to extract asset data from cached NFT metadata
function extractAssetDataFromMetadata(
  nftMetadata: any[],
  nftMints: string[]
): Record<string, any> {
  const assetDataMap: Record<string, any> = {};

  nftMints.forEach((mint) => {
    const nft = nftMetadata.find((n) => n.mint === mint || n.id === mint);
    if (nft && nft.fullAssetData) {
      assetDataMap[mint] = nft.fullAssetData;
    }
  });

  console.log(
    `📦 Extracted ${Object.keys(assetDataMap).length} assets from cached metadata`
  );
  return assetDataMap;
}

// Helper function to extract proofs from cached NFT metadata
function extractProofsFromMetadata(
  nftMetadata: any[],
  nftMints: string[]
): Record<string, any> {
  const proofMap: Record<string, any> = {};

  nftMints.forEach((mint) => {
    const nft = nftMetadata.find((n) => n.mint === mint || n.id === mint);
    if (nft && nft.fullAssetData && nft.fullAssetData.proof) {
      proofMap[mint] = {
        id: mint,
        proof: nft.fullAssetData.proof,
        tree_id: nft.fullAssetData.compression?.tree,
        leaf_id: nft.fullAssetData.compression?.leaf_id,
      };
    }
  });

  console.log(
    `🎉 Extracted ${Object.keys(proofMap).length} proofs from cached metadata`
  );
  return proofMap;
}

export async function transferCompressedNFTs({
  connection,
  wallet,
  nftMints,
  recipients,
  nftMetadata, // Add optional NFT metadata with full asset data
}: TransferNFTParams & { nftMetadata?: any[] }): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  if (nftMints.length !== recipients.length) {
    throw new Error("Number of NFTs must match number of recipients");
  }

  const transaction = new Transaction();
  const fromPubkey = wallet.publicKey;

  // Check if we have full asset data from the initial fetch
  const hasFullAssetData =
    nftMetadata &&
    nftMetadata.length > 0 &&
    nftMetadata.some((nft) => nft.fullAssetData);

  // Check if proofs are also available in cached data
  const hasCachedProofs =
    hasFullAssetData && nftMetadata.some((nft) => nft.fullAssetData?.proof);

  if (hasFullAssetData) {
    console.log(
      `✅ Using cached asset data from initial fetch for ${nftMints.length} cNFTs`
    );

    if (hasCachedProofs) {
      console.log(
        `🎉 Proofs also available in cached data - zero additional API calls needed!`
      );
    } else {
      console.log(`⚠️ Proofs not in cached data, will fetch via batch API`);
    }
  } else {
    console.log(`🔄 Batch fetching data for ${nftMints.length} cNFTs...`);

    // Show progress for large batches
    if (nftMints.length > 10) {
      console.log(
        `⏳ This may take a moment for ${nftMints.length} NFTs to avoid rate limits...`
      );
    }
  }

  // Use cached data if available, otherwise fetch via batch APIs
  const [assetDataMap, assetProofMap] = hasFullAssetData
    ? await Promise.all([
        // Extract asset data from cached metadata
        Promise.resolve(extractAssetDataFromMetadata(nftMetadata!, nftMints)),
        // Extract proofs from cached data if available, otherwise fetch
        hasCachedProofs
          ? Promise.resolve(extractProofsFromMetadata(nftMetadata!, nftMints))
          : fetchMultipleAssetProofs(connection, nftMints),
      ])
    : await Promise.all([
        fetchMultipleAssetData(connection, nftMints),
        fetchMultipleAssetProofs(connection, nftMints),
      ]);

  console.log(`✅ Fetched data for ${Object.keys(assetDataMap).length} assets`);
  console.log(
    `✅ Fetched proofs for ${Object.keys(assetProofMap).length} assets`
  );

  // Check if we got all the data we need
  const missingData = nftMints.filter((id) => !assetDataMap[id]);
  const missingProofs = nftMints.filter((id) => !assetProofMap[id]);

  if (missingData.length > 0) {
    console.warn(
      `⚠️ Missing data for ${missingData.length} assets:`,
      missingData
    );
  }
  if (missingProofs.length > 0) {
    console.warn(
      `⚠️ Missing proofs for ${missingProofs.length} assets:`,
      missingProofs
    );
  }

  // Process each cNFT transfer
  for (let i = 0; i < nftMints.length; i++) {
    const assetId = nftMints[i];
    const toPubkey = new PublicKey(recipients[i]);

    try {
      // Get pre-fetched asset data and proof
      const assetData = assetDataMap[assetId];
      const assetProof = assetProofMap[assetId];

      if (!assetData || !assetProof) {
        throw new Error(`Failed to fetch data for asset ${assetId}`);
      }

      // Verify ownership
      if (assetData.ownership.owner !== fromPubkey.toString()) {
        throw new Error(`You don't own asset ${assetId}`);
      }

      // Create the proper Bubblegum transfer instruction
      const merkleTree = new PublicKey(assetData.compression.tree);
      const treeConfig = PublicKey.findProgramAddressSync(
        [Buffer.from("tree-config"), merkleTree.toBuffer()],
        new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY")
      )[0];

      const transferInstruction = new TransactionInstruction({
        keys: [
          { pubkey: treeConfig, isSigner: false, isWritable: false },
          { pubkey: fromPubkey, isSigner: true, isWritable: false },
          {
            pubkey: assetData.ownership.delegate
              ? new PublicKey(assetData.ownership.delegate)
              : fromPubkey,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: toPubkey, isSigner: false, isWritable: false },
          { pubkey: merkleTree, isSigner: false, isWritable: true },
          { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
          {
            pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: new PublicKey("11111111111111111111111111111111"),
            isSigner: false,
            isWritable: false,
          }, // System Program
          // Add proof accounts
          ...assetProof.proof.map((p: string) => ({
            pubkey: new PublicKey(p),
            isSigner: false,
            isWritable: false,
          })),
        ],
        programId: new PublicKey(
          "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
        ), // Bubblegum program
        data: Buffer.from(
          getTransferInstructionDataSerializer().serialize({
            root: Buffer.from(assetProof.root, "base64"),
            dataHash: Buffer.from(assetData.compression.data_hash, "base64"),
            creatorHash: Buffer.from(
              assetData.compression.creator_hash,
              "base64"
            ),
            nonce: assetData.compression.leaf_id,
            index: assetData.compression.leaf_id,
          })
        ),
      });

      transaction.add(transferInstruction);
    } catch (error) {
      console.error(`Error preparing transfer for asset ${assetId}:`, error);
      throw new Error(
        `Failed to prepare transfer for asset ${assetId}: ${error.message}`
      );
    }
  }

  // Get latest blockhash
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  // Sign and send transaction with retry logic
  let signature: string;
  let retries = 3;

  while (retries > 0) {
    try {
      const signed = await wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Confirm transaction with timeout
      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed"
      );

      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        throw new Error(
          `Transaction failed after 3 attempts: ${error.message}`
        );
      }
      console.warn(
        `Transaction attempt failed, retrying... (${retries} attempts left)`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retry
    }
  }

  return signature;
}

// Helper function to fetch multiple asset data using Helius getAssetBatch API
async function fetchMultipleAssetData(
  connection: Connection,
  assetIds: string[]
): Promise<Record<string, AssetData>> {
  try {
    console.log(`🔄 Using Helius getAssetBatch for ${assetIds.length} assets`);

    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "batch-asset-data",
        method: "getAssetBatch",
        params: {
          ids: assetIds,
        },
      }),
    });

    const { result } = await response.json();
    console.log("📊 getAssetBatch response:", {
      success: result?.length || 0,
      total: assetIds.length,
      failed: assetIds.length - (result?.length || 0),
    });

    // Convert array to object keyed by asset ID
    const assetDataMap: Record<string, AssetData> = {};
    if (result && Array.isArray(result)) {
      result.forEach((asset: AssetData) => {
        if (asset && asset.id) {
          assetDataMap[asset.id] = asset;
        }
      });
    }

    return assetDataMap;
  } catch (error) {
    console.error("Error fetching batch asset data:", error);
    return {};
  }
}

// Helper function to fetch multiple asset proofs using Helius getAssetProofBatch API
async function fetchMultipleAssetProofs(
  connection: Connection,
  assetIds: string[]
): Promise<Record<string, any>> {
  try {
    console.log(
      `🔄 Using Helius getAssetProofBatch for ${assetIds.length} assets`
    );

    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "batch-asset-proofs",
        method: "getAssetProofBatch",
        params: {
          ids: assetIds,
        },
      }),
    });

    const { result } = await response.json();
    console.log("📊 getAssetProofBatch response:", {
      success: result?.length || 0,
      total: assetIds.length,
      failed: assetIds.length - (result?.length || 0),
    });

    // Convert array to object keyed by asset ID
    const proofMap: Record<string, any> = {};
    if (result && Array.isArray(result)) {
      result.forEach((proof: any) => {
        if (proof && proof.id) {
          proofMap[proof.id] = proof;
        }
      });
    }

    return proofMap;
  } catch (error) {
    console.error("Error fetching batch asset proofs:", error);
    return {};
  }
}
