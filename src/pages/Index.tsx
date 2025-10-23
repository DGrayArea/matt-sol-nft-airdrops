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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [nftType, setNftType] = useState<"regular" | "cnft">("regular");
  const [selectedNFTs, setSelectedNFTs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!connected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (addresses.length === 0) {
      toast.error("Please add at least one recipient address");
      return;
    }

    if (selectedNFTs.length !== addresses.length) {
      toast.error(
        `Please select ${addresses.length} NFT${addresses.length !== 1 ? "s" : ""} (one per recipient)`
      );
      return;
    }

    setSending(true);
    const toastId = toast.loading(
      `Sending ${selectedNFTs.length} NFT${selectedNFTs.length !== 1 ? "s" : ""}...`
    );

    try {
      const connection = createConnection();

      let signature: string;

      if (nftType === "cnft") {
        signature = await transferCompressedNFTs({
          connection,
          wallet,
          nftMints: selectedNFTs,
          recipients: addresses,
        });
      } else {
        signature = await transferRegularNFTs({
          connection,
          wallet,
          nftMints: selectedNFTs,
          recipients: addresses,
        });
      }

      toast.success(
        `Successfully sent ${selectedNFTs.length} NFT${selectedNFTs.length !== 1 ? "s" : ""}!`,
        { id: toastId }
      );

      // Reset state
      setAddresses([]);
      setSelectedNFTs([]);

      // Show transaction link
      setTimeout(() => {
        toast.info(
          <div>
            <p className="font-medium">View transaction:</p>
            <a
              href={`https://solscan.io/tx/${signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline text-sm"
            >
              {signature.slice(0, 8)}...{signature.slice(-8)}
            </a>
          </div>,
          { duration: 10000 }
        );
      }, 500);
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
                Solana NFT Distributor
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
              <Tabs
                value={nftType}
                onValueChange={(v) => setNftType(v as "regular" | "cnft")}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="regular">Regular NFTs</TabsTrigger>
                  <TabsTrigger value="cnft">Compressed NFTs</TabsTrigger>
                </TabsList>
                <TabsContent value="regular" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Standard Solana NFTs using the Metaplex Token Metadata
                    standard
                  </p>
                </TabsContent>
                <TabsContent value="cnft" className="mt-4">
                  <p className="text-sm text-muted-foreground">
                    Compressed NFTs (cNFTs) using Metaplex Bubblegum - more
                    cost-effective for large distributions
                  </p>
                </TabsContent>
              </Tabs>
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
        {addresses.length > 0 && (
          <NFTSelector
            addressCount={addresses.length}
            nftType={nftType}
            selectedNFTs={selectedNFTs}
            onNFTsChange={setSelectedNFTs}
          />
        )}

        {/* Send Button */}
        {addresses.length > 0 && (
          <Button
            onClick={handleSend}
            disabled={
              !connected ||
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
                Send {selectedNFTs.length}/{addresses.length} NFT
                {addresses.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
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
