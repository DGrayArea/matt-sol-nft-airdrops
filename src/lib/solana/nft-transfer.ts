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
// Removed Umi imports - using direct DAS API approach instead
// SPL Program IDs for compressed NFTs (using known program IDs)
const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
  "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
);
const SPL_NOOP_PROGRAM_ID = new PublicKey(
  "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
);

// Import Bubblegum transfer instruction
import { getTransferInstructionDataSerializer } from "@metaplex-foundation/mpl-bubblegum";

const BUBBLEGUM_PROGRAM_ID = new PublicKey(
  "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
);

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

  console.log("🔍 Extracting asset data from metadata:");
  console.log("NFT metadata count:", nftMetadata.length);
  console.log("NFT mints to extract:", nftMints);

  nftMints.forEach((mint) => {
    const nft = nftMetadata.find((n) => n.mint === mint || n.id === mint);
    console.log(`Looking for mint ${mint}:`, {
      found: !!nft,
      hasFullAssetData: !!(nft && nft.fullAssetData),
      nftId: nft?.id,
      nftMint: nft?.mint,
    });

    if (nft && nft.fullAssetData) {
      assetDataMap[mint] = nft.fullAssetData;
    }
  });

  console.log(
    `📦 Extracted ${Object.keys(assetDataMap).length} assets from cached metadata`
  );
  console.log("Extracted asset IDs:", Object.keys(assetDataMap));
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

// Helper: Rate-limited delay
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Removed Umi helper function - using direct DAS API approach instead

// Fetch with rate limiting
async function fetchWithRateLimit<T>(
  fetchFn: () => Promise<T>,
  delayMs: number = 100 // 10 requests per second
): Promise<T> {
  const result = await fetchFn();
  await delay(delayMs);
  return result;
}

// OPTIMIZED: Batch fetch asset data with rate limiting
async function fetchMultipleAssetDataRateLimited(
  connection: Connection,
  assetIds: string[],
  batchSize: number = 100
): Promise<Record<string, any>> {
  const heliusUrl = import.meta.env.VITE_HELIUS_KEY;

  if (!heliusUrl) {
    throw new Error("Helius API key not configured");
  }

  // Split into batches if more than batchSize
  const batches: string[][] = [];
  for (let i = 0; i < assetIds.length; i += batchSize) {
    batches.push(assetIds.slice(i, i + batchSize));
  }

  console.log(
    `🔄 Fetching ${assetIds.length} assets in ${batches.length} batches`
  );

  const assetDataMap: Record<string, any> = {};

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`📦 Batch ${i + 1}/${batches.length}: ${batch.length} assets`);

    try {
      const response = await fetchWithRateLimit(
        () =>
          fetch(heliusUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: `batch-${i}`,
              method: "getAssetBatch",
              params: { ids: batch },
            }),
          }),
        200 // 200ms delay between batches
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(`Batch ${i + 1} error: ${data.error.message}`);
      }

      if (data.result && Array.isArray(data.result)) {
        data.result.forEach((asset: any) => {
          if (asset && asset.id) {
            assetDataMap[asset.id] = asset;
          }
        });
      }

      console.log(
        `✅ Batch ${i + 1} complete: ${Object.keys(assetDataMap).length} total`
      );
    } catch (error) {
      console.error(`❌ Batch ${i + 1} failed:`, error);
      throw error;
    }
  }

  return assetDataMap;
}

// ALTERNATIVE: Try using Solana RPC directly for merkle tree data
async function fetchMerkleTreeData(
  connection: Connection,
  merkleTreeId: string
): Promise<any> {
  console.log(`🔄 Fetching merkle tree data for ${merkleTreeId}...`);

  try {
    const merkleTreePubkey = new PublicKey(merkleTreeId);
    const accountInfo = await connection.getAccountInfo(merkleTreePubkey);

    if (!accountInfo) {
      throw new Error(`Merkle tree account not found: ${merkleTreeId}`);
    }

    console.log(
      `✅ Merkle tree account found, data length: ${accountInfo.data.length}`
    );
    return accountInfo;
  } catch (error) {
    console.error("Error fetching merkle tree data:", error);
    throw error;
  }
}

