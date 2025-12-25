// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ConfidentialUSDT} from "./ConfidentialUSDT.sol";

/// @title Confidential fundraising contract powered by cUSDT and Zama FHE
/// @notice Lets a creator open a fundraising goal, accept confidential contributions, and withdraw at any time.
contract AstroVaultFundraise is ZamaEthereumConfig {
    struct Campaign {
        address owner;
        string name;
        uint256 deadline;
        euint64 targetAmount;
        euint64 totalRaised;
        bool finalized;
    }

    ConfidentialUSDT public immutable cusdt;

    uint256 private _campaignCounter;
    uint256 private _activeCampaignId;
    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => mapping(address => euint64)) private _contributions;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed owner,
        string name,
        uint64 targetAmount,
        uint256 deadline
    );
    event ContributionReceived(uint256 indexed campaignId, address indexed contributor, euint64 amount);
    event CampaignFinalized(uint256 indexed campaignId, euint64 payoutAmount);

    error ActiveCampaignAlreadyExists();
    error CampaignNotFound();
    error CampaignClosed();
    error UnauthorizedOwner();
    error InvalidCampaignConfig();

    constructor(address cusdtAddress) {
        require(cusdtAddress != address(0), "Invalid token");
        cusdt = ConfidentialUSDT(cusdtAddress);
    }

    /// @notice Returns the active campaign id (0 if none).
    function activeCampaignId() external view returns (uint256) {
        return _activeCampaignId;
    }

    /// @notice Returns campaign metadata for a given id.
    function getCampaign(
        uint256 campaignId
    )
        external
        view
        returns (
            address owner,
            string memory name,
            uint256 deadline,
            euint64 targetAmount,
            euint64 totalRaised,
            bool finalized
        )
    {
        Campaign storage campaign = _campaigns[campaignId];
        if (campaign.owner == address(0)) {
            revert CampaignNotFound();
        }
        return (campaign.owner, campaign.name, campaign.deadline, campaign.targetAmount, campaign.totalRaised, campaign.finalized);
    }

    /// @notice Returns an encrypted contribution for a contributor and campaign.
    function getContribution(uint256 campaignId, address contributor) external view returns (euint64) {
        return _contributions[campaignId][contributor];
    }

    /// @notice Opens a new fundraising campaign.
    function createCampaign(string calldata name, uint64 targetAmount, uint256 deadline) external {
        if (_activeCampaignId != 0) {
            revert ActiveCampaignAlreadyExists();
        }
        if (bytes(name).length == 0 || targetAmount == 0 || deadline <= block.timestamp) {
            revert InvalidCampaignConfig();
        }

        _campaignCounter += 1;
        uint256 newCampaignId = _campaignCounter;

        euint64 target = FHE.asEuint64(targetAmount);
        euint64 total = FHE.asEuint64(0);

        FHE.allowThis(target);
        FHE.allow(target, msg.sender);

        FHE.allowThis(total);
        FHE.allow(total, msg.sender);

        _campaigns[newCampaignId] = Campaign({
            owner: msg.sender,
            name: name,
            deadline: deadline,
            targetAmount: target,
            totalRaised: total,
            finalized: false
        });
        _activeCampaignId = newCampaignId;

        emit CampaignCreated(newCampaignId, msg.sender, name, targetAmount, deadline);
    }

    /// @notice Contribute cUSDT confidentially to the active campaign.
    function contribute(externalEuint64 encryptedAmount, bytes calldata inputProof) external returns (euint64) {
        uint256 campaignId = _activeCampaignId;
        if (campaignId == 0) {
            revert CampaignNotFound();
        }

        Campaign storage campaign = _campaigns[campaignId];
        if (campaign.finalized || block.timestamp >= campaign.deadline) {
            revert CampaignClosed();
        }

        // Pull funds from contributor. Requires the contributor to set this contract as operator in cUSDT.
        euint64 transferred = cusdt.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);

        euint64 updatedTotal = FHE.add(_initialized(campaign.totalRaised), transferred);
        FHE.allowThis(updatedTotal);
        FHE.allow(updatedTotal, campaign.owner);
        FHE.allow(updatedTotal, msg.sender);
        campaign.totalRaised = updatedTotal;

        euint64 previousContribution = _initialized(_contributions[campaignId][msg.sender]);
        euint64 updatedContribution = FHE.add(previousContribution, transferred);
        FHE.allowThis(updatedContribution);
        FHE.allow(updatedContribution, msg.sender);
        FHE.allow(updatedContribution, campaign.owner);
        _contributions[campaignId][msg.sender] = updatedContribution;

        FHE.allow(transferred, campaign.owner);
        FHE.allow(transferred, msg.sender);

        emit ContributionReceived(campaignId, msg.sender, transferred);
        return updatedContribution;
    }

    /// @notice Finalize the active campaign and transfer the entire balance to the campaign owner.
    function finalizeCampaign() external returns (euint64) {
        uint256 campaignId = _activeCampaignId;
        if (campaignId == 0) {
            revert CampaignNotFound();
        }

        Campaign storage campaign = _campaigns[campaignId];
        if (campaign.owner != msg.sender) {
            revert UnauthorizedOwner();
        }
        if (campaign.finalized) {
            revert CampaignClosed();
        }

        euint64 balance = cusdt.confidentialBalanceOf(address(this));
        FHE.allowThis(balance);
        FHE.allow(balance, campaign.owner);

        euint64 payout = cusdt.confidentialTransfer(campaign.owner, balance);
        FHE.allowThis(payout);
        FHE.allow(payout, campaign.owner);

        campaign.finalized = true;
        _activeCampaignId = 0;

        emit CampaignFinalized(campaignId, payout);
        return payout;
    }

    function _initialized(euint64 value) private returns (euint64) {
        return FHE.isInitialized(value) ? value : FHE.asEuint64(0);
    }
}
