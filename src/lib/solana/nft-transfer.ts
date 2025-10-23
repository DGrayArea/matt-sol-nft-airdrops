import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Keypair,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { WalletContextState } from "@solana/wallet-adapter-react";
// Note: Compressed NFT transfers require additional setup with DAS API
// For now, we'll provide a placeholder implementation

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
      createTransferInstruction(
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

  // Sign and send transaction
  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize());

  // Confirm transaction
  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  });

  return signature;
}

// Note: Asset interfaces will be added when implementing full cNFT support

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

  // For now, provide a clear error message about compressed NFT transfer requirements
  throw new Error(
    "Compressed NFT transfers require additional setup:\n\n" +
      "1. A premium RPC provider with DAS API support (Helius, QuickNode, or Alchemy)\n" +
      "2. Proper Bubblegum program integration\n" +
      "3. Asset proof fetching from DAS API\n\n" +
      "For now, please use Regular NFTs which are fully supported.\n\n" +
      "To enable cNFT transfers, you'll need to:\n" +
      "- Upgrade to a premium RPC provider\n" +
      "- Implement the full Bubblegum transfer logic with asset proofs\n" +
      "- Handle Merkle tree operations properly"
  );
}

// Note: Helper functions for DAS API integration will be added when implementing full cNFT support
