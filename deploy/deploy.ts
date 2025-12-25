import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const confidentialUsdt = await deploy("ConfidentialUSDT", {
    from: deployer,
    log: true,
  });

  const fundraise = await deploy("AstroVaultFundraise", {
    from: deployer,
    args: [confidentialUsdt.address],
    log: true,
  });

  console.log(`ConfidentialUSDT contract: ${confidentialUsdt.address}`);
  console.log(`AstroVaultFundraise contract: ${fundraise.address}`);
};
export default func;
func.id = "deploy_fundraise"; // id required to prevent reexecution
func.tags = ["Fundraise"];
