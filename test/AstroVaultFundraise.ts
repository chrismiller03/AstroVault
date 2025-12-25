import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { AstroVaultFundraise, ConfidentialUSDT } from "../types";

type Signers = {
  owner: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFundraiseFixture() {
  const cusdtFactory = await ethers.getContractFactory("ConfidentialUSDT");
  const cusdt = (await cusdtFactory.deploy()) as ConfidentialUSDT;

  const fundraiseFactory = await ethers.getContractFactory("AstroVaultFundraise");
  const fundraise = (await fundraiseFactory.deploy(await cusdt.getAddress())) as AstroVaultFundraise;

  return { cusdt, fundraise };
}

describe("AstroVaultFundraise", function () {
  let signers: Signers;
  let cusdt: ConfidentialUSDT;
  let fundraise: AstroVaultFundraise;

  const defaultTarget = 1_000;
  const contributionAmount = 150;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { owner: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    ({ cusdt, fundraise } = await deployFundraiseFixture());

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    await fundraise.connect(signers.owner).createCampaign("Deep Space Vault", defaultTarget, deadline);
  });

  async function decryptAmount(
    encrypted: string,
    contractAddress: string,
    signer: HardhatEthersSigner,
  ): Promise<bigint> {
    return fhevm.userDecryptEuint(FhevmType.euint64, encrypted, contractAddress, signer);
  }

  it("stores encrypted contributions and updates totals", async function () {
    await cusdt.connect(signers.owner).mint(signers.alice.address, 500);

    const operatorExpiry = Math.floor(Date.now() / 1000) + 3600;
    await cusdt.connect(signers.alice).setOperator(await fundraise.getAddress(), operatorExpiry);

    const encryptedInput = await fhevm
      .createEncryptedInput(await cusdt.getAddress(), await fundraise.getAddress())
      .add64(BigInt(contributionAmount))
      .encrypt();

    const contributeTx = await fundraise
      .connect(signers.alice)
      .contribute(encryptedInput.handles[0], encryptedInput.inputProof);
    await contributeTx.wait();

    const campaignId = await fundraise.activeCampaignId();
    const encryptedContribution = await fundraise.getContribution(campaignId, signers.alice.address);
    const clearContribution = await decryptAmount(
      encryptedContribution as unknown as string,
      await fundraise.getAddress(),
      signers.alice,
    );

    const campaignInfo = await fundraise.getCampaign(campaignId);
    const clearTotal = await decryptAmount(
      campaignInfo[4] as unknown as string,
      await fundraise.getAddress(),
      signers.owner,
    );

    expect(clearContribution).to.equal(BigInt(contributionAmount));
    expect(clearTotal).to.equal(BigInt(contributionAmount));
  });

  it("lets the owner finalize and receive all funds", async function () {
    await cusdt.connect(signers.owner).mint(signers.alice.address, 400);
    await cusdt.connect(signers.owner).mint(signers.bob.address, 250);

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    await cusdt.connect(signers.alice).setOperator(await fundraise.getAddress(), expiry);
    await cusdt.connect(signers.bob).setOperator(await fundraise.getAddress(), expiry);

    const aliceInput = await fhevm
      .createEncryptedInput(await cusdt.getAddress(), await fundraise.getAddress())
      .add64(BigInt(120))
      .encrypt();
    await fundraise.connect(signers.alice).contribute(aliceInput.handles[0], aliceInput.inputProof);

    const bobInput = await fhevm
      .createEncryptedInput(await cusdt.getAddress(), await fundraise.getAddress())
      .add64(BigInt(80))
      .encrypt();
    await fundraise.connect(signers.bob).contribute(bobInput.handles[0], bobInput.inputProof);

    const finalizeTx = await fundraise.connect(signers.owner).finalizeCampaign();
    await finalizeTx.wait();

    const encryptedOwnerBalance = await cusdt.confidentialBalanceOf(signers.owner.address);
    const ownerBalance = await decryptAmount(
      encryptedOwnerBalance as unknown as string,
      await cusdt.getAddress(),
      signers.owner,
    );

    expect(ownerBalance).to.equal(BigInt(200));
    expect(await fundraise.activeCampaignId()).to.equal(0);
  });
});
