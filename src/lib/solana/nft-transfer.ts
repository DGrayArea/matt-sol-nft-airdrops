import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createTransferInstruction as createSPLTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplBubblegum,
  getAssetWithProof,
  transfer,
} from "@metaplex-foundation/mpl-bubblegum";
import { signerIdentity, publicKey } from "@metaplex-foundation/umi";
import { dasApi } from "@metaplex-foundation/digital-asset-standard-api";

// SPL Program IDs for compressed NFTs
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

// Helper: Rate-limited delay
async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Regular NFT Transfer
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

// Fetch individual asset data from Helius DAS API
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

// Fetch individual asset proof from Helius DAS API
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

// SINGLE FUNCTION for compressed NFT transfers
export async function transferCompressedNFTs({
  connection,
  wallet,
  nftMints,
  recipients,
}: TransferNFTParams): Promise<string[]> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  if (nftMints.length !== recipients.length) {
    throw new Error("Number of NFTs must match number of recipients");
  }

  console.log(
    `🚀 Starting compressed NFT transfer of ${nftMints.length} cNFTs`
  );

  const signatures: string[] = [];

  // Process one NFT at a time
  for (let i = 0; i < nftMints.length; i++) {
    const mint = nftMints[i];
    const recipient = recipients[i];

    console.log(`🔄 [${i + 1}/${nftMints.length}] Processing ${mint}`);

    // Validate mint and recipient
    if (!mint || !recipient) {
      console.error(
        `❌ Invalid data at index ${i}: mint=${mint}, recipient=${recipient}`
      );
      continue;
    }

    try {
      // Fetch fresh asset data and proof
      const [assetData, assetProof] = await Promise.all([
        fetchIndividualAssetData(connection, mint),
        fetchIndividualAssetProof(connection, mint),
      ]);

      if (!assetData || !assetProof) {
        throw new Error(`Failed to fetch data for asset ${mint}`);
      }

      // Verify ownership
      if (assetData.ownership.owner !== wallet.publicKey.toString()) {
        throw new Error(
          `You don't own asset ${mint}. Owner: ${assetData.ownership.owner}, Expected: ${wallet.publicKey.toString()}`
        );
      }

      // Validate proof structure
      if (
        !assetProof.proof ||
        !Array.isArray(assetProof.proof) ||
        assetProof.proof.length === 0
      ) {
        throw new Error(
          `Invalid proof structure for ${mint}: proof is empty or not an array`
        );
      }

      // Create transaction
      const transaction = new Transaction();
      const fromPubkey = wallet.publicKey;
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

      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;

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

export async function transferCompressedNFTsUmi({
  connection,
  wallet,
  nftMints,
  recipients,
}: TransferNFTParams): Promise<string[]> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  if (nftMints.length !== recipients.length) {
    throw new Error("Number of NFTs must match number of recipients");
  }

  console.log(
    `🚀 Starting compressed NFT transfer of ${nftMints.length} cNFTs`
  );

  const signatures: string[] = [];

  // Process one NFT at a time
  for (let i = 0; i < nftMints.length; i++) {
    const mint = nftMints[i];
    const recipient = recipients[i];

    console.log(`🔄 [${i + 1}/${nftMints.length}] Processing ${mint}`);

    // Validate mint and recipient
    if (!mint || !recipient) {
      console.error(
        `❌ Invalid data at index ${i}: mint=${mint}, recipient=${recipient}`
      );
      continue;
    }

    try {
      // Fetch fresh asset data and proof
      // Use the RPC endpoint of your choice.
      // Construct a fresh Umi instance per transfer to avoid context issues
      const umi = createUmi(import.meta.env.VITE_HELIUS_KEY)
        .use(dasApi())
        .use(mplBubblegum())
        .use(
          signerIdentity({
            publicKey: publicKey(wallet.publicKey.toString()),
            signMessage: async (message: Uint8Array) => {
              const signature = await wallet.signMessage!(message);
              return new Uint8Array(signature);
            },
            signTransaction: async (transaction: any) => {
              return await wallet.signTransaction!(transaction);
            },
            signAllTransactions: async (transactions: any[]) => {
              return await wallet.signAllTransactions!(transactions);
            },
          })
        );

      //currnet leaf owner
      const assetWithProof = await getAssetWithProof(umi, mint, {
        truncateCanopy: true,
      });
      await transfer(umi, {
        ...assetWithProof,
        leafOwner: publicKey(wallet.publicKey.toString()),
        newLeafOwner: publicKey(recipient),
      }).sendAndConfirm(umi);

      //using a delegate
      // const assetWithProof = await getAssetWithProof(umi, assetId, {truncateCanopy: true});
      // await transfer(umi, {
      //   ...assetWithProof,
      //   leafDelegate: currentLeafDelegate,
      //   newLeafOwner: newLeafOwner.publicKey,
      // }).sendAndConfirm(umi)
    } catch (err: any) {
      console.error(`❌ Transfer failed for ${mint}:`, err.message);
      // Continue with next NFT
    }

    // Small delay between transfers
    // if (i < nftMints.length - 1) await delay(1000);
  }

  console.log(
    `🎉 Successfully transferred ${signatures.length} out of ${nftMints.length} cNFTs`
  );
  return signatures;
}
