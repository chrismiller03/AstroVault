import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="brand">
          <div className="brand-mark">AV</div>
          <div>
            <p className="eyebrow">AstroVault</p>
            <h1>Confidential Fundraise</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className="network-pill">Sepolia</span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
