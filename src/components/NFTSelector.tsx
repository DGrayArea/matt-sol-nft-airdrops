import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { createConnection } from "@/lib/solana/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchWalletNFTs,
  fetchWalletCNFTs,
  NFTMetadata,
} from "@/lib/solana/nft-fetcher";

interface NFTSelectorProps {
  addressCount: number;
  nftType: "regular" | "cnft";
  selectedNFTs: string[];
  onNFTsChange: (nfts: string[]) => void;
  onNFTDataChange?: (nfts: NFTMetadata[]) => void; // Callback to expose full NFT data
}

export const NFTSelector = ({
  addressCount,
  nftType,
  selectedNFTs,
  onNFTsChange,
  onNFTDataChange,
}: NFTSelectorProps) => {
  const { connected, publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [nfts, setNfts] = useState<NFTMetadata[]>([]);

  // Expose NFT data to parent component
  useEffect(() => {
    if (onNFTDataChange && nfts.length > 0) {
      onNFTDataChange(nfts);
    }
  }, [nfts, onNFTDataChange]);

  // Test address with compressed NFTs for testing
  const TEST_ADDRESS = "FoYErQY3Q3Un8e1FCeS4PhAeTMj4WeLkJBoXpve8oPj6";

  useEffect(() => {
    if (connected && publicKey) {
      // Load NFTs from connected wallet
      loadNFTs();
    } else {
      // Load test NFTs when no wallet is connected
      // loadTestNFTs();
    }
  }, [connected, publicKey, nftType]);

  const loadNFTs = async () => {
    if (!publicKey) return;

    setLoading(true);
    try {
      const connection = createConnection();

      console.log("🔍 Loading NFTs for type:", nftType);
      console.log("🔗 Using RPC endpoint:", connection.rpcEndpoint);
      console.log("👤 Loading from wallet:", publicKey.toString());

      const fetchedNFTs =
        nftType === "cnft"
          ? await fetchWalletCNFTs(connection, publicKey)
          : await fetchWalletNFTs(connection, publicKey);

      console.log("📊 Fetched NFTs:", fetchedNFTs);
      setNfts(fetchedNFTs);

      if (fetchedNFTs.length === 0) {
        toast.info(
          `No ${nftType === "cnft" ? "compressed" : "regular"} NFTs found in your wallet`
        );
      } else {
        toast.success(
          `Loaded ${fetchedNFTs.length} ${nftType === "cnft" ? "compressed" : "regular"} NFT${fetchedNFTs.length !== 1 ? "s" : ""} from your wallet`
        );
      }
    } catch (error) {
      console.error("Error loading NFTs:", error);
      toast.error("Failed to load NFTs. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadTestNFTs = async () => {
    setLoading(true);
    try {
      const connection = createConnection();
      const { PublicKey } = await import("@solana/web3.js");
      const testPublicKey = new PublicKey(TEST_ADDRESS);

      console.log("🔍 Loading test NFTs for type:", nftType);
      console.log("🔗 Using RPC endpoint:", connection.rpcEndpoint);

      const fetchedNFTs =
        nftType === "cnft"
          ? await fetchWalletCNFTs(connection, testPublicKey)
          : await fetchWalletNFTs(connection, testPublicKey);

      console.log("📊 Fetched NFTs:", fetchedNFTs);
      setNfts(fetchedNFTs);

      if (fetchedNFTs.length === 0) {
        toast.info(
          `No ${nftType === "cnft" ? "compressed" : "regular"} NFTs found in test address`
        );
      } else {
        toast.success(
          `Loaded ${fetchedNFTs.length} test ${nftType === "cnft" ? "compressed" : "regular"} NFT${fetchedNFTs.length !== 1 ? "s" : ""} from demo address`
        );
      }
    } catch (error) {
      console.error("Error loading test NFTs:", error);
      toast.error("Failed to load test NFTs. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSelect = () => {
    if (addressCount === 0) {
      toast.error("Add recipient addresses first");
      return;
    }

    if (nfts.length < addressCount) {
      toast.warning(
        `Only ${nfts.length} NFT${nfts.length !== 1 ? "s" : ""} available, but ${addressCount} addresses provided. Auto-selecting all available NFTs.`
      );
      // Auto-select all available NFTs
      const autoSelected = nfts.map((nft) => nft.mint);
      onNFTsChange(autoSelected);
      toast.info(
        `Auto-selected all ${nfts.length} available NFT${nfts.length !== 1 ? "s" : ""}. You can manually select more if you add more NFTs to your wallet.`
      );
      return;
    }

    const autoSelected = nfts.slice(0, addressCount).map((nft) => nft.mint);
    onNFTsChange(autoSelected);
    toast.success(
      `Auto-selected ${addressCount} NFT${addressCount !== 1 ? "s" : ""}`
    );
  };

  const toggleNFT = (nftId: string) => {
    if (selectedNFTs.includes(nftId)) {
      onNFTsChange(selectedNFTs.filter((id) => id !== nftId));
    } else {
      if (selectedNFTs.length >= addressCount && addressCount > 0) {
        toast.error(
          `You can only select ${addressCount} NFT${addressCount !== 1 ? "s" : ""} (matching recipient count)`
        );
        return;
      }
      onNFTsChange([...selectedNFTs, nftId]);
    }
  };

  if (!connected) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <p>Connect wallet to view your NFTs</p>
          <p className="text-sm text-blue-600">
            Or use test NFTs from demo address
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {connected ? "Loading your NFTs..." : "Loading test NFTs..."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              Select NFTs
              {!connected && (
                <Badge variant="secondary" className="text-xs">
                  Test Mode
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {connected
                ? `Choose ${addressCount > 0 ? addressCount : "your"} NFT${addressCount !== 1 ? "s" : ""} to distribute`
                : "Testing with demo NFTs from Foyer address"}
            </CardDescription>
          </div>
          {addressCount > 0 && (
            <Button
              onClick={handleAutoSelect}
              variant="secondary"
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Auto-select {addressCount}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Warning if more NFTs than addresses */}
          {addressCount > 0 && nfts.length > addressCount && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ You have {nfts.length} NFT{nfts.length !== 1 ? "s" : ""} but
                only {addressCount} address{addressCount !== 1 ? "es" : ""}.
                Only {addressCount} NFT{addressCount !== 1 ? "s" : ""} will be
                sent.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Selected: {selectedNFTs.length} /{" "}
              {addressCount > 0 ? addressCount : nfts.length}
            </span>
            {selectedNFTs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNFTsChange([])}
              >
                Clear selection
              </Button>
            )}
          </div>

          <ScrollArea className="h-[400px] pr-4">
            {nfts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mb-3 opacity-50" />
                <p>No NFTs found in your wallet</p>
                <Button
                  onClick={loadNFTs}
                  variant="outline"
                  size="sm"
                  className="mt-4"
                >
                  Refresh
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  // Group NFTs by collection
                  const groupedNFTs = nfts.reduce(
                    (groups, nft) => {
                      const collection = nft.collection || "Unnamed Collection";
                      if (!groups[collection]) {
                        groups[collection] = [];
                      }
                      groups[collection].push(nft);
                      return groups;
                    },
                    {} as Record<string, typeof nfts>
                  );

                  return Object.entries(groupedNFTs).map(
                    ([collection, collectionNFTs]) => (
                      <div key={collection} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-foreground">
                            {collection}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {collectionNFTs.length} NFT
                            {collectionNFTs.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {collectionNFTs.map((nft) => {
                            const isSelected = selectedNFTs.includes(nft.mint);
                            return (
                              <div
                                key={nft.mint}
                                onClick={() => toggleNFT(nft.mint)}
                                className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all hover:scale-105 ${
                                  isSelected
                                    ? "border-primary shadow-lg"
                                    : "border-border/50 hover:border-primary/50"
                                }`}
                              >
                                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                                  {nft.image &&
                                  nft.image !== "/placeholder.svg" ? (
                                    <img
                                      src={nft.image}
                                      alt={nft.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                        e.currentTarget.parentElement!.innerHTML =
                                          '<div class="flex items-center justify-center w-full h-full"><svg class="h-12 w-12 text-muted-foreground/50" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>';
                                      }}
                                    />
                                  ) : (
                                    <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
                                  )}
                                </div>
                                <div className="p-2 bg-card">
                                  <p className="text-xs font-medium truncate">
                                    {nft.name}
                                  </p>
                                  {nft.collection && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] mt-1"
                                    >
                                      {nft.collection}
                                    </Badge>
                                  )}
                                </div>
                                {isSelected && (
                                  <div className="absolute top-2 right-2 bg-primary rounded-full p-1">
                                    <Checkbox
                                      checked
                                      className="h-4 w-4 border-0"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  );
                })()}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};
