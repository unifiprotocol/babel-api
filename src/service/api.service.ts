var BN = require('bn.js');
var numberToBN = require('number-to-bn');
import _ from 'lodash';
import Antenna from 'iotex-antenna';
import { fromString, fromBytes } from 'iotex-antenna/lib/crypto/address';
import { hash160b } from 'iotex-antenna/lib/crypto/hash';
import { IBlockMeta, IGetLogsRequest } from 'iotex-antenna/lib/rpc-method/types';
import BaseService from './base.service';
import { Exception } from '@common/exceptions';
import { Code } from '@common/enums';
import { END_POINT, CHAIN_ID } from '@config/env';

const antenna = new Antenna(END_POINT);

function removePrefix(content: string) {
  return (content.startsWith('0x') || content.startsWith('0X')) ? content.slice(2) : content;
}

function toEth(address: string) {
  const a = fromString(address);
  return a.stringEth();
}

function fromEth(address: string) {
  if (address.startsWith('0x'))
    address = address.substring(2);

  const bytes = Buffer.from(address, 'hex');
  const a = fromBytes(bytes);
  return a.string();
}

function toBN(v: number | string) {
  return numberToBN(v);
}

function numberToHex(v: number | string) {
  const n = toBN(v);
  const result = n.toString(16);
  return n.lt(new BN(0)) ? '-0x' + result.substr(1) : '0x' + result;
} 

function toString(v: number | string) {
  return toBN(v).toString(16);
}

function toNumber(v: number | string) {
  return toBN(v).toNumber();
}

class ApiService extends BaseService {

  public async getChainId(params: any[]) {
    return numberToHex(CHAIN_ID);
  }

  public async getBlockNumber(params: any[]) {
    const ret = await antenna.iotx.getChainMeta({});
    const n =  _.get(ret, 'chainMeta.height', 0);
    return numberToHex(n);
  }

  public async getAccounts(params: any[]) {
    return [];
  }

  public async getBalance(params: any[]) {
    const [ address ] = params;
    const ret = await antenna.iotx.getAccount({ address: fromEth(address) });
    
    const b = _.get(ret, 'accountMeta.balance', 0);
    return numberToHex(b);
  }

  public async gasPrice(params: any) {
    const { gasPrice } = await antenna.iotx.suggestGasPrice({});
    return numberToHex(gasPrice);
  }

  public async getTransactionCount(params: any[]) {
    const [ address, block_id ] = params;
    const ret = await antenna.iotx.getAccount({ address: fromEth(address) });    
    const b = _.get(ret, 'accountMeta.pendingNonce', 0);
    return numberToHex(b);
  }

  public async sendRawTransaction(params: any[]) {
    const [ data ] = params;
    const ret = await antenna.iotx.sendRawTransaction({ chainID: CHAIN_ID, data });
    return '0x' + ret;
  }

  public async call(params: any[]) {
    const [ tx ] = params;
    const { to, data } = tx;
    const address = fromEth(to);

    if (to == '0xb1f8e55c7f64d203c1400b9d8555d050f94adf39')
      return;

    const d = Buffer.from(data.slice(2), 'hex');

    const { data: ret } = await antenna.iotx.readContract({
      execution: {
        amount: '0',
        contract: address,
        data: d
      },
      callerAddress: address
    });

    return '0x' + ret;
  }

  public async estimateGas(params: any[]) {
    const [ tx ] = params;
    const { to, data, from, value } = tx;

    const ret = await antenna.iotx.estimateGas({ from, to, value, data });
    return numberToHex(ret);
  }

  public async getCode(params: any[]) {
    const [ address, block_id ] = params;
    const ret = await antenna.iotx.getAccount({ address: fromEth(address) });
    return '0x' + _.get(ret, 'accountMeta.contractByteCode').toString('hex');
  }

  public async getNetworkId(params: any) {
    return `${CHAIN_ID}`;
  }

  public async getPeers(params: any) {
    return [];
  }

  public async getTransactionReceipt(params: any) {
    const [ h ] = params;
    const hash = removePrefix(h);

    let ret;
    try {
      ret = await antenna.iotx.getReceiptByAction({ actionHash: hash });
    } catch (e) {
      return null;
    }

    const { receiptInfo } = ret;
    const { receipt, blkHash } = receiptInfo || {};
    const { status, blkHeight, actHash, gasConsumed, contractAddress, logs = [] } = receipt || {};

    const height = numberToHex(blkHeight || 0);

    let transaction;
    try {
      const action = await antenna.iotx.getActions({ byHash: { actionHash: removePrefix(params[0]), checkingPending: true } });
      transaction = this.transaction(action);
    } catch (e) {
      return null;
    }

    return {
      blockHash: '0x' + blkHash,
      blockNumber: height,
      contractAddress: (_.size(contractAddress) > 0  ? toEth(contractAddress || '') : null),
      cumulativeGasUsed: numberToHex(gasConsumed || 0),
      from: transaction.from,
      gasUsed: numberToHex(gasConsumed || 0),
      logs: logs.map(v => ({
        blockHash: '0x' + blkHash,
        transactionHash: '0x' + hash,
        logIndex: numberToHex(v.index),
        blockNumber: numberToHex(v.blkHeight),
        address: toEth(v.contractAddress),
        data: '0x' + v.data.toString('hex'),
        topics: v.topics.map(v => '0x' + v.toString('hex'))
      })),
      logsBloom: '0x0',
      status: numberToHex(status == 1 ? 1 : 0),
      to: transaction.to,
      transactionHash: '0x' + hash,
      transactionIndex: transaction.transactionIndex
    };
  }