// FALLBACK: Try individual getAssetProof with different approach
async function fetchAssetProofAlternative(
  connection: Connection,
  assetId: string
): Promise<any> {
  const heliusUrl = import.meta.env.VITE_HELIUS_KEY;

  if (!heliusUrl) {
    throw new Error("Helius API key not configured");
  }

  console.log(`🔄 Alternative proof fetch for ${assetId}...`);

  try {
    // Try with different parameters
    const response = await fetch(heliusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `alt-proof-${Date.now()}`,
        method: "getAssetProof",
        params: {
          id: assetId,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`DAS API error: ${data.error.message}`);
    }

    const result = data.result;

    console.log(`🔍 Raw proof result for ${assetId}:`, result);

    if (!result) {
      throw new Error(`No result returned for ${assetId}`);
    }

    if (!result.proof) {
      console.warn(
        `⚠️ No proof field in result for ${assetId}:`,
        Object.keys(result)
      );
      throw new Error(`No proof field for ${assetId}`);
    }

    if (!Array.isArray(result.proof)) {
      console.warn(
        `⚠️ Proof is not an array for ${assetId}:`,
        typeof result.proof,
        result.proof
      );
      throw new Error(
        `Proof is not an array for ${assetId}: ${typeof result.proof}`
      );
    }

    if (result.proof.length === 0) {
      console.warn(`⚠️ Proof array is empty for ${assetId}`);
      throw new Error(`Proof array is empty for ${assetId}`);
    }

    console.log(
      `✅ Alternative proof fetch successful for ${assetId}, proof length: ${result.proof.length}`
    );
    return result;
  } catch (error) {
    console.error(`Error alternative proof fetch for ${assetId}:`, error);
    throw error;
  }
}

// BATCH: Fetch proofs using alternative method
async function fetchAssetProofsBatch(
  connection: Connection,
  assetIds: string[]
): Promise<Record<string, any>> {
  console.log(
    `🔄 Alternative batch fetching proofs for ${assetIds.length} assets...`
  );

  const proofMap: Record<string, any> = {};

  // Try fetching proofs one by one with alternative method
  for (const assetId of assetIds) {
    try {
      const proof = await fetchAssetProofAlternative(connection, assetId);
      proofMap[assetId] = { id: assetId, ...proof };

      // Small delay between requests
      await delay(100);
    } catch (error) {
      console.error(`Failed to fetch proof for ${assetId}:`, error);
      // Continue with other assets
    }
  }

  console.log(
    `✅ Alternative batch fetched ${Object.keys(proofMap).length} proofs`
  );
  return proofMap;
}

// SIMPLE: Prepare transaction with batch-fetched data (no retries)
export async function prepareCompressedNFTTransactionSimple({
  connection,
  wallet,
  nftMint,
  recipient,
  assetData,
  assetProof,
}: {
  connection: Connection;
  wallet: WalletContextState;
  nftMint: string;
  recipient: string;
  assetData: any;
  assetProof: any;
}): Promise<Transaction> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  const transaction = new Transaction();
  const fromPubkey = wallet.publicKey;

  console.log(`🔄 Preparing transaction for ${nftMint}...`);

  // Verify ownership
  if (assetData.ownership.owner !== fromPubkey.toString()) {
    throw new Error(
      `You don't own asset ${nftMint}. Owner: ${assetData.ownership.owner}, Expected: ${fromPubkey.toString()}`
    );
  }

  // Debug: Log key details
  console.log(`🔍 Transaction data for ${nftMint}:`);
  console.log(`  Asset Owner: ${assetData.ownership.owner}`);
  console.log(`  Wallet Pubkey: ${fromPubkey.toString()}`);
  console.log(`  Merkle Tree: ${assetData.compression.tree}`);
  console.log(`  Leaf ID: ${assetData.compression.leaf_id}`);
  console.log(`  Proof Root: ${assetProof.root}`);
  console.log(`  Proof Tree ID: ${assetProof.tree_id}`);
  console.log(`  Proof Node Index: ${assetProof.node_index}`);
  console.log(`  Proof Nodes Count: ${assetProof.proof.length}`);
  console.log(`  Data Hash: ${assetData.compression.data_hash}`);
  console.log(`  Creator Hash: ${assetData.compression.creator_hash}`);
  console.log(`  Asset Hash: ${assetData.compression.asset_hash}`);
  console.log(`  Leaf: ${assetProof.leaf}`);
  console.log(`  Last Indexed Slot: ${assetProof.last_indexed_slot}`);

  // Validate proof structure
  if (
    !assetProof.proof ||
    !Array.isArray(assetProof.proof) ||
    assetProof.proof.length === 0
  ) {
    throw new Error(
      `Invalid proof structure for ${nftMint}: proof is empty or not an array`
    );
  }

  const merkleTree = new PublicKey(assetData.compression.tree);
  const toPubkey = new PublicKey(recipient);

  // Try different tree authority derivations
  let treeAuthority: PublicKey;
  try {
    // Method 1: Standard derivation
    [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    console.log(
      `🔍 Using standard tree authority: ${treeAuthority.toString()}`
    );
  } catch (error) {
    console.warn(
      "Standard tree authority derivation failed, trying alternative..."
    );
    // Method 2: Alternative derivation
    [treeAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("tree_authority"), merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );
    console.log(
      `🔍 Using alternative tree authority: ${treeAuthority.toString()}`
    );
  }

  // Check if tree authority account exists
  try {
    const treeAuthorityInfo = await connection.getAccountInfo(treeAuthority);
    if (!treeAuthorityInfo) {
      throw new Error(
        `Tree authority account not found: ${treeAuthority.toString()}`
      );
    }
    console.log(
      `✅ Tree authority account exists: ${treeAuthority.toString()}`
    );
  } catch (error) {
    console.error(`❌ Tree authority account check failed:`, error);
    throw error;
  }

  const transferInstruction = new TransactionInstruction({
    keys: [
      { pubkey: treeAuthority, isSigner: false, isWritable: false },
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
      },
      ...assetProof.proof.map((p: string) => ({
        pubkey: new PublicKey(p),
        isSigner: false,
        isWritable: false,
      })),
    ],
    programId: BUBBLEGUM_PROGRAM_ID,
    data: Buffer.from(
      getTransferInstructionDataSerializer().serialize({
        root: Buffer.from(assetProof.root, "base64"),
        dataHash: Buffer.from(assetData.compression.data_hash, "base64"),
        creatorHash: Buffer.from(assetData.compression.creator_hash, "base64"),
        nonce: assetData.compression.leaf_id,
        index: assetData.compression.leaf_id,
      })
    ),
  });

  transaction.add(transferInstruction);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  return transaction;
}

