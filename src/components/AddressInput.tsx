import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X, Upload } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";

interface AddressInputProps {
  addresses: string[];
  onAddressesChange: (addresses: string[]) => void;
}

export const AddressInput = ({
  addresses,
  onAddressesChange,
}: AddressInputProps) => {
  const [inputValue, setInputValue] = useState("");

  const validateSolanaAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  const parseAddresses = (text: string): string[] => {
    // Split by multiple delimiters: commas, semicolons, newlines, and multiple spaces
    const parsed = text
      .split(/[,;\n\r\s]+/) // Split by comma, semicolon, newline, carriage return, or whitespace
      .map((addr) => addr.trim()) // Trim whitespace from each address
      .filter((addr) => addr.length > 0); // Remove empty strings

    // Remove duplicates and return unique addresses
    return [...new Set(parsed)];
  };

  const handlePaste = () => {
    const parsed = parseAddresses(inputValue);
    const validAddresses: string[] = [];
    const invalidAddresses: string[] = [];
    const duplicateAddresses: string[] = [];

    parsed.forEach((addr) => {
      if (validateSolanaAddress(addr)) {
        if (!addresses.includes(addr)) {
          validAddresses.push(addr);
        } else {
          duplicateAddresses.push(addr);
        }
      } else {
        invalidAddresses.push(addr);
      }
    });

    if (validAddresses.length > 0) {
      onAddressesChange([...addresses, ...validAddresses]);
      toast.success(`Added ${validAddresses.length} valid address(es)`);
      setInputValue("");
    }

    if (duplicateAddresses.length > 0) {
      toast.info(`${duplicateAddresses.length} duplicate address(es) skipped`);
    }

    if (invalidAddresses.length > 0) {
      toast.error(`${invalidAddresses.length} invalid address(es) skipped`);
    }

    // If no valid addresses were added, clear the input
    if (
      validAddresses.length === 0 &&
      duplicateAddresses.length === 0 &&
      invalidAddresses.length === 0
    ) {
      toast.warning("No addresses found in input");
      setInputValue("");
    }
  };

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const allAddresses: string[] = [];
        results.data.forEach((row: any, index: number) => {
          // Skip header row (index 0)
          if (index === 0) return;

          if (Array.isArray(row) && row.length > 0) {
            // Only take the first column (address column)
            const address = row[0];
            if (typeof address === "string" && address.trim()) {
              allAddresses.push(address.trim());
            }
          }
        });

        const validAddresses: string[] = [];
        const invalidAddresses: string[] = [];

        allAddresses.forEach((addr) => {
          if (validateSolanaAddress(addr)) {
            if (!addresses.includes(addr)) {
              validAddresses.push(addr);
            }
          } else {
            invalidAddresses.push(addr);
          }
        });

        if (validAddresses.length > 0) {
          onAddressesChange([...addresses, ...validAddresses]);
          toast.success(`Added ${validAddresses.length} address(es) from CSV`);
        }

        if (invalidAddresses.length > 0) {
          toast.error(`${invalidAddresses.length} invalid address(es) skipped`);
        }
      },
      error: () => {
        toast.error("Failed to parse CSV file");
      },
    });

    event.target.value = "";
  };

  const removeAddress = (addressToRemove: string) => {
    onAddressesChange(addresses.filter((addr) => addr !== addressToRemove));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Paste Addresses</label>
        <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
          <strong>Supported formats:</strong> Comma-separated, space-separated,
          semicolon-separated, or one per line
        </div>
        <Textarea
          placeholder="Paste Solana addresses here (separated by commas, spaces, or new lines)"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="min-h-32 font-mono text-sm"
        />
        <div className="flex gap-2">
          <Button
            onClick={handlePaste}
            disabled={!inputValue.trim()}
            variant="default"
            className="flex-1 cursor-pointer"
          >
            Add Addresses
          </Button>
          <label htmlFor="csv-upload" className="cursor-pointer">
            <Button
              variant="default"
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              asChild
            >
              <span>
                <Upload className="h-4 w-4" />
                Upload CSV
              </span>
            </Button>
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv,text/csv,application/csv"
            onChange={handleCSVUpload}
            className="hidden"
          />
        </div>

        {/* CSV Format Help */}
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800 mb-2">
            <strong>CSV Format:</strong> One Solana address per line. No headers
            needed.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-600">Need an example?</span>
            <a
              href="/test-addresses.csv"
              download="sample-addresses.csv"
              className="text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer"
            >
              Download Sample CSV
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
