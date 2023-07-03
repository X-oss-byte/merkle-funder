import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { buildMerkleTree } from '../src';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, log } = deployments;

  const { deployer: deployerAddress } = await getNamedAccounts();

  const { address: merkleFunderAddress, abi: merkleFunderAbi } = await deploy('MerkleFunder', {
    from: deployerAddress,
    log: true,
    args: [],
    deterministicDeployment: process.env.DETERMINISTIC ? ethers.constants.HashZero : undefined,
  });

  log(`Deployed MerkleFunder at ${merkleFunderAddress}`);

  const deployer = await ethers.getSigner(deployerAddress);
  const merkleFunder = new ethers.Contract(merkleFunderAddress, merkleFunderAbi, deployer);

  const tree = buildMerkleTree([
    {
      recipient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      lowThreshold: {
        value: 10010,
        unit: 'ether',
      },
      highThreshold: {
        value: 10020,
        unit: 'ether',
      },
    },
    {
      recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      lowThreshold: {
        value: 9000,
        unit: 'ether',
      },
      highThreshold: {
        value: 10050,
        unit: 'ether',
      },
    },
  ]);
  console.log('Merkle tree:\n', tree.render());

  const owner = deployerAddress;
  const expectedMerkleFunderDepositoryAddress = await merkleFunder.computeMerkleFunderDepositoryAddress(
    owner,
    tree.root
  );
  console.log(`Expected MerkleFunderDepository address is ${expectedMerkleFunderDepositoryAddress}`);

  if ((await ethers.provider.getCode(expectedMerkleFunderDepositoryAddress)) === '0x') {
    const receipt = await merkleFunder.deployMerkleFunderDepository(owner, tree.root);
    await new Promise<void>((resolve) =>
      ethers.provider.once(receipt.hash, () => {
        resolve();
      })
    );
    console.log(`Deployed MerkleFunderDepository at ${expectedMerkleFunderDepositoryAddress}`);
  } else {
    console.log(`MerkleFunderDepository already deployed at ${expectedMerkleFunderDepositoryAddress}`);
  }
};

export default func;
func.tags = ['MerkleFunder'];
