const HoneyChainCore = artifacts.require("HoneyChainCore");

module.exports = async function (deployer, network, accounts) {
  await deployer.deploy(HoneyChainCore);
  const core = await HoneyChainCore.deployed();
  console.log("HoneyChainCore deployed at:", core.address);
};