  public async notImplememted(params: any) {
    throw new Exception(Code.NOT_IMPLEMENTED, 'function not implemented');
  }

  public async getNodeInfo(params: any) {
    const { serverMeta } = await antenna.iotx.getServerMeta({});
    return `${_.get(serverMeta, 'packageVersion')}/${_.get(serverMeta, 'goVersion')}`;
  }

  public async getPeerCount(params: any) {
    return '0x64';
  }

  public async isListening(params: any) {
    return true;
  }

  public async getProtocolVersion(params: any) {
    return '64';
  }

  public async isSyncing(params: any) {
    return false;
  }

  public async getCoinbase(params: any) {
    return this.notImplememted(params);
  }

  public async isMining(params: any) {
    return false;
  }

  public async getHashrate(params: any) {
    return '0x500000';
  }

  private async blockByHash(hash: string): Promise<IBlockMeta | undefined> {
    const ret = await antenna.iotx.getBlockMetas({ byHash: { blkHash: hash } });
    return _.get(ret, 'blkMetas[0]');
  }
  
  private async blockById(id: number): Promise<IBlockMeta | undefined> {
    const ret = await antenna.iotx.getBlockMetas({ byIndex: { start: id, count: 1 } });
    return _.get(ret, 'blkMetas[0]');
  }

  public async getBlockTransactionCountByHash(params: any) {
    const b = await this.blockByHash(removePrefix(params[0]));
    return numberToHex(b?.numActions || 0);
  }

  public async getBlockTransactionCountByNumber(params: any) {
    const b = await this.blockById(params[0]);
    return numberToHex(b?.numActions || 0);
  }

  private async getBlockWithTransaction(b: IBlockMeta, detail: boolean) {
    const { hash } = b;
    const ret = await antenna.iotx.getActions({
      byBlk: { blkHash: hash, start: 0, count: 1000 }
    });

    const height = numberToHex(b.height);
    const actions = ret.actionInfo || [];
    let transactions;
    if (detail) {
      transactions = actions.map((v, k) => {
        const { action } = v;
        const transfer = _.get(action, 'core.transfer');
        const execution = _.get(action, 'core.execution');
        let to = _.get(transfer, 'recipient') || _.get(execution, 'contract');
        if (_.size(to) > 0)
          to = toEth(to);

        const value = numberToHex(_.get(transfer || execution, 'amount', 0));
        let data = _.get(transfer, 'payload') || _.get(execution, 'data');
        if (!_.isNil(data))
          data = '0x' + data.toString('hex');
        else
          data = '0x';

        const from = '0x' + hash160b(v.action.senderPubKey);
        return {
          blockHash: '0x' + v.blkHash,
          blockNumber: height,
          chainId: null,
          condition: null,
          creates: null, // contract address if is contract creation
          from,
          gas: numberToHex(_.get(action, 'core.gasLimit', 0)),
          gasPrice: numberToHex(_.get(action, 'core.gasPrice', 0)),
          hash: '0x' + v.actHash,
          input: '0x' + data,
          nonce: numberToHex(_.get(action, 'core.nonce', 0)),
          publicKey: '0x' + v.action.senderPubKey,
          r: '0x',
          raw: '0x',
          s: '0x',
          standardV: '0x1',
          to,
          transactionIndex: numberToHex(k),
          value
        };
      });
    } else {
      transactions = actions.map(v => '0x' + v.actHash);
    }

    return {
      author: toEth(b.producerAddress),
      difficulty: '0xfffffffffffffffffffffffffffffffe',
      extraData: '0x',
      gasLimit: numberToHex(b.gasLimit),
      gasUsed: numberToHex(b.gasUsed),
      hash: '0x' + b.hash,
      logsBloom: (<any>b).logsBloom,
      miner: toEth(b.producerAddress),
      number: height,
      parentHash: '0x' + (<any>b).previousBlockHash,
      receiptsRoot: '0x' + b.txRoot,
      sha3Uncles: '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
      signature: "",
      size: numberToHex(b.numActions),
      stateRoot: '0x' + b.deltaStateDigest,
      step: '373422302',
      timestamp: numberToHex(b.timestamp.seconds),
      totalDifficulty: '0xff14700000000000000000000000486001d72',
      transactions,
      transactionsRoot: '0x' + b.txRoot,
      uncles: []
    };
  }

  public async getBlockByNumber(params: any[]) {
    const [ block_id, detail = false ] = params;

    let bid = block_id;
    if (block_id == 'latest' || block_id == '0xNaN') {
      const ret = await antenna.iotx.getChainMeta({});
      bid = toNumber(_.get(ret, 'chainMeta.height', 0));
    } else {
      bid = toNumber(block_id);
    }

    const b = await this.blockById(bid);
    if (!b)
      return {};

    return this.getBlockWithTransaction(b, detail);
  }

