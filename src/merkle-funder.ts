import { go } from '@api3/promise-utils';
import { ethers } from 'ethers';
import { MerkleFunderDepositories, decodeRevertString } from '.';
import buildMerkleTree from './merkle-tree';

export const fundChainRecipients = async (
  chainMerkleFunderDepositories: MerkleFunderDepositories,
  merkleFunderContract: ethers.Contract
) => {
  await Promise.all(
    chainMerkleFunderDepositories.map(async ({ owner, values }) => {
      // Build merkle tree
      const tree = buildMerkleTree(values);
      console.log('Merkle tree:\n', tree.render());

      const multicallCalldata = values.map(({ recipient, lowThreshold, highThreshold }, treeValueIndex) =>
        merkleFunderContract.interface.encodeFunctionData('fund(address,bytes32,bytes32[],address,uint256,uint256)', [
          owner,
          tree.root,
          tree.getProof(treeValueIndex),
          recipient,
          ethers.utils.parseUnits(lowThreshold.value.toString(), lowThreshold.unit),
          ethers.utils.parseUnits(highThreshold.value.toString(), highThreshold.unit),
        ])
      );
      console.log('Number of calldatas to be sent: ', multicallCalldata.length);

      // TODO: A potential improvement here is to batch these calls
      const tryStaticMulticallResult = await go(() => merkleFunderContract.callStatic.tryMulticall(multicallCalldata));
      if (!tryStaticMulticallResult.success) {
        console.log(
          'Failed to call merkleFunderContract.callStatic.tryMulticall:',
          tryStaticMulticallResult.error.message
        );
        return;
      }

      // Filter out calldata that failed to be sent
      const { successes, returndata } = tryStaticMulticallResult.data;
      const successfulMulticallCalldata = (successes as boolean[]).reduce((acc, success, index) => {
        if (!success) {
          console.log(`Calldata #${index + 1} reverted with message:`, decodeRevertString(returndata[index]));
          return acc;
        }
        return [...acc, multicallCalldata[index]];
      }, [] as string[]);

      // Try to send the calldatas
      if (successfulMulticallCalldata.length > 0) {
        // We still tryMulticall in case a recipient is funded by someone else in the meantime
        const tryMulticallResult = await go(() => merkleFunderContract.tryMulticall(successfulMulticallCalldata));
        if (!tryMulticallResult.success) {
          console.log('Failed to call merkleFunderContract.tryMulticall:', tryMulticallResult.error.message);
          return;
        }
        console.log(
          `Sent tx with hash ${tryMulticallResult.data.hash} that will send funds to ${successfulMulticallCalldata.length} recipients`
        );
      } else {
        console.log('All recipients are already funded');
      }
    })
  );
};
