import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:fundraise-addresses", "Print deployed addresses").setAction(async function (_: TaskArguments, hre) {
  const { deployments } = hre;
  const fundraise = await deployments.get("AstroVaultFundraise");
  const cusdt = await deployments.get("ConfidentialUSDT");

  console.log("AstroVaultFundraise:", fundraise.address);
  console.log("ConfidentialUSDT   :", cusdt.address);
});

task("task:mint-cusdt", "Mint cUSDT to a recipient")
  .addParam("to", "Recipient address")
  .addParam("amount", "Amount in whole tokens (uint64, no decimals)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const cusdtDeployment = await deployments.get("ConfidentialUSDT");
    const cusdt = await ethers.getContractAt("ConfidentialUSDT", cusdtDeployment.address);

    const signer = (await ethers.getSigners())[0];
    const amount = BigInt(taskArguments.amount);

    const tx = await cusdt.connect(signer).mint(taskArguments.to, amount);
    console.log(`Mint tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:create-campaign", "Create a new fundraising campaign")
  .addParam("name", "Campaign name")
  .addParam("target", "Target amount in whole tokens (uint64, no decimals)")
  .addParam("deadline", "UNIX timestamp for campaign end")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;
    const fundraiseDeployment = await deployments.get("AstroVaultFundraise");
    const cusdtDeployment = await deployments.get("ConfidentialUSDT");
    const fundraise = await ethers.getContractAt("AstroVaultFundraise", fundraiseDeployment.address);

    const signer = (await ethers.getSigners())[0];

    const tx = await fundraise
      .connect(signer)
      .createCampaign(taskArguments.name, Number(taskArguments.target), Number(taskArguments.deadline));
    console.log(`Create campaign tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:contribute", "Contribute to the active campaign (requires operator access on cUSDT)")
  .addParam("amount", "Contribution amount in whole tokens (uint64, no decimals)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const fundraiseDeployment = await deployments.get("AstroVaultFundraise");
    const fundraise = await ethers.getContractAt("AstroVaultFundraise", fundraiseDeployment.address);

    const signer = (await ethers.getSigners())[0];
    const encrypted = await fhevm.createEncryptedInput(cusdtDeployment.address, fundraiseDeployment.address);
    encrypted.add64(BigInt(taskArguments.amount));
    const payload = await encrypted.encrypt();

    const tx = await fundraise.connect(signer).contribute(payload.handles[0], payload.inputProof);
    console.log(`Contribute tx: ${tx.hash}`);
    await tx.wait();
  });

task("task:decrypt-contribution", "Decrypt a contribution for a user")
  .addOptionalParam("campaign", "Campaign id (defaults to active campaign)")
  .addOptionalParam("user", "User address (defaults to first signer)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const fundraiseDeployment = await deployments.get("AstroVaultFundraise");
    const fundraise = await ethers.getContractAt("AstroVaultFundraise", fundraiseDeployment.address);

    const signers = await ethers.getSigners();
    const userAddress: string = taskArguments.user ?? signers[0].address;
    const decryptSigner = taskArguments.user ? await ethers.getSigner(userAddress) : signers[0];
    const campaignId: number = taskArguments.campaign
      ? Number(taskArguments.campaign)
      : Number(await fundraise.activeCampaignId());

    if (campaignId === 0) {
      console.log("No active campaign.");
      return;
    }

    const encrypted = await fundraise.getContribution(campaignId, userAddress);
    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encrypted,
      fundraiseDeployment.address,
      decryptSigner,
    );

    console.log(`Contribution for ${userAddress} in campaign ${campaignId}:`, decrypted.toString());
  });