  public async getBlockByHash(params: any) {
    const [ blkHash, detail = false ] = params;
    const b = await this.blockByHash(removePrefix(blkHash));
    if (!b)
      return {};

    return this.getBlockWithTransaction(b, detail);
  }

  private transaction(ret: any) {
    const { actionInfo } = ret;
    const { action, actHash, blkHash, blkHeight, sender, index } = actionInfo[0];
    const { core, senderPubKey, signature } = action;
    const { nonce, gasLimit, gasPrice, transfer, execution } = core;

    let value = '0x0';
    let to;
    let data = '';
    if (transfer != null) {
      const { amount, recipient } = transfer;
      value = numberToHex(amount);
      to = toEth(recipient);
    } else if (execution != null) {
      const { amount, contract, data: d } = execution;
      value = numberToHex(amount);
      to = _.size(contract) > 0 ? toEth(contract) : null;
      data = `0x${d.toString('hex')}`;
    }

    return {
      blockHash: `0x${blkHash}`,
      blockNumber: numberToHex(blkHeight),
      chainId: null,
      condition: null,
      creates: null,
      from: toEth(sender),
      gas: numberToHex(gasLimit),
      gasPrice: numberToHex(gasPrice),
      hash: `0x${actHash}`,
      input: data,
      nonce: numberToHex(nonce),
      publicKey: '0x' + senderPubKey,
      r: '0x',
      raw: '0x',
      s: '0x',
      standardV: '0x1',
      to,
      transactionIndex: numberToHex(index),
      value
    };
  }

  private async getTransactionCreates(data: any) {
    const transaction = this.transaction(data);
    if (transaction.to != null)
      return transaction;

      let ret;
      try {
        ret = await antenna.iotx.getReceiptByAction({ actionHash: transaction.hash.slice(2) });
      } catch (e) {
        return null;
      }

      transaction.creates = _.get(ret, 'receiptInfo.receipt.contractAddress');
      return transaction;
  }

  public async getTransactionByHash(params: any) {
    try {
      const ret = await antenna.iotx.getActions({ byHash: { actionHash: removePrefix(params[0]), checkingPending: true } });
      return this.getTransactionCreates(ret);
    } catch (e) {
      return null;
    }
  }

  public async getTransactionByBlockHashAndIndex(params: any) {
    const [ blkHash, id ] = params;
    try {
      const ret = await antenna.iotx.getActions({ byBlk: { blkHash: removePrefix(blkHash), start: id, count: 1 } });
      return this.getTransactionCreates(ret);
    } catch (e) {
      return null;
    }
  }

  public async getTransactionByBlockNumberAndIndex(params: any) {
    const [ blkId, id ] = params;
    const b = await this.blockById(blkId);
    if (!b)
      return {};

    try {
      const ret = await antenna.iotx.getActions({ byBlk: { blkHash: b.hash, start: id, count: 1 } });
      return this.getTransactionCreates(ret);
    } catch (e) {
      return null;
    }
  }

  public async getPendingTransactions(params: any) {
    return this.notImplememted(params);
  }

  public async getLogs(params: any) {
    const { fromBlock, toBlock, topics, address } = params[0];
    
    const args: IGetLogsRequest = { filter: { address: [], topics: [] } };
    const predefined = [ 'latest', 'pending' ];
    let from = 0;
    let to = 0;

    if (predefined.includes(fromBlock) || predefined.includes(toBlock)) {
      const meta = await antenna.iotx.getChainMeta({});
      const height = toNumber(_.get(meta, 'chainMeta.height', 0));
      if (predefined.includes(fromBlock))
        from = height;
      if (predefined.includes(toBlock))
        to = height;
    }
    
    if (typeof(fromBlock) == 'string' && fromBlock.startsWith('0x'))
      from = toNumber(fromBlock);

    if (typeof(toBlock) == 'string' && toBlock.startsWith('0x'))
      to = toNumber(toBlock);

    if (from > 0 || to > 0)
      args.byRange = { fromBlock: from, toBlock: to, paginationSize: 100, count: 0 };

    if (!_.isNil(address)) {
      const addresses = (_.isArray(address) ? address : [ address ]);
      args.filter.address = addresses.map(v => fromEth(v));
    }

    if (!_.isNil(topics))
      args.filter.topics = (_.isArray(topics) ? topics : [ topics ]);

    const ret = await antenna.iotx.getLogs(args);
    const logs = ret.logs || [];
    return logs.map(v => ({
      blockHash: '0x' + v.blkHash.toString('hex'),
      transactionHash: '0x' + v.actHash.toString('hex'),
      logIndex: numberToHex(v.index),
      blockNumber: numberToHex(v.blkHeight),
      transactionIndex: 1,
      address: toEth(v.contractAddress),
      data: '0x' + v.data.toString('hex'),
      topics: v.topics.map(v => '0x' + v.toString('hex'))
    }));
  }

}

export const apiService = new ApiService();