// SIMPLIFIED: Transfer multiple cNFTs using direct DAS API (no Umi)
export async function transferMultipleCompressedNFTs({
  connection,
  wallet,
  nftMints,
  recipients,
}: {
  connection: Connection;
  wallet: WalletContextState;
  nftMints: string[];
  recipients: string[];
}): Promise<string[]> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  if (nftMints.length !== recipients.length) {
    throw new Error("Number of NFTs must match number of recipients");
  }

  console.log(
    `🚀 Starting direct DAS API transfer of ${nftMints.length} cNFTs`
  );

  const signatures: string[] = [];

  // Process one NFT at a time using direct DAS API
  for (let i = 0; i < nftMints.length; i++) {
    const mint = nftMints[i];
    const recipient = recipients[i];

    console.log(`🔄 [${i + 1}/${nftMints.length}] Processing ${mint}`);

    try {
      // Fetch fresh asset data and proof
      const [assetData, assetProof] = await Promise.all([
        fetchIndividualAssetData(connection, mint),
        fetchIndividualAssetProof(connection, mint),
      ]);

      if (!assetData || !assetProof) {
        throw new Error(`Failed to fetch data for asset ${mint}`);
      }

      // Prepare transaction using the simple approach
      const transaction = await prepareCompressedNFTTransactionSimple({
        connection,
        wallet,
        nftMint: mint,
        recipient,
        assetData,
        assetProof,
      });

      // Sign and send transaction
      const signed = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(
        signed.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        }
      );

      // Confirm transaction
      await connection.confirmTransaction(signature, "confirmed");

      console.log(`✅ Transfer confirmed for ${mint}: ${signature}`);
      signatures.push(signature);
    } catch (err: any) {
      console.error(`❌ Transfer failed for ${mint}:`, err.message);
      // Continue with next NFT
    }

    // Small delay between transfers
    if (i < nftMints.length - 1) await delay(1000);
  }

  console.log(
    `🎉 Successfully transferred ${signatures.length} out of ${nftMints.length} cNFTs`
  );
  return signatures;
}

