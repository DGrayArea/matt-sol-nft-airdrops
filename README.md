# Solana NFT Distributor

A powerful web application for distributing Solana NFTs and Compressed NFTs to multiple recipients. Perfect for airdrops, giveaways, and community distributions.

## Features

- **Dual NFT Support**: Distribute both Regular NFTs and Compressed NFTs (cNFTs)
- **Batch Distribution**: Send NFTs to multiple recipients in a single transaction
- **Wallet Integration**: Seamless Solana wallet connection with multiple wallet support
- **Address Validation**: Automatic validation of recipient addresses
- **1:1 Distribution**: Ensures fair distribution with one NFT per recipient
- **Transaction Tracking**: View transaction details on Solscan
- **Modern UI**: Built with React, TypeScript, and Tailwind CSS

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A Solana wallet (Phantom, Solflare, etc.)

### Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd solana-nft-distributor
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:
   Create a `.env` file in the root directory:

```env
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

4. Start the development server:

```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:8080`

## Usage

1. **Connect Wallet**: Click the "Connect Wallet" button and select your preferred Solana wallet
2. **Select NFT Type**: Choose between Regular NFTs or Compressed NFTs
3. **Add Recipients**: Enter Solana wallet addresses manually or upload a CSV file
4. **Select NFTs**: Choose which NFTs to send to each recipient
5. **Send**: Click the send button to distribute NFTs to all recipients

## NFT Types

### Regular NFTs

- Standard Solana NFTs using the Metaplex Token Metadata standard
- Higher transaction costs but full metadata support
- Best for smaller distributions

### Compressed NFTs (cNFTs)

- Compressed NFTs using Metaplex Bubblegum
- More cost-effective for large distributions
- Reduced metadata but significant cost savings

## Technologies Used

- **Frontend**: React 18, TypeScript, Vite
- **UI Components**: shadcn/ui, Radix UI, Tailwind CSS
- **Solana Integration**: @solana/web3.js, @metaplex-foundation/js
- **Wallet Integration**: @solana/wallet-adapter-react
- **State Management**: React Query, React Hook Form
- **Build Tool**: Vite

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── AddressInput.tsx
│   ├── NFTSelector.tsx
│   └── WalletProvider.tsx
├── hooks/              # Custom React hooks
├── lib/                # Utility libraries
│   └── solana/         # Solana-specific utilities
├── pages/              # Page components
└── main.tsx           # Application entry point
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature-name`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please open an issue on GitHub or contact the development team.

## Disclaimer

This software is provided as-is. Always test with small amounts before large distributions. The developers are not responsible for any loss of funds or NFTs.
BLXbdLXDhTefYJoRb6hL58NEKxyLtiwoc3EMxqbQ36iZ, 2YmxhX29aa1fqRehS7Q6grDiWgtxo5ScgVrEKXNBF9kF
