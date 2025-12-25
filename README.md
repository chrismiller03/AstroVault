# AstroVault

AstroVault is a privacy-preserving fundraising dApp built on Zama FHEVM. It lets a creator launch one encrypted
fundraising campaign at a time, accept confidential cUSDT contributions, and withdraw the pooled funds on demand.
Contribution amounts stay encrypted on-chain while still enabling correct totals and accounting.

## Project Overview

AstroVault focuses on a common pain point in fundraising: contributors want their amounts to remain private, but the
campaign owner still needs a trustworthy, on-chain tally of total funds. By combining Zama Fully Homomorphic Encryption
(FHE) with a cUSDT token, AstroVault allows encrypted contributions and encrypted totals without leaking individual
amounts to the public.

Key properties:
- One active campaign at a time for operational simplicity and clear auditability.
- Encrypted per-contributor balances that can be summed without decryption.
- Owner-controlled finalization that pulls the entire encrypted pool to the creator.
- On-chain state remains minimal while privacy is preserved end to end.

## Problems Solved

1) Privacy of contribution amounts.
   - Traditional crowdfunding exposes amounts and donors. AstroVault keeps amounts encrypted on-chain.
2) Trust in totals without disclosure.
   - FHE enables summing encrypted contributions so the total raised is correct without revealing inputs.
3) Frictionless withdrawals.
   - The creator can end the campaign at any time and collect the full pool of cUSDT.
4) Transparent workflow without surveillance.
   - Campaign metadata (name, deadline, ownership) is public, but financial details remain confidential.

## Advantages

- Confidential by design: encrypted amounts are stored and aggregated on-chain.
- Accurate totals: FHE operations ensure correct sums while staying private.
- Clear ownership: only the campaign owner can finalize and withdraw.
- Minimal surface area: a small contract set with straightforward flows.
- Deterministic behavior: one active campaign simplifies UX, indexing, and auditing.

## Feature Set

- Create a campaign with name, target amount, and end time.
- Contribute with encrypted cUSDT using Zama input proofs.
- Track encrypted per-contributor amounts and encrypted total raised.
- Finalize at any time to transfer the entire pool to the owner.
- Read-only public metadata: owner, name, deadline, finalized state.

## How It Works

1) The creator calls `createCampaign` with a name, target amount, and deadline.
2) Contributors encrypt their desired amount in the frontend and call `contribute`.
3) The contract pulls encrypted cUSDT and adds it to the encrypted totals.
4) The creator calls `finalizeCampaign` to transfer the entire encrypted balance.
5) Off-chain FHE tooling allows authorized users to decrypt their own numbers.

## Technology Stack

Smart contracts:
- Solidity with Hardhat.
- Zama FHEVM libraries for encrypted integers and proofs.
- cUSDT implemented as a confidential ERC7984 token.

Frontend:
- React + Vite.
- viem for read-only calls.
- ethers for write transactions.
- RainbowKit for wallet connection.
- No Tailwind CSS.

Tooling:
- npm for package management.
- Hardhat tasks for operational scripts.
- Hardhat tests for contract validation.

## Contract Layout

- `contracts/AstroVaultFundraise.sol`
  - Primary fundraising logic, encrypted totals, and finalize flow.
  - Supports a single active campaign at a time.
- `contracts/ConfidentialUSDT.sol`
  - Confidential ERC7984 token used for encrypted transfers.
- `contracts/FHECounter.sol`
  - Example FHE contract used for reference and testing.

## Frontend Notes

- ABIs are sourced from `deployments/sepolia` after compilation and deployment.
- Reads use viem, writes use ethers.
- No environment variables are used in the frontend; configuration is in code.
- No localhost network is used in the frontend configuration.
- The frontend connects to deployed contracts and uses live on-chain data only.

## Development and Deployment Workflow

1) Install dependencies:
   - `npm install`
2) Compile and run tests:
   - `npm run compile`
   - `npm run test`
3) Deploy to a local node for validation:
   - `npx hardhat node`
   - `npx hardhat deploy --network <local-network-name>`
4) Deploy to Sepolia:
   - Configure `.env` with `INFURA_API_KEY` and `PRIVATE_KEY`.
   - `npx hardhat deploy --network sepolia`

Deployment uses a private key only; mnemonic-based deployment is intentionally not supported.

## Security and Privacy Model

- Confidentiality:
  - Contribution amounts are encrypted as FHE euint64 values.
  - Totals and per-user balances remain encrypted on-chain.
- Access control:
  - Only the campaign owner can finalize and withdraw.
  - Contributors can only affect their own contribution amounts.
- Integrity:
  - Encrypted arithmetic preserves correct totals even without decryption.

## Limitations and Current Scope

- Single active campaign at a time (by design in the contract).
- Finalization is manual and owner-triggered.
- Refunds are not implemented yet.
- Contribution values are limited to 64-bit encrypted integers.

## Future Roadmap

- Multi-campaign support with independent lifecycles.
- Automated finalization on deadline with optional grace periods.
- Encrypted refund flow for unsuccessful campaigns.
- Milestone-based partial withdrawals with encrypted accounting.
- Campaign discovery and rich metadata indexing.
- Role-based access for team-managed campaigns.
- Cross-chain fundraising with encrypted bridging.

## Repository Structure

```
AstroVault/
├── contracts/              # Smart contracts
├── deploy/                 # Deployment scripts
├── deployments/            # Deployed artifacts and ABIs
├── tasks/                  # Hardhat tasks
├── test/                   # Contract tests
├── frontend/               # React + Vite frontend
└── docs/                   # Additional documentation
```

## License

BSD-3-Clause-Clear. See `LICENSE` for details.
