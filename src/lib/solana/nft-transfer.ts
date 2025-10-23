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

export async function transferCompressedNFTs({
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

  // Process each cNFT transfer
  for (let i = 0; i < nftMints.length; i++) {
    const assetId = nftMints[i];
    const toPubkey = new PublicKey(recipients[i]);

    try {
      // Fetch asset data and proof using DAS API
      const [assetData, assetProof] = await Promise.all([
        fetchAssetData(connection, assetId),
        fetchAssetProof(connection, assetId),
      ]);

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

// Helper function to fetch asset data using DAS API
async function fetchAssetData(
  connection: Connection,
  assetId: string
): Promise<AssetData | null> {
  try {
    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "asset-data",
        method: "getAsset",
        params: {
          id: assetId,
        },
      }),
    });

    const { result } = await response.json();
    return result;
  } catch (error) {
    console.error("Error fetching asset data:", error);
    return null;
  }
}

// Helper function to fetch asset proof using DAS API
async function fetchAssetProof(
  connection: Connection,
  assetId: string
): Promise<AssetProof | null> {
  try {
    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "asset-proof",
        method: "getAssetProof",
        params: {
          id: assetId,
        },
      }),
    });

    const { result } = await response.json();
    return result;
  } catch (error) {
    console.error("Error fetching asset proof:", error);
    return null;
  }
}
