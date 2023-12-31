import { goSync } from '@api3/promise-utils';
import * as hre from 'hardhat';
import * as readline from 'readline';
import { loadConfig } from '../src/config';
import { computeMerkleFunderDepositoryAddress } from '../src/evm';
import buildMerkleTree from '../src/merkle-tree';

async function main() {
  const chainName = hre.network.name;
  console.log('Chain name:', chainName);

  const chainId = parseInt(await hre.getChainId());
  console.log('Chain ID:', chainId);

  const merkleFunderDeployment = await hre.deployments.get('MerkleFunder');
  console.log('MerkleFunder address:', merkleFunderDeployment.address);

  const deployerAddress = (await hre.getUnnamedAccounts())[0];
  console.log('Deployer address:', deployerAddress);

  const deployer = await hre.ethers.getSigner(deployerAddress);
  const merkleFunder = new hre.ethers.Contract(merkleFunderDeployment.address, merkleFunderDeployment.abi, deployer);

  const loadConfigResult = goSync(() => loadConfig());
  if (!loadConfigResult.success) {
    console.log('Failed to load config:\n', loadConfigResult.error.message);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const chainMerkleFunderDepositories = loadConfigResult.data[chainId].merkleFunderDepositories;
  if (!chainMerkleFunderDepositories) {
    console.log('No merkleFunderDepositories for chain: ', chainName, chainId);
    return;
  }

  for (const { owner, values } of chainMerkleFunderDepositories) {
    // Build merkle tree
    const tree = buildMerkleTree(values);
    console.log('Merkle tree:\n', tree.render());

    // Compute MerkleFunderFepository address and check if it is already deployed
    const merkleFunderDepositoryAddress = await computeMerkleFunderDepositoryAddress(
      merkleFunder.address,
      owner,
      tree.root
    );

    if ((await hre.ethers.provider.getCode(merkleFunderDepositoryAddress)) === '0x') {
      const answer = await new Promise<string>((resolve) =>
        rl.question(
          'Your config specifies a MerkleFunderDepository that is not deployed yet. Continue? (y/n) [y]: ',
          (input) => {
            resolve(input.trim().toLowerCase() || 'y');
          }
        )
      );

      if (answer === 'y') {
        const tx = await merkleFunder.deployMerkleFunderDepository(owner, tree.root);
        console.log('MerkleFunderDepository is deployed at', merkleFunderDepositoryAddress);
        const receipt = await tx.wait();
        console.log('Transaction hash:', receipt.transactionHash);
        console.log('Gas used:', hre.ethers.utils.formatUnits(receipt.gasUsed, 'gwei'));
      } else {
        console.log('Deployment aborted by the user');
      }
    } else {
      console.log('MerkleFunderDepository is already deployed at', merkleFunderDepositoryAddress);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
