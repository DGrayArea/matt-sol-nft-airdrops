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
import bs58 from "bs58";

// Using SPL Account Compression for cNFT transfers

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

  // Bubblegum program ID
  const BUBBLEGUM_PROGRAM_ID = new PublicKey(
    "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
  );

  // SPL Account Compression program ID - ADD THIS BACK
  const SPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey(
    "cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK"
  );

  // SPL Noop program ID
  const SPL_NOOP_PROGRAM_ID = new PublicKey(
    "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"
  );

  // System program
  const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

  // Prepare all transactions first
  const transactions: Transaction[] = [];
  const transactionData: Array<{
    mint: string;
    recipient: string;
    assetData: any;
    assetProof: any;
  }> = [];

  console.log(`🔄 Preparing ${nftMints.length} transactions...`);

  // Fetch all asset data and proofs first
  for (let i = 0; i < nftMints.length; i++) {
    const mint = nftMints[i];
    const recipient = recipients[i];

    console.log(`🔄 [${i + 1}/${nftMints.length}] Preparing ${mint}`);

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
          `You don't own asset ${mint}. Owner: ${assetData.ownership.owner}`
        );
      }

      // Validate proof structure
      if (
        !assetProof.proof ||
        !Array.isArray(assetProof.proof) ||
        assetProof.proof.length === 0
      ) {
        throw new Error(`Invalid proof structure for ${mint}`);
      }

      // Store data for transaction building
      transactionData.push({ mint, recipient, assetData, assetProof });
    } catch (err: any) {
      console.error(`❌ Failed to prepare ${mint}:`, err.message);
      // Continue with next NFT
    }
  }

  console.log(`📦 Prepared ${transactionData.length} valid transactions`);

  // Build all transactions
  for (const { mint, recipient, assetData, assetProof } of transactionData) {
    try {
      const fromPubkey = wallet.publicKey;
      const toPubkey = new PublicKey(recipient);
      const merkleTree = new PublicKey(assetData.compression.tree);

      // Get tree authority PDA
      const [treeAuthority] = PublicKey.findProgramAddressSync(
        [merkleTree.toBuffer()],
        BUBBLEGUM_PROGRAM_ID
      );

      console.log(`📋 Proof nodes for ${mint}: ${assetProof.proof.length}`);

      // Map proof to PublicKeys (use all proof nodes)
      const proofNodes = assetProof.proof.map((node: string) => {
        return new PublicKey(node);
      });

      // Transfer instruction discriminator from Bubblegum
      const transferDiscriminator = Buffer.from([
        163, 52, 200, 231, 140, 3, 69, 186,
      ]);

      // Build instruction data
      const instructionData = Buffer.concat([
        transferDiscriminator,
        // Root - decode from base58 (DAS API returns base58, not base64)
        Buffer.from(bs58.decode(assetProof.root)),
        // Data hash - decode from base58
        Buffer.from(bs58.decode(assetData.compression.data_hash)),
        // Creator hash - decode from base58
        Buffer.from(bs58.decode(assetData.compression.creator_hash)),
        (() => {
          // nonce as u64 (8 bytes, little-endian) - use leaf_id
          const buf = Buffer.alloc(8);
          buf.writeBigUInt64LE(BigInt(assetData.compression.leaf_id));
          return buf;
        })(),
        (() => {
          // index as u32 (4 bytes, little-endian) - also use leaf_id
          const buf = Buffer.alloc(4);
          buf.writeUInt32LE(assetData.compression.leaf_id);
          return buf;
        })(),
      ]);

      // Build instruction accounts - CORRECTED ORDER
      const keys = [
        // Tree authority (PDA)
        { pubkey: treeAuthority, isSigner: false, isWritable: false },
        // Leaf owner (current owner - must sign)
        { pubkey: fromPubkey, isSigner: true, isWritable: false },
        // Leaf delegate (current owner for now)
        { pubkey: fromPubkey, isSigner: false, isWritable: false },
        // New leaf owner (recipient)
        { pubkey: toPubkey, isSigner: false, isWritable: false },
        // Merkle tree
        { pubkey: merkleTree, isSigner: false, isWritable: true },
        // Log wrapper (Noop program)
        { pubkey: SPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
        // Compression program - ADD THIS BACK IN THE CORRECT POSITION
        {
          pubkey: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          isSigner: false,
          isWritable: false,
        },
        // System program
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        // Proof path (remaining accounts)
        ...proofNodes.map((p: PublicKey) => ({
          pubkey: p,
          isSigner: false,
          isWritable: false,
        })),
      ];

      const transferInstruction = new TransactionInstruction({
        keys,
        programId: BUBBLEGUM_PROGRAM_ID,
        data: instructionData,
      });

      // Create and configure transaction
      const transaction = new Transaction();
      transaction.add(transferInstruction);

      transactions.push(transaction);
    } catch (err: any) {
      console.error(`❌ Failed to build transaction for ${mint}:`, err.message);
    }
  }

  console.log(`🚀 Signing and sending ${transactions.length} transactions...`);

  // Get latest blockhash for all transactions
  const { blockhash } = await connection.getLatestBlockhash();

  // Set blockhash for all transactions
  transactions.forEach((transaction) => {
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
  });

  // Sign all transactions at once
  const signedTransactions = await wallet.signAllTransactions(transactions);

  // Send all transactions
  for (let i = 0; i < signedTransactions.length; i++) {
    try {
      const signature = await connection.sendRawTransaction(
        signedTransactions[i].serialize(),
        {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        }
      );

      console.log(`✅ Transaction ${i + 1} sent: ${signature}`);
      signatures.push(signature);
    } catch (err: any) {
      console.error(`❌ Failed to send transaction ${i + 1}:`, err.message);
      if (err.logs) {
        console.error("Full error logs:", err.logs);
      }
    }
  }

  // Confirm all transactions
  console.log(`⏳ Confirming ${signatures.length} transactions...`);
  for (let i = 0; i < signatures.length; i++) {
    try {
      await connection.confirmTransaction(
        {
          signature: signatures[i],
          blockhash,
          lastValidBlockHeight: (await connection.getLatestBlockhash())
            .lastValidBlockHeight,
        },
        "confirmed"
      );
      console.log(`✅ Transaction ${i + 1} confirmed: ${signatures[i]}`);
    } catch (err: any) {
      console.error(`❌ Failed to confirm transaction ${i + 1}:`, err.message);
    }
  }

  console.log(
    `🎉 Successfully transferred ${signatures.length} out of ${nftMints.length} cNFTs`
  );
  return signatures;
}