// SIMPLE: Prepare single cNFT transaction (for small batches)
export async function prepareCompressedNFTTransaction({
  connection,
  wallet,
  nftMint,
  recipient,
  nftMetadata,
}: {
  connection: Connection;
  wallet: WalletContextState;
  nftMint: string;
  recipient: string;
  nftMetadata?: any[];
}): Promise<Transaction> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  const transaction = new Transaction();
  const fromPubkey = wallet.publicKey;

  // Fetch fresh data for single transaction
  console.log("🔄 Fetching fresh asset data and proof...");

  const [assetData, assetProof] = await Promise.all([
    fetchIndividualAssetData(connection, nftMint),
    fetchIndividualAssetProof(connection, nftMint),
  ]);

  if (!assetData || !assetProof) {
    throw new Error(`Failed to fetch data for asset ${nftMint}`);
  }

  // Verify ownership
  if (assetData.ownership.owner !== fromPubkey.toString()) {
    throw new Error(`You don't own asset ${nftMint}`);
  }

  const merkleTree = new PublicKey(assetData.compression.tree);
  const toPubkey = new PublicKey(recipient);

  // Derive tree authority PDA
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  // Create transfer instruction
  const transferInstruction = new TransactionInstruction({
    keys: [
      { pubkey: treeAuthority, isSigner: false, isWritable: false },
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
      },
      ...assetProof.proof.map((p: string) => ({
        pubkey: new PublicKey(p),
        isSigner: false,
        isWritable: false,
      })),
    ],
    programId: BUBBLEGUM_PROGRAM_ID,
    data: Buffer.from(
      getTransferInstructionDataSerializer().serialize({
        root: Buffer.from(assetProof.root, "base64"),
        dataHash: Buffer.from(assetData.compression.data_hash, "base64"),
        creatorHash: Buffer.from(assetData.compression.creator_hash, "base64"),
        nonce: assetData.compression.leaf_id,
        index: assetData.compression.leaf_id,
      })
    ),
  });

  transaction.add(transferInstruction);

  // Get latest blockhash
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromPubkey;

  return transaction;
}

// LEGACY: Keep old function for backward compatibility (single transaction)
export async function transferCompressedNFTs({
  connection,
  wallet,
  nftMints,
  recipients,
  nftMetadata,
}: TransferNFTParams & { nftMetadata?: any[] }): Promise<string> {
  // For single NFT, use the simple approach
  if (nftMints.length === 1) {
    const transaction = await prepareCompressedNFTTransaction({
      connection,
      wallet,
      nftMint: nftMints[0],
      recipient: recipients[0],
      nftMetadata,
    });

    const signed = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  }

  // For multiple NFTs, use the optimized approach
  const signatures = await transferMultipleCompressedNFTs({
    connection,
    wallet,
    nftMints,
    recipients,
  });

  return signatures[0]; // Return first signature for backward compatibility
}

// Fallback functions for individual API calls
async function fetchIndividualAssetData(
  connection: Connection,
  assetId: string
): Promise<any> {
  try {
    const heliusUrl = import.meta.env.VITE_HELIUS_KEY;

    if (!heliusUrl) {
      throw new Error("Helius API key not configured");
    }

    const response = await fetch(heliusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "individual-asset-data",
        method: "getAsset",
        params: {
          id: assetId,
        },
      }),
    });

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error(
      `Error fetching individual asset data for ${assetId}:`,
      error
    );
    return null;
  }
}

async function fetchIndividualAssetProof(
  connection: Connection,
  assetId: string,
  maxRetries: number = 3
): Promise<any> {
  const heliusUrl = import.meta.env.VITE_HELIUS_KEY;

  if (!heliusUrl) {
    throw new Error("Helius API key not configured");
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🔄 Fetching proof for ${assetId} (attempt ${attempt}/${maxRetries})`
      );

      const response = await fetch(heliusUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `individual-asset-proof-${attempt}`,
          method: "getAssetProof",
          params: {
            id: assetId,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`DAS API error: ${data.error.message}`);
      }

      const result = data.result;

      // Validate proof structure
      if (
        !result ||
        !result.root ||
        !result.proof ||
        !Array.isArray(result.proof)
      ) {
        throw new Error(`Invalid proof structure for ${assetId}`);
      }

      // Check if proof is recent (within last 10 slots)
      const currentSlot = await connection.getSlot();
      const proofAge = currentSlot - result.last_indexed_slot;
      if (proofAge > 10) {
        console.warn(
          `⚠️ Proof is ${proofAge} slots old for ${assetId}, may be stale`
        );
      }

      console.log(
        `✅ Successfully fetched proof for ${assetId} (attempt ${attempt})`
      );
      return result;
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed for ${assetId}:`, error);

      if (attempt === maxRetries) {
        throw new Error(
          `Failed to fetch proof for ${assetId} after ${maxRetries} attempts: ${error.message}`
        );
      }

      // Wait before retry
      await delay(1000 * attempt); // Exponential backoff
    }
  }
}
