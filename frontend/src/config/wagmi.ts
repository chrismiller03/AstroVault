import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'AstroVault Fundraise',
  projectId: '9e7e3c1c6b0e4ac49e9bde630e2ea02e', // WalletConnect project id (static, no env)
  chains: [sepolia],
  ssr: false,
});
