import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection } from "@solana/web3.js";
import { createConnection } from "@/lib/solana/config";
import { AddressInput } from "@/components/AddressInput";
import { NFTSelector } from "@/components/NFTSelector";
import { RPCWarning } from "@/components/RPCWarning";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Wallet, FileCheck, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  transferRegularNFTs,
  transferCompressedNFTs,
} from "@/lib/solana/nft-transfer";

const Index = () => {
  const wallet = useWallet();
  const { connected } = wallet;
  const [addresses, setAddresses] = useState<string[]>([]);
  const [nftType, setNftType] = useState<"regular" | "cnft">("cnft");
  const [selectedNFTs, setSelectedNFTs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [nftData, setNftData] = useState<any[]>([]); // Store full NFT data for transfers

  const handleSend = async () => {
    if (!connected) {
      toast.error(
        "Please connect your wallet to send NFTs. Test mode only allows previewing."
      );
      return;
    }

    if (addresses.length === 0) {
      toast.error("Please add at least one recipient address");
      return;
    }

    if (selectedNFTs.length !== addresses.length) {
      if (selectedNFTs.length < addresses.length) {
        toast.error(
          `You have ${addresses.length} addresses but only ${selectedNFTs.length} NFT${selectedNFTs.length !== 1 ? "s" : ""} selected. Please select one NFT per recipient.`
        );
      } else {
        toast.error(
          `You have ${selectedNFTs.length} NFT${selectedNFTs.length !== 1 ? "s" : ""} selected but only ${addresses.length} address${addresses.length !== 1 ? "es" : ""}. Please add more addresses or deselect some NFTs.`
        );
      }
      return;
    }

    setSending(true);
    const toastId = toast.loading(
      `Sending ${selectedNFTs.length} NFT${selectedNFTs.length !== 1 ? "s" : ""}...`
    );

    try {
      const connection = createConnection();

      // For cNFTs, try to fit as many as possible per transaction
      // For regular NFTs, use larger batches
      let BATCH_SIZE = nftType === "cnft" ? 2 : 20; // Try 2 cNFTs per transaction first
      const signatures: string[] = [];

      if (nftType === "cnft") {
        // Use sequential approach for ALL cNFT transfers with fresh proofs
        toast.loading(
          `Processing ${selectedNFTs.length} cNFTs sequentially with fresh proofs...`,
          { id: toastId }
        );

        try {
          // Debug: Check selectedNFTs structure
          console.log("🔍 Selected NFTs:", selectedNFTs);

          const batchSignatures = await transferCompressedNFTs({
            connection,
            wallet,
            nftMints: selectedNFTs, // selectedNFTs already contains the mint addresses
            recipients: addresses,
          });

          signatures.push(...batchSignatures);
        } catch (error: any) {
          console.error("Optimized batch transfer failed:", error);
          throw new Error(`Batch transfer failed: ${error.message}`);
        }
      } else {
        // Batch processing for regular NFTs
        const batches = [];
        for (let i = 0; i < selectedNFTs.length; i += BATCH_SIZE) {
          const batchNFTs = selectedNFTs.slice(i, i + BATCH_SIZE);
          const batchRecipients = addresses.slice(i, i + BATCH_SIZE);
          batches.push({ nfts: batchNFTs, recipients: batchRecipients });
        }

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          toast.loading(
            `Sending batch ${i + 1}/${batches.length} (${batch.nfts.length} NFTs)...`,
            { id: toastId }
          );

          const signature = await transferRegularNFTs({
            connection,
            wallet,
            nftMints: batch.nfts,
            recipients: batch.recipients,
          });

          signatures.push(signature);

          // Small delay between batches to avoid rate limits
          if (i < batches.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      const batchInfo =
        nftType === "cnft"
          ? ` (sequential transfer with fresh proofs)`
          : signatures.length > 1
            ? ` in ${signatures.length} batches`
            : "";

      toast.success(
        `Successfully sent ${selectedNFTs.length} NFT${selectedNFTs.length !== 1 ? "s" : ""}${batchInfo}!`,
        { id: toastId }
      );

      // Reset state
      setAddresses([]);
      setSelectedNFTs([]);

      // Show transaction link (use the last signature if multiple batches)
      if (signatures.length > 0) {
        const lastSignature = signatures[signatures.length - 1];
        setTimeout(() => {
          toast.info(
            <div>
              <p className="font-medium">View transaction:</p>
              <a
                href={`https://solscan.io/tx/${lastSignature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline text-sm"
              >
                {lastSignature.slice(0, 8)}...{lastSignature.slice(-8)}
              </a>
            </div>,
            { duration: 10000 }
          );
        }, 500);
      } else {
        toast.error(
          "No NFTs were transferred. All NFTs were skipped due to missing proof data."
        );
      }
    } catch (error: any) {
      console.error("Error sending NFTs:", error);
      toast.error(error.message || "Failed to send NFTs. Please try again.", {
        id: toastId,
      });
    } finally {
      setSending(false);
    }
  };

  const removeAddress = (addressToRemove: string) => {
    setAddresses(addresses.filter((addr) => addr !== addressToRemove));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Send className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                SOL NFT SENDER
              </span>
            </div>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Hero Section */}
        <div className="text-center mb-12 space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
            Distribute NFTs at Scale
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Send Solana NFTs and Compressed NFTs to multiple recipients with
            ease. Perfect for airdrops, giveaways, and community distributions.
          </p>
        </div>

        {/* RPC Configuration Warning */}
        <RPCWarning />

        {/* Wallet Connection Required */}
        {!connected && (
          <Card className="mb-8 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
            <CardContent className="flex items-center gap-4 py-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Connect Your Wallet</h3>
                <p className="text-sm text-muted-foreground">
                  Connect your Solana wallet to get started with NFT
                  distribution
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Distribution Card */}
        <Card className="shadow-lg border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" />
              Configure Distribution
            </CardTitle>
            <CardDescription>
              Select NFT type and add recipient addresses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* NFT Type Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">NFT Type</label>
              <Select
                value={nftType}
                onValueChange={(value) =>
                  setNftType(value as "regular" | "cnft")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select NFT type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cnft">Compressed NFTs (cNFTs)</SelectItem>
                  <SelectItem value="regular">Regular NFTs</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {nftType === "cnft"
                  ? "Compressed NFTs using Metaplex Bubblegum - more cost-effective for large distributions"
                  : "Standard Solana NFTs using the Metaplex Token Metadata standard"}
              </p>
            </div>

            {/* Address Input */}
            <AddressInput
              addresses={addresses}
              onAddressesChange={setAddresses}
            />
          </CardContent>
        </Card>

        {/* Address Grid Display */}
        {addresses.length > 0 && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">
                Recipients ({addresses.length})
              </CardTitle>
              <CardDescription>
                Review and manage recipient addresses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {addresses.map((address) => (
                  <div
                    key={address}
                    className="flex items-center justify-between gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono group hover:border-primary transition-colors"
                  >
                    <span className="truncate flex-1">{address}</span>
                    <button
                      onClick={() => removeAddress(address)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* NFT Selector */}
        <NFTSelector
          addressCount={addresses.length}
          nftType={nftType}
          selectedNFTs={selectedNFTs}
          onNFTsChange={setSelectedNFTs}
          onNFTDataChange={setNftData}
        />

        {/* Send Button */}
        {addresses.length > 0 && (
          <div className="space-y-2">
            {!connected && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Test Mode: You can select and preview transfers, but actual
                  sending requires a connected wallet.
                </p>
              </div>
            )}
            <Button
              onClick={handleSend}
              disabled={
                addresses.length === 0 ||
                selectedNFTs.length !== addresses.length ||
                sending
              }
              className="w-full gap-2 text-base py-6"
              size="lg"
            >
              {sending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  {connected ? "Send" : "Preview Send"} {selectedNFTs.length}/
                  {addresses.length} NFT
                  {addresses.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-primary mb-2">1:1</div>
              <p className="text-sm text-muted-foreground">
                One NFT per recipient for fair distribution
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-accent mb-2">
                Verified
              </div>
              <p className="text-sm text-muted-foreground">
                All addresses validated before sending
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-primary mb-2">Batch</div>
              <p className="text-sm text-muted-foreground">
                Send to multiple recipients at once
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Index;
