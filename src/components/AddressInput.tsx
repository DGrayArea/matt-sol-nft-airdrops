import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import Papa from 'papaparse';

interface AddressInputProps {
  addresses: string[];
  onAddressesChange: (addresses: string[]) => void;
}

export const AddressInput = ({ addresses, onAddressesChange }: AddressInputProps) => {
  const [inputValue, setInputValue] = useState('');

  const validateSolanaAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  const parseAddresses = (text: string): string[] => {
    const parsed = text
      .split(/[\n,\s]+/)
      .map(addr => addr.trim())
      .filter(addr => addr.length > 0);
    return [...new Set(parsed)]; // Remove duplicates
  };

  const handlePaste = () => {
    const parsed = parseAddresses(inputValue);
    const validAddresses: string[] = [];
    const invalidAddresses: string[] = [];

    parsed.forEach(addr => {
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
      toast.success(`Added ${validAddresses.length} valid address(es)`);
      setInputValue('');
    }

    if (invalidAddresses.length > 0) {
      toast.error(`${invalidAddresses.length} invalid address(es) skipped`);
    }
  };

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      complete: (results) => {
        const allAddresses: string[] = [];
        results.data.forEach((row: any) => {
          if (Array.isArray(row)) {
            row.forEach(cell => {
              if (typeof cell === 'string' && cell.trim()) {
                allAddresses.push(cell.trim());
              }
            });
          }
        });

        const validAddresses: string[] = [];
        const invalidAddresses: string[] = [];

        allAddresses.forEach(addr => {
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
        toast.error('Failed to parse CSV file');
      }
    });

    event.target.value = '';
  };

  const removeAddress = (addressToRemove: string) => {
    onAddressesChange(addresses.filter(addr => addr !== addressToRemove));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Paste Addresses</label>
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
            className="flex-1"
          >
            Add Addresses
          </Button>
          <label htmlFor="csv-upload">
            <Button variant="secondary" className="gap-2" asChild>
              <span>
                <Upload className="h-4 w-4" />
                Upload CSV
              </span>
            </Button>
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            className="hidden"
          />
        </div>
      </div>

    </div>
  );
};
