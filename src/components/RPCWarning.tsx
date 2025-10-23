import { useState, useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { X, AlertTriangle, ExternalLink } from "lucide-react";
import { getCurrentRPCProvider, checkDASSupport } from "@/lib/solana/config";
import { createConnection } from "@/lib/solana/config";

export const RPCWarning = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [dasSupported, setDasSupported] = useState<boolean | null>(null);
  const rpcProvider = getCurrentRPCProvider();

  useEffect(() => {
    // Check DAS support for compressed NFTs
    const checkSupport = async () => {
      const connection = createConnection();
      const supported = await checkDASSupport(connection);
      setDasSupported(supported);

      // Show warning if using public RPC or if DAS is not supported
      if (rpcProvider.name === "Public Solana RPC" || !supported) {
        setShowWarning(true);
      }
    };

    checkSupport();
  }, []);

  if (!showWarning || dasSupported === null) {
    return null;
  }

  return (
    <Alert className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-800 dark:text-amber-200">
        RPC Configuration Notice
      </AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-300">
        <div className="space-y-2">
          <p>
            You're currently using the <strong>{rpcProvider.name}</strong> which
            has:
          </p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Rate limit: {rpcProvider.rateLimit}</li>
            <li>DAS API support: {dasSupported ? "✅ Yes" : "❌ No"}</li>
            <li>Cost: {rpcProvider.cost}</li>
          </ul>

          {!dasSupported && (
            <div className="mt-3 p-3 bg-amber-100 dark:bg-amber-900 rounded-md">
              <p className="text-sm font-medium">
                ⚠️ Compressed NFT transfers require DAS API support
              </p>
              <p className="text-xs mt-1">
                Consider upgrading to a premium RPC provider for full
                functionality.
              </p>
            </div>
          )}

          <div className="flex gap-2 mt-3">
            {rpcProvider.website && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => window.open(rpcProvider.website, "_blank")}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {rpcProvider.name}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowWarning(false)}
            >
              <X className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
};
