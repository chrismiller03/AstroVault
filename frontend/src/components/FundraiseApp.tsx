import { useMemo, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';

import { CUSDT_ADDRESS, CUSDT_ABI, FUNDRAISE_ADDRESS, FUNDRAISE_ABI } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { Header } from './Header';
import '../styles/Fundraise.css';

type CampaignDetails = {
  owner: string;
  name: string;
  deadline: number;
  targetHandle: string;
  totalHandle: string;
  finalized: boolean;
};

type DecryptedTotals = {
  target?: string;
  total?: string;
};

type CampaignRaw = readonly [
  `0x${string}`,
  string,
  bigint,
  `0x${string}`,
  `0x${string}`,
  boolean,
];

export function FundraiseApp() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();
  const addressesReady =true
  const [createForm, setCreateForm] = useState({ name: '', target: '', deadline: '' });
  const [contributionAmount, setContributionAmount] = useState('');
  const [mintAmount, setMintAmount] = useState('500');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptedContribution, setDecryptedContribution] = useState('');
  const [decryptedTotals, setDecryptedTotals] = useState<DecryptedTotals>({});

  const { data: activeCampaignId, refetch: refetchActiveCampaign } = useReadContract({
    address: FUNDRAISE_ADDRESS,
    abi: FUNDRAISE_ABI,
    functionName: 'activeCampaignId',
    query: { refetchInterval: 8000, enabled: addressesReady },
  });

  const campaignId = activeCampaignId ? Number(activeCampaignId) : 0;

  const { data: campaignRaw, refetch: refetchCampaign } = useReadContract({
    address: FUNDRAISE_ADDRESS,
    abi: FUNDRAISE_ABI,
    functionName: 'getCampaign',
    args: campaignId ? [BigInt(campaignId)] : undefined,
    query: { enabled: addressesReady && campaignId > 0, refetchInterval: 8000 },
  });

  const campaign = useMemo<CampaignDetails | null>(() => {
    if (!campaignRaw) return null;
    const [owner, name, deadline, target, total, finalized] = campaignRaw as CampaignRaw;
    return {
      owner: owner as string,
      name: name as string,
      deadline: Number(deadline),
      targetHandle: target as string,
      totalHandle: total as string,
      finalized: Boolean(finalized),
    };
  }, [campaignRaw]);

  const { data: myEncryptedContribution, refetch: refetchContribution } = useReadContract({
    address: FUNDRAISE_ADDRESS,
    abi: FUNDRAISE_ABI,
    functionName: 'getContribution',
    args: campaignId && address ? [BigInt(campaignId), address] : undefined,
    query: { enabled: addressesReady && Boolean(campaignId && address), refetchInterval: 8000 },
  });

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '--';
    return new Date(timestamp * 1000).toLocaleString();
  };

  const resetStatus = () => setStatus(null);

  const ensureSigner = async () => {
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Connect wallet to continue');
    }
    return signer;
  };

  const handleCreateCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    resetStatus();

    if (!addressesReady) {
      setStatus('Add deployed contract addresses in config before creating a campaign.');
      return;
    }

    if (campaignId) {
      setStatus('A campaign is already running.');
      return;
    }

    const parsedDeadline = Math.floor(new Date(createForm.deadline).getTime() / 1000);
    const parsedTarget = Number(createForm.target);

    if (!createForm.name.trim() || !parsedTarget || Number.isNaN(parsedDeadline) || parsedDeadline <= Date.now() / 1000) {
      setStatus('Please provide a name, future deadline, and target amount.');
      return;
    }

    try {
      setPendingAction('Creating campaign...');
      const signer = await ensureSigner();
      const fundraise = new Contract(FUNDRAISE_ADDRESS, FUNDRAISE_ABI, signer);
      const tx = await fundraise.createCampaign(createForm.name.trim(), parsedTarget, parsedDeadline);
      await tx.wait();
      setStatus('Campaign created successfully.');
      setCreateForm({ name: '', target: '', deadline: '' });
      await refetchActiveCampaign();
      await refetchCampaign();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Failed to create campaign.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleMint = async () => {
    resetStatus();
    if (!addressesReady) {
      setStatus('Add deployed contract addresses in config to mint and contribute.');
      return;
    }
    if (!address) {
      setStatus('Connect wallet to mint cUSDT.');
      return;
    }

    const parsed = Number(mintAmount);
    if (!parsed || parsed <= 0) {
      setStatus('Mint amount must be greater than zero.');
      return;
    }

    try {
      setPendingAction('Minting cUSDT...');
      const signer = await ensureSigner();
      const cusdt = new Contract(CUSDT_ADDRESS, CUSDT_ABI, signer);
      const tx = await cusdt.mint(address, BigInt(parsed));
      await tx.wait();
      setStatus(`Minted ${parsed} cUSDT to your wallet.`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Mint failed.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleSetOperator = async () => {
    resetStatus();
    if (!addressesReady) {
      setStatus('Add deployed contract addresses in config to continue.');
      return;
    }
    if (!address) {
      setStatus('Connect wallet to set the operator.');
      return;
    }
    const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    try {
      setPendingAction('Authorizing fundraiser to pull cUSDT...');
      const signer = await ensureSigner();
      const cusdt = new Contract(CUSDT_ADDRESS, CUSDT_ABI, signer);
      const tx = await cusdt.setOperator(FUNDRAISE_ADDRESS, expiry);
      await tx.wait();
      setStatus('Operator permission granted for the fundraiser contract.');
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Failed to set operator.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleContribute = async () => {
    resetStatus();

    if (!addressesReady) {
      setStatus('Add deployed contract addresses in config to continue.');
      return;
    }

    if (!campaignId || !campaign || campaign.finalized) {
      setStatus('No active campaign to contribute to.');
      return;
    }

    const parsedAmount = Number(contributionAmount);
    if (!parsedAmount || parsedAmount <= 0) {
      setStatus('Enter a contribution amount greater than zero.');
      return;
    }

    if (!instance) {
      setStatus('Encryption service not ready yet.');
      return;
    }

    try {
      setPendingAction('Encrypting and contributing...');
      const signer = await ensureSigner();
      const buffer = instance.createEncryptedInput(CUSDT_ADDRESS, FUNDRAISE_ADDRESS);
      buffer.add64(BigInt(parsedAmount));
      const encrypted = await buffer.encrypt();

      const fundraise = new Contract(FUNDRAISE_ADDRESS, FUNDRAISE_ABI, signer);
      const tx = await fundraise.contribute(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setStatus('Contribution sent.');
      setContributionAmount('');
      await refetchContribution();
      await refetchCampaign();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Contribution failed.');
    } finally {
      setPendingAction(null);
    }
  };

  const handleFinalize = async () => {
    resetStatus();
    if (!addressesReady) {
      setStatus('Add deployed contract addresses in config to finalize.');
      return;
    }
    if (!campaignId || !campaign) return;
    if (!address || campaign.owner.toLowerCase() !== address.toLowerCase()) {
      setStatus('Only the campaign owner can finalize.');
      return;
    }

    try {
      setPendingAction('Finalizing campaign...');
      const signer = await ensureSigner();
      const fundraise = new Contract(FUNDRAISE_ADDRESS, FUNDRAISE_ABI, signer);
      const tx = await fundraise.finalizeCampaign();
      await tx.wait();
      setStatus('Campaign finalized and funds released.');
      await refetchActiveCampaign();
      await refetchCampaign();
      await refetchContribution();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Finalize failed.');
    } finally {
      setPendingAction(null);
    }
  };

  const decryptHandles = async (handles: string[]) => {
    if (!instance) throw new Error('Encryption service unavailable.');
    const signer = await ensureSigner();
    const keypair = instance.generateKeypair();
    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '7';
    const contractAddresses = [FUNDRAISE_ADDRESS];
    const pairs = handles.map((handle) => ({
      handle,
      contractAddress: FUNDRAISE_ADDRESS,
    }));

    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
    const signature = await signer.signTypedData(
      eip712.domain,
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
      eip712.message
    );

    return instance.userDecrypt(
      pairs,
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contractAddresses,
      address || '',
      startTimeStamp,
      durationDays
    );
  };

  const handleDecryptContribution = async () => {
    resetStatus();
    if (!addressesReady) {
      setStatus('Add deployed contract addresses in config to decrypt.');
      return;
    }
    if (!myEncryptedContribution) {
      setStatus('No contribution to decrypt yet.');
      return;
    }

    try {
      setDecrypting(true);
      const handles = await decryptHandles([myEncryptedContribution as string]);
      const decrypted = handles[myEncryptedContribution as string] || '0';
      setDecryptedContribution(decrypted);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Unable to decrypt contribution.');
    } finally {
      setDecrypting(false);
    }
  };

  const handleDecryptTotals = async () => {
    resetStatus();
    if (!addressesReady) {
      setStatus('Add deployed contract addresses in config to decrypt.');
      return;
    }
    if (!campaign) {
      setStatus('No campaign data to decrypt.');
      return;
    }

    try {
      setDecrypting(true);
      const handles = await decryptHandles([campaign.targetHandle, campaign.totalHandle]);
      setDecryptedTotals({
        target: handles[campaign.targetHandle] || '0',
        total: handles[campaign.totalHandle] || '0',
      });
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Unable to decrypt totals.');
    } finally {
      setDecrypting(false);
    }
  };

  return (
    <div className="fundraise-shell">
      <Header />
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Encrypted crowdfunding powered by Zama</p>
          <h1>AstroVault Fundraise</h1>
          <p className="lead">
            Launch a confidential raise, accept private cUSDT contributions, and withdraw whenever you are ready.
            Everything stays encrypted on-chain while you keep control.
          </p>
          <div className="hero-meta">
            <span className="badge">FHE-secured</span>
            <span className="badge">Sepolia only</span>
            <span className="badge">No mock data</span>
          </div>
        </div>
        <div className="hero-card">
          <div className="stat-line">
            <span>Status</span>
            <strong>{campaign ? (campaign.finalized ? 'Finalized' : 'Active') : 'No campaign'}</strong>
          </div>
          <div className="stat-line">
            <span>Deadline</span>
            <strong>{campaign ? formatDate(campaign.deadline) : '—'}</strong>
          </div>
          <div className="stat-line">
            <span>Owner</span>
            <strong className="mono">{campaign ? campaign.owner : '—'}</strong>
          </div>
          <div className="stat-actions">
            {campaign && !campaign.finalized && address && campaign.owner.toLowerCase() === address.toLowerCase() ? (
              <button className="primary" onClick={handleFinalize} disabled={!!pendingAction}>
                {pendingAction === 'Finalizing campaign...' ? 'Finalizing...' : 'Finalize & Withdraw'}
              </button>
            ) : (
              <p className="muted">Connect as the owner to finalize.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Step 1</p>
              <h2>Create campaign</h2>
            </div>
            <span className="pill">{campaign ? 'In progress' : 'Ready'}</span>
          </div>
          <form className="form" onSubmit={handleCreateCampaign}>
            <label>
              <span>Campaign name</span>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g., Mars Habitat Launch"
              />
            </label>
            <label>
              <span>Target amount (cUSDT)</span>
              <input
                type="number"
                min="1"
                value={createForm.target}
                onChange={(e) => setCreateForm({ ...createForm, target: e.target.value })}
                placeholder="1000"
              />
            </label>
            <label>
              <span>Deadline</span>
              <input
                type="datetime-local"
                value={createForm.deadline}
                onChange={(e) => setCreateForm({ ...createForm, deadline: e.target.value })}
              />
            </label>
            <button className="primary" type="submit" disabled={!!campaignId || !!pendingAction}>
              {pendingAction ? pendingAction : 'Launch campaign'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Step 2</p>
              <h2>Fund with cUSDT</h2>
            </div>
            <span className="pill">{campaign ? 'Live' : 'Waiting'}</span>
          </div>
          <div className="form">
            <label>
              <span>Mint test cUSDT</span>
              <div className="inline">
                <input
                  type="number"
                  min="1"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                />
                <button type="button" className="ghost" onClick={handleMint} disabled={!!pendingAction}>
                  {pendingAction === 'Minting cUSDT...' ? 'Minting...' : 'Mint'}
                </button>
              </div>
            </label>
            <label>
              <span>Contribution amount</span>
              <div className="inline">
                <input
                  type="number"
                  min="1"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  placeholder="250"
                />
                <button type="button" className="ghost" onClick={handleSetOperator} disabled={!!pendingAction}>
                  {pendingAction === 'Authorizing fundraiser to pull cUSDT...' ? 'Authorizing...' : 'Set operator'}
                </button>
              </div>
            </label>
            <button
              type="button"
              className="primary"
              onClick={handleContribute}
              disabled={!campaignId || !!pendingAction || campaign?.finalized}
            >
              {pendingAction === 'Encrypting and contributing...' ? 'Submitting...' : 'Contribute securely'}
            </button>
            <p className="muted">
              Contributions stay encrypted end-to-end. Remember to authorize the fundraiser contract to move your cUSDT.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Step 3</p>
              <h2>Decrypt insights</h2>
            </div>
            <span className="pill">{zamaLoading ? 'Loading relayer' : 'Ready'}</span>
          </div>
          <div className="form">
            <div className="decrypt-row">
              <div>
                <p className="muted">Your encrypted contribution</p>
                <p className="mono small">
                  {myEncryptedContribution ? String(myEncryptedContribution).slice(0, 18) + '...' : 'None yet'}
                </p>
              </div>
              <button type="button" className="ghost" onClick={handleDecryptContribution} disabled={decrypting}>
                {decrypting ? 'Decrypting...' : 'Decrypt mine'}
              </button>
            </div>
            {decryptedContribution && (
              <div className="decrypted">
                <p className="eyebrow">Your contribution</p>
                <h3>{decryptedContribution} cUSDT</h3>
              </div>
            )}
            <div className="divider" />
            <div className="decrypt-row">
              <div>
                <p className="muted">Campaign totals (encrypted)</p>
                <p className="mono small">{campaign ? String(campaign.totalHandle).slice(0, 18) + '...' : '--'}</p>
              </div>
              <button type="button" className="ghost" onClick={handleDecryptTotals} disabled={decrypting}>
                {decrypting ? 'Decrypting...' : 'Decrypt totals'}
              </button>
            </div>
            {(decryptedTotals.target || decryptedTotals.total) && (
              <div className="decrypted two-col">
                <div>
                  <p className="eyebrow">Target</p>
                  <h3>{decryptedTotals.target ?? '--'} cUSDT</h3>
                </div>
                <div>
                  <p className="eyebrow">Raised</p>
                  <h3>{decryptedTotals.total ?? '--'} cUSDT</h3>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="campaign-foot">
        <div className="card compact">
          <div>
            <p className="eyebrow">Campaign</p>
            <h3>{campaign ? campaign.name : 'Waiting for the next raise'}</h3>
            <p className="muted">Encrypted data lives on-chain. Decrypt whenever you have permission.</p>
          </div>
          <div className="foot-grid">
            <div>
              <p className="muted">Deadline</p>
              <p>{campaign ? formatDate(campaign.deadline) : '—'}</p>
            </div>
            <div>
              <p className="muted">Owner</p>
              <p className="mono small">{campaign ? campaign.owner : '—'}</p>
            </div>
            <div>
              <p className="muted">Status</p>
              <p>{campaign ? (campaign.finalized ? 'Finalized' : 'Active') : 'Not started'}</p>
            </div>
          </div>
        </div>
      </section>

      {status && <div className="status-banner">{status}</div>}
      {zamaError && <div className="status-banner error">Encryption error: {zamaError}</div>}
      {!addressesReady && (
        <div className="status-banner warning">
          Set <code className="mono">FUNDRAISE_ADDRESS</code> and <code className="mono">CUSDT_ADDRESS</code> to your
          Sepolia deployments.
        </div>
      )}
      {!isConnected && <div className="status-banner warning">Connect your wallet on Sepolia to interact.</div>}
    </div>
  );
}
